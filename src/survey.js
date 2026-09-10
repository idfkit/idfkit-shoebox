/**
 * The ground: one reading surveyed over two controls, cut through the desk.
 *
 * **DOM-free, engine-free, network-free**, by the rule `readings.js`,
 * `describe.js` and `tm59.js` already follow, so the Node harness calls the
 * real functions rather than a copy of them. Nothing here touches the
 * scheduler, the pool or the document: `rowsFor` returns job *specifications*
 * and the caller queues them.
 *
 * The finding the whole module rests on is that **a survey row is already a
 * study**. `buildSample(job, value)` applies `{ ...job.snapshot, [job.key]:
 * value }`, and `job.snapshot` is a whole desk — so a row at a fixed value of
 * axis Y is a job whose snapshot carries that Y and whose swept key is axis X.
 * Two dimensions are reachable with no change to `buildSample` and none to the
 * sample cache, which is what makes three properties fall out for free rather
 * than being written: a study of axis X taken at the stance is byte-identical
 * in cache identity to the survey's own stance row and costs no run (FR-011);
 * rows and studies are literally in one queue, so neither can be given its own
 * pool to starve the other from (FR-053); and `clearAll` on a station change
 * takes the survey down with the studies because it is the same call (FR-052).
 *
 * What does *not* fall out for free is job identity, and it is worth saying
 * where the reader will look for it. The scheduler keys `byKey` on the job's
 * identity and cancels a prior job under the same one — which is right for a
 * study, since a control has one curve. A survey enqueues nine or eleven rows
 * that all sweep the same key, so under `job.key` they would cancel each other
 * down to the last row enqueued. `makeStudyJob` therefore takes an `id`
 * defaulting to `key`: `job.key` stays the parameter key `buildSample`
 * overlays, and `job.id` is what the queue arbitrates on.
 *
 * Everything drawn is read back off a completed run. `SpotHeight` has no
 * constructor path from interpolation, and there is deliberately no `Contour`,
 * `Mesh` or `Basin` entity — all three are recomputed from the lattice on
 * every draw, so there is no second copy of the ground to drift out of step
 * with the schedule of spot heights beside it (Principle III).
 */

import { CHANNEL_BY_ID, controlFor } from './controls.js';
import { QUANTITY_BY_ID, refusesSweep, sampleOrder } from './study.js';

/* ══ how big the ground is ═══════════════════════════════════════════════ */

/**
 * The coarse pass, and the pass it densifies into.
 *
 * Five and nine, and the second of those is not the eleven the plan estimated
 * against. The requirement is that densifying **reuses the coarse samples
 * exactly**, which is the same property `COARSE_SAMPLES` (11) and
 * `SWEEP_SAMPLES` (21) have in one dimension: the raw positions for n = 11 are
 * `min + (i/10)·span`, which are the even positions of the 21-point grid, so
 * the coarse set is a strict subset and a densify costs only the new runs.
 *
 * Carried to two dimensions with 5 and 11 that property is simply false. Five
 * positions sit at `i/4` — 0, 0.25, 0.5, 0.75, 1 — and eleven sit at `i/10`,
 * and 0.25 is not a tenth of anything. Three of every five coarse rows would
 * fall between two fine ones, so a densify would re-run the *whole* fine grid
 * and throw the coarse pass away: 25 runs spent to be discarded, with no
 * symptom anywhere except a survey that takes longer than it should.
 *
 * Nine is the smallest count that keeps both properties. `i/4 = 2i/8`, so the
 * 5-grid is exactly the even positions of the 9-grid; both counts are odd, so
 * each axis carries a sample at its own midpoint; and 81 is inside the plan's
 * "at most 11 x 11" ceiling of 121 with room for the stance row to be a cache
 * hit.
 *
 * Verified over the declarations rather than over the arithmetic, because
 * snapping is what the subset property actually has to survive: `axisFor` at 5
 * and at 9 was taken over **all 90 sweepable numeric faces** on the desk and
 * every coarse position falls on a fine one, inside each control's own
 * thousandth-of-a-step tolerance. 90 of 90.
 */
export const COARSE_GRID = 5;
export const FINE_GRID = 9;

/* ══ which way is better ═════════════════════════════════════════════════ */

/**
 * How a convention that rests on practice rather than on a published figure
 * opens its sentence — the same prefix the landmarks in `controls.js` use, and
 * for the same reason: a convention sitting beside a compliance metric without
 * saying which it is would be the sheet asserting under cover of citing.
 */
const CONVENTION = 'Convention of practice rather than a published figure.';

/**
 * Which direction improves each reading, declared rather than assumed.
 *
 * Three things on this sheet need it — the descent, the region where every
 * reading improves, and the pull's `direction` — and none of them can be
 * written without a claim about what "better" means. `Quantity` declares no
 * such thing and should not: a study draws a curve and lets the reader read
 * it, which needs no direction at all.
 *
 * Ten of the thirteen are compliance metrics or costs, where less is the whole
 * point and the definition says so. The zone's own two extremes are the pair
 * that needed thinking about, because "better" for a free-running temperature
 * is a comfort judgement and nobody publishes it as a target. They are
 * declared as conventions and say so, which is the same treatment the
 * overhang's landmark bands get.
 *
 * A reading with no entry here is one the survey will not let fall and will
 * not name an improving region for: it draws the ground, letters every spot
 * height and refuses the two readings that need a direction, with the reason.
 * That is the honest answer rather than a coin toss, and it is why this is a
 * lookup with a `why` on every row instead of a hard-coded `<`.
 */
const SENSE = Object.freeze({
  high: {
    better: 'lower',
    why: `${CONVENTION} A lower peak zone temperature is the design intent of every control on this desk that shades, insulates or vents.`,
  },
  low: {
    better: 'higher',
    why: `${CONVENTION} A higher winter minimum is the design intent; this is the one reading on the survey where uphill is the improvement.`,
  },
  tedi: { better: 'lower', why: 'Thermal energy demand intensity is a compliance metric with a numeric ceiling; less is compliance.' },
  cedi: { better: 'lower', why: 'Cooling energy demand intensity is a compliance metric; less is compliance.' },
  eui: { better: 'lower', why: 'Energy use intensity is benchmarked downward against every published target.' },
  cost: { better: 'lower', why: 'The bill is money spent.' },
  carbon: { better: 'lower', why: 'Emitted carbon is emitted.' },
  overheat: { better: 'lower', why: 'Hours above 25 °C are hours of discomfort.' },
  peakHeat: { better: 'lower', why: 'A smaller peak heating load is a smaller plant.' },
  peakCool: { better: 'lower', why: 'A smaller peak cooling load is a smaller plant.' },
  tm59a: { better: 'lower', why: 'CIBSE TM59 criterion a passes at or below 3 % of occupied hours.' },
  tm59b: { better: 'lower', why: 'CIBSE TM59 criterion b passes at four nights or fewer.' },
  tm59c: { better: 'lower', why: 'CIBSE TM59 criterion c passes at or below 3 % of occupied hours.' },
});

/* ══ entities ════════════════════════════════════════════════════════════ */

/**
 * One reading the ground is surveyed for: a quantity and the one series of it
 * that carries a number.
 *
 * A `Quantity` is not by itself a height. Three of the eleven declare two
 * series each — the zone's high against its low, TEDI against CEDI — and their
 * `read` returns an object, not a scalar. A lattice is scalars, so what a
 * survey carries is the `(quantity, series)` pair and the selector that gets
 * from the cached readings bag to a number. Series ids are unique across the
 * whole roster, which is what lets a link carry one token rather than two.
 */
export class Reading {
  constructor({ quantity, series }) {
    if (!quantity || !series) throw new Error('a survey reading needs a quantity and one of its series');
    if (!quantity.series.includes(series)) {
      throw new Error(`"${series.id}" is not a series of the quantity "${quantity.id}"`);
    }
    const sense = SENSE[series.id] ?? null;
    this.quantity = quantity;
    this.series = series;
    this.id = series.id;
    this.label = series.label;
    this.unit = quantity.unit;
    this.digits = quantity.digits;
    /** 'lower' | 'higher' | null — null where the direction is not ours to declare. */
    this.better = sense?.better ?? null;
    this.senseWhy = sense?.why ?? null;
    Object.freeze(this);
  }

  /** The scalar this reading takes out of one sample's cached readings bag. */
  valueOf(readings) {
    const value = this.series.select(readings?.[this.quantity.id]);
    return Number.isFinite(value) ? value : null;
  }

  /** Whether `value` is an improvement on `against`. Throws where there is no direction. */
  improves(value, against) {
    if (!this.better) {
      throw new Error(
        `"${this.label}" declares no improving direction, so nothing on this sheet may decide that one ` +
          'reading of it is better than another',
      );
    }
    return this.better === 'lower' ? value < against : value > against;
  }
}

/** Every reading a survey may be cut for, one per series across the roster. */
export const READINGS = Object.freeze(
  Object.values(QUANTITY_BY_ID).flatMap((quantity) =>
    quantity.series.map((series) => new Reading({ quantity, series })),
  ),
);

export const READING_BY_ID = Object.freeze(
  Object.fromEntries(READINGS.map((reading) => [reading.id, reading])),
);

{
  // The uniqueness the link format depends on, asserted rather than observed:
  // `sv` carries a series id and nothing else, so two quantities declaring one
  // series id would make a survey link mean two grounds at once. Thirteen
  // series across eleven quantities today.
  const ids = READINGS.map((reading) => reading.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('two study quantities declare the same series id, so a survey link cannot name one');
  }
  // And that every declared direction names a series that exists. A `SENSE`
  // entry for a series that has been renamed is a direction nothing will ever
  // consult, which reads exactly like a reading that has no direction.
  for (const id of Object.keys(SENSE)) {
    if (!READING_BY_ID[id]) {
      throw new Error(`the survey declares an improving direction for "${id}", which is not a declared series`);
    }
  }
}

/**
 * One control chosen as a direction across the ground.
 *
 * `positions` is snapped to the control's own step grid and carries the
 * stance's own value verbatim, which is what makes FR-005 true: the point the
 * reader already understands is a measured position rather than something the
 * contours were drawn through.
 */
export class Axis {
  constructor({ key, control, side, from, to, positions }) {
    this.key = key;
    this.control = control;
    this.side = side ?? null;
    this.from = from;
    this.to = to;
    this.positions = Object.freeze([...positions]);
    this.count = positions.length;
    Object.freeze(this);
  }

  /** The index of a value on this axis, or -1. Compared on the step grid's own tolerance. */
  indexOf(value) {
    const tol = this.control.step / 1000;
    return this.positions.findIndex((position) => Math.abs(position - value) < tol);
  }
}

/**
 * Where to cut one axis, snapped to what the control can actually hold.
 *
 * The tolerance rule is `samplePoints`'s and is deliberately the same one:
 * snapping goes through floating point, so "the same position" arrives as two
 * numbers a few ulps apart, anything closer than a thousandth of a step is one
 * position, and where one of the pair is the stance's own value the stance is
 * the one that survives. A survey whose stance row fell a ulp off the grid
 * would spend a run on a design the desk cannot hold and then fail to find it
 * again when the reader stood on it.
 *
 * A control whose step is coarse legitimately offers fewer distinct positions
 * than were asked for. The axis holds what the control can hold and reports
 * the count; inventing positions between stops would be lettering a ground of
 * designs that cannot exist.
 */
export function axisFor(key, { from = null, to = null, count = COARSE_GRID, stance }) {
  const { channel, control, side } = controlFor(key); // throws naming an unowned key
  const refusal = refusesSweep(control);
  if (refusal) throw new Error(`axisFor: ${refusal}`);
  if (channel.prices) {
    throw new Error(
      `axisFor: ${key} is on the ${channel.name} channel, which prices the run rather than shaping it. ` +
        'Nothing it owns reaches the IDF, so a ground cut along it would be the same building at every position',
    );
  }
  const { min, max, step } = control;
  const lo = from === null ? min : from;
  const hi = to === null ? max : to;
  for (const [name, value] of [['from', lo], ['to', hi]]) {
    if (!Number.isFinite(value)) throw new Error(`axisFor: the ${name} extent of ${key} is not a number`);
    if (value < min || value > max) {
      throw new Error(`axisFor: ${key} runs ${min} to ${max}, and the ${name} extent is ${value}`);
    }
  }
  if (!(hi > lo)) throw new Error(`axisFor: the extent of ${key} runs ${lo} to ${hi}, which is not an extent`);
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`axisFor: a ground needs at least two positions on ${key}, not ${count}`);
  }

  const grid = (v) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));
  const raw = [];
  for (let i = 0; i < count; i += 1) raw.push(grid(lo + (i / (count - 1)) * (hi - lo)));
  const current = stance[key];
  // The stance's own value goes in only where it is inside the extent. A
  // reader who narrowed the extent past where they are standing has said so,
  // and forcing the stance back in would silently widen the extent they set.
  const inside = Number.isFinite(current) && current >= Math.min(lo, hi) && current <= Math.max(lo, hi);
  if (inside) raw.push(current);
  raw.sort((a, b) => a - b);

  const tol = step / 1000;
  const positions = [];
  for (const v of raw) {
    if (positions.length && Math.abs(positions[positions.length - 1] - v) < tol) {
      if (inside && v === current) positions[positions.length - 1] = current;
    } else {
      positions.push(v);
    }
  }
  return new Axis({ key, control, side, from: lo, to: hi, positions });
}

/**
 * One measured design. The only thing on this survey any figure may be
 * lettered from (FR-007, FR-019).
 *
 * There is no constructor path here from interpolation, and that is the
 * invariant rather than a habit: `latticeOf` reads these, `contoursOf` and
 * `meshOf` read the lattice, and the schedule of spot heights reads these
 * directly — so the only way a number reaches the page is through a run that
 * completed.
 */
export class SpotHeight {
  constructor({ ix, iy, x, y, readings, floorArea, cacheKey }) {
    if (!Number.isInteger(ix) || !Number.isInteger(iy)) throw new Error('a spot height needs lattice indices');
    if (!readings) throw new Error('a spot height with no readings is a gap, and must be recorded as one');
    this.ix = ix;
    this.iy = iy;
    this.x = x;
    this.y = y;
    this.readings = readings;
    this.floorArea = floorArea ?? null;
    this.cacheKey = cacheKey ?? null;
    Object.freeze(this);
  }
}

/**
 * A position that was asked for and could not be measured (FR-016).
 *
 * The empty-reason throw is the same rule `Reading` in `tm59.js` enforces by
 * refusing a value and an absence together, and it is what keeps the em dash
 * structural rather than remembered: a gap that could not say why it was a gap
 * would be indistinguishable on the page from ground nobody has got to yet,
 * and those are different facts.
 */
export class Gap {
  constructor({ ix, iy, reason, retried = false }) {
    if (!Number.isInteger(ix) || !Number.isInteger(iy)) throw new Error('a gap needs lattice indices');
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new Error(`the gap at ${ix},${iy} carries no reason, and a gap with no reason is not a reading`);
    }
    this.ix = ix;
    this.iy = iy;
    this.reason = reason;
    this.retried = Boolean(retried);
    Object.freeze(this);
  }
}

/**
 * What the survey has not measured, stated wherever it states what it has.
 *
 * Load-bearing under the clarified decision that the relief is smooth rather
 * than faceted. A faceted surface reports its own sample density in its
 * texture, so coverage was something the reader could see; a smooth one cannot,
 * which makes these figures the only thing separating a coarse survey from a
 * convincing picture of one (FR-018i). That is a real transfer of honesty from
 * the drawing to the lettering and must not later be softened as cosmetic.
 */
export class Coverage {
  constructor({ wanted, measured, gaps, density }) {
    const unsurveyed = wanted - measured - gaps;
    if (unsurveyed < 0 || measured + gaps + unsurveyed !== wanted) {
      throw new Error(
        `coverage does not sum: ${measured} measured and ${gaps} gaps against ${wanted} wanted. A relief and ` +
          'a schedule of spot heights must never be able to disagree about how much was measured',
      );
    }
    this.wanted = wanted;
    this.measured = measured;
    this.gaps = gaps;
    this.unsurveyed = unsurveyed;
    this.density = density;
    Object.freeze(this);
  }

  get complete() {
    return this.measured + this.gaps === this.wanted;
  }

  /** The share of the asked-for ground that carries a run, 0 to 1. */
  get fraction() {
    return this.wanted ? this.measured / this.wanted : 0;
  }
}

/**
 * One design the desk has stood on this session, in order, restorable (FR-038).
 *
 * The session and no longer: it is cleared where the sample cache is cleared,
 * on a station change, and it is not persisted. The scheme shelf is what
 * keeping a design is already for, and a traverse quietly outliving the
 * climate it was walked under would be a list of designs whose readings are no
 * longer true of anything.
 */
export class TraverseStop {
  constructor({ params, patch, readings = null, at }) {
    if (!params || !patch) throw new Error('a traverse stop needs the desk it was standing on');
    if (!Number.isInteger(at)) throw new Error('a traverse stop needs its place in the order');
    this.params = Object.freeze({ ...params });
    this.patch = Object.freeze({ ...patch });
    this.readings = readings;
    this.at = at;
    Object.freeze(this);
  }
}

/* ══ the survey ══════════════════════════════════════════════════════════ */

const pointKey = (ix, iy) => `${ix},${iy}`;

/**
 * One ground under measurement.
 *
 * Frozen, with one mutable field: `points`. That is deliberate and it is the
 * one place this module departs from the frozen-instance rule, because the
 * alternative is worse. Rebuilding the survey per landed sample would mint
 * eighty-one objects over the life of one ground and hand the caller a new
 * identity on every point, and the caller holds this in a module-level
 * variable that the drawing, the descent and the link codec all read. A `Map`
 * that grows is what the ground *is*; every derived figure — the coverage, the
 * lattice, the contours, the mesh — is recomputed from it and none is stored,
 * so there is nothing here that can go stale.
 */
export class Survey {
  constructor({ x, y, readings, stance, patch, annual, epw = null }) {
    if (!(x instanceof Axis) || !(y instanceof Axis)) throw new Error('a survey needs two axes');
    if (x.key === y.key) {
      throw new Error(
        `both axes of the survey are ${x.key}. A ground cut along one control twice is a line drawn twice, ` +
          'not a surface',
      );
    }
    if (!Array.isArray(readings) || !readings.length || readings.length > 2) {
      throw new Error(
        `a survey carries one or two readings, not ${readings?.length ?? 0}. Two is the ceiling because a ` +
          'third has nowhere honest to be drawn: the plan letters both at every spot height and the relief ' +
          'carries one',
      );
    }
    for (const reading of readings) {
      if (!(reading instanceof Reading)) throw new Error('a survey reading must be a declared Reading');
      if (!READING_BY_ID[reading.id]) throw new Error(`no survey reading is declared as "${reading.id}"`);
    }
    if (readings.length === 2 && readings[0].id === readings[1].id) {
      throw new Error(`the survey carries "${readings[0].id}" twice`);
    }
    if (!stance || !patch) throw new Error('a survey needs the stance it was cut through');
    this.x = x;
    this.y = y;
    this.readings = Object.freeze([...readings]);
    /** The distinct quantities behind those readings — what a run must carry. */
    this.quantities = Object.freeze([...new Set(readings.map((reading) => reading.quantity))]);
    this.stance = Object.freeze({ ...stance });
    this.patch = Object.freeze({ ...patch });
    this.annual = Boolean(annual);
    this.epw = epw;
    this.points = new Map(); // "ix,iy" -> SpotHeight | Gap
    Object.freeze(this);
  }

  get wanted() {
    return this.x.count * this.y.count;
  }

  get density() {
    return `${this.x.count} × ${this.y.count}`;
  }

  at(ix, iy) {
    return this.points.get(pointKey(ix, iy)) ?? null;
  }

  /** The measured point at these indices, or null where it is a gap or unsurveyed. */
  spotAt(ix, iy) {
    const found = this.at(ix, iy);
    return found instanceof SpotHeight ? found : null;
  }

  /** Where the stance stands on this ground, or null where an axis was narrowed past it. */
  get stanceAt() {
    const ix = this.x.indexOf(this.stance[this.x.key]);
    const iy = this.y.indexOf(this.stance[this.y.key]);
    return ix === -1 || iy === -1 ? null : { ix, iy };
  }

  /** Every measured point, in lattice order. */
  spots() {
    const out = [];
    for (let iy = 0; iy < this.y.count; iy += 1) {
      for (let ix = 0; ix < this.x.count; ix += 1) {
        const spot = this.spotAt(ix, iy);
        if (spot) out.push(spot);
      }
    }
    return out;
  }

  gaps() {
    return [...this.points.values()].filter((point) => point instanceof Gap);
  }
}

/**
 * Declare a ground. Every error listed in data-model.md throws from here or
 * from `axisFor`, at the moment the reader asks for the survey rather than
 * later as a ground that quietly measured the wrong thing.
 */
export function makeSurvey({ x, y, readings, stance, patch, annual = false, epw = null }) {
  return new Survey({ x, y, readings, stance, patch, annual, epw });
}

/**
 * One study-job specification per row of the ground.
 *
 * The whole point of the module, and it is four lines of arithmetic because
 * the finding it rests on did the work: a row is a study whose snapshot
 * carries axis Y at that row's value.
 *
 * `restShape` omits **both** axis keys, which is the one place a row differs
 * from a study in more than its snapshot. A study's rest shape omits its own
 * swept key so that walking the redline tick along a finished curve does not
 * invalidate it. A survey is cut through the stance and the reader is expected
 * to stand on its points — that is what the whole feature is for — so a rest
 * shape that omitted only X would cancel the entire ground the first time
 * somebody stepped along Y, and re-measure eighty-one designs it had already
 * measured. Omitting both is what makes US6 scenario 2 true: the stance moves
 * across ground that is still ground.
 */
export function rowsFor(survey, { needed, carried, restShape, origin = 'survey', id = 'survey' }) {
  if (!needed || !carried) throw new Error('rowsFor: a survey row needs the run contents its readings ask for');
  const points = survey.x.positions;
  return survey.y.positions.map((yValue, iy) => ({
    id: `${id}:${iy}`,
    key: survey.x.key,
    snapshot: { ...survey.stance, [survey.y.key]: yValue },
    patch: survey.patch,
    epw: survey.epw,
    annual: survey.annual,
    // The scheduler selects one reading out of the cached bag by quantity id;
    // the survey then selects the series out of that. The first reading's
    // quantity is what a row is nominally read for, and every quantity the
    // survey carries is in `carried`, so the second is a lookup rather than a
    // second run.
    quantity: survey.readings[0].quantity.id,
    needed,
    carried,
    restShape,
    points,
    order: sampleOrder(points, survey.stance[survey.x.key]),
    origin,
    asked: points.length,
    // Not part of the job the scheduler understands; carried alongside so the
    // caller can put a landed sample back at the right row without keeping a
    // second map from job id to index.
    iy,
  }));
}

/**
 * Record one landed sample, as a spot height where it carries a reading and as
 * a gap carrying its reason where it does not.
 *
 * Never fills a gap from a neighbour, and there is no argument here that
 * could: the only two things it can write are a `SpotHeight` built from a
 * sample and a `Gap` built from a reason.
 */
export function landPoint(survey, { ix, iy, sample, reason = null, floorArea = null, cacheKey = null }) {
  if (ix < 0 || ix >= survey.x.count || iy < 0 || iy >= survey.y.count) {
    throw new Error(`landPoint: ${ix},${iy} is off a ground of ${survey.density}`);
  }
  const key = pointKey(ix, iy);
  const readings = sample?.readings ?? null;
  // A sample that came back with no reading for the survey's own first
  // quantity is a gap, not a spot height at zero. The scheduler already treats
  // a failed run as a gap rather than a cached fact; this is the same rule one
  // level up, where the reason can be said in words.
  const value = readings ? survey.readings[0].valueOf(readings) : null;
  if (value === null) {
    survey.points.set(
      key,
      new Gap({
        ix,
        iy,
        reason:
          reason ??
          (readings
            ? `The run completed but carried no ${survey.readings[0].label.toLowerCase()}.`
            : 'The run did not complete.'),
        retried: survey.at(ix, iy) instanceof Gap,
      }),
    );
    return survey;
  }
  survey.points.set(
    key,
    new SpotHeight({
      ix,
      iy,
      x: survey.x.positions[ix],
      y: survey.y.positions[iy],
      readings,
      floorArea,
      cacheKey,
    }),
  );
  return survey;
}

/** What the survey has measured and what it has not, summed and asserted. */
export function coverageOf(survey) {
  let measured = 0;
  let gaps = 0;
  for (const point of survey.points.values()) {
    if (point instanceof SpotHeight) measured += 1;
    else gaps += 1;
  }
  return new Coverage({ wanted: survey.wanted, measured, gaps, density: survey.density });
}

/* ══ the one representation both drawings consume ════════════════════════ */

/**
 * The ground as a flat array of readings and a parallel validity mask.
 *
 * One representation, so the contoured plan and the relief cannot disagree
 * about the shape of the ground: they are two projections of these two typed
 * arrays and of nothing else.
 */
export function latticeOf(survey, reading = survey.readings[0]) {
  const nx = survey.x.count;
  const ny = survey.y.count;
  const values = new Float64Array(nx * ny);
  const mask = new Uint8Array(nx * ny);
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const spot = survey.spotAt(ix, iy);
      if (!spot) continue;
      const value = reading.valueOf(spot.readings);
      if (value === null) continue;
      values[ix + iy * nx] = value;
      mask[ix + iy * nx] = 1;
    }
  }
  return { values, mask, nx, ny };
}

/** The measured range of a lattice, or null where nothing is measured. */
export function extentOf({ values, mask }) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if (!mask[i]) continue;
    if (values[i] < lo) lo = values[i];
    if (values[i] > hi) hi = values[i];
  }
  return Number.isFinite(lo) ? { lo, hi } : null;
}

/**
 * Round levels for a contoured plan, chosen off the measured extent.
 *
 * A 1-2-5 progression, which is what a contour interval has always been on a
 * survey drawing, so the values lettered at the turns are numbers a reader can
 * hold in their head rather than the extent divided by eight.
 */
export function levelsFor(lattice, target = 8) {
  const extent = extentOf(lattice);
  if (!extent || !(extent.hi > extent.lo)) return [];
  const span = extent.hi - extent.lo;
  const rough = span / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const levels = [];
  for (let v = Math.ceil(extent.lo / step) * step; v <= extent.hi + step / 1e6; v += step) {
    levels.push(Number(v.toFixed(10)));
  }
  return levels;
}

/**
 * Contours by marching squares over the lattice and its mask.
 *
 * The textbook algorithm for exactly this input, sharing the lattice and the
 * mask with the relief so the two drawings agree by construction rather than
 * by both being careful. d3-contour does the same thing and is a package.
 *
 * Two decisions that are not the textbook's and both matter here:
 *
 * **A cell whose mask is not fully set emits nothing.** Interpolating an edge
 * one of whose ends was never measured is inventing a reading, and it is the
 * shape of invention that is hardest to see afterwards because the result
 * looks exactly like a contour.
 *
 * **The saddles are resolved by the cell's own mean, consistently.** Cases 5
 * and 10 are the two where the four corners alternate and the level can be
 * drawn through the cell two ways. Choosing per cell by some other rule — or
 * choosing differently in the two cases — makes contours cross themselves at
 * saddles, which on this ground is precisely where the interesting reading is:
 * a saddle is where two ways of improving the design meet.
 *
 * Returns polylines in **lattice coordinates**, fractional indices, so the
 * caller maps them to the page. The module draws nothing.
 */
export function contoursOf(lattice, levels) {
  const { values, mask, nx, ny } = lattice;
  const out = [];
  const at = (ix, iy) => values[ix + iy * nx];
  const has = (ix, iy) => mask[ix + iy * nx] === 1;

  for (const level of levels) {
    const segments = [];
    for (let iy = 0; iy < ny - 1; iy += 1) {
      for (let ix = 0; ix < nx - 1; ix += 1) {
        if (!has(ix, iy) || !has(ix + 1, iy) || !has(ix, iy + 1) || !has(ix + 1, iy + 1)) continue;
        // Corners anticlockwise from the bottom left, which is the ordering the
        // standard 16-case table is written against.
        const bl = at(ix, iy);
        const br = at(ix + 1, iy);
        const tr = at(ix + 1, iy + 1);
        const tl = at(ix, iy + 1);
        const code = (bl > level ? 1 : 0) | (br > level ? 2 : 0) | (tr > level ? 4 : 0) | (tl > level ? 8 : 0);
        if (code === 0 || code === 15) continue;

        // Where the level crosses each edge, by linear interpolation along it.
        const lerp = (a, b) => (level - a) / (b - a);
        const bottom = [ix + lerp(bl, br), iy];
        const right = [ix + 1, iy + lerp(br, tr)];
        const top = [ix + lerp(tl, tr), iy + 1];
        const left = [ix, iy + lerp(bl, tl)];

        const push = (a, b) => segments.push([a, b]);
        switch (code) {
          case 1: case 14: push(left, bottom); break;
          case 2: case 13: push(bottom, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(right, top); break;
          case 6: case 9: push(bottom, top); break;
          case 7: case 8: push(left, top); break;
          case 5:
          case 10: {
            // The saddle. The cell's own mean decides which pair of corners the
            // level encloses, and the same test governs both cases so the
            // resolution cannot differ between them.
            const mean = (bl + br + tr + tl) / 4;
            const enclosed = mean > level;
            if ((code === 5) === enclosed) {
              push(left, top);
              push(bottom, right);
            } else {
              push(left, bottom);
              push(right, top);
            }
            break;
          }
          default: break;
        }
      }
    }
    if (segments.length) out.push({ level, segments });
  }
  return out;
}

/**
 * An indexed triangle mesh for the relief, holed where the ground is not
 * measured.
 *
 * A cell is emitted only where all four of its corners carry a run, so a gap
 * is a hole in the geometry rather than a region drawn in a different style.
 * That is what makes FR-016 structural: nothing can fill a gap from a
 * neighbour, because the geometry that would have covered it is never
 * generated. Styling it instead would leave one `fillStyle` between an honest
 * drawing and a dishonest one.
 *
 * Every lattice position gets a vertex whether it was measured or not, and
 * `measuredFlags` says which. Vertices at unmeasured positions are simply
 * never indexed by a triangle, and the flag is what lets the relief stand a
 * post on each real sample (FR-018j) — the one thing that keeps a measured
 * point individually identifiable at any viewpoint on a smooth surface.
 */
export function meshOf(lattice) {
  const { values, mask, nx, ny } = lattice;
  const positions = new Float32Array(nx * ny * 3);
  const measuredFlags = new Uint8Array(nx * ny);
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const at = ix + iy * nx;
      positions[at * 3] = ix;
      positions[at * 3 + 1] = iy;
      positions[at * 3 + 2] = mask[at] ? values[at] : 0;
      measuredFlags[at] = mask[at];
    }
  }
  const indices = [];
  for (let iy = 0; iy < ny - 1; iy += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const bl = ix + iy * nx;
      const br = bl + 1;
      const tl = bl + nx;
      const tr = tl + 1;
      if (!mask[bl] || !mask[br] || !mask[tl] || !mask[tr]) continue;
      indices.push(bl, br, tr, bl, tr, tl);
    }
  }
  return {
    positions,
    indices: new Uint32Array(indices),
    measuredFlags,
    nx,
    ny,
    cells: indices.length / 6,
  };
}

/* ══ readings taken against the stance ═══════════════════════════════════ */

/**
 * Measured points where every chosen reading improves on the stance (FR-030).
 *
 * Spot heights only, and named as a region of the measured ground rather than
 * as an optimum: there is no `Basin` entity and there must not be one, because
 * giving a hollow an identity is the first step toward claiming it is the best
 * building available, which it is not and cannot be shown to be from eighty-one
 * runs.
 */
export function improvingRegion(survey, stance = survey.stanceAt) {
  if (!stance) return { spots: [], refusal: 'The stance is outside the extent this ground was cut over.' };
  const here = survey.spotAt(stance.ix, stance.iy);
  if (!here) {
    return { spots: [], refusal: 'The stance itself has not been measured yet, so there is nothing to improve on.' };
  }
  const directionless = survey.readings.find((reading) => !reading.better);
  if (directionless) {
    return {
      spots: [],
      refusal:
        `"${directionless.label}" declares no improving direction, so this sheet will not name one design ` +
        'as better than another by it.',
    };
  }
  const baseline = survey.readings.map((reading) => reading.valueOf(here.readings));
  if (baseline.some((value) => value === null)) {
    return { spots: [], refusal: 'The stance carries no reading for one of the two quantities.' };
  }
  const spots = survey.spots().filter((spot) => {
    if (spot === here) return false;
    return survey.readings.every((reading, at) => {
      const value = reading.valueOf(spot.readings);
      return value !== null && reading.improves(value, baseline[at]);
    });
  });
  return { spots, refusal: null };
}

/**
 * The exchange along the level line at the stance (FR-029).
 *
 * "This much wall insulation buys this much glazing at constant demand" — in
 * both controls' own units, with the tolerance it holds to, or refused with
 * what would fix it.
 *
 * **The refusal is the design.** The gradient is a central difference and the
 * tolerance is a second-order term, so both need the full nine points around
 * the stance. Computed off a coarser neighbourhood the answer still arrives,
 * to four significant figures, describing a level line that is nowhere near
 * level — which is false precision, and false precision on this sheet is worse
 * than an em dash because the reader has no way to see it. So the whole 3 × 3
 * is required and its absence is stated with the one thing that fixes it:
 * let the ground refine.
 */
export function freeExchange(survey, stance = survey.stanceAt, reading = survey.readings[0]) {
  if (!stance) return { refusal: 'The stance is outside the extent this ground was cut over.' };
  const { ix, iy } = stance;
  if (ix < 1 || iy < 1 || ix >= survey.x.count - 1 || iy >= survey.y.count - 1) {
    return {
      refusal:
        'The stance is on the edge of the ground, so there is no measured neighbour on one side to take a ' +
        'gradient against. Widen the extent, or move the desk in from the edge.',
    };
  }
  const value = (dx, dy) => {
    const spot = survey.spotAt(ix + dx, iy + dy);
    return spot ? reading.valueOf(spot.readings) : null;
  };
  const grid = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const v = value(dx, dy);
      if (v === null) {
        return {
          refusal:
            'The nine positions around the stance are not all measured, and an exchange taken off a coarser ' +
            'neighbourhood would be stated to four figures about a line that is nowhere near level. Let the ' +
            'ground refine, or narrow the extent so the same runs cover less of it.',
        };
      }
      grid.push(v);
    }
  }
  const [sw, s, se, w, c, e, nw, n, ne] = grid;
  // Step sizes in the controls' own units, which is what makes the answer a
  // sentence about the building rather than about the lattice.
  const hx = survey.x.positions[ix + 1] - survey.x.positions[ix - 1];
  const hy = survey.y.positions[iy + 1] - survey.y.positions[iy - 1];
  const fx = (e - w) / hx;
  const fy = (n - s) / hy;
  const scale = Math.max(Math.abs(fx), Math.abs(fy));
  // Flat ground has no level line, because every line through it is level.
  // Saying so is a reading; drawing a direction out of it is not.
  if (scale === 0 || (c !== 0 && Math.abs(fx * hx) + Math.abs(fy * hy) < Math.abs(c) * 1e-9)) {
    return { flat: true, refusal: null, dx: null, dy: null, tolerance: null };
  }
  if (fy === 0) {
    return {
      refusal:
        `Moving ${survey.y.control.label.toLowerCase()} does not change the reading here, so there is nothing ` +
        `for ${survey.x.control.label.toLowerCase()} to be exchanged against.`,
    };
  }
  // One step of X along the axis, and the step of Y that holds the reading
  // still: df = fx·dx + fy·dy = 0.
  const dx = survey.x.positions[ix + 1] - survey.x.positions[ix];
  const dy = (-fx / fy) * dx;
  // What the reading actually does over that step, which is the second-order
  // term the linear answer drops. Curvatures by the standard five- and
  // nine-point stencils over the same 3 × 3.
  const hx1 = hx / 2;
  const hy1 = hy / 2;
  const fxx = (e - 2 * c + w) / (hx1 * hx1);
  const fyy = (n - 2 * c + s) / (hy1 * hy1);
  const fxy = (ne - nw - se + sw) / (4 * hx1 * hy1);
  const tolerance = Math.abs(0.5 * (fxx * dx * dx + 2 * fxy * dx * dy + fyy * dy * dy));
  return { dx, dy, tolerance, flat: false, refusal: null, reading, fx, fy };
}

/**
 * One step of the descent (FR-035).
 *
 * Returns a **measured** neighbour and never an interpolated position, which
 * is the whole difference between letting a design fall and letting a picture
 * of one fall: every intermediate desk is a building that was actually run.
 *
 * The eight-neighbourhood rather than the four, because the fall line of a
 * surface does not run along the axes and a four-neighbour descent walks a
 * staircase down a diagonal slope — twice as many steps, each of them a real
 * desk the reader watches E-01 move to, to arrive at the same hollow.
 *
 * `visited` is how the two-point oscillation is caught. It cannot be caught
 * from one step: A improves on B and B improves on A is impossible for one
 * reading, but the descent is over *readings taken at each step* and a hollow
 * whose two lowest points carry the same value to the last bit would otherwise
 * step between them for as long as anybody watched. Passing the set is the
 * caller's job because the caller is what owns the walk.
 */
export function fallStep(survey, from, { visited = null, reading = survey.readings[0] } = {}) {
  if (!from) return { stopped: 'The desk is not standing on this ground.' };
  if (!reading.better) {
    return {
      stopped:
        `"${reading.label}" declares no improving direction, so there is no downhill on this ground. ` +
        `${reading.senseWhy ?? ''}`.trim(),
    };
  }
  const here = survey.spotAt(from.ix, from.iy);
  if (!here) return { stopped: 'The position the desk is standing on has not been measured.' };
  const base = reading.valueOf(here.readings);
  if (base === null) return { stopped: 'The position the desk is standing on carries no reading.' };

  let best = null;
  let bestValue = base;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const spot = survey.spotAt(from.ix + dx, from.iy + dy);
      if (!spot) continue;
      if (visited?.has(pointKey(spot.ix, spot.iy))) continue;
      const value = reading.valueOf(spot.readings);
      if (value === null) continue;
      if (!reading.improves(value, bestValue)) continue;
      best = spot;
      bestValue = value;
    }
  }
  if (!best) {
    // Two different stops, and the difference matters to the reader: a hollow
    // is a statement about the ground, a boundary is a statement about the
    // extent they chose.
    const measuredNeighbours = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        if (survey.spotAt(from.ix + dx, from.iy + dy)) measuredNeighbours.push(1);
      }
    }
    if (!measuredNeighbours.length) {
      return {
        stopped:
          'No neighbouring position has been measured yet, so there is nowhere measured to step to. Let the ' +
          'ground fill in.',
      };
    }
    if (visited?.size > 1) {
      return {
        stopped:
          `No measured neighbour improves on ${reading.label.toLowerCase()}. This is a hollow reached from ` +
          'where the descent started, measured against the points around it, and not the best building available.',
      };
    }
    return {
      stopped:
        `No measured neighbour improves on ${reading.label.toLowerCase()} from here. The stance is already ` +
        'in a hollow of the measured ground.',
    };
  }
  return best;
}

/* ══ where to measure next ═══════════════════════════════════════════════ */

/**
 * The order to fill the fine ground in, steepest and nearest first (FR-010).
 *
 * Two terms, and the argument for each is about what the reader is looking at
 * rather than about information theory. **Steepness first**, because flat
 * ground is already described by the points around it — a run there confirms
 * what the contours already say, where a run on a slope is a run that can move
 * a contour. **Proximity to the stance second**, because the reader is
 * standing there and every relative reading on this sheet — the pull, the free
 * exchange, the region where both readings improve — is taken against it, and
 * three of those refuse outright until the ground around the stance is dense.
 *
 * The weighting is a heuristic and is the one number in this feature no
 * measurement supports. It is written as a ratio of two normalised terms
 * rather than as a magic constant precisely so that it can be argued with:
 * steepness is scaled by the measured range of the ground, so it is unitless
 * whatever the reading, and distance is scaled by the diagonal of the lattice.
 */
export function refineOrder(survey, { reading = survey.readings[0], stance = survey.stanceAt } = {}) {
  const lattice = latticeOf(survey, reading);
  const extent = extentOf(lattice);
  const span = extent && extent.hi > extent.lo ? extent.hi - extent.lo : 1;
  const { nx, ny } = lattice;
  const diagonal = Math.hypot(nx, ny) || 1;

  const wanted = [];
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      if (survey.at(ix, iy)) continue; // measured, or a gap that is not retried on sight
      // The steepest measured difference across this position's neighbourhood,
      // which is the best statement available about ground nobody has stood on.
      let steep = 0;
      let near = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const a = survey.spotAt(ix + dx, iy + dy);
          const b = survey.spotAt(ix - dx, iy - dy);
          if (a) near += 1;
          if (!a || !b) continue;
          const va = reading.valueOf(a.readings);
          const vb = reading.valueOf(b.readings);
          if (va === null || vb === null) continue;
          steep = Math.max(steep, Math.abs(va - vb) / span);
        }
      }
      const distance = stance ? Math.hypot(ix - stance.ix, iy - stance.iy) / diagonal : 0.5;
      // A position with no measured neighbour at all cannot be scored on
      // steepness and would otherwise sort last for ever, which on a ground
      // whose coarse pass failed would leave the whole survey unmeasured. The
      // proximity term carries it.
      const score = steep * 2 + (1 - distance) + (near ? 0 : -0.25);
      wanted.push({ ix, iy, score, steep, distance });
    }
  }
  wanted.sort((left, right) => right.score - left.score || left.iy - right.iy || left.ix - right.ix);
  return wanted;
}
