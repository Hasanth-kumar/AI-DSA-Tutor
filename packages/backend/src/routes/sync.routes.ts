import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function syncRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post("/sync", async (request, reply) => {
    if (!ctx.notionSync.isConfigured()) {
      return reply.status(503).send({ error: "Notion is not configured" });
    }
    try {
      const result = await ctx.notionSync.sync();
      await ctx.planService.invalidateTodaysPlan();
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Sync failed",
      });
    }
  });

  app.post("/sync/pull", async (request, reply) => {
    if (!ctx.notionSync.isConfigured()) {
      return reply.status(503).send({ error: "Notion is not configured" });
    }
    try {
      const result = await ctx.notionSync.pullFromNotion();
      await ctx.planService.invalidateTodaysPlan();
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Pull failed",
      });
    }
  });
}
