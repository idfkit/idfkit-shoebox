# idfkit-shoebox

Live at **[shoebox.idfkit.com](https://shoebox.idfkit.com)**.

The smallest possible showcase of EnergyPlus running in the browser via
`@idfkit/engine` and `@idfkit/engine-assets`. One page, no button needed: it
runs the stock `1ZoneUncontrolled.idf` example (EnergyPlus 26.1.0) as a
design-day simulation entirely client-side, re-solving as you drag the sliders,
in about 50 ms a time. Pick a weather location to switch to an annual run.

The page is laid out as a drawing sheet rather than a dashboard, because the
audience is architects. It plots zone mean air temperature against outdoor
drybulb with both design-day conditions drawn as datum lines, projects the
model's own `BuildingSurface:Detailed` vertices into an axonometric tinted by
the zone's mean result, and reports damping and thermal lag per environment —
the winter and summer design days are separate weather stories and are never
averaged together.

## Run it

```bash
npm install
npm run dev
```

The `predev` script copies ~50 MB of engine assets (WASM binary, IDD, datasets)
from `@idfkit/engine-assets` into `public/energyplus/`, which is gitignored.

First load downloads and compiles the ~28 MB binary; after that it is cached.

## Deploying

> [!NOTE]  
> Curious users are not expected to take action with anything with this section.
> It is there so that I can remember how I deployed this thing in the future
> when I will eventually have forgotten!

The site is an S3 bucket behind CloudFront at `shoebox.idfkit.com`, defined as a
CDK app in `infra/`. Pushing to `main` publishes it: the workflow in
`.github/workflows/deploy.yml` mints a short-lived OIDC token, trades it for the
deploy role, and runs `npm run deploy`. There is no AWS key stored in the repo.

Everything lives in the idfkit AWS account, which is also where the `idfkit.com`
hosted zone lives, so the stack looks the zone up rather than being told about
it. Set the profile and the CDK CLI fills the account in.

```bash
cd infra && npm install
AWS_PROFILE=idfkit npx cdk deploy   # once, to provision
npm run build && npm run deploy     # to publish by hand
```

After the first `cdk deploy`, set the repository variable
`AWS_DEPLOY_ROLE_ARN` to the stack's `DeployRoleArn` output, which is what the
workflow assumes. The role trusts one repository on one branch, so a pull
request from a fork cannot reach the bucket.

Three things about this arrangement are load-bearing, and each cost real
measurement to find:

- **CloudFront compresses only between 1 KB and 10 MB**, and only for content
  types on its own list. The engine binary (28.40 MiB) and the schema
  (9.88 MiB) are both above that ceiling, and S3 serves `.idd` as
  `application/octet-stream`, which is not on the list. Left to the edge, a cold
  visit transfers about 45 MB. `scripts/deploy.mjs` compresses everything itself
  and uploads it with `Content-Encoding: br`, which brings that to about 10 MB.
- **Brotli quality is chosen by file size.** On the engine binary, q9 took 3.0 s
  for 6.23 MiB and q11 took 62.0 s for 5.30 MiB. A minute per deploy is not
  worth 0.93 MiB on a file the browser caches after first visit, so anything
  over 4 MiB is compressed at q9 and everything else at q11.
- **`.gz` files ship exactly as stored.** `stations.json.gz` and the schema
  bundle are inflated by the page itself. Declaring `Content-Encoding: gzip`
  would have the browser inflate them first and hand the loader JSON where it
  expects a gzip member.

Cloudflare Pages was the first choice and cannot host this: its hard limit is
25 MiB for a single asset, and `energyplus.js-26.1.wasm` is 28.40 MiB. GitHub
Pages, which serves `idfkit.com`, cannot rewrite `/onebuilding` to the upstream
and would leave the weather picker dead.

## Files

- `src/model.js`: authors the model with `@idfkit/core` and reads it back
- `src/main.js`: loads the engine and schema, runs the model, reads the ESO, and
  draws the axonometric, the trace and the results schedule
- `src/weather.js`: the site picker's data layer over `@idfkit/weather`
- `index.html`: the sheet — tokens, run ledger, plate, schedule, title block
- `scripts/copy-schemas.mjs`: stages the schema bundle into `public/schemas/`
- `scripts/stage-weather.mjs`: stages the station index into `public/weather/`
- `scripts/deploy.mjs`: compresses `dist/` and publishes it to the bucket
- `infra/`: the CDK app for `shoebox.idfkit.com`, installed separately

## Picking a weather location

The picker replaces the old drop-an-EPW target. It searches the
climate.onebuilding.org TMYx index through
[`@idfkit/weather`](https://www.npmjs.com/package/@idfkit/weather), downloads the
station's archive, unpacks the EPW in the browser, and hands the text straight to
`ep.run({ idf, epw })` — the same path a dropped file took, with no server in it.

Three things about that index are worth knowing:

- It is 1.7 MB gzipped and inflates to 69,638 records, so it is fetched lazily,
  on the first keystroke in the picker, and kept for the session.
- Those records cover 17,292 distinct sites, because onebuilding publishes each
  one as a bare `_TMYx` plus up to four explicit 15-year windows. These are not
  duplicates and they disagree — Boston-Logan's five run from 2,840 to 3,083
  HDD18, a 9% spread — so the picker groups them under the site and asks which
  one you want, listing the degree days that separate them. Searching gives you
  places; choosing a place gives you its files.
- Each record carries its ASHRAE climate zone and design conditions, which is
  what letters the picker itself: the zone chip, the description, the degree
  days that separate one window from another.

### Taking the design conditions with the year

Choosing a station swaps the whole climate, not just the 8,760 hours. The
archive holds a DDY beside the EPW, so `fetchWeatherFiles` returns both from the
one request, and the model takes its `Site:Location` and its two
`SizingPeriod:DesignDay` objects from that DDY: the 99% heating drybulb and the
1% cooling drybulb at mean coincident wetbulb, which is the pair the stock
Denver file uses and the pair the plate draws as datum lines.

Leaving Denver's in place was not merely untidy. EnergyPlus simulated them
inside every annual run, which is why the schedule showed a Denver winter design
day beside a Montreal year and the run reported 8,808 hours rather than 8,760,
and it said so:

```
** Warning ** Weather file location will be used rather than entered (IDF) Location object.
**   ~~~   ** ..due to location differences, Latitude difference=[5.73] degrees, ...
**   ~~~   ** ..Elevation difference=[98.03] percent, [1793.00] meters.
** Warning ** SetUpDesignDay: Entered DesignDay Barometric Pressure=81198 differs by
              more than 10% from Standard Barometric Pressure=100893.
```

With the DDY in, Montreal's design days run at Montreal's pressure and those
three warnings are gone. The winter column moves from 21 December to 21 January
and its datum from −15.5 °C to −19.5 °C, both read back off the model rather
than off the index, so the drawing and the engine cannot disagree about where
the building is.

A station whose archive carries no DDY, or whose DDY names neither of the two
days, is refused whole: the picker hands the field back and says why, and no EPW
is attached. There is deliberately no fallback. Keeping the previous city's
design days under the new city's name is the exact mismatch this path exists to
remove, and a sheet that did it quietly would be wrong in the one way nobody
would catch.

### The proxy

climate.onebuilding.org serves no `Access-Control-Allow-Origin` header, so a page
cannot fetch the archives directly. `@idfkit/weather` takes a `rewriteUrl` hook
for this; `vite.config.js` supplies the other end as a dev-server proxy at
`/onebuilding`, which covers `npm run dev` and `npm run preview`.

A static deployment has no dev server and needs the same rewrite from its host.
In production that is a second CloudFront origin plus a viewer-request function
that strips the prefix, which is what `infra/` provisions; see [Deploying](#deploying).
To point at a proxy origin instead, set `VITE_WEATHER_PROXY`: a path prefix
(`/onebuilding`) replaces the upstream origin, and a value ending in `=`
(`https://corsproxy.io/?url=`) receives the whole URL percent-encoded.

Be warned that the free public CORS proxies are not a working option here. Of the
seven tried in August 2026, allorigins and codetabs both timed out against
climate.onebuilding.org (HTTP 522 after ~19 s) while proxying other hosts fine,
corsproxy.io and corsfix now return 403 without a paid plan, `test.cors.workers.dev`
rate-limited, and `cors.eu.org`, `thingproxy` and `whateverorigin` are dead. Plan
on a proxy you control.

## Sharing a scheme

The address bar carries the desk. Every control off its default, the patch
state and the attached station are written into the URL fragment on each
gesture release, so the address is always a link to exactly what is on the
sheet:

```
https://shoebox.idfkit.com/#v1&width=20&wwrS=0.35&heatSet=21&in=system&stn=725650&win=2007-2021
```

**Copy scheme link** in the run ledger puts it on the clipboard; opening it
rebuilds the desk and solves it fresh. The fragment stays readable on purpose —
`wwrS=0.35` in an address says what the argument is about — and it is
delta-encoded, so a near-default scheme is a short link and the default desk is
the bare address. The station is named by WMO number and TMYx window, because
onebuilding publishes each site under several 15-year samples that disagree by
up to 9 % on degree days, and a link has to reproduce the year that was argued
over, not a sibling of it.

The leading `v1` pins what an omitted key meant when the link was minted.
Adding a control never breaks an old link — the new key just takes its
default — while renaming one or changing a default requires a version bump and
a migration step in `src/permalink.js`. A link that cannot be honoured — an
unknown key, a value out of range, a station whose archive or DDY cannot be
fetched — is refused whole, with the reason in the status line and the sheet at
its defaults, rather than half-loaded. The run bundle's manifest cites the
link too, so the download reproduces the run locally and the link re-solves it
live.

## Authoring the model

`src/model.js` builds the model through `@idfkit/core` rather than holding IDF
text, so the four walls come from a plan loop and the whole thing stays a real
object graph:

```js
const doc = new IDFDocument(schema);
doc.add('Zone', 'ZONE ONE', { ceiling_height: 'Autocalculate' });
const wall = doc.add('BuildingSurface:Detailed', 'Zn001:Wall001', { /* ... */ });
wall.extensible.push({ vertex_x_coordinate: 0, vertex_y_coordinate: 0, vertex_z_coordinate: 4.572 });
```

That is what lets the drawing read from the model instead of restating it: the
axonometric projects the surface vertices, the plate's datum lines come from the
`SizingPeriod:DesignDay` objects, and the title block reads `Site:Location` and
`Timestep`.

### What the run reports

One deliberate departure from the stock example: its thirty-odd per-surface
conduction series are gone. They cost nothing to compute and a great deal to
report — each is requested with key `*`, so it expands to one series per
surface, and together they took the ESO from 15 series to 173.

That is not a rounding error. Measured on the annual run, interleaved A/B inside
a single page session so engine warm-up cannot confound it:

| Output requested | Annual run | After EnergyPlus stops simulating |
| --- | --- | --- |
| Stock, 173 series | 2,984 ms | 2,117 ms |
| Zone and site only, 15 series | 681 ms | 178 ms |

Nearly three quarters of the original run happened after the simulation
finished, almost all of it inside the engine parsing the ESO and handing it back
across the worker boundary. Drawing the chart is about 15 ms of it.

Output requests do not touch the physics — they only decide what is written
down — so every zone-level and site-level series the stock example asks for is
still here, and the results are unchanged. The sheet itself reads two of them.

## Reshaping the zone

The sheet's five dimension sliders and the model console's eighteen strips both
come through `applyModel(doc, params, patching())` in `src/model.js`, which is
idempotent and rewrites the vertex groups on the six surfaces in place rather
than rebuilding the document, so the run-period switch and the output requests
keep their state. The window and its overhang are the two objects that come and
go as their controls cross zero, and one routine adds, reshapes and removes them
both.

The axonometric and the quantities panel update on every frame of the drag; the
floor area, exposed envelope, volume and envelope-to-volume ratio are summed off
the surfaces with Newell's method, so they need no simulation and follow
whatever geometry the model actually holds. An adiabatic surface is excluded
from the exposed envelope, since counting it would flatter the compactness.

(This section and the one below describe the through-line in outline. `CLAUDE.md`
carries the current architecture in full — the control declarations, the
per-channel appliers, and the rules each of them has to keep.)

## Solving as you drag

A warm design day solves in about 50 ms, start of the run to the chart on
screen. That is well inside a drag, so the sheet solves itself: auto-solve is on
by default and there is nothing to press.

Runs are serialised — `@idfkit/engine` rejects a second `run()` while one is in
flight — so every solve the sheet makes goes through one scheduler, and it is
latest-wins. Whatever the controls are showing when the engine comes free is
what gets solved; the shapes the drag passed through on the way are skipped, not
queued. Flicking a slider across its whole track fires 150 input events and two
runs. (Parameter studies do not share that engine — they run on a pool of
further instances, so the live sheet never queues behind a curve.)

The two run types are far enough apart to need different cadences, so the
cadence is the only thing that changes between them:

| | solve time | fires |
| --- | --- | --- |
| Design day, 48 h | ~50 ms | continuously, during the drag |
| Weather file, 8,760 h | ~0.7 s | once, on release |

Because a result arrives roughly every 50 ms, replacing the numbers in place
would be a strobe and would tell you nothing. So the sheet holds on to the shape
you took hold of: the zone curve you started from stays on the plate as a ghost,
and the schedule prints the change beside each value. Only the change — a shift
too small to move the printed number prints nothing, which is why the outdoor
rows stay blank. The design days are fixed, so they never move.

The baseline is captured per gesture, not per run. During a slow drag the
previous run is 50 ms old and nearly identical, so differencing against it would
report nothing; differencing against where you took hold is the reading you
want. It survives a gesture that crosses several controls.

At this cadence the run ledger is scenery — five phases that flick past inside
600 ms — so it stands down to a dimmed list and the live signal moves to a pen
travelling the top edge of the plate. The annual run is slow enough to be worth
watching, so it gets the ledger and the ticking wall clock back.

Turning auto-solve off restores the button, and with it the original behaviour:
results dim and the status line asks for a re-run rather than leaving numbers on
screen that belong to a building the sheet is no longer showing.

Unglazed, the stock 15.24 × 15.24 × 4.572 m box damps the summer design day's
15.1 °C outdoor swing to 3.8 °C (ratio 0.25). Drag it to a 6 × 6 × 11 m tower
and the envelope-to-volume ratio goes 0.481 → 0.758 m⁻¹ and the damping ratio
goes to 0.71 — the geometry, the drawing and the physics move together.

## South glazing

`1ZoneUncontrolled.idf` has no fenestration, so the window is this demo's
addition: a `WindowMaterial:SimpleGlazingSystem` (U 1.8, SHGC 0.4, VT 0.6) and a
`FenestrationSurface:Detailed` on `Zn001:Wall001`. `north_axis` is 0, so the
wall at y = 0 is the one facing south — and the axonometric is projected from
the south-east for exactly that reason, since a drawing of a building with a
south window has to be able to see it.

The WWR slider scales both window dimensions by √wwr about the centre of the
wall rather than stretching a ribbon across it, which keeps the opening in
proportion and guarantees a reveal on all four sides at any ratio. At 0 the
window object is removed from the document entirely, which reproduces the stock
unglazed example exactly — verified: identical 3.8 °C swing, 0.25 damping and
29.8 °C mean as before the window existed.

Solar gain through the south wall is the whole point, and it shows:

| South WWR | Zone mean | Zone swing | Damping |
| --------- | --------- | ---------- | ------- |
| 0 %       | 29.8 °C   | 3.8 °C     | 0.25    |
| 20 %      | 31.8 °C   | 4.8 °C     | 0.32    |
| 60 %      | 34.8 °C   | 6.6 °C     | 0.44    |

The EPW toggle is now a field write on `SimulationControl` rather than string
interpolation, and `writeIdf(doc)` produces the text handed to the engine.

## The overhang

A shelf over the south window, sized by one slider: how far it reaches out.

It is authored as a `Shading:Zone:Detailed` on `Zn001:Wall001` rather than as
`Shading:Overhang`, which would say the same thing in four numbers. Only a
detailed surface carries coordinates, and the drawing reads the shelf's geometry
back off the model exactly the way it reads the walls. The shelf spans the width
of the opening, so the slider changes the one thing that matters on a south
face. It leaves the document entirely at 0 m, or whenever the WWR slider takes
the window away and leaves nothing to shade.

The quantities panel reports the depth beside its projection factor: the depth
over the height of the opening beneath it, which is the number a shade is
usually sized by. Both are measured off the vertices, so neither can drift from
what was simulated.

### It only counts if the engine is looking

`1ZoneUncontrolled.idf` sets `Solar Distribution` to `MinimalShadowing`, under
which there is no exterior shadowing at all except from window and door reveals.
An overhang under that setting is drawn on the sheet and ignored by the engine,
and it measures exactly that way: the zone mean sits at 31.8 °C whether the
shelf projects 0.3 m or 3 m. The model now asks for `FullExterior`, which
computes the shadow the shelf actually casts.

Beam solar that does get in is still laid on the floor exactly as before, and
the box is convex, so its walls cannot shade each other. With no shelf standing
the two settings therefore agree: the WWR table above was re-measured under
`FullExterior` and every row is unchanged, including the unglazed case that
reproduces the stock example. Interleaved A/B in one session, a design day
solves in 0.08 s either way, so the shadow calculation costs nothing you can
feel on a drag.

### What it buys

Denver, summer design day, 20 % WWR:

| South overhang | Zone mean | Zone peak | Damping |
| -------------- | --------- | --------- | ------- |
| None           | 31.8 °C   | 34.2 °C   | 0.32    |
| 0.60 m, PF 0.29 | 30.6 °C  | 32.7 °C   | 0.29    |
| 1.50 m, PF 0.73 | 30.4 °C  | 32.5 °C   | 0.29    |
| 3.00 m, PF 1.47 | 30.3 °C  | 32.5 °C   | 0.28    |

The glazing costs 2.0 °C of zone mean against the unglazed box; the first 0.6 m
of shelf gives back 1.2 °C of that, and everything past about a metre gives back
almost nothing. At 39.7° N the July sun is high enough around noon that a modest
projection already cuts the beam, and what still arrives is diffuse, which no
amount of overhang will stop. The effect scales with the opening it shades: at
60 % WWR the same building goes from 34.8 °C to 31.4 °C under a 1.5 m shelf.

Only the summer column moves. The winter design day is specified with a sky
clearness of 0, so it carries no solar at all, which means there is no winter sun
for the shelf either to block or to let past. Attach a weather file and both
seasons come from the year instead.

## Serving the schema bundle

`@idfkit/schemas` needs its `data/` directory served; `predev`/`prebuild` copy it
to `public/schemas/`, and the page reads it with `httpSource('/schemas/')`.

Up to `@idfkit/schemas@0.0.1` that call could not be made from this demo, so the
page carried its own `BundleSource`: `httpSource` resolved against an absolute
base, which a bare `/schemas/` has no way to satisfy, and it always piped the
response through a `DecompressionStream`, which fails under Vite because its
static middleware serves `.gz` files with `Content-Encoding: gzip` and the
browser has therefore already inflated the body. Both are fixed in 0.1.0, which
resolves the base against the document and sniffs the gzip magic bytes before
inflating, so the local copy is gone.
