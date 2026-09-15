/**
 * Quickstart gate 3 (T031, T034): a priced ground costs its shaping axis, and
 * re-prices to gaps and back with no run (SC-002, FR-009, FR-015).
 *
 * `absorb` and `reprice` below are the harness's copies of `absorbSurveyRow`
 * and `repriceSurvey` in `main.js`, which touches the DOM at import; each is a
 * handful of lines over the real `landPoint`, and the arithmetic they call is
 * the real bill's.
 *
 *   node specs/011-sweep-priced-controls/verify/priced-survey.mjs
 */

import { controlFor } from '../../../src/controls.js';
import { makeStudyJob } from '../../../src/scheduler.js';
import { Absent, RateCard, assume } from '../../../src/rates.js';
import { Gap, READING_BY_ID, refusesAxis, SpotHeight, axisFor, coverageOf, landPoint, makeSurvey, rowsFor } from '../../../src/survey.js';
import { CARRIED, basisFor, fakeScheduler, settle } from './fake-pool.mjs';
import { CARD, DESKS, PRICED_KEYS, billAt, harness, pricedReadings } from './kit.mjs';

const t = harness('a priced ground (gate 3)');
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function absorb(sv, job, iy) {
  job.curve.forEach((point, ix) => {
    if (!point || sv.at(ix, iy) instanceof SpotHeight) return;
    const { sample } = point;
    landPoint(sv, {
      ix,
      iy,
      readings: point.readings,
      basis: sample?.meterBasis ?? null,
      reason: point.refused ?? null,
      cacheKey: sample ? JSON.stringify(Object.entries({ ...job.snapshot, [job.key]: job.points[ix] }).filter(([k]) => !PRICED_KEYS.has(k))) : null,
      floorArea: sample?.meterBasis.floorArea ?? null,
    });
  });
}

function reprice(sv, live, card) {
  const axes = [sv.x, sv.y].filter((axis) => PRICED_KEYS.has(axis.key));
  for (const point of [...sv.points.values()]) {
    if (!point.basis) continue;
    const pricing = { ...live };
    for (const axis of axes) pricing[axis.key] = axis.positions[axis === sv.x ? point.ix : point.iy];
    const quantity = sv.readings[0].quantity;
    const bill = billAt(pricing, point.basis, card);
    const line = bill.lines.find((l) => !Number.isFinite(l[quantity.priced]));
    const rate = line && (quantity.priced === 'cost' ? line.costRate : line.carbonRate);
    landPoint(sv, {
      ix: point.ix,
      iy: point.iy,
      readings: pricedReadings(point.readings, point.basis, pricing, card),
      basis: point.basis,
      reason: rate?.reason ?? null,
      floorArea: point.floorArea,
      cacheKey: point.cacheKey,
    });
  }
}

async function measure({ xKey, yKey, reading, desk, count = 6, card }) {
  const stance = { ...desk };
  const sv = makeSurvey({
    x: axisFor(xKey, { count, stance }),
    y: axisFor(yKey, { count, stance }),
    readings: [READING_BY_ID[reading]],
    stance,
    patch: {},
    annual: true,
  });
  const { scheduler, counter } = fakeScheduler({ card });
  const specs = rowsFor(sv, { needed: CARRIED, carried: CARRIED, restShape: 'rest' });
  const jobs = specs.map((spec) => Object.assign(makeStudyJob(spec), { live: () => desk, iy: spec.iy }));
  scheduler.enqueueAll(jobs);
  await settle();
  for (const job of jobs) absorb(sv, job, job.iy);
  return { sv, counter };
}

// 1: one shaping axis against one priced axis costs the shaping axis.
{
  const { sv, counter } = await measure({ xKey: 'uFactor', yKey: 'heatEfficiency', reading: 'carbon', desk: DESKS.boiler });
  const coverage = coverageOf(sv);
  t.ok(`uFactor × heatEfficiency: ${counter.runs} runs for ${sv.x.count} uFactor positions`, counter.runs === sv.x.count);
  t.ok(`every one of ${sv.wanted} positions measured`, coverage.measured === sv.wanted);
  t.ok(`coverageOf(sv).runs === ${sv.x.count} (got ${coverage.runs})`, coverage.runs === sv.x.count);

  // 4: every spot height is the bill at its own two positions.
  let wrong = 0;
  for (const spot of sv.spots()) {
    const at = { ...DESKS.boiler, uFactor: spot.x, heatEfficiency: spot.y };
    if (!close(spot.readings.carbon, billAt(at, basisFor(at)).total('carbon'))) wrong += 1;
  }
  t.ok(`every spot height's carbon equals the bill there: ${wrong} disagreements`, wrong === 0);
}

// 2: two priced axes are one run.
{
  const { sv, counter } = await measure({ xKey: 'heatEfficiency', yKey: 'gridFactor', reading: 'carbon', desk: DESKS.boiler });
  t.ok(`heatEfficiency × gridFactor: ${counter.runs} run for ${sv.wanted} positions`, counter.runs === 1);
  t.ok('coverageOf(sv).runs === 1', coverageOf(sv).runs === 1);
}

// 3: a refused pairing is refused before anything is measured.
{
  let refusal = null;
  try {
    const stance = { ...DESKS.boiler };
    makeSurvey({
      x: axisFor('heatEfficiency', { stance }),
      y: axisFor('uFactor', { stance }),
      readings: [READING_BY_ID.tedi],
      stance,
      patch: {},
      annual: true,
    });
  } catch (failure) {
    refusal = failure.message;
  }
  t.ok('heatEfficiency × uFactor read for demand throws the pairing sentence', /Seasonal efficiency is applied after the run and cannot move heating \+ cooling demand\./.test(refusal ?? ''), refusal ?? 'accepted');
  t.ok('a priced axis is no longer refused alone', controlFor('gasPrice').channel.prices && refusesAxis('gasPrice') === null);
}

// 5: a rate that goes absent turns spots into gaps with its reason, and back.
{
  const priced = { ...DESKS.boiler };
  const withGas = assume(CARD, priced);
  const reason = 'No published gas tariff for this harness.';
  const withoutGas = new RateCard({ ...withGas, gas: new Absent({ what: 'Gas tariff', reason }) });
  // Published, so `assume` leaves each card as it stands.
  const live = { ...priced, rateBasis: 'Published', factorBasis: 'Published' };
  const { sv, counter } = await measure({ xKey: 'uFactor', yKey: 'gasPrice', reading: 'cost', desk: priced, card: withGas });
  const runs = counter.runs;
  const before = coverageOf(sv);
  t.ok(`a cost ground measured whole (${before.measured} of ${before.wanted})`, before.measured === before.wanted);

  reprice(sv, live, withoutGas);
  const gone = coverageOf(sv);
  const gaps = sv.gaps();
  t.ok(`every gas-heated spot is a gap (${gaps.length} of ${sv.wanted})`, gaps.length === sv.wanted && gone.measured === 0 && gone.runs === 0);
  t.ok('each gap carries the Absent rate\'s reason and keeps its basis', gaps.every((gap) => gap instanceof Gap && gap.reason === reason && gap.basis));

  reprice(sv, live, withGas);
  const back = coverageOf(sv);
  t.ok(`the rate restored brings every one back (${back.measured} of ${back.wanted})`, back.measured === back.wanted);
  t.ok(`with zero runs (${counter.runs - runs})`, counter.runs === runs);
  t.ok('and the same runs behind them', back.runs === before.runs);

  // A gap from a failed run keeps no basis and never comes back by re-pricing.
  landPoint(sv, { ix: 0, iy: 0, readings: null, reason: 'The run did not complete.' });
  reprice(sv, live, withGas);
  t.ok('a failed position stays a gap', sv.at(0, 0) instanceof Gap && !sv.at(0, 0).basis);
}

// Coverage refuses a run count it cannot hold.
{
  let threw = false;
  try {
    const { Coverage } = await import('../../../src/survey.js');
    new Coverage({ wanted: 4, measured: 2, gaps: 0, density: '2 × 2', runs: 3 });
  } catch {
    threw = true;
  }
  t.ok('Coverage throws for more runs than measured positions', threw);
}

t.done();
