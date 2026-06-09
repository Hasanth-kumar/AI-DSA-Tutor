import type {
  AnalyticsDashboard,
  ChatThread,
  CurriculumState,
  DifficultyAnalysis,
  LeetCodeUserStats,
  LeetCodeActivity,
  MasteryVelocityPoint,
  PriorityScore,
  Problem,
  SendChatResult,
  Session,
  SessionResult,
  StreakInfo,
  StudyPlan,
  Topic,
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

  return configured;
}

const BASE = resolveApiBase();

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
      "Content-Type": "application/json",
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

  getSessionActivity: (days = 182) =>
    cachedFetch(`activity:${days}`, CACHE_TTL.activity, () =>
      request<{ dailyCounts: Record<string, number>; days: number }>(
        `/api/session/activity?days=${days}`,
      ),
    ),

  logSession: (body: {
    topicId: string;
    problemId?: string;
    problemsSolved: number;
    studyDuration: number;
    productivityScore: number;
    pushToNotion?: boolean;
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
      return result;
    }),

  getDashboard: (weeks = 8) =>
    cachedFetch(`dashboard:${weeks}`, 25_000, () =>
      request<AnalyticsDashboard>(`/api/analytics/dashboard?weeks=${weeks}`),
    ),

  getSummary: () => request<WeeklySummary>("/api/analytics/summary"),

  getStreak: () => request<StreakInfo>("/api/analytics/streak"),

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
  }) =>
    request<SendChatResult>("/api/coaching/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getChatThread: (threadId: string) =>
    request<ChatThread>(`/api/coaching/chat/${threadId}`),

  clearChatThread: (threadId: string) =>
    request<void>(`/api/coaching/chat/${threadId}`, { method: "DELETE" }),
};
