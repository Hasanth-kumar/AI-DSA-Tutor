import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { ActivityHeatmap } from "../components/ActivityHeatmap.js";
import { PageHeader } from "../components/PageHeader.js";
import { Skeleton } from "../components/Skeleton.js";
import { usePolling } from "../hooks/usePolling.js";

const ACTIVITY_DAYS = 365;
const SESSION_POLL_MS = 60_000;

function computeStreakFromCounts(counts: Map<string, number>): number {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const today = cursor.toISOString().slice(0, 10);

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if ((counts.get(key) ?? 0) > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (key === today) {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function productivityClass(score: number | null): string {
  if (score == null) return "";
  if (score >= 75) return "activity-pct--success";
  if (score >= 55) return "activity-pct--warning";
  return "activity-pct--muted";
}

export function ActivityPage() {
  const [dailyCounts, setDailyCounts] = useState<Map<string, number>>(new Map());
  const [source, setSource] = useState<"leetcode" | "sessions">("sessions");
  const [leetcodeUsername, setLeetcodeUsername] = useState<string | undefined>();
  const [leetcodeUnconfigured, setLeetcodeUnconfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(
    () => api.getSessions(200).then((r) => r.sessions),
    [],
  );
  const { data: sessions } = usePolling(fetchSessions, SESSION_POLL_MS, {
    initialLoading: false,
  });

  const fetchTopics = useCallback(
    () => api.getTopics().then((r) => r.topics),
    [],
  );
  const { data: topics } = usePolling(fetchTopics, SESSION_POLL_MS, {
    initialLoading: false,
  });

  const topicNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of topics ?? []) map.set(t.id, t.name);
    return map;
  }, [topics]);

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
        const activity = await api.getSessionActivity(ACTIVITY_DAYS);
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

  const stats = useMemo(() => {
    const keys = [...dailyCounts.keys()];
    const activeDays = keys.filter((k) => (dailyCounts.get(k) ?? 0) > 0).length;
    const streak = computeStreakFromCounts(dailyCounts);
    const totalSessions = sessions?.length ?? 0;
    return { activeDays, streak, totalSessions };
  }, [dailyCounts, sessions]);

  const recentSessions = (sessions ?? []).slice(0, 8);

  return (
    <div className="page-content">
      <PageHeader title="Activity" />

      {error && <div className="error-banner">{error}</div>}
      {leetcodeUnconfigured && !error && (
        <div className="info-banner">
          Set <code>LEETCODE_USERNAME</code> in your <code>.env</code> for LeetCode heatmap data.
        </div>
      )}

      {!loading && (
        <div className="activity-stats">
          <div className="overview-stat-card">
            <div className="overview-stat-label">Active days</div>
            <div className="overview-stat-value">{stats.activeDays}</div>
          </div>
          <div className="overview-stat-card">
            <div className="overview-stat-label">Total sessions</div>
            <div className="overview-stat-value">{stats.totalSessions}</div>
          </div>
          <div className="overview-stat-card">
            <div className="overview-stat-label">Current streak</div>
            <div className="overview-stat-value" style={{ color: "var(--accent)" }}>
              {stats.streak} days
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <section className="panel-v2" aria-busy="true" style={{ marginBottom: "1.4rem" }}>
          <Skeleton variant="title" width={160} />
          <Skeleton variant="block" height={130} />
        </section>
      ) : (
        <ActivityHeatmap
          dailyCounts={dailyCounts}
          source={source}
          leetcodeUsername={leetcodeUsername}
          weeks={53}
          variant="design"
        />
      )}

      {!loading && recentSessions.length > 0 && (
        <section className="panel-v2" style={{ marginTop: "1.4rem" }}>
          <h3 className="panel-v2-title" style={{ marginBottom: "1.1rem" }}>
            Recent sessions
          </h3>
          <div className="activity-recent">
            {recentSessions.map((s) => (
              <div key={s.id} className="activity-recent-row">
                <span className="activity-recent-date">
                  {new Date(s.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="activity-recent-topic">
                  {s.topicId ? (topicNames.get(s.topicId) ?? "Study session") : "Study session"}
                </span>
                <span className="activity-recent-meta">
                  {s.studyDuration ?? 0} min · {s.problemsSolved ?? 0} solved
                </span>
                <span
                  className={`activity-recent-pct ${productivityClass(s.productivityScore)}`}
                >
                  {s.productivityScore ?? "—"}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
