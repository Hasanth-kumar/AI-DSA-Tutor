import type { FastifyInstance } from "fastify";
import type { ResolveRating } from "@dsa/intelligence";
import type { AppContext } from "../context.js";
import type { ResolveOutcomeKind } from "../services/ProblemReviewService.js";

const OUTCOMES: ResolveOutcomeKind[] = ["solved", "assisted", "failed"];
const RATINGS: ResolveRating[] = ["again", "hard", "good", "easy"];

/**
 * Problem re-solve surface (re-solve design §9) — thin wrappers over
 * ProblemReviewService. Queue reads and outcome recording are pure SQLite.
 */
export async function resolveRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** Full pool for the Re-solve page + today's capacity-fitted slots (§10). */
  app.get("/resolve/queue", async (_request, reply) => {
    const items = ctx.problemReviewService.queue();
    const { slots, capacity } = ctx.problemReviewService.dueSlots(Date.now());
    return reply.send({
      items,
      slots,
      capacity,
      dueCount: ctx.problemReviewService.dueCount(),
      // Lets the completion UI preview the inferred rating before submitting.
      slowThresholdMin: ctx.config.resolve.engine.slowThresholdMin,
    });
  });

  /** Completion flow (§5): outcome → inferred rating (+ optional override). */
  app.post<{
    Params: { problemId: string };
    Body: { outcome?: string; timeTakenMin?: number | null; ratingOverride?: string };
  }>("/resolve/:problemId/complete", async (request, reply) => {
    const { outcome, timeTakenMin, ratingOverride } = request.body ?? {};
    if (!OUTCOMES.includes(outcome as ResolveOutcomeKind)) {
      return reply.status(400).send({ error: "outcome must be solved | assisted | failed" });
    }
    if (ratingOverride !== undefined && !RATINGS.includes(ratingOverride as ResolveRating)) {
      return reply.status(400).send({ error: "ratingOverride must be again | hard | good | easy" });
    }
    try {
      const result = ctx.problemReviewService.complete(request.params.problemId, {
        outcome: outcome as ResolveOutcomeKind,
        timeTakenMin: timeTakenMin ?? null,
        ratingOverride: ratingOverride as ResolveRating | undefined,
      });
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Complete failed";
      return reply.status(message.includes("not in the re-solve pool") ? 404 : 500).send({ error: message });
    }
  });

  /** Skip = defer to tomorrow (§2), never dropped. */
  app.post<{ Params: { problemId: string } }>("/resolve/:problemId/skip", async (request, reply) => {
    try {
      const row = ctx.problemReviewService.skip(request.params.problemId);
      return reply.send({ problemId: row.problemId, due: row.due });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Skip failed";
      return reply.status(message.includes("not in the re-solve pool") ? 404 : 500).send({ error: message });
    }
  });

  /** Manual force-admit (§4). */
  app.post<{ Params: { problemId: string } }>("/resolve/:problemId/admit", async (request, reply) => {
    try {
      return reply.send(ctx.problemReviewService.admit(request.params.problemId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Admit failed";
      return reply.status(message.includes("not found") ? 404 : 500).send({ error: message });
    }
  });

  /** Retire / suspend controls for the Re-solve page (§10). */
  app.patch<{
    Params: { problemId: string };
    Body: { retired?: boolean; suspended?: boolean };
  }>("/resolve/:problemId", async (request, reply) => {
    const { retired, suspended } = request.body ?? {};
    if (retired === undefined && suspended === undefined) {
      return reply.status(400).send({ error: "retired or suspended is required" });
    }
    try {
      return reply.send(
        ctx.problemReviewService.setFlags(request.params.problemId, { retired, suspended }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      return reply.status(message.includes("not in the re-solve pool") ? 404 : 500).send({ error: message });
    }
  });
}
