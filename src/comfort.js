/**
 * Comfort regions and adaptive bands for the plate's comfort views (spec 015).
 *
 * DOM-free, so the counts it returns can be checked against direct loops over
 * the hourly series in a Node harness (SC-003).
 *
 * Two families of published judgement live here:
 *
 *   - the ASHRAE 55-2020 §5.3.1 graphic comfort zones, drawn on the
 *     psychrometric view, generated into `comfort.data.js` by
 *     `scripts/build-comfort.mjs`;
 *   - the adaptive bands of EN 16798-1:2019 Annex B and ASHRAE 55-2020 §5.4,
 *     drawn on the adaptive comfort view and, at the 80 % limits, as the
 *     psychrometric view's second region.
 *
 * Both adaptive families are read against one running mean, TM59's recursion
 * run over the whole weather file (FR-013). ASHRAE 55-2020 §5.4.2.1 permits an
 * exponentially weighted running mean with α between 0.6 and 0.9, so TM52's
 * α = 0.8 serves both, and there is no second method to drift from the first.
 */

import { CATEGORY_BY_ID, dayNumber, occupied, runningMeanOver } from './tm59.js';
import { inside } from './psychro.js';
import { GRAPHIC_CITATION, GRAPHIC_ZONES } from './comfort.data.js';
import { FIGURE_531, pmv, vapour } from './pmv.js';
import { assessedHours, remember } from './views.js';

/* ══ the adaptive models ═════════════════════════════════════════════════ */

/**
 * One published adaptive band. `range` is where the running mean must lie for
 * each limit to apply; an hour whose running mean lies outside it is counted
 * as outside the method's scope and lettered apart, never clamped into the
 * band (FR-011a). That differs from TM59's clamp, which belongs to TM59.
 */
export class AdaptiveModel {
  constructor({ id, family, label, slope, intercept, upper, lower, range, citation, fold }) {
    Object.assign(this, { id, family, label, slope, intercept, upper, lower, citation, fold });
    this.range = Object.freeze({ ...range });
    Object.freeze(this);
  }
  neutral(trm) {
    return this.slope * trm + this.intercept;
  }
  upperAt(trm) {
    return this.neutral(trm) + this.upper;
  }
  lowerAt(trm) {
    return this.neutral(trm) + this.lower;
  }
  /** Whether each limit applies at a running mean. */
  judges(trm) {
    const { upperFrom, upperTo, lowerFrom, lowerTo } = this.range;
    return { upper: trm >= upperFrom && trm <= upperTo, lower: trm >= lowerFrom && trm <= lowerTo };
  }
}

/*
 * EN 16798-1:2019 Annex B, the adaptive method for buildings without
 * mechanical cooling: Θo = 0.33 Θrm + 18.8, upper limit applicable for
 * 10 < Θrm < 30 °C and lower limit for 15 < Θrm < 30 °C.
 *
 * The upper offsets for Categories I and II are TM59's, taken from
 * `tm59.CATEGORIES` so one published number has one source; Category III is
 * not a TM59 category and carries its own. The lower offsets and the lower
 * limit's 15 °C bound are transcribed here and are an open item (tasks.md
 * T029): they must be checked against the purchased text of EN 16798-1:2019
 * Annex B by the maintainer before merge. The text never enters the repository.
 */
const EN = {
  family: 'en16798',
  slope: 0.33,
  intercept: 18.8,
  range: { upperFrom: 10, upperTo: 30, lowerFrom: 15, lowerTo: 30 },
  fold:
    'Operative temperature against the exponentially weighted running mean of daily outdoor temperature ' +
    '(α = 0.8), the recursion TM59 uses. The upper limit applies for a running mean of 10 to 30 °C and ' +
    'the lower for 15 to 30 °C; an hour outside either is counted apart as outside the method’s scope, ' +
    'not clamped. The method is for spaces without mechanical cooling.',
};

const ASHRAE = {
  family: 'ashrae55',
  slope: 0.31,
  intercept: 17.8,
  range: { upperFrom: 10, upperTo: 33.5, lowerFrom: 10, lowerTo: 33.5 },
  fold:
    'Operative temperature against the prevailing mean outdoor temperature, taken as the same exponentially ' +
    'weighted running mean (α = 0.8, within the 0.6 to 0.9 §5.4.2.1 permits). Applicable for a prevailing ' +
    'mean of 10 to 33.5 °C, to occupant-controlled naturally conditioned spaces without mechanical cooling, ' +
    'occupants at 1.0 to 1.3 met and free to adapt clothing; hours outside the range are counted apart.',
};

export const ADAPTIVE_MODELS = Object.freeze([
  new AdaptiveModel({ ...EN, id: 'en1', label: 'EN 16798-1 Cat. I', upper: CATEGORY_BY_ID.I.k, lower: -3, citation: 'EN 16798-1:2019 Annex B, Category I' }),
  new AdaptiveModel({ ...EN, id: 'en2', label: 'EN 16798-1 Cat. II', upper: CATEGORY_BY_ID.II.k, lower: -4, citation: 'EN 16798-1:2019 Annex B, Category II' }),
  new AdaptiveModel({ ...EN, id: 'en3', label: 'EN 16798-1 Cat. III', upper: 4, lower: -5, citation: 'EN 16798-1:2019 Annex B, Category III' }),
  new AdaptiveModel({ ...ASHRAE, id: 'a80', label: 'ASHRAE 55 80 %', upper: 3.5, lower: -3.5, citation: 'ASHRAE 55-2020 §5.4.2, 80 % acceptability' }),
  new AdaptiveModel({ ...ASHRAE, id: 'a90', label: 'ASHRAE 55 90 %', upper: 2.5, lower: -2.5, citation: 'ASHRAE 55-2020 §5.4.2, 90 % acceptability' }),
]);

export const MODEL_BY_ID = Object.freeze(Object.fromEntries(ADAPTIVE_MODELS.map((m) => [m.id, m])));

/**
 * One published number, one source: each EN category TM59 also carries must
 * reach TM59's own threshold at three running means. Takes the lists so the
 * declarations harness can put a broken one through it.
 */
export function assertModels(models = ADAPTIVE_MODELS, categories = CATEGORY_BY_ID) {
  const pairs = { en1: 'I', en2: 'II' };
  for (const model of models) {
    const category = categories[pairs[model.id]];
    if (!category) continue;
    for (const trm of [10, 20, 30]) {
      const ours = model.upperAt(trm);
      const theirs = category.tmax(trm);
      if (Math.abs(ours - theirs) > 1e-9) {
        throw new Error(
          `${model.label}: its upper limit at a running mean of ${trm} °C is ${ours}, and TM59's ` +
            `${category.label} threshold is ${theirs}; one published number has two values`,
        );
      }
    }
  }
  return models;
}
assertModels();

/* ══ the psychrometric view's regions ════════════════════════════════════ */

export class ComfortRegion {
  constructor({ id, token, label, citation, fold }) {
    Object.assign(this, { id, token, label, citation, fold });
    Object.freeze(this);
  }
}

export const REGIONS = Object.freeze({
  graphic: new ComfortRegion({
    id: 'graphic',
    token: 'g',
    label: 'Graphic zones',
    citation: GRAPHIC_CITATION,
    fold:
      'The two zones are PMV −0.5 to +0.5 at 1.1 met, 0.1 m/s and 0.5 or 1.0 clo, bounded above at a humidity ' +
      'ratio of 12 g/kg, computed by the Appendix B procedure. Applicable at 1.0 to 1.3 met and air speed ' +
      'below 0.2 m/s. The zones are drawn against operative temperature, as the figure is, and an hour counts ' +
      'as inside when its operative temperature and humidity ratio both are; the marks stand at air temperature.',
  }),
  adaptive: new ComfortRegion({
    id: 'adaptive',
    token: 'a',
    label: 'Adaptive strip',
    citation: 'ASHRAE 55-2020 §5.4, 80 % acceptability',
    fold: ASHRAE.fold,
  }),
});

/** The graphic polygons, each [operative °C, humidity ratio g/kg]. */
export const GRAPHIC = GRAPHIC_ZONES;

/*
 * Figure 5.3.1 spot values: the corner temperatures at W = 0 and W = 12 g/kg
 * for each clo, read off the printed figure to its 0.5 K reading precision.
 * An open item (tasks.md T028): the values must be transcribed from the
 * maintainer's copy of the standard. Until they are, the structural checks
 * below still catch a swapped clo, a swapped sign or a zone of the wrong width.
 */
export const FIGURE_SPOTS = Object.freeze([]);

export function assertGraphic(zones = GRAPHIC, spots = FIGURE_SPOTS) {
  const corners = (polygon) => {
    const n = polygon.length / 2;
    return { warm0: polygon[0], warm12: polygon[n - 1], cold12: polygon[n], cold0: polygon.at(-1) };
  };
  const byClo = new Map(zones.map((z) => [z.clo, z]));
  if (!byClo.has(0.5) || !byClo.has(1)) throw new Error('the graphic comfort zones are 0.5 and 1.0 clo, and one is missing');
  for (const zone of zones) {
    const { warm0, warm12, cold12, cold0 } = corners(zone.polygon);
    if (warm0[1] !== 0 || cold0[1] !== 0 || warm12[1] !== 12 || cold12[1] !== 12) {
      throw new Error(`the ${zone.clo} clo comfort zone does not run from 0 to 12 g/kg`);
    }
    for (const [warm, cold] of [[warm0, cold0], [warm12, cold12]]) {
      const width = warm[0] - cold[0];
      if (!(width > 2.5 && width < 5.5)) {
        throw new Error(`the ${zone.clo} clo comfort zone is ${width.toFixed(2)} K wide at ${warm[1]} g/kg, not a PMV ±0.5 zone`);
      }
    }
    // Humid air feels warmer, so each edge leans to the cold side as W rises.
    if (!(warm12[0] < warm0[0] && cold12[0] < cold0[0])) {
      throw new Error(`the ${zone.clo} clo comfort zone leans the wrong way with humidity`);
    }
  }
  const light = corners(byClo.get(0.5).polygon);
  const heavy = corners(byClo.get(1).polygon);
  if (!(light.cold0[0] > heavy.cold0[0] && light.warm0[0] > heavy.warm0[0])) {
    throw new Error('the 0.5 clo comfort zone is not warmer than the 1.0 clo one, so the two are swapped');
  }
  // Every vertex must still be where the procedure put it: PMV +0.5 on the
  // warm edge and −0.5 on the cold one, to the 0.01 K the file is rounded to.
  // A zone shifted or edited by hand stops being the standard's and refuses.
  for (const zone of zones) {
    const n = zone.polygon.length / 2;
    zone.polygon.forEach(([t, W], i) => {
      const target = i < n ? 0.5 : -0.5;
      const at = (x) => pmv({ ta: x, tr: x, vel: FIGURE_531.speed, pa: vapour(W / 1000), met: FIGURE_531.met, clo: zone.clo });
      // PMV rises about 0.3 per kelvin here, so 0.01 K of rounding is ±0.004.
      if (Math.abs(at(t) - target) > 0.01) {
        throw new Error(
          `the ${zone.clo} clo comfort zone's vertex at ${t} °C, ${W} g/kg has a PMV of ${at(t).toFixed(3)}, ` +
            `not ${target}, so it is not the ASHRAE 55-2020 §5.3.1 zone`,
        );
      }
    });
  }
  for (const { clo, corner, t } of spots) {
    const got = corners(byClo.get(clo).polygon)[corner][0];
    if (Math.abs(got - t) > 0.5) {
      throw new Error(`the ${clo} clo comfort zone's ${corner} corner is ${got} °C, and Figure 5.3.1 reads ${t} °C`);
    }
  }
  return zones;
}
assertGraphic();

/* ══ the running mean over the whole file ════════════════════════════════ */

/**
 * TM59's recursion over the whole weather file: the first seven days the file
 * carries are the lead-in, and the first assessable day is the eighth. An hour
 * on a day the recursion does not reach is **unassessed**, never wrapped onto
 * the previous December, because the file is one year and not a cycle.
 *
 * Returns `{ mean, absence }`: the `RunningMean`, or the sentence saying why
 * there is none.
 */
export function yearRunningMean(dailyMeans, source = null) {
  if (!Array.isArray(dailyMeans)) return { mean: null, absence: 'The weather file carries no daily means.' };
  const first = dailyMeans.findIndex((v) => Number.isFinite(v)) + 1;
  if (first < 1) return { mean: null, absence: 'The weather file carries no daily means.' };
  let last = first;
  while (last < 365 && Number.isFinite(dailyMeans[last])) last += 1;
  const from = first + 7;
  if (last < from) return { mean: null, absence: 'The weather file carries under eight days.' };
  try {
    return { mean: runningMeanOver(dailyMeans, source, { from, to: last }), absence: null };
  } catch (error) {
    return { mean: null, absence: error.message };
  }
}

/* ══ the counts ══════════════════════════════════════════════════════════ */

/** The run's occupied hours, by TM59's test against the floor its schedule was written with, never `> 0`. */
function occupiedHours(run) {
  return remember(run, 'occupied', () => {
    const occupancy = run.series.get('occupancy');
    if (!occupancy) return null;
    const out = [];
    for (const i of assessedHours(run)) if (occupied(occupancy[i], run.facts.floor)) out.push(i);
    return Int32Array.from(out);
  });
}
export { occupiedHours };

/**
 * The share of occupied hours inside each graphic zone (FR-011a): an hour is
 * inside when its operative temperature and humidity ratio both are. Air
 * temperature is not used. Returns null where the run has no occupancy
 * series, which the view letters as an absence.
 */
export function graphicShares(run) {
  return remember(run, 'graphicShares', () => {
    const hours = occupiedHours(run);
    if (!hours) return null;
    const op = run.series.get('operative');
    const w = run.series.get('wZone');
    return GRAPHIC.map(({ clo, polygon }) => {
      let within = 0;
      let counted = 0;
      for (const i of hours) {
        if (!Number.isFinite(op[i]) || !Number.isFinite(w[i])) continue;
        counted += 1;
        if (inside(polygon, op[i], w[i])) within += 1;
      }
      return Object.freeze({ clo, inside: within, occupied: counted });
    });
  });
}

/**
 * Occupied hours against one adaptive model, in five counts that sum to the
 * occupied hours (FR-011a, FR-012): above, within and below the band, hours
 * on days the running mean does not reach (unassessed), and hours whose
 * running mean lies outside where a limit applies (out of scope).
 *
 * An hour whose running mean is in the upper limit's range but not the
 * lower's can still be judged above; not above, it cannot be judged within
 * or below and is out of scope.
 */
export function adaptiveCounts(run, model, trm) {
  const hours = occupiedHours(run);
  if (!hours) return null;
  const op = run.series.get('operative');
  const counts = { above: 0, within: 0, below: 0, unassessed: 0, outOfScope: 0, occupied: 0 };
  for (const i of hours) {
    if (!Number.isFinite(op[i])) continue;
    counts.occupied += 1;
    const t = run.points[i].timestamp;
    const mean = trm?.at(dayNumber({ month: t.month, day: t.day }));
    if (mean === null || mean === undefined) {
      counts.unassessed += 1;
      continue;
    }
    const applies = model.judges(mean);
    if (applies.upper && op[i] > model.upperAt(mean)) counts.above += 1;
    else if (!applies.upper || !applies.lower) counts.outOfScope += 1;
    else if (op[i] < model.lowerAt(mean)) counts.below += 1;
    else counts.within += 1;
  }
  return Object.freeze(counts);
}
