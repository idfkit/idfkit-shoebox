/**
 * G2 (T014, T029): the band arithmetic, fed hand-built curves. No engine.
 *
 * Every case is a curve whose readings are a function of the position, laid on
 * the real positions `samplePoints` gives a real control, judged against a real
 * standard's lines through the real `readingForTarget`. So what is proved is
 * the module's arithmetic over the shapes the page will actually hand it,
 * not over a simplified copy.
 *
 * Run: node specs/016-tolerance-bands/verify/g2-band.mjs
 */
import { controlFor } from '../../../src/controls.js';
import { PRESET_BY_ID } from '../../../src/schemes.js';
import { COARSE_SAMPLES, SWEEP_SAMPLES, samplePoints } from '../../../src/study.js';
import { SAYS, bandFor, toleranceFor } from '../../../src/tolerance.js';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const ENERPHIT = PRESET_BY_ID.enerphit; // heating ≤ 25, hours above 25 °C ≤ 10
const PH = PRESET_BY_ID.passivhaus;
const shgc = controlFor('shgc').control; // 0.05 to 0.9, step 0.01
const gas = controlFor('gasPrice').control;
const says = (target) => `not carried (${target.id})`;

/** A landed point, as the scheduler's `pointAt` builds one. */
const point = (value, readings) => ({ value, readings, sample: {}, refused: null, reading: null });
const refusedPoint = (value) => ({ value, readings: null, sample: null, refused: 'the heating setpoint passes the cooling one' });
const failedPoint = (value) => ({ value, readings: null, sample: null, refused: null });
const bag = (tedi, overheat) => ({ demand: { tedi, cedi: 1 }, overheat });

function curveOf(control, stance, n, fn) {
  const positions = samplePoints(control, stance, n);
  return { positions, curve: positions.map((v) => fn(v)) };
}
const band = (opts) => bandFor({ key: 'shgc', control: shgc, preset: ENERPHIT, says, ...opts });

/* ── passing stance mid-travel: heating fails low, overheating fails high ── */
{
  const stance = 0.4;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) =>
    point(v, bag(40 - 50 * v, 30 * v - 6)),
  ); // heating ≤ 25 needs v ≥ 0.3; overheat ≤ 10 needs v ≤ 0.533
  const b = band({ stance, curve, positions });
  ok('mid-travel: contains the stance', b.contains && b.band.lower.inside <= stance && stance <= b.band.upper.inside);
  ok('mid-travel: lower edge closed by heating', b.band.lower.closedBy.failing[0].id === 'heating', b.band.lower.closedBy.failing.map((t) => t.id).join());
  ok('mid-travel: upper edge closed by overheating', b.band.upper.closedBy.failing[0].id === 'overheat');
  ok('mid-travel: edges bracket the true crossings', b.band.lower.outside < 0.3 && b.band.lower.inside >= 0.3 && b.band.upper.inside <= 0.534 && b.band.upper.outside > 0.533,
    `${b.band.lower.outside}..${b.band.lower.inside} / ${b.band.upper.inside}..${b.band.upper.outside}`);
  ok('mid-travel: share is the bracket over the travel', Math.abs(b.share - (b.band.upper.inside - b.band.lower.inside) / 0.85) < 1e-12);
  ok('mid-travel: no move, no inert, complete', b.move === null && b.inert === null && !b.incomplete);
}

/* ── band to a stop ── */
{
  const stance = 0.2;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(10 + v, 30 * v - 6)));
  const b = band({ stance, curve, positions });
  ok('to a stop: lower edge is the minimum', b.band.lower.stop && b.band.lower.outside === null && b.band.lower.inside === shgc.min);
  ok('to a stop: upper edge is a bracket', !b.band.upper.stop);
}

/* ── pass / fail / pass: the other stretch is kept apart ── */
{
  const stance = 0.2;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(v > 0.45 && v < 0.6 ? 30 : 10 + v, 0)));
  const b = band({ stance, curve, positions });
  ok('pass/fail/pass: band is the stretch holding the stance', b.contains && b.band.upper.inside < 0.45);
  ok('pass/fail/pass: the far stretch is in others', b.others.length === 1 && b.others[0].from > 0.6, JSON.stringify(b.others));
}

/* ── failing stance: the nearest stretch, and a move ── */
{
  const stance = 0.2;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(40 - 50 * v, 0)));
  const b = band({ stance, curve, positions });
  ok('failing: band excludes the stance', !b.contains && b.move && b.move.to === b.band.lower.inside && b.move.by > 0);
  ok('failing: move share is over the travel', Math.abs(b.move.share - b.move.by / 0.85) < 1e-12);
}

/* ── an equidistant tie is stated ── */
{
  // On shgc's real grid the nearest passing positions either side are 0.26
  // and 0.69 (every position strictly between fails), and the stance sits
  // exactly halfway: a tie by construction, not by hope.
  const stance = 0.475;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(v > 0.261 && v < 0.689 ? 30 : 10 + v, 0)));
  const b = band({ stance, curve, positions });
  ok('tie: two stretches equally near set tie, the lower chosen', b.tie && b.band.upper.inside < stance, `${b.band.lower.inside}..${b.band.upper.inside}`);
}

/* ── refused and gap neighbours close an edge with their reason ── */
{
  const stance = 0.4;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) =>
    v > 0.6 ? refusedPoint(v) : v < 0.2 ? failedPoint(v) : point(v, bag(10 + v, 0)),
  );
  const b = band({ stance, curve, positions });
  ok('refused edge: kind and reason, no failing lines', b.band.upper.closedBy.kind === 'refused' && b.band.upper.closedBy.failing.length === 0 && /setpoint/.test(b.band.upper.closedBy.reason));
  ok('gap edge: kind and the run-failed sentence', b.band.lower.closedBy.kind === 'gap' && b.band.lower.closedBy.reason === SAYS.runFailed);
}

/* ── a single passing point ── */
{
  const stance = shgc.min + 0.3; // on the fine grid
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(Math.abs(v - stance) < 1e-9 ? 10 : 30, 0)));
  const b = band({ stance, curve, positions });
  ok('single point: zero share, bracketed both sides', b.share === 0 && !b.band.lower.stop && !b.band.upper.stop);
}

/* ── two lines failing at one position: both named, worst ratio first ── */
{
  const stance = 0.2;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, v > 0.5 ? bag(26, 40) : bag(10, 0)));
  const b = band({ stance, curve, positions });
  const names = b.band.upper.closedBy.failing.map((t) => t.id);
  ok('two failing: both named, overheating (4×) before heating (1.04×)', names.join() === 'overheat,heating', names.join());
}

/* ── unsolved positions: incomplete, and an edge beside one is unknown ── */
{
  const stance = 0.4;
  const positions = samplePoints(shgc, stance, SWEEP_SAMPLES);
  const curve = positions.filter((v) => v <= 0.6).map((v) => point(v, bag(10 + v, 0)));
  const b = band({ stance, curve, positions });
  ok('unsolved: incomplete and the upper edge unknown', b.incomplete && b.band.upper.unknown && b.inert === null);
}

/* ── inert, declared: a price against lines it cannot reach ── */
{
  const stance = gas.min + (gas.max - gas.min) / 2;
  const positions = samplePoints(gas, stance, SWEEP_SAMPLES);
  const curve = positions.map((v) => point(v, bag(10, 0)));
  const b = bandFor({ key: 'gasPrice', label: 'Gas price', control: gas, stance, curve, positions, preset: ENERPHIT, says, priced: true });
  ok('inert declared: reason, no band, no share, no move', /reaches only the bill/.test(b.inert ?? '') && b.band === null && b.share === null && b.move === null, b.inert);
}

/* ── inert, measured: exactly flat; not with one unsolved; not with one ulp of difference ── */
{
  const stance = 0.4;
  const positions = samplePoints(shgc, stance, SWEEP_SAMPLES);
  const flat = positions.map((v) => point(v, bag(10, 2)));
  ok('inert measured: exactly flat is inert', /did not move/.test(band({ stance, curve: flat, positions }).inert ?? ''));
  ok('inert measured: flat with one unsolved is undecided', band({ stance, curve: flat.slice(1), positions }).inert === null);
  const bumped = flat.map((p, i) => (i === 3 ? point(p.value, bag(10 + Number.EPSILON * 8, 2)) : p));
  ok('inert measured: one value differing in the last bits is not inert', band({ stance, curve: bumped, positions }).inert === null);
}

/* ── every position fails: no band, and no throw ── */
{
  const stance = 0.4;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, bag(30 + v, 0)));
  let b = null;
  let threw = null;
  try {
    b = band({ stance, curve, positions });
  } catch (e) {
    threw = e.message;
  }
  ok('all failing: constructs, band null, judged lines kept', !threw && b.band === null && b.judged.length === 2 && b.inert === null, threw ?? '');
}

/* ── lines the run cannot read are unjudged with the injected sentence ── */
{
  const stance = 0.4;
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) => point(v, { overheat: 0, peakHeat: 5 }));
  const b = bandFor({ key: 'shgc', control: shgc, preset: PH, says, stance, curve, positions });
  const un = b.unjudged.map((line) => line.target.id).sort().join();
  ok('unjudged: heating not carried, cooling and coolload have no line', un === 'cooling,coolload,heating', un);
  ok('unjudged: judged are the carried ones', b.judged.map((t) => t.id).sort().join() === 'heatload,overheat');
}

/* ── T029: coarse nests in fine, and a stepped-over stretch is flagged ── */
{
  const stance = 0.4;
  const fn = (v) => point(v, bag(40 - 50 * v, 30 * v - 6));
  const coarse = curveOf(shgc, stance, COARSE_SAMPLES, fn);
  const fine = curveOf(shgc, stance, SWEEP_SAMPLES, fn);
  const c = band({ stance, ...coarse, coarse: true });
  const f = band({ stance, ...fine });
  const within = (edge, bracketEdge) =>
    edge.inside >= Math.min(bracketEdge.inside, bracketEdge.outside) && edge.inside <= Math.max(bracketEdge.inside, bracketEdge.outside);
  ok('nesting: fine edges lie inside the coarse brackets', within(f.band.lower, c.band.lower) && within(f.band.upper, c.band.upper) && !f.steppedOver);
  // A failing sliver between two coarse positions: invisible to the coarse pass.
  const coarseGrid = samplePoints(shgc, stance, COARSE_SAMPLES);
  const sliver = fine.positions.find((v) => v > stance && !coarseGrid.some((g) => Math.abs(g - v) < 1e-9));
  const withSliver = fine.positions.map((v) => point(v, bag(Math.abs(v - sliver) < 1e-9 ? 30 : 10 + v, 0)));
  const s = band({ stance, curve: withSliver, positions: fine.positions });
  ok('stepped over: a fine-only failure is flagged', s.steppedOver === true, `sliver at ${sliver}`);
}

/* ── gaps inside a stretch are unread, not edges (the survey-sharing report) ── */
{
  // Every coarse position carried TEDI only, as a narrow survey sample did;
  // the fine-only ones carried every line. Before the fix this read as single
  // points passing alone, "kept apart", and claimed a stepped-over stretch.
  const stance = 0.4;
  const coarseGrid = samplePoints(shgc, stance, COARSE_SAMPLES);
  const onCoarse = (v) => coarseGrid.some((g) => Math.abs(g - v) < 1e-9);
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) =>
    onCoarse(v) && Math.abs(v - stance) > 1e-9 ? point(v, { demand: { tedi: 10, cedi: 1 } }) : point(v, bag(10 + v, 0)),
  );
  const b = band({ stance, curve, positions });
  ok('gaps: one stretch across the unread positions', b.band && b.others.length === 0, JSON.stringify(b.others));
  ok('gaps: edges are measured passes', b.verdicts.find((v) => v.value === b.band.lower.inside).kind === 'pass' && b.verdicts.find((v) => v.value === b.band.upper.inside).kind === 'pass');
  ok('gaps: the unread positions are listed with their reason', b.unread.length > 0 && b.unread.every((v) => v.kind === 'gap' && /carried no/.test(v.reason)), String(b.unread.length));
  ok('gaps: no stepped-over claim off unread coarse positions', b.steppedOver === false);
}

/* ── a stepped-over stretch is claimed only past a coarse run that failed ── */
{
  const stance = 0.4;
  const coarseGrid = samplePoints(shgc, stance, COARSE_SAMPLES);
  const upper = coarseGrid.filter((g) => g > stance);
  const blank = upper[1]; // a coarse position that carried nothing
  const { positions, curve } = curveOf(shgc, stance, SWEEP_SAMPLES, (v) =>
    Math.abs(v - blank) < 1e-9 ? failedPoint(v) : v > upper[2] + 1e-9 ? point(v, bag(30, 0)) : point(v, bag(10, 0)),
  );
  const b = band({ stance, curve, positions });
  ok('stepped over: not claimed past a coarse gap', b.steppedOver === false, `upper ${b.band.upper.inside}`);
}

/* ── a setting between two sweep positions is judged by the desk's own run ── */
{
  const swept = 0.4;
  const stance = 0.405; // off the 0.0425 grid
  const { positions, curve } = curveOf(shgc, swept, SWEEP_SAMPLES, (v) => point(v, bag(10 + v, 0)));
  const without = band({ stance, swept, curve, positions });
  const figure = (target) => (target.id === 'heating' ? 12 : 0);
  const withDesk = band({ stance, swept, curve, positions, atSetting: figure });
  ok('off-grid: without the desk run it is not judged here', !without.verdicts.some((v) => v.value === stance));
  const here = withDesk.verdicts.find((v) => v.value === stance);
  ok('off-grid: the desk run stands at the setting, marked', here?.kind === 'pass' && here.byDesk === true);
  ok('off-grid: the band contains the setting and offers no move', withDesk.contains && withDesk.move === null);
  const failing = band({ stance, swept, curve, positions, atSetting: (t) => (t.id === 'heating' ? 40 : 0) });
  const f = failing.verdicts.find((v) => v.value === stance);
  ok('off-grid: a desk run that fails is a fail here', f?.kind === 'fail' && f.failing[0].id === 'heating' && !failing.contains);
  const partial = band({ stance, swept, curve, positions, atSetting: (t) => (t.id === 'heating' ? 12 : null) });
  ok('off-grid: a desk run missing a line is not used', !partial.verdicts.some((v) => v.value === stance));
  const onGrid = band({ stance: swept, curve, positions, atSetting: () => 999 });
  ok('on-grid: the sample, not the desk run, speaks', onGrid.verdicts.every((v) => !v.byDesk) && onGrid.contains);
}

/* ── the block: ranked, restore, tie, alone, stale, absences ── */
{
  const mk = (key, control, stance, fn, extra = {}) => {
    const positions = samplePoints(control, stance, SWEEP_SAMPLES);
    return bandFor({ key, control, stance, preset: ENERPHIT, says, positions, curve: positions.map((v) => point(v, fn(v))), ...extra });
  };
  const visT = controlFor('visT').control;
  const wide = mk('shgc', shgc, 0.4, (v) => bag(10 + v, 0));
  const narrow = mk('visT', visT, 0.4, (v) => bag(Math.abs(v - 0.4) < 0.11 ? 10 + v : 30, 0));
  const pass = toleranceFor({ preset: ENERPHIT, bands: [wide, narrow] });
  ok('block passing: ranked least free first', pass.passing === true && pass.ranked[0].key === 'visT' && pass.ranked[1].key === 'shgc');

  const fixA = mk('shgc', shgc, 0.4, (v) => bag(v >= 0.5 ? 10 : 30, 0));
  const fixB = mk('visT', visT, 0.4, (v) => bag(v <= 0.2 ? 10 : 30, 0));
  const fail = toleranceFor({ preset: ENERPHIT, bands: [fixA, fixB] });
  ok('block failing: heating named, nearest lever chosen', fail.passing === false && fail.restore.failing[0].id === 'heating' && fail.restore.lever.key === 'shgc', fail.restore.lever?.key);
  ok('block failing: alone lists both levers for heating', fail.restore.alone.get(fail.restore.failing[0]).sort().join() === 'shgc,visT');

  const never = mk('shgc', shgc, 0.4, (v) => bag(30 + v, 0));
  const none = toleranceFor({ preset: ENERPHIT, bands: [never] });
  ok('block failing, no lever: lever null', none.passing === false && none.restore.lever === null && none.restore.asked === 1);

  const staleBand = mk('shgc', shgc, 0.4, (v) => bag(10 + v, 0), { stale: true, landed: 2 });
  const s = toleranceFor({ preset: ENERPHIT, bands: [staleBand] });
  ok('block all stale: still read, stale counted', s.passing === true && s.stale === 1);

  ok('absence: nothing chased', toleranceFor({ preset: null, bands: [] }).absence === SAYS.noChase);
  ok('absence: no study', toleranceFor({ preset: ENERPHIT, bands: [] }).absence === SAYS.noStudy);
  ok('absence: climate', toleranceFor({ preset: ENERPHIT, bands: [], climateReason: SAYS.climate }).absence === SAYS.climate);
}

console.log(failed ? `\n${failed} FAILED` : '\nG2: every case passes');
process.exit(failed ? 1 : 0);
