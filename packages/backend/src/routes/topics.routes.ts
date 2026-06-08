import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function topicsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/topics", async (_request, reply) => {
    const topics = ctx.topicRepo.findAll();
    const scores = ctx.intelligence.buildSnapshot(topics).topicScores;
    return reply.send(
      serializeForJson({
        topics,
        scores,
        count: topics.length,
      }),
    );
  });

  app.get<{ Params: { id: string } }>("/topics/:id", async (request, reply) => {
    const topic = ctx.topicRepo.findById(request.params.id);
    if (!topic) {
      return reply.status(404).send({ error: "Topic not found" });
    }
    const scores = ctx.intelligence.buildSnapshot([topic]).topicScores;
    return reply.send(serializeForJson({ topic, score: scores[0] ?? null }));
  });

  app.patch<{
    Params: { id: string };
    Body: {
      confidence?: number;
      status?: string;
      isWeakArea?: boolean;
    };
  }>("/topics/:id", async (request, reply) => {
    const existing = ctx.topicRepo.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Topic not found" });
    }

    ctx.topicRepo.update(request.params.id, request.body);
    ctx.notionSync.markTopicDirty(request.params.id);

    if (ctx.notionSync.isConfigured()) {
      try {
        await ctx.notionSync.pushTopicToNotion(request.params.id);
      } catch (err) {
        request.log.warn({ err }, "Notion push failed after topic update");
      }
    }

    await ctx.planService.invalidateTodaysPlan();
    const topic = ctx.topicRepo.findById(request.params.id);
    return reply.send(serializeForJson({ topic }));
  });

  app.get<{ Params: { id: string } }>(
    "/topics/:id/score/explain",
    async (request, reply) => {
      const topic = ctx.topicRepo.findById(request.params.id);
      if (!topic) {
        return reply.status(404).send({ error: "Topic not found" });
      }

      const allTopics = ctx.topicRepo.findAll();
      const explanation = ctx.intelligence.explainTopicScore(topic, allTopics);
      return reply.send(serializeForJson(explanation));
    },
  );
}
