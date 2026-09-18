# Implementation Plan: An executing verification suite for the model

**Branch**: `claude/hopeful-cori-8mkbvu` (feature `013-domain-test-suite`) | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-domain-test-suite/spec.md`

## Summary

Give this repository a test runner, and point it at what the repository already knows.
`CLAUDE.md` carries twenty-six invariants and the constitution carries ten gates; both are
prose, and prose does not fail. This feature turns them into checks that do — organised
around the domain (a document, an engine, a reading) rather than around the file layout, run
against the real `26.1.0` schema and the real WebAssembly engine, in three tiers with stated
budgets, on every change.

Three decisions carry most of the design:

- **The runner is `node:test`** (research D-01). Process isolation per file, snapshots,
  coverage and reporting are already in the platform, and the one property this domain most
  needs — that a second EnergyPlus run can never be graded against the first run's output —
  is the runner's default rather than something to configure.
- **The prose stays the single statement of each rule** (research D-09). `tests/invariants.js`
  declares one entry per bullet and quotes its opening clause verbatim; a check asserts a
  bijection against `CLAUDE.md`. Adding a bullet, deleting one, rewording one or deleting a
  declaration each turn the suite red. The register indexes the prose; it does not copy it,
  because a copy is the second source of truth Principle III forbids.
- **`src/main.js` cannot be imported, and that is a design input, not an obstacle**
  (research D-04). It boots the page on import and awaits a schema over HTTP. Five of the
  twenty-six invariants have their subject there; all five are *structural* claims, so they
  are enforced by custom lint rules over the syntax tree — and the coverage record says
  `structural`, not `executed`, for each of them.

Nothing in this feature reaches the published page. No run-time dependency is added, no IDF
object, no link key, no `Output:*`, no solve. Four dev dependencies arrive — `eslint`,
`prettier`, `eslint-config-prettier`, `jsdom` — under the exemption Principle V already
grants build tooling.

The constitution is amended in the same change, as the spec requires: its Development
Workflow section opens *"There is no test runner and no linter"*, and both halves stop being
true here. That is a MINOR bump under the document's own versioning policy.

## Technical Context

**Language/Version**: vanilla ES modules (ES2022), no transpiler. Node 22 LTS for the suite
(22.22.2 measured here); the runner's flags used are all present in it

**Primary Dependencies**: **no run-time dependency added** — `dependencies` stays the four
`@idfkit/*` pins and is asserted to (FR-040, SC-014). Dev: `eslint` 9 (flat config),
`prettier`, `eslint-config-prettier`, `jsdom`. The schema comes from the existing
`@idfkit/schemas` through its `node` entry, and the engine from the existing
`@idfkit/engine-assets` staging — neither is a new dependency

**Testing**: `node:test` + `node:assert/strict`, three tiers plus a proof tier.
`--experimental-test-isolation=process` (the default), `--experimental-test-coverage`,
`--test-reporter`, `--test-name-pattern`. Goldens are real `.idf` files compared byte for
byte, regenerated under `UPDATE_GOLDENS=1`. See [contracts/runner.md](./contracts/runner.md)

**Target Platform**: the suite runs under Node on a contributor's machine and on a GitHub
runner with no EnergyPlus installed. What it verifies is the static site the reader loads

**Project Type**: single-page client-side application, `src/*.js` + `index.html`; the suite
is a sibling tree, `tests/`, that reaches no reader

**Performance Goals**: `fast` 60 s, `model` 5 min, `engine` 15 min (SC-005). A tier over its
budget exits `3` and is treated as a defect in the suite, not as a slow machine (FR-002).
Engine cost is dominated by WebAssembly start-up per child, not by the ~50 ms design-day
solve; children are pooled at `availableParallelism()` capped at 6, the same cap `pool.js`
puts on the study pool

**Constraints**: no network from any check, enforced by a throwing dispatcher rather than by
intention (FR-005); no mocked engine and no mocked schema; no `skip` anywhere, and its
presence is itself a failure (SC-011); no coverage threshold (FR-031); fixtures may not carry
purchased TM59 content (FR-041); `UPDATE_GOLDENS=1` refused in CI

**Scale/Scope**: 18 channels (`00`–`17`, twelve of them bypassable, two priced); 129 control
declarations across 9 kinds; 87 lettering faces in two unit systems; 26 recorded invariants;
10 constitutional gates; 1 link version (`v1`) with an empty `MIGRATIONS` whose chain is
asserted anyway; 19 representative desk positions, 11 of them simulated; ≥16 physical
expectations. Source under check: ~1.8 MB across 33 modules

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. No violations; the
Complexity Tracking table below is empty.*

| Principle | How this feature stands against it |
| --- | --- |
| I. Everything runs in the browser | The suite is development tooling and reaches no reader. It runs the same WebAssembly engine the browser runs, under Node, which is what makes SC-007 a demonstration rather than a claim. No service, no endpoint, no upload. **Pass** |
| II. Deterministic and shareable | Not merely unharmed — **asserted**. FR-010's determinism check builds every position twice under different time zones and locales and compares bytes, which is the first executing statement of the principle's "wall-clock time, locale … MUST NOT reach the document". `LINK_VERSION` untouched; nothing added to the link. **Pass** |
| III. Read it back off the model | The design's central move. Goldens are the real serialisation; readings come through the real `readings.js` and `bill.js` over real `.eso`/`.mtr`; U-factor comes from `eplustbl.htm` by column head. And the register *indexes* `CLAUDE.md` rather than restating it, so the rule keeps exactly one statement (FR-030). **Pass** |
| IV. No silent fallbacks | An unstaged tier is refused whole, with the reason and the remedy, exit `2` (FR-004). `skip` is not used and its presence fails. A refusal scenario must refuse *for its stated reason*. **Pass** |
| V. Only `@idfkit/*` at runtime | `dependencies` is unchanged and a check asserts it holds only `@idfkit/*` (SC-014). Four dev dependencies are added under the exemption the principle grants build and deployment tooling; `node:test` was chosen over a framework precisely because the principle prefers platform APIs to packages. **Pass** |
| VI. Latency is the interface | No engine run, output variable or `shapeKey` change reaches the page. The suite gains a lint rule enforcing the principle's own clause that new outputs stay zone- or site-level, and the engine tier is forbidden from adding a per-surface variable for its own convenience. **Pass** |
| VII. Mobile-first and responsive | Two of its claims — readable at 390 px, nothing on hover — are recorded as **unexecutable with reasons** (research D-13) rather than faked. The rest of the interface invariants are covered. **Pass** |

### The gates, restated as checks

The constitution's Development Workflow section is what this feature contradicts, and
amending it is in scope (FR-029). The amendment keeps all ten gates and restates each as
something the suite executes:

| Gate | Becomes | Tier |
| --- | --- | --- |
| 1. Model changes verified outside the browser first | every representative position written, validated and run | `model` + `engine` |
| 2. Idempotence, and a shrunk desk serialising identically | the three byte-identity checks (FR-009) | `model` |
| 3. Every IDF validated and run; names confirmed against `.rdd`; `.err` grepped | FR-016–FR-018 | `model` + `engine` |
| 4. Codec changes round-tripped, every malformed class refused | FR-011 | `fast` |
| 5. Declaration invariants throw at module load | FR-015 — asserted as checks, so a broken declaration fails a run rather than only a page load | `fast` |
| 6. The general notes are part of done | a check that `NOTES` covers every step the tour declares and that the storage key changed when a step's meaning did | `fast` |
| 7. The page is then driven | **remains a human act.** A machine can drive the model; it cannot look at the sheet | — |
| 8. Interface changes go through the design system | **remains a human act**, with one executable half: a new token or layout threshold present in the stylesheet and absent from `.interface-design/system.md` fails | `fast` (partial) |
| 9. Comments explain why, not what | **remains a human act.** A linter can count comments and cannot read them; the rule is about content | — |
| 10. Prefer typed objects | partially executable, and the suite's own declarations are the first instance — every type in [data-model.md](./data-model.md) is a frozen class validating in its constructor | `fast` (partial) |

Three gates stay human acts, each with its reason recorded in the coverage record. That is
FR-008 honoured rather than evaded: eight of ten are executed, and the two-and-a-bit that
are not say why.

**Amendment**: `1.0.1 → 1.1.0` (MINOR — guidance materially expanded). The section's opening
sentence is retired, the ten gates are restated with the tier that executes each, and
Principle V's exemption sentence names the verification tooling beside Vite and the AWS SDK.
The Sync Impact Report comment at the head of the file gains an amendment block in the
existing style. `CLAUDE.md` and `docs/design-notes.md` lose "There is no test runner and no
linter" and their "Verifying changes" sections become a pointer to
[quickstart.md](./quickstart.md)'s commands — in the same change, per FR-029.

## Project Structure

### Documentation (this feature)

```text
specs/013-domain-test-suite/
├── plan.md              # This file
├── research.md          # Phase 0 output — fifteen decisions
├── data-model.md        # Phase 1 output — the suite's own declarations
├── quickstart.md        # Phase 1 output — setup and fifteen validation scenarios
├── contracts/
│   ├── runner.md        # commands, exit statuses, tier refusal, CI
│   ├── registry.md      # covers(), the bijection against the prose, the coverage record
│   └── engine.md        # buildDocument, goldens, one process per simulation, reading a run back
├── checklists/
│   └── requirements.md  # written by /speckit-checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
tests/
├── invariants.js            # one Invariant per CLAUDE.md bullet; quotes it, never restates it
├── gates.js                 # one Gate per numbered constitutional gate
├── support/
│   ├── register.js          # covers(); the static discovery pass
│   ├── tiers.js             # tier declarations, budgets, prerequisite probes
│   ├── staging.js           # the probes and their remedy sentences
│   ├── desk.js              # DeskPosition declarations; buildDocument()
│   ├── schema.js            # localBundle('26.1.0'), once per process, version asserted
│   ├── golden.js            # byte comparison, unified diff, UPDATE_GOLDENS
│   ├── engine.js            # runEnergyPlus(): one child per run, pooled
│   ├── eplus-child.mjs      # the child: noInitialRun, one callMain, exit
│   ├── dom.js               # jsdom globals, then dynamic import
│   └── nonet.js             # the dispatcher that throws on any request
├── fixtures/
│   ├── manifest.js          # origin, licence and what was trimmed, per fixture
│   ├── weather/             # one TMYx EPW.gz + DDY; a DDY with a literal N; a DDY with no DB=>MWB
│   └── run/                 # recorded .eso, .mtr, .rdd, eplustbl.htm from a real run
├── goldens/                 # 19 real .idf files, one per desk position
├── mutations/               # one declared breakage per invariant
├── fast/                    # declarations, codec, lettering, copy, readings-over-fixtures,
│                            #   console under jsdom, the register bijection, dependencies
├── model/                   # idempotence, shrink, reporting identity, determinism,
│                            #   schema validation, integrity, goldens
└── engine/                  # runs, .err, .rdd, expectations.js, refusals.js, isolation

eslint.config.js             # flat config; every disabled rule carries its reason beside it
eslint-rules/                # the custom rules, each naming the invariant it enforces
.prettierrc.json
.prettierignore              # src/rates.data.js, src/tm59.data.js — generated, not authored

.github/workflows/
├── check.yml                # + verify-fast, + verify-full beside consumer-register
└── proof.yml                # the mutation proof, weekly and on dispatch

package.json                 # + verify, verify:fast, verify:model, verify:engine,
                             #   verify:proof, lint, format, format:check
.specify/memory/constitution.md   # amended, 1.0.1 -> 1.1.0
CLAUDE.md, docs/design-notes.md   # "no test runner and no linter" retired
```

**Structure Decision**: the existing single-project layout is kept; `tests/` is a sibling of
`src/` and imports it directly, with no build step between them — which is possible only
because every domain module is plain ES2022 with no `import.meta.env` at module scope. That
was measured rather than assumed: `import.meta.env` appears in `src/main.js`, `src/weather.js`
and a comment in `src/epw.js`, and nowhere else, so `model.js`, `controls.js`, `units.js`,
`permalink.js`, `readings.js`, `tm59.js`, `describe.js`, `survey.js`, `study.js`, `schemes.js`,
`bill.js`, `rates.js`, `copy.js` and `aperture.js` all import under plain Node today.
`console.js` does too — two exports, no top-level DOM access — and needs only a document to
call into, which is what `jsdom` is for. `main.js` is the one module that cannot, for the
reason in research D-04.

`tests/` rather than the gitignored `harness/`: the whole point of the feature is that what a
harness proved stops being thrown away. `harness/` stays ignored for genuinely throwaway work.

## Phase 0 — Research

Complete. See [research.md](./research.md). Fifteen decisions; no `NEEDS CLARIFICATION`
remains. The load-bearing ones beyond the three in the Summary:

- **Three tiers, not two** (D-02). The middle tier needs only `npm install`, because outside
  the browser the schema comes from `@idfkit/schemas/node` rather than from the staged copy —
  so every byte-identity claim the project makes is checkable on a clone that has staged
  nothing.
- **Goldens are real `.idf` files** (D-07). Node's snapshot mechanism was tried and its
  storage format measured; the wrapper it writes makes the golden unloadable, and in this
  domain a reviewer who doubts a diff should be able to hand the file to EnergyPlus.
- **One child process per simulation** (D-08), so the non-re-entrancy that leaves the previous
  ESO in place cannot silently grade one model against another's results.
- **ESLint over Biome** (D-06), decided by FR-034: the rules that matter here are custom, and
  custom rules are where the interface invariants are reachable at all.
- **A declared mutation per invariant** (D-11) is how FR-007 and SC-003 are met — and it is
  expensive, so it is its own tier, run on a schedule, with its last result dated in the
  coverage record. That cost is stated rather than hidden.

## Phase 1 — Design & Contracts

Complete.

- [data-model.md](./data-model.md) — `Invariant`, `Gate`, `DeskPosition`, `Mutation`,
  `Expectation`, `Refusal`, `Fixture`, `Tier`, `CoverageRecord`, `Verdict`, and the twenty
  representative desk positions.
- [contracts/runner.md](./contracts/runner.md) — the commands, the four exit statuses, how a
  tier refuses, the reporting shape a failure must have, and the two CI jobs.
- [contracts/registry.md](./contracts/registry.md) — `covers()`, the static discovery pass,
  the bijection against the prose and the constitution, and what the coverage record prints.
- [contracts/engine.md](./contracts/engine.md) — `buildDocument`, the three byte-identity
  claims, goldens, `runEnergyPlus`, and what a check is allowed to read back off a run.
- [quickstart.md](./quickstart.md) — setup, the one command, and fifteen validation scenarios
  mapped to the user stories, FRs and SCs.

**Constitution re-check after design**: unchanged, all seven principles pass. The design adds
no run-time dependency, no network path, no IDF field, no link key and no engine run on the
page. It adds four dev dependencies under an existing exemption, and it amends the one section
of the constitution the spec identified as contradicted.

### Sequencing

Three changes, in this order, for the reason FR-035 gives — neither review should bury the
other:

1. **The suite.** Runner, tiers, register, goldens, fixtures, checks, CI, the constitutional
   amendment and the documentation updates. Large, but every part of it is reviewable on its
   own terms.
2. **Style, adopted and enforced.** `eslint.config.js` with its reasons, the custom rules,
   `.prettierrc.json`, and `verify:fast` failing on a finding or an unformatted file — then
   the mechanical sweep as the final commit of that same pull request, so the configuration
   is reviewed before the 1.8 MB diff rather than inside it. The proof that the sweep moved
   nothing is that `tests/goldens/` is untouched by it, which the suite from change 1 checks
   automatically (FR-036, SC-016).
3. **Hand-off.** Marking `verify-fast` and `verify-full` as required checks is a branch
   protection setting, not a file here, and is listed as a hand-off rather than claimed.

This is the one place the plan reads FR-035 rather than following it literally: it asks that
the reformatting land as its own change, separate from the substantive work. It is separate
from the suite, and it is a commit of its own within the change that agrees the rules — because
a rule set landing without its sweep would leave `main` red, and a sweep landing without its
rule set would be a diff nobody could justify.

### Recorded for later, deliberately not done here

`src/main.js`'s five invariant subjects would all be behaviourally checkable if
`renderSurveySoon`, `renderPullSoon`, `noteCache`, `chooserDrawn` and `reletterSheet` moved
into a DOM-free module the way `readings.js`, `describe.js`, `tm59.js` and `units.js` already
have. That is a real improvement and a refactor of an 11,000-line module; it is noted in
`docs/design-notes.md` as the work that would upgrade five rows of the coverage record from
`structural` to `executed`, and it is not smuggled into this feature.

## Complexity Tracking

No Constitution Check violations. This table is intentionally empty.

Three judgement calls are recorded above rather than here, because none of them is a
principle being bent: five invariants covered structurally only (research D-04, stated as
`structural` in the coverage record), the proof tier not running on every change (research
D-11, its cost stated and its last result dated), and the sweep sharing a pull request with
the rule set that justifies it (sequencing, above).
