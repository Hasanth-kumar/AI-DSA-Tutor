// Minimal ambient declaration for js-yaml (we only use `load`). Avoids a
// dependency on @types/js-yaml while keeping the seed loader type-safe.
declare module "js-yaml" {
  export function load(input: string, options?: unknown): unknown;
  export function loadAll(input: string, options?: unknown): unknown[];
}
