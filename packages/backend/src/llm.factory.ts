import {
  createLLMService,
  createGenerationClient,
  createOllamaGenerationClient,
  createOpenRouterClient,
  DEFAULT_OLLAMA_GEN_MODEL,
  type GenerationClient,
  type LLMService,
  type LLMServiceConfig,
} from "@dsa/integrations";
import type { AppConfig, CoachModelOption } from "@dsa/shared";

const WARMUP_TIMEOUT_MS = 180_000;
const GENERATION_TIMEOUT_MS = 180_000;

export function toLLMServiceConfig(config: AppConfig): LLMServiceConfig {
  return {
    model: config.llm.model,
    openrouter: {
      apiKey: config.llm.openrouter.apiKey ?? "",
      baseUrl: config.llm.openrouter.baseUrl,
      siteUrl: config.llm.openrouter.siteUrl,
      siteName: config.llm.openrouter.siteName,
    },
  };
}

export function createAppLLMService(config: AppConfig): LLMService {
  return createLLMService(toLLMServiceConfig(config));
}

/**
 * Batch card-generation LLM (design §5, §13, §14). This is the *only* LLM in the
 * flashcard system and it runs OFF the hot path. Per §14 it defaults to a local
 * Ollama model (true $0, nothing leaves the machine) and falls back to the free
 * OpenRouter cloud tier already configured in `config.llm` — both free, plugged
 * into the same `llm.factory` chain as every other model.
 */
export function createGenerationLLMClient(config: AppConfig): GenerationClient {
  return createGenerationClient({
    local: createOllamaGenerationClient({
      model: process.env.OLLAMA_GEN_MODEL ?? DEFAULT_OLLAMA_GEN_MODEL,
      timeoutMs: GENERATION_TIMEOUT_MS,
    }),
    cloud: createOpenRouterClient({
      apiKey: config.llm.openrouter.apiKey ?? "",
      model: config.llm.model,
      baseUrl: config.llm.openrouter.baseUrl,
      siteUrl: config.llm.openrouter.siteUrl,
      siteName: config.llm.openrouter.siteName,
      timeoutMs: GENERATION_TIMEOUT_MS,
    }),
  });
}

export function toWarmupLLMServiceConfig(config: AppConfig): LLMServiceConfig {
  return {
    model: config.warmupLlm.model,
    timeoutMs: WARMUP_TIMEOUT_MS,
    openrouter: {
      apiKey: config.warmupLlm.openrouter.apiKey ?? "",
      baseUrl: config.warmupLlm.openrouter.baseUrl,
      siteUrl: config.warmupLlm.openrouter.siteUrl,
      siteName: config.warmupLlm.openrouter.siteName,
    },
  };
}

/** Warm-up quiz LLM — honors WARMUP_LLM_MODEL. */
export function createWarmupLLMService(config: AppConfig): LLMService {
  return createLLMService(toWarmupLLMServiceConfig(config));
}

/** Coaching/hint/debrief LLM — honors COACH_LLM_MODEL for a stronger coach model. */
export function toCoachLLMServiceConfig(config: AppConfig): LLMServiceConfig {
  return {
    model: config.coachLlm.model,
    models: [config.coachLlm.model, ...config.coachLlm.fallbackModels],
    openrouter: {
      apiKey: config.coachLlm.openrouter.apiKey ?? config.llm.openrouter.apiKey ?? "",
      baseUrl: config.llm.openrouter.baseUrl,
      siteUrl: config.llm.openrouter.siteUrl,
      siteName: config.llm.openrouter.siteName,
    },
  };
}

export function createCoachLLMService(config: AppConfig): LLMService {
  return createLLMService(toCoachLLMServiceConfig(config));
}

/**
 * Build a coach LLM for a specific user-selected model (from config.coachLlm.models),
 * so the coach chat can switch between models (e.g. GPT-OSS 120B vs Gemma 4) at runtime.
 */
export function toCoachModelServiceConfig(
  config: AppConfig,
  option: CoachModelOption,
): LLMServiceConfig {
  return {
    model: option.model,
    openrouter: {
      apiKey:
        option.apiKey ??
        config.coachLlm.openrouter.apiKey ??
        config.llm.openrouter.apiKey ??
        "",
      baseUrl: config.llm.openrouter.baseUrl,
      siteUrl: config.llm.openrouter.siteUrl,
      siteName: config.llm.openrouter.siteName,
    },
  };
}

export function createCoachModelLLMService(
  config: AppConfig,
  option: CoachModelOption,
): LLMService {
  return createLLMService(toCoachModelServiceConfig(config, option));
}
