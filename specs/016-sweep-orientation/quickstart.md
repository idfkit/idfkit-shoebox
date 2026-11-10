# Quickstart: verifying orientation sweeps

There is no test runner. Each gate below is a throwaway Node harness under the
scratchpad that calls the real DOM-free modules, or the driven page. The interfaces
being checked are in [contracts/orientation-sweeps.md](./contracts/orientation-sweeps.md).

## Prerequisites

```bash
npm install
```

```bash
npm run build
```

`build` stages the engine, the schemas and the station index. Outside the browser, the
schema comes from `localBundle()` in `@idfkit/schemas/node`, loaded with `load('26.1.0')`.
Use one EnergyPlus per process (CLAUDE.md, "Verifying changes").

## Gate 1: the model at all sixteen positions (spec Assumptions, SC-003)

For North axis at each fine position (0, 23, 45, 68, 90, 113, 135, 158, 180, 203, 225,
248, 270, 293, 315, 338), on the default desk and on a desk glazed on one wall with
overhangs, fins, a rooflight and a context slab:

1. Build with `applyModel` three times and assert the IDF bytes are identical.
2. Assert `turnOf(geometryFacts(doc))` equals the position to within 0.01°.
3. Run `validate_model`, `check_model_integrity` and `run_simulation`. Grep the error
   file for a surface deleted by the 0.01 m vertex merge and for "requested but not
   generated".

**Expected:** 32 clean runs, and every turn read back equals the one asked.

## Gate 2: 360, fractions and the link (FR-004, SC-005, research R4)

1. Decode `#v1&northAxis=360`. **Expected:** the default desk, with `northAxis` 0.
2. Build that desk and the desk turned to 360 *before the change* (from `git stash`).
   Report whether the IDF bytes differ, and by what. This is the measurement R4 asks
   for, and the result is recorded in the design notes.
3. Decode `#v2&northAxis=360` and `#v2&northAxis=-1`. **Expected:** both are refused
   whole, with the range sentence.
4. Decode `#v1&northAxis=12.5` and `#v2&northAxis=12.5`. **Expected:** both give 12.5.
5. Round-trip every key through `encodeState` / `decodeState` at `v2`.
6. Decode a corpus of `v1` links (the kept-scheme fixtures and every link in
   `docs/` and the changelog) and assert each gives the same desk and the same IDF as
   at `d1e1f0d`.

## Gate 3: the grid (FR-005, FR-006, research R2 and R3)

- `samplePoints(northAxis, 0, 8)` gives `[0, 45, …, 315]`.
- With 16 it gives the sixteen positions above, and the eight are a subset of them.
- Each position's `format` ends in a distinct one of the 16 compass names.
- `samplePoints(northAxis, 350, 8)` holds 350 once, between 315 and 360.
- `samplePoints(northAxis, 0, 8, { from: 300, to: 60 })` runs clockwise from 300 through
  0 to 60 (FR-014).
- `samplePoints(ctxAzimuth, …)` still throws the faceless sentence.

## Gate 4: the study card (US1, FR-007 to FR-010)

Drive the page on the default desk.

1. Open Study on North axis and choose cooling demand.
   **Expected:** the coarse pass runs 8, the fine pass adds 8, and the curve closes at
   the right edge.
2. Turn the rose by hand to 135°, 338° and 0°. **Expected:** the sheet letters the
   figure the curve plotted at each (SC-003).
3. Set North axis to 350.
   **Expected:** the redline stands between 338 and the right edge, and nothing is
   pulled to an end.
4. Read the extremes line. **Expected:** bearings with compass points.
5. Switch to IP and diff the bearing figures on the card. **Expected:** character for
   character the same (SC-006).
6. Bypass Fabric and repeat step 1. **Expected:** the study still runs; the turn
   reaches every surface.
7. Force a failure at one position (a harness that throws in `buildSample` at 180).
   **Expected:** a gap with its reason, and closure is kept or broken as R5 says.

## Gate 5: the survey (US2, FR-011 to FR-014, SC-004)

Run three stances: even glazing, south-only at 0.6, and south-only with an overhang.
For each, cut North axis against south glazing ratio.

- In `contoursOf`, every polyline that reaches x = `count` continues from x = 0 at the
  same y. In `meshOf`, the vertex column at `count` equals column 0. Every isoline is
  closed across north.
- `Coverage.wanted` is 8 × 6 coarse and 16 × 11 fine, and `measured + gaps` never
  exceeds it.
- Cut a narrowed survey from 300 to 60. **Expected:** positions run through north, and
  the stance at 10 stands inside.
- Round-trip the `sv` of each survey, and open it in a fresh page. **Expected:** the
  same ground.

## Gate 6: the pull (US3, FR-015 as amended)

Run the pull on the default desk at North axis 350.

**Expected:** a probe at 8, the effect divided by +18, the entry lettering
"Turned 18° clockwise", and no "at its stop".

## Gate 7: the load assertions and the budgets

Import every module under Node.

**Expected:**
- The `Wrap` assertions pass.
- `CONTROL_NOTE` holds for the reworded North axis note.
- The `copy.js` budgets hold for every sentence in the contract's table.
- A second `Wrap` declared in a scratch copy throws.
