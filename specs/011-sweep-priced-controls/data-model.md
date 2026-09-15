# Data model: Sweep the priced controls

Phase 1 for [spec.md](./spec.md), after [research.md](./research.md). No entity here
is stored anywhere but in memory for the life of the page; nothing reaches the IDF.
Every class stays frozen at construction, as the house rule requires.

## Changed: `Quantity` (`src/study.js`)

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `movedBy` | frozen `Set<string>` of control keys | yes | The priced controls that can move this reading. Empty for every reading taken before the plant and tariff are applied. |

**Validation, at construction**: every entry is a string. **At module load**, beside
`assertQuantityReachability`:

- every key in any `movedBy` resolves through `controlFor` to a control with `min`,
  `max` and `step`, on a channel declaring `prices: true`;
- every such control is named by at least one quantity's `movedBy`;
- a quantity with a non-empty `movedBy` reads the bill (`needs` is the `BILL`
  contents).

Declared values are in research.md R3.

## New: pairing refusal (`src/study.js`)

Not a class: a pure function, so the same sentence is reachable from four modules.

`refusesPairing(key, quantity) -> string | null`

- `null` when the key's channel does not price, or `quantity.movedBy` holds the key.
- Otherwise one sentence naming the control, the reading, and the readings the control
  can move. Built from `labelFor(key)`, `quantity.label` and the labels of every
  quantity whose `movedBy` holds the key, never hand-written per pair.
- Throws when `quantity` is not a declared `Quantity`, or the key resolves to no control.

The companion fix line, `pairingFix(key)`, lists the readings the key can move
("Choose energy use intensity, cost or carbon.").

## Changed: `Scale` on a priced channel (`src/controls.js`)

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `withdrawn` | `(params) => string` or null | yes | Why this face does not reach the bill as the desk stands, and what would bring it back. |

**Validation at load**: a `Scale` on a `prices: true` channel that declares `needs` MUST
declare `withdrawn`, and one that does not declare `needs` MUST NOT.

**Where it is lettered**: in view under the dimmed row, in the existing refusal box, and
as the disabled offer's title and accessible name. Never in the title alone. Declared on
`heatEfficiency`, `heatCOP`, `elecPrice`, `gasPrice` and `gridFactor`. Each sentence is
held to a budget in `src/copy.js`.

**State**: live when `control.idle(desk)` is false, withdrawn when it is true. The
transition is driven only by a priced selector on the same channel (`heatSource`,
`rateBasis`, `factorBasis`) or, for Plant, by System going out (which blocks the whole
channel and is answered by the channel's own `requires.reason` instead).

## New: position pricing (`src/main.js`)

`pricingAt(job, value) -> params`

`{ ...params, ...overlay }`, where `overlay` holds each key of `job.omits` that is in
`PRICED_KEYS`, valued from `deskAt(job, value)`. For a job whose `omits` holds no priced
key it is exactly `params`.

`pricedReadings(readings, basis, pricing) -> frozen readings bag`

The body of today's `repriceStudies` transform: `eui`, `cost` and `carbon` re-read from
`billFromBasis(basis, pricing)`, every other reading passed through. The only place the
bill arithmetic is applied to a cached basis.

## Changed: scheduler hooks (`src/scheduler.js`)

| Hook | New | Contract |
| --- | --- | --- |
| `priceAt(job, value, sample)` | yes | Synchronous. Returns the readings bag the curve point carries. Not pure: it may read the desk's current priced settings. Default returns `sample.readings`. Never called for a refused position or a missing sample. |
| `refuses(job, value)` | unchanged contract | Still pure. Its implementation in `main.js` gains the withdrawn-face question. |

`pointAt(job, value, sample, refused)` builds `reading` and the spread readings from
`priceAt(...)` rather than from `sample.readings`. `sample` is still carried on the
point, unpriced, so the survey can keep its basis.

`curveFor(job)` returns, beside `curve` and `missing`, `runs`: the number of distinct
cache identities behind the curve's measured points.

## Changed: `SpotHeight` (`src/survey.js`)

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `readings` | readings bag | changed | Now the **priced** bag for this position, taken from the curve point. |
| `basis` | opaque (`MeterBasis` from `main.js`) or null | yes | The run's meter totals, kept so the spot can be re-priced without the cache. `survey.js` never reads inside it. |

`landPoint(survey, { ix, iy, readings, basis, reason, floorArea, cacheKey })` takes the
priced readings and the basis explicitly instead of a `sample`.

**Validation**: a `SpotHeight` whose survey reading is null MUST NOT be constructed;
`landPoint` lands a `Gap` instead, and `repriceSurvey` does the same.

## Changed: `Gap` (`src/survey.js`)

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `basis` | opaque or null | yes | Present only on a gap that was a measured spot and stopped pricing. Lets a later re-price restore it to a `SpotHeight` with no run. |

**State**: `SpotHeight` → `Gap` (with basis, reason = the bill's `Absent.reason`) when a
re-price leaves its reading null; `Gap` with basis → `SpotHeight` when a re-price gives
it a value. A `Gap` without a basis (a failed or refused run) never transitions by
re-pricing.

## Changed: `Coverage` (`src/survey.js`)

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `runs` | integer | yes | Distinct `cacheKey`s among measured spot heights. |

**Validation**: the existing sum assertion stands. Added: `measured === 0` implies
`runs === 0`, and otherwise `1 <= runs <= measured`. A ground with no priced axis has
`runs === measured` wherever every spot came from its own run.

## Changed: `Survey` construction (`src/survey.js`)

`makeSurvey` throws, before any axis is measured, when `refusesPairing` refuses either
axis against any of the survey's readings. `refusesAxis` no longer refuses a priced
channel; it still refuses a control with no numeric face.

## Changed: `PullReading.said` (`src/pull.js`)

Appends one clause stating that Plant and Tariff are not ranked. No structural change.

## Unchanged, and relied on

- `deskKey` / `shapeKey` / `restShapeKey`: priced keys stay out.
- `sampleIdentity`: therefore every priced position of one shape shares one identity.
- `TraverseStop`: keyed by shape; priced-only moves add no stop.
- `sty` and `LINK_VERSION`.
