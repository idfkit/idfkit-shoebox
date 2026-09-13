/**
 * SC-013: no strip tag is ever stale. No engine.
 *
 * Drives `tagsFor` through ten world changes and ten reading changes over a
 * ledger of a known building, and a model of the console's drawing rule from
 * contracts/console-tags.md: a key is drawn with a tag only where its entry's
 * stamp is the current one. At every step, every drawn tag must be the one the
 * current classification says, and a tag computed for the step before must
 * draw nothing at all.
 */

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { designAt, neighboursOf, probesAt, worldOf } from '../../../src/space.js';
import { DesignLedger, Landed, classifyAll, effectsOf, stampOf, tagsFor } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { finish, ok } from './desk.mjs';

console.log('no strip tag is ever stale (SC-013)');

// A building whose readings are known functions of the desk, doors included.
const bag = (p) =>
  Object.freeze({
    extremes: Object.freeze({
      high: 24 + 6 * p.wwrS + 4 * p.shgc - 2 * p.groundReflect + (p.terrain === 'City' ? 1 : 0),
      low: 10 + 0.4 * p.wallR - 0.8 * p.uFactor - 3 * p.wwrE + (p.slabMaterial === 'Timber' ? -1 : 0),
    }),
    peakHeat: 40 - 2 * p.wallR + 10 * p.uFactor,
    peakCool: 30 + 20 * p.wwrS * p.shgc,
  });

const ledger = new DesignLedger();
function fill(world) {
  for (let index = 0; index < 8; index += 1) {
    const base = designAt(world, index);
    ledger.land(base.id, new Landed({ readings: bag(base.params) }));
    for (const probe of probesAt(world, base)) if (!probe.skip) ledger.land(probe.id, new Landed({ readings: bag(probe.params) }));
  }
}

/** The console's rule, restated from the contract: stamp or nothing. */
const drawn = (tags, stamp) => new Map([...tags].filter(([, tag]) => stamp && tag.stamp === stamp));

const pairs = [
  ['high', 'low'],
  ['low', 'high'],
  ['high', 'peakHeat'],
  ['peakCool', 'low'],
  ['peakHeat', 'peakCool'],
].map((ids) => ids.map((id) => READING_BY_ID[id]));

let world = worldOf(DEFAULT_PARAMETERS, DEFAULT_BYPASS);
fill(world);
let previous = null;
let stale = 0;
let wrong = 0;
let steps = 0;
const step = (pair) => {
  const effects = pair.map((r) => effectsOf(world, r, ledger, { bases: 8 }));
  const classes = classifyAll({ pair, effects, taus: [0.5, 0.5] });
  const tags = tagsFor(world, pair, classes);
  const stamp = stampOf(world, pair);
  for (const [key, tag] of drawn(tags, stamp)) {
    const c = classes.find((x) => x.key === key);
    if (!c || tag.free !== (c.kind === 'free') || !tag.text.toLowerCase().startsWith(c.kind === 'no-regret' ? 'no-regret' : c.kind)) wrong += 1;
  }
  if (previous && previous.stamp !== stamp) stale += drawn(previous.tags, stamp).size;
  previous = { tags, stamp };
  steps += 1;
};

// Ten world changes: walk out through one door after another.
for (let n = 0; n < 10; n += 1) {
  const next = neighboursOf(world).filter((x) => x.world && x.door.kind === 'choice')[n % 3];
  world = next.world;
  fill(world);
  step(pairs[0]);
}
// Ten reading changes in the last world.
for (let n = 0; n < 10; n += 1) step(pairs[(n + 1) % pairs.length]);

ok(`${steps} changes: every drawn tag matches the current classification`, wrong === 0, `${wrong} wrong`);
ok('and no tag computed for a previous world or pair is ever drawn', stale === 0, `${stale} stale`);
ok('clearing draws nothing', drawn(previous.tags, '').size === 0);

finish();
