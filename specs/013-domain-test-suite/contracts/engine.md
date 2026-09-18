# Contract: building the document, and running it

**Feature**: `013-domain-test-suite`

The `model` and `engine` tiers' internal interfaces — how a desk position becomes a
document, how a document becomes a run, and what a check is allowed to read back. These
exist because the alternative is every check reconstructing the recipe from `CLAUDE.md`,
which is the throwaway harness again with a different name.

---

## `buildDocument(position)` — `tests/support/desk.js`

```js
const { doc, text } = await buildDocument('engaged-glazing')
```

- Loads the schema **once per process** from `@idfkit/schemas/node`'s `localBundle()`, with
  the full version string `load('26.1.0')`. The version is asserted, not assumed: field
  names drift between versions and a suite validating against the wrong one asserts the
  wrong document.
- Builds `params` as `DEFAULT_PARAMETERS` overlaid with `position.params`, and the patch bay
  from `position.patching`.
- Calls the real `applyModel` from `src/model.js`. No stand-in, no partial applier: the
  through-line the architecture describes is what is being checked.
- Returns the document and its serialisation. `text` is what the goldens hold and what every
  byte-identity claim compares.

**Never** reaches the network, the DOM or `src/main.js`.

## The byte-identity claims

Three checks in the `model` tier, each stated in the constitution's second gate:

| Check | What it does |
| --- | --- |
| **idempotence** (FR-009) | applies `applyModel` three times over one document; `text` after each application must be identical |
| **shrink** (FR-009) | builds `shrunk` — `full` with the sweeping channels reduced — and compares against `built-small`, built at that size from defaults; identical means no orphaned object survived the sweep |
| **reporting identity** (FR-009) | sets reporting lean, applies, sets it full, applies; compares against full throughout. This is what `syncReporting`'s clear-and-rewrite exists for, and what the sweep restore depends on |

And one the constitution implies and does not state (FR-010):

| **determinism** | builds each position under `TZ=UTC`/`LC_ALL=C` and again under `TZ=Pacific/Kiritimati` with a non-English locale, in a fresh process, and compares bytes. Principle II names wall-clock time, `Math.random`, locale, viewport and user agent as things that must not reach the document; this is the check that says so |

## Goldens

```js
await matchesGolden(position.id, text)
```

Compares against `tests/goldens/<id>.idf` byte for byte. On a difference it prints a unified
diff, at most 200 lines, and names the file. Under `UPDATE_GOLDENS=1` it writes instead of
comparing and prints what it wrote.

The golden is a real IDF. A reviewer who does not believe a diff can hand the file to
EnergyPlus, which is the point (research D-07).

**`UPDATE_GOLDENS=1` is refused in CI.** Accepting a new expected document is a deliberate
act by a person (FR-022), and a workflow that could regenerate them would make the goldens
prove nothing.

## Validation and integrity (FR-016)

Before any simulation, and for **every** position including the ones that are never
simulated:

1. schema validation against the loaded `26.1.0` bundle;
2. the integrity check.

A position that fails either never reaches the engine, and the failure names the position
and the object.

## `runEnergyPlus({ idf, epw, outDir })` — `tests/support/engine.js`

Forks `tests/support/eplus-child.mjs`, one child per run, and resolves with the paths of
`eplusout.err`, `.eso`, `.mtr`, `.rdd` and `eplustbl.htm`.

The child:

- sets `global.Module = { noInitialRun: true, locateFile }` pointing at
  `public/energyplus/`;
- `require`s `public/energyplus/energyplus.js`;
- calls `callMain(['-d', outDir, '-w', epw, idf])` **exactly once**;
- exits.

**One EnergyPlus per process, structurally.** `CLAUDE.md` records why: `main` is not
re-entrant, a second call throws a raw number before doing any work, and it leaves the
previous run's ESO in place — so the dangerous outcome is not a crash but a second model
silently graded against the first model's results. `node:test`'s per-file process isolation
would be enough if every file held one run; forking per run means no contributor has to know
that (FR-021).

The child runs with the same network-refusing dispatcher as its parent.

**Concurrency**: children are pooled at `os.availableParallelism()`, capped at 6 — the same
cap `pool.js` puts on the study pool, for the same reason.

## Reading a run back

| What | Read with | Why not otherwise |
| --- | --- | --- |
| fatals | `eplusout.err`, scanned for `** Fatal **` | the run "completing" is not the same as succeeding |
| unmet output requests | `eplusout.err`, scanned for `requested but not generated` | the recorded practice, made automatic |
| variable names (FR-018) | every `Output:Variable` in the document confirmed present in `eplusout.rdd` | confirms the spelling against the run rather than trusting what was written |
| series | the real `readings.js` over the real `.eso` | a check that parsed the ESO itself would be asserting its own parser |
| meters | the real `bill.js` over the real `.mtr`, requested **Monthly** | `parseMTR` mis-parses meter names and `meterName()` recovers them; a check must go through that path, not around it |
| U-factor and SHGC | `eplustbl.htm`, by **column head**, from the `WINDOW_CONSTRUCTION` row | never the area-weighted "Total or Average" row |

## Expectations and refusals

```js
await expects('glazing-south-raises-cooling')
await refuses('heating-above-cooling')
```

`expects` runs the basis and the moved position — two children, never one — reads the named
reading through the real `readings.js`, and asserts direction and band. A failure prints the
basis value, the moved value, the fractional change, the band, and the declaration's
`because`, so the person reading it is told the physical reasoning they are now doubting.

`refuses` asserts the refusal happens at the declared place and that its message contains
the declared `naming` substring. The three shapes:

- `requires` — the channel is not written and the strip states why; the check asks
  `Channel.requires.test` directly.
- `throw` — a refusal path throws naming what was missing (FR-014). The check asserts the
  message names it and that nothing was substituted.
- `engine` — the run fails, and `eplusout.err` carries the stated reason. The `sealed`
  position's warmup convergence failure is this shape: physics, asserted as physics, not
  reported as a broken suite (FR-020).

## What the suite must not do

- No mocked engine, no mocked schema, no stubbed `applyModel`. A substitute proves nothing
  about a building, which is the argument the whole feature rests on.
- No network. Climate data is vendored (research D-14).
- No per-surface output variable added for the suite's convenience. The measured cost is
  681 ms to 2,984 ms on one annual run, and a check that made the engine tier slow to watch
  the sheet more closely would be spending the wrong budget.
