# Phase 01 — Design direction and design system

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (SPEC H2 UI review on every gallery screenshot set) |
| **Depends on** | Phase 00 (workspace, Tailwind v4, Geist loaded, `/dev/components` route stub, Playwright projects) |
| **Unblocks** | Phase 05 (shell, canvas, inspector) and every UI phase after it; Phase 11 (setup wizard UI) |
| **Spec sections** | SPEC C1–C5, C8 (patterns the components must support), C9 (copy in gallery examples), C10, C11, C12, C13 (Kbd), C14, C15 steps 1–2, Part F "Phase 1", Part H2, B14 (route transition and canvas budgets) |
| **Estimated sessions** | 7 focused sessions: (1) three directions, (2) tokens + typography + motion + icons, (3) buttons + form controls, (4) overlays + navigation, (5) feedback + status + data display, (6) specialized components, (7) gallery matrix + axe + visual regression + review fixes |

## 1. Goal
Anyone opens `http://localhost:3000/dev/components`, flips between dark and light, tabs through every component with the keyboard, and sees a complete, consistent, original visual system with every state of every SPEC C5 component rendered, axe-clean, and locked by Playwright screenshots, so that every later page is assembled from this kit without inventing a single new color, size, or animation.

## 2. Why this phase exists
The UI is the product (SPEC `<why_ui_matters>`). Competitors have the features; Lumen wins on clarity, and clarity is mostly made of tiny decisions repeated consistently: one type scale, one spacing grid, one focus ring, one way to say "building". If those decisions are made per page, the app feels like five apps. If they are made once here, Phase 05 onward becomes assembly, reviews become "does this page use the kit correctly", and a palette change later is a token edit rather than a rewrite.

The user's stated priority for this project is production-level polish of font, typography, animation, theme and symbols. This phase is where all of that is decided and made real. The structural parity target is the mature deployment-platform pattern (a project canvas with a right-side inspector, a staged-changes bar, a ⌘K palette, an environment switcher, deployment history, a variables table, a template gallery, PR environments, observability). Lumen replicates that structure and feature set; its visual identity is its own, built from the SPEC C4 tokens ("calm graphite + aurora teal"). No copy text, product names, logos or brand assets from any other platform are used. Whether the accent palette should later move closer to a different hue is tracked as an open decision in §10, and because everything is tokenised, that would be a one-file change.

## 3. Scope
### In scope
- Three distinct visual directions as static HTML pages of the project canvas + service inspector, a decision, and its record in `docs/UI_DECISIONS.md`
- `packages/ui` (`@lumen/ui`): tokens as CSS custom properties for both themes, Tailwind v4 `@theme` mapping, theme switching (attribute + system preference + no-flash script + React hook)
- Typography system: Geist Sans / Geist Mono usage rules, text-style utilities, tabular numerals
- Spacing, radius, elevation, z-index, motion tokens; reduced-motion policy
- Iconography: Lucide wrapper, status icon set with Unicode fallback, framework/language and database icon set, provider marks
- Every SPEC C5 component, with every state, both themes, keyboard support, ARIA, and gallery examples
- The `/dev/components` gallery: navigation, theme toggle, density toggle, per-component axe run, Playwright screenshot matrix
- Vitest component tests, Playwright visual regression baselines, axe in CI for the gallery
- `docs/UI_DECISIONS.md` (direction choice, every proposed dimension confirmed or changed) and `docs/DECISIONS.md` (every dependency and license)

### Out of scope
- Real data, API calls, TanStack Query, WebSocket (Phase 04/05); gallery examples use hand-written props only
- Page layouts, the app shell, routing, the actual canvas with React Flow wiring (Phase 05); this phase ships the canvas node, group and edge as presentational components rendered inside a static React Flow instance in the gallery
- The log viewer's data pipeline and filter parser (Phase 08); this phase ships the viewer component fed with a static array
- xterm.js terminal component (Phase 14)
- Charts' data adapters (Phase 08); this phase ships the chart component with static series
- Marketing site or landing page (Phase 18)

## 4. Work breakdown

### 4.1 Three visual directions (C15 step 1)
- **What:** Three self-contained static HTML files, each showing the same content: the project canvas (five service nodes: `web`, `api`, `worker`, `postgres` with an attached volume, `redis`; one edge `api → postgres`, one edge `api → redis`; one group "Backend" containing `api` and `worker`) with the inspector open on `api`'s Deployments tab (active deployment card + four history rows, one failed), the top bar, the collapsed left rail, and the staged-changes bar showing "2 changes to 1 service". Each page includes both themes via a `data-theme` toggle button and uses the C4 tokens as the starting palette. Directions differ deliberately:
  - **Direction A "Instrument":** dense, 13px base in lists, 14px in forms, hairline borders, accent used only on the primary button and focus, monospace for every identifier, square-ish radii at the low end of the scale (6 everywhere except modals).
  - **Direction B "Studio":** comfortable, 14px base, cards with the full radius scale (10 on nodes, 14 on inspector), accent also tints selected states and the active deployment card, sans for identifiers with mono reserved for logs and hashes, more whitespace (24px page gutters, 16px card padding).
  - **Direction C "Console":** dark-first with a slightly deeper surface contrast (uses `surface-raised` for nodes on top of `bg-canvas`), status colors carried by 8px dots and left borders rather than pills, secondary text one step lighter, mono for meta rows, Geist Mono for the whole inspector header.
  Each file is under 60 KB, uses inline CSS only, loads Geist from `../../../apps/web/node_modules/geist/dist/fonts/...` via `@font-face` with relative paths (no CDN), and renders correctly opened from disk.
- **Files:** `docs/design/directions/a-instrument.html`, `docs/design/directions/b-studio.html`, `docs/design/directions/c-console.html`, `docs/design/directions/README.md` (how to open, what to compare, the decision rubric below)
- **Done when:** all three open in Chrome from disk in both themes; Playwright screenshots of each at 1440 dark and light are saved to `docs/design/directions/screenshots/<direction>-<theme>.png`.

### 4.2 Pick a direction and record it
- **What:** Score each direction against C14 (one primary action, calm, alignment on the 4px grid, no competing accents) and against the beginner test ("what would you click first?"). Pick one or combine (record which elements come from which direction). Write the decision into `docs/UI_DECISIONS.md` with the six screenshots linked, the rubric scores, and a one-paragraph description of the chosen look in feelings and goals ("calm, precise, instantly understandable"), never in terms of another product.
- **Files:** `docs/UI_DECISIONS.md`
- **Done when:** the entry exists with links that resolve, and every proposed number in §5 of this document is either confirmed or replaced with the chosen direction's value in the same entry.

### 4.3 Token package
- **What:** `packages/ui/src/tokens/colors.css` defines every color token from the tables in §5 "Color & theme" under `:root, [data-theme="dark"]` and `[data-theme="light"]`; `typography.css` (font families, sizes, weights, line-heights, letter-spacings), `spacing.css` (4px grid scale), `radius.css`, `elevation.css` (dark: border + inner highlight; light: shadows), `z-index.css`, `motion.css` (durations, easings, spring constants exported also as a TS object in `motion.ts` for the Motion library). `packages/ui/src/tokens/index.css` imports them all and is imported by `apps/web/src/app/globals.css`, which then declares the Tailwind v4 `@theme` block mapping utilities to the variables (`--color-bg: var(--color-bg)` style pass-through so `bg-bg`, `text-text-secondary`, `border-border`, `rounded-card` and friends exist; naming table in §5). `packages/ui/src/theme/theme-script.ts` exports the minified no-flash script string used by `apps/web/src/app/layout.tsx`: it reads `localStorage["lumen.theme"]` (`"dark" | "light" | "system"`, default `"system"`), resolves `system` through `matchMedia("(prefers-color-scheme: dark)")`, sets `document.documentElement.dataset.theme`, and sets `document.documentElement.style.colorScheme`. `packages/ui/src/theme/use-theme.ts` exports `useTheme()` returning `{ theme, resolvedTheme, setTheme }`, listens to the media query for `system`, persists to `localStorage`, and dispatches a `lumen:theme` event so multiple tabs stay in sync (a `storage` listener).
- **Files:** `packages/ui/package.json` (name `@lumen/ui`, `exports` for `./tokens.css`, `./theme`, `./components/*`, `./icons`), `packages/ui/tsconfig.json`, `packages/ui/src/tokens/{colors,typography,spacing,radius,elevation,z-index,motion,index}.css`, `packages/ui/src/tokens/motion.ts`, `packages/ui/src/theme/theme-script.ts`, `packages/ui/src/theme/use-theme.ts`, `packages/ui/src/theme/theme-provider.tsx`, `packages/ui/src/theme/theme.test.ts`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
- **Done when:** a Playwright test toggles `localStorage["lumen.theme"]` to each of the three values, reloads with CPU throttled 6×, and asserts `html[data-theme]` is correct on the first painted frame (screenshot on `domcontentloaded` shows no light flash in dark mode); switching the OS preference while on `system` updates without reload.

### 4.4 Typography utilities
- **What:** `packages/ui/src/styles/text.css` defines named text styles as classes using the §5 usage table (`.text-display`, `.text-page-title`, `.text-section-title`, `.text-card-title`, `.text-subsection`, `.text-body`, `.text-body-secondary`, `.text-label`, `.text-meta`, `.text-eyebrow`, `.text-code`, `.text-log`, `.text-kbd`) so a page never sets a raw font size; `.tabular` applies `font-variant-numeric: tabular-nums`; `.truncate-middle` (for IDs and hashes; JS helper `truncateMiddle(str, head, tail)` in `packages/ui/src/lib/text.ts`) and `.truncate` (end, with `title` attribute set by the `<Truncate>` component so hover reveals the full value). A `<Text>` component (`packages/ui/src/components/text.tsx`) with `variant` and `as` props wraps these. ESLint rule `no-restricted-syntax` in `apps/web` blocks Tailwind's raw `text-[..px]` arbitrary sizes.
- **Files:** `packages/ui/src/styles/text.css`, `packages/ui/src/lib/text.ts`, `packages/ui/src/lib/text.test.ts`, `packages/ui/src/components/text.tsx`, `eslint.config.js` (arbitrary-size restriction for `apps/web` and `packages/ui`)
- **Done when:** the gallery "Typography" page shows every style in both themes with its size/weight/line-height/letter-spacing printed beside it, and the numbers match the §5 table exactly (verified by a Vitest test that reads the computed style of each rendered variant in jsdom against the table).

### 4.5 Icons
- **What:** `packages/ui/src/icons/index.ts` re-exports the Lucide icons Lumen uses (an explicit allowlist, not `export *`, so tree-shaking and the visual vocabulary stay controlled) through `<Icon name size stroke>` with sizes `14 | 16 | 20` and `strokeWidth` defaulting to `1.75`. `status-icon.tsx` maps the C4 status language to icon, color token, text label, Unicode fallback glyph and pulsing behavior (table in §5). `framework-icon.tsx` maps a `framework` key (`node`, `python`, `go`, `rust`, `ruby`, `php`, `java`, `dotnet`, `deno`, `bun`, `static`, `docker`, `unknown`) and `database-icon.tsx` (`postgres`, `mysql`, `redis`, `mongodb`) to SVGs vendored under `packages/ui/src/icons/vendor/` from the chosen set (decision in §5 "Iconography"), each 20×20 in a 24 viewBox, monochrome by default with a `color` prop for the brand tint. `provider-mark.tsx` renders a 20×20 rounded tile with the provider's official mark only where the provider's brand guidelines permit referential use, otherwise a monogram tile (`OC`, `AWS`, `GCP`, `AZ`, `HZ`, `DO`, `?`) in `surface-raised` with `text-secondary`.
- **Files:** `packages/ui/src/icons/index.ts`, `packages/ui/src/icons/icon.tsx`, `packages/ui/src/icons/status-icon.tsx`, `packages/ui/src/icons/framework-icon.tsx`, `packages/ui/src/icons/database-icon.tsx`, `packages/ui/src/icons/provider-mark.tsx`, `packages/ui/src/icons/vendor/*.svg`, `packages/ui/src/icons/vendor/LICENSES.md`, `packages/ui/src/icons/icons.test.tsx`
- **Done when:** the gallery "Icons" page shows every allowed Lucide icon at 14/16/20, every status at rest and pulsing, every framework/database icon, every provider mark; `LICENSES.md` names the license of each vendored file; `DECISIONS.md` has the icon-set entry.

### 4.6 Component foundation
- **What:** `packages/ui/src/lib/cn.ts` (`clsx` + `tailwind-merge`), `class-variance-authority` for variants, Radix primitives installed one at a time as needed (`@radix-ui/react-*`, MIT), `@radix-ui/react-slot` for `asChild`. `packages/ui/src/components/index.ts` is the barrel. Every component file exports the component, its props type, and a `<Name>.examples.tsx` sibling that exports an array `{ title, description, render }` consumed by the gallery and by the screenshot test. Focus ring implemented once in `packages/ui/src/styles/focus.css` (`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: inherit }`) and never overridden per component; inputs add a soft focus state (§5).
- **Files:** `packages/ui/src/lib/cn.ts`, `packages/ui/src/lib/cn.test.ts`, `packages/ui/src/styles/focus.css`, `packages/ui/src/styles/reset.css`, `packages/ui/src/components/index.ts`, `packages/ui/src/examples/types.ts`
- **Done when:** the gallery renders an empty shell with the theme and density toggles and a left nav listing every component group.

### 4.7 Buttons
- **What:** `<Button variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md" | "lg" loading icon iconOnly asChild>`. `<IconButton>` requires `label` (rendered as tooltip and `aria-label`). `<SplitButton>` (primary action + chevron opening a dropdown; used for Redeploy / Restart / Deploy specific commit in C7.7). Loading state replaces the leading icon with a 14px spinner, keeps the width (measured before swap; `min-width` locked) and sets `aria-busy`. Dimensions in §5. Danger variant is solid only inside confirm dialogs; elsewhere danger is the ghost variant with danger text (one accent per view, C14).
- **Files:** `packages/ui/src/components/button.tsx`, `button.examples.tsx`, `button.test.tsx`, `icon-button.tsx`, `split-button.tsx`, `spinner.tsx`
- **Done when:** the gallery shows 4 variants × 3 sizes × states (default, hover, active, focus-visible, disabled, loading, icon-only) in both themes; `Space`/`Enter` activate; loading buttons are not clickable and announce busy.

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**Button**
- Props: `variant: "primary" | "secondary" | "ghost" | "danger"` (default `secondary`), `size: "sm" | "md" | "lg"` (default `md`), `loading?: boolean`, `leadingIcon?: IconName`, `trailingIcon?: IconName`, `fullWidth?: boolean`, `asChild?: boolean`, native `button` props (`type` defaults to `"button"`).
- Sizes: sm 28 px tall, padding `0 10px`, text 13/500, icon 14, gap 6; md 32 px, `0 12px`, 14/500, icon 16, gap 8; lg 36 px, `0 16px`, 14/500, icon 16, gap 8. Radius `--radius-control`. Min-width equals height (so a one-character label is still a square).
- Visuals: primary `accent-fill` background, `accent-ink` text, hover `accent-fill-hover`, active translates `0.5px` down; secondary `surface` background, `border` 1 px, hover `surface-hover`, `border-strong` on hover; ghost transparent, hover `surface-hover`; danger `danger-fill` + `danger-ink`, hover `danger-fill-hover`. Disabled: 50 % opacity, `cursor: not-allowed`, no hover change. Loading: spinner (14 px, 800 ms rotation) replaces the leading icon or prefixes the label; width locked.
- States: default, hover, active, focus-visible, disabled, loading, full-width.
- Keyboard: `Enter` and `Space` activate; focus ring per §5.
- ARIA: native `button`; `aria-busy="true"` while loading; `aria-disabled` is not used (real `disabled` so it leaves the tab order).
- Gallery examples: 4 variants × 3 sizes grid; with leading icon; with trailing icon; loading (each variant); disabled (each variant); full width; `asChild` rendering an `<a>`.

**IconButton**
- Props: `icon: IconName`, `label: string` (required), `size: "sm" | "md"`, `variant: "secondary" | "ghost" | "danger"` (default `ghost`), `tooltipSide?`.
- Sizes: sm 28 × 28 (icon 14), md 32 × 32 (icon 16).
- States: default, hover, active, focus-visible, disabled, pressed (`aria-pressed` when `toggle`).
- Keyboard: as Button; tooltip shows on focus.
- ARIA: `aria-label={label}`; wrapped in `<Tooltip content={label}>`.
- Gallery examples: sizes × variants; toggle example (theme sun/moon); disabled.

**SplitButton**
- Props: `label`, `onClick`, `items: MenuItem[]`, `variant: "primary" | "secondary"`, `size`, `loading`.
- Dimensions: primary segment as Button; chevron segment 28 px wide (sm 24) with a 1 px divider in `accent-ink` at 20 % opacity (primary) or `border` (secondary).
- States: default, hover on either segment (independent), open, loading (both segments disabled), disabled.
- Keyboard: `Tab` reaches the main segment then the chevron; `ArrowDown` on the chevron opens the menu; menu keyboard per DropdownMenu.
- ARIA: two buttons in a `role="group"` labelled by the main label; chevron has `aria-haspopup="menu"`, `aria-expanded`, `aria-label="More deploy options"`.
- Gallery examples: Redeploy / Restart / Deploy specific commit; secondary variant; loading; disabled.

**Spinner**
- Props: `size: 14 | 16 | 20`, `label?` (visually hidden text, default "Loading").
- Motion: 800 ms linear infinite rotation of a 270° arc; keeps rotating under reduced motion.
- ARIA: `role="status"` with the hidden label when standalone; `aria-hidden` when inside an `aria-busy` button.
- Gallery examples: three sizes; inside a button; inside a table row; on `accent-fill` (ink-colored).

### 4.8 Form controls
- **What:** `<Input>` (text/email/password/number/url; `leadingIcon`, `trailingSlot`, `invalid`, `readOnly`, `monospace`), `<Textarea>` (auto-grow to `maxRows`), `<Select>` (Radix Select), `<Combobox>` (Radix Popover + `cmdk` for filtering; searchable; async loading state; "No results" empty state; creatable option), `<Switch>` (Radix Switch), `<Checkbox>` (Radix Checkbox with indeterminate), `<RadioGroup>` (Radix), `<SegmentedControl>` (Radix Toggle Group `type="single"`; used for time ranges 1h · 6h · 24h · 7d · 30d and log modes), `<SliderWithInput>` (Radix Slider + numeric input; `unit`, `min`, `max`, `step`, `marks`, `limitLabel` such as "Server 'oracle-1' has 18 GB free"), `<KeyValueEditor>` (rows of key/value with add/remove, paste-to-fill from `KEY=VALUE` lines, duplicate-key validation), `<CopyField>` (read-only input with a copy button; on click swaps the icon to a check and the tooltip to "Copied" for 1.5 s; also `Ctrl/⌘+C` while focused), `<SecretField>` (masked with `••••••••`, reveal toggle with `aria-pressed`, copy button, `sealed` mode renders "Sealed" and no reveal), `<Field>` wrapper (label, helper text, error message, `required` marker, `lockedBy="lumen.toml"` state rendering a lock icon and disabling the control), `<Form>` helpers for `aria-describedby` wiring.
- **Files:** `packages/ui/src/components/{input,textarea,select,combobox,switch,checkbox,radio-group,segmented-control,slider-with-input,key-value-editor,copy-field,secret-field,field,form}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** every control renders default, hover, focus, filled, invalid (with message), disabled, read-only, locked, and loading (where applicable) in the gallery; each is operable by keyboard per the ARIA pattern named in §5; `CopyField` copies in a Playwright test (clipboard permission granted).

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**Input**
- Props: `type: "text" | "email" | "password" | "number" | "url" | "search"`, `size: "sm" | "md"`, `leadingIcon?`, `trailingSlot?: ReactNode` (for CopyField/SecretField buttons), `invalid?: boolean`, `monospace?: boolean`, `readOnly`, `disabled`, native input props.
- Dimensions: md 32 px tall, padding `0 10px` (with leading icon: `0 10px 0 32px`, icon at 10 px), text 14/400, radius `--radius-control`, 1 px `border`; sm 28 px, text 13. Mobile (< 768 px): 16 px text.
- Visuals: background `surface`; hover `border-strong`; focus `border-color: accent` + `box-shadow 0 0 0 3px accent-subtle`; invalid `border-color: danger` + focus shadow in `rgba(danger, .15)`; read-only `bg` background with `text-secondary` and no hover; disabled 50 % opacity; placeholder `text-muted`.
- States: default, hover, focus, filled, invalid, disabled, read-only, with leading icon, with trailing slot, monospace.
- Keyboard: native; `Esc` clears `type="search"`.
- ARIA: `aria-invalid`, `aria-describedby` from `<Field>`; `aria-readonly`.
- Gallery examples: every state × 2 sizes; number with unit suffix; search with clear; url with `monospace`.

**Textarea**
- Props: `rows` (default 3), `maxRows` (default 12, auto-grow), `monospace`, `invalid`, `resize: "none" | "vertical"` (default `none`; auto-grow replaces manual resize).
- Dimensions: padding `8px 10px`, text 14/400 line-height 1.5, min-height 3 rows.
- States: default, hover, focus, filled, invalid, disabled, read-only, at `maxRows` (scrolls).
- ARIA: as Input.
- Gallery examples: auto-grow demo; monospace `.env` raw editor look; invalid with message.

**Select**
- Props: `options: { value, label, description?, icon?, disabled? }[]`, `value`, `onValueChange`, `placeholder`, `size`, `invalid`, `disabled`.
- Dimensions: trigger as Input md/sm with a 16 px `chevron-down` at right 10 px; content `surface-raised`, radius `--radius-card`, padding 4, item 32 px, min-width = trigger width, max-height 320 px with scroll buttons; item check icon 16 px at right.
- States: closed, hover, open, item hover, item selected, item disabled, invalid, disabled, placeholder.
- Keyboard: Radix Select pattern (`Space`/`Enter`/`ArrowDown` open, typeahead, `Esc` closes).
- ARIA: Radix `role="combobox"` trigger + `listbox`.
- Gallery examples: basic; with icons (framework list); with descriptions (restart policy); long list (30 regions); invalid; disabled.

**Combobox**
- Props: `items`, `value`, `onValueChange`, `onSearch?` (async), `loading?`, `creatable?: { label: (q) => string }`, `emptyMessage` (default "No results"), `placeholder`, `renderItem?`, `multiple?: false` (multi is out of scope).
- Dimensions: input as Input md with a 16 px `chevrons-up-down`; popover as Select content; loading state shows three skeleton rows; group headers use the eyebrow style.
- States: closed, open, typing (filtered), loading, empty, creatable row visible, selected, disabled, invalid.
- Keyboard: `cmdk` listbox pattern; `ArrowUp/Down` moves, `Enter` selects, `Esc` closes and restores the previous value, `Tab` selects the highlighted item then moves.
- ARIA: `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`; options `role="option"` `aria-selected`.
- Gallery examples: repository picker (with "Configure GitHub access" footer link); Docker image autocomplete with popular images; async loading; empty; creatable ("Add 'my-label'").

**Switch**
- Props: `checked`, `onCheckedChange`, `label` (rendered beside, clickable), `description?`, `size: "sm" | "md"`, `disabled`.
- Dimensions: md track 32 × 18, thumb 14 with 2 px inset, travel 14 px; sm 26 × 14, thumb 10. On: `accent-fill` track, `accent-ink` thumb; off: `border-strong` track, `surface` thumb.
- Motion: thumb translate over `--dur-fast` `--ease-out`.
- States: off, on, hover, focus-visible, disabled off, disabled on, with description.
- Keyboard: `Space` toggles; `Enter` does not (Radix default).
- ARIA: Radix `role="switch"` `aria-checked`; label via `<label htmlFor>`.
- Gallery examples: "Deploy on push"; "Wait for CI" with description; sizes; disabled.

**Checkbox**
- Props: `checked: boolean | "indeterminate"`, `label`, `description?`, `disabled`.
- Dimensions: 16 × 16, radius 4, 1 px `border-strong`; checked `accent-fill` with a 12 px `check` in `accent-ink`; indeterminate shows a 8 × 2 bar.
- States: unchecked, checked, indeterminate, hover, focus-visible, disabled (each), invalid (for "I understand" confirmations).
- Keyboard: `Space` toggles.
- ARIA: Radix `role="checkbox"` `aria-checked="mixed"` for indeterminate.
- Gallery examples: single; list with select-all indeterminate; "Also restore variables from that time" with description; disabled.

**RadioGroup**
- Props: `options: { value, label, description?, disabled? }[]`, `value`, `onValueChange`, `orientation: "vertical" | "horizontal"`, `variant: "list" | "cards"` (cards for the C7.1 domain choice and C7.15 copy/empty choice).
- Dimensions: radio 16 × 16 circle, inner dot 6 px `accent-fill`; card variant 1 px `border`, radius `--radius-card`, padding 16, selected `border-strong` + `accent-subtle` background + a 16 px check at top-right.
- States: unselected, selected, hover, focus-visible, disabled; card variant same set.
- Keyboard: arrows move selection (roving tabindex), `Space` selects.
- ARIA: Radix `role="radiogroup"` / `role="radio"`.
- Gallery examples: list (restart policy); cards (domain choice with icons and two-line descriptions); horizontal; disabled option.

**SegmentedControl**
- Props: `items: { value, label, icon? }[]`, `value`, `onValueChange`, `size: "sm" | "md"`, `fullWidth?`.
- Dimensions: container 32 px tall (sm 28) with 2 px padding, `surface` background, 1 px `border`, radius `--radius-control`; items 28 px (sm 24), padding `0 10px`, text 13/500; selected item gets `surface-raised` background (light: white + `--shadow-card`) and `text`; unselected `text-secondary`. Selected indicator slides over `--dur-base`.
- States: default, hover item, selected, focus-visible, disabled item, full width.
- Keyboard: arrows move and select (Radix ToggleGroup single, `rovingFocus`).
- ARIA: `role="radiogroup"` semantics via Radix ToggleGroup with `aria-checked`.
- Gallery examples: time ranges `1h · 6h · 24h · 7d · 30d`; log modes Runtime · HTTP · Build; with icons; full width in a sheet.

**SliderWithInput**
- Props: `value`, `onValueChange`, `min`, `max`, `step`, `unit: "MB" | "GB" | "vCPU"`, `marks?: { value, label }[]`, `limit?: { value, label }` (renders "Server 'oracle-1' has 18 GB free" and a warning band beyond it), `formatValue?`, `disabled`.
- Dimensions: track 4 px tall, radius full, `border-strong` background, filled range `accent`; thumb 16 px circle `surface` with 2 px `accent` border, hover scales to 18 px; numeric input 88 px wide md Input with unit suffix; marks as 12 px `meta` labels under the track. Warning band beyond `limit` is `warning` at 30 % opacity.
- States: default, hover thumb, dragging (thumb 18 px + value tooltip), focus-visible, input focus, at limit (warning text), beyond limit (danger text + input invalid), disabled.
- Keyboard: arrows ± step, `PageUp/Down` ± 10 steps, `Home/End`; input accepts typed values and clamps on blur.
- ARIA: Radix Slider `role="slider"` with `aria-valuetext` "512 MB"; input `aria-label` "Memory in megabytes".
- Gallery examples: Memory 128 MB → 16 GB with marks at 512 MB, 1 GB, 2 GB, 4 GB and a limit at 18 GB; CPU 0.1 → 4 vCPU step 0.1; disabled.

**KeyValueEditor**
- Props: `rows: { key, value, sealed?, invalid? }[]`, `onChange`, `keyPlaceholder`, `valuePlaceholder`, `allowSealed?`, `maxRows?`, `onPaste?` (default parses `KEY=VALUE` lines and fills rows).
- Dimensions: two Inputs md side by side (key 40 %, value 60 %) with an 8 px gap and a 32 px ghost IconButton `x`; "Add variable" ghost Button sm below; key input is `monospace`.
- States: empty (one blank row), rows, duplicate key (row invalid with "Already used"), invalid key characters, sealed row (value shows SecretField sealed mode), max rows reached, disabled.
- Keyboard: `Tab` moves key → value → next row's key; `Enter` in the last value adds a row; `Backspace` in an empty last row removes it.
- ARIA: rows in a `role="table"`-free layout with each input labelled "Name" / "Value" via visually hidden labels and `aria-rowindex` announced through the live region on add/remove.
- Gallery examples: empty; three rows; duplicate error; pasted `.env` block; sealed row.

**CopyField**
- Props: `value`, `label?`, `monospace` (default true), `size`, `truncate: "end" | "middle"`, `secret?: boolean` (masks like SecretField).
- Dimensions: read-only Input with a trailing 28 px IconButton `copy`; copied state swaps to `check` in `success` for 1.5 s with tooltip "Copied".
- States: default, hover (border-strong), focus, copied, truncated with full value on hover, disabled.
- Keyboard: `Ctrl/⌘+C` with the field focused copies the full value; `Enter` on the field copies.
- ARIA: input `readonly` with `aria-label`; the copy button `aria-label="Copy <label>"`; "Copied" announced via the live region.
- Gallery examples: install command (long, end-truncated); private domain; deployment ID (middle-truncated); secret mode.

**SecretField**
- Props: `value`, `sealed?: boolean`, `onReveal?`, `size`, `copyable` (default true).
- Dimensions: as CopyField with two trailing 28 px IconButtons: `eye`/`eye-off` (hidden when sealed) and `copy`; masked text is exactly eight `•` in mono regardless of length; sealed renders a `lock` icon + "Sealed" in `text-secondary` and no copy.
- States: masked, revealed, sealed, hover, focus, copied, disabled.
- Keyboard: `Enter` on the reveal button toggles; revealed values re-mask on blur after 10 s (timer visible as a tooltip "Hides in 10s" on the button).
- ARIA: reveal button `aria-pressed`; masked input `aria-label="<name>, hidden"`; revealed value not announced automatically.
- Gallery examples: masked; revealed; sealed; in a table cell; copied state.

**Field**
- Props: `label`, `htmlFor`, `helper?`, `error?`, `required?`, `optional?` (renders "Optional" in meta), `lockedBy?: string` ("Managed by lumen.toml"), `hint?: { label, href }`, `children`.
- Dimensions: label 13/500 with 6 px gap to the control; helper 13/400 `text-secondary` 6 px below; error 13/400 `danger-text` with a 14 px `alert-circle`; locked state renders a 14 px `lock` after the label and a tooltip "Managed by lumen.toml — edit the file to change it" and passes `disabled` to the child.
- States: default, with helper, with error, required, optional, locked, disabled.
- ARIA: label `for`; helper and error ids joined into the control's `aria-describedby`; error region `role="alert"` only when the error appears after user input (not on mount).
- Gallery examples: every state; a stacked form of six fields showing consistent 20 px vertical rhythm.

### 4.9 Overlays
- **What:** `<CommandPalette>` (Radix Dialog + `cmdk`; groups, recents section, shortcut hints via `<Kbd>`, empty state "No matches for 'x'", loading rows), `<DropdownMenu>` (Radix), `<ContextMenu>` (Radix), `<Popover>` (Radix), `<Tooltip>` (Radix; `delayDuration` 400 ms, `skipDelayDuration` 200 ms; never contains interactive content), `<Modal>` (Radix Dialog; sizes sm/md/lg; header, body, footer slots; scroll inside body; close on `Esc` and overlay click unless `preventClose`), `<ConfirmDialog>` (`variant="simple" | "destructive"`; destructive requires typing the resource name, shows a consequences list, primary button is danger and disabled until the text matches exactly), `<SidePanel>` (right-anchored, resizable by a 6px drag handle between 480 and 880 px, width persisted under `localStorage["lumen.panel.width"]`, `Esc` closes, focus trapped, returns focus to the opener; on tablet overlays the content; on mobile becomes `<Sheet>`), `<Sheet>` (Radix Dialog bottom/full-screen on mobile with a drag-to-dismiss handle and swipeable tab header).
- **Files:** `packages/ui/src/components/{command-palette,dropdown-menu,context-menu,popover,tooltip,modal,confirm-dialog,side-panel,sheet}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** each overlay opens, traps focus, closes on `Esc`, restores focus, and is announced (role, label); the palette's `⌘K` binding is wired in the gallery; the side panel's width persists across reload in a Playwright test.

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**CommandPalette**
- Props: `open`, `onOpenChange`, `groups: { heading, items: { id, label, icon?, shortcut?, meta?, onSelect }[] }[]`, `recents?`, `placeholder` (default "Search or run a command…"), `loading?`, `onQueryChange?` (async search).
- Dimensions: 640 px wide (full-screen under 640 px), max-height 480, top offset 15 vh; input row 44 px with a 16 px `search` icon and text 14; result rows 36 px with 16 px icon, label 14, `meta` 12 `text-secondary` right-aligned, shortcut as `<Kbd>`; group headings eyebrow style with 8 px padding; radius `--radius-panel`, `surface-raised`, overlay `--color-overlay`.
- States: open with recents, typing with matches (fuzzy highlight in `accent-text`), no matches ("No matches for 'x'"), loading rows (three skeletons), item hover, item active (keyboard), nested page (breadcrumb chip in the input showing "Deploy ›").
- Keyboard: `⌘K`/`Ctrl+K` toggles; `ArrowUp/Down` moves; `Enter` runs; `Esc` closes (or pops a nested page); `Backspace` on empty input pops a nested page; `Tab` is trapped.
- ARIA: Radix Dialog `role="dialog"` `aria-label="Command palette"`; `cmdk` provides `combobox` + `listbox` + `option` with `aria-activedescendant`.
- Gallery examples: recents; matches across groups (projects, services, actions); no matches; loading; nested page; mobile full-screen.

**DropdownMenu**
- Props: Radix DropdownMenu composition: `Trigger`, `Content`, `Item` (`icon?`, `shortcut?`, `destructive?`), `CheckboxItem`, `RadioGroup`/`RadioItem`, `Separator`, `Label`, `Sub`/`SubTrigger`/`SubContent`.
- Dimensions: content min-width 200, padding 4, radius `--radius-card`, `surface-raised`, border 1 px; item 32 px, padding `0 8px`, text 13/400, icon 16 with 8 px gap, shortcut `<Kbd>` right-aligned; destructive item `danger-text` with hover `rgba(danger, .10)`; separator 1 px `border` with 4 px margins; label eyebrow style.
- Motion: scale 0.96 → 1 + opacity over `--dur-base` from the trigger side; exit 120 ms.
- States: closed, open, item hover, item focus, disabled item, checked items, submenu open, destructive hover.
- Keyboard: `Enter`/`Space`/`ArrowDown` opens; arrows move; typeahead; `ArrowRight` opens submenu; `Esc` closes and returns focus.
- ARIA: Radix `menu` / `menuitem` / `menuitemcheckbox` / `menuitemradio`.
- Gallery examples: service overflow (Open shell · Stop · Sleep now · Duplicate · Delete); with checkbox items (log toggles); with radio group (sort); with submenu (Move to group).

**ContextMenu**
- Props: as DropdownMenu with a `Trigger` area instead of a button.
- Dimensions: as DropdownMenu, positioned at the pointer.
- States: as DropdownMenu.
- Keyboard: `Shift+F10` or the context-menu key opens at the focused element; long-press (500 ms) on touch.
- ARIA: Radix ContextMenu.
- Gallery examples: canvas node right-click menu (Redeploy · Restart · View logs · Open URL · Duplicate · Move to group · Delete); log line menu (Copy line · Copy JSON · Filter by level).

**Popover**
- Props: `Trigger`, `Content` (`side`, `align`, `width?: number | "trigger"`), `title?`, `closeButton?`.
- Dimensions: padding 12, radius `--radius-card`, `surface-raised`, border 1 px, max-width 360; optional 8 px arrow is not used (cleaner alignment); title 14/600 with 8 px bottom gap.
- States: closed, open, with title, with close button, scrolled content.
- Keyboard: `Esc` closes; focus moves into the content on open and returns on close.
- ARIA: Radix Popover `role="dialog"` with `aria-labelledby` when titled.
- Gallery examples: deploy activity ("2 deploying" with live progress rows); variable reference hover (masked resolved value); date-range picker shell.

**Tooltip**
- Props: `content: string`, `side`, `shortcut?: string[]` (renders `<Kbd>` after the text), `delayDuration` (default 400), children (must be focusable).
- Dimensions: padding `4px 8px`, radius `--radius-control`, `surface-raised` with border, text 12/400 line-height 1.4, max-width 240; no arrow.
- Motion: opacity + 2 px translate over `--dur-fast`.
- States: hidden, visible, with shortcut, multi-line.
- Keyboard: shows on focus, hides on blur and `Esc`.
- ARIA: Radix Tooltip `role="tooltip"`; content is never interactive; icon-only triggers also carry `aria-label`.
- Gallery examples: rail item tooltip with shortcut `G then P`; truncated URL tooltip; disabled-button explanation wrapper (uses a `span` trigger so disabled buttons still show why).

**Modal**
- Props: `open`, `onOpenChange`, `size: "sm" | "md" | "lg"` (400 / 560 / 720), `title`, `description?`, `preventClose?`, `footer?` (slot; right-aligned buttons, primary last), children.
- Dimensions: padding 24, radius `--radius-panel`, `surface-raised`, border 1 px, max-height `calc(100vh - 64px)` with the body scrolling; header title 16/600, description 13 `text-secondary`; close IconButton at top-right 12 px inset; overlay `--color-overlay`, no blur. Under 640 px becomes a Sheet.
- Motion: overlay opacity `--dur-base`; dialog scale 0.98 → 1 + opacity `--dur-base` `--ease-panel`.
- States: closed, open (three sizes), scrolling body (header and footer stay), `preventClose` (no overlay close, no `Esc`), nested (a ConfirmDialog over a Modal).
- Keyboard: focus trapped; initial focus on the first focusable in the body (or the close button); `Esc` closes unless prevented; focus returns to the opener.
- ARIA: Radix Dialog with `aria-labelledby` / `aria-describedby`; `aria-modal="true"`.
- Gallery examples: three sizes; long scrolling content (staged-changes review diff); prevent-close (deploy in progress); nested confirm.

**ConfirmDialog**
- Props: `variant: "simple" | "destructive"`, `title`, `description`, `consequences?: string[]`, `confirmText?` (required for destructive; the resource name), `confirmLabel` (verb, default "Confirm"; destructive default "Delete"), `cancelLabel` (default "Cancel"), `onConfirm` (may return a promise → loading), `checkbox?: { label, checked, onChange }` (the "Also restore variables" case).
- Dimensions: Modal sm (400); consequences as a 13 px list with 14 px `alert-triangle` in `warning`; typed-confirmation Input md with helper "Type **api** to confirm" (the name in mono); destructive primary Button variant `danger`, disabled until the input matches exactly (case-sensitive).
- States: simple, destructive (empty input → disabled), destructive matched, confirming (loading), with checkbox, error (inline Alert danger with retry).
- Keyboard: `Enter` in the input confirms when matched; `Esc` cancels; initial focus on the input (destructive) or the cancel button (simple; safe default).
- ARIA: `role="alertdialog"` for destructive; description includes the consequences.
- Gallery examples: simple ("Restart api?"); destructive delete service with volume checkbox; rollback with "Also restore variables" checkbox; confirming; error.

**SidePanel**
- Props: `open`, `onOpenChange`, `header: ReactNode` (the inspector header from C7.7 lives here), `tabs?`, `width` controlled or persisted, `minWidth` 480, `maxWidth` 880, `overlay?: boolean` (true under 1280 px per C12), children.
- Dimensions: right-anchored, full height under the top bar (top 48), `surface` background, 1 px left `border`, default width 560, drag handle 6 px wide with a 2 × 24 px grip that appears on hover in `border-strong`; content padding `20px 24px`; header 56 px sticky; tabs 36 px sticky below the header; close IconButton in the header.
- Motion: translate `+24px` → 0 + opacity over `--dur-base` `--ease-panel`; width changes during drag are immediate (no transition); release snaps with the spring.
- States: closed, open, resizing (cursor `col-resize`, body `user-select: none`), at min, at max, overlay mode (1024–1279: covers the canvas with a 20 % scrim), full-width (768–1023), sheet (< 768).
- Keyboard: `Esc` closes; focus moves to the header title on open; the drag handle is a `role="separator"` with `aria-orientation="vertical"`, `aria-valuenow` (px), arrows resize by 16 px, `Home/End` to min/max.
- ARIA: `role="complementary"` with `aria-label="Service inspector"`; not a dialog (the canvas stays operable at ≥ 1280).
- Gallery examples: default width with mock inspector header + tabs; at 480; at 880; overlay mode at 1024; sheet at 390.

**Sheet**
- Props: `open`, `onOpenChange`, `side: "bottom" | "full"`, `title`, `tabs?` (swipeable), `snapPoints?` (bottom: 50 % and 90 %), children.
- Dimensions: full-width, radius `--radius-panel` on the top corners, drag handle 36 × 4 px `border-strong` centered 8 px from the top, header 48 px, content padding 16, safe-area insets respected (`env(safe-area-inset-bottom)`).
- Motion: translate from 100 % over `--dur-base` `--ease-panel`; drag-to-dismiss follows the finger, releases with the spring; swipe between tabs at 0.3 velocity threshold.
- States: closed, open at 50 %, open at 90 %, full, dragging, tab swiping.
- Keyboard: `Esc` closes; focus trapped; tabs via arrows.
- ARIA: Radix Dialog `role="dialog"`; the handle is decorative (`aria-hidden`) with a visually hidden "Close" button for screen readers.
- Gallery examples: bottom 50 % (deploy row actions); full with tabs (mobile inspector); dragging mid-state.

### 4.10 Navigation
- **What:** `<Tabs>` (Radix Tabs; underline style; optional count badge per tab; overflow scroll with fade masks; keyboard arrow navigation; `href` mode rendering links for deep-linkable tabs), `<Breadcrumbs>` (`/` separators in `text-muted`, last item `text` 500, items truncate at 24 characters with middle truncation for IDs), `<EnvironmentSwitcher>` (button showing an 8px color dot + name + chevron; production dot uses `success`; opens a dropdown listing environments, "New environment", "Manage"), `<WorkspaceSwitcher>` (avatar tile + name; dropdown with workspaces, "Create workspace", account row at the bottom), `<RailItem>` and `<Rail>` (56px collapsed icons with tooltips, expands on hover after 150 ms or pins to 220 px; the pinned state persists under `localStorage["lumen.rail.pinned"]`), `<TopBar>` slot layout (breadcrumbs left, switcher + search + activity + bell + theme right).
- **Files:** `packages/ui/src/components/{tabs,breadcrumbs,environment-switcher,workspace-switcher,rail,top-bar}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** the gallery composes rail + top bar + tabs into a mock shell frame at all three widths; arrow keys move between tabs and rail items; the rail collapses at < 1024 px.

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**Tabs**
- Props: `items: { value, label, count?, icon?, href?, disabled? }[]`, `value`, `onValueChange`, `size: "sm" | "md"`, `fitted?` (equal widths, used in sheets).
- Dimensions: list 36 px tall (sm 32) with a 1 px bottom `border` spanning the container; tab padding `0 12px`, text 13/500, `text-secondary` → `text` when active; count `<Badge count>` 8 px after the label; active underline 2 px `accent` that slides between tabs over `--dur-base`; overflow scrolls horizontally with 24 px fade masks and no visible scrollbar.
- States: default, hover (text → `text`), active, focus-visible (ring inset on the tab), disabled, with counts, overflowing, fitted.
- Keyboard: Radix Tabs `automatic` activation with arrows, `Home/End`; in `href` mode tabs are links and `Enter` navigates.
- ARIA: `role="tablist"` / `tab` / `tabpanel`; `href` mode uses `aria-current="page"` on links instead.
- Gallery examples: service tabs (Deployments · Variables · Metrics · Logs · Settings) with a count on Deployments; database tabs (six items overflowing at 390); fitted in a sheet; disabled tab with tooltip.

**Breadcrumbs**
- Props: `items: { label, href?, icon?, truncate?: "end" | "middle" }[]`, `maxItems` (default 4; middle items collapse into a "…" menu).
- Dimensions: text 13; separator `/` in `text-muted` with 8 px padding; current item 13/500 `text`; items truncate at 24 characters with a tooltip for the full name; icons 14 px before workspace and project items.
- States: one item, three items, collapsed middle, hover on link (underline `text`), focus-visible.
- Keyboard: links are tabbable; the collapse menu is a DropdownMenu.
- ARIA: `nav aria-label="Breadcrumb"` with an ordered list; `aria-current="page"` on the last item.
- Gallery examples: Workspace / Project / Service; long names truncated; five levels collapsed.

**EnvironmentSwitcher**
- Props: `environments: { id, name, kind, color? }[]`, `value`, `onValueChange`, `onCreate`, `onManage`, `size`.
- Dimensions: trigger is a secondary Button md with an 8 px color dot (production `success`, staging `info`, preview `warning`, custom `accent`), name 13/500, `chevron-down` 14; menu as DropdownMenu with radio items, then a separator, "New environment" (`plus`) and "Manage" (`settings`); production item carries a `Badge` "Production".
- States: closed, open, selected, hover, switching (dot pulses once), many environments (scrolls at 8).
- Keyboard: `E` from the shell focuses/opens it (wired in Phase 05); arrows and `Enter` within.
- ARIA: trigger `aria-label="Environment: production"`; menu items `menuitemradio`.
- Gallery examples: production only; production + staging + two PR previews; open menu; switching animation.

**WorkspaceSwitcher**
- Props: `workspaces: { id, name, avatarUrl? }[]`, `value`, `onValueChange`, `onCreate`, `account: { name, email, avatarUrl? }`, `collapsed?: boolean` (rail collapsed → only the tile).
- Dimensions: tile 32 × 32 radius `--radius-control` with the workspace initial (16/600) or avatar; name 13/500 beside it when expanded; menu 240 px wide with workspace rows (Avatar 24 + name + check), "Create workspace", separator, account row (Avatar 24 + name + email 12 `text-secondary`) linking to account settings.
- States: collapsed tile, expanded, open, hover, selected workspace, single workspace (no list, just create).
- Keyboard: as DropdownMenu.
- ARIA: trigger `aria-label="Workspace: Acme"`.
- Gallery examples: collapsed; expanded; open with three workspaces; single workspace.

**Rail / RailItem**
- Props: `Rail` `items: { id, label, icon, href, shortcut?, active? }[]`, `pinned`, `onPinnedChange`, `top: ReactNode` (WorkspaceSwitcher), `bottom: ReactNode` (avatar, help), `hoverExpand` (default true); `RailItem` renders one entry.
- Dimensions: collapsed 56 px wide, item 40 px tall with a 20 px icon centered, active item has a 2 px `accent` bar at the left edge and `text` icon (inactive `text-secondary`), hover `surface-hover` radius `--radius-control` inset 8 px; expanded 220 px with 13/500 labels and 12 px gap; pin IconButton at the bottom; expansion after 150 ms hover, collapse 300 ms after leave; background `surface`, right 1 px `border`.
- Motion: width over `--dur-base` `--ease-panel`; labels fade in after 80 ms.
- States: collapsed, hover-expanded, pinned, active item, hover item, focus-visible item, tablet (hidden behind a menu button under 1024), mobile (replaced by the bottom tab bar per C12).
- Keyboard: `Tab` enters the rail; arrows move between items; `Enter` navigates; `G then H/P/S/T` shortcuts are handled by the shell (Phase 05) and displayed in tooltips here.
- ARIA: `nav aria-label="Main"`; items are links with `aria-current="page"`; tooltips carry the label + shortcut when collapsed.
- Gallery examples: collapsed; hover-expanded; pinned; active states for each destination; 1024 collapsed variant; mobile bottom tab bar (Home, Projects, Deploys, Servers, More).

**TopBar**
- Props: `left: ReactNode` (Breadcrumbs), `center?: ReactNode`, `right: ReactNode[]` (EnvironmentSwitcher, search button, activity indicator, bell, theme toggle), `banner?: ReactNode` (global banners render above it).
- Dimensions: 48 px tall, `bg` background with a 1 px bottom `border`, padding `0 16px`, right cluster with 8 px gaps; the ⌘K search button is a secondary Button sm with `search` icon, "Search" label and `<Kbd>⌘K</Kbd>` (icon-only under 1024); the deploy activity indicator is a ghost Button sm with a pulsing `warning` dot and "2 deploying" that opens a Popover.
- States: default, with banner above (offline / update available), narrow (1024: search collapses), mobile (breadcrumbs collapse to the current item only), reconnecting (a 2 px `warning` progress line at the bottom edge, C7.26).
- Keyboard: all items tabbable in DOM order left → right.
- ARIA: `header role="banner"`; the activity button `aria-label="2 deployments in progress"`.
- Gallery examples: full; with an offline banner; 1024; 390; reconnecting.

### 4.11 Feedback
- **What:** `<Toaster>` and `toast()` (bottom-right, stack up to 3, newest at the bottom, 8 s timer paused on hover and on window blur, optional `action` and `undo` buttons, `aria-live="polite"` region; variants info/success/warning/danger), `<Alert>` (inline banner; info/warning/danger; optional action button; dismissible unless `critical`), `<ProgressSteps>` (the deploy timeline: Queued → Building → Pre-deploy → Deploying → Health check → Live; each step has a state pending/active/done/failed/skipped, a duration in tabular numerals, and the active step ticks live), `<Skeleton>` (block, text lines, circle; shimmer 1.6 s; `aria-hidden`), `<EmptyState>` (icon 40 px, title, one sentence, one primary action, optional secondary link; max-width 420 px centered), `<ErrorCard>` (renders a `LumenError` from `@lumen/shared`: title, explanation, fix action button, "Show raw error" collapsible, "Copy for support" button).
- **Files:** `packages/ui/src/components/{toast,alert,progress-steps,skeleton,empty-state,error-card}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** toasts stack and dismiss correctly in a Playwright test with fake timers; the error card renders every J6 catalog entry in the gallery from the real catalog (proves the shapes match).

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**Toast / Toaster**
- API: `toast({ title, description?, variant: "info" | "success" | "warning" | "danger", action?: { label, onClick }, undo?: () => void, duration = 8000 })`; `<Toaster position="bottom-right" max={3}>` mounted once in the shell.
- Dimensions: 360 px wide (full-width minus 16 px gutters under 640), min-height 48, padding `12px 16px`, radius `--radius-card`, `surface-raised` with border and (light) `--shadow-raised`; 16 px variant icon in the variant color; title 14/500, description 13 `text-secondary`; action Button sm secondary and "Undo" Button sm ghost on the right; close IconButton sm appears on hover/focus; a 2 px timer bar at the bottom edge in the variant color shrinks over the duration and pauses on hover and on window blur.
- Motion: enter with the toast spring from `+8px` and opacity; exit opacity + `-8px` over 120 ms; the stack re-flows with the spring; newest at the bottom; the fourth toast pushes the oldest out.
- States: each variant, with action, with undo, hover (paused), stacked ×3, dismissing, reduced motion (no slide).
- Keyboard: `F8` focuses the newest toast (documented in the shortcut sheet); `Tab` moves through its buttons; `Esc` dismisses the focused toast.
- ARIA: the region is `aria-live="polite"` `aria-relevant="additions"`; danger toasts use `role="alert"`.
- Gallery examples: four variants; with undo ("Variable deleted · Undo"); with action ("Deploy failed · View logs"); stack of three; paused.

**Alert**
- Props: `variant: "info" | "warning" | "danger"`, `title?`, `children`, `action?: { label, onClick | href }`, `dismissible?`, `critical?` (not dismissible), `compact?`.
- Dimensions: padding `12px 16px`, radius `--radius-card`, 1 px border in the variant color at 40 % opacity, background variant color at 8 % opacity; 16 px icon (`info`, `alert-triangle`, `alert-circle`) in the variant color; title 14/500 + body 13; action Button sm secondary on the right (wraps below under 480); dismiss IconButton sm.
- States: three variants, with title, without title, with action, dismissible, critical, compact (one line, 36 px), inside a modal, full-width global banner (square corners, no side borders).
- Keyboard: dismiss and action are tabbable.
- ARIA: `role="status"` for info, `role="alert"` for warning/danger when inserted dynamically; dismiss `aria-label="Dismiss"`.
- Gallery examples: `.env.example` suggestion banner (info + "Add them"); volume downtime note (warning); server offline (danger, critical, global); compact.

**ProgressSteps**
- Props: `steps: { id, label, state: "pending" | "active" | "done" | "failed" | "skipped", startedAt?, finishedAt?, detail? }[]`, `orientation: "horizontal" | "vertical"`, `now?` (for live ticking).
- Dimensions: horizontal: 24 px circles connected by 2 px lines, label 13/500 below, duration 12 `meta` tabular below the label; vertical: 24 px circles at the left, 2 px line, label + duration + optional detail on the right with 16 px row gap. Colors: pending `border-strong` ring + `text-secondary`; active `warning` ring with an inner 8 px pulsing dot + `text`; done `success` fill with a 12 px `check` in `accent-ink`; failed `danger` fill with `x`; skipped `text-muted` ring with a dash. The active duration ticks every second in tabular numerals.
- States: all pending; step 3 active; all done ("Live" total duration shown); failed at step 4 (later steps pending and dimmed); skipped step; vertical; reduced motion (no pulse).
- Keyboard: none (presentational) unless steps carry `href` (then links).
- ARIA: `ol` with `aria-current="step"` on the active step; the live region announces step changes ("Deploying, step 4 of 6").
- Gallery examples: Queued → Building → Pre-deploy → Deploying → Health check → Live in each state; vertical inside a mock inspector; live ticking demo.

**Skeleton**
- Props: `variant: "block" | "text" | "circle"`, `width`, `height`, `lines?` (text: number of lines, last line 60 %), `radius?`.
- Dimensions: `surface-hover` base with a shimmer gradient (`surface-raised` at 40 % opacity) sweeping 1.6 s linear infinite; text lines 12 px tall with 8 px gaps; radius `--radius-control` by default, circle full.
- States: block, text ×3, circle, composite (card skeleton matching CanvasNode; row skeleton matching DataTable; chart skeleton with axis lines), reduced motion (static two-tone).
- ARIA: `aria-hidden="true"`; the parent region carries `aria-busy="true"`.
- Gallery examples: primitives; side-by-side with the real component for node, deployment card, table rows, chart.

**EmptyState**
- Props: `icon: IconName` (40 px) or `illustration?: ReactNode`, `title`, `description` (one sentence), `action?: { label, onClick | href, icon? }`, `secondary?: { label, href }` (docs link), `size: "md" | "hero"`.
- Dimensions: centered, max-width 420 (hero 560), icon 40 px in `text-secondary` inside a 64 px `surface-raised` circle (hero: 48 px icon in an 80 px circle), title 16/600 (hero 24/600), description 14 `text-secondary`, action Button md primary (hero lg), secondary link 13 `accent-text` below; vertical gaps 16 / 8 / 20 / 12.
- States: md; hero; with secondary link; without action (read-only viewer role: "Ask an admin to add a server"); inside a table body; inside the inspector; with tiles (the empty canvas variant renders four option tiles under the description).
- Keyboard: action and link tabbable.
- ARIA: `role="region"` `aria-labelledby` the title.
- Gallery examples: "No logs yet"; "Create your first project" with three quick-start tiles; "Connect your first server" hero with provider tiles; viewer variant.

**ErrorCard**
- Props: `error: LumenError` (from `@lumen/shared`), `onAction?(actionId)`, `compact?`, `context?: { serverName?, port?, memoryMb?, ... }` (already applied by `makeError`).
- Dimensions: padding 16, radius `--radius-card`, 1 px `danger` border at 40 % opacity, `surface` background; header row: 20 px `alert-circle` in `danger`, title 16/600; explanation 14 `text-secondary`; fix line 14 `text` with a leading 14 px `sparkles` icon; primary Button md (`action.kind` button/link/command; command renders a CopyField below); "Show raw error" ghost Button sm toggles a CodeBlock (mono 12, max-height 200, scroll); "Copy for support" ghost sm copies `code`, `title`, `supportId`, raw and the current URL as text.
- States: each `action.kind`; with raw collapsed; raw expanded; compact (title + fix + action in one row, used in deployment rows); no action (`kind: "none"`); with `supportId`.
- Keyboard: buttons tabbable; the raw block is focusable and scrollable.
- ARIA: `role="alert"` when it appears after an action; otherwise `role="region"` labelled by the title; the raw block `aria-label="Raw error details"`.
- Gallery examples: every J6 catalog entry rendered from `makeError` with sample context (twenty cards); compact in a deployment row; raw expanded.

### 4.12 Status
- **What:** `<StatusDot status>` (8 px; pulses for building/deploying), `<StatusPill status>` (dot + text, 22 px tall), `<Badge>` (neutral/accent/success/warning/danger; 20 px tall; `count` mode), `<Avatar>` (20/24/32; image with initials fallback; `alt` required), `<AvatarStack>` (overlap −6 px, max 4 then "+N"), `<Kbd>` (renders `⌘` on macOS and `Ctrl` elsewhere from a `platform` context; sequences like `G then H` render as two keys with "then").
- **Files:** `packages/ui/src/components/{status-dot,status-pill,badge,avatar,avatar-stack,kbd}.tsx` and matching `.examples.tsx` / `.test.tsx`, `packages/ui/src/lib/platform.ts`
- **Done when:** every status from C4 renders in both components with icon + color + text; the pulse stops under reduced motion and the pill still reads "Building".

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**StatusDot**
- Props: `status: ServiceStatus` (`active | building | deploying | failed | crashed | sleeping | stopped | queued | skipped | cancelled | superseded | removed | online | offline`), `size: 6 | 8 | 10`, `pulse?` (auto for building/deploying), `label?` (visually hidden text; default the status word).
- Dimensions: 8 px circle by default; building/deploying render a half-filled circle (left half filled, via `conic-gradient`) that pulses; stopped/queued/skipped/cancelled use `text-muted` fill with a 1 px `border-strong` ring so they remain visible on `surface`.
- States: every status; pulsing; reduced motion (static half circle); 6 px inside pills and breadcrumbs; 10 px in the server cards.
- ARIA: `role="img"` with `aria-label` = status word, unless a sibling text already states it (then `aria-hidden`).
- Gallery examples: all statuses in a row at three sizes; pulsing; reduced-motion comparison.

**StatusPill**
- Props: `status`, `label?` (default from the C4 status words: "Active", "Building", "Deploying", "Failed", "Crashed", "Sleeping", "Stopped", "Queued", "Skipped", "Cancelled", "Superseded", "Removed"), `size: "sm" | "md"`, `detail?` ("· 3 restarts").
- Dimensions: md 22 px tall, padding `0 8px 0 6px`, radius full, text 12/500 in the `-text` token, background the status color at 10 % opacity, 6 px StatusDot with 6 px gap; sm 18 px, text 11.
- States: every status; with detail; sm; inside a table cell; inside the node; long detail truncated.
- ARIA: text is the accessible name; the dot is `aria-hidden`.
- Gallery examples: all statuses × 2 sizes; with details ("Crashed · restarting in 8s"); in context (node header, table row, inspector header).

**Badge**
- Props: `variant: "neutral" | "accent" | "success" | "warning" | "danger" | "outline"`, `count?: number` (renders "99+" above 99), `size: "sm" | "md"`, `icon?`.
- Dimensions: md 20 px tall, padding `0 6px`, radius full, text 12/500; count mode min-width 20 with centered tabular digits; neutral `surface-raised` + `text-secondary`; accent `accent-subtle` + `accent-text`; status variants at 10 % background + `-text`; outline 1 px `border` + `text-secondary`.
- States: each variant; count 3 / 12 / 120 ("99+"); with icon ("Production" with `lock`); sm.
- ARIA: plain text; count badges get `aria-label="3 deployments"` from the parent.
- Gallery examples: variants; counts; "Production", "Preview #42", "Update available", "×3" replicas chip.

**Avatar**
- Props: `src?`, `alt` (required), `name` (for initials), `size: 20 | 24 | 32`, `shape: "circle" | "square"` (square for workspaces), `status?: "online" | "offline"` (8 px dot at bottom-right, size 32 only).
- Dimensions: initials text 10 / 11 / 13 at 500; background derived from a 6-color hash of the name using the muted tint of `accent`, `info`, `success`, `warning`, `danger`, `sleeping` at 20 % with the `-text` color; 1 px `border` ring; image `object-fit: cover`.
- States: image; initials; loading (skeleton circle); broken image (falls back to initials); with status dot.
- ARIA: `img` with `alt`; initials `role="img" aria-label={name}`.
- Gallery examples: three sizes × image / initials; square workspace tiles; status dot; broken image.

**AvatarStack**
- Props: `people: { name, src? }[]`, `max` (default 4), `size: 20 | 24`.
- Dimensions: overlap −6 px (size 20) / −8 px (size 24), each with a 2 px `surface` ring so overlaps read cleanly; overflow tile "+N" in `surface-raised` `text-secondary`; hover lifts the hovered avatar to the top (z-index within the stack) and shows a Tooltip with the name.
- States: one; three; six (shows 4 + "+2"); zero (renders nothing, parent shows "No members" text).
- Keyboard: each avatar focusable when `interactive` (tooltip on focus).
- ARIA: `role="group" aria-label="Members: Ana, Ben, +2 more"`.
- Gallery examples: 1 / 3 / 6 / 0; hover lifted; interactive.

**Kbd**
- Props: `keys: string | string[]` (accepts `"mod"` → `⌘` on macOS / `Ctrl` elsewhere, `"shift"` → `⇧`, `"enter"` → `⏎`, `"esc"` → `Esc`, `"then"` → renders the word "then" between keys), `size: "sm" | "md"`.
- Dimensions: md 18 px tall, min-width 18, padding `0 5px`, radius 4, `surface-raised` with a 1 px `border` and a 1 px bottom `border-strong` (key-cap feel), Mono 11/500 `text-secondary`; sm 16 px, 10 px text; combinations render keys separated by 2 px with no `+`; sequences render "then" in 11 px Sans `text-muted` with 4 px margins.
- States: single; combo (`⌘K`, `⇧⏎`); sequence (`G then P`); inside a tooltip (inherits `surface`); inside a menu item; on `accent-fill` (inverted tokens).
- ARIA: `kbd` element; `aria-label` spells the keys ("Command K").
- Gallery examples: the full C13 shortcut list rendered as a two-column sheet (this becomes the `?` shortcut sheet content in Phase 05).

### 4.13 Data display
- **What:** `<DataTable>` (TanStack Table + TanStack Virtual; sortable headers with `aria-sort`; row actions menu; row selection with checkboxes; sticky header; loading rows as skeletons; empty state slot; dense mode 32 px rows), `<Chart>` (uPlot wrapped; line/area; `limitLine` (dashed, `warning`), `markers` (deploys as vertical ticks with hover tooltip), synced crosshair through a `ChartSyncGroup` context; text summary for screen readers generated from the series: min/max/last), `<CodeBlock>` (mono, line numbers optional, copy button, wraps or scrolls), `<Terminal>` placeholder frame (the xterm mount arrives in Phase 14; here a static mono box with the banner style), `<DiffViewer>` (side-by-side and inline; for staged changes: old → new per field; variables show "value changed" instead of values).
- **Files:** `packages/ui/src/components/{data-table,chart,chart-sync,code-block,terminal-frame,diff-viewer}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** the table virtualises 5,000 rows at 60 fps in the gallery (Chrome performance trace attached), sorting is keyboard-operable, and the chart renders its text summary in a visually hidden element.

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**DataTable**
- Props: `columns: ColumnDef[]` (TanStack; each with `size`, `align`, `sortable`, `mono`, `tabular`, `cell`), `data`, `rowKey`, `sorting` controlled, `onSortingChange`, `selection?` (checkbox column), `rowActions?: (row) => MenuItem[]`, `onRowClick?`, `loading?` (renders 8 skeleton rows), `empty: ReactNode`, `error?: { message, onRetry }`, `dense?` (or from `data-density`), `virtualize?` (auto above 100 rows), `stickyHeader` (default true), `responsive?: "scroll" | "cards"`.
- Dimensions: header 36 px, text 12/500 `text-secondary`, sort indicator 14 px `chevrons-up-down` → `chevron-up/down` in `text` when sorted; rows 40 px (dense 32), 1 px `border` between rows, hover `surface-hover`, selected `accent-subtle`; cell padding `0 12px`, text 13; first and last cells get 16 px outer padding; row actions column 40 px with a `more-horizontal` IconButton sm visible always at 40 % opacity and 100 % on hover/focus; selection column 40 px with a Checkbox.
- Motion: none on rows; the skeleton shimmer only.
- States: loading; loaded; empty (EmptyState slot inside the body); error (inline Alert row with Retry); sorted asc/desc; row hover; row selected; some selected (header indeterminate); virtualized 5,000 rows; dense; cards mode under 640 (each row becomes a card with label/value pairs and the actions menu at top-right); sticky header while scrolled.
- Keyboard: header sort buttons are real buttons; `Tab` moves through interactive cells; `ArrowUp/Down` moves the focused row when `onRowClick` is set (roving tabindex on rows), `Enter` activates, `Shift+F10` opens row actions.
- ARIA: `role="table"`, `aria-rowcount`, `aria-sort` on headers, `aria-selected` on rows, `aria-busy` while loading; cards mode uses `role="list"`.
- Gallery examples: deployments history (status pill, commit mono, trigger, time meta, duration tabular, actions); variables table (name mono, masked value, source badge); audit log 5,000 rows virtualized; empty; error; dense; cards at 390.

**Chart**
- Props: `series: { id, label, data: [ts, value][], color?: "accent" | "info" | "success" | "warning" | "danger" }[]`, `kind: "line" | "area"`, `unit: "%" | "MB" | "GB" | "req/min" | "ms" | "KB/s"`, `range: { from, to }`, `limitLine?: { value, label }`, `markers?: { ts, label, kind: "deploy" | "oom" | "restart" }[]`, `syncId?` (crosshair group), `height` (default 160), `loading?`, `empty?: string`, `summary?: string` (overrides the generated screen-reader summary).
- Dimensions: plot area with a 32 px left axis (tabular 11 `text-secondary` labels, 3–4 ticks), 20 px bottom axis (time labels 11), gridlines 1 px `border` at 60 % opacity, series 1.5 px lines (area fill at 12 % opacity), limit line 1 px dashed `warning` with a right-aligned 11 px label, deploy markers as 1 px `text-secondary` vertical ticks with a 6 px triangle at the top, OOM markers as 8 px `danger` dots at the top; crosshair 1 px `text-secondary` with a tooltip (surface-raised, 12 px, series color swatches 8 px, tabular values, timestamp) positioned to avoid the edges; legend below as 12 px items with 8 px swatches, click toggles a series.
- Motion: none (data updates redraw immediately; uPlot); the crosshair follows the pointer with no easing.
- States: loading (skeleton with axis lines); empty ("No data for this range"); one series; four series; with limit line; with markers; replica breakdown (dashed secondary lines); synced crosshair across four charts; hovered legend item highlights its series; a gap in the data (line breaks, not interpolated).
- Keyboard: the chart is focusable; `ArrowLeft/Right` move the crosshair by one sample, `Home/End` to the ends, `Esc` hides it; the tooltip content is mirrored into the live region on keyboard moves (throttled to one announcement per 500 ms).
- ARIA: `role="img"` with `aria-label` = the generated summary ("CPU, last 1 hour: minimum 12 %, maximum 71 %, latest 34 %, limit 100 %; 2 deploys"); the legend buttons carry `aria-pressed`.
- Gallery examples: CPU with limit; Memory with limit + OOM marker; Network in/out (two series); Requests/min area; four synced charts with deploy markers; loading; empty; gap.

**CodeBlock**
- Props: `code`, `language?: "bash" | "toml" | "json" | "env" | "text"` (minimal token coloring: comments `text-muted`, strings `success-text`, keys `accent-text`; no full highlighter), `lineNumbers?`, `wrap?`, `copy?` (default true), `maxHeight?`, `title?` (a 32 px header bar with the filename in 12 mono and the copy button).
- Dimensions: padding 12 (16 with line numbers), radius `--radius-card`, `bg` background inside `surface` (dark) / `#F3F3F0` (light), 1 px `border`, Mono 13 line-height 20 px; line numbers 11 `text-muted` right-aligned in a 32 px gutter with `user-select: none`; copy IconButton sm at top-right appears on hover/focus (always visible on touch).
- States: default; with title; with line numbers; wrapped; scrolling (maxHeight) with a bottom fade; copied; long single line horizontal scroll.
- Keyboard: the block is focusable and scrollable; `⌘C` inside copies the selection or, with nothing selected, the whole block.
- ARIA: `<pre><code>` with `aria-label` from the title; line numbers `aria-hidden`.
- Gallery examples: install command; `lumen.toml` example (J3); DNS record values; JSON config snapshot with line numbers and scroll.

**TerminalFrame**
- Props: `banner?: string` ("You're inside a live container. Changes are lost on redeploy."), `toolbar?: ReactNode` (replica select, shell select, reconnect), `children` (the xterm mount arrives in Phase 14), `status: "connecting" | "connected" | "disconnected"`.
- Dimensions: `#0B0D10` background in both themes (terminals stay dark; contrast for the light theme frame is provided by a 1 px `border-strong`), radius `--radius-card`, 36 px toolbar with 12 px controls, banner as a compact Alert warning inside the top of the frame, min-height 320, resize handle at the bottom edge (6 px) for the bottom-dock layout.
- States: connecting (spinner + "Connecting…"), connected, disconnected (overlay with "Disconnected · Reconnect" Button), with banner, full-panel mode, bottom-dock mode at 320 px.
- Keyboard: the frame passes keys through to xterm in Phase 14; the toolbar is tabbable; `Esc` while the toolbar has focus returns to the terminal.
- ARIA: `role="region" aria-label="Shell in api (replica 1)"`; status announced.
- Gallery examples: connected with a static mono transcript; connecting; disconnected; bottom-dock.

**DiffViewer**
- Props: `changes: { group: string, items: { field, before, after, kind: "changed" | "added" | "removed", secret?: boolean }[] }[]`, `mode: "side-by-side" | "inline"`, `collapsible?`.
- Dimensions: group header 36 px with the service name (14/500), framework icon 16 and a count Badge; rows 32 px: field name Mono 13 (40 % width), before → after in Sans 13 with `removed` in `danger-text` on 8 % `danger` background and `added` in `success-text` on 8 % `success` background; secrets render "value changed" in `text-secondary` italic with a 14 px `lock`; the arrow is a 14 px `arrow-right` in `text-muted`; inline mode stacks before/after with `−` / `+` gutters in Mono.
- States: side-by-side; inline; groups collapsed; only additions; only removals; secret rows; empty ("Nothing to review"); long values wrapped with `overflow-wrap: anywhere`.
- Keyboard: group headers are buttons when collapsible.
- ARIA: `role="table"` per group with column headers "Setting", "Before", "After"; changes announced as "Memory, changed from 512 MB to 1 GB".
- Gallery examples: staged changes for two services (memory, start command, one variable added, one sealed variable changed); inline mode; collapsed groups; empty.

### 4.14 Specialized
- **What:** `<LogViewer>` (TanStack Virtual list; ANSI colors via a small parser; JSON lines detected and expandable into a key-value tree; level coloring `error` danger / `warn` warning / `info` text / `debug` text-secondary; search highlight; "pause on scroll up" with a floating "Jump to live" button; toggles for timestamps, wrap, dense; line click copies), `<CanvasNode>` (260×120 presentational card, §5 anatomy), `<VolumeChip>` (attached sub-card under a node with mount path and a connector notch), `<CanvasGroup>` (labeled region with color tag; rename on double-click), `<CanvasEdge>` (dashed path with a label on hover), `<Stepper>` (wizard progress: numbered steps, current/done/upcoming, "Back" always allowed), `<DnsRecordCard>` (type / name / value with copy buttons and a live check indicator: checking → ok / not yet), `<PortCheckCard>` (per-port row with ✓ / ✕ and a provider-specific fix disclosure).
- **Files:** `packages/ui/src/components/{log-viewer,ansi,canvas-node,volume-chip,canvas-group,canvas-edge,stepper,dns-record-card,port-check-card}.tsx` and matching `.examples.tsx` / `.test.tsx`
- **Done when:** the log viewer renders 50,000 static lines at 60 fps while scrolling and keeps "Jump to live" correct; the canvas node shows every C7.6 element and every status; the group and edge render inside a static React Flow instance on the gallery "Canvas" page.

#### Component specifications (dimensions are proposals until confirmed in `UI_DECISIONS.md`)

**LogViewer**
- Props: `lines: LogLine[]` (`{ id, ts, text, level?, json?, source?: "stdout" | "stderr" | "build" | "http" }`), `live?: boolean`, `onJumpToLive`, `highlight?: string` (search term), `showTimestamps` (default true), `wrap` (default false), `dense?`, `onLineClick?` (default copies), `emptyMessage` (default "No logs yet"), `followOutput` controlled, `height` or `fill`.
- Dimensions: Mono 13 line-height 20 px (dense: 12 / 18 px), background `bg` inside the panel, no row borders; timestamp column 88 px in `text-muted` tabular (`HH:mm:ss.SSS`), level pill 40 px wide (`ERR` `danger-text`, `WRN` `warning-text`, `INF` `text-secondary`, `DBG` `text-muted`), text in `text` with ANSI colors mapped to the eight token-compatible colors (`danger`, `success`, `warning`, `info`, `accent` for magenta/cyan, `text-secondary` for white/bright-black); `stderr` lines carry a 2 px `danger` left bar at 60 % opacity; JSON lines show a 14 px `chevron-right` toggle and expand into a key-value tree (keys Mono `accent-text`, values `text`, 16 px indent per level) with "Copy JSON"; search matches highlighted with `warning` at 30 % background; the "Jump to live" pill (secondary Button sm with `arrow-down-to-line`, `surface-raised`, `--shadow-raised`) floats 16 px from the bottom center when scrolled up; a 1 px `accent` line marks the "new since you paused" boundary.
- Motion: new lines append without animation; the pill fades in over `--dur-fast`.
- States: empty; loading (three skeleton lines); live following; paused (scrolled up, pill visible, boundary line); search with matches count ("12 matches" + up/down); a JSON line expanded; wrapped; dense; server offline banner at the top ("Server offline — showing logs up to 14:02"); 50,000 lines virtualized; selection/copy feedback ("Line copied" toast).
- Keyboard: the list is focusable; `ArrowUp/Down` move a focused line (roving), `Enter` expands JSON, `⌘C` copies the focused line, `End` jumps to live, `⌘F` focuses the filter input (Phase 08 wires the filter bar), `Space` toggles pause.
- ARIA: `role="log"` with `aria-live="polite"` for the last appended line only (throttled to one announcement per second; the whole list is not announced); each line `role="listitem"` with the timestamp and level in the accessible name.
- Gallery examples: mixed stdout/stderr with ANSI; JSON lines expanded; paused with boundary; search; empty; offline banner; dense; 50k lines.

**CanvasNode**
- Props: `service: { id, name, kind: "web" | "worker" | "cron" | "database", framework?, status, publicUrl?, lastDeploy?: { at, commitMessage, commitSha }, replicas?, server?: { name, region? }, volume?: { name, mountPath, usedPct? } }`, `selected?`, `dragging?`, `serverOffline?`, `onOpen`, `onRename`, `contextMenu?`.
- Dimensions: 260 × 120 (fixed; content truncates), radius `--radius-card`, `surface` with 1 px `border`, hover `border-strong`, selected 2 px `accent` ring (offset 0) + `accent-subtle` background tint; layout: header row 20 px icon (framework, or database icon for kind database, or `clock` for cron, or `cpu` for worker) + name 14/600 truncated + StatusPill sm at the right; second row: public URL 12 `text-secondary` truncated end with a 12 px `external-link` on hover (click opens; `globe` icon when no URL: "No public URL"); third row: `meta` 12: "3 min ago · fix: retry on 502" truncated; chips row at the bottom: replica Badge "×3", server Badge with `server` icon "oracle-1", both `outline`; `VolumeChip` renders 8 px below, connected by a 2 × 8 px `border-strong` stem; server-offline state adds a 2 px `warning` ring and a 14 px `alert-triangle` in the header with tooltip "Server 'oracle-1' is offline".
- Motion: hover border over `--dur-fast`; selection ring appears instantly; drag uses React Flow's transform (no transition); programmatic moves use the canvas spring; the status dot pulses while building.
- States: every status; selected; hover; dragging (opacity 0.9, `--shadow-raised` in both themes); multi-selected; server offline; no URL; no deploy yet ("Not deployed yet"); with volume; cron (schedule text replaces the URL row: "Every day at 3:00"); database (kind icon, "Private only" replaces URL); long name; renaming (inline Input over the name, `Enter` saves, `Esc` cancels).
- Keyboard: node is a `button`; `Enter` opens the inspector; `F2` renames; arrows nudge 4 px (Shift 24 px) when selected (handled by the canvas in Phase 05); `Shift+F10` context menu.
- ARIA: `role="group" aria-label="api, Active, deployed 3 min ago"`; the URL is a separate link with `aria-label="Open api.example.com"`.
- Gallery examples: every status; selected/hover/dragging; offline; database with volume; cron; worker; no URL; not deployed; renaming; 100-node performance page.

**VolumeChip**
- Props: `volume: { id, name, mountPath, usedBytes?, limitBytes? }`, `onOpen`, `attached: boolean`.
- Dimensions: 260 × 36, radius `--radius-card`, `surface` with a dashed 1 px `border` (dashed signals "storage, not compute"), 16 px `hard-drive` icon, mount path Mono 12 truncated middle, usage 12 `meta` tabular at the right ("1.2 / 5 GB") with a 40 × 3 px usage bar (`accent`; `warning` above 80 %, `danger` above 95 %); connector stem to the node above.
- States: attached; detached (no stem, rendered as a standalone node with the name instead of the path); usage normal / warning / danger; no limit ("1.2 GB"); hover; selected; server offline (inherits the ring).
- Keyboard: `button`; `Enter` opens the volume panel.
- ARIA: `aria-label="Volume data at /var/lib/postgresql/data, 1.2 of 5 gigabytes used"`.
- Gallery examples: attached under a database node at each usage level; detached; no limit.

**CanvasGroup**
- Props: `group: { id, label, color?: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }`, `bounds`, `selected?`, `onRename`, `onColorChange`, `onRemove`.
- Dimensions: a rounded region (radius 14) with a 1 px `border-strong` at 60 % opacity and a fill of the chosen color at 4 % (neutral: `surface` at 40 %); label bar at the top-left as a 28 px pill with the label 13/500, a 8 px color dot and a `more-horizontal` IconButton sm on hover; padding 24 inside the bounds so nodes never touch the edge; the group sits below nodes in z-order.
- States: neutral; colored; selected (border at 100 %); hover (label actions visible); renaming (inline Input); empty group ("Drag services here" in `text-muted` centered); dragging nodes in (fill brightens to 8 %).
- Keyboard: the label pill is a `button`; `F2` renames; `Delete` removes the group (nodes stay; confirm not needed, undo toast instead).
- ARIA: `role="group" aria-label="Backend, 2 services"`.
- Gallery examples: neutral with two nodes; colored variants; empty; selected; renaming.

**CanvasEdge**
- Props: `from`, `to`, `variables: string[]` (the referenced variable names), `selected?`, `dimmed?` (when another node is selected).
- Dimensions: 1.5 px dashed (`4 4`) path in `text-muted` with a smooth-step routing and 12 px corner radius; arrowhead 6 px in `text-muted` at the target; hover/selected switches to `accent` solid with a label chip at the midpoint (Badge outline, Mono 11) listing up to two variable names and "+N"; dimmed edges drop to 40 % opacity.
- Motion: the dash offset does not animate (calm); hover color over `--dur-fast`.
- States: default; hover with label; selected; dimmed; many edges into one node (fan-in offset by 12 px each); self-referencing (not rendered; a `self` reference is not an edge).
- Keyboard: edges are not focusable; the variable relationships are listed in the inspector's Variables tab (Phase 05) for keyboard users.
- ARIA: `aria-hidden` (decorative; information is available in the Variables tab).
- Gallery examples: api → postgres with label `DATABASE_URL`; api → redis; fan-in of three edges; dimmed; selected.

**Stepper**
- Props: `steps: { id, label, optional? }[]`, `current`, `completed: string[]`, `onStepClick?` (only completed steps are clickable), `orientation`.
- Dimensions: horizontal: 24 px numbered circles (12/500 tabular) joined by 2 px lines, label 13/500 below (`text-secondary` upcoming, `text` current, `text-secondary` done), optional steps show "Optional" in `meta`; current circle `accent-fill` with `accent-ink` number; done `success` with `check`; upcoming `border-strong` ring; vertical variant for the setup wizard's left column at ≥ 1024 with 16 px gaps.
- States: step 1 of 6; middle; last; with optional steps; done step hover (clickable); vertical; mobile (collapses to "Step 3 of 6" text with a 2 px progress bar).
- Keyboard: completed steps are buttons.
- ARIA: `nav aria-label="Setup progress"` with an ordered list and `aria-current="step"`.
- Gallery examples: the C7.1 wizard (Verify · Admin · Domain · GitHub · Email · Backups) at each step; Add-server wizard (Name · Command · Checklist · Done); mobile.

**DnsRecordCard**
- Props: `record: { type: "A" | "AAAA" | "CNAME" | "TXT", name, value, ttl? }`, `check: { status: "idle" | "checking" | "ok" | "mismatch" | "missing", observed?: string, checkedAt? }`, `onRecheck`.
- Dimensions: `surface` card, radius `--radius-card`, padding 16; three labelled fields (Type · Name · Value) as CopyFields sm in Mono with 12 `text-secondary` labels above; status row at the bottom: StatusDot-style indicator + text ("Checking…" with a spinner; "Pointing here" `success-text`; "Points to 203.0.113.9, expected 198.51.100.4" `warning-text`; "Not found yet" `text-secondary`) + "Recheck" ghost Button sm + "checked 20s ago" `meta`.
- States: idle; checking; ok; mismatch (shows observed vs expected); missing; wildcard record (name `*.apps`); CNAME.
- Keyboard: copy buttons and recheck tabbable.
- ARIA: `role="group"` labelled "DNS record A for apps.example.com"; status text in the live region on change.
- Gallery examples: A record idle; checking; ok; mismatch; missing; wildcard pair (A + wildcard A); CNAME for a custom domain.

**PortCheckCard**
- Props: `ports: { port, protocol: "tcp" | "udp", label, status: "checking" | "open" | "blocked" | "unknown" }[]`, `provider: ProviderKey`, `fixes: Record<port, { title, steps: { text, command? }[] }>` (provider-specific), `onRerun`.
- Dimensions: `surface` card, padding 16; rows 40 px: port Mono 13 ("443/tcp"), label 13 `text-secondary`, status at the right (16 px `circle-check` `success` "Reachable" / `circle-x` `danger` "Blocked" / spinner "Checking…" / `help-circle` `text-muted` "Couldn't check"); a blocked row expands (disclosure with `chevron-down`) into the fix card: title 14/500 with the provider mark, numbered steps 13 with CodeBlocks for commands (copy buttons), and "I've done this — check again" secondary Button sm; a header row with "Run port check" secondary Button sm and the last-run `meta`.
- States: all checking; all open; 443 blocked with the Oracle fix expanded (two sections: cloud security list, OS firewall `iptables`/`ufw` commands); 51820/udp unknown ("Couldn't check from here; only needed between servers"); generic provider fix; rerunning.
- Keyboard: disclosures are buttons; commands copyable.
- ARIA: `role="list"`; each row's status in the accessible name; the fix disclosure `aria-expanded`.
- Gallery examples: checking; all open; Oracle 443 blocked expanded; AWS 80 blocked; generic; udp unknown.

### 4.15 The gallery `/dev/components`
- **What:** `apps/web/src/app/dev/components/` with a layout (left nav grouped like C5; search box; theme toggle; density toggle; "Run axe" button that runs `axe-core` on the current page and lists violations inline), a route per component (`[slug]/page.tsx`) rendering its `examples` in a grid, each example wrapped in `<GalleryExample data-gallery-example="<slug>/<example>" data-state="...">` with a caption. A "Tokens" page prints every token with its value and a swatch and the contrast table from §5 computed live from the CSS variables. A "Typography" page and an "Icons" page as in 4.4/4.5. The gallery is excluded from production builds by the guard from Phase 00.
- **Files:** `apps/web/src/app/dev/components/layout.tsx`, `page.tsx`, `[slug]/page.tsx`, `tokens/page.tsx`, `typography/page.tsx`, `icons/page.tsx`, `canvas/page.tsx`, `apps/web/src/app/dev/components/_lib/{registry.ts,gallery-example.tsx,axe-runner.tsx,contrast.ts}`
- **Done when:** every component in `packages/ui/src/components/index.ts` appears in the registry (a test fails otherwise) and every example renders without console errors.

### 4.16 Tests, screenshots, axe
- **What:** Vitest + Testing Library tests per component (rendering, keyboard, ARIA attributes). Playwright `e2e/tests/gallery.spec.ts` iterates the registry (exposed at `/dev/components/registry.json` in dev), visits each component page in the six projects, and takes one `toHaveScreenshot` per `[data-gallery-example]` element (element screenshots, not full page, to keep diffs local); baselines committed under `e2e/__screenshots__/gallery/`; threshold `maxDiffPixelRatio: 0.002` and `threshold: 0.2`. `e2e/tests/gallery-a11y.spec.ts` runs axe per component page in dark and light and fails on any violation of `wcag2a`, `wcag2aa`, `wcag22aa`. A keyboard test tabs through each overlay and asserts focus order.
- **Files:** `packages/ui/src/components/*.test.tsx`, `e2e/tests/gallery.spec.ts`, `e2e/tests/gallery-a11y.spec.ts`, `e2e/tests/gallery-keyboard.spec.ts`, `e2e/__screenshots__/gallery/**`, `apps/web/src/app/dev/components/registry.json/route.ts`
- **Done when:** CI runs all three specs green; the screenshot count equals (examples × 6) and is printed in the job summary.

### 4.17 Records
- **What:** `docs/UI_DECISIONS.md` gets one entry per §5 sub-section confirming or changing each proposed value, with gallery screenshots linked; `docs/DECISIONS.md` gets entries for: Lucide (ISC), the framework icon set and its license, Radix UI (MIT), cmdk (MIT), class-variance-authority (Apache-2.0), clsx (MIT), tailwind-merge (MIT), Motion (MIT), uPlot (MIT), TanStack Table/Virtual (MIT), the "two-tier semantic color" decision, the accent-on-light contrast remediation, the focus-ring policy, the z-index scale.
- **Files:** `docs/UI_DECISIONS.md`, `docs/DECISIONS.md`
- **Done when:** both files have the entries and the reviewer can reconstruct every visual constant from them without opening code.

## 5. Detail checklist

### Typography
Fonts: Geist Sans (UI) and Geist Mono (logs, variables, IDs, code), SIL OFL 1.1, self-hosted via `next/font` from the `geist` package (Phase 00). Fallback stacks: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` and `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`. Rendering: `-webkit-font-smoothing: antialiased` on `html` in dark theme only (light theme keeps default smoothing; thin light-on-dark text benefits from antialiasing, dark-on-light does not), `text-rendering: optimizeLegibility`, `font-feature-settings: "cv11", "ss01"` off by default (Geist's alternates are not used; keep the default forms for recognisability), `font-variant-numeric: tabular-nums` on every element carrying a metric, duration, count, port, IP, timestamp or ID (`.tabular` utility; the `<Text variant="meta">` and every table numeric cell apply it automatically).

Scale (SPEC C4): 12 / 13 / 14 (base) / 16 / 20 / 24 / 32. Weights: 400 / 500 / 600. Line-height 1.5 body, 1.25 headings. Letter-spacing proposal: `-0.01em` at 20 px and 24 px, `-0.02em` at 32 px, `0` at 16 px and below, `+0.04em` for the 11/12 px uppercase eyebrow. Justification: Geist Sans is drawn with generous sidebearings at text sizes; at display sizes the same sidebearings read as loose, and a small negative track restores optical evenness. Below 16 px negative tracking harms legibility, so it is never applied there. Uppercase at small sizes needs positive tracking to remain readable. All values are proposals to be confirmed against the chosen direction in 4.2.

Usage table (size / weight / line-height / letter-spacing / family / color token):

| Element | Size | Weight | LH | LS | Family | Color |
|---|---|---|---|---|---|---|
| Display (wizard finish, hero empty state) | 32 | 600 | 1.25 | -0.02em | Sans | text |
| Page title (h1) | 24 | 600 | 1.25 | -0.01em | Sans | text |
| Section title (h2) | 20 | 600 | 1.25 | -0.01em | Sans | text |
| Card / inspector title (h3) | 16 | 600 | 1.25 | 0 | Sans | text |
| Subsection label (h4, settings groups) | 14 | 600 | 1.5 | 0 | Sans | text |
| Body | 14 | 400 | 1.5 | 0 | Sans | text |
| Body secondary / helper text | 13 | 400 | 1.5 | 0 | Sans | text-secondary |
| Form label | 13 | 500 | 1.5 | 0 | Sans | text |
| Meta (timestamps, counts, "3 min ago") | 12 | 400 | 1.5 | 0 | Sans, tabular | text-secondary |
| Eyebrow (menu group headers) | 11 | 500 | 1.5 | +0.04em, uppercase | Sans | text-secondary |
| Button md | 14 | 500 | 1 | 0 | Sans | per variant |
| Button sm | 13 | 500 | 1 | 0 | Sans | per variant |
| Input / select / combobox | 14 | 400 | 1 | 0 | Sans (Mono when `monospace`) | text; placeholder text-muted |
| Table header | 12 | 500 | 1.5 | 0 | Sans | text-secondary |
| Table cell | 13 | 400 | 1.5 | 0 | Sans (Mono for IDs/hashes) | text |
| Inline code / variable key | 13 | 400 | 1.5 | 0 | Mono | text, bg surface-raised, radius 4, padding 1px 5px |
| Log line | 13 | 400 | 20px | 0 | Mono | text (level-tinted) |
| Kbd | 11 | 500 | 1 | 0 | Mono | text-secondary |
| Status pill / badge | 12 | 500 | 1 | 0 | Sans | per status |
| Tooltip | 12 | 400 | 1.4 | 0 | Sans | text on surface-raised |
| Toast title / body | 14 / 13 | 500 / 400 | 1.5 | 0 | Sans | text / text-secondary |
| Breadcrumb item / current | 13 | 400 / 500 | 1.5 | 0 | Sans | text-secondary / text |
| Rail label (expanded) | 13 | 500 | 1.5 | 0 | Sans | text-secondary; active text |
| Canvas node name / meta / URL | 14 / 12 / 12 | 600 / 400 / 400 | 1.25 / 1.5 / 1.5 | 0 | Sans / Sans / Sans | text / text-secondary / text-secondary |
| Metric value / unit | 20 / 12 | 600 / 400 | 1.25 / 1.5 | -0.01em / 0 | Sans tabular | text / text-secondary |

- [ ] No raw pixel font size appears outside `text.css` (lint rule from 4.4)
- [ ] Headings never exceed 600 weight; 700 is not loaded
- [ ] Mono is never used for prose, only for identifiers, values, paths, commands, logs
- [ ] `font-display: swap` with `size-adjust` fallbacks so text does not reflow when Geist arrives
- [ ] Minimum body size on mobile stays 14 px; inputs on mobile are 16 px to prevent iOS zoom (`.text-input` uses `clamp(16px, ..., 14px)` under 768 px)

### Spacing & layout
- Spacing scale (4 px grid): `--space-1: 4px`, `-2: 8`, `-3: 12`, `-4: 16`, `-5: 20`, `-6: 24`, `-8: 32`, `-12: 48`, `-16: 64`. Tailwind's default numeric spacing is disabled in `@theme` and replaced with these nine values plus `0` and `px`, so `p-7` cannot exist.
- Component paddings (proposals): button md `0 12px`, sm `0 10px`, lg `0 16px`; input `0 10px`; card `16px`; inspector section `20px 24px`; modal `24px`; popover `12px`; menu `4px` with items `0 8px`; toast `12px 16px`; tooltip `4px 8px`; table cell `0 12px`; pill `0 8px`; badge `0 6px`.
- Fixed dimensions (proposals): rail 56 collapsed / 220 pinned, rail item 40 tall with 20 px icon; top bar 48; inspector 480–880 (default 560); canvas node 260×120; volume chip 260×36 attached 8 px below the node with a 2 px connector; group header 28; menu item 32; menu min-width 200; tabs 36 with 2 px underline; table row 40 (dense 32); control heights sm 28 / md 32 / lg 36; switch 32×18 with 14 px thumb; checkbox/radio 16; slider track 4 with 16 px thumb; status dot 8; pill 22; badge 20; avatar 20/24/32; kbd 18; toast 360 wide; modal 400/560/720; palette 640 wide, 480 max-height, 44 px input row, 36 px result rows; empty state max-width 420; icon sizes 14 (inside sm controls and meta), 16 (inside md controls and body), 20 (rail, node header, empty-state secondary), 40 (empty-state hero).
- Page containers: canvas pages full-bleed; list and settings pages `max-width: 1200px` centered with 24 px gutters (16 px under 768 px).
- Radius: `--radius-control: 6px` (inputs, buttons, kbd uses 4), `--radius-card: 10px` (cards, nodes, popovers, menus, toasts), `--radius-panel: 14px` (modals, side panel, sheet), `--radius-full: 9999px` (pills, dots, avatars).
- Elevation: dark theme uses `border: 1px solid var(--color-border)` plus an inner highlight `box-shadow: inset 0 1px 0 rgba(255,255,255,0.03)` on raised surfaces, no drop shadows; light theme uses `--shadow-raised: 0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)` on popovers/menus/modals and `--shadow-card: 0 1px 2px rgba(0,0,0,.04)` on cards.
- Z-index scale: `--z-base: 0`, `--z-sticky: 10` (sticky table headers, section nav), `--z-rail: 20`, `--z-panel: 30` (inspector, staged-changes bar), `--z-popover: 40` (menus, tooltips, comboboxes; tooltips portal last so they sit above sibling popovers), `--z-modal: 50`, `--z-toast: 60`, `--z-palette: 70`. Nothing sets a z-index outside these tokens (lint: `no-restricted-syntax` on `z-[`).
- [ ] Every example in the gallery is checked against a 4 px overlay grid (gallery has a "Show grid" toggle drawing 4 px lines)
- [ ] No component uses margins for external spacing; parents use `gap`
- [ ] Optical alignment: icons next to text are vertically centered on the x-height, not the line box (`translateY(0.5px)` rule documented once in `icon.tsx`)

### Color & theme
Token names and values (SPEC C4 first; light-theme fill-ins and `-text` / `-fill` / `-ink` tiers are proposals derived from the contrast table below):

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-bg` | `#0D0F12` | `#F7F7F5` | App background |
| `--color-bg-canvas` | `#0B0D10` | `#F3F3F0` | Canvas |
| `--color-canvas-dot` | `#1A1E23` | `#DEDDD8` | 24 px dot grid, 1 px dots |
| `--color-surface` | `#14171B` | `#FFFFFF` | Cards, panels |
| `--color-surface-raised` | `#1B1F24` | `#FFFFFF` + `--shadow-raised` | Popovers, menus, modals |
| `--color-surface-hover` | `#20252B` | `#F2F2EF` | Row/card hover |
| `--color-border` | `#262B31` | `#E4E3DF` | Default borders |
| `--color-border-strong` | `#343A42` | `#C9C8C2` | Focused/selected borders |
| `--color-text` | `#E8EAED` | `#16181B` | Primary text |
| `--color-text-secondary` | `#9BA3AD` | `#5B626B` | Labels, meta |
| `--color-text-muted` | `#646C76` | `#7C838C` | Placeholders, disabled only |
| `--color-accent` | `#14B8A6` | `#0D9488` | Focus ring, selected borders, icons, dots (non-text) |
| `--color-accent-hover` | `#2DD4BF` | `#0F766E` | Hover of accent icons/borders |
| `--color-accent-subtle` | `rgba(20,184,166,0.12)` | `rgba(13,148,136,0.10)` | Selected backgrounds |
| `--color-accent-text` | `#14B8A6` | `#0F766E` | Accent-colored text and links |
| `--color-accent-fill` | `#14B8A6` | `#0F766E` | Primary button background |
| `--color-accent-fill-hover` | `#2DD4BF` | `#115E59` | Primary button hover |
| `--color-accent-ink` | `#0D0F12` | `#FFFFFF` | Text on `accent-fill` |
| `--color-success` | `#22C55E` | `#15803D` | Dots, icons, borders (one ramp step darker than first proposed so it holds 3:1 on `surface-hover`) |
| `--color-success-text` | `#22C55E` | `#166534` | Text (one ramp step darker than first proposed so it holds 4.5:1 on `surface-hover`) |
| `--color-warning` | `#F59E0B` | `#B45309` | Dots, icons, limit lines (one step darker: the first proposal was under 3:1 on `bg` and `surface-hover`) |
| `--color-warning-text` | `#F59E0B` | `#92400E` | Text (same reason) |
| `--color-danger` | `#EF4444` | `#DC2626` | Dots, icons, borders |
| `--color-danger-text` | `#F87171` | `#B91C1C` | Text |
| `--color-danger-fill` | `#DC2626` | `#DC2626` | Destructive button background |
| `--color-danger-fill-hover` | `#B91C1C` | `#B91C1C` | Destructive button hover |
| `--color-danger-ink` | `#FFFFFF` | `#FFFFFF` | Text on `danger-fill` |
| `--color-info` | `#3B82F6` | `#2563EB` | Dots, icons |
| `--color-info-text` | `#60A5FA` | `#1D4ED8` | Text |
| `--color-sleeping` | `#64748B` | `#64748B` | Dots, icons |
| `--color-sleeping-text` | `#94A3B8` | `#475569` | Text |
| `--color-overlay` | `rgba(0,0,0,0.55)` | `rgba(22,24,27,0.35)` | Modal backdrop (no blur) |

Rule for the light-theme fill-ins: keep the same hue as the dark token, move lightness until the pair reaches the required ratio on `#FFFFFF` and `#F7F7F5` (4.5:1 for text, 3:1 for non-text), and prefer the nearest step of the Tailwind reference ramp of that hue so the values are recognisable.

Two-tier semantic colors: `--color-<status>` is for non-text UI (dots, icons, borders, chart lines) which WCAG 1.4.11 holds to 3:1; `--color-<status>-text` is for text and is held to 4.5:1. Components never use the base status color for text.

Contrast verification (WCAG relative luminance, computed):

| Pair (dark) | on bg #0D0F12 | on surface #14171B | on raised #1B1F24 | on hover #20252B | Verdict |
|---|---|---|---|---|---|
| text #E8EAED | 15.92 | 14.92 | 13.74 | 12.80 | pass |
| text-secondary #9BA3AD | 7.53 | 7.05 | 6.49 | 6.05 | pass |
| text-muted #646C76 | 3.61 | 3.38 | 3.11 | 2.90 | **fails 4.5:1** — placeholders and disabled only (WCAG 1.4.3 exempts placeholder-like and inactive controls); must never carry information |
| accent #14B8A6 | 7.71 | 7.22 | 6.65 | 6.20 | pass (text and non-text) |
| accent-hover #2DD4BF | 10.31 | 9.66 | 8.90 | 8.29 | pass |
| success #22C55E | 8.42 | 7.89 | 7.27 | 6.77 | pass |
| warning #F59E0B | 8.94 | 8.37 | 7.71 | 7.18 | pass |
| danger #EF4444 | 5.10 | 4.78 | 4.40 | 4.10 | **fails on raised/hover for text** → text uses danger-text #F87171 (6.50 / 5.99 / 5.58) |
| info #3B82F6 | 5.22 | 4.89 | 4.50 | 4.20 | **fails on hover for text** → info-text #60A5FA (6.07 on hover) |
| sleeping #64748B | 4.03 | 3.78 | 3.48 | 3.24 | **fails for text**, passes 3:1 non-text on bg/surface → text uses sleeping-text #94A3B8 (7.01 on surface) |
| accent-ink #0D0F12 on accent-fill #14B8A6 | 7.71 | | | | pass |
| accent-ink on accent-fill-hover #2DD4BF | 10.31 | | | | pass |
| danger-ink #FFFFFF on danger-fill #DC2626 | 4.83 | | | | pass |
| text on accent-subtle over surface (#142A2C) | 12.47 | | | | pass |
| text-secondary on accent-subtle over surface | 5.89 | | | | pass |
| border-strong #343A42 on surface | 1.57 | | | | borders are decorative; selection is also shown by the accent ring |

| Pair (light) | on bg #F7F7F5 | on surface / raised #FFFFFF | on hover #F2F2EF | Verdict |
|---|---|---|---|---|
| text #16181B | 16.58 | 17.79 | 15.76 | pass |
| text-secondary #5B626B | 5.75 | 6.17 | 5.50 | pass |
| text-muted #7C838C | 3.57 | 3.83 | 3.42 | **fails 4.5:1** — placeholders and disabled only |
| accent #0D9488 | 3.49 | 3.74 | 3.33 | **fails 4.5:1 for text**, passes 3:1 for icons/borders/focus ring → text uses accent-text #0F766E (5.10 / 5.47 / 4.88) |
| accent-fill #0F766E with accent-ink #FFFFFF | 5.47 | | | pass; hover #115E59 is darker, higher ratio |
| success #15803D | 4.68 | 5.02 | 4.47 | non-text (the first proposal #16A34A measured 2.94 on hover and was rejected) → success-text #166534 (6.65 / 7.13 / 6.36) |
| warning #B45309 | 4.68 | 5.02 | 4.48 | non-text (the first proposal #D97706 measured 2.97 on bg and 2.84 on hover and was rejected; no ring workaround is needed) → warning-text #92400E (6.61 / 7.09 / 6.32) |
| danger #DC2626 | 4.50 | 4.83 | 4.30 | non-text; danger-text #B91C1C (6.03 / 6.47 / 5.77) for text |
| info #2563EB | 4.82 | 5.17 | 4.61 | pass; info-text #1D4ED8 (6.25 / 6.70 / 5.97) |
| sleeping #64748B | 4.44 | 4.76 | 4.24 | text uses sleeping-text #475569 (7.06 / 7.58 / 6.76) |

(Values recomputed by `packages/ui/src/lib/contrast.test.ts` from the token file; the earlier draft of this table had three light-theme ratios too low and omitted the hover column.)
| danger-ink #FFFFFF on danger-fill #DC2626 | 4.83 | | pass |
| text on accent-subtle over white (#E7F4F3) | 15.78 | | pass |
| text-secondary on accent-subtle over white | 5.47 | | pass |

The SPEC's light `accent` (#0D9488) cannot be used for text at AA; this is a contradiction between C4 and C11, resolved by the `-text` tier above and flagged in §10.

- [ ] The gallery "Tokens" page recomputes this table live from the CSS variables and shows a red cell for any pair below its threshold
- [ ] Theme switch: `data-theme` on `<html>`, `color-scheme` set for native controls, `system` follows the OS live, no flash on load, three-tab sync
- [ ] Only one accent-colored element competes per view (C14): primary button, or selected item, or focus; gallery examples are reviewed for this
- [ ] Charts use `accent` for the primary series, `info` for secondary, `warning` for limit lines, `danger` for OOM markers; never more than four series colors
- [ ] `color-mix()` is not used for tokens (keeps values inspectable); `-subtle` tokens are explicit rgba
- [ ] Every color usage in `packages/ui` and `apps/web` references a token; a lint rule blocks hex literals in TSX and CSS outside `tokens/`

### Motion
- Tokens: `--dur-fast: 120ms` (hover, press, toggle), `--dur-base: 200ms` (panels, modals, popovers, tab underline), `--dur-slow: 300ms` (environment crossfade only), `--ease-out: cubic-bezier(0, 0, 0.2, 1)`, `--ease-panel: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--ease-in: cubic-bezier(0.4, 0, 1, 1)` (exit only).
- Rule: no animation over 300 ms except progress indicators (skeleton shimmer 1.6 s, status pulse 1.6 s, spinner 800 ms, indeterminate progress 1.2 s).
- Springs (Motion library, exported from `tokens/motion.ts`): canvas node programmatic moves and auto-layout `{ type: "spring", stiffness: 500, damping: 40, mass: 1, restDelta: 0.5 }` (settles in about 250 ms without visible overshoot); side panel resize snap `{ stiffness: 700, damping: 50 }`; toast enter `{ stiffness: 600, damping: 45 }`.
- Enter/exit choreography: popovers and menus scale from 0.96 → 1 with opacity 0 → 1 over `--dur-base` `--ease-panel`, origin at the trigger side; modals fade the overlay over `--dur-base` and scale the dialog 0.98 → 1; the side panel translates from `+24px` with opacity over `--dur-base`; the sheet translates from 100 %; toasts translate from `+8px` with the spring; tab underline slides between tabs over `--dur-base`; exits are 80 ms faster than enters and use `--ease-in`.
- Pulsing status dot: `@keyframes lumen-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }` at 1.6 s ease-in-out infinite, applied to building/deploying dots only; the pill's text never animates.
- Reduced motion (`prefers-reduced-motion: reduce`, and the account preference from C7.21 which sets `data-reduced-motion="true"` on `<html>`): all transitions become 0 ms except opacity fades capped at 80 ms; springs become instant; the status pulse stops and the building icon shows the static half-filled glyph; skeleton shimmer becomes a static two-tone block; the environment crossfade becomes a cut; the canvas fit/zoom animations become instant; the spinner keeps rotating (it conveys ongoing work and is exempt under WCAG 2.3.3 as essential).
- [ ] Every animated property is `opacity` or `transform` only (no layout-triggering properties); verified with a Chrome performance trace on the gallery "Overlays" page
- [ ] Hover transitions apply on `background-color`, `border-color`, `color` at `--dur-fast`
- [ ] `will-change` is only set on the side panel during drag and removed after
- [ ] Focus ring appears instantly (no transition) so keyboard users never wait

### Iconography & symbols
- UI icons: Lucide (ISC). Sizes 14 / 16 / 20; `strokeWidth 1.75` at all sizes (Lucide's default 2 reads heavy next to Geist at 13–14 px); `absoluteStrokeWidth` on so the stroke does not scale with size. The allowlist starts with: `plus`, `search`, `command`, `bell`, `sun`, `moon`, `monitor`, `settings`, `chevron-down`, `chevron-right`, `chevron-left`, `chevrons-up-down`, `check`, `x`, `copy`, `external-link`, `eye`, `eye-off`, `lock`, `unlock`, `rotate-cw`, `play`, `square`, `moon-star`, `alert-triangle`, `alert-circle`, `info`, `circle-check`, `circle-x`, `loader-circle`, `terminal`, `file-text`, `database`, `hard-drive`, `server`, `globe`, `git-branch`, `git-commit-horizontal`, `github`, `box`, `layers`, `layout-grid`, `activity`, `bar-chart-3`, `clock`, `calendar`, `trash-2`, `pencil`, `more-horizontal`, `more-vertical`, `arrow-left`, `arrow-right`, `arrow-up-right`, `refresh-cw`, `download`, `upload`, `link`, `unlink`, `users`, `user`, `key-round`, `shield`, `zap`, `cpu`, `memory-stick`, `network`, `home`, `folder`, `sparkles`, `help-circle`, `keyboard`, `maximize-2`, `minimize-2`, `move`, `grip-vertical`, `filter`, `pause`, `arrow-down-to-line`.
- Status language (C4) mapping, always icon + color + text:

| Status | Lucide icon | Color token (dot/icon) | Text token | Unicode fallback | Motion |
|---|---|---|---|---|---|
| Active | `circle` (filled) | success | success-text | ● | none |
| Building / Deploying | `loader-circle` for the inline icon; dot is half-filled via a CSS half-circle | warning | warning-text | ◐ | dot pulses (1.6 s); icon rotates 800 ms linear |
| Failed | `circle-x` | danger | danger-text | ✕ | none |
| Crashed (restarting) | `rotate-cw` | danger | danger-text | ⟳ | icon rotates only while a restart is in progress |
| Sleeping | `moon-star` | sleeping | sleeping-text | ☾ | none |
| Stopped | `square` (filled) | text-muted for the dot with a 1 px `border-strong` ring | text-secondary | ■ | none |
| Queued | `more-horizontal` | text-muted with ring | text-secondary | … | the three dots do not animate |
| Skipped | `minus` in a circle | text-muted with ring | text-secondary | – | none |
| Cancelled | `circle-slash` | text-muted with ring | text-secondary | ⊘ | none |
| Superseded / Removed | `history` | text-muted with ring | text-secondary | ↺ | none |
| Server online / offline | `circle` filled / `circle-off` | success / danger | | ● / ○ | offline has no pulse |

- Framework and language icons: **Devicon (MIT)** chosen over simple-icons (CC0) because simple-icons has removed several marks Lumen needs (Java, Microsoft Azure) under trademark-holder requests, while Devicon ships all of Node, Python, Go, Rust, Ruby, PHP, Java, .NET, Deno, Bun, plus PostgreSQL, MySQL, Redis, MongoDB, Docker. Only the "plain" monochrome variants are vendored (20 × 20 in a 24 viewBox, normalised with SVGO, `fill="currentColor"`), tinted with the brand color only inside the node header; a `static` site icon is Lucide `file-code`, `unknown` is Lucide `box`.
- Provider marks: the marks of Oracle, Amazon Web Services, Google Cloud, Microsoft Azure, Hetzner and DigitalOcean are trademarks of their owners. Lumen uses them only to identify the user's own provider (nominative use) and only where the provider's published brand guidelines allow unmodified referential use; before vendoring any of them, the implementer reads the current guideline page and records the URL and date in `packages/ui/src/icons/vendor/LICENSES.md`. If a guideline forbids it or is unclear, the monogram tile is used. The monogram tile is the default in the gallery so the screenshots never depend on a trademark decision.
- Product mark: a single geometric mark for Lumen (a 24 × 24 rounded square containing a circle offset toward the top-right, suggesting a light source), drawn in this phase as `packages/ui/src/icons/lumen-mark.tsx` with a monochrome and an accent version; no wordmark lockup yet (Phase 18).
- [ ] Every icon has `aria-hidden="true"` unless it is the only content of a control, in which case the control has `aria-label`
- [ ] Icons never appear without a text label except inside icon-only buttons with tooltips and in the rail
- [ ] Symbols in copy (·, →, ×, ⌘, ⇧, ⏎) come from the `<Kbd>` and `<Text>` helpers, never typed ad hoc, so they render consistently across platforms

### Copy
- [ ] Gallery example copy follows C9: second person, active voice, buttons are verbs ("Deploy", "Add domain", "Connect server"), no "Submit", no "OK", no exclamation marks
- [ ] Empty-state examples use the real product sentences from C7 ("No logs yet. Your app hasn't printed anything since this deploy started.")
- [ ] Error card examples render the real J6 titles from `@lumen/shared`
- [ ] Numbers are human-formatted with a shared `formatBytes`, `formatDuration`, `formatRelativeTime` in `packages/ui/src/lib/format.ts` ("512 MB", "42s", "3 min ago") with unit tests
- [ ] Tooltips are one sentence, no trailing period

### States (empty · loading · error · success · partial)
- [ ] Every component's `.examples.tsx` includes: default, hover (rendered with a `data-hover` forced state for screenshots), focus-visible (forced with `data-focus-visible`), active/pressed, disabled, loading, error/invalid, selected, and any component-specific state (dragging for nodes, paused for the log viewer, resizing for the panel)
- [ ] Skeletons match the final layout of the component they replace (the gallery shows skeleton and loaded side by side for table, canvas node, deployment card, chart)
- [ ] Empty states exist for: combobox (no results), command palette (no matches), data table, log viewer, chart (no data in range), key-value editor, avatar stack (0 members)
- [ ] Partial states exist for: canvas node with an offline server (warning ring + tooltip), chart with a gap in data, table with a failed page load (inline retry row)

### Keyboard & accessibility
- [ ] Focus ring: `2px solid var(--color-accent)`, `outline-offset: 2px`, `border-radius: inherit`, on `:focus-visible` only; inputs additionally show `border-color: var(--color-accent)` and `box-shadow: 0 0 0 3px var(--color-accent-subtle)` on `:focus` because a typed-in field always deserves a visible state
- [ ] Radix primitives provide the ARIA patterns: Dialog, Popover, DropdownMenu, ContextMenu, Tooltip, Tabs, Select, Switch, Checkbox, RadioGroup, ToggleGroup, Slider; `cmdk` provides the combobox/listbox pattern for the palette and combobox
- [ ] Canvas node is a `button` inside a `role="group"` labelled by the node name; Tab cycles nodes, Enter opens, arrow keys nudge by 4 px (Shift + arrow by 24 px), `/` focuses search
- [ ] Status changes are announced through a single `aria-live="polite"` region provided by `<LiveRegion>` in `packages/ui` (deploy status, copy confirmations, toast text)
- [ ] Status is never conveyed by color alone (icon + text always present; the pulse is additive)
- [ ] Every chart renders a visually hidden summary: "CPU, last 1 hour: minimum 12 %, maximum 71 %, latest 34 %, limit 100 %"
- [ ] Hit targets are at least 24 × 24 CSS px (WCAG 2.5.8); icon buttons are 28 or 32
- [ ] Tooltips also appear on focus; content is never interactive
- [ ] `aria-sort` on sortable headers; `aria-selected` on selected rows; row actions reachable via a "More" button, not hover only
- [ ] Reduced-motion preference respected as in the Motion section; the account preference overrides the OS
- [ ] axe (`wcag2a`, `wcag2aa`, `wcag22aa`, `best-practice`) is clean on every gallery page in both themes
- [ ] A manual keyboard pass per component group is recorded in `UI_DECISIONS.md` with the date

### Responsive
- [ ] Gallery pages render at 390 / 1024 / 1440 px; components that change shape do so at the C12 breakpoints: side panel → sheet under 768, rail collapses under 1024, table switches to a stacked card list under 640 (`<DataTable responsive="cards">`), tabs scroll horizontally with fade masks, palette becomes full-screen under 640, toasts become full-width bottom under 640
- [ ] No hover-only affordances: every hover-revealed action has a persistent equivalent on touch (row "More" button, node long-press context menu)
- [ ] Touch targets 44 px on mobile for primary actions (buttons `lg` on mobile sheets)

### Performance
- [ ] `@lumen/ui` is tree-shakeable (ESM, `sideEffects: ["*.css"]`); importing `Button` alone adds under 6 kB gzipped to a page (measured with the Next bundle analyzer)
- [ ] The data table, log viewer and canvas node list are virtualised; 5,000 rows / 50,000 log lines / 100 nodes stay at 60 fps in the gallery (traces attached to the closing report)
- [ ] uPlot renders four charts with 3,600 points each (1 h at 1 s) in under 16 ms per frame during crosshair sync
- [ ] Fonts and icons add no network requests beyond Phase 00's two woff2 files; all SVGs are inlined React components
- [ ] No layout shift when skeletons swap to content (skeleton dimensions come from the same tokens)

### Security
- [ ] `SecretField` never puts the secret into the DOM while masked (renders a fixed 8-dot string; the value lives in React state) and clears the clipboard-copied confirmation after 1.5 s
- [ ] `CodeBlock` and `LogViewer` escape all content; ANSI parsing produces spans with classes only, never `dangerouslySetInnerHTML`
- [ ] The gallery is unreachable in production builds (Phase 00 guard verified again here with a production build)

## 6. Acceptance criteria
- [ ] Gallery screenshots exist for every component in both themes (SPEC Phase 1 AC); count equals examples × 6 projects and is printed in CI
- [ ] axe clean on every gallery page in both themes (SPEC Phase 1 AC)
- [ ] `docs/UI_DECISIONS.md` written with the direction choice, six direction screenshots, and every §5 proposal confirmed or replaced (SPEC Phase 1 AC)
- [ ] Every SPEC C5 component exists in `packages/ui` with every state listed in §5 and an `.examples.tsx`
- [ ] Every text pair in the contrast table meets its threshold in the live gallery computation, and the three documented exceptions (`text-muted` both themes, base status colors used only for non-text) are enforced by components
- [ ] Theme switching has no flash at 6× CPU throttle and follows the OS live in `system` mode
- [ ] Reduced motion disables every animation listed in §5 Motion; a Playwright test with `reducedMotion: "reduce"` asserts computed `animation-name: none` on the status dot
- [ ] Keyboard: every overlay traps and restores focus; every control follows its ARIA pattern; the gallery keyboard spec passes
- [ ] Performance: table 5,000 rows, log viewer 50,000 lines, 100 canvas nodes at 60 fps (traces attached)
- [ ] `@lumen/ui` has no hex literal outside `src/tokens/`, no raw font size outside `src/styles/text.css`, no z-index outside the scale (lint rules pass)
- [ ] Every dependency added has a `DECISIONS.md` entry with license
- [ ] Cross-model UI review (H2) done on the gallery screenshots; all "most impactful" findings fixed

## 7. Test plan
- **Unit:** Vitest + Testing Library per component: renders each example without error; keyboard interactions (Enter/Space on buttons, arrows in tabs/menus/radio/segmented, Esc on overlays, typed confirmation gating); ARIA attributes (`aria-busy`, `aria-pressed`, `aria-sort`, `aria-selected`, `aria-live`); `formatBytes`/`formatDuration`/`formatRelativeTime`; `truncateMiddle`; ANSI parser; theme hook (localStorage, media query, storage event); contrast helper against the §5 table values.
- **Integration:** the registry test (every exported component has examples and appears in the gallery); the error card rendering every `@lumen/shared` catalog entry.
- **E2E (Playwright):** `gallery.spec.ts` screenshot matrix; `gallery-a11y.spec.ts` axe; `gallery-keyboard.spec.ts` focus order and traps; `theme.spec.ts` no-flash and system-follow; `reduced-motion.spec.ts`; `side-panel.spec.ts` resize and persistence; `copy-field.spec.ts` clipboard.
- **Visual regression:** element screenshots per example, `maxDiffPixelRatio: 0.002`, `threshold: 0.2`, fonts waited for with `document.fonts.ready`, animations disabled via `animations: "disabled"` except in the explicit "pulsing" examples which capture at a fixed keyframe using `page.clock`.
- **Accessibility (axe + keyboard pass):** axe in CI; manual keyboard pass per group recorded in `UI_DECISIONS.md`.
- **Manual / on a real VM:** none; but the closing report includes a Windows Chrome, Windows Firefox and (if available) macOS Safari check of the focus ring and font rendering because Geist hinting differs per platform.

## 8. Evidence required to close
- Six direction screenshots and the `UI_DECISIONS.md` entry with rubric scores
- The full gallery screenshot set (linked directory) and the CI job summary line with the count
- axe report per gallery page (zero violations), both themes
- Playwright output for theme, reduced-motion, keyboard, side-panel and copy specs
- Chrome performance traces for table, log viewer and canvas at the stated sizes with the fps readout
- Bundle analyzer screenshot for a page importing `Button` only
- The lint run proving no hex literal, raw font size or raw z-index escaped
- `DECISIONS.md` diff with every dependency and license
- The H2 review transcript and the list of fixes made

## 9. Review
Use SPEC H2 (UI review) with Fable 5.1 on the gallery screenshots and the three direction pages; then SPEC H1 on `packages/ui` for the theme script, focus management and virtualisation code. Reviewer should probe: does any component invent a size, color or duration outside the tokens; is the primary button the only strong accent on each example page; do the light-theme `-text` tokens read as the same hue family as the accent; is the status dot understandable with the pulse removed; does the side panel resize feel right at 480 and 880; are hit targets adequate on mobile; do the three directions genuinely differ or are they the same page with three paddings; is the chosen direction described in feelings and goals rather than by comparison to another product.

## 10. Risks & open questions
- **Risk:** Geist Sans at 13 px on Windows ClearType renders lighter than on macOS; secondary text may look weak. → **Mitigation:** check on both; if needed raise `text-secondary` in dark to `#A3ABB5` and recompute the table; record it.
- **Risk:** The SPEC light accent `#0D9488` fails AA for text (3.74:1 on white). → **Mitigation:** the `-text` / `-fill` tiers in §5; recorded as a spec contradiction (C4 vs C11) and resolved in favor of C11.
- **Risk:** Tailwind v4 `@theme` with pass-through variables can double-define tokens. → **Mitigation:** tokens live only in `packages/ui/src/tokens/*.css`; `@theme` references them with `var()` and a test greps for duplicates.
- **Risk:** Element screenshots across Windows (dev) and Linux (CI) differ in font rasterisation. → **Mitigation:** baselines are generated in CI's container only (`pnpm test:visual:update` runs through Docker with the Playwright image); local runs compare against CI baselines with the same image.
- **Risk:** uPlot's API is low-level and the synced crosshair takes longer than planned. → **Mitigation:** the chart component ships with line/area, limit line and markers first; sync is a separate step and may slip to Phase 08 if the rest of the phase is green (record in `PROGRESS.md` "Known gaps").
- **Open question:** Should the accent hue move away from teal toward a different family to feel closer to other tools the user likes? Default: keep SPEC C4 teal. Owner: the user. Because every color is a token, the swap is a change to `colors.css` plus a re-run of the contrast table and screenshots; estimated at one session.
- **Open question:** Dense mode as a global preference (C7.21 "density") versus per-table. Default: global preference with `data-density="compact"` on `<html>` that the table, list rows and menu items read. Owner: Phase 15 (account preferences) confirms.
- **Open question:** Devicon's colored variants for framework icons inside node headers, or monochrome everywhere. Default: monochrome tinted with the brand color at 20 px inside node headers only; monochrome `text-secondary` everywhere else.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps, with the fps and bundle baselines)
- [ ] `docs/DECISIONS.md` entries added for every choice made
- [ ] `docs/UI_DECISIONS.md` updated with screenshots and the confirmed-numbers table
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 01 — Design direction and design system</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/UI_DECISIONS.md,
docs/phases/PHASE-01-design-system.md (especially §5, which holds every number),
and these SPEC sections: C1–C5, C8, C9, C10, C11, C12, C13, C14, C15 steps 1–2, H2, B14.
Phase 00 is done: Tailwind v4, Geist self-hosted, /dev/components stub, Playwright projects
desktop/tablet/mobile × dark/light exist.
The structural parity target is a project canvas + right-side inspector + staged-changes bar +
⌘K palette + environment switcher. The visual identity is Lumen's own from SPEC C4; never
reference another product's look, copy, names or assets.
</context>
<goal>
/dev/components shows every SPEC C5 component in every state, in both themes, axe-clean,
keyboard-operable, locked by Playwright element screenshots, built only from the tokens in
packages/ui, with the chosen visual direction recorded in docs/UI_DECISIONS.md.
</goal>
<scope>
- Three static direction pages (docs/design/directions/{a-instrument,b-studio,c-console}.html),
  a decision with rubric scores and six screenshots in UI_DECISIONS.md
- packages/ui tokens (colors incl. -text/-fill/-ink tiers, typography, spacing, radius,
  elevation, z-index, motion), Tailwind @theme mapping, theme script + hook + provider
- Typography utilities and the usage table; format helpers; truncation helpers
- Icons: Lucide allowlist wrapper (14/16/20, stroke 1.75), status icon set with Unicode
  fallback, Devicon monochrome framework/database icons, provider mark tiles, Lumen mark
- Every C5 component with every state, .examples.tsx, tests
- Gallery: nav, theme + density + grid toggles, Run axe, tokens/typography/icons/canvas pages,
  registry.json
- Playwright screenshot matrix, axe spec, keyboard spec, theme/reduced-motion/panel/copy specs
- DECISIONS.md (every dependency + license) and UI_DECISIONS.md (every confirmed number)
</scope>
<out_of_scope>
- Any API, TanStack Query, WebSocket, real data (Phase 04/05)
- App shell routing and React Flow wiring beyond a static gallery instance (Phase 05)
- Log filter parser and log data pipeline (Phase 08); xterm terminal (Phase 14)
- Marketing site, wordmark lockup (Phase 18)
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-01-design-system.md §6. Non-negotiable: screenshots for every
component × both themes with the count printed in CI; axe clean on every gallery page;
UI_DECISIONS.md written; contrast table passes live; no flash on theme load; reduced motion
honored; overlays trap and restore focus; 60 fps at the stated sizes; no hex/font-size/z-index
literal outside the token files; every dependency's license recorded.
</acceptance_criteria>
<process>
1. Write a plan: the three directions (how each differs), the token file layout, the component
   order, dependency versions verified with licenses, risks, test plan, open questions.
   STOP and wait for approval.
2. Build the three direction pages first; STOP and present the six screenshots for a decision.
3. Then implement tokens → typography → icons → components in the §4 order, one group per
   session; run Vitest and the gallery screenshots after each group; commit after every green step.
4. For every group: screenshots at 390/1024/1440 × dark/light × every state; critique against
   SPEC C14 and this document's §5; fix before reporting.
5. Report: what works (with evidence: screenshot directory, axe output, traces), what doesn't,
   deviations from spec, next steps.
6. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
