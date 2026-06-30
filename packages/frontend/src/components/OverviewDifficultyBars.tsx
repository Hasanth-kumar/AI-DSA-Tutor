import { memo } from "react";
import type { DifficultyAnalysis, TopicDifficulty } from "../types/api.js";

interface Props {
  data: DifficultyAnalysis | null;
}

const ORDER: TopicDifficulty[] = ["Easy", "Medium", "Hard"];
const COLORS: Record<TopicDifficulty, string> = {
  Easy: "var(--success)",
  Medium: "var(--warning)",
  Hard: "var(--danger)",
};

export const OverviewDifficultyBars = memo(function OverviewDifficultyBars({ data }: Props) {
  if (!data) return <p className="muted text-sm">No difficulty data yet.</p>;

  const buckets = ORDER.map(
    (d) =>
      data.byDifficulty.find((b) => b.difficulty === d) ?? {
        difficulty: d,
        problemsTotal: 0,
        problemsSolved: 0,
        solveRate: 0,
        averageAttempts: 0,
        averageTimeMinutes: 0,
      },
  ).filter((b) => b.problemsTotal > 0);

  if (buckets.length === 0) {
    return <p className="muted text-sm">No problem data for difficulty comparison yet.</p>;
  }

  return (
    <>
      <div className="diff-bars">
        {buckets.map((b) => {
          const pct = b.problemsTotal > 0 ? (b.problemsSolved / b.problemsTotal) * 100 : 0;
          return (
            <div key={b.difficulty} className="diff-bar-row">
              <div className="diff-bar-header">
                <span style={{ color: COLORS[b.difficulty], fontWeight: 500 }}>{b.difficulty}</span>
                <span className="diff-bar-count">
                  {b.problemsSolved} / {b.problemsTotal}
                </span>
              </div>
              <div className="diff-bar-track">
                <div
                  className="diff-bar-fill"
                  style={{ width: `${pct}%`, background: COLORS[b.difficulty] }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {data.summary && <p className="diff-bars-summary">{data.summary}</p>}
    </>
  );
});
