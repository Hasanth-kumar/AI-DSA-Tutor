import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { AppContext } from "../context.js";
import { WhatsAppNotificationService } from "../services/WhatsAppNotificationService.js";

/**
 * Usage is on-demand, so unsolicited pushes were cut (4.1): the 7 AM daily
 * plan, 9 PM revision check, and 30-minute Notion sync jobs are gone. The
 * Sunday weekly digest is the one push that fits intermittent use. Notion now
 * syncs on `pnpm study` startup, after each log, and via POST /api/sync.
 *
 * A single-user backend doesn't need a durable job queue (BullMQ/Redis) for one
 * weekly cron, so this runs in-process with node-cron. Trade-off: a digest is
 * skipped (not replayed) if the server is down at the scheduled time.
 */
export interface SchedulerHandles {
  close: () => Promise<void>;
}

export function startSchedulers(ctx: AppContext): SchedulerHandles {
  const { config } = ctx;
  if (!config.schedulers.enabled) {
    return { close: async () => {} };
  }

  const whatsappNotify = new WhatsAppNotificationService(config, ctx);

  const tasks: ScheduledTask[] = [];

  if (cron.validate(config.schedulers.weeklyDigestCron)) {
    tasks.push(
      cron.schedule(
        config.schedulers.weeklyDigestCron,
        async () => {
          try {
            const summary = ctx.analyticsService.getWeeklySummary();
            if (whatsappNotify.isConfigured()) {
              await whatsappNotify.sendWeeklyDigest(undefined, summary);
            }
          } catch (err) {
            console.error("Scheduler job weekly-digest failed:", err);
          }
        },
        {
          name: "weekly-digest",
          timezone: config.schedulers.timezone,
          noOverlap: true,
        },
      ),
    );
  } else {
    console.error(
      `Invalid WEEKLY_DIGEST_CRON pattern: "${config.schedulers.weeklyDigestCron}" — digest disabled.`,
    );
  }

  return {
    async close() {
      await Promise.all(tasks.map((task) => task.destroy()));
    },
  };
}
