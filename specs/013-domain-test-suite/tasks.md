---

description: "Task list for 013-domain-test-suite"
---

# Tasks: An executing verification suite for the model

**Input**: Design documents from `/specs/013-domain-test-suite/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This feature *is* the test suite. Every task below writes verification code or the
declarations it runs from; there is no separate "tests for this story" section, because the
story's deliverable is the check.

**Organization**: Tasks are grouped by user story so each can be implemented and validated
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1–US7)
- Every task names the exact file it writes

## Path Conventions

Single project, repository root. Source under check is `src/*.js`; the suite is the sibling
tree `tests/`, with `eslint-rules/` beside it and `scripts/verify.mjs` driving the tiers.
Paths below are repository-relative, per [plan.md](./plan.md)'s Project Structure.

## The invariant roster used throughout

The twenty-six bullets under `CLAUDE.md`'s "Invariants that fail quietly" are the backlog
(spec Assumptions). Each becomes one `Invariant` id, and the tasks below name them:

`INV-north-axis-ignored`, `INV-schedule-until-two-fields`, `INV-weather-special-days`,
`INV-runperiod-start-day-empty`, `INV-fifth-weekday-holiday`, `INV-tmyx-no-holidays`,
`INV-ddy-literal-n`, `INV-design-days-ordered`, `INV-field-names-drift`,
`INV-thermostat-control-match`, `INV-setpoint-order`, `INV-economizer-flow-limit`,
`INV-coincident-vertices`, `INV-interval-advances-cursor`, `INV-no-per-surface-output`,
`INV-kinds-declared`, `INV-temperature-difference`, `INV-span-is-a-difference`,
`INV-reading-change-is-a-difference`, `INV-lettered-cache-keys-system`,
`INV-hidden-tab-starves-raf`, `INV-aria-label-is-a-reading`, `INV-suffix-not-unit`,
`INV-hidden-twin`, `INV-dataset-getter-only`, `INV-no-labels-in-issue-url`.

Where a bullet carries two clauses (the `RunPeriod` bullet, the `KINDS` bullet), splitting it
into two ids is the implementer's call — the binding constraint is SC-002: **every bullet is
accounted for, and the roster is written as the bullets are read**, bullet by bullet, because
the section is deleted at the end of this work (T112) and is the specification of it.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the tooling exists, the scripts exist, nothing verifies anything yet

- [ ] T001 Add `eslint`, `prettier`, `eslint-config-prettier` and `jsdom` to `devDependencies` only in `package.json`, leaving `dependencies` untouched (FR-040, SC-014)
- [ ] T002 Add the seven scripts from [contracts/runner.md](./contracts/runner.md) — `verify`, `verify:fast`, `verify:model`, `verify:engine`, `verify:proof`, `lint`, `format`, `format:check` — to `package.json`, each delegating to `scripts/verify.mjs` or to the tool directly
- [ ] T003 [P] Create the suite tree with `.gitkeep` where empty: `tests/support/`, `tests/fixtures/weather/`, `tests/fixtures/run/`, `tests/goldens/`, `tests/mutations/`, `tests/fast/`, `tests/model/`, `tests/engine/`, `eslint-rules/`
- [ ] T004 [P] Create `.prettierrc.json` with the project's settled presentation, and `.prettierignore` listing `src/rates.data.js`, `src/tm59.data.js`, `tests/goldens/`, `tests/fixtures/` and `public/`
- [ ] T005 [P] Create `eslint.config.js` as a flat config over `src/`, `scripts/`, `tests/`, `infra/` and `eslint-rules/`, ending with `eslint-config-prettier`, with **every** rule set to `'off'` carrying its reason on the line above (FR-034, SC-017)
- [ ] T006 [P] Add the suite's scratch directories (`.verify/`, `tests/.scratch/`) to `.gitignore` so a run leaves the checkout clean
- [ ] T007 [P] Write the custom rule `eslint-rules/covers-id-is-literal.js` requiring `covers()`'s first argument to be a string literal, because the static discovery pass reads source rather than running it ([contracts/registry.md](./contracts/registry.md))

**Checkpoint**: `npm install`, `npm run lint` and `npm run format:check` all run. No check exists yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the runner, the tiers, the register, the document builder, the engine harness and
the declarations every story's checks are written against

**⚠️ CRITICAL**: no user story work can begin until this phase is complete

### The runner

- [ ] T008 Write `scripts/verify.mjs`: runs the requested tiers in order (`fast`, `model`, `engine`), spawns `node --test` per tier with `--experimental-test-isolation=process`, `TZ=UTC` and `LC_ALL=C`, prints a per-tier verdict line and one overall verdict, and exits `0`/`1`/`2`/`3` exactly as [contracts/runner.md](./contracts/runner.md) states
- [ ] T009 Write `tests/support/tiers.js`: the frozen `Tier` type (`id`, `glob`, `budget`, `prerequisites`) validating in its constructor, with `fast` 60 s, `model` 300 s, `engine` 900 s and `proof` no budget — a budget exceeded is a defect in the suite, not a slow machine (FR-002)
- [ ] T010 Write `tests/support/staging.js`: one `Prerequisite` per probe with its remedy sentence — `node_modules/{eslint,prettier,jsdom}` for `fast`; `@idfkit/schemas` resolving and `localBundle()` yielding exactly `26.1.0` for `model`; `public/energyplus/energyplus.js` and the vendored climate fixtures for `engine` (FR-004, research D-03)
- [ ] T011 Write `tests/support/nonet.js`: an undici global dispatcher that throws naming the host it was asked for, installed by every tier and by the engine child, so a check that reaches the network fails rather than succeeding slowly (FR-005)
- [ ] T012 Add `--experimental-test-coverage` with `--test-coverage-include='src/**'` to `scripts/verify.mjs`, printing the figure and passing **no** threshold flag anywhere (FR-031, SC-018)

### The register and the rosters

- [ ] T013 Write `tests/support/register.js` exporting `covers(id, name, fn)`, which declares `test(\`${id}: ${name}\`, fn)` and holds no runtime registry — the id in the test name is what every reporter carries (FR-025, [contracts/registry.md](./contracts/registry.md))
- [ ] T014 Write `tests/invariants.js`: the frozen `Invariant` type (`id`, `evidence`, `reason`, `tier`) validating in its constructor — `id` matching `/^INV-[a-z0-9-]+$/` and unique, `unexecutable` requiring a `reason` and forbidding a `tier`, anything else forbidding a `reason` — with **no `quote` and no `where`** (FR-030a, data-model.md)
- [ ] T015 Declare the twenty-six `Invariant` rows in `tests/invariants.js` using the ids listed above, `evidence: 'structural'` on the five whose subject is `src/main.js` (research D-04) and `'executed'` on the rest
- [ ] T016 [P] Write `tests/gates.js`: the frozen `Gate` type (`number`, `quote`, `evidence`, `reason`, `tier`) and the ten rows, each `quote` holding that gate's opening sentence from `.specify/memory/constitution.md` verbatim, with gates 7 and 9 `evidence: 'human'` and their reasons (FR-008, SC-004)

### Building a document

- [ ] T017 Write `tests/support/schema.js`: loads `localBundle()` from `@idfkit/schemas/node` once per process with the full version string `load('26.1.0')`, and asserts the version rather than assuming it — field names drift between versions ([contracts/engine.md](./contracts/engine.md))
- [ ] T018 Write the frozen `DeskPosition` type in `tests/support/desk.js` validating every `params` key against `DEFAULT_PARAMETERS`, every value a scalar, every `patching` id a declared channel, and `covers` naming only channels the position distinguishes (data-model.md)
- [ ] T019 Declare the nineteen representative positions in `tests/support/desk.js` — `baseline`, `bare`, `engaged-{context,glazing,skylights,shading,blinds,fabric,mass,air,gains,daylight,system,grounds}`, `full`, `shrunk`, `built-small`, `sealed`, `north-turned` — with `simulated` true on the eleven FR-017 names
- [ ] T020 Implement `buildDocument(position)` in `tests/support/desk.js`: overlays `position.params` on `DEFAULT_PARAMETERS`, builds the patch bay from `position.patching`, calls the real `applyModel` from `src/model.js` with no stand-in, and returns `{ doc, text }` ([contracts/engine.md](./contracts/engine.md))
- [ ] T021 [P] Write `tests/support/golden.js`: `matchesGolden(id, text)` comparing `tests/goldens/<id>.idf` byte for byte, printing a unified diff capped at 200 lines and naming the file; under `UPDATE_GOLDENS=1` it writes and reports what it wrote, and it **refuses to write when `CI` is set** (FR-022, research D-07)

### Running the engine

- [ ] T022 [P] Write `tests/support/eplus-child.mjs`: sets `global.Module = { noInitialRun: true, locateFile }` at `public/energyplus/`, requires `energyplus.js`, calls `callMain(['-d', outDir, '-w', epw, idf])` **exactly once**, installs the network-refusing dispatcher, and exits
- [ ] T023 Write `tests/support/engine.js`: `runEnergyPlus({ idf, epw, outDir })` forking one child per run, pooled at `os.availableParallelism()` capped at 6, resolving with the paths of `eplusout.err`, `.eso`, `.mtr`, `.rdd` and `eplustbl.htm` (FR-021, research D-08)
- [ ] T024 [P] Write `tests/support/dom.js`: installs the `jsdom` globals and then `await import()`s the module under test, so the globals cannot leak into a check that did not ask for them (research D-05)

### Fixtures

- [ ] T025 [P] Write the frozen `Fixture` type and the roster in `tests/fixtures/manifest.js` — `path`, `origin`, `licence`, `trimmed` — refusing at load a fixture declared without an `origin`
- [ ] T026 [P] Vendor one complete TMYx EPW (gzipped) and its DDY into `tests/fixtures/weather/`, with their onebuilding origin and the date taken recorded in the manifest (research D-14)
- [ ] T027 [P] Vendor a hand-trimmed DDY carrying a literal `N` in a numeric field, and a hand-trimmed DDY with no `DB=>MWB` cooling day, into `tests/fixtures/weather/`, each with what was cut recorded in `trimmed`
- [ ] T028 [P] Vendor a real run's trimmed `eplusout.eso`, `.mtr`, `.rdd` and `eplustbl.htm` into `tests/fixtures/run/`, so `readings.js`, `bill.js` and `tm59.js` are checkable in the `fast` tier with no engine
- [ ] T029 Write the fast-tier check in `tests/fast/fixtures.test.js` asserting no fixture carries TM59 table content, by comparing against `src/tm59.data.js`'s generated values — FR-041 enforced by a check rather than by care

**Checkpoint**: `npm run verify` runs, refuses cleanly where a tier is unstaged, and reports an
empty pass. Every story below can now start.

---

## Phase 3: User Story 1 — Know a change is sound before opening the page (Priority: P1) 🎯 MVP

**Goal**: one documented command, three tiers with budgets, a tier that refuses rather than
skips, and static analysis inside the same verdict.

**Independent Test**: on a fresh clone with setup done, `npm run verify` exits `0`; break one
recorded invariant and it exits `1` naming that invariant; `rm -rf public/energyplus && npm run
verify:engine` exits `2` naming what is missing and how to stage it.

- [ ] T030 [US1] Wire the `fast` tier glob in `scripts/verify.mjs` to run `npm run lint` and `npm run format:check` **inside** the tier, so a finding or an unformatted file lands in the same verdict as every other check (FR-033)
- [ ] T031 [US1] Implement tier refusal in `scripts/verify.mjs`: a failed probe prints the two-line message of [contracts/runner.md](./contracts/runner.md) on stderr, runs no check in that tier, reports nothing as passing, and makes the overall verdict `fail` with exit `2` (FR-004)
- [ ] T032 [US1] Implement budget measurement and exit `3` in `scripts/verify.mjs`, writing the elapsed time into the verdict whether or not the budget held, so a budget is watched rather than discovered (FR-002, SC-005)
- [ ] T033 [P] [US1] Write `tests/fast/no-skips.test.js`: no `test.skip`, `it.skip`, `t.skip()`, `describe.skip` or `only` appears anywhere under `tests/`, since there is no status meaning "passed, with checks skipped" (SC-011, FR-024)
- [ ] T034 [P] [US1] Write `tests/fast/style-rules.test.js`: every rule set to `'off'` or `0` in `eslint.config.js`, and every `eslint-disable` comment under `src/`, carries a reason beside it (FR-034, SC-017)
- [ ] T035 [P] [US1] Write `tests/fast/dependencies.test.js`: `package.json`'s `dependencies` holds only `@idfkit/*` entries and is unchanged by this feature (FR-040, SC-014)
- [ ] T036 [P] [US1] Write `tests/fast/no-network.test.js`: the `nonet.js` dispatcher throws for a request, naming the host, and is installed by every tier including the engine child (FR-005)
- [ ] T037 [US1] Record the measured `fast` / `model` / `engine` elapsed times against their budgets in [quickstart.md](./quickstart.md)'s expected output block (SC-005)

**Checkpoint**: US1 is complete and demonstrable on its own — scenarios 1, 3 and 4 of
[quickstart.md](./quickstart.md) pass, with the suite still holding few domain checks.

---

## Phase 4: User Story 2 — Every recorded invariant fails loudly when broken (Priority: P1)

**Goal**: all twenty-six invariants enforced by a named executing check carrying its reasoning,
the register and the checks agreeing in both directions, and a declared mutation proving each.

**Independent Test**: `npm run verify:proof` applies twenty-six declared mutations, each turning
its tier red and each failure naming the invariant whose mutation it was; a mutation that turns
the suite red through another check is reported **unproved**.

### The discovery pass and the correspondence checks

- [ ] T038 [US2] Implement the static discovery pass in `tests/support/register.js`: walk `tests/**/*.test.js` and `eslint-rules/*.js`, collecting every string literal passed as `covers()`' first argument and every `meta.docs.invariant` on a custom rule ([contracts/registry.md](./contracts/registry.md))
- [ ] T039 [US2] Write `tests/fast/register.test.js` asserting the four-way bijection: every non-`unexecutable` `Invariant` is claimed at least once; every claimed id resolves to a declared `Invariant`, `Gate`, `Expectation` or `Refusal`; every `unexecutable` entry carries a reason and is claimed by nothing; every `Gate` is claimed or is `'human'` with a reason (FR-006, FR-008)
- [ ] T040 [P] [US2] Write `tests/fast/one-statement.test.js`: no file in the repository carries a heading matching "Invariants that fail quietly", and no document restates one of the rules in its own words — keeping the section deleted is a check, because a habit of thirteen features grows it back one bullet at a time (FR-030a, SC-020)
- [ ] T041 [P] [US2] Extend the discovery pass with the comment assertion in `tests/fast/register.test.js`: a comment node immediately precedes every `covers()` call claiming an `INV-` id, and every custom rule enforcing one carries `meta.docs.description` (FR-030, SC-019)
- [ ] T042 [P] [US2] Write `tests/fast/gates.test.js`: each `Gate.quote` corresponds one-to-one with the numbered gate's opening sentence in `.specify/memory/constitution.md`, so amending a gate's wording without revisiting its check is a failure (FR-008)

### The checks, invariant by invariant — model and document rules

- [ ] T043 [US2] `tests/model/geometry.test.js` — `INV-north-axis-ignored`: `Building.north_axis` stays at its ignored value and orientation appears in the turned vertices; a compass word measured against a fixed axis fails
- [ ] T044 [US2] `tests/model/geometry.test.js` — `INV-coincident-vertices`: no shade or rooflight is written that `COINCIDENT` / `builds()` in `src/aperture.js` says would not build, at the ratio's first stop
- [ ] T045 [P] [US2] `tests/model/schedules.test.js` — `INV-schedule-until-two-fields`: every `Schedule:Compact` writes `Until: 08:00` and its value as two fields, and a `For: Holidays` row precedes `AllOtherDays`
- [ ] T046 [P] [US2] `tests/model/run-period.test.js` — `INV-runperiod-start-day-empty`: `RunPeriod.day_of_week_for_start_day` is empty and no leap `begin_year` is reachable from the declaration
- [ ] T047 [P] [US2] `tests/model/run-period.test.js` — `INV-fifth-weekday-holiday`: the holiday grammar is closed at four weekdays and "last", and a fifth is refused rather than written
- [ ] T048 [P] [US2] `tests/model/weather.test.js` — `INV-weather-special-days`: `use_weather_file_holidays_and_special_days` is `No` wherever `RunPeriodControl:SpecialDays` is written, and holidays are counted as a set of days
- [ ] T049 [P] [US2] `tests/model/weather.test.js` — `INV-tmyx-no-holidays`: a TMYx fixture yields no holidays and no daylight saving, and nothing in the model assumes otherwise
- [ ] T050 [P] [US2] `tests/model/weather.test.js` — `INV-ddy-literal-n`: the vendored DDY carrying a literal `N` is read without a number being inferred, every field the schema types numeric being checked with `schema.field(type, name).t === 'n'`
- [ ] T051 [P] [US2] `tests/model/weather.test.js` — `INV-design-days-ordered`: the vendored DDY with no `DB=>MWB` is handled by `DESIGN_DAYS`' ordered list at fixed 1% / 99% severity, no monthly day is taken as annual, and the design day actually used is the one lettered
- [ ] T052 [P] [US2] `tests/model/fields.test.js` — `INV-field-names-drift`: every field name the appliers write is confirmed present in the loaded `26.1.0` schema rather than trusted
- [ ] T053 [P] [US2] `tests/model/system.test.js` — `INV-thermostat-control-match`: the control type number and its `Control 1` object agree, and all three setpoint types are cleared on each apply
- [ ] T054 [P] [US2] `tests/model/system.test.js` — `INV-setpoint-order`: `System`'s `requires` blocks a heating setpoint above the cooling one, strict, with equal permitted, and a study or survey row sweeping a control that takes its own channel out refuses that position through `sampleRefusal`
- [ ] T055 [P] [US2] `tests/model/system.test.js` — `INV-economizer-flow-limit`: an economizer is never written without a cooling flow limit, and a shading device is never written onto glass that is not the layered construction

### The checks — declarations, lettering and the survey

- [ ] T056 [P] [US2] `tests/fast/declarations.test.js` — `INV-kinds-declared`: `assertKinds` throws naming the declaration that asked for a kind outside `KINDS`, and `assertReachable` throws for a `Ruled` step that cannot reach a round IP figure, both asserted as checks so a broken declaration fails a run rather than only a page load (FR-015)
- [ ] T057 [P] [US2] `tests/fast/survey.test.js` — `INV-interval-advances-cursor`: `levelsFor` in `src/survey.js` returns `[]` for a span of a few ULPs, so an interval chosen off a measured range always advances the cursor
- [ ] T058 [US2] `tests/fast/lettering.test.js` — `INV-temperature-difference`: a delta lettered in IP carries no 32, asserted over every schedule declaring a `deltaKind`
- [ ] T059 [US2] `tests/fast/lettering.test.js` — `INV-span-is-a-difference`: `Ruled.spanKind` / `spanUnitNow` letter a face's remaining room through `deltaKindOf` at a flat precision, never through `quantityKind` or `precisionFor`
- [ ] T060 [US2] `tests/fast/lettering.test.js` — `INV-reading-change-is-a-difference`: `Reading.change` letters a difference and `Reading.format` a value, `deltaKindOf` is asked of every reading rather than only of temperatures, and E-02's trade sentence uses the first
- [ ] T061 [US2] `tests/fast/lettering.test.js` — `INV-suffix-not-unit`: `format(v).endsWith(unitNow)` holds across all 87 faces in **both** systems, asked through `suffixIn` rather than `unitIn`, since in SI alone the two agree by accident

### The checks — the structural five and the stylesheet

- [ ] T062 [P] [US2] Write `eslint-rules/frame-flag-inside-raf.js` claiming `INV-hidden-tab-starves-raf`, with the invariant id in its message and the reasoning in `meta.docs.description` (research D-10)
- [ ] T063 [P] [US2] Write `eslint-rules/lettered-cache-keys-system.js` claiming `INV-lettered-cache-keys-system`, over `chooserDrawn` and `noteCache` and any new cache whose value is lettered
- [ ] T064 [P] [US2] Write `eslint-rules/no-relletter-geometry.js` claiming `INV-aria-label-is-a-reading`: the one re-letter path never calls `applyGeometry`, which is where studies in flight are cancelled
- [ ] T065 [P] [US2] Write `eslint-rules/difference-not-format.js` claiming `INV-reading-change-is-a-difference`: a subtraction lettered through `Reading.format` is the trap's third route
- [ ] T066 [P] [US2] Write `eslint-rules/no-dataset-assign.js` claiming `INV-dataset-getter-only`
- [ ] T067 [P] [US2] Write `eslint-rules/no-labels-in-issue-url.js` claiming `INV-no-labels-in-issue-url`, including the 5,500-character bound where `handoff()` builds the address
- [ ] T068 [P] [US2] Write `eslint-rules/no-per-surface-output.js` claiming `INV-no-per-surface-output`, forbidding a `*` key on a new `Output:Variable` (Principle VI)
- [ ] T069 [P] [US2] Write `eslint-rules/suffix-not-unit-apart-from-figure.js` claiming `INV-suffix-not-unit`, for a unit lettered apart from its figure — an axis name, a unit column, `stopOf`'s strip
- [ ] T070 [US2] Register all eight custom rules in `eslint.config.js` as errors, each with the reasoning that justifies it, so a finding surfaces far from the suite and still carries the reader back to the check (FR-025)
- [ ] T071 [P] [US2] Write `tests/fast/stylesheet.test.js` — `INV-hidden-twin`: parse the stylesheet in `index.html` and assert any class that sets or unsets `display` and is toggled by `hidden` has its own `[hidden]` twin, since `all: unset` defeats the attribute and no shim implements the cascade faithfully enough to decide it (research D-10)
- [ ] T072 [US2] Write `tests/fast/console.test.js` — `INV-aria-label-is-a-reading`: under `jsdom`, `mountConsole` builds the Study buttons' `aria-label`s and `reletter()` replays `studySweeps`, so a label that letters a figure is re-lettered on a unit switch (research D-05)
- [ ] T073 [US2] Write `tests/fast/cache.test.js` — `INV-lettered-cache-keys-system`: the behavioural half, where a cache's key is reachable outside `src/main.js`, asserting that cached lettering is not reused across a system change (FR-013)

### Proving each check, and the record

- [ ] T074 [US2] Write the frozen `Mutation` type in `tests/mutations/index.js` — `invariant`, `file`, `find`, `replace`, `expect: 'fails'` — validating that `find` occurs **exactly once** in the file, a stale declaration failing by name rather than silently (research D-11)
- [ ] T075 [US2] Declare one `Mutation` per invariant in `tests/mutations/`, each the breakage the bullet describes, read from the bullet as its check is written
- [ ] T076 [US2] Write `scripts/proof.mjs` driving `verify:proof`: copy the checkout to a scratch directory, apply one mutation, run the tier owning that invariant's check, assert the run **fails and its output names that invariant's id**, restore, next — a red verdict through an unrelated check is reported **unproved**, not passed (FR-007, SC-003)
- [ ] T077 [US2] Write `scripts/coverage-record.mjs` producing the record from the register, the discovery pass and the last proof run: rows of identifier, evidence class and tier, the five `structural` rows named with their reason, the two unexecutable Principle VII claims with theirs, the proof date, and the line coverage figure compared with nothing — printed, written to the CI summary, **not committed** (data-model.md, FR-031)
- [ ] T078 [US2] Record the two Principle VII claims — readable at 390 px, nothing on hover — as unexecutable with their reasons in `tests/gates.js`, so neither is quietly counted as covered (research D-13, SC-002)

**Checkpoint**: all twenty-six invariants fail loudly and provably; `npm run verify:proof`
prints 26/26.

---

## Phase 5: User Story 3 — Verify the building, not just the code (Priority: P1)

**Goal**: every representative position is a valid, runnable building, and physics moves the way
physics moves.

**Independent Test**: `npm run verify:model && npm run verify:engine` on a machine with no
EnergyPlus installed — nineteen positions validated, the simulated eleven run to completion, no
fatal, no "requested but not generated", every output name confirmed against the `.rdd`, and
every expectation inside its band.

- [ ] T079 [US3] Write `tests/model/validate.test.js`: every one of the nineteen positions, including those never simulated, validates against the loaded `26.1.0` bundle and passes the integrity check before any simulation is attempted, the failure naming the position and the object (FR-016, SC-008)
- [ ] T080 [US3] Write `tests/engine/runs.test.js`: each `simulated` position runs to completion through `runEnergyPlus`, and `eplusout.err` carries no `** Fatal **` (FR-017)
- [ ] T081 [US3] Extend `tests/engine/runs.test.js`: `eplusout.err` carries no `requested but not generated`, the recorded practice made automatic (FR-017, SC-008)
- [ ] T082 [US3] Write `tests/engine/rdd.test.js`: every `Output:Variable` in each written document is confirmed present in that run's `eplusout.rdd`, the count of unconfirmed requested variables printed as `0` (FR-018, SC-009)
- [ ] T083 [P] [US3] Write `tests/engine/isolation.test.js`: two different models run in succession and the second's `.eso` is the second model's — the failure mode is not a crash but a silent grading of one model against another's results (FR-021)
- [ ] T084 [US3] Write the frozen `Expectation` type in `tests/engine/expectations.js` — `id`, `channel`, `from`, `move`, `reading`, `direction`, `band`, `because` — validating the band positive and ordered, `because` non-empty, and refusing a `prices: true` channel, since no run changes when a priced face moves (research D-12)
- [ ] T085 [US3] Implement `expects(id)` in `tests/engine/expectations.js`: runs the basis and the moved position as **two children**, reads the named reading through the real `readings.js`, asserts direction and band, and on failure prints the basis value, the moved value, the fractional change, the band and the `because` sentence
- [ ] T086 [US3] Declare sixteen `Expectation`s in `tests/engine/expectations.js`, one per channel that reaches the model — the eighteen less `plant` and `tariff` — each with its physical reasoning (FR-019, SC-010)
- [ ] T087 [US3] Write `tests/engine/expectations.test.js` running every declared expectation through `covers()` so each failure names the expectation before it names an assertion
- [ ] T088 [US3] Write the frozen `Refusal` type and `refuses(id)` in `tests/engine/refusals.js` — `setup`, `refusedBy` (`requires` / `throw` / `engine`), `naming` — a scenario failing for a different reason being a failure of the suite, which is what stops `'engine'` degenerating into "something went wrong" (FR-020)
- [ ] T089 [US3] Declare the refusal scenarios in `tests/engine/refusals.js`: `sealed`'s warmup convergence failure (`engine`), a heating setpoint above the cooling one (`requires`), a station whose `DB=>MWB` cannot be read (`throw`), and a rooflight band that would not build (`requires`)
- [ ] T090 [US3] Write `tests/engine/refusals.test.js` asserting each refusal happens at its declared place and its message contains the declared `naming` substring, so physics asserted as physics is a pass, not a broken suite (FR-020)
- [ ] T091 [P] [US3] Write `tests/engine/readings.test.js`: series read through the real `readings.js` over the real `.eso`, meters through the real `bill.js` over the real `.mtr` requested **Monthly** so `meterName()` recovers what `parseMTR` mis-parses, and a check that parsed either itself is the thing this forbids (FR-014, [contracts/engine.md](./contracts/engine.md))
- [ ] T092 [P] [US3] Write `tests/engine/window-performance.test.js`: U-factor and SHGC read from `eplustbl.htm` by **column head**, from the `WINDOW_CONSTRUCTION` row, never the area-weighted "Total or Average" row, with empty assembly cells read as no frame rather than zero
- [ ] T093 [P] [US3] Write `tests/fast/readings-over-fixtures.test.js`: `readings.js`, `bill.js` and `tm59.js` over the vendored `tests/fixtures/run/` outputs, so the reading path is covered in the 60 s tier with no engine
- [ ] T094 [US3] Write `tests/fast/refusal-paths.test.js`: each refusal path throws naming the specific thing that was missing, the caller refuses the whole operation, and no previous value, default or nearest match is substituted (FR-014, Principle IV)

**Checkpoint**: the engine tier passes on a runner with no EnergyPlus installed — SC-007
demonstrated rather than claimed.

---

## Phase 6: User Story 4 — The document the engine gets does not drift (Priority: P2)

**Goal**: the three byte-identity claims, determinism, and nineteen goldens whose change is a
reviewable diff.

**Independent Test**: `npm run verify:model` — idempotence at every position, `shrunk`
byte-identical to `built-small`, lean-then-sheet identical to always-sheet, every position
matching its golden; change an applier and the failure is a unified diff of the IDF.

- [ ] T095 [US4] Write `tests/model/idempotence.test.js`: `applyModel` applied three times over one document at every position, `text` identical after each application (FR-009, gate 2)
- [ ] T096 [P] [US4] Write `tests/model/shrink.test.js`: `shrunk` compared against `built-small` — identical means the appliers swept every possible name and no orphan survived (FR-009, `SKY_MAX` / `PANE_MAX`)
- [ ] T097 [P] [US4] Write `tests/model/reporting-identity.test.js`: reporting set lean, applied, set full, applied, compared against full throughout — what `syncReporting`'s clear-and-rewrite exists for and what the sweep restore depends on (FR-009)
- [ ] T098 [US4] Write `tests/model/determinism.test.js`: every position built under `TZ=UTC`/`LC_ALL=C` and again in a fresh process under `TZ=Pacific/Kiritimati` with a non-English locale, compared byte for byte — the first executing statement of Principle II's clause (FR-010)
- [ ] T099 [US4] Generate the nineteen goldens into `tests/goldens/` under `UPDATE_GOLDENS=1` and commit them as real, loadable `.idf` files a reviewer can hand to EnergyPlus (research D-07)
- [ ] T100 [US4] Write `tests/model/goldens.test.js` calling `matchesGolden` for every position, and assert in `tests/fast/goldens-guard.test.js` that `UPDATE_GOLDENS=1` is refused when `CI` is set (FR-022)

**Checkpoint**: an intended change to what the model writes shows as a reviewable diff, and
accepting it is a deliberate act.

---

## Phase 7: User Story 5 — The link and the lettering are exercised exhaustively (Priority: P2)

**Goal**: every control key round-tripped, every malformed class refused whole, every face
lettered in both systems.

**Independent Test**: `npm run verify:fast -- --test-name-pattern='codec|lettering'` — every
declared key at its extremes and interior stops for all nine kinds, every malformed class
refused, the migration chain resolving, and every face's `format(v).endsWith(unitNow)` holding
in both systems.

- [ ] T101 [US5] Write `tests/fast/codec.test.js`: every declared control key encoded into a link and decoded back to the value encoded, at both extremes and several interior stops, for all nine kinds including those carrying canonical text (`Days`, `Pattern`) (FR-011)
- [ ] T102 [US5] Extend `tests/fast/codec.test.js` with every class of malformed input — a non-numeric value for a numeric kind, an unknown key, a reserved key out of place, a value outside the range, text that will not re-serialise canonically — each refused **whole** with a stated reason and no partial state adopted (FR-011, Principle IV)
- [ ] T103 [P] [US5] Write `tests/fast/link-versions.test.js`: every frozen version in `DEFAULTS_BY_VERSION` resolves through the `MIGRATIONS` chain to the values that version's defaults imply, the empty `v1` chain asserted anyway (FR-011)
- [ ] T104 [P] [US5] Write `tests/fast/link-encoding.test.js`: `patching()` round-trips through `schemeHash`, and only `*`, `.`, `-`, `_` are relied on to survive `URLSearchParams` unescaped
- [ ] T105 [US5] Extend `tests/fast/lettering.test.js` to enumerate all 87 faces in both systems, asserting each converting kind's SI spelling equals the declaration's own and that an identity kind letters through `letter`'s `unit` override — the whole of the guarantee that the SI sheet comes back character for character (FR-012)
- [ ] T106 [P] [US5] Write `tests/fast/kinds.test.js`: every member of `KINDS` lettered in both systems, with a difference check wherever `deltaKindOf` returns a different kind, and the four control-kind gates (`buildControl` draws it, `readValue` above the numeric regex, key ownership, `assertHideable`) asserted for every declared kind (FR-026)
- [ ] T107 [P] [US5] Write `tests/fast/copy.test.js`: every always-visible declaration string is inside its `Budget` in `src/copy.js`, its `asserted: false` members listed rather than checked

**Checkpoint**: a change to a range, a key, a unit kind or a step is caught combinatorially
rather than by a contributor's imagination.

---

## Phase 8: User Story 6 — The check runs itself, on every change (Priority: P1)

**Goal**: a verdict on every proposed change, before review, produced by the project.

**Independent Test**: open a pull request breaking a recorded invariant and confirm
`verify-fast` and `verify-full` report the failure before a human looks at it.

- [ ] T108 [US6] Add the `verify-fast` job to `.github/workflows/check.yml` beside `consumer-register`: `npm ci && npm run verify:fast`, on `pull_request` and `push` to `main` (FR-023)
- [ ] T109 [US6] Add the `verify-full` job to `.github/workflows/check.yml`: `npm ci && npm run predev && npm run verify:model && npm run verify:engine` on a runner with no EnergyPlus installed, which is how SC-007 is demonstrated rather than asserted
- [ ] T110 [US6] Write the coverage record and the TAP reporter output into the job summary in `.github/workflows/check.yml`, with no threshold flag and no job failing on the figure (FR-031, SC-018)
- [ ] T111 [P] [US6] Write `.github/workflows/proof.yml` running `npm run verify:proof` on a weekly schedule and on `workflow_dispatch`, writing its dated table into the job summary (research D-11)

**Checkpoint**: US6 complete — every proposed change carries a verdict before review.

---

## Phase 9: User Story 7 — A contributor knows where a new check goes (Priority: P3)

**Goal**: the suite tells a contributor what a new declaration owes it, by enumeration rather
than by memory.

**Independent Test**: add a control to `src/controls.js` and run `npm run verify:fast` — a
failure naming the new key and what it owes; add an `Invariant` with no check and get a failure
naming the id nothing claims.

- [ ] T112 [US7] Write `tests/fast/enumeration.test.js` covering `CHANNELS`: every channel has a `DeskPosition` covering it and, unless `prices: true`, an `Expectation` ([contracts/registry.md](./contracts/registry.md), FR-026)
- [ ] T113 [US7] Extend `tests/fast/enumeration.test.js`: every control key is claimed by a codec round trip and, for a `Ruled` face, by a lettering check in both systems; every `KINDS` member by a lettering check
- [ ] T114 [P] [US7] Extend `tests/fast/enumeration.test.js`: `readLandmarks`' four rules — inside the range, non-overlapping, reachable on the step grid, readable at a `zero` stop — asserted over every landmark list as a check rather than only at page load (FR-015)
- [ ] T115 [P] [US7] Write `tests/fast/schemes.test.js`: every `PRESETS` entry and its `Target`s carry a conformance check, `UNTOUCHABLE` channels are asserted, and `TM59_SPACES` equals `PROFILE_IDS`
- [ ] T116 [P] [US7] Write `tests/fast/tour.test.js`: `NOTES` covers every step `src/tour.js` declares, and the storage key changed when a step's meaning did — gate 6 made executable
- [ ] T117 [US7] Add the "Where a new check goes" table from [quickstart.md](./quickstart.md) to `CLAUDE.md`, stating for each kind of addition which checks it acquires and where they belong (FR-027)
- [ ] T118 [US7] Record in `CLAUDE.md` the practice that a bug fixed after this feature carries a check which fails before the fix and passes after it (FR-028, SC-013)

**Checkpoint**: adding to the suite is an obvious, small act rather than a research project.

---

## Phase 10: Governance, documentation and the style change

**Purpose**: bring the governing documents into agreement in the same change, then land the
sweep as its own reviewable diff

**⚠️ Ordering**: T121 is the **last commit of the suite's change**. The section is the
specification of this work and is read bullet by bullet as each check is written; deleting it
first would throw away the specification while the work was still being done.

- [ ] T119 Amend `.specify/memory/constitution.md` `1.0.1 → 1.1.0`: retire the Development Workflow section's opening "There is no test runner and no linter", restate the ten gates with the tier that executes each, name the verification tooling in Principle V's exemption sentence beside Vite and the AWS SDK, and add an amendment block to the Sync Impact Report in the existing style (FR-029)
- [ ] T120 Retire "There is no test runner and no linter" from `CLAUDE.md` and `docs/design-notes.md`, replacing each "Verifying changes" section with a pointer to [quickstart.md](./quickstart.md)'s commands (FR-029)
- [ ] T121 Delete `CLAUDE.md`'s "Invariants that fail quietly" section **in the last commit of this change**, every bullet's reasoning having been carried into the comment beside the check that now enforces it — deleted, not summarised, since a summary is the second statement in miniature (FR-029, FR-030a, SC-020)
- [ ] T122 [P] Record in `docs/design-notes.md` the follow-up that would upgrade the five `structural` rows to `executed` — moving `renderSurveySoon`, `renderPullSoon`, `noteCache`, `chooserDrawn` and `reletterSheet` into a DOM-free module — as work deliberately not done here (research D-04)
- [ ] T123 [P] Record in `docs/design-notes.md` what D-09's reversal cost: with the prose gone there is no list for the suite to diff itself against, so nobody can record an invariant without enforcing it and equally nobody is told they have failed to record one
- [ ] T124 **Separate change**: adopt the stock rule set in `eslint.config.js` — each rule chosen against this project's recorded failure classes, each rule turned off carrying its reason beside it (FR-034, FR-035)
- [ ] T125 **Separate change**: run `npm run format` over the repository as the final commit of that same pull request, so the configuration is reviewed before the 1.8 MB diff rather than inside it (FR-035)
- [ ] T126 **Separate change**: prove the sweep moved nothing — `npm run verify:model` passes and `git diff --stat main -- tests/goldens/` is empty, the suite proving this about itself (FR-036, SC-016)
- [ ] T127 Run all fifteen validation scenarios in [quickstart.md](./quickstart.md) and record the measured elapsed times and the ten consecutive identical verdicts (SC-005, SC-012)
- [ ] T128 **Hand-off, not a file here**: mark `verify-fast` and `verify-full` as required checks in branch protection, listed rather than claimed (research D-15)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP on its own
- **US2 (Phase 4)**: depends on Foundational. Independent of US3–US7
- **US3 (Phase 5)**: depends on Foundational (T017–T023 in particular)
- **US4 (Phase 6)**: depends on Foundational (T020, T021)
- **US5 (Phase 7)**: depends on Foundational (T013)
- **US6 (Phase 8)**: depends on at least one tier existing; in practice run after US1
- **US7 (Phase 9)**: depends on US2's discovery pass (T038) and on US3's `Expectation`s (T086) for the channel enumeration
- **Phase 10**: T119–T123 depend on US2 being complete; T121 is last in that change; T124–T126 are a separate pull request that depends on the suite existing, because T126 is how the sweep is proved

### Within each story

- Declarations before the checks that read them (`Invariant` before the bijection; `Expectation` before `expects`)
- `buildDocument` before anything comparing bytes
- The goldens (T099) after every applier-facing check, so a golden is never generated from a document a check would have rejected
- A custom lint rule before it is registered in `eslint.config.js` (T070)

### Parallel Opportunities

- Setup: T003–T007 all in parallel
- Foundational: the three groups — register/rosters (T013–T016), document (T017–T021), engine and fixtures (T022–T029) — are independent of each other; within them every `[P]` task is a different file
- US2's invariant checks: T043–T057 and T062–T071 are each a different file or a different rule; T058–T061 share `tests/fast/lettering.test.js` and are sequential, as are T105 in US5
- US3: T083, T091, T092, T093 in parallel once T023 lands
- Once Foundational completes, US1, US2, US3, US4 and US5 can proceed in parallel by different people

---

## Parallel Example: Phase 2 Foundational

```bash
# The three independent groups, in parallel:
Task: "Write tests/support/register.js exporting covers(id, name, fn)"           # T013
Task: "Write tests/support/schema.js loading localBundle('26.1.0') once"         # T017
Task: "Write tests/support/eplus-child.mjs with one callMain and exit"           # T022

# Fixtures, all different files:
Task: "Vendor one complete TMYx EPW and its DDY into tests/fixtures/weather/"    # T026
Task: "Vendor the trimmed DDY with a literal N and the one with no DB=>MWB"      # T027
Task: "Vendor a real run's trimmed .eso, .mtr, .rdd and eplustbl.htm"            # T028
```

## Parallel Example: US2's custom rules

```bash
Task: "eslint-rules/frame-flag-inside-raf.js claiming INV-hidden-tab-starves-raf"    # T062
Task: "eslint-rules/lettered-cache-keys-system.js claiming its invariant"            # T063
Task: "eslint-rules/no-dataset-assign.js claiming INV-dataset-getter-only"           # T066
Task: "eslint-rules/no-per-surface-output.js claiming INV-no-per-surface-output"     # T068
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 — one command, three tiers, a refusal that names its remedy, lint inside the verdict
3. **Stop and validate**: quickstart scenarios 1, 3 and 4
4. At this point a contributor already has a trustworthy "did I break the build" command; every
   later phase adds what it knows about

### Incremental delivery

1. Setup + Foundational → the runner exists
2. US1 → one command, one verdict (MVP)
3. US2 → the twenty-six invariants fail loudly and provably
4. US3 → the building is verified, not just the code
5. US4 → the document stops drifting
6. US5 → the link and the lettering are exhaustive
7. US6 → the verdict arrives before review
8. US7 → the suite tells a contributor what it is owed
9. Phase 10 → the governing documents agree, then the sweep lands as its own change

### The one fixed ordering constraint

`CLAUDE.md`'s "Invariants that fail quietly" section is the input to Phase 4 and is deleted at
the end of it (T121). Every check in T043–T073 is written with its bullet open, and the bullet's
reasoning — the measurement, the error message, what it cost — becomes the comment above
`covers()`. A comment that instead narrates what the assertion does is the second statement of
the rule in the one place nothing can catch it (FR-030).

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Every check is declared through `covers(id, name, fn)` with a **string literal** id, or the
  static discovery pass cannot see it
- No `skip`, no `only`, no quarantine anywhere — their presence is itself a fast-tier failure
  (SC-011). A check that cannot be made reliable is removed together with the claim it made,
  and the removal is recorded
- No mocked engine, no mocked schema, no stubbed `applyModel`, no network, and no per-surface
  output variable added for the suite's convenience
- The plan places `eslint.config.js` in the style change; the eight **custom** rules land with
  the suite (T062–T070), because five invariants are enforced by them and the register would
  otherwise declare a rule nothing claims. What Phase 10 defers is the stock rule set and the
  mechanical sweep — the diff nobody could justify without its configuration reviewed first
- Commit after each task or logical group; stop at any checkpoint to validate a story
  independently
