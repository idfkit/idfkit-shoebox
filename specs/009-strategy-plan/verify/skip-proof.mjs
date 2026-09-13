/**
 * Quickstart gate 3: skipped probes could not have reached anything. No engine.
 *
 * The screening records an exact zero, and spends no run, wherever a control
 * is dark at a base. That is only honest if the dark predicate is complete: a
 * control the predicate calls dark and the applier nonetheless writes would be
 * a real effect lettered as nothing. So for every probe `probesAt` skips, both
 * documents are built and compared byte for byte. The pull made the same
 * argument and assumed it; this checks it.
 *
 * **Stop-the-line.** A skipped probe that changes the IDF means the predicate
 * is wrong, and no screening built on it can be trusted.
 */

import { designAt, probesAt, worldOf } from '../../../src/space.js';
import { ANNUAL, REFERENCE, finish, idfOf, ok } from './desk.mjs';

const BASES = 16;

console.log('skipped probes could not have reached anything (gate 3)');

for (const desk of [REFERENCE, ANNUAL]) {
  const world = worldOf(desk.params, desk.patch);
  let skipped = 0;
  let ran = 0;
  let leak = null;
  const reasons = new Map();
  for (let index = 0; index < BASES; index += 1) {
    const base = designAt(world, index);
    const baseIdf = await idfOf(base.params, world.patch, { annual: desk.annual });
    for (const probe of probesAt(world, base)) {
      if (!probe.skip) {
        ran += 1;
        continue;
      }
      skipped += 1;
      reasons.set(probe.key, (reasons.get(probe.key) ?? 0) + 1);
      const probeIdf = await idfOf(probe.params, world.patch, { annual: desk.annual });
      if (probeIdf !== baseIdf && !leak) leak = `${probe.key} ${probe.from} → ${probe.to} at base ${index}: ${probe.skip}`;
    }
  }
  ok(
    `${desk.name}: all ${skipped} skipped probes build the base's IDF byte for byte (${ran} run)`,
    !leak,
    leak,
  );
  console.log(`       skipped: ${[...reasons].map(([key, n]) => `${key}×${n}`).join(' ')}`);
}

/* ── idempotence and the restore ───────────────────────────────────────── */
for (const desk of [REFERENCE, ANNUAL]) {
  const world = worldOf(desk.params, desk.patch);
  const live = await idfOf(desk.params, desk.patch, { annual: desk.annual });
  let drift = null;
  let restore = null;
  for (let index = 0; index < 8; index += 1) {
    const { params } = designAt(world, index);
    const once = await idfOf(params, world.patch, { annual: desk.annual });
    const twice = await idfOf(params, world.patch, { annual: desk.annual });
    const thrice = await idfOf(params, world.patch, { annual: desk.annual });
    if (!(once === twice && twice === thrice) && !drift) drift = `design ${index}`;
    // `buildSample`'s breath: the design, then the live desk put back.
    const back = await idfOf(desk.params, desk.patch, { annual: desk.annual });
    if (back !== live && !restore) restore = `after design ${index}`;
  }
  ok(`${desk.name}: three applications of a design are byte-identical`, !drift, drift);
  ok(`${desk.name}: the live desk is restored byte-exact after a design`, !restore, restore);
}

finish();
