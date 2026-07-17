import type { FastifyReply } from "fastify";

/**
 * Standard mapping of a thrown service error to an HTTP reply: messages
 * containing `notFoundMarker` become 404, everything else 500, with the error
 * text passed through.
 */
export function replyServiceError(
  reply: FastifyReply,
  err: unknown,
  fallback: string,
  notFoundMarker = "not found",
): FastifyReply {
  const message = err instanceof Error ? err.message : fallback;
  return reply.status(message.includes(notFoundMarker) ? 404 : 500).send({ error: message });
}
