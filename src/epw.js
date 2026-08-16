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
