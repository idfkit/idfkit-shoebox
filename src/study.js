/**
 * The parameter study: one control swept across its own face.
 *
 * A drag is authorship — every frame is the design. A sweep is a question: the
 * desk is solved at each position of one control, the model ends exactly where
 * it started, and the only thing that survives is the curve. This module holds
 * the part of that with no DOM and no engine in it, so the same Node script
 * that checks `applyModel` for idempotence can check the sampling too — and,
 * since the metrics moved here, what each sample is read *for* as well.
 */

import { readDemand, readExtremes } from './readings.js';
import { COUNT_CATEGORY, readCriterionA } from './tm59.js';

export const SWEEP_SAMPLES = 21;

/**
 * The first pass of an automatic refresh. Eleven is not arbitrary: the raw
 * positions for n = 11 are `min + (i/10)·span`, which are exactly the even
 * positions of the 21-point grid, and snapping is deterministic per value —
 * so the coarse set is a strict subset of the full set. Densifying a coarse
 * study to twenty-one points therefore costs only the ten new runs; the
 * eleven already solved come back as cache hits.
 */
export const COARSE_SAMPLES = 11;

/**
 * The order to solve a curve's samples in, as indices into `points`.
 *
 * Serial sweeps read left to right because nothing was drawn until the end.
 * With samples landing on a pool and the card redrawn per point, order is
 * what the reader sees: ends first, then the current desk value (the one
 * point shared with every other study and with the sheet's own solve, so it
 * is the likeliest cache hit), then the middle, then recursive midpoints —
 * the curve's silhouette stands after four points instead of emerging from
 * one edge.
 */
export function sampleOrder(points, current) {
  const n = points.length;
  if (n === 0) return [];
  const seen = new Set();
  const order = [];
  const take = (i) => {
    if (i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  };
  take(0);
  take(n - 1);
  // `samplePoints` keeps the current value in the list verbatim, so an exact
  // match exists whenever the caller passed the list it built; the nearest
  // index covers a caller sampling around a value the grid swallowed.
  let nearest = 0;
  for (let i = 1; i < n; i += 1) {
    if (Math.abs(points[i] - current) < Math.abs(points[nearest] - current)) nearest = i;
  }
  take(nearest);
  // Recursive bisection over index ranges, breadth-first, so detail arrives
  // evenly across the face rather than finishing one half before the other.
  const queue = [[0, n - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift();
    if (hi - lo < 2) continue;
    const mid = (lo + hi) >> 1;
    take(mid);
    queue.push([lo, mid], [mid, hi]);
  }
  return order;
}

/**
 * Where to sample a control between its own min and max.
 *
 * Snapped to the step grid, because those are the only values the control can
 * actually hold — a curve through positions the slider cannot reach would be
 * lettering a desk that cannot exist. The current value is kept in the list
 * exactly as it is, not as its nearest gridded neighbour: the study's redline
 * tick stands on the current value, and the one point it must never miss is
 * the one under the tick. A coarse step legitimately collapses the list below
 * the asking count; fewer honest points beat twenty-one invented ones.
 *
 * **A control with no numeric face is refused here rather than sampled.** The
 * console never offers a Study on one — `buildPattern` and `buildDays` both
 * decline to register a row, and that map is what hangs a study card under a
 * control, so no button is drawn at all: the same silence a list of holidays
 * has always kept, and the honest one, since there is no offer to grey and no
 * legend line to grey it with. But silence in one surface is not a refusal in
 * the model. Handed a `Pattern`, the arithmetic below reads `undefined` for
 * `min`, `max` and `step`, and `Math.round(NaN)` is NaN, so a sweep of a daily
 * profile would come back as twenty-one NaN positions, mint twenty-one cache
 * keys, spend twenty-one engine runs and draw a card with nothing on it. That
 * is the silent shape of failure Principle IV exists to turn into a throw, so
 * the face a sweep needs is asserted before anything is computed. Twenty-four
 * hourly fractions are a shape rather than a position, and there is nothing
 * here to interpolate between.
 */
export function samplePoints(control, current, n = SWEEP_SAMPLES) {
  const { min, max, step } = control;
  for (const [name, value] of [['min', min], ['max', max], ['step', step]]) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `samplePoints: ${control.key} is a ${control.kind} and carries no ${name}, so it has no face to ` +
          'sweep along. Only a control declaring min, max and step can be a study subject',
      );
    }
  }
  const grid = (v) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));

  const points = [];
  for (let i = 0; i < n; i += 1) points.push(grid(min + (i / (n - 1)) * (max - min)));
  points.push(current);
  points.sort((a, b) => a - b);

  // Snapping goes through floating point, so "the same position" can arrive as
  // two numbers a few ulps apart. Anything closer than a thousandth of a step
  // is one position, and when one of the pair is the current value, the
  // current value is the one that survives.
  const tol = step / 1000;
  const out = [];
  for (const v of points) {
    if (out.length && Math.abs(out[out.length - 1] - v) < tol) {
      if (v === current) out[out.length - 1] = current;
    } else {
      out.push(v);
    }
  }
  return out;
}

/* ══ what a sweep is read for ════════════════════════════════════════════ */

/**
 * The category the criterion curve is read at, and why there is only one of it.
 *
 * `COUNT_CATEGORY` is Category II, and `tm59.js` sets out the argument there:
 * it is the category TM59:2026 names for "all other dwellings", it is the one
 * the sheet's own count is taken at, and lettering every combination still
 * leaves the reader to pick one. Taken from that constant rather than restated,
 * so the curve and the count can never disagree about which line the reading
 * was judged against.
 *
 * There is a second reason not to draw both lines, and it belongs to the
 * drawing rather than to the method: the desk has exactly one pen pair,
 * `--warm` against `--cold`, and it is reserved for signed physical quantities
 * — the rail's watts, TEDI against CEDI, the summer peak against the winter
 * low. Two exceedance shares are neither signed nor a pair, so drawing them in
 * that pair would spend the one encoding this page has for direction on two
 * readings that have none. Category I is read on the sheet, beside Category II
 * and saying what it presumes, which is where a reader can act on it.
 */
export const TM59_STUDY_CATEGORY = COUNT_CATEGORY;

/**
 * What one sample of one study is read for.
 *
 * A declaration rather than a switch, for the reason `controls.js` is one: the
 * metric id travels on the job, into the cache key and into the study card,
 * and it decides two separate things that used to be stated in two places —
 * which reporting profile the sample's document is written with, and which
 * reader the finished run is handed to. Those two were one string only by luck,
 * while every metric's profile happened to share its name, and they part
 * company at the first criterion: `'tm59a'` is read off the `'tm59'` profile,
 * which is named for the method because criteria b and c would be read off the
 * same three series. Left as `{ reporting: job.metric }`, the first criterion
 * metric asks `syncReporting` for a profile called `tm59a`, which throws inside
 * `buildSample` — inside the sample's own promise, where the scheduler lands a
 * rejection as a gap — so the whole sweep comes back empty and nothing says why.
 *
 * `read` takes the parsed ESO first, the way every reader in `readings.js`
 * does, and a bag of what the sample carries second: `built` is what
 * `buildSample` returned, and `context` is the per-study fact the scheduler
 * resolved once for the whole sweep.
 */
export class Metric {
  constructor({ id, reporting, read }) {
    this.id = id;
    this.reporting = reporting;
    this.read = read;
    Object.freeze(this);
  }
}

export const METRICS = Object.freeze([
  new Metric({
    id: 'extremes',
    reporting: 'extremes',
    // Free-running, the zone's two extremes are the design quantities, and one
    // hourly series answers both.
    read: (eso) => readExtremes(eso),
  }),
  new Metric({
    id: 'energy',
    reporting: 'energy',
    // Each sample's intensity divides by that sample's own floor, which the
    // swept key may itself be moving — hence off `built` rather than off the
    // desk. `buildSample` is what measures it, at the moment the overlay is in
    // the document and before it is restored.
    read: (eso, { built }) => readDemand(eso, built.floorArea),
  }),
  new Metric({
    id: 'tm59a',
    // Three series against the sheet's fifteen: the zone mean air temperature
    // `zoneRuns` splits environments on, `Zone Operative Temperature`, and the
    // occupancy schedule value that is the criterion's denominator.
    reporting: 'tm59',
    read: (eso, { context }) => readTm59A(eso, context),
  }),
]);

export const METRIC_BY_ID = Object.freeze(Object.fromEntries(METRICS.map((m) => [m.id, m])));

/**
 * Three declaration checks, every one of them for an error that would otherwise
 * cost a whole sweep and report nothing.
 *
 * A duplicated id would have the later declaration silently win in
 * `METRIC_BY_ID`, so a study asked for one reading would be handed another's;
 * a missing reader leaves every sample of that metric landing as `undefined`,
 * which the scheduler spreads into the curve as a point with nothing on it and
 * reports as a sweep that drew nothing; and a profile name that has drifted
 * from what `syncReporting` knows throws inside `buildSample`, which
 * runs inside the sample's own promise, where the scheduler lands a rejection
 * as a gap — twenty-one gaps, a card reporting "no readings", and nothing
 * anywhere saying the profile was misspelled. The profile names themselves
 * cannot be asserted against `model.js` from here without pulling the whole
 * model into a module the scheduler's harness imports, so what is checked is
 * that each metric declares one at all.
 */
{
  const seen = new Set();
  for (const metric of METRICS) {
    if (seen.has(metric.id)) throw new Error(`two study metrics are declared as "${metric.id}"`);
    seen.add(metric.id);
    if (!metric.reporting) {
      throw new Error(`the study metric "${metric.id}" declares no reporting profile to write its samples with`);
    }
    if (typeof metric.read !== 'function') {
      throw new Error(`the study metric "${metric.id}" declares no reader, so a finished sample has nothing to be`);
    }
  }
}

/**
 * Criterion a over one sample's run, as the one number a curve can be drawn
 * from: the share of occupied hours standing at least 1 K above the adaptive
 * line, in per cent, against the criterion's own limit of 3 %.
 *
 * **Null where the run cannot answer, never zero** (FR-025). `readCriterionA`
 * hands back a `Reading` that carries either a value or the reason it has none
 * — a sample solved over design days reached no part of 1 May to 30 September,
 * a sample with Gains patched out has no occupied hours to be a share of — and
 * a share of zero is a measurement: it says the building spent no occupied
 * hour over the line, which is the best possible reading rather than a missing
 * one. So the absence is dropped here and the sample is left out of the curve
 * altogether. The scheduler already keeps the sample's position in `job.curve`
 * with no reading attached, and the card's `segments` breaks the line at a
 * point whose selector returns null, so the gap draws as a gap.
 *
 * The absence sentence itself is deliberately not carried through. A point
 * carrying a reason and no share would satisfy the scheduler's own test for
 * "did this curve draw anything", and a sweep of twenty-one refusals would
 * finish as a study rather than as the failure it is.
 *
 * @param {object} eso      the parsed ESO the sample's run returned
 * @param {object} context  `{ trm, floor }`, resolved once for the whole sweep
 * @returns {{ share: number }|null}
 */
export function readTm59A(eso, context) {
  if (!context) {
    throw new Error(
      'readTm59A: no study context. Criterion a is read against a running mean built from the weather ' +
        'file and divided by the occupied hours the gains schedule wrote, and neither is recoverable ' +
        'from the ESO — see `contextFor` in `scheduler.js`',
    );
  }
  const { trm, floor } = context;
  if (!Number.isFinite(floor)) {
    throw new Error(
      `readTm59A: the study context carries ${floor} as the occupancy schedule's unoccupied value. It is ` +
        '`occupiedFloor(params)` in `model.js` and it is the criterion\'s denominator: the wrong one ' +
        'counts 3,672 occupied hours where the answer is 1,100',
    );
  }
  const reading = readCriterionA(eso, trm, TM59_STUDY_CATEGORY, floor);
  return reading.value === null ? null : { share: reading.value };
}
