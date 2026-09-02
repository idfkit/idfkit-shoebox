/**
 * The EPW header's calendar record, read.
 *
 * Its own module rather than part of `weather.js`, for the reason `readings.js`
 * is its own: `weather.js` resolves URLs against `import.meta.env.BASE_URL` and
 * cannot be imported from Node, and this is exactly the kind of parsing whose
 * only honest test is a real file.
 */
import { parseHolidays, serializeHolidays } from './controls.js';

/**
 * What calendar an EPW actually carries.
 *
 * The header record is
 *
 *     HOLIDAYS/DAYLIGHT SAVINGS,<leap year>,<DST start>,<DST end>,<n>,<name>,<date>,…
 *
 * and `RunPeriod.use_weather_file_holidays_and_special_days` reads exactly this.
 * Which is the reason for parsing it: **every TMYx file reads `No,0,0,0,0`**.
 * Measured, not assumed — Denver 725650 and Berlin-Tegel 103820 in the
 * 2009–2023 window, and all five EPWs shipped with EnergyPlus 26.1. So "From
 * file" has always been reading an empty list and reporting nothing about it,
 * and so has the daylight saving control beside it. A reading with nothing
 * behind it has to say so rather than look like a zero, which is what this
 * function exists to let the Run strip do.
 *
 * Where a file *does* name days — hand-built ones and some non-TMYx sources do
 * — they become a stamp on the holiday list like any published calendar.
 *
 * Returns `{ holidays, daylight }`. A file with no such record at all is not an
 * error: the record is optional, and its absence means the same as `0`.
 */
export function parseEpwCalendar(epw) {
  const line = epw.split(/\r?\n/, 12).find((row) => /^HOLIDAYS\/DAYLIGHT SAVINGS\s*,/i.test(row));
  if (!line) return { holidays: [], daylight: null };

  const fields = line.split(',').map((f) => f.trim());
  // fields: [tag, leap year, DST start, DST end, count, name, date, name, date, …]
  const daylight =
    fields[2] && fields[3] && fields[2] !== '0' && fields[3] !== '0'
      ? { from: fields[2], to: fields[3] }
      : null;

  const count = Number(fields[4]);
  if (!Number.isInteger(count) || count < 1) return { holidays: [], daylight };

  const holidays = [];
  for (let at = 0; at < count; at += 1) {
    const name = fields[5 + at * 2];
    const date = fields[6 + at * 2];
    // The pair is skipped rather than throwing: a malformed holiday record is
    // no reason to refuse a city its weather, and the count the strip reports
    // is of what was actually read.
    if (!name || !date) continue;
    holidays.push({ name, date });
  }
  return { holidays, daylight };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The weekday the file's data begins on, 0 for Sunday, or null.
 *
 * From the `DATA PERIODS` record — `DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31` on
 * every TMYx. This is the calendar EnergyPlus runs on once `RunPeriod` stops
 * overriding it, so it is also the calendar the desk has to letter its holidays
 * against: a non-leap year is fully determined by the weekday its 1 January
 * falls on, and this is that weekday.
 *
 * Null for a file whose record names a start day this does not recognise. The
 * dates are then not lettered at all rather than lettered against a guess.
 */
export function parseEpwStartDay(epw) {
  const line = epw.split(/\r?\n/, 12).find((row) => /^DATA PERIODS\s*,/i.test(row));
  if (!line) return null;
  const named = (line.split(',')[4] ?? '').trim().toLowerCase();
  const found = WEEKDAYS.findIndex((d) => d.toLowerCase() === named);
  return found === -1 ? null : found;
}

/**
 * A file's own holidays as a holiday list, ready to become the parameter.
 *
 * An EPW writes its dates in the same grammar the IDF date field uses, which is
 * wider than the canonical one the desk carries: full month and weekday names,
 * `4th` rather than `4`, and `January 1` as readily as `1/1`. So the spellings
 * are narrowed here and the result is handed to `parseHolidays`, which is the
 * one validator — nothing is accepted that a typed entry would not be.
 *
 * Throws if any of the file's days cannot be read. The offer is then not made
 * at all and the strip says why, rather than stamping the subset that happened
 * to parse.
 */
export function holidayList(holidays) {
  return serializeHolidays(
    parseHolidays(holidays.map((h) => `${epwDate(h.date)}: ${h.name}`).join(';')),
  );
}

/** One EPW date token, narrowed to the canonical grammar. */
function epwDate(raw) {
  const date = raw.trim().replace(/\s+/g, ' ');

  // `1/ 1` and `01/01` are the same day as `1/1`.
  const slash = date.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (slash) return `${Number(slash[1])}/${Number(slash[2])}`;

  // `January 1` and `1 January`, the two orders the field accepts, either
  // spelled out or abbreviated.
  const monthFirst = date.match(/^([A-Za-z]{3,9})\.? (\d{1,2})$/);
  if (monthFirst && monthNumber(monthFirst[1])) {
    return `${monthNumber(monthFirst[1])}/${Number(monthFirst[2])}`;
  }
  const dayFirst = date.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?$/);
  if (dayFirst && monthNumber(dayFirst[2])) {
    return `${monthNumber(dayFirst[2])}/${Number(dayFirst[1])}`;
  }

  // `4th Thursday in November` and `Last Monday In May`.
  const nth = date.match(/^(\d)(?:st|nd|rd|th)? ([A-Za-z]+) in ([A-Za-z]+)$/i);
  if (nth) return `${nth[1]} ${short(nth[2])} in ${short(nth[3])}`;
  const last = date.match(/^Last ([A-Za-z]+) in ([A-Za-z]+)$/i);
  if (last) return `Last ${short(last[1])} in ${short(last[2])}`;

  // Handed on unchanged, so `parseHolidays` is the one that names what is
  // wrong with it — there is no second opinion about what a date is.
  return date;
}

/** 1 to 12, or 0 for a word that is not a month. */
const monthNumber = (word) =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(word.slice(0, 3).toLowerCase()) + 1;

const short = (word) => word.slice(0, 3);

/**
 * The 365 daily mean dry-bulb temperatures the file carries.
 *
 * The comfort line of TM52 equation 2.2 is a recursion over daily means, and
 * the seed of equation 2.3 reaches back to 23 April — a week before the
 * overheating season starts and months before any summer run period the Run
 * strip can be asked to solve. So the means have to be read off the weather
 * file rather than off the run, which is the whole reason the comfort line is
 * identical between a desk calendared for the whole year and one calendared for
 * June to August. Off the run they would not be: the July of a June-to-August
 * mask has 30 days of history behind it and the July of a whole year has 181.
 *
 * Measured at 3.2 ms for the 8,760 records of Chicago TMY3, median of 200
 * passes under Node 22 — comfortably inside the 13.2 ms the plan budgeted, and
 * still by a distance the most expensive thing in this feature: nearly twice
 * the 1.71 ms all five TM59 criteria cost together, and a fifth of a 16.7 ms
 * frame. That is the whole reason the caller caches it on the attached weather
 * file's identity, the way `offersFor` and `calendarFor` are cached on the
 * ESO's, and clears it where the studies and the sample cache are cleared: on a
 * station change. These 8,760 lines cannot have changed unless the station did,
 * and paid per gesture frame they would be the one expensive thing in a drag
 * that is otherwise array indexing.
 *
 * Everything below is one pass over the records, and it stays that way: the
 * split limit of 7 stops each line at the dry-bulb field rather than building
 * the 35 the record actually carries.
 *
 * Throws naming the first day it could not read. There is no partial answer
 * here — a series of 364 means recursed to 30 September lands the comfort line
 * a day out for the whole season, and nothing in the shape of the curve shows
 * it.
 */
export function dailyMeans(epw) {
  const lines = epw.split(/\r?\n/);
  const header = lines.findIndex((row) => /^DATA PERIODS\s*,/i.test(row));
  if (header === -1) {
    throw new Error('this weather file carries no DATA PERIODS record to say where its data begins');
  }

  // `DATA PERIODS,<periods>,<records per hour>,<name>,<start day>,<from>,<to>`.
  // Both counts are read rather than assumed: a sub-hourly file is a perfectly
  // good file and its daily mean is the same arithmetic over more records, but
  // a file split into several periods is not one unbroken year and there is no
  // honest daily mean series to take off it.
  const periods = lines[header].split(',').map((f) => f.trim());
  if (Number(periods[1]) !== 1) {
    throw new Error(
      `this weather file declares "${periods[1]}" data periods,` +
        ' and a daily mean series wants one unbroken year',
    );
  }
  const perHour = Number(periods[2]);
  if (!Number.isInteger(perHour) || perHour < 1) {
    throw new Error(`this weather file declares "${periods[2]}" records per hour, which is not a count`);
  }

  const sums = new Float64Array(365);
  const seen = new Int32Array(365);

  for (let at = header + 1; at < lines.length; at += 1) {
    const line = lines[at];
    // Only the blank the trailing newline leaves is skipped here. Completeness
    // is decided by the per-day count below, so a record genuinely missing from
    // the middle of the file is caught there and named as the day it belongs
    // to, which is the thing the reader can act on.
    if (!line) continue;

    const fields = line.split(',', 7);
    if (fields.length < 7) {
      throw new Error(
        `record ${at - header} of this weather file carries ${fields.length} fields,` +
          ' too few to reach its dry-bulb temperature',
      );
    }

    const month = Number(fields[1]);
    const day = Number(fields[2]);

    // A leap file is refused by its own 29 February rather than by arriving at
    // 366 days, because that is the sentence a reader can do something with.
    // The desk runs a 365-day calendar throughout — `RunPeriod` leaves
    // `begin_year` empty so EnergyPlus picks a non-leap year to match the
    // file's start weekday — and a leap year silently runs 365 days against a
    // 366-day file, shifting every date after February.
    if (month === 2 && day === 29) {
      throw new Error(
        'this weather file carries 29 February, so it is a leap year of 8,784 records and its' +
          ' dates cannot be read against the 365-day calendar the run uses',
      );
    }
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > MONTH_LENGTHS[month - 1]
    ) {
      throw new Error(
        `record ${at - header} of this weather file names month ${fields[1]} day ${fields[2]},` +
          ' which is not a date in the year',
      );
    }

    // The EPW data dictionary types dry bulb as greater than −70 °C and less
    // than 70 °C, with 99.9 as its missing value. The bounds are the test
    // rather than a comparison against 99.9 exactly, because anything outside
    // them is not a temperature whatever it was meant to be. It matters more
    // than it looks: one 99.9 among the twenty-four readings of a 10 °C day
    // lifts that day's mean by 3.7 K and carries the comfort line up with it
    // for a week afterwards, since the running mean has an eight-tenths memory.
    const drybulb = Number(fields[6]);
    if (!Number.isFinite(drybulb) || drybulb <= -70 || drybulb >= 70) {
      throw new Error(
        `the dry-bulb temperature at hour ${fields[3]} of ${day} ${MONTH_NAMES[month - 1]}` +
          ` reads "${fields[6]}", which is not a temperature the file claims to have recorded`,
      );
    }

    const index = MONTH_STARTS[month - 1] + day - 1;
    sums[index] += drybulb;
    seen[index] += 1;
  }

  const wanted = 24 * perHour;
  const means = new Array(365);
  for (let index = 0; index < 365; index += 1) {
    if (seen[index] !== wanted) {
      throw new Error(
        `this weather file carries ${seen[index]} of the ${wanted} records ${dayName(index)} needs,` +
          ' so no mean can be taken for that day',
      );
    }
    means[index] = sums[index] / wanted;
  }
  return means;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The day of the year each month begins at, zero-based, on a 365-day calendar. */
const MONTH_STARTS = MONTH_LENGTHS.reduce(
  (starts, length, month) => (month === 11 ? starts : [...starts, starts[month] + length]),
  [0],
);

/** `112` reads as `23 April`, so a refusal names the day rather than an index. */
function dayName(index) {
  const month = MONTH_STARTS.findLastIndex((start) => start <= index);
  return `${index - MONTH_STARTS[month] + 1} ${MONTH_NAMES[month]}`;
}
