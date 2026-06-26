// Minimal ambient declaration for @xenova/transformers (transformers.js). We
// only use the feature-extraction pipeline. Declared locally so the package
// type-checks without the (large, optional) dependency physically installed —
// it is loaded lazily at runtime via dynamic import. Install with
// `pnpm --filter @dsa/integrations add @xenova/transformers` to use this adapter.
declare module "@xenova/transformers" {
  export interface FeatureExtractionResult {
    data: Float32Array | number[];
    dims: number[];
  }
  export type FeatureExtractionPipeline = (
    texts: string | string[],
    options?: { pooling?: "mean" | "cls" | "none"; normalize?: boolean },
  ) => Promise<FeatureExtractionResult>;
  export function pipeline(
    task: "feature-extraction",
    model?: string,
  ): Promise<FeatureExtractionPipeline>;
}
