---

description: "Task list for upgrading to idfkit-js v0.3.0-rc.3"
---

# Tasks: Upgrade to idfkit-js v0.3.0-rc.3

**Input**: Design documents from `/specs/007-upgrade-idfkit-js/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No test tasks below. This repository has no test runner and none is
introduced by this feature; verification is the throwaway Node harnesses, a real
EnergyPlus run, and driving the page, exactly as the constitution's quality gates
prescribe. The verification tasks are therefore ordinary tasks rather than a
separate test phase, and they are most of the work.

**Organization**: Tasks are grouped by user story. One caveat, stated because it
changes how the phases should be read: this feature's two P1 stories are not
separately shippable. A page that reproduces its building perfectly and cannot be
loaded has delivered nothing, and vice versa, so US1 and US2 ship together. They
are still separately *testable*, which is why they are separate phases: US1 is
answered entirely by harness and engine, with no browser involved, and it is the
go/no-go gate for the whole feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Every task names the exact file or command it concerns

## Path Conventions

Single project, vanilla ES modules, everything under the repository root:
`src/` for the page, `scripts/` for build-time tooling, `specs/007-upgrade-idfkit-js/verify/`
for this feature's committed harnesses. There is no `tests/` directory and none
is created.

---

## Phase 1: Setup (Baseline)

**Purpose**: Capture what the page does today. This phase is not optional
housekeeping: the baseline cannot be reconstructed after the pins move without
reinstalling the old libraries, and every gate in this feature is a comparison
against it.

- [ ] T001 Confirm the working tree is clean with `git status`, so any later difference is attributable to the upgrade rather than to work in progress
- [ ] T002 Install the currently declared pins with `npm install` and confirm `npm ls @idfkit/core @idfkit/schemas @idfkit/weather` reports 0.1.0 for all three
- [ ] T003 Capture the baseline spread with `SHOEBOX_ROOT="$PWD" OUT_DIR=/tmp/shoebox-base node specs/007-upgrade-idfkit-js/verify/build-positions.mjs`, confirming eight positions, none reporting `NOT IDEMPOTENT` or `THREW`, and every position reporting 69 types
- [ ] T004 Record the pre-upgrade cold-visit sizes: `npm run build`, then `ls -l public/schemas/types.json.gz public/schemas/manifest-26-1-0.json.gz` and `du -sk public/schemas`
- [ ] T005 Mint a permalink from the running page on the current release and save it, since FR-006 is the one requirement no harness can answer and it needs a link that predates the upgrade

**Checkpoint**: `/tmp/shoebox-base` holds eight IDFs and eight type listings, and a pre-upgrade link is saved. Nothing has changed yet.

---

## Phase 2: Foundational (The Crossing)

**Purpose**: Move the pins and take the rename. Blocks every user story, because
nothing can be verified until the page builds on the new libraries.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T006 Move the three pins in `package.json` to the exact string `0.3.0-rc.3` for `@idfkit/core`, `@idfkit/schemas` and `@idfkit/weather`, with no caret or tilde, leaving `@idfkit/engine` and `@idfkit/engine-assets` untouched
- [ ] T007 Run `npm install` to regenerate `package-lock.json` against the new pins
- [ ] T008 Verify exactly one copy of each package resolves with `npm ls @idfkit/core @idfkit/schemas @idfkit/weather`, confirming no nested duplicate of `@idfkit/schemas` beneath `@idfkit/core`, which is the failure that reports nothing at either end
- [ ] T009 Run `npm run build` and confirm it stops with `"IDFDocument" is not exported by ... imported by "src/model.js"`, which is the loud half of the crossing announcing itself
- [ ] T010 Rename the import and the construction in `src/model.js`: `IDFDocument` becomes `IdfDocument` on line 1 and at the `new IDFDocument(schema)` in `buildModel`
- [ ] T011 Run `npm run build` again and confirm it completes with no unresolved import and no missing subpath

**Checkpoint**: The page builds on `0.3.0-rc.3`. Every user story can now proceed.

---

## Phase 3: User Story 1 - A shared link still reproduces its building (Priority: P1) 🎯 MVP

**Goal**: Prove the building did not move. This is the whole promise of the page
and the gate the feature turns on.

**Independent Test**: Entirely answered by the harness and a real EnergyPlus run.
No browser, no interface work, nothing from any other story.

- [ ] T012 [US1] Write the new spread with `SHOEBOX_ROOT="$PWD" OUT_DIR=/tmp/shoebox-new node specs/007-upgrade-idfkit-js/verify/build-positions.mjs`, confirming no position reports `NOT IDEMPOTENT` or `THREW` and that type counts have fallen from a uniform 69 to between 28 and 45
- [ ] T013 [US1] Compare the two spreads with `node specs/007-upgrade-idfkit-js/verify/compare.mjs /tmp/shoebox-base /tmp/shoebox-new` and confirm every position reports `content same`. Any `CONTENT DIFFERS` is a failure and must be understood before anything else proceeds
- [ ] T014 [US1] Confirm the order differences are confined to `07-everything-in`, and that the seven other positions report `order same`. A reordering at a position Phase 0 did not predict needs its own explanation before it is accepted
- [ ] T015 [US1] Run the reordered position both ways through EnergyPlus 26.1.0 into `/tmp/run-base` and `/tmp/run-new`, and confirm both exit 0
- [ ] T016 [US1] Assert the runs agree: `cmp` silent on both `eplusout.eso` and `eplusout.mtr`, and the same warning and severe counts in the last line of each `eplusout.err`. This is FR-003a, and it is what makes a reordering harmless rather than merely unlikely
- [ ] T017 [P] [US1] Run every IDF in `/tmp/shoebox-new` through schema validation and the integrity check, per the constitution's third quality gate
- [ ] T018 [P] [US1] Grep each new run's `eplusout.err` for "requested but not generated" and confirm no output variable the page asks for has gone missing between library versions

**Checkpoint**: The model demonstrably did not move. If this phase fails, the feature stops here rather than proceeding to make the page work.

---

## Phase 4: User Story 2 - The page still runs, end to end (Priority: P1)

**Goal**: Every path a reader takes still works on the new libraries.

**Independent Test**: Start the page and drive the whole desk. The build failure
mode is loud and already caught in Phase 2; what this phase covers is the paths a
bundler cannot check, above all the weather calls.

- [ ] T019 [US2] Start the page with `npm run dev`, confirm it loads, and confirm the axonometric and the plate letter from the first solve
- [ ] T020 [US2] Drag a sheet slider, confirm the plate re-letters continuously, and measure that a design day still lands in roughly 50 ms once the engine is warm. If it does not, the 140 KB growth in the schema type store is the first suspect
- [ ] T021 [US2] Open the console, patch a channel in and out, and confirm the strip states and the drawing follow each other
- [ ] T022 [US2] Attach a weather station, which is the only path exercising `loadStationIndex` and `fetchWeatherFiles` and the only one crossing the `/onebuilding` proxy
- [ ] T023 [US2] Run a year, confirm it lands in roughly 0.7 s, and confirm the bill, the results schedule and the scoreboard all letter
- [ ] T024 [US2] Open a study on any swept control and let it densify, confirming the pool still solves samples off the live sheet
- [ ] T025 [US2] Copy the link, open it in a fresh tab, and confirm the desk comes back
- [ ] T026 [US2] Open the pre-upgrade link saved in T005 and confirm it is accepted whole and resolves to the same desk. This is FR-006 and no harness covers it

**Checkpoint**: Both P1 stories hold. The feature is now shippable to the development channel.

---

## Phase 5: User Story 3 - The sheet says which toolkit wrote the file (Priority: P2)

**Goal**: The version stamped into every file the page hands out is the one that
was actually bundled.

**Independent Test**: Read the header of a downloaded IDF and the Toolkit row of
a run bundle manifest.

- [ ] T027 [US3] Download a run bundle from the running page and confirm the IDF header line reads `@idfkit/core 0.3.0-rc.3`, not a range and not the previous version
- [ ] T028 [US3] Confirm the same version appears in the bundle manifest's Toolkit row, which `src/bundle.js` letters from `src/version.js`
- [ ] T029 [US3] Confirm the em dash path still holds by checking that `scripts/toolkit.mjs` returns `null` where the installed version cannot be read and that nothing substitutes a default

**Checkpoint**: The one reader-visible change in the feature is correct and honest.

---

## Phase 6: User Story 4 - The written record matches the library (Priority: P3)

**Goal**: The repository's own prose names the type the library now uses, and the
one passage the upgrade actually falsifies is corrected rather than left standing.

**Independent Test**: Search the repository for the superseded name and find it
only where history is recorded.

- [ ] T030 [P] [US4] Rename the type in the two prose comments under `src/`: the module note in `src/controls.js` and the governing rule in `src/describe.js`
- [ ] T031 [P] [US4] Rename the type in the runnable example in `README.md`, which constructs it by name and would no longer run as written
- [ ] T032 [P] [US4] Rename the type in the governing rule at the head of `CLAUDE.md`
- [ ] T033 [US4] Rewrite the `holds()` doc comment in `src/model.js` and the comment at its call site in `applyAir`. The prose describes a read that mutated the document, which the new libraries no longer do, so it must now say what is true: the hazard is gone, the guard is kept because it still answers what it claims and now costs nothing, and the object order it used to protect has changed as a result
- [ ] T034 [US4] Rewrite the "Reading an absent type registers it" section of `CLAUDE.md`. It is the one passage in this repository the upgrade makes false, and it must record what replaced it, including that the reordering was measured and shown inert to the engine
- [ ] T035 [US4] Update Principle III in `.specify/memory/constitution.md` to name the type correctly, bump the version line to 1.0.1 with today's amended date, and add the Sync Impact Report entry. This is a PATCH under the document's own policy: a correction that changes no rule
- [ ] T036 [US4] Confirm nothing was missed with `grep -rn "IDFDocument" --include="*.js" --include="*.md" . | grep -v node_modules | grep -v "^./specs/" | grep -v CHANGELOG.md`, expecting no output

**Checkpoint**: The record and the library agree.

---

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T037 Measure the cold visit after the upgrade with `npm run build`, then `ls -l public/schemas/types.json.gz public/schemas/docs.json.gz` and `du -sk public/schemas`, confirming the fetched growth is about 140 KB and within the 200 KB budget in FR-010, and that the 175 KB prose pool is staged but never fetched
- [ ] T038 Confirm the general notes are correctly left alone: `src/tour.js` unchanged and its storage key not bumped, because no feature was added, no control renamed and no step's subject moved. Confirm this deliberately rather than by omission, since quality gate 6 asks the question of every change
- [ ] T039 Add the changelog entry to `CHANGELOG.md`, short and in the house voice, naming the version move and the two differences it makes on purpose
- [ ] T040 Re-read the Constitution Check table in `plan.md` against the finished work and confirm all seven principles still pass, in particular that no runtime dependency was added and no reading changed its source
- [ ] T041 Walk `specs/007-upgrade-idfkit-js/quickstart.md` end to end on a clean checkout, confirming every gate reports what the document says it will

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, and must come first. T003 in particular cannot be recovered once the pins move.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every user story.
- **US1 (Phase 3)**: Depends on Foundational. Depends on nothing else and blocks nothing, but a failure here should stop the feature.
- **US2 (Phase 4)**: Depends on Foundational. Independent of US1 in mechanism, though shipping without both is meaningless.
- **US3 (Phase 5)**: Depends on Foundational, and in practice on US2, since T027 and T028 need a run bundle off a running page.
- **US4 (Phase 6)**: Depends on Foundational only. T033 and T034 additionally depend on US1, because they record a measurement US1 produces.
- **Polish (Phase 7)**: Depends on everything above.

### Within Each User Story

- US1 runs strictly in order: the spread, then the comparison, then the engine check on whatever the comparison flagged.
- US2 runs in order because each step leaves the desk in the state the next one needs.
- US4's renames are independent of each other; its two rewrites are not, since both describe the same finding.

### Parallel Opportunities

- T017 and T018 touch different outputs of the same runs and can go together.
- T030, T031 and T032 are three different files with no shared content and can go together.
- T033 and T034 must not be parallelised with each other: they are two statements of one fact and drift if written apart.
- The four user story phases can be worked in parallel by different people once Phase 2 is done, with the two dependencies noted above.

---

## Parallel Example: User Story 4

```bash
# The three plain renames, together:
Task: "Rename the type in the two prose comments in src/controls.js and src/describe.js"
Task: "Rename the type in the runnable example in README.md"
Task: "Rename the type in the governing rule at the head of CLAUDE.md"

# Then, and only then, the two rewrites, in sequence:
Task: "Rewrite the holds() doc comment and its call site in src/model.js"
Task: "Rewrite the 'Reading an absent type registers it' section of CLAUDE.md"
```

---

## Implementation Strategy

### The gate comes first

1. Complete Phase 1. The baseline is unrecoverable afterwards.
2. Complete Phase 2. The build either works or names the line.
3. Complete Phase 3 (US1). **Stop and read the result.** If any position reports
   `CONTENT DIFFERS`, or if a reordering appears somewhere Phase 0 did not
   predict, the feature stops and the difference is understood before anything
   else is done. This is not a checkpoint to pass through; it is the question the
   feature exists to answer.

### Then the rest

4. Complete Phase 4 (US2). At this point both P1 stories hold and the work is
   shippable to the development channel, which is where every non-tagged build is
   served and where the upgrade should be exercised before any tag is cut.
5. Complete Phase 5 (US3) and Phase 6 (US4), in either order.
6. Complete Phase 7.

### What "MVP" means here

US1 is the MVP in the sense that matters: it is the smallest thing that answers
whether this upgrade is safe, and it is fully testable on its own. It is not
deployable on its own, and the two P1 phases are one release. Saying otherwise
would be the task list pretending to an independence the feature does not have.

---

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- Commit after each phase rather than each task; the phases are the meaningful
  units here and several tasks are single-line changes.
- The harnesses are committed under `specs/007-upgrade-idfkit-js/verify/` and are
  run from there, which is a deliberate departure from this repository's usual
  arrangement. The reasoning is in `quickstart.md`.
- Nothing in this list adopts the new weather reader, the new climate-zone
  filter, or a newer engine. Those are out of scope by the specification and
  research Decision 6 records why.
