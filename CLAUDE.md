# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is the short form. The long-form reasoning, measurements and the error messages
that forced each decision live in **`docs/design-notes.md`**, under the section
names cited below. Read the relevant section before changing a subsystem, and
record new hard-won findings there, not here.

## Commands

```bash
npm install
npm run dev       # predev stages ~50 MB of engine assets, schemas and the station index
npm run build     # prebuild does the same staging
npm run preview
npm run deploy    # compresses dist/ and publishes it; needs a built dist/ and AWS credentials
npm run undeploy  # removes a preview; needs SHOEBOX_PREFIX=<pr number>
```

`predev` / `prebuild` copy `@idfkit/engine-assets` into `public/energyplus/`, the
schema bundle into `public/schemas/` and the TMYx station index into
`public/weather/`. All three are gitignored: a fresh clone must run one of the npm
scripts before the page loads.

There is **no test runner and no linter**. Changes are verified as below.

## Verifying changes

Schema validation does not catch what breaks a run. EnergyPlus 26.1.0 is installed
at `/Applications/EnergyPlus-26-1-0` and the idfkit MCP tools find it unaided.

1. Write a throwaway Node script that imports `src/model.js`, builds the document at
   several desk positions and writes each IDF. Outside the browser the schema comes
   from `localBundle()` in `@idfkit/schemas/node`, loaded with the full version
   string: `load('26.1.0')`.
   - Without a local EnergyPlus, `public/energyplus/energyplus.js` (emscripten)
     runs under Node: set `global.Module = { noInitialRun: true, locateFile }`,
     `require` it, then `callMain(['-d', '/output', '-w', '/weather.epw', '/input.idf'])`
     and read `/output/eplusout.err`, `.eso`, `.mtr`. `main` is not re-entrant:
     **one EnergyPlus per process**, or clear the require cache between runs. A
     second call on one instance throws a raw number before doing any work and
     leaves the previous ESO in place.
2. Assert idempotence: `applyModel` runs on every change, so applying it three times
   must give byte-identical output.
3. Run each IDF through `load_model`, `validate_model`, `check_model_integrity`,
   `run_simulation`.
4. Confirm output variable names in `eplus.rdd` rather than guessing, and grep
   `eplus.err` for "requested but not generated".

Then load the page and drive it. A warm design day solves in about 50 ms.

## Architecture

A one-page client-side EnergyPlus demo laid out as a drafting sheet with a "model
console". The governing rule:

> **Everything drawn is read back off the `IdfDocument`.** Never letter the page from
> a variable when the model holds the answer. The axonometric projects
> `BuildingSurface:Detailed` vertices, datum lines come from `SizingPeriod:DesignDay`,
> the title block reads `Site:Location`, quantities are summed with Newell's method.

```text
controls.js  declares every control (typed classes) and groups them into Channels
     |
     +--> model.js   one applier per channel writes the IDF objects
     +--> console.js draws the strips from the same declaration
     +--> main.js    owns `params`, wires gestures, schedules solves, reads the ESO
     +--> field.js   the editable number both surfaces letter a value with
```

Other modules: `readings.js` (ESO readers, DOM-free), `describe.js` (the generated
paragraph), `bill.js` / `rates.js` (the priced schedule), `permalink.js`,
`schemes.js` (standards and kept schemes), `tm59.js` (overheating), `tour.js`
(onboarding), `scheduler.js` / `study.js` / `pool.js` (studies), `survey.js` /
`pull.js` / `relief.js` (E-02 design space survey), `weather.js` / `epw.js`,
`copy.js` (copy budgets). Keep `readings.js`, `describe.js`, `tm59.js` and the
`permalink.js` codec DOM-free and network-free so Node harnesses call the real code.

### Controls (`src/controls.js`)

The single source of truth. Kinds: `Scale`, `Selector`, `Bearing`, `Facade` (four
walls), `Profile` (24 h band), `Pattern` (24 hourly fractions), `Boundary` (six
surfaces), `Calendar` (twelve months), `Days` (list of dates), each on a `Channel`.
`DEFAULT_PARAMETERS` is derived from the declaration.

- **Add a control:** declare it in `controls.js`, write its field in that channel's
  applier in `model.js`. No markup, defaults or label strings anywhere else.
- **Add a landmark:** declare it in `LANDMARKS`, attach with `landmarks:`. A landmark
  is a band (omit `to` only for a limit), `note` with its source is required, a
  convention opens with the `CONVENTION` prefix, and derived arithmetic in a note
  must be right. `readLandmarks` throws at load unless it is inside the range,
  non-overlapping, **reachable on the step grid**, and readable at a `zero` stop.
  `landmarkAt` is the only reading of which mark is lit. Landmarks reach no IDF
  object. Only add one where somebody published it.
- **Add a control kind** (rare; four gates that fail differently):
  1. `console.js` `buildControl` throws for a kind it cannot draw.
  2. `permalink.js` `readValue`: the numeric regex runs **before** the per-kind
     switch, so a non-numeric kind must be taught **above the regex**, beside
     `selector`, or every link carrying it is refused as "not a number". It must
     also re-serialise to canonical text.
  3. Key ownership: a kind owning more than one key (`Facade`, `Profile`,
     `Boundary`) must be taught in `Channel.keys()`, the `INDEX` behind
     `controlFor`, the `DEFAULT_PARAMETERS` loop, and in `labelFor`, `phraseFor`,
     `formatValue`.
  4. `assertHideable` refuses a `when` the console cannot withdraw; pass `when`
     through so it throws rather than being dropped.
- **Every parameter is a scalar.** `commit`'s `!==` guard, `encodeState`'s identity
  diff, `decodeState` and `revert`'s `Object.assign` (shallow freeze would alias an
  array default into live `params` and into `DEFAULTS_BY_VERSION.v1`) all rely on
  it. List-valued controls carry canonical text and parse at the boundaries (`Days`,
  `Pattern`).
- `refuses()` lives here; the codec and presets both use it.
- `Pattern` asserts its own precision (TM59 fractions need three decimals), is not
  sweepable and carries no landmarks.

Notes: "The through-line", "Landmarks", "The `Pattern` control kind".

### The margin numbers (`src/field.js`)

Every slider value is also an editable text field. Parsing is `Ruled.parse` beside
`format` in `controls.js`. A typed value is clamped, snapped to the step and rounded
to the step's decimals; non-numbers are refused whole. Focus shows the raw value,
blur shows the lettering, and **nothing is committed when the value is unchanged**
(the lettering is lossy). `show()` returns early while focused; never rebuild a
host containing a focused field.

### `applyModel` (`src/model.js`)

One idempotent function applies the whole desk, in strip order (later channels read
geometry earlier ones wrote).

- **Bypass removes, it does not zero.** Out-of-path objects are deleted.
- **`Channel.requires.test(params, on, off)`**: unmet, the channel is not written and
  the strip states why. `on(id)` asks about earlier channels only; `off(id)` reads
  the patch bay and works in any order. `requires.reason` may be a function.
- **`syncReporting`** owns every `Output:*` object and rewrites them all each apply to
  one of `'sheet'`, `'extremes'`, `'energy'`, channel-gated. Clear-and-rewrite keeps
  "lean then sheet" byte-identical to "always sheet", which the sweep restore needs.
- **`must(doc, type, name)`** throws on a missing object rather than re-adding it.
- **Sweep constants come from the declaration** (`SKY_MAX`, `PANE_MAX`): appliers
  sweep every possible name on each apply so shrinking leaves no orphans.
- `applyRun` writes one `RunPeriod` per contiguous group of months; December and
  January are not joined.
- Openings ask the document, not `params`: `opensOutdoors(doc, name)` reads the
  boundary `applyFabric` wrote, so a surface that is adiabatic (by its face or by
  Fabric being bypassed) gets no window or shade.
- `holds(doc, type)` guards questions about a possibly absent type. (Under
  `@idfkit/core` 0.1.0 reading registered the type and reordered the IDF; fixed in
  0.3.0-rc.3, see "Reading an absent type used to register it".)

### Channel specifics (see the matching notes sections)

- **Glazing (03):** layered unit built from a pane count (`2n - 1` layers, coating on
  the inboard pane's cavity face). The engine's U-factor/SHGC are read from
  `eplustbl.htm` by **column head**, from the row for `WINDOW_CONSTRUCTION`, never the
  area-weighted "Total or Average" row. Empty assembly cells mean no frame, not zero.
  **The ratio is the rough opening, frame inside it** (`sizeOpening` in
  `src/aperture.js`), so the "too large to fit" fatal is unreachable below 1. A
  ratio the frame closes writes no window; `openingFor(...).glazes` is the one
  predicate and `opens()` in `controls.js` the one "glass on this wall" question.
- **Skylights (04):** a rooflight is a `Window` on the roof; tell wall from roof glass
  by the host surface's type, never the name. No tilt control is possible. The curb
  is drawn shading geometry. Nothing is subtracted from the roof. Blinds only name
  surfaces built of the layered construction.
- **Boundaries (07):** `Boundary` owns six faces; `floorBoundary` kept its key so the
  link stayed `v1`. Clicking the axonometric can flip only the three visible faces
  and is refused while Fabric is bypassed. Ratio denominators count only surfaces
  with an outside. A nearly sealed box may fail warmup convergence; that is physics.
- **Air (09):** two models (`scheduled` / `network`), the unused one's `AIR_TYPES`
  deleted. The AFN crack coefficient is **per surface** (split by area); per m² runs
  clean and is ~80x wrong. Computed rate = infiltration + ventilation ACH series.
  Three reachable get-input fatals are blocked by `requires`. The adaptive comfort
  model is written by `applyGains` from what the zone object actually carries.
  Rooflights leak but never open. The wind bound is EMS and must `SET Vent0 = Null`
  in the else-branch. EMS types are cleared by type, safe only while nothing else
  uses EMS. AFN costs ~+20 ms per design day.
- **Priced channels** (`Plant`, `Tariff`, `prices: true`): nothing reaches the IDF,
  keys are in `PRICED_KEYS` and excluded from `shapeKey`, `commit` routes them to
  `reprice()`, meters are `derived`.
- **Gains (10) / TM59:** at `roomType: 'As drawn'` output is byte-identical to before;
  a named room type writes `Occupancy`, `EquipmentUse`, `LightingUse` with absolute
  `People` and `EquipmentLevel`. `TM59_SPACES` must equal `PROFILE_IDS`
  (`schemes.js` asserts it).

### The solve scheduler and studies (`src/main.js`, `src/scheduler.js`)

- One engine per `pump()` loop, latest-wins. Studies run on a separate pool
  (`pool.js`, up to six instances).
- `shapeKey = JSON.stringify([params, patching()])` minus `PRICED_KEYS`. **Anything
  that reaches the IDF must live on `params`; anything on `params` that does not must
  be on a `prices: true` channel.**
- Design day re-solves continuously during a drag; a year re-solves on release.
- **A run in flight never blanks the sheet.** `resultPanels` keep old numbers,
  dimmed by `markStale`. `clearReadings` only on `solve`'s failure exits;
  `clearResults` only when no run reached the engine.
- Studies queue per sample, round-robin (`takeNext`), coarse 11 then fine 21.
  `buildSample` applies an overlay, writes the IDF and restores **synchronously**.
  `applyGeometry` is the cancel point via `restShapeKey`. A job's identity is `id`,
  not its swept key. Declare study buttons at the module head (TDZ hazard during
  boot attach).
- The pinned hour (`pinnedHour`, a calendar stamp) is off `params`, re-found by
  `resolvePin` in each run and released, with a stated reason, when missing.

### Readings and results

- **TEDI / CEDI** are pinned to published definitions (output side, before plant
  efficiency) in `demandOver`. There is no demand-side "EUI"; the bill's per-m² is
  the energy intensity. Rows are omitted when the System meters are absent.
- **Areas are whole-building.** `geometryFacts` returns per-storey and `gross*`
  values; the multiplier is read off the `Zone` object, never `params`. Everything
  dividing by an area uses the gross one; ratios never take the multiplier.
- **The bill:** ideal loads report as `DistrictHeatingWater` / `DistrictCooling`;
  Plant divides by efficiency afterwards. `parseMTR` mis-parses meter names, so
  `meterName()` recovers them and meters are requested **Monthly**. Bill only the
  billed environments (not the design days). Per-m² only on a whole year
  (`Bill.wholeYear`). Rates are generated into `src/rates.data.js` by
  `scripts/build-rates.mjs` (by hand); all tables are non-residential.
- **Balance rail:** only the `Zone Air Heat Balance ...` family; storage enters
  negated as "Air energy release"; system transfer is building-level and divided by
  the multiplier (`Term.perBuilding`). Meters read one instant (worst hour or pin).
  Sign is stated in words (`flowWord`), never by hue alone.
- Months an environment covers are read off its timestamps, never `params`. `noun`
  is kept apart from `label`.

### Other subsystems (one line each; details in the notes)

- **Description** (`describe.js`): moves ranked by distance from default (`FLIP`
  table outranks sliders), then re-sorted by `READING_ORDER`; noun phrases; compass
  words measured off the turned vertices; captured before the await; nothing said
  that is not measured; two moves, sixty-word budget shared with the finding.
- **General notes** (`tour.js`): markers fill only from real events via
  `tour?.note(...)`. **Any feature change that alters what a step teaches must update
  `NOTES` and the call sites, and bump the storage key** (`shoebox-general-notes-v4`).
- **Permalink** (`permalink.js`): delta-encoded against versioned defaults. Changing a
  default, renaming a key or narrowing a range means bumping `LINK_VERSION`, freezing
  `DEFAULTS_BY_VERSION` and writing a `MIGRATIONS` step. Links are refused whole.
  Reserved keys (`in`, `out`, `stn`, `win`, `at`, `sty`, `sv`) are read in
  `decodeState` above `readValue`. Only `*`, `.`, `-`, `_` survive `URLSearchParams`
  unescaped. The bar encodes `patching()`; one builder, `schemeHash`.
- **Register** (`schemes.js`): a standard is an overlay, a kept scheme a replacement
  stored as its permalink. `UNTOUCHABLE` channels are asserted at load. Nothing is
  remembered: `conformance()` is recomputed on every apply. `Spec` vs `Target`;
  `Unjudged` is listed; a target with no line is not a pass. Chase ranks by ratio.
  A full shelf refuses, never evicts.
- **TM59** (`tm59.js`): one period, 1 May to 30 September (153 days). The running mean
  is computed from the EPW (seeded 23 to 29 April, divisor 3.8), not from EnergyPlus.
  **The occupancy floor is 0.1, so `> 0` is not "occupied"**: use
  `occupiedFloor(params)`. dT rounds half-up (`roundDT`). Design days are excluded.
  Criterion d is never read. The count is not a verdict. The purchased method text
  never enters the repo; `scripts/build-tm59.mjs` holds the transcription.
- **Layout:** the index sheet at `780px` wide or `600px` tall (`--index` flag read
  back by `console.js`); the register folds between 600 and 1000 px tall
  (`--fold`); schedules fold at `620px` with `data-head` and `keepTableSemantics`.
- **E-02 survey:** rows are studies (a row fixes Y and sweeps X), so the sample cache
  is shared. Coarse 6, fine 11 (nests in the 11/21 study grid). A survey's rest shape
  omits both axes. Measured / inferred / unsurveyed are distinct, and unsurveyed is
  drawn by absence (no geometry emitted). `Coverage` asserts its sum. The relief is
  hand-written WebGL2, orthographic, no exaggeration control, one hue. `cutAt` is
  where the ground was cut; `standingAt(desk)` is where the desk is.
- **Reports** (`report.js`, `report-sheet.js`): `report.js` is DOM-free (records,
  `buildBody`, `handoff`, the trail, the error log, the `provide`/`ask`
  registry). `report-sheet.js` is a **second module entry, loaded before
  `main.js`**, so the Report button and the error trap work when the boot never
  finishes. `main.js` registers `screen`, `runFiles` and `refusedLink` at the
  very foot of the module (earlier would hit the TDZ on a half-finished boot).
  The hand-off is the only moment a report leaves the machine; the page makes no
  request. See "Feedback reports and triage".
- **Triage** (`.github/workflows/triage.yml`): Claude reads the issue with one
  tool, `StructuredOutput`, and a read-only token, and returns a schema-checked
  verdict; `.github/scripts/triage-apply.cjs` validates it and labels as
  idfkit-bot. **`--tools StructuredOutput`, never `--disallowedTools "*"`**,
  which denies the verdict's own tool (the first live run died of it), nor
  `--tools ""`, which the action drops. The job skips bot senders (app tokens
  retrigger); read `steps.claude.outcome`. Test from a branch with
  `workflow_dispatch` (works because the file is on `main` and has run).

### The strategy plan (src/space.js, src/strategy.js, src/strategy-view.js)

A component of E-02 that reads the whole design space at once. For a chosen
reading it draws every sampled design along the two moves that decide it, shows
the worlds one door away as islands with measured jumps, screens every control
and door, and for a pair of readings sorts each into no-regret, trade-off, lever
or free, printing the kind on the control's own strip. `space.js` says what
could be run, `strategy.js` what the runs said, and both are DOM-free and
engine-free so the harnesses in `specs/009-strategy-plan/verify/` call the real
arithmetic; `strategy-view.js` is the one DOM-bound module.

**One sequence over every face is the foundation, not a detail.** Every design
is a point of one scrambled Sobol sequence (Joe and Kuo directions, Burley's
hash-based Owen scramble at a declared seed) that assigns a value to every
varied face on the desk, including faces dark in the world being sampled. So
design *i* in two worlds one door apart is the same parameters with one key
flipped (a jump is a difference between two runs of one building), entering a
world reuses every run its island made, a slider gesture invalidates nothing,
and a link samples the same designs everywhere. `matched` asserts the pair
differs only in the door and what it implies, and a `Jump` accepts nothing but
`MatchedPairs`, so an unmatched jump cannot be constructed.

- **`DIMENSION_ORDER` is append-only.** Inserting a control mid-strip would
  renumber every later dimension and silently change the sample behind every
  plan link ever shared, so a new face takes the next dimension and a departed
  one goes into `RETIRED`. `verify/dimension-order.json` is the frozen copy the
  gate compares against. The seed is part of the link format in effect.
- **Every key has exactly one role**, asserted at load: 85 varied, 23 doors, 36
  held with a sentence each (Solver and Run are not the building, the priced
  channels do not reach it, System's own choices change what a reading means,
  `solarDist` and `hbAlgorithm` are solution algorithms, and a faceless kind has
  no position). The patch doors are exactly Context, Skylights, Shading, Blinds
  and Daylight.
- **The default desk has 19 enterable neighbours, not 20.** research.md first
  said 20; its own itemised terms sum to 19, which is what `neighboursOf`
  returns. Blinds in is refused with its channel's own `requires.reason`.
- **A design is built in the live desk's own key order** (`PARAM_ORDER`, which
  is `DEFAULT_PARAMETERS`'s), because a sample's cache identity is a
  serialisation of its whole desk, and a plan design and a study sample of one
  building only share a cache entry if their keys come out in the same order.
  `sampleDesk` in `main.js` is the one function both the identity and the build
  read.

**A control's darkness can depend on its own value, and the skip proof found it
on its first run.** A probe is skipped, costing no run and recording an exact
zero, where the control reaches nothing. At base 0 the west overhang stood at
0.01 m, which its wall calls dark because EnergyPlus merges two vertices that
close and deletes the surface; stepped to 0.16 m the same overhang is built.
Dark at the base alone, that probe was an exact zero over a real effect. So a
probe is skipped only where the control is dark at **both** ends of its step,
and `skip-proof.mjs` builds both documents for every skipped probe and compares
them byte for byte. A skipped probe at a base that itself failed claims nothing.

**Design-list jobs, and a context per world.** A plan design moves every varied
control at once, so it cannot be positions along one face; as a thousand
one-point jobs the round-robin would hand a study one dispatch in 1,025. So
`makeStudyJob` takes `designs` and a plan is at most three jobs (home designs,
home probes, neighbours), which keeps a study to a turn in every four. A
neighbours job mixes worlds, and `roomType` is a door that moves the occupied-hour
floor TM59 a and c read, so `contextFor(job, index)` is resolved once per
distinct `entry.context` rather than once per job. The scheduler hands `onUpdate`
the landed index, because finding it by walking a curve of thousands on every
point is quadratic. Every job leaves out the designs the ledger already holds,
which is what makes stepping into a measured island free.

**The neighbour budget is staged, and the home world goes first.** The home
world is measured in two depths from one sequence, 4 bases and 128 designs and
then 16 and 512, the first a prefix of the second so nothing is thrown away.
The neighbours' job (32 matched designs per enterable neighbour, then each
island's own 8 bases and 128 designs, in design-stage order) is **held** until
the first depth has landed: queued beside it, the round-robin gave the jumps a
third of every dispatch from the first second and the reader's own world stood
half drawn while nineteen others were measured. An island's own screening is
queued only when the reader asks for that island, on every desk, with its runs
and time lettered on its *Measure this world* button first: queued unasked, a
step into a world on design days started 8,320 runs, four fifths of them for
islands nobody had opened, and it now starts 1,632 (the home world's 1,024 and
the 19 jumps' 608). On a year nothing is queued at all until the reader has read
the cost (the home world's runs, the jumps' runs, and the seconds at the desk's
cadence) and asked. The consent is for one world, pair of readings and weather,
so stepping into another world states its cost afresh.

**The pool is as wide as the machine has cores less two, bounded by half its
memory, and says which term bound it.** `poolWidth` in `src/pool.js` replaced a
limit that took a quarter of an assumed 4 GB and capped at six, which held every
Safari and Firefox visit to three engines and every large Chromium machine to
six. One core is the main thread's and one is the sheet's own engine, so a drag
never waits on a sample; *N − 1* was rejected for putting a sample on the
sheet's core. The main thread's share was measured rather than assumed: one
design applied and its IDF written is **0.79 ms** (median 0.76, p90 1.07, 64
designs, full reporting), twice per sample because `buildSample` restores, so a
pool W wide spends about 3 % × W of the thread building. What keeps a drag live
is still `paused()` while a hand is on a control, not the width.

| Machine as reported | Width before | Width after | What binds |
| --- | --- | --- | --- |
| 4 cores, 8 GB (Chromium) | 2 | 2 | cores |
| 8 cores, no memory (Safari, Firefox, an iPad) | 3 | 6 | cores |
| 10 cores, 8 GB | 6 | 8 | cores |
| 12 cores, 8 GB | 6 | 10 | cores |
| 16 cores, 8 GB | 6 | 14 | cores |
| 24 cores, 8 GB | 6 | 15 | memory |

`deviceMemory` is Chromium's and reports at most 8, so fifteen is the ceiling.
The plan letters `N engines side by side: 12 cores less two` wherever it states
a cost, because a browser may round `hardwareConcurrency` for privacy and a
reader on a capped one should see why their plan is slower.
`verify/pool-width.mjs` holds the table and the invariants.

**The campaign: Pause holds, it does not cancel.** The panel's head carries
Pause, Resume and Cancel, acting on jobs of origin `'strategy'` only. Pause is
`scheduler.holdWhere(pred, true)`, a flag `takeNext` skips: a held job keeps its
`order`, `started` and `curve`, so Resume continues exactly where it stopped,
where a cancelled job loses its turn and re-queueing rebuilds every design list.
It is not `paused()`, which would stop every study and the survey too. A queue
holding only held jobs is **idle**, or the studies' densify pass would wait on
an `'idle'` that never comes. Cancel keeps every landed run in the ledger and
queues nothing more for that world; a door opened ends it (it was a decision
about the world), while a pause survives a door (it was about the reader's
attention), and plan jobs queued while paused are admitted held. An island's
*Measure* and the year's consent lift a cancel, since they are asks for runs.
The gate still cancels outright and leaves the campaign's state alone, which
`queueStrategy` honours when the gate lifts. Nothing of it rides the link.
`verify/scheduler-hold.mjs` is the gate.

**The plan is a panel on the left, the console's mirror.** `aside.planner` is
after `main.sheet` in the DOM and drawn before it with `order: -1`, so focus
reads sheet, plan, console, and on a phone, where block layout ignores `order`,
it lands under the sheet and before the console for free. Closing it does not
close the plan: the readings, the campaign and the strip tags stand until
*Close the plan*. Both panels stand open wherever 720 + 436 + 436 px and slack
fit, which is 1,624 px, declared once as `--both` on `body` and read back by
`bothFit()`; narrower, opening one folds the other to a 168 px rail (its head
alone: for the plan the readings, the campaign's state and its controls), and
pressing the rail swaps them. A strip tag opens the panel, unfolding it, before
it focuses its entry, and pressing two controls in the screening scrolls the
sheet to the ground it cut, which is no longer beside it.

**A failed run poisons its engine, so the engine is retired, never reused.**
The worker keeps one WebAssembly module and calls EnergyPlus's `main` on it for
every run, and `main` is not re-entrant: after a run ends in a fatal or a thrown
exception, every later run on that module throws a raw C++ exception pointer
before doing any work, and the worker letters it `Engine crashed: 287468688`.
The pool used to recycle any instance whose `run()` resolved, and a failure
resolves, so one setpoint crossing took its engine down for the session.
Measured driving an annual plan at ten engines: of 1,670 runs, 29 genuine
failures and 1,512 instant crashes behind them, which is what put "128 failed
runs, the engine gave no reason" under the Rooflights island. On a design-day
desk almost nothing fails, which is why no study or survey ever showed it.
`createEnginePool` now retires an instance after any unsuccessful result but a
cancel, and the sheet's own engine runs behind a one-wide pool (`sheetPool`) so
the same rule replaces it, or a desk dragged into a fatal left every later solve
crashing until a reload. `engineFailure` also reads `fatalError`, the exit code
and the last console line. And every failure's reason now travels with its
landing: `runSample` throws the engine's sentence, `buildSample` and the reader
throw theirs, and the scheduler files the message on the point (`land`), where
a side map keyed by identity had five writers and a cleanup pass over every
design of every job.
`verify/pool-recycle.mjs` is the gate.

**The chooser follows the desk with no plan open.** Which readings are on offer
turns on the desk (a year puts the annual ones on offer, System and Gains the
demand and TM59 ones), and `refreshStrategy` and `syncStrategyGate` used to
return at once without a plan, so the chooser drawn at boot was never redrawn:
a reader who attached a year met the panel offering High and Low alone, the
rest refused with "Attach a weather file". `syncStrategyChooser` now redraws it
from where the offers change, `applyGeometry` and the station gate, behind a
signature so a drag does not rebuild it every frame. Buried in E-02
the stale chooser went unseen; as the first thing the panel shows, it was the
first thing a reader tried. The study status line also letters "Study drawn"
once no study the reader asked for is running, rather than once the whole queue
is empty, which a running or paused plan never is: it kept a finished study
reading "32 of 365 samples solved".

**The plan's gate cancels, it does not merely wait.** Auto-solve off, a link
attaching or a station attaching cancels every `'strategy'` job and the plan
says which it is waiting on; the gate lifting re-queues, free wherever the
ledger already answers. `syncSweepGate` is the hook, because every change to
`linkAttachPending` passes through it. A reading that stops being on offer
after the plan opened (Gains patched out under TM59) refuses the plan whole
with the offer's own reason and fix and queues nothing for it.

**A link's plan is checked before anything of the link is restored.** Whether
the desk can offer a reading turns on the station just attached, so it is the
one part of a link that can still be refused that late. `restoreLinked` checks
it first, then restores the studies, the ground and the plan, and stops at the
first refusal; checked last, a refusal reverted the desk under studies and a
ground already restored from the link it had just refused.

**A ledger beside the cache.** The cache is FIFO at 400 and a world at full depth
is 1,024 runs, so `DesignLedger` keeps every visited world for the session and
is cleared only where the cache is, on a station change; its epoch drops a run
that lands after the climate moved. A run landed for one reading is re-run when
another is chosen that it cannot answer, and the two bags are merged: one
building, read twice. A design whose bag lacks the chosen reading entirely is
waiting, not failed, and is never counted as a gap.

**The state lives at the top of `main.js`, with the studies'.** `applyGeometry`
moves the plan's stance mark and runs during boot, long before the foot of the
file is evaluated, and a `let` in its temporal dead zone simply throws. The
console's `tagRows` met the same trap on the first load, inside `mountConsole`.

**The four kinds wait for four complete screening points.** Classified off one
point, all 34 controls and doors printed a kind with a consistency of 1 of 1,
which is a guess about the design space rather than a reading of it. The same
four points fit the moves.

**Measured on the reference desk** (free-running default desk, Denver
Centennial design days, 16 screening bases and 512 designs, 1,007 runs under
Node through `verify/reference-plan.mjs`):

| Reading | Two moves | One move | The two strongest single controls | Terrain |
| --- | --- | --- | --- | --- |
| Zone high | 76.4 % | 74.4 % | 45.8 % (SHGC and U-factor) | 67.2 % at bandwidth 0.127 |
| Zone low | 57.8 % | 58.0 % | 5.0 % (U-factor and height) | 35.9 % at bandwidth 0.184 |

The high's leading move is *lower U-factor 37 %, higher SHGC 32 %, brighter
ground 19 %*; the low's is *lower U-factor 49 %, lower storey 16 %*. SC-004
passed at 16 bases, so the contingency of 32 was not needed. On the low, one
move scores marginally higher than two, and the plan offers the one-move view.

The shares are scored without the 16 screening bases, which are designs 0 to 15
of the same sequence and the ones the moves were fitted on; scored with them,
as they first were, the table read 76.6 and 57.3. The low's terrain stands at
a wider bandwidth than the high's because the audit also refuses a hollow the
designs do not support, and on the low the two narrower rungs each dug one:
held to local bests alone it was drawn at 0.127 and claimed 48.1 %.

**The jumps, measured for the first time** (`verify/jumps.mjs`: 32 matched
designs per world, one door from the reference desk, 608 runs). Median, and the
10th to 90th percentile, in kelvin; every pair landed for every world:

| World one door away | Zone high | Zone low |
| --- | --- | --- |
| Terrain: Country | −0.94 (−1.85 to −0.29) | +0.26 (+0.09 to +0.38) |
| Terrain: City | +1.24 (+0.44 to +2.37) | −0.39 (−0.58 to −0.20) |
| Terrain: Ocean | −1.36 (−2.70 to −0.41) | +0.37 (+0.12 to +0.53) |
| With the neighbouring buildings | −0.26 (−1.41 to +0.00) | +0.22 (+0.02 to +0.49) |
| North wall adiabatic | +0.19 (−1.34 to +2.82) | +0.87 (+0.04 to +4.68) |
| East wall adiabatic | −1.73 (−7.11 to −0.34) | +1.14 (+0.05 to +3.75) |
| South wall adiabatic | +0.03 (−1.96 to +1.80) | +1.38 (+0.07 to +4.40) |
| West wall adiabatic | −2.38 (−8.42 to −0.19) | +0.79 (+0.06 to +4.36) |
| Roof adiabatic | +0.65 (−0.34 to +3.81) | +0.50 (+0.04 to +3.08) |
| Floor on the ground | −15.45 (−37.55 to −5.96) | +17.14 (+9.93 to +27.79) |
| Sheltered from wind | +3.03 (+1.28 to +5.79) | −1.43 (−2.29 to −0.75) |
| Lightweight slab | +1.42 (+0.40 to +2.93) | −0.31 (−3.33 to −0.01) |
| Timber slab | +2.60 (+0.89 to +4.61) | −0.31 (−3.54 to −0.01) |
| Ribbon windows | −0.65 (−1.69 to −0.24) | +0.07 (+0.02 to +0.16) |
| Full-height windows | +0.36 (+0.07 to +0.87) | −0.02 (−0.08 to +0.09) |
| Layered glazing | +8.55 (−9.66 to +27.19) | +0.72 (−0.79 to +4.49) |
| With rooflights | +1.71 (−0.22 to +14.75) | −0.55 (−3.57 to −0.01) |
| Without shading | +2.43 (+0.57 to +6.52) | −0.33 (−0.51 to −0.15) |
| With daylight dimming | exactly 0 on all 32 | exactly 0 on all 32 |

Three things the table says that nothing had measured. Grounding the floor is
the largest door on the desk by an order of magnitude, larger than any slider's
whole range. The layered glazing world's spread straddles zero on both readings,
so its median is a poor summary of it: which way that jump goes depends on the
rest of the design, and the island's consistency (26 of 32) is what says so.
And daylight dimming reaches nothing on a free-running desk with Gains out,
since there are no lights for it to dim, so it is reported as leading to the
same reading rather than drawn as an island, which is US2 scenario 7 happening
on the default desk rather than in theory.

**Measured on the annual evidence desk** (System, Gains and Daylight in, the
Golden NREL TMY3 year shipped with EnergyPlus 26.1, 16 bases and 512 designs,
1,278 annual runs in 1,120 s under Node through `verify/annual-plan.mjs`). This
is SC-008's record, and it stands whatever it came out as:

| Reading | Two moves | One move | Leading move |
| --- | --- | --- | --- |
| Energy use intensity | 52.7 % | 42.4 % | higher equipment 32 %, higher heating setpoint 20 %, narrower plan 17 % |
| Hours above 25 °C | 79.0 % | 45.8 % | higher cooling setpoint 81 %, deeper setback 17 % |

Scored, as the reference desk's are, without the screening bases the moves
were fitted on; with them, the rows first read 54.1 / 42.6 and 79.4 / 45.5.

The count against a threshold explained *more* than the energy reading, not
less, which is the opposite of what the spec feared. The sweet spots agree with
the spec's own annual evidence: SHGC ≈0.43 on energy use intensity (the spec
said near 0.41), plan width ≈28.6 m and depth ≈29.5 m (near 28 m), and the
heating setpoint at its limit rather than at a spot, as the spec's 12 °C case
predicted. None was named within the 0.15 margin.

**A fifth of the annual sample failed, in two classes, and both are the model's
rather than the plan's.** Of 1,278 runs, 153 crossed the setpoints
(`DualSetPointWithDeadBand: Effective heating set-point higher than effective
cooling set-point`), which the spec expects to appear as failed runs until the
model refuses that combination itself. And 140 failed at get-input on
`GetInternalHeatGains: Lights="LIGHTING", Sum of Fractions > 1.0`, which is a
fatal reachable from the Gains strip's own sliders and was not known before
this sample found it. Both are listed on the plan as failures with the engine's
sentence and are never drawn; they cost the screening five of its sixteen
bases, since a failed base takes its whole row of probes with it.

**The lever is looked for in both directions, and the first rule missed the
spec's own case.** A trade-off was stated taken for the first reading chosen,
with levers looked for only on the second, and every one of the five
trade-offs on the reference desk came back "nothing moves the low without
moving the high". The spec's case runs the other way: lower U-factor for the
winter low, at the cost of the summer high, bought back with SHGC. Both
directions are tried now, and U-factor reads *trade-off, paid by SHGC*: the
passive-design rule of thumb, derived from this building. `Classification.losing`
says which way it is stated.

**A sweet spot needs the screening to agree it matters.** The quadratic-in-one
fit handed the zone multiplier a spot on the high, though its effect on a zone
temperature is exactly zero at every point: curvature from other controls leaks
into one control's quadratic term. A spot is now named only where the control's
mean effect at the bases is at least the free threshold and most of the measured
gradients point toward it.

**Short forms are one word each, and the TAG budget is asserted over every
combination.** `words()` counts every whitespace-separated token, so the
research's own example, "Best ≈ 0.41 · EUI, est.", was six words against its
own budget of five. A tag now reads `Trade-off: High/Low; High ≈0.41 est.`.

## Invariants that fail quietly

- `Building.north_axis` is ignored (World coordinates); orientation lives in the
  vertices via `turn()`. Measure along a wall's own normal, never fixed axes.
- `Schedule:Compact`: `Until: 08:00` and its value are two fields, never one string.
  A `For: Holidays` row must precede `AllOtherDays` or holidays are Sundays.
- Weather file special days beat `RunPeriodControl:SpecialDays` unless
  `use_weather_file_holidays_and_special_days = No`. Unplaceable special days are
  ignored silently; count holidays as a set of days.
- Leave `RunPeriod.day_of_week_for_start_day` empty. Never offer a leap `begin_year`.
- A fifth weekday holiday is fatal; the grammar is closed at four and "last".
- TMYx files carry no holidays and no daylight saving.
- DDY files can hold the literal `N` in numeric fields; check every field the schema
  types numeric (`schema.field(type, name).t === 'n'`).
- Many stations lack the `DB=>MWB` cooling day; `DESIGN_DAYS` is an ordered list at
  fixed 1% / 99% severity. Monthly design days are never annual (names contain
  `Ann Htg` / `Ann Clg`). Letter the design day actually used.
- Field names drift between versions (`watts_per_floor_area`, `Enclosure Windows
  Total Transmitted Solar Radiation Rate`, `EnclosureAveraged`). Check the schema or
  `.rdd`.
- A thermostat control type number and its `Control 1` object must match; clear all
  three setpoint types each apply.
- A heating setpoint above the cooling one is a warmup fatal; System's `requires`
  blocks it (strict, equal runs). A study or survey row sweeping a control that takes
  its own channel out **refuses** that position (`sampleRefusal`, asked of every key
  in `job.omits`); a refusal is not a failed run.
- An economizer needs a cooling flow limit. Shading devices need the layered glazing.
- EnergyPlus merges vertices closer than 0.01 m and silently deletes the surface.
  `COINCIDENT` / `builds()` in `src/aperture.js`: write no shade that does not build.
- An interval chosen off a measured range must advance the cursor (`levelsFor` in
  `survey.js` returns `[]` for a span of a few ULPs).
- **Per-surface output variables (`*` key) are ruinously expensive.** Keep new outputs
  zone- or site-level.
- Any class that sets or unsets `display` and is toggled by `hidden` needs its own
  `[hidden]` twin (`all: unset` defeats the attribute too).
- `dataset` is getter-only: write `el.dataset.x`, never `Object.assign(el, { dataset })`.
- Never put `labels=` in a new-issue address: GitHub answers 404 to a reader who
  cannot label. Keep the whole address under 5,500 characters (GitHub fails from
  about 6,050); `handoff()` trims the log, oldest first, and says so.

## Conventions

- **No silent fallbacks.** When a path cannot get what it needs it throws, naming
  what was missing, and the caller refuses the whole operation in the interface. No
  previous value, default or nearest match. Missing data renders as an em dash and
  stays out of totals: zero is a measurement, missing is not.
- **Comments explain why, not what**, in prose, often with the measurement or error
  message that forced the decision. Match it.
- **Copy budgets and folds.** In view: the reading, its verdict or absence, and at
  most one short line. Method and citations go in a fold (`fold()` in `console.js`).
  Readings, verdicts, absence reasons, blocking reasons and refusals never go in a
  fold. Always-visible declaration strings are asserted against budgets in
  `src/copy.js`; new long text goes in `blurb`, `note` or `body`. Nothing is
  explained only on hover.
- **Interface work** follows `.interface-design/system.md`: four surfaces on one hue,
  hairline borders, no shadows, one accent (`--redline`), `--cold` / `--warm` only
  for signed physical quantities. Read it before touching visual design.
- **Prefer typed objects** (classes, frozen instances) over loose dictionaries.

## The consumer register

The shoebox is `idfkit-shoebox` in the consumer register,
`governance/consumers.toml` in idfkit-conformance (feature 004 of the
unification). The register says where this repository's idfkit level is written
and never states the level itself.

- **Where the level is declared.** `package.json`, `dependencies` of
  `@idfkit/core`, `@idfkit/schemas` and `@idfkit/weather`, exact pins. They are
  one release and must always carry one version. `@idfkit/engine` (a caret range)
  and `@idfkit/engine-assets` are recorded as outside the unification and
  governed by nothing here.
- **The entry point is the scoped packages, and that is first-class.** It is not
  a lag and not debt. Do not migrate to the shared `idfkit` name; no check asks
  for it and none may be satisfied by it (FR-037, FR-044).
- **The self-check.** `.github/workflows/check.yml` calls `check-consumer.yml` at
  a pinned governance tag. It fails when the register no longer describes this
  repository. Moving where the level lives or adding a governed package needs a
  register change in idfkit-conformance too; a plain bump does not.
- **Rehearsal.** `rehearse-candidate.yml` builds the page against an unpublished
  idfkit-js commit without touching the manifest or lockfile. With no test runner
  and no type checker, the production build is the whole rehearsal.
- **Adoption.** `bump-idfkit-js.yml` is dispatched by idfkit-js on each release,
  moves the three packages together, builds, and opens a pull request.

## Weather data

`src/weather.js` wraps `@idfkit/weather`. The 1.7 MB station index loads on the
first keystroke in the picker. climate.onebuilding.org sends no CORS header, so
requests go through `/onebuilding` (Vite proxy in dev, a second CloudFront origin in
production, or `VITE_WEATHER_PROXY`). `asIndexed()` is a temporary workaround. The
README predates the model console.

## Deployment

`shoebox.idfkit.com`: S3 + CloudFront, CDK app in `infra/` (own `package.json`),
deployed by GitHub OIDC (`AWS_PROFILE=idfkit` locally; no stored keys).

- A `v*` tag publishes the root; pushes to `main` publish `/dev/`; a pull request
  publishes `/<number>/` and closing it removes it. Same bucket and distribution.
- Channel builds pass `--base`; resolve assets against `import.meta.env.BASE_URL`
  (`/onebuilding` stays root-absolute).
- `dev` and all-digit top-level names are reserved (`CHANNEL` in
  `scripts/deploy.mjs`, mirrored in the stack's CloudFront function). `RELEASE_TAGS`
  in `infra/lib/shoebox-stack.ts` must agree with `deploy.yml`'s `tags:` filter.
- Previews run only for same-repo branches; the comment comes from the idfkit GitHub
  App (`.github/scripts/preview-comment.cjs`).
- Triage needs the repository secret `CLAUDE_CODE_OAUTH_TOKEN` (a one-year
  subscription token from `claude setup-token`, tied to the maintainer who made
  it; **renew by 2027-09-11**) and idfkit-bot's Issues read and write permission
  (granted 2026-09-11).
- The title block stamps its revision (`scripts/revision.mjs` →
  `__SHEET_REVISION__`, read only by `src/version.js`): bare version on a tag,
  `+sha` otherwise, `+unknown` if unreadable. Workflows check out with
  `fetch-tags: true`.
- `scripts/deploy.mjs` pre-compresses (brotli q9 above 4 MiB, q11 below); `.gz`
  files never carry `Content-Encoding`. The bucket is `RETAIN`. Pass
  `-c createOidcProvider=false` in an account that already has the provider.
