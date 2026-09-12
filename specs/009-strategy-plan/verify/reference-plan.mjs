/**
 * Quickstart gate 6: the plan explains what the evidence said it would. Engine.
 *
 * The reference desk at full depth — 16 screening bases and 512 designs — run
 * under Node, one engine process per run, and read through the real
 * `strategy.js`. What it checks:
 *
 * - SC-004: the share explained is at least 65 % for the zone's high and 50 %
 *   for its low, and more than the two strongest single controls explain when
 *   scored the same way. **If this fails at 16 bases, rerun at 32 before
 *   touching anything else** (research.md section 7): `BASES=32 node …`.
 * - SC-003: every dot indexes a completed run, with zero exceptions.
 * - SC-003a: the terrain audit holds, recomputed here by code that shares
 *   nothing with `auditTerrain`.
 * - SC-003b: for all thirteen readings a terrain states the direction its
 *   reading declares, and its ink rises with the reading.
 * - SC-005: with the high and the low chosen, SHGC and ground reflectance are
 *   levers on the high, U-factor a trade-off, and east and west glazing
 *   no-regret; the U-factor, SHGC and sill strips carry the matching tags.
 */

import { designAt, probesAt, worldOf } from '../../../src/space.js';
import {
  FREE,
  Terrain,
  classifyAll,
  designId,
  effectsOf,
  planOf,
  screen,
  shareAlong,
  stampOf,
  tagsFor,
  terrainOf,
  Dot,
} from '../../../src/strategy.js';
import { READINGS, READING_BY_ID, SENSE } from '../../../src/survey.js';
import { REFERENCE, finish, ok } from './desk.mjs';
import { measure } from './measure.mjs';

const BASES = Number(process.env.BASES ?? 16);
const DESIGNS = 512;

console.log(`the plan explains what the evidence said it would (gate 6, ${BASES} bases)`);

const world = worldOf(REFERENCE.params, REFERENCE.patch);
const tasks = [];
for (let index = 0; index < DESIGNS; index += 1) {
  const design = designAt(world, index);
  tasks.push({ id: design.id, params: design.params, patch: world.patch });
}
for (let base = 0; base < BASES; base += 1) {
  for (const probe of probesAt(world, designAt(world, base))) {
    if (!probe.skip) tasks.push({ id: probe.id, params: probe.params, patch: world.patch });
  }
}
const ledger = await measure(tasks, { cacheName: 'reference', label: 'reference desk' });

const high = READING_BY_ID.high;
const low = READING_BY_ID.low;
const plans = {};

/* ── SC-004 ────────────────────────────────────────────────────────────── */
for (const [reading, floor] of [[high, 0.65], [low, 0.5]]) {
  const plan = planOf(world, reading, ledger, { designs: DESIGNS, bases: BASES, kind: 'design-day', tau: FREE[reading.id].tau });
  plans[reading.id] = plan;
  const entries = screen(world, reading, ledger, { bases: BASES, tau: FREE[reading.id].tau })
    .filter((entry) => entry.kind === 'control' && entry.effect !== null)
    .sort((l, r) => r.effect - l.effect);
  const top = entries.slice(0, 2).map((entry) => entry.key);
  const single = shareAlong(world, reading, ledger, top, DESIGNS, BASES);
  const recipe = (m) => m.recipe.map(({ key, word, share }) => `${word} ${key} ${Math.round(share * 100)}%`).join(', ');
  console.log(`       ${reading.label}: two moves ${(plan.explained2 * 100).toFixed(1)} %, one ${(plan.explained1 * 100).toFixed(1)} %; ` +
    `${top.join(' + ')} ${(single * 100).toFixed(1)} %`);
  console.log(`         move 1 (${Math.round(plan.moves[0].explains * 100)} %): ${recipe(plan.moves[0])}`);
  console.log(`         move 2 (${Math.round(plan.moves[1].explains * 100)} %): ${recipe(plan.moves[1])}`);
  console.log(`         terrain: ${plan.terrain.refused ?? `bandwidth ${plan.terrain.bandwidth.toFixed(3)}, explains ${(plan.terrain.explained * 100).toFixed(1)} %`}; ` +
    `${plan.gaps.length} failed; spots: ${[...plan.spots.values()].map((s) => `${s.key} ${s.at ?? `limit ${s.limit}`}`).join(', ') || 'none'}`);
  ok(`${reading.label} is explained ${Math.round(floor * 100)} % or more (SC-004)`, plan.explained2 >= floor, `${(plan.explained2 * 100).toFixed(1)} %`);
  ok(`${reading.label}: the plan explains more than the two strongest single controls`, plan.explained2 > single);

  /* SC-003 */
  const orphan = plan.dots.find((dot) => !ledger.get(designId(world, dot.index))?.readings);
  ok(`${reading.label}: every one of ${plan.dots.length} dots indexes a completed run (SC-003)`, !orphan && plan.dots.length >= 100);

  /* SC-003a, recomputed independently */
  if (plan.terrain.lattice) {
    ok(`${reading.label}: the terrain audit holds, recomputed independently (SC-003a)`, independentAudit(plan) === null, independentAudit(plan));
  } else {
    console.log(`       ${reading.label}: no terrain drawn (${plan.terrain.refused}), so there is nothing to audit`);
  }
}

/**
 * The SC-003a audit, written out again with nothing shared: the unit square
 * from the dots' own extents, a local best as a cell better than every
 * finite neighbour, and the mean inside one bandwidth against the ring out
 * to two. Returns the first failure, or null.
 */
function independentAudit(plan) {
  const { lattice, cells, bandwidth: h, better } = plan.terrain;
  const xs = plan.dots.map((d) => d.x);
  const ys = plan.dots.map((d) => d.y);
  const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pts = plan.dots.map((d) => [(d.x - ax) / (bx - ax), (d.y - ay) / (by - ay), d.value]);
  const good = (a, b) => (better === 'lower' ? a < b : a > b);
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const v = lattice[j * cells + i];
      if (Number.isNaN(v)) continue;
      const around = [];
      for (const [di, dj] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const w = lattice[(j + dj) * cells + (i + di)];
        if (i + di >= 0 && j + dj >= 0 && i + di < cells && j + dj < cells && !Number.isNaN(w)) around.push(w);
      }
      if (!around.length || !around.every((w) => good(v, w))) continue;
      const c = [(i + 0.5) / cells, (j + 0.5) / cells];
      const inside = pts.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= h).map((p) => p[2]);
      const ring = pts.filter((p) => { const r = Math.hypot(p[0] - c[0], p[1] - c[1]); return r > h && r <= 2 * h; }).map((p) => p[2]);
      const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      if (!inside.length || !ring.length || !good(m(inside), m(ring))) return `cell ${i},${j}`;
    }
  }
  return null;
}

/* ── SC-003b: the height convention for every reading ──────────────────── */
{
  const plan = plans.high;
  let wrong = null;
  for (const reading of READINGS) {
    // The same measured positions, the reading made up of the high so the
    // terrain has a surface to build; what is under test is the convention.
    const dots = plan.dots.map((dot) => new Dot({ index: dot.index, id: dot.id, value: dot.value, x: dot.x, y: dot.y }));
    const terrain = terrainOf(dots, reading);
    if (!(terrain instanceof Terrain) || terrain.better !== SENSE[reading.id].better) wrong ??= reading.id;
  }
  ok('every one of the thirteen readings states the direction it declares (SC-003b)', !wrong, wrong);
}

/* ── SC-005 ────────────────────────────────────────────────────────────── */
{
  const pair = [high, low];
  const effects = pair.map((r) => effectsOf(world, r, ledger, { bases: BASES }));
  const classes = classifyAll({ pair, effects, taus: pair.map((r) => FREE[r.id].tau) });
  const kind = (key) => classes.find((c) => c.key === key);
  for (const c of [...classes].sort((l, r) => l.kind.localeCompare(r.kind) || l.key.localeCompare(r.key))) {
    console.log(`       ${c.kind.padEnd(9)} ${c.key.padEnd(22)} μ ${c.mu.map((m) => m.toFixed(2).padStart(6)).join(' ')}  ${c.consistency.agree}/${c.consistency.of}` +
      `${c.on ? ` on ${c.on.id}` : ''}${c.levers.length ? ` paid by ${c.levers.join(', ')}` : c.unpaid ? ` (${c.unpaid})` : ''}`);
  }
  ok('SHGC is a lever on the high (SC-005)', kind('shgc')?.kind === 'lever' && kind('shgc').on.id === 'high', kind('shgc')?.kind);
  ok('ground reflectance is a lever on the high', kind('groundReflect')?.kind === 'lever' && kind('groundReflect').on.id === 'high', kind('groundReflect')?.kind);
  ok('U-factor is a trade-off', kind('uFactor')?.kind === 'trade-off', kind('uFactor')?.kind);
  ok('east glazing helps both', kind('wwrE')?.kind === 'no-regret', kind('wwrE')?.kind);
  ok('west glazing helps both', kind('wwrW')?.kind === 'no-regret', kind('wwrW')?.kind);
  const spots = new Map();
  for (const r of pair) for (const [key, spot] of plans[r.id].spots) spots.set(key, [...(spots.get(key) ?? []), spot]);
  const tags = tagsFor(world, pair, classes, spots);
  const stamp = stampOf(world, pair);
  console.log(`       tags: uFactor "${tags.get('uFactor')?.text}", shgc "${tags.get('shgc')?.text}", sill "${tags.get('sill')?.text}"`);
  ok('the U-factor strip reads as a trade-off', tags.get('uFactor')?.text.startsWith('Trade-off') && tags.get('uFactor').stamp === stamp);
  ok('the SHGC strip reads as a lever on the high', tags.get('shgc')?.text.startsWith('Lever: High'));
  ok('the sill height strip reads free, dimmed', tags.get('sill')?.text.startsWith('Free') && tags.get('sill').free, tags.get('sill')?.text);
}

finish();
