---

description: "Task list for slider parameter help notes"
---

# Tasks: Slider Parameter Help Notes

**Input**: Design documents from `specs/014-slider-parameter-tooltips/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/slider-notes.md, quickstart.md

**Tests**: the project has no test runner. Verification is by throwaway Node harnesses in the session scratchpad and by driving the page, as set out in quickstart.md. No test files are added to the repository.

**Organization**: tasks are grouped by user story. Every task that edits `src/controls.js` or `src/main.js` touches the same file as its neighbours, so few tasks carry `[P]`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3, from spec.md

## Findings made while generating these tasks

Three facts measured on 2026-09-21 change the plan and are applied in the tasks below. Task T005 records them in the design documents.

1. **The chooser drops fields.** `axisOffers` (`src/main.js:10000`) builds offers, but `axisOptions` (`src/main.js:10555`) copies only chosen fields into the options `pickList` draws. A `note` added to the offer alone never reaches the chooser. It must also be passed through `axisOptions`.
2. **`option.note` is the wrong slot.** In `pickList`'s `draw` (`src/main.js:10147-10162`), `option.note` is an always-visible `<small>` line, drawn only on available rows. The reading chooser uses it for a unit string (`src/main.js:10628`). A note of up to 77 words in that slot would sit in view on every row, which breaks the copy-budget rule (in view, at most one short line; long text goes in a fold) and FR-003/FR-006 (revealed on activation). It would also be absent from refused rows. The explanation is therefore carried as a new option field, `explanation`, and drawn as a `fold()` beside the row's button. A `<details>` element cannot be nested inside a `<button>`. `option.note` keeps its current meaning.
3. **Most mapped schema fields carry no IDD memo.** Of the 34 unnoted controls that map to an EnergyPlus object and field, 14 have an IDD memo in the bundled 26.1.0 prose (for example `WindowMaterial:SimpleGlazingSystem.u_factor`: "Enter U-Factor including film coefficients"). Another 19 have only a type, units, bounds and sometimes a default (for example `Material:NoMass.solar_absorptance`: `{d: 0.7, min: 0, max: 1}`). The remaining one, `daylight:dlSetpoint`, sits in an extensible group that `schema.field()` does not resolve (T002). Under FR-010 the note cites the field's schema definition in either case: the memo where one exists, otherwise the field's units, bounds and default.

The same measurement confirmed the plan's counts: 87 sweepable controls, 42 with a note and 45 without. The longest existing note is 77 words (`air:airModel`), so the 77-word budget in research.md R4 admits every existing note. The existing comment above `assertCopy` (`src/controls.js`, about line 3300) says that control notes are deliberately not budgeted "because they fold". T004 must rewrite that comment, not only add a check under it.

## Phase 1: Setup (shared measurement harnesses)

**Purpose**: build the two scratchpad harnesses that every later task reads from or re-runs. Neither is committed.

- [X] T001 [P] Write `census.mjs` in the session scratchpad: import `CHANNELS` from `src/controls.js` and `refusesSweep` from `src/study.js`, dedupe controls by `${channel.id}:${control.key ?? control.label}`, and print the sweepable total, the count with a `note`, and each unnoted key with its kind, label and unit. Run it from the repository root with `node`. Expected output today: `{ total: 87, with_: 42, missing: 45 }` and the 45 keys listed in T006 to T016.
- [X] T002 [P] Write `schema-probe.mjs` in the repository root (the `@idfkit/schemas/node` import resolves from there; delete the file after each run and never commit it). Use `localBundle('public/schemas')`, `.load('26.1.0')` and `.loadProse('26.1.0')`, and for each `[key, objectType, fieldName]` row in the mapping tables of T006 to T016 print `schema.field(objectType, fieldName)` in full (`t`, `u`, `min`, `max`, `d`, `n`) and `prose[n]` where `n` is defined. For `Daylighting:Controls`, the field `illuminance_setpoint_at_reference_point` sits inside the extensible array `control_data`, so read it through `schema.get('Daylighting:Controls')` rather than `field()`. Run `npm run predev` first if `public/schemas/` is absent. The printout is the source text for every FR-010 citation.

**Checkpoint**: both harnesses run and reproduce the counts above.

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: set the budget that every new note is written against, and align the design documents with the findings above, before any note is written or any chooser code changes.

- [X] T003 Add `new Budget({ id: 'CONTROL_NOTE', words: 77, scope: "a control's note, in its fold", asserted: true })` to the `roster` array in `src/copy.js` (lines 40-50), after `STRIP_LINE`. Place it so that `BUDGETS.CONTROL_NOTE` is exported by the existing `BUDGETS` line (line 52).
- [X] T004 In `assertCopy` in `src/controls.js` (about line 3309), add a loop over every control of every channel that calls `withinBudget(BUDGETS.CONTROL_NOTE, \`${channel.id}:${control.key ?? control.label} note\`, control.note)` for each control whose `note` is a string. This covers all 63 notes, sweepable or not. Rewrite the sentence in the doc comment above `assertCopy` that reads "The blurbs and the control notes are not here, because they fold and a fold's long form has no budget" so that it states that blurbs remain unbudgeted and control notes are now held to `CONTROL_NOTE`. Give the reason: the note is now drawn on two surfaces, and 45 notes are being written at once. Also update the comment on `noteFold` in `src/console.js` (lines 107-113) so that "of up to seventy-seven words" points to the `CONTROL_NOTE` budget as the enforcing check. Verify by running `node -e "import('./src/controls.js')"`; it must load without throwing.
- [X] T005 [P] Update `specs/014-slider-parameter-tooltips/contracts/slider-notes.md` and `specs/014-slider-parameter-tooltips/data-model.md` to record findings 1 and 2. Rename the offer field from `note` to `explanation`, state that `axisOptions` passes it through, and replace the "Unchanged: `pickList` / `draw` rendering" section with the fold-beside-the-button design specified in T018. In `specs/014-slider-parameter-tooltips/plan.md`, change Summary step 1 and the `main.js` row of Project Structure to match. Record finding 3 under R1 in `specs/014-slider-parameter-tooltips/research.md`. Also correct the placement in R4: the assertion lives in `assertCopy` in `controls.js`, beside the existing budget checks, and the budget is declared in `copy.js`.

**Checkpoint**: the page loads with the new budget asserted over the 42 existing sweepable notes and the 21 non-sweepable ones. The design documents describe the chooser change that Phase 4 implements.

## Phase 3: User Story 1: Understand a slider on the Model Console (Priority: P1) MVP

**Goal**: every one of the 87 sweepable controls shows a `Note` fold on the Model Console that explains the field and cites its source under FR-010 or FR-008.

**Independent test**: run `census.mjs` and see `missing: 0`. Then open the Model Console, open the `Note` fold on three of the newly noted controls, and confirm that each states what the field does and where its figure comes from, and that neither the value nor the reading changes. No console code changes: `noteFold` (`src/console.js:114`) already renders any control whose `note` is set.

**Rules for every note in T006 to T016** (apply to each without restating them per task):

- Write the note as the `note:` property on the control's existing declaration in `src/controls.js`. Find it by the key shown. Do not add a new field.
- At most 77 words, measured by `words()` in `src/copy.js`. T004's assertion refuses a longer note at load.
- Formal, plain technical prose, with no em-dashes. The existing notes' sentence structure is the model for content (what the field is, how it reaches the engine, where the number comes from). Their literary register is not.
- **Mapped control (FR-010)**: name the EnergyPlus object and field, then cite that field's definition as `schema-probe.mjs` (T002) prints it. Quote the IDD memo where one exists. Otherwise state the field's units, bounds and default as the schema declares them (for example "Material:NoMass, Solar Absorptance: 0 to 1, schema default 0.7"). Do not paraphrase the Input Output Reference in place of the schema. Do not cite a figure that the schema does not hold.
- **Schema-less control (FR-008)**: state that the control has no EnergyPlus field of its own, name what it does write (for example the vertices of `BuildingSurface:Detailed`), and cite a real published source for its range or default where one exists. (Revised 2026-09-21: a note need not state that the control has no field, or that no source is published.)
- If the control declares `inert`, `axisOffers` shows its note as the reason the control cannot be swept at that desk (`src/main.js:10037`). The note must therefore also read correctly as that refusal.
- After each task, re-run `census.mjs` and confirm the missing count drops by the number of keys in the task. Then load `src/controls.js` in Node to confirm the budget holds.

- [X] T006 [US1] Write notes for the three Massing controls in `src/controls.js`. All three are schema-less (FR-008): `massing:width`, `massing:depth` and `massing:height` each set only the vertices of `BuildingSurface:Detailed` written by the geometry applier in `src/model.js`, and are read by `src/aperture.js:80-81,150` when openings are sized.
- [X] T007 [US1] Write notes for Site and Context in `src/controls.js`. `site:groundReflect` is mapped (FR-010): `Site:GroundReflectance`, the twelve monthly fields `january_ground_reflectance` to `december_ground_reflectance`, all set to the one value (`src/model.js:975-976`). The schema has no memo; cite its units and bounds. `context:ctxDistance`, `context:ctxHeight` and `context:ctxWidth` are schema-less (FR-008): they set only the vertices of the `Shading:Site:Detailed` context block (`src/model.js:580-588,996`).
- [X] T008 [US1] Write notes for the six Glazing controls in `src/controls.js`. `glazing:wwr` is schema-less (FR-008). It is a `Facade` control with one note across four walls. It sets the vertices of each wall's window through `sizeOpening` in `src/aperture.js`, and the ratio is the rough opening with the frame inside it. The other five are mapped (FR-010). `glazing:uFactor` maps to `WindowMaterial:SimpleGlazingSystem.u_factor`, memo "Enter U-Factor including film coefficients". `glazing:shgc` maps to `.solar_heat_gain_coefficient`, memo "SHGC at Normal Incidence", 0 to 1. `glazing:visT` maps to `.visible_transmittance`, memo "VT at Normal Incidence optional", 0 to 1. `glazing:gapWidth` maps to `WindowMaterial:Gas.thickness` (no memo; units m, min 0), written once per cavity of the layered unit (`src/model.js:1183-1186`). `glazing:frameCond` maps to `WindowProperty:FrameAndDivider.frame_conductance`, memo "Effective conductance of frame Excludes air films Obtained from WINDOW 5 or other 2-D calculation". Say in each note whether the field reaches the simple glazing object or the layered unit, according to which one `src/model.js:1180-1215` writes at the pane count concerned.
- [X] T009 [US1] Write notes for the two Skylights controls in `src/controls.js`. Both are mapped (FR-010) to the rooflight's own `WindowMaterial:SimpleGlazingSystem` (`src/model.js:1262-1265`): `skylights:skySHGC` to `.solar_heat_gain_coefficient` ("SHGC at Normal Incidence") and `skylights:skyVisT` to `.visible_transmittance` ("VT at Normal Incidence optional"). State that the object is the rooflight's, separate from the wall glazing's.
- [X] T010 [US1] Write notes for Shading and Blinds in `src/controls.js`. `shading:overhang` (a `Facade` control, one note) and `shading:finOffset` are schema-less (FR-008): they set the vertices of `Shading:Zone:Detailed` surfaces (`src/model.js:458,479,1342`). `blinds:slatWidth` is mapped (FR-010) to `WindowMaterial:Blind.slat_width` (no memo; units m, min 0). Note that the applier also sets `slat_separation` to 0.8 times the width (`src/model.js:1357-1358`), so the note must not claim that the width acts alone.
- [X] T011 [US1] Write notes for Fabric and Mass in `src/controls.js`. All four are mapped (FR-010) and none has a memo. `fabric:roofR` maps to `Material:NoMass.thermal_resistance` on `R31LAYER` (units m2-K/W). `fabric:wallAbs` maps to `Material:NoMass.solar_absorptance` on `R13LAYER`, and the applier writes the same value to `visible_absorptance` (`src/model.js:1006,1010`); the schema declares default 0.7 and bounds 0 to 1. `fabric:roofAbs` maps to the same two fields on `R31LAYER` (`src/model.js:1007,1011`). `mass:internalMassThickness` maps to `Material.thickness` on `INTERNALMASS-LAYER` (units m, min 0), which the `InternalMass` object uses (`src/model.js:1111-1122`).
- [X] T012 [US1] Write notes for the five Air controls in `src/controls.js`, all mapped (FR-010). `air:openSetpoint` is written as the value of a `Schedule:Compact` (`writeSetpoint`, `src/model.js:1614`) named by `AirflowNetwork:MultiZone:Zone.ventilation_control_zone_temperature_setpoint_schedule_name`, memo "Used only if Ventilation Control Mode = Temperature or Enthalpy.". It is written only when the opening rule needs a setpoint (`NEEDS_SETPOINT`, `src/model.js:1835-1838`). `air:infWind` maps to `ZoneInfiltration:DesignFlowRate.velocity_term_coefficient`, memo `"C" in Equation`. `air:infStack` maps to `.temperature_term_coefficient`, memo `"B" in Equation` (`src/model.js:1468-1475`). Both notes must name the equation the memo refers to, since the memo alone does not. `air:ventMinIndoor` maps to `ZoneVentilation:DesignFlowRate.minimum_indoor_temperature`, memo "this is the indoor temperature below which ventilation is shutoff". `air:ventMaxOutdoor` maps to `.maximum_outdoor_temperature`, memo "this is the outdoor temperature above which ventilation is shutoff" (`src/model.js:1481-1497`).
- [X] T013 [US1] Write notes for the six Gains controls in `src/controls.js`, all mapped (FR-010) and none with a memo. `gains:occupancy` maps to `People.floor_area_per_person` (units m2/person), written with `number_of_people_calculation_method = Area/Person`. `gains:peopleCount` maps to `People.number_of_people`, written with method `People` under a named room type (`src/model.js:2073-2078`). `gains:lighting` maps to `Lights.watts_per_floor_area` (W/m2; `src/model.js:2110-2114`). `gains:equipment` maps to `ElectricEquipment.watts_per_floor_area` (W/m2). `gains:equipPeak` maps to `ElectricEquipment.design_level` (W) under `EquipmentLevel`. `gains:equipLatent` maps to `ElectricEquipment.fraction_latent` (`src/model.js:2129-2136`). The occupancy and people-count notes must say which of the two is written at which room type, because only one reaches the model at a time.
- [X] T014 [US1] Write notes for the two Daylighting controls in `src/controls.js`, both mapped (FR-010). `daylight:dlSetpoint` maps to `Daylighting:Controls`, field `illuminance_setpoint_at_reference_point` in the extensible `control_data` group (`src/model.js:2168-2177`). Read its definition through `schema.get` as T002 describes. `daylight:dlHeight` maps to `Daylighting:ReferencePoint.z_coordinate_of_reference_point` (units m; `src/model.js:2158-2162`).
- [X] T015 [US1] Write notes for the four System controls in `src/controls.js`, all mapped (FR-010) and none with a memo. `system:heatSet` and `system:coolSet` are written as the values of `Schedule:Compact` schedules named by `ThermostatSetpoint:DualSetpoint.heating_setpoint_temperature_schedule_name` and `.cooling_setpoint_temperature_schedule_name` (`src/model.js:2200-2238`). Cite the setpoint object's field, and state that a heating setpoint above the cooling one is refused by the System channel's `requires`. `system:supplyMaxT` maps to `ZoneHVAC:IdealLoadsAirSystem.maximum_heating_supply_air_temperature` (°C, 0 to 100). `system:supplyMinT` maps to `.minimum_cooling_supply_air_temperature` (°C, -100 to 50) (`src/model.js:2309-2310`).
- [X] T016 [US1] Write notes for Tariff and Solver in `src/controls.js`. `tariff:elecPrice` and `tariff:gasPrice` are schema-less (FR-008): they sit on a `prices: true` channel, reach no IDF object, and are applied to the billed meters afterwards by `src/bill.js`. Each note states that, and cites the source of its default price from `src/rates.data.js` (generated by `scripts/build-rates.mjs`) if the default comes from there; otherwise it says nothing of the default's source. The four Solver controls are mapped (FR-010) to `Building` (`src/model.js:2401-2405`). `solver:warmupMin` maps to `.minimum_number_of_warmup_days` (memo n=3039, 98 words; it exceeds the budget, so cite it by field name and summarise it, stating the schema default of 1). `solver:warmupMax` maps to `.maximum_number_of_warmup_days`, memo "EnergyPlus will only use as many warmup days as needed to reach convergence tolerance. This field's value should NOT be set less than 25.". The note must state how the desk's range relates to that advice. `solver:loadsTol` maps to `.loads_convergence_tolerance_value`, memo "Loads Convergence Tolerance Value is a change in load from one warmup day to the next". `solver:tempTol` maps to `.temperature_convergence_tolerance_value` (no memo; units deltaC, min 0). The applier writes `max(warmupMax, warmupMin)` (`src/model.js:2403`), and the warmup-maximum note must say so.

**Checkpoint**: `census.mjs` prints `missing: 0`, `src/controls.js` loads under the `CONTROL_NOTE` assertion, and the Model Console shows a `Note` fold on all 87 sweepable controls. US1 is complete and US3's content half is delivered.

## Phase 4: User Story 2: Understand a parameter before choosing it as a survey axis (Priority: P2)

**Goal**: every control row in the Design Space Survey's Axis X and Axis Y choosers offers the same note as the Model Console, revealed by click or tap, on available and refused rows alike, and never duplicating the row's reason.

**Independent test**: open E-02, open Axis X, open the `Note` fold on an available row and on a refused row, and confirm that the text matches the console fold word for word, that the chooser stays open and the selection is unchanged, and that the search filter still finds the row by a word from its note (quickstart.md gates 3 to 5).

- [X] T017 [US2] In `axisOffers` in `src/main.js` (the `offers.push({...})` at about line 10042), add `explanation: faceless || (reason && reason === control.note) ? null : control.note ?? null`. It must appear after `reason` is computed (lines 10029-10041), so that the comparison is made against the exact string the row will show (research.md R3, renamed per T005). Add a one-line comment giving the reason: the inert case already shows the note as its reason.
- [X] T018 [US2] In `src/main.js`, pass the field through `axisOptions` (about line 10556) by adding `explanation: offer.explanation` to the option literal. Then, in `pickList`'s `draw` (about lines 10147-10162), after the row's `button` is built and before it is appended to its row container, add `fold(\`pick:${label}:${option.id}\`, 'Note', { label: \`Note on ${option.label}\` }, el('p', 'ctl-note', option.explanation))` as a sibling that follows the button, never a child of it. Do this whenever `option.explanation` is set, whether the row is available or refused. Read how `draw`'s return value is appended to `rows` and to the list (about lines 10170-10200); if a row is a single `button`, wrap the button and the fold in one element so that the filter hides and shows them together. Use the `SUMMARY.note` wording ("Note"). If `SUMMARY` is not exported from `src/console.js`, export it rather than restating the string. The fold key includes the chooser's `label`, so Axis X and Axis Y hold their open state independently (spec edge case 3). The key persists in `openFolds` across the chooser's redraws.
- [X] T019 [US2] In the same `pickList` in `src/main.js`, extend the row's search text (about line 10179, `fold(\`${under?.dataset.group ?? ''} ${option.label} ${option.note ?? ''}\`)`) to include `option.explanation ?? ''`. Rename the local text-normalising function `fold` inside `pickList` (line 10143) to `searchable`, because it now shadows the imported `fold()` that T018 calls. Update every use of it within `pickList`.
- [X] T020 [US2] Check `src/style.css` (or the stylesheet that styles `.survey-option` and `.fold`) at 390 px and at desktop width. Confirm that a `.fold` placed after a `.survey-option` inside the chooser list lays out beneath its row, uses the existing fold styling, and does not widen the list. Add only the minimum rule needed; no new colour, icon or component (plan Non-goals). If a rule is added, add a matching `[hidden]` twin, because the filter hides rows by `hidden` (CLAUDE.md, "Any class that sets or unsets `display`").
- [X] T021 [US2] Write `chooser.mjs` in the scratchpad, following quickstart.md gates 3 and 4. It must hold `axisOffers`' derivation logic against `CHANNELS`, or, since `main.js` has a DOM and cannot be imported in Node, restate the derivation over `controls.js`, `study.js` and the default parameters. Assert that for every sweepable control, `explanation` is either byte-identical to `control.note` or `null` exactly when it would equal the row's reason. Record in the harness's header comment that it restates the derivation, and why.

**Checkpoint**: both axis choosers offer a `Note` fold on every control row that has a note. The console and the chooser read the same string, and the reading chooser's unit line (`option.note`) is unchanged.

## Phase 5: User Story 3: No slider is left unexplained (Priority: P3)

**Goal**: a sweepable control without a note cannot reach a build, so the coverage delivered in Phase 3 cannot regress.

**Independent test**: delete one covered control's `note` in a scratch copy of the tree, import `src/study.js`, and confirm that it throws `Error: <channel>:<key> has a face to sweep and no note` (quickstart.md gate 1).

- [X] T022 [US3] In `src/study.js`, after the declaration of `refusesSweep` (line 110) and beside the module's existing load-time checks, add a top-level loop over `CHANNELS` (already imported). For each control where `refusesSweep(control) === null` and `control.note` is not a non-empty string, throw `new Error(\`${channel.id}:${control.key ?? control.label} has a face to sweep and no note\`)`. Precede it with a one-line comment giving the reason: a face offered as a survey axis must be able to say what it is, the same rule `Landmark` holds for a band. Verify that `node -e "import('./src/study.js')"` loads cleanly after Phase 3, and throws before Phase 3 if T022 is done first.
- [X] T023 [US3] Run quickstart.md gate 1 in full with `census.mjs` plus the scratch-copy deletion test from this phase's independent test, and gate 2 with a harness that passes a 78-word string through `withinBudget(BUDGETS.CONTROL_NOTE, ...)` and confirms that it throws naming the budget.

**Checkpoint**: coverage is enforced at load; US1, US2 and US3 each pass their independent test.

## Phase 6: Polish and cross-cutting concerns

- [X] T024 [P] Add a section to `docs/design-notes.md` titled "A control's note, on two surfaces". State that the note is declared once on the control, is held to `CONTROL_NOTE`, and is required on every sweepable control by `study.js`. State that it cites the EnergyPlus schema field where one exists (FR-010) and its real source or a plain absence otherwise (FR-008). Record finding 3 (19 of 34 mapped fields carry no IDD memo, and one sits in an extensible group). Explain why the chooser draws it as a fold beside the button rather than as `option.note` (finding 2).
- [X] T025 [P] In `CLAUDE.md`, under "Controls (`src/controls.js`)", add to the "Add a control" bullet: a control with a numeric face needs a `note` (checked at load in `study.js`, at most 77 words by `CONTROL_NOTE`), citing its EnergyPlus schema field where it has one.
- [X] T026 [P] In `.interface-design/system.md`, in the section on a long list of offers (about line 900), add one line stating that a control row in the axis chooser carries its note as a `Note` fold beside the row, sharing the console's fold pattern, and that `option.note` remains the in-view short line.
- [X] T027 [P] Add an entry under "Added" in `CHANGELOG.md`: "Every slider parameter now carries an explanatory note, citing its EnergyPlus schema field where it has one, in the Model Console and in the Design Space Survey's axis choosers." Keep it to one or two sentences (fact, then reason).
- [X] T028 Run quickstart.md gate 5 on `npm run dev`: steps 1 to 5, including step 3 (an inert row shows one sentence, not two) and step 5 (390 px, touch emulation, no hover). Check the three `pickList` choosers (Axis X, Axis Y, Reading) for regressions, and confirm that the Reading chooser's unit line is unchanged. Re-run `census.mjs` and confirm that research.md's 87 / 42 / 45 figures are either still true before Phase 3 or have been updated to the final 87 / 87 / 0.
- [X] T029 Search the new notes and every edited markdown file for em-dashes (search for U+2014 over `src/controls.js` diff hunks and the edited `.md` files) and remove any that were introduced.

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none. T001 and T002 run in parallel.
- **Foundational (Phase 2)**: T003 before T004 (T004 reads `BUDGETS.CONTROL_NOTE`). T005 is independent of both.
- **US1 (Phase 3)**: needs T002 (citation source) and T004 (the budget that refuses an overlong note). T006 to T016 all edit `src/controls.js` and run in sequence.
- **US2 (Phase 4)**: needs T005 (the design it implements). Its code does not depend on Phase 3: before Phase 3, the fold simply appears on the 42 rows that already have a note. T017, then T018, then T019, all in `src/main.js`. T020 follows T018. T021 follows T017.
- **US3 (Phase 5)**: T022 must land after Phase 3 is complete, or the page throws at load for the controls still unnoted.
- **Polish (Phase 6)**: after the stories it documents. T024 to T027 run in parallel.

### User story dependencies

- **US1**: independent; this is the MVP.
- **US2**: independent of US1 in code, but only fully delivers SC-002 once US1 has run.
- **US3**: its gate depends on US1's content being complete.

## Parallel opportunities

```text
Phase 1:  T001 || T002
Phase 2:  T003 -> T004,  with T005 in parallel
Phase 3 || Phase 4: US1 (controls.js) and US2 (main.js, style) touch different files and can proceed side by side once Phase 2 is done
Phase 6:  T024 || T025 || T026 || T027
```

## Implementation strategy

### MVP first (US1 only)

1. Phase 1 and Phase 2.
2. Phase 3: write the 45 notes. The Model Console already draws them.
3. Stop and validate: `census.mjs` shows `missing: 0` and the console folds read correctly.

### Incremental delivery

1. Setup and Foundational: the budget is enforced over existing notes.
2. US1: every console slider is explained (MVP).
3. US2: the survey axis choosers show the same notes.
4. US3: the coverage gate prevents regression.
5. Polish: documentation, changelog, driven check.
