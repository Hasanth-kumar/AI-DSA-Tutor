import { useCallback } from "react";
import { api } from "../api/client.js";
import {
  SkeletonChartCard,
  SkeletonListCard,
  SkeletonStatCards,
} from "../components/Skeleton.js";
import { DifficultyChart } from "../components/DifficultyChart.js";
import { LeetCodeStatsCard } from "../components/LeetCodeStatsCard.js";
import { StatsCards } from "../components/StatsCards.js";
import { CurriculumPanel } from "../components/CurriculumPanel.js";
import { TodayPlan } from "../components/TodayPlan.js";
import { VelocityChart } from "../components/VelocityChart.js";
import { WeaknessChart } from "../components/WeaknessChart.js";
import { SyncConflictsPanel } from "../components/SyncConflictsPanel.js";
import { WeaknessDrilldown } from "../components/WeaknessDrilldown.js";
import { usePolling } from "../hooks/usePolling.js";
import type {
  DifficultyAnalysis,
  LeetCodeUserStats,
  MasteryVelocityPoint,
  StudyPlan,
  WeaknessTrendPoint,
  WeeklySummary,
} from "../types/api.js";

const DASHBOARD_WEEKS = 8;
const DASHBOARD_POLL_MS = 30_000;
const LEETCODE_POLL_MS = 3_600_000;

export function OverviewPage() {
  const fetchDashboard = useCallback(
    () => api.getDashboard(DASHBOARD_WEEKS),
    [],
  );

  const {
    data: dashboard,
    error,
    loading,
    refresh,
  } = usePolling(fetchDashboard, DASHBOARD_POLL_MS);

  const fetchLeetCode = useCallback(() => api.getLeetCodeStats(), []);
  const {
    data: leetcodeData,
    settled: leetcodeSettled,
  } = usePolling(fetchLeetCode, LEETCODE_POLL_MS, { initialLoading: false });

  const summary: WeeklySummary | null = dashboard?.summary ?? null;
  const plan: StudyPlan | null = dashboard?.plan ?? null;
  const velocity: MasteryVelocityPoint[] = dashboard?.velocity.weekly ?? [];
  const weakness: WeaknessTrendPoint[] = dashboard?.weaknessTrend ?? [];
  const difficulty: DifficultyAnalysis | null = dashboard?.difficulty ?? null;
  const leetcode: LeetCodeUserStats | null = leetcodeData ?? null;
  const leetcodeUnconfigured = leetcodeSettled && leetcodeData === null;

  const refreshPlanAndDashboard = useCallback(() => {
    void refresh();
  }, [refresh]);

  if (loading && !dashboard) {
    return (
      <div>
        <header className="page-header">
          <div className="page-header-text">
            <h2>Overview</h2>
            <p>Your learning command center</p>
          </div>
        </header>
        <div className="grid" aria-busy="true">
          <SkeletonStatCards />
          <div className="grid grid-2">
            <SkeletonListCard rows={3} />
            <SkeletonListCard rows={3} />
          </div>
          <SkeletonChartCard />
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div className="page-header-text">
          <h2>Overview</h2>
          <p>Your learning command center</p>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid">
        <StatsCards summary={summary} />

        <SyncConflictsPanel />

        <div className="grid grid-2">
          <TodayPlan plan={plan} />
          <CurriculumPanel onChanged={refreshPlanAndDashboard} />
        </div>

        <div className="card">
          <h3 className="card-section-title">Weakness trend</h3>
          <WeaknessChart data={weakness} />
          <WeaknessDrilldown weakTopics={summary?.weakTopics ?? []} />
        </div>

        <div className="grid grid-2">
          <div className="card">
            <h3 className="card-section-title">Difficulty analysis</h3>
            <DifficultyChart data={difficulty} />
          </div>
          <LeetCodeStatsCard stats={leetcode} configured={!leetcodeUnconfigured} />
        </div>

        <div className="card">
          <h3 className="card-section-title">Mastery velocity (problems/hr)</h3>
          <VelocityChart data={velocity} />
        </div>
      </div>
    </div>
  );
}
