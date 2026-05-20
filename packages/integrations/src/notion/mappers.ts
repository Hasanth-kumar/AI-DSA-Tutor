import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import type {
  NotionProblem,
  NotionSession,
  NotionTopic,
} from "@dsa/database/notion-types";

function getTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  if (titleProp?.type === "title") {
    return titleProp.title.map((t) => t.plain_text).join("") || "Untitled";
  }
  return "Untitled";
}

function getRichText(page: PageObjectResponse, name: string): string | undefined {
  const prop = page.properties[name];
  if (prop?.type === "rich_text") {
    return prop.rich_text.map((t) => t.plain_text).join("") || undefined;
  }
  return undefined;
}

function getSelect(page: PageObjectResponse, name: string): string | undefined {
  const prop = page.properties[name];
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

function getNumber(page: PageObjectResponse, name: string): number | undefined {
  const prop = page.properties[name];
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
  if (prop?.type === "date" && prop.date?.start) {
    return new Date(prop.date.start);
  }
  return null;
}

function getRelationIds(page: PageObjectResponse, name: string): string[] {
  const prop = page.properties[name];
  if (prop?.type === "relation") {
    return prop.relation.map((r) => r.id);
  }
  return [];
}

/** Map Notion pages using common property names; adjust names to match your DB. */
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
    difficulty: getMultiSelectFirst(page, "Difficulty") as NotionTopic["difficulty"],
    status: statusMap[getStatus(page, "Status") ?? ""] as NotionTopic["status"],
    revisionCount: getNumber(page, "Revision Count") ?? 0,
    lastRevised: getDate(page, "Last Revised"),
    confidence: getNumber(page, "Confidence") ?? 0,
    isWeakArea: getCheckbox(page, "Weak Area"),
    prerequisites: getRelationIds(page, "Prerequisites"),
  };
}

export function mapProblemPage(page: PageObjectResponse): NotionProblem {
  const topicIds = getRelationIds(page, "Topic");
  return {
    id: page.id,
    name: getTitle(page),
    topicId: topicIds[0],
    difficulty: getSelect(page, "Difficulty") as NotionProblem["difficulty"],
    leetcodeLink: getRichText(page, "LeetCode Link"),
    status: getSelect(page, "Status") as NotionProblem["status"],
    attempts: getNumber(page, "Attempts") ?? 0,
    timeTaken: getNumber(page, "Time Taken"),
    notes: getRichText(page, "Notes"),
  };
}

export function mapSessionPage(page: PageObjectResponse): NotionSession {
  const topicIds = getRelationIds(page, "Topic");
  return {
    id: page.id,
    date: getDate(page, "Date") ?? new Date(),
    topicId: topicIds[0],
    problemsSolved: getNumber(page, "Problems Solved") ?? 0,
    studyDuration: getNumber(page, "Study Duration"),
    productivityScore: getNumber(page, "Productivity Score"),
  };
}

export function isFullPage(
  result: { object: string },
): result is PageObjectResponse {
  return result.object === "page" && "properties" in result;
}
