/**
 * Rebuild `src/rates.data.js` from the four published datasets behind the bill.
 *
 * Not part of `predev` or `prebuild`. It is run by hand when the tariffs are
 * worth refreshing -- Eurostat publishes twice a year, the EIA monthly, Ember
 * annually -- and its whole purpose is that no figure on the bill is ever typed
 * in by a person:
 *
 *     node scripts/build-rates.mjs
 *
 * It needs the network and a Python with `openpyxl` and `xlrd`, because two of
 * the four sources are only published as spreadsheets and the second of those
 * is a 1990s .xls that no maintained JavaScript library will open. If either is
 * missing the script says which and stops, rather than writing a file with a
 * hole in it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = new URL('../.rates-cache/', import.meta.url).pathname;
const out = new URL('../src/rates.data.js', import.meta.url).pathname;
mkdirSync(here, { recursive: true });

/* ── fetch ──────────────────────────────────────────────────────────────── */

const DOWNLOADS = [
  ['owid-ci.csv', 'https://ourworldindata.org/grapher/carbon-intensity-electricity.csv?csvType=full&useColumnShortNames=true'],
  ['eu-elec-f.json', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_205?format=JSON&lang=EN&lastTimePeriod=1&nrg_cons=MWH20-499&tax=X_VAT&currency=EUR&unit=KWH'],
  ['eu-gas-f.json', 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_203?format=JSON&lang=EN&lastTimePeriod=1&nrg_cons=GJ_LT1000&tax=X_VAT&currency=EUR&unit=KWH'],
  ['eia-elec.xlsx', 'https://www.eia.gov/electricity/monthly/xls/table_5_06_b.xlsx'],
  ['eia-gas.xls', 'https://www.eia.gov/dnav/ng/xls/NG_PRI_SUM_A_EPG0_PCS_DMCF_M.xls'],
  // Statistics Canada publishes no price table for either fuel, only a selling
  // price *index*, which is a series of ratios and cannot be turned into a
  // rate. What it does publish is revenue and volume side by side for the same
  // customer class, and dividing one by the other is the price -- the same
  // derivation the EIA gas figures above already go through to reach a
  // kilowatt-hour.
  ['sc-elec.zip', 'https://www150.statcan.gc.ca/n1/tbl/csv/25100021-eng.zip'],
  ['sc-gas.zip', 'https://www150.statcan.gc.ca/n1/tbl/csv/25100086-eng.zip'],
];

for (const [name, url] of DOWNLOADS) {
  if (existsSync(`${here}${name}`) && !process.argv.includes('--refresh')) continue;
  console.log(`fetching ${name}`);
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '120', url, '-o', `${here}${name}`], { stdio: 'inherit' });
}

// Named rather than found, so a missing interpreter is a sentence and not a
// stack trace forty lines into the parse.
const python = (module) => {
  for (const bin of ['python3', `${here}.venv/bin/python`]) {
    try {
      execFileSync(bin, ['-c', `import ${module}`], { stdio: 'ignore' });
      return bin;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    `this script needs a Python with ${module} installed, for the spreadsheet ` +
      `sources the EIA publishes. Try:\n` +
      `  python3 -m venv ${here}.venv && ${here}.venv/bin/pip install openpyxl xlrd`,
  );
};

/* ── OWID: lifecycle carbon intensity of electricity, gCO2e/kWh ─────────── */

const owid = new Map();
for (const line of readFileSync(`${here}owid-ci.csv`, 'utf8').trim().split('\n').slice(1)) {
  const [entity, code, year, value] = line.split(',');
  if (!code || code.length !== 3 || !value) continue;
  if (!owid.has(code) || owid.get(code).year < +year) {
    owid.set(code, { year: +year, g: +value, entity });
  }
}

/* ── Eurostat: non-household prices, EUR/kWh, latest half-year ──────────── */

const eurostat = (file) => {
  const d = JSON.parse(readFileSync(`${here}${file}`, 'utf8'));
  const out = {};
  for (const [geo, i] of Object.entries(d.dimension.geo.category.index)) {
    const v = d.value[String(i)];
    if (v != null) out[geo] = v;
  }
  return { values: out, period: Object.keys(d.dimension.time.category.index)[0] };
};
const euElec = eurostat('eu-elec-f.json');
const euGas = eurostat('eu-gas-f.json');

// Eurostat geography is ISO 3166-1 alpha-2 with two of its own spellings (EL
// for Greece, UK for the United Kingdom); the station index is alpha-3.
const ISO3 = {
  AL: 'ALB', AT: 'AUT', BA: 'BIH', BE: 'BEL', BG: 'BGR', CY: 'CYP', CZ: 'CZE', DE: 'DEU',
  DK: 'DNK', EE: 'EST', EL: 'GRC', ES: 'ESP', FI: 'FIN', FR: 'FRA', GE: 'GEO', HR: 'HRV',
  HU: 'HUN', IE: 'IRL', IS: 'ISL', IT: 'ITA', LI: 'LIE', LT: 'LTU', LU: 'LUX', LV: 'LVA',
  MD: 'MDA', ME: 'MNE', MK: 'MKD', MT: 'MLT', NL: 'NLD', NO: 'NOR', PL: 'POL', PT: 'PRT',
  RO: 'ROU', RS: 'SRB', SE: 'SWE', SI: 'SVN', SK: 'SVK', TR: 'TUR', UA: 'UKR', UK: 'GBR',
  XK: 'XKX',
};
const byIso3 = (values) => {
  const out = {};
  for (const [geo, v] of Object.entries(values)) if (ISO3[geo]) out[ISO3[geo]] = v;
  return out;
};

/* ── EIA: US commercial prices by state ─────────────────────────────────── */

const usElec = JSON.parse(
  execFileSync(python('openpyxl'), [
    '-c',
    `
import openpyxl, json
ws = openpyxl.load_workbook('${here}eia-elec.xlsx', data_only=True)['Table_5_06_B']
ABBR = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"}
out = {}
for r in range(5, ws.max_row + 1):
    n, v = ws.cell(r, 1).value, ws.cell(r, 4).value
    if n in ABBR and v not in (None, '--', ''):
        out[ABBR[n]] = round(float(v) / 100, 5)   # cents/kWh -> USD/kWh
print(json.dumps({"period": ws.cell(4, 4).value, "values": out}))
`,
  ]).toString(),
);

// 1 Mcf of pipeline natural gas is 1.037 MMBtu (EIA's own conversion), and
// 1 MMBtu is 293.071 kWh, so a dollar per thousand cubic feet is a dollar per
// 303.9 kWh. Doing it here rather than in the browser keeps one unit --
// currency per kWh -- across every tariff in the table.
const MCF_KWH = 1.037 * 293.07107;
const usGas = JSON.parse(
  execFileSync(python('xlrd'), [
    '-c',
    `
import xlrd, json, re
wb = xlrd.open_workbook('${here}eia-gas.xls')
s = wb.sheet_by_name('Data 1')
keys = [str(s.cell_value(1, c)) for c in range(1, s.ncols)]
states = [(re.match(r'N3020(\\w\\w)3', k).group(1) if re.match(r'N3020(\\w\\w)3', k) else None) for k in keys]
rows = [(s.cell_value(r, 0), [s.cell_value(r, c) for c in range(1, s.ncols)]) for r in range(3, s.nrows) if s.cell_value(r, 0) != '']
last = [r for r in rows if any(v != '' for v in r[1])][-12:]
span = [xlrd.xldate_as_datetime(last[i][0], wb.datemode).strftime('%b %Y') for i in (0, -1)]
out = {}
for i, st in enumerate(states):
    if not st or st == 'US': continue
    vs = [r[1][i] for r in last if r[1][i] != '']
    if len(vs) >= 6: out[st] = round(sum(vs) / len(vs) / ${MCF_KWH}, 5)
print(json.dumps({"period": span[0] + ' – ' + span[1], "values": out}))
`,
  ]).toString(),
);

/* ── Statistics Canada: derived commercial prices by province ───────────── */

/** StatCan ships zipped CSV with a quoted-field dialect worth parsing properly. */
const readCsv = (zip, member) => {
  execFileSync('unzip', ['-o', '-q', `${here}${zip}`, member, '-d', `${here}sc/`], { stdio: 'inherit' });
  const text = readFileSync(`${here}sc/${member}`, 'utf8');
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') (field += '"'), (i += 1);
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') (row.push(field), (field = ''));
    else if (ch === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) (row.push(field), rows.push(row));
  // The file is served with a byte-order mark, which would otherwise make the
  // first column name unmatchable.
  const head = Object.fromEntries(rows[0].map((h, i) => [h.replace(/^\ufeff/, ''), i]));
  return { head, rows: rows.slice(1) };
};

const SCALE = { units: 1, thousands: 1e3, millions: 1e6 };

const round = (v) => Math.round(v * 1e5) / 1e5;

const PROVINCE = {
  'Newfoundland and Labrador': 'NL', 'Prince Edward Island': 'PE', 'Nova Scotia': 'NS',
  'New Brunswick': 'NB', Quebec: 'QC', Ontario: 'ON', Manitoba: 'MB', Saskatchewan: 'SK',
  Alberta: 'AB', 'British Columbia': 'BC', Yukon: 'YT', 'Northwest Territories': 'NT',
  Nunavut: 'NU',
};

// Revenue in dollars over energy sold to "Other industries", which is StatCan's
// commercial and institutional class -- the nearest thing Canada publishes to
// the EIA's commercial sector. Quantity is megawatt-hours.
const caElectricity = (() => {
  const { head, rows } = readCsv('sc-elec.zip', '25100021.csv');
  const byPlace = {};
  for (const r of rows) {
    if (r[head['Electric power, components']] !== 'Other industries sales of electricity') continue;
    const value = parseFloat(r[head.VALUE]);
    if (!Number.isFinite(value)) continue;
    const place = PROVINCE[r[head.GEO]];
    if (!place) continue;
    const year = r[head.REF_DATE];
    byPlace[place] ??= {};
    byPlace[place][year] ??= {};
    byPlace[place][year][r[head.Estimates]] = value * (SCALE[r[head.SCALAR_FACTOR]] ?? 1);
  }
  const values = {};
  let period = null;
  for (const [place, byYear] of Object.entries(byPlace)) {
    const years = Object.keys(byYear)
      .filter((y) => byYear[y]['Electricity value'] > 0 && byYear[y]['Electricity quantity'] > 0)
      .sort();
    if (!years.length) continue;
    const y = years.at(-1);
    period = period && period > y ? period : y;
    values[place] = round(byYear[y]['Electricity value'] / (byYear[y]['Electricity quantity'] * 1000));
  }
  return { values, period };
})();

// Dollars over gigajoules of commercial consumption, twelve months of it, since
// a gas bill is seasonal and one month of it is a season rather than a price.
// A gigajoule is 277.778 kWh.
const caGas = (() => {
  const { head, rows } = readCsv('sc-gas.zip', '25100086.csv');
  const byPlace = {};
  for (const r of rows) {
    if (r[head['Supply and disposition']] !== 'Commercial consumption') continue;
    const uom = r[head.UOM];
    if (uom !== 'Canadian dollars' && uom !== 'Gigajoules') continue;
    const value = parseFloat(r[head.VALUE]);
    if (!Number.isFinite(value)) continue;
    const place = PROVINCE[r[head.GEO]];
    if (!place) continue;
    const month = r[head.REF_DATE];
    byPlace[place] ??= {};
    byPlace[place][month] ??= {};
    byPlace[place][month][uom === 'Canadian dollars' ? 'money' : 'energy'] =
      value * (SCALE[r[head.SCALAR_FACTOR]] ?? 1);
  }
  const values = {};
  let span = null;
  for (const [place, byMonth] of Object.entries(byPlace)) {
    const months = Object.keys(byMonth)
      .filter((m) => byMonth[m].money > 0 && byMonth[m].energy > 0)
      .sort()
      .slice(-12);
    if (months.length < 6) continue;
    const money = months.reduce((a, m) => a + byMonth[m].money, 0);
    const energy = months.reduce((a, m) => a + byMonth[m].energy, 0);
    values[place] = round(money / energy / 277.77778);
    span ??= `${months[0]} – ${months.at(-1)}`;
  }
  return { values, period: span };
})();

/* ── emit ───────────────────────────────────────────────────────────────── */

const dump = (obj, indent = '  ') => {
  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  const lines = [];
  for (let i = 0; i < entries.length; i += 6) {
    lines.push(indent + entries.slice(i, i + 6).map(([k, v]) => `${k}: ${v}`).join(', ') + ',');
  }
  return lines.join('\n');
};

const nameDump = (obj) =>
  Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join('\n');

const owidYears = [...new Set([...owid.values()].map((r) => r.year))].sort();
const file = `/* ═══ generated, do not edit by hand ══════════════════════════════════════
 *
 * Written by scripts/build-rates.mjs from the four published datasets named in
 * SOURCES below. Rerunning it is how these numbers are updated; editing them
 * here would break the one promise this file makes, which is that every figure
 * on the bill can be traced to a citation and a date.
 */

/** Lifecycle carbon intensity of electricity generation, gCO2e/kWh, by ISO 3166-1 alpha-3. */
export const GRID_INTENSITY = Object.freeze({
${dump(Object.fromEntries([...owid].map(([c, r]) => [c, r.g])))}
});

/** The year each country's intensity above was measured in. */
export const GRID_INTENSITY_YEAR = Object.freeze({
${dump(Object.fromEntries([...owid].map(([c, r]) => [c, r.year])))}
});

/**
 * Country names in English, keyed by the same alpha-3 the station index uses.
 *
 * Taken from the same dataset as the codes rather than from the platform's own
 * region names, which speak alpha-2 only and would need a second mapping table that would
 * then be the thing with holes in it -- and the holes would fall exactly where
 * they hurt, on the countries no tariff table covers and whose refusal message
 * therefore has to name them.
 */
export const COUNTRY_NAME = Object.freeze({
${nameDump(Object.fromEntries([...owid].map(([c, r]) => [c, r.entity])))}
});

/** Non-household electricity price, EUR/kWh, excluding recoverable taxes. */
export const EU_ELECTRICITY = Object.freeze({
${dump(byIso3(euElec.values))}
});

/** Non-household gas price, EUR/kWh, excluding recoverable taxes. */
export const EU_GAS = Object.freeze({
${dump(byIso3(euGas.values))}
});

/** Commercial and institutional electricity price, CAD/kWh, by province. */
export const CA_ELECTRICITY = Object.freeze({
${dump(caElectricity.values)}
});

/** Commercial natural gas price, CAD/kWh, by province. */
export const CA_GAS = Object.freeze({
${dump(caGas.values)}
});

/** Average commercial electricity price, USD/kWh, by US state. */
export const US_ELECTRICITY = Object.freeze({
${dump(usElec.values)}
});

/** Average commercial natural gas price, USD/kWh gross, by US state. */
export const US_GAS = Object.freeze({
${dump(usGas.values)}
});

export const PERIODS = Object.freeze({
  grid: '${owidYears[0]}–${owidYears.at(-1)}',
  euElectricity: '${euElec.period}',
  euGas: '${euGas.period}',
  usElectricity: '${usElec.period}',
  usGas: '${usGas.period}',
  caElectricity: '${caElectricity.period}',
  caGas: '${caGas.period}',
});
`;

writeFileSync(out, file);
console.log(`wrote ${out}`);
console.log('  grid intensity:', owid.size, 'countries,', owidYears.join('/'));
console.log('  EU electricity:', Object.keys(byIso3(euElec.values)).length, euElec.period);
console.log('  EU gas:', Object.keys(byIso3(euGas.values)).length, euGas.period);
console.log('  US electricity:', Object.keys(usElec.values).length, usElec.period);
console.log('  US gas:', Object.keys(usGas.values).length, usGas.period);
console.log('  CA electricity:', Object.keys(caElectricity.values).length, caElectricity.period);
console.log('  CA gas:', Object.keys(caGas.values).length, caGas.period);
