import type {
  AnalyticsDashboard,
  ChatThread,
  CoachModelList,
  CurriculumState,
  DayDetail,
  DifficultyAnalysis,
  HealthInfo,
  LeetCodeUserStats,
  LeetCodeActivity,
  MasteryVelocityPoint,
  PriorityScore,
  Problem,
  ProblemNote,
  RecallGradeResult,
  ResolveCompleteResult,
  ResolveOutcomeKind,
  ResolveQueueItem,
  ResolveQueueResponse,
  ResolveRating,
  ReviewCard,
  ReviewGradeResult,
  ReviewQueue,
  ScoreExplanation,
  SendChatResult,
  Session,
  SessionResult,
  StreakInfo,
  StudyPlan,
  SyncConflict,
  SyncStatusInfo,
  Topic,
  WarmupAnswer,
  WarmupQuestions,
  WeaknessEvidence,
  WeaknessTrendPoint,
  WeeklySummary,
} from "../types/api.js";
import { cachedFetch, invalidateCache } from "./cache.js";

const LOCAL_API_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_API_PORT = "3000";
const DEFAULT_API_ORIGIN = `http://127.0.0.1:${DEFAULT_API_PORT}`;

function rewriteLocalhostForLan(apiOrigin: string, pageHost: string): string {
  try {
    const apiUrl = new URL(apiOrigin);
    if (LOCAL_API_HOSTS.has(apiUrl.hostname) && !LOCAL_API_HOSTS.has(pageHost)) {
      apiUrl.hostname = pageHost;
      return apiUrl.origin;
    }
    return apiUrl.origin;
  } catch {
    return apiOrigin;
  }
}

/**
 * Always hit the Fastify API directly in dev (CORS enabled on backend).
 * Vite's /api proxy returns HTML in Cursor's embedded browser.
 */
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

  if (typeof window === "undefined") {
    return configured || DEFAULT_API_ORIGIN;
  }

  const pageHost = window.location.hostname;

  if (import.meta.env.DEV) {
    return rewriteLocalhostForLan(configured || DEFAULT_API_ORIGIN, pageHost);
  }

  // Production: same-origin when the API serves the built SPA (pnpm start /
  // study:prod). Set VITE_API_BASE_URL when the UI is hosted separately.
  return configured || window.location.origin;
}

const BASE = resolveApiBase();

/** Absolute API origin — used by the SSE EventSource connection. */
export const API_BASE = BASE;

function htmlInsteadOfJsonMessage(path: string): string {
  const target = `${BASE}${path}`;
  return (
    `API at ${target} returned HTML instead of JSON. ` +
    "Start the backend with `pnpm dev` (port 3000), then refresh."
  );
}

async function parseJsonBody<T>(res: Response, path: string): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }

  const text = await res.text();
  if (text.trimStart().startsWith("<!")) {
    throw new Error(htmlInsteadOfJsonMessage(path));
  }
  throw new Error(`Expected JSON from ${path}, got ${contentType || "unknown content type"}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/json",
      // Fastify rejects an empty body when Content-Type: application/json is
      // set, so only declare JSON when something is actually sent.
      ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      await parseJsonBody<never>(res, path);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return parseJsonBody<T>(res, path);
}

const CACHE_TTL = {
  topics: 60_000,
  problems: 60_000,
  sessions: 15_000,
  plan: 30_000,
  leetcode: 3_600_000,
  curriculum: 60_000,
  activity: 60_000,
  // Longer than the 60s plan poll so note refetches stay cache hits; the SSE
  // "note" event invalidates on real changes.
  note: 300_000,
  streak: 30_000,
  syncStatus: 30_000,
  review: 30_000,
  resolve: 30_000,
} as const;

export const api = {
  getHealth: () =>
    request<{ status: string }>("/health"),

  getTopics: () =>
    cachedFetch("topics", CACHE_TTL.topics, () =>
      request<{ topics: Topic[]; scores: PriorityScore[]; count: number }>("/api/topics"),
    ),

  getProblems: () =>
    cachedFetch("problems", CACHE_TTL.problems, () =>
      request<{ problems: Problem[]; count: number }>("/api/problems"),
    ),

  getPlan: () =>
    cachedFetch("plan", CACHE_TTL.plan, () => request<StudyPlan>("/api/plan/today")),

  getCurriculum: () =>
    cachedFetch("curriculum", CACHE_TTL.curriculum, () =>
      request<CurriculumState>("/api/curriculum"),
    ),

  updateCurriculum: (topicNames: string[]) =>
    request<CurriculumState>("/api/curriculum", {
      method: "PUT",
      body: JSON.stringify({ topicNames }),
    }).then((result) => {
      invalidateCache("curriculum");
      invalidateCache("plan");
      invalidateCache("dashboard");
      return result;
    }),

  setCurriculumActiveTopic: (topicId: string | null) =>
    request<CurriculumState>("/api/curriculum/active", {
      method: "PUT",
      body: JSON.stringify({ topicId }),
    }).then((result) => {
      invalidateCache("curriculum");
      invalidateCache("plan");
      invalidateCache("dashboard");
      return result;
    }),

  resetCurriculum: () =>
    request<CurriculumState>("/api/curriculum/reset", { method: "POST" }).then(
      (result) => {
        invalidateCache("curriculum");
        invalidateCache("plan");
        invalidateCache("dashboard");
        return result;
      },
    ),

  getSessions: (limit = 50) =>
    cachedFetch(`sessions:${limit}`, CACHE_TTL.sessions, () =>
      request<{ sessions: Session[]; count: number }>(`/api/session?limit=${limit}`),
    ),

  getDayDetail: (date: string) =>
    request<DayDetail>(`/api/session/day/${date}`),

  getSessionActivity: (days = 182) =>
    cachedFetch(`activity:${days}`, CACHE_TTL.activity, () =>
      request<{ dailyCounts: Record<string, number>; days: number }>(
        `/api/session/activity?days=${days}`,
      ),
    ),

  logSession: (body: {
    topicId: string;
    problemId?: string;
    problemsSolved?: number;
    studyDuration: number;
    productivityScore?: number;
    pushToNotion?: boolean;
    mistakeTag?: string | null;
    warmupGraded?: boolean;
  }) =>
    request<SessionResult>("/api/session", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((result) => {
      invalidateCache("sessions:");
      invalidateCache("activity:");
      invalidateCache("topics");
      invalidateCache("problems");
      invalidateCache("plan");
      invalidateCache("dashboard");
      invalidateCache("streak");
      return result;
    }),

  setMistake: (attemptId: string, input: { tags: string[]; usedCoach?: boolean }) =>
    request<{ attempt: { id: string; mistakeTag: string | null } }>(
      `/api/attempts/${attemptId}/mistake`,
      { method: "PATCH", body: JSON.stringify(input) },
    ).then((result) => {
      invalidateCache("topics");
      invalidateCache("dashboard");
      invalidateCache("activity:");
      return result;
    }),

  /** Returns null when no note matched this problem (404). */
  getProblemNote: (problemId: string): Promise<ProblemNote | null> =>
    cachedFetch(`problem-note:${problemId}`, CACHE_TTL.note, async () => {
      const path = `/api/problems/${problemId}/note`;
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const data = await parseJsonBody<{ note: ProblemNote }>(res, path);
      return data.note;
    }),

  createNoteTemplate: (problemId: string) =>
    request<{ created: boolean; path?: string }>(
      `/api/problems/${problemId}/note/template`,
      { method: "POST" },
    ),

  getWarmupQuestions: (topicId: string) =>
    request<WarmupQuestions>(`/api/warmup?topicId=${encodeURIComponent(topicId)}`),

  revealWarmupAnswer: (topicId: string, question: string) =>
    request<WarmupAnswer>("/api/warmup/answer", {
      method: "POST",
      body: JSON.stringify({ topicId, question }),
    }),

  gradeWarmup: (topicId: string, quality: number) =>
    request<RecallGradeResult>("/api/warmup/grade", {
      method: "POST",
      body: JSON.stringify({ topicId, quality }),
    }).then((result) => {
      invalidateCache("topics");
      invalidateCache("plan");
      invalidateCache("dashboard");
      return result;
    }),

  getReviewQueue: (cap = 20) =>
    cachedFetch(`review-queue:${cap}`, CACHE_TTL.review, () =>
      request<ReviewQueue>(`/api/review/queue?cap=${cap}`),
    ),

  getResolveQueue: () =>
    cachedFetch("resolve-queue", CACHE_TTL.resolve, () =>
      request<ResolveQueueResponse>("/api/resolve/queue"),
    ),

  completeResolve: (
    problemId: string,
    body: { outcome: ResolveOutcomeKind; timeTakenMin?: number | null; ratingOverride?: ResolveRating },
  ) =>
    request<ResolveCompleteResult>(`/api/resolve/${problemId}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((result) => {
      invalidateCache("resolve-queue");
      invalidateCache("plan");
      invalidateCache("dashboard");
      return result;
    }),

  skipResolve: (problemId: string) =>
    request<{ problemId: string; due: number }>(`/api/resolve/${problemId}/skip`, {
      method: "POST",
    }).then((result) => {
      invalidateCache("resolve-queue");
      invalidateCache("plan");
      return result;
    }),

  admitResolve: (problemId: string) =>
    request<ResolveQueueItem>(`/api/resolve/${problemId}/admit`, { method: "POST" }).then(
      (result) => {
        invalidateCache("resolve-queue");
        invalidateCache("plan");
        return result;
      },
    ),

  setResolveFlags: (problemId: string, flags: { retired?: boolean; suspended?: boolean }) =>
    request<ResolveQueueItem>(`/api/resolve/${problemId}`, {
      method: "PATCH",
      body: JSON.stringify(flags),
    }).then((result) => {
      invalidateCache("resolve-queue");
      invalidateCache("plan");
      return result;
    }),

  gradeReviewCard: (cardId: string, quality: number) =>
    request<ReviewGradeResult>("/api/review/grade", {
      method: "POST",
      body: JSON.stringify({ cardId, quality }),
    }).then((result) => {
      invalidateCache("topics");
      invalidateCache("plan");
      invalidateCache("dashboard");
      invalidateCache("review-queue:");
      return result;
    }),

  suspendReviewCard: (cardId: string) =>
    request<{ suspended: boolean }>(`/api/review/${cardId}/suspend`, {
      method: "POST",
    }).then((result) => {
      invalidateCache("review-queue:");
      return result;
    }),

  deleteReviewCard: (cardId: string) =>
    request<{ deleted: boolean }>(`/api/review/${cardId}`, {
      method: "DELETE",
    }).then((result) => {
      invalidateCache("review-queue:");
      return result;
    }),

  editReviewCard: (cardId: string, front: string, back: string) =>
    request<ReviewCard>(`/api/review/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify({ front, back }),
    }).then((result) => {
      invalidateCache("review-queue:");
      return result;
    }),

  getOrphanTopics: () =>
    request<{ orphans: Topic[]; count: number }>("/api/topics/orphans"),

  getScoreExplanation: (topicId: string) =>
    request<ScoreExplanation>(`/api/topics/${topicId}/score/explain`),

  getWeaknessEvidence: (topicId: string) =>
    request<WeaknessEvidence>(`/api/topics/${topicId}/weakness`),

  getRevisionQueue: () =>
    request<{ queue: Topic[]; count: number }>("/api/revision"),

  gradeRevision: (topicId: string, quality: number) =>
    request<RecallGradeResult>(`/api/revision/${topicId}/grade`, {
      method: "POST",
      body: JSON.stringify({ quality }),
    }).then((result) => {
      invalidateCache("topics");
      invalidateCache("plan");
      invalidateCache("dashboard");
      return result;
    }),

  triggerSync: () =>
    request<{ topics: number; problems: number; sessions: number; syncedAt: string }>(
      "/api/sync",
      { method: "POST" },
    ).then((result) => {
      invalidateCache();
      return result;
    }),

  getSyncStatus: () =>
    cachedFetch("sync-status", CACHE_TTL.syncStatus, () =>
      request<SyncStatusInfo>("/api/sync/status"),
    ),

  getSyncConflicts: () =>
    request<{ conflicts: SyncConflict[]; count: number }>("/api/sync/conflicts"),

  resolveSyncConflict: (id: string, winner: "local" | "remote") =>
    request<{ resolved: boolean; winner: string }>(
      `/api/sync/conflicts/${id}/resolve`,
      { method: "POST", body: JSON.stringify({ winner }) },
    ).then((result) => {
      invalidateCache();
      return result;
    }),

  getFullHealth: () =>
    cachedFetch("health:full", 20_000, () => request<HealthInfo>("/health")),

  getDashboard: (weeks = 8) =>
    cachedFetch(`dashboard:${weeks}`, 25_000, () =>
      request<AnalyticsDashboard>(`/api/analytics/dashboard?weeks=${weeks}`),
    ),

  getSummary: () => request<WeeklySummary>("/api/analytics/summary"),

  getStreak: () =>
    cachedFetch("streak", CACHE_TTL.streak, () =>
      request<StreakInfo>("/api/analytics/streak"),
    ),

  getVelocity: (weeks = 8) =>
    request<{ weekly: MasteryVelocityPoint[] }>(
      `/api/analytics/mastery-velocity?weeks=${weeks}`,
    ),

  getWeaknessTrend: (weeks = 8) =>
    request<{ trend: WeaknessTrendPoint[] }>(
      `/api/analytics/weakness-trend?weeks=${weeks}`,
    ),

  getDifficulty: () => request<DifficultyAnalysis>("/api/analytics/difficulty"),

  /** Returns null when LEETCODE_USERNAME is not set (503). */
  async getLeetCodeStats(): Promise<LeetCodeUserStats | null> {
    return cachedFetch("leetcode:stats", CACHE_TTL.leetcode, async () => {
    const path = "/api/integrations/leetcode/stats";
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    if (res.status === 503) return null;
    if (!res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        await parseJsonBody<never>(res, path);
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    return parseJsonBody<LeetCodeUserStats>(res, path);
    });
  },

  /** Returns null when LEETCODE_USERNAME is not set (503). */
  async getLeetCodeActivity(): Promise<LeetCodeActivity | null> {
    return cachedFetch("leetcode:activity", CACHE_TTL.leetcode, async () => {
    const path = "/api/integrations/leetcode/activity";
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    if (res.status === 503) return null;
    if (!res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        await parseJsonBody<never>(res, path);
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    return parseJsonBody<LeetCodeActivity>(res, path);
    });
  },

  sendChatMessage: (body: {
    threadId?: string;
    message: string;
    problemId?: string;
    includeContext?: boolean;
    directMode?: boolean;
    model?: string;
  }) =>
    request<SendChatResult>("/api/coaching/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getCoachModels: () => request<CoachModelList>("/api/coaching/models"),

  getChatThread: (threadId: string) =>
    request<ChatThread>(`/api/coaching/chat/${threadId}`),

  clearChatThread: (threadId: string) =>
    request<void>(`/api/coaching/chat/${threadId}`, { method: "DELETE" }),
};
