/**
 * Picking a weather location, on top of `@idfkit/weather`.
 *
 * The package does the work — it parses the climate.onebuilding.org TMYx index,
 * scores a text search against it, finds the nearest station to a coordinate,
 * and unpacks the ZIP archive into EPW text. This module is the thin layer
 * between that and the sheet: it decides *when* to pay for the index, which of
 * a station's several flavours to offer, and how a station reads in one line.
 */
import { fetchWeatherFiles, loadStationIndex, unzip } from '@idfkit/weather';

/**
 * The package's ZIP reader, re-exported rather than imported straight into
 * `main.js`.
 *
 * A reader's own weather files arrive in the ZIP their purchase came in, which
 * is the same shape the picker's archives are — so they go through the same
 * reader, not a second one written beside it. It lives behind this module for
 * the reason everything from `@idfkit/weather` does: this is the one place that
 * knows the package, and a second importer is a second thing to change the day
 * it moves.
 */
export { unzip };

/**
 * Staged out of the package's `data/` by `scripts/stage-weather.mjs`.
 *
 * Resolved against `BASE_URL` rather than written as `/weather/…`, because a
 * pull request preview is built with `--base=/<pr>/` and served from that
 * subdirectory. An absolute path would have every preview quietly read the
 * index — and the engine and the schema below it — from the published site
 * instead of from its own build, which is the one thing a preview exists to
 * rule out.
 */
const INDEX_URL = `${import.meta.env.BASE_URL}weather/stations.json.gz`;

/**
 * climate.onebuilding.org sends no `Access-Control-Allow-Origin`, so the
 * archives cannot be fetched from a page directly. Two shapes are supported:
 *
 *   - a path prefix — `/onebuilding` — which stands in for the upstream origin
 *     and is served by the dev proxy in `vite.config.js`;
 *   - a query-style proxy ending in `=`, e.g. `https://corsproxy.io/?url=`,
 *     which takes the whole URL percent-encoded.
 *
 * Set `VITE_WEATHER_PROXY` to move between them without touching this file.
 *
 * Unlike the staged assets above this one stays root-absolute under a preview
 * build. It is not a file this site publishes; it is a path the distribution
 * routes to a second origin, and that behavior is matched on `/onebuilding/*`
 * at the root.
 */
const ORIGIN = 'https://climate.onebuilding.org';
const PROXY = import.meta.env.VITE_WEATHER_PROXY ?? '/onebuilding';

const rewriteUrl = (url) =>
  PROXY.endsWith('=') ? PROXY + encodeURIComponent(url) : url.replace(ORIGIN, PROXY);

/**
 * The index is 1.7 MB gzipped and inflates to 69,638 stations, which is a real
 * download and a real parse — but neither is worth paying for on a page whose
 * whole point is that it starts solving immediately. So it is fetched on the
 * first keystroke in the picker and kept for the session.
 */
let indexPromise;
export const stationIndex = () => (indexPromise ??= loadStationIndex(INDEX_URL));

/**
 * A station's flavour, from its archive name.
 *
 * onebuilding publishes the same site several times over: a bare `_TMYx` and up
 * to four explicit 15-year windows. These are not duplicates — they sample
 * different years, and they disagree. Boston-Logan's five run from 2,840 to
 * 3,083 HDD18, a 9% spread, so which one you run changes the answer. The picker
 * therefore groups them under the site and makes you choose.
 */
// The one copy of onebuilding's archive-name grammar. `flavor` and
// `flavorWindow` both read it, and when they carried a regex each, a change to
// the convention would have updated one and left the picker's labels and the
// permalink's `win` token disagreeing about the same file.
const TMYX_WINDOW = /_TMYx(?:\.(\d{4})-(\d{4}))?\.zip$/;

function flavor(station) {
  const match = station.url.match(TMYX_WINDOW);
  if (!match) return { label: 'TMYx', rank: -1 };
  // The bare file carries no window in its name; it sorts last, after the
  // dated ones, because a named period is the more answerable choice.
  if (!match[1]) return { label: 'TMYx', rank: 0 };
  return { label: `${match[1]}–${match[2]}`, rank: Number(match[2]) };
}

/**
 * The flavour's window in the plain form a permalink carries: `2007-2021`, or
 * null for the bare undated `_TMYx` archive. A link that named only the site
 * would reproduce a different year than the one argued over — the five
 * samples of one site disagree by up to 9 % on degree days.
 */
export const flavorWindow = (station) => {
  const match = station.url.match(TMYX_WINDOW);
  return match?.[1] ? `${match[1]}-${match[2]}` : null;
};

/**
 * One row per site, each carrying every flavour of that site, most recent
 * window first. Ranked results keep their ranking: the first time a site
 * appears is the best score it earned.
 */
function group(stations, limit) {
  const sites = new Map();
  for (const station of stations) {
    const key = `${station.wmo}|${station.country}|${station.state}|${station.city}`;
    if (!sites.has(key)) sites.set(key, []);
    sites.get(key).push({ station, ...flavor(station) });
  }
  return [...sites.values()].slice(0, limit).map((flavors) => {
    flavors.sort((a, b) => b.rank - a.rank);
    return { station: flavors[0].station, flavors };
  });
}

/**
 * Punctuation, spelled the way the index spells it.
 *
 * `scoreStation` normalises the station name with `[.-]` → space but leaves the
 * query as typed, so a hyphen or a dot in the query can never match: "Montreal
 * Trudeau" finds the airport and "Montreal-Trudeau" finds nothing. The list
 * shows the name with its hyphen, so typing back what you just read is the
 * failing case. Until the package normalises both sides, do it here.
 */
const asIndexed = (query) => query.replace(/[.\-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Text search, grouped to one row per site. */
export async function searchSites(query, limit = 8) {
  const index = await stationIndex();
  // Over-fetch, because up to five raw hits group into one row.
  const hits = index.search(asIndexed(query), { limit: limit * 6 });
  return group(
    hits.map((hit) => hit.station),
    limit
  );
}

/** The sites closest to a coordinate, grouped the same way. */
export async function nearestSites(latitude, longitude, limit = 8) {
  const index = await stationIndex();
  const hits = index.nearest(latitude, longitude, { limit: limit * 6 });
  const byUrl = new Map(hits.map((hit) => [hit.station.url, hit.distanceKm]));
  return group(
    hits.map((hit) => hit.station),
    limit
  ).map((row) => ({ ...row, distanceKm: byUrl.get(row.station.url) }));
}

/**
 * Degree days, the number that separates one flavour from another.
 *
 * The bases stay Celsius in both systems, and the reading says so rather than
 * leaving it to be assumed. `HDD18` is a published statistic computed on an
 * 18 °C base: converting the count while the label still read 18 would be
 * arithmetic nobody can check, and relabelling it `HDD65` would claim a
 * statistic this page did not compute (research R11). Said here, where the
 * figure is read, because a comment on the kind is not a reading — a US
 * engineer handed `2,732 HDD18` beside an IP sheet has no way to know which
 * base it is on.
 */
export const degreeDays = (station) => {
  const said = [
    Number.isFinite(station.hdd18) ? `${station.hdd18.toLocaleString('en-US')} HDD18` : null,
    Number.isFinite(station.cdd10) ? `${station.cdd10.toLocaleString('en-US')} CDD10` : null,
  ].filter(Boolean);
  return said.length ? `${said.join(' · ')} · °C bases` : '';
};

/**
 * The three ways this fails, which are three different things to do about it.
 *
 * Reporting all of them as a refusal was the unhelpful case: it sent you to a
 * site setting that was never the problem. A denied permission is in the
 * browser; an unavailable position is almost always the operating system
 * withholding location from the browser, whatever the page was granted.
 */
const GEOLOCATION_ERRORS = {
  1: 'Location permission was declined — search for a city instead.',
  2: 'The browser could not work out where you are. On macOS this is usually the browser itself being denied Location Services, in System Settings › Privacy & Security.',
  3: 'The browser took too long to find you — try again, or search for a city.',
};

/**
 * The browser's own coordinate, only ever on an explicit click.
 *
 * The timeout has to cover the permission prompt, because the clock starts when
 * the call is made and the prompt is answered at reading speed: 10 s was a 10 s
 * deadline for noticing a dialog, and missing it reported a timeout as a
 * refusal. A fix from the last five minutes is good enough to reuse, and comes
 * back without waking the radio at all.
 */
export const here = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      (error) => reject(new Error(GEOLOCATION_ERRORS[error.code] ?? error.message)),
      { timeout: 30_000, maximumAge: 300_000 }
    );
  });

/**
 * Download and unpack a site's archive: the EPW for `ep.run({ idf, epw })`, and
 * the DDY that states the same site's design conditions.
 *
 * Both come out of one request — the archive already holds them — so taking the
 * DDY as well costs nothing beyond the unzip. `ddy` is null for the handful of
 * sites published without one.
 */
export const weatherFor = (station, signal) => fetchWeatherFiles(station, { rewriteUrl, signal });

/* ── how a station reads ──────────────────────────────────────────────── */

/** `Boston-Logan.Intl.AP` is a filename; `Boston-Logan Intl AP` is a place. */
export const siteName = (station) => station.city.replace(/\./g, ' ').trim();

/** `MA, USA` — the qualifier that disambiguates two identically-named cities. */
export const siteRegion = (station) =>
  [station.state, station.country].filter(Boolean).join(', ');

/** `4A` out of `4A - Mixed - Humid`, for the climate-zone chip. */
export const climateZone = (station) =>
  (station.ashraeClimateZone ?? '').split(/\s*-\s*/)[0] || '—';

/** The rest of it: `Mixed, Humid`. */
export const climateDescription = (station) =>
  (station.ashraeClimateZone ?? '')
    .split(/\s*-\s*/)
    .slice(1)
    .join(', ');

/* ── remembering a file the reader attached ───────────────────────────────
 *
 * A station is a URL: the link carries its WMO number and the archive is
 * fetched again on the other side. A file the reader holds is not, and it must
 * not be — it is megabytes, and a bought one is not theirs to redistribute. So
 * the link carries a fingerprint of it (`wf` in `permalink.js`) and the bytes
 * are kept here, in the reader's own browser, where the constitution says the
 * only persistence this page has lives.
 *
 * **The address bar remembers which file; this remembers its bytes. Neither can
 * put a climate on the desk without the other agreeing.** That division is what
 * keeps Principle II intact, and it is worth stating because the obvious design
 * quietly breaks it: re-attaching a remembered file on any load at all would
 * make `shoebox.idfkit.com` mean one thing on the machine that once attached a
 * file and another on every other machine, which is exactly what "the same URL
 * reproduces the same drawing, in any browser, on any machine" forbids. A
 * remembered file is therefore attached only where the fragment's `wf` matches
 * it, and on a bare desk it is *offered*, never attached.
 *
 * Gzipped, because a `localStorage` value is stored as UTF-16 and an EPW is a
 * couple of megabytes of ASCII. Measured on a synthetic 8,760-row file:
 * 1.66 MiB of text compresses to 388 KB, which base64s to 518 K characters and
 * so costs about 1.0 MiB of a roughly 5 MiB quota — comfortably inside it,
 * beside the kept schemes and the general notes. Costs, same file: 44.5 ms to
 * compress, once, after an attach has already landed and never inside a
 * gesture; 15.4 ms to inflate, once, on a boot that re-attaches. `gzip` rather
 * than the `deflate-raw` `bundle.js` uses, because this is the mirror of the
 * `DecompressionStream` the station index already arrives through and there is
 * no ZIP member here to be a member of.
 *
 * Every figure above is over a *synthetic* file. A real bought file may not
 * compress the same, which is why nothing here assumes it will: a write that
 * does not fit is a stated outcome, not an error.
 */

const KEPT = 'shoebox-weather-file-v1';

/**
 * `localStorage`, or null where the browser will not give it.
 *
 * Probed by writing rather than by testing for the object, because Safari in
 * private browsing hands out a `localStorage` that throws on `setItem`, and a
 * feature detected by its presence is a feature that fails at the one moment it
 * is used.
 */
const kept = (() => {
  const probe = '__shoebox_weather_probe__';
  try {
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
})();

/** Whether this browser will keep a file at all, for the sentence that says so. */
export const canRemember = () => kept !== null;

const gzip = async (text) =>
  new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

const gunzip = async (bytes) =>
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

// `btoa` wants a binary string and a two-megabyte one spread over `String.
// fromCharCode(...bytes)` overflows the argument list, which is a stack
// overflow rather than an error a reader could act on. Chunked at 8 KB, which
// is well under every engine's limit and costs 0.43 ms over the whole file.
const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(binary);
};

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * Keep a file, or say why it could not be kept.
 *
 * Returns `{ kept: true }` or `{ kept: false, reason }` and never throws, and
 * that is the whole point: a file that will not fit is not a failed attach. The
 * desk is already solving it. What the reader loses is the next reload, and the
 * sheet has to say so rather than let them find out.
 *
 * Called only after an attach has landed, so what is remembered is always a
 * file that already solved.
 */
export async function rememberFile({ fingerprint, name, declares, epw, ddy = null }) {
  if (!kept) {
    return {
      kept: false,
      reason: 'This browser will not let the page store anything, so the file is attached for this session only.',
    };
  }
  try {
    const record = {
      fingerprint,
      name,
      declares,
      gz: toBase64(await gzip(epw)),
      ddyGz: ddy ? toBase64(await gzip(ddy)) : null,
    };
    kept.setItem(KEPT, JSON.stringify(record));
    return { kept: true };
  } catch (error) {
    // Almost always the quota, and the sentence says the useful half of that
    // rather than the name of an exception. The record is cleared first: a
    // half-written value is a file that will fail to inflate on the next boot,
    // which is a worse state than no file at all.
    forgetFile();
    return {
      kept: false,
      reason: `This file is too large for the browser to keep (${error.name}), so it is attached for this session only.`,
    };
  }
}

/**
 * What is remembered, without inflating it.
 *
 * Two calls rather than one, because the two questions are asked at different
 * moments and one of them is on the boot path: "is the file this link wants the
 * one I have" is answered by a fingerprint comparison and must not cost the
 * 15.4 ms of inflating a file that may turn out to be the wrong one.
 */
export function rememberedFile() {
  if (!kept) return null;
  const raw = kept.getItem(KEPT);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record?.fingerprint || !record?.gz) throw new Error('no fingerprint or no file');
    return { fingerprint: record.fingerprint, name: record.name ?? null, declares: record.declares ?? null };
  } catch {
    // A record this page cannot read is a record from a version of this page
    // that no longer exists, or a half-written one. Neither is something to
    // repair, and leaving it would have every boot trip over it.
    forgetFile();
    return null;
  }
}

/** The file itself, inflated. Null where nothing is kept or it cannot be read. */
export async function rememberedBytes() {
  if (!kept) return null;
  const raw = kept.getItem(KEPT);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return {
      fingerprint: record.fingerprint,
      name: record.name ?? null,
      epw: await gunzip(fromBase64(record.gz)),
      ddy: record.ddyGz ? await gunzip(fromBase64(record.ddyGz)) : null,
    };
  } catch {
    forgetFile();
    return null;
  }
}

/** The reader's own "forget it", and the only thing that clears the record. */
export function forgetFile() {
  try {
    kept?.removeItem(KEPT);
  } catch {
    // Nothing to do and nothing to say: a browser that refuses a removal has
    // already refused the write that would have put something there.
  }
}
