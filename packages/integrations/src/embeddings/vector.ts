/**
 * Vector math + SQLite blob (de)serialization for the local embedding store
 * (design §6). Pure and dependency-free so it compiles/runs anywhere (no native
 * binding, no model runtime) and is fully unit-testable.
 *
 * Vectors are stored as a raw **little-endian Float32** blob directly in SQLite
 * — there is no separate vector DB. Matching is brute-force cosine over the card
 * set, which is sub-millisecond for a few thousand cards.
 */

/** Bytes per Float32 element. */
const F32_BYTES = 4;

/**
 * Serialize a Float32 vector to a little-endian byte buffer for blob storage.
 * The round-trip is lossless: every float bit is preserved.
 */
export function serializeVector(vec: Float32Array | readonly number[]): Buffer {
  const arr = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  const buf = Buffer.allocUnsafe(arr.length * F32_BYTES);
  for (let i = 0; i < arr.length; i++) {
    buf.writeFloatLE(arr[i]!, i * F32_BYTES);
  }
  return buf;
}

/**
 * Deserialize a little-endian Float32 blob back into a Float32Array. Accepts a
 * Node Buffer or any Uint8Array (better-sqlite3 and node:sqlite both hand back
 * blob columns as one or the other).
 */
export function deserializeVector(blob: Uint8Array): Float32Array {
  if (blob.byteLength % F32_BYTES !== 0) {
    throw new Error(
      `Embedding blob length ${blob.byteLength} is not a multiple of ${F32_BYTES}`,
    );
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Float32Array(blob.byteLength / F32_BYTES);
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getFloat32(i * F32_BYTES, true);
  }
  return out;
}

/** Euclidean (L2) norm of a vector. */
export function magnitude(vec: Float32Array | readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

/** Dot product of two equal-length vectors. */
export function dotProduct(
  a: Float32Array | readonly number[],
  b: Float32Array | readonly number[],
): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

/**
 * Cosine similarity in [-1, 1]. Returns 0 when either vector is all-zero
 * (undefined direction) rather than NaN, so callers never have to guard.
 */
export function cosineSimilarity(
  a: Float32Array | readonly number[],
  b: Float32Array | readonly number[],
): number {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma === 0 || mb === 0) return 0;
  return dotProduct(a, b) / (ma * mb);
}

/**
 * Return a unit-length copy of the vector (no-op direction for a zero vector).
 * Pre-normalizing once lets cosine reduce to a dot product on the hot path.
 */
export function normalizeVector(vec: Float32Array | readonly number[]): Float32Array {
  const m = magnitude(vec);
  const out = new Float32Array(vec.length);
  if (m === 0) return out;
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i]! / m;
  }
  return out;
}
