/**
 * Rebuild `src/comfort.data.js`: the two ASHRAE 55-2020 §5.3.1 graphic comfort
 * zones the psychrometric view draws (spec 015, research.md R4).
 *
 * Not part of `predev` or `prebuild`. Run by hand, like `build-rates.mjs`:
 *
 *     node scripts/build-comfort.mjs
 *
 * The figure's zones are not a published table of vertices. They are defined
 * by the PMV computation at the conditions Figure 5.3.1 states, so the
 * traceable route is to run that computation: the PMV model of ASHRAE 55-2020
 * Normative Appendix B (the Fanger model of ISO 7730, as the standard's own
 * reference code implements it), at
 *
 *   - metabolic rate 1.1 met, no external work;
 *   - air speed 0.1 m/s;
 *   - mean radiant temperature equal to air temperature, so the horizontal
 *     axis is operative temperature;
 *   - 0.5 clo and 1.0 clo;
 *   - PMV from −0.5 to +0.5;
 *   - humidity ratio from 0 to 0.012, the figure's upper bound.
 *
 * Each boundary is found by bisection on temperature at every 0.0005 of
 * humidity ratio, with the vapour pressure taken at standard sea-level
 * pressure, which is the pressure the figure is drawn at.
 *
 * `comfort.js` checks the written polygons at load against spot values read
 * off the printed figure, which is what catches a gross generator error (a
 * wrong clo, a swapped sign, air temperature taken for operative).
 */
import { writeFileSync } from 'node:fs';
import { FIGURE_531, pmv, vapour } from '../src/pmv.js';

const out = new URL('../src/comfort.data.js', import.meta.url).pathname;

// The figure's conditions, from the module `comfort.js` checks the zones with,
// so the generator and the check cannot be drawn at two different sets.
const MET = FIGURE_531.met;
const SPEED = FIGURE_531.speed; // m/s
const STEP = 0.0005;
const TOP = FIGURE_531.top;


/** The operative temperature at which PMV equals `target`, by bisection. */
function edge(clo, W, target) {
  let lo = 5;
  let hi = 40;
  const f = (t) => pmv({ ta: t, tr: t, vel: SPEED, pa: vapour(W), met: MET, clo }) - target;
  if (f(lo) > 0 || f(hi) < 0) throw new Error(`no ${target} edge between ${lo} and ${hi} °C at ${clo} clo`);
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** One zone, as a closed polygon of [operative °C, humidity ratio g/kg], anticlockwise from the cold bottom corner. */
function zone(clo) {
  const ws = [];
  for (let i = 0; i * STEP <= TOP + 1e-12; i += 1) ws.push(Number((i * STEP).toFixed(4)));
  const cold = ws.map((W) => [edge(clo, W, -0.5), W]);
  const warm = ws.map((W) => [edge(clo, W, 0.5), W]);
  const round = ([t, W]) => [Number(t.toFixed(2)), Number((W * 1000).toFixed(2))];
  return [...warm.map(round), ...cold.reverse().map(round)];
}

if (import.meta.url === `file://${process.argv[1]}`) build();

function build() {
const zones = [0.5, 1.0].map((clo) => ({ clo, polygon: zone(clo) }));

const lines = [
  '/* ═══ generated, do not edit by hand ══════════════════════════════════════',
  ' *',
  ' * Written by scripts/build-comfort.mjs. The ASHRAE 55-2020 §5.3.1 graphic',
  ' * comfort zones (Figure 5.3.1), computed by the PMV model of Normative',
  ' * Appendix B at 1.1 met, 0.1 m/s, mean radiant equal to air temperature,',
  ' * PMV −0.5 to +0.5, humidity ratio 0 to 0.012. Vertices are [operative',
  ' * temperature °C, humidity ratio g/kg], the warm edge upwards and then the',
  ' * cold edge downwards. Rerunning the script is how these are changed.',
  ' */',
  '',
  "export const GRAPHIC_CITATION = 'ASHRAE 55-2020 §5.3.1, Figure 5.3.1';",
  '',
  'export const GRAPHIC_ZONES = Object.freeze([',
  ...zones.map(
    ({ clo, polygon }) =>
      `  Object.freeze({ clo: ${clo}, polygon: Object.freeze([\n${polygon
        .map((v) => `    [${v[0]}, ${v[1]}],`)
        .join('\n')}\n  ]) }),`,
  ),
  ']);',
  '',
];
writeFileSync(out, lines.join('\n'));
for (const { clo, polygon } of zones) {
  const n = polygon.length / 2;
  console.log(
    `${clo} clo: W=0 ${polygon.at(-1)[0]}–${polygon[0][0]} °C, W=12 g/kg ${polygon[n][0]}–${polygon[n - 1][0]} °C`,
  );
}
}
