export type HealthStatus = "ok" | "degraded" | "down";

export interface ServiceHealth {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
}

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  services: {
    api: ServiceHealth;
    sqlite: ServiceHealth;
    redis: ServiceHealth;
    notion: ServiceHealth;
    ollama: ServiceHealth;
  };
  counts?: {
    topics: number;
    problems: number;
    sessions: number;
  };
}
