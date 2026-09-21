---

description: "Task list for feature 014, a daylight reading on the roster"
---

# Tasks: A daylight reading on the roster

**Input**: Design documents from `specs/014-daylight-reading/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/daylight.md](./contracts/daylight.md), [quickstart.md](./quickstart.md)

**Tests**: This repository has no test runner and no linter, by a decision recorded in
`CLAUDE.md`. Verification is throwaway Node harnesses under `.harness/` that build the real
document from `src/model.js` and run it, then the page driven by hand. The harness tasks
below are therefore not optional test tasks: they are the constitution's own workflow gates,
and a gate that did not run is a gate that failed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel, meaning a different file and no dependency on unfinished work
- **[Story]**: which user story the task serves
- Every task names the exact file it changes

## Path conventions

Single project. Source is `src/*.js` at the repository root, harnesses are `.harness/*.mjs`,
and there is no `tests/` directory.

---

## Phase 1: Setup

**Purpose**: the engine staged, the before-numbers recorded, and the one open decision put to
the maintainer so it is not discovered blocking work later.

- [X] T001 Stage the engine, schemas and station index by running `npm install && npm run predev`, and confirm EnergyPlus 26.1.0 is at `/Applications/EnergyPlus-26-1-0`, per the prerequisites in specs/014-daylight-reading/quickstart.md
- [X] T002 [P] Write `.harness/tmp-baseline-014.mjs` recording every figure the sheet reports today at the shipped default desk and at four sweep positions, annual and design day, so SC-008 can name which figures moved and which did not. Commit the output as a fenced block in specs/014-daylight-reading/research.md under a new section 14
- [X] T003 [P] Put the FR-005 conflict to the maintainer and record the answer in specs/014-daylight-reading/research.md §6: FR-005 requires the method in view and not in a fold, `CLAUDE.md:411-416` requires method and citations go in a fold, and §6 proposes the design system's own "Qualifying a reading in place" split. T027 and T029 are built to whichever answer comes back

**Checkpoint**: the before-state is on the record and the one open decision is answered.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the probe exists on every solve, it measures without acting, and the engine is
asked for its variable. Nothing in any user story can be read, plotted or lettered until the
run carries the series.

**CRITICAL**: no user story work begins until this phase is complete and T011 has a number.

- [X] T004 Add `applyProbe(doc, params)` to src/model.js: read the floor surface's own vertex extent, write one `Daylighting:ReferencePoint` at the centre of that extent, `dlDepth` of the way across the plan from the south wall through `turn()`, at `dlHeight`; write one `Daylighting:Controls` whose `control_data` carries the probe as entry 1 at `fraction_of_lights_controlled_by_reference_point: 0`. Clear and rewrite both types on every call. No `engaged` argument and no `requires`, per contracts/daylight.md
- [X] T005 Change `applyDaylight` in src/model.js:2144-2180 so it no longer creates either daylighting object. It appends its dimming sensor to the `control_data` of the object `applyProbe` owns, as entry 2, and removes that entry when the channel is out. Keep its early return at `!engaged || !gainsOn || !(params.lighting > 0)` and keep its `requires`. Use `must(doc, ...)` to find the controls object rather than re-adding it
- [X] T006 Call `applyProbe(doc, params)` from `applyModel` in src/model.js:943, immediately before `applyDaylight`, so the probe owns the object the channel contributes to and the geometry it reads has already been written by `applyMassing`
- [X] T007 Add the illuminance variable to `syncReporting`'s `'sheet'` branch in src/model.js:2561, `Daylighting Reference Point 1 Illuminance`, `Hourly`, zone-level and never per-surface. The `RunContents` branch takes it from the quantity's own `needs` instead
- [X] T008 [P] Add `Daylighting Reference Point 1 Illuminance` to the standing existence gate in .harness/variables.mjs, asserting it is present in the run's own `.rdd` and that `eplusout.err` carries no "requested but not generated". Assert it is the reference point variable and not the neighbouring `Daylighting Window Reference Point 1 Illuminance`, which is the per-window contribution and differs by one word
- [X] T009 Extend .harness/gains.mjs so three applications of `applyModel` are byte-identical at each of four desk positions and in both directions of travel: Daylight bypassed then engaged then bypassed, Gains bypassed and engaged, Glazing and Skylights both bypassed, and wall mass at zero and above zero. Assert the sensor entry appears and disappears from `control_data` leaving the probe entry untouched and no orphan `Daylighting:ReferencePoint` behind. This is the step most likely to fail first, because ownership of `Daylighting:Controls` moves in T004 and T005
- [X] T010 Re-run `.harness/tmp-daylight-neutral.mjs` and `.harness/tmp-probe-arrangement.mjs` against the shipped code rather than against a harness-built document, and assert to full precision and not to a tolerance: 5975.5 kWh of annual lighting with the probe and without with Daylight bypassed, 3698.4 kWh with and without with Daylight engaged and dimming, point 1 reading 194 lx in all three arrangements, and a desk with no opening reading a clean 0 lx at 0 severe
- [X] T011 Measure the design-day cost in .harness/tmp-daylight-wasm.mjs: three runs per configuration, minimum reported beside median, with and without the probe, on the warm design-day cadence that re-solves continuously during a drag at about 50 ms. Record the number in specs/014-daylight-reading/research.md §10 either way. If the drag cadence is outside its budget, stop and revisit the always-on decision in FR-014 before any further task, because it is the first assumption the spec names for revision

**Checkpoint**: the probe is written on every solve, measured neutral, named at ordinal 1, and its cost is on the record. The reading can now be read.

---

## Phase 3: User Story 1 - See what the window delivers, not only what it costs (Priority: P1) 🎯 MVP

**Goal**: a daylight figure on the shipped default desk that rises as the window widens,
without the reader engaging anything first.

**Independent Test**: on a desk in its shipped state, sweep the window ratio from its
smallest stop to its largest and confirm the daylight reading moves monotonically upward
while the energy readings move the other way, and that the reader did not have to engage a
bypassed channel to see it.

- [X] T012 [US1] Create src/daylight.js, DOM-free and network-free, exporting `illuminanceSeries(eso)`, `medianIlluminance(eso, { floor })`, `readDaylight(eso, { floor })`, `PROBE_DEPTH`, `PROBE_HEIGHT`, `VALIDITY_DEPTH_RATIO = 3`, `withinValidity(built)` and a frozen `ABSENCE` table, per contracts/daylight.md. The arithmetic is the five ordered steps in data-model.md §4: the hourly illuminance series, the hourly `Schedule Value` series keyed `Occupancy` read back off the run rather than re-evaluated in JS, the weather-file environments only by the same rule as `weatherRuns` in src/tm59.js:1091-1106, the hours where `occupied(scheduleValue, floor)` per src/tm59.js:1074-1089, then the median of what is left
- [X] T013 [US1] Give `readDaylight` in src/daylight.js the same constructor discipline as src/tm59.js:563-593, so a result carrying both a value and a reason, or neither, is unconstructable. Write the four absence reasons from data-model.md §4 into `ABSENCE`, each inside the 12-word budget in src/copy.js:44 and each naming the fix first. A measured zero is a figure, not an absence, and takes none of these
- [X] T014 [US1] Add a `DAYLIGHT` `RunContents` beside the others at src/study.js:464-480, naming one `VariableRequest` for the illuminance variable at `Hourly` and nothing else: no meters, no tables, no channels
- [X] T015 [US1] Add one `Quantity` and its one `QuantitySeries` to `QUANTITIES` in src/study.js:513-651, with every field as listed in data-model.md §2 including the nulls: `unit: 'lx'`, `quantityKind: 'illuminance'`, `digits: 0`, `needs: DAYLIGHT`, `context: (desk) => ({ floor: desk.occupiedFloor })`, `pen: null`, `meterScope: null`, `wholeYear: false`, `priced: null`, `movedBy: []`, `criterion: null`, `category: null`. The id must match `[A-Za-z][A-Za-z0-9]*` with no dot, dash or underscore, because `sty` splits on `.` at src/permalink.js:590, and it can never be renamed afterwards
- [X] T016 [US1] Add the new id to the closed `nonTargets` set at src/study.js:942. Without this the assertion at src/study.js:946-950 throws at load, naming the declaration, because every quantity must be either a target's `metric` or a declared non-target
- [X] T017 [US1] Add one `SENSE` entry keyed by the new series id in src/survey.js:133-159, `better: 'higher'`, with a `why` stating that this is the sheet's own judgement about the reading and not a published line. Without it `Reading.improves` at src/survey.js:211-220 and `pullReadingFor` at src/pull.js:377-387 refuse the reading by name. This is only the second `'higher'` reading on the sheet, after the zone low
- [X] T018 [US1] Letter the figure on the sheet in src/console.js, reading it through the roster like every other reading, with its unit from the kind and a change in it lettered through `Reading.change` rather than `Reading.format`, since a change in a reading is a difference
- [X] T019 [US1] Drive the page with `npm run dev` and sweep the south window ratio from its smallest stop to its largest on the shipped default desk with the Daylight channel never engaged. Confirm the daylight reading rises monotonically while the energy readings fall, and record the endpoint figures in specs/014-daylight-reading/research.md §14

**Checkpoint**: the problem statement is answered. The window's own consequence is on the sheet where the sheet recommends the darkest room.

---

## Phase 4: User Story 2 - Cut the trade as a drawing (Priority: P1)

**Goal**: the reading is offered wherever a reading is chosen, and the energy against daylight
trade can be cut as a study curve and as E-02 ground.

**Independent Test**: sweep one control with the daylight reading chosen as the study metric,
then cut a survey with daylight on one axis and an energy reading on the other, and confirm
every sampled point, contour and spot height answers the daylight reading and nothing else.

- [X] T020 [US2] Confirm the reading is offered in every chooser generated from the roster, in src/console.js and src/survey.js, on the same terms as every other reading, and that no chooser needed a new branch. A chooser that needed teaching by hand means the reading is not a first-class roster entry and the declaration is wrong, not the chooser
- [X] T021 [US2] Confirm the priced-pairing count at src/study.js:932-936 comes back unchanged at 66 of 78. The new quantity declares `movedBy: []` and reads no bill, so `refusesPairing` must refuse exactly the pairings it refused before and no others
- [X] T022 [US2] Cut a study curve against the daylight reading and confirm every sampled point is computed for it and the curve declares its improving direction. Confirm the sample caches answer it without re-solving, which they must because the probe is unconditional and every cached sample carried it, per FR-014 and data-model.md §6
- [X] T023 [US2] Cut an E-02 survey with daylight on one axis and an energy reading on the other, and confirm the inherited `absenceIn` sentence at src/survey.js:2170-2186 letters "No standard on this sheet publishes a limit for {label}" on the ground, that no isoline is drawn across it, and that `Coverage.runs` counts what it should. Six readings take this path today and daylight is the seventh, so this task writes no code and is a check that none was needed

**Checkpoint**: the trade is a drawing the reader cuts for themselves, with no second view and no second tool.

---

## Phase 5: User Story 3 - Know what the number is not (Priority: P1)

**Goal**: the reader can state, without opening anything, what the figure was computed by,
where in the room it was taken, and where the method stops being valid.

**Independent Test**: read the sheet at 390 px wide, in both unit systems, without hovering
and without opening any fold, and confirm the method, the probe position and the validity
limit are all legible, and that the limit is stated as breached on a desk whose depth exceeds
three times its ceiling height.

- [X] T024 [US3] Add the load-time throw for a reading offered without a method statement, in src/study.js beside the existing roster assertions, failing at module load and naming the declaration rather than drawing a bare number that looks like every other number on the sheet
- [X] T025 [US3] Add the load-time throw for a reading offered without a stated probe position, in src/study.js, per FR-015 and data-model.md §5. The position is the one thing a reader cannot recover from the figure
- [X] T026 [US3] Add the load-time throw for a published `Target` attached to this reading, in src/study.js. The existing `nonTargets` assertion covers the other direction; this one refuses a future declaration that would turn a ranking instrument into a certificate
- [X] T027 [US3] Letter the reading's qualification in src/console.js as T003 settled it: the figure, its unit, the probe's stated position, the sentence that no published line judges this reading, and the validity statement all in view; the method's own text and its citations placed as the decision requires, using the existing `SUMMARY.reading` word `'Method'` at src/console.js:100 if the folded split was chosen. Assert whatever is always-visible against its budget in src/copy.js
- [X] T028 [US3] Letter the validity breach in src/console.js from `withinValidity(built)`, asked of the document's own geometry and never of `params`, stating the limit has been passed and at what depth. The shipped desk is already past it at 3.333 against a stated 3, so this statement is visible on first load and not an edge case
- [X] T029 [US3] Extend .harness/declarations.mjs with the four cases: the reading without its method statement, without its stated position, with a `Target` attached, and neither a target metric nor a declared non-target. Each must stop the page at mount with a sentence naming the declaration. A case that renders is a failure of this step even if the sheet looks right
- [ ] T030 [US3] Read the sheet at 390 px in both unit systems with `npm run dev`, without hover and without opening anything, and confirm the figure, the probe position, the no-line sentence and the validity statement are all legible and selectable with no horizontal scrolling. Switch to IP and back and confirm the SI sheet returns character for character

**Checkpoint**: the number is offered as a ranking instrument and says so, which is the binding constraint on the whole feature.

---

## Phase 6: User Story 4 - The room is lit the way a room is lit (Priority: P2)

**Goal**: interior visible reflectance is one declared control that means interior visible
reflectance, and it reaches walls, ceiling and floor together.

**Independent Test**: with the Daylight channel engaged, compare lighting energy before and
after the correction on the same desk, and confirm the ceiling's visible reflectance moved
with the walls' rather than staying at its construction value.

**Note**: FR-013 forbids shipping this after the reading. The two known errors run in opposite
directions and are of similar size, so correcting either alone makes the published number
worse than correcting neither. This phase is P2 by the spec's own priority but is not
separable in delivery.

- [X] T031 [US4] Find and cite a published interior reflectance schedule for an office before declaring the control's default, and record the citation in specs/014-daylight-reading/research.md §4. `CLAUDE.md` permits a landmark only where somebody published it, and the 0.60 the assessment used is a comparator, not a citation. Without a source, the control ships with no landmark rather than with an invented one
- [X] T032 [US4] Declare one new `Scale` for interior visible reflectance on the Fabric channel in src/controls.js, `quantityKind: 'ratio'`, labelled as an interior property and not an exterior one, with the landmark T031 sourced. The step must reach a round IP figure or `assertReachable` throws, and `digits` must be refined with the step
- [X] T033 [US4] Stop `applyFabric` writing `visible_absorptance` from `wallAbs` and `roofAbs` at src/model.js:1011-1012. Both keep `solar_absorptance` and keep their declared exterior meaning; what they lose is a write they should never have had
- [X] T034 [US4] Write `1 - reflectance` into the `visible_absorptance` of every opaque material the desk builds, as one rule rather than a per-material list, in src/model.js. The list a rule must cover is `R13LAYER`, `R31LAYER`, `WALLMASS` at src/model.js:1026 which is hard-coded at 0.65 and which `wallAbs` never reached, the concrete slab, and `FLOORLIGHT` hard-coded at src/model.js:747 and src/model.js:1103. No new construction layer is needed, because `solar_absorptance` and `visible_absorptance` are separate fields
- [X] T035 [US4] Extend .harness/tmp-reflectance-sensitivity.mjs to assert the reflectance actually written to the innermost layer follows the new control on all four desks in quickstart step 7: walls with no mass, walls with `wallMass > 0` which is the miss a naive fix makes, ceiling, and floor with Mass engaged and bypassed. Then assert `wallAbs` and `roofAbs` still write `solar_absorptance`, no longer write `visible_absorptance` at all, and that moving either leaves the daylight reading unmoved
- [X] T036 [US4] With the Daylight channel engaged, record lighting energy before and after the correction on the same desk in specs/014-daylight-reading/research.md §14, and list every derived figure that moved with it: energy intensity, cost and carbon. SC-008 requires every figure that moved be traceable to this correction and every other figure be unchanged

**Checkpoint**: the number is right for both reasons rather than right by cancellation.

---

## Phase 7: User Story 5 - A declared control stops being inert (Priority: P2)

**Goal**: visible transmittance, a declared control with published landmarks and an eighteen
fold range, moves a reading.

**Independent Test**: on the shipped default desk, read the daylight reading at both ends of
the visible transmittance range and confirm the two figures differ by more than the reading's
own precision.

- [X] T037 [US5] Drive the page and read the daylight figure at `visT` 0.05 and at 0.90 on the shipped default desk, confirm the two differ by more than the reading's own precision of 0 decimal places, and confirm no energy reading changed that the model did not move. Record both figures in specs/014-daylight-reading/research.md §14 against the baseline of heating 4091.9, cooling 10632.6 and lighting 5975.5 kWh identical at both ends. This story needs no code of its own: it falls out of US1, and it is listed separately because it is separately verifiable and separately owed

**Checkpoint**: a control the sheet's own governing rule condemned now has a consequence.

---

## Phase 8: User Story 6 - Share the reading (Priority: P3)

**Goal**: a study or survey cut against the daylight reading survives a link, and links made
before this feature keep meaning what they meant.

**Independent Test**: cut a study and a survey against the daylight reading, copy each link,
open it fresh, and confirm the restored desk plots the same reading at the same position;
then open a link made before this feature and confirm it restores what it always did.

- [X] T038 [US6] Extend .harness/links.mjs so the new reading id round trips through `sty` and through `sv` as a survey series, asserting the id matches `[A-Za-z][A-Za-z0-9]*` and carries no dot, since a dot is the separator before the open study control keys and a second one would split `sv`. Assert the new interior reflectance key encodes and decodes as a scalar and is omitted from the link at its default
- [X] T039 [US6] Assert in .harness/links.mjs that a link minted before this change resolves to the same desk it always did, that `LINK_VERSION` is unchanged at `'v1'`, and that `MIGRATIONS` gains no step. The same desk, not the same numbers: the reflectance correction moves lighting energy on any desk with Daylight engaged, and the spec records that as accepted

**Checkpoint**: the reading is shareable, which is one of the sheet's two non-negotiable claims.

---

## Phase 9: Polish and cross-cutting concerns

- [X] T040 Update `NOTES` in src/tour.js for the new reading and for the Daylight channel no longer owning the daylighting objects, and bump the storage key from `shoebox-general-notes-v4` to `-v5`, per FR-021. A step whose meaning moved without a bump leaves returning readers taught the old thing
- [X] T041 [P] Record in .interface-design/system.md whatever T003 settled about the method statement, because a pattern living only in a stylesheet is the second source of truth Principle III forbids. Gate 8
- [X] T042 [P] Write the long-form findings into docs/design-notes.md: why the probe owns `Daylighting:Controls` on every desk, why its ordinal is pinned at 1 and what happens if it is not, the reflectance defect's three-surface shape, and the measured no-opening zero. Include the harness output that forced each decision, per the repository's own comment convention
- [X] T043 [P] Add the one-line summary to idfkit-shoebox/CLAUDE.md under a Daylight entry in the channel specifics list, citing the design-notes section T042 wrote
- [ ] T044 Run the whole of specs/014-daylight-reading/quickstart.md end to end, all nine steps in order, and record each result. An unmeasured pass is not a pass
- [X] T045 Delete the throwaway harnesses this feature added that are not standing gates, keeping `.harness/variables.mjs`, `.harness/links.mjs`, `.harness/gains.mjs` and `.harness/declarations.mjs` with their new checks, and keeping `.harness/tmp-reflectance-sensitivity.mjs` only if it earned standing status

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T003 gates only T027 and T041, so it can be asked early and answered late
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.** T011 is a stop-the-line gate: an over-budget design-day cadence sends FR-014 back for revision before anything else is built
- **US1 (Phase 3)**: depends on Foundational. Nothing can read a series the run does not carry
- **US2 (Phase 4)**: depends on US1. The roster entry is what every chooser is cut from
- **US3 (Phase 5)**: depends on US1 for the figure to qualify, and on T003 for T027
- **US4 (Phase 6)**: depends on Foundational only. It can run in parallel with US1, US2 and US3, and by FR-013 it must ship with them
- **US5 (Phase 7)**: depends on US1. Verification only
- **US6 (Phase 8)**: depends on US1 for the reading id and on US4 for the control key
- **Polish (Phase 9)**: depends on everything above

### Within Phase 2

T004 to T007 all edit src/model.js and are strictly sequential. T008 is a different file and
is parallel with them. T009, T010 and T011 are gates and run after T004 to T007 in that order,
cheapest failure first.

### Within US1

T012 and T013 build src/daylight.js. T014, T015 and T016 all edit src/study.js and are
sequential. T017 depends on the series id T015 declared. T018 depends on the quantity
existing. T019 is the story's own test.

### Parallel opportunities

- T002 and T003 in Setup
- T008 with T004 to T007
- The whole of US4 with the whole of US1, US2 and US3, since the only file they share is
  src/model.js and they touch different functions in it
- T041, T042 and T043 in Polish

---

## Parallel example: after Phase 2

```bash
# Two tracks, one shared file and no shared function:
Track A (US1 then US2 then US3): src/daylight.js, src/study.js, src/survey.js, src/console.js
Track B (US4):                   src/controls.js, src/model.js applyFabric
```

---

## Implementation strategy

### The MVP is larger than User Story 1

The usual advice is to ship US1 alone and validate. **That is not available here.** FR-013
requires the reflectance correction and the reading to land in the same change, because the
two known errors run in opposite directions and are of similar size, so a desk carrying the
reading without the correction publishes a number that is further from the truth than today's
silence. The smallest shippable increment is therefore:

**Phase 1 + Phase 2 + US1 + US3 + US4.**

US3 is inside the MVP for the same kind of reason. A figure that looks like every other figure
on the sheet, but is a ranking instrument rather than a measurement, is worse than no figure
at all, and that sentence is the spec's own.

### Incremental delivery after the MVP

1. MVP as above, validated by quickstart steps 1 to 5, 7 and 9
2. Add US2, the study curve and the E-02 ground, validated by quickstart step 9
3. Add US5, which is one measurement and no code
4. Add US6, validated by quickstart step 6
5. Polish

### The two steps most likely to fail

- **T009, idempotence.** Ownership of `Daylighting:Controls` moves from `applyDaylight` to
  `applyProbe`, which is exactly how orphans appear, and `applyModel` runs on every parameter
  change
- **T011, the design-day cost.** It is the one figure in this feature nobody has measured, and
  the spec names FR-014 as the first assumption to revisit if it slips

---

## Notes

- `[P]` means a different file and no dependency on unfinished work
- Commit after each task or logical group
- Every IDF built by a task must pass `load_model`, `validate_model`, `check_model_integrity`
  and `run_simulation` before that task is called done, per the repository's own verification
  discipline
- Two ids are permanent from the moment they ship: the quantity id and the series id. Renaming
  either refuses every link ever sent
