import {
  createWhatsAppClient,
  formatProgressForWhatsApp,
  formatStudyPlanForWhatsApp,
  parseWhatsAppCommand,
  WHATSAPP_HELP_TEXT,
  type WhatsAppClient,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { AppContext } from "../context.js";
import { HintService } from "./HintService.js";

export class WhatsAppCommandService {
  private readonly client: WhatsAppClient | null;
  private readonly hintService: HintService;

  constructor(
    private readonly config: AppConfig,
    private readonly ctx: AppContext,
  ) {
    const { phoneNumberId, accessToken, apiVersion } = config.whatsapp;
    this.client =
      phoneNumberId && accessToken
        ? createWhatsAppClient({ phoneNumberId, accessToken, apiVersion })
        : null;
    this.hintService = new HintService(config);
  }

  isConfigured(): boolean {
    return this.client?.isConfigured() ?? false;
  }

  async sendText(waId: string, body: string): Promise<void> {
    if (!this.client?.isConfigured()) {
      throw new Error("WhatsApp is not configured");
    }
    await this.client.sendText(waId, body);
  }

  isRecipientAllowed(waId: string): boolean {
    const allowed = this.config.whatsapp.allowedRecipients;
    if (allowed.length === 0) return true;
    const normalized = waId.replace(/\D/g, "");
    return allowed.some((a) => a.replace(/\D/g, "") === normalized);
  }

  async handleIncomingText(waId: string, text: string): Promise<void> {
    if (!this.client?.isConfigured()) {
      throw new Error("WhatsApp is not configured");
    }
    if (!this.isRecipientAllowed(waId)) {
      await this.client.sendText(
        waId,
        "This number is not authorized to use DSA Mastery OS.",
      );
      return;
    }

    const command = parseWhatsAppCommand(text);
    let reply: string;

    switch (command.type) {
      case "plan": {
        const plan = await this.ctx.planService.generateTodaysPlan();
        reply = formatStudyPlanForWhatsApp(plan);
        break;
      }
      case "progress": {
        const summary = this.ctx.analyticsService.getWeeklySummary();
        reply = formatProgressForWhatsApp({
          ...summary,
          weakTopics: summary.weakTopics.map((w) => ({
            name: w.name,
            score: w.score,
          })),
        });
        break;
      }
      case "hint": {
        reply = await this.handleHint(command.problemName);
        break;
      }
      case "done": {
        reply = await this.handleDone(
          command.problemName,
          command.studyDuration,
          command.productivityScore,
        );
        break;
      }
      case "help":
        reply = WHATSAPP_HELP_TEXT;
        break;
      case "unknown":
        reply = `Unknown command: "${command.raw}"\n\n${WHATSAPP_HELP_TEXT}`;
        break;
    }

    await this.client.sendText(waId, reply);
  }

  private async handleHint(problemName: string): Promise<string> {
    const problem = this.ctx.problemRepo.findByNameFuzzy(problemName);
    if (!problem?.topicId) {
      return `Problem not found: "${problemName}". Check the name in your Notion problems DB.`;
    }

    const topic = this.ctx.topicRepo.findById(problem.topicId);
    if (!topic) {
      return `Topic not found for problem "${problem.name}".`;
    }

    const ctx = this.hintService.buildContextFromTopic(
      problem.name,
      topic,
      problem.difficulty ?? "Medium",
      problem.attempts ?? 0,
    );
    return this.hintService.generateHint(ctx);
  }

  private async handleDone(
    problemName: string,
    studyDuration: number,
    productivityScore: number,
  ): Promise<string> {
    const problem = this.ctx.problemRepo.findByNameFuzzy(problemName);
    if (!problem?.topicId) {
      return `Problem not found: "${problemName}". Use exact name from your database.`;
    }

    const result = await this.ctx.sessionService.completeSession({
      topicId: problem.topicId,
      problemsSolved: 1,
      studyDuration,
      productivityScore,
      pushToNotion: true,
    });

    return `✅ Session logged for ${problem.name}!\n${result.summary}\nConfidence: ${result.confidence}/100`;
  }
}
