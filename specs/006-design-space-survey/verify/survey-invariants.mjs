/**
 * Gate 1 of quickstart.md: the survey answers without a browser.
 *
 * `survey.js` is DOM-free, engine-free and network-free by the rule
 * `readings.js`, `describe.js` and `tm59.js` already follow, so this calls the
 * real functions rather than a copy of them. Nothing here runs EnergyPlus:
 * the readings are fabricated, because what is under test is the arithmetic
 * over a ground, not the ground.
 *
 * The five invariants are contracts/survey-module.md's, and the one worth
 * naming is the fourth. `contoursOf` and `meshOf` are two projections of one
 * lattice and one mask, and the whole reason they share those is that two
 * drawings of one ground must not be able to disagree about its shape. That is
 * only true if it is checked.
 */

import {
  COARSE_GRID,
  FINE_GRID,
  Gap,
  READING_BY_ID,
  SpotHeight,
  axisFor,
  contoursOf,
  coverageOf,
  fallStep,
  freeExchange,
  improvingRegion,
  landPoint,
  latticeOf,
  levelsFor,
  makeSurvey,
  meshOf,
} from '../../../src/survey.js';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const throws = (label, fn, wanted) => {
  try {
    fn();
    failures += 1;
    console.log(`  FAIL ${label} — it did not throw`);
  } catch (failure) {
    const hit = !wanted || failure.message.includes(wanted);
    if (!hit) failures += 1;
    console.log(`  ${hit ? 'ok  ' : 'FAIL'} ${label}${hit ? '' : ` — threw "${failure.message}"`}`);
  }
};

const stance = { ...DEFAULT_PARAMETERS };
const patch = { ...DEFAULT_BYPASS };
const reading = READING_BY_ID.high;

/** A ground with a stated surface on it, so every figure is predictable. */
function ground({ count = COARSE_GRID, surface, holes = [] } = {}) {
  const sv = makeSurvey({
    x: axisFor('wwrS', { count, stance }),
    y: axisFor('wallR', { count, stance }),
    readings: [reading],
    stance,
    patch,
    annual: false,
  });
  for (let iy = 0; iy < sv.y.count; iy += 1) {
    for (let ix = 0; ix < sv.x.count; ix += 1) {
      if (holes.some(([hx, hy]) => hx === ix && hy === iy)) {
        landPoint(sv, { ix, iy, sample: null, reason: 'The run did not complete.' });
        continue;
      }
      landPoint(sv, {
        ix,
        iy,
        sample: { readings: { extremes: { high: surface(ix, iy), low: 0 } } },
        cacheKey: `run:${ix},${iy}`,
      });
    }
  }
  return sv;
}

console.log('survey invariants (gate 1, SC-003)');

/* ── 1. no figure originates anywhere but a SpotHeight ─────────────────── */
{
  // A plane, so every reading is a distinct number and a substituted one would
  // be visible rather than coincidentally right.
  const sv = ground({ count: FINE_GRID, surface: (ix, iy) => 20 + ix * 1.37 + iy * 0.61 });
  const spots = sv.spots();
  ok('at least 50 measured points are audited', spots.length >= 50, `${spots.length} points`);

  const traced = spots.every((spot) => spot instanceof SpotHeight && spot.cacheKey);
  ok('every spot height carries the identity of the run behind it', traced);

  const wanted = spots.every(
    (spot) => reading.valueOf(spot.readings) === 20 + spot.ix * 1.37 + spot.iy * 0.61,
  );
  ok('every figure is the run\'s own, not an interpolation of its neighbours', wanted);

  // The lattice is the one representation both drawings consume, so the same
  // statement has to hold of it.
  const lattice = latticeOf(sv, reading);
  let latticeOk = true;
  for (let iy = 0; iy < lattice.ny; iy += 1) {
    for (let ix = 0; ix < lattice.nx; ix += 1) {
      const at = ix + iy * lattice.nx;
      if (!lattice.mask[at]) continue;
      if (Math.abs(lattice.values[at] - (20 + ix * 1.37 + iy * 0.61)) > 1e-12) latticeOk = false;
    }
  }
  ok('the lattice carries the measured figures unchanged', latticeOk);
}

/* ── 2. no triangle touches a gap or an unsurveyed position ────────────── */
{
  const holes = [[2, 2], [0, 4], [4, 0]];
  const sv = ground({ count: COARSE_GRID, surface: (ix, iy) => 20 + ix + iy, holes });
  const lattice = latticeOf(sv, reading);
  const mesh = meshOf(lattice);
  let clean = true;
  for (let i = 0; i < mesh.indices.length; i += 1) {
    if (!mesh.measuredFlags[mesh.indices[i]]) clean = false;
  }
  ok('no triangle references an unmeasured vertex', clean);

  // The stronger statement, and the one FR-016 actually asks for: a *cell* one
  // of whose corners is a gap is not emitted at all, so nothing spans a gap.
  let spans = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const corners = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    for (const [hx, hy] of holes) {
      const at = hx + hy * lattice.nx;
      if (corners.includes(at)) spans += 1;
    }
  }
  ok('no triangle touches a gap', spans === 0, `${spans} do`);

  // And the count is what a holed grid should give rather than merely "fewer",
  // counted rather than assumed: the axis carries the stance's own value as a
  // position of its own, so a survey asked for five positions legitimately
  // holds six, and an expected figure written as a literal here would be
  // testing the harness's arithmetic instead of the mesh's.
  let expected = 0;
  for (let cy = 0; cy < lattice.ny - 1; cy += 1) {
    for (let cx = 0; cx < lattice.nx - 1; cx += 1) {
      const corners = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]];
      if (corners.every(([hx, hy]) => !holes.some(([gx, gy]) => gx === hx && gy === hy))) expected += 1;
    }
  }
  ok(
    'the mesh is short by exactly the cells the holes cover',
    mesh.cells === expected,
    `${mesh.cells} cells against ${expected} whole ones on a ${sv.density} ground`,
  );
}

/* ── 3. coverage sums on every reachable lattice ───────────────────────── */
{
  for (const count of [2, 3, COARSE_GRID, 7, FINE_GRID]) {
    const sv = makeSurvey({
      x: axisFor('wwrS', { count, stance }),
      y: axisFor('wallR', { count, stance }),
      readings: [reading],
      stance,
      patch,
      annual: false,
    });
    // Part measured, part gap, part untouched — the only interesting shape.
    let filled = 0;
    for (let iy = 0; iy < sv.y.count; iy += 1) {
      for (let ix = 0; ix < sv.x.count; ix += 1) {
        if ((ix + iy) % 3 === 0) continue;
        if ((ix + iy) % 3 === 1) landPoint(sv, { ix, iy, sample: null, reason: 'The run did not complete.' });
        else landPoint(sv, { ix, iy, sample: { readings: { extremes: { high: 20, low: 0 } } } });
        filled += 1;
      }
    }
    const coverage = coverageOf(sv);
    ok(
      `coverage sums on a ${sv.density} ground`,
      coverage.measured + coverage.gaps + coverage.unsurveyed === coverage.wanted &&
        coverage.measured + coverage.gaps === filled,
      `${coverage.measured}+${coverage.gaps}+${coverage.unsurveyed} against ${coverage.wanted}`,
    );
  }
}

/* ── 4. every contour segment lies inside an emitted cell ──────────────── */
{
  // A saddle in the middle, which is where the two drawings are most likely to
  // part company and where the reading a survey exists for actually is.
  const sv = ground({
    count: FINE_GRID,
    surface: (ix, iy) => 20 + (ix - 4) * (ix - 4) * 0.3 - (iy - 4) * (iy - 4) * 0.3,
    holes: [[1, 1], [6, 6]],
  });
  const lattice = latticeOf(sv, reading);
  const mesh = meshOf(lattice);
  const emitted = new Set();
  for (let t = 0; t < mesh.indices.length; t += 6) {
    const bl = mesh.indices[t];
    emitted.add(`${bl % lattice.nx},${Math.floor(bl / lattice.nx)}`);
  }
  let outside = 0;
  let segments = 0;
  for (const { segments: lines } of contoursOf(lattice, levelsFor(lattice))) {
    for (const [a, b] of lines) {
      segments += 1;
      // Asked as containment rather than by flooring a coordinate. A segment's
      // endpoints sit on cell *edges*, so where the level passes exactly
      // through a corner both ends land on an integer and a floored minimum
      // names the cell next door — which failed exactly once in 105 segments
      // and would have been read as a defect in `contoursOf` rather than in
      // this test.
      const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
      const hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      const inside = [...emitted].some((cell) => {
        const [cx, cy] = cell.split(',').map(Number);
        return lo[0] >= cx - 1e-9 && hi[0] <= cx + 1 + 1e-9 && lo[1] >= cy - 1e-9 && hi[1] <= cy + 1 + 1e-9;
      });
      if (!inside) outside += 1;
    }
  }
  ok('the ground carries contours at all', segments > 20, `${segments} segments`);
  ok(
    'every contour segment lies inside a cell the mesh emitted',
    outside === 0,
    `${outside} of ${segments} do not`,
  );

  // The saddles are resolved consistently, which is what stops contours
  // crossing themselves at exactly the position the interesting reading is at.
  // Run twice: the resolution is by the cell's own mean and must not depend on
  // anything else, so two calls give byte-identical output.
  const once = JSON.stringify(contoursOf(lattice, levelsFor(lattice)));
  const twice = JSON.stringify(contoursOf(lattice, levelsFor(lattice)));
  ok('the saddle resolution is deterministic', once === twice);
}

/* ── 5. the descent never goes uphill, always stops, and cannot oscillate  */
{
  // A bowl with its floor off-centre, so the descent has somewhere to go.
  const sv = ground({ count: FINE_GRID, surface: (ix, iy) => 20 + (ix - 5) ** 2 + (iy - 3) ** 2 });
  let at = sv.cutAt;
  ok('the stance is a measured position on its own ground', Boolean(at) && Boolean(sv.spotAt(at.ix, at.iy)));
  const visited = new Set([`${at.ix},${at.iy}`]);
  let last = reading.valueOf(sv.spotAt(at.ix, at.iy).readings);
  let steps = 0;
  let stopped = null;
  while (steps < 200) {
    const next = fallStep(sv, at, { visited, reading });
    if (next.stopped) {
      stopped = next.stopped;
      break;
    }
    const value = reading.valueOf(next.readings);
    if (!(value < last)) {
      failures += 1;
      console.log(`  FAIL the descent stepped from ${last} to ${value}`);
      break;
    }
    last = value;
    at = { ix: next.ix, iy: next.iy };
    visited.add(`${at.ix},${at.iy}`);
    steps += 1;
  }
  ok('the descent never returns a point worse than the one it was given', steps < 200);
  ok('the descent stops, and says why', Boolean(stopped), String(stopped));
  ok('it reaches the floor of the bowl', last === 20, `landed at ${last}`);

  // Two positions carrying the identical reading is the oscillation shape, and
  // it is not hypothetical: a plateau at the floor of a hollow is common.
  const flat = ground({ count: COARSE_GRID, surface: () => 20 });
  const start = flat.cutAt;
  const step = fallStep(flat, start, { visited: new Set([`${start.ix},${start.iy}`]), reading });
  ok('a flat ground stops rather than stepping for ever', Boolean(step.stopped), String(step.stopped));
}

/* ── 6. declaration errors throw at the moment they are made ───────────── */
{
  throws(
    'the same control on both axes',
    () =>
      makeSurvey({
        x: axisFor('wwrS', { count: 5, stance }),
        y: axisFor('wwrS', { count: 5, stance }),
        readings: [reading],
        stance,
        patch,
      }),
    'A ground cut along one control twice',
  );
  throws(
    'three readings',
    () =>
      makeSurvey({
        x: axisFor('wwrS', { count: 5, stance }),
        y: axisFor('wallR', { count: 5, stance }),
        readings: [reading, READING_BY_ID.low, READING_BY_ID.tedi],
        stance,
        patch,
      }),
    'one or two readings',
  );
  throws('no readings at all', () =>
    makeSurvey({
      x: axisFor('wwrS', { count: 5, stance }),
      y: axisFor('wallR', { count: 5, stance }),
      readings: [],
      stance,
      patch,
    }),
  );
  throws('an axis on a priced channel', () => axisFor('heatEfficiency', { count: 5, stance }), 'prices the run');
  throws('an axis with no numeric face', () => axisFor('occPattern', { count: 5, stance }), 'no face to');
  throws('an extent outside the control\'s own range', () => axisFor('wwrS', { from: -1, count: 5, stance }), 'extent is -1');
  throws('an extent that is not an extent', () => axisFor('wwrS', { from: 0.5, to: 0.5, count: 5, stance }), 'not an extent');
  throws('a gap with no reason', () => new Gap({ ix: 0, iy: 0, reason: '  ' }), 'carries no reason');
  throws('a spot height with no readings', () => new SpotHeight({ ix: 0, iy: 0, x: 0, y: 0, readings: null }), 'is a gap');
}

/* ── 7. FR-005: the stance is always a measured position ───────────────── */
{
  // Not at a grid position of its own: `wwrS` defaults to 0.35 against a
  // 0-to-0.9 extent in five steps, which lands nowhere near it.
  const sv = ground({ count: COARSE_GRID, surface: (ix, iy) => 20 + ix + iy });
  const at = sv.cutAt;
  ok(
    'the stance has a position on the ground even off the grid',
    Boolean(at),
    JSON.stringify({ x: stance.wwrS, positions: sv.x.positions }),
  );
  ok('and it is measured', Boolean(at && sv.spotAt(at.ix, at.iy)));
  ok(
    'the stance position is the desk\'s own value, not its nearest neighbour',
    sv.x.positions[at.ix] === stance.wwrS && sv.y.positions[at.iy] === stance.wallR,
  );
}

/* ── 8. the readings that need a direction refuse where there is none ──── */
{
  // Every declared reading has a direction today, so this is asserted from the
  // other end: a reading whose direction were removed must refuse rather than
  // pick one, and `improves` is the one gate every such path goes through.
  const directionless = Object.create(Object.getPrototypeOf(reading));
  Object.assign(directionless, reading, { better: null, senseWhy: null });
  throws(
    'a reading with no declared direction refuses to rank two designs',
    () => directionless.improves(1, 2),
    'declares no improving direction',
  );
}

/* ── 9. the free exchange refuses rather than inventing precision ──────── */
{
  // Ground that turns sharply under a coarse lattice: the linear answer would
  // arrive to four figures and be about nothing.
  const shoulder = (ix, iy) => 20 + 8 * Math.tanh(ix - 2) + iy * 0.05;
  const coarse = ground({ count: COARSE_GRID, surface: shoulder });
  const answer = freeExchange(coarse, coarse.cutAt, reading);
  ok(
    'an exchange that would leave the measured ground is refused rather than stated',
    Boolean(answer.refusal),
    JSON.stringify({ dx: answer.dx, dy: answer.dy, tolerance: answer.tolerance }),
  );
  ok(
    'and the refusal says what would fix it',
    Boolean(answer.refusal?.includes('refine') || answer.refusal?.includes('Widen')),
    String(answer.refusal),
  );

  const plane = ground({ count: FINE_GRID, surface: (ix, iy) => 20 + 2 * ix + 4 * iy });
  const on = freeExchange(plane, plane.cutAt, reading);
  ok('an exchange on a dense lattice is stated', !on.refusal && Number.isFinite(on.dy), JSON.stringify(on));
  // On a plane the second-order term is exactly zero, so the tolerance is too,
  // and the level line's slope is exactly -fx/fy.
  ok('and its tolerance on a plane is exactly zero', on.tolerance === 0, String(on.tolerance));
}

/* ── 10. the improving region names measured points and no optimum ─────── */
{
  const sv = ground({ count: FINE_GRID, surface: (ix, iy) => 20 + (ix - 5) ** 2 + (iy - 3) ** 2 });
  const region = improvingRegion(sv, sv.cutAt);
  ok('the improving region is non-empty on a bowl', region.spots.length > 0);
  ok('and every member of it is a measured spot height', region.spots.every((s) => s instanceof SpotHeight));
  const here = sv.spotAt(sv.cutAt.ix, sv.cutAt.iy);
  const base = reading.valueOf(here.readings);
  ok(
    'and every member actually improves on the stance',
    region.spots.every((s) => reading.valueOf(s.readings) < base),
  );
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
