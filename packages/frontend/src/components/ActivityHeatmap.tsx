import { useMemo, useState } from "react";
import type { Session } from "../types/api.js";

interface Props {
  dailyCounts: Map<string, number>;
  source: "leetcode" | "sessions";
  leetcodeUsername?: string;
}

const WEEKS = 26;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildCountsFromSessions(sessions: Session[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = new Date(s.date).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + (s.problemsSolved ?? 0));
  }
  return counts;
}

function level(count: number): number {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function computeStreak(counts: Map<string, number>, end: Date): number {
  let streak = 0;
  const today = end.toISOString().slice(0, 10);
  let streakCursor = new Date(end);

  while (true) {
    const key = streakCursor.toISOString().slice(0, 10);
    if ((counts.get(key) ?? 0) > 0) {
      streak++;
      streakCursor.setDate(streakCursor.getDate() - 1);
    } else if (key === today) {
      streakCursor.setDate(streakCursor.getDate() - 1);
      const yday = streakCursor.toISOString().slice(0, 10);
      if ((counts.get(yday) ?? 0) > 0) {
        streakCursor.setDate(streakCursor.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}

function formatCellDetail(key: string, count: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  const formatted = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatted} · ${count} problem${count !== 1 ? "s" : ""} solved`;
}

export function ActivityHeatmap({ dailyCounts, source, leetcodeUsername }: Props) {
  const [hovered, setHovered] = useState<{ key: string; count: number } | null>(null);

  const {
    weeks,
    totalProblems,
    activeDays,
    streak,
    monthLabels,
  } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const gridStart = new Date(end);
    gridStart.setDate(gridStart.getDate() - WEEKS * 7 + 1);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const computedWeeks: { key: string; count: number; date: Date }[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= end) {
      const week: { key: string; count: number; date: Date }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = cursor.toISOString().slice(0, 10);
        week.push({ key, count: dailyCounts.get(key) ?? 0, date: new Date(cursor) });
        cursor.setDate(cursor.getDate() + 1);
      }
      computedWeeks.push(week);
    }

    const windowKeys = computedWeeks.flat().map((cell) => cell.key);
    const labels: { weekIdx: number; label: string }[] = [];
    let lastMonth = -1;
    computedWeeks.forEach((week, i) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) {
        labels.push({ weekIdx: i, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    });

    return {
      weeks: computedWeeks,
      totalProblems: windowKeys.reduce((sum, key) => sum + (dailyCounts.get(key) ?? 0), 0),
      activeDays: windowKeys.filter((key) => (dailyCounts.get(key) ?? 0) > 0).length,
      streak: computeStreak(dailyCounts, end),
      monthLabels: labels,
    };
  }, [dailyCounts]);

  const sourceLabel =
    source === "leetcode" && leetcodeUsername
      ? `Data from LeetCode · @${leetcodeUsername}`
      : "Data from logged sessions";

  const selectCell = (cell: { key: string; count: number }) => {
    if (cell.count <= 0) return;
    setHovered({ key: cell.key, count: cell.count });
  };

  return (
    <div className="card">
      <h3>Activity heatmap</h3>
      <p className="muted" style={{ margin: "0 0 0.85rem", fontSize: "0.8rem" }}>
        {sourceLabel}
      </p>

      <div className="heatmap-stats">
        <div className="heatmap-stat">
          <span className="heatmap-stat-value">{totalProblems}</span>
          <span className="heatmap-stat-label">problems in 26 weeks</span>
        </div>
        <div className="heatmap-stat">
          <span className="heatmap-stat-value">{activeDays}</span>
          <span className="heatmap-stat-label">active days</span>
        </div>
        <div className="heatmap-stat">
          <span className="heatmap-stat-value" style={{ color: "var(--accent)" }}>{streak}d</span>
          <span className="heatmap-stat-label">current streak</span>
        </div>
      </div>

      <div className="heatmap-wrap">
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 14px)`, gap: "3px", marginBottom: "4px" }}>
          {weeks.map((_, i) => {
            const label = monthLabels.find((m) => m.weekIdx === i);
            return (
              <div
                key={i}
                className="heatmap-month-label"
                style={{ opacity: label ? 1 : 0 }}
              >
                {label?.label ?? ""}
              </div>
            );
          })}
        </div>

        <div
          className="heatmap"
          style={{
            gridTemplateRows: "repeat(7, 14px)",
            gridTemplateColumns: `repeat(${weeks.length}, 14px)`,
            gridAutoFlow: "column",
          }}
        >
          {weeks.flatMap((week, weekIdx) =>
            week.map((cell, dayIdx) => {
              const isActive = cell.count > 0;

              return (
                <div
                  key={cell.key}
                  className={`heatmap-cell${isActive ? " heatmap-cell--interactive" : ""}`}
                  data-level={level(cell.count)}
                  data-active={hovered?.key === cell.key ? "true" : undefined}
                  data-tip-row={dayIdx <= 1 ? "top" : undefined}
                  data-tip-col={weekIdx >= weeks.length - 2 ? "end" : undefined}
                  aria-label={isActive ? formatCellDetail(cell.key, cell.count) : undefined}
                  onMouseEnter={isActive ? () => selectCell(cell) : undefined}
                  onMouseLeave={isActive ? () => setHovered(null) : undefined}
                  onClick={isActive ? () => selectCell(cell) : undefined}
                >
                  {isActive && (
                    <span className="heatmap-cell-tooltip" aria-hidden="true">
                      {formatCellDetail(cell.key, cell.count)}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <div className="legend" style={{ marginTop: "0.85rem" }}>
        <span className="muted">Less</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="heatmap-cell" data-level={n} style={{ width: 12, height: 12 }} />
        ))}
        <span className="muted">More</span>
      </div>
    </div>
  );
}
