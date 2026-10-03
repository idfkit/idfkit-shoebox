# Implementation Plan: Chart Views on the Plate

**Branch**: `015-chart-views` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-chart-views/spec.md`

## Summary

The plate currently draws one picture: zone mean air temperature and outdoor
dry bulb temperature over the run. This feature makes the plate a chooser of
seven views of the same run:

1. time series (the default, unchanged);
2. psychrometric;
3. adaptive comfort;
4. carpet;
5. duration curve;
6. average day by month;
7. energy signature.

It also adds a series choice, a time aggregation and a zoomed date range to the
time series.

The technical approach has five parts.

1. **One results snapshot.** The data behind the plate stops being two arrays
   (`plot.zone`, `plot.out`). It becomes one frozen `RunSeries` read once per
   completed run, holding every series any view can draw. The ghost becomes a
   reference to the `RunSeries` standing when the gesture began, so every view
   can draw it and no copy is made.
2. **Pure computation apart from drawing.** Every count, share, sort, mean,
   grid and outline is computed by new DOM-free modules (`views.js`,
   `psychro.js`, `comfort.js`), so Node harnesses assert them against the hourly
   series directly (SC-003). A new DOM module, `plate.js`, draws a
   `PlateFrame` and nothing else. `main.js` keeps the state and calls it.
3. **Reporting grows by two hourly series, and by two daily series with System in the path.**
   - Every sheet run gains outdoor humidity ratio and zone mean air humidity
     ratio.
   - A desk with the ideal loads system in the document also gains daily
     supply-air total heating and cooling energy. These are the same
     quantities the two district meters total, so the daily sums reconcile
     with the bill (FR-017).
4. **The view setting rides the link under a new reserved key, `pv`.** It is
   written only when the setting differs from the default. The kept-scheme
   shelf never stores it. Adding a reserved key is the additive case, so
   `LINK_VERSION` does not change.
5. **Dense views stay within the redraw budget** (SC-001: under 150 ms,
   median of 10 switches, on a year run):
   - Scatter marks are drawn as one path per series, not one node per hour.
   - The carpet is one path per shade bin.
   - Pinning an hour on a scatter view uses a nearest-mark lookup on a grid
     index, with no per-mark hit targets.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), run directly in the browser
and under Node 20+ for harnesses.

**Primary Dependencies**:

- `@idfkit/core`: `IdfDocument` and schema.
- `@idfkit/engine`: ESO parsing and `getTimeSeries`.
- `@idfkit/engine-assets`: the EnergyPlus 26.1.0 WebAssembly build.
- `@idfkit/schemas`.

No new runtime dependency (Principle V). SVG is drawn inline; there is no
chart library.

**Storage**: none new. The view setting lives in the URL fragment (`pv`). The
ghost and the carpet's change toggle live in memory only.

**Testing**: no test runner. The feature is verified in four ways:

- throwaway Node harnesses under the gitignored `.harness/`;
- EnergyPlus 26.1.0 at `/Applications/EnergyPlus-26-1-0`;
- the idfkit MCP validation tools;
- driving the page in Chrome, with the performance panel for SC-001.

**Target Platform**: evergreen desktop and mobile browsers, down to 390 px
wide (Principle VII).

**Project Type**: static single-page web application (vanilla ES modules and
Vite).

**Performance Goals**:

- A view switch on a year run redraws, as the median of 10 switches, in under
  150 ms on the maintainer's development Mac unthrottled, and in under 500 ms
  in Chrome with 4× CPU slowdown (SC-001).
- The annual solve time rises by no more than 5 % with the added series
  (SC-002).
- A design-day solve stays near 50 ms.

**Constraints**:

- A view change starts no solve, touches no IDF object and no solve key, and
  cancels no study (FR-003).
- The time series view at its default renders identically to the current
  plate (FR-002).
- The link at the default setting is byte-identical to today's (SC-004).
- Every reading is reachable without hover at 390 px (FR-015, SC-006).
- No per-surface outputs are added (FR-008).

**Scale/Scope**:

- A year run carries 8,760 hours per series. Up to about eight hourly series
  enter the snapshot, and the ghost holds one more snapshot.
- Seven views, four selectable series, three aggregations and two comfort
  regions for the psychrometric view.
- Five adaptive models: EN 16798-1 Categories I, II and III, and ASHRAE 55 at
  80 % and 90 % acceptability.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design
(below).*

| Principle | How the design meets it | Status |
|-----------|-------------------------|--------|
| I. Everything runs in the browser | All computation is in page. No request is added. The comfort-zone boundaries are generated once by a script into a data module (`src/comfort.data.js`) and shipped as a static file. | Pass |
| II. Deterministic and shareable | The view setting is carried by `pv` and is decoded strictly; a malformed value refuses the link whole. The setting is not on `params`, reaches no IDF object and no solve key, so it cannot change a result. The default setting writes nothing, so today's links are byte-identical. `pv` is additive, so `LINK_VERSION` stays `v1`. | Pass |
| III. Read it back off the model | Every view draws from the `RunSeries` read off the run's ESO. Barometric pressure comes from `Site:Location` elevation in the simulated document. "Mechanical cooling in the path" is asked of the document (an ideal loads system and a thermostat with a cooling setpoint), not of `params`. Comfort regions and bands cite ASHRAE 55-2020 and EN 16798-1 in place. | Pass |
| IV. No silent fallbacks | A view that cannot be drawn is listed as unavailable with its reason and remedy, never replaced by the time series. Missing hours are absent marks, not zeros. A run without humidity series refuses the psychrometric view and names the missing series. Hours the adaptive method cannot assess are counted apart. Declaration errors (a view requiring an undeclared series, a comfort polygon failing its spot checks) throw at module load. | Pass |
| V. Only `@idfkit/*` at runtime | No dependency is added. The psychrometric equations (ASHRAE Handbook of Fundamentals 2021, chapter 1) and the PMV procedure (ASHRAE 55-2020 Appendix B) are implemented locally. | Pass |
| VI. Latency is the interface | Views redraw from the retained snapshot with no solve. Added outputs are zone-level or site-level: two always, two more only with System in the path. SC-002 is measured interleaved A/B. Dense views are drawn as a handful of paths. | Pass, subject to SC-002 measurement |
| VII. Mobile-first and responsive | The chooser wraps at 390 px. The duration curve reading and the pinning of an hour work by tap, click and keyboard. The carpet's shade scale and the scatter marks are distinguished by shape and wording as well as hue. Layout thresholds are read back from the stylesheet through the existing `--index` property. | Pass |
| Workflow gate 6 (general notes) | The plate step in `NOTES` is rewritten to teach the chooser, and `STORE` goes from `shoebox-general-notes-v6` to `-v7`. | Planned |
| Workflow gate 8 (design system) | Five patterns are recorded in `.interface-design/system.md` in the same change: the view chooser, scatter marks by shape, the 90 % outline ghost, the carpet's binned shade and change toggle, and the keyboard cursor on the plate. | Planned |

No violation needs justification. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-chart-views/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and their sources
├── data-model.md        # Phase 1: typed objects and their invariants
├── quickstart.md        # Phase 1: how to verify the feature end to end
├── contracts/
│   ├── view-key.md      # the `pv` link grammar
│   ├── reporting.md     # the output variables the sheet profile gains
│   └── views.md         # the view registry, availability and the plate frame
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2, written by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── views.js            # NEW, DOM-free. Declarations: View, SeriesDef, Aggregation,
│                       #   ViewSetting, the view registry. Availability.
│                       #   Computations: aggregate, zoom, durationCurve,
│                       #   averageDay, carpetGrid, dailySignature, densityOutline,
│                       #   nearestHour, WasNow. The `pv` codec (encodeView / decodeView).
├── psychro.js          # NEW, DOM-free. Saturation pressure, humidity ratio,
│                       #   standard pressure from elevation, RH curves,
│                       #   point-in-polygon for the comfort zones.
├── comfort.js          # NEW, DOM-free. ComfortRegion (graphic and adaptive),
│                       #   AdaptiveModel (EN 16798-1 I/II/III, ASHRAE 55 80/90),
│                       #   whole-year running mean, occupied-hour shares and counts.
├── comfort.data.js     # NEW, generated. ASHRAE 55-2017 §5.3.1 zone polygons.
├── plate.js            # NEW, DOM. drawPlate(host, frame): one renderer per view,
│                       #   the chooser, series and region controls, keyboard cursor.
├── readings.js         # + readRunSeries(eso, doc) -> RunSeries
├── tm59.js             # runningMean gains a period argument; TM59 output unchanged
├── units.js            # + KINDS.humidityRatio (g/kg, gr/lb)
├── model.js            # VARIABLES_HOURLY + two humidity series; syncReporting adds
│                       #   daily ideal loads energy when the document holds the system
├── permalink.js        # RESERVED + 'pv'; encodeState({ view }), decodeState -> view
├── main.js             # `plot` becomes a RunSeries; `ghost` holds a RunSeries;
│                       #   renderTrace delegates to plate.js; view state; schemeHash
│                       #   takes a view and the shelf passes none
├── tour.js             # NOTES plate step; STORE -> shoebox-general-notes-v7
└── copy.js             # budgets for the chooser's in-view strings

scripts/
└── build-comfort.mjs   # NEW. Computes the §5.3.1 polygons by the Appendix B PMV
                        #   procedure and writes src/comfort.data.js (run by hand)

index.html, src/style.css   # chooser markup host and plate styles
.interface-design/system.md # five new patterns (gate 8)
docs/design-notes.md        # new section: "Seven ways to draw one run"
CLAUDE.md                   # short form of the above under Architecture
```

**Structure decision.** This is a single static web project with no `tests/`
tree. The work follows the existing split in two ways:

- **Pure modules apart from the DOM.** Arithmetic that Node harnesses must
  call directly lives in DOM-free modules (`readings.js`, `tm59.js`,
  `units.js` and the `permalink.js` codec). Drawing lives beside `main.js`.
- **Generated data files.** `comfort.data.js` follows the pattern of
  `rates.data.js` and `tm59.data.js`: a script under `scripts/` writes a data
  module, and the generated module is committed.

`plate.js` is new rather than more of `main.js`, because the renderer grows
from about 300 lines to an estimated 1,500 or more. It receives everything
through a `PlateFrame` argument, so it reads no module state from `main.js`.

## Phasing

The user stories are delivered in priority order. Each phase leaves the page
working, and each is verifiable on its own.

1. **Foundation (blocks everything).**
   - Build `RunSeries` and a ghost that holds a `RunSeries`.
   - Move the time series renderer into `plate.js`; its output must stay
     byte-identical (FR-002).
   - Add the `pv` codec, with the default writing nothing.
   - Add the humidity series and `KINDS.humidityRatio`.
   - Add the chooser, listing every view and its availability.
2. **US1, psychrometric (P1).**
   - Add `psychro.js`, `comfort.js` (graphic and adaptive regions),
     `build-comfort.mjs` and its data file.
   - Add the scatter renderer, nearest-hour pinning, the 90 % outline and
     "was → now".
3. **US2, series choice (P2).** Add the series toggles on the time series,
   the refusal of the last series, and unavailable series with their reasons.
4. **US3 to US6 (P3).** Adaptive comfort view, carpet with the change toggle,
   duration curve with the keyboard cursor, average day.
5. **US7 and US8 (P4).**
   - Add the daily ideal loads energy and the energy signature, with its
     reconciliation to the bill.
   - Add aggregation and zoom, and keep or release the zoomed range on a new
     run.
6. **Closing work.**
   - Update the general notes and bump the storage key.
   - Record the patterns in the design system.
   - Add the design-notes section.
   - Measure SC-001 and SC-002 and record both in the design notes.

## Post-design Constitution Check

The check was repeated after `data-model.md` and `contracts/` were written.

- **II.** The `pv` grammar (contracts/view-key.md) is canonical. Every field
  has one spelling, fields appear in a fixed order, a field at its default is
  omitted, and anything else refuses the link. The encoder cannot write a
  value the decoder refuses; the harness asserts this over every reachable
  setting.
- **III.** `readRunSeries` takes the document as an argument and reads the
  elevation and the cooling predicate from it (data-model.md, `RunFacts`).
- **IV.** `Availability` is a closed type: either `Available`, or
  `Unavailable` with a reason and an optional remedy. The chooser draws from
  it alone, so there is no path by which it silently substitutes a view.
- **VI.** The reporting contract adds two hourly series on every sheet run
  and two daily series with System in the path. The measurement recorded in
  `model.js` (15 to 173 series took the annual run from 681 ms to 2,984 ms)
  prices a series at about 14.6 ms. That figure was dominated by per-surface
  expansion and parsing, so it is an upper bound. On it the two hourly series
  cost about 29 ms, roughly 4 % of the annual run, inside the 5 % budget. The
  two daily series carry 365 values each, against 8,760 for an hourly series,
  and are negligible. The demand series are Daily rather than Hourly for this
  reason and because the signature reads only daily totals (research.md §R6).
  SC-002 is still measured interleaved A/B before the phase closes.

All gates still pass.

## Complexity Tracking

No constitution violations to justify.
