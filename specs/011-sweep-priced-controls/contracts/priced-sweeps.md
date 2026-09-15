# Contract: priced sweeps across modules

The interfaces this feature adds or changes, one section per module. The DOM-free
modules (`study.js`, `survey.js`, `scheduler.js`, `pull.js`, and the codec half of
`permalink.js`) stay DOM-free and engine-free, so the Node harnesses in
[quickstart.md](../quickstart.md) call the real functions.

## `src/study.js`

### `Quantity` gains `movedBy`

```text
new Quantity({ ..., movedBy = [] })
quantity.movedBy        // frozen Set of priced control keys
```

Load-time assertions are listed in [data-model.md](../data-model.md).

### `refusesPairing(key, quantity) -> string | null`

Pure. Null for a shaping control or a reading the key can move. Throws for an unknown
key or an undeclared quantity.

### `pairingFix(key) -> string`

The fix line for a refused pairing. Throws for a key that is not priced.

### `offersFor({ ..., key = null })`

When `key` is given, a quantity refused by `refusesPairing(key, quantity)` is returned
as an unavailable `Offer` whose `reason` is that sentence and whose `fix` is
`pairingFix(key)`. The pairing check runs **after** every existing refusal, so a
reading already refused for want of a weather file keeps that reason: the weather file
is the first thing to fix.

## `src/scheduler.js`

### `createStudyScheduler({ ..., priceAt })`

```text
priceAt(job, value, sample) -> readings bag
```

Synchronous; may read live desk state; never called with a null sample. Defaults to
`(job, value, sample) => sample.readings`.

### `curveFor(job) -> { curve, missing, runs }`

`runs` counts distinct cache identities among points that carry a sample.

Invariant, asserted by the harness: for a job whose `omits` holds only priced keys,
`runs <= 1`.

## `src/survey.js`

### `refusesAxis(key)`

No longer refuses a key on a priced channel. Still refuses a control with no numeric
face, with the same sentence.

### `makeSurvey({ x, y, readings, ... })`

Additionally throws, naming the pairing, when `refusesPairing` refuses `x.key` or
`y.key` against any reading's quantity.

### `landPoint(survey, { ix, iy, readings, basis = null, reason = null, floorArea = null, cacheKey = null })`

`readings` replaces `sample`. A null `readings`, or one carrying no value for the
survey's first reading, lands a `Gap` exactly as before, carrying `basis` when one was
given so a re-price can restore it.

### `coverageOf(survey) -> Coverage`

Carries `runs`.

## `src/permalink.js`

### `decodeSurvey(text)`

Refuses the whole link, with `refusesPairing`'s sentence, when either axis is refused
against any reading. The check runs after the axis and reading names are resolved, so
an unknown name is still refused as unknown first.

### `sty`

No change. A priced study key decodes like any numeric face.

## `src/console.js`

- `studyOffer` and `surveyOffer` no longer return null on a priced channel.
- A priced row that is idle and declares `withdrawn` letters `control.withdrawn(params)`
  in view under the row, in the dashed refusal box the design system already uses, and
  hides it when the face returns (`hidden`, with a `[hidden]` twin if the class sets
  `display`).
- `syncStudyOffer` and `syncSurveyOffer` also use that sentence as the disabled title and
  `aria-label`; otherwise the existing sentences.

## `src/main.js`

| Function | Change |
| --- | --- |
| `pricedReadings(readings, basis, pricing)` | New. The one application of the bill to a cached basis. |
| `pricingAt(job, value)` | New. Live `params` with the job's priced swept keys overlaid. |
| `repriceStudies()` | Calls `pricedReadings`; unchanged in effect. |
| `repriceSurvey()` | New. Called from `reprice()`. Re-prices every `SpotHeight` and every `Gap` carrying a basis at its own position: a null reading lands a `Gap` with the bill's `Absent.reason`, a value lands a `SpotHeight`. Asks `surveyRefusal` again. |
| scheduler `refuses` | Adds the withdrawn-face question for priced swept keys, at `deskAt(job, value)`. |
| scheduler `priceAt` | `pricedReadings(sample.readings, sample.meterBasis, pricingAt(job, value))` where `job.omits` holds a priced key; otherwise `sample.readings`. |
| `studyOffers(snapshot, patch, epw, key = null)` | Passes `key` to `offersFor`. `enqueueStudy`, `redrawStudiesForQuantity` and `partialStudy` pass the study's key. |
| `surveyReadingOffers(snapshot, patch, epw, axes = [])` | Greys a reading refused against either axis. |
| `surveyRefusal(sv)` | Also asks `refusesPairing` and each priced axis's `withdrawn`. |
| `axisOffers` | No longer skips priced channels; greys a withdrawn face with its sentence. |
| `absorbSurveyRow` | Lands `point` readings and `point.sample.meterBasis`. |
| study drawn line, survey all-failed line | Count positions, and letter runs where they differ. |
