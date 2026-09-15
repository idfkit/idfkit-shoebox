---

description: "Task list for 011-sweep-priced-controls"
---

# Tasks: Sweep the priced controls

**Input**: Design documents from `/specs/011-sweep-priced-controls/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/priced-sweeps.md, quickstart.md

**Tests**: This repository has **no test runner and no linter**. Verification is throwaway
Node harnesses plus driving the page, and the constitution makes several of them
mandatory gates. The harness tasks below are those gates, written after the code they
exercise, except T002 and T003, which record the behaviour of `main` before anything
changes.

Harnesses live in `specs/011-sweep-priced-controls/verify/`, following the precedent of
`specs/006-design-space-survey/verify/` and `specs/007-upgrade-idfkit-js/verify/`.
Where quickstart.md says "the scratchpad", read this directory.

**Organization**: Tasks are grouped by user story so each can be implemented and verified
on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1 to US5)
- Every task names the file it changes

## Path Conventions

Single project. Modules under `src/`, harnesses under
`specs/011-sweep-priced-controls/verify/`. No `tests/` directory is created. No task edits
`src/model.js`: nothing in this feature reaches the IDF.

---

## Phase 1: Setup

**Purpose**: somewhere to verify, and the behaviour of `main` recorded before it moves.

- [X] T001 Create `specs/011-sweep-priced-controls/verify/README.md` stating that the harnesses are throwaway, run by hand from the repository root with `node`, need `npm run predev` for anything touching the engine, and map to the gates in `specs/011-sweep-priced-controls/quickstart.md`
- [X] T002 [P] On `main`, before any edit, confirm or refute research.md R6: run `npm run dev`, attach a weather file, open a survey of `uFactor` by `wwrS` read for cost, set Tariff to Assumed and move the gas price, and record in `specs/011-sweep-priced-controls/verify/README.md` whether any E-02 spot height re-letters (quickstart gate 4 step 4). The outcome decides whether T048 records a Fixed entry
- [X] T003 [P] Write `specs/011-sweep-priced-controls/verify/links-before.mjs`: collect at least 10 permalinks from `main` (the one in issue #78, links with `sty=` and `sv=`, a default desk, a solo'd desk), decode each with `decodeState` from `src/permalink.js`, and write the canonical JSON of each decoded state to `specs/011-sweep-priced-controls/verify/links-before.json` as the baseline for T038

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the reach declaration, the withdrawn sentences, and pricing each curve point at
its own position. Every story depends on these.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] In `src/study.js`, add a `movedBy` constructor option to `Quantity` (default `[]`), stored as a frozen `Set` of strings and validated as strings at construction; declare it on `eui` (`heatEfficiency`, `heatCOP`, `coolCOP`), `cost` (those three plus `elecPrice`, `gasPrice`) and `carbon` (those three plus `gridFactor`), with a comment citing the arithmetic in `computeBill` (`src/bill.js`) and `assume` (`src/rates.js`) per research.md R3
- [X] T005 In `src/study.js`, add load-time assertions beside the existing roster block: every key in any `movedBy` resolves via `controlFor` to a control with finite `min`, `max`, `step` on a `prices: true` channel; every such control on every priced channel is named by at least one quantity; and a quantity with a non-empty `movedBy` has `needs === BILL`. Each throw names the key or quantity (depends on T004)
- [X] T006 [P] In `src/controls.js`, add a `withdrawn` constructor option to `Scale` (default null; a function of params returning a sentence), stored on the instance, and declare it on `heatEfficiency` (the plant is a heat pump), `heatCOP` (the plant is not a heat pump), `elecPrice` and `gasPrice` (the tariff is Published), and `gridFactor` (the grid factor is Published). Each sentence says what brings the face back and fits the `STANDING` budget (15 words) in `src/copy.js`
- [X] T007 In `src/controls.js`, add a load-time assertion: a `Scale` on a `prices: true` channel declares `withdrawn` exactly when it declares `needs`, and every `withdrawn` sentence, evaluated at the desk where its `needs` fails, passes `withinBudget(BUDGETS.STANDING, ...)` from `src/copy.js` (depends on T006)
- [X] T008 [P] In `src/scheduler.js`, add the `priceAt(job, value, sample)` hook to `createStudyScheduler` (default `(job, value, sample) => sample.readings`), document it in the header's list of injected effects as synchronous and deliberately impure (it may read the desk's current priced settings, unlike `refuses`), and make `pointAt` build `reading` and the spread readings from `priceAt(...)` whenever `sample` is non-null, keeping `sample` itself on the point unpriced
- [X] T009 In `src/scheduler.js`, make `curveFor(job)` also return `runs`: the count of distinct `identities(job, value).exact` among positions whose looked-up entry is non-null (depends on T008)
- [X] T010 In `src/main.js`, extract the transform inside `repriceStudies` into `pricedReadings(readings, basis, pricing)` (returns a frozen bag with `eui`, `cost`, `carbon` re-read through `billFromBasis`) and add `pricingAt(job, value)` returning `{ ...params, ...overlay }` where overlay holds each key of `[job.omits].flat()` that is in `PRICED_KEYS`, valued from `deskAt(job, value)`; make `repriceStudies` call `pricedReadings` with `params`, and pass a `priceAt` that returns `pricedReadings(sample.readings, sample.meterBasis, pricingAt(job, value))` when `[job.omits].flat()` holds a key in `PRICED_KEYS`, and `sample.readings` otherwise, to `createStudyScheduler` (depends on T008)
- [X] T011 [P] Write `specs/011-sweep-priced-controls/verify/reach.mjs` (quickstart gate 1): build a meter basis with heating, cooling, lighting and equipment non-zero, price it through `computeBill` from `src/bill.js` with an Assumed card (via `assume` in `src/rates.js`) at each priced face's `min` and `max`, for a gas boiler and a heat pump, and assert that `movedBy` names a key for a quantity exactly when EUI, cost or carbon differs on some desk tried (depends on T005)
- [X] T012 Write `specs/011-sweep-priced-controls/verify/priced-scheduler.mjs` (quickstart gate 2): drive `createStudyScheduler` with a counting fake `runSample`, a `keyOf` that drops priced keys as `deskKey` does, and a `priceAt` that prices through `computeBill`; assert one run for a 21-point `heatEfficiency` job, `curveFor(job).runs === 1`, zero runs on re-enqueue, EUI, cost and carbon at every position equal to the bill for each of the 6 priced faces on three desks (gas boiler, heat pump, Assumed tariff and grid factor) per SC-003, and one run per non-stance position for a `wallR` job on the same desk (depends on T009)

**Checkpoint**: priced positions price correctly in Node; nothing on the page has changed yet.

---

## Phase 3: User Story 1 - Study a plant efficiency (Priority: P1) 🎯 MVP

**Goal**: a Study offer on every Plant and Tariff face that draws a curve from one run,
priced at each position.

**Independent Test**: on a desk with System in, a weather file and a gas boiler, press Study
on seasonal efficiency with carbon chosen; the curve stands with no run beyond the desk's
own, each point equals the bill at that position, and dragging the slider walks the tick.

- [X] T013 [P] [US1] In `src/console.js`, remove the `channel?.prices` early return from `studyOffer`, rewrite its doc comment to say why a priced face is now offered (one run, priced per position), and, for a row whose control is idle and declares `withdrawn`, letter `control.withdrawn(params)` **in view** under the dimmed row in the dashed `--rule-focus` refusal box `.interface-design/system.md` names for refusals, toggled with `hidden` (add a `[hidden]` twin in `index.html` if the class sets `display`) and lettered at full ink rather than inheriting the row's `opacity: 0.4`; `syncStudyOffer` also uses the sentence as the disabled title and `aria-label`, never as its only carrier (Principle VII; thread `control` through from both call sites)
- [X] T014 [US1] In `src/main.js`, extend the scheduler's `refuses` hook: after `sampleRefusal`, for each key of `[job.omits].flat()` in `PRICED_KEYS` whose control is idle at `deskAt(job, value)` and declares `withdrawn`, return `control.withdrawn(deskAt(job, value))`. Keep it pure: read only `job` and `value`
- [X] T015 [US1] In `src/main.js`, confirm that a commit of the swept priced key reaches `reprice()` → `repriceStudies()` → `redrawStudiesForQuantity({ queue: false })`, that the card is not marked stale (its `restShape` is unchanged), and that the re-minted job's positions price the new current value with no run; adjust only if one of the three does not hold, with a comment recording what was measured (research.md R11)
- [X] T016 [US1] In `src/main.js`, reword the drawn line in `onStudyUpdate` ("Study drawn: n ... runs across ...") so it counts positions, and letters the runs from `curveFor(job).runs` beside them where the two differ (FR-027, FR-028)
- [X] T017 [US1] Drive the page (`npm run dev`) through spec US1 acceptance scenarios 1 to 6, watching the run counter in the title block for scenarios 3 and 4; confirm the seasonal efficiency landmarks draw against the priced curve (FR-016); and confirm a station change takes the priced study down, while Set studies aside, Clear studies and Revert all treat it like any study and the head's study count includes it (FR-022, FR-023); record the outcome in `specs/011-sweep-priced-controls/verify/README.md`

**Checkpoint**: issue #78's own question is answered on the sheet.

---

## Phase 4: User Story 2 - Refuse a pairing that cannot move (Priority: P1)

**Goal**: a priced study read for something the control cannot move stands refused with one
sentence and a fix, instead of drawing a flat line.

**Independent Test**: with a seasonal efficiency study open, switch the study reading to
demand; the card stands refused naming what efficiency can move. Switch to cost; the curve
returns with no run.

- [X] T018 [US2] In `src/study.js`, export `refusesPairing(key, quantity)` and `pairingFix(key)` per contracts/priced-sweeps.md: null for a key off a priced channel or one the quantity's `movedBy` names; otherwise a sentence built from `labelFor(key)` and `quantity.label` that fits `BUDGETS.STANDING` for the longest roster label, and a fix naming every quantity whose `movedBy` holds the key ("Choose energy use intensity, cost or carbon."). Throw for an unknown key or an undeclared quantity
- [X] T019 [US2] In `src/study.js`, assert at load that every one of the 66 priced pairings either returns null or a sentence within `BUDGETS.STANDING`, and that exactly 54 return a sentence (depends on T018)
- [X] T020 [US2] In `src/study.js`, give `offersFor` a `key = null` option: after every existing refusal (channel, weather file, whole year, season, meters, pricing), a quantity refused by `refusesPairing(key, quantity)` becomes an unavailable `Offer` with that sentence and `pairingFix(key)` (depends on T018)
- [X] T021 [US2] In `src/main.js`, add a `key = null` parameter to `studyOffers` that it passes to `offersFor`, and pass each study's own key from `enqueueStudy`, `redrawStudiesForQuantity` and `partialStudy`, so a refused pairing takes the existing waiting-card path with its reason and fix (depends on T020)
- [X] T022 [US2] Extend `specs/011-sweep-priced-controls/verify/reach.mjs` to assert 54 refused and 12 drawn across all 66 pairings, and that `offersFor({ key, annual: false })` still gives a demand offer the weather-file reason first rather than the pairing reason (depends on T020)
- [X] T023 [US2] Drive the page through spec US2 scenarios 1 to 3 and quickstart gate 5 steps 2 to 4, and record the outcome in `specs/011-sweep-priced-controls/verify/README.md`

**Checkpoint**: no priced study can draw a tautology.

---

## Phase 5: User Story 3 - Cut the ground between fabric and plant (Priority: P1)

**Goal**: a priced control is an E-02 axis; the ground runs only along its shaping axis and
every spot height is priced at its own position.

**Independent Test**: cut `uFactor` by `heatEfficiency` for carbon; the run counter rises by
the positions on the `uFactor` axis only, every spot height equals the bill at its design,
and standing on a point moves both controls.

- [X] T024 [P] [US3] In `src/survey.js`, remove the priced-channel branch from `refusesAxis` (keep the faceless one) and update its doc comment; in `makeSurvey`/the `Survey` constructor, throw with `refusesPairing`'s sentence when either axis is refused against any reading's quantity (depends on T018)
- [X] T025 [US3] In `src/survey.js`, add `basis` to `SpotHeight` and to `Gap` (opaque, may be null), change `landPoint` to take `{ ix, iy, readings, basis, reason, floorArea, cacheKey }` instead of `sample`, and add `runs` to `Coverage` (distinct `cacheKey` among measured spots) with the assertion `measured === 0 ? runs === 0 : 1 <= runs <= measured` (depends on T024)
- [X] T026 [US3] In `src/main.js`, make `absorbSurveyRow` land each point's priced readings (the point's own spread readings as built by `pointAt`) and `point.sample?.meterBasis`, keeping `cacheKey` and `floorArea` as today (depends on T010, T025)
- [X] T027 [US3] In `src/main.js`, stop `axisOffers` skipping priced channels, and grey a priced face that is idle and declares `withdrawn` with `control.withdrawn(snapshot)` as its reason
- [X] T028 [US3] In `src/main.js`, give `surveyReadingOffers` an `axes = []` parameter that greys any reading refused by `refusesPairing` against either axis (reason plus `pairingFix`), pass the chosen axes from `renderSurveyChoose`, and make `surveyRefusal(sv)` also return a pairing refusal and, against live `params`, a withdrawn-face sentence for a priced axis (depends on T018, T027)
- [X] T029 [P] [US3] In `src/console.js`, remove the `channel?.prices` early return from `surveyOffer` and use `control.withdrawn(params)` as `syncSurveyOffer`'s disabled title and `aria-label` for an idle priced face; the in-view sentence under the row is already lettered by T013, so none is added here
- [X] T030 [US3] In `src/main.js`, reword the survey sentences that count runs: the all-failed line in `renderSurveyFinding` ("all n runs failed" becomes positions), and the coverage line and `surveyAriaLabel` letter `coverage.runs` beside `coverage.measured` where they differ (FR-027); leave the relief caption "positions carry a run" as is (depends on T025)
- [X] T031 [US3] Write `specs/011-sweep-priced-controls/verify/priced-survey.mjs` (quickstart gate 3): with the fake pool from T012, assert 6 runs and `coverageOf(sv).runs === 6` for `uFactor` by `heatEfficiency` at 6 by 6, 1 run for `heatEfficiency` by `gridFactor`, a throw for `heatEfficiency` by `uFactor` read for demand, and every spot height's carbon equal to the bill at its position (depends on T025, T026)
- [X] T032 [US3] Drive the page through spec US3 scenarios 1 to 6, quickstart gate 5 step 5 and gate 7, confirming the traverse adds no stop for a priced-only step and that restoring an earlier stop restores its priced settings (FR-017a), and record the outcome in `specs/011-sweep-priced-controls/verify/README.md`

**Checkpoint**: the fabric-versus-plant ground exists.

---

## Phase 6: User Story 4 - The tariff moves under a priced sweep (Priority: P2)

**Goal**: every priced study and ground re-prices in place, without a run, when any other
priced control moves; a withdrawn face stands refused and returns.

**Independent Test**: with a priced study and a priced ground open, move the gas price; every
figure equals the bill at its position and the run counter does not move.

- [X] T033 [US4] In `src/main.js`, add `repriceSurvey()` and call it from `reprice()` after `repriceStudies()`: re-price every `SpotHeight` and every `Gap` carrying a basis at `pricedReadings(readings, basis, { ...params, ...axisOverlay })`, where the overlay takes each priced axis's key at the point's own position; land a value as a new `SpotHeight` and a null survey reading as a `Gap` whose reason is the `reason` of the `Absent` rate that left the bill line unpriced (keeping the basis, so a later re-price restores it with no run); never construct a `SpotHeight` with a null reading (FR-015); skip points with a null basis; then `renderSurveySoon()` (depends on T026)
- [X] T034 [US4] Extend `specs/011-sweep-priced-controls/verify/priced-survey.mjs` with quickstart gate 3 step 5: re-price a cost ground against a card whose gas rate is `Absent`, and assert every gas-using spot becomes a `Gap` carrying that `Absent.reason`, `coverageOf` stops counting it as measured, and re-pricing with the rate restored brings every one back with zero runs (depends on T033)
- [X] T035 [US4] In `src/main.js`, add a non-destructive withdrawn state for an open ground: when `repriceSurvey` finds `surveyRefusal(survey)` returns a withdrawn-face sentence, show it where `surveyRefused` is lettered in `renderSurvey` without closing the survey or discarding its points, and clear it when the face returns; the descent and standing on a point are refused while it stands (depends on T028, T033)
- [X] T036 [US4] Drive the page through quickstart gate 4 steps 1 to 3 and spec US4 scenarios 1 to 3, compare against the T002 finding, and record the outcome (including a drag of the gas price with the performance panel open, for SC-005) in `specs/011-sweep-priced-controls/verify/README.md`

**Checkpoint**: no priced figure on the sheet stands at a price the desk has left.

---

## Phase 7: User Story 5 - Send someone the plant study (Priority: P2)

**Goal**: priced studies and priced axes ride the link, a survey link naming a refused pairing
is refused whole, and every older link opens unchanged.

**Independent Test**: round-trip a link carrying `sty=cost.heatEfficiency` and a priced `sv`,
and confirm every link in `links-before.json` decodes identically.

- [X] T037 [US5] In `src/permalink.js`, make `decodeSurvey` refuse the whole link with `refusesPairing`'s sentence when either axis is refused against any reading, checked after the axis and reading names resolve so unknown names keep their existing refusal (depends on T018, T024)
- [X] T038 [US5] Write `specs/011-sweep-priced-controls/verify/link-roundtrip.mjs` (quickstart gate 6): assert `sty=cost.heatEfficiency,wallR` and a priced `sv` decode and re-encode identically, `sty=demand.heatEfficiency` decodes, `sv=uFactor*heatEfficiency*tedi*...` is refused with the pairing sentence, and every entry in `links-before.json` decodes to identical canonical JSON (depends on T003, T037)
- [X] T039 [US5] Open `#v1&...&sty=demand.heatEfficiency` on the page and confirm the card stands refused with its sentence via `restoreLinkedStudies`, and open the issue #78 link unchanged; record the outcome in `specs/011-sweep-priced-controls/verify/README.md`

**Checkpoint**: Principle II holds for everything this feature adds.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: the pull's sentence, the notes, and the record.

- [X] T040 [P] In `src/pull.js`, append to `PullReading.said` a clause stating that Plant and Tariff are not ranked (FR-021), and update the `pullProbes` comment beside `if (channel.prices) continue` to cite the clarification rather than "nothing it owns reaches the IDF" alone
- [X] T041 Re-read `NOTES` in `src/tour.js` and confirm no step states or implies that priced controls cannot be studied or surveyed (research.md R12); bump `shoebox-general-notes-v4` only if one does
- [X] T042 [P] In `docs/design-notes.md`, update "Channels that price rather than simulate" and the studies paragraph that says "studies are absent on priced channels" to describe priced positions, `priceAt`, `movedBy`, the pairing refusal, the withdrawn sentences, and the finding from T002
- [X] T043 [P] In `CLAUDE.md`, update the "Priced channels" bullet (sweepable, one run per shape, priced at the point) and the E-02 survey bullet (a priced axis costs no runs; spot heights keep their basis)
- [X] T044 [P] In `specs/006-design-space-survey/spec.md`, add a one-line pointer under FR-004 and FR-007 to FR-007 and FR-026 of `specs/011-sweep-priced-controls/spec.md`
- [X] T045 [P] In `.interface-design/system.md`, record the two patterns this feature adds (constitution workflow gate 8): the withdrawn sentence lettered in view under a dimmed row in the refusal box, at full ink, and a ground on E-02 standing refused with its measured points kept
- [X] T046 Confirm `git diff main -- src/model.js` is empty and that `shapeKey` still excludes every key in `PRICED_KEYS` (Principle VI)
- [X] T047 Check each new pairing and withdrawn sentence at 390 px with a coarse pointer and no hover (Principle VII): every one must stand in view, not only in a `title`. A sentence readable only on hover is a defect to fix in `src/console.js` or `src/main.js` before merging, not a note
- [X] T048 In `CHANGELOG.md` under `[Unreleased]`, add a short **Added** entry for studying and surveying Plant and Tariff controls, and, only if T002 confirmed the gap, a short **Fixed** entry for E-02 re-pricing when the tariff moves
- [X] T049 Run `npm run build`, then quickstart gate 8 (the reader from issue #78) on the preview build, and record the time in `specs/011-sweep-priced-controls/verify/README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T002 and T003 must run on `main` before any source edit.
- **Foundational (Phase 2)**: after Setup; blocks every story.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after Foundational. Independent of US1 in code, but only observable on the page once US1's offer exists (T013).
- **US3 (Phase 5)**: after Foundational and T018 (the pairing refusal, from US2), because `makeSurvey` refuses by it.
- **US4 (Phase 6)**: after US3 (it re-prices spot heights that US3 gives a basis). Its study half is already delivered by T010.
- **US5 (Phase 7)**: after T018 and T024.
- **Polish (Phase 8)**: after the stories it documents.

### Within each story

Declarations before consumers (`study.js`, `controls.js`, `survey.js`), consumers before
`main.js` wiring, wiring before the harness, harness before driving the page.

### Parallel Opportunities

- T002 and T003 (different files, both read-only on `main`).
- T004, T006 and T008 (three different modules).
- T011 alongside T009 and T010.
- T013 (console) alongside T014 to T016 (main).
- T024 (survey) and T029 (console) alongside T027 (main).
- T040, T042, T043, T044 and T045 (five different files).

---

## Parallel Example: Foundational

```bash
Task: "Add movedBy to Quantity and declare it on eui, cost, carbon in src/study.js"        # T004
Task: "Add withdrawn to Scale and declare it on five priced faces in src/controls.js"      # T006
Task: "Add the priceAt hook and price pointAt through it in src/scheduler.js"             # T008
```

## Parallel Example: User Story 3

```bash
Task: "Admit priced axes in refusesAxis and refuse pairings in makeSurvey in src/survey.js" # T024
Task: "Offer Survey on priced faces with withdrawn titles in src/console.js"                # T029
```

---

## Implementation Strategy

### MVP First (User Stories 1 and 2)

1. Phase 1, recording `main`'s behaviour.
2. Phase 2.
3. Phase 3 (US1): the issue as filed.
4. Phase 4 (US2): ship US1 only with it, because US1 alone draws flat curves for the 54
   refused pairings, which is a figure the sheet did not measure.
5. **Stop and validate**: T017 and T023.

### Incremental Delivery

1. MVP (US1 + US2): priced studies.
2. US3: priced surveys.
3. US4: re-pricing grounds, and the E-02 fix if T002 confirmed the gap.
4. US5: the link.
5. Polish.

Per the maintainer's working rule, a follow-up to an open pull request goes in its own
pull request based on that branch, so if the MVP is opened first, US3 to US5 stack on it.

---

## Notes

- [P] tasks touch different files and depend on nothing incomplete.
- No task changes a default, a key or a range, so `LINK_VERSION` stays `v1`.
- Comments explain why, with the measurement or the error that forced the decision.
- Prefer typed objects: `movedBy` is a frozen `Set` on a frozen `Quantity`, `withdrawn` a
  declared field on `Scale`.
