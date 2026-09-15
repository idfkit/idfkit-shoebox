# Research: Sweep the priced controls

Phase 0 for [spec.md](./spec.md). Every decision below was taken after reading the
code it changes; file and function names are cited so the reasoning can be checked.

## R1. Where a priced position is priced

**Decision**: at curve assembly, inside the scheduler's `pointAt`, through a new
injected hook `priceAt(job, value, sample)` that returns the readings bag for that
position. The default hook returns `sample.readings` unchanged, so every existing
job behaves exactly as it does today.

**Rationale**: the sample cache is keyed by `sampleIdentity`, which is built from
`deskKey`, which drops `PRICED_KEYS`. All twenty-one positions of a study of
`heatEfficiency` therefore share **one** identity and one cache entry. That is what
makes the sweep cost one run (the first dispatch builds it, the other twenty ride the
`pending` promise under the same key and consume no capacity), and it is also why the
price cannot live in the cache: one entry cannot hold twenty-one prices. `pointAt` is
already the single place a curve point is built (`land` and `curveFor` both call it,
after the drift described in its own comment), so pricing there reaches both paths at
once.

**Alternatives considered**:

- *Put priced keys into the identity.* Twenty-one identities, twenty-one runs of a
  byte-identical model. Defeats FR-008 and FR-010 and is the exact waste
  `PRICED_KEYS` exists to prevent.
- *Reprice the finished curve in `main.js` after the scheduler hands it over.* Two
  call sites (`partialStudy` and `redrawStudiesForQuantity`) plus the survey's
  `absorbSurveyRow`, each a place to forget it. `pointAt` is one.

## R2. One pricing function

**Decision**: extract the transform inside `repriceStudies` into one function in
`main.js`, `pricedReadings(readings, basis, pricing)`, which returns the readings bag
with `eui`, `cost` and `carbon` recomputed through `billFromBasis(basis, pricing)`.
`repriceStudies`, the `priceAt` hook and the survey reprice (R6) all call it.

The pricing for a position is `{ ...params, ...overlay }`, where `overlay` holds the
priced keys among `job.omits`, read off `deskAt(job, value)`. For a study that is the
swept key at `value`; for a survey row it is whichever of the two axes is priced, the
row's Y value coming from the row's snapshot.

**Rationale**: FR-012 forbids a second copy of the pricing arithmetic, and there is
already one copy to reuse. Non-swept priced controls come from **live** `params`, not
from `job.snapshot`, because that is what `repriceStudies` does today (spec 004
FR-020): a tariff turned under an open study re-prices it at the tariff now shown.

**Alternatives considered**: pricing at `job.snapshot` for every priced key. A study
opened before a tariff change would then letter the old tariff until re-minted, which
is the stale figure FR-013 forbids.

## R3. Declaring which readings a priced control moves

**Decision**: a new `movedBy` field on `Quantity` in `src/study.js`, naming the priced
keys that can move it:

| Quantity | `movedBy` |
| --- | --- |
| `eui` | `heatEfficiency`, `heatCOP`, `coolCOP` |
| `cost` | `heatEfficiency`, `heatCOP`, `coolCOP`, `elecPrice`, `gasPrice` |
| `carbon` | `heatEfficiency`, `heatCOP`, `coolCOP`, `gridFactor` |
| every other quantity | empty |

Asserted at module load, beside the existing roster assertions: every key named is a
numeric face on a `prices: true` channel, and every numeric face on such a channel is
named by at least one quantity. A new priced face with no reach, or a renamed one,
throws at load.

The arithmetic behind the table was read, not assumed. `computeBill` in `src/bill.js`
computes `metered = delivered / divisor`, where `divisorFor` reads the plant option's
key (`heatEfficiency` or `heatCOP`) or `coolCOP`; then `cost = metered × costRate` and
`carbon = metered × carbonRate / 1000`. `assume` in `src/rates.js` puts `elecPrice`
and `gasPrice` into the cost rates only, and `gridFactor` into the electricity carbon
rate only. `Bill.intensity('metered')` is the building section's metered energy, so
EUI moves with the divisors and with nothing priced after them.

The declaration is then verified against that real arithmetic by a Node harness
(quickstart gate 1), over all 66 pairings (SC-004).

**Alternatives considered**:

- *Declare reach on the control in `controls.js`.* `study.js` imports `controls.js`,
  so the control would name quantity ids as bare strings it cannot check, and the
  assertion would have to live in the importer anyway.
- *Derive reach at load by pricing a synthetic basis at each face's two ends.* True by
  construction, but it needs a fabricated rate card inside a module that otherwise
  holds none, which is a second copy of the card's shape. The harness gets the same
  guarantee against the real card.

## R4. The pairing refusal

**Decision**: `refusesPairing(key, quantity)` exported from `src/study.js`. It returns
null for any key not on a priced channel (a shaping control's effect is a measurement,
never a structural refusal) and for a quantity whose `movedBy` names the key. Otherwise
it returns one sentence, built from the declarations:

> Seasonal efficiency is applied to the bill after the run, so it cannot move heating
> + cooling demand. It moves energy use intensity, cost and carbon.

Its consumers, which is what FR-006 asks for:

1. **The study card.** `studyOffers` gains an optional `key`; when given, a quantity
   refused by `refusesPairing` becomes an unavailable `Offer` with that sentence as its
   reason and "Choose energy use intensity, cost or carbon." (built from `movedBy`) as
   its fix. `enqueueStudy` and `redrawStudiesForQuantity` already turn an unavailable
   offer into a card that stands waiting with its reason, so no new card state exists.
2. **The survey chooser.** `surveyReadingOffers` gains the chosen axes and greys a
   reading refused against either.
3. **The ground itself.** `makeSurvey` throws on a refused pairing, as it already throws
   on the same control on both axes.
4. **The survey link.** `decodeSurvey` refuses the whole link with the same sentence.

The sentence is held to a budget in `src/copy.js`.

## R5. A withdrawn priced face

**Decision**: the five priced faces that declare `needs` (`heatEfficiency`, `heatCOP`,
`elecPrice`, `gasPrice`, `gridFactor`; `coolCOP` has none) gain a `withdrawn` sentence,
a function of the desk, saying what would bring the face back ("The heating plant is a
heat pump; seasonal efficiency applies to a boiler or direct electric plant.").
Asserted at load: a `Scale` on a priced channel that declares `needs` must declare
`withdrawn`.

It is used in three places:

- The console letters the sentence **in view**, under the dimmed row, in the dashed
  `--rule-focus` refusal box `.interface-design/system.md` already names as the one look
  of a refusal ("A refused entry is stated in place"). `syncStudyOffer` and
  `syncSurveyOffer` also carry it as the disabled button's title and accessible name,
  but never only there: Principle VII forbids an explanation that exists only on hover,
  and the existing generic title ("Set, but not reaching the model") is left as it is
  for shaping controls, which this feature does not touch.
- The scheduler's `refuses` hook in `main.js` adds one question after `sampleRefusal`:
  where a swept key is priced and its control is idle at `deskAt(job, value)`, the
  position is refused with that sentence. A refused position is never built and draws
  as a gap, which is the existing path. It reads the job's own snapshot, not live
  `params`, because the scheduler's contract requires `refuses` to be pure: it is asked
  by `dispatch` and again by `curveFor`, and the two must agree.
- For a ground, the same question is asked of the survey as a whole in `surveyRefusal`
  against live `params`, so a plant switched under an open ground stands the ground
  refused with the sentence (the spec's edge case) instead of refusing positions one by
  one.
- `axisOffers` greys a withdrawn priced face with the same sentence.

**Rationale**: a withdrawn priced face is not inert the way a shaping control is. An
idle shaping control still reaches the document; `heatEfficiency` under a heat pump
reaches nothing, not even the bill, so its curve would be a flat line of arithmetic
that never used the swept value. FR-005 refuses it. Because the selector that
withdraws it (`heatSource`, `rateBasis`, `factorBasis`) is itself priced, moving it
does not change the rest shape, so the curve is not re-swept; it is re-priced, and
`redrawStudiesForQuantity({ queue: false })` re-mints each job from live `params`,
which is when the refusal is asked again.

`priceAt`, unlike `refuses`, is deliberately **not** pure: it prices at the desk's
current priced settings, as the cache reprice already does. Its contract says so, and
`reprice()` rebuilds every curve and ground whenever those settings move, so no figure
can stand priced at settings the desk has left.

**Alternative considered**: taking the curve down when its face is withdrawn. Every
other study survives its control going idle, and a study that disappeared would have
to be re-opened when the plant switched back.

## R6. Surveys, and re-pricing a ground

**Decision**:

- `rowsFor` is unchanged. A row whose swept key is priced is one identity for the
  whole row; a ground with both axes priced is one identity for every row, and so one
  run.
- `landPoint` takes the point's **priced** readings (what `pointAt` now returns)
  rather than `sample.readings`.
- `SpotHeight` gains `basis`, the sample's `MeterBasis`, carried opaquely. A new
  `repriceSurvey()` in `main.js`, called from `reprice()` beside `repriceStudies()`,
  replaces each frozen `SpotHeight` with one whose readings come from
  `pricedReadings(readings, basis, { ...params, ...overlayAt(x, y) })`.
- A spot that no longer prices under the new settings (a tariff taken back to Published
  at a station with no published rate) becomes a `Gap` whose reason is the bill's own:
  the `reason` of the `Absent` rate that left the line unpriced. The `Gap` keeps the
  `basis` too, so the next re-price can restore it to a `SpotHeight` with no run. A
  `SpotHeight` whose survey reading is null is never constructed (FR-015); left alone it
  would be counted as measured while lettering nothing.
- `refusesAxis` drops its priced-channel branch; `axisOffers` stops skipping priced
  channels.

**Rationale**: a spot height holds its own basis rather than looking it up through
`cacheKey`, because the cache is bounded (`cacheLimit` 400) and a fine ground of 121
points beside a few studies can evict the entry a spot height would need, which would
leave that spot priced at an old tariff with nothing to say why.

**Finding to confirm on the page (quickstart gate 4)**: reading `reprice()` and
`absorbSurveyRow`, nothing re-prices a spot height today. `repriceStudies` replaces
cache entries, but a `SpotHeight` already holds the readings object it was built
with. So on `main`, turning the tariff with a ground surveyed for cost appears to leave
E-02 lettering the old cost. `repriceSurvey` fixes that for every ground, priced axis
or not.

## R7. Counts that would start lying

**Decision**: three sentences change, and one count is added.

| Where | Today | After |
| --- | --- | --- |
| `onStudyUpdate`, the drawn line | "Study drawn: *n* design-day runs across ..." | *n* positions, and the runs they came from where the two differ |
| `renderSurveyFinding`, every position failed | "all *n* runs failed" | "all *n* positions failed" |
| `PullReading.said` | "..., one run per control." | adds that Plant and Tariff are not ranked (FR-021) |
| `Coverage` | measured, gaps, unsurveyed | adds `runs`: the distinct identities behind the measured spots, lettered only where it differs from `measured` |

`Coverage` keeps its sum assertion and gains a second: `runs` is between 1 and
`measured` wherever `measured` is positive.

The relief caption "*n* of *m* positions carry a run" stays true and is left alone.

## R8. The link

**Decision**:

- `sty` is unchanged. Its decoder already accepts any key whose control has `min`,
  `max` and `step`, which every priced face has. A desk-wide quantity that an open
  priced study cannot move is reproduced as that card standing refused (spec FR-019,
  amended during planning).
- `sv`: `refusesAxis` no longer refuses priced axes, and `decodeSurvey` adds
  `refusesPairing` over both axes and every reading, refusing the whole link.
- `LINK_VERSION` stays `v1`. No default, key or range changes, and every survey link
  that decoded before this feature named no priced axis, because such a link was
  refused, so it decodes identically after.

**Finding that amended the spec**: FR-019 first refused any link naming a refused
pairing. For studies that is wrong. The study reading is one value for the whole desk
and is chosen after studies are opened, so "carbon, then an electricity price study,
then switch the reading to demand" is a desk anybody can reach, and the codebase's own
rule (the crossed setpoint note in `decodeState`) is that a reachable desk's link must
open.

## R9. The traverse

**Decision**: unchanged. `commit` already skips `recordTraverse` for priced keys, stops
are keyed by `shapeKey` (which drops priced keys), and a stop's readings are "settled
once and cannot drift". Standing on a spot that differs from the current desk only on
a priced axis adds no stop. The spec was amended (FR-017a) to say so rather than
promise a stop per priced step.

## R10. The pull

**Decision**: `pullProbes` keeps `if (channel.prices) continue`. Only the sentence
changes (R7). Per the maintainer's answer to the clarification (option C).

## R11. Cost of re-pricing during a drag

A priced slider commits on every frame, and every commit reaches `reprice()`. After
this feature that re-prices every open study (21 or 22 positions each) and every spot
height (at most 121). `computeBill` walks `END_USES`, nine entries, with no allocation
beyond one `BillLine` each, so the worst case is on the order of two thousand bill
lines per frame. That is far inside a frame on any device the sheet targets, and the
drawing is already coalesced by `renderSurveySoon`. Measured in quickstart gate 5
(SC-005) rather than assumed.

One visible consequence, accepted: `redrawStudiesForQuantity` re-mints each job from
live `params`, and `samplePoints` forces the current value into the positions. A
priced study whose slider is dragged off the step grid therefore gains a point under
the tick. It costs no run and it is a real priced position.

## R12. General notes

`src/tour.js` names no study or survey restriction on priced controls (checked:
its only mention is "the bill of quantities follows, priced from published tariffs").
No step changes meaning, so `shoebox-general-notes-v4` is not bumped. Re-checked in
tasks, since FR-024 requires it.
