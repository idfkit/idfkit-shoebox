/**
 * Picking a weather location, on top of `@idfkit/weather`.
 *
 * The package does the work — it parses the climate.onebuilding.org TMYx index,
 * scores a text search against it, finds the nearest station to a coordinate,
 * and unpacks the ZIP archive into EPW text. This module is the thin layer
 * between that and the sheet: it decides *when* to pay for the index, which of
 * a station's several flavours to offer, and how a station reads in one line.
 */
import { fetchEpw, loadStationIndex } from '@idfkit/weather';

/** Staged out of the package's `data/` by `scripts/stage-weather.mjs`. */
const INDEX_URL = '/weather/stations.json.gz';

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

/** Text search, grouped to one row per site. */
export async function searchSites(query, limit = 8) {
  const index = await stationIndex();
  // Over-fetch, because up to five raw hits group into one row.
  const hits = index.search(query, { limit: limit * 6 });
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

/** The browser's own coordinate, only ever on an explicit click. */
export const here = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser has no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      () => reject(new Error('Location permission was declined')),
      { timeout: 10_000 }
    );
  });

/** Download and unpack a site's EPW, as text ready for `ep.run({ idf, epw })`. */
export const epwFor = (station, signal) => fetchEpw(station, { rewriteUrl, signal });

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
