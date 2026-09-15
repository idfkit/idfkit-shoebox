---

description: "Task list for feature 012 — threshold isoline on the survey"
---

# Tasks: Threshold isoline on the survey

**Input**: Design documents from `/specs/012-survey-threshold-isoline/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/thresholds.md](./contracts/thresholds.md),
[quickstart.md](./quickstart.md)

**Tests**: This repository has **no test runner and no linter**. The verification tasks
below are not speculative TDD — they are the constitution's own quality gates
(Development Workflow, gates 1–10): a throwaway Node harness against the DOM-free
modules, then driving the page. Gates 1–3 (model build, idempotence, IDF validation) and
gate 4 (codec round trip) **do not apply** to this feature, and T044 asserts that rather
than assuming it.

**Organization**: grouped by user story, in the spec's **priority** order — US1 (P1),
then US2 and US4 (both P2), then US3 (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on incomplete work
- **[Story]**: which user story the task belongs to (US1, US2, US3, US4)
- Every task names the exact file it touches

## Path Conventions

Single project, sources at the repository root: `src/*.js`, `index.html`,
`.interface-design/system.md`, `docs/design-notes.md`. Harness scripts are written to the
**scratch directory** (`$SCRATCH` below) and never into the repository.

**The parallelism ceiling**: `src/survey.js` and `src/main.js` each carry many tasks, and
two tasks in one file are never `[P]`. Real parallel opportunity is between
`src/relief.js`, `index.html`, `src/tour.js`, `.interface-design/system.md` and
`docs/design-notes.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: bring the page up, and read the two documents that govern this change before
touching anything

- [ ] T001 [P] Read `.interface-design/system.md` — the "Colour", "A surveyed ground: measured, inferred, and not yet visited" and "Measuring against somebody else's number" sections — before any visual work, per constitution workflow gate 8
- [ ] T002 [P] Run `npm install` then `npm run dev`, cut a ground in E-02 for TEDI over two controls, and confirm the ground, contours, relief and ground key all draw — the baseline this feature adds to
- [ ] T003 [P] Create the harness scaffold at `$SCRATCH/thresholds.mjs`, importing the real `src/survey.js`, `src/schemes.js`, `src/study.js` and `src/tm59.js` (never a copy of their rules), with a helper that builds a synthetic lattice `{ values, mask, nx, ny }` for the geometry assertions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the typed objects, the matching rule and the four load-time invariants. Every
user story draws from these.

**⚠️ CRITICAL**: no user story work can begin until T014 passes. The matching rule is where
this feature can be silently wrong (research R-4), so it is proved before anything is drawn.

- [ ] T004 Add `targetsForMetric(metric)` (or equivalent accessor over `PRESETS` filtered to `kind === 'standard'`) to `src/schemes.js`, so `src/survey.js` reads targets through a named export rather than walking the preset list itself
- [ ] T005 Add the `Threshold` class to `src/survey.js` per [data-model.md](./data-model.md#threshold): frozen; holds `preset`, `target` and `reading` by reference; `limit` is a **getter onto `target.limit`** and is never copied; `label`, `asks`, `passes(value)` delegating to `target.meets`, and `figure()` lettering through `reading.figure`
- [ ] T006 Implement the pass-side probe in the `Threshold` constructor in `src/survey.js`: `passesBelow` is read from `target.meets` at `limit ± max(1, |limit|) * 1e-6` (research R-2), and a probe that does not resolve to exactly one side throws naming the target
- [ ] T007 Add the `ThresholdSet` class to `src/survey.js`, whose constructor throws unless exactly one of `lines` / `absence` is set — the "never shows nothing and says nothing" invariant (Principle IV)
- [ ] T008 Add the `PassingGround` class to `src/survey.js`: `threshold`, `cells`, `segments`, `measured`, `wanted`, `wholly`, with `measured + unmeasured === wanted` asserted in the constructor the way `Coverage` asserts its own sum
- [ ] T009 Implement the matching rule in `src/survey.js` per [data-model.md](./data-model.md#the-matching-rule): metric equality, then the qualifier table — `overheat` must carry `above: 25` (the temperature its quantity reads at), `tm59a`/`tm59b` must carry `category === TM59_STUDY_CATEGORY` (Category II), `tm59c` must carry `category === null`
- [ ] T010 Add the four load-time invariant assertions to `src/survey.js` over the whole `READINGS × targets` cross product (kind agreement — comparing `quantityKind` and **never** unit strings; qualifier match; pass side; `needs` implication `annual ⇒ 'year'`, `season ⇒ 'season'`, any ⇒ `'run'`), each throwing and naming the declarations on both sides
- [ ] T011 Implement `thresholdsFor(reading, { chased = null })` in `src/survey.js` returning a `ThresholdSet`, ordered by limit ascending then preset name, pure and uncached (contract: [contracts/thresholds.md](./contracts/thresholds.md))
- [ ] T012 Implement `thresholdAbsence(reading, { chased })` in `src/survey.js` — the three absence sentences from [data-model.md](./data-model.md#thresholdset), including the publisher's own reason (off `target.note`) for a target whose `limit` is null
- [ ] T013 Implement `passingGround(lattice, threshold)` and `thresholdLevels(set)` in `src/survey.js`: cells clipped per cell to the isoline, **nothing emitted for a cell whose mask is not full**, `wholly` set when the line crosses no measured ground, and coincident limits collapsed at `max(1, |limit|) * 1e-9`
- [ ] T014 Verification — extend `$SCRATCH/thresholds.mjs` with harness assertions 1, 2, 4, 5, 8, 9 and 14 from [quickstart.md](./quickstart.md#1-the-declaration-harness-no-engine-no-browser): the module imports without throwing, every reading gives lines **xor** absence, every drawn limit is `===` the `Target.limit` the scoreboard reads (**FR-009, SC-002**), pass sides agree with `Target.meets`, the TM59 lines matched are **Category II** and not Category I, `overheat`'s matched targets all carry `above: 25`, and IP lettering converts by the reading's kind

**Checkpoint**: the declarations are proved correct before a single line is drawn.

---

## Phase 3: User Story 1 — See the pass/fail boundary at a glance (Priority: P1) 🎯 MVP

**Goal**: a distinguished line at the plotted reading's own limit, with the passing ground
picked out as a region, on the plan **and** the relief.

**Independent Test**: sweep two controls against a reading with a published threshold
(e.g. TEDI or a TM59 criterion) and confirm a line at that limit and a visibly separate
shaded region on the passing side, without opening any table of spot heights.

### Implementation for User Story 1

- [ ] T015 [US1] In `drawGround` in `src/main.js`, call `thresholdsFor(sv.readings[0], { chased })` and draw each distinct threshold as `contoursOf(lattice, [limit])`, mapped through the existing `px`/`py` — **`readings[0]` only**, since a second reading's limit is a level on a surface that is not drawn (research R-11)
- [ ] T016 [US1] In `drawGround` in `src/main.js`, fill each `passingGround(lattice, threshold)` with its own hatch, emitted **under** the contours, the spot ticks and the stance so nothing existing is covered (FR-010)
- [ ] T017 [P] [US1] Add the band hatch `<pattern>` definitions and `.ground .passing` to `index.html`, at angles distinct from the improving region's existing 45° and from each other (research R-7), beside the existing `.contour` and `.improving` rules
- [ ] T018 [US1] In `renderGroundKey` in `src/main.js`, add one entry per drawn threshold naming the standard, the criterion in the publisher's own words (`target.asks`) and the pass condition — worded as "meets *this standard's* published threshold", never as a recommendation and never as a combined verdict across standards (FR-011)
- [ ] T019 [US1] In `renderGroundKey` in `src/main.js`, state the `wholly` case: where a threshold crosses no measured ground, say which side the whole ground is on rather than drawing nothing (FR-007)
- [ ] T020 [US1] In `drawRelief` in `src/main.js`, hand `relief.draw` a `thresholds` array of `{ limit, passesBelow, segments }` in lattice coordinates, built from the same `thresholdsFor` call the plan makes
- [ ] T021 [P] [US1] In `src/relief.js`, add a threshold-line buffer and `uMode` branch: the same segments drawn as 3-D lines at `z = limit`, standing a hair proud of the surface for the reason the pin does, beside the existing `strata` and `arrises` draws
- [ ] T022 [P] [US1] In `src/relief.js`, add the passing band as a fragment-shader branch on `vHeight` against the limit, drawn as a **screen-space stipple** rather than a tint, so the relief's band is the same hatch idiom as the plan's (research R-8)
- [ ] T023 [US1] Extend `surveyAriaLabel` in `src/main.js` to state the drawn thresholds, their standards and the pass side, in the same words the key uses — the only route to this drawing for a reader who cannot see it
- [ ] T024 [US1] Verification — harness assertions 10, 11 and 12 from [quickstart.md](./quickstart.md): `passingGround` emits no cell touching an unmeasured corner and its sum holds (**FR-004**), a lattice wholly one side gives `wholly` and empty segments (**FR-007**), and a straddling lattice gives segments identical to `contoursOf(lattice, [limit])` (FR-006)
- [ ] T025 [US1] Drive the page through scenarios A, C, L and O in [quickstart.md](./quickstart.md#3-driving-the-page): three lines and bands on a TEDI ground, the same lines at the same positions on the relief, the band stopping at the measured edge, and the aria label read aloud

**Checkpoint**: US1 is independently deliverable — the boundary is visible on both drawings. This is the MVP.

---

## Phase 4: User Story 2 — Tell the threshold line apart from ordinary contours (Priority: P2)

**Goal**: the pass/fail line reads as a distinct, singular feature, including where it
coincides with a round contour level.

**Independent Test**: with a threshold-bearing reading plotted, confirm the threshold line
is not confusable with an ordinary contour or with the heavier every-fifth one, and that a
threshold landing on a contour level shows one identified line, not a doubled one.

### Implementation for User Story 2

- [ ] T026 [P] [US2] Add `.ground .threshold` and `.ground .threshold-label` to `index.html`: `--ink` weight with a chain-dash (dash-dot) signature, plus a distinct signature per threshold index, and **no hue** — the design system reserves `--redline` for the markup pen and `--cold`/`--warm` for signed physical quantities (research R-6)
- [ ] T027 [US2] In `drawGround` in `src/main.js`, letter each threshold line with its standard(s) and its limit through `reading.figure`, and **push that label into the existing `lettered` collision list before any contour label is placed**, so a threshold label can never print over a spot figure (FR-010)
- [ ] T028 [US2] In `drawGround` in `src/main.js`, suppress the ordinary contour whose level is within `step / 10` of a drawn threshold, where `step` is the interval `levelsFor` chose — applied **at the plan's contour drawing only**, leaving `levels` itself intact so the relief's height axis keeps its full ladder of figures (research R-5)
- [ ] T029 [US2] In `drawGround` in `src/main.js`, collapse coincident thresholds to one line carrying both standards' labels and one band, while the ground key still lists each standard on its own row — live today for TEDI (Passivhaus 15, LETI 15) and `overheat` (Passivhaus 10, EnerPHit 10)
- [ ] T030 [US2] Drive the page through scenarios B and K in [quickstart.md](./quickstart.md#3-driving-the-page): the line reads as distinct from both contour weights, and a threshold on a round level shows exactly one identified line

**Checkpoint**: US1 and US2 both work; the boundary is visible and unmistakable.

---

## Phase 5: User Story 4 — Narrow a busy reading down to the standard being chased (Priority: P2)

**Goal**: chasing a standard reduces the ground to that standard's line and band alone;
stopping the chase brings every applicable line back.

**Independent Test**: plot a reading with more than one applicable standard, confirm
several lines while nothing is chased, chase one and confirm the survey narrows to it.

### Implementation for User Story 4

- [ ] T031 [US4] Thread the module-level `chased` value into `drawGround`, `renderGroundKey`, `drawRelief` and `surveyAriaLabel` in `src/main.js`, all from **one** `thresholdsFor(reading, { chased })` call per draw, so the four surfaces cannot disagree about what is drawn
- [ ] T032 [US4] Add `renderSurveySoon()` to the chase button's click handler in `src/main.js`, beside its existing `renderScore()` / `renderChase()` / `refreshStudies()` calls (FR-015)
- [ ] T033 [US4] In `renderGroundKey` in `src/main.js`, state the chased-standard absence: where the chased standard publishes no limit for the plotted reading, say so plainly rather than falling back to every applicable line (FR-014)
- [ ] T034 [US4] Verification — harness assertions 6, 7 and 13 from [quickstart.md](./quickstart.md): chasing EnerPHit on TEDI returns exactly EnerPHit's line (**SC-005**), chasing Passivhaus on `tm59a` returns no lines and an absence naming Passivhaus, and chasing then unchasing returns the original set with nothing left over (**FR-015**)
- [ ] T035 [US4] Drive the page through scenarios D, E and F in [quickstart.md](./quickstart.md#3-driving-the-page) — and before believing any "it did not update", check `document.visibilityState`: a hidden tab starves `requestAnimationFrame`, `renderSurveySoon`'s frame flag stays set, and E-02 stops re-lettering entirely (research R-10)

**Checkpoint**: US1, US2 and US4 all work independently.

---

## Phase 6: User Story 3 — Know when no threshold applies (Priority: P3)

**Goal**: a reading with no published limit says so, in place, rather than showing a blank
ground the reader cannot tell from a bug.

**Independent Test**: plot a reading with no declared threshold and confirm the survey
states that it carries none, in the same place a threshold would otherwise be described.

### Implementation for User Story 3

- [ ] T036 [US3] In `renderGroundKey` in `src/main.js`, draw the absence entry — no swatch, the sentence from `thresholdAbsence` — for the six readings that carry no line today (`high`, `low`, `cost`, `carbon`, and `cedi`/`peakCool` whose targets declare `limit: null`), and never inside a fold: absence reasons are one of the four things the copy convention keeps out of folds
- [ ] T037 [US3] Carry the same absence sentence into the plan caption (`#survey-plan-cap`) and `surveyAriaLabel` in `src/main.js`, in one wording rather than three
- [ ] T038 [US3] Confirm in `src/main.js` that the absence entry is visually and verbally distinct from the improving-region entry — improving on the current design and passing a published limit are different judgements and must not be conflated (spec edge case, FR-011)
- [ ] T039 [US3] Drive the page through scenarios G, H and I in [quickstart.md](./quickstart.md#3-driving-the-page): zone high states that no standard publishes a limit, CEDI states the publisher's own per-building-and-climate reason, and the improving hatch and passing band read as two distinct things

**Checkpoint**: all four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: the constitution's remaining gates, and the documents that are part of done

- [ ] T040 [P] Update the E-02 note's `body` in `src/tour.js` — the step now teaches that the ground separates passing from failing — and bump `STORE` from `shoebox-general-notes-v4` to `shoebox-general-notes-v5` (constitution workflow gate 6)
- [ ] T041 [P] Record the new pattern in `.interface-design/system.md` under "A surveyed ground: measured, inferred, and not yet visited": the threshold line's chain-dash signature, the per-standard band hatch angles, and why no hue is spent (constitution workflow gate 8)
- [ ] T042 [P] Add the findings to `docs/design-notes.md` under the E-02 section — the coincident-limit case, the TM59 category trap, the contour/triangulation disagreement on the relief, and the pass-side probe — not to `CLAUDE.md`, which is the short form
- [ ] T043 [P] Add the one-line summary of the feature to `CLAUDE.md`'s E-02 bullet, citing the notes section rather than restating it
- [ ] T044 The no-model check from [quickstart.md](./quickstart.md#2-the-no-model-check): confirm `src/permalink.js`, `src/model.js` and `src/controls.js` are unchanged, `LINK_VERSION` is unchanged with no new `DEFAULTS_BY_VERSION` entry and no `MIGRATIONS` step, and `src/survey.js` gained no `Output:*` or IDF reference — the evidence that gates 1–4 genuinely do not apply
- [ ] T045 Confirm the feature costs **zero** engine runs: with a ground cut, chase and unchase a standard and switch units, and watch `#s-runs` on the sheet stay put (Principle VI)
- [ ] T046 Measure the copy budgets at four desk positions with `$SCRATCH/budgets.mjs` importing `src/copy.js`: the threshold key entries, the absence sentence and the `wholly` sentence against `STANDING` (15 words), `ABSENCE` (12) and `CEILING` (40)
- [ ] T047 Drive scenario M in [quickstart.md](./quickstart.md#3-driving-the-page): switch SI → IP → SI and confirm every threshold figure re-letters on the line label, in the key and in the aria label, and that the SI sheet comes back character for character
- [ ] T048 Drive scenario N at **390 px**: every threshold, its band and the absence sentence readable without opening, scrolling sideways or hovering (Principle VII)
- [ ] T049 Drive scenario J in [quickstart.md](./quickstart.md#3-driving-the-page): change the plotted reading and confirm the line and band follow it or disappear with a stated reason, with nothing stale from the previous reading (FR-008)
- [ ] T050 Run the full [quickstart.md](./quickstart.md) "Done when" list and tick every box

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story**
- **User Stories (Phases 3–6)**: all depend on T014 passing
  - US1 (P1) is the MVP and is drawn first
  - US2 and US4 (both P2) each build on US1's drawing but are independently testable
  - US3 (P3) is nearly free once Phase 2 is done, because `ThresholdSet`'s lines-xor-absence invariant already computes the sentence
- **Polish (Phase 7)**: depends on the stories being delivered

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on another story
- **US2 (P2)**: after Phase 2. Sharpens the line US1 draws — testable on its own once US1's line exists
- **US4 (P2)**: after Phase 2. Independent of US2 entirely; it changes *which* lines are drawn, not how they look
- **US3 (P3)**: after Phase 2. Fully independent — it is the branch where no line is drawn at all

### Within Each Story

- The declarations (Phase 2) before anything drawn
- Plan before relief, because the plan carries every reading and the relief may refuse to draw
- The key and the aria label alongside the drawing they describe, never after — a mark with nothing saying what it is was a defect this drawing has already been fixed for

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 all `[P]`
- **Phase 2**: only T004 is in a different file; T005–T014 are one file in sequence
- **Phase 3**: T017 (`index.html`), T021 and T022 (`src/relief.js`) run alongside the `src/main.js` work
- **Phase 4**: T026 (`index.html`) runs alongside T027–T029
- **Phase 7**: T040 (`src/tour.js`), T041 (`.interface-design/system.md`), T042 (`docs/design-notes.md`) and T043 (`CLAUDE.md`) are four files, all `[P]`

---

## Parallel Example: User Story 1

```bash
# Once T016 has settled the band's shape, three files move at once:
Task: "T017 Add band hatch patterns and .ground .passing to index.html"
Task: "T021 Add the threshold-line buffer and uMode branch to src/relief.js"
Task: "T022 Add the passing-band stipple to the fragment shader in src/relief.js"
```

```bash
# And in Phase 7, four documents at once:
Task: "T040 Update the E-02 note and bump STORE in src/tour.js"
Task: "T041 Record the pattern in .interface-design/system.md"
Task: "T042 Add the findings to docs/design-notes.md"
Task: "T043 Add the one-line summary to CLAUDE.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — Setup (T001–T003)
2. Phase 2 — Foundational (T004–T014). **Do not skip T014**: the matching rule is the one
   place this feature can be wrong invisibly, because TM59's two categories carry the same
   limit and a Category I line drawn across a Category II ground looks perfectly correct
3. Phase 3 — US1 (T015–T025)
4. **STOP and validate**: scenarios A, C, L, O. The reader can now see which pairs of
   settings pass, which is the whole of the request

### Incremental Delivery

- MVP → US2 (the line becomes unmistakable) → US4 (the busy ground declutters) → US3
  (the honest blank) → Polish
- Each phase leaves the sheet in a shippable state; none of them leaves a mark on the
  drawing with nothing saying what it is

### What would make this go wrong

- **Copying a limit into a second number.** The whole of FR-009 is that `Threshold` holds
  the `Target` by reference. A `limit: 15` written anywhere in `src/survey.js` is the bug
- **Matching on `metric` alone.** Draws TM59's Category I criterion across a Category II
  ground, invisibly. T009 and T010 exist for this
- **Believing a stale figure read from a background tab.** Three have been chased that way
  already; check `document.visibilityState` first
