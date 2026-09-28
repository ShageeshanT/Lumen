# Pending records · Phase 1 H2 cross-model UI review fixes

Written by the H2 worktree (branch `worktree-agent-af32aeb191dbfabcb`).
Merge the entries below into `docs/DECISIONS.md` (renumber `00XX` in order),
`docs/UI_DECISIONS.md` and `docs/PROGRESS.md`, then delete this file.

## 1. What changed, per review item

| # | Item | Status | What changed |
|---|---|---|---|
| 1 | CodeBlock copy hover-only | Done | One-line blocks (no title) keep the copy button visible at 40 % (100 % on hover or focus-within, like table row actions), outside the scroller so it stays at the right edge while the line scrolls under it; the pre reserves 56 px and a 24 px `bg`-token fade sits in front of the button. Multi-line blocks keep the hover/focus reveal. Wrapped blocks drop the fade and top-align the button. Keyboard: the button is a normal tab stop and Ctrl/⌘+C on the focused block still copies. Test in `data.test.tsx`. |
| 2 | "Connect a server" modal truncates the command | Done | The example renders a `CodeBlock` (bash, copy on) with the new `wrap="narrow"` mode (wraps only under 640 px). Button reads "Check connection". |
| 3 | SearchButton reads as the page primary | Done | Ghost variant (text-secondary with the Kbd hint); the environment switcher keeps the only frame in the top bar. |
| 4 | Slider over-limit sentence broken | Done | `limit` is now structured `{ value, server }`; `limitMessage()` builds "oracle-1 only has 18 GB free. Lower it or move to a bigger server." (server as a mono identifier) and "oracle-1 has 12 GB free." Values go through `formatValue` (the demos pass `formatMegabytes`, the MB twin of `formatBytes`: 20480 → "20 GB"); the header shows the current value formatted ("20 GB · 128 MB – 24 GB"); the default formatter appends the unit. Tests in `form.test.tsx`. |
| 5 | Canvas node names truncate at ~10 chars | Done, variant | Node stays 260 wide. `headerHoldsStatus()` (mono metrics make it exact enough) decides whether name + full tag fit the 204 px header; when not, the `[ ■ STATUS ]` tag moves to the meta row and the commit message truncates instead (it has a title tooltip). The name then has the whole header (≥ 204 px, so the 140 px floor holds without an explicit `min-w`, which would have pushed the tag out even for short names). The word stays visible, so no tooltip-only status. Test in `specialized.test.tsx`. |
| 6 | EmptyState tiles are buttons with no action | Done | A tile with `onSelect` or `href` is a framed button/link; without, a frameless, non-focusable row. When any tile is an action the separate `action` renders as ghost. First-project example: three real tile actions + ghost "Empty project"; hero example: plain rows + primary "Connect a server". `onClick` on tiles renamed `onSelect`. Tests in `feedback.test.tsx`. |
| 7 | Palette list overflows, hides footer | Done | Cause: the dialog's 480 px max height ignored the space under its 15 % offset. Now `max-h-[min(480px,calc(85%-16px))]`; the list already was `min-h-0 flex-1 overflow-y-auto` and the footer `shrink-0`. |
| 8 | React Flow attribution | Not changed (not accepted) | The maintainers ask that only Pro subscribers hide it. |
| 9 | Nested modal, two primaries | Done | Contained (gallery) overlays now sit on the modal z-layer, so the nested dialog's overlay covers the first dialog (the viewport version already did). `ConfirmDialog` gains `confirmTone="danger"`; the example's "Discard" uses it and "Keep editing" is the focused default. |
| 10 | Light primary reads as a grey pressed key | Done | New token `--color-primary-bg`: dark keeps the 4 % ink wash, light is paper `#ffffff`, so the full-ink frame and brackets carry it; hover stays accent-subtle + glow. |
| 11 | Tabs fade never appears | Done | The mask was applied but only 24 px, landing on tab padding. Now 40 px, set as both `mask-image` and `-webkit-mask-image`, and the ResizeObserver also watches the tab row so content changes re-measure the edges. |
| 12 | 36 px targets on phones | Done | Under 640 px: full-width buttons, and buttons/links directly in modal, confirm and sheet footers, are 44 px tall (`TOUCH_FOOTER` in `control-styles.ts`); the sheet's keyboard Close button too. Desktop sizes unchanged. |
| 13 | Sheet half: four equal secondaries; title voice | Done | "Redeploy" is the bracketed primary, the rest ghost (left-aligned). `Sheet` gains `eyebrow`; header = mono eyebrow + `section-title` name, as in the side panel, and the eyebrow is part of the accessible name ("Deployment a1b2c3d"). The side panel passes its eyebrow through in sheet mode. |
| 14 | DataTable scrolls sideways on phones | Done | `responsive` now defaults to `"cards"` (opt out with `"scroll"`); cards gained selection checkboxes so selectable tables keep working on phones. |
| 15 | Brackets dropped in 40 px rows | Done | Deployment status cells keep brackets; `StatusTag` hides them on its own only inside a `data-dense` (32 px) table. |
| 16 | Toast body wraps around the action | Done | With a description, Undo/action sit on their own row under the body; copy "The build failed. The first error is in the logs." |
| 17 | Errors without a fix action | Done | Catalog: VALIDATION_FAILED → "Show fields" (`show_invalid_fields`), FORBIDDEN → "View members" (`view_members`), RATE_LIMITED → "Retry" (`retry`) with `availableInS` from `retryAfterS`; ErrorCard shows "Retry in 30s" disabled and counts down. "Retry" kept instead of "Try again" because the voice test's verb list already has it (same label as INTERNAL). Alert "The last backup failed…" gets "Run backup now"; the GitHub toast gets "Retry". API `ErrorAction` schema accepts `availableInS`. |
| 18 | PortCheckCard primary | Done | "I've done this — check again" is the primary; "Run port check" stays secondary. |
| 19 | Avatar tints reuse status hues | Done | Tints: accent, violet glow (`glow-b`), sleeping slate, two neutrals (`surface-hover`/`text`, `surface-raised`/`text-secondary`). Test asserts no status tint. |
| 20 | AvatarStack clipped initials; broken image glyph | Done | `Avatar` gains `maxInitials`; the stack uses one initial. The initials always render; the `<img>` sits on top at opacity 0 until `onLoad` (or already `complete` at hydration) and is removed on error. The wrapper carries `role="img"` and the name. Tests in `components.test.tsx`. |
| 21 | Chart series 1 and 2 near-identical blues | Done | New solid token `--color-violet` (dark `#8b5cf6`, the glow-b hue; light `#7c3aed`), held to 3:1 on every surface by `contrast.test.ts`. Default series order accent → violet → success → warning; fixtures moved from `info` to `violet`. |
| 22 | DiffViewer names break mid-word | Done | `breakAtUnderscores()` inserts `<wbr>` after each "_", and the name cell uses `overflow-wrap: break-word` (not `anywhere`, which shrank the column's min-content). |
| 23 | Locked input looks like a placeholder | Done | `Field` marks `data-locked`; locked controls use `bg` + `text-secondary` at full opacity instead of the 50 % disabled look. |
| 24 | "SEALED" looks like a link | Done | New `SealedValue` (lock + "Sealed", sans secondary) used by the sealed secret field (and so the key-value editor), the variables table and the diff viewer. The blue seen in the screenshots was ClearType fringing on mono caps; the text was already `text-secondary`. |
| 25 | Kbd sheet collision; ⏎ fallback | Done | Rows `gap-3`, label may wrap, keys `shrink-0`; `enter` renders "Enter" on every platform. |
| 26 | Sentence titles in mono caps | Done | Radio cards titles are sans 14/500. |
| 27 | Fine canvas grid invisible | Done, root cause | The 96 px `Background` painted an opaque canvas-colour fill over the 8 px one. It is now `bgColor="transparent"` (the canvas colour comes from `.lumen-canvas`). Grid tokens left unchanged: once visible, the raised values made the dark grid busy. Zoom gate (≥ 60 %) verified. |
| 28 | Broken rail phone evidence | Done, root cause | The rail demo's collapsed 220 px panel (clip-path doesn't clip layout) widened the phone layout viewport to 485 px, so later element screenshots were offset. `RailDemo` now clips (and gives the full demos a 260 px frame). A scan of all gallery pages at 390 px shows no other overflow except the foundation pages `tokens` and `signal` (not in the review; left). |
| 29 | Terminal "RECONNECT" when connected | Done | "Disconnect". |
| 30 | Redundant PRODUCTION badge | Done | Shown only when the production environment's name doesn't already contain "production". |
| 31 | DiffViewer empty copy | Done | "Nothing to review yet. Edit a variable or setting and it shows up here." |
| 32 | Palette no matches | Done | Adds "Try a service name or an action like Deploy." |
| 33 | KeyValueEditor placeholder | Done | "e.g. DATABASE_URL". |
| 34 | Unlabelled rename input; bulk action | Done | Rename modal uses `Field` "Service name" with a helper; the selection demo shows "Copy ID(s)" and "Clear selection" when rows are selected. |
| 35 | Placeholder tab panels | Done | Tab panels (tabs demo, shell, inspector) render real `EmptyState`s per tab (deployments keeps its history list). |
| 36 | 'oracle-1' in straight quotes | Done | `withIdentifiers()` in ErrorCard renders catalog names quoted as `'name'` as mono identifiers without quotes; the catalog stays plain text for the CLI; "Copy for support" keeps the raw title. |
| 37 | Canvas on phones as a list | Not built (by instruction) | Add to PROGRESS.md Known gaps for Phase 5: "Canvas under 640 px should become a list (SPEC C12)". |
| 38 | Slider unit magic number | Done | Padding is `calc(<unit length>ch + var(--space-4))`; the unit renders in mono 12 so `ch` matches. |

## 2. Decision entries (DECISIONS.md format)

## 00XX · 2026-09-27 · 44 px touch targets under 640 px
**Decision:** Below 640 px, full-width buttons and the buttons and links
directly inside dialog, confirm and sheet footers are 44 px tall
(`TOUCH_FOOTER` in `control-styles.ts`, `max-sm:h-[44px]` on `fullWidth`).
Desktop sizes stay 28 / 32 / 36.
**Why:** 36 px footer buttons in phone-only surfaces (sheets, bottom-sheet
dialogs) are below the comfortable touch size; scoping by breakpoint keeps the
dense desktop rhythm.

## 00XX · 2026-09-27 · Primary button fill is a token; paper in light
**Decision:** `--color-primary-bg` fills the primary button: the 4 % ink wash in
dark, `#ffffff` in light. Frame, brackets and hover are unchanged.
**Why:** In light, 4 % ink on the page read as a pressed grey key; paper with a
full-ink frame reads as the one strong element.

## 00XX · 2026-09-27 · Empty-state tiles are actions or rows, never dead buttons
**Decision:** A tile with `onSelect` or `href` is a framed button or link; a
tile without is a frameless, non-focusable row. When the tiles are actions, the
EmptyState's own `action` renders ghost (the "other" way out).
**Why:** Tiles rendered as buttons without handlers were four competing targets
that did nothing.

## 00XX · 2026-09-27 · Canvas node status moves to the meta row when tight
**Decision:** Node width stays 260. If the name and the full `[ ■ STATUS ]` tag
don't both fit the header (estimated from Geist Mono metrics), the tag moves to
the meta row and the commit message truncates instead.
**Why:** Names are the identifier people scan for; the status word must stay
visible (C11), and the commit message already has a tooltip.
**Rejected:** a marker-only tag with the word in a tooltip (hides the word);
the status on the chip row (squeezed the server badge to "ORAC…").

## 00XX · 2026-09-27 · Tables stack into cards on phones by default
**Decision:** `DataTable` `responsive` defaults to `"cards"`; cards support
selection. `"scroll"` remains as an opt-out.
**Why:** A sideways-scrolling table under 640 px gives no sign that columns are
hidden.

## 00XX · 2026-09-27 · One sealed-value form; Enter as a word
**Decision:** `SealedValue` (lock + "Sealed", sans, text-secondary) is the only
rendering of a sealed value (field, table, diff). `Kbd` renders `enter` as
"Enter" on every platform.
**Why:** Mono caps "SEALED" read as a button; ⏎ is missing from Geist Mono and
fell back to a system font. SPEC C13 and Phase 10 write "⇧⏎"; the Kbd keeps the
`enter` key name, only the glyph changes.

## 00XX · 2026-09-27 · Violet as the second chart series
**Decision:** New solid token `--color-violet` (dark `#8b5cf6`, light `#7c3aed`),
checked at 3:1 against every surface. Chart default series colors are accent,
violet, success, warning.
**Why:** Accent blue and info blue were indistinguishable as neighbouring lines.

## 00XX · 2026-09-27 · Error actions can wait: `availableInS`
**Decision:** A catalog `button` action may carry `availableInS`; ErrorCard
disables it and counts down ("Retry in 12s"). RATE_LIMITED sets it from
`retryAfterS`. VALIDATION_FAILED and FORBIDDEN gained "Show fields" and "View
members" (`show_invalid_fields`, `view_members`).
**Why:** C14: every error carries a way forward, and a retry that is certain to
fail should say when it will work.

## 3. UI_DECISIONS rows (changed values)

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

## 4. PROGRESS.md

- Done: H2 cross-model review fixes (items 1–38 above; 8 not accepted, 37 deferred).
- Known gaps: Canvas under 640 px should become a list (SPEC C12) — Phase 5.
  Foundation pages `/dev/components/tokens` and `/signal` overflow a 390 px
  phone (a wide table and the boot demo); not part of the gallery screenshots.
