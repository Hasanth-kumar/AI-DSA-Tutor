import { EmptyState, PlugIcon } from "./EmptyState.js";
import { Skeleton, SkeletonLines } from "./Skeleton.js";
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
        <h3 className="card-section-title">LeetCode profile</h3>
        <EmptyState
          icon={<PlugIcon />}
          title="Not connected"
          hint="Set LEETCODE_USERNAME in your .env to pull your public solve stats here."
        />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card" aria-busy="true">
        <h3 className="card-section-title">LeetCode profile</h3>
        <Skeleton variant="stat" />
        <SkeletonLines lines={3} />
      </div>
    );
  }

  const byDiff = DIFFICULTY_ORDER.map((d) =>
    stats.byDifficulty.find((b) => b.difficulty === d),
  ).filter(Boolean);

  const profileUrl = `https://leetcode.com/u/${stats.username}/`;

  return (
    <div className="card">
      <h3 className="card-section-title">
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

      <p className="muted text-xs mt-3 mb-0">
        Cached up to 1h · updated {new Date(stats.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
