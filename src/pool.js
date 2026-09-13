/**
 * A pool of engines for the studies to draw on.
 *
 * One engine instance serialises its runs — a second `run()` while one is in
 * flight is rejected — so concurrency is bought with instances: each carries
 * its own worker and its own WASM heap, and the pool hands them out one run
 * at a time. The pump's engine is not in here. The live sheet must never
 * queue behind a study, so it keeps its own instance and its own mutex, and
 * this pool exists only for the samples.
 *
 * DOM-free on purpose: `createEngine` is injected, so the Node harness can
 * hand in a scripted fake and exercise the acquire/release order without a
 * browser in the room.
 */

/**
 * How many engines run side by side, and which term decided it.
 *
 * **Two cores are held back**: one for the page's main thread, which builds
 * every sample before an engine can take it, and one for the sheet's own
 * engine, so a drag never waits on a study. *N − 1* was rejected for putting a
 * sample on the sheet's core. The main thread's share is measured rather than
 * assumed: applying one design to the reference desk and writing its IDF takes
 * **0.79 ms** on average (median 0.76, 90th percentile 1.07, 64 designs, full
 * reporting profile, Node 22), and `buildSample` applies twice, so a run costs
 * about 1.5 ms of main thread against about 50 ms of design day. A pool W wide
 * therefore spends about 3 % × W of the thread building: 30 % at ten engines,
 * 45 % at fifteen. That does not saturate it, and it is not free; what keeps a
 * drag live is the scheduler's `paused()` while a hand is on a control, not
 * the width.
 *
 * **Half the memory**, less the sheet's own engine, at the WASM heap's 256 MB
 * starting size rather than its 1 GB ceiling: this model is one zone with lean
 * sweep outputs, and a heap that grows toward the ceiling is a problem no pool
 * width survives. The page is not cross-origin isolated, which rules out
 * `performance.measureUserAgentSpecificMemory`, so 256 MB is the engine's
 * documented start size, a stated assumption. `deviceMemory` is Chromium's and
 * reports at most 8, so the memory term tops out at fifteen engines; where it
 * is absent 4 GB is assumed and `assumed` says so. The quarter it used to be
 * held every Safari and Firefox visit to three.
 *
 * **No fixed cap.** The cap of 6 held every larger Chromium machine to six, and
 * the two terms already shrink the pool on the machines where width would hurt.
 *
 * `why` names the binding term in words, because a browser may round or cap
 * `hardwareConcurrency` for privacy, and a reader on a capped browser should be
 * able to see why their plan is slower.
 */
export class PoolWidth {
  constructor({ cores, memoryGB, assumed, perInstanceMB }) {
    this.cores = cores;
    this.memoryGB = memoryGB;
    this.assumed = assumed;
    this.byCores = cores - 2;
    this.byMemory = Math.floor(((memoryGB * 1024) / 2 - perInstanceMB) / perInstanceMB);
    const binding = Math.min(this.byCores, this.byMemory);
    this.width = Math.max(1, binding);
    this.why =
      binding < 1
        ? 'one engine at least'
        : this.byCores <= this.byMemory
          ? `${cores} cores less two`
          : `half of ${assumed ? 'an assumed ' : ''}${memoryGB} GB at ${perInstanceMB} MB an engine`;
    Object.freeze(this);
  }
}

export function poolWidth({ cores = 4, deviceMemoryGB = null, perInstanceMB = 256 } = {}) {
  return new PoolWidth({
    cores,
    memoryGB: Math.min(deviceMemoryGB ?? 4, 8),
    assumed: deviceMemoryGB === null || deviceMemoryGB === undefined,
    perInstanceMB,
  });
}

export function createEnginePool({ createEngine, limit }) {
  const idle = [];
  const waiters = [];
  let created = 0;
  let disposed = false;

  async function acquire() {
    if (disposed) throw new Error('the study pool has been disposed');
    if (idle.length) return idle.pop();
    if (created < limit) {
      created += 1;
      try {
        return await createEngine();
      } catch (error) {
        created -= 1;
        throw error;
      }
    }
    // A waiter carries its rejection as well as its resolution: when the
    // replacement instance promised to it cannot be compiled, the sample has
    // to fail as a gap. Resolve-only, the acquire never settled and that
    // sample hung forever — the curve stopping one short with no failure
    // anywhere to say why.
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  /**
   * Drop an instance that can no longer be trusted, and hand whoever was
   * waiting for one a fresh instance instead: the waiter was promised an
   * instance that no longer exists, so its own acquire path creates a
   * replacement.
   */
  function retire(engine) {
    engine.dispose?.();
    created -= 1;
    const waiter = waiters.shift();
    if (waiter && !disposed) {
      created += 1;
      Promise.resolve()
        .then(createEngine)
        .then(waiter.resolve, (err) => {
          created -= 1;
          waiter.reject(err);
        });
    }
  }

  function release(engine) {
    if (disposed) {
      engine.dispose?.();
      created -= 1;
      return;
    }
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(engine);
    else idle.push(engine);
  }

  return {
    /**
     * Run one simulation on whichever instance comes free first.
     *
     * A rejection from the engine means the run could not be attempted at all
     * — worker died, runtime never loaded, instance disposed — every one of
     * which is fatal to the instance, so a rejecting engine is dropped rather
     * than recycled: handing the next sample a corpse would fail every run
     * from here on while reporting each as a one-off gap.
     */
    async run(input) {
      const engine = await acquire();
      let result;
      try {
        result = await engine.run(input);
      } catch (error) {
        retire(engine);
        throw error;
      }
      // An unsuccessful run poisons its instance, and so it is retired too,
      // not recycled. The worker calls EnergyPlus's `main` again on the same
      // WebAssembly module, and `main` is not re-entrant: once a run has ended
      // in a fatal or a thrown exception, every later run on that instance
      // throws a raw C++ exception pointer before doing any work. Recycled, one
      // setpoint crossing turned into hundreds of "Engine crashed: 287468688"
      // failures behind it: measured on an annual plan at ten engines, 29
      // genuine failures and 1,512 instant crashes out of 1,670 runs, every
      // one of them a design the engine never looked at. A cancelled run is
      // the one unsuccessful outcome that says nothing about the instance.
      if (result?.success || result?.cancelled) release(engine);
      else retire(engine);
      return result;
    },

    /**
     * Compile the first instance ahead of the first study, so clicking Study
     * costs a solve and not a solve plus a WASM compile. The binary itself is
     * an HTTP-cache hit — the pump's engine already downloaded it.
     */
    prewarm() {
      if (disposed || created > 0) return;
      created += 1;
      createEngine().then(release, () => {
        created -= 1;
      });
    },

    size: () => created,
    busy: () => created - idle.length,

    dispose() {
      disposed = true;
      for (const engine of idle) engine.dispose?.();
      created -= idle.length;
      idle.length = 0;
    },
  };
}
