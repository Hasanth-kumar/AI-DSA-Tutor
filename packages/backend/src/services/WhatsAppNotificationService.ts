import {
  createWhatsAppClient,
  formatProgressForWhatsApp,
  formatRevisionReminder,
  formatStudyPlanForWhatsApp,
  type WhatsAppClient,
} from "@dsa/integrations";
import type { TopicState } from "@dsa/intelligence";
import type { StudyPlan } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import type { AppContext } from "../context.js";
import type { WeeklySummary } from "./AnalyticsService.js";

export interface NotifyResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

export class WhatsAppNotificationService {
  private readonly client: WhatsAppClient | null;

  constructor(
    private readonly config: AppConfig,
    private readonly ctx: AppContext,
  ) {
    const { phoneNumberId, accessToken, apiVersion } = config.whatsapp;
    this.client =
      phoneNumberId && accessToken
        ? createWhatsAppClient({ phoneNumberId, accessToken, apiVersion })
        : null;
  }

  isConfigured(): boolean {
    return Boolean(
      this.client?.isConfigured() && this.config.whatsapp.defaultRecipient,
    );
  }

  private resolveRecipient(override?: string): string | null {
    return override ?? this.config.whatsapp.defaultRecipient ?? null;
  }

  async sendDailyPlan(recipient?: string, plan?: StudyPlan): Promise<NotifyResult> {
    const to = this.resolveRecipient(recipient);
    if (!to || !this.client?.isConfigured()) {
      return { sent: false, reason: "WhatsApp or default recipient not configured" };
    }

    const resolvedPlan = plan ?? (await this.ctx.planService.generateTodaysPlan());
    const body = formatStudyPlanForWhatsApp(resolvedPlan);
    const { messageId } = await this.client.sendText(to, body);
    return { sent: true, messageId };
  }

  async sendRevisionCheck(
    recipient?: string,
    dueSoon?: TopicState[],
  ): Promise<NotifyResult> {
    const to = this.resolveRecipient(recipient);
    if (!to || !this.client?.isConfigured()) {
      return { sent: false, reason: "WhatsApp or default recipient not configured" };
    }

    const resolvedDueSoon =
      dueSoon ??
      this.ctx.intelligence
        .getRevisionQueue(this.ctx.topicRepo.findAll())
        .filter((t) => {
          if (!t.nextRevisionAt) return false;
          const hoursUntil = (t.nextRevisionAt.getTime() - Date.now()) / 3_600_000;
          return hoursUntil <= 24;
        });

    if (resolvedDueSoon.length === 0) {
      return { sent: false, reason: "No revisions due in the next 24 hours" };
    }

    const body = formatRevisionReminder(resolvedDueSoon.map((t) => t.name));
    if (!body) {
      return { sent: false, reason: "Nothing to send" };
    }

    const { messageId } = await this.client.sendText(to, body);
    return { sent: true, messageId };
  }

  async sendWeeklyDigest(
    recipient?: string,
    summary?: WeeklySummary,
  ): Promise<NotifyResult> {
    const to = this.resolveRecipient(recipient);
    if (!to || !this.client?.isConfigured()) {
      return { sent: false, reason: "WhatsApp or default recipient not configured" };
    }

    const resolvedSummary = summary ?? this.ctx.analyticsService.getWeeklySummary();
    const body = formatProgressForWhatsApp({
      ...resolvedSummary,
      weakTopics: resolvedSummary.weakTopics.map((w) => ({
        name: w.name,
        score: w.score,
      })),
    });

    const header = `📬 Weekly Digest\n\n`;
    const { messageId } = await this.client.sendText(to, header + body);
    return { sent: true, messageId };
  }
}
