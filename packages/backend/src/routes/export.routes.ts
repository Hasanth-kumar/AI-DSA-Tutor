import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function exportRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  /** Full JSON dump (5.1): topics, problems, sessions, attempts, notes metadata, SM-2 state. */
  app.get("/export", async (_request, reply) => {
    const topics = ctx.topicRepo.findAll();
    const problems = ctx.problemRepo.findAll();
    const sessions = ctx.sessionRepo.findAll(10_000);
    const attempts = ctx.attemptRepo.findRecent(10_000);
    const notes = ctx.noteRepo.findAll().map((n) => ({
      path: n.path,
      title: n.title,
      problemId: n.problemId,
      topicId: n.topicId,
      matchedBy: n.matchedBy,
      contentHash: n.contentHash,
      updatedAt: n.updatedAt,
    }));

    return reply.send(
      serializeForJson({
        exportedAt: new Date().toISOString(),
        version: 1,
        counts: {
          topics: topics.length,
          problems: problems.length,
          sessions: sessions.length,
          attempts: attempts.length,
          notes: notes.length,
        },
        topics,
        problems,
        sessions,
        attempts,
        notes,
      }),
    );
  });

  app.post("/backup", async (_request, reply) => {
    try {
      const result = await ctx.backupService.backupNow();
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Backup failed";
      return reply.status(500).send({ error: message });
    }
  });

  app.get("/backup", async (_request, reply) => {
    return reply.send({ backups: ctx.backupService.listBackups() });
  });
}
