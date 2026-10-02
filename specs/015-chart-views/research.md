# Research: Chart Views on the Plate

**Feature**: `015-chart-views` | **Date**: 2026-09-29

The Technical Context in `plan.md` carries no NEEDS CLARIFICATION marker. The
spec's clarification session settled scope, the ghost, the comfort regions and
the measurement conditions. Each item below is a design decision that planning
had to make, recorded as decision, rationale and alternatives considered.

## R1. Where the plate's data lives: one results snapshot

**Decision.** A completed run is read once into a frozen `RunSeries`
(data-model.md). It holds the timestamps, the environment runs and one
`Float64Array` per available series, keyed by series id. A series the run did
not report is recorded as absent, with the reason. `plot` in `main.js` becomes
this object. `ghost` becomes a reference to the `RunSeries` standing when the
gesture began, so it costs no copy and carries every series (FR-020a).

The "drawn only when it covers the same hours" guard (FR-020a) becomes a
comparison of the two snapshots' `hours` fingerprints: the environment count,
the first stamp, the last stamp and the length. It replaces today's
`ghost.length === plot.zone.length`, which admits two different runs of equal
length. Today that happens on a station change between two design-day runs.

**Rationale.**

- Every view reads the same snapshot, so a view switch mid-gesture draws the
  ghost with no re-read.
- The snapshot is the one place where "what the run reported" is decided. The
  views therefore cannot disagree about which series exist.
- Typed arrays keep eight series of 8,760 values at about 560 kB, and they
  keep the sort (duration curve) and the binning (carpet) allocation-light.

**Alternatives considered.**

- *Re-read the ESO per view.* `findVariables` and `getTimeSeries` on each
  switch cost more than the 150 ms budget allows on a year run. The ghost
  would also need the previous ESO kept alive, which is several MB.
- *Keep `plot.zone` and `plot.out` and add parallel arrays.* This grows by
  one global per series. The ghost would still hold only what someone
  remembered to copy, which is the defect FR-020a names.

## R2. Separating computation from drawing

**Decision.** There are three new DOM-free modules and one new DOM module.

| Module | Holds |
|--------|-------|
| `views.js` | Declarations, availability, per-view computation, the `pv` codec. |
| `psychro.js` | Moist-air equations. |
| `comfort.js` | Comfort regions, adaptive models, occupied-hour shares and counts. |
| `plate.js` (DOM) | `drawPlate(host, frame)`: one renderer per view, drawing a `PlateFrame` and computing nothing it letters. |

**Rationale.**

- SC-003 requires every lettered count to equal the count taken directly from
  the hourly series. That is only checkable in Node if the count is computed
  outside the renderer.
- CLAUDE.md already requires `readings.js`, `tm59.js`, `units.js` and the
  codec to stay DOM-free for this reason.

**Alternatives considered.** *Extend `renderTrace` in `main.js`.* This is
rejected: `main.js` is 13,307 lines, and the renderer would reach about 1,500.
It would read ten module globals, and its arithmetic could not be called from
a harness.

## R3. Psychrometric equations and barometric pressure

**Decision.** The equations come from the ASHRAE Handbook of Fundamentals
(2021), chapter 1.

| Quantity | Source and form |
|----------|-----------------|
| Standard atmospheric pressure | Equation 3: `p = 101.325 (1 − 2.25577e-5 Z)^5.2559` kPa, with `Z` the elevation in metres. |
| Saturation vapour pressure over ice (−100 to 0 °C) | Hyland–Wexler, equation 5. |
| Saturation vapour pressure over liquid water (0 to 200 °C) | Hyland–Wexler, equation 6. |
| Humidity ratio | Equation 20: `W = 0.621945 pw / (p − pw)`. |
| Relative humidity curves | `pw = φ pws(t)` at φ = 0.1 … 0.9, with φ = 1 as the saturation curve. |

Two inputs are read, not assumed:

- **Elevation** is read from `Site:Location` in the simulated document, as the
  spec's Assumptions require.
- **Humidity** is plotted from the run's reported humidity ratios. It is never
  recomputed from temperature and relative humidity, so the marks are the
  engine's values.

The chart spans dry bulb from −10 to 40 °C and humidity ratio from 0 to
30 g/kg. Either bound extends to the data where the data exceed it, so no mark
is ever clipped. The `Kind` letters the axes in the sheet's unit system (R8).

**Rationale.**

- The Handbook is the reference the ASHRAE 55 zones are drawn against.
- Deriving pressure from elevation matches the assumption the spec records,
  and makes the chart a function of the document.
- EnergyPlus computes the reported humidity ratio at the weather file's
  station pressure. For a station near its declared elevation this differs
  from the standard pressure by a few percent at most, so the curves serve as
  a reference and the marks remain the engine's values. A mark above the
  saturation curve is therefore possible by that margin. The fold states it,
  and the mark is drawn where it falls, never clamped.

**Alternatives considered.**

- *Report `Site Outdoor Air Barometric Pressure` and use the run's mean.* This
  adds a series to every run to recover a constant the document already
  implies, which Principle VI argues against.
- *Sea-level chart.* At 1,600 m this misplaces the saturation curve by about
  18 %, which the chart would show as marks above saturation.

## R4. The ASHRAE 55-2017 graphic comfort zones

**Edition.** The Graphic Comfort Zone Method is cited from 55-2017. Addendum
d to 55-2017 (approved 2020) removed it and Figure 5.3.1; in 55-2020, §5.3.1
is the Analytical Comfort Zone Method. The withdrawn figure is printed, struck
through, in Addendum d, which ASHRAE publishes free.

**Decision.** The two §5.3.1 zones are generated once by
`scripts/build-comfort.mjs`, run by hand like `build-rates.mjs`. The script
implements the Appendix B PMV procedure, whose reference code is published in
the standard, at the conditions Figure 5.3.1 states:

- metabolic rate 1.1 met;
- air speed 0.1 m/s;
- mean radiant temperature equal to air temperature, so the horizontal axis
  is operative temperature;
- 0.5 clo and 1.0 clo;
- PMV between −0.5 and +0.5;
- humidity ratio from 0 to 0.012.

It traces each boundary at 0.0005 humidity-ratio steps and writes the vertices
to `src/comfort.data.js` with the citation. At module load, `comfort.js`
asserts each polygon against spot values transcribed from Figure 5.3.1: the
corner temperatures at W = 0 and W = 0.012 for each clo, within 0.5 K,
which is the reading precision of the printed figure. The check catches a
gross generator or transcription error, such as a wrong clo, a swapped sign
or air temperature taken for operative. Such an error throws at load
(Principle IV) instead of drawing a plausible zone that is not the standard's.
Precision beyond the figure comes from the Appendix B procedure itself.

The share test (FR-011a) is point-in-polygon on (zone operative temperature,
zone humidity ratio). On the chart the zone marks stand at zone air
temperature, because the horizontal axis is dry bulb. The fold next to the
citation says that the zones and the share are drawn against operative
temperature, following the figure's own convention.

**Rationale.**

- The figure's zone boundaries are defined by the PMV computation, not by a
  published vertex table. Computing them from the standard's own procedure is
  therefore the traceable route.
- Checking against the figure guards against an error in the transcription.
- Generating the data once keeps the PMV iteration out of the page.

**Alternatives considered.**

- *Hard-code vertices read off the figure.* A reading off a printed figure
  has an error of about 0.5 K and cannot be cited to a table.
- *Compute PMV live from desk inputs.* This is out of scope. The model writes
  no clothing level and no air speed (spec, Assumptions).

## R5. Running mean and adaptive models

**Decision.** `tm59.runningMean` gains an optional period argument:

```js
runningMean(dailyMeans, source, { from, to })
```

The default stays the TM59 season, 30 April to 30 September seeded from
23 to 29 April, so every TM59 reading is unchanged. `.harness/comfort-line.mjs`
asserts this.

The adaptive comfort view and the psychrometric adaptive region call
`runningMean` over the whole file:

- Days 1 to 7 are the seed. The first assessable day is 8 January.
- An hour on days 1 to 7 is counted as **unassessed**. It is never wrapped
  onto the previous December, because the file is one year, not a cycle.
- The same recursion (α = 0.8, the seed weights and the divisor 3.8) is used,
  so FR-013 holds.
- ASHRAE 55-2020 §5.4.2.1 permits an exponentially weighted running mean with
  α between 0.6 and 0.9. The one recursion therefore serves both families,
  and the fold says so.

The adaptive models are declared as frozen `AdaptiveModel` instances in
`comfort.js`, each with its citation.

| Model | Neutral | Limits | Applicability of the running mean |
|-------|---------|--------|-----------------------------------|
| EN 16798-1 Category I | 0.33 Trm + 18.8 | +2 / −3 K | 10 to 30 °C upper, 15 to 30 °C lower |
| EN 16798-1 Category II (default) | 0.33 Trm + 18.8 | +3 / −4 K | as above |
| EN 16798-1 Category III | 0.33 Trm + 18.8 | +4 / −5 K | as above |
| ASHRAE 55-2020 80 % | 0.31 tpma + 17.8 | ±3.5 K | 10 to 33.5 °C |
| ASHRAE 55-2020 90 % | 0.31 tpma + 17.8 | ±2.5 K | 10 to 33.5 °C |

The upper limits for EN 16798-1 already exist in `tm59.CATEGORIES` and are
reused, not restated. The lower limits and the lower applicability bound must
be transcribed from EN 16798-1:2019 Annex B into `comfort.js`, and checked
against the purchased text before merge. The purchased text never enters the
repository; this is the rule TM59 already follows.

An hour whose running mean lies outside a model's range is counted as
**outside the method's scope** and lettered apart (FR-011a). It is never
clamped into the band. This differs from TM59's clamp, which belongs to that
method, and the fold says so.

**Rationale.**

- One recursion avoids a second, drifting implementation (FR-013).
- An honest "unassessed" count follows Principle IV.
- Reusing `CATEGORIES` keeps one source for each published number.

**Alternatives considered.**

- *EnergyPlus's own adaptive outputs.* These were rejected for TM59 for the
  reason recorded in `tm59.js`: the engine's running mean restarts at each run
  period.
- *A simple 7-day arithmetic mean for ASHRAE.* It is permitted, but it would
  be a second method.

## R6. Reporting additions and their cost

**Decision.** The additions are as follows. Names were confirmed in an
EnergyPlus 26.1.0 `.rdd` under `.harness/out/`.

| Variable | Frequency | Key | When |
|----------|-----------|-----|------|
| `Site Outdoor Air Humidity Ratio` | Hourly | `*` (site, one series) | every sheet run |
| `Zone Mean Air Humidity Ratio` | Hourly | `*` (one zone) | every sheet run |
| `Zone Ideal Loads Supply Air Total Heating Energy` | Daily | `*` (one system) | the document holds `ZoneHVAC:IdealLoadsAirSystem` |
| `Zone Ideal Loads Supply Air Total Cooling Energy` | Daily | `*` (one system) | as above |

- **Which zone humidity variable.** `Zone Mean Air Humidity Ratio` is a Zone
  Average variable and matches `Zone Mean Air Temperature`. `Zone Air Humidity
  Ratio` is an HVAC Average variable and is not used.
- **Why supply-air total energy.** It is the quantity the
  `Heating:DistrictHeatingWater` and `Cooling:DistrictCooling` meters total.
  The bill reads those meters, so the daily sums reconcile with the sheet's
  totals (FR-017, User Story 7 scenario 1).
- **Why Daily.** The engine sums HVAC Sum variables over the day. The
  signature reads only daily totals, and 365 values cost almost nothing
  against 8,760.
- **Where the gate is asked.** It is asked of the document, next to the
  existing AFN gate in `syncReporting`, so a bypassed or blocked System
  channel requests nothing it cannot produce.

Neither `'extremes'`, `'energy'`, `'tm59'` nor `RunContents` changes. Studies
therefore pay nothing.

**Rationale.** These are the fewest series that let every view draw without a
re-solve. All four are site-level or zone-level (FR-008).

**Alternatives considered.**

- *Hourly demand.* It costs 17,520 values for a figure read only as a daily
  sum.
- *`Zone Ideal Loads Zone Sensible Heating Energy`.* It excludes outdoor-air
  and latent load, so it would not sum to the billed meters.
- *Deriving humidity from relative humidity and temperature.* It is still a
  series, and it is less direct.

## R7. The `pv` link key

**Decision.** A new reserved key, `pv` ("plate view"), is added to `RESERVED`
in `permalink.js`. The grammar is in `contracts/view-key.md`:

- a view token, then dot-separated fields in a fixed order;
- each field written only when it differs from that view's default;
- the whole key omitted at the default setting.

`encodeState` gains `view`, and `decodeState` returns `view`. Decoding is
strict: an unknown view, an unknown or repeated field, fields out of order, a
value at its default, or a zoom outside the calendar all refuse the link whole
(FR-023, Edge Cases).

A well-formed view the linked desk cannot draw does not refuse the link. The
desk loads, and the plate states why (Edge Cases). `schemeHash` gains a
`view` argument:

- The address bar and Share pass the live setting.
- The kept-scheme shelf and `restoreScheme`'s comparison pass `null`
  (FR-024).
- The `hashchange` guard compares against the bar's form, which carries the
  view, so moving the view never reloads the page.

**Rationale.** A reserved key added without a version bump is the additive
case the `wf` precedent in `permalink.js` records. Omission at the default
gives SC-004's byte-identical link.

**Alternatives considered.**

- *One key per setting (`pv`, `ps`, `pa`, `pz`).* This uses four reserved
  names and four collision checks for one concept.
- *Storing the view in `localStorage` like the unit system.* The spec chose
  to carry it on the link (Clarifications).

## R8. Humidity ratio as a unit kind

**Decision.** `KINDS.humidityRatio` is declared as SI `g/kg` and IP `gr/lb`,
with factor 7 (7,000 grains per pound divided by 1,000 grams per kilogram,
exactly) and 1 digit. `readRunSeries` converts the engine's kg/kg to g/kg once
at read time. `params` never holds a humidity ratio, so the rule that "SI is
what the document holds" is not in tension: this is a reading, not a
parameter. A change in humidity ratio has no offset, so `deltaKindOf` returns
the same kind.

The carpet and scatter axes in temperature use `KINDS.temperature` for
positions and `KINDS.temperatureDifference` for the change carpet's scale
(FR-020c, FR-021). This is the delta trap CLAUDE.md records three times.

## R9. Drawing dense views within the budget

**Decision.**

- **Scatter marks** (psychrometric, adaptive, signature) are one `<path>` per
  series. Each mark is a zero-length subpath: `M x y h0`, with
  `stroke-linecap: square` for the zone and `round` for outdoors. The two are
  distinguished by shape and label as well as ink (FR-022). This gives 2 to 3
  nodes instead of 17,520.
- **Pinning on a scatter view.** A click is resolved by `nearestHour` against
  a uniform grid index built once per frame, in O(1) expected time. Only
  hour-identifiable marks pin (FR-019). The keyboard steps the reading hour
  through the run's hours in time order and moves the highlighted mark.
- **The carpet** quantises values into a declared number of bins: 9 on the
  single-hue scale, and 11 on the signed scale including a zero bin. It draws
  one `<path>` per bin made of rectangle subpaths. The legend letters each
  bin's range, so the scale is readable in words (FR-014, FR-022). Weekends
  and holidays are marked by a tick in the left gutter against the day row,
  read from `Site Day Type Index`, which the sheet already reports daily.
- **The 90 % outline** (FR-020b) is the highest-density region on a fixed
  48 × 32 grid in plot coordinates. Cells are taken in descending count until
  they hold at least 90 % of the ghost's marks, with ties broken by cell
  index for determinism. The outline is the marching-squares boundary of that
  cell set, with no smoothing. This is the same marching square the E-02
  survey uses for its bands. It handles the curved, banana-shaped clouds a
  convex hull would overstate.
- **The duration curve** is at most one sort per drawn series per frame, with
  results memoised on the `RunSeries` identity.

**Rationale.** Node count dominates SVG build and layout time. One path per
series keeps every view to a few dozen nodes. A density outline on a grid is
O(n) and deterministic.

**Alternatives considered.**

- *A `<canvas>` for scatter and carpet.* It is fast, but it loses the plate's
  single SVG, its `aria-label` and the crisp print of the sheet.
- *A convex hull after dropping the 10 % of marks farthest from the centroid.*
  It is convex, so it paints the empty interior of a curved cloud, and it
  assumes one centre.
- *Onion peeling.* It is O(n²) in the worst case on 8,760 points.

## R10. Availability and refusal

**Decision.** Each `View` declares what it needs. `availabilityOf(view,
facts)` returns either `Available` or `Unavailable({ reason, remedy })`, where
`remedy` is the channel or run length that would make the view available, or
null.

| View | Needs |
|------|-------|
| Time series | always available |
| Psychrometric | both humidity series |
| Adaptive comfort | a weather-file run of at least 8 days, the file's daily means, the operative series and the occupancy series |
| Carpet | a weather-file run |
| Duration curve | always available |
| Average day | a weather-file run |
| Energy signature | the two demand series |

The psychrometric view's adaptive region adds two conditions:

- no mechanical cooling, asked of the document as an ideal loads system with a
  thermostat whose control type includes cooling;
- a running mean.

A part-year weather file reuses `ABSENCE.fileSeason`.

**Rationale.** One closed type makes Principle IV structural. The chooser
lists every view with its state, so the reader never meets a view that
vanishes without a stated reason (FR-004, SC-005).

## R11. The keyboard on the plate

**Decision.** The plate host takes `tabindex="0"`.

- On the duration curve, Left and Right move a cursor by one rank, Page Up
  and Page Down by 1 % of the run's hours, and Home and End to the extremes.
  The reading is lettered in view and announced through a polite live region.
- On the views that place an hour, the same keys step the reading hour, and
  Enter pins it.

This closes the gap `.interface-design/system.md` records under "The reading
hour on the plate": choosing an arbitrary hour is otherwise pointer-only.

**Rationale.** FR-015 requires that the reading does not exist only on hover.
Principle VII requires that no reading is pointer-only.

## R12. Performance measurement

**Decision.**

- **SC-001.** `drawPlate` is wrapped in `performance.mark` and
  `performance.measure` behind a `?measure` query flag. The flag reaches no
  IDF object and no link. Ten switches are recorded per view pair, and the
  median is taken from `performance.getEntriesByName`. The measurement is
  taken unthrottled on the development Mac and again in Chrome with 4× CPU
  slowdown.
- **SC-002.** This follows the existing reporting-profile method:
  - an interleaved A/B test of annual solves, with and without the added
    variables;
  - one engine per process;
  - 10 pairs, compared by median.

The results are recorded in `docs/design-notes.md`.
