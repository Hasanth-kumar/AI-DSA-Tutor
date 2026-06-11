import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

const HEARTBEAT_MS = 25_000;

/** Server-sent events stream replacing the 30-second polling loop (5.4). */
export async function eventsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/events", (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    reply.raw.write(`event: connected\ndata: {}\n\n`);

    const unsubscribe = ctx.events.subscribe((event) => {
      reply.raw.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, HEARTBEAT_MS);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
