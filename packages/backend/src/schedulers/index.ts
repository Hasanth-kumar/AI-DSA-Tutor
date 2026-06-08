import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { AppContext } from "../context.js";
import { WhatsAppNotificationService } from "../services/WhatsAppNotificationService.js";

const QUEUE_NAME = "dsa-scheduler";

export interface SchedulerHandles {
  close: () => Promise<void>;
}

export function startSchedulers(ctx: AppContext): SchedulerHandles {
  const { config } = ctx;
  if (!config.schedulers.enabled) {
    return { close: async () => {} };
  }

  const connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue(QUEUE_NAME, { connection });
  const whatsappNotify = new WhatsAppNotificationService(config, ctx);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "daily-plan": {
          const plan = await ctx.planService.generateTodaysPlan();
          let whatsapp: { sent: boolean; reason?: string } = { sent: false };
          if (whatsappNotify.isConfigured()) {
            whatsapp = await whatsappNotify.sendDailyPlan();
          }
          return {
            primaryTopic: plan.primaryTopic.name,
            revisionCount: plan.revisionTopics.length,
            estimatedDuration: plan.estimatedDuration,
            whatsapp,
          };
        }
        case "revision-check": {
          const topics = ctx.topicRepo.findAll();
          const revisionQueue = ctx.intelligence.getRevisionQueue(topics);
          let whatsapp: { sent: boolean; reason?: string } = { sent: false };
          if (whatsappNotify.isConfigured()) {
            whatsapp = await whatsappNotify.sendRevisionCheck();
          }
          return {
            dueCount: revisionQueue.length,
            topics: revisionQueue.map((t) => t.name),
            whatsapp,
          };
        }
        case "notion-sync": {
          if (!ctx.notionSync.isConfigured()) {
            return { skipped: true, reason: "Notion not configured" };
          }
          return await ctx.notionSync.pullFromNotion();
        }
        case "weekly-digest": {
          let whatsapp: { sent: boolean; reason?: string } = { sent: false };
          if (whatsappNotify.isConfigured()) {
            whatsapp = await whatsappNotify.sendWeeklyDigest();
          }
          const summary = ctx.analyticsService.getWeeklySummary();
          return {
            sessionsCount: summary.sessionsCount,
            problemsSolved: summary.problemsSolved,
            currentStreakDays: summary.currentStreakDays,
            whatsapp,
          };
        }
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`Scheduler job ${job?.name} failed:`, err);
  });

  const tz = config.schedulers.timezone;

  void queue.add(
    "daily-plan",
    {},
    {
      repeat: { pattern: config.schedulers.dailyPlanCron, tz },
      jobId: "daily-plan-repeat",
    },
  );

  void queue.add(
    "revision-check",
    {},
    {
      repeat: { pattern: config.schedulers.revisionCheckCron, tz },
      jobId: "revision-check-repeat",
    },
  );

  void queue.add(
    "notion-sync",
    {},
    {
      repeat: { pattern: config.schedulers.notionSyncCron, tz },
      jobId: "notion-sync-repeat",
    },
  );

  void queue.add(
    "weekly-digest",
    {},
    {
      repeat: { pattern: config.schedulers.weeklyDigestCron, tz },
      jobId: "weekly-digest-repeat",
    },
  );

  return {
    async close() {
      await worker.close();
      await queue.close();
      connection.disconnect();
    },
  };
}
