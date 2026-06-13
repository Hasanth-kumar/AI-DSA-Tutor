import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type { ProblemStatus, TopicDifficulty } from "@dsa/database/notion-types";

/** Notion Problems DB property names (with common aliases). */
export const PROBLEM_PROPERTIES = {
  Difficulty: ["Difficulty"],
  LeetCodeLink: ["LeetCodeLink", "LeetCode Link"],
  Status: ["Status"],
  Attempts: ["Attempts"],
  TimeTaken: ["Time Taken", "TimeTaken"],
  Topic: ["Topic"],
  Notes: ["Notes"],
} as const;

export const PROBLEM_STATUSES = [
  "Not started",
  "Solved",
  "Revision needed",
] as const satisfies readonly ProblemStatus[];

const STATUS_ALIASES: Record<string, ProblemStatus> = {
  "not started": "Not started",
  "Not started": "Not started",
  "Not Started": "Not started",
  unsolved: "Not started",
  Unsolved: "Not started",
  solved: "Solved",
  Solved: "Solved",
  "revision needed": "Revision needed",
  "Revision needed": "Revision needed",
  "Revision Needed": "Revision needed",
  attempted: "Revision needed",
  Attempted: "Revision needed",
};

/** Map any legacy or Notion label to the canonical problem status. */
export function normalizeProblemStatus(
  raw: string | null | undefined,
): ProblemStatus {
  if (!raw) return "Not started";
  return STATUS_ALIASES[raw] ?? STATUS_ALIASES[raw.toLowerCase()] ?? "Not started";
}

/** Canonical status string for Notion select writes. */
export function toNotionProblemStatus(status: string): ProblemStatus {
  return normalizeProblemStatus(status);
}

export function isProblemSolved(status: string | null | undefined): boolean {
  return normalizeProblemStatus(status) === "Solved";
}

export function isProblemNotStarted(status: string | null | undefined): boolean {
  return normalizeProblemStatus(status) === "Not started";
}

const DIFFICULTY_ALIASES: Record<string, TopicDifficulty> = {
  easy: "Easy",
  Easy: "Easy",
  medium: "Medium",
  Medium: "Medium",
  hard: "Hard",
  Hard: "Hard",
};

export function normalizeDifficulty(
  raw: string | null | undefined,
): TopicDifficulty | undefined {
  if (!raw) return undefined;
  return DIFFICULTY_ALIASES[raw] ?? DIFFICULTY_ALIASES[raw.toLowerCase()];
}

/** Canonical select label for Notion topic difficulty (lowercase options). */
export function toNotionTopicDifficulty(difficulty: TopicDifficulty): string {
  return difficulty.toLowerCase();
}

/** Calendar date in local timezone — avoids UTC off-by-one in Notion date fields. */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function findPageProperty(
  page: PageObjectResponse,
  candidates: readonly string[],
): PageObjectResponse["properties"][string] | undefined {
  for (const name of candidates) {
    const prop = page.properties[name];
    if (prop) return prop;
  }
  const lowered = new Set(candidates.map((c) => c.toLowerCase()));
  for (const [key, prop] of Object.entries(page.properties)) {
    if (lowered.has(key.toLowerCase())) return prop;
  }
  return undefined;
}

export function resolveSchemaPropertyName(
  schema: Record<string, { type?: string }>,
  candidates: readonly string[],
): string | undefined {
  for (const name of candidates) {
    if (schema[name]) return name;
  }
  const lowered = new Set(candidates.map((c) => c.toLowerCase()));
  return Object.keys(schema).find((key) => lowered.has(key.toLowerCase()));
}
