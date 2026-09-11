# Implementation Plan: The strategy plan

**Branch**: `009-strategy-plan` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-strategy-plan/spec.md`

## Summary

Add to E-02 a component that reads the whole design space at once. For a chosen reading, it draws every sampled design along the two moves that decide that reading. It shows the worlds one door away as islands with measured jumps, screens every control and door for how far and how consistently it pulls, and, for a chosen pair of readings, sorts every control and door into no-regret, trade-off, lever or free, printing that on the control's own strip.

The technical approach rests on one decision (research.md section 2): **every design is a point of one fixed, prefix-extensible Sobol sequence that assigns a value to every sweepable face on the desk, dark or live.** Design *i* in two worlds one door apart is then the same parameters with one key flipped, so a jump is a difference between two runs of one building (FR-010). Entering a world reuses every run its island already made (FR-025). A slider gesture invalidates nothing, and the same link samples the same designs everywhere (FR-008).

The moves are an active subspace fitted on the screening's own elementary effects, so the plan's axes, the screening table and the four kinds all come from one set of runs and cannot disagree. Everything runs through the existing study pool, queue and cache. The queue gains one additive feature, jobs whose points are whole designs, so a plan of a thousand runs holds three jobs rather than a thousand and cannot starve a study.

Neighbours are measured jumps first, islands after (clarified in this session): jumps automatic on every desk, and each island's own reduced-depth plan automatic on a design-day desk and on request, with its cost stated, on an annual one.

## Technical Context

**Language/Version**: Vanilla ES modules, ES2022, no transpilation. 2D canvas and inline SVG for drawing; no WebGL is needed, since FR-019 forbids a relief block.

**Primary Dependencies**: `@idfkit/*` only. No new run-time dependency. Sobol and its scramble, cyclic Jacobi, k-nearest-neighbour regression, a Nadaraya-Watson smoother and a small least-squares fit are written here (research.md section 15).

**Baseline**: `main` at `82d098d`. One prerequisite pull request lands first: the pull's `control.inert?.()` defect (research.md section 3, quickstart gate 0).

**Storage**: None new. One reserved link key, `sp`, carries the reading or readings (contracts/permalink-key.md). The ledger lives in memory for the session and is cleared with the sample cache. `localStorage` is touched only by the general notes' storage key bump.

**Testing**: Throwaway Node harnesses under `specs/009-strategy-plan/verify/`, one engine run per process (quickstart.md). `space.js` and `strategy.js` are DOM-free and engine-free, so the harnesses call the real arithmetic.

**Target Platform**: Static site, browser only, EnergyPlus 26.1.0 as WebAssembly. No infrastructure change.

**Project Type**: Single-project front end: modules under `src/`, styles inline in `index.html`.

**Performance Goals**: A first plan of 128 designs in about 3.2 s and a full home world in about 12.8 s on a design-day desk with a pool of four (SC-001's 5 s and 30 s). The live drag cadence is unchanged within 10 % (SC-002). All 20 neighbours' jumps take about 8 s, and all 20 islands about 88 s, on design days (research.md section 7).

**Constraints**: At most 60 KB of added transfer (SC-015). No new output request: every reading is an existing `Quantity` (FR-014). Every reading and tag must be readable at 390 px without hover (Principle VII). No combined score of two readings anywhere (FR-036).

**Scale/Scope**: At the default desk, 32 varied controls, 20 neighbouring worlds and one world listed as refused. A home world at full depth is 16 screening bases and 512 designs (1,024 runs), an island is 8 bases and 128 designs, and a jump is 32 matched pairs.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Against constitution 1.0.1.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload | **PASS.** Every run is on the existing WASM pool, and every figure is computed on the reader's machine. |
| II. Deterministic and Shareable | Anything changing a result rides the link; refusals are whole | **PASS.** The sample is a pure function of the desk and a frozen sequence, with no seed, clock or machine in it. The readings ride `sp`. `DIMENSION_ORDER` is append-only, so adding a control cannot silently change which designs an old plan link samples. The plan varies parameters and adds none, so every parameter stays a scalar. |
| III. Read It Back Off the Model | Every figure traceable to the document or the run | **PASS.** Every dot is a landed run. A world's live set is read from `Control.shown` and the engaged state `channelState` decides, never from where a control is set. The terrain is declared inference and letters no figure. Moves, screening and kinds share one set of runs. |
| IV. No Silent Fallbacks | Throw, refuse whole, em dash for absent | **PASS.** Failed runs are gaps with reasons. Refused worlds carry the model's own sentence. An unmeasured island's share explained is an em dash with a reason. A terrain with no honest bandwidth is refused, not drawn. Declarations throw at load. |
| V. Only @idfkit/* at Runtime | No new package | **PASS.** All numerics are written here, as the survey did for marching squares and matrices. The Joe and Kuo direction numbers are a data table of about 1 KB, not a dependency. |
| VI. Latency Is the Interface | Live sheet never queues; no costly outputs | **PASS, with a change required.** The plan runs on `studyPool`, never the pump's engine. Expressed as one-point jobs, it would take all but one dispatch in a thousand from any study, so design-list jobs are required: see Complexity Tracking. No output request is added. |
| VII. Mobile-First and Responsive | 390 px, no hover-only, keyboard routes | **PASS, with a cost.** The archipelago becomes a list of island cards below `--index`, and every design is reachable as a list from the keyboard. The strip tags add about 32 tab stops at the default desk, recorded below. |

**Result: PASS.** Three items go to Complexity Tracking, none a violation.

## Constitution Check, re-evaluated after Phase 1

| Principle | Post-design verdict |
| --- | --- |
| I. | **PASS, unchanged.** |
| II. | **PASS.** contracts/permalink-key.md names the `readValue` trap and reads `sp` beside `sv`. `LINK_VERSION` stays `v1`. Quickstart gates 2 and 8, and gate 9 step 4, cover determinism across processes and machines. |
| III. | **PASS, strengthened.** `Jump` is constructed from pairs, never from two lists, so an unmatched jump cannot be built (SC-007). `Terrain` re-runs its own audit in the constructor and has no accessor that returns a reading. |
| IV. | **PASS, strengthened.** `Landed`, `Neighbour`, `SweetSpot` and `Terrain` each carry a value or a reason and throw on both or neither. `StripTag` carries a stamp, so a stale tag is not drawable. |
| V. | **PASS.** |
| VI. | **PASS, with the change now specified.** contracts/scheduler-designs.md keeps the plan to three active jobs, and quickstart gate 4 asserts that a study still dispatches within four turns. A skipped probe is proven byte-identical before it is trusted (gate 3). |
| VII. | **PASS, with the cost itemised.** contracts/console-tags.md makes every tag text built only from declared short forms within a load-asserted budget, so nothing is ever truncated, and nothing is carried by colour. |

**Result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/009-strategy-plan/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output: module contracts
│   ├── space-module.md
│   ├── strategy-module.md
│   ├── scheduler-designs.md
│   ├── permalink-key.md
│   └── console-tags.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output, NOT created here
```

### Source Code (repository root)

```text
src/
├── space.js          NEW  roles, doors, worlds, neighbours, the Sobol sequence, matched pairs, probes. DOM-free, engine-free.
├── strategy.js       NEW  ledger, screening, moves, share explained, terrain, jumps, kinds, sweet spots, tags; FREE, SHORT, DESIGN_STAGE. DOM-free, engine-free.
├── strategy-view.js  NEW  the plan drawing (SVG dots over a canvas terrain), the archipelago and its card list, the moves panel. DOM-bound.
├── scheduler.js      EDIT design-list jobs and per-design context (contracts/scheduler-designs.md). Additive.
├── pull.js           EDIT (prerequisite PR) `control.idle` in place of `control.inert?.()`.
├── permalink.js      EDIT the reserved key `sp`, read beside `sv`.
├── console.js        EDIT `setTags`, `.ctl-tag`, `.free`, the tag in the folded index row.
├── copy.js           EDIT a `TAG` budget.
├── main.js           EDIT wire the plan to the scheduler, ledger, commit path (via `restoreTraverse`'s shape for entering a world), repricing, station change and the tags.
├── survey.js         EDIT export `SENSE`'s direction beside `Reading` for `strategy.js`; nothing else.
└── tour.js           EDIT the plan's note; bump to `shoebox-general-notes-v5`.

index.html            EDIT a `section#strategy` inside `section#survey`, beside `#pull`, with its styles and the `[hidden]` twins.
.interface-design/system.md  EDIT the strip tag, the archipelago and the terrain as component patterns.
CHANGELOG.md          EDIT one entry, house voice.
CLAUDE.md             EDIT an architecture section, with the measured jumps (gate 5) and the annual shares explained (gate 7).
specs/009-strategy-plan/verify/  NEW  the harnesses quickstart.md names.
```

**Structure Decision**: Single project, no new directory under `src/`. The two arithmetic modules sit beside `survey.js` and `pull.js` because they are the same kind of thing, and they are split into the design space (`space.js`: what could be run) and what the runs say (`strategy.js`), so that determinism and matching can be checked with no engine at all. `strategy-view.js` is the only new DOM-bound module, which keeps `main.js`, already 10,500 lines, to wiring.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Design-list jobs in `scheduler.js`, with context resolved per design | A plan design moves every varied control at once, and FR-011 requires the plan not to delay a study. As one-point jobs, 1,024 designs would give a study one dispatch in 1,025 under the round-robin. The per-design context is forced by `roomType` being a door: TM59 a and c read an occupied-hour floor that differs between worlds. | One-point jobs were rejected because of that arithmetic. A second pool was rejected for the survey's reason: it doubles peak memory against a 256 MB heap and splits the cache, which forfeits FR-011. |
| A `DesignLedger` beside the scheduler's cache | FR-028 keeps visited worlds for the session, and the cache is FIFO at 400 entries against a home world of 1,024 runs. | Raising `cacheLimit` was rejected: the cache's eviction protects the studies' memory, and one global limit cannot serve two retention rules. The ledger holds only readings, meter bases and failures. Its size is measured, not assumed (quickstart gate 9 step 8). |
| About 32 new tab stops for the strip tags | FR-039 requires a tag to lead to its entry in the moves panel, and FR-046 requires every route to be reachable from the keyboard. | A tag that is text only was rejected because it would have no keyboard route to its reason. The landmark rule's refusal of 200 tab stops was about marks that go nowhere, and a tag has a destination. |
