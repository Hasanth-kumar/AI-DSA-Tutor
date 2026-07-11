# Implementation Plan: DSA Mastery OS improvements (July 2026)

Five workstreams, ordered by impact. Each is independently shippable.

- **A. Coach/LLM reliability** — kill "Provider returned error" (platform-killer, do first)
- **B. Composer expand** — quality-of-life, tiny
- **C. Revision in Today** — clickable revision problems + optional in-session revision
- **D. Coach-usage tracking per problem** — small schema + UI change
- **E. Orphan topics** — find topics with no problems, populate them

---

## Workstream A — Coach/LLM reliability

**Problem (verified).** All models are `:free` tiers (`google/gemma-4-31b-it:free`, `openai/gpt-oss-120b:free` coach, `openai/gpt-oss-20b:free` warmup). Free routes have few upstream providers, aggressive limits, and reduced context windows. `OpenRouterClient.chatStream` retries only 429/502/503/529 **against the same model** — a provider failure or an oversized prompt fails identically on every retry. That's why large code-analysis requests fail deterministically.

**A1. Model fallback chain in `OpenRouterClient`** (`integrations/src/llm/OpenRouterClient.ts`)
- Accept `models: string[]` in config (keep `model` as first entry for back-compat).
- Send OpenRouter's native `models` array in the request body (auto provider/model fallback), **and** on non-retryable error advance to the next model client-side.
- New env: `COACH_LLM_FALLBACK_MODELS` (comma-separated) in `@dsa/shared` `loadConfig`; thread through `llm.factory.ts` (`toCoachLLMServiceConfig` etc.).

**A2. Treat "Provider returned error" as retryable**
Extend `isRetryableError` / status handling to match `provider returned error` in the message body regardless of HTTP status — but retry against the *next* model in the chain, not the same one.

**A3. Input budget in `LLMService.buildChatMessages`**
- Cap history: last N messages (e.g. 12) or ~8k chars.
- Truncate user message beyond ~24k chars with a `[...truncated N chars...]` marker in the middle (keep head + tail — code endings matter).
- On context-length errors from the provider, surface a specific message: "Input too large for the current model — trim your code or switch models," instead of the generic unavailable text.

**A4. Graceful chat degradation**
`generateChatReply`/`generateChatReplyStream` currently just throw. After the full chain is exhausted, return a structured error naming the models tried, so the UI can offer "retry with <other model>" (the runtime model picker already exists via `createCoachModelLLMService`).

**A5. Recommended (config, no code): paid coach route**
One paid model in the chain ends the flakiness (`openai/gpt-oss-120b` paid ≈ $0.10/M input tokens — pennies/month single-user). Chain example: `openai/gpt-oss-120b` → `openai/gpt-oss-120b:free` → `google/gemma-4-31b-it:free`.

**A6. Cleanup**: stale deepseek strings in `LLMService.ts:340`, `config.ts:311` comment, `GenerationProvider.ts:12` comment.

**Tests**: fallback-chain unit tests in `OpenRouterClient.test.ts` (mock fetch: first model 502 → second succeeds; provider-error text → advances model); truncation tests for `buildChatMessages`.

Size: ~1 day.

## Workstream B — Composer expand

**Current state (verified).** `CoachingPage.tsx` already autosizes the textarea (`height = min(scrollHeight, 200px)`, line ~216–221).

- **B1.** Raise the cap: `Math.min(ta.scrollHeight, window.innerHeight * 0.4)` so large pastes get real room.
- **B2.** Manual expand toggle: button in `coach-composer-footer` switching a `coach-composer--expanded` class (~70vh, monospace-friendly). Persist preference in `localStorage`.
- **B3.** Keep Enter=send / Shift+Enter=newline (already in `onKeyDown`).
- **B4.** Show a character-count hint when input exceeds the A3 truncation threshold, warning it will be trimmed.

Size: ~1–2 h. Frontend only.

## Workstream C — Revision in Today

Two changes, both optional-by-design so revision never displaces new problems:

1. The Revision panel surfaces **concrete solved problems** (not just topic names), clickable through to LeetCode, with one-tap recall grading.
2. After finishing a new problem in a session, offer an **optional** quick revision step (tiered: ~5 min recall check by default, full re-solve only when the topic is weak).

**Current state (verified).**
- `PlanService.buildPlan` already selects up to 2 due revision topics (`getRevisionQueue` + `compressRevisionQueue`) but returns only `revisionTopics: TopicState[]`.
- The Revision panel (`TodayPage.tsx` ~line 700) renders topic names — nothing clickable because topics carry no link. `problems.leetcode_link` exists.
- `ProblemRepository` has no solved-by-topic query.
- `SessionService.applyRecallQuality(topicId, quality 0–5)` already updates SM-2 + marks the topic Notion-dirty — ideal for recording a recall check. It does **not** invalidate the plan cache (gap).

### C-Phase 1 — Backend

1. **`ProblemRepository.findSolvedByTopicId(topicId, { limit })`** — status `"Solved"`, oldest `updatedAt` first (most decayed first).
2. **Extend `StudyPlan`** (`@dsa/intelligence` types; rebuild `@dsa/database` first):

```ts
revisionProblems: Array<{
  problemId: string;
  name: string;
  difficulty: TopicDifficulty | null;
  leetcodeLink?: string;
  topicId: string;
  topicName: string;
  mode: "recall" | "resolve";   // recall ≈ 5 min, resolve = full re-solve
}>;
```

3. **Populate in `PlanService.buildPlan`**: 1 solved problem per scored revision topic, max 2/day total. Mode heuristic: `"resolve"` if `topic.isWeakArea || topic.confidence < 40`, else `"recall"`. Revision never takes the new-problem slot.
4. **Grade route**: `POST /api/revision/:topicId/grade { quality }` in `revision.routes.ts` → `sessionService.applyRecallQuality` + `planService.invalidateTodaysPlan()`.

### C-Phase 2 — Frontend: clickable Revision panel

5. Add `revisionProblems` to `types/api.ts`.
6. Panel rows: problem name as `<a href={leetcodeLink} target="_blank">` (plain span fallback, same pattern as Suggested problems), topic + difficulty badge + mode chip, and grade buttons **Got it** (5) / **Shaky** (3) / **Forgot** (1) → grade route → show returned `nextRevisionAt` inline → refresh plan. Keep the existing "Show all N" topic queue unchanged.

### C-Phase 3 — Optional in-session revision

7. Extend `Flow` with `{ kind: "revision-offer"; problem }`. After the capture chain (mistake capture → note-offer), if `revisionProblems` is non-empty and none graded today (localStorage flag, same pattern as `dsa-problem-starts`), show the offer instead of going idle.
8. Offer card: "Optional: quick revision — *{problem}* ({topic}) · ~5 min recall." **Start** (opens link, reveals grade buttons) · **Skip** (idle, never nags again that day). `mode: "resolve"` goes through the normal `startProblem`/`markDone` path (`recordSolve` handles re-solves — increments `attempts`).
9. Session step strip: optional "Revise" segment only while active — never a required step.

### C-Phase 4 — Tests

Repo query ordering/filter; plan includes `revisionProblems`, caps at 2, excludes primary topic, mode heuristic; grade route clamps quality + invalidates cache.

Size: ~1.5 days.

### Out of scope (later)
Backlog-pressure tier escalation (recall → skeleton → re-solve); revision session rows/analytics; FSRS for problems (problems stay on topic-level SM-2 — don't conflate with the card FSRS path).

## Workstream D — Coach-usage tracking per problem

Record whether the coach was used on each solved problem; feed it to intelligence as a mastery signal ("solved with coach" < "solved cold").

- **D1. Schema**: `used_coach INTEGER DEFAULT 0` + `hint_count INTEGER DEFAULT 0` on `problem_attempts` (attempts, not sessions — it's per-problem). New numbered file in `database/migrations/` **and** append to `MIGRATIONS` in `integrations/src/sqlite/migrations.ts`.
- **D2. Auto-capture**: `ChatService`/hint route already knows the `problemId` (coach opens per-problem from Today). Record coach interactions per problem server-side (in-memory map or small table), so `logSession` can stamp the attempt automatically — no extra user input.
- **D3. Manual override**: in the mistake-capture step, a pre-checked "Used coach" toggle reflecting the auto-captured value.
- **D4. Consume the signal**: expose `usedCoach` on attempt data; weakness/difficulty engines discount coach-assisted solves (keep engines pure — pass it in via snapshot data).
- **D5. Tests**: migration applies; attempt stamps `usedCoach`; engine discount unit test in `@dsa/intelligence`.

Size: ~1 day. Notion sync of the flag optional (local-only is fine initially).

## Workstream E — Orphan topics (no problems attached)

- **E1. Query + endpoint**: `TopicRepository.findOrphans()` (LEFT JOIN problems, count = 0) → `GET /api/topics/orphans`.
- **E2. Surface**: badge/count on the curriculum "Up next" panel and Graph page ("no problems — add some"). The plan builder already degrades when a topic has no problems (`ProblemSuggestionService` returns a "add problems in Notion" placeholder) — orphans just make it visible before it bites.
- **E3. Populate (suggest, don't auto-create)**: batch script `pnpm db:suggest-problems` — for each orphan topic, LLM (generation chain, Ollama-first — off the hot path) proposes 2–3 canonical LeetCode problems (name, difficulty, slug → `https://leetcode.com/problems/<slug>/`); write to a review file (JSON/MD) for approval; on approval, create pages in the Notion problems DB via the existing `NotionClient`, then resync. Validate slugs via the existing LeetCode integration where configured.
- **E4. Tests**: orphan query; suggestion parser (LLM output → validated rows).

Size: ~1 day.

---

## Suggested order

| # | Workstream | Size |
|---|---|---|
| 1 | A — LLM reliability | ~1 day |
| 2 | B — Composer | ~1–2 h |
| 3 | C — Revision in Today | ~1.5 days |
| 4 | D — Coach-usage tracking | ~1 day |
| 5 | E — Orphan topics | ~1 day |

Before each push: `pnpm build && pnpm lint && pnpm test` (build `@dsa/database` first — `pnpm build` handles the ordering).
