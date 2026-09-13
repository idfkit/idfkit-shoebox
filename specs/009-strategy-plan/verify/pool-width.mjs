/**
 * Quickstart gate 11: the pool's width. No engine, no DOM.
 *
 * The five invariants of contracts/pool-width.md. The width changes when runs
 * land and never what they read, so a mistake here has no symptom on the page
 * but a slower plan or a drag that stutters; the table in research.md section
 * 17 is what the page promises, and it is held to the letter.
 */

import { PoolWidth, poolWidth } from '../../../src/pool.js';
import { finish, ok } from './desk.mjs';

console.log("the pool's width (gate 11)");

/* ── 1. research.md section 17's table, exactly ────────────────────────── */
const TABLE = [
  { cores: 4, memory: 8, width: 2, why: '4 cores less two' },
  { cores: 8, memory: null, width: 6, why: '8 cores less two' },
  { cores: 10, memory: 8, width: 8, why: '10 cores less two' },
  { cores: 12, memory: 8, width: 10, why: '12 cores less two' },
  { cores: 16, memory: 8, width: 14, why: '16 cores less two' },
  { cores: 24, memory: 8, width: 15, why: 'half of 8 GB at 256 MB an engine' },
];
for (const row of TABLE) {
  const got = poolWidth({ cores: row.cores, deviceMemoryGB: row.memory });
  ok(
    `${row.cores} cores, ${row.memory ?? 'no'} GB reported: ${row.width} engines, "${row.why}"`,
    got.width === row.width && got.why === row.why,
    `got ${got.width}, "${got.why}"`,
  );
}
{
  const safari = poolWidth({ cores: 8, deviceMemoryGB: null });
  ok('no memory reported is taken as an assumed 4 GB', safari.memoryGB === 4 && safari.assumed === true);
  ok('and lettered as assumed where it binds', poolWidth({ cores: 64 }).why === 'half of an assumed 4 GB at 256 MB an engine');
  ok('a reported figure is not assumed', poolWidth({ cores: 8, deviceMemoryGB: 8 }).assumed === false);
  ok('the result is a frozen PoolWidth', safari instanceof PoolWidth && Object.isFrozen(safari));
}

/* ── 2 to 5. over every machine a browser can report ───────────────────── */
const MEMORIES = [null, 0.25, 0.5, 1, 2, 4, 8, 16];
const failures = { floor: [], cores: [], ceiling: [], capped: [], why: [] };
for (let cores = 1; cores <= 64; cores += 1) {
  for (const memory of MEMORIES) {
    const got = poolWidth({ cores, deviceMemoryGB: memory });
    const at = `${cores} cores, ${memory ?? 'null'} GB`;
    if (!(got.width >= 1)) failures.floor.push(at);
    if (cores >= 3 && got.width > cores - 2) failures.cores.push(at);
    if (got.width > 15) failures.ceiling.push(at);
    // Recomputed here from the inputs alone, so a fixed cap slipped back into
    // the module would show as a width below what both terms allow.
    const mem = Math.min(memory ?? 4, 8);
    const byMemory = Math.floor((mem * 1024) / 2 / 256 - 1);
    const allowed = Math.max(1, Math.min(cores - 2, byMemory));
    if (got.width !== allowed) failures.capped.push(`${at}: ${got.width}, allowed ${allowed}`);
    const binding = Math.min(cores - 2, byMemory);
    const expected =
      binding < 1
        ? 'one engine at least'
        : cores - 2 <= byMemory
          ? `${cores} cores less two`
          : `half of ${memory === null ? 'an assumed ' : ''}${mem} GB at 256 MB an engine`;
    if (got.why !== expected) failures.why.push(`${at}: "${got.why}", expected "${expected}"`);
  }
}
ok('width is at least one on every machine', !failures.floor.length, failures.floor.slice(0, 3).join('; '));
ok('two cores are always held back where there are three or more', !failures.cores.length, failures.cores.slice(0, 3).join('; '));
ok('no machine is given more than fifteen engines', !failures.ceiling.length, failures.ceiling.slice(0, 3).join('; '));
ok('and none is capped below what cores and memory allow', !failures.capped.length, failures.capped.slice(0, 3).join('; '));
ok('why names the term that is actually the minimum', !failures.why.length, failures.why.slice(0, 3).join('; '));

finish();
