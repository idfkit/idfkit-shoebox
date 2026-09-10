# Decision: Read results from the SQLite output instead of the ESO

- **Slug**: sql-results-reading
- **Decided**: 2026-09-09
- **Verdict**: **kill**
- **Artifacts reviewed**: `intake.md` ✓ · `research.md` ✓ · `problem.md` **absent** · `concept.md` **absent**

**Two pipeline stages were skipped.** This went intake → research → decide; no
problem was defined and no concept was shaped. The gate that normally requires
`problem.md` exists so a `go` cannot be claimed over an unexamined idea, and that
hazard does not apply to a kill — so the verdict was recorded on the owner's
instruction rather than sending a doomed idea through two more stages. The cost is
that two rows of the scorecard below cannot be scored from artifacts and are marked
`unknown` rather than guessed. Anyone revisiting this should know the kill rests on
measurement, not on a defined problem statement.

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | **weak** | No problem was ever defined, and research found none to define. The read `Output:SQLite` would replace is 0.27 ms against a warm design day (0.3 % of the solve) and 35.7 ms against a warm annual sheet run (8.9 %). The intake's own wording was "probably faster" — an expectation, with no run, profile or complaint behind it. |
| Evidence strength | **strong** | Three run shapes, warm and interleaved on one engine instance, repeated 6–12 passes with ranges reported; the two read routes agree to identical doubles; series coverage is identical (13 and 13). The method was itself corrected mid-research when a cold harness was found to overstate deltas by 1.6–3.5× and to reverse one sign. The single unmeasured axis — a WASM SQLite in the browser rather than native `node:sqlite` — can only move **against** the idea, since sql.js is slower than the native binding and adds a copy out of the engine heap. |
| Value vs. inaction | **weak** | Inaction costs nothing measurable. Action costs +71.5 ms on an annual sheet solve, +20.1 ms on a lean sweep sample and +12.3 ms on a design day, to save at most 6.6 ms on the sample and nothing anywhere else. The sweep — the one case that looked like a win — nets **+13.5 ms per sample**. |
| Feasibility / appetite | **unknown** | No concept was shaped, so no appetite was set. Feasibility is explicitly *not* the blocker: SQLite is compiled into the staged engine (114 sqlite symbols, `Output:SQLite` in the 26.1 schema), the worker already returns `result.sql`, and `@idfkit/engine/sql` already exists. The idea is buildable and still not worth building. |
| Strategic fit | **weak** | Three constitution principles cut against it, two of them citable as written. **V (Only @idfkit/\* at Runtime)**: a WASM SQLite runtime is not an `@idfkit/*` package, and adding it "requires an amendment to this constitution". **I (Everything Runs in the Browser, NON-NEGOTIABLE)**: `@idfkit/engine/sql` defaults `locateFile` to `sql.js.org/dist/`, where the only run-time requests permitted are the site's own assets and `/onebuilding`; staging it instead returns the weight to V. **VI (Latency Is the Interface)**: the 50 ms warm design day is "a design budget, not a footnote", and +12.3 ms is a quarter of it spent to save 0.27 ms. |
| Risk posture | **adequate** | The risks are identified precisely rather than mitigated, which is the right posture under a kill: the upstream reader queries `ReportVariableDataDictionary` / `ReportVariableData`, absent from 26.1 output, so it would find zero variables as shipped; the CDN default; and the conversion of a synchronous, DOM-free, network-free `readings.js` to an async initialisation, which would also cost the Node harnesses their ability to call the real readers. |

## Verdict & Rationale

**Kill.** The idea's premise is that reading from SQLite is faster than parsing the
ESO. Measured warm across three run shapes, the reading was never the cost: it is
0.3 % of a design day and 8.9 % of an annual sheet solve. Worse, the file that
would make the faster read available has to be written by the engine first, and
that write costs more than the read saves in **every** case measured — +71.5 ms,
+20.1 ms and +12.3 ms against savings of nothing, 6.6 ms and nothing. The second
clause of the idea does not fund the first either: switching the ESO off returns
6.8 ms of the 71.5, and the `.mtr` is 2,663 bytes that nothing reads and that the
default desk never writes at all.

Evidence strength is `strong` and points one way, so this is not a
`needs-clarification` in disguise. The one genuinely unmeasured axis is the
browser, and it is asymmetric: a WASM SQLite reading a file copied out of the
engine heap is slower than the native binding these figures came from, so
measuring it would deepen the kill rather than rescue the idea. Feasibility is
`unknown` only because no concept was shaped — the idea is perfectly buildable,
which is what makes the strategic objection the interesting one: it would take a
constitution amendment under Principle V and spend a quarter of the Principle VI
design budget, to make a 0.27 ms read faster.

The research did find a real cost in this area, and it is not the one the idea
named. That finding is carried forward below rather than buried with the verdict.

## Carried forward

None of these is part of this idea, and none is killed with it.

1. **The worker boundary, not the output format, is the largest post-run cost.**
   `engine.worker.js` parses the `.eso` inside the worker and structured-clones the
   **parsed object** to the main thread: 85.84 ms on an annual sheet run, against
   33.00 ms for the parse itself. Crossing the raw `.eso` instead — as a string or
   as bytes — costs 0.23 ms. It is the only one of these costs that lands on the
   main thread, where Principle VI lives. This deserves its own intake; it needs no
   new dependency, no output-format change and no engine-side write.
2. **`@idfkit/engine/sql` is broken against EnergyPlus 26.1** and worth reporting
   upstream whatever this repository does. It queries
   `ReportVariableDataDictionary` and `ReportVariableData`; 26.1 writes
   `ReportDataDictionary`, `ReportData` and `ReportExtendedData`, and both legacy
   names are absent from `sqlite_master`. A consumer would get zero variables and
   no error.
3. **The tabular report is written in five formats and read in one.**
   `OutputControl:Table:Style` is `All`, producing 909,651 B across `.csv`, `.tab`,
   `.txt`, `.htm` and `.xml` where the page parses only `eplustbl.htm`. Narrowing
   it to `HTML` saves 567 KB and **no measurable time** (448.1 ms against 443.2 ms,
   warm). Not a latency lever, so it is not a Principle VI matter; it may still be
   worth having for the run bundle and for heap pressure across a six-instance
   pool. Small, separable, and needs its own justification rather than riding in
   on a performance argument it does not support.
4. **If a cheap single-series read is ever wanted for the sweep**, the 8× saving
   measured there (7.54 ms → 0.94 ms) is real and repeatable. It was rejected here
   only because `Output:SQLite` has to be written to make it available, at three
   times its value. Anything that achieves selectivity without that write keeps the
   saving and drops the cost.

## Reopening

Revisit if any of these changes:

- The sheet's post-run read becomes a measured bottleneck in the **browser** —
  measured, not assumed, and on the main thread.
- A run grows enough series that `parseESO` stops being single-digit-percent of the
  solve. The known 173-series case was never re-run with SQLite.
- SQLite arrives inside `@idfkit/*` as a staged, synchronous, correctly-tabled
  reader, which would retire both the Principle V objection and the upstream bug in
  one move. The engine-side write cost would still have to be answered.
