import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@dsa/database/schema";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../..", import.meta.url)),
);

export type SqliteDb = BetterSQLite3Database<typeof schema>;

export function createSqliteDb(sqlitePath: string): { db: SqliteDb; sqlite: Database.Database } {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const sqlite = new Database(sqlitePath);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

const MIGRATIONS = [
  "0001_initial.sql",
  "0002_sync_meta.sql",
  "0003_github_solutions.sql",
  "0004_chat.sql",
  "0005_performance_indexes.sql",
  "0006_query_indexes.sql",
  "0007_attempts_notes_conflicts.sql",
  "0008_problem_status_notion.sql",
  "0009_sm2_state.sql",
] as const;

export function runMigrations(sqlitePath: string): void {
  const { sqlite } = createSqliteDb(sqlitePath);
  for (const file of MIGRATIONS) {
    const migrationSql = readFileSync(
      resolve(repoRoot, "database/migrations", file),
      "utf-8",
    );
    try {
      sqlite.exec(migrationSql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("duplicate column name")) {
        throw err;
      }
    }
  }
  sqlite.close();
}
