# Pending: Phase 1 §4.9 Overlays and §4.10 Navigation

Written by the overlays/navigation session for the coordinator to merge into
`docs/DECISIONS.md`, `docs/UI_DECISIONS.md` and `docs/PROGRESS.md`. Decision
numbers are "00XX"; renumber on merge.

## 1. DECISIONS.md entries

## 00XX · 2026-09-27 · Overlay and navigation dependencies
**Decision:** Radix `react-dialog` 1.1.23, `react-dropdown-menu` 2.1.24,
`react-context-menu` 2.3.7 and `react-tabs` 1.1.21, all MIT, pinned in the
catalog. Versions checked with `npm view` on 2026-09-27 (latest, last published
2026-07-31, same release train as the Radix packages already in use). Dialog
1.1.23 is the version cmdk already pulled in, so no second copy is installed.
**Why:** Focus trapping and restore, Escape layering, typeahead, submenus,
roving focus and collision handling without re-implementing them (SPEC tech
stack; 0034).

## 00XX · 2026-09-27 · Overlays render into a container for gallery previews
**Decision:** Modal, ConfirmDialog, CommandPalette, Sheet, SidePanel and the rail
drawer take `container?: HTMLElement`. With it they portal into that element,
position `absolute` inside it, are non-modal (no focus trap, no `aria-hidden`
on the page) and do not take focus when they mount already open
(`useSkipMountFocus`; the flag clears once the overlay has been closed, because
Strict Mode mounts focus scopes twice). Forced-open menus and popovers use
`modal={false}`, `avoidCollisions={false}`, `max-h-none` and prevent open/close
auto-focus. The real app renders overlays against the viewport; every modal
sets `aria-modal="true"`.
**Why:** A gallery page shows up to seven dialogs at once. As real modals they
would fight over focus, hide the page from axe and cover each other; as
collision-aware poppers they flipped depending on scroll position, which made
screenshots unstable. `forcesModal` is therefore not needed on these pages.

## 00XX · 2026-09-27 · Focus returns to whatever opened an overlay
**Decision:** Modal, ConfirmDialog, CommandPalette, Sheet and SidePanel record
`document.activeElement` in `onOpenAutoFocus` and restore it in
`onCloseAutoFocus`. Initial focus: Modal the first control in the body (else
Close), destructive ConfirmDialog the name field, simple ConfirmDialog Cancel,
CommandPalette the search field, Sheet the sheet itself (no phone keyboard pops
up), SidePanel its title (`tabIndex=-1`).
**Why:** Radix only restores focus to its own `Trigger`; the palette (⌘K), the
inspector (canvas click) and confirmations opened from menus have none.

## 00XX · 2026-09-27 · The inspector is a region when docked, a dialog below 1280
**Decision:** SidePanel picks its mode from the viewport: docked at 1280 px and
up (`role="complementary"`, `aria-label="Service inspector"`, no trap, outside
clicks and focus do not close it), overlay 1024–1279 (modal dialog, 20 % scrim),
full width 768–1023 (modal dialog), and a full-screen Sheet under 768. `mode`
overrides it. Width: `localStorage["lumen.panel.width"]` via `useStoredState`
(synced across tabs), clamped 480–880, default 560; the separator handle is
`role="separator"` with `aria-valuenow` in px, arrows ±16, Home/End to min/max,
and the width is written on pointer release, not on every move.
**Why:** SPEC C7.7/C12 require the canvas to stay operable beside the panel
while §4.9 also asks for a focus trap; the trap only makes sense where the panel
covers the canvas.

## 00XX · 2026-09-27 · Rail expansion by clip, not width
**Decision:** The rail's panel is always 220 px wide; collapsed, a `clip-path`
hides all but 56 px and the right hairline is translated to the visible edge.
Hover expands after 150 ms and collapses 300 ms after leave (mouse only); the
slot in the page stays 56 px so hover never reflows the page. Pinning makes the
slot 220 px and is stored in `localStorage["lumen.rail.pinned"]`. Under 1024 px
the rail is hidden and a Radix Dialog drawer (opened by the top bar's menu
button) shows it expanded; phones use `MobileTabBar`. Tooltips switch off when
expanded through the new `Tooltip disabled` prop, so a focused link is never
remounted.
**Why:** §5 Motion allows only opacity and transform; animating width would
reflow the canvas on every hover.

## 00XX · 2026-09-27 · Scroll regions and empty listboxes stay accessible
**Decision:** A Modal body joins the tab order only while it overflows
(ResizeObserver); the environment list is focusable when it scrolls (more than
eight); the palette's result listbox is `display: none` while loading or when
nothing matches, with "No matches for …" outside it.
**Why:** axe `scrollable-region-focusable` and `aria-required-children`
(WCAG 2.1.1, 1.3.1) flagged each of these.

## 00XX · 2026-09-27 · Context menu long-press at 500 ms and Shift+F10
**Decision:** `ContextMenuTrigger` dispatches the browser's own `contextmenu`
event after a 500 ms touch press (Radix waits 700 ms) and on `Shift+F10` or the
ContextMenu key, positioned under the focused element.
**Why:** SPEC C5 timings; browsers disagree on where a keyboard-triggered
context menu lands.

## 00XX · 2026-09-27 · Registry test ignores SCREAMING_CASE exports
**Decision:** The gallery-coverage test treats exports matching `^[A-Z][a-z]`
as components. Constants such as `PANEL_WIDTH_KEY`, `RAIL_PINNED_KEY`,
`LONG_PRESS_MS` and `BREADCRUMB_MAX_CHARS` are exported for the shell (Phase 5)
and tests.
**Why:** Constants are not components and have no gallery page.

## 2. UI_DECISIONS.md rows (Direction D vs the Phase 1 §5 proposals)

| Area | Phase 1 proposal | Value shipped | Why |
|---|---|---|---|
| Menus | radius card, item 32 px, 13/400, icon 16, separator 1 px with 4 px margins, min-width 200 | confirmed; radius 2 (Signal), strong hairline frame, eyebrow labels in mono caps, radio choice shown as a 6 px accent square (checks for rows that lead with an avatar or marker) | Signal marker language |
| Menu / popover motion | scale 0.96 → 1 + opacity, `--dur-base`, exit 120 ms | confirmed (`lumen-pop-in/out`, `--ease-panel` in, `--ease-in` out) | — |
| Popover | padding 12, max-width 360, no arrow, title 14/600 | confirmed | — |
| Modal | 400/560/720, padding 24, title 16/600, close 12 px inset, overlay no blur, sheet under 640 | confirmed; radius 4 (`--radius-panel`), footer on a hairline, buttons in Signal action style | — |
| Confirm dialog | danger primary disabled until exact match; consequences with warning triangles | confirmed; destructive confirm uses `danger-solid`; errors show inline and the confirm button reads "Try again" | retry without a second button |
| Command palette | 640 × 480 max, top 15 %, 44 px input, 36 px rows, meta 12 right, full screen < 640 | confirmed; nested page chip in mono caps ("DEPLOY ›"); fuzzy matches in `accent-text`; a 32 px footer with Move / Run / Close hints (hidden on phones) | discoverable keys |
| Side panel | 480–880, default 560, 6 px handle with 2 × 24 grip, header 56, tabs 36, padding 20/24 | confirmed; grip turns accent while resizing or focused; title in Geist Pixel (section-title) with a mono eyebrow | Signal inspector header |
| Sheet | handle 36 × 4 at 8 px, header 48, padding 16, snap 50 % / 90 % | confirmed; release snaps with a `--dur-base` `--ease-panel` transform transition (no Motion dependency yet) | only Radix could be added this session |
| Tabs | 13/500 sans, `Badge` count, 2 px underline | mono caps 11 (label style), count as bracket notation `[12]` with dim brackets, 2 px accent underline sliding by transform (translateX + scaleX) | Signal chrome voice; transform-only motion |
| Breadcrumbs | sans 13, current 13/500 | mono caps 11, `/` in text-muted (decorative), current in `text`; phones and narrow top bars (container < 384 px) show only the current item | Signal chrome voice |
| Environment switcher | 8 px round dot | 6 px square marker (production green, staging blue, preview amber, custom accent), pulses once after a switch; list scrolls after 8 | Signal status shape |
| Workspace switcher | tile 32, initial 16/600, menu 240 | confirmed; initial in mono on the workspace's stable tint | — |
| Rail | 56 / 220, item 40, icon 20, 2 px accent bar, labels 13/500 | confirmed; labels mono caps 11; the active bar glows (`0 0 12px accent`) as on the direction page | Signal |
| Top bar | 48, bg, 1 px bottom border, padding 0 16, gap 8 | confirmed; deploy activity reads "DEPLOYING [ 2 ]" with a blinking marker; reconnecting shows a 2 px warning sweep (1.2 s, static under reduced motion) | Signal bracket notation |

## 3. Done, tests and known gaps

**Done (2026-09-27):** CommandPalette, DropdownMenu (+ Checkbox/Radio items,
Sub menus), ContextMenu (same parts), Popover, Modal, ConfirmDialog, SidePanel,
Sheet, Tabs (+ TabsContent, link mode), Breadcrumbs, EnvironmentSwitcher,
WorkspaceSwitcher, Rail + RailItem + MobileTabBar, TopBar + SearchButton +
DeployActivity. 15 new gallery pages (8 Overlays, 7 Navigation including the
"Shell frame" composing rail + top bar + tabs + palette + drawer + bottom bar).

**Tests:** Vitest `@lumen/ui` 191 passing (48 new: 27 overlay, 21 navigation);
`@lumen/web` 5 passing. Playwright, whole suite in all six projects on
2026-09-27: 126 passed, 12 skipped (the side-panel spec runs only where the
panel docks, ≥ 1280 px). New: `gallery-keyboard.spec.ts` 9 tests × 6 projects,
`side-panel.spec.ts` 3 tests × 2 desktop projects. Gallery: 118 examples ×
6 projects = 708 screenshot baselines (71 new examples, 426 new images; the 6
`icons--set` images regenerated for the new `menu` icon); axe clean on all 39
gallery pages in every project. The gallery walk timeout went from 180 s to
480 s because the page count grew from 24 to 39.

**Known gaps:**
- Sheet and side-panel release "springs" are CSS transitions with
  `--ease-panel`; the Motion library is not a dependency yet, so
  `springPanel` from `tokens/motion.ts` is unused.
- In gallery previews cmdk scrolls its first selected item into view on mount,
  which can move the gallery page while it loads (screenshots are per element
  and unaffected).
- The offline banner in the top-bar example is a local stand-in; it should use
  `<Alert>` once the feedback components merge.
- `E`-to-open-environments and `G then …` shortcuts are displayed but wired in
  Phase 5, as the spec says.
- The icon allowlist gained `menu`; the `icons--set` baselines were regenerated
  for it and will conflict with any other session that adds icons.
