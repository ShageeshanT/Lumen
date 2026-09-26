# Decisions

One entry per decision. Newest at the bottom. Format: date · decision · why ·
alternatives rejected. Mark unresolved items **OPEN** with the default that applies
until someone decides.

---

## 0001 · 2026-09-26 · Documentation layout
**Decision:** The spec lives at `docs/SPEC.md` and is the single source of truth.
Each build phase has one document at `docs/phases/PHASE-NN-<slug>.md` following
`docs/phases/_TEMPLATE.md`. Evidence (screenshots, test output) goes under
`docs/evidence/phase-NN/`.
**Why:** SPEC §0.1 asks for this layout; a fixed template keeps every phase
reviewable against the same checklist.
**Rejected:** a single PLAN.md (too long to load per session); issues in GitHub only
(loses the detail checklists the build depends on).

## 0002 · 2026-09-26 · Commit identity
**Decision:** All commits and pushes are authored by the repository owner using the
configured git identity. No AI attribution trailers ("Co-Authored-By", "Generated
with") in commits, pull requests or files.
**Why:** Owner's instruction.
**Rejected:** default tool attribution trailers.

## 0003 · 2026-09-26 · Parity target and visual identity — **OPEN**
**Decision (default):** Railway is the feature and UX parity target: its feature set
and interaction structure are replicated (canvas + inspector, staged changes, ⌘K,
environments, PR environments, templates, observability, CLI, MCP). Visual tokens
stay Lumen's own as defined in SPEC C4 ("calm graphite + aurora teal", Geist Sans /
Geist Mono, Lucide icons).
**Why:** SPEC C2 requires an original visual identity; the owner asked for a replica
of the reference product's UI and features. Structure and features can be replicated
without copying trade dress. Tokens are centralized (Phase 1), so changing the
palette later is a one-file change.
**Open:** confirm whether the accent palette should stay teal or change. Until
decided, SPEC C4 tokens apply.
**Rejected:** copying the reference product's palette, type and brand assets
outright.

## 0004 · 2026-09-26 · Phase order
**Decision:** Phases follow SPEC Part F order 0–18. Backend phases 2–4 (agent,
deploy engine, control plane) come before the first dashboard phase 5.
**Why:** SPEC B2: the dashboard talks only to the public API, so UI pages need real
endpoints and realtime events. Building the UI against a mock layer first would be
built twice. Phase 1 (design system with a live component gallery) still lands the
visual identity early.
**Rejected:** UI-first with a mock API (double work, mock drift); strict
"vertical slice" per feature (breaks the agent/protocol design into fragments that
are expensive to redo).
