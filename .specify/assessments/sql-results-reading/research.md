# Idea Research: Read results from the SQLite output instead of the ESO

- **Slug**: sql-results-reading
- **Created**: 2026-09-09
- **Evidence confidence (overall)**: high for everything measured under Node; **low for the browser**, which is where the app runs and where nothing here was measured

All timings are Chicago O'Hare TMY3 against the staged emscripten engine
(`public/energyplus/`, EnergyPlus 26.1) under Node 22.23.2 on this machine. The
harness is in `harness/` beside this file. [source: local measurement]
(confidence: high)

**Engine timings are warm, and that distinction decides several of the numbers
below.** `harness/run.cjs` solves one variant per process and so measures a
*first* `callMain` against a 29 MB binary with cold JIT: 419.6 ms for a design day
that settles at 84.2 ms, 1,150.1 ms for an annual that settles at 400.3 ms. It
overstated the absolute run by 3.5–5× and the SQLite delta by 1.6–3.5×, and on the
lean sweep sample it reversed the sign. `harness/warm.cjs` therefore boots the
engine once and interleaves the variants on that one instance, which is what the
app does — `engine.worker.js` loads the module once and calls `callMain` per run —
and discards pass 1. Figures below are medians of the warm passes, with the range
given. Read-side timings were always repeated in one process and need no such
correction.

## Users & Demand

- **The demand is one developer's expectation, not an observed complaint.** The
  intake is a pasted one-liner ("probably faster/more performant") with no run,
  no profile and no user report behind it. — [source: `intake.md`] (confidence: high)
- **Nothing in the repository records a results-reading slowdown.** `git log -i
  --grep=sql` returns one unrelated commit (the layered-window U-factor work).
  The performance notes that *are* written down in CLAUDE.md concern output
  *volume* (15 → 173 series took an annual run 681 → 2,984 ms) and the
  AirflowNetwork (3.1× on a year), neither of which is a parse cost. — [source:
  `git log`, `CLAUDE.md`] (confidence: high)
- **The parse is a small share of any run.** The desk's own stated figures are
  ~50 ms for a warm design day and ~0.7 s for an annual solve; measured warm here,
  84.2 ms and 400.3 ms under Node. The whole read — `parseESO` plus every reader the
  sheet calls — is **0.27 ms** against the design day and **35.7 ms** against the
  annual, so 0.3 % and 8.9 % of the solve it follows. — [source: local measurement,
  `harness/warm.cjs`, `dd-read.mjs`, `compare-read.mjs`] (confidence: high)

## Prior Art

- **`@idfkit/engine` already ships a SQLite reader, and the app's own worker
  already hands back the file.** `engine.worker.js` reads `/output/eplusout.sql`
  as binary and returns it as `result.sql` on every run; `index.d.ts` documents it
  as "Raw eplusout.sql bytes. Parse with `@idfkit/engine/sql`". The subpath
  export exists and carries a `SQLParser` with `findVariables`, `getTimeSeries`,
  `getTabularData`, `getReportNames` and raw `query` — `findVariables` and
  `getTimeSeries` being the exact two functions `src/readings.js` imports from the
  ESO side today. So the idea would be adopting an existing upstream reader, not
  writing one. — [source: `node_modules/@idfkit/engine/dist/engine.worker.js`,
  `dist/index.d.ts`, `dist/sql.d.ts`, `package.json` exports] (confidence: high)
- **That upstream reader queries tables EnergyPlus 26.1 does not write.**
  `dist/sql.js` names `ReportVariableDataDictionary` (4 occurrences) and
  `ReportVariableData`. A 26.1 `eplusout.sql` produced here contains
  `ReportDataDictionary`, `ReportData` and `ReportExtendedData`, and both legacy
  names are **absent** from `sqlite_master`. The reader would therefore find zero
  variables against this engine's output until it is fixed upstream. — [source:
  local measurement against `eplusout.sql`; `grep` of `dist/sql.js`] (confidence: high)
- **It defaults to fetching the sql.js runtime from `sql.js.org/dist/`.**
  `SqlJsConfig.locateFile` documents the public CDN as the default and
  `configureSqlJs` as the way to point it at your own origin. This page is static
  files behind CloudFront whose only deliberate third-party origin is the
  `/onebuilding` weather rewrite, so the runtime would have to be staged and
  pre-compressed like the engine and the schema. — [source:
  `node_modules/@idfkit/engine/dist/sql.d.ts`, `CLAUDE.md` "Deployment"]
  (confidence: high)
- **The codebase has already decided this question once, narrowly.**
  `src/readings.js:767` records, about the glazing U-factor and SHGC, that "the
  `.sql` holds them too and costs a further dependency to open", and chose to
  parse `eplustbl.htm` instead. That was a judgement about one reading; this idea
  is the same judgement across all of them. — [source: `src/readings.js:767`]
  (confidence: high)

## Market & Context

- **What the page copes with today works and is cheap.** `parseESO` is
  synchronous, dependency-free and runs inside the worker; `readings.js` is
  DOM-free and network-free, which is what lets the Node harnesses call the real
  readers. A WASM SQLite is async (`load(): Promise<void>`), which would make
  every reader on that path async or force a materialisation step. — [source:
  `dist/sql.d.ts`, `src/readings.js`, `CLAUDE.md`] (confidence: high)
- **The cost of doing nothing is, on these measurements, close to zero** for the
  live desk and the sheet, and about 6.6 ms per annual sweep sample. — [source:
  local measurement] (confidence: high)

## Data & Constraints

### Engine wall clock — adding `Output:SQLite` costs time, and switching the ESO off does not give it back

Warm medians, variants interleaved on one engine instance.

| Run | No SQLite | + SQLite | Delta |
|---|---|---|---|
| Annual, sheet profile | 400.3 ms (394–402) | 471.8 ms (461–495) | **+71.5 ms (+17.9 %)** |
| Annual, sheet, with `.eso`/`.mtr`/`.csv` switched off | — | 465.0 ms (452–478) | recovers **6.8 ms** of the 71.5 |
| Annual, lean profile (1 series), 12 passes | 321.1 ms (307–342) | 341.2 ms (324–364) | **+20.1 ms (+6.3 %)** |
| Design day, sheet profile, 8 passes | 84.2 ms (79–91) | 96.5 ms (93–117) | **+12.3 ms (+14.6 %)** |

The lean row is the one the cold harness got backwards: per-process it read
1,061.2 ms against 1,039.2 ms, making SQLite look 22 ms *cheaper*. Warm and
interleaved over twelve passes the ranges barely overlap and the sign is the
other way. [source: local measurement, `harness/warm.cjs`; superseding
`harness/run.cjs`] (confidence: high)

### File sizes — the SQLite file is always bigger, and on a design day it is not close

| Run | `.eso` | `.sql` |
|---|---|---|
| Annual, sheet | 1,918,010 B | 2,748,416 B (**+43 %**) |
| Annual, lean | 513,277 B | 667,648 B (**+30 %**) |
| Design day, sheet | 12,590 B | 471,040 B `SimpleAndTabular` / 184,320 B `Simple` (**15–37×**) |

The SQLite file carries a fixed schema plus `Surfaces`, `Materials`,
`Constructions`, `Zones`, `Nominal*` and `TabularData` whatever the run length, so
a 48-hour design day pays all of it for 48 hours of data. [source: local
measurement] (confidence: high)

### The read side — SQL wins only where one series is wanted out of a long run

| Run | Today (`parseESO` + readers) | SQLite (native `node:sqlite`) |
|---|---|---|
| Annual, sheet, all 13 series | 33.9 ms + ~1.8 ms = **35.7 ms** | **45.1 ms** for all series; 3.9 ms for one; 6.3 ms for one min/max |
| Annual, lean, 1 series | 7.02 + 0.52 = **7.54 ms** | **0.94 ms** pushed down; 2.44 ms pulled and reduced in JS |
| Design day, sheet | **0.267 ms** | **0.364 ms** min/max; 0.424 ms all 13 series |

[source: local measurement, `harness/compare-read.mjs`, `compare-lean.mjs`,
`dd-read.mjs`] (confidence: high — but native SQLite, see the gaps)

### The two routes agree exactly

`readExtremes` off the `.eso` gives `low -9.46789571510293`, `high
36.218574403279355`; the same min/max pushed into SQL returns the identical
doubles. Series coverage is identical too: 13 in the `.eso` dictionary and 13 in
`ReportDataDictionary`, same names, keys and frequencies. [source: local
measurement, `harness/compare-lean.mjs`, `coverage.mjs`] (confidence: high)

### The real post-run cost is the worker boundary, not the parse

The worker parses the `.eso` and structured-clones the **parsed object** to the
main thread.

| Run | `parseESO` (in the worker) | `structuredClone(parsed eso)` | `structuredClone(sql bytes)` | `structuredClone(eso text)` |
|---|---|---|---|---|
| Annual, sheet | 33.00 ms | **85.84 ms** | 0.39 ms | 0.23 ms |
| Annual, lean | 5.74 ms | 6.76 ms | 0.07 ms | 0.07 ms |
| Design day | 0.15 ms | 0.43 ms | 0.04 ms | 0.04 ms |

On an annual sheet run the crossing costs **2.6× the parse**, and crossing the
raw `.eso` instead — as a string or as bytes — costs 0.23 ms. [source: local
measurement, `harness/clone.mjs`] (confidence: high)

### The `.mtr` half of the idea has almost nothing in it

- **On the default desk no `.mtr` is written at all.** `syncReporting` gates every
  `Output:Meter` on its channel being engaged, and the channels carrying end uses
  ship bypassed, so the stock annual run produces no meter file. — [source: local
  measurement; `src/model.js` `syncReporting`] (confidence: high)
- **With meters engaged the `.mtr` is 2,663 bytes** — two Monthly meters — against
  a 2,001,744-byte `.eso`. Switching it off (`OutputControl:Files.output_mtr =
  No`) changed nothing measurable: warm median 448.2 ms (430–454) against 443.2 ms
  (435–448), each inside the other's range. — [source: local measurement,
  `harness/warm.cjs`] (confidence: high)
- Nothing reads it either way: `syncReporting`'s own comment says the bill reads
  its meters off the `.eso`, and the worker's `result.mtr` parse is therefore
  already dead weight. — [source: `src/model.js`, `engine.worker.js`] (confidence: high)

### An adjacent lever, measured and also mostly empty

`OutputControl:Table:Style` is set to `All`, which writes the tabular report in
five formats — 909,651 B across `.csv`, `.tab`, `.txt`, `.htm` and `.xml` — where
the page parses only `eplustbl.htm`. Narrowing it to `HTML` cuts that to
342,504 B and saves **no measurable time**: warm median 448.1 ms (437–468) against
443.2 ms (435–448). It is 567 KB of bytes, not milliseconds — which may still be
worth having for the run bundle and for heap pressure across a six-instance pool,
but it is not a performance lever. [source: local measurement, `harness/warm.cjs`]
(confidence: high)

### One reading the SQLite file would genuinely serve better

`TabularData` carries the Exterior Fenestration table addressable by row and
column **name** (`ZN001:WALL001:WIN001 | Construction | WINDOW`), which is exactly
the by-name discipline `glassProperties` adopted to survive the table growing
columns between versions. 4,439 rows on this run. [source: local measurement]
(confidence: high)

### Platform

- SQLite **is** compiled into the staged WASM engine: 114 sqlite strings in
  `energyplus.js-26.1.wasm`, including `Output:SQLite`, `output_sqlite` and
  `CreateSQLiteTimeIndexRecord`. `Output:SQLite` and `OutputControl:Files` are
  both in the 26.1 schema, and the run writes `eplusout.sql` plus a `sqlite.err`.
  The gating unknown from intake is answered: yes. — [source: local measurement]
  (confidence: high)

## Evidence Against the Idea

- **The premise is not supported on any cadence measured.** Warm, adding
  `Output:SQLite` costs +71.5 ms on an annual sheet solve, +20.1 ms on a lean sweep
  sample and +12.3 ms on a design day, against reads it would replace that take
  35.7 ms, 7.54 ms and 0.27 ms. In every case the write costs more than the read
  it saves, and in two of the three the SQL read is itself slower.
- **Switching the ESO off does not pay for the SQLite file.** Measured warm, 6.8 ms
  back out of 71.5 ms. The second clause of the idea does not fund the first.
- **Reading every series out of SQL is slower than parsing the whole `.eso`**
  (45.1 ms against 33.9 ms), and the sheet profile wants every series. SQL wins
  on selectivity, and the sheet is the case with no selectivity to exploit.
- **The `.mtr` clause is worth 2.6 KB and no measurable time**, and on the default
  desk there is no `.mtr` to switch off.
- **A cheaper fix addresses the largest measured cost.** The 85.84 ms
  worker→main clone of the parsed ESO is larger than the entire post-run read it
  accompanies, and larger than anything the SQLite route could save; crossing the
  raw `.eso` instead costs 0.23 ms — no new dependency, no output-format change,
  no engine-side write cost. It is also the one cost of the three that lands on
  the main thread, where the desk's responsiveness lives.
- **The dependency the code already refused would come back, larger.** A WASM
  SQLite runtime must be staged, pre-compressed and version-matched, and
  `readings.js` — today DOM-free, network-free, synchronous and callable from the
  Node harnesses — would gain an async initialisation.
- **The upstream reader does not currently work against 26.1 output**, so "adopt
  `@idfkit/engine/sql`" is not free either.

**No measured case supports the idea on engine-plus-read total.** The sweep
sample was the one that did, on the cold harness; warm, it costs +20.1 ms of engine
time to save 6.6 ms of read, a net **+13.5 ms per sample**. The read saving there is
real and repeatable — 7.54 ms → 0.94 ms, an 8× — but it is bought at three times its
value, and only because `Output:SQLite` has to be written to make it available.
Anything that made a single series cheap to read *without* the SQLite write would
keep the saving and drop the cost.

## Gaps & Open Questions

- [NEEDS CLARIFICATION: **the browser was not measured, and that is the decisive
  gap.** Every read-side number here is native `node:sqlite`. The app would use a
  WASM SQLite (sql.js) reading a file that has to be copied out of the engine
  heap into its own. Expect the SQL column to get worse, not better, but by how
  much is unmeasured.]
- [NEEDS CLARIFICATION: the size of the sql.js runtime to be staged and
  Brotli-compressed. Not verified here — checking it means a registry or CDN fetch
  that the URL Trust Policy does not cover, so no figure is asserted.]
- [NEEDS CLARIFICATION: whether the 85.84 ms clone is in fact what the user has
  been feeling. If it is, the question to assess is the worker boundary, not the
  output format — and that is a different idea that should get its own intake.]
- [RESOLVED: whether the study pool's read saving is worth anything. It is
  6.6 ms per sample against +20.1 ms of engine time to make it available, so the
  sweep loses 13.5 ms per sample net. The open question it leaves is the one in the
  bullet above: whether a single series can be made cheap to read without paying
  for a SQLite file.]
- [NEEDS CLARIFICATION: whether `Output:SQLite`'s engine-side cost scales with
  series count the way the text outputs do. Only 13 series were measured; the
  known 173-series case was not re-run with SQLite.]
- [NEEDS CLARIFICATION: whether memory matters. A 2.75 MB `.sql` against a
  1.92 MB `.eso`, times up to six pool instances on a 256 MB starting heap, was
  not profiled.]
- [NEEDS CLARIFICATION: all figures are one machine, one weather file, one
  building. No cross-platform or cross-browser spread.]
- [NEEDS CLARIFICATION: whether `.sql` writing stays proportionally this expensive
  on a warm *browser* engine. The cold/warm correction here was worth 1.6–3.5× and
  reversed one sign, and a browser engine is warmed differently again.]

## Sources

No URLs were fetched. Every finding is local measurement or local file
inspection, so the URL Trust Policy did not apply and no host was contacted.

- `harness/` beside this file — the scripts behind every timing, with a README
  giving the commands. `warm.cjs` carries the engine figures; `run.cjs` is kept
  because it is what the superseded cold numbers came from and what the
  per-variant output listings still come from
- `public/energyplus/energyplus.js-26.1.wasm`, `Energy+.schema.epJSON` — staged
  engine and schema, EnergyPlus 26.1
- `node_modules/@idfkit/engine/dist/{engine.worker.js,index.d.ts,sql.d.ts,sql.js}`,
  `package.json` exports — the upstream SQLite reader and the worker's output handling
- `src/readings.js` (notably line 767), `src/model.js` (`syncReporting`),
  `src/bill.js:154`, `src/contents.js`, `src/study.js` — the readers and the
  reporting profiles as they stand
- `CLAUDE.md` — the recorded performance budgets and the earlier 15 → 173 series
  measurement
- `/Applications/EnergyPlus-26-1-0/WeatherData/USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw`
