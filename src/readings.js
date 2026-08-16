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
// The month names belong to the calendar control, which is the one place the
// year is declared; re-exported here because every reader of a run letters its
// timestamps with them and `main.js` has always taken them from this module.
import { MONTHS } from './controls.js';

export { MONTHS };

export function hourly(eso, pattern) {
  const v = findVariables(eso, pattern).find((x) => x.reportFrequency === 'hourly');
  return v ? getTimeSeries(eso, v.id)?.data ?? [] : [];
}

/**
 * Each EnergyPlus environment is its own weather story. A design-day run holds
 * two of them, and averaging across the pair would be nonsense — the winter and
 * summer days share nothing. Everything below is computed per environment.
 *
 * There can now be several weather-file environments in one run: months that do
 * not touch are handed to the engine as separate run periods, so a desk set to
 * January and July comes back as four environments rather than three. Which
 * months each one covers is read off the timestamps that arrive rather than off
 * the parameters that were set, by the sheet's own rule — the run is the record
 * of what was solved, and the desk may have moved since.
 *
 * `noun` is the environment said in a sentence ("the run period's swing"),
 * kept apart from `label`, which heads a column and carries the dates.
 */
export function environmentRuns(points, environments) {
  const runs = [];
  points.forEach((p, i) => {
    const key = p.timestamp.environmentIndex;
    if (!runs.length || runs.at(-1).key !== key) {
      runs.push({ key, start: i, end: i, first: p.timestamp, last: p.timestamp });
    } else {
      Object.assign(runs.at(-1), { end: i, last: p.timestamp });
    }
  });
  return runs.map((r, i) => {
    const title = environments[i]?.title ?? '';
    const kind = /htg/i.test(title) ? 'Winter design day' : /clg/i.test(title) ? 'Summer design day' : null;
    if (kind) {
      return {
        ...r,
        kind,
        months: 1,
        noun: kind.toLowerCase(),
        label: `${kind} · ${r.first.day} ${MONTHS[r.first.month - 1]}`,
      };
    }
    const whole = r.first.month === 1 && r.last.month === 12;
    const span =
      r.first.month === r.last.month
        ? MONTHS[r.first.month - 1]
        : `${MONTHS[r.first.month - 1]}–${MONTHS[r.last.month - 1]}`;
    return {
      ...r,
      kind: null,
      // A run period is one unbroken group of months, so its span is its count.
      months: r.last.month - r.first.month + 1,
      noun: whole ? 'annual run period' : 'run period',
      label: whole ? 'Annual run period' : `Run period · ${span}`,
    };
  });
}

/**
 * Room temperature: the only neutral point that means anything here, and the
 * hinge both the axonometric's tint and the reading hour are measured from.
 */
export const NEUTRAL_C = 20;

/** The environment kinds a pinned hour can name, as the permalink spells them. */
export const kindToken = (run) =>
  run.kind === 'Winter design day' ? 'winter' : run.kind === 'Summer design day' ? 'summer' : 'year';

/**
 * The hour the building is having the hardest time, within one environment:
 * the one furthest from 20 °C. This is the desk's default reading instant and
 * the reason the pin exists.
 *
 * It is an `argmax` over two candidates half a year apart — the annual low and
 * the annual high — so it is not a continuous function of any control. On a
 * balanced climate the two sit close enough that a control with no optical
 * effect whatever can invert the ranking and move every meter on the desk from
 * a sunlit August afternoon to a January night: measured on Boston TMYx, a
 * concrete slab reads at 31.4 °C on 3 August (11.44 K off, and 612 W of
 * transmitted solar), and the same desk with a lightweight slab reads at
 * 5.6 °C on 21 January (14.42 K off, and no sun at all). Both readings are
 * true. They are not a comparison, which is what the pin is for.
 */
export function worstHour(points, run) {
  let at = run.start;
  let worst = -Infinity;
  for (let i = run.start; i <= run.end; i += 1) {
    const off = Math.abs(points[i].value - NEUTRAL_C);
    if (off > worst) {
      worst = off;
      at = i;
    }
  }
  return at;
}

/** The pin a reader takes by pinning the hour currently being read. */
export function pinAt(points, runs, at) {
  const run = runs.find((r) => at >= r.start && at <= r.end);
  const t = points[at]?.timestamp;
  if (!run || !t) return null;
  return { kind: kindToken(run), month: t.month, day: t.day, hour: t.hour ?? 0 };
}

/**
 * Find a pinned hour in a run that has just been solved, or return null.
 *
 * Null is the honest answer often enough to be the interesting case: a pin
 * taken on the run period does not exist in a design-day run, a pin on 3
 * August is absent from a run period that covers only the winter, and a
 * station change replaces the calendar the stamp was read off. The caller
 * releases the pin and says which hour went missing rather than sliding the
 * reading to a neighbouring one — a meter quietly reading an hour nobody
 * pinned is exactly the substitution this codebase refuses everywhere else.
 */
export function resolvePin(pin, points, runs) {
  if (!pin) return null;
  for (const run of runs) {
    if (kindToken(run) !== pin.kind) continue;
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month === pin.month && t.day === pin.day && (t.hour ?? 0) === pin.hour) return i;
    }
  }
  return null;
}

/**
 * The hour a click on the plate means.
 *
 * An annual trace is 8,760 points across about 900 px — roughly ten hours to
 * the pixel — so a click cannot mean an hour, only a day. Rather than take the
 * hour that happens to sit under the cursor, which is arbitrary and a tenth
 * likely to be the one meant, the pick is snapped to the extreme *within the
 * clicked day*: one gesture, and it lands on the hour of that day worth
 * reading. Same rule as `worstHour`, over a day instead of an environment, so
 * the plate and the desk agree about what "the hour that matters" means.
 *
 * The caller decides whether to snap, from the axis's own resolution: a
 * design-day run is 48 points across the same width, where a click already
 * names its hour to within a fifth of one and snapping would throw that away —
 * it would leave the whole winter day reachable only at its coldest hour.
 */
export function dayExtremeNear(points, runs, index) {
  const run = runs.find((r) => index >= r.start && index <= r.end);
  if (!run) return null;
  const { month, day } = points[index].timestamp;
  let at = index;
  let worst = -Infinity;
  for (let i = run.start; i <= run.end; i += 1) {
    const t = points[i].timestamp;
    if (t.month !== month || t.day !== day) continue;
    const off = Math.abs(points[i].value - NEUTRAL_C);
    if (off > worst) {
      worst = off;
      at = i;
    }
  }
  return at;
}

/** A pinned or read hour, lettered the one way the whole sheet letters it. */
export const stampText = (points, at) => {
  const t = points[at]?.timestamp;
  return t ? `${String(t.hour ?? 0).padStart(2, '0')}:00, ${t.day} ${MONTHS[t.month - 1]}` : null;
};

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
