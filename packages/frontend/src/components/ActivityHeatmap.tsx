import { useMemo, useState } from "react";
import { EmptyState, HeatmapIllustration } from "./EmptyState.js";
import type { Session } from "../types/api.js";

interface Props {
  dailyCounts: Map<string, number>;
  source: "leetcode" | "sessions";
  leetcodeUsername?: string;
  onDayClick?: (dateKey: string) => void;
  weeks?: number;
  variant?: "default" | "design";
}

const DEFAULT_WEEKS = 26;
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

function formatCountLabel(count: number, source: Props["source"]): string {
  if (source === "leetcode") {
    return `${count} accepted submission${count !== 1 ? "s" : ""}`;
  }
  return `${count} problem${count !== 1 ? "s" : ""} solved`;
}

function formatCellDetail(
  key: string,
  count: number,
  source: Props["source"],
): string {
  const date = new Date(`${key}T12:00:00Z`);
  const formatted = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatted} · ${formatCountLabel(count, source)}`;
}

export function ActivityHeatmap({
  dailyCounts,
  source,
  leetcodeUsername,
  onDayClick,
  weeks = DEFAULT_WEEKS,
  variant = "default",
}: Props) {
  const [hovered, setHovered] = useState<{ key: string; count: number } | null>(null);
  const isDesign = variant === "design";
  const cellSize = isDesign ? 12 : 14;

  const {
    gridWeeks,
    totalProblems,
    activeDays,
    streak,
    monthLabels,
  } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const gridStart = new Date(end);
    gridStart.setDate(gridStart.getDate() - weeks * 7 + 1);
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
      gridWeeks: computedWeeks,
      totalProblems: windowKeys.reduce((sum, key) => sum + (dailyCounts.get(key) ?? 0), 0),
      activeDays: windowKeys.filter((key) => (dailyCounts.get(key) ?? 0) > 0).length,
      streak: computeStreak(dailyCounts, end),
      monthLabels: labels,
    };
  }, [dailyCounts, weeks]);

  const selectCell = (cell: { key: string; count: number }) => {
    if (cell.count <= 0) return;
    setHovered({ key: cell.key, count: cell.count });
  };

  const clickCell = (cell: { key: string; count: number }) => {
    if (cell.count <= 0) return;
    selectCell(cell);
    onDayClick?.(cell.key);
  };

  if (totalProblems === 0 && activeDays === 0) {
    return (
      <section className={isDesign ? undefined : "card"}>
        <h3 className={isDesign ? "panel-v2-title" : "card-section-title"}>Study heatmap</h3>
        <EmptyState
          illustration={<HeatmapIllustration />}
          title={`No activity in the last ${weeks} weeks`}
          hint={
            source === "leetcode"
              ? "Get an accepted submission on LeetCode and it will show up here."
              : "Log your first session and it will show up here."
          }
        />
      </section>
    );
  }

  const wrapperClass = isDesign ? undefined : "card";

  return (
    <section className={wrapperClass}>
      <div className={isDesign ? "panel-v2-header" : undefined}>
        <h3 className={isDesign ? "panel-v2-title" : "card-section-title"}>
          {isDesign ? "Past 12 months" : "Study heatmap"}
        </h3>
        {isDesign ? (
          <span className="panel-v2-meta">
            {source === "leetcode" && leetcodeUsername
              ? `LeetCode · @${leetcodeUsername}`
              : "Logged sessions"}
          </span>
        ) : null}
      </div>

      {!isDesign && (
        <p className="muted text-sm mt-0 mb-3">
          {source === "leetcode" && leetcodeUsername
            ? `Accepted submissions from LeetCode · @${leetcodeUsername}`
            : "Problems solved from logged sessions"}
        </p>
      )}

      {!isDesign && (
        <div className="heatmap-stats">
          <div className="heatmap-stat">
            <span className="heatmap-stat-value">{totalProblems}</span>
            <span className="heatmap-stat-label">
              {source === "leetcode" ? "submissions in window" : "problems in window"}
            </span>
          </div>
          <div className="heatmap-stat">
            <span className="heatmap-stat-value">{activeDays}</span>
            <span className="heatmap-stat-label">active days</span>
          </div>
          <div className="heatmap-stat">
            <span className="heatmap-stat-value" style={{ color: "var(--accent)" }}>
              {streak}d
            </span>
            <span className="heatmap-stat-label">current streak</span>
          </div>
        </div>
      )}

      <div className="heatmap-wrap">
        {!isDesign && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridWeeks.length}, ${cellSize}px)`,
              gap: "3px",
              marginBottom: "4px",
            }}
          >
            {gridWeeks.map((_, i) => {
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
        )}

        {isDesign ? (
          <div className="heatmap-grid-v2">
            {gridWeeks.map((week, weekIdx) => (
              <div key={week[0]?.key ?? weekIdx} className="heatmap-week-v2">
                {week.map((cell, dayIdx) => {
                  const isActive = cell.count > 0;
                  const lvl = level(cell.count);
                  const tipProps = {
                    "data-level": lvl,
                    "data-active": hovered?.key === cell.key ? ("true" as const) : undefined,
                    "data-tip-row": dayIdx <= 1 ? ("top" as const) : undefined,
                    "data-tip-col": weekIdx >= gridWeeks.length - 2 ? ("end" as const) : undefined,
                  };

                  return isActive ? (
                    <button
                      key={cell.key}
                      type="button"
                      className={`heatmap-cell-v2 heatmap-cell-v2--${lvl} heatmap-cell--interactive`}
                      aria-label={formatCellDetail(cell.key, cell.count, source)}
                      onMouseEnter={() => selectCell(cell)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => selectCell(cell)}
                      onBlur={() => setHovered(null)}
                      onClick={() => clickCell(cell)}
                      {...tipProps}
                    >
                      <span className="heatmap-cell-tooltip" aria-hidden="true">
                        {formatCellDetail(cell.key, cell.count, source)}
                      </span>
                    </button>
                  ) : (
                    <div
                      key={cell.key}
                      className="heatmap-cell-v2 heatmap-cell-v2--0"
                      {...tipProps}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="heatmap"
            style={{
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
              gridTemplateColumns: `repeat(${gridWeeks.length}, ${cellSize}px)`,
              gridAutoFlow: "column",
            }}
          >
            {gridWeeks.flatMap((week, weekIdx) =>
              week.map((cell, dayIdx) => {
                const isActive = cell.count > 0;
                const lvl = level(cell.count);
                const tipProps = {
                  "data-level": lvl,
                  "data-active": hovered?.key === cell.key ? ("true" as const) : undefined,
                  "data-tip-row": dayIdx <= 1 ? ("top" as const) : undefined,
                  "data-tip-col": weekIdx >= gridWeeks.length - 2 ? ("end" as const) : undefined,
                };

                return isActive ? (
                  <button
                    key={cell.key}
                    type="button"
                    className="heatmap-cell heatmap-cell--interactive"
                    aria-label={formatCellDetail(cell.key, cell.count, source)}
                    onMouseEnter={() => selectCell(cell)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => selectCell(cell)}
                    onBlur={() => setHovered(null)}
                    onClick={() => clickCell(cell)}
                    {...tipProps}
                  >
                    <span className="heatmap-cell-tooltip" aria-hidden="true">
                      {formatCellDetail(cell.key, cell.count, source)}
                    </span>
                  </button>
                ) : (
                  <div key={cell.key} className="heatmap-cell" {...tipProps} />
                );
              }),
            )}
          </div>
        )}
      </div>

      {!isDesign && (
        <div className="legend mt-3" aria-hidden="true">
          <span className="muted">Less</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="heatmap-cell" data-level={n} />
          ))}
          <span className="muted">More</span>
        </div>
      )}
    </section>
  );
}
