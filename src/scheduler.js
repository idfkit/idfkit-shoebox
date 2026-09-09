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
 *   contextFor(job)            — SYNCHRONOUS: the facts this metric's reader
 *                                needs that the sweep does not change, built
 *                                once for the whole study (see below)
 *   paused()                   — true while a gesture is in progress
 *   capacity()                 — how many samples may be in flight at once
 *   onUpdate(job, event)       — 'point' | 'done' | 'failed' | 'cancelled',
 *                                and ('idle') with job null when the queue
 *                                runs dry
 */

/**
 * One study, as the queue holds it.
 *
 * `metric` is a `Metric` id declared in `study.js`, which is also where the
 * reporting profile a sample of that metric is written with, and the reader the
 * finished run is handed to, are declared beside it. It is *not* validated here
 * and deliberately so: this module imports nothing, because the interleavings
 * it owns are what the Node harness has to be able to script against a fake
 * pool, and a scheduler that pulls in the model to check a string would make
 * that harness carry the schema.
 *
 * `points` is asserted, though, because two ways of getting it wrong both end
 * as a card that never finishes and never says why. A non-numeric position
 * cannot be sampled at all — `samplePoints` refuses a control with no face
 * before it comes to this, and this is the second gate, for a caller reaching
 * past the console — and an `order` that does not name every index exactly once
 * leaves `job.done` short of `job.total` for ever, which draws as "Solving
 * 17 / 21" until the desk moves.
 */
export function makeStudyJob({ key, snapshot, patch, epw = null, annual, metric, restShape, points, order, origin, asked }) {
  if (!Array.isArray(points) || !points.length || points.some((v) => !Number.isFinite(v))) {
    throw new Error(`makeStudyJob: the study of ${key} carries no numeric positions to sample`);
  }
  const named = new Set(order);
  if (named.size !== points.length || order.some((i) => !Number.isInteger(i) || i < 0 || i >= points.length)) {
    throw new Error(
      `makeStudyJob: the study of ${key} has ${points.length} positions and an order naming ` +
        `${named.size} of them, so it could never finish`,
    );
  }
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
    // What `contextFor` returned, and whether it has been asked. The two are
    // separate fields because `null` is a legitimate answer — most metrics need
    // no context at all — and folding "nothing to carry" into "not yet built"
    // would have the hook called once per sample for every study on the desk,
    // which is the cost this exists to avoid.
    context: null,
    contextTaken: false,
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
  contextFor = () => null,
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
  //
  // A job's `context` is not part of that key and must never need to be. What a
  // metric carries there is a fact about the climate rather than about the
  // sample — TM59's running mean is the attached weather file's, read at the
  // same days whatever the sliders say — and the cache is already cleared whole
  // on a station change, which is the only thing that can move it.
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

  /**
   * Whether one landed sample carries a reading at all.
   *
   * `value` is the position on the face, which every sample has whether its run
   * answered or not, so it is the one key that says nothing. Everything else in
   * the point is the metric's own — `low` and `high`, `tedi` and `cedi`, a
   * criterion's `share` — and this is deliberately blind to which: a list of key
   * names here has to be edited every time a metric is declared in `study.js`,
   * and forgetting to has no symptom but a finished sweep reporting "failed"
   * over a card the reader can see a curve on.
   */
  const drew = (p) => p != null && Object.keys(p).some((k) => k !== 'value' && p[k] != null);

  function land(job, index, point) {
    if (!active(job)) return; // cancelled while this sample was in flight
    job.curve[index] = { value: job.points[index], ...(point ?? {}) };
    job.done += 1;
    onUpdate(job, 'point');
    if (job.done < job.total) return;
    job.state = 'done';
    drop(job);
    onUpdate(job, job.curve.some(drew) ? 'done' : 'failed');
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
      // Drain after landing, as the owning run does: a job whose last sample
      // rode someone else's run would otherwise finish after the owner's own
      // drain had already run, leaving `wasIdle` false and the queue running
      // dry without ever saying so.
      shared.then(
        (point) => {
          land(job, index, point);
          drain();
        },
        () => {
          land(job, index, null);
          drain();
        },
      );
      return;
    }

    // Resolved here, once per study, and synchronously.
    //
    // Once per study because a sample is the desk with one control moved, and
    // the sweep deliberately does not move the climate: TM59's running mean is
    // built from the attached weather file's 365 daily means, and it is the
    // same line for every sample of the sweep. Per sample it would be the same
    // answer computed twenty-one times — measured on a Chicago TMY3 file under
    // Node, `runningMean(dailyMeans(epw))` is 5.2 ms cold and 3.4 ms warm, so
    // 71 ms over a twenty-one point curve, which is more than a whole design
    // day solve. That is the smaller half of the argument. The larger half is
    // that a fact rebuilt per sample is a fact that can be rebuilt *from* the
    // sample, and a comfort line read off a sample's own overlay would be the
    // study quietly judging each building against a different line.
    //
    // Which is also the one thing a `contextFor` may not do: read anything the
    // swept control can move. It is handed `job`, whose `snapshot` is the desk
    // the sweep started from, so a fact taken from the swept key's own value
    // there would describe the first sample and then be lettered over all
    // twenty-one. Both facts criterion a needs pass that test — the running
    // mean is the climate's, and the occupied-hour floor is `roomType`'s, which
    // is a `Selector` and carries no face to sweep along.
    //
    // Not in `makeStudyJob`, because a job is cheap and a queued one is often
    // never run: `refreshStudies` queues on every gesture release and
    // `applyGeometry` cancels again on the next move, and a densify that comes
    // back entirely from the cache reaches no engine at all. Those pay nothing.
    //
    // And synchronously, before the promise, because everything inside that
    // promise lands as a gap. A reader that throws is a bug in the reader and a
    // context that cannot be built is a bug in the caller, and both would
    // otherwise arrive as twenty-one silently missing samples under a card
    // reporting no readings; out here it throws in the caller's own stack, at
    // the study's first dispatch. It must not touch the shared document —
    // that is `buildSample`'s one synchronous breath and nothing else may be
    // inside it.
    if (!job.contextTaken) {
      job.context = contextFor(job);
      job.contextTaken = true;
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
