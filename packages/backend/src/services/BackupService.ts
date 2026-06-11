import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "@dsa/shared";

/** Structural slice of better-sqlite3's Database — avoids a direct dependency. */
interface BackupCapableDb {
  backup(destination: string): Promise<unknown>;
}

export interface BackupResult {
  path: string;
  sizeBytes: number;
  kept: number;
}

const DAY_MS = 86_400_000;

/**
 * SM-2 state lives only in SQLite (5.1) — keep timestamped copies with simple
 * rotation. Runs nightly while the server is up, plus on demand (study:stop).
 */
export class BackupService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly sqlite: BackupCapableDb,
  ) {}

  async backupNow(): Promise<BackupResult> {
    const dir = this.config.backup.dir;
    mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const target = join(dir, `dsa-${stamp}.db`);

    // better-sqlite3 online backup — safe while the DB is in use.
    await this.sqlite.backup(target);

    const kept = this.rotate(dir, this.config.backup.keep);
    return {
      path: target,
      sizeBytes: existsSync(target) ? statSync(target).size : 0,
      kept,
    };
  }

  /** Nightly backup while the server runs; fires once shortly after boot. */
  start(onError?: (err: unknown) => void): void {
    if (this.timer) return;
    const run = () => {
      this.backupNow().catch((err) => onError?.(err));
    };
    setTimeout(run, 30_000).unref?.();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  listBackups(): { file: string; sizeBytes: number; createdAt: string }[] {
    const dir = this.config.backup.dir;
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.startsWith("dsa-") && f.endsWith(".db"))
      .sort()
      .reverse()
      .map((f) => {
        const stats = statSync(join(dir, f));
        return {
          file: f,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
        };
      });
  }

  private rotate(dir: string, keep: number): number {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("dsa-") && f.endsWith(".db"))
      .sort()
      .reverse();
    for (const stale of files.slice(keep)) {
      try {
        unlinkSync(join(dir, stale));
      } catch {
        // best effort
      }
    }
    return Math.min(files.length, keep);
  }
}
