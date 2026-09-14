---

description: "Task list for SI and IP units"
---

# Tasks: SI and IP Units

**Input**: Design documents from `/specs/010-si-ip-units/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: this repository has no test runner and no linter. Verification is throwaway Node harnesses and driven passes, as `CLAUDE.md` and the constitution's workflow gates require. The harness tasks below are those checks, placed in the phase whose work they prove, and they are not optional: gates 1 to 5 apply to every change that reaches the model, the link or a reading.

**Organization**: tasks are grouped by user story so each can be implemented and verified on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task serves (US1 to US5)
- Every task names the exact file it touches

## Path Conventions

Flat `src/` at the repository root, as `plan.md` fixes. Harnesses live in the scratch directory, never in the repository.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: capture the "before" that SC-002 and SC-008 compare against. Doing this after the first edit makes the comparison worthless.

- [X] T001 Write the baseline IDFs at the default desk and three other positions using the spec 007 byte-identity harness, saving them to the scratch directory as the pre-change reference
- [X] T002 [P] Collect a link fixture set in the scratch directory: one link per channel off its default, plus links carrying values on the eleven controls listed in research R4, each recorded with the desk it loads to
- [X] T003 [P] Record the current SI lettering of every strip, reading, table and drawing at desktop and at 390 px, as the reference for "switching back restores the sheet exactly" (US1 scenario 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the module every story letters through, the kinds on the root declaration, and the grid that makes round IP figures reachable.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

- [X] T004 Create `src/units.js` with the three exact constants (FT, BTU, LB) and the frozen `Kind` class carrying id, si, ip, factor, offset, digits and prefix, per [data-model.md](./data-model.md)
- [X] T005 Declare the frozen `KINDS` roster in `src/units.js`: the 19 converting kinds and the 12 identity kinds exactly as [contracts/quantity-kinds.md](./contracts/quantity-kinds.md) fixes them, every factor written as an expression of the constants and never as a decimal literal
- [X] T006 Implement `system()` and `setSystem(next)` in `src/units.js`, holding one module-level value and notifying one subscriber, with no import of `model.js`, `permalink.js` or any applier
- [X] T007 Implement `convert(kind, value)`, `letter(kind, value, digits)` and `precisionFor(kind, step)` in `src/units.js`, where `precisionFor` is `floor(-log10(step * factor))`
- [X] T008 Implement `parseIn(kind, text)` in `src/units.js`: strips either system's unit suffix and the `R-` prefix, returns the SI number, returns null for anything else
- [X] T009 Implement `assertKinds()` and `assertReachable(control)` in `src/units.js` and run `assertKinds()` at module load, with the messages naming the offending declaration
- [X] T010 [P] Write the Node harness for `src/units.js` in the scratch directory covering quickstart section 1: the anchor conversions, the temperature against temperature-difference split, the whitespace-free check against `copy.js`'s `words()`, the four `assertKinds` failure cases, and the `parseIn`/`letter` round trip for every kind
- [X] T011 Add a `kind` field to `Ruled` in `src/controls.js:316-331` and rewrite `Ruled.format` (`:333-336`) to letter through `units.js`, taking its IP precision from `precisionFor(kind, step)` and keeping the `zero` word ahead of both systems
- [X] T012 Assign a kind to all 87 numeric controls in `src/controls.js`, using each control's existing `unit` string as the mapping, and give the identity kinds explicitly rather than leaving them blank
- [X] T013 Refine the eleven steps in `src/controls.js` exactly as research R4 lists them (ctxDistance and ctxHeight to 0.1, ctxWidth to 0.25, openDeltaHi to 0.5, openMaxWind and ventMaxWind to 0.25, occupancy to 0.05, activity to 0.25, outdoorAir to 0.25, supplyMaxT to 0.5, gridFactor to 0.25), with a comment carrying the measurement that forced each
- [X] T014 Run `assertReachable` over every `Ruled` control at module load in `src/controls.js`, beside the existing `readLandmarks` assertions
- [X] T015 [P] Write the Node harness for the grids in the scratch directory covering quickstart section 2: the superset walk over all eleven refined controls, reachability for every convertible control, landmark reachability on both grids, and both ends of every control
- [X] T016 Add the re-letter entry point in `src/console.js`: a function that calls `api.sync()` (`:2262-2265`) and then replays the render of the last landed outcome, starting no run and marking nothing stale

**Checkpoint**: `units.js` letters every kind, every control carries one, the grid gives round IP figures, and both harnesses pass.

---

## Phase 3: User Story 1 - Read the whole sheet in IP (Priority: P1) 🎯 MVP

**Goal**: one toggle re-letters every figure on the page, and switching back restores the sheet exactly.

**Independent Test**: at the default desk and three others, switch to IP and walk every strip, reading, table, drawing, study and survey; confirm every dimensioned figure is in IP outside the identity kinds, that no run started, and that switching back matches the T003 reference.

### Implementation for User Story 1

- [X] T017 [US1] Add the segmented SI/IP selector to `index.html` as static markup, with the radiogroup roles, the label and the standing line from [contracts/units-toggle.md](./contracts/units-toggle.md) — **later moved**: built in the field's control row as R7 called for, then moved into the header stamp as a fifth row, because at control-row scale it stood beside the two buttons that start runs and read far louder than a mode set once. The contract and `.interface-design/system.md` both record the move
- [X] T018 [US1] Style the selector in `index.html` on the design system's segmented selector pattern, with no new hue and the active segment carried by fill as well as by `aria-checked`
- [X] T019 [US1] Wire the selector in `src/main.js` to `setSystem` and the Phase 2 re-letter path, announcing the change in a `role="status"` element **of its own** — the page has no live region, and `#status` is written by `markStale` on every drag, so making that one live would speak a stale note whenever a slider settled
- [X] T020 [P] [US1] Letter the strip meters, the plan key bar cap (`src/console.js:992`) and the study card series (`:2020-2023`) through `units.js`
- [X] T021 [P] [US1] Give `watts()` (`src/readings.js:193-199`) a kind and replace its baked-in kW and W strings, keeping the half-watt threshold a threshold in watts
- [X] T022 [P] [US1] Replace each `Instant.letter` closure in `src/readings.js:279-379` with a kind, keeping `flowWord`'s in and out wording beside every rail figure
- [X] T023 [P] [US1] Give `Quantity` a kind in `src/study.js:216-274` and validate it in the constructor beside `unit` and `digits`
- [X] T024 [P] [US1] Give `Reading` a kind in `src/survey.js:158-205` and letter `Reading.format` (`:200-204`) through `units.js`
- [X] T025 [US1] Route the four survey bypasses in `src/main.js:9067`, `:9136`, `:9148` and `:10394` through `Reading.format`, so those figures carry a unit at all — the two spot figures through `format`, the two axis-ruled levels through a new `Reading.figure` with `unitNow` on the axis name, since those axes letter their unit once by design
- [X] T026 [US1] Give `BillColumn` a kind in `src/main.js:1363-1384` and letter its columns through `units.js`
- [X] T027 [US1] Convert the bill card build-up literals in `src/main.js:1644-1826`, which sit beside the `BillColumn` figures in the same card, keeping billed energy in kWh and money in the tariff's currency
- [X] T028 [US1] Give `SCHEDULE_ROWS` kinds in `src/main.js:1220-1246` and letter the schedules table through them, including the two hardcoded temperatures at `:10517-10519`
- [X] T029 [US1] Convert the quantities panel in `src/main.js:2346-2376`, replacing the local `m2()` helper and the m³ and m⁻¹ literals with kinds
- [X] T030 [US1] Convert the derived readings map in `src/main.js:2702-2770`, about twenty sites, each taking the kind its quantity belongs to
- [X] T031 [US1] Convert the window and air readouts in `src/main.js:2806-2842`, including the three U-factors inside `trio()`
- [X] T032 [US1] Convert the plate and trace chart figures in `src/main.js:735`, `:811` and `:837`, giving the unlettered chart figure at `:837` its unit
- [X] T033 [US1] Convert the axonometric dimension labels in `src/main.js:430-438`
- [X] T034 [US1] Convert the relief and plan axis text in `src/main.js:10384-10396` and `:10452`, leaving `src/relief.js` a pure consumer of pre-lettered strings
- [X] T035 [US1] Convert the station picker distance at `src/main.js:3710`, and in `src/weather.js:142-148` keep `degreeDays` on its Celsius bases with the reading stating so, per research R11
- [X] T036 [US1] Letter the description's quantities in `src/describe.js` through `units.js`, replacing the hand-typed unit words at `:223-273`, `:509`, `:548`, `:604` and `:645`, and leaving every cited figure untouched
- [X] T037 [US1] Assert every always-visible declaration string this feature adds or lengthens against `src/copy.js`, and confirm no IP string pushes a strip line, step, standing line or fold summary over its budget — the assertion earned itself immediately: the contract's own standing line was 16 words against the 15-word `STANDING` budget and threw the page at load until it was shortened
- [~] T038 [US1] Drive quickstart section 4 steps 1, 2, 5 and 8 — **steps 1 and 2 driven and passing**: the full IP walk (quantities, fields, schedule and scoreboard units, description) and the exact restore, measured as a field-by-field snapshot comparison giving `restoredExactly: true` with `runs` unchanged at 1 across both switches and zero console errors. **Steps 5 and 8 not driven**: the switch during a run in flight, and the toggle with the engine deliberately broken, both still to be walked by hand

**Checkpoint**: the whole sheet reads in IP and back, with no run started and no reading changed.

---

## Phase 4: User Story 2 - Set the model in IP (Priority: P1)

**Goal**: dragging and typing in IP, with every value surviving a reload, a shared link and a switch there and back.

**Independent Test**: set every control to at least three positions by dragging and typing in IP, including both ends and a position inside each landmark band; reload, open the link elsewhere, switch there and back, and confirm the value letters identically every time.

### Implementation for User Story 2

- [X] T039 [US2] Extend `readQuantity` in `src/controls.js:138-151` to accept the IP unit suffix, the SI unit suffix whichever system shows, and a leading `R-` where the kind letters with that prefix, refusing anything else whole
- [X] T040 [US2] Confirm `Ruled.parse` (`:344-346`) still returns an on-grid value through `onFace` for every accepted spelling, so nothing off the step grid can reach `params`
- [X] T041 [US2] Confirm `src/field.js` needs no change: it delegates to `control.format`, and `show()` still returns early while the box holds focus so a switch cannot type over a reader
- [X] T042 [P] [US2] Extend the Phase 2 grid harness with typed entry: for every control, the lettered IP figure returns the same model value, the other system's unit returns the same value, and a unit foreign to the kind is refused
- [X] T043 [US2] Verify the codec is untouched: round-trip every T002 link fixture, confirm each loads to the same desk and re-encodes byte-identically, and that `LINK_VERSION` is still `v1` with `MIGRATIONS` empty
- [X] T044 [US2] Encode the same desk with SI showing and with IP showing and confirm the identical string (FR-017)
- [X] T045 [US2] Drive quickstart section 4 step 3: drag the width in IP through 50.0, 50.1, 50.2 ft, type `60`, type `R-20`, then select each box and retype exactly what it letters and confirm no value changes — driven: width `50.0 ft` → typed `60` → `60.0 ft` with the link carrying `width=18.29`; wall resistance `R-13.0` → typed `R-20` → `R-20.0` with `wallR=3.52`; heating setpoint `68 °F` → typed `72` → `72 °F` with `heatSet=22`; retyping what each box letters changed nothing

**Checkpoint**: the desk can be set in IP, and nothing about the link or the grid has moved.

---

## Phase 5: User Story 3 - Landmarks, standards and verdicts in IP (Priority: P2)

**Goal**: bands read in IP and light at the same model values, and no verdict changes with the toggle.

**Independent Test**: drag every control with landmarks across its range in both systems, confirm each band is reachable and lit at the same model value; apply each standard and confirm every verdict is identical across systems.

### Implementation for User Story 3

- [X] T046 [P] [US3] Letter every landmark band edge through `units.js` wherever the console rules them, taking the reading of which mark is lit from `landmarkAt` alone, as today — satisfied by construction: `Landmark.caption` and `landmarkSummary` letter through `control.format`, which now converts, and `landmarkAt` is untouched
- [X] T047 [P] [US3] Give `Target` a kind in `src/schemes.js:155-224` and leave `Spec.why`'s published arithmetic exactly as written (FR-010)
- [X] T048 [US3] Letter the scoreboard through the kind in `src/main.js:5272` and the nine sites that append `target.unit` separately (`:5740-6053`), so the figure and its unit stop being composed apart
- [X] T049 [P] [US3] Give `Criterion` identity kinds in `src/tm59.js:365-385` for its counts and percentages, and letter the temperatures it is judged on through the temperature and temperature-difference kinds
- [X] T050 [US3] Confirm no verdict, pass, fail or `Unjudged` line changes with the system, and that a target with no line still shows no verdict — by construction: `Target.clears` and `conformance()` compare the raw SI reading against the raw SI limit and never reach the lettering, and no `letter`/`unitIn`/`figureIn`/`convert` appears on any verdict path in `schemes.js`
- [X] T051 [US3] Confirm every landmark note and citation still reads as published in both systems (FR-010), including the imperial figures already carried into SI at `src/controls.js:2076-2100` and `:2352-2381` — notes are declaration strings that no lettering path touches; only a band's *edges* letter, through `Landmark.caption`

**Checkpoint**: the sheet's claims about the world read in either system and say the same thing.

---

## Phase 6: User Story 4 - The choice follows the reader (Priority: P2)

**Goal**: the choice is remembered, the first visit guesses well, and the link stays neutral.

**Independent Test**: choose IP, reload and reopen the browser, and confirm it opens in IP; open a link in a browser that has never visited and in one that last chose SI, and confirm each opens in the system this spec prescribes; repeat in a private window.

### Implementation for User Story 4

- [X] T052 [US4] Read and write `shoebox-units-v1` in `src/main.js` through the real-write probe at `:4383-4392`, holding only `'si'` or `'ip'` and treating anything else as absent — the probe had to be hoisted above the toggle that reads it at boot, or its `const` is in the temporal dead zone and the whole boot dies
- [X] T053 [US4] Implement the first-visit default in `src/main.js`: IP when `navigator.language` carries the region `US`, SI otherwise and when it carries no region, reaching nothing but the lettering — observed working: a first visit on a US-region browser opened in IP
- [X] T054 [US4] State beside the toggle that the choice will not be remembered where the probe fails, using the line from [contracts/units-toggle.md](./contracts/units-toggle.md)
- [X] T055 [US4] Confirm the system is absent from `schemeHash`, the run bundle manifest and every kept scheme, so a saved scheme and a shared link carry no unit system — `shapeKey` is built from `params` alone, and no reference to `system()`, `inIP()` or the storage key exists in `main.js`, `bundle.js`, `schemes.js` or `permalink.js`
- [~] T056 [US4] Drive the four states — **three covered**: the returning reader (stored `ip`, reloaded into IP; stored `si`, reloaded into SI), the first visit on a US-region browser (opened in IP with no stored choice), and a link from a reader of the other system (the link carries no unit key at all, proven by T044's identical encoding and by the storage being read only at boot). **Not driven**: a private window, where the write probe fails — the refusal line is wired to the probe but was not observed firing

**Checkpoint**: the toggle is remembered where it can be, guessed where it cannot, and never travels in a link.

---

## Phase 7: User Story 5 - What leaves the sheet says which units it is in (Priority: P3)

**Goal**: copied text names its units, the model files stay SI and say so, and a report records the system.

**Independent Test**: in IP, copy each table the sheet offers, download the run's files, and file a report; confirm each copied table names its units, the model file is byte-identical to the SI download, and the report states the system.

### Implementation for User Story 5

- [X] T057 [P] [US5] Name the units in every table or text the sheet offers for copying in `src/main.js`, carrying the unit the figure was lettered in — nothing to do: the sheet's only copy offer is "Copy scheme link", which hands out a URL carrying no figures. FR-018 is satisfied because no table or text with figures is offered for copying; adding one would be scope the spec did not ask for
- [X] T058 [P] [US5] Add the unit system to the `desk` captured item's lines in `describeScreen()` at `src/main.js:10740-10743`, which `src/report-sheet.js:213` already letters
- [X] T059 [US5] State where the run's files are offered that the model files are in SI, and confirm the bundle is byte-identical in both systems
- [X] T060 [US5] Give `SHELF_COLUMNS` kinds in `src/main.js:6071-6081` so the kept-scheme shelf letters in the reader's system while the stored scheme stays a permalink

**Checkpoint**: nothing leaves the sheet with an unnamed unit, and nothing that leaves carries the reader's choice into a model.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T061 [P] Record the segmented selector as a page-level mode control in `.interface-design/system.md`, in the same change that introduces it (workflow gate 8)
- [X] T062 [P] Add a Units section to `docs/design-notes.md` carrying the measurements: the 1.64 ft step, the eleven divisors and their zero-drift walk, the two boundaries that disagree, and the word-count reason IP strings are single tokens
- [X] T063 [P] Add the subsystem line, the two new load-time invariants and the `shoebox-units-v1` key to `CLAUDE.md`
- [X] T064 Check whether any general note in `src/tour.js:80-200` letters a unit; if one does, route it through `units.js` and bump the storage key to `shoebox-general-notes-v5` (workflow gate 6) — checked: no note letters a unit, so no step changes meaning and the key stays `shoebox-general-notes-v4`
- [X] T065 Re-run the IDF byte-identity harness against the T001 baselines in both systems and confirm byte-identical IDFs and byte-identical results (SC-002) — measured: with the sheet in IP, all eight desk positions write files byte-identical to the baseline taken before any of this existed
- [X] T066 Drive quickstart section 4 at 390 px with the keyboard alone, confirming both segments labelled, no clipped figure, no horizontal scrolling and every reading announced (SC-009) — **measured, and passing** (see T079 for how the viewport was made to narrow)
- [X] T067 Run quickstart section 5: coarsen a fixture control's step, name a kind that is not in the roster, and put a whitespace-bearing IP string in the roster, confirming each throws at load with a message naming the offender — all three are asserted by the Node harnesses: the coarsened fixture is refused naming the control and the step ("one 0.5 m step is 1.640 ft, coarser than the 1 ft it would be lettered to"), and `assertKinds` throws on a duplicate id, a missing unit string, a zero factor, an identity kind whose strings differ, a converting kind that converts by 1, and a whitespace-bearing IP string
- [~] T068 Walk the full sheet in IP one last time and confirm zero dimensioned figures remain in SI outside the identity kinds (SC-001), and time the switch (SC-003) — **walked at desktop width with no SI figure found outside the identity kinds**: quantities panel, all margin fields, the schedule and scoreboard unit columns, the axonometric dimensions, the plate and its datums, and the description all read in IP. **Not covered**: the study cards, the E-02 survey and relief, and the bill card were not opened during the walk, and the switch was not timed against SC-003's tenth of a second

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, and must run before any edit or its baselines are worthless
- **Foundational (Phase 2)**: depends on Setup, and blocks every user story
- **User stories (Phases 3 to 7)**: all depend on Phase 2. US1 before the rest in practice, since it converts the lettering surface the others read
- **Polish (Phase 8)**: depends on the stories being complete

### User Story Dependencies

- **US1 (P1)**: needs only Phase 2. It is the MVP
- **US2 (P1)**: needs Phase 2. Independent of US1's lettering work, since it touches entry rather than display
- **US3 (P2)**: reads through US1's converted surfaces, so it lands cleanest after US1
- **US4 (P2)**: needs the toggle from US1 to have something to remember
- **US5 (P3)**: needs US1's lettering to have a unit to name

### Within Each Story

- Kinds on a declaration before the sites that letter through it
- The harness beside the code it proves, not after the phase
- The driven pass last, since it is the only check that sees the whole sheet

### Parallel Opportunities

- T002 and T003 in Setup
- T010 and T015, the two harnesses, once their subjects exist
- Across Phase 3, the per-module conversions T020 to T024 touch five different files and can run together; the `main.js` tasks T025 to T035 all touch one file and must not
- T046, T047 and T049 in US3; T057 and T058 in US5; T061, T062 and T063 in Polish

---

## Parallel Example: User Story 1

```bash
# Five different modules, no shared file:
Task: "Letter the strip meters and study card through units.js in src/console.js"
Task: "Give watts() a kind in src/readings.js"
Task: "Replace each Instant.letter closure with a kind in src/readings.js"
Task: "Give Quantity a kind in src/study.js"
Task: "Give Reading a kind and letter Reading.format in src/survey.js"

# Then the main.js run, strictly in sequence (one file):
# T025 to T035
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: capture the baselines
2. Phase 2: `units.js`, the kinds, the refined grid, both harnesses
3. Phase 3: the toggle and the lettering surface
4. **Stop and validate**: the whole sheet reads in IP and back, the IDF is byte-identical, and no run was started
5. Ship if ready: a US engineer can read the sheet, which is most of the request

### Incremental Delivery

1. Setup and Foundational give a module that letters and a grid that reaches
2. US1 makes the sheet readable in IP (MVP)
3. US2 makes it settable in IP
4. US3 brings the claims about the world across
5. US4 remembers the choice
6. US5 names the units on the way out

### The one risk worth watching

Phase 3's `main.js` run, T025 to T035, is about forty lettering sites in one file with no shortcut and no parallelism. It is where this feature is won or lost; the census in research R2 is the map, and the check at T068 is what proves none was missed.

---

## Notes

- [P] means a different file and no unfinished dependency
- Every task names its file, and most name the lines the census found
- No applier in `src/model.js` changes in any task, which is what keeps the IDF byte-identical
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own

---

## Phase 9: Convergence

**Purpose**: close the gap between what the spec, the plan and Phases 1 to 8 call for and what the code now does. The census in research R2 predicted the risk and T068 named it; the three surfaces T068 left unwalked turn out to carry six un-converted lettering sites between them, which is why the verification gaps below are listed beside the code ones rather than after them.

- [X] T069 **CRITICAL** Take the suffix `stopOf` strips from `unitIn` rather than from `axis.control.unit` in `src/main.js:10613-10616`, where the match fails the moment `formatValue` letters in IP and the relief axis draws "50.0 ft" under a name lettered "Width ft", per Constitution IV, No Silent Fallbacks (contradicts)
- [X] T070 Add a `unitNow` getter to `Control` in `src/controls.js` beside `format` and `figure` (`:373`, `:389`), and route `entry.perUnit` (`src/pull.js:295`) and the pull ranking table's "Per unit" and "Room left" cells (`src/main.js:10428`, `:10430`) through it, so neither the unit string nor `entry.room` stands in SI beside a face lettering IP, per FR-004 (missing)
- [X] T071 Letter the carbon rate in `renderBillFinding` (`src/main.js:1928`) through `letter(KINDS.carbonIntensity, ...)` as its sibling at `:1697` already does, so the meter head and the sentence directly under it stop reading one rate in two systems, per FR-005 (contradicts)
- [X] T072 Convert the bill schedule's intensity row head at `src/main.js:1890`, "Per m² of floor, per year", through the kind its column letters, per FR-005 (missing)
- [X] T073 Convert the blower-door derivation in `derivedLines` (`src/main.js:2874-2875`), whose envelope area and zone volume stay in m² and m³ under an IP sheet, per FR-005 (missing)
- [X] T074 Convert the pinned instant's zone temperature (`src/main.js:3073`), which letters °C while the rail's own ends letter °F, per FR-005 (missing)
- [X] T075 Convert the two computed figures in the run's-own-hour chip `sub` (`src/main.js:3362-3363`), a live temperature difference and a temperature rather than a citation, per FR-005 and FR-009 (missing)
- [X] T076 Convert the station picker's elevation (`src/main.js:4308`), missed while the distance on the same picker converts at `:4060-4063`, per FR-005 (missing)
- [X] T077 Letter the title block's site elevation at its render site in `src/main.js` (`:4351`, `:6720`) rather than in `src/model.js:3301`, since `data-model.md` forbids `model.js` importing `units.js`, per FR-006 (missing)
- [X] T078 State the Celsius base beside the degree-days reading (`src/weather.js:142-148`, rendered at `src/main.js:4070`), which research R11 and T035 both require and which today is said only in a code comment at `src/units.js:252`; `src/weather.js` is listed CHANGED at `plan.md:106` and was never modified (partial)
- [X] T079 Drive quickstart section 4 at 390 px with the keyboard alone on a viewport that actually narrows, since the attempt at T066 measured `innerWidth: 1920` throughout and left the criterion unproven, per SC-009 (partial) — **done and passing.** `resize_window` is the wrong instrument: it reports success and the page goes on measuring the old width (1920 at T066, 1200 here), so nothing measured through it would have been true. A same-origin 390 px iframe gives a viewport that genuinely narrows, because CSS media queries answer to the iframe's own viewport and the whole app boots inside it. Measured there: `innerWidth` 390, the 780px query firing, `scrollWidth` 390 against `clientWidth` 390 so nothing scrolls sideways, and the stamp, units row, both segment labels and the standing line all unclipped. Keyboard alone: focus SI, ArrowRight checks IP, moves the roving tabindex to `si:-1 / ip:0`, carries focus, announces "IP. Every figure on the sheet re-lettered."; `t-site` reads 6,001 ft and ArrowLeft restores 1,829 m exactly. **Caveat**: a 390 px viewport inside a desktop browser, so device pixel ratio and touch behaviour are not covered by this
- [X] T080 Walk the study cards, the E-02 survey and relief, and the bill card in IP, the three surfaces T068 left unwalked and where this convergence found six un-converted sites, and time the switch against a tenth of a second, per SC-001 and SC-003 (partial) — **all three walked.** Study cards: axis ends `4.00 m / 40.00 m` → `13.1 ft / 131.2 ft`. E-02: the reading roster (`TEDI kBtu/ft²·yr`, `Peak heating load Btu/h·ft²`), the plan, the spot figure, the coverage line and the relief's standing axis all in IP, with `Hours above 25 °C` correctly left in SI as a published criterion. Bill card: the whole schedule, the build-up notes and the intensity row. The switch timed seven times, 14.2 to 41.4 ms against a tenth of a second. The walk found five of the six defects listed below
- [X] T081 Convert the live control values in the two refusal sentences (`src/controls.js:2848`, `:2895`), leaving the `COINCIDENT` tolerance as the engine's own fact, and drive quickstart section 4 step 6, per FR-005 (partial) — **converted and SI-verified, not driven**: the opening's two sides letter through `length`, the frame through `lengthSmall` (its own control's kind, so inches not feet) and the overhang depth through `length`; `COINCIDENT` keeps its metres as the engine's own constant. The harness holds each to its SI spelling character for character (`2.50 × 1.20 m`, `0.050 m`, `0.05 m`). Forcing the refusal on the page is quickstart step 6 and needs the browser
- [X] T082 Letter the non-currency branch of `Rate.text` (`src/rates.js:216-217`) through its kind, or make it refuse, so a future grid-rate caller cannot land in SI unnoticed, per FR-007 (partial)
- [~] T083 Drive quickstart section 4 steps 5 and 8, the switch during a run in flight and the toggle with the engine deliberately broken, which T038 left undriven, per US1/AC4 (partial)
- [ ] T084 Drive the storage-refused state in a private window and confirm the `units-forgets` line shows, which T056 left unobserved, per FR-015 (partial)
- [~] T085 Drive quickstart section 4 step 4, switching units while a study runs, which no task covers and which `reletterSheet`'s own comment says it was written to protect, per the spec edge case "Switching during a study or survey" (missing)

### Phase 9 outcome

**The twelve code tasks are done and checked outside the browser.** The
production build is clean (88 modules) and a Node harness over `units.js`,
`controls.js` and `pull.js` passes: every rewritten string comes back character
for character in SI, and all 87 ruled faces satisfy
`format(v).endsWith(unitNow)` in **both** systems.

The harness caught two defects in the convergence's own code, neither of which
the SI walk would have found:

1. **A span is not a value.** `roomSaid` lettered E-02's "Room left" through the
   control's `quantityKind`, so a setpoint's 5 K of room read `41 °F` — the
   Fahrenheit offset riding a difference, the trap `temperatureDifference` was
   split out for, arriving by a second route. `deltaKindOf` now owns the rule and
   `Ruled.spanKind` asks it. The column also keeps a flat two decimals rather
   than the control's IP precision, which had rounded `0.9` of room to `1`.
2. **A prefixed kind carries no suffix.** `unitNow` restated `letter`'s
   composition instead of sharing it, so `resistance` — which letters `R-29.0`
   and nothing after it — offered `h·ft²·°F/Btu` to head an axis of stops that
   already name themselves. `letter` is now composed from `prefixIn` and
   `suffixIn`, and `unitNow` is `suffixIn`. `survey.js`'s `Reading.unitNow` had
   the same latent bug and is fixed with it.

Both are recorded in `docs/design-notes.md` under "Units, SI and IP" and as
invariants in `CLAUDE.md`.

### Then the page was driven, and driving it found six more defects

The browser extension connected later in the session and the sheet was walked.
Everything below was measured, not reasoned about.

**Confirmed working:** SC-003, the switch, at 14.2, 15.5, 19.0, 29.7, 30.4, 36.9
and 41.4 ms across seven measurements against a hundred-millisecond budget, with
the status line unchanged and `runs` never moving — no solve started. SC-009 at a
genuine 390 px viewport (T079). The exact SI restore, field by field. Study cards,
the axonometric, the datums, the plate, the schedules, the scoreboard, the bill,
the survey plan, the relief and the station picker all lettering in IP with
`siLeftovers: []`. Zero console errors throughout.

**Six defects the walk found, all fixed:**

1. **The pinned hour was a stored label.** `readAt` composed `lastAt.text` as a
   lettered string, so the line read `zone 32.7 °C` under an IP sheet until the
   next run replaced it. Now a frozen `ReadInstant` holding the value, with
   `text` a getter. Verified on the page: `zone 91 °F`.
2. **Study button labels never converted at all** — the one lettering nobody can
   see. Fixed with `studySweeps`, replayed from `reletter()`; now `sweep from
   50 °F to 79 °F`, and the night setback correctly `18 Δ°F`.
3. **`tooShallow` lettered `0.0 ft`**, rounding away the very figure the sentence
   exists to quote. Now inches: `0.39 in`.
4. **The bill's intensity head converted without its cells** — `Per ft² of floor,
   per year` over the identical 40.7 / 1.42 / 8.4 the `Per m²` row showed. The
   denominator now converts: 3.8 / $0.13 / 0.8, ratios 10.711 and 10.923 against
   the exact 10.764.
5. **The survey axis name stayed SI** — `Width · m` over stops reading 13.1 to
   131.2 ft, `stopOf`'s other half. Now `Width · ft`.
6. **`amountOn`, `within` and `formatEffect`** all read `.unit`. `formatEffect`
   is the worst: the Effect column is Δreading ÷ Δcontrol, so neither half was
   converting and the *number* was wrong, not just its label.

**Still not driven**, and stated rather than assumed:

- **T083 step 8**, the toggle with the engine deliberately broken.
- **T084**, the private-window storage refusal. The `units-forgets` line is wired
  to the write probe and hidden when the probe succeeds, but was never seen firing.
- **T085 / T083 step 5, a switch strictly mid-run.** Repeatedly attempted. A
  pooled design-day sweep of 22 samples lands in under 120 ms, faster than the
  shortest gap that can be scheduled, so every attempt measured a settled page.
  With a weather year attached one annual run takes 34 s, and a switch was made
  with the pull's run genuinely in flight: it took 15.5 ms, re-swept nothing
  (`noResweep`), and the pull afterwards completed to "44 controls read, 46
  inert" with no console errors. That is good evidence for the invariant the
  requirement is about — a switch neither cancels nor restarts a run — but it is
  not the literal scenario of dimmed figures re-lettering while still dimmed.
- **`within` and `formatEffect` are code-complete and build-verified but not yet
  seen on the page**: the renderer froze under 44 queued annual pull runs before
  the comparison could be taken, and both re-render paths defer a frame, so an
  earlier capture read pre-switch DOM and proved nothing.

---

## Phase 10: Convergence

**Purpose**: a second pass over the same artifacts against the code as built.
Phase 9 closed what the census in research R2 predicted. What is left sits in the
two lettering surfaces a census could not find, because neither carries a `unit`
field to grep for: the generated paragraph composes its units as prose tokens
beside `num()`, and the overheating précis letters through a local `toFixed`
helper. Both were converted in part and missed in part, and the paragraph's
misses are the worse kind, since `num()` converts the figure and leaves the unit
behind. Three more findings are the spec's own text having fallen behind the
code, which is a trap for the next change rather than a defect in this one.

**Still open from Phase 9 and deliberately not re-issued here**: T083 (the switch
with a run in flight, and the toggle with the engine broken), T084 (the private
window's storage refusal) and T085 (the switch mid-study). All three are driven
checks, all three are still unchecked above, and re-numbering them would only
hide which attempt was which.

- [X] T086 **CRITICAL** Letter the six hand-typed SI unit tokens in the generated paragraph through `unitIn` in `src/describe.js` (`:358`, `:361`, `:369` and `:399` through `KINDS.temperature`, `:513` through `KINDS.airflowPerPerson`, `:686` through `KINDS.power`), where `num()` already converts the figure through `Ruled.figure` (`src/controls.js:388`), so each one letters a converted number under an SI unit and a 21 °C setpoint reads `69.8 °C`: the shape of wrong figure that still looks like a reading, arriving by the one route T036 did not close. `:513` and `:686` spell their units as prose (`L/s per person`, `kW of grounds lighting`), so each needs a stated choice between the kind's own string and an SI wording kept as it was; the correct pattern is already in the same file at `:655-663`, per FR-005 (contradicts)
- [X] T087 Convert the measured adaptive line at `src/main.js:5843` and `:5875`, whose `f1c` (`:5627`) is a bare `toFixed(1)` that converts nothing, so the one note the précis may never fold (its own docstring fixes that on FR-006 at `:5819-5822`) letters °C on an IP sheet while every other temperature on the page reads °F. These are the run's own measured figures (`line.low`, `line.high`, `line.mean`), not published constants, per FR-005 (missing)
- [X] T088 Decide, and state in the code, whether TM59's published clamps and thresholds at `src/main.js:5882`, `:5887`, `:5900` and `:5921` stay as published: they are citations FR-010 freezes, but `:5882` and `:5887` append to the same sentence as T087's figures, so converting one without the other leaves a single sentence carrying two conventions, per FR-010 (partial)
- [X] T089 Record the nine SI `digits` widenings that rode along with the eleven refined steps (`ctxWidth` 0 to 2, `openDeltaHi` 0 to 1, `openMaxWind` 1 to 2, `ventMaxWind` 1 to 2, `occupancy` 1 to 2, `activity` 0 to 2, `outdoorAir` 1 to 2, `supplyMaxT` 0 to 1, `gridFactor` 0 to 2), which `onFace`'s rounding to the step's decimals forces and which `research.md:53` and `data-model.md:65` both state do not happen. The code is right and CLAUDE.md already carries the invariant; what is missing is the deviation on the record, so that `40.00 m` where an older sheet lettered `40 m` is an accepted consequence with its measurement beside it, per SC-008 (contradicts)
- [X] T090 Letter `Bearing`'s own degrees through `KINDS.angle` in `src/controls.js:565-568`, the one numeric face on the desk that letters a unit without asking `units.js`. No figure is wrong, since degrees are an identity kind, but the unit is stated in a second place and single-sourcing is what Principle III asks for, per FR-007 (partial)
- [X] T091 Drive `within` (`src/main.js:10231`) and `formatEffect` (`:10647`) on the page in IP, the two figures Phase 9 left code-complete and build-verified but never seen, the renderer having frozen under 44 queued annual runs before the comparison could be taken. `formatEffect` is the one place this feature produced a wrong *number* rather than a wrong label, so it is the one that most needs to be seen, per FR-005 (partial)
- [X] T092 Measure SC-004 as it is written: at least 200 lettered IP figures recomputed from the model's SI value with the published exact factor and checked to the stated precision. The Phase 2 harnesses cover the anchor conversions, a `parseIn`/`letter` round trip per kind, and `format`/`unitNow` agreement over all 96 ruled faces in both systems, which is a different and narrower claim, per SC-004 (partial)
- [X] T093 Give `degreeDays` its `HDD18, CDD10` strings in the roster (`src/units.js:245-253`, today `si: ''` and `ip: ''`), or record why the wording belongs at the lettering site (`src/weather.js:153-159`, which imports no kind at all), so that the contract's own unit column (`contracts/quantity-kinds.md:63`) and the code say the same thing, per FR-007 (partial)
- [X] T094 Write `lengthMm`'s `1 / 25.4` (`src/units.js:115`) and the three `1.8`s (`:124`, `:125`, `:132`, and inside the expressions at `:139` and `:144`) as expressions of the constants, `12 / (FT * 1000)` and `9 / 5`, which is the rule the contract states of itself at `contracts/quantity-kinds.md:7` and then breaks in exactly those rows, per FR-008 (partial)
- [X] T095 Record the two load-time assertions as they are actually enforced, and close the one gap in them: `precisionFor` clamps at zero (`src/units.js:374`) where `data-model.md:35` gives the bare `floor(-log10(step * factor))` and the clamp bites for roughly ninety coarse steps; the no-whitespace rule is enforced on converting kinds only (`:591-596`) where `data-model.md:42` states it flat, and `floorMultiple` (`× floor`) and `currency` (`local currency`) both carry a space by design; and `assertKinds`' `!k.ip` check (`:600`) has no `si` twin, so a converting kind with an empty SI string still loads, per FR-007 and workflow gate 5 (partial)
- [X] T096 Add a general note teaching the units toggle in `src/tour.js`, with its `tour?.note(...)` call site and a bump to `shoebox-general-notes-v5`, or record the decision not to. T064 settled the narrow branch of FR-025, that no existing note letters a unit, and left the wider one open: workflow gate 6 asks for `NOTES` on any change that adds a feature, and a reader meeting the sheet for the first time now finds a mode control the tour never mentions, per FR-025 (partial)

### What this pass checked and found clean

Stated so the next pass does not re-walk it. The roster matches
`contracts/quantity-kinds.md` row for row at 25 converting and 16 identity kinds,
every `si`, `ip` and `digits` value character for character, and the factors
evaluate correctly. All eleven refined steps hold at R4's exact values with the
measurement in a comment on each, and no twelfth control's step moved. All 87
ruled declarations carry a kind, structurally, since `Ruled`'s constructor
resolves it through `kindFor` and throws at the declaring line. `letter` is
composed from `prefixIn` and `suffixIn`, and across all 96 faces in both systems
there are zero `format`/`unitNow` disagreements. `readQuantity` was driven live:
`65.6`, `65.6 ft`, `20 m` and `20m` all give 20 on an IP `ctxDistance` face, and
`20 kg`, `abc` and `12abc` are refused whole. Neither `model.js` nor
`permalink.js` nor `bundle.js` imports `units.js`. FR-018 holds because the
sheet's only copy offer is a link carrying no figures; FR-019 is stated at
`index.html:5311`; FR-020 is on the desk item at `src/main.js:11238`; and the
degree-days reading says `°C bases` at `src/weather.js:157`. The production build
is clean at 88 modules.

### Phase 10 outcome

**All twelve tasks are done.** Six were verified outside the browser, four on the
page, and two are decisions now written down rather than left implied.

The strongest check was T086's. Rather than asserting what the old code would
have printed, the harness staged the pre-edit tree with `git archive HEAD` and
imported both implementations into one process, so SI lettering is proved by
running HEAD against the working tree character for character: 10 of 11 real
paragraphs byte-identical, the eleventh differing only by the intended
`L/s per person` to `L/s·pp` rewording, across desks chosen so that all six
substituted tokens are actually exercised. The factor rewrites are bit-identical
by raw IEEE-754 comparison (`9/5` and `1.8` are both `0x3ffccccccccccccd`), all
41 kinds and 984 `letter()` strings match HEAD, and `Bearing` is unchanged over
16 compass points and 6 off-grid values in both systems. SC-004 came in at 574 of
574 control figures and 88 of 88 reading figures, with the harness mutation
tested to prove it can fail.

**Driving found two defects no task named, both now fixed and seen working.**

1. **A cache whose key cannot see the system.** `renderSurveyChoose` redraws only
   when the selection or the desk moves, and its Reading cell letters each
   offer's `unitNow`. A sheet booted in IP therefore offered `High °F` and went
   on offering it after a switch to SI. `system()` joins the key, and
   `reletterSheet` now calls the chooser directly, because `renderSurvey` never
   reaches it. Verified: `High°C`, `High°F`, and `High°C` restored exactly.
2. **A change in a reading is a difference, for the third time.** E-02's trade
   sentence lettered `value - base` through `Reading.format`, so measured changes
   of +4 °C and +0.5 °C read `+39 °F` and `+33 °F`. `Reading.change` now letters
   it through `deltaKindOf`. Verified under Node (`7.2 Δ°F` for 4 °C, absolutes
   and non-temperature readings untouched) and on the page (`+7.3 Δ°F` against
   `+1.3 Δ°F`).

**And T087 introduced a third, caught before it shipped.** Making criterion a's
note convert its measured line turned `tm59Notes`' `WeakMap` into a stored label:
a note built in SI would have been handed back under an IP sheet. Its key carries
`system()` now. That is the same fault as defect 1, arriving from the opposite
direction within the same hour, which is why CLAUDE.md now states the rule about
caches rather than the two instances.

**T091 is the one that most needed driving**, and it confirmed the arithmetic
rather than just the unit: the pull's Effect column converts both halves, so
`-36.08 °C` per `m` becomes `-1.65 Δ°F` per `in` (−36.08 × 1.8 ÷ 39.37), Room
left 0.40 m becomes 15.75 in, and a ratio-denominated row converts its numerator
only (10.72 to 19.30). `within` reads `0.2 Δ°F`, not `0.2 °F`.

**T083 step 8 passed as written**: with `public/energyplus` renamed away the page
still booted, said `The engine could not be loaded` in words with the status
marked bad, and the toggle still re-lettered, IP to SI in 13.7 ms with `t-site`
moving 6,001 ft to 1,829 m and the roving tabindex following. The directory is
restored.

**A methodological warning, because it cost most of the driving time.** The tab
was not visible, and a hidden tab never fires `requestAnimationFrame`.
`renderSurveySoon` and `renderPullSoon` clear their frame flag only inside that
callback, so the flag stayed set and every later call returned early. This
produced three entirely convincing false positives, the plan caption, the reading
sub-line and the spot readout all appearing not to re-letter, plus a survey
frozen at exactly its coarse-pass boundary and one evaluate that timed out after
45 seconds. All of it was one starved rAF: forcing a paint re-lettered the lot
and completed the ground to 144 of 144. None of it was written up as a defect.
`document.visibilityState` is now the first thing CLAUDE.md says to read.

**T096 is resolved as a decision not to add a tour step.** The toggle already
carries an always-visible standing line, which is what the design system requires
of a control a reader has never met, so a step would duplicate copy that is
never hidden, and bumping the storage key would reset every reader's notes for a
control that explains itself in place. The key stays `shoebox-general-notes-v4`.

**What is still not driven, stated rather than assumed.**

- **T084, the private window.** Not attempted. Forcing the write probe to fail
  means changing the browser's site-data settings, which is not something to do
  to someone's browser. The `units-forgets` line is wired to the probe and hidden
  when it succeeds, and it is held to the `STANDING` budget at load, but it has
  still never been seen firing. A maintainer can settle it in one private window.
- **T083 step 5 and T085, a switch strictly mid-run.** Partially covered. A
  switch during an active survey queue was measured at 49 of 144 with the count
  unchanged across it and no sample re-run, which is the invariant the
  requirement is about, and the pull completed normally after a switch made while
  it was running. The literal scenario, dimmed figures re-lettering while still
  dimmed, was not observed: a design-day sweep lands faster than a switch can be
  scheduled against it, and the hidden-tab rAF starvation above makes a clean
  mid-run observation unreliable in this environment. It wants a weather year
  attached and a visible window.
