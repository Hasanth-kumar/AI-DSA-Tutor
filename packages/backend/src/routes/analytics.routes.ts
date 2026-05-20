import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function analyticsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/analytics/summary", async (_request, reply) => {
    const summary = ctx.analyticsService.getWeeklySummary();
    return reply.send(serializeForJson(summary));
  });
}
