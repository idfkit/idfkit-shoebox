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
 * How many instances the pool may grow to.
 *
 * Sized against the WASM heap's 256 MB starting size, not its 1 GB ceiling:
 * this model is one zone with lean sweep outputs, and a heap that grows
 * toward the ceiling is a problem no pool width survives, so the start size
 * is the honest per-instance cost. The page is not cross-origin isolated
 * (the engine is single-threaded by design, so no COOP/COEP is shipped),
 * which rules out `performance.measureUserAgentSpecificMemory` — the 256 MB
 * figure is the engine's documented start size, a stated assumption rather
 * than a measurement. `deviceMemory` is Chromium-only and capped at 8;
 * where it is absent the budget assumes 4 GB, of which a quarter is the
 * page's to spend. Two cores are held back for the main thread and the
 * pump's own engine. The cap of 6 is deliberately above the engine docs'
 * generic "two or three": a single 21-sample sweep is exactly the case
 * where width pays, and the memory and core terms shrink the pool on the
 * machines where 6 would hurt.
 */
export function poolLimit({ cores = 4, deviceMemoryGB = null, perInstanceMB = 256, cap = 6 } = {}) {
  const budgetMB = (Math.min(deviceMemoryGB ?? 4, 8) * 1024) / 4 - perInstanceMB;
  return Math.max(1, Math.min(cores - 2, Math.floor(budgetMB / perInstanceMB), cap));
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
      try {
        const result = await engine.run(input);
        release(engine);
        return result;
      } catch (error) {
        engine.dispose?.();
        created -= 1;
        // A waiter was promised an instance that no longer exists; wake it
        // with nothing so its own acquire path creates a replacement.
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
        throw error;
      }
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
