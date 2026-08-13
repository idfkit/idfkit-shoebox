# idfkit-engine-demo

The smallest possible showcase of EnergyPlus running in the browser via
`@idfkit/engine` and `@idfkit/engine-assets`. One page, no button needed: it
runs the stock `1ZoneUncontrolled.idf` example (EnergyPlus 26.1.0) as a
design-day simulation entirely client-side, re-solving as you drag the sliders,
in about 50 ms a time. Attach an EPW to switch to an annual run.

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

## Files

- `src/model.js`: authors the model with `@idfkit/core` and reads it back
- `src/main.js`: loads the engine and schema, runs the model, reads the ESO, and
  draws the axonometric, the trace and the results schedule
- `index.html`: the sheet — tokens, run ledger, plate, schedule, title block
- `scripts/copy-schemas.mjs`: stages the schema bundle into `public/schemas/`

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

The width, depth, height and glazing sliders call `setParameters(doc, ...)`, which
rewrites the vertex groups on the six surfaces in place rather than rebuilding
the document, so the run-period switch and the output requests keep their state.
The axonometric and the quantities panel update on every frame of the drag; the
floor area, exposed envelope, volume and envelope-to-volume ratio are summed off
the surfaces with Newell's method, so they need no simulation and follow
whatever geometry the model actually holds. The adiabatic slab is excluded from
the exposed envelope, since counting it would flatter the compactness.

## Solving as you drag

A warm design day solves in about 50 ms, start of the run to the chart on
screen. That is well inside a drag, so the sheet solves itself: auto-solve is on
by default and there is nothing to press.

Runs are serialised — `@idfkit/engine` rejects a second `run()` while one is in
flight — so every solve goes through one scheduler, and it is latest-wins.
Whatever the sliders are showing when the engine comes free is what gets solved;
the shapes the drag passed through on the way are skipped, not queued. Flicking
a slider across its whole track fires 150 input events and two runs.

The two run types are far enough apart to need different cadences, so the
cadence is the only thing that changes between them:

| | solve time | fires |
| --- | --- | --- |
| Design day, 48 h | ~50 ms | continuously, during the drag |
| Weather file, 8,760 h | ~0.7 s | once, on release |

Because a result now arrives roughly every 50 ms, replacing the numbers in place
would be a strobe and would tell you nothing. So the sheet holds on to the shape
you took hold of: the zone curve you started from stays on the plate as a ghost
labelled `WAS`, and the schedule prints the change beside each value. Only the
change — a shift too small to move the printed number prints nothing, which is
why the outdoor rows stay blank. The design days are fixed, so they never move.

The baseline is captured per gesture, not per run. During a slow drag the
previous run is 50 ms old and nearly identical, so differencing against it would
report nothing; differencing against where you took hold is the reading you
want. It survives a gesture that crosses several sliders.

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

### Serving the schema bundle

`@idfkit/schemas` needs its `data/` directory served; `predev`/`prebuild` copy it
to `public/schemas/`. The demo supplies its own `BundleSource` instead of the
package's `httpSource`, because `httpSource` requires an absolute base URL and
always pipes the response through a `DecompressionStream` — which fails under
Vite, whose static middleware serves `.gz` files with `Content-Encoding: gzip`,
so the browser has already inflated the body. The local source sniffs the gzip
magic bytes and handles either case.
