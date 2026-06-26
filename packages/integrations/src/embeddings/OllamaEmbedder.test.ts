import { describe, it, expect, vi } from "vitest";
import { createOllamaEmbedder } from "./OllamaEmbedder.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("OllamaEmbedder (§6, §13 — local, no hosted API)", () => {
  it("posts to the local /api/embeddings endpoint with model + prompt", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ embedding: [0.1, 0.2, 0.3] }),
    );
    const embedder = createOllamaEmbedder({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await embedder.embed(["hello"]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/embeddings");
    expect(url).toContain("localhost"); // never a hosted API
    expect(JSON.parse(init.body as string)).toEqual({
      model: "nomic-embed-text",
      prompt: "hello",
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(out[0]!)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
    ]);
  });

  it("preserves order and embeds one request per text", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const { prompt } = JSON.parse(init.body as string) as { prompt: string };
      return jsonResponse({ embedding: prompt === "a" ? [1, 0] : [0, 1] });
    });
    const embedder = createOllamaEmbedder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await embedder.embed(["a", "b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Array.from(out[0]!)).toEqual([1, 0]);
    expect(Array.from(out[1]!)).toEqual([0, 1]);
  });

  it("reports the model's declared dimension", () => {
    expect(createOllamaEmbedder({ model: "nomic-embed-text" }).dimension).toBe(768);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, false, 500));
    const embedder = createOllamaEmbedder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(embedder.embed(["x"])).rejects.toThrow(/Ollama embeddings failed/);
  });

  it("throws on an empty embedding", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ embedding: [] }));
    const embedder = createOllamaEmbedder({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(embedder.embed(["x"])).rejects.toThrow(/empty embedding/);
  });
});
