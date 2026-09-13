/**
 * The strategy plan: what the runs said about the design space.
 *
 * **DOM-free and engine-free.** It takes the ledger and the declarations as
 * arguments and never reads `params`, the document or the clock, so the Node
 * harnesses drive it with plain lookups. `space.js` decides which designs
 * could be run; this module reads the ones that were, and turns them into the
 * screening, the moves, the share explained, the terrain, the jumps, the four
 * kinds of move, the sweet spots and the strip tags.
 *
 * Everything here comes from **one set of runs**. The moves are an active
 * subspace fitted on the screening's own elementary effects, and the four kinds
 * are read off the same effects, so the plan's axes, the screening table and
 * the tags on the strips cannot disagree about which way a control pulls
 * (Principle III: two sources for one fact drift, and the drift is silent).
 *
 * The arithmetic is written here rather than imported (Principle V): cyclic
 * Jacobi, a k-nearest-neighbour regression, a Nadaraya-Watson smoother and a
 * small least-squares solve, about the size of the survey's own marching
 * squares and matrix pair.
 */

import { BUDGETS, words } from './copy.js';
import { ALL_KEYS, CHANNELS, controlFor, labelFor } from './controls.js';
import { DESIGN_STAGE, designAt, matched, probesAt, roleOf } from './space.js';
import { CONVENTION, Coverage, READINGS, READING_BY_ID, SENSE } from './survey.js';

export { DESIGN_STAGE };

/* ══ declarations ════════════════════════════════════════════════════════ */

/**
 * Below how much a move counts as free, per reading, in the reading's own
 * units (FR-034). Nobody publishes the magnitude below which a design move
 * stops mattering, so every row is a convention and says so; SC-005 is the
 * check that these values reproduce the measured result on the reference desk.
 *
 * Cost and carbon take a share of the stance's own reading, because an
 * absolute threshold in a currency means nothing across stations and a grid
 * factor differs by a factor of ten between two of them.
 */
const free = (tau, unit, why, relative = false) =>
  Object.freeze({ tau, unit, relative, why: `${CONVENTION} ${why}` });
export const FREE = Object.freeze({
  high: free(0.5, 'K', 'Half a kelvin is below what an occupant reports as a change.'),
  low: free(0.5, 'K', 'Half a kelvin is below what an occupant reports as a change.'),
  peakHeat: free(1, 'W/m²', 'One watt per square metre is inside the rounding of a plant selection.'),
  peakCool: free(1, 'W/m²', 'One watt per square metre is inside the rounding of a plant selection.'),
  tedi: free(1, 'kWh/m²·yr', 'One kilowatt-hour per square metre-year is inside any published target’s rounding.'),
  cedi: free(1, 'kWh/m²·yr', 'One kilowatt-hour per square metre-year is inside any published target’s rounding.'),
  eui: free(1, 'kWh/m²·yr', 'One kilowatt-hour per square metre-year is inside any published benchmark’s rounding.'),
  cost: free(0.01, 'of the stance', 'One percent of the stance’s own bill.', true),
  carbon: free(0.01, 'of the stance', 'One percent of the stance’s own emissions.', true),
  overheat: free(1, '% of the year', 'One percent of the year is under ninety hours.'),
  tm59a: free(1, '% of occupied hours', 'One percent of occupied hours is a third of the criterion’s own allowance.'),
  tm59b: free(1, 'night', 'One night is a quarter of the criterion’s own allowance.'),
  tm59c: free(1, '% of occupied hours', 'One percent of occupied hours is a third of the criterion’s own allowance.'),
});

/**
 * Each reading as a strip tag names it: one word, so that a tag is built from
 * declared words and never cut (the edge case *strip tags at 390 px*).
 */
export const SHORT = Object.freeze({
  high: 'High',
  low: 'Low',
  peakHeat: 'Heat-peak',
  peakCool: 'Cool-peak',
  tedi: 'TEDI',
  cedi: 'CEDI',
  eui: 'EUI',
  cost: 'Cost',
  carbon: 'Carbon',
  overheat: 'Overheating',
  tm59a: 'TM59a',
  tm59b: 'TM59b',
  tm59c: 'TM59c',
});

/**
 * How close to an end of its slider a best value may sit and still be named a
 * sweet spot (FR-032a), as a share of the control's range. The spec's own
 * example turned into a number: a heating setpoint best near 12 °C on a 10 to
 * 26 °C slider is 0.125 of the range from its end and cannot be told apart
 * from "push it to the limit", and 0.15 refuses it with room to spare.
 */
export const MARGIN = Object.freeze({
  share: 0.15,
  why: `${CONVENTION} A best value within fifteen percent of an end cannot be told apart from pushing the control to that end.`,
});

/**
 * How much less one move may explain than two before the plan also offers the
 * reading against the leading move alone (FR-018).
 */
export const ONE_MOVE = Object.freeze({
  margin: 0.05,
  why: `${CONVENTION} Within five points of the share two moves explain, one move says nearly as much.`,
});

/** How close two readings' leading moves must be for one plan to serve both. */
export const SAME_MOVE = Object.freeze({
  degrees: 15,
  why: `${CONVENTION} Leading moves within fifteen degrees are one direction for design purposes.`,
});

/**
 * How many screening bases and designs each stage measures (research.md
 * section 7). Powers of two, because a Sobol prefix of 2^k points is balanced;
 * and `first` is a prefix of `home`, so progressive measurement throws nothing
 * away.
 */
export const DEPTH = Object.freeze({
  first: Object.freeze({ bases: 4, designs: 128 }),
  home: Object.freeze({ bases: 16, designs: 512 }),
  island: Object.freeze({ bases: 8, designs: 128 }),
  jump: 32,
});

/** How many designs a plan needs before its share explained is scored at all. */
export const SCORED_FROM = 50;

/** How many landed bases the moves need before they are fitted at all. */
export const MOVES_FROM = 4;

/** The neighbour count of the share explained, and its folds. */
const NEIGHBOURS = 10;
const FOLDS = 5;

/** The terrain: a 40 × 40 lattice, six designs within a bandwidth, five rungs. */
export const TERRAIN = Object.freeze({
  cells: 40,
  floor: 6,
  ladder: Object.freeze([0.06, 0.09, 0.13, 0.18, 0.25]),
});

const TAG_KINDS = Object.freeze(['no-regret', 'trade-off', 'lever', 'free']);

{
  // FR-044: every one of these throws at load rather than degrading at run
  // time, and a reading added to the roster without its threshold or its short
  // form stops the page naming the reading it lacks.
  for (const reading of READINGS) {
    if (!FREE[reading.id]) throw new Error(`FREE declares no threshold for the reading "${reading.id}"`);
    if (!SHORT[reading.id]) throw new Error(`SHORT declares no short form for the reading "${reading.id}"`);
    if (words(SHORT[reading.id]) !== 1) throw new Error(`the short form "${SHORT[reading.id]}" is not one word`);
    if (!SENSE[reading.id]) throw new Error(`the reading "${reading.id}" declares no improving direction to classify by`);
  }
  for (const id of [...Object.keys(FREE), ...Object.keys(SHORT)]) {
    if (!READING_BY_ID[id]) throw new Error(`the strategy plan declares "${id}", which is not a reading`);
  }
  for (const [id, row] of Object.entries(FREE)) {
    if (!(row.tau > 0)) throw new Error(`FREE.${id} declares a threshold of ${row.tau}`);
  }
  for (const row of [MARGIN, ONE_MOVE, SAME_MOVE, ...Object.values(FREE), ...Object.values(DESIGN_STAGE)]) {
    if (!row.why.startsWith(CONVENTION)) throw new Error(`a strategy-plan convention does not say it is one: ${row.why}`);
  }
  for (const channel of CHANNELS) {
    const owed = !channel.prices && channel.id !== 'solver' && channel.id !== 'run';
    if (owed !== Boolean(DESIGN_STAGE[channel.id])) {
      throw new Error(`DESIGN_STAGE ${owed ? 'has no stage for' : 'stages'} the ${channel.name} channel`);
    }
  }
  const pow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
  for (const [name, row] of Object.entries(DEPTH)) {
    const counts = typeof row === 'number' ? [row] : [row.bases, row.designs];
    if (!counts.every(pow2)) throw new Error(`DEPTH.${name} is not a power of two, so its prefix is not balanced`);
  }
  if (DEPTH.jump > DEPTH.island.designs) throw new Error('DEPTH.jump asks for more matched designs than an island holds');
  if (DEPTH.first.designs > DEPTH.home.designs || DEPTH.first.bases > DEPTH.home.bases) {
    throw new Error('DEPTH.first is not a prefix of DEPTH.home');
  }
  if (DEPTH.first.bases < MOVES_FROM) throw new Error('DEPTH.first measures too few bases to fit a move');
}

/** A reading's free threshold, resolved against the stance where it is relative. */
export function thresholdFor(reading, stanceValue = null) {
  const row = FREE[reading.id];
  if (!row.relative) return row.tau;
  if (!Number.isFinite(stanceValue) || stanceValue === 0) {
    throw new Error(
      `${reading.label}'s free threshold is a share of the stance's own reading, and the stance has none to take it of`,
    );
  }
  return row.tau * Math.abs(stanceValue);
}

/* ══ the ledger ══════════════════════════════════════════════════════════ */

/**
 * One landed run: its readings, or the reason it has none. Exactly one of the
 * two, which makes the em-dash rule structural (FR-013, FR-042): a failed run
 * is a gap with a reason, and a gap cannot be mistaken for a reading of zero.
 */
export class Landed {
  constructor({ readings = null, meterBasis = null, failure = null }) {
    if ((readings === null) === (failure === null)) {
      throw new Error(`a landed run carries ${readings ? 'both readings and a failure' : 'neither readings nor a failure'}`);
    }
    if (failure !== null && !(typeof failure === 'string' && failure.trim())) {
      throw new Error('a failed run must say why it failed');
    }
    this.readings = readings;
    this.meterBasis = meterBasis;
    this.failure = failure;
    Object.freeze(this);
  }
}

/**
 * The plan's own record of landed runs, kept beside the scheduler's cache.
 *
 * The cache is FIFO at 400 entries and one world at full depth is 1,024 runs,
 * so the cache alone could not keep a world the reader has left, and FR-028
 * requires exactly that. Raising its limit was rejected: its eviction protects
 * the studies' memory, and one global limit cannot serve two retention rules.
 * This holds only what the plan reads — the readings bag, the meter basis for
 * repricing and the failure — keyed by world signature and design index, or by
 * those and the probed key for a screening run.
 *
 * `epoch` is bumped by `clear`, which is called only where the scheduler's own
 * `clearAll` is, on a station change. A run in flight when the climate changed
 * lands late, carrying the epoch it was queued under, and is dropped rather
 * than filed as a reading of the new city's weather.
 */
export class DesignLedger {
  #entries = new Map();
  #epoch = 0;

  get epoch() {
    return this.#epoch;
  }

  get size() {
    return this.#entries.size;
  }

  /** File one landing. Returns false, and files nothing, for a stale epoch. */
  land(id, landed, epoch = this.#epoch) {
    if (!(landed instanceof Landed)) throw new Error(`the ledger was handed something other than a landed run for ${id}`);
    if (epoch !== this.#epoch) return false;
    this.#entries.set(id, landed);
    return true;
  }

  get(id) {
    return this.#entries.get(id) ?? null;
  }

  has(id) {
    return this.#entries.has(id);
  }

  /**
   * Re-letter every priced reading from its meter basis, with no new run
   * (FR-015, SC-009). The same transform `repriceStudies` hands the scheduler,
   * so a cost plan and a cost study re-price by one rule.
   */
  reprice(transform) {
    for (const [id, landed] of this.#entries) {
      if (!landed.readings || !landed.meterBasis) continue;
      this.#entries.set(
        id,
        new Landed({ readings: transform(landed.readings, landed.meterBasis), meterBasis: landed.meterBasis }),
      );
    }
  }

  clear() {
    this.#entries.clear();
    this.#epoch += 1;
  }
}

/** The ledger id of a design, and of a probe off it. */
export const designId = (world, index) => `${world.signature}:${index}`;
export const probeId = (world, index, key) => `${world.signature}:${index}:${key}`;

/** One reading out of one landing, or null: never a zero for a missing value. */
function valueOf(reading, landed) {
  if (!landed?.readings) return null;
  const value = reading.valueOf(landed.readings);
  return Number.isFinite(value) ? value : null;
}

/* ══ small arithmetic ════════════════════════════════════════════════════ */

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** The share with the majority sign, exact zeros pointing neither way. */
function consistencyOf(values) {
  let up = 0;
  let down = 0;
  for (const v of values) {
    if (v > 0) up += 1;
    else if (v < 0) down += 1;
  }
  return Object.freeze({ agree: Math.max(up, down), of: values.length });
}

/**
 * Cyclic Jacobi for a symmetric matrix held row-major in `a` (n × n).
 * Returns the eigenvalues, descending, and their unit eigenvectors as rows.
 */
export function jacobi(a, n) {
  const m = Float64Array.from(a);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) v[i * n + i] = 1;
  const norm = Math.sqrt(m.reduce((sum, x) => sum + x * x, 0)) || 1;
  for (let sweep = 0; sweep < 100; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) off += m[p * n + q] ** 2;
    if (Math.sqrt(off) <= 1e-14 * norm) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = m[p * n + q];
        if (Math.abs(apq) <= 1e-300) continue;
        const theta = (m[q * n + q] - m[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const mkp = m[k * n + p];
          const mkq = m[k * n + q];
          m[k * n + p] = c * mkp - s * mkq;
          m[k * n + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k += 1) {
          const mpk = m[p * n + k];
          const mqk = m[q * n + k];
          m[p * n + k] = c * mpk - s * mqk;
          m[q * n + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => m[j * n + j] - m[i * n + i]);
  return {
    values: order.map((i) => Math.max(0, m[i * n + i])),
    vectors: order.map((i) => Float64Array.from({ length: n }, (_, k) => v[k * n + i])),
  };
}

/** Solve a small dense system by Gaussian elimination; null where it is singular. */
function solve(a, b, n) {
  const m = Float64Array.from(a);
  const x = Float64Array.from(b);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(m[row * n + col]) > Math.abs(m[pivot * n + col])) pivot = row;
    if (Math.abs(m[pivot * n + col]) < 1e-12) return null;
    if (pivot !== col) {
      for (let k = 0; k < n; k += 1) [m[col * n + k], m[pivot * n + k]] = [m[pivot * n + k], m[col * n + k]];
      [x[col], x[pivot]] = [x[pivot], x[col]];
    }
    for (let row = col + 1; row < n; row += 1) {
      const f = m[row * n + col] / m[col * n + col];
      if (!f) continue;
      for (let k = col; k < n; k += 1) m[row * n + k] -= f * m[col * n + k];
      x[row] -= f * x[col];
    }
  }
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = x[row];
    for (let k = row + 1; k < n; k += 1) sum -= m[row * n + k] * x[k];
    x[row] = sum / m[row * n + row];
  }
  return x;
}

/**
 * The share of a reading recovered from a position alone, on designs the
 * predictor never saw (FR-017): five-fold cross-validated R² of a
 * ten-nearest-neighbour regression, folds by `index mod 5`, coordinates
 * standardised. It is the exploration's own score and the one SC-004's
 * thresholds were measured with. `coords` holds `dim` numbers per point.
 */
export function knnShare(coords, dim, values, indices) {
  const n = values.length;
  if (n < FOLDS * 2) return null;
  const scaled = Float64Array.from(coords);
  for (let d = 0; d < dim; d += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += coords[i * dim + d];
    const mu = sum / n;
    let sq = 0;
    for (let i = 0; i < n; i += 1) sq += (coords[i * dim + d] - mu) ** 2;
    const sd = Math.sqrt(sq / n) || 1;
    for (let i = 0; i < n; i += 1) scaled[i * dim + d] = (coords[i * dim + d] - mu) / sd;
  }
  const grand = mean(values);
  let total = 0;
  for (const v of values) total += (v - grand) ** 2;
  if (total === 0) return null;
  let residual = 0;
  const distances = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const fold = indices[i] % FOLDS;
    let count = 0;
    const near = [];
    for (let j = 0; j < n; j += 1) {
      if (indices[j] % FOLDS === fold) continue;
      let d2 = 0;
      for (let d = 0; d < dim; d += 1) d2 += (scaled[i * dim + d] - scaled[j * dim + d]) ** 2;
      distances[j] = d2;
      near.push(j);
      count += 1;
    }
    if (!count) return null;
    near.sort((p, q) => distances[p] - distances[q] || indices[p] - indices[q]);
    const k = Math.min(NEIGHBOURS, near.length);
    let predicted = 0;
    for (let t = 0; t < k; t += 1) predicted += values[near[t]];
    residual += (values[i] - predicted / k) ** 2;
  }
  return 1 - residual / total;
}

/* ══ elementary effects (the screening's raw material) ═══════════════════ */

/**
 * The elementary effect of every live control at every base, per full range
 * of the control and in the reading's own units (research.md section 3):
 *
 *     g[b][j] = (f(x_b + h_j e_j) − f(x_b)) / (h_j / range_j)
 *
 * A skipped probe is an **exact zero** carrying its reason, and costs no run;
 * `skip-proof.mjs` is why that is honest. A probe whose base or step failed
 * records no effect and counts as a gap, never as a zero. `complete` lists
 * the bases at which every live control has an effect, which is what the moves
 * are fitted on, so that every gradient in the covariance is a whole one.
 */
export function effectsOf(world, reading, ledger, { bases }) {
  const keys = world.live;
  const g = [];
  const baseValues = [];
  const complete = [];
  const skipped = new Map();
  const gaps = [];
  for (let b = 0; b < bases; b += 1) {
    const row = new Float64Array(keys.length).fill(Number.NaN);
    g.push(row);
    const base = designAt(world, b);
    const landed = ledger.get(designId(world, b));
    const f0 = valueOf(reading, landed);
    baseValues.push(f0);
    if (landed?.failure) gaps.push({ id: designId(world, b), reason: landed.failure });
    let whole = f0 !== null;
    probesAt(world, base).forEach((probe, j) => {
      if (probe.skip) {
        // An exact zero only where the base itself has a reading: a skipped
        // probe builds the base's own document, so where the base failed the
        // probe would have failed with it, and there is no zero to claim.
        if (f0 !== null) row[j] = 0;
        if (!skipped.has(probe.key)) skipped.set(probe.key, probe.skip);
        return;
      }
      const there = ledger.get(probeId(world, b, probe.key));
      if (there?.failure) gaps.push({ id: probeId(world, b, probe.key), reason: there.failure });
      const f1 = valueOf(reading, there);
      if (f0 === null || f1 === null) {
        whole = false;
        return;
      }
      const { control } = controlFor(probe.key);
      row[j] = (f1 - f0) / ((probe.to - probe.from) / (control.max - control.min));
    });
    if (whole) complete.push(b);
  }
  return Object.freeze({ keys, g, baseValues, complete, skipped, gaps, bases });
}

/* ══ the moves ═══════════════════════════════════════════════════════════ */

/**
 * A combination of numeric controls turned together in fixed proportions,
 * along which a reading changes within one world. Never lettered on another
 * world (FR-026), which is why it carries the one it was measured in.
 */
export class Move {
  constructor({ world, reading, rank, weights, explains, bases }) {
    if (rank !== 1 && rank !== 2) throw new Error(`a plan has two moves, not a move of rank ${rank}`);
    if (weights.length !== world.live.length) throw new Error('a move weighs a different set of controls from its world');
    this.world = world;
    this.reading = reading;
    this.rank = rank;
    this.weights = Object.freeze(weights.map(({ key, w }) => Object.freeze({ key, w })));
    this.explains = explains;
    this.bases = bases;
    // The recipe: up to five controls holding at least 5 % of the move each,
    // named in the direction that raises the axis, then the rest as one share.
    const ranked = [...this.weights].sort((l, r) => r.w * r.w - l.w * l.w || l.key.localeCompare(r.key));
    const named = ranked.filter(({ w }) => w * w >= 0.05).slice(0, 5);
    this.recipe = Object.freeze(
      named.map(({ key, w }) => Object.freeze({ key, word: w > 0 ? 'higher' : 'lower', share: w * w })),
    );
    this.others = Math.max(0, 1 - this.recipe.reduce((sum, entry) => sum + entry.share, 0));
    Object.freeze(this);
  }

  /** Where one design stands along this move. */
  along(u) {
    let t = 0;
    this.weights.forEach(({ w }, j) => {
      t += w * u[j];
    });
    return t;
  }
}

/**
 * The two leading eigenvectors of C = (1/m) Σ g gᵀ over the complete bases.
 *
 * Null below `MOVES_FROM` landed bases, and null where every gradient is
 * zero, which is a reading that does not move and is said so by `planOf`.
 * Each move is turned to raise the reading: an eigenvector has no sign, and
 * FR-016 asks the recipe to say which way the axis goes. The test is the sign
 * of the correlation between the projected coordinate and the reading over
 * the landed designs, with the largest weight made positive where that is
 * exactly zero.
 */
export function movesOf(world, reading, ledger, { bases, designs = 0, effects = null }) {
  const eff = effects ?? effectsOf(world, reading, ledger, { bases });
  const d = world.live.length;
  if (eff.complete.length < MOVES_FROM || d === 0) return null;
  const c = new Float64Array(d * d);
  for (const b of eff.complete) {
    const row = eff.g[b];
    for (let i = 0; i < d; i += 1) for (let j = 0; j < d; j += 1) c[i * d + j] += row[i] * row[j];
  }
  for (let i = 0; i < c.length; i += 1) c[i] /= eff.complete.length;
  const { values, vectors } = jacobi(c, d);
  const sum = values.reduce((s, v) => s + v, 0);
  if (!(sum > 0)) return null;
  const landed = [];
  for (let index = 0; index < designs; index += 1) {
    const value = valueOf(reading, ledger.get(designId(world, index)));
    if (value !== null) landed.push({ u: designAt(world, index).u, value });
  }
  return [0, 1].map((k) => {
    const w = Array.from(vectors[k] ?? new Float64Array(d));
    const t = landed.map(({ u }) => w.reduce((s, wj, j) => s + wj * u[j], 0));
    const fs = landed.map(({ value }) => value);
    let direction = 0;
    if (landed.length > 1) {
      const tm = mean(t);
      const fm = mean(fs);
      direction = t.reduce((s, tv, i) => s + (tv - tm) * (fs[i] - fm), 0);
    }
    // With too few designs to correlate over, the gradients themselves say
    // which way the move raises the reading: the mean of g · w over the
    // complete bases is the reading's change along it, measured rather than
    // assumed. Only where that too is exactly zero does the largest weight
    // decide, which is a convention with nothing left to contradict it.
    if (direction === 0) {
      direction = mean(eff.complete.map((b) => eff.g[b].reduce((s, gj, j) => s + gj * w[j], 0)));
    }
    if (direction === 0) {
      const largest = w.reduce((best, wj, j) => (Math.abs(wj) > Math.abs(w[best]) ? j : best), 0);
      direction = w[largest];
    }
    const sign = direction < 0 ? -1 : 1;
    return new Move({
      world,
      reading,
      rank: k + 1,
      weights: world.live.map((key, j) => ({ key, w: sign * w[j] })),
      explains: values[k] / sum,
      bases: eff.complete.length,
    });
  });
}

/* ══ sweet spots and limits ══════════════════════════════════════════════ */

/**
 * The quadratic-in-one fits of research.md section 13, one per live control:
 * least squares on `[1, u_1 … u_d, u_j²]`, linear in every control and
 * quadratic in the one being examined. Returns, per key, the linear and
 * quadratic coefficients of that key, or nothing where the design is too thin
 * to solve.
 */
function quadraticFits(world, points) {
  const d = world.live.length;
  const n = points.length;
  if (n < 2 * (d + 2)) return new Map();
  const p = d + 1;
  const g = new Float64Array(p * p);
  const h = new Float64Array(p);
  const row = new Float64Array(p);
  for (const { u, value } of points) {
    row[0] = 1;
    for (let j = 0; j < d; j += 1) row[j + 1] = u[j];
    for (let i = 0; i < p; i += 1) {
      h[i] += row[i] * value;
      for (let k = 0; k < p; k += 1) g[i * p + k] += row[i] * row[k];
    }
  }
  const fits = new Map();
  const q = p + 1;
  for (let j = 0; j < d; j += 1) {
    const a = new Float64Array(q * q);
    const b = new Float64Array(q);
    for (let i = 0; i < p; i += 1) {
      b[i] = h[i];
      for (let k = 0; k < p; k += 1) a[i * q + k] = g[i * p + k];
    }
    let s4 = 0;
    let sy = 0;
    const cross = new Float64Array(p);
    for (const { u, value } of points) {
      const u2 = u[j] * u[j];
      cross[0] += u2;
      for (let k = 0; k < d; k += 1) cross[k + 1] += u2 * u[k];
      s4 += u2 * u2;
      sy += u2 * value;
    }
    for (let k = 0; k < p; k += 1) {
      a[k * q + p] = cross[k];
      a[p * q + k] = cross[k];
    }
    a[p * q + p] = s4;
    b[p] = sy;
    const x = solve(a, b, q);
    if (x) fits.set(world.live[j], { linear: x[j + 1], quadratic: x[p] });
  }
  return fits;
}

/**
 * For one control and one reading: the estimated best value inside its range,
 * or the end it keeps improving toward. Exactly one of the two (FR-032a).
 */
export class SweetSpot {
  constructor({ key, reading, at = null, limit = null, consistency, worseEnd = null }) {
    if ((at === null) === (limit === null)) {
      throw new Error(`the sweet spot of ${key} carries ${at === null ? 'neither a value nor a limit' : 'both a value and a limit'}`);
    }
    if (limit !== null && limit !== 'min' && limit !== 'max') throw new Error(`${key} is at a limit named "${limit}"`);
    this.key = key;
    this.reading = reading;
    this.at = at;
    this.limit = limit;
    this.consistency = consistency;
    this.worseEnd = worseEnd ? Object.freeze({ ...worseEnd }) : null;
    this.estimate = true; // FR-032a: every spot on the sheet is labelled as an estimate
    Object.freeze(this);
  }
}

const decimalsOf = (step) => (String(step).split('.')[1] ?? '').length;

/**
 * Where the fitted curve turns back inside the range toward the better
 * direction, and the turn is deep enough to matter. Null for a control whose
 * fit never turns back inside its range: that control is monotone here, which
 * the screening already says, and the plan's limit test is where "at its
 * limit" is decided for an island as a whole.
 */
function spotFrom(key, reading, fit, effects, tau) {
  if (!fit) return null;
  const { linear: b, quadratic: c } = fit;
  const bowl = reading.better === 'lower' ? c > 0 : c < 0;
  if (!bowl) return null;
  const star = -b / (2 * c);
  if (!(star > 0 && star < 1)) return null;
  const f = (u) => b * u + c * u * u;
  const ends = [
    { end: 'min', by: Math.abs(f(0) - f(star)) },
    { end: 'max', by: Math.abs(f(1) - f(star)) },
  ];
  const worse = ends[0].by >= ends[1].by ? ends[0] : ends[1];
  if (worse.by < tau) return null;
  const { control } = controlFor(key);
  const j = effects.keys.indexOf(key);
  // The fit alone is not enough, and the reference desk showed why: curvature
  // from other controls leaks into one control's quadratic term, and the zone
  // multiplier, whose effect on a zone temperature is exactly zero at every
  // point, was handed a sweet spot on the high. So a spot is named only for a
  // control the screening itself says matters: its effect across its range,
  // measured at the bases, at least the free threshold.
  const measured = effects.complete.map((b0) => effects.g[b0][j]).filter(Number.isFinite);
  if (!measured.length || mean(measured.map(Math.abs)) < tau) return null;
  // Toward the spot: below it the reading should improve going up, above it
  // going down. Measured at the screening bases, where the gradient is a run
  // and not the fit.
  let agree = 0;
  let of = 0;
  for (const b0 of effects.complete) {
    const gj = effects.g[b0][j];
    const uj = designAt(effects.world ?? null, b0)?.u?.[j];
    if (!Number.isFinite(gj) || !Number.isFinite(uj)) continue;
    of += 1;
    const improving = reading.better === 'lower' ? -gj : gj;
    if ((uj < star && improving > 0) || (uj > star && improving < 0)) agree += 1;
  }
  const consistency = Object.freeze({ agree, of });
  // And most of the measured gradients have to point at it. A turn the runs
  // themselves do not lean toward is the fit's, not the building's.
  if (!(agree * 2 > of)) return null;
  if (star < MARGIN.share) return new SweetSpot({ key, reading, limit: 'min', consistency, worseEnd: worse });
  if (star > 1 - MARGIN.share) return new SweetSpot({ key, reading, limit: 'max', consistency, worseEnd: worse });
  const value = control.min + star * (control.max - control.min);
  const snapped = Number(
    (control.min + Math.round((value - control.min) / control.step) * control.step).toFixed(decimalsOf(control.step)),
  );
  return new SweetSpot({ key, reading, at: snapped, consistency, worseEnd: worse });
}

/* ══ the plan ════════════════════════════════════════════════════════════ */

/** One measured design as the plan places it. Only a landed run can be one. */
export class Dot {
  constructor({ index, id, value, x, y }) {
    if (!Number.isFinite(value)) throw new Error(`design ${index} has no reading, so it is a gap and not a dot`);
    this.index = index;
    this.id = id;
    this.value = value;
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }
}

/**
 * The smoothed, shaded surface under one island's designs for one reading.
 *
 * Inference, and built so that it cannot claim more than the dots support.
 * Its constructor re-runs the audit SC-003a states — at every local best cell,
 * the designs within one bandwidth read better on average than the designs
 * between one and two bandwidths away — so a terrain that fails it cannot be
 * built at all, only refused. It has no accessor that returns a reading at a
 * point: the view paints the lattice and letters nothing off it (FR-019).
 */
export class Terrain {
  constructor({ lattice = null, bandwidth = null, explained = null, better, refused = null, dots = [], cells = TERRAIN.cells }) {
    if ((lattice === null) === (refused === null)) {
      throw new Error(`a terrain carries ${lattice ? 'both a surface and a refusal' : 'neither a surface nor a refusal'}`);
    }
    this.cells = cells;
    this.lattice = lattice;
    this.bandwidth = bandwidth;
    this.explained = explained;
    this.better = better;
    this.refused = refused;
    if (lattice) {
      const failure = auditTerrain(lattice, cells, bandwidth, dots, better);
      if (failure) throw new Error(`a terrain was built that fails its own audit: ${failure}`);
    }
    Object.freeze(this);
  }
}

/** Dots mapped to the drawing's unit square, the space the terrain lives in. */
function unitSquare(dots) {
  const xs = dots.map((dot) => dot.x);
  const ys = dots.map((dot) => dot.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = x1 - x0 || 1;
  const sy = y1 - y0 || 1;
  return dots.map((dot) => ({ x: (dot.x - x0) / sx, y: (dot.y - y0) / sy, value: dot.value, index: dot.index }));
}

function smoothAt(cx, cy, points, h) {
  let weight = 0;
  let sum = 0;
  let near = 0;
  for (const p of points) {
    const r2 = ((p.x - cx) ** 2 + (p.y - cy) ** 2) / (h * h);
    if (r2 <= 1) near += 1;
    const w = Math.exp(-r2 / 2);
    weight += w;
    sum += w * p.value;
  }
  return { value: weight > 0 ? sum / weight : Number.NaN, near };
}

function latticeAt(points, h, cells) {
  const lattice = new Float64Array(cells * cells);
  for (let iy = 0; iy < cells; iy += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const { value, near } = smoothAt((ix + 0.5) / cells, (iy + 0.5) / cells, points, h);
      lattice[iy * cells + ix] = near >= TERRAIN.floor ? value : Number.NaN;
    }
  }
  return lattice;
}

/**
 * The audit, as a function so the constructor and the chooser run the same
 * test and a harness can run it a third time independently. Returns null
 * where it holds, and the first failure otherwise.
 *
 * FR-019 forbids a rise *or* a hollow the designs do not support, so a local
 * worst is held to the mirror of the local best's test: the designs within one
 * bandwidth must read worse than those in the ring around them. Auditing only
 * the best areas left a smoother free to dig a pit in the terrain's
 * worst-looking corner, which is the same false claim pointing the other way.
 */
export function auditTerrain(lattice, cells, h, dots, better) {
  const points = unitSquare(dots);
  const beats = (a, b) => (better === 'lower' ? a < b : a > b);
  for (let iy = 0; iy < cells; iy += 1) {
    for (let ix = 0; ix < cells; ix += 1) {
      const here = lattice[iy * cells + ix];
      if (!Number.isFinite(here)) continue;
      let neighbours = 0;
      let best = true;
      let worst = true;
      for (let dy = -1; dy <= 1 && (best || worst); dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = ix + dx;
          const ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
          const there = lattice[ny * cells + nx];
          if (!Number.isFinite(there)) continue;
          neighbours += 1;
          if (!beats(here, there)) best = false;
          if (!beats(there, here)) worst = false;
          if (!best && !worst) break;
        }
      }
      if ((!best && !worst) || !neighbours) continue;
      const cx = (ix + 0.5) / cells;
      const cy = (iy + 0.5) / cells;
      const inner = [];
      const ring = [];
      for (const p of points) {
        const r = Math.hypot(p.x - cx, p.y - cy);
        if (r <= h) inner.push(p.value);
        else if (r <= 2 * h) ring.push(p.value);
      }
      if (best && (!inner.length || !ring.length || !beats(mean(inner), mean(ring)))) {
        return `the best area at cell ${ix},${iy} holds designs no better than those around it`;
      }
      if (worst && (!inner.length || !ring.length || !beats(mean(ring), mean(inner)))) {
        return `the worst area at cell ${ix},${iy} holds designs no worse than those around it`;
      }
    }
  }
  return null;
}

/**
 * The terrain for a plan: the smallest rung of the ladder that passes the
 * audit, or a refusal where none does (research.md section 8). Its own share
 * explained is the same five-fold score, applied to the smoother.
 */
export function terrainOf(dots, reading) {
  if (!reading.better) throw new Error(`${reading.label} declares no improving direction, so no terrain can say which way is better`);
  if (dots.length < TERRAIN.floor * 2) {
    return new Terrain({ refused: 'Too few measured designs to carry a terrain yet.', better: reading.better });
  }
  const points = unitSquare(dots);
  for (const rung of TERRAIN.ladder) {
    const h = rung * Math.SQRT2;
    const lattice = latticeAt(points, h, TERRAIN.cells);
    if (auditTerrain(lattice, TERRAIN.cells, h, dots, reading.better)) continue;
    let residual = 0;
    let total = 0;
    const grand = mean(points.map((p) => p.value));
    for (const p of points) {
      const training = points.filter((q) => q.index % FOLDS !== p.index % FOLDS);
      const { value } = smoothAt(p.x, p.y, training, h);
      residual += (p.value - value) ** 2;
      total += (p.value - grand) ** 2;
    }
    return new Terrain({
      lattice,
      bandwidth: h,
      explained: total > 0 ? 1 - residual / total : null,
      better: reading.better,
      dots,
    });
  }
  return new Terrain({
    refused: 'No smoothing on the ladder keeps every best area honest here, so no terrain is drawn.',
    better: reading.better,
  });
}

/**
 * One reading's view of one world: the strategy plan proper.
 *
 * Every dot is a landed run (SC-003): there is no path into `dots` except
 * through a design whose landing carries a reading. A failed run is counted in
 * `coverage.gaps` with its reason and listed in `gaps`, never positioned and
 * never filled (FR-013).
 */
export class Plan {
  constructor(fields) {
    // The share explained is lettered wherever a plan is drawn (FR-017), so a
    // plan holds exactly one of a score and the sentence saying why it has
    // none: a null with no reason would reach the sheet as a bare em dash.
    if ((fields.explained2 === null) === (fields.scoreAbsence === null)) {
      throw new Error(
        `the plan of ${fields.reading.label} carries ${fields.explained2 === null ? 'neither a share explained nor the reason it has none' : 'both a share explained and a reason it has none'}`,
      );
    }
    if (!(fields.spots instanceof Map)) throw new Error(`the plan of ${fields.reading.label} carries its sweet spots as something other than a map`);
    Object.assign(this, fields);
    this.dots = Object.freeze([...fields.dots]);
    this.gaps = Object.freeze([...fields.gaps]);
    this.limits = Object.freeze([...fields.limits]);
    this.spots = sealed(fields.spots);
    Object.freeze(this);
  }
}

/**
 * A map that refuses to change once built. `Object.freeze` on a `Map` freezes
 * its properties and not its entries, so a frozen plan's spots could still be
 * `set` by a caller; these throw instead. The flag lives outside the instance
 * because the `Map` constructor adds its entries through `set` before any
 * field of a subclass exists.
 */
const SEALED = new WeakSet();
class SealedMap extends Map {
  set(key, value) {
    if (SEALED.has(this)) throw new Error(`a plan's sweet spots are sealed; ${String(key)} cannot be set`);
    return super.set(key, value);
  }

  delete(key) {
    if (SEALED.has(this)) throw new Error(`a plan's sweet spots are sealed; ${String(key)} cannot be deleted`);
    return super.delete(key);
  }

  clear() {
    if (SEALED.has(this)) throw new Error("a plan's sweet spots are sealed and cannot be cleared");
    super.clear();
  }
}

function sealed(map) {
  const out = new SealedMap(map);
  SEALED.add(out);
  return Object.freeze(out);
}

export function planOf(world, reading, ledger, { designs, bases, kind, tau = null }) {
  if (kind !== 'design-day' && kind !== 'annual') throw new Error(`a plan is measured at "${kind}", which is not a run kind`);
  const effects = effectsOf(world, reading, ledger, { bases });
  const moves = movesOf(world, reading, ledger, { bases, designs, effects });
  const landed = [];
  const gaps = [];
  for (let index = 0; index < designs; index += 1) {
    const id = designId(world, index);
    const entry = ledger.get(id);
    if (!entry) continue;
    if (entry.failure) {
      gaps.push(Object.freeze({ index, id, reason: entry.failure }));
      continue;
    }
    // A run landed for another reading carries no bag for this one at all:
    // it is waiting to be re-run with this reading's outputs, which is not a
    // gap. A bag that is present and empty is a run that could not answer.
    if (!(reading.quantity.id in entry.readings)) continue;
    const value = valueOf(reading, entry);
    if (value === null) {
      gaps.push(Object.freeze({ index, id, reason: `This run carries no reading of ${reading.label.toLowerCase()}.` }));
      continue;
    }
    landed.push({ index, id, value, u: designAt(world, index).u });
  }
  const coverage = new Coverage({ wanted: designs, measured: landed.length, gaps: gaps.length, density: designs });
  const values = landed.map((p) => p.value);
  const flat = landed.length > 1 && values.every((v) => v === values[0])
    ? 'This reading does not move across the design space.'
    : null;

  let dots = [];
  let explained2 = null;
  let explained1 = null;
  let scoreAbsence = null;
  if (flat) scoreAbsence = 'A reading that does not move has nothing to explain.';
  else if (!moves) {
    scoreAbsence = `The moves are fitted from ${MOVES_FROM} complete screening points; ${effects.complete.length} so far.`;
  }
  if (moves) {
    dots = landed.map((p) => new Dot({ index: p.index, id: p.id, value: p.value, x: moves[0].along(p.u), y: moves[1].along(p.u) }));
    // FR-017 scores the drawing on designs the moves were not derived from.
    // The moves are fitted on the screening's gradients, and the screening
    // bases are designs 0 to bases − 1 of this same sequence, so those designs
    // are left out of the score entirely: neither scored nor used to predict.
    const scored = dots.filter((dot) => dot.index >= bases);
    if (!flat && scored.length < SCORED_FROM) {
      scoreAbsence = `Scored on ${SCORED_FROM} designs the moves were not fitted from; ${scored.length} so far.`;
    } else if (!flat) {
      const indices = scored.map((dot) => dot.index);
      const two = new Float64Array(scored.length * 2);
      const one = new Float64Array(scored.length);
      scored.forEach((dot, i) => {
        two[i * 2] = dot.x;
        two[i * 2 + 1] = dot.y;
        one[i] = dot.x;
      });
      const scoredValues = scored.map((dot) => dot.value);
      explained2 = knnShare(two, 2, scoredValues, indices);
      explained1 = knnShare(one, 1, scoredValues, indices);
      if (explained2 === null) scoreAbsence = 'The designs scored so far do not differ enough to be scored.';
    }
  }
  const oneMove = explained1 !== null && explained2 !== null && explained1 >= explained2 - ONE_MOVE.margin;
  const terrain = moves && !flat && reading.better ? terrainOf(dots, reading) : null;

  // Sweet spots and limits, from the same landed designs.
  const threshold = tau ?? (FREE[reading.id].relative ? null : FREE[reading.id].tau);
  const fits = quadraticFits(world, landed);
  const spots = new Map();
  if (threshold !== null && reading.better) {
    for (const key of world.live) {
      const spot = spotFrom(key, reading, fits.get(key), { ...effects, world }, threshold);
      if (spot) spots.set(key, spot);
    }
  }
  const limits = [];
  if (reading.better && landed.length >= 20 && threshold !== null) {
    const ranked = [...landed].sort((l, r) => (reading.better === 'lower' ? l.value - r.value : r.value - l.value));
    const best = ranked.slice(0, Math.max(1, Math.floor(ranked.length / 10)));
    world.live.forEach((key, j) => {
      const fit = fits.get(key);
      if (!fit) return;
      const { linear: b, quadratic: c } = fit;
      // Monotone on [0, 1] toward one end, in the improving direction.
      const slope0 = b;
      const slope1 = b + 2 * c;
      if (Math.sign(slope0) !== Math.sign(slope1) || slope0 === 0) return;
      const improvingUp = reading.better === 'lower' ? slope0 < 0 : slope0 > 0;
      if (Math.abs(b * 1 + c) < threshold) return; // the whole face moves it by less than it matters
      const median = quantile(best.map((p) => p.u[j]).sort((l, r) => l - r), 0.5);
      if (improvingUp && median >= 1 - MARGIN.share) limits.push(Object.freeze({ key, end: 'max' }));
      if (!improvingUp && median <= MARGIN.share) limits.push(Object.freeze({ key, end: 'min' }));
    });
  }

  return new Plan({
    world,
    reading,
    kind,
    moves,
    dots,
    gaps,
    coverage,
    flat,
    explained2,
    explained1,
    scoreAbsence,
    oneMove,
    terrain,
    spots,
    limits,
    effects,
    designs,
    bases,
  });
}

/**
 * The share of a reading two chosen controls explain, scored exactly as a plan
 * is (SC-004's comparison): their own normalised positions as the coordinates.
 */
export function shareAlong(world, reading, ledger, keys, designs, bases = 0) {
  const at = keys.map((key) => world.live.indexOf(key));
  if (at.some((j) => j < 0)) throw new Error(`shareAlong: ${keys.join(' and ')} are not all live in this world`);
  const coords = [];
  const values = [];
  const indices = [];
  // Over the same designs the plan is scored on, or the comparison would set
  // two scores on two samples beside each other.
  for (let index = bases; index < designs; index += 1) {
    const value = valueOf(reading, ledger.get(designId(world, index)));
    if (value === null) continue;
    const { u } = designAt(world, index);
    for (const j of at) coords.push(u[j]);
    values.push(value);
    indices.push(index);
  }
  return knnShare(Float64Array.from(coords), at.length, values, indices);
}

/**
 * Binned medians of the reading along the leading move: ten equal-count bins,
 * the trend the one-move view draws and marks as an estimate (FR-018).
 */
export function trendOf(plan, bins = 10) {
  const sorted = [...plan.dots].sort((l, r) => l.x - r.x || l.index - r.index);
  if (sorted.length < bins * 2) return [];
  const out = [];
  for (let b = 0; b < bins; b += 1) {
    const slice = sorted.slice(Math.floor((b * sorted.length) / bins), Math.floor(((b + 1) * sorted.length) / bins));
    const xs = slice.map((dot) => dot.x).sort((l, r) => l - r);
    const vs = slice.map((dot) => dot.value).sort((l, r) => l - r);
    out.push(Object.freeze({ x: quantile(xs, 0.5), value: quantile(vs, 0.5), lo: quantile(vs, 0.1), hi: quantile(vs, 0.9) }));
  }
  return Object.freeze(out);
}

/* ══ jumps ═══════════════════════════════════════════════════════════════ */

/**
 * The matched pairs one neighbour is measured on: design ids, two at a time,
 * each pair built by `matched`, which asserts the two desks differ in the door
 * and what it implies and nothing else. A `Jump` accepts nothing else, so a
 * jump computed from unmatched designs cannot be constructed (SC-007).
 */
export class MatchedPairs {
  constructor(home, neighbour, count) {
    if (!neighbour.world) throw new Error(`the neighbour through ${neighbour.door.id} was refused, so it has no pairs`);
    const pairs = [];
    for (let index = 0; index < count; index += 1) {
      const [a, b] = matched(home, neighbour, index);
      pairs.push(Object.freeze([a.id, b.id]));
    }
    this.home = home;
    this.neighbour = neighbour;
    this.pairs = Object.freeze(pairs);
    Object.freeze(this);
  }
}

/**
 * The difference a door makes to a reading, on matched designs (FR-010, FR-024).
 *
 * Computed here, off its own `MatchedPairs` and the ledger, rather than handed
 * a list of differences: a constructor that accepted deltas would accept them
 * from anywhere, and the whole point of the class is that a jump cannot be
 * built from anything but one building run twice. Only pairs where **both**
 * runs landed with a reading contribute.
 *
 * `aligned` keeps one slot per pair in pair order, NaN where the pair is not
 * measured, so two readings' jumps through one door line up building by
 * building; `deltas` is the measured slots alone. `failures` lists every run
 * of the pairs that failed, with the engine's reason (FR-013, FR-043).
 */
export class Jump {
  constructor({ pairs, reading, ledger }) {
    if (!(pairs instanceof MatchedPairs)) throw new Error('a jump is taken on matched pairs and on nothing else');
    if (!(ledger instanceof DesignLedger)) throw new Error('a jump reads its pairs off the ledger and off nothing else');
    const aligned = new Float64Array(pairs.pairs.length).fill(Number.NaN);
    const failures = [];
    pairs.pairs.forEach(([a, b], at) => {
      const la = ledger.get(a);
      const lb = ledger.get(b);
      if (la?.failure) failures.push(Object.freeze({ id: a, reason: la.failure }));
      if (lb?.failure) failures.push(Object.freeze({ id: b, reason: lb.failure }));
      const fa = valueOf(reading, la);
      const fb = valueOf(reading, lb);
      if (fa !== null && fb !== null) aligned[at] = fb - fa;
    });
    this.door = pairs.neighbour.door;
    this.neighbour = pairs.neighbour;
    this.reading = reading;
    this.aligned = aligned;
    this.deltas = aligned.filter(Number.isFinite);
    this.measured = this.deltas.length;
    this.wanted = pairs.pairs.length;
    this.failures = Object.freeze(failures);
    const sorted = [...this.deltas].sort((l, r) => l - r);
    this.median = quantile(sorted, 0.5);
    this.p10 = quantile(sorted, 0.1);
    this.p90 = quantile(sorted, 0.9);
    this.consistency = consistencyOf(this.deltas);
    this.same = this.deltas.length > 0 && this.deltas.every((v) => v === 0);
    Object.freeze(this);
  }
}

export function jumpOf(pairs, reading, ledger) {
  return new Jump({ pairs, reading, ledger });
}

/**
 * A neighbour as the archipelago draws it: its jump always, and its own plan
 * once that plan has moves (data-model.md). `depth` follows from which of the
 * two it has, so an island cannot claim moves it has not measured.
 *
 * The plan must be of the neighbour's own world, never the home world's
 * (FR-026), and `cost` is what measuring its own screening still takes at the
 * desk's cadence, stated before an annual island is measured on request.
 * `failures` is every failed run behind it, from its pairs and its own plan.
 */
export class Island {
  constructor({ neighbour, jump, plan = null, cost }) {
    if (!neighbour?.world) throw new Error(`the neighbour through ${neighbour?.door?.id} was refused, so it is listed, not drawn`);
    if (!(jump instanceof Jump) || jump.neighbour !== neighbour) throw new Error(`the island ${neighbour.id} carries another door's jump`);
    if (plan !== null && !(plan instanceof Plan)) throw new Error(`the island ${neighbour.id} carries something other than a plan`);
    if (plan && plan.world.signature !== neighbour.world.signature) {
      throw new Error(`the island ${neighbour.id} carries a plan measured in another world`);
    }
    if (!(Number.isInteger(cost?.runs) && cost.runs >= 0 && Number.isFinite(cost?.seconds))) {
      throw new Error(`the island ${neighbour.id} states no cost`);
    }
    this.neighbour = neighbour;
    this.id = neighbour.id;
    this.label = neighbour.label;
    this.jump = jump;
    this.plan = plan?.moves ? plan : null;
    this.depth = this.plan ? 'plan' : 'jump';
    this.cost = Object.freeze({ runs: cost.runs, seconds: cost.seconds });
    const seen = new Set();
    this.failures = Object.freeze(
      [...jump.failures, ...(plan?.gaps ?? [])].filter(({ id }) => !seen.has(id) && seen.add(id)),
    );
    Object.freeze(this);
  }
}

/* ══ the screening ═══════════════════════════════════════════════════════ */

/**
 * One control or door for one reading: how far it moves the reading anywhere,
 * how consistently, and against the pull at the stance (FR-029 to FR-031).
 * Exactly one of `effect` and `inert`, and an unmeasured entry is inert with
 * *Not yet measured*, never an effect of zero.
 */
export class ScreeningEntry {
  constructor({ key, door = null, kind, label, reading, effect = null, signed = null, consistency = null, atStance = null, words = null, inert = null, stage = null }) {
    if ((effect === null) === (inert === null)) {
      throw new Error(`the screening entry for "${key}" carries ${effect === null ? 'neither an effect nor a reason' : 'both an effect and a reason'}`);
    }
    if (effect !== null && !['anywhere', 'only here', 'nowhere', 'reaches nothing'].includes(words)) {
      throw new Error(`the screening entry for "${key}" says "${words}"`);
    }
    this.key = key;
    this.door = door;
    this.kind = kind; // 'control' | 'door' | 'held' | 'dark'
    this.label = label;
    this.reading = reading;
    this.effect = effect;
    this.signed = signed;
    this.consistency = consistency;
    this.atStance = atStance;
    this.words = words;
    this.inert = inert;
    this.stage = stage;
    Object.freeze(this);
  }
}

export const NOT_MEASURED = 'Not yet measured.';

function wordsFor(effect, atStance, allZero, tau) {
  if (allZero && (atStance === null || atStance === 0)) return 'reaches nothing';
  if (effect >= tau) return 'anywhere';
  if (atStance !== null && Math.abs(atStance) >= tau) return 'only here';
  return 'nowhere';
}

/**
 * Every live control, every door and every held or dark key, for one reading.
 *
 * `stance` maps a control key to the pull's own entry at the stance, and its
 * per-unit effect is scaled to a full range here so the two columns are one
 * measurement taken in two places. `jumps` maps a neighbour id to its `Jump`.
 * The entries and the reasons together name every key in `ALL_KEYS` (SC-011),
 * and the function throws rather than returning a screening that drops one.
 */
export function screen(world, reading, ledger, { bases, stance = new Map(), neighbours = [], jumps = new Map(), tau }) {
  const effects = effectsOf(world, reading, ledger, { bases });
  const entries = [];
  const stageOf = (key) => DESIGN_STAGE[controlFor(key).channel.id]?.stage ?? null;
  world.live.forEach((key, j) => {
    const measured = effects.g.map((row) => row[j]).filter(Number.isFinite);
    const { control } = controlFor(key);
    const pulled = stance.get(key);
    const atStance = pulled && pulled.effect !== null ? pulled.effect * (control.max - control.min) : null;
    if (!measured.length) {
      entries.push(new ScreeningEntry({ key, kind: 'control', label: labelFor(key), reading, inert: NOT_MEASURED, atStance, stage: stageOf(key) }));
      return;
    }
    const effect = mean(measured.map(Math.abs));
    entries.push(
      new ScreeningEntry({
        key,
        kind: 'control',
        label: labelFor(key),
        reading,
        effect,
        signed: mean(measured),
        consistency: consistencyOf(measured),
        atStance,
        words: wordsFor(effect, atStance, measured.every((v) => v === 0), tau),
        stage: stageOf(key),
      }),
    );
  });
  for (const { key, reason } of world.dark) {
    entries.push(new ScreeningEntry({ key, kind: 'dark', label: labelFor(key), reading, inert: reason, stage: stageOf(key) }));
  }
  for (const neighbour of neighbours) {
    const door = neighbour.door;
    const base = { key: neighbour.id, door: door.key ?? door.id, kind: 'door', label: neighbour.label, reading, stage: door.stage };
    if (!neighbour.world) {
      entries.push(new ScreeningEntry({ ...base, inert: neighbour.refusal }));
      continue;
    }
    const jump = jumps.get(neighbour.id);
    if (!jump || !jump.measured) {
      entries.push(new ScreeningEntry({ ...base, inert: NOT_MEASURED }));
      continue;
    }
    const effect = quantile([...jump.deltas].map(Math.abs).sort((l, r) => l - r), 0.5);
    entries.push(
      new ScreeningEntry({
        ...base,
        effect,
        signed: jump.median,
        consistency: jump.consistency,
        words: jump.same ? 'reaches nothing' : effect >= tau ? 'anywhere' : 'nowhere',
      }),
    );
  }
  const named = new Set(entries.flatMap((entry) => [entry.key, entry.door].filter(Boolean)));
  for (const key of ALL_KEYS) {
    const role = roleOf(key);
    if (named.has(key)) continue;
    if (role.role === 'held') {
      entries.push(new ScreeningEntry({ key, kind: 'held', label: labelFor(key), reading, inert: role.reason, stage: null }));
      named.add(key);
    } else if (role.role === 'door') {
      // A door with no neighbour at this world at all — every setting is
      // this one — is listed rather than dropped.
      entries.push(
        new ScreeningEntry({ key, kind: 'held', label: labelFor(key), reading, inert: 'Offers no other world from here.', stage: null }),
      );
      named.add(key);
    }
  }
  for (const key of ALL_KEYS) {
    if (!named.has(key)) throw new Error(`the screening of ${reading.label} names nothing for "${key}"`);
  }
  return Object.freeze(entries);
}

/* ══ the four kinds ══════════════════════════════════════════════════════ */

const improvementOf = (reading, g) => (reading.better === 'higher' ? g : -g);

function kindOf(muA, muB, tauA, tauB) {
  const a = Math.abs(muA) >= tauA;
  const b = Math.abs(muB) >= tauB;
  if (a && b) return { kind: Math.sign(muA) === Math.sign(muB) ? 'no-regret' : 'trade-off', on: null };
  if (a) return { kind: 'lever', on: 0 };
  if (b) return { kind: 'lever', on: 1 };
  return { kind: 'free', on: null };
}

/**
 * One control or door for a pair of readings (FR-033 to FR-036). There is
 * deliberately no field combining the two readings: each is judged against
 * its own threshold in its own units, and nothing sums, weights or ranks them
 * together, because nobody publishes the weighting.
 */
export class Classification {
  constructor({ key, label, pair, kind, on = null, mu, consistency, levers = [], unpaid = null, losing = null, stage, door = false }) {
    if (!TAG_KINDS.includes(kind)) throw new Error(`"${key}" is classified as "${kind}"`);
    if ((kind === 'lever') !== (on !== null)) throw new Error(`"${key}" is a ${kind} and ${on ? 'names' : 'names no'} reading it moves`);
    if (kind !== 'trade-off' && (levers.length || unpaid || losing)) throw new Error(`"${key}" is not a trade-off and names levers`);
    if (kind === 'trade-off' && !pair.includes(losing)) throw new Error(`the trade-off "${key}" names no reading it costs`);
    this.key = key;
    this.label = label;
    this.pair = Object.freeze([...pair]);
    this.kind = kind;
    this.on = on;
    this.mu = Object.freeze([...mu]);
    this.consistency = consistency;
    this.levers = Object.freeze([...levers]);
    this.unpaid = unpaid;
    // Which reading the trade-off is stated as costing: the direction in which
    // a lever pays it back, where one does.
    this.losing = losing;
    this.stage = stage;
    this.door = door;
    Object.freeze(this);
  }

  /** Whether the classification held at every point measured (US4 scenario 2). */
  get whole() {
    return this.consistency.of > 0 && this.consistency.agree === this.consistency.of;
  }
}

/**
 * Classify one source: a control's elementary effects at the shared bases, or
 * a door's matched differences, each as a pair of arrays aligned point by
 * point. Consistency is the share of points whose own kind (and, for all but
 * the free, direction) equals the overall one.
 */
function rawClassification(pair, a, b, taus) {
  const points = [];
  for (let i = 0; i < a.length; i += 1) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      points.push([improvementOf(pair[0], a[i]), improvementOf(pair[1], b[i])]);
    }
  }
  if (!points.length) return null;
  const mu = [mean(points.map((p) => p[0])), mean(points.map((p) => p[1]))];
  const overall = kindOf(mu[0], mu[1], taus[0], taus[1]);
  const signature = (k, m) =>
    k.kind === 'free' ? 'free'
      : k.kind === 'lever' ? `lever${k.on}${Math.sign(m[k.on])}`
        : `${k.kind}${Math.sign(m[0])}${Math.sign(m[1])}`;
  const want = signature(overall, mu);
  const agree = points.filter((p) => signature(kindOf(p[0], p[1], taus[0], taus[1]), p) === want).length;
  return { mu, kind: overall.kind, on: overall.on, consistency: Object.freeze({ agree, of: points.length }) };
}

/**
 * Every screened control and door, classified for a pair of readings.
 *
 * `controls` holds each reading's `effectsOf` over one world at the same
 * bases, and `jumps` holds each reading's jumps by neighbour id. A trade-off's
 * exchange is its `mu` pair, stated in each reading's units across the
 * control's range; its paying levers are named only where a lever's
 * improvement on the losing reading at least covers the loss (FR-035), and
 * `unpaid` says so otherwise rather than naming a weak one (US4 scenario 4).
 * The losing reading is the second of the pair when the move is taken in the
 * direction that improves the first, the pair being ordered as chosen.
 */
export function classifyAll({ pair, effects = null, jumps = [new Map(), new Map()], neighbours = [], taus }) {
  if (pair.length !== 2 || pair[0].id === pair[1].id) throw new Error('a classification is of two different readings');
  const raw = [];
  if (effects) {
    const [ea, eb] = effects;
    ea.keys.forEach((key, j) => {
      const r = rawClassification(pair, ea.g.map((row) => row[j]), eb.g.map((row) => row[j]), taus);
      if (r) raw.push({ key, label: labelFor(key), stage: DESIGN_STAGE[controlFor(key).channel.id].stage, door: false, ...r });
    });
  }
  for (const neighbour of neighbours) {
    const ja = jumps[0].get(neighbour.id);
    const jb = jumps[1].get(neighbour.id);
    if (!ja || !jb || !ja.measured || !jb.measured) continue;
    // Aligned by pair, NaN where a reading has no value, and only pairs both
    // readings measured go in: `rawClassification` skips a point either side
    // lacks. The two lists of measured deltas cannot be zipped instead — a
    // run can answer one reading and not the other (a TM59 criterion outside
    // the season, a cost with no tariff), and then the i-th delta of one is a
    // different building from the i-th of the other.
    if (ja.wanted !== jb.wanted) throw new Error(`the two readings' jumps through ${neighbour.id} were taken on different pairs`);
    const r = rawClassification(pair, ja.aligned, jb.aligned, taus);
    if (r) raw.push({ key: neighbour.id, label: neighbour.label, stage: neighbour.door.stage, door: true, ...r });
  }
  // A trade-off can be taken either way: for the first reading at the second's
  // cost, or the other way round. The spec's own case is the second — lower
  // U-factor for the winter low, at the cost of the summer high, bought back
  // with SHGC — so both directions are tried, and the one a lever pays back is
  // the one stated. Only a lever whose improvement on the losing reading, across
  // its own range, at least covers the loss is named (FR-035); where neither
  // direction has one, the sheet says so rather than naming a weak one.
  const payers = (losing, loss) =>
    raw.filter((l) => l.kind === 'lever' && l.on === losing && Math.abs(l.mu[losing]) >= loss).map((l) => l.key);
  return Object.freeze(
    raw.map((r) => {
      if (r.kind !== 'trade-off') return new Classification({ ...r, pair, on: r.on === null ? null : pair[r.on] });
      for (const losing of [1, 0]) {
        const paying = payers(losing, Math.abs(r.mu[losing]));
        if (paying.length) return new Classification({ ...r, pair, on: null, levers: paying, losing: pair[losing] });
      }
      const any = raw.some((l) => l.kind === 'lever');
      const unpaid = any
        ? 'No lever on this desk pays it back in full, on either reading.'
        : 'Nothing on this desk moves one of these readings without moving the other.';
      return new Classification({ ...r, pair, on: null, unpaid, losing: pair[1] });
    }),
  );
}

/**
 * Whether one plan serves both readings: their leading moves within
 * `SAME_MOVE` degrees of each other, either way round, since a move is
 * oriented by its own reading and two readings may rise in opposite senses.
 */
export function oneOrTwo(movesA, movesB) {
  if (!movesA || !movesB) return 'two';
  const a = movesA[0].weights;
  const b = movesB[0].weights;
  if (a.length !== b.length || a.some((entry, j) => entry.key !== b[j].key)) return 'two';
  const dot = a.reduce((sum, entry, j) => sum + entry.w * b[j].w, 0);
  return Math.abs(dot) >= Math.cos((SAME_MOVE.degrees * Math.PI) / 180) ? 'one' : 'two';
}

/* ══ strip tags ══════════════════════════════════════════════════════════ */

const KIND_WORD = Object.freeze({ 'no-regret': 'No-regret', 'trade-off': 'Trade-off', lever: 'Lever', free: 'Free' });

/**
 * A classification's printed form on a control's strip and folded row.
 * `label` is what the tag is of, in design terms: a control's own label, or a
 * patch door's world ("With blinds"), which no control declaration names.
 */
export class StripTag {
  constructor({ key, label, text, free, target, stamp }) {
    if (!stamp) throw new Error(`the tag for ${key} carries no stamp, so its freshness cannot be checked`);
    if (!(typeof label === 'string' && label)) throw new Error(`the tag for ${key} names nothing it is of`);
    this.key = key;
    this.label = label;
    this.text = text;
    this.free = Boolean(free);
    this.target = target;
    this.stamp = stamp;
    Object.freeze(this);
  }
}

/** The stamp every tag of one classification carries (FR-040). */
export const stampOf = (world, pair) => `${world.signature}|${pair.map((reading) => reading.id).join('.')}`;

/** The moves-panel entry a tag's button focuses. */
export const targetOf = (key) => `strategy-move-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/**
 * A tag's words, from declared short forms only, always naming both readings
 * it was judged against (FR-038). A lever names the reading it moves and the
 * one it leaves.
 *
 * A sweet spot rides on the reading it is for, joined to that reading's short
 * form as one token (`High≈0.41`), and the tag closes with `est.` once for all
 * of them (FR-040a). That is what lets a lever keep both of its readings and a
 * control carry a spot for each chosen reading inside five words: set apart as
 * a clause of its own, one spot cost a lever its second reading and a second
 * spot had nowhere to go at all.
 */
export function tagText(kind, pair, on = null, spots = []) {
  const shown = spots.filter((spot) => pair.some((reading) => reading.id === spot.reading.id));
  const said = (reading) => {
    const spot = shown.find((s) => s.reading.id === reading.id);
    return spot ? `${SHORT[reading.id]}≈${spot.value}` : SHORT[reading.id];
  };
  const [a, b] = pair;
  const head =
    kind === 'lever'
      ? `Lever: ${said(on)}, not ${said(on.id === a.id ? b : a)}`
      : `${KIND_WORD[kind]}: ${said(a)}/${said(b)}`;
  return shown.length ? `${head} est.` : head;
}

{
  // The edge case *strip tags at 390 px*: every combination the declarations
  // can produce fits the TAG budget, so no tag is ever cut mid-word. A spot's
  // value is one token however it is lettered, so a placeholder stands for it.
  for (const a of READINGS) {
    for (const b of READINGS) {
      if (a.id === b.id) continue;
      const pair = [a, b];
      for (const kind of TAG_KINDS) {
        const ons = kind === 'lever' ? pair : [null];
        for (const on of ons) {
          for (const spotted of [[], [a], [b], [a, b]]) {
            const text = tagText(kind, pair, on, spotted.map((reading) => ({ reading, value: '0.41' })));
            if (words(text) > BUDGETS.TAG.words) {
              throw new Error(`the strip tag "${text}" is ${words(text)} words, over the ${BUDGETS.TAG.words}-word TAG budget`);
            }
          }
        }
      }
    }
  }
}

/**
 * Every tag for one classification, stamped (FR-038, FR-040, FR-040a).
 *
 * `spots` maps a key to the `SweetSpot`s named for it on either reading; each
 * chosen reading's named value inside the range rides on the tag, so a control
 * with a spot on both carries both (FR-040a). A control whose classification
 * is not in hand gets no entry, which the console draws as no tag rather than
 * a stale one.
 *
 * `doors` maps a door's console key to the neighbour ids behind it: a choice
 * door by its selector's key, a patch door as `patch:<channel>`, which the
 * console letters on that channel's own strip. A choice door is tagged only
 * where every world behind it is the same kind, because a selector with three
 * worlds of three kinds has no one word to carry.
 */
export function tagsFor(world, pair, classifications, spots = new Map(), doors = new Map()) {
  const stamp = stampOf(world, pair);
  const tags = new Map();
  const byKey = new Map(classifications.map((c) => [c.key, c]));
  for (const c of classifications) {
    if (c.door) continue;
    const { control } = controlFor(c.key);
    const digits = control.digits ?? decimalsOf(control.step);
    const shown = [];
    for (const reading of pair) {
      const spot = (spots.get(c.key) ?? []).find((s) => s.at !== null && s.reading.id === reading.id);
      if (spot) shown.push({ reading, value: spot.at.toFixed(digits) });
    }
    tags.set(
      c.key,
      new StripTag({
        key: c.key,
        label: labelFor(c.key),
        text: tagText(c.kind, pair, c.on, shown),
        free: c.kind === 'free',
        target: targetOf(c.key),
        stamp,
      }),
    );
  }
  for (const [key, ids] of doors) {
    const kinds = ids.map((id) => byKey.get(id)).filter(Boolean);
    if (!kinds.length || kinds.length !== ids.length) continue;
    const first = kinds[0];
    if (!kinds.every((c) => c.kind === first.kind && c.on === first.on)) continue;
    const label = key.startsWith('patch:') ? first.label : labelFor(key);
    tags.set(
      key,
      new StripTag({ key, label, text: tagText(first.kind, pair, first.on), free: first.kind === 'free', target: targetOf(ids[0]), stamp }),
    );
  }
  return tags;
}
