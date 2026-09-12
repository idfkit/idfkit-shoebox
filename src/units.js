/**
 * Which system the sheet is lettered in, and what a number reads as in it.
 *
 * The model is SI and stays SI. EnergyPlus reads and writes SI, every value on
 * `params` is the SI number the document holds, and the link carries that
 * number and no unit system at all. What this module owns is the last step
 * before a figure reaches a reader: a **quantity kind** says what a figure
 * measures, and therefore how it converts and how precisely it may be lettered.
 * Conversion happens here and nowhere else.
 *
 * It is DOM-free and imports nothing, for the reason `readings.js`, `copy.js`
 * and `tm59.js` are: a Node harness letters every kind at every precision
 * without a browser, which is this repository's whole method of verification.
 * It must never import `model.js`, `permalink.js` or an applier — the unit
 * system reaching any of those is the one thing this feature may not do.
 *
 * Three deliberate departures from a first cut, each with the measurement that
 * forced it:
 *
 *  - **Every factor is an expression of three constants**, never a decimal
 *    literal, so a reader can check the arithmetic rather than trust it.
 *  - **Every IP unit string is a single whitespace-free token.** `copy.js`
 *    counts whitespace tokens and throws at module load for the asserted
 *    budgets; `Btu/h per person` would cost a strip line two words and throw
 *    the page in a module nobody would think to look in. So `Btu/h·pp`, and
 *    `Δ°F` rather than `°F difference`.
 *  - **Temperature and temperature difference are two kinds.** A 3 K deadband
 *    lettered as 37.4 °F reads as a setpoint, which is the single most likely
 *    way to letter a wrong number that still looks plausible.
 */

/* ══ the three constants ═════════════════════════════════════════════════ */

/** Metres in a foot, exact by definition. */
const FT = 0.3048;
/** Joules in an International Table Btu. */
const BTU = 1055.05585262;
/** Grams in a pound, exact by definition. */
const LB = 453.59237;

const FT2 = FT * FT;
const FT3 = FT * FT * FT;

/* ══ a quantity kind ═════════════════════════════════════════════════════ */

/**
 * What a figure measures, and therefore how it converts and how it reads.
 *
 * `factor` is IP per SI and `offset` is added after scaling, so IP is
 * `value * factor + offset` and SI is `(shown - offset) / factor`. `digits` is
 * the IP precision for a figure with no step behind it — a reading. A control
 * derives its own from its step through `precisionFor`, because a control that
 * letters more decimals than its grid can reach is offering the reader a foot
 * they cannot stand on.
 *
 * `prefix` is lettered before the figure *instead of* a trailing unit, and
 * exists for exactly one quantity: thermal resistance reads `R-20` in IP, which
 * is the spelling every US product data sheet uses. It is the one lettering on
 * this desk that is not a suffix, which is why `parseIn` has to read it too.
 */
export class Kind {
  constructor({ id, si, ip, factor = 1, offset = 0, digits = 1, prefix = null, why = null }) {
    this.id = id;
    this.si = si;
    this.ip = ip;
    this.factor = factor;
    this.offset = offset;
    this.digits = digits;
    this.prefix = prefix;
    // Why an identity kind does not convert. Required on one, because a kind
    // that reads the same in both systems is a claim about the quantity — a
    // person is a person, airtightness is quoted at 50 Pa in US practice too —
    // and a claim nobody can check is what the rest of this sheet exists not to
    // print. A converting kind carries none: its factor is its reason.
    this.why = why;
    /**
     * Whether this quantity reads the same in both systems.
     *
     * Declared rather than inferred from a blank, so that "this does not
     * convert" is a statement `assertKinds` can check rather than a silence.
     *
     * A field rather than a getter, and that is a measurement rather than a
     * preference: it is asked two or three times for every figure lettered, by
     * `precisionFor`, `figureIn`, `letter` and `unitIn`, which over eighty-seven
     * controls is some hundreds of evaluations on every synced frame of a drag.
     * Every input is final by this line and the object is frozen on the next.
     */
    this.identity = factor === 1 && offset === 0 && si === ip;
    Object.freeze(this);
  }
}

const kind = (spec) => new Kind(spec);

/* ══ the roster ══════════════════════════════════════════════════════════ */

/**
 * Every kind the sheet may letter a figure in, and the only vocabulary a
 * lettering site may name.
 *
 * The SI string of each kind is the string the declarations already letter, so
 * that switching to IP and back restores the sheet character for character. A
 * quantity lettered with two different SI spellings on this desk is therefore
 * two kinds — `energyIntensity` over a year against `energyIntensityPeriod`
 * over one environment's own months — rather than one kind and a site that
 * composes its own unit.
 */
const ROSTER = [
  /* ── converting ──────────────────────────────────────────────────────── */
  kind({ id: 'length', si: 'm', ip: 'ft', factor: 1 / FT, digits: 1 }),
  kind({ id: 'lengthSmall', si: 'm', ip: 'in', factor: 12 / FT, digits: 1 }),
  // The same quantity where the sentence letters millimetres rather than
  // metres — the description's slab. Its own kind for the reason `swing` has
  // one: the SI string is what must come back unchanged.
  kind({ id: 'lengthMm', si: 'mm', ip: 'in', factor: 1 / 25.4, digits: 1 }),
  kind({ id: 'area', si: 'm²', ip: 'ft²', factor: 1 / FT2, digits: 0 }),
  kind({ id: 'volume', si: 'm³', ip: 'ft³', factor: 1 / FT3, digits: 0 }),
  // Compactness: envelope area over volume, so it converts as the reciprocal of
  // a length. 1 m⁻¹ is 0.3048 ft⁻¹, which is why the factor is FT itself and
  // not 1/FT — the one kind on the roster where the obvious expression is the
  // wrong way up.
  kind({ id: 'inverseLength', si: 'm⁻¹', ip: 'ft⁻¹', factor: FT, digits: 3 }),
  kind({ id: 'areaPerPerson', si: 'm²/pp', ip: 'ft²/person', factor: 1 / FT2, digits: 0 }),
  kind({ id: 'temperature', si: '°C', ip: '°F', factor: 1.8, offset: 32, digits: 0 }),
  kind({ id: 'temperatureDifference', si: 'K', ip: 'Δ°F', factor: 1.8, digits: 0 }),
  // A difference that SI letters `°C` rather than `K`, which is how the
  // schedule has always lettered a swing and is idiomatic for a range. It is a
  // second kind rather than a relabelling because the SI sheet must come back
  // character for character, and it is not `temperature` because a swing is a
  // difference: lettered through that, the 32 of the Fahrenheit offset rides
  // along and a 5 °C swing reads as 41 °F instead of 9.
  kind({ id: 'temperatureSwing', si: '°C', ip: 'Δ°F', factor: 1.8, digits: 1 }),
  // The 1.8 divides rather than multiplies, and the contract had it the other
  // way round: a watt is 3600/BTU Btu/h, a square metre is 1/FT² square feet
  // and a kelvin is 1.8 °F, so W/m²K is (3600 × FT²)/(BTU × 1.8) = 0.17611
  // Btu/h·ft²·°F. Written with the 1.8 above the line it comes out 0.571, which
  // is three times the true figure and would letter every window on the desk
  // wrong while still looking like a U-factor.
  kind({ id: 'transmittance', si: 'W/m²K', ip: 'Btu/h·ft²·°F', factor: (3600 * FT2) / (BTU * 1.8), digits: 2 }),
  kind({
    id: 'resistance',
    si: 'm²K/W',
    ip: 'h·ft²·°F/Btu',
    factor: (BTU * 1.8) / (3600 * FT2),
    digits: 1,
    prefix: 'R-',
  }),
  kind({ id: 'powerDensity', si: 'W/m²', ip: 'W/ft²', factor: FT2, digits: 2 }),
  kind({ id: 'fluxDensity', si: 'W/m²', ip: 'Btu/h·ft²', factor: (FT2 * 3600) / BTU, digits: 1 }),
  kind({ id: 'power', si: 'kW', ip: 'kBtu/h', factor: 3600 / BTU, digits: 1 }),
  kind({ id: 'heatPerPerson', si: 'W/pp', ip: 'Btu/h·pp', factor: 3600 / BTU, digits: 0 }),
  kind({ id: 'airflow', si: 'L/s', ip: 'cfm', factor: 60 / (FT3 * 1000), digits: 0 }),
  kind({ id: 'airflowPerPerson', si: 'L/s·pp', ip: 'cfm/person', factor: 60 / (FT3 * 1000), digits: 0 }),
  kind({ id: 'speed', si: 'm/s', ip: 'mph', factor: 3600 / (FT * 5280), digits: 0 }),
  kind({ id: 'energy', si: 'kWh', ip: 'kBtu', factor: 3600 / BTU, digits: 0 }),
  kind({ id: 'energyIntensity', si: 'kWh/m²·yr', ip: 'kBtu/ft²·yr', factor: (3600 * FT2) / BTU, digits: 1 }),
  kind({ id: 'energyIntensityPeriod', si: 'kWh/m²', ip: 'kBtu/ft²', factor: (3600 * FT2) / BTU, digits: 1 }),
  kind({ id: 'illuminance', si: 'lx', ip: 'fc', factor: FT2, digits: 0 }),
  // How far the picker's station is. Not in the spec's Units table, which names
  // no geographic distance at all — added here with its row in the contract,
  // because FR-007 forbids a kind appearing in IP without one, and a US reader
  // handed "412 km" is being asked to convert the one figure on the sheet that
  // is about where they are.
  kind({ id: 'distance', si: 'km', ip: 'mi', factor: 1000 / (FT * 5280), digits: 0 }),
  kind({ id: 'carbonIntensity', si: 'gCO₂e/kWh', ip: 'lb/MWh', factor: 1000 / LB, digits: 0 }),

  /* ── identity ────────────────────────────────────────────────────────── */
  kind({ id: 'ratio', si: '', ip: '', digits: 2, why: 'A fraction is a fraction.' }),
  kind({
    id: 'airChanges',
    si: 'ACH',
    ip: 'ACH',
    digits: 2,
    why: 'Defined per hour in both systems, and quoted as ACH50 in US practice too.',
  }),
  kind({
    id: 'pressure',
    si: 'Pa',
    ip: 'Pa',
    digits: 0,
    why: 'Airtightness is quoted at 50 Pa in US practice too — ACH50, CFM50.',
  }),
  kind({ id: 'angle', si: '°', ip: '°', digits: 0, why: 'Degrees in both.' }),
  kind({ id: 'people', si: 'pp', ip: 'pp', digits: 1, why: 'A person is a person.' }),
  kind({ id: 'days', si: 'days', ip: 'days', digits: 0, why: 'A day is a day.' }),
  kind({
    id: 'factorOf',
    si: '×',
    ip: '×',
    digits: 0,
    why: 'A multiplier and a count are pure numbers.',
  }),
  kind({
    id: 'floorMultiple',
    si: '× floor',
    ip: '× floor',
    digits: 2,
    why: 'A multiple of the floor area carries whatever unit that area is in.',
  }),
  kind({
    id: 'appliancePower',
    si: 'W',
    ip: 'W',
    digits: 0,
    why: 'An electrical rating is quoted in watts in both systems.',
  }),
  kind({
    id: 'money',
    si: '/kWh',
    ip: '/kWh',
    digits: 3,
    why: 'Rates are per kWh at the meter, in the tariff’s own currency.',
  }),
  kind({
    id: 'billedEnergy',
    si: 'kWh',
    ip: 'kWh',
    digits: 0,
    why:
      'A US utility bills electricity in kWh and the rate tables are per kWh, so the bill’s own '
      + 'energy column stays there (spec assumption). It is deliberately not `energy`, which does '
      + 'convert: a demand read off the meters is a quantity of heat, and a line on a bill is what '
      + 'somebody is charged for.',
  }),
  kind({
    id: 'currency',
    si: 'local currency',
    ip: 'local currency',
    digits: 1,
    why:
      'Money is money. The declaration letters a placeholder that the offer replaces with the '
      + 'tariff’s own currency code, since two schemes kept in two countries sit in one table and '
      + '$4,200 against $5,100 would read as a comparison when one of them is Canadian.',
  }),
  kind({
    id: 'carbonMass',
    si: 'kgCO₂e',
    ip: 'kgCO₂e',
    digits: 0,
    why:
      'The Units table names carbon *intensity* and not a mass of it, and the rate tables this '
      + 'sheet bills from publish neither in pounds. Converting would claim a figure they do not carry.',
  }),
  kind({
    id: 'degreeDays',
    si: '',
    ip: '',
    digits: 0,
    why:
      'The base temperature is part of the published statistic. Converting the count while the '
      + 'label still said 18 would be arithmetic nobody can check, and relabelling it HDD65 would '
      + 'claim a statistic this page did not compute. The reading says the base is Celsius.',
  }),
  kind({
    id: 'count',
    si: '',
    ip: '',
    digits: 0,
    why: 'A count of hours, nights or panes is the same count in both systems.',
  }),
  kind({
    id: 'unconverted',
    si: '',
    ip: '',
    digits: 0,
    why:
      'The quantity is settled by another control — the blind’s setpoint is W/m² on the glass '
      + 'or °C, depending on what it watches — so no one kind can convert it, and the note beside '
      + 'it carries both units.',
  }),
];

/** Every kind, by id. The only vocabulary a lettering site may name. */
export const KINDS = Object.freeze(Object.fromEntries(ROSTER.map((k) => [k.id, k])));

/**
 * A kind by id, or a throw naming the declaration that asked for it.
 *
 * Declarations name their kind through this rather than reaching into `KINDS`,
 * so a kind that is not in the roster fails where it is written rather than
 * when a reader drags the control it belongs to.
 */
export function kindFor(id, where, unit = null) {
  const found = KINDS[id];
  if (!found) throw new Error(`${where}: "${id}" is not a quantity kind in the roster`);
  // And, where the declaration letters a unit of its own, that the two agree.
  //
  // This lived as three copies in three declaring constructors, in two variants
  // that disagreed about identity kinds — so the rule had to be re-derived by
  // whichever neighbour the next declaration type happened to copy. It belongs
  // beside `kindFor` because it is the same kind of statement about the same
  // object: a declaration that is wrong fails where it is written.
  //
  // A converting kind owns its unit string outright, and its SI spelling must
  // be the string the declaration already used, or the SI sheet does not come
  // back the way it went (US1 scenario 2). An identity kind is the other way
  // round: it letters no unit of its own and the declaration's wording rides
  // through `letter`, which is how one `count` kind serves TM59's nights, its
  // share of occupied hours and a pane count.
  if (unit !== null && !found.identity && found.si !== unit) {
    throw new Error(
      `${where} letters "${unit}" but its kind "${found.id}" letters SI as "${found.si}"`,
    );
  }
  return found;
}

/* ══ which system is showing ═════════════════════════════════════════════ */

/**
 * The reader's choice, and the one place it lives.
 *
 * Module-level rather than threaded through every call, because it is a
 * property of the reader and not of any figure: threading it would put a unit
 * system in the signature of every applier that borrows a formatter, which is
 * one careless call away from the model.
 */
let showing = 'si';

/** One subscriber: the page's single re-letter path. */
let watcher = null;

export const system = () => showing;

export const inIP = () => showing === 'ip';

/**
 * Take the subscription. One, not a list: there is exactly one re-letter path
 * on this page, and a second subscriber would be a second surface deciding for
 * itself when to redraw — the drift the read-back rule exists to prevent.
 */
export function onSystemChange(fn) {
  if (typeof fn !== 'function') throw new Error('the units subscriber must be a function');
  if (watcher) throw new Error('the unit system already has a subscriber; there is one re-letter path');
  watcher = fn;
}

export function setSystem(next) {
  if (next !== 'si' && next !== 'ip') throw new Error(`"${next}" is not a unit system; it is "si" or "ip"`);
  if (next === showing) return;
  showing = next;
  watcher?.();
}

/* ══ lettering ═══════════════════════════════════════════════════════════ */

/** The number in IP. Pure. */
const toIP = (k, value) => value * k.factor + k.offset;

/** And back, which is what a typed IP figure means to the model. */
const toSI = (k, value) => (value - k.offset) / k.factor;

/** The number in the system showing. Pure, and the only arithmetic here. */
export function convert(k, value) {
  return inIP() ? toIP(k, value) : value;
}

/**
 * The IP precision a control may letter to, from the step it can actually
 * reach: `floor(-log10(step × factor))`, clamped at whole units.
 *
 * This is what makes a round IP figure reachable rather than merely printable.
 * One converted step must be no larger than one lettered increment, or the
 * slider walks past whole feet without ever standing on one — which is exactly
 * what `context.ctxDistance` did at its old 0.5 m step, where one step is
 * 1.64 ft and most whole feet could not be reached at all.
 *
 * Null for an identity kind, which has no second precision: it letters in both
 * systems exactly as its declaration says.
 */
export function precisionFor(k, step) {
  if (k.identity) return null;
  if (!(step > 0)) throw new Error(`${k.id}: a precision needs a positive step, not ${step}`);
  return Math.max(0, Math.floor(-Math.log10(step * k.factor)));
}

/**
 * One value as a string, in the system showing.
 *
 * `digits` is the SI precision — the one the declaration already carries — and
 * `ipDigits` the IP one, which a control takes from `precisionFor` and a
 * reading leaves to its kind. Two precisions rather than the one a first cut
 * had, because a control and a reading answer the question differently: a
 * control's resolution is its step and a reading's is its quantity.
 *
 * `unit` overrides the kind's own string and is refused on a converting kind.
 * It exists for the handful of identity kinds whose declarations carry their
 * own wording — TM59's hours against its nights, `HDD18` against `CDD10` — and
 * refusing it elsewhere is what keeps a converting figure's unit single-sourced.
 */
export function figureIn(k, value, { digits = null, ipDigits = null } = {}) {
  if (!(k instanceof Kind)) throw new Error('lettering needs a declared quantity kind');
  if (!Number.isFinite(value)) {
    // Not an em dash from here: a missing reading is the site's own statement,
    // made where it knows why the figure is missing, and swallowing it here
    // would turn a programming error into a plausible blank.
    throw new Error(`${k.id} cannot letter ${value}; a missing reading is the caller's em dash`);
  }
  // An identity kind letters with the declaration's own precision in *both*
  // systems, which is what "reads the same in both systems" means and is not
  // the same as falling back to the kind's own digits: the wind coefficient is
  // ruled to three decimals and `ratio` carries two, so an IP reader would have
  // watched 0.005 become 0.01 on a quantity that does not convert at all.
  const places = inIP() && !k.identity ? (ipDigits ?? k.digits) : (digits ?? k.digits);
  return convert(k, value).toFixed(places);
}

/**
 * The unit string in the system showing.
 *
 * For the declarations that letter their figure and their unit in two separate
 * places — a scoreboard row with a unit column, a schedule with one, the shelf,
 * the relief's standing axis. Those cannot go through `letter`, because there
 * is no one string to return; they need the unit on its own, and asking each of
 * them to pick between `k.si` and `k.ip` is five copies of one rule.
 *
 * `declared` is the declaration's own wording, which an identity kind letters
 * and a converting kind may not: the same split `letter`'s override enforces.
 */
export function unitIn(k, declared = null) {
  if (!(k instanceof Kind)) throw new Error('a unit needs a declared quantity kind');
  if (k.identity) return declared ?? k.si;
  return inIP() ? k.ip : k.si;
}

/**
 * The marking a prefixed kind letters *before* its figure, or nothing.
 *
 * One quantity on this desk wears its unit in front: thermal resistance reads
 * `R-20`, the spelling every US product data sheet uses.
 */
export const prefixIn = (k) => (inIP() && k.prefix ? k.prefix : '');

/**
 * The unit a figure of this kind carries *after* it, which is not always the
 * kind's unit string: a prefixed kind carries its marking in front and nothing
 * behind, so there is no trailing unit to strip, and none to head an axis with.
 *
 * This is `unitIn` asked the question a *lettered figure* asks, and it exists
 * because the two are not the same question and were being answered as though
 * they were. `Ruled.unitNow` restated `letter`'s composition rule instead of
 * sharing it, so the relief's axis offered to head a column of `R-29.0` stops
 * with `h·ft²·°F/Btu` — a unit on the axis and a marking on every figure under
 * it, for one quantity. `letter` now composes from `prefixIn` and this, so the
 * two cannot drift again, and the harness walks all 87 faces to say so.
 */
export function suffixIn(k, declared = null) {
  if (prefixIn(k)) return '';
  return unitIn(k, declared);
}

/**
 * The kind a *difference* of this quantity letters in.
 *
 * A span is not a value. How much room a control has left, the width of a band,
 * the distance between two stops — each is a subtraction, and a difference
 * lettered through a kind that carries an offset takes the offset along: five
 * degrees of room on a setpoint reads as `41 °F` instead of `9`. It is the same
 * trap `temperatureDifference` was split out for, arriving by a second route,
 * and the ranking's "Room left" column walked straight into it.
 *
 * `temperature` is the only kind on the roster with an offset, so it is the only
 * one with a different answer. It maps to `temperatureSwing` rather than to
 * `temperatureDifference` because the SI sheet must come back character for
 * character: a span of a Celsius face has always been lettered `°C`, and `K`
 * would be a new string standing where the old one stood.
 */
export function deltaKindOf(k) {
  if (!(k instanceof Kind)) throw new Error('a difference needs a declared quantity kind');
  return k.offset === 0 ? k : KINDS.temperatureSwing;
}

export function letter(k, value, { digits = null, ipDigits = null, unit = null } = {}) {
  // `figureIn` is the one that refuses a value that is not a kind, or a reading
  // that is missing, so this needs no guard of its own.
  const said = figureIn(k, value, { digits, ipDigits });
  // Composed from the two halves rather than deciding them here, so that
  // anything else asking "what does a figure of this kind wear" gets the same
  // answer. The unit half goes through `unitIn` underneath: a declaration's own
  // wording is honoured on an identity kind and ignored on one that converts.
  // That used to throw on the second case instead, which pushed the rule out to
  // the callers — every site lettering a declaration-worded quantity had to
  // pre-test `kind.identity ? unit : null` to dodge the throw. What the throw
  // was guarding is asserted at load anyway, by the declaring constructors.
  const suffix = suffixIn(k, unit);
  return `${prefixIn(k)}${said}${suffix ? ` ${suffix}` : ''}`;
}

/* ══ reading a typed figure back ═════════════════════════════════════════ */

/**
 * What a reader may type, wider than the canonical grammar a link is read with.
 *
 * Exported because `controls.js` undoes a second lettering rule with it — one
 * hour of a `Pattern`'s day — and the two grammars have to say the same thing
 * about what a number is, or one box accepts what its twin refuses. It was a
 * byte-identical copy in both modules, with that invariant stated in a comment
 * and nothing holding it.
 */
export const TYPED = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

const strip = (said, suffix) =>
  suffix && said.toLowerCase().endsWith(suffix.toLowerCase())
    ? said.slice(0, said.length - suffix.length).trim()
    : null;

/**
 * A typed figure, as the SI number the model holds, or null.
 *
 * Whatever a box letters, a reader can select it, retype it unchanged and get
 * the same value back — which is the rule that forces every spelling below.
 * Both systems' suffixes are accepted whichever one is showing, because "3 m"
 * typed into an IP box means three metres and refusing it would be the box
 * pretending not to understand its own quantity. A bare number means the system
 * showing.
 *
 * The IP suffix is tried before the SI one, not alphabetically or by chance: a
 * kind whose IP string ends with its SI string would otherwise have every IP
 * figure read as an SI one, silently and by a factor.
 */
export function parseIn(k, text) {
  const said = String(text).trim();
  if (!said) return null;
  // The prefix first, because `R-20` carries no unit at all to strip and its
  // leading `R-` would survive every suffix test below as part of the number.
  if (k.prefix) {
    const lower = said.toLowerCase();
    const mark = k.prefix.toLowerCase();
    if (lower.startsWith(mark)) {
      const bare = said.slice(k.prefix.length).trim();
      return TYPED.test(bare) ? toSI(k, Number(bare)) : null;
    }
  }
  const asIP = strip(said, k.ip);
  if (asIP !== null) return TYPED.test(asIP) ? toSI(k, Number(asIP)) : null;
  const asSI = strip(said, k.si);
  if (asSI !== null) return TYPED.test(asSI) ? Number(asSI) : null;
  if (!TYPED.test(said)) return null;
  const n = Number(said);
  return inIP() ? toSI(k, n) : n;
}

/* ══ the two invariants, both thrown at load ═════════════════════════════ */

/**
 * That the roster is a roster.
 *
 * Takes the list rather than reading `ROSTER`, so the harness can put a
 * deliberately broken kind through the same check the page runs at load.
 */
export function assertKinds(roster = ROSTER) {
  const seen = new Set();
  for (const k of roster) {
    if (!k.id) throw new Error('a quantity kind has no id');
    if (seen.has(k.id)) throw new Error(`the quantity kind "${k.id}" is declared twice`);
    seen.add(k.id);
    if (typeof k.si !== 'string' || typeof k.ip !== 'string') {
      throw new Error(`the quantity kind "${k.id}" is missing a unit string`);
    }
    if (!Number.isFinite(k.factor) || k.factor === 0) {
      throw new Error(`the quantity kind "${k.id}" has a factor of ${k.factor}, which converts nothing`);
    }
    if (!Number.isFinite(k.offset)) throw new Error(`the quantity kind "${k.id}" has a non-finite offset`);
    if (!Number.isInteger(k.digits) || k.digits < 0 || k.digits > 20) {
      throw new Error(`the quantity kind "${k.id}" is lettered to ${k.digits} decimals, which is not a precision`);
    }
    if (k.identity) {
      if (!k.why) throw new Error(`the identity kind "${k.id}" says nothing about why it does not convert`);
      // No whitespace rule here, and that is the rule rather than an exemption.
      // An identity kind letters the same string in both systems, so it spends
      // exactly the budget words it spent before this feature existed — the
      // internal mass's `× floor` is two words today and two words in IP. The
      // rule below exists because a *converting* kind's IP string is new text
      // standing where the SI one stood, and `Btu/h per person` would cost a
      // strip line two more words than `W/pp` did and throw the page at load in
      // `copy.js`, a module nobody would think to look in. Asserting it on an
      // identity kind would refuse a string the sheet already letters.
    } else {
      // A factor of 1 and no offset with two different unit strings is the one
      // way a kind can claim to convert and convert nothing. It is not
      // hypothetical arithmetic: it is what a declaration looks like when
      // somebody names an IP unit and forgets its factor, and every figure of
      // that kind would then be lettered in IP units at its SI magnitude —
      // wrong by whatever the factor should have been, and plausible.
      if (k.factor === 1 && k.offset === 0) {
        throw new Error(
          `the quantity kind "${k.id}" letters SI as "${k.si}" and IP as "${k.ip}" but converts by 1, `
          + 'so it would print one magnitude under two units',
        );
      }
      if (/\s/.test(k.ip)) {
        throw new Error(
          `the quantity kind "${k.id}" letters IP as "${k.ip}", which carries whitespace: copy.js counts `
          + 'whitespace tokens, so it would spend a second word of every budget it appears in',
        );
      }
      if (/\s/.test(k.si)) {
        throw new Error(`the quantity kind "${k.id}" letters SI as "${k.si}", which carries whitespace`);
      }
      if (!k.ip) throw new Error(`the quantity kind "${k.id}" converts but has no IP unit to letter`);
      if (k.si === k.ip && k.offset === 0) {
        throw new Error(`the quantity kind "${k.id}" letters both systems "${k.si}" but is not the identity`);
      }
      if (k.why) throw new Error(`the quantity kind "${k.id}" converts, so its factor is its reason`);
    }
    if (k.prefix !== null && (typeof k.prefix !== 'string' || !k.prefix)) {
      throw new Error(`the quantity kind "${k.id}" carries an empty prefix`);
    }
  }
  return roster;
}

/**
 * That a control's grid can produce a round IP figure.
 *
 * One converted step must be no larger than one lettered increment. The same
 * arithmetic, and the same reason, as `readLandmarks`' third rule: a face whose
 * grid falls between two lettered positions shows the reader a place they
 * cannot stand. It had to be written before anyone noticed that eleven controls
 * could not reach a whole IP figure at all.
 */
export function assertReachable(control) {
  const k = control.quantityKind;
  if (!k) throw new Error(`${control.key}: a ruled control declares no quantity kind`);
  if (k.identity) return;
  const places = precisionFor(k, control.step);
  const increment = 10 ** -places;
  const converted = control.step * k.factor;
  // The epsilon is for the division and the power, not for the physics: a step
  // that converts to exactly one increment is reachable, and floating point
  // must not be allowed to say otherwise.
  if (converted > increment * (1 + 1e-9)) {
    throw new Error(
      `${control.key}: one ${control.step} ${k.si} step is ${converted.toFixed(3)} ${k.ip}, coarser than the `
      + `${increment} ${k.ip} it would be lettered to, so no round IP figure on it can be reached`,
    );
  }
}

assertKinds();
