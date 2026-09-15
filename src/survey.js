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
import { PRESET_BY_ID, targetsForMetric } from './schemes.js';
import {
  OVERHEAT_ABOVE,
  QUANTITY_BY_ID,
  TM59_STUDY_CATEGORY,
  inSentence,
  refusesPairing,
  refusesSweep,
  sampleOrder,
  samplePoints,
} from './study.js';
import { deltaKindOf, figureIn, letter, suffixIn } from './units.js';

/* ══ how big the ground is ═══════════════════════════════════════════════ */

/**
 * The coarse pass, and the pass it densifies into.
 *
 * Six and eleven, and both numbers are decided by one requirement: **a
 * densify must reuse what has already been run**, and so must a survey opened
 * on ground a study has already covered. That is the same property
 * `COARSE_SAMPLES` (11) and `SWEEP_SAMPLES` (21) have in one dimension — the
 * raw positions for n = 11 are `min + (i/10)·span`, which are the even
 * positions of the 21-point grid — and carrying it to two dimensions is
 * arithmetic that has to be checked rather than assumed.
 *
 * The plan estimated against 5 and 11. That pair does not have the property at
 * all: five positions sit at `i/4` — 0, 0.25, 0.5, 0.75, 1 — and eleven at
 * `i/10`, and 0.25 is not a tenth of anything, so three of every five coarse
 * rows fall between two fine ones and a densify re-runs the whole fine grid
 * and throws the coarse pass away. Twenty-five runs spent to be discarded,
 * with no symptom anywhere except a survey that takes longer than it should.
 *
 * Nine was tried next and is worse than it looks. `i/4 = 2i/8`, so 5 ⊂ 9 and
 * the densify is honest — but 9 has no relationship at all to the study grid,
 * and **that is the reuse the reader actually notices**: opening a survey
 * along a control they have just swept. Measured in the browser, 100 positions
 * of a 5 → 9 ground cost 94 engine runs against a completed study of one axis.
 * Six of a hundred free is not the promise.
 *
 * Six and eleven have both. `i/5` is every second position of `i/10`, so the
 * coarse pass is reused exactly; and `i/10` is every second position of
 * `i/20`, so the fine ground is a **strict subset of a study's own 21-point
 * grid**. Verified over the declarations rather than over the arithmetic,
 * because snapping is what the property has to survive: taken over all **90
 * sweepable numeric faces**, 5 → 9 lands inside a study's grid on 6 of 90
 * while 6 → 11 lands inside it on **90 of 90**.
 *
 * And measured in the browser, which is the only place the reuse itself can
 * be: sweep Glazing S as an ordinary study, then cut a ground along Glazing S
 * against wall resistance. 144 positions cost **132 engine runs**, and the
 * twelve that cost nothing are exactly the survey's own stance row. Under
 * 5 → 9 the same test spent 94 of 100.
 *
 * Both counts are even, which costs the midpoint sample an odd count would
 * put on each axis — and costs nothing, because `axisFor` forces the stance's
 * own value into the list regardless, which is what FR-005 actually asks for
 * and is a better guarantee than a midpoint: the point the reader already
 * understands is measured, wherever it happens to sit.
 */
export const COARSE_GRID = 6;
export const FINE_GRID = 11;

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
    // Taken from the quantity rather than declared again: a reading is one
    // series of one quantity, and a second declaration of what it measures
    // would be free to disagree with the card drawing the same number.
    this.quantityKind = quantity.quantityKind;
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

  /**
   * One value lettered as the study card letters it: through the series' own
   * formatter where it declares one — the bill's currency — and by `digits`
   * and `unit` otherwise. `bag` is the sample's readings bag the value came
   * out of, which is where a formatter finds what it needs.
   */
  /**
   * The unit this reading letters in, in the system showing.
   *
   * For the two axes that letter their unit **once, on the axis name** — the
   * relief's standing block and the plan's contour legend — rather than on
   * every figure. The figures there go through `figure` below, and this is the
   * other half of that arrangement: convert both, or the drawing states IP
   * levels under an SI unit.
   */
  get unitNow() {
    // `suffixIn`, not `unitIn`: what a lettered figure of this kind actually
    // carries after the number, which for a prefixed kind is nothing at all.
    // `figure` below drops the `R-` along with the unit, so an axis headed from
    // `unitIn` would have named a unit none of its stops were lettered in.
    return suffixIn(this.quantityKind, this.unit);
  }

  /**
   * The number alone, converted, at this reading's own precision.
   *
   * A contour label and a tick on the standing block carry no unit by design —
   * the axis name carries it once, which is what keeps a field of forty spot
   * figures readable. They still have to convert, and before this they were
   * lettered straight off `toFixed` and bypassed `format` entirely.
   */
  figure(value) {
    return figureIn(this.quantityKind, value, { digits: this.digits });
  }

  format(value, bag) {
    if (this.series.format) return this.series.format(value, bag?.[this.quantity.id]);
    // Through the quantity, which owns the lettering: the study card draws the
    // same number and asked for it the same way, and written out at both they
    // were a copy with a difference.
    return this.quantity.say(value);
  }

  /**
   * A *change* in this reading, which is a different quantity from the reading.
   *
   * `format` above letters a value, and the trade sentence was lettering
   * `value - base` with it. Measured on the page: a ground surveyed for high and
   * low read "+39 °F of high against +33 °F of low" for changes of about +4 °C
   * and +0.5 °C, because `temperature` carries Fahrenheit's 32 and a difference
   * must not. That is the offset trap `temperatureDifference` was split out for,
   * arriving here by a third route after the ranking's "Room left" and the
   * Effect column — so it gets a named method rather than a kind swapped inline
   * at the call site, which is how the first two came back.
   *
   * `deltaKindOf` is asked of every reading and not only of the temperatures: it
   * returns a zero-offset kind unchanged, so a kBtu/ft² change letters exactly
   * as it did. The quantity's own `unit` still rides along, because `letter`
   * honours a declaration's wording on an identity kind and ignores it on one
   * that converts, which is what keeps a counted reading wording itself.
   */
  change(value, bag) {
    if (this.series.format) return this.series.format(value, bag?.[this.quantity.id]);
    return letter(deltaKindOf(this.quantityKind), value, {
      digits: this.digits,
      unit: this.unit,
    });
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
  const { control, side } = controlFor(key); // throws naming an unowned key
  const refusal = refusesAxis(key);
  if (refusal) throw new Error(`axisFor: ${refusal}`);
  const { min, max } = control;
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

  const current = stance[key];
  // The stance's own value goes in only where it is inside the extent. A
  // reader who narrowed the extent past where they are standing has said so,
  // and forcing the stance back in would silently widen the extent they set.
  const inside = Number.isFinite(current) && current >= Math.min(lo, hi) && current <= Math.max(lo, hi);
  // `samplePoints` itself, so a survey axis snaps and dedupes exactly as a
  // study's sweep does: the 6 → 11 and 11 → 21 subset property that lets a
  // densify and a study share runs depends on the two agreeing to the ulp,
  // and a second copy of the rounding is how they would stop agreeing.
  const positions = samplePoints(control, inside ? current : null, count, { from: lo, to: hi });
  return new Axis({ key, control, side, from: lo, to: hi, positions });
}

/**
 * Why a control cannot be an axis of a ground, or null where it can.
 *
 * One sentence for both ways a bare key reaches this feature — the chooser
 * through `axisFor` and a shared link through `decodeSurvey` — because two
 * copies of the rule are how a link comes to cut a ground the desk itself
 * refuses, or to be refused for a different reason from the desk's.
 *
 * A priced face is an axis like any other (spec 011 FR-007, superseding spec
 * 006 FR-004). It is the same building at every position along it, which is
 * what makes it cheap rather than empty: the positions price one run, and on
 * a ground the shaping axis bends how steeply they do. What it cannot be is an
 * axis of a reading it does not move, and that is a pairing, asked of the whole
 * survey in `makeSurvey`, not of the key alone.
 */
export function refusesAxis(key) {
  const { control } = controlFor(key);
  const faceless = refusesSweep(control);
  if (faceless) return `the control "${key}" has no numeric face to survey along: ${faceless}`;
  return null;
}

/**
 * The first pairing of an axis and a reading that a priced axis cannot move, as
 * `{ key, sentence }` with `refusesPairing`'s own sentence, or null.
 *
 * Shared by `makeSurvey`, the survey link's decoder and the chooser, so a ground
 * the desk refuses is refused everywhere for the same reason, and the same pair
 * is named first (FR-006). The key is returned so a caller can add its fix.
 */
export function refusesSurveyPairing(keys, readings) {
  for (const key of keys) {
    for (const reading of readings) {
      const sentence = refusesPairing(key, reading.quantity);
      if (sentence) return { key, sentence };
    }
  }
  return null;
}

/**
 * What improving on the stance means for these readings, in words: "a lower
 * High", "a lower TEDI and a lower CEDI", "a higher Low".
 *
 * The hatched region is every measured design that improves on the stance in
 * every reading the ground carries, and which way is an improvement is
 * declared per reading — less for a demand or a bill, more for the zone's own
 * low. The key used to say the hatched designs "read better", which named
 * neither, so a reader looking at a ground of the low had nothing to tell them
 * the hatch marked the warmer designs rather than the cooler ones. Null where
 * any reading declares no direction, since there is then no region to name.
 */
export function improvingClause(readings) {
  if (!readings.length || readings.some((reading) => !reading.better)) return null;
  // Lower-cased to sit inside a sentence, except an acronym: "a lower tedi"
  // is not a metric anybody publishes.
  return readings.map((reading) => `a ${reading.better} ${inSentence(reading.label)}`).join(' and ');
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
  constructor({ ix, iy, x, y, readings, basis = null, floorArea, cacheKey }) {
    if (!Number.isInteger(ix) || !Number.isInteger(iy)) throw new Error('a spot height needs lattice indices');
    if (!readings) throw new Error('a spot height with no readings is a gap, and must be recorded as one');
    this.ix = ix;
    this.iy = iy;
    this.x = x;
    this.y = y;
    // Priced at this position: where an axis is priced, several spot heights
    // share one run and differ only in the price their readings were read at.
    this.readings = readings;
    // The run's meter totals, carried opaquely so the spot can be re-priced
    // when the tariff turns without asking the bounded sample cache, which a
    // fine ground beside a few studies can evict out from under it. Nothing in
    // this module reads inside it.
    this.basis = basis;
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
  constructor({ ix, iy, reason, retried = false, readings = null, basis = null, cacheKey = null }) {
    if (!Number.isInteger(ix) || !Number.isInteger(iy)) throw new Error('a gap needs lattice indices');
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new Error(`the gap at ${ix},${iy} carries no reason, and a gap with no reason is not a reading`);
    }
    this.ix = ix;
    this.iy = iy;
    this.reason = reason;
    this.retried = Boolean(retried);
    // Present only on a gap whose run completed and whose reading could not be
    // priced — a rate the bill holds as absent — so a later re-price can stand
    // it back up as a spot height with no run. A failed or refused position has
    // none, and never comes back by re-pricing. `landPoint` decides; this holds.
    this.readings = readings;
    this.basis = basis;
    this.cacheKey = cacheKey;
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
  constructor({ wanted, measured, gaps, density, runs, unpriced = 0 }) {
    // `unsurveyed` is the remainder, so the sum holds by construction; what
    // can fail is a remainder below zero, or a count that is not a number.
    const unsurveyed = wanted - measured - gaps;
    if (!(unsurveyed >= 0)) {
      throw new Error(
        `coverage does not sum: ${measured} measured and ${gaps} gaps against ${wanted} wanted. A relief and ` +
          'a schedule of spot heights must never be able to disagree about how much was measured',
      );
    }
    // The engine runs behind the measured positions, which is their count only
    // while no axis is priced. It can never exceed them, and a measured ground
    // stands on at least one (FR-026, FR-027).
    if (measured === 0 ? runs !== 0 : !(runs >= 1 && runs <= measured)) {
      throw new Error(
        `coverage counts ${runs} runs behind ${measured} measured positions. Every measured position is one ` +
          'completed run, and several may share one only along a priced axis',
      );
    }
    this.wanted = wanted;
    this.measured = measured;
    this.gaps = gaps;
    this.unsurveyed = unsurveyed;
    this.density = density;
    this.runs = runs;
    // Gaps whose run completed and whose reading could not be priced: not runs
    // that failed, and a rate that returns stands them back up.
    this.unpriced = unpriced;
    Object.freeze(this);
  }

  /** " from N runs", where the runs are not the measured positions, else "". */
  get fromRuns() {
    return this.runs === this.measured ? '' : ` from ${this.runs} ${this.runs === 1 ? 'run' : 'runs'}`;
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
  constructor({ params, patch, shape, readings = null, at }) {
    if (!params || !patch) throw new Error('a traverse stop needs the desk it was standing on');
    if (typeof shape !== 'string') throw new Error('a traverse stop needs the shape key of its desk');
    if (!Number.isInteger(at)) throw new Error('a traverse stop needs its place in the order');
    this.params = Object.freeze({ ...params });
    this.patch = Object.freeze({ ...patch });
    // Taken once, since the stop is frozen: every "is the desk standing here"
    // is a string comparison rather than a whole-desk serialisation per stop,
    // and that question is asked after every live solve of a drag.
    this.shape = shape;
    this.readings = readings;
    this.at = at;
    Object.freeze(this);
  }
}

/* ══ the survey ══════════════════════════════════════════════════════════ */

export const pointKey = (ix, iy) => `${ix},${iy}`;

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

  /**
   * Where the ground was **cut**, or null where an axis was narrowed past it.
   *
   * This is a property of the survey and it does not move: `rowsFor` builds
   * every row's snapshot from `stance`, so a desk that moved mid-measurement
   * must not change what the remaining rows are measuring, or two halves of
   * one ground would be samples of two different buildings.
   *
   * It is emphatically **not** where the desk is now. That was the bug: this
   * getter was called `stanceAt` and was read for the crosshair, the improving
   * region, the free exchange, the refinement priority and both halves of the
   * descent — so standing on a measured point moved the desk and moved none of
   * them, and *Let it fall* fell from wherever the reader had been when they
   * cut the ground rather than from where they were standing. Use
   * `standingAt(desk)` for that, which is a question about the desk and
   * therefore takes one.
   */
  get cutAt() {
    return this.positionOf(this.stance);
  }

  /**
   * Where a given desk stands on this ground, or null where it is not on a
   * measured position — read from the desk handed in rather than from anything
   * stored, which is the only way it can be right after the desk has moved.
   * `standingAt` restricted to `on`, so the two cannot come to disagree.
   */
  positionOf(desk) {
    const at = this.standingAt(desk);
    return at?.on ? { ix: at.ix, iy: at.iy } : null;
  }

  /**
   * The same question, answered for a desk that is *between* measured
   * positions — a slider nudged off the lattice.
   *
   * Returns fractional indices so the mark can be drawn where the desk really
   * is, and `on` says whether that position is a measured one. Every reading
   * taken against the stance needs the second answer: "improves on the stance"
   * has no meaning when the survey holds no reading for where the reader is
   * standing, and inventing one from the nearest neighbour is the substitution
   * this sheet refuses everywhere else.
   */
  standingAt(desk) {
    const at = (axis) => {
      const value = desk[axis.key];
      const positions = axis.positions;
      if (!Number.isFinite(value)) return null;
      if (value < positions[0] || value > positions[positions.length - 1]) return null;
      const exact = axis.indexOf(value);
      if (exact !== -1) return exact;
      // Between two positions: interpolate in *index* space, because the grid
      // is drawn evenly by index and the positions are not evenly spaced in
      // value once the stance's own value has been forced into the list.
      for (let i = 0; i < positions.length - 1; i += 1) {
        if (value >= positions[i] && value <= positions[i + 1]) {
          const span = positions[i + 1] - positions[i];
          return span === 0 ? i : i + (value - positions[i]) / span;
        }
      }
      return null;
    };
    const ix = at(this.x);
    const iy = at(this.y);
    if (ix === null || iy === null) return null;
    const on = Number.isInteger(ix) && Number.isInteger(iy);
    return { ix, iy, on };
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
  const survey = new Survey({ x, y, readings, stance, patch, annual, epw });
  // Before anything is measured: a ground of seasonal efficiency read for
  // demand would be the same figure at every position along that axis, drawn
  // as though it were a finding about the plant.
  const pairing = refusesSurveyPairing([survey.x.key, survey.y.key], survey.readings);
  if (pairing) throw new Error(pairing.sentence);
  return survey;
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
    // A row is a study of two controls, so its rest shape leaves both out, and
    // the cancel point has to ask it the same question.
    omits: [survey.x.key, survey.y.key],
    points,
    order: sampleOrder(points, survey.stance[survey.x.key]),
    origin,
    asked: points.length,
    // Not part of the job the scheduler understands, and `makeStudyJob` drops
    // it: the caller reads it off the spec to rank the rows and to map a job id
    // back to its row.
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
export function landPoint(
  survey,
  { ix, iy, readings = null, basis = null, reason = null, floorArea = null, cacheKey = null },
) {
  if (ix < 0 || ix >= survey.x.count || iy < 0 || iy >= survey.y.count) {
    throw new Error(`landPoint: ${ix},${iy} is off a ground of ${survey.density}`);
  }
  const key = pointKey(ix, iy);
  // A sample that came back with no reading for the survey's own first
  // quantity is a gap, not a spot height at zero. The scheduler already treats
  // a failed run as a gap rather than a cached fact; this is the same rule one
  // level up, where the reason can be said in words.
  const value = readings ? survey.readings[0].valueOf(readings) : null;
  if (value === null) {
    // Kept only where a price could bring the reading back: the run completed
    // and the reading is a priced one, so a rate that returns stands the spot
    // back up with no run. Any other gap is final until something re-runs it.
    const repriceable = Boolean(readings) && Boolean(survey.readings[0].quantity.priced);
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
        readings: repriceable ? readings : null,
        basis: repriceable ? basis : null,
        cacheKey: repriceable ? cacheKey : null,
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
      basis,
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
  let unpriced = 0;
  const runs = new Set();
  for (const point of survey.points.values()) {
    if (point instanceof SpotHeight) {
      measured += 1;
      runs.add(point.cacheKey);
    } else {
      gaps += 1;
      if (point.basis) unpriced += 1;
    }
  }
  return new Coverage({ wanted: survey.wanted, measured, gaps, density: survey.density, runs: runs.size, unpriced });
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
  const start = Math.ceil(extent.lo / step) * step;
  // An interval finer than the spacing of the numbers it steps through is not
  // an interval at all: `v += step` hands back `v` unchanged, the cursor never
  // reaches `hi`, and the loop below fills `levels` until the array passes its
  // maximum length and `push` throws `RangeError: Invalid array length`. That
  // lands in `drawGround` and takes the whole ground off the sheet — measured
  // in the browser as 26 identical page errors and no drawing.
  //
  // Measured: two readings of 20 °C one ULP apart span 3.55e-15, an eighth of
  // which is 4.44e-16, so the 1-2-5 progression lands the interval at 5e-16
  // against a spacing at that magnitude of 3.55e-15 — and `20 + 5e-16` is
  // exactly 20. The window is any span below about `target` ULPs of the
  // readings themselves, which is narrow and is exactly what a control that
  // barely moves its reading produces: a design-day zone temperature high
  // comes back bit-identical across most of a ground and differs in the last
  // bit at one or two positions.
  //
  // The guard above catches a ground that is *exactly* flat. This is the same
  // ground one bit less flat and it gets the same answer for the same reason:
  // a span of a few ULPs is a reading that did not move, and there is no
  // relief in it to contour. `[]` is already what this function returns for a
  // flat ground and for one with nothing measured, `contoursOf` draws nothing
  // from an empty list, and the spot heights still stand — so the drawing says
  // the ground is flat, which is true of it. Inventing an interval that does
  // advance would letter contours through a rounding error instead.
  if (!(start + step > start)) return [];
  // Generated by index rather than by accumulation, which is what makes the
  // loop bounded *by construction* for any step at all rather than by the
  // guard above. The guard is a statement about the ground — a reading that
  // did not move has no relief — and it should not also be the only thing
  // standing between this function and an array that grows until `push`
  // throws. Indexing also drops the drift `toFixed(10)` was papering over:
  // `v += step` twenty times accumulates error that `start + n * step` does
  // not, so the rounding is now presentation rather than repair.
  const last = Math.floor((extent.hi - start) / step + 1e-6);
  const levels = [];
  for (let n = 0; n <= last; n += 1) {
    levels.push(Number((start + n * step).toFixed(10)));
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

/**
 * The height of the surface `meshOf` draws, at a fractional lattice position,
 * or null over a cell it draws nothing across.
 *
 * Taken off the two triangles the cell is actually drawn as, split along the
 * same bottom-left to top-right diagonal, so a mark stood on it sits on the
 * drawing rather than a hair above or below it where bilinear interpolation
 * and the triangles disagree. It is the drawing's height and not a reading:
 * nothing may be lettered from it, as nothing is lettered from the surface.
 */
export function surfaceAt({ values, mask, nx, ny }, ix, iy) {
  if (!(ix >= 0 && iy >= 0 && ix <= nx - 1 && iy <= ny - 1)) return null;
  const x0 = Math.min(Math.floor(ix), nx - 2);
  const y0 = Math.min(Math.floor(iy), ny - 2);
  if (x0 < 0 || y0 < 0) return null;
  const bl = x0 + y0 * nx;
  const br = bl + 1;
  const tl = bl + nx;
  const tr = tl + 1;
  if (!mask[bl] || !mask[br] || !mask[tl] || !mask[tr]) return null;
  const fx = ix - x0;
  const fy = iy - y0;
  return fx >= fy
    ? values[bl] + fx * (values[br] - values[bl]) + fy * (values[tr] - values[br])
    : values[bl] + fy * (values[tl] - values[bl]) + fx * (values[tr] - values[tl]);
}

/**
 * The block the ground sits on: the cut faces down each side, and the base.
 *
 * A surface drawn alone floats, and a floating surface is hard to read — there
 * is nothing to say which way is down, no silhouette to judge a slope against,
 * and nothing for an axis to be lettered on. A block diagram is the drawing
 * this has always been: the terrain on top, the ground it stands in cut away
 * beneath it.
 *
 * **None of it is measurement, and the drawing has to keep saying so.** The
 * sides are a section through nothing — this survey knows what the reading is
 * *on* the ground and nothing whatever about what is under it. So the block is
 * derived here, from the same lattice and the same mask, and it can add no
 * ground the surface does not already have: every skirt quad hangs off an edge
 * of an emitted cell, and the base is those same cells laid flat. A hole in
 * the surface is a shaft through the block, because the alternative is a solid
 * body where nothing was measured.
 *
 * `depth` is a fraction of the measured range, and the base it implies is
 * returned **in the reading's own units** rather than in the normalised ones
 * the drawing works in. That is not fussiness: the caller normalises every
 * height it is handed, and a base carried in normalised units has to be
 * exempted from that pass — which means recognising it, which means comparing
 * floats. Written that way it failed exactly as you would expect and not at
 * all where you would look: the positions are a `Float32Array`, `-0.35` does
 * not survive the narrowing unchanged, the equality never held, the base was
 * normalised along with everything else and the block ran four times its own
 * height off the bottom of the frame. In reading units there is nothing to
 * exempt and nothing to compare.
 */
export function blockOf(lattice, { depth = 0.18 } = {}) {
  const { values, mask, nx, ny } = lattice;
  const extent = extentOf(lattice);
  const span = extent && extent.hi > extent.lo ? extent.hi - extent.lo : 1;
  const base = (extent ? extent.lo : 0) - depth * span;
  const at = (ix, iy) => ix + iy * nx;
  const filled = (cx, cy) =>
    cx >= 0 &&
    cy >= 0 &&
    cx < nx - 1 &&
    cy < ny - 1 &&
    mask[at(cx, cy)] &&
    mask[at(cx + 1, cy)] &&
    mask[at(cx, cy + 1)] &&
    mask[at(cx + 1, cy + 1)];

  const positions = [];
  const indices = [];
  const push = (ix, iy, z) => {
    positions.push(ix, iy, z);
    return positions.length / 3 - 1;
  };
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

  /* ── the cut faces ───────────────────────────────────────────────────── */
  //
  // An edge belongs to the silhouette exactly when one of the two cells it
  // divides is emitted and the other is not. That one test covers the outside
  // of the block and the walls of every hole in it, which is what makes a gap
  // a shaft rather than something the block quietly fills in.
  const edges = [];
  const edge = (ax, ay, bx, by) => {
    const za = values[at(ax, ay)];
    const zb = values[at(bx, by)];
    const top = [push(ax, ay, za), push(bx, by, zb)];
    const foot = [push(ax, ay, base), push(bx, by, base)];
    quad(top[0], top[1], foot[1], foot[0]);
    // Kept so the levels can be ruled along the cut, which is what turns the
    // side of the block from a silhouette into the vertical scale.
    edges.push({ ax, ay, za, bx, by, zb });
  };
  for (let cy = 0; cy < ny - 1; cy += 1) {
    for (let cx = 0; cx < nx - 1; cx += 1) {
      if (!filled(cx, cy)) continue;
      if (!filled(cx, cy - 1)) edge(cx, cy, cx + 1, cy);
      if (!filled(cx, cy + 1)) edge(cx + 1, cy + 1, cx, cy + 1);
      if (!filled(cx - 1, cy)) edge(cx, cy + 1, cx, cy);
      if (!filled(cx + 1, cy)) edge(cx + 1, cy, cx + 1, cy + 1);
    }
  }

  /* ── the base ────────────────────────────────────────────────────────── */
  const baseStart = indices.length;
  for (let cy = 0; cy < ny - 1; cy += 1) {
    for (let cx = 0; cx < nx - 1; cx += 1) {
      if (!filled(cx, cy)) continue;
      const a = push(cx, cy, base);
      const b = push(cx + 1, cy, base);
      const c = push(cx + 1, cy + 1, base);
      const d = push(cx, cy + 1, base);
      quad(a, d, c, b);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    // Where the base's triangles start, so the two can be toned apart: a cut
    // face and the underside of the block are different surfaces.
    baseStart,
    edges,
    // The depth as a fraction of the measured range, for the drawing's own
    // normalised space, and the base as a reading — the same number said the
    // two ways its two readers need it.
    depth,
    base,
    nx,
    ny,
  };
}

/**
 * The contour levels, ruled around the cut faces of the block.
 *
 * A block diagram's side is the one place a reader can read a height directly
 * — the terrain's own surface is foreshortened from every viewpoint the orbit
 * allows, and no drawing of it can be measured with a ruler. Ruled at the same
 * levels the plan contours, the cut becomes the vertical scale: a silhouette
 * you can count bands up.
 *
 * **A rule is drawn only where the face actually is.** Each cut face is a quad
 * with a sloping top — the terrain at one end of the edge and at the other —
 * so a level above both ends has no face to be drawn on, and a level between
 * them crosses part of the edge only. Drawn straight across regardless, the
 * rules would float above the terrain at exactly the corners where the ground
 * is highest, which is a line claiming a height the block does not reach. So
 * each is clipped to its own edge, which costs one interpolation and is the
 * whole difference between a scale and a decoration.
 */
export function strataOf(block, levels) {
  const out = [];
  const base = block.base;
  for (const level of levels) {
    for (const { ax, ay, za, bx, by, zb } of block.edges) {
      const lo = Math.min(za, zb);
      const hi = Math.max(za, zb);
      if (level <= base || level >= hi) continue;
      if (level <= lo) {
        out.push(ax, ay, level, bx, by, level);
        continue;
      }
      // Between the two ends: the rule runs from the lower end to the point
      // where the sloping top crosses it.
      const t = (level - za) / (zb - za);
      const cx = ax + (bx - ax) * t;
      const cy = ay + (by - ay) * t;
      if (za < zb) out.push(ax, ay, level, cx, cy, level);
      else out.push(cx, cy, level, bx, by, level);
    }
  }
  return out;
}

/**
 * The vertical arrises: a hairline at every corner of the block, base to
 * terrain.
 *
 * The horizontals give the cut a scale; the verticals give it a shape. Without
 * them a block turned to an oblique reads as two flat washes meeting at an
 * ambiguous seam — which way the corner folds is exactly the thing an
 * axonometric has to state, and the reason a drafted solid has always been
 * ruled at its arrises.
 *
 * **A corner is where the silhouette turns**, not one of four. On a plain
 * rectangular footprint that gives the four you would draw by hand; around a
 * hole in the ground it gives that hole its own corners, which is right,
 * because a shaft through the block is as much an edge of the solid as its
 * outside is. Every boundary edge is axis-aligned in lattice space, so a
 * vertex turns exactly when it carries both a horizontal and a vertical edge.
 */
export function arrisesOf(block) {
  const base = block.base;
  const seen = new Map();
  const key = (x, y) => `${x},${y}`;
  const note = (x, y, z, horizontal) => {
    const at = key(x, y);
    const held = seen.get(at) ?? { x, y, z, horizontal: false, vertical: false };
    held[horizontal ? 'horizontal' : 'vertical'] = true;
    seen.set(at, held);
  };
  for (const { ax, ay, za, bx, by, zb } of block.edges) {
    const horizontal = ay === by;
    note(ax, ay, za, horizontal);
    note(bx, by, zb, horizontal);
  }
  const out = [];
  for (const corner of seen.values()) {
    if (!corner.horizontal || !corner.vertical) continue;
    out.push(corner.x, corner.y, base, corner.x, corner.y, corner.z);
  }
  return out;
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
/**
 * Why a reading taken against the stance cannot be taken, or null.
 *
 * Two different facts were arriving as one `null` and being lettered with one
 * sentence: a desk **outside the extent** the ground was cut over, and a desk
 * **between two measured designs** inside it — a slider nudged off the
 * lattice. The second is much the commoner and was being told it was the
 * first, which is a true-sounding sentence about the wrong thing and offers a
 * fix ("widen the extent") that would not help.
 */
function standingRefusal(survey, stance) {
  if (!stance) {
    return (
      'The desk is standing outside the extent this ground was cut over, so there is no reading here to ' +
      'compare against. Widen the extent, or move the desk back inside it.'
    );
  }
  if (stance.on === false) {
    return (
      'The desk is between two measured designs, so this survey holds no reading for where it is ' +
      'standing. Stand on a spot height, or let the ground refine until one falls here.'
    );
  }
  return null;
}

export function improvingRegion(survey, stance) {
  const refused = standingRefusal(survey, stance);
  if (refused) return { spots: [], refusal: refused };
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
export function freeExchange(survey, stance, reading = survey.readings[0]) {
  const refused = standingRefusal(survey, stance);
  if (refused) return { refusal: refused };
  const { ix, iy } = stance;
  // The 3 x 3 has to be *small* as well as complete, and this is the gate the
  // first version was missing. Every term below is a finite difference across
  // two axis steps, so on a five-position axis the "level line at the stance"
  // is stated from readings half the design space apart — an answer to four
  // significant figures about a line that is nowhere near level, which is
  // false precision, and false precision on this sheet is worse than an em
  // dash because the reader has no way to see it. A third of the extent is
  // where a nine-position axis (a quarter) clears and a five-position one (a
  // half) does not, which is the distinction that actually matters.
  const spans = (axis, at) =>
    (axis.positions[at + 1] - axis.positions[at - 1]) / (axis.positions[axis.count - 1] - axis.positions[0]);
  if (ix < 1 || iy < 1 || ix >= survey.x.count - 1 || iy >= survey.y.count - 1) {
    return {
      refusal:
        'The stance is on the edge of the ground, so there is no measured neighbour on one side to take a ' +
        'gradient against. Widen the extent, or move the desk in from the edge.',
    };
  }
  if (spans(survey.x, ix) > 1 / 3 || spans(survey.y, iy) > 1 / 3) {
    return {
      refusal:
        'The ground is too coarse around the stance to state an exchange: the nearest measured neighbours ' +
        'are more than a third of the extent away, and a level line drawn between them would be stated to ' +
        'four figures about a line that is nowhere near level. Let the ground refine, or narrow the extent ' +
        'so the same runs cover less of it.',
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
  // The second gate: does the exchange stay on the ground it was measured from?
  //
  // A comparison of the second-order term against the first-order one was
  // tried here first and is not well founded — along the level line the
  // first-order change is exactly zero by construction, which is the whole
  // point of it, so there is nothing for the curvature to be large *against*.
  // What actually goes wrong on a shoulder is visible in the answer itself:
  // where the reading barely moves along Y, holding it still costs a step of Y
  // longer than the extent contains. Measured on a coarse ground over a
  // `tanh` shoulder, one step of glazing "buys" 24.6 m²K/W of wall resistance
  // across an axis that runs 0.2 to 10 — an exchange nobody can make, stated
  // to three figures. So the step is required to land on the ground it was
  // read off.
  const reach = survey.y.positions[survey.y.count - 1] - survey.y.positions[0];
  if (Math.abs(dy) > Math.abs(reach)) {
    return {
      refusal:
        `Holding ${reading.label.toLowerCase()} still over one step of ` +
        `${survey.x.control.label.toLowerCase()} would take ` +
        `${survey.y.control.label.toLowerCase()} further than this ground extends, so there is no exchange ` +
        'here that the survey has measured. Widen the extent on that axis, or let the ground refine.',
    };
  }
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
 * Three terms, and the argument for each is about what the reader is looking
 * at rather than about information theory.
 *
 * **Steepness first**, because flat ground is already described by the points
 * around it — a run there confirms what the contours already say, where a run
 * on a slope is a run that can move a contour.
 *
 * **Disagreement second, on a ground carrying two readings.** Where one
 * reading is rising and the other falling, the ground between two measured
 * points holds a trade the survey has not yet found, and that is the most
 * interesting position on the whole lattice — it is the thing US4 exists to
 * name. Scored on the first reading alone (which is what this did at first)
 * that ground is invisible: a position can be perfectly flat in demand and
 * steep in overheating, and the refinement would rank it last. The two terms
 * are each normalised by their own reading's range before being multiplied,
 * because the readings are in different units and neither may be ranked
 * against the other.
 *
 * **Proximity to the stance third**, because the reader is standing there and
 * every relative reading on this sheet — the pull, the free exchange, the
 * region where both readings improve — is taken against it, and two of those
 * refuse outright until the ground around the stance is dense.
 *
 * The weighting is a heuristic and is the one number in this feature no
 * measurement supports. It is written as a sum of normalised terms rather than
 * as magic constants precisely so that it can be argued with.
 */
export function refineOrder(survey, { reading = survey.readings[0], stance }) {
  // Every reading the ground carries, not only the one the relief is drawn
  // from: the second is what makes a trade visible, and a trade is the most
  // interesting thing on a two-reading ground.
  const carried = survey.readings.includes(reading) ? survey.readings : [reading, ...survey.readings];
  const grids = carried.map((entry) => {
    const lattice = latticeOf(survey, entry);
    const extent = extentOf(lattice);
    return { entry, span: extent && extent.hi > extent.lo ? extent.hi - extent.lo : 1 };
  });
  const { nx, ny } = latticeOf(survey, reading);
  const diagonal = Math.hypot(nx, ny) || 1;

  const wanted = [];
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      if (survey.at(ix, iy)) continue; // measured, or a gap that is not retried on sight
      // The steepest measured difference across this position's neighbourhood,
      // per reading, which is the best statement available about ground nobody
      // has stood on. Signed, so that two readings pulling opposite ways can
      // be told from two pulling together.
      const slopes = grids.map(() => 0);
      let near = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const a = survey.spotAt(ix + dx, iy + dy);
          const b = survey.spotAt(ix - dx, iy - dy);
          if (a) near += 1;
          if (!a || !b || (!dx && !dy)) continue;
          grids.forEach(({ entry, span }, at) => {
            const va = entry.valueOf(a.readings);
            const vb = entry.valueOf(b.readings);
            if (va === null || vb === null) return;
            const slope = (va - vb) / span;
            if (Math.abs(slope) > Math.abs(slopes[at])) slopes[at] = slope;
          });
        }
      }
      const steep = Math.abs(slopes[0]);
      // Two readings moving opposite ways across this position. Zero on a
      // one-reading ground, and zero where both move together, so this term
      // only ever adds where there is a trade to find.
      const splits =
        slopes.length > 1 && slopes[0] * slopes[1] < 0
          ? Math.min(Math.abs(slopes[0]), Math.abs(slopes[1]))
          : 0;
      const distance = stance ? Math.hypot(ix - stance.ix, iy - stance.iy) / diagonal : 0.5;
      // A position with no measured neighbour at all cannot be scored on
      // steepness and would otherwise sort last for ever, which on a ground
      // whose coarse pass failed would leave the whole survey unmeasured. The
      // proximity term carries it.
      const score = steep * 2 + splits * 2 + (1 - distance) + (near ? 0 : -0.25);
      wanted.push({ ix, iy, score, steep, splits, distance });
    }
  }
  wanted.sort((left, right) => right.score - left.score || left.iy - right.iy || left.ix - right.ix);
  return wanted;
}

/* ══ somebody else's line, cut across the ground ═════════════════════════ */

/**
 * A published pass/fail figure belonging to the plotted reading, and which
 * side of it passes.
 *
 * **Nothing here is copied.** `limit` is a getter onto `target.limit`, the
 * label reads the preset's own name and the target's own, and `passes`
 * delegates to the one published comparator. The scoreboard row and this line
 * are one declaration, which is the whole of FR-009: a line drawn at a figure
 * of its own would be free to disagree with the verdict lettered beside the
 * same reading, and the drift would show only at exactly the value the
 * criterion is decided on.
 *
 * The pass side is *probed* rather than declared a second time, for the same
 * reason (research R-2). `Target.meets` is the comparator the board uses; a
 * `passes: 'below'` field here would be a second opinion about it. Today every
 * target on the sheet passes at or below its limit and the probe records that
 * as a measurement — so a target published the other way round draws its band
 * on the other side with nothing in this file edited.
 */
export class Threshold {
  constructor({ preset, target, reading }) {
    if (!preset || !target || !reading) {
      throw new Error('a threshold needs the standard that published it, its target and the reading it is read on');
    }
    if (target.limit == null) {
      throw new Error(
        `"${preset.name} · ${target.label}" names no limit, so it is an absence with a reason and never a line`,
      );
    }
    if (target.quantityKind !== reading.quantityKind) {
      throw new Error(
        `"${preset.name} · ${target.label}" letters in ${target.quantityKind.id} and the survey reading ` +
          `"${reading.label}" in ${reading.quantityKind.id}, so a line drawn at that limit would be ` +
          'lettered in the wrong system on an IP sheet',
      );
    }
    this.preset = preset;
    this.target = target;
    this.reading = reading;
    // Either side of the limit, at a step big enough to survive the reading's
    // own magnitude: an absolute epsilon is meaningless against a limit of 55
    // and catastrophic against one of 0.03.
    const step = Math.max(1, Math.abs(target.limit)) * 1e-6;
    const below = target.meets(target.limit - step);
    const above = target.meets(target.limit + step);
    if (below === true && above === false) {
      this.passesBelow = true;
    } else if (below === false && above === true) {
      this.passesBelow = false;
    } else {
      throw new Error(
        `"${preset.name} · ${target.label}" answers ${String(below)} below its limit and ${String(above)} ` +
          'above it, which is not a comparator with a passing side, so there is no ground for this sheet to shade',
      );
    }
    Object.freeze(this);
  }

  /** The published figure itself, never a copy of it. */
  get limit() {
    return this.target.limit;
  }

  get label() {
    return `${this.preset.name} · ${this.target.label}`;
  }

  /**
   * The standard's name as it goes on the drawing, which is its first word.
   *
   * A label on the line stands in a field of measured spot figures, and a
   * measurement is the one thing on this drawing a label may not cover
   * (FR-010). "LETI, commercial office" is twenty-three characters and
   * "Passivhaus Classic · LETI, commercial office" is forty-four, which at the
   * mono face is half the width of the ground — a label that long either
   * prints over two measurements or cannot be placed at all. The first word
   * names the standard unambiguously across this roster (Passivhaus,
   * EnerPHit, LETI, TM59) and the key beside the drawing carries every one of
   * them in full, with its criterion and its pass side. The label's job is to
   * say whose line this is; the key's is to say what it asks.
   */
  get standard() {
    return this.preset.name.split(/[\s,]+/)[0];
  }

  /** The criterion in the publisher's own words. */
  get asks() {
    return this.target.asks;
  }

  /** Whether a reading clears this line, or null where there is no reading. */
  passes(value) {
    return this.target.meets(value);
  }

  /**
   * The limit lettered as the ground letters its own figures: converted by the
   * reading's kind, at the reading's precision, carrying no unit. The axis and
   * the key carry the unit once, which is the arrangement the contour labels
   * are the other half of.
   */
  figure() {
    return this.reading.figure(this.limit);
  }
}

/**
 * What the survey draws for one reading at one moment.
 *
 * `lines` and `absence` are mutually exclusive and jointly exhaustive, and the
 * constructor refuses anything else. That is Principle IV expressed as a type
 * rather than as a rule somebody has to remember at three render sites: there
 * is no state in which this drawing shows nothing and says nothing.
 */
export class ThresholdSet {
  constructor({ reading, chased = null, lines = [], absence = null }) {
    if (!reading) throw new Error('a threshold set needs the reading it was read for');
    const has = lines.length > 0;
    const said = typeof absence === 'string' && absence.trim().length > 0;
    if (has === said) {
      throw new Error(
        `the survey has ${has ? 'lines to draw and an absence to state' : 'neither a line nor a reason'} for ` +
          `"${reading.label}". A drawing that shows nothing must say why, and one that shows something must not`,
      );
    }
    this.reading = reading;
    this.chased = chased;
    this.lines = Object.freeze([...lines]);
    this.absence = said ? absence : null;
    Object.freeze(this);
  }
}

/**
 * The measured ground lying on one threshold's passing side.
 *
 * One per drawn line and never merged across thresholds (FR-011): a band says
 * where one published line falls on measured ground, and a union of two bands
 * would be a combined verdict nobody published.
 *
 * `passing` against `measured` is asserted the way `Coverage` asserts its own
 * sum, and for the same reason — a shaded band and the count of what was
 * measured must never be able to disagree about how much ground there is.
 *
 * The two counts are named against `Coverage`'s own vocabulary rather than
 * against this function's local one. `Coverage.measured` is how many positions
 * carry a run and `Coverage.unsurveyed` is how many do not, so a field here
 * called `unmeasured` holding the count of measured positions that *fail* the
 * line would be the same word meaning two things in one module. There is no
 * third count to carry: passing and failing are the whole of the measured
 * ground, and the failing half is the subtraction.
 */
export class PassingGround {
  constructor({ threshold, cells, segments, passing, measured, wholly = null }) {
    if (!Number.isInteger(passing) || !Number.isInteger(measured) || !(measured - passing >= 0)) {
      throw new Error(
        `the passing ground does not sum: ${passing} passing against ${measured} measured positions on the ` +
          'ground. A band and the schedule of spot heights behind it must never be able to disagree',
      );
    }
    if (wholly !== null && wholly !== 'passing' && wholly !== 'failing') {
      throw new Error(`a passing ground stands wholly "${wholly}", which is neither side of a line`);
    }
    this.threshold = threshold;
    this.cells = Object.freeze(cells.map((cell) => Object.freeze(cell)));
    this.segments = Object.freeze(segments);
    this.passing = passing;
    this.measured = measured;
    // Set only where the line crosses no measured ground at all (FR-007), so
    // the key can say which side the whole ground is on rather than the
    // drawing showing nothing because there was no crossing to draw.
    this.wholly = wholly;
    Object.freeze(this);
  }

  /**
   * Whether this band put a hatch on the ground, and whether it drew a rule.
   *
   * Named here because two surfaces ask it — `markSentence` below and the
   * key's own swatch over in `main.js` — and the defect both were fixed for
   * was a key asserting a mark the drawing did not carry.
   * Spelled `cells.length` at each site, the next refinement of what counts as
   * a drawn hatch lands at one of them and the two halves of one entry
   * disagree again, silently, because only one of them has words in it.
   *
   * Neither is `wholly`, and that is the distinction worth keeping: `wholly`
   * is a fact about the reading — which side of the line the ground is on —
   * and a band can fail to hatch a ground that is wholly passing, when every
   * passing design sits on a cell that was never fully measured.
   *
   * Getters, so they sit on the prototype and the constructor's freeze still
   * holds: no second field to keep in step with the geometry it is read off.
   */
  get hatched() {
    return this.cells.length > 0;
  }

  get ruled() {
    return this.segments.length > 0;
  }
}

/**
 * The qualifier a target has to agree with before it is this reading's line.
 *
 * **This is the one place the feature can be silently wrong**, and it is worth
 * saying exactly how. `tm59a`'s quantity reads criterion a at one category
 * (`TM59_STUDY_CATEGORY`, Category II) while TM59 declares the criterion at
 * two; matching on `metric` alone draws Category I's line across a Category II
 * ground, and because both categories carry the same *limit* today the drawing
 * looks perfectly correct while citing a criterion the ground does not answer.
 * `tm59.js` met this exact problem first — `clearedCount` matches on criterion
 * **and** category — so the rule is that module's, restated where the ground
 * needs it.
 *
 * Two different facts are kept apart here, and conflating them is what makes
 * a qualifier fail quietly:
 *
 *   - a target whose qualifier is **decidable and different** describes another
 *     reading. Category I is a real criterion, correctly declared, and simply
 *     not the one this ground is cut for. It is not matched, and that is a fact
 *     about the roster rather than a defect.
 *   - a target whose qualifier the survey **cannot decide** — an `overheat`
 *     target naming no temperature, a TM59 criterion read by category naming
 *     none, a criterion carrying one where the reading has none — throws at
 *     module load naming both declarations. Falling through to a match there
 *     is the silent fallback, and it is the shape that hides afterwards.
 */
class Qualifier {
  constructor({ field, reads, says, decidable }) {
    this.field = field;
    // What the reading itself is read at, off the declaration that reads it.
    this.reads = reads;
    this.says = says;
    this.decidable = decidable;
    Object.freeze(this);
  }

  /** The qualifier a target carries, refused where the survey cannot decide it. */
  on(target, preset, reading) {
    const carried = target[this.field];
    if (!this.decidable(carried)) {
      throw new Error(
        `"${preset.name} · ${target.label}" answers "${reading.label}" but declares ${this.field} as ` +
          `${String(carried?.label ?? carried)}, and this survey reads that criterion at ${this.says}. A ` +
          'line whose qualifier cannot be decided is a line drawn across a ground that does not answer it',
      );
    }
    return carried;
  }
}

/**
 * Which qualifier each metric is read under, declared rather than tested
 * inline, so a metric that grows one is a row here and not a branch in the
 * matching loop.
 */
const QUALIFIER_BY_METRIC = Object.freeze({
  overheat: new Qualifier({
    field: 'above',
    reads: OVERHEAT_ABOVE,
    says: `hours above ${OVERHEAT_ABOVE} °C`,
    decidable: (value) => Number.isFinite(value),
  }),
  tm59a: new Qualifier({
    field: 'category',
    reads: TM59_STUDY_CATEGORY,
    says: TM59_STUDY_CATEGORY.label,
    decidable: (value) => value !== null,
  }),
  tm59b: new Qualifier({
    field: 'category',
    reads: TM59_STUDY_CATEGORY,
    says: TM59_STUDY_CATEGORY.label,
    decidable: (value) => value !== null,
  }),
  // Criterion c is 26 °C for both categories, so a declaration carrying one
  // is a criterion this sheet does not read rather than one it can narrow.
  tm59c: new Qualifier({
    field: 'category',
    reads: null,
    says: 'both categories at once, which is what makes it carry none',
    decidable: (value) => value === null,
  }),
});

/** Which run contents a target's `needs` asks for, as a question of the reading's own. */
const NEEDS_IMPLIED = Object.freeze({
  run: () => true,
  season: (contents) => contents.season,
  year: (contents) => contents.annual,
});

/**
 * Every target of every published standard that names a figure for this
 * reading, matched, with the load-time invariants asserted on the way past.
 *
 * Standards only: `targetsForMetric` filters on `Preset.kind`, because a parti
 * is this sheet's own arrangement and cites nothing, and drawing a line at one
 * of its numbers would be the sheet asserting under cover of citing.
 */
function matchedTargets(reading) {
  return targetsForMetric(reading.id).filter(({ preset, target }) => {
    // Kind agreement, on every metric match rather than only on the ones that
    // go on to be drawn. Unit *strings* are deliberately not compared: a
    // converting kind owns its unit string outright, so `kWh/m²·yr` and
    // `kWh/(m²a)` are one kind spelled two ways by two publishers, and the kind
    // is the comparison.
    if (target.quantityKind !== reading.quantityKind) {
      throw new Error(
        `"${preset.name} · ${target.label}" answers "${reading.label}" and the two letter in different ` +
          `kinds — ${target.quantityKind.id} against ${reading.quantityKind.id} — so on an IP sheet the ` +
          'line and the ground it crosses would be converted two different ways',
      );
    }
    const implied = NEEDS_IMPLIED[target.needs];
    if (!implied) {
      throw new Error(`"${preset.name} · ${target.label}" needs a run that "${target.needs}", which this survey cannot ask for`);
    }
    if (!implied(reading.quantity.needs)) {
      throw new Error(
        `"${preset.name} · ${target.label}" asks for a run that "${target.needs}" and the survey reading ` +
          `"${reading.label}" never asks its samples for one, so the ground would carry figures this line ` +
          'has no right to judge',
      );
    }
    const qualifier = QUALIFIER_BY_METRIC[reading.id] ?? null;
    if (qualifier) return qualifier.on(target, preset, reading) === qualifier.reads;
    // An unqualified reading against a qualified target: the line is read at
    // something this ground does not measure, and there is nothing here to
    // narrow it against.
    for (const field of ['above', 'category']) {
      if (target[field] != null) {
        throw new Error(
          `"${preset.name} · ${target.label}" is read at ${field} ${String(target[field]?.label ?? target[field])} ` +
            `and the survey reading "${reading.label}" declares no such qualifier, so nothing here can say ` +
            'whether that line describes this ground',
        );
      }
    }
    return true;
  });
}

/** Two limits are one line when they differ by less than this. */
const coincidence = (limit) => Math.max(1, Math.abs(limit)) * 1e-9;

/** The matched targets a chase narrows this ground to, or all of them. */
const scopedTargets = (reading, chased) => {
  const matched = matchedTargets(reading);
  return chased ? matched.filter(({ preset }) => preset.id === chased) : matched;
};

/**
 * What this band actually put on the ground, said in the same breath as the
 * line it belongs to.
 *
 * The hatch clause used to be unconditional, which made the key assert a mark
 * the drawing did not always carry. Three of the five states below draw no
 * hatch at all, and one of them — the scattered ground — draws no rule either,
 * so the entry stood over a blank ground saying "hatched is measured ground
 * meeting this standard's published threshold" with nothing hatched anywhere.
 * That is an absence with no reason given, which is the one thing this sheet's
 * key is for refusing.
 *
 * `hatched` is asked before `wholly`, and the order is the whole of the fix:
 * `wholly` is a fact about the reading — which side of the line the ground is
 * on — while `hatched` is a fact about the drawing, and a band can fail to
 * hatch a ground that is wholly passing. The swatch that stands beside these
 * words in the key asks `ruled` for the same reason; both live on
 * `PassingGround` so the sentence and the mark cannot disagree about what was
 * drawn.
 *
 * **It lives in this module rather than beside the drawing**, which is the
 * opposite of where wording usually goes, and `absenceIn` below is the
 * precedent: the absence path already letters its finished sentence here and
 * the key, the plan caption and the aria label all reuse that one wording.
 * The reason is that this is the copy the page cannot check. Six worded
 * branches decide whether the sheet claims a mark it did not draw, one of
 * them exists only for a reader who has no drawing to check it against, and
 * `main.js` imports the engine and drives the DOM, so nothing in it can be
 * loaded by a Node harness. Here, every branch is driven against the real
 * `passingGround` from a harness that imports it — a rename cannot quietly
 * end the only verification the copy ever gets. The opening that names the
 * standard and its figure stays in `main.js`, because that is lettering and
 * this is the claim.
 */
export function markSentence(ground) {
  const { hatched, passing, measured, wholly } = ground;
  // Before the first sample lands there is no ground at all. The line is not
  // absent and not refused — nothing has been measured for it to cross yet.
  if (!measured) return 'No position on this ground carries a run yet, so there is nothing to draw this line across.';
  // FR-007: where the line crosses none of the measured ground, saying which
  // side the whole of it is on is the answer. Drawing nothing would leave a
  // reader unable to tell an absent line from a defect. Built once and used by
  // both sides, since the key and the aria label share this wording and a
  // second spelling of it is a second thing to keep in step.
  const crossesNone = (side) => `The line crosses no measured ground: ${side} design here meets it.`;
  if (hatched) {
    const said = "Hatched is measured ground meeting this standard's published threshold.";
    return wholly === 'passing' ? `${said} ${crossesNone('every')}` : said;
  }
  // Nothing hatched, and the reason is the reading rather than the drawing:
  // not one measured design is on the passing side.
  if (wholly === 'failing') return crossesNone('no');
  // Nothing hatched although designs do pass. A region needs a cell with four
  // measured corners, so a passing design whose neighbours were never run has
  // nothing to be bounded by — the same rule that leaves unsurveyed ground
  // bare of contours, arriving where it costs a band. The count is the honest
  // answer in the meantime, and refining is what fixes it.
  const met = wholly === 'passing'
    ? 'Every measured design here meets it'
    : `${passing} of ${measured} measured designs meet it`;
  return `${met}, but each has unmeasured neighbours, so there is no region to bound — let the ground refine.`;
}

/**
 * The reason there is no line, given the targets already in scope.
 *
 * Split from the export below so `thresholdsFor` can decide the absence and
 * the lines off **one** walk of the roster rather than two: the exported
 * wrapper walked it, and then the caller that wanted the lines walked it again
 * to filter the same list on the same chase.
 */
function absenceIn(reading, scope, chased) {
  if (scope.some(({ target }) => target.limit != null)) return null;
  if (scope.length) {
    // Each standard with its own wording. Joining the names and then taking
    // one `asks` put the first standard's words in every other standard's
    // mouth — with one limitless criterion on the roster today that reads
    // correctly, and it would have gone on reading correctly right up to the
    // second, which is the shape of a citation that is quietly wrong.
    const said = scope.map(({ preset, target }) => `${preset.name} names ${target.asks}`).join(' and ');
    return `${said} for ${reading.label}, so there is no line to draw across this ground.`;
  }
  if (chased) {
    const name = PRESET_BY_ID[chased]?.name ?? chased;
    return `${name} publishes no limit for ${reading.label}, so this ground carries no line while it is chased.`;
  }
  return `No standard on this sheet publishes a limit for ${reading.label}, so this ground carries no threshold line.`;
}

/**
 * The reason there is no line, or null where there is one.
 *
 * One wording, because the key, the plan caption and the aria label all state
 * it and three spellings of one absence is three things to keep in step. Each
 * sentence is a reason rather than a blank: the publisher's own words for what
 * it asks (`target.asks`, which is the string the scoreboard letters in its
 * "Asks for" cell for the same target) where a standard names a criterion whose
 * value is climate- or building-specific, and the plain fact otherwise.
 */
export function thresholdAbsence(reading, { chased = null } = {}) {
  return absenceIn(reading, scopedTargets(reading, chased), chased);
}

/**
 * Every published line the survey should draw across this ground, or the
 * stated reason there is none.
 *
 * Pure and uncached. `conformance()` is recomputed on every apply for the
 * reason that applies here twice over: a cache would have to carry the chase
 * state *and* the unit system in its key, and this codebase has now met that
 * trap three times (`chooserDrawn`, `tm59Notes`, `setStudy`'s identity guard).
 * Recomputing is a walk of four standards' targets.
 *
 * `chased` is handed in rather than imported, exactly as `improvingRegion` is
 * handed the stance: this module learns nothing about page state, so a Node
 * harness drives the real function.
 */
export function thresholdsFor(reading, { chased = null } = {}) {
  const scope = scopedTargets(reading, chased);
  const absence = absenceIn(reading, scope, chased);
  if (absence) return new ThresholdSet({ reading, chased, absence });
  const lines = scope
    .filter(({ target }) => target.limit != null)
    .map(({ preset, target }) => new Threshold({ preset, target, reading }))
    // Ascending, then by the standard's name, so the order a reader meets the
    // lines in is the order they cross the ground rather than the order the
    // register happens to list the standards in (FR-012).
    .sort((left, right) => left.limit - right.limit || left.preset.name.localeCompare(right.preset.name));
  return new ThresholdSet({ reading, chased, lines });
}

/**
 * The distinct levels a set draws at, coincidence-collapsed.
 *
 * Two standards at one figure is the common case and not an edge one — TEDI
 * carries Passivhaus 15 and LETI 15, `overheat` carries Passivhaus 10 and
 * EnerPHit 10 — so one line labelled with both is what the drawing owes the
 * reader rather than two lines a hair apart, which is one line drawn twice.
 */
export function thresholdLevels(set) {
  const levels = [];
  for (const line of set.lines) {
    if (!levels.some((level) => Math.abs(level - line.limit) <= coincidence(line.limit))) levels.push(line.limit);
  }
  return levels.sort((left, right) => left - right);
}

/** Every line in the set drawn at one level, in the set's own order. */
export function thresholdsAt(set, level) {
  return set.lines.filter((line) => Math.abs(line.limit - level) <= coincidence(level));
}

/**
 * The measured ground on one threshold's passing side, per cell.
 *
 * Not a new tracer: the same cells `contoursOf` walks, filled per cell, with
 * the identical edge interpolation and the identical saddle rule — so the band
 * cannot part company with its own boundary, and a cell whose mask is not full
 * emits nothing at all. That last clause is what makes FR-004 structural: the
 * geometry over unsurveyed ground is never generated, exactly as no contour is
 * ever carried across it, so there is nothing to style into looking measured.
 *
 * Lattice coordinates out, fractional indices, as `contoursOf` returns. The
 * module draws nothing.
 */
export function passingGround(lattice, threshold) {
  const { values, mask, nx, ny } = lattice;
  const level = threshold.limit;
  const at = (ix, iy) => values[ix + iy * nx];
  const has = (ix, iy) => mask[ix + iy * nx] === 1;
  // `Target.meets` is `value <= limit`, so the passing corners are the ones
  // `contoursOf` does *not* count as over. Asked of the probed side rather
  // than of `meets` per corner, because the shading has to agree with the
  // boundary the same `> level` test drew.
  const passes = (value) => (threshold.passesBelow ? !(value > level) : value > level);

  let passing = 0;
  let measured = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!mask[i]) continue;
    measured += 1;
    if (passes(values[i])) passing += 1;
  }

  const cells = [];
  for (let iy = 0; iy < ny - 1; iy += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      if (!has(ix, iy) || !has(ix + 1, iy) || !has(ix, iy + 1) || !has(ix + 1, iy + 1)) continue;
      const bl = at(ix, iy);
      const br = at(ix + 1, iy);
      const tr = at(ix + 1, iy + 1);
      const tl = at(ix, iy + 1);
      // Corner positions and values anticlockwise from the bottom left, the
      // ordering the 16-case table is written against.
      const corners = [[ix, iy], [ix + 1, iy], [ix + 1, iy + 1], [ix, iy + 1]];
      const heights = [bl, br, tr, tl];
      // The four edge crossings, spelled exactly as `contoursOf` spells them
      // so the band's boundary and the drawn line are one arithmetic.
      const lerp = (a, b) => (level - a) / (b - a);
      const edges = [
        [ix + lerp(bl, br), iy], // bottom, p0 → p1
        [ix + 1, iy + lerp(br, tr)], // right, p1 → p2
        [ix + lerp(tl, tr), iy + 1], // top, p2 → p3
        [ix, iy + lerp(bl, tl)], // left, p3 → p0
      ];
      const inside = heights.map(passes);
      const count = inside.filter(Boolean).length;
      if (count === 0) continue;
      if (count === 4) {
        cells.push(corners);
        continue;
      }
      if (count === 2 && inside[0] === inside[2] && inside[1] === inside[3]) {
        // The saddle, and the one case a clip cannot answer on its own: the
        // two passing corners are diagonal, and whether they join through the
        // middle or stand as two separate corners is exactly the question
        // `contoursOf` settles by the cell's own mean. Settled the same way
        // here, or the band would join ground the line keeps apart.
        const mean = (bl + br + tr + tl) / 4;
        const overJoined = mean > level;
        const joined = threshold.passesBelow ? !overJoined : overJoined;
        if (!joined) {
          for (const k of [0, 1, 2, 3]) {
            if (!inside[k]) continue;
            // The corner and its two own edge crossings: edge k leaves it and
            // edge k-1 arrives at it.
            cells.push([edges[(k + 3) % 4], corners[k], edges[k]]);
          }
          continue;
        }
      }
      // Sutherland–Hodgman against the level, which for every case but the
      // saddle is the region the marching square draws, by construction.
      const clipped = [];
      for (let k = 0; k < 4; k += 1) {
        const next = (k + 1) % 4;
        if (inside[k]) clipped.push(corners[k]);
        if (inside[k] !== inside[next]) clipped.push(edges[k]);
      }
      if (clipped.length > 2) cells.push(clipped);
    }
  }

  const segments = contoursOf(lattice, [level])[0]?.segments ?? [];
  // Which side the whole ground is on, where the line crosses none of it
  // (FR-007). A ground with measured positions on both sides and no crossing
  // — passing points whose neighbours were never measured — is neither, and
  // says so by carrying no sentence rather than by picking one.
  const wholly =
    segments.length || measured === 0
      ? null
      : passing === measured
        ? 'passing'
        : passing === 0
          ? 'failing'
          : null;
  return new PassingGround({ threshold, cells, segments, passing, measured, wholly });
}

/**
 * The four invariants, over the whole `READINGS × targets` cross product, at
 * module load.
 *
 * Gate 5 of the constitution's workflow, and the substance of this feature's
 * correctness. Every one of them throws naming the declarations on both sides,
 * so the message says what to fix rather than that something is wrong — and it
 * throws **here**, once, rather than on the frame a reader happens to plot the
 * offending reading on.
 */
{
  for (const reading of READINGS) {
    for (const { preset, target } of matchedTargets(reading)) {
      if (target.limit == null) continue;
      // Constructing it is the pass-side probe, so a comparator with no side
      // is refused at load rather than shading half a ground at draw time.
      new Threshold({ preset, target, reading });
    }
    // And that every reading gives one or the other, which is the lines-xor-
    // absence invariant asked of the roster rather than of a caller.
    thresholdsFor(reading);
  }
}
