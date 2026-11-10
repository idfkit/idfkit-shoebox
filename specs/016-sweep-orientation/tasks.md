---

description: "Task list for sweeping the building's orientation"
---

# Tasks: Sweep the building's orientation

**Input**: Design documents from `specs/016-sweep-orientation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/orientation-sweeps.md, quickstart.md

**Tests**: The repository has no test runner. The quickstart defines seven gates,
each a throwaway Node harness or a drive of the page. Verification tasks therefore
write those harnesses under the gitignored `.harness/` directory and drive the page;
no `tests/` tree is created.

**Organization**: Tasks are grouped by user story so that each story can be
implemented and verified on its own. Read the delivery note under "Implementation
Strategy" before shipping any story alone: FR-003 ties the three surfaces to one rule.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, and no dependency on an incomplete
  task).
- **[Story]**: the user story the task belongs to (US1 to US3).
- Every description names the file it changes.

## Path Conventions

A single static web project. Source is under `src/`, throwaway harnesses under
`.harness/`. Line numbers are those cited in research.md, taken at `d1e1f0d`, and
must be re-found before editing.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture what the feature must not change, before any source file is
touched.

- [X] T001 Run `npm install` and `npm run build` so `public/energyplus/`, `public/schemas/` and `public/weather/` are staged; confirm the build passes on unmodified `HEAD` and record the commit in `.harness/fixtures/README.md`.
- [X] T002 [P] Write the shared helper `.harness/lib/run.mjs`: build the document with `src/model.js` from a `params` object (schema from `localBundle()` in `@idfkit/schemas/node`, `load('26.1.0')`), apply `applyModel`, write the IDF, run EnergyPlus 26.1.0 from `/Applications/EnergyPlus-26-1-0` or the staged WebAssembly engine (one engine per process, per CLAUDE.md "Verifying changes"), and return the paths of `eplusout.err`, `.eso`, `.mtr` and `.rdd`.
- [X] T003 [P] Capture the SC-005 link fixture before any change: write `.harness/capture-links.mjs`, which imports `src/permalink.js` and `src/model.js` and records, for a corpus of `v1` links (the default desk, `northAxis=90`, `northAxis=12.5`, `northAxis=360`, every link found by `grep -rn '#v1' docs/ CHANGELOG.md README.md`, and a link carrying `sty` and one carrying `sv`), the decoded `params` and the written IDF text into `.harness/fixtures/links-before.json`.
- [X] T004 [P] Capture the R4 measurement before any change: write `.harness/turn-360.mjs`, which builds the default desk at `northAxis` 0 and at 360 with the unmodified `src/model.js`, and writes both IDFs and a line diff of them to `.harness/fixtures/turn-360.diff` (quickstart gate 2 step 2).

**Checkpoint**: both fixtures exist and were captured from unmodified source.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Declare the wrap once, narrow and version the link, and close the
silent traps that open the moment North axis carries a `fraction`. After this phase
`refusesSweep(northAxis)` returns null and `refusesSweep(ctxAzimuth)` still returns
today's sentence.

**CRITICAL**: No user story can begin until this phase is complete.

- [X] T005 Add `export class Wrap({ step })` to `src/controls.js` beside `Ruled`: frozen, `period` 360, with `norm(v)`, `arc(from, to)` in `(0, 360]` (`arc(0, 360)` is 360), `ahead(from, v)` in `[0, 360)`, `signed(a, b)` in `(−180, 180]`, and `positions(n, from = 0, to = 360)` which spaces a whole turn by `i / n` and an arc by `i / (n − 1)`, snaps to `step` with `Math.round`, normalises to `[0, 360)` and orders by `ahead(from, ·)` (data-model "Wrap"). Comment why it is a period and not a range (research R1, R3).
- [X] T006 Give `Bearing` (`src/controls.js:594`) an optional `wrap = null`. With one it exposes `min` 0, `max` 360, `step` `wrap.step`, `wraps` true, `quantityKind` `KINDS.angle`, `fraction(v) = v / 360`, `valueAt(f)` returning `wrap.norm(round(f · 360 / step) · step)` (so 1 gives 0), `figure(v)` in whole degrees through `figureIn(angle)`, `unitNow` `''`, `spanKind` `KINDS.angle`, `spanUnitNow` `°`, `parse(text)` admitting whole or decimal degrees in `[0, 360]`, and `landmarks` `[]` (data-model "Bearing, with a Wrap", research R9). Without a `wrap` the class must be byte-for-byte today's; `format(v)` is unchanged.
- [X] T007 Narrow `refuses` (`src/controls.js:1725`) for a wrapping Bearing to `[0, 360)`, returning `'is outside its 0–360 range; a full turn is 0'` for `v < 0 || v >= 360` and admitting fractions; a Bearing without a `wrap` keeps `[0, 360]` (research R4).
- [X] T008 Declare `wrap: new Wrap({ step: 1 })` on `northAxis` (`src/controls.js:3512`), and reread its `note` against `CONTROL_NOTE` (77 words), adding at most that a study runs the whole turn. Leave `ctxAzimuth` without a `wrap`.
- [X] T009 Add the `Wrap` load assertions to `src/study.js` beside the note assertion (`study.js:128`): `Wrap` is declared on exactly one control, `northAxis`; for it, every coarse position (8) is a fine position (16); no two fine positions coincide after snapping. Each throws naming the control (data-model "Invariants").
- [X] T010 [P] Bump the link in `src/permalink.js`: `LINK_VERSION = 'v2'`, `DEFAULTS_BY_VERSION = { v1: DEFAULT_PARAMETERS, v2: DEFAULT_PARAMETERS }`, and `MIGRATIONS.v1` which drops a `northAxis` pair whose `Number(raw) === 360` and passes every other pair through untouched, with a comment citing research R4. Re-read `readValue` and the header comment (`permalink.js:29`) and keep the refusal-whole behaviour.
- [X] T011 [P] Move the bearing branch above the `fraction` branch in the distance test of `src/describe.js:101`, so North axis keeps its shortest-way-round distance once it carries a `fraction` (research R11).
- [X] T012 [P] Reword the chooser's faceless heading in `src/main.js` (near `:10219`) so it names "the neighbour's bearing" rather than "a bearing", within its `copy.js` budget (research R11, R12; this is FR-017's one teaching sentence).
- [X] T013 Write `.harness/gate7-load.mjs` (quickstart gate 7): import every DOM-free module under Node and assert the `Wrap` assertions pass, `refusesSweep(northAxis)` is null, `refusesSweep(ctxAzimuth)` returns today's sentence, `CONTROL_NOTE` holds, and a scratch copy of `src/controls.js` declaring a second `Wrap` throws at load.
- [X] T014 Write `.harness/gate2-link.mjs` (quickstart gate 2) and run it: `#v1&northAxis=360` decodes to the default desk; `#v2&northAxis=360` and `#v2&northAxis=-1` are refused whole with the range sentence; `northAxis=12.5` decodes under both versions; every key round-trips at `v2`; and every link in `.harness/fixtures/links-before.json` decodes to the same `params` and the same IDF. Record the `.harness/fixtures/turn-360.diff` result for T049.

**Checkpoint**: the wrap is declared once, the link is `v2`, and every pre-feature
link opens to the same desk.

---

## Phase 3: User Story 1 - Study the orientation (Priority: P1) 🎯 MVP

**Goal**: Study on North axis gives a closed curve round the full circle, lettered in
bearings with compass points, the desk marked where it stands, and the extremes
lettered.

**Independent Test**: On the default desk, study North axis against cooling demand:
8 coarse runs then 8 more, a curve closed at the right edge, the redline at the desk's
own bearing, the extremes line in bearings, and each plotted figure equal to the sheet
with the rose turned there by hand (quickstart gates 1, 3 and 4).

### Grid and read-back

- [X] T015 [US1] Add `export function studyCounts(control)` to `src/study.js`, returning `{ coarse: 8, fine: 16 }` when `control.wraps` and `{ coarse: COARSE_SAMPLES, fine: SWEEP_SAMPLES }` otherwise (research R2).
- [X] T016 [US1] Make `samplePoints` (`src/study.js:163`) delegate to `control.wrap.positions(n, from, to)` when `control.wraps`, insert the stance verbatim, and deduplicate it against its neighbours by circular distance so 359.9995 and 0 are one position (contract `study.js`).
- [X] T017 [US1] Make `sampleOrder` (`src/study.js:60`) on a whole turn take 0, then 180, then the stance, then bisect circularly, measuring nearness to the stance by circular distance (contract `study.js`).
- [X] T018 [P] [US1] Add `export function turnOf(facts)` to `src/model.js` beside `geometryFacts`: `norm(bearing of the 'south' plan wall − 180)`, identifying the wall by its plan `side` and never by its compass word, throwing "the model has no south wall to read a turn off" where there is none (research R6).
- [X] T019 [US1] In `buildSample` (`src/main.js:8791`), when the job's key wraps, return `turn: turnOf(geometryFacts(model))` beside `floorArea`, read while the overlay stands, and normalise every position to `[0, 360)` before `deskAt` so 0 and 360 never mint two identities (research R6, R11).
- [X] T020 [US1] In `src/scheduler.js`, store `turn` on the point when `buildSample` returns one, and make the point a failure with the reason `` `the document turned to ${format(turn)}, not ${format(asked)}` `` when `|Wrap.signed(turn, asked)| > 0.01` (contract `scheduler.js`); assert the reason fits the `ABSENCE` budget in `src/copy.js`.
- [X] T021 [US1] Replace every study count in `src/main.js` with `studyCounts` of the job's own control: `jobForStudy` (`:9091`), `enqueueStudy` (`:9137`, and `coarse:` at `:9155`), the re-queue at `:9174`, the refresh sites at `:9227`, `:9254`, `:9274`, the `coarse:` test at `:9484`, and the site at `:5480`; `job.coarse` becomes `job.asked === studyCounts(control).coarse` (research R2).
- [X] T022 [US1] Write `.harness/gate3-grid.mjs` (quickstart gate 3) and run it: 8 and 16 positions as listed, the eight nested in the sixteen, sixteen distinct compass names from `format`, a stance at 350 held once between 315 and north, an arc 300→60 running clockwise through north, and `samplePoints(ctxAzimuth, …)` still throwing the faceless sentence.
- [X] T023 [US1] Write `.harness/gate1-turns.mjs` (quickstart gate 1) on `.harness/lib/run.mjs` and run it: at each of the sixteen positions, on the default desk and on a desk glazed on one wall with overhangs, fins, a rooflight and a context slab, assert three applies are byte-identical, `turnOf` equals the position within 0.01°, and the run is clean (`validate_model`, `check_model_integrity`, no surface deleted by the 0.01 m merge, no "requested but not generated"). 32 clean runs expected.

### The rose as a study host

- [X] T024 [US1] In `buildBearing` (`src/console.js`), for a Bearing with a `wrap` only, register `rows`, a `probe` (a redline radius on the rose at the probed bearing), and a `studyOffer` labelled "sweep the whole turn, from north round to north" with a `studySweeps` thunk so `reletter()` replays it; compose its face with any face already registered under `northAxis` (`buildFacade` and `buildBoundary` chain onto it) rather than replacing it, and toggle `idle` and `shown` as any row does (research R10). Keep the drag, the two-degree snap to the eight points and the lettering unchanged (FR-002).

### The card

- [X] T025 [US1] In `studyCard` (`src/console.js`, `:2110–2398`), for a wrapping control, draw the seam point: an extra drawn vertex at 360 repeating the 0° point's reading, absent from `job.curve`, every cache and every count, and omitted when the 0° point is a gap so a failed run breaks the closure (research R5, FR-007).
- [X] T026 [US1] In `studyCard` (`src/console.js`), on a wrapping control: ticks at the eight principal points, lettered all eight, and the four cardinals only at the index sheet (390 px); `0° N` at the left foot and `N, again` at the right; the caption `The whole turn; wraps at north.` within `STRIP_LINE`; `readAt` bracketing through the seam point so a desk at 350° is marked where it stands; and a click at the right edge mapped through `valueAt` to 0 (research R5, FR-008).
- [X] T027 [US1] In `studyCard` (`src/console.js`), place each point at its measured `turn` (T020), and on a wrapping study letter one extremes line in view, outside any fold, within `BLOCK`: `Lowest 135° SE · highest 315° NW` from the plotted points' own figures, `best`/`worst` only where the reading declares `better`, and `lowest at N positions` with no bearing chosen on a tie (research R13, FR-009).
- [X] T028 [US1] Register every new always-visible string from T024–T027 against its budget in `src/copy.js` (FR-016), and confirm the offer's label is replayed in IP and SI by `studySweeps`.
- [X] T029 [US1] Drive the page (quickstart gate 4): study North axis against cooling demand; turn the rose by hand to 135°, 338° and 0° and compare against the curve (SC-003); set 350 and check the redline; read the extremes line; switch to IP and diff every bearing figure character for character (SC-006); bypass Fabric and repeat; force a failure at 180 with a harness hook in `buildSample` and check the gap and its reason; turn the rose mid-study and check cancellation follows `restShapeKey` as for any study.

**Checkpoint**: an orientation study runs end to end on the page. See the delivery
note: the survey chooser and the pull now list North axis too, and must not ship
broken.

---

## Phase 4: User Story 2 - Cut a ground along the orientation (Priority: P2)

**Goal**: North axis is either axis of an E-02 survey, sampled 8 then 16 along its
axis, with a ground, its contours, its relief and every published limit line
continuous across north.

**Independent Test**: Cut North axis against south glazing ratio on three stances;
every isoline continues across north, coverage is 8 × 6 then 16 × 11, a 300→60 cut
runs through north, and the `sv` link reopens the same ground (quickstart gate 5).

### The axis

- [X] T030 [US2] Add `export function gridCounts(control)` to `src/survey.js`, returning `{ coarse: 8, fine: 16 }` for a wrapping control and `{ coarse: COARSE_GRID, fine: FINE_GRID }` otherwise (research R2).
- [X] T031 [US2] Extend `Axis` in `src/survey.js` with `closed` (a whole turn), `cells` (`count` when closed, `count − 1` otherwise), `next(ix)` (`(ix + 1) % count` when closed), `offset(v)` (clockwise distance from `from` via `wrap.ahead`), and `at(f)` where `f` may reach `count` on a closed axis and means north again; make `indexOf` use the axis's own step on normalised values, fixing the NaN tolerance that drops every coarse point on a densify (research R7, data-model "Axis, wrapping").
- [X] T032 [US2] Make `axisFor` (`src/survey.js:363`) accept `from > to` on a wrapping control as an open arc clockwise through north (FR-014), read `0, 360` as a whole turn, refuse `from === to` with `The same bearing at both ends is no extent.`, and make `inside` (`:385`) measure by `offset` (research R7).
- [X] T033 [US2] Make `standingAt` (`src/survey.js:709`), `standingRefusal` (`:1361`), `surfaceAt` (`:1131`) and `freeExchange` (`:1436`) measure along `offset` and wrap on a closed axis.
- [X] T034 [US2] Make every cell walk in `src/survey.js` iterate `ix < axis.cells` and take its neighbour through `axis.next`: `contoursOf` (`:1018`), `meshOf` (`:1100`), `blockOf` (`:1177`), `strataOf`, `arrisesOf`, `passingGround` (`:2284`), `fallStep` and `refineOrder`; have `meshOf` emit one aliased vertex column at `ix = count` so the relief closes. Leave `Coverage` unchanged; its sum assertion is the check that north is counted once (FR-012, FR-013).

### The relief and the drawing

- [X] T035 [P] [US2] In `src/relief.js`, divide the scale's x and y by `axis.cells`, letter the eight principal points and the word "wraps" on a wrapping axis in `axisRules` / `letterAxes`, and letter the far corner staff of a closed axis as north again (contract `relief.js`).
- [X] T036 [US2] Hold the survey pass per axis in `src/main.js`: `surveyGrid` (`:2256`) becomes `{ x, y }`, and every count site asks `gridCounts` of its axis's control — `:9745`, `:9804`–`:9805`, `:9838`–`:9839`, `openSurvey` (`:9851`), `cutFromChoice` (`:10716`) and `:10744`. Re-find how `sv` and `decodeSurvey` carry the pass and keep the grammar unchanged.
- [X] T037 [US2] Admit North axis in `axisOffers` (`src/main.js:9950`) through `refusesAxis` unchanged, and make the extent field (`extentField`, `:10463`) drop its "lower figure to a higher one" refusal on a wrapping axis and refuse `from === to` with `The same bearing at both ends is no extent.` (within `STANDING`).
- [X] T038 [US2] In `src/main.js`, make `groundFrame` (`:10766`) read a wrapping axis by `offset`, make the keyboard cursor (`:11463`) wrap on a closed axis, ask the dense threshold (`:11105`) of `gridCounts(control).fine` rather than `count > 7`, and make `amountOn` (`:12027`) letter a wrapping axis's difference as a signed short arc through `spanKind` (research R7, R9, R11).
- [X] T039 [US2] Teach `decodeSurvey` in `src/permalink.js` the wrapping extent rule: ends in `[0, 360]`, `from ≠ to`, `0_360` a whole turn, `from > to` crossing north; keep the order of checks (unknown names, pairings, extents) (data-model "Link").
- [X] T040 [US2] Write `.harness/gate5-survey.mjs` (quickstart gate 5) on the DOM-free survey modules and run it over three stances (even glazing, south-only 0.6, south-only with an overhang) cut against south glazing ratio: every `contoursOf` polyline reaching x = `count` continues from x = 0 at the same y; `meshOf`'s column at `count` equals column 0; every published isoline closes across north (SC-004); `Coverage.wanted` is 8 × 6 then 16 × 11 with `measured + gaps` never above it; a 300→60 cut runs through north with a stance at 10 inside; each `sv` round-trips.
- [X] T041 [US2] Drive the page: cut North axis against south glazing ratio, read the axis lettering and the "wraps" statement, check the relief closes, reopen the `sv` link in a fresh page and confirm the same ground (US2 acceptance 1–4), and confirm studied orientations are cache hits for the survey row.

**Checkpoint**: a ground along the orientation is cut with no seam at north.

---

## Phase 5: User Story 3 - Rank the orientation in the pull (Priority: P3)

**Goal**: The pull ranks North axis by a twentieth of its face, 18° clockwise, and
says so.

**Independent Test**: Run the pull on the default desk at North axis 350: a probe at
8, the effect divided by +18, the entry lettering `Turned 18° clockwise.`, and no "At
its stop" (quickstart gate 6).

- [X] T042 [US3] In `src/pull.js` (`:210`–`:220`), step a wrapping control to `wrap.norm(here + 18)`, always clockwise, and divide its effect by `+18` (`wrap.signed`) rather than `to − from` (research R8).
- [X] T043 [US3] Give `PullEntry` in `src/pull.js` a `wraps` field: `room` is `null`, the `room === 0 ⇔ atStop` invariant is not asked, and `roomSaid` (`:115`) letters `Turned 18° clockwise.` (within `ABSENCE`); confirm the pull row in `src/main.js:12405` letters it with `perUnit` "per degree clockwise" from `spanUnitNow`.
- [X] T044 [US3] Write `.harness/gate6-pull.mjs` (quickstart gate 6) and run it, then run the pull on the page and check North axis is ranked beside the ruled controls in both unit systems.

**Checkpoint**: all three surfaces accept North axis by one rule.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Record the decisions where the repository keeps them, and run every gate
once more on the finished change.

- [X] T045 [P] Add a section "A face with no ends" to `docs/design-notes.md` (the `Wrap`, 8/16 on whole degrees, the seam point drawn not sampled, the cell walk, `turnOf`, link `v2` and the 360 migration, the pull's 18°), and update the studies, E-02 and permalink sections to point to it.
- [X] T046 [P] Update `CLAUDE.md`: the Controls bullets (`Wrap` on North axis only; `refusesSweep` stays the one rule), the permalink line (`v2`, `MIGRATIONS.v1`), and the E-02 line (a wrapping axis walks cells through `next`; 8/16 along it).
- [X] T047 [P] Add to `CHANGELOG.md` under Unreleased: Added — orientation studies, orientation survey axes and the pull entry; Changed — links are `v2`, and a `v1` link carrying `northAxis=360` opens at 0.
- [X] T048 [P] Record the compass ticks, the seam point and the "wraps" caption on a study card and a ground in `.interface-design/system.md` (constitution workflow gate 8).
- [X] T049 Record the gate 2 measurement from T004 and T014 (whether a `v1` link at 360 changes IDF bytes, and by what) in `docs/design-notes.md` under the new section.
- [X] T050 Confirm `grep -n 'study\|sweep\|bearing' src/tour.js` finds no `NOTES` step that teaches what can be studied, so neither `NOTES` nor `shoebox-general-notes-v7` changes (research R12), and say so in the commit message.
- [X] T051 Re-run `.harness/gate1-turns.mjs` through `.harness/gate7-load.mjs` on the finished change, run `npm run build`, and drive the page once at 390 px wide: the study card's caption, extremes line and refusals are in view and the ticks thin to the cardinals (constitution VII).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T003 and T004 must run before any source
  edit.
- **Foundational (Phase 2)**: depends on Setup. T005 → T006 → T007 → T008 → T009 in
  `src/controls.js` then `src/study.js`; T010, T011, T012 are independent files;
  T013 and T014 verify the phase.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on Foundational; it reuses `turnOf` and the
  `buildSample` turn check (T018–T020) for survey rows, and shares the 8/16 grid
  through `Wrap.positions` (T005).
- **US3 (Phase 5)**: depends on Foundational only.
- **Polish (Phase 6)**: depends on every story that ships.

### Within US1

T015 → T016 → T017 (one file); T018 in parallel; T019 → T020 → T021; T022 and T023
after T016–T019; T024 → T025 → T026 → T027 → T028 (one file); T029 last.

### Within US2

T030 → T031 → T032 → T033 → T034 (one file); T035 in parallel once T031 exists;
T036 → T037 → T038 (one file); T039 in parallel with T036; T040, T041 last.

### Parallel Opportunities

- Phase 1: T002, T003, T004.
- Phase 2: T010 (`permalink.js`), T011 (`describe.js`), T012 (`main.js`) beside the
  `controls.js` chain.
- US1: T018 (`model.js`) beside T015–T017 (`study.js`) and T024 (`console.js`).
- US2: T035 (`relief.js`) and T039 (`permalink.js`) beside the `survey.js` and
  `main.js` chains.
- US3 can proceed beside US1 and US2 once Phase 2 is done: it touches only `pull.js`.
- Phase 6: T045–T048 are four different files.

## Parallel Example: User Story 1

```text
Task: "T015–T017 studyCounts, samplePoints, sampleOrder on a circle in src/study.js"
Task: "T018 turnOf(facts) in src/model.js"
Task: "T024 buildBearing registers rows, probe, studyOffer, studySweeps in src/console.js"
```

## Parallel Example: User Story 2

```text
Task: "T030–T034 gridCounts and the wrapping Axis in src/survey.js"
Task: "T035 cells denominators and compass lettering in src/relief.js"
Task: "T039 wrapping extent rule in decodeSurvey in src/permalink.js"
```

---

## Implementation Strategy

### Delivery note: FR-003 binds the three surfaces

`refusesSweep` is the one rule, so the moment T008 lands North axis is offered by the
study, the survey chooser and the pull together. A build with only US1 complete would
offer a survey axis that densifies to nothing (the `indexOf` NaN, research R7) and a
pull entry that steps past 360. US1 is therefore the **MVP milestone to verify**, not a
release on its own: US2 and US3 must land in the same deploy, or the release must not
carry T008.

### MVP first (User Story 1)

1. Phase 1, capturing both fixtures from unmodified source.
2. Phase 2, ending with gates 7 and 2 green.
3. Phase 3, ending with gates 1, 3 and 4.
4. **Stop and validate** the study against the hand-turned rose (SC-003).

### Incremental delivery

1. US1 verified → US3 (small, one file) → US2 (the largest).
2. Phase 6, then one pull request carrying all three surfaces.

### Run budget (SC-002)

An orientation study costs 8 then 8 more runs, against 11 then 10 for a ruled
control. A survey costs 8 × 6 then 16 × 11. No output variable is added.
