import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";
import { replyServiceError } from "../lib/http.js";

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

  /** One-tap recall grade (C) — SM-2 quality 0–5 for a revision problem's topic. */
  app.post<{ Params: { topicId: string }; Body: { quality?: number } }>(
    "/revision/:topicId/grade",
    async (request, reply) => {
      const quality = request.body?.quality;
      if (quality == null) {
        return reply.status(400).send({ error: "quality (0–5) is required" });
      }
      try {
        const result = ctx.sessionService.applyRecallQuality(
          request.params.topicId,
          quality,
        );
        await ctx.planService.invalidateTodaysPlan();
        ctx.events.publish("topic");
        return reply.send(serializeForJson(result));
      } catch (err) {
        return replyServiceError(reply, err, "Grade failed");
      }
    },
  );
}
