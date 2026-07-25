/**
 * Compute + store local embeddings for the flashcard bank (design §6).
 * Run via: pnpm db:embed-cards            (embed all cards missing/stale vectors)
 *          pnpm db:embed-cards -- --golden (evaluate + sweep the dedup threshold)
 *
 * Uses the LOCAL embedder (Ollama `nomic-embed-text`). Vectors are stored as
 * blobs in SQLite — no vector DB, never synced to Notion.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@dsa/shared";
import { createSqliteDb, runMigrations } from "../sqlite/client.js";
import {
  createOllamaEmbedder,
  cardEmbeddingText,
  cardsNeedingEmbedding,
  upsertEmbedding,
  scoreGoldenPairs,
  evaluateScoredPairs,
  sweepThreshold,
  DEFAULT_DEDUP_THRESHOLD,
} from "../embeddings/index.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const BATCH = 32;

async function embedAll(): Promise<void> {
  const cfg = loadConfig(resolve(repoRoot, ".env"));
  runMigrations(cfg.sqlite.path);

  const embedder = createOllamaEmbedder();
  console.log(`Embedder: ${embedder.model} (${embedder.dimension}d)`);

  const { sqlite } = createSqliteDb(cfg.sqlite.path);
  try {
    const todo = cardsNeedingEmbedding(sqlite, embedder.model);
    console.log(`Cards needing embedding: ${todo.length}`);

    let done = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const vectors = await embedder.embed(batch.map((c) => cardEmbeddingText(c)));
      for (let j = 0; j < batch.length; j++) {
        const card = batch[j]!;
        upsertEmbedding(sqlite, {
          cardId: card.id,
          model: embedder.model,
          vector: vectors[j]!,
          sourceHash: card.sourceHash ?? "",
        });
      }
      done += batch.length;
      console.log(`  embedded ${done}/${todo.length}`);
    }
    console.log("Embedding sweep complete.");
  } finally {
    sqlite.close();
  }
}

async function evaluateGolden(): Promise<void> {
  const embedder = createOllamaEmbedder();
  console.log(`Evaluating golden set with ${embedder.model} (${embedder.dimension}d)`);
  const scored = await scoreGoldenPairs(embedder);
  const atDefault = evaluateScoredPairs(scored, {
    threshold: DEFAULT_DEDUP_THRESHOLD,
    requireConceptOverlap: true,
  });
  console.log(`At default threshold ${DEFAULT_DEDUP_THRESHOLD}:`, atDefault);

  const grid = Array.from({ length: 21 }, (_, i) => Number((0.6 + i * 0.02).toFixed(2)));
  const { best } = sweepThreshold(scored, grid);
  console.log(
    `Best threshold by F1: ${best.threshold} ` +
      `(P=${best.precision.toFixed(2)} R=${best.recall.toFixed(2)} F1=${best.f1.toFixed(2)})`,
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--golden")) {
    await evaluateGolden();
  } else {
    await embedAll();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
