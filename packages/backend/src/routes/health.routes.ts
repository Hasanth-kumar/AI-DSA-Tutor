import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { checkHealthFromContext, checkHealthLive } from "../services/health.service.js";

export async function healthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/health/live", async (_request, reply) => {
    return reply.status(200).send(checkHealthLive());
  });

  app.get("/health/ready", async (_request, reply) => {
    const health = await checkHealthFromContext(ctx, { deep: true });
    const statusCode = health.status === "ok" ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  app.get("/health", async (_request, reply) => {
    const health = await checkHealthFromContext(ctx, { deep: false });
    return reply.status(200).send(health);
  });
}
