# Pending records · Phase 1 §4.14 Specialized, icons and the Decode title

Written by the Specialized worktree (branch `worktree-agent-ad0d6edb90d5494b6`).
Merge the entries below into `docs/DECISIONS.md` (renumber `00XX` in order),
`docs/UI_DECISIONS.md` and `docs/PROGRESS.md`, then delete this file.

## 1. Decision entries (DECISIONS.md format)

## 00XX · 2026-09-27 · Canvas and virtualization dependencies
**Decision:** `@xyflow/react` 12.12.0 (MIT) for the canvas and
`@tanstack/react-virtual` 3.14.13 (MIT) for the log viewer, pinned in the
catalog and added to `@lumen/ui`. Transitive: `@xyflow/system` 0.0.83 (MIT),
`zustand` 4.5.7 (MIT), `classcat` 5.0.5 (MIT), `d3-zoom` / `d3-selection` /
`d3-drag` / `d3-interpolate` 3.x (ISC), `@tanstack/virtual-core` 3.17.11 (MIT).
Licenses read with `npm view`; both packages had releases within the last three
weeks (actively maintained). Only React Flow's structural `base.css` is loaded
(imported in `packages/ui/src/styles/canvas.css`, `@layer base`); every visible
part is a Lumen component, and its internal z-indexes stay inside the
`.react-flow` stacking context.
**Why:** SPEC tech stack names React Flow for the canvas; TanStack Virtual is
headless, small, and handles fixed and measured rows in one API.
**Rejected:** `react-window` (no dynamic row measurement without a second
package); hiding the React Flow attribution (the maintainers ask that only Pro
subscribers do so; it stays, restyled to tokens, 24 px target).

## 00XX · 2026-09-27 · Devicon marks vendored, provider marks stay monograms
**Decision:** Framework and database marks are Devicon 2.17.0 (MIT) "plain"
SVGs (Rust, Deno and MySQL only ship a single-shape "original"), normalised to
`fill="currentColor"` and vendored under `packages/ui/src/icons/vendor/` with
generated path data (`devicon-paths.ts`) so they render inline with no request.
`scripts/vendor-devicons.mjs` regenerates them from the pinned release;
`vendor/LICENSES.md` lists source, license and mark owner per file (including the
Go gopher CC BY 4.0 and Ruby logo CC BY-SA 2.5 attributions). Marks are
monochrome everywhere, including node headers; a `color` prop exists but no
brand tint is shipped. Provider marks are not vendored: `ProviderMark` draws
monogram tiles (`OC AWS GCP AZ HZ DO ?`), widening for three letters rather than
shrinking the type below 11 px.
**Why:** Phase 1 §5 chose Devicon; Signal allows one accent per view, and brand
colors in node headers would compete with it and need color literals outside
the token file. Provider marks require a recorded brand-guideline review first;
none was done, so the §5 fallback applies.
**Open:** owner decides whether to review provider guidelines and whether node
headers should carry brand tints (would add tokens to `colors.css`).

## 00XX · 2026-09-27 · Log viewer semantics: a list plus a separate live region
**Decision:** The scrollable log is `role="list"` (one tab stop, roving focus on
`role="listitem"` rows through arrow keys) and a visually hidden `role="log"`
region announces only the newest line, at most once a second, only while
`live`. Timestamps and `DBG` tags use `text-secondary`, not `text-muted`.
**Why:** `role="log"` cannot own list items (axe `aria-required-parent`), and a
live list of 50,000 lines must not be announced wholesale. Timestamps carry
information, so 0038 (muted text is never informative) wins over the §4.14
proposal.

## 00XX · 2026-09-27 · Log viewer follow mode
**Decision:** Following pins the list to the newest line. Scrolling more than
two rows up (or ArrowUp, Home, Space) pauses it, records where new output starts
(a 1 px accent boundary above that line) and shows "Jump to live" ("Jump to end"
when not live) only while lines exist below the viewport. End, the pill, or
scrolling to within half a row of the end resumes. `followOutput` can be
controlled; `defaultFollowOutput` and `newSinceIndex` set the initial state.
Copy feedback is an inline "Line copied" chip plus a polite announcement.
**Why:** SPEC C7 logs behaviour; the half-row threshold absorbs fractional
scroll offsets on high-density screens (found by the phone e2e run).
**Seam:** the "Line copied" chip stands in for the Toast component being built
in the feedback worktree; swap when it lands.

## 00XX · 2026-09-27 · ANSI colors map to token text tiers; backgrounds dropped
**Decision:** `parseAnsi` handles SGR 0–4, 22–24, 30–37, 39, 90–97, 38;5;n and
38;2;r;g;b and maps every foreground to one of six token classes
(`danger-text`, `success-text`, `warning-text`, `info-text`, `accent-text` for
magenta and cyan, `text-secondary` for black, white and greys). Backgrounds are
parsed and ignored; other CSI and OSC sequences (cursor moves, hyperlinks) are
stripped, and a sequence cut off at the end of a line never leaks an ESC
character. Output is plain segments rendered as spans, never HTML.
**Why:** every text color then holds 4.5:1 in both themes; background colors
from build tools would break contrast and the calm panel.

## 00XX · 2026-09-27 · Canvas opens at 100 % and pauses edge flow while moving
**Decision:** `CanvasFlow` centres the scene at exactly 100 % on first render
(`fitViewOptions` min and max zoom 1), mounts only elements in view, hides the
8 px grid below 60 % zoom, and pauses the Signal edge flow (`.edge-flow`) while
the viewport pans or zooms (`data-moving` toggled on the DOM from React Flow's
move events, no re-render). Nodes are never draggable or selectable in Phase 1.
**Why:** at fitted zoom levels under 100 % node links and group labels shrink
below the 24 px WCAG 2.5.8 target (axe failed the gallery); measured on a
production build, 30+ animated dashes repainting over a moving layer cost
frames while panning (57 → 60 fps with the pause), and the dense 8 px pattern
is noise when zoomed out.
**Seam:** Phase 05 wires selection, dragging, the node context menu (the
component exposes `onContextMenu` for Shift+F10 / right click) and keyboard
nudging.

## 00XX · 2026-09-27 · Decode title
**Decision:** `DecodeText` resolves a display title left to right from glyph
noise in 9 steps over 324 ms (hard cap 360 ms, DECISIONS 0032), once per mount
or `replayKey` change. The server renders the final text; during the decode the
final text is the accessible name (sr-only) and an invisible copy sizes the box
so layout never moves. Reduced motion (OS or `data-reduced-motion="true"`)
shows the text immediately. Every gallery component page title uses it.
**Why:** Signal's "the system is live" arrival, without layout shift or an
unreadable accessible name.

## 00XX · 2026-09-27 · Specialized gallery pages and performance evidence
**Decision:** The gallery gains pages for Log viewer, Canvas, Canvas node,
Volume chip, Canvas group, Canvas edge, Stepper, DNS record card, Port check
card and Decode title, plus two bespoke performance pages, `logs-perf` (50,000
lines streaming five per second) and `canvas-perf` (10 × 10 services, 90
references), both in `registry.json` so axe covers them. Fixture data lives in
`@lumen/ui/fixtures` (not the main barrel). `e2e/scripts/perf-logs.mjs` and
`perf-canvas.mjs` record every animation frame (and optionally a Chrome trace)
into `docs/evidence/phase-01/perf/`.
**Why:** Phase 1 §5 Performance and §8 evidence require fps readouts at the
stated sizes.

## 2. UI_DECISIONS rows (§5 / §4.14 proposals confirmed or changed)

| Area | Phase 1 proposal | Specialized value | Why |
|---|---|---|---|
| Log line | Mono 13 / 20 px; dense 12 / 18 | confirmed | — |
| Log timestamp | 88 px, `text-muted`, `HH:mm:ss.SSS` | 88 px, `text-secondary`, same format | 0038: informative text is never muted |
| Level tag | 40 px; ERR danger-text, WRN warning-text, INF text-secondary, DBG text-muted | same, DBG `text-secondary`; tags in mono caps tracking | 0038 |
| stderr marker | 2 px danger bar at 60 % | confirmed | — |
| JSON toggle | 14 px chevron-right, keys accent-text, 16 px indent, "Copy JSON" | confirmed; the chevron is pointer-only, Enter on the focused line toggles | Rows are 20 px; separate buttons would fail the 24 px target |
| Search highlight | warning 30 % background | warning 30 % with primary text on the mark; current-match line tinted warning-subtle | danger text on the amber mark measured 3.15:1 |
| Jump to live | secondary sm, arrow-down-to-line, surface-raised, 16 px from bottom, fades in `--dur-fast` | confirmed; only shown when lines exist below | — |
| New-lines boundary | 1 px accent line | confirmed | — |
| Offline banner | "Server offline — showing logs up to 14:02" | confirmed; warning-subtle band with a warning icon | — |
| Canvas node | 260 × 120, radius card, hover border-strong, selected 2 px accent ring + accent-subtle | 260 × 120, radius 2 (Signal), HUD brackets that spread 3 px on hover, selected = accent frame + 1 px ring + glow + accent-subtle tint; multi-select without glow | Signal direction |
| Node header | 20 px icon, name 14/600, status pill | 20 px mark, name mono 14/500 (`card-title`), `[ ■ STATUS ]` tag sm | Signal type and status notation |
| Node URL / meta | 12 secondary, external-link on hover; "No public URL"; "Private only" for databases; schedule for cron | confirmed; URL in mono; database rows show a lock | — |
| Node chips | replica ×N and server badges, outline | confirmed (mono caps badges); long server names truncate | — |
| Server offline | 2 px warning ring + 14 px alert-triangle with tooltip | confirmed; the triangle is a 24 px focusable target | tooltip must be keyboard reachable |
| Dragging | opacity 0.9 + shadow-raised | confirmed (dark theme has no drop shadows, so only opacity shows) | — |
| Volume chip | 260 × 36, dashed border, 16 px hard-drive, mono 12 middle-truncated path, "1.2 / 5 GB", 40 × 3 bar (accent / warning > 80 % / danger > 95 %), 2 × 8 stem | confirmed; dashed border-strong | — |
| Canvas group | radius 14, border-strong 60 %, 4 % fill, 28 px label pill with dot | radius 2, dashed border-strong 60 % (solid 100 % selected), 4 % fill (8 % as drop target), 28 px label tab on the top edge with an 8 px square marker, mono caps label and a zero-padded count | Signal (square corners, HUD tab from the direction page) |
| Canvas edge | 1.5 px dashed 4 4, text-muted, smooth-step 12 px corners, 6 px arrow, accent solid on hover/selected, label chip, dimmed 40 %, no dash animation | same, plus the Signal edge flow (accent 2 / 14 dashes moving in 1.4 s) that stops under reduced motion and while the canvas moves | UI_DECISIONS Signal table replaces "no dash animation" |
| Fan-in | 12 px per edge | confirmed | — |
| Canvas grid | 24 px dots | 8 px lines above 60 % zoom + 96 px major lines | Signal grid; dense pattern hidden when zoomed out |
| Stepper | 24 px numbered circles, 2 px rails, label 13/500 | 24 px square markers (radius 2), mono 12 numbers, labels in mono caps (`label`), current accent-fill, done success check on success-subtle, rails turn success when done | Signal: round only for avatars |
| Stepper mobile | "Step 3 of 6" + 2 px bar | confirmed below 640 px (`collapse="auto"`) | — |
| DNS record card | surface, padding 16, three CopyFields sm with 12 px labels, status row | confirmed; labels in mono caps; status sentence takes its own line on phones | 390 px screenshot |
| Port check card | 40 px rows, port mono 13, status icons, fix disclosure, numbered steps with CodeBlocks | confirmed; phones stack the label under the port; commands wrap | 390 px screenshot |
| Provider mark | 20 × 20 rounded tile | 20 / 24 / 32 square tiles (radius 2), mono caps; three-letter monograms widen the tile | never below 11 px type |
| Decode title | < 360 ms, once per page (DECISIONS 0032) | 9 steps × 36 ms = 324 ms | — |

## 3. Done, known gaps, numbers

### Done
- Components (in `packages/ui/src/components/`): `ansi.ts` (parser),
  `LogViewer`, `CanvasNode`, `CanvasNodeSkeleton`, `VolumeChip`, `CanvasGroup`,
  `CanvasEdge`, `CanvasFlow`, `Stepper`, `DnsRecordCard`, `PortCheckCard`,
  `DecodeText`. Icons: `FrameworkIcon`, `DatabaseIcon`, `ProviderMark` with 15
  vendored Devicon marks.
- Gallery: 10 new component pages (53 new examples), icons page extended,
  `logs-perf` and `canvas-perf` pages; page titles decode.
- Tests: `@lumen/ui` Vitest 216 passing (143 before this work; +73:
  14 ANSI parser, 17 log viewer incl. virtualization windowing and follow mode,
  42 in `specialized.test.tsx` covering node states and statuses, rename, volume
  usage, group keys, edge labels, stepper `aria-current`, DNS and port cards,
  decode incl. reduced motion, icons; the registry test renders every new example).
- Playwright: `e2e/tests/specialized.spec.ts` 8 tests × 6 projects = 48, green
  (also 144/144 with `--repeat-each=3`); full `gallery.spec.ts` 24/24 green
  across 6 projects (axe on every page including the two performance pages).
- Screenshot baselines: 318 new (53 examples × 6 projects); gallery total now
  600 (100 examples × 6). Existing baselines unchanged.
- Performance, production build (`next build` + `next start`), headless Chrome
  153, Windows 11 dev machine shared with other running suites, 1440 × 900:
  - Log viewer, 50,000 lines + 5 lines/s streaming: steady scroll (180 frames at
    60 px/frame) **60 fps, p95 16.7 ms, 0 dropped** in every final run; stress
    jumps (a full new window every frame) 51–60 fps, p95 16.8–33.3 ms. ~61 rows
    in the DOM. After "Jump to live": following, 0 px from the end.
    `docs/evidence/phase-01/perf/logs-50000.{json,png}`; traced run
    `logs-50000.traced.json` + `logs-50000.trace.json.gz`.
  - Canvas, 100 services / 90 references at ~76 % zoom (25 nodes mounted): pan
    **59.8 fps, p95 16.7 ms, 1 dropped frame** (range 58.5–60 across runs);
    wheel zoom steps 55.6 fps, p95 33.3 ms (text re-rasterises at each scale
    step). `canvas-100.{json,png}`, `canvas-100.traced.json`,
    `canvas-100.trace.json.gz`.
  - Dev server numbers are lower (React development build): logs 48 fps and
    canvas 53 fps before the fixes; the budgets are stated for production.

### Known gaps
- Zooming the canvas holds ~55 fps rather than 60 on this machine; panning
  meets the budget. Revisit with Phase 05's real canvas (e.g. `will-change`
  during zoom gestures).
- Zoomed below 100 % by the user, canvas targets shrink under 24 px; the first
  view is 100 % and keyboard users reach every node by Tab regardless.
- The log viewer's "Line copied" chip and the port-check command block are
  minimal internal stand-ins for Toast and CodeBlock (other worktrees); swap
  when those land.
- Provider marks are monograms until a brand-guideline review is recorded in
  `vendor/LICENSES.md`; Devicon brand tints are not used.
- The 100-node scene cycles every service status, so it is visually busier
  than a real project.
- Screenshot baselines are Windows-rendered, like the rest of the gallery
  (existing known gap: Linux baselines in CI).
- The keyboard spec for overlays (`gallery-keyboard.spec.ts`) belongs to the
  overlays worktree; the Specialized keyboard paths are in
  `specialized.spec.ts`.
