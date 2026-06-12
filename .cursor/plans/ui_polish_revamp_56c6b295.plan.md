---
name: UI Polish Revamp
overview: "Polish the existing warm-charcoal/coral UI for consistency and professionalism: clean up the token system, add skeleton loaders and empty states, refine micro-interactions, fix the knowledge graph readability, and close accessibility gaps — without changing the visual identity."
todos:
  - id: tokens
    content: "Clean up token system: define --surface, spacing scale, tokenize hardcoded colors, remove dead/duplicate CSS"
    status: pending
  - id: skeletons
    content: Add Skeleton component and replace all Loading… text with content-shaped skeletons
    status: pending
  - id: empty-states
    content: Add consistent empty-state pattern across heatmap, revision queue, weak topics, LeetCode card
    status: pending
  - id: micro
    content: "Polish micro-interactions: card hover, button press/focus, stat number typography, nav indicator, modal animation, reduced-motion"
    status: pending
  - id: graph
    content: "Fix knowledge graph: label collision, label halo, zoom/pan with fit-view, theme-aware colors"
    status: pending
  - id: a11y
    content: "Accessibility pass: aria-current nav, dialog semantics + focus trap, heatmap buttons, missing aria-labels"
    status: pending
  - id: inline-styles
    content: Replace inline styles with shared utility classes for consistent spacing
    status: pending
  - id: verify
    content: Verify all tabs in both themes at desktop and mobile widths in the browser
    status: pending
isProject: false
---

# UI Polish Revamp (refined warm identity)

All work is in [packages/frontend/src](packages/frontend/src). The look stays in the warm charcoal + coral family, but the palette is refined to feel cleaner, more professional, and more minimal: lower saturation, tighter contrast steps, calmer accent usage.

## 0. Refined palette — `styles/global.css`

Replace the current token values in `:root` and `:root[data-theme="light"]` (same variable names, no component changes needed beyond what section 1 covers).

Dark theme — pull backgrounds closer to neutral (keep only a hint of warmth), desaturate the accent, soften the cream text:

- Backgrounds: `--bg: #171615`, `--bg-elevated: #1d1c1a`, `--bg-card: #232120`, `--bg-surface: #292725` — evenly spaced ~6 lightness steps instead of today's uneven warm-brown jumps.
- Borders: `--border: #34312d`, `--border-soft: #2b2926` — hairline feel, less visible warm tint.
- Text: `--text: #ece9e4` (less cream), `--text-muted: #98918a`, `--text-subtle: #6b655e` — bump muted contrast slightly for readability.
- Accent: `--accent: #c9744a` (desaturated coral), `--accent-hover: #d68155`, `--accent-soft: rgba(201, 116, 74, 0.12)`, `--accent-ring: rgba(201, 116, 74, 0.32)`. Accent is used more sparingly: active nav, primary buttons, links, focus rings — not large fills.
- Semantic colors desaturated to sit quietly: `--success: #5bb98c`, `--warning: #d3a04f`, `--danger: #d97b7b`; keep the existing `-soft` pattern at 0.10–0.12 alpha.
- Shadows: reduce intensity one step (`--shadow-sm: 0 1px 2px rgba(0,0,0,0.3)`, `--shadow: 0 4px 10px rgba(0,0,0,0.35)`) — borders carry hierarchy, shadows stay subtle.

Light theme — whiter, less beige, so it reads professional rather than parchment:

- `--bg: #faf9f7`, `--bg-elevated: #f3f1ee`, `--bg-card: #ffffff`, `--bg-surface: #f0eeea`.
- `--border: #e0dcd5`, `--border-soft: #e9e6e0`.
- `--text: #26221e`, `--text-muted: #6f6a62`, `--text-subtle: #a09a91`.
- Accent: `--accent: #b85c30`, hover `#c96a3c` (slightly deeper for AA contrast on white).
- Shadows keep the warm-gray tint but drop one intensity step, matching dark.

## 1. Token system cleanup — `styles/global.css`

- Define the missing `--surface` / `--surface-raised` variables (currently referenced by curriculum styles but never defined → broken backgrounds). Alias them to `--bg-surface` / `--bg-card` or replace usages.
- Add a small spacing scale (`--space-1` … `--space-6`) and use it in `.main`, `.grid`, `.card` so gaps stop varying (1rem / 1.1rem / 1.25rem ad hoc today).
- Tokenize hardcoded colors:
  - Heatmap levels (`#3a2a1a`, `#7a4520`, `#b55e2e`) → `--heat-1..4` with light-theme overrides.
  - `KnowledgeGraph.tsx` `GRAPH_COLORS` hexes → read from CSS variables so the graph respects light mode.
  - `StatsCards.tsx` inline rgba → `--accent-soft` / `--success-soft`; `ScoreBar.tsx` `#7a9ec9` → new `--info` token.
- Delete dead CSS: `.coach-page` / `.coach-chat` mobile rules (component uses `.coach-layout`), unused `.badge-easy|medium|hard` legacy classes, duplicate `page-header` backwards-compat block.
- Unify on one difficulty badge system (`.diff-badge`).

## 2. Skeleton loaders

- Add a `Skeleton` component + shimmer keyframes; replace every `Loading…` text card (App.tsx Suspense fallback, OverviewPage charts, ActivityPage, TodayPage revision queue) with content-shaped skeletons (stat-card row, chart block, list rows). This removes the most amateur-feeling part of the current UI.

## 3. Empty states

- Design one consistent empty-state pattern (small icon, one-line message, optional action) and apply to: zero-session heatmap, empty revision queue, no weak topics, unconfigured LeetCode card (currently styled as an error banner in `ActivityPage.tsx` — switch to a neutral info style).

## 4. Micro-interactions and detail polish

- Cards: subtle hover elevation (border lightens + `--shadow-sm`), consistent 1px borders.
- Buttons: pressed scale (0.98), consistent focus-visible ring using `--accent-ring`, smoother transitions (keep 0.15s).
- Stat cards (`StatsCards.tsx`): numbers currently render in mono with odd zero glyphs — use Inter with `font-variant-numeric: tabular-nums` for large stats.
- Sidebar: active nav item gets a refined indicator (soft accent background + left/bottom rail) and `aria-current`; smooth icon transitions on mobile bottom nav.
- Shortcuts modal: fade/scale-in animation.
- Respect `prefers-reduced-motion` with a global media query.

## 5. Knowledge graph readability — `components/KnowledgeGraph.tsx`

The graph is currently the messiest screen: heavy label overlap, labels colliding with nodes.

- Add collision force sized to label width (or `forceCollide` with measured text length) so labels stop overlapping.
- Give labels a theme-aware halo (paint-order stroke with `--bg`) for legibility.
- Add zoom + pan (`d3-zoom`) since ~50 nodes don't fit; add a "fit view" reset button.
- Pull node/legend colors from CSS variables (per section 1) so light theme works.

## 6. Accessibility pass

- Nav buttons: `aria-current="page"` on the active tab.
- Shortcuts overlay: `role="dialog"`, `aria-modal`, focus trap, focus returns to trigger on close.
- Heatmap day cells (`ActivityHeatmap.tsx`): switch clickable `<div>`s to `<button>`s with `aria-label`.
- Theme toggle and coach send button: add `aria-label`s.

## 7. Inline-style cleanup

- Replace the ~50 inline `style={{...}}` margins/font-sizes in pages and components with a few utility classes (`.mt-0`, `.text-sm`, `.muted`, grid gap modifiers) defined once in `global.css`. Mechanical, but it's what makes the spacing finally consistent.

## Verification

- Visual check of all 6 tabs in both themes via the running dev server (Vite on :5173), desktop and mobile widths, comparing against the screenshots taken during research.
- Spot-check WCAG AA contrast for the new tokens: `--text-muted` on `--bg-card`, `--accent` on `--bg`/white (buttons, links), and badge text on `-soft` backgrounds.
