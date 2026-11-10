# Contract: orientation sweeps

The changed interfaces, by module. The page exposes no API. This contract is between
modules, and it is what the Node harnesses in [../quickstart.md](../quickstart.md)
call. Each function keeps its name. Behaviour that is not listed here does not change.

## `src/controls.js`

- `export class Wrap({ step })` is frozen, with `norm`, `arc`, `ahead`, `signed` and
  `positions` (see data-model).
- `Bearing({ …, wrap = null })`: with a `wrap`, it carries the members listed in
  data-model. Without one, it is byte-for-byte today's class.
- `refuses(control, v)` for a wrapping Bearing returns
  `'is outside its 0–360 range, and a full turn is 0'` when `v < 0 || v >= 360`, and
  null otherwise. Fractions are admitted.
- The `northAxis` declaration gains `wrap: new Wrap({ step: 1 })`. Its `note` is reread
  against `CONTROL_NOTE` and may say that a study runs the whole turn.

## `src/study.js`

- `refusesSweep(control)` is unchanged. It is the one rule (FR-003).
- `studyCounts(control) → { coarse, fine }`.
- `samplePoints(control, current, n, { from, to })` delegates to `wrap.positions` when
  `control.wraps`. The stance is inserted verbatim and deduplicated against its
  neighbours by circular distance (so 359.9995 against 0 is one position).
- `sampleOrder(points, current)` for a whole turn takes 0, then 180 (the opposite
  point, not `n − 1`), then the stance, then bisects circularly. Nearness to the stance
  is circular distance.
- Load assertion: the nesting and coincidence invariants of `Wrap` (data-model).

## `src/model.js`

- `export function turnOf(facts) → number in [0, 360)`, read off the plan's south wall.
  It throws "the model has no south wall to read a turn off" where there is none.

## `src/scheduler.js`

- A point carries `turn` when `buildSample` returned one. When `|signed(turn, asked)|`
  exceeds 0.01 the point is a failure with the reason
  `the document turned to ${format(turn)}, not ${format(asked)}`.

## `src/main.js`

- `buildSample` returns `turn: turnOf(geometryFacts(model))` while the overlay stands,
  beside `floorArea`, when the job's key wraps.
- Every coarse and fine count is asked through `studyCounts` or `gridCounts` of the
  job's or axis's control (the call sites are listed in research R2).
- `axisOffers` admits North axis. The faceless heading names "the neighbour's bearing".
- `extentField` accepts `from > to` on a wrapping axis. It refuses `from === to` with
  "The same bearing at both ends is no extent."
- The keyboard cursor on a closed axis wraps.
- `amountOn` letters a wrapping axis's difference through `spanKind`, signed.
- The trade sentence letters bearings through `formatValue`, unchanged.

## `src/console.js`

- `buildBearing` with a `wrap` registers `rows`, `probes`, `studySweeps` and a
  `studyOffer`. Its face composes with any face already registered under the key.
- `studyCard` on a wrapping control:
  - draws the seam point;
  - draws ticks at the eight principal points;
  - letters `0° N` at the left foot and `N, again` at the right;
  - carries the caption *the whole turn; wraps at north*;
  - letters one extremes line (research R13);
  - maps a click at the right edge through `valueAt` to 0.

## `src/survey.js`

- `gridCounts(control)`.
- `axisFor(key, { from, to, count, stance })` accepts `from > to` on a wrapping
  control. It refuses `from === to`. `0, 360` is a whole turn.
- `Axis` gains `closed`, `cells`, `next`, `offset` and `at`. `indexOf` uses the
  axis's own step.
- `standingAt`, `surfaceAt`, `standingRefusal` and `freeExchange` measure by `offset`
  and wrap on a closed axis.
- `contoursOf`, `meshOf`, `blockOf`, `strataOf`, `arrisesOf`, `passingGround`,
  `fallStep` and `refineOrder` iterate `cells` and step by `next`. `meshOf` emits the
  aliased vertex column.
- `refusesAxis(key)` is unchanged. It still delegates to `refusesSweep`.
- `Coverage` is unchanged. Its sum assertion is the check that north is counted once.

## `src/relief.js`

- The scale's x and y denominators are `axis.cells`.
- `letterAxes` letters the principal points on a wrapping axis and the word "wraps".
- The far corner staff on a closed axis is north again, lettered as such.

## `src/pull.js`

- A wrapping control steps `norm(here + 18)`, clockwise, and divides by +18.
- `PullEntry({ wraps })`: `room` is null and the stop invariant is skipped.
- `roomSaid` letters "turned 18° clockwise".

## `src/permalink.js`

- `LINK_VERSION = 'v2'`, `DEFAULTS_BY_VERSION.v2` and `MIGRATIONS.v1` (data-model).
- `sty` admits North axis by `refusesSweep`, as before.
- `decodeSurvey` reads a wrapping axis's extent by the rule in data-model. The order
  of checks is kept: unknown names, then pairings, then extents.

## `src/describe.js`

- The bearing branch of the distance test precedes the `fraction` branch.

## Refusal and absence sentences (all within budget, all in view)

| Where | Text | Budget |
| --- | --- | --- |
| link, `v2` | `northAxis is 360, and it is outside its 0–360 range, and a full turn is 0` | STANDING |
| extent field | `The same bearing at both ends is no extent.` | STANDING |
| failed point | `the document turned to …, not …` | ABSENCE |
| card caption | `The whole turn; wraps at north.` | STRIP_LINE |
| pull entry | `Turned 18° clockwise.` | ABSENCE |
