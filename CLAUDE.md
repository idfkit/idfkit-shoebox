# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # predev stages ~50 MB of engine assets, schemas and the station index
npm run build     # prebuild does the same staging
npm run preview
npm run deploy    # compresses dist/ and publishes it; needs a built dist/ and AWS credentials
npm run undeploy  # removes a preview; needs SHOEBOX_PREVIEW=<pr number>
```

`predev` / `prebuild` copy `@idfkit/engine-assets` into `public/energyplus/`, the
schema bundle into `public/schemas/`, and the TMYx station index into
`public/weather/`. All three are gitignored, so a fresh clone must run one of the
npm scripts before the page will load.

There is **no test runner and no linter** configured. See below for how changes
are actually verified.

## Verifying changes

Schema validation alone does not catch what breaks a run, and the browser is a
slow place to find out. EnergyPlus 26.1.0 is installed locally at
`/Applications/EnergyPlus-26-1-0`, and the idfkit MCP tools find it unaided, so
model changes should be checked outside the browser first:

1. Write a throwaway Node script that imports `src/model.js`, builds the document
   at several console positions, and writes each IDF to disk. Outside the
   browser the schema comes from `localBundle()` in `@idfkit/schemas/node`, not
   from `httpSource('/schemas/')`.
2. Assert idempotence: `applyModel` runs on every parameter change, so applying
   it three times must produce byte-identical output.
3. Run each IDF through `load_model` then `validate_model`,
   `check_model_integrity`, and `run_simulation`.
4. Read the run's `eplus.rdd` to confirm any output variable name exists rather
   than guessing its spelling, and grep `eplus.err` for "requested but not
   generated".

Then load the page and drive it. A design day solves in about 50 ms once the
engine is warm, so the whole desk can be exercised quickly.

## Architecture

A one-page client-side EnergyPlus demo, laid out as a drafting sheet with a
"model console" panel. The governing rule, which the whole codebase is arranged
around:

> **Everything drawn is read back off the `IDFDocument`.** Never letter the page
> from a variable when the model holds the answer. The axonometric projects
> `BuildingSurface:Detailed` vertices, the plate's datum lines come from
> `SizingPeriod:DesignDay`, the title block reads `Site:Location`, and the
> quantities are summed off surfaces with Newell's method.

### The through-line

```
controls.js  declares every control (typed classes) and groups them into Channels
     |
     +--> model.js   one applier per channel writes the IDF objects
     +--> console.js draws the strips from the same declaration
     +--> main.js    owns `params`, wires gestures, schedules solves, reads the ESO
```

`src/controls.js` is the single source of truth. A control exists once, as a
`Scale`, `Selector`, `Bearing`, `Facade` (four walls on one plan key), `Profile`
(a 24 hour band), `Calendar` (a twelve-month year) or `Days` (a list of dates),
attached to a `Channel`. The console draws it, the model applies it, and the
sheet's five dimension sliders look their specs up by key from the same place,
so the two surfaces cannot drift.

**To add a control:** declare it in `controls.js`, then write the field in that
channel's applier in `model.js`. Do not add markup, defaults, or label strings
anywhere else. `DEFAULT_PARAMETERS` is derived from the declaration.

**To add a control *kind*** — rarer, and it has two gates that fail in opposite
directions. `console.js`'s `buildControl` throws for a kind it cannot draw, so
the desk fails loudly at mount. `permalink.js`'s `readValue` is the quieter one:
its numeric regex runs *before* the per-kind switch, so a branch added inside
the switch is unreachable and every link carrying that key is refused as "not a
number". A non-numeric kind is taught above the regex, beside `selector`.

**Every parameter is a scalar, and four separate mechanisms rely on it**:
`commit`'s `params[key] !== value` guard, `encodeState`'s identity diff against
a frozen default, `decodeState`'s one-value-per-key rule, and `revert`'s
`Object.assign(params, DEFAULT_PARAMETERS)`. `Object.freeze` is shallow, so the
last of those would alias an array default straight into live `params` — and
`DEFAULTS_BY_VERSION.v1` is that same object, so the link format itself would
drift with no symptom until a shared link came back wrong. A list-valued control
carries canonical text and parses at the boundaries; `Days` is the worked
example.

### `applyModel` (src/model.js)

One idempotent function puts the whole desk into the document. It runs on every
parameter change and again at the end of `buildModel`, in strip order, because
later channels read geometry earlier ones wrote (shades need openings to hang
on).

- **Bypass removes, it does not zero.** A channel that is out has its objects
  deleted from the document. That is what keeps the drawing and the IDF agreeing
  about what is in the path.
- **`Channel.requires`** is a precondition on the rest of the desk. Unmet, the
  channel is not written at all and the strip states what is missing, rather than
  handing the engine objects it would reject.
- **`syncReporting`** owns every `Output:*` object and rewrites them all on
  every apply, to one of three profiles: `'sheet'` (the full apparatus),
  `'extremes'` (one hourly zone temperature series) or `'energy'` (that series
  plus four Monthly building meters, still channel-gated). Without the gating,
  EnergyPlus lists every unproducible variable at the end of the error file and
  inflates the warning count the title block reports. The lean profiles exist
  because a sweep sample is read for one series or four meters and used to
  carry the AllSummary tables, the DXF and the dictionary anyway — clear-and-
  rewrite rather than differential, so "lean then sheet" serializes
  byte-identically to "always sheet", which the sweep's restore depends on.
  Meters stay Monthly whatever the profile; see the `parseMTR` note below.
- **`must(doc, type, name)`** throws when an expected object is missing instead
  of quietly re-adding it. See "No silent fallbacks" below.
- **`applyRun` writes one `RunPeriod` per unbroken group of months** in the
  calendar mask, clearing and rewriting them all on every apply so the count
  can fall as well as rise. Months that do not touch cannot be one run period,
  and EnergyPlus is happy to be handed several — which is what lets a January
  and a July be solved without the spring between them. December and January
  are deliberately *not* joined into a wrapping period when the months between
  them are out: the engine allows it, but it would run them as one environment
  out of calendar order, and every reading here is lettered from the timestamps
  that come back.

### More than three environments

A run used to be two design days and at most one year. It can now be two design
days and up to six run periods, and everything that reads a run was already per
environment (`environmentRuns` in `src/readings.js`), so what changed is the
lettering rather than the arithmetic:

- **Which months an environment covers is read off its timestamps**, never off
  `params` — the desk may have moved since the solve. That is where the
  schedule's column heads, the bill's month count and the chart's ticks all
  come from.
- **`noun` is kept apart from `label`.** The finding says an environment in a
  sentence ("the run period's swing"); the schedule heads a column with it
  (`Run period · Jan–Mar`). The noun used to be cut out of the label with a
  string split, which produced "the jan–mar's" the moment a label carried
  dates.
- **The chart letters a band by how wide it lands**, not by what kind of
  environment made it: a design day is 24 hours out of 8,808 and gives up its
  label, a one-month run period is half of a two-month axis and keeps it.

### Skylights (channel 04)

Roof glazing is its own channel rather than a fifth face on the Glazing strip's
plan key, because almost nothing about it is the wall question rotated.

- **A rooflight is a `Window` on the roof, not a surface type.** EnergyPlus 26.1
  has no `Skylight` in the `FenestrationSurface:Detailed` type list, and needs
  none: the host surface is what makes it a rooflight. Everything on the sheet
  that has to tell wall glass from roof glass reads `building_surface_name` and
  looks the host's type up, never the object's name — `geometryFacts` does this
  for the ratio, and it is why the window-to-wall ratio did not start counting
  the roof.
- **There is no tilt control and there cannot be one.** A fenestration surface
  has to be coplanar with the surface it is cut into, so a monitor, a sawtooth
  or a south-tilted rooflight all need the roof itself to fold — a different
  building, not a different parameter.
- **The curb is detailed shading geometry, not `outside_reveal_depth`.** The
  field on `WindowProperty:FrameAndDivider` shades identically and costs one
  number instead of four surfaces per light. It is still the wrong choice here,
  for the reason `overhangOn` is written out as vertices rather than as
  `Shading:Overhang`: the drawing reads its geometry off the document, so a
  curb carried as a number would shade the run and never appear on the sheet.
  It is a real control — flush to 1.2 m takes 41 % off the transmitted solar at
  a 10 % roof ratio — and the one solar control a horizontal opening has.
- **`SKY_MAX` is a constant, not a reading off `params`.** The applier has to
  sweep sixteen opening names and sixty-four curb names on every apply so a grid
  that has just gone from four across to two takes its abandoned surfaces out
  of the document. That sweep costs 0.4 ms against a 50 ms design day; sizing it
  from the live count instead would leave orphans behind every shrink.
- **Nothing is subtracted from the roof.** A rooflight is a subsurface and the
  roof polygon still holds the area it sits in, which is what makes
  `roofGlazing / roofArea` the skylight-to-roof ratio a code means.
- **The blind control names only the surfaces it can serve.** `applyBlinds`
  filters to fenestration built of the layered `WINDOW` construction, because a
  `WindowShadingControl` naming a simple-glazing surface is a severe error, not
  a blind that does nothing. Rooflights on their own glass are therefore outside
  the blind, and the Skylights strip's glass selector says so — this is the one
  place on the desk where two engaged channels deliberately do not compose, and
  it is stated rather than discovered.

### Channels that price rather than simulate

`Plant` and `Tariff` carry `prices: true`. Nothing they own reaches the IDF, so:

- Their keys are **excluded from `shapeKey`** (`PRICED_KEYS` in `main.js`). Left
  in, every turn of a tariff would start a run that could only reproduce the
  numbers already on the sheet.
- `commit` routes them to `reprice()` instead of `pump()`, which re-letters the
  bill from the meters already in hand. Turning a boiler efficiency moves the
  bill within the frame and never touches the engine.
- They have no applier in `applyModel`. Their meters are `derived`, fed through
  `derivedReadings` like the geometry ones.

`Channel.requires.test` is handed `(params, on)` where `on(id)` reads whether an
earlier channel is engaged, so Plant can require System. Channels are declared in
physical order, which is the order those dependencies run in.

### The bill (src/bill.js, src/rates.js)

A priced schedule read off `Output:Meter`, sectioned into building and site.
Things that cost real debugging:

- **Ideal loads report as `DistrictHeatingWater` and `DistrictCooling`** —
  delivered heat at 100 % efficiency. There is no boiler in this model, so the
  Plant channel divides by a seasonal efficiency or COP *after* the run, and the
  schedule prints the division rather than hiding it.
- **`parseMTR` is `parseESO` under another name and mis-parses every meter.** A
  variable is declared `id,count,KEY,Name [units] !Freq`; a meter has no key, so
  the name lands in `keyValue` with its units and frequency still attached. A
  monthly meter's `[Value,Min,Day,...]` tail splits further on its commas, and an
  hourly meter's three-field line falls below the parser's minimum of four and is
  dropped from the dictionary entirely. The ids and the data survive, so
  `meterName()` in `bill.js` recovers the name from `keyValue`. That is also why
  the meters are requested **Monthly** — the one frequency that survives the
  parse, and enough to total the bill and draw the year.
- **An annual run contains the design days too.** Meters accumulate straight
  through all three environments; summed whole, a year's bill carried an extra
  48 hours of the most extreme weather in the file (about 3 % on the heating).
  `computeBill` is handed only the environments being billed.
- **The stock example's 5.25 kW of grounds lighting is 23 MWh a year**, against
  the building's 18. Undivided it swamps every envelope decision, so the schedule
  is sectioned and the per-m² intensity is of the building alone. It now lives
  behind the bypassable Grounds strip (off by default) rather than silently in
  the baseline — as do the stock file's other demonstration loads: the matched
  ±352 W `OtherEquipment` test pair and the `.mtr`-only meters are gone
  entirely, since nothing read either.
- **Per-m² is only drawn on a whole year.** Every published benchmark is annual,
  and 0.3 kgCO₂e/m² over two design days has no use but to be mistaken for one.
  A weather file is not by itself a year: the Run strip's calendar can leave
  months out, so `Bill.wholeYear` — twelve months of weather billed, counted
  off the environments that came back rather than off live `params` — is what
  gates the row, and a partial run says in the lede how much of the year it
  covers. The results schedule's demand rows are the one exception and they
  earn it structurally: a bill row stands under no head that says what period
  it covers, whereas a schedule column *is* the period (`Run period · Jan–Mar`,
  with its own hours a few rows up), so a partial year there reads as itself
  rather than as nothing.
- Rates come from six dated open datasets, generated into `src/rates.data.js` by
  `scripts/build-rates.mjs` (run by hand; needs the network and a Python with
  `openpyxl` and `xlrd`). Coverage is **North America by state and province**
  (EIA, StatCan) and **Europe by country** (Eurostat); everywhere else the
  tariff is `Absent` with a reason and reads as an em dash. Canada is derived
  rather than published: StatCan's only price table is a selling price *index*,
  which cannot become a rate, so the prices come from revenue over volume for
  the same customer class — the same derivation the EIA gas figures go through.
  `CAD` is its own `Currency` object rather than an alias of `USD`, so
  `comparable()` refuses to difference Winnipeg against Minneapolis.
- **Every price table is non-residential, and the interface says so.**
  `Source.kind` carries the sector in the reader's terms ("Commercial tariff",
  "Non-household tariff", "Commercial and institutional tariff"); it heads each
  meter head's citation and is named once in the lede. Each agency uses its own
  word for the same thing, so the label is per source rather than global.
- **Attaching a weather file switches `sizingPeriods` to `No`.** Done through
  `commit`, so the Run strip and the document agree and auto-solve picks it up.
  Verified locally that skipping the sizing periods introduces no warnings of
  its own.

### The solve scheduler (src/main.js)

One engine instance rejects a second `run()` while one is in flight, so the
sheet's own solves go through one `pump()` loop on a dedicated engine and it is
latest-wins: whatever the controls show when the engine comes free is what gets
solved, and shapes the drag passed through are skipped rather than queued. The
studies do **not** share that engine — they run on a pool of further instances
(`src/pool.js`, sized by cores and memory against the heap's 256 MB start,
capped at six), so the live sheet never queues behind a curve and `pumping` is
a plain boolean, not a mutex with holders.

`shapeKey` is `JSON.stringify([params, patching()])` minus `PRICED_KEYS`.
**Anything that reaches the IDF must live on `params`**, or it will move the
drawing and never be simulated — and anything on `params` that does *not* reach
the IDF must be declared on a `prices: true` channel, or it will start runs that
change nothing.

Auto-solve has two cadences: a design day (48 h, ~50 ms) re-solves continuously
during a drag; a weather file (8,760 h, ~0.7 s) re-solves once on release.

**A run in flight never blanks the sheet.** The four blocks a run letters —
the plate, the finding, the results schedule and the bill (`resultPanels`) —
stand with the previous run's numbers until the new ones replace them in
place, dimmed by `markStale` if the desk has moved past them. Blanking them
first, which the manual and annual paths used to do, moved the page under the
reader: the finding is a paragraph and `.finding:empty` is `display: none`, so
clearing it took three lines out of the flow and pulled everything below up
the page for the length of the run, then dropped it back. The readings are
taken down where they actually stop being true instead — `clearReadings` on
each of `solve`'s failure exits, where no new result is coming. That is also
why the clear is in two halves: a run that fatals has already written its own
exit code and warning counts into the title block, and those are the only
things on the sheet describing the failure, so only `clearResults` — a refused
link, a run that never reached the engine — takes them with it.

A **study** (`src/scheduler.js`, with `samplePoints`/`sampleOrder` in
`src/study.js`) queues per *sample*, not per study, so one sweep fans out
across the whole pool and a backlog of studies is just more samples in the same
queue. Each sample keeps two numbers off the hourly zone mean air temperature:
the high in the warm pen and the low in the cold one, read over the billed
environments (the year when there is one, so kept sizing days stay out;
otherwise the winter day owns the low and the summer day the high). With System
engaged and a year attached the reading is `readDemand` instead — TEDI, CEDI
and building EUI off the meters through `meterTotal`, by the bill's
building-section intensity rule, each sample divided by its own floor area. The
readers live in `src/readings.js`, DOM-free, so the harness calls the real
ones.

**The sheet reads the same three for the desk it is standing on.** A curve with
no point on it the reader can check against the run in front of them is a
comparison of hypotheticals, so the results schedule carries TEDI, CEDI and the
building EUI as rows and the finding says them in a sentence — the sheet's own
answer to the question a study asks of one control. `demandOver` is the shared
arithmetic: the schedule reads it **per environment**, because that is what a
column of that schedule is, and the finding reads `readDemand` over the billed
environments, so the columns sum to the sentence. Two rules keep the rows
honest: the meters' own presence is the gate (no `Heating:DistrictHeatingWater`
in the ESO means the System strip was out, and the three rows are omitted rather
than drawn as em dashes — a building with no system is not a missing
measurement), and everything is read off the run rather than off live `params`,
which is also what stopped the finding opening "with no heating or cooling
anywhere in this model" over a run that had just simulated an ideal unit.

A sweep never touches live `params`, and the one shared mutable is the model
document: `buildSample` applies the overlay with the metric's lean reporting
profile, writes the IDF and restores the live desk **in one synchronous
breath** — no await ever sees the document in overlay state, `setAnnual` is
bracketed both ways, and idempotence makes the restore byte-exact (the
throwaway harness asserts this). Only IDF strings reach the pool. Samples land
out of order; the card redraws per point in bisection order so the silhouette
stands after four runs. Points are cached by the sample's desk key plus metric
and run kind — never consulted by the pump — and two studies wanting the same
sample share one run.

`applyGeometry` is the one cancel point: anything that re-applies the desk
cancels the jobs whose `restShapeKey` no longer matches (the shape minus the
swept key, so moving the swept control itself only walks the study's tick),
and in-flight samples land into nothing — engine runs cannot be aborted, only
disowned. On the gesture's release `refreshStudies` re-queues every stale
study coarse-first (11 points, a strict subset of the 21-point grid, so the
idle densify pays only the ten new runs), gated by the auto-solve toggle and
by `linkAttachPending` — the button gate does not cover this path, and a
sample built during a link attach would fatal on zero environments. A Stop or
the global "Set studies aside" suppresses a key until the rest of the desk
next moves. Studies and the sample cache clear on a station change — sample
shapes deliberately carry no climate — and studies are absent on priced
channels.

**Setting a study aside and clearing it are different acts**, and the desk has
a global control for each. "Set studies aside" (status row) sheds the queue and
suppresses each key like a per-study Stop, so the work does not restart until
the desk moves; `clearAllStudies` — the desk head's **Clear *n* studies**,
beside Revert all — takes the curves down for good, cancelling as `'cleared'`
rather than `'shed'` because a study deleted from `studies` needs no
suppression: `refreshStudies` and `densifyStudies` both walk that map. The two
head links are the same gesture from opposite ends, which is why they sit
together: Revert all puts every control back and leaves the curves to re-sweep
themselves, Clear takes every curve down and touches neither `params` nor the
document, so no solve follows it. The count is read off the console's own cards
(`studyCount()`), not off `studies`: a sweep still landing has a card up before
it has a curve to store. The sample cache is deliberately kept — those runs are
still true of the desks they were solved for, so re-sweeping a cleared control
costs nothing.

Both buttons are declared at the head of the module with the study state rather
than beside their listeners: `syncStudyControls` runs from the station attach,
and a permalink carrying a station attaches during the boot awaits — before the
studies section at the foot of `main.js` has been evaluated. That is the same
hazard every `studyScheduler?.` in the upper half is spelled around, except
that a `const` in its temporal dead zone has no such spelling and simply
throws.

### The general notes (src/tour.js)

The onboarding, drawn the way a drawing set carries it: a numbered block of
general notes at the head of the sheet, not a modal tour. Six steps, each
bearing the run ledger's square marker — and a marker fills **only when its
step has actually happened on the desk**. `main.js` reports the real events
(`tour?.note('solve' | 'drag' | 'station' | 'desk' | 'patch' | 'link')`);
there is no Next button, because that would be the onboarding taking the
reader's word for it, which is the one thing this page never does. The first
unfilled note takes the redline and its subject on the sheet is circled with
the dashed markup hairline (`.guided`). Clicking a note stages the scene
(scrolls, opens the desk) but never fills the marker. State lives in
localStorage under a versioned key; all six taken retires the sheet on the
next visit, and setting it aside folds it to a one-line row that still reads.

- **The notes must be kept true to the app.** Any change that adds a feature,
  renames a control, moves a step's subject, or changes what a step teaches
  must update `NOTES` in `src/tour.js` (the copy and the `target` / `focus`
  selectors) and, where the flow changed, the `tour?.note(...)` call sites in
  `main.js`. An onboarding that walks a page that no longer exists is worse
  than none — treat updating the general notes as part of any feature's
  definition of done, and check them whenever a modification to the
  onboarding itself is requested.
- **Bump the storage key** (`shoebox-general-notes-v1`) whenever the steps
  change meaning, so a returning reader gets the new sheet rather than stale
  ticks against notes they never read.
- Completion only ever comes from the genuine event: the solve note from the
  end of a successful `solve()` (the early returns must not claim it), the
  drag note from a real slider or console gesture (priced keys excluded —
  they resolve nothing; programmatic `commit`s such as a station attach
  setting `sizingPeriods` must not count either, which is why the note is
  filed from the input listeners and not from `commit`), the station note
  from `choose()` attaching — a link's automatic attach counts, because the
  notes record what has happened on the desk, not who did it.

### The permalink (src/permalink.js)

The URL fragment carries the desk — params off their defaults, patch state,
station by WMO and TMYx window — rewritten by `endGesture`, so the address bar
updates when you let go and never during a drag. The codec is DOM-free and
validated the same way `model.js` is: a throwaway Node script asserting exact
round-trip of every key and refusal of every malformed input class.

- **Delta encoding makes the defaults part of the format.** An omitted key
  means "the default *as of that version*". Adding a control is free (old
  links take the new default, and new channels ship bypassed). Changing a
  default, renaming a key, or narrowing a range means bumping `LINK_VERSION`,
  freezing the outgoing defaults into `DEFAULTS_BY_VERSION`, and writing one
  `MIGRATIONS` step — the IDF version-transition arrangement, in miniature.
  `MIGRATIONS` is still empty: the calendar renamed the run period's
  `beginMonth` / `endMonth` pair to `months` and took the free pass the Grounds
  channel took, because there were no links in the wild to carry forward. That
  pass expires the moment one is shared.
- **Links are refused whole, never half-loaded.** `decodeState` validates every
  pair through the control declarations before returning anything, and a
  station that cannot be fetched at boot refuses the entire link back to
  defaults with the reason in the status line. Auto-solve is stopped on
  refusal so the next solve cannot overwrite the sentence saying why.
- **Reserved keys** (`in`, `out`, `stn`, `win`) are asserted against
  `ALL_KEYS` at module load, so a future control key cannot collide with one.
- **A pasted link is a same-document navigation** — the browser moves the hash
  and loads nothing — so a `hashchange` listener reloads the page into the
  boot decode. Gestures never trip it: `replaceState` fires no `hashchange`.
- **The station attach reuses `choose`**, handing it the link's own
  `sizingPeriods` so a link that kept the sizing days solves once, as itself
  (8,808 hours, not 8,760). A station link also defers the boot solve to the
  attach: minted links carry `sizingPeriods=No`, and solving that desk before
  the year arrives is a run with no environments at all — it fatals.
- **The address bar encodes `patching()`**, not the raw patch bay, because
  `patching()` is what reaches the IDF — a link copied under solo must
  reproduce the soloed building. There is exactly one scheme builder
  (`schemeHash`) for the bar, the clipboard and the bundle manifest alike.
- The run bundle's manifest cites the permalink of the *snapshot* that was
  solved, not live params, for the same reason it holds the exact IDF text.

### The index sheet (narrow screens)

Below the `780px` breakpoint the desk stops being a column beside the drawing and
becomes a page of its own, where sixteen strips end to end is about ten screens
with nothing in them to say which one you are in. So the strips fold to a line
each — number, name, reading, patch marker — and the console becomes its own
index, one screen tall, in signal order.

- **The breakpoint is declared once**, in the media query, as `--index` on
  `.strips`. `console.js` reads that flag back rather than repeating the number
  as a `matchMedia` string. Layout is CSS's decision; the module only asks which
  one it got.
- **Closed a row reads, open it is worked.** The folded row keeps the reading and
  the armed marker, because "readable without opening anything" is the rule the
  desk exists to honour; only the controls go behind the fold. The blocked note
  sits *outside* the fold for the same reason — a channel you cannot patch in has
  to say so on the index, not one tap further in.
- **`refold()` uses the `hidden` attribute**, so a folded strip's controls leave
  the tab order with it. On the wide layout every fold is open and the toggle is
  `disabled`, which is what keeps the desktop desk exactly what it was.
- **Opening anchors the tapped row**: the head's `top` is measured before the
  folds change and the difference is `scrollBy`-ed back after, or closing a strip
  above the one you opened yanks the page under your thumb.

### The balance rail

The console's signature. Five channel meters are terms of the zone *air* heat
balance and therefore sum. Non-obvious facts, each of which cost real debugging:

- Use the `Zone Air Heat Balance …` family and nothing else. Mixing in
  per-mechanism variables (infiltration in joules, ideal loads in watts) does not
  close, because those belong to different balances.
- `Zone Air Heat Balance Air Energy Storage Rate` is the accumulation side, so it
  enters negated.
- `Zone Air Heat Balance System Air Transfer Rate` is reported at **building**
  level, already multiplied by the zone multiplier, while the other four are per
  zone. `Term.perBuilding` marks it and the reader divides it back down.
- Meters read **one instant**, the hour furthest from 20 °C in the lead
  environment, not an average. A free-running zone returns to where it started,
  so every term averages to roughly nothing over a day and the whole desk reads
  zero.
- **That instant is chosen by the result, so it moves — and the pin is what
  holds it.** `worstHour` is an `argmax` over |T − 20| with two candidates half
  a year apart, so it is not a continuous function of any control, and it is
  chosen by one signal and then applied to all five meters. On Boston TMYx the
  two candidates sit 0.6 K apart: a concrete slab reads at 31.4 °C on 3 August
  (612 W of transmitted solar), and *only* changing the slab to lightweight
  reads at 5.6 °C on 21 January (no sun at all), because the lighter slab costs
  the winter night 3.6 K of coasting while adding 1.0 K to the summer peak and
  the ranking inverts. The transmitted-solar series is byte-identical between
  those two runs — 8,760 hours, max difference 0 W — so the whole apparent
  change was the hour. Both readings are true; the pair is not a comparison.
  `pinnedHour` in `main.js` holds the instant, and there are two controls for
  it: the rail's `Read at …` line holds whatever hour the run chose, and the
  **plate is clickable** to choose any other.
- **The plate carries the marker, because the plate has the axis for it.** A
  vertical hairline with the desk's armed square at its head and a dot on the
  zone curve — filled `--redline` when held, a dashed `--ink-ghost` outline
  when it is the run's own worst hour. The hour was previously stated only in
  the rail's footer, which made the most movable thing about the readings the
  least visible; the desk's rule is that a path reads without opening
  anything, and the hour those paths are read at now does too. Guarded on
  `lastReadFrom.points.length === plot.zone.length`, the way the gesture ghost
  is, because a station change redraws the plate with new datums while the
  previous run's curve still stands.
- **A click on the plate snaps by the axis's resolution, not by run kind.**
  `dayExtremeNear` takes the furthest-from-20 hour *within the clicked day*
  when there is more than one hour to the pixel — an annual trace is 8,760
  points across ~900 px, so a click can only honestly mean a day. A design day
  is 48 points across the same width, where a click already names its hour and
  snapping would leave the whole winter day reachable only at its coldest
  hour. Clicking the held hour again releases it, so the plate can undo its own
  gesture. `renderTrace` therefore runs **after** `readAt` in `solve` — drawn
  first it would post the previous run's instant.
- **The pin is a calendar stamp, not an index.** `{ kind, month, day, hour }`,
  where kind is `year` / `winter` / `summer` — by environment *kind* because
  the index is not a property of the desk (keeping the sizing days renumbers
  the year from 0 to 2). `resolvePin` re-finds it in each new run; when it is
  not there — a year pin in a design-day run, a design-day pin after a station
  attach sets `sizingPeriods=No` — the pin is **released and the rail says
  which hour went missing**, rather than sliding to the nearest one. It rides
  the permalink as the reserved key `at=year.8-3T13`, separator a full stop
  because `URLSearchParams` escapes `@`.
- **Turning the pin runs nothing.** It reaches no IDF object, so it stays off
  `params` (anything there starts a run) and re-letters from the ESO already
  held, exactly as `reprice` does for a tariff. It is `pinnedHour`, not
  `pinned` — the bill has held a pinned *scheme* since long before this.

## Known defect: bypassing Fabric fatals any run that has an opening

Patching out **Fabric** sends every wall and the roof to `Adiabatic`, and
EnergyPlus refuses a `FenestrationSurface:Detailed` or a `Shading:Zone:Detailed`
whose base surface is adiabatic:

    ** Severe ** FenestrationSurface:Detailed="ZN001:WALL001:WIN001",
                 invalid Building Surface Name="ZN001:WALL001".
    ** Fatal  ** GetSurfaceData: Errors discovered, program terminates.

So the flask the Fabric strip advertises is only reachable with Glazing,
Shading and Skylights all out as well. This predates the Skylights channel —
measured on the default desk at `main`, one wall window is enough to produce it
— and Skylights only adds more of the same severes. It is not fixable through
`Channel.requires` as the desk currently stands: `channelState` hands `on(id)`
only the channels already decided, in declaration order, and Fabric is declared
at 07, below all three of the channels that would need to ask about it. Fixing
it means either reordering that graph or giving `requires` a second pass, which
is a decision about the desk rather than about any one channel.

## Invariants that fail quietly

- **`Building.north_axis` is ignored** because `GlobalGeometryRules` declares
  World coordinates. Orientation lives in the vertices via `turn()` in
  `model.js`, and `north_axis` is pinned at 0. The axonometric un-turns the
  geometry with `square()` so the building is drawn square to the page under a
  north arrow that rotates, which also avoids the projection collapsing into a
  flat elevation at 45 degrees.
- **Geometry measured along fixed axes breaks under rotation.** Dimension lines
  take wall lengths off the wall's own bottom edge, and shade projection is
  measured along the host wall's outward normal (`reachOff`), not along x or y.
- **`Schedule:Compact`**: `Until: 08:00` and the value after it are two separate
  extensible fields. Joining them into one comma-bearing string produces a
  malformed IDF.
- **A `Schedule:Compact` with no `For: Holidays` row cannot tell a holiday from
  a Sunday.** `AllOtherDays` is the catch-all and it swallows them, which is why
  the Run channel's holiday switch changed nothing whatever for as long as the
  Gains channel had no row to go with it. The row goes *before* `AllOtherDays`;
  at `holidayUse: 'AsWeekend'` none is written, which is exactly what that
  setting means and what keeps the default IDF byte-identical.
- **The weather file's special days take precedence** over
  `RunPeriodControl:SpecialDays`, so "Listed" has to write
  `use_weather_file_holidays_and_special_days = No` or the listed days lose
  silently where they collide. The two are otherwise independent fields: `No`
  turns off the *file's* days and leaves the objects standing, which is why
  file-plus-list is a real state and not a contradiction. Special days are also
  never used with a `SizingPeriod:*` — a design-day desk has no calendar at all.
  A special day the run cannot place is silently ignored, and there is no
  reading of it anywhere in the output: the error file says nothing, and the
  `.eio` echoes every special day under *every* run period whether it lands or
  not. Measured twice — a January-plus-June-to-August mask carrying the eleven
  US federal holidays simulated four of them, and a November-to-December mask
  carrying a nine-day Christmas shutdown simulated eight of its nine days, both
  runs clean. So the desk counts what reaches the engine, and counts it in
  **days as a set**: holidays overlap, the schema says outright there is "no
  error message on duplicate days or overlapping days", and the engine marks a
  day once however many entries claim it. Summing the entries instead read
  eleven days where the engine flagged ten, because a shutdown from 24 December
  swallows Christmas and — wrapping past the year end — New Year too.
- **`RunPeriod.day_of_week_for_start_day` must be left empty.** Pinned to
  Tuesday, as it was, it overrode what every weather file says about itself —
  TMYx declares `DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31` — and put the run on
  an invented calendar in which the third Monday of January fell on the 21st.
  Empty, EnergyPlus takes the file's start day and picks a real non-leap year to
  match (2017 for a Sunday), and every nth-weekday holiday lands where it really
  does. The field anchors to the *run period's* begin date, not to 1 January, so
  leaving it empty is what keeps *every* period on one calendar — the field
  anchors to each period's own begin date, so pinning it would start a January
  and a June on the same weekday and put them in two different years. Empty,
  measured: January begins Sunday and June begins Thursday, which is 2017.
  Setting `begin_year` explicitly works too, but a **leap** year silently runs
  365 days against a 365-day file and shifts every date after February — do not
  offer one.
- **A fifth weekday is fatal, not a warning.** `5th Monday in December` in a
  year that has only four stops the engine dead —
  `** Severe ** SetSpecialDayDates: … not enough Nths` — so the holiday grammar
  is closed at four. Every month has 28 days, so a first through fourth and a
  last exist in every year, which makes the grammar total: every list that
  parses runs, under every calendar. `.harness` asserted that over all
  7 × 12 × 7 × 5 combinations before it was believed.
- **Every TMYx file names no holidays and no daylight saving period.** Measured:
  `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0` on Denver 725650 and Berlin-Tegel 103820
  in the 2009–2023 window, and on all five EPWs shipped with EnergyPlus 26.1. So
  "From file" reads an empty list, and the daylight saving control beside it is
  inert for the same reason. `src/epw.js` reads the header so the strip can say
  that rather than let an empty reading pass for a zero.
- **Field names drift between EnergyPlus versions.** `Lights` and
  `ElectricEquipment` use `watts_per_floor_area`, not
  `watts_per_zone_floor_area`. In 26.1 transmitted solar is
  `Enclosure Windows Total Transmitted Solar Radiation Rate`, not the older
  `Zone Windows …`. Check with `describe_object_type` or the `.rdd` rather than
  from memory.
- **An economizer requires a cooling flow limit**, or EnergyPlus raises a severe
  error. Nothing here is autosized, so the limit is computed from zone volume.
- **A shading device cannot be hung on `WindowMaterial:SimpleGlazingSystem`**,
  which is why the Blinds channel requires the layered glazing model.
- **Per-surface output variables are ruinously expensive.** Requesting them with
  key `*` took the ESO from 15 series to 173 and the annual run from 681 ms to
  2,984 ms, almost all of it after the simulation finished. Keep new output
  requests zone-level or site-level.
- **`all: unset` defeats the `hidden` attribute.** It re-declares `display`, and
  an author declaration beats the user agent's `[hidden] { display: none }`
  outright, so `el.hidden = true` on a `.link` did nothing whatever. Measured in
  Chromium on this page: `#studies-stop` rendered at all times, offering to set
  aside studies that did not exist, for as long as that button has existed. The
  stylesheet's other `[hidden]` twins — `.bill[hidden]`, `.strip-fold[hidden]`,
  `.face-ghost[hidden]` and the rest — are each the same fix, and `.link[hidden]`
  is now among them. Any new class that sets `display` (or unsets it) and is
  toggled by the attribute needs its own.

## Conventions

**No silent fallbacks.** When a code path cannot get what it needs it throws,
naming the specific thing that was missing, and the caller refuses the whole
operation and says so in the interface. Do not substitute a previous value, a
default, or a nearest match. The worked example is the weather picker: a station
whose DDY cannot be read is refused entirely rather than running one city's year
against another city's design conditions. The visual half of this is that a
reading with no data behind it renders as an em dash and stays out of any total,
because zero is a measurement and missing is not one.

**Comments explain why, not what.** The house style is prose, often several
sentences, recording the reasoning and frequently the measurement or the error
message that forced a decision. Match it.

**Interface work** follows `.interface-design/system.md`: four surfaces on one
hue, hairline borders and no shadows, one accent (`--redline`) plus a cold/warm
pair reserved for signed physical quantities. Read it before touching visual
design.

**Prefer typed objects** (classes with constructors, frozen instances) over loose
dictionaries, especially for declarations like the ones in `controls.js`.

## Weather data

`src/weather.js` sits over `@idfkit/weather`. The 1.7 MB station index is fetched
lazily on the first keystroke in the picker and kept for the session.
climate.onebuilding.org sends no CORS header, so requests go through the
`/onebuilding` dev-server proxy in `vite.config.js`; in production the same
rewrite is a second CloudFront origin (see Deployment), or a proxy origin in
`VITE_WEATHER_PROXY`.
`asIndexed()` is a temporary query-normalisation workaround pending a fix
upstream.

The README documents the weather picker, the output-variable measurements, and
the glazing and overhang parameter studies in detail. It predates the model
console, so where it describes five sliders and `setParameters`, the current code
has the console and `applyModel`.

## Deployment

Served at `shoebox.idfkit.com` from an S3 bucket behind CloudFront, defined as a
CDK app in `infra/` (TypeScript, its own `package.json`, so the page's toolchain
stays vite and nothing else). Pushing to `main` publishes:
`.github/workflows/deploy.yml` assumes a role by GitHub OIDC and runs
`npm run deploy`. No AWS key is stored.

Opening a pull request publishes a preview at `shoebox.idfkit.com/<number>/`
(`.github/workflows/preview.yml`), and closing it takes the preview down again.

- **A preview is the same bucket and the same distribution**, under the pull
  request's number as a key prefix. A separate host would leave the two things
  that actually break a deployment of this page untested: the `/onebuilding`
  weather origin and the pre-compressed engine both exist only at the edge.
- **The preview build carries its base**: `npm run build -- --base=/42/`.
  `src/main.js` and `src/weather.js` resolve the engine, the schema bundle and
  the station index against `import.meta.env.BASE_URL` for this reason. Written
  as `/energyplus`, a preview would load the published site's staged assets and
  report on those. `/onebuilding` is the exception and stays root-absolute — it
  is a distribution behavior, not a file this site publishes.
- **The top-level numeric directory is reserved.** `scripts/deploy.mjs` spares
  keys matching `^\d+/` when it prunes the site, and a preview run
  (`SHOEBOX_PREVIEW=42`) never lists or deletes outside its own prefix. Without
  the first half, the next push to main would delete every open pull request's
  preview.
- **`/42` and `/42/` reach the preview through a CloudFront function.**
  `defaultRootObject` covers exactly one path, `/`, so a subdirectory index has
  to be appended by hand; the bare `/42` is redirected rather than rewritten.
- **The preview job is gated twice.** GitHub gives a fork's pull request a
  read-only token whatever `permissions` says, so no OIDC token is minted and
  the role is unreachable; the job additionally refuses to run unless the head
  branch is in this repository. The role's trust policy accepts
  `…:pull_request`, which carries no branch, so raising a preview takes write
  access — the narrowing has to live in the workflow.
- **The comment comes from the idfkit GitHub App**, which needs `APP_ID` and
  `APP_PRIVATE_KEY` as repository secrets (the same pair `idfkit` uses in
  `notify-downstream.yml`) and Pull requests: write on the installation. One
  comment is kept per pull request, found again by an HTML marker; see
  `.github/scripts/preview-comment.cjs`, which is `.cjs` because this
  `package.json` declares `"type": "module"` and github-script's `require`
  needs CommonJS.
- **The `/onebuilding` rewrite is infrastructure, not code.** A second origin on
  the distribution points at climate.onebuilding.org and a viewer-request
  function strips the prefix, because CloudFront can prepend an origin path but
  never remove one. This mirrors the Vite proxy deliberately: a picker that
  works on localhost and 404s in production is the exact failure the arrangement
  exists to prevent.
- **`scripts/deploy.mjs` compresses; CloudFront is not trusted to.** The edge
  compresses only objects between 1 KB and 10 MB whose content type is on its
  list. The engine binary (28.40 MiB) and schema (9.88 MiB) exceed the ceiling,
  and `.idd` arrives as `application/octet-stream`, which is off the list. The
  difference is about 45 MB against about 10 MB on a cold visit. Brotli quality
  is picked by size: q9 above 4 MiB, q11 below, because q11 on the binary costs
  62 s to save 0.93 MiB over q9's 3 s.
- **`.gz` files must never carry `Content-Encoding`.** The page inflates
  `stations.json.gz` and the schema bundle itself with `DecompressionStream`.
  Declaring the encoding would have the browser inflate them first.
- **The bucket is `RETAIN`.** `cdk destroy` must not be able to take the
  published site with it.
- **Whether the GitHub OIDC provider is created or imported is per account.**
  IAM allows exactly one per issuer URL, so `createOidcProvider` decides it. The
  idfkit account had none, so it is created; an account that already has one
  must pass `-c createOidcProvider=false` or the deploy fails with
  `EntityAlreadyExists`. Neither mistake is silent.
- **Everything is in the idfkit AWS account**, including the `idfkit.com` hosted
  zone, so the stack looks the zone up instead of hardcoding an id and no
  account number enters the repository. Deploy with `AWS_PROFILE=idfkit`, which
  is what fills in `CDK_DEFAULT_ACCOUNT`.

Cloudflare Pages cannot host this at all: its hard per-asset limit is 25 MiB and
the engine binary is 28.40 MiB. GitHub Pages, which serves `idfkit.com`, cannot
do the `/onebuilding` rewrite.
