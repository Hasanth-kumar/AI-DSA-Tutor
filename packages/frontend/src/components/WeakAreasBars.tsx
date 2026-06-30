import { memo } from "react";

interface WeakTopic {
  id: string;
  name: string;
  score: number;
}

interface Props {
  topics: WeakTopic[];
  limit?: number;
}

function barColor(score: number): string {
  if (score >= 0.7) return "var(--danger)";
  if (score >= 0.55) return "var(--warning)";
  return "var(--success)";
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "var(--danger)";
  if (score >= 0.55) return "var(--warning)";
  return "var(--text-muted)";
}

export const WeakAreasBars = memo(function WeakAreasBars({ topics, limit = 5 }: Props) {
  const items = topics.slice(0, limit);

  if (items.length === 0) {
    return <p className="muted text-sm">No weak areas flagged right now.</p>;
  }

  return (
    <div className="weak-bars">
      {items.map((t) => {
        const pct = Math.round(t.score * 100);
        return (
          <div key={t.id} className="weak-bar-row">
            <div className="weak-bar-header">
              <span>{t.name}</span>
              <span className="weak-bar-score" style={{ color: scoreColor(t.score) }}>
                {t.score.toFixed(2)}
              </span>
            </div>
            <div className="weak-bar-track">
              <div
                className="weak-bar-fill"
                style={{ width: `${pct}%`, background: barColor(t.score) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});
