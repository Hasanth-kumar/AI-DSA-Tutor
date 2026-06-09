import { memo } from "react";
import type { WeaknessTrendPoint } from "../types/api.js";

interface Props {
  data: WeaknessTrendPoint[];
}

const WIDTH = 600;
const HEIGHT = 180;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

export const WeaknessChart = memo(function WeaknessChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="muted">No weakness trend data yet.</p>;
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const maxY = Math.max(...data.map((d) => d.weakTopicCount), 1);

  const bars = data.map((d, i) => {
    const barW = innerW / data.length - 6;
    const x = PAD.left + i * (innerW / data.length) + 3;
    const h = (d.weakTopicCount / maxY) * innerH;
    const y = PAD.top + innerH - h;
    return { ...d, x, y, h, barW };
  });

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" role="img" aria-label="Weakness trend chart">
      {bars.map((b) => (
        <g key={b.weekStart}>
          <rect
            x={b.x}
            y={b.y}
            width={b.barW}
            height={b.h}
            rx="3"
            fill="var(--warning)"
            opacity={0.85}
          />
          <text
            x={b.x + b.barW / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="9"
          >
            {b.weekStart.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
});
