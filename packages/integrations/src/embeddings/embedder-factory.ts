/**
 * Embedder selection (design §6, §14). The embedding runtime is configurable
 * between the two local providers; it defaults to local Ollama. No hosted
 * embedding API is ever an option here.
 */
import type { Embedder, EmbeddingProvider } from "./Embedder.js";
import { DEFAULT_EMBEDDING_PROVIDER } from "./Embedder.js";
import { createOllamaEmbedder, type OllamaEmbedderConfig } from "./OllamaEmbedder.js";
import {
  createTransformersEmbedder,
  type TransformersEmbedderConfig,
} from "./TransformersEmbedder.js";

export interface EmbedderFactoryConfig {
  /** Which local provider to use. Defaults to env `EMBEDDING_PROVIDER`, then Ollama. */
  provider?: EmbeddingProvider;
  ollama?: OllamaEmbedderConfig;
  transformers?: TransformersEmbedderConfig;
}

/** Resolve the provider from explicit config, then env, then the §14 default. */
export function resolveEmbeddingProvider(
  explicit?: EmbeddingProvider,
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider {
  if (explicit) return explicit;
  const fromEnv = env.EMBEDDING_PROVIDER?.toLowerCase();
  if (fromEnv === "ollama" || fromEnv === "transformers") return fromEnv;
  return DEFAULT_EMBEDDING_PROVIDER;
}

/** Build the configured local {@link Embedder}. */
export function createEmbedder(config: EmbedderFactoryConfig = {}): Embedder {
  const provider = resolveEmbeddingProvider(config.provider);
  return provider === "transformers"
    ? createTransformersEmbedder(config.transformers)
    : createOllamaEmbedder(config.ollama);
}
