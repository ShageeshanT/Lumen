# Design directions (Phase 1, step 1)

Three static pages of the same screen, the project canvas with the service
inspector open on `api`, built from the SPEC C4 tokens and differing on purpose.
Open each file in Chrome straight from disk; the sun icon in the top bar toggles
dark and light. Screenshots at 1440 × 900 in both themes are in `screenshots/`.

| Direction | File | Character | What varies |
|---|---|---|---|
| A · Instrument | `a-instrument.html` | Dense, precise, quiet | 13 px base in lists, hairline borders, accent only on the primary button and focus, Geist Mono for every identifier (service names, URLs, hashes), radius 6 everywhere, 32 px history rows |
| B · Studio | `b-studio.html` | Comfortable, warm | 14 px base, radius 10 on nodes and 14 on the floating inspector, accent tints the selected node and the active deployment card, sans for identifiers with mono reserved for hashes, 24 px gutters, 16 px card padding, 44 px rows |
| C · Console | `c-console.html` | Dark-first, mechanical | Nodes on `surface-raised`, status carried by 8 px dots and left bars instead of pills, secondary text one step lighter, mono for meta rows and the whole inspector header, 36 px rows |

Content is identical in all three: five services (`web`, `api`, `worker`,
`postgres` with its volume, `redis`), the group "Backend", two variable edges,
the inspector on the Deployments tab with the active deployment card and four
history rows (one failed), the collapsed rail, the top bar and the staged-changes
bar reading "2 changes to 1 service".

## How to compare

Score each direction 1–5 against SPEC C14 and the beginner test, then pick one
or combine (say which elements come from which direction). Record the choice in
`docs/UI_DECISIONS.md` with the six screenshots linked.

| Criterion | Question |
|---|---|
| One obvious next action | Is "Redeploy" the first thing a beginner would click, and nothing competes with it? |
| Calm | Is there at most one accent-colored element competing per view? |
| Scan speed | Can you read every node's status and last deploy in one pass without reading the text twice? |
| Hierarchy | Do the page title, node names, meta text and history rows sit at clearly different levels? |
| Density at 1440 | Does the canvas still feel like a map, and the inspector like a list, or is one crowded? |
| Light theme | Does the light theme feel like the same product, not a different app? |
| Identity | Does it read as Lumen's own, described in feelings and goals, not as another tool? |

## Notes

- The inspector is shown at its 480 px minimum width (SPEC C6 allows 480–880) so
  all three canvas columns fit at 1440 px; nodes are 248 px wide for the same reason.
- The pages load Geist from the workspace's `node_modules` with relative paths;
  run `pnpm install` first if the fonts fall back to the system sans.
- Icons are Lucide (ISC), inlined as an SVG sprite.
- Regenerate the screenshots with `node e2e/scripts/direction-screenshots.mjs`.
