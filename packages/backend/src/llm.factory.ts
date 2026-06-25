import { createLLMService, type LLMService, type LLMServiceConfig } from "@dsa/integrations";
import type { AppConfig, CoachModelOption } from "@dsa/shared";

const WARMUP_TIMEOUT_MS = 180_000;

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
 * so the coach chat can switch between models (e.g. DeepSeek R1 vs Gemma 4) at runtime.
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
