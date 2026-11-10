# Implementation Plan: Tolerance bands

**Branch**: `016-tolerance-bands` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-tolerance-bands/spec.md`

## Summary

While a standard is chased, every study on the desk also reads as a **tolerance band**. Each band is the stretch of that lever's travel where every line of the chased standard passes, with every other control held where it stands. It is bracketed by measured positions and names the target that closes each side. A block under the chase line letters the study set in two ways:

- **Passing desk:** the levers ranked by how much of their travel is free.
- **Failing desk:** the single studied lever whose smallest move restores every line, or a plain statement that none can.

Bands add no engine runs of their own; they are read off the studies' points. The one change to what a run carries: today a study sample requests outputs for its own chosen reading only (`jobForStudy` → `sampleContentsFor([quantity])`). From now on every study sample carries the union of what **any** published standard's targets need, resolved against the channels engaged at that desk. That is what lets a band judge demand, peak loads and TM59 criteria off a curve drawn for zone temperature. Because the union covers all standards, switching the chase re-reads the bands without a run, and the chase stays off the shape and the link. The cost of the wider contents is measured before anything is built (G1).

## Technical Context

**Language/Version**: vanilla ES modules (ES2022), no transpiler; Node 22 for harnesses

**Primary Dependencies**: none added. `@idfkit/*` only; the band is inline SVG on the existing study card

**Storage**: none. Bands are derived on every render. The chase (`chased`, module-level in `src/main.js`) stays off the permalink, and studies stay in the link's existing `sty` key

**Testing**: no test runner. Throwaway Node harnesses against `src/tolerance.js` (DOM-free) and the staged WebAssembly engine, then the page is driven. See [quickstart.md](./quickstart.md)

**Target Platform**: static site, the reader's own browser

**Project Type**: single-page client-side application, `src/*.js` plus `index.html`

**Performance Goals**:

- Band arithmetic is at most 21 positions × 11 targets of `meets()` per study per landed point, which is negligible.
- The wider sample contents must cost at most +10 % median per run, at both design-day and annual cadence (G1).
- The live solve is untouched: its own `Output:*` set does not change.

**Constraints**:

- No new hue.
- Pass and fail are stated in words.
- Readable at 390 px.
- Nothing on hover.
- No interpolated edge: a band edge is a bracket between two runs.
- New outputs stay zone- or site-level (Principle VI).

**Scale/Scope**:

- 4 published standards with 13 target lines between them; up to 11 judged at once (TM59).
- Studies are as many as the reader opens.
- 1 new module, `src/tolerance.js`, plus about 6 touch points in `main.js`, 1 in `console.js` and 1 export in `survey.js`.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1. No violations; Complexity Tracking is empty.*

| Principle | How this feature stands against it |
| --- | --- |
| I. Everything runs in the browser | No request, no service. Bands are arithmetic over runs already on the reader's pool. **Pass** |
| II. Deterministic and shareable | Nothing new reaches the IDF the live solve writes, `shapeKey`, or the link. Sample contents widen identically for any desk, independent of the chase, so a sample's identity is still a function of the desk alone. A link that carries the studies (`sty`) reproduces the same bands once the same standard is chased. G4 asserts `encodeState` and `shapeKey` are unchanged across chase toggles. **Pass** |
| III. Read it back off the model | Every judged value is a reading off a completed run of a study sample. The target is the scoreboard's `Target` by reference, and its pass test is `Target.meets`. The reading-to-target match is 012's matcher, exported once (`readingForTarget`), not copied. Not-judged reasons are `targetBlock`'s sentences, the board's own. **Pass** |
| IV. No silent fallbacks | A band edge never interpolates. A refused or failed position closes an edge with its reason and is never a pass or a fail. A target the run cannot read is listed with its reason, never counted. A tie in "nearest" is stated. Every absence (no chase, no study, no line, nothing judged, climate changed) is lettered in view. Four invariants throw at load. **Pass** |
| V. Only `@idfkit/*` at runtime | No dependency added. **Pass** |
| VI. Latency is the interface | No band-only run. The wider contents are zone- and site-level variables and Monthly meters the solve already uses. Their cost is a blocking gate (G1, ≤ +10 %) with a recorded fallback. The block re-renders frame-coalesced. Studies keep their own pool. **Pass, conditional on G1** |
| VII. Mobile-first and responsive | Every band line and the block are text plus a bar, folding with the study card. The caveat's one line stays in view; the method is in a `fold()`. Verified at 390 px. **Pass** |

Workflow gates:

- **Gate 1 to 3** (model verification, idempotence, IDF validation) apply narrowly. The applier is not touched, but study samples now ask `syncReporting` for more. G1 builds those IDFs, runs them under the staged engine, and greps `eplus.err` for "requested but not generated". The `.rdd` names for every added variable are confirmed.
- **Gate 4** (codec round trip) does not apply, since no key is added. G4 proves the link is unchanged.
- **Gate 5:** four load-time invariants (contract §Load-time invariants).
- **Gate 6:** `NOTES` updated for the study and chase steps; `STORE` bumped to `shoebox-general-notes-v8`.
- **Gate 8:** the bracketed band is a new component pattern, recorded in `.interface-design/system.md` in the same change.

## Project Structure

### Documentation (this feature)

```text
specs/016-tolerance-bands/
├── plan.md              # This file
├── research.md          # Phase 0: twelve decisions
├── data-model.md        # Phase 1: Verdict, Edge, Band, RestoringMove, Tolerance
├── quickstart.md        # Phase 1: gates G1–G5 and the driven-page checks
├── contracts/
│   └── tolerance.md     # Phase 1: module surface, load invariants, caller obligations
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── tolerance.js     # NEW, DOM-free: BAND_QUANTITIES, bandQuantities, bandFor,
│                    #   toleranceFor, the classes and the four load invariants
├── survey.js        # + readingForTarget (012's matcher, exported)
├── main.js          # jobForStudy widens contents; renderChase letters the block;
│                    #   the chase click re-draws study cards; attachClimate's reason;
│                    #   reletter thunks for band aria-labels
├── console.js       # setStudy draws study.band on the card's position axis
├── copy.js          # (budgets only, if a new budget id is needed; STANDING is expected to suffice)
└── tour.js          # NOTES for the study and chase steps; STORE → -v8

index.html           # .band / .band-edge / .band-other styles, with [hidden] twins

.interface-design/
└── system.md        # the bracketed band, recorded

docs/design-notes.md # a "Tolerance bands" section: R1's finding and G1's measurement
CLAUDE.md            # one line under "Other subsystems"
```

**Structure Decision**: the existing single-project layout is kept. The arithmetic goes in a new DOM-free module rather than in `survey.js`, because a band is a reading of a **study**, not of a surveyed ground. `survey.js` is already 2,400 lines, and the dependency must run one way (`tolerance.js` → `survey.js`, never back). `main.js` and `console.js` letter and draw; neither decides anything.

## Phase 0: Research

Complete. See [research.md](./research.md). No NEEDS CLARIFICATION remains. The load-bearing decisions:

- **R1. A study's runs do not carry what a band needs today.** Every study sample now carries the union of all published standards' target needs, channel-filtered, so the chase is free to switch and stays off the shape. Gated on a measured cost (G1), with a recorded fallback.
- **R2. One matcher.** Target-to-reading matching is 012's, exported, never copied.
- **R3. Edges are brackets** between landed positions on the study's own grid. Coarse nests in fine, and a nearest-segment tie is stated.
- **R4. "Smallest move"** is a share of the lever's travel, the same argument as the chase's ratio ranking.
- **R6. Not judged** uses the scoreboard's own `targetBlock` sentence.
- **R12. An inert lever is not a free one.** A studied lever that cannot move any judged line is declared inert (from `movedBy` for priced levers, from an exactly flat curve otherwise) and is never drawn as a band from stop to stop.
- **R7. Two surfaces, no new drawing:** the band on each study card, and the block under the chase line.

## Phase 1: Design and Contracts

Complete.

- [data-model.md](./data-model.md): the five frozen classes, their validations, and the event table mapping existing paths to band consequences.
- [contracts/tolerance.md](./contracts/tolerance.md): the module's exports, the four load invariants, and what `main.js` and `console.js` must do.
- [quickstart.md](./quickstart.md): G1 (cost, blocking), G2 (band arithmetic), G3 (agreement with the scoreboard), G4 (nothing leaks), G5 (invariants), then the driven page per user story.

**Constitution re-check after design**: unchanged; all seven pass, with Principle VI conditional on G1. The design adds no dependency, no network path, no link key, no `shapeKey` term and no band-only run. It adds four load-time throws and one drawn pattern recorded in the design system.

## Complexity Tracking

No Constitution Check violations. This table is intentionally empty.
