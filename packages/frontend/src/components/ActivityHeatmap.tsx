import { useMemo, useState } from "react";
import { CalendarIcon, EmptyState } from "./EmptyState.js";
import type { Session } from "../types/api.js";

interface Props {
  dailyCounts: Map<string, number>;
  source: "leetcode" | "sessions";
  leetcodeUsername?: string;
  /** Heatmap drill-down (5.4): click an active day to see its sessions/problems. */
  onDayClick?: (dateKey: string) => void;
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
  const streakCursor = new Date(end);

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

export function ActivityHeatmap({ dailyCounts, source, leetcodeUsername, onDayClick }: Props) {
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

  const clickCell = (cell: { key: string; count: number }) => {
    if (cell.count <= 0) return;
    selectCell(cell);
    onDayClick?.(cell.key);
  };

  if (totalProblems === 0) {
    return (
      <div className="card">
        <h3 className="card-section-title">Activity heatmap</h3>
        <EmptyState
          icon={<CalendarIcon />}
          title="No activity in the last 26 weeks"
          hint={
            source === "leetcode"
              ? "Solve a problem on LeetCode and it will show up here."
              : "Log your first session and it will show up here."
          }
        />
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="card-section-title">Activity heatmap</h3>
      <p className="muted text-sm mt-0 mb-3">
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
              const tipProps = {
                "data-level": level(cell.count),
                "data-active": hovered?.key === cell.key ? ("true" as const) : undefined,
                "data-tip-row": dayIdx <= 1 ? ("top" as const) : undefined,
                "data-tip-col": weekIdx >= weeks.length - 2 ? ("end" as const) : undefined,
              };

              // Days with activity are real buttons (keyboard + screen-reader
              // reachable); empty days stay inert divs.
              return isActive ? (
                <button
                  key={cell.key}
                  type="button"
                  className="heatmap-cell heatmap-cell--interactive"
                  aria-label={formatCellDetail(cell.key, cell.count)}
                  onMouseEnter={() => selectCell(cell)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => selectCell(cell)}
                  onBlur={() => setHovered(null)}
                  onClick={() => clickCell(cell)}
                  {...tipProps}
                >
                  <span className="heatmap-cell-tooltip" aria-hidden="true">
                    {formatCellDetail(cell.key, cell.count)}
                  </span>
                </button>
              ) : (
                <div key={cell.key} className="heatmap-cell" {...tipProps} />
              );
            }),
          )}
        </div>
      </div>

      <div className="legend mt-3" aria-hidden="true">
        <span className="muted">Less</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="heatmap-cell" data-level={n} />
        ))}
        <span className="muted">More</span>
      </div>
    </div>
  );
}
