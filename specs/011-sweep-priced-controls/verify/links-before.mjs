/**
 * T003: the links `main` mints, decoded before anything in this feature moves.
 *
 * Writes `links-before.json` beside this file: one canonical JSON per link of
 * what `decodeState` handed back. `link-roundtrip.mjs` (T038) decodes the same
 * links after the change and asserts every one is identical, which is the whole
 * of FR-020: no default, key or range changes, so no link may read differently.
 *
 * Run from the repository root, on `main`, before any source edit:
 *
 *   node specs/011-sweep-priced-controls/verify/links-before.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeState } from '../../../src/permalink.js';

export const LINKS = Object.freeze([
  // The desk issue #78 was filed from, verbatim.
  'v1&wwrS=0.54&uFactor=0.96&sizingPeriods=No&in=gains&in=system&stn=725090&sv=uFactor*wwrS*carbon*0.4_6*0_0.9',
  // A default desk.
  'v1',
  // A solo'd desk, as a link carries it: every other bypassable channel out.
  'v1&in=system&out=fabric',
  // Studies, shaped and quantity-only.
  'v1&stn=725090&in=system&sty=demand.wallR,wwrS',
  'v1&stn=725090&in=system&sty=cost.width',
  'v1&sty=extremes',
  // A survey with extents, and one without.
  'v1&stn=725090&in=system&sv=wwrS*wallR*tedi.cedi*0_0.9*0.2_10',
  'v1&sv=width*depth*high',
  // Priced settings on the desk, which were always carried as parameters.
  'v1&stn=725090&in=system&heatSource=HeatPump&heatCOP=3.5&rateBasis=Assumed&elecPrice=0.2&sty=carbon.wallR',
  'v1&stn=725090&in=system&factorBasis=Assumed&gridFactor=50&heatEfficiency=0.95&sv=uFactor*wwrS*cost',
  // A crossed setpoint pair, which is a reachable desk and so a link that opens.
  'v1&in=system&heatSet=24&coolSet=22',
  // A link naming no control, recorded as its refusal.
  'v1&heatSP=26',
]);

/** Keys sorted at every depth, so two decodes compare as one string. */
export const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = {};
  for (const link of LINKS) {
    try {
      out[link] = canonical(decodeState(link));
    } catch (failure) {
      // A refused link is recorded as its refusal, so the after-run can assert
      // it is refused for the same reason.
      out[link] = `REFUSED: ${failure.message}`;
    }
    console.log(`${out[link].startsWith('REFUSED') ? 'refused' : 'decoded'}  #${link}`);
  }
  const target = new URL('./links-before.json', import.meta.url);
  writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\n${LINKS.length} links written to ${fileURLToPath(target)}`);
}
