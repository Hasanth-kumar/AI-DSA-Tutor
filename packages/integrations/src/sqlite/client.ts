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

export function runMigrations(sqlitePath: string): void {
  const { sqlite } = createSqliteDb(sqlitePath);
  const migrationSql = readFileSync(
    resolve(repoRoot, "database/migrations/0001_initial.sql"),
    "utf-8",
  );
  sqlite.exec(migrationSql);
  sqlite.close();
}
