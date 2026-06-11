import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { AppContext } from "../context.js";
import { WhatsAppNotificationService } from "../services/WhatsAppNotificationService.js";

const QUEUE_NAME = "dsa-scheduler";

/**
 * Usage is on-demand, so unsolicited pushes were cut (4.1): the 7 AM daily
 * plan, 9 PM revision check, and 30-minute Notion sync jobs are gone. The
 * Sunday weekly digest is the one push that fits intermittent use. Notion now
 * syncs on `pnpm study` startup, after each log, and via POST /api/sync.
 */
const REMOVED_JOBS = ["daily-plan", "revision-check", "notion-sync"];

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
        case "weekly-digest": {
          const summary = ctx.analyticsService.getWeeklySummary();
          let whatsapp: { sent: boolean; reason?: string } = { sent: false };
          if (whatsappNotify.isConfigured()) {
            whatsapp = await whatsappNotify.sendWeeklyDigest(undefined, summary);
          }
          return {
            sessionsCount: summary.sessionsCount,
            problemsSolved: summary.problemsSolved,
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
    "weekly-digest",
    {},
    {
      repeat: { pattern: config.schedulers.weeklyDigestCron, tz },
      jobId: "weekly-digest-repeat",
    },
  );

  // Drop repeatable jobs left behind by earlier versions.
  void (async () => {
    try {
      const repeatables = await queue.getRepeatableJobs();
      for (const job of repeatables) {
        if (job.name && REMOVED_JOBS.includes(job.name)) {
          await queue.removeRepeatableByKey(job.key);
        }
      }
    } catch {
      // Redis may be down — nothing to clean.
    }
  })();

  return {
    async close() {
      await worker.close();
      await queue.close();
      connection.disconnect();
    },
  };
}
