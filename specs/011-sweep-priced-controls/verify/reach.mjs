/**
 * Quickstart gate 1 (T011, T022): the reach table is the bill's own arithmetic.
 *
 * For every priced face against every roster quantity (66 pairings), price one
 * meter basis at the face's two stops on a gas boiler, direct electric and a
 * heat pump desk, all with the tariff and grid factor Assumed. A pairing whose
 * bill reading differs between the stops on any desk must be declared in
 * `movedBy` and drawn; one that differs on none must be refused.
 *
 *   node specs/011-sweep-priced-controls/verify/reach.mjs
 */

import { PricingAvailability, PricingStatus, QUANTITIES, offersFor, refusesPairing } from '../../../src/study.js';
import { BASIS, DESKS, PRICED_FACES, figures, harness, pricedReadings } from './kit.mjs';

const t = harness('reach (gate 1, SC-004)');
const BILL_READINGS = new Set(['eui', 'cost', 'carbon']);

let refused = 0;
let drawn = 0;
for (const face of PRICED_FACES) {
  for (const quantity of QUANTITIES) {
    let moves = false;
    if (BILL_READINGS.has(quantity.id)) {
      for (const desk of Object.values(DESKS)) {
        const low = figures(pricedReadings({}, BASIS, { ...desk, [face.key]: face.min }))[quantity.id];
        const high = figures(pricedReadings({}, BASIS, { ...desk, [face.key]: face.max }))[quantity.id];
        if (low === null || high === null) throw new Error(`${face.key} × ${quantity.id} did not price`);
        if (Math.abs(low - high) > 1e-9) moves = true;
      }
    }
    const sentence = refusesPairing(face.key, quantity);
    t.ok(
      `${face.key} × ${quantity.id}: ${moves ? 'moves, drawn' : 'cannot move, refused'}`,
      quantity.movedBy.has(face.key) === moves && (sentence === null) === moves,
      sentence ?? 'no sentence',
    );
    if (sentence) refused += 1;
    else drawn += 1;
  }
}
t.ok(`54 refused and 12 drawn (got ${refused} and ${drawn})`, refused === 54 && drawn === 12);

// A shaping control is never refused by pairing, whatever the reading.
t.ok('a shaping control is never refused', QUANTITIES.every((q) => refusesPairing('wallR', q) === null));
let threw = false;
try {
  refusesPairing('noSuchKey', QUANTITIES[0]);
} catch {
  threw = true;
}
t.ok('an unknown key throws', threw);

// T022: the weather file is the first thing to fix, so a demand offer on a desk
// with no year keeps that reason rather than the pairing's.
{
  const open = new PricingStatus({ available: true });
  const pricing = new PricingAvailability({ currency: 'USD', cost: open, carbon: open });
  const offers = offersFor({ key: 'heatEfficiency', annual: false, channels: ['system', 'gains'], pricing });
  const demand = offers.find((o) => o.quantity.id === 'demand');
  t.ok('no weather file: demand is refused for the weather file first', /weather file/.test(demand.reason), demand.reason);
  const peak = offers.find((o) => o.quantity.id === 'peakHeat');
  t.ok('a design-day reading is refused by pairing', /applied after the run/.test(peak.reason ?? ''), peak.reason);
  const yearly = offersFor({ key: 'heatEfficiency', annual: true, wholeYear: true, season: true, channels: ['system', 'gains'], pricing });
  const demandYear = yearly.find((o) => o.quantity.id === 'demand');
  t.ok('with a year, demand is refused by pairing with its fix', /applied after the run/.test(demandYear.reason) && demandYear.fix === 'Choose energy use intensity, cost or carbon.', `${demandYear.reason} ${demandYear.fix}`);
}

// The load-time throws, each against a patched copy of `src/` in a temp dir.
{
  const { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const src = new URL('../../../src/', import.meta.url).pathname;
  const patched = (label, file, from, to, wanted) => {
    const dir = mkdtempSync(join(tmpdir(), 'reach-'));
    try {
      cpSync(src, join(dir, 'src'), { recursive: true });
      // The bundled packages resolve from the repository's own node_modules.
      cpSync(new URL('../../../package.json', import.meta.url).pathname, join(dir, 'package.json'));
      spawnSync('ln', ['-s', new URL('../../../node_modules', import.meta.url).pathname, join(dir, 'node_modules')]);
      const path = join(dir, 'src', file);
      const text = readFileSync(path, 'utf8');
      if (!text.includes(from)) throw new Error(`${label}: the patch target is gone from ${file}`);
      writeFileSync(path, text.replace(from, to));
      const run = spawnSync(process.execPath, ['-e', `import('${join(dir, 'src', 'study.js')}')`], { encoding: 'utf8' });
      t.ok(`load throws: ${label}`, run.status !== 0 && run.stderr.includes(wanted), run.stderr.split('\n').find((l) => l.startsWith('Error')) ?? 'loaded');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  patched('a priced face named by no quantity', 'study.js', "movedBy: [...PLANT_REACH, 'gridFactor']", 'movedBy: PLANT_REACH', 'moves no study quantity');
  patched('movedBy naming a shaping control', 'study.js', "movedBy: [...PLANT_REACH, 'gridFactor']", "movedBy: [...PLANT_REACH, 'gridFactor', 'wallR']", 'which shapes the run');
  patched(
    'a priced Scale with needs and no withdrawn',
    'controls.js',
    "withdrawn: () => 'The tariff is Published; set it to Assumed to price gas here.',",
    '',
    'gasPrice is a priced face with needs and no withdrawn sentence',
  );
}

t.done();
