import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@dsa/database/schema";
import { MIGRATIONS } from "./migrations.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../..", import.meta.url)),
);

export type SqliteDb = BetterSQLite3Database<typeof schema>;

export function createSqliteDb(sqlitePath: string): { db: SqliteDb; sqlite: Database.Database } {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const sqlite = new Database(sqlitePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

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
      // Tolerate re-running idempotent column add/drop migrations.
      if (
        !message.includes("duplicate column name") &&
        !message.includes("no such column")
      ) {
        throw err;
      }
    }
  }
  sqlite.close();
}
