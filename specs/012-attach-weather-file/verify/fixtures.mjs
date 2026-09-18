/**
 * The weather files this feature's gates are run over — **every one of them
 * synthetic**, generated here rather than downloaded or bought.
 *
 * T004 asked for real files: a TMYx EPW saved from the station picker and a
 * licensed CIBSE DSY1. Neither can be had in this environment. The agent
 * network proxy refuses `climate.onebuilding.org` — a CONNECT to it comes back
 * 403 — and CIBSE's design summer years are purchased, not fetched. So the
 * fixtures below are built: real station metadata off the staged TMYx index,
 * wrapped around a dry-bulb series that is a seasonal sinusoid, a diurnal
 * sinusoid and seeded noise. They are structurally a weather file and
 * physically a plausible one. They are not a measurement of any climate, and
 * `README.md` lists the gates that therefore cannot be answered here. A gate
 * that could not be run is recorded as not run; it is never recorded as passed.
 *
 * Nothing is checked in. A year of EPW is about 1.5 MB, and `.gitignore` now
 * ignores a `fixtures/` directory under any feature's verify folder for a
 * harness that writes one out — but the intended use is a string in memory:
 * `dailyMeans`, `readLocation`, `fingerprint` and the engine all take one.
 *
 * **Every builder is deterministic to the byte.** The noise is a hash of the
 * date, the hour and which field is being written, never a running generator
 * state, so two calls a week apart produce identical text — which the
 * fingerprint gate needs outright — and so a day reads the same in every
 * fixture that carries it. The June of `epwPartYear()` is the June of
 * `epwWholeYear()`, character for character, which is what lets a harness
 * compare a part year against a whole one and attribute the difference to the
 * period rather than to the weather.
 */

import { IdfDocument, writeIdf } from '@idfkit/core';
import { DAYS_IN_MONTH } from '../../../src/controls.js';

const CRLF = '\r\n';
const LF = '\n';

/**
 * A station, and the shape of the year the generator wraps around it.
 *
 * The first block is real: it is the row this station has in the TMYx index
 * staged at `public/weather/stations.json.gz`, copied field for field, and
 * `assertStationsMatchIndex()` below re-reads that file and says so if either
 * ever drifts. The second block is invented — the mean, the swings, the
 * cloudiness — because no measured series is available to take them from. The
 * two are kept apart in the declaration for the same reason the sheet keeps
 * measured and assumed apart: a reader has to be able to see which is which.
 */
class Station {
  constructor({ id, city, region, country, wmo, latitude, longitude, timeZone, elevation, ashraeZone, publishedHdd18, publishedCdd10, indexUrl, meanC, seasonalSwingK, warmestDay, diurnalSwingK, noiseK, cloudiness }) {
    Object.assign(this, {
      id, city, region, country, wmo, latitude, longitude, timeZone, elevation,
      ashraeZone, publishedHdd18, publishedCdd10, indexUrl,
      meanC, seasonalSwingK, warmestDay, diurnalSwingK, noiseK, cloudiness,
    });
    Object.freeze(this);
  }

  /** Station pressure at the station's elevation, ISA. Pa, as the EPW wants. */
  get pressure() {
    return Math.round(101325 * (1 - 2.25577e-5 * this.elevation) ** 5.25588);
  }
}

/**
 * The two stations the fixtures are built on: a British one, because the
 * feature exists for a UK engineer holding a DSY, and a US one, because Denver
 * is the climate the desk ships sized against and the one every earlier
 * harness in this repository is calibrated to.
 *
 * Both rows are from the `TMYx.2009-2023` entry of the staged index, which is
 * the vintage the picker offers by default.
 */
export const STATIONS = Object.freeze({
  london: new Station({
    id: 'london',
    // From the index, unaltered.
    city: 'London-Luton.AP',
    region: 'ENG',
    country: 'GBR',
    wmo: '036733',
    latitude: 51.875,
    longitude: -0.368,
    timeZone: 0,
    elevation: 160,
    ashraeZone: '4A - Mixed - Humid',
    publishedHdd18: 2801,
    publishedCdd10: 923,
    indexUrl:
      'https://climate.onebuilding.org/WMO_Region_6_Europe/GBR_United_Kingdom/ENG_England/GBR_ENG_London-Luton.AP.036733_TMYx.2009-2023.zip',
    // Invented. The mean and the seasonal swing were chosen so the generated
    // year's degree days land near the published pair above — 2,812 against
    // 2,801 and 925 against 923 — which makes the fixture plausible and
    // proves nothing whatever about London: it is agreement between a
    // constant that was tuned and the figure it was tuned to. Quickstart
    // gate 3's real comparison needs a real file.
    meanC: 10.3,
    seasonalSwingK: 7.5,
    warmestDay: 205,
    diurnalSwingK: 7.2,
    noiseK: 1.6,
    cloudiness: 6,
  }),
  denver: new Station({
    id: 'denver',
    // From the index, unaltered.
    city: 'Denver.Intl.AP',
    region: 'CO',
    country: 'USA',
    wmo: '725650',
    latitude: 39.833,
    longitude: -104.658,
    timeZone: -7,
    elevation: 1650,
    ashraeZone: '5B - Cool - Dry',
    publishedHdd18: 3062,
    publishedCdd10: 1761,
    indexUrl:
      'https://climate.onebuilding.org/WMO_Region_4_North_and_Central_America/USA_United_States_of_America/CO_Colorado/USA_CO_Denver.Intl.AP.725650_TMYx.2009-2023.zip',
    // Invented, tuned the same way and to be read the same way: 3,061
    // against 3,062 and 1,753 against 1,761. A continental high-desert
    // shape — near twice England's swings, and mostly clear.
    meanC: 11.0,
    seasonalSwingK: 13.5,
    warmestDay: 200,
    diurnalSwingK: 14.0,
    noiseK: 2.4,
    cloudiness: 3,
  }),
});

/**
 * The LOCATION record's fourth field, on every fixture.
 *
 * A real file names its provenance here — `TMYx.2009-2023` — and the sheet
 * letters it straight through, into the running mean's own description of what
 * the comfort line was built from. So the fixtures say what they are in the one
 * field the page is going to repeat out loud. Nothing built here should ever be
 * mistaken on screen for a file somebody measured.
 */
const SOURCE = 'SYNTHETIC-fixtures.mjs-not-TMYx';

const COMMENT_1 =
  'COMMENTS 1, SYNTHETIC FIXTURE generated by specs/012-attach-weather-file/verify/fixtures.mjs.' +
  ' Station metadata is real (onebuilding TMYx index); every hourly value is computed from a' +
  ' sinusoid and seeded noise and measures no climate.';
const COMMENT_2 =
  'COMMENTS 2, Do not publish, do not compare against a measured year, and do not read any' +
  ' degree day off this file as a property of the place it names.';

/**
 * One deterministic number in [0, 1) from whatever integers describe the field
 * being written.
 *
 * FNV-1a over the arguments, then a final avalanche. Keyed rather than
 * sequential on purpose: a generator advanced record by record would make the
 * June of a part-year file differ from the June of the whole year, and every
 * cross-fixture comparison in the gates would then be measuring the harness.
 */
function noise(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 8) / 0x1000000;
}

/** Which field of a record a noise draw belongs to, so no two share a stream. */
const CHANNEL = { drybulb: 1, dewpoint: 2, wind: 3, direction: 4, cloud: 5 };

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The calendar the fixture is written on. The lengths come off the declaration
 * in `controls.js` rather than a second list here, for the reason `epw.js`
 * gives for taking them from the same place: two lists of one year is one list
 * too many, and February is the one that would go wrong silently.
 */
const monthLengths = (leap) =>
  leap ? DAYS_IN_MONTH.map((days, month) => (month === 1 ? 29 : days)) : [...DAYS_IN_MONTH];

/** Every `{ month, day, doy }` from one date to another, inclusive. */
function calendar({ from, to, leap }) {
  const lengths = monthLengths(leap);
  const days = [];
  let doy = 0;
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= lengths[month - 1]; day += 1) {
      doy += 1;
      const after = month > from.month || (month === from.month && day >= from.day);
      const before = month < to.month || (month === to.month && day <= to.day);
      if (after && before) days.push({ month, day, doy });
    }
  }
  return days;
}

/**
 * One hourly record's dry bulb, in °C.
 *
 * Seasonal cosine peaking at the station's warmest day, diurnal cosine peaking
 * at 15:00 — which is where a real afternoon maximum sits, not at noon — and a
 * flat noise band on top. The EPW dictionary types this field greater than −70
 * and less than 70, and `dailyMeans` tests exactly those bounds, so nothing
 * here can wander outside them by construction: the widest station swings 12.6
 * seasonally and 14 diurnally about a mean of 10.8.
 */
function drybulb(station, { doy, hourMid, sub }) {
  const seasonal = station.seasonalSwingK * Math.cos((2 * Math.PI * (doy - station.warmestDay)) / 365);
  const diurnal = (station.diurnalSwingK / 2) * Math.cos((2 * Math.PI * (hourMid - 15)) / 24);
  const wobble = (noise(CHANNEL.drybulb, doy, Math.round(hourMid * 4), sub) - 0.5) * 2 * station.noiseK;
  return station.meanC + seasonal + diurnal + wobble;
}

/** Saturation-vapour ratio, Magnus, used only to letter a plausible humidity. */
const magnus = (t) => Math.exp((17.625 * t) / (243.04 + t));

/**
 * The record's 35 fields, comma-joined.
 *
 * Where a field carries something the shoebox or the engine reads — dry bulb,
 * dew point, humidity, pressure, the three solar components, wind, sky cover,
 * horizontal infrared — it is computed. Where it carries something nothing in
 * this repository reads, the field is written as the EPW data dictionary's own
 * missing code rather than as an invented number: a fixture that made up a
 * precipitable-water depth would be claiming a measurement twice over.
 */
function record(station, { year, month, day, doy, hour, minute, perHour, sub }) {
  // EPW hour `h` covers the interval ending at `h`, so the record's own instant
  // is the middle of that interval. It matters for the solar geometry: taking
  // the stamp at face value puts every sunrise half an hour early.
  const span = 1 / perHour;
  const hourMid = hour - 1 + span * sub - span / 2;

  const t = drybulb(station, { doy, hourMid, sub });
  const depression = 2.0 + 4.0 * noise(CHANNEL.dewpoint, doy, hour, sub);
  const dew = t - depression;
  const rh = clamp(Math.round((100 * magnus(dew)) / magnus(t)), 1, 100);

  // Solar position, in local standard time as the file's own time zone
  // declares it: the longitude correction and the equation of time both, so
  // that a fixture for a station 5° off its meridian does not put noon in the
  // wrong place.
  const b = (2 * Math.PI * (doy - 1)) / 365;
  const eot =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(b) - 0.032077 * Math.sin(b) -
      0.014615 * Math.cos(2 * b) - 0.040849 * Math.sin(2 * b));
  const solarHour = hourMid + (4 * (station.longitude - 15 * station.timeZone) + eot) / 60;
  const declination = 23.45 * Math.sin((2 * Math.PI * (284 + doy)) / 365) * RAD;
  const hourAngle = 15 * (solarHour - 12) * RAD;
  const sinAlt =
    Math.sin(station.latitude * RAD) * Math.sin(declination) +
    Math.cos(station.latitude * RAD) * Math.cos(declination) * Math.cos(hourAngle);

  const cover = clamp(
    Math.round(station.cloudiness - 2 + 5 * noise(CHANNEL.cloud, doy, hour, sub)),
    0,
    10,
  );

  const solarConstant = 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365));
  const extraHorizontal = sinAlt > 0 ? Math.round(solarConstant * sinAlt) : 0;
  const global = sinAlt > 0 ? Math.max(0, extraHorizontal * (0.75 - 0.045 * cover)) : 0;
  const diffuse = global * clamp(0.2 + 0.06 * cover, 0, 1);
  const beam = sinAlt > 0.05 ? clamp((global - diffuse) / sinAlt, 0, 1100) : 0;

  // Sky emissivity after Clark and Allen with Walton's cloud correction — the
  // usual pairing, and the reason the field is computed at all: left at its
  // missing code the engine derives its own sky temperature from the opaque
  // cover, and the fixture would be exercising that fallback on every run
  // instead of the path a bought file takes.
  const skyEmissivity =
    clamp(0.787 + 0.764 * Math.log((dew + 273.15) / 273.15), 0.6, 1) *
    (1 + 0.0224 * cover - 0.0035 * cover ** 2 + 0.00028 * cover ** 3);
  const infrared = 5.6697e-8 * skyEmissivity * (t + 273.15) ** 4;

  const windSpeed = clamp(1.0 + 6.0 * noise(CHANNEL.wind, doy, hour, sub), 0, 25);
  const windDirection = Math.round(noise(CHANNEL.direction, doy, hour, sub) * 35) * 10;

  return [
    year,
    month,
    day,
    hour,
    minute,
    // Every element marked `*`, the dictionary's flag for a modelled value.
    // There is no honest alternative: nothing in this file was observed.
    '*9'.repeat(24),
    t.toFixed(1),
    dew.toFixed(1),
    rh,
    station.pressure,
    extraHorizontal,
    Math.round(solarConstant),
    infrared.toFixed(1),
    Math.round(global),
    Math.round(beam),
    Math.round(diffuse),
    Math.round(global * 110),
    Math.round(beam * 100),
    Math.round(diffuse * 120),
    Math.round(diffuse * 12),
    windDirection,
    windSpeed.toFixed(1),
    cover,
    cover,
    '20.0',
    77777, // unlimited ceiling, the convention the observations use
    9, // present weather observation: missing
    999999999, // present weather codes: missing
    999, // precipitable water
    '0.999', // aerosol optical depth
    999, // snow depth
    99, // days since last snowfall
    999, // albedo
    999, // liquid precipitation depth
    99, // liquid precipitation quantity
  ].join(',');
}

/** The eight header records, in the order an EPW declares them. */
function header({ periods, perHour, from, to, startDay, calendarRecord, location }) {
  const stamp = (date) => `${date.month}/${String(date.day).padStart(2, ' ')}`;
  const spans = periods === 1
    ? `Data,${startDay},${stamp(from)},${stamp(to)}`
    // A file declaring more than one period, which `dailyMeans` refuses whole:
    // there is no unbroken year behind it to take a mean series off.
    : `Data,${startDay},${stamp(from)},6/30,Data,${startDay},7/ 1,${stamp(to)}`;
  return [
    location,
    'DESIGN CONDITIONS,0',
    'TYPICAL/EXTREME PERIODS,0',
    'GROUND TEMPERATURES,0',
    calendarRecord,
    COMMENT_1,
    COMMENT_2,
    `DATA PERIODS,${periods},${perHour},${spans}`,
  ].filter((line) => line !== '');
}

/** The LOCATION record as a real station writes it. */
function locationRecord(station) {
  return [
    'LOCATION',
    station.city,
    station.region,
    station.country,
    SOURCE,
    station.wmo,
    station.latitude.toFixed(3),
    station.longitude.toFixed(3),
    station.timeZone.toFixed(1),
    station.elevation.toFixed(1),
  ].join(',');
}

/** `HOLIDAYS/DAYLIGHT SAVINGS` as every TMYx writes it: nothing declared. */
const NO_CALENDAR = 'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0';

/**
 * The one generator. Every exported builder below is this function with its
 * arguments named, so that a variant is a difference a reader can see rather
 * than a second copy of the file format.
 */
export function epw({
  station = STATIONS.london,
  year = 2015,
  from = { month: 1, day: 1 },
  to = { month: 12, day: 31 },
  perHour = 1,
  leap = false,
  periods = 1,
  startDay = 'Sunday',
  eol = CRLF,
  trailingNewline = true,
  calendarRecord = NO_CALENDAR,
  location = null,
  omit = null,
} = {}) {
  const lines = header({
    periods,
    perHour,
    from,
    to,
    startDay,
    calendarRecord,
    location: location === null ? locationRecord(station) : location,
  });

  for (const { month, day, doy } of calendar({ from, to, leap })) {
    for (let hour = 1; hour <= 24; hour += 1) {
      for (let sub = 1; sub <= perHour; sub += 1) {
        if (omit && omit.month === month && omit.day === day && omit.hour === hour && sub === 1) continue;
        const minute = Math.round((60 / perHour) * sub);
        lines.push(record(station, { year, month, day, doy, hour, minute, perHour, sub }));
      }
    }
  }

  return lines.join(eol) + (trailingNewline ? eol : '');
}

// ---------------------------------------------------------------------------
// The variants. One export each, so a harness names the file it is asserting
// over rather than passing a bag of options at the call site.
// ---------------------------------------------------------------------------

/** 8,760 records, CRLF, trailing newline: the shape a bought file arrives in. */
export const epwWholeYear = (station = STATIONS.london) => epw({ station });

/** The same year, CRLF — the fingerprint's left-hand side. */
export const epwCrlf = (station = STATIONS.london) => epw({ station, eol: CRLF });

/** The same year, LF. Byte-different, and the fingerprint must not care. */
export const epwLf = (station = STATIONS.london) => epw({ station, eol: LF });

/** The same year, ending in a newline. */
export const epwTrailingNewline = (station = STATIONS.london) =>
  epw({ station, trailingNewline: true });

/** The same year, not ending in one. Again the fingerprint must not care. */
export const epwNoTrailingNewline = (station = STATIONS.london) =>
  epw({ station, trailingNewline: false });

/**
 * 8,784 records carrying 29 February. `dailyMeans` refuses it by that day
 * rather than by arriving at 366, which is the sentence the attach gate shows.
 */
export const epwLeapYear = (station = STATIONS.london) =>
  epw({ station, year: 2016, leap: true, startDay: 'Friday' });

/** Two data periods declared, which is not one unbroken year. */
export const epwTwoDataPeriods = (station = STATIONS.london) => epw({ station, periods: 2 });

/**
 * A whole year with the 13:00 record of 15 April deleted.
 *
 * Mid-April on purpose: it is inside the seed week of TM52 equation 2.3, so a
 * reader who lost this day silently would lose the comfort line's whole season
 * with it.
 */
export const epwMissingAprilRecord = (station = STATIONS.london) =>
  epw({ station, omit: { month: 4, day: 15, hour: 13 } });

/** 1 June to 31 August — a part year, which `periodCovered` must read as one. */
export const epwPartYear = (station = STATIONS.london) =>
  epw({ station, from: { month: 6, day: 1 }, to: { month: 8, day: 31 }, startDay: 'Monday' });

/**
 * Four records an hour, for the first week of January only.
 *
 * Short deliberately: a sub-hourly year is 35,040 records and about 6 MB, and
 * nothing it would prove is not proved by seven days. `periodCovered` reads the
 * records-per-hour off the header and the extent off the timestamps, and both
 * are exercised here.
 *
 * `dailyMeansCarried` reads its seven days and leaves the other 358 null, so the
 * attach gate admits this file; `dailyMeans` refuses it for being seven days and
 * not a year, which is the sentence the comfort line needs. Neither refusal is
 * about the sub-hourly stamp — 96 records a day is a count this reader takes off
 * the header, not a shape it objects to.
 */
export const epwSubHourly = (station = STATIONS.london) =>
  epw({ station, from: { month: 1, day: 1 }, to: { month: 1, day: 7 }, perHour: 4 });

/** No LOCATION record at all. Every field of the reading comes back null. */
export const epwNoLocation = (station = STATIONS.london) => epw({ station, location: '' });

/**
 * A LOCATION record whose fields are empty or a bare hyphen.
 *
 * Both spellings in one file, because onebuilding uses the hyphen where a
 * station has nothing to publish and other sources simply leave the field
 * empty, and the reader has to treat the two the same way: absent, not `'-'`.
 */
export const epwBlankLocation = (station = STATIONS.london) =>
  epw({
    station,
    location: `LOCATION,,-,,${SOURCE},-,${station.latitude.toFixed(3)},${station.longitude.toFixed(3)},-,${station.elevation.toFixed(1)}`,
  });

/**
 * A file declaring a daylight-saving rule and two holidays.
 *
 * The dates are the British rule for the year the fixture is stamped. The
 * point is not which days they are but that the record is non-empty at all:
 * every TMYx reads `No,0,0,0,0`, so until a file like this one exists the
 * daylight-saving and holiday readings have nothing but an absence to letter.
 */
export const epwDaylightSaving = (station = STATIONS.london) =>
  epw({
    station,
    calendarRecord:
      "HOLIDAYS/DAYLIGHT SAVINGS,No,3/29,10/25,2,New Year's Day, 1/ 1,Christmas Day,12/25",
  });

/** The same year declaring none of it, as a TMYx does. */
export const epwNoDaylightSaving = (station = STATIONS.london) =>
  epw({ station, calendarRecord: NO_CALENDAR });

// ---------------------------------------------------------------------------
// Design days
// ---------------------------------------------------------------------------

/**
 * A DDY beside the EPW, carrying the pair `designConditionsFrom` looks for.
 *
 * Written through `IdfDocument` and `writeIdf` rather than as a template,
 * because a DDY is positional IDF and its field order belongs to the schema.
 * Hand-spelling it here would be exactly the drift CLAUDE.md warns about, one
 * version away from writing a wetbulb into a pressure.
 *
 * The two dry bulbs are **real**: they are the `heating_design_db_c` and
 * `cooling_design_db_c` the TMYx index publishes for this station. Everything
 * else about the day is invented, like the year beside it.
 */
export function ddyValid(schema, station = STATIONS.london) {
  const doc = new IdfDocument(schema);
  const heating = designHeating(station);
  const cooling = designCooling(station);
  doc.add('Site:Location', `${siteName(station)} Design_Conditions`, {
    latitude: station.latitude,
    longitude: station.longitude,
    time_zone: station.timeZone,
    elevation: station.elevation,
  });
  doc.add('SizingPeriod:DesignDay', `${siteName(station)} SYNTHETIC Ann Htg 99% Condns DB`, heating);
  doc.add('SizingPeriod:DesignDay', `${siteName(station)} SYNTHETIC Ann Clg 1% Condns DB=>MWB`, cooling);
  return ddyHeader(station) + writeIdf(doc);
}

/**
 * The same, for the other station — a DDY that describes somewhere else.
 *
 * It parses perfectly. That is the whole point: the refusal it has to provoke
 * is about the place the file names, not about the file being malformed, and a
 * broken DDY would prove the wrong thing.
 */
export const ddyOtherCity = (schema) => ddyValid(schema, STATIONS.denver);

const siteName = (station) => `${station.city}_${station.region}_${station.country}`;

const ddyHeader = (station) =>
  `! SYNTHETIC design conditions, generated by verify/fixtures.mjs.\n` +
  `! The two dry bulbs are the TMYx index's published figures for ${station.wmo};\n` +
  `! every other field is invented. This is not an ASHRAE design condition.\n\n`;

/** The 99% heating day, shaped like the Denver pair `buildModel` ships with. */
const designHeating = (station) => ({
  month: 1,
  day_of_month: 21,
  day_type: 'WinterDesignDay',
  maximum_dry_bulb_temperature: heatingDb(station),
  daily_dry_bulb_temperature_range: 0.0,
  humidity_condition_type: 'Wetbulb',
  wetbulb_or_dewpoint_at_maximum_dry_bulb: heatingDb(station),
  barometric_pressure: station.pressure,
  wind_speed: 4.7,
  wind_direction: 230,
  rain_indicator: 'No',
  snow_indicator: 'No',
  daylight_saving_time_indicator: 'No',
  solar_model_indicator: 'ASHRAEClearSky',
  sky_clearness: 0.0,
});

/** The 1% cooling day, dry-bulb basis with a coincident wetbulb. */
const designCooling = (station) => ({
  month: 7,
  day_of_month: 21,
  day_type: 'SummerDesignDay',
  maximum_dry_bulb_temperature: coolingDb(station),
  daily_dry_bulb_temperature_range: station.diurnalSwingK,
  humidity_condition_type: 'Wetbulb',
  wetbulb_or_dewpoint_at_maximum_dry_bulb: Number((coolingDb(station) - 7).toFixed(1)),
  barometric_pressure: station.pressure,
  wind_speed: 4.0,
  wind_direction: 240,
  rain_indicator: 'No',
  snow_indicator: 'No',
  daylight_saving_time_indicator: 'No',
  solar_model_indicator: 'ASHRAEClearSky',
  sky_clearness: 1.0,
});

const heatingDb = (station) => (station.id === 'denver' ? -14.2 : -2.2);
const coolingDb = (station) => (station.id === 'denver' ? 33.8 : 25.1);

// ---------------------------------------------------------------------------
// The registry, and the one claim about these files that can be checked
// ---------------------------------------------------------------------------

/**
 * Every fixture, with what it is for. A harness loops this rather than keeping
 * its own list, so a variant added here reaches every gate that walks it.
 */
export const FIXTURES = Object.freeze([
  { id: 'wholeYear', gate: '3, 4, 5', build: epwWholeYear, reads: true, note: 'a whole year, CRLF' },
  { id: 'crlf', gate: '4', build: epwCrlf, reads: true, note: 'the year, CRLF' },
  { id: 'lf', gate: '4', build: epwLf, reads: true, note: 'the same year, LF' },
  { id: 'trailingNewline', gate: '4', build: epwTrailingNewline, reads: true, note: 'ends in a newline' },
  { id: 'noTrailingNewline', gate: '4', build: epwNoTrailingNewline, reads: true, note: 'does not' },
  { id: 'leapYear', gate: '3', build: epwLeapYear, reads: false, note: 'carries 29 February' },
  { id: 'twoDataPeriods', gate: '3', build: epwTwoDataPeriods, reads: false, note: 'declares two periods' },
  { id: 'missingAprilRecord', gate: '3', build: epwMissingAprilRecord, reads: false, note: '13:00 of 15 April deleted' },
  { id: 'partYear', gate: '3, 7', build: epwPartYear, reads: false, note: '1 June to 31 August' },
  { id: 'subHourly', gate: '3', build: epwSubHourly, reads: false, note: 'four records an hour, one week' },
  { id: 'noLocation', gate: '3', build: epwNoLocation, reads: true, note: 'no LOCATION record' },
  { id: 'blankLocation', gate: '3', build: epwBlankLocation, reads: true, note: 'empty fields and bare hyphens' },
  { id: 'daylightSaving', gate: '7', build: epwDaylightSaving, reads: true, note: 'declares a DST rule and two holidays' },
  { id: 'noDaylightSaving', gate: '7', build: epwNoDaylightSaving, reads: true, note: 'declares none' },
]);

/**
 * Re-read the staged station index and confirm the hardcoded rows still match.
 *
 * The metadata above is the one thing in this file that is a claim about the
 * world, so it is the one thing that can go stale. Throws naming the field that
 * moved; returns the rows it checked. Silently skipped where the index is not
 * staged — it is gitignored, and a fresh clone has none of it.
 */
export async function assertStationsMatchIndex() {
  const { gunzipSync } = await import('node:zlib');
  const fs = await import('node:fs');
  const url = new URL('../../../public/weather/stations.json.gz', import.meta.url);
  if (!fs.existsSync(url)) return null;

  const rows = JSON.parse(gunzipSync(fs.readFileSync(url)).toString()).stations;
  const checked = [];
  for (const station of Object.values(STATIONS)) {
    const row = rows.find((r) => r.url === station.indexUrl);
    if (!row) throw new Error(`the index no longer carries ${station.indexUrl}`);
    for (const [field, mine] of Object.entries({
      city: station.city,
      state: station.region,
      country: station.country,
      wmo: station.wmo,
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timeZone,
      elevation: station.elevation,
      ashrae_climate_zone: station.ashraeZone,
      hdd18: station.publishedHdd18,
      cdd10: station.publishedCdd10,
    })) {
      if (row[field] !== mine) {
        throw new Error(
          `STATIONS.${station.id} says ${field} is ${JSON.stringify(mine)}, the index says ${JSON.stringify(row[field])}`,
        );
      }
    }
    checked.push(row);
  }
  return checked;
}
