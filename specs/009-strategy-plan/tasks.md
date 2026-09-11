---

description: "Task list for 009-strategy-plan"
---

# Tasks: The strategy plan

**Input**: Design documents from `/specs/009-strategy-plan/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This repository has **no test runner and no linter**. Verification is done by throwaway Node harnesses, and the constitution's Development Workflow makes several of them **mandatory gates** rather than optional tests. The harness tasks below are therefore constitutional gates, not TDD, and each is written after the code it exercises. The exception is T009 (the skip proof), which runs as soon as `probesAt` exists, because a failure there means the screening cannot trust its own zeros.

Harnesses live in `specs/009-strategy-plan/verify/`, one engine run per process, following `specs/006-design-space-survey/verify/README.md` and reusing its `engine.mjs`.

**Organization**: Tasks are grouped by user story so each can be implemented and verified on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1 to US6)
- Every task names its exact file path

## Path Conventions

This is a single project. Modules live under `src/`, styles inline in `index.html`, and harnesses under `specs/009-strategy-plan/verify/`. There is no `tests/` directory and none is created.

**Baseline**: `main` at `82d098d`. T001 lands first as its own pull request, per research.md section 3.

---

## Phase 1: Setup

**Purpose**: The inherited defect fixed, somewhere to verify, and a baseline to measure against.

- [X] T001 Fix `inertReason` in `src/pull.js`. Replace `control.inert?.(snapshot)` with `control.idle(snapshot)` and keep the control's `note` as the reason, so the pull lists a control whose own `needs` fails rather than probing it. Verify on the default desk with Air in the path and `infiltration: 0` that `infConstant`, `infWind` and `infStack` are listed with a reason. Ship it as its own pull request with a *Fixed* entry in `CHANGELOG.md` (quickstart gate 0).
- [X] T002 [P] Create `specs/009-strategy-plan/verify/README.md`. It states that the harnesses are throwaway and run by hand, that they need `npm run predev`, that they reuse `specs/006-design-space-survey/verify/engine.mjs` for one run per process, and it tabulates each file against the gate it serves.
- [X] T003 [P] Record the pre-feature transfer baseline in `specs/009-strategy-plan/verify/baseline-size.txt`. Run `npm run build` on the parent commit and apply `scripts/deploy.mjs`'s brotli settings, excluding `energyplus/`, `schemas/` and `weather/`, in the format of the 006 baseline file (SC-015).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The design space, the sequence, the shared queue's design-list jobs, and the ledger. Every story reads these.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `src/space.js` with the frozen `FaceRole` class and `roleOf(key)`, assigning every key in `ALL_KEYS` exactly one of `varied`, `door` or `held` by the table in research.md section 1. Add a `HOLD_REASONS` table carrying one sentence per held group (Solver and Run, System, Plant and Tariff, the physics patches, the two solution algorithms `solarDist` and `hbAlgorithm`, and the faceless kinds). Throw at load if any key has no role or two roles (FR-003, FR-004, FR-005, SC-011).
- [X] T005 Add the frozen, append-only `DIMENSION_ORDER` to `src/space.js`. Seed it from the current sweepable faces on eligible channels in strip order, give it a `retired` marker for keys that leave the desk, and assert at load that it names every varied key exactly once and nothing else (research.md section 2).
- [X] T006 Implement the Sobol sequence in `src/space.js`, adding no dependency. Embed the Joe and Kuo `new-joe-kuo-6.21201` direction numbers for the first 90 dimensions, add Burley's hash-based nested uniform Owen scramble at a declared constant seed, and export `unit(index, dimension)` as a pure function of its two arguments (research.md section 2).
- [X] T007 Implement the `Door`, `World` and `Neighbour` classes and `doorsOf`, `worldOf` and `neighboursOf` in `src/space.js`, per contracts/space-module.md.
  - `World.live` comes from `Control.shown` and the engaged state `channelState` in `src/model.js` would decide.
  - A door with `implies` is flipped through it.
  - A neighbour whose channel's `requires` fails carries that `requires.reason` verbatim, evaluated with `(params, on, off)` (FR-023, US2 scenario 6).
- [X] T008 Implement `Design`, `designAt(world, index)`, `matched(home, neighbour, index)` and `Probe`/`probesAt(world, base, reading)` in `src/space.js`.
  - `designAt` gives every varied key its snapped sequence value, dark keys included. Values are rounded to the step's decimals, as `src/field.js` rounds them.
  - `matched` throws naming any stray key.
  - `probesAt` uses the pull's step rule, `max(step, round(range / 20 / step) · step)`, and sets `skip` with a reason wherever the control is dark at that base.
- [X] T009 Write and run `specs/009-strategy-plan/verify/skip-proof.mjs` (quickstart gate 3).
  - For every probe `probesAt` skips at the first 16 bases of the reference desk and of the annual evidence desk, assert the probe's IDF is byte-identical to its base's IDF.
  - Assert that three applications of any design are byte-identical and that the live desk is restored byte-exactly.
  - **If a skipped probe changes the IDF, stop and correct the dark predicate before continuing.**
- [X] T010 [P] Write `specs/009-strategy-plan/verify/space-roles.mjs` (quickstart gate 1). Every key has one role; the default desk has 32 varied controls and 20 neighbours, with Blinds listed with its reason; and `DIMENSION_ORDER` matches a frozen copy held in the harness.
- [X] T011 [P] Write `specs/009-strategy-plan/verify/space-designs.mjs` (quickstart gate 2).
  - `designAt` for indices 0 to 511 is byte-identical across two child processes.
  - Every varied value passes `refuses` and lies on its step grid.
  - Every `matched` pair at the default desk differs only in the door and its implications (SC-007, SC-010).
- [X] T012 Extend `makeStudyJob` in `src/scheduler.js` with an optional frozen `designs` array of `{ params, patch, context }`. Require `points` to be the index list when it is present, allow a null `key` with explicit `omits`, and resolve `contextFor` per distinct `entry.context` signature, memoised on the job, leaving the once-per-job path unchanged for every existing caller (contracts/scheduler-designs.md).
- [X] T013 Teach `keyOf`, `buildSample` and `contextFor` in `src/main.js` to read `job.designs[index]` when it is present. Keep the one synchronous overlay-and-restore breath in `buildSample` and the `{ exact, bucket }` identity shape in `sampleIdentity`, so that a plan design and a study sample with equal params and patch share one cache entry (FR-011).
- [X] T014 Write `specs/009-strategy-plan/verify/scheduler-designs.mjs` against a fake pool, covering the five assertions in contracts/scheduler-designs.md (quickstart gate 4).
- [X] T015 Create `src/strategy.js` with `DesignLedger` and `Landed` (data-model.md).
  - `Landed` carries `readings` or `failure`, exactly one of the two.
  - The ledger drops a landing from an older epoch, and it has `reprice(transform)` and `clear()`.
- [X] T016 Wire the ledger in `src/main.js`.
  - Fill it from `onStudyUpdate` for jobs of origin `'strategy'` before any other origin's gate.
  - Clear it beside `studyScheduler.clearAll()` on a station change.
  - Pass it the same transform `repriceStudies` passes the scheduler in `reprice()` (FR-015, FR-047).
  - Add `'strategy'` to every place that enumerates origins by name (`clearAllStudies` and the Set-aside handler).
- [X] T017 [P] Add the `FREE`, `SHORT`, `DESIGN_STAGE`, `MARGIN` and `DEPTH` declarations to `src/strategy.js`, with the values from research.md sections 6, 7, 12 and 13.
  - Every `why` opens with the `CONVENTION` sentence.
  - Assert at load that `FREE` and `SHORT` cover every reading in `READINGS`, that `DESIGN_STAGE` covers every unpriced channel other than Solver and Run, and that every `DEPTH` design count is a power of two (FR-034, FR-037, FR-044).
- [X] T018 [P] Export the `CONVENTION` sentence and each reading's declared `better` direction from `src/survey.js`, so that `src/strategy.js` reads the one declaration rather than a second copy.

**Checkpoint**: Designs can be generated, matched and queued, and whatever lands is kept. Nothing is drawn yet.

---

## Phase 3: User Story 1 - See the whole desk on one sheet (Priority: P1) 🎯 MVP

**Goal**: For one reading, draw the desk's own world as a scatter of measured designs along its two leading moves, each move lettered as a recipe, over an honest terrain, with the share explained lettered. Pressing a dot moves the desk there.

**Independent Test**: Open the plan on any desk with any available reading. Confirm that a scatter of completed runs appears, that both axes are recipes with shares, that the share explained is lettered, and that pressing a dot moves the desk to exactly that design.

- [X] T019 [US1] Implement the home world's queueing in `src/main.js`.
  - Hold one design-list job for designs and one for probes, with probes ordered base-major. Take counts from `DEPTH`: first 4 bases and 128 designs, then 16 and 512.
  - Build `omits` from the world's full varied set, `restShape` against the live desk's shape, and contents from `sampleContentsFor` for the world's snapshot and patch.
  - Enqueue both through `enqueueAll` (FR-009, FR-011, FR-014).
- [X] T020 [US1] Gate plan measurement in `src/main.js` on `autoOn()`, `linkAttachPending` and `stationAttaching`, lettering which it waits on, and pause on gesture through the scheduler's existing `paused` (FR-012). Cancel and re-queue only when a door or held key moves: a varied slider moves the stance mark and invalidates nothing.
- [X] T021 [US1] Implement the elementary effects in `src/strategy.js`: `g[b][j]` per full range from ledger pairs of base and probe. A skipped probe records an exact zero with its reason, and a probe with a failed side records no effect and counts as a gap (research.md section 3).
- [X] T022 [US1] Implement cyclic Jacobi and `movesOf(world, reading, ledger)` in `src/strategy.js` (contracts/strategy-module.md).
  - It returns null below 4 landed bases.
  - Each move is oriented to raise the reading by its correlation over the sample, with the largest weight made positive where that is exactly zero.
  - The `Move` recipe lists up to five controls at 5 % share or more, with `higher` or `lower`, then `others`.
- [X] T023 [US1] Implement `planOf(world, reading, ledger)` in `src/strategy.js`.
  - Project the landed designs.
  - Score the five-fold kNN R² (k = 10, folds by `index mod 5`) in two dimensions and in one, with null and a reason below 50 designs.
  - Set `oneMove`, set `flat` when every reading is equal, and build `coverage` with the survey's own `Coverage` class, counting failures as gaps with their reasons (FR-013, FR-016, FR-017, FR-018).
- [X] T024 [US1] Implement `terrainOf(plan)` in `src/strategy.js`.
  - A Nadaraya-Watson smoother on a 40 × 40 lattice, with a density floor of six designs within one bandwidth.
  - Take the smallest bandwidth on the ladder (0.06, 0.09, 0.13, 0.18, 0.25 of the diagonal) that passes the local-best audit. The `Terrain` constructor re-runs the audit, and returns `refused` when no rung passes (FR-019, SC-003a).
  - Also compute the terrain's own share explained.
- [X] T025 [US1] Implement `sweetSpot` and the limit test in `src/strategy.js`.
  - Fit by least squares on `[1, u_1 … u_d, u_j²]`.
  - Refuse a spot within `MARGIN` of an end and report it as a limit instead.
  - Compute consistency from the screening bases, and the worse end's fitted cost in the reading's units.
  - Fill `Plan.limits` from the best tenth of designs (FR-032a, FR-032b).
- [X] T026 [US1] Add a `section#strategy` to `index.html`, inside `section#survey` and beside `section#pull`. It holds the reading chooser (one or two readings), the plan host with a canvas under an SVG, the recipe lines under each axis, the share-explained line, the coverage line, the terrain's inference statement, the one-move offer, the moves panel host, and the islands host. Add inline styles with every `display`-setting class given its `[hidden]` twin.
- [X] T027 [US1] Create `src/strategy-view.js` with `drawPlan(host, plan, { stance, onPress })`.
  - Dots are SVG circles shaded by graphite ink level of the reading, not by `--cold`/`--warm`.
  - The terrain is painted to canvas as ink levels plus a Lambertian hillshade from the north-west at 45°, with no contour and no relief block (FR-019, FR-022).
  - Axes are lettered as recipes, and the terrain states in place which way is better and that it is inference.
  - The stance is marked with the armed square in `--redline` (FR-021).
- [X] T028 [US1] Draw the one-move view in `src/strategy-view.js` when `plan.oneMove` is set. The reading is plotted against the leading move with a trend of binned medians over ten equal-count bins, marked as an estimate, and the spread about it is lettered as what the other controls decide (FR-018, US1 scenario 5).
- [X] T029 [US1] Implement pressing a dot in `src/main.js`. Move the desk to exactly that design in its world through `restoreTraverse`'s shape: patch first, then `commit` every differing key with the last one `done`. Leave the address bar alone until release, and refuse any position that is not a landed run (FR-020, US1 scenario 4).
- [X] T030 [US1] Offer every reading on the roster in the plan's reading chooser in `src/main.js`, through `surveyReadingOffers` for the world's snapshot and patch. Grey an unavailable reading with its own reason and fix, exactly as the study roster does (FR-002, US1 scenario 8).
- [X] T031 [US1] Letter in `src/main.js` the run kind the plan is measuring at, the measured count against the wanted count for the world, and the estimated time for the full sample at the desk's own cadence. State the annual cost before any annual run is queued (FR-006, FR-009).
- [X] T032 [US1] Write `specs/009-strategy-plan/verify/reference-plan.mjs` (quickstart gate 6, first half).
  - On the reference desk at full depth: the share explained is at least 65 % for the zone's high and at least 50 % for its low, and above the two strongest single controls scored the same way (SC-004).
  - Every dot indexes a completed run (SC-003).
  - The terrain audit is recomputed independently (SC-003a), and the height convention holds for all thirteen readings (SC-003b).
  - **If SC-004 fails at 16 bases, rerun at 32 before touching anything else** (research.md section 7).

**Checkpoint**: US1 is fully functional and is the MVP. A reader can see the whole of their world for any reading and step onto any design in it.

---

## Phase 4: User Story 2 - Jump to another world (Priority: P1)

**Goal**: Show every world one door away as an island with its jump measured on matched designs. Let the reader step into one and have the plan redraw from inside it.

**Independent Test**: On the default desk, confirm every door appears as an island or is listed with its reason; that each jump is taken on matched designs and lettered with its spread; and that pressing into a world moves the desk there and redraws its own live controls, moves and neighbours.

- [X] T033 [US2] Implement `Jump` and `jumpOf(door, reading, pairs, ledger)` in `src/strategy.js`.
  - Construct only from pairs of design ids.
  - Use only pairs where both runs landed, reporting *n of 32 pairs measured*.
  - Compute the median, p10, p90 and majority-sign consistency, and set `same` when every delta is exactly 0 (FR-010, FR-024, US2 scenario 7).
- [X] T034 [US2] Queue the neighbours in `src/main.js` as one design-list job whose entries carry their own world's patch and context.
  - First, 32 matched designs per enterable neighbour, in design-stage order.
  - Then each island's own 8 bases and 128 designs, automatically on a design-day desk.
  - On an annual desk the second tier waits for the reader to ask for that island (clarified 2026-09-10, research.md section 7).
- [X] T035 [US2] Implement the `Island` state and its cost in `src/strategy.js` and `src/main.js`. `depth` is `'jump'` or `'plan'`, and `cost` is `{ runs, seconds }` at the desk's own cadence. Add a *Measure this world* action for annual islands that states the cost before queueing.
- [X] T036 [US2] Draw the archipelago in `src/strategy-view.js`.
  - The home plan stands at the centre, with neighbours on one ring grouped by door in design-stage order at even angles.
  - There is no line, surface or trend between islands.
  - Each door's label and its jump, in the reading's own units, are lettered at the island's edge.
  - One in-place sentence states that positions are schematic (FR-023, FR-026, US2 scenario 11, SC-007a).
- [X] T037 [US2] Draw an island in `src/strategy-view.js` at each depth.
  - At `'jump'`: its matched designs ordered by reading, its jump, the statement that its moves are not yet measured, and an em dash with the reason for its share explained.
  - At `'plan'`: its own moves, terrain and share explained, all from its own world, never from the home world's (FR-017, FR-026).
- [X] T038 [US2] List in `src/strategy-view.js` every refused neighbour with its channel's own sentence, every `same` door as *leads to the same reading*, and the count of worlds one door away against the count measured. Never claim a combination of doors (FR-027, FR-043, US2 scenarios 6, 7 and 9).
- [X] T039 [US2] State in the plan's lede in `src/strategy-view.js` that System, Plant and Tariff are not doors, and why: switching them changes what a reading means or what it costs, not what the building is (US2 scenario 10).
- [X] T040 [US2] Implement stepping into a world in `src/main.js`. Pressing a design on an island moves the desk to that design in that world through the same path as T029. The plan then re-queues from the new world, where every design the ledger already holds is answered without a run, and letters in words which controls came alive and which went dark, from `World.cameAlive` and `World.wentDark` (FR-025, FR-028, US2 scenarios 4 and 5).
- [X] T041 [US2] Keep every visited world across steps in `src/main.js`: a door opened on the desk by the console or the patch bay redraws the plan from the new world, and the ledger keeps everything (FR-028, the edge case *the desk moves while the plan is measuring*).
- [X] T042 [US2] Write `specs/009-strategy-plan/verify/jumps.mjs` (quickstart gate 5).
  - Run 32 matched pairs for each of the 20 neighbours of the reference desk, and print each jump for the zone's high and low.
  - Assert every jump traces to `matched` pairs (SC-007).
  - Assert that entering the layered glazing world names pane count, coating and cavity width as come alive, and U-factor and SHGC as gone dark (SC-006).
  - Record the jumps in `CLAUDE.md`.

**Checkpoint**: US1 and US2 work together. The reader can discover and enter neighbouring worlds.

---

## Phase 5: User Story 3 - Read what pulls, everywhere (Priority: P1)

**Goal**: Report, for every live control and every door, how far it moves the reading anywhere, how consistently, and how that compares with the pull at the stance. Let two entries cut the E-02 ground.

**Independent Test**: With a reading chosen, confirm every live control and door is reported with its effect, consistency and effect at the stance; that every other control is listed with its reason and the counts sum to the whole desk; and that choosing two controls cuts the ground along them.

- [X] T043 [US3] Implement `ScreeningEntry` and `screen(world, reading, ledger, { stance })` in `src/strategy.js`.
  - The effect is μ* per full range in the reading's units, reported with its signed mean and its `{ agree, of }` consistency.
  - `atStance` comes from the pull's own entries scaled per full range.
  - The words are `anywhere`, `only here`, `nowhere` or `reaches nothing`, with the last only when every measured effect is exactly 0. An unmeasured key is marked *Not yet measured*, never 0 (FR-029, FR-030, FR-031).
- [X] T044 [US3] Add door entries to `screen` in `src/strategy.js` from each door's `Jump`: the median |Δ| as the effect and the majority-sign share as the consistency (FR-029, US3 scenario 2).
- [X] T045 [US3] Add the inert entries to `screen` in `src/strategy.js`: every held, dark or priced key with its reason from `HOLD_REASONS`, the world's dark list, or the channel. Assert that entries and reasons together name every key in `ALL_KEYS` (FR-003, US3 scenario 5, SC-011).
- [X] T046 [US3] Draw the screening table in `src/strategy-view.js` beside the pull's table in `section#pull`.
  - Each row gives the effect anywhere, the effect at the stance, the consistency as *n of m points*, and the words.
  - Doors are in their own group. Inert entries are grouped under their channel heading, stated once, by the axis chooser's precedent.
  - The table folds to blocks at the schedule breakpoint, with `data-head` set where each cell is built.
- [X] T047 [US3] Let two numeric screening entries cut the E-02 ground in `src/main.js`, through `axesFrom` in `src/pull.js` and the survey's existing `openSurvey` path, with nothing retyped (FR-032, US3 scenario 6).
- [X] T048 [US3] Name sweet spots and limits in the screening rows in `src/strategy-view.js`.
  - A spot is lettered *≈ value, est.*, with its consistency and how much worse the worse end is.
  - A best value within the margin is lettered as *keeps improving toward <end>*.
  - The island's limits are named where the plan is drawn (FR-032a, FR-032b, US3 scenarios 8 and 9).
- [X] T049 [US3] Check in `src/main.js` that the screening reuses every design the studies, the pull or the survey have already measured, through the shared cache identity, and letter the solve counter's delta beside the screening rather than a claimed count of cache hits (FR-011, US3 scenario 7).

**Checkpoint**: US1 to US3 work. The reader can answer "which two" at full dimension and cut the ground.

---

## Phase 6: User Story 4 - Decide with two readings (Priority: P1)

**Goal**: With two readings chosen, classify every control and door as no-regret, trade-off, lever or free, with its consistency, its exchange and its paying levers, and print the kind on each control's strip.

**Independent Test**: With two readings chosen, confirm every screened control and door carries one of the four kinds with its consistency in the moves panel and on its strip; that every trade-off states its exchange in both units and names a paying lever or says none pays; and that no combined score appears anywhere.

- [X] T050 [US4] Implement `Classification` and `classify(key, pair, source)` in `src/strategy.js` by the table in research.md section 6.
  - Improvements come from each reading's own `better`, and each reading is judged against its own `FREE` threshold.
  - Consistency is the share of bases, or of matched pairs for a door, whose own kind equals the overall kind.
  - There is no field combining the two readings (FR-033, FR-034, FR-036).
- [X] T051 [US4] Implement the exchange and the paying levers in `src/strategy.js`.
  - A trade-off's exchange is lettered as μ1 and μ2 across its range, each in its own units.
  - The levers named are only those on the losing reading whose improvement across their range at least covers the loss, each with what it moves and what it leaves alone.
  - `unpaid` carries the sentence when none pays (FR-035, US4 scenarios 3 and 4).
- [X] T052 [US4] Implement `oneOrTwo` in `src/strategy.js` and use it in `src/strategy-view.js`: where the two readings' leading moves sit within 15°, say that one plan serves both instead of drawing two (the edge case *two readings whose moves point the same way*).
- [X] T053 [US4] Draw the moves panel in `src/strategy-view.js`.
  - Four groups: no-regret, trade-off, lever and free.
  - Within each group, entries are ordered by `DESIGN_STAGE`, and the ordering is marked with the convention prefix.
  - Each entry has an `id` the strip tag can target and carries its kind in words, its consistency, and, for a trade-off, its exchange and levers.
  - Free controls are stated as free for these two readings, not as unimportant.
  - Nothing is carried by colour alone (FR-036, FR-037, US4 scenarios 1, 2, 6 and 7).
- [X] T054 [US4] Implement `StripTag` and `tagsFor(world, pair, classifications, spots)` in `src/strategy.js`. Build every text from `SHORT` forms only, and stamp each tag with `world.signature` plus the pair ids.
- [X] T055 [US4] Add a `TAG` budget of five words to `src/copy.js`, and assert at load in `src/strategy.js` that every combination of kind, reading pair and sweet spot the declarations can produce is within it (edge case *strip tags at 390 px*).
- [X] T056 [US4] Implement `desk.setTags(tags, stamp)` in `src/console.js`, per contracts/console-tags.md.
  - Add a `button.ctl-tag` under a classified control's face beside `.ctl-derived`, in `buildScale` and in the facade and door rows.
  - Append the tag's text to the folded index row through the `setReadings` front-text path.
  - Apply `.free` to free faces, and draw no tag and no `.free` for a missing entry or a stale stamp (FR-038, FR-040, FR-040a).
- [X] T057 [US4] Add `.ctl-tag`, `.ctl-tag[hidden]` and `.free { opacity: 0.62 }` on the face only to `index.html`, keeping the label, value and tag at full ink and the control focusable and draggable.
- [X] T058 [US4] Wire the tags in `src/main.js`.
  - Call `desk.setTags(new Map(), '')` whenever the world or reading pair changes, before the new classification lands.
  - Call `setTags` with the fresh map when it does.
  - Clear it on closing the plan and on a station change.
  - Pressing a tag scrolls to and focuses its moves-panel entry (FR-039, FR-040, FR-047).
- [X] T059 [US4] Classify doors from their jumps in `src/main.js` and `src/strategy.js` once US2's jumps land, so a door carries a kind exactly as a control does (spec *a door is also a move*, US4 scenario 1).
- [X] T060 [US4] Extend `specs/009-strategy-plan/verify/reference-plan.mjs` (quickstart gate 6, second half). With the high and low chosen, SHGC and ground reflectance are levers on the high, U-factor is a trade-off, and east and west glazing are no-regret. The U-factor, SHGC and sill height strips carry the matching tags (SC-005).
- [X] T061 [US4] Write `specs/009-strategy-plan/verify/tag-freshness.mjs`. Drive `tagsFor` and a stamped console model through ten world changes and ten reading changes, and assert every drawn tag matches the current classification and none survives (SC-013).

**Checkpoint**: All four P1 stories work. The plan turns measurements into decisions and puts them where the hand is.

---

## Phase 7: User Story 5 - Send someone the plan (Priority: P2)

**Goal**: A link carries the reading or readings, so the recipient samples the same designs and worlds and reads identical numbers.

**Independent Test**: Open a plan, copy the link, open it in another browser, and confirm the same designs and neighbouring worlds are sampled and every reading agrees exactly.

- [X] T062 [US5] Add `'sp'` to `RESERVED` in `src/permalink.js`, and read it in `decodeState` beside `sv` and `sty`, above `readValue`. Re-serialise what was read, and refuse the whole link for an unknown id, more than two ids, a duplicate, an empty value or a trailing `.` (contracts/permalink-key.md).
- [X] T063 [US5] Write `sp` in `encodeState` in `src/permalink.js` and in `schemeHash` in `src/main.js` only when a plan is open. Carry no measured value, tag, visited world or on-request island (FR-045).
- [X] T064 [US5] Restore a linked plan in `src/main.js` after `linkAttachPending` clears, beside `restoreLinkedSurvey`. Refuse the whole link, with the offer's own reason and fix, when the linked desk cannot offer a named reading (US5 scenario 3).
- [X] T065 [US5] Extend `specs/006-design-space-survey/verify/link-roundtrip.mjs` or add `specs/009-strategy-plan/verify/link-roundtrip.mjs` (quickstart gate 8).
  - Every reading and every ordered pair of distinct readings round-trips.
  - Every refusal class is refused whole.
  - `sv` and `sp` together round-trip.
  - A pre-feature link corpus decodes byte-identically (US5 scenario 4).

**Checkpoint**: Plans are shareable and reproducible.

---

## Phase 8: User Story 6 - Read it with a thumb (Priority: P2)

**Goal**: Every reading the plan carries is readable at 390 px without hovering, and every dot and island can be pressed with a thumb or reached from the keyboard.

**Independent Test**: Drive the whole plan at 390 × 640 with a coarse pointer and no hover, including entering a neighbouring world and reading the strip tags on the folded index.

- [X] T066 [US6] Below the `--index` threshold in `src/strategy-view.js`, lay the archipelago out as a list of island cards in the same order, each with its door, jump, share explained and designs. Read the threshold back from the stylesheet's custom property rather than restating it (FR-046, Principle VII).
- [X] T067 [US6] In `src/strategy-view.js`, choose the nearest design on a coarse-pointer press with one pointer handler, following the survey's `pointerleave`-for-mouse-only rule, and add a `role="status"` readout lettering the design under the pointer or the keyboard cursor in full (US6 scenario 2).
- [X] T068 [US6] Give the plan and the islands keyboard routes in `src/strategy-view.js`: arrow keys walk designs in position order, and a list of islands and a list of designs (the complete record, folded under a static `<details>`) reach everything the drawing does (FR-046, SC-014).
- [X] T069 [US6] Audit forced colours and monochrome in `index.html` and `src/strategy-view.js`. Every design's reading, every world and every kind must be available as text, and neither shading nor island position may be the only carrier (US6 scenario 3).

**Checkpoint**: Every story is readable and operable on a phone.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Evidence before release, the documents that are part of done, and the budget.

- [X] T070 Write and run `specs/009-strategy-plan/verify/annual-plan.mjs` on the annual evidence desk (quickstart gate 7).
  - A sweet spot is named for SHGC on EUI and for plan width and depth, each labelled as an estimate, and none within 0.15 of an end (SC-005a).
  - The share explained for EUI and for hours above 25 °C or one TM59 criterion is recorded in `CLAUDE.md` whatever it is (SC-008).
- [ ] T071 Drive the page in a foreground tab, per quickstart gate 9. Cover the 5 s and 30 s timings, the drag cadence within 10 %, a tariff change with zero new runs, a cross-browser link, stepping into and out of a world with no repeat runs, and the ledger's heap size with every island measured on the reference desk (SC-001, SC-002, SC-009, SC-010).
- [X] T072 [P] Add the plan's step to `NOTES` in `src/tour.js`: its copy, `target` and `focus`, and a `tour?.note(...)` call site in `src/main.js` filed from the genuine event. Extend `TALLY` if the count passes nine, and bump `STORE` to `shoebox-general-notes-v5` (FR-048, constitution gate 6).
- [X] T073 [P] Record three component patterns in `.interface-design/system.md`: *A classification printed where the hand is* (the strip tag, `.free` against `.idle`, and its tab-stop cost), *An archipelago whose distances mean nothing*, and *A terrain that is inference* (ink levels, hillshade, the density floor, and no figures) (FR-048, constitution gate 8).
- [X] T074 [P] Add an architecture section, *The strategy plan*, to `CLAUDE.md`. Cover the one sequence and why matched designs are the same parameters, `DIMENSION_ORDER` being append-only, the design-list jobs and per-design context, the ledger beside the cache, the neighbour budget, and the measured jumps and annual shares from T042 and T070.
- [X] T075 [P] Add one entry to `CHANGELOG.md` under *Added*, in house voice and concise, with no hard wrapping in any release body drawn from it.
- [X] T076 Measure the added transfer against `specs/009-strategy-plan/verify/baseline-size.txt` with the deploy script's brotli settings, and append the after-figures to that file. Assert it is under 61,440 bytes (SC-015).
- [X] T077 Run a copy-budget and em-dash sweep over every always-visible string the feature declares, in `src/strategy.js`, `src/strategy-view.js` and `index.html`, against `src/copy.js`. Keep readings, verdicts, absence reasons and refusals out of any fold.
- [ ] T078 Hand the page to someone who has not seen it, per quickstart gate 9 step 9. Within 3 minutes they should name a no-regret move, a trade-off and its lever, enter one world and say what came alive there, and find the trade-off tagged on its strip (SC-012). Record the outcome in the pull request.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 ships first as its own pull request. T002 and T003 can start immediately.
- **Foundational (Phase 2)**: depends on T001 being merged, since `probesAt` reuses the dark predicates the fix corrects. It blocks every story.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on US1. An island at plan depth is a `Plan`, and stepping in reuses T029's path.
- **US3 (Phase 5)**: depends on US1's elementary effects (T021). Its door entries (T044) depend on US2's `Jump` (T033).
- **US4 (Phase 6)**: depends on US3's screening. Door classification (T059) depends on US2.
- **US5 (Phase 7)**: depends only on US1 and can proceed in parallel with US2 to US4.
- **US6 (Phase 8)**: depends on the views it adapts (US1, US2 and US4).
- **Polish (Phase 9)**: depends on every story it verifies.

### Within Each Story

- `src/space.js` and `src/strategy.js` arithmetic comes before `src/strategy-view.js` drawing, which comes before `src/main.js` wiring.
- The harness gate for a story is written after the code it exercises and must pass before the checkpoint.

### Parallel Opportunities

- Phase 1: T002 and T003.
- Phase 2: T010, T011, T017 and T018 once T008 is done. T012 and T014 are in files no other Phase 2 task touches.
- US1: T024 and T025 (both in `src/strategy.js`, but separate functions with no shared state; mark them serial if one editor holds the file). T027 and T028 after T023.
- US5 can run beside US2, US3 or US4 in its own files (`src/permalink.js`, plus its block in `src/main.js`).
- Phase 9: T072, T073, T074 and T075.

---

## Parallel Example: Phase 2

```bash
# After T008 lands, in separate files:
Task: "Write specs/009-strategy-plan/verify/space-roles.mjs (quickstart gate 1)"
Task: "Write specs/009-strategy-plan/verify/space-designs.mjs (quickstart gate 2)"
Task: "Add FREE, SHORT, DESIGN_STAGE, MARGIN and DEPTH to src/strategy.js"
Task: "Export CONVENTION and each reading's better from src/survey.js"
```

## Parallel Example: Phase 9

```bash
Task: "Add the plan's note to src/tour.js and bump to shoebox-general-notes-v5"
Task: "Record three component patterns in .interface-design/system.md"
Task: "Add The strategy plan section to CLAUDE.md"
Task: "Add one CHANGELOG.md entry under Added"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Merge T001 as its own pull request.
2. Complete Phase 2, and stop if T009's skip proof fails.
3. Complete US1, and stop if T032's SC-004 gate fails at both 16 and 32 bases.
4. **Stop and validate**: the whole of the desk's own world for any reading, with honest shares and terrain, and every dot a building to stand on.

### Incremental Delivery

1. Foundation, then US1 (MVP): one world, fully drawn.
2. Add US2: the archipelago and stepping between worlds.
3. Add US3: the screening that answers "which two".
4. Add US4: the four kinds and the strip tags, which are the "so what".
5. Add US5 and US6: sharing, and the phone.
6. Polish: annual evidence (SC-008) is required before release, not after.

Following the stacked-PR convention, a change requested on an open story's pull request gets its own pull request based on that branch.

---

## Notes

- [P] tasks touch different files and depend on no incomplete task.
- Every harness prints its assertions and exits non-zero on the first failure.
- Timings are taken in a foreground tab only.
- No task adds a run-time dependency, an output request, a channel, a control or a model object.
