import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WhatsAppWebhookPayload } from "@dsa/integrations";
import type { AppContext } from "../context.js";
import { WhatsAppCommandService } from "../services/WhatsAppCommandService.js";
import { WhatsAppNotificationService } from "../services/WhatsAppNotificationService.js";

function checkNotifySecret(
  request: FastifyRequest,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  const header = request.headers["x-notify-secret"];
  return header === secret;
}

export async function whatsappWebhookRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  const commands = new WhatsAppCommandService(ctx.config, ctx);

  app.get("/whatsapp", async (request, reply) => {
    const query = request.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const verifyToken = ctx.config.whatsapp.verifyToken;

    if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
      return reply.status(200).send(challenge ?? "");
    }

    return reply.status(403).send({ error: "Verification failed" });
  });

  app.post("/whatsapp", async (request, reply) => {
    const payload = request.body as WhatsAppWebhookPayload;
    if (payload.object !== "whatsapp_business_account") {
      return reply.status(200).send({ status: "ignored" });
    }

    if (!commands.isConfigured()) {
      return reply.status(503).send({ error: "WhatsApp not configured" });
    }

    const entries = payload.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];
        for (const message of messages) {
          if (message.type !== "text" || !message.text?.body) continue;

          try {
            await commands.handleIncomingText(message.from, message.text.body);
          } catch (err) {
            request.log.error({ err, from: message.from }, "WhatsApp command failed");
            try {
              await commands.sendText(
                message.from,
                "Something went wrong. Reply *help* for commands.",
              );
            } catch {
              // ignore send failure
            }
          }
        }
      }
    }

    return reply.status(200).send({ status: "ok" });
  });
}

export async function whatsappNotificationRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  const notifications = new WhatsAppNotificationService(ctx.config, ctx);
  const secret = ctx.config.whatsapp.notifySecret;

  app.post<{ Body: { recipient?: string } }>(
    "/notifications/daily-plan",
    async (request, reply) => {
      if (!checkNotifySecret(request, secret)) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      if (!notifications.isConfigured()) {
        return reply.status(503).send({ error: "WhatsApp notifications not configured" });
      }

      try {
        const result = await notifications.sendDailyPlan(request.body?.recipient);
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send";
        return reply.status(500).send({ error: message });
      }
    },
  );

  app.post<{ Body: { recipient?: string } }>(
    "/notifications/revision-check",
    async (request, reply) => {
      if (!checkNotifySecret(request, secret)) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      if (!notifications.isConfigured()) {
        return reply.status(503).send({ error: "WhatsApp notifications not configured" });
      }

      try {
        const result = await notifications.sendRevisionCheck(request.body?.recipient);
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send";
        return reply.status(500).send({ error: message });
      }
    },
  );
}
