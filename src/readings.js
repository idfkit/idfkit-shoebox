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
 * How much of the year the zone spent above a temperature.
 *
 * The form every comfort criterion worth having is written in: not a peak,
 * which one freak afternoon can set, but a frequency — Passivhaus asks for no
 * more than a tenth of the year above 25 °C, and CIBSE and the adaptive
 * standards all count exceedances the same way. Read over the billed
 * environments only, by the bill's own rule: the sizing days exist to be more
 * extreme than the year they precede, and counting them in would have two
 * deliberately punishing days set the frequency for eight thousand ordinary
 * ones. Without a year there is nothing to be a frequency *of*, and the
 * register says so rather than dividing by 48.
 */
export function readOverheat(eso, above) {
  const zr = zoneRuns(eso);
  const year = zr ? zr.runs.filter((r) => r.kind === null) : [];
  if (!year.length) return null;
  let over = 0;
  let all = 0;
  for (const r of year) {
    for (let i = r.start; i <= r.end; i += 1) {
      all += 1;
      if (zr.points[i].value > above) over += 1;
    }
  }
  return all ? (over / all) * 100 : null;
}

/**
 * The peak heating and cooling loads, in watts per square metre of floor.
 *
 * A demand is what the building costs to run; a load is what has to be *there*
 * on the worst hour, and it is the number the plant, the risers and the
 * distribution are actually sized from. An envelope decision usually moves the
 * two together, but not always — thermal mass shaves a peak while barely
 * touching an annual total, and a standard like Passivhaus offers the load as
 * an explicit alternative route to compliance for exactly that reason. So the
 * two are read side by side rather than the energy alone.
 *
 * `Zone Air Heat Balance System Air Transfer Rate` is the one variable needed
 * and the balance rail already requests it Hourly whenever System is engaged,
 * so this costs no new output — which matters, because per-surface requests
 * once took an annual run from 681 ms to 2,984 ms. It is signed the way the
 * rail reads it: positive is heat arriving in the zone, so the heating peak is
 * the largest positive and the cooling peak the largest negative, reported as
 * a magnitude. It is also `perBuilding` — already through the zone multiplier
 * — so it is divided back down by the same multiplier the floor area is, which
 * is to say both are the building's and the ratio is right either way.
 *
 * Unlike the demand intensities this does **not** insist on a weather file.
 * Sizing days are precisely the conditions a load is designed against; they
 * are the wrong environments to bill a year from and the right ones to size
 * plant from, so the same billed-environment rule `readExtremes` uses applies
 * and a bare design-day desk answers the question honestly.
 */
export function readPeaks(eso, floorArea) {
  if (!(floorArea > 0)) return null;
  const points = hourly(eso, /Zone Air Heat Balance System Air Transfer Rate/i);
  if (!points.length) return null;
  const runs = environmentRuns(points, eso.environments ?? []);
  const year = runs.filter((r) => r.kind === null);
  const billed = year.length ? year : runs;
  if (!billed.length) return null;

  let heat = null;
  let cool = null;
  for (const r of billed) {
    for (let i = r.start; i <= r.end; i += 1) {
      const w = points[i].value;
      if (w > 0) heat = heat == null ? w : Math.max(heat, w);
      else if (w < 0) cool = cool == null ? -w : Math.max(cool, -w);
    }
  }
  return {
    peakHeat: heat == null ? null : heat / floorArea,
    peakCool: cool == null ? null : cool / floorArea,
  };
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
