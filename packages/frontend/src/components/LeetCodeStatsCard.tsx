import { EmptyState, PlugIcon } from "./EmptyState.js";
import { Skeleton, SkeletonLines } from "./Skeleton.js";
import type { LeetCodeUserStats } from "../types/api.js";

interface Props {
  stats: LeetCodeUserStats | null;
  configured: boolean;
}

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"] as const;
const COLORS: Record<string, string> = {
  Easy: "var(--success)",
  Medium: "var(--warning)",
  Hard: "var(--danger)",
};

export function LeetCodeStatsCard({ stats, configured }: Props) {
  if (!configured) {
    return (
      <section className="panel-v2">
        <h3 className="panel-v2-title">LeetCode</h3>
        <EmptyState
          icon={<PlugIcon />}
          title="Not connected"
          hint="Set LEETCODE_USERNAME in your .env to pull your public solve stats here."
        />
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="panel-v2" aria-busy="true">
        <h3 className="panel-v2-title">LeetCode</h3>
        <Skeleton variant="stat" />
        <SkeletonLines lines={3} />
      </section>
    );
  }

  const byDiff = DIFFICULTY_ORDER.map((d) =>
    stats.byDifficulty.find((b) => b.difficulty === d),
  ).filter(Boolean);

  const maxSolved = Math.max(...byDiff.map((b) => b!.solved), 1);

  return (
    <section className="panel-v2">
      <div className="panel-v2-header">
        <h3 className="panel-v2-title">LeetCode</h3>
        {stats.ranking != null && (
          <span className="panel-v2-meta">rank #{stats.ranking.toLocaleString()}</span>
        )}
      </div>

      <div className="leetcode-v2">
        <div className="leetcode-v2-hero">
          <div className="leetcode-v2-total">{stats.totalSolved}</div>
          <div className="leetcode-v2-label">total solved</div>
        </div>

        <div className="leetcode-v2-bars">
          {byDiff.map((b) => (
            <div key={b!.difficulty} className="leetcode-v2-row">
              <span className="leetcode-v2-diff" style={{ color: COLORS[b!.difficulty] }}>
                {b!.difficulty}
              </span>
              <div className="leetcode-v2-track">
                <div
                  className="leetcode-v2-fill"
                  style={{
                    width: `${(b!.solved / maxSolved) * 100}%`,
                    background: COLORS[b!.difficulty],
                  }}
                />
              </div>
              <span className="leetcode-v2-count">{b!.solved}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
