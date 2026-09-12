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
 *   readPoint(job, result, built) — extract every answerable quantity, or null
 *                                (handed the context as a fourth argument)
 *   refuses(job, value)        — SYNCHRONOUS and pure: the sentence saying why
 *                                this position is not the building the sweep
 *                                is about, or null. A refused position is
 *                                never built, run or cached; it lands as a
 *                                point carrying the sentence and draws as a
 *                                gap. Asked by `dispatch` and by `curveFor`
 *                                alike, so a curve resolved from the cache
 *                                classifies a position the way a drain does —
 *                                which is also why it must be pure and cheap
 *   contextFor(job)            — SYNCHRONOUS: facts the quantity readers
 *                                needs that the sweep does not change, built
 *                                once for the whole study (see below);
 *                                contextFor(job, index) for a design-list job,
 *                                once per distinct world it carries
 *   paused()                   — true while a gesture is in progress
 *   capacity()                 — how many samples may be in flight at once
 *   onUpdate(job, event)       — 'point' | 'done' | 'failed' | 'cancelled',
 *                                and ('idle') with job null when the queue
 *                                runs dry
 */

/**
 * One study, as the queue holds it.
 *
 * `quantity` chooses one reading out of a landed sample, while `needed` and
 * `carried` decide reuse. None enters the control-key identity of the study.
 * The declarations stay outside this module so its interleavings can be driven
 * from Node against a fake pool without carrying the model or schema.
 *
 * `points` is asserted, though, because two ways of getting it wrong both end
 * as a card that never finishes and never says why. A non-numeric position
 * cannot be sampled at all — `samplePoints` refuses a control with no face
 * before it comes to this, and this is the second gate, for a caller reaching
 * past the console — and an `order` that does not name every index exactly once
 * leaves `job.done` short of `job.total` for ever, which draws as "Solving
 * 17 / 21" until the desk moves.
 */
export function makeStudyJob({
  id = null,
  key,
  snapshot,
  patch,
  epw = null,
  annual,
  quantity,
  needed,
  carried = needed,
  restShape,
  omits = key,
  points,
  order,
  origin,
  asked,
  openingBasis = null,
  designs = null,
  held = false,
}) {
  if (!Array.isArray(points) || !points.length || points.some((v) => !Number.isFinite(v))) {
    throw new Error(`makeStudyJob: the study of ${key ?? id} carries no numeric positions to sample`);
  }
  // A job whose points are whole designs rather than positions of one key.
  //
  // A study moves one control and a plan design moves every varied control at
  // once, so the strategy plan cannot be expressed as positions along a face.
  // It could be expressed as a thousand one-point jobs, and the round-robin
  // below would then hand a study one dispatch in 1,025 — FR-011's "must not
  // delay" broken by arithmetic. So a job may carry its designs outright, and
  // `points` are then just their indices, which keeps every other line of this
  // module — the order, the curve, `started`, `done` — exactly as it was.
  if (designs !== null) {
    if (!Array.isArray(designs) || !designs.length) {
      throw new Error(`makeStudyJob: the design-list job ${id} carries no designs`);
    }
    if (points.length !== designs.length || points.some((value, at) => value !== at)) {
      throw new Error(
        `makeStudyJob: the design-list job ${id} has ${designs.length} designs, so its points must be the ` +
          'indices 0 to n − 1 and nothing else',
      );
    }
    designs.forEach((entry, at) => {
      if (!entry?.params || !entry?.patch) {
        throw new Error(`makeStudyJob: design ${at} of ${id} carries no ${entry?.params ? 'patch' : 'params'}`);
      }
    });
    // With no single key there is nothing for `omits` to default to, and a
    // job the cancel point cannot take the rest shape of would be cancelled on
    // every apply the desk makes — including the ones its own samples cause.
    if (omits === null || omits === undefined) {
      throw new Error(`makeStudyJob: the design-list job ${id} must say which keys its rest shape leaves out`);
    }
  } else if (!key) {
    throw new Error('makeStudyJob: a study with no designs needs the key it sweeps');
  }
  const named = new Set(order);
  if (named.size !== points.length || order.some((i) => !Number.isInteger(i) || i < 0 || i >= points.length)) {
    throw new Error(
      `makeStudyJob: the study of ${key} has ${points.length} positions and an order naming ` +
        `${named.size} of them, so it could never finish`,
    );
  }
  if (!quantity || !needed?.serialize || !carried?.serialize || !carried.answers?.(needed)) {
    throw new Error(`makeStudyJob: the study of ${key} needs a quantity and comparable carried contents`);
  }
  return {
    // What the queue arbitrates on, which is not always the parameter key.
    //
    // A study is one curve of one control, so its identity and its swept key
    // are the same thing and `id` defaults to `key`. A survey is a stack of
    // rows that all sweep the same control at different values of a second
    // one, and under `key` the scheduler's `byKey` would treat each row as
    // superseding the last: enqueue nine rows in one breath and eight of them
    // are cancelled as 'moved' before a single sample is dispatched, leaving a
    // ground one row deep with nothing anywhere saying why.
    //
    // So the two are separated. `key` stays the parameter `buildSample`
    // overlays and `restShapeKey` is taken against; `id` is what `enqueue`,
    // `cancel` and `has` speak.
    id: id ?? key,
    key,
    snapshot,
    patch,
    epw,
    annual,
    quantity,
    needed,
    carried,
    restShape,
    // The key or keys `restShape` leaves out, so the cancel point can take the
    // live desk's shape the same way without knowing who owns the job.
    omits,
    points,
    order,
    origin, // 'manual' | 'refresh' | 'survey' | 'pull' | 'strategy'
    asked, // the sample count requested — the coarse pass is later densified
    openingBasis,
    curve: new Array(points.length),
    started: new Set(),
    // What `contextFor` returned, and whether it has been asked. The two are
    // separate fields because `null` is a legitimate answer — most quantities need
    // no context at all — and folding "nothing to carry" into "not yet built"
    // would have the hook called once per sample for every study on the desk,
    // which is the cost this exists to avoid.
    context: null,
    contextTaken: false,
    // A design-list job's designs, and its contexts memoised by each entry's
    // own `context` signature. A plan's neighbours job mixes worlds, and a
    // world's `roomType` decides the occupied-hour floor TM59 a and c read, so
    // one context per job would judge every design against the first design's
    // room. Frozen, because the scheduler reads an entry at dispatch time and a
    // caller mutating one in between would run a desk nobody queued.
    designs: designs === null ? null : Object.freeze([...designs]),
    contexts: designs === null ? null : new Map(),
    done: 0,
    total: points.length,
    // Held by the reader rather than cancelled (`holdWhere`): the job keeps its
    // place, its `order`, `started` and `curve`, and dispatches nothing until
    // released, so a resumed campaign continues exactly where it stopped.
    held,
    state: 'queued', // -> 'done' | 'cancelled'
    cancelled: false, // false | 'stopped' | 'moved' | 'cleared'
  };
}

export function createStudyScheduler({
  keyOf,
  buildSample,
  runSample,
  readPoint,
  refuses = () => null,
  contextFor = () => null,
  paused,
  capacity,
  onUpdate,
  cacheLimit = 400,
}) {
  const jobs = []; // active jobs in dispatch priority order
  const byKey = new Map(); // job id -> job, same objects
  // Quantity readings per sample shape — a handful of floats each, so hundreds of
  // entries cost nothing and revisited ground (a patch toggled back, a study
  // densified from its coarse pass) comes back without a run.
  //
  // A job's `context` is not part of that key and must never need to be. What a
  // quantity carries there is a fact about the climate rather than about the
  // sample — TM59's running mean is the attached weather file's, read at the
  // same days whatever the sliders say — and the cache is already cleared whole
  // on a station change, which is the only thing that can move it.
  const cache = new Map();
  const compatible = new Map();
  // In-flight samples by epoch and cache key, so two studies wanting the same sample —
  // every study includes the current desk value — share one run. The entry is
  // owned by no job: cancelling one sharer never strands another, and the
  // result still lands in the cache for whoever asks next. The epoch is part
  // of this identity even though it is not part of the cache identity: a
  // station change leaves the old engine call in flight, and a new climate
  // asking for the same desk shape must not ride that promise.
  const pending = new Map();
  let inFlight = 0;
  // Where the round-robin walk starts, as an index into the active jobs. Not a
  // job reference: a job that finishes or is cancelled is spliced out of
  // `jobs`, and a held reference would have to be found again on every pass.
  let cursor = 0;
  // Bumped by clearAll. A run that was in flight when the world changed — a
  // station swap clears the cache because sample shapes never carry the
  // climate — must not repopulate the cache when it lands late.
  let epoch = 0;
  let wasIdle = true;

  const active = (job) => job.state === 'queued' && !job.cancelled;
  // What may dispatch now. A held job is still active, so it keeps its identity
  // in `byKey`, can be cancelled and superseded, and counts in `progress`; it is
  // only never taken.
  const takeable = (job) => active(job) && !job.held;

  function identities(job, value, carried = job.carried) {
    const identity = keyOf(job, value, carried);
    if (!identity || typeof identity.exact !== 'string' || typeof identity.bucket !== 'string') {
      throw new Error('study keyOf must return { exact, bucket } string identities');
    }
    return identity;
  }

  function forget(exact) {
    const entry = cache.get(exact);
    if (!entry) return;
    cache.delete(exact);
    const bucket = compatible.get(entry.bucket);
    bucket?.delete(exact);
    if (!bucket?.size) compatible.delete(entry.bucket);
  }

  function remember(identity, sample) {
    if (cache.size >= cacheLimit) {
      // Maps iterate in insertion order, so the first key is the oldest.
      forget(cache.keys().next().value);
    }
    const entry = Object.freeze({
      bucket: identity.bucket,
      carried: sample.carried,
      readings: sample.readings,
      meterBasis: sample.meterBasis,
    });
    cache.set(identity.exact, entry);
    if (!compatible.has(identity.bucket)) compatible.set(identity.bucket, new Set());
    compatible.get(identity.bucket).add(identity.exact);
  }

  function lookup(job, value) {
    const identity = identities(job, value);
    const exact = cache.get(identity.exact);
    if (exact?.carried.answers(job.needed)) return { identity, entry: exact };

    const candidates = [...(compatible.get(identity.bucket) ?? [])]
      .map((key) => cache.get(key))
      .filter((entry) => entry?.carried.answers(job.needed))
      .sort((left, right) => {
        const extras = left.carried.size - right.carried.size;
        return extras || left.carried.serialize().localeCompare(right.carried.serialize());
      });
    return { identity, entry: candidates[0] ?? null };
  }

  /**
   * Whether one landed sample carries a reading at all.
   *
   * `value` is the position on the face, which every sample has whether its run
   * answered or not, so it is the one key that says nothing. Everything else in
  * `reading` is the desk quantity selected from the cached readings bag. The
  * scheduler is deliberately blind to its id: a list here would have to change
  * whenever a quantity is declared and would turn a complete curve into a
  * reported failure when that second list drifted.
   */
  const readingOf = (entry, quantity) => entry?.readings?.[quantity] ?? null;
  const drew = (point) => point?.reading != null;

  // Why a sample landed as a gap: the message its build, its run or its reader
  // threw. It travels with the landing, so a job riding another's run is
  // handed the same reason by the same promise.
  const reasonOf = (error) => String(error?.message ?? error ?? '') || null;

  /**
   * One curve point, built in one place.
   *
   * `land` and `curveFor` each used to spell this literal out, and the moment
   * `refused` was added to one of them a point resolved from the cache stopped
   * being the same shape as a point that landed — so a curve rebuilt on a
   * quantity change lost every refusal it had, and counted those positions as
   * runs still to come.
   *
   * `failure` and `refused` are two different facts about a gap and are passed
   * as one options object rather than one positional argument, because they
   * arrived from opposite directions and briefly shared a slot: `dispatch`
   * passed a refusal where the promise handlers passed `reasonOf(error)`, so
   * every engine failure would have lettered as a refusal of the position,
   * which is exactly the distinction the note below exists to keep.
   */
  const pointAt = (job, value, sample, { failure = null, refused = null } = {}) => ({
    value,
    reading: readingOf(sample, job.quantity),
    ...(sample?.readings ?? {}),
    sample,
    // The engine's, and says nothing about the position.
    failure,
    // Kept apart from a failed run, which is also a point with no reading:
    // a failure is the engine's and says nothing about the position, where
    // a refusal is a fact about the position and has a sentence to say.
    refused,
  });

  function land(job, index, sample, gap = {}) {
    if (!active(job)) return; // cancelled while this sample was in flight
    job.curve[index] = pointAt(job, job.points[index], sample, gap);
    job.done += 1;
    // The index rides along for a design-list job's reader, which files each
    // landing once into its own ledger; walking a curve of thousands on every
    // point to find the one that just arrived would be quadratic. Every other
    // caller ignores the third argument.
    onUpdate(job, 'point', index);
    if (job.done < job.total) return;
    job.state = 'done';
    drop(job);
    onUpdate(job, job.curve.some(drew) ? 'done' : 'failed');
  }

  function drop(job) {
    const i = jobs.indexOf(job);
    if (i !== -1) jobs.splice(i, 1);
    if (byKey.get(job.id) === job) byKey.delete(job.id);
  }

  /**
   * The next sample to dispatch: one from each active job in turn.
   *
   * This walked `jobs` strictly for as long as the only thing in the queue was
   * studies, and that was right while it was true — a study is one job, so
   * list order was never asked to arbitrate anything. A survey is a *stack* of
   * jobs enqueued in one breath, one per row of the ground, and under a strict
   * walk row 1 drained across the whole pool before row 2 began. Two things
   * broke, and only the second is a bug the reader could name: an eleven-row
   * survey held every instance for its whole duration, so a study queued
   * behind it sat at `0 / 21` with nothing to say why and read as a hang
   * (FR-053); and the ground itself landed as three finished rows over eight
   * empty ones rather than as a complete coarse relief, which is the opposite
   * of what progressive measurement is for.
   *
   * Round-robin answers both at once. `cursor` is the job to start from and it
   * advances past whoever was served, so no job can be starved by one ahead of
   * it in the list and the survey's rows advance together.
   *
   * The invariant that survives unchanged, and the one worth stating because
   * getting it wrong runs a sample twice: **every dispatched index is in
   * `job.started` before its dispatch**, which `dispatch` does on its first
   * line. This function only ever reads that set.
   *
   * Enqueue order still means something — `enqueue({ front: true })` puts a
   * study the reader asked for by name at the head of the list, and the cursor
   * starts there — so a manual study is still served first. It simply cannot
   * be served *only*.
   */
  function takeNext() {
    const live = jobs.filter(takeable);
    if (!live.length) return null;
    if (cursor >= live.length) cursor = 0;
    for (let n = 0; n < live.length; n += 1) {
      const at = (cursor + n) % live.length;
      const job = live[at];
      for (const index of job.order) {
        if (!job.started.has(index)) {
          cursor = at + 1;
          return { job, index };
        }
      }
    }
    return null;
  }

  function dispatch(job, index) {
    job.started.add(index);
    const value = job.points[index];
    // Asked before the cache, because nothing about a refused position is worth
    // a lookup: it is refused for what it is, not for what a run of it said.
    // Landed synchronously and outside `inFlight`, like a cache hit.
    const refusal = refuses(job, value);
    if (refusal) {
      land(job, index, null, { refused: refusal });
      return;
    }
    const { identity, entry: hit } = lookup(job, value);
    if (hit) {
      land(job, index, hit);
      return;
    }

    const pendingKey = JSON.stringify([epoch, identity.exact]);
    const shared = pending.get(pendingKey);
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
        (error) => {
          land(job, index, null, { failure: reasonOf(error) });
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
    let context;
    if (job.designs) {
      // Per distinct world rather than per job, and still never per sample:
      // a hundred designs in one world ask once, as a study does.
      const signature = String(job.designs[index].context ?? '');
      if (!job.contexts.has(signature)) job.contexts.set(signature, contextFor(job, index));
      context = job.contexts.get(signature);
    } else {
      if (!job.contextTaken) {
        job.context = contextFor(job);
        job.contextTaken = true;
      }
      context = job.context;
    }

    inFlight += 1;
    const epochAt = epoch;
    const promise = (async () => {
      const built = buildSample(job, value);
      const result = await runSample(built);
      return result?.success ? readPoint(job, result, built, context) : null;
    })();
    pending.set(pendingKey, promise);
    promise.then(
      (sample) => {
        if (pending.get(pendingKey) === promise) pending.delete(pendingKey);
        inFlight -= 1;
        // A failed sample is a gap, never a cached fact: a transient engine
        // failure must not poison every future study of this shape.
        if (sample != null && epochAt === epoch) remember(identity, sample);
        land(job, index, sample);
        drain();
      },
      (error) => {
        // The build, the run or the reader threw. Same gap as a failed run,
        // carrying what was thrown.
        if (pending.get(pendingKey) === promise) pending.delete(pendingKey);
        inFlight -= 1;
        land(job, index, null, { failure: reasonOf(error) });
        drain();
      },
    );
  }

  function admit(job, front) {
    const prior = byKey.get(job.id);
    if (prior) cancel(prior, 'moved');
    byKey.set(job.id, job);
    if (front) jobs.unshift(job);
    else jobs.push(job);
    wasIdle = false;
  }

  function drain() {
    while (!paused() && inFlight < capacity()) {
      const next = takeNext();
      if (!next) break;
      dispatch(next.job, next.index);
    }
    // A queue holding only held jobs is idle: nothing will dispatch until the
    // reader releases them, and the studies' densify pass waits on 'idle'.
    const idle = inFlight === 0 && !jobs.some(takeable);
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
      admit(job, front);
      drain();
    },

    /**
     * Queue several jobs in one breath, then drain once.
     *
     * What the round-robin needs to interleave them: enqueued one at a time,
     * each drain fills the pool from the first job before the second is in
     * the list, and a survey's coarse pass landed as one finished row over
     * eight empty ones. Callers used to get this by holding `paused()` true
     * across their own loop, which made the pause mean two things.
     */
    enqueueAll(batch) {
      for (const job of batch) admit(job, false);
      drain();
    },

    /** Stop one job by its identity. In-flight samples land into nothing. */
    cancel(id, reason = 'stopped') {
      const job = byKey.get(id);
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
      compatible.clear();
      for (const job of [...jobs]) cancel(job, reason);
      drain();
    },

    /**
     * Hold or release every active job the predicate matches, then drain.
     *
     * The plan's Pause, and deliberately not a cancel: a cancelled job loses
     * its place in the round-robin and re-queueing it rebuilds its design
     * lists, where a held one resumes by clearing a flag. Nor is it `paused()`,
     * which would stop every study and the survey with it. A run already on an
     * engine is untouched and lands as usual.
     */
    holdWhere(pred, held) {
      for (const job of jobs) {
        if (active(job) && pred(job)) job.held = held;
      }
      drain();
    },

    /** Whether a job is queued or running under this identity. */
    has: (id) => Boolean(byKey.get(id)),

    /** Resume dispatching — call when a pause condition lifts. */
    drain,

    /** Resolve a whole curve from exact or compatible cached samples without queueing. */
    curveFor(job) {
      const curve = [];
      let missing = 0;
      for (const value of job.points) {
        // Asked before the cache, exactly as `dispatch` asks it, or the two
        // ways a curve comes to exist would disagree about the same position.
        // A refused position is also not `missing`: nothing is coming for it,
        // and counted as missing it puts a card into a wait that no drain can
        // ever end — which is what it did when only `dispatch` asked.
        const refusal = refuses(job, value);
        if (refusal) {
          curve.push(pointAt(job, value, null, { refused: refusal }));
          continue;
        }
        const { entry } = lookup(job, value);
        if (!entry) missing += 1;
        curve.push(pointAt(job, value, entry));
      }
      return { curve, missing };
    },

    /** Recompute price-derived readings from retained physical meter bases. */
    reprice(transform) {
      for (const [exact, entry] of cache) {
        const readings = transform(entry.readings, entry.meterBasis);
        cache.set(exact, Object.freeze({ ...entry, readings }));
      }
    },

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
