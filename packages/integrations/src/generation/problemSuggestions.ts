/**
 * Orphan-topic problem suggestions (E3): prompt + parser for the batch
 * `pnpm db:suggest-problems` script. The LLM proposes canonical LeetCode
 * problems for topics that have none; a human approves the review file
 * before anything is created in Notion.
 */

export interface ProblemSuggestionDraft {
  name: string;
  difficulty: "Easy" | "Medium" | "Hard";
  slug: string;
  link: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);

export function buildSuggestionPrompt(topicName: string): string {
  return [
    `Suggest 3 canonical LeetCode problems for practicing the DSA topic "${topicName}".`,
    "Pick famous, frequently-recommended problems (the ones every study plan uses).",
    "Respond with ONLY a JSON array, no prose. Each element:",
    '{"name": "Two Sum", "difficulty": "Easy", "slug": "two-sum"}',
    'The slug is the LeetCode URL slug (https://leetcode.com/problems/<slug>/).',
    '"difficulty" must be exactly one of "Easy", "Medium", "Hard".',
  ].join("\n");
}

/**
 * Extract suggestions from possibly fenced / chatty LLM output. Pure and
 * total — never throws, drops malformed rows, returns `[]` on garbage.
 */
export function parseProblemSuggestions(
  text: string | null | undefined,
): ProblemSuggestionDraft[] {
  if (!text) return [];
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const drafts: ProblemSuggestionDraft[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const difficulty = typeof row.difficulty === "string" ? row.difficulty.trim() : "";
    const slug = typeof row.slug === "string" ? row.slug.trim().toLowerCase() : "";
    if (!name || !DIFFICULTIES.has(difficulty) || !SLUG_RE.test(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    drafts.push({
      name,
      difficulty: difficulty as ProblemSuggestionDraft["difficulty"],
      slug,
      link: `https://leetcode.com/problems/${slug}/`,
    });
  }
  return drafts;
}
