import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./config.js";

describe("loadConfig", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("routes coach/warmup models to the coach OpenRouter key", () => {
    process.env.OPENROUTER_API_KEY = "main-key";
    process.env.OPENROUTER_COACH_API_KEY = "coach-key";
    process.env.OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";
    process.env.WARMUP_LLM_MODEL = "openai/gpt-oss-20b:free";
    process.env.COACH_LLM_MODEL = "openai/gpt-oss-120b:free";
    process.env.COACH_LLM_FALLBACK_MODELS =
      "openai/gpt-oss-20b:free,nvidia/nemotron-3-nano-30b-a3b:free,google/gemma-4-26b-a4b-it:free";
    resetConfigCache();

    const routed = loadConfig("/nonexistent/.env");
    expect(routed.llm.openrouter.apiKey).toBe("main-key");
    expect(routed.warmupLlm.openrouter.apiKey).toBe("coach-key");
    expect(routed.coachLlm.openrouter.apiKey).toBe("coach-key");

    const byModel = Object.fromEntries(
      routed.coachLlm.models.map((m) => [m.model, m.apiKey]),
    );
    // GPT-OSS → coach key; Gemma → general key; other fallbacks → coach key.
    expect(byModel["openai/gpt-oss-120b:free"]).toBe("coach-key");
    expect(byModel["openai/gpt-oss-20b:free"]).toBe("coach-key");
    expect(byModel["google/gemma-4-26b-a4b-it:free"]).toBe("main-key");
    expect(byModel["nvidia/nemotron-3-nano-30b-a3b:free"]).toBe("coach-key");

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_COACH_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.WARMUP_LLM_MODEL;
    delete process.env.COACH_LLM_MODEL;
    delete process.env.COACH_LLM_FALLBACK_MODELS;
    resetConfigCache();
  });

  it("honors COACH_LLM_FALLBACK_MODELS over the auto-fallback", () => {
    process.env.OPENROUTER_API_KEY = "main-key";
    process.env.OPENROUTER_COACH_API_KEY = "coach-key";
    process.env.OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";
    process.env.COACH_LLM_MODEL = "openai/gpt-oss-120b:free";
    process.env.COACH_LLM_FALLBACK_MODELS =
      "openai/gpt-oss-20b:free, google/gemma-4-26b-a4b-it:free";
    resetConfigCache();

    const cfg = loadConfig("/nonexistent/.env");
    expect(cfg.coachLlm.fallbackModels).toEqual([
      "openai/gpt-oss-20b:free",
      "google/gemma-4-26b-a4b-it:free",
    ]);
    // Fallback models are also offered in the picker.
    expect(cfg.coachLlm.models.map((m) => m.model)).toEqual([
      "openai/gpt-oss-120b:free",
      "google/gemma-4-26b-a4b-it:free",
      "openai/gpt-oss-20b:free",
    ]);
    const byModel = Object.fromEntries(
      cfg.coachLlm.models.map((m) => [m.model, m.apiKey]),
    );
    expect(byModel["openai/gpt-oss-120b:free"]).toBe("coach-key");
    expect(byModel["openai/gpt-oss-20b:free"]).toBe("coach-key");
    expect(byModel["google/gemma-4-26b-a4b-it:free"]).toBe("main-key");

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_COACH_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.COACH_LLM_MODEL;
    delete process.env.COACH_LLM_FALLBACK_MODELS;
    resetConfigCache();
  });
});
