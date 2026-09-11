/**
 * Quickstart gate 2: designs are deterministic and on the grid. No engine.
 *
 * Determinism is asserted across **processes**, not across two calls in one:
 * a memo inside `space.js` would make two calls agree whatever the arithmetic
 * did, and SC-010's claim is about two machines, of which two processes are the
 * nearest thing a harness can reach.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { controlFor, refuses } from '../../../src/controls.js';
import { VARIED, designAt, matched, neighboursOf, worldOf } from '../../../src/space.js';
import { ANNUAL, REFERENCE, finish, ok } from './desk.mjs';

const COUNT = 512;
const desks = [REFERENCE, ANNUAL];

if (process.argv.includes('--child')) {
  const out = desks.map((desk) => {
    const world = worldOf(desk.params, desk.patch);
    return Array.from({ length: COUNT }, (_, index) => designAt(world, index).params);
  });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

console.log('designs are deterministic and on the grid (gate 2)');

/* ── two processes, one sample ─────────────────────────────────────────── */
{
  const self = fileURLToPath(import.meta.url);
  const run = () => spawnSync(process.execPath, [self, '--child'], { maxBuffer: 256 * 1024 * 1024 }).stdout.toString();
  const first = run();
  const second = run();
  ok(`designAt for indices 0 to ${COUNT - 1} is byte-identical across two processes`, first.length > 0 && first === second);
}

/* ── every value is one the control can hold ───────────────────────────── */
{
  let refused = null;
  let offGrid = null;
  const world = worldOf(REFERENCE.params, REFERENCE.patch);
  for (let index = 0; index < COUNT; index += 1) {
    const { params } = designAt(world, index);
    for (const key of VARIED) {
      const { control } = controlFor(key);
      const value = params[key];
      const why = refuses(control, value);
      if (why && !refused) refused = `${key}=${value} ${why}`;
      const stops = (value - control.min) / control.step;
      if (Math.abs(stops - Math.round(stops)) > 1e-6 && !offGrid) offGrid = `${key}=${value} at design ${index}`;
    }
  }
  ok('every varied value passes refuses (FR-007)', !refused, refused);
  ok('every varied value lies on its step grid (FR-007)', !offGrid, offGrid);
}

/* ── matched pairs differ only in the door ─────────────────────────────── */
{
  const home = worldOf(REFERENCE.params, REFERENCE.patch);
  let failure = null;
  let pairs = 0;
  for (const neighbour of neighboursOf(home).filter((n) => n.world)) {
    for (let index = 0; index < 32; index += 1) {
      try {
        matched(home, neighbour, index);
        pairs += 1;
      } catch (error) {
        failure ??= error.message;
      }
    }
  }
  ok(`all ${pairs} matched pairs at the default desk differ only in their door (SC-007)`, !failure, failure);

  // And the implication is carried, not dropped: a room's own profiles ride
  // with its `roomType`, so a Gains-in desk's room door differs in exactly
  // those keys and still counts as matched.
  const gainsIn = worldOf(REFERENCE.params, { ...REFERENCE.patch, gains: false });
  const room = neighboursOf(gainsIn).find((n) => n.world && n.door.id === 'roomType');
  let implied = null;
  try {
    const [a, b] = matched(gainsIn, room, 0);
    implied = Object.keys(a.params).filter((key) => a.params[key] !== b.params[key]);
  } catch (error) {
    implied = error.message;
  }
  ok(
    'a room door is matched through what the room implies',
    Array.isArray(implied) && implied.includes('roomType') && implied.includes('occPattern'),
    String(implied),
  );
}

finish();
