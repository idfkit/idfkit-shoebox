/**
 * The plate's views of one run: what each draws, what it needs, how it rides
 * the link, and every figure it letters (spec 015).
 *
 * DOM-free and network-free, for the reason `readings.js` is: every count or
 * share a view letters must equal the same count taken directly off the hourly
 * series (SC-003), and that is only checkable if a Node harness can call the
 * code that computes it. `plate.js` draws what this module returns and
 * computes nothing it letters.
 *
 * A view joins `VIEWS` in the same change as its renderer in `plate.js`, which
 * asserts at load that the two lists agree. A build therefore never lists a
 * view it cannot draw, and the codec refuses a link naming one.
 */

import { KINDS } from './units.js';
import { BUDGETS, withinBudget } from './copy.js';
import { DAYS_IN_MONTH, MONTHS } from './controls.js';

/*
 * Day numbers of a 365-day year. `tm59.js` has the same pair, but it imports
 * `readings.js`, which imports this module for the series declarations, so
 * importing them from there would close a cycle through three modules.
 */
function dayNumber({ month, day }) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    throw new Error(`${month}-${day} is not a day of a 365-day year`);
  }
  let n = day;
  for (let m = 0; m < month - 1; m += 1) n += DAYS_IN_MONTH[m];
  return n;
}
function dateOfDay(n) {
  let left = n;
  for (let m = 0; m < 12; m += 1) {
    if (left <= DAYS_IN_MONTH[m]) return { month: m + 1, day: left };
    left -= DAYS_IN_MONTH[m];
  }
  throw new Error(`${n} is not a day of a 365-day year`);
}
export { dayNumber as dayOfYear, dateOfDay };

/* ══ series ══════════════════════════════════════════════════════════════ */

/**
 * One quantity a view may draw, and exactly where it comes from.
 *
 * `label` is the short name lettered in the right gutter, where `Zone` and
 * `Outdoor` have always stood; `name` is the whole noun for the accessible
 * description and the series choice. `scale` takes the engine's unit to the
 * kind's SI unit once, at read time (kg/kg to g/kg, J to kWh), so no view
 * rescales anything.
 */
export class SeriesDef {
  constructor({ id, label, name, variable, key = null, frequency, kind, scale = 1, needs = null, selectable = false, zone = false }) {
    if (!(kind && KINDS[kind.id] === kind)) {
      throw new Error(`the series "${id}" names a quantity kind that is not in KINDS`);
    }
    if (frequency !== 'hourly' && frequency !== 'daily') {
      throw new Error(`the series "${id}" is reported "${frequency}", and a view reads hourly or daily series`);
    }
    Object.assign(this, { id, label, name, variable, key, frequency, kind, scale, needs, selectable, zone });
    Object.freeze(this);
  }
}

/** J to kWh, the bill's own factor, stated here rather than imported so the scale is visible beside the kind. */
const KWH_PER_J = 1 / 3.6e6;

export const SERIES = Object.freeze([
  new SeriesDef({ id: 'air', label: 'Zone', name: 'zone mean air temperature', variable: 'Zone Mean Air Temperature', frequency: 'hourly', kind: KINDS.temperature, selectable: true, zone: true }),
  new SeriesDef({ id: 'operative', label: 'Operative', name: 'zone operative temperature', variable: 'Zone Operative Temperature', frequency: 'hourly', kind: KINDS.temperature, selectable: true, zone: true }),
  new SeriesDef({ id: 'radiant', label: 'Radiant', name: 'zone mean radiant temperature', variable: 'Zone Mean Radiant Temperature', frequency: 'hourly', kind: KINDS.temperature, selectable: true, zone: true }),
  new SeriesDef({ id: 'outdoor', label: 'Outdoor', name: 'outdoor drybulb temperature', variable: 'Site Outdoor Air Drybulb Temperature', frequency: 'hourly', kind: KINDS.temperature, selectable: true }),
  new SeriesDef({ id: 'wZone', label: 'Zone W', name: 'zone humidity ratio', variable: 'Zone Mean Air Humidity Ratio', frequency: 'hourly', kind: KINDS.humidityRatio, scale: 1000, zone: true }),
  new SeriesDef({ id: 'wOut', label: 'Outdoor W', name: 'outdoor humidity ratio', variable: 'Site Outdoor Air Humidity Ratio', frequency: 'hourly', kind: KINDS.humidityRatio, scale: 1000 }),
  new SeriesDef({ id: 'heat', label: 'Heating', name: 'daily heating demand', variable: 'Zone Ideal Loads Supply Air Total Heating Energy', frequency: 'daily', kind: KINDS.energy, scale: KWH_PER_J, needs: 'system' }),
  new SeriesDef({ id: 'cool', label: 'Cooling', name: 'daily cooling demand', variable: 'Zone Ideal Loads Supply Air Total Cooling Energy', frequency: 'daily', kind: KINDS.energy, scale: KWH_PER_J, needs: 'system' }),
  new SeriesDef({ id: 'occupancy', label: 'Occupancy', name: 'occupancy', variable: 'Schedule Value', key: 'Occupancy', frequency: 'hourly', kind: KINDS.ratio, needs: 'gains' }),
  new SeriesDef({ id: 'dayType', label: 'Day type', name: 'day type', variable: 'Site Day Type Index', frequency: 'daily', kind: KINDS.count }),
]);

export const SERIES_BY_ID = Object.freeze(Object.fromEntries(SERIES.map((s) => [s.id, s])));

/** The four series the reader may choose between, in declaration order (FR-009). */
export const SELECTABLE = Object.freeze(SERIES.filter((s) => s.selectable).map((s) => s.id));

/**
 * The selectable series share one axis, so they must share one kind (FR-009).
 * All four are temperatures today; the assertion is what stops a fifth, of
 * another kind, being added without a second axis to draw it on.
 */
export function assertSeries(series = SERIES) {
  const seen = new Set();
  for (const s of series) {
    if (seen.has(s.id)) throw new Error(`the series "${s.id}" is declared twice`);
    seen.add(s.id);
    if (!(s.kind && KINDS[s.kind.id] === s.kind)) throw new Error(`the series "${s.id}" names a kind not in KINDS`);
  }
  const selectable = series.filter((s) => s.selectable);
  const kinds = new Set(selectable.map((s) => s.kind.id));
  if (kinds.size > 1) {
    throw new Error(
      `the selectable series ${selectable.map((s) => s.id).join(', ')} share one axis but are of ` +
        `${kinds.size} kinds (${[...kinds].join(', ')})`,
    );
  }
  return series;
}
assertSeries();

/* ══ what a view needs, and whether it has it ════════════════════════════ */

/** A closed union. `availabilityOf` is the only reader. */
export class Need {
  constructor(kind, detail = {}) {
    this.kind = kind;
    Object.assign(this, detail);
    Object.freeze(this);
  }
  static series(id) {
    return new Need('series', { id });
  }
  static weatherRun({ minDays = 1 } = {}) {
    return new Need('weatherRun', { minDays });
  }
  static runningMean() {
    return new Need('runningMean');
  }
  static noMechanicalCooling() {
    return new Need('noMechanicalCooling');
  }
}

const NEED_KINDS = Object.freeze(['series', 'weatherRun', 'runningMean', 'noMechanicalCooling']);

export class Available {
  constructor() {
    this.available = true;
    Object.freeze(this);
  }
}
export const AVAILABLE = new Available();

/**
 * Why a view cannot be drawn, and what would change that. There is no third
 * state: a caller holding one of these has nothing to fall back to, which is
 * the point (Principle IV, SC-005).
 */
export class Unavailable {
  constructor({ reason, remedy = null }) {
    if (!reason) throw new Error('an unavailable view must say why');
    this.available = false;
    this.reason = reason;
    this.remedy = remedy;
    Object.freeze(this);
  }
}

/**
 * The refusal wording of contracts/views.md §3, declared once.
 *
 * One deviation from the contract table, recorded in the design notes: the
 * year-only views' remedy. The contract's "Set months on the Run strip" is
 * wrong on this desk, whose calendar is a full year by default; what turns a
 * design-day run into a year is a weather source.
 */
export const REFUSAL = Object.freeze({
  weather: new Unavailable({ reason: 'Needs a run over a weather file.', remedy: 'Attach a station or a file.' }),
  humidity: new Unavailable({ reason: 'This run reports no humidity ratio.' }),
  system: new Unavailable({ reason: 'Needs System in the path.', remedy: 'Patch System in.' }),
  gains: new Unavailable({ reason: 'Needs occupied hours.', remedy: 'Patch Gains in.' }),
  cooling: new Unavailable({
    reason: 'ASHRAE 55 §5.4 excludes mechanically cooled spaces.',
    remedy: 'Bypass System.',
  }),
  lastSeries: new Unavailable({ reason: 'At least one series must be drawn.' }),
  short: new Unavailable({ reason: 'Needs at least eight days of weather.', remedy: 'Run more months.' }),
});

/** The refusal a missing series earns, by what its absence was caused by. */
function refusalForSeries(run, id) {
  const def = SERIES_BY_ID[id];
  if (def.needs && run.blocked?.has(def.needs)) return new Unavailable({ reason: run.blocked.get(def.needs) });
  if (def.needs === 'system') return REFUSAL.system;
  if (def.needs === 'gains') return REFUSAL.gains;
  if (id === 'wZone' || id === 'wOut') return REFUSAL.humidity;
  return new Unavailable({ reason: run.absent.get(id) ?? `This run reports no ${def.name}.` });
}

/**
 * Whether a run can be drawn in a view, or a region of one. Evaluates the
 * view's `Need`s in order and returns the first refusal, so the reader is told
 * the first thing to fix rather than a list.
 */
export function availabilityOf(needsOrView, run) {
  const needs = Array.isArray(needsOrView) ? needsOrView : needsOrView.needs;
  if (!run) return AVAILABLE;
  for (const need of needs) {
    switch (need.kind) {
      case 'series':
        if (!run.has(need.id)) return refusalForSeries(run, need.id);
        break;
      case 'weatherRun':
        if (!run.facts.weatherDays) return REFUSAL.weather;
        if (run.facts.weatherDays < need.minDays) return REFUSAL.short;
        break;
      case 'runningMean':
        if (!run.facts.weatherDays) return REFUSAL.weather;
        if (run.facts.runningMean.absence) {
          return new Unavailable({ reason: run.facts.runningMean.absence, remedy: 'Attach a whole-year file.' });
        }
        break;
      case 'noMechanicalCooling':
        if (run.facts.mechanicalCooling) return REFUSAL.cooling;
        break;
      default:
        throw new Error(`no view can need "${need.kind}"`);
    }
  }
  return AVAILABLE;
}

/* ══ the views ═══════════════════════════════════════════════════════════ */

export class View {
  constructor({ id, label, needs, placesHour, drawsSeries, ghost, describe, fields }) {
    Object.assign(this, { id, label, needs: Object.freeze([...needs]), placesHour, drawsSeries, ghost, describe });
    // The link fields this view carries (contracts/view-key.md, "Fields per view").
    this.fields = Object.freeze([...fields]);
    Object.freeze(this);
  }
}

/** FR-001's order. `VIEWS` keeps it; the assertion below holds it. */
export const VIEW_ORDER = Object.freeze(['ts', 'psy', 'adp', 'crp', 'dur', 'avg', 'sig']);

/** The link fields in the order the grammar writes them. */
const FIELD_ORDER = Object.freeze(['series', 'shade', 'agg', 'zoom', 'region', 'model']);
const FIELD_PREFIX = Object.freeze({ series: 's', shade: 'c', agg: 'a', zoom: 'z', region: 'r', model: 'm' });

/** Each view's needs, declared here beside the list so a later view cannot be added without them. */
export const NEEDS = Object.freeze({
  ts: [],
  psy: [Need.series('wZone'), Need.series('wOut')],
  adp: [Need.weatherRun({ minDays: 8 }), Need.runningMean(), Need.series('operative'), Need.series('occupancy')],
  crp: [Need.weatherRun()],
  dur: [],
  avg: [Need.weatherRun()],
  sig: [Need.weatherRun(), Need.series('heat'), Need.series('cool')],
});

/** The psychrometric view's two regions (FR-011a). */
export const REGION_NEEDS = Object.freeze({
  g: [],
  a: [Need.weatherRun({ minDays: 8 }), Need.runningMean(), Need.noMechanicalCooling(), Need.series('operative'), Need.series('occupancy')],
});

const seriesNames = (setting) => setting.series.map((id) => SERIES_BY_ID[id].name);
const listed = (words) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The declared views. A view is added to this list only in the change that
 * adds its renderer; `plate.js` refuses to load if the two disagree.
 */
const DECLARED = [
  new View({
    id: 'ts',
    label: 'Time series',
    needs: NEEDS.ts,
    placesHour: true,
    drawsSeries: true,
    ghost: 'lines',
    fields: ['series', 'agg', 'zoom'],
    // At the default the sentence is today's `aria-label`, word for word
    // (FR-002): "Zone mean air temperature against outdoor drybulb temperature".
    describe: (setting) => {
      const names = seriesNames(setting);
      const [first, ...rest] = names;
      return sentence(rest.length ? `${first} against ${listed(rest)}` : first);
    },
  }),
  new View({
    id: 'psy',
    label: 'Psychrometric',
    needs: NEEDS.psy,
    placesHour: true,
    drawsSeries: false,
    ghost: 'outline',
    fields: ['region'],
    describe: () => 'Psychrometric chart of dry bulb temperature against humidity ratio',
  }),
  new View({
    id: 'adp',
    label: 'Adaptive',
    needs: NEEDS.adp,
    placesHour: true,
    drawsSeries: false,
    ghost: 'outline',
    fields: ['model'],
    describe: () => 'Operative temperature against the running mean outdoor temperature',
  }),
  new View({
    id: 'crp',
    label: 'Carpet',
    needs: NEEDS.crp,
    placesHour: true,
    drawsSeries: false,
    ghost: 'change',
    fields: ['shade'],
    describe: (setting) => `Carpet of ${SERIES_BY_ID[setting.shade].name}, hour of day against day`,
  }),
  new View({
    id: 'dur',
    label: 'Duration',
    needs: NEEDS.dur,
    placesHour: true,
    drawsSeries: true,
    ghost: 'lines',
    fields: ['series'],
    describe: (setting) => `Duration curve of ${listed(seriesNames(setting))}`,
  }),
  new View({
    id: 'avg',
    label: 'Average day',
    needs: NEEDS.avg,
    placesHour: false,
    drawsSeries: true,
    ghost: 'lines',
    fields: ['series'],
    describe: (setting) => `Average day of ${listed(seriesNames(setting))}, by month`,
  }),
  new View({
    id: 'sig',
    label: 'Signature',
    needs: NEEDS.sig,
    placesHour: false,
    drawsSeries: false,
    ghost: 'outline',
    fields: [],
    describe: () => 'Daily heating and cooling demand against daily mean outdoor temperature',
  }),
];

export const VIEWS = Object.freeze(DECLARED);

/*
 * The chooser's strings are always in view, so they are held to budgets at
 * load (FR-025): a view's name in 14 characters and a series' gutter label in
 * 12, which is what fits one button and one gutter at 390 px, and every
 * refusal to one line of the STANDING budget.
 */
for (const view of VIEWS) {
  withinBudget(BUDGETS.LABEL, `the view "${view.id}"`, view.label);
  if (view.label.length > 14) throw new Error(`the view "${view.id}" is named in ${view.label.length} characters, over 14`);
}
for (const s of SERIES) {
  if (s.label.length > 12) throw new Error(`the series "${s.id}" is labelled in ${s.label.length} characters, over 12`);
}
for (const [key, refusal] of Object.entries(REFUSAL)) {
  withinBudget(BUDGETS.STANDING, `REFUSAL.${key}`, refusal.reason);
  if (refusal.remedy) withinBudget(BUDGETS.STANDING, `REFUSAL.${key} remedy`, refusal.remedy);
}
export const VIEW_BY_ID = Object.freeze(Object.fromEntries(VIEWS.map((v) => [v.id, v])));

/**
 * The view list is a declaration, so its invariants are thrown at load.
 * Takes the list so the declarations harness can put broken ones through it.
 */
export function assertViews(views = VIEWS, series = SERIES) {
  const ids = new Set();
  for (const view of views) {
    if (ids.has(view.id)) throw new Error(`the view "${view.id}" is declared twice`);
    ids.add(view.id);
    if (!VIEW_ORDER.includes(view.id)) throw new Error(`the view "${view.id}" is not one FR-001 names`);
    for (const need of view.needs) {
      if (!NEED_KINDS.includes(need.kind)) throw new Error(`the view "${view.id}" needs "${need.kind}", which is not a need`);
      if (need.kind === 'series' && !series.some((s) => s.id === need.id)) {
        throw new Error(`the view "${view.id}" needs the series "${need.id}", which is not declared`);
      }
    }
    for (const field of view.fields) {
      if (!FIELD_ORDER.includes(field)) throw new Error(`the view "${view.id}" carries the field "${field}", which the link cannot`);
    }
  }
  if (views[0]?.id !== 'ts') throw new Error('the time series must be the first view and the default (FR-002)');
  const order = views.map((v) => VIEW_ORDER.indexOf(v.id));
  if (order.some((at, i) => i > 0 && at <= order[i - 1])) {
    throw new Error(`the views are listed ${views.map((v) => v.id).join(', ')}, out of FR-001's order`);
  }
  return views;
}
assertViews();

/* ══ the adaptive models' ids (declared in comfort.js, named here for the link) ══ */

export const MODEL_IDS = Object.freeze(['en1', 'en2', 'en3', 'a80', 'a90']);

/* ══ the setting ═════════════════════════════════════════════════════════ */

/**
 * The view and every choice a view offers, as the `pv` key encodes it.
 *
 * A field that does not apply to the view is held rather than dropped, so
 * switching views and back restores it within a session; the link carries only
 * the fields of the view it names.
 */
export class ViewSetting {
  constructor({ view = 'ts', series = ['air', 'outdoor'], shade = 'air', aggregation = 'h', zoom = null, region = 'g', model = 'en2' } = {}) {
    if (!VIEW_BY_ID[view]) throw new Error(`no view is called "${view}"`);
    const chosen = SELECTABLE.filter((id) => series.includes(id));
    if (!chosen.length) throw new Error(REFUSAL.lastSeries.reason);
    for (const id of series) if (!SELECTABLE.includes(id)) throw new Error(`"${id}" is not a series the plate offers`);
    if (!SELECTABLE.includes(shade)) throw new Error(`"${shade}" is not a series the carpet can shade by`);
    if (!['h', 'd', 'm'].includes(aggregation)) throw new Error(`"${aggregation}" is not an aggregation`);
    if (zoom !== null) {
      if (!Number.isInteger(zoom.from) || !Number.isInteger(zoom.to) || zoom.from < 1 || zoom.to > 365 || zoom.from > zoom.to) {
        throw new Error(`a zoom runs forwards within one year, and this one runs ${zoom.from} to ${zoom.to}`);
      }
    }
    if (!['g', 'a'].includes(region)) throw new Error(`"${region}" is not a comfort region`);
    if (!MODEL_IDS.includes(model)) throw new Error(`"${model}" is not an adaptive model`);
    this.view = view;
    this.series = Object.freeze(chosen);
    this.shade = shade;
    this.aggregation = aggregation;
    this.zoom = zoom === null ? null : Object.freeze({ from: zoom.from, to: zoom.to });
    this.region = region;
    this.model = model;
    Object.freeze(this);
  }

  get viewDef() {
    return VIEW_BY_ID[this.view];
  }
}

export const DEFAULT_SETTING = new ViewSetting();

/** A new setting with some fields replaced, validated whole. */
export const settingFor = (setting, patch) => new ViewSetting({ ...setting, ...patch });

const sameSeries = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Whether one field of a setting stands at its default. */
function atDefault(setting, field) {
  switch (field) {
    case 'series': return sameSeries(setting.series, DEFAULT_SETTING.series);
    case 'shade': return setting.shade === DEFAULT_SETTING.shade;
    case 'agg': return setting.aggregation === DEFAULT_SETTING.aggregation;
    case 'zoom': return setting.zoom === null;
    case 'region': return setting.region === DEFAULT_SETTING.region;
    case 'model': return setting.model === DEFAULT_SETTING.model;
    default: throw new Error(`no field is called "${field}"`);
  }
}

/** Whether two settings would be written as one link, which is what the address bar compares. */
export const sameSetting = (a, b) => encodeView(a) === encodeView(b);

/* ══ the `pv` codec (contracts/view-key.md) ══════════════════════════════ */

const mmdd = (n) => {
  const { month, day } = dateOfDay(n);
  return `${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
};

function encodeField(setting, field) {
  switch (field) {
    case 'series': return `s-${setting.series.join('_')}`;
    case 'shade': return `c-${setting.shade}`;
    case 'agg': return `a-${setting.aggregation}`;
    case 'zoom': return `z-${mmdd(setting.zoom.from)}_${mmdd(setting.zoom.to)}`;
    case 'region': return `r-${setting.region}`;
    case 'model': return `m-${setting.model}`;
    default: throw new Error(`no field is called "${field}"`);
  }
}

/**
 * One string per setting, or null at the global default, which is what keeps
 * a link built at the default byte-identical to one built before `pv` existed
 * (SC-004).
 */
export function encodeView(setting) {
  if (!(setting instanceof ViewSetting)) throw new Error('encodeView takes a ViewSetting');
  const view = setting.viewDef;
  const fields = FIELD_ORDER.filter((f) => view.fields.includes(f) && !atDefault(setting, f));
  if (setting.view === DEFAULT_SETTING.view && !fields.length) return null;
  return [setting.view, ...fields.map((f) => encodeField(setting, f))].join('.');
}

/** A refusal of the `pv` value, naming the contract's rule. */
const refuse = (rule, text) => new Error(`the plate view "pv" ${text} (rule ${rule})`);

function decodeMmdd(text, raw) {
  if (!/^\d{4}$/.test(text)) throw refuse(7, `carries "${raw}", whose zoom is not two MMDD dates`);
  const month = Number(text.slice(0, 2));
  const day = Number(text.slice(2));
  try {
    return dayNumber({ month, day });
  } catch {
    throw refuse(7, `zooms to ${text}, which is not a day of the year`);
  }
}

/**
 * Read a `pv` value back, or refuse it whole naming the rule it breaks.
 * A well-formed value naming a view the desk cannot draw is *not* refused:
 * availability is a fact about the run, and the codec never sees one.
 */
export function decodeView(text) {
  if (typeof text !== 'string' || !text) throw refuse(8, 'is empty');
  const [token, ...parts] = text.split('.');
  if (!VIEW_BY_ID[token]) throw refuse(1, `names "${token}", which is not a view this page draws`);
  const view = VIEW_BY_ID[token];
  const patch = { view: token };
  let last = -1;
  for (const part of parts) {
    const cut = part.indexOf('-');
    const prefix = cut === -1 ? part : part.slice(0, cut);
    const value = cut === -1 ? '' : part.slice(cut + 1);
    const field = FIELD_ORDER.find((f) => FIELD_PREFIX[f] === prefix);
    if (!field) throw refuse(2, `carries "${part}", whose field is not one the grammar knows`);
    const at = FIELD_ORDER.indexOf(field);
    if (at === last) throw refuse(2, `carries the ${field} field twice`);
    if (at < last) throw refuse(3, `carries "${part}" out of order`);
    last = at;
    if (!view.fields.includes(field)) throw refuse(4, `carries a ${field} field, which the ${view.label.toLowerCase()} does not take`);
    switch (field) {
      case 'series': {
        const ids = value.split('_');
        if (!value || ids.some((id) => !SELECTABLE.includes(id))) throw refuse(6, `names a series in "${value}" that the plate does not offer`);
        if (new Set(ids).size !== ids.length) throw refuse(6, `names a series twice in "${value}"`);
        const ordered = SELECTABLE.filter((id) => ids.includes(id));
        if (!sameSeries(ordered, ids)) throw refuse(6, `lists "${value}" out of declaration order`);
        patch.series = ids;
        break;
      }
      case 'shade':
        if (!SELECTABLE.includes(value)) throw refuse(6, `shades by "${value}", which is not a series`);
        patch.shade = value;
        break;
      case 'agg':
        if (!['h', 'd', 'm'].includes(value)) throw refuse(2, `aggregates by "${value}"`);
        patch.aggregation = value;
        break;
      case 'zoom': {
        const ends = value.split('_');
        if (ends.length !== 2) throw refuse(7, `zooms to "${value}", which is not a range like 0712_0719`);
        const [from, to] = ends.map((e) => decodeMmdd(e, value));
        if (from > to) throw refuse(7, `zooms from ${ends[0]} back to ${ends[1]}`);
        patch.zoom = { from, to };
        break;
      }
      case 'region':
        if (!['g', 'a'].includes(value)) throw refuse(2, `names the region "${value}"`);
        patch.region = value;
        break;
      case 'model':
        if (!MODEL_IDS.includes(value)) throw refuse(2, `names the model "${value}"`);
        patch.model = value;
        break;
      default:
        throw refuse(2, `carries "${part}"`);
    }
  }
  const setting = new ViewSetting(patch);
  // Canonical or refused: a field written at its default is a second spelling
  // of the same picture, and two spellings would key two addresses for it.
  for (const field of FIELD_ORDER) {
    const written = parts.some((p) => p.split('-')[0] === FIELD_PREFIX[field]);
    if (written && atDefault(setting, field)) throw refuse(5, `writes the ${field} at its default`);
  }
  // `pv=ts` alone is the global default, which is written by omitting the key.
  if (encodeView(setting) === null) throw refuse(5, 'is the default written out');
  return setting;
}

/* ══ readings over a run ═════════════════════════════════════════════════ */

/**
 * Memoised on the identity of what they read. A `RunSeries` is frozen and
 * built once per run, so identity is the whole of its version.
 */
const memo = new WeakMap();
function remember(key, name, compute) {
  let slot = memo.get(key);
  if (!slot) memo.set(key, (slot = new Map()));
  if (!slot.has(name)) slot.set(name, compute());
  return slot.get(name);
}
export { remember };

/** The hours a count or a mean is taken over: the weather-file environments, never the design days. */
export function assessedHours(run) {
  return remember(run, 'assessed', () => {
    const weather = run.runs.filter((r) => r.kind === null);
    const spans = weather.length ? weather : run.runs;
    const out = [];
    for (const r of spans) for (let i = r.start; i <= r.end; i += 1) out.push(i);
    return Int32Array.from(out);
  });
}

/** Sorted from highest to lowest, `NaN` left out. */
export function durationCurve(values) {
  return remember(values, 'duration', () => {
    const kept = [];
    for (const v of values) if (Number.isFinite(v)) kept.push(v);
    return Float64Array.from(kept).sort().reverse();
  });
}

/** How many entries of a descending curve are at or above `value`. */
export function hoursAtOrAbove(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] >= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The value of a series over the weather-file hours only, for curves that must not count a design day. */
export function assessedValues(run, id) {
  return remember(run, `assessed:${id}`, () => {
    const hours = assessedHours(run);
    const values = run.series.get(id);
    const out = new Float64Array(hours.length);
    for (let i = 0; i < hours.length; i += 1) out[i] = values[hours[i]];
    return out;
  });
}

/**
 * One 24-hour mean profile per covered month, over that month's own
 * weather-file hours. A month the run does not cover is absent from the map,
 * never a flat line at zero (US6 scenario 1).
 */
export function averageDay(run, id) {
  return remember(run, `avg:${id}`, () => {
    const values = run.series.get(id);
    const sums = new Map();
    for (const i of assessedHours(run)) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      const t = run.points[i].timestamp;
      let slot = sums.get(t.month);
      if (!slot) sums.set(t.month, (slot = { sum: new Float64Array(24), n: new Uint16Array(24) }));
      const h = hourIndex(t);
      slot.sum[h] += v;
      slot.n[h] += 1;
    }
    const out = new Map();
    for (const month of [...sums.keys()].sort((a, b) => a - b)) {
      const { sum, n } = sums.get(month);
      out.set(month, Float64Array.from(sum, (s, h) => (n[h] ? s / n[h] : NaN)));
    }
    return out;
  });
}

/** Hour of day 0 to 23 from an hour-ending stamp (EnergyPlus writes 1 to 24). */
export const hourIndex = (t) => ((t.hour ?? 0) + 23) % 24;

/** The days of the weather-file environments, in run order, with the index of each day's hours. */
export function runDays(run) {
  return remember(run, 'days', () => {
    const days = [];
    for (const i of assessedHours(run)) {
      const t = run.points[i].timestamp;
      const last = days.at(-1);
      if (!last || last.month !== t.month || last.day !== t.day || last.env !== t.environmentIndex) {
        days.push({ env: t.environmentIndex, month: t.month, day: t.day, hours: new Int32Array(24).fill(-1) });
      }
      days.at(-1).hours[hourIndex(t)] = i;
    }
    return days;
  });
}

/** Equal-width bins over a range, each with its lower and upper bound, for a legend. */
function binsOver(lo, hi, count) {
  const width = (hi - lo) / count || 1;
  return Array.from({ length: count }, (_, b) => Object.freeze({ from: lo + b * width, to: lo + (b + 1) * width }));
}

/**
 * The carpet: one cell per hour of each weather-file day, binned on nine equal
 * steps between the extremes. A missing hour is left empty (`-1`), never binned.
 */
export function carpetGrid(run, id, count = 9) {
  return remember(run, `carpet:${id}:${count}`, () => {
    const values = run.series.get(id);
    const days = runDays(run);
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of days) for (const i of d.hours) if (i >= 0 && Number.isFinite(values[i])) {
      lo = Math.min(lo, values[i]);
      hi = Math.max(hi, values[i]);
    }
    const bins = binsOver(lo, hi, count);
    const cells = new Int8Array(days.length * 24).fill(-1);
    days.forEach((d, row) => d.hours.forEach((i, h) => {
      if (i < 0 || !Number.isFinite(values[i])) return;
      cells[row * 24 + h] = Math.min(count - 1, Math.floor(((values[i] - lo) / (hi - lo || 1)) * count));
    }));
    return Object.freeze({ days, cells, bins, min: lo, max: hi, signed: false });
  });
}

/**
 * The change carpet: live minus ghost, hour by hour, on eleven signed bins
 * centred on a zero bin, so no change reads as the middle of the scale and a
 * warming and a cooling of one size are one step either side of it.
 */
export function carpetChange(run, ghost, id, count = 11) {
  // Keyed on the ghost through a WeakMap, so the live run's cache never holds
  // the ghost alive. Held strongly beside the grid, each gesture's run kept the
  // previous one, which kept the one before: a reader who left the toggle on
  // retained every run of the session, about 1.3 MB each on a year.
  let byKey = changeMemo.get(run);
  if (!byKey) changeMemo.set(run, (byKey = new Map()));
  const key = `${id}:${count}`;
  let byGhost = byKey.get(key);
  if (!byGhost) byKey.set(key, (byGhost = new WeakMap()));
  const cached = byGhost.get(ghost);
  if (cached) return cached;
  const live = run.series.get(id);
  const was = ghost.series.get(id);
  const days = runDays(run);
  let reach = 0;
  const diffs = new Float64Array(live.length).fill(NaN);
  for (const d of days) for (const i of d.hours) {
    if (i < 0) continue;
    const change = live[i] - was[i];
    if (!Number.isFinite(change)) continue;
    diffs[i] = change;
    reach = Math.max(reach, Math.abs(change));
  }
  reach = reach || 1;
  const bins = binsOver(-reach, reach, count);
  const cells = new Int8Array(days.length * 24).fill(-1);
  days.forEach((d, row) => d.hours.forEach((i, h) => {
    if (i < 0 || !Number.isFinite(diffs[i])) return;
    cells[row * 24 + h] = Math.min(count - 1, Math.floor(((diffs[i] + reach) / (2 * reach)) * count));
  }));
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of diffs) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const grid = Object.freeze({ days, cells, bins, min: lo, max: hi, signed: true });
  byGhost.set(ghost, grid);
  return grid;
}
/** The change carpets, by live run, then by `id:count`, then weakly by ghost. */
const changeMemo = new WeakMap();

/**
 * The energy signature: per weather-file day, the day's mean outdoor
 * temperature from the hourly series and the day's heating and cooling totals
 * as the engine summed them. A day missing any of the three is left out.
 */
export function dailySignature(run) {
  return remember(run, 'signature', () => {
    const outdoor = run.series.get('outdoor');
    const heat = run.daily.get('heat');
    const cool = run.daily.get('cool');
    const byDay = new Map(run.dailyStamps.map((s, i) => [`${s.env}:${s.month}:${s.day}`, i]));
    const days = [];
    for (const d of runDays(run)) {
      let sum = 0;
      let n = 0;
      for (const i of d.hours) if (i >= 0 && Number.isFinite(outdoor[i])) { sum += outdoor[i]; n += 1; }
      const at = byDay.get(`${d.env}:${d.month}:${d.day}`);
      if (!n || at === undefined) continue;
      const h = heat[at];
      const c = cool[at];
      if (!Number.isFinite(h) || !Number.isFinite(c)) continue;
      days.push(Object.freeze({ month: d.month, day: d.day, tOut: sum / n, heat: h, cool: c, at: d.hours.find((i) => i >= 0) }));
    }
    let heatTotal = 0;
    let coolTotal = 0;
    for (const d of days) { heatTotal += d.heat; coolTotal += d.cool; }
    return Object.freeze({ days: Object.freeze(days), heat: heatTotal, cool: coolTotal });
  });
}

/**
 * Hours grouped into days or months, each period its mean with the range it
 * spans (FR-018). Over `indices` in run order; `NaN` hours stay out of every
 * figure, and a period with none is left out rather than drawn at zero.
 */
export function aggregate(values, points, grain, indices) {
  if (grain === 'h') throw new Error('an hourly aggregation is the hours themselves');
  const out = [];
  let open = null;
  for (const i of indices) {
    const t = points[i].timestamp;
    const key = grain === 'd' ? `${t.environmentIndex}:${t.month}:${t.day}` : `${t.environmentIndex}:${t.month}`;
    if (!open || open.key !== key) {
      if (open) out.push(close(open));
      open = { key, start: i, end: i, sum: 0, n: 0, min: Infinity, max: -Infinity, month: t.month, day: t.day };
    }
    open.end = i;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    open.sum += v;
    open.n += 1;
    open.min = Math.min(open.min, v);
    open.max = Math.max(open.max, v);
  }
  if (open) out.push(close(open));
  return out.filter((p) => p.n > 0);
}
const close = (p) => Object.freeze({ start: p.start, end: p.end, mean: p.sum / p.n, min: p.min, max: p.max, n: p.n, month: p.month, day: p.day });

/**
 * The hours a zoom holds, off the first weather-file environment that covers
 * both of its days, or null where no environment does. Null is how a zoom is
 * released on a run that does not cover it (US8 scenario 3).
 */
export function zoomSpan(run, zoom) {
  if (!zoom) return null;
  for (const r of run.runs) {
    if (r.kind !== null) continue;
    let start = -1;
    let end = -1;
    for (let i = r.start; i <= r.end; i += 1) {
      const t = run.points[i].timestamp;
      const n = dayNumber({ month: t.month, day: t.day });
      if (n < zoom.from || n > zoom.to) continue;
      if (start < 0) start = i;
      end = i;
    }
    if (start < 0) continue;
    const first = run.points[start].timestamp;
    const last = run.points[end].timestamp;
    if (dayNumber(first) === zoom.from && dayNumber(last) === zoom.to) return { start, end };
  }
  return null;
}

/** A zoom lettered as the sheet letters dates: `12 Jul – 19 Jul`. */
export const zoomText = (zoom) => {
  const say = (n) => {
    const { month, day } = dateOfDay(n);
    return `${day} ${MONTHS[month - 1]}`;
  };
  return `${say(zoom.from)} – ${say(zoom.to)}`;
};

/** One day number lettered as the preview's sliders letter it: `12 Jul`. */
export const dayText = (n) => {
  const { month, day } = dateOfDay(n);
  return `${day} ${MONTHS[month - 1]}`;
};

/* ══ the range preview (FR-018a to FR-018d) ══════════════════════════════ */

/**
 * One run period as the range preview draws it: its first and last day, its
 * first and last hour, and the daily mean of each series the run reports,
 * one slot per day with `NaN` where a day has no hour to average.
 */
export class RangeSegment {
  constructor({ from, to, start, end, means }) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) throw new Error(`a run period runs forwards, and this one runs ${from} to ${to}`);
    this.from = from;
    this.to = to;
    this.start = start;
    this.end = end;
    this.means = means;
    Object.freeze(this);
  }

  get days() {
    return this.to - this.from + 1;
  }

  holds(day) {
    return day >= this.from && day <= this.to;
  }
}

/**
 * The run periods of a run's weather-file environments, in run order, read
 * off the hours as `zoomSpan` reads them. A design day is not a run period
 * and is never in the preview (FR-018b).
 */
export function rangeSegments(run) {
  return remember(run, 'range', () => Object.freeze(run.runs.filter((r) => r.kind === null).map((r) => {
    const from = dayNumber(run.points[r.start].timestamp);
    const to = dayNumber(run.points[r.end].timestamp);
    const indices = Int32Array.from({ length: r.end - r.start + 1 }, (_, k) => r.start + k);
    const means = new Map();
    for (const [id, values] of run.series) {
      const slots = new Float64Array(to - from + 1).fill(NaN);
      for (const p of aggregate(values, run.points, 'd', indices)) slots[dayNumber(p) - from] = p.mean;
      means.set(id, slots);
    }
    return new RangeSegment({ from, to, start: r.start, end: r.end, means });
  })));
}

/**
 * Move one part of the range to a day and return the zoom that results, or
 * null where it is the whole run (FR-018a, FR-018d).
 *
 * `part` is `from` or `to` for a handle and `window` for the whole range,
 * whose `to` is then the day its first day should land on. A handle stops at
 * the other handle, so a range is never shorter than one day, and at the edge
 * of its run period. The window keeps its length and stops at the edge of its
 * period too, unless the day asked for lies in another period: then it moves
 * there whole, clipped to that period's length. Every range returned is one
 * `zoomSpan` draws, which is asserted rather than assumed: the date lists this
 * replaces could compose a range across two periods, and it was drawn as the
 * whole run with nothing said.
 */
export function moveRange(run, zoom, part, to) {
  const segments = rangeSegments(run);
  if (!segments.length) throw new Error('a range is days of a weather file, and this run has none');
  if (!Number.isFinite(to)) throw new Error(`a range moves to a day, not to ${to}`);
  const day = Math.round(to);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let current;
  let home;
  if (zoom) {
    home = segments.find((s) => s.holds(zoom.from) && s.holds(zoom.to));
    if (!home || !zoomSpan(run, zoom)) throw new Error(`the zoom to ${zoomText(zoom)} is not a range of this run`);
    current = zoom;
  } else {
    // The whole run: on a run of several periods each handle stands at an
    // end of the run, so it belongs to the period at that end.
    home = part === 'to' ? segments.at(-1) : segments[0];
    current = { from: home.from, to: home.to };
  }
  let next;
  switch (part) {
    case 'from':
      next = { from: clamp(day, home.from, current.to), to: current.to };
      break;
    case 'to':
      next = { from: current.from, to: clamp(day, current.from, home.to) };
      break;
    case 'window': {
      if (!zoom) return null;
      const length = current.to - current.from + 1;
      const into = segments.find((s) => s.holds(day)) ?? home;
      const kept = Math.min(length, into.days);
      const from = clamp(day, into.from, into.to - kept + 1);
      next = { from, to: from + kept - 1 };
      break;
    }
    default:
      throw new Error(`"${part}" is not a part of the range`);
  }
  if (segments.length === 1 && next.from === segments[0].from && next.to === segments[0].to) return null;
  if (!zoomSpan(run, next)) throw new Error(`the range ${zoomText(next)} is not one run period's`);
  return next;
}

/* ══ the ghost's outline, and finding an hour by where it was drawn ══════ */

/**
 * The region holding at least `share` of a cloud of marks, as the boundary of
 * the densest cells of a fixed grid (FR-020b, research.md R9).
 *
 * `xs` and `ys` are plot coordinates. Cells are taken in descending count,
 * ties broken by cell index so two draws of one cloud agree, until they hold
 * the share. The boundary is traced by marching squares over the cells'
 * membership, with the cell centres as the lattice and a level of one half,
 * so every segment lands midway between a taken cell and an untaken one. No
 * smoothing: the outline is the cells, which is the claim it makes.
 *
 * Returns line segments `[[x, y], [x, y]]` in plot coordinates.
 */
export function densityOutline(xs, ys, box, share = 0.9, nx = 48, ny = 32) {
  const counts = new Uint32Array(nx * ny);
  let total = 0;
  const cw = (box.x1 - box.x0) / nx;
  const ch = (box.y1 - box.y0) / ny;
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const cx = Math.min(nx - 1, Math.max(0, Math.floor((x - box.x0) / cw)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor((y - box.y0) / ch)));
    counts[cx + cy * nx] += 1;
    total += 1;
  }
  if (!total) return [];
  const order = Array.from(counts.keys()).filter((c) => counts[c] > 0);
  order.sort((a, b) => counts[b] - counts[a] || a - b);
  const taken = new Uint8Array(nx * ny);
  let held = 0;
  for (const c of order) {
    if (held >= share * total) break;
    taken[c] = 1;
    held += counts[c];
  }
  // The lattice is the cell centres with a margin of one untaken cell all
  // round, so a region touching the grid's edge still closes.
  const lx = nx + 2;
  const ly = ny + 2;
  const at = (ix, iy) => (ix >= 1 && iy >= 1 && ix <= nx && iy <= ny ? taken[ix - 1 + (iy - 1) * nx] : 0);
  const px = (ix) => box.x0 + (ix - 0.5) * cw;
  const py = (iy) => box.y0 + (iy - 0.5) * ch;
  const segments = [];
  for (let iy = 0; iy < ly - 1; iy += 1) {
    for (let ix = 0; ix < lx - 1; ix += 1) {
      const bl = at(ix, iy);
      const br = at(ix + 1, iy);
      const tr = at(ix + 1, iy + 1);
      const tl = at(ix, iy + 1);
      const code = bl | (br << 1) | (tr << 2) | (tl << 3);
      if (code === 0 || code === 15) continue;
      const bottom = [px(ix + 0.5), py(iy)];
      const right = [px(ix + 1), py(iy + 0.5)];
      const top = [px(ix + 0.5), py(iy + 1)];
      const left = [px(ix), py(iy + 0.5)];
      const push = (a, b) => segments.push([a, b]);
      switch (code) {
        case 1: case 14: push(left, bottom); break;
        case 2: case 13: push(bottom, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(right, top); break;
        case 6: case 9: push(bottom, top); break;
        case 7: case 8: push(left, top); break;
        // The saddle, resolved one way for both cases: diagonal cells taken
        // alone are kept apart, which never joins two regions the grid split.
        case 5: push(left, top); push(bottom, right); break;
        case 10: push(left, bottom); push(right, top); break;
        default: break;
      }
    }
  }
  return segments;
}

/**
 * A uniform grid over the drawn marks, built once per frame, so a click finds
 * its nearest hour-identifiable mark in constant expected time instead of
 * testing every one of 8,760 (research.md R9).
 */
export function hourIndexOf(xs, ys, hours, cell = 12) {
  const buckets = new Map();
  for (let i = 0; i < xs.length; i += 1) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue;
    const key = `${Math.floor(xs[i] / cell)}:${Math.floor(ys[i] / cell)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(i);
  }
  return { xs, ys, hours, cell, buckets };
}

/** The hour of the mark nearest (x, y) within `reach`, or null where none is that close. */
export function nearestHour(index, x, y, reach = 10) {
  const { xs, ys, hours, cell, buckets } = index;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const ring = Math.ceil(reach / cell);
  let best = null;
  let bestD = reach * reach;
  for (let dx = -ring; dx <= ring; dx += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (const i of buckets.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
        if (d < bestD || (d === bestD && best !== null && hours[i] < best)) {
          bestD = d;
          best = hours[i];
        }
      }
    }
  }
  return best;
}

/**
 * One reading on the ghost and on the live run. Lettered `was → now` while a
 * ghost stands, and only then (FR-020b, FR-020c).
 */
export class WasNow {
  constructor(was, now) {
    this.was = was;
    this.now = now;
    Object.freeze(this);
  }
  letter(say) {
    return `${say(this.was)} → ${say(this.now)}`;
  }
}
