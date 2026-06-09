import { memo } from "react";
import type { MasteryVelocityPoint } from "../types/api.js";

interface Props {
  data: MasteryVelocityPoint[];
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

export const VelocityChart = memo(function VelocityChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="muted">No velocity data yet.</p>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const maxY = Math.max(...data.map((d) => d.problemsPerHour), 1);

  const points = data
    .map((d, i) => {
      const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
      const y = PAD.top + innerH - (d.problemsPerHour / maxY) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" role="img" aria-label="Mastery velocity chart">
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        points={points}
      />
      {data.map((d, i) => {
        const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
        const y = PAD.top + innerH - (d.problemsPerHour / maxY) * innerH;
        return (
          <g key={d.weekStart}>
            <circle cx={x} cy={y} r="4" fill="var(--accent)" />
            <text
              x={x}
              y={HEIGHT - 6}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="9"
            >
              {d.weekStart.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
