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

## Per-page decisions

### 2026-09-26 · Shell page (Phase 0)
- **Decision:** The shell renders "LUMEN" in the page-title style (Geist Pixel)
  and one live health line in the `text-log` style with tabular numerals.
- **Evidence:** `e2e/__screenshots__/smoke.spec.ts/` (3 widths × 2 color schemes).

### 2026-09-26 · Favicon and mark
- **Decision:** `apps/web/src/app/icon.svg` and the rail mark are a square frame
  with a blue signal block in the top-right corner. `icon.svg`, the token file
  and the direction pages are the only files holding color literals.
