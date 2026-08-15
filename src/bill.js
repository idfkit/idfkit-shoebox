import { Absent, isRate } from './rates.js';

/**
 * The bill: what the building bought, what it cost and what it emitted.
 *
 * This is a quantity survey, not a dashboard. Every figure is `quantity × rate
 * = amount`, the three columns of any priced schedule, and the interface draws
 * all three rather than the answer alone -- an architect who cannot see the
 * rate cannot argue with the amount, and arguing with the amount is the whole
 * point of putting it on the sheet.
 *
 * Two conversions happen here and both are stated in the drawing rather than
 * hidden in it:
 *
 *   1. The engine meters energy in joules at the zone boundary. Ideal loads
 *      report as `DistrictHeatingWater` and `DistrictCooling`, which is heat
 *      *delivered* at a notional 100 % efficiency -- there is no boiler and no
 *      compressor anywhere in this model.
 *   2. So the plant that would have to supply that heat is applied here, as a
 *      seasonal efficiency or a coefficient of performance. That is a priced
 *      assumption, not a simulated one, and the schedule prints the division so
 *      it can be checked.
 *
 * The rest -- lighting, equipment, exterior lighting -- is metered electricity
 * and needs no conversion at all.
 */

/* ══ fuels ═══════════════════════════════════════════════════════════════ */

export class Fuel {
  constructor({ id, label, meterLabel }) {
    this.id = id;
    this.label = label;
    // What arrives at the building, as the meter that measures it would be
    // labelled: an architect reads "at the electricity meter", not "electricity
    // final energy demand".
    this.meterLabel = meterLabel;
    Object.freeze(this);
  }
}

export const ELECTRICITY = new Fuel({ id: 'electricity', label: 'Electricity', meterLabel: 'At the electricity meter' });
export const GAS = new Fuel({ id: 'gas', label: 'Natural gas', meterLabel: 'At the gas meter' });
export const FUELS = Object.freeze([ELECTRICITY, GAS]);

/* ══ the plant ═══════════════════════════════════════════════════════════ */

/**
 * How delivered heat becomes a fuel someone is billed for.
 *
 * `divisor` is what the delivered kilowatt-hours are divided by, whether that
 * is a combustion efficiency below one or a heat pump's coefficient of
 * performance above it. Keeping them one field rather than two is not a
 * shortcut: they are the same arithmetic, and the schedule letters the divisor
 * with the name the architect set it under.
 */
export class PlantOption {
  constructor({ value, label, fuel, key, noun }) {
    this.value = value;
    this.label = label;
    this.fuel = fuel;
    // Which parameter carries the divisor, because a boiler is set by an
    // efficiency and a heat pump by a COP and they need different ranges.
    this.key = key;
    this.noun = noun;
    Object.freeze(this);
  }
}

export const HEAT_SOURCES = Object.freeze([
  new PlantOption({ value: 'GasBoiler', label: 'Gas boiler', fuel: GAS, key: 'heatEfficiency', noun: 'seasonal efficiency' }),
  new PlantOption({ value: 'Resistance', label: 'Direct electric', fuel: ELECTRICITY, key: 'heatEfficiency', noun: 'seasonal efficiency' }),
  new PlantOption({ value: 'HeatPump', label: 'Heat pump', fuel: ELECTRICITY, key: 'heatCOP', noun: 'seasonal COP' }),
]);

const heatSourceFor = (params) =>
  HEAT_SOURCES.find((o) => o.value === params.heatSource) ?? HEAT_SOURCES[0];

/* ══ end uses ════════════════════════════════════════════════════════════ */

/**
 * One line of the bill, and the meter it is read off.
 *
 * The meter names are the ones EnergyPlus itself lists in `eplusout.mdd` for
 * this model, read out of a run rather than typed from memory -- they drift
 * between versions, and `Heating:DistrictHeatingWater` was `Heating:DistrictHeating`
 * not many releases ago.
 *
 * `needs` names the channel that has to be in the path for the meter to exist
 * at all. A bypassed channel's meter is not requested, so the engine is never
 * asked for a series it cannot produce.
 */
export class EndUse {
  constructor({ id, label, meter, needs = null, plant = false, note = null, group = 'building' }) {
    this.id = id;
    this.label = label;
    this.meter = meter;
    this.needs = needs;
    // Which subtotal this falls under. A priced schedule is sectioned, and the
    // section here is the one an energy statement uses: what the building does,
    // then what the site does around it. It is not presentation. The Grounds
    // strip's 5.25 kW of astronomical-clock lighting -- inherited from the
    // stock example, now engaged by choice -- is 23 MWh a year against the
    // building's 18: left in one undivided total it would swamp every envelope
    // decision on the desk and the sheet would report that the way to save
    // carbon here is to turn off the car park. True, and useless. Sectioned,
    // both facts survive.
    this.group = group;
    // Delivered heat or coolth, which has to go through the plant before it is
    // a fuel. The others are already at the meter.
    this.plant = plant;
    this.note = note;
    Object.freeze(this);
  }

  /** The fuel this use is billed in, once the plant is known. */
  fuelFor(params) {
    if (this.id === 'heating') return heatSourceFor(params).fuel;
    return ELECTRICITY;
  }

  /** What the delivered quantity is divided by to reach the meter. */
  divisorFor(params) {
    if (this.id === 'heating') {
      const option = heatSourceFor(params);
      return { value: params[option.key], noun: option.noun, label: option.label };
    }
    if (this.id === 'cooling') {
      return { value: params.coolCOP, noun: 'seasonal COP', label: 'Electric chiller' };
    }
    return null;
  }
}

export const END_USES = Object.freeze([
  new EndUse({ id: 'heating', label: 'Heating', meter: 'Heating:DistrictHeatingWater', needs: 'system', plant: true }),
  new EndUse({ id: 'cooling', label: 'Cooling', meter: 'Cooling:DistrictCooling', needs: 'system', plant: true }),
  new EndUse({ id: 'lighting', label: 'Interior lighting', meter: 'InteriorLights:Electricity', needs: 'gains' }),
  new EndUse({ id: 'equipment', label: 'Equipment', meter: 'InteriorEquipment:Electricity', needs: 'gains' }),
  new EndUse({ id: 'exterior', label: 'Grounds lighting', meter: 'ExteriorLights:Electricity', needs: 'grounds', group: 'site' }),
]);

/** The sections of the schedule, in the order they are billed. */
export const GROUPS = Object.freeze([
  Object.freeze({ id: 'building', label: 'Building', note: 'Everything inside the envelope on the drawing.' }),
  Object.freeze({ id: 'site', label: 'Site', note: 'Outside the envelope, and outside the intensity above.' }),
]);

/* ══ reading a meter ═════════════════════════════════════════════════════ */

/**
 * Total one meter over the run, working around a parser that mislabels them.
 *
 * `@idfkit/engine` exports `parseMTR`, but it is `parseESO` under another name
 * and the ESO dictionary grammar does not fit a meter. A variable is declared
 * `id,count,KEY,Name [units] !Freq` and a meter is declared without the key,
 * `id,count,Name [units] !Freq`, so the parser reads the meter's name into
 * `keyValue` and leaves `variableName` empty. Worse, a monthly meter's line
 * carries a `[Value,Min,Day,Hour,Minute,Max,Day,Hour,Minute]` tail whose commas
 * split it further, and an hourly meter's line has only three fields, which is
 * below the parser's minimum of four and drops the meter from the dictionary
 * altogether.
 *
 * What survives all of that is the identifier and the data: the reader keys
 * series by leading integer and never consults the name, so the numbers and
 * their timestamps are right. Only the labelling is wrong, and it is wrong in a
 * recoverable way. So the name is recovered from `keyValue` here rather than
 * the frequency changed to dodge the bug -- hourly would be 8,760 points for a
 * figure only ever read as a sum, and monthly is the one frequency that both
 * survives the parse and draws the year.
 *
 * If a later release parses meters properly this whole function collapses to a
 * `findVariables` call, which is why it is one function and not a habit spread
 * through the file.
 */
export function meterTotal(eso, name, environments = null) {
  const points = within(meterPoints(eso, name), environments);
  return points?.length ? points.reduce((total, p) => total + p.value, 0) : null;
}

/**
 * Only the environments being billed.
 *
 * An annual run is not one environment but three: the two sizing days run
 * first, and the meters accumulate straight through all of them. Summed
 * whole, a year's bill would carry forty-eight hours of the most extreme
 * weather in the file on top of the year -- about half a percent on the
 * heating, more on the cooling, and entirely invisible. Every reading on this
 * sheet is already per environment for the same reason; the meters are no
 * different.
 */
const within = (points, environments) =>
  !points || !environments ? points : points.filter((p) => environments.has(p.timestamp.environmentIndex));

/**
 * The name a meter is hiding under, or null when this is an ordinary variable.
 *
 * A meter arrives with its units and frequency still stuck to its name inside
 * `keyValue`, because the parser expected a key field there and a meter has
 * none. That shape -- `something [units] !Frequency` -- is what identifies it;
 * `variableName` cannot be trusted, since for a monthly meter it holds the
 * wreckage of the `[Value,Min,Day,...]` tail.
 */
function meterName(variable) {
  const found = /^(.+?)\s*\[[^\]]*\]\s*!/.exec(variable.keyValue ?? '');
  return found ? found[1].trim() : null;
}

function meterPoints(eso, name) {
  if (!eso) return null;
  const wanted = name.toLowerCase();
  for (const [id, variable] of eso.variables) {
    if (meterName(variable)?.toLowerCase() !== wanted) continue;
    return eso.timeSeries.get(id)?.data ?? [];
  }
  return null;
}

/**
 * The same meter, month by month, for the year's profile.
 *
 * Returned against the calendar rather than in report order, because a run
 * period that starts in April must not draw April at the left-hand end.
 */
export function meterMonths(eso, name, environments = null) {
  const points = within(meterPoints(eso, name), environments);
  if (!points?.length) return null;
  const months = new Array(12).fill(null);
  for (const p of points) {
    const m = p.timestamp.month - 1;
    if (m >= 0 && m < 12) months[m] = (months[m] ?? 0) + p.value;
  }
  return months;
}

/* ══ the bill ════════════════════════════════════════════════════════════ */

// Exported because the study's demand intensities read the same meters; two
// hand-typed conversions would be one more place for a factor to go stale.
export const J_TO_KWH = 1 / 3_600_000;

/**
 * One priced line.
 *
 * `cost` and `carbon` are null rather than zero wherever the rate behind them
 * was absent. Zero is a measurement -- an end use that genuinely emitted
 * nothing -- and the two must never print the same way or sum the same way.
 */
export class BillLine {
  constructor({ use, fuel, delivered, metered, divisor, cost, carbon, costRate, carbonRate }) {
    this.use = use;
    this.fuel = fuel;
    this.delivered = delivered;
    this.metered = metered;
    this.divisor = divisor;
    this.cost = cost;
    this.carbon = carbon;
    this.costRate = costRate;
    this.carbonRate = carbonRate;
    Object.freeze(this);
  }
}

/**
 * The whole schedule, as one frozen reading.
 *
 * `scope` is the part that stops the bill lying. The meters accumulate over
 * whatever was simulated, and what was simulated is very often two design days
 * -- forty-eight hours chosen for being extreme. Multiplying that up to a year
 * would be the single most dishonest thing this sheet could print, so the bill
 * reports the period it actually covers and says so in its own head.
 */
export class Bill {
  constructor({ lines, hours, floorArea, card, annual, partial }) {
    this.lines = Object.freeze(lines);
    this.hours = hours;
    this.floorArea = floorArea;
    this.card = card;
    this.annual = annual;
    // Some line could not be priced, so the totals are of what could be.
    this.partial = partial;
    Object.freeze(this);
  }

  get currency() {
    return this.card.currency;
  }

  /** Sum one column, skipping the lines with nothing behind them. */
  total(field, group = null) {
    const rows = group ? this.lines.filter((l) => l.use.group === group) : this.lines;
    const found = rows.filter((l) => Number.isFinite(l[field]));
    return found.length ? found.reduce((a, l) => a + l[field], 0) : null;
  }

  /**
   * Per square metre of floor, which is the number an architect compares with.
   *
   * Of the building section only. An energy use intensity that included the
   * grounds lighting would not be comparable with any published benchmark, and
   * comparing against a benchmark is the entire reason the figure is quoted per
   * square metre rather than in kilowatt-hours.
   */
  intensity(field) {
    const t = this.total(field, 'building');
    return t == null || !(this.floorArea > 0) ? null : t / this.floorArea;
  }

  /** The lines of one section, in declaration order. */
  section(group) {
    return this.lines.filter((l) => l.use.group === group);
  }

  /** Metered energy by fuel, for the meter-head rows. */
  get byFuel() {
    return FUELS.map((fuel) => {
      const lines = this.lines.filter((l) => l.fuel === fuel && l.metered > 0);
      if (!lines.length) return null;
      const sum = (field) => {
        const found = lines.filter((l) => Number.isFinite(l[field]));
        return found.length === lines.length ? found.reduce((a, l) => a + l[field], 0) : null;
      };
      return {
        fuel,
        metered: lines.reduce((a, l) => a + l.metered, 0),
        cost: sum('cost'),
        carbon: sum('carbon'),
        costRate: lines[0].costRate,
        carbonRate: lines[0].carbonRate,
      };
    }).filter(Boolean);
  }

  /** The lines that carry something, largest first on the given column. */
  ranked(field) {
    return this.lines
      .filter((l) => Number.isFinite(l[field]) && l[field] > 0)
      .sort((a, b) => b[field] - a[field]);
  }

  /**
   * Where cost and carbon disagree about what matters.
   *
   * The whole argument for putting both on one schedule: gas is cheap and
   * dirty, grid electricity is dear and getting clean, so the end use worth
   * designing out is not always the expensive one. Reported as the line whose
   * rank moves furthest between the two orderings, and only when it moves.
   */
  get divergence() {
    const byCost = this.ranked('cost');
    const byCarbon = this.ranked('carbon');
    if (byCost.length < 2 || byCost.length !== byCarbon.length) return null;
    let worst = null;
    for (const [i, line] of byCost.entries()) {
      const j = byCarbon.indexOf(line);
      const shift = i - j;
      if (shift > 0 && (!worst || shift > worst.shift)) worst = { line, shift, cost: i, carbon: j };
    }
    return worst;
  }
}

/**
 * Read the meters and price them.
 *
 * `series` is a lookup from meter name to the joules it accumulated over the
 * environment being billed; the caller does the reading, because which
 * environment counts is a question about the run rather than about the bill.
 */
export function computeBill({ series, params, card, floorArea, hours, engaged, annual }) {
  const lines = [];
  let partial = false;

  for (const use of END_USES) {
    if (use.needs && !engaged.has(use.needs)) continue;
    const joules = series.get(use.meter);
    if (!Number.isFinite(joules)) continue;

    const delivered = joules * J_TO_KWH;
    const divisor = use.divisorFor(params);
    const metered = divisor ? delivered / divisor.value : delivered;
    const fuel = use.fuelFor(params);

    const costRate = fuel === GAS ? card.gas : card.electricity;
    const carbonRate = fuel === GAS ? card.gasFactor : card.grid;
    if (costRate instanceof Absent || carbonRate instanceof Absent) partial = true;

    lines.push(
      new BillLine({
        use,
        fuel,
        delivered,
        metered,
        divisor,
        costRate,
        carbonRate,
        cost: isRate(costRate) ? metered * costRate.value : null,
        // Factors are published per kWh in grams; the bill is kept in kilograms
        // because a year of a small building is tonnes, not megagrams of grams.
        carbon: isRate(carbonRate) ? (metered * carbonRate.value) / 1000 : null,
      }),
    );
  }

  return new Bill({ lines, hours, floorArea, card, annual, partial });
}
