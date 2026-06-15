import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { ActivityHeatmap } from "../components/ActivityHeatmap.js";
import { Skeleton, SkeletonLines } from "../components/Skeleton.js";
import { mistakeTagLabel } from "../types/api.js";
import type { DayDetail } from "../types/api.js";

export function ActivityPage() {
  const [dailyCounts, setDailyCounts] = useState<Map<string, number>>(new Map());
  const [source, setSource] = useState<"leetcode" | "sessions">("sessions");
  const [leetcodeUsername, setLeetcodeUsername] = useState<string | undefined>();
  const [leetcodeUnconfigured, setLeetcodeUnconfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const openDay = useCallback((dateKey: string) => {
    setDayLoading(true);
    api
      .getDayDetail(dateKey)
      .then(setDayDetail)
      .catch(() => setDayDetail({ date: dateKey, sessions: [], problems: [] }))
      .finally(() => setDayLoading(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const leetcodeActivity = await api.getLeetCodeActivity();

      if (leetcodeActivity) {
        setDailyCounts(new Map(Object.entries(leetcodeActivity.dailyCounts)));
        setSource("leetcode");
        setLeetcodeUsername(leetcodeActivity.username);
        setLeetcodeUnconfigured(false);
      } else {
        const activity = await api.getSessionActivity(182);
        setDailyCounts(new Map(Object.entries(activity.dailyCounts)));
        setSource("sessions");
        setLeetcodeUsername(undefined);
        setLeetcodeUnconfigured(true);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <header className="page-header">
        <div className="page-header-text">
          <h2>Activity</h2>
          <p>
            {source === "leetcode"
              ? "Daily accepted submissions from your LeetCode profile."
              : "LeetCode-style heatmap from locally logged sessions."}
          </p>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {leetcodeUnconfigured && !error && (
        <div className="info-banner">
          Set <code>LEETCODE_USERNAME</code> in your <code>.env</code> to pull real solve counts from LeetCode.
        </div>
      )}
      {loading ? (
        <div className="card" aria-busy="true">
          <Skeleton variant="title" width={160} />
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
            <Skeleton variant="stat" />
            <Skeleton variant="stat" />
            <Skeleton variant="stat" />
          </div>
          <Skeleton variant="block" height={130} />
        </div>
      ) : (
        <ActivityHeatmap
          dailyCounts={dailyCounts}
          source={source}
          leetcodeUsername={leetcodeUsername}
          onDayClick={openDay}
        />
      )}

      {(dayDetail || dayLoading) && (
        <div className="card day-detail mt-4">
          <div className="day-detail-header">
            <h3 className="card-title m-0">
              {dayDetail
                ? new Date(`${dayDetail.date}T12:00:00Z`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : "Loading day…"}
            </h3>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDayDetail(null)}
            >
              ✕ Close
            </button>
          </div>

          {dayLoading && !dayDetail && <SkeletonLines lines={3} />}

          {dayDetail && dayDetail.sessions.length === 0 && dayDetail.problems.length === 0 && (
            <p className="muted text-sm">
              No locally logged sessions for this day
              {source === "leetcode" ? " (activity came from LeetCode)" : ""}.
            </p>
          )}

          {dayDetail && dayDetail.sessions.length > 0 && (
            <>
              <div className="day-detail-label">Sessions</div>
              <ul className="day-detail-list">
                {dayDetail.sessions.map((s) => (
                  <li key={s.id}>
                    <span>{s.topicName ?? "Unknown topic"}</span>
                    <span className="muted">
                      {s.studyDuration ?? 0}m · {s.problemsSolved} solved ·{" "}
                      {s.productivityScore ?? "—"}/100
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {dayDetail && dayDetail.problems.length > 0 && (
            <>
              <div className="day-detail-label">Problems</div>
              <ul className="day-detail-list">
                {dayDetail.problems.map((p, i) => (
                  <li key={`${p.problemId}-${i}`}>
                    <span>{p.problemName}</span>
                    <span className="muted">
                      {p.timeTaken != null ? `${p.timeTaken}m` : ""}
                      {p.mistakeTags.length > 0
                        ? ` · ${p.mistakeTags.map(mistakeTagLabel).join(", ")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
