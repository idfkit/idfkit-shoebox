---

description: "Task list for TM59 Category I as a reading"
---

# Tasks: TM59 Category I as a reading

**Input**: Design documents from `/specs/013-tm59-category-i/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/readings.md](./contracts/readings.md), [quickstart.md](./quickstart.md)

**Tests**: This repository has **no test runner and no linter** (constitution, *Development Workflow and Quality Gates*). Verification is throwaway Node harnesses under the session scratch directory against the DOM-free modules, then the page driven. The harness tasks below are therefore not optional TDD tasks — they are the project's own quality gates, and each is named as the gate it satisfies.

**Organization**: Tasks are grouped by user story. Because every chooser on this sheet is generated from one roster, two of the stories are delivered by the same declarations; where that is true it is said plainly in the phase rather than papered over with invented separation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names the file it changes

## Path Conventions

Single project. Source at `src/*.js`, documentation at `docs/` and `CLAUDE.md`. Harnesses are throwaway and live in the session scratch directory, never in the repository.

---

## Phase 1: Setup

**Purpose**: The staging a fresh clone needs, and the one harness every later phase imports.

- [X] T001 Run `npm install` then `npm run dev` once, so `predev` stages the engine assets, schemas and the station index into the gitignored directories under `public/` — the page does not load without it
- [X] T002 Write a scratch harness module that imports `src/study.js`, `src/survey.js`, `src/schemes.js`, `src/tm59.js` and `src/permalink.js` and prints the roster (ids, labels, criterion, category) — it is the "does it still mount" check every later task runs first, and it works only because those five modules are DOM-free
- [X] T003 Capture the baseline for the byte-identical check (SC-005): with the tree unchanged, write the IDF at four console positions, the board's five TM59 rows, `clearedCount`'s count and scope sentence, and every reading's value, to files in the scratch directory for T028 to diff against

**Checkpoint**: the page mounts, the harness prints thirteen readings, and the before-state is on disk.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `Quantity` learns which criterion and which category a reading answers. Nothing else can be declared, asserted or matched until it does.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `criterion` and `category` to the `Quantity` constructor in `src/study.js`, defaulting to `null`, frozen with the rest of the instance, with the five constructor throws in [contracts/readings.md](./contracts/readings.md#srcstudyjs) — each naming the quantity, and each refusing a bare `'I'` the way `Target` already refuses one (`src/schemes.js:221`)
- [X] T005 In the same constructor in `src/study.js`, assert the per-declaration half of I1: `category` is non-null if and only if `criterion.byCategory` is true, and a `category` with no `criterion` is refused outright
- [X] T006 Declare `criterion` and `category` on the three existing TM59 quantities in `src/study.js` — `tm59a` and `tm59b` at `CATEGORY_BY_ID.II`, `tm59c` at `null` — and build their labels from those declarations instead of from `TM59_STUDY_CATEGORY`. Their ids, values, units, precisions and lettering do not change
- [X] T007 Remove the `TM59_STUDY_CATEGORY` export from `src/study.js`, moving the half of its comment that is still true (two exceedance shares are not a signed pair and must not spend `--warm`/`--cold`) to where it still applies — the drawing of one reading at a time — and recording that the other half was a scope decision rather than a finding
- [X] T008 Add the roster-wide half of invariant I1 at load in `src/study.js`: for every criterion the roster answers at all, one quantity per declared `Category` where `byCategory` is true, exactly one carrying `category: null` where it is false. The message names the criterion, what the roster carries, and what the method states. Criterion d is answered by nobody and is not required to be
- [X] T009 Add `this.category = quantity.category` to `Reading` in `src/survey.js`, taken off the quantity and never re-declared, beside the existing `quantityKind` and `digits` — and drop the now-unused `TM59_STUDY_CATEGORY` import
- [X] T010 Run the harness from T002: the tree still mounts, T008 throws with the roster as it stands today (criterion a and b are declared at one category each), and the message says which declaration to add. **This throw is the defect the feature fixes, caught by its own invariant** — it is expected here and is what T011 clears

**Checkpoint**: `Quantity` carries the method's own vocabulary, and the roster now fails loudly for the exact reason this feature exists.

---

## Phase 3: User Story 1 — Survey the design space against the stricter category (Priority: P1) 🎯 MVP

**Goal**: A reader can cut a design space survey for the stricter category's criteria, with every spot height, contour and figure computed against that category's own comfort line.

**Independent Test**: Cut a survey for `tm59aI` and confirm the ground differs from the same ground cut for `tm59a` wherever hours fall between the two lines — a copy is a failure, not a pass.

- [X] T011 [US1] Declare `tm59aI` and `tm59bI` in `QUANTITIES` in `src/study.js`, beside the pair they answer with, per the table in [data-model.md](./data-model.md#roster-entries-added-quantities-srcstudyjs): labels `Criterion a · Category I` and `Criterion b · Category I`, `criterion` and `category` off `CRITERION_BY_ID` / `CATEGORY_BY_ID`, `unit`, `quantityKind` and `digits` off the same `CRITERION_BY_ID` entries their Category II pair uses, and the `TM59_AB` / `TM59_B` `RunContents` instances **reused by reference** so `contentsFor` returns what it returned before
- [X] T012 [US1] Move the counted priced-pairing assertion in `src/study.js:796` to `pairings !== 78 || refusedPairings !== 66`, and update the sentence above it that explains the arithmetic — six sweepable priced faces × thirteen quantities, twelve drawing, the twelve new pairings all refused because neither new quantity declares `movedBy`
- [X] T013 [US1] Add `tm59aI` and `tm59bI` to `SENSE` in `src/survey.js`, each `better: 'lower'` with a `why` citing the published limit the criterion clears at — without them `Reading.better` is null, `improves` throws, and the pull refuses the reading outright (`src/pull.js:377-386`)
- [X] T014 [US1] Update the roster-count prose in `src/survey.js` that the new entries falsify: the uniqueness note at `src/survey.js:292-294` ("Thirteen series across eleven quantities") and the `SENSE` lede at `src/survey.js:121`, recounted against the roster as it stands rather than adjusted by two
- [X] T015 [US1] Run the harness: fifteen readings, ids unique, every `SENSE` key naming a declared series, I1 satisfied, and the load-time `READINGS × targets` cross product at `src/survey.js:2338-2355` still passing
- [X] T016 [US1] Drive the page (quickstart step 7.1–7.3): attach a weather file, patch Gains in, run some of May to September, cut a survey for `tm59aI`, and confirm the ground is computed at Category I — compared against the same ground at `tm59a`, it must differ wherever hours fall between the two lines

**Checkpoint**: the stricter category can be surveyed, and — because every chooser reads the same roster — it is simultaneously offered on the study card and in the pull. US3 exists to prove that rather than to build it.

---

## Phase 4: User Story 2 — Draw the stricter category's own published line, never the other's (Priority: P1)

**Goal**: A survey cut for one category is crossed only by that category's own published limit, and a wrong-category line is refused at load rather than drawn.

**Independent Test**: Cut a survey for each category's version of a criterion and confirm the named line is the target belonging to that same category — and that breaking the declaration on purpose throws instead of drawing.

**Why this is a phase of its own, despite sharing files with US1**: this is the one place the feature can be silently wrong. Both categories publish the same limit, so a line taken from the wrong one sits at exactly the right height and looks correct while citing a criterion the ground does not answer.

- [X] T017 [P] [US2] Re-point the two Category I targets in `src/schemes.js` — `tm59-a-I` to `metric: 'tm59aI'`, `tm59-b-I` to `metric: 'tm59bI'` — leaving `limit`, `unit`, `quantityKind`, `needs`, `category`, `asks` and `note` untouched on all five TM59 targets
- [X] T018 [P] [US2] Replace the hand-kept `TM59_CRITERION` table at `src/main.js:5173` with a derivation off the roster, `QUANTITY_BY_ID[target.metric]?.criterion ?? null`, and point `carriesTm59`, `tm59Reading` and `targetReading` at it. The table's own comment rejects slicing the letter out of a metric name because it "happens to work"; a hand-kept copy of the same fact is the other way to be wrong about it. (If review prefers the table, the fallback is two added rows and no other change — see [data-model.md](./data-model.md#target-srcschemesjs--two-declarations-move))
- [X] T019 [US2] Add invariant I2 at load in `src/schemes.js`: for every `Target` whose `metric` names a declared quantity, `target.category` is that quantity's category instance, or `null` where the quantity declares none. The message names the target, the quantity and both categories, so it says which declaration to edit (depends on T017)
- [X] T020 [US2] Make `Qualifier.reads` and `Qualifier.says` functions of the reading in `src/survey.js`, and collapse `QUALIFIER_BY_METRIC`'s four category-bearing entries onto **one** shared declaration reading `reading.category`, so a fifth cannot be registered at the wrong category by copying a line. Update the one comparison at `src/survey.js:2108` to `=== qualifier.reads(reading)`
- [X] T021 [US2] Add invariant I3 at load in `src/survey.js`: a reading carries a category exactly when `QUALIFIER_BY_METRIC[reading.id]` exists and matches on the `category` field. The message names the reading and which half is missing (depends on T020)
- [X] T022 [US2] Harness the whole cross product (quickstart step 2, answering SC-003): over every standard's targets × all fifteen readings, assert every TM59 target is matched by exactly one reading, that the matching reading declares the target's own category, that no cross-category pairing exists in either direction, and that `thresholdsFor` gives lines or a stated absence for every reading — never both and never neither
- [X] T023 [US2] Harness the invariants by breaking each declaration on purpose in a scratch copy (quickstart step 1) — delete `tm59aI`; declare a `tm59cI`; leave `tm59-a-I` filed under `tm59a`; drop `tm59aI` from the qualifier table; declare `category: 'I'` as a string — and confirm each throws at import with a message naming both declarations rather than saying something is wrong
- [X] T024 [US2] Drive the page (quickstart steps 7.4–7.5): the Category I line is drawn and named on both the plan and the relief for a `tm59aI` ground, no Category II line appears on it, and chasing TM59 narrows the ground to the chased standard's line for the plotted category

**Checkpoint**: a published line can no longer be drawn from the wrong category, and the page refuses to mount if a declaration says it should be.

---

## Phase 5: User Story 3 — Sweep one control against the stricter category (Priority: P2)

**Goal**: The stricter category is offered as a study metric on the same terms as every other reading, refused with the same sentence and fix where a run cannot answer it.

**Independent Test**: Sweep any sweepable control at `tm59aI` and confirm the curve, its end figures and its card lettering are computed and named at Category I.

**Note**: T011 delivered the declarations this story needs. These tasks verify that the roster really was the right place for the category — if any of them turns into chooser code, the design was wrong and the plan should be revisited.

- [X] T025 [US3] Confirm no edit is required to `offersFor` (`src/study.js:633`), `surveyReadingOffers` (`src/main.js:9051`) or `buildControl`'s study card in `src/console.js` — and if one is, stop and record why the category did not ride the reading after all
- [X] T026 [US3] Harness `offersFor` across desks that can and cannot answer TM59 (no weather file, Gains patched out, a run that never reaches May to September) and confirm the two new readings come back with the **same** reason and the same fix as their Category II pair, per FR-010 and quickstart step 8
- [X] T027 [US3] Drive the page (quickstart step 7.2–7.3): fifteen readings in the study metric chooser, each TM59 entry naming its category, and a sweep at `tm59aI` whose curve differs from the same sweep at `tm59a`

**Checkpoint**: one control can be swept against the stricter category, and no chooser was edited to make it so.

---

## Phase 6: User Story 4 — Know which category a reading is, and what it presumes (Priority: P2)

**Goal**: Every place a TM59 reading is named states its category, and what that category presumes about its occupants is available in place — never on hover.

**Independent Test**: With each category selected in turn, confirm the category is named wherever the reading is named, and that its presumption is reachable in place on the sheet.

- [X] T028 [US4] Diff against the T003 baseline (SC-005): the IDF at all four positions is byte-identical, the board's five rows letter identical figures under identical labels, `clearedCount` returns the same count and the same scope sentence, and every non-TM59 reading is unchanged. Any diff at all, whitespace included, is a defect rather than a tolerance
- [X] T029 [US4] State what the plotted category presumes, in place beside the chosen reading on the survey and the study card, through the existing `fold()` (`src/console.js`) with its summary inside the 6-word `SUMMARY` budget and the presumption itself off `Category.presumes` — never a second transcription of it, and never on hover (FR-005, Principle VII)
- [X] T030 [US4] Assert the new always-visible strings against `src/copy.js` budgets at load where they are declared, the way the surrounding declarations already do, and confirm no reading, verdict, absence reason or refusal was moved into the fold by the change (Conventions: those never fold)
- [X] T031 [US4] Check the `aria-label` path: any label lettering a value for the new readings must be replayed from `reletter()` through `console.js`'s `studySweeps` thunks, or it stands in the unit system it was built in for the life of the session
- [X] T032 [US4] Run the units harness over both systems (quickstart step 6): `format(v).endsWith(unitNow)` holds for both new readings in SI and IP, the survey's trade sentence letters a *change* through `Reading.change` rather than `Reading.format`, and neither `chooserDrawn` nor `noteCache` serves a string lettered in a system the reader has left
- [X] T033 [US4] Drive the page at 390 px (quickstart step 7.6): every new chooser row readable and selectable, the presumption reachable in place, nothing on hover, no sideways scroll. Force a paint before believing any E-02 figure read from a tab that is not visible

**Checkpoint**: no TM59 figure on the sheet is nameless about its category, and nothing the sheet already lettered has moved.

---

## Phase 7: User Story 5 — Share and restore a reading at either category (Priority: P3)

**Goal**: A link carries which reading at which category, restores exactly that, and every link shared before this change goes on meaning what it meant.

**Independent Test**: Round-trip each new id through `sty` and `sv`, and open a link captured from the current deployment before the change.

- [X] T034 [US5] Harness the codec both ways (quickstart step 3): `sty=tm59aI.wwrS` and `sv=wwrS*wallR*tm59aI` encode and decode exactly and re-serialise to canonical text; a two-reading survey carrying both categories (`sv=wwrS*wallR*tm59a.tm59aI`) round-trips; and `sty=tm59aX` is refused whole, by name
- [X] T035 [US5] Confirm `LINK_VERSION` is unchanged, `DEFAULTS_BY_VERSION` has no new entry and `MIGRATIONS` has no new step in `src/permalink.js` — a reading id is a link **value**, not a key (research §3). If any of the three moved, the id choice was wrong and research §3 should be re-read before going further
- [X] T036 [US5] Open a link captured from the current deployment before this change and confirm it restores the reading it named — Category II — neither refused nor silently reinterpreted (FR-012, SC-006)

**Checkpoint**: both categories are shareable and nothing shared before this is broken by it.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T037 Take the measurement the plan owes (quickstart step 5, Principle VI): time `readPoint` over a landed annual sample that answers TM59, median of 200, before and after; then cut a survey for `tm59a`, note `Coverage.runs`, switch the same ground to `tm59aI` and confirm the run count does not rise (FR-015, SC-004). Record the figure in the design note rather than in a commit message
- [X] T038 [P] Update the TM59 and E-02 sections of `docs/design-notes.md`: why one category became two, why `tm59a` kept its id, the three invariants and what each refuses, and the measured per-sample cost from T037. Record that the pen argument survives — it was a reason not to draw both at once, never a reason not to offer the choice
- [X] T039 [P] Update `CLAUDE.md`: the TM59 line under *Channel specifics* and the E-02 line under *Other subsystems*, to say the roster carries each by-category criterion at both categories and that a target is matched on criterion **and** category
- [X] T040 Re-read the diff adversarially against the constitution's compliance review: nothing reaching the IDF escaped `params`, no run-time dependency added, no reading lettered from a variable the document could answer, no failure path substituting a value instead of refusing, and no new reading unreachable at 390 px or existing only on hover
- [X] T041 Confirm gate 6 still does not apply: neither the `tm59` nor the `survey` note in `src/tour.js` teaches anything this change made untrue, so `NOTES` is unchanged and `shoebox-general-notes-v5` is **not** bumped. If the fold added in T029 changed what the survey step teaches, update `NOTES`, the call sites and the storage key to `v6` in the same change
- [X] T042 Run the whole of [quickstart.md](./quickstart.md) end to end on the built page, not the dev server, and confirm every step passes

---

## What the previous session could not run, and what this session found

The five tasks above — T016, T024, T027, T033 and T042 — were left open by the session
that wrote the rest of this document, because its environment's egress policy refused
`climate.onebuilding.org`: no EPW could be fetched, so no seasonal run existed to drive
the page against. That was environment-specific to that session, not a property of the
change. This session's environment reached `climate.onebuilding.org` directly (plain
`curl` returns `200`) and through the sheet's own `/onebuilding` proxy in both `vite dev`
and `vite preview`, so the blocker no longer applied, and all five were driven for real —
a real EPW, a real EnergyPlus-WASM run, a real drawn ground and a real swept curve — on
both the dev server and, for T042, the built page served by `vite preview`. Nothing here
substitutes for a run; every figure below came off one.

**T016 — the ground differs.** Boston-Logan Intl AP, MA (725090), TMYx, fetched over
`/onebuilding` (`GET …USA_MA_Boston-Logan.Intl.AP.725090_TMYx.zip` → `200`); Gains patched
in and named Home office; the annual 8,760-hour run solved locally in ~1.2–1.4 s. A survey
cut over the south wall's window-to-wall ratio × wall resistance (12 × 12, 144 positions)
at `tm59aI`, chasing TM59, hatches **23** measured designs as improving toward the desk's
stance; the identical axes and desk at `tm59a` hatch **9**. The two grounds are not the
same ground.

**T024 — the right line, never the wrong one.** `#survey-key`'s list carried exactly one
TM59 entry throughout: "TM59, overheating in dwellings · Criterion a · Category I: passes
at or below 3.0 % of occupied hours" on the `tm59aI` ground, and "… Category II: passes at
or below 3.0 %…" on the `tm59a` ground — never both, and never the other one's, across
three separate axis pairings (window-to-wall ratio × wall resistance; ventilation ACH ×
window-to-wall ratio, with Air patched in). Un-chasing TM59 left the same single line in
place, which is correct rather than inert: TM59 is the only preset that publishes a target
for this criterion, so `scopedTargets` has nothing else to narrow away. Within the control
ranges actually reachable on this desk, the measured share of occupied hours never fell to
the published ≤ 3 % limit at either category, so the line names itself in the key
("The line crosses no measured ground: no design here meets it.") without a chain-dash
segment to rule across these particular axes — the exact state the spec's own edge case
anticipates for the stricter line, decided by the same `drawGround`/`bands.forEach` path
T022's load-time cross product already proved matches criterion to category correctly, and
untouched by this feature. The isoline's geometry was not seen crossing a ground in this
session; its naming, its category-exclusivity and its absence-when-uncrossed were, on the
plan and the relief alike (they read one shared `lines` object).

**T027 — the sweep differs, and costs nothing extra.** Chasing TM59 opens a study directly
at Category II (`tm59a`), skipping the desk's usual `extremes` default. A 21-run annual
sweep of the north wall's window-to-wall ratio read **15.7 % → 51.7 %** of occupied hours
at Category II; switching the same card to Category I, after that sweep had fully landed,
read **27.0 % → 57.8 %**, differing at every sampled position but one (both saturate to the
same figure at the ratio's top stop, an instance of the spec's "no hour falls between the
two lines" case) — and produced no new "Study drawn" status line, i.e. zero additional
engine runs, confirming FR-015/SC-004's cache reuse live rather than by cost model. The
study card's own quantity chooser lists **13** entries (`QUANTITIES`, one per declared
quantity — `extremes` and `demand` each plot two series under one entry); E-02's Reading
chooser lists the **15** flattened readings quickstart's step 7.2 counts. Both list the
four by-category TM59 entries naming their category, and both refuse the two new entries
with the same sentence and fix as their Category II pair before a run can answer them.

**T033 — 390 px.** `document.documentElement.scrollWidth − clientWidth` read **0** with
the study card's quantity chooser open and again with E-02's Reading chooser open; all 15
reading rows measured a consistent, unclipped geometry. The category's presumption
(`Category.presumes`, via `categoriesSaid`) is lettered in `#survey-lede`, which is
always-visible markup, not a fold and not a hover target — confirmed by reading its text
directly ("Category I is read for a thermally sensitive dwelling.") rather than by
inspecting CSS. Every check ran in a foreground tab (`document.visibilityState ===
'visible'`) for exactly the reason CLAUDE.md's rAF warning gives.

**Section 8 — the absence, word for word.** With weather attached and Gains still
bypassed, `tm59a` and `tm59aI` both read "patch Gains in — this run carries no hourly
Occupancy schedule series", differing only in the category name and presumption ahead of
it. With no weather file attached at all, `tm59b` and `tm59bI` both read "attach a weather
file — two design days are not a season". Neither pair ever reads a zero.

**T042 — the same page, built.** `npm run build` (`prebuild` staged engine assets, schemas
and the station index; `vite build` finished in ~2.2 s, one chunk-size advisory, no
errors) and `npm run preview -- --port 4173` served `dist/` with the same `/onebuilding`
proxy `vite.config.js` gives the dev server. Every figure above for T016, T024, T027, T033
and section 8 was re-driven against `http://127.0.0.1:4173/` in a fresh Chromium session
(so nothing carried over from the dev-server run) and came back identical: the same
23 / 9 hatch counts, the same 15.7 %→51.7 % / 27.0 %→57.8 % curve endpoints, the same
absence sentences, the same 0 px overflow. Quickstart's sections 1–6 are DOM-free Node
harnesses that import `src/*.js` directly and never touch a served page, so "built vs.
dev" does not apply to them; they were re-run once, consolidated: 15 unique reading ids;
the full target × reading cross product (12 threshold lines, all 5 by-category TM59
targets each matched by exactly one reading at its own category, `thresholdsFor` giving
lines xor a stated absence for all 15 readings); and the permalink round trip (`tm59aI`
and legacy `tm59a` both restore through `sv=`, `sv=wwrS*wallR*tm59a.tm59aI` round-trips
carrying both categories, `sty=tm59aX` refused by name). All passed.

FR-005's one partial requirement, noted by the previous session, stands as it left it:
what a category presumes is lettered in place on the register board and in the survey's
lede, and is not on the study card, whose only mention of a category is in its own label
and its chooser rows. That is unchanged by this session and was not asked to be.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every story**
- **US1 (Phase 3)**: depends on Foundational. Its declarations are what clear the throw T010 expects
- **US2 (Phase 4)**: depends on US1 — there is no `tm59aI` for a target to name until T011 exists
- **US3 (Phase 5)**: depends on US1 only. Independent of US2: a study curve is drawn without a published line
- **US4 (Phase 6)**: depends on US1. T028's baseline diff wants US2 in as well, since the board's rows are what US2's re-pointing could break
- **US5 (Phase 7)**: depends on US1 only. The codec needs no change; this phase proves it
- **Polish (Phase 8)**: depends on every story taken

### Story independence, stated honestly

US1 and US3 are delivered by the same two declarations, because every chooser is generated from one roster. US3 is not dead weight: it is the check that this was true, and T025 says what to do if it was not. US2 is separable from both and is where the correctness of the feature lives. US5 is independent of everything but T011.

### Parallel opportunities

- **T017 and T018** — `src/schemes.js` and `src/main.js`, different files, neither waiting on the other
- **T038 and T039** — `docs/design-notes.md` and `CLAUDE.md`
- Within Phase 2, T004–T009 are one file each in sequence and are **not** parallel: T005 needs T004's fields, T006 needs T005's assertion, T008 needs T006's declarations
- Across stories, US3 and US5 can be taken in parallel once US1 is in, by different people if there are any

### Parallel example

```bash
# After Phase 3, the two re-pointings, in different files:
Task: "Re-point the Category I targets in src/schemes.js"        # T017
Task: "Derive the metric-to-criterion lookup in src/main.js"     # T018
```

---

## Implementation Strategy

### MVP

Phase 1 → Phase 2 → Phase 3 (US1). That is a reader able to survey and sweep the stricter category, with the ground computed against its own line. **Stop and validate there** — but do not ship it: until US2 is in, a Category I ground is crossed by nothing at all (its targets still name `tm59a`), and a ground with no line is a worse answer than the status quo for a reader who came for the line. US1 is the MVP to *validate*; US1 + US2 is the increment to *ship*.

### Incremental delivery

1. Setup + Foundational → the roster fails loudly for the right reason
2. + US1 → the stricter category is choosable everywhere a reading is chosen
3. + US2 → and is judged against its own published line, with the wrong one made unmountable
4. + US3, US4, US5 → verified on the study card, named everywhere, shareable
5. + Polish → measured, documented, and driven end to end

### Notes

- `[P]` means different files with no dependency between them
- Commit after each task or logical group; the constitution's gates are per change, not per feature
- A counted assertion edited to make a throw stop is worthless. T012's numbers are derived from the roster in the comment above them, and the derivation is what is reviewed
- Nothing in this feature touches `applyModel`, a channel, an applier, `params`, `shapeKey` or an `Output:*`. If a task starts to, stop: something has been misunderstood

---

## Phase 9: Convergence

Found by `/speckit-converge` assessing the codebase against spec.md, plan.md and this file
as it stood at 42/42 tasks checked. Two gaps, neither in the arithmetic: one is unfinished
copy work the previous session's own notes already named and left open; the other is a
design-document location that drifted from the code that implements it, for a documented
and sound reason.

- [ ] T043 State what the selected category presumes beside the chosen reading on the study card's quantity chooser (`studyQuantityChooser` in `src/console.js:1927-1968`), the way `categoriesSaid` already states it on the survey's `#survey-lede` (`src/main.js:9650-9658`, `11900-11912`) — through `fold()`, off `Category.presumes`, inside the `SUMMARY` word budget, never a second transcription and never on hover — completing what T029 built for the survey only per FR-005 (partial)
- [ ] T044 Correct `data-model.md`'s and `contracts/readings.md`'s I2 sections, which state the target-against-category invariant is "added at load in `src/schemes.js`", to say it lives in `src/study.js:969-980` instead, with the import-cycle reason already given in that code's own comment (`schemes.js` reading `QUANTITY_BY_ID` back through `study.js`'s read of `PRESETS` would close a cycle) per plan.md Project Structure (contradicts)
