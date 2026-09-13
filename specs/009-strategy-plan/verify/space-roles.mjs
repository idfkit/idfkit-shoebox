/**
 * Quickstart gate 1: the design space accounts for every key. No engine.
 *
 * SC-011 says every control and door on the desk is varied, a world, or listed
 * with a reason. `space.js` asserts the table at load, so this harness asserts
 * it again from outside, against the declarations, and adds the three facts a
 * load assertion cannot know: how the default desk falls, that Blinds is
 * refused in its channel's own words, and that `DIMENSION_ORDER` has only ever
 * grown at its end.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_KEYS, CHANNELS, CHANNEL_BY_ID, controlFor } from '../../../src/controls.js';
import { DIMENSION_ORDER, PATCH_DOORS, doorsOf, neighboursOf, roleOf, worldOf } from '../../../src/space.js';
import { refusesSweep } from '../../../src/study.js';
import { REFERENCE, finish, ok, throws } from './desk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

console.log('the design space accounts for every key (gate 1)');

/* ── every key, exactly one role ───────────────────────────────────────── */
{
  const counts = { varied: 0, door: 0, held: 0 };
  let unreasoned = 0;
  for (const key of ALL_KEYS) {
    const role = roleOf(key);
    counts[role.role] += 1;
    if (role.role === 'held' && !role.reason) unreasoned += 1;
  }
  ok(
    `all ${ALL_KEYS.length} keys have one role`,
    counts.varied + counts.door + counts.held === ALL_KEYS.length,
    JSON.stringify(counts),
  );
  console.log(`       ${counts.varied} varied, ${counts.door} doors, ${counts.held} held`);
  ok('every held key carries its reason', unreasoned === 0);
  throws('an unknown key is refused', () => roleOf('notAControl'), 'no control owns');

  // Recounted from the declarations rather than from `space.js`: the varied
  // set is exactly the sweepable faces on channels that reach the building.
  const sweepable = [];
  for (const channel of CHANNELS) {
    if (channel.prices || channel.id === 'solver' || channel.id === 'run') continue;
    for (const key of channel.keys()) {
      const { control } = controlFor(key);
      if (control.kind === 'selector' || control.kind === 'boundary') continue;
      if (!refusesSweep(control)) sweepable.push(key);
    }
  }
  ok(
    'the varied set is every sweepable face on a building channel',
    sweepable.length === counts.varied && sweepable.every((key) => roleOf(key).role === 'varied'),
    `${sweepable.length} sweepable against ${counts.varied} varied`,
  );
  ok('System is not a door (FR-004)', !doorsOf().some((door) => door.channel.id === 'system'));
  ok(
    'the patch doors are exactly the five design elements',
    JSON.stringify([...PATCH_DOORS].sort()) === JSON.stringify(['blinds', 'context', 'daylight', 'shading', 'skylights']),
  );
}

/* ── the default desk ──────────────────────────────────────────────────── */
{
  const world = worldOf(REFERENCE.params, REFERENCE.patch);
  ok('the default desk varies 32 controls', world.live.length === 32, `${world.live.length}: ${world.live.join(' ')}`);
  ok(
    'every varied key is live or dark with a reason',
    world.live.length + world.dark.length === DIMENSION_ORDER.length && world.dark.every((entry) => entry.reason),
  );

  const neighbours = neighboursOf(world);
  const entered = neighbours.filter((n) => n.world);
  // research.md section 1 lettered 20, and its own itemised terms — terrain 3,
  // aperture 2, glazing model 1, the six boundary faces and wind exposure 7,
  // slab material 2, four patch doors — sum to 19. The count here is the
  // measurement; the document was corrected to it.
  ok('the default desk has 19 enterable neighbours', entered.length === 19, `${entered.length}`);
  for (const n of entered) console.log(`       ${n.label}`);

  const blinds = neighbours.find((n) => n.door.id === 'patch:blinds');
  const reason = CHANNEL_BY_ID.blinds.requires.reason;
  ok(
    'Blinds in is refused with its channel’s own requires.reason, verbatim',
    blinds && !blinds.world && blinds.refusal === (typeof reason === 'function' ? reason(REFERENCE.params) : reason),
    blinds?.refusal,
  );

  // Every other setting of every door is one neighbour, entered or refused,
  // so the plan can state how many worlds lie one door away (FR-027).
  const owed = doorsOf().reduce((sum, door) => sum + door.settings.length - 1, 0);
  ok(`every door's other settings are accounted for (${owed})`, neighbours.length === owed, `${neighbours.length}`);
  ok('every refusal is a sentence', neighbours.every((n) => n.world || (typeof n.refusal === 'string' && n.refusal)));
}

/* ── DIMENSION_ORDER is append-only ────────────────────────────────────── */
{
  const frozen = JSON.parse(fs.readFileSync(path.join(here, 'dimension-order.json'), 'utf8'));
  const prefix = DIMENSION_ORDER.slice(0, frozen.length);
  ok(
    `DIMENSION_ORDER keeps the ${frozen.length} dimensions as shipped, in order`,
    JSON.stringify(prefix) === JSON.stringify(frozen),
    frozen.find((key, at) => prefix[at] !== key),
  );
}

finish();
