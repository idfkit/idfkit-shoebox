/**
 * Quickstart gate 6 (T038): priced studies and axes ride the link, a refused
 * survey pairing is refused whole, and every link minted before this feature
 * decodes identically (SC-006, FR-018 to FR-020).
 *
 *   node specs/011-sweep-priced-controls/verify/link-roundtrip.mjs
 */

import { readFileSync } from 'node:fs';
import { LINK_VERSION, decodeState, encodeState } from '../../../src/permalink.js';
import { harness } from './kit.mjs';
import { LINKS, canonical } from './links-before.mjs';

const t = harness('the link (gate 6)');

const roundTrip = (label, fragment) => {
  try {
    // The encoder writes one canonical spelling (strip order, escaped), so the
    // round trip is asserted from that spelling: decoded and re-encoded, it
    // must come back byte for byte. The study list's order is the encoder's.
    const decoded = decodeState(fragment);
    const canon = encodeState(decoded);
    const again = encodeState(decodeState(canon));
    t.ok(label, again === canon, `${fragment} → ${canon} → ${again}`);
    return decoded;
  } catch (failure) {
    t.ok(label, false, `refused: ${failure.message}`);
    return null;
  }
};
const refused = (label, fragment, wanted) => {
  try {
    decodeState(fragment);
    t.ok(label, false, 'accepted');
  } catch (failure) {
    t.ok(label, failure.message.includes(wanted), failure.message);
  }
};

t.ok('LINK_VERSION is still v1', LINK_VERSION === 'v1');

const study = roundTrip('sty=cost.heatEfficiency,wallR round-trips', 'v1&stn=725090&sty=cost.heatEfficiency,wallR');
t.ok('and carries both controls', [...(study?.studies ?? [])].sort().join() === 'heatEfficiency,wallR');

const demand = roundTrip('sty=demand.heatEfficiency decodes: a reachable desk', 'v1&stn=725090&sty=demand.heatEfficiency');
t.ok('with the refused pairing kept, for the card to stand refused', demand?.quantity === 'demand');

roundTrip('a priced survey axis round-trips', 'v1&stn=725090&sv=uFactor*heatEfficiency*carbon');
roundTrip('a priced survey with extents round-trips', 'v1&stn=725090&sv=uFactor*heatEfficiency*carbon*0.4_6*0.6_1');
roundTrip('two priced axes round-trip', 'v1&stn=725090&sv=heatEfficiency*gridFactor*carbon');

refused(
  'sv=uFactor*heatEfficiency*tedi is refused with the pairing sentence',
  'v1&stn=725090&sv=uFactor*heatEfficiency*tedi',
  'Seasonal efficiency is applied after the run and cannot move heating + cooling demand.',
);
refused('the second reading is asked too', 'v1&sv=gasPrice*uFactor*cost.high', 'Gas price is applied after the run');
refused('an unknown reading is still refused as unknown first', 'v1&sv=uFactor*heatEfficiency*nope', 'no survey reading is called "nope"');
refused('an unknown axis is still refused as unknown first', 'v1&sv=nope*heatEfficiency*tedi', 'no control is called "nope"');

const before = JSON.parse(readFileSync(new URL('./links-before.json', import.meta.url), 'utf8'));
let same = 0;
for (const link of LINKS) {
  let now;
  try {
    now = canonical(decodeState(link));
  } catch (failure) {
    now = `REFUSED: ${failure.message}`;
  }
  if (now === before[link]) same += 1;
  else t.ok(`#${link} decodes as it did on main`, false, `${before[link]}\n     now ${now}`);
}
t.ok(`${same} of ${LINKS.length} links from main decode identically`, same === LINKS.length && LINKS.length >= 10);

t.done();
