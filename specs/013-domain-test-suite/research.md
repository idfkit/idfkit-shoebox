# Phase 0 — Research: An executing verification suite for the model

**Feature**: `013-domain-test-suite` | **Date**: 2026-09-18

Fifteen decisions. Every `NEEDS CLARIFICATION` raised in the Technical Context is
resolved below; none remains open. Each decision records what was chosen, why, and what
was rejected — the house standard for a comment, applied to a design note.

---

## D-01 — The runner is `node:test`, not a framework

**Decision**: Node's built-in test runner (`node --test`, `node:test`, `node:assert/strict`)
on Node 22 LTS. No Vitest, no Jest, no Mocha.

**Rationale**: four properties this feature needs are already in the platform, measured on
the Node 22.22.2 this repository builds against:

- **Process isolation per test file is the default.** FR-021 asks that EnergyPlus's
  non-re-entrant entry point cannot cause one model to be graded against another's
  results. That is a scheduling property, and the runner already provides it
  (`--experimental-test-isolation=process`, the default). A framework that runs files in
  one worker would have to be fought.
- **Snapshots ship with it** (`t.assert.snapshot`, `--test-update-snapshots`), which is
  the "accepting a new expected document is a deliberate act" mechanism of FR-022 — though
  see D-07, where the mechanism is kept and the storage format is not.
- **Coverage ships with it** (`--experimental-test-coverage`, `--test-coverage-include`),
  which is all FR-031 asks for: a reported figure that blocks nothing.
- **`--test-reporter`, `--test-shard`, `--test-name-pattern`** cover the tier splitting and
  CI reporting without a plugin.

And one property the project's own constitution asks for: Principle V says platform APIs
are preferred to packages, and names `DecompressionStream`, `URLSearchParams` and inline
SVG as cases where that was chosen deliberately. A test runner is the same argument one
directory along.

**Alternatives rejected**:

- **Vitest** — the natural choice given Vite is already here, and genuinely better at one
  thing: it would transform `import.meta.env` so `src/main.js` could be imported. That
  turns out not to help (D-04: `main.js` boots on import and awaits a schema over HTTP, so
  it is unimportable for reasons a transform does not touch). Against that it brings a
  large dependency tree into a repository whose argument is that it has none, and it would
  need explicit configuration to get the per-file process isolation that `node:test` gives
  by default.
- **Jest** — needs transform configuration for plain ES modules, and its isolation model is
  worker-based rather than process-based.
- **A hand-rolled runner** — the throwaway harness, made permanent. Rejected because the
  reporting, filtering, sharding, coverage and snapshot machinery would all be written
  here for no gain, and because a suite nobody recognises is a suite nobody adds to (US7).

## D-02 — Three tiers, not two

**Decision**: `fast`, `model`, `engine`, with `npm run verify` running all three in that
order and reporting one verdict. FR-002's "fast tier" is `fast`; its "full tier" is
`model` + `engine`.

**Rationale**: the prerequisites genuinely come in three steps, and a tier is defined by
its prerequisites (FR-004):

| Tier | Needs | Budget | What it can reach |
| --- | --- | --- | --- |
| `fast` | `npm install` only | **60 s** (SC-005) | declarations, codec, units, copy budgets, readings over recorded fixtures, lint, format |
| `model` | `npm install` only, plus the schema from `@idfkit/schemas/node` | **5 min** | writing the document, idempotence, shrink, reporting identity, determinism, schema validation, integrity, goldens |
| `engine` | staged engine assets (`npm run predev`) and the vendored climate fixtures | **15 min** | real runs, `.err`, `.rdd`, `.eso`, `.mtr`, physical expectations, refusal scenarios |

The load-bearing discovery is that **`model` needs nothing staged**. `CLAUDE.md` records
that outside the browser the schema comes from `localBundle()` in `@idfkit/schemas/node`
with the full version string `load('26.1.0')` — a package entry point, not the copy
`copy-schemas.mjs` puts under `public/schemas/`. So every byte-identity claim the project
makes (FR-009, FR-010) can be checked on a clone that has only run `npm install`, which is
what makes a five-minute middle tier worth having rather than a fold of the engine tier.

`fast` is kept separate from `model` even so, because 60 s is a budget a contributor will
spend during work and a schema bundle load is not free. The split is by prerequisite for
`model`/`engine` and by budget for `fast`/`model`; both are stated, which is what FR-002
asks.

**Alternatives rejected**: two tiers exactly as FR-002 words them. Rejected because it
would put the goldens and the idempotence claims — the checks most likely to catch a
refactor, and the ones that need nothing staged — behind a fifteen-minute engine run, and
a contributor would stop running them.

## D-03 — What "unstaged" looks like, and how the refusal is worded

**Decision**: each tier declares its prerequisites as probes (`tests/support/staging.js`).
A tier whose probe fails **exits non-zero** with a message naming the missing thing and the
command that produces it. It does not skip, and `node --test`'s `skip` is not used anywhere
in this suite.

**Rationale**: FR-004 and Principle IV are the same rule. The failure mode being designed
against is specific and has a name in this repository — a pass reported for checks that did
not run. `node:test` offers `t.skip()` and it reports as a pass with a note; that is
precisely the shape FR-004 forbids, so it is not available (SC-011 counts its uses and the
count is zero).

The probe is a file-existence check with a stated remedy, e.g.:

```
engine tier refused: public/energyplus/energyplus.js is not staged.
Run `npm run predev` (or `npm run prebuild`), which stages the engine assets,
the schema bundle and the station index. All three are gitignored, so a fresh
clone must run one of them first.
```

**Alternatives rejected**: staging on demand from inside the suite. Rejected because it
hides a 50 MB copy inside what looks like a test run, and because the existing npm scripts
are the one place staging is described — a second one would be the second source of truth
Principle III forbids.

## D-04 — `src/main.js` cannot be imported, and that is a design input

**Decision**: the suite never imports `src/main.js`. Invariants whose subject lives there
are enforced by **custom lint rules over the syntax tree** (D-10), and this is stated
plainly in the coverage record rather than dressed up as a behavioural check.

**Rationale**: two independent blockers, both measured in the source:

1. `src/main.js:6886` is a **top-level `await`** that constructs a `SchemaBundle` over
   `httpSource(...)`. Importing the module boots the page and makes a network request,
   which FR-005 forbids outright.
2. It reads `import.meta.env.BASE_URL` at module scope (`src/main.js:6872`, `:7471`), which
   is Vite syntax and undefined under plain Node.

The second is removable by a transform; the first is not, short of restructuring an
11,000-line module, which is a refactor this feature has no mandate for.

Five of the twenty-six recorded invariants have their subject in `main.js`:
`renderSurveySoon` / `renderPullSoon` and the frame flag, `noteCache`, `chooserDrawn`,
`reletterSheet` never calling `applyGeometry`, and the trade sentence's use of
`Reading.change`. Each of the five is a **structural** claim — *the flag is cleared inside
the callback*, *the key carries `system()`*, *this function does not call that one* — which
is exactly what a syntax-tree rule can decide. That is a real answer rather than a
consolation: breaking the rule turns the suite red, which is FR-007's gate. What it is not
is a behavioural proof, and the coverage record says so for each of the five.

The half of each rule that *does* live in an importable module is checked behaviourally as
well, so the pair is stronger than either alone: `Reading.change` lettering a difference is
asserted against `src/survey.js` directly (D-09).

**Alternatives rejected**: a Node loader hook rewriting `import.meta.env` (does not address
the top-level await); importing through Vite's SSR transform (same); extracting the five
subjects into DOM-free modules (a good idea, and out of this feature's scope — recorded in
the plan as a follow-up rather than smuggled in).

## D-05 — `jsdom` for the handful of checks that need a document

**Decision**: `jsdom`, a dev dependency, installed by `tests/support/dom.js`, which sets the
globals and then `await import()`s the module under test. Node's per-file process isolation
means the globals cannot leak into a check that did not ask for them.

**Rationale**: `src/console.js` is importable under Node — it has two exports, no top-level
DOM access and no `import.meta.env` — and `mountConsole` is the entry that reaches
`buildControl`, the `studySweeps` registry and `reletter()`. Those are three of the four
gates the architecture names for adding a control kind, plus the `aria-label` invariant.
Calling them needs a document.

`jsdom` is chosen over the lighter shims for fidelity. SC-012 asks for identical verdicts
over ten consecutive runs; a DOM shim whose divergences produce an occasional false red
costs more than its install weight, and install weight is dev-only, which Principle V
exempts explicitly ("Build and deployment tooling is exempt").

**Alternatives rejected**: `happy-dom` and `linkedom` (lighter, less complete — reconsider
if `jsdom` ever costs measurable time in the 60 s budget); a real browser under Playwright
(the right tool for *rendered* claims, and this feature has none it can execute — the two
rendered claims are named unexecutable under D-13).

One thing `jsdom` is explicitly **not** used for: the `[hidden]` twin invariant is a CSS
cascade question (`all: unset` defeats the attribute), and no shim implements the cascade
faithfully enough to decide it. That one is a stylesheet check (D-10).

## D-06 — ESLint 9 flat config plus Prettier

**Decision**: `eslint` (flat config, `eslint.config.js`), `prettier`, and
`eslint-config-prettier` so the two do not argue. Three dev dependencies.

**Rationale**: FR-034 is the deciding requirement — *rules chosen against this project's own
recorded failure classes rather than adopted wholesale*. Several of the twenty-six
invariants are only reachable as custom rules (D-04, D-10), and ESLint is the only
mainstream option where writing one is a twenty-line function in a local plugin object
rather than a plugin ecosystem or an experimental query language.

Prettier settles presentation so it stops being reviewed by hand (FR-032). It does not
reflow comments, so the house style of long prose comments carrying the measurement that
forced a decision survives the sweep untouched — which was the live risk.

**Alternatives rejected**:

- **Biome** — genuinely attractive: one dev dependency instead of three, very fast, and its
  suppression syntax *requires* a reason, which would have made SC-017 free. Rejected
  because it has no stable custom-rule extension point, and custom rules are where this
  suite earns most of its interface coverage.
- **oxlint** — same speed argument, same missing extension point.
- **`eslint --fix` stylistic rules instead of Prettier** — leaves presentation arguable,
  which is the thing FR-032 wants ended.

## D-07 — Goldens are real `.idf` files, compared byte for byte

**Decision**: `tests/goldens/<position>.idf` holds the serialised document for each
representative desk position. Comparison is a byte-for-byte string equality with a unified
diff on failure. Regeneration is `UPDATE_GOLDENS=1 npm run verify:model`, and the changed
files land in the pull request diff like any other source change.

**Rationale**: FR-022 asks for two things — a readable diff, and accepting a new expected
document being deliberate and reviewable. A committed `.idf` gives both, and gives a third
the snapshot mechanism cannot: the golden is a *loadable model*. A reviewer who does not
believe a golden change can hand the file to EnergyPlus, which in a repository about
building energy simulation is the difference between reviewing a diff and reviewing a
building.

Node's snapshot mechanism was tried and its storage format measured. With an identity
serializer and a redirected path it writes the document out raw, but wrapped:

```
exports[`golden 1`] = `
Zone,
  Shoebox,
  0;
`;
```

The wrapper is small and the diff is readable, but the artefact is no longer an IDF. The
`--test-update-snapshots` flag is the part worth keeping, and `UPDATE_GOLDENS=1` is the same
deliberate act under a name that says what it updates.

**Alternatives rejected**: `t.assert.snapshot` with the default serializer (escapes every
newline into one line — unreadable as a diff and unusable as a model); a golden stored as a
hash (a hash tells a reviewer that something changed and nothing about what).

## D-08 — One child process per simulation

**Decision**: `tests/support/engine.js` exposes `runEnergyPlus({ idf, epw, outDir })`, which
forks `tests/support/eplus-child.mjs`, runs exactly one `callMain`, and exits. No process
ever calls `main` twice.

**Rationale**: `CLAUDE.md` records the failure precisely — *"`main` is not re-entrant: one
EnergyPlus per process, or clear the require cache between runs. A second call on one
instance throws a raw number before doing any work and leaves the previous ESO in place."*
The second clause is the dangerous one: the run appears to have produced output, and the
output belongs to the previous model. A suite that graded model B against model A's ESO
would report green while proving nothing, which is the exact failure class this feature
exists to end.

Per-file isolation from `node:test` (D-01) would be enough if every file held one run, but
that is a convention a contributor must remember, and US7 is about not relying on that. A
fork per run makes it structural, and it buys parallelism across cores within the engine
tier's budget.

The child is also where FR-005 is enforced: it runs with no network permitted and a
`locateFile` pointed at the staged assets, so a check that tried to fetch a climate file
would fail rather than succeed slowly.

## D-09 — The check is the statement; the register is a roster of identifiers

**Decision**: the twenty-six bullets under "Invariants that fail quietly" are **relocated
into the suite, not indexed from it**. Each becomes an executing check, the narrative that
justifies it becomes a comment beside that check, and the section is then deleted from
`CLAUDE.md` (FR-029, FR-030, FR-030a, SC-020).

`tests/invariants.js` survives, stripped to what a roster may hold without becoming a second
statement: an `id`, an `evidence` class, a `tier`, and a `reason` where the entry is
unexecutable. It carries **no `quote` and no `where`**, because there is no longer a document
to quote or point at. The spec settles this in as many words — the coverage record "is a
roster of identifiers, evidence classes and tiers — it holds no statement of any rule, so it
is not a second source of one."

**Rationale**: this decision is a reversal, and the reasoning that forced it is worth keeping.
The original D-09 had `tests/invariants.js` quote each bullet's opening clause verbatim and a
fast-tier check assert a bijection between register and prose. That defends against drift
between two artifacts — but a mechanism whose job is to keep two statements of one rule in
agreement is a *synchroniser between two sources*, which is not what Principle III asks for.
Principle III asks for one source. The original decision had considered only whether to
*restate* the rules in the register's own words (correctly rejected); it never considered
**moving** them, which is the option that actually satisfies the principle.

So the bijection does not weaken — it **moves one artifact along**. What it now runs between
is the register and the checks, which is the pair that can actually disagree:

| What somebody does | What the suite does |
| --- | --- |
| declares an invariant and writes no check | red: a declared id claimed by nothing (static discovery) |
| writes `covers('INV-typo')` | red: a claimed id no declaration resolves |
| deletes a check but leaves its declaration | red: as the first row |
| marks an entry unexecutable and also checks it | red: an unexecutable entry must be claimed by nothing |
| restores the prose section to `CLAUDE.md` | red: the section-absence check (below) |

Two defects in the original design dissolve on the way past, and neither was the reason for
the change but both confirm it:

- **"The opening clause" had no mechanical definition.** The bullets variously open with a
  code span, a bolded sentence, or plain prose. Any rule for extracting "the opening" would
  have been a heuristic over text a human writes freely.
- **Prettier formats Markdown by default.** The reformatting sweep of FR-035 could have
  rewritten the very text the bijection quoted, turning a cosmetic sweep red for reasons
  having nothing to do with any invariant.

**What is lost, and it is a real loss.** Without the prose there is no list for the suite to
diff itself against. Nobody can record an invariant without enforcing it — and equally,
nobody is told they have *failed* to record one. The guarantee becomes structural where it
applies and silent where it does not, which the spec records in Edge Cases rather than
smoothing over. The twenty-six are fixed at the count this feature inherits; a
twenty-seventh discovered later arrives as a check or does not arrive at all.

**The gates are deliberately not treated this way.** `Gate.quote` keeps its verbatim
sentence and its correspondence check against `.specify/memory/constitution.md`. The
asymmetry is the point: the constitution is ratified governance text amended by a stated
procedure, not a working note that may be relocated into a test file — and a gate is a rule
about *how the project works*, where an invariant is a rule about *how the software
behaves*. Only the second can be stated as an assertion, so only the second can be moved
into one.

**Two checks replace the one that died**, both fast-tier:

- **the section stays gone** — `CLAUDE.md` and `docs/design-notes.md` carry no heading
  matching `Invariants that fail quietly`, and no document under the repository restates one
  (FR-030a, SC-020). This is what stops the section growing back by habit.
- **every claiming check carries a comment** — the static discovery pass already parses
  `covers()` call sites to read their first argument, so it also asserts a comment node
  immediately precedes each call that claims an `INV-` id (FR-030, SC-019). Presence is
  decidable; whether a comment *justifies* the rule rather than *narrating the assertion* is
  not, and is recorded as a human act beside gate 9, which makes exactly the same distinction
  about exactly the same thing.

**Alternatives rejected**: keeping the prose and the bijection (the original decision — it
is a synchroniser between two sources, above); summarising the section into a shorter list
(a summary is the second statement in miniature, FR-029); anchors or tags appended to each
bullet (`{#inv-north-axis}`) — moot once the bullets are gone, and scaffolding in prose a
human reads while they existed.

## D-10 — Custom lint rules carry an invariant id

**Decision**: `eslint-rules/` holds one module per custom rule. Each rule's `meta.docs`
carries the invariant id it enforces, and its message repeats that id (FR-025) — a custom
rule is the one kind of check whose failure surfaces far from the suite, so the id is what
carries the reader back to the check that states the rule. `meta.docs.description` carries
the reasoning, which is where FR-030's comment lives for a rule rather than a test body. The
static discovery pass of D-09 counts a custom rule as a check like any other.

The rules this feature writes, and the invariant each answers:

| Rule | Invariant it enforces |
| --- | --- |
| `frame-flag-inside-raf` | a hidden tab starves `requestAnimationFrame` — the flag must be cleared inside the callback |
| `lettered-cache-keys-system` | a cache whose key cannot see the unit system |
| `no-relletter-geometry` | `reletterSheet` must never call `applyGeometry` |
| `difference-not-format` | a change in a reading is a difference — `Reading.change`, never `Reading.format`, on a subtraction |
| `no-dataset-assign` | `dataset` is getter-only |
| `no-labels-in-issue-url` | `labels=` in a new-issue address answers 404 |
| `no-per-surface-output` | per-surface output variables are ruinously expensive |
| `suffix-not-unit-apart-from-figure` | what a figure carries after it is not the kind's unit string |

Two further checks are static but not ESLint rules, because their subject is not JavaScript:

- **the `[hidden]` twin** — a parse of the stylesheet in `index.html`: any class that sets
  or unsets `display` and is toggled by `hidden` must have a `[hidden]` twin.
- **the new-issue address length** — asserted against 5,500 characters where `handoff()`
  builds it, which is JavaScript and so is an ESLint rule after all; the stylesheet one
  stands alone.

**Rationale**: a structural rule is weaker evidence than a behavioural one and stronger than
a sentence in a document. Where both are available, both are written; where only the
structural one is (D-04), the coverage record says which kind of evidence the invariant
has. FR-034's other half is honoured by a `reason` on every rule the project turns off, in
`eslint.config.js`, beside the rule (SC-017).

## D-11 — Proving the checks: a declared mutation per invariant

**Decision**: `tests/mutations/` declares, per invariant, a mutation that breaks it — a
file, an exact search string and its replacement. `npm run verify:proof` copies the
checkout to a scratch directory, applies one mutation, runs the tier that owns that
invariant's check, and asserts that the run **fails** and that the failure output **names
that invariant's id**. It restores and moves to the next. The run writes its result into
the coverage record.

**Rationale**: FR-007 and SC-003 do not ask that a check exists; they ask that breaking the
rule turns the suite red *for that rule*, demonstrated for all of them, and that the
demonstration is repeatable. A declared mutation is that demonstration written down. It
also catches the failure mode a coverage figure never will: a check that asserts something
adjacent to the rule and passes whatever the rule does.

The "names that invariant" half is what stops an incidental failure counting. A mutation
that breaks the north-axis rule and turns the suite red through an unrelated schema error
is reported as **unproved**, not as a pass.

**Cost and where it runs**: twenty-six mutations, each running a tier, is the most expensive
thing in this feature — hours, not minutes. It is therefore **its own tier**, run on demand
and on a schedule, never on every pull request, and its last result is recorded with its
date. That is an honest trade: FR-023 asks that the *suite* runs on every change, and
FR-007 asks that the proof is recorded so it can be repeated, not that it is repeated on
every push.

**Alternatives rejected**: a general mutation-testing tool (Stryker) — it mutates
indiscriminately and scores a percentage, which is the coverage-figure trap FR-031 warns
against, one level up. The twenty-six mutations here are hand-declared because each one is
the bug that actually happened.

## D-12 — Physical expectations are declarations, not assertions in prose

**Decision**: `tests/engine/expectations.js` declares each one as a frozen object:

```js
new Expectation({
  id: 'glazing-south-raises-cooling',
  channel: 'glazing',
  from: 'baseline',                       // a named desk position
  move: { southRatio: 0.6 },              // the overlay applied to it
  reading: 'cooling demand',
  direction: 'up',
  band: [0.10, 0.60],                     // fractional change, inclusive
  because:
    'A south wall at 15.24 m × 4.572 m gains far more through glass than through ' +
    'the opaque construction it replaces, and the box has no shading at baseline, ' +
    'so the extra transmitted solar lands as sensible cooling load within the hour.',
})
```

**Rationale**: FR-019 asks for a direction, a band and the reasoning together. The spec's
edge case *"engine output is not bit-stable across every platform"* is why the band is
fractional and generous rather than a figure copied off one machine — a band wide enough
to survive a platform difference and narrow enough that an eighty-fold error in a crack
coefficient falls outside it, which is the real bug this shape is designed to catch.

`because` is required by the constructor and is checked non-empty at load, in the same
spirit as `Budget` and `Landmark` — a declaration that throws at module load rather than an
expectation whose justification everyone assumes exists.

**Alternatives rejected**: absolute figures with a tolerance (fails on a legitimate engine
difference and gets widened until meaningless); asserting only the sign (passes an
eighty-fold error).

## D-13 — Which invariants are unexecutable, and why

**Decision**: two claims are recorded as unexecutable, with their reason, and are not
counted as covered. Both come from Principle VII rather than from the invariants list:

- **every reading is readable at 390 px** — a machine can measure a viewport and cannot
  judge "readable". A shim has no layout at all; a real browser has layout and no reader.
- **no reading exists only on hover** — partially decidable (a `title` attribute carrying a
  reading is findable) and not decidable in general, because the claim is about what a
  reader can reach rather than about which attribute was used.

All **twenty-six** invariants this feature inherits are executable, at least
structurally: five of them structurally only, for the reason in D-04. The coverage record
carries all twenty-eight rows — twenty-six invariants and the two gate claims — so the
difference between *executed*, *structurally executed* and *unexecutable* is visible in one
place, which is what SC-002 and FR-006 ask for.

## D-14 — Fixtures: what is vendored, what is staged, what is generated

**Decision**:

| Input | Where it comes from | Why |
| --- | --- | --- |
| EnergyPlus schema 26.1.0 | `@idfkit/schemas/node`, `localBundle()` | already a dependency; needs no staging |
| engine (`energyplus.js` + wasm) | staged by `npm run predev` | 50 MB, gitignored, already scripted |
| station index | staged by `npm run predev` | 1.7 MB, gitignored, already scripted |
| one complete TMYx EPW + its DDY | **vendored**, gzipped, `tests/fixtures/weather/` | FR-005: the page fetches these from `/onebuilding` at run time and the suite must not |
| a DDY carrying a literal `N` in a numeric field | **vendored**, hand-trimmed | the invariant needs an instance of the thing it warns about |
| a DDY with no `DB=>MWB` cooling day | **vendored**, hand-trimmed | FR-020's refusal scenario needs a station the model must refuse |
| recorded `.eso` / `.mtr` / `.rdd` / `eplustbl.htm` | **vendored**, from a real run, trimmed | lets `readings.js`, `bill.js` and `tm59.js` be checked in the `fast` tier with no engine |
| TM59 tables | `src/tm59.data.js`, already generated | FR-041: the purchased transcription never enters the repository, and a fixture must not become the back door |

**Rationale**: the split follows one rule — *vendor what the page would fetch, stage what the
build already stages, generate nothing new*. The gzipped EPW is about 400 KB, which is the
only material addition to the repository's size and is justified by FR-005: the alternative
is a check that is slow, flaky and dependent on an origin that sends no CORS header.

The trimmed DDY fixtures are the interesting ones. They exist because two recorded
invariants are about *malformed* input, and the only honest way to check the handling of a
literal `N` in a numeric field is to have a file containing one.

## D-15 — Where the suite runs, and what blocks

**Decision**: `.github/workflows/check.yml` gains two jobs beside the existing
`consumer-register` job: `verify-fast` and `verify-full`. Both run on `pull_request` and on
`push` to `main`. `verify-full` runs `npm run predev` to stage the engine, so it proves
SC-007 — a machine with no EnergyPlus installed runs the reader's own engine.

Coverage is produced by `verify-full` and written to the job summary. It is not compared
with a threshold and no job fails on it (FR-031, SC-018). The proof run (D-11) is a third
workflow on a schedule.

**Rationale**: FR-023 asks for a verdict before review; the repository already runs a check
workflow on every push and pull request, so this is an extension of existing machinery, as
the spec assumes. FR-024's "reported as blocking" is the ordinary meaning of a required
check — and the recorded practice that it is fixed or the change withdrawn goes into the
amended constitution, where the other nine gates live, rather than into a workflow comment.

**Note on the branch protection**: making the new jobs *required* is a repository setting,
not a file in this repository, and is listed in the plan as a hand-off step rather than
claimed as done by a change that cannot do it.
