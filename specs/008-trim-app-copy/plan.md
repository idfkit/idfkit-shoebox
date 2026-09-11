# Implementation Plan: Trim the App's Copy

**Branch**: `008-trim-app-copy` (working branch `feature/app-copy-verbosity-f963e7`) | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-trim-app-copy/spec.md`

## Summary

The sheet prints every explanation it has, always: about 2,000 words of prose on
the first screen and about 4,500 with the console open. This feature keeps every
reading, verdict, absence and refusal in view and moves the explanation behind
in-place folds attached to what it explains, so a reader sees the building
first and opens the method when they ask for it.

The technical approach has four moves, in dependency order:

1. **One fold, one budget module.** A shared `.fold` pattern on native
   `<details>`, lifted from the scoreboard's `.why-fold`, with one builder and a
   session-only set of open keys so a fold survives the 50 ms redraws. A new
   DOM-free `src/copy.js` declares the word budgets and the one word counter.
2. **Glances on the declarations.** `Channel` gains `line`, seeded for 16 of
   18 channels by moving the blurb's first sentence into it, and the tour's
   `Note` gains `step`; every other long form (`blurb`, control and meter notes,
   `Target.note`, the TM59 qualifications) keeps its text and moves into a fold
   verbatim. The only new copy is the glances and the shortened ledes, so the
   no-new-claims rule holds by construction.
3. **Rewrite what stays in view.** Page ledes, the Chase sentence, the rail's
   sign convention, blocking reasons, the bill lede, the TM59 count row and the
   description (two moves instead of three) are cut to their budgets, and
   duplicated explanations are kept in one place.
4. **Make the budgets bite.** Every declared always-visible string is asserted
   against its budget at module load; runtime-composed text is held to its
   budget by a measurement taken at four desk positions.

The decisions and their alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation. HTML and
CSS in one `index.html`.

**Primary Dependencies**: none new. `@idfkit/*` is untouched by this feature
(Principle V).

**Storage**: none added. Fold state is in memory for the session only. The
general notes keep their `localStorage` key, bumped from
`shoebox-general-notes-v3` to `-v4` because their steps change wording.

**Testing**: no test runner or linter exists. Verification is two throwaway Node
harnesses (the IDF byte-identity harness from spec 007 and a budget-refusal
harness) plus a word-count measurement taken in the page; see
[quickstart.md](./quickstart.md).

**Target Platform**: static site, client-side only, desktop and phone browsers.

**Project Type**: single-page client-side application.

**Performance Goals**: no engine time added. Rebuilding a fold costs one `Set`
lookup; the redraw paths (`renderScore` on every solve, the strips on every
apply) must not measurably slow a 50 ms design-day cadence.

**Constraints**: nothing may reach the IDF or the link (SC-008). No explanation
may move to hover (Principle VII). Readings, verdicts, absences and refusals
stay in view (FR-001, FR-002). The folded index layout keeps its reading and
blocking note outside the strip fold.

**Scale/Scope**: 18 channel lines, 16 lifted from the first sentence of their
current blurb and 2 written new (`shading`, `air`), measured in research D3;
about 90 control notes, 10 target
notes, 7 general notes, 4 qualifications and the meter and readout notes to
move into folds; about a dozen static ledes and runtime sentences to rewrite;
9 budgets; 1 new module.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.1. **Initial check:
PASS with two items needing design attention, both resolved in Phase 1 and
re-checked below.**

| Principle | Verdict | Basis |
| --- | --- | --- |
| I. Everything Runs in the Browser | PASS | No request added. |
| II. Deterministic and Shareable | PASS | No key, default or range changes; `LINK_VERSION` does not move. Fold state stays off the link (FR-007), as the chase pin and the bill pin already do. |
| III. Read It Back Off the Model | PASS, with attention | See "Attention 1". Glances live on the declarations, not in renderers (research D3). |
| IV. No Silent Fallbacks | PASS | Refusals, blocking reasons and absence reasons stay in view and in place (FR-002). Over-budget declarations throw at load. |
| V. Only @idfkit/* at Runtime | PASS | No dependency added. |
| VI. Latency Is the Interface | PASS | No engine cost; fold memory is one `Set`. Runs in flight still leave the sheet standing. |
| VII. Mobile-First and Responsive | PASS, with attention | See "Attention 2". |

**Attention 1: "cite its source in place" (Principle III).** A landmark, rate
or target that makes a claim about the world must cite its source in place.
This feature puts some citations (target notes, the bill's sources) behind a
fold. The fold is attached to the element it cites for and opens where it
stands, which is in place in every sense the principle's rationale uses; it is
the same argument the scoreboard's `.why-fold` already rests on. `CLAUDE.md`
and `.interface-design/system.md` state three texts as "printed in place"
(research D7); both documents are updated in this change to say that an in-view
summary plus an in-place fold meets that wording. No amendment to the
constitution is needed, since no principle forbids a fold.

**Attention 2: the fold at 390 px, and workflow gate 8.** The fold is a visual
pattern. By gate 8 it is started with `/interface-design:init`, recorded in
`.interface-design/system.md` in the same change, and `/speckit-tasks` must
order it before any fold is wired. At 390 px a fold summary must not wrap and
must stay a pointer target of useful size; quickstart step 8 checks both.

**Workflow gate 6 (the general notes are part of done).** The notes change
wording, so `NOTES` is rewritten with a `step` per note and the storage key is
bumped. Completion events are untouched.

**Post-Phase 1 re-check: PASS, no new violations, Complexity Tracking empty.**
The design adds one small module, justified in research D4: four declaring
modules need the same counter, and none should import another for it. Retiring
`.why-fold` into `.fold` removes a pattern rather than adding one.

## Project Structure

### Documentation (this feature)

```text
specs/008-trim-app-copy/
├── plan.md              # This file
├── research.md          # Phase 0: decisions D1 to D11 and rejected alternatives
├── data-model.md        # Phase 1: Budget, glance fields, standing messages, fold, open set
├── quickstart.md        # Phase 1: how to verify
├── contracts/
│   ├── budget.md        # The budget roster and the load-time refusal
│   ├── fold.md          # The fold's DOM, behaviour and CSS
│   └── measure.md       # How visible prose is counted for SC-001 to SC-003
├── checklists/
│   └── requirements.md  # Written by /speckit-specify
└── spec.md              # Authoritative requirements; unchanged by this plan
```

### Source Code (repository root)

There is no `tests/` tree; harnesses are throwaway and live outside the
repository.

```text
src/
├── copy.js        # NEW. Budget, BUDGETS, words(), withinBudget(). DOM-free.
├── controls.js    # CHANGED. Channel.line on all 18 channels; requires.reasons
│                  #   constants for function-valued reasons; load assertions.
├── console.js     # CHANGED. fold() helper and the open set; blurb, control,
│                  #   meter and readout notes render inside folds; strip line
│                  #   renders in view; rail convention shortened.
├── main.js        # CHANGED. Scoreboard target notes folded; why-fold onto
│                  #   fold(); TM59 count row and qualifications folded; finding
│                  #   tail folded; bill lede, status and refusal lines cut to
│                  #   budget; Chase TM59 tail cut.
├── schemes.js     # CHANGED only where an absence or verdict sentence is over
│                  #   budget; Target.note text itself unchanged.
├── tm59.js        # CHANGED. Qualifications summary declared and asserted; the
│                  #   at-least-four assertion kept.
├── tour.js        # CHANGED. Note.step on all 7 notes; body folds; STORE -> v4.
├── describe.js    # CHANGED. MOVES 3 -> 2.
└── (others)       # UNCHANGED. model.js, permalink.js, readings.js and every
                   #   applier are untouched, which SC-008 verifies.

index.html         # CHANGED. .fold replaces .why-fold; page lede, register
                   #   ledes, desk subtitle, presets note, desk-widen and default
                   #   caption rewritten.
.interface-design/
└── system.md      # CHANGED. The fold pattern and the copy budgets as a rule.
CLAUDE.md          # CHANGED. The three "printed in place" passages, and a short
                   #   section on budgets under Conventions.
```

**Structure Decision**: one new module, `src/copy.js`, and otherwise every
change lands where its text already lives. The budget counter needs its own
module because `controls.js`, `schemes.js`, `tour.js` and `tm59.js` all assert
with it (research D4). The fold builder lives in `console.js`, which builds most
folds, and is imported by `main.js`.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

This plan ends after Phase 1 design. It does not create `tasks.md`; the next
`/speckit-tasks` run derives that file from these artifacts.
