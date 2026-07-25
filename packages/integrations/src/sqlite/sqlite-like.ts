/**
 * Minimal prepared-statement DB surface, satisfied by both better-sqlite3
 * (production) and node:sqlite (tests). Stores depend on this instead of a
 * concrete driver so they stay binding-free and unit-testable.
 */
export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
