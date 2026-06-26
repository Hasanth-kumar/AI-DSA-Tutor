/**
 * Ollama embedding adapter (design §6, §13, §14) — the default provider.
 *
 * Talks to a locally-running Ollama daemon over HTTP (`nomic-embed-text`).
 * Zero npm dependencies (uses global `fetch`), nothing leaves the machine,
 * true $0. This is why it is the default per §14 ("start local Ollama").
 */
import type { Embedder } from "./Embedder.js";
import { DEFAULT_OLLAMA_MODEL, EMBEDDING_MODELS } from "./Embedder.js";

export interface OllamaEmbedderConfig {
  /** Ollama daemon base URL. */
  baseUrl?: string;
  /** Embedding model (must be pulled in Ollama). */
  model?: string;
  /** Expected dimension; defaults from the model registry when known. */
  dimension?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface OllamaEmbeddingResponse {
  embedding?: number[];
}

/**
 * Create an {@link Embedder} backed by Ollama's `/api/embeddings` endpoint.
 * Embeds one text per request (the single-prompt endpoint is the most widely
 * compatible across Ollama versions) and preserves input order.
 */
export function createOllamaEmbedder(config: OllamaEmbedderConfig = {}): Embedder {
  const baseUrl = (config.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
  const model = config.model ?? DEFAULT_OLLAMA_MODEL;
  const known = (EMBEDDING_MODELS as Record<string, { dimension: number }>)[model];
  const declaredDim = config.dimension ?? known?.dimension ?? 768;
  const doFetch = config.fetchImpl ?? fetch;

  return {
    model,
    dimension: declaredDim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const prompt of texts) {
        const res = await doFetch(`${baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt }),
        });
        if (!res.ok) {
          throw new Error(`Ollama embeddings failed (${res.status}): ${await res.text()}`);
        }
        const body = (await res.json()) as OllamaEmbeddingResponse;
        if (!body.embedding || body.embedding.length === 0) {
          throw new Error("Ollama returned an empty embedding");
        }
        out.push(Float32Array.from(body.embedding));
      }
      return out;
    },
  };
}
