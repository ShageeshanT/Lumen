# UI decisions

Design choices with evidence. Screenshots live under `docs/evidence/phase-NN/`.
Each entry: date · page or component · decision · why · screenshot links.

## Direction

### 2026-09-26 · Three directions produced, choice pending (Phase 1, step 4.1)
- **Pages:** `docs/design/directions/a-instrument.html`, `b-studio.html`,
  `c-console.html`; screenshots at 1440 × 900 in `docs/design/directions/screenshots/`
  (`<direction>-dark.png`, `<direction>-light.png`).
- **Same content everywhere:** five services, the "Backend" group, two variable
  edges, the inspector on `api` › Deployments with the active card and four
  history rows (one failed), collapsed rail, top bar, staged-changes bar.
- **What differs:** A is dense (13 px lists, hairline borders, mono identifiers,
  radius 6, accent only on the primary action); B is comfortable (14 px, radius
  10/14, accent tints the selected node and the active card, floating inspector);
  C is mechanical (nodes on `surface-raised`, status as dots and left bars, mono
  meta, mono inspector header).
- **Decision:** owner's pick, recorded below when made. The rubric is in
  `docs/design/directions/README.md`.

## Token deviations from SPEC C4

### 2026-09-26 · Light-theme status colors (Phase 1, step 4.3)
- **Decision:** In the light theme, `--color-success` is `#15803D`,
  `--color-success-text` `#166534`, `--color-warning` `#B45309` and
  `--color-warning-text` `#92400E`: each one Tailwind ramp step darker than the
  phase document first proposed (`#16A34A` / `#15803D`, `#D97706` / `#B45309`).
- **Why:** The first text proposals measured 4.47:1 and 4.48:1 on `surface-hover`
  (`#F2F2EF`), under the 4.5:1 text rule; the first non-text proposals measured
  2.94:1 (success) and 2.84:1 (warning) there and 2.97:1 (warning) on `bg`, under
  the 3:1 non-text rule, which had forced a "1 px ring on bg" workaround. The
  darker steps clear every surface with the same hue and the workaround is gone.
  Enforced by `packages/ui/src/lib/contrast.test.ts`, which parses `colors.css`
  and checks both tiers on all four surfaces in both themes.
- **Also recorded:** three ratios in the phase document's light table were
  miscalculated (danger-text 6.47 not 6.03, info-text 6.70 not 6.25,
  sleeping-text 7.58 not 7.06); the table now carries the computed values and a
  hover column.

### 2026-09-26 · One subtle tint per status
- **Decision:** `--color-<status>-subtle` is a single 10 % tint per status color
  used by both pills and alert backgrounds. The phase document listed 10 % for
  pills and 8 % for alerts.
- **Why:** One tier keeps the token set small and the two surfaces read the same;
  the 2 % difference was not perceptible in the direction pages.

## Per-page decisions

### 2026-09-26 · Shell page (Phase 0)
- **Decision:** The empty shell renders the word "Lumen" at 24 px / 600 in Geist Sans
  and one live health line in Geist Mono 13 px with tabular numerals. Since Phase 1
  the page title uses `<Text variant="page-title">` and the health line the
  `text-log` style; base colors now come from the token file.
- **Evidence:** `docs/evidence/phase-00/home-*.png` (3 widths × 2 color schemes).

### 2026-09-26 · Temporary favicon (Phase 0)
- **Decision:** `apps/web/src/app/icon.svg` is a placeholder: a 24 × 24 rounded
  square in the accent `#14B8A6` with a `#0D0F12` circle. Together with
  `packages/ui/src/tokens/colors.css` and the three direction pages (which inline
  the same token values) these are the only files holding color literals.
- **Why:** So the browser tab is not blank. Phase 1 replaces it with the Lumen mark.
