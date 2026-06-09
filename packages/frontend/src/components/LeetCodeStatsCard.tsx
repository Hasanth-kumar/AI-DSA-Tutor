import type { LeetCodeUserStats } from "../types/api.js";

interface Props {
  stats: LeetCodeUserStats | null;
  configured: boolean;
}

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"] as const;

export function LeetCodeStatsCard({ stats, configured }: Props) {
  if (!configured) {
    return (
      <div className="card">
        <h3>LeetCode profile</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Set <code>LEETCODE_USERNAME</code> in your <code>.env</code> to pull your
          public solve stats here.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card">
        <h3>LeetCode profile</h3>
        <p className="muted" style={{ margin: 0 }}>
          Loading LeetCode stats…
        </p>
      </div>
    );
  }

  const byDiff = DIFFICULTY_ORDER.map((d) =>
    stats.byDifficulty.find((b) => b.difficulty === d),
  ).filter(Boolean);

  const profileUrl = `https://leetcode.com/u/${stats.username}/`;

  return (
    <div className="card">
      <h3>
        LeetCode ·{" "}
        <a href={profileUrl} target="_blank" rel="noreferrer" className="link-muted">
          @{stats.username}
        </a>
      </h3>

      <div className="leetcode-hero">
        <div>
          <div className="stat-value">{stats.totalSolved}</div>
          <div className="stat-label">problems solved</div>
        </div>
        {stats.ranking != null && (
          <div>
            <div className="stat-value" style={{ fontSize: "1.35rem" }}>
              #{stats.ranking.toLocaleString()}
            </div>
            <div className="stat-label">global rank</div>
          </div>
        )}
      </div>

      {byDiff.length > 0 && (
        <div className="leetcode-breakdown">
          {byDiff.map((b) => (
            <div key={b!.difficulty} className="leetcode-diff-row">
              <span className={`diff-badge diff-${b!.difficulty.toLowerCase()}`}>
                {b!.difficulty}
              </span>
              <span className="leetcode-diff-count">{b!.solved}</span>
            </div>
          ))}
        </div>
      )}

      <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.75rem" }}>
        Cached up to 1h · updated {new Date(stats.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
