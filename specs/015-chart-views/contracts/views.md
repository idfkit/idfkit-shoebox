# Contract: the view registry and the plate frame

**Owners**: `src/views.js` (DOM-free) and `src/plate.js` (DOM).
**Requirements**: FR-001 to FR-005, FR-009 to FR-022, SC-001, SC-003, SC-005,
SC-006.

## 1. Module surfaces

### `views.js` (DOM-free, importable from Node)

```text
VIEWS: readonly View[]                  // FR-001 order; VIEWS[0].id === 'ts'
SERIES: readonly SeriesDef[]
DEFAULT_SETTING: ViewSetting
availabilityOf(view, facts): Available | Unavailable
settingFor(setting, patch): ViewSetting          // validates; throws on violation
encodeView(setting): string | null               // null at DEFAULT_SETTING
decodeView(text): ViewSetting                    // throws a refusal naming the rule
aggregate(values, points, grain)
durationCurve(values) -> Float64Array             // sorted descending, NaN excluded
hoursAtOrAbove(sorted, value) -> integer
averageDay(run, id) -> Map<month, Float64Array(24)>
carpetGrid(run, id, bins) / carpetChange(run, ghost, id, bins)
dailySignature(run) -> { days: [{ tOut, heat, cool }] }
densityOutline(marks, grid, share = 0.9) -> Polyline[]
nearestHour(index, x, y) -> hour index | null
```

### `comfort.js` (DOM-free)

```text
ADAPTIVE_MODELS: readonly AdaptiveModel[]
REGIONS: { graphic: ComfortRegion, adaptive: ComfortRegion }
yearRunningMean(dailyMeans, source) -> RunningMean  // tm59.runningMean over the file
graphicShares(run) -> [{ clo, inside, occupied }]
adaptiveCounts(run, model, trm) -> { above, within, below, unassessed, outOfScope }
```

### `psychro.js` (DOM-free)

```text
standardPressure(elevationM) -> kPa
saturationPressure(tC) -> kPa
humidityRatio(pwKPa, pKPa) -> kg/kg
rhCurve(phi, pKPa, tFrom, tTo, step) -> [t, W][]
inside(polygon, x, y) -> boolean
```

### `plate.js` (DOM)

```text
drawPlate(host, frame: PlateFrame): void
```

`drawPlate` reads only `frame` and its arguments. It computes no reading it
does not receive from, or delegate to, `views.js` and `comfort.js`.

## 2. Behavioural contract

1. **No solve.** No function in either module calls `commit`, `applyModel`,
   `applyGeometry`, `schedule` or any solve path. `main.js` routes a setting
   change to `redrawPlate()` and `updatePermalink()` only (FR-003). The
   harness asserts that the solve counter and the study queue are unchanged
   across a sequence of view changes.
2. **Default fidelity.** At `DEFAULT_SETTING` with no ghost, `drawPlate`
   produces SVG whose serialisation equals today's `renderTrace` output for
   the same run and size, attribute for attribute (FR-002). The comparison
   is made once, before the old renderer is deleted, and the captured SVG is
   kept in `.harness/` as the fixture.
3. **Unavailable views.**
   - The chooser lists every view in `VIEWS`.
   - An `Unavailable` view is listed with `aria-disabled="true"` and its
     reason in view, next to or under it at 390 px, never in a tooltip
     (FR-004).
   - When the chosen view is `Unavailable`, the plate draws the reason and
     remedy in place of the field, and never another view (SC-005).
4. **Stale state.** When `frame.stale` is set, the plate carries the existing
   `stale` class and draws the last run. It never blanks (FR-020).
5. **Ghost.**
   - The ghost is drawn only when `frame.ghost` is present, in the form the
     view declares: lines, an outline, or a change toggle.
   - Every count or share the view letters reads `was → now` while it
     stands.
   - The change toggle is present only when a ghost stands. It is removed,
     and `change` is reset, when the ghost clears (FR-020a to FR-020d).
6. **The reading hour.**
   - On views with `placesHour`, the reading hour is marked in the armed
     square idiom. A click on an hour-identifiable mark calls `on.pin(at)`.
   - Arrow keys step the hour and Enter pins it.
   - `avg` and `sig` letter that a single hour cannot be placed. `avg` marks
     the reading hour's month and hour of day (FR-019, US6 scenario 2).
7. **Duration cursor.** On `dur`, a tap, a click, Left, Right, Page Up, Page
   Down, Home or End sets a cursor. The plate letters the value and the hours
   at or above it for each drawn series, in view, and announces them through
   a polite live region. No reading is attached to hover alone (FR-015).
8. **Units.**
   - Every figure goes through `letter` or `figureIn` with the declared
     kind.
   - Differences use `deltaKindOf(kind)`.
   - A unit switch calls `drawPlate` again with the same frame, without a
     solve (FR-021).
9. **Accessibility.**
   - The root `<svg>` has `role="img"` and an `aria-label` from
     `view.describe(frame)`, naming the view, its axes and its principal
     reading (FR-022).
   - Zone and outdoor marks differ by shape and label as well as ink.
   - Carpet bins are lettered in a legend.
10. **Layout.**
    - At widths below the `--index` threshold, the chooser wraps and the
      right gutter labels move under the field.
    - No element is wider than the host (SC-006).
11. **Budget.** On a year run, `drawPlate` for any view completes in under
    150 ms, as the median of 10 on the development Mac unthrottled, and in
    under 500 ms in Chrome with 4× CPU slowdown (SC-001, research.md §R12).

## 3. Refusal wording

These are the strings each `Unavailable` case letters. Each is at most one
line, within the copy budget of `src/copy.js`.

| Case | Reason | Remedy |
|------|--------|--------|
| A year-only view on a design-day run | "Needs a run over the weather file." | "Set months on the Run strip." |
| Humidity series absent | "This run reports no humidity ratio." | none |
| The signature with System out of the path | "Needs System in the path." | "Patch System in." |
| The adaptive region with cooling | "ASHRAE 55 §5.4 excludes mechanically cooled spaces." | "Bypass System or remove its cooling setpoint." |
| No running mean | The weather source's own `ABSENCE` reason. | The same reason's remedy. |
| Part-year file | `ABSENCE.fileSeason` | as stated there |
| The last series turned off | "At least one series must be drawn." | none |
