# UI decisions

Design choices with evidence. Screenshots live under `docs/evidence/phase-NN/`.
Each entry: date · page or component · decision · why · screenshot links.

## Direction

### 2026-09-26 · Chosen: Direction D "Signal" (Phase 1, step 4.2)
- **Decision:** The owner chose a fourth direction, built from two reference
  images they supplied (a techwear product page): near-black instrument panel
  with a fine grid, uppercase monospace chrome, pixel display lettering, HUD
  corner brackets, bracket notation (`DEPLOYING [ 2 ]`), thin framed boxes,
  leader lines from an object to its callout, and an electric-blue to violet
  glow. Directions A, B and C are kept for reference and are not used.
- **Page:** `docs/design/directions/d-signal.html`; screenshots
  `docs/design/directions/screenshots/d-signal-{dark,light}.png`; motion capture
  `docs/design/directions/screenshots/d-signal-motion.webm` (boot-in, decode,
  hovers, tab underline, theme switch).
- **In feelings and goals:** a precise instrument, not a toy. Calm black field,
  one bright signal, everything else measured and labelled. Motion says "the
  system is live": things assemble on arrival, connections carry moving data,
  building work blinks like a hardware LED.
- **Guardrails kept from the spec:** uppercase mono is for chrome only (nav,
  labels, buttons, tags, section numbers); anything a person reads as a sentence
  (commit messages, helper text, errors, descriptions) stays in sentence-case
  Geist Sans (enforced by `text-styles.test.ts`). One strong element per view:
  the primary action is the only box drawn in full-strength ink with brackets.
  Every text pair still clears 4.5:1 and every status color 3:1 on all surfaces.
  A light theme exists ("blueprint paper") because SPEC C7.21 requires one.
- **Where the references are not copied:** no product names, copy, logos or
  imagery from the reference site are used; the look is translated into
  Lumen's own components and tokens.

### 2026-09-26 · Three directions produced (Phase 1, step 4.1)
- **Pages:** `docs/design/directions/a-instrument.html`, `b-studio.html`,
  `c-console.html`; screenshots at 1440 × 900 in `docs/design/directions/screenshots/`.
- **What differs:** A is dense (13 px lists, hairline borders, mono identifiers,
  radius 6); B is comfortable (14 px, radius 10/14, accent tints selection,
  floating inspector); C is mechanical (raised nodes, status as dots and left
  bars, mono meta). Superseded by D above.

## Confirmed and replaced values (Direction D vs the Phase 1 §5 proposals)

| Area | Phase 1 proposal | Direction D value | Why |
|---|---|---|---|
| Dark palette | SPEC C4 graphite (`bg #0D0F12`, surface `#14171B`) | `bg #050608`, surface `#0A0C10`, raised `#0F1217`, hover `#151920`, border `#1E232B` / `#353C47` | Deeper black so the grid and glow read, as in the references |
| Accent | Teal `#14B8A6` / light `#0D9488` | Electric blue `#5B7CFF` (text `#7B93FF`, fill `#3D5AFE`) / light `#3D5AFE` (text `#2A44D6`) | Owner's direction; resolves DECISIONS 0003 |
| Glow | none | `--color-glow-a` blue, `--color-glow-b` violet, 22 % / 16 % dark, 8 % / 6 % light | The iridescent light source behind the focal object |
| Canvas | 24 px dot grid | 8 px fine grid + 96 px major grid + vignette (`.bg-grid`, `.bg-vignette`) | Instrument-panel grid from the references |
| Status colors (dark) | green `#22C55E`, amber `#F59E0B`, red `#EF4444` | `#2BD97C`, `#F5B83D`, `#FF4D5E` (text `#FF6B78`) | Brighter, LED-like on the deeper black |
| Status shape | 8 px round dot, pill with tint | 6 px square marker inside `[ … ]` bracket tags, hard blink for building | HUD notation; still icon/marker + color + text |
| Display type | Geist Sans 600 for titles | Geist Pixel Square 500, uppercase, +0.02em, line-height 1.1 | Matches the reference lettering; same SIL OFL package |
| Chrome type | Sans 13/500 labels, sans eyebrows +0.04em | Geist Mono 11/500 uppercase +0.08em (`label`, `action`, `eyebrow`) | Uppercase mono is the reference's chrome voice |
| Identifiers | Mono only for IDs | Node and service names in Mono 14/500 +0.02em (`card-title`) | Names read as identifiers in the HUD |
| Body text | Sans 14 / 13 | unchanged | Readability |
| Radius | 6 / 10 / 14 | 2 / 2 / 4, kbd 2; round only for avatars | Square instrument corners |
| Elevation (dark) | border + inner highlight | border + accent glow on the selected object only | Light comes from the signal, not bevels |
| Primary button | teal fill | transparent with full-ink border, HUD brackets, arrow that nudges 3 px on hover, accent glow on hover | Mirrors the reference's framed call to action |
| Motion | nothing over 300 ms except progress | + entrance: 240 ms reveal per element, 45 ms stagger, whole screen < 700 ms; one title decode < 360 ms per page; ambient loops (edge flow 1.4 s, glow breathe 9 s, blink 1.6 s) | "Live system" feeling; all of it stops under reduced motion |

## Token deviations from SPEC C4

### 2026-09-26 · Direction D palette replaces C4
- **Decision:** `packages/ui/src/tokens/colors.css` now carries the Direction D
  palette in both themes (table above). The two-tier rule stays: base status
  colors for non-text at 3:1, `-text` tiers at 4.5:1 on every surface.
- **Measured (dark, lowest surface is hover `#151920`):** text 14.89,
  text-secondary 5.77, accent-text 6.26, danger-text 6.40, info-text 7.96,
  sleeping-text 6.93; accent 4.84, sleeping 3.64 (non-text). Light (hover
  `#EEF0F3`): text-secondary 6.49, accent-text 6.35, success-text 6.25,
  warning-text 6.21; accent 4.49, success 4.39, warning 4.40 (non-text). Ink on
  fill: white on `#3D5AFE` 5.13, on `#2A44D6` 7.25. text-muted stays below
  4.5:1 by design (placeholders and disabled only).
- **Enforced by:** `packages/ui/src/lib/contrast.test.ts` (parses the token file).

### 2026-09-26 · Earlier light-theme corrections (still in force)
- The light success and warning values (`#15803D` / `#166534`, `#B45309` /
  `#92400E`) chosen when the phase document's proposals failed on hover
  surfaces carry over unchanged into Direction D.

### 2026-09-26 · One subtle tint per status
- **Decision:** `--color-<status>-subtle` is a single 10 % tint per status color
  used by tags and alert backgrounds.

## Implementation notes

### 2026-09-26 · Design-system styles live in cascade layers
- **Decision:** `reset.css` and `focus.css` are in `@layer base`; `text.css`,
  `signal.css` and `elevation.css` are in `@layer components`. Tailwind's
  utilities layer comes after both.
- **Why:** Unlayered CSS beats every layer, so a Tailwind color utility on a
  `.text-*` element was silently ignored (a status tag rendered white instead of
  green). With the layers, `className="text-action text-success-text"` works as
  written. A Playwright test in `e2e/tests/theme.spec.ts` guards it.

## Components (Phase 1, session 3)

### 2026-09-26 · Buttons
- **Primary:** transparent, 1 px full-ink frame, HUD brackets 6 px outside the
  box that spread to 5 px on hover, accent-subtle fill and accent glow on hover,
  optional → that nudges 3 px. Pressed moves down 1 px. One per view.
- **Secondary:** hairline frame; **ghost:** no frame, secondary text;
  **danger:** danger frame and text; **danger-solid** only in confirm dialogs.
- **Sizes:** 28 / 32 / 36 px tall, 10 / 12 / 16 px horizontal padding, labels in
  the `action` style (mono 11 / 500 / +0.08em, uppercase). Icons 12 in sm, 14
  otherwise. Loading swaps the leading icon for the spinner and blocks clicks.
- **Icon buttons:** 28 or 32 px square, always labelled, tooltip on hover and
  focus.

### 2026-09-26 · Status tags
- `[ ■ ACTIVE ]`: 6 px square marker, word in the tone's `-text` color,
  brackets dim. Failed ✕, crashed ⟳, sleeping ☾, queued …, skipped –,
  cancelled ⊘, superseded and removed ↺ use glyph markers; stopped and offline
  are hollow squares. Building and deploying blink (1.6 s, hard on/off) and stop
  blinking under reduced motion.

### 2026-09-26 · Icons
- Lucide at 1.5 px non-scaling stroke with square caps and mitred joins, from
  an 83-icon allowlist. Sizes 12, 14, 16, 20.

### 2026-09-26 · Tooltip, keyboard hints, badges, avatars
- Tooltip: sentence-case sans 12 on `surface-raised` with a strong hairline
  frame, 400 ms delay, fades up 2 px in 120 ms, max 240 px wide.
- Keyboard hints: mono keycaps with a heavier bottom edge; ⌘ on Apple
  platforms and Ctrl elsewhere; sequences read "then".
- Badges: framed mono caps, 20 px (sm 16 px), tinted per variant, counts cap at
  99+. Avatars: circles for people, squares for workspaces, mono initials on a
  stable per-name tint.

## Form controls (Phase 1, session 4)

### 2026-09-26 · Text entry
- Inputs, textareas, select and combobox triggers share one look: 32 px (sm 28),
  1 px border, radius 2, surface background, sans 14 (mono 13 for identifiers).
  Focus: accent border, a 3 px accent-subtle halo and 5 px accent corner brackets
  3 px outside the frame. Invalid: danger border and danger halo. Read-only: page
  background and secondary text. Textareas grow to 12 rows, then scroll.
- Labels are mono caps 11 (the `label` style), helpers sans 13 secondary, errors
  sans 13 in danger text with a 14 px alert icon. Locked settings show a lock
  with "Managed by lumen.toml — edit the file to change it".

### 2026-09-26 · Choices
- **Switch:** square hardware toggle, 32 × 18 (sm 26 × 14), square thumb that
  slides in 120 ms; on is the accent fill with an ink thumb.
- **Checkbox:** 16 px square, radius 2, accent fill with a 12 px check;
  indeterminate shows an 8 × 2 bar. **Radio:** stays round because the shape means
  "one of many"; cards variant frames the chosen card in the accent with brackets.
- **Segmented control:** mono caps segments; the selected block is raised with a
  1 px accent underline and slides in 200 ms.
- **Select / combobox panels:** raised surface, strong hairline frame, 32 px rows,
  accent check on the chosen row; the combobox adds search, mono caps group
  headings, meta on the right, loading skeletons, "No repositories match for …",
  "Add …" and a footer link.

### 2026-09-26 · Values
- **Slider with input:** thin 4 px rail, a 10 × 16 fader cap in accent (danger
  when over capacity), marks as meta labels, a warning band beyond the server's
  free capacity, and a numeric field with its unit; the field wraps under the
  rail on narrow screens. Over the limit: "More than … Lower it or move to a
  bigger server."
- **Key-value editor:** mono names and values, "Already used" and naming errors
  inline, sealed values show a lock and "Sealed", pasting a .env block fills rows.
- **Copy field:** mono value, copy button turns into a green check for 1.5 s and
  "Copied" is announced. **Secret field:** eight dots in the DOM until revealed,
  masks itself again after 10 s; sealed values offer neither reveal nor copy.

## Per-page decisions

### 2026-09-26 · Shell page (Phase 0)
- **Decision:** The shell renders "LUMEN" in the page-title style (Geist Pixel)
  and one live health line in the `text-log` style with tabular numerals.
- **Evidence:** `e2e/__screenshots__/smoke.spec.ts/` (3 widths × 2 color schemes).

### 2026-09-26 · Favicon and mark
- **Decision:** `apps/web/src/app/icon.svg` and the rail mark are a square frame
  with a blue signal block in the top-right corner. `icon.svg`, the token file
  and the direction pages are the only files holding color literals.

## Phase 1 sessions 5–7: confirmed and replaced values

### 2026-09-27 · Overlays and navigation

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

### 2026-09-27 · Feedback, status and data display

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

### 2026-09-27 · Specialized components, icons and the decode title

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

### 2026-09-27 · Cross-model review (SPEC H2) fixes

| Area | Previous value | New value | Why |
|---|---|---|---|
| Primary button (light) | `text/4 %` fill | `--color-primary-bg` = paper `#ffffff`; dark unchanged (4 % ink) | Read as a pressed grey key |
| Top-bar search | secondary (framed) | ghost with Kbd hint | One strong element per view |
| Phone targets | 36 px | 44 px under 640 px for full-width buttons and dialog/sheet footers | Touch size |
| Code block copy | hover/focus only | one-line: always, 40 % → 100 %, 24 px fade, 56 px reserved | Discoverable on touch and at a glance |
| Canvas node status | always in the header | meta row when the header can't hold name + tag | Names were cut at ~10 chars |
| Empty-state tiles | always framed buttons | framed only when they act; otherwise plain rows; separate action ghost when tiles act | No dead targets |
| Tabs overflow fade | 24 px `mask-image` | 40 px, `mask-image` + `-webkit-mask-image` | The fade landed on padding |
| Data table under 640 px | scroll (default) | cards (default), with selection | No hidden-column hint |
| Status brackets | dropped in 40 px rows by callers | kept everywhere; auto-hidden only in `data-dense` tables | HUD notation consistency |
| Toast with body + action | action beside the text | action on its own row | Body wrapped around it |
| Avatar tints | six incl. success / warning / danger / info | accent, violet glow, sleeping, two neutrals | Green read as "active" |
| Avatar stack | two initials | one initial | Clipped by the overlap |
| Chart series 2 | info blue | violet `--color-violet` | Too close to accent |
| Locked field | 50 % disabled look | `bg` + text-secondary, full opacity | Read as a placeholder |
| Sealed value | mono caps "SEALED" / plain "Sealed" | lock + "Sealed", sans secondary, everywhere | Read as a link; three forms |
| Kbd enter | ⏎ on macOS | "Enter" everywhere | Glyph missing from Geist Mono |
| Radio card title | mono caps `label` | sans 14 / 500 | Sentences stay sans |
| Sheet header | `subsection` title | mono eyebrow + `section-title` name (inspector voice) | One voice for the inspector |
| Palette height | max 480 px | `min(480px, 85 % − 16 px)` | Footer was pushed out |
| Canvas fine grid | hidden under the major grid's fill | visible at ≥ 60 % zoom (major grid transparent) | Rendering bug |

Screenshots: `e2e/__screenshots__/gallery.spec.ts/*-win32.png` (Windows baselines
regenerated for the changed examples; Linux baselines to be regenerated by the
coordinator).
