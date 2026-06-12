import { memo } from "react";
import type { ScoreExplanation } from "../types/api.js";

interface Props {
  explanation: ScoreExplanation;
  compact?: boolean;
}

const SEGMENTS: {
  key: keyof ScoreExplanation["breakdown"];
  label: string;
  color: string;
}[] = [
  { key: "urgency", label: "Urgency", color: "var(--danger)" },
  { key: "weakness", label: "Weakness", color: "var(--warning)" },
  { key: "confidence", label: "Confidence gap", color: "var(--accent)" },
  { key: "prerequisiteReady", label: "Prereq bonus", color: "var(--success)" },
  { key: "recency", label: "Recency", color: "var(--info)" },
];

/** Horizontal stacked bar showing what drives a topic's priority score (3.2). */
export const ScoreBar = memo(function ScoreBar({ explanation, compact }: Props) {
  const parts = SEGMENTS.map((s) => ({
    ...s,
    value: Math.max(0, explanation.breakdown[s.key] ?? 0),
  }));
  const total = parts.reduce((sum, p) => sum + p.value, 0) || 1;

  return (
    <div className="score-bar-wrap">
      <div className="score-bar" role="img" aria-label="Priority score breakdown">
        {parts.map(
          (p) =>
            p.value > 0 && (
              <div
                key={p.key}
                className="score-bar-segment"
                style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
                title={`${p.label}: ${(p.value * 100).toFixed(0)}%`}
              />
            ),
        )}
      </div>
      <div className="score-bar-legend">
        {parts.map(
          (p) =>
            p.value > 0 && (
              <span key={p.key} className="score-bar-legend-item">
                <i style={{ background: p.color }} />
                {p.label} {(p.value * 100).toFixed(0)}%
              </span>
            ),
        )}
      </div>
      {!compact && (
        <ul className="score-bar-explanation">
          {explanation.explanation.slice(1).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
});
