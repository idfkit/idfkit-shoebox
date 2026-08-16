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
 * `URLSearchParams` syntax — `v1&width=20&wwrS=0.35&stn=725650` — because the
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
} from './controls.js';

export const LINK_VERSION = 'v1';

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
 * What an omitted key meant, per version. Today one entry; a changed default
 * adds the outgoing table here under the old version before the new one ships.
 *
 * The Grounds channel moved the stock example's grounds lighting out of the
 * baseline without a bump: that would ordinarily be a v2 with a migration
 * engaging the strip on old links, but it shipped before any link existed in
 * the wild, so v1 simply means the desk as it stands.
 */
const DEFAULTS_BY_VERSION = Object.freeze({ v1: DEFAULT_PARAMETERS });

/**
 * One step per version bump, `(pairs) => ({ to, pairs })`, rewriting old
 * vocabulary into the next version's under the version it lands on. Empty
 * until a key actually churns; the structure exists
 * from day one because retrofitting it after unversioned links are in the wild
 * is the expensive path — there would be no way left to tell which defaults an
 * omission meant.
 */
const MIGRATIONS = Object.freeze({});

/**
 * Keys that are not parameters: the patch lists and the station. Declared
 * next to an assertion rather than a comment, so a future control key cannot
 * quietly collide with one — `controlFor` would route the collision to a
 * parameter and the link would mean two things at once.
 */
const RESERVED = Object.freeze(['in', 'out', 'stn', 'win', 'at']);
for (const key of RESERVED) {
  if (ALL_KEYS.includes(key)) {
    throw new Error(`the reserved link key "${key}" collides with a control parameter`);
  }
}

/**
 * Which environment a pinned hour belongs to, as the link spells it.
 *
 * By kind rather than by the environment's index in the run, because the index
 * is not a property of the desk: keeping the sizing days renumbers the year
 * from 0 to 2, and a link that pinned "environment 0" would silently move from
 * the year to the winter design day. The kind is what the reader pinned.
 */
const PIN_KINDS = Object.freeze(['year', 'winter', 'summer']);

/**
 * The pinned reading hour: `year.8-3T13` — kind, then the month, day and hour
 * the meters are read at.
 *
 * A calendar stamp rather than an index into the series: 5,148 means nothing
 * on a run of a different length, and a desk whose timestep or run period
 * moved would read a different hour under the same number. The stamp is
 * re-found in each new run, or it is not found and the pin is released saying
 * so — see `resolvePin` in `readings.js`.
 *
 * A full stop between the kind and the date, not the `@` this first carried:
 * `URLSearchParams` escapes `@` to `%40`, and an address bar reading
 * `at=year%408-3T13` gives up exactly the legibility this whole encoding is
 * arranged around. `.`, `-`, `_` and `*` are the separators it leaves alone;
 * the date already spends the first two.
 */
const encodePin = ({ kind, month, day, hour }) => `${kind}.${month}-${day}T${hour}`;

// Built from `PIN_KINDS` rather than repeating the alternation, so the list of
// kinds is stated once and a fourth environment kind cannot be admitted by the
// grammar while the roster it is checked against still says three.
const PIN_FORM = new RegExp(`^(${PIN_KINDS.join('|')})\\.(\\d{1,2})-(\\d{1,2})T(\\d{1,2})$`);

function decodePin(raw) {
  const match = PIN_FORM.exec(raw);
  if (!match) throw new Error(`"${raw}" is not a pinned hour like year.8-3T13`);
  const [, kind, month, day, hour] = match;
  const pin = { kind, month: Number(month), day: Number(day), hour: Number(hour) };
  // The grammar admits 19-40T31, so the calendar is checked separately.
  //
  // The hour runs to 24, not to 23. EnergyPlus stamps an hourly point with the
  // hour it *ends*, so a day is 1 through 24 and never carries a 0 — checked
  // against the shipped engine rather than assumed, because the ceiling
  // decides whether a minted link loads: the desk's own winter design day is
  // coldest in its last hour, so `at=winter.12-21T24` is a link the sheet
  // hands out, and a 23 here refused it whole on arrival.
  if (pin.month < 1 || pin.month > 12) throw new Error(`"${raw}" names month ${pin.month}`);
  if (pin.day < 1 || pin.day > 31) throw new Error(`"${raw}" names day ${pin.day}`);
  if (pin.hour > 24) throw new Error(`"${raw}" names hour ${pin.hour}`);
  return pin;
}

export { PIN_KINDS, encodePin, decodePin };

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
export function encodeState({ params, bypass, station = null, pin = null }) {
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
  // The pinned hour is a reading instruction, not a parameter: it reaches no
  // IDF object and starts no run. It rides on the link all the same, because a
  // scheme shared to make a point about one hour has to arrive reading at that
  // hour — a link that landed on the receiver's own worst hour would be the
  // two-permalinks-disagreeing problem the pin exists to end.
  if (pin) pairs.append('at', encodePin(pin));
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
      // A sixth control kind must be taught its rules here explicitly, not
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

  // A pin on the year needs a year to land in. Refused here rather than at
  // resolve time so the link fails as a link, whole and before anything is
  // loaded, which is the same treatment `win` without `stn` gets above.
  const at = pairs.get('at');
  const pin = at === null ? null : decodePin(at);
  if (pin?.kind === 'year' && wmo === null) {
    throw new Error('an hour pinned in the run period ("at") with no station ("stn") to supply one');
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

  return { params, bypass, station, pin };
}
