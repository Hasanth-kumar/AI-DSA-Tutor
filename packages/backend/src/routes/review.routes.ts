import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

/**
 * Flashcard review surface (§11) — the real SR engine, separate from warm-up.
 * Interleaved due cards across all topics, hard-capped, with one-call inline
 * triage (suspend / delete / edit) that each append to the §9 event log. Grade
 * reuses the same per-card FSRS path as warm-up (`CardService.review`).
 */
export async function reviewRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** Interleaved due queue, capped (§11). `cap` clamps server-side. */
  app.get<{ Querystring: { cap?: string } }>("/review/queue", async (request, reply) => {
    const cap = request.query.cap != null ? Number(request.query.cap) : 20;
    const queue = ctx.cardService.reviewQueue(Number.isFinite(cap) ? cap : 20);
    return reply.send(serializeForJson(queue));
  });

  /** Self-grade (0–5) → per-card FSRS review (§7), same engine as warm-up. */
  app.post<{ Body: { cardId?: string; quality?: number } }>("/review/grade", async (request, reply) => {
    const { cardId, quality } = request.body ?? {};
    if (!cardId || quality == null) {
      return reply.status(400).send({ error: "cardId and quality (0–5) are required" });
    }
    try {
      const result = ctx.cardService.review(cardId, quality);
      ctx.events.publish("topic");
      return reply.send(serializeForJson(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Grade failed";
      return reply.status(message.includes("not found") ? 404 : 500).send({ error: message });
    }
  });

  /** Triage: suspend a card → drops it from the queue, logs `CardSuspended` (§9). */
  app.post<{ Params: { cardId: string } }>("/review/:cardId/suspend", async (request, reply) => {
    try {
      ctx.cardService.suspend(request.params.cardId);
      ctx.events.publish("topic");
      return reply.send({ suspended: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suspend failed";
      return reply.status(message.includes("not found") ? 404 : 500).send({ error: message });
    }
  });

  /** Triage: delete a card, logging `CardDeleted` with its content first (§9). */
  app.delete<{ Params: { cardId: string } }>("/review/:cardId", async (request, reply) => {
    try {
      ctx.cardService.deleteCard(request.params.cardId);
      ctx.events.publish("topic");
      return reply.send({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return reply.status(message.includes("not found") ? 404 : 500).send({ error: message });
    }
  });

  /** Triage: edit a card's content (Notion-authoritative §8), logs `CardEdited` (§9). */
  app.patch<{ Params: { cardId: string }; Body: { front?: string; back?: string } }>(
    "/review/:cardId",
    async (request, reply) => {
      const { front, back } = request.body ?? {};
      if (front == null && back == null) {
        return reply.status(400).send({ error: "front or back is required" });
      }
      try {
        const card = ctx.cardService.editCard(request.params.cardId, front ?? "", back ?? "");
        ctx.events.publish("topic");
        return reply.send(serializeForJson(card));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Edit failed";
        return reply.status(message.includes("not found") ? 404 : 500).send({ error: message });
      }
    },
  );
}
