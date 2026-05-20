import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function revisionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/revision", async (_request, reply) => {
    const topics = ctx.topicRepo.findAll();
    const queue = ctx.intelligence.getRevisionQueue(topics);
    const dueWithin24h = queue.filter((t) => {
      if (!t.nextRevisionAt) return false;
      const hours =
        (t.nextRevisionAt.getTime() - Date.now()) / (1000 * 60 * 60);
      return hours <= 24;
    });

    return reply.send(
      serializeForJson({
        queue,
        dueWithin24h,
        count: queue.length,
      }),
    );
  });
}
