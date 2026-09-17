/**
 * The parameter study: one control swept across its own face.
 *
 * A drag is authorship — every frame is the design. A sweep is a question: the
 * desk is solved at each position of one control, the model ends exactly where
 * it started, and the only thing that survives is the curve. This module holds
 * the part of that with no DOM and no engine in it, so the same Node script
 * that checks `applyModel` for idempotence can check the sampling too — and,
 * since the quantities moved here, what each sample is read *for* as well.
 */

import { END_USES } from './bill.js';
// The two declarations `model.js` also reads, kept in a leaf module of their own
// so that reading them there cannot close an import cycle. Re-exported here
// because this is where they are declared *about*: every importer that had
// them from `study.js` still does.
import { RunContents, VariableRequest } from './contents.js';
import { CHANNELS, CHANNEL_BY_ID, controlFor, labelFor } from './controls.js';
import { BUDGETS, withinBudget } from './copy.js';
import { readDemand, readExtremes, readOverheat, readPeaks } from './readings.js';
import { PRESETS } from './schemes.js';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  Category,
  CRITERIA,
  CRITERION_BY_ID,
  Criterion,
  readCriterionA,
  readCriterionB,
  readCriterionC,
} from './tm59.js';
import { kindFor, letter, unitIn } from './units.js';

export { RunContents, VariableRequest };

export const SWEEP_SAMPLES = 21;

/**
 * The first pass of an automatic refresh. Eleven is not arbitrary: the raw
 * positions for n = 11 are `min + (i/10)·span`, which are exactly the even
 * positions of the 21-point grid, and snapping is deterministic per value —
 * so the coarse set is a strict subset of the full set. Densifying a coarse
 * study to twenty-one points therefore costs only the ten new runs; the
 * eleven already solved come back as cache hits.
 */
export const COARSE_SAMPLES = 11;

/**
 * The order to solve a curve's samples in, as indices into `points`.
 *
 * Serial sweeps read left to right because nothing was drawn until the end.
 * With samples landing on a pool and the card redrawn per point, order is
 * what the reader sees: ends first, then the current desk value (the one
 * point shared with every other study and with the sheet's own solve, so it
 * is the likeliest cache hit), then the middle, then recursive midpoints —
 * the curve's silhouette stands after four points instead of emerging from
 * one edge.
 */
export function sampleOrder(points, current) {
  const n = points.length;
  if (n === 0) return [];
  const seen = new Set();
  const order = [];
  const take = (i) => {
    if (i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  };
  take(0);
  take(n - 1);
  // `samplePoints` keeps the current value in the list verbatim, so an exact
  // match exists whenever the caller passed the list it built; the nearest
  // index covers a caller sampling around a value the grid swallowed.
  let nearest = 0;
  for (let i = 1; i < n; i += 1) {
    if (Math.abs(points[i] - current) < Math.abs(points[nearest] - current)) nearest = i;
  }
  take(nearest);
  // Recursive bisection over index ranges, breadth-first, so detail arrives
  // evenly across the face rather than finishing one half before the other.
  const queue = [[0, n - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift();
    if (hi - lo < 2) continue;
    const mid = (lo + hi) >> 1;
    take(mid);
    queue.push([lo, mid], [mid, hi]);
  }
  return order;
}

/**
 * Whether a control has a face to sample along at all, as one sentence.
 *
 * Exported because a survey axis and a study subject are the same question
 * asked twice, and a second copy of the answer is how the two surfaces come to
 * refuse the same control for two different reasons — or, worse, how one of
 * them stops refusing it. `samplePoints` throws with this sentence, `axisFor`
 * in `survey.js` throws with this sentence, and the console greys an axis
 * offer with this sentence.
 *
 * A refusal rather than a boolean, for the reason every refusal on this sheet
 * is: Principle IV asks what would fix it, and "this is a `Pattern` and
 * carries no min" is a thing the reader can act on where `false` is not. Null
 * where the control can be swept, which is the same shape `refuses` in
 * `controls.js` already uses.
 */
export function refusesSweep(control) {
  for (const name of ['min', 'max', 'step']) {
    if (!Number.isFinite(control[name])) {
      return (
        `${control.key} is a ${control.kind} and carries no ${name}, so it has no face to ` +
        'sweep along. Only a control declaring min, max and step can be a study subject'
      );
    }
  }
  return null;
}

/**
 * Where to sample a control between its own min and max.
 *
 * Snapped to the step grid, because those are the only values the control can
 * actually hold — a curve through positions the slider cannot reach would be
 * lettering a desk that cannot exist. The current value is kept in the list
 * exactly as it is, not as its nearest gridded neighbour: the study's redline
 * tick stands on the current value, and the one point it must never miss is
 * the one under the tick. A coarse step legitimately collapses the list below
 * the asking count; fewer honest points beat twenty-one invented ones.
 *
 * **A control with no numeric face is refused here rather than sampled.** The
 * console never offers a Study on one — `buildPattern` and `buildDays` both
 * decline to register a row, and that map is what hangs a study card under a
 * control, so no button is drawn at all: the same silence a list of holidays
 * has always kept, and the honest one, since there is no offer to grey and no
 * legend line to grey it with. But silence in one surface is not a refusal in
 * the model. Handed a `Pattern`, the arithmetic below reads `undefined` for
 * `min`, `max` and `step`, and `Math.round(NaN)` is NaN, so a sweep of a daily
 * profile would come back as twenty-one NaN positions, mint twenty-one cache
 * keys, spend twenty-one engine runs and draw a card with nothing on it. That
 * is the silent shape of failure Principle IV exists to turn into a throw, so
 * the face a sweep needs is asserted before anything is computed. Twenty-four
 * hourly fractions are a shape rather than a position, and there is nothing
 * here to interpolate between.
 */
export function samplePoints(control, current, n = SWEEP_SAMPLES, { from = control.min, to = control.max } = {}) {
  const refusal = refusesSweep(control);
  if (refusal) throw new Error(`samplePoints: ${refusal}`);
  const { min, max, step } = control;
  // Snapped to the control's own grid, anchored at its own minimum even when
  // the span is narrower: a survey axis cut over part of a face has to land on
  // exactly the positions a study of the whole face does, or a densify and a
  // study stop sharing cache keys with nothing to say so.
  const grid = (v) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));

  const points = [];
  for (let i = 0; i < n; i += 1) points.push(grid(from + (i / (n - 1)) * (to - from)));
  // A null `current` is a stance outside the span: a caller who narrowed the
  // span past it has said so, and forcing it back in would widen the span.
  if (current !== null) points.push(current);
  points.sort((a, b) => a - b);

  // Snapping goes through floating point, so "the same position" can arrive as
  // two numbers a few ulps apart. Anything closer than a thousandth of a step
  // is one position, and when one of the pair is the current value, the
  // current value is the one that survives.
  const tol = step / 1000;
  const out = [];
  for (const v of points) {
    if (out.length && Math.abs(out[out.length - 1] - v) < tol) {
      if (v === current) out[out.length - 1] = current;
    } else {
      out.push(v);
    }
  }
  return out;
}

/* ══ what a sweep is read for ════════════════════════════════════════════ */

/**
 * Why every by-category criterion is on the roster twice, and what that does not
 * change about the drawing.
 *
 * It used to be on the roster once, at `COUNT_CATEGORY`, and the argument for
 * that was half sound. The sound half: Category II is what TM59:2026 names for
 * "all other dwellings" and is the category the sheet's own count is taken at,
 * so a curve read there could never disagree with the count beside it. The half
 * that was a scope decision rather than a finding: that lettering both still
 * leaves the reader to pick one. It does — and picking is the reader's to do. A
 * modeller assessing a care home has to meet Category I, and offering them one
 * figure read against a line 1 K above theirs left them judging a stricter line
 * by eye against a result computed for a different one.
 *
 * So both are declared, and the count does not move: `COUNT_CATEGORY` is still
 * Category II, `COUNT_SCOPE` still says so in full, and a Category I reading
 * still stands outside the count exactly as criterion c does.
 *
 * **The pen argument survives intact, because it was never about the choice.**
 * The desk has one pen pair, `--warm` against `--cold`, reserved for signed
 * physical quantities — the rail's watts, TEDI against CEDI, the summer peak
 * against the winter low. Two exceedance shares are neither signed nor a pair,
 * so drawing them in that pair would spend the one encoding this page has for
 * direction on two readings that have none. Nothing here draws two: a study
 * plots one reading and a ground is cut for one. That a survey may letter a
 * second reading's figures *under* the first is the same arrangement it already
 * had for every other pair on the roster, and it spends no hue either.
 */

/**
 * The temperature the `overheat` quantity counts hours above.
 *
 * Named because it is a *qualifier* on the reading and not just an argument:
 * Passivhaus and EnerPHit both publish "≤ 10 % of the hours above 25 °C", and
 * the survey matches their targets to this reading by comparing `target.above`
 * against this constant. Written inline as a bare `25` at the one call site it
 * had, a target published above some other temperature would have matched the
 * metric and drawn a line the reading does not answer — which is the quiet
 * failure the survey's load-time qualifier assertion exists to refuse, and it
 * cannot refuse what the reading will not state.
 */
export const OVERHEAT_ABOVE = 25;

const request = (name, frequency = 'Hourly', key = '*') =>
  new VariableRequest({ name, frequency, key });

/** One line a quantity draws when its reading carries one or more outcomes. */
export class QuantitySeries {
  constructor({ id, label, pen = null, select = (reading) => reading, format = null }) {
    if (!id || !label) throw new Error('a quantity series needs an id and label');
    if (pen !== null && pen !== '--warm' && pen !== '--cold') {
      throw new Error(`the quantity series "${id}" declares unknown pen "${pen}"`);
    }
    if (typeof select !== 'function') throw new Error(`the quantity series "${id}" declares no selector`);
    if (format !== null && typeof format !== 'function') {
      throw new Error(`the quantity series "${id}" formatter is not a function or null`);
    }
    this.id = id;
    this.label = label;
    this.pen = pen;
    this.select = select;
    this.format = format;
    Object.freeze(this);
  }
}

/** One aggregate outcome, or a declared pair of outcomes, a study may draw. */
export class Quantity {
  constructor({
    id,
    label,
    unit,
    quantityKind,
    digits,
    needs,
    context = null,
    read,
    pen = null,
    series = null,
    meterScope = null,
    wholeYear = false,
    priced = null,
    movedBy = [],
    criterion = null,
    category = null,
  }) {
    if (!id || !label || !unit) throw new Error(`the study quantity "${id || '(unnamed)'}" lacks its identity or lettering`);
    if (!Number.isInteger(digits) || digits < 0) {
      throw new Error(`the study quantity "${id}" declares ${digits} digits; digits must be a non-negative integer`);
    }
    // What the curve measures, which decides how it letters in IP. Validated
    // here beside `unit` and `digits` because those three are one statement
    // about a quantity, and a kind resolved at draw time would fail on a card
    // rather than at the declaration that is wrong.
    const kind = kindFor(quantityKind, `the study quantity "${id}"`, unit);
    if (!(needs instanceof RunContents) || needs.empty) {
      throw new Error(`the study quantity "${id}" declares no run contents, so no run can answer it`);
    }
    if (context !== null && typeof context !== 'function') {
      throw new Error(`the study quantity "${id}" context is not a function or null`);
    }
    if (typeof read !== 'function') {
      throw new Error(`the study quantity "${id}" declares no reader, so a finished sample has nothing to be`);
    }
    if (pen !== null && pen !== '--warm' && pen !== '--cold') {
      throw new Error(`the study quantity "${id}" declares unknown pen "${pen}"`);
    }
    if (meterScope !== null && meterScope !== 'building' && meterScope !== 'all') {
      throw new Error(`the study quantity "${id}" declares unknown meter scope "${meterScope}"`);
    }
    if (priced !== null && priced !== 'cost' && priced !== 'carbon') {
      throw new Error(`the study quantity "${id}" declares unknown priced field "${priced}"`);
    }
    if (!Array.isArray(movedBy) || movedBy.some((key) => typeof key !== 'string' || !key)) {
      throw new Error(`the study quantity "${id}" declares movedBy as something other than a list of control keys`);
    }
    // Which criterion this reading answers, and at which of that criterion's
    // categories. The whole declarations rather than an id or a letter, for the
    // reason `Target` refuses a bare category: a truthy string standing in for a
    // category nobody declared is one careless comparison away from a line drawn
    // across a ground that does not answer it, and both categories publish the
    // same limit, so nothing downstream would look wrong.
    if (criterion !== null && !(criterion instanceof Criterion)) {
      throw new Error(
        `the study quantity "${id}" carries a criterion that is not one of TM59's declared ones, ` +
          `but ${String(criterion?.id ?? criterion)}`,
      );
    }
    if (category !== null && !(category instanceof Category)) {
      throw new Error(
        `the study quantity "${id}" carries a category that is not one of TM59's declared pair, ` +
          `but ${String(category?.label ?? category)}`,
      );
    }
    // A category belongs to a criterion, and which criteria have one is the
    // method's statement rather than ours. Asserted per declaration here and
    // over the whole roster below: this half catches the declaration that is
    // wrong, that half catches the one that is missing.
    if (category !== null && criterion === null) {
      throw new Error(
        `the study quantity "${id}" is read at ${category.label} and names no criterion, and a category ` +
          'is a property of a criterion rather than of a reading',
      );
    }
    if (criterion !== null && criterion.byCategory !== (category !== null)) {
      throw new Error(
        criterion.byCategory
          ? `the study quantity "${id}" answers ${criterion.label}, which TM59 states at each of its two ` +
            'categories, and names none — a figure read against one of two lines 1 K apart cannot say which'
          : `the study quantity "${id}" answers ${criterion.label} at ${category.label}, and TM59 states ` +
            'one line for both categories there, so a reading of it carries no category to narrow',
      );
    }
    const lines = series ?? [new QuantitySeries({ id, label, pen })];
    if (!Array.isArray(lines) || !lines.length || lines.some((line) => !(line instanceof QuantitySeries))) {
      throw new Error(`the study quantity "${id}" needs at least one declared series`);
    }
    if (new Set(lines.map((line) => line.id)).size !== lines.length) {
      throw new Error(`the study quantity "${id}" declares the same series twice`);
    }
    this.id = id;
    this.label = label;
    this.unit = unit;
    this.quantityKind = kind;
    this.digits = digits;
    this.needs = needs;
    this.context = context;
    this.read = read;
    this.pen = pen;
    this.series = Object.freeze([...lines]);
    this.meterScope = meterScope;
    this.wholeYear = Boolean(wholeYear);
    this.priced = priced;
    // The priced controls that can move this reading, and only those. A Plant
    // or Tariff face is applied to the bill after the run, so it reaches a
    // reading only through `computeBill`'s arithmetic, and that arithmetic is
    // narrow: every other reading on the roster is taken before it starts.
    // Declared rather than derived, and checked against the real bill by the
    // reach harness, so a study of efficiency against demand is refused by a
    // declaration instead of drawn as a flat line that reads as a finding.
    this.movedBy = Object.freeze(new Set(movedBy));
    this.criterion = criterion;
    this.category = category;
    Object.freeze(this);
  }

  /**
   * One value of this quantity, lettered in the system showing.
   *
   * On the quantity rather than at the surfaces that draw it, for the reason
   * `Instant.say` is on the instant: the study card and the survey's own
   * readings letter the same quantity, and written out at both they were a copy
   * with a difference — the exact drift `Reading` avoids by taking its unit and
   * precision off the quantity rather than declaring them again.
   */
  say(value) {
    return letter(this.quantityKind, value, { digits: this.digits, unit: this.unit });
  }

  /**
   * How this quantity's unit reads on its own, in the system showing.
   *
   * The chooser letters the unit beside the quantity's name rather than beside
   * a figure, so it needs the unit half by itself — the same getter `Target`,
   * `BillColumn` and survey's `Reading` carry. Without it the chooser said
   * `°C` under a curve whose own ends read `°F`.
   */
  get unitNow() {
    return unitIn(this.quantityKind, this.unit);
  }
}

/** One quantity measured against the desk as it stands, never stored. */
export class Offer {
  constructor({ quantity, available, reason = null, fix = null, unit = quantity.unit }) {
    if (!(quantity instanceof Quantity)) throw new Error('an offer must carry a declared Quantity');
    if (Boolean(available) === Boolean(reason || fix)) {
      throw new Error(`the offer for "${quantity.id}" must carry either availability or a reason and fix`);
    }
    if (!available && (!reason || !fix)) {
      throw new Error(`the unavailable offer for "${quantity.id}" needs both a reason and a fix`);
    }
    this.quantity = quantity;
    this.available = Boolean(available);
    this.reason = reason;
    this.fix = fix;
    this.unit = unit;
    Object.freeze(this);
  }

  /**
   * How this offer's unit reads beside the quantity's name, in the system
   * showing.
   *
   * Through `unitIn` rather than through the quantity, because an offer may
   * carry a unit the quantity did not: the priced ones substitute the tariff's
   * own currency code. `unitIn` is exactly the rule that wants — it honours a
   * declared string on an identity kind, which `currency` is, and returns the
   * kind's own for anything that converts. The chooser used to letter `unit`
   * raw, so it said `°C` beside a curve whose ends read `°F`.
   */
  get unitNow() {
    return unitIn(this.quantity.quantityKind, this.unit);
  }
}

export class PricingStatus {
  constructor({ available, reason = null, fix = null }) {
    if (Boolean(available) === Boolean(reason || fix)) {
      throw new Error('a pricing status must carry either availability or a reason and fix');
    }
    if (!available && (!reason || !fix)) throw new Error('an unavailable pricing status needs a reason and fix');
    this.available = Boolean(available);
    this.reason = reason;
    this.fix = fix;
    Object.freeze(this);
  }
}

export class PricingAvailability {
  constructor({ currency, cost, carbon }) {
    if (!currency || !(cost instanceof PricingStatus) || !(carbon instanceof PricingStatus)) {
      throw new Error('pricing availability needs a currency and cost/carbon statuses');
    }
    this.currency = currency;
    this.cost = cost;
    this.carbon = carbon;
    Object.freeze(this);
  }
}

const ZONE_AIR = request('Zone Mean Air Temperature');
const OPERATIVE = request('Zone Operative Temperature');
const OCCUPANCY = request('Schedule Value', 'Hourly', 'Occupancy');
const SYSTEM_TRANSFER = request('Zone Air Heat Balance System Air Transfer Rate');
const meterFor = (id) => {
  const use = END_USES.find((candidate) => candidate.id === id);
  if (!use) throw new Error(`no end use is declared as "${id}"`);
  return use.meter;
};

const EXTREMES = new RunContents({ variables: [ZONE_AIR] });
const ANNUAL_EXTREMES = new RunContents({ variables: [ZONE_AIR], annual: true });
const DEMAND = new RunContents({
  variables: [ZONE_AIR],
  meters: [meterFor('heating'), meterFor('cooling')],
  annual: true,
  channels: ['system'],
});
const BILL = new RunContents({ variables: [ZONE_AIR], annual: true });
const PEAKS = new RunContents({ variables: [ZONE_AIR, SYSTEM_TRANSFER], channels: ['system'] });
const TM59_AB = new RunContents({
  variables: [ZONE_AIR, OPERATIVE, OCCUPANCY],
  annual: true,
  channels: ['gains'],
  season: true,
});
const TM59_B = new RunContents({ variables: [ZONE_AIR, OPERATIVE], annual: true, season: true });

const finite = (value) => (Number.isFinite(value) ? value : null);
const fieldFrom = (reader, field) => (landed, options) =>
  finite(reader(landed.eso, options?.built?.floorArea)?.[field]);
const criterionValue = (reading) => finite(reading?.value);
const completeBillTotal = (bill, field) => {
  if (!bill?.lines.length || bill.lines.some((line) => !Number.isFinite(line[field]))) return null;
  return finite(bill.total(field));
};

/** Resolve a declaration's variable and meter needs against the channels this desk can produce. */
export function contentsFor(quantity, channels = []) {
  if (!(quantity instanceof Quantity)) throw new Error('contentsFor expected a declared Quantity');
  const engaged = new Set(channels);
  const scopedMeters = quantity.meterScope
    ? END_USES.filter((use) => quantity.meterScope === 'all' || use.group === 'building')
        .filter((use) => !use.needs || engaged.has(use.needs))
        .map((use) => use.meter)
    : [];
  return new RunContents({
    variables: quantity.needs.variables,
    meters: [...quantity.needs.meters, ...scopedMeters],
    tables: quantity.needs.tables,
    annual: quantity.needs.annual,
    channels: quantity.needs.channels,
    season: quantity.needs.season,
  });
}

/** The plant faces, which divide delivered energy before anything is priced. */
const PLANT_REACH = Object.freeze(['heatEfficiency', 'heatCOP', 'coolCOP']);

export const QUANTITIES = Object.freeze([
  new Quantity({
    id: 'extremes', label: 'High + low zone temperature', unit: '°C', quantityKind: 'temperature', digits: 1, needs: EXTREMES,
    read: (landed) => {
      const reading = readExtremes(landed.eso);
      return reading ? Object.freeze(reading) : null;
    },
    series: [
      new QuantitySeries({ id: 'high', label: 'High', pen: '--warm', select: (reading) => reading?.high }),
      new QuantitySeries({ id: 'low', label: 'Low', pen: '--cold', select: (reading) => reading?.low }),
    ],
  }),
  new Quantity({
    id: 'demand', label: 'Heating + cooling demand', unit: 'kWh/m²·yr', quantityKind: 'energyIntensity', digits: 1, needs: DEMAND,
    wholeYear: true,
    read: (landed, options) => {
      const reading = readDemand(landed.eso, options?.built?.floorArea);
      return reading ? Object.freeze(reading) : null;
    },
    series: [
      new QuantitySeries({ id: 'tedi', label: 'TEDI', pen: '--warm', select: (reading) => reading?.tedi }),
      new QuantitySeries({ id: 'cedi', label: 'CEDI', pen: '--cold', select: (reading) => reading?.cedi }),
    ],
  }),
  new Quantity({
    id: 'eui', label: 'Energy use intensity', unit: 'kWh/m²·yr', quantityKind: 'energyIntensity', digits: 1, needs: BILL,
    meterScope: 'building',
    // `Bill.intensity('metered')` is delivered energy over the plant's divisor
    // (`divisorFor` in `bill.js`: the heating option's efficiency or COP, and
    // the cooling COP), taken before any rate is applied. So the three plant
    // faces move it and no price or grid factor can.
    movedBy: PLANT_REACH,
    wholeYear: true,
    read: (landed) => finite(landed.bill?.wholeYear ? landed.bill.intensity('metered') : null),
  }),
  new Quantity({
    id: 'cost', label: 'Cost', unit: 'local currency', quantityKind: 'currency', digits: 1, needs: BILL,
    meterScope: 'all',
    priced: 'cost',
    // `metered × costRate`, where `assume` in `rates.js` puts the two prices
    // into the cost rates and nowhere else.
    movedBy: [...PLANT_REACH, 'elecPrice', 'gasPrice'],
    read: (landed) => {
      const value = completeBillTotal(landed.bill, 'cost');
      return value === null ? null : Object.freeze({ value, currency: landed.bill.currency });
    },
    series: [
      new QuantitySeries({
        id: 'cost',
        label: 'Cost',
        select: (reading) => reading?.value,
        format: (value, reading) => reading.currency.format(value, Math.abs(value) < 100 ? 2 : 0),
      }),
    ],
  }),
  new Quantity({
    id: 'carbon', label: 'Carbon', unit: 'kgCO₂e', quantityKind: 'carbonMass', digits: 1, needs: BILL,
    meterScope: 'all',
    priced: 'carbon',
    // `metered × carbonRate / 1000`, where `assume` puts the grid intensity
    // into the electricity carbon rate only. Prices never reach it.
    movedBy: [...PLANT_REACH, 'gridFactor'],
    read: (landed) => completeBillTotal(landed.bill, 'carbon'),
  }),
  new Quantity({
    // The label off the constant the reader is read at, not beside it: the two
    // said 25 twice, and a reading whose name and whose threshold could part
    // company is one the survey's qualifier would go on matching in silence.
    id: 'overheat', label: `Hours above ${OVERHEAT_ABOVE} °C`, unit: '% of the year', quantityKind: 'count', digits: 1, needs: ANNUAL_EXTREMES,
    wholeYear: true,
    read: (landed) => finite(readOverheat(landed.eso, OVERHEAT_ABOVE)),
  }),
  new Quantity({
    // `fluxDensity`, not `powerDensity`, though both letter W/m² in SI: a peak
    // load is quoted in Btu/h·ft² wherever IP is read, and a lighting allowance
    // in W/ft². Two kinds for one SI string is the whole reason the roster
    // carries both.
    id: 'peakHeat', label: 'Peak heating load', unit: 'W/m²', quantityKind: 'fluxDensity', digits: 1, needs: PEAKS, pen: '--warm',
    read: fieldFrom(readPeaks, 'peakHeat'),
  }),
  new Quantity({
    id: 'peakCool', label: 'Peak cooling load', unit: 'W/m²', quantityKind: 'fluxDensity', digits: 1, needs: PEAKS, pen: '--cold',
    read: fieldFrom(readPeaks, 'peakCool'),
  }),
  new Quantity({
    // The four by-category readings are declared as two pairs rather than
    // generated from `CRITERIA × CATEGORIES`, and the loop was considered. It
    // would hide everything that actually differs between them: criterion a
    // needs the occupancy series and the running mean and criterion b needs
    // neither, so they carry different `RunContents` and different `context`;
    // and the two Category II ids are `tm59a` and `tm59b` by history rather
    // than by rule, since a reading id is a value inside a shared link and
    // renaming one would quietly refuse every survey link ever sent at it.
    // Four declarations, and the invariant below is what holds them to the
    // method instead.
    id: 'tm59a', label: `${CRITERION_BY_ID.a.label} · ${CATEGORY_BY_ID.II.label}`,
    unit: CRITERION_BY_ID.a.unit, quantityKind: 'count', digits: 1, needs: TM59_AB,
    criterion: CRITERION_BY_ID.a, category: CATEGORY_BY_ID.II,
    context: (desk) => ({ trm: desk.runningMean, floor: desk.occupiedFloor }),
    read: (landed, { context }) => criterionValue(readCriterionA(landed.eso, context.trm, CATEGORY_BY_ID.II, context.floor)),
  }),
  new Quantity({
    id: 'tm59aI', label: `${CRITERION_BY_ID.a.label} · ${CATEGORY_BY_ID.I.label}`,
    // Unit, kind and precision off the same criterion its Category II pair
    // reads, so the two cannot come to letter one criterion two ways. Only the
    // category differs, and it is the whole difference: Category I's adaptive
    // line runs 1 K below Category II's, and the published limit is the same
    // 3 % either side of it.
    unit: CRITERION_BY_ID.a.unit, quantityKind: 'count', digits: 1, needs: TM59_AB,
    criterion: CRITERION_BY_ID.a, category: CATEGORY_BY_ID.I,
    context: (desk) => ({ trm: desk.runningMean, floor: desk.occupiedFloor }),
    read: (landed, { context }) => criterionValue(readCriterionA(landed.eso, context.trm, CATEGORY_BY_ID.I, context.floor)),
  }),
  new Quantity({
    id: 'tm59b', label: `${CRITERION_BY_ID.b.label} · ${CATEGORY_BY_ID.II.label}`,
    unit: CRITERION_BY_ID.b.unit, quantityKind: 'count', digits: 0, needs: TM59_B,
    criterion: CRITERION_BY_ID.b, category: CATEGORY_BY_ID.II,
    read: (landed) => criterionValue(readCriterionB(landed.eso, CATEGORY_BY_ID.II)),
  }),
  new Quantity({
    id: 'tm59bI', label: `${CRITERION_BY_ID.b.label} · ${CATEGORY_BY_ID.I.label}`,
    unit: CRITERION_BY_ID.b.unit, quantityKind: 'count', digits: 0, needs: TM59_B,
    criterion: CRITERION_BY_ID.b, category: CATEGORY_BY_ID.I,
    // 26 °C rather than 27 °C, off the category rather than written here: the
    // night limit is fixed per category and `readCriterionB` takes it from the
    // declaration, which is why this reader differs from its pair by one
    // argument and nothing else.
    read: (landed) => criterionValue(readCriterionB(landed.eso, CATEGORY_BY_ID.I)),
  }),
  new Quantity({
    id: 'tm59c', label: CRITERION_BY_ID.c.label, unit: CRITERION_BY_ID.c.unit, quantityKind: 'count', digits: 1, needs: TM59_AB,
    // No category, and `Criterion.byCategory` is what says so: 26 °C is the line
    // at both, so there is nothing here for a category to narrow and the
    // constructor refuses one.
    criterion: CRITERION_BY_ID.c,
    context: (desk) => ({ floor: desk.occupiedFloor }),
    read: (landed, { context }) => criterionValue(readCriterionC(landed.eso, context.floor)),
  }),
]);

export const QUANTITY_BY_ID = Object.freeze(Object.fromEntries(QUANTITIES.map((quantity) => [quantity.id, quantity])));

export const OPENING_QUANTITY_BASIS = Object.freeze({
  // Lettered after "Opened here:" on the study card, so each is held to a
  // standing message's fifteen words with that prefix counted.
  demand: 'A weather year with System in, so the opening question is thermal demand.',
  tm59a: 'Chasing TM59, and this run can answer criterion a.',
  extremes: 'No annual system or TM59 chase, so the question is zone temperature range.',
});

/** The legacy inference retained once as an opening guess, never as live state. */
export function openingQuantity({ annual, system, chasingTm59, gains, season, runningMean }) {
  if (annual && system) return QUANTITY_BY_ID.demand;
  if (chasingTm59 && annual && gains && season && runningMean) return QUANTITY_BY_ID.tm59a;
  return QUANTITY_BY_ID.extremes;
}

/**
 * Everything any declared quantity could ever ask a run for.
 *
 * `QUANTITIES` is frozen at module load, so this union is a constant and is
 * taken once rather than twice per call: `offersFor` runs from `partialStudy`
 * on every landed sample of every study, and two unions of eleven declarations
 * per call is arithmetic that cannot have changed since the page mounted.
 */
const EVERY_NEED = RunContents.union(QUANTITIES.map((quantity) => quantity.needs));

/**
 * A reading's label set inside a sentence: lower-cased, unless it opens on an
 * acronym, because "tEDI" and "hours above 25 °c" are nobody's spelling.
 */
export const inSentence = (label) => (/^[A-Z]{2,}\b/.test(label) ? label : label[0].toLowerCase() + label.slice(1));

/** "a", "a or b", "a, b or c". */
const either = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);

const declaredQuantity = (quantity, caller) => {
  if (!QUANTITIES.includes(quantity)) {
    throw new Error(`${caller}: expected a declared study quantity, not ${quantity?.id ?? String(quantity)}`);
  }
};

/**
 * Why a priced control cannot be swept for this reading, or null where it can.
 *
 * One sentence for the study card, the survey chooser, the ground and the
 * survey link (FR-006), built from the declarations rather than written per
 * pair, so the 54 refused pairings cannot come to give 54 slightly different
 * reasons. Null for any control that shapes the run, whatever the reading: a
 * shaping control that happens not to move a reading has been measured not to,
 * which is a finding, where a price that cannot move demand is arithmetic.
 *
 * A face whose kind is money is called a price here, because its label is the
 * fuel's ("Electricity"), and a fuel is not what is applied after the run.
 */
export function refusesPairing(key, quantity) {
  declaredQuantity(quantity, 'refusesPairing');
  const { channel } = controlFor(key); // throws naming an unowned key
  if (!channel.prices || quantity.movedBy.has(key)) return null;
  return `${subjectOf(key)} is applied after the run and cannot move ${inSentence(quantity.label)}.`;
}

function subjectOf(key) {
  const { control } = controlFor(key);
  return control.quantityKind?.id === 'money' ? `${labelFor(key)} price` : labelFor(key);
}

/** The fix beside a refused pairing: every reading this priced control can move. */
export function pairingFix(key) {
  const { channel } = controlFor(key);
  if (!channel.prices) throw new Error(`pairingFix: "${key}" shapes the run, so no pairing of it is ever refused`);
  const moved = QUANTITIES.filter((quantity) => quantity.movedBy.has(key));
  if (!moved.length) throw new Error(`pairingFix: "${key}" moves no declared reading`);
  return `Choose ${either(moved.map((quantity) => inSentence(quantity.label)))}.`;
}

/** All declared quantities measured against current run capabilities. */
export function offersFor({
  annual = false,
  wholeYear = false,
  season = false,
  channels = [],
  pricing = null,
  // The study's own control, when the offers are for one card. Its pairing
  // refusal is asked after every other refusal, so a reading that also wants a
  // weather file says so first: the weather file is the first thing to fix.
  key = null,
} = {}) {
  const engaged = new Set(channels);
  const possible = new RunContents({
    variables: EVERY_NEED.variables,
    meters: EVERY_NEED.meters,
    tables: true,
    annual,
    season,
    channels: engaged,
  });
  return QUANTITIES.map((quantity) => {
    const missingChannel = quantity.needs.channels.find((channel) => !engaged.has(channel));
    if (missingChannel) {
      const label = CHANNEL_BY_ID[missingChannel]?.name ?? missingChannel;
      return new Offer({
        quantity,
        available: false,
        reason: `Patch ${label} in; ${quantity.label.toLowerCase()} needs that channel's output.`,
        fix: `Patch ${label} in.`,
      });
    }
    if (quantity.needs.annual && !annual) {
      return new Offer({
        quantity,
        available: false,
        reason: `Attach a weather file; ${quantity.label.toLowerCase()} is a year's quantity.`,
        fix: 'Attach a weather file.',
      });
    }
    if (quantity.wholeYear && !wholeYear) {
      return new Offer({
        quantity,
        available: false,
        reason: `${quantity.label} needs all twelve months, and this run covers only part of the year.`,
        fix: 'Put all twelve months back on the Run strip.',
      });
    }
    if (quantity.needs.season && !season) {
      return new Offer({
        quantity,
        available: false,
        reason: `Run some of May to September; ${quantity.label.toLowerCase()} is a summer quantity.`,
        fix: 'Include at least one month from May to September.',
      });
    }
    const resolved = contentsFor(quantity, channels);
    if (quantity.meterScope && !resolved.meters.length) {
      const paths = quantity.meterScope === 'building' ? 'System or Gains' : 'System, Gains, or Grounds';
      return new Offer({
        quantity,
        available: false,
        reason: `${quantity.label} has no producible meter on this desk.`,
        fix: `Patch ${paths} in.`,
      });
    }
    if (quantity.priced) {
      const status = pricing?.[quantity.priced];
      if (!(status instanceof PricingStatus)) {
        throw new Error(`offersFor: the priced quantity "${quantity.id}" has no pricing status`);
      }
      if (!status.available) {
        return new Offer({ quantity, available: false, reason: status.reason, fix: status.fix });
      }
    }
    const pairing = key === null ? null : refusesPairing(key, quantity);
    if (pairing) return new Offer({ quantity, available: false, reason: pairing, fix: pairingFix(key) });
    return new Offer({
      quantity,
      available: possible.answers(quantity.needs),
      unit: quantity.priced === 'cost' ? pricing.currency : quantity.unit,
    });
  });
}

/** Refuse a roster containing a quantity no supplied reachable desk can offer. */
export function assertQuantityReachability(quantities, reachableOffers) {
  for (const quantity of quantities) {
    const offer = reachableOffers.find((candidate) => candidate.quantity === quantity);
    if (!offer?.available) {
      const reason = offer ? `${offer.reason} ${offer.fix}` : 'no reachable desk evaluated it';
      throw new Error(`the study quantity "${quantity.id}" is unreachable: ${reason}`);
    }
  }
}

{
  const seen = new Set();
  for (const quantity of QUANTITIES) {
    if (seen.has(quantity.id)) throw new Error(`two study quantities are declared as "${quantity.id}"`);
    seen.add(quantity.id);
    for (const channel of quantity.needs.channels) {
      if (!CHANNEL_BY_ID[channel]) {
        throw new Error(`the study quantity "${quantity.id}" needs unknown channel "${channel}"`);
      }
    }
  }

  // The roster against the method, which is the invariant this feature rests on.
  //
  // The constructor already refuses a declaration that disagrees with
  // `Criterion.byCategory` one at a time. This is the other half, and it catches
  // the opposite error: not a reading declared wrong, but a reading *missing*.
  // For a year the roster carried criterion a and criterion b at Category II
  // alone, which is a perfectly consistent set of declarations and was still
  // wrong — a reader assessing a care home had no way to ask for the category
  // their project has to meet. Nothing could have thrown, because nothing
  // compared the roster against the method it names.
  //
  // Stated over the criteria the roster answers rather than over all four TM59
  // states: criterion d is read by nobody and deliberately so (this model holds
  // no communal circulation for it), and requiring it here would be this
  // assertion deciding a question of scope.
  const byCriterion = new Map();
  for (const quantity of QUANTITIES) {
    if (!quantity.criterion) continue;
    if (!byCriterion.has(quantity.criterion)) byCriterion.set(quantity.criterion, []);
    byCriterion.get(quantity.criterion).push(quantity);
  }
  for (const [criterion, quantities] of byCriterion) {
    const wanted = criterion.byCategory ? CATEGORIES : [null];
    for (const category of wanted) {
      const found = quantities.filter((quantity) => quantity.category === category);
      if (found.length === 1) continue;
      const at = category ? ` at ${category.label}` : '';
      throw new Error(
        `the roster carries ${found.length} readings of ${criterion.label}${at}, and TM59 states it ` +
          `${criterion.byCategory ? `at each of ${CATEGORIES.map((c) => c.label).join(' and ')}` : 'once, for both categories'}` +
          `. The roster has ${quantities.map((q) => q.id).join(', ')}`,
      );
    }
  }

  // Reach, both ways round. A key named in `movedBy` must be a priced face a
  // sweep can walk, or the pairing refusal would be keyed on a control that is
  // never offered; and every priced face must be named somewhere, or a new
  // Tariff face would be refused against every reading on the roster, which
  // is a study nobody could ever draw. And only a bill reading may be moved:
  // anything else is read off the run before the plant or tariff is applied.
  for (const quantity of QUANTITIES) {
    if (quantity.movedBy.size && quantity.needs !== BILL) {
      throw new Error(
        `the study quantity "${quantity.id}" declares priced controls that move it, and does not read the bill`,
      );
    }
    for (const key of quantity.movedBy) {
      const { channel, control } = controlFor(key); // throws naming an unowned key
      if (!channel.prices) {
        throw new Error(
          `the study quantity "${quantity.id}" is moved by "${key}", which shapes the run; ` +
            'movedBy names only priced faces, since a shaping control is measured, never refused',
        );
      }
      if (refusesSweep(control)) {
        throw new Error(`the study quantity "${quantity.id}" is moved by "${key}", which has no face to sweep`);
      }
    }
  }
  for (const channel of CHANNELS.filter((candidate) => candidate.prices)) {
    for (const control of channel.controls) {
      if (refusesSweep(control)) continue;
      if (!QUANTITIES.some((quantity) => quantity.movedBy.has(control.key))) {
        throw new Error(
          `the priced face "${control.key}" moves no study quantity, so every study of it would be refused`,
        );
      }
    }
  }

  // Every priced pairing, once: refused with a sentence that stands in view, or
  // drawn. Six sweepable priced faces against thirteen readings is 78, of which
  // twelve draw — the three plant faces against the three bill readings, and
  // each tariff face against the one reading it prices — and the count is
  // asserted so a reach declaration widened by accident fails here rather than
  // as a curve that should have been refused. The figures moved from 66 and 54
  // when TM59's two by-category criteria went onto the roster at both
  // categories: neither new reading declares `movedBy`, so all twelve of the new
  // pairings are refused, and both numbers rose by the same twelve.
  let refusedPairings = 0;
  let pairings = 0;
  for (const channel of CHANNELS.filter((candidate) => candidate.prices)) {
    for (const control of channel.controls) {
      if (refusesSweep(control)) continue;
      for (const quantity of QUANTITIES) {
        pairings += 1;
        const sentence = refusesPairing(control.key, quantity);
        if (sentence === null) continue;
        refusedPairings += 1;
        withinBudget(BUDGETS.STANDING, `pairing ${control.key} × ${quantity.id}`, sentence);
      }
      withinBudget(BUDGETS.STANDING, `pairing fix ${control.key}`, pairingFix(control.key));
    }
  }
  if (pairings !== 78 || refusedPairings !== 66) {
    throw new Error(
      `${refusedPairings} of ${pairings} priced pairings are refused, where the reach table refuses 66 of 78`,
    );
  }

  const targetIds = new Set(PRESETS.flatMap((preset) => preset.targets.map((target) => target.metric)));
  const declaredIds = new Set(
    QUANTITIES.flatMap((quantity) => [quantity.id, ...quantity.series.map((series) => series.id)]),
  );
  const nonTargets = new Set(['extremes', 'demand', 'high', 'low', 'cost', 'carbon']);
  for (const id of targetIds) {
    if (!declaredIds.has(id)) throw new Error(`the target metric "${id}" has no study quantity declaration`);
  }
  for (const quantity of QUANTITIES) {
    if (!targetIds.has(quantity.id) && !nonTargets.has(quantity.id)) {
      throw new Error(`the study quantity "${quantity.id}" is neither a target metric nor a declared non-target outcome`);
    }
  }

  // A target's metric against its category, which is the one place this can be
  // silently wrong.
  //
  // `metric` names the reading that answers a line, and `category` says which of
  // TM59's two the line is read at. With a reading per category those are two
  // statements of one fact, and the failure they permit is the worst kind this
  // sheet has: both categories clear criterion a at 3 % of occupied hours and
  // criterion b at four nights, so a Category I target left pointing at the
  // Category II reading draws its line across that ground at exactly the right
  // height. Nothing looks wrong. The ground simply answers a criterion the line
  // does not describe, and a reader assessing a care home reads a pass off it.
  //
  // It lives here rather than in `schemes.js` for an import reason worth
  // recording: this module reads `PRESETS`, so `schemes.js` cannot read the
  // roster back without closing a cycle. Here both sides are in hand, and it
  // sits beside the assertion above that already holds a metric to a declared
  // reading.
  for (const preset of PRESETS) {
    for (const target of preset.targets) {
      const quantity = QUANTITY_BY_ID[target.metric];
      if (!quantity) continue; // a series-level metric; the assertion above owns those
      if (target.category === quantity.category) continue;
      throw new Error(
        `the target "${preset.id} · ${target.id}" is read at ${target.category?.label ?? 'no category'} and ` +
          `answers "${quantity.id}", which is read at ${quantity.category?.label ?? 'no category'}. Both of ` +
          "TM59's categories publish the same limit, so this line would be drawn at the right height across a " +
          'ground that does not answer it',
      );
    }
  }

  const forward = RunContents.union(QUANTITIES.map((quantity) => quantity.needs)).serialize();
  const reverse = RunContents.union([...QUANTITIES].reverse().map((quantity) => quantity.needs)).serialize();
  if (forward !== reverse) throw new Error('RunContents union order changes its canonical serialization');

  const available = new PricingStatus({ available: true });
  assertQuantityReachability(
    QUANTITIES,
    offersFor({
      annual: true,
      wholeYear: true,
      season: true,
      channels: CHANNELS.map((channel) => channel.id),
      pricing: new PricingAvailability({ currency: 'USD', cost: available, carbon: available }),
    }),
  );
}
