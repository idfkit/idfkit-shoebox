/**
 * The design space: which keys are it, which are doors out of it, which are
 * held, and the one sequence every design is drawn from.
 *
 * **DOM-free and engine-free**, by the rule `survey.js`, `pull.js` and
 * `readings.js` already follow, so the Node harnesses call the real functions.
 * This module says what *could* be run; `strategy.js` says what the runs said.
 * They are split so that determinism and matching can be checked with no
 * engine at all.
 *
 * ## Three roles, and every key has exactly one
 *
 * A numeric face is a direction a design walks along, so it is **varied**. A
 * choice is not a direction: switching the glazing model moves the design into
 * another world where other controls are alive, so it is a **door**. Everything
 * else is **held** at the stance with one sentence saying why: the solver and
 * the calendar are not the building, the priced channels do not reach it, the
 * system's own choices change what a reading means, and a twenty-four hour
 * profile is a shape rather than a position. The table is built at load and
 * asserted to cover `ALL_KEYS` exactly once (SC-011), because a key with no
 * role is a key the plan would silently neither vary nor list.
 *
 * ## One sequence over every face
 *
 * Every design is a point of one fixed Sobol sequence that assigns a value to
 * **every** varied face, including the faces that are dark in the world being
 * sampled. That single decision carries four requirements. Design *i* in two
 * worlds one door apart is the same parameters with one key flipped, so a jump
 * is a difference between two runs of one building (FR-010). Entering a world
 * reuses every run its island already made (FR-025). The sample does not
 * depend on where the varied controls stand, so a slider gesture invalidates
 * nothing. And no seed, clock or machine enters, so one link samples the same
 * designs everywhere (FR-008).
 */

import { ADIABATIC, ALL_KEYS, CHANNELS, CHANNEL_BY_ID, DEFAULT_PARAMETERS, controlFor, formatValue, labelFor } from './controls.js';
import { channelState } from './model.js';
import { refusesSweep } from './study.js';
import { CONVENTION } from './survey.js';

/* ══ roles ═══════════════════════════════════════════════════════════════ */

/**
 * Channels that are not the building. The register's `UNTOUCHABLE` keeps the
 * same two out of every preset for the same reason, and a plan that varied the
 * timestep would be comparing one building answered two ways.
 */
const NOT_BUILDING = new Set(['solver', 'run']);

/**
 * Two choices that sit on building channels and are nevertheless solution
 * algorithms: one decides how shadows are calculated, the other how heat is
 * conducted through a layer. They change how the engine answers, not what the
 * building is.
 */
const ALGORITHMS = new Set(['solarDist', 'hbAlgorithm']);

/**
 * The design elements whose being in or out of the path is itself a door
 * (FR-004). Blinds, rooflights, an overhang, dimming and the neighbouring
 * buildings change what the building *is*; Fabric, Mass, Air, Gains and
 * Grounds change which physics is modelled, and System changes what a reading
 * means. Declared by channel id and asserted against `CHANNELS`, so a renamed
 * channel stops the page rather than quietly stopping being a door.
 */
export const PATCH_DOORS = Object.freeze(['context', 'skylights', 'shading', 'blinds', 'daylight']);

/** What each patch door is called in a world's name, in design terms. */
const PATCH_WORDS = Object.freeze({
  context: 'the neighbouring buildings',
  skylights: 'rooflights',
  shading: 'shading',
  blinds: 'blinds',
  daylight: 'daylight dimming',
});

/**
 * One sentence per held group (FR-003, FR-043). Every held `FaceRole` resolves
 * to one of these or to its own `refusesSweep` sentence, and a patch state that
 * is not a door resolves to `physics` or `system`.
 */
export const HOLD_REASONS = Object.freeze({
  notBuilding:
    'Decides how the engine answers or over which days, not what the building is; held as set, by the rule that keeps Solver and Run out of every preset.',
  priced: 'Prices the run rather than shaping it; nothing it owns reaches the model, so it is held as set.',
  system:
    'Changes what a reading measures, a free-running temperature against a conditioned one, rather than what the building is; held as set.',
  algorithm: 'A solution algorithm, not the building; held as set, by the rule that keeps Solver out.',
  physics:
    'Patching this channel changes which physics is modelled, not which building is drawn; patch it yourself to explore that world.',
});

/**
 * Which stage of a project each channel is usually settled at (FR-037).
 *
 * A claim about practice, not a published rule, so every row says so. Declared
 * here rather than in `strategy.js` beside the other vocabulary because every
 * `Door` carries its stage and `strategy.js` imports this module: a second copy
 * would be the drift the declaration exists to prevent, and a cycle between the
 * two modules would be one load-order accident from a binding read before it
 * was written. `strategy.js` re-exports it.
 */
const stage = (n, why) => Object.freeze({ stage: n, why: `${CONVENTION} ${why}` });
export const DESIGN_STAGE = Object.freeze({
  massing: stage(1, 'The size and stacking of the box is fixed before anything is hung on it.'),
  site: stage(1, 'The ground and its exposure are given with the site.'),
  context: stage(1, 'The neighbours are given with the site.'),
  fabric: stage(2, 'Walls and roof are settled once the massing is.'),
  mass: stage(2, 'The slab and its weight are settled with the structure.'),
  glazing: stage(3, 'Openings are drawn once the walls they are cut into are.'),
  skylights: stage(3, 'Rooflights are drawn once the roof is.'),
  shading: stage(3, 'Overhangs and fins are drawn with the openings they shade.'),
  blinds: stage(4, 'Blinds are specified after the glass they hang behind.'),
  air: stage(4, 'Ventilation is detailed once the envelope is.'),
  gains: stage(4, 'What the room is used for is briefed, then refined.'),
  daylight: stage(5, 'Dimming controls are specified late, with the lighting.'),
  system: stage(5, 'Setpoints and plant are sized last, against everything above.'),
  grounds: stage(5, 'External lighting is specified last.'),
});

/**
 * The role one key plays in the design space.
 *
 * `dimension` is set exactly when the key is varied and `reason` exactly when
 * it is held, so a varied key cannot carry a reason and a held key cannot be
 * given a dimension of the sequence by mistake.
 */
export class FaceRole {
  constructor({ key, role, dimension = null, reason = null }) {
    if (!['varied', 'door', 'held'].includes(role)) throw new Error(`"${key}" is given the role "${role}"`);
    if ((role === 'varied') !== Number.isInteger(dimension)) {
      throw new Error(`"${key}" is ${role} and ${dimension === null ? 'has no' : 'has a'} dimension of the sequence`);
    }
    if ((role === 'held') !== (typeof reason === 'string' && reason.length > 0)) {
      throw new Error(`"${key}" is ${role} and ${reason ? 'carries' : 'carries no'} reason for being held`);
    }
    this.key = key;
    this.role = role;
    this.dimension = dimension;
    this.reason = reason;
    Object.freeze(this);
  }
}

/** Where a key would sit before the sequence is consulted: its role and why. */
function roleWithoutDimension(key) {
  const { channel, control, face } = controlFor(key);
  if (NOT_BUILDING.has(channel.id)) return { role: 'held', reason: HOLD_REASONS.notBuilding };
  if (channel.prices) return { role: 'held', reason: HOLD_REASONS.priced };
  if (ALGORITHMS.has(key)) return { role: 'held', reason: HOLD_REASONS.algorithm };
  if (face || control.kind === 'selector') {
    return channel.id === 'system' ? { role: 'held', reason: HOLD_REASONS.system } : { role: 'door' };
  }
  const faceless = refusesSweep(control);
  if (faceless) return { role: 'held', reason: faceless };
  return { role: 'varied' };
}

/* ══ the dimension order ═════════════════════════════════════════════════ */

/**
 * Which dimension of the sequence each varied face takes. **Append-only.**
 *
 * Seeded in strip order, and never again ordered by it: inserting a control
 * mid-strip would renumber every later dimension and silently change the
 * sample behind every plan link ever shared. So a new face takes the next
 * dimension at the end, and a face that leaves the desk is not deleted — its
 * key goes into `RETIRED` and its dimension stays spent, so the ones after it
 * keep their indices. It is `MIGRATIONS` in miniature, and the harness holds a
 * frozen copy of this list as shipped and fails on any reordering or deletion.
 */
export const DIMENSION_ORDER = Object.freeze([
  // Massing
  'width', 'depth', 'height', 'multiplier',
  // Site
  'groundReflect', 'groundTemp',
  // Context
  'ctxDistance', 'ctxHeight', 'ctxWidth',
  // Glazing
  'wwrN', 'wwrE', 'wwrS', 'wwrW', 'sill', 'uFactor', 'shgc', 'visT', 'panes', 'paneEmiss', 'gapWidth', 'frameWidth', 'frameCond',
  // Skylights
  'skyRatio', 'skyCount', 'skyCurb', 'skyU', 'skySHGC', 'skyVisT',
  // Shading
  'ohN', 'ohE', 'ohS', 'ohW', 'ohRise', 'fin', 'finOffset',
  // Blinds
  'shadeSetpoint', 'slatAngle', 'slatWidth',
  // Fabric
  'wallR', 'roofR', 'wallMass', 'wallAbs', 'roofAbs', 'emittance',
  // Mass
  'slab', 'internalMass', 'internalMassThickness',
  // Air
  'envLeak', 'openN', 'openE', 'openS', 'openW', 'openSetpoint', 'openDeltaLo', 'openDeltaHi', 'openMaxWind', 'infiltration', 'infConstant', 'infWind', 'infStack', 'ventilation', 'ventMinIndoor', 'ventMaxOutdoor', 'ventDeltaT', 'ventMaxWind',
  // Gains
  'occupancy', 'peopleCount', 'activity', 'lighting', 'lightRadiant', 'equipment', 'equipPeak', 'equipLatent',
  // Daylight
  'dlSetpoint', 'dlFraction', 'dlDepth', 'dlHeight',
  // System
  'heatSet', 'coolSet', 'setback', 'outdoorAir', 'heatRecovery', 'supplyMaxT', 'supplyMinT',
  // Grounds
  'extLights',
]);

/** Keys whose dimension is spent and whose control has left the desk. Empty so far. */
export const RETIRED = Object.freeze(new Set());

/* ══ the sequence ════════════════════════════════════════════════════════ */

/**
 * Joe and Kuo's direction numbers (2008, `new-joe-kuo-6.21201`), dimensions 2
 * to 128, one row each as `s a m_1 … m_s`. Dimension 1 is van der Corput and
 * needs none. A data table, not a dependency: 3.4 KB of text against the
 * package Principle V would otherwise have to amend for. Carried well past the
 * 85 faces the desk has today so that appending a control never has to touch
 * this table.
 */
const JOE_KUO =
  '1 0 1|2 1 1 3|3 1 1 3 1|3 2 1 1 1|4 1 1 1 3 3|4 4 1 3 5 13|5 2 1 1 5 5 17|5 4 1 1 5 5 5|5 7 1 1 7 11 19|5 11 1 1 5 1 1|5 13 1 1 1 3 11|5 14 1 3 5 5 31|6 1 1 3 3 9 7 49|6 13 1 1 1 15 21 21|6 16 1 3 1 13 27 49|6 19 1 1 1 15 7 5|6 22 1 3 1 15 13 25|6 25 1 1 5 5 19 61|7 1 1 3 7 11 23 15 103|7 4 1 3 7 13 13 15 69|7 7 1 1 3 13 7 35 63|7 8 1 3 5 9 1 25 53|7 14 1 3 1 13 9 35 107|7 19 1 3 1 5 27 61 31|7 21 1 1 5 11 19 41 61|7 28 1 3 5 3 3 13 69|7 31 1 1 7 13 1 19 1|7 32 1 3 7 5 13 19 59|7 37 1 1 3 9 25 29 41|7 41 1 3 5 13 23 1 55|7 42 1 3 7 3 13 59 17|7 50 1 3 1 3 5 53 69|7 55 1 1 5 5 23 33 13|7 56 1 1 7 7 1 61 123|7 59 1 1 7 9 13 61 49|7 62 1 3 3 5 3 55 33|8 14 1 3 1 15 31 13 49 245|8 21 1 3 5 15 31 59 63 97|8 22 1 3 1 11 11 11 77 249|8 38 1 3 1 11 27 43 71 9|8 47 1 1 7 15 21 11 81 45|8 49 1 3 7 3 25 31 65 79|8 50 1 3 1 1 19 11 3 205|8 52 1 1 5 9 19 21 29 157|8 56 1 3 7 11 1 33 89 185|8 67 1 3 3 3 15 9 79 71|8 70 1 3 7 11 15 39 119 27|8 84 1 1 3 1 11 31 97 225|8 97 1 1 1 3 23 43 57 177|8 103 1 3 7 7 17 17 37 71|8 115 1 3 1 5 27 63 123 213|8 122 1 1 3 5 11 43 53 133|9 8 1 3 5 5 29 17 47 173 479|9 13 1 3 3 11 3 1 109 9 69|9 16 1 1 1 5 17 39 23 5 343|9 22 1 3 1 5 25 15 31 103 499|9 25 1 1 1 11 11 17 63 105 183|9 44 1 1 5 11 9 29 97 231 363|9 47 1 1 5 15 19 45 41 7 383|9 52 1 3 7 7 31 19 83 137 221|9 55 1 1 1 3 23 15 111 223 83|9 59 1 1 5 13 31 15 55 25 161|9 62 1 1 3 13 25 47 39 87 257|9 67 1 1 1 11 21 53 125 249 293|9 74 1 1 7 11 11 7 57 79 323|9 81 1 1 5 5 17 13 81 3 131|9 82 1 1 7 13 23 7 65 251 475|9 87 1 3 5 1 9 43 3 149 11|9 91 1 1 3 13 31 13 13 255 487|9 94 1 3 3 1 5 63 89 91 127|9 103 1 1 3 3 1 19 123 127 237|9 104 1 1 5 7 23 31 37 243 289|9 109 1 1 5 11 17 53 117 183 491|9 122 1 1 1 5 1 13 13 209 345|9 124 1 1 3 15 1 57 115 7 33|9 137 1 3 1 11 7 43 81 207 175|9 138 1 3 1 1 15 27 63 255 49|9 143 1 3 5 3 27 61 105 171 305|9 145 1 1 5 3 1 3 57 249 149|9 152 1 1 3 5 5 57 15 13 159|9 157 1 1 1 11 7 11 105 141 225|9 167 1 3 3 5 27 59 121 101 271|9 173 1 3 5 9 11 49 51 59 115|9 176 1 1 7 1 23 45 125 71 419|9 181 1 1 3 5 23 5 105 109 75|9 182 1 1 7 15 7 11 67 121 453|9 185 1 3 7 3 9 13 31 27 449|9 191 1 3 1 15 19 39 39 89 15|9 194 1 1 1 1 1 33 73 145 379|9 199 1 3 1 15 15 43 29 13 483|9 218 1 1 7 3 19 27 85 131 431|9 220 1 3 3 3 5 35 23 195 349|9 227 1 3 3 7 9 27 39 59 297|9 229 1 1 3 9 11 17 13 241 157|9 230 1 3 7 15 25 57 33 189 213|9 234 1 1 7 1 9 55 73 83 217|9 236 1 3 3 13 19 27 23 113 249|9 241 1 3 5 3 23 43 3 253 479|9 244 1 1 5 5 11 5 45 117 217|9 253 1 3 3 7 29 37 33 123 147|10 4 1 3 1 15 5 5 37 227 223 459|10 13 1 1 7 5 5 39 63 255 135 487|10 19 1 3 1 7 9 7 87 249 217 599|10 22 1 1 3 13 9 47 7 225 363 247|10 50 1 3 7 13 19 13 9 67 9 737|10 55 1 3 5 5 19 59 7 41 319 677|10 64 1 1 5 3 31 63 15 43 207 789|10 69 1 1 7 9 13 39 3 47 497 169|10 98 1 3 1 7 21 17 97 19 415 905|10 107 1 3 7 1 3 31 71 111 165 127|10 115 1 1 5 11 1 61 83 119 203 847|10 121 1 3 3 13 9 61 19 97 47 35|10 127 1 1 7 7 15 29 63 95 417 469|10 134 1 3 1 9 25 9 71 57 213 385|10 140 1 3 5 13 31 47 101 57 39 341|10 145 1 1 3 3 31 57 125 173 365 551|10 152 1 3 7 1 13 57 67 157 451 707|10 158 1 1 1 7 21 13 105 89 429 965|10 161 1 1 5 9 17 51 45 119 157 141|10 171 1 3 7 7 13 45 91 9 129 741|10 181 1 3 7 1 23 57 67 141 151 571|10 194 1 1 3 11 17 47 93 107 375 157|10 199 1 3 3 5 11 21 43 51 169 915|10 203 1 1 5 3 15 55 101 67 455 625|10 208 1 3 5 9 1 23 29 47 345 595|10 227 1 3 7 7 5 49 29 155 323 589|10 242 1 3 3 7 5 41 127 61 261 717';

/**
 * The scramble's seed, a declared constant. Changing it changes every design
 * behind every plan link, so it is part of the link format in effect and moves
 * only with `LINK_VERSION`.
 */
const SEED = 0x5b0e_2026;

const DIRECTIONS = (() => {
  const all = [Uint32Array.from({ length: 32 }, (_, j) => (1 << (31 - j)) >>> 0)];
  for (const row of JOE_KUO.split('|')) {
    const [s, a, ...m] = row.split(' ').map(Number);
    if (m.length !== s) throw new Error(`a direction row declares degree ${s} and carries ${m.length} numbers`);
    const v = new Uint32Array(32);
    for (let j = 0; j < 32; j += 1) {
      if (j < s) {
        v[j] = (m[j] << (31 - j)) >>> 0;
        continue;
      }
      // The recurrence of Bratley and Fox, as Joe and Kuo state it: the
      // primitive polynomial's inner coefficients are the bits of `a`.
      let x = v[j - s] ^ (v[j - s] >>> s);
      for (let k = 1; k < s; k += 1) if ((a >>> (s - 1 - k)) & 1) x ^= v[j - k];
      v[j] = x >>> 0;
    }
    all.push(v);
  }
  return Object.freeze(all);
})();

const reverseBits = (x) => {
  x = ((x >>> 1) & 0x55555555) | ((x & 0x55555555) << 1);
  x = ((x >>> 2) & 0x33333333) | ((x & 0x33333333) << 2);
  x = ((x >>> 4) & 0x0f0f0f0f) | ((x & 0x0f0f0f0f) << 4);
  x = ((x >>> 8) & 0x00ff00ff) | ((x & 0x00ff00ff) << 8);
  return ((x >>> 16) | (x << 16)) >>> 0;
};

/** A 32-bit integer hash (Wellons's lowbias32), for one seed per dimension. */
const hash = (x) => {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

/**
 * Burley's nested uniform scramble (JCGT 2020): a Laine-Karras permutation of
 * the reversed bits, which is an Owen scramble in base two computed from a
 * hash instead of stored as a tree. Unscrambled Sobol has poor two-dimensional
 * projections for some pairs of high dimensions, and a scatter drawn along two
 * moves is exactly a two-dimensional projection.
 */
function scramble(x, seed) {
  x = reverseBits(x);
  x = (x + seed) >>> 0;
  x ^= Math.imul(x, 0x6c50b47c);
  x ^= Math.imul(x, 0xb82f1e52);
  x ^= Math.imul(x, 0xc7afe638);
  x ^= Math.imul(x, 0x8d22f6e6);
  return reverseBits(x >>> 0);
}

const SEEDS = DIRECTIONS.map((_, dimension) => hash((SEED ^ hash(dimension + 1)) >>> 0));

/**
 * One coordinate of the sequence, in [0, 1): a pure function of its two
 * arguments. In natural order rather than Gray-code order, which visits the
 * same set of points in every power-of-two prefix — and a prefix of 2^k is the
 * only kind this module ever takes.
 */
export function unit(index, dimension) {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) {
    throw new Error(`the sequence has no point at index ${index}`);
  }
  const v = DIRECTIONS[dimension];
  if (!v) throw new Error(`the sequence carries ${DIRECTIONS.length} dimensions, and ${dimension} was asked for`);
  let x = 0;
  for (let j = 0, i = index; i > 0; j += 1, i >>>= 1) if (i & 1) x ^= v[j];
  return scramble(x >>> 0, SEEDS[dimension]) / 2 ** 32;
}

const decimalsOf = (step) => (String(step).split('.')[1] ?? '').length;

/**
 * A coordinate made into a position the control can hold.
 *
 * Every stop of the face is equally likely: `u` is cut into as many equal bins
 * as the face has stops, where rounding `u · range / step` would give the two
 * end stops half a bin each and under-sample exactly the rim a reading is most
 * often best at. Rounded to the step's own decimals at the end, the rule
 * `field.js` keeps, because `0 + 3 · 0.05` is 0.15000000000000002 and that
 * number would ride into the IDF as it stands.
 */
function snapped(control, u) {
  const stops = Math.floor((control.max - control.min) / control.step + 1e-9);
  const at = Math.min(stops, Math.floor(u * (stops + 1)));
  return Number((control.min + at * control.step).toFixed(decimalsOf(control.step)));
}

/* ══ the table, built at load ════════════════════════════════════════════ */

/**
 * Every parameter in the order the live desk holds them, which is
 * `DEFAULT_PARAMETERS`'s. Not a nicety: a design's cache identity is a
 * serialisation of its whole desk, and a plan design and a study sample of the
 * same building only share one cache entry if their keys come out in the same
 * order (FR-011).
 */
export const PARAM_ORDER = Object.freeze(Object.keys(DEFAULT_PARAMETERS));

const ROLES = new Map();
{
  const dimensionOf = new Map();
  DIMENSION_ORDER.forEach((key, at) => {
    if (dimensionOf.has(key)) throw new Error(`DIMENSION_ORDER names "${key}" twice`);
    dimensionOf.set(key, at);
  });
  if (DIMENSION_ORDER.length > DIRECTIONS.length) {
    throw new Error(`DIMENSION_ORDER needs ${DIMENSION_ORDER.length} dimensions and the sequence carries ${DIRECTIONS.length}`);
  }
  for (const key of ALL_KEYS) {
    if (ROLES.has(key)) throw new Error(`"${key}" is given two roles in the design space`);
    const { role, reason = null } = roleWithoutDimension(key);
    if (role === 'varied' && !dimensionOf.has(key)) {
      throw new Error(`"${key}" is a varied face and has no dimension; append it to DIMENSION_ORDER`);
    }
    if (role !== 'varied' && dimensionOf.has(key) && !RETIRED.has(key)) {
      throw new Error(`DIMENSION_ORDER names "${key}", which is ${role} rather than varied; retire it instead`);
    }
    ROLES.set(key, new FaceRole({ key, role, reason, dimension: role === 'varied' ? dimensionOf.get(key) : null }));
  }
  for (const key of DIMENSION_ORDER) {
    if (!ROLES.has(key) && !RETIRED.has(key)) {
      throw new Error(`DIMENSION_ORDER names "${key}", which no control owns; move it to RETIRED`);
    }
  }
  // The same set both ways, so a design built in that order is a whole desk.
  const params = new Set(PARAM_ORDER);
  for (const key of ALL_KEYS) if (!params.has(key)) throw new Error(`"${key}" has no default, so no design can hold it`);
  for (const key of PARAM_ORDER) if (!ROLES.has(key)) throw new Error(`the default "${key}" is owned by no control`);
  for (const id of PATCH_DOORS) {
    if (!CHANNEL_BY_ID[id]?.bypassable) throw new Error(`the patch door "${id}" names no bypassable channel`);
  }
  for (const channel of CHANNELS) {
    const owed = !channel.prices && !NOT_BUILDING.has(channel.id);
    if (owed !== Boolean(DESIGN_STAGE[channel.id])) {
      throw new Error(`DESIGN_STAGE ${owed ? 'has no stage for' : 'stages'} the ${channel.name} channel`);
    }
  }
}

/** The role of one key. Throws for a key no control owns. */
export function roleOf(key) {
  const role = ROLES.get(key);
  if (!role) throw new Error(`no control owns the parameter "${key}"`);
  return role;
}

/** Every key the sequence moves, in dimension order, retired keys left out. */
export const VARIED = Object.freeze(DIMENSION_ORDER.filter((key) => !RETIRED.has(key)));

/* ══ doors ═══════════════════════════════════════════════════════════════ */

/** The patch map, in the order `patching()` writes it, with booleans only. */
function orderPatch(patch) {
  return Object.freeze(
    Object.fromEntries(CHANNELS.filter((c) => c.bypassable).map((c) => [c.id, Boolean(patch[c.id])])),
  );
}

/**
 * One choice, or one design element's patch state, that leads to other
 * worlds. Its settings are the option values, or `[true, false]` for a patch,
 * where true is *out* — the patch bay's own convention.
 */
export class Door {
  constructor({ id, channel, kind, key = null, settings }) {
    if (kind !== 'choice' && kind !== 'patch') throw new Error(`the door "${id}" is of kind "${kind}"`);
    if ((kind === 'choice') !== Boolean(key)) throw new Error(`the door "${id}" and its key disagree about its kind`);
    this.id = id;
    this.channel = channel;
    this.kind = kind;
    this.key = key;
    this.settings = Object.freeze([...settings]);
    this.stage = DESIGN_STAGE[channel.id].stage;
    Object.freeze(this);
  }

  /** The world behind one setting, named in design terms. */
  label(setting) {
    if (this.kind === 'patch') return `${setting ? 'Without' : 'With'} ${PATCH_WORDS[this.channel.id]}`;
    return `${labelFor(this.key)}: ${formatValue(this.key, setting)}`;
  }

  /** What the door does to a desk, where a choice carries what it implies. */
  implied(setting) {
    if (this.kind === 'patch') return {};
    return controlFor(this.key).control.implies?.(setting) ?? {};
  }
}

const DOORS = (() => {
  const doors = [];
  for (const channel of CHANNELS) {
    for (const key of channel.keys()) {
      if (ROLES.get(key)?.role !== 'door') continue;
      const { control, face } = controlFor(key);
      const settings = face ? [face.open, ADIABATIC] : control.options.map((option) => option.value);
      doors.push(new Door({ id: key, channel, kind: 'choice', key, settings }));
    }
    if (PATCH_DOORS.includes(channel.id)) {
      doors.push(new Door({ id: `patch:${channel.id}`, channel, kind: 'patch', settings: [true, false] }));
    }
  }
  // Design stage first, then declaration order, which a stable sort keeps.
  return Object.freeze(doors.sort((left, right) => left.stage - right.stage));
})();

/**
 * Every door on the desk, in design-stage order.
 *
 * A choice door on a channel that is out of the path is still returned, and
 * its neighbours are refused with the sentence saying how to reach them: it is
 * not omitted, because FR-043 has the plan state what it has not visited.
 */
export function doorsOf() {
  return DOORS;
}

/* ══ worlds ══════════════════════════════════════════════════════════════ */

/** Why a key reaches no object in a world, in the channel's or control's own words. */
function darkReason(key, params, state) {
  const { channel, control, side } = controlFor(key);
  const here = state.get(channel.id);
  if (here.bypassed) return `The ${channel.name} channel is out of the path in this world.`;
  if (!here.engaged) return here.blocked;
  if (!control.shown(params)) return `Withdrawn from the ${channel.name} strip by its own model choice in this world.`;
  if (control.idle(params)) return control.note ?? 'Set, but reaching no object at this design.';
  if (side && !side.reaches(params)) return side.reasonFor(params);
  return null;
}

/**
 * One setting of every door, and what is live in it.
 *
 * Two worlds are the same world exactly when their held keys and patch are the
 * same, which is what `signature` serialises. `desk` is the whole desk the
 * world was entered at, kept because a neighbour is that desk with one door
 * flipped — and a neighbouring world is always a desk the console itself could
 * reach, never a combination assembled from parts.
 *
 * `live` is read from `Control.shown` and from the engaged state
 * `channelState` decides, never from where a control happens to be set: a
 * control greyed by its own `needs` at this desk is still part of the world,
 * because the next design over may revive it, and the probe at that design is
 * where its darkness is asked (`probesAt`).
 */
export class World {
  constructor({ desk, patch, via = null }) {
    const ordered = orderPatch(patch);
    const params = {};
    const held = {};
    for (const key of PARAM_ORDER) {
      params[key] = desk[key];
      if (ROLES.get(key).role !== 'varied') held[key] = desk[key];
    }
    const state = channelState(params, ordered);
    const live = [];
    const dark = [];
    for (const key of VARIED) {
      const { channel, control } = controlFor(key);
      const here = state.get(channel.id);
      if (here.engaged && control.shown(params)) live.push(key);
      else dark.push(Object.freeze({ key, reason: darkReason(key, params, state) }));
    }
    this.signature = JSON.stringify([held, ordered]);
    this.held = Object.freeze(held);
    this.patch = ordered;
    this.desk = Object.freeze(params);
    this.live = Object.freeze(live);
    this.dark = Object.freeze(dark);
    this.via = via ? Object.freeze({ ...via }) : null;
    this.engaged = Object.freeze(
      [...state].filter(([, channel]) => channel.engaged).map(([id]) => id),
    );
    Object.freeze(this);
  }

  /** Controls live here and dark in `from`, in dimension order (FR-025). */
  cameAlive(from) {
    const before = new Set(from.live);
    return this.live.filter((key) => !before.has(key));
  }

  /** Controls live in `from` and dark here, in dimension order (FR-025). */
  wentDark(from) {
    const now = new Set(this.live);
    return from.live.filter((key) => !now.has(key));
  }
}

/** The world the desk is in. */
export function worldOf(desk, patch) {
  return new World({ desk, patch });
}

/**
 * One world one door away, or the reason it cannot be entered from here.
 * Exactly one of the two, by the rule `Reading` in `tm59.js` keeps.
 */
export class Neighbour {
  constructor({ door, from, setting, world = null, refusal = null }) {
    if ((world === null) === (refusal === null)) {
      throw new Error(`the neighbour through ${door.id} carries ${world ? 'both a world and a refusal' : 'neither a world nor a refusal'}`);
    }
    this.door = door;
    this.from = from;
    this.setting = setting;
    this.world = world;
    this.refusal = refusal;
    this.label = door.label(setting);
    this.id = `${door.id}=${String(setting)}`;
    Object.freeze(this);
  }
}

/**
 * Every other setting of every door, entered or refused.
 *
 * A choice door is refused when its channel is out of the path or blocked,
 * when the strip is not drawing it, or when its own `needs` fails: in each
 * case the flip reaches no object and the world behind it is this one. A patch
 * door into a channel whose `requires` fails is refused with that channel's
 * own `requires.reason`, evaluated with `(params, on, off)` exactly as
 * `channelState` does — Blinds, while the glazing is a simple rating, is the
 * case US2 scenario 6 names.
 */
export function neighboursOf(world) {
  const out = [];
  const state = channelState(world.desk, world.patch);
  for (const door of DOORS) {
    if (door.kind === 'patch') {
      const from = world.patch[door.channel.id];
      const setting = !from;
      const patch = { ...world.patch, [door.channel.id]: setting };
      const there = channelState(world.desk, patch).get(door.channel.id);
      if (!setting && !there.engaged) {
        out.push(new Neighbour({ door, from, setting, refusal: there.blocked }));
      } else {
        out.push(
          new Neighbour({
            door,
            from,
            setting,
            world: new World({ desk: world.desk, patch, via: { door: door.id, from, to: setting } }),
          }),
        );
      }
      continue;
    }
    const { control } = controlFor(door.key);
    const here = state.get(door.channel.id);
    const from = world.desk[door.key];
    for (const setting of door.settings) {
      if (setting === from) continue;
      let refusal = null;
      if (here.bypassed) refusal = `Patch ${door.channel.name} in to reach this world.`;
      else if (!here.engaged) refusal = here.blocked;
      else if (!control.shown(world.desk)) {
        refusal = `Withdrawn from the ${door.channel.name} strip in this world, so this choice reaches nothing from here.`;
      } else if (control.idle(world.desk)) refusal = control.note ?? 'Set, but reaching no object in this world.';
      if (refusal) {
        out.push(new Neighbour({ door, from, setting, refusal }));
        continue;
      }
      const desk = { ...world.desk, [door.key]: setting, ...door.implied(setting) };
      out.push(
        new Neighbour({
          door,
          from,
          setting,
          world: new World({ desk, patch: world.patch, via: { door: door.id, from, to: setting } }),
        }),
      );
    }
  }
  return out;
}

/* ══ designs ═════════════════════════════════════════════════════════════ */

// Every world shares one set of varied values per index — that is the whole
// point of the arrangement — so they are computed once and kept. A plan of
// every island reads a few thousand indices at most.
const VALUES = new Map();
const VALUES_LIMIT = 8192;

function variedAt(index) {
  let values = VALUES.get(index);
  if (values) return values;
  values = {};
  for (const key of VARIED) values[key] = snapped(controlFor(key).control, unit(index, ROLES.get(key).dimension));
  Object.freeze(values);
  if (VALUES.size >= VALUES_LIMIT) VALUES.delete(VALUES.keys().next().value);
  VALUES.set(index, values);
  return values;
}

/**
 * One point of the sequence, made into a whole desk in one world.
 *
 * `u` carries the normalised coordinates of the world's live keys only, in
 * `world.live` order, because the moves are fitted over what is alive; the
 * params carry every varied key, dark ones included, because a matched pair
 * has to be the same parameters in two worlds and a key dark in one is live in
 * the other.
 */
export class Design {
  constructor({ index, world, params, u }) {
    this.index = index;
    this.world = world;
    this.params = params;
    this.u = u;
    this.id = `${world.signature}:${index}`;
    Object.freeze(this);
  }
}

/** Pure function of `(world.held, world.patch, index)`. */
export function designAt(world, index) {
  const values = variedAt(index);
  const params = {};
  for (const key of PARAM_ORDER) params[key] = ROLES.get(key).role === 'varied' ? values[key] : world.held[key];
  const u = new Float64Array(world.live.length);
  world.live.forEach((key, at) => {
    u[at] = controlFor(key).control.fraction(values[key]);
  });
  return new Design({ index, world, params: Object.freeze(params), u });
}

/**
 * The two designs one index names in two worlds one door apart (FR-010).
 *
 * Asserts the invariant rather than trusting it: the two `params` differ in
 * the door's key and in what the door implies, and in nothing else. A stray
 * key is named in the throw, because a jump taken across two different
 * buildings would be a difference of two things at once lettered as one.
 */
export function matched(home, neighbour, index) {
  if (!neighbour.world) throw new Error(`the neighbour through ${neighbour.door.id} was refused, so it has no designs`);
  const a = designAt(home, index);
  const b = designAt(neighbour.world, index);
  const door = neighbour.door;
  const allowed = new Set([
    ...(door.key ? [door.key] : []),
    ...Object.keys(door.implied(neighbour.from)),
    ...Object.keys(door.implied(neighbour.setting)),
  ]);
  for (const key of PARAM_ORDER) {
    if (a.params[key] !== b.params[key] && !allowed.has(key)) {
      throw new Error(`design ${index} through ${door.id} also differs in "${key}", so it is not a matched pair`);
    }
  }
  if (door.kind === 'choice' && a.params[door.key] === b.params[door.key]) {
    throw new Error(`design ${index} through ${door.id} does not differ in the door itself`);
  }
  return [a, b];
}

/* ══ probes ══════════════════════════════════════════════════════════════ */

/**
 * One screening run: a base design with one live control stepped.
 *
 * `skip` is set where the control is dark at this base, and no run is spent:
 * the elementary effect is then an exact zero with that reason. Only honest if
 * the dark predicate is complete, which `skip-proof.mjs` checks by building
 * both IDFs for every skipped probe on two desks and comparing them.
 */
export class Probe {
  constructor({ base, key, from, to, skip = null }) {
    if (!(base instanceof Design)) throw new Error(`the probe of ${key} has no base design`);
    if (skip === null && !(Number.isFinite(from) && Number.isFinite(to) && from !== to)) {
      throw new Error(`the probe of ${key} steps from ${from} to ${to}, which is not a step`);
    }
    this.base = base;
    this.key = key;
    this.from = from;
    this.to = to;
    this.skip = skip;
    this.id = `${base.id}:${key}`;
    Object.freeze(this);
  }

  /** The probe's own desk: the base with one key moved. */
  get params() {
    return Object.freeze({ ...this.base.params, [this.key]: this.to });
  }
}

/**
 * One probe per live key, by the pull's own step rule (research.md section 3).
 *
 * A step of the control's own grid, or a twentieth of its face where that is
 * coarser — upward where there is room, downward otherwise — so a control's
 * effect at the stance and its effect anywhere are the same measurement taken
 * in different places.
 */
export function probesAt(world, base) {
  const params = base.params;
  const state = channelState(params, world.patch);
  return world.live.map((key) => {
    const { control } = controlFor(key);
    const here = params[key];
    const size = Math.max(control.step, Math.round((control.max - control.min) / 20 / control.step) * control.step);
    const digits = decimalsOf(control.step);
    const up = Number((here + size).toFixed(digits));
    const to = up <= control.max ? up : Number((here - size).toFixed(digits));
    if (!(to >= control.min && to <= control.max && to !== here)) {
      return new Probe({
        base,
        key,
        from: here,
        to,
        skip: 'This control has no room left on its face to step along from where it stands.',
      });
    }
    // Dark at **both** ends of the step, not merely at the base. A control's
    // darkness can turn on its own value, and the skip proof found the case
    // on its first run: a 0.01 m overhang is dark because EnergyPlus merges
    // two vertices that close and deletes the surface, so the west wall says
    // it reaches nothing — and stepped to 0.16 m the same overhang is built.
    // Dark at the base alone, that probe was lettered an exact zero over a
    // real effect. Dark at both, each document is the one with the control
    // absent, so the two are the same document.
    const darkHere = darkReason(key, params, state);
    let skip = null;
    if (darkHere) {
      const there = { ...params, [key]: to };
      if (darkReason(key, there, channelState(there, world.patch))) skip = darkHere;
    }
    return new Probe({ base, key, from: here, to, skip });
  });
}
