/**
 * Seed the curated flashcard baseline into SQLite.
 * Run via: pnpm db:seed-cards (from repo root)
 *
 * Applies the migration chain (so the cards tables exist), loads + validates
 * every topic under database/seeds, and inserts the baseline idempotently.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@dsa/shared";
import { createSqliteDb, runMigrations } from "../sqlite/client.js";
import { loadAllSeeds, seedTopics, topicCoverage } from "../seeds/index.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

function main(): void {
  const cfg = loadConfig(resolve(repoRoot, ".env"));
  runMigrations(cfg.sqlite.path);

  const seedsRoot = resolve(repoRoot, "database/seeds");
  const topics = loadAllSeeds(seedsRoot);

  for (const topic of topics) {
    const cov = topicCoverage(topic);
    console.log(
      `  ${topic.topicName}: ${topic.cards.length} cards, ` +
        `coverage ${cov.covered}/${cov.total}` +
        (cov.uncovered.length ? ` (uncovered: ${cov.uncovered.join(", ")})` : ""),
    );
  }

  const { sqlite } = createSqliteDb(cfg.sqlite.path);
  const result = seedTopics(sqlite, topics);
  sqlite.close();

  console.log("Seed complete:", result);
}

main();
