/**
 * The study scheduler: every queued curve, drained sample by sample.
 *
 * The unit of work is one sample, not one study. A single sweep therefore
 * gets the whole pool — twenty-one samples fan out across every instance —
 * and a backlog of stale studies is just more samples in the same queue.
 *
 * DOM-free and engine-free, like `study.js` and for the same reason: the
 * interleavings this module owns — a Stop while queued, a desk moved
 * mid-drain, a station change with runs in flight, two studies sharing one
 * sample — are exactly where the bugs will live, and the Node harness has to
 * be able to script them against a fake pool.
 *
 * Everything effectful is injected:
 *   keyOf(job, value)          — cache identity of one sample
 *   buildSample(job, value)    — SYNCHRONOUS: overlay the shared document,
 *                                write the IDF, restore the live desk, and
 *                                return { idf, epw, floorArea }. The document
 *                                must never be left in overlay state across
 *                                an await; this contract is what makes a pool
 *                                safe against the pump.
 *   runSample(built)           — the pool; resolves to an engine result
 *   readPoint(job, result, built) — extract the metric numbers, or null
 *   paused()                   — true while a gesture is in progress
 *   capacity()                 — how many samples may be in flight at once
 *   onUpdate(job, event)       — 'point' | 'done' | 'failed' | 'cancelled',
 *                                and ('idle') with job null when the queue
 *                                runs dry
 */

export function makeStudyJob({ key, snapshot, patch, epw = null, annual, metric, restShape, points, order, origin, asked }) {
  return {
    key,
    snapshot,
    patch,
    epw,
    annual,
    metric,
    restShape,
    points,
    order,
    origin, // 'manual' | 'refresh'
    asked, // the sample count requested — the coarse pass is later densified
    curve: new Array(points.length),
    started: new Set(),
    done: 0,
    total: points.length,
    state: 'queued', // -> 'done' | 'cancelled'
    cancelled: false, // false | 'stopped' | 'moved' | 'cleared'
  };
}

export function createStudyScheduler({
  keyOf,
  buildSample,
  runSample,
  readPoint,
  paused,
  capacity,
  onUpdate,
  cacheLimit = 400,
}) {
  const jobs = []; // active jobs in dispatch priority order
  const byKey = new Map(); // key -> job, same objects
  // Metric numbers per sample shape — a couple of floats each, so hundreds of
  // entries cost nothing and revisited ground (a patch toggled back, a study
  // densified from its coarse pass) comes back without a run.
  const cache = new Map();
  // In-flight samples by cache key, so two studies wanting the same sample —
  // every study includes the current desk value — share one run. The entry is
  // owned by no job: cancelling one sharer never strands another, and the
  // result still lands in the cache for whoever asks next.
  const pending = new Map();
  let inFlight = 0;
  // Bumped by clearAll. A run that was in flight when the world changed — a
  // station swap clears the cache because sample shapes never carry the
  // climate — must not repopulate the cache when it lands late.
  let epoch = 0;
  let wasIdle = true;

  const active = (job) => job.state === 'queued' && !job.cancelled;

  function remember(ck, point) {
    if (cache.size >= cacheLimit) {
      // Maps iterate in insertion order, so the first key is the oldest.
      cache.delete(cache.keys().next().value);
    }
    cache.set(ck, point);
  }

  function land(job, index, point) {
    if (!active(job)) return; // cancelled while this sample was in flight
    job.curve[index] = { value: job.points[index], ...(point ?? {}) };
    job.done += 1;
    onUpdate(job, 'point');
    if (job.done < job.total) return;
    job.state = 'done';
    drop(job);
    const drew = job.curve.some(
      (p) => (p?.low ?? p?.high ?? p?.tedi ?? p?.cedi ?? p?.eui) != null,
    );
    onUpdate(job, drew ? 'done' : 'failed');
  }

  function drop(job) {
    const i = jobs.indexOf(job);
    if (i !== -1) jobs.splice(i, 1);
    if (byKey.get(job.key) === job) byKey.delete(job.key);
  }

  function takeNext() {
    for (const job of jobs) {
      if (!active(job)) continue;
      for (const index of job.order) {
        if (!job.started.has(index)) return { job, index };
      }
    }
    return null;
  }

  function dispatch(job, index) {
    job.started.add(index);
    const value = job.points[index];
    const ck = keyOf(job, value);

    const hit = cache.get(ck);
    if (hit !== undefined) {
      land(job, index, hit);
      return;
    }

    const shared = pending.get(ck);
    if (shared) {
      // Ride the run another job started; no capacity slot is consumed.
      shared.then(
        (point) => land(job, index, point),
        () => land(job, index, null),
      );
      return;
    }

    inFlight += 1;
    const epochAt = epoch;
    const promise = (async () => {
      const built = buildSample(job, value);
      const result = await runSample(built);
      return result?.success ? readPoint(job, result, built) : null;
    })();
    pending.set(ck, promise);
    promise.then(
      (point) => {
        pending.delete(ck);
        inFlight -= 1;
        // A failed sample is a gap, never a cached fact: a transient engine
        // failure must not poison every future study of this shape.
        if (point != null && epochAt === epoch) remember(ck, point);
        land(job, index, point);
        drain();
      },
      () => {
        // The run could not be attempted at all. Same gap as a failed run.
        pending.delete(ck);
        inFlight -= 1;
        land(job, index, null);
        drain();
      },
    );
  }

  function drain() {
    while (!paused() && inFlight < capacity()) {
      const next = takeNext();
      if (!next) break;
      dispatch(next.job, next.index);
    }
    const idle = inFlight === 0 && !jobs.some(active);
    if (idle && !wasIdle) onUpdate(null, 'idle');
    wasIdle = idle;
  }

  function cancel(job, reason) {
    if (!active(job)) return;
    job.cancelled = reason;
    job.state = 'cancelled';
    drop(job);
    onUpdate(job, 'cancelled');
  }

  return {
    /** Queue a study. A job already running under this key is superseded. */
    enqueue(job, { front = false } = {}) {
      const prior = byKey.get(job.key);
      if (prior) cancel(prior, 'moved');
      byKey.set(job.key, job);
      if (front) jobs.unshift(job);
      else jobs.push(job);
      wasIdle = false;
      drain();
    },

    /** Stop one study by key. In-flight samples land into nothing. */
    cancel(key, reason = 'stopped') {
      const job = byKey.get(key);
      if (job) cancel(job, reason);
      drain();
    },

    /** Cancel every job the predicate matches — a desk move, an auto-off. */
    cancelWhere(pred, reason) {
      for (const job of [...jobs]) {
        if (active(job) && pred(job)) cancel(job, reason);
      }
      drain();
    },

    /**
     * A station change: every job goes, and the cache with it — sample shapes
     * deliberately carry no climate, so curves solved under the old one must
     * not answer for the new. The epoch bump keeps runs still in flight from
     * writing the cleared cache when they land.
     */
    clearAll(reason = 'cleared') {
      epoch += 1;
      cache.clear();
      for (const job of [...jobs]) cancel(job, reason);
      drain();
    },

    /** Whether a study is queued or running under this key. */
    has: (key) => Boolean(byKey.get(key)),

    /** Resume dispatching — call when a pause condition lifts. */
    drain,

    /**
     * One line's worth of drain state. `manual` counts the jobs the reader
     * asked for by name, which is what decides whether the drain has any
     * claim on the status line at all.
     */
    progress() {
      let done = 0;
      let total = 0;
      let count = 0;
      let manual = 0;
      for (const job of jobs) {
        if (!active(job)) continue;
        count += 1;
        if (job.origin === 'manual') manual += 1;
        done += job.done;
        total += job.total;
      }
      return { jobs: count, manual, done, total, inFlight };
    },
  };
}
