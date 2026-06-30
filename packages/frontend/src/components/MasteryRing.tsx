import type { ReactNode } from "react";

interface Props {
  percent: number;
  label?: string;
  sublabel?: ReactNode;
  size?: number;
}

const CIRCUMFERENCE = 351.86;

export function MasteryRing({
  percent,
  label = "mastered",
  sublabel,
  size = 148,
}: Props) {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <div className="mastery-ring-wrap">
      <div className="mastery-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 148 148" aria-hidden>
          <circle
            cx="74"
            cy="74"
            r="56"
            fill="none"
            stroke="var(--border)"
            strokeWidth="9"
          />
          <circle
            cx="74"
            cy="74"
            r="56"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 74 74)"
            className="mastery-ring-progress"
          />
        </svg>
        <div className="mastery-ring-center">
          <span className="mastery-ring-value">{Math.round(clamped)}%</span>
          <span className="mastery-ring-label">{label}</span>
        </div>
      </div>
      {sublabel && <div className="mastery-ring-sublabel">{sublabel}</div>}
    </div>
  );
}
