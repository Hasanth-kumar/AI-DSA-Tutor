/**
 * Embedder contract + model registry (design §6, §13, §14).
 *
 * Embeddings are **local only** — never a hosted embedding API. Two concrete
 * providers implement this interface (both local):
 *   - `nomic-embed-text` via Ollama (HTTP to localhost, zero npm deps) — default;
 *   - `Xenova/all-MiniLM-L6-v2` via transformers.js (in-process Node) — alt.
 *
 * The interface is deliberately tiny and provider-agnostic so the dedup utility
 * (and later the §5 generation pipeline) never imports a specific runtime. Mirror
 * of the binding-free `CardStore` / `SeedDb` pattern used elsewhere in the repo.
 */

/** A provider that turns text into dense vectors. Implementations are local. */
export interface Embedder {
  /** Stable model id, persisted with each vector so model swaps are detectable. */
  readonly model: string;
  /** Output vector dimension. */
  readonly dimension: number;
  /**
   * Embed a batch of texts, returning one vector per input in order. Batching is
   * encouraged so adapters can amortize model/runtime overhead.
   */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Known local embedding models and their dimensions. */
export const EMBEDDING_MODELS = {
  /** Ollama default — 768-dim. */
  "nomic-embed-text": { provider: "ollama", dimension: 768 },
  /** transformers.js (Xenova) — 384-dim, runs in-process. */
  "Xenova/all-MiniLM-L6-v2": { provider: "transformers", dimension: 384 },
} as const;

export type EmbeddingProvider = "ollama" | "transformers";

/**
 * Default provider (§14): start with local Ollama (`nomic-embed-text`) — true
 * $0, nothing leaves the machine, and zero extra npm deps (HTTP only).
 * transformers.js is the in-process alternative for setups without Ollama.
 */
export const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "ollama";
export const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";
export const DEFAULT_TRANSFORMERS_MODEL = "Xenova/all-MiniLM-L6-v2";
