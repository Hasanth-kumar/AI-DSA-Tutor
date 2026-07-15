import { memo } from "react";
import type { MasteryVelocityPoint } from "../types/api.js";

interface Props {
  data: MasteryVelocityPoint[];
}

export const VelocityChart = memo(function VelocityChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="muted text-sm">No velocity data yet.</p>;
  }

  const max = Math.max(...data.map((point) => point.problemsSolved), 1);

  return (
    <div className="velocity-bars" role="img" aria-label="Mastery velocity by week">
      {data.map((point, index) => (
        <div className="velocity-bar-column" key={point.weekStart}>
          <span className="velocity-bar-value">{point.problemsSolved}</span>
          <span
            className={`velocity-bar${index === data.length - 1 ? " velocity-bar--current" : ""}`}
            style={{ height: `${Math.max(8, (point.problemsSolved / max) * 100)}%` }}
          />
          <span className="velocity-bar-week">w{index + 1}</span>
        </div>
      ))}
    </div>
  );
});
