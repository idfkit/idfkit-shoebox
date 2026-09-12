/**
 * Quickstart gate 12: the campaign's hold on the shared queue. Fake pool, no
 * engine.
 *
 * The six assertions of contracts/campaign.md. `holdWhere` is additive, so the
 * risk is not that studies break but the two quiet failures a pause invites: a
 * resumed job starting an index twice, which spends a run for nothing, and a
 * queue of held jobs never reporting idle, which leaves the studies' densify
 * pass waiting for ever with nothing anywhere to say why.
 *
 * The fake jobs and pool are `fake-queue.mjs`, shared with scheduler-designs.
 */

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { createStudyScheduler } from '../../../src/scheduler.js';
import { worldOf } from '../../../src/space.js';
import { DesignLedger, Landed, designId } from '../../../src/strategy.js';
import { finish, ok } from './desk.mjs';
import { contents, fakePool, planJob, studyJob } from './fake-queue.mjs';

function scheduler(pool, { capacity = 4, onPoint = () => {}, events = [] } = {}) {
  return createStudyScheduler({
    keyOf: (job, value) => {
      const exact = job.designs ? `${job.id}:${value}` : `${job.key}:${value}`;
      return { bucket: exact, exact };
    },
    buildSample: (job, value) => ({ id: job.designs ? job.id : job.key, value }),
    runSample: (sample) => pool.run(sample),
    readPoint: (job, result, sample) => ({
      carried: contents,
      readings: { extremes: { high: sample.value, low: 0 } },
      meterBasis: null,
    }),
    paused: () => false,
    capacity: () => capacity,
    onUpdate: (job, event, index) => {
      events.push({ job: job?.id ?? null, event });
      if (event === 'point') onPoint(job, index);
    },
  });
}

const strategy = (job) => job.origin === 'strategy';
const home = worldOf(DEFAULT_PARAMETERS, DEFAULT_BYPASS);

console.log("the campaign's hold on the queue (gate 12)");

/* ── 1 to 3. hold beside a study, land what was in flight, release in order ─ */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 4 });
  const plan = planJob('strategy:designs', home, 64);
  const study = studyJob('wallR');
  queue.enqueueAll([plan, study]);
  const before = pool.of(plan.id).length;
  queue.holdWhere(strategy, true);
  ok('a plan job is held without being cancelled', plan.held === true && !plan.cancelled && queue.has(plan.id));
  await pool.settle();
  ok(
    'a held job dispatches nothing more',
    pool.of(plan.id).length === before,
    `${pool.of(plan.id).length - before} dispatched while held`,
  );
  ok('while a study beside it keeps its turns and finishes', study.state === 'done' && pool.of('wallR').length === 5);

  ok(
    '2. the runs in flight when it was held land',
    plan.done === before && before > 0,
    `${plan.done} landed of ${before} in flight`,
  );
  const { missing } = queue.curveFor(planJob('strategy:designs', home, 64));
  ok('and are cached', missing === 64 - before, `${64 - before - missing} of ${before} came back`);

  queue.holdWhere(strategy, false);
  await pool.settle();
  const order = pool.of(plan.id);
  ok(
    '3. release continues the same indices, in the same order',
    order.every((value, at) => value === at) && order.length === 64,
    `${order.slice(0, 10).join(',')}…`,
  );
  ok('with no index started twice', new Set(order).size === order.length && plan.done === 64 && plan.state === 'done');
}

/* ── 4. a job enqueued already held waits ──────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool);
  const plan = planJob('strategy:neighbours', home, 16, { held: true });
  queue.enqueue(plan);
  await pool.settle();
  ok('4. a job admitted held dispatches nothing', pool.built.length === 0 && plan.done === 0);
  queue.holdWhere(strategy, false);
  await pool.settle();
  ok('until it is released', plan.done === 16 && plan.state === 'done');
}

/* ── 5. a queue of held jobs is idle ───────────────────────────────────── */
{
  const pool = fakePool();
  const events = [];
  const queue = scheduler(pool, { events });
  const plan = planJob('strategy:probes', home, 8, { held: true });
  queue.enqueue(plan);
  const idle = () => events.filter((e) => e.event === 'idle').length;
  ok("5. a queue holding only held jobs fires 'idle'", idle() === 1, `${idle()} idle events`);
  queue.holdWhere(strategy, false);
  ok('releasing one makes it busy again', queue.progress().inFlight > 0 && pool.built.length > 0);
  await pool.settle();
  ok("and it fires 'idle' again once drained", idle() === 2, `${idle()} idle events`);
}

/* ── 5b. a manual study finishes beside a held plan ────────────────────── */
// Found driving gate 13: the status line lettered "Study drawn" only once the
// whole queue was empty, so a study finished during a pause read "32 of 365
// samples solved" for as long as the pause lasted. The line now asks whether
// any study the reader asked for is running, which is `progress().manual`.
{
  const pool = fakePool();
  const queue = scheduler(pool);
  const plan = planJob('strategy:designs', home, 16, { held: true });
  const study = studyJob('depth');
  queue.enqueueAll([plan, study]);
  await pool.settle();
  const p = queue.progress();
  ok(
    '5b. a study beside a held plan finishes and leaves no manual job running',
    study.state === 'done' && p.manual === 0 && p.jobs === 1,
    JSON.stringify(p),
  );
}

/* ── 6. cancelling a held job leaves the ledger alone ──────────────────── */
{
  const pool = fakePool();
  const ledger = new DesignLedger();
  const events = [];
  const queue = scheduler(pool, {
    capacity: 4,
    events,
    onPoint: (job, index) => {
      ledger.land(designId(home, index), new Landed({ readings: job.curve[index].sample.readings }), ledger.epoch);
    },
  });
  const plan = planJob('strategy:designs', home, 16);
  queue.enqueue(plan);
  queue.holdWhere(strategy, true);
  await pool.settle();
  const kept = ledger.size;
  queue.cancel(plan.id, 'cancelled');
  ok(
    "6. cancelling a held job fires 'cancelled'",
    events.some((e) => e.job === plan.id && e.event === 'cancelled') && plan.cancelled === 'cancelled',
  );
  ok('and leaves the ledger entries in place', kept === 4 && ledger.size === kept, `${ledger.size} of ${kept}`);
  await pool.settle();
  ok('and dispatches nothing after', pool.of(plan.id).length === 4);
}

/* ── 7. a failed sample lands carrying its reason ──────────────────────── */
// The reason travels with the landing, not through a side map: a sample whose
// run throws lands as a gap with the thrown message on its point, and a job
// riding the same run is handed the same message.
{
  const failing = {
    run: () => Promise.reject(new Error('Fatal: Program terminates due to above conditions.')),
  };
  const queue = createStudyScheduler({
    keyOf: (job, value) => ({ bucket: `shared:${value}`, exact: `shared:${value}` }),
    buildSample: (job, value) => ({ id: job.id, value }),
    runSample: (sample) => failing.run(sample),
    readPoint: () => null,
    paused: () => false,
    capacity: () => 4,
    onUpdate: () => {},
  });
  const first = planJob('strategy:one', home, 2);
  const rider = planJob('strategy:two', home, 2);
  queue.enqueueAll([first, rider]);
  for (let n = 0; n < 8; n += 1) await Promise.resolve();
  const reasons = [...first.curve, ...rider.curve].map((point) => point?.failure);
  ok(
    '7. a failed sample carries its reason, and so does a job riding its run',
    reasons.length === 4 && reasons.every((reason) => reason === 'Fatal: Program terminates due to above conditions.'),
    reasons.join(' | '),
  );
}

finish();
