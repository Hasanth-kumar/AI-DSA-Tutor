import { memo } from "react";
import type { DifficultyAnalysis, TopicDifficulty } from "../types/api.js";

interface Props {
  data: DifficultyAnalysis | null;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 36, left: 44 };

const DIFFICULTY_COLORS: Record<TopicDifficulty, string> = {
  Easy: "var(--success)",
  Medium: "var(--warning)",
  Hard: "var(--danger)",
};

const ORDER: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

export const DifficultyChart = memo(function DifficultyChart({ data }: Props) {
  if (!data) return null;

  const buckets = ORDER.map(
    (d) => data.byDifficulty.find((b) => b.difficulty === d) ?? {
      difficulty: d,
      problemsTotal: 0,
      problemsSolved: 0,
      solveRate: 0,
      averageAttempts: 0,
      averageTimeMinutes: 0,
    },
  ).filter((b) => b.problemsTotal > 0);

  if (buckets.length === 0) {
    return <p className="muted">No problem data for difficulty comparison yet.</p>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const maxY = 100;

  const bars = buckets.map((b, i) => {
    const barW = innerW / buckets.length - 12;
    const x = PAD.left + i * (innerW / buckets.length) + 6;
    const h = (b.solveRate / maxY) * innerH;
    const y = PAD.top + innerH - h;
    return { ...b, x, y, h, barW };
  });

  const stretching = data.byTopic.filter((t) => t.alignment === "stretching");
  const tooEasy = data.byTopic.filter((t) => t.alignment === "too_easy");

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label="Solve rate by difficulty"
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = PAD.top + innerH - (tick / maxY) * innerH;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={y}
                x2={WIDTH - PAD.right}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {tick}%
              </text>
            </g>
          );
        })}
        {bars.map((b) => (
          <g key={b.difficulty}>
            <rect
              x={b.x}
              y={b.y}
              width={b.barW}
              height={b.h}
              rx="4"
              fill={DIFFICULTY_COLORS[b.difficulty]}
              opacity={0.9}
            />
            <text
              x={b.x + b.barW / 2}
              y={b.y - 6}
              textAnchor="middle"
              fill="var(--text)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {b.solveRate}%
            </text>
            <text
              x={b.x + b.barW / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="10"
            >
              {b.difficulty}
            </text>
            <title>
              {b.difficulty}: {b.problemsSolved}/{b.problemsTotal} solved · avg{" "}
              {b.averageAttempts} attempts
            </title>
          </g>
        ))}
      </svg>

      <p className="muted difficulty-summary">{data.summary}</p>

      {(stretching.length > 0 || tooEasy.length > 0) && (
        <ul className="alignment-list">
          {stretching.slice(0, 3).map((t) => (
            <li key={t.topicId}>
              <span className="alignment-tag stretching">stretch</span>
              {t.topicName} — try {t.recommendedDifficulty}
            </li>
          ))}
          {tooEasy.slice(0, 3).map((t) => (
            <li key={t.topicId}>
              <span className="alignment-tag too-easy">ease up</span>
              {t.topicName} — {t.solveRate}% solve rate
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
