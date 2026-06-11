import { memo } from "react";
import type { WeeklySummary } from "../types/api.js";

interface Props {
  summary: WeeklySummary | null;
}

function trendClass(trend: string): string {
  if (trend === "up" || trend === "improving") return "trend-up";
  if (trend === "down" || trend === "worsening") return "trend-down";
  return "trend-stable";
}

export const StatsCards = memo(function StatsCards({ summary }: Props) {
  if (!summary) return null;

  return (
    <div className="grid grid-4">
      {/* Streak is de-emphasized (1.5): months-of-sessions replaces it here. */}
      <div className="card stat-card" style={{ position: "relative" }}>
        <div
          className="stat-icon"
          style={{ background: "rgba(212, 113, 62, 0.12)", color: "var(--accent)" }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a1 1 0 011 1V3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h3v-.5a1 1 0 011-1zM4.5 6v6.5h7V6h-7z" />
          </svg>
        </div>
        <h3>This month</h3>
        <div className="stat-value" style={{ color: "var(--accent)" }}>
          {summary.sessionsThisMonth ?? summary.sessionsCount}
        </div>
        <div className="stat-label">sessions logged</div>
      </div>

      <div className="card stat-card" style={{ position: "relative" }}>
        <div
          className="stat-icon"
          style={{ background: "rgba(82, 200, 138, 0.1)", color: "var(--success)" }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4.5 4.5a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06l1.47 1.47 3.97-3.97a.75.75 0 111.06 1.06z" />
          </svg>
        </div>
        <h3>This week</h3>
        <div className="stat-value">{summary.problemsSolved}</div>
        <div className="stat-label">
          problems · {summary.sessionsCount} sessions
        </div>
      </div>

      <div className="card stat-card" style={{ position: "relative" }}>
        <div
          className="stat-icon"
          style={{ background: "rgba(232, 168, 64, 0.1)", color: "var(--warning)" }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 13V5l5-4 5 4v8H3zm4-2h2V7H7v4z" />
          </svg>
        </div>
        <h3>Velocity</h3>
        <div className={`stat-value ${trendClass(summary.velocityTrend)}`}>
          {summary.problemsPerHour}
        </div>
        <div className="stat-label">
          /hr · <span className={trendClass(summary.velocityTrend)}>{summary.velocityTrend}</span>
        </div>
      </div>

      <div className="card stat-card" style={{ position: "relative" }}>
        <div
          className="stat-icon"
          style={{ background: "rgba(82, 200, 138, 0.1)", color: "var(--success)" }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm2.8 4.5l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 111.06 1.06z" />
          </svg>
        </div>
        <h3>Mastery</h3>
        <div className="stat-value">{summary.masteredTopics}</div>
        <div className="stat-label">
          mastered · {summary.inProgressTopics} in progress
        </div>
      </div>
    </div>
  );
});
