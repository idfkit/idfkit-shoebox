# Quickstart: running and trusting the verification suite

**Feature**: `013-domain-test-suite` | **Date**: 2026-09-18

A validation guide. It is written to be followed on a fresh clone by somebody who has not
read the rest of this directory, because SC-001 says that must take under fifteen minutes
and nobody can ask anyone.

---

## Setup

```bash
git clone https://github.com/idfkit/idfkit-shoebox
cd idfkit-shoebox
npm install            # the suite, the linter, the formatter, jsdom
npm run predev         # stages ~50 MB of engine assets, the schema bundle, the station index
```

`npm install` alone is enough for the `fast` and `model` tiers. `npm run predev` is what the
`engine` tier needs, and it is the same command the page already needs before it will load.
Nothing else is installed and no EnergyPlus is required: the engine the suite runs is the
WebAssembly build the reader's browser runs.

## The one command

```bash
npm run verify
```

One verdict, one exit status. Expect roughly:

```
fast     pass    412 checks    38 s   (budget 60 s)
model    pass    186 checks  2m41s   (budget 5 min)
engine   pass     74 checks 11m08s   (budget 15 min)

verify   pass
```

During work, the fast tier alone:

```bash
npm run verify:fast
```

---

## Validation scenarios

Each is runnable, each states what proves it, and each names the requirement it satisfies.

### 1. A green verdict on unmodified `main` — US1, SC-001

```bash
git checkout main && npm ci && npm run predev && npm run verify; echo "exit $?"
```

**Expected**: every tier passes, `exit 0`, and the whole of setup plus the run fits inside
fifteen minutes on a contributor's machine. Record the elapsed time; SC-005 wants it
measured rather than asserted.

### 2. A broken invariant turns it red, and names itself — US1, US2, FR-007, SC-003

```bash
npm run verify:proof
```

**Expected**: twenty-six mutations, each applied to a scratch copy, each turning its tier
red, each failure naming the invariant whose mutation it was. The run prints a table and
writes it into the coverage record. A mutation that turns the suite red through some other
check is reported **unproved**, not passed.

To watch one by hand — the units trap, the most expensive lesson in the list:

```bash
# in src/controls.js, letter a temperature delta through `temperature`
# rather than through the schedule's declared deltaKind
npm run verify:fast
```

**Expected**: a failure whose first line is
`INV-temperature-difference: …`, citing `CLAUDE.md § Invariants that fail quietly`, and
showing `+1 °C` lettering as `+33.8 °F`.

### 3. The fast tier is fast, and includes static analysis — US1, FR-033, SC-005

```bash
time npm run verify:fast
```

**Expected**: under 60 s, and a lint finding or an unformatted file appears in the same
verdict as every other check rather than as a separate thing to remember. Confirm by adding
`const unused = 1` to any module in `src/` and re-running: one verdict, one failure.

### 4. An unstaged tier refuses rather than skipping — US1, FR-004

```bash
rm -rf public/energyplus && npm run verify:engine; echo "exit $?"
```

**Expected**: `exit 2`, nothing reported as passing, and a message naming
`public/energyplus/energyplus.js` and `npm run predev`. Then `npm run verify` as a whole
reports `fail`, not "pass with notes".

### 5. Every representative position is a real, runnable building — US3, FR-016–FR-018, SC-008, SC-009

```bash
npm run verify:model && npm run verify:engine
```

**Expected**: nineteen positions written and validated against the real `26.1.0` bundle and
through the integrity check; the simulated subset run to completion; no fatal in any
`eplusout.err`; no `requested but not generated`; and every `Output:Variable` name confirmed
present in that run's `eplusout.rdd`. The count of unconfirmed requested variables printed
as `0`.

### 6. Physics moves the way physics moves — US3, FR-019, SC-010

```bash
npm run verify:engine -- --test-name-pattern='^EXP-'
```

**Expected**: at least one expectation per channel that reaches the model — sixteen — each
stating a direction, a band and the reasoning. Confirm the reasoning is there by breaking
one on purpose: change `direction` to `'down'` on the south-glazing expectation and re-run;
the failure prints the basis value, the moved value, the fractional change, the band, and
the `because` sentence.

### 7. A model meant to fail, fails for its own reason — US3, FR-020

```bash
npm run verify:engine -- --test-name-pattern='^REF-'
```

**Expected**: the nearly sealed box fails warmup convergence and that is a **pass**, because
the refusal is declared and its `eplusout.err` carries the stated reason. Change the stated
reason to something else and re-run: the scenario now fails, which is what stops
"something went wrong" counting as a refusal.

### 8. Two runs never share a result — US3, FR-021

```bash
npm run verify:engine -- --test-name-pattern='isolation'
```

**Expected**: a check that runs two different models and asserts the second's ESO is the
second model's. To see why it matters, make `runEnergyPlus` reuse a process and re-run: the
second model is graded against the first model's results and the check says so by name.

### 9. The document does not drift — US4, FR-009, FR-010, FR-022

```bash
npm run verify:model
```

**Expected**: idempotence over three applications at every position; `shrunk` byte-identical
to `built-small`; lean-then-sheet byte-identical to always-sheet; and every position matching
its golden. Then change an applier and re-run: the failure is a unified diff of the IDF.
Accept it deliberately:

```bash
UPDATE_GOLDENS=1 npm run verify:model
git diff tests/goldens/
```

**Expected**: the changed goldens are ordinary files in the diff, reviewed like any source
change. `UPDATE_GOLDENS=1` is refused inside CI.

### 10. Determinism against the clock and the locale — US4, FR-010

```bash
npm run verify:model -- --test-name-pattern='determinism'
```

**Expected**: each position built under `TZ=UTC`/`LC_ALL=C` and again under
`TZ=Pacific/Kiritimati` with a non-English locale, in fresh processes, byte-identical.

### 11. The link and the lettering, exhaustively — US5, FR-011–FR-013

```bash
npm run verify:fast -- --test-name-pattern='codec|lettering'
```

**Expected**: every declared control key round-tripped at its extremes and at several
interior stops, for all nine kinds including those carrying canonical text; every class of
malformed input refused whole; the migration chain resolving for every version in
`DEFAULTS_BY_VERSION`; every face lettered in both systems with `format(v).endsWith(unitNow)`
asserted through `suffixIn` rather than `unitIn`; and every difference — a temperature
change, a span along a face, a change in a reading — lettered as a difference.

### 12. The verdict is there before review — US6, FR-023, SC-006

Open a pull request that breaks a recorded invariant.

**Expected**: `verify-fast` and `verify-full` report on the change before a human looks at
it, and `verify-full` proves SC-007 by staging the engine on a runner with nothing
installed.

### 13. A new declaration is noticed — US7, FR-026

Add a control to `src/controls.js` and run `npm run verify:fast`.

**Expected**: a failure naming the new key and what it now owes the suite — a codec round
trip and, for a `Ruled` face, a lettering check in both systems. Add them and it goes green.
Add a 27th bullet to `CLAUDE.md`'s invariants section and re-run: a failure naming the bullet
no declaration claims.

### 14. The reformatting sweep moved nothing — FR-036, SC-016

On the branch that carries the sweep:

```bash
npm run verify:model
git diff --stat main -- tests/goldens/
```

**Expected**: `verify:model` passes, and the golden diff against `main` is **empty**. A
sweep that touches every file and no golden is a sweep that changed no byte of any document
the engine receives, which is the one reassurance worth having about that diff.

### 15. Nothing reached the reader — FR-040, SC-014

```bash
npm run verify:fast -- --test-name-pattern='dependencies'
git diff main -- package.json
```

**Expected**: a check asserting `dependencies` holds only `@idfkit/*`, and a diff in which
everything added is under `devDependencies`.

---

## Where a new check goes

| You added | It owes the suite | Where |
| --- | --- | --- |
| a control | a codec round trip; a lettering check in both systems if it is a `Ruled` face | `tests/fast/codec.test.js`, `tests/fast/lettering.test.js` — both enumerate, so usually nothing to write |
| a control kind | the four gates: `buildControl` draws it, `readValue` above the numeric regex, key ownership, `assertHideable` | `tests/fast/kinds.test.js` |
| a landmark | nothing — `readLandmarks`' four rules are enumerated | — |
| a channel | a `DeskPosition`, a golden, and an `Expectation` unless it is `prices: true` | `tests/support/desk.js`, `tests/engine/expectations.js` |
| an output variable | nothing — FR-018 confirms every one against the `.rdd` | — |
| a unit kind | nothing — `KINDS` is enumerated in both systems | — |
| an invariant to `CLAUDE.md` | an `Invariant` declaration, a check, and a `Mutation` | `tests/invariants.js`, its tier, `tests/mutations/` |
| a bug fix | a check that fails before the fix and passes after it | the tier that owns it (FR-028) |

The pattern in every row is the same: where the project already enumerates something, the
suite enumerates it too and there is nothing to remember. Where it does not, the suite tells
you what is missing by name.
