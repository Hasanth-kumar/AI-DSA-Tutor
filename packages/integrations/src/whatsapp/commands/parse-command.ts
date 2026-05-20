export type WhatsAppCommand =
  | { type: "plan" }
  | { type: "progress" }
  | { type: "hint"; problemName: string }
  | {
      type: "done";
      problemName: string;
      studyDuration: number;
      productivityScore: number;
    }
  | { type: "help" }
  | { type: "unknown"; raw: string };

function normalizeInput(text: string): string {
  return text.trim().replace(/^\//, "").toLowerCase();
}

export function parseWhatsAppCommand(text: string): WhatsAppCommand {
  const raw = text.trim();
  if (!raw) return { type: "help" };

  const lower = normalizeInput(raw);

  if (lower === "plan" || lower === "today") {
    return { type: "plan" };
  }

  if (lower === "progress" || lower === "stats") {
    return { type: "progress" };
  }

  if (lower === "help" || lower === "start") {
    return { type: "help" };
  }

  const hintMatch = raw.match(/^(?:\/)?hint\s+(.+)$/i);
  if (hintMatch) {
    return { type: "hint", problemName: hintMatch[1].trim() };
  }

  const doneMatch = raw.match(
    /^(?:\/)?done\s+(.+?)[,\s]+(\d+)\s*(?:min(?:utes?)?)?[,\s]+(\d+)\s*(?:score)?$/i,
  );
  if (doneMatch) {
    return {
      type: "done",
      problemName: doneMatch[1].trim(),
      studyDuration: Number(doneMatch[2]),
      productivityScore: Number(doneMatch[3]),
    };
  }

  const doneSimple = raw.match(/^(?:\/)?done\s+(.+)$/i);
  if (doneSimple) {
    const parts = doneSimple[1].split(/[,\s]+/);
    const score = Number(parts.at(-1));
    const duration = Number(parts.at(-2));
    if (Number.isFinite(score) && Number.isFinite(duration) && parts.length >= 3) {
      const problemName = parts.slice(0, -2).join(" ").trim();
      if (problemName) {
        return {
          type: "done",
          problemName,
          studyDuration: duration,
          productivityScore: score,
        };
      }
    }
  }

  return { type: "unknown", raw };
}

export const WHATSAPP_HELP_TEXT = `DSA Mastery OS — commands

plan — today's study plan
progress — weekly stats
done <problem> <minutes> <score>
  Example: done Coin Change 45 80
hint <problem name>
  Example: hint Coin Change

Reply with any command (no slash required).`;
