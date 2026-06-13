import { memo, type CSSProperties } from "react";
import { useCountUp } from "../hooks/useCountUp.js";
import type { WeeklySummary } from "../types/api.js";

interface Props {
  summary: WeeklySummary | null;
}

function trendClass(trend: string): string {
  if (trend === "up" || trend === "improving") return "trend-up";
  if (trend === "down" || trend === "worsening") return "trend-down";
  return "trend-stable";
}

/** Stat number that counts up from its previous value on each data refresh. */
function StatNumber({ value }: { value: number }) {
  const decimals = Number.isInteger(value) ? 0 : 1;
  const display = useCountUp(value, decimals);
  return <>{display.toFixed(decimals)}</>;
}

export const StatsCards = memo(function StatsCards({ summary }: Props) {
  if (!summary) return null;

  return (
    <div className="grid grid-4">
      {/* Streak is de-emphasized (1.5): months-of-sessions replaces it here. */}
      <div className="card stat-card reveal-stagger" style={{ "--reveal-i": 0 } as CSSProperties}>
        <div className="stat-icon stat-icon--accent">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a1 1 0 011 1V3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h3v-.5a1 1 0 011-1zM4.5 6v6.5h7V6h-7z" />
          </svg>
        </div>
        <h3 className="card-section-title">This month</h3>
        <div className="stat-value" style={{ color: "var(--accent)" }}>
          <StatNumber value={summary.sessionsThisMonth ?? summary.sessionsCount} />
        </div>
        <div className="stat-label">sessions logged</div>
      </div>

      <div className="card stat-card reveal-stagger" style={{ "--reveal-i": 1 } as CSSProperties}>
        <div className="stat-icon stat-icon--success">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4.5 4.5a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06l1.47 1.47 3.97-3.97a.75.75 0 111.06 1.06z" />
          </svg>
        </div>
        <h3 className="card-section-title">This week</h3>
        <div className="stat-value">
          <StatNumber value={summary.problemsSolved} />
        </div>
        <div className="stat-label">
          problems · {summary.sessionsCount} sessions
        </div>
      </div>

      <div className="card stat-card reveal-stagger" style={{ "--reveal-i": 2 } as CSSProperties}>
        <div className="stat-icon stat-icon--warning">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 13V5l5-4 5 4v8H3zm4-2h2V7H7v4z" />
          </svg>
        </div>
        <h3 className="card-section-title">Velocity</h3>
        <div className={`stat-value ${trendClass(summary.velocityTrend)}`}>
          <StatNumber value={summary.problemsPerHour} />
        </div>
        <div className="stat-label">
          /hr · <span className={trendClass(summary.velocityTrend)}>{summary.velocityTrend}</span>
        </div>
      </div>

      <div className="card stat-card reveal-stagger" style={{ "--reveal-i": 3 } as CSSProperties}>
        <div className="stat-icon stat-icon--success">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm2.8 4.5l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 111.06-1.06l.97.97 2.97-2.97a.75.75 0 111.06 1.06z" />
          </svg>
        </div>
        <h3 className="card-section-title">Mastery</h3>
        <div className="stat-value">
          <StatNumber value={summary.masteredTopics} />
        </div>
        <div className="stat-label">
          mastered · {summary.inProgressTopics} in progress
        </div>
      </div>
    </div>
  );
});
