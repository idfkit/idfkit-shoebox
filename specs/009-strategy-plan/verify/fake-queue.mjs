/**
 * Shared by the scheduler gates: the fake jobs and the fake pool they queue
 * against. Not a harness itself.
 *
 * `scheduler-designs.mjs` and `scheduler-hold.mjs` each carried a copy of
 * these, line for line, and a fake that drifts between two gates is two
 * different fakes passing two different tests.
 */

import { makeStudyJob } from '../../../src/scheduler.js';
import { VARIED, designAt } from '../../../src/space.js';

/** Carried and needed contents that answer everything, so reuse never decides a test. */
export const contents = { serialize: () => 'fake', answers: () => true, size: 0 };

/** The cancel point's own arithmetic, restated: `deskKey` in `main.js`. */
export const deskKey = (params, patch, omit = []) => {
  const dropped = new Set(Array.isArray(omit) ? omit : [omit]);
  return JSON.stringify([Object.fromEntries(Object.entries(params).filter(([key]) => !dropped.has(key))), patch]);
};

/** A plan's design-list job of the first `count` designs of one world. */
export function planJob(id, world, count, { context = (w) => w.signature, held = false } = {}) {
  const designs = Array.from({ length: count }, (_, index) => ({
    params: designAt(world, index).params,
    patch: world.patch,
    context: context(world),
  }));
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
    held,
  });
}

/** A reader's study of five positions of one key. */
export function studyJob(key) {
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

/**
 * A pool that holds every run until `settle()`, recording each built sample
 * (`built`, and the job ids alone in `dispatched`) in dispatch order.
 */
export function fakePool() {
  const built = [];
  const dispatched = [];
  const waiting = [];
  return {
    built,
    dispatched,
    of: (id) => built.filter((b) => b.id === id).map((b) => b.value),
    run(sample) {
      built.push(sample);
      dispatched.push(sample.id);
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
