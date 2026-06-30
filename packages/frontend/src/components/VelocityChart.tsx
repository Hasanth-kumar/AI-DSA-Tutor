import { memo, useMemo } from "react";
import type { MasteryVelocityPoint } from "../types/api.js";

interface Props {
  data: MasteryVelocityPoint[];
}

const WIDTH = 520;
const HEIGHT = 168;
const PAD = { top: 26, right: 10, bottom: 18, left: 10 };

export const VelocityChart = memo(function VelocityChart({ data }: Props) {
  const chart = useMemo(() => {
    if (data.length === 0) return null;

    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const maxY = Math.max(...data.map((d) => d.problemsSolved), 1);

    const coords = data.map((d, i) => {
      const x = PAD.left + (i / Math.max(data.length - 1, 1)) * innerW;
      const y = PAD.top + innerH - (d.problemsSolved / maxY) * innerH;
      return { x, y, d };
    });

    const baseline = PAD.top + innerH;
    const areaPath = [
      `M${coords[0].x},${coords[0].y}`,
      ...coords.slice(1).map((c) => `L${c.x},${c.y}`),
      `L${coords[coords.length - 1].x},${baseline}`,
      `L${coords[0].x},${baseline}`,
      "Z",
    ].join(" ");

    const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const last = coords[coords.length - 1];

    const labels =
      data.length >= 5
        ? ["8w ago", "6w", "4w", "2w", "now"]
        : data.map((d) => d.weekStart.slice(5));

    return { areaPath, linePoints, last, labels };
  }, [data]);

  if (!chart) {
    return <p className="muted text-sm">No velocity data yet.</p>;
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg velocity-chart-v2"
        role="img"
        aria-label="Mastery velocity chart"
      >
        <line x1={PAD.left} y1={HEIGHT - PAD.bottom} x2={WIDTH - PAD.right} y2={HEIGHT - PAD.bottom} stroke="var(--border)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top + 50} x2={WIDTH - PAD.right} y2={PAD.top + 50} stroke="var(--border-soft)" strokeWidth="1" />
        <line x1={PAD.left} y1={PAD.top} x2={WIDTH - PAD.right} y2={PAD.top} stroke="var(--border-soft)" strokeWidth="1" />
        <path d={chart.areaPath} fill="var(--accent-soft)" />
        <polyline
          points={chart.linePoints}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={chart.last.x} cy={chart.last.y} r="4" fill="var(--accent)" />
        <circle cx={chart.last.x} cy={chart.last.y} r="8" fill="none" stroke="var(--accent-ring)" strokeWidth="2" />
      </svg>
      <div className="velocity-chart-labels">
        {chart.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </>
  );
});
