/**
 * Gate 6 of quickstart.md: the pull agrees with full sweeps (SC-005).
 *
 * On ten test desks, the pull's top three controls are swept as ordinary
 * studies and the ranking has to agree — **10 of 10, with no tolerance to
 * appeal to**. There is no noise floor here and none is admissible: the engine
 * is repeatable on one input, measured at twenty runs agreeing exactly in
 * `repeatability.mjs`, so every difference that comes back is real and a
 * disagreement is a defect rather than a margin.
 *
 * ## What "agree" means, stated before it is measured
 *
 * A one-sided step at the stance and a twenty-one point sweep across the whole
 * face are not the same measurement, and pretending they are would make this
 * gate either vacuous or impossible. The probe steps a twentieth of the face;
 * `samplePoints` lays its twenty-one positions on the control's own step grid,
 * and the probe's landing position is generally not one of them — measured,
 * `groundReflect` probes 0.20 to 0.25 against a sweep that never visits 0.25.
 * So "the same number twice" is not available and asking for it would be
 * asking the sweep a question it cannot answer.
 *
 * Three things a sweep *can* be asked, and all three are checked:
 *
 * 1. **The stance itself, exactly.** `samplePoints` keeps the current value in
 *    its list verbatim, so every sweep contains the stance, and the reading
 *    there must equal the pull's own `here` **exactly** — no tolerance, because
 *    the engine is repeatable on one input (twenty runs agreeing, measured in
 *    `repeatability.mjs`). This catches reading the wrong series, the wrong
 *    environment, or a probe built against the wrong desk.
 * 2. **The direction, exactly.** The sweep's own slope across the pair of
 *    positions bracketing the stance — the narrowest interval it offers, and
 *    therefore its closest independent estimate of the same local quantity —
 *    must carry the sign the pull reported.
 * 3. **The ranking, as a ranking.** SC-005 is about the order: the pull's top
 *    three, ranked by the sweeps' own local slopes, must come out in the same
 *    order. That is the claim the reader acts on when they choose two axes off
 *    the ranking, and it is what has to hold 10 of 10.
 *
 * ## Cost
 *
 * One process per run (see `engine.mjs`), so about 1.8 s each. Ten desks, the
 * probe set restricted to the controls that reach an object on that desk, plus
 * three 21-point sweeps per desk. Expect half an hour. It is run by hand.
 */

import { writeIdf } from '@idfkit/core';
import { parseESO } from '@idfkit/engine';
import { localBundle } from '@idfkit/schemas/node';
import { CHANNELS, DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel, channelState } from '../../../src/model.js';
import { readExtremes } from '../../../src/readings.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { samplePoints } from '../../../src/study.js';
import { entryFrom, pullProbes, rankPull } from '../../../src/pull.js';
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
const reading = READING_BY_ID.high;
const contents = { serialize: () => 'pull-harness', answers: () => true, size: 0 };

/** One run of one desk, read for the survey's own quantity. */
const cache = new Map();
function read(params, patch) {
  const key = JSON.stringify([params, patch]);
  if (cache.has(key)) return cache.get(key);
  applyModel(model, params, patch);
  const result = runIdf({ idf: writeIdf(model) });
  const value = result.success && result.eso ? reading.valueOf({ extremes: readExtremes(parseESO(result.eso)) }) : null;
  cache.set(key, value);
  return value;
}

/**
 * Ten desks, each a real position of the sliders rather than a random one.
 *
 * Random parameter sets would mostly be buildings nobody would draw, and the
 * ranking's failure modes are not uniformly distributed over the space: they
 * live where a control is at a stop, where a channel is out, and where a wall
 * carries no opening. So the desks are chosen to reach those.
 */
const DESKS = [
  { name: 'the default desk', params: {}, patch: {} },
  { name: 'a wide shallow box', params: { width: 24, depth: 6 }, patch: {} },
  { name: 'fully glazed south', params: { wwrS: 0.9 }, patch: {} },
  { name: 'no glazing at all', params: { wwrN: 0, wwrE: 0, wwrS: 0, wwrW: 0 }, patch: {} },
  { name: 'a heavy slab', params: { slabThick: 0.3, wallMass: 0.3 }, patch: {} },
  { name: 'a light envelope', params: { wallR: 0.5, roofR: 0.5 }, patch: {} },
  { name: 'wall resistance at its stop', params: { wallR: 10 }, patch: {} },
  { name: 'turned 40 degrees', params: { northAxis: 40 }, patch: {} },
  { name: 'Fabric patched out', params: {}, patch: { fabric: true } },
  { name: 'Glazing patched out', params: {}, patch: { glazing: true } },
];

console.log('the pull against full sweeps (gate 6, SC-005)');
console.log(`  ${DESKS.length} desks, top three each, no tolerance`);

let agreed = 0;
for (const desk of DESKS) {
  const params = { ...DEFAULT_PARAMETERS, ...desk.params };
  const patch = { ...DEFAULT_BYPASS, ...desk.patch };
  const state = channelState(params, patch);
  const engaged = [...state].filter(([, value]) => value.engaged).map(([id]) => id);

  const here = read(params, patch);
  if (here === null) {
    failures += 1;
    console.log(`  FAIL ${desk.name} — the stance itself would not solve`);
    continue;
  }

  const { probes, inert } = pullProbes(params, patch, {
    quantity: reading.quantity,
    engaged,
    annual: false,
    needed: contents,
    carried: contents,
  });

  // Inert controls cost no run at all, which is the saving FR-027 promises.
  const entries = [...inert];
  for (const probe of probes) {
    const there = read({ ...params, [probe.key]: probe.to }, patch);
    entries.push(entryFrom(probe, { here, there, reading }));
  }
  const ranked = rankPull(entries).filter((entry) => !entry.inert);
  const top = ranked.slice(0, 3);

  // The sweeps: three independent full studies of those three controls.
  let matches = 0;
  const swept = [];
  for (const entry of top) {
    const points = samplePoints(entry.control, params[entry.key]);
    const curve = points.map((value) => ({ value, at: read({ ...params, [entry.key]: value }, patch) }));
    const tol = entry.control.step / 1000;
    const stanceAt = curve.find((point) => Math.abs(point.value - params[entry.key]) < tol);

    // (1) The stance, exactly. Both figures are runs of the same design.
    const sameStance = stanceAt && stanceAt.at === here;
    if (!sameStance) {
      console.log(`       ${entry.key}: the sweep reads ${stanceAt?.at} at the stance, the pull ${here}`);
    }

    // (2) The sweep's own local slope, across the narrowest interval it holds
    // around the stance.
    const index = curve.indexOf(stanceAt);
    const lower = curve[index - 1] ?? null;
    const upper = curve[index + 1] ?? null;
    const pair = upper && upper.at !== null ? [stanceAt, upper] : lower && lower.at !== null ? [lower, stanceAt] : null;
    const slope = pair && pair[0].at !== null && pair[1].at !== null
      ? (pair[1].at - pair[0].at) / (pair[1].value - pair[0].value)
      : null;
    const sign = slope === null ? null : slope === 0 ? 'none' : slope > 0 ? 'raise' : 'lower';
    const sameSign = sign === entry.direction;
    if (!sameSign) {
      console.log(`       ${entry.key}: the sweep says it ${sign}s, the pull says it ${entry.direction}s`);
    }

    swept.push({ key: entry.key, slope, pull: entry.effect });
    if (sameStance && sameSign) matches += 1;
  }

  // (3) The ranking, as a ranking.
  const orderHolds =
    swept.every((s) => s.slope !== null) &&
    swept
      .map((s) => Math.abs(s.slope))
      .every((magnitude, at, all) => at === 0 || all[at - 1] >= magnitude - 1e-12);
  if (!orderHolds) {
    console.log(`       order: ${swept.map((s) => `${s.key} ${Math.abs(s.slope ?? NaN).toFixed(3)}`).join(' > ')}`);
  }

  const clean = matches === top.length && orderHolds;
  if (clean) agreed += 1;
  console.log(
    `  ${clean ? 'ok  ' : 'FAIL'} ${desk.name}: ${probes.length} probed, ${inert.length} inert, ` +
      `top three ${top.map((entry) => entry.key).join(', ')}`,
  );
  if (!clean) failures += 1;
}

ok(`the ranking agrees with full sweeps on ${DESKS.length} of ${DESKS.length} desks`, agreed === DESKS.length, `${agreed} of ${DESKS.length}`);

/* ── the invariants contracts/pull-module.md names ─────────────────────── */
{
  const params = { ...DEFAULT_PARAMETERS };
  const patch = { ...DEFAULT_BYPASS };
  const state = channelState(params, patch);
  const engaged = [...state].filter(([, value]) => value.engaged).map(([id]) => id);
  const here = read(params, patch);
  const { probes, inert } = pullProbes(params, patch, {
    quantity: reading.quantity,
    engaged,
    annual: false,
    needed: contents,
    carried: contents,
  });
  const entries = [...inert, ...probes.map((probe) => entryFrom(probe, { here, there: read({ ...params, [probe.key]: probe.to }, patch), reading }))];

  ok(
    "direction is 'none' only where the effect is exactly zero",
    entries.every((entry) => entry.inert || (entry.direction === 'none') === (entry.effect === 0)),
  );
  ok(
    'inert and effect are never both set and never both null',
    entries.every((entry) => (entry.inert === null) !== (entry.effect === null)),
  );
  ok(
    "every entry's room is measured against the control's declared stops",
    entries.every((entry) => entry.inert || (entry.atStop === (entry.room === 0) && entry.room >= 0)),
  );
  ok('inert controls are listed rather than omitted', inert.length > 0, `${inert.length} of ${inert.length + probes.length}`);

  // The census this feature was costed against, re-taken from the declarations
  // rather than recalled: 90 sweepable numeric faces on non-priced channels.
  const sweepable = new Set();
  for (const channel of CHANNELS) {
    if (channel.prices) continue;
    for (const control of channel.controls) {
      if (![control.min, control.max, control.step].every(Number.isFinite)) continue;
      const keys = control.kind === 'facade' ? control.sides.map((side) => side.key) : [control.key];
      for (const key of keys) sweepable.add(key);
    }
  }
  ok('the pull covers every sweepable non-priced face and no more', inert.length + probes.length === sweepable.size, `${inert.length + probes.length} against ${sweepable.size}`);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
