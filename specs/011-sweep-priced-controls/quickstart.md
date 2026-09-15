# Quickstart: validating priced sweeps

There is no test runner. Verification is throwaway Node harnesses under the scratchpad
plus driving the page, per the constitution. Interfaces are in
[contracts/priced-sweeps.md](./contracts/priced-sweeps.md) and entities in
[data-model.md](./data-model.md); this file is the run guide.

## Prerequisites

```bash
npm install
npm run dev        # predev stages the engine, schemas and station index
```

No model change is made by this feature, so no IDF needs validating or running
through EnergyPlus beyond what the page already does. The harnesses below price
real meter bases and drive the real scheduler against a fake pool.

## Gate 1: the reach table is the bill's own arithmetic (SC-004)

A harness imports `QUANTITIES`, `refusesPairing` from `src/study.js` and `computeBill`
from `src/bill.js`, builds a meter basis with heating, cooling, lighting and equipment
all non-zero, and prices it with an Assumed tariff and grid factor at each priced
face's `min` and `max`, for both a gas boiler and a heat pump.

Assert for all 6 priced faces against all 11 quantities:

1. Where the bill's figure for EUI, cost or carbon differs between the two ends on
   any desk tried, `refusesPairing` returns null.
2. Where it differs on no desk tried, `refusesPairing` returns a sentence.
3. Every non-bill quantity is refused for every priced face.
4. Exactly 54 pairings refused and 12 not.

Also assert the load-time throws, by importing a patched copy: a priced face named by
no quantity; a `movedBy` naming a shaping control; a priced `Scale` with `needs` and no
`withdrawn`.

## Gate 2: one run for a priced study (SC-001, FR-008)

A harness drives `createStudyScheduler` with a fake `runSample` that counts calls and
the real `sampleIdentity`-shaped `keyOf`.

1. Enqueue a 21-point job for `heatEfficiency`. Assert `runSample` was called once, the
   job finishes with 21 points, and `curveFor(job).runs === 1`.
2. Enqueue it again. Assert zero further calls.
3. With a `priceAt` that prices through the real bill, for each of the 6 priced faces on
   three desks (gas boiler, heat pump, Assumed tariff and grid factor), assert each point's
   EUI, cost and carbon equal `computeBill` at that position (SC-003).
4. Enqueue a 21-point job for `wallR` on the same desk. Assert one new call per position except the stance (the stance
   is shared).

## Gate 3: a priced ground costs its shaping axis (SC-002, FR-009)

Using `makeSurvey` and `rowsFor` from `src/survey.js` against the same fake pool:

1. `uFactor` by `heatEfficiency`, 6 by 6, read for carbon. Assert 6 engine runs and 36
   spot heights, and `coverageOf(sv).runs === 6`.
2. `heatEfficiency` by `gridFactor`, read for carbon. Assert 1 run, and
   `coverageOf(sv).runs === 1`.
3. `heatEfficiency` by `uFactor` read for demand: `makeSurvey` throws with
   `refusesPairing`'s sentence.
4. Every spot height's carbon equals the bill at its two positions.
5. Re-price a cost ground with a card whose gas rate is `Absent`: every spot that used
   gas becomes a `Gap` carrying that `Absent.reason`, `coverageOf` no longer counts it
   as measured, and re-pricing with the rate restored brings every one back with zero
   runs (FR-015).

## Gate 4: re-pricing reaches everything, with no run (SC-005, FR-013)

On the page, System in, a weather file attached, Tariff Assumed.

1. Open a study of `heatEfficiency` read for cost, and a ground of `uFactor` by
   `heatEfficiency` read for cost.
2. Note the run counter. Drag the gas price across its face.
3. Assert the counter does not move, every curve point and every spot height re-letters
   within a frame of the bill, and at three positions each figure equals the bill
   lettered with the desk standing there.
4. **Pre-existing behaviour check (research R6)**: before applying this feature, on
   `main`, open a ground of `uFactor` by `wwrS` for cost and turn the tariff. Record
   whether E-02 re-letters. If it does not, the fix is part of this change and belongs
   in the changelog as a fix.

## Gate 5: withdrawn faces and refused pairings on the page (US2, FR-003, FR-005)

1. With a study of `heatEfficiency` open, switch the heating plant to heat pump. The
   card stands refused with the withdrawn sentence; switch back and the curve returns
   with no run.
2. Switch the desk-wide study reading to demand. The priced card stands refused with
   the pairing sentence and its fix; shaping studies re-sweep as they already do.
3. Patch System out. The Plant faces' Study and Survey offers disable with Plant's own
   requirement sentence.
4. Take the tariff back to Published. The price faces' offers disable with their
   withdrawn sentences.
5. In the E-02 chooser with `heatEfficiency` as an axis, demand, temperatures,
   overheating, peaks and TM59 are greyed with the pairing sentence.

Every withdrawn sentence stands in view under its dimmed row at 390 px with a coarse
pointer and no hover, not only in a title, and every sentence is within its `copy.js`
budget.

## Gate 6: the link (SC-006, FR-018 to FR-020)

A harness round-trips through `encodeState` / `decodeState`:

1. `sty=cost.heatEfficiency,wallR` decodes and re-encodes identically.
2. `sty=demand.heatEfficiency` decodes (a reachable desk), and on the page the card
   stands refused.
3. `sv=uFactor*heatEfficiency*carbon*...` decodes and re-encodes identically.
4. `sv=uFactor*heatEfficiency*tedi*...` is refused whole with the pairing sentence.
5. At least 10 links minted on `main` before this feature, including the one in issue
   #78, decode to byte-identical state.

## Gate 7: the counts say what they count (SC-008, FR-027)

On the page, with the ground from gate 3 case 1 measured: the coverage line and the
study's drawn line both letter positions, and letter runs beside them where the two
differ. The pull's sentence says Plant and Tariff are not ranked. No sentence on the
sheet says "runs" of a count of positions.

## Gate 8: the reader from #78 (SC-007)

Open the link from issue #78 on the preview build. Without instructions, draw carbon
against seasonal efficiency and cut `uFactor` by `heatEfficiency` for carbon. Time it.
