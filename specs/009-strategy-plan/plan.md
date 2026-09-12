# Implementation Plan: The strategy plan

**Branch**: `009-strategy-plan` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-strategy-plan/spec.md`

## Summary

Add, in a panel of its own on the left of the sheet (amended 2026-09-11), an instrument that reads the whole design space at once. For a chosen reading, it draws every sampled design along the two moves that decide that reading. It shows the worlds one door away as islands with measured jumps, screens every control and door for how far and how consistently it pulls, and, for a chosen pair of readings, sorts every control and door into no-regret, trade-off, lever or free, printing that on the control's own strip.

The technical approach rests on one decision (research.md section 2): **every design is a point of one fixed, prefix-extensible Sobol sequence that assigns a value to every sweepable face on the desk, dark or live.** Design *i* in two worlds one door apart is then the same parameters with one key flipped, so a jump is a difference between two runs of one building (FR-010). Entering a world reuses every run its island already made (FR-025). A slider gesture invalidates nothing, and the same link samples the same designs everywhere (FR-008).

The moves are an active subspace fitted on the screening's own elementary effects, so the plan's axes, the screening table and the four kinds all come from one set of runs and cannot disagree. Everything runs through the existing study pool, queue and cache. The queue gains one additive feature, jobs whose points are whole designs, so a plan of a thousand runs holds three jobs rather than a thousand and cannot starve a study.

Neighbours are measured jumps first, islands after: jumps automatic on a design-day desk, and each island's own reduced-depth plan on request, with its cost stated, on every desk (amended 2026-09-11; see the amendment below).

## Technical Context

**Language/Version**: Vanilla ES modules, ES2022, no transpilation. 2D canvas and inline SVG for drawing; the plan's own terrain needs no WebGL, since FR-019 forbids it a relief block. *Amended by the second 2026-09-11 amendment: FR-019a moves the survey's own relief into this panel, so the existing WebGL2 module `src/relief.js` comes with it and gains a resize path it has never had.*

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

## Amendment 2026-09-11: width, campaign, panel

The five clarifications of 2026-09-11 (spec.md, *Session 2026-09-11*) change four things, each researched in research.md sections 17 to 20 and contracted separately.

| Change | Requirement | Research | Contract |
| --- | --- | --- | --- |
| The study pool runs cores less two, bounded by half the memory, with no fixed cap | FR-011a | section 17 | contracts/pool-width.md |
| Pause, Resume and Cancel on the plan's campaign, touching nothing else | FR-012a | section 18 | contracts/campaign.md |
| The plan in its own panel left of the sheet, beside the console where the window allows | FR-001, FR-046a | section 19 | contracts/planner-panel.md |
| On a design-day desk only the home world and the jumps start on their own; islands on request everywhere | FR-009a | section 20 | contracts/campaign.md |

**Technical context, amended.** One measurement taken for this amendment: building one design's IDF on the main thread costs 0.79 ms (1.5 ms per run with the restore), so a pool 10 wide spends about 30 % of the main thread building at design-day cadence. The widths in research.md section 17 replace "a pool of four" wherever this plan times a run; SC-001's four-core figures stand, because a four-core machine still gets two engines. No new dependency, output request, link key or model object.

**Files, amended.**

```text
src/pool.js           EDIT `poolWidth` replaces `poolLimit`: cores less two, half the memory, no cap, a `why`.
src/scheduler.js      EDIT `holdWhere(pred, held)`; `takeNext` skips held jobs; idle ignores them. Additive.
src/main.js           EDIT the campaign state and its three controls; `openPlanner` and the fold; islands on request everywhere; the width lettered.
src/strategy-view.js  EDIT nothing structural; the drawings already size off their host.
src/tour.js           EDIT the plan's note targets the panel; key to `shoebox-general-notes-v6`.
index.html            EDIT `aside.planner#planner` before the sheet; `--planner`, `--sheet-min`, `--rail`, `--both`; the opener in the ledger and at E-02.
.interface-design/system.md  EDIT the planner panel and its rail as a component pattern; the three-column row.
specs/009-strategy-plan/verify/  NEW `pool-width.mjs`, `scheduler-hold.mjs`.
```

**Constitution Check, re-evaluated for the amendment.**

| Principle | Verdict |
| --- | --- |
| I. Browser only | **PASS.** More engines on the same machine; nothing leaves it. |
| II. Deterministic | **PASS.** The width changes when a run lands, never what it reads, and rides no link; nor do the campaign's state or the panel's. The existing engine-instance caveat in CLAUDE.md (a warm instance's hour count differing by one) is not widened by the pool, and gate 9 step 4 still takes SC-010 across machines. |
| III. Read back | **PASS.** The width is lettered from the `PoolWidth` it was computed as, not restated. |
| IV. No silent fallbacks | **PASS.** An unreported memory is assumed as 4 GB and says so in `why`; Cancel states what was kept and what was not run. |
| V. Dependencies | **PASS.** None. |
| VI. Latency | **PASS, re-measured.** The live sheet keeps its own engine and a core; the gesture pause keeps SC-002; gate 13 step 5 takes SC-002 again at full width. |
| VII. Responsive | **PASS.** `--both` joins `--index` and `--fold` as a flag declared once and read back; below the index threshold the panel is a page under the sheet; the rail keeps the campaign's controls in view. |

**Result: PASS.** Two items join Complexity Tracking.

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
│   ├── console-tags.md
│   ├── pool-width.md        # first 2026-09-11 amendment
│   ├── campaign.md          # first 2026-09-11 amendment
│   ├── planner-panel.md     # first 2026-09-11 amendment, contents half superseded
│   ├── panel-sequence.md    # second 2026-09-11 amendment
│   └── constraints.md       # second 2026-09-11 amendment
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

index.html            EDIT the plan's markup and styles with the `[hidden]` twins; amended 2026-09-11 to an `aside.planner` left of the sheet (contracts/planner-panel.md).
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
| A held flag on jobs in `scheduler.js` (2026-09-11) | FR-012a pauses the plan's campaign and must leave studies running, so the pause is per job, not the queue's global `paused()`. | Cancel and re-queue for Pause was rejected: it loses each job's place and dispatch order and rebuilds every design list on Resume. |
| A third column in the body's flex row (2026-09-11) | FR-001 and FR-046a put the plan in its own panel left of the sheet, able to stand beside the console. | An overlay drawer and one panel at a time were declined in clarification; a grid was rejected for the desk's own reason, that it spreads free space across every track. |
| About 32 new tab stops for the strip tags | FR-039 requires a tag to lead to its entry in the moves panel, and FR-046 requires every route to be reachable from the keyboard. | A tag that is text only was rejected because it would have no keyboard route to its reason. The landmark rule's refusal of 200 tab stops was about marks that go nowhere, and a tag has a destination. |

## Amendment 2026-09-11 (second): the survey in the panel, the numbered sequence, and constraints

The clarification session of 2026-09-11 settled thirteen questions. The amendment above answered four of them, and that work is built. These are the other nine, and they fall into two groups: what the panel is now a panel **of**, and the seventh user story, constraining the design space. Each is researched in research.md sections 21 to 27 and contracted separately.

| Change | Requirement | Research | Contract |
| --- | --- | --- | --- |
| The survey moves whole into the panel; the sheet keeps E-01 alone | FR-001 (revised) | section 21 | contracts/panel-sequence.md |
| One numbered sequence of six parts, no part behind a gate | FR-001a, FR-001b | section 22 | contracts/panel-sequence.md |
| The ground keeps its contours and relief; the difference stated once where they meet | FR-019a | section 21 | contracts/panel-sequence.md |
| The panel grows from its base width to a declared maximum, the sheet's minimum first | FR-046b | section 23 | contracts/panel-sequence.md |
| A constraint narrows what is sampled and run, and rides the link | FR-049 to FR-057 | sections 24 to 26 | contracts/constraints.md |

**Technical context, amended.** Four things change and one does not.

- **WebGL2 enters this feature's scope**, which the Technical Context above denied in good faith: FR-019 forbids the plan's terrain a relief block, and FR-019a keeps the survey's. Since the survey now stands in the panel, `src/relief.js` comes with it. It has never needed a resize path and now does: `resize()` reads `host.clientWidth` and is called only from `paint()` (`src/relief.js:414`, `:440`), there is no `ResizeObserver`, and `relief.repaint` is never called from `src/main.js`. A folded panel is `display: none`, so the host measures zero and the module's own `Math.max(1, ...)` floor would lock in a 1 by 1 canvas that never recovers on a finished survey.
- **A constraint binds in three places in the sampler, not one**, and the third is a determinism hazard rather than a missing feature: `snapped`, `designAt`'s normalisation, and `probesAt`'s step, plus the `VALUES` memo key, which is keyed by design index alone today (`src/space.js:628`).
- **One new reserved link key**, `cn`. `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty.
- **Transfer.** The feature and its first amendment have spent **31,360 bytes** of SC-015's 61,440, so about 30 KB remains for everything here. No asset, font or dependency is added, and no output request.
- **Unchanged:** no new run-time dependency, no new output variable, no new channel, control or model object, and no change to how the model is built.

**Files, amended.**

```text
src/space.js        EDIT `Bound`, `RuledOut`, `Region`, `Region.EMPTY`. The region binds in `snapped`, in
                    `designAt`'s normalisation and in `probesAt`'s step; `region.signature` joins the
                    `VALUES` memo key; `neighboursOf` drops a ruled-out setting before building its world.
src/strategy.js     EDIT `Binding` (FR-057); every figure carries its region through `Region.stateOf`.
src/permalink.js    EDIT the reserved key `cn`, read beside `sv` and `sp`, with its grammar and refusals.
src/relief.js       EDIT `resize()` refuses a zero box and keeps the last good size.
src/console.js      EDIT typed bounds on a control's own face, and the disallowed part drawn as disallowed.
src/main.js         EDIT `panelsMoved` reaches the relief; the constraint summary at the head of part 1; the
                    commit that re-letters at once and queues nothing; `cutFromScreening` scrolls in-panel.
src/tour.js         EDIT the survey step opens the panel; key to `shoebox-general-notes-v7`.
index.html          EDIT `section#survey` moves into `.planner-body` as part 5; the six numbered parts; the
                    four `hidden` gates become parts that say what they wait on; `--planner-max`, `--pair`,
                    `--sheet-min` as a real `min-width`; the container query on `.planner-body`.
.interface-design/system.md  EDIT a constrained face, and a numbered sequence of parts, as component patterns.
specs/009-strategy-plan/verify/  NEW `constraints.mjs`, `recut.mjs`.
```

`src/field.js` is deliberately absent: `quantityField` is reused for a typed bound exactly as the survey's extent boxes reuse it, and the parsing stays in `Ruled.parse` beside the format it undoes.

**Constitution Check, re-evaluated for this amendment.**

| Principle | Verdict |
| --- | --- |
| I. Browser only | **PASS.** A constraint is arithmetic on the reader's own sequence; nothing new leaves the machine. |
| II. Deterministic | **PASS, with the hazard named rather than hoped about.** `cn` rides the link and the region joins the memo key, so the sample stays a pure function of the desk, the region and the frozen sequence. The memo is the one place a constraint could silently hand back a design from outside the region, which is why it is contracted and is gate 14 step 4. |
| III. Read back | **PASS, strengthened.** That a constraint binds is read off the measured designs inside it, so it is always honest to say; what relaxing it would buy is lettered only from completed runs outside it that the ledger already holds, and never extrapolated. `stateOf` puts the region beside every figure measured in it. |
| IV. No silent fallbacks | **PASS.** Four refusals, of which `Bound`'s step test catches what `refuses` deliberately does not; two deliberate keeps (a region excluding the stance, a constraint on a dark control), each stated; and a part with nothing measured stands and says what it waits on instead of vanishing. |
| V. Dependencies | **PASS.** A container query is a platform API, which is the reason to prefer it here. |
| VI. Latency | **PASS, with one thing to watch.** The relief now repaints when a panel moves: one paint per debounced resize, not per frame, and `resize()` refusing a zero box is what keeps a fold from costing one at all. |
| VII. Responsive | **PASS, and this amendment is mostly about it.** Every threshold is declared once and read back; the one query that could not see the panel becomes a container query; the sequence is one column at every width; every part of a constraint gesture works at 390 px with a coarse pointer and from the keyboard. |

**Result: PASS.** Four items join Complexity Tracking.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| A constraint reaching three binding sites in `src/space.js` | FR-049 requires every design generated to lie inside the region, and FR-052 requires an effect lettered per the constrained span. The span therefore reaches the value, its normalisation and the probe step. | Filtering after the fact was rejected in clarification, and would additionally fit the moves to buildings the reader has ruled out, which is the whole thing FR-049 exists to prevent. |
| `region.signature` in the `VALUES` memo key | The memo is keyed by design index alone, so a constraint committed after a design was generated would return the unconstrained value with no symptom anywhere (Principle II). | Clearing the memo on every commit is correct and was rejected as coarser: FR-050 makes widening back free, and a reader who alternates two regions would pay to regenerate every world's values each time, where a signature in the key keeps both memoised. |
| The stylesheet's first container query | The panel's width is not the window's. `.survey-body`'s two columns are flattened by a window query (`index.html:5320`), so in a 436 px panel on a 1,920 px window the ground and the relief would each stand about 200 px wide, which is FR-046b broken by a rule that cannot see its own container. | A script measuring the panel and setting a class was rejected: the layout decision belongs to the stylesheet, and script's job here is only to ask which layout it got. |
| A resize path for `src/relief.js` | Without one, a relief in the panel keeps the backing store it had when it was last drawn, and on a finished survey no further sample ever lands to correct it. | A `ResizeObserver` on the host was rejected: it fires through the fold's own transition and the first box it sees is the zero one, which is exactly the measurement that must not be taken. |

**A gap on the spec side, recorded rather than filled.** FR-001a, FR-001b, FR-019a and FR-046b carry no success criterion of their own, where the constraints work got SC-016 to SC-018. They are covered by the driven gate 16 and by their contract, which is enough to build against, but nothing measurable in the spec will fail if the sequence regresses. Adding one belongs in the spec rather than here.

**Sequencing.** Three chunks, each independently shippable, following the repository's stacked pull request convention: the survey's move with the numbered sequence and the width (the most visible and the one that unblocks the rest), then the relief's resize path with it, then constraints, which is the only chunk that touches the sampler. The first amendment's own gate 13 and gates 9 step 9 and 10 are still outstanding on this branch and are not superseded by any of it.
