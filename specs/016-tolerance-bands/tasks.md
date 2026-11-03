---

description: "Task list for feature 016: tolerance bands"
---

# Tasks: Tolerance bands

**Input**: Design documents from `/specs/016-tolerance-bands/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/tolerance.md](./contracts/tolerance.md), [quickstart.md](./quickstart.md)

**Tests**: This repository has **no test runner and no linter**. The verification tasks below are the constitution's own quality gates, not speculative TDD: throwaway Node harnesses against the DOM-free modules and the staged engine (gates G1 to G5 in [quickstart.md](./quickstart.md)), then the driven page. Gate 4 (codec round trip) does not apply, because no link key is added; T040 asserts that rather than assuming it.

**Organization**: grouped by user story in the spec's priority order: US1 and US2 (P1), US3 and US4 (P2), then US5 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, with no dependency on incomplete work)
- **[Story]**: the user story the task belongs to (US1 to US5)
- Every task names the exact file it touches

## Path Conventions

Single project, sources at the repository root: `src/*.js`, `index.html`, `.interface-design/system.md`, `docs/design-notes.md`.

Harness scripts go in the **scratch directory** (`$SCRATCH` below) and never into the repository. Their recorded results go in `specs/016-tolerance-bands/verify/README.md`.

**The parallelism ceiling**: `src/tolerance.js` and `src/main.js` each carry many tasks, and two tasks in one file are never `[P]`. The real parallel opportunities are between `src/console.js`, `index.html`, `src/tour.js`, `.interface-design/system.md` and the docs.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: bring the page up, read the governing documents, and settle the one measurement the design depends on.

- [ ] T001 [P] Read `.interface-design/system.md` (colour, the E-02 passing-band hatch, the study card) and `docs/design-notes.md` sections "The register", "The solve scheduler" and "Somebody else's published line, cut across the ground" before touching anything, per constitution Gate 8
- [ ] T002 [P] Run `npm install` and `npm run build`. Then run `npm run dev`, chase Passivhaus, open studies on two controls, and confirm cards and the chase line draw. This is the baseline.
- [ ] T003 Write the G1 harness at `$SCRATCH/g1-contents-cost.mjs`:
  - Import `src/model.js` and `src/study.js`, and load the schema with `localBundle()` / `load('26.1.0')`.
  - Build the default desk's IDF twice: once with `syncReporting` handed `contentsFor(QUANTITY_BY_ID.extremes, engaged)`, once with the union of the quantities answering every published standard's targets. Compute that union inline here, since `tolerance.js` does not exist yet.
  - Run each 20 times at design day and annual under `public/energyplus/energyplus.js`, one EnergyPlus per process.
  - Record the medians and grep `eplus.err` for "requested but not generated".
- [ ] T004 Record G1 in `specs/016-tolerance-bands/verify/README.md`: both medians at both run kinds and the ratio. **If the ratio exceeds 1.10 at either kind, stop.** Take research R1's fallback (contents widened only while a standard is chased), amend SC-004 in `specs/016-tolerance-bands/spec.md`, and amend T012 below before continuing.

**Checkpoint**: G1 passed (or the fallback is recorded). The design in R1 stands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the matcher, the band contents, the typed classes, the arithmetic and the load-time invariants. Every user story reads from these.

**⚠️ CRITICAL**: no user-story work begins until T015 passes. The band arithmetic is where this feature can be silently wrong, so it is proved against hand-built curves before anything is drawn.

- [ ] T005 Export `readingForTarget(preset, target)` from `src/survey.js`. It returns the one `Reading` that 012's `matchedTargets` rule pairs with `target` (metric plus `QUALIFIER_BY_METRIC`), and throws naming both declarations when there is none. Refactor `matchedTargets` to share the rule, so there is one matcher, not two.
- [ ] T006 Create `src/tolerance.js` with its module header comment (why it exists, why it is DOM-free, the one-way dependency on `survey.js`). Declare `BAND_QUANTITIES`: the distinct `READING_BY_ID[target.metric].quantity` over every `Target` with `limit != null` of every `PRESETS` entry whose `kind === 'standard'`, frozen.
- [ ] T007 Add `bandQuantities(studyQuantity, engagedChannels)` to `src/tolerance.js`. It returns the study's quantity plus each `BAND_QUANTITIES` entry whose `needs.channels` are all in `engagedChannels`, deduplicated, in declaration order (research R1, channel preconditions).
- [ ] T008 Add the frozen classes `Verdict`, `Edge`, `Band`, `RestoringMove` and `Tolerance` to `src/tolerance.js`, with every validation in [data-model.md](./data-model.md) asserted in the constructors.
- [ ] T009 Add the point classifier to `src/tolerance.js`. It turns a curve point into a `Verdict` (`pass` / `fail` / `refused` / `gap` / `unsolved`) against a list of judged targets, using `readingForTarget(...).valueOf(point.readings)` and `Target.meets`, with failing targets ordered worst ratio first (research R3, R5).
- [ ] T010 Add `bandFor({ key, control, stance, curve, preset, coarse, stale, priced, says })` to `src/tolerance.js`:
  - Decide judged and unjudged targets (research R6, with `says` injected).
  - Decide `inert` before building segments (research R12): declared for a priced key no judged target's quantity lists in `movedBy`; measured as exactly equal readings for every judged target across a complete curve.
  - Classify every position, build the segments, choose the band containing the stance or the nearest one (with `tie`), build the edges as brackets or stops, and compute `share`, `move`, `others` and `incomplete` (research R3, R4).
- [ ] T011 Add `toleranceFor({ preset, bands, climateReason })` to `src/tolerance.js`:
  - `passing`, read off the stance verdicts of current bands.
  - `ranked`, ascending by `share`.
  - On a failing desk, a `RestoringMove` with `lever`, `tied`, `asked` and the per-failing-target `alone` map.
  - Every `absence` sentence (no chase, no study, standard with no line, nothing judged, climate changed), each declared once and checked with `withinBudget(BUDGETS.STANDING, …)` from `src/copy.js`.
- [ ] T012 In `src/main.js` `jobForStudy`, pass `bandQuantities(quantity, engagedChannels(snapshot, patch))` to `sampleContentsFor` in place of `[quantity]`, with a comment recording research R1's finding and G1's measurement. Leave the survey's and the pull's `sampleContentsFor` calls unchanged.
- [ ] T013 Add the four load-time invariants from the contract to the foot of `src/tolerance.js`:
  - Every limited target of every standard has a `readingForTarget`.
  - `BAND_QUANTITIES` covers every such target.
  - The band contents answer each study quantity's contents across the channel sets.
  - `meets(limit) === true && meets(limit + ε) === false` for every limited target.
- [ ] T014 Write the G2 harness at `$SCRATCH/g2-band.mjs`. It imports the real `src/tolerance.js` and feeds `bandFor` and `toleranceFor` hand-built curves for every case listed in quickstart G2 (passing mid-travel, to a stop, pass/fail/pass, failing stance, equidistant tie, refused and gap neighbours, single passing point, two targets failing at one point, unsolved positions, inert declared, inert measured, every position failing), asserting each expected field and the data-model validations.
- [ ] T015 Run G5 at `$SCRATCH/g5-invariants.mjs`: import `src/tolerance.js` under Node, then break each invariant once in a scratch copy of the declarations and confirm each throw names its declaration. Record G2 and G5 in `specs/016-tolerance-bands/verify/README.md`.

**Checkpoint**: bands are computable and proved off hand-built curves, and every study run carries what a band needs.

---

## Phase 3: User Story 1, see how much room each lever has (Priority: P1) 🎯 MVP

**Goal**: with a standard chased and studies open on a passing desk, each study card shows its lever's band, and the block under the chase line ranks the levers by freedom.

**Independent Test**: chase a standard the desk meets and open studies on three levers. Each card shows a band containing the stance, with edges lettered or "to the stop". Setting one lever just past an edge fails the target that edge names on the scoreboard.

- [ ] T016 [P] [US1] In `src/console.js` `setStudy`, draw an optional `study.band` on the card's position axis:
  - hairline brackets at each edge, the passing stretch hatched, and `others` hatched lighter;
  - one line in words, for example "Passes {standard} {lower} to {upper} · closed above by {target}", with positions lettered through the control's own `format` and "to the stop" at a stop;
  - nothing drawn when `study.band` is undefined;
  - no bar when `band.inert` is set, and the inert reason lettered instead (FR-012);
  - no bar when `band.band` is null with judged targets, and "no position of this lever passes every line alone" lettered instead.
- [ ] T017 [P] [US1] Add `.band`, `.band-edge`, `.band-other` and `.band-line` styles to `index.html` beside the study card's, each with its `[hidden]` twin, using only existing tokens (hairline weight, the E-02 hatch vocabulary, no new hue).
- [ ] T018 [US1] In `src/main.js`, add a `bandOf(key, study)` helper. It returns `bandFor(...)` for the chased preset, or `undefined` when nothing is chased, injecting `says = (target) => targetBlock(target).says` and `priced = PRICED_KEYS.has(key)`, `stale` from the card's state and `coarse` from the study. Attach it as `study.band` at every `desk.setStudy` call site (`onStudyUpdate`, `enqueueStudy`'s waiting path, and the re-letter path).
- [ ] T019 [US1] In `src/main.js` `renderChase`, build a `Tolerance` with `toleranceFor` from every entry of `studies` carrying a curve. Below the chase line, letter: the count of levers studied; on a passing desk the levers ranked least free first, each with its share of travel; inert levers listed apart with their reasons, never ranked; the one-line caveat "Each band holds every other lever where it stands."; and the method plus the full one-at-a-time argument in a `fold()`.
- [ ] T020 [US1] In `src/main.js`, letter the two US1 absences in the block: no standard chased (bands need a chased standard, and how to chase one); chased but no study open (turning a study on gives a lever a band). Then make the chase click handler re-call `desk.setStudy` for every open study, so cards gain or lose their band with the chase.
- [ ] T021 [US1] Coalesce `renderChase`'s tolerance block through one `requestAnimationFrame` flag in `src/main.js`, clearing the flag when `document.visibilityState !== 'visible'` so a background tab cannot freeze it (research R11). Call it from `onStudyUpdate` on every `'point'`.
- [ ] T022 [US1] Drive US1 per quickstart "Driven page" steps 1 and 2. Record the result in `specs/016-tolerance-bands/verify/README.md`.

**Checkpoint**: US1 is usable on its own, and it is the MVP.

---

## Phase 4: User Story 2, find the single lever that is breaking a target (Priority: P1)

**Goal**: on a failing desk, the block names the failing lines and the studied lever whose smallest move restores them all, or says plainly that none can and lists, per failing line, the levers that could clear it.

**Independent Test**: chase a standard the desk fails on one line, with several studies open. The block names a lever and a position; setting it there passes every line on the board.

- [ ] T023 [US2] In `src/console.js` `setStudy`, when `band.contains` is false, draw the nearest passing stretch apart from the stance and letter the move, for example "Passes from {position} · move {±span} ({share} % of travel)", with the span through `spanKind` / `spanUnitNow`, and the tie stated when `band.tie`.
- [ ] T024 [US2] In `src/main.js` `renderChase`, on a failing desk letter:
  - the failing targets;
  - `restore.lever` and its `move.to`, marked with `--redline`;
  - `restore.tied` stated when more than one lever shares the smallest share;
  - or, with no lever, the sentence that no studied lever restores every line alone, with "only the studied levers were asked" and, per failing target, the keys in `restore.alone`.
- [ ] T025 [US2] Write the G3 harness at `$SCRATCH/g3-agreement.mjs` over at least ten desks (including a lever at its stop, Fabric bypassed, a heating setpoint swept past cooling, and a failing desk):
  - Build the studies' samples through the real `buildSample` path and compute bands.
  - Re-solve each edge's `inside` and `outside`, and each `move.to`.
  - Read the targets the way the scoreboard does.
  - Assert zero disagreements. Record the result in `specs/016-tolerance-bands/verify/README.md`.
- [ ] T026 [US2] Drive US2 per quickstart step 3, including a desk where no single studied lever suffices.

**Checkpoint**: US1 and US2 together deliver both halves of the request.

---

## Phase 5: User Story 3, trust where an edge is (Priority: P2)

**Goal**: every edge shows the two measured positions it lies between, narrows coarse to fine, and is never lettered as an exact value it did not run.

**Independent Test**: watch a study go coarse to fine. Each bracket narrows and stays inside its coarse bracket, or the sheet states the finer pass found a stretch the coarse pass stepped over.

- [ ] T027 [US3] In `src/console.js` `setStudy`, letter each edge's bracket (last passing and first non-passing position), mark a coarse band as coarse, and letter the `others` stretches separately (FR-007).
- [ ] T028 [US3] In `src/tolerance.js` `bandFor`, accept the previous band for the same key and rest shape, and set a flag when the fine band's edge falls outside the coarse bracket. In `src/console.js`, letter that flag as "the finer pass found a stretch the coarse pass stepped over".
- [ ] T029 [US3] Extend `$SCRATCH/g2-band.mjs` with a coarse (11) then fine (21) curve pair over the same function, asserting nesting and the stepped-over flag. Drive quickstart step 4.

---

## Phase 6: User Story 4, know what the bands are not judging (Priority: P2)

**Goal**: targets the run cannot read are listed as not judged with the scoreboard's own sentence, and bands say they are measured against the rest only.

**Independent Test**: on design days only, chase a standard with annual lines. They are listed as not judged with the board's reason, and no band treats them as passed.

- [ ] T030 [US4] In `src/main.js` `renderChase`, letter `band.unjudged` once for the block (deduplicated across bands, via `sharedAbsence` where it applies). Word the band summary "measured against {n} of {m} lines" whenever any line is unjudged. List limitless lines with the standard's own `target.asks`.
- [ ] T031 [US4] In `src/console.js` `setStudy`, when `band.judged` is empty, draw no bar and letter the shared not-judged reason. When some lines are unjudged, add "of {n} lines" to the card's line.
- [ ] T032 [US4] Drive quickstart step 5 (design days only), and confirm SC-006: no band names a year-needing line as passed.

---

## Phase 7: User Story 5, bands that stay true as the desk moves (Priority: P3)

**Goal**: bands go stale with their studies, re-read for free on a chase switch or a price change, and are withdrawn with a reason when the climate changes.

**Independent Test**: nudge a lever (bands dim, then recover). Switch the chase (bands re-read and the Runs counter stays still). Change station (bands withdrawn with the reason).

- [ ] T033 [US5] In `src/main.js`, make the tolerance block count stale bands (`band.stale`) and say how many, and draw stale cards' bands with the card's existing stale class, adding no state of its own.
- [ ] T034 [US5] In `src/main.js` `attachClimate`, set the transient climate reason ("Bands left with the studies when the climate changed"), declared once with `withinBudget`. Clear it in `onStudyUpdate` on the next landed point.
- [ ] T035 [US5] In `src/main.js`, confirm the priced re-mint path (`redrawStudiesForQuantity({ queue: false })`) re-attaches `study.band` through `bandOf`, and that `studyRun`'s Stop and "Set studies aside" leave a band marked `incomplete`.
- [ ] T036 [US5] Drive quickstart step 6. Record the Runs counter before and after switching the chase between Passivhaus and EnerPHit (SC-004: no change).

---

## Phase 8: Polish and Cross-Cutting Concerns

- [ ] T037 [P] In `src/main.js`, register every band and tolerance-block `aria-label` that letters a figure as a thunk replayed by `reletter()`, as `studySweeps` is. Drive quickstart step 7, and record SC-007 (SI → IP → SI is character for character, and widths read as differences with no `°F` offset).
- [ ] T038 [P] Update `NOTES` in `src/tour.js` for the study and chase steps with the band sentence. Add `tour?.note(...)` where the first band draws in `src/main.js`, and bump `STORE` from `shoebox-general-notes-v7` to `shoebox-general-notes-v8` (Gate 6).
- [ ] T039 [P] Record the bracketed band and the tolerance block as component patterns in `.interface-design/system.md` (Gate 8).
- [ ] T040 Write G4 at `$SCRATCH/g4-no-leak.mjs`:
  - With three studies open, assert `encodeState(...)` and `shapeKey` are byte-identical across chasing every standard and none.
  - Assert `applyModel` applied three times is byte-identical.
  - Record the result in `specs/016-tolerance-bands/verify/README.md`.
- [ ] T041 Drive quickstart step 8 at 390 px wide: every band line, the block, the caveat and the absences are readable with no hover and no sideways scroll.
- [ ] T042 [P] Add a "Tolerance bands (src/tolerance.js)" section to `docs/design-notes.md`: R1's finding that study runs carried one quantity, G1's measured cost, the bracket rule, the share-of-travel ranking, and why bands sit on the cards and the chase line.
- [ ] T043 [P] Add one line for tolerance bands under "Other subsystems" in `CLAUDE.md`, pointing at the design-notes section.
- [ ] T044 Run `npm run build` and confirm the production build succeeds. This is the rehearsal the repository has in place of a type checker.

---

## Dependencies and Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T003 → T004 gates everything after it.
- **Foundational (Phase 2)**: depends on T004. Within it:
  - T005 → T006 → T007 → T008 → T009 → T010 → T011 → T013 → T014 → T015 (one file mostly).
  - T012 needs T007.
- **US1 (Phase 3)**: depends on T015. T016 and T017 are `[P]` with each other and with T018.
- **US2 (Phase 4)**: depends on US1's T018 and T019 (it extends the same card and block).
- **US3 (Phase 5)** and **US4 (Phase 6)**: each depends on US1 only, and they can run in either order.
- **US5 (Phase 7)**: depends on US1.
- **Polish (Phase 8)**: after the stories it covers. T037, T038, T039, T042 and T043 are `[P]`.

### User-story dependencies

- **US1**: none beyond the foundation. This is the MVP.
- **US2**: US1, which supplies the card band and the block it extends.
- **US3, US4, US5**: US1. Independent of each other.

## Parallel Example: User Story 1

```text
After T015:
  T016 [US1] src/console.js  band on the study card
  T017 [US1] index.html      band styles
  T018 [US1] src/main.js     bandOf and the setStudy call sites
Then T019 → T020 → T021 (src/main.js, sequential), then T022.
```

## Parallel Example: Polish

```text
T037 src/main.js reletter thunks   |  T038 src/tour.js notes
T039 .interface-design/system.md   |  T042 docs/design-notes.md  |  T043 CLAUDE.md
```

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1: **G1 decides the design.** Do not skip T003 and T004.
2. Phase 2: foundation proved by G2 and G5.
3. Phase 3: US1. Stop and drive it: a chased standard plus three studies gives three bands and a ranked block.

### Incremental delivery

1. Add US2: the failing-desk half of the request, verified against the scoreboard by G3.
2. Add US3 and US4 in either order: edge honesty and not-judged honesty.
3. Add US5: staleness, the free chase switch, and the climate withdrawal.
4. Polish: units, notes, design system, docs, the no-leak gate, 390 px, build.
