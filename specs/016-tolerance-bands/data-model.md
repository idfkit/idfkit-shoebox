# Data model: Tolerance bands

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All entities live in `src/tolerance.js`. That module is DOM-free and network-free, so a Node harness drives the real code. Every class is frozen on construction. None is stored, encoded in the link, or kept in a scheme. Each is rebuilt from a study's curve and the chased preset every time it is read.

## Inputs (existing, not changed)

| Source | What a band reads from it |
| --- | --- |
| `Preset` (`schemes.js`) | `targets`, filtered to `limit != null` for judging, and `name` |
| `Target` (`schemes.js`) | `meets(value)`, `limit`, `label`, `asks`, `unitNow`, `digits` |
| `Reading` (`survey.js`) | `valueOf(readings)`, matched to a target by `readingForTarget` (new export, R2) |
| study curve point (`scheduler.js` `pointAt`) | `value`, `readings`, `sample` (null when the run failed), `refused` |
| control declaration (`controls.js`) | `min`, `max`, `format`, `spanKind`, `spanUnitNow` |

## `Verdict` (per point)

The classification of one sampled position against the judged targets.

| Field | Type | Meaning |
| --- | --- | --- |
| `value` | number | the lever's position |
| `kind` | `'pass' \| 'fail' \| 'refused' \| 'gap' \| 'unsolved'` | see R3; `unsolved` is a position not yet landed |
| `failing` | `Target[]` | for `fail`, every failing target, worst ratio first; otherwise empty |
| `reason` | string \| null | for `refused`, the scheduler's sentence; for `gap`, the fixed run-failed sentence |

**Validation**:

- `kind === 'fail'` iff `failing.length > 0`.
- `refused` and `gap` never carry `failing`.

## `Edge`

One side of a band.

| Field | Type | Meaning |
| --- | --- | --- |
| `side` | `'lower' \| 'upper'` | |
| `inside` | number | the last passing position on this side |
| `outside` | number \| null | the first non-passing position, or null at a stop |
| `stop` | boolean | true when the band reaches the control's `min` / `max` |
| `closedBy` | `Verdict` \| null | the outward point's verdict; null at a stop |

**Validation**:

- `stop` iff `outside === null` iff `closedBy === null`.
- A `stop` edge's `inside` equals the control's `min` (lower) or `max` (upper).
- `inside` and `outside` are adjacent landed positions; nothing lies between them on the curve.

## `Band`

The tolerance band for one studied lever, under one chased standard.

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | string | the swept control key |
| `stance` | number | the snapshot's value of that key |
| `judged` | `Target[]` | the targets of the chased standard this curve can read (R6) |
| `unjudged` | `{ target, says }[]` | the rest, each with `targetBlock`'s reason or the standard's `asks` |
| `verdicts` | `Verdict[]` | one per curve position, in position order |
| `segments` | `{ from, to }[]` | the maximal passing runs |
| `band` | `{ lower: Edge, upper: Edge } \| null` | the segment containing `stance`, or the nearest one |
| `contains` | boolean | whether `band` contains `stance` |
| `tie` | boolean | the nearest segment was chosen between two equidistant ones (stated) |
| `share` | number \| null | the share of travel inside `band`, in [0, 1] |
| `move` | `{ to, by, share } \| null` | when `!contains`: the nearest passing position, the signed move, and its share of travel |
| `others` | `{ from, to }[]` | the passing segments other than `band` (FR-007) |
| `incomplete` | boolean | some positions are `unsolved` (still landing, or stopped) |
| `inert` | string \| null | why this lever cannot move any judged target, or null (research R12) |
| `coarse` | boolean | taken from the study |
| `steppedOver` | boolean | on a fine curve only: an edge computed over every position lies outside the bracket computed over the coarse-grid positions of the same curve (research R3). Always false on a coarse curve |
| `stale` | boolean | taken from the study's card state |

**Validation (asserted in the constructor):**

- `judged.length === 0` implies `band === null`, `inert === null`, and no verdict is `pass` or `fail`.
- `band === null && judged.length > 0 && inert === null` implies no verdict is `pass`. Every solved position fails: a lever that cannot restore compliance alone, which is US2 scenario 3 and a legitimate state, not an error.
- `inert !== null` implies `band === null`, `share === null` and `move === null`. An inert lever is never drawn as a band running to both stops (FR-012).
- `contains` iff `band.lower.inside <= stance <= band.upper.inside`.
- `contains` implies `move === null`; `!contains && band` implies `move !== null`.
- `share === (band.upper.inside − band.lower.inside) / (max − min)` when `band`.
- `others` never overlaps `band`.

## `RestoringMove`

Read across every `Band` of the chased standard on a failing desk.

| Field | Type | Meaning |
| --- | --- | --- |
| `failing` | `Target[]` | the targets the desk fails, read off the stance point of the current (non-stale) bands. When every band is stale, it is read off the most recently landed band, and `Tolerance.stale` marks the whole block as describing the previous desk |
| `lever` | `Band \| null` | the non-inert band whose `move.share` is smallest; null when none can restore |
| `alone` | `Map<Target, string[]>` | per failing target, the studied keys whose curve has a position clearing *that* target alone (US2 scenario 3) |
| `asked` | number | how many levers were studied |
| `tied` | string[] | keys sharing the smallest share, when more than one (stated, not chosen silently) |

## `Tolerance` (the block)

What `renderChase` letters under the chase line.

| Field | Type | Meaning |
| --- | --- | --- |
| `preset` | `Preset \| null` | the chased standard |
| `bands` | `Band[]` | one per studied lever, in study order |
| `passing` | boolean \| null | whether the stance passes every judged target; null when nothing is judged |
| `ranked` | `Band[]` | on a passing desk, the non-inert bands ordered by `share` ascending (least free first) |
| `inert` | `Band[]` | the bands with `inert` set, listed apart with their reasons; counted in `asked`, never ranked |
| `restore` | `RestoringMove \| null` | on a failing desk |
| `absence` | string \| null | why there are no bands: no chase, no study, a standard with no line, nothing judged, or the climate changed |
| `stale` | number | how many bands are stale |

## State transitions

Nothing in this module holds state. The transitions belong to the inputs and are listed so the tasks cover each.

| Event | Existing path | Band consequence |
| --- | --- | --- |
| study turned on, or a point lands | `onStudyUpdate` → `desk.setStudy` | that card's band recomputed; block re-rendered |
| desk moves | `applyGeometry` cancel, card `stale` | band drawn stale; block counts it |
| re-sweep lands | `refreshStudies` / `densifyStudies` | band recomputed, `stale` cleared, coarse → fine |
| study stopped or set aside | `studyRun` / set-aside | band `incomplete` |
| study cleared | `clearAllStudies` / remove | band gone; block re-counts |
| chase on, off or switched | chase click → `renderChase` + every card | all bands re-read; no run |
| priced commit | `redrawStudiesForQuantity({ queue: false })` | bands follow the re-minted curves |
| climate attached | `attachClimate` clears studies | block letters the climate reason until the next study lands |
| SI ↔ IP | `reletterSheet` → `reletter()` | figures re-lettered; no recompute needed, no run |
