# Implementation Plan: Sweep the building's orientation

**Branch**: `feature/upbeat-noether-3q2prt` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-sweep-orientation/spec.md`

## Summary

Let North axis be studied, surveyed and pulled, with a range that wraps at north.

The model needs nothing: the turn is already in the vertices. The sheet refuses the
rose for one reason. `refusesSweep` asks for a `min`, `max` and `step`, and `Bearing`
carries none. Behind that gate, everything assumes a face with two ends: the sample
grid, the card, the lattice walk, the relief, the extent field, the pull's step and the
link's range. So the work is:

1. **Declare the wrap once.** A typed `Wrap` on North axis alone gives it
   `min = 0`, `max = 360` (the period) and `step = 1`. `refusesSweep` stays the one
   rule (FR-003). "Bearing from site" carries no `Wrap` and keeps its refusal (R1).
2. **8 then 16, snapped to whole degrees.** The counts are asked of the control rather
   than read from constants. Nesting is asserted at load. The survey's wrapping axis
   uses the same grid, so every studied orientation is a cache hit for a ground
   (R2, R3).
3. **Close the curve and the ground by rule, not by data.** The card draws a seam
   point at 360 that repeats 0°'s reading. The survey keeps an `nx × ny` lattice and
   walks its cells through `axis.next`, so nothing is counted twice and nothing has a
   cliff at north (R5, R7).
4. **Read the turn back.** Each sample's turn is measured off the south plan wall's
   normal, and a mismatch refuses the position (FR-010, R6).
5. **Version the link.** 360 is narrowed out and `LINK_VERSION` goes to `v2`, with a
   migration that reads a `v1` 360 as 0 (R4).

Planning amended one requirement. FR-015's "one fine step" (22.5°, not whole) becomes
"one twentieth of a turn, 18°, clockwise", the measure the pull applies to every
control (R8).

## Technical Context

**Language/Version**: vanilla ES modules, ES2022, no transpilation.

**Primary Dependencies**: `@idfkit/*` only. No dependency is added (FR-018).

**Storage**: none new. `sty` and `sv` carry North axis under their existing grammar.
The link version moves to `v2`.

**Testing**: no test runner. Node harnesses in the scratchpad, then the page driven, per
[quickstart.md](./quickstart.md).

**Target Platform**: static site, browser only, EnergyPlus 26.1.0 WASM.

**Project Type**: single-project front end, modules under `src/`.

**Performance Goals**: a coarse orientation study costs 8 runs (against 11) and its fine
pass 8 more (against 10) (SC-002). A survey costs `8 × 6`, then `16 × 11`. No new
output variable.

**Constraints**: nothing new reaches the IDF. Every new sentence fits its `copy.js`
budget and is in view at 390 px. No default moves.

**Scale/Scope**: one control, three surfaces, 16 positions. About 30 call sites, all
inventoried in research R2, R5, R7, R8 and R10.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1, against constitution
1.0.1.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload | **PASS.** Runs on the existing pool. |
| II. Deterministic and Shareable | Narrowing a range bumps the link, with a migration. Refusal is whole. | **PASS, by bumping.** The `[0, 360]` value rule is narrowed to `[0, 360)`. `LINK_VERSION` becomes `v2`, `v1` is frozen, and `MIGRATIONS.v1` reads 360 as 0, so a `v1` link carrying 360 opens to the same building and a `v2` one is refused (R4). No default changes. Positions are normalised before identity, so 0 and 360 never mint two cache keys. |
| III. Read It Back Off the Model | Figures traced to the document | **PASS, strengthened.** Each plotted orientation is the turn measured off the sampled document's vertices (`turnOf`) and checked against the asked value (R6). The wrap is declared once, on the control. |
| IV. No Silent Fallbacks | Throw, refuse, em dash | **PASS.** 360 is migrated by a stated step, never wrapped in the decoder. An equal-ended extent, a turn mismatch and a failed position are each refused with a sentence. A gap breaks the closure rather than being bridged. The `Wrap` invariants throw at load. |
| V. Only @idfkit/* at Runtime | No new package | **PASS.** |
| VI. Latency Is the Interface | Live sheet never queues; zone-level outputs | **PASS.** Studies stay on the pool. No new output request. The run counts fall within the linear ones. |
| VII. Mobile-First and Responsive | 390 px, no hover-only | **PASS.** The wrap caption, the extremes line and every refusal are in view. Compass ticks thin to the four cardinals at 390 px. The study offer's label is replayed by `studySweeps`. |

**Result: PASS.** Complexity Tracking is empty.

## Constitution Check, re-evaluated after Phase 1

| Principle | Post-design verdict |
| --- | --- |
| II | **PASS.** The contract keeps `decodeSurvey`'s order of checks. Quickstart gate 2 measures whether a `v1` link at 360 changes IDF bytes rather than assuming it does not, and records the answer. |
| III | **PASS.** The seam point is drawn and never sampled or counted. The lattice holds only measured positions, so every figure on the ground still traces to a run. |
| IV | **PASS.** `describe.js`'s order trap (R11) is fixed in the same change, since a linear `fraction` on North axis would otherwise skip its shortest-way-round wording silently. |
| VII | **PASS.** No new layout threshold. The compass ticks are recorded in `.interface-design/system.md` (workflow gate 8). |

## Project Structure

### Documentation (this feature)

```text
specs/016-sweep-orientation/
├── plan.md                        # This file
├── research.md                    # Phase 0
├── data-model.md                  # Phase 1
├── quickstart.md                  # Phase 1
├── contracts/
│   └── orientation-sweeps.md      # Phase 1: every changed interface, by module
├── checklists/
│   └── requirements.md            # from /speckit-specify
└── tasks.md                       # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── controls.js    EDIT  Wrap; Bearing({ wrap }); refuses on [0, 360); northAxis declares its Wrap
├── study.js       EDIT  studyCounts; samplePoints and sampleOrder on a circle; Wrap load assertions
├── model.js       EDIT  turnOf(facts)
├── scheduler.js   EDIT  point.turn and the turn-mismatch failure
├── console.js     EDIT  buildBearing registers rows, probe, offer and studySweeps; studyCard seam,
│                        compass ticks, wrap caption, extremes line
├── survey.js      EDIT  gridCounts; Axis.closed/cells/next/offset/at; axisFor arcs through north;
│                        every cell walk through next; meshOf aliased column
├── relief.js      EDIT  denominators by cells; compass lettering; "wraps"
├── pull.js        EDIT  clockwise 18° step; PullEntry.wraps
├── permalink.js   EDIT  v2, migration v1; sv extent rule for a wrapping axis
├── describe.js    EDIT  bearing branch before fraction
└── main.js        EDIT  buildSample turn; per-control counts at every call site; axisOffers and the
                         faceless heading; extentField; cursor wrap; amountOn; dense threshold
docs/design-notes.md          EDIT  a new section "A face with no ends"; studies, E-02 and permalink sections
CLAUDE.md                     EDIT  the Controls bullets (Wrap); the permalink line (v2); the E-02 line
CHANGELOG.md                  EDIT  Added: orientation studies, surveys and pull entry. Changed: link v2.
.interface-design/system.md   EDIT  the compass ticks and seam on a study card and a ground
specs/016-sweep-orientation/spec.md  EDIT  FR-015 as amended (R8)
```

**Structure Decision**: no new module. `Wrap` sits in `controls.js` beside `Ruled`,
because the wrap belongs to the declaration and every consumer already imports from
there. `src/tour.js` is not edited, since no step teaches what can be studied
(R12).

## Complexity Tracking

No constitution violations to justify.
