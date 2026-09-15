/**
 * Quickstart gate 2 (T012): one run for a priced study, every position priced
 * at its own value (SC-001, SC-003, FR-008).
 *
 *   node specs/011-sweep-priced-controls/verify/priced-scheduler.mjs
 */

import { controlFor } from '../../../src/controls.js';
import { makeStudyJob } from '../../../src/scheduler.js';
import { SWEEP_SAMPLES, sampleOrder, samplePoints } from '../../../src/study.js';
import { CARRIED, basisFor, fakeScheduler, settle } from './fake-pool.mjs';
import { DESKS, PRICED_FACES, billAt, harness } from './kit.mjs';

const t = harness('a priced study (gate 2)');
const close = (a, b) => (a === null && b === null) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

function jobFor(key, desk) {
  const { control } = controlFor(key);
  const points = samplePoints(control, desk[key], SWEEP_SAMPLES);
  const job = makeStudyJob({
    key,
    snapshot: { ...desk },
    patch: {},
    annual: true,
    quantity: 'carbon',
    needed: CARRIED,
    restShape: 'rest',
    points,
    order: sampleOrder(points, desk[key]),
    origin: 'manual',
    asked: SWEEP_SAMPLES,
  });
  // What `pricingAt` reads for the priced keys the job does not sweep.
  job.live = () => desk;
  return job;
}

// 1 to 3: one run, cached thereafter, runs === 1.
{
  const { scheduler, counter } = fakeScheduler();
  const job = jobFor('heatEfficiency', DESKS.boiler);
  scheduler.enqueue(job);
  await settle();
  t.ok(`a ${job.total}-point heatEfficiency study costs one run (got ${counter.runs})`, counter.runs === 1);
  t.ok('it finished', job.state === 'done' && job.curve.every(Boolean));
  const again = jobFor('heatEfficiency', DESKS.boiler);
  scheduler.enqueue(again);
  await settle();
  t.ok(`re-enqueued, zero further runs (got ${counter.runs - 1})`, counter.runs === 1);
  t.ok('curveFor says one run behind it', scheduler.curveFor(again).runs === 1 && scheduler.curveFor(again).missing === 0);

  // 4: a shaping study on the same desk runs every position but the stance.
  const shaped = jobFor('wallR', DESKS.boiler);
  scheduler.enqueue(shaped);
  await settle();
  t.ok(
    `a ${shaped.total}-point wallR study costs ${shaped.total - 1} runs (got ${counter.runs - 1})`,
    counter.runs - 1 === shaped.total - 1,
  );
  t.ok('curveFor counts one run per shaping position', scheduler.curveFor(shaped).runs === shaped.total);
}

// SC-003: every priced face, three desks, every position equals the bill there.
{
  let disagreements = 0;
  let checked = 0;
  for (const [name, desk] of Object.entries(DESKS)) {
    for (const face of PRICED_FACES) {
      const { scheduler, counter } = fakeScheduler();
      const job = jobFor(face.key, desk);
      scheduler.enqueue(job);
      await settle();
      if (counter.runs !== 1) disagreements += 1;
      for (const point of scheduler.curveFor(job).curve) {
        const at = { ...desk, [face.key]: point.value };
        const bill = billAt(at, basisFor(at));
        const wanted = {
          eui: bill.intensity('metered'),
          cost: bill.total('cost'),
          carbon: bill.total('carbon'),
        };
        for (const field of ['eui', 'cost', 'carbon']) {
          checked += 1;
          const got = field === 'cost' ? point.cost?.value ?? null : point[field];
          if (!close(got, wanted[field])) disagreements += 1;
        }
        // And the landed curve agrees with the resolved one.
        const landed = job.curve.find((p) => p.value === point.value);
        if (landed.carbon !== point.carbon) disagreements += 1;
      }
    }
    console.log(`  ..   ${name}: priced`);
  }
  t.ok(`${checked} priced figures across 6 faces × 3 desks equal the bill: ${disagreements} disagreements`, disagreements === 0);
}

t.done();
