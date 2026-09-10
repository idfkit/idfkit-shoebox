---

description: "Task list for 006-design-space-survey"
---

# Tasks: Survey the design space

**Input**: Design documents from `/specs/006-design-space-survey/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This repository has **no test runner and no linter**. Verification is throwaway
Node harnesses, and the constitution's Development Workflow makes several of them
**mandatory gates** rather than optional tests. The harness tasks below are therefore
constitutional gates, not TDD. They are written after the code they exercise, except
T012 (repeatability), which must run early because a failure changes the design.

Harnesses live in `specs/006-design-space-survey/verify/`, following the precedent set
by `specs/007-upgrade-idfkit-js/verify/`.

**Organization**: Tasks are grouped by user story so each can be implemented and
verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US8)
- Exact file paths are given in every task

## Path Conventions

Single project. Modules under `src/`, styles inline in `index.html`, harnesses under
`specs/006-design-space-survey/verify/`. There is no `tests/` directory and none is
created.

**Baseline**: written against `main`. PR #53 (`worktree-007-upgrade-idfkit-js`) touches
only `src/model.js`, `src/controls.js` and `src/describe.js`, none of which this feature
edits, so these tasks apply unchanged on either branch. See research.md section 13.

---

## Phase 1: Setup

**Purpose**: Somewhere to verify, and a baseline to measure against.

- [X] T001 Create `specs/006-design-space-survey/verify/` and a `README.md` in it stating that these harnesses are throwaway, are run by hand, and require `npm run predev` to have staged the engine
- [X] T002 [P] Record the pre-feature transfer baseline: run `npm run build` and write the `dist/` byte totals into `specs/006-design-space-survey/verify/baseline-size.txt`, so SC-012's 60 KB ceiling is measured rather than estimated
- [X] T003 [P] Add `specs/006-design-space-survey/verify/engine.mjs`, a shared helper that boots the staged WASM engine under Node per the CLAUDE.md recipe (set `global.Module` before requiring `public/energyplus/energyplus.js`, clear the require cache between runs)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The scheduler change, the core entities, and the one measurement that could
invalidate the feature's honesty model.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Change `takeNext` in `src/scheduler.js` from a strict walk over `jobs` to a round-robin that takes one unstarted index per active job in turn, preserving the invariant that every dispatched index is added to `job.started` before dispatch
- [X] T005 Extend the existing scheduler harness in `specs/006-design-space-survey/verify/scheduler-fairness.mjs` to drive `createStudyScheduler` against a fake pool and assert that a many-job survey and a single study interleave rather than one starving the other (FR-053)
- [X] T006 [P] Create `src/survey.js` with the frozen typed entities from data-model.md: `Survey`, `Axis`, `SpotHeight`, `Gap`, `Coverage`, each asserting its own invariants in its constructor (FR-041)
- [X] T007 [P] Implement `axisFor(key, { from, to, count, stance })` in `src/survey.js`, snapping positions to the control's own step grid and forcing the stance's value into the list, reusing `samplePoints`'s thousandth-of-a-step tolerance rule (FR-005, FR-008)
- [X] T008 Export the axis-eligibility predicate from `src/study.js` so a survey axis and a study subject are refused by one sentence rather than two (FR-003)
- [X] T009 Implement `rowsFor(survey)` in `src/survey.js`, returning one `makeStudyJob` spec per row with axis Y fixed in `snapshot` and axis X as the swept key, per contracts/survey-module.md
- [X] T010 Implement `landPoint` and `coverageOf` in `src/survey.js`, asserting `measured + gaps + unsurveyed === wanted` and refusing a `Gap` with an empty reason (FR-016, FR-018i)
- [ ] T011 Wire survey rows into the existing `studyScheduler` in `src/main.js`, queueing them through `makeStudyJob` and `enqueue` with no new pool and no new cache (FR-011, FR-012, FR-052, FR-053)
- [X] T012 Write `specs/006-design-space-survey/verify/repeatability.mjs` and run it: measure one design at least 20 times spanning a cold pooled instance and one that has already served ten runs, asserting identical readings (SC-005a, FR-026a). **If this fails, stop and revisit research.md section 7 before continuing**

**Checkpoint**: The ground can be measured and its coverage counted, with nothing drawn yet.

---

## Phase 3: User Story 1 - Cut the ground and stand on it (Priority: P1) 🎯 MVP

**Goal**: Choose two controls and a reading, watch a relief build itself out of real runs,
and step onto any measured point so the whole of E-01 becomes that building.

**Independent Test**: Open the survey on any desk, choose two numeric controls and a
reading, confirm a relief appears built only of completed runs, and confirm choosing a
measured point moves the desk to exactly that design.

- [ ] T013 [P] [US1] Implement `latticeOf(survey)` in `src/survey.js`, returning a `Float64Array` of readings and a parallel `Uint8Array` validity mask, as the one representation both drawings consume
- [ ] T014 [P] [US1] Implement `contoursOf(lattice, levels)` in `src/survey.js` by marching squares, resolving saddle cases 5 and 10 consistently by the cell mean, emitting nothing for a cell whose mask is not fully set
- [ ] T015 [US1] Implement `meshOf(lattice)` in `src/survey.js`, emitting an indexed triangle cell only where all four corners are measured, so a gap is a hole in the geometry rather than a styled region (FR-016, FR-018h)
- [ ] T016 [US1] Write `specs/006-design-space-survey/verify/survey-invariants.mjs` covering gate 1 of quickstart.md: no figure originates outside a `SpotHeight` over at least 50 points, no triangle touches a gap, coverage sums, and every contour segment lies inside an emitted cell (SC-003)
- [ ] T017 [US1] Add E-02's markup to `index.html`: the sheet, its title block cell, the plan host, the relief host, the coverage line and the schedule of spot heights
- [ ] T018 [US1] Add E-02's inline styles to `index.html`, declaring the new layout threshold once as a custom property to be read back by script, considering height as well as width (FR-050)
- [ ] T019 [US1] Draw the contoured plan as inline SVG in `src/main.js`: axes lettered with the controls' own names and stops, contours with values at their turns, spot heights as tick marks carrying their numbers in the mono face (FR-018a, FR-020)
- [ ] T020 [US1] Draw unsurveyed ground as bare sheet with no contour carried across it, and gaps with their reasons, distinguished without colour being the only carrier, in `src/main.js` (FR-018, FR-016)
- [ ] T021 [US1] Letter the coverage and density line beside the drawing in `src/main.js`, wherever the relief is drawn, since a smooth surface does not report its own sample density (FR-018i, FR-042)
- [ ] T022 [US1] Mark the stance on the plan in `src/main.js` using the armed square idiom in `--redline`, and move it when the desk moves (FR-021)
- [ ] T023 [US1] Create `src/relief.js` with `createRelief(host, { onPick })` returning `null` where no WebGL2 context can be had, per contracts/relief-module.md
- [ ] T024 [US1] Write the hand-rolled 4x4 matrix pair (orthographic projection and look-at) in `src/relief.js`, roughly 120 lines, adding no dependency (Principle V)
- [ ] T025 [US1] Write the vertex and fragment shaders in `src/relief.js`, shading by ink level only and **not** using `--cold` / `--warm`, which are reserved for signed physical quantities
- [ ] T026 [US1] Implement `relief.draw({ mesh, lattice, coverage, stance, view })` in `src/relief.js` as one indexed draw call, standing a post at every vertex flagged as a real sample (FR-018j)
- [ ] T027 [US1] Implement the constrained orbit in `src/relief.js`: stepped azimuth, clamped elevation, named viewpoints, no pan, no zoom, no free flight (FR-018d)
- [ ] T028 [US1] Make `setView` snap rather than animate in `src/relief.js`, so reduced motion loses no view (FR-018f), and add the keyboard and coarse-pointer routes to every camera move (FR-018e)
- [ ] T029 [US1] Handle `webglcontextlost` in `src/relief.js` and state it in place in `src/main.js` with the reason, keeping every reading on the plan and the schedule, never substituting a still image or an empty frame (FR-024)
- [ ] T030 [US1] Declare the relief's inference in place on the relief itself as well as on the plan in `src/main.js`, because a continuous surface is read as continuous data wherever it is drawn (FR-019)
- [ ] T031 [US1] Implement progressive measurement in `src/main.js`: a 5 x 5 coarse pass first, then densification to at most 11 x 11 reusing the coarse samples exactly (FR-009, research.md section 10)
- [ ] T032 [US1] Implement the refinement priority in `src/survey.js`, preferring steep ground and ground near the reader over ground already flat and well described (FR-010)
- [ ] T033 [US1] Implement standing on a measured point in `src/main.js`, routing through the same commit path a slider gesture uses so the drawing, quantities, bill, schedule, description, studies and link all follow (FR-032), and refusing any position that was not measured (FR-033)
- [ ] T034 [US1] Leave the address bar alone during the gesture and update it on release in `src/main.js`, by the rule every gesture on this sheet follows (FR-034)
- [ ] T035 [US1] Add the survey's entry point and its per-axis offers to the plan-key legends in `src/console.js`, refusing an axis with that wall's or that channel's own sentence rather than a generic one (FR-039, US1 scenario 7)
- [ ] T036 [US1] Gate survey work on the auto-solve control and on any pending link or station attach in `src/main.js`, saying which it is waiting on (FR-014), and pause on gesture, resuming on release (FR-013)
- [ ] T037 [US1] Write `specs/006-design-space-survey/verify/survey-ground.mjs` covering gate 2 of quickstart.md: every spot height traces to a run, 20 injected failures each appear as a gap with a reason and none is filled, and an all-failed survey states that it measured nothing (SC-010)

**Checkpoint**: US1 is fully functional. The MVP stops here and is worth shipping.

---

## Phase 4: User Story 2 - Read what is pulling the design (Priority: P1)

**Goal**: Rank all 90 sweepable controls by how far each moves the chosen reading at the
stance, so the reader knows which plane is worth cutting.

**Independent Test**: Ask for the pull, then sweep the top three controls as ordinary
studies and confirm the sweeps agree with the ranking.

- [ ] T038 [P] [US2] Create `src/pull.js` with the `PullEntry` entity from data-model.md, asserting that `inert` and `effect` are never both set and never both null
- [ ] T039 [US2] Implement `pullProbes(stance, patch, { quantity })` in `src/pull.js` using **one-sided** differences, so 90 controls cost at most 90 runs rather than 180 (research.md section 6)
- [ ] T040 [US2] Detect inert controls in `src/pull.js` by reading the document and the patch bay rather than `params`, returning them as entries carrying their reason and costing no run (FR-027)
- [ ] T041 [US2] Implement `rankPull` in `src/pull.js`, carrying `direction` as a word, `room`, and `atStop`, so a steep face with nowhere to go is never ranked as one with half its range in hand (FR-025, US2 scenario 2)
- [ ] T042 [US2] Report `direction: 'none'` only where the effect is exactly zero in `src/pull.js`, with no effect dismissed as small, since the engine is repeatable and there is no noise floor (FR-026)
- [ ] T043 [US2] Queue pull probes through the existing scheduler in `src/main.js` so a control already swept is a cache hit costing no engine run (FR-011, SC-011)
- [ ] T044 [US2] Letter which run kind the pull was read at in `src/main.js`, and report progress as it fills; reading at design-day cadence on an annual desk is admissible only if stated (research.md section 6, Principle IV)
- [ ] T045 [US2] Draw the pull in `src/main.js` using the signed meter bar idiom, with the direction stated in words beside every bar and not carried by hue alone (FR-025)
- [ ] T046 [US2] Implement `axesFrom(entries, a, b)` in `src/pull.js` and wire it in `src/main.js` so choosing two entries cuts the ground along them without retyping anything (FR-028)
- [ ] T047 [US2] Write `specs/006-design-space-survey/verify/pull-vs-sweeps.mjs` covering gate 6 of quickstart.md: on 10 test desks the top three agree with three independent full sweeps on 10 of 10, with no tolerance to appeal to (SC-005)

**Checkpoint**: Both P1 stories work. The loop the feature exists for is closed.

---

## Phase 5: User Story 8 - Read it with a thumb (Priority: P2)

**Goal**: The whole survey works at 390 px with a coarse pointer and no hover.

**Independent Test**: Drive the whole survey at 390 x 640 with a coarse pointer, with
hover unavailable, and again with the relief drawing disabled.

**Placed here deliberately**: this story constrains US1 and US2 rather than standing
alone, so it is verified and fixed while they are still fresh.

- [ ] T048 [US8] Read the new layout threshold back from the stylesheet in `src/main.js` as a custom property, never as a `matchMedia` string (FR-050)
- [ ] T049 [US8] Fold E-02 in `index.html` and `src/main.js` by the rules the console and the schedules already use, with folded content leaving the tab order via the `hidden` attribute and any table semantics dropped by `display: grid` restated (FR-051)
- [ ] T050 [US8] Confirm the relief draws at 390 px **by default and at full mesh**, not gated on viewport and not coarsened by it, in `src/relief.js` and `src/main.js` (FR-018k)
- [ ] T051 [US8] Give every gesture on the ground a coarse-pointer target and a keyboard route reaching the same designs in `src/main.js` and `src/relief.js` (FR-049)
- [ ] T052 [US8] Ensure every reading the survey letters is readable without hovering, without sideways scrolling and without opening anything, including the schedule of spot heights, in `index.html` and `src/main.js` (FR-048)
- [ ] T053 [US8] Add `data-head` to every schedule cell where it is built in `src/main.js`, so a folded figure keeps the head it was under as one string
- [ ] T054 [US8] Run gate 8 of quickstart.md by hand at 390 x 640 and in both themes, in monochrome and under forced colours, confirming measured, inferred and unsurveyed stay distinguishable (SC-007, SC-009)

**Checkpoint**: The survey is usable on the device it will most often be read on.

---

## Phase 6: User Story 7 - Send someone the survey (Priority: P2)

**Goal**: The link carries the survey, and the recipient re-measures to identical numbers.

**Independent Test**: Copy the link, open it in another browser, confirm the same axes,
reading, extent and stance, and identical measured values at identical positions.

- [ ] T055 [US7] Add `sv` to `RESERVED` in `src/permalink.js`, which already asserts the list against `ALL_KEYS` at module load so a future control key cannot collide with it
- [ ] T056 [US7] Add the `sv` codec branch **above** `readValue`'s numeric regex, beside `selector`, in `src/permalink.js`. Written inside the per-kind switch it is unreachable and every survey link is refused as "is not a number"
- [ ] T057 [US7] Re-serialise what the `sv` branch read in `src/permalink.js`, so two spellings of one survey do not key two identical solves and a default survey is not written into every minted link
- [ ] T058 [US7] Encode axes, readings and extent into `sv` in `src/permalink.js` without restating the stance, which the parameter encoding already carries
- [ ] T059 [US7] Refuse a link naming an unknown axis, reading or extent **whole**, with the reason on the sheet, never half loaded, in `src/permalink.js` and `src/main.js` (FR-046)
- [ ] T060 [US7] Keep the relief's viewpoint out of the link in `src/relief.js` and `src/main.js`, by the chase pin's rule that how the desk is being read is not what it is (FR-044a)
- [ ] T061 [US7] Confirm `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty in `src/permalink.js`, since no default, key name or range changes
- [ ] T062 [US7] Write `specs/006-design-space-survey/verify/link-roundtrip.mjs` covering gate 4 of quickstart.md, including the regression that a `sv` value which is syntactically a number is still read as a survey (SC-004)

**Checkpoint**: A survey is shareable and reproducible.

---

## Phase 7: User Story 3 - Let the design fall (Priority: P2)

**Goal**: Release the desk and let it walk downhill, one real run at a time, until it
settles in a hollow that says it is a hollow.

**Independent Test**: From a stance with headroom, let it fall and confirm every
intermediate desk is a real solved design, the final desk is no worse than the start, the
stop reason is stated, and the whole descent can be undone.

- [ ] T063 [US3] Implement `fallStep(survey, from)` in `src/survey.js`, returning a measured neighbour only and never an interpolated position (FR-033, FR-035)
- [ ] T064 [US3] Stop the descent with a stated reason when no measured neighbour improves, and detect the two-point oscillation rather than stepping forever, in `src/survey.js` (FR-035, edge case)
- [ ] T065 [US3] Drive the descent from `src/main.js`, moving the desk through the same commit path each step so E-01 follows every step (US3 scenario 1)
- [ ] T066 [US3] Make the descent stoppable at any moment, always leaving the desk on a completed design and never mid-run or on an interpolated position, in `src/main.js` (FR-036)
- [ ] T067 [US3] State that the hollow is local to the stance it started from, with what was measured around it and no claim of optimality, in `src/main.js` (FR-037)
- [ ] T068 [US3] State the descent as steps without animated flight where reduced motion is asked for, in `src/main.js` (FR-023, US3 scenario 4)
- [ ] T069 [US3] Refuse a descent while a link is attaching or a station is changing, with the reason, in `src/main.js` (edge case)

**Checkpoint**: The design can find its own level.

---

## Phase 8: User Story 4 - Find where two readings fall together (Priority: P2)

**Goal**: Carry a second reading on the same ground and name where both improve, without
inventing a combined score.

**Independent Test**: Survey with two readings, confirm the region where both improve is
identified from measured points only, both figures are lettered at each spot height, and
no combined score exists.

- [ ] T070 [US4] Allow a second quantity on `Survey` in `src/survey.js`, throwing at three, since two is the ceiling and a third has nowhere honest to be drawn
- [ ] T071 [US4] Implement `improvingRegion(survey, stance)` in `src/survey.js`, returning measured spot heights only and naming no optimum (FR-030)
- [ ] T072 [US4] Letter both readings at every measured point in `src/main.js`, encoding the second by more than colour alone (FR-031, US4 scenario 1)
- [ ] T073 [US4] State the trade in the two readings' own units where they disagree, offering no single figure ranking one against the other, in `src/main.js` (FR-031, US4 scenario 3)
- [ ] T074 [US4] Offer an unavailable second reading greyed with its reason and its fix, reusing `offersFor` from `src/study.js` so the sheet has one vocabulary of outcomes (FR-002, US4 scenario 4)

**Checkpoint**: Energy and comfort can be read together, honestly.

---

## Phase 9: User Story 5 - See which moves are free (Priority: P3)

**Goal**: State the exchange along the level line, in both controls' own units.

**Independent Test**: At a stance with enough surrounding measurement, read the free
exchange, then move the desk along it by hand and confirm the reading is unchanged within
the stated tolerance.

- [ ] T075 [US5] Implement `freeExchange(survey, stance)` in `src/survey.js`, returning the exchange in both controls' units together with the tolerance it holds to (FR-029)
- [ ] T076 [US5] Refuse the exchange with what would fix it where the surrounding lattice is too coarse, rather than computing off a coarse grid with false precision, in `src/survey.js` (FR-029, US5 scenario 2)
- [ ] T077 [US5] Say the reading does not move here rather than drawing a direction out of a flat ground, in `src/survey.js` (US5 scenario 3)
- [ ] T078 [US5] Letter the free exchange as a sentence in `src/main.js`, so "this much wall insulation buys this much glazing at constant demand" is on the page

**Checkpoint**: The moves that cost nothing are visible.

---

## Phase 10: User Story 6 - Keep the ground you have walked (Priority: P3)

**Goal**: The traverse, drawn and restorable.

**Independent Test**: Walk the desk across several positions, confirm each appears on the
traverse, restore an earlier one exactly, and confirm ground measured earlier is still
drawn as measured.

- [ ] T079 [US6] Add the `TraverseStop` entity to `src/survey.js` per data-model.md, holding frozen params, patch and the readings taken at that stop
- [ ] T080 [US6] Record a stop on every commit that moves the desk in `src/main.js`, in order (FR-038)
- [ ] T081 [US6] Draw the traverse on the plan in `src/main.js` as a chain of ghost marks joined by a hairline, with the current stop carrying the armed square
- [ ] T082 [US6] Restore a stop exactly, including the readings taken at it, from `src/main.js` (FR-038, US6 scenario 1)
- [ ] T083 [US6] Keep measurements that still apply when the stance moves, running only what is genuinely new, in `src/main.js` (US6 scenario 2)
- [ ] T084 [US6] Clear the traverse and the survey where the sample cache is cleared, on a station change, in `src/main.js` (FR-052, US6 scenario 3)

**Checkpoint**: Exploration is cumulative.

---

## Phase 11: Polish and Cross-Cutting Concerns

- [ ] T085 State a consistent, stated effect for "Set studies aside" and "Clear all studies" on the survey in `src/main.js`, and make the counts the head letters include whatever they claim to include (FR-054)
- [ ] T086 Update `NOTES` in `src/tour.js` and the `tour?.note(...)` call sites in `src/main.js` wherever the survey changes what a step teaches (FR-055)
- [ ] T087 Bump the general-notes storage key in `src/tour.js` from `shoebox-general-notes-v2`, so a returning reader gets the new sheet rather than stale ticks (FR-055)
- [ ] T088 [P] Record the survey's component patterns, any new token and the new layout threshold in `.interface-design/system.md`, in this same change (FR-056)
- [ ] T089 [P] Add the architecture section for the survey to `CLAUDE.md`, in house voice, recording the measurements and the failure modes that cost debugging (FR-056)
- [ ] T090 [P] Add the CHANGELOG entry to `CHANGELOG.md`, short and in house voice
- [ ] T091 Run `npm run build` and compare `dist/` against `specs/006-design-space-survey/verify/baseline-size.txt`, confirming the addition is inside SC-012's 60 KB ceiling
- [ ] T092 Run gate 3 of quickstart.md: `specs/006-design-space-survey/verify/idempotence.mjs`, confirming three applications are byte-identical and no await sees the document in overlay state
- [ ] T093 Run gate 7 of quickstart.md by driving the page: SC-001's 5 s and 30 s, SC-002's 10 percent live cadence with a survey filling, SC-011's zero-run reuse, and a study not starving behind a survey
- [ ] T094 Confirm no new `Output:Variable` was added anywhere in `src/model.js`, which is what discharges FR-017 outright

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.** T012 in particular is a stop-the-line gate
- **US1 (Phase 3)**: depends on Foundational. The MVP
- **US2 (Phase 4)**: depends on Foundational. Independent of US1's drawing, though it is far more useful beside it
- **US8 (Phase 5)**: depends on US1, since it constrains what US1 drew
- **US7 (Phase 6)**: depends on US1 for something to encode
- **US3 (Phase 7)**: depends on US1's `latticeOf` and on the commit path from T033
- **US4 (Phase 8)**: depends on US1
- **US5 (Phase 9)**: depends on US1's lattice being dense enough to be honest
- **US6 (Phase 10)**: depends on US1's commit path
- **Polish (Phase 11)**: depends on whichever stories shipped

### Within Each Story

Entities before the functions that build them, functions before the drawing that reads
them, drawing before the harness that checks it. The one inversion is T012, which runs
before any story because a failure there changes the design rather than the code.

### Parallel Opportunities

- T002 and T003 in Setup
- T006 and T007 in Foundational, both in `src/survey.js` but in disjoint sections; T004 and T005 are in `src/scheduler.js` and can run alongside either
- T013 and T014 in US1, different functions with no shared state
- T038 in US2 can start the moment Foundational is done, in parallel with all of US1
- T088, T089 and T090 in Polish, three different files
- **Across stories**: once Foundational is complete, US1 and US2 can be built in parallel by two people, since `src/pull.js` and `src/relief.js` do not touch each other

---

## Parallel Example: Foundational

```bash
# src/scheduler.js and src/survey.js are disjoint:
Task: "Change takeNext to round-robin in src/scheduler.js"          # T004
Task: "Create the frozen typed entities in src/survey.js"           # T006
Task: "Implement axisFor in src/survey.js"                          # T007
```

## Parallel Example: User Story 1

```bash
Task: "Implement latticeOf in src/survey.js"                        # T013
Task: "Implement contoursOf by marching squares in src/survey.js"   # T014
```

---

## Implementation Strategy

### MVP First

1. Phase 1: Setup
2. Phase 2: Foundational, **stopping at T012 if repeatability fails**
3. Phase 3: US1
4. **Stop and validate**: the ground stands, it is built only of runs, and standing on a point moves the desk
5. Ship it. US1 alone is the feature's whole argument

### Incremental Delivery

1. Setup and Foundational, giving a measurable ground with nothing drawn
2. US1, the MVP, and the first thing worth showing anyone
3. US2, which turns the survey from a picture into a loop the reader can run
4. US8 and US7, which make it readable on a phone and shareable
5. US3 and US4, the two readings that only an instant engine can offer
6. US5 and US6, which reward a reader who stays

### Notes

- `[P]` means different files and no dependency on incomplete work
- Commit after each task or logical group
- Every checkpoint is a place the work can stop and still be worth having
- The repository has no linter and no test runner: the harnesses are the gate, and the
  constitution treats several of them as mandatory
