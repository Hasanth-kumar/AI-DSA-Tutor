import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { isFullPage, mapProblemPage } from "./mappers.js";

export interface ProblemDuplicateGroup {
  key: string;
  keeper: PageObjectResponse;
  duplicates: PageObjectResponse[];
  mergedTopicIds: string[];
}

export function normalizeLeetCodeUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, "").trim();
}

export function problemDedupeKey(page: PageObjectResponse): string {
  const mapped = mapProblemPage(page);
  if (mapped.leetcodeLink) return normalizeLeetCodeUrl(mapped.leetcodeLink);
  return `name:${mapped.name.toLowerCase().trim()}`;
}

function getRelationIds(page: PageObjectResponse, name: string): string[] {
  const prop = page.properties[name];
  if (prop?.type === "relation") {
    return prop.relation.map((r) => r.id);
  }
  return [];
}

function getStatusScore(page: PageObjectResponse): number {
  const prop = page.properties.Status;
  const status =
    prop?.type === "status"
      ? prop.status?.name
      : prop?.type === "select"
        ? prop.select?.name
        : undefined;
  if (status === "Solved") return 100;
  if (status === "Revision needed" || status === "Attempted") return 50;
  return 0;
}

function scoreProblemPage(page: PageObjectResponse): number {
  const mapped = mapProblemPage(page);
  let score = getStatusScore(page);
  score += (mapped.attempts ?? 0) * 10;
  if (mapped.notes) score += 20;
  if (mapped.topicId) score += 5;
  return score;
}

export function groupProblemDuplicates(
  pages: PageObjectResponse[],
): ProblemDuplicateGroup[] {
  const groups = new Map<string, PageObjectResponse[]>();

  for (const page of pages) {
    const key = problemDedupeKey(page);
    const list = groups.get(key) ?? [];
    list.push(page);
    groups.set(key, list);
  }

  const duplicateGroups: ProblemDuplicateGroup[] = [];

  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue;

    const sorted = [...rows].sort((a, b) => {
      const scoreDiff = scoreProblemPage(b) - scoreProblemPage(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Date.parse(a.created_time) - Date.parse(b.created_time);
    });

    const keeper = sorted[0]!;
    const duplicates = sorted.slice(1);
    const mergedTopicIds = [
      ...new Set(rows.flatMap((page) => getRelationIds(page, "Topic"))),
    ];

    duplicateGroups.push({ key, keeper, duplicates, mergedTopicIds });
  }

  return duplicateGroups;
}

export function countUniqueProblems(pages: PageObjectResponse[]): number {
  return new Set(pages.map(problemDedupeKey)).size;
}

export function filterFullProblemPages(
  pages: unknown[],
): PageObjectResponse[] {
  return pages.filter(
    (page): page is PageObjectResponse =>
      typeof page === "object" &&
      page !== null &&
      isFullPage(page as { object: string }),
  );
}

export function describeDuplicateGroup(group: ProblemDuplicateGroup): string {
  const name = mapProblemPage(group.keeper).name;
  return `${name} — keep 1, archive ${group.duplicates.length}, merge ${group.mergedTopicIds.length} topic(s)`;
}
