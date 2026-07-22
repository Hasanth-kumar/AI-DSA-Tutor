# CSS dead-selector inventory

Cleanup applied (Phases 1–3). Numbers vs original (~8,413 lines).

| File | Before | After | Δ |
|---|---|---|---|
| `global.css` | 4,793 | 3,597 | **−1,196** |
| `design.css` | 3,620 | 3,282 | **−338** |
| **Total** | **8,413** | **6,879** | **−1,534 (~18%)** |

## Coach/graph overlap pass (per-block)

The 41 classes defined in both files are **not** duplicates — they are a deliberate
**base layer (`global.css`) + override layer (`design.css`)** for the same live components.

- 84 global declarations are overridden by `design.css` (render-neutral base+override cascade — **kept**, since `global.css` stays a complete standalone base and shredding it couples the files for ~1% gain).
- 139 global declarations are unique and still active.
- **3 fully-dead rules removed** (every property overridden by design): `.graph-fit-btn`, `.coach-layout--empty .coach-settings-bar` (exact dup), and the mobile `@media .coach-layout { padding }`.

## What was done

1. **Phase 1:** Removed duplicate `:root` tokens from `design.css` (palette stays in `global.css`).
2. **Phase 2:** Removed dead v1 rules from `global.css` (`.app-shell`, `.stat-card`, `.brand-icon`, old `.nav`/`.sidebar`, etc.) plus never-matching `.app-shell` (non-v2) compound selectors.
3. **Phase 3:** Removed unused prototype rules from `design.css` (`.brand-v2`, `.streak-widget`, `.search-pill`, `.nav-v2-rail`, unused focus-hero extras, etc.).
4. **Restored** styles applied via HTML strings / helpers (not `className=`): `.coach-code-*` (`renderMarkdown.ts`), `.overview-stat-hint*`, `.activity-pct--*`.

## Method notes

- Usage detection: `className=` (including nested ternaries in templates) + `class="..."` HTML strings + BEM `--modifier` when base is used + dynamic prefixes (`heatmap-cell-v2--`, `diff-`, etc.).
- Overlap classes (coach/graph shared between both files) were **not** bulk-deleted — still need per-block review if you want more cuts.

## Safe to delete this file

This audit note is optional documentation; remove when no longer needed.
