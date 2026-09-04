# Tasks: Choose what a sweep plots

**Input**: Design documents from `/specs/004-choose-sweep-metric/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: This repository has no test runner. The specification requires executable validation, so the tasks use throwaway Node harnesses under `/tmp/idfkit-shoebox-004/` and browser checks from `quickstart.md`.

**Organization**: Tasks are grouped by user story. Shared declarations, reporting, and cache infrastructure are foundational because every story depends on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes different files.
- **[Story]**: Maps the task to User Story 1, 2, or 3.
- Every task names the repository or scratch file it changes or validates.

## Phase 1: Setup

**Purpose**: Settle the interface pattern and measure the one unresolved performance cost before implementation.

- [X] T001 Run `/interface-design:init` for the quantity chooser and record its folded, keyboard-reachable, total-offer, unavailable-reason, waiting-state, 390 px, and 600 px contract in `.interface-design/system.md`
- [X] T002 [P] Measure `geometryFacts()` while a sweep overlay is applied with `/tmp/idfkit-shoebox-004/geometry-facts.mjs`, confirm the land-time path can remain within the 1.8 to 2.6 ms reader budget, and record the result in `specs/004-choose-sweep-metric/research.md`

**Checkpoint**: The chooser has an approved component pattern and eager overlay measurement has a recorded budget.

---

## Phase 2: Foundational

**Purpose**: Build the declarations, reporting contract, and cache behavior required by every user story.

**Critical**: No user story work begins until this phase passes its harness.

- [X] T003 Define frozen `RunContents`, `Quantity`, and `Offer` classes; canonical union and `answers()` operations; the quantity roster; `QUANTITY_BY_ID`; total `offersFor()` output; Category II TM59 a/b semantics; and all module-load invariants in `src/study.js`
- [X] T004 [P] Refactor `applyModel()` and `syncReporting()` to consume canonical `RunContents`, emit variables and monthly meters in stable order, retain the named full-sheet case, reject unknown contents, and preserve clear-and-rewrite behavior in `src/model.js`
- [X] T005 [P] Refactor `makeStudyJob()` and `createStudyScheduler()` so jobs remain keyed by control, carry needed and actual `RunContents` instead of a metric identity, use desk shape plus run kind plus canonical carried contents as exact sample identity, find deterministic least-superset cache entries, share pending exact identities, and retain readings plus meter basis in `src/scheduler.js`
- [X] T006 Build the typed landed-run view once per successful sample, resolve every quantity context from the sample desk and station, measure overlay floor area unconditionally, read every quantity answered by carried contents, retain only readings and physical meter totals, and discard raw results in `src/main.js`
- [X] T007 Create and run `/tmp/idfkit-shoebox-004/foundation.mjs` against `src/study.js`, `src/model.js`, and `src/scheduler.js` to prove declaration failures name the quantity, all offers always remain present, compatible lookup chooses the deterministic least superset, gaps remain null rather than zero, and the 400-entry cache stores no raw or parsed run

**Checkpoint**: Quantity declarations load, reporting serializes canonically, and the scheduler can reuse compatible sample facts without retaining runs.

---

## Phase 3: User Story 1 - Pick what the curve measures (Priority: P1)

**Goal**: Let the reader choose one desk-wide quantity, redraw every open study together, reuse compatible samples, and share the chosen studies.

**Independent Test**: Start studies on two controls, change the quantity and change it back, and verify both cards name and draw the selected quantity; compatible changes run nothing, missing samples queue only under auto-solve, and unavailable offers remain visible with a reason and fix.

### Implementation for User Story 1

- [X] T008 [US1] Add nullable desk-wide quantity state, explicit quantity-change coordination, compatible redraw across every open control-keyed study, coarse-first shortfall queueing under the auto-solve gate, visible waiting transitions, and meter-basis repricing for EUI, cost, and carbon in `src/main.js`
- [X] T009 [P] [US1] Extend the study-card API to render the shared quantity label, unit, precision, all offers, unavailable reason and fix, one chooser action that updates all cards, and a waiting state that never relabels an old curve in `src/console.js`
- [X] T010 [US1] Implement the approved chooser, offer, selected, unavailable, and waiting styles with native focus semantics, no hover-only content, no new hue, and stable layouts at 390 px width and 600 px height in `index.html`
- [X] T011 [P] [US1] Add `sty` to `RESERVED` and implement strict encode/decode for `sty=<quantityId>[.<controlKey>[,<controlKey>]*]`, including canonical control order and whole-link refusal for unknown, unsweepable, duplicate, malformed, or repeated values in `src/permalink.js`
- [X] T012 [US1] Include initialized quantity and open study controls in `schemeHash()` and all `encodeState()` calls, restore quantity-only and quantity-plus-study links during boot, and re-sweep decoded studies through the existing auto-solve gate in `src/main.js`
- [X] T013 [P] [US1] Create and run DOM-free `/tmp/idfkit-shoebox-004/reuse.mjs` against the injected effects in `src/scheduler.js` with a counting fake pool to prove cost-to-carbon and TM59 a-to-b changes add zero runs, only incompatible samples re-run, auto-solve off adds zero runs, and cancelled sharers cannot corrupt cached entries
- [X] T014 [P] [US1] Create and run `/tmp/idfkit-shoebox-004/permalink.mjs` against `src/permalink.js` to round-trip omitted, quantity-only, and multi-study `sty` values; prove canonical ordering; refuse every malformed class; and compare pre-feature fragments without `sty` against their previous decoded state
- [X] T015 [US1] Run `npm run dev` and drive the User Story 1 scenarios in `specs/004-choose-sweep-metric/quickstart.md` against `src/main.js`, `src/console.js`, and `index.html`, including two simultaneous studies, compatible and incompatible choices, unavailable offers, auto-solve off, keyboard operation, 390 px width, 600 px height, light mode, and dark mode

**Checkpoint**: User Story 1 is functional and independently demonstrable, including link round-trip and cache reuse.

---

## Phase 4: User Story 2 - Never change the reading under the reader (Priority: P1)

**Goal**: Preserve the reader's chosen quantity across every desk change and use the old inference only once as an opening guess.

**Independent Test**: Start one study, then engage System, select a room type, press Chase, attach weather, move controls, clear all studies, and start another; the quantity never changes or re-infers.

### Implementation for User Story 2

- [X] T016 [US2] Move the legacy opening rule beside `QUANTITIES` as one declared `openingQuantity()` function, preserve its current three outcomes, and expose its plain-language basis without making it mutable state in `src/study.js`
- [X] T017 [US2] Delete `studyMetric()` and all enqueue/refresh inference paths, initialize the desk quantity only when the first study starts or `sty` decodes, keep it through later studies and `clearAllStudies()`, verify no per-job or per-study metric identity remains after T005, and update the governing comments in `src/main.js` and `src/scheduler.js`
- [X] T018 [US2] Create and run `/tmp/idfkit-shoebox-004/frozen-choice.mjs`, then drive the corresponding browser flow in `specs/004-choose-sweep-metric/quickstart.md`, proving System, room type, Chase, station, controls, refresh, densify, cancellation, and clearing studies never change the initialized quantity in `src/main.js`

**Checkpoint**: Both P1 stories pass independently, and no desk action can silently substitute a quantity.

---

## Phase 5: User Story 3 - Do not pay for what is not being drawn (Priority: P2)

**Goal**: Keep each sample on the chosen quantity's lean reporting contents and preserve exact model restoration.

**Independent Test**: Sweep the same control across every quantity choice and verify each sample requests only its declared contents, never adds a per-surface output, remains within the baseline engine-time spread, and restores the live IDF byte for byte.

### Implementation for User Story 3

- [X] T019 [US3] Audit and harden `buildSample()` so it passes only the chosen quantity's `RunContents`, records the exact carried set, measures all reader context while the overlay is present, restores `applyModel(model, params, patching())` and `setAnnual()` in `finally`, and never substitutes the full-sheet reporting apparatus in `src/main.js` and `src/model.js`
- [X] T020 [P] [US3] Create and run `/tmp/idfkit-shoebox-004/reporting.mjs` against `src/model.js` to compare different declaration and union orders, apply each contents set three times, assert byte-identical IDFs and exact restore, inspect emitted `Output:*` objects, and reject any per-surface request
- [X] T021 [P] [US3] Create and run `/tmp/idfkit-shoebox-004/performance.mjs` across every declaration in `src/study.js`, compare engine and parse time with the 417 to 446 ms and 7.6 ms baselines, confirm land-time reading stays within the measured budget, and record results or any justified budget change in `specs/004-choose-sweep-metric/research.md`

**Checkpoint**: All three stories pass, sample reporting remains lean, and live-model restoration is byte exact.

---

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Verify the whole feature against repository gates and ensure adjacent user-facing contracts remain accurate.

- [X] T022 [P] Audit the study chooser and cards against `.interface-design/system.md` and the constitution using `index.html` and `src/console.js`, including keyboard reachability, visible focus, screen-reader names, forced colors, 390 px width, 600 px height, dark mode, no overlap, and no horizontal scrolling
- [X] T023 [P] Re-read `NOTES` and its event call sites, confirm no note names or teaches studies, sweeps, curves, or quantities, and leave `src/tour.js` plus its storage key unchanged unless that factual audit fails; record any required correction in `specs/004-choose-sweep-metric/research.md`
- [X] T024 Run every scenario in `specs/004-choose-sweep-metric/quickstart.md`, run `npm run build`, inspect the final diff for unintended changes to `src/readings.js`, `src/tm59.js`, `src/bill.js`, `src/schemes.js`, or `src/tour.js`, and confirm the quantity roster, no-new-dependency rule, link compatibility, engine-run counts, and performance measurements all pass

**Checkpoint**: The feature is ready for review with all quickstart and build checks passing.

---

## Dependencies and Execution Order

### Phase Dependencies

| Phase | Depends on | Blocks |
|---|---|---|
| Phase 1: Setup | None | Phase 2 and chooser UI |
| Phase 2: Foundational | Phase 1 | All user stories |
| Phase 3: User Story 1 | Phase 2 | User Stories 2 and 3 |
| Phase 4: User Story 2 | Phase 3 | Final validation |
| Phase 5: User Story 3 | Phase 3 | Final validation |
| Phase 6: Polish | User Stories 1 and 2, plus User Story 3 when included | Review |

### User Story Dependencies

| Story | Dependency | Independent completion criterion |
|---|---|---|
| User Story 1 (P1) | Foundational declarations, reporting, and cache | Two controls change quantity together; reuse, waiting, offers, repricing, and links pass |
| User Story 2 (P1) | User Story 1 desk quantity state | Every former inference trigger leaves the initialized quantity unchanged |
| User Story 3 (P2) | User Story 1 sample path | Every quantity choice uses lean contents and restores the live model exactly |

User Stories 2 and 3 may proceed in parallel after User Story 1. Both P1 stories belong in the MVP because User Story 2 prevents the silent substitution that motivated the feature.

### Within Each Phase

1. Complete declarations before consumers.
2. Run the focused scratch harness after each implementation slice.
3. Implement DOM structure before CSS that depends on it.
4. Implement codec behavior before boot wiring.
5. Complete both P1 stories before treating the chooser as an MVP.
6. Run the complete quickstart only after focused checks pass.

## Parallel Opportunities

### Foundational

After T003, T004 and T005 can run in parallel because they change `src/model.js` and `src/scheduler.js`. T006 integrates both results in `src/main.js`.

### User Story 1

After Phase 2, T009 and T011 can proceed in parallel in `src/console.js` and `src/permalink.js` while T008 establishes the coordinator in `src/main.js`. After integration, T013 and T014 validate scheduler and codec behavior in parallel.

### User Story 2

T016 precedes T017 because `src/main.js` must consume the declared opening rule before deleting its local inference. T018 validates the completed lifecycle.

### User Story 3

After T019, T020 and T021 can run in parallel because canonical-output validation and performance measurement use separate scratch harnesses.

## Parallel Example: User Story 1

```text
Task T009: Extend the study-card and chooser API in src/console.js
Task T011: Implement the sty fragment grammar in src/permalink.js

After integration:
Task T013: Validate compatible reuse and repricing with /tmp/idfkit-shoebox-004/reuse.mjs
Task T014: Validate link round-trip and refusals with /tmp/idfkit-shoebox-004/permalink.mjs
```

## Parallel Example: User Story 2

```text
Task T016: Declare the one-time opening rule in src/study.js
Task T017: Consume it and remove repeated inference in src/main.js and src/scheduler.js
Task T018: Validate the frozen choice with /tmp/idfkit-shoebox-004/frozen-choice.mjs
```

## Parallel Example: User Story 3

```text
After T019:
Task T020: Validate canonical reporting with /tmp/idfkit-shoebox-004/reporting.mjs
Task T021: Measure all quantity profiles with /tmp/idfkit-shoebox-004/performance.mjs
```

## Implementation Strategy

### MVP: Both P1 Stories

1. Complete Setup and Foundational tasks T001 through T007.
2. Complete User Story 1 tasks T008 through T015.
3. Complete User Story 2 tasks T016 through T018.
4. Stop and run the independent P1 checks before beginning performance hardening.

### Incremental Delivery

1. Foundation: quantity declarations, canonical reporting, compatible cache, and land-time extraction.
2. User Story 1: explicit desk-wide choice, total offer list, waiting behavior, repricing, and shareable studies.
3. User Story 2: one-time opening guess and complete removal of live inference.
4. User Story 3: lean-profile and byte-exact restoration proof.
5. Polish: accessibility, responsive layouts, quickstart, and production build.

## Notes

- Scratch harnesses under `/tmp/idfkit-shoebox-004/` are throwaway and must not be committed.
- `[P]` tasks touch different files or independent scratch harnesses after their prerequisites.
- No task adds a runtime dependency or a permanent test framework.
- `src/readings.js`, `src/tm59.js`, `src/bill.js`, `src/schemes.js`, and `src/tour.js` are read-only unless a focused validation proves the plan's stated reuse or unchanged-onboarding assumption false.
- Stop at any checkpoint to validate the corresponding story independently.

## Phase 7: Convergence

- [X] T025 CRITICAL isolate `src/scheduler.js` pending samples by cache epoch so `clearAll()` prevents an outgoing-climate promise from being shared with a same-key incoming-climate job or deleting its pending entry, and prove the station clear/requeue race with a counting fake pool per Constitution II–IV and FR-019 (contradicts)
- [X] T026 CRITICAL align EUI, cost, and carbon studies in `src/study.js`, `src/model.js`, `src/main.js`, and `src/console.js` with the existing bill's actual producible building/site meter set, partial-rate refusal, currency identity and formatting, while preserving meter-basis repricing with zero engine runs per Constitution III–IV and FR-008/FR-019/FR-020 (contradicts)
- [X] T027 Render the declared one-time opening basis from `OPENING_QUANTITY_BASIS` visibly on the initial study card, accessible without hover at desktop and mobile widths, and keep it out of mutable desk state per FR-006 (missing)
- [X] T028 Resume current-shape waiting studies cache-first and coarse-first when auto-solve is re-enabled, without restarting compatible samples or stopped studies, and add a fake-scheduler plus browser check for the off-change-on lifecycle per FR-004a and US1/AC6 (partial)
- [X] T029 Extend quantity offers and per-study availability to model whole-year calendar and published/assumed pricing prerequisites before queueing, so EUI and other annual or priced choices cannot be offered and then land entirely null or partial; show the specific reason and fix per FR-009 and SC-004 (partial)
- [X] T030 Add and exercise a module-load invariant in `src/study.js` proving every declared `RunContents` need is satisfiable by at least one reachable desk, with failures naming the quantity and unreachable requirement per T003, SC-008, and Constitution IV (partial)
- [X] T031 Run an apples-to-apples interleaved before/after benchmark for every final quantity profile on the same annual desk, separate engine time from startup and parse time, and reduce any per-sample engine regression beyond the lean baseline per SC-006 and plan: performance goals (partial)
