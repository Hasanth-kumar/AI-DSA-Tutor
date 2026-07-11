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

/** SSE body that yields content then a mid-stream error event. */
function ssePartialThenError(
  chunks: string[],
  errorMessage: string,
): { ok: true; body: ReadableStream<Uint8Array> } {
  const encoder = new TextEncoder();
  const lines = chunks.map(
    (content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );
  lines.push(`data: ${JSON.stringify({ error: { message: errorMessage } })}\n\n`);
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

/** SSE body with a malformed line then valid content. */
function sseMalformedThenContent(
  content: string,
): { ok: true; body: ReadableStream<Uint8Array> } {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: {not-valid-json\n\n"));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
    expect(body.reasoning).toEqual({ exclude: true });
    expect(body.max_tokens).toBe(2_048);
    expect(body.models).toEqual(["google/gemma-4-31b-it:free"]);
  });

  it("caps the OpenRouter models array at 3 entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseStreamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "a",
      models: ["a", "b", "c", "d", "e"],
    });

    await client.chat([{ role: "user", content: "Hi" }]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.models).toEqual(["a", "b", "c"]);
  });

  it("uses per-model API keys and only same-key native fallbacks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Provider returned error" } }),
      })
      .mockResolvedValueOnce(sseStreamResponse(["from gemma key"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "coach-key",
      model: "openai/gpt-oss-120b:free",
      models: [
        "openai/gpt-oss-120b:free",
        "google/gemma-4-26b-a4b-it:free",
        "openai/gpt-oss-20b:free",
      ],
      modelApiKeys: {
        "openai/gpt-oss-120b:free": "coach-key",
        "openai/gpt-oss-20b:free": "coach-key",
        "google/gemma-4-26b-a4b-it:free": "main-key",
      },
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("from gemma key");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(first.model).toBe("openai/gpt-oss-120b:free");
    // Native fallbacks skip Gemma (different key) and keep GPT-OSS-20b.
    expect(first.models).toEqual([
      "openai/gpt-oss-120b:free",
      "openai/gpt-oss-20b:free",
    ]);
    expect(firstHeaders.Authorization).toBe("Bearer coach-key");

    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(second.model).toBe("google/gemma-4-26b-a4b-it:free");
    expect(second.models).toEqual(["google/gemma-4-26b-a4b-it:free"]);
    expect(secondHeaders.Authorization).toBe("Bearer main-key");
  });

  it("advances to the next model when a stream yields no content", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseStreamResponse([]))
      .mockResolvedValueOnce(sseStreamResponse(["Recovered reply"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "openai/gpt-oss-120b:free",
      models: ["openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free"],
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Recovered reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("falls back to the next model once the first is exhausted", async () => {
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

  it("advances to the next model immediately on a provider-returned error", async () => {
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
    // No same-model retries — advance immediately.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps partial content and does not fall back after a mid-stream error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ssePartialThenError(["Partial ", "reply"], "stream cut"))
      .mockResolvedValueOnce(sseStreamResponse(["Should not be used"]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "openai/gpt-oss-120b:free",
      models: ["openai/gpt-oss-120b:free", "google/gemma-4-31b-it:free"],
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Partial reply");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips malformed SSE lines and continues streaming", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseMalformedThenContent("Recovered"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createOpenRouterClient({
      apiKey: "sk-test",
      model: "google/gemma-4-31b-it:free",
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("Recovered");
  });

  it("throws a structured error naming every model tried once the chain is exhausted", async () => {
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
