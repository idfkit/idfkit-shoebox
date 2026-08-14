import {
  CA_ELECTRICITY,
  CA_GAS,
  COUNTRY_NAME,
  EU_ELECTRICITY,
  EU_GAS,
  GRID_INTENSITY,
  GRID_INTENSITY_YEAR,
  PERIODS,
  US_ELECTRICITY,
  US_GAS,
} from './rates.data.js';

/**
 * What a kilowatt-hour costs and what it emits, where anyone has published it.
 *
 * Five datasets, all open, all dated, none of them global. That last fact is
 * the one this module is arranged around: the station picker reaches every
 * corner of the TMYx archive and the published tariffs do not follow it there.
 * So a rate is either resolved and carries its citation, or it is absent and
 * carries the reason -- never a world average standing in for a country, and
 * never last year's number quietly reused. The bill letters an absent rate as
 * an em dash and leaves that fuel out of every total, which is the same rule
 * the weather picker follows when a DDY cannot be read.
 *
 * Everything here is a rate per kWh at the meter, in the currency of the
 * dataset it came from. Converting between currencies would need a rate of
 * exchange, which is a fifth published number with a fifth date on it, and the
 * bill would then be quoting a figure no supplier ever sent anyone.
 */

/* ══ what a number came from ═════════════════════════════════════════════ */

/**
 * A published dataset, named the way a drawing names its reference documents.
 *
 * Every rate carries one. A figure on the bill whose source cannot be named is
 * a figure that should not be on the bill.
 */
export class Source {
  constructor({ id, publisher, kind, short, dataset, period, licence, url }) {
    this.id = id;
    this.publisher = publisher;
    // What kind of number this is, in the reader's terms rather than the
    // publisher's. Every price table here is non-residential, but each agency
    // has its own word for that -- the EIA says commercial, Eurostat says
    // non-household, StatCan says other industries -- and a bill that never
    // states the sector leaves an architect to guess whether they are looking
    // at what the building will be charged or at what a house is charged. It
    // is set beside the rate, not left in the reference line.
    this.kind = kind;
    // Enough to tell two datasets from the same publisher apart in one line of
    // references. "US EIA" twice is not a citation, it is a shrug.
    this.short = short;
    this.dataset = dataset;
    this.period = period;
    this.licence = licence;
    this.url = url;
    Object.freeze(this);
  }

  /** Publisher and period, which is what fits in the margin beside a rate. */
  get cite() {
    return `${this.publisher} · ${this.period}`;
  }
}

export const SOURCES = Object.freeze({
  grid: new Source({
    id: 'grid',
    kind: 'Grid carbon intensity',
    publisher: 'Our World in Data',
    short: 'Our World in Data, carbon intensity of electricity, from Ember',
    dataset: 'Carbon intensity of electricity generation, from Ember',
    // The vintage is per country and is stated against the figure itself, so
    // quoting the range across all 213 of them here would only blur it.
    period: 'latest year per country',
    licence: 'CC BY 4.0',
    url: 'https://ourworldindata.org/grapher/carbon-intensity-electricity',
  }),
  euElectricity: new Source({
    id: 'euElectricity',
    kind: 'Non-household tariff',
    publisher: 'Eurostat',
    short: 'Eurostat nrg_pc_205, non-household electricity',
    dataset: 'nrg_pc_205 — electricity prices for non-household consumers, 20–499 MWh/yr, excluding recoverable taxes',
    period: PERIODS.euElectricity,
    licence: 'CC BY 4.0',
    url: 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_205',
  }),
  euGas: new Source({
    id: 'euGas',
    kind: 'Non-household tariff',
    publisher: 'Eurostat',
    short: 'Eurostat nrg_pc_203, non-household gas',
    dataset: 'nrg_pc_203 — gas prices for non-household consumers, under 1 000 GJ/yr, excluding recoverable taxes',
    period: PERIODS.euGas,
    licence: 'CC BY 4.0',
    url: 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_203',
  }),
  usElectricity: new Source({
    id: 'usElectricity',
    kind: 'Commercial tariff',
    publisher: 'US EIA',
    short: 'EIA Electric Power Monthly 5.6.B, commercial electricity',
    dataset: 'Electric Power Monthly table 5.6.B — average commercial retail price by state',
    period: PERIODS.usElectricity,
    licence: 'Public domain',
    url: 'https://www.eia.gov/electricity/monthly/',
  }),
  usGas: new Source({
    id: 'usGas',
    kind: 'Commercial tariff',
    publisher: 'US EIA',
    short: 'EIA natural gas sold to commercial consumers',
    dataset: 'Natural gas price sold to commercial consumers by state, twelve-month mean',
    period: PERIODS.usGas,
    licence: 'Public domain',
    url: 'https://www.eia.gov/dnav/ng/ng_pri_sum_dcu_nus_m.htm',
  }),
  caElectricity: new Source({
    id: 'caElectricity',
    kind: 'Commercial and institutional tariff',
    publisher: 'Statistics Canada',
    short: 'StatCan 25-10-0021, electricity sold to other industries',
    dataset: 'Table 25-10-0021 — revenue over energy sold to "other industries", which is the commercial and institutional class',
    period: PERIODS.caElectricity,
    licence: 'Statistics Canada Open Licence',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510002101',
  }),
  caGas: new Source({
    id: 'caGas',
    kind: 'Commercial tariff',
    publisher: 'Statistics Canada',
    short: 'StatCan 25-10-0086, commercial natural gas',
    dataset: 'Table 25-10-0086 — dollars over gigajoules of commercial consumption, twelve-month mean',
    period: PERIODS.caGas,
    licence: 'Statistics Canada Open Licence',
    url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2510008601',
  }),
  assumed: new Source({
    id: 'assumed',
    kind: 'Assumed rate',
    publisher: 'Set on the Tariff strip',
    short: 'assumed on the Tariff strip',
    dataset: 'Assumed on the desk, not published anywhere',
    period: 'assumed',
    licence: null,
    url: null,
  }),
  combustion: new Source({
    id: 'combustion',
    kind: 'Combustion constant',
    publisher: 'IPCC',
    short: 'IPCC 2006 Guidelines, natural gas combustion',
    dataset: '2006 Guidelines vol. 2 table 1.4 — natural gas, 56.1 kg CO₂/GJ net calorific value',
    period: '2006',
    licence: 'IPCC',
    url: 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html',
  }),
});

/* ══ a resolved rate ═════════════════════════════════════════════════════ */

export class Currency {
  constructor({ code, symbol, minor }) {
    this.code = code;
    this.symbol = symbol;
    // Where the symbol sits relative to the figure, which is not a detail a
    // bill may get wrong: $12.40 and 12,40 € are both correct and neither is
    // correct in the other's place.
    this.minor = minor;
    Object.freeze(this);
  }

  format(value, digits = 2) {
    // Grouped, like every other quantity on the sheet. An annual bill runs to
    // five figures and `10033 €` is a number you have to count the digits of.
    const n = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const sign = value < 0 ? '−' : '';
    return this.code === 'EUR' ? `${sign}${n} ${this.symbol}` : `${sign}${this.symbol}${n}`;
  }
}

export const EUR = new Currency({ code: 'EUR', symbol: '€', minor: 'c' });
export const USD = new Currency({ code: 'USD', symbol: '$', minor: '¢' });
// Its own object rather than a second name for USD, so that `comparable()`
// refuses to difference a scheme priced in Winnipeg against one priced in
// Minneapolis. The two currencies print the same and are not the same.
export const CAD = new Currency({ code: 'CAD', symbol: '$', minor: '¢' });

/**
 * One published number, with everything needed to defend it.
 *
 * `region` is the geography the figure actually describes, which is very often
 * larger than the site: a national grid mean is the honest answer for a
 * building in Denver, and saying "United States" rather than "Denver" is what
 * stops it being read as something more local than it is.
 */
export class Rate {
  constructor({ value, unit, currency = null, source, region }) {
    this.value = value;
    this.unit = unit;
    this.currency = currency;
    this.source = source;
    this.region = region;
    Object.freeze(this);
  }

  /** The rate as it reads in the build-up column, e.g. `$0.1296/kWh`. */
  get text() {
    return this.currency
      ? `${this.currency.format(this.value, 4)}/kWh`
      : `${this.value.toFixed(0)} ${this.unit}`;
  }
}

/**
 * A rate that could not be found, and why.
 *
 * Carried rather than thrown, because one missing tariff must not take the
 * rest of the bill down with it: a site with no published gas price still has
 * an electricity bill and still has a carbon figure.
 */
export class Absent {
  constructor({ what, reason }) {
    this.what = what;
    this.reason = reason;
    Object.freeze(this);
  }
}

export const isRate = (x) => x instanceof Rate;

/* ══ resolution ══════════════════════════════════════════════════════════ */

// Natural gas at 56.1 kg CO₂ per GJ of net calorific value. A kilowatt-hour is
// 0.0036 GJ, so the factor per kWh is 56.1 × 0.0036 × 1000 g.
const GAS_G_PER_KWH = 56.1 * 0.0036 * 1000;

/** A country's name in English, or its code where the dataset has no name for it. */
export const countryName = (iso3) => COUNTRY_NAME[iso3] ?? iso3;

/**
 * Whether the European tables were ever going to have an answer for this place.
 *
 * The difference matters in the refusal. "Eurostat publishes no gas price for
 * Japan" is true and useless -- it reads as though a dataset let the reader
 * down, when in fact no dataset was ever consulted. Saying which geographies
 * these tables cover tells them the actual shape of the gap.
 */
const inEurope = (iso3) => iso3 in EU_ELECTRICITY || iso3 in EU_GAS;

/**
 * The handful of country names that take a definite article in a sentence.
 *
 * The dataset lists bare names, which are right in a table column and wrong in
 * prose: "nothing is published for United Kingdom" is the sort of lettering
 * that makes a reader trust the rest of the sheet slightly less.
 */
const TAKES_THE = /^(United |Netherlands|Philippines|Bahamas|Gambia|Maldives|Comoros|Seychelles|Democratic Republic|Central African|Dominican Republic|Czech Republic|Republic of|Ivory Coast|Isle of Man|Cayman|Falkland|Marshall|Solomon|Turks)/;

export const placeName = (place) => (TAKES_THE.test(place) ? `the ${place}` : place);

const uncovered = (what, place) =>
  new Absent({
    what,
    reason: `These tables cover the United States and Canada by state and province and Europe by country, and nothing in them is published for ${placeName(place)}.`,
  });

/**
 * Everything the bill needs to price one site, resolved once per station.
 *
 * Held as a frozen object rather than looked up per line, because a bill whose
 * lines could each resolve differently would be a bill nobody could audit.
 */
export class RateCard {
  constructor({ site, currency, electricity, gas, grid, gasFactor }) {
    this.site = site;
    this.currency = currency;
    this.electricity = electricity;
    this.gas = gas;
    this.grid = grid;
    this.gasFactor = gasFactor;
    Object.freeze(this);
  }

  /** Every rate this card could not find, for the note under the bill. */
  get absences() {
    return [this.electricity, this.gas, this.grid, this.gasFactor].filter((r) => r instanceof Absent);
  }

  /** The distinct datasets actually used, for the reference line. */
  get sources() {
    const found = new Map();
    for (const rate of [this.electricity, this.gas, this.grid, this.gasFactor]) {
      if (isRate(rate)) found.set(rate.source.id, rate.source);
    }
    return [...found.values()];
  }
}

/**
 * Price and carbon for one station.
 *
 * The US tables are keyed by state and the European ones by country, so the
 * two are tried in that order: a state price is the more local of the two and
 * there is no country row for the United States in Eurostat to fall back to
 * anyway. Everything outside those two geographies gets an `Absent` naming the
 * country it could not price, which is a far more useful thing to read than a
 * number that came from somewhere else.
 */
export function resolveRates(station) {
  if (!station) {
    const reason = 'No weather location chosen, so there is no country to price against.';
    return new RateCard({
      site: null,
      currency: USD,
      electricity: new Absent({ what: 'Electricity tariff', reason }),
      gas: new Absent({ what: 'Gas tariff', reason }),
      grid: new Absent({ what: 'Grid carbon intensity', reason }),
      gasFactor: gasFactorRate(),
    });
  }

  const iso3 = station.country;
  const place = countryName(iso3);
  const us = iso3 === 'USA';
  const ca = iso3 === 'CAN';
  const currency = us ? USD : ca ? CAD : EUR;

  // North America is priced by state or province, Europe by country, because
  // that is the grain each statistical agency publishes at -- and a province is
  // the right grain for Canada, where Alberta's gas is a quarter the price of
  // Nova Scotia's and Nunavut's electricity is ten times Alberta's.
  if (us || ca) {
    const table = us ? US_ELECTRICITY : CA_ELECTRICITY;
    const gasTable = us ? US_GAS : CA_GAS;
    const agency = us ? 'The EIA table' : 'The StatCan table';
    const region = `${station.state}, ${place}`;
    return new RateCard({
      site: place,
      currency,
      electricity: rateFrom(table[station.state], {
        unit: 'per kWh', currency, source: us ? SOURCES.usElectricity : SOURCES.caElectricity, region,
        what: 'Electricity tariff',
        reason: `${agency} carries no commercial electricity price for ${station.state}.`,
      }),
      gas: rateFrom(gasTable[station.state], {
        unit: 'per kWh', currency, source: us ? SOURCES.usGas : SOURCES.caGas, region,
        what: 'Gas tariff',
        reason: `${agency} carries no commercial gas price for ${station.state}, where little or no gas is distributed.`,
      }),
      grid: gridRate(iso3, place),
      gasFactor: gasFactorRate(),
    });
  }

  if (!inEurope(iso3)) {
    return new RateCard({
      site: place,
      currency,
      electricity: uncovered('Electricity tariff', place),
      gas: uncovered('Gas tariff', place),
      grid: gridRate(iso3, place),
      gasFactor: gasFactorRate(),
    });
  }

  const electricity = rateFrom(EU_ELECTRICITY[iso3], {
    unit: 'per kWh', currency: EUR, source: SOURCES.euElectricity, region: place,
    what: 'Electricity tariff',
    reason: `Eurostat publishes no non-household electricity price for ${placeName(place)}.`,
  });

  const gas = rateFrom(EU_GAS[iso3], {
    unit: 'per kWh', currency: EUR, source: SOURCES.euGas, region: place,
    what: 'Gas tariff',
    reason: `Eurostat publishes no non-household gas price for ${placeName(place)}.`,
  });

  return new RateCard({
    site: place,
    currency,
    electricity,
    gas,
    grid: gridRate(iso3, place),
    gasFactor: gasFactorRate(),
  });
}

const gridRate = (iso3, place) =>
  Number.isFinite(GRID_INTENSITY[iso3])
    ? new Rate({
        value: GRID_INTENSITY[iso3],
        unit: 'gCO₂e/kWh',
        source: SOURCES.grid,
        region: `${place}, ${GRID_INTENSITY_YEAR[iso3]} national mean`,
      })
    : new Absent({
        what: 'Grid carbon intensity',
        reason: `Our World in Data carries no electricity intensity for ${placeName(place)}.`,
      });

/**
 * The card with the desk's own assumptions written over it.
 *
 * The Tariff strip exists because the published rate is the least durable
 * number on the sheet: a building outlives its tariff and very comfortably
 * outlives the grid it was designed against, so an architect has to be able to
 * ask what this scheme looks like at 30 cents, or at 50 gCO₂e/kWh. An assumed
 * rate is still a rate and still carries a source -- it just says the source
 * was you, which is exactly what the bill then prints.
 */
export function assume(card, params) {
  const swap = (published, value, unit, currency) =>
    new Rate({ value, unit, currency, source: SOURCES.assumed, region: 'Set on the Tariff strip' });

  const priced = params.rateBasis === 'Assumed';
  const factored = params.factorBasis === 'Assumed';
  if (!priced && !factored) return card;

  return new RateCard({
    site: card.site,
    currency: card.currency,
    electricity: priced ? swap(card.electricity, params.elecPrice, 'per kWh', card.currency) : card.electricity,
    gas: priced ? swap(card.gas, params.gasPrice, 'per kWh', card.currency) : card.gas,
    grid: factored ? swap(card.grid, params.gridFactor, 'gCO₂e/kWh', null) : card.grid,
    // Burning gas emits what burning gas emits. There is no assumption to
    // make here and offering one would only invite a wrong answer.
    gasFactor: card.gasFactor,
  });
}

const gasFactorRate = () =>
  new Rate({
    value: GAS_G_PER_KWH,
    unit: 'gCO₂e/kWh',
    source: SOURCES.combustion,
    // The kind label already says this is a combustion constant, so the region
    // says what is burning and on what basis instead.
    region: 'Natural gas, net calorific value',
  });

const rateFrom = (value, { unit, currency, source, region, what, reason }) =>
  Number.isFinite(value)
    ? new Rate({ value, unit, currency, source, region })
    : new Absent({ what, reason });
