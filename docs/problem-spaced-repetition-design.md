# DSA Mastery OS — Problem Spaced-Repetition (Re-solve) System Design

> Source of truth for per-problem spaced repetition. Date: 2026-07-08 (Rev 1).
>
> **Status:** design approved, not yet implemented. See §13 for stages.
>
> **Decisions locked in Rev 1:** automated problem selection over manual
> weekend topic-switching (§2); full re-solve as the only review mode — the
> two-tier "approach recall first" variant was considered and rejected (§14);
> capacity is env-configurable with no fixed default commitment yet (§6).
>
> **Rev 1.1 (UX):** hybrid surface — Today shows only capacity-fitted slots
> as a collapsed section; the full pool lives on a dedicated Re-solve page;
> critically overdue problems force-promote onto Today (§6, §10). A
> Today-only surface and a pure separate-page surface were both rejected
> (§14).

## 1. Problem statement & goals

The daily plan suggests **new** problems (`ProblemSuggestionService` picks
unsolved problems for the primary topic). Once a problem is solved it never
resurfaces: topic-level SM-2 re-queues the *topic* for study, and card FSRS
maintains *facts and pattern-triggers*, but nothing ever asks you to
**re-execute a specific problem**. Execution skill on previously solved
problems decays silently — the gap this system closes.

Goals, in priority order:

- **Resurface the right problems automatically.** Selection must come from
  measured struggle signals, not from what the learner feels like revisiting.
- **Never flood the day.** A re-solve costs 20–45 minutes, not 10 seconds.
  The due queue must be capacity-bounded with overflow deferred forward
  (same philosophy as `RevisionEngine.compressQueue`).
- **Zero LLM, zero network on the hot path.** Queue reads and outcome
  recording are pure SQLite, matching the card-bank hot path.
- **No new sync surface initially.** All state is local-only (§11).

## 2. Core decision: automated selection, configurable capacity

Manual topic-switching on weekends was rejected because self-selected
revision correlates poorly with actual decay: the learner picks topics that
*feel* weak or are pleasant to revisit, and has no per-problem memory of
which solutions have rotted. This is the same argument that justified SM-2
for topics and FSRS for cards; problems were simply the last unscheduled
tier.

The division of control:

- **The system decides *which* problem is due** (FSRS per problem, §5).
- **The learner decides *how much time* revision gets** (capacity knobs, §6).
  Weekday/weekend asymmetry is expressed through config, preserving the
  original "revision-heavy weekends" instinct without the manual choosing.
- **Manual override stays available:** a "queue this for re-solve" action can
  force-admit any problem (§4), and any due re-solve can be skipped (deferred,
  not dropped).

## 3. Relationship to existing scheduling (now three tiers)

| Tier | Unit | Algorithm | Question it answers |
|---|---|---|---|
| Topic revision | topic | SM-2 (`RevisionEngine`) | "Which topic should I re-study?" |
| Card review | flashcard | FSRS (`CardService`) | "Which facts/patterns am I forgetting?" |
| **Problem re-solve (new)** | problem | FSRS (`ProblemReviewEngine`) | "Which solved problem can I no longer execute?" |

These are complementary; do **not** conflate them. Topic SM-2 stays exactly
as-is. The memory–execution divergence signal in `TopicPriorityEngine` is a
*topic-level* symptom of the same disease this system treats at problem
level; a topic with divergence should tend to have problems due here, which
is a useful cross-check, not a coupling.

## 4. Pool admission — not every problem deserves resurfacing

Unbounded admission would make capacity the only filter and stuff the
schedule with trivial re-solves. A problem **enters the re-solve pool** when
its attempt history shows a struggle signal (all available today in
`problem_attempts`):

- any attempt with a non-empty `mistake_tag`;
- any attempt with `used_coach = 1` or `hint_count > 0`;
- solve time over a per-difficulty threshold (config, §12);
- difficulty = Hard (admitted unconditionally — Hard problems are worth
  maintaining even after a clean solve);
- manual force-admit from the UI.

A clean, fast, unaided solve of an Easy/Medium problem does **not** enter the
pool. The admission decision is recomputed after every attempt, so a problem
can join the pool late (e.g. a re-attempt during topic revision goes badly).

**Retirement:** after N consecutive clean re-solves (default 3) with FSRS
stability past a threshold (default ≥ 90 days), the problem is marked
`retired` and leaves the queue. Retired problems re-enter if a later attempt
shows a struggle signal. This keeps the pool a working set, not an archive.

**Backfill:** on first migration, admission rules run over the existing
`problem_attempts` history so the pool starts populated, with FSRS state
initialized as New and due dates staggered over the first weeks (never dump
the whole backlog on day one — same rule as catch-up compression).

## 5. Scheduling & grading

Per-problem **FSRS** via the existing `ts-fsrs` dependency, same state shape
as `cards` (§7 of the flashcard design). No SM-2 here — SM-2 remains
topic-only.

**Review mode: full re-solve, always.** The learner re-codes the problem from
scratch (in LeetCode or locally). No partial-credit "approach recall" mode
(rejected, §14).

**Rating is inferred from the outcome, with manual override** — mirroring the
warm-up self-grade pattern but defaulting to measured signals:

| Outcome | FSRS rating |
|---|---|
| Could not solve / gave up | Again |
| Solved with coach/hints (`used_coach` or `hint_count > 0`) | Hard |
| Solved cold, over time threshold | Good |
| Solved cold, under time threshold | Easy |

The completion UI shows the inferred rating and allows a one-tap override
(the learner knows "I solved it but it was ugly" better than the timer does).

**Lapse handling:** a problem that keeps rating Again (default: 4 lapses)
is a *problem leech*. Do not keep drilling it — flag the topic as needing
re-study (surface in the plan reasoning) and suspend the problem until the
topic's next revision session completes. This mirrors the card-leech
philosophy: repeated failure means the underlying understanding is gone, and
re-solving harder won't fix that.

## 6. Capacity model

- `RESOLVE_SLOTS_WEEKDAY` and `RESOLVE_SLOTS_WEEKEND` (integers, default
  values deliberately undecided — ship configurable, tune after ~2 weeks of
  real usage, then bake in defaults).
- The plan takes the `min(slots, due)` most overdue problems into
  `resolveSlots`; the remainder is deferred forward exactly like
  `compressQueue` (rescheduled, never stacked into a guilt-list).
- Re-solve slots are **additive to, not competitive with**, the primary
  topic's new problems. If total estimated duration exceeds the daily budget,
  the plan drops re-solve slots first (new learning keeps priority on
  weekdays; config can invert this for weekends later if wanted).
- `estimateDuration` gains a per-slot cost (rough: 30 min Medium, 45 Hard,
  20 Easy).
- **Escalation valve:** a problem overdue beyond `RESOLVE_ESCALATE_DAYS`
  (default 14) is force-promoted into a Today slot even when the day's
  capacity is 0, with the reason surfaced ("overdue 16 days — promoted").
  This bounds the cost of ignoring the Re-solve page (§10): the queue can be
  deferred, but decay past the threshold always breaks through. Promotions
  respect a hard cap of 1/day and follow normal deferral for the rest.

## 7. Data model

New table `problem_reviews` — one row per pooled problem, **local-only**
(never wiped by Notion pulls, same class as `problem_attempts` /
`card_embeddings`):

```
problem_reviews
  problem_id      TEXT PK REFERENCES problems(id)
  admitted_at     INTEGER NOT NULL
  admission_reason TEXT NOT NULL      -- 'mistake' | 'coach' | 'slow' | 'hard' | 'manual'
  retired         INTEGER NOT NULL DEFAULT 0
  suspended       INTEGER NOT NULL DEFAULT 0   -- leech suspension (§5)
  -- FSRS state, identical column set to `cards`:
  stability, difficulty, due, last_review, reps, lapses,
  state, elapsed_days, scheduled_days, learning_steps
  created_at, updated_at
```

Re-solve outcomes are recorded as **`problem_attempts` rows** (a re-solve *is*
an attempt — all existing signals apply), with one new column:

```
problem_attempts + kind TEXT NOT NULL DEFAULT 'solve'   -- 'solve' | 'resolve'
```

This keeps one attempt history per problem and lets admission (§4), analytics,
and mistake-derived card generation see re-solves for free. No separate event
log for v1; the attempt row plus FSRS columns carry enough state (revisit if
parameter tuning ever needs full review history).

Migrations: new numbered file in `database/migrations/` **and** the ordered
`MIGRATIONS` list in `integrations/src/sqlite/migrations.ts`.

## 8. Intelligence layer (pure, I/O-free)

New `ProblemReviewEngine` in `@dsa/intelligence`, same contract as the other
five engines — snapshot in, decision out, no I/O:

- `shouldAdmit(problem, attempts, config) → AdmissionDecision`
- `inferRating(outcome, config) → FsrsRating` (§5 table)
- `selectDueSlots(pool, capacity, now) → { active, deferred }` (overdue-first,
  compression semantics)
- `shouldRetire(state, config)` / `isLeech(state, config)`

FSRS state transitions themselves reuse the existing `ts-fsrs` wrapper
pattern from `fsrs.ts`. Registered on `IntelligenceOrchestrator`; the bulk of
new tests lives here, per house style.

## 9. Backend integration

- **`ProblemReviewService`** (services/): owns the pool — admission after each
  attempt, due-queue reads, outcome recording (write attempt row → infer
  rating → FSRS update → retire/leech checks). Wired in `context.ts`
  (repositories → services → orchestrator, added to `AppContext`).
- **`ProblemReviewRepository`** (repositories/): sole reader/writer of
  `problem_reviews` through `MirrorCache`.
- **`PlanService.buildPlan`**: adds `resolveSlots` to `StudyPlan` (capacity
  from config + day-of-week), reschedules deferred overflow, includes
  re-solve load in `estimatedDuration` and plan reasoning. Plan cache
  invalidation on outcome recording.
- **Routes** (thin, per house style):
  `GET /api/resolve/queue`, `POST /api/resolve/:problemId/complete`
  (outcome payload → inferred rating + optional override),
  `POST /api/resolve/:problemId/skip` (defer),
  `POST /api/resolve/:problemId/admit` (manual force-admit).
- **Session hook:** `SessionService` attempt recording triggers admission
  re-evaluation; a re-solve completed during a session counts toward session
  analytics like any attempt.
- **SSE:** emit queue-changed events on the existing `EventBus` so the Today
  tab updates live.

## 10. Frontend — hybrid surface (Rev 1.1)

The psychological constraint: for a 1–2 h/day learner, a Today page that
stacks new problems + re-solves + flashcards reads as five coding tasks and
produces permanent "behind" feeling even when the planner respects the
budget. The fix is separating *committed* work from the *browsable* pool.

**Today tab — committed slots only:**

- Renders only `resolveSlots` (capacity-fitted, usually 0–1 on weekdays;
  never the full due queue), as a **collapsed section** below the new
  problems: `▶ Re-solve (1 due)`. Expanding shows problem name, difficulty,
  LeetCode link, days overdue, and *why it's in the pool* ("2 mistakes, used
  coach last time") — the why is what makes the automated choice trustworthy.
- Escalation promotions (§6) render uncollapsed with their reason — they are
  the one thing not allowed to hide.
- Completion flow: mark outcome (solved cold / needed help / failed) + time;
  show inferred rating with one-tap override; skip button defers.

**Re-solve page — the full pool:**

- Dedicated page (or section under Review) listing every pooled problem:
  due/overdue/scheduled, admission reason, FSRS state, retire/suspend/
  force-admit controls. A due-count badge on the nav.
- This is where a self-declared revision day happens: work the queue top-down
  beyond today's capacity. Extra completions feed FSRS normally — doing more
  than the plan asks is always allowed, just never demanded.

## 11. Sync: local-only for v1

`problem_reviews` is never synced — same rationale as embeddings: scheduling
state is machine-local and Notion gains nothing from it. Re-solve *attempts*
already flow into session analytics. If Notion visibility is ever wanted
(e.g. a "problems on life support" view), it must go behind a `SyncTarget`
seam like the card bank — explicitly out of scope for v1, so **zero sync
work is required**.

## 12. Config (all via `loadConfig()` in `@dsa/shared`)

```
RESOLVE_SLOTS_WEEKDAY / RESOLVE_SLOTS_WEEKEND   # capacity (§6)
RESOLVE_SLOW_THRESHOLD_EASY/MEDIUM/HARD_MIN     # admission slow-solve cutoffs (§4)
RESOLVE_RETIRE_CLEAN_STREAK (3)                 # retirement (§4)
RESOLVE_RETIRE_MIN_STABILITY_DAYS (90)
RESOLVE_LEECH_LAPSES (4)                        # leech suspension (§5)
RESOLVE_ESCALATE_DAYS (14)                      # overdue force-promotion (§6)
```

## 13. Implementation stages

1. **Schema + backfill** — migration (`problem_reviews`, `attempts.kind`),
   admission backfill with staggered due dates.
2. **Intelligence** — `ProblemReviewEngine` + tests (admission, rating
   inference, slot selection/compression, retire/leech).
3. **Backend** — repository, service, `context.ts` wiring, routes,
   `PlanService.resolveSlots`, session hook, SSE.
4. **Frontend** — Today-tab section + completion flow.
5. **Tune** — run 2 weeks, pick capacity defaults, adjust thresholds.

Each stage lands with `pnpm build && pnpm lint && pnpm test` green; engine
tests carry the correctness burden (per house style).

## 14. Rejected alternatives

- **Manual weekend topic-switching** — rejected: selection quality is the
  whole problem (§2); manual choosing keeps the failure mode and adds chore.
- **Two-tier review (approach-recall first, full re-solve on failure)** —
  rejected by learner decision: recall-only passes give a weaker execution
  signal, and execution is precisely what this system exists to maintain.
  Cost is accepted and managed via admission strictness + capacity instead.
  Revisit if the pool outgrows the time budget even at strict admission.
- **Extending topic SM-2 to problems** — rejected: SM-2 state lives on
  Notion-synced `topics` and is legacy; FSRS is already in the codebase,
  better calibrated, and per-item state should be local-only.
- **Folding problems into the card bank as a card type** — rejected: cards
  are 10-second reviews with Notion-synced content; problems are 30-minute
  executions with local-only state, different capacity rules, and a
  different completion flow. Shared algorithm (FSRS), separate subsystem.
- **Unbounded due queue (pure Anki semantics)** — rejected: guaranteed
  flooding at 30 min/item; violates the catch-up-compression principle the
  system already established for topics.
- **Today-only surface (no separate page)** — rejected in Rev 1.1: even
  capacity-bounded slots stacked with new problems + flashcards read as an
  ever-growing task list for a 1–2 h/day learner.
- **Pure separate-page surface (badge only, nothing on Today)** — rejected
  in Rev 1.1: reintroduces the original failure mode — revision happens only
  if the learner remembers to open the page; badges become wallpaper. The
  escalation valve (§6) exists specifically to bound this risk; a collapsed
  Today section keeps committed slots visible without the pile-up feeling.
