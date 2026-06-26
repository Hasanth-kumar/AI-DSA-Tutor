import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function syncRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post("/sync", async (request, reply) => {
    if (!ctx.notionSync.isConfigured()) {
      return reply.status(503).send({ error: "Notion is not configured" });
    }
    try {
      const result = await ctx.notionSync.sync();
      await ctx.planService.invalidateTodaysPlan();
      // Re-match vault notes against the freshly synced problem set.
      if (ctx.obsidianNotes.isConfigured()) {
        ctx.obsidianNotes.scanVault();
      }
      ctx.events.publish("sync");
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Sync failed",
      });
    }
  });

  app.post("/sync/flush", async (request, reply) => {
    if (!ctx.notionSync.isConfigured()) {
      return reply.status(503).send({ error: "Notion is not configured" });
    }
    try {
      const result = await ctx.notionSync.flushPendingToNotion();
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Flush failed",
      });
    }
  });

  app.get("/sync/status", async (_request, reply) => {
    return reply.send({
      ...ctx.notionSync.getSyncHealth(),
      cards: ctx.cardBankSync.getHealth(),
    });
  });

  app.get("/sync/conflicts", async (_request, reply) => {
    const conflicts = ctx.conflictRepo.findUnresolved().map((c) => ({
      id: c.id,
      entityType: c.entityType,
      entityId: c.entityId,
      entityName: c.entityName,
      localValue: JSON.parse(c.localValue) as Record<string, unknown>,
      remoteValue: JSON.parse(c.remoteValue) as Record<string, unknown>,
      detectedAt: new Date(c.detectedAt).toISOString(),
    }));
    return reply.send({ conflicts, count: conflicts.length });
  });

  app.post<{
    Params: { id: string };
    Body: { winner?: "local" | "remote" };
  }>("/sync/conflicts/:id/resolve", async (request, reply) => {
    const winner = request.body?.winner;
    if (winner !== "local" && winner !== "remote") {
      return reply.status(400).send({ error: 'winner must be "local" or "remote"' });
    }
    const resolved = await ctx.notionSync.resolveConflict(request.params.id, winner);
    if (!resolved) {
      return reply.status(404).send({ error: "Conflict not found or already resolved" });
    }
    ctx.events.publish("sync");
    return reply.send({ resolved: true, winner });
  });

  app.post("/sync/pull", async (request, reply) => {
    if (!ctx.notionSync.isConfigured()) {
      return reply.status(503).send({ error: "Notion is not configured" });
    }
    try {
      const result = await ctx.notionSync.pullFromNotion();
      await ctx.planService.invalidateTodaysPlan();
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Pull failed",
      });
    }
  });

  /** Batched card-bank delta flush (§8) — Notion when configured, else local JSON export. */
  app.post("/sync/cards/flush", async (request, reply) => {
    try {
      const result = await ctx.cardBankSync.flush();
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Card sync flush failed",
      });
    }
  });

  app.get("/sync/cards/status", async (_request, reply) => {
    return reply.send(ctx.cardBankSync.getHealth());
  });

  app.post("/sync/cards/pull", async (request, reply) => {
    try {
      const result = await ctx.cardBankSync.pull();
      if (result == null) {
        return reply.status(503).send({ error: "Card sync target does not support pull" });
      }
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Card sync pull failed",
      });
    }
  });
}
