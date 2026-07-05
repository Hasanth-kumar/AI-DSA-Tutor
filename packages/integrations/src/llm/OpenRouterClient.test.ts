import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterClient } from "./OpenRouterClient.js";

/** Build a streaming (SSE) response body emitting one `delta` per content chunk. */
function sseStreamResponse(chunks: string[]): { ok: true; body: ReadableStream<Uint8Array> } {
  const encoder = new TextEncoder();
  const lines = chunks.map(
    (content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );
  lines.push("data: [DONE]\n\n");
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
  };
}

describe("OpenRouterClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts streaming chat completions to OpenRouter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseStreamResponse(["Hello from ", "Gemma"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "google/gemma-4-31b-it:free",
    });

    const reply = await client.chat([
      { role: "system", content: "You are a coach." },
      { role: "user", content: "Hi" },
    ]);

    expect(reply).toBe("Hello from Gemma");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      }),
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("google/gemma-4-31b-it:free");
    expect(body.stream).toBe(true);
  });

  it("throws on API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API key" } }),
      }),
    );

    const client = createOpenRouterClient({
      apiKey: "bad-key",
      model: "google/gemma-4-31b-it:free",
    });

    await expect(client.chat([{ role: "user", content: "Hi" }])).rejects.toThrow(
      "OpenRouter error: Invalid API key",
    );
  });

  it("retries on rate limits and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Rate limit exceeded" } }),
      })
      .mockResolvedValueOnce(sseStreamResponse(["Recovered reply"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "google/gemma-4-31b-it:free",
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Recovered reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the next model once the first is exhausted (A1)", async () => {
    const fetchMock = vi
      .fn()
      // model A: 3 exhausted retries on a persistent 502
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: { message: "Bad gateway" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: { message: "Bad gateway" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: { message: "Bad gateway" } }),
      })
      // model B: succeeds
      .mockResolvedValueOnce(sseStreamResponse(["Reply from second model"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "openai/gpt-oss-120b:free",
      models: ["openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free"],
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Reply from second model");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const lastBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(lastBody.model).toBe("google/gemma-4-31b-it:free");
  });

  it("advances to the next model immediately on a provider-returned error (A2)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: { message: "Provider returned error" } }),
      })
      .mockResolvedValueOnce(sseStreamResponse(["Recovered from second model"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "openai/gpt-oss-120b:free",
      models: ["openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free"],
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Recovered from second model");
    // No same-model backoff retries — advances after a single failed attempt.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a structured error naming every model tried once the chain is exhausted (A4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Provider returned error" } }),
      }),
    );

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "openai/gpt-oss-120b:free",
      models: ["openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free"],
    });

    await expect(client.chat([{ role: "user", content: "Hi" }])).rejects.toThrow(
      "All models failed (tried: openai/gpt-oss-120b:free, google/gemma-4-31b-it:free)",
    );
  });
});
