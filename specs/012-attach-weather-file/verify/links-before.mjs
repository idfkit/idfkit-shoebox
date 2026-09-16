/**
 * T005 — the pre-feature link corpus.
 *
 * Minted from the codec as it stands BEFORE `wf` and `wfd` exist, so that after
 * they are added every one of these can be decoded again and diffed. Feature 011
 * established the habit for the same reason: a link in the wild is a promise,
 * and the only way to keep it is to hold a copy of what it used to mean.
 */
import { encodeState, decodeState } from '/home/user/idfkit-shoebox/src/permalink.js';
import { DEFAULT_PARAMETERS, DEFAULT_BYPASS, CHANNELS } from '/home/user/idfkit-shoebox/src/controls.js';

const p = (over = {}) => ({ ...DEFAULT_PARAMETERS, ...over });
const bypassAll = Object.fromEntries(Object.keys(DEFAULT_BYPASS).map((k) => [k, true]));

const desks = [
  ['defaults', { params: p(), bypass: { ...DEFAULT_BYPASS } }],
  ['moved', { params: p({ width: 20, wwrS: 0.35, heatSet: 21 }), bypass: { ...DEFAULT_BYPASS } }],
  ['all bypassed', { params: p(), bypass: bypassAll }],
  ['station', { params: p(), bypass: { ...DEFAULT_BYPASS }, station: { wmo: '725650', window: '2007-2021' } }],
  ['station, no window', { params: p(), bypass: { ...DEFAULT_BYPASS }, station: { wmo: '037760', window: null } }],
  ['pinned hour', {
    params: p(), bypass: { ...DEFAULT_BYPASS },
    station: { wmo: '725650', window: '2007-2021' },
    pin: { kind: 'year', month: 7, day: 21, hour: 15 },
  }],
];

const out = [];
for (const [name, scheme] of desks) {
  let hash;
  try {
    hash = encodeState(scheme);
  } catch (error) {
    out.push({ name, error: error.message });
    continue;
  }
  // A default desk encodes to the empty string on purpose -- that is what lets
  // the bare address stay bare -- so it is recorded as such rather than fed to a
  // decoder that rightly refuses a fragment with no version token.
  if (hash === '') {
    out.push({ name, hash, decoded: 'the empty fragment, which is the default desk', error: null });
    continue;
  }
  let decoded = null;
  let error = null;
  try {
    const back = decodeState(hash);
    decoded = {
      params: back.params,
      bypass: back.bypass,
      station: back.station,
      pin: back.pin ?? null,
    };
  } catch (e) {
    error = e.message;
  }
  out.push({ name, hash, decoded, error });
}

// A few malformed links, so the refusals are frozen too.
const malformed = [
  'v1&win=2007-2021',
  'v1&stn=notanumber',
  'v1&stn=725650&stn=037760',
  'v1&at=year.07-21T15',
  'v1&width=notanumber',
  'v9&width=20',
];
const refusals = malformed.map((raw) => {
  try {
    decodeState(raw);
    return { raw, refused: false };
  } catch (error) {
    return { raw, refused: true, reason: error.message };
  }
});

console.log(JSON.stringify({ minted: new Date().toISOString().slice(0, 10), desks: out, refusals }, null, 2));
