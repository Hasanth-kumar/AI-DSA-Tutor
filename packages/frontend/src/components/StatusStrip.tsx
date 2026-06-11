import { useCallback } from "react";
import { api } from "../api/client.js";
import { usePolling } from "../hooks/usePolling.js";
import type { HealthInfo, ServiceHealth } from "../types/api.js";

const HEALTH_POLL_MS = 30_000;

const SERVICES: { key: keyof NonNullable<HealthInfo["services"]>; label: string }[] = [
  { key: "sqlite", label: "SQLite" },
  { key: "redis", label: "Redis" },
  { key: "notion", label: "Notion" },
  { key: "ollama", label: "LLM" },
];

function degradationMessage(services: NonNullable<HealthInfo["services"]>): string | null {
  if (services.ollama.status === "down") {
    return "Coach is unavailable — LLM unreachable. Everything else still works.";
  }
  if (services.notion.status === "down") {
    return "Notion is unreachable — changes are queued locally and sync later.";
  }
  if (services.redis.status === "down") {
    return "Redis is down — plan caching and hint caching are disabled.";
  }
  if (services.sqlite.status === "down") {
    return "SQLite is unavailable — data cannot be read or written.";
  }
  return null;
}

/** Slim /health indicator bar with graceful-degradation messaging (5.4). */
export function StatusStrip() {
  const fetchHealth = useCallback(() => api.getFullHealth(), []);
  const { data: health } = usePolling(fetchHealth, HEALTH_POLL_MS, {
    initialLoading: false,
  });

  if (!health?.services) return null;

  const message = degradationMessage(health.services);
  const dot = (s: ServiceHealth) =>
    s.status === "ok" ? "status-pill--ok" : "status-pill--down";

  return (
    <div className={`status-strip${message ? " status-strip--degraded" : ""}`}>
      <div className="status-strip-services">
        {SERVICES.map(({ key, label }) => {
          const svc = health.services![key];
          return (
            <span
              key={key}
              className={`status-pill ${dot(svc)}`}
              title={svc.message ?? svc.status}
            >
              <i />
              {label}
            </span>
          );
        })}
        {health.sync?.lastSyncAt && (
          <span className="status-pill status-pill--info" title="Last Notion sync">
            <i />
            synced {timeAgo(health.sync.lastSyncAt)}
          </span>
        )}
        {(health.sync?.unresolvedConflicts ?? 0) > 0 && (
          <span className="status-pill status-pill--warn">
            <i />
            {health.sync!.unresolvedConflicts} sync conflict
            {health.sync!.unresolvedConflicts === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {message && <span className="status-strip-message">{message}</span>}
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
