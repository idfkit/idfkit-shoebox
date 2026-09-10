# Idea Intake: Read results from the SQLite output instead of the ESO

- **Slug**: sql-results-reading
- **Created**: 2026-09-09
- **Source**: pasted text (with a codebase pointer implied — the ESO/MTR readers in this repository)
- **Type**: improvement

## Idea (as captured)

> reading results using sql is probably faster/more performant than reading from ESO. And we can turn off ESO and MTR outputs.

No URL was supplied, so no fetch was attempted and the URL Trust Policy did not apply.

## Restated

Results that the sheet currently reads by parsing the EnergyPlus `.eso` and `.mtr`
text outputs would instead be read from the simulation's SQLite output, on the
expectation that it is faster to read. If every reading came from SQLite, the
`Output:Variable` / `Output:Meter` text outputs could be switched off.

## Origin & Context

- **Raised by**: Samuel Letellier-Duchesne (repository owner), as a pasted one-liner
- **Trigger**: [NEEDS CLARIFICATION: whether this came from an observed slowdown on a
  particular run kind — a live design day, an annual solve, a study sweep — or from a
  general expectation about parse cost. Nothing in the input names a measurement or a
  complaint.]

### What it touches in this repository (recorded, not evaluated)

- `src/readings.js` is the DOM-free reader module: it parses the `.eso` for every
  series the sheet letters, and `src/bill.js` reads meters through it.
- `src/bill.js:154` records that `parseMTR` is `parseESO` under another name and
  mis-parses every meter, which is why meters are requested Monthly and why
  `meterName()` recovers the name from `keyValue`. `src/model.js:2535` carries the
  same note from the applier's side.
- `src/readings.js:767` already states a position on the SQLite file, in the context
  of the glazing U-factor and SHGC: the engine hands back `.eso`, `.mtr`, `.rdd`,
  `.mdd`, `.csv` and `eplustbl.htm` and no `.eio`, and "the `.sql` holds them too and
  costs a further dependency to open". That sentence was written about one reading;
  this idea is about all of them.
- `syncReporting` in `src/model.js` owns every `Output:*` object and rewrites them on
  every apply to one of three profiles, which is where an ESO/MTR switch-off would land.
- `src/bundle.js` publishes `results/eplustbl.htm` in the run bundle.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: what "faster" is being measured against. The desk's stated
  budgets are a ~50 ms design day and a ~0.7 s annual solve; is the concern the parse
  itself, the engine's time writing the files, or the study pool's throughput?]
- [NEEDS CLARIFICATION: does the staged emscripten engine in `public/energyplus/`
  include SQLite support at all, and does `Output:SQLite` produce a readable
  `eplusout.sql` in that build?]
- [NEEDS CLARIFICATION: what it would cost to open a SQLite file in the browser —
  `readings.js` is DOM-free and dependency-free today, and the note at
  `readings.js:767` treats a `sql.js` dependency as a cost worth avoiding. Is that
  judgement being revisited, and for the whole module or part of it?]
- [NEEDS CLARIFICATION: whether the engine writes the SQLite file faster or slower
  than the text outputs. Turning the text outputs off removes writing as well as
  parsing, but a database write is not obviously cheaper than an append.]
- [NEEDS CLARIFICATION: which readings are in scope. The sheet reads series, meters,
  and the glazing figures out of `eplustbl.htm`; SQLite is claimed to hold all three.]
- [NEEDS CLARIFICATION: what switching off the ESO and MTR would do to the run bundle
  and to anything that expects those files — a reader taking an IDF and a run away
  from the page may expect the same outputs EnergyPlus normally writes.]
- [NEEDS CLARIFICATION: whether the Monthly-meter constraint and the `meterName()`
  workaround fall away under a SQLite reader, and whether that changes what the bill
  and the chart can be drawn from.]
- [NEEDS CLARIFICATION: what the transition looks like — both readers standing side by
  side for a while, or a switch — and how a difference between them would be caught,
  given there is no test runner in this repository.]
