/**
 * Measure a list of designs on the reference desk and file them into a real
 * `DesignLedger`, the way `onStrategyUpdate` does on the page. Shared by the
 * engine gates. Not a harness itself.
 *
 * The documents are built with the lean profile the zone's extremes need —
 * the same `RunContents` a plan of the high and the low carries — so each run
 * writes one hourly series rather than the sheet's whole apparatus.
 */

import { parseESO } from '@idfkit/engine';
import { readExtremes } from '../../../src/readings.js';
import { QUANTITY_BY_ID, contentsFor } from '../../../src/study.js';
import { DesignLedger, Landed } from '../../../src/strategy.js';
import { failureOf, idfOf, runCache, runMany } from './desk.mjs';

const LEAN = contentsFor(QUANTITY_BY_ID.extremes, []);

/**
 * `tasks` is a list of `{ id, params, patch }`. Returns a ledger holding every
 * one of them, landed or failed with the engine's reason.
 */
export async function measure(tasks, { cacheName, label }) {
  const cache = runCache(cacheName);
  const missing = tasks.filter((task) => !cache.held[task.id]);
  if (missing.length) {
    const jobs = [];
    for (const task of missing) jobs.push({ idf: await idfOf(task.params, task.patch, { reporting: LEAN }) });
    const results = await runMany(jobs, { label });
    missing.forEach((task, at) => {
      const result = results[at];
      cache.held[task.id] =
        result.success && result.eso
          ? { readings: { extremes: readExtremes(parseESO(result.eso)) } }
          : { failure: failureOf(result) };
    });
    cache.save();
  }
  const ledger = new DesignLedger();
  for (const task of tasks) {
    const held = cache.held[task.id];
    ledger.land(
      task.id,
      held.readings
        ? new Landed({ readings: Object.freeze({ extremes: Object.freeze(held.readings.extremes) }) })
        : new Landed({ failure: held.failure }),
    );
  }
  console.log(`       ${tasks.length} designs in the ledger, ${missing.length} run now, ${tasks.length - missing.length} from ${cache.file}`);
  return ledger;
}
