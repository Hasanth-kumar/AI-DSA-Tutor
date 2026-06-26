import { describe, it, expect } from "vitest";
import {
  serializeVector,
  deserializeVector,
  cosineSimilarity,
  dotProduct,
  magnitude,
  normalizeVector,
} from "./vector.js";

describe("vector blob (de)serialization (§6)", () => {
  it("round-trips a Float32 vector losslessly", () => {
    const v = new Float32Array([0.1, -0.5, 1.25, 0, 3.4028234663852886e38]);
    const blob = serializeVector(v);
    expect(blob.byteLength).toBe(v.length * 4);
    const back = deserializeVector(blob);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  it("round-trips through a plain Uint8Array (node:sqlite blob shape)", () => {
    const v = Float32Array.from([1, 2, 3]);
    const blob = serializeVector(v);
    const asU8 = new Uint8Array(blob); // copy, drops Buffer-ness
    expect(Array.from(deserializeVector(asU8))).toEqual([1, 2, 3]);
  });

  it("accepts a plain number[] input", () => {
    expect(Array.from(deserializeVector(serializeVector([4, 5, 6])))).toEqual([4, 5, 6]);
  });

  it("rejects a blob whose length is not a multiple of 4", () => {
    expect(() => deserializeVector(new Uint8Array([1, 2, 3]))).toThrow(/multiple of 4/);
  });
});

describe("vector math (§6)", () => {
  it("computes magnitude and dot product", () => {
    expect(magnitude([3, 4])).toBeCloseTo(5);
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("throws on length mismatch in dot product", () => {
    expect(() => dotProduct([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });

  it("cosine = 1 for identical, -1 for opposite, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 1, 1], [2, 2, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("cosine returns 0 (not NaN) for a zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("normalizeVector returns a unit vector (and zero for a zero input)", () => {
    expect(magnitude(normalizeVector([3, 4]))).toBeCloseTo(1);
    expect(Array.from(normalizeVector([0, 0]))).toEqual([0, 0]);
  });
});
