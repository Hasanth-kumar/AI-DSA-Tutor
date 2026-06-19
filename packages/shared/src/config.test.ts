import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./config.js";

describe("loadConfig", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("routes coach/warmup models to the coach OpenRouter key", () => {
    process.env.OPENROUTER_API_KEY = "main-key";
    process.env.OPENROUTER_COACH_API_KEY = "coach-key";
    process.env.OPENROUTER_MODEL = "google/gemma-4-31b-it:free";
    process.env.WARMUP_LLM_MODEL = "qwen/qwen3-coder:free";
    process.env.COACH_LLM_MODEL = "openai/gpt-oss-120b:free";
    resetConfigCache();

    const routed = loadConfig("/nonexistent/.env");
    expect(routed.llm.openrouter.apiKey).toBe("main-key");
    expect(routed.warmupLlm.openrouter.apiKey).toBe("coach-key");
    expect(routed.coachLlm.openrouter.apiKey).toBe("coach-key");

    const byModel = Object.fromEntries(
      routed.coachLlm.models.map((m) => [m.model, m.apiKey]),
    );
    expect(byModel["openai/gpt-oss-120b:free"]).toBe("coach-key");
    expect(byModel["qwen/qwen3-coder:free"]).toBe("coach-key");
    expect(byModel["google/gemma-4-31b-it:free"]).toBe("main-key");

    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_COACH_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.WARMUP_LLM_MODEL;
    delete process.env.COACH_LLM_MODEL;
    resetConfigCache();
  });
});
