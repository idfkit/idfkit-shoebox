/**
 * Quickstart gate 4: the scheduler's design-list jobs. Fake pool, no engine.
 *
 * The five assertions of contracts/scheduler-designs.md. The change they
 * cover is additive — every existing caller passes no `designs` — so the
 * shape of the risk is not that studies break but that a plan quietly
 * starves them, or reads every design in a mixed job against one world's
 * context, which is the failure with no symptom on the page at all.
 */

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { createStudyScheduler, makeStudyJob } from '../../../src/scheduler.js';
import { VARIED, designAt, neighboursOf, worldOf } from '../../../src/space.js';
import { DesignLedger, Landed, designId } from '../../../src/strategy.js';
import { finish, ok, throws } from './desk.mjs';

const contents = { serialize: () => 'fake', answers: () => true, size: 0 };

// The cancel point's own arithmetic, restated: `deskKey` in `main.js`.
const deskKey = (params, patch, omit = []) => {
  const dropped = new Set(Array.isArray(omit) ? omit : [omit]);
  return JSON.stringify([Object.fromEntries(Object.entries(params).filter(([key]) => !dropped.has(key))), patch]);
};

function planJob(id, world, count, { context = (w) => w.signature } = {}) {
  const designs = Array.from({ length: count }, (_, index) => {
    const design = designAt(world, index);
    return { params: design.params, patch: world.patch, context: context(world) };
  });
  return makeStudyJob({
    id,
    key: null,
    snapshot: world.desk,
    patch: world.patch,
    annual: false,
    quantity: 'extremes',
    needed: contents,
    restShape: deskKey(world.desk, world.patch, VARIED),
    omits: VARIED,
    points: designs.map((_, index) => index),
    order: designs.map((_, index) => index),
    origin: 'strategy',
    asked: count,
    designs,
  });
}

function studyJob(key) {
  const points = [0, 1, 2, 3, 4];
  return makeStudyJob({
    key,
    snapshot: { key },
    patch: {},
    annual: false,
    quantity: 'extremes',
    needed: contents,
    restShape: 'rest',
    points,
    order: points.map((_, i) => i),
    origin: 'manual',
    asked: points.length,
  });
}

function fakePool() {
  const dispatched = [];
  const waiting = [];
  return {
    dispatched,
    run(built) {
      dispatched.push(built.id);
      return new Promise((resolve) => waiting.push(() => resolve({ success: true })));
    },
    async settle() {
      while (waiting.length) {
        waiting.shift()();
        for (let n = 0; n < 4; n += 1) await Promise.resolve();
      }
    },
  };
}

function scheduler(pool, { capacity = 4, contexts = [], onPoint = () => {} } = {}) {
  let held = false;
  const queue = createStudyScheduler({
    keyOf: (job, value) => {
      const exact = job.designs ? `${job.id}:${value}` : `${job.key}:${value}`;
      return { bucket: exact, exact };
    },
    buildSample: (job, value) => ({ id: job.designs ? job.id : job.key, value }),
    runSample: (built) => pool.run(built),
    readPoint: (job, result, built, context) => {
      contexts.push({ job: job.id, index: built.value, context });
      return { carried: contents, readings: { extremes: { high: built.value, low: 0 } }, meterBasis: null };
    },
    contextFor: (job, index) => (job.designs ? { world: job.designs[index].context } : { world: 'study' }),
    paused: () => held,
    capacity: () => capacity,
    onUpdate: (job, event) => {
      if (event === 'point') onPoint(job);
    },
  });
  return {
    ...queue,
    inOneBreath(fill) {
      held = true;
      fill(queue);
      held = false;
      queue.drain();
    },
  };
}

console.log("the scheduler's design-list jobs (gate 4)");

const home = worldOf(DEFAULT_PARAMETERS, DEFAULT_BYPASS);

/* ── 0. the job refuses a malformed design list ────────────────────────── */
{
  const designs = [{ params: home.desk, patch: home.patch }];
  const base = { id: 'x', key: null, snapshot: home.desk, patch: home.patch, annual: false, quantity: 'q', needed: contents, restShape: 'r', origin: 'strategy', asked: 1 };
  throws('points other than the indices are refused', () => makeStudyJob({ ...base, omits: VARIED, points: [5], order: [0], designs }), 'indices');
  throws('an entry with no patch is refused', () => makeStudyJob({ ...base, omits: VARIED, points: [0], order: [0], designs: [{ params: home.desk }] }), 'patch');
  throws('a design-list job with no omits is refused', () => makeStudyJob({ ...base, omits: null, points: [0], order: [0], designs }), 'leaves out');
}

/* ── 1. every index lands exactly once ─────────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool);
  const job = planJob('home:designs', home, 64);
  queue.enqueue(job);
  await pool.settle();
  const once = new Set(pool.dispatched.map((_, at) => at)).size === pool.dispatched.length;
  ok('a design-list job lands every index exactly once', job.done === job.total && job.total === 64 && once, `${job.done}/${job.total}`);
  ok('and every point on its curve is filled', job.curve.every((point) => point && point.value === job.curve.indexOf(point)));
}

/* ── 2. a study is not starved by a plan ───────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 4 });
  queue.inOneBreath((q) => {
    q.enqueue(planJob('home:designs', home, 512));
    q.enqueue(planJob('home:probes', home, 512));
    q.enqueue(planJob('neighbours', home, 640));
    q.enqueue(studyJob('wallR'));
  });
  const first = pool.dispatched.indexOf('wallR');
  ok(
    'a study behind a 1,664-design plan dispatches within its first four turns',
    first >= 0 && first < 4,
    `first study dispatch was ${first}`,
  );
  await pool.settle();
  const last = pool.dispatched.lastIndexOf('wallR');
  ok('and finishes long before the plan does', last < 40, `last study dispatch was ${last} of ${pool.dispatched.length}`);
}

/* ── 3. a mixed job hands each design its own world's context ──────────── */
{
  const gainsIn = worldOf(DEFAULT_PARAMETERS, { ...DEFAULT_BYPASS, gains: false });
  const bedroom = neighboursOf(gainsIn).find((n) => n.world && n.door.id === 'roomType').world;
  const designs = [];
  for (let index = 0; index < 16; index += 1) {
    const world = index % 2 ? bedroom : gainsIn;
    designs.push({ params: designAt(world, index).params, patch: world.patch, context: world.signature });
  }
  const job = makeStudyJob({
    id: 'neighbours',
    key: null,
    snapshot: gainsIn.desk,
    patch: gainsIn.patch,
    annual: false,
    quantity: 'extremes',
    needed: contents,
    restShape: 'r',
    omits: VARIED,
    points: designs.map((_, i) => i),
    order: designs.map((_, i) => i),
    origin: 'strategy',
    asked: designs.length,
    designs,
  });
  const pool = fakePool();
  const contexts = [];
  const queue = scheduler(pool, { contexts });
  queue.enqueue(job);
  await pool.settle();
  const wrong = contexts.filter(({ index, context }) => context.world !== designs[index].context);
  ok(
    'a neighbours job mixing two roomType worlds reads each design against its own world',
    contexts.length === 16 && wrong.length === 0 && new Set(contexts.map((c) => c.context.world)).size === 2,
    `${wrong.length} of ${contexts.length} read against the wrong world`,
  );
}

/* ── 4. the cancel point ───────────────────────────────────────────────── */
{
  const pool = fakePool();
  const queue = scheduler(pool, { capacity: 1 });
  const jobs = [planJob('home:designs', home, 64), planJob('home:probes', home, 64)];
  queue.enqueueAll(jobs);
  const cancelAt = (params) =>
    queue.cancelWhere((job) => job.restShape !== deskKey(params, home.patch, job.omits), 'moved');

  cancelAt({ ...home.desk, wallR: 7.5, wwrS: 0.1 });
  ok('moving varied controls cancels no plan job', jobs.every((job) => !job.cancelled));

  cancelAt({ ...home.desk, terrain: 'City' });
  ok("opening a door cancels every plan job as 'moved'", jobs.every((job) => job.cancelled === 'moved'));
  await pool.settle();
}

/* ── 5. clearAll takes the ledger with it, and a late landing writes neither ─ */
{
  const pool = fakePool();
  const ledger = new DesignLedger();
  const job = planJob('home:designs', home, 8);
  job.ledgerEpoch = ledger.epoch;
  const queue = scheduler(pool, {
    capacity: 8,
    onPoint: (j) => {
      for (let index = 0; index < j.curve.length; index += 1) {
        const point = j.curve[index];
        if (point) ledger.land(designId(home, index), new Landed({ readings: point.sample.readings }), j.ledgerEpoch);
      }
    },
  });
  queue.enqueue(job);
  ok('eight runs are in flight before the station changes', pool.dispatched.length === 8);
  queue.clearAll();
  ledger.clear();
  await pool.settle();
  ok('a landing from the old epoch writes no ledger entry', ledger.size === 0, `${ledger.size} entries`);
  const { missing } = queue.curveFor(planJob('again', home, 8));
  ok('and no cache entry', missing === 8, `${8 - missing} came back from the cache`);
  ok(
    "and an explicit landing under the old epoch is refused",
    ledger.land(designId(home, 0), new Landed({ failure: 'late' }), 0) === false,
  );
}

finish();
