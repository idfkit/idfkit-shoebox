/**
 * The EPW header's calendar record, read.
 *
 * Its own module rather than part of `weather.js`, for the reason `readings.js`
 * is its own: `weather.js` resolves URLs against `import.meta.env.BASE_URL` and
 * cannot be imported from Node, and this is exactly the kind of parsing whose
 * only honest test is a real file.
 */
import { DAYS_IN_MONTH, MONTH_NAMES, parseHolidays, serializeHolidays } from './controls.js';
import { WeatherFile } from './tm59.js';

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
 * What the attached EPW's own LOCATION record says about itself.
 *
 * Here beside `parseEpwCalendar`, `parseEpwStartDay` and `dailyMeans` for the
 * reason they are here: this is EPW parsing, its only honest test is a real
 * file, and nothing outside this module has to know the record's shape. It was
 * written in `main.js` and moved without a change to what it reads.
 *
 * The record is the first line of every EPW and the fields are positional:
 * `LOCATION,City,State,Country,Source,WMO,Lat,Lon,TimeZone,Elevation`.
 * `WeatherFile` wants six of the ten and refuses a partial object outright, so
 * every one of them is passed and an absent field is passed as `null` — "the
 * file says nothing here" and "nobody read it" must not be the same state, and
 * an empty field between two commas is the first of those. A file carrying no
 * LOCATION record at all is the same statement made six times over, which is
 * exactly what `WeatherFile.declares` letters as "a file whose LOCATION record
 * declares nothing about itself"; there is nothing to throw about and nothing
 * to substitute.
 *
 * Nothing here judges the file. WFR:2026 names a specific one and this page
 * cannot read a file's provenance, so the two descriptions are printed side by
 * side and the reader draws the conclusion (FR-015).
 *
 * **Returns the pair `{ declares, place }`, not the `WeatherFile` alone**, and
 * that is forced rather than chosen. `WeatherFile`'s constructor walks an exact
 * list of six field names, assigns those and freezes — so a latitude added to
 * the object handed to it is dropped on the floor without a word, and a
 * `Site:Location` written from the result would carry `undefined` where the
 * model needs a number. Widening the class instead is not available either: it
 * is the sheet's statement of what a file *declares about itself*, held against
 * WFR:2026 in words, and a latitude is not part of that sentence. So the six
 * stay exactly where they were and `place` carries what the model and the title
 * block need — the eight fields of the feature's `Place`, in the record's own
 * order.
 *
 * `place`'s four numbers are read with `Number` and land as `null` where the
 * field is empty, a hyphen, or not a finite number. **Zero is a measurement
 * here and an unusually easy one to lose**, because `Number('') === 0` and
 * `Number('-') === NaN` are both one character away from a reading: a station
 * at sea level publishes an elevation of 0 m, and a UK file writes 0 for its
 * time zone and very nearly 0 for its longitude. "The site is at sea level" and
 * "the file says nothing about its elevation" are two different facts and
 * neither may be spelled with the other.
 *
 * A field that is present but unreadable as a number is `null` too rather than
 * a throw, because this function never throws: a garbled latitude is one more
 * thing the file fails to declare, and the refusal belongs at the moment
 * somebody actually needs the number, where `siteLocationValues` can name the
 * field. `timeZone` is consequently the one field read twice — as the record's
 * own text for `WeatherFile`, which letters it, and as a number for `place`,
 * because `Site:Location.time_zone` is a numeric field and a string would reach
 * the IDF as one.
 */
export function readLocation(epw) {
  // Only the head of the file is searched. The record is the first line of a
  // conforming EPW, and scanning 8,760 data rows for a header that is not
  // there would be the one expensive way to answer "no".
  const line = epw.split(/\r?\n/, 16).find((row) => /^LOCATION\s*,/i.test(row));
  const fields = line ? line.split(',').map((field) => field.trim()) : [];
  // onebuilding writes a bare hyphen where a station has no record to publish,
  // the same convention the DDY uses for a design condition it cannot fill.
  const at = (i) => (fields[i] && fields[i] !== '-' ? fields[i] : null);
  const number = (i) => {
    const raw = at(i);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return Object.freeze({
    declares: new WeatherFile({
      city: at(1),
      region: at(2),
      country: at(3),
      source: at(4),
      wmo: at(5),
      timeZone: at(8),
    }),
    place: Object.freeze({
      city: at(1),
      region: at(2),
      country: at(3),
      wmo: at(5),
      latitude: number(6),
      longitude: number(7),
      timeZone: number(8),
      elevation: number(9),
    }),
  });
}

/**
 * A place, as the four fields `Site:Location` wants it.
 *
 * The station path never had to spell these: `designConditionsFrom` copies the
 * DDY's parsed object through `toJSON()`, so the spellings ride along from a
 * file EnergyPlus itself wrote. A file attached by the reader carries no such
 * object, so this is the first place in this repository that names the fields —
 * and CLAUDE.md's rule is that field names drift between versions and are
 * checked against the schema, never recalled. They are: `latitude`,
 * `longitude`, `time_zone`, `elevation`, all four typed numeric (`t === 'n'`),
 * confirmed against the 26.1.0 schema by
 * `specs/012-attach-weather-file/verify/schema-fields.mjs`.
 *
 * The object's *name* is not one of them. `doc.add(type, name, values)` takes
 * the identifier separately, and the city goes there, so what comes back here
 * is four values and nothing else.
 *
 * Throws naming the field where any of the four is absent. A `Site:Location`
 * completed from a default is not a document with a gap in it — it is a
 * building silently moved to somewhere else, solved against a sun path and a
 * clock belonging to that other place, and every reading on the sheet is then
 * a measurement of a site nobody asked about. There is no nearest match to a
 * latitude.
 */
export function siteLocationValues(place) {
  const values = {
    latitude: place.latitude,
    longitude: place.longitude,
    time_zone: place.timeZone,
    elevation: place.elevation,
  };
  for (const [field, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      throw new Error(
        `this weather file's LOCATION record declares no ${field.replace(/_/g, ' ')}, and` +
          ' Site:Location wants one — a site is not something this page is going to fill in with a' +
          ' default',
      );
    }
  }
  return values;
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
 * The daily mean dry-bulb temperature of every day the file carries, and `null`
 * for each of the 365 it does not.
 *
 * Always 365 slots, so a day is always at its own index and no caller has to
 * hold an offset: the array is the calendar, and a `null` in it is the file
 * saying it has no records for that day. `dailyMeans` below is the same series
 * refused unless every slot is filled, which is what the comfort line needs.
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
export function dailyMeansCarried(epw) {
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
      day > DAYS_IN_MONTH[month - 1]
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
  const means = new Array(365).fill(null);
  for (let index = 0; index < 365; index += 1) {
    // No records at all is a day this file does not carry, and that is a fact
    // about its extent rather than a fault in it: a DSY cut to the overheating
    // season carries 153 days and is the file the method asks for. **Some** of a
    // day's records is a fault, and it is refused here as it always was — a mean
    // over 23 of 24 hours is a temperature nobody measured, and nothing in the
    // shape of the series shows which day it was taken over.
    if (seen[index] === 0) continue;
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

/**
 * The same series, refused unless it is a whole year.
 *
 * The comfort line's caller, and the one contract every reading that recurses
 * over the year is written against: 365 numbers or a sentence, never a short
 * array. `runningMean` seeds from 23 April and recurses day by day to 30
 * September with an eight-tenths memory, so a gap anywhere before the season
 * carries into every day of it, and a series that is simply shorter would land
 * the whole line a day out with nothing in the curve's shape showing it.
 *
 * Kept as its own function rather than as a flag on `dailyMeansCarried`, because
 * the two answer different questions and both are asked. The gate in
 * `source.js` asks what the file carries, so that a part-year file is admitted
 * and only the readings its months cannot support are refused; the comfort line
 * asks for a year, and gets this sentence when the file has not got one.
 *
 * The refusal names the extent rather than the first day it happened to miss.
 * `carries 0 of the 24 records 1 January needs` is what a 1 May file used to be
 * told, which reads as a broken file rather than a shorter one, and sends the
 * reader looking for a corrupt record that is not there.
 */
export function dailyMeans(epw) {
  const means = dailyMeansCarried(epw);
  const carried = means.reduce((count, mean) => count + (mean === null ? 0 : 1), 0);
  if (carried !== 365) {
    const first = means.findIndex((mean) => mean !== null);
    const last = means.findLastIndex((mean) => mean !== null);
    throw new Error(
      `this weather file carries ${carried} of the 365 days of a year` +
        (first === -1 ? '' : ` — ${dayName(first)} to ${dayName(last)} —`) +
        ' and a daily mean series recurses from 23 April, so it wants an unbroken one',
    );
  }
  return means;
}

/**
 * The stretch of the year a file actually carries, and how finely.
 *
 * `{ from, to, perHour }`, the two dates as `{ month, day }`. It is what the
 * sheet letters as the period, and what decides whether a reading whose months
 * fall outside it is an em dash rather than a number.
 *
 * **The dates are the first and last data record's, not the header's declared
 * ones.** The `DATA PERIODS` record states a start and an end, and on a TMYx
 * the two agree with the data; on a file cut down to a season, or truncated
 * mid-download, they need not. A reading is taken off records, so the period a
 * reading can be taken over is the records' — and the one case where the two
 * disagree is exactly the case where a reader is about to be told a summer was
 * simulated that the file stops halfway through.
 *
 * A whole year is not assumed anywhere here. A file beginning on 1 May and
 * ending on 30 September is a perfectly good file to read TM59 over and a
 * useless one to read an annual bill over, and that is a judgement for the
 * caller holding the months in question, not for this function.
 *
 * `perHour` is field 2 of the same record, read rather than assumed for the
 * reason `dailyMeans` sets out where it reads the same field. It is read again
 * here rather than handed over because a caller wanting the period of a file
 * has no business parsing 8,760 records to learn its interval.
 *
 * Throws naming what was missing where there is no `DATA PERIODS` record, no
 * data record after it, or a stamp that is not a date.
 */
export function periodCovered(epw) {
  const lines = epw.split(/\r?\n/);
  const header = lines.findIndex((row) => /^DATA PERIODS\s*,/i.test(row));
  if (header === -1) {
    throw new Error(
      'this weather file carries no DATA PERIODS record to say what period its data covers',
    );
  }

  const periods = lines[header].split(',').map((f) => f.trim());
  const perHour = Number(periods[2]);
  if (!Number.isInteger(perHour) || perHour < 1) {
    throw new Error(`this weather file declares "${periods[2]}" records per hour, which is not a count`);
  }

  // Forwards to the first record and backwards to the last, rather than over
  // all 8,760: the two ends are the whole question, and the split above is
  // already the expensive part of answering it. Blank lines are skipped at both
  // ends because the trailing newline leaves one, and a file whose records are
  // separated by them is still a file whose records are these.
  let first = header + 1;
  while (first < lines.length && !lines[first]) first += 1;
  let last = lines.length - 1;
  while (last > header && !lines[last]) last -= 1;
  if (first >= lines.length || last <= header) {
    throw new Error(
      'this weather file carries no data record after its DATA PERIODS record, so there is no' +
        ' period for it to cover',
    );
  }

  return Object.freeze({
    from: stamp(lines[first], 'first'),
    to: stamp(lines[last], 'last'),
    perHour,
  });
}

/**
 * The month and day one data record is stamped with.
 *
 * 29 February is allowed through where `dailyMeans` refuses it, and deliberately
 * so: a leap file is refused once, by the function whose 365-day arithmetic it
 * breaks, in the sentence that says what is wrong with it. Refused a second time
 * here the reader would get whichever of the two messages the caller happened to
 * ask for first, and the period of a leap file is a fact about it either way.
 */
function stamp(line, which) {
  // The split limit stops each line at the day field rather than building the
  // 35 the record carries, the same economy `dailyMeans` keeps.
  const fields = line.split(',', 3);
  if (fields.length < 3) {
    throw new Error(
      `the ${which} data record of this weather file carries ${fields.length} fields,` +
        ' too few to reach the day it is stamped with',
    );
  }
  const month = Number(fields[1]);
  const day = Number(fields[2]);
  const leapDay = month === 2 && day === 29;
  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    (day > DAYS_IN_MONTH[month - 1] && !leapDay)
  ) {
    throw new Error(
      `the ${which} data record of this weather file names month ${fields[1]} day ${fields[2]},` +
        ' which is not a date in the year',
    );
  }
  return Object.freeze({ month, day });
}

/**
 * Refuses a file that is missing a day inside the stretch it says it covers.
 *
 * The half of the old whole-year gate that is still a fault rather than an
 * extent. `dailyMeansCarried` returns `null` for a day it has no records for,
 * which for a file cut to a season is most of the year and perfectly correct —
 * but for a day sitting between that file's own first and last record it is a
 * hole, and a hole is a broken file however short the file is. Left admitted,
 * every reading taken over those months would be taken over a year with a day
 * missing out of the middle of it, and nothing in any figure would show which.
 *
 * `period` is `periodCovered`'s own answer, so the two ends are the records'
 * rather than the header's declared ones — which is the whole reason that
 * function reads them off the data, and the difference between a file cut to a
 * season and a file truncated mid-download.
 *
 * Throws naming the day and the stretch it sits inside. A leap day never reaches
 * here: `dailyMeansCarried` refuses 29 February by its own sentence first.
 */
export function assertCarriesItsPeriod(means, period) {
  const first = dayIndexOf(period.from);
  const last = dayIndexOf(period.to);
  // A file whose last stamp falls earlier in the year than its first is one that
  // crosses the new year — December to February. Its covered set is two stretches
  // rather than one, and reading it as `first..last` would call ten months of
  // deliberate absence a hole.
  const inside = (index) =>
    first <= last ? index >= first && index <= last : index >= first || index <= last;

  for (let index = 0; index < 365; index += 1) {
    if (means[index] === null && inside(index)) {
      throw new Error(
        `this weather file runs from ${dayName(first)} to ${dayName(last)} and carries no record at all` +
          ` for ${dayName(index)}, which is inside that`,
      );
    }
  }
}

/**
 * Which whole months a file's own extent carries, as the twelve-character mask
 * the Run strip's calendar is written in.
 *
 * **Whole months.** `applyRun` writes one `RunPeriod` per contiguous group of
 * ticked months, from the first of the first to the last of the last, so a file
 * carrying 1 June to 20 August cannot run August at all — asked to, EnergyPlus
 * reaches 21 August, finds no record, and terminates in `GetNextEnvironment`
 * blaming nothing the reader did. A month is therefore runnable only where every
 * one of its days is in the file, which is what this counts.
 *
 * Returns `'111111111111'` for a whole year, which is every archive the picker
 * fetches, so the caller's comparison is a no-op on the station path.
 */
export function monthsCovered(period) {
  const first = dayIndexOf(period.from);
  const last = dayIndexOf(period.to);
  const inside = (index) =>
    first <= last ? index >= first && index <= last : index >= first || index <= last;

  let mask = '';
  for (let month = 0; month < 12; month += 1) {
    let whole = true;
    for (let day = 0; day < DAYS_IN_MONTH[month]; day += 1) {
      if (!inside(MONTH_STARTS[month] + day)) {
        whole = false;
        break;
      }
    }
    mask += whole ? '1' : '0';
  }
  return mask;
}

/** Which of the 365 days a `{ month, day }` stamp is, zero-based. */
const dayIndexOf = ({ month, day }) => MONTH_STARTS[month - 1] + day - 1;

/**
 * The day of the year each month begins at, zero-based, on a 365-day calendar.
 *
 * The calendar itself — the twelve lengths and the twelve names — is taken off
 * the declaration rather than restated. A further copy in `src/` is the drift
 * Principle III exists to prevent, and the lengths would have been the sharpest
 * of them: `dailyMeans` counts each day's records against them and `tm59.js`
 * indexes the comfort line by a day number taken off `controls.js`'s, so a
 * February that ever differed between the two would shift the whole season's
 * line with nothing in the curve's shape showing it. The names carry no
 * arithmetic, only the sentence a refusal is written in, and they come from the
 * same place for the plainer reason that two lists of one year is one list too
 * many.
 */
const MONTH_STARTS = DAYS_IN_MONTH.reduce(
  (starts, length, month) => (month === 11 ? starts : [...starts, starts[month] + length]),
  [0],
);

/** `112` reads as `23 April`, so a refusal names the day rather than an index. */
function dayName(index) {
  const month = MONTH_STARTS.findLastIndex((start) => start <= index);
  return `${index - MONTH_STARTS[month] + 1} ${MONTH_NAMES[month]}`;
}
