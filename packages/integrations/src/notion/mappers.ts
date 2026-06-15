import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type {
  NotionProblem,
  NotionSession,
  NotionTopic,
} from "@dsa/database/notion-types";
import {
  findPageProperty,
  normalizeDifficulty,
  normalizeProblemStatus,
  PROBLEM_PROPERTIES,
  TOPIC_SCHEDULE_PROPERTIES,
} from "./problem-fields.js";

function getTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  if (titleProp?.type === "title") {
    return titleProp.title.map((t) => t.plain_text).join("") || "Untitled";
  }
  return "Untitled";
}

function getRichTextProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): string | undefined {
  if (prop?.type === "rich_text") {
    return prop.rich_text.map((t) => t.plain_text).join("") || undefined;
  }
  return undefined;
}

function getUrlProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): string | undefined {
  if (prop?.type === "url" && prop.url) return prop.url;
  return undefined;
}

function getSelectProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): string | undefined {
  if (prop?.type === "select" && prop.select) return prop.select.name;
  return undefined;
}

function getStatus(page: PageObjectResponse, name: string): string | undefined {
  const prop = page.properties[name];
  if (prop?.type === "status" && prop.status) return prop.status.name;
  if (prop?.type === "select" && prop.select) return prop.select.name;
  return undefined;
}

function getMultiSelectFirst(page: PageObjectResponse, name: string): string | undefined {
  const prop = page.properties[name];
  if (prop?.type === "multi_select" && prop.multi_select.length > 0) {
    return prop.multi_select[0]?.name;
  }
  if (prop?.type === "select" && prop.select) return prop.select.name;
  return undefined;
}

function getNumberProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): number | undefined {
  if (prop?.type === "number" && prop.number != null) return prop.number;
  return undefined;
}

function getCheckbox(page: PageObjectResponse, name: string): boolean {
  const prop = page.properties[name];
  if (prop?.type === "checkbox") return prop.checkbox;
  return false;
}

function getDate(page: PageObjectResponse, name: string): Date | null {
  const prop = page.properties[name];
  return getDateFromProp(prop);
}

function getDateFromProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): Date | null {
  if (prop?.type === "date" && prop.date?.start) {
    return new Date(prop.date.start);
  }
  return null;
}

function getRelationIdsFromProp(
  prop: PageObjectResponse["properties"][string] | undefined,
): string[] {
  if (prop?.type === "relation") {
    return prop.relation.map((r) => r.id);
  }
  return [];
}

/** Map Notion pages using property names from your DSA databases. */
export function mapTopicPage(page: PageObjectResponse): NotionTopic {
  const statusMap: Record<string, NotionTopic["status"]> = {
    "Not Started": "Not started",
    "In Progress": "In progress",
    Completed: "Mastered",
    "Not started": "Not started",
    "In progress": "In progress",
    Mastered: "Mastered",
  };
  return {
    id: page.id,
    name: getTitle(page),
    difficulty: normalizeDifficulty(getMultiSelectFirst(page, "Difficulty")),
    status: statusMap[getStatus(page, "Status") ?? ""] as NotionTopic["status"],
    revisionCount: getNumberProp(page.properties["Revision Count"]) ?? 0,
    lastRevised: getDate(page, "Last Revised"),
    confidence: getNumberProp(page.properties.Confidence) ?? 0,
    isWeakArea: getCheckbox(page, "Weak Area"),
    prerequisites: getRelationIdsFromProp(
      findPageProperty(page, ["Prerequisites"]),
    ),
    nextRevisionAt: getDateFromProp(
      findPageProperty(page, TOPIC_SCHEDULE_PROPERTIES.NextReview),
    ),
    sm2Interval: getNumberProp(
      findPageProperty(page, TOPIC_SCHEDULE_PROPERTIES.Sm2Interval),
    ),
    sm2Efactor: getNumberProp(
      findPageProperty(page, TOPIC_SCHEDULE_PROPERTIES.Sm2EaseFactor),
    ),
  };
}

export function mapProblemPage(page: PageObjectResponse): NotionProblem {
  const difficultyProp = findPageProperty(page, PROBLEM_PROPERTIES.Difficulty);
  const statusProp = findPageProperty(page, PROBLEM_PROPERTIES.Status);
  const leetcodeProp = findPageProperty(page, PROBLEM_PROPERTIES.LeetCodeLink);
  const attemptsProp = findPageProperty(page, PROBLEM_PROPERTIES.Attempts);
  const timeTakenProp = findPageProperty(page, PROBLEM_PROPERTIES.TimeTaken);
  const notesProp = findPageProperty(page, PROBLEM_PROPERTIES.Notes);
  const topicProp = findPageProperty(page, PROBLEM_PROPERTIES.Topic);

  const rawStatus = getSelectProp(statusProp) ?? getStatus(page, "Status");
  const rawDifficulty = getSelectProp(difficultyProp);

  return {
    id: page.id,
    name: getTitle(page),
    topicId: getRelationIdsFromProp(topicProp)[0],
    difficulty: normalizeDifficulty(rawDifficulty),
    leetcodeLink:
      getUrlProp(leetcodeProp) ??
      getUrlProp(findPageProperty(page, ["LeetCode Link"])) ??
      getRichTextProp(leetcodeProp),
    status: normalizeProblemStatus(rawStatus),
    attempts: getNumberProp(attemptsProp) ?? 0,
    timeTaken: getNumberProp(timeTakenProp),
    notes: getRichTextProp(notesProp),
  };
}

export function mapSessionPage(page: PageObjectResponse): NotionSession {
  const topicIds = getRelationIdsFromProp(findPageProperty(page, ["Topic"]));
  return {
    id: page.id,
    date: getDate(page, "Date") ?? new Date(),
    topicId: topicIds[0],
    problemsSolved: getNumberProp(page.properties["Problems Solved"]) ?? 0,
    studyDuration: getNumberProp(page.properties["Study Duration"]),
    productivityScore: getNumberProp(page.properties["Productivity Score"]),
  };
}

export function isFullPage(
  result: { object: string },
): result is PageObjectResponse {
  return result.object === "page" && "properties" in result;
}
