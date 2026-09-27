# Pending: Phase 1 feedback, status and data display (§4.11–§4.13)

Merge these into `docs/DECISIONS.md`, `docs/UI_DECISIONS.md` and
`docs/PROGRESS.md`, renumbering the `00XX` entries.

## 1. Decision entries (DECISIONS.md format)

## 00XX · 2026-09-27 · Data-display dependencies and licenses
**Decision:** Added to `@lumen/ui`, pinned in the catalog; licenses read from
the installed packages.

| Package | Version | License | Role |
|---|---|---|---|
| @tanstack/react-table | 9.2.4 | MIT | Sorting and selection state for `DataTable` |
| @tanstack/react-virtual | 3.14.13 | MIT | Row virtualization (5,000 rows at 60 fps) |
| uplot | 1.6.32 | MIT | Canvas time-series charts |
| @radix-ui/react-dropdown-menu | 2.1.24 | MIT | Row actions menu in `DataTable` |
| motion | 13.4.4 | MIT | Toast enter, exit and stack re-flow (already pinned in 0025) |

`@lumen/shared` (workspace) is now a dependency of `@lumen/ui` so the error
card takes the real `LumenError` type.
**Maintenance:** TanStack Table 9 shipped 2026-08-04 (9.2.4 on 2026-08-28) and
is the maintained major; 8.x has had no release since 2025-04. TanStack Virtual
released 2026-09-14. uPlot's last release is 2025-03-14; it is stable,
dependency-free and 50 kB, and the API surface Lumen uses (options, hooks,
`setCursor`, `setSeries`, `valToPos`, cursor sync) has not changed in years.
Radix DropdownMenu released 2026-07-31.
**Rejected:** a diff library (the viewer compares settings field by field, not
text); `@radix-ui/react-toast` (its region uses `aria-live="off"` with its own
announcer, which contradicts the spec's polite region with `role="alert"` for
danger toasts, and it has no "max three" stack).

## 00XX · 2026-09-27 · DataTable hides TanStack's types behind plain columns
**Decision:** Callers describe columns as `{ id, header, value?, cell?, size,
align, sortable, mono, tabular, hideInCards }` with plain functions;
`DataTable` converts them to TanStack Table 9 column definitions internally
(with its own comparator, so no sort-function registry is needed). Sorting and
selection can be controlled (`sorting` / `selectedKeys`) or left to the table.
The table stays a real `<table>`; virtualization renders only the rows in view
between two spacer rows, so native table semantics, `aria-rowcount` /
`aria-rowindex` and the sticky header keep working.
**Why:** Table 9's feature-typed generics are heavy for page code and change
between majors; one adapter keeps every page on a small, stable API.

## 00XX · 2026-09-27 · Toasts come from a module store, not a context
**Decision:** `toast({...})` writes to a tiny module-level store read by
`<Toaster>` with `useSyncExternalStore`; `toast.dismiss(id?)` and
`activeToasts()` complete the API. The Toaster keeps three, removes the oldest
from the store when a fourth arrives, pauses a toast's JavaScript timer on
hover, keyboard focus and window blur, handles F8 (focus newest, remembering
where focus was) and Escape (close focused, focus returns). Closing toasts are
marked `data-state="closing"` and `aria-hidden` while their exit plays.
**Why:** Mutations and event handlers need to toast without threading a
context; JavaScript timers (not CSS animation end) make Playwright's fake clock
and Vitest fake timers able to test dismissal.

## 00XX · 2026-09-27 · Chart colors are read from tokens at draw time
**Decision:** `Chart` reads `--color-*` and `--font-mono` with
`getComputedStyle` when it builds the uPlot instance and rebuilds on a
`data-theme` change. Area fills convert the token hex to `rgba()` at 12 %
at runtime. Only uPlot's structural CSS is vendored, restyled with tokens, in
`packages/ui/src/styles/chart.css`; uPlot's legend is off and the legend,
limit line, markers and tooltip are HTML overlays styled with utilities.
y ticks are round steps (0 / 200 / 400 / 600) and x ticks are round minutes
strictly inside the range so edge labels never collide.
**Why:** Canvas cannot use CSS variables; this keeps "tokens only" true and
both themes correct.

## 00XX · 2026-09-27 · Terminals scope themselves to the dark tokens
**Decision:** `TerminalFrame` puts `data-theme="dark"` on its inner screen, so
every token inside resolves to the dark palette in both themes; the outer
1 px `border-strong` frame stays in the page's theme.
**Why:** SPEC wants terminals dark in both themes without new color tokens or
literals.

## 00XX · 2026-09-27 · Status gaps closed with the Signal components
**Decision:** §4.12's `StatusDot` / `StatusPill` are not built; the Signal
`StatusMarker` / `StatusTag` (0030, session 3) replace them. The one missing
piece, `AvatarStack`, is added (max 4 then "+N", 2 px surface ring, hover lifts
within an isolated stacking context, `role="group"` with "Members: …").
`LiveRegion` is added as the shared polite announcer used by progress steps
and chart keyboard moves.

## 00XX · 2026-09-27 · Gallery test timeout
**Decision:** `e2e/tests/gallery.spec.ts` allows 6 minutes per test (was 3).
**Why:** The axe and screenshot tests walk every gallery page in one test; with
16 more pages the desktop runs took about 2.7 minutes, too close to the old
limit.

## 2. UI_DECISIONS rows (Direction D vs the Phase 1 proposals)

| Area | Phase 1 proposal | Value built | Why |
|---|---|---|---|
| Toast | 360 × ≥48, padding 12/16, radius card, raised, 16 px variant icon, title 14/500, body 13, 2 px timer bar | Confirmed; radius is Signal's 2 px; frame `border-strong`; close button shown on hover/focus (always on touch); full width minus 16 px gutters under 640 | — |
| Toast motion | spring from +8 px; exit −8 px in 120 ms | Confirmed (`springToast`, exit 120 ms); reduced motion: opacity only, 80 ms, no layout re-flow | — |
| Alert | tint 8 %, border 40 %, icons info / alert-triangle / alert-circle | Tint uses the existing single 10 % `-subtle` token; border 40 %; compact 36 px; global banner square with no side borders; action wraps below when the text needs the width | One subtle tint per status (UI decision 2026-09-26) |
| Progress steps | 24 px circles; done check in `accent-ink`; active pulsing dot | 20 px squares (radius 2), active = warning frame with an 8 px blinking square; done/failed fills with the glyph in `bg` ink (dark check on bright green reads better than white); labels mono caps 11; duration meta tabular; after a failure only the shapes dim (text keeps 4.5:1); under 640 px the bar keeps its markers and one caption line names the current step | Round only for avatars; axe contrast |
| Empty state | 40 px icon in a 64 px raised circle; title 16/600; max 420 (hero 560) | Icon in a 64 px (hero 80 px) raised square with HUD brackets; title sans 16/600 (hero: pixel page title); max 420, or 560 when it carries three or more tiles; tiles mono caps title + sans line | Square instrument corners |
| Error card | 20 px alert-circle, title 16/600, fix with sparkles, primary action, raw in CodeBlock ≤200 px | Confirmed; the catalog code shows as a mono eyebrow at the top right (hidden under 640); support id as mono meta | Code helps support without a click |
| Data table | header 36, 12/500 secondary; rows 40 / dense 32; selected accent-subtle; actions 40 px at 40 % opacity | Header in the mono-caps `eyebrow` style; rows 40 / 32; actions column 48 px, 28 px trigger at 40 % opacity, 100 % on row hover/focus; sort icon `chevrons-up-down` → `chevron-down` (rotated for ascending); checkbox 16 px with a 24 px hit area; dense also from an ancestor `data-density="compact"` | Signal chrome voice; no new icon needed |
| Chart | 32 px y axis, 20 px x axis, 11 px tabular labels, grid 60 %, 1.5 px lines, 12 % area, dashed warning limit, deploy ticks with 6 px triangle, 8 px OOM dots | Confirmed except the y axis is 36 px (mono labels such as "600" and "100%" need it) and labels are Geist Mono (tabular by construction) | Fit |
| Code block | light background `#F3F3F0`; comments `text-muted` | Page `bg` token in both themes; comments `text-secondary` (text-muted fails 4.5:1 and comments are real text); line numbers are CSS counters (never selected, copied or read) | Tokens only; contrast |
| Terminal frame | `#0B0D10` background | `--color-terminal-bg` via a dark-scoped subtree; dock resize grip on the top edge (a bottom dock grows upward) | No literals; direction of resize |
| Diff viewer | rows 32; field 40 % mono; removed/added at 8 % tint | Rows 32; tints use the 10 % `-subtle` tokens; side-by-side becomes inline under 640 px | Values wrapped into slivers at 390 px |
| Avatar stack | overlap −6 / −8, 2 px surface ring, +N tile | Confirmed | — |

Screenshots: `e2e/__screenshots__/gallery.spec.ts/{toast,alert,progress-steps,empty-state,error-card,avatar-stack,data-table,chart,code-block,terminal-frame,diff-viewer}--*.png`
(50 examples × 6 projects = 300 files).

## 3. Done, known gaps

### Done (2026-09-27)
- Components in `packages/ui/src/components/`: `Toast`, `Toaster`, `toast()`,
  `Alert`, `ProgressSteps`, `LiveRegion`, `EmptyState`, `ErrorCard`,
  `AvatarStack`, `DataTable`, `Chart`, `ChartSyncGroup`, `CodeBlock`,
  `TerminalFrame`, `DiffViewer`; registered as 16 gallery pages (Feedback:
  toast, alert, progress steps, empty state, error card; Status: avatar
  stack; Data display: data table, chart, code block, terminal frame, diff
  viewer). Skeleton, StatusMarker/StatusTag, Badge, Avatar, Kbd, Spinner and
  the format helpers already existed and were reused.
- Unit tests: 219 in `@lumen/ui` (76 new: `feedback.test.tsx` 49 including
  one ErrorCard integration test per catalog code (26), `data.test.tsx` 27).
- Playwright: `feedback-data.spec.ts` (6 tests × 6 projects); gallery spec
  green in all six projects with 582 baselines (300 new) and axe clean on
  every page.
- Performance (`node e2e/scripts/table-perf.mjs <url> <label>`, headless
  Chromium, 1440 × 900):
  - Production build: table 5,000 rows scrolled 40 px/frame, 240 frames,
    **60 fps**, median 16.7 ms, p95 16.8 ms, max 16.8 ms, 0 frames over 25 ms,
    38 rows in the DOM. Four synced charts × 3,600 points, pointer sweep:
    **60 fps**, max frame 16.8 ms, 0 long frames, all four crosshairs moved.
    Trace: `docs/evidence/phase-01/perf/table-5000-production.trace.json`.
  - Dev server (React development build): table 54.8 fps (21 frames over
    25 ms), charts 55.8 fps (9 over 25 ms). Recorded for comparison only.

### Known gaps
- Row actions use Radix DropdownMenu directly inside `DataTable`; switch to the
  shared `DropdownMenu` component from the overlays work once both land.
- `ErrorCard` does not yet render a CopyField-style command for any catalog
  entry (none uses `kind: "command"`); the gallery shows it with a
  hand-built error.
- Chart time labels use the browser's local time zone; screenshot baselines
  were taken on a +05:30 machine and will differ on a UTC CI runner (same
  Linux-baseline gap as the rest of the gallery).
- Toast exit animation does not run under Playwright's fake clock (Motion's
  frame loop); the e2e test counts open toasts via `data-state` instead.
- Alert "inside a modal" and TerminalFrame "full-panel" examples wait for the
  overlays work (Modal) and Phase 14 (xterm mount).
- Dense mode reads `data-density="compact"` from an ancestor once on mount;
  a live toggle needs a remount (the account preference arrives in Phase 15).
