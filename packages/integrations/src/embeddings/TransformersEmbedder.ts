/**
 * transformers.js embedding adapter (design §6, §13) — in-process alternative.
 *
 * Runs `Xenova/all-MiniLM-L6-v2` entirely inside the Node backend via
 * transformers.js (ONNX runtime). No daemon, no hosted API — but the model
 * (~90 MB) downloads once on first use. The dependency is loaded **lazily** via
 * dynamic import so it is only required by setups that actually pick this
 * provider; the rest of the package compiles and runs without it.
 *
 * Install with: pnpm --filter @dsa/integrations add @xenova/transformers
 */
import type { Embedder } from "./Embedder.js";
import { DEFAULT_TRANSFORMERS_MODEL, EMBEDDING_MODELS } from "./Embedder.js";

export interface TransformersEmbedderConfig {
  model?: string;
  dimension?: number;
}

type Extractor = (
  texts: string | string[],
  options?: { pooling?: "mean" | "cls" | "none"; normalize?: boolean },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

/**
 * Create an {@link Embedder} backed by transformers.js. The pipeline is loaded
 * on first {@link Embedder.embed} call and reused thereafter.
 */
export function createTransformersEmbedder(
  config: TransformersEmbedderConfig = {},
): Embedder {
  const model = config.model ?? DEFAULT_TRANSFORMERS_MODEL;
  const known = (EMBEDDING_MODELS as Record<string, { dimension: number }>)[model];
  const dimension = config.dimension ?? known?.dimension ?? 384;

  let extractorPromise: Promise<Extractor> | undefined;
  const getExtractor = async (): Promise<Extractor> => {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        let mod: typeof import("@xenova/transformers");
        try {
          mod = await import("@xenova/transformers");
        } catch {
          throw new Error(
            "@xenova/transformers is not installed. Run " +
              "`pnpm --filter @dsa/integrations add @xenova/transformers` " +
              "or use the Ollama embedder instead.",
          );
        }
        return (await mod.pipeline("feature-extraction", model)) as Extractor;
      })();
    }
    return extractorPromise;
  };

  return {
    model,
    dimension,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const extractor = await getExtractor();
      const out: Float32Array[] = [];
      // One text at a time keeps the output shape unambiguous (a single
      // pooled vector of length `dimension`) across transformers.js versions.
      for (const text of texts) {
        const result = await extractor(text, { pooling: "mean", normalize: true });
        out.push(Float32Array.from(result.data as ArrayLike<number>));
      }
      return out;
    },
  };
}
