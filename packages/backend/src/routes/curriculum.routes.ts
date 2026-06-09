import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function curriculumRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/curriculum", async (_request, reply) => {
    const topics = ctx.topicRepo.findAll();
    const state = ctx.curriculumService.getState(topics);
    return reply.send(serializeForJson(state));
  });

  app.put<{ Body: { topicNames?: string[] } }>(
    "/curriculum",
    async (request, reply) => {
      const names = request.body.topicNames;
      if (!Array.isArray(names)) {
        return reply.status(400).send({ error: "topicNames array is required" });
      }

      try {
        const topicNames = ctx.curriculumService.setTopicNames(names);
        await ctx.planService.invalidateTodaysPlan();
        const topics = ctx.topicRepo.findAll();
        return reply.send(
          serializeForJson({
            topicNames,
            activeTopicId: ctx.curriculumService.getActiveTopicId(),
            selection: ctx.curriculumService.selectForTopics(topics),
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid curriculum";
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post("/curriculum/reset", async (_request, reply) => {
    const topicNames = ctx.curriculumService.resetToDefault();
    ctx.curriculumService.setActiveTopicId(null);
    await ctx.planService.invalidateTodaysPlan();
    const topics = ctx.topicRepo.findAll();
    return reply.send(
      serializeForJson({
        topicNames,
        activeTopicId: null,
        selection: ctx.curriculumService.selectForTopics(topics),
      }),
    );
  });

  app.put<{ Body: { topicId?: string | null } }>(
    "/curriculum/active",
    async (request, reply) => {
      const topicId = request.body.topicId ?? null;
      if (topicId) {
        const topic = ctx.topicRepo.findById(topicId);
        if (!topic) {
          return reply.status(404).send({ error: "Topic not found" });
        }
      }

      ctx.curriculumService.setActiveTopicId(topicId);
      await ctx.planService.invalidateTodaysPlan();
      const topics = ctx.topicRepo.findAll();
      return reply.send(
        serializeForJson({
          topicNames: ctx.curriculumService.getTopicNames(),
          activeTopicId: ctx.curriculumService.getActiveTopicId(),
          selection: ctx.curriculumService.selectForTopics(topics),
        }),
      );
    },
  );
}
