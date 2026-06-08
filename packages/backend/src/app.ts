import Fastify from "fastify";
import type { AppConfig } from "@dsa/shared";
import type { AppContext } from "./context.js";
import { healthRoutes } from "./routes/health.routes.js";
import { planRoutes } from "./routes/plan.routes.js";
import { revisionRoutes } from "./routes/revision.routes.js";
import { topicsRoutes } from "./routes/topics.routes.js";
import { sessionRoutes } from "./routes/session.routes.js";
import { analyticsRoutes } from "./routes/analytics.routes.js";
import { problemsRoutes } from "./routes/problems.routes.js";
import { syncRoutes } from "./routes/sync.routes.js";
import {
  whatsappNotificationRoutes,
  whatsappWebhookRoutes,
} from "./routes/whatsapp.routes.js";

export function buildApp(config: AppConfig, ctx: AppContext) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  app.get("/", async () => ({
    name: "DSA Mastery OS API",
    version: "0.2.0",
    health: "/health",
    api: {
      plan: "GET /api/plan/today",
      revision: "GET /api/revision",
      topics: "GET /api/topics",
      problems: "GET /api/problems",
      session: "POST /api/session",
      analytics: {
        summary: "GET /api/analytics/summary",
        streak: "GET /api/analytics/streak",
        masteryVelocity: "GET /api/analytics/mastery-velocity?weeks=8",
        weaknessTrend: "GET /api/analytics/weakness-trend?weeks=8",
        difficulty: "GET /api/analytics/difficulty",
      },
      explainScore: "GET /api/topics/:id/score/explain",
      sync: "POST /api/sync",
      notifications: {
        dailyPlan: "POST /api/notifications/daily-plan",
        revisionCheck: "POST /api/notifications/revision-check",
        weeklyDigest: "POST /api/notifications/weekly-digest",
      },
    },
    webhooks: {
      whatsapp: "GET|POST /webhooks/whatsapp",
    },
  }));

  app.register(async (instance) => {
    await healthRoutes(instance, config);
  });

  app.register(
    async (instance) => {
      await planRoutes(instance, ctx);
      await revisionRoutes(instance, ctx);
      await topicsRoutes(instance, ctx);
      await problemsRoutes(instance, ctx);
      await sessionRoutes(instance, ctx);
      await analyticsRoutes(instance, ctx);
      await syncRoutes(instance, ctx);
      await whatsappNotificationRoutes(instance, ctx);
    },
    { prefix: "/api" },
  );

  app.register(async (instance) => {
    await whatsappWebhookRoutes(instance, ctx);
  }, { prefix: "/webhooks" });

  return app;
}
