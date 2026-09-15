# Design notes

The long-form record behind `CLAUDE.md`: the reasoning, the measurements and the
error messages that forced each decision. `CLAUDE.md` is the short form and cites
these sections by name.

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
   from `httpSource('/schemas/')` — and it wants the full version string,
   `load('26.1.0')`.

   Where no EnergyPlus is installed — a CI box, a container — the staged engine
   runs the same models under Node without one. `public/energyplus/energyplus.js`
   is an emscripten build that detects Node, so `require`-ing it after setting
   `global.Module` to `{ noInitialRun: true, locateFile }` gives you `FS` and
   `callMain(['-d', '/output', '-w', '/weather.epw', '/input.idf'])` — the same
   call the worker makes — and `/output/eplusout.err`, `.eso` and `.mtr` to read
   back. It latches onto whatever `global.Module` held when the script was first
   evaluated and EnergyPlus's `main` is not re-entrant, so clear the require
   cache between runs. A design day is about 0.6 s.
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

> **Everything drawn is read back off the `IdfDocument`.** Never letter the page
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
     +--> field.js   the editable number both of those surfaces letter a value with
```

`src/controls.js` is the single source of truth. A control exists once, as a
`Scale`, `Selector`, `Bearing`, `Facade` (four walls on one plan key), `Profile`
(a 24 hour band), `Pattern` (24 hourly fractions), `Boundary` (six surfaces on
one plan), `Calendar` (a twelve-month year) or `Days` (a list of dates),
attached to a `Channel`. The console draws it, the model applies it, and the
sheet's five dimension sliders look their specs up by key from the same place,
so the two surfaces cannot drift.

**To add a control:** declare it in `controls.js`, then write the field in that
channel's applier in `model.js`. Do not add markup, defaults, or label strings
anywhere else. `DEFAULT_PARAMETERS` is derived from the declaration.

**To add a landmark** — the named cases a scale is read against — declare it in
the `LANDMARKS` section of `controls.js` and hang it on the control with
`landmarks:`. Nothing else is needed: `console.js` rules it under the
calibration face, the plan key rules it along each wall's bar, and the sheet's
own sliders read the same declaration. See "Landmarks" below for the rules a
declaration has to meet, all of which throw at module load.

**To add a control *kind*** — rarer, and it has four gates that fail in
different directions. Two of them are here: `console.js`'s `buildControl` throws
for a kind it cannot draw, so the desk fails loudly at mount, and
`permalink.js`'s `readValue` is the quieter one, since its numeric regex runs
*before* the per-kind switch, so a branch added inside the switch is unreachable
and every link carrying that key is refused as "not a number". A non-numeric
kind is taught above the regex, beside `selector`. The other two, key ownership
and `assertHideable`'s refusal of a `when` the console cannot draw, are worked
through under "The `Pattern` control kind" below, which is the most recent kind
added and met all four.

A kind that owns *more than one key* — `Facade`, `Profile`, `Boundary` — has
three more places to be taught, all in `controls.js`: `Channel.keys()`, the
`INDEX` that `controlFor` reads, and the `DEFAULT_PARAMETERS` loop, which skips
the multi-key kinds and takes their defaults either from `LOOSE` or, as
`Boundary` does, from the sub-objects themselves. `labelFor`, `phraseFor` and
`formatValue` then have to know what one of those sub-objects is called, since
each of them switches on the third field `controlFor` returns.

**Every parameter is a scalar, and four separate mechanisms rely on it**:
`commit`'s `params[key] !== value` guard, `encodeState`'s identity diff against
a frozen default, `decodeState`'s one-value-per-key rule, and `revert`'s
`Object.assign(params, DEFAULT_PARAMETERS)`. `Object.freeze` is shallow, so the
last of those would alias an array default straight into live `params` — and
`DEFAULTS_BY_VERSION.v1` is that same object, so the link format itself would
drift with no symptom until a shared link came back wrong. A list-valued control
carries canonical text and parses at the boundaries; `Days` is the worked
example.

### Landmarks (src/controls.js)

A `Scale` or a `Facade` may carry `landmarks`: the published cases its number
is read against, so that `1.80 W/m²K` also reads as *double, low-e* and a
reader who does not yet think in W/m²K has somewhere to stand. They reach no
IDF object — a throwaway harness asserted the document is byte-identical at six
desk positions before and after they were added — so nothing here can move a
result, only explain one.

- **A landmark is a band, not a point**, because that is the shape of the fact:
  double glazing is 2.7 to 3.0 W/m²K depending on cavity, fill and spacer.
  Leaving `to` off closes the band to a point, which is for a *limit* — a code
  maximum, an engine default — and draws differently from a range on purpose.
- **`note` is required**, and that is the point of the class. A landmark is the
  interface making a claim about the world, and a claim nobody can check is
  what the rest of this sheet exists not to print. The note carries the source
  and rides into the mark's `title` and the face's `aria-description`.
- **A convention says that it is one.** 136 of the 149 cite a standard; 13
  cannot, because nobody legislates the depth at which an overhang stops being
  a reveal and becomes a canopy — and those are the bands an architect reads
  fastest, since they name the thing you would have to build. They open with
  the `CONVENTION` prefix, or a convention would sit beside an ASHRAE clause
  looking exactly as authoritative, which is the sheet asserting under cover of
  citing.
- **Anything derived is arithmetic somebody can redo, so it has to be right.**
  A note that converts an R-value to a U-value, or an imperial figure to SI,
  is checkable and five of them were wrong on the first pass: the wall and roof
  uninsulated bands understated their U-values (the roof's films are 0.14, not
  the wall's 0.17), the Passive House roof band quoted 0.10–0.15 for what is
  really 0.07–0.11, the 62.1 people rate cited 2.36 L/s from a band that
  started at 2.5, and the slab's "diurnal depth" gave the CIBSE effective
  figure of 0.10 m under the name of the diffusion depth, which is 0.16 m.
- **Three rules throw at module load** (`readLandmarks`): inside the face's
  range, no two overlapping, and — the one that had to be found by writing the
  check — **reachable on the control's own step grid**. `input[type=range]`
  only ever returns `min + n·step`, so a band falling between two positions
  draws, names a case in its tooltip, and can never once be the reading. Five
  did exactly that: the BLAST constant 0.606 against a 0.01 step, the DOE-2
  wind term 0.224 against 0.005, and ASHRAE's lighting allowances, which are
  imperial figures landing at 6.89 and 10.76 W/m² against 0.1. They are
  declared now as the narrow band the rounding actually makes, with the
  published figure in the note.
- **`landmarkAt` is the one reading of where the tick stands**, and every
  surface that lights a mark or letters a band takes it from there — the face's
  rule, the sheet slider's, the plan key's bars and its legend. Lit from each
  mark's own `holds` instead, the four came apart at a zero stop and the
  default Air strip drew marks at full graphite over a line left blank.
- **At a `zero` stop, only a landmark *of that stop* stands.** The distinction
  is the difference between the two claims a mark at the bottom of a face can
  make. A band that merely reaches zero on its way up is claiming the quantity
  in some amount — `infiltration` has a Passive House band open at 0, and 0 ACH
  is a sealed box and not a Passive House envelope — so it is suppressed, and
  the readout's own `Sealed` is that position's only true landmark; `standing`
  stays silent past it too, since "past a brick leaf" over a wall with no
  masonry is a different statement rather than a rounder one. A landmark that
  *is* the zero point is claiming the absence itself, which is what the reader
  is looking at: `infWind` and `infStack` start at `None` because C = 0 and
  B = 0 are the engine's own defaults, and saying so is the whole value of the
  mark. Blanket silence cost both of them and split the three coefficients of
  one equation across two behaviours on one strip, since `infConstant` carries
  no `zero` label and went on reading `DOE-2` at the same position. The fourth
  `readLandmarks` rule throws for a band left permanently unreadable this way.
- **Only where somebody published it.** Most of the desk carries none: nobody
  publishes the width a shoebox ought to be. That absence is the honest answer,
  and the same rule as the em dash on the drawing.
- **`phrase` is kept apart from `label`** for the reason `noun` is kept apart
  from `label` on an environment: the face letters `Double, low-e` on its own
  and says "between low-e double and clear double" in a sentence, and one
  string cannot do both.
- The blind's **slat angle** is the landmark that most needed writing down.
  `WindowMaterial:Blind.slat_angle` is measured from the *glazing's outward
  normal*, so 0° and 180° are **closed** and 90° is **open** — the opposite of
  what a 0–180° slider suggests. Nothing on the face said so, and a reader
  assuming the other convention got the shading exactly backwards.

### The margin numbers (src/field.js)

Every number a slider carries is also the way to set it: a text input with the
box taken off, lettering exactly as the `output` it replaced. A slider alone
cannot say an exact figure — width runs 4 to 40 m across about 200 px, which is
0.18 m to the pixel — so 12.00 m used to be a hundred presses of an arrow key.

- **The two halves live where their twins live.** `quantityField` in
  `field.js` is DOM and nothing else; the parsing is `Ruled.parse` in
  `controls.js`, beside the `format` it undoes — one copy for a scale and a
  plan key alike, as `format` and `fraction` already were, so a unit or
  a stop changed in the declaration changes what the box will accept. Both
  surfaces call the one function: the console's scales and plan-key legends,
  and the sheet's five dimensions.
- **A typed value is brought onto the control's own face** — clamped to the
  stops, snapped to the step, and rounded to the step's own decimals, because
  `0 + 3 * 0.05` is 0.15000000000000002 and that number would ride the
  permalink and be written into the IDF as it stands. Anything that is not a
  number is refused whole and the model's own value comes back, the way a bad
  link is refused: no half-reading of `12abc`.
- **Focus shows the value, blur shows the lettering.** The unit is not part of
  what you are changing, and the lettering is lossy where a control's step is
  finer than the digits it is drawn to (`height` defaults to 4.572 m and reads
  `4.57 m`; `wallR` steps by 0.005 and reads to two places). Offered its own
  lettering to edit, a reader who touched the box and left it alone would have
  trimmed 2 mm off the building — so the box compares what it gave against what
  it got back and **commits nothing when they are the same**.
- **A redraw never types over the reader.** `show()` returns early while the
  field holds focus, because a study tick, a landing solve or a station attach
  redraws every face on the desk and one of them may be being typed into.

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

### Glazing (channel 03)

Two models of the same window, and the strip only ever shows one of them: the
simple one is three numbers off a product sheet, the layered one is an assembly
built out of panes.

- **The layered unit is built from a pane count, not fixed at double.**
  `applyGlazing` writes `panes` sheets of 6 mm clear float with `panes - 1` air
  cavities between them and hands the `Construction` `2n - 1` layers. Measured
  on the default desk (13 mm air, uncoated): U 2.675 at two panes, 1.732 at
  three, 1.285 at four, and 0.932 at four with a 0.04 coating. The coating goes
  on the *cavity* face of the inboard pane — surface 3 in a double, 5 in a
  triple — which is `front_side_infrared_hemispherical_emissivity` on that one
  material and 0.84 everywhere else.
- **`PANE_MAX` is a constant read off the control**, exactly as `SKY_MAX` is
  and for the same reason: the applier sweeps every pane and cavity name on
  every apply so a unit that has gone from four panes to two takes its
  abandoned layers out of the document, and a literal here would leave orphans
  the first time the slider was widened. Verified: a document taken from four
  panes to two serializes byte-identically to one built at two.
- **The engine's own U-factor and SHGC are read back off the run.** The layered
  model is the only place on this desk where you set causes and are handed no
  result, so the Glazing strip carries a `Readout` — a second block beside the
  meter, lettering what EnergyPlus computed for the assembly. It is a reading
  like any other: an em dash before the first run, taken down with the rest by
  `clearReadings`, and null rather than zero when the channel is out.
- **The tabular report is the only route to those figures.** The .eio carries
  the same numbers under `WindowConstruction` and would be the cheaper parse,
  but the engine hands back .eso, .mtr, .rdd, .mdd, .csv and `eplustbl.htm` and
  no .eio at all; the .sql holds them and costs a `sql.js` dependency to open.
  So `glassProperties` in `readings.js` parses the htm — DOM-free, like the
  rest of that module, and **by column head rather than by position**, because
  the table has grown columns between versions (the NFRC assembly trio is newer
  than the glass one) and a counted index would silently read the wrong one.
- **It reads the row for a named construction, never the table's own "Total or
  Average".** That row is area-weighted across every exterior opening in the
  building, so with rooflights on their own glass it averages two different
  windows into a number no assembly has — measured, 1.732 and 2.603 averaging
  to neither. Every surface built of one construction reports the same three
  figures, so the first row carrying the name is the assembly exactly.
  `WINDOW_CONSTRUCTION` is exported from `model.js` so the name is not typed
  twice.
- **The whole-window line appears only where there is a frame.** EnergyPlus
  fills the Assembly U-factor / SHGC / VT cells only for an opening carrying a
  `WindowProperty:FrameAndDivider`; with none they arrive empty, and
  `Number('')` is 0, which would have printed a U-factor of zero over every
  frameless window. The reader treats an empty cell and a lone hyphen as
  absent.
- **The ratio is the rough opening, and the frame is inside it.** It used to be
  the glass alone, with `WindowProperty:FrameAndDivider` laid round it
  afterwards, and a ratio near 0.9 under a frame near 0.2 handed the engine a
  window bigger than its wall: `Window Surface="ZN001:WALL001:WIN001" area
  (with frame) is too large to fit on the surface`, then a get-input fatal.
  The engine's test is **area and nothing else**: the wall less its glass
  against the ring `(w + 2f)(h + 2f) − wh`. The sill has no part in it, and a
  frame standing 0.15 m past the head of its wall runs clean. So `sizeOpening`
  in `src/aperture.js` sizes the rough opening to the ratio and the glass to
  what is left inside the frame, which makes the fatal unreachable at any ratio
  below 1. That also makes the ratio what its own `Code limit` mark means,
  since ASHRAE 90.1 measures fenestration over the rough opening, frame
  included. An unframed desk is byte-identical to the old rule; a framed one
  has less glass for the same ratio. `geometryFacts` reads the ratio back as
  glass plus the engine's own frame ring, and `glazing` stays the glass alone.
- **A small ratio under a wide frame is refused on the wall.** A 0.10 ribbon on
  a 3 m wall is a 0.30 m band, and 0.2 m of frame top and bottom leaves no
  glass. The old rule reported that desk as 0.10 while building 0.23. Now the
  wall's `Side` greys it and prints the two sides of the opening and the frame
  width, and `apertureOn` writes no window there. Both ask the one predicate,
  `openingFor(params, face, ratio).glazes`, asked of the desk rather than of
  the drawn wall, because a turned wall's length differs from `width` by an
  ulp and the two could otherwise disagree at the ratio where the answer
  changes. `opens()` in `controls.js` is the "is there glass on this wall"
  question for everything downstream: `glazed`, the shading and openable keys,
  and the Air strip's opening count.

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
  from the live count instead would leave orphans behind every shrink. It is a
  constant of the *declaration* rather than a literal — `SKY_MAX` is the square
  of `controlFor('skyCount').control.max`, and the same control's stops clamp
  the grid in `rooflightsFor` — because a literal repeated in two places is how a
  later widening of the slider becomes a silent clamp and a sweep one square
  short.
- **Nothing is subtracted from the roof.** A rooflight is a subsurface and the
  roof polygon still holds the area it sits in, which is what makes
  `roofGlazing / roofArea` the skylight-to-roof ratio a code means.
- **A linear rooflight can be too thin to exist, and the strip refuses it.** A
  band's depth is about r·d/n, so at the first stop off zero, 0.005, four bands
  on a 4 m deep plan are 5 mm deep and EnergyPlus merges their long edges:
  `** Severe ** GetSurfaceData: There are 4 degenerate surfaces`, a completed
  run, and a roof simulated solid under rooflights the drawing showed and a
  ratio of 0.005 read off their vertices. A curb makes it 12, since each band's
  end faces are as thin as the band. `rooflightsFor` in `src/aperture.js` lays
  the lights out for both modules, the Skylights channel's `requires` asks its
  `builds`, and so the strip goes out with a declared sentence in `SKY_REASONS`
  and `applySkylights` writes nothing. The sentence is held to the `STANDING`
  budget, so the arithmetic a reader would check it by is in the count
  control's note, which folds. `skylightsOn` throws if it is asked anyway.
  The reader can still move the ratio or the count out of it, since a blocked
  strip is dimmed and not disabled. Over the whole grid it bites only at 0.005
  with three or four bands on a plan up to 7.8 m deep. Square lights never
  reach it: the smallest anywhere is 0.071 m, a 1 m cell at √0.005.
- **The blind control names only the surfaces it can serve.** `applyBlinds`
  filters to fenestration built of the layered `WINDOW` construction, because a
  `WindowShadingControl` naming a simple-glazing surface is a severe error, not
  a blind that does nothing. Rooflights on their own glass are therefore outside
  the blind, and the Skylights strip's glass selector says so — this is the one
  place on the desk where two engaged channels deliberately do not compose, and
  it is stated rather than discovered.

### The six boundaries (channel 07)

Which of the box's six surfaces are adiabatic is a control. `Boundary` is a
control kind of its own, owning a `Face` per surface, and the whole reason it
is not six `Selector`s is that the second state is not the same question six
times: a wall or a roof opens onto `Outdoors`, a floor onto `Ground`. Two
states and no third makes the gesture a flip rather than a choice.

- **The floor's old `floorBoundary` selector is the sixth face**, under the
  same key, with the same two options and the same default. That is deliberate
  and it is what keeps the link format still at `v1`: adding the five new keys
  is free under delta encoding, whereas renaming that one would have cost a
  `LINK_VERSION` bump and the first entry in `MIGRATIONS`.
- **The key is a plan with a section drawn through it.** The four walls are the
  edges of the plan and turn with north, as the glazing key's bars do; the roof
  and the floor are the two surfaces a plan cannot show at all — it is a
  horizontal cut and they are what it cuts through — so they are drawn as the
  section they would appear in, roof over floor, inside the square. An
  adiabatic surface is a doubled line, which is how a plan has always drawn a
  party wall; open to the weather is a single hairline.
- **The legend entries are the buttons.** The six marks in the drawing are
  pointer targets and nothing else, so the whole key would otherwise be
  unreachable from a keyboard. They needed `min-width: 0; min-height: 0` to
  escape the page's 168 × 46 button slab — three of those minimums in a grid
  track is 504 px of column in a 330 px console, which puts the sixth surface
  off the side of the desk.
- **A surface can also be flipped by clicking it on the axonometric, and only
  three of the six can ever be.** The viewpoint is fixed at +x −y +z and
  `square()` un-turns the geometry before projecting, so the faces that come
  forward are always the same three — the roof, the y = 0 wall and the x = w
  wall — however far the building has been turned. The drawing is therefore
  the shortcut for the surfaces you can see and the key is the complete
  control, which is also why the strip carries the reading. The click is
  refused entirely while Fabric is bypassed: the model sends all six adiabatic
  whatever the parameters say, so a click would move a parameter and not move
  the drawing.
- **Adiabatic surfaces are hatched in the axonometric**, poché'd the way a
  section hatches what it cuts, and the three facing away are hatched under the
  wireframe so they read faintly through the translucent faces rather than as
  the nearest thing in the drawing. A doubled outline was tried first, for
  consistency with the key: inset inside a filled face it makes a rim, and the
  box turns into an open tray.

### The opening that had nowhere to go

EnergyPlus refuses a `FenestrationSurface:Detailed` or a
`Shading:Zone:Detailed` whose base surface is adiabatic, and stops the run:

    ** Severe ** FenestrationSurface:Detailed="ZN001:WALL001:WIN001",
                 invalid Building Surface Name="ZN001:WALL001".
    ** Fatal  ** GetSurfaceData: Errors discovered, program terminates.

Before the boundary key that was a live defect: bypassing Fabric sent every
surface adiabatic and fatalled any desk with a window on it, so the flask the
Fabric strip advertises was only reachable with Glazing, Shading and Skylights
patched out by hand. Measured at `cd5881e`: the stock desk with Fabric out
exits 1 on the three severes above. The same desk now runs clean. Two
mechanisms, and they answer different halves of it:

- **`applyGlazing`, `applySkylights` and `applyShading` ask the document, not
  `params`.** `opensOutdoors(doc, name)` reads the boundary `applyFabric` has
  already written — the appliers run in that order — so one question covers
  both ways a surface loses its outside: its own face of the key, and the
  Fabric channel being patched out, which no parameter records at all. An
  opening is simply not written where it cannot stand.
- **`channelState` hands `requires.test` a third argument.** `(params, on,
  off)`, where `off(id)` reads the patch bay directly. `on` can only ask about
  channels already decided, which is why this was previously called unfixable:
  Fabric is declared at 07, below the three channels that need to ask about it.
  But being bypassed is an *input* to that loop rather than something the loop
  decides, so it can be asked of any channel in any order. Glazing and
  Skylights use it to block themselves, each with its own sentence, instead of
  handing the engine objects it would reject.

Everything downstream follows from the same fact rather than being told
separately: a wall's `Side.needs` on the glazing key greys it and says *The
north wall is adiabatic, so there is nothing outside it to open onto*, and
`Side.unreached` grew the ability to be a function of the parameters because
the overhang key's walls now have two ways to reach nothing and one sentence
could not say which. `glazed()` and `skylit()` ask whether the opening can
exist at all, so Blinds and Daylight — which are gated on those — go out with
it.

**The ratio denominators count only surfaces with an outside.** A
window-to-wall ratio has always been measured over the exterior wall area, and
an adiabatic wall is a party wall that can carry no opening here: left in, three
walls glazed to 1.0 against four walls of denominator would report 0.75, a
number no setting of the sliders can reach and about no part of the building.
Skylight-to-roof is the same. `exposed` already counted only `Outdoors`
surfaces, so compactness and the quantities panel needed nothing.

**A nearly sealed box may not converge in warmup, and that is the building
talking.** One exposed surface against a concrete slab has a time constant
longer than the 30 warmup days `buildModel` asks for, and EnergyPlus says
`** Severe ** CheckWarmupConvergence: … did not converge after 30 warmup days`.
Measured on four adiabatic walls with rooflights in the exposed roof: the run
completes, the results are written, and the title block reports the severes as
it reports every other one. It is not an input error and there is nothing to
fix in the model — raising the warmup limit would cost every run on the desk to
flatter one corner of it.

### Two air models (channel 09)

The Air strip states its subject two ways and the engine simulates one of them.
`airModel` chooses; every control on the strip carries `needs: scheduled` or
`needs: network`, which is the arrangement Glazing already uses for `uFactor`
against `panes`. The objects of the model that is out are **deleted, not
zeroed** — `AIR_TYPES` is cleared on every apply whichever is in force — which
is what keeps EnergyPlus from writing `..ZoneInfiltration objects will not be
simulated` into a file nobody opens while the title block counts the warning.

- **The crack coefficient is per surface, not per square metre**, and getting
  that wrong runs clean. `air_mass_flow_coefficient_at_reference_conditions` is
  the coefficient for that entire surface, so the whole-envelope figure is split
  between the exterior surfaces by area at the call site. Written per square
  metre it validates, warns about nothing, completes with exit 0 and is wrong by
  about **eightyfold** — 0.0007 ACH computed against a stated 0.5. The only
  thing that catches it is that the right answer is **linear**: `envLeak` 0.5
  computes 0.154 ACH and 1.5 computes 0.451, a ratio of 2.92 against a wanted 3.
- **The computed rate is the sum of two series.** `AFN Zone Infiltration Air
  Change Rate` is the cracks and `AFN Zone Ventilation Air Change Rate` is the
  openings. "Infiltration" is the engine's word for "through a crack", not for
  the infiltration of this building, so reading it alone letters a number about
  part of the building under a label claiming the whole of it.
- **Three get-input fatals are reachable from the sliders, and all three are
  answered by the channel's `requires` rather than caught.** No exterior surface
  left (`An AirflowNetwork:MultiZone:Surface object is required but not found`),
  fewer than **two** ways through the envelope (`has only one surface defined in
  AirflowNetwork:MultiZone:Surface` — the physics saying a network with one hole
  has nowhere for the air to go), and an adaptive venting rule with nobody in
  the room (`ASHRAE55 ventilation control … requires connection to a people
  object that uses ASHRAE55 model calculations`). The first two were found by
  the harness at positions of shipped sliders: `envLeak` at its own `Sealed`
  stop writes a coefficient of exactly zero, which the schema refuses outright.
- **`requires.reason` may be a function of `(params, on, off)`**, for the reason
  `Side.unreached` already may: this channel has three ways to be blocked and
  one sentence would name the wrong one. Two of the three are states no
  parameter records — Fabric patched out is read through `off`.
- **The adaptive comfort model is written by `applyGains`, not by `applyAir`.**
  Gains runs at 10 and clears `People` on every apply, so anything the air
  applier hung on that object would be thrown away. It reads which rule was
  actually written off `AirflowNetwork:MultiZone:Zone` in the document rather
  than off `params.openRule`, so a rule that reached no object cannot put a
  comfort model on somebody. `mean_radiant_temperature_calculation_type` was set
  beside it on the first pass at `ZoneAveraged`, which is that field's name in
  an older EnergyPlus and `EnclosureAveraged` in 26.1 — the drift invariant, in
  one fatal.
- **The venting rule and its bounds are written only where an opening exists.**
  Those four controls are withdrawn from the strip on exactly that condition,
  and a control that is hidden while still moving the model is worse than a dead
  one: the reader has no way to see what changed the answer. So the zone object
  is written *after* the openings are decided, and takes `NoVent` with none.
- **A rooflight leaks but can never be opened.** Both opening models refuse a
  near-horizontal surface — the vertical one because a flat opening has no
  bottom and top for a neutral plane to sit between, the horizontal one because
  it is formulated between two zones and outdoors is an external node with a
  wind pressure rather than a zone with a density — and both refusals are fatal
  on every rooflight. So the applier loops the *walls* and the Skylights strip
  says so where the reader would look for the control.
- **The wind bound is EMS, and its `Null` release is the whole design.** No
  AirflowNetwork object carries a wind speed, so `openMaxWind` reaches the run
  through a five-line Erl program on the `Venting Opening Factor` actuator. An
  actuator holds whatever it was last set to, so writing a value in the
  else-branch — `SET Vent0 = 0.5`, the obvious thing — **replaces** the opening
  rule instead of bounding it: measured 8,808 hours open of 8,808 and 4.160 ACH
  against 2,628 hours and 0.684 ACH with `SET Vent0 = Null`, exit 0, zero
  warnings, nothing in the error file. Verified the other way too: with the
  bound set where it cannot bite, the `Zone Air Heat Balance Outdoor Air
  Transfer Rate` series matches a run with the EMS objects absent to **0 W over
  every hour**. The threshold is a literal inside generated program text, which
  makes it the one thing here whose serialised form changes with a slider in a
  way that is not a field value — so idempotence is asserted over the program
  text, not over the object count.
- **The four `EnergyManagementSystem:*` types are cleared by type**, which is
  safe *only* while nothing else on this desk uses EMS. The day a second feature
  wants an Erl program, that sweep has to narrow to what `applyAir` wrote by
  name, and there is no symptom for getting it wrong: a program that is not in
  the document simply does not run.
- **The `*` key on `AFN Surface Venting Window or Door Opening Factor` is the
  exception that proves the per-surface rule.** The warning about per-surface
  variables is about a request across 158 surfaces, which took an annual run
  from 681 ms to 2,984 ms. This one resolves to one series per openable window,
  at most four, and it is the only variable the engine publishes for the
  hours-open reading. An hour in which two openings stood open is **one** hour,
  counted over the union rather than the sum.
- **The network costs about +20 ms on a design day and 3.1× on a year**,
  measured five interleaved passes with openings and the EMS bound in place:
  147 ms against 165 ms of wall clock, 0.47 s against 1.44 s of engine time.
  Twenty milliseconds is 40 % of the desk's 50 ms live budget. It is spent, and
  a later feature that wants 20 ms of that budget needs to know this one took
  it. Measure the design day off the **wall clock**: 30 ms is three of the
  engine's own reporting ticks on a run that is only five or six of them.
- **A free-running zone under the network can raise
  `Temperature out of range [-100. to 200.] (PsyPsatFnTemp)`.** Three times in
  8,760 hours on Denver TMYx with System patched out, at intermediate values
  the AFN solver passes to the wet-bulb routine. The run completes, the results
  are written, and there is nothing in the input to fix — it is the same kind of
  thing as the warmup non-convergence a nearly sealed box reports. It does not
  appear with System in the path.
- **The engine is deterministic on one input, but the app reuses one WASM
  instance across solves.** Two cold boots of the same link agree exactly —
  511 hours open of 8,760, 0.26 ACH; the same link solved as a warm session's
  tenth run read 512 hours and two more warnings. The mean was identical either
  way. Nothing on the desk was fine-grained enough to show this before an hours
  count; it is engine-instance state, not the model, and the harness confirms
  the IDF is byte-identical between a desk walked to a position and one built at
  it.

### Reading an absent type used to register it (src/model.js)

This was the sharpest invariant in this file and it is now history, which is
why the section is kept rather than deleted: every IDF this page published
before `@idfkit/core` 0.3.0-rc.3 was ordered by the old behaviour, so the
files in older run bundles are not line-for-line comparable with the files it
writes today.

Under `0.1.0`, `doc.all(type)` and `doc.get(type, name)` both went through the
document's own `collection()`, which **inserted an empty collection for a type
it had never seen** — and `types()` is insertion order, which is the order the
IDF is written in. So merely asking whether a type was present moved every
later object of that type to the position of the question. Measured at the
time: `applyAir` gained a `drop(doc, 'Schedule:Compact', 'AFN Setpoint')`, and
because Air is applied at 09 and Gains writes the occupancy schedule at 10,
that one question moved all three `Schedule:Compact` objects seventy lines up
the file. `holds(doc, type)` was the guard, asked at the call sites making a
*new* question about a type the document might not yet hold.

**0.3.0-rc.3 no longer registers on read**, and the upgrade's own harness is
how that is known rather than the release notes. On a document holding two
types, `all()` and `get()` against an absent type both leave it holding two,
and a document asked about `Schedule:Compact` before adding one serialises
byte-identically to a document never asked. Across the eight desk positions in
`specs/007-upgrade-idfkit-js/verify/build-positions.mjs`, the type count fell
from a uniform **69** — every type any applier had ever swept, which is the
saturation the old read path produced — to between **28 and 45**, which is the
count of types actually present.

**The object order changed as a result, and it was taken to the engine rather
than argued about on paper.** Seven of the eight positions are unmoved. The
eighth, every channel engaged, reorders **eleven types inside a thirteen-object
window** of a 106-object file: `Schedule:Compact` hoists above `People`,
`Lights` and `ElectricEquipment`, the two `Daylighting:*` objects swap, and
`ThermostatSetpoint:DualSetpoint` and `ZoneControl:Thermostat` rise above the
three `ZoneHVAC:*` objects. Both files run to exit 0 under EnergyPlus 26.1.0
with byte-identical `.eso`, `.mtr`, `.rdd` and `.mdd` and the same 1 warning,
0 severes. Every object is present on both sides, field for field. The engine
cannot tell, which is what makes a reordering with no symptom acceptable here
rather than merely undetected.

`holds` stays, at all three call sites. It still answers exactly what its name
claims, it now costs a `types()` scan and nothing else, and a question about a
type that may be absent is worth writing as a question either way.

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

**They are swept, and a sweep of one costs one run** (spec 011, issue #78). The
old rule withheld Study and Survey from both channels on the grounds that a sweep
"could only redraw the numbers already on the sheet". It is the same building at
every position, which is exactly why the sweep is cheap, but the figures at the
other positions are not on the sheet. What made it cost one run needed no code:
`sampleIdentity` is built from `deskKey`, which drops `PRICED_KEYS`, so every
position of a `heatEfficiency` study has one identity, the first dispatch runs it
and the other twenty ride its pending promise.

- **Price at the point, not in the cache.** One cache entry cannot hold
  twenty-one prices. The scheduler's `priceAt(job, value, sample)` hook prices
  each curve point in `pointAt`, which both `land` and `curveFor` go through, via
  `pricedReadings(readings, basis, pricingAt(job, value))` in `main.js`: live
  `params` with the job's own priced swept keys laid over at that position. It
  is the one application of the bill to a retained basis; `repriceStudies` and
  `repriceSurvey` call it too. Unlike `refuses`, `priceAt` is deliberately
  impure, and `reprice()` rebuilds every curve and ground whenever the priced
  settings move.
- **Reach is declared.** `Quantity.movedBy` names the priced keys that can move a
  reading: the three plant faces move EUI, cost and carbon (`divisorFor`); the two
  prices move cost and the grid intensity carbon (`assume`). Everything else on
  the roster is read before the plant is applied. Asserted at load both ways
  round, and against the real `computeBill` by
  `specs/011-sweep-priced-controls/verify/reach.mjs`.
- **A pairing that cannot move is refused, not drawn.** `refusesPairing(key,
  quantity)` is one sentence for the study card (through `offersFor({ key })`,
  after every other refusal), the survey chooser, `makeSurvey` and `decodeSurvey`;
  54 of 66 pairings, asserted at load. A flat efficiency-against-demand line would
  read as a finding. A pairing that can move a reading and does not here (a gas
  price on direct electric) is drawn flat: that is a measurement.
- **A withdrawn priced face says so in view.** `Scale.withdrawn(params)` on the
  five faces with `needs`, asserted at load against `STANDING`. An idle shaping
  control still reaches the document; `heatEfficiency` under a heat pump reaches
  nothing, not even the bill. The console letters the sentence under the dimmed
  row as a sibling (the row's opacity cannot be undone by a child), the study card
  stands refused with it (`studyRefusal`), the scheduler refuses the position with
  it, and a ground whose axis is withdrawn stands refused with its points kept.
- **Counts say what they count.** `curveFor(job).runs` and `Coverage.runs` are
  distinct cache identities; the study's drawn line, the coverage line, the Runs
  stamp and the aria label letter runs beside positions where the two differ.
- **The pull still leaves them out**, by decision rather than cost: it ranks what
  is pulling the building, and `PullReading.said` says Plant and Tariff are not
  ranked.
- **The traverse records buildings.** A priced-only step adds no stop. `commit`
  records on release when the gesture moved any shaping key (`gestureShaped`),
  not when the releasing key is a shaping one: standing on a point is two commits
  and with Y priced the release is Y's, so a step along a shaping X used to leave
  no stop, and so did a traverse restore that ended on a Tariff key.

`Channel.requires.test` is handed `(params, on, off)`. `on(id)` reads whether an
earlier channel is engaged, so Plant can require System; channels are declared in
physical order, which is the order those dependencies run in, so a channel can
only ever ask `on` about one above it. `off(id)` reads the patch bay itself and
carries no such restriction — see "The opening that had nowhere to go".

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
engaged and a year attached the reading is `readDemand` instead — TEDI and
CEDI off the meters through `meterTotal`, each sample divided by its own floor
area. The
readers live in `src/readings.js`, DOM-free, so the harness calls the real
ones.

**The sheet reads the same pair for the desk it is standing on.** A curve with
no point on it the reader can check against the run in front of them is a
comparison of hypotheticals, so the results schedule carries TEDI and CEDI as
rows and the finding says them in a sentence — the sheet's own
answer to the question a study asks of one control. `demandOver` is the shared
arithmetic: the schedule reads it **per environment**, because that is what a
column of that schedule is, and the finding reads `readDemand` over the billed
environments, so the columns sum to the sentence. Two rules keep the rows
honest: the meters' own presence is the gate (no `Heating:DistrictHeatingWater`
in the ESO means the System strip was out, and both rows are omitted rather
than drawn as em dashes — a building with no system is not a missing
measurement), and everything is read off the run rather than off live `params`,
which is also what stopped the finding opening "with no heating or cooling
anywhere in this model" over a run that had just simulated an ideal unit.

**The three names are pinned to published definitions, and one of them was
wrong.** TEDI and CEDI are compliance metrics with numeric targets attached, so
they are not ours to redefine, and the pinned wording lives in `demandOver`'s
comment with its sources:

- **TEDI** — space *and ventilation* heating **output**, per unit of modelled
  floor area, per year (City of Vancouver Energy Modelling Guidelines v3.0;
  CaGBC ZCB-Design v3/v4, which states it "is intended to represent the heat
  delivered to the building" and counts a heat pump's output rather than its
  electricity). Before any efficiency or COP.
- **CEDI** — cooling **output**, sensible *and latent*, same denominator, and
  "does not include mechanical efficiencies of cooling equipment" (Vancouver,
  where it is a defined term with no target). CaGBC defines no cooling metric,
  so Vancouver is the only authority for this one.
- **EUI** — "the sum of all site energy consumed on site … divided by the
  building modelled floor area" (CaGBC). Metered energy, *after* the plant.

Which is why there is no third reading. It was the four building end uses
summed on the *demand* side, drawn for a while as an "EUI", and it disagreed
with the bill's own per-m² figure by 44 % on a Denver year — 111.2 against
77.1, the difference being the boiler efficiency and the chiller COP the bill
divides by and the schedule did not. Renaming it was the first fix and the
wrong one: a sum of the demand side has no published definition and no
benchmark to hold it against, so under any name it is a figure the reader
cannot use, on a sheet whose claim is that every figure means something. The
ideal-loads meters are the output side both demand definitions ask for, so
TEDI and CEDI were right all along; their companion is simply gone, and the
per-m² energy figure anyone actually benchmarks is the bill's.

**The denominator is the whole building, and `geometryFacts` is where that is
decided.** Every intensity used to divide by one zone's floor polygon while the
meters carried the zone multiplier, so a multiplier of 3 reported three times
the true intensity — TEDI 9.6 → 28.8, the bill's per-m² 77.1 → 231. The rail
had long since learned this lesson in its own half of the desk, where
`Term.perBuilding` divides the building-level system term back down.

So `geometryFacts` now returns both: `floor`, `exposed`, `volume`, `glazing`
and the rest per storey — what the axonometric draws — and `grossFloor`,
`grossExposed`, `grossVolume`, `grossGlazing`, `grossRoofGlazing`,
`grossShadeArea` for the building the engine was handed, alongside the
`storeys` that made it. Three rules hold it together:

- **The multiplier is read off the `Zone` object, never off `params`.**
  `buildSample` hands this function a document carrying a sweep's overlay, so
  a fact taken from live parameters would describe the desk instead of the
  sample. Measured: sweeping the zone multiplier 1× to 30× now draws TEDI flat
  at 9.6 and CEDI flat at 50.1 across all twenty-one samples, which is the
  right answer — stacking identical floors buys three times the energy over
  three times the area.
- **Everything that divides by an area takes the gross one**: the bill, the
  schedule's demand columns, the finding, and every study sample.
- **Every area and volume the page letters is the building's**, in the
  quantities panel and on the strips alike, so one quantity never appears
  twice on one page at two sizes. The ratios — window-to-wall,
  skylight-to-roof, envelope-to-volume — take no multiplier and must never be
  given one: every term in them scales by the same n. Only the floor row names
  the multiplier (`696.8 m² · 3 floors`), because it is the one row whose
  cause is not otherwise obvious, and because a reading the reader cannot
  check the division of is the thing this sheet exists not to print.

### The description (src/describe.js)

The paragraph under the plate opens with the building and closes with the
reading: two sentences about the desk the reader drew, then the one sentence
that says what drawing it that way did. The description half is generated, not
written — `describeDesk` returns a token list (strings, and `{ q }` for the
quantities the sheet letters in its mono face) that `solve` appends ahead of
the finding's own clauses.

- **What to say is decided by difference.** Ninety-odd controls, and room for
  two, so the moves are ranked by how far each sits from its own default —
  the same identity diff `encodeState` takes to decide what a permalink must
  carry, for the same reason: what the reader changed is what the reader
  designed. `moved()` scores a scalar by its own travel (`Control.fraction`),
  and the `FLIP` table scores a channel being patched in or out **above
  anything a slider can reach**. That table is not decoration: a pane
  emissivity taken the whole way across its range scores 1.00, and before the
  flips outranked it the paragraph described the glass of a building whose
  ideal unit it never mentioned.
- **Ranking chooses; declaration order reads.** `READING_ORDER` re-sorts the
  two that won, because "which two" and "in what order" are different
  questions — left in rank order the clauses composed by luck, and a site
  clause, a mechanism and a caveat about the whole run do not join in any
  order you please.
- **Every move is a noun phrase**, so one lead-in governs all of them however
  they land, and none carries a comma of its own — a clause with a comma turns
  the series' last "and" into an ambiguity about which half it governs. The
  desk that changed exactly one thing is not a rare desk, which is why the
  lead-in cannot be a verb agreeing with a plural.
- **The compass words are measured, not named.** `turn()` puts the orientation
  into the vertices and leaves every wall's name where it was, so on a building
  turned 40° the wall called south faces south-east. `geometryFacts` now
  returns `faces` — per wall: its length, area, glazing, ratio, overhang,
  projection and **bearing off its own outward normal** — and the description
  letters the bearing beside the word wherever the box is off the cardinals.
  Reading the plan key's name instead would have the sheet stating the one
  thing about a turned desk that is flatly untrue.
- **A setting is described by the object it reached, not by its own value.**
  *Available* is not a modifier on a unit that has two setpoints: at "Heat
  only" `applySystem` writes a `ThermostatSetpoint:SingleHeating` and the
  cooling setpoint reaches nothing, so the clause is read off the thermostat
  object in the document — as is the availability schedule, since "Occupied"
  falls back to `AlwaysOn` with Gains out of the path. The same rule takes the
  wall glazing's U-factor and SHGC out of the sentence on a roof-only desk
  whose rooflights are glazed in their own unit. The same reflex sends the
  layered unit to `landmarkAt(panes).phrase` rather than to the word "double":
  a literal there is how a paragraph goes on calling a triple a double the day
  the pane count arrives.
- **Which surfaces have an outside is part of the description.** A wall or a
  roof set adiabatic is the model saying there is another heated space on the
  far side, and a paragraph that only ever said what was *glazed* would letter
  a party wall as solid — true of the drawing and silent about the reason. It
  is read off each surface's own boundary in the document, ranked above any
  slider and below a channel flip.
- **It is captured before the await**, beside `capture` and the IDF, off the
  snapshot the run was written from. Lettered after, a slider turned during a
  0.7 s annual run would have the sentence describing one building over another
  building's chart.
- **Nothing is said that is not measured.** No typology — 12 m²/person is a
  number, not "an office"; no assembly names — an R-value is not "a cavity
  wall"; and no verdict, because "well insulated" has no measurement behind it
  and no benchmark on this page to earn it. Areas, ratios and reaches come off
  the document, so a channel patched out from under a control reads as what the
  document holds: a building with Glazing bypassed is described as solid,
  because it is.
- The module is DOM-free and free of the network — the station arrives as
  `place: { name, zone }`, already read — so the Node harness can assert the
  sentences over documents it builds itself.
- **Two moves and no station, to fit sixty words.** The description and the
  finding share one paragraph held to sixty words together (`DESCRIPTION` in
  `src/copy.js`). At three moves it ran seventy to ninety, so `MOVES` is two;
  and `main.js` no longer passes `place`, because the title block's Location
  and the site picker's climate zone already letter the station a few
  centimetres above. `describeDesk` still accepts it.

**A plan key's four walls are four subjects, not one.** The `Facade` controls —
window-to-wall ratio and overhang projection — own a key per wall, so each wall
carries its own Study offer in the legend under the plan and its own curve, and
nothing in the scheduler needed teaching: `controlFor` already resolved a wall
key to `{ control, side }`, and a `Facade` carries the `min` / `max` / `step` /
`fraction` a sweep reads. What the console had to grow is where a curve hangs
and what it is called. `rows` holds a per-wall anchor rather than the shared
row, so four cards stand in compass order however the sweeps land, and a card
under a plan key names its wall (`Study · Glazing W`) because four of them can
be up at once under one label. `phraseFor` is the same fact in a sentence —
"the west wall's window-to-wall ratio" — since "the study of the window-to-wall
ratio" would be true of four different curves.

`Side` carries a `needs` predicate and the `unreached` sentence for when it is
false, which is the per-wall twin of `Control.needs`: an overhang is cut from
the opening it shelters, so a projection on a solid wall reaches no object in
the document at all. Measured — four positions of `ohW` across a west wall at
zero glazing wrote four byte-identical IDFs. That is a sweep of twenty-one
identical models bought at full engine price, so the offer is refused with the
wall's own reason, and the legend entry and its bar on the plan are greyed. A
`Side` with a predicate and no reason throws at module load: one row-wide note
cannot say which of four walls is inert, which is the whole reason the sentence
is per wall.

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
shapes deliberately carry no climate. A study of a priced control prices one
run at every position (see "Channels that price rather than simulate"); a
priced commit re-mints every study through `redrawStudiesForQuantity({ queue:
false })` without marking it stale, since its rest shape has not moved.

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
- **Bump the storage key** (`shoebox-general-notes-v4`) whenever the steps
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

### The register (src/schemes.js)

Two things that would be one thing in a lesser arrangement, kept apart on
purpose:

- A **standard** is a specification and is applied as an **overlay**. It writes
  the controls it has an opinion about and leaves every other control where the
  architect put it, which is what makes "what would it take to build *this* to
  Passivhaus" a question you can ask of the building already on the sheet.
  `UNTOUCHABLE` names the channels a preset may never write — Massing, Site and
  Context (the brief), Solver and Run (not the building), and the two priced
  ones (nothing they own reaches the IDF, so a preset that turned a tariff would
  move the bill without moving the building). Asserted at module load, not
  documented and hoped for.
- A **kept scheme** is a whole desk and is applied as a **replacement**. It is
  stored as its permalink fragment and nothing else, so the save format and the
  share format are one string: the version ledger in `permalink.js` carries both,
  and there is one codec to keep honest rather than two.

**Nothing is remembered.** There is no "currently selected standard" anywhere on
this page and there must not be. `conformance()` measures the desk against a
preset's clauses every time `applyGeometry` runs, exactly as the axonometric
measures the vertices — so nudging a wall a second after pressing Apply drops
the conformance by itself, because there was never a flag to go stale.

- **A specification and a target are different things**, and the split is drawn
  in the layout itself. `Spec` sets a control, so the standards fold to compact
  accordions on the console head, beside the controls they set — closed, each is
  a name and a conformance chip. `Target` states a number the finished building
  has to reach and is read off the run, so every standard's targets sit on one
  scoreboard on the sheet (`renderScore`), under the results — all standards at
  once, because there is no "applied standard" to filter by, and one run read
  against every published line is the game the board affords. LETI is the pure
  case — no specs at all, two targets — and having it in the list is what keeps
  the distinction visible for the others. `conformance().built` is `null` for
  such a preset, not `true`: "conforms to a specification with no clauses in it"
  is the emptiest true statement available.
- **`Spec.why` carries the arithmetic**, because almost no published figure is
  in the units an IDF field wants. An assembly U-value becomes a construction
  resistance by taking the ISO 6946 surface films off it (the Fabric strip
  writes one `Material:NoMass` and EnergyPlus adds the films itself); a
  blower-door n50 becomes a natural-conditions infiltration rate by the LBL
  divide-by-twenty rule of thumb, which is coarse and is printed rather than
  buried so it can be disagreed with. Same rule as the bill's rate build-up.
- **`Unjudged` is the most important list in the module.** A one-zone shoebox
  with ideal loads can speak to about half of what Passivhaus requires, and a
  panel showing only the half it can answer would read as a certification. What
  is *not* being checked is printed beside what is.
- **A target with no line is not a pass.** PHI sets the cooling limit per
  building and per climate, so there is no figure this sheet is entitled to
  draw; the reading is shown with no verdict. And a reading that is absent says
  *why* — "attach a weather file, this is a year's number" — rather than
  standing as a bare em dash the reader can do nothing about.
- **`Target.needs` separates a load from an energy**, and the distinction earns
  its keep. `'year'` (the demand intensities, the exceedance frequency) has
  nothing to say about two design days. `'run'` — the peak loads — reads on any
  run at all, because sizing days *are* the conditions plant is designed
  against, so the scoreboard answers something before a weather file is ever
  attached. `targetAbsence` tests System before the year for the same reason: a
  free-running desk should not be sent to fetch a year it does not need.
  `readPeaks` costs no new `Output:Variable` — it reads the hourly
  `Zone Air Heat Balance System Air Transfer Rate` the balance rail already
  requests, signed positive into the zone. Watch this one in practice: a desk
  can clear the Passivhaus *demand* at 8.6 kWh/m²·yr and miss its *load* at
  13.9 W/m², which is the whole argument for reading both.
- **The chase pin is the one thing here that *is* remembered — explicitly.**
  Chasing a standard reduces it to its single worst line, drawn up beside the
  drawing with a ghost of where that margin stood when the gesture began,
  because a dozen scoreboard rows a screen away cannot answer "is what my hand
  is doing right now helping". It is the bill's pin in another column: a
  comparison the reader chose and can unchoose, making no claim about the
  building, so it does not violate the no-remembered-standard rule that
  conformance obeys. It stays out of the permalink for the same reason `pinned`
  does — it is how the desk is being read, not what it is.
- **What "Chase" means is printed above the board, not hovered.** The word on
  the marker is a verb with no object, and a first reader has no way to guess
  what pressing it does — but the fix is a sentence in the scoreboard's lede,
  not a tooltip: nothing on this sheet floats, and a hint that exists only on
  hover does not exist on a phone at all. The marker's `title` and `aria-label`
  carry the same sentence, which is what makes five identically-worded buttons
  distinguishable when they are read aloud; both halves flip together when it is
  armed, since "Stop chasing … : hold its worst line up beside the drawing"
  describes the state being left rather than the one the press reaches.
  Printed is not the same as always open. The lede keeps one sentence of at
  most twenty words in view, saying what a press does and how to undo it, and
  the ghost and the argument for it sit in a fold under that sentence. An
  in-view summary plus a fold that opens where it stands meets "in place": a
  press is not a hover.
- **The worst line is ranked by ratio, not by difference.** LETI's energy line
  is 55 kWh/m²·yr and Passivhaus's heating line is 15, so 3 over means something
  different against each while 20 % over means the same against both.
  `chaseVerdict` takes its reader injected, so the harness drives the ranking
  with a plain lookup.
- **The chase ghost follows the bill's rule, not the plate's.** It is *not*
  cleared on gesture end: an annual margin does not move until the release solve
  lands, so clearing it there would mean the cadence where the numbers matter
  most never showed a ghost at all. It stands until the next gesture replaces it.
- **`refuses()` moved into `controls.js`.** Both the link codec and the preset
  declarations hand a control a bare value, and the rules for what a control can
  hold belong with the declaration. `permalink.js` reads it rather than
  restating the ranges.
- **A full shelf refuses; it does not evict.** Dropping the oldest to make room
  is the silent fallback this codebase refuses everywhere else. A shelf that
  cannot be read is refused whole with the reason standing where the schemes
  would have been, because an empty table would tell the reader they never saved
  anything.
- **Restoring across a station change goes through the link.** A scheme naming
  the attached station is applied in place like `revert`; one naming a different
  station is a different climate, tariff and grid — that is a boot, so it is
  handed to the hash and the page reloads into the existing decode path,
  refusals and all, rather than growing a second thinner copy of it.
- **A kept scheme stores a currency code, not a `Currency`.** Nothing with an
  identity survives `JSON.stringify` into the browser's storage, so
  `Measure.comparableWith` restates the bill's own refusal on flat data: same
  kind of run, same currency, same end uses, or no delta at all.

### Overheating to CIBSE TM59 (src/tm59.js)

Four published criteria, read off one run and lettered on the scoreboard beside
Passivhaus's and LETI's fixed lines. `src/tm59.js` is DOM-free, network-free and
engine-free by the same rule `readings.js` and `describe.js` follow, so the Node
harness calls the real readers rather than a copy of them. The method is quoted
and never reproduced: TM59:2026, its weather file requirement and its compliance
checklist are purchased documents and the supplied copies are watermarked to a
named individual, so the clause references and the sentences they carry are all
that enters this repository. The register already keeps that rule for Passivhaus
and LETI, and it is why `scripts/build-tm59.mjs` holds a transcription rather
than reading a file.

**The 2026 edition has one assessment period and it governs all four criteria.**
1 May to 30 September inclusive, 153 days. That is the largest single difference
from 2017, where the bedroom criterion was annual and the mechanical criterion
was annual and neither is any more. `SEASON` is one frozen instance that asserts
its own arithmetic at module load, because `153 x 13 = 1989` and `153 x 24 =
3672` are the two occupied-hour totals CL:2026 publishes, and a period that had
drifted from its own day count would go on producing a perfectly plausible
share.

- **a**, predominantly naturally ventilated spaces: occupied hours whose rounded
  dT over the adaptive threshold is 1 K or more, not more than 3 % of the
  occupied hours in the period. Living rooms, kitchens, home offices *and*
  bedrooms.
- **b**, bedrooms: the number of **nights** whose **mean** operative temperature
  between 23:00 and 08:00 exceeds Tn, not more than four. Tn is 26 degrees at
  Category I and 27 at Category II, fixed rather than adaptive.
- **c**, predominantly mechanically ventilated spaces: 26 degrees operative for
  not more than 3 % of the period's occupied hours. The period is what changed
  in 2026; 2017 read this annually.
- **d**, communal circulation: 28 degrees over 3 %. There is no
  `readCriterionD` and there must not be one. This model has one zone and no
  corridor, so criterion d is declared, is never read, and carries the sentence
  saying why onto the register's unjudged list. A reader that always returned an
  absence would be a reading pretending to be one.

**Criterion b is a different quantity from its 2017 self, not a retuned one.**
2017 counted hourly exceedances of 26 degrees between 22:00 and 07:00 against
1 % of the *annual* hours. 2026 counts nights against a nine-hour mean, on the
evidence (Lomas and Li, 2023: a literature review plus measurements in 591
English homes) that disrupted sleep is a property of the night rather than of
its worst hour. Two consequences fall out of the arithmetic and both are
implemented rather than noted. A night is attributed to its **opening** date, so
30 September's night runs to 08:00 on **1 October**, one day past the period the
other three stop at; and a **partial night is not a night**, so nine hours that
are not all in the run are counted in neither the numerator nor the denominator,
with `Coverage.tail` reporting whether the last one was complete. A mean over
five available hours of a nine-hour night is a different statistic wearing the
criterion's name.

**The adaptive threshold is derived from the two clamps, not taken on trust.**
Section 2.4.1 prints no formula. It prints the endpoints (24.1 and 30.7 at
Category I, 25.1 and 31.7 at Category II) and the condition that the line is
straight between Trm 10 and Trm 30, which pins `Tmax = 0.33 Trm + 18.8 + K`
uniquely at K = 2 and K = 3. `Category` asserts that arithmetic at module load
to within 1e-9, so a mistyped offset cannot ship. TM52:2013's equations 6 and 8
confirm it from the other direction and its Table 2 publishes the same offsets
as the categories' own plus or minus 2 K and 3 K, so both figures are quoted
rather than inferred. **Category III is not offered**: TM52 assigns it to
existing buildings, TM59 names only I and II, and a third line on the board
would be this sheet adding a category the method does not use.

**The running mean is read off the weather file, and that is the governing rule
rather than an exception to it.** A run is an IDF *and* an EPW, and the EPW is
the half that carries the outdoor climate, so reading the file's own daily means
is reading what was handed to the engine, exactly as reading a vertex off the
document is. Nothing here is reasoned about or assumed. The method also settles
where the history comes from: section 2.4.1 seeds Trm at 30 April from the daily
means of 23 to 29 April, which is outside any summer run this desk can produce
and inside no simulation at all on a June-to-August calendar.

The alternative was measured and rejected. EnergyPlus offers one adaptive series
in the `.rdd`, `Zone Adaptive Comfort Operative Temperature Set Point`, and the
CEN15251 category variables appear only when a `People` object declares the
model. Two disqualifications, and the second is decisive. It couples the comfort
line to the Gains channel being engaged, so bypassing Gains would take the line
away, which is a physical absurdity: the weather does not stop having a running
mean because nobody is home. And **EnergyPlus starts its running mean at the
beginning of the run**, not at 23 April, so on a June-to-August calendar it
would silently produce a different line from the one TM59 mandates. A quietly
substituted value is the one thing Principle IV forbids, and a comfort line that
is wrong only on split calendars is a substitution with no symptom.

So the recursion runs here. Seed by TM52 Equation 2.3 over 23 to 29 April at
weights 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2 over a divisor of **3.8, which is the
sum of those weights**: a dropped divisor is wrong by nearly four times while
still looking entirely plausible, so the harness asserts it. Then Equation 2.2,
`Trm = 0.2 Tod-1 + 0.8 Trm-1`, to 30 September, **unconditionally on what was
simulated**. The line is a property of the climate and does not know which days
the engine touched, which is what lets a run split into month groups be judged
against exactly the line a full year would have produced. `Tod` is always the
*previous* day's mean and never today's, because today's is unknown until the
day ends; an off-by-one here shifts the whole season's line by a day.
`dailyMeans(epw)` lives in `epw.js` rather than in `tm59.js` because it is EPW
parsing and its only honest test is a real file. At 13.2 ms it is eight times
every criterion put together, so it is cached on the attached file's identity
beside `offersFor` and `calendarFor`, and cleared where the studies and the
sample cache are cleared: on a station change.

**An occupied hour is one standing above the floor the applier wrote, and
getting that wrong reads back as a published figure.** `bandSchedule` writes
`0.1` out of hours, not zero. The signature is `{ on = 1, off = 0.1 }` and the
off value is written for every hour outside the band, for a whole weekend day at
`weekend: 'Unoccupied'`, and for a holiday at `holidayUse: 'Closed'`, so the
desk's occupancy schedule is never zero anywhere in the year. Measured on the
default desk over a Chicago TMY3 year, 1 May to 30 September:

| Occupied-hour test | Hours counted |
|---|---|
| `scheduleValue > 0` | **3672**, which is every hour of all 153 days |
| `scheduleValue > 0.1` | **1100**, which is 110 weekdays over a 10 hour band |

3672 is not a coincidence. It is `153 x 24`, and it is also, exactly, the figure
CL:2026 publishes for a **bedroom**, so the naive denominator produces a
plausible number that agrees with a published one for entirely the wrong reason
on a desk that is not a bedroom. That is the worst shape a bug can have on this
sheet. `model.js` exports `occupiedFloor(params)`, which is `BAND_OFF` under
`'As drawn'` and 0 under a named room type because Table E.2's own unoccupied
hours are literally 0, and the readers take the floor as an argument rather than
assuming one. That is why the shipped `readCriterionA(eso, trm, category,
floor)` and `readCriterionC(eso, floor)` each carry an argument the module
contract's signature does not: the floor is a property of the schedule that was
written, and a reader that knew it would be a second place for it to be spelled.
Once the prescribed setup *is* applied the count lands on both published
figures, which is what makes them a check rather than a coincidence: a TM59
living room pattern is 0 outside 09:00 to 22:00 and counts 13 x 153 = 1989, and
a bedroom pattern never drops below 0.7 so every hour is occupied and it counts
24 x 153 = 3672.

The denominator is the run's own `Schedule Value` series for `Occupancy`, which
is the one new output request this feature costs. The alternative, evaluating
the `Schedule:Compact` in JavaScript, means reimplementing EnergyPlus's day-type
dispatch: the schedule carries `For: Weekdays`, `For: Weekends` and, at
`holidayUse: 'Listed'`, `For: Holidays`, and which branch an hour takes depends
on the calendar the engine picked for the weather file. That is a second
implementation of somebody else's dispatch and its failures would be silent. The
series is what the engine actually saw and cannot disagree with it. The
criterion's temperature is `Zone Operative Temperature` and never
`Zone Mean Air Temperature`; where it is not in the ESO the reading is absent
with that reason rather than falling back, because the two are a different
question by several degrees on a desk with heavy solar gain and a cold slab.

**dT is rounded before it is tested, half-up, and the boundary is TM59's rather
than TM52's.** The rounding is part of the published method and not a
presentation choice: an hour 1.4 K over and an hour 1.6 K over do not weigh the
same, and skipping it produces plausible numbers that are not the method's.
TM59:2026 section 2.4.1 spells it out as "for dT between 0.5 and 1.49, the value
used is 1 K; for 1.5 to 2.49, the value used is 2 K, and so on". TM52 section
6.1.2 writes the same rule as "between 0.5 and 1.5 ... for 1.5 to 2.5", which
puts 1.5 in **both** bands and settles nothing at exactly the values the
criterion is most often decided on. **TM59 closes the lower band at 1.49, so 1.5
rounds up**, and `Math.round` is half-up for positive numbers and is therefore
correct. A round-half-to-even helper, which is the thing somebody reaches for
when they read "banker's rounding" and think it is the careful choice, returns 2
for both 1.5 and 2.5 and is wrong on the first. `roundDT` exists as its own
export so there is one place the argument is written down.

**Design days are outside the period, by date and by intent.** A summer design
day falls inside 1 May to 30 September on the calendar, the desk ships two of
them, and they exist to be more extreme than any day of the year they precede.
Counted in, `sizingPeriods: 'Yes'` would worsen a criterion without changing the
building, which is a difference in what was asked of the engine rather than a
difference in the design. The criteria are read over the weather file
environments only, by the rule `readOverheat` and `computeBill` already follow.
The consequence is that on a desk with no weather file attached every criterion
is absent with its reason: two design days are not a season whatever their
dates.

**A partial summer is a reading for criterion a and for nothing else.** TM52
criterion 1 permits it outright, "if data are not available for the whole period
(or if occupancy is only for a part of the period) then 3 per cent of available
hours should be used", and TM59:2026 restates neither that nor anything
contradicting it while publishing absolute hour limits (59 for a living room,
110 for a bedroom) written for a full 153 days. Those limits are **truncated
rather than rounded**, 3 % of 1989 being 59.67 and 3 % of 3672 being 110.16, so
a share test against 3 % and a count test against 59 are not the same test at
the boundary. The desk letters the share, because that is the criterion's own
wording, prints the coverage beside it at equal prominence, states both
documents' positions and withholds the conclusion, which is the same shape as
the weather decision below. Only a run reaching **no** part of the period is
absent. Criteria b and c get no such provision from anywhere and take their
denominators from what the run covered. `Coverage` is read off the run's own
timestamps and never off `params`, because a study sample and a stale solve both
make the two disagree and the document is what was simulated.

`Reading`'s constructor throws when `value` and `absence` are both set or both
null, which makes the em dash rule structural rather than remembered: a reading
with no data behind it is an em dash, stays out of every total, and says what
would fix it. "Run some of May to September, this is a summer number" and "patch
Gains in, with nobody home there are no occupied hours to be a share of" are
sentences, not blanks.

**No pass or fail word attaches to the method's name, and the count is not a
verdict.** The class is called `Verdict` in `tm59.js` and is called a count
everywhere a reader can see it, which is the name it earns, because it carries
no boolean and no word. It is lettered once, over **criteria a and b at Category
II**: TM59's own Stage 1 pair (section 2.3 and Appendix B) for a dwelling of
normal thermal expectation, and the only stage every dwelling must pass
unconditionally. Criterion c is read and lettered as its own line but stands
outside the count, because which of a and c governs at Stage 2 turns on how much
of the occupied period the openings are held shut, which is a fact about a
window model this desk does not carry and guessing it would be the sheet
asserting under cover of citing. Category I is read and lettered beside Category
II and is likewise outside the count. Criterion d is unread and is named as
such. Criteria that could not be read are reported one by one rather than folded
into either number, because a criterion the run could not answer neither passed
nor failed and the only useful thing to say about it is which one it is and what
would fix it. The row takes no marker, no rule, no figure face and no colour:
each of those would make it the board's total, and a row that looks like a total
is read as one whatever the words in it say. Counting all four combinations of
route and category instead was considered and rejected, since four counting rows
for an optional figure is furniture and lettering all of them still leaves a
reader to pick.

**The qualifications block is the deliverable, not a disclaimer.** At least four
`standing` qualifications are asserted at module load, so the promise that a
reader can state four specific reasons why this is not a TM59 assessment cannot
silently fall below what it states. It is printed in place and never on hover,
by the rule that put what *Chase* means above the scoreboard: `pointer: coarse`
has no hover, so a caveat that floats does not exist on the phone where this
sheet is most often read and least often checked against the method it names.
In place does not mean always open. The block used to stand whole under the
board, 520 words under five rows of figures; now the fold's summary states in
view how many reasons there are, read off the list by `qualificationsSummary`
rather than typed, and the entries are one press down. The count is what a
reader who never opens it must still come away with.
The weather qualification letters what the attached file declares about itself
against what WFR:2026 requires (the DSY1 file for the site, 2050s, RCP8.5, 50th
percentile, CIBSE's 28-zone system, labelled
`Zone Reference_DSY1_2050s_HIGH50_CIBSE_v1.1`) and draws **no** conclusion about
whether they match. The gap is four separate mismatches rather than one
sentence, each checkable by the reader against the file in hand: a typical year
against a design summer year, present day against the 2050s, a station against a
climate zone, an open file against a licensed one. Profiles are applied at the
file's own local standard time, unshifted, and that is stated rather than
corrected: TM59 section 3.7.1 says its times are British Summer Time, and every
TMYx file tested declares `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0`, so there is no
rule in the file to shift by and a shift would be an invention.

### The `Pattern` control kind (channel 10)

TM59's gains cannot be said with the Gains channel as it stood, in four separate
ways. The method asks for two people in this room and 450 W in this room, where
the desk offers m2 per person and W/m2 and Massing is `UNTOUCHABLE` to a preset;
it asks for a 24-value fraction where `Profile` offers a from/to band, and a
band cannot hold 0.7 overnight, 1.0 at eight and 0.5 through the day; and it
asks for three profiles where the desk had one `Occupancy` schedule shared by
People, Lights and ElectricEquipment, with lighting on 18:00 to 23:00 rather
than the occupied band. So `Pattern` carries 24 hourly fractions, `value` is the
canonical text (which is what keeps every parameter a scalar, with `Days` as the
older worked example), and three of them stand on the Gains strip.

Adding a control kind is rare and it fails in four directions:

1. **`console.js`'s `buildControl`** throws for a kind it cannot draw, so the
   desk fails loudly at mount rather than rendering a strip with a hole in it.
2. **`permalink.js`'s `readValue` is the quiet one, and a pattern is the branch
   that would have proved it the hard way.** The numeric regex runs *before* the
   per-kind switch, so a `pattern` case written inside the switch is unreachable
   and every link carrying an hourly profile would be refused as "is not a
   number for occPattern": a true sentence about the wrong thing, on a link that
   was perfectly good. The kind is taught **above the regex, beside `selector`**,
   and it re-serialises what it read, because `1,1,1,...` and `1.000,1.000,...`
   are one day written two ways that key two identical solves through
   `shapeKey`, and the identity diff in `encodeState` would go on writing a
   pattern sitting at its own default into every link minted after.
3. **Key ownership.** A `Pattern` owns exactly one key, so `Channel.keys()`, the
   `INDEX` that `controlFor` reads and the `DEFAULT_PARAMETERS` loop need no
   change, and `labelFor`, `phraseFor` and `formatValue` grow no sub-object
   name. That is the whole reason for three single-key patterns rather than one
   multi-key gains control: a multi-key kind is three more places to be taught
   and three more switches to keep in step.
4. **`assertHideable`** refuses `when` on a kind the console cannot withdraw. The
   three patterns are therefore dimmed through `needs` rather than hidden, and
   `when` is passed to the base class rather than quietly dropped so that the
   assertion is what refuses it: a declaration accepted and then ignored is
   precisely the silent breakage it exists to turn into a throw at mount.

Two things the kind deliberately cannot do, and neither needed teaching. It is
**not sweepable**: `buildPattern` registers nothing in `rows`, which is the map
that hangs a Study card under a control, exactly as `buildDays` registers
nothing, because a study samples between `min` and `max` along a `step` and 24
numbers is a shape rather than a position. And it carries **no landmarks**: all
four of `readLandmarks`'s rules are about a numeric face and its step grid, and
nobody publishes a band for the shape of a daily profile. Both absences are the
honest answer, the same rule as the em dash on the drawing.

`Pattern` asserts its own precision at module load. A default of 0.189 declared
on a two-decimal control would be lettered, committed and written into the IDF
as 0.19 while the declaration went on saying 0.189, with nothing on the page
reporting the difference. TM59's fractions are divisions of Table E.1's absolute
watts (85/450 is 0.1889), so the hazard is live rather than hypothetical and the
three patterns carry three decimals.

`applyGains` writes byte-identically to before at `roomType: 'As drawn'`, and at
a named room type writes three `Schedule:Compact` objects (`Occupancy`,
`EquipmentUse`, `LightingUse`) with `People` switched to absolute `People` and
`ElectricEquipment` to `EquipmentLevel`, taking the two new schedules back out
of the document on the way back to `'As drawn'`. `Until: HH:00` and the value
after it are two separate extensible fields and must never be joined into one
comma-bearing string, and the collapsing of equal runs has to be deterministic
or idempotence fails.

### The Appendix E profile library (src/tm59.data.js)

Generated, and complete for the thirteen spaces Appendix E tabulates.
`scripts/build-tm59.mjs` writes it by hand rather than from `predev`, the way
`scripts/build-rates.mjs` does and for the same reason: no figure the sheet
letters is typed in at the place it is read. The primary source cannot be a file
the script reads, because the publication may not enter this repository, so the
transcription lives in the generator and the generator checks itself three ways:
Table E.1's absolute watts against Table E.2's printed fractions, hour by hour;
E.2's peak watts against its own headcounts, at 75 W sensible and 55 W latent
per person, which is what catches the row below; and both against the reader
supplied independent transcription of the 2017 tables, whose absence stops the
script rather than being shrugged off, because a generator that quietly drops
its cross-check is a generator with no cross-check.

**The fractions are divided out of E.1's absolute watts and never lifted from
E.2.** The two tables disagree by up to 2 %: 85/450 is 0.188889, which E.2
prints as 0.19 and which multiplied back is 85.5 W. E.1 is the primary
statement, and every division is lettered into the profile's own `why` so a
reader can redo it. Three findings are printed rather than resolved silently,
each becoming a `why` line on the profile it belongs to:

1. The 2 % gap above, which also shows at 0.23 against 35 W, 0.17 against 50 W
   and 0.13 against 10 W.
2. E.1's three-bedroom living/kitchen says "3 people at 75% gains", where E.2's
   own row for the same space gives a fraction of 1 and TM59:2017 says "3
   people". Two independent statements against one, and the 75 % also breaks the
   pattern that a combined living/kitchen carries the dwelling's full occupancy
   while a separate living room carries 75 % and a separate kitchen 25 %. 100 %
   is implemented and the discrepancy is printed.
3. E.2 labels the two-bedroom kitchen "1 person" while giving it 150 W sensible
   and 110 W latent, which is two people, against E.1's "2 people at 25% gains".
   The label is wrong and the arithmetic is right.

**What is deliberately absent** is the fourteenth row of Table E.1, the communal
space. E.1 gives it "Assumed to be zero" occupancy and "Heating system gains
only" equipment and quantifies neither, so there is no profile to write and
inventing a pipework figure would be the sheet asserting under cover of citing.
It is criterion d's space, and criterion d is on the unjudged list where it
belongs.

**What completes the arrangement is the desk's own vocabulary.** `TM59_SPACES`
in `controls.js` is the `roomType` selector's option list and `PROFILE_IDS` in
`tm59.data.js` is the library's, and the two have to be **one** vocabulary or
the desk and the library disagree about what the reader chose. `schemes.js`
asserts exactly that at module load, naming both lists and what to do about it,
rather than leaving it to be caught downstream as "sets roomType to a value that
is not one of its options", which is a true sentence about the wrong file.
`TM59_SPACES` predates the generated library and is the shorter of the two; the
list it is to become is `PROFILE_IDS`.

### The index sheet (no room for a column)

At `780px` wide **or `600px` tall** the desk stops being a column beside the
drawing and becomes a page of its own, where eighteen strips end to end is about
ten screens with nothing in them to say which one you are in. So the strips fold
to a line each — number, name, reading, patch marker — and the console becomes
its own index, one screen tall, in signal order.

- **The shortage has two directions, and the second one was missed for a
  while.** The desk is `100vh` minus a margin, with a fixed head and a fixed
  rail either side of its only scroller, so a *short* window takes its room out
  of the eighteen channels and out of nothing else — the same failure as the
  phone's, turned ninety degrees. Measured with the register folded, the head is
  181px and the rail 172, so a phone held sideways at 390pt left the channels
  3px of scroller. Below 600 no amount of folding rescues the column, so the
  height clause sends the desk under the sheet where the phone already goes.
- **The breakpoint is declared once**, in the media query, as `--index` on
  `.strips`. `console.js` reads that flag back rather than repeating the number
  as a `matchMedia` string. Layout is CSS's decision; the module only asks which
  one it got.
- **Between the two, the register folds instead.** From 600 to 1000px tall the
  column still works but is short, and the head is where the room is: measured
  on an iPad in landscape, the register was taking 323 of the head's 458px while
  the channels had 104px to scroll 12,000 in. Folded, the head is 181 and the
  channels get 381. `.presets` is a `<details>` carrying its own `--fold` flag,
  read back by `main.js` exactly as `--index` is, and acted on only when the
  flag *changes* — a reader who opens the register on a short desk keeps it open
  through every resize that does not cross the threshold, because the fold is
  the layout's opening position and not a policy about what they may look at.
  Closed it still reads, by the folded strip's own rule: the summary carries
  `built to Passivhaus Classic`, or `5 standards` where none is.
- **"Widen the window" is not said to a thumb.** That note shows between 781 and
  1180px, addressed to a laptop that can be dragged wider; a tablet in landscape
  is already as wide as it goes, and the sentence was two lines of red type
  telling the reader to do something they cannot — taken out of the head of the
  very column it was complaining is short. `pointer: coarse` is the honest test
  a stylesheet has: it names no device, it says there is no window manager under
  the reader's thumb.
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

### The schedules on a phone

The results schedule and the bill are the same instrument and fold the same
way, at their own breakpoint of `620px` — a *second* one, and the only other in
the stylesheet, because it answers a different question from `--index`. The
desk stops being a column beside the sheet when the window can no longer carry
both; a schedule stops being a table when its own columns collide, which
happens some way further down. A bill of a year's run under a pinned scheme
wants seven columns — an end use, three bases, a change against each — and at
390px they ran into one another (`18,456 −3,193$1,090 −$1893,727 −645` was one
row) while the results schedule pushed its unit column off the sheet entirely.

- **A row folds into a block**: the quantity keeps its own line, and every
  figure stands on a line of its own under it with the head it was under
  lettered at its left. Nothing is dropped and nothing scrolls out of sight,
  which is the same rule the folded strip keeps — a reading that cannot be read
  is not a reading.
- **The head a cell carries is `data-head`, set where the cell is built**
  (`renderSchedule`, `renderBillTable`), so the words over a column and the
  words beside a figure are one string. `headOf` names the bill's, for the same
  reason: a figure lettered `Carbon` under a column headed `Carbon (kgCO₂e)`
  would be a figure whose unit depends on the window width.
- **`keepTableSemantics` states the table roles outright.** `display: grid` on
  a `tr` or a `td` drops the implicit table roles in every engine, so without
  it a screen reader would lose the row and column structure at exactly the
  width where the figures need it most. The roles are set unconditionally —
  they are the same ones the elements already carry above the breakpoint.
- **The breakpoint is a judgement, not a derivation.** The column count is not
  fixed (the schedule heads one column per environment, and a run can carry
  eight), so it is set for the case that has to hold rather than computed from
  a count. Above it, the gutter between one column of figures and the next —
  `td + td` — is what keeps `Cost` and `Carbon (kgCO₂e)` from running together
  as the window narrows.

### The balance rail

The console's signature. Five channel meters are terms of the zone *air* heat
balance and therefore sum. Non-obvious facts, each of which cost real debugging:

- Use the `Zone Air Heat Balance …` family and nothing else. Mixing in
  per-mechanism variables (infiltration in joules, ideal loads in watts) does not
  close, because those belong to different balances.
- **The sign is stated in words, because a hue cannot be the only thing saying
  it.** Direction used to be carried by the pen — `--warm` right of zero,
  `--cold` left — and by the absence of a minus, since `watts()` prints no `+`.
  That is a colour-only encoding of the one fact the rail exists to state: in
  monochrome, under forced colours, or read aloud as a swatch, a name and a
  number, a positive term said nothing whatever about being positive, and a
  reader who took positive for "load on the system" read every strip backwards
  while the rail went on closing to 0.02 %. So the rail's head states the
  convention outright — in place, not on hover, by the rule that put what
  *Chase* means above the scoreboard — and `flowWord` in `readings.js` letters
  `in` or `out` beside every rail figure: the rail's key, the strip meter, and
  the folded index row, which on a phone is the whole reading. It is null under
  half a watt, which is where `watts()` itself stops distinguishing (−0.2 W
  already letters as `-0 W`) and is the rail's own threshold for a term worth
  drawing. The head also says what the `±` is — one side of the balance, not a
  net — which nothing did. Both halves fit one sentence of twenty-five words,
  and that is what stays in view: this is the one explanation on the console
  that is never folded, because the sign is the rail's whole argument.
- **Two of the five readings are not the variable they are named after, and
  both now say so on the strip.** `Meter.note` is where a transformation is
  declared, the way Glazing's transmitted-solar meter already says where its
  reading is summed. Neither transformation was wrong; neither was checkable.
- `Zone Air Heat Balance Air Energy Storage Rate` is the accumulation side, so it
  enters negated — and the meter is therefore lettered **Air energy release**,
  not storage. Under the variable's own name a reading of −400 W said "storage"
  and "out" in one breath, and the only reading of that which parses —
  discharging — is the opposite of what is happening. Negated, the same number
  *is* the rate the air gives its store back, positive as the air cools, so the
  label and the sign agree and a negative reading resolves the right way round:
  the air is charging. A legend alone could not fix this one.
- `Zone Air Heat Balance System Air Transfer Rate` is reported at **building**
  level, already multiplied by the zone multiplier, while the other four are per
  zone. `Term.perBuilding` marks it and the reader divides it back down. At a
  multiplier of 3 the ESO reads three times what the strip letters, which is why
  the meter carries the note.
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
- **The marker drags, and the listeners are on `.trace` rather than on the
  `<svg>`.** Every step of a drag re-letters the reading, which redraws the
  plate, which throws away the SVG the gesture started on — and any pointer
  capture held on it, so the drag would end silently on its first frame. The
  host survives; `plateField` carries the last render's hit test (the viewBox
  width, the field inside the gutters, the point count and whether the axis is
  too coarse for a click to mean an hour) so an event can be mapped back to an
  index. Two rules that are not obvious: a press that never travels is still a
  **click** and toggles, while a drag that ends where it began must not release
  the pin it just placed (`hold`); and the address bar is left alone until the
  release, the rule every gesture here follows — `endGesture` is not used
  because a pin is not a shape, so the suppression is passed down instead.
  `setPin` / `releasePin` are the one pair every route goes through.
- **The hour also has a picker, and it lives on the sheet.** `renderWhen` draws
  a bar between the plate and its caption carrying the instant, the hold, and
  two ways of naming another one. It is on the sheet rather than only on the
  rail for the reason the plate grew its marker: the rail is inside a console
  you have to open, and the hour is the most movable thing about every figure
  on the page.

  Half of it is **named instants** (`INSTANTS` in `readings.js`) — the hours the
  field already has words for. EnergyPlus's own Component Load Summary reports
  at the *time of the peak load*, heating and cooling apart, and every sizing
  report names that time, so **peak heating** and **peak cooling** are the two
  a modeller arrives with; a results tool's period list (DesignBuilder's is the
  familiar one) offers summer and winter *design* weeks read off the weather
  file's own statistics, which translates to an instant as the **hottest** and
  **coldest outdoor** hour; the zone's own **warmest** and **coolest** belong
  beside them because a free-running desk has no heating or cooling rate at
  all; and **peak solar gain** is the hour every glazing and shading control on
  the desk is arguing about. Each is found by `argmax` over the ESO in hand,
  over *every* environment the run came back with — deliberately not the billed
  ones `readExtremes` uses, because a reader asking for the peak heating hour
  of a run handed a winter design day means that day, and the offer letters
  which environment it landed in so nothing is hidden. `Instant.holds` is the
  honesty gate: an `argmax` always returns something, so "peak heating" over a
  run that never called for heat would hand back the least-cooled hour under a
  label claiming the opposite. Where it fails, or where the series is not in
  the run at all, the offer is **refused with its reason in place of its
  stamp** rather than falling back to a neighbour.

  The other half is a **calendar bounded by the run**. A date field was
  rejected once, on the argument that it invites February the 30th and hour 25
  purely to meet a refusal message — but that was an objection to a *free*
  field, and every option here is walked out of the run's own timestamps
  (`runCalendar`), so there is nothing left to refuse. It earns its place
  because the gesture cannot reach everywhere: an annual plate at ten hours to
  the pixel is physically unable to name 15:00 on 14 February, and a pointer is
  not the keyboard's instrument at all. Coarse to fine — choosing an
  environment lands on its own worst hour, a month or a day on that day's
  extreme, and only the hour field names an hour.

  Both halves are cached on the ESO's identity (`offersFor`, `calendarFor`):
  the bar is rebuilt on every frame of a plate drag, and seven argmaxes over
  8,760 hours per frame would be the one expensive thing in a gesture that is
  otherwise array indexing.
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

### E-02, the design space survey (src/survey.js, src/pull.js, src/relief.js)

A second drawing on the same sheet: one chosen reading surveyed over two chosen
controls, cut through the desk's current stance. The ground is built only out of
completed runs; the contours and the relief are inference drawn between them and
say so in place on **both**, because a continuous surface is read as continuous
data wherever it is drawn.

**A survey row is already a study, and that is the whole design.**
`buildSample(job, value)` applies `{ ...job.snapshot, [job.key]: value }`, and
`job.snapshot` is a whole desk — so a row at a fixed value of axis Y is a job
whose snapshot carries that Y and whose swept key is axis X. Two dimensions are
reachable with no change to `buildSample` and none to the sample cache, which
makes three requirements properties of the arrangement rather than features: a
study of axis X at the stance is byte-identical in cache identity to the
survey's own stance row and costs no run; rows and studies are literally in one
queue, so there is no second pool for one to starve the other from; and
`clearAll` on a station change takes the ground down with the curves because it
is the same call.

- **A job's identity is not its swept key.** `makeStudyJob` gained an `id`
  defaulting to `key`. A study is one curve of one control so the two are the
  same thing, but a survey enqueues nine rows that all sweep the same control,
  and under `key` the scheduler's `byKey` would treat each as superseding the
  last: eight of nine cancelled as 'moved' before a single sample dispatched,
  leaving a ground one row deep with nothing anywhere saying why.
- **`takeNext` is round-robin, and it had to be.** Measured against the old
  job-order walk with eleven survey rows and one study, five samples each, a
  pool of two: the study's first sample was **dispatch 55 of 60** and its last
  was 59 — the study begins only once the whole survey has finished, which
  reads to the reader as a hang. Round-robin puts its first sample at dispatch
  11. `specs/006-design-space-survey/verify/scheduler-fairness.mjs` is the
  gate, and it drives the queue against a fake pool.
- **The rows go in in one breath.** `enqueue` drains on the way out, so
  enqueuing nine rows one at a time fills the pool from row 0 before row 1 is
  in the list, and the coarse pass lands as one finished row over eight empty
  ones. The scheduler's `enqueueAll` admits them together and drains once;
  it replaced a module flag that held `paused()` true across the caller's own
  loop, which made the pause mean two things and had been copied to the pull
  under the survey's name.
- **A survey's rest shape omits *both* axes**, where a study's omits only its
  swept key. Standing on a measured point is the whole point of the drawing,
  and a rest shape that omitted only X would cancel the ground the first time
  somebody stepped along Y and re-measure eighty-one designs it had already
  measured. `deskKey` therefore takes a key or a list. `applyGeometry`'s cancel
  point has to ask a row the right question too, or every row is cancelled on
  every apply — including the applies the survey's own samples cause.

**The coarse pass is 6 and the fine one is 11, and both numbers are decided by
one requirement: a densify must reuse what has already been run, and so must a
survey opened on ground a study has already covered.** That is the property
`COARSE_SAMPLES` (11) and `SWEEP_SAMPLES` (21) have in one dimension — the raw
positions for n = 11 are the even positions of the 21-point grid — and carrying
it to two dimensions is arithmetic that has to be checked rather than assumed.

The plan estimated against 5 and 11, which does not have the property at all:
five positions sit at `i/4` and eleven at `i/10`, and 0.25 is not a tenth of
anything, so three of every five coarse rows fall between two fine ones and a
densify throws the whole coarse pass away. Nine was tried next and is worse
than it looks — `i/4 = 2i/8`, so the densify is honest, but 9 has no
relationship to the study grid, and **that is the reuse the reader actually
notices**. Measured in the browser: 100 positions of a 5 → 9 ground cost 94
engine runs against a completed study of one axis. Six of a hundred free is not
the promise SC-011 makes.

Six and eleven have both, because `i/5` is every second position of `i/10` and
`i/10` is every second position of `i/20`. Verified over the declarations
rather than over the arithmetic, since snapping is what the property has to
survive: over all **90 sweepable numeric faces**, 5 → 9 lands inside a study's
grid on 6 of 90 and 6 → 11 lands inside it on **90 of 90**.

Both counts are even, which costs the midpoint sample an odd count would put on
each axis — and costs nothing, because `axisFor` forces the stance's own value
into the list regardless. That is what FR-005 actually asks for and it is a
better guarantee than a midpoint: the point the reader already understands is
measured wherever it happens to sit, which is also why a survey asked for six
positions legitimately holds seven and a fine ground is 12 × 12 rather than
11 × 11.

Measured in the browser, which is the only place this can be measured: sweep
Glazing S as an ordinary study, then cut a ground along Glazing S against wall
resistance. **144 positions cost 132 engine runs.** The twelve that cost
nothing are exactly the survey's own stance row — every position of the swept
axis at the stance value of the other, answered from the study's cache. Under
5 → 9 the same test spent 94 of 100.

**Three states, told apart three ways, and the third is drawn by absence.**
Measured is a tick with its figure; inferred is a hairline contour carrying its
level and no figure read off it anywhere; unsurveyed is bare sheet with no
contour carried across it. That last is structural rather than styled:
`contoursOf` emits nothing for a cell whose mask is not full and `meshOf` emits
no triangle touching one, so a gap cannot be filled from a neighbour because
the geometry that would have covered it is never generated. Styling it instead
would leave one `fillStyle` between an honest drawing and a dishonest one.

**Coverage is load bearing, not a caption.** The relief is smooth by decision,
and unlike a faceted one it does not report its own sample density in its own
texture — so the density and the coverage figures are the only thing separating
a coarse survey from a convincing picture of one. `Coverage` asserts
`measured + gaps + unsurveyed === wanted` in its constructor, because a relief
and the count of what was measured must never be able to disagree. This must
not later be softened as cosmetic.

**Which way is better is declared, not assumed.** Ten of the thirteen readings
are compliance metrics or costs where less is the definition. The zone's own
high and low are a comfort judgement nobody publishes as a target, so they are
declared as conventions and say so — the same `CONVENTION` prefix the landmarks
use, and for the same reason. A reading with no declared direction is one the
survey will not let fall and will not name an improving region for; it draws
the ground and refuses the two readings that need a direction, with the reason.

**The free exchange refuses on two grounds, and the second replaced a worse
one.** Comparing the second-order term against the first-order one is not well
founded: along a level line the first-order change is exactly zero by
construction, which is the whole point of it, so there is nothing for the
curvature to be large *against*. What actually goes wrong on a shoulder is
visible in the answer itself — measured on a coarse ground over a `tanh`
shoulder, one step of glazing "bought" 24.6 m²K/W of wall resistance across an
axis running 0.2 to 10. So the gates are: the 3 × 3 must span no more than a
third of each extent, and the level-line step must land on the ground it was
read off.

**The relief is WebGL2 written here.** One vertex and one fragment shader, a
hand-rolled orthographic and look-at pair, an indexed triangle mesh, one draw
call. Principle V restricts *packages* and prefers platform APIs; gl-matrix,
three.js and d3-contour are packages and none is needed for a constrained orbit
over a height field. Orthographic because parallel projection is what makes two
viewpoints comparable, the same reason E-01's axonometric is one. **No vertical
exaggeration control**, because a reader who can dial the drama of a result up
and down can argue from the picture. **One hue, ink levels only** — the reading
is a magnitude with no direction, so `--cold` / `--warm` are not spent on it,
which is why the survey is grey. `createRelief` returns `null` where no context
can be had and the caller states the loss in place; every reading is on the
plan and under the reader's own pointer already, so what is lost is the shape
and nothing else.

**The reading stands in view and the record is folded under it.** The schedule
of spot heights carries every position of the ground — 144 rows on a fine one,
and because `.schedule` folds each row into a block at 620px, some five hundred
lines of table on a phone under two drawings. It is shut by default now, and
`renderSpotReadout` letters in view the thing a reader actually wants from it:
the design under their own pointer, in full, lettered by pointing at a tick or
by walking the ground with the arrow keys.

That split is the point. The schedule's three jobs are all questions about
**one** design at a time, which is how a survey is read; the table answered
them by printing all 144 answers at once. So the readout answers them where
they are asked, and the table stays as the complete record for the reader who
wants to compare rows or scan a column.

**This is the one table of readings on the sheet behind a disclosure, and the
rule it looks like it breaks is worth stating.** *Readings never go in a fold*
is about the reading the page is **for**, and that is in view: the readout, the
coverage line, and the plan's own figures. The fold holds the *record*, which
is a different thing — the same shape as the TM59 qualifications block, where
the count stays in view and the entries are one press down. The summary carries
the count for exactly that reason: a reader who never opens it must still come
away with what it holds.

The `<details>` is **static markup** and only its table is rebuilt, because
`renderSurvey` runs on every landed sample — a fold rebuilt 144 times over one
ground would slam itself shut under a reader who had opened it, which is the
hazard that made `renderSurveyChoose` stop rebuilding the extent fields.

The three jobs, and why a line in view answers each of them better than a table
one press away:

- **108 of a fine ground's 144 figures are lettered nowhere on the plan.**
  `figureAt` thins the plan's figures to every second position on each axis
  once either axis passes seven, because a figure at every position is
  illegible. Measured on a 12 × 12 ground with 49 positions landed: 49 ticks
  drawn and **4** figures on the plan. Pointing at any tick letters it.
- **A shut table is no route to a figure at all for assistive technology, and
  neither was an open one.** Both drawings are `role="img"`, which makes the
  whole subtree presentational, so every `<text>` on the plan is invisible and
  `surveyAriaLabel` carries the axes and the coverage and no reading. The
  readout is `role="status"` — a polite live region, which is what the cursor's
  sentence never had: `surveySay` writes into the refusal paragraph and a
  refusal is not announced. The sentence is now spoken by being written, and
  the refusal paragraph is back to carrying only refusals, which is the
  conflation that fixed itself on the way past.
- **The relief can refuse to draw** (FR-024), and the plan plus this line are
  then the survey without anything needing to be opened.

Three things follow that are worth keeping straight. A hover **does not move
the keyboard cursor** — the ring is where the keyboard is standing and a hover
is not a move — and it re-renders nothing, so sweeping a pointer across 144
ticks costs a string apiece rather than 144 redraws of the ground. A gap's
reason is now lettered rather than living only in a `<title>`, which
`pointer: coarse` never shows; before, a cross on a phone said only that
something had failed.

And **`pointerleave` is honoured only for a mouse**, which is the subtlest of
the three. A touch pointer does not hover: it comes into existence on contact
and is destroyed on release, so `pointerleave` fires at the end of *every* tap.
Left symmetrical with `pointerenter`, a tap lettered a design and took it away
again in the same gesture — the reading flashed and reverted before it could be
read, which is the whole of this line's usefulness on a phone. So a finger
leaves the reading standing until another tick is touched, and a mouse restores
the desk's own design as it always did. `event.pointerType` is the honest test,
the same shape as the stylesheet's `pointer: coarse`: it names no device, it
says what kind of pointer this is.

The line is a reading, so it is never folded. It carries `min-height` for two
lines, because a sentence that changes height as the pointer crosses the plan
would walk the coverage figure and the finding up and down the page under the
reader — the same rule `resultPanels` keeps. Measured at 340px: two lines
typically, three for the worst case this desk can compose (two axes with long
labels and both TM59 readings).

**It costs transfer rather than saving it**, and that is the honest figure:
brotli went from 223,136 to 224,556 bytes, **+1,420** — the readout, the fold
and the prose these decisions are recorded in, with no table code removed to
pay for them. What was bought is the length of the page, not its size: shut,
the schedule is **17px** of summary against the **3,875px** it stands at open
on a 12 × 12 ground.

**The traverse is a record of the desk, not of the survey.** It is written by
`commit` at the end of every gesture and by `patchChannel`, so a design reached
with the sliders is on it whether or not a ground is cut, and clearing the
survey does not clear it — only a station change does, because then every
reading at every stop is of another city's weather. Three things about it are
not obvious:

- **A stop's readings cannot be handed to its constructor.** A stop is recorded
  at the end of the gesture that reached it, which is *before* the desk has
  been solved. `landTraverseReadings` fills them from the solve, matching on
  the run's own snapshot rather than on live `params`: an annual run takes the
  best part of a second and the reader may have moved on twice, so a stop
  taking whichever readings landed next would carry another building's numbers.
  `TraverseStop` is frozen, so the entry is replaced rather than mutated.
- **The desk the sheet opened on has no stop until the reader leaves it**,
  because `recordTraverse` is called on a *move* — and the boot solve, the one
  run that describes it, lands before any stop exists. The traverse is seeded
  from that run instead, and only from an empty traverse: a later run matching
  no stop is a stale solve of a desk already left.
- **A design revisited moves to the end rather than being added again.** A
  traverse is a path and a path may double back, but the record exists to be
  restored from and a second row for one design offers nothing the first does
  not — and both of them answered to "you are here", which is one claim too
  many.

**The list is the complete statement; the marks on the plan are the shortcut.**
The plan can only draw the stops whose values fall inside the extent the ground
was cut over, and draws nothing at all with no survey open, so a design walked
to and then narrowed past would vanish from the record. Same arrangement the
boundary key keeps against the axonometric: three of six surfaces are
clickable there and the key carries all six. It is also where the keyboard
reaches them, because a table row already has a tab stop and a mark on an SVG
would need one apiece.

**The extent boxes are `quantityField`s and they exposed two things.** A field
built and appended alone stands empty — every other caller on this sheet calls
`show()` from its own redraw — and, more seriously, `renderSurveyChoose` rebuilt
the whole chooser on **every landed sample**, a hundred and forty-four times
over one ground. `host.textContent = ''` destroys the node the reader is typing
into, so an extent typed while the ground filled lost its focus, its `took`
value and therefore the keystrokes, and committed nothing silently.
`field.js` guards its own `show()` against a redraw writing over a field;
nothing can guard a field against being deleted. The chooser is now redrawn
only when its own signature moves.

**Things that cost real debugging:**

- **`.survey-body` sets `display: grid`, which beats `[hidden]`.** An author
  `display` declaration beats the user agent's `[hidden] { display: none }`
  outright, so `el.hidden = true` did nothing and two empty framed boxes stood
  under the chooser with no survey cut. `.survey-body[hidden]` is the twin, and
  it is the same fix `.link[hidden]` and `.bill[hidden]` each are.
- **`dataset` is a getter-only property.** `Object.assign(cell, { dataset: {…} })`
  throws — and from inside a scheduler callback it took down the drain, leaving
  the pull reading `0 of 37` for ever while the runs quietly completed behind
  it. Write `cell.dataset.head` instead.
- **`URLSearchParams` escapes every punctuation mark but `*`, `.`, `-` and
  `_`.** A tilde separator came back as `sv=wwrS%7EwallR%7Ehigh`, giving up
  exactly the legibility the delta encoding is arranged around — the same
  failure `at=year%408-3T13` had before the pin's `@` became a full stop. Of
  the four survivors `-` cannot separate an extent (a bound may be negative)
  and `.` is spent on the decimal point, which leaves `*` between fields and
  `_` inside an extent: `sv=wwrS*wallR*high*0_0.9*0.2_10`.
- **A contour label tested only against other contour labels overprints the
  measured figures**, which hides a measurement behind an inference. The
  clearance test is seeded with where the spot figures will stand, and a level
  simply goes unlettered where nothing clears — pointing at the tick letters it
  regardless.
- **Lettering the unit on both stops of an axis runs it off the frame.**
  `3.00 m²K/W` at the head of a 44 px gutter printed as `00 m²K/W`. The stops
  carry bare numbers and the axis label carries the unit once, which is how a
  survey drawing has always lettered a scale.
- **`choose` is wrapped rather than flagged inline.** The attach has half a
  dozen refusal exits, and a flag cleared at five of them is a flag eventually
  left set at the sixth — which would gate the descent shut for the rest of the
  session with nothing saying why.

**The `sv` key, and the trap this codebase has now met three times.**
`readValue`'s numeric regex runs *before* its per-kind switch, so a branch
written inside that switch is unreachable and every survey link would be
refused as "is not a number for sv" — a true sentence about the wrong thing, on
a link that was perfectly good. `sv` is a **reserved** key, so it is read in
`decodeState` beside `at` and `sty`, above everything `readValue` does, and the
reserved skip keeps it from ever reaching that function. It re-serialises what
it read, for the reason the holiday list and the hourly pattern both do. The
link carries axes, readings and extents and nothing else: not the measured
values, since the recipient re-measures to identical numbers, and not the
camera, by the chase pin's rule that how a thing is being looked at is not what
it is. `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty.

**A priced axis costs nothing and keeps its price.** Spec 011 superseded "priced
controls must not be axes": along a priced axis every spot height of a row is the
same run priced again, so a ground of a shaping axis against a priced one costs
the shaping axis's positions and two priced axes cost one run. Measured on the
page: U-factor by seasonal efficiency at 11 × 12 is 132 positions from 11 runs.
`absorbSurveyRow` lands each point's priced readings, not `sample.readings`, and
a `SpotHeight` keeps its run's `basis` so `repriceSurvey` can re-price it without
the bounded cache. **Before this, nothing re-priced E-02 at all**: on `main`,
turning the gas price from 0.070 to 0.250 re-lettered the bill's gas line from
$192 to $687 and left every spot height at $2,389 (verify/README.md, T002). A
spot that stops pricing becomes a `Gap` carrying the `Absent` rate's reason and
its basis, so it comes back with no run when the rate does; a `SpotHeight` with
a null reading is never built, or coverage would count it measured.

**The pull costs one run per control, and the run kind is stated.** 18 channels,
144 control keys, 9 priced, **90 sweepable numeric faces** — counted, and
re-counted by the harness against the declarations. One-sided differences,
because the stance's own run is already in hand: 90 runs at most, not 180. On
the default desk only 37 are probed and **53 reach no object at all and cost no
run**; they are listed with their reasons rather than omitted or drawn as zero,
because "the Gains channel is out of the path" is often exactly the answer to
why nothing the reader tries moves the reading. `direction` is `'none'` only
where the effect is *exactly* zero: there is no noise floor, because the engine
is repeatable on one input.

The ranking agrees with independent full sweeps on **10 desks of 10**, no
tolerance — including the three that exist to reach the failure modes: a
control at its stop, a channel patched out (Fabric out leaves 18 probed and 72
inert), and a wall carrying no opening. The comparison is one a sweep can
honestly make, which took a rewrite to get right: a probe steps a twentieth of
the face and `samplePoints` lays its positions on the control's own step grid,
so the probe's landing position is generally not one of them — measured,
`groundReflect` probes 0.20 to 0.25 against a sweep that never visits 0.25.
What is checked instead is the stance reading **exactly**, the sign of the
sweep's own slope across the pair bracketing the stance, and the order of the
top three.

**The determinism gate has two halves and Node can only run one.** Twenty runs
of one design agree exactly, measured. *Instance reuse* cannot be reached from
Node at all: `main` cannot be called twice in one process — on the same
instance it throws a raw number (a C++ exception pointer, EnergyPlus aborting
because its globals are already initialized) **before doing any work**, leaving
the previous run's ESO in `/output`, so a reuse harness would read run one's
output twenty times and report perfect agreement. That trap is closed by
asserting the refusal outright. The harnesses therefore run **one EnergyPlus
per process**, about 1.8 s each; the reuse half is a browser gate.

**The axis chooser is a list of 129 offers, and it broke twice.** A column flex
container with a `max-height` gives its children the default `flex-shrink: 1`,
so all 129 shared 220px: every option computed to **6px** tall while its wrapped
sentence painted over the four rows below it. `flex: none` on the item, a capped
width on the list. And a refusal true of a whole channel was written on every
control the channel owns — 53 rows repeating one paragraph. The channel is a
group heading now and states it once, which leaves **three** per-entry reasons,
the ones that genuinely differ within a group.

**Flipping the axes costs no engine runs**, and that is a property of the
arrangement rather than an optimisation worth being pleased about. A sample's
cache identity is the whole desk, so the design at glazing 0.3 against wall
resistance 5 is the same design whichever of the two the rows are cut along:
every point of a flipped ground is the same desk transposed and comes back out
of the cache. Measured, a flipped 12 x 12 spends **0 runs of 144**. It is also
why the flip re-cuts at the density the ground already had rather than at the
coarse pass — `surveyGrid` carries that — since dropping a measured 12 x 12 to
7 x 7 and climbing back out would be free in runs and expensive in what the
reader is looking at, for no reason but a default argument.

**The stance moved with the ground, not with the desk, and that was a bug in
six places at once.** `Survey.stance` is the frozen desk the ground was *cut*
through, and it has to be: `rowsFor` builds every row's snapshot from it, so a
desk that moves mid-measurement must not change what the remaining rows are
measuring. But a getter called `stanceAt` read that snapshot, and six things
read the getter — the crosshair, the keyboard cursor's start, the improving
region, the free exchange, the refinement priority and **both halves of the
descent**. So standing on a measured point moved the desk and moved none of
them, and *Let it fall* fell from wherever the reader had been when they cut
the ground. FR-021 says in so many words that the mark must move when the desk
moves.

The two questions are now named apart: `cutAt` is where the ground was cut and
does not move; `standingAt(desk)` is a question about a desk and therefore
takes one. It also answers the case the single `null` was hiding — a desk
**between** two measured designs after a slider nudge, which is much the
commoner state and was being told it was outside the extent entirely, with a
fix ("widen the extent") that would not have helped. The mark draws at the
desk's true position between two columns and goes hollow there, because it is
not standing on a run.

**Nothing on the drawing said what any mark was.** Five marks and every
explanation in a `<title>`, which `pointer: coarse` never shows. `renderGroundKey`
prints the key under the plan, drawing each mark from the classes the ground
itself uses so a restyled mark cannot disagree with its own key. The hatched
region in particular was being read as "not yet computed" — it is the opposite,
measured designs that read better than the one the desk is on.

**The relief is a block, not a floating sheet.** A surface drawn alone has
nothing to say which way is down, no silhouette to judge a slope against, and
nowhere to letter an axis. `blockOf` cuts the ground away beneath the terrain —
the cut faces down every silhouette edge, and the base those cells laid flat.

- **None of it is measurement, and the drawing keeps saying so.** The sides are
  a section through nothing: this survey knows the reading *on* the ground and
  nothing whatever about what is under it. So the block is derived from the
  same lattice and the same mask and can add no ground the surface does not
  already have — every skirt quad hangs off an edge of an emitted cell, and a
  hole in the surface is a **shaft through the block** rather than something
  quietly filled in. The cut and the base take `--inset`, the tone every trough
  on this page is drawn in, so they read as the block rather than as more
  ground.
- **The levels are ruled around the cut, clipped to it.** `strataOf` turns the
  side into the vertical scale — the terrain's own surface is foreshortened
  from every viewpoint the orbit allows and cannot be measured with a ruler,
  where a ruled cut can be counted in bands. Each cut face is a quad with a
  sloping top, so a level above both ends of its edge has no face to sit on and
  one between them crosses part of it; drawn straight across regardless the
  rules float above the terrain at exactly the corners where the ground is
  highest, which is a line claiming a height the block does not reach.
- **`arrisesOf` rules the vertical corners.** Without them an oblique reads as
  two flat washes meeting at a seam that does not say which way the corner
  folds. A corner is where the silhouette *turns*, not one of four: on a plain
  footprint that gives four, and around a hole it gives that hole its own,
  which is right, because a shaft is as much an edge of the solid as the
  outside is.
- **The base carries the axis furniture**, because it is the one plane in the
  drawing that is flat, known, and carrying no reading.
- **The height has a scale of its own**, which it went without for a while:
  the ruled levels were the only vertical measure and nothing said what they
  measured. It is SVG in the overlay, standing on the tallest corner of the
  block the reader can see: of the corners the orbit does not hide, the one
  the terrain is highest at. The hidden corner needs no camera maths — in
  parallel projection from above, the back corner of the base is the one
  highest on screen (both of them when a face is seen square). The staff runs
  from the lowest measured reading to the highest, carrying on above a lower
  corner so the top levels are not left unread, ticked at the ruled levels
  and lettered as the plan letters its contours, with its figures on the side
  facing away from the block and giving way to the base's stops. Plan down
  draws none, because a vertical seen from above has no length. The unit is its own `tspan`, since
  the axis names are set in capitals and kWh/m² in capitals is another unit.
- **The pin stands proud of the terrain rather than down through it.** Run from
  the base to the surface — which is what a pin through a solid ought to be —
  the shaft is inside the block at every viewpoint, the depth test hides all of
  it, and the mark reduces to a single dot with no pin in it.
- **Between two measured designs the pin stands hollow, not nowhere.** It was
  dropped there, so typing a figure between two positions took away the one
  mark saying where the desk was. It now stands at the desk's true fractional
  position on the surface the relief draws (`surfaceAt` reads the same two
  triangles `meshOf` emits, so it sits on the drawing rather than a hair off
  it), with the armed square hollow, which is the plan's own mark for that
  state. No figure is lettered off it. Over an unmeasured cell there is no
  surface and no pin.

**Two bugs the block found, both of the kind that look like a maths error and
are not.** The base was carried in the drawing's normalised units and therefore
had to be exempted from the normalising pass, which meant recognising it,
which meant comparing floats: the positions are a `Float32Array`, `-0.35` does
not survive the narrowing, the equality never held, the base was normalised
along with everything else and the block ran four times its own height off the
bottom of the frame. It is carried in reading units now, where there is nothing
to exempt and nothing to compare. And the lettering has to be pushed clear of
the block in **screen** space, not lattice space: which way is "outside"
depends on where the camera is standing, and an offset that clears the
silhouette from one viewpoint lies across it from the next.

**WebGL has no text**, so the axis names and stops are real SVG over the
canvas, positioned through the same matrices the GPU is handed. `toWorld` is
the one copy of the shader's own mapping — the vertex shader swaps two axes on
the way into world space, and anything lettered outside the shader has to make
the same journey or the words drift off the corners they name.

**Transfer:** 26,367 bytes of brotli added against SC-012's 60 KB ceiling.
`src/model.js` is untouched and no new `Output:Variable` is requested anywhere,
which discharges the output-budget requirement outright.

#### Somebody else's published line, cut across the ground (feature 012)

Every standard's limit for the plotted reading is drawn as its own isoline with
the passing ground hatched, on the plan and on the relief; a reading that
carries no limit says so. `Threshold`, `ThresholdSet`, `PassingGround`,
`thresholdsFor`, `passingGround`, `thresholdLevels` and `thresholdAbsence` are
all in `src/survey.js` and DOM-free, so a Node harness drives the real
functions. Nothing here reaches the IDF, the link, `shapeKey` or the engine:
chasing, unchasing and switching units were measured on the page and `#s-runs`
does not move.

**The line is the `Target`, held by reference.** `Threshold.limit` is a getter
onto `target.limit` and there is no own property behind it, so the line and the
scoreboard row it belongs to are one declaration and cannot drift. A `limit: 15`
written anywhere in `survey.js` would be the defect FR-009 exists to prevent —
the same drift the contour label had when it was lettered off `toFixed` and drew
an SI contour on an IP sheet.

**The pass side is probed, not declared twice.** `passesBelow` is read off
`Target.meets` at `limit ± max(1, |limit|) * 1e-6`; a probe that does not
resolve to exactly one side throws at load naming the target. Every target on
this sheet passes at or below its limit today and the probe records that as a
measurement, so a target published the other way round draws its band on the
other side with nothing in this feature edited. `SENSE` is **not** the pass
side and must never be used as one: it is a direction of improvement, it is
`'higher'` for the zone's low, and it carries the `CONVENTION` prefix for
exactly the two readings that carry no limit at all.

**The TM59 category trap, which is the one place this can be silently wrong.**
`tm59a`'s quantity reads criterion a at one category (`TM59_STUDY_CATEGORY`,
Category II) while TM59 declares the criterion at two, and **both categories
carry the same limit**. Matched on `metric` alone, a Category I line is drawn
across a Category II ground and looks perfectly correct while citing a
criterion the ground does not answer. `tm59.js` met this first — `clearedCount`
matches on criterion *and* category — so the rule is that module's, restated in
`matchedTargets`.

Two facts are kept apart there, and conflating them is what makes a qualifier
fail quietly. A qualifier that is **decidable and different** describes another
reading: Category I is correctly declared and simply not this ground's, so it is
not matched and that is a fact about the roster. A qualifier the survey
**cannot decide** — an `overheat` target naming no temperature, a TM59 criterion
read by category naming none, a criterion carrying one where the reading has
none — throws at load naming both declarations, because falling through to a
match there is the silent fallback. `OVERHEAT_ABOVE` was named in `study.js` for
this: the reading has to be able to *state* what it reads at before anything can
check a target against it.

**Kinds are compared, unit strings are not.** The `demand` quantity says
`kWh/m²·yr` and the Passivhaus target says `kWh/(m²a)`; a converting kind owns
its unit string outright, so the kind is the comparison and the wording is the
publisher's.

**Coincident limits are the common case, not an edge one.** TEDI carries
Passivhaus 15 *and* LETI 15, `overheat` carries Passivhaus 10 and EnerPHit 10.
They collapse to one line at `max(1, |limit|) * 1e-9`, labelled with both names
over one band, while the key keeps a row per standard. And an ordinary contour
within `step / 10` of a drawn line is dropped at the **plan's contour drawing
only** — `levels` itself is left whole, because it also rules the relief's cut,
which is a scale rather than the ground. Measured on the page: a narrowed
wall-and-roof-resistance ground at a 5 W/m² interval drew 39 contour segments
with the line withdrawn and 22 with it drawn, and the level lettered 10.0
disappears exactly when "Passivhaus 10.0" appears.

**The band is the same marching square as the line.** `passingGround` walks the
identical cells with the identical edge interpolation, so FR-004 (nothing over
unsurveyed ground) and FR-006 (both drawings agree) are properties of the
arrangement rather than rules anyone has to remember. The **saddle** has to be
settled the same way or the band joins ground the line keeps apart:
`contoursOf` decides by the cell's own mean, so the band asks the same
question — the over-pair is connected when the mean is over the level — and
Sutherland–Hodgman is used for every other case, where it gives the marching
square's own region by construction. Exactly at `mean === level` the two
resolutions are a tie and the harness asserts both sides of it.

**The contour and the triangulation disagree, and the relief has to allow for
it.** The contour segments are interpolated along cell *edges* while the
surface is triangulated on the bottom-left-to-top-right diagonal, so a
segment's interior can sit a hair off the drawn surface mid-cell — the same
disagreement `surfaceAt` was written for. The line stands `THRESHOLD_LIFT`
(0.004 of the normalised box) proud, for the reason the pin does: run exactly
on the surface, the depth test eats it and the reader is handed a boundary with
no boundary in it; run through it, the same disagreement shows as a stitched
line. The band is a fragment-shader branch on `vHeight` rather than draped
geometry, so it stays exact at every viewpoint and cannot reach ground the mesh
does not span — the holes are in the index buffer, which keeps `Coverage`'s
guarantee intact through a second drawing. `gl_FragCoord` is in device pixels,
so the stipple carries `uPixelRatio` or it comes out twice as fine on a retina
screen as the plan's hatch beside it.

**A criterion's own words do not fit in a legend, and that was measured.**
`Target.asks` is a short clause for the energy lines ("≤ 15 kWh/(m²a)") and the
whole criterion for TM59's — criterion a is forty-five words on its own — so
the first key entry came out at **75 words** against `CEILING`'s 40. The board
is where a standard says what it asks, in its own words, on the row for that
very target; the key is where the drawing says what a mark *is*. The entry now
names the standard, the criterion, the figure and the side that passes, and all
117 distinct strings this feature can compose fit the ceiling, the longest at
39. `STANDING` (15) and `ABSENCE` (12) are **not** the binding budgets here and
the plan's guess that they were is wrong: these are entries in the drawing's
legend, which is a visible block, not a marginal note beside an em dash. The
existing entries beside them run to 24 words.

**A label is a box, not a point.** `drawGround`'s `lettered` list is points and
its clearance test was a radius, which is near enough for a five-character
contour label and is not for a fourteen-character one: "Passivhaus 3.2" cleared
a spot figure's centre by 22 units and printed straight across it. `roomAt`
now takes the label's half-width and measures to the *box*, the chosen turn is
the roomiest rather than the first that clears, midpoints count as candidates
(a segment's ends sit on cell edges, which is exactly where the lattice puts
its figures), and the label is entered into `lettered` across its whole width
so a contour label placed afterwards clears all of it. Threshold labels are
placed **before** any contour label, so the order of precedence on this drawing
is measurement, then published line, then inference.

**One index behind four marks, and it belongs to the band.** A band's hatch
pattern, its fill class, its line's chain-dash class and the relief's hatch
angle are all taken from its position in the list. Three of them wrapped at
four (`at % BAND_ANGLES.length`) and the fill class did not, so a fifth band
would have asked the page for `.passing-4`, which it does not declare — and an
SVG polygon with no `fill` is a solid black one, which is a whole ground
painted out on the day somebody publishes a fifth limit for one reading.
Unreachable against today's roster, where the busiest reading draws two, and
exactly the kind of thing that stays unreachable until it is not. `Band` is a
declaration rather than the dictionary it started as, `signature` wraps once in
its constructor, and the four marks read it.

**Read once, at the top of `renderSurvey`.** The plan, its key, the relief and
the aria label each read the declarations for themselves, which is four chances
to be handed a different chase state and four tracings of the same bands on a
path that runs again on every landed sample — the key going as far as cutting a
second lattice to get the one sentence it needed off each band. `GroundLines`
is that reading, made once and passed down, and `GroundLines.sentences()` is
the one wording the key and the aria label share. It is worth saying what the
second wording cost: the aria label built its sentences by hand and dropped
`wholly`, so the one reader who cannot look at the drawing and check was told
"hatched is measured ground meeting this standard's published threshold" over a
ground with no hatch anywhere on it. Two spellings of one mark is two things to
keep in step, and the one that fails is always the one nobody can see.

**What the harness covers that the page could not.** `climate.onebuilding.org`
is unreachable from the container this was built in (403 through the proxy), so
no weather file could be attached and only the design-day readings could be
driven: the three-line TEDI ground and the coincident collapse are proved in
the Node harness (214 assertions) rather than on the page. Everything else —
the line, the band, the label, the relief, the chase, the absences, the
coincident-contour suppression, gaps, IP/SI round-tripping and 390 px — was
driven in Chromium.

### Feedback reports and triage (src/report.js, src/report-sheet.js, .github/workflows/triage.yml)

A reader reports from the sheet, and the report carries what they were looking
at. The link and the build reproduce the desk exactly, so the report does not
ship the model; what it adds is what only the reader's machine saw: the engine's
severe and fatal lines, the status line and every refusal or blocking reason in
view, the browser and layout, the errors the page caught, and the last twenty
actions. Specification and research are in `specs/009-feedback-reports/`.

**The report leaves the machine at one press.** GitHub's prefill carries the
title and body in the new-issue address, so the tracker receives the text when
the tab opens, before the reader submits. The button says so where it is
pressed, and the page itself makes no request. That is the reading of
Principle I the spec recorded: sharing, like copying the scheme link.

Measured and documented limits the hand-off is built around:

- **No `labels=` in the address.** GitHub documents that the parameter needs
  permission to label and that without it the address answers 404. A reader is
  almost never a collaborator. Triage labels afterwards.
- **5,500 characters, trimmed from the oldest log line.** GitHub publishes no
  limit. Measured anonymously against `github.com/cli/cli/issues/new`: a
  redirect to sign-in up to about 6,050 characters, 500 at 7,051, 414 from
  9,051. The trim is stated in the body and the saved report file has every
  line.
- **Copied at the same press.** With the GitHub mobile app installed, a
  prefilled link opens with every field blank (acknowledged by GitHub staff,
  unfixed), so the phone path is one paste.
- **`window.open` without `noopener`.** With it, the call answers null whether
  or not the tab opened, and a blocked tab could not be told apart. The opener
  is cut at once instead.
- **Screen capture is desktop only.** `getDisplayMedia` exists in desktop
  Chrome, Edge, Firefox and Safari and in no mobile browser; the picture offer
  says so rather than failing on a press. `ImageCapture.grabFrame` is missing
  from Firefox, so one frame is drawn from a `<video>`.

**Why the sheet is its own module entry.** The engine and schema loads are
top-level awaits in `main.js`, and until this feature a failure there stopped the
module with nothing on the sheet but the last progress line. `report-sheet.js`
loads first from its own script tag, traps `error` and `unhandledrejection`, and
wires the Report button, so the report stands when the sheet does not. In the
production build Vite folds both entries into one chunk, and the trap's code
precedes the engine load in it. `main.js` hands the report its facts through a
registry at the very foot of the module: registered earlier, a report opened on
a boot that stopped half way would reach a `let` in its temporal dead zone. The
boot loads now carry a handler, attached as each promise is made so a rejection
is not recorded twice, that states the failure in the status line.

**The trail coalesces within four entries, not only back to back.** A drag with
auto-solve on is control, run, control, run; collapsing only consecutive
repeats left twenty entries of one slider.

**Triage is two steps, and the split is the security boundary.** The step that
reads the issue runs Claude through `anthropics/claude-code-action` with one
tool, `StructuredOutput`, a read-only `GITHUB_TOKEN` and a JSON schema; the idfkit-bot token is
minted after it ends, and `.github/scripts/triage-apply.cjs` checks every field
against the repository before labelling. Findings that shaped the workflow:

- **`--tools StructuredOutput`, and neither of the obvious spellings.** A JSON
  schema's verdict comes back through a tool the model calls, named
  `StructuredOutput`. `--disallowedTools "*"` denies it with everything else:
  the first live run (34634116301) made two refused calls, spent its three turns
  and ended `error_max_turns` with no verdict, so every issue fell to "needs a
  person". Reproduced locally on Claude Code 2.1.268, the version the action
  pins. `--tools ""` removes the built-ins and keeps `StructuredOutput`, but
  the action's argument parser treats an empty next argument as no value, so it
  arrives at the CLI as a bare flag. `--tools StructuredOutput` is not empty,
  starts the run with that one tool, and returns a verdict in two turns. The
  prompt also says so, since a small model left to itself answered in prose.
- **Six turns, because the action enforces the ceiling on a finished run.**
  With the tool in place, run 34635843699 came back `success` after four turns
  and the action failed it anyway, as "exceeding the configured maximum of 3".
  The same prompt took two turns locally; in the action each verdict the
  schema rejects is re-asked for, one turn apiece.
- **App tokens trigger further runs**, unlike `GITHUB_TOKEN`, and the action
  rejects bot actors. The job is gated on the sender not ending in `[bot]`, or
  idfkit-bot's own `enhancement` label would start the starter path on every
  feature request.
- **`steps.claude.outcome`, not the action's conclusion.** With
  `continue-on-error`, a failed step reports its conclusion as success; the
  apply step would have read a failure as a verdict.
- **Principle V's name contains `@idfkit`**, which would mention the
  organisation from a starter comment; model text and principle names are both
  escaped before posting.
- **`issues` events run the default branch's workflow**, so a change to triage
  is tested from its branch with `workflow_dispatch`. That needs the file on the
  default branch already: GitHub refuses to dispatch a workflow the default
  branch lacks, which is why the first version could only be tested after it
  merged.

The subscription token (`CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token`)
lasts a year and is tied to the maintainer who made it.

### Units, SI and IP (src/units.js)

The toggle is lettering and nothing else. Every value on `params` stays the SI
number the document holds, a frozen `Kind` says how it converts and how
precisely it reads, and conversion happens at the moment of lettering. Measured
on either side of a switch, the IDF at eight desk positions is byte-identical
and every link re-encodes to the same string.

**The factors are expressions of three constants, and two of them were wrong on
paper.** The contract had `transmittance` as `(FT² × 3600 × 1.8) / BTU`, which
is 0.571, and its reciprocal for `resistance`. The 1.8 divides rather than
multiplies: a watt is `3600/BTU` Btu/h, a square metre is `1/FT²` square feet
and a kelvin is 1.8 °F, so W/m²K is `(3600 × FT²)/(BTU × 1.8)` = 0.17611. The
wrong figure is three times the right one and still looks like a U-factor, which
is exactly the kind of error a harness of hand-checked anchors exists to catch.

**The SI string of a converting kind must equal the declaration's own**, and
that single assertion is the whole guarantee that the SI sheet comes back
character for character. It is also what surfaced every quantity lettered two
ways: TEDI over a year (`kWh/m²·yr`) against TEDI over one environment
(`kWh/m²`), outdoor air as `L/s·pp` rather than `L/s`, a swing as `°C` rather
than `K`. Each is a second kind with the same factor, not a relabelling.

**A change in a temperature is a difference.** `temperature` carries an offset;
a delta lettered through it takes Fahrenheit's 32 along, so a zone one degree
warmer than the baseline reads `+33.8 °F`. The schedules therefore declare a
`deltaKind` beside their `kind`, and a swing has a kind of its own. This is the
most plausible-looking wrong number the feature could have printed.

**Eleven steps were refined, each to a divisor of its old step.** At the old
0.5 m, one step of `ctxDistance` is 1.64 ft, so most whole feet could not be
reached at all and no choice of lettering could invent a position the grid does
not have. Measured over all eleven — 1,365 old stops walked through `onFace` on
the new grids — **every old stop is reproduced with zero drift**, so nothing
narrows, no `LINK_VERSION` bump is owed and `MIGRATIONS` stays empty. Refining a
step means refining its `digits` with it: `onFace` snaps to the step and then
rounds to the step's own decimals, so a face still ruled to whole metres on a
0.25 m grid would hold 40.25 and letter `40 m`, and the margin box could not
hand back what it was given.

**The two boundaries disagree, which is why no IP grid is stored.** `onFace`
hard-snaps every typed or dragged value to `min + n·step`; `decodeState` does
not snap, and `refuses` deliberately does not test step alignment for a scale.
So a link can carry `width=18.288` and hold it while the reader's next nudge
snaps it away. Storing IP stops would widen exactly that gap; deriving the
lettering from the one grid closes it.

**Every IP unit string is a single whitespace-free token**, because `copy.js`
counts whitespace tokens and throws at module load for the asserted budgets.
`Btu/h per person` would cost a strip line two words more than `W/pp` did and
throw the page in a module nobody would think to look in — so `Btu/h·pp`, and
`Δ°F` rather than `°F difference`. The rule is asserted on converting kinds
only: an identity kind letters the same string in both systems and so spends
exactly what it spent before, which is why `× floor` is allowed to stay two
words.

**An identity kind letters the declaration's own wording**, passed to `letter`
as a `unit` override and refused on anything that converts. That is what lets
one `count` kind serve TM59's nights, its share of occupied hours and a pane
count, without any of them composing a unit a converting figure could inherit.

**Refining a step forces refining its `digits`, and nine controls paid it.**
`onFace` snaps to `min + n·step` and then fixes the result to the step's own
decimals, so a face ruled to 0.25 m but lettered to zero decimals holds 40.25
and letters `40 m`. A reader who selects that box and types back what it says
gets 40. Nine of the eleven refined controls therefore took more SI decimals
with their finer step, and the visible consequence is that they letter `40.00 m`
where an older sheet lettered `40 m`. The grid stays a strict superset and no
link's value moves, so this costs nothing a reader can lose, but it is a change
to the SI sheet that no requirement asked for and it is written down here
because the specification said `step` was the only field that would move.

**A converted figure under a hand-typed unit is worse than an unconverted one.**
The generated paragraph letters its numbers through each control's own `figure`,
which converts, and six clauses then appended a literal `' °C'`, `' kW'` or
`' L/s per person'`. So a 21 °C setpoint read `69.8 °C`: not a stale figure a
reader might catch, but a right number under a wrong unit, in prose that is
always in view. Every unit word in those sentences now comes from `unitIn` of
the kind its figure converted through, which is the spelling the file's own
`fig` helper had used all along. One of them changed the SI sheet to fix it:
the outdoor-air clause spelled its unit `L/s per person` where the strip above
it has always read `L/s·pp`, and the assertion that a converting kind's SI
string equals its declaration's own is the entire guarantee that the SI sheet
comes back character for character, so the clause now letters the kind's string.

**One sentence can hold a measurement and a citation, and they letter
differently.** TM59 criterion a is read against an adaptive line recomputed
daily off the running mean, and the note under it reports both what the line
actually did over the days the run covered and what the method publishes as the
line's floor and ceiling. The first converts, being a reading; the second does
not, FR-010 keeping a published figure as published. The word "published" in
front of each clamp is what makes the pair readable rather than contradictory,
and it was already there for an unrelated reason. Converting the clamps would
state a floor in °F that no copy of the method contains.

**`reletterSheet` must never call `applyGeometry`.** That is where studies in
flight are cancelled against their rest shape, so a reader who switched units
mid-sweep would lose every sample. The switch re-letters from state already in
hand, including the finding paragraph, which is held as a **record** of what it
letters rather than as the closure that drew it: a closure keeps its whole
enclosing scope alive, and that scope holds the run's IDF text, the entire EPW
file and the parsed ESO, so the previous run's megabytes stayed pinned under the
next one to re-letter eight numbers.

**A hand-written list of what to re-letter cannot say when it is incomplete**,
and this one was: it reached the console, the drawings, the schedules, the bill
and the register, and missed E-02 entirely — the relief's standing axis, the
plan's contour labels and the spot figures, every one of them a surface
`Reading.figure` and `Reading.unitNow` were added for. It also missed the study
cards, which are lettered when `setStudy` builds them and whose identity guard
deliberately makes re-issuing the same study a no-op; that needs
`relettering: true` to get past. Both are fixed, and a registry that made the
omission throw rather than go quiet is the deeper change still owed.

**What still does not re-letter: a stored label.** `shapeLabel` is called at
draw time by the traverse buttons, which convert correctly, and is *frozen into*
seven long-lived objects at creation — study jobs, the bill's pin, the schedule
baseline. A study card's desk line is one of those, so it letters in whichever
system the sweep was taken in and then keeps it. Making those convert means
storing the `params` and lettering at draw time across all seven sites and their
readers.

**A span is not a value, and the ranking walked straight into it.** E-02's "Room
left" column letters `control.max - here`, a subtraction along a face. Lettered
through the control's own `quantityKind` a setpoint's five degrees of room came
out as `41 °F` — `5 × 1.8 + 32` — which is the offset trap `temperatureDifference`
was split out for, arriving by a second route a year later. `deltaKindOf` is now
the one place that rule lives: it maps `temperature` to `temperatureSwing` and
every other kind to itself, and `Ruled.spanKind` is the face asking it. It maps
to `temperatureSwing` rather than `temperatureDifference` because a span of a
Celsius face has always been lettered `°C`, and `K` would be a new string
standing where the old one stood. The column also keeps a flat two decimals in
both systems rather than taking the control's IP precision: reachability is an
argument about positions on a grid, and applied to a span it rounded half a
degree of room from `0.9` to `1`.

**And a change in a reading is the third route into it.** E-02's trade sentence
letters `value - base` for each of the two readings a ground is cut for, and it
asked `Reading.format`, which letters a *value*. Measured on the page: a ground
surveyed for high and low read "+39 °F of high against +33 °F of low" for
changes of about +4 °C and +0.5 °C, the Fahrenheit offset riding a difference
for the third time after the ranking's "Room left" and the Effect column.
`Reading.change` is the named sibling that letters a difference, rather than a
kind swapped inline at the call site, which is how the first two came back. It
asks `deltaKindOf` of every reading and not only of the temperatures, because
that function returns a zero-offset kind unchanged, so a kBtu/ft² change letters
exactly as it did. Of the six callers of `Reading.format`, exactly one passes a
difference, which is why the fix is a second method rather than a change to the
first.

**A cache whose key cannot see the unit system is a stored label with extra
steps.** `renderSurveyChoose` redraws only when the selection or the desk has
moved, and its Reading cell letters each offer's `unitNow`. A sheet that booted
in IP therefore offered `High °F` and went on offering it after a switch to SI,
because neither the selection nor the desk had changed. `tm59Notes` had the same
hole the moment criterion a's note began converting its measured line. Both keys
now carry `system()`. The chooser also needed a call site: `renderSurvey` does
not reach it, so `reletterSheet` asks for it directly.

**A hidden tab starves `requestAnimationFrame`, and that is indistinguishable
from a lettering bug until you check.** `renderSurveySoon` sets a frame flag and
clears it only inside the callback, so in a background tab the flag stays set
and every later call returns early. Driving the page from a tab that was not
visible produced three convincing false positives in a row: the plan caption,
the reading sub-line and the spot readout all "failed to re-letter", the survey
froze at exactly its coarse-pass boundary, and one evaluate timed out after 45
seconds. All of it was one starved rAF. `document.visibilityState` is the first
thing to read when a figure looks stale, and forcing a paint restores the lot.

**The one lettering that never converted at all was the one nobody can see.**
Every Study button's accessible name letters the control's own range — "sweep
from 10.0 °C to 26.0 °C" — and `studyOffer` set it once at build time and never
again. Measured on the page, it stayed in SI across a switch while the face
beside it read 68 °F, and it stayed that way for the life of the session.
`sync()` does not reach these labels because nothing about them depends on the
desk's state; they had no reason to be re-read until units gave them one. This is
worse than a stale visible figure rather than better: for a reader who cannot see
the face, the label is not a second copy of the reading, it **is** the reading.
The fix keeps a thunk per key rather than a string, because the two callers name
their subject differently — a scale passes `control.label`, one wall of a plan
key passes `labelFor(side.key)` — and only the closure still knows which.

**A converted figure can round away the very thing the sentence is about.**
`tooShallow` quotes an overhang against the engine's 0.01 m merge tolerance, and
lettered to the overhang face's own IP precision — one decimal of a foot — a
0.01 m projection reads `0.0 ft`. The sentence then claims a zero-depth overhang
would be deleted, which is nonsense, and loses the one figure the reader is there
to compare against the tolerance. It letters in inches (`lengthSmall`) for that
reason: this sentence only ever fires at or under the tolerance, so inches is the
scale it is always read at. `COINCIDENT` itself keeps its metres in both systems,
being the engine's own constant rather than the reader's measurement — the same
split `frameCloses` makes between the opening it quotes and the frame that closed
it.

**Converting a head without its cells is worse than converting neither.** The
bill's intensity row divides by floor area, and its three columns are identity
kinds on purpose: kWh at the meter, the tariff's own currency, kgCO₂e. Lettering
the head through `unitIn(KINDS.area)` made it read `Per ft² of floor, per year`
over 40.7, 1.42 and 8.4 — the identical figures the `Per m²` row had shown,
because `bill.intensity` divides by `floorArea` in square metres and no column
kind could touch that. The head then contradicted every cell under it in the one
direction that still looks like a plausible reading, and a US reader would have
taken a per-square-metre intensity for a per-square-foot one, low by a factor of
eleven. What converts here is the **denominator**: `v / convert(KINDS.area, 1)`,
which is exactly 1 in SI, giving 3.8 kBtu-equivalent per ft², $0.13 and 0.8.
Measured on the page, the ratios come back 10.711 and 10.923 against the exact
10.764, the spread being the display rounding of 3.78 and 0.132.

**A getter that restates a composition rule will drift from it.** `unitNow` was
written as `unitIn(kind, unit)` — the kind's unit string — while `letter`
composes a figure as prefix, number, suffix. For the one prefixed kind on the
roster they disagree: `resistance` letters `R-29.0` in IP and carries nothing
after the number, so `stopOf` stripped nothing and a survey axis offered to head
a column of `R-29.0` stops with `h·ft²·°F/Btu`, naming the unit twice for the one
quantity that already names itself. The fix is not a second test but a shared
one: `prefixIn` and `suffixIn` are the two halves, `letter` is composed from
them, and `unitNow` is `suffixIn`. The harness walks all 87 faces in both systems
asserting `format(v).endsWith(unitNow)`, which is what caught it — the SI walk
passed, because in SI the prefix does not apply and the two agreed by accident.

**One arrangement written in two places drifts in both.** A survey axis letters
its unit once on the axis name and leaves every stop bare — `stopOf` strips it
off the stop, `axisTitle` prints it on the name. The two halves sit a thousand
lines apart, and fixing only `stopOf` left the plan drawing headed `Width · m`
over stops reading 13.1 to 131.2 ft: the same defect, surviving one label along.
A sweep of every remaining `.unit` read found four more of that shape, in rising
order of harm: `amountOn`, an unconverted number under an SI unit; `within`, a
tolerance — which is a *difference* of the reading and so needs the delta kind,
or a hundredth of a degree letters as 32; and `formatEffect`, the worst the
feature can produce. The pull ranking's Effect column is a change in the reading
per unit of the control's own travel, so **both** halves convert and neither
did: the printed figure was not mislabelled but wrong, by whatever `kR / kC`
happens to be, and still entirely plausible. `relief.js`, `schemes.js` and
`study.js` came back clean — their `.unit` reads are declarations, or the
sanctioned identity-kind wording override that `letter` takes.

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
- **A DDY can carry `N` where a number belongs, and nothing upstream catches
  it.** onebuilding writes the literal text `N` into a numeric field for a
  station with no record to publish there. `parseIdf` carries it through as the
  string `"N"` under `strict: true` exactly as under `strict: false`, and the
  document parses clean, so the engine is the first thing to object and by then
  the run is dead: `Value type "string" for input "N" not permitted by 'type'
  constraint`, twice, then `Fatal: Errors occurred on processing input file`.
  `designConditionsFrom` therefore checks every field the *schema* types
  numeric (`schema.field(type, name).t === 'n'`) before accepting a design day.
  Read it off the schema, never from a hand-written field list, or it goes
  stale the next time EnergyPlus adds a field.

- **Most stations do not publish the design day this sheet asks for, and the
  old fallback was load-bearing.** Surveyed over 120 sites: `Ann Clg 1% Condns
  DB=>MWB` is published for **69**, while `Ann Htg 99% Condns DB` is published
  for all 120. onebuilding omits the whole `DB=>MWB`, `WB=>MDB` and `Enth=>MDB`
  families where a station has no wetbulb record, leaving only the `DP=>MDB`
  trio. So requiring the named day outright would refuse 51 sites in 120, 39 of
  them working perfectly. `DESIGN_DAYS` in `src/model.js` is the answer: an
  ordered list of acceptable annual days at a **fixed severity** (1% and 99%),
  varying only the humidity basis, since the basis is what the publisher omits
  and the severity is what a reader would notice changing.

- **A monthly design day is never an annual sizing condition.** A DDY lists
  twelve monthly days after its annual ones, and they are typed
  `SummerDesignDay` like any other. Selecting by `day_type` therefore reaches
  them: station 994971 (Boston) publishes no annual cooling day at all, and the
  old reader sized a New England summer against 16.6 °C on 21 January. There is
  no field distinguishing annual from monthly, so the only signal is that
  onebuilding writes `Ann Htg` / `Ann Clg` into the name. That is safe only
  because every archive the picker can reach comes from onebuilding.
  `readDesignDays` throws at module load on a month name in a candidate.

- **The plate must letter the design day it got, not the season.**
  `designDayDatums` hard-coded `1% clg db` for any non-winter day. With more
  than one acceptable cooling day that is a claim about an object the document
  may not hold, and it was already wrong for 39 sites in 120 that were sized on
  a `.4%` dewpoint day under a `1%` dry-bulb label.

- **Field names drift between EnergyPlus versions.** `Lights` and
  `ElectricEquipment` use `watts_per_floor_area`, not
  `watts_per_zone_floor_area`. In 26.1 transmitted solar is
  `Enclosure Windows Total Transmitted Solar Radiation Rate`, not the older
  `Zone Windows …`. Check with `describe_object_type` or the `.rdd` rather than
  from memory.
- **A thermostat's control type number and its `Control 1` object are one
  statement.** `ZoneControl:Thermostat` resolves the schedule value to a
  thermostat *type* — 1 `SingleHeating`, 2 `SingleCooling`, 4 `DualSetpoint` —
  and then looks for a control of that type in its own list. A 1 standing over a
  `ThermostatSetpoint:DualSetpoint` is not a dual setpoint with its cooling half
  suppressed, it is a control of a type the zone does not have, and it is a
  get-input fatal (`..specifies 1 (ThermostatSetpoint:SingleHeating) as the
  control type. Not valid for this zone.`) that takes the run down before any
  environment starts, whatever the weather. So `applySystem` picks the number
  and the object together, and clears all three setpoint types on every apply.
- **A heating setpoint above the cooling one is a warmup fatal, and the two
  faces overlap.** `heatSet` runs 10 to 26 °C and `coolSet` 18 to 34, so the
  sliders can pass each other, and the dual thermostat then stops the run with
  `DualSetPointWithDeadBand: Effective heating set-point higher than effective
  cooling set-point`. It took about one design in ten of an 800-point Latin
  hypercube over the System-in desk. The System channel's `requires` blocks,
  with one constant sentence rather than the two setpoints read back — both
  faces are on the strip a thumb apart, and a function of the parameters cannot
  be held to the `STANDING` copy budget at load, which made the longest
  always-visible sentence on the desk the one nothing counted. Neither slider is
  clamped to the other.
  The engine's test is strict and the gate matches it: equal setpoints run with
  the default desk's warning count, 0.5 K crossed fatals. It does not fire at
  "Heat only" or "Cool only", where one setpoint reaches no object, and a link
  carrying a crossed pair decodes to the blocked desk rather than being refused,
  because the desk can reach it. A study sweeping either setpoint past the
  other **refuses** those positions rather than solving them with System out:
  `sampleRefusal` in `model.js` refuses any sample where a swept control takes
  its *own* channel out of the path, so a curve never joins a conditioned zone
  to a free-running one. Another channel going out under the overlay (Blinds
  losing its window as a wall's ratio reaches zero) is still a position and
  still runs. A refused position is never built or cached, draws as a gap, and
  the card says which sentence refused it.
  - **It is asked of every swept key, which is `job.omits` and not `job.key`.**
    A study sweeps one control and a survey row sweeps two — its own axis along
    the row, and the other axis fixed into the snapshot that made the row — and
    both have to be asked, so `sampleRefusal` takes one channel id or several,
    the same shape and for the same reason `deskKey`'s `omit` does. Asked only
    about the row's own axis, a ground cut across the heating setpoint would
    refuse nothing and draw every row above the cooling setpoint as the
    free-running building: eighty-one designs of which a band is a different
    model, arriving by the one route that does not look like a study.
  - **A refused position is not a failed run, at all three surfaces that land
    one.** The scheduler keeps `refused` apart from a reading it never got,
    because a failure is the engine's and says nothing about the design where a
    refusal is a fact about the design and has a sentence for it. So
    `absorbSurveyRow` passes that sentence to `landPoint` rather than letting it
    fall back to "The run did not complete" over a position no run was started
    for, and a refused pull probe is an **inert** entry under the refusal rather
    than an unmeasured one — a step that takes its own channel out would
    otherwise measure the channel leaving instead of the control moving, which
    is the largest effect on the board and about nothing.
- **An economizer requires a cooling flow limit**, or EnergyPlus raises a severe
  error. Nothing here is autosized, so the limit is computed from zone volume.
- **A shading device cannot be hung on `WindowMaterial:SimpleGlazingSystem`**,
  which is why the Blinds channel requires the layered glazing model.
- **EnergyPlus merges two vertices closer than 0.01 m and deletes the surface
  left behind.** `** Severe ** GetSurfaceData: There are 2 degenerate
  surfaces`, then a completed run, so the only symptom is a shade in the
  document the engine never simulated. The first stop off zero on the fin, the
  overhang and the curb is exactly 0.01 m. An edge of exactly 0.01 survives,
  so a 1 cm fin is kept on a building squared to the compass and deleted at
  45°, where a rotation hands back 0.00999…. A 1 cm curb is deleted on every
  bearing, since its edge is the difference of two heights. `COINCIDENT` and
  `builds()` in `src/aperture.js` are the one statement of it: the appliers
  write no shade that does not build, the fin and curb controls go idle on it,
  and the Shading key's wall says why. Linear rooflights can come out thinner
  than this at the Skylights strip's first stop, and that channel's `requires`
  refuses them; see "Skylights (channel 04)" above.
- **A contour interval must be one the numbers can actually step by.**
  `levelsFor` in `src/survey.js` picks a 1-2-5 interval off the measured extent
  at about a span-eighth. Where the span is a few ULPs of the readings
  themselves the interval lands *below* their spacing, `v += step` hands back
  `v`, and the loop fills its array until `push` throws `RangeError: Invalid
  array length` — inside `drawGround`, so the whole ground leaves the sheet.
  Measured: two readings of 20 °C one ULP apart span 3.55e-15, an eighth of
  which is 4.44e-16, so the interval is 5e-16 against a spacing of 3.55e-15 and
  `20 + 5e-16` is exactly 20. That is not a contrived input — a design-day zone
  temperature high comes back bit-identical across most of a ground and differs
  in the last bit at one or two positions, which is precisely a control that
  does not move its reading. It returns `[]` now, as it already did for an
  exactly flat ground and for one with nothing measured: a span of a few ULPs
  is a reading that did not move and has no relief to contour, and the spot
  heights still stand. Any future interval chosen off a measured range owes the
  same check, and the honest form of it is whether the step advances the
  cursor — not a magic floor on the span.
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
- **The occupancy schedule is never zero, so `> 0` is not "occupied".**
  `bandSchedule` writes `0.1` out of hours, for every hour outside the band, for
  a whole weekend day at `weekend: 'Unoccupied'` and for a holiday at
  `holidayUse: 'Closed'`. Any reader taking a denominator off that series has to
  test against the floor the applier actually wrote, which `model.js` answers
  with `occupiedFloor(params)`. Measured over a Chicago TMY3 year, 1 May to
  30 September: `> 0` counts 3672 hours, which is every hour of all 153 days,
  where `> 0.1` counts 1100. The full argument, including why 3672 is a
  published figure and therefore the worst possible wrong answer, is under
  "Overheating to CIBSE TM59" above.

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

**Copy budgets and folds.** The sheet used to print every explanation it had,
always: about 2,700 words of prose on the first screen and 2,300 more with the
console open. What stays in view now is the reading, its verdict or absence,
and at most one short line; the method, the derivation and the citation sit in
a fold (`fold()` in `console.js`, one `.fold` rule in `index.html`, the pattern
in `.interface-design/system.md`) attached to what it explains. Two rules keep
it that way. Readings, verdicts, absence reasons, blocking reasons and refusals
never go in a fold. And every always-visible string a declaration carries (a
channel's `line`, a `requires.reason`, a general note's `step`, a fold's
summary) is asserted at load against its budget in `src/copy.js`, so a line
that grows past twelve words stops the page naming itself. Text composed at
render time from the run is measured rather than asserted, because a throw
mid-render would turn a copy defect into a broken sheet. New long text goes in
the declaration's folded field (`blurb`, `note`, `body`), not in its glance.

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
stays vite and nothing else). `.github/workflows/deploy.yml` assumes a role by
GitHub OIDC and runs `npm run deploy`. No AWS key is stored.

**Only a tag publishes the site itself.** The address `shoebox.idfkit.com` is a
released issue of the drawing and nothing else, for the same reason the title
block carries a revision at all: a reading is only worth arguing with when you
know which issue produced it, and `main` is pushed to far more often than it is
tagged. So a `v*` tag publishes the root, and every other push to `main`
publishes the **development channel** at `shoebox.idfkit.com/dev/`. Opening a
pull request publishes a **preview** at `shoebox.idfkit.com/<number>/`
(`.github/workflows/preview.yml`), and closing it takes that preview down again.
Nothing else about the three runs differs.

- **A channel is the same bucket and the same distribution**, one directory in.
  A separate host would leave the two things that actually break a deployment of
  this page untested: the `/onebuilding` weather origin and the pre-compressed
  engine both exist only at the edge. A release is therefore the same artefact
  that has been served under `/dev/` since it was merged, moved to the root.
- **A channel build carries its base**: `npm run build -- --base=/dev/`, or
  `/42/`. `src/main.js` and `src/weather.js` resolve the engine, the schema
  bundle and the station index against `import.meta.env.BASE_URL` for this
  reason. Written as `/energyplus`, a channel would load the published release's
  staged assets and report on those. `/onebuilding` is the exception and stays
  root-absolute — it is a distribution behavior, not a file this site publishes.
- **The top-level names `dev` and any directory of digits are reserved.**
  `scripts/deploy.mjs` declares that shape once, as `CHANNEL`, and builds three
  rules from it: a release spares keys matching it when it prunes, a channel run
  never lists or deletes outside its own prefix, and a release refuses outright
  to publish a build that writes into the namespace. Without the first, the next
  tag would delete `/dev` and every open pull request's preview.
- **`/dev`, `/dev/`, `/42` and `/42/` reach a channel through a CloudFront
  function.** `defaultRootObject` covers exactly one path, `/`, so a subdirectory
  index has to be appended by hand; the bare `/dev` is redirected rather than
  rewritten. The pattern is interpolated from the stack's own `CHANNEL` regex,
  because a channel served at a path the deploy script does not consider
  reserved would be pruned by the next release, hours later and nowhere near
  either file.
- **A tag ref is not a branch ref, and the deploy role has to say so.** GitHub's
  OIDC subject carries `ref:refs/tags/v0.2.0` for a release, which the branch
  subject does not cover, so `RELEASE_TAGS` in `infra/lib/shoebox-stack.ts` adds
  a third trusted pattern and the condition operator becomes `StringLike` (IAM
  will not mix operators over one key; the two wildcard-free patterns match
  exactly under it, so nothing is widened). It has to agree with the `tags:`
  filter in `deploy.yml`, or a release fails at the credentials step naming
  neither file. This does not widen who may deploy: pushing a tag here already
  takes the write access that pushing to `main` takes.
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
- **The sheet stamps its own revision, and the sha is the common case.** The
  title block's Sheet cell reads `E-01 · Rev 0.2.0` on a tagged build and
  `E-01 · Rev 0.2.0+cd5881e` on everything else, because this page is published
  from `main` far more often than it is tagged and a reading is only worth
  arguing with when you know which issue of the drawing produced it. The address
  now says the same thing the stamp does: a `+sha` build is served under `/dev/`
  and a bare version at the root.
  `scripts/revision.mjs` resolves it — `git describe --tags --exact-match` for
  the tag, `package.json` plus the short sha as semver build metadata otherwise
  — and `vite.config.js` freezes the result in as `__SHEET_REVISION__`; a page
  served as static files from a bucket cannot ask what produced it, so the
  answer has to be baked in where it is produced. `src/version.js` is the only
  module that reads that name, guarded with `typeof` so the throwaway Node
  harnesses can still import anything under `src/`.
  - **A missing sha means "tagged", so a build that could not read its own
    revision must not look like one**: it stamps `+unknown` rather than
    dropping the metadata.
  - **Both workflows check out with `fetch-tags: true`.** The checkout is
    shallow and carries no tags otherwise, so a release would stamp itself with
    a sha — the one build that is supposed not to.
  - **The preview passes `SHOEBOX_SHA`**, for the same reason its comment
    slices `pull_request.head.sha`: a `pull_request` checkout is the merge
    commit, which is in nobody's branch.
  - The date beside it is the revision's, off the commit, not `new Date()` in
    the reader's browser — which is what it used to be, and which dated the
    drawing by whoever picked it up.

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
