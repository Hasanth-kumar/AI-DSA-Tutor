import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function problemsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/problems", async (request, reply) => {
    const query = request.query as { topicId?: string; status?: string };
    let rows = ctx.problemRepo.findAll();

    if (query.topicId) {
      rows = rows.filter((p) => p.topicId === query.topicId);
    }
    if (query.status) {
      rows = rows.filter((p) => p.status === query.status);
    }

    return reply.send(serializeForJson({ problems: rows, count: rows.length }));
  });

  app.get<{ Params: { id: string } }>("/problems/:id", async (request, reply) => {
    const problem = ctx.problemRepo.findById(request.params.id);
    if (!problem) {
      return reply.status(404).send({ error: "Problem not found" });
    }
    return reply.send(serializeForJson({ problem }));
  });

  app.patch<{
    Params: { id: string };
    Body: {
      status?: string;
      attempts?: number;
      timeTaken?: number | null;
      notes?: string;
    };
  }>("/problems/:id", async (request, reply) => {
    const existing = ctx.problemRepo.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Problem not found" });
    }

    ctx.problemRepo.update(request.params.id, request.body);
    ctx.notionSync.markProblemDirty(request.params.id);

    if (ctx.notionSync.isConfigured()) {
      try {
        await ctx.notionSync.pushProblemToNotion(request.params.id);
      } catch (err) {
        request.log.warn({ err }, "Notion push failed after problem update");
      }
    }

    await ctx.planService.invalidateTodaysPlan();
    const problem = ctx.problemRepo.findById(request.params.id);
    return reply.send(serializeForJson({ problem }));
  });
}
