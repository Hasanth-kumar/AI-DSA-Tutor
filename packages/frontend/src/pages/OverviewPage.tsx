import { useCallback } from "react";
import { api } from "../api/client.js";
import { LeetCodeStatsCard } from "../components/LeetCodeStatsCard.js";
import { OverviewDifficultyBars } from "../components/OverviewDifficultyBars.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  SkeletonChartCard,
  SkeletonListCard,
} from "../components/Skeleton.js";
import { VelocityChart } from "../components/VelocityChart.js";
import { WeakAreasBars } from "../components/WeakAreasBars.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { usePolling } from "../hooks/usePolling.js";
import type {
  DifficultyAnalysis,
  LeetCodeUserStats,
  MasteryVelocityPoint,
  WeeklySummary,
} from "../types/api.js";

const DASHBOARD_WEEKS = 8;
const DASHBOARD_POLL_MS = 30_000;
const LEETCODE_POLL_MS = 3_600_000;

function StatNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const display = useCountUp(value, decimals);
  return <>{display.toFixed(decimals)}</>;
}

function OverviewStatCard({
  label,
  value,
  suffix,
  hint,
  hintClass,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint: string;
  hintClass?: string;
}) {
  return (
    <div className="overview-stat-card">
      <div className="overview-stat-label">{label}</div>
      <div className="overview-stat-value">
        <StatNumber value={value} decimals={suffix === "h" ? 1 : 0} />
        {suffix && <span className="overview-stat-suffix">{suffix}</span>}
      </div>
      <div className={`overview-stat-hint${hintClass ? ` ${hintClass}` : ""}`}>{hint}</div>
    </div>
  );
}

export function OverviewPage() {
  const fetchDashboard = useCallback(
    () => api.getDashboard(DASHBOARD_WEEKS),
    [],
  );

  const { data: dashboard, error, loading } = usePolling(fetchDashboard, DASHBOARD_POLL_MS);

  const fetchLeetCode = useCallback(() => api.getLeetCodeStats(), []);
  const { data: leetcodeData, settled: leetcodeSettled } = usePolling(
    fetchLeetCode,
    LEETCODE_POLL_MS,
    { initialLoading: false },
  );

  const summary: WeeklySummary | null = dashboard?.summary ?? null;
  const velocity: MasteryVelocityPoint[] = dashboard?.velocity.weekly ?? [];
  const difficulty: DifficultyAnalysis | null = dashboard?.difficulty ?? null;
  const leetcode: LeetCodeUserStats | null = leetcodeData ?? null;
  const leetcodeUnconfigured = leetcodeSettled && leetcodeData === null;

  const studyHours = summary ? Math.round((summary.totalStudyMinutes / 60) * 10) / 10 : 0;
  const dailyAvg = summary
    ? (summary.totalStudyMinutes / 60 / 30).toFixed(1)
    : "0";

  const problemsHint =
    summary?.velocityTrend === "up"
      ? "▲ pace improving"
      : summary?.velocityTrend === "down"
        ? "▼ pace slowing"
        : "steady this month";

  const productivityHint =
    summary && summary.averageProductivity >= 70
      ? "▲ steady focus"
      : "room to sharpen focus";

  if (loading && !dashboard) {
    return (
      <div className="page-content">
        <PageHeader title="Overview" subtitle="Loading…" />
        <div aria-busy="true">
          <SkeletonListCard rows={4} />
          <SkeletonChartCard />
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageHeader
        title="Overview"
        subtitle="Your last 30 days, measured."
      />

      {error && <div className="error-banner">{error}</div>}

      {summary && (
        <div className="overview-stats">
          <OverviewStatCard
            label="Problems solved"
            value={summary.problemsSolved}
            hint={problemsHint}
            hintClass={summary.velocityTrend === "up" ? "overview-stat-hint--up" : undefined}
          />
          <OverviewStatCard
            label="Study time"
            value={studyHours}
            suffix="h"
            hint={`~${dailyAvg} h / day`}
          />
          <OverviewStatCard
            label="Productivity"
            value={summary.averageProductivity}
            suffix="%"
            hint={productivityHint}
            hintClass={summary.averageProductivity >= 70 ? "overview-stat-hint--up" : undefined}
          />
          <OverviewStatCard
            label="Longest streak"
            value={summary.longestStreakDays}
            suffix="d"
            hint={`current ${summary.currentStreakDays} days`}
          />
        </div>
      )}

      <div className="overview-grid-2">
        <section>
          <div className="panel-v2-header">
            <h3 className="panel-v2-title">Mastery velocity</h3>
            <span className="panel-v2-meta">problems / week</span>
          </div>
          <VelocityChart data={velocity} />
        </section>

        <section>
          <div className="panel-v2-header">
            <h3 className="panel-v2-title">By difficulty</h3>
          </div>
          <OverviewDifficultyBars data={difficulty} />
        </section>
      </div>

      <div className="overview-grid-2 overview-grid-2--flip">
        <section>
          <div className="panel-v2-header">
            <h3 className="panel-v2-title">Weak areas</h3>
          </div>
          <WeakAreasBars topics={summary?.weakTopics ?? []} />
        </section>

        <LeetCodeStatsCard stats={leetcode} configured={!leetcodeUnconfigured} />
      </div>
    </div>
  );
}
