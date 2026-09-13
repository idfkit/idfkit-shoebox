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

---

## Phase 10: Convergence

- [X] T079 CRITICAL: Refuse a link whose plan the desk cannot offer whole in `src/main.js`: check the plan before `restoreLinkedStudies` and `restoreLinkedSurvey` restore anything, stop every later restore once `refuseLink` has run, and skip `attachFromLink`'s `updatePermalink()` after a refusal per Constitution II, US5/AC3, FR-045 (contradicts)
- [X] T080 Cancel every `'strategy'` job in `src/main.js` when auto-solve is switched off or a link or station attach begins, and re-queue when the gate lifts, so the plan never says nothing is measured while runs continue per FR-012 (contradicts)
- [X] T081 Letter the offer's `fix` beside its `reason` in the plan-link refusal in `src/main.js`, and throw rather than substitute "no such reading is declared" when no offer is found per contracts/permalink-key.md (partial)
- [X] T082 Clear the strip tags with `desk.setTags(new Map(), '')` in `refreshStrategy`/`queueStrategy` in `src/main.js` as soon as the world signature changes, before the throttled render per FR-040, SC-013 (contradicts)
- [X] T083 Hold the neighbours job in `src/main.js` until the home world's first depth (4 bases, 128 designs) has landed, so the desk's own world is legible first per FR-009 (partial)
- [X] T084 On an annual desk, state the home world's and the jumps' run count and time before `queueStrategy` queues anything, and queue only once the reader acknowledges it, in `src/main.js` per FR-006, T031 (partial)
- [X] T085 Refuse the plan with the offer's own reason and fix when a chosen reading stops being available after opening, and queue no runs for it, in `src/main.js` per FR-002, FR-041 (missing)
- [X] T086 Evaluate `channelState` on the flipped desk in `neighboursOf` in `src/space.js`, refusing with that channel's `requires.reason` when the door's own flip blocks it (the network air model with fewer than two paths) per US2/AC6, contracts/space-module.md (partial)
- [X] T087 Align door deltas by pair id, NaN where a reading has no value, before `rawClassification` in `classifyAll` in `src/strategy.js` per FR-033, T059 (contradicts)
- [X] T088 Extend `auditTerrain` in `src/strategy.js` to refuse an unsupported local worst as well as an unsupported local best per FR-019 (partial)
- [X] T089 Add the static scan for a combined figure of two readings, and the assertion that `Classification` carries no combined field, to a harness in `specs/009-strategy-plan/verify/` per FR-036, contracts/strategy-module.md (missing)
- [X] T090 Print a patch door's tag (Shading, Blinds, Skylights, Daylight, Context) on its channel's strip head and folded row in `src/console.js` and `src/main.js` per FR-038, contracts/console-tags.md (partial)
- [X] T091 Dim each free side of a facade or boundary row, not only rows where every side is free, in `src/console.js` and `index.html` per FR-038, T057 (partial)
- [X] T092 Letter each tag's own text, free ones included and naming both readings, on the folded index row through the `setReadings` front-text path in `src/console.js` per FR-038, contracts/console-tags.md (partial)
- [X] T093 Pass the world's label into `letterDesign`, and letter world and completed-run status in the island design list and the complete record, in `src/main.js` per FR-020 (partial)
- [X] T094 Give the opened island panel the home plan's terrain statement (inference, which way is better, its own share) and both move recipes in `src/main.js` per FR-017, FR-019 (partial)
- [X] T095 Letter failed-run counts and reasons for each island and each jump in `src/main.js` per FR-043, FR-013 (partial)
- [X] T096 Keep both judged readings on a lever tag that carries a sweet spot, within the `TAG` budget, in `tagsFor` in `src/strategy.js` per FR-038 (contradicts)
- [X] T097 Carry a sweet spot for each chosen reading on the strip tag, or state which one rides, in `tagsFor` in `src/strategy.js` per FR-040a (partial)
- [X] T098 Leave the screening base designs out of the held-out share scoring in `planOf` in `src/strategy.js` per FR-017 (partial)
- [X] T099 Orient each move by the sign of the mean gradient along it when `movesOf` is called without designs in `src/strategy.js` per FR-016 (partial)
- [X] T100 Assert in the constructors that `Plan` holds exactly one of `explained2` and `scoreAbsence` with frozen `spots`, have `Jump` compute its deltas from its `MatchedPairs`, and add a frozen `Island` class carrying `neighbour`, `jump`, `plan`, `depth` and `cost`, in `src/strategy.js` and `src/main.js` per Constitution workflow 10, T035 (partial)
- [X] T101 Print `ONE_MOVE.why` where the one-move offer is lettered and `MARGIN.why` where sweet spots are lettered, in `src/main.js` or `src/strategy-view.js` per plan: research sections 5 and 13 (missing)
- [X] T102 Say in the screening's words column that the stance comparison is missing when the pull has not been read for this reading and desk, in `src/strategy-view.js` per FR-030 (partial)
- [X] T103 When every landing is a failure, state that the plan measured nothing and why, instead of the waiting sentence, in `src/main.js` per spec edge case "Every run fails" (partial)
- [X] T104 Key failure reasons by sample identity rather than by job, and drop them when a job is cancelled, in `src/main.js` per FR-013 (partial)
- [X] T105 Letter the solve counter's delta beside the screening table rather than only in the coverage line, in `src/main.js` and `index.html` per T049 (partial)
- [X] T106 Replace `control.inert?.(snapshot)` with `control.idle(snapshot)` in the survey axis chooser in `src/main.js` per plan: research section 3 (partial)
- [X] T107 Return a handle from `drawOneMove` in `src/strategy-view.js` and move its stance line in `syncStrategyStance` in `src/main.js` per FR-021 (partial)
- [X] T108 Count refused worlds in the one-door-away total on the islands line in `src/main.js` per FR-027 (partial)
- [X] T109 Re-render the islands when the `--cards` flag changes on resize in `src/main.js` per T066, FR-046 (partial)
- [X] T110 Take the pointer type from `pointerdown` or `matchMedia('(pointer: coarse)')` rather than from the click event when choosing the nearest design in `src/strategy-view.js` per US6/AC2 (partial)
- [X] T111 Say in the screening lede that pressing two controls cuts the ground, hand the plan's reading to the survey, letter door consistency as matched designs rather than points, and drop `columnheader` from group rows, in `src/main.js` and `src/strategy-view.js` per US3/AC6, FR-046 (partial)
- [X] T112 Rephrase the island lede in `src/main.js` so no em dash stands inside a sentence, leaving the dash only as the lone absent glyph, per plan: T077 (contradicts)
- [X] T113 Add the staged neighbour budget (home 4/128 then 16/512, 32-design jumps, reduced-depth islands in design-stage order, automatic on design days and on request on a year) to "The strategy plan" in `CLAUDE.md` per T074 (partial)
- [X] T114 Merge the two `### Fixed` headings under Unreleased in `CHANGELOG.md` into one per T075 (unrequested)
- [X] T115 Bring `contracts/space-module.md` and `contracts/strategy-module.md` in line with the code: 19 neighbours, the both-ends skip rule, the shipped signatures of `doorsOf`, `probesAt`, `terrainOf`, `jumpOf` and `movesOf`, `classifyAll` in place of `classify`, and `plan.spots` in place of `sweetSpot`, per plan: contracts (contradicts)

---

# Amendment 2026-09-11: width, campaign, panel

**Input**: spec.md *Session 2026-09-11* (FR-001, FR-009a, FR-011a, FR-012a, FR-046a), plan.md *Amendment 2026-09-11*, research.md sections 17 to 20, data-model.md *Added 2026-09-11*, contracts/pool-width.md, contracts/campaign.md, contracts/planner-panel.md, quickstart.md gates 11 to 13.

**Baseline**: this branch after Phase 10 (T079 to T115). Every task below edits code that already exists; read the named function before changing it. The harnesses are constitutional gates written after the code they exercise, as in Phases 1 to 9.

## Phase 11: Foundational (the pool and the queue)

**Purpose**: The two shared mechanisms every later phase leans on. Both are additive: no existing caller changes behaviour except through the width.

- [X] T116 [P] In `src/pool.js`, replace `poolLimit` with `poolWidth({ cores = 4, deviceMemoryGB = null, perInstanceMB = 256 })` returning a frozen `PoolWidth` instance with `cores`, `memoryGB` (reported, capped at 8, or 4 where null), `assumed` (true where null), `byCores = cores − 2`, `byMemory = floor((memoryGB × 1024 / 2 − perInstanceMB) / perInstanceMB)`, `width = max(1, min(byCores, byMemory))` with no fixed cap, and `why` naming the binding term exactly as contracts/pool-width.md words it. Rewrite the doc comment to record why two cores are held back, why half the memory, and the 0.79 ms per-design build measurement from research.md section 17.
- [X] T117 [P] In `src/scheduler.js`, add `holdWhere(pred, held)` to the returned API: set `job.held = held` on every active job the predicate matches, then `drain()`. Make `takeNext` skip a job whose `held` is true; give `makeStudyJob` a `held = false` option so a job can be admitted already held; and change the idle test in `drain` to "nothing in flight and no active job that is unheld", so a queue of held jobs still fires `'idle'`. Leave `started`, `order` and `curve` untouched by holding (contracts/campaign.md).
- [X] T118 In `src/main.js`, replace the `poolLimit` import and call with `poolWidth`: keep the result as `const studyWidth = poolWidth({ cores: navigator.hardwareConcurrency ?? 4, deviceMemoryGB: navigator.deviceMemory ?? null })` and set `studyCapacity = studyWidth.width`, so the plan can letter `studyWidth.why` (FR-011a). Depends on T116.
- [X] T119 Write `specs/009-strategy-plan/verify/pool-width.mjs` (no engine), in the shape of the other harnesses (`ok`, exit non-zero on the first failure): the six rows of research.md section 17's table exactly; `width ≥ 1` over `cores` 1 to 64 and `deviceMemoryGB` in `[null, 0.25, 0.5, 1, 2, 4, 8, 16]`; `width ≤ cores − 2` wherever `cores ≥ 3`; never above 15; and `why` naming the term that is the minimum (quickstart gate 11). Depends on T116.
- [X] T120 Write `specs/009-strategy-plan/verify/scheduler-hold.mjs` against a fake pool, reusing the fake-pool setup in `specs/009-strategy-plan/verify/scheduler-designs.mjs`, asserting the six items of contracts/campaign.md: a held job dispatches nothing while a study beside it keeps its turns; runs in flight when held land and are cached; release continues the same indices in order with none started twice; a job enqueued held waits; a held-only queue fires `'idle'`; cancelling a held job fires `'cancelled'` and leaves ledger entries in place (quickstart gate 12). Depends on T117.

**Checkpoint**: `node specs/009-strategy-plan/verify/pool-width.mjs` and `scheduler-hold.mjs` pass, and every Phase 1 to 10 harness still passes.

---

## Phase 12: User Story 1, the plan in its own panel (FR-001)

**Goal**: The whole strategy plan lives in a panel on the left of the sheet, mirroring the Model Console on the right, opened from the ledger and from E-02.

**Independent Test**: At 1,920 px, press the ledger's plan button: the panel opens left of the sheet holding the reading chooser, the plan drawing, the islands, the screening and the four kinds, each drawn to the panel's width. Close it: the plan's readings and tags stand. Open it again from E-02's link.

- [X] T121 [US1] In `index.html`, move the whole `section#strategy` block out of `section#survey` into a new `aside.planner#planner` (`aria-label="Strategy plan"`) placed after `main.sheet` and before `aside.desk` in the DOM, and drawn on the left with `order: -1` (so focus order stays sheet, plan, console). Give it a `header.planner-head` mirroring `.desk-head`: the eyebrow and title, the existing `#strategy-scope`, a state line `#campaign-state`, buttons `#campaign-pause`, `#campaign-resume` and `#campaign-cancel` (all `hidden` initially), and `#planner-close`. Keep every existing `strategy-*` id unchanged so `renderStrategy` needs no id changes. Amend the markup line of `specs/009-strategy-plan/contracts/planner-panel.md` to say after the sheet in the DOM, before it on screen.
- [X] T122 [US1] In `index.html`, add the planner's styles beside the `.desk` rules: a `--planner: 436px` token beside `--desk`; `.planner` sticky at `top: 16px` with `max-height: calc(100vh - 32px)`, scrolling inside itself, on `var(--vellum)`, with `.desk`'s border and radius mirrored (`border-left: 0`, right-hand radius, `margin-right: -1px`) and `display: none`; `body.planner-open .planner { display: flex; flex: 1 0 var(--planner); }`; `body.planner-open` taking `padding-left: 0` and the sheet the same `flex: 0 1 1080px; min-width: 0` that `body.desk-open .sheet` takes; `.planner-head` styled as `.desk-head`; and a `[hidden]` twin for every class here that sets `display`.
- [X] T123 [US1] In `index.html`, add `#planner-open` to the ledger beside `#desk-open`, using the same `deskbtn` markup with `aria-expanded="false"`, `aria-controls="planner"` and a sub-line `#planner-count`; and add a `button.link#survey-planner` to E-02's head reading *Open the strategy plan*.
- [X] T124 [US1] In `src/main.js`, add `openPlanner(open)` beside `openDesk`: toggle `body.planner-open`, set `#planner-open`'s `aria-expanded` and its sub-line (*Close the plan* / *The whole design space*), call `tour?.syncGuide()`, and on a short timer call `renderTrace` and `renderStrategySoon`, because both the sheet's and the plan's widths changed. Wire `#planner-open`, `#survey-planner` and `#planner-close` (which returns focus to `#planner-open`).
- [X] T125 [US1] In `src/main.js`, make the `ctl-tag` listener call `openPlanner(true)` (and unfold the panel once Phase 14 exists) before it scrolls to and focuses its entry; and make `cutFromScreening` scroll the sheet to `#survey` after `cutFromPull`, since the ground is no longer beside the screening.
- [X] T126 [US1] In `src/main.js`, open the panel when a plan opens, from `toggleStrategyReading` and from `restoreLinked`, and letter in `renderStrategy`'s no-plan lede that the plan's readings are chosen here and measured in this panel. Closing the panel must not call `closeStrategy`: the plan, its campaign and its tags stand until *Close the plan*.

**Checkpoint**: US1's independent test passes at 1,920 px; the E-02 ground still cuts from the screening; nothing crosses the sheet's edge.

---

## Phase 13: User Story 2, a campaign the reader controls (FR-009a, FR-011a, FR-012a)

**Goal**: Stepping into a world starts only that world and its jumps on a design-day desk; each island is measured on request; and the reader can pause, resume or cancel the plan's runs without touching studies.

**Independent Test**: On a design-day desk, open the plan: the solve counter rises by about 1,632 runs and stops. Ask for one island: it rises by about 352. Pause mid-way: it stops within the runs in flight while a study beside it keeps solving; Resume continues with no repeat; Cancel stops it with every dot kept.

- [X] T127 [US2] In `queueStrategy` in `src/main.js`, drop the design-day exception for islands: queue an island's own 8 bases and designs 32 to 127 only when `strategyPlan.asked` holds its neighbour id, on every desk. In `renderStrategy`, show `#strategy-measure` for any island at jump depth not yet asked, on every desk, lettered *Measure this world: about N runs, about S s* from `island.cost` with the run kind named (FR-009a, research.md section 20).
- [X] T128 [US2] In `src/main.js`, add `campaign: { state: 'running', world: null }` to the object `openStrategy` builds, and a `Campaign` frozen class with a `campaignSnapshot()` that fills `state`, `world`, `waiting` (over `strategyJobs`: `total − done − inFlight`), `inFlight` (`job.started.size − done` per job) and `withheld` (the held neighbours job's design count, from `strategyPlan.held`), per data-model.md.
- [X] T129 [US2] In `src/main.js`, implement the three controls per contracts/campaign.md: Pause calls `studyScheduler.holdWhere((job) => job.origin === 'strategy', true)` and sets `paused`; Resume either releases with `holdWhere(..., false)` or, from `cancelled`, sets `running` and calls `queueStrategy()`; Cancel calls `cancelStrategyJobs('cancelled')`, sets `cancelled` and records the world signature. Make `queueStrategy` and `releaseNeighbours` admit jobs with `held: true` while `paused`, queue nothing while `cancelled` for the same world signature, and set `running` when the signature differs from the cancelled one. Make `onStrategyUpdate` treat a `'cancelled'` job like `'replaced'` (no `strategyShed`).
- [X] T130 [US2] In `renderStrategy` in `src/main.js`, letter the campaign in the planner head from `campaignSnapshot()`: the three buttons shown per the contract's table, and the state line *Paused: N runs wait. Runs already on an engine finish.* or *Cancelled: M runs kept, N not run. Resume to measure the rest.*, or the runs to go while running. Add `${studyWidth.width} engines side by side: ${studyWidth.why}` to the coverage line, the annual consent sentence and each island's measure button (FR-011a).
- [X] T131 [US2] In `src/main.js`, keep the gate distinct from the campaign: `syncStrategyGate` cancels plan jobs without touching `campaign.state`, and when the gate lifts `refreshStrategy` honours it, re-queueing held while `paused` and not at all while `cancelled` for the same world.

**Checkpoint**: US2's independent test passes, `scheduler-hold.mjs` still passes, and a study opened during a paused campaign completes.

---

## Phase 14: User Story 6, two panels and a phone (FR-046a)

**Goal**: The plan's panel and the console stand together where the window allows; elsewhere one folds to its head; on a phone the plan is a page under the sheet.

**Independent Test**: At 1,920 px both panels open at full width. At 1,440 px, opening the console folds the plan to a 168 px rail that still shows its readings, campaign state and controls; pressing the rail swaps them. At 390 × 640 the plan is a page under the sheet with its campaign controls first.

- [X] T132 [US6] In `index.html`, declare `--sheet-min: 720px` and `--rail: 168px` beside `--desk`, `--both: 1` on `body`, and one media query `@media (max-width: 1624px) { body { --both: 0; } }` with a comment deriving 1,624 from 720 + 436 + 436 and the gutters. The number appears nowhere else.
- [X] T133 [US6] In `index.html`, style `body.planner-folded .planner` and `body.desk-folded .desk` as `flex: 0 0 var(--rail)`, showing only the head: for the planner, the title, `#strategy-scope`, `#campaign-state` and the three campaign buttons stacked, with its body `hidden`; for the console, the `.desk-head` alone. Give every new `display`-setting rule its `[hidden]` twin.
- [X] T134 [US6] In `src/main.js`, add `bothFit()` reading `--both` with `getComputedStyle(document.body)`, and a `syncFolds(opened)` called from `openPlanner` and `openDesk`: where both panels are open and `bothFit()` is false, fold the one not just opened; a press on a folded panel's head unfolds it and folds the other; a `resize` listener re-runs `syncFolds` when `bothFit()` flips and calls `renderStrategySoon` and `renderTrace`. Complete T125 by unfolding the panel before a strip tag focuses its entry.
- [X] T135 [US6] In `index.html`'s existing `@media (max-width: 780px), (max-height: 600px)` block, make `.planner` a page under the sheet as `.desk` becomes one: static, full width, no sticky height cap, `order` placing it after `main.sheet` and before `.desk`, its head first so the campaign controls are the first thing the page shows; folds do not apply there.

**Checkpoint**: US6's independent test passes at 1,920, 1,440 and 390 px, and in forced colours the rail's state and controls read as text.

---

## Phase 15: Polish

- [X] T136 [P] In `src/tour.js`, retarget the plan's note in `NOTES`: `target` is `#planner-open` while the panel is closed and `#planner` while it is open (the arrangement the patch note follows with `#desk-open`), its copy says the plan opens in its own panel on the left, and `STORE` becomes `shoebox-general-notes-v6` (FR-048).
- [X] T137 [P] In `.interface-design/system.md`, add a component pattern *A second instrument on the left*: the planner mirroring the desk, the three-column flex row and why not a grid, `--sheet-min`, `--rail` and `--both`, the fold swap, and the campaign's three controls in the head (constitution gate 8).
- [X] T138 [P] In `CLAUDE.md`, under "The strategy plan": record the pool's width rule with the research.md section 17 table and the 0.79 ms build measurement; the campaign and why Pause holds rather than cancels; the planner panel and its fold; and replace "On a design-day desk the islands follow automatically" in the staged-budget paragraph with islands on request on every desk.
- [X] T139 [P] In `CHANGELOG.md`, amend the *Added* entry for the strategy plan to say it opens in its own panel on the left, its runs can be paused, resumed or cancelled, it runs as many simulations side by side as the machine has cores less two, and each neighbouring world is measured on request. Concise, house voice, no hard wrap in any release body drawn from it.
- [X] T140 Add `pool-width.mjs` and `scheduler-hold.mjs` to the table in `specs/009-strategy-plan/verify/README.md`, then run every engine-free harness in that directory (`space-roles`, `space-designs`, `skip-proof`, `scheduler-designs`, `scheduler-hold`, `pool-width`, `tag-freshness`, `no-combined`, `link-roundtrip`) and `npm run build`; all must pass.
- [X] T141 Measure the added transfer with `npm run build` and `scripts/deploy.mjs`'s brotli settings, excluding `energyplus/`, `schemas/` and `weather/`, against `specs/009-strategy-plan/verify/baseline-size.txt`; append the figures and assert under 61,440 bytes (SC-015).
- [ ] T142 Drive quickstart gate 13 in a foreground tab: every layout in contracts/planner-panel.md at every width it names, the width lettered and matching this machine, the design-day campaign stopping after the home world and the jumps, Pause, Resume and Cancel against the solve counter with a study beside them, SC-002 at full width, and a strip tag unfolding the folded panel.

---

## Amendment: dependencies and execution order

- **Phase 11** blocks everything after it. T116 and T117 run in parallel (different files); T118 and T119 follow T116; T120 follows T117.
- **Phase 12 (US1)** follows T118. T121, T122 and T123 edit `index.html` and run in that order; T124 to T126 edit `src/main.js` and follow T123.
- **Phase 13 (US2)** follows Phase 11 and T121 (the campaign's buttons live in the planner head). It can run beside Phase 12's `src/main.js` tasks only if one editor holds the file; otherwise after T126.
- **Phase 14 (US6)** follows Phases 12 and 13, since the rail shows the campaign's controls.
- **Phase 15**: T136 to T139 run in parallel; T140 and T141 after every code task; T142 last.

## Amendment: parallel example

```bash
# Phase 11, in separate files:
Task: "Replace poolLimit with poolWidth in src/pool.js"
Task: "Add holdWhere to src/scheduler.js"
# Phase 15, in separate files:
Task: "Retarget the plan's note in src/tour.js and bump to v6"
Task: "Add 'A second instrument on the left' to .interface-design/system.md"
Task: "Record the width, the campaign and the panel in CLAUDE.md"
Task: "Amend the strategy plan's Added entry in CHANGELOG.md"
```

## Amendment: implementation strategy

1. Phase 11, then stop if either new harness fails.
2. Phase 12: the panel alone is the most visible change and is independently shippable as a stacked pull request on this branch.
3. Phase 13: the campaign and islands on request, which remove most of the unasked-for runs.
4. Phase 14, then Phase 15, with gate 13 driven before the branch is marked ready.

---

# Amendment 2026-09-11 (second): the survey in the panel, the numbered sequence, and constraints

**Input**: spec.md *Session 2026-09-11* (FR-001 revised, FR-001a, FR-001b, FR-019a, FR-046b, FR-049 to FR-057, US7, SC-016 to SC-018), plan.md *Amendment 2026-09-11 (second)*, research.md sections 21 to 27, data-model.md *Added 2026-09-11 (second)*, contracts/panel-sequence.md, contracts/constraints.md, quickstart.md gates 14 to 16.

**Baseline**: this branch after Phase 15. Every line reference below was taken against it and is a starting point, not a target: read the named function before changing it.

**What is still outstanding from earlier phases** and is not superseded by anything here: T071 and T078 (quickstart gate 9, including steps 9 and 10) and T142 (gate 13). They stay open.

**Two groups.** Phases 16 and 17 are what the panel is now a panel *of*: the survey moves into it, the sequence becomes six numbered parts, and the width and the relief are made to carry two drawings in one column. Phase 18 is the seventh user story, constraining the design space, and it is the only group that touches the sampler.

**No task here adds** a run-time dependency, an output request, a channel, a control or a model object. `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty.

---

## Phase 16: Foundational (the panel's frame, and the relief's resize path)

**Purpose**: The width machinery and the resize path the survey needs before it can stand in the panel. A relief moved into a panel with no resize path keeps the backing store it was last drawn at, and on a finished survey no further sample ever lands to correct it, so this blocks the move rather than following it.

**CRITICAL**: Phase 17 must not start until T145 and T146 are done, or the first fold of the panel locks a finished relief into a 1 by 1 canvas.

- [X] T143 In `index.html`, give the panel its declared growth: add `--planner-max` beside `--planner`, `--sheet-min` and `--rail` (`index.html:51`), make `--sheet-min` a real `min-width` on `main.sheet` where it is used in no rule today, and change `body.planner-open .planner` (`index.html:2544`) from `flex: 1 0 var(--planner)` to `flex: 1 1 var(--planner); max-width: var(--planner-max)`, so the sheet reaches its own measure before the panel takes any surplus (FR-046b). Comment why `--sheet-min` finally has a job, and give every new `display`-setting rule its `[hidden]` twin.
- [X] T144 In `index.html`, replace the survey's window query with a container query. `.planner-body` already carries `container-type: inline-size` (`index.html:5034`), so add `--pair` to `.survey-body` (`index.html:4662`) defaulting to 0 with one column, and a `@container` rule taking it to 1 and two columns above a declared container width. Remove the two-column flattening from the `@media (max-width: 900px), (max-height: 620px)` block (`index.html:5320`) and rewrite the `--survey` comment (`index.html:4342`), which records that nothing reads the flag back: `--pair` is read back, and a 436 px panel in a 1,920 px window must not leave two 200 px squares (FR-046b, research.md section 21).
- [X] T145 In `src/relief.js`, make `resize()` (`src/relief.js:414`) refuse a zero box and keep the last good size, because `body.planner-folded .planner-body` is `display: none` (`index.html:2577`) so a host inside a folded panel measures 0 and the existing `Math.max(1, ...)` floor would lock in a 1 by 1 canvas. Record in the comment that a measurement taken of a hidden element is not a measurement.
- [X] T146 In `src/main.js`, have `panelsMoved()` (`src/main.js:3505`) reach the relief through `relief.repaint` (`src/relief.js:843`) as it already reaches the plate and the plan, and read `--pair` back where the two drawings are told what width to draw themselves at. One paint per debounced resize, never per frame. Record why a `ResizeObserver` was rejected: it fires through the fold's own transition and the first box it would see is the zero one (research.md section 21, plan.md Complexity Tracking).

**Checkpoint**: At 1,920 px the panel grows to `--planner-max` and no further, the sheet never falls below `--sheet-min`, and folding and unfolding the panel on a finished survey leaves the relief correct with no new sample landing.

---

## Phase 17: User Story 1 - the survey in the panel, as one numbered sequence (Priority: P1)

**Goal**: E-02 leaves the sheet whole and becomes part 5 of the panel, the panel reads as six numbered parts each headed by the question it answers, and no part stands behind a gate or hides a reading.

**Independent Test**: Open the panel with nothing measured. All six parts stand, numbered, in the order FR-001b names, each saying what it waits on. The sheet holds E-01 alone. Cut a ground from part 4 and it appears in part 5, scrolling within the panel.

- [X] T147 [US1] In `index.html`, move the whole `section.survey#survey` block (`index.html:5636` to `:5774`) out of `main.sheet` into `.planner-body` after the strategy section, carrying everything it owns: `#survey-choose`, `section.pull#pull`, `#survey-refusal`, `#survey-drawing` with `#survey-ground` and `#survey-relief`, the ground key, `#survey-spot`, `#survey-coverage`, the traverse, the finding, the `survey:spots` fold and the E-02 stamp. Keep every id unchanged so `renderSurvey` and its helpers need none. Delete `button#survey-planner` (`index.html:5643`): nothing is left on the sheet to open the panel from, and the ledger's `#planner-open` is the route (contracts/panel-sequence.md).
- [X] T148 [US1] In `index.html`, number the sequence in the markup. Wrap the reading chooser and the campaign state as part 1, the plan drawing and its recipes as part 2, and give the existing `#strategy-islands-title`, `#strategy-screen-title`, the moved survey and `#strategy-moves-title` their numbers 3 to 6, each heading stating the question it answers: what this plan is of, what decides this reading, what is one door away, what pulls anywhere in this world, what the ground looks like along two of them, and what should be decided now. The number and the question are in the markup and never composed at render, so the sequence reads the same with nothing measured as with everything measured (FR-001b, data-model.md `PanelPart`).
- [X] T149 [US1] In `index.html`, take the `hidden` attribute off the four blocks that are gates today, so each becomes a part that stands: `div.strategy-body#strategy-body` (`index.html:6000`), `section.strategy-part#strategy-moves-part` (`index.html:6055`), `section.survey#survey` and `div.survey-body#survey-drawing` (`index.html:5673`). Part 5 must stand under part 4 in the DOM, because the screening is what hands it its two axes (FR-001a, FR-001b).
- [X] T150 [US1] In `src/main.js`, letter what each standing part waits on, in `renderStrategy` (`src/main.js:11308`) and `renderSurvey` (`src/main.js:8281`): parts 2 to 4 say what they wait on where a plan does not exist yet, part 6 says it needs a second reading, and part 5 says two controls in part 4 cut it. A part is never absent and never behind a gate, and no reading, share explained, verdict, absence reason or refusal goes into a fold (FR-001a).
- [X] T151 [US1] In `index.html`, state once at the head of part 5, in place and not on hover, why the ground carries contour lines and a relief block and the plan's terrain carries neither: the ground is measured along two chosen controls, the terrain is inference along moves. Neither drawing is brought to the other's convention (FR-019a, US1 scenario 11).
- [X] T152 [US1] In `src/main.js`, move the two cross-link scrolls into the panel: `cutFromScreening` (`src/main.js:11751`) no longer scrolls the sheet, since part 5 is a few centimetres below part 4 in the same scroller, and `nameSurveyAxis`'s scroll (`src/main.js:9052`) moves with it (contracts/panel-sequence.md).
- [X] T153 [US1] Assert the sequence's own copy in `src/main.js` or `index.html` against `src/copy.js`: every part heading and every waiting sentence is within its budget, and the two record folds (`survey:spots` at `index.html:5759` and `strategy:designs` at `index.html:6063`) keep their readings outside them, which is the split FR-001a actually draws, a reading never in a fold and a record allowed in one.

**Checkpoint**: US1's independent test passes. One ground, drawn in one place, and the panel reads as a storyline with nothing measured.

---

## Phase 18: User Story 7 - Constrain the space before it is explored (Priority: P1)

**Goal**: A constraint narrows what is sampled and run, re-letters at once from what the ledger already holds, queues nothing by itself, rides the link, and is typed on the control's own face.

**Independent Test**: Set a range constraint on one control and rule out one door. The panel re-letters from measured designs with the solve counter still. Asking for the rest measures only inside the region. The ruled-out world is never measured, and every design drawn lies inside the constraint.

- [X] T154 [US7] Create the constraint declarations in `src/space.js` beside the roles and the doors: frozen `Bound`, `RuledOut`, `Region` and `Region.EMPTY`, with throwing constructors, per data-model.md and contracts/constraints.md. `Bound` refuses a key that is not a `Scale` or a `Facade` side, naming that only `Ruled` carries `min`, `max` and `step` (`src/controls.js:316`); refuses a non-finite or off-face bound; accepts `to === from` as pinning; and throws naming the step where **no position on the control's own step grid** lies inside the range, which is new validation because `refuses` deliberately does not test step alignment (`src/controls.js:1589`). `RuledOut` throws when a setting is not the door's own and when every setting is named. `Region` carries `bounds`, `ruled`, `signature`, `spanOf`, `admits`, `allows` and `stateOf`, and every function below takes a `Region` so no call site has a second path for no constraints.
- [X] T155 [US7] Bind the region at all three sites in `src/space.js`, per contracts/constraints.md. `snapped(control, u, span)` (`src/space.js:314`) bins inside the span with the same equal-probability rule offset to the span's low stop, and **every value it returns still lies on the control's own global step grid anchored at `control.min`**, never at `span.from`, which is what `samplePoints` already does (`src/study.js:140`) and what makes SC-017 true. `designAt`'s normalisation (`src/space.js:669`) sets `u[at]` to the position within the span rather than `Ruled.fraction`'s position within the face (`src/controls.js:339`), because FR-052 letters an effect per the constrained span and the moves are fitted over this `u`. `probesAt`'s step (`src/space.js:742`) is a twentieth of the span with the room test against the span's bounds. Missing any one produces figures that are arithmetically correct and about the wrong span.
- [X] T156 [US7] Join `region.signature` to the `VALUES` memo key in `src/space.js` (`src/space.js:628`), which is keyed by design index alone today. Without it a constraint committed after a design was generated hands back the unconstrained value with no symptom anywhere: the design is drawn inside the region, keyed as if it were inside the region, and is a building from outside it. Record in the comment that Principle II is the rule this breaks, and why clearing the memo per commit was rejected as coarser (plan.md Complexity Tracking).
- [X] T157 [US7] Take the region in `neighboursOf(world, region)` in `src/space.js` (`src/space.js:559`) and drop a ruled-out door setting **before** a world is built for it, so it is never measured. List it as ruled out **by the reader**, which is a different sentence from a world the engine cannot enter, and keep both lists standing (FR-055, FR-043, US7 scenario 3).
- [ ] T158 [US7] Carry the region beside every figure in `src/strategy.js`: the moves, the shares explained, the screening, the terrain and the sweet spots each letter `Region.stateOf` wherever they are lettered, so two plans carrying the same words cannot carry different numbers, and an effect per a constrained span is never presented in the words of one per a full range (FR-052, SC-018).
- [ ] T159 [US7] Implement the frozen `Binding` class in `src/strategy.js` per data-model.md: `key`, `end`, `share` read off the best tenth of measured designs inside the region so that saying a constraint binds is always honest, and exactly one of `worth` and `absence`, where `worth` is lettered **only** from completed runs outside the region the ledger already holds and `absence` carries the offer to measure a probe just outside with its cost stated first. Never extrapolate, infer or estimate it from designs inside the region (FR-057, US7 scenario 6).
- [ ] T160 [US7] Add the reserved key `cn` to `src/permalink.js`: extend `RESERVED` (`src/permalink.js:98`) to nine entries keeping its load-time assertion against `ALL_KEYS`, and read `cn` in `decodeState` **beside `sv` and `sp`** (`src/permalink.js:582`), above everything `readValue` does, because the numeric regex runs before the per-kind switch (`src/permalink.js:448`) and the single-claim loop skips `RESERVED` before calling `readValue`. Write it in `encodeState` beside `sv` and `sp` (`src/permalink.js:252`) only where a constraint is in force, re-serialising what was read. Implement the grammar in contracts/constraints.md, assert at load that no door setting is a bare number and none contains `_`, and spell a patch door by its channel id alone, since its internal id is `patch:<channelId>` (`src/space.js:432`) and `:` is escaped. Refuse whole: an unknown key or setting, a bound failing `Bound`'s rules, a door with every setting ruled out, a malformed entry, and a key the desk does not own.
- [ ] T161 [US7] Restore a linked region in `src/main.js` in `restoreLinked` (`src/main.js:4439`) before anything else of the link is restored, by the rule T079 already established for the plan, and add `cn` to `schemeHash` so a copied link reproduces the region (FR-051, US7 scenario 7).
- [ ] T162 [US7] Put typed bounds on the control's own face in `src/console.js`, in `buildScale` (`src/console.js:614`) and in the facade and boundary rows, through `quantityField` (`src/field.js:33`) exactly as the survey's extent boxes do (`src/main.js:8905`), each calling its own `show()` because a field built and appended alone stands empty. Draw the disallowed part of the face as disallowed, beside `.ctl-derived` (`src/console.js:664`), and add the styles with their `[hidden]` twins to `index.html`. It is not a hover state: `pointer: coarse` has no hover (FR-053).
- [ ] T163 [US7] Draw the summary of every active constraint at the head of part 1 in `src/main.js`, each naming its control and its bounds, each removable there and all removable at once, so a constraint reads in both places (FR-054). Guard the redraw with a signature as `renderSurveyChoose` already does (`src/main.js:8942`), because `host.textContent = ''` destroys the node the reader is typing into and a bound typed while the ground fills would lose its keystrokes silently.
- [ ] T164 [US7] Make the commit a re-cut rather than a filter in `src/main.js`: committing, changing or removing a constraint re-letters every figure at once from the designs the ledger already holds inside the new region, **queues no run by itself**, offers the runs that would fill the region with their count and their time by the consent pattern the annual cost and each island's *Measure this world* already use, and keeps every design measured outside the region in the ledger, stated as ruled out and left out of every figure. Keep the two deliberate non-refusals: a region excluding the desk's own stance stands with the stance mark outside it saying so, which is `axisFor`'s own rule (`src/survey.js:306`), and a constraint on a control dark in this world is kept and stated as reaching nothing here (FR-050, FR-056).
- [ ] T165 [US7] Write `specs/009-strategy-plan/verify/constraints.mjs` (quickstart gate 14, no engine), asserting all seven items of contracts/constraints.md: every refusal class throws naming what was wrong and a sub-step region names the step; every design of a constrained region lies inside it over at least 100 designs and every ruled-out door, with every value on the control's own step grid (SC-016); `designAt` under `Region.EMPTY` and under a narrowing region that still admits the value give byte-identical `params` so the cache identity is one string (SC-017); the memo carries the region; a ruled-out door produces no `Neighbour` and one listed reason; `cn` round-trips every entry shape with every refusal class refused whole, `sv`, `sp` and `cn` together round-trip, and a pre-feature corpus decodes byte-identically; and two regions over one control letter the same words and different numbers with neither lettered without `stateOf` (SC-018).
- [ ] T166 [US7] Write and run `specs/009-strategy-plan/verify/recut.mjs` (quickstart gate 15, engine, about 10 minutes) on the reference desk: measure a region, narrow it, and confirm the solve count rises by exactly the designs the ledger did not already hold; designs outside the new region stay in the ledger, are stated as ruled out and are in no figure; and widening back runs nothing at all. Record what share of a typical narrowing was already in hand, which nothing settles on paper (research.md section 27).

**Checkpoint**: US7's independent test passes, and gates 14 and 15 pass. The moves are fitted to the building the reader can actually build.

---

## Phase 19: Polish for this amendment

- [X] T167 [P] In `src/tour.js`, retarget the survey step (`src/tour.js:198`) at a part inside the panel so it opens the panel first, as the `strategy` step already does, and move `STORE` (`src/tour.js:53`) from `shoebox-general-notes-v6` to `shoebox-general-notes-v7`, because the step's subject moved (FR-048, constitution gate 6).
- [ ] T168 [P] In `.interface-design/system.md`, record two component patterns: *A constrained face* (typed bounds through `quantityField`, the disallowed part drawn as disallowed, never on hover) and *A numbered sequence of parts* (six parts, numbered in the markup, each headed by its question, a part that stands and says what it waits on, and the record fold against the reading that may never be folded). Record `--planner-max`, `--pair` and `--sheet-min`'s new job as layout thresholds (constitution gate 8).
- [ ] T169 [P] In `CLAUDE.md`, extend *The strategy plan*: the survey moving whole into the panel and the sheet keeping E-01 alone, the six numbered parts and why no part is a gate, the two drawings' opposite conventions stated once where they meet, the relief's resize path and why a zero box is refused, the container query as the first in the stylesheet, and constraints, being the three binding sites, the region in the memo key, the min-anchored grid that makes a re-cut free, and the `cn` key as the fourth meeting with the `readValue` trap. Add gate 15's measured share of a typical narrowing once T166 has run.
- [ ] T170 [P] In `CHANGELOG.md`, amend the strategy plan's *Added* entry to say the survey now stands in the panel with the plan, the panel reads as six numbered parts, and the design space can be constrained before it is explored. Concise, house voice, no hard wrapping in any release body drawn from it.
- [ ] T171 Add `constraints.mjs` and `recut.mjs` to the table in `specs/009-strategy-plan/verify/README.md`, then run every engine-free harness in that directory (`space-roles`, `space-designs`, `skip-proof`, `scheduler-designs`, `scheduler-hold`, `pool-width`, `pool-recycle`, `tag-freshness`, `no-combined`, `link-roundtrip`, `constraints`) and `npm run build`. All must pass.
- [ ] T172 Measure the added transfer with `npm run build` and `scripts/deploy.mjs`'s brotli settings, excluding `energyplus/`, `schemas/` and `weather/`, against `specs/009-strategy-plan/verify/baseline-size.txt`; append the figures and assert the feature's total is under 61,440 bytes. The feature and its first amendment have spent 31,360 bytes, so about 30 KB remains for everything in this amendment (SC-015, plan.md).
- [ ] T173 Run a copy-budget and em-dash sweep over every always-visible string this amendment declares, in `src/space.js`, `src/strategy.js`, `src/console.js`, `src/main.js` and `index.html`, against `src/copy.js`. Keep readings, verdicts, absence reasons, blocking reasons and refusals out of any fold, and leave the dash only as the lone absent glyph.
- [ ] T174 [US6] Drive quickstart gate 16 in a foreground tab, at 1,920, 1,624, 1,440, 1,180, 900, 780 and 390 px wide and at 1,280 by 600: all six parts standing in order at every width each headed by its question, a part with nothing measured saying what it waits on, the sequence one column throughout, the ground and the relief side by side only above the declared container width with nothing wider than its host, the sheet holding E-01 alone and reaching `--sheet-min` before the panel takes surplus, the panel stopping at `--planner-max`, the relief correct after a fold, an unfold and a resize on a finished survey with no new sample landing, two controls in part 4 cutting the ground in part 5 and scrolling within the panel, the two-drawings sentence in place and not on hover, a constraint set, read and removed at 390 px with a coarse pointer and from the keyboard including the summary at the head of part 1, a commit re-lettering at once and queueing no run, and the notes' key reading `shoebox-general-notes-v7` (FR-001a, FR-001b, FR-019a, FR-046b, FR-053, FR-054, FR-056, US7 scenario 8).

---

## Second amendment: dependencies and execution order

- **Phase 16** blocks Phase 17. T143 and T144 both edit `index.html` and run in that order; T145 is in `src/relief.js` and runs in parallel with either; T146 follows T144 and T145.
- **Phase 17 (US1)** follows Phase 16. T147, T148, T149 and T151 edit `index.html` and run in that order; T150, T152 and T153 follow them in `src/main.js`.
- **Phase 18 (US7)** follows Phase 17 only for T163 and T164, which letter into part 1 and the panel's consent line. Its arithmetic (T154 to T159) depends on nothing in Phases 16 and 17 and can be built in parallel with them, which is what keeps it the separately shippable chunk plan.md's sequencing calls for. Within it: T154 first, then T155, T156 and T157 in parallel, then T158 and T159; T160 and T161 are independent of the arithmetic in their own files; T165 follows T160, and T166 follows T164.
- **Phase 19**: T167 to T170 run in parallel in four different files. T171 and T172 follow every code task. T173 follows the code and precedes T174. T174 is last and is driven, not harnessed.
- **Still open from earlier phases**, and not superseded: T071, T078 and T142.

## Second amendment: parallel example

```bash
# Phase 16, in separate files:
Task: "Declare --planner-max and make --sheet-min a real min-width in index.html"
Task: "Make resize() refuse a zero box in src/relief.js"
# Phase 18's arithmetic, after T154, in one file but separate functions:
Task: "Bind the region at the three sites in src/space.js"
Task: "Join region.signature to the VALUES memo key in src/space.js"
Task: "Add the reserved key cn to src/permalink.js"
# Phase 19, in separate files:
Task: "Retarget the survey step in src/tour.js and bump to v7"
Task: "Record a constrained face and a numbered sequence in .interface-design/system.md"
Task: "Extend The strategy plan in CLAUDE.md"
Task: "Amend the Added entry in CHANGELOG.md"
```

## Second amendment: implementation strategy

1. **Phase 16, then Phase 17**: the survey's move with the numbered sequence and the width, which is the most visible change and the one that unblocks the rest. Independently shippable as a stacked pull request on this branch, and stop if the relief is wrong after a fold.
2. **Phase 18**: constraints, the only chunk that touches the sampler. Stop if T165 finds a design outside its region or a re-cut that is not free, because both are Principle II rather than a feature defect.
3. **Phase 19**, with gate 16 driven before the branch is marked ready.

**A gap carried rather than filled.** FR-001a, FR-001b, FR-019a and FR-046b have no success criterion of their own, where the constraints work has SC-016 to SC-018. They are covered by the driven gate 16 and by contracts/panel-sequence.md, which is enough to build against, but nothing measurable in the spec will fail if the sequence regresses. Adding one belongs in the spec, not here (plan.md).
