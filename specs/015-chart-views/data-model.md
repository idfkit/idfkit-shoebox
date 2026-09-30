# Data Model: Chart Views on the Plate

**Feature**: `015-chart-views` | **Date**: 2026-09-29

## General rules

- **Typed and frozen.** Every entity below is a class whose instances are
  frozen at construction (constitution, workflow gate 10).
- **Where declarations are checked.** Declarations (views, series, models,
  regions) are validated at module load and throw on violation.
- **Where results are created.** Results (`RunSeries`, `PlateFrame`,
  computed readings) are built once per run or per frame and never mutated.

## 1. Declarations (`views.js`, `comfort.js`)

### 1.1 `SeriesDef`

One quantity a view may draw.

| Field | Type | Rule |
|-------|------|------|
| `id` | string | Unique. One of `air`, `operative`, `radiant`, `outdoor`, `wZone`, `wOut`, `heat`, `cool`, `occupancy`, `dayType`. |
| `label` | string | Lettered in the right gutter and the legend. At most 12 characters (copy budget). |
| `variable` | string | The exact EnergyPlus output variable name. It is matched with `exactly()`, never with a loose pattern. |
| `frequency` | `'hourly'` or `'daily'` | Must equal the frequency `syncReporting` requests. |
| `kind` | `Kind` | From `KINDS`. It must exist, or the module throws (`assertKinds`). |
| `scale` | number | The factor from engine units to the kind's SI unit. It is 1000 for humidity ratio (kg/kg to g/kg) and 1/3.6e6 for energy (J to kWh). |
| `needs` | channel id or null | A channel that must be in the path for the series to exist. |
| `selectable` | boolean | True only for the four series offered in the choice (FR-009): `air`, `operative`, `radiant` and `outdoor`. |
| `zone` | boolean | True for zone series. It decides which series draw a ghost line (FR-020d). |

**Invariant.** Selectable series sharing an axis must share `kind` (FR-009).
The four selectable series are all `KINDS.temperature`, so the check passes;
it is asserted at load so that a later addition cannot break it silently.

### 1.2 `View`

| Field | Type | Rule |
|-------|------|------|
| `id` | string | One of `ts`, `psy`, `adp`, `crp`, `dur`, `avg`, `sig`. This is also the link token. |
| `label` | string | The chooser's text. At most 14 characters. |
| `needs` | `Need[]` | See 1.3. |
| `placesHour` | boolean | `false` only for `avg` and `sig` (FR-019). |
| `drawsSeries` | boolean | True for `ts`, `dur` and `avg`, the views the series choice applies to. |
| `ghost` | `'lines'`, `'outline'` or `'change'` | FR-020b, FR-020c, FR-020d. |
| `describe` | function | `(frame) => string`: the accessible description (FR-022). |
| `defaults` | `ViewSetting` | That view's default settings. |

**Invariants, asserted at load.**

- The ids are unique.
- `ts` is first and is the default (FR-002).
- Every `Need` names a declared series, run length or channel.
- The chooser order equals FR-001's order.

### 1.3 `Need`

`Need` is a closed union. `availabilityOf` evaluates it against `RunFacts`.

- `Need.series(id)`: the snapshot holds that series.
- `Need.weatherRun({ minDays })`: at least one environment is a weather-file
  run, covering at least `minDays` days.
- `Need.runningMean()`: the weather source yields daily means across the
  run, which `runningMean` accepts.
- `Need.noMechanicalCooling()`: used only by the adaptive region of `psy`.

### 1.4 `Availability`

This is a closed type with two cases: `Available`, and `Unavailable({ reason,
remedy })`.

- `reason` is one short sentence for the chooser, within the copy budget.
- `remedy` is the channel id, run length or file season that would make the
  view available, or `null`.

There is no third state, so a caller cannot fall back.

### 1.5 `AdaptiveModel`

| Field | Type | Rule |
|-------|------|------|
| `id` | string | One of `en1`, `en2`, `en3`, `a80`, `a90`. |
| `family` | `'en16798'` or `'ashrae55'` | |
| `neutral` | `(trm) => number` | 0.33 Trm + 18.8, or 0.31 tpma + 17.8. |
| `upper`, `lower` | number | Offsets in K. The EN upper offsets are taken from `tm59.CATEGORIES`. |
| `range` | `{ upperFrom, upperTo, lowerFrom, lowerTo }` | Applicability of the running mean, in °C. |
| `citation` | string | Clause and table, lettered in place (FR-005). |
| `fold` | string | Method, applicability, and the note on shared recursion. |

**Invariant.** For each EN category, `neutral(trm) + upper` must equal
`tm59.CATEGORIES[id].tmax(trm)` at Trm of 10, 20 and 30. This makes one
published number have one source.

### 1.6 `ComfortRegion`

This entity serves the psychrometric view only.

| Field | Type | Rule |
|-------|------|------|
| `id` | `'graphic'` or `'adaptive'` | The link tokens are `g` and `a`. |
| `zones` | `Polygon[]` | For `graphic`, two polygons (0.5 clo and 1.0 clo) from `comfort.data.js`, in (operative temperature in °C, humidity ratio in g/kg). For `adaptive`, a function of the day's running mean. |
| `needs` | `Need[]` | `adaptive` needs `runningMean` and `noMechanicalCooling`. |
| `citation` | string | ASHRAE 55-2020 §5.3.1 or §5.4. |
| `fold` | string | Applicability. For the graphic zones: 1.0 to 1.3 met and air speed below 0.2 m/s (FR-011b). |

**Invariant.** The graphic polygons pass the Figure 5.3.1 spot checks
(research.md §R4).

## 2. Run results (`readings.js`)

### 2.1 `RunFacts`

This entity holds what availability is judged against. Every fact is read off
the run or the simulated document, never off `params`.

| Field | Source |
|-------|--------|
| `environments` | `environmentRuns(points, eso.environments)` |
| `weatherDays` | The distinct days covered by weather-file environments. |
| `elevation` | `Site:Location.elevation` in the document. |
| `pressure` | Computed from `elevation` (research.md §R3). |
| `mechanicalCooling` | The document holds `ZoneHVAC:IdealLoadsAirSystem`, and a `ZoneControl:Thermostat` whose control type includes cooling. |
| `dailyMeans` | The weather source's daily means, or the `ABSENCE` reason it gives. |
| `channels` | The engaged channel ids, read from the reporting the document carries. |

### 2.2 `RunSeries`

This is the snapshot of one completed run (research.md §R1).

| Field | Type | Rule |
|-------|------|------|
| `points` | timestamp array | Hourly stamps, shared by every hourly series. |
| `runs` | environment runs | As `environmentRuns` returns them. |
| `series` | `Map<id, Float64Array>` | Values in the kind's SI unit, after `scale`. A missing hour is `NaN`, never 0. |
| `daily` | `Map<id, Float64Array>` | For the daily series (`heat`, `cool`, `dayType`). |
| `absent` | `Map<id, string>` | Each series the run did not report, with the reason: a bypassed channel, or a variable not found. |
| `facts` | `RunFacts` | |
| `hours` | string | The fingerprint: environment count, first stamp, last stamp and length. |

**Invariants.**

- Every hourly array has `points.length` entries.
- `air` must be present; otherwise `solve` takes today's "no hourly zone
  temperature" failure exit.
- The object is frozen, but its typed arrays cannot be frozen. By convention
  nothing writes to them after construction, and the harness asserts that a
  full frame cycle leaves them byte-identical.

**The ghost.** The ghost is a `RunSeries` reference or `null`. It is drawn
only when `ghost.hours === live.hours` (FR-020a).

## 3. The view setting and the frame (`views.js`, `plate.js`)

### 3.1 `ViewSetting`

This entity is what the `pv` key encodes (contracts/view-key.md).

| Field | Type | Default | Applies to |
|-------|------|---------|------------|
| `view` | View id | `ts` | all |
| `series` | series id set | `{air, outdoor}` | `ts`, `dur`, `avg` |
| `shade` | one selectable series id | `air` | `crp` |
| `aggregation` | `'h'`, `'d'` or `'m'` | `'h'` | `ts` |
| `zoom` | `{ from: MMDD, to: MMDD }` or null | null | `ts` |
| `region` | `'g'` or `'a'` | `'g'` | `psy` |
| `model` | AdaptiveModel id | `en2` | `adp` |

**Invariants.**

- `series` is non-empty (FR-010).
- `zoom.from` is at or before `zoom.to`, and both are in the non-leap calendar.
- A field that does not apply to `view` is held but not encoded. Switching
  views and back restores it within a session; a link carries only the fields
  of the view it names.

**State transitions.**

- **The reader changes the view, series, aggregation, region or model.** The
  setting is replaced, the plate is redrawn and the address bar is rewritten.
  No solve starts (FR-003).
- **A new run arrives with a zoom set.** The zoom is kept if the new
  `RunSeries` covers both dates. Otherwise it is released to null, with a
  stated reason in the plate's status line (US8 scenario 3).
- **A link is decoded.** A malformed setting refuses the link. A well-formed
  setting whose view is `Unavailable` loads, and the plate letters the reason
  (Edge Cases).
- **A kept scheme is restored.** The setting is untouched (FR-024).

### 3.2 `PlateFrame`

This entity is the single argument to `drawPlate`. It is built by `main.js`
per redraw and is not retained.

| Field | Type |
|-------|------|
| `live` | `RunSeries` or null (null gives "AWAITING RUN", as today) |
| `ghost` | `RunSeries` or null, already checked against `live.hours` |
| `stale` | boolean (FR-020) |
| `setting` | `ViewSetting` |
| `availability` | `Map<viewId, Availability>` |
| `datums` | today's `DATUMS` |
| `reading` | `{ at, held }` or null, from `lastReadFrom` and `pinnedHour` |
| `change` | boolean, the carpet toggle. It is honoured only when `ghost` is present (FR-020c). |
| `size` | `{ w, h, index }`, measured from the host and the `--index` property |
| `on` | callbacks: `pin(at)`, `choose(setting)`, `toggleChange()` |

## 4. Computed readings (`views.js`, `comfort.js`)

Every reading is a pure function of `RunSeries` and `ViewSetting`, memoised on
the pair's identity. Each count used by SC-003 is exported so a harness can
compare it with a direct count.

| Reading | Function | Lettered as |
|---------|----------|-------------|
| Share inside each graphic zone | `graphicShares(live, facts)` | percentage of occupied hours, one per clo |
| Adaptive strip counts | `adaptiveCounts(live, model, runningMean)` | above, within and below, plus unassessed and out of scope |
| Duration at a value | `hoursAtOrAbove(sorted, value)` | a count of hours |
| Average day | `averageDay(live, id)` | 24 means per covered month; months not covered are absent |
| Carpet | `carpetGrid(live, id, bins)` | the bin index per cell and each bin's range |
| Change carpet | `carpetChange(live, ghost, id, bins)` | signed bins centred on zero, lettered as `temperatureDifference` |
| Daily signature | `dailySignature(live)` | daily heating and cooling in kWh against the daily mean outdoor temperature |
| Aggregation | `aggregate(values, points, grain)` | mean, minimum and maximum per period |
| 90 % outline | `densityOutline(marks, grid)` | one or more closed polylines |

### `WasNow`

`WasNow` is a pair `{ was, now }` of the same reading computed on the ghost and
on the live run. It is lettered `was → now`, in the sheet's unit system and
with the difference kind where the reading is a difference. It is created only
when a ghost stands (FR-020b, FR-020c).

## 5. Relationships

```text
View ──needs──> Need ──evaluated against──> RunFacts ──> Availability
View ──draws──> SeriesDef ──read into──> RunSeries.series
ViewSetting ──names──> View, SeriesDef[], AdaptiveModel, ComfortRegion
PlateFrame = { RunSeries live, RunSeries ghost, ViewSetting, Availability map, ... }
permalink `pv` <──codec──> ViewSetting        (never kept schemes; never params)
```
