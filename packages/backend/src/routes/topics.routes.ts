import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function topicsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/topics", async (_request, reply) => {
    const topics = ctx.topicRepo.findAll();
    const scores = ctx.intelligence.scoreTopics(topics);
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
    const scores = ctx.intelligence.scoreTopics([topic]);
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
    ctx.events.publish("topic");
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

  /** Weakness evidence drill-down (5.4): signals, mistake tags, slow problems. */
  app.get<{ Params: { id: string } }>(
    "/topics/:id/weakness",
    async (request, reply) => {
      const topic = ctx.topicRepo.findById(request.params.id);
      if (!topic) {
        return reply.status(404).send({ error: "Topic not found" });
      }

      const analysis = ctx.intelligence.analyzeTopicWeakness(topic);
      const problems = ctx.problemRepo.findByTopicId(request.params.id);
      const slowProblems = problems
        .filter((p) => (p.timeTaken ?? 0) > 30)
        .sort((a, b) => (b.timeTaken ?? 0) - (a.timeTaken ?? 0))
        .slice(0, 5)
        .map((p) => ({ id: p.id, name: p.name, timeTaken: p.timeTaken }));
      const lowProductivitySessions = topic.recentSessions
        .filter((s) => s.productivityScore < 60)
        .map((s) => ({
          date: s.date,
          productivityScore: s.productivityScore,
          duration: s.duration,
        }));

      return reply.send(
        serializeForJson({
          topicId: topic.id,
          topicName: topic.name,
          analysis,
          evidence: {
            mistakeTagCounts: topic.mistakeTagCounts ?? {},
            noteCoverage: topic.noteCoverage ?? { solved: 0, withNotes: 0 },
            slowProblems,
            lowProductivitySessions,
          },
        }),
      );
    },
  );
}
