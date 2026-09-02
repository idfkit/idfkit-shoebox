---
description: "Task list for 001-afn-natural-ventilation"
---

# Tasks: Natural ventilation by pressure network

**Input**: Design documents from `/specs/001-afn-natural-ventilation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 to US5)
- Every task names the exact file it changes

## On verification, and why there are no "test" tasks

This repository has **no test runner and no linter**, and none is added. The
constitution's Development Workflow makes throwaway Node harnesses under
`.harness/` the quality gate instead, and it makes them mandatory rather than
optional: a model change is verified outside the browser first, idempotence is
asserted, every IDF is validated and run, codec changes are round-tripped, and
only then is the page driven.

So the verification tasks below are not optional TDD. They are the gate the
constitution requires, they are written against the numbers in
[quickstart.md](./quickstart.md), and a story is not done until its own gate
passes.

## On parallelism, and why there is little of it

This feature lands in six files that already exist, and two of them
(`src/controls.js` at 3,738 lines and `src/model.js` at 2,528) take most of the
work. Tasks touching the same file cannot run in parallel however independent
they look, so `[P]` is sparse here and that is the honest answer rather than an
oversight. The real parallelism is across stories once Phase 2 is done.

## Path conventions

Single project. Source at `src/` in the repository root, harnesses at
`.harness/` (gitignored), design documents at
`specs/001-afn-natural-ventilation/`.

---

## Phase 1: Setup

**Purpose**: Settle the one open question before it costs work, and stand up the
means of measurement.

- [X] T001 Fold the plan's corrections into `specs/001-afn-natural-ventilation/spec.md`: revise finding 7's latency figures to the measured 0.05 s to 0.07 s design day and 3.3x annual, and add two edge cases with their answers, namely the no-exterior-surface get-input fatal (answered by the `requires` gate) and the EMS actuator that replaces the opening rule when it is forced rather than released. **FR-012 stands as written**: the wind bound is reachable through EMS and is built in Phase 6.
- [X] T002 [P] Write the harness scaffold in `.harness/afn.mjs`: a `desk({ params, bypass })` builder over `buildModel`/`applyModel`/`setAnnual`, a `run(name, idf, { annual })` that shells EnergyPlus 26.1.0 and returns exit code, `.end`, `.err` and parsed `.eso`, and a `stats(eso, pattern)` reader. The Phase 0 probes in `.harness/afn-probe2.mjs` and `.harness/afn-crack.mjs` are the working reference and carry a complete AFN model already.
- [X] T003 [P] Smoke the scaffold in `.harness/afn.mjs` against the unmodified desk: `npm run predev` has staged the assets, `localBundle().load('26.1.0')` resolves, and the stock annual run returns exit 0 with 0 warnings in about 581 ms. Any drift from that baseline invalidates every gate downstream.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The spine every story hangs on: the choice itself, the sweep that
makes the two models exclusive, and the constants the arithmetic is written in.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add the `airModel` `Selector` to the `air` channel in `src/controls.js`, defaulting to `'Scheduled'`, with the two options and the `note` carrying FR-008a: the network cannot open a rooflight, which is the **only** capability it loses, so the two models differ in what they can represent and not only in how they compute. It does have a wind bound (T048), and the note must not say otherwise. Copy is in [contracts/air-channel.md](./contracts/air-channel.md).
- [X] T005 Add the `scheduled` and `network` predicates beside the existing `layered` and `glazed` helpers in `src/controls.js`, and add an `openable` key name to each entry of `WALL_FACES` beside its existing `wwr` and `overhang`.
- [X] T006 Declare the network constants in `src/model.js`: `AIR_DENSITY = 1.2041`, `REF_DELTA_P = 4`, `FLOW_EXPONENT = 0.65`, `REF_TEMP_C = 20`, and the object names `REF_CONDITIONS`, `CRACK`, `OPENING`, `AFN_SETPOINT`. Each carries a comment saying why it is that number, per the house style.
- [X] T007 Restructure `applyAir` in `src/model.js`: declare the frozen `AIR_TYPES` list of all eight types, clear every one on each apply, drop the setpoint schedule by name rather than clearing `Schedule:Compact` by type, then dispatch to `applyScheduled` (the existing body, moved unchanged) or to `applyNetwork` (a stub for now). Contract in [contracts/network-model.md](./contracts/network-model.md).
- [X] T008 Verify the split in `.harness/afn.mjs`: with `applyNetwork` still a stub, `applyModel` three times under `'Scheduled'` produces byte-identical output, and that output is byte-identical to the current `main` branch's. The restructure must move no scheduled object.

**Checkpoint**: the choice exists, both models are exclusive by construction, and the scheduled desk is provably unchanged.

---

## Phase 3: User Story 1 - Compute the flow instead of asserting it (Priority: P1) 🎯 MVP

**Goal**: A reader switches the Air strip to the pressure network, states an
envelope leakiness, and the strip letters the air change rate the weather
actually produced.

**Independent Test**: Engage the network on the stock desk with a weather file
attached; the run completes without severe errors and the strip letters a
computed rate that varies across the year and differs from any figure typed.
No other story need exist: this slice has no openings at all, which
[research.md](./research.md) measured as a valid network leaking through its
cracks.

### Controls

- [X] T009 [US1] Add the `envLeak` `Scale` to the `air` channel in `src/controls.js`: 0 to 3 ACH, step 0.01, `zero: 'Sealed'`, `needs: network`, and **`landmarks: INFILTRATION` reused rather than copied**, which is legal because the range and step match `infiltration`'s exactly and so all four `readLandmarks` rules already hold.
- [X] T010 [US1] Add the `requires` gate to the `air` channel in `src/controls.js`: `(p, on, off) => p.airModel !== 'Network' || (!off('fabric') && SURFACE_FACES.some(({ face }) => opensOut(p, face)))`, with the reason sentence. The predicate reads `off` and not `on` because Fabric is declared at 07 to Air's 09; the comment must record the measured fatal it prevents.
- [X] T011 [US1] Add the `Readout` to the `air` channel in `src/controls.js`, labelled `As run`, with the note distinguishing what the envelope was specified at from what this climate did with it.

### The applier

- [X] T012 [US1] Add `barometric(z)`, `longAxis(facts)` and `widthRatio(facts)` to `src/model.js`. `longAxis` and `widthRatio` read `geometryFacts(doc).faces` and **never `params.width` / `params.depth`**, because `buildSample` hands the applier a sweep overlay and a fact off live parameters would describe the desk instead of the sample.
- [X] T013 [US1] Add `crackCoefficient(ach, volume)` to `src/model.js`, with the comment recording that `air_mass_flow_coefficient_at_reference_conditions` is per **surface** and not per square metre, and that the per-area mistake runs clean, validates clean and is wrong by about eighty-fold.
- [X] T014 [US1] In `applyNetwork` in `src/model.js`, write `AirflowNetwork:SimulationControl` named `Network`, with `MultizoneWithoutDistribution`, `SurfaceAverageCalculation`, `OpeningHeight`, `LowRise`, and the two derived geometry fields from T012.
- [X] T015 [US1] In `applyNetwork` in `src/model.js`, write `AirflowNetwork:MultiZone:Zone` with `ventilation_control_mode: 'NoVent'` hardcoded for this story. US4 replaces the literal with the control; a network with no openings has no rule to obey and this is the honest intermediate state, not a placeholder.
- [X] T016 [US1] In `applyNetwork` in `src/model.js`, write `AirflowNetwork:MultiZone:ReferenceCrackConditions` with the barometric pressure derived from `must(doc, 'Site:Location').elevation`. FR-009. The comment carries the measured warning this removes: `Pressure = 101325 differs by more than 10% from Standard Barometric Pressure = 81198`.
- [X] T017 [US1] In `applyNetwork` in `src/model.js`, write one `AirflowNetwork:MultiZone:Surface:Crack` per surface for which `opensOutdoors(doc, name)` holds, its coefficient the whole-envelope figure split by that surface's own area, plus one `AirflowNetwork:MultiZone:Surface` linking each at factor 1. Throw naming the missing thing if the exterior list is empty, since `requires` has already refused that case.
- [X] T018 [US1] In `syncReporting` in `src/model.js`, add `AFN Zone Infiltration Air Change Rate` and `AFN Zone Ventilation Air Change Rate` as hourly zone-level requests to the `'sheet'` profile only, gated on the Air channel being engaged **and** the network being in force, the way the balance-rail terms are already gated. The lean profiles get nothing, or "lean then sheet" stops serialising identically to "always sheet" and the sweep's restore breaks.

### Reading it back

- [X] T019 [US1] Add `networkFlow(eso, environments)` to `src/readings.js`, returning the frozen shape in [data-model.md](./data-model.md). **The rate is the sum of the two series**, measured at 0.0007 and 0.684 ACH on the stock desk, so reading either alone is wrong by three orders of magnitude. `hoursOpen` is `null` in this story. Read over the billed environments, as `readExtremes` and `readDemand` already do. Module stays DOM-free.
- [X] T020 [US1] Add `lastNetwork` beside `lastGlass` in `src/main.js`, set in `solve` after the ESO is parsed and taken down by `clearReadings` on each of `solve`'s failure exits, and extend `readouts()` with the `'air'` entry. Nothing in `src/console.js` changes: `setReadings` already letters an em dash for a channel with a readout and no entry.
- [X] T021 [US1] Letter the derived leakage figure and its arithmetic under the `envLeak` face in `src/console.js`, so the three figures for one question stand apart as FR-005a and FR-005b require: what the reader asked for, what the model was given, and what the run produced. Follow the register's blower-door conversion, which prints its arithmetic for the same reason.

### Verification for User Story 1

- [X] T022 [US1] **The linearity gate** in `.harness/afn.mjs`: openings shut, annual, Golden. `envLeak` 0.5 gives a computed mean of 0.154 ACH and 1.5 gives 0.451, and the ratio is 2.93 within a few percent. This is the only check standing between the sheet and the eighty-fold per-area error, which completes with zero warnings.
- [X] T023 [US1] **Idempotence and exclusivity** in `.harness/afn.mjs`: three applies byte-identical under `'Network'` and across `Scheduled → Network → Scheduled`; the document holds no `ZoneInfiltration:*` or `ZoneVentilation:*` under the network; and `eplusout.err` carries no `will not be simulated` discard warning. FR-002a, FR-023.
- [X] T024 [US1] **The geometry cases** in `.harness/afn.mjs`, all annual on Golden, all exit 0 with zero severe errors: stock desk (0.89 s), zone multiplier 3 (0.82 s), two walls adiabatic, no glazing at all, and Fabric patched out (channel blocked, no AFN object written, run completes). SC-001. For the stacked case the additional gate is that the computed ACH is **flat** against the multiplier.
- [X] T025 [US1] **The latency gates** in `.harness/afn.mjs`, three interleaved passes: design day within +30 ms of the 0.05 s baseline, annual within 4x the 0.47 s baseline. The design-day gate is the one that matters, since +20 ms is 40 % of the desk's live budget.
- [X] T026 [US1] Drive the page (`npm run dev`): switch to the network with a year attached, confirm the readout letters a rate that varies across the year (SC-002) and differs from any figure typed; raise `envLeak` and confirm the rate and the heating demand both rise; read the balance rail and confirm the outdoor air term still closes with the other four.

**Checkpoint**: the feature exists and delivers the value the request named. This is the MVP.

---

## Phase 4: User Story 2 - Never leave a dead control on the desk (Priority: P1)

**Goal**: Only the model in force has controls, and only the model in force
letters figures. The model in force can be named without opening anything.

**Independent Test**: With the network working, switch back and forth and
confirm that at no point is a control offered whose value reaches nothing, and
that the model in force is nameable from the sheet without opening the strip.

**Depends on**: Phase 3, which supplies the network controls there are to
withdraw.

- [X] T027 [US2] Add `needs` to all ten existing scheduled controls in `src/controls.js`: `infiltration`, `ventilation` take `scheduled`; `infConstant`, `infWind`, `infStack` take `(p) => scheduled(p) && p.infiltration > 0`; `ventType`, `ventMinIndoor`, `ventMaxOutdoor`, `ventDeltaT`, `ventMaxWind` take `(p) => scheduled(p) && p.ventilation > 0`. **No default, range, step or landmark may move**, which is what keeps `DEFAULTS_BY_VERSION.v1` frozen and `MIGRATIONS` empty.
- [X] T028 [US2] Extend the folded index row in `src/console.js` so the Air strip's folded reading names the model in force alongside its rate. FR-004 and SC-006: the model must be readable at 390 px without opening anything, and on a phone the folded row is the whole reading.
- [X] T029 [US2] Branch the air clause in `src/describe.js` on which model produced the flow, read off the document and not off live `params`. FR-018. The network's clause names the model, the leakiness as the document holds it, and the computed rate. `FLIP.air` stays at 1.4 and **switching models is not a flip**: it is a change within an engaged channel and must rank as a scalar move would.
- [X] T030 [US2] Verify in `.harness/afn.mjs` that no control reaches nothing: for both values of `airModel`, every key whose `needs` is true is written into the document by some applier, and every key whose `needs` is false reaches no object. Assert byte-identical IDFs across a change to a withdrawn control's value.
- [X] T031 [US2] Verify `describeDesk` in `.harness/afn.mjs` over documents the harness builds itself, both models, including a desk whose openable walls are all solid. The module is DOM-free and the station arrives as `{ name, zone }` already read, so the real function is called and not a copy.
- [X] T032 [US2] Drive the page (`npm run dev`): switch models back and forth, confirm the scheduled controls return **at the values they held**, confirm the folded row names the model at 390 px, and confirm the description under the plate names it too. Confirm the staleness case: the four result blocks stand with the previous run's numbers, dimmed, and never blank.

**Checkpoint**: both P1 stories are complete. The feature is shippable.

---

## Phase 5: User Story 3 - Open a window on the facade that catches the wind (Priority: P2)

**Goal**: An openable area per wall, so four walls are four subjects and the
facade a window is on reaches the result.

**Independent Test**: Set an openable area on one wall, then the same area on
another, and confirm the computed flows differ.

**Depends on**: Phase 3.

- [X] T033 [US3] Declare `OPENABLE_SIDES` in `src/controls.js` from `WALL_FACES`, with `needs: (p) => opensOut(p, face) && p[wwr] > 0` and the two-branch `unreached`, mirroring `SHADE_SIDES`. **The `noOpening` sentence needs a per-key variant**: "has no opening, so an overhang there hangs on nothing" is wrong for an opening, and a refusal naming the wrong cause is what the `Side` class exists to prevent.
- [X] T034 [US3] Add the `openable` `Facade` to the `air` channel in `src/controls.js`: `sides: OPENABLE_SIDES`, 0 to 1, step 0.01, `zero: 'Shut'`, `needs: network`. A `Facade` and not four `Scale`s, so each wall gets its own study offer and its own curve, and `controlFor` already resolves a wall key.
- [X] T035 [US3] In `applyNetwork` in `src/model.js`, write `AirflowNetwork:MultiZone:Component:SimpleOpening` named `Openable` where any wall has a non-zero area, and one `AirflowNetwork:MultiZone:Surface` per window whose host is a **wall** that opens outdoors, carrying that wall's area as the opening factor and `ZoneLevel` as its mode.
- [X] T036 [US3] Add the rooflight exclusion to `src/model.js` with the comment recording both measured fatals: the vertical model refuses anything within 10 degrees of horizontal because there is no bottom and top for a neutral plane, and the horizontal model refuses a surface facing outdoors because outdoors is an external node with a wind pressure and not a zone with a density. A window hosted on the roof is linked to no opening component.
- [X] T037 [US3] State the rooflight limit on the Skylights strip in `src/controls.js`, in the same place and the same way that strip already states rooflights fall outside the blind. FR-008: the reader is told where they would look for the control, not left to discover it.
- [X] T038 [US3] Verify in `.harness/afn.mjs` that the same openable area on the west wall and on the south wall produces **different computed flows** (SC-007), and that a desk with rooflights and the network engaged completes with exit 0 and links no roof window to an opening component.
- [X] T039 [US3] Verify the shrink in `.harness/afn.mjs`: a desk taken from four openable walls to one serialises byte-identically to one built at one. This is what `AIR_TYPES`'s clear-and-rewrite buys and the assertion that proves no orphan is left.
- [X] T040 [US3] Drive the page (`npm run dev`): set an openable area on a wall with no glazing and confirm the offer is refused with that wall's own reason; set a wall adiabatic and confirm its entry says the wall has no outside to open onto.

**Checkpoint**: the network answers the question a designer actually has.

---

## Phase 6: User Story 4 - Let the building decide when to open (Priority: P2)

**Goal**: The reader chooses the rule the openings obey and the bounds outside
which they shut, and the sheet letters how much of the run they actually stood
open.

**Independent Test**: Set each rule in turn on an otherwise fixed desk and
confirm the fraction of hours the openings stand open changes, and that the
sheet reports it.

**Depends on**: Phase 5, since an opening has to exist before a rule can govern
it.

- [X] T041 [US4] Declare `NEEDS_SETPOINT` and the `openRule` `Selector` in `src/controls.js`, its option values the `ventilation_control_mode` enum verbatim so nothing is translated on the way into the document. Label `CEN15251Adaptive` as EN 16798, which is the standard that replaced EN 15251; the field name is the engine's and the label is the reader's.
- [X] T042 [US4] Add `openSetpoint`, `openDeltaLo` and `openDeltaHi` `Scale`s to `src/controls.js`, with `openSetpoint` gated on `NEEDS_SETPOINT.has(p.openRule)` so the control is offered exactly when the schedule will be written.
- [X] T043 [US4] Add the module-load assertion in `src/controls.js` that `NEEDS_SETPOINT` is a subset of `openRule`'s option values. A mode in the set but not the selector is dead; a mode in the selector needing a setpoint and missing from the set is the measured get-input fatal. Declaration errors throw at load rather than degrade at run time.
- [X] T044 [US4] In `applyNetwork` in `src/model.js`, replace T015's hardcoded `NoVent` with `params.openRule`, write the two temperature-difference bounds, and write the `Schedule:Compact` setpoint whenever `NEEDS_SETPOINT` holds. **`NEEDS_SETPOINT` is imported from `controls.js`, never restated**, so the one place deciding whether a setpoint is needed is the one place deciding whether it is offered. FR-011 is met by making the fatal unreachable.
- [X] T045 [US4] In `syncReporting` in `src/model.js`, add the `AFN Surface Venting Window or Door Opening Factor` request with key `*`, only where an opening exists. The key `*` is safe here and is the exception that proves the rule: it resolves to one series per openable window, at most four, not the 158 that took an annual run from 681 ms to 2,984 ms.
- [X] T046 [US4] Extend `networkFlow` in `src/readings.js` with `hoursOpen` and `hoursTotal`, and implement all four refusals from [contracts/readings.md](./contracts/readings.md). **An hour in which two openings stood open is one hour**, counted over the union rather than the sum, the same discipline the Run channel's special days keep.
- [X] T047 [US4] Add `openSub` to `src/main.js` so the readout's sub-line distinguishes the two ways of having nothing to say: `null` is no opening at all and the line is omitted, zero is an opening that never opened and is **said in words**. FR-016: a zero that reads as a measurement is exactly what this sheet exists not to print.
- [X] T048 [US4] Add the `openMaxWind` `Scale` to the `air` channel in `src/controls.js`, mirroring the scheduled model's `ventMaxWind` exactly: 1 to 40 m/s, step 0.5, `landmarks: WIND`, default 40 so the window never shuts at the stop. Gated on `network(p) && anyOpenable(p)`, because a bound on openings that do not exist reaches no actuator. Its note says the bound lands through an EMS program rather than a field, since no AirflowNetwork object carries a wind speed.
- [X] T049 [US4] Add `applyWindBound(doc, params, windows)` to `src/model.js`, called from `applyNetwork` with the window list the opening linkages already collected. One `EnergyManagementSystem:Sensor` on `Site Wind Speed`, one `EnergyManagementSystem:Actuator` per openable window on `AirFlow Network Window/Door Opening` / `Venting Opening Factor`, one `EnergyManagementSystem:Program`, one `ProgramCallingManager` at `BeginTimestepBeforePredictor`. Contract in [contracts/network-model.md](./contracts/network-model.md). **The else-branch sets every actuator to `Null`**, and the comment must carry why: forcing a value instead replaces the opening rule rather than bounding it, measured at 8,808 hours open against 2,601, exit 0 and zero warnings.
- [X] T050 [US4] Add the four `EnergyManagementSystem:*` types to `AIR_TYPES` in `src/model.js`, with the comment recording that clearing them by type is safe **only while nothing else on this desk uses EMS**, and that a second Erl program anywhere would need this sweep narrowed to what `applyAir` wrote by name.
- [X] T051 [US4] **The wind bound must bound, not replace**, verified in `.harness/afn.mjs`. With `openMaxWind` at its top stop the `Zone Air Heat Balance Outdoor Air Transfer Rate` series must match a run with the EMS objects absent to **0 W over every hour**. At 4 m/s the hours open must fall from 3,896 to about 2,601 and never reach 8,808, which is the signature of a forced actuator. Also assert the Erl text is idempotent across three applies and across a shrink from four openable walls to one, since the threshold is a literal in generated program text and the object-count check does not cover it.
- [X] T052 [US4] **Exhaust the grid** in `.harness/afn.mjs`: six `openRule` values against the geometry cases from T024, every combination exit 0 with no severe error. SC-009 stated as a loop. Assert every setpoint-needing mode wrote a schedule and named it on the zone object.
- [X] T053 [US4] Drive the page (`npm run dev`): each rule in turn changes the hours-open figure; a rule under which the openings never open makes the sheet say so rather than lettering a zero; and lowering `openMaxWind` on a windy site cuts the hours open and the computed rate with them.

**Checkpoint**: the hole in the wall is a ventilation strategy.

---

## Phase 7: User Story 5 - Share and sweep the network like every other control (Priority: P3)

**Goal**: The desk's existing guarantees keep holding.

**Independent Test**: Encode a desk with the network engaged, decode it in a
fresh session, and confirm an identical drawing, identical model text and
identical numbers.

**Depends on**: Phases 3 to 6, which supply the keys to encode and sweep. Almost
all of this follows from declaring the controls in the ordinary way; these tasks
are the proof, not the work.

- [X] T054 [P] [US5] Round-trip every one of the nine new keys in `.harness/afn-link.mjs`, and refuse every malformed input class: a bad `openRule` option, an `envLeak` out of range or off the step grid, an `openable` above 1. Refused whole, never half-loaded. `permalink.js` is DOM-free so this is a Node harness.
- [X] T055 [P] [US5] Verify FR-020 in `.harness/afn-link.mjs`: a link carrying no `airModel` key resolves to `'Scheduled'` and reproduces its original numbers exactly. Confirm `LINK_VERSION` is still 1, `DEFAULTS_BY_VERSION.v1` unchanged and `MIGRATIONS` still empty, and that the nine keys do not collide with the reserved `in`, `out`, `stn`, `win`, `at`.
- [X] T056 [US5] Drive the page (`npm run dev`): copy a link with the network engaged and its controls off their defaults, open it in a fresh session, and confirm identical drawing, model text and numbers (SC-004). Start a study on `envLeak` and on an openable wall key, and confirm four cards can stand at once under one plan key, each naming its wall.

**Checkpoint**: every user story is complete and independently verified.

---

## Phase 8: Polish and cross-cutting concerns

- [X] T057 Re-read `NOTES` in `src/tour.js` against the new declaration and correct any note naming an Air control by name, since ten of them now appear under one model only. Bump `STORE` to `shoebox-general-notes-v3` where a step's meaning moved. **Outcome: no change was owed.** No note names an Air control by name, no step's subject moved, and the channel count is still eighteen; "every control writes a real object into the IDF" stays true of the controls in force, which is the existing `needs` convention across the whole desk rather than anything this feature changed. The storage key is therefore not bumped: a returning reader would get a fresh sheet of notes they have already read. The general notes are part of done, not a follow-up: an onboarding that walks a page which no longer exists is worse than none.
- [X] T058 [P] Record the measured invariants in `CLAUDE.md`: the per-surface crack coefficient and the eighty-fold error it hides, the two-series sum for the computed rate, the no-exterior-surface get-input fatal, the +20 ms design-day charge, and the `*` key exception for the opening-factor variable. These cost real debugging and the house style is to write down what forced the decision.
- [X] T059 [P] Record any new token, component pattern or layout threshold in `.interface-design/system.md`, in the same change that introduces it. Nothing here should need one, since the readout, the plan key, the folded row and the refusal note are existing patterns; if one is invented it goes here, because a pattern living only in a stylesheet rule is the second source of truth Principle III forbids.
- [X] T060 Run `specs/001-afn-natural-ventilation/quickstart.md` end to end, sections 1 through 9, and confirm every measured gate is hit.
- [X] T061 Empty `.harness/` and confirm `.gitignore` still covers it.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.**
- **US1 (Phase 3)**: depends on Foundational. Depends on no other story.
- **US2 (Phase 4)**: depends on US1, which supplies the network controls there are to withdraw.
- **US3 (Phase 5)**: depends on US1. Independent of US2.
- **US4 (Phase 6)**: depends on US3, since an opening must exist before a rule can govern it.
- **US5 (Phase 7)**: depends on whatever stories have shipped; it proves their keys, so it is run last.
- **Polish (Phase 8)**: depends on all desired stories.

### The wind bound sits in US4, not US2

FR-012 was briefly planned as a US2 question, on the mistaken finding that the
bound could not be built and the only decision was how to say so. It is real
work, it needs an opening to act on, and it is a bound on the opening rule, so
it belongs beside the rule's other bounds in Phase 6.

### The one story dependency worth naming

US2 and US3 are both reachable the moment US1 lands and neither needs the
other. US4 genuinely needs US3: the specification says so ("it follows Story 3
because an opening has to exist before a rule can govern it") and the applier
agrees, since `AirflowNetwork:MultiZone:Component:SimpleOpening` is written only
where a wall has an area.

### Within each story

Controls before appliers, appliers before readers, readers before the interface
that letters them, and the harness gate before the page is driven. That is the
constitution's order and not a preference: the browser is a slow place to find
out a model is wrong.

### Parallel opportunities

Genuinely few, because `src/controls.js` and `src/model.js` carry most of the
work and cannot be edited concurrently.

- T002 and T003 (both `.harness/`, no source dependency)
- T054 and T055 (both `.harness/afn-link.mjs`, independent assertions)
- T058 and T059 (`CLAUDE.md` and `.interface-design/system.md`)
- Across stories: once Phase 3 is done, US2 (Phase 4) and US3 (Phase 5) can be
  worked by two people, since T027 to T032 touch `controls.js`, `console.js` and
  `describe.js` while T033 to T040 touch `controls.js` and `model.js`. The
  `controls.js` overlap has to be sequenced or merged.

---

## Implementation strategy

### MVP: Phases 1 to 3

Setup, Foundational, then User Story 1. That delivers what the request actually
asked for: a natural ventilation rate that answers the climate rather than a
schedule. Stop at T026, drive the page, and the feature is real.

**But do not ship the MVP alone.** User Story 2 is also P1, and the
specification is explicit about why: with the network engaged and the scheduled
controls still on the strip, a reader can double the infiltration, watch a solve
go by, get back exactly the numbers they had, and conclude something false about
the building. Phase 3 without Phase 4 is a desk with ten dead controls on it,
which breaks Principle IV outright.

So the shippable increment is **Phases 1 through 4**.

### Incremental delivery after that

1. Phases 1 to 4: the network, with no dead controls. Shippable.
2. Phase 5 (US3): the facade question, which is the argument for the network.
3. Phase 6 (US4): the control rule and the wind bound, which turn a hole into
   a strategy.
4. Phase 7 (US5): the proof that sharing and sweeping still hold.
5. Phase 8: the notes, the invariants, the quickstart.

Each adds value without breaking the last.

---

## Notes

- `[P]` means different files and no dependency on incomplete work.
- Every verification task calls the **real** readers, never a copy. That is why
  `readings.js`, `describe.js` and `permalink.js` are DOM-free.
- Commit after each task or logical group.
- Four numbers are gates rather than illustrations, and a run that misses one
  has found something: the linearity ratio of 2.93 (T022), the design day within
  +30 ms (T025), 0 W of difference between a wind bound that cannot bite and no
  wind bound at all (T051), and zero severe errors across the whole grid (T052).
- Two of this feature's failure modes produce a clean run with zero warnings and
  a wrong answer: a per-area crack coefficient, and a forced EMS actuator. Both
  are caught by a reading and by nothing else, which is why their gates are
  numbers rather than "confirm it works".
