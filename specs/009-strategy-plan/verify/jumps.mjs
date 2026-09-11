/**
 * Quickstart gate 5: jumps are measured on matched designs. Engine.
 *
 * The first measurement of jumps anywhere: the spec's exploration held every
 * choice at the stance, so nothing had measured how far a door moves a
 * reading until this. For each world one door from the reference desk, 32
 * matched designs are run in both worlds, and the jump's median, spread and
 * consistency are printed for the zone's high and low. The numbers go into
 * CLAUDE.md whatever they come out as.
 *
 * SC-007 is structural — a `Jump` accepts only `MatchedPairs`, and those are
 * built by `matched`, which throws on a stray key — so what is asserted here
 * is that every lettered jump went through that path and that its pairs are
 * the count asked for.
 */

import { controlFor } from '../../../src/controls.js';
import { designAt, neighboursOf, worldOf } from '../../../src/space.js';
import { DEPTH, Jump, MatchedPairs, jumpOf } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { REFERENCE, finish, ok } from './desk.mjs';
import { measure } from './measure.mjs';

console.log('jumps are measured on matched designs (gate 5)');

const home = worldOf(REFERENCE.params, REFERENCE.patch);
const neighbours = neighboursOf(home).filter((n) => n.world);
const tasks = new Map();
const pairs = new Map();
for (const neighbour of neighbours) {
  const matched = new MatchedPairs(home, neighbour, DEPTH.jump);
  pairs.set(neighbour.id, matched);
  matched.pairs.forEach(([a, b], index) => {
    tasks.set(a, { id: a, params: designAt(home, index).params, patch: home.patch });
    tasks.set(b, { id: b, params: designAt(neighbour.world, index).params, patch: neighbour.world.patch });
  });
}
const ledger = await measure([...tasks.values()], { cacheName: 'reference', label: 'matched designs' });

const fmt = (v) => (v === null ? '  —  ' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
console.log('\n  world                              | high: median  p10    p90   one way | low: median  p10    p90   one way | pairs');
let unmatched = 0;
for (const neighbour of neighbours) {
  const row = [];
  let measured = 0;
  for (const reading of [READING_BY_ID.high, READING_BY_ID.low]) {
    const jump = jumpOf(pairs.get(neighbour.id), reading, ledger);
    if (!(jump instanceof Jump) || jump.wanted !== DEPTH.jump) unmatched += 1;
    measured = jump.measured;
    row.push(`${fmt(jump.median)} ${fmt(jump.p10)} ${fmt(jump.p90)} ${String(jump.consistency.agree).padStart(3)}/${jump.consistency.of}${jump.same ? ' same' : ''}`);
  }
  console.log(`  ${neighbour.label.padEnd(34)} | ${row[0].padEnd(35)} | ${row[1].padEnd(34)} | ${measured}/${DEPTH.jump}`);
}
console.log('');
ok(`every one of ${neighbours.length} jumps was taken on ${DEPTH.jump} matched pairs (SC-007)`, unmatched === 0);

const layered = neighbours.find((n) => n.door.id === 'glazingModel');
const came = layered.world.cameAlive(home);
const dark = layered.world.wentDark(home);
console.log(`       came alive: ${came.join(', ')}; went dark: ${dark.join(', ')}`);
ok(
  'entering the layered glazing world brings pane count, coating and cavity width alive (SC-006)',
  ['panes', 'paneEmiss', 'gapWidth'].every((key) => came.includes(key)),
);
ok('and takes U-factor and SHGC dark (SC-006)', ['uFactor', 'shgc'].every((key) => dark.includes(key)));
ok(
  'each is a control the Glazing strip owns',
  [...came, ...dark].every((key) => controlFor(key).channel.id === 'glazing'),
);

finish();
