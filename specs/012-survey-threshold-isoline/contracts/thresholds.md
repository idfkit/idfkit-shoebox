# Contract: the threshold surface of `src/survey.js`

This project exposes no HTTP API and no CLI. Its contracts are the module surfaces the
rest of the sheet draws from, and the invariants those modules throw on at load. This
file states the surface added by feature 012 and the drawing contract `src/main.js` and
`src/relief.js` hold to.

`src/survey.js` stays **DOM-free and network-free**, so a Node harness calls every
function below directly. That is the whole reason the arithmetic lives there.

---

## Added to `src/survey.js`

### `export class Threshold`

Frozen. Constructed only by `thresholdsFor` and by the load-time assertion pass. Fields,
getters and throws are specified in [data-model.md](../data-model.md#threshold).

```js
new Threshold({ preset, target, reading })
threshold.limit          // → number, a getter onto target.limit
threshold.passesBelow    // → boolean, probed from target.meets
threshold.passes(value)  // → boolean | null, delegates to target.meets
threshold.figure()       // → string, lettered through reading.figure, no unit
threshold.label          // → `${preset.name} · ${target.label}`
```

### `export class ThresholdSet`

Frozen. `lines` and `absence` are mutually exclusive and jointly exhaustive; the
constructor throws if both or neither is set.

### `export function thresholdsFor(reading, { chased = null } = {})`

→ `ThresholdSet`

- `reading` is `survey.readings[0]`, the reading the ground's height is (research R-11).
- `chased` is a preset id or `null`. The survey module learns nothing else about page
  state; the caller passes it, exactly as `improvingRegion` is passed the stance.

**Behaviour**

| `chased` | Result |
| --- | --- |
| `null` | every applicable threshold, ordered by limit ascending then by preset name (FR-012) |
| a preset id with a limit for this reading | that preset's thresholds alone (FR-013) |
| a preset id with no limit for this reading | `lines: []`, `absence` naming the chased standard (FR-014) |
| any value, reading carries nothing | `lines: []`, `absence` naming why (FR-005) |

Pure. No cache, no DOM, no clock, no randomness — the same inputs give the same set, so
FR-015 ("nothing left over from the prior chase state") is a property of the function
rather than of a clean-up path.

### `export function passingGround(lattice, threshold)`

→ `PassingGround`. Cell polygons and boundary segments in **lattice coordinates**,
fractional indices; the caller maps them to the page. Emits nothing for a cell whose
mask is not full (FR-004). Sets `wholly` when the line crosses no measured ground
(FR-007).

### `export function thresholdLevels(set)`

→ `number[]`, the distinct limits in the set, coincidence-collapsed
(`max(1, |limit|) * 1e-9`). Used by the plan to suppress a coincident ordinary contour
and by the relief to place its level lines.

### `export function thresholdAbsence(reading, { chased })`

→ `string | null`. The sentence, so the key, the plan caption and the aria label all
state the absence in one wording rather than three.

---

## Drawing contract — `src/main.js`

`drawGround(sv)`:

- draws each distinct threshold as one isoline (`contoursOf(lattice, [limit])`) at
  `--ink` weight with its own chain-dash signature, distinct from `.contour` and from
  `.contour.major` (FR-002);
- labels each line with its standard(s) and its limit, and **pushes that label into the
  existing `lettered` collision list** before any contour label is placed, so a
  threshold label can never print over a spot figure and no spot figure is covered
  (FR-010);
- drops the ordinary contour level within `step / 10` of a drawn threshold (FR-002,
  US2 scenario 2), and only there — `levels` itself is unchanged for the relief;
- fills each `PassingGround` with its own hatch pattern, at an angle distinct from the
  improving region's 45° and from the other bands' (FR-003);
- draws the band **under** the contours, the spot ticks and the stance, in that order,
  so nothing existing is covered (FR-010).

`renderGroundKey(sv)`: one entry per drawn threshold, naming the standard, the criterion
in the publisher's own words and the pass condition — worded as "meets *this standard's*
published threshold" and never as a recommendation or a combined verdict (FR-011). The
absence sentence, and the `wholly` sentence, stand here too (research R-9).

`surveyAriaLabel(sv)`: carries the same facts in the same words.

The chase click handler calls `renderSurveySoon()` (FR-015).

## Drawing contract — `src/relief.js`

`relief.draw({ …, thresholds })` where `thresholds` is
`[{ limit, passesBelow, segments }]` in lattice coordinates:

- each threshold's segments are drawn as 3-D lines at `z = limit`, standing a hair proud
  of the surface, under their own `uMode`;
- the passing band is a fragment-shader branch on `vHeight` against the limit, drawn as
  a screen-space stipple rather than a tint;
- both appear at the same position relative to the surveyed ground as on the plan
  (FR-006), and neither can reach ground the mesh does not span (FR-004).

---

## Invariants asserted at module load

Throw naming the declarations on both sides. Listed in full in
[data-model.md](../data-model.md#the-four-invariants-that-throw-at-module-load): kind
agreement, qualifier match, pass side, `needs` implication.

## Contracts explicitly **not** changed

- **The permalink codec.** No key added, `LINK_VERSION` unchanged, no `MIGRATIONS` step,
  `DEFAULTS_BY_VERSION` untouched. The chase stays off the link as it already does.
- **`shapeKey` and the scheduler.** No new parameter, no new run, no `Output:*` object,
  no change to what any sample costs.
- **`applyModel` and the IDF.** Nothing in this feature reaches the document.
- **`Coverage`.** Its sum assertion and its three states are untouched; the band is
  drawn from the same mask.
