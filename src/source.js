/**
 * What the desk is solving against, as one typed thing.
 *
 * A picked station and a file the reader attached are the same question asked
 * twice — *what weather is this?* — and before this module the sheet answered it
 * by reading `station.url`, `station.wmo`, `station.state`,
 * `station.ashraeClimateZone` and `station.hdd18` directly at a dozen call
 * sites. A file has a city and a country and no ASHRAE zone at all, so handing
 * those call sites a file-shaped station would letter an absence as a value,
 * which is the one thing the sheet must never do (research R2). So both become a
 * `WeatherSource`, every field declared, and a field nobody published is `null`
 * rather than `undefined`.
 *
 * **DOM-free and network-free, reading no global but `crypto.subtle`**, and that
 * is a stated guarantee of the contract rather than a happy accident: the Node
 * harnesses in `specs/012-attach-weather-file/verify/` fingerprint and gate the
 * same file the browser does and must get the same string out. It is also why
 * `weather.js` is not imported here for the two or three lines that would be
 * convenient — that module resolves its station index against
 * `import.meta.env.BASE_URL`, which is a `TypeError` the moment Node evaluates
 * it, so nothing under `weather.js` can be reached from a harness.
 */
import { assertCarriesItsPeriod, dailyMeansCarried, periodCovered, readLocation } from './epw.js';
import { designConditionsFrom } from './model.js';

/* ── where the building is ────────────────────────────────────────────── */

/**
 * What the sheet letters about the site, from whichever source is attached.
 *
 * The eight fields are the EPW `LOCATION` record's, because that is the only
 * description a file gives of itself and a station's index row carries the same
 * facts under other names. `region` is the state or province alone and not
 * `siteRegion`'s `MA, USA` — `rates.js` keys North America by state and Europe
 * by country, so the two have to stay apart or the tariff lookup is handed a
 * string that matches neither key (research R10).
 *
 * **Every field must be passed, and `null` is a legitimate value for any of
 * them**, which is `WeatherFile`'s rule in `tm59.js` and is here for the same
 * reason: a file that publishes no WMO number and a caller that never looked for
 * one are different states, and a constructor accepting a partial object would
 * collapse them into one. The sheet would then letter "declares nothing" over a
 * field it simply failed to read. So the presence of the key is checked and its
 * value is not.
 *
 * The types are checked, though, and that is not the same thing as checking for
 * a value. Latitude, longitude, time zone and elevation reach `Site:Location`,
 * where a string that looks like a number is not a number; catching that at the
 * boundary names the field, and catching it in the IDF names a line.
 */
export class Place {
  constructor(declared) {
    for (const field of ['city', 'region', 'country', 'wmo']) {
      if (!(field in declared)) {
        throw new Error(
          `Place: no ${field} was passed. A field the source leaves empty is passed as null — ` +
            '"the file says nothing here" and "nobody read it" must not be the same state',
        );
      }
      const value = declared[field];
      if (value !== null && typeof value !== 'string') {
        throw new Error(
          `Place: ${field} arrived as ${typeof value}, and it is lettered as written — ` +
            'a WMO number keeps its leading zeros only while it is a string',
        );
      }
      this[field] = value;
    }
    // These four are the ones `Site:Location` is written from, so they are the
    // ones a wrong type reaches EnergyPlus through.
    for (const field of ['latitude', 'longitude', 'timeZone', 'elevation']) {
      if (!(field in declared)) {
        throw new Error(
          `Place: no ${field} was passed. A field the source leaves empty is passed as null — ` +
            '"the file says nothing here" and "nobody read it" must not be the same state',
        );
      }
      const value = declared[field];
      if (value !== null && !Number.isFinite(value)) {
        throw new Error(
          `Place: ${field} arrived as ${JSON.stringify(value)}, which is not a number and not null. ` +
            'It is written into Site:Location, where it has to be one',
        );
      }
      this[field] = value;
    }
    Object.freeze(this);
  }
}

/* ── degree days ──────────────────────────────────────────────────────── */

/**
 * Heating and cooling degree days, and where the pair came from.
 *
 * `measured` is the whole reason this is a type rather than two numbers. An
 * index station's HDD18 is published by onebuilding and a file's is computed
 * here out of its own 8,760 records, and lettering the two identically would be
 * a claim this page cannot check — it has never seen the method behind the
 * published figure and cannot say the two agree. So the provenance travels with
 * the figures and the reading says which it is holding (research R11).
 *
 * The bases stay Celsius in both unit systems, for the argument `degreeDays()`
 * in `weather.js` makes at the point the figure is lettered: HDD18 is a
 * statistic *computed on* an 18 °C base, converting the count while the label
 * still read 18 would be arithmetic nobody can check, and relabelling it HDD65
 * would claim a statistic this page did not compute.
 */
export class DegreeDays {
  constructor(declared) {
    for (const field of ['hdd18', 'cdd10']) {
      if (!(field in declared)) {
        throw new Error(
          `DegreeDays: no ${field} was passed. A source that publishes none passes null — ` +
            'a missing count and a count of zero are different climates',
        );
      }
      const value = declared[field];
      if (value !== null && !Number.isFinite(value)) {
        throw new Error(`DegreeDays: ${field} arrived as ${JSON.stringify(value)}, which is not a count and not null`);
      }
      this[field] = value;
    }
    if (typeof declared.measured !== 'boolean') {
      throw new Error(
        'DegreeDays: measured must be true or false. It is the difference between a figure this page ' +
          'computed from the attached file and one it is repeating from the station index, and there is ' +
          'no third state',
      );
    }
    this.measured = declared.measured;
    // Why there is no count, in the words of whatever could not take one. A
    // source with both counts absent and nothing to say about it is the em dash
    // with no reason beside it that Principle IV exists to forbid, and this is
    // the field that carries the sentence to the reading rather than leaving the
    // figure to vanish out of the sub-line.
    if (!('reason' in declared)) {
      throw new Error(
        'DegreeDays: no reason was passed. A pair that was counted passes null; a pair that could not be ' +
          'counted passes the sentence saying why, because a figure that is simply absent from the line is ' +
          'indistinguishable from one nobody asked for',
      );
    }
    if (declared.reason !== null && typeof declared.reason !== 'string') {
      throw new Error(`DegreeDays: reason arrived as ${typeof declared.reason}, and it is lettered as written`);
    }
    if (declared.reason !== null && (this.hdd18 !== null || this.cdd10 !== null)) {
      throw new Error(
        'DegreeDays: a reason was passed beside a count. The reading would then letter a figure and a ' +
          'sentence saying there is none, and a reader cannot be told both',
      );
    }
    this.reason = declared.reason;
    Object.freeze(this);
  }
}

/**
 * The degree days of an attached file, out of the 365 daily means it carries.
 *
 * `HDD18 = Σ max(0, 18 − mean)` and `CDD10 = Σ max(0, mean − 10)`, which is the
 * definition on those bases and nothing more. It costs two additions a day on
 * top of a series `dailyMeans` has already produced and the comfort line has
 * already paid 3.2 ms for, so the figure is free and every one of its inputs is
 * traceable to an hour in the reader's own file.
 *
 * **A year, or no counts and the sentence saying why.** Both are published
 * annual totals — `HDD18` is the heating degree days *of a year* and the station
 * index's figure it stands beside is one — so a file cut to the overheating
 * season has no such total to offer and this returns the absence rather than a
 * sum over 153 days. Summed anyway it would read as an extraordinarily mild
 * climate: the 212 uncounted days contribute nothing, the figure comes out low
 * and plausible, and it would sit in the sub-line beside a published one taken
 * over a whole year as though the two were comparable.
 *
 * It is an absence and not a throw because a part-year file is a file this desk
 * admits (the attach gate reads what it carries), and the one reading it cannot
 * support must not take the file down with it. A `null` in the series is a day
 * the file does not carry; anything else non-finite is a broken reading and is
 * still refused by its day, because that is a fault rather than an extent.
 */
export function degreeDaysOf(means) {
  if (!Array.isArray(means)) {
    throw new Error(
      `degreeDaysOf was handed ${means === null ? 'null' : typeof means}, not the 365 daily means dailyMeansCarried returns`,
    );
  }
  if (means.length !== 365) {
    throw new Error(
      `degreeDaysOf was handed ${means.length} daily means, not the 365 slots of a year. ` +
        'A day the file does not carry is a null in its own place, never a shorter array',
    );
  }
  let hdd18 = 0;
  let cdd10 = 0;
  let carried = 0;
  for (let day = 0; day < 365; day += 1) {
    const mean = means[day];
    if (mean === null) continue;
    if (!Number.isFinite(mean)) {
      throw new Error(
        `day ${day + 1} of the daily means reads ${JSON.stringify(mean)}, which is not a temperature`,
      );
    }
    carried += 1;
    if (mean < 18) hdd18 += 18 - mean;
    if (mean > 10) cdd10 += mean - 10;
  }
  if (carried !== 365) {
    return new DegreeDays({
      hdd18: null,
      cdd10: null,
      measured: true,
      reason: `this file carries ${carried} of the 365 days, and a degree-day total is a year's`,
    });
  }
  return new DegreeDays({ hdd18, cdd10, measured: true, reason: null });
}

/* ── the source ───────────────────────────────────────────────────────── */

const KINDS = ['station', 'file'];

/**
 * The one answer to "what is this desk solving against". Exactly one exists at a
 * time, or none.
 *
 * Frozen, built only by the two functions below, and never partially built: the
 * gate runs first, so a `WeatherSource` that exists is one the desk can solve
 * (research R12). Every field is passed for `Place`'s reason, and the three
 * invariants below are the ones that would otherwise be discovered as a wrong
 * reading rather than as a refusal.
 *
 * `climateZone` is `null` for a file rather than `'—'`. The em dash is
 * lettering, and lettering belongs to the reading; a model holding an em dash
 * cannot be asked whether it knows the zone. For a station it is the index's
 * label exactly as the index writes it — `5A - Cool - Humid`, not `5A` — because
 * splitting the code out of the label is `climateZone()`'s job in `weather.js`
 * and a second copy of that grammar here is precisely the drift that would have
 * the chip and the sub-line disagreeing about the same station.
 *
 * `period` is `periodCovered`'s answer over this source's own EPW, carried here
 * rather than re-read at the point of lettering. It is not a cache of a cheap
 * thing: reading it splits the whole 1.6 MB file, and the site sub-line that
 * letters it is redrawn on every unit switch. Carried on the source it is read
 * once, at the attach, which is also the one moment it can have changed.
 *
 * There is deliberately no `token`. What the link carries is built where the
 * link is built: `stationToken()` reads `flavorWindow()`, which lives under
 * `weather.js` and cannot be imported from Node, and this module's
 * Node-callability is a guarantee worth more than one field.
 */
export class WeatherSource {
  constructor(declared) {
    const fields = [
      'kind',
      'epw',
      'ddy',
      'place',
      'declares',
      'label',
      'fingerprint',
      'climateZone',
      'degreeDays',
      'period',
      'stem',
    ];
    for (const field of fields) {
      if (!(field in declared)) {
        throw new Error(
          `WeatherSource: no ${field} was passed. A source that has nothing to say here passes null — ` +
            '"this source declares none" and "nobody built this field" must not be the same state',
        );
      }
      this[field] = declared[field];
    }

    if (!KINDS.includes(this.kind)) {
      throw new Error(
        `WeatherSource: kind is ${JSON.stringify(this.kind)}, and a desk solves against a picked station ` +
          `or an attached file — ${KINDS.join(' or ')}, and nothing else`,
      );
    }
    // The fingerprint is what a `wf` link is matched against, and a link that
    // names a file the recipient cannot be shown to be holding is worse than a
    // link with no file in it at all. So the two kinds are held to opposite
    // rules rather than to one permissive one.
    if (this.kind === 'file' && this.fingerprint === null) {
      throw new Error(
        'WeatherSource: an attached file was built with no fingerprint. The fingerprint is the only thing ' +
          'a `wf` link can be matched against, so a file source without one can be shared and never reproduced',
      );
    }
    if (this.kind === 'station' && this.fingerprint !== null) {
      throw new Error(
        `WeatherSource: a station was built carrying the fingerprint ${JSON.stringify(this.fingerprint)}. ` +
          'A station is named in the link by its WMO number and its window, and a second identity for the ' +
          'same source is one the two paths can disagree about',
      );
    }
    Object.freeze(this);
  }
}

/* ── the fingerprint ──────────────────────────────────────────────────── */

const LF = 0x0a;
const CR = 0x0d;

/** Base64url's alphabet, which is `A–Z a–z 0–9 - _` — `+` and `/` already
 * spelled as `-` and `_`, and no padding written, so there is no `=` to strip.
 * Every one of those characters survives `URLSearchParams` unescaped, which
 * CLAUDE.md names as the constraint the whole link grammar lives under. */
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The 16 characters that say two readers are holding the same weather file.
 *
 * One rule, and it is statable in a sentence: **the fingerprint is over the
 * file's records, not over how its lines end.** What EnergyPlus reads is the
 * records; a purchased file copied between Windows and macOS, or opened and
 * saved once by a text editor, changes its line terminators and not one value
 * the engine ever sees. Refusing a colleague's identical data on that basis
 * would be a false refusal, which is worse than no check at all because it
 * teaches the reader to distrust the check. So CRLF and a lone CR become LF and
 * trailing newlines are dropped, and **nothing else is normalised** — not
 * whitespace inside a field, not field order, not a header record, because any
 * of those can change a result (research R5).
 *
 * Normalising happens on the bytes, before any text decoding, and that is not a
 * micro-optimisation: a file whose city name is Latin-1 rather than UTF-8 must
 * fingerprint identically for two readers whatever their browser makes of the
 * name on screen, and it only does so if the decoder never runs. The scan is
 * safe over any ASCII-compatible encoding because 0x0D and 0x0A cannot appear
 * inside a UTF-8 multi-byte sequence, whose trailing bytes are all ≥ 0x80.
 *
 * **Measured**: SHA-256 over a 1.66 MiB EPW is 4.75 ms, median of 25 passes
 * under Node 22 (research R5), re-measured here at 4.57 ms. The byte pass in
 * front of it costs about half as much again — 7.5 ms for the scan and the rest
 * for the buffer it fills — so the whole call is about 20 ms on a file that
 * size. Which is a lot next to the 50 ms a warm design day solves in, and
 * completely irrelevant: it is paid once, at the moment the reader picks a file
 * out of a dialog, and never again. Nothing on the solve path calls this.
 *
 * Sixteen characters is 96 bits, far past any collision a human-scale set of
 * weather files could produce, and short enough to sit in a link beside
 * everything else the sheet already encodes.
 */
export async function fingerprint(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(
      `fingerprint was handed ${bytes === null ? 'null' : typeof bytes}, not the Uint8Array the file was read as. ` +
        'The digest is taken before any decoding, so there is no text form of the file to take it over instead',
    );
  }

  const out = new Uint8Array(bytes.length);
  let length = 0;
  for (let at = 0; at < bytes.length; at += 1) {
    const byte = bytes[at];
    if (byte === CR) {
      // A CRLF pair and a lone CR both become one LF. Old Mac files are the
      // lone-CR case and they are rare, but a file that reads as one enormous
      // line to a text editor still reads as 8,760 records to EnergyPlus.
      out[length] = LF;
      length += 1;
      if (bytes[at + 1] === LF) at += 1;
      continue;
    }
    out[length] = byte;
    length += 1;
  }
  while (length > 0 && out[length - 1] === LF) length -= 1;

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', out.subarray(0, length)));

  // Truncating the encoded digest to 16 characters and encoding its first 12
  // bytes are the same string — base64 runs in groups of three bytes and
  // 12 = 4 × 3 — so the loop simply stops, and no padding is ever written.
  let text = '';
  for (let at = 0; text.length < 16; at += 3) {
    const a = digest[at];
    const b = digest[at + 1];
    const c = digest[at + 2];
    text += BASE64URL[a >> 2];
    text += BASE64URL[((a & 0b11) << 4) | (b >> 4)];
    text += BASE64URL[((b & 0b1111) << 2) | (c >> 6)];
    text += BASE64URL[c & 0b111111];
  }
  return text.slice(0, 16);
}

/* ── building one ─────────────────────────────────────────────────────── */

/**
 * A picked station, typed. The same data the sheet has always read off
 * `station.*`, in the shape a file can also fill.
 *
 * `place` comes off the index row rather than out of the archive, because that
 * is what the picker has already lettered by the time this is called and what
 * the tariffs have always been keyed on. The station path keeps writing
 * `Site:Location` from the DDY's own parsed object, as it does today, so
 * nothing here reaches the model — this is the description, not the input.
 *
 * `label` is the flavour the reader chose, `2007–2021`, and it is passed in
 * rather than derived: the picker groups a site's five archives and knows which
 * row was clicked, and re-deriving it here from the URL would be a second copy
 * of onebuilding's archive-name grammar, which `weather.js` keeps exactly one of.
 */
export function sourceFromStation(station, files, label) {
  if (!station?.url) {
    throw new Error(
      'sourceFromStation was handed a station with no archive URL. The stock seed carries a tariff region ' +
        'and no archive, and it is not something the desk can solve against',
    );
  }
  if (typeof files?.epw !== 'string') {
    throw new Error("sourceFromStation was handed no EPW text. The archive's EPW is what the engine is run on");
  }

  // `Boston-Logan.Intl.AP` is a filename; `Boston-Logan Intl AP` is a place.
  // The one line `siteName()` is, repeated here and nowhere else, because
  // `weather.js` cannot be imported from Node and this module's harness has to
  // build the same `Place` the browser does. If the two ever disagree,
  // `siteName()` is the copy that wins — it is the one the picker letters from.
  const city = station.city ? station.city.replace(/\./g, ' ').trim() : null;

  return new WeatherSource({
    kind: 'station',
    epw: files.epw,
    ddy: files.ddy ?? null,
    place: new Place({
      city: city || null,
      // The index writes an empty string where a country has no states to
      // name, and an empty string is not a region — it is the absence of one.
      region: station.state || null,
      country: station.country || null,
      wmo: station.wmo || null,
      latitude: Number.isFinite(station.latitude) ? station.latitude : null,
      longitude: Number.isFinite(station.longitude) ? station.longitude : null,
      timeZone: Number.isFinite(station.timezone) ? station.timezone : null,
      elevation: Number.isFinite(station.elevation) ? station.elevation : null,
    }),
    declares: declarationOf(files.epw),
    label,
    fingerprint: null,
    climateZone: station.ashraeClimateZone || null,
    // Published, not measured, and the reading has to be able to say so. The
    // index carries these as numbers and a station missing one carries
    // something that is not a number, which is the absence `degreeDays()`
    // already drops from its sub-line rather than printing as a zero.
    degreeDays: new DegreeDays({
      hdd18: Number.isFinite(station.hdd18) ? station.hdd18 : null,
      cdd10: Number.isFinite(station.cdd10) ? station.cdd10 : null,
      measured: false,
      // No sentence: an index row with no HDD18 is a row onebuilding did not
      // publish one in, which the sub-line already letters by leaving the figure
      // out. The reason field is for a count this page tried to take and could
      // not, and a station's counts are not this page's to take.
      reason: null,
    }),
    // Off the archive's own EPW, the same reader the file path uses. An archive
    // truncated in the proxy is the case it catches, and it is the same fact
    // about a station's year as about a reader's file.
    period: periodCovered(files.epw),
    // What `main.js` has always taken the bundle's weather member name from.
    stem: station.url.split('/').pop().replace(/\.zip$/i, ''),
  });
}

/**
 * The size above which this is not a weather file.
 *
 * 32 MiB. The ceiling has to clear the largest thing that genuinely is one: a
 * sub-hourly file passes the gate and should, because `dailyMeans` reads
 * `records per hour` off the `DATA PERIODS` record and counts against it, and
 * the engine reads it the same way. At the 198.8 bytes a record measured over
 * the 1,741,631-byte, 8,760-record file in research R5, a whole year fits under
 * 32 MiB at up to nineteen records an hour — so every hourly, half-hourly,
 * 15-minute, 10-minute and 5-minute file is admitted with room to spare.
 *
 * What it excludes is deliberate: a one-minute file is about 100 MiB, and by the
 * time it has been decoded to a UTF-16 string and split into 525,600 line
 * strings it is most of a gigabyte of a tab that is meant to stay interactive
 * during a drag. Nobody assesses a building against one. The refusal names the
 * size found and this ceiling, so a reader who really is holding such a file
 * learns the number rather than being told the file is broken.
 */
const SIZE_CEILING = 32 * 1024 * 1024;

/** How far in to look for the NUL byte that says this is not text at all. */
const TEXT_PROBE = 4096;

/**
 * A file the reader attached, gated and typed, or a rejection in the sentence
 * whichever parser wrote it.
 *
 * The gate is the parser that already exists (research R12).
 * `dailyMeansCarried` refuses, by name and with the day or record named, exactly
 * the files this desk cannot run — more than one data period, a leap year, a
 * record too short to reach its dry bulb, a date that is not a date, a dry bulb
 * outside the EPW dictionary's bounds, a day missing *some* of its records — and
 * writing a second validator here would be a second opinion about what a valid
 * file is, which would disagree with the first the day either changed. So its
 * throw is the refusal, unwrapped: wrapping it would lose the record number or
 * the day, which is the only part of the sentence the reader can act on.
 *
 * **A file covering less than a year is admitted**, and that is the one thing the
 * gate deliberately does not refuse. `dailyMeans`'s whole-year contract belongs
 * to the comfort line, which recurses from 23 April and genuinely cannot work
 * without one; the desk can letter a title block, run a summer and read a
 * criterion over a seasonal DSY, and refusing the file would take all of that
 * with it to protect the annual bill. So the extent comes off `periodCovered`,
 * the days come off `dailyMeansCarried`, and `assertCarriesItsPeriod` refuses a
 * day missing from inside the stretch the file itself claims — an extent is a
 * fact about a file and a hole is a fault in one.
 *
 * `readLocation` runs first and is **not** part of the gate. A file with no
 * LOCATION record declares nothing about itself, and that is a statement the
 * file is entitled to make — `WeatherFile.declares` letters it in those words.
 *
 * The DDY is checked last and only if one came with the file, through the same
 * `designConditionsFrom` the picker puts an archive's DDY through, so the two
 * paths refuse an unusable DDY in one sentence rather than two. Its result is
 * thrown away here on purpose: the source carries the DDY *text*, per the data
 * model, and `attachClimate` parses it once more where it writes the design
 * days. One extra parse at attach buys a source whose fields are all things the
 * file itself carries.
 */
export async function sourceFromFile({ name, bytes, ddyText = null, schema = null }) {
  if (typeof name !== 'string' || !name) {
    throw new Error('sourceFromFile was handed no file name, and the sheet letters the attached file by its own name');
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(
      `sourceFromFile was handed ${bytes === null ? 'null' : typeof bytes} for the file's bytes, not the ` +
        'Uint8Array it was read as. The fingerprint is taken over the bytes, so they are not optional',
    );
  }

  // Size before decoding, because decoding is the expensive half and doubles
  // the file in memory on its way to a UTF-16 string.
  if (bytes.length > SIZE_CEILING) {
    throw new Error(
      `this file is ${mib(bytes.length)} MiB, and a weather file is not: the largest this page will read is ` +
        `${mib(SIZE_CEILING)} MiB, which holds a whole year at nineteen records an hour`,
    );
  }

  // A NUL byte in the head of the file is the one cheap, certain test for "this
  // is not text". Every binary container the file dialog can hand over — a ZIP,
  // a gzip, a PDF — carries one within its first record, and no file EnergyPlus
  // reads carries one anywhere. Bounded for `readLocation`'s reason: scanning
  // megabytes to answer "no" is the one expensive way to refuse.
  const probe = bytes.subarray(0, TEXT_PROBE);
  if (probe.includes(0)) {
    throw new Error(
      'this file is not text — its first bytes carry a zero byte, which a weather file never does. ' +
        'An EPW is a text file, and an archive has to be unpacked before it can be read as one',
    );
  }

  const text = new TextDecoder().decode(bytes);

  // Read once, for both halves. `readLocation` never throws: a file with no
  // LOCATION record declares nothing about itself, and that is a statement the
  // file is entitled to make rather than a reason to refuse it.
  const { declares, place } = readLocation(text);
  // Any throw from here is the refusal, in the parser's own words.
  //
  // What the file carries, never "does it carry a year". A file cut to 1 May – 30
  // September is the file CIBSE sells and the file TM59 is read over, and the
  // first cut of this gate called `dailyMeans` and refused it whole — which threw
  // away the one reading it *could* answer in order to protect the two it could
  // not. So the extent is read, the days are read against it, and a day missing
  // from inside the file's own stretch is still a refusal, because that is a
  // fault rather than a shorter file. Every reading that wants a year then
  // refuses itself, by name, in the sentence the thing that wanted it wrote.
  const period = periodCovered(text);
  const means = dailyMeansCarried(text);
  assertCarriesItsPeriod(means, period);

  if (ddyText !== null) {
    if (!schema) {
      throw new Error(
        'a DDY was attached beside this file but no schema was passed to read it with. ' +
          'Design conditions are parsed against the EnergyPlus schema, and there is nothing to fall back to',
      );
    }
    designConditionsFrom(ddyText, schema);
  }

  return new WeatherSource({
    kind: 'file',
    epw: text,
    ddy: ddyText,
    place: new Place(place),
    declares,
    // The file's own name, as the reader's filesystem gave it. Never sent
    // anywhere; it is what the sheet calls the thing on the desk.
    label: name,
    fingerprint: await fingerprint(bytes),
    // A file declares no ASHRAE zone, and there is nothing to infer one from.
    // Null in the model; an em dash only where it is lettered.
    climateZone: null,
    degreeDays: degreeDaysOf(means),
    period,
    stem: stemOf(name),
  });
}

/* ── reading the file's own header ────────────────────────────────────── */

/**
 * What an archive's EPW declares about itself.
 *
 * `readLocation` returns the pair `{ declares, place }` off one bounded pass
 * over the first sixteen lines, and a station wants only the first half: its
 * `Place` is built from the index row, which is what the picker has already
 * lettered and what the tariffs have always been keyed on. The `place` half is
 * dropped on purpose rather than merged in — a station whose archive and index
 * row disagreed about a latitude would be two answers to one question, and this
 * module exists to make sure there is only ever one.
 */
const declarationOf = (epw) => readLocation(epw).declares;

/* ── names ────────────────────────────────────────────────────────────── */

/** One decimal place, which is as precisely as a file size is worth stating. */
const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/**
 * The file name, narrowed to what a ZIP member may carry.
 *
 * This becomes `<stem>.epw` inside the run bundle, and `bundle.js` writes its
 * member names as ASCII with the UTF-8 flag set. A reader's own file is named
 * by their filesystem and may carry anything at all — spaces, a non-Latin
 * script, a path separator — and a `/` in a member name is not a name, it is a
 * directory somebody else's unzipper will create.
 *
 * The fallback here is not the silent kind the conventions forbid. A stem is a
 * filename inside an archive, not a reading: the file's own name is lettered
 * from `label`, which is untouched, so a reader whose file is named entirely in
 * Japanese sees their name on the sheet and finds `weather.epw` in the ZIP, and
 * nothing has been hidden from them. It is the same `?? 'weather'` the bundle
 * already writes for a desk with no station.
 */
function stemOf(name) {
  const stem = name
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return stem || 'weather';
}
