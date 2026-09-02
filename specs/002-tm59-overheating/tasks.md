---

description: "Task list for 002-tm59-overheating"
---

# Tasks: Overheating risk to CIBSE TM59

**Input**: Design documents from `/specs/002-tm59-overheating/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: There is no test runner and no linter in this repository. Verification
is throwaway Node harnesses under `.harness/` and then driving the page, which is
what the constitution's ten workflow gates require. The harness tasks below are
therefore *not* optional TDD scaffolding: they are the quality gates, and each
cites the quickstart scenario it discharges.

**Organization**: Tasks are grouped by user story. Stories 1 and 2 are equal-first
in the specification and the plan's sequencing note requires them to ship as one
increment; they are kept as separate phases so each stays independently testable,
but there is no release between them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions

Single-page client-side application. One flat `src/` tree at the repository root,
`scripts/` for author-time generators, `.harness/` for throwaway verification.
Paths below are repository-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Discharge the correction the plan owes the specification, and stand up
the verification harness every later gate runs in.

- [X] T001 Correct `specs/002-tm59-overheating/spec.md` against the "Corrections owed to `spec.md`" table in `specs/002-tm59-overheating/research.md`: delete the "Published figures this specification rests on" table entirely, strike FR-002 (no weighted-exceedance criterion exists in TM59 in either edition), rewrite FR-003 (criterion b is a count of nights whose 23:00-08:00 **mean** operative temperature exceeds Tn, 26 °C Cat I / 27 °C Cat II, against four nights, over 1 May to 30 September), rewrite FR-004 (criterion c is 26 °C over 3 % of occupied hours 1 May to 30 September, not annual), widen FR-010 to govern all four criteria under one assessment period, weaken FR-011 per Decision 11, expand FR-014 with criterion d and Category I and the four weather mismatches, mark FR-017b discharged against Decision 6, and correct the "Assessment period" key entity to one period
- [X] T002 Add the new edge cases to `specs/002-tm59-overheating/spec.md` from the same table: criterion b's last night ending 08:00 on 1 October, the published hour limits (59, 110) being truncated from 3 % so a share test and a count test disagree at the boundary, TM52 permitting a partial period where TM59 does not restate it, the occupancy schedule's 0.1 out-of-hours floor (testing `> 0` counts 3672 hours where the answer is 1100), the summer design day falling inside the period by date, and ∆T at exactly 1.5 K rounding up by TM59's closed interval; re-attach the existing "Rounding is part of the published method" edge case to criterion a's ∆T rather than to a weighted exceedance
- [X] T003 Create `.harness/` and add it to `.gitignore`
- [X] T004 Write `.harness/boot.mjs`: the shared harness bootstrap that loads the schema via `localBundle().load('26.1.0')` from `@idfkit/schemas/node`, serialises with `writeIdf(doc)` from `@idfkit/core`, and falls back to `public/energyplus/energyplus.js` under Node (set `global.Module` to `{ noInitialRun: true, locateFile }` before requiring, clear the require cache between runs) where `/Applications/EnergyPlus-26-1-0` is absent

**Checkpoint**: the specification describes the 2026 method, and a harness can build, serialise and run a document.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The declarations, the running mean and the denominator series that every criterion is read from.

**⚠️ CRITICAL**: No criterion can be read until this phase is complete.

- [X] T005 Create `src/tm59.js` as a DOM-free, network-free, engine-free module importing only `hourly` and `environmentRuns` from `src/readings.js`, and declare `Category` plus the frozen `CATEGORIES` pair per `data-model.md`, with the module-load invariant that `0.33·10 + 18.8 + k` reproduces the published lower clamps (24.1, 25.1) and `0.33·30 + 18.8 + k` the upper (30.7, 31.7) to within 1e-9
- [X] T006 Declare `Season` and the single frozen `SEASON` instance in `src/tm59.js` (1 May to 30 September, 153 days, tail 1 October, seed 23 to 29 April), with the module-load invariants that `days` equals the day count between `from` and `to` in a non-leap year and that `153 × 13 = 1989` and `153 × 24 = 3672`
- [X] T007 [P] Declare `Criterion` and the frozen `CRITERIA` list (a, b, c, d) in `src/tm59.js`, each carrying its limit, unit, threshold, clause reference and TM59:2026 quotation, with module-load invariants that exactly two criteria carry `stage1` and that any criterion with `judgeable: false` carries an `unreadable` sentence
- [X] T008 [P] Declare `Reading`, `Verdict` and `Coverage` in `src/tm59.js`, where `Reading`'s constructor throws when `value` and `absence` are both set or both null, so the em dash rule is structural rather than remembered
- [X] T009 [P] Declare `Qualification` and the frozen `QUALIFICATIONS` list in `src/tm59.js`, each with its `says`, its `because` and whether it is `standing`, with a module-load invariant of at least four `standing` entries so SC-005's promise cannot silently fall below what it states
- [X] T010 Add `dailyMeans(epw)` to `src/epw.js`, returning 365 daily mean dry-bulb temperatures off the EPW's data records and throwing with the first day it could not read; it belongs here rather than in `tm59.js` because it is EPW parsing and its only honest test is a real file
- [X] T011 Implement `runningMean(dailyMeans)` in `src/tm59.js`: seed at 30 April by TM52 Equation 2.3 over 23 to 29 April (the 3.8 denominator is the sum of the weights, so a dropped denominator is wrong by nearly four times while still looking plausible), then recurse by Equation 2.2 to 30 September, unconditionally on what was simulated, throwing where the file does not cover 23 April to 30 September
- [X] T012 Implement `comfortLine(trm, dayOfYear)` in `src/tm59.js` returning a `ComfortLine` for both categories, clamped at Trm = 10 and Trm = 30 to the published endpoints, reporting which clamp is in force so a face can say the line has stopped moving
- [X] T013 Implement `seasonCoverage(eso)` in `src/tm59.js`, read off the run's own timestamps and never off `params`, returning the months reached, the days of 153 covered and whether criterion b's last night was complete (`tail`)
- [X] T014 Implement the shared reader helpers in `src/tm59.js`: the occupied-hour test against a floor passed in by the caller (0.1 for `bandSchedule`, 0 for a TM59 pattern), the design-day environment exclusion by the rule `readOverheat` and `computeBill` already follow, and the operative-temperature series lookup that returns an absence rather than falling back to `Zone Mean Air Temperature`
- [X] T015 Extend `syncReporting` in `src/model.js` to request `Schedule Value` for the `Occupancy` schedule on the `'sheet'` profile, preserving clear-and-rewrite so "lean then sheet" still serialises byte-identically to "always sheet"
- [X] T016 Write `.harness/declarations.mjs` discharging quickstart §1: import `src/tm59.js` and `src/controls.js` under Node, then break each invariant on a copy and confirm six distinct throws naming what is wrong
- [X] T017 [P] Write `.harness/comfort-line.mjs` discharging quickstart §2 and §3: reproduce the four published clamp values to within 1e-9, and confirm the running mean is seeded at 23 to 29 April with `Tod` always the *previous* day's mean, since an off-by-one shifts the comfort line by a day for the whole season
- [X] T018 Write `.harness/variables.mjs` discharging quickstart §4 and constitution gate 3: build the default desk, run it, and confirm `Zone Operative Temperature`, `Site Outdoor Air Drybulb Temperature` and `Schedule Value` for `Occupancy` appear hourly in `eplusout.eso`'s dictionary and in the `.rdd`, and grep `eplusout.err` for "requested but not generated"

**Checkpoint**: the declarations throw on a mistyped figure, the comfort line reproduces the published clamps, and the denominator series is in the run.

---

## Phase 3: User Story 1 - Read the adaptive criterion instead of a fixed line (Priority: P1) 🎯 MVP

**Goal**: The scoreboard letters criterion a's share of occupied summer hours with ∆T ≥ 1 K against its published limit, beside the comfort line the run was actually judged against.

**Independent Test**: Engage a free-running desk with a year attached and confirm the sheet letters an exceedance share that rises when the glazing ratio on the sunlit wall is raised, and that the comfort line lettered beside it differs between a cool climate and a hot one on the same building.

- [X] T019 [US1] Implement `readCriterionA(eso, trm, category)` in `src/tm59.js`: occupied hours whose operative temperature stands at least 1 K above the comfort line as a share, with ∆T **rounded before it is tested** using `Math.round` (half-up, so 1.5 becomes 2 by TM59:2026's closed interval at 1.49, never round-half-to-even), returning a `Reading` whose absence names its fix
- [X] T020 [US1] Implement rule 5 of the module contract in `readCriterionA` in `src/tm59.js`: a partial assessment period is a reading rather than an absence, the share taken over available occupied hours with `Coverage` returned beside it at equal prominence and both TM52's permission and TM59's silence stated; only a run reaching no part of 1 May to 30 September is absent
- [X] T021 [US1] Add the `tm59` block to `readOutcome` in `src/main.js` (`readings`, `count`, `coverage`, `line`, `qualifications`), taken once at the solve into `lastOutcome` rather than off the ESO at draw time, so a gesture frame re-letters from held numbers
- [X] T022 [US1] Cache the running mean on the attached weather file's identity in `src/main.js`, beside `offersFor` and `calendarFor`, cleared where the studies and the sample cache are cleared on a station change; `dailyMeans` is 13.2 ms and eight times every criterion put together
- [X] T023 [P] [US1] Add `needs: 'season'` and the `category` field to `Target` in `src/schemes.js`, leaving every existing target untouched, where `'season'` means the run has to reach some part of 1 May to 30 September
- [X] T024 [P] [US1] Declare the TM59 preset shell in `src/schemes.js` as a `Preset` of `kind: 'standard'`, issuer CIBSE, source `TM59 (2026)`, carrying the a·I and a·II targets with their clauses
- [X] T025 [US1] Teach `targetReading` in `src/main.js` to resolve `'tm59a'` off `lastOutcome` exactly as it resolves `'tedi'`, with the category carried in the key so a·I and a·II do not collide
- [X] T026 [US1] Extend `targetBlock` / `targetAbsence` in `src/main.js` with the `season`, `occupancy` and `operative` blockage keys, in that precedence and extending the existing order rather than reordering it, so nobody is sent to fetch a year before being told to patch Gains in
- [X] T027 [US1] Extend `renderScore` in `src/main.js` so criterion a's rows letter the range the comfort line moved through and its mean over the covered days, saying where a clamp was in force for part of the period (FR-006), the period covered as `Coverage.months` and days of 153 (FR-010), and what the reading is of: operative temperature, the building as drawn where `roomType` is `'As drawn'` (FR-007, FR-016)
- [X] T028 [US1] Join the TM59 rows to `resultPanels` in `src/main.js` and take them down in `clearReadings` on `solve`'s failure exits, so a run in flight does not blank them and they come down where they actually stop being true (FR-028)
- [X] T029 [US1] Fold the criterion rows at the schedules' existing 620 px breakpoint in `src/style.css`, each figure keeping the head it was under via `data-head` set where the cell is built in `renderScore`; declare no new breakpoint
- [X] T030 [US1] Write `.harness/criteria.mjs` discharging quickstart §7: read criterion a over a real annual run and confirm the denominator is the published occupied-hour figure rather than 3672, since testing `> 0` against the 0.1 out-of-hours floor counts every hour of all 153 days and happens to agree with a published number for the wrong reason
- [X] T031 [US1] Extend `.harness/criteria.mjs` for quickstart §8: confirm the share responds to glazing ratio, openable area and shading, and that the comfort line differs between two stations on the same building

**Checkpoint**: criterion a reads, responds to design and to climate, and states the line it was judged against. Do not ship without Phase 4.

---

## Phase 4: User Story 2 - Never let this read as a certificate (Priority: P1)

**Goal**: Every TM59 figure stands under a qualification, the unjudged list is printed beside what is judged, and no pass or fail word attaches to the method's name.

**Independent Test**: Read every TM59 figure on the sheet and confirm each carries its own qualification or stands under a standing one, and that a reader who reads only that block can state at least four specific reasons why this is not a TM59 compliance assessment, at 390 px, without hovering.

- [X] T032 [US2] Write the `QUALIFICATIONS` content in `src/tm59.js`: the standing ones (one zone against a per-room assessment governed by the worst room, the weather being whatever is attached, the method being a compliance procedure rather than a performance line, the criteria being read over the building as drawn) and the run-dependent ones (the weather the run used, whether the prescribed profiles were applied, cooling in the path, the unshifted local time)
- [X] T033 [US2] Implement `qualificationsFor(eso, params, bypass, weather)` in `src/tm59.js`, returning the standing qualifications plus whichever run-dependent ones apply, read off the document and the run rather than off live settings
- [X] T034 [US2] Implement the weather qualification's facts in `src/tm59.js` from what the attached file declares about itself via `src/epw.js`'s header parser, stated against what WFR:2026 requires (DSY1, 2050s, RCP8.5, 50th percentile, CIBSE 28-zone), with **no** assertion that the two do or do not match (FR-015, FR-015a)
- [X] T035 [US2] Write the `unjudged` list on the TM59 preset in `src/schemes.js`: criterion d (communal areas), Category I's applicability, the four weather mismatches under research Decision 7, the per-room assessment, the three-stage strategy, ceiling fans, the noise and security constraints, and the communal pipework gains
- [X] T036 [US2] Implement `clearedCount(readings)` and `COUNT_SCOPE` in `src/tm59.js`, over criteria a and b at Category II (the naturally ventilated Stage 1 pair, per research Decision 6), returning `{ cleared, read, unread, scope }` with criteria that could not be read reported as unread rather than folded into either number
- [X] T037 [US2] Render the count row in `renderScore` in `src/main.js` as one row naming both numbers and its scope, never as a proportion or a score, saying that criterion c is read separately and outside the count and that criterion d could not be read
- [X] T038 [US2] Render the qualifications block under the TM59 rows in `src/main.js`, in place and never on hover, one line per `Qualification`, folding at 620 px with the `because` standing under the `says` and its head lettered from `data-head`
- [X] T039 [US2] Audit `src/main.js` and `src/schemes.js` so no pass or fail word attaches to TM59's name anywhere and no overall verdict against the method is lettered (FR-017, SC-006); individual criterion rows carry verdicts as every scoreboard row does, the method does not
- [X] T040 [US2] Add the conditioned-zone qualification to `src/tm59.js` and its rendering, stating that a zone holding its own setpoint makes the reading about the system rather than the fabric (FR-018), since the adaptive criterion looks more authoritative than the fixed lines and will be over-read further
- [X] T041 [US2] Record any new token, component pattern or layout threshold this block introduces in `.interface-design/system.md` in this same change, per constitution gate 8
- [X] T042 [US2] Write `.harness/certificate.mjs` discharging quickstart §9: assert at least four `standing` qualifications, assert no pass/fail word appears against the method's name in the rendered scoreboard, and assert the count row names both numbers

**Checkpoint**: Stories 1 and 2 ship together. The criterion reads and cannot be mistaken for a certificate.

---

## Phase 5: User Story 3 - Put the method's own occupancy on the desk (Priority: P2)

**Goal**: The reader applies TM59's prescribed occupancy, gains and opening rule as a register overlay, which needs a `Pattern` control kind the desk does not have.

**Independent Test**: Apply the prescribed setup to the stock desk, confirm the controls it names move and no other control moves, confirm each written value letters its published figure and its arithmetic, and confirm the conformance chip falls by itself when one of those controls is then moved.

- [X] T043 [US3] Write `scripts/build-tm59.mjs` generating `src/tm59.data.js` from TM59:2026 Tables E.1 and E.2, in the shape `scripts/build-rates.mjs` already establishes, cross-checked against the supplied 2017 CSV that caught two errors in the source tables and one internal disagreement between them
- [X] T044 [US3] Generate `src/tm59.data.js`: one frozen `RoomProfile` per space carrying `people`, `sensible` (75 W), `latent` (55 W), `occupied[24]`, `equipPeak`, `equipment[24]`, `lighting` (2 W/m²), `lightHours` `[18, 23]`, `occupiedHours` (1989 or 3672) and a `why` recording the E.1 sentence the fractions were divided out of, with the three research Decision 5 findings each becoming a `why` line rather than a silent resolution
- [X] T045 [US3] Declare `class Pattern extends Control` in `src/controls.js` with `kind = 'pattern'`, a frozen 24-entry `hours` default and a `digits` precision, whose `value` is the canonical text so it stays one scalar on `params`
- [X] T046 [US3] Implement `parsePattern(text)` and `serializePattern(hours, digits)` in `src/controls.js` beside `parseHolidays` / `serializeHolidays`, the parser throwing and naming the field count or the first field out of range, with round trip exact for every pattern the parser accepts
- [X] T047 [US3] Teach `refuses(control, value)` in `src/controls.js` the `pattern` kind: 24 comma-separated fields, each a finite number in `[0, 1]`, refused whole with no half-reading of a pattern with 23 hours in it
- [X] T048 [US3] Declare `roomType` (`Selector`, default `'As drawn'`, the 13 TM59 spaces plus the desk's own default), `occPattern`, `equipPattern`, `lightPattern` (`Pattern`, 24 × 1.0, gated on `roomType !== 'As drawn'`), `peopleCount` and `equipPeak` (`Scale`, absolute) on the Gains channel in `src/controls.js`
- [X] T049 [US3] Add the `pattern` branch to `buildControl` in `src/console.js`, drawing 24 small fields under one label behind the strip fold using the `hidden` attribute so they leave the tab order with it, with `field.js`'s margin-number rules: focus shows the value, blur shows the lettering, `show()` returns early while the field holds focus, and a typed value is clamped, snapped and rounded before it is committed
- [X] T050 [US3] Teach `readValue` in `src/permalink.js` the `pattern` kind **above** the numeric regex, beside `selector`, since a branch added inside the per-kind switch is unreachable and every link carrying the key would be refused as "not a number"
- [X] T051 [US3] Extend `applyGains` in `src/model.js`: at `roomType: 'As drawn'` write byte-identically to today, and at a named room type write three `Schedule:Compact` objects (`Occupancy`, `EquipmentUse`, `LightingUse`) with `People` switched to absolute `People` and `ElectricEquipment` to `EquipmentLevel`, taking `EquipmentUse` and `LightingUse` back out of the document on the way back to `'As drawn'`
- [X] T052 [US3] Emit each pattern's `Schedule:Compact` in `src/model.js` as separate `Until: HH:00` and value extensible fields, never joined into one comma-bearing string, collapsing runs of equal values deterministically or idempotence fails
- [X] T053 [US3] Write the TM59 preset's `specs` in `src/schemes.js` — `roomType`, the three patterns, `peopleCount`, `equipPeak`, `lighting`, `weekend: 'Occupied'` (TM59 §3.7.1) and `infiltration: 0` (CL:2026 §2) — each carrying its `why` with the published figure and the arithmetic between the published units and the desk's own, keeping `peopleCount` and `equipPeak` absolute so the preset never reads Massing, which `UNTOUCHABLE` forbids it to write
- [X] T054 [US3] Confirm `conformance()` in `src/schemes.js` measures the TM59 preset off the desk's current controls on every `applyGeometry` with nothing remembering the setup was applied, so moving a written control drops the chip by itself (FR-022, SC-008)
- [X] T055 [US3] Write `.harness/gains.mjs` discharging constitution gate 2 and quickstart §5: applying three times is byte-identical at both settings of `roomType`, and a desk taken from a named room type back to `'As drawn'` serialises byte-identically to one built at `'As drawn'`
- [X] T056 [US3] Write `.harness/links.mjs` discharging quickstart §6 and constitution gate 4: decode a link captured at `HEAD`, assert the IDF is byte-identical, assert `LINK_VERSION` has not moved and `MIGRATIONS` is empty, and round-trip every declared pattern and every malformed input class through `parsePattern` / `serializePattern` and `readValue`
- [X] T057 [US3] Re-assert `ALL_KEYS` against the reserved keys (`in`, `out`, `stn`, `win`, `at`) at module load in `src/permalink.js` now that six keys have joined

**Checkpoint**: the prescribed setup applies as an overlay, letters its arithmetic, and is remembered nowhere.

---

## Phase 6: User Story 4 - Ask the sleeping-hours question (Priority: P2)

**Goal**: Criterion b letters the count of nights whose 23:00 to 08:00 mean operative temperature exceeded Tn, against four nights, stating that it presumes the room is a bedroom.

**Independent Test**: Read criterion b on a desk with the summer covered and confirm it counts nights rather than hours, takes the mean over nine hours rather than a peak, attributes each night to its opening date, and reads against four.

- [X] T058 [US4] Implement `readCriterionB(eso, category)` in `src/tm59.js`: the count of nights whose **mean** operative temperature over 23:00 to 08:00 exceeds `Tn` (26 °C Cat I, 27 °C Cat II), each night attributed to its opening date, over 1 May to 30 September, returning a count of nights rather than a share
- [X] T059 [US4] Implement rule 7 in `readCriterionB` in `src/tm59.js`: a partial night is not a night. Criterion b's last night ends at 08:00 on 1 October, and a night whose nine hours are not all in the run is counted in neither the numerator nor the denominator, with `Coverage.tail` reporting whether the last one was complete
- [X] T060 [P] [US4] Add the b·I and b·II targets to the TM59 preset in `src/schemes.js` with their TM59:2026 §2.4.2 clause, confirming `Target.meets` needs no change since four nights or fewer is a less-than-or-equal test like every other line
- [X] T061 [US4] Teach `targetReading` in `src/main.js` to resolve `'tm59b'` by category, and extend `renderScore` so criterion b's row letters a night count rather than a share and states that it presumes the room is a bedroom, since the method applies it to bedrooms alone and this desk holds no declaration of what its one room is (FR-003, FR-003a)
- [X] T062 [US4] Extend `.harness/criteria.mjs` for criterion b: assert the night mean is over nine hours, assert the opening-date attribution against the published 1 May and 30 September examples, and assert an incomplete last night is excluded from both terms

**Checkpoint**: the count row from Phase 4 now reads two criteria rather than one read and one unread.

---

## Phase 7: User Story 5 - Ask it of a home that is not naturally ventilated (Priority: P3)

**Goal**: Criterion c letters the share of occupied summer hours above 26 °C against 3 %, and which route applies to which kind of building is stated.

**Independent Test**: Read criterion c on a desk with the summer covered and confirm it letters a share of occupied hours 1 May to 30 September above 26 °C operative against 3 %, over the period rather than the year.

- [X] T063 [US5] Implement `readCriterionC(eso)` in `src/tm59.js`: occupied hours whose operative temperature exceeds 26 °C as a share, over 1 May to 30 September (the period changed in 2026; 2017 read this annually), taking its denominator from what the run covered
- [X] T064 [P] [US5] Add the c target to the TM59 preset in `src/schemes.js` with its TM59:2026 §2.4.3 clause
- [X] T065 [US5] Teach `targetReading` `'tm59c'` in `src/main.js` and extend `renderScore` so both routes state which kind of building each applies to, and neither is presented as the answer for a building of the other kind (FR-004); criterion c stands outside the cleared count and its row says so
- [X] T066 [US5] Extend `.harness/criteria.mjs` for criterion c and confirm criterion d has no reader anywhere in `src/tm59.js`, since a reader that always returned an absence would be a reading pretending to be one

**Checkpoint**: all three readable criteria letter, at both categories where the method defines them.

---

## Phase 8: User Story 6 - Sweep the design against the criterion (Priority: P3)

**Goal**: A study on any sweepable control produces a curve of criterion a's exceedance share on the same terms as every other study.

**Independent Test**: Start a study on the glazing ratio with criterion a as the metric and confirm a curve is produced, and that a sample whose run cannot answer is absent from it rather than plotted at zero.

- [X] T067 [US6] Add the `'tm59'` lean reporting profile to `syncReporting` in `src/model.js`: the zone mean air temperature `zoneRuns` needs, `Zone Operative Temperature` and the `Occupancy` schedule value series — three series against `'sheet'`'s fifteen — preserving clear-and-rewrite so "lean then sheet" still serialises byte-identically to "always sheet"
- [X] T068 [US6] Add `metric: 'tm59a'` to `makeStudyJob` in `src/scheduler.js` and its reader to `src/study.js`, on the same terms as the existing metrics
- [X] T069 [US6] Return `null` from `readPoint` in `src/study.js` where the sample's run cannot answer the criterion, so a null sample is absent from the curve rather than plotted as zero (FR-025); the scheduler already handles a null point
- [X] T070 [US6] Compute the running mean once per study rather than once per sample in `src/scheduler.js`, since a sample carries the desk's climate and the sweep deliberately does not change it
- [X] T071 [US6] Confirm the `Pattern` kind is refused as a study subject in `src/scheduler.js` with the legend saying why, on the same terms as a `Facade` side whose `needs` is false, since a pattern has no `min`, `max`, `step` or `fraction` to sample
- [X] T072 [US6] Write `.harness/study.mjs`: assert the `'tm59'` lean profile restores byte-identically after a sweep, and that a design-day sample returns null rather than a zero

**Checkpoint**: all six stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T073 [P] Add the air-model clause to `describeDesk` in `src/describe.js` (FR-026), read off the document rather than off `params`, ranked with the other channel-flip clauses above anything a slider can reach by the `FLIP` table's existing rule
- [X] T074 Review `NOTES` and its `target` / `focus` selectors in `src/tour.js`, add the `tm59` subject where a step teaches what the scoreboard is for, review the `tour?.note(...)` call sites in `src/main.js`, and bump the storage key from `shoebox-general-notes-v2`, since the steps change meaning and a returning reader must not get stale ticks against notes they never read (constitution gate 6, FR-029)
- [ ] T075 Re-take the annual A/B against the WebAssembly engine in the page per `specs/002-tm59-overheating/quickstart.md` §10, since the plan's 484 ms / 473 ms figures are native Node timings and SC-010 is written against the browser's 0.7 s figure; confirm the design-day solve stays inside the desk's live cadence
- [ ] T076 Drive the page per `specs/002-tm59-overheating/quickstart.md` §11 (`npm run dev`): attach a station, read the scoreboard at 390 px, apply the TM59 preset and confirm only the controls it names move, move one of them and watch the conformance chip fall, start a study on criterion a, and walk the general notes confirming every step's subject still exists and the redline circles it
- [X] T077 [P] Update `CLAUDE.md` with a TM59 section in the house style: what the criteria are, why the running mean is read from the EPW rather than the run, the 0.1 occupancy floor that makes `> 0` count 3672 hours, the half-up rounding at exactly 1.5 K, and the three gates the `Pattern` kind had to pass
- [X] T078 Confirm no TM52 or TM59 PDF is committed anywhere in the repository (`git ls-files '*.pdf'`); the supplied copy is watermarked to a named individual, so the equations and clauses are quoted in comments and in the interface as the register already quotes Passivhaus and LETI, and the document itself stays out

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 and T002 are the correction the plan owes `spec.md` and must land before any criterion is implemented, or the work implements the 2017 method.
- **Foundational (Phase 2)**: depends on Setup. Blocks every user story.
- **User Story 1 (Phase 3)** and **User Story 2 (Phase 4)**: both depend on Foundational. Each is independently testable, but the plan's sequencing note makes them **one increment**: shipping a reading before the block that bounds it is the failure the whole of Story 2 exists to prevent. There is no release between Phase 3 and Phase 4.
- **User Stories 3 to 6 (Phases 5 to 8)**: depend on Foundational only, and can proceed in parallel with each other once Phase 4 is done.
- **Polish (Phase 9)**: depends on whichever stories shipped.

### Cross-Story Notes

- **US2's count row is complete only once US4 lands.** `COUNT_SCOPE` is criteria a and b at Category II, so before criterion b exists the row reads one criterion cleared of one read, with b reported as unread. That is correct behaviour rather than a broken state — unread criteria are reported separately by FR-017a — which is what keeps US2 independently testable ahead of US4.
- **US3 is the only story that reaches the IDF.** Every other story is arithmetic over a run. This is why `LINK_VERSION` moves nowhere and why US3 carries the idempotence and old-link gates.
- **US6 depends on US1's reader**, not on its rendering: `readCriterionA` is what a sample reads.

### Within Each User Story

- Declarations before readers, readers before the surfaces that letter them.
- The harness task closing each phase is the gate, not an afterthought: constitution gates 1 to 5 are discharged outside the browser before the page is driven.

### Parallel Opportunities

- **Phase 2**: T007, T008 and T009 are three independent declaration groups in `src/tm59.js` and can be written in parallel; T010 is in `src/epw.js` and is independent of all of them. T011 and T012 depend on T005 and T006.
- **Phase 3**: T023 and T024 are both in `src/schemes.js` and touch different declarations.
- **Phases 5 to 8** can be staffed in parallel once Phase 4 is complete, since they touch largely disjoint files — US3 owns `controls.js`, `console.js` and `applyGains`; US4 and US5 own readers in `tm59.js`; US6 owns `scheduler.js` and `study.js`.
- **Phase 9**: T073 and T077 are independent of everything else.

---

## Parallel Example: Phase 2

```bash
# Three declaration groups in src/tm59.js, plus the EPW parser:
Task: "Declare Criterion and CRITERIA with the stage1 and judgeable invariants in src/tm59.js"
Task: "Declare Reading, Verdict and Coverage in src/tm59.js"
Task: "Declare Qualification and QUALIFICATIONS with the four-standing invariant in src/tm59.js"
Task: "Add dailyMeans(epw) to src/epw.js"
```

---

## Implementation Strategy

### MVP (Stories 1 and 2 together)

1. Phase 1: correct the specification, stand up the harness.
2. Phase 2: declarations, running mean, comfort line, the denominator series.
3. Phase 3: criterion a reads and letters.
4. Phase 4: it cannot be mistaken for a certificate.
5. **STOP and VALIDATE**: quickstart §7, §8 and §9. Ship.

### Incremental Delivery

1. MVP above.
2. Add US3 (the prescribed setup) — the readings gain the method's own occupancy.
3. Add US4 (criterion b) — the count row fills, and the line that most often governs is read.
4. Add US5 (criterion c) — the mechanically ventilated route.
5. Add US6 (the study metric) — the criterion becomes designable against.
6. Phase 9 throughout, and gates 6 to 8 before each ship.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- Every figure in this feature is quoted from a primary source. Where a task and `research.md` disagree, `research.md` governs; where `research.md` and the CIBSE documents disagree, the documents govern.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.

---

## Completion note

Implemented by a 16-agent workflow (run `wf_76c8032a-a51`) plus a 3-agent follow-up
(`wf_12cf1a85-414`), then reconciled by hand. 76 of 78 tasks are complete.

**Outstanding, both needing a browser:**

- **T075** — the annual A/B against the WebAssembly engine. The plan's 484 ms / 473 ms
  figures are native Node timings; SC-010 is written against the browser's 0.7 s figure.
- **T076** — quickstart §11, driving the page. This is the only thing that exercises the
  `Pattern` control's fold, its 24 boxes and the tab-order behaviour that
  `.pattern-hours[hidden]` exists for.

**Four tasks were completed differently than written, each deliberately:**

- **T029** named `src/style.css`, which does not exist; the stylesheet is inline in
  `index.html`. It also asked for a 620 px fold on the criterion rows, which would have
  been dead code: `#score` lives inside `.register`, whose own fold is wider (780 px wide
  or 600 px tall) and already covers them. The qualifications block *does* fold at 620,
  because two tracks of prose survive further than a five-column table. Both thresholds
  are now recorded in `.interface-design/system.md`.
- **T034**'s LOCATION-record parser went into `main.js` as `declaredWeather` rather than
  into `epw.js`, beside the other things the sheet reads off the attached file.
- **T043/T044** were expected to be blocked, the Appendix E tables not being in the
  repository. The generator found the reader-supplied CSV and produced all thirteen
  profiles, each carrying the Table E.1 sentence its fractions were divided out of. The
  CSV itself stays out of the repository: `scripts/build-tm59.mjs` reads it from
  `.tm59-cache/`, which is now gitignored beside `.rates-cache/`.
- **T066**'s assertions were folded into `.harness/criteria.mjs` rather than kept separate.

**Three defects were found after the first run, by the consistency sweep and the
verifier, and all three are fixed:** `controls.js` restating a stale five-name room list
while `tm59.data.js` published thirteen (which made `schemes.js` throw at module load and
the page not boot); the `tm59a` study metric being declared in `study.js`, `scheduler.js`
and `model.js` but never wired into `main.js`; and `studyCard` in `console.js` drawing
only the two signed pairs, so a criterion-a curve rendered an empty plot.

All eight harnesses exit 0, discharging quickstart §1 to §9 and constitution gates 1 to 5.

---

## Phase 10: Convergence

Appended by `/speckit-converge`. Each task traces to the artifact clause it closes.
T075 and T076 are still open above and are not repeated here.

- [ ] T079 Assert in `.harness/criteria.mjs` that criterion b's night count responds to glazing ratio, openable area and shading, per SC-003 (missing). §8 currently proves this of criterion a alone — three design responses and the two-climate comfort line — while criterion b is tested only for its nine hours, its opening date, its last night and its denominator. SC-003 names both readings, and the night criterion is the one TM59 says most often governs, so a sweep that cannot move it is the more useful thing to know.
- [ ] T080 Settle whether criteria b and c are selectable as study metrics in `src/study.js` and `src/main.js`, per FR-025 (partial). `METRIC_BY_ID` carries `tm59a` alone. FR-025 says "the criteria" in the plural; US6 and `contracts/scoreboard.md` both describe one curve of the exceedance share. Either widen the declaration to `tm59b` and `tm59c` — b is a night count rather than a share, so `studyCard` needs a third tick and unit the way it just learned the share — or record in the spec why the sweep is criterion a's alone. Do not leave the two documents disagreeing.
- [ ] T081 Resolve the `roomType` gate on the `tm59a` study metric in `src/main.js:6667`, per US6/AC1 and FR-003a (contradicts). `studyMetric` offers criterion a only where `snapshot.roomType !== AS_DRAWN`. US6/AC1 conditions the curve on a year being attached and nothing else, and FR-003a says which criteria are asked is not a setting the desk holds. The gate was a deliberate judgement — that answerable is not the same as wanted, and a free-running insulation sweep should not silently trade its winter low for a summer share — which is a real argument and may well be the right one. It is not in the specification. Either write it in as a requirement with that reasoning, or delete the one condition and let any answerable desk offer the curve.
- [ ] T082 Read the occupied-hour floor off the schedule the applier wrote rather than deriving it from `params.roomType` in `src/model.js:1997`, per FR-024 and Constitution III (partial). `occupiedFloor` is handed a snapshot rather than live parameters, so it cannot disagree with the document today, and `roomType` is a `Selector`, which the console can never hang a Study card on — the trigger is currently unreachable. But the floor is a property of what `applyGains` wrote, and this is the one figure in the feature that is computed from a parameter instead of read back. Either take it off the written `Schedule:Compact`, or record the reachability argument in a comment beside it so a later author who makes room type sweepable finds the reason rather than the bug: the wrong floor counts 3,672 occupied hours where the answer is 1,100.
