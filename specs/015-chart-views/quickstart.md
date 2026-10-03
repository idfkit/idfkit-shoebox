# Quickstart: verifying Chart Views on the Plate

**Feature**: `015-chart-views` | **Date**: 2026-09-29

The repository has no test runner. The feature is verified in four ways:

- Node harnesses under the gitignored `.harness/`;
- EnergyPlus 26.1.0;
- the idfkit MCP validation tools;
- driving the page.

Each section below states what to run and the expected outcome. The data
model and contracts are the reference for the objects named here.

## 0. Prerequisites

```bash
npm install
npm run dev          # stages the engine, schemas and station index; serves localhost:5173
```

- EnergyPlus 26.1.0 is at `/Applications/EnergyPlus-26-1-0`.
- Without a local EnergyPlus, use the WebAssembly engine under Node, one run
  per process (CLAUDE.md, "Verifying changes").

## 1. Reporting (contracts/reporting.md)

Harness: `.harness/views-reporting.mjs`.

1. Build the document from `src/model.js` at two desks: the default, and
   System in the path.
2. Apply `applyModel` three times and write the IDF each time.
   **Expected:** the three writes are byte-identical.
3. Run each IDF through `load_model`, `validate_model`,
   `check_model_integrity` and `run_simulation`.
   **Expected:** no severe errors.
4. Grep `eplusout.err` for `requested but not generated`.
   **Expected:** no match.
5. Look for the added variables in `eplusout.rdd` and the ESO.
   **Expected:**
   - The default desk carries the two humidity series.
   - The System desk also carries the two daily ideal loads series.
   - The default desk carries no ideal loads series.
6. Take the System desk's year run and compare the daily sums with the
   meters.
   **Expected:**
   - Σ `heat` equals the `Heating:DistrictHeatingWater` total, and Σ `cool`
     equals the `Cooling:DistrictCooling` total, each within 1e-6 relative.

## 2. Solve cost (SC-002)

Harness: `.harness/views-cost.mjs`, which runs interleaved A/B with 10 pairs
and one engine per process, on a year run.

- Run it on the default desk.
- Run it again with System in the path.

**Expected:** the median of B is at most 1.05 times the median of A in both
cases. Record the figures in `docs/design-notes.md`.

## 3. Link codec (contracts/view-key.md)

Harness: `.harness/views-link.mjs`, which imports `src/permalink.js` and
`src/views.js` directly.

1. For every reachable `ViewSetting`, check the round trip in both
   directions.
   **Expected:** `decodeView(encodeView(s))` deep-equals `s`, and the
   re-encoded text is unchanged.
2. Encode the default desk with `encodeState`, at `view = DEFAULT_SETTING`
   and at `view` omitted, and compare with a fragment captured from `main`
   before the change.
   **Expected:** all three are byte-identical (SC-004).
3. Decode one fixture for each refusal rule 1 to 8.
   **Expected:** each refuses the whole link, and the message names the rule.
4. Decode `pv=sig` on a desk with System bypassed.
   **Expected:** it decodes. Refusal happens at availability, not in the
   codec.
5. Save a kept scheme while the view is `psy`, switch to `ts`, and restore
   the scheme.
   **Expected:** the stored hash carries no `pv`, and the view remains `ts`
   (FR-024).

## 4. Readings agree with direct counts (SC-003)

Harness: `.harness/views-counts.mjs`. It solves a year run with a south
opening and Gains in the path, reads the ESO into a `RunSeries` with
`readRunSeries`, and compares each reading below with a count taken directly
from the hourly arrays with plain loops written in the harness.

1. `graphicShares` against a loop over occupied hours applying `inside()` to
   (operative temperature, humidity ratio).
2. `adaptiveCounts` for every model. The unassessed and out-of-scope counts
   must be included, and the five counts must add up to the occupied hours.
3. `hoursAtOrAbove` at 26 °C and at 18 °C, against a direct count on `air`.
4. `averageDay` against a per-month, per-hour mean. Months the run does not
   cover must be absent.
5. `dailySignature` sums against the meters from step 1.6.
6. The `tm59` readings before and after the `runningMean` period argument.

**Expected:** every pair agrees exactly (integers) or to 1e-9 (means), and
`.harness/comfort-line.mjs` still passes unchanged.

## 5. Declarations throw at load

Harness: `.harness/views-declarations.mjs`. Import the modules, then import
patched copies with one invariant broken each:

- a duplicate view id;
- selectable series of mixed kind;
- an EN offset disagreeing with `tm59.CATEGORIES`;
- a comfort polygon shifted by 1 K;
- a `SeriesDef` whose kind is not in `KINDS`.

**Expected:** each patched import throws and names the declaration.

## 6. Driving the page

Open `http://localhost:5173/` and solve a year run: set months on the Run
strip and attach a station.

| Step | Expected |
|------|----------|
| Load with no fragment | The plate is identical to `main`: same curves, labels, datums and marker (FR-002). |
| Choose Psychrometric | Saturation and RH curves, zone and outdoor marks differing in shape, two cited graphic zones, one share per zone. No solve in the status line (US1). |
| Choose the adaptive region with System in the path | Listed as unavailable with the §5.4 reason (US1 2b). |
| Bypass System, choose the adaptive region | Strip labelled with the reading hour's day. Counts include unassessed and out of scope (US1 2a). |
| Click a zone mark | The reading hour pins to that mark's hour. The rail's pin agrees (US1 3). |
| Switch SI and IP | Axes re-letter in g/kg and gr/lb. No mark moves and no solve starts (US1 4). |
| Drag Insulation | A 90 % outline of the starting cloud stands, and the shares read `was → now` (US1 5). |
| Time series: turn on Operative, turn off Outdoor, then try to turn off Operative | Exactly the chosen series are drawn. The last one is refused with a reason (US2). |
| Carpet, then drag, then "change" | A signed difference carpet lettered in K (or Δ°F). The toggle disappears after the ghost clears (US4 4). |
| Duration curve, focus the plate, press Right and Page Down | The cursor moves and the value and hour count are lettered in view (US5). |
| Average day | One profile per covered month. The reading hour is stated as its month and hour (US6). |
| Energy signature with System in the path | Daily marks. The totals equal the bill's heating and cooling (US7). |
| Time series, daily aggregation | One point per day. The range preview under the chart draws the whole run at daily means (US8). |
| Drag the preview's start handle to 12 Jul, then focus its end handle and press Home and Right seven times | The chart draws every hour of 12 to 19 July; each handle stops at the other, and the link reads `z-0712_0719` (FR-018a). |
| Drag the window | The range keeps its length and stops at the run period's edge (FR-018d). |
| On a January and July run, drag the window across the break, then tap in January | The window moves whole into July, then back to January, centred on the tap (FR-018d). |
| Count `history.replaceState` calls over one drag | Exactly one, on release (FR-018c). |
| Press "Whole run" | The whole run in one action; `pv` leaves the link and the keyboard goes to the preview's window (US8). |
| Copy the link on psychrometric, open it in a new window | The same view and region (SC-004). |
| Start a study, then switch views five times | The study continues and is not cancelled (FR-003). |
| Switch to a design-day run on Carpet | The carpet is refused in place with the reason, with no fallback to the time series (Edge Cases). |

Background tabs starve `requestAnimationFrame` (CLAUDE.md). Keep the tab
visible while reading any figure.

## 7. Width and hover (SC-006, Principle VII)

In device emulation at 390 × 844, repeat the table in section 6 for each view.

**Expected:**

- no horizontal page scroll;
- the chooser wraps and every unavailable reason is visible;
- the duration reading is reachable by tap;
- nothing is conveyed only by a `<title>` or on hover.

## 8. Redraw budget (SC-001)

1. Open `http://localhost:5173/?measure` on a year run.
2. Switch between each view pair 10 times.
3. Read the `plate-draw` measures from the console helper.

**Expected:** the median is under 150 ms unthrottled on the development Mac,
and under 500 ms with Chrome's 4× CPU slowdown. Record both figures in
`docs/design-notes.md`.

## 9. Closing checks

- **General notes.** The plate step in `src/tour.js` `NOTES` teaches the
  chooser, and `STORE` reads `shoebox-general-notes-v7`.
- **Design system.** `.interface-design/system.md` records the five patterns
  named in `plan.md`.
- **Documentation.** `docs/design-notes.md` has the section "Seven ways to
  draw one run", and `CLAUDE.md` has its one-paragraph short form.
- **Build.** `npm run build` succeeds, which is the whole rehearsal a
  consumer build performs.
