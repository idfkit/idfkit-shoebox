---

description: "Task list for Chart Views on the Plate"
---

# Tasks: Chart Views on the Plate

**Input**: Design documents from `specs/015-chart-views/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/view-key.md, contracts/reporting.md, contracts/views.md,
quickstart.md

**Tests**: The repository has no test runner. SC-003 requires a verification
harness, and quickstart.md defines five Node harnesses under the gitignored
`.harness/` directory. Verification tasks therefore write or extend those
harnesses and drive the page; no `tests/` tree is created.

**Organization**: Tasks are grouped by user story so that each story can be
implemented, verified and delivered on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, and no dependency on an
  incomplete task).
- **[Story]**: the user story the task belongs to (US1 to US8).
- Every description names the file it changes.

## Path Conventions

This is a single static web project. Source is under `src/`, generator
scripts under `scripts/`, and throwaway harnesses under `.harness/`. Line
numbers cited below are approximate and must be re-found before editing.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture what the feature must not change, and build the shared
harness helper, before any source file is touched.

- [X] T001 Capture the FR-002 fixture from `main` before any change: run `npm run dev`, solve a design-day run and a year run at the default desk, set the plate host to a fixed size (for example 720 × 320 px), and save the plate's `<svg>` `outerHTML` for each run to `.harness/fixtures/plate-ts-dd.svg` and `.harness/fixtures/plate-ts-year.svg`. Record the size and the desk's fragment in `.harness/fixtures/README.md`.
- [X] T002 [P] Capture the SC-004 fixture from `main`: write `.harness/capture-links.mjs`, which imports `src/permalink.js` and records `encodeState(...)` for the default desk, a desk with System in the path, a desk with a pinned hour, and a desk with a station, into `.harness/fixtures/links-main.json`.
- [X] T003 [P] Write the shared helper `.harness/lib/run.mjs`: build the document with `src/model.js` from a `params` object (schema from `localBundle()` in `@idfkit/schemas/node`, `load('26.1.0')`), apply `applyModel`, write the IDF, run EnergyPlus 26.1.0 from `/Applications/EnergyPlus-26-1-0` (or the WebAssembly engine, one per process), and return the paths of `eplusout.eso`, `.mtr`, `.err` and `.rdd`.
- [X] T004 Re-confirm the four variable names of contracts/reporting.md §1 against a fresh `eplusout.rdd` from `.harness/lib/run.mjs` on the default desk and on a desk with System in the path, and record the run directories in `specs/015-chart-views/contracts/reporting.md` if they differ from those cited.

**Checkpoint**: both fixtures exist and were captured from unmodified `main`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The snapshot, the codec, the chooser and the relocated time
series renderer. After this phase the page draws exactly what it drew before,
and a link at the default is byte-identical.

**CRITICAL**: No user story can begin until this phase is complete.

### Units and reporting

- [X] T005 [P] Add `KINDS.humidityRatio` to `src/units.js`: SI `g/kg`, IP `gr/lb`, factor 7 (research.md §R8), with a precision for each system; confirm `assertKinds` accepts it and that its SI spelling equals the one `SeriesDef` declares.
- [X] T006 Add `Site Outdoor Air Humidity Ratio` and `Zone Mean Air Humidity Ratio` to `VARIABLES_HOURLY` (about line 607) in `src/model.js`, on the `'sheet'` profile only; leave `'extremes'`, `'energy'`, `'tm59'` and `RunContents` unchanged (contracts/reporting.md §2 rules 1 and 3).
- [X] T007 Write `.harness/views-reporting.mjs` covering quickstart.md §1 steps 1 to 5 for the humidity series: three applications of `applyModel` give byte-identical IDF, "lean then sheet" equals "always sheet", the idfkit MCP tools (`load_model`, `validate_model`, `check_model_integrity`, `run_simulation`) report no severe error, `eplusout.err` has no "requested but not generated", and the ESO carries both humidity series.
- [X] T008 Write `.harness/views-cost.mjs` (quickstart.md §2): interleaved A/B annual solves with and without the two humidity variables, 10 pairs, one engine per process, reporting both medians and their ratio on the default desk. Run it and confirm the ratio is at most 1.05.

### The snapshot

- [X] T009 Add `RunFacts`, `RunSeries` and `readRunSeries(eso, doc)` to `src/readings.js` per data-model.md §2: frozen classes; hourly series in `series`, daily series in `daily`, each after the declared `scale`; a missing hour is `NaN`, never 0; every series the run lacks is entered in `absent` with its reason; `facts` reads elevation, pressure, `mechanicalCooling`, `weatherDays` and `channels` off the document, never off `params`; `hours` is the fingerprint of environment count, first stamp, last stamp and length; throw when `air` is absent. Keep the module DOM-free.

### Declarations and the codec

- [X] T010 [P] Create `src/views.js` with the declarations of data-model.md §1: the ten `SeriesDef` instances (`air`, `operative`, `radiant`, `outdoor`, `wZone`, `wOut`, `heat`, `cool`, `occupancy`, `dayType`) with exact variable names matched by `exactly()`; the `ts` `View` instance with `needs`, `placesHour`, `drawsSeries`, `ghost`, `describe` and `defaults`; the needs of all seven views as `Need` values ready for later stories; the closed `Need` union; the closed `Available` / `Unavailable({ reason, remedy })` type; the frozen `ViewSetting` class, `DEFAULT_SETTING` and `settingFor(setting, patch)`. Each later story adds its own `View` to `VIEWS` in the same task as its renderer, so `VIEWS` only ever lists views the build can draw. Assert at load: unique ids, `ts` first, views in FR-001's relative order (`ts`, `psy`, `adp`, `crp`, `dur`, `avg`, `sig`), every kind in `KINDS`, selectable series share one kind, every `Need` names a declared series, run length or channel. Keep it DOM-free.
- [X] T011 Implement `encodeView(setting)` and `decodeView(text)` in `src/views.js` per contracts/view-key.md §2 to §4: fields in the order series, shade, agg, zoom, region, model; defaults never written; `null` at `DEFAULT_SETTING`; each of refusal rules 1 to 8 throws a message naming its rule; a field that does not apply to the view is held in the setting but not encoded.
- [X] T012 Implement `availabilityOf(view, facts)` in `src/views.js` per research.md §R10 and the refusal wording table of contracts/views.md §3, including `ABSENCE.fileSeason` for a part-year file; there is no third state.
- [X] T013 Wire `pv` into `src/permalink.js`: add `'pv'` to `RESERVED` (about line 104) so the collision check covers it; `encodeState({ ..., view })` appends `pv` after `sv` and writes nothing when `encodeView` returns `null`; `decodeState` reads `pv` above `readValue`, refuses a repeated or empty key (rule 8), and returns the decoded `view`; `LINK_VERSION` stays `v1`.
- [X] T014 Write `.harness/views-link.mjs` covering quickstart.md §3 steps 1 to 4: the round trip over every reachable `ViewSetting` in both directions, byte-identity of the default desk against `.harness/fixtures/links-main.json` at `view = DEFAULT_SETTING` and at `view` omitted, one refused fixture per rule 1 to 8, and `pv=sig` decoding on a desk with System bypassed.
- [X] T015 Write `.harness/views-declarations.mjs` (quickstart.md §5) for the declarations that exist so far: patched imports of `src/views.js` with a duplicate view id, selectable series of mixed kind, and a `SeriesDef` whose kind is not in `KINDS`, each of which must throw and name the declaration. Later phases add cases to this file.

### The plate

- [X] T016 Create `src/plate.js` exporting `drawPlate(host, frame)`. Move the time series drawing out of `renderTrace()` in `src/main.js` (about lines 805 to 1080) into a `ts` renderer that reads only the `PlateFrame` (data-model.md §3.2): the zone band and line, the outdoor line, the datum lines, the reading-hour marker, the ghost lines, "AWAITING RUN" when `live` is null, and the existing `stale` class when `frame.stale` is set. Output at `DEFAULT_SETTING` must equal the fixtures of T001 attribute for attribute.
- [X] T017 Add the view chooser to `src/plate.js`: every view in `VIEWS`, the chosen one marked, an `Unavailable` view with `aria-disabled="true"` and its reason in view beside or under it (never in a tooltip); when the chosen view is `Unavailable`, the plate draws its reason and remedy in place of the field and never another view (contracts/views.md §2 rule 3). Assert at load that every view in `VIEWS` has a renderer in `src/plate.js` and that no renderer lacks a view.
- [X] T018 Add the keyboard to `src/plate.js` (research.md §R11): the plate host takes `tabindex="0"`; on views with `placesHour`, Left and Right step the reading hour through the run's hours in time order, Page Up and Page Down by 1 % of the hours, Home and End to the extremes, and Enter calls `frame.on.pin(at)`; a polite live region announces the hour.
- [X] T019 Add the `?measure` flag to `src/plate.js`: wrap `drawPlate` in `performance.mark` and `performance.measure('plate-draw')`, and expose a console helper that prints the median of the recorded measures; the flag reaches no IDF object and no link (research.md §R12).
- [X] T020 Rewire `src/main.js`: `plot` (about line 8217) becomes the `RunSeries` from `readRunSeries`; `ghost` in `beginGesture` (about line 4239) becomes a reference to the standing `RunSeries` and is passed to the frame only when `ghost.hours === live.hours`; hold the `ViewSetting` in module state; `buildFrame()` assembles the `PlateFrame`; `renderTrace` calls `drawPlate`; a setting change calls only `redrawPlate()` and `updatePermalink()`; `reletterSheet` redraws the plate without `applyGeometry`.
- [X] T021 Carry the view through the link surfaces in `src/main.js` per contracts/view-key.md §5: `schemeHash` (about line 5435) takes `view`; `updatePermalink` and `schemeUrl` pass the current setting; the kept-scheme shelf and the `restoreScheme` comparison pass `view: null`; the `hashchange` guard compares the bar's form; a decoded link applies its view without starting a solve.
- [X] T022 [P] Add the chooser host and its styles to `index.html` and `src/style.css` per `.interface-design/system.md`: hairline borders, one accent, a `[hidden]` twin for every class that sets `display`, wrapping at 390 px, and the right gutter labels moving under the field below the `--index` threshold.
- [X] T023 [P] Add copy budgets to `src/copy.js` for view labels (at most 14 characters), series labels (at most 12) and each refusal reason and remedy of contracts/views.md §3 (one line each), asserted at load.
- [X] T024 Verify the foundation: compare `drawPlate` output at `DEFAULT_SETTING` against `.harness/fixtures/plate-ts-*.svg` (FR-002); rerun `.harness/views-link.mjs`; drive the page and confirm the chooser lists the time series, that choosing a view starts no solve (the solve counter is unchanged) and does not cancel a running study (FR-003), and that a solve in flight dims the plate without blanking it.

**Checkpoint**: the page is unchanged at its default, the chooser is in place
with the time series alone, and `pv` round-trips.

---

## Phase 3: User Story 1 - Read the run on a psychrometric chart (Priority: P1) MVP

**Goal**: The plate redraws the current run as states of moist air with a
cited comfort region, its occupied-hour shares, the reading hour, and a 90 %
ghost outline, without a solve.

**Independent Test**: Solve a year run, choose Psychrometric, and confirm the
saturation and RH curves, the zone and outdoor marks, a cited region, one
share per graphic zone, and the reading hour, with no solve started.

### Implementation for User Story 1

- [X] T025 [P] [US1] Create `src/psychro.js` (DOM-free) per research.md §R3: `standardPressure(elevationM)`, `saturationPressure(tC)`, `humidityRatio(pwKPa, pKPa)`, `rhCurve(phi, pKPa, tFrom, tTo, step)` and `inside(polygon, x, y)`, citing ASHRAE Handbook of Fundamentals 2021 chapter 1 equation numbers in comments.
- [X] T026 [P] [US1] Write `scripts/build-comfort.mjs` per research.md §R4: the ASHRAE 55-2020 Appendix B PMV procedure at 1.1 met, 0.1 m/s, mean radiant temperature equal to air temperature, 0.5 and 1.0 clo, PMV from −0.5 to +0.5, humidity ratio from 0 to 0.012 in 0.0005 steps; write the two polygons in (operative °C, g/kg) with their citation to `src/comfort.data.js`. Run it by hand and commit the generated module.
- [X] T027 [US1] Add the optional period argument to `runningMean(dailyMeans, source, { from, to })` in `src/tm59.js`, defaulting to the TM59 season (30 April to 30 September, seeded 23 to 29 April), and confirm `.harness/comfort-line.mjs` passes unchanged.
- [X] T028 [US1] Create `src/comfort.js` (DOM-free): the five `AdaptiveModel` instances of research.md §R5, with the EN upper offsets taken from `tm59.CATEGORIES`; `REGIONS.graphic` from `src/comfort.data.js` and `REGIONS.adaptive` as a function of the day's running mean; `yearRunningMean(dailyMeans, source)` calling `tm59.runningMean` over the whole file with days 1 to 7 as the seed; `graphicShares(run)`; `adaptiveCounts(run, model, trm)` returning above, within, below, unassessed and out of scope. Occupied hours use the TM59 definition (`tm59.occupied`, the 0.1 floor), never `> 0`. Assert at load the Figure 5.3.1 spot values within 0.5 K and, for each EN category, `neutral(trm) + upper === tm59.CATEGORIES[id].tmax(trm)` at Trm 10, 20 and 30.
- [ ] T029 [US1] Transcribe the EN 16798-1:2019 Annex B lower offsets and the lower applicability bound into `src/comfort.js`, with a comment stating that they were checked against the purchased text and by whom; the purchased text never enters the repository. This task is complete only when the maintainer confirms the check.
- [X] T030 [P] [US1] Add `densityOutline(marks, grid, share = 0.9)` to `src/views.js` per research.md §R9: a fixed 48 × 32 grid in plot coordinates, cells taken in descending count with ties broken by cell index until they hold at least 90 % of the marks, and the marching-squares boundary of that set with no smoothing, reusing the marching square the E-02 survey uses.
- [X] T031 [P] [US1] Add `nearestHour(index, x, y)` and its uniform grid index builder, and the `WasNow` class, to `src/views.js`; memoise computed readings on the identity of the `RunSeries` and `ViewSetting` pair.
- [X] T032 [US1] Declare the `psy` `View` in `src/views.js` and add its renderer to `src/plate.js`: dry bulb against humidity ratio at the pressure from `facts.elevation`; the saturation curve and RH curves at 10 % intervals; zone marks (square caps) and outdoor marks (round caps) as one `<path>` per series; the region choice (`g` default, `a`) with `REGIONS.adaptive` listed as unavailable with its §5.4 reason while `facts.mechanicalCooling` holds; the graphic zones with their citation in place and applicability in a fold (FR-011b); one share per zone; the adaptive strip for the reading hour's day, labelled with that day, with unassessed and out-of-scope counts lettered apart; the reading hour in the armed square idiom; a click resolved by `nearestHour` to `frame.on.pin(at)`; the ghost as a `densityOutline` with every share reading `was → now`; axes lettered through `KINDS.humidityRatio`; `describe` naming the view, axes and shares.
- [X] T033 [US1] Add to `.harness/views-counts.mjs` (quickstart.md §4 steps 1, 2 and 6): solve a year run with a south opening and Gains in the path, read it with `readRunSeries`, and compare `graphicShares` and `adaptiveCounts` for `a80` with plain loops over the hourly arrays; the five adaptive counts must sum to the occupied hours; the TM59 readings must be unchanged by T027.
- [X] T034 [US1] Add to `.harness/views-declarations.mjs` a comfort polygon shifted by 1 K and an EN offset disagreeing with `tm59.CATEGORIES`; each patched import must throw and name the declaration.
- [X] T035 [US1] Drive the page through the US1 rows of quickstart.md §6: choose Psychrometric, choose the adaptive region with System in and then out of the path, click a zone mark and confirm the rail's pin agrees, switch SI and IP and confirm no mark moves and no solve starts, and drag Insulation and confirm the 90 % outline and `was → now`.

**Checkpoint**: User Story 1 is complete and deliverable on its own.

---

## Phase 4: User Story 2 - Choose which series the time series draws (Priority: P2)

**Goal**: The time series draws exactly the chosen series, refuses turning off
the last one, and lists unreported series with their reason.

**Independent Test**: Turn on Operative and turn off Outdoor, and confirm
exactly those series are drawn, labelled and named in the description; then
try to turn off the last series and confirm the refusal.

### Implementation for User Story 2

- [X] T036 [US2] Add the series toggles to `src/plate.js` for views with `drawsSeries`: one control per selectable `SeriesDef`, each series in `live.absent` listed as unavailable with its reason, and the last drawn series refused with "At least one series must be drawn." in view (FR-010); a toggle calls `frame.on.choose(settingFor(...))`.
- [X] T037 [US2] Extend the `ts` renderer in `src/plate.js` to draw every chosen series with its own right-gutter label and pen, draw a faint ghost line for each drawn zone series in the same pen (FR-020d), and name the drawn series in `describe`; the output at `DEFAULT_SETTING` must still equal the T001 fixtures.
- [X] T038 [US2] Verify US2: rerun the T024 fixture comparison, rerun `.harness/views-link.mjs` for `pv=ts.s-...` values, and drive the US2 row of quickstart.md §6.

**Checkpoint**: User Stories 1 and 2 both work on their own.

---

## Phase 5: User Story 3 - Judge comfort against an adaptive band (Priority: P3)

**Goal**: Operative temperature against the running mean for occupied hours,
with the chosen model's limits and counts.

**Independent Test**: On a year run, choose Adaptive comfort, and confirm the
band, its citation, and the above, within and below counts, plus unassessed
and out of scope.

### Implementation for User Story 3

- [X] T039 [US3] Declare the `adp` `View` in `src/views.js` and add its renderer to `src/plate.js`: one mark per occupied hour at (running mean, operative temperature) as one `<path>`; the chosen model's upper and lower limits drawn only across the model's applicability range; the model choice (`en1`, `en2` default, `en3`, `a80`, `a90`); the citation in place and method in a fold; the five counts; the reading hour; click-to-pin through `nearestHour`; the ghost as a `densityOutline` with counts reading `was → now`.
- [X] T040 [US3] Extend `.harness/views-counts.mjs` to compare `adaptiveCounts` for all five models with direct loops, and drive the page to confirm the refusal on a design-day run and on a file that cannot seed the running mean (US3 scenario 3).

**Checkpoint**: User Story 3 works on its own.

---

## Phase 6: User Story 4 - See the year as a carpet (Priority: P3)

**Goal**: Hour of day against day of the run, shaded in declared bins, with
weekends and holidays marked, click-to-pin, and a change toggle.

**Independent Test**: On a year run, choose Carpet, and confirm a 24 by N grid
with a lettered scale, weekend and holiday ticks, and the reading hour.

### Implementation for User Story 4

- [X] T041 [P] [US4] Add `carpetGrid(run, id, bins)` and `carpetChange(run, ghost, id, bins)` to `src/views.js`: 9 bins on the single-hue scale and 11 signed bins centred on a zero bin; each bin's range returned for the legend; `NaN` hours left empty.
- [X] T042 [US4] Declare the `crp` `View` in `src/views.js` and add its renderer to `src/plate.js`: one `<path>` per bin of rectangle subpaths; the legend lettering each bin's range (differences through `deltaKindOf`); weekend and holiday ticks in the left gutter from the daily `dayType` series; the shade choice (`c-`, default `air`); click-to-pin on a cell; the change toggle present only while a ghost stands, withdrawn and reset when it clears (FR-020c); extremes lettered `was → now` in either state; the refusal on a design-day run.
- [X] T043 [US4] Verify US4: extend `.harness/views-link.mjs` for `pv=crp.c-...`, and drive the carpet rows of quickstart.md §6, including the design-day refusal with no fallback.

**Checkpoint**: User Story 4 works on its own.

---

## Phase 7: User Story 5 - Count hours above a temperature (Priority: P3)

**Goal**: Each chosen series sorted by value against hours, with a cursor
reading reachable by tap, click and keyboard.

**Independent Test**: On a year run, step to 26 °C and confirm the count of
hours at or above it equals a direct count.

### Implementation for User Story 5

- [X] T044 [P] [US5] Add `durationCurve(values)` (sorted descending, `NaN` excluded) and `hoursAtOrAbove(sorted, value)` to `src/views.js`, memoised per `RunSeries`.
- [X] T045 [US5] Declare the `dur` `View` in `src/views.js` and add its renderer to `src/plate.js`: the chosen series sorted against hours, the datum lines kept, the reading hour's rank marked on each curve, ghost lines per zone series; the cursor set by tap, click, Left, Right, Page Up, Page Down, Home and End, lettering the value and hours at or above it for each series in view and through the live region (FR-015).
- [X] T046 [US5] Extend `.harness/views-counts.mjs` with `hoursAtOrAbove` at 26 °C and 18 °C against direct counts on `air` (quickstart.md §4 step 3), and drive the duration row of quickstart.md §6.

**Checkpoint**: User Story 5 works on its own.

---

## Phase 8: User Story 6 - Read a typical day for each month (Priority: P3)

**Goal**: One 24-hour mean profile per covered month per chosen series.

**Independent Test**: On a year run, confirm one profile per covered month,
each named, and none for uncovered months.

### Implementation for User Story 6

- [X] T047 [P] [US6] Add `averageDay(run, id)` to `src/views.js`, returning a `Map` from covered month to 24 means computed only over that month's hours, with months the run does not cover absent.
- [X] T048 [US6] Declare the `avg` `View` in `src/views.js` and add its renderer to `src/plate.js`: one profile per covered month per chosen series, each labelled with its month; the statement that a single hour cannot be placed, and a mark at the reading hour's month and hour of day; ghost lines per zone series.
- [X] T049 [US6] Extend `.harness/views-counts.mjs` with `averageDay` against a direct per-month, per-hour mean (quickstart.md §4 step 4), and drive the average day row of quickstart.md §6.

**Checkpoint**: User Story 6 works on its own.

---

## Phase 9: User Story 7 - Read demand against outdoor temperature (Priority: P4)

**Goal**: Daily heating and cooling demand against daily mean outdoor
temperature, reconciled with the bill.

**Independent Test**: With System in the path, confirm one mark per day for
heating and cooling and that the daily sums equal the meter totals.

### Implementation for User Story 7

- [X] T050 [US7] In `syncReporting` in `src/model.js`, request `Zone Ideal Loads Supply Air Total Heating Energy` and `Zone Ideal Loads Supply Air Total Cooling Energy` at Daily with key `*` when `holds(doc, 'ZoneHVAC:IdealLoadsAirSystem')` and the document holds at least one, beside the AFN gate (contracts/reporting.md §2 rule 2).
- [X] T051 [US7] Read the two daily series into `RunSeries.daily` in `src/readings.js` through their `SeriesDef` (J to kWh), and enter them in `absent` with the bypass reason when the document holds no ideal loads system.
- [X] T052 [P] [US7] Add `dailySignature(run)` to `src/views.js`: per day, the mean outdoor temperature from the hourly `outdoor` series and the daily `heat` and `cool` totals.
- [X] T053 [US7] Declare the `sig` `View` in `src/views.js` and add its renderer to `src/plate.js`: daily heating and cooling marks distinguished by shape and label, the statement that a single hour cannot be placed, the ghost as a `densityOutline`, and the run totals lettered `was → now` while a ghost stands.
- [X] T054 [US7] Extend `.harness/views-reporting.mjs` with quickstart.md §1 steps 5 and 6 for the System desk (both daily series present; none on the default desk; Σ `heat` and Σ `cool` equal the meter totals within 1e-6 relative), extend `.harness/views-counts.mjs` with `dailySignature` (§4 step 5), and run `.harness/views-cost.mjs` on the System desk.

**Checkpoint**: User Story 7 works on its own.

---

## Phase 10: User Story 8 - Aggregate and zoom the time series (Priority: P4)

**Goal**: Hourly, daily and monthly aggregation, a zoomed date range, and one
action back to the whole run.

**Independent Test**: Choose daily aggregation and confirm one point per day;
drag the range preview's handles to 12 to 19 July and confirm every hour is
drawn; return to the whole run in one action.

### Implementation for User Story 8

- [X] T055 [P] [US8] Add `aggregate(values, points, grain)` to `src/views.js`, returning the mean, minimum and maximum per day or month over non-`NaN` hours, and a zoom slice by `MMDD` range.
- [X] T056 [US8] Extend the `ts` renderer and controls in `src/plate.js`: the aggregation choice (`h`, `d`, `m`) drawing each point as its period's mean with the range shown; range selection on the time axis by drag, by two taps, and by keyboard; the zoomed range lettered; one control returning to the whole run.
- [X] T057 [US8] In `src/main.js`, on each new run keep a zoom the new `RunSeries` covers and otherwise release it to `null` with the reason lettered in the plate's status line (US8 scenario 3), and update the permalink.
- [X] T058 [US8] Extend `.harness/views-link.mjs` for `a-` and `z-` values (including `0230` and a reversed range under rule 7), and drive the aggregation and zoom row of quickstart.md §6.

### Range preview for User Story 8 (FR-018a to FR-018d, clarified 2026-09-30)

The clarification of 2026-09-30 replaces the two date lists of T056 with a
range preview beneath the time series. T055, T057 and the link format are
unchanged: a range is still `{from, to}` day numbers, written `z-MMDD_MMDD`.

- [X] T068 [US8] Add `rangeSegments(live)` to `src/views.js`: one frozen `RangeSegment` per run period (first and last day number, first and last hour index), read off `live.points` as `zoomSpan` reads them, and the daily means of each series in `live.series` over non-`NaN` hours by `aggregate(..., 'd', ...)`. DOM-free.
- [X] T069 [US8] Add `moveRange(live, zoom, part, to)` to `src/views.js`, beside `zoomSpan`, where `part` is `from`, `to` or `window` and `to` is a day number: snap to whole days, keep a range of at least one day, stop a handle or the window at the edge of its run period, move the whole window into another run period when `to` lies in one (keeping its length, clipped to that period), and return `null` when the result is the whole run. Every non-null result must pass `zoomSpan` (FR-018d).
- [X] T070 [P] [US8] Add the host `<div class="plate-range" id="plate-range" hidden>` to `index.html` between `#trace` and `#plate-views`, with its styles in the same file beside `.plate-views`: reduced height, `--inset` fill and hairline border, a visible break between segments, handles and window with hit areas of at least 24 px, `touch-action: none` on the preview only, and a `.plate-range[hidden]` twin.
- [X] T071 [US8] Add `drawRangePreview(host, frame)` to `src/plate.js`: an SVG of the whole run drawing each series in `frame.setting.series` as daily means per `RangeSegment`, a tick at the reading hour, no ghost and no design-day lines (FR-018b); two handles and a window, each with `role="slider"`, `tabindex="0"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and an `aria-valuetext` lettered as a date ("12 Jul"), and `data-focus` values `range:from`, `range:to` and `range:window`. The host is hidden unless the view is `ts` and `frame.live.facts.weatherDays` is true.
- [X] T072 [US8] Wire the preview's gestures in `src/plate.js`, with the listeners on `#plate-range` rather than on its SVG (the redraw replaces the SVG, as it does for the reading-hour drag in `src/main.js`): a pointer drag on a handle or the window calls `moveRange` and, only when the day changes, `frame.on.preview(setting)`; the release calls `frame.on.choose(setting)`; a tap outside the window moves it there. Keys on a focused slider: arrows 1 day, Page Up and Page Down 7 days, Home and End to the run's ends, each committed through `frame.on.choose`.
- [X] T073 [US8] Remove the Range fieldset from `drawTimeChoices` in `src/plate.js` (both `<select>` lists, `apply()` and its two refusals, which `moveRange` makes unreachable), keep the "Whole run" button as the one action back to the whole run, rewrite the function's comment to name the preview, and change the focus fallback in `drawChooser` from `range-from` to `range:window`.
- [X] T074 [US8] In `src/main.js`, add `preview` to the frame's `on` handlers: set `viewSetting`, redraw through one `requestAnimationFrame` flag so a later step replaces an earlier one not yet drawn, and leave the permalink alone (FR-018c); `setView` on release writes it once. Call `drawRangePreview($('plate-range'), frame)` from `renderPlateControls`, and confirm that a drag on `#trace` still pins the reading hour.
- [X] T075 [US8] Write `.harness/views-range.mjs` against the real `src/views.js`: a year run and a two-period run (January and July); assert snapping, the one-day minimum, the stop at a period edge, the jump into another period, `null` at the whole run, and that every result passes `zoomSpan` and round-trips through the `z-` codec.
- [X] T076 [US8] Replace the zoom row of quickstart.md §6 in `specs/015-chart-views/quickstart.md` with rows for a handle drag, a window pan, the keyboard slider, a tap in the other period of a January and July run, and the link written once per drag; then drive them on the page.

**Checkpoint**: all eight user stories work on their own.

---

## Phase 11: Polish and Cross-Cutting Concerns

**Purpose**: Onboarding, the design system, documentation, the two
measurements and the final passes.

- [X] T059 [P] Rewrite the plate step in `NOTES` in `src/tour.js` to teach the chooser, and bump `STORE` from `shoebox-general-notes-v6` to `shoebox-general-notes-v7` (FR-026).
- [X] T060 [P] Record the five patterns in `.interface-design/system.md`: the view chooser, scatter marks by shape, the 90 % outline ghost, the carpet's binned shade and change toggle, and the keyboard cursor on the plate; close the gap recorded under "The reading hour on the plate".
- [X] T061 Remove the dead time series code left in `renderTrace` in `src/main.js` after T016, and confirm the T001 fixture comparison still passes.
- [ ] T062 Measure SC-001 per quickstart.md §8 on `http://localhost:5173/?measure`: 10 switches per view pair on a year run, unthrottled and at Chrome 4× CPU slowdown; the medians must be under 150 ms and 500 ms.
- [X] T063 Run `.harness/views-cost.mjs` on both desks for the final SC-002 figures; each ratio must be at most 1.05.
- [X] T064 Add the section "Seven ways to draw one run" to `docs/design-notes.md`, recording the design decisions of research.md, the SC-001 and SC-002 figures from T062 and T063, and the non-obvious findings met during implementation.
- [X] T065 [P] Add the one-paragraph short form of the feature to `CLAUDE.md` under Architecture, and add `pv` to the list of reserved keys in its Permalink entry.
- [X] T066 Repeat quickstart.md §6 for every view in device emulation at 390 × 844 (quickstart.md §7): no horizontal page scroll, the chooser wraps, every unavailable reason is visible, the duration reading is reachable by tap, and nothing is conveyed only by hover or a `<title>`.
- [X] T067 Run the full quickstart.md: every harness under `.harness/views-*.mjs` and `.harness/comfort-line.mjs`, the whole table of §6 including the study-continues and saved-scheme rows (quickstart.md §3 step 5), and `npm run build`.

- [X] T077 [P] Amend `.interface-design/system.md`: in pattern 1 replace the native selects of the range with the range preview, and record the preview as a pattern (reduced-height overview, handles and window, the break between run periods, 24 px targets).
- [X] T078 [P] Record the range preview in the section "Seven ways to draw one run" of `docs/design-notes.md`: why the date lists were replaced, why the listeners sit on the host, the latest-wins redraw, and the link written on release.
- [X] T079 Repeat the range preview rows of quickstart.md §6 at 390 × 844 in device emulation (SC-006): handles and window reachable by touch, a drag on the preview does not scroll the page, and no horizontal page scroll.
- [ ] T080 Measure one drag across a month of a year run on `http://localhost:5173/?measure` at Chrome 4× CPU slowdown: the median redraw per day step, and a count of permalink writes, which must be exactly one; record both beside the T062 figures in `docs/design-notes.md`.

---

## Dependencies and Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T001 and T002 must run on unmodified
  `main`.
- **Foundational (Phase 2)**: depends on Setup. It blocks every user story.
- **User stories (Phases 3 to 10)**: each depends only on Foundational, with
  the exceptions below.
- **Polish (Phase 11)**: depends on every story that is to ship.

### Dependencies between stories

- **US1 (P1)**: none beyond Foundational.
- **US2 (P2)**: none. It changes the `ts` renderer, which US8 also changes;
  run them one after the other.
- **US3 (P3)**: needs `src/comfort.js`, `yearRunningMean` and
  `densityOutline` from US1 (T027, T028, T030, T031).
- **US4 (P3)**: none beyond Foundational.
- **US5 (P3)**: uses the series toggles from US2 (T036) to choose more than
  the default series; it can ship with the default series alone.
- **US6 (P3)**: as US5.
- **US7 (P4)**: uses `densityOutline` from US1 (T030).
- **US8 (P4)**: follows US2 in `src/plate.js`. Within the range preview,
  T068 then T069 (one file) precede T071 to T075; T070 runs beside them;
  T071, T072 and T073 change `src/plate.js` one after the other; T074 needs
  T071 and T072; T076 needs T074.

### Within each story

- DOM-free computation in `src/views.js`, `src/comfort.js` or
  `src/psychro.js` comes before the renderer in `src/plate.js`.
- The renderer comes before the harness extension and the page drive.
- `src/plate.js` is one file; renderer tasks from different stories are not
  run in parallel with each other.

## Parallel Opportunities

- **Setup**: T002 and T003 run together after T001 is started.
- **Foundational**: T005, T010 and T022 run together; T023 runs beside any of
  them. T009 needs T010's `SeriesDef`; T011 and T012 follow T010.
- **US1**: T025, T026, T030 and T031 run together. T027 then T028 follow.
- **US4 to US8**: the computation tasks T041, T044, T047, T052 and T055 all
  change `src/views.js` and must be applied one after the other, but each
  can be written as soon as Foundational is done.
- **Polish**: T059, T060 and T065 run together; so do T077 and T078.
- **Range preview**: T070 (`index.html`) runs beside T068 and T069
  (`src/views.js`).

### Parallel example: User Story 1

```text
Task: "T025 Create src/psychro.js"
Task: "T026 Write scripts/build-comfort.mjs and generate src/comfort.data.js"
Task: "T030 Add densityOutline to src/views.js"
Task: "T031 Add nearestHour and WasNow to src/views.js"   (after T030, same file)
```

### Parallel example: Foundational

```text
Task: "T005 Add KINDS.humidityRatio to src/units.js"
Task: "T010 Create src/views.js declarations"
Task: "T022 Chooser host in index.html and src/style.css"
Task: "T023 Copy budgets in src/copy.js"
```

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete Phase 1 on unmodified `main`.
2. Complete Phase 2. The page must be unchanged at its default.
3. Complete Phase 3 (US1).
4. Stop and verify US1 against quickstart.md §4 steps 1, 2 and 6 and the US1
   rows of §6.
5. Complete T059, T060 and T064 to T067 for the views that ship, and deliver.

### Incremental delivery

Each subsequent story is one increment that leaves the page working:

1. US2, series choice.
2. US3 to US6, the four P3 views, in the order adaptive, carpet, duration,
   average day.
3. US7, then US8.

A view enters `VIEWS` only with its renderer (T010, T017), so a partial
delivery lists only the views it can draw, and the codec refuses a link
naming a view the build does not yet carry.

### Open items that block merge

- T029: the EN 16798-1 lower limits must be checked against the purchased
  text by the maintainer.
- T028: the Figure 5.3.1 spot values must be read off the printed figure.
- T063: SC-002 must be measured, not estimated.
- T068 to T080: the range preview replaces the date lists on #98 before it
  leaves draft.

## Phase 12: Convergence

- [X] T081 Transcribe the ASHRAE 55-2020 Figure 5.3.1 spot values (the corner temperatures at W = 0 and W = 12 g/kg for 0.5 clo and 1.0 clo, to the figure's 0.5 K reading precision) from the maintainer's copy into `FIGURE_SPOTS` in `src/comfort.js`, which is currently empty, so that `assertGraphic` checks the graphic zones against the printed figure; complete only when the maintainer confirms the reading, per FR-011a (partial)
- [X] T082 Obtain the maintainer's acknowledgement of the FR-002 departure recorded in `docs/design-notes.md` ("One deliberate departure from FR-002 since": the design-day time series now lifts its pen between environments, so `.harness/fixtures/plate-ts-dd.svg` no longer matches byte for byte), and either have FR-002 amended to state the exception or restore the joined stroke, per FR-002 (contradicts)
