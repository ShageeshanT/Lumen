# Phase NN — {Name}

| | |
|---|---|
| **Status** | Not started · In progress · Blocked · Done |
| **Owner model** | {Fable 5.1 · Opus 5.5} → reviewed by {the other one} |
| **Depends on** | Phase … |
| **Unblocks** | Phase … |
| **Spec sections** | SPEC {B3, C4, D2 …} |
| **Estimated sessions** | N focused sessions (one goal per session) |

## 1. Goal
One sentence describing an outcome a user could observe when this phase is done.

## 2. Why this phase exists
The reasoning behind the phase, written so the model can make good calls the plan didn't anticipate (SPEC I1.1: give the why, not just the what).

## 3. Scope
### In scope
- …
### Out of scope
- … (name the phase that owns it)

## 4. Work breakdown
Ordered, small, verifiable steps. Each step names the files it touches and a concrete "done when".

### 4.1 {Step}
- **What:** …
- **Files:** `path/one`, `path/two`
- **Done when:** …

## 5. Detail checklist
The tiny things that make production software feel finished. Only include the sub-sections that apply, but be exhaustive inside each one.

### Typography
### Spacing & layout
### Color & theme
### Motion
### Iconography & symbols
### Copy
### States (empty · loading · error · success · partial)
### Keyboard & accessibility
### Responsive
### Performance
### Security
### Data integrity & idempotency

## 6. Acceptance criteria
Every item is a testable statement. Copy the relevant SPEC Part D items verbatim and add phase-specific ones.

- [ ] …

## 7. Test plan
- **Unit:** …
- **Integration:** …
- **E2E (Playwright):** …
- **Visual regression:** …
- **Accessibility (axe + keyboard pass):** …
- **Manual / on a real VM:** …

## 8. Evidence required to close
What must be attached to the closing report: test output, screenshots (390 / 1024 / 1440 × dark / light × the key states), commands run with their output, timings.

## 9. Review
Which SPEC Part H prompt to use and the specific things the reviewer should probe.

## 10. Risks & open questions
- **Risk:** … → **Mitigation:** …
- **Open question:** … (who decides, and the default if nobody does)

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added for every choice made
- [ ] `docs/UI_DECISIONS.md` updated with screenshots (UI phases)
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase NN — {name}</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-NN-{slug}.md,
and these SPEC sections: {list}.
</context>
<goal>{one sentence}</goal>
<scope>{bullets}</scope>
<out_of_scope>{bullets}</out_of_scope>
<acceptance_criteria>{from §6}</acceptance_criteria>
<process>
1. Write a plan: files to create/change, data/protocol changes, risks, test plan,
   open questions. STOP and wait for approval.
2. Implement in small steps; run code and tests after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × key states; critique against
   SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md.
</process>
```
