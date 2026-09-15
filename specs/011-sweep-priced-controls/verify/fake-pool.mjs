/**
 * A scheduler over a counting fake pool, keyed as `sampleIdentity` keys it:
 * the sample's whole desk minus `PRICED_KEYS`. Shared by the scheduler and
 * survey harnesses; not a harness itself.
 *
 * Every run returns the same meter basis scaled by the swept shaping values,
 * so a shaping sweep lands different readings per position and a priced one
 * lands one run's meters priced many ways.
 */

import { RunContents } from '../../../src/contents.js';
import { createStudyScheduler } from '../../../src/scheduler.js';
import { BASIS, PRICED_KEYS, pricedReadings } from './kit.mjs';

export const CARRIED = new RunContents({ annual: true });

const deskAt = (job, value) => ({ ...job.snapshot, [job.key]: value });
const deskKey = (desk) => JSON.stringify(Object.entries(desk).filter(([key]) => !PRICED_KEYS.has(key)));

/** A basis that depends on the shaping half of the desk, so shaping positions differ. */
export const basisFor = (desk) =>
  Object.freeze({
    ...BASIS,
    series: Object.freeze(
      Object.fromEntries(Object.entries(BASIS.series).map(([meter, joules]) => [meter, joules * (desk.uFactor ?? 1) * (desk.wallR ?? 1) / 4])),
    ),
  });

export function fakeScheduler({ card } = {}) {
  const counter = { runs: 0, updates: [] };
  const priceAt = (job, value, sample) =>
    [job.omits].flat().some((key) => PRICED_KEYS.has(key))
      ? pricedReadings(sample.readings, sample.meterBasis, { ...job.live(), ...overlay(job, value) }, card)
      : sample.readings;
  const overlay = (job, value) => {
    const desk = deskAt(job, value);
    return Object.fromEntries([job.omits].flat().filter((key) => PRICED_KEYS.has(key)).map((key) => [key, desk[key]]));
  };
  const scheduler = createStudyScheduler({
    keyOf: (job, value, carried) => {
      const bucket = JSON.stringify([deskKey(deskAt(job, value)), 'year']);
      return { bucket, exact: JSON.stringify([bucket, carried.serialize()]) };
    },
    buildSample: (job, value) => ({ desk: deskAt(job, value), carried: job.carried, value }),
    runSample: async (built) => {
      counter.runs += 1;
      return { success: true, built };
    },
    readPoint: (job, result, built) => {
      const meterBasis = basisFor(built.desk);
      // Priced at the building's own desk, as `landedFrom` prices it.
      const readings = pricedReadings({}, meterBasis, built.desk, card);
      return Object.freeze({ carried: built.carried, readings, meterBasis });
    },
    priceAt,
    paused: () => false,
    capacity: () => 6,
    onUpdate: (job, event) => counter.updates.push([job?.id ?? null, event]),
  });
  return { scheduler, counter };
}

/** Let every fake run and its landing settle. */
export const settle = async () => {
  for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
