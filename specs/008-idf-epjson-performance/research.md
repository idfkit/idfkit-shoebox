# Compact IDF and epJSON: what each is worth

**Question**: does writing the model as a compact `.idf` improve performance and
size, and does writing it as `.epJSON` improve on `.idf`? | **Date**: 2026-09-10

Everything below was measured on a warm engine, which is the only measurement
that describes this page: `engine.worker.js` holds one WASM instance across
every solve, and a first run costs about 1,100 ms against a steady 120 ms. Every
figure here discards the settling rounds and rotates the order the formats are
run in, for a reason recorded under "Two ways this was measured wrong first".

The harness is `verify/`, which needs `npm install` and the staged engine assets
(`npx idfkit-engine-assets public/energyplus && node scripts/copy-schemas.mjs`)
and nothing else. Measured under Node 22 on the container the session ran in, on
EnergyPlus 26.1.0 and `@idfkit/core` 0.3.0-rc.3. **The absolute numbers are that
machine's**: a design day there is 123 ms where the browser's is about 50 ms, so
read the ratios and the differences, not the totals.

## The short answer

| | Size | Live write cost | Engine cost | Safe to adopt |
| --- | --- | --- | --- | --- |
| **Compact IDF** | **5.1× smaller** | 0.30 ms cheaper | nothing measurable | **yes, byte-identical results** |
| **epJSON** | 1.8× smaller than commented IDF, 2.8× **larger** than compact IDF | 0.59 ms cheaper | ~1.3 ms of input processing, lost in the noise end to end | **no, it reorders the environments** |

Neither is a performance change. Both are a size change, and compact IDF is the
larger of the two.

## Size

Default desk, 106 objects, 30 types.

| Serialisation | Bytes | Gzip | Against commented IDF |
| --- | --- | --- | --- |
| `writeIdf(doc)` — what the page writes today | 22,022 | 3,114 | — |
| `writeIdf(doc, { comments: false })` | 6,387 | 1,609 | 3.4× smaller |
| `writeIdf(doc, { compressed: true })` | **4,299** | **1,499** | **5.1× smaller** |
| `writeEpJson(doc)` (indent 2) | 16,413 | 2,874 | 1.3× smaller |
| `writeEpJson(doc, { indent: 0 })` | 11,902 | 2,734 | 1.8× smaller |

The comments are three quarters of the text and about half of the gzip. epJSON
is not a compact format: it repeats every field *name* on every object, which is
exactly what the compressed IDF drops, and it is 2.8× the size of the compact
IDF both raw and gzipped.

At the biggest position the desk can reach (07, every channel engaged) the same
ratios hold: 51,118 / 11,600 / 29,287 bytes.

## The write, which is on the desk's own budget

`solve` calls `writeIdf(model)` on every re-solve and `buildSample` calls it once
per study sample, so the JS cost is part of the answer. Median of 60 writes after
20 warm-up writes:

| Serialisation | Median write |
| --- | --- |
| `writeIdf(doc)` | 0.804 ms |
| `writeIdf(doc, { comments: false })` | 0.447 ms |
| `writeIdf(doc, { compressed: true })` | 0.503 ms |
| `writeEpJson(doc, { indent: 0 })` | 0.056 ms |
| the same, with the enum repair below | 0.210 ms |

Real but small: 0.30 ms off a design-day solve, or about 6 ms off a 21-point
sweep. Worth having and worth nobody's redesign.

## Input processing, isolated

`--convert-only` reads the input, validates it against the schema, writes the
other format and exits before any environment runs. It is the only way this
engine offers to price the reader on its own. Thirty runs after five discarded:

| Serialisation | Median |
| --- | --- |
| commented IDF | 32.2 ms |
| IDF without comments | 32.0 ms |
| compact IDF | 31.6 ms |
| epJSON, indent 2 | 30.8 ms |
| epJSON, compact | 30.9 ms |

**Comments cost 0.6 ms and epJSON saves 1.3 ms**, against a floor of about 30 ms
that neither format touches — the engine parsing its own embedded 10 MB schema,
which is paid identically either way. That floor is the reason both answers are
"no": there is nothing here for a format to win.

### It is a floor, not a slope — measured

Padding the same document with K inert `Schedule:Constant` objects separates the
fixed part from the per-object part:

| Objects | commented IDF | compact IDF | epJSON |
| --- | --- | --- | --- |
| 106 | 35.9 ms | 35.9 ms | 34.1 ms |
| 606 | 43.5 ms | 42.7 ms | 36.8 ms |
| 2,106 | 64.9 ms | 63.4 ms | 46.1 ms |

Slope: **14.5 µs per object for IDF, 6.0 µs for epJSON.** The JSON reader is
about 2.4× cheaper per object, and comments are within noise of free — 342 KB of
commented text against 85 KB of compact costs 1.5 ms, or 5 ns a byte.

So the epJSON reader really is faster, and the shoebox is simply too small for it
to matter: 106 objects buys 1.3 ms. A model would need to be around **8,000
objects** before the reader difference reached the 20 ms that the AFN network
already spends out of the desk's live budget.

## End to end, warm

**Design day, no weather file.** Fifteen runs after four discarded, order rotated.

| Serialisation | min | median | max | engine's own elapsed |
| --- | --- | --- | --- | --- |
| commented IDF | 120.8 | 123.7 | 126.9 | 90 |
| IDF without comments | 119.4 | 125.5 | 132.6 | 90 |
| compact IDF | 120.6 | 124.4 | 128.8 | 90 |
| epJSON, indent 2 | 119.9 | 123.3 | 131.5 | 90 |
| epJSON, compact | 119.7 | **122.6** | 131.5 | 90 |

**Annual, Denver TMY3, 8,760 hours.** Ten runs after three discarded.

| Serialisation | min | median | max |
| --- | --- | --- | --- |
| commented IDF | 821.8 | 849.5 | 918.1 |
| compact IDF | 823.2 | **844.8** | 953.2 |
| epJSON, compact | 832.4 | 866.2 | 931.2 |

The whole spread across five formats on a design day is 2.9 ms, against a
run-to-run spread of 13 ms within a single format. On the year it is 21 ms
against a spread of 130 ms — and epJSON is nominally the *slowest* of the three,
which is noise rather than a finding, and is the shape of the answer: the format
is not what the clock is measuring.

## Compact IDF gives the same answer. epJSON does not.

Every position was run in all three serialisations and the ESO compared against
the commented IDF's byte for byte, as a sorted multiset of lines, and by the
order the environments came back in.

| Position | compact IDF | epJSON |
| --- | --- | --- |
| 01 default | exact | **reordered** |
| 02 fabric out | exact | **reordered** |
| 03 glazing out | exact | **reordered** |
| 04 system out | exact | **reordered** |
| 05 gains out | exact | **reordered** |
| 06 air out | exact | **reordered** |
| 07 everything in | exact | **differs** |
| 08 everything out | exact | **reordered** |

Compact IDF is byte-identical at all eight, with the same warning and severe
counts. That is the whole case for it: it is a smaller file and the same run.

### epJSON runs the environments in alphabetical order

The IDF states the heating design day first and the engine runs it first. The
epJSON carries the same two objects in the same order and the engine runs the
**cooling** day first, because `Ann Clg` sorts before `Ann Htg`.

Two explanations look identical from one measurement — the JSON object's key
order, or the engine sorting by object name — and `verify/order-mechanism.mjs`
tells them apart by writing the same model three ways:

| Input | Environments, in run order |
| --- | --- |
| compact IDF | **Htg** → Clg |
| epJSON, Htg key written first | Clg → Htg |
| epJSON, Clg key written first | Clg → Htg |
| epJSON, days renamed `AAA Winter` / `ZZZ Summer`, Clg key still first | **AAA Winter** → ZZZ Summer |

Key order changes nothing; the name decides. **The epJSON reader keys objects
into a sorted map, so a type whose order is significant loses it.** Confirmed
from the other side: `--convert-only` on the *IDF* emits an epJSON whose types
and objects are both alphabetical, so the sort is the engine's internal
representation and not something the JSON parser did on the way in — but only the
epJSON *input* path lets it reach the run.

What that costs this sheet, read against the code rather than guessed:

- The results schedule heads one column per environment in run order, and the
  plate draws them in that order, so the two design-day columns swap. Nothing is
  wrong; the drawing changes.
- `leadIndex` in `main.js` is chosen by the widest swing with index 0 only as the
  tie-break seed, so the balance rail's instant survives — **except** on a tie.
- `resolvePin`'s fallback at `main.js:3072` is `runs[0]`, which becomes a
  different environment.
- `RunPeriod`s are safe by luck: `applyRun` names them `Run Period 1` … `Run
  Period 6` and at most six, so alphabetical and calendar order agree. A seventh
  would sort `Run Period 10` between 1 and 2. Nothing today can write one.

Position 07 is marked "differs" rather than "reordered" for a reason worth
stating plainly: with the AFN network and the EMS program in the path, the two
runs agree to about fourteen significant figures and no further —
`232697.66140116588` against `...94` — because the iterative solver in the second
environment starts from what the first one left. It is float noise downstream of
the reordering, not a different building. It is still not a run you could compare
against an earlier one byte for byte, which is what the eight-position harness
exists to be able to do.

### And the enums have to be repaired first

*(Fixed upstream while this was being written — see the note at the end of this
section. Everything below describes `@idfkit/core` 0.3.0-rc.3, which is what
this page ships.)*

`writeEpJson(doc)` as it stands produces a document that **does not simulate**.
The IDF reader matches a choice field case-insensitively; the epJSON reader
matches the JSON Schema enum exactly and reports a severe for anything else:

```
** Severe  ** <root>[GlobalGeometryRules][GlobalGeometryRules 1][vertex_entry_direction]
              - "CounterClockWise" - Failed to match against any enum values.
** Severe  ** <root>[ScheduleTypeLimits][Control Type][numeric_type]
              - "DISCRETE" - Failed to match against any enum values.
** Severe  ** <root>[SizingPeriod:DesignDay][… Ann Clg 1% Condns DB=>MWB][humidity_condition_type]
              - "Wetbulb" - Failed to match against any enum values.
**  Fatal  ** Errors occurred on processing input file.
```

Seven values on the default desk, and none of them is the appliers' fault: they
are the spellings the stock `1ZoneUncontrolled.idf` uses and the spelling
`designConditionsFrom` carries out of onebuilding's DDY. Every figure above was
measured with `verify/normalise-enums.mjs` walking the schema's own enum lists
first, and the 0.15 ms that repair costs is included in the epJSON write time.

The count is seven today and is not a bound: it is a property of every string
that reaches a choice field from a file this page did not write, and a DDY from a
station nobody has picked yet can carry a new one. Under IDF that is invisible
and harmless; under epJSON it is a fatal at boot. Repairing it in the writer, not
at the call site, would be the fix — the rule is upstream's to state, since the
schema is where the canonical spelling lives.

**That is what upstream did.** idfkit/idfkit-js#60 canonicalises choice values
against the schema inside `IdfObject.toJSON()`, which is the writer and not the
call site, and leaves `writeIdf` alone. Verified here rather than taken on
trust, because that repository's CI has no EnergyPlus in it: built on the
branch, all eight positions were written with plain `writeEpJson` and no repair
and every one of them loaded with **0 severes**, against three severes and a
fatal on 0.3.0-rc.3. The output is byte-identical to what `normalise-enums.mjs`
in `verify/` produces, and `writeIdf` is byte-identical to 0.3.0-rc.3 across all
sixteen files. The harness here keeps its own repair anyway, since it has to run
against the version this page actually depends on.

## Two ways this was measured wrong first

Both produced confident, wrong numbers, and both are guarded against in the
harness rather than remembered.

**A fixed order hands one variant the previous run's mess.** The first pass put
the commented IDF at 1,050 ms against the compact IDF's 166 ms — a 6× win for
compaction that would have been a very satisfying answer. It was entirely an
artefact: the epJSON variant was fatalling on the unrepaired enums above, and the
commented IDF was the variant that always followed the fatal. With the enums
repaired and the order rotated, the same two land 1.3 ms apart. `run-formats.cjs`
rotates the order every round for this reason.

**`callMain` existing is not the engine being ready.** The emscripten glue
assigns it synchronously while the wasm is still compiling, so `FS.writeFile`
before `onRuntimeInitialized` throws `Cannot read properties of undefined
(reading 'buffer')` from inside the minified glue, which reads like a corrupt
asset and is nothing of the kind. The callback has to be on the `Module` object
*before* the glue is required. Worth noting against CLAUDE.md's own harness note,
which says EnergyPlus's `main` is not re-entrant and the require cache must be
cleared between runs: on these assets it is re-entrant, `engine.worker.js` has
always depended on that, and this harness ran 95 consecutive `callMain`s on one
instance with byte-identical output.

## Recommendation

**Change nothing in `src/`.**

The compact IDF is the tempting one and it does not survive the second question.
It is genuinely 5.1× smaller, genuinely byte-identical in result, and genuinely
0.30 ms cheaper to write — and then: who consumes that? Traced through, nobody.

- The **worker** takes the text through `postMessage`. 22 KB structured-cloned
  against a 50 ms design day is not measurable.
- The **run bundle** ships `model.idf` beside a `.epw`, which is about 1.5 MB.
  Saving 1.6 KB of the zipped IDF there is a rounding error on the download, and
  it is the one place the comments are doing work.
- A **study sample** carries `{ idf, epw, floorArea }`; the EPW dominates that
  too. Four sweeps in the queue is 1.8 MB of IDF against a 256 MB heap.
- Nothing **persists** it. A kept scheme stores a permalink fragment; the
  permalink carries parameters. Neither has ever held model text.

So the saving is real and it is spent nowhere, which on this sheet is the same
as not being a saving. `writeIdf(doc)` also happens to be the writer whose output
a person can read, and `model.idf` in the bundle exists precisely so a person can
read it: `bundle.js` holds "the text passed to `ep.run`, not a fresh `writeIdf`
that might have moved since", so switching the solve switches the bundle with it.
That is a real cost against a benefit with no consumer, and it is not a close
call.

The measurement is still worth having, for the thing it rules out. "The IDF is
bulky, let us compact it" and "epJSON is the modern format, it must parse faster"
are both reasonable-sounding and both wrong here, and the reason they are wrong —
a 30 ms schema floor that no format touches, and 106 objects being nowhere near
enough to pay for a faster reader — is the sort of thing that gets re-proposed
every year or so unless the number is written down.

**Two conditions would change the answer**, and both are worth naming so this can
be reopened rather than re-argued:

- **The model grows by an order of magnitude.** The slope is 14.5 µs per object
  for IDF and 6.0 for epJSON, so around 8,000 objects the reader difference
  reaches the 20 ms the AFN network already spends out of the live budget. Nothing
  the desk can currently draw comes close: the largest position is 106 objects.
- **`writeIdf` becomes the profile's top line.** It is 0.80 ms against a 50 ms
  design day today. If a future feature makes the live cadence much tighter, the
  0.35 ms that `comments: false` saves is there to be taken — and `comments:
  false`, not `compressed`, is the one to take, because it is 0.30 ms of the same
  0.35 and leaves every field on its own labelled line.

**Do not move to epJSON under any of those conditions either**, without first
dealing with the ordering. The reader is faster per object and would be the right
call for a big enough model, but it runs `SizingPeriod:DesignDay` in name order,
and the shipped names put the cooling day first. The results schedule's columns,
the plate's traces and `resolvePin`'s `runs[0]` fallback all read that order. The
fix, if it were ever wanted, is to name the design days so that alphabetical order
is the order intended — which is a strange thing to have to know, and is exactly
why it belongs written down rather than discovered.

**The `writeEpJson` enum fault is upstream's and is worth reporting whether or not
this page ever uses the format.** It was already known there as
idfkit/idfkit-js#10, framed as a casing divergence from the `ConvertInputFormat`
oracle and allowlisted in the conformance corpus' `known-divergence.toml`. What
was not known is the consequence, which is reported on that issue: the written
epJSON does not load, and `validateDocument` returns `isValid: true` on the way
past. The oracle is not a different convention here, it is the fix — EnergyPlus's
own converter emits `Counterclockwise` and `Discrete` from the same input.
