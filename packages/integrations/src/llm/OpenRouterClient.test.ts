import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterClient } from "./OpenRouterClient.js";

describe("OpenRouterClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts chat completions to OpenRouter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello from Gemma" } }],
      }),
    });
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
    expect(body.stream).toBe(false);
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
});
