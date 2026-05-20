import type { FastifyInstance } from "fastify";
import type { PlanOptions } from "@dsa/intelligence";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function planRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Querystring: PlanOptions }>("/plan/today", async (request, reply) => {
    try {
      const plan = await ctx.planService.generateTodaysPlan(request.query);
      return reply.send(serializeForJson(plan));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate plan";
      return reply.status(503).send({ error: message });
    }
  });
}
