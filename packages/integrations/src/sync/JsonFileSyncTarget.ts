/**
 * Fully-local sync target (design §10): writes the card bank to canonical JSON +
 * a portable Markdown export on disk. It is the *portability hedge* — if Notion
 * ever costs money, this adapter already holds a complete, re-importable copy of
 * the bank with **zero network and $0** — and it doubles as the offline test
 * double that proves the {@link SyncTarget} seam is real (two adapters, one
 * interface). Embeddings are never written here: `CardSyncRecord` carries no
 * vector, so a vector physically cannot reach this file (§6).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CardSyncRecord, SyncPushResult, SyncTarget } from "./SyncTarget.js";

export interface JsonFileSyncConfig {
  /** Directory the canonical `cards.json` + `cards.md` are written to. */
  dir: string;
  /** Override file names (mostly for tests). */
  jsonFile?: string;
  markdownFile?: string;
}

export class JsonFileSyncTarget implements SyncTarget {
  readonly name = "json-file";
  private readonly jsonPath: string;
  private readonly markdownPath: string;

  constructor(private readonly config: JsonFileSyncConfig) {
    this.jsonPath = join(config.dir, config.jsonFile ?? "cards.json");
    this.markdownPath = join(config.dir, config.markdownFile ?? "cards.md");
  }

  isConfigured(): boolean {
    return Boolean(this.config.dir);
  }

  private readExisting(): Map<string, CardSyncRecord> {
    if (!existsSync(this.jsonPath)) return new Map();
    try {
      const parsed = JSON.parse(readFileSync(this.jsonPath, "utf-8")) as {
        cards?: CardSyncRecord[];
      };
      return new Map((parsed.cards ?? []).map((c) => [c.id, c]));
    } catch {
      return new Map();
    }
  }

  /**
   * Delta-merge the pushed records into the canonical file (§8 — only dirty
   * cards arrive each flush; the file accumulates the full bank, keyed by UUID).
   * Idempotent: re-pushing the same card overwrites its row, never duplicates.
   */
  async pushCards(records: CardSyncRecord[]): Promise<SyncPushResult> {
    if (records.length === 0) return { pushed: 0, failed: 0, failedIds: [], pageIds: {} };
    mkdirSync(this.config.dir, { recursive: true });

    const byId = this.readExisting();
    for (const record of records) byId.set(record.id, record);
    const cards = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

    writeFileSync(
      this.jsonPath,
      JSON.stringify({ version: 1, exportedAt: Date.now(), cards }, null, 2),
    );
    writeFileSync(this.markdownPath, renderMarkdown(cards));

    // Local file is the "remote": its own UUID is the durable key, so no
    // separate page-id mapping is needed (COALESCE keeps any existing id).
    return { pushed: records.length, failed: 0, failedIds: [], pageIds: {} };
  }

  async pullCards(): Promise<CardSyncRecord[]> {
    return [...this.readExisting().values()];
  }
}

function renderMarkdown(cards: CardSyncRecord[]): string {
  const lines: string[] = [
    "# DSA Mastery OS — Card Bank Export",
    "",
    `> Canonical portable export. ${cards.length} cards. Generated ${new Date().toISOString()}.`,
    "",
  ];
  const byTopic = new Map<string, CardSyncRecord[]>();
  for (const card of cards) {
    const key = card.topicId ?? "(untagged)";
    (byTopic.get(key) ?? byTopic.set(key, []).get(key)!).push(card);
  }
  for (const [topic, group] of [...byTopic.entries()].sort()) {
    lines.push(`## ${topic}`, "");
    for (const card of group) {
      const tags = card.conceptTags.length ? ` _[${card.conceptTags.join(", ")}]_` : "";
      lines.push(`- **(${card.type})** ${card.front}${tags}`);
      lines.push(`  - ${card.back.replace(/\n/g, "\n  - ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function createJsonFileSyncTarget(config: JsonFileSyncConfig): JsonFileSyncTarget {
  return new JsonFileSyncTarget(config);
}
