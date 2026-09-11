/**
 * Quickstart gate 7: year-long readings, before release. Engine, a year each.
 *
 * The annual evidence desk — System, Gains and Daylight patched in, on the
 * Golden NREL year shipped with EnergyPlus — at the home world's full depth,
 * read for energy use intensity and for hours above 25 °C. The second is a
 * count against a threshold, where a small move can flip an hour across the
 * line, and the spec's own evidence never measured one; SC-008 asks for its
 * share explained to be recorded whatever it is, and this is where it is
 * measured.
 *
 * Each sample's bill is built the way `landedFrom` builds it on the page, off
 * the same exported readers, so the energy use intensity read here is the one
 * the plan would letter.
 *
 * SC-005a: a sweet spot is named for SHGC on energy use intensity and for plan
 * width and depth, each labelled as an estimate, and none within the margin of
 * an end of its slider.
 */

import fs from 'node:fs';
import { writeIdf } from '@idfkit/core';
import { parseESO } from '@idfkit/engine';
import { END_USES, computeBill, meterTotal } from '../../../src/bill.js';
import { controlFor } from '../../../src/controls.js';
import { applyModel, channelState, geometryFacts, setAnnual } from '../../../src/model.js';
import { assume, resolveRates } from '../../../src/rates.js';
import { environmentRuns, exactly, hourly } from '../../../src/readings.js';
import { designAt, probesAt, worldOf } from '../../../src/space.js';
import { QUANTITY_BY_ID, RunContents, contentsFor } from '../../../src/study.js';
import { DesignLedger, FREE, Landed, MARGIN, planOf } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { ANNUAL, failureOf, finish, model as modelOf, ok, runCache, runMany } from './desk.mjs';

const EPW = '/Applications/EnergyPlus-26-1-0/WeatherData/USA_CO_Golden-NREL.724666_TMY3.epw';
const STATION = { country: 'USA', state: 'CO' };
const BASES = Number(process.env.BASES ?? 16);
const DESIGNS = Number(process.env.DESIGNS ?? 512);

console.log(`year-long readings on the annual evidence desk (gate 7, ${BASES} bases, ${DESIGNS} designs)`);

if (!fs.existsSync(EPW)) throw new Error(`${EPW} is not installed; this gate needs the Golden NREL year`);
const epw = fs.readFileSync(EPW, 'utf8');
const world = worldOf(ANNUAL.params, ANNUAL.patch);
const eui = READING_BY_ID.eui;
const overheat = READING_BY_ID.overheat;
const engaged = [...channelState(world.desk, world.patch)].filter(([, s]) => s.engaged).map(([id]) => id);
const reporting = RunContents.union([contentsFor(QUANTITY_BY_ID.eui, engaged), contentsFor(QUANTITY_BY_ID.overheat, engaged)]);

const tasks = [];
for (let index = 0; index < DESIGNS; index += 1) tasks.push({ id: designAt(world, index).id, params: designAt(world, index).params });
for (let base = 0; base < BASES; base += 1) {
  for (const probe of probesAt(world, designAt(world, base))) if (!probe.skip) tasks.push({ id: probe.id, params: probe.params });
}

/** One sample's bill and readings, as `landedFrom` makes them. */
function readingsOf(eso, params, floorArea) {
  const points = hourly(eso, exactly('Zone Mean Air Temperature'));
  const runs = environmentRuns(points, eso?.environments ?? []);
  const annualRun = runs.some((run) => run.kind === null);
  const billed = annualRun ? runs.filter((run) => run.kind === null) : runs;
  const environments = new Set(billed.map((run) => run.key));
  const series = new Map();
  for (const use of END_USES) {
    const total = meterTotal(eso, use.meter, environments);
    if (total != null) series.set(use.meter, total);
  }
  const bill = computeBill({
    series,
    params,
    card: assume(resolveRates(STATION), params),
    floorArea,
    hours: billed.reduce((sum, run) => sum + (run.end - run.start + 1), 0),
    engaged: new Set([...channelState(params, world.patch)].filter(([, s]) => s.engaged).map(([id]) => id)),
    annual: annualRun,
    months: annualRun ? billed.reduce((sum, run) => sum + run.months, 0) : null,
  });
  const landed = { eso, bill };
  return { eui: QUANTITY_BY_ID.eui.read(landed), overheat: QUANTITY_BY_ID.overheat.read(landed) };
}

const cache = runCache(`annual-${BASES}`);
const missing = tasks.filter((task) => !cache.held[task.id]);
if (missing.length) {
  const doc = await modelOf();
  const built = [];
  for (const task of missing) {
    setAnnual(doc, true);
    applyModel(doc, task.params, world.patch, { reporting });
    built.push({ idf: writeIdf(doc), floorArea: geometryFacts(doc).grossFloor });
  }
  const results = await runMany(built.map(({ idf }) => ({ idf, epw })), { label: 'annual runs' });
  missing.forEach((task, at) => {
    const result = results[at];
    cache.held[task.id] =
      result.success && result.eso
        ? { readings: readingsOf(parseESO(result.eso), task.params, built[at].floorArea) }
        : { failure: failureOf(result) };
  });
  cache.save();
}
const ledger = new DesignLedger();
for (const task of tasks) {
  const held = cache.held[task.id];
  ledger.land(task.id, held.readings ? new Landed({ readings: Object.freeze(held.readings) }) : new Landed({ failure: held.failure }));
}

const results = {};
for (const reading of [eui, overheat]) {
  const plan = planOf(world, reading, ledger, { designs: DESIGNS, bases: BASES, kind: 'annual', tau: FREE[reading.id].tau });
  results[reading.id] = plan;
  const recipe = (m) => m.recipe.map(({ key, word, share }) => `${word} ${key} ${Math.round(share * 100)}%`).join(', ');
  console.log(`       ${reading.label}: two moves ${(plan.explained2 * 100).toFixed(1)} %, one ${(plan.explained1 * 100).toFixed(1)} %, ` +
    `${plan.dots.length} designs, ${plan.gaps.length} failed`);
  console.log(`         move 1 (${Math.round(plan.moves[0].explains * 100)} %): ${recipe(plan.moves[0])}`);
  console.log(`         spots: ${[...plan.spots.values()].map((s) => `${s.key} ${s.at ?? `limit ${s.limit}`} (${s.consistency.agree}/${s.consistency.of})`).join(', ') || 'none'}`);
  console.log(`         limits: ${plan.limits.map((l) => `${l.key}@${l.end}`).join(', ') || 'none'}`);
  ok(`${reading.label}: the share explained is recorded (SC-008)`, Number.isFinite(plan.explained2), String(plan.explained2));
}

const spots = results.eui.spots;
for (const key of ['shgc', 'width', 'depth']) {
  const spot = spots.get(key);
  ok(`${key} carries a sweet spot on energy use intensity, labelled an estimate (SC-005a)`, spot?.at !== null && spot?.at !== undefined && spot.estimate, spot ? `${spot.at ?? `limit ${spot.limit}`}` : 'none');
}
// Every spot named on either reading, measured on its own slider: a value
// within the margin of an end is a limit and must never be lettered a spot.
const tooNear = [];
for (const plan of Object.values(results)) {
  for (const spot of plan.spots.values()) {
    if (spot.at === null) continue;
    const { control } = controlFor(spot.key);
    const share = (spot.at - control.min) / (control.max - control.min);
    if (share < MARGIN.share || share > 1 - MARGIN.share) tooNear.push(`${spot.key} ${spot.at}`);
    if (!spot.estimate) tooNear.push(`${spot.key} is not labelled an estimate`);
  }
}
ok(`no sweet spot is named within ${MARGIN.share} of an end, and every one is an estimate`, tooNear.length === 0, tooNear.join(', '));

finish();
