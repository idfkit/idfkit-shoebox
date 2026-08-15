/**
 * Picking a weather location, on top of `@idfkit/weather`.
 *
 * The package does the work — it parses the climate.onebuilding.org TMYx index,
 * scores a text search against it, finds the nearest station to a coordinate,
 * and unpacks the ZIP archive into EPW text. This module is the thin layer
 * between that and the sheet: it decides *when* to pay for the index, which of
 * a station's several flavours to offer, and how a station reads in one line.
 */
import { fetchWeatherFiles, loadStationIndex } from '@idfkit/weather';

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
function flavor(station) {
  const match = station.url.match(/_TMYx(?:\.(\d{4})-(\d{4}))?\.zip$/);
  if (!match) return { label: 'TMYx', rank: -1 };
  // The bare file carries no window in its name; it sorts last, after the
  // dated ones, because a named period is the more answerable choice.
  if (!match[1]) return { label: 'TMYx', rank: 0 };
  return { label: `${match[1]}–${match[2]}`, rank: Number(match[2]) };
}

/**
 * The flavour's window in the plain form a permalink carries: `2007-2021`, or
 * null for the bare undated `_TMYx` archive. Kept beside `flavor` because both
 * read the same filename convention, and a link that named only the site would
 * reproduce a different year than the one argued over — the five samples of
 * one site disagree by up to 9 % on degree days.
 */
export const flavorWindow = (station) => {
  const match = station.url.match(/_TMYx(?:\.(\d{4})-(\d{4}))?\.zip$/);
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

/** Degree days, the number that separates one flavour from another. */
export const degreeDays = (station) =>
  [
    Number.isFinite(station.hdd18) ? `${station.hdd18.toLocaleString('en-US')} HDD18` : null,
    Number.isFinite(station.cdd10) ? `${station.cdd10.toLocaleString('en-US')} CDD10` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The three ways this fails, which are three different things to do about it.
 *
 * Reporting all of them as a refusal was the unhelpful case: it sent you to a
 * site setting that was never the problem. A denied permission is in the
 * browser; an unavailable position is almost always the operating system
 * withholding location from the browser, whatever the page was granted.
 */
const GEOLOCATION_ERRORS = {
  1: 'Location permission was declined — search for a city instead',
  2: 'The browser could not work out where you are. On macOS this is usually Chrome itself being denied Location Services, in System Settings › Privacy & Security',
  3: 'The browser took too long to find you — try again, or search for a city',
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
