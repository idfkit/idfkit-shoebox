# Data model: Sweep the building's orientation

Phase 1 for [plan.md](./plan.md). The design behind these entities is in
[research.md](./research.md). Every entity is a frozen instance or a member of one.
Nothing new reaches `params` or the IDF.

## Wrap (`src/controls.js`)

The spec's *wrapping range*: a face whose highest position is followed by its lowest.

| Field | Type | Rule |
| --- | --- | --- |
| `step` | number > 0 | The grid positions snap to. North axis declares 1. |
| `period` | 360 | Fixed. The only wrapping quantity on the desk is a bearing. |

| Method | Meaning |
| --- | --- |
| `norm(v)` | `((v % 360) + 360) % 360`. Used for arithmetic only, never on a value read from a link (R4). |
| `arc(from, to)` | The clockwise span from `from` to `to`, in `(0, 360]`. `arc(0, 360)` is 360. |
| `ahead(from, v)` | The clockwise offset of `v` from `from`, in `[0, 360)`. |
| `signed(a, b)` | The short signed difference `b − a`, in `(−180, 180]`. |
| `positions(n, from, to)` | `n` grid positions. Over a whole turn they use `i / n`, so north appears once. Over an arc they use `i / (n − 1)`, so both ends appear. They are snapped, normalised and ordered by `ahead(from, ·)`. |

**Invariants, asserted at load.**
- Each declared control's coarse positions (8) are a subset of its fine positions (16).
- No two fine positions coincide after snapping.
- `Wrap` is declared on exactly one control, `northAxis`. A second one is a decision
  the spec has not made (Assumptions).

## Bearing, with a Wrap (`src/controls.js`)

`Bearing` gains an optional `wrap`. Without one, nothing changes (`ctxAzimuth`).

| Member | With `wrap` | Without |
| --- | --- | --- |
| `min`, `max`, `step` | 0, 360, `wrap.step` | absent, so `refusesSweep` refuses with today's sentence |
| `wraps` | true | false |
| `quantityKind` | `KINDS.angle` | absent |
| `fraction(v)` | `v / 360` | absent |
| `valueAt(f)` | `wrap.norm(round(f · 360 / step) · step)`. 1 gives 0. | absent |
| `figure(v)` | whole degrees, `figureIn(angle)` | absent |
| `unitNow` | `''`, since `format` is self-describing (R9) | absent |
| `spanKind`, `spanUnitNow` | `KINDS.angle`, `°` | absent |
| `parse(text)` | whole or decimal degrees in `[0, 360]`. The 360 is admissible only as an extent end, never committed. | absent |
| `landmarks` | `[]` | `[]` |

`format(v)` is unchanged: `135° SE`.

**Value rule (`refuses`).** For a wrapping Bearing the range is `[0, 360)`, and 360 or
more is refused with "is outside its 0–360 range; a full turn is 0". A Bearing
without a `wrap` keeps `[0, 360]`.

## Study counts and grid counts

| Function | Linear control | Wrapping control |
| --- | --- | --- |
| `studyCounts(control)` (`study.js`) | `{ coarse: 11, fine: 21 }` | `{ coarse: 8, fine: 16 }` |
| `gridCounts(control)` (`survey.js`) | `{ coarse: 6, fine: 11 }` | `{ coarse: 8, fine: 16 }` |

A survey's pass is held per axis, and `surveyGrid` becomes `{ x, y }`.

## Study point (`src/scheduler.js`)

The existing point gains one field.

| Field | Type | Rule |
| --- | --- | --- |
| `turn` | number or absent | The turn read off the sampled document by `turnOf`. Present only where the job's key wraps. The card places the point here. A mismatch with the asked value of more than 0.01° makes the point a failure with a stated reason (R6). |

## Seam point (drawn only, `src/console.js` `studyCard`)

A vertex at x = 360 that repeats the 0° point's reading. It exists only in the drawn
path and in `readAt`'s bracket. It is not in `job.curve`, not in any cache, not in any
count, and is omitted when the 0° point is a gap.

## Axis, wrapping (`src/survey.js`)

| Field / method | Linear | Wrapping, whole turn | Wrapping, arc |
| --- | --- | --- | --- |
| `from`, `to` | `from < to` | 0, 360 | any, `from ≠ to`. `from > to` crosses north. |
| `closed` | false | true | false |
| `cells` | `count − 1` | `count` | `count − 1` |
| `next(ix)` | `ix + 1` | `(ix + 1) % count` | `ix + 1` |
| `offset(v)` | `v − from` | `wrap.ahead(0, v)` | `wrap.ahead(from, v)` |
| `at(f)` | linear between positions | as linear. `f ∈ [count − 1, count]` runs from the last position to 360 / north. | as linear, along `offset` |
| `indexOf(v)` | tolerance `step / 1000` | the same, on normalised values | the same |

The lattice stays `count_x × count_y`. Each cell consumer iterates `ix < axis.cells` and
takes its neighbour through `axis.next`.

**Coverage.** `wanted = x.count × y.count`, unchanged. North is one column, so it is
counted once without a guard.

## PullEntry (`src/pull.js`)

| Field | Linear | Wrapping |
| --- | --- | --- |
| `to` | `here ± size` | `wrap.norm(here + 18)` |
| effect divisor | `to − from` | `+18` (`wrap.signed`) |
| `room` | to the stop | `null`. The `room === 0 ⇔ atStop` invariant is not asked. |
| lettered move | its room | "turned 18° clockwise" |

## Link (`src/permalink.js`)

| Item | Before | After |
| --- | --- | --- |
| `LINK_VERSION` | `v1` | `v2` |
| `DEFAULTS_BY_VERSION` | `{ v1 }` | `{ v1, v2 }`, both `DEFAULT_PARAMETERS` (no default moves) |
| `MIGRATIONS` | `{}` | `{ v1: drop northAxis=360, since 360 is 0 and 0 is the default }` |
| `sty` | refuses a faceless key | admits `northAxis`, grammar unchanged |
| `sv` extent | `from < to` within `[min, max]` | the same for linear axes. For a wrapping axis: ends in `[0, 360]`, `from ≠ to`, and `0_360` is a whole turn. |

## State transitions

None new. An orientation study has the lifecycle every study has: queued, coarse,
densified, cancelled by `restShapeKey`, kept or dropped on a commit. The survey and the
pull are likewise unchanged.
