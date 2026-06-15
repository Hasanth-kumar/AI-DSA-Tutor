import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { chatMessages, chatThreads } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type ChatThreadRow = typeof chatThreads.$inferSelect;

export type ChatRole = "user" | "assistant";

const MAX_HISTORY = 40;

export class ChatRepository {
  constructor(private readonly db: SqliteDb) {}

  createThread(): ChatThreadRow {
    const id = randomUUID();
    const now = Date.now();

    this.db
      .insert(chatThreads)
      .values({
        id,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.findThreadById(id)!;
  }

  findThreadById(id: string): ChatThreadRow | null {
    return this.db.select().from(chatThreads).where(eq(chatThreads.id, id)).get() ?? null;
  }

  touchThread(id: string): void {
    this.db
      .update(chatThreads)
      .set({ updatedAt: Date.now() })
      .where(eq(chatThreads.id, id))
      .run();
  }

  addMessage(threadId: string, role: ChatRole, content: string): ChatMessageRow {
    const id = randomUUID();
    const now = Date.now();

    this.db
      .insert(chatMessages)
      .values({
        id,
        threadId,
        role,
        content,
        createdAt: now,
      })
      .run();

    this.touchThread(threadId);
    return this.findMessageById(id)!;
  }

  findMessageById(id: string): ChatMessageRow | null {
    return this.db.select().from(chatMessages).where(eq(chatMessages.id, id)).get() ?? null;
  }

  findMessagesByThread(threadId: string, limit = MAX_HISTORY): ChatMessageRow[] {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(limit)
      .all();
  }

  findFirstUserMessage(threadId: string): ChatMessageRow | null {
    return (
      this.db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.role, "user")))
        .orderBy(asc(chatMessages.createdAt))
        .limit(1)
        .get() ?? null
    );
  }

  updateMessageContent(id: string, content: string): ChatMessageRow | null {
    this.db.update(chatMessages).set({ content }).where(eq(chatMessages.id, id)).run();
    return this.findMessageById(id);
  }

  deleteMessage(id: string): boolean {
    const result = this.db.delete(chatMessages).where(eq(chatMessages.id, id)).run();
    return result.changes > 0;
  }

  deleteMessagesAfter(threadId: string, afterCreatedAt: number): void {
    this.db
      .delete(chatMessages)
      .where(and(eq(chatMessages.threadId, threadId), gt(chatMessages.createdAt, afterCreatedAt)))
      .run();
  }

  deleteMessagesFrom(threadId: string, fromCreatedAt: number): void {
    this.db
      .delete(chatMessages)
      .where(and(eq(chatMessages.threadId, threadId), gte(chatMessages.createdAt, fromCreatedAt)))
      .run();
  }

  listThreads(limit = 20): ChatThreadRow[] {
    return this.db
      .select()
      .from(chatThreads)
      .orderBy(desc(chatThreads.updatedAt))
      .limit(limit)
      .all();
  }

  deleteThread(id: string): boolean {
    this.db.delete(chatMessages).where(eq(chatMessages.threadId, id)).run();
    const result = this.db.delete(chatThreads).where(eq(chatThreads.id, id)).run();
    return result.changes > 0;
  }
}
