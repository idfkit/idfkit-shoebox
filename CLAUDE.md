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
- The title block stamps its revision (`scripts/revision.mjs` →
  `__SHEET_REVISION__`, read only by `src/version.js`): bare version on a tag,
  `+sha` otherwise, `+unknown` if unreadable. Workflows check out with
  `fetch-tags: true`.
- `scripts/deploy.mjs` pre-compresses (brotli q9 above 4 MiB, q11 below); `.gz`
  files never carry `Content-Encoding`. The bucket is `RETAIN`. Pass
  `-c createOidcProvider=false` in an account that already has the provider.
