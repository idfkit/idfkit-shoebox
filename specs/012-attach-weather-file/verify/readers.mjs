/**
 * Quickstart gates 3 and 4 — the header readers and the fingerprint.
 *
 * DOM-free and engine-free, over the real modules. Everything here is over
 * *synthetic* files (see `fixtures.mjs` for why), so what it proves is that the
 * readers read what is in front of them and refuse what they should. What it
 * cannot prove is anything about a bought file, and the gates that need one are
 * recorded not-run at the foot rather than quietly left out.
 */
import { harness } from './kit.mjs';
import {
  epwBlankLocation,
  epwCrlf,
  epwDaylightSaving,
  epwLeapYear,
  epwLf,
  epwMissingAprilRecord,
  epwNoDaylightSaving,
  epwNoLocation,
  epwNoTrailingNewline,
  epwPartYear,
  epwSubHourly,
  epwWholeYear,
  STATIONS,
} from './fixtures.mjs';
import {
  assertCarriesItsPeriod,
  dailyMeans,
  dailyMeansCarried,
  parseEpwCalendar,
  periodCovered,
  readLocation,
  siteLocationValues,
} from '../../../src/epw.js';
import { degreeDaysOf, fingerprint } from '../../../src/source.js';
import { coversSeason } from '../../../src/tm59.js';

const h = harness('gates 3 and 4 — the readers and the fingerprint');
const bytes = (text) => new TextEncoder().encode(text);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

/* ── gate 3: what the header says ─────────────────────────────────────── */

const { declares, place } = readLocation(epwWholeYear());
h.ok('the city comes off the record', place.city === STATIONS.london.city, place.city);
h.ok('so does the country', place.country === 'GBR', String(place.country));
h.ok('the four numbers are numbers', [place.latitude, place.longitude, place.timeZone, place.elevation].every(Number.isFinite));
h.ok('a time zone of 0 is a measurement, not an absence', place.timeZone === 0, String(place.timeZone));
h.ok('`declares` reads as a phrase', /GBR/.test(declares.declares), declares.declares);

const blank = readLocation(epwBlankLocation());
h.ok('an empty field is null', blank.place.region === null, JSON.stringify(blank.place.region));
h.ok('a bare hyphen is null too', blank.place.wmo === null || blank.place.city === null);

const none = readLocation(epwNoLocation());
h.ok('no LOCATION record does not throw', none.declares instanceof Object);
h.ok(
  'and says so in those words',
  /declares nothing about itself/.test(none.declares.declares),
  none.declares.declares,
);
h.ok(
  'siteLocationValues refuses a place it cannot site',
  /declares no latitude/.test(threw(() => siteLocationValues(none.place)) ?? ''),
  threw(() => siteLocationValues(none.place)),
);

const spelled = siteLocationValues(place);
h.ok(
  'the four fields are spelled as the schema spells them',
  ['latitude', 'longitude', 'time_zone', 'elevation'].every((f) => f in spelled) && !('name' in spelled),
  Object.keys(spelled).join(', '),
);

/* ── the period, off the records rather than the header ───────────────── */

const year = periodCovered(epwWholeYear());
h.ok('a whole year reads 1 Jan to 31 Dec', year.from.month === 1 && year.to.month === 12 && year.perHour === 1);
const part = periodCovered(epwPartYear());
h.ok('a part year is not straightened into one', part.from.month === 6 && part.to.month === 8,
  `${part.from.month} to ${part.to.month}`);
const sub = periodCovered(epwSubHourly());
h.ok('a sub-hourly file reports its own rate', sub.perHour === 4, String(sub.perHour));

/* ── the calendar ─────────────────────────────────────────────────────── */

h.ok('a TMYx-shaped file declares no daylight saving', parseEpwCalendar(epwNoDaylightSaving()).daylight === null);
const dst = parseEpwCalendar(epwDaylightSaving());
h.ok('a file that declares one is read', Boolean(dst.daylight?.from && dst.daylight?.to), JSON.stringify(dst.daylight));

/* ── what must be refused, in the parser's own words ──────────────────── */

// A fault in the file, refused whole by the reader that found it. These are the
// files the desk cannot run at all.
for (const [label, build, wanted] of [
  ['a leap year', epwLeapYear, /29 February/],
  ['a record missing from April', epwMissingAprilRecord, /23 of the 24 records 15 April/],
]) {
  const message = threw(() => dailyMeansCarried(build()));
  h.ok(`${label} is refused, naming the day`, wanted.test(message ?? ''), message?.slice(0, 90));
}

/* ── an extent is not a fault ─────────────────────────────────────────── */

// The distinction the attach gate turns on (T078). A part year is a file the
// desk admits and reads what it can off; only the readings wanting a year refuse
// themselves, and they name the extent rather than the first day they happened
// to miss — `carries 0 of the 24 records 1 January needs` read as a broken file
// and sent the reader looking for a corrupt record that was not there.
const partCarried = dailyMeansCarried(epwPartYear());
h.ok(
  'a part year is carried, day by day, in its own places',
  partCarried.filter((mean) => mean !== null).length === 92 && partCarried[0] === null,
  `${partCarried.filter((mean) => mean !== null).length} days`,
);
h.ok('and a whole year fills all 365', dailyMeansCarried(epwWholeYear()).every(Number.isFinite));
const shortYear = threw(() => dailyMeans(epwPartYear()));
h.ok(
  'a year is refused for a part year, naming the extent',
  /92 of the 365 days/.test(shortYear ?? '') && /1 June to 31 August/.test(shortYear ?? ''),
  shortYear?.slice(0, 110),
);
h.ok(
  'a whole year is not refused',
  threw(() => dailyMeans(epwWholeYear())) === null,
);
// A day missing from inside the file's own stretch is a hole, and a hole is a
// fault however short the file is.
const holed = (() => {
  const lines = epwWholeYear().split('\r\n');
  const head = lines.findIndex((line) => /^DATA PERIODS/i.test(line));
  return lines.filter((line, at) => !(at > head && /^\d+,4,15,/.test(line))).join('\r\n');
})();
h.ok(
  'a day missing from inside the period is still refused',
  /15 April/.test(threw(() => assertCarriesItsPeriod(dailyMeansCarried(holed), periodCovered(holed))) ?? ''),
  threw(() => assertCarriesItsPeriod(dailyMeansCarried(holed), periodCovered(holed)))?.slice(0, 110),
);
h.ok(
  'and a part year has no hole in it',
  threw(() => assertCarriesItsPeriod(partCarried, periodCovered(epwPartYear()))) === null,
);
// Which of the two the overheating criteria may be read over at all (T079).
h.ok('a whole year reaches the assessment period', coversSeason(periodCovered(epwWholeYear())));
h.ok('a June-to-August file does not', coversSeason(periodCovered(epwPartYear())) === false);

/* ── degree days, measured and said to be ─────────────────────────────── */

const days = degreeDaysOf(dailyMeansCarried(epwWholeYear()));
h.ok('degree days come out of the daily means', days.hdd18 > 0 && days.cdd10 > 0,
  `${Math.round(days.hdd18)} HDD18 / ${Math.round(days.cdd10)} CDD10`);
h.ok('and say they were measured', days.measured === true);
h.ok(
  'a series that is not 365 slots long is refused rather than summed',
  /364|365/.test(threw(() => degreeDaysOf(new Array(364).fill(10))) ?? ''),
  threw(() => degreeDaysOf(new Array(364).fill(10)))?.slice(0, 80),
);
// And a series that *is* 365 slots with days missing out of it is the absence
// rather than either a throw or a sum (T082). Summed anyway, 92 summer days come
// out as an extraordinarily mild year beside a published annual figure.
const partDays = degreeDaysOf(partCarried);
h.ok(
  'a part year lands as a stated absence, not a mild climate',
  partDays.hdd18 === null && partDays.cdd10 === null && /92 of the 365 days/.test(partDays.reason ?? ''),
  partDays.reason,
);
h.ok('a counted pair carries no reason beside it', days.reason === null);
h.notRun(
  'the measured degree days against the index’s published HDD18 / CDD10',
  'the fixture’s temperatures were tuned to land near the published pair, so agreement here is tuning agreeing with itself, not a measurement',
);

/* ── gate 4: the fingerprint ──────────────────────────────────────────── */

const crlf = await fingerprint(bytes(epwCrlf()));
const lf = await fingerprint(bytes(epwLf()));
const notrail = await fingerprint(bytes(epwNoTrailingNewline()));
h.ok('CRLF and LF fingerprint the same', crlf === lf, `${crlf} / ${lf}`);
h.ok('a trailing newline does not move it', crlf === notrail, `${crlf} / ${notrail}`);
h.ok('every fingerprint is in the grammar the link admits', /^[A-Za-z0-9_-]{16}$/.test(crlf), crlf);

const year1 = epwWholeYear();
const changed = year1.replace('21.0', '21.1');
h.ok('one changed value moves it', (await fingerprint(bytes(changed))) !== crlf);
h.ok('a different station is a different file', (await fingerprint(bytes(epwWholeYear(STATIONS.denver)))) !== crlf);
h.notRun(
  'the same bytes fingerprinted in the browser and under Node',
  'the Node half is what this file is; the browser half is a page-driven gate',
);

h.done();
