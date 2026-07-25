/**
 * Embedder contract + model registry (design §6, §13, §14).
 *
 * Embeddings are **local only** — never a hosted embedding API. The concrete
 * provider is `nomic-embed-text` via Ollama (HTTP to localhost, zero npm deps).
 *
 * The interface is deliberately tiny and provider-agnostic so the dedup utility
 * (and the §5 generation pipeline) never imports a specific runtime. Mirror
 * of the binding-free `CardStore` / `SqliteLike` pattern used elsewhere in the repo.
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
} as const;

export const DEFAULT_OLLAMA_MODEL = "nomic-embed-text";
