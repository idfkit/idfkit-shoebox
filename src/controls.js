/**
 * The console's declaration: what may be set, and what each setting means.
 *
 * This file is the one place a control exists. `model.js` reads it to write the
 * IDF, `console.js` reads it to draw the panel, and the sheet's five dimension
 * sliders are a named subset of it — so the drawing, the desk and the document
 * cannot disagree about what a control is called or what range it has.
 *
 * Nothing here touches an `IDFDocument`. These are descriptions; the appliers
 * that act on them live in `model.js`, next to the geometry they need.
 */

/* ══ controls ════════════════════════════════════════════════════════════ */

/**
 * A setting the console can draw and the model can apply.
 *
 * `key` is the property it owns on the flat parameter object. Everything the
 * panel needs to letter a row — the name, the unit, how the number reads — is
 * carried here rather than looked up somewhere else at draw time.
 */
class Control {
  constructor({ key, label, value, note = null, needs = null }) {
    if (!key) throw new Error('a control needs a key');
    this.key = key;
    this.label = label;
    this.value = value;
    this.note = note;
    // A predicate on the whole parameter set. False means this control is not
    // doing anything right now — the strip greys it and says why rather than
    // letting you turn something that is not connected to the model.
    this.needs = needs;
  }

  /** How this control's value reads in the margin. Overridden per kind. */
  format(v) {
    return String(v);
  }
}

/**
 * A continuous quantity, drawn as a ruled calibration face with a penciled tick.
 */
export class Scale extends Control {
  constructor({
    key, label, value, min, max, step,
    unit = '', digits = 2, zero = null, note = null, needs = null,
  }) {
    super({ key, label, value, note, needs });
    this.kind = 'scale';
    this.min = min;
    this.max = max;
    this.step = step;
    this.unit = unit;
    this.digits = digits;
    // What the low stop means, when it means something other than "a very small
    // number" — "None" at zero glazing says more than "0.00".
    this.zero = zero;
    Object.freeze(this);
  }

  format(v) {
    if (this.zero && !(v > 0)) return this.zero;
    return `${v.toFixed(this.digits)}${this.unit ? ` ${this.unit}` : ''}`;
  }

  /** Where the tick sits on the face, 0 to 1. */
  fraction(v) {
    return (v - this.min) / (this.max - this.min);
  }
}

/**
 * A small set of exclusive states, drawn as one segmented rule.
 *
 * Never a dropdown: the whole point of a console is that you can read the
 * current state of every channel without opening anything.
 */
export class Selector extends Control {
  constructor({ key, label, value, options, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'selector';
    this.options = options.map((o) => Object.freeze({ ...o }));
    Object.freeze(this);
  }

  format(v) {
    const found = this.options.find((o) => o.value === v);
    if (!found) throw new Error(`${this.key} has no option ${v}`);
    return found.label;
  }
}

/**
 * The building's north point, drawn as a north arrow you can turn.
 *
 * An angle set on a linear scale is a number you have to convert in your head
 * before it means anything. Set on a rose, it is the thing itself.
 */
export class Bearing extends Control {
  constructor({ key, label, value, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'bearing';
    Object.freeze(this);
  }

  format(v) {
    const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return `${v.toFixed(0)}° ${points[Math.round(v / 22.5) % 16]}`;
  }
}

/**
 * Four values that belong to four walls, drawn on a plan key rather than as
 * four rows.
 *
 * Window-to-wall ratio is not four numbers, it is one decision about a
 * building. Ruling each wall's scale along its own edge of a small plan is the
 * only arrangement where the number you are setting is beside the wall it
 * belongs to, and where the four read as a parti rather than a list.
 */
export class Facade extends Control {
  constructor({
    key, label, short, sides, min, max, step,
    unit = '', digits = 2, zero = null, note = null, needs = null,
  }) {
    // The plan key owns four keys, not one. `key` names the group.
    super({ key, label, value: null, note, needs });
    this.kind = 'facade';
    // What one wall of it is called when it is drawn on its own, away from the
    // plan key — the sheet's narrow label column has no room for the full name.
    this.short = short ?? label;
    // Drawn in compass order, which is also the order `boxSurfaces` generates.
    this.sides = sides.map((s) => Object.freeze({ ...s }));
    this.min = min;
    this.max = max;
    this.step = step;
    this.unit = unit;
    this.digits = digits;
    this.zero = zero;
    Object.freeze(this);
  }

  format(v) {
    if (this.zero && !(v > 0)) return this.zero;
    return `${v.toFixed(this.digits)}${this.unit ? ` ${this.unit}` : ''}`;
  }

  fraction(v) {
    return (v - this.min) / (this.max - this.min);
  }

  keys() {
    return this.sides.map((s) => s.key);
  }
}

/* ── the calendar ──────────────────────────────────────────────────────── */

export const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

/** Days per month, on the non-leap year an EnergyPlus weather file carries. */
export const DAYS_IN_MONTH = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

/**
 * A year of months as twelve characters, January first: `'111111111111'` is the
 * whole year, `'110000000011'` is November through February.
 *
 * A string rather than an array of booleans because a parameter has to behave
 * like a value everywhere the desk treats it as one: the permalink writes
 * `String(params[key])` and compares against the default with `!==`, and two
 * arrays holding the same twelve booleans are never `!==`-equal, so every link
 * would carry a mask nobody had set. Twelve characters also read in an address
 * bar, which is the point of the delta encoding.
 *
 * The empty mask is not a mask. A run with no months in it is a weather-file
 * run period EnergyPlus would refuse to start, so "at least one month" is part
 * of what a mask *is* rather than a rule bolted on at one of the three places
 * that set one — the control declaration, the console's gesture and the link
 * decoder all ask this question here.
 */
export const isMonthMask = (v) => typeof v === 'string' && /^[01]{12}$/.test(v) && v.includes('1');

/** The year entire, which is what the desk starts at and what a benchmark is. */
export const FULL_YEAR = '111111111111';
export const isWholeYear = (mask) => mask === FULL_YEAR;

/**
 * The unbroken groups of months in a mask, as inclusive 1-based month numbers.
 *
 * This is the whole reason the desk can offer months rather than a span: months
 * that do not touch cannot be one `RunPeriod`, and EnergyPlus is perfectly
 * happy to be handed several. Each group becomes one, in calendar order.
 *
 * December and January are deliberately *not* joined when both are set and the
 * months between them are not. A `RunPeriod` whose end date precedes its begin
 * date does wrap the turn of the year in EnergyPlus, but it would run those two
 * months as one environment out of calendar order, and every reading on this
 * sheet — the chart's month ticks, the schedule's columns, the bill's
 * environments — is lettered from the timestamps that come back. Two groups in
 * January-to-December order is the arrangement that stays legible.
 */
export function monthSpans(mask) {
  if (!isMonthMask(mask)) throw new Error(`"${mask}" is not a twelve-month mask`);
  const spans = [];
  for (let m = 0; m < 12; m += 1) {
    if (mask[m] !== '1') continue;
    if (spans.length && spans.at(-1).to === m) spans.at(-1).to = m + 1;
    else spans.push({ from: m + 1, to: m + 1 });
  }
  return spans;
}

/** The hours a mask covers, which is what the Run strip's meter counts. */
export function monthHours(mask) {
  let days = 0;
  for (let m = 0; m < 12; m += 1) if (mask[m] === '1') days += DAYS_IN_MONTH[m];
  return days * 24;
}

const spanLabel = ({ from, to }) =>
  from === to ? MONTHS[from - 1] : `${MONTHS[from - 1]}–${MONTHS[to - 1]}`;

/** `a`, `a and b`, `a, b and c` — a list a sentence can end on. */
const sentenceList = (items) =>
  items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * Which months are simulated, drawn as a twelve-cell year you set month by
 * month.
 *
 * The run period used to be two numbers on two calibration faces, which could
 * only ever describe one unbroken span and made "January and July" — the
 * two-season comparison anyone actually wants from a shoebox — impossible to
 * ask for. A year of cells can be worked with one gesture, states which months
 * are in the run without arithmetic, and can say plainly how many run periods
 * the engine is being handed, which is the part of this that is an EnergyPlus
 * fact rather than a preference.
 */
export class Calendar extends Control {
  constructor({ key, label, value, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'calendar';
    if (!isMonthMask(value)) throw new Error(`${key} starts at "${value}", which is not a mask`);
    Object.freeze(this);
  }

  format(v) {
    if (isWholeYear(v)) return 'All year';
    const spans = monthSpans(v);
    if (spans.length === 1) return spanLabel(spans[0]);
    const months = [...v].filter((c) => c === '1').length;
    return `${months} months · ${spans.length} periods`;
  }

  /** What the engine is actually being handed, in its own vocabulary. */
  periods(v) {
    const spans = monthSpans(v);
    const count = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'][spans.length - 1];
    const what = isWholeYear(v) ? 'the whole year' : sentenceList(spans.map(spanLabel));
    return `${count} run period${spans.length > 1 ? 's' : ''}: ${what}.`;
  }
}

/**
 * The occupied span of a day, drawn as a 24-hour band you sweep.
 *
 * The one control on the desk that is a shape rather than a number, and it is
 * the shape an architect actually argues about: when the building is used. It
 * writes a `Schedule:Compact`, so the band is the schedule.
 */
export class Profile extends Control {
  constructor({ key, label, from, to, note = null, needs = null }) {
    super({ key, label, value: null, note, needs });
    this.kind = 'profile';
    this.from = from; // key holding the first occupied hour
    this.to = to; // key holding the first unoccupied hour
    Object.freeze(this);
  }
}

/* ══ metering ════════════════════════════════════════════════════════════ */

/**
 * One term of a reading, named by the EnergyPlus output variable that carries
 * it.
 *
 * Every variable used here reports watts. That is not a coincidence and it was
 * not the first attempt: the rail was originally built out of the per-mechanism
 * variables — infiltration and ventilation in joules, ideal loads in watts —
 * and summing them did not close, because those are terms of different
 * balances. `Zone Air Heat Balance …` is one purpose-built family covering the
 * zone *air* balance and nothing else, and it does close. Measured on the
 * design days, to about a hundredth of a percent.
 */
export class Term {
  constructor({ variable, sign = 1, perBuilding = false }) {
    this.variable = variable;
    this.sign = sign;
    // Reported for the whole building rather than for the one zone, so it
    // arrives already multiplied by the zone multiplier and has to be divided
    // back down before it can be added to terms that were not. Found by
    // arithmetic, not by reading: at a multiplier of 3 the other four terms
    // summed to −25,251 W and this one read 75,756 W, which is 25,252 × 3.
    this.perBuilding = perBuilding;
    Object.freeze(this);
  }
}

/**
 * What a channel is actually contributing, as opposed to what you set it to.
 *
 * `rail` marks the readings that are terms of the zone *air* heat balance and
 * therefore sum to roughly zero. The others are diagnostics: true readings of a
 * real quantity, but not summable against the rail terms, so the rail leaves
 * them out and the strip says so.
 */
export class Meter {
  constructor({ label, terms, rail = false, note = null, derived = false }) {
    this.label = label;
    this.terms = terms;
    this.rail = rail;
    this.note = note;
    // Read off the geometry rather than out of the ESO, so it is true before
    // anything has been simulated.
    this.derived = derived;
    Object.freeze(this);
  }
}

/* ══ channels ════════════════════════════════════════════════════════════ */

/**
 * One path heat takes, with everything that shapes it.
 *
 * The strips are ordered the way a signal chain is ordered, which here is the
 * order the physics happens: the sun arrives at a site, past whatever the
 * neighbours put in the way, through the glass, past the shades, into the
 * fabric, out of the mass; the air trades with outdoors and with whatever the
 * building is doing to itself; and the system, like a master bus, answers
 * everything above it. The last two strips are the engine room.
 *
 * `bypassable` channels can be taken out of the path entirely — not turned
 * down, removed: the applier deletes their objects from the document. A channel
 * that cannot be bypassed is one with no "off" that means anything; a building
 * has dimensions whether you like it or not.
 */
export class Channel {
  constructor({
    id, index, name, term, blurb, controls,
    meter = null, bypassable = true, bypassed = false, requires = null, prices = false,
  }) {
    this.id = id;
    this.index = index;
    this.name = name;
    this.term = term; // its symbol in the heat balance, set in the header
    this.blurb = blurb;
    this.controls = Object.freeze(controls);
    this.meter = meter;
    this.bypassable = bypassable;
    // This channel prices the run rather than shaping it. Nothing it owns
    // reaches the IDF, so nothing it owns belongs in the solve key either --
    // turning a tariff must re-letter the bill within the frame and must never
    // start a simulation, because the physics did not move. The strip says so,
    // in the one place where "set this and nothing runs" could otherwise read
    // as a control that had stopped working.
    this.prices = prices;
    // Where a channel starts. The ones that start out are the ones whose
    // objects are absent from the baseline document -- the stock
    // `1ZoneUncontrolled.idf` fabric and geometry, minus the demonstration
    // loads the stock file hung on it (see the note atop `model.js`). Grounds
    // starts out for exactly that reason: its 5.25 kW is the stock example's,
    // but a load nobody engaged has no business in anyone's baseline.
    this.bypassed = bypassed;
    // A precondition the rest of the desk has to meet. Unmet, the channel is
    // not written into the document at all and the strip states what is
    // missing — a patch that cannot be made is worth saying out loud, and is
    // certainly worth more than objects the engine would reject.
    this.requires = requires;
    Object.freeze(this);
  }

  /** Every parameter key this channel owns, plan keys expanded. */
  keys() {
    return this.controls.flatMap((c) =>
      c.kind === 'facade' ? c.keys() : c.kind === 'profile' ? [c.from, c.to] : [c.key],
    );
  }
}

const ORIENTATIONS = [
  { key: 'wwrN', side: 'north', label: 'N' },
  { key: 'wwrE', side: 'east', label: 'E' },
  { key: 'wwrS', side: 'south', label: 'S' },
  { key: 'wwrW', side: 'west', label: 'W' },
];

const SHADE_SIDES = [
  { key: 'ohN', side: 'north', label: 'N' },
  { key: 'ohE', side: 'east', label: 'E' },
  { key: 'ohS', side: 'south', label: 'S' },
  { key: 'ohW', side: 'west', label: 'W' },
];

const glazed = (p) => p.wwrN > 0 || p.wwrE > 0 || p.wwrS > 0 || p.wwrW > 0;
const layered = (p) => p.glazingModel === 'Layered';

export const CHANNELS = Object.freeze([
  new Channel({
    id: 'massing',
    index: '00',
    name: 'Massing',
    term: 'A∕V',
    blurb: 'The box itself. Every channel below is measured against the envelope this makes.',
    bypassable: false,
    meter: new Meter({ label: 'Envelope ÷ volume', terms: [], derived: true }),
    controls: [
      new Scale({ key: 'width', label: 'Width', value: 15.24, min: 4, max: 40, step: 0.01, unit: 'm' }),
      new Scale({ key: 'depth', label: 'Depth', value: 15.24, min: 4, max: 40, step: 0.01, unit: 'm' }),
      new Scale({ key: 'height', label: 'Height', value: 4.572, min: 2.4, max: 12, step: 0.01, unit: 'm' }),
      new Scale({
        key: 'multiplier',
        label: 'Zone multiplier',
        value: 1,
        min: 1,
        max: 30,
        step: 1,
        digits: 0,
        unit: '×',
        note: 'Stands identical floors on this one. Loads scale; the drawing does not.',
      }),
    ],
  }),

  new Channel({
    id: 'site',
    index: '01',
    name: 'Site',
    term: 'Q☼',
    blurb:
      'Where the box stands and which way it faces. North turns the building under the sun — the vertices do not move, so the drawing turns its north point instead.',
    bypassable: false,
    controls: [
      new Bearing({
        key: 'northAxis',
        label: 'North axis',
        value: 0,
        note: 'Building.north_axis. At 0 the glazed wall of the stock model faces due south.',
      }),
      new Selector({
        key: 'terrain',
        label: 'Terrain',
        value: 'Suburbs',
        note: 'Sets the wind profile the exterior film coefficients are computed against.',
        options: [
          { value: 'Country', label: 'Country' },
          { value: 'Suburbs', label: 'Suburb' },
          { value: 'City', label: 'City' },
          { value: 'Ocean', label: 'Ocean' },
        ],
      }),
      new Scale({
        key: 'groundReflect',
        label: 'Ground reflectance',
        value: 0.2,
        min: 0,
        max: 0.9,
        step: 0.01,
        digits: 2,
        note: 'Fresh snow reads near 0.7, asphalt near 0.1.',
      }),
      new Scale({
        key: 'groundTemp',
        label: 'Ground temperature',
        value: 18,
        min: 2,
        max: 26,
        step: 0.5,
        digits: 1,
        unit: '°C',
        needs: (p) => p.floorBoundary === 'Ground',
        note: 'Under a conditioned slab, not the undisturbed soil. Only reaches the model with a grounded floor.',
      }),
      new Selector({
        key: 'solarDist',
        label: 'Solar distribution',
        value: 'FullExterior',
        note: 'What the engine bothers to shade. Minimal ignores every overhang on the sheet.',
        options: [
          { value: 'MinimalShadowing', label: 'Minimal' },
          { value: 'FullExterior', label: 'Exterior' },
          { value: 'FullInteriorAndExterior', label: 'Full' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'context',
    index: '02',
    name: 'Context',
    term: 'Q☼∅',
    blurb:
      'The neighbours. One obstructing slab at a bearing and a distance, which is all it takes to find out whose shadow the south elevation you designed is standing in.',
    bypassed: true,
    meter: new Meter({ label: 'Obstruction altitude', terms: [], derived: true }),
    controls: [
      new Bearing({ key: 'ctxAzimuth', label: 'Bearing from site', value: 180 }),
      new Scale({ key: 'ctxDistance', label: 'Distance', value: 20, min: 3, max: 120, step: 0.5, digits: 1, unit: 'm' }),
      new Scale({ key: 'ctxHeight', label: 'Height', value: 18, min: 2, max: 120, step: 0.5, digits: 1, unit: 'm' }),
      new Scale({ key: 'ctxWidth', label: 'Width', value: 40, min: 4, max: 200, step: 1, digits: 0, unit: 'm' }),
    ],
  }),

  new Channel({
    id: 'glazing',
    index: '03',
    name: 'Glazing',
    term: 'Q☼→',
    blurb:
      'The openings, wall by wall. Punched lights keep their proportion at any ratio; a ribbon spends the same area on width instead.',
    meter: new Meter({
      label: 'Transmitted solar',
      terms: [new Term({ variable: 'Enclosure Windows Total Transmitted Solar Radiation Rate' })],
      note: 'Reaches the air through the surfaces, so it is read here and summed under Fabric.',
    }),
    controls: [
      new Facade({
        key: 'wwr',
        label: 'Window-to-wall ratio',
        short: 'Glazing',
        sides: ORIENTATIONS,
        min: 0,
        max: 0.9,
        step: 0.01,
        digits: 2,
        zero: 'Solid',
      }),
      new Selector({
        key: 'aperture',
        label: 'Aperture',
        value: 'Punched',
        note: 'How the ratio is spent: as a proportioned light, a band, or a full-height slot.',
        options: [
          { value: 'Punched', label: 'Punched' },
          { value: 'Ribbon', label: 'Ribbon' },
          { value: 'Full', label: 'Full height' },
        ],
      }),
      new Scale({
        key: 'sill',
        label: 'Sill height',
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        digits: 2,
        needs: (p) => p.aperture !== 'Full',
        note: 'Where the opening sits in its travel. 0 is on the floor, 1 is under the ceiling.',
      }),
      new Selector({
        key: 'glazingModel',
        label: 'Glazing model',
        value: 'Simple',
        note: 'Simple takes the three numbers off a product sheet. Layered builds a real assembly, which is what a blind can be hung on.',
        options: [
          { value: 'Simple', label: 'Simple' },
          { value: 'Layered', label: 'Layered' },
        ],
      }),
      new Scale({
        key: 'uFactor',
        label: 'U-factor',
        value: 1.8,
        min: 0.4,
        max: 6,
        step: 0.01,
        unit: 'W/m²K',
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'shgc',
        label: 'SHGC',
        value: 0.4, min: 0.05, max: 0.9, step: 0.01, digits: 2,
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'visT',
        label: 'Visible transmittance',
        value: 0.6, min: 0.05, max: 0.9, step: 0.01, digits: 2,
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'paneEmiss',
        label: 'Low-e coating',
        value: 0.84,
        min: 0.04,
        max: 0.84,
        step: 0.01,
        digits: 2,
        needs: layered,
        note: 'Inboard pane, outside face. 0.84 is uncoated float; 0.04 is a hard coat.',
      }),
      new Scale({
        key: 'gapWidth',
        label: 'Cavity width',
        value: 0.013,
        min: 0.006,
        max: 0.05,
        step: 0.001,
        digits: 3,
        unit: 'm',
        needs: layered,
      }),
      new Scale({
        key: 'frameWidth',
        label: 'Frame width',
        value: 0,
        min: 0,
        max: 0.2,
        step: 0.005,
        digits: 3,
        unit: 'm',
        zero: 'None',
        needs: glazed,
        note: 'Adds a framed perimeter outside the glass, with its own conductance.',
      }),
      new Scale({
        key: 'frameCond',
        label: 'Frame conductance',
        value: 3,
        min: 0.5,
        max: 12,
        step: 0.1,
        digits: 1,
        unit: 'W/m²K',
        needs: (p) => p.frameWidth > 0,
      }),
    ],
  }),

  new Channel({
    id: 'shading',
    index: '04',
    name: 'Shading',
    term: 'Q☼↓',
    blurb:
      'Overhangs run the width of their opening, so what you set is the one thing that matters on a sunny elevation: how far they reach. Fins stand at both jambs.',
    meter: new Meter({ label: 'Shade area', terms: [], derived: true }),
    controls: [
      new Facade({
        key: 'overhang',
        label: 'Overhang projection',
        short: 'Overhang',
        sides: SHADE_SIDES,
        min: 0, max: 3, step: 0.01, digits: 2, unit: 'm', zero: 'None',
      }),
      new Scale({
        key: 'ohRise',
        label: 'Overhang above head',
        value: 0, min: 0, max: 1.5, step: 0.01, unit: 'm', zero: 'At head',
        note: 'Lifting it off the head lets low winter sun back under.',
      }),
      new Scale({
        key: 'fin',
        label: 'Side fins',
        value: 0, min: 0, max: 3, step: 0.01, unit: 'm', zero: 'None',
        needs: glazed,
        note: 'Stood at both jambs of every opening there is.',
      }),
      new Scale({
        key: 'finOffset',
        label: 'Fin offset from jamb',
        value: 0, min: 0, max: 1.5, step: 0.01, unit: 'm', zero: 'At jamb',
        needs: (p) => p.fin > 0,
      }),
    ],
  }),

  new Channel({
    id: 'blinds',
    index: '05',
    name: 'Blinds',
    term: 'Q☼⇅',
    blurb:
      'Shading that answers the weather instead of standing still. The control decides when it deploys, and the slat angle decides what gets through when it does.',
    bypassed: true,
    requires: {
      test: (p) => layered(p) && glazed(p),
      // Simple glazing is one equivalent layer with no cavity to hang anything
      // in, and EnergyPlus will not accept a shading device on it.
      reason: 'Needs the layered glazing model and at least one opening.',
    },
    meter: new Meter({
      label: 'Transmitted solar',
      terms: [new Term({ variable: 'Enclosure Windows Total Transmitted Solar Radiation Rate' })],
      note: 'The same reading as Glazing. Watch it fall as the blind deploys.',
    }),
    controls: [
      new Selector({
        key: 'shadeType',
        label: 'Device',
        value: 'InteriorBlind',
        options: [
          { value: 'InteriorBlind', label: 'Interior' },
          { value: 'ExteriorBlind', label: 'Exterior' },
          { value: 'BetweenGlassBlind', label: 'Mid-pane' },
        ],
        note: 'Exterior stops the heat before it is in the room, and weathers for a living.',
      }),
      new Selector({
        key: 'shadeControl',
        label: 'Deploys',
        value: 'OnIfHighSolarOnWindow',
        options: [
          { value: 'AlwaysOn', label: 'Always' },
          { value: 'OnIfHighSolarOnWindow', label: 'On solar' },
          { value: 'OnIfHighZoneAirTemperature', label: 'On zone temp' },
          { value: 'OnIfHighOutdoorAirTemperature', label: 'On outdoor temp' },
        ],
      }),
      new Scale({
        key: 'shadeSetpoint',
        label: 'Setpoint',
        value: 200, min: 20, max: 600, step: 5, digits: 0,
        needs: (p) => p.shadeControl !== 'AlwaysOn',
        note: 'W/m² on the glass, or °C, depending on what it is watching.',
      }),
      new Scale({ key: 'slatAngle', label: 'Slat angle', value: 45, min: 0, max: 180, step: 1, digits: 0, unit: '°' }),
      new Scale({ key: 'slatWidth', label: 'Slat width', value: 0.025, min: 0.01, max: 0.12, step: 0.001, digits: 3, unit: 'm' }),
    ],
  }),

  new Channel({
    id: 'fabric',
    index: '06',
    name: 'Fabric',
    term: 'Q↔',
    blurb:
      'The opaque envelope. Bypassed, every surface goes adiabatic and the box becomes a flask — which is the cleanest way there is to see what the other channels are worth.',
    meter: new Meter({
      label: 'Surface convection to air',
      rail: true,
      terms: [new Term({ variable: 'Zone Air Heat Balance Surface Convection Rate' })],
      note: 'Every inside face, glass included. This is where solar and conduction reach the air.',
    }),
    controls: [
      new Scale({
        key: 'wallR', label: 'Wall resistance', value: 2.290965,
        min: 0.2, max: 10, step: 0.005, unit: 'm²K/W',
        note: 'The stock R13LAYER is 2.29.',
      }),
      new Scale({ key: 'roofR', label: 'Roof resistance', value: 5.456, min: 0.2, max: 14, step: 0.005, unit: 'm²K/W' }),
      new Scale({
        key: 'wallMass', label: 'Wall mass layer', value: 0,
        min: 0, max: 0.4, step: 0.005, digits: 3, unit: 'm', zero: 'None',
        note: 'Heavyweight masonry set inboard of the insulation.',
      }),
      new Scale({ key: 'wallAbs', label: 'Wall absorptance', value: 0.75, min: 0.05, max: 0.95, step: 0.01, digits: 2 }),
      new Scale({
        key: 'roofAbs', label: 'Roof absorptance', value: 0.75, min: 0.05, max: 0.95, step: 0.01, digits: 2,
        note: 'A cool roof sits near 0.2, a bitumen one near 0.9.',
      }),
      new Scale({
        key: 'emittance', label: 'Thermal emittance', value: 0.9, min: 0.05, max: 0.95, step: 0.01, digits: 2,
        note: 'How well the outer face radiates to the sky at night.',
      }),
      new Selector({
        key: 'floorBoundary', label: 'Floor boundary', value: 'Adiabatic',
        note: 'The stock model floats the slab. Grounding it opens a path that never sleeps.',
        options: [
          { value: 'Adiabatic', label: 'Adiabatic' },
          { value: 'Ground', label: 'Ground' },
        ],
      }),
      new Selector({
        key: 'windExposure', label: 'Wind exposure', value: 'WindExposed',
        options: [
          { value: 'WindExposed', label: 'Exposed' },
          { value: 'NoWind', label: 'Sheltered' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'mass',
    index: '07',
    name: 'Mass',
    term: 'Qsto',
    blurb:
      'What the building remembers. Bypassed, the slab is swapped for a massless layer of the same resistance, so the only thing that changes is storage.',
    meter: new Meter({
      label: 'Air energy storage',
      rail: true,
      // The accumulation side of the balance, so it enters the rail negated:
      // heat going into store is heat the air does not keep.
      terms: [new Term({ variable: 'Zone Air Heat Balance Air Energy Storage Rate', sign: -1 })],
    }),
    controls: [
      new Scale({
        key: 'slab', label: 'Slab thickness', value: 0.1014984,
        min: 0.02, max: 0.6, step: 0.001, digits: 3, unit: 'm',
        note: 'Four inches of heavyweight concrete is the stock example.',
      }),
      new Selector({
        key: 'slabMaterial', label: 'Slab material', value: 'Heavy',
        options: [
          { value: 'Heavy', label: 'Concrete' },
          { value: 'Light', label: 'Lightweight' },
          { value: 'Timber', label: 'Timber' },
        ],
      }),
      new Scale({
        key: 'internalMass', label: 'Internal mass', value: 0,
        min: 0, max: 4, step: 0.05, digits: 2, unit: '× floor', zero: 'None',
        note: 'Partitions and furniture, as a multiple of the floor area.',
      }),
      new Scale({
        key: 'internalMassThickness', label: 'Its thickness', value: 0.1,
        min: 0.01, max: 0.4, step: 0.005, digits: 3, unit: 'm',
        needs: (p) => p.internalMass > 0,
      }),
      new Selector({
        key: 'hbAlgorithm', label: 'Heat balance', value: 'ConductionTransferFunction',
        note: 'Finite difference resolves the slab through its depth, and costs several times the run time.',
        options: [
          { value: 'ConductionTransferFunction', label: 'CTF' },
          { value: 'ConductionFiniteDifference', label: 'CondFD' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'air',
    index: '08',
    name: 'Air',
    term: 'Qinf',
    blurb:
      'Leakage you did not ask for, and ventilation you did. The night-flush controls only open the building when it actually helps: warm inside, cooler out, and a real difference between the two.',
    bypassed: true,
    meter: new Meter({
      label: 'Outdoor air transfer',
      rail: true,
      // Infiltration and ventilation together, which is the shape of the term
      // in the air balance — the two enter the zone air the same way.
      terms: [new Term({ variable: 'Zone Air Heat Balance Outdoor Air Transfer Rate' })],
    }),
    controls: [
      new Scale({
        key: 'infiltration', label: 'Infiltration', value: 0.5,
        min: 0, max: 3, step: 0.01, digits: 2, unit: 'ACH', zero: 'Sealed',
      }),
      new Scale({
        key: 'infConstant', label: 'Constant coefficient', value: 1,
        min: 0, max: 1, step: 0.01, digits: 2,
        needs: (p) => p.infiltration > 0,
        note: 'The A of A + B·ΔT + C·v. Move weight off it and on to the two below to make leakage answer the weather.',
      }),
      new Scale({
        key: 'infWind', label: 'Wind coefficient', value: 0,
        min: 0, max: 0.4, step: 0.005, digits: 3, zero: 'None',
        needs: (p) => p.infiltration > 0,
      }),
      new Scale({
        key: 'infStack', label: 'Stack coefficient', value: 0,
        min: 0, max: 0.1, step: 0.001, digits: 3, zero: 'None',
        needs: (p) => p.infiltration > 0,
      }),
      new Scale({
        key: 'ventilation', label: 'Ventilation', value: 0,
        min: 0, max: 12, step: 0.05, digits: 2, unit: 'ACH', zero: 'None',
        note: 'Openable area, as air changes. Night flush lives here.',
      }),
      new Selector({
        key: 'ventType', label: 'Driven by', value: 'Natural',
        needs: (p) => p.ventilation > 0,
        options: [
          { value: 'Natural', label: 'Stack' },
          { value: 'Intake', label: 'Supply fan' },
          { value: 'Exhaust', label: 'Extract fan' },
          { value: 'Balanced', label: 'Balanced' },
        ],
      }),
      new Scale({
        key: 'ventMinIndoor', label: 'Open above indoor', value: 22,
        min: 10, max: 32, step: 0.5, digits: 1, unit: '°C',
        needs: (p) => p.ventilation > 0,
      }),
      new Scale({
        key: 'ventMaxOutdoor', label: 'Open below outdoor', value: 20,
        min: 5, max: 32, step: 0.5, digits: 1, unit: '°C',
        needs: (p) => p.ventilation > 0,
      }),
      new Scale({
        key: 'ventDeltaT', label: 'Minimum ΔT', value: 2,
        min: 0, max: 10, step: 0.5, digits: 1, unit: 'K',
        needs: (p) => p.ventilation > 0,
        note: 'Indoor minus outdoor. Below this the opening is not worth the draught.',
      }),
      new Scale({
        key: 'ventMaxWind', label: 'Shut above wind', value: 40,
        min: 1, max: 40, step: 0.5, digits: 1, unit: 'm/s',
        needs: (p) => p.ventilation > 0,
      }),
    ],
  }),

  new Channel({
    id: 'gains',
    index: '09',
    name: 'Gains',
    term: 'Qint',
    blurb:
      'People, light and equipment on one occupancy profile. Bypassed, the zone holds nothing that gives off heat; these are the first gains that land.',
    bypassed: true,
    meter: new Meter({
      label: 'Internal convective gain',
      rail: true,
      terms: [new Term({ variable: 'Zone Air Heat Balance Internal Convective Heat Gain Rate' })],
    }),
    controls: [
      new Scale({
        key: 'occupancy', label: 'Occupant density', value: 12,
        min: 4, max: 60, step: 0.5, digits: 1, unit: 'm²/pp',
        note: 'Open-plan office is near 12; a lecture room near 2.',
      }),
      new Scale({
        key: 'activity', label: 'Activity level', value: 120,
        min: 70, max: 400, step: 5, digits: 0, unit: 'W/pp',
        note: 'Seated work is about 120 W. A gym is three times that.',
      }),
      new Scale({ key: 'lighting', label: 'Lighting', value: 8, min: 0, max: 30, step: 0.1, digits: 1, unit: 'W/m²', zero: 'Dark' }),
      new Scale({
        key: 'lightRadiant', label: 'Lighting radiant fraction', value: 0.42,
        min: 0, max: 0.9, step: 0.01, digits: 2,
        needs: (p) => p.lighting > 0,
        note: 'What goes to the surfaces rather than straight to the air.',
      }),
      new Scale({ key: 'equipment', label: 'Equipment', value: 8, min: 0, max: 60, step: 0.1, digits: 1, unit: 'W/m²', zero: 'None' }),
      new Scale({
        key: 'equipLatent', label: 'Equipment latent fraction', value: 0,
        min: 0, max: 0.6, step: 0.01, digits: 2, zero: 'Dry',
        needs: (p) => p.equipment > 0,
      }),
      new Profile({
        key: 'occupied', label: 'Occupied hours', from: 'occFrom', to: 'occTo',
        note: 'Writes a Schedule:Compact. Outside the band the gains fall to a tenth.',
      }),
      new Selector({
        key: 'weekend', label: 'Weekends', value: 'Unoccupied',
        options: [
          { value: 'Unoccupied', label: 'Closed' },
          { value: 'Occupied', label: 'Open' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'daylight',
    index: '10',
    name: 'Daylight',
    term: 'Qlux',
    blurb:
      'The channel that closes the loop. A sensor in the room dims the lights against the daylight the windows let in, so a bigger opening buys back some of the load it costs.',
    bypassed: true,
    requires: {
      test: (p) => glazed(p),
      reason: 'Needs at least one opening to see daylight through.',
    },
    meter: new Meter({
      label: 'Lighting power',
      terms: [new Term({ variable: 'Zone Lights Electricity Rate' })],
      note: 'Watch it fall away from the Gains setting as the sensor dims.',
    }),
    controls: [
      new Selector({
        key: 'dlControl', label: 'Dimming', value: 'Continuous',
        options: [
          { value: 'Continuous', label: 'Continuous' },
          { value: 'ContinuousOff', label: 'Cont. + off' },
          { value: 'Stepped', label: 'Stepped' },
        ],
      }),
      new Scale({ key: 'dlSetpoint', label: 'Illuminance setpoint', value: 500, min: 100, max: 1000, step: 10, digits: 0, unit: 'lx' }),
      new Scale({
        key: 'dlFraction', label: 'Fraction controlled', value: 1,
        min: 0.1, max: 1, step: 0.05, digits: 2,
        note: 'How much of the installed lighting the sensor speaks for.',
      }),
      new Scale({
        key: 'dlDepth', label: 'Sensor depth', value: 0.5,
        min: 0.1, max: 0.95, step: 0.01, digits: 2,
        note: 'Across the plan from the south wall. Deep in the room is the honest place to put it.',
      }),
      new Scale({ key: 'dlHeight', label: 'Sensor height', value: 0.8, min: 0.1, max: 2, step: 0.05, digits: 2, unit: 'm' }),
    ],
  }),

  new Channel({
    id: 'system',
    index: '11',
    name: 'System',
    term: 'Qsys',
    blurb:
      'The master bus. Bypassed, this is the free-running zone the sheet was built on and the plate reads a float. Engaged, an ideal unit holds the setpoints and the plate reads what that costs.',
    bypassed: true,
    meter: new Meter({
      label: 'System air transfer',
      rail: true,
      terms: [
        new Term({ variable: 'Zone Air Heat Balance System Air Transfer Rate', perBuilding: true }),
      ],
    }),
    controls: [
      new Scale({ key: 'heatSet', label: 'Heating setpoint', value: 20, min: 10, max: 26, step: 0.5, digits: 1, unit: '°C' }),
      new Scale({ key: 'coolSet', label: 'Cooling setpoint', value: 26, min: 18, max: 34, step: 0.5, digits: 1, unit: '°C' }),
      new Scale({
        key: 'setback', label: 'Night setback', value: 0,
        min: 0, max: 10, step: 0.5, digits: 1, unit: 'K', zero: 'None',
        note: 'Widens the band outside the occupied hours set under Gains.',
      }),
      new Selector({
        key: 'availability', label: 'Available', value: 'Always',
        options: [
          { value: 'Always', label: 'Always' },
          { value: 'Occupied', label: 'Occupied' },
          { value: 'HeatingOnly', label: 'Heat only' },
          { value: 'CoolingOnly', label: 'Cool only' },
        ],
      }),
      new Scale({
        key: 'outdoorAir', label: 'Outdoor air', value: 0,
        min: 0, max: 20, step: 0.5, digits: 1, unit: 'L/s·pp', zero: 'None',
        note: 'Air the system has to condition, as opposed to the openings above.',
      }),
      new Selector({
        key: 'economizer', label: 'Economiser', value: 'NoEconomizer',
        needs: (p) => p.outdoorAir > 0,
        options: [
          { value: 'NoEconomizer', label: 'None' },
          { value: 'DifferentialDryBulb', label: 'Drybulb' },
          { value: 'DifferentialEnthalpy', label: 'Enthalpy' },
        ],
      }),
      new Scale({
        key: 'heatRecovery', label: 'Heat recovery', value: 0,
        min: 0, max: 0.9, step: 0.01, digits: 2, zero: 'None',
        needs: (p) => p.outdoorAir > 0,
        note: 'Sensible effectiveness on the outdoor air stream.',
      }),
      new Scale({ key: 'supplyMaxT', label: 'Max supply air', value: 50, min: 25, max: 60, step: 1, digits: 0, unit: '°C' }),
      new Scale({ key: 'supplyMinT', label: 'Min supply air', value: 13, min: 5, max: 20, step: 0.5, digits: 1, unit: '°C' }),
      new Selector({
        key: 'humidity', label: 'Dehumidification', value: 'None',
        options: [
          { value: 'None', label: 'None' },
          { value: 'ConstantSensibleHeatRatio', label: 'Fixed SHR' },
          { value: 'ConstantSupplyHumidityRatio', label: 'Fixed w' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'grounds',
    index: '12',
    name: 'Grounds',
    term: '☾',
    blurb:
      'The site after dark. The stock example hangs 5.25 kW of car-park lighting off this model — 23 MWh a year against the building\'s 18 — which is why the bill sections it under Site, outside the building intensity, and why it starts bypassed: a load that size belongs on a strip, not buried in the baseline.',
    bypassed: true,
    meter: new Meter({ label: 'Site electricity', terms: [], derived: true }),
    controls: [
      new Scale({
        key: 'extLights', label: 'Grounds lighting', value: 5.25,
        min: 0.05, max: 20, step: 0.05, digits: 2, unit: 'kW',
        note: 'Installed power across the site: car park, paths, floodlighting. The stock example carries 5.25 kW.',
      }),
      new Selector({
        key: 'extControl', label: 'Switched', value: 'AstronomicalClock',
        options: [
          { value: 'AstronomicalClock', label: 'Dusk to dawn' },
          { value: 'ScheduleNameOnly', label: 'Always on' },
        ],
        note: 'Dusk to dawn follows the sun at the site, so the same kilowatts burn longer hours in a northern winter.',
      }),
    ],
  }),

  new Channel({
    id: 'plant',
    index: '13',
    name: 'Plant',
    term: 'η',
    prices: true,
    bypassable: false,
    blurb:
      'What would have to supply the heat. The ideal unit above delivers it at 100 % efficiency and no efficiency is simulated anywhere in this model, so the plant is applied to the meter reading instead — and the bill prints the division rather than burying it.',
    requires: {
      test: (p, on) => on('system'),
      reason: 'Needs the System channel in the path before there is any heat to supply.',
    },
    meter: new Meter({ label: 'Heat at the meter', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'heatSource', label: 'Heating plant', value: 'GasBoiler',
        options: [
          { value: 'GasBoiler', label: 'Gas boiler' },
          { value: 'Resistance', label: 'Direct electric' },
          { value: 'HeatPump', label: 'Heat pump' },
        ],
      }),
      new Scale({
        key: 'heatEfficiency', label: 'Seasonal efficiency', value: 0.85,
        min: 0.5, max: 1.05, step: 0.01, digits: 2,
        needs: (p) => p.heatSource !== 'HeatPump',
        note: 'Fuel in against useful heat out, across the season.',
      }),
      new Scale({
        key: 'heatCOP', label: 'Seasonal COP', value: 3, min: 1.5, max: 5.5, step: 0.1, digits: 1,
        needs: (p) => p.heatSource === 'HeatPump',
        note: 'Heat delivered per unit of electricity, across the season.',
      }),
      new Scale({
        key: 'coolCOP', label: 'Cooling COP', value: 3.5, min: 2, max: 7, step: 0.1, digits: 1,
        note: 'The chiller is electric whatever the heat runs on.',
      }),
    ],
  }),

  new Channel({
    id: 'tariff',
    index: '14',
    name: 'Tariff',
    term: '¤',
    prices: true,
    bypassable: false,
    blurb:
      'The published rate, and what happens if it is wrong. Left alone the bill uses the tariff and grid factor on file for this country; taken to Assumed, it uses what you set — which is how a grid that has not decarbonised yet gets tested against one that has.',
    meter: new Meter({ label: 'Electricity rate', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'rateBasis', label: 'Tariff', value: 'Published',
        options: [
          { value: 'Published', label: 'Published' },
          { value: 'Assumed', label: 'Assumed' },
        ],
      }),
      new Scale({
        key: 'elecPrice', label: 'Electricity', value: 0.15, min: 0.02, max: 0.6, step: 0.005, digits: 3,
        unit: '/kWh', needs: (p) => p.rateBasis === 'Assumed',
      }),
      new Scale({
        key: 'gasPrice', label: 'Gas', value: 0.07, min: 0.01, max: 0.3, step: 0.005, digits: 3,
        unit: '/kWh', needs: (p) => p.rateBasis === 'Assumed',
      }),
      new Selector({
        key: 'factorBasis', label: 'Grid factor', value: 'Published',
        options: [
          { value: 'Published', label: 'Published' },
          { value: 'Assumed', label: 'Assumed' },
        ],
      }),
      new Scale({
        key: 'gridFactor', label: 'Grid intensity', value: 200, min: 0, max: 900, step: 5, digits: 0,
        unit: 'gCO₂e/kWh', needs: (p) => p.factorBasis === 'Assumed',
        note: 'The building will outlive the grid it was designed against. Wind this down to find out what it costs then.',
      }),
    ],
  }),

  new Channel({
    id: 'solver',
    index: '15',
    name: 'Solver',
    term: 'Δt',
    blurb:
      'The engine room. Nothing here changes the building; everything here changes how carefully, and how slowly, the building is worked out.',
    bypassable: false,
    meter: new Meter({ label: 'Timesteps per run', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'timestep', label: 'Timestep', value: 4,
        note: 'Substeps per hour. Reporting stays hourly whatever this says.',
        options: [
          { value: 1, label: '1' },
          { value: 4, label: '4' },
          { value: 6, label: '6' },
          { value: 12, label: '12' },
          { value: 60, label: '60' },
        ],
      }),
      new Selector({
        key: 'insideConv', label: 'Inside convection', value: 'TARP',
        options: [
          { value: 'Simple', label: 'Simple' },
          { value: 'TARP', label: 'TARP' },
          { value: 'AdaptiveConvectionAlgorithm', label: 'Adaptive' },
        ],
      }),
      new Selector({
        key: 'outsideConv', label: 'Outside convection', value: 'DOE-2',
        options: [
          { value: 'SimpleCombined', label: 'Simple' },
          { value: 'TARP', label: 'TARP' },
          { value: 'DOE-2', label: 'DOE-2' },
          { value: 'MoWiTT', label: 'MoWiTT' },
        ],
      }),
      new Scale({
        key: 'shadowFreq', label: 'Shadow recalculation', value: 20,
        min: 1, max: 60, step: 1, digits: 0, unit: 'days',
        note: 'How often the sun angles are re-cut. Every day is exact and slow.',
      }),
      new Selector({
        key: 'skyDiffuse', label: 'Sky diffuse', value: 'SimpleSkyDiffuseModeling',
        options: [
          { value: 'SimpleSkyDiffuseModeling', label: 'Simple' },
          { value: 'DetailedSkyDiffuseModeling', label: 'Detailed' },
        ],
      }),
      new Scale({ key: 'warmupMin', label: 'Warmup, minimum', value: 6, min: 1, max: 25, step: 1, digits: 0, unit: 'days' }),
      new Scale({ key: 'warmupMax', label: 'Warmup, maximum', value: 30, min: 5, max: 60, step: 1, digits: 0, unit: 'days' }),
      new Scale({ key: 'loadsTol', label: 'Loads tolerance', value: 0.04, min: 0.001, max: 0.2, step: 0.001, digits: 3 }),
      new Scale({ key: 'tempTol', label: 'Temperature tolerance', value: 0.004, min: 0.001, max: 0.05, step: 0.001, digits: 3, unit: 'K' }),
    ],
  }),

  new Channel({
    id: 'run',
    index: '16',
    name: 'Run',
    term: '∑h',
    blurb:
      'What gets simulated. Narrowing the run period is the cheapest speed control on the desk, and the only one that costs you nothing but months you were not reading.',
    bypassable: false,
    meter: new Meter({ label: 'Hours to solve', terms: [], derived: true }),
    controls: [
      new Calendar({
        key: 'months', label: 'Run months', value: FULL_YEAR,
        note:
          'Only reaches the model with a weather file attached; without one the run is the two ' +
          'design days. Months need not touch — each unbroken group is written as its own run ' +
          'period, so a January and a July can be solved without the spring between them.',
      }),
      new Selector({
        key: 'sizingPeriods', label: 'Design days', value: 'Yes',
        options: [
          { value: 'Yes', label: 'Run' },
          { value: 'No', label: 'Skip' },
        ],
      }),
      new Selector({
        key: 'holidays', label: 'Holidays', value: 'Yes',
        options: [
          { value: 'Yes', label: 'Observe' },
          { value: 'No', label: 'Ignore' },
        ],
      }),
      new Selector({
        key: 'dst', label: 'Daylight saving', value: 'Yes',
        options: [
          { value: 'Yes', label: 'Observe' },
          { value: 'No', label: 'Ignore' },
        ],
      }),
    ],
  }),
]);

/**
 * Parameters no single control owns.
 *
 * The plan keys belong to a `Facade`, which names the group rather than any one
 * wall, and the occupancy band belongs to a `Profile`, which owns two.
 */
const LOOSE = Object.freeze({
  occFrom: 8,
  occTo: 18,
  // Openings, per wall. The stock example has no fenestration at all; south at
  // 20 % is this demo's addition and the only one that starts open.
  wwrN: 0,
  wwrE: 0,
  wwrS: 0.2,
  wwrW: 0,
  ohN: 0,
  ohE: 0,
  ohS: 0.6,
  ohW: 0,
});

/** Every control's starting position, flattened. */
export const DEFAULT_PARAMETERS = Object.freeze(
  CHANNELS.reduce(
    (all, channel) => {
      for (const control of channel.controls) {
        if (control.kind === 'facade' || control.kind === 'profile') continue;
        all[control.key] = control.value;
      }
      return all;
    },
    { ...LOOSE },
  ),
);

/** Which channels start out of the path. */
export const DEFAULT_BYPASS = Object.freeze(
  Object.fromEntries(CHANNELS.filter((c) => c.bypassable).map((c) => [c.id, c.bypassed])),
);

/**
 * The five the sheet keeps under its axonometric.
 *
 * Not a second definition of anything: `main.js` looks the specs up out of
 * `CHANNELS` by these keys, so the sheet's sliders and the console's scales are
 * the same controls drawn twice, and a range changed here changes both.
 */
export const SHEET_KEYS = Object.freeze(['width', 'depth', 'height', 'wwrS', 'ohS']);

const INDEX = new Map();
for (const channel of CHANNELS) {
  for (const control of channel.controls) {
    if (control.kind === 'facade') {
      for (const side of control.sides) INDEX.set(side.key, { channel, control, side });
    } else if (control.kind === 'profile') {
      INDEX.set(control.from, { channel, control });
      INDEX.set(control.to, { channel, control });
    } else {
      INDEX.set(control.key, { channel, control });
    }
  }
}

/** Find a control by the parameter key it owns. Throws rather than guessing. */
export function controlFor(key) {
  const found = INDEX.get(key);
  if (!found) throw new Error(`no control owns the parameter "${key}"`);
  return found;
}

/** How a value reads, for any key, wherever it is being lettered. */
export function formatValue(key, value) {
  const { control } = controlFor(key);
  return control.format(value);
}

/** A label the sheet can use for a key it draws on its own. */
export function labelFor(key) {
  const { control, side } = controlFor(key);
  return side ? `${control.short} ${side.label}` : control.label;
}

export const CHANNEL_BY_ID = Object.freeze(Object.fromEntries(CHANNELS.map((c) => [c.id, c])));

/** Every parameter key, in strip order. Used to key a solve. */
export const ALL_KEYS = Object.freeze([...CHANNELS.flatMap((c) => c.keys()), 'occFrom', 'occTo'].filter(
  (k, i, all) => all.indexOf(k) === i,
));
