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
import { MONTHS, TRIBUTARIES } from './controls.js';

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

/** Anchor a variable name so one meter cannot pick up another's series. */
export const exactly = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/** Watts, at a precision that reads on a strip rather than in a report. */
export function watts(w) {
  if (!Number.isFinite(w)) return '—';
  const abs = Math.abs(w);
  if (abs >= 10000) return `${(w / 1000).toFixed(1)} kW`;
  if (abs >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${w.toFixed(0)} W`;
}

/* ══ the hours worth reading at ══════════════════════════════════════════ */

/**
 * One named instant, found in a run rather than named on a calendar.
 *
 * These exist because "which hour" is a question the field already has stock
 * answers to, and a reader who has to hunt for them along a curve is being
 * asked to rediscover their own conventions:
 *
 *  - **The two peaks are EnergyPlus's own organising instants.** The Component
 *    Load Summary tables report at the *time of the peak load*, heating and
 *    cooling separately, and every sizing report names that time; a modeller
 *    arriving at this plate already has "peak heating" and "peak cooling" as
 *    the two hours a design is argued at.
 *  - **The weather-side pair is the other convention they carry.** A results
 *    tool's period list (DesignBuilder's is the familiar one) offers a summer
 *    and a winter *design* week — the hottest and the coldest in the file,
 *    read off its own statistics — beside typical weeks of each. Those are
 *    weeks and this is an instant, so what survives the translation is the
 *    hottest and the coldest outdoor hour, which is what a design week is
 *    picked to contain.
 *  - **The zone's own extremes belong beside them** because this sheet's
 *    subject is the zone, not the weather: on a free-running desk there is no
 *    heating or cooling rate to peak at all, and the warmest and coolest hours
 *    inside the building are the only peaks there are.
 *  - **The transmitted-solar peak** is the one gain with an hour of its own
 *    worth going to, and the hour every glazing and shading decision on the
 *    desk is arguing about.
 *
 * Everything is found in the ESO in hand and nothing is computed from
 * `params`, by the sheet's rule: the desk may have moved since the solve, and
 * an offer lettered off live parameters would name an hour the run does not
 * contain.
 *
 * `holds` is the honesty gate. An `argmax` always returns something, so a
 * "peak heating" over a run that never called for heat would hand back the
 * least-cooled hour of the year under a label claiming the opposite. Where the
 * extreme does not hold, the offer is refused with `never` — the same refusal
 * `Channel.requires` makes, for the same reason.
 */
export class Instant {
  constructor({ id, label, blurb, variable = null, perBuilding = false, better, holds = () => true, letter, missing, never }) {
    this.id = id;
    this.label = label;
    this.blurb = blurb;
    // Null means the zone mean air temperature the caller already holds: it is
    // the series every run carries and the one the plate is drawn from, so
    // asking the ESO for it a second time would be a second parse of the same
    // numbers under a name that could drift from the plate's.
    this.variable = variable;
    // Reported at building level, already multiplied by the zone multiplier —
    // see `Term.perBuilding`. It does not move the argmax, since the multiplier
    // is constant over a run, but it does move the figure the offer letters,
    // and an offer reading three times the rail's watts would be the drift the
    // read-back rule exists to prevent.
    this.perBuilding = perBuilding;
    this.better = better;
    this.holds = holds;
    this.letter = letter;
    // Why the series is not in this run at all — a channel that is out of the
    // path takes its output variable with it.
    this.missing = missing;
    // Why the extreme that was found is not the thing the label names.
    this.never = never;
    Object.freeze(this);
  }
}

const SYSTEM_RATE = 'Zone Air Heat Balance System Air Transfer Rate';
const NO_SYSTEM =
  'The System strip is out of the path, so this run metered no heating or cooling rate.';

export const INSTANTS = Object.freeze([
  new Instant({
    id: 'heating',
    label: 'Peak heating',
    blurb: 'The hour the ideal unit put the most heat into the zone air.',
    variable: SYSTEM_RATE,
    perBuilding: true,
    better: (v, best) => v > best,
    holds: (v) => v > 0,
    letter: watts,
    missing: NO_SYSTEM,
    never: 'Nothing in this run called for heating.',
  }),
  new Instant({
    id: 'cooling',
    label: 'Peak cooling',
    blurb: 'The hour the ideal unit took the most heat out of the zone air.',
    variable: SYSTEM_RATE,
    perBuilding: true,
    better: (v, best) => v < best,
    holds: (v) => v < 0,
    letter: watts,
    missing: NO_SYSTEM,
    never: 'Nothing in this run called for cooling.',
  }),
  new Instant({
    id: 'warmest',
    label: 'Warmest zone',
    blurb: 'The highest zone mean air temperature in the run.',
    better: (v, best) => v > best,
    letter: (v) => `${v.toFixed(1)} °C`,
  }),
  new Instant({
    id: 'coolest',
    label: 'Coolest zone',
    blurb: 'The lowest zone mean air temperature in the run.',
    better: (v, best) => v < best,
    letter: (v) => `${v.toFixed(1)} °C`,
  }),
  new Instant({
    id: 'hottest',
    label: 'Hottest outdoor',
    blurb: 'The highest outdoor drybulb in the run — the hour a design week is picked to contain.',
    variable: 'Site Outdoor Air Drybulb Temperature',
    better: (v, best) => v > best,
    letter: (v) => `${v.toFixed(1)} °C`,
    missing: 'This run carried no outdoor drybulb series.',
  }),
  new Instant({
    id: 'coldest',
    label: 'Coldest outdoor',
    blurb: 'The lowest outdoor drybulb in the run.',
    variable: 'Site Outdoor Air Drybulb Temperature',
    better: (v, best) => v < best,
    letter: (v) => `${v.toFixed(1)} °C`,
    missing: 'This run carried no outdoor drybulb series.',
  }),
  new Instant({
    id: 'solar',
    label: 'Peak solar gain',
    blurb: 'The hour the most solar came through the glass.',
    variable: 'Enclosure Windows Total Transmitted Solar Radiation Rate',
    better: (v, best) => v > best,
    holds: (v) => v > 0,
    letter: watts,
    missing: 'Glazing, Skylights and Blinds are all out of the path, so no transmitted solar was metered.',
    never: 'No solar reached the glass in this run.',
  }),
]);

/**
 * Where one named instant lands in a run, or why it does not land at all.
 *
 * Searched over **every** environment the run came back with, not over the
 * billed ones `readExtremes` uses. The two rules differ because the questions
 * do: an intensity read over a year must not have forty-eight hours of design
 * weather folded into it, whereas a reader asking for the peak heating hour of
 * a run that was handed a winter design day means that day — it is what a
 * design day is for. Nothing is hidden by the wider search, because the offer
 * letters the environment it landed in.
 *
 * Returns `{ instant, at, value, pin, reason }`. `at` is null with a reason
 * whenever the offer cannot be made, and the caller greys the offer and says
 * the reason rather than falling back to a neighbouring hour — the pin has
 * refused that substitution since it was built.
 */
export function findInstant(instant, points, runs, eso) {
  const series = instant.variable ? hourly(eso, exactly(instant.variable)) : points;
  if (!series.length) {
    return { instant, at: null, reason: instant.missing ?? 'This run did not carry that series.' };
  }
  // Same length or nothing: an hourly series that does not span the same
  // environments cannot be indexed by the same `at`, and an off-by-one here
  // would put every meter on the desk at an hour nobody chose. Said apart from
  // `missing`, because a series that is present and short is a different fact
  // from one that was never requested, and only one of the two is explained by
  // a channel being out of the path.
  if (series.length !== points.length) {
    return {
      instant,
      at: null,
      reason: 'That series does not span the same hours as this run, so the two cannot be read at one instant.',
    };
  }
  let at = null;
  let best = null;
  for (const run of runs) {
    for (let i = run.start; i <= run.end; i += 1) {
      const v = series[i].value;
      if (at == null || instant.better(v, best)) {
        at = i;
        best = v;
      }
    }
  }
  if (at == null) return { instant, at: null, reason: 'This run carried no hours.' };
  if (!instant.holds(best)) {
    return { instant, at: null, reason: instant.never ?? 'That extreme is not in this run.' };
  }
  return { instant, at, value: best, pin: pinAt(points, runs, at) };
}

/** Every offer, in the order the chips stand. */
export const instantOffers = (points, runs, eso) =>
  INSTANTS.map((instant) => findInstant(instant, points, runs, eso));

/* ══ naming an instant outright ══════════════════════════════════════════ */

/**
 * The calendar a run actually contains, as the picker's own options.
 *
 * Built by walking the timestamps rather than by counting days from a begin
 * date, for the reason everything else here reads the run instead of the desk:
 * a run period is whatever came back, and a picker offering 31 September or
 * hour 24 would exist only to be refused. Bounded this way it cannot express
 * an instant the run does not hold, which is the objection that kept a date
 * field off this sheet in the first place.
 */
export function runCalendar(points, run) {
  const months = new Map(); // month number -> Map(day -> Map(hour -> index))
  for (let i = run.start; i <= run.end; i += 1) {
    const t = points[i].timestamp;
    if (!months.has(t.month)) months.set(t.month, new Map());
    const days = months.get(t.month);
    if (!days.has(t.day)) days.set(t.day, new Map());
    days.get(t.day).set(t.hour ?? 0, i);
  }
  return months;
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
 * The demand intensities over one named set of environments.
 *
 * The three names are pinned to published definitions rather than to how they
 * are used in conversation, because two of them are compliance metrics with
 * numeric targets attached and the third is the most misused acronym in the
 * field:
 *
 *   TEDI — "the annual heating energy demand for space conditioning and
 *   conditioning of ventilation air … the amount of heating energy that is
 *   output from any and all types of heating equipment, per unit of Modelled
 *   Floor Area" (City of Vancouver Energy Modelling Guidelines v3.0). CaGBC
 *   ZCB-Design v3/v4 gives the same formula — Σ space and ventilation heating
 *   output ÷ modelled floor area — and states outright that it "is intended to
 *   represent the heat delivered to the building", counting a heat pump's
 *   output rather than the electricity it drew. TEDI is therefore *before* any
 *   efficiency or COP.
 *
 *   CEDI — "the annual cooling energy demand for space conditioning and
 *   conditioning of ventilation air … the amount of cooling output, both
 *   latent and sensible, from any and all types of cooling equipment per unit
 *   of Modelled Floor Area … CEDI does not include mechanical efficiencies of
 *   cooling equipment" (same guidelines, where it is a defined term that
 *   carries no target). CaGBC defines no cooling metric at all, so Vancouver
 *   is the authority for this one.
 *
 *   EUI — "the sum of all site energy consumed on site (e.g., electricity,
 *   natural gas, district heat), including all process loads, divided by the
 *   building modelled floor area" (CaGBC ZCB-Design v3/v4). Metered energy,
 *   *after* the plant, which is the bill's per-m² row and nothing on the
 *   demand side. So there is no third reading here. Summing the four building
 *   end uses before the plant produces a figure with no published definition
 *   and no benchmark to hold it against — it was drawn for a while as an
 *   "EUI", 44 % adrift of the bill's own per-m² on a Denver year, which is the
 *   whole argument against reporting it under any name.
 *
 * All of which the ideal-loads meters give directly: `DistrictHeatingWater`
 * and `DistrictCooling` are heat moved across the zone boundary at a notional
 * 100 %, which is the output side both definitions ask for, with the outdoor
 * air the ideal unit conditions already in them. So the priced channels stay
 * out of this the way they stay out of `shapeKey`: what the plant costs to
 * meet this demand is the bill's question, and it is answered there.
 *
 * Every field comes back null rather than zero where the meter behind it was
 * never requested, which is what a bypassed System looks like from here: the
 * caller draws an em dash and leaves the row out of anything it sums. The
 * meters' own presence is the gate, so nothing here has to be told which
 * channels were in the path.
 *
 * Which environments count is the caller's question, not this function's —
 * the same division `meterTotal` already makes, and the reason the sweep and
 * the results schedule can read the same arithmetic over different sets.
 */
export function demandOver(eso, environments, floorArea) {
  if (!(floorArea > 0) || !environments?.size) return null;

  // The meter names come from the end-use declaration rather than being
  // typed again here, because `bill.js` is where they are kept true against
  // the version — `Heating:DistrictHeatingWater` was `Heating:DistrictHeating`
  // not many releases ago. A name that is not in that declaration is a
  // programming error and says so rather than reading as an absent meter.
  const kwhOf = (id) => {
    const use = END_USES.find((u) => u.id === id);
    if (!use) throw new Error(`no end use is called "${id}"`);
    const joules = meterTotal(eso, use.meter, environments);
    return joules == null ? null : (joules * J_TO_KWH) / floorArea;
  };
  return { tedi: kwhOf('heating'), cedi: kwhOf('cooling') };
}

/**
 * The demand intensities of a whole run, for a desk with ideal loads in the
 * path and a year to read them over.
 *
 * The billed environments and nothing else, by the bill's rule: sizing days
 * kept on the Run strip accumulate into the same meters, and forty-eight
 * hours of the most extreme weather in the file has no business in an
 * intensity. This is what the sweep reads at every sample, so the sheet's own
 * reading of the desk it is standing on goes through it too.
 */
export function readDemand(eso, floorArea) {
  const zr = zoneRuns(eso);
  const year = zr ? zr.runs.filter((r) => r.kind === null) : [];
  if (!year.length) return null;
  return demandOver(eso, new Set(year.map((r) => r.key)), floorArea);
}

/* ══ what the engine made of the assembly ════════════════════════════════ */

/**
 * The window's own performance, as EnergyPlus computed it.
 *
 * The layered model is the one place on this desk where a control does not
 * state a result: you set panes, a coating and a cavity, and what comes out is
 * a U-factor and an SHGC nobody typed. Those numbers exist — the engine
 * computes them at get-input and prints them in the Envelope Summary — so the
 * sheet reads them back rather than leaving the reader to a product catalogue.
 *
 * The tabular report is the only route to them. The .eio carries the same
 * figures under `WindowConstruction`, and would be the cheaper parse, but the
 * engine hands back the .eso, .mtr, .rdd, .mdd, .csv and eplustbl.htm and no
 * .eio at all; the .sql holds them too and costs a further dependency to open.
 * So the htm is parsed, and parsed by *column head* rather than by position —
 * the table has grown columns between versions (the NFRC assembly trio is
 * newer than the glass one) and an index counted out here would silently read
 * the wrong one the next time it does.
 *
 * Read for a named construction rather than off the table's own "Total or
 * Average" row, which is area-weighted across every exterior opening in the
 * building — with rooflights on their own glass that average is of two
 * different windows and is a number no assembly has. Every surface built of
 * one construction reports the same three figures, so the first row carrying
 * the name is the assembly, exactly.
 *
 * Returns null when the run produced no tabular report (a fatal, or a study
 * sample run under a lean reporting profile) or when the construction glazes
 * nothing — a window that is not in the building has no performance, and an
 * em dash is what says so.
 */
export function glassProperties(html, construction) {
  const rows = fenestrationRows(html);
  if (!rows) return null;
  const [head, ...body] = rows;
  const at = (row, column) => {
    const i = head.indexOf(column);
    // Not a missing reading — a table this reader no longer understands. It
    // throws rather than returning null, because a silent null here would
    // letter an em dash on the sheet and look exactly like a window that was
    // not built.
    if (i < 0) throw new Error(`the exterior fenestration table has no "${column}" column`);
    // An empty cell and a lone hyphen are both EnergyPlus saying it has no
    // figure here, and `Number('')` is 0 — which would print a U-factor of
    // zero over a window whose assembly the engine declined to compute.
    const text = row[i] ?? '';
    if (!text || text === '-') return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };

  const wanted = construction.toUpperCase();
  const row = body.find((r) => (r[head.indexOf('Construction')] ?? '').toUpperCase() === wanted);
  if (!row) return null;

  return {
    u: at(row, 'Glass U-Factor [W/m2-K]'),
    shgc: at(row, 'Glass SHGC'),
    vt: at(row, 'Glass Visible Transmittance'),
    // The whole window including its frame, by the NFRC method. EnergyPlus
    // fills these only when the opening carries a `WindowProperty:FrameAndDivider`
    // — with no frame there is nothing for the glass figures to be corrected
    // against, and the three cells arrive empty rather than repeating the glass.
    assembly: {
      u: at(row, 'Assembly U-Factor [W/m2-K]'),
      shgc: at(row, 'Assembly SHGC'),
      vt: at(row, 'Assembly Visible Transmittance'),
    },
  };
}

/**
 * The Envelope Summary's exterior fenestration table, as rows of trimmed cells.
 *
 * The comment is what is matched rather than the visible heading, since
 * "Exterior Fenestration" is also the prefix of "Exterior Fenestration Shaded
 * State" a few tables further down.
 */
function fenestrationRows(html) {
  return tableRows(html, 'Envelope Summary_Entire Facility_Exterior Fenestration');
}

/* ══ the flows ═══════════════════════════════════════════════════════════ */

/**
 * The rows of one tabular report table, by the `FullName` comment naming it.
 *
 * A regex parse rather than `DOMParser`, because this module is DOM-free on
 * purpose — the harnesses that check these readers run in Node. The report is
 * machine-written and its markup is accordingly rigid: one `<table>` after the
 * `FullName` comment that names the table, `<tr>` per row, `<td>` per cell, no
 * nesting.
 *
 * The marker is a parameter because there is more than one caller now: the
 * envelope summary's fenestration table, and the component load summary's six
 * tables per zone, of which the drawing reads four. It was written twice for
 * about a week; one copy is the whole of it.
 */
function tableRows(html, fullName) {
  if (!html) return null;
  const marker = `<!-- FullName:${fullName}-->`;
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('<table', at);
  const end = html.indexOf('</table>', start);
  if (start < 0 || end < 0) return null;
  return [...html.slice(start, end).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) =>
      cell[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()),
  );
}

/**
 * A cell that EnergyPlus left blank is not a zero.
 *
 * The component tables are ragged on purpose: a wall has no instant column, a
 * roof has no latent one, and the report writes `&nbsp;` in both. `Number('')`
 * is 0, and a zero drawn where the engine declined to compute anything is the
 * trap `glassProperties` already documents — here it would put a ribbon of no
 * width under a component name and read as "this contributed nothing", which is
 * a different statement from "this column does not apply".
 */
const cellValue = (text) => {
  const trimmed = (text ?? '').trim();
  if (!trimmed || trimmed === '-') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/** The component rows, in the report's own order, minus the ones that are all absent. */
function componentRows(html, zoneName, half) {
  const rows = tableRows(html, `Zone Component Load Summary_${zoneName}_Estimated ${half} Peak Load Components`);
  if (!rows || rows.length < 2) return null;
  const [head, ...body] = rows;

  // By column head rather than by position, for the reason `glassProperties`
  // gives: this table has grown columns between versions — Sensible - Return
  // Air sits between Delayed and Latent and was not always there — and a
  // counted index would silently read the wrong one the next time it moves.
  const at = (row, column) => {
    const i = head.indexOf(column);
    // A table this reader no longer understands is not a missing reading. It
    // throws, so the drawing refuses whole rather than lettering a zero.
    if (i < 0) throw new Error(`the ${half.toLowerCase()} component table has no "${column}" column`);
    return cellValue(row[i]);
  };

  const components = [];
  let grand = null;
  for (const row of body) {
    const label = row[0] ?? '';
    if (!label) continue;
    const entry = {
      label,
      instant: at(row, 'Sensible - Instant [W]'),
      delayed: at(row, 'Sensible - Delayed [W]'),
      returnAir: at(row, 'Sensible - Return Air [W]'),
      latent: at(row, 'Latent [W]'),
      total: at(row, 'Total [W]'),
      area: at(row, 'Related Area [m2]'),
    };
    // The grand total is the report's own checksum and is kept apart from the
    // components. Summed in with them it would double the diagram.
    if (/^grand total$/i.test(label)) grand = entry;
    else components.push(entry);
  }
  return { components, grand };
}

/** One peak's conditions, as a lookup by the report's own row labels. */
function peakConditions(html, zoneName, half) {
  const rows = tableRows(html, `Zone Component Load Summary_${zoneName}_${half} Peak Conditions`);
  if (!rows) return null;
  const found = new Map();
  for (const row of rows) if (row[0]) found.set(row[0], row[1]);
  return found;
}

/**
 * `7/21 15:30:00` — the sizing peak, which is not an hour of the run.
 *
 * Kept as the report's own fields rather than resolved to an index into the
 * ESO, and that is the whole point: this instant is sub-hourly, it falls on a
 * design day, and when the weather picker has set `sizingPeriods = 'No'` that
 * day is not among the run's environments at all. There is nothing to resolve
 * it against, so the drawing letters it as the report states it and says which
 * calculation it came from.
 */
function peakStamp(conditions) {
  const raw = conditions?.get('Time of Peak Load');
  const found = /^(\d+)\/(\d+)\s+(\d+):(\d+)/.exec(raw ?? '');
  if (!found) return null;
  const [, month, day, hour, minute] = found.map(Number);
  return {
    month,
    day,
    hour,
    minute,
    text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}, ${day} ${MONTHS[month - 1]}`,
  };
}

/**
 * The component load decomposition, read off the tabular report.
 *
 * Returns `{ heating, cooling }`, either half null when the run did not carry
 * it — a study sample under a lean profile, a desk with System out, a fatal
 * before the tables were written. Null rather than an empty decomposition, so
 * the drawing refuses that mode with a reason instead of drawing nothing and
 * letting the reader conclude the loads were zero.
 *
 * Each half carries the report's own residual. That is not decoration: the
 * delayed column is an estimate from the decay curves rather than a measured
 * flow, and EnergyPlus publishes the difference between its estimate and the
 * peak it actually computed. A diagram that balanced by construction would hide
 * both facts, so the residual is drawn.
 */
export function componentLoads(html, zoneName) {
  const half = (name) => {
    const rows = componentRows(html, zoneName, name);
    if (!rows) return null;
    const conditions = peakConditions(html, zoneName, name);
    const number = (label) => cellValue(conditions?.get(label));
    return {
      components: rows.components,
      grand: rows.grand,
      at: peakStamp(conditions),
      peak: number('Peak Sensible Load [W]'),
      estimated: number('Estimated Instant + Delayed Sensible Load [W]'),
      // The report's own error term, signed as it publishes it.
      residual: number('Difference Between Peak and Estimated Sensible Load [W]'),
      outdoorC: number('Outside Dry Bulb Temperature [C]'),
      zoneC: number('Zone Dry Bulb Temperature [C]'),
      supplyC: number('Supply Air Temperature [C]'),
    };
  };
  const heating = half('Heating');
  const cooling = half('Cooling');
  return heating || cooling ? { heating, cooling } : null;
}

/**
 * Every series the flow drawing reads, looked up once per run.
 *
 * `readMeters` re-scans the ESO for each rail term on every reading, which is
 * four `findVariables` sweeps per frame and has never mattered at that size.
 * The drawing adds ten more series and is re-lettered on every frame of a plate
 * drag, so the lookup is hoisted here and cached on the ESO's identity by the
 * caller — the same arrangement `offersFor` uses, and for the same reason.
 */
export function flowSeries(eso) {
  const series = new Map();
  const take = (variable) => {
    if (series.has(variable)) return;
    const points = hourly(eso, exactly(variable));
    series.set(variable, points.length ? points : null);
  };
  for (const tributary of TRIBUTARIES) {
    for (const term of tributary.terms) take(term.variable);
  }
  return series;
}

/**
 * What each tributary reads at one instant, as plain watts.
 *
 * Absent is null and never zero, in two different ways that both matter: a
 * series the run never carried (its channel was out of the path) and a series
 * that is shorter than the reading index (which should not happen, and is
 * refused rather than read past the end).
 */
export function flowsAt(series, at, { multiplier = 1, span = null } = {}) {
  const read = (tributary) => {
    let total = 0;
    for (const term of tributary.terms) {
      const points = series.get(term.variable);
      // A series that does not span the same hours as the one the instant was
      // chosen in cannot be indexed by the same `at`, and an off-by-one here
      // would letter one hour's watts under another hour's stamp. The same
      // guard `findInstant` keeps, for the same reason: refused rather than
      // read, because a wrong number is worse than a missing one.
      if (span != null && points != null && points.length !== span) return null;
      const point = points?.[at];
      if (!point) return null;
      total += (term.sign * point.value) / (term.perBuilding ? multiplier : 1);
    }
    return total;
  };
  const flows = new Map();
  for (const tributary of TRIBUTARIES) flows.set(tributary.id, read(tributary));
  return flows;
}
