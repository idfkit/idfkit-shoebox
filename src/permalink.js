/**
 * The scheme, as a URL fragment.
 *
 * The whole desk is deterministic — `params`, the patch state and the chosen
 * station fully decide the IDF, the run and the bill — so a link that carries
 * those three reproduces the sheet anywhere. This module is the codec and
 * nothing else: no DOM, no `window`, no imports beyond the control
 * declarations, so it can be exercised from Node exactly the way `model.js`
 * is.
 *
 * The fragment, not the query string, because the fragment never leaves the
 * browser: it cannot vary CloudFront's cache key, cannot leak schemes into a
 * server log, and survives a preview's `/42/` base untouched. Within it,
 * `URLSearchParams` syntax — `v2&width=20&wwrS=0.35&stn=725650` — because the
 * browser ships the codec for it and every escaping bug that a hand-rolled
 * `key:value` grammar would eventually meet is already handled.
 *
 * Only differences from the defaults are written. That keeps the link short
 * enough to read — `wwrS=0.35` in an address bar says what the argument is
 * about, the way the rate build-up on the bill shows its arithmetic — but it
 * makes the defaults part of the encoding: an omitted key means "the default
 * *as of this version*". Hence the version token in front, and the contract
 * that goes with it:
 *
 *   - Adding a control costs nothing. Old links simply omit the new key and
 *     take its default, and new channels ship bypassed, so an old link keeps
 *     producing the building it always did.
 *   - Changing a default, renaming a key, or narrowing a range means bumping
 *     `LINK_VERSION`, freezing the outgoing defaults into `DEFAULTS_BY_VERSION`
 *     and writing one step in `MIGRATIONS` to carry old links forward — the
 *     same arrangement EnergyPlus uses for the IDF itself.
 *   - A link that cannot be carried forward is refused whole, naming what
 *     failed. Loading half a scheme would be the half-loaded-city failure the
 *     weather picker exists to refuse, in a new costume.
 */

import {
  ALL_KEYS,
  CHANNELS,
  CHANNEL_BY_ID,
  DEFAULT_PARAMETERS,
  DEFAULT_BYPASS,
  controlFor,
  isMonthMask,
} from './controls.js';

export const LINK_VERSION = 'v2';

/**
 * Whether a fragment is scheme-shaped at all — a version token first, alone or
 * followed by pairs. Lives here beside the token it must agree with: the
 * `hashchange` listener consults this to decide between reloading into the
 * boot decode and leaving an ordinary in-page anchor to scroll, and a copy of
 * the grammar kept elsewhere would quietly stop matching the first time the
 * token's form evolved.
 */
export const isSchemeFragment = (raw) => /^v\d+(&|$)/.test(raw);

/**
 * What an omitted key meant, per version.
 *
 * Each older table is written as a difference from the one after it, in the
 * keys that version's bump actually changed, so the chain is the migration
 * ledger in table form and cannot drift: a future v3 freezes v2 the same way
 * and v1 keeps meaning what it meant, because it is defined against v2 rather
 * than against whatever the defaults have since become.
 *
 * The Grounds channel moved the stock example's grounds lighting out of the
 * baseline without a bump: that would ordinarily have been a version of its
 * own with a migration engaging the strip on old links, but it shipped before
 * any link existed in the wild, so v1 simply means the desk as it stood.
 */
const V2_DEFAULTS = DEFAULT_PARAMETERS;
// v1 held the run period as two month numbers on two calibration faces. v2
// holds the same decision as one twelve-month mask, which can also describe a
// year with holes in it.
const { months: _mask, ...V1_REST } = V2_DEFAULTS;
const V1_DEFAULTS = Object.freeze({ ...V1_REST, beginMonth: 1, endMonth: 12 });
const DEFAULTS_BY_VERSION = Object.freeze({ v1: V1_DEFAULTS, v2: V2_DEFAULTS });

/** A month number as v1 wrote one, or a refusal naming the offending pair. */
function v1Month(pairs, key) {
  const given = pairs.getAll(key);
  // The same one-claim-per-key rule the decoder applies below, applied here
  // because the migration is about to fold both keys into one and the
  // duplicate would vanish with them.
  if (given.length > 1) throw new Error(`${key} is given ${given.length} times`);
  const raw = pairs.get(key);
  if (raw === null) return V1_DEFAULTS[key];
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 12) {
    throw new Error(`${key} is "${raw}", which is not a month of the year`);
  }
  return Number(raw);
}

/**
 * One step per version bump, `(pairs) => ({ to, pairs })`, rewriting old
 * vocabulary into the next version's under the version it lands on.
 *
 * v1 → v2 turns the run period's two months into the calendar mask. The span
 * is read low to high because that is what v1's applier did with a pair given
 * backwards, so a link that said `beginMonth=9&endMonth=3` reproduces the
 * March-to-September run it always solved rather than acquiring the two ends
 * of the year it looks like it asks for.
 */
const MIGRATIONS = Object.freeze({
  v1: (pairs) => {
    // A v1 link has no business carrying v2's key. Left alone it would be
    // overwritten by the mask this step mints and the link would quietly load
    // a desk it did not describe — the half-loaded scheme every refusal in
    // this module exists to prevent.
    if (pairs.has('months')) throw new Error('"months" is not a key link version v1 knew');
    const [from, to] = [v1Month(pairs, 'beginMonth'), v1Month(pairs, 'endMonth')].sort(
      (a, b) => a - b,
    );
    const next = new URLSearchParams(pairs);
    next.delete('beginMonth');
    next.delete('endMonth');
    next.set(
      'months',
      Array.from({ length: 12 }, (_, i) => (i + 1 >= from && i + 1 <= to ? '1' : '0')).join(''),
    );
    return { to: 'v2', pairs: next };
  },
});

/**
 * Keys that are not parameters: the patch lists and the station. Declared
 * next to an assertion rather than a comment, so a future control key cannot
 * quietly collide with one — `controlFor` would route the collision to a
 * parameter and the link would mean two things at once.
 */
const RESERVED = Object.freeze(['in', 'out', 'stn', 'win']);
for (const key of RESERVED) {
  if (ALL_KEYS.includes(key)) {
    throw new Error(`the reserved link key "${key}" collides with a control parameter`);
  }
}

/**
 * Encode the desk. Returns the fragment without its leading `#`, or an empty
 * string when the desk is at its defaults with no station attached — a default
 * desk needs no link, and stripping the hash entirely is what lets the bare
 * address stay the canonical way to reach it.
 *
 * `station` is `{ wmo, window }` for an attached TMYx station or null. The
 * window matters: onebuilding publishes the same site under several 15-year
 * samples that disagree by up to 9 % on degree days, so a link that named only
 * the site would reproduce a different year than the one argued over.
 */
export function encodeState({ params, bypass, station = null }) {
  const pairs = new URLSearchParams();
  for (const key of ALL_KEYS) {
    // `String` rather than a display format: the display rounds, and a link
    // must hand back the exact value, not the nearest printable one.
    if (params[key] !== DEFAULT_PARAMETERS[key]) pairs.append(key, String(params[key]));
  }
  for (const channel of CHANNELS) {
    if (!channel.bypassable || bypass[channel.id] === DEFAULT_BYPASS[channel.id]) continue;
    pairs.append(bypass[channel.id] ? 'out' : 'in', channel.id);
  }
  if (station) {
    pairs.append('stn', String(station.wmo));
    if (station.window) pairs.append('win', station.window);
  }
  const body = pairs.toString();
  return body ? `${LINK_VERSION}&${body}` : '';
}

/** One value, read through the control that owns its key. Throws, never clamps. */
function readValue(key, raw) {
  const { control } = controlFor(key); // throws naming an unowned key
  if (control.kind === 'selector') {
    // Matched as text because the URL carries text: `timestep=4` has to find
    // the numeric option 4, and the option's own value — number or string — is
    // what goes onto `params`.
    const option = control.options.find((o) => String(o.value) === raw);
    if (!option) throw new Error(`"${raw}" is not an option of ${key}`);
    return option.value;
  }
  if (control.kind === 'calendar') {
    // Twelve characters and at least one month in them, asked of the same
    // predicate the control declaration and the console's gesture ask, so a
    // link cannot mint a run period the desk itself refuses to make.
    if (!isMonthMask(raw)) {
      throw new Error(`"${raw}" is not a year of twelve months with at least one in the run`);
    }
    return raw;
  }
  // The text is checked before the number, because `Number`'s grammar is wider
  // than a link's: `Number('')` is 0 and `Number('0x18')` is 24, and either
  // would load a value the sharer never set — a truncated `occFrom=` became a
  // building occupied from midnight before this check existed.
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`"${raw}" is not a number for ${key}`);
  const value = Number(raw);
  let min;
  let max;
  let integer = false;
  switch (control.kind) {
    case 'scale':
    case 'facade':
      ({ min, max } = control);
      // Step alignment is not required — several defaults (a wall R of
      // 2.290965) sit off their own step grid — but a control whose step and
      // floor are both whole numbers can only ever produce whole numbers, and
      // a fraction there reaches an integer IDF field the engine rejects
      // (a RunPeriod month of 6.5).
      integer = Number.isInteger(control.step) && Number.isInteger(control.min);
      break;
    case 'bearing':
      [min, max] = [0, 360];
      break;
    case 'profile':
      [min, max] = [0, 24]; // an hour of the day, and the band sweeps whole cells
      integer = true;
      break;
    default:
      // A new control kind must be taught its rules here explicitly, not
      // fall into whichever range happens to be last.
      throw new Error(`no link validation is written for a "${control.kind}" control`);
  }
  if (value < min || value > max) {
    throw new Error(`${key} is ${raw}, outside its ${min}–${max} range`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${key} is ${raw}, and it only takes whole numbers`);
  }
  return value;
}

/**
 * Decode a fragment (without its `#`) back into a full parameter set, a full
 * bypass map, and the station reference if the link carries one.
 *
 * All-or-nothing: every pair is validated through the control declarations
 * before anything is returned, and the first offense throws naming itself.
 * The caller gets a scheme it can apply wholesale or a reason to refuse the
 * link wholesale — never a mixture.
 */
export function decodeState(raw) {
  const cut = raw.indexOf('&');
  const version = cut === -1 ? raw : raw.slice(0, cut);
  // `Object.hasOwn`, not `in`: a fragment of `#toString` would otherwise walk
  // the prototype chain, pass the gate, and be refused later with a message
  // about a migration instead of the true offense.
  if (!Object.hasOwn(DEFAULTS_BY_VERSION, version)) {
    throw new Error(`"${version || '(empty)'}" is not a link version this page knows`);
  }
  let pairs = new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1));
  // Walk the ledger from the link's version to the current one. A version in
  // the defaults table with no path forward is a programming error worth
  // throwing on, not a link problem.
  for (let at = version; at !== LINK_VERSION; ) {
    const step = Object.hasOwn(MIGRATIONS, at) ? MIGRATIONS[at] : null;
    if (!step) throw new Error(`no migration is written from link version "${at}"`);
    ({ to: at, pairs } = step(pairs));
  }

  const params = { ...DEFAULT_PARAMETERS };
  const bypass = { ...DEFAULT_BYPASS };

  // Tracked by name rather than by whether the assignment moved anything: a
  // channel that defaults to bypassed makes `out=` a no-op, and a conflict
  // hidden behind a no-op is still two claims about one patch bay.
  const patched = new Set();
  for (const [list, off] of [
    [pairs.getAll('out'), true],
    [pairs.getAll('in'), false],
  ]) {
    for (const id of list) {
      const channel = CHANNEL_BY_ID[id];
      if (!channel?.bypassable) throw new Error(`no bypassable channel is called "${id}"`);
      if (patched.has(id)) throw new Error(`the channel "${id}" is patched two ways at once`);
      patched.add(id);
      bypass[id] = off;
    }
  }

  let station = null;
  const wmo = pairs.get('stn');
  const win = pairs.get('win');
  if (win !== null && wmo === null) {
    throw new Error('a TMYx window ("win") with no station ("stn") to apply it to');
  }
  if (wmo !== null) {
    if (!/^\d{3,8}$/.test(wmo)) throw new Error(`"${wmo}" is not a WMO station number`);
    if (win !== null && !/^\d{4}-\d{4}$/.test(win)) {
      throw new Error(`"${win}" is not a TMYx window like 2007-2021`);
    }
    station = { wmo, window: win };
  }

  // `in` and `out` are lists and repeat by design; every other key — the
  // station pair included — is one claim, and a repeated one is two claims
  // about one thing. Either could be meant, so neither is taken. The check
  // runs before the reserved skip: `stn` given twice used to slip through
  // here and silently load the first station named.
  for (const key of new Set(pairs.keys())) {
    if (key === 'in' || key === 'out') continue;
    const values = pairs.getAll(key);
    if (values.length > 1) throw new Error(`${key} is given ${values.length} times`);
    if (RESERVED.includes(key)) continue;
    params[key] = readValue(key, values[0]);
  }

  // The one cross-key rule: the occupied band runs forwards. The desk's sweep
  // can only produce `from < to`, and a backwards band accepted here writes a
  // Schedule:Compact whose Until: times run in reverse, which the engine
  // rejects after the link was already declared loaded.
  if (params.occFrom >= params.occTo) {
    throw new Error(
      `the occupied hours run from ${params.occFrom} to ${params.occTo}, which is not a band`,
    );
  }

  return { params, bypass, station };
}
