# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev       # predev stages ~50 MB of engine assets, schemas and the station index
npm run build     # prebuild does the same staging
npm run preview
npm run deploy    # compresses dist/ and publishes it; needs a built dist/ and AWS credentials
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
`Scale`, `Selector`, `Arm`, `Bearing`, `Facade` (four walls on one plan key) or
`Profile` (a 24 hour band), attached to a `Channel`. The console draws it, the
model applies it, and the sheet's five dimension sliders look their specs up by
key from the same place, so the two surfaces cannot drift.

**To add a control:** declare it in `controls.js`, then write the field in that
channel's applier in `model.js`. Do not add markup, defaults, or label strings
anywhere else. `DEFAULT_PARAMETERS` is derived from the declaration.

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
- **`syncOutputs`** adds and removes `Output:Variable` objects to match the
  engaged channels. Without this, EnergyPlus lists every unproducible variable at
  the end of the error file and inflates the warning count the title block
  reports.
- **`must(doc, type, name)`** throws when an expected object is missing instead
  of quietly re-adding it. See "No silent fallbacks" below.

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
  is sectioned and the per-m² intensity is of the building alone.
- **Per-m² is only drawn on an annual run.** Every published benchmark is annual,
  and 0.3 kgCO₂e/m² over two design days has no use but to be mistaken for one.
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

`@idfkit/engine` rejects a second `run()` while one is in flight, so every solve
goes through one `pump()` loop and it is latest-wins: whatever the controls show
when the engine comes free is what gets solved, and shapes the drag passed
through are skipped rather than queued.

`shapeKey` is `JSON.stringify([params, patching()])` minus `PRICED_KEYS`.
**Anything that reaches the IDF must live on `params`**, or it will move the
drawing and never be simulated — and anything on `params` that does *not* reach
the IDF must be declared on a `prices: true` channel, or it will start runs that
change nothing.

Auto-solve has two cadences: a design day (48 h, ~50 ms) re-solves continuously
during a drag; a weather file (8,760 h, ~0.7 s) re-solves once on release.

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
