# UI decisions

Design choices with evidence. Screenshots live under `docs/evidence/phase-NN/`.
Each entry: date · page or component · decision · why · screenshot links.

## Direction
_Pending Phase 1 step 1 (three directions explored, one chosen)._

## Token deviations from SPEC C4
_None. Light-theme fill-ins for unspecified tokens are proposed in Phase 1._

## Per-page decisions

### 2026-09-26 · Shell page (Phase 0)
- **Decision:** The empty shell renders the word "Lumen" at 24 px / 600 in Geist Sans
  and one live health line in Geist Mono 14 px with tabular numerals. No color
  values are set in CSS yet; `color-scheme: dark` on `[data-theme="dark"]` gives
  the browser's dark canvas until Phase 1 lands the tokens.
- **Why:** Phase 0 proves the font pipeline (self-hosted, size-adjusted fallbacks,
  no layout shift) and the theme attribute before any component exists.
- **Evidence:** `docs/evidence/phase-00/home-*.png` (3 widths × 2 color schemes).

### 2026-09-26 · Temporary favicon (Phase 0)
- **Decision:** `apps/web/src/app/icon.svg` is a placeholder: a 24 × 24 rounded
  square in the accent `#14B8A6` with a `#0D0F12` circle. It is the only hard-coded
  color in the codebase.
- **Why:** So the browser tab is not blank. Phase 1 replaces it with the real mark.
