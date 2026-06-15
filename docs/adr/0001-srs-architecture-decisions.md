# ADR 0001 — SRS / scheduling architecture decisions

Status: **Accepted** (2026-06-15)
Scope: Phase 0 of `IMPLEMENTATION_CHECKLIST.md`. These are binding rules for all
subsequent phases (single SRS path, persisted SM-2 state, safe/merge sync,
"Again" warm-up behavior). They are cheap to write now and expensive to retrofit.

---

## Decision A — The app owns scheduling

SQLite + `RevisionEngine` are the **single source of truth** for `nextRevisionAt`
and all SM-2 state (interval, repetition, ease factor).

- Notion is a **dashboard / mirror**, never the authority for schedule fields.
- A Notion pull may update mirrored content (title, status, tags, notes) but must
  **never** overwrite or clear locally-owned scheduling fields.
- If Notion and local disagree on a schedule field, **local wins**.

Affected code: `packages/intelligence/src/revision-engine/RevisionEngine.ts`,
`packages/integrations/src/sqlite/sync.ts`.

## Decision B — SM-2 and execution analytics stay separate

Two independent models, intentionally not merged:

- **SM-2** models *memory* — "will I forget this?" Drives `nextRevisionAt` and the
  review interval. Inputs: recall grades only.
- **Execution analytics** (confidence, weakness signals, solve time) model
  *execution* — "can I actually solve this?"

They combine in **exactly one place**: the Priority Engine
(`packages/intelligence/src/topic-priority-engine/TopicPriorityEngine.ts`), and
only as **soft influence** — execution signals reorder *practice recommendations*
but must **never** alter SM-2 intervals or `nextRevisionAt`.

Corollary (deferred, do not build now): confidence/weakness directly shortening
SM-2 intervals, or weakness overriding the schedule. Revisit only after 2–3 months
of real usage data.

## Decision C — "Again" (Forgot) re-queue policy

A "Forgot" grade in warm-up **re-queues the question at the end of the current
warm-up queue** (not shown again immediately).

Rationale: fits the 5-minute warm-up loop — the user cycles through the other
questions first, giving a short spaced gap before the retry, instead of
immediate re-exposure. A safety cap (max 2 extra passes per question, then
auto-advance with the last grade) prevents an infinite loop.

Affected code (Phase 4): `WarmupCard` in `packages/frontend`.

---

## What these decisions forbid

- Warm-up grading **and** session logging both writing `nextRevisionAt` for the
  same topic on the same day (Phase 1 enforces a single path).
- `RevisionEngine` reconstructing SM-2 interval from `revisionCount` or ease from
  `confidence` instead of reading persisted `sm2_*` state (Phase 2).
- Sync wiping-and-reinserting topics in a way that drops scheduling fields
  (Phase 3 switches to merge).
