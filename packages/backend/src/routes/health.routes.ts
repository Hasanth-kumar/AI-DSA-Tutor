import type { FastifyInstance } from "fastify";
import type { AppConfig } from "@dsa/shared";
import { checkHealth } from "../services/health.service.js";

export async function healthRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const health = await checkHealth(config);
    return reply.status(200).send(health);
  });
}
