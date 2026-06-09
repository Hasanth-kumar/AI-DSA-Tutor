import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { ActivityHeatmap } from "../components/ActivityHeatmap.js";

export function ActivityPage() {
  const [dailyCounts, setDailyCounts] = useState<Map<string, number>>(new Map());
  const [source, setSource] = useState<"leetcode" | "sessions">("sessions");
  const [leetcodeUsername, setLeetcodeUsername] = useState<string | undefined>();
  const [leetcodeUnconfigured, setLeetcodeUnconfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        <div className="error-banner" style={{ background: "var(--bg-surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
          Set <code>LEETCODE_USERNAME</code> in your <code>.env</code> to pull real solve counts from LeetCode.
        </div>
      )}
      {loading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Loading activity…</p>
        </div>
      ) : (
        <ActivityHeatmap
          dailyCounts={dailyCounts}
          source={source}
          leetcodeUsername={leetcodeUsername}
        />
      )}
    </div>
  );
}
