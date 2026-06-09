import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function integrationsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get<{ Querystring: { refresh?: string } }>(
    "/integrations/leetcode/stats",
    async (request, reply) => {
      if (!ctx.leetcodeService.isConfigured()) {
        return reply.status(503).send({ error: "LeetCode is not configured" });
      }

      try {
        const forceRefresh = request.query.refresh === "true";
        const stats = await ctx.leetcodeService.getStats(forceRefresh);
        return reply.send(serializeForJson(stats));
      } catch (err) {
        const message = err instanceof Error ? err.message : "LeetCode fetch failed";
        return reply.status(502).send({ error: message });
      }
    },
  );

  app.get<{ Querystring: { refresh?: string } }>(
    "/integrations/leetcode/activity",
    async (request, reply) => {
      if (!ctx.leetcodeService.isConfigured()) {
        return reply.status(503).send({ error: "LeetCode is not configured" });
      }

      try {
        const forceRefresh = request.query.refresh === "true";
        const activity = await ctx.leetcodeService.getActivity(forceRefresh);
        return reply.send(serializeForJson(activity));
      } catch (err) {
        const message = err instanceof Error ? err.message : "LeetCode fetch failed";
        return reply.status(502).send({ error: message });
      }
    },
  );

  app.post("/sync/github", async (request, reply) => {
    if (!ctx.githubSync.isConfigured()) {
      return reply.status(503).send({ error: "GitHub is not configured" });
    }

    try {
      const result = await ctx.githubSync.syncSolutions();
      return reply.send(serializeForJson(result));
    } catch (err) {
      request.log.error(err);
      const message = err instanceof Error ? err.message : "GitHub sync failed";
      return reply.status(502).send({ error: message });
    }
  });
}
