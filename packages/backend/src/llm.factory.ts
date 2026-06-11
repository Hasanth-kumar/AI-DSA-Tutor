import { createLLMService, type LLMService, type LLMServiceConfig } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";

export function toLLMServiceConfig(config: AppConfig): LLMServiceConfig {
  if (config.llm.provider === "openrouter") {
    return {
      provider: "openrouter",
      model: config.llm.model,
      openrouter: {
        apiKey: config.llm.openrouter.apiKey ?? "",
        baseUrl: config.llm.openrouter.baseUrl,
        siteUrl: config.llm.openrouter.siteUrl,
        siteName: config.llm.openrouter.siteName,
      },
    };
  }

  return {
    provider: "ollama",
    model: config.llm.model,
    ollama: { baseUrl: config.llm.ollama.baseUrl },
  };
}

export function createAppLLMService(config: AppConfig): LLMService {
  return createLLMService(toLLMServiceConfig(config));
}

/**
 * Coaching/hint/debrief LLM (3.3) — honors COACH_LLM_PROVIDER/COACH_LLM_MODEL
 * so the coach can run a stronger cloud model while everything else stays local.
 */
export function toCoachLLMServiceConfig(config: AppConfig): LLMServiceConfig {
  if (config.coachLlm.provider === "openrouter") {
    return {
      provider: "openrouter",
      model: config.coachLlm.model,
      openrouter: {
        apiKey: config.llm.openrouter.apiKey ?? "",
        baseUrl: config.llm.openrouter.baseUrl,
        siteUrl: config.llm.openrouter.siteUrl,
        siteName: config.llm.openrouter.siteName,
      },
    };
  }

  return {
    provider: "ollama",
    model: config.coachLlm.model,
    ollama: { baseUrl: config.llm.ollama.baseUrl },
  };
}

export function createCoachLLMService(config: AppConfig): LLMService {
  return createLLMService(toCoachLLMServiceConfig(config));
}
