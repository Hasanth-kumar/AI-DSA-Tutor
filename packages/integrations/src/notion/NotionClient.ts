import { Client } from "@notionhq/client";
import type { QueryDatabaseResponse } from "@notionhq/client/build/src/api-endpoints.js";
import PQueue from "p-queue";
import type { SessionNotionCreate, TopicNotionUpdate } from "./NotionWriter.js";

export interface NotionConfig {
  token: string;
  topicsDbId: string;
  problemsDbId: string;
  sessionsDbId: string;
}

type DatabaseQueryFilter = Parameters<Client["databases"]["query"]>[0]["filter"];

export class NotionClient {
  private readonly client: Client;
  private readonly requestQueue: PQueue;
  private readonly titlePropertyByDb = new Map<string, string>();

  constructor(private readonly config: NotionConfig) {
    this.client = new Client({ auth: config.token });
    this.requestQueue = new PQueue({ intervalCap: 3, interval: 1000 });
  }

  get databaseIds() {
    return {
      topics: this.config.topicsDbId,
      problems: this.config.problemsDbId,
      sessions: this.config.sessionsDbId,
    };
  }

  async ping(): Promise<void> {
    await this.requestQueue.add(() => this.client.users.me({}));
  }

  async queryDatabase(
    databaseId: string,
    filter?: DatabaseQueryFilter,
  ): Promise<QueryDatabaseResponse["results"]> {
    const pages: QueryDatabaseResponse["results"] = [];
    let cursor: string | undefined;

    do {
      const response = (await this.requestQueue.add(() =>
        this.client.databases.query({
          database_id: databaseId,
          filter,
          start_cursor: cursor,
        }),
      )) as QueryDatabaseResponse;

      pages.push(...response.results);
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return pages;
  }

  async updateTopic(pageId: string, update: TopicNotionUpdate): Promise<void> {
    const properties: Record<string, unknown> = {};
    const statusMap: Record<string, string> = {
      "Not started": "Not Started",
      "In progress": "In Progress",
      Mastered: "Completed",
      "Not Started": "Not Started",
      "In Progress": "In Progress",
      Completed: "Completed",
    };

    if (update.confidence != null) {
      properties.Confidence = { number: update.confidence };
    }
    if (update.revisionCount != null) {
      properties["Revision Count"] = { number: update.revisionCount };
    }
    if (update.lastRevised != null) {
      properties["Last Revised"] = {
        date: { start: update.lastRevised.toISOString().slice(0, 10) },
      };
    }
    if (update.isWeakArea != null) {
      properties["Weak Area"] = { checkbox: update.isWeakArea };
    }
    if (update.status != null) {
      properties.Status = { status: { name: statusMap[update.status] ?? update.status } };
    }
    if (update.difficulty != null) {
      properties.Difficulty = { multi_select: [{ name: update.difficulty }] };
    }

    if (Object.keys(properties).length === 0) return;

    await this.requestQueue.add(() =>
      this.client.pages.update({
        page_id: pageId,
        properties: properties as Parameters<Client["pages"]["update"]>[0]["properties"],
      }),
    );
  }

  async createSession(
    databaseId: string,
    session: SessionNotionCreate,
  ): Promise<string> {
    const titleProperty = await this.getTitlePropertyName(databaseId);
    const response = await this.requestQueue.add(async () =>
      this.client.pages.create({
        parent: { database_id: databaseId },
        properties: {
          [titleProperty]: {
            title: [
              {
                text: {
                  content: `Study — ${session.date.toISOString().slice(0, 10)}`,
                },
              },
            ],
          },
          Date: {
            date: { start: session.date.toISOString().slice(0, 10) },
          },
          Topic: {
            relation: [{ id: session.topicId }],
          },
          "Problems Solved": { number: session.problemsSolved },
          "Study Duration": { number: session.studyDuration },
          "Productivity Score": { number: session.productivityScore },
        },
      }),
    );
    if (!response?.id) {
      throw new Error("Notion did not return a page id for the new session");
    }
    return response.id;
  }

  private async getTitlePropertyName(databaseId: string): Promise<string> {
    const cached = this.titlePropertyByDb.get(databaseId);
    if (cached) return cached;

    const db = (await this.requestQueue.add(() =>
      this.client.databases.retrieve({ database_id: databaseId }),
    )) as { properties?: Record<string, { type?: string }> };
    const entry = Object.entries(db.properties ?? {}).find(
      ([, prop]) => prop?.type === "title",
    );
    if (!entry) {
      throw new Error(`No title property found in Notion database ${databaseId}`);
    }

    const [name] = entry;
    this.titlePropertyByDb.set(databaseId, name);
    return name;
  }
}

export function createNotionClient(
  config: Partial<NotionConfig> & { token?: string },
): NotionClient {
  const { token, topicsDbId, problemsDbId, sessionsDbId } = config;
  if (!token || !topicsDbId || !problemsDbId || !sessionsDbId) {
    throw new Error(
      "Notion is not configured. Set NOTION_TOKEN and all NOTION_*_DB_ID values in .env",
    );
  }
  return new NotionClient({ token, topicsDbId, problemsDbId, sessionsDbId });
}
