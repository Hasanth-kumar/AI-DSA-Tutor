export {
  serializeVector,
  deserializeVector,
  cosineSimilarity,
  dotProduct,
  magnitude,
  normalizeVector,
} from "./vector.js";
export {
  type Embedder,
  type EmbeddingProvider,
  EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_PROVIDER,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_TRANSFORMERS_MODEL,
} from "./Embedder.js";
export {
  DEFAULT_DEDUP_THRESHOLD,
  DEFAULT_DEDUP_CONFIG,
  type DedupConfig,
  type DedupCandidate,
  type DedupVerdict,
  type DedupMatch,
  type DedupBatchResult,
  conceptsOverlap,
  cardEmbeddingText,
  isDuplicatePair,
  findDuplicates,
  dedupeBatch,
} from "./dedup.js";
export {
  type GoldenCard,
  type GoldenPair,
  type ScoredPair,
  type DedupMetrics,
  GOLDEN_PAIRS,
  scoreGoldenPairs,
  evaluateScoredPairs,
  sweepThreshold,
} from "./golden-set.js";
export { createOllamaEmbedder, type OllamaEmbedderConfig } from "./OllamaEmbedder.js";
export {
  createTransformersEmbedder,
  type TransformersEmbedderConfig,
} from "./TransformersEmbedder.js";
export {
  createEmbedder,
  resolveEmbeddingProvider,
  type EmbedderFactoryConfig,
} from "./embedder-factory.js";
export {
  upsertEmbedding,
  getEmbedding,
  cardsNeedingEmbedding,
  loadDedupCandidates,
  type EmbeddingDb,
  type EmbeddingStatement,
  type StoredEmbedding,
  type CardNeedingEmbedding,
} from "./EmbeddingStore.js";
export {
  detectConfusionPairs,
  findCrossConceptPairs,
  DEFAULT_CONFUSION_CONFIG,
  type ConfusionPairConfig,
  type ConfusionCandidate,
  type ConfusionPair,
  type ConfusionDb,
} from "./confusion.js";
