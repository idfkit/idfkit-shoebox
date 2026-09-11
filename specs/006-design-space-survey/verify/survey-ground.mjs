/**
 * Gate 2 of quickstart.md: the ground is built of runs, and gaps stay gaps.
 *
 * This one runs EnergyPlus. A 5 x 5 ground is built under Node the way the
 * browser builds one — `rowsFor` gives the row specs, each row is `job.snapshot`
 * with axis Y fixed, and each sample is the snapshot with axis X overlaid —
 * so what is under test is that the survey's own arithmetic and the model's
 * agree about which building each position is.
 *
 * At about 1.8 s a run (one process each, see `engine.mjs`) a full ground is
 * around a minute. The failure-injection half costs nothing: a run is not
 * attempted at all, which is precisely the point — a gap is what the survey
 * does with a run it did not get.
 */

import { writeIdf } from '@idfkit/core';
import { parseESO } from '@idfkit/engine';
import { localBundle } from '@idfkit/schemas/node';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel } from '../../../src/model.js';
import { readExtremes } from '../../../src/readings.js';
import {
  COARSE_GRID,
  Gap,
  READING_BY_ID,
  SpotHeight,
  axisFor,
  coverageOf,
  landPoint,
  latticeOf,
  makeSurvey,
  meshOf,
  rowsFor,
} from '../../../src/survey.js';
import { runIdf } from './engine.mjs';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const schema = await localBundle().load('26.1.0');
const model = buildModel(schema);
const stance = { ...DEFAULT_PARAMETERS };
const patch = { ...DEFAULT_BYPASS };
const reading = READING_BY_ID.high;

/** The run contents a study job asserts, reduced to what this harness needs. */
const contents = { serialize: () => 'survey-harness', answers: () => true, size: 0 };

function cut(count = COARSE_GRID) {
  return makeSurvey({
    x: axisFor('wwrS', { count, stance }),
    y: axisFor('wallR', { count, stance }),
    readings: [reading],
    stance,
    patch,
    annual: false,
  });
}

/**
 * Measure one ground, optionally refusing to run some of its positions.
 *
 * `refuse(ix, iy)` standing in for a failed engine run rather than for a
 * corrupted one, because that is the shape the scheduler actually hands up: a
 * failed sample is a gap, never a cached fact, so what reaches `landPoint` is
 * a null sample and a reason.
 */
function measure(sv, { refuse = () => false } = {}) {
  const rows = rowsFor(sv, { needed: contents, carried: contents, restShape: 'rest' });
  let runs = 0;
  for (const row of rows) {
    for (let ix = 0; ix < row.points.length; ix += 1) {
      if (refuse(ix, row.iy)) {
        landPoint(sv, { ix, iy: row.iy, sample: null, reason: 'The run was refused by the harness.' });
        continue;
      }
      // Exactly what `buildSample` does: the row's own whole-desk snapshot
      // with the swept key overlaid, applied, written and read.
      applyModel(model, { ...row.snapshot, [row.key]: row.points[ix] }, row.patch);
      const result = runIdf({ idf: writeIdf(model) });
      runs += 1;
      if (!result.success || !result.eso) {
        landPoint(sv, { ix, iy: row.iy, sample: null, reason: `The run exited ${result.exit}.` });
        continue;
      }
      const extremes = readExtremes(parseESO(result.eso));
      landPoint(sv, {
        ix,
        iy: row.iy,
        sample: extremes ? { readings: { extremes } } : null,
        reason: extremes ? null : 'The run completed but carried no zone temperature series.',
        cacheKey: `${row.id}:${ix}`,
      });
    }
  }
  return runs;
}

console.log('the ground is built of runs (gate 2, SC-010)');

/* ── every spot height traces to a completed run ───────────────────────── */
{
  const sv = cut();
  const runs = measure(sv);
  const coverage = coverageOf(sv);
  console.log(`  ${runs} runs over a ${sv.density} ground`);

  ok('every position was measured', coverage.measured === coverage.wanted, JSON.stringify(coverage));
  ok('coverage sums', coverage.measured + coverage.gaps + coverage.unsurveyed === coverage.wanted);
  ok(
    'every spot height carries the identity of the run behind it',
    sv.spots().every((spot) => spot instanceof SpotHeight && typeof spot.cacheKey === 'string'),
  );
  ok(
    'every spot height carries a finite reading',
    sv.spots().every((spot) => Number.isFinite(reading.valueOf(spot.readings))),
  );

  // The ground is a ground, not a plane: if every position read the same the
  // harness would be passing on a survey that measured nothing about the
  // building. More glazing on a south wall raises the peak, and more wall
  // resistance holds the heat in — both directions have to be visible.
  const values = sv.spots().map((spot) => reading.valueOf(spot.readings));
  ok('the ground has relief on it at all', Math.max(...values) - Math.min(...values) > 1, `range ${(Math.max(...values) - Math.min(...values)).toFixed(2)} °C`);
  const lo = sv.spotAt(0, 0);
  const hi = sv.spotAt(sv.x.count - 1, 0);
  ok(
    'and it runs the way the physics does: more south glazing, a higher peak',
    reading.valueOf(hi.readings) > reading.valueOf(lo.readings),
    `${reading.valueOf(lo.readings).toFixed(1)} at no glazing against ${reading.valueOf(hi.readings).toFixed(1)} at full`,
  );
}

/* ── injected failures become gaps, and stay gaps ──────────────────────── */
{
  const sv = cut();
  // Twenty positions refused, which on a 6 x 6 ground is most of it — the
  // point being that the survey continues rather than that a few holes are
  // tolerated.
  const refused = [];
  for (let iy = 0; iy < sv.y.count && refused.length < 20; iy += 1) {
    for (let ix = 0; ix < sv.x.count && refused.length < 20; ix += 1) {
      if ((ix * 7 + iy * 3) % 5 !== 0) continue;
      refused.push([ix, iy]);
    }
  }
  // Top up to twenty from whatever is left, so the count is the stated one.
  for (let iy = 0; iy < sv.y.count && refused.length < 20; iy += 1) {
    for (let ix = 0; ix < sv.x.count && refused.length < 20; ix += 1) {
      if (!refused.some(([rx, ry]) => rx === ix && ry === iy)) refused.push([ix, iy]);
    }
  }
  const isRefused = (ix, iy) => refused.some(([rx, ry]) => rx === ix && ry === iy);
  measure(sv, { refuse: isRefused });

  const coverage = coverageOf(sv);
  ok('twenty positions were refused', refused.length === 20);
  ok('and twenty gaps were recorded', coverage.gaps === 20, `${coverage.gaps} gaps`);
  ok('coverage still sums', coverage.measured + coverage.gaps + coverage.unsurveyed === coverage.wanted);
  ok(
    'every gap carries a reason',
    sv.gaps().every((gap) => gap instanceof Gap && gap.reason.trim().length > 0),
  );
  ok(
    'no gap was filled from a neighbour',
    refused.every(([ix, iy]) => sv.at(ix, iy) instanceof Gap),
  );

  // Structural rather than remembered: the geometry that would have covered a
  // gap is never generated, so there is no fill to leave out.
  const lattice = latticeOf(sv, reading);
  const mesh = meshOf(lattice);
  let touching = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let c = 0; c < 3; c += 1) {
      const at = mesh.indices[t + c];
      if (!isRefused(at % lattice.nx, Math.floor(at / lattice.nx))) continue;
      touching += 1;
    }
  }
  ok('no triangle touches a refused position', touching === 0, `${touching} do`);
  ok('the survey continued past the failures', coverage.measured > 0, `${coverage.measured} measured`);
}

/* ── a ground where everything failed says so ──────────────────────────── */
{
  const sv = cut();
  measure(sv, { refuse: () => true });
  const coverage = coverageOf(sv);
  ok('nothing is measured', coverage.measured === 0);
  ok('and every position is a gap carrying a reason', coverage.gaps === coverage.wanted);
  const lattice = latticeOf(sv, reading);
  ok('the lattice mask is empty', lattice.mask.every((flag) => flag === 0));
  ok('and the mesh has no cells at all, so there is no relief to draw', meshOf(lattice).cells === 0);
  // This is what the sheet letters, and the words matter as much as the count:
  // an empty relief with nothing said would read as a ground with nothing
  // interesting on it.
  ok(
    'the survey can state that it measured nothing, and why',
    coverage.measured === 0 && sv.gaps()[0].reason.length > 0,
    sv.gaps()[0]?.reason,
  );
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
