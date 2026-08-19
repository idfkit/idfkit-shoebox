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
 * One wall of a plan key: the parameter it owns and how it is lettered.
 *
 * A typed object rather than the loose dictionary this used to be, because a
 * side now carries a predicate as well as three strings, and a predicate with
 * no reason beside it is exactly the kind of silent state this desk refuses
 * elsewhere. `needs` is the per-wall twin of `Control.needs`: true when
 * setting this wall's number reaches the model at all. `unreached` is the
 * sentence for when it does not — the four walls of a plan key are set from
 * one control, so a single row-wide note could not say which of them is
 * inert.
 */
class Side {
  constructor({ key, side, label, needs = null, unreached = null }) {
    if (!key) throw new Error('a wall of a plan key needs a parameter key');
    if (Boolean(needs) !== Boolean(unreached)) {
      throw new Error(`${key} carries a precondition with no reason, or a reason with no precondition`);
    }
    this.key = key;
    this.side = side; // 'north' | 'east' | 'south' | 'west', as the model names it
    this.label = label; // 'N' … 'W', as the plan key letters it
    this.needs = needs;
    this.unreached = unreached;
    Object.freeze(this);
  }

  /** Whether this wall's number is reaching the model as the desk stands. */
  reaches(params) {
    return this.needs ? Boolean(this.needs(params)) : true;
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
 *
 * Each wall is nevertheless its own parameter, and therefore its own question:
 * a study sweeps one key, so the plan key carries four of them rather than a
 * single "the glazing" that no single number in the document corresponds to.
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
    this.sides = Object.freeze(sides.map((s) => new Side(s)));
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

/**
 * A list of days, drawn as a year rule with the entries listed under it.
 *
 * The value is a string, not an array, and that is a deliberate and load-bearing
 * choice. Every other parameter on the desk is a scalar, and four separate
 * mechanisms assume it: `commit`'s `params[key] !== value` guard, `encodeState`'s
 * identity diff against a frozen default, `decodeState`'s one-value-per-key rule,
 * and — the one that would have been found late and painfully — `revert`'s
 * `Object.assign(params, DEFAULT_PARAMETERS)`. `Object.freeze` is shallow, so an
 * array default would be *aliased* into live `params` by that assign, and the
 * first edit would corrupt `DEFAULT_PARAMETERS` for the rest of the session. The
 * permalink's `DEFAULTS_BY_VERSION.v1` is that same object, so the link format
 * itself would have drifted, with no symptom until a shared link came back
 * describing a different building.
 *
 * So the list is carried as text and parsed at every boundary that needs the
 * days themselves. `parseHolidays` below is that boundary.
 */
export class Days extends Control {
  constructor({ key, label, value, presets = [], max = 24, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'days';
    this.presets = Object.freeze([...presets]);
    // Most entries the list may hold. A cap exists because the list travels in a
    // URL fragment, and an unbounded one would make a scheme link unshareable.
    this.max = max;
    Object.freeze(this);
  }

  /**
   * Entries, not days — the honest reading with no calendar behind it.
   *
   * Days would be the better unit, and it is what the console prints the moment
   * a weather file supplies a year. But it cannot be counted from the text
   * alone: an nth weekday has no day of the year until the calendar is known,
   * and overlapping spans have to be unioned before they can be totalled. So
   * this counts what it can actually see, and names that unit so the change to
   * days later reads as a different measurement rather than a jump in the same
   * one.
   */
  format(v) {
    const entries = parseHolidays(v).length;
    if (entries === 0) return 'None';
    return `${entries} holiday${entries === 1 ? '' : 's'}`;
  }
}

/* ══ the holiday grammar ═════════════════════════════════════════════════ */

const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);
const WEEKDAY_NAMES = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);
// `MONTHS` and `DAYS_IN_MONTH` are the run period's, above, and are the same
// twelve facts. February has 28 of them and no leap year is reachable, which is
// why 29 February is a parse error below rather than a day quietly dropped.

/** How many entries a list may carry, and how long a name may be. */
const MAX_DAYS = 24;
const MAX_NAME = 40;
/**
 * A name becomes an IDF object name and is echoed into `eplus.err` by a local
 * EnergyPlus, so it stays ASCII. It also travels in a URL fragment, where every
 * accented character costs six.
 */
const NAME = /^[A-Za-z0-9 '.&-]+$/;

const FIXED = /^(\d{1,2})\/(\d{1,2})$/;
/**
 * One to four, never five.
 *
 * Every month has at least 28 days, so a first, second, third and fourth of any
 * weekday exist in every year, as does a last. A *fifth* exists only in some
 * years, and when it does not EnergyPlus does not warn and carry on — it stops:
 *
 *     ** Severe ** SetSpecialDayDates: Special Day Date, Nth Day of Month,
 *                  not enough Nths, for SpecialDay=IMPOSSIBLE DAY
 *     EnergyPlus Terminated--Fatal Error Detected.
 *
 * measured on `5th Monday in December` against a year beginning Sunday. A
 * grammar that can express a desk which fatals the engine is not a grammar this
 * page should offer, and nothing in any published calendar is a fifth weekday.
 * So the range is closed at four and the whole grammar is total: every list
 * that parses runs, under every calendar.
 */
const NTH = /^([1-4]) ([A-Za-z]{3}) in ([A-Za-z]{3})$/;
const LAST = /^Last ([A-Za-z]{3}) in ([A-Za-z]{3})$/;

/**
 * One day the run period should treat as a holiday.
 *
 * `date` is the canonical token this module reads and writes; `startDate()` is
 * the same date in EnergyPlus's own spelling, which is what goes into the IDF.
 * The two are kept apart on purpose: the canonical token is short, because it
 * travels in an address bar, and the engine's spelling is long, because the
 * stock example files spell it out and there is nothing to gain from betting on
 * the abbreviations the schema says it also accepts.
 */
export class Holiday {
  constructor({ date, duration = 1, name }) {
    this.date = date;
    this.duration = duration;
    this.name = name;
    Object.freeze(this);
  }

  /** The date as `RunPeriodControl:SpecialDays` wants it. */
  startDate() {
    const fixed = this.date.match(FIXED);
    if (fixed) return `${MONTH_NAMES[Number(fixed[1]) - 1]} ${Number(fixed[2])}`;
    const nth = this.date.match(NTH);
    if (nth) {
      const ordinal = ['1st', '2nd', '3rd', '4th', '5th'][Number(nth[1]) - 1];
      return `${ordinal} ${WEEKDAY_NAMES[WEEKDAYS.indexOf(nth[2])]} in ${MONTH_NAMES[MONTHS.indexOf(nth[3])]}`;
    }
    const last = this.date.match(LAST);
    return `Last ${WEEKDAY_NAMES[WEEKDAYS.indexOf(last[1])]} in ${MONTH_NAMES[MONTHS.indexOf(last[2])]}`;
  }
}

/**
 * Read a holiday list, or throw naming what is wrong with it.
 *
 * The grammar is
 *
 *     list   := "" | record (";" record)*
 *     record := date ["*" duration] ":" name
 *     date   := M "/" D | nth " " Www " in " Mmm | "Last " Www " in " Mmm
 *
 * with the three date forms taken from the three the 26.1 `start_date` field
 * accepts. Two shapes are deliberate. `*` carries the duration because it is one
 * of the few characters `URLSearchParams` leaves unescaped, so a shutdown costs
 * no extra length in a link. And weekdays and months are the three-letter forms
 * only, though the schema also takes the full names: exactly one spelling per
 * value is what makes `serializeHolidays(parseHolidays(s)) === s` an assertion
 * rather than a hope, and two spellings of one calendar would key two identical
 * solves through `shapeKey`.
 *
 * Every failure throws. Nothing is clamped, repaired or dropped — this list is
 * the reader's own calendar, and a holiday that silently did not make it into
 * the model would be invisible in the results it changed.
 */
export function parseHolidays(raw) {
  if (typeof raw !== 'string') throw new Error('a holiday list is text');
  if (raw === '') return Object.freeze([]);

  const days = [];
  const seen = new Set();
  const dates = new Set();
  for (const record of raw.split(';')) {
    if (record.trim() === '') throw new Error('an empty entry in the holiday list (a stray ";")');

    const cut = record.indexOf(':');
    if (cut === -1) {
      throw new Error(`"${record.trim()}" has no name — write it as "${record.trim()}: Christmas"`);
    }
    const name = record.slice(cut + 1).trim();
    if (name === '') throw new Error(`"${record.slice(0, cut).trim()}" has no name after its colon`);
    if (name.length > MAX_NAME) {
      throw new Error(`"${name}" is ${name.length} characters, and a holiday name takes at most ${MAX_NAME}`);
    }
    if (!NAME.test(name)) {
      throw new Error(`"${name}" — a holiday name takes letters, digits, spaces and ' . & - only`);
    }
    // Names become IDF object names, which must be unique. Two Christmases would
    // be rejected by the engine long after the desk had accepted them.
    const seenKey = name.toUpperCase();
    if (seen.has(seenKey)) throw new Error(`two holidays are both called "${name}"`);
    seen.add(seenKey);

    const head = record.slice(0, cut).trim();
    const star = head.indexOf('*');
    const date = star === -1 ? head : head.slice(0, star).trim();
    let duration = 1;
    if (star !== -1) {
      const tail = head.slice(star + 1).trim();
      if (!/^\d+$/.test(tail)) throw new Error(`"${head}" — a duration is a whole number of days`);
      duration = Number(tail);
      if (duration < 1 || duration > 366) {
        throw new Error(`"${head}" lasts ${duration} days, and a special day runs 1 to 366`);
      }
    }

    const canonical = readDate(date);
    // Two entries on one date is a mistake the engine will not report: the
    // schema says plainly that there is "no error message on duplicate days or
    // overlapping days", so the second would simply vanish into the first.
    if (dates.has(canonical)) throw new Error(`two holidays both start on ${canonical}`);
    dates.add(canonical);

    days.push(new Holiday({ date: canonical, duration, name }));
  }

  if (days.length > MAX_DAYS) {
    throw new Error(`${days.length} holidays listed, and the list holds at most ${MAX_DAYS}`);
  }
  return Object.freeze(days);
}

/** One date token, validated into its canonical spelling. */
function readDate(raw) {
  const fixed = raw.match(FIXED);
  if (fixed) {
    const month = Number(fixed[1]);
    const day = Number(fixed[2]);
    if (month < 1 || month > 12) throw new Error(`"${raw}" is not a date: months run 1 to 12`);
    if (day < 1 || day > DAYS_IN_MONTH[month - 1]) {
      const reason = month === 2 && day === 29
        ? 'the run period carries no year, so its February has 28 days'
        : `${MONTH_NAMES[month - 1]} has ${DAYS_IN_MONTH[month - 1]} days`;
      throw new Error(`"${raw}" is not a date: ${reason}`);
    }
    return `${month}/${day}`;
  }

  const nth = raw.match(NTH);
  if (nth) return `${nth[1]} ${weekday(nth[2], raw)} in ${month(nth[3], raw)}`;

  const last = raw.match(LAST);
  if (last) return `Last ${weekday(last[1], raw)} in ${month(last[2], raw)}`;

  if (/^\d+ /.test(raw)) {
    throw new Error(
      `"${raw}" is not a date: the nth weekday runs 1 to 4, or "Last" — a fifth does not exist in every year, and EnergyPlus stops with a severe error in the years it does not`,
    );
  }
  throw new Error(`"${raw}" is not a date: write 12/25, "4 Thu in Nov" or "Last Mon in May"`);
}

const cased = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

function weekday(word, raw) {
  const found = WEEKDAYS.indexOf(cased(word));
  if (found === -1) {
    throw new Error(`"${raw}" — "${word}" is not a weekday: write ${WEEKDAYS.join(', ')}`);
  }
  return WEEKDAYS[found];
}

function month(word, raw) {
  const found = MONTHS.indexOf(cased(word));
  if (found === -1) {
    throw new Error(`"${raw}" — "${word}" is not a month: write ${MONTHS.join(', ')}`);
  }
  return MONTHS[found];
}

/**
 * Where a holiday actually falls, given the year the run will use.
 *
 * The run period's calendar is a real one: `day_of_week_for_start_day` is left
 * empty, so EnergyPlus takes the weather file's own `DATA PERIODS` start day —
 * Sunday, on every TMYx — and picks a real non-leap year to match, 2017 for a
 * Sunday. A non-leap year is fully determined by the weekday its 1 January
 * falls on, so that weekday is all this needs: no year is passed, because none
 * is needed and naming one would invite the belief that the weather is that
 * year's.
 *
 * Returns `{ month, day, weekday, doy, ends }`, 1-indexed month and day,
 * `weekday` 0 for Sunday. `ends` is the last day the special day covers, which
 * wraps past 31 December the way EnergyPlus wraps it.
 */
export function resolveHoliday(holiday, startWeekday) {
  const doyOf = (month, day) => DAYS_IN_MONTH.slice(0, month - 1).reduce((n, d) => n + d, 0) + day;
  const weekdayOf = (doy) => (startWeekday + doy - 1) % 7;

  let month;
  let day;
  const fixed = holiday.date.match(FIXED);
  if (fixed) {
    [month, day] = [Number(fixed[1]), Number(fixed[2])];
  } else {
    const nth = holiday.date.match(NTH);
    const last = holiday.date.match(LAST);
    const want = WEEKDAYS.indexOf(nth ? nth[2] : last[1]);
    month = MONTHS.indexOf(nth ? nth[3] : last[2]) + 1;
    const firstWeekday = weekdayOf(doyOf(month, 1));
    const first = 1 + ((want - firstWeekday + 7) % 7);
    day = nth
      ? first + 7 * (Number(nth[1]) - 1)
      // The last one is the last occurrence at or before the month's end. Four
      // always exist, so stepping back from `first + 28` cannot underflow.
      : first + 7 * Math.floor((DAYS_IN_MONTH[month - 1] - first) / 7);
  }

  const doy = doyOf(month, day);
  return {
    month,
    day,
    doy,
    weekday: weekdayOf(doy),
    // A shutdown beginning 24 December runs into January, and EnergyPlus wraps
    // it into the same simulated year rather than losing the tail. Measured:
    // `12/24*9` flagged 24–31 December and 1 January as Holiday.
    ends: ((doy + holiday.duration - 2) % 365) + 1,
  };
}

/** Which month a day of the year falls in, 1-indexed. */
function monthOfDoy(doy) {
  let left = doy;
  for (let m = 0; m < 12; m += 1) {
    if (left <= DAYS_IN_MONTH[m]) return m + 1;
    left -= DAYS_IN_MONTH[m];
  }
  return 12;
}

/**
 * How many of a holiday's days the run actually simulates.
 *
 * Counted day by day rather than judged by the start date, because a special
 * day is a *span*: a nine-day shutdown beginning 24 December reaches into
 * January, and a run that keeps December but drops January simulates eight of
 * its nine days. Measured — the engine flagged 24 to 31 December and stopped,
 * with nothing in the error file to say two days had gone.
 *
 * That is the whole reason this counts days and not entries. EnergyPlus is
 * silent about a special day it cannot place, whether it loses all of one or
 * part of one, so the only honest reading is of what actually lands.
 */
export function coveredDays(holiday, startWeekday, mask) {
  const { doy } = resolveHoliday(holiday, startWeekday);
  let covered = 0;
  for (let i = 0; i < holiday.duration; i += 1) {
    // Wrapping at 365 the way the engine wraps it, back into the same year.
    const day = ((doy - 1 + i) % 365) + 1;
    if (mask[monthOfDoy(day) - 1] === '1') covered += 1;
  }
  return covered;
}

/**
 * The whole list as days of the year — how many it names, and how many of those
 * the run simulates.
 *
 * Sets, not sums, because holidays overlap and a day is a day. A nine-day
 * shutdown from 24 December swallows Christmas and — wrapping — New Year, so
 * eleven federal holidays plus that shutdown is eighteen days and not twenty.
 * Summing the entries reported eleven days for a November-to-December run where
 * the engine flagged ten, which is how this was found: the schema says outright
 * that there is "no error message on duplicate days or overlapping days", so the
 * engine simply marks each day once and says nothing about the arithmetic.
 */
export function runDays(holidays, startWeekday, mask) {
  const listed = new Set();
  const covered = new Set();
  for (const holiday of holidays) {
    const { doy } = resolveHoliday(holiday, startWeekday);
    for (let i = 0; i < holiday.duration; i += 1) {
      const day = ((doy - 1 + i) % 365) + 1;
      listed.add(day);
      if (mask[monthOfDoy(day) - 1] === '1') covered.add(day);
    }
  }
  return { listed: listed.size, covered: covered.size };
}

/** `Sun` … `Sat`, for lettering a resolved day. The months are `MONTHS`. */
export const WEEKDAY_LABELS = WEEKDAYS;

/** The list as text, in the one spelling the parser reads back unchanged. */
export function serializeHolidays(days) {
  return days
    .map((day) => `${day.date}${day.duration > 1 ? `*${day.duration}` : ''}: ${day.name}`)
    .join(';');
}

/* ══ national calendars ══════════════════════════════════════════════════ */

/**
 * One day of a published calendar, written or not.
 *
 * A preset declares its *whole* national calendar, including the days it cannot
 * express, each carrying the reason it cannot. That is what lets the offer say
 * "CA 8/10" and name the two missing days before the reader presses it, rather
 * than stamping ten days' worth of expectation and delivering eight. Deriving
 * the counts from the days themselves also means the label cannot drift from the
 * list the day somebody edits one.
 */
class PresetDay {
  constructor({ name, date = null, missing = null }) {
    if ((date === null) === (missing === null)) {
      throw new Error(`${name} needs either a date or a reason it has none`);
    }
    this.name = name;
    this.date = date;
    this.missing = missing;
    Object.freeze(this);
  }
}

/** The two reasons a published holiday cannot be written as an IDF date. */
const EASTER = 'set by Easter, which a date field with no year cannot carry';
const VICTORIA = 'the Monday preceding 25 May, which is neither an nth weekday nor the last';

/** A published calendar, offered as a starting point for the list. */
class HolidayCalendar {
  constructor({ code, label, days }) {
    this.code = code;
    this.label = label;
    this.days = Object.freeze([...days]);
    Object.freeze(this);
  }

  get written() {
    return this.days.filter((d) => d.date !== null);
  }

  get unwritten() {
    return this.days.filter((d) => d.missing !== null);
  }

  /** This calendar as a holiday list, ready to become the parameter. */
  encode() {
    return serializeHolidays(
      this.written.map((d) => new Holiday({ date: d.date, name: d.name })),
    );
  }

  /**
   * What the offer says about itself, in full, before it is pressed.
   *
   * Grouped by reason rather than listed day by day, because four German
   * holidays share one sentence about Easter and printing it four times reads
   * as noise instead of as the one fact it is.
   */
  title() {
    const head = `Replace the list with the ${this.written.length} ${this.label} holidays this page can write`;
    if (this.unwritten.length === 0) return `${head}.`;
    const reasons = new Map();
    for (const d of this.unwritten) {
      reasons.set(d.missing, [...(reasons.get(d.missing) ?? []), d.name]);
    }
    const short = [...reasons]
      .map(([why, names]) => `${series(names)} ${names.length === 1 ? 'is' : 'are'} ${why}`)
      .join('; ');
    return `${head}. ${this.unwritten.length} cannot be: ${short}.`;
  }

  /** `US 11` when whole, `CA 8/10` when short. */
  count() {
    return this.unwritten.length === 0
      ? String(this.written.length)
      : `${this.written.length}/${this.days.length}`;
  }
}

const day = (name, date) => new PresetDay({ name, date });
const absent = (name, missing) => new PresetDay({ name, missing });

/** `A`, `A and B`, `A, B and C`. */
const series = (names) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * The five regions the tariff data covers, so the calendar and the bill agree
 * about which countries this page claims to know anything about.
 */
export const HOLIDAY_CALENDARS = Object.freeze([
  new HolidayCalendar({
    code: 'US',
    label: 'United States federal',
    days: [
      day('New Year', '1/1'),
      day('Martin Luther King Day', '3 Mon in Jan'),
      day('Presidents Day', '3 Mon in Feb'),
      day('Memorial Day', 'Last Mon in May'),
      day('Juneteenth', '6/19'),
      day('Independence Day', '7/4'),
      day('Labor Day', '1 Mon in Sep'),
      day('Columbus Day', '2 Mon in Oct'),
      day('Veterans Day', '11/11'),
      day('Thanksgiving', '4 Thu in Nov'),
      day('Christmas', '12/25'),
    ],
  }),
  new HolidayCalendar({
    code: 'CA',
    label: 'Canadian federal',
    days: [
      day('New Year', '1/1'),
      absent('Good Friday', EASTER),
      absent('Victoria Day', VICTORIA),
      day('Canada Day', '7/1'),
      day('Labour Day', '1 Mon in Sep'),
      day('Truth and Reconciliation', '9/30'),
      day('Thanksgiving', '2 Mon in Oct'),
      day('Remembrance Day', '11/11'),
      day('Christmas', '12/25'),
      day('Boxing Day', '12/26'),
    ],
  }),
  new HolidayCalendar({
    code: 'UK',
    label: 'England and Wales bank',
    days: [
      day('New Year', '1/1'),
      absent('Good Friday', EASTER),
      absent('Easter Monday', EASTER),
      day('Early May', '1 Mon in May'),
      day('Spring Bank Holiday', 'Last Mon in May'),
      day('Summer Bank Holiday', 'Last Mon in Aug'),
      day('Christmas', '12/25'),
      day('Boxing Day', '12/26'),
    ],
  }),
  new HolidayCalendar({
    code: 'FR',
    label: 'French public',
    days: [
      day("Jour de l'An", '1/1'),
      absent('Lundi de Paques', EASTER),
      day('Fete du Travail', '5/1'),
      day('Victoire 1945', '5/8'),
      absent('Ascension', EASTER),
      absent('Lundi de Pentecote', EASTER),
      day('Fete Nationale', '7/14'),
      day('Assomption', '8/15'),
      day('Toussaint', '11/1'),
      day('Armistice', '11/11'),
      day('Noel', '12/25'),
    ],
  }),
  new HolidayCalendar({
    code: 'DE',
    label: 'German public',
    days: [
      day('Neujahr', '1/1'),
      absent('Karfreitag', EASTER),
      absent('Ostermontag', EASTER),
      day('Tag der Arbeit', '5/1'),
      absent('Christi Himmelfahrt', EASTER),
      absent('Pfingstmontag', EASTER),
      day('Tag der Deutschen Einheit', '10/3'),
      day('Erster Weihnachtstag', '12/25'),
      day('Zweiter Weihnachtstag', '12/26'),
    ],
  }),
]);

/**
 * Why a control cannot hold a value handed to it, or null when it can.
 *
 * A gesture can never produce an inadmissible value — the range input and the
 * segmented rule only offer what the declaration allows. Everything that sets a
 * control *without* a gesture does it by handing over a bare value: a pasted
 * link, a saved scheme, a standard's specification. Each of those has to be
 * checked against the same rules, and those rules are the declaration's own, so
 * they are read off it here once rather than restated in each codec.
 *
 * The reason is a phrase, not a sentence, because the caller knows things this
 * function does not: a link can quote the fragment it was given, a preset can
 * name the clause that asked for it.
 */
export function refuses(control, value) {
  if (control.kind === 'selector') {
    return control.options.some((o) => o.value === value) ? null : 'is not one of its options';
  }
  // Non-numeric kinds are named here, above the numeric gate, for the reason
  // CLAUDE.md gives for the same ordering in `readValue`: a branch added below
  // it is unreachable, and every value of that kind is refused as "not a
  // number" — a true sentence about the wrong thing. A month mask and a day
  // list are both strings, both belong to the Run channel, and Run is
  // `UNTOUCHABLE`, so no preset can reach them; they throw rather than
  // validate, because the only way to arrive here is a programming error and
  // an explicit one is worth more than a plausible verdict.
  if (control.kind === 'calendar' || control.kind === 'days') {
    throw new Error(`a "${control.kind}" control is not set by value here`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'is not a number';
  let min;
  let max;
  let integer = false;
  switch (control.kind) {
    case 'scale':
    case 'facade':
      ({ min, max } = control);
      // Step alignment is deliberately not required — several defaults (a wall
      // R of 2.290965) sit off their own step grid, and a figure derived from a
      // published U-value has no reason to land on one either. But a control
      // whose step and floor are both whole numbers can only ever produce whole
      // numbers, and a fraction there reaches an integer IDF field the engine
      // rejects (a RunPeriod month of 6.5).
      integer = Number.isInteger(control.step) && Number.isInteger(control.min);
      break;
    case 'bearing':
      [min, max] = [0, 360];
      break;
    case 'profile':
      [min, max] = [0, 24]; // an hour of the day, and the band sweeps whole cells
      integer = true;
      break;
    default:
      // A new control kind must be taught its rules here explicitly, not fall
      // into whichever range happens to be last.
      throw new Error(`no value rules are written for a "${control.kind}" control`);
  }
  if (value < min || value > max) return `is outside its ${min}–${max} range`;
  if (integer && !Number.isInteger(value)) return 'is not a whole number';
  return null;
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

/**
 * What the engine made of a channel's declaration, read back off the run.
 *
 * A meter says what a channel is contributing; a readout says what it *is*, in
 * the terms the engine settled on rather than the ones the controls are typed
 * in. There is one, on Glazing, and it exists because the layered model is the
 * only place on this desk where you set causes and are given no result: panes,
 * a coating and a cavity go in, and the U-factor and SHGC that come out are
 * the two numbers a window is actually specified by. They are computed at
 * get-input and printed in the tabular report, so the sheet reads them back —
 * by the rule that nothing here is lettered from a variable when the run holds
 * the answer.
 *
 * It is a reading, so it obeys the readings' rules: an em dash before the
 * first run and after a failed one, and never a figure the engine did not
 * produce.
 */
export class Readout {
  constructor({ label, note = null }) {
    this.label = label;
    this.note = note;
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
    meter = null, readout = null, bypassable = true, bypassed = false, requires = null, prices = false,
  }) {
    this.id = id;
    this.index = index;
    this.name = name;
    this.term = term; // its symbol in the heat balance, set in the header
    this.blurb = blurb;
    this.controls = Object.freeze(controls);
    this.meter = meter;
    this.readout = readout;
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

/**
 * An overhang is cut from the opening it shelters — `applyShading` asks
 * `apertureOn` for the wall's opening first and writes nothing at all when
 * there is none. So a projection set on a solid wall is a number that reaches
 * no object in the document, which is worth saying on the wall it was set on:
 * silently, it is the reader turning a control and watching the sheet not
 * move.
 */
const noOpening = (wall) =>
  `The ${wall} wall has no opening, so an overhang there hangs on nothing.`;

const SHADE_SIDES = [
  { key: 'ohN', side: 'north', label: 'N', needs: (p) => p.wwrN > 0, unreached: noOpening('north') },
  { key: 'ohE', side: 'east', label: 'E', needs: (p) => p.wwrE > 0, unreached: noOpening('east') },
  { key: 'ohS', side: 'south', label: 'S', needs: (p) => p.wwrS > 0, unreached: noOpening('south') },
  { key: 'ohW', side: 'west', label: 'W', needs: (p) => p.wwrW > 0, unreached: noOpening('west') },
];

const glazed = (p) => p.wwrN > 0 || p.wwrE > 0 || p.wwrS > 0 || p.wwrW > 0;
const layered = (p) => p.glazingModel === 'Layered';
// Roof glazing is deliberately a separate question from wall glazing: the two
// channels own different holes in different surfaces, and everything that
// depends on "is there glass here" has to say which glass it means. Fins and
// frames are a wall opening's business; daylight is either one's.
const skylit = (p) => p.skyRatio > 0;
// Whether the rooflights are built of the walls' own assembly. It matters
// beyond the Skylights strip: a blind can only be hung on the layered
// construction, so a rooflight glazed in its own simple unit is one the Blinds
// channel cannot reach.
const skyAsWalls = (p) => p.skyGlass === 'Walls';

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
      'Where the box stands and which way it faces. North turns the building under the sun — the vertices themselves turn, so the drawing holds the box square to the page and turns its north point instead.',
    bypassable: false,
    controls: [
      new Bearing({
        key: 'northAxis',
        label: 'North axis',
        value: 0,
        note: 'Turned into the vertices, since World coordinates have EnergyPlus ignore Building.north_axis. At 0 the wall this demo glazes faces due south.',
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
    readout: new Readout({
      label: 'As built',
      note: 'The engine\'s own figures for this assembly, off the run\'s envelope summary: the glass, and under it the whole window wherever there is a frame for the glass to be corrected against. Under the simple model they are the three sliders above, back from the equivalent layer they were turned into; under the layered one they are what the panes, the coating and the cavity came to, and there is nowhere else to read them.',
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
        key: 'panes',
        label: 'Panes',
        value: 2,
        min: 2,
        max: 4,
        step: 1,
        digits: 0,
        needs: layered,
        note: 'Sheets of glass, with a cavity of the width below between each pair. The simple model has no pane count to give — its three numbers are the whole assembly already — so this is the one place on the desk where a window is built rather than specified.',
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
    id: 'skylights',
    index: '04',
    name: 'Skylights',
    term: 'Q☼↧',
    blurb:
      'The other way in. A rooflight faces the one part of the sky that is never behind a neighbour and never off to one side, so it collects hardest exactly when the building least wants it — and a curb is the only overhang it will ever have.',
    bypassed: true,
    // Read off the roof rather than out of the ESO. The transmitted-solar
    // series the Glazing strip reads is the enclosure's total, walls and roof
    // together, so repeating it here would say nothing about the rooflights in
    // particular; the area and the ratio it makes are what this strip is for,
    // and they are true before anything has been run.
    meter: new Meter({ label: 'Roof glazing', terms: [], derived: true }),
    controls: [
      new Scale({
        key: 'skyRatio',
        label: 'Skylight-to-roof ratio',
        value: 0.06,
        min: 0,
        max: 0.3,
        step: 0.005,
        digits: 3,
        zero: 'Solid',
        note: 'Of the gross roof. Daylighting codes ask for 3–6 %; past about 10 % the summer gain runs away from the light.',
      }),
      new Selector({
        key: 'skyForm',
        label: 'Arrangement',
        value: 'Square',
        options: [
          { value: 'Square', label: 'Square lights' },
          { value: 'Linear', label: 'Linear' },
        ],
        needs: skylit,
        note: 'The same area, spread as discrete lights or as continuous rooflights running the width.',
      }),
      new Scale({
        key: 'skyCount',
        label: 'Units across',
        value: 2,
        min: 1,
        max: 4,
        step: 1,
        digits: 0,
        unit: '×',
        needs: skylit,
        note: 'Square lights sit one per cell of an n × n grid, so 4 across is sixteen of them; linear rooflights are n bands.',
      }),
      new Scale({
        key: 'skyCurb',
        label: 'Curb height',
        value: 0.15,
        min: 0,
        max: 1.2,
        step: 0.01,
        unit: 'm',
        zero: 'Flush',
        needs: skylit,
        note: 'The upstand a rooflight is bedded on, standing all the way round. It is the roof\'s overhang, and the only shade a horizontal opening gets.',
      }),
      new Selector({
        key: 'skyGlass',
        label: 'Rooflight glass',
        value: 'Walls',
        options: [
          { value: 'Walls', label: 'As walls' },
          { value: 'Own', label: 'Its own' },
        ],
        needs: skylit,
        note: 'Its own is a simple unit and nothing can be hung inside one, so rooflights glazed that way take no blind — the walls\' assembly is what the Blinds strip reaches.',
      }),
      new Scale({
        key: 'skyU',
        label: 'Rooflight U-factor',
        value: 2.6,
        min: 0.4,
        max: 6,
        step: 0.01,
        unit: 'W/m²K',
        needs: (p) => skylit(p) && !skyAsWalls(p),
        note: 'A domed unit is a worse assembly than a wall window of the same generation, and it loses to a colder sky.',
      }),
      new Scale({
        key: 'skySHGC',
        label: 'Rooflight SHGC',
        value: 0.35,
        min: 0.05,
        max: 0.9,
        step: 0.01,
        digits: 2,
        needs: (p) => skylit(p) && !skyAsWalls(p),
      }),
      new Scale({
        key: 'skyVisT',
        label: 'Rooflight visible transmittance',
        value: 0.5,
        min: 0.05,
        max: 0.9,
        step: 0.01,
        digits: 2,
        needs: (p) => skylit(p) && !skyAsWalls(p),
      }),
    ],
  }),

  new Channel({
    id: 'shading',
    index: '05',
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
    index: '06',
    name: 'Blinds',
    term: 'Q☼⇅',
    blurb:
      'Shading that answers the weather instead of standing still. The control decides when it deploys, and the slat angle decides what gets through when it does.',
    bypassed: true,
    requires: {
      // The rooflights count as openings a blind can hang on only when they
      // are glazed in the walls' own assembly; their own unit is simple
      // glazing, which is one equivalent layer with no cavity to hang anything
      // in, and EnergyPlus will not accept a shading device on it.
      //
      // Both branches ask whether the opening is actually in the document and
      // not only whether a slider is off zero, for the reason Daylight's
      // precondition does: a channel that is patched out has had its openings
      // deleted, and a blind with nothing to hang in writes an unreferenced
      // material and no shading control at all while the strip reads engaged.
      test: (p, on) =>
        layered(p) &&
        ((glazed(p) && on('glazing')) || (skylit(p) && skyAsWalls(p) && on('skylights'))),
      reason: 'Needs the layered glazing model and at least one opening it can hang in.',
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
    index: '07',
    name: 'Fabric',
    term: 'Q↔',
    blurb:
      'The opaque envelope. Bypassed, every surface goes adiabatic and the box becomes a flask — the cleanest way there is to see what the other channels are worth, though Glazing, Skylights and Shading have to come out with it: EnergyPlus refuses an opening cut into an adiabatic wall and stops the run.',
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
    index: '08',
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
    index: '09',
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
    index: '10',
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
      // Lives here rather than on Run because Run says *when* the holidays are
      // and this says what the building does on one, which is a question about
      // occupancy. At "As weekend" no `For: Holidays` row is written at all and
      // `AllOtherDays` catches a holiday exactly as it always has — which is
      // also the admission that until this control existed, a holiday and a
      // Sunday were the same day to every schedule on the desk.
      new Selector({
        key: 'holidayUse', label: 'Holidays', value: 'AsWeekend',
        options: [
          { value: 'AsWeekend', label: 'As weekend' },
          { value: 'Closed', label: 'Closed' },
          { value: 'Open', label: 'Open' },
        ],
        needs: (p) => p.holidays !== 'No',
      }),
    ],
  }),

  new Channel({
    id: 'daylight',
    index: '11',
    name: 'Daylight',
    term: 'Qlux',
    blurb:
      'The channel that closes the loop. A sensor in the room dims the lights against the daylight the windows let in, so a bigger opening buys back some of the load it costs.',
    bypassed: true,
    requires: {
      // Either kind of opening will do, but it has to be one the document
      // actually holds: a channel that is patched out has had its openings
      // removed, and a daylight sensor in a room with none is a control the
      // engine warns about and the sheet would letter as if it worked.
      test: (p, on) => (glazed(p) && on('glazing')) || (skylit(p) && on('skylights')),
      reason: 'Needs at least one opening — a window or a rooflight — to see daylight through.',
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
    index: '12',
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
    index: '13',
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
    index: '14',
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
    index: '15',
    name: 'Tariff',
    term: '¤',
    prices: true,
    bypassable: false,
    blurb:
      'The published rate, and what happens if it is wrong. Left alone the bill uses the tariff and grid factor published for this place; taken to Assumed, it uses what you set — which is how a grid that has not decarbonised yet gets tested against one that has.',
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
    index: '16',
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
    index: '17',
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
      // The two sources are orthogonal in EnergyPlus and the strip has to say so.
      // `use_weather_file_holidays_and_special_days = No` turns off the file's
      // days but leaves any `RunPeriodControl:SpecialDays` standing, and where
      // both are on the file's specification takes precedence. So "From file"
      // still writes the list — it just loses to the file where they collide —
      // and "None" parks a list rather than destroying it, which is what makes
      // the preset buttons safe to press.
      new Selector({
        key: 'holidays', label: 'Holidays', value: 'Yes',
        options: [
          { value: 'Yes', label: 'From file' },
          { value: 'Listed', label: 'Listed' },
          { value: 'No', label: 'None' },
        ],
      }),
      new Days({
        key: 'holidayDays', label: 'Holidays observed', value: '',
        presets: HOLIDAY_CALENDARS,
        needs: (p) => p.holidays !== 'No',
        note:
          'One RunPeriodControl:SpecialDays each. Only reaches the model on a weather-file run period — the design days carry no calendar.',
      }),
      new Selector({
        key: 'holidayRule', label: 'Weekend holiday rule', value: 'No',
        options: [
          { value: 'No', label: 'Keep' },
          { value: 'Yes', label: 'Observe' },
        ],
        needs: (p) => p.holidays !== 'No' && p.holidayUse !== 'AsWeekend',
        note:
          'Moves a holiday that lands on a weekend onto the adjacent weekday. The run follows the weather file\'s own calendar, so the weekend it moves off is a real one.',
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

/**
 * How a key reads inside a sentence, as opposed to on a label.
 *
 * A wall of a plan key has to name its wall here even though the label above
 * it does not: "the study of the overhang projection" is four controls at
 * once, and the reader has four cards on the desk to tell apart. Lower case
 * because every caller sets it mid-sentence.
 */
export function phraseFor(key) {
  const { control, side } = controlFor(key);
  const said = control.label.toLowerCase();
  return side ? `the ${side.side} wall's ${said}` : said;
}

export const CHANNEL_BY_ID = Object.freeze(Object.fromEntries(CHANNELS.map((c) => [c.id, c])));

/** Every parameter key, in strip order. Used to key a solve. */
export const ALL_KEYS = Object.freeze([...CHANNELS.flatMap((c) => c.keys()), 'occFrom', 'occTo'].filter(
  (k, i, all) => all.indexOf(k) === i,
));
