# Contract: `src/survey.js`

**DOM-free, engine-free, network-free**, by the rule `readings.js`, `describe.js` and
`tm59.js` already follow, so the Node harness calls the real functions rather than a
copy of them.

## Exports

### `makeSurvey({ x, y, quantities, stance, patch, annual }) -> Survey`

Throws on the declaration errors listed in data-model.md: the same control on both
axes, zero or more than two quantities, a quantity not on the roster, an axis whose
control declares no numeric face, an axis on a priced channel.

### `axisFor(key, { from, to, count, stance }) -> Axis`

Snaps `positions` to the control's own step grid and forces the stance's own value
into the list, reusing `samplePoints`'s tolerance rule (anything closer than a
thousandth of a step is one position, and the current value survives the collision).
Throws with `samplePoints`'s existing sentence where the control has no face.

### `rowsFor(survey) -> StudyJobSpec[]`

The whole point of the module. Returns one spec per row, shaped for `makeStudyJob`:

```
{ key: survey.x.key,
  snapshot: { ...survey.stance, [survey.y.key]: yValue },
  patch, epw, annual, quantity, needed, carried,
  restShape, points: survey.x.positions, order, origin, asked }
```

**Contract**: the caller passes these to the existing `makeStudyJob` and
`scheduler.enqueue`. This module never touches the scheduler, the pool or the
document.

### `landPoint(survey, { ix, iy, sample }) -> Survey`

Records a `SpotHeight` where the sample carries a reading, a `Gap` carrying a reason
where it does not. Never fills a gap from a neighbour.

### `coverageOf(survey) -> Coverage`

Asserts `measured + gaps + unsurveyed === wanted`.

### `latticeOf(survey) -> { values, mask, nx, ny }`

A flat `Float64Array` of readings and a parallel `Uint8Array` validity mask. The one
representation both the contours and the relief consume, so the two drawings cannot
disagree about the shape of the ground.

### `contoursOf(lattice, levels) -> Polyline[]`

Marching squares. Saddle cases 5 and 10 resolved by the cell mean, consistently.
Emits no segment for any cell whose mask is not fully set.

### `meshOf(lattice) -> { positions, indices, measuredFlags }`

Indexed triangles for the relief. A cell is emitted only where all four corners are
measured, so holes are structural rather than styled. `measuredFlags` marks vertices
that are real samples so the relief can stand a post on each (FR-018j).

### `improvingRegion(survey, stance) -> SpotHeight[]`

Measured points where every chosen quantity improves on the stance (FR-030). Returns
spot heights only. Names no optimum.

### `freeExchange(survey, stance) -> { dx, dy, tolerance } | Refusal`

The exchange along the level line (FR-029). Refuses with what would fix it where the
surrounding lattice is too coarse to state it honestly, rather than computing off a
coarse grid with false precision.

### `fallStep(survey, from) -> SpotHeight | { stopped: reason }`

One step of the descent (FR-035). Returns a *measured* neighbour only, never an
interpolated position (FR-033). Stops with a reason when no measured neighbour
improves, and detects the two-point oscillation (edge case).

## Invariants the harness asserts

1. No function returns a figure that did not come from a `SpotHeight`.
2. `meshOf` emits no triangle touching a gap or an unsurveyed position.
3. `coverageOf` sums to `wanted` for every reachable lattice.
4. `contoursOf` and `meshOf` agree: every contour segment lies inside an emitted cell.
5. `fallStep` never returns a point worse than `from`.
