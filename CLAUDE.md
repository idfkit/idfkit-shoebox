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
     +--> field.js   the editable number both of those surfaces letter a value with
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

**To add a landmark** — the named cases a scale is read against — declare it in
the `LANDMARKS` section of `controls.js` and hang it on the control with
`landmarks:`. Nothing else is needed: `console.js` rules it under the
calibration face, the plan key rules it along each wall's bar, and the sheet's
own sliders read the same declaration. See "Landmarks" below for the rules a
declaration has to meet, all of which throw at module load.

**To add a control *kind*** — rarer, and it has two gates that fail in opposite
directions. `console.js`'s `buildControl` throws for a kind it cannot draw, so
the desk fails loudly at mount. `permalink.js`'s `readValue` is the quieter one:
its numeric regex runs *before* the per-kind switch, so a branch added inside
the switch is unreachable and every link carrying that key is refused as "not a
number". A non-numeric kind is taught above the regex, beside `selector`.

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
  the grid in `skylightsOn` — because a literal repeated in two places is how a
  later widening of the slider becomes a silent clamp and a sweep one square
  short.
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
  three, so the moves are ranked by how far each sits from its own default —
  the same identity diff `encodeState` takes to decide what a permalink must
  carry, for the same reason: what the reader changed is what the reader
  designed. `moved()` scores a scalar by its own travel (`Control.fraction`),
  and the `FLIP` table scores a channel being patched in or out **above
  anything a slider can reach**. That table is not decoration: a pane
  emissivity taken the whole way across its range scores 1.00, and before the
  flips outranked it the paragraph described the glass of a building whose
  ideal unit it never mentioned.
- **Ranking chooses; declaration order reads.** `READING_ORDER` re-sorts the
  three that won, because "which three" and "in what order" are different
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
- **Bump the storage key** (`shoebox-general-notes-v2`) whenever the steps
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

### The index sheet (narrow screens)

Below the `780px` breakpoint the desk stops being a column beside the drawing and
becomes a page of its own, where eighteen strips end to end is about ten screens
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
- **The sheet stamps its own revision, and the sha is the common case.** The
  title block's Sheet cell reads `E-01 · Rev 0.2.0` on a tagged build and
  `E-01 · Rev 0.2.0+cd5881e` on everything else, because this page is published
  from `main` far more often than it is tagged and a reading is only worth
  arguing with when you know which issue of the drawing produced it.
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
