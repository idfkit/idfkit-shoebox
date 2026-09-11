/**
 * FR-053: a survey and a study share the pool without either starving.
 *
 * Driven against a fake pool, so this is arithmetic about interleaving and
 * nothing else — no engine, no document, no schema. That is the whole reason
 * `scheduler.js` takes every effect by injection.
 *
 * The failure this exists to catch is not subtle once you can see it, and was
 * invisible before: under the strict `for (const job of jobs)` walk this
 * replaced, job 1 drained completely before job 2 started a single sample. One
 * study is one job, so nothing on the desk ever exercised it. A survey is a
 * stack of jobs enqueued in one breath, and the reader's symptom is a study
 * card sitting at `0 / 21` for the whole duration of a survey with nothing
 * anywhere saying why.
 */

import { createStudyScheduler, makeStudyJob } from '../../../src/scheduler.js';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

/** The two shapes `makeStudyJob` asserts, and nothing more than they need. */
const contents = {
  serialize: () => 'fake',
  answers: () => true,
  size: 0,
};

function job(key, { points = [0, 1, 2, 3, 4], origin = 'refresh' } = {}) {
  return makeStudyJob({
    key,
    snapshot: { key },
    patch: {},
    annual: false,
    quantity: 'extremes',
    needed: contents,
    carried: contents,
    restShape: 'rest',
    points,
    order: points.map((_, i) => i),
    origin,
    asked: points.length,
  });
}

/**
 * A pool that hands back a resolver per run, so the harness decides when each
 * sample lands. Nothing here races: every `await` in the test is a settled
 * microtask flush, and the order samples are *dispatched* in is the whole
 * measurement.
 */
function fakePool() {
  const dispatched = [];
  const waiting = [];
  return {
    dispatched,
    run(built) {
      dispatched.push(built.key);
      return new Promise((resolve) => waiting.push(() => resolve({ success: true, key: built.key })));
    },
    /** Land every run currently in flight, then let the queue refill. */
    async settle() {
      while (waiting.length) {
        const next = waiting.shift();
        next();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

/**
 * A scheduler whose dispatch can be held shut.
 *
 * `enqueue` drains on the way out, so enqueuing eleven rows one at a time
 * fills the pool from row 0 before row 1 is even in the list — which is a true
 * fact about the scheduler and a false model of a survey. A survey enqueues
 * its rows in one synchronous breath and *then* the queue drains, which is
 * what `hold` reproduces. Without it the first three dispatches are row 0's,
 * legitimately, and the harness would be measuring the order of its own
 * `for` loop rather than the order of the walk.
 */
function scheduler(pool, { capacity = 2 } = {}) {
  let n = 0;
  let held = false;
  const queue = createStudyScheduler({
    // Every sample distinct, so nothing is ever a cache hit and the dispatch
    // order under test is the dispatch order observed.
    keyOf: (j, value) => {
      const exact = `${j.key}:${value}`;
      return { bucket: exact, exact };
    },
    buildSample: (j, value) => ({ key: j.key, value, idf: '', carried: j.carried }),
    runSample: (built) => pool.run(built),
    readPoint: () => ({ carried: contents, readings: { extremes: (n += 1) }, meterBasis: null }),
    paused: () => held,
    capacity: () => capacity,
    onUpdate: () => {},
  });
  return {
    ...queue,
    /** Enqueue everything, then let it go — the survey's own one breath. */
    inOneBreath(fill) {
      held = true;
      fill(queue);
      held = false;
      queue.drain();
    },
  };
}

console.log('scheduler fairness (FR-053)');

/* ── one survey against one study ──────────────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 2 });

  // Eleven rows of a survey, then one study behind them — the exact shape the
  // reader hits: open a survey, then press Study on a control.
  queue.inOneBreath((q) => {
    for (let row = 0; row < 11; row += 1) q.enqueue(job(`row${row}`));
    q.enqueue(job('study', { origin: 'manual' }));
  });

  await pool.settle();

  const studySamples = pool.dispatched.filter((key) => key === 'study').length;
  ok(
    'the study is dispatched at all while an 11-row survey drains',
    studySamples > 0,
    `${studySamples} of its 5 samples ran in ${pool.dispatched.length} dispatches`,
  );

  // The sharper statement, and the one a strict walk fails outright: the study
  // starts inside the first pass over the twelve jobs. Under job-order
  // dispatch its first sample is the 56th of 60 — the study begins only once
  // all eleven survey rows have finished, which is the hang the reader sees.
  const firstStudy = pool.dispatched.indexOf('study');
  ok(
    'the study starts inside the first pass, not after the survey finishes',
    firstStudy >= 0 && firstStudy < 12,
    `first study sample was dispatch ${firstStudy} of ${pool.dispatched.length}`,
  );

  const lastStudy = pool.dispatched.lastIndexOf('study');
  ok(
    'the study finishes without waiting out the whole survey',
    lastStudy < pool.dispatched.length - 1,
    `last study sample was dispatch ${lastStudy} of ${pool.dispatched.length}`,
  );
}

/* ── the rows advance together ─────────────────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 3 });
  queue.inOneBreath((q) => {
    for (let row = 0; row < 5; row += 1) q.enqueue(job(`row${row}`));
  });

  await pool.settle();

  // FR-009 in miniature: after the first pass every row has been touched, so
  // the coarse ground lands as a complete low-resolution relief rather than as
  // one finished row over four empty ones.
  const firstPass = pool.dispatched.slice(0, 5);
  ok(
    'the first pass touches every row once',
    new Set(firstPass).size === 5,
    `first five dispatches were ${firstPass.join(', ')}`,
  );
}

/* ── the invariant a wrong fix would break ─────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 4 });
  queue.inOneBreath((q) => {
    for (let row = 0; row < 6; row += 1) q.enqueue(job(`row${row}`));
  });

  await pool.settle();

  // Every dispatched index goes into `job.started` before its dispatch. Get
  // that wrong and a sample runs twice: the engine cost doubles silently and
  // `job.done` overruns `job.total`, which draws as a curve that never
  // finishes.
  const counted = new Map();
  for (const key of pool.dispatched) counted.set(key, (counted.get(key) ?? 0) + 1);
  ok(
    'no sample is dispatched twice',
    [...counted.values()].every((n) => n === 5),
    [...counted].map(([k, n]) => `${k}=${n}`).join(' '),
  );
  ok('every row completed', counted.size === 6);
}

/* ── a cancelled job cannot hold the cursor ────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 1 });
  queue.inOneBreath((q) => {
    for (let row = 0; row < 4; row += 1) q.enqueue(job(`row${row}`));
  });
  // Cancel the row the cursor most likely sits on, mid-drain. The cursor is an
  // index into the *active* jobs and the list is spliced under it, so this is
  // the shape that would strand the walk if the cursor held a job reference.
  queue.cancel('row1', 'stopped');
  await pool.settle();

  const seen = new Set(pool.dispatched);
  ok(
    'the surviving rows all drain after one is cancelled mid-drain',
    seen.has('row0') && seen.has('row2') && seen.has('row3'),
    [...seen].join(', '),
  );
  ok('the cancelled row stops being dispatched', pool.dispatched.filter((k) => k === 'row1').length < 5);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
