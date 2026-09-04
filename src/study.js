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
import { CHANNELS, CHANNEL_BY_ID } from './controls.js';
import { readDemand, readExtremes, readOverheat, readPeaks } from './readings.js';
import { PRESETS } from './schemes.js';
import { COUNT_CATEGORY, CRITERION_BY_ID, readCriterionA, readCriterionB, readCriterionC } from './tm59.js';

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
export function samplePoints(control, current, n = SWEEP_SAMPLES) {
  const { min, max, step } = control;
  for (const [name, value] of [['min', min], ['max', max], ['step', step]]) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `samplePoints: ${control.key} is a ${control.kind} and carries no ${name}, so it has no face to ` +
          'sweep along. Only a control declaring min, max and step can be a study subject',
      );
    }
  }
  const grid = (v) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));

  const points = [];
  for (let i = 0; i < n; i += 1) points.push(grid(min + (i / (n - 1)) * (max - min)));
  points.push(current);
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
 * The category the criterion curve is read at, and why there is only one of it.
 *
 * `COUNT_CATEGORY` is Category II, and `tm59.js` sets out the argument there:
 * it is the category TM59:2026 names for "all other dwellings", it is the one
 * the sheet's own count is taken at, and lettering every combination still
 * leaves the reader to pick one. Taken from that constant rather than restated,
 * so the curve and the count can never disagree about which line the reading
 * was judged against.
 *
 * There is a second reason not to draw both lines, and it belongs to the
 * drawing rather than to the method: the desk has exactly one pen pair,
 * `--warm` against `--cold`, and it is reserved for signed physical quantities
 * — the rail's watts, TEDI against CEDI, the summer peak against the winter
 * low. Two exceedance shares are neither signed nor a pair, so drawing them in
 * that pair would spend the one encoding this page has for direction on two
 * readings that have none. Category I is read on the sheet, beside Category II
 * and saying what it presumes, which is where a reader can act on it.
 */
export const TM59_STUDY_CATEGORY = COUNT_CATEGORY;

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
    digits,
    needs,
    context = null,
    read,
    pen = null,
    series = null,
    meterScope = null,
    wholeYear = false,
    priced = null,
  }) {
    if (!id || !label || !unit) throw new Error(`the study quantity "${id || '(unnamed)'}" lacks its identity or lettering`);
    if (!Number.isInteger(digits) || digits < 0) {
      throw new Error(`the study quantity "${id}" declares ${digits} digits; digits must be a non-negative integer`);
    }
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
    this.digits = digits;
    this.needs = needs;
    this.context = context;
    this.read = read;
    this.pen = pen;
    this.series = Object.freeze([...lines]);
    this.meterScope = meterScope;
    this.wholeYear = Boolean(wholeYear);
    this.priced = priced;
    Object.freeze(this);
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

export const QUANTITIES = Object.freeze([
  new Quantity({
    id: 'extremes', label: 'High + low zone temperature', unit: '°C', digits: 1, needs: EXTREMES,
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
    id: 'demand', label: 'Heating + cooling demand', unit: 'kWh/m²·yr', digits: 1, needs: DEMAND,
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
    id: 'eui', label: 'Energy use intensity', unit: 'kWh/m²·yr', digits: 1, needs: BILL,
    meterScope: 'building',
    wholeYear: true,
    read: (landed) => finite(landed.bill?.wholeYear ? landed.bill.intensity('metered') : null),
  }),
  new Quantity({
    id: 'cost', label: 'Cost', unit: 'local currency', digits: 1, needs: BILL,
    meterScope: 'all',
    priced: 'cost',
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
    id: 'carbon', label: 'Carbon', unit: 'kgCO₂e', digits: 1, needs: BILL,
    meterScope: 'all',
    priced: 'carbon',
    read: (landed) => completeBillTotal(landed.bill, 'carbon'),
  }),
  new Quantity({
    id: 'overheat', label: 'Hours above 25 °C', unit: '% of the year', digits: 1, needs: ANNUAL_EXTREMES,
    wholeYear: true,
    read: (landed) => finite(readOverheat(landed.eso, 25)),
  }),
  new Quantity({
    id: 'peakHeat', label: 'Peak heating load', unit: 'W/m²', digits: 1, needs: PEAKS, pen: '--warm',
    read: fieldFrom(readPeaks, 'peakHeat'),
  }),
  new Quantity({
    id: 'peakCool', label: 'Peak cooling load', unit: 'W/m²', digits: 1, needs: PEAKS, pen: '--cold',
    read: fieldFrom(readPeaks, 'peakCool'),
  }),
  new Quantity({
    id: 'tm59a', label: `${CRITERION_BY_ID.a.label} · ${TM59_STUDY_CATEGORY.label}`,
    unit: CRITERION_BY_ID.a.unit, digits: 1, needs: TM59_AB,
    context: (desk) => ({ trm: desk.runningMean, floor: desk.occupiedFloor }),
    read: (landed, { context }) => criterionValue(readCriterionA(landed.eso, context.trm, TM59_STUDY_CATEGORY, context.floor)),
  }),
  new Quantity({
    id: 'tm59b', label: `${CRITERION_BY_ID.b.label} · ${TM59_STUDY_CATEGORY.label}`,
    unit: CRITERION_BY_ID.b.unit, digits: 0, needs: TM59_B,
    read: (landed) => criterionValue(readCriterionB(landed.eso, TM59_STUDY_CATEGORY)),
  }),
  new Quantity({
    id: 'tm59c', label: CRITERION_BY_ID.c.label, unit: CRITERION_BY_ID.c.unit, digits: 1, needs: TM59_AB,
    context: (desk) => ({ floor: desk.occupiedFloor }),
    read: (landed, { context }) => criterionValue(readCriterionC(landed.eso, context.floor)),
  }),
]);

export const QUANTITY_BY_ID = Object.freeze(Object.fromEntries(QUANTITIES.map((quantity) => [quantity.id, quantity])));

export const OPENING_QUANTITY_BASIS = Object.freeze({
  demand: 'A weather year and System are both in the path, so the opening question is thermal demand.',
  tm59a: 'The desk is chasing TM59 and its seasonal occupied run can answer criterion a.',
  extremes: 'Without an annual system or a TM59 chase, the opening question is the zone temperature range.',
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

/** All declared quantities measured against current run capabilities. */
export function offersFor({
  annual = false,
  wholeYear = false,
  season = false,
  channels = [],
  pricing = null,
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
