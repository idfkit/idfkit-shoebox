---

description: "Task list for 012 — Attach a Weather File"
---

# Tasks: Attach a Weather File

**Input**: Design documents from `/specs/012-attach-weather-file/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: there is no test runner in this repository and none is being added. What
stands in for tests is the constitution's ten workflow gates — throwaway Node harnesses
over the real DOM-free modules, IDFs written and run, then the page driven. Those
harnesses are **not optional** here: gates 1–5 of the constitution's workflow apply to
any change that reaches the model, the link, or a reading, and this change reaches all
three. They are written alongside the code they verify rather than before it, because
they assert against real EnergyPlus output rather than against an interface.

**Organization**: by user story, so each is independently deliverable. One dependency
between stories is real and is stated rather than pretended away: **US4 depends on US3**,
because the amended FR-021 re-attaches a remembered file only where the link names it,
and the link key is US3's.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task — can run in parallel
- **[Story]**: US1–US4, on user-story phases only
- Every task names the file it lands in

## Path Conventions

Single project. Modules under `src/`, the page at `index.html`, harnesses under
`specs/012-attach-weather-file/verify/`, beside the ones feature 011 left.

---

## Phase 1: Setup (fixtures and the baseline everything is measured against)

**Purpose**: get real weather files in hand and record what is true before the change,
so that "unchanged" can be proved rather than asserted.

- [X] T001 Stage the engine, schemas and station index by running `npm install && npm run dev` at the repository root, confirming `public/energyplus/`, `public/schemas/` and `public/weather/` fill
- [ ] T002 Create `specs/012-attach-weather-file/verify/README.md` naming each harness, what it asserts and which quickstart gate it answers
- [ ] T003 [P] Create `specs/012-attach-weather-file/verify/kit.mjs` with the shared harness helpers (load the schema through `localBundle()` at the full `'26.1.0'` string, build a document, write an IDF, run one EnergyPlus per process), following `specs/011-sweep-priced-controls/verify/kit.mjs`
- [ ] T004 [P] Collect the weather fixtures quickstart gate 1 names into `specs/012-attach-weather-file/verify/fixtures/` (gitignored): a TMYx EPW saved from the picker, a licensed CIBSE DSY1 if held, the same file in CRLF and LF, a leap-year file, a part-year file, a sub-hourly file, and a DDY for a different city. Record in `verify/README.md` which were obtainable and which gates therefore cannot run
- [X] T005 [P] Mint the pre-feature link corpus: on `main`, write `specs/012-attach-weather-file/verify/links-before.json` from a spread of desks (defaults, every channel bypassed, a station link, a pinned hour, an open study, an open survey), following `specs/011-sweep-priced-controls/verify/links-before.mjs`
- [ ] T006 Re-measure research R5 and R8 on the real fixtures in `specs/012-attach-weather-file/verify/measure-file.mjs` — raw size, gzip size, base64 length, `localStorage` cost, SHA-256, gzip, gunzip, `dailyMeans` — and write the figures into `specs/012-attach-weather-file/research.md` over the synthetic ones, marking them measured (quickstart gate 1)

**Checkpoint**: real files in hand, the link corpus frozen, and the remembering budget
either confirmed or known to need a different answer before Phase 2 builds on it.

---

## Phase 2: Foundational (blocking — every story stands on this)

**Purpose**: the readers, the typed source, the model split and the one attach path.
Nothing in this phase is visible on the sheet, and a station picked from the list must
behave identically at the end of it.

**⚠️ CRITICAL**: no user story can begin until T018's checkpoint passes.

- [X] T007 Confirm the `Site:Location` field spellings against the 26.1.0 schema in `specs/012-attach-weather-file/verify/schema-fields.mjs` — `latitude`, `longitude`, `time_zone`, `elevation`, and the type of each through `schema.field('Site:Location', name).t` (quickstart gate 2, research R3). **Nothing below may name a field this task has not confirmed**
- [X] T008 Move `readLocation` from `src/main.js` to `src/epw.js` unchanged in behaviour, beside `parseEpwCalendar` and `parseEpwStartDay`, and delete the comment that said it belonged there
- [X] T009 Widen `readLocation` in `src/epw.js` to carry `latitude`, `longitude` and `elevation` (LOCATION fields 6, 7 and 9) alongside the six it already reads, keeping the null-for-empty and hyphen-is-absence rules and the sixteen-line bound
- [X] T010 [P] Add `siteLocationValues(place)` to `src/epw.js`, returning what `Site:Location` wants under the spellings T007 confirmed
- [X] T011 [P] Add `periodCovered(epw)` to `src/epw.js`, reading the `DATA PERIODS` record and the first and last timestamps, returning `{ from, to, perHour }` and never assuming a whole year
- [ ] T012 Create `src/source.js` (DOM-free, network-free) with the frozen `WeatherSource` and `Place` classes of [data-model.md](./data-model.md), every field passed and `null` a legitimate value for each nullable one
- [ ] T013 Add `fingerprint(bytes)` to `src/source.js`: CRLF and lone CR to LF and trailing newlines stripped **on the bytes**, SHA-256 through `crypto.subtle`, base64url, truncated to 16 characters (research R5)
- [ ] T014 Add `degreeDaysOf(means)` to `src/source.js` — `HDD18 = Σ max(0, 18 − mean)`, `CDD10 = Σ max(0, mean − 10)` over `dailyMeans`' 365 numbers, carrying `measured: true` and keeping the Celsius bases in both unit systems (research R11)
- [ ] T015 Add `sourceFromStation(station, files)` and the async `sourceFromFile({ name, bytes, ddyText })` to `src/source.js`, the second running the gate of [data-model.md](./data-model.md) and rejecting with the parser's own sentence unchanged (research R12)
- [X] T016 Split `setDesignConditions` in `src/model.js` into `setSiteLocation(doc, location)` and the design-day half, and add `clearDesignDays(doc)`; make `designDayDatums(doc)` return `[]` for a document with none rather than throwing
- [X] T017 Change `pricesFor` in `src/rates.js` to take a `Place` (`{ country, region }`) rather than a station object, leaving every published rate, refusal sentence and `countryName(iso3) ?? iso3` fallthrough exactly as they are (research R10)
- [ ] T018 Extract `attachClimate(source)` out of `choose()` in `src/main.js`, carrying all eight steps — the six clears (`studyScheduler.clearAll()`, `studyStops.clear()`, `closeSurvey({ forgetTraverse: true })`, `meanCache = null`, `bill`/`lastRun`, `lastOutcome`), the model write and the title-block re-letter — and make the station picker its first and only caller (research R1)
- [ ] T019 [P] Write `specs/012-attach-weather-file/verify/readers.mjs`: `readLocation`, `periodCovered`, `dailyMeans` and `degreeDaysOf` over every fixture, asserting each absence comes back `null`, each refusal names its day, and the measured degree days sit close to the index's published figures for the same station (quickstart gate 3)
- [ ] T020 [P] Write `specs/012-attach-weather-file/verify/fingerprint.mjs`: CRLF equals LF, trailing newline equals none, one changed character differs, changed in-field whitespace differs, every output matches `[A-Za-z0-9_-]{16}` (quickstart gate 4)
- [ ] T021 Verify the refactor changed nothing: pick three stations on the page, and in `specs/012-attach-weather-file/verify/station-unchanged.mjs` assert the IDF written for each is byte-identical to the one `main` writes for the same desk and station

**Checkpoint**: a station behaves exactly as before, the readers are proved against real
files, and `attachClimate` has a second caller waiting. User stories can begin.

---

## Phase 3: User Story 1 — Run the shoebox against a file you already hold (P1) 🎯 MVP

**Goal**: a reader attaches an EPW from their machine and the sheet solves its year,
lettering the place from that file and nothing from the climate before it.

**Independent Test**: attach a licensed DSY1 and a TMYx EPW saved to disk, at three desk
positions each. The run completes, the TMYx file attached by hand reads identically to
the same station picked from the list, and no network request carries any part of either
file.

- [ ] T022 [US1] Add the attach control to the site panel in `index.html` — a second way in beside the search, a native `<input type="file">` accepting `.epw`, `.ddy` and `.zip`, with its label and hint in view and a `[hidden]` twin for any class that toggles `display`
- [ ] T023 [US1] Style the attach control and the site panel's second row in `index.html` against `.interface-design/system.md` — four surfaces, hairline borders, no shadow, the accent reserved
- [ ] T024 [US1] Wire the file path in `src/main.js`: read the chosen file to bytes, build a source through `sourceFromFile`, and hand it to `attachClimate` — the same eight steps the picker takes (FR-001, FR-005)
- [ ] T025 [US1] Accept an archive in `src/main.js`: unpack a `.zip` with `DecompressionStream`, take an EPW and a DDY beside it, and where it holds more than one weather file list them for the reader to choose (FR-003)
- [ ] T026 [US1] Refuse in `src/main.js` whatever the gate refuses, whole: the reason in view, the previous climate untouched, and the reason the parser's own sentence (FR-004, FR-024)
- [ ] T027 [US1] Write `Site:Location` from the file's LOCATION record through `setSiteLocation` and `siteLocationValues` in `src/main.js`, and letter the title block and site line from the document as the station path does (FR-007)
- [ ] T028 [US1] Attach a DDY where one came with the file: `designConditionsFrom` as today, refusing with both places printed where it describes another site (FR-009)
- [ ] T029 [US1] Where no DDY came with the file, call `clearDesignDays`, commit `sizingPeriods` to `'No'`, and withdraw the Run strip's design-day choice with its reason stated in `src/controls.js`'s `requires` (FR-009, research R4)
- [ ] T030 [US1] Letter the absence of the datum lines in `src/main.js`'s `renderTrace` and on the plate, with the reason, rather than drawing the outgoing climate's (FR-009, Principle IV)
- [ ] T031 [US1] Letter the site sub-line for a file in `src/main.js`: the measured degree days saying they were measured, the period `periodCovered` read, and an em dash for the ASHRAE climate zone a file does not declare (FR-008)
- [ ] T032 [US1] Route the tariffs, currency and grid factor through the source's `Place` in `src/main.js`, and confirm an uncovered country refuses the bill with `rates.js`'s published sentence while the energy readings stand (FR-011)
- [ ] T033 [US1] Take `weatherStem` off the source rather than `station.url` in `src/main.js`, narrowing a reader's own file name to characters a ZIP member may carry (research R14)
- [ ] T034 [US1] Name the reader's own file in the run bundle's manifest in `src/bundle.js`, stating that whatever licence governs it governs sharing the bundle (FR-016)
- [ ] T035 [US1] Say the same on the report's run-files card in `src/report-sheet.js`, before the reader downloads a ZIP they may attach to a public issue (FR-016, FR-017)
- [ ] T036 [P] [US1] Write `specs/012-attach-weather-file/verify/model-with-file.mjs`: build the document against each fixture at several desk positions, write and run each IDF, assert idempotence three times over, assert a desk that lost its design days serialises identically to one built without them, and grep `eplus.err` for "requested but not generated" and for any sizing-period warning (quickstart gate 5)
- [ ] T037 [US1] Drive the page (`npm run dev`, `index.html`) against gates 8.1–8.4 of `specs/012-attach-weather-file/quickstart.md`: attach each fixture; attach a TMYx file by hand and pick the same station, asserting identical readings at five desk positions; attach while a run, a study and a survey are all in flight; swap file → station → file three times

**Checkpoint**: a UK engineer can model their building against the data their assessment
requires. This is the MVP and it is worth shipping alone.

---

## Phase 4: User Story 2 — Read the overheating criteria against the required file (P1)

**Goal**: every sentence in the overheating block is true of the file that was actually
attached, and none of them claims a relation to what the method requires.

**Independent Test**: attach a file declaring a British location and a daylight-saving
rule, and one declaring neither. Read the whole block in both cases: every sentence is
true of the file in hand, no sentence claims a match or a mismatch, and the file the run
used is legible without opening a fold.

- [X] T038 [US2] Split the local-time qualification in `src/tm59.js`: the standing half keeps TM59:2026 §3.7.1's rule, and a run-dependent half states what **this** file's `HOLIDAYS/DAYLIGHT SAVINGS` record declares, read through `parseEpwCalendar` (FR-013, research R13)
- [X] T039 [US2] Make the new half agree with the run in `src/tm59.js`: `applyRun` writes `use_weather_file_daylight_saving_period: params.dst`, so the sentence says which of the two states this run is in rather than asserting what files generally declare
- [X] T040 [US2] Confirm `qualificationsFor` and `WeatherFile.declares` need no change for an attached file in `src/tm59.js`, and that the weather qualification still prints the declaration beside `WFR_REQUIREMENT` asserting no relation (FR-012, FR-015)
- [ ] T041 [US2] Letter each criterion's absence in `src/main.js` where the attached file does not cover the seed week of 23–29 April or the 1 May – 30 September period, naming the missing period and computing nothing over a shortened one (FR-014)
- [ ] T042 [US2] Carry a `dailyMeans` refusal into criterion a's margin cell and into the degree-day reading in `src/main.js`, in the sentence the parser wrote, leaving criteria b and c reading (research R11, R12)
- [ ] T043 [P] [US2] Write `specs/012-attach-weather-file/verify/criteria-over-file.mjs`: all five criteria over a real DSY against the same arithmetic over a TMYx year; a seeded-week-short file; a season-short file; `TM59_SPACES` still equal to `PROFILE_IDS`; no threshold moved (quickstart gate 7)
- [ ] T044 [US2] Drive the page (`npm run dev`, `index.html`) against gate 7's lettering in `specs/012-attach-weather-file/quickstart.md`: the weather qualification, the local-time qualification in both states, and each criterion's absence sentence, all readable without opening a fold

**Checkpoint**: the page states nothing false about its own run, which is the reason the
feature exists.

---

## Phase 5: User Story 3 — Share the desk, and reproduce someone else's (P2)

**Goal**: a link minted under an attached file carries the file's declaration and a
fingerprint of its contents, loads the desk whole, and withholds every reading that needs
a year until a matching file is in hand.

**Independent Test**: mint a link from a desk running an attached file, open it in a
fresh browser: the desk loads whole, the wanted file is named, and nothing that needs a
year is lettered. Then attach the matching file, a different file, and a file with the
same name but different contents — three distinguishable outcomes, each stating its
reason.

- [X] T045 [US3] Add `wf` and `wfd` to `RESERVED` in `src/permalink.js`, under the existing collision assertion, and write them from `encodeState` where the desk's source is a file and never beside `stn` ([contracts/permalink-weather.md](./contracts/permalink-weather.md))
- [X] T046 [US3] Read both in `decodeState` in `src/permalink.js`, **above** `readValue` with the other reserved keys, returning `file` as `{ fingerprint, declares }` or null
- [X] T047 [US3] Refuse the link whole in `src/permalink.js` for `wfd` without `wf`, `wf` with `stn`, and a malformed `wf`, each naming what was wrong in the wording `win`-without-`stn` already uses
- [ ] T048 [US3] Build the file token in `src/main.js`'s `schemeHash` from the source rather than from `station`, so the address bar carries `wf` and `wfd` the moment a file is attached
- [ ] T049 [US3] Land a `wf` link on the waiting desk in `src/main.js`: apply every parameter, patch, pin, study and survey, **remove the shipped design days**, solve nothing, and letter what the link asked for in the file's own words (FR-019, research R7)
- [ ] T050 [US3] Hold the address bar still while a desk waits on a file in `src/main.js`, as `linkAttachPending` does for a linked station, so the link being honoured cannot lose its own token
- [ ] T051 [US3] Letter the absence of every reading that needs a year on a waiting desk in `src/main.js`, with the reason in view rather than in a fold, and never from the design days (FR-019, FR-024)
- [ ] T052 [US3] Refuse a mismatched file against a `wf` link in `src/main.js`, printing both what the link asked for and what the file declares, and offering the file on a fresh desk instead (FR-020)
- [ ] T053 [US3] Name the file a kept scheme was solved against in its row in `src/schemes.js`, and make a kept scheme minted under a file follow the link's rule when recalled (FR-022)
- [ ] T054 [P] [US3] Write `specs/012-attach-weather-file/verify/link-roundtrip.mjs`: a file desk encodes, decodes and re-encodes byte-identically with a `wfd` carrying commas, spaces and `·`; each malformed class refused whole; `LINK_VERSION` still `v1` and `DEFAULTS_BY_VERSION` unchanged (quickstart gate 6)
- [ ] T055 [US3] Decode T005's `links-before.json` on the branch in `specs/012-attach-weather-file/verify/links-after.mjs` and diff: every link minted before this feature must decode to exactly what it decoded to before
- [ ] T056 [US3] Drive the page (`npm run dev`, `index.html`) against gate 6's three outcomes in `specs/012-attach-weather-file/quickstart.md`: the matching file, a different file, and a file renamed but unchanged — which the fingerprint must accept, since it is taken over contents

**Checkpoint**: two engineers can argue over the same building, which is the use this
page is for.

---

## Phase 6: User Story 4 — Keep working across reloads, and put the file down (P3)

**Goal**: the browser keeps the file's bytes, the address bar keeps its name, and neither
can put a climate on the desk without the other agreeing.

**Depends on US3** — the amended FR-021 re-attaches only where the link names the file,
and `wf` is US3's key (research R9).

**Independent Test**: attach a file and reload — re-attached, and said so. Clear the
fragment and reload — no climate, and the remembered file offered rather than attached.
Forget it and reload — the offer is gone. Swap file and station three times with nothing
surviving between them.

- [ ] T057 [US4] Add `rememberFile`, `rememberedFile` and `forgetFile` to `src/weather.js` (which is already the browser-only weather module), storing the `RememberedFile` of [data-model.md](./data-model.md) gzipped and base64'd under `shoebox-weather-file-v1`
- [ ] T058 [US4] Write the record only after an attach has landed in `src/main.js` — what is remembered is a file that already solved
- [ ] T059 [US4] Re-attach on boot in `src/main.js` **only** where the fragment's `wf` equals the remembered fingerprint, so an ordinary reload works and a bare URL means the same thing on every machine (FR-021, research R9)
- [ ] T060 [US4] Offer the remembered file in one click on a desk whose link names no file, in `src/main.js` and `src/console.js`, naming it in the file's own words and attaching nothing until the reader asks
- [ ] T061 [US4] State that a file is remembered, and offer to forget it, in view in `src/console.js`; forgetting clears the record and nothing else clears it
- [ ] T062 [US4] Say that a file will not be remembered where the write exceeds the quota, in `src/main.js`, leaving the session working — told about, not worked around (FR-021)
- [ ] T063 [US4] Keep the remembered file when a station is attached in `src/main.js`: it stops being attached, the offer remains, and the station replaces the climate whole (FR-006)
- [ ] T064 [P] [US4] Write `specs/012-attach-weather-file/verify/remember.mjs` over the real fixtures: the stored size against the quota, the gzip and gunzip costs, and a round trip proving the bytes come back identical and fingerprint the same
- [ ] T065 [US4] Drive the page (`npm run dev`, `index.html`) against gate 8.4 in `specs/012-attach-weather-file/quickstart.md` and US4's scenarios: reload with the fragment, reload with it cleared, forget and reload, and a quota deliberately filled

**Checkpoint**: all four stories stand, each independently testable.

---

## Phase 7: Polish and cross-cutting

**Purpose**: what the change owes the rest of the repository (research R15), and the two
gates that can only be run over the finished feature.

- [ ] T066 [P] Declare a budget for every new always-visible string in `src/copy.js` — the attach control, the remembered line, the waiting-desk sentence, each refusal — and assert them at load, moving any long text into a `blurb`, `note` or `body`
- [ ] T067 [P] Update `NOTES` and the `tour?.note(...)` call sites in `src/tour.js` for the second way a year reaches the desk, and bump `shoebox-general-notes-v4` to `-v5` (constitution workflow gate 6)
- [ ] T068 [P] Record the file-attach control, the remembered line and the waiting-desk state as patterns in `.interface-design/system.md`, in this change rather than in the stylesheet (constitution workflow gate 8)
- [ ] T069 [P] Write the design-notes section in `docs/design-notes.md`: the real measurements from T006, the fingerprint rule and why line endings are the one thing normalised, the Principle II reasoning behind R9, and the no-design-days desk
- [ ] T070 [P] Add the entry to `CHANGELOG.md`, which the sheet reads back through `src/changelog.js`
- [ ] T071 Run quickstart gate 9 in the browser with the network panel recording from before the file dialog opens: attach, solve, study, survey, mint a link, download the bundle, hand off a report — no request carries any part of the file, and a desk on an attached file makes no `/onebuilding` request at all (FR-002, SC-002)
- [ ] T072 Run gate 8.6 of `specs/012-attach-weather-file/quickstart.md` over `index.html` at 390 px with a coarse pointer over every surface this feature touches, confirming nothing is hover-only and folded controls leave the tab order (FR-023, Principle VII)
- [ ] T073 Switch units in both directions on `index.html` with a file attached and confirm every figure re-letters, nothing re-runs, and the fingerprint, period and place are unchanged (quickstart gate 8.7)
- [ ] T074 Run every remaining quickstart gate end to end and record the outcome in `specs/012-attach-weather-file/verify/README.md`, naming any gate that could not be run and why (a fixture that could not be obtained is a gate not run, never a gate assumed passed)
- [ ] T075 Confirm `.github/workflows/check.yml` still passes: no governed package moved, so the consumer register in idfkit-conformance is untouched

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies. T006 gates the remembering budget, so it is worth
  finishing before Phase 6 is planned in detail.
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks every user story.** T007 blocks
  T010 absolutely — no field name is written that the schema has not confirmed.
- **Phase 3 (US1)**: depends on Phase 2.
- **Phase 4 (US2)**: depends on Phase 2. Independent of US1 in principle; in practice a
  file has to be attachable to read criteria over one, so US1 first is the sane order.
- **Phase 5 (US3)**: depends on Phase 2.
- **Phase 6 (US4)**: depends on Phase 2 **and on US3** (research R9).
- **Phase 7 (Polish)**: T066–T070 can start as soon as the strings and patterns they
  document exist. T071–T075 need every story that is shipping.

### Within Phase 2

T007 → T010. T008 → T009 → T010, T011. T012 → T013, T014, T015. T016 and T017 are
independent of the `epw.js` and `source.js` work and of each other. T018 needs T012 and
T015 to have a source to take. T019–T021 verify what precedes them.

### Parallel opportunities

- **Phase 1**: T003, T004 and T005 in parallel once T001 is done.
- **Phase 2**: T010 and T011 in parallel after T009; T016 and T017 in parallel with the
  whole `epw.js`/`source.js` line; T019 and T020 in parallel once their subjects exist.
- **Phase 3**: T034 and T035 touch `bundle.js` and `report-sheet.js` and are parallel to
  everything in `main.js`. T036 is parallel to the interface work.
- **Phase 5**: T054 is parallel to the interface tasks; T045–T047 are one file and are
  not parallel with each other.
- **Phase 7**: T066–T070 are five different files and all parallel.
- **Across stories**: US1 and US2 can be worked in parallel by two people after Phase 2;
  US3 can go in parallel with both; US4 waits on US3.

### Files several tasks touch

`src/main.js` carries T018, T024–T033, T041, T042, T048–T052, T058–T063, T071 — none of
them marked [P] against each other. `src/epw.js` carries T008–T011. `src/permalink.js`
carries T045–T047. Sequence them within their file.

---

## Parallel example: Phase 2

```bash
# after T009 has widened readLocation:
Task: "Add siteLocationValues(place) to src/epw.js"          # T010
Task: "Add periodCovered(epw) to src/epw.js"                 # T011  (same file — sequence these two)

# genuinely parallel, three different files:
Task: "Split setDesignConditions in src/model.js"            # T016
Task: "pricesFor takes a Place in src/rates.js"              # T017
Task: "WeatherSource and Place in src/source.js"             # T012
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1, ending with real files in hand and the link corpus frozen.
2. Phase 2, ending with T021 proving a picked station is byte-identical to before.
3. Phase 3.
4. **Stop and validate**: quickstart gates 5 and 8.1–8.4, and gate 9's network recording
   even at this stage — the privacy claim is the product and it is cheaper to prove early.
5. A UK engineer can now model against their purchased file. That is worth shipping.

### Incremental delivery

- **+ US2**: the overheating block stops describing a file the reader is not using. This
  is the pair that makes the feature what it was asked for; ship US1 and US2 together if
  anything is shipped at all.
- **+ US3**: two engineers can reproduce each other's numbers.
- **+ US4**: the working afternoon stops sending the reader back to the filesystem.

### Where this will go wrong if it goes wrong

Worth naming, since the plan's research is where the answers are:

- **T007**, if the schema spells a field differently than expected. Everything downstream
  of `Site:Location` waits on it, which is why it is first in Phase 2.
- **T029–T030**, if a run with no design days turns out to need one after all.
  `model.js:2329` says nothing here is autosized; T036 is where that claim is tested
  rather than trusted, and if it fails the third clarification needs reopening.
- **T006**, if a real bought file compresses far worse than the synthetic 22.3 %. The
  remembering budget, and with it most of Phase 6, depends on it.

---

## Notes

- [P] means a different file and no dependency on an incomplete task.
- Every harness imports from `src/` directly. Nothing is copied, or it stops verifying
  the code that ships.
- **One EnergyPlus per process.** `main` is not re-entrant: a second `callMain` throws a
  bare number before doing any work and leaves the previous ESO in place.
- Commit after each task or logical group; stop at any checkpoint to validate a story.
- A gate that could not be run is recorded as not run. It is never recorded as passed.
