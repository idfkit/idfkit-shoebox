---

description: "Task list for 003-fix-weather-station-fatal"
---

# Tasks: A station with incomplete design conditions is refused, not run

**Input**: Design documents from `/specs/003-fix-weather-station-fatal/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/design-conditions.md](./contracts/design-conditions.md), [quickstart.md](./quickstart.md)

**Tests**: this repository has no test runner and none is being added. What stands in its place is the constitution's own quality gates: throwaway Node harnesses that build the document, run the engine, and assert idempotence. Those are **not optional here**, so they appear as ordinary tasks rather than as a bracketed test phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: which user story the task serves (US1, US2, US3)
- Paths are repository-relative from `/Users/samueld/PycharmProjects/idfkit-workspace/idfkit-shoebox`

**A note on `[P]`, honestly**: almost all of this change lands in two files, `src/model.js` and `src/main.js`, so genuine parallelism is thin. Tasks are marked `[P]` only where they truly touch different files. Do not fabricate concurrency across the two source files.

---

## Phase 1: Setup

**Purpose**: stage the assets and give the harnesses somewhere to live.

- [X] T001 Stage the engine, schema bundle and station index by running `npm install && npm run predev` at the repository root, and confirm `public/energyplus/`, `public/schemas/` and `public/weather/stations.json.gz` all exist
- [X] T002 [P] Create the harness directory `harness/` at the repository root and add a `harness/` line to `.gitignore`. Harness scripts **must** live inside the repository or `import { parseIdf } from '@idfkit/core'` fails to resolve; running them from a system temp directory throws `ERR_MODULE_NOT_FOUND`
- [X] T003 [P] Write `harness/fixtures.mjs`: download the four fixture archives named in `specs/003-fix-weather-station-fatal/quickstart.md` into `harness/fixtures/<wmo>/`, unzip the `.ddy` out of each, and export a loader returning the DDY text by WMO. Fixtures are Denver 725650, Boston-Logan 725090, Boston 994971, and Bardsey Island Lighthouse 034000
- [X] T004 [P] Write `harness/schema.mjs` exporting the loaded schema, `await localBundle().load('26.1.0')` from `@idfkit/schemas/node`. Outside the browser the schema does not come from `httpSource('/schemas/')` and it wants the full version string

**Checkpoint**: assets staged, fixtures on disk, harnesses able to import `@idfkit/*`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the declaration and the numeric check that all three stories read. Nothing in Phase 3 or later can start until these exist.

**⚠️ These four tasks all edit `src/model.js` and are strictly sequential.**

- [X] T005 Add the `DesignDayWanted` class to `src/model.js`, near `designConditionsFrom`: a frozen instance with `suffix`, `dayType`, `label` and `note`, constructed rather than a loose dictionary, in the style of the declarations in `src/controls.js`
- [X] T006 Add the `DESIGN_DAYS` declaration to `src/model.js`: the two ordered candidate lists exactly as tabulated in `specs/003-fix-weather-station-fatal/data-model.md`, heating first choice `Ann Htg 99% Condns DB`, cooling first choice `Ann Clg 1% Condns DB=>MWB`. Carry a comment recording why the list is names rather than structure: `SizingPeriod:DesignDay` has no annual-versus-monthly field, and this is safe only because every archive the picker reaches comes from onebuilding
- [X] T007 Add `readDesignDays()` to `src/model.js`, throwing at module load on any of the five invariants in `data-model.md`: duplicate suffix, season mismatch against the list, empty `label` or `note`, an empty list, or a suffix that matches a monthly form. Follow the house pattern of `readLandmarks` in `src/controls.js`
- [X] T008 Add the numeric check to `src/model.js`: given a design-day object, every field it carries that the schema types numeric (`schema.field('SizingPeriod:DesignDay', name).t === 'n'`) must hold a finite number; empty and absent fields pass. Read the rule off the schema, never from a hand-written field list
- [X] T009 [P] Write `harness/declaration.mjs` asserting each of the five invariants throws when violated, by constructing bad lists directly rather than by editing `src/model.js`

**Checkpoint**: the declaration exists and defends itself. User story work can begin.

---

## Phase 3: User Story 1 - A first reader searches for their city (Priority: P1) 🎯 MVP

**Goal**: attaching the station the picker ranks first for Boston either solves or is refused with a reason. No run terminates during input processing.

**Independent Test**: search Boston, take the top result, and observe. Passes when the outcome is a solved sheet or a stated refusal; fails on any engine fatal. Then take Bardsey Island Lighthouse and confirm it still attaches, which is the half of this story that a careless fix breaks.

### Implementation

- [X] T010 [US1] Rewrite the `pick` logic in `designConditionsFrom` in `src/model.js`: walk each list in declared order, take the first candidate whose name ends with the suffix, whose `day_type` matches, and whose numbers all pass T008. Delete the `days.find((day) => String(day.day_type) === dayType)` fallback, which is what reaches the January day
- [X] T011 [US1] Write the refusal messages in `designConditionsFrom` in `src/model.js` exactly as tabulated in `contracts/design-conditions.md`, distinguishing "publishes no annual cooling design conditions" from "carries no usable value for «field»". They are sentence fragments lettered after `${siteName(picked)} cannot be used: `, so they stay lower case and start mid sentence
- [X] T012 [US1] Change `designDayDatums` in `src/model.js` to letter each datum from the `DesignDayWanted` whose suffix the day's own name ends with, replacing the hard-coded `'99% htg db'` / `'1% clg db'` pair. A day matching no candidate throws rather than lettering a blank
- [X] T013 [US1] Confirm the built-in Denver design days in `buildModel` in `src/model.js` (around lines 620 and 638) carry names the declaration covers, so the boot desk letters its datums through the same path as an attached station

### Verification

- [X] T014 [P] [US1] Write `harness/reader.mjs`: drive `designConditionsFrom` over the four fixtures and assert guarantees C1 to C6 and every row of the "cases the harness must cover" table in `contracts/design-conditions.md`. Boston 994971 must throw naming the absent annual cooling conditions; Bardsey Island must return its dewpoint day lettered as a dewpoint day
- [X] T015 [P] [US1] Write `harness/survey.mjs`: re-run the Phase 0 survey against the new reader. Sample one archive per site from `public/weather/stations.json.gz` with a seeded pick, fetch, parse, and classify. Assert against `research.md`: of the recorded 120-site sample, 108 attach and 12 refuse, all 12 in the `99xxxx` band, zero ordinary WMO sites refused. A run refusing appreciably more than 12 means the candidate list was narrowed too far
- [X] T016 [P] [US1] Write `harness/idempotence.mjs`: with a station attached, assert `applyModel` three times produces byte-identical output, and that a document built for an already-clean station serialises identically before and after this change. Any byte that moves for a clean station means the candidate order is wrong
- [X] T017 [P] [US1] Write `harness/engine.mjs`: build the IDF at several console positions for each fixture station, run EnergyPlus 26.1.0 from `/Applications/EnergyPlus-26-1-0`, and grep `eplusout.err`. Assert no severe and no fatal on every station the reader accepts. Clear the require cache between runs where the staged WebAssembly engine is used instead, since EnergyPlus's `main` is not re-entrant
- [X] T018 [US1] Drive the page with `npm run dev`: type `Boston`, take the first row's most recent window, and confirm a refusal naming the station with the sheet still carrying its previous numbers undimmed. Then take Boston-Logan and confirm a normal attach and solve. Then take Bardsey Island Lighthouse and read the plate's cooling datum, which must letter the dewpoint day it actually got

**Checkpoint**: the reported fatal is closed and no clean station has been lost. This is the MVP and it is shippable on its own.

---

## Phase 4: User Story 2 - A shared link naming such a station is refused whole (Priority: P2)

**Goal**: a link naming a refused station lands on defaults with the reason stated, not with a generic sentence.

**Independent Test**: open the page on `#v1&stn=994971&win=2009-2023` and read the status line. It must name what was wrong with that station, not merely say the link was set aside.

**Note on what is already right**: `attachFromLink` in `src/main.js` already refuses the whole link, restores defaults and stops auto-solve. The gap is narrower than the story implies and is entirely about the sentence.

### Implementation

- [X] T019 [US2] Fix the lost reason in `src/main.js`: `choose` returns bare `false` on refusal, and `attachFromLink` then letters its own generic `could not be attached, so the whole link was set aside`, overwriting the specific sentence `refuse` had just put in the status line. Carry the reason out of `choose` (return it alongside the outcome, keeping the three-outcome distinction between attached, refused and superseded) and letter it in the `took === false` branch
- [X] T020 [US2] Confirm in `src/main.js` that the refused-link path leaves `linkAttachPending` cleared and auto-solve stopped so no solve overwrites the reason, and that the `untouched` guard still holds: a reader who moved a control during the fetch keeps their work

### Verification

- [X] T021 [US2] Drive the page on a link carrying `stn=994971`, confirming the desk stands at defaults, the status line names the station and the reason, and moving a control afterwards does not overwrite the sentence
- [X] T022 [P] [US2] Drive the page on a link carrying a clean station, `stn=725090`, confirming nothing about the honoured path regressed and the link still solves once as itself

**Checkpoint**: a shared link fails informatively.

---

## Phase 5: User Story 3 - The refusal is somewhere to go from (Priority: P3)

**Goal**: a refused reader reaches a working station for the same city in at most two further gestures.

**Independent Test**: attach the refused Boston station and reach Boston-Logan using only what the refusal put in front of you, counting gestures.

**Note on why nearest sites lead**: all five published periods of Boston 994971 carry the identical three design days, verified. Offering the site's own other periods first would be a dead end five times over.

### Implementation

- [X] T023 [US3] Widen `refuse` inside `choose` in `src/main.js` to take the refused station and reopen the picker on the nearest other sites, calling the existing `nearestSites(picked.latitude, picked.longitude, 8)` and rendering through the list the picker already has with `distances: true`
- [X] T024 [US3] Handle the link path in the same change in `src/main.js`: `attachFromLink` calls `choose(null, pick, …)`, so `row` is null and anything reaching for `row.flavors` throws. The refused station itself is always in hand, so drive the offer off `picked` and leave the site's own other periods reachable through the existing `← All locations` step
- [X] T025 [US3] Letter the refusal note above the offered list in `src/main.js` through the picker's existing `say(text, true)`, so the reason and the way out are read together rather than the reason living only in the status line

### Verification

- [X] T026 [US3] Drive the page: attach the refused Boston station and count the gestures to a solved Boston-Logan desk. Two or fewer passes
- [~] T027 [US3] Drive the page at 390 px wide and at 600 px tall and confirm the refusal and its offers read without hovering, without opening anything, and without sideways scrolling. **Partially verified.** The browser automation could not drive this tab's viewport (it stayed pinned at 1271 px; `resize_window` reported success but `innerWidth` never moved, and `outerWidth` read 0). Verified instead by inspection: the refusal renders into the picker's existing `#site-note` and `#site-list` with no new element and no new CSS rule, and `index.html` carries no media query at any breakpoint that restyles `.site-panel`, `.site-note`, `.site-list` or `.site-opt`, so it reads exactly as the picker already does at that width. The offers are `<button>` elements in the list, so nothing is hover-only. **Needs a human eye at 390 px before this is called done.**
- [X] T028 [P] [US3] Record the new component pattern in `.interface-design/system.md`, a refusal that carries its next step, beside `### Absence is not zero` and `### Comparison is refused unless it is like for like`. The design system is the authority on this change, not the stylesheet it produces

**Checkpoint**: all three stories stand independently.

---

## Phase 6: Polish and cross-cutting concerns

- [X] T029 Read `NOTES` in `src/tour.js` against the new refusal. What the station step teaches is unchanged, so no copy change is expected; if any is needed, bump the storage key `shoebox-general-notes-v2` in the same change. Record the outcome either way, because "we checked" is the deliverable here
- [X] T030 Fix the stale comment above `renderTrace` in `src/main.js` (around line 3288), which says the datum lines are redrawn from "that station's own 99% heating and 1% cooling drybulb". That stops being true the moment a dewpoint day can be chosen
- [X] T031 [P] Add a `### Fixed` entry to the `## [Unreleased]` section of `CHANGELOG.md`, in the house voice: what the reader met, what was actually wrong, and the measurement. Name the 12-in-120 refusal rate and the 51-in-120 that a naive fix would have cost, because the second number is the interesting one
- [X] T032 Update `CLAUDE.md` with what this cost to find: that a DDY can carry `N` where a number belongs, that `parseIdf` with `strict: true` does not catch it, and that the `day_type` fallback was load-bearing for 43% of the index. This belongs beside the other measured invariants that failed quietly
- [X] T033 Run every check in `specs/003-fix-weather-station-fatal/quickstart.md` end to end, in the order given, and confirm the definition of done at its foot

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies, start immediately
- **Foundational (Phase 2)**: needs T001 for the schema, and T002 for anywhere to put T009. Blocks every story
- **US1 (Phase 3)**: needs Phase 2 complete. Blocks nothing, and is shippable alone
- **US2 (Phase 4)**: needs Phase 2. Independent of US1 in principle, though there is nothing to see until US1 makes a station refusable for the new reason
- **US3 (Phase 5)**: needs Phase 2. Same relationship to US1 as US2 has
- **Polish (Phase 6)**: T029, T030 and T032 need US1. T031 needs whatever is being shipped

### Within Phase 3

T010 to T013 are one file and strictly sequential. T014 to T017 are four separate harness files and genuinely parallel once T013 lands. T018 is last, because driving the page before the harnesses pass wastes the slowest feedback loop on the fastest bugs.

### Parallel opportunities

- T002, T003 and T004 are three different files and can be written together
- T014, T015, T016 and T017 are four harness files with no dependency between them
- T028 touches only `.interface-design/system.md` and can be written while US3's code is in progress
- T031 touches only `CHANGELOG.md`

### Parallel example: Phase 3 verification

```bash
# Once T013 lands, these four are independent files:
Task: "Write harness/reader.mjs, the contract cases over the four fixtures"
Task: "Write harness/survey.mjs, the 120-site regression against research.md"
Task: "Write harness/idempotence.mjs, three applies byte-identical"
Task: "Write harness/engine.mjs, EnergyPlus over each fixture station"
```

---

## Implementation strategy

### MVP first

1. Phase 1, Setup
2. Phase 2, Foundational
3. Phase 3, User Story 1
4. **Stop and validate**: the reported fatal is closed, and T015 proves no clean station was lost
5. Shippable. The bug in the title is fixed at this point

US2 and US3 are both improvements to a failure that, after US1, is already safe and already explained on the sheet. They can follow in a second change without leaving anything half done.

### The one task to not skip

T015. Every other check confirms the fix works on the station that was reported; T015 is the only one that confirms it did not refuse 39 stations that were working fine. The survey is the reason the candidate list is a list at all.

---

## Notes

- `[P]` means different files, and in this change that mostly means the harnesses
- Commit after each task or logical group
- The house comment style is prose recording the reasoning, and frequently the error message that forced the decision. The severes in `research.md` belong in the comment above the numeric check
- No run-time dependency may be added. Everything this needs is already on the page
