/**
 * Reading a study's numbers off a finished run.
 *
 * These lived in `main.js`, which touches `document` at module scope and so
 * can never be imported by a Node script. The readers themselves are pure
 * functions over a parsed ESO, and the throwaway harnesses that check the
 * scheduler need to call the real ones — a reimplementation would drift, and
 * "which hours count" is exactly the kind of rule that drifts silently. So
 * they live here, DOM-free, beside `study.js` and `bill.js` which made the
 * same move for the same reason.
 */

import { findVariables, getTimeSeries } from '@idfkit/engine';
import { END_USES, J_TO_KWH, meterTotal } from './bill.js';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function hourly(eso, pattern) {
  const v = findVariables(eso, pattern).find((x) => x.reportFrequency === 'hourly');
  return v ? getTimeSeries(eso, v.id)?.data ?? [] : [];
}

// Each EnergyPlus environment is its own weather story. A design-day run holds
// two of them, and averaging across the pair would be nonsense — the winter and
// summer days share nothing. Everything below is computed per environment.
export function environmentRuns(points, environments) {
  const runs = [];
  points.forEach((p, i) => {
    const key = p.timestamp.environmentIndex;
    if (!runs.length || runs.at(-1).key !== key) runs.push({ key, start: i, end: i, first: p.timestamp });
    else runs.at(-1).end = i;
  });
  return runs.map((r, i) => {
    const title = environments[i]?.title ?? '';
    const kind = /htg/i.test(title) ? 'Winter design day' : /clg/i.test(title) ? 'Summer design day' : null;
    return { ...r, kind, label: kind ? `${kind} · ${r.first.day} ${MONTHS[r.first.month - 1]}` : 'Annual run period' };
  });
}

/**
 * The zone series with its environment runs — the one prelude both readers
 * below share, so "which hours count" cannot drift between them. Returns null
 * when the run carried no hourly zone temperature at all.
 */
function zoneRuns(eso) {
  const points = hourly(eso, /Zone Mean Air Temperature/i);
  if (!points.length) return null;
  return { points, runs: environmentRuns(points, eso.environments ?? []) };
}

// One pass over the run's index range, no copies: an annual environment is
// 8,760 points, and slicing plus spreading it as arguments — twenty-one times
// a sweep — is allocation and stack pressure for a number a loop reads flat.
function overRun(points, r, better) {
  let best = points[r.start].value;
  for (let i = r.start + 1; i <= r.end; i += 1) {
    if (better(points[i].value, best)) best = points[i].value;
  }
  return best;
}

/**
 * The two extremes of hourly zone temperature, read over the billed
 * environments by the bill's own rule: with a year in the run its extremes are
 * the reading, and sizing days kept on the Run strip stay out of it — their
 * whole point is to be more extreme than the year they precede. Without one,
 * the design days are themselves: the winter day owns the low and the summer
 * day the high, never each other's.
 */
export function readExtremes(eso) {
  const zr = zoneRuns(eso);
  if (!zr) return null;
  const lowOf = (r) => overRun(zr.points, r, (a, b) => a < b);
  const highOf = (r) => overRun(zr.points, r, (a, b) => a > b);
  const year = zr.runs.filter((r) => r.kind === null);
  if (year.length) {
    return {
      low: Math.min(...year.map(lowOf)),
      high: Math.max(...year.map(highOf)),
    };
  }
  const w = zr.runs.find((r) => r.kind === 'Winter design day');
  const s = zr.runs.find((r) => r.kind === 'Summer design day');
  if (!w && !s) return null;
  return { low: w ? lowOf(w) : null, high: s ? highOf(s) : null };
}

/**
 * The demand intensities, for a desk with ideal loads in the path and a year
 * to read them over.
 *
 * Ideal loads meter as `DistrictHeatingWater` and `DistrictCooling` — heat
 * delivered at a notional 100 % — which is exactly what a demand intensity
 * means: TEDI and CEDI are the envelope's ask, before any plant, so the
 * priced channels stay out of this the way they stay out of `shapeKey`. The
 * EUI sums the bill's building section only, by the bill's own benchmark
 * rule, and refuses to print at all when heating or cooling is missing — a
 * total quietly short its largest term would read as a finding.
 */
export function readDemand(eso, floorArea) {
  if (!(floorArea > 0)) return null;
  const zr = zoneRuns(eso);
  const year = zr ? zr.runs.filter((r) => r.kind === null) : [];
  if (!year.length) return null;
  const billed = new Set(year.map((r) => r.key));

  const kwh = new Map();
  for (const use of END_USES) {
    if (use.group !== 'building') continue;
    const joules = meterTotal(eso, use.meter, billed);
    if (joules != null) kwh.set(use.id, joules * J_TO_KWH);
  }
  const heating = kwh.get('heating') ?? null;
  const cooling = kwh.get('cooling') ?? null;
  return {
    tedi: heating == null ? null : heating / floorArea,
    cedi: cooling == null ? null : cooling / floorArea,
    eui:
      heating == null || cooling == null
        ? null
        : [...kwh.values()].reduce((a, b) => a + b, 0) / floorArea,
  };
}
