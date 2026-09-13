/**
 * Quickstart gate 15: a re-cut is free for what is already in hand. Engine.
 *
 * Measure a region, narrow it, and confirm that narrowing costs only the
 * designs nobody has run a desk for; that everything measured outside the new
 * region stays in the ledger and enters no figure; and that widening back
 * again runs nothing at all.
 *
 * **What "free" means here, and why this keys on the desk.** A design's
 * identity on the page is the desk it builds (`deskKey`, `sampleIdentity`),
 * which carries no notion of a bound: two identical desks are one cache entry
 * however the reader arrived at them. It is *not* true that one index names
 * one design under two regions — `snapped` bins into the span, so design *i*
 * under a narrower region is a different building, which is the whole of
 * FR-049, and its ledger id carries the region to match. So the run cache here
 * is keyed by the **desk**, exactly as the page's is, and the ledgers are
 * keyed by design id, exactly as the page's is. Keyed by ledger id instead,
 * every design of a narrowing would re-run and the gate would prove nothing.
 *
 * What no reading of the code settles is how large the reused share is for a
 * typical narrowing (research.md section 27). That is the figure this prints,
 * and the first run of this gate measured it as **zero**: narrowing `wallR`
 * from 0.5 to 9 down to 2 to 6 over 64 designs reused none of them. A region
 * binding one control leaves every other varied key identical, so reuse needs
 * one index to snap to the same `wallR` under both bins, which essentially
 * never happens. Narrowing costs full price; only widening back is free, and
 * that is asserted below rather than assumed.
 */

import { createHash } from 'node:crypto';
import { Bound, Region, designAt, worldOf } from '../../../src/space.js';
import { DesignLedger, planOf } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { REFERENCE, finish, ok, runCache } from './desk.mjs';
import { measure } from './measure.mjs';

const DESIGNS = Number(process.env.DESIGNS ?? 64);
const KEY = 'wallR';
const CACHE = 'recut';

console.log(`a re-cut is free for what is already in hand (gate 15, ${DESIGNS} designs)`);

const world = worldOf(REFERENCE.params, REFERENCE.patch);
const reading = READING_BY_ID.high;
const WIDE = new Region([new Bound({ key: KEY, from: 0.5, to: 9 })]);
const NARROW = new Region([new Bound({ key: KEY, from: 2, to: 6 })]);

/** The desk a design builds, which is what the page's own sample cache keys on. */
const deskId = (design) =>
  createHash('sha1').update(JSON.stringify([design.params, world.patch])).digest('hex').slice(0, 16);

const listOf = (region) => Array.from({ length: DESIGNS }, (_, index) => designAt(world, index, region));
const tasksOf = (designs) => designs.map((design) => ({ id: deskId(design), params: design.params, patch: world.patch }));
/** How many desks the disk cache holds, which is how many runs have been spent. */
const spent = () => Object.keys(runCache(CACHE).held).length;

const wide = listOf(WIDE);
const narrow = listOf(NARROW);

/* ── what a narrowing costs, worked out before a single run ─────────────── */
const wideDesks = new Set(wide.map(deskId));
const reused = narrow.filter((design) => wideDesks.has(deskId(design)));
const share = reused.length / narrow.length;
console.log(
  `       narrowing ${KEY} from 0.5 to 9 down to 2 to 6: ${reused.length} of ${narrow.length} designs share a desk ` +
    `already measured (${(share * 100).toFixed(1)} %), ${narrow.length - reused.length} to run`,
);
ok('every design of the narrowed region lies inside it', narrow.every((d) => d.params[KEY] >= 2 && d.params[KEY] <= 6));
ok('and every one of the wide region lies inside that', wide.every((d) => d.params[KEY] >= 0.5 && d.params[KEY] <= 9));

/* ── measure the wide region, then narrow ───────────────────────────────── */
const before = spent();
const wideDesk = await measure(tasksOf(wide), { cacheName: CACHE, label: 'the wide region' });
const afterWide = spent();

const narrowDesk = await measure(tasksOf(narrow), { cacheName: CACHE, label: 'the narrowed region' });
const costOfNarrowing = spent() - afterWide;

ok(`the wide region turned the engine ${afterWide - before} times`, afterWide - before > 0);
ok(
  `narrowing turned it ${costOfNarrowing} more, exactly the desks not already run`,
  costOfNarrowing === narrow.length - reused.length,
  `${costOfNarrowing} against ${narrow.length - reused.length}`,
);

/* ── widening back runs nothing at all ──────────────────────────────────── */
const beforeWidening = spent();
await measure(tasksOf(wide), { cacheName: CACHE, label: 'widening back' });
ok('widening back again runs nothing at all (FR-050)', spent() === beforeWidening, `${spent() - beforeWidening} runs`);

/* ── re-file by design id, which is what the plan reads ─────────────────── */
const ledgerFor = (designs, deskLedger) => {
  const out = new DesignLedger();
  for (const design of designs) {
    const landed = deskLedger.get(deskId(design));
    if (landed) out.land(design.id, landed);
  }
  return out;
};
// One ledger holding both regions' designs, as the page's does: nothing
// measured is ever thrown away, so widening back is free (FR-050).
const ledger = ledgerFor(wide, wideDesk);
for (const design of narrow) {
  const landed = narrowDesk.get(deskId(design));
  if (landed) ledger.land(design.id, landed);
}

/* ── what is outside the region stays, and enters no figure ─────────────── */
{
  const outside = wide.filter((design) => design.params[KEY] < 2 || design.params[KEY] > 6);
  ok(`all ${outside.length} designs outside the new region are still in the ledger`, outside.every((d) => ledger.get(d.id) !== null));

  // Structural rather than by inspecting the drawing: a design's ledger id
  // carries its region, so the ids the constrained plan can read and the ids
  // the wide region's designs were filed under are disjoint sets, and an
  // outside design cannot enter a constrained figure however many landed.
  //
  // Asserted this way because the obvious test is a trap: scored with no
  // screening bases there are no gradients, so `movesOf` returns null, the
  // plan holds no dots, and "every dot lies inside the region" passes over an
  // empty list while measuring nothing at all.
  const narrowIds = new Set(narrow.map((design) => design.id));
  ok('a design outside the region is filed under an id the constrained plan cannot read',
    outside.every((design) => !narrowIds.has(design.id)));

  const plan = planOf(world, reading, ledger, { designs: DESIGNS, bases: 0, kind: 'design-day', region: NARROW });
  ok('the plan states the region it was measured over', plan.region === NARROW && plan.region.stateOf(KEY) !== null);
  // Whatever it could place, every one of them is a design of this region.
  ok(`every design the constrained plan reads lies inside it`,
    plan.dots.every((dot) => {
      const value = designAt(world, dot.index, NARROW).params[KEY];
      return value >= 2 && value <= 6;
    }));
}

console.log(
  `\n       Record for CLAUDE.md: narrowing ${KEY} to about ${Math.round((4 / 8.5) * 100)} % of its face reused ` +
    `${(share * 100).toFixed(1)} % of the designs already measured.`,
);

finish();
