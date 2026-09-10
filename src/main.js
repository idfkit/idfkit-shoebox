import { createEnergyPlus } from '@idfkit/engine';
import { httpSource, SchemaBundle, writeIdf } from '@idfkit/core';
import {
  applyModel,
  boundaryKeyFor,
  buildModel,
  channelState,
  designConditionsFrom,
  designDayDatums,
  geometryFacts,
  leakageBuildUp,
  modelFacts,
  occupiedFloor,
  setAnnual,
  setDesignConditions,
  shadeGeometry,
  surfaceGeometry,
  WALLS,
  WINDOW_CONSTRUCTION,
  windowGeometry,
} from './model.js';
import {
  CHANNELS,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  SHEET_KEYS,
  controlFor,
  formatValue,
  isWholeYear,
  labelFor,
  monthHours,
  phraseFor,
} from './controls.js';
import { mountConsole } from './console.js';
import { describeDesk } from './describe.js';
import { quantityField, textField } from './field.js';
import { mountTour } from './tour.js';
import {
  COARSE_SAMPLES,
  OPENING_QUANTITY_BASIS,
  PricingAvailability,
  PricingStatus,
  QUANTITIES,
  QUANTITY_BY_ID,
  RunContents,
  SWEEP_SAMPLES,
  contentsFor,
  offersFor as studyOffersFor,
  openingQuantity,
  refusesSweep,
  samplePoints,
  sampleOrder,
} from './study.js';
import {
  COARSE_GRID,
  FINE_GRID,
  READINGS as SURVEY_READINGS,
  READING_BY_ID,
  axisFor,
  contoursOf,
  coverageOf,
  extentOf,
  fallStep,
  freeExchange,
  improvingRegion,
  landPoint,
  latticeOf,
  levelsFor,
  makeSurvey,
  meshOf,
  refineOrder,
  rowsFor,
  arrisesOf,
  blockOf,
  strataOf,
  SpotHeight,
  TraverseStop,
} from './survey.js';
import { createRelief } from './relief.js';
import { PullReading, axesFrom, entryFrom, pullProbes, pullReadingFor, rankPull } from './pull.js';
import { createEnginePool, poolLimit } from './pool.js';
import { createStudyScheduler, makeStudyJob } from './scheduler.js';
import { runBundle } from './bundle.js';
import { REVISION, revisionHref } from './version.js';
import { readSignature, writeSignature } from './sign.js';
import { END_USES, GROUPS, computeBill, meterTotal } from './bill.js';
import { assume, isRate, placeName, resolveRates } from './rates.js';
import {
  climateDescription,
  climateZone,
  degreeDays,
  flavorWindow,
  here,
  nearestSites,
  searchSites,
  siteName,
  siteRegion,
  weatherFor,
} from './weather.js';
import { dailyMeans, holidayList, parseEpwCalendar, parseEpwStartDay } from './epw.js';
import { decodeState, encodeState, isSchemeFragment } from './permalink.js';
import { mountChangelog } from './changelog.js';
import CHANGELOG_SOURCE from '../CHANGELOG.md?raw';
import {
  MONTHS,
  NEUTRAL_C,
  dayExtremeNear,
  demandOver,
  environmentRuns,
  exactly,
  glassProperties,
  networkFlow,
  hourly,
  instantOffers,
  pinAt,
  readDemand,
  readExtremes,
  readOverheat,
  readPeaks,
  resolvePin,
  runCalendar,
  stampText,
  watts,
  worstHour,
} from './readings.js';
import {
  LEFT_ALONE,
  Measure,
  PRESETS,
  PRESET_BY_ID,
  SHELF_LIMIT,
  Scheme,
  Shelf,
  applyPreset,
  chaseVerdict,
  conformance,
} from './schemes.js';
import {
  ABSENCE,
  CATEGORIES,
  COUNT_CATEGORY,
  CRITERION_BY_ID,
  PARTIAL_PERIOD,
  SEASON,
  WeatherFile,
  clearedCount,
  qualificationsFor,
  readCriterionA,
  readCriterionB,
  readCriterionC,
  runningMean,
} from './tm59.js';

const ENERGYPLUS_VERSION = '26.1.0';

const $ = (id) => document.getElementById(id);

/* ══ the signature ═══════════════════════════════════════════════════════ */

/**
 * Who drew this, and what wrote it: the three lines at the top of every IDF
 * this desk hands out.
 *
 * Declared here, above everything, for the reason the study controls are
 * declared at the head of their section: a permalink carrying a station
 * attaches during the boot awaits, and the download reaches it long before
 * the foot of this module has been evaluated. A `const` in its temporal dead
 * zone does not have the `?.` spelling that saves the rest of those references
 * — it simply throws, and it would throw on the one path a link arrives by.
 *
 * The name is **not on `params`**, and that is the whole reason it works. The
 * shape key is `JSON.stringify([params, patching()])`, so a signature carried
 * there would start a fresh 8,760-hour solve on every keystroke of somebody
 * typing their own name — and the runs would be identical, since a comment
 * changes nothing the engine computes. It is `pinnedHour`'s arrangement: state
 * that reaches the output without reaching the physics, held beside `params`
 * rather than in it. Nor is it on a `prices: true` channel, which is the other
 * home for such a thing, because those are controls that re-letter a reading
 * and this re-letters nothing — it is not a control at all, it is a signature.
 */
let signature = readSignature();

/**
 * The signature is stamped onto the **download**, not onto the copy the engine
 * is handed, and that difference is what makes it work.
 *
 * `lastBundle.idf` is held at the solve so the ZIP can offer the exact bytes
 * that produced the numbers on the sheet: a slider nudged since would otherwise
 * ship inputs that never made those results. Signing is not such a nudge — a
 * comment cannot move a reading — so stamping the header later costs that
 * guarantee nothing, and it is the only arrangement in which a name typed after
 * a run reaches the file you download a second afterwards. Stamped at the solve
 * instead, this failed exactly where a reader would find it: sign the sheet,
 * press Download, and the model arrives unsigned, because it was written before
 * you signed it.
 *
 * So the header goes on in `bundle.js`, where the ZIP is assembled and where
 * the revision it also carries is already read. The only thing that has to
 * travel there is who signed it.
 */

const drawnField = textField({
  name: 'Drawn by',
  // States what the drawing is rather than instructing the reader, the way an
  // absent reading is an em dash and not "run a simulation".
  placeholder: 'Unsigned',
  read: () => signature,
  write: (text) => {
    signature = writeSignature(text);
    drawnField.show();
  },
});
$('drawn-field').append(drawnField.node);
drawnField.show();
const runBtn = $('run');
const statusEl = $('status');
const logEl = $('log');
const elapsedEl = $('elapsed');
const downloadBtn = $('download');

/* ══ the run ledger ══════════════════════════════════════════════════════ */

const PHASES = [
  ['expanding', 'Expand'],
  ['initializing', 'Initialise'],
  ['warmup', 'Warmup'],
  ['simulation', 'Simulate'],
  ['postprocess', 'Report'],
];
$('phases').innerHTML = PHASES.map(([k, label]) => `<li data-phase="${k}">${label}</li>`).join('');

function setPhase(current) {
  const idx = PHASES.findIndex(([k]) => k === current);
  for (const el of $('phases').children) {
    const i = PHASES.findIndex(([k]) => k === el.dataset.phase);
    el.className =
      current === 'complete' ? 'done' : i < idx ? 'done' : i === idx ? 'active' : '';
  }
}
setPhase('idle');

// The engine writes a few hundred lines per run, and auto-solve means a run
// roughly every 0.7 s. Appending each line to a `<pre>` that is closed inside a
// `<details>` is quadratic work nobody is looking at, so the run buffers and
// only paints when the drawer is actually open.
const logLines = [];
const notesEl = $('notes');

function flushLog() {
  logEl.textContent = logLines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

function log(line) {
  logLines.push(line);
  if (notesEl.open) flushLog();
}

function clearLog() {
  logLines.length = 0;
  if (notesEl.open) flushLog();
}

notesEl.addEventListener('toggle', () => notesEl.open && flushLog());

/* ══ geometry: the axonometric, read from the model itself ═══════════════ */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
// Standard 30° axonometric from the south-east: +x, -y, +z. The viewpoint is
// not arbitrary — north_axis is 0, so the glazed wall is the one at y = 0, and
// a drawing of a building with a south window has to be able to see it.
const project = ([x, y, z]) => [(x + y) * COS30, (x - y) * SIN30 - z];
const VIEW = [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)];

// Newell's method: vertices are wound counter-clockwise seen from outside
// (GlobalGeometryRules), so this normal points out of the zone.
function normal(verts) {
  let [nx, ny, nz] = [0, 0, 0];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    // Custom properties are not resolved inside SVG presentation attributes,
    // so anything token-valued goes through the style declaration instead.
    if (String(v).includes('var(')) el.style.setProperty(k, String(v));
    else el.setAttribute(k, String(v));
  }
  return el;
}

// The zone tinted by its own result. The scale is hinged at 20 °C — room
// temperature, the only neutral point that means anything here — and runs out
// to the two design conditions. Colour is degrees, never decoration. The hinge
// is `readings.js`'s, because the reading hour is measured from the same point
// and two copies of "neutral" would drift.
function tint(celsius) {
  const cold = [61, 100, 120];
  const paper = [178, 170, 154];
  const warm = [180, 85, 42];
  const below = celsius <= NEUTRAL_C;
  const k = below
    ? 1 - Math.max(0, Math.min(1, (celsius + 15.5) / (NEUTRAL_C + 15.5)))
    : Math.max(0, Math.min(1, (celsius - NEUTRAL_C) / (32 - NEUTRAL_C)));
  const [a, b] = below ? [paper, cold] : [paper, warm];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(' ')})`;
}

function renderAxon(meanC) {
  const host = $('axon');
  host.textContent = '';
  const pts = [];
  const edges = [];
  const faces = [];

  /*
   * The building is drawn square to the page, and north turns instead.
   *
   * The orientation is real and lives in the vertices, so drawing them straight
   * would turn the box under a fixed viewpoint — and at 45°, which is one of
   * the stops the rose snaps to, that viewpoint looks straight down the
   * diagonal and the box collapses into a flat elevation. Which is a true
   * projection and a useless drawing.
   *
   * So the vertices are turned back by the same angle before they are
   * projected, and a north point is drawn turning over them. That is how a
   * plan has always handled orientation: the building sits square on the sheet
   * and the arrow does the work. Nothing about the model changes — this is the
   * one place on the page that draws something other than raw coordinates, and
   * it draws the same building from a viewpoint that moves with it.
   */
  const pivot = [params.width / 2, params.depth / 2];
  const square = ([x, y, z]) => {
    const t = (-params.northAxis * Math.PI) / 180;
    const [c, sn] = [Math.cos(t), Math.sin(t)];
    const [dx, dy] = [x - pivot[0], y - pivot[1]];
    return [pivot[0] + dx * c + dy * sn, pivot[1] - dx * sn + dy * c, z];
  };
  const draw = (v) => project(square(v));

  // Adiabatic surfaces, poché'd like a cut in a section drawing. Collected for
  // every surface rather than only the three the viewpoint shows: the three
  // behind read through the translucent faces along with the wireframe, and a
  // north wall that has left the envelope has to be visible without turning
  // the building to find it.
  const poche = [];

  for (const s of SURFACES) {
    const screen = s.verts.map(draw);
    pts.push(...screen);
    for (let i = 0; i < screen.length; i++) edges.push([screen[i], screen[(i + 1) % screen.length]]);
    const n = normal(s.verts.map(square));
    const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
    const front = facing > 1e-6;
    if (front) {
      // Top face reads brightest, then the +x wall, then the +y wall.
      faces.push({
        surface: s,
        screen,
        alpha: 0.1 + 0.2 * Math.max(0, n[2]) + 0.07 * Math.max(0, n[0]),
      });
    }
    if (s.boundary === 'adiabatic') poche.push({ screen, front });
  }

  // The overhang is drawn last but measured now: it stands outside the box, so
  // the frame has to be told about it before the viewBox is settled.
  const shades = SHADES.map((s) => s.verts.map(draw));
  for (const screen of shades) pts.push(...screen);

  // One dimension line per length, taken along the walls themselves rather
  // than across the drawing's bounding box. The difference only shows once the
  // building is turned, and then it shows badly: the bounding box of a 15.24 m
  // square set at 45° is 21.55 m across, so a box-based dimension would letter
  // a wall with a number no wall in the model has.
  const byName = new Map(SURFACES.map((s) => [s.name, s]));
  const walls = WALLS.map((w) => byName.get(w.name)).filter(Boolean);
  const all = SURFACES.flatMap((s) => s.verts);
  const ext = (i) => [Math.min(...all.map((v) => v[i])), Math.max(...all.map((v) => v[i]))];
  const [x0, x1] = ext(0);
  const [y0, y1] = ext(1);
  const [, z1] = ext(2);
  const off = Math.max(x1 - x0, y1 - y0) * 0.15;

  // A wall's bottom edge, and the way it faces, straight off its vertices.
  const edgeOf = (wall) => {
    const [a, b] = [wall.verts[1], wall.verts[2]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    return { a, b, length, n: [u[1], -u[0]] };
  };
  const dims = [];
  if (walls.length === 4) {
    const [south, east, , west] = walls.map(edgeOf);
    dims.push(
      { a: south.a, b: south.b, d: south.n.map((v) => v * off).concat(0), text: `${south.length.toFixed(2)} m` },
      { a: east.a, b: east.b, d: east.n.map((v) => v * off).concat(0), text: `${east.length.toFixed(2)} m` },
      {
        // The upright, stood at the corner the two faces share so it reads
        // clear of both.
        a: south.a,
        b: [south.a[0], south.a[1], z1],
        d: [(south.n[0] + west.n[0]) * off * 0.8, (south.n[1] + west.n[1]) * off * 0.8, 0],
        text: `${z1.toFixed(2)} m`,
      },
    );
  }
  const centre = draw([pivot[0], pivot[1], z1 / 2]);
  const dimGeo = dims.map((dim) => {
    const a = draw(dim.a.map((v, i) => v + dim.d[i]));
    const b = draw(dim.b.map((v, i) => v + dim.d[i]));
    const geo = { a, b, from: draw(dim.a), to: draw(dim.b), text: dim.text };
    pts.push(a, b);
    return geo;
  });

  // Annotation is sized against the drawing's own extent, not in absolute user
  // units: the box can be 4 m or 40 m across and the lettering has to stay the
  // same size on the page either way. Strokes already hold via
  // non-scaling-stroke. This has to be settled before the viewBox, because the
  // labels are part of what the viewBox has to contain.
  const spanOf = (i) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]));
  const unit = Math.max(spanOf(0), spanOf(1)) / 100;
  const [fontSize, tickHalf, textOffset] = [8.5 * unit, 5.0 * unit, 10.0 * unit];

  for (const g of dimGeo) {
    const length = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) || 1;
    const dir = [(g.b[0] - g.a[0]) / length, (g.b[1] - g.a[1]) / length];
    let perp = [-dir[1], dir[0]];
    const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    const away = [mid[0] - centre[0], mid[1] - centre[1]];
    // Set the text on the far side of the line from the model, so it never
    // crosses an edge it is measuring.
    if (perp[0] * away[0] + perp[1] * away[1] < 0) perp = perp.map((v) => -v);
    g.anchor = [mid[0] + perp[0] * textOffset, mid[1] + perp[1] * textOffset];
    g.angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;

    // Four corners of the rotated label, so a vertical dimension cannot run off
    // the left edge of the panel.
    const along = g.text.length * fontSize * 0.3;
    const across = fontSize * 0.62;
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        pts.push([
          g.anchor[0] + dir[0] * along * s + perp[0] * across * t,
          g.anchor[1] + dir[1] * along * s + perp[1] * across * t,
        ]);
      }
    }
  }

  /*
   * The north point, which is the half of the orientation the drawing can
   * still show once the building has been set square to the page. Laid out
   * before the viewBox is settled, because it is part of what the viewBox has
   * to contain.
   */
  const northArrow = (() => {
    const a = draw([pivot[0], pivot[1], 0]);
    const b = draw([pivot[0], pivot[1] + 1, 0]);
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(dx, dy) || 1;
    const dir = [dx / length, dy / length];
    const perp = [-dir[1], dir[0]];
    const arm = unit * 10;
    const at = [
      Math.min(...pts.map((p) => p[0])) + arm * 0.4,
      Math.min(...pts.map((p) => p[1])) - arm * 0.9,
    ];
    const tip = [at[0] + dir[0] * arm, at[1] + dir[1] * arm];
    const tail = [at[0] - dir[0] * arm, at[1] - dir[1] * arm];
    const wing = (side) => [
      tip[0] - dir[0] * arm * 0.42 + perp[0] * arm * 0.17 * side,
      tip[1] - dir[1] * arm * 0.42 + perp[1] * arm * 0.17 * side,
    ];
    const label = [at[0] + dir[0] * arm * 1.6, at[1] + dir[1] * arm * 1.6];
    return { tip, tail, head: [tip, wing(1), wing(-1)], label, arm };
  })();
  pts.push(northArrow.tip, northArrow.tail, northArrow.label);

  const pad = 1.5;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const vb = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + pad * 2,
    Math.max(...ys) - Math.min(...ys) + pad * 2,
  ];
  const root = svg('svg', {
    viewBox: vb.join(' '),
    role: 'img',
    'aria-label': 'Axonometric of the simulated zone',
  });
  const line = (p, q, attrs) =>
    svg('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], 'vector-effect': 'non-scaling-stroke', ...attrs });

  // The wireframe underlay first, so the near faces sit on top of it.
  const wire = svg('g', { stroke: 'var(--ink-ghost)', 'stroke-width': 0.6, opacity: 0.55 });
  for (const [p, q] of edges) wire.append(line(p, q));
  /*
   * The hatch an adiabatic surface is filled with.
   *
   * A doubled outline was tried first — the party-wall convention the console's
   * boundary key uses — and it reads wrongly here: inset inside a filled face
   * it makes a rim, and the box turns into an open tray. Hatching is what a
   * drawing does to a surface that is cut rather than seen, which is exactly
   * what an adiabatic surface is: the model stops at its inside face.
   *
   * Spaced in `unit`s rather than user units so the hatch is the same density
   * on a 4 m box and a 40 m one, since the drawing is scaled to fit either.
   */
  const defs = svg('defs');
  const hatch = svg('pattern', {
    id: 'axon-adiabatic',
    width: unit * 3.6,
    height: unit * 3.6,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  hatch.append(
    svg('line', {
      x1: 0, y1: 0, x2: 0, y2: unit * 3.6,
      stroke: 'var(--ink-3)', 'stroke-width': unit * 0.5,
    }),
  );
  defs.append(hatch);
  root.append(defs);
  // Deaf to the pointer, because it stands over the face it describes and the
  // face is a control. A filled polygon takes clicks by default, so the hatch
  // laid over an adiabatic surface swallowed every click on it: the surface
  // could be sent adiabatic and never brought back, since the first flip put
  // this on top of the only thing that would have flipped it back.
  const cut = (screen, opacity) =>
    svg('polygon', {
      points: screen.map((p) => p.join(',')).join(' '),
      fill: 'url(#axon-adiabatic)',
      opacity,
      stroke: 'none',
      'pointer-events': 'none',
    });
  // A surface facing away is hatched under the wireframe, so it reads at the
  // weight the far side of the box reads at and never as the nearest thing in
  // the drawing.
  for (const l of poche) if (!l.front) wire.append(cut(l.screen, 0.35));
  root.append(wire);

  const fill = meanC == null ? 'var(--ink-3)' : tint(meanC);
  // A surface can be flipped by clicking it, but only while the Fabric channel
  // is in the path: patched out, the model sends all six adiabatic whatever
  // the parameters say, and a click that moved a parameter without moving the
  // drawing would be the sheet telling the reader something untrue about what
  // it had just done. The strip says why, which is where that belongs.
  const flippable = modelState?.get('fabric')?.engaged ?? false;
  for (const f of faces) {
    const poly = svg('polygon', {
      points: f.screen.map((p) => p.join(',')).join(' '),
      fill,
      'fill-opacity': meanC == null ? f.alpha * 0.35 : f.alpha,
      stroke: 'var(--ink)',
      'stroke-width': 0.9,
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
    });
    const key = flippable ? boundaryKeyFor(f.surface.name) : null;
    if (key) {
      const { face } = controlFor(key);
      const state = params[key];
      poly.style.cursor = 'pointer';
      poly.classList.add('axon-face');
      const said = phraseFor(key);
      const title = svg('title');
      title.textContent =
        `${said[0].toUpperCase()}${said.slice(1)} is ${face.format(state)}. ` +
        `Click for ${face.flip(state)}.`;
      poly.append(title);
      poly.addEventListener('click', () => commit(key, face.flip(params[key]), true));
    }
    root.append(poly);
  }
  for (const l of poche) if (l.front) root.append(cut(l.screen, 0.9));

  // Glazing, drawn after the walls so it reads as an opening cut into one.
  // Filled with the paper itself rather than a tint — the wall is carrying the
  // temperature colour, and glass has to stay legible against any of it — then
  // struck through on the diagonal, the way glass is marked in elevation.
  // Deaf to the pointer for the same reason the hatch is: an opening is cut
  // into a surface and stands in front of it, and a wall at 0.9 glazing is
  // nearly all glass — a click that landed on the light and stopped there
  // would take the drawing's own control away from the walls most worth
  // flipping.
  for (const win of WINDOWS) {
    const screen = win.verts.map(draw);
    const points = screen.map((p) => p.join(',')).join(' ');
    root.append(
      svg('polygon', {
        points,
        fill: 'var(--sheet)',
        'fill-opacity': 0.72,
        stroke: 'var(--ink)',
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }),
    );
    root.append(
      svg('line', {
        x1: screen[1][0], y1: screen[1][1], x2: screen[3][0], y2: screen[3][1],
        stroke: 'var(--ink-3)', 'stroke-width': 0.6, opacity: 0.7,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }),
    );
  }

  // The overhang, drawn over both: from the south-east it is the nearest thing
  // in the drawing to the eye. It takes no tint — it is not a surface of the
  // zone and has no temperature — so it reads as the solid it is, and the
  // hairline along its outer edge is what the eye measures the projection by.
  for (const screen of shades) {
    root.append(
      svg('polygon', {
        points: screen.map((p) => p.join(',')).join(' '),
        fill: 'var(--ink-3)',
        'fill-opacity': 0.42,
        stroke: 'var(--ink)',
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
        // Deaf, like the hatch and the glass: one rule for the whole drawing,
        // which is that the six surfaces are the only things in it a pointer
        // can be on. A shade hangs on the wall it shelters and stands nearest
        // the eye, so anything else leaves dead patches over the surfaces it
        // covers.
        'pointer-events': 'none',
      }),
    );
  }

  // Dimension lines, drawn the way they are drawn on paper: extension lines,
  // slash ticks, text set along the line.
  const dimG = svg('g', { stroke: 'var(--ink-3)', 'stroke-width': 0.5, opacity: 0.85 });
  for (const g of dimGeo) {
    dimG.append(line(g.from, g.a, { 'stroke-dasharray': '2 2' }));
    dimG.append(line(g.to, g.b, { 'stroke-dasharray': '2 2' }));
    dimG.append(line(g.a, g.b));
    for (const p of [g.a, g.b]) {
      dimG.append(
        svg('line', {
          x1: -tickHalf, y1: tickHalf, x2: tickHalf, y2: -tickHalf,
          transform: `translate(${p[0]} ${p[1]}) rotate(${g.angle})`,
          'vector-effect': 'non-scaling-stroke',
        }),
      );
    }
    // Keep lettering upright: never let a dimension read upside down.
    const flip = g.angle > 90 || g.angle < -90 ? 180 : 0;
    const label = svg('text', {
      transform: `translate(${g.anchor[0]} ${g.anchor[1]}) rotate(${g.angle + flip})`,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'var(--ink-3)',
      stroke: 'none',
      'font-family': 'var(--mono)',
      'font-size': fontSize,
    });
    label.textContent = g.text;
    dimG.append(label);
  }
  root.append(dimG);

  const rose = svg('g');
  rose.append(
    svg('line', {
      x1: northArrow.tail[0], y1: northArrow.tail[1],
      x2: northArrow.tip[0], y2: northArrow.tip[1],
      stroke: 'var(--ink-3)', 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke',
    }),
  );
  rose.append(
    svg('polygon', {
      points: northArrow.head.map((p) => p.join(',')).join(' '),
      fill: 'var(--ink-3)', stroke: 'none',
    }),
  );
  const northLabel = svg('text', {
    x: northArrow.label[0], y: northArrow.label[1],
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: 'var(--ink-3)', 'font-family': 'var(--cond)',
    'font-size': fontSize * 0.95, 'letter-spacing': '0.12em',
  });
  northLabel.textContent = 'N';
  rose.append(northLabel);
  root.append(rose);

  host.append(root);

  // The tint is a quantity, so it is reported with the others below the drawing.
  $('q-chip').style.background = meanC == null ? 'transparent' : tint(meanC);
  $('q-mean').textContent = meanC == null ? '—' : `${meanC.toFixed(1)} °C`;
}

/* ══ the plate: zone against outdoors, on a ruled field ══════════════════ */

const PAD = { t: 18, r: 68, b: 30, l: 46 }; // right gutter holds the curve labels
const H = 268;
let SURFACES = [];
let WINDOWS = [];
let SHADES = [];
let DATUMS = [];
let plot = null; // last rendered dataset, kept so a resize can redraw it
// The zone curve as it stood when the current gesture began. Auto-solve makes a
// result arrive every second or so, and a number that changes with no record of
// what it changed from is just a flicker — this is what turns each solve into a
// reading. Only the zone series: the design days are fixed, so the outdoor
// curve is the same line in every run and a ghost of it would say nothing.
let ghost = null;

function niceStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

function bucket(values, n) {
  const size = values.length / n;
  return Array.from({ length: n }, (_, i) => {
    const slice = values.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
    return {
      min: Math.min(...slice),
      max: Math.max(...slice),
      mean: slice.reduce((a, b) => a + b, 0) / slice.length,
    };
  });
}

function renderTrace() {
  const host = $('trace');
  const w = Math.max(host.clientWidth, 320);
  host.textContent = '';

  const inner = { w: w - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  // The ghost is inside the field it is drawn on, so it has to be inside the
  // domain too — otherwise a shape that was hotter than the current one gets
  // clipped at the top of the plate.
  const showGhost = Boolean(plot && ghost && ghost.length === plot.zone.length);
  const vals = plot ? [...plot.zone, ...plot.out, ...(showGhost ? ghost : [])] : [];
  const lo = Math.min(...DATUMS.map((d) => d.value), ...(vals.length ? vals : [0]));
  const hi = Math.max(...DATUMS.map((d) => d.value), ...(vals.length ? vals : [0]));
  const span = (hi - lo) || 1;
  const [dMin, dMax] = [lo - span * 0.1, hi + span * 0.12];
  const y = (v) => PAD.t + inner.h - ((v - dMin) / (dMax - dMin)) * inner.h;
  const x = (i, n) => PAD.l + (n <= 1 ? inner.w / 2 : (i / (n - 1)) * inner.w);

  const root = svg('svg', {
    viewBox: `0 0 ${w} ${H}`,
    width: '100%',
    height: H,
    role: 'img',
    'aria-label': 'Zone mean air temperature against outdoor drybulb temperature',
  });

  // ── ruling
  const grid = svg('g', { 'shape-rendering': 'crispEdges' });
  const right = w - PAD.r;
  const step = niceStep(dMax - dMin, 6);
  for (let v = Math.ceil(dMin / step) * step; v <= dMax; v += step) {
    const gy = Math.round(y(v)) + 0.5;
    grid.append(
      svg('line', { x1: PAD.l, y1: gy, x2: right, y2: gy, stroke: 'var(--rule-soft)', 'stroke-width': 1 }),
    );
    const t = svg('text', {
      x: PAD.l - 10, y: gy + 3.5, 'text-anchor': 'end',
      fill: 'var(--ink-3)', 'font-family': 'var(--mono)', 'font-size': 10,
    });
    t.textContent = `${Math.round(v)}°`;
    grid.append(t);
  }
  grid.append(
    svg('line', {
      x1: PAD.l - 0.5, y1: PAD.t, x2: PAD.l - 0.5, y2: PAD.t + inner.h,
      stroke: 'var(--rule)', 'stroke-width': 1,
    }),
  );
  root.append(grid);

  // ── design-day datums
  for (const d of DATUMS) {
    const gy = y(d.value);
    root.append(
      svg('line', {
        x1: PAD.l, y1: gy, x2: right, y2: gy,
        stroke: d.value < 0 ? 'var(--cold)' : 'var(--warm)',
        'stroke-width': 1, 'stroke-dasharray': '1 4', opacity: 0.75,
      }),
    );
    const t = svg('text', {
      x: PAD.l + 6, y: gy - 5,
      fill: d.value < 0 ? 'var(--cold)' : 'var(--warm)',
      'font-family': 'var(--cond)', 'font-size': 9.5, 'letter-spacing': '0.12em',
    });
    t.textContent = `${d.label.toUpperCase()} ${d.value.toFixed(1)}`;
    root.append(t);
  }

  if (!plot) {
    const t = svg('text', {
      x: PAD.l + inner.w / 2, y: PAD.t + inner.h / 2 + 4, 'text-anchor': 'middle',
      fill: 'var(--ink-ghost)', 'font-family': 'var(--cond)', 'font-size': 11,
      'letter-spacing': '0.16em',
    });
    t.textContent = 'AWAITING RUN';
    root.append(t);
    host.append(root);
    return;
  }

  const n = plot.zone.length;
  const dense = n > 900;
  const cols = dense ? Math.min(Math.floor(inner.w), 520) : n;

  const bandPath = (bins) => {
    const top = bins.map((b, i) => `${x(i, bins.length).toFixed(2)},${y(b.max).toFixed(2)}`);
    const bot = bins.map((b, i) => `${x(i, bins.length).toFixed(2)},${y(b.min).toFixed(2)}`).reverse();
    return `M${top.join('L')}L${bot.join('L')}Z`;
  };
  const linePath = (vals) =>
    'M' + vals.map((v, i) => `${x(i, vals.length).toFixed(2)},${y(v).toFixed(2)}`).join('L');

  // The shape you took hold of, drawn first so the live curve reads on top of
  // it. Same pen, no weight: this is where the building was, not a second
  // measurement.
  if (showGhost) {
    root.append(
      svg('path', {
        d: linePath(ghost), fill: 'none', stroke: 'var(--redline)',
        'stroke-width': 1.1, opacity: 0.34, 'stroke-linejoin': 'round',
      }),
    );
  }

  if (dense) {
    const ob = bucket(plot.out, cols);
    const zb = bucket(plot.zone, cols);
    root.append(svg('path', { d: bandPath(ob), fill: 'var(--ink-ghost)', 'fill-opacity': 0.32 }));
    root.append(svg('path', { d: bandPath(zb), fill: 'var(--redline)', 'fill-opacity': 0.28 }));
    root.append(
      svg('path', {
        d: linePath(zb.map((b) => b.mean)), fill: 'none',
        stroke: 'var(--redline)', 'stroke-width': 1.4, 'stroke-linejoin': 'round',
      }),
    );
  } else {
    root.append(
      svg('path', {
        d: linePath(plot.out), fill: 'none', stroke: 'var(--ink-ghost)',
        'stroke-width': 1.4, 'stroke-dasharray': '4 3', 'stroke-linejoin': 'round',
      }),
    );
    root.append(
      svg('path', {
        d: linePath(plot.zone), fill: 'none', stroke: 'var(--redline)',
        'stroke-width': 1.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }),
    );
  }

  /*
   * ── the reading hour
   *
   * The instant every meter on the desk is reading, drawn on the one picture
   * that has an axis for it. Before this the hour was stated only in the rail's
   * footer — ten-pixel mono at the foot of a desk you had to open first — which
   * made the single most movable thing about the readings the least visible.
   * The desk's own rule is that a path is readable without opening anything;
   * the hour the paths are read at had better be too.
   *
   * The head is the same square the patch buttons and the rail's pin carry:
   * filled `--redline` when the hour is held, a hairline outline when it is
   * whichever hour this run happened to be worst at. One armed idiom, three
   * places.
   *
   * Guarded on the series lengths agreeing, the way the ghost is: a station
   * change redraws the plate with the new city's datums while the previous
   * run's curve is still standing, and an index into a run that is no longer
   * the one plotted would put the marker at an hour nobody is reading.
   */
  const reading = lastReadFrom?.points.length === n ? lastReadFrom : null;
  if (reading) {
    const mx = x(reading.at, n);
    const held = Boolean(pinnedHour);
    const ink = held ? 'var(--redline)' : 'var(--ink-ghost)';
    const mark = svg('g', { 'pointer-events': 'none' });
    mark.append(
      svg('line', {
        x1: mx, y1: PAD.t + 5, x2: mx, y2: PAD.t + inner.h,
        stroke: ink, 'stroke-width': 1,
        'stroke-dasharray': held ? null : '2 3',
        'shape-rendering': 'crispEdges',
      }),
    );
    mark.append(
      svg('rect', {
        x: mx - 3.5, y: PAD.t - 1, width: 7, height: 7,
        fill: held ? 'var(--redline)' : 'none',
        stroke: held ? 'var(--redline)' : 'var(--ink-ghost)', 'stroke-width': 1,
      }),
    );
    // The point on the zone curve the desk is actually reading off.
    mark.append(
      svg('circle', { cx: mx, cy: y(plot.zone[reading.at]), r: 2.6, fill: ink }),
    );
    const title = svg('title');
    title.textContent = `${held ? 'Held at' : 'Read at'} ${stampText(reading.points, reading.at)}`;
    mark.append(title);
    root.append(mark);
    // The plate's description says what it is now showing, since the marker is
    // part of the picture a reader who cannot see it is being told about.
    root.setAttribute(
      'aria-label',
      `Zone mean air temperature against outdoor drybulb temperature. ` +
        `The desk's meters are ${held ? 'held at' : 'reading at'} ` +
        `${stampText(reading.points, reading.at)}.`,
    );
  }

  // ── direct labels in the right gutter beat a legend box
  const labels = [
    { text: 'Zone', y: y(plot.zone[n - 1]), fill: 'var(--redline)', opacity: 1 },
    { text: 'Outdoor', y: y(plot.out[n - 1]), fill: 'var(--ink-3)', opacity: 1 },
  ];
  if (showGhost) {
    labels.push({ text: 'Was', y: y(ghost[n - 1]), fill: 'var(--redline)', opacity: 0.55 });
  }
  // Three labels can converge on one point when the curves end together, so
  // settle them top to bottom against a minimum gap rather than nudging pairs.
  labels.sort((a, b) => a.y - b.y);
  const GAP = 11.5;
  for (const [i, l] of labels.entries()) {
    if (i > 0) l.y = Math.max(l.y, labels[i - 1].y + GAP);
  }
  for (const l of labels) {
    const t = svg('text', {
      x: right + 8, y: Math.max(PAD.t + 4, Math.min(l.y + 3.5, PAD.t + inner.h)),
      fill: l.fill, opacity: l.opacity,
      'font-family': 'var(--cond)', 'font-size': 10, 'letter-spacing': '0.11em', 'font-weight': 500,
    });
    t.textContent = l.text.toUpperCase();
    root.append(t);
  }

  // ── x axis: one label per environment, or per month for an annual run
  const axis = svg('g');
  for (const seg of plot.segments) {
    const x0 = x(seg.start, n);
    const x1 = x(Math.min(seg.end, n - 1), n);
    if (seg.start > 0) {
      axis.append(
        svg('line', {
          x1: x0, y1: PAD.t, x2: x0, y2: PAD.t + inner.h,
          stroke: 'var(--rule)', 'stroke-width': 1, 'shape-rendering': 'crispEdges',
        }),
      );
    }
    const t = svg('text', {
      x: (x0 + x1) / 2, y: H - 10, 'text-anchor': 'middle',
      fill: 'var(--ink-3)', 'font-family': 'var(--cond)', 'font-size': 9.5, 'letter-spacing': '0.12em',
    });
    t.textContent = seg.label.toUpperCase();
    axis.append(t);
  }
  root.append(axis);

  /*
   * ── choosing the hour
   *
   * Point at the moment you want explained. The curve is the instrument, and
   * pointing at it is reading back off the model in the same sense everything
   * else here is.
   *
   * This used to be the *only* way to choose an hour, on the argument that a
   * date field asks the reader to type "14 February, 15:00" at a picture of 14
   * February already on the screen, and invites February the 30th and hour 25
   * purely to meet a refusal message. Half of that still holds and half of it
   * never did. The objection was to a *free* date field validated by refusal;
   * a picker whose every option is walked out of the run's own timestamps
   * cannot express an hour the run does not contain, so there is nothing left
   * to refuse. And the gesture has a reach it cannot argue its way out of: an
   * annual plate at ten hours to the pixel is physically unable to name 15:00
   * on 14 February, and a pointer is not the keyboard's instrument at all.
   * Both routes now stand, under `renderWhen` — the curve for the hour you can
   * see, the picker for the hour you can name.
   */
  // Where the field the marker travels in ended up, so the gesture below can
  // hit-test it. Read off the render rather than measured on demand, because
  // this function is the only thing that knows where it put the field — and
  // it redraws on every step of a drag, including the ones that drag makes.
  plateField = reading
    ? {
        root,
        w,
        innerW: inner.w,
        n,
        // Snapping is decided by the axis's own resolution rather than by run
        // kind, because the resolution is what the reader is actually up
        // against and it moves with the window: an annual run at ten hours to
        // the pixel cannot mean an hour, a design day at five pixels to the
        // hour can.
        snap: n / inner.w > 1,
      }
    : null;
  host.classList.toggle('pickable', Boolean(reading));

  host.append(root);
}

/*
 * ── choosing the hour by hand
 *
 * Point at the moment you want explained, and keep pointing: press on the
 * curve and the marker follows the pointer, with every meter on the desk, the
 * rail's total and the bar under the plate re-lettering as it goes. Nothing is
 * simulated — the run is already in hand and the hour is only a way of reading
 * it, so a drag here costs a re-read of an array and not a solve.
 *
 * Three details this arrangement turns on:
 *
 *  - **The listeners are on the host, not on the SVG.** Every step of the drag
 *    re-letters the reading, which redraws the plate, which throws away the
 *    `<svg>` the gesture started on — and with it any pointer capture held on
 *    it, so the drag would end silently on its first frame. `.trace` survives
 *    the redraw; the SVG inside it is looked up per event through
 *    `plateField.root` for the box to measure against.
 *  - **A press that never travels is still a click**, and a click toggles the
 *    hour it names, so the plate can undo its own gesture. A drag must not:
 *    letting go where you started after travelling out and back would
 *    otherwise release the pin the drag had just placed.
 *  - **The address bar is left alone until the release**, the rule every other
 *    gesture on this page follows. `endGesture` is not used because a pin is
 *    not a shape — it starts no solve, sets no results baseline and re-queues
 *    no study — so the suppression is passed down instead.
 */
let plateField = null;
let plateDrag = null; // { pointerId, at, moved, frame }

/** Which point of the plotted series a client x lands on, or null. */
function plateIndexAt(clientX, { clamped = false } = {}) {
  if (!plateField) return null;
  const box = plateField.root.getBoundingClientRect();
  if (!box.width) return null;
  const { w, innerW, n } = plateField;
  // The viewBox is `0 0 w H` against a width of 100 %, so a client pixel is
  // `w / box.width` user units — read per event rather than cached, since the
  // plate resizes with the window and with the desk opening.
  const px = (clientX - box.left) * (w / box.width);
  const i = Math.round(((px - PAD.l) / innerW) * (n - 1));
  // A press outside the field is not a pick: the gutters carry the axis labels
  // and the curve names, and the left one is where the pointer rests on its
  // way to the temperature scale. Once a drag is under way the same overshoot
  // means the end of the axis, so it clamps instead.
  if (i < 0 || i > n - 1) return clamped ? Math.min(n - 1, Math.max(0, i)) : null;
  return i;
}

{
  const host = $('trace');

  host.addEventListener('pointerdown', (event) => {
    if (!plateField || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const at = plateIndexAt(event.clientX);
    if (at == null) return;
    plateDrag = { pointerId: event.pointerId, at, moved: false, frame: 0 };
    host.setPointerCapture(event.pointerId);
    host.classList.add('dragging');
    // Keeps a press on the curve from starting a text selection across the
    // sheet. Vertical scrolling on a touch screen is left alone by
    // `touch-action: pan-y`, which is a decision the stylesheet makes.
    event.preventDefault();
  });

  host.addEventListener('pointermove', (event) => {
    if (!plateDrag || event.pointerId !== plateDrag.pointerId) return;
    const at = plateIndexAt(event.clientX, { clamped: true });
    if (at == null || at === plateDrag.at) return;
    plateDrag.at = at;
    plateDrag.moved = true;
    // One re-read per frame. Pointer events are coalesced to the frame in most
    // engines already, but a drag across an annual plate at ten hours to the
    // pixel is a thousand distinct hours and the rail is rebuilt at each one.
    if (plateDrag.frame) return;
    plateDrag.frame = requestAnimationFrame(() => {
      if (!plateDrag) return;
      plateDrag.frame = 0;
      pinFromPlate(plateDrag.at, plateField?.snap ?? false, { hold: true, address: false });
    });
  });

  const release = (event) => {
    if (!plateDrag || event.pointerId !== plateDrag.pointerId) return;
    const { at, moved, frame } = plateDrag;
    if (frame) cancelAnimationFrame(frame);
    plateDrag = null;
    host.classList.remove('dragging');
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    // `hold` on a drag, so letting go where you started does not release the
    // pin that drag placed; a press that never moved is a click and toggles.
    pinFromPlate(at, plateField?.snap ?? false, { hold: moved });
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);
}

let resizeTimer;

/* ══ reading the results ═════════════════════════════════════════════════ */

const stats = (v) => {
  const min = Math.min(...v);
  const max = Math.max(...v);
  return { min, max, mean: v.reduce((a, b) => a + b, 0) / v.length, swing: max - min };
};

/**
 * Design days become one labelled band each; a year long enough to crowd them
 * gets month ticks instead.
 *
 * An annual run is both at once — two design days ahead of a year — and each
 * environment is bucketed on its own, because running the month walk across the
 * whole axis would print the design days as two more months and set their names
 * against the year's January.
 *
 * Whether a band is lettered is decided by how wide it lands, not by what kind
 * of environment it came from. Twenty-four hours out of 8,808 is far too narrow
 * a band to letter, so the design days keep their rule and give up their label;
 * a run period of one month is half of a two-month axis and takes its name. A
 * count-based rule got this wrong the moment a run period could be a single
 * month: a desk set to January and July drew four bands and lettered none of
 * them.
 */
function axisSegments(points, runs) {
  if (runs.length > 1 && points.length <= 400) return runs;
  const months = (run) => {
    const found = [];
    for (let i = run.start; i <= run.end; i++) {
      const m = points[i].timestamp.month;
      if (!found.length || found.at(-1).key !== m) found.push({ key: m, start: i, end: i, label: MONTHS[m - 1] });
      else found.at(-1).end = i;
    }
    return found;
  };
  // Six per cent of the axis: below it a label sits over a band narrower than
  // the label itself and reads as belonging to its neighbour.
  const wide = (seg) => (seg.end - seg.start + 1) / points.length > 0.06;
  return runs.flatMap((run) =>
    months(run).map((seg) => (wide(seg) ? seg : { ...seg, label: '' })),
  );
}

function metricsFor(zone, out, run, hasOutdoor, demand = null) {
  const slice = (a) => a.slice(run.start, run.end + 1);
  const z = stats(slice(zone));
  const o = stats(slice(out));
  const damping = hasOutdoor && o.swing > 0.05 ? z.swing / o.swing : NaN;
  const lag = hasOutdoor ? slice(zone).indexOf(z.max) - slice(out).indexOf(o.max) : NaN;
  // `demand` is this environment's own meters, or null where there are none to
  // read — a design day, or a desk with the System strip bypassed.
  return { z, o, damping, lag, hours: run.end - run.start + 1, hasOutdoor, demand };
}

const f1 = (v) => v.toFixed(1);
const or = (v, fmt) => (Number.isFinite(v) ? fmt(v) : '—');

// A sentence counts in words. `applyRun` writes one run period per unbroken
// group of months, and a twelve-month calendar cannot break into more than
// six, so the list is closed at what the desk can actually produce; the index
// starts at two because one run period is said by its own noun.
const RUN_TALLY = Object.freeze(['', '', 'both', 'all three', 'all four', 'all five', 'all six']);

// A schedule in the drawing sense: quantities down the side, environments
// across the top, units in their own column.
//
// `at` returns the number, not the text, so the same row can be differenced
// against the baseline and formatted to the same precision it is displayed at.
const f2 = (v) => v.toFixed(2);
const SCHEDULE_ROWS = [
  { label: 'Zone mean air temperature, minimum', unit: '°C', marker: 'zone', at: (m) => m.z.min, fmt: f1 },
  { label: 'Zone mean air temperature, maximum', unit: '°C', at: (m) => m.z.max, fmt: f1 },
  { label: 'Zone swing', unit: '°C', at: (m) => m.z.swing, fmt: f1 },
  { label: 'Outdoor drybulb, minimum', unit: '°C', marker: 'out', group: true, at: (m) => (m.hasOutdoor ? m.o.min : NaN), fmt: f1 },
  { label: 'Outdoor drybulb, maximum', unit: '°C', at: (m) => (m.hasOutdoor ? m.o.max : NaN), fmt: f1 },
  { label: 'Outdoor swing', unit: '°C', at: (m) => (m.hasOutdoor ? m.o.swing : NaN), fmt: f1 },
  { label: 'Damping — zone swing ÷ outdoor swing', unit: '', group: true, at: (m) => m.damping, fmt: f2 },
  { label: 'Thermal lag — outdoor peak to zone peak', unit: 'h', at: (m) => m.lag, fmt: String },
  { label: 'Hours simulated', unit: 'h', at: (m) => m.hours, fmt: (v) => v.toLocaleString('en-US'), nodelta: true },
  // The pair the sweep draws, for the desk as it stands. A study answers
  // "what would this control do to the demand"; without these rows the sheet
  // could not answer "what is the demand", and the curve had no point on it
  // the reader could check against the run in front of them. Same readers,
  // same arithmetic — `demandOver` is what the sweep's `readDemand` is built
  // from — so the tick under a study's redline and the figure in this column
  // are the same number whenever the study was swept against this desk.
  //
  // Per environment, because that is what a column of this schedule is. The
  // bill's per-m² row refuses to print on anything short of a whole year, and
  // rightly: it stands under no head that says what period it covers. These
  // do — a column is `Run period · Jan–Mar`, with its own hours a few rows up
  // — so the period is lettered where the reader is already looking, and a
  // partial year reads as itself rather than as nothing.
  { label: 'Thermal energy demand intensity — TEDI', unit: 'kWh/m²', demand: true, at: (m) => m.demand?.tedi ?? NaN, fmt: f1 },
  { label: 'Cooling energy demand intensity — CEDI', unit: 'kWh/m²', demand: true, at: (m) => m.demand?.cedi ?? NaN, fmt: f1 },
];

/**
 * Change against the baseline, at the precision the value is shown at.
 *
 * Formatting both sides first is the point: a shift too small to move the
 * printed number is not a reading, and printing `+0.0` beside every row during a
 * slow drag would bury the rows that did move.
 */
function deltaText(row, value, base) {
  if (row.nodelta || !Number.isFinite(value) || !Number.isFinite(base)) return '';
  if (row.fmt(value) === row.fmt(base)) return '';
  const d = value - base;
  return `${d > 0 ? '+' : '−'}${row.fmt(Math.abs(d))}`;
}

/**
 * Keep a table a table when the stylesheet stops laying it out as one.
 *
 * Below `620px` both schedules fold to a block per row (see the media query at
 * the foot of the stylesheet), and `display: grid` on a `tr` or a `td` drops
 * the implicit table roles in every engine -- so a reader on a screen reader
 * would lose the row and column structure at exactly the width where the
 * figures need it most. The roles are set unconditionally because they are the
 * same ones the elements already carry above the breakpoint: stating them
 * costs nothing there and is the whole structure below it.
 */
function keepTableSemantics(table) {
  table.setAttribute('role', 'table');
  const role = (selector, name) => {
    for (const el of table.querySelectorAll(selector)) el.setAttribute('role', name);
  };
  role('thead, tbody', 'rowgroup');
  role('tr', 'row');
  role('th', 'columnheader');
  role('td', 'cell');
}

function renderSchedule(columns, baseColumns) {
  const table = $('schedule');
  table.textContent = '';
  const cols = columns ?? [{ label: 'Result', metrics: null }];
  // Only difference against a baseline that describes the same environments,
  // so an annual result is never differenced against a design-day one.
  const base =
    baseColumns?.length === cols.length &&
    baseColumns.every((b, i) => b.label === cols[i].label)
      ? baseColumns
      : null;

  const thead = document.createElement('thead');
  const hr = thead.insertRow();
  for (const [i, text] of ['Quantity', ...cols.map((c) => c.label), ''].entries()) {
    const th = document.createElement('th');
    th.textContent = text;
    if (base && i > 0 && i <= cols.length) th.colSpan = 2;
    hr.append(th);
  }
  table.append(thead);

  const tbody = document.createElement('tbody');
  // A demand row with nothing behind it anywhere is left out rather than drawn
  // as a line of em dashes. The em-dash rule is for a reading that was asked
  // for and did not arrive; the System strip bypassed is not a missing
  // measurement but a building with no system in it, and three permanent
  // blanks under every free-running run would be the schedule reporting the
  // absence of a channel rather than the results of a run.
  const rows = SCHEDULE_ROWS.filter(
    (row) => !row.demand || cols.some((c) => c.metrics && Number.isFinite(row.at(c.metrics))),
  );
  // The block's rule sits above whichever of the three survived, since TEDI
  // can be the one that is missing.
  const opensDemand = rows.find((row) => row.demand);

  for (const row of rows) {
    const tr = tbody.insertRow();
    if (row.group || row === opensDemand) tr.className = 'group';
    const head = tr.insertCell();
    if (row.marker) {
      const key = document.createElement('i');
      key.className = `key ${row.marker}`;
      head.append(key);
    }
    head.append(row.label);
    for (const [i, c] of cols.entries()) {
      const value = c.metrics ? row.at(c.metrics) : NaN;
      const td = tr.insertCell();
      // The head this figure stands under, carried on the cell so the narrow
      // layout can letter it beside the figure once the column heads are gone.
      td.dataset.head = c.label;
      td.textContent = or(value, row.fmt);
      if (!Number.isFinite(value)) td.className = 'void';
      if (base) {
        const d = tr.insertCell();
        d.className = 'delta';
        d.textContent = base[i].metrics ? deltaText(row, value, row.at(base[i].metrics)) : '';
      }
    }
    const unit = tr.insertCell();
    unit.className = 'unit';
    unit.textContent = row.unit || '—';
  }
  table.append(tbody);
  keepTableSemantics(table);
}

/* ══ the bill ════════════════════════════════════════════════════════════ */

/**
 * The three ways of measuring the same energy.
 *
 * Declared once, so the composition rule, the table head and the delta
 * arithmetic cannot disagree about what a column is called or how it reads.
 * The formatter is part of the declaration for the same reason `deltaText`
 * formats both sides before differencing them: a change too small to move the
 * printed figure is not a reading.
 */
class BillColumn {
  constructor({ id, label, noun, field, unit, format }) {
    this.id = id;
    this.label = label;
    // The same column said inside a sentence rather than over a column of
    // figures. "At the meter" heads the column honestly and reads as nonsense
    // in prose — "nothing here can be measured in at the meter" — so the two
    // are declared apart, the way an environment's `noun` is kept apart from
    // its `label`.
    this.noun = noun;
    this.field = field;
    this.unit = unit;
    this.format = format;
    Object.freeze(this);
  }

  /** The value on a line, or NaN where nothing was behind it. */
  at(line) {
    const v = line?.[this.field];
    return Number.isFinite(v) ? v : NaN;
  }
}

// What a column is called over a column of figures. Named once, because the
// table head and the head each cell carries for the folded layout have to be
// the same words -- a figure lettered "Carbon" under a column headed
// "Carbon (kgCO₂e)" is a figure whose unit depends on the window width.
const headOf = (column) => (column.unit ? `${column.label} (${column.unit})` : column.label);

const group = (v, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const BILL_COLUMNS = Object.freeze([
  new BillColumn({
    id: 'metered', label: 'At the meter', noun: 'energy', field: 'metered', unit: 'kWh',
    format: (v) => group(v, v < 100 ? 1 : 0),
  }),
  new BillColumn({
    id: 'cost', label: 'Cost', noun: 'a cost', field: 'cost', unit: '',
    format: (v, bill) => bill.currency.format(v, Math.abs(v) < 100 ? 2 : 0),
  }),
  new BillColumn({
    id: 'carbon', label: 'Carbon', noun: 'a carbon figure', field: 'carbon', unit: 'kgCO₂e',
    format: (v) => group(v, Math.abs(v) < 100 ? 1 : 0),
  }),
]);

// The sheet ships with Denver's two design days, so it ships with Colorado's
// tariffs. This is not a default standing in for a missing answer -- it is the
// site the stock model actually describes, and it is replaced whole the moment
// a station is picked.
let station = { country: 'USA', state: 'CO' };
let bill = null;
let pinned = null; // { bill, label } — a scheme held to be measured against
let billGhost = null; // the bill as it stood when this gesture began
let billBasis = BILL_COLUMNS[1]; // cost, because that is the argument that gets had

/*
 * The standard being chased, by preset id, and its worst line as it stood when
 * this gesture began.
 *
 * Kept here beside the bill's pin because it is the same kind of thing: a
 * comparison the reader *chose*, held until they unchoose it. That is what
 * separates it from conformance, which is measured off the controls and never
 * remembered — chasing a standard makes no claim about the building, it only
 * says which of the scoreboard's dozen lines is worth watching while the hand
 * is down. It stays out of the permalink for the same reason the pin does: it
 * is how this desk is being read, not what it is.
 */
let chased = null;
let chaseGhost = null;
/**
 * The run the bill is a reading of, held whole so a tariff can be turned
 * without asking the engine for anything.
 *
 * All four fields are captured at the solve rather than read off live state
 * when the bill is lettered. Attaching a weather file flips `annual()` at once
 * while the meters in hand are still the two design days, which had the bill
 * announcing a year and totalling forty-eight hours.
 */
let lastRun = null; // { eso, environments, hours, annual }

/**
 * The last run the engine was handed, held for the download.
 *
 * Kept apart from `lastRun` above, which is the readings — because the two
 * stop being true at different moments. A run that fatals leaves no readings
 * at all and `clearReadings` takes them down, but it is still a run that
 * happened, and it is the one a reader most needs to carry off the page: the
 * sheet can only show the fatal sentence and a count of severes, while the
 * console the bundle ships carries the whole `eplusout.err` the engine echoed
 * into it. Riding on `lastRun`, as it did, the bundle went down with the
 * readings at exactly the moment it became worth having.
 *
 * So this holds whatever was last attempted, failed or not, and only another
 * attempt replaces it. `failure` carries the sentence the status line
 * reported, which is what tells the manifest which kind of bundle to write.
 */
let lastBundle = null;

/** The published card with the Tariff strip's assumptions written over it. */
const rateCard = () => assume(resolveRates(station), params);

/**
 * Price the meters of one solved run.
 *
 * Kept apart from the run itself so that turning a tariff or a boiler
 * efficiency re-letters the bill from the meters already in hand. Those
 * controls change what the energy is worth, not how much of it there was, and
 * making the engine re-solve to answer them would be both slow and wrong.
 */
function billFrom(run) {
  if (!run) return null;
  const series = new Map();
  for (const use of END_USES) {
    const total = meterTotal(run.eso, use.meter, run.environments);
    if (total != null) series.set(use.meter, total);
  }
  if (!series.size) return null;
  return computeBill({
    series,
    params,
    card: rateCard(),
    floorArea: geometryFacts(model).grossFloor,
    hours: run.hours,
    engaged: new Set([...(modelState ?? [])].filter(([, s]) => s.engaged).map(([id]) => id)),
    annual: run.annual,
    months: run.months,
  });
}

/** Re-letter the bill from the meters already read, with no new run. */
function reprice() {
  if (!lastRun) return;
  bill = billFrom(lastRun);
  repriceStudies();
  renderBill();
  desk?.setReadings(engagedReadings(), derivedReadings(geometryFacts(model)), lastAt, readouts());
  desk?.setDerived(derivedLines());
}

/**
 * Change against the scheme being measured against, at display precision.
 *
 * Same rule as the results schedule: format both sides first, and say nothing
 * when the printed figures agree.
 */
function billDelta(column, value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base)) return '';
  if (column.format(value, bill) === column.format(base, bill)) return '';
  const d = value - base;
  return `${d > 0 ? '+' : '−'}${column.format(Math.abs(d), bill)}`;
}

const cell = (row, text, className, label = null) => {
  const td = row.insertCell();
  td.textContent = text;
  if (className) td.className = className;
  // The column head, carried on the cell. On a phone the register's tables
  // stop being tables — five columns will not fit in a thumb's width — and
  // each row folds to a stack, where a figure with no label beside it is
  // unreadable. Held as data rather than drawn twice, so the head row and the
  // folded label cannot disagree about what a column is called.
  if (label) td.dataset.label = label;
  return td;
};

/**
 * Whether two bills can be differenced at all.
 *
 * Patching a channel out does not make a scheme cheaper, it makes it a
 * different building with fewer lines on its bill, and setting the two side by
 * side would report a saving that is really an absence. The currency has to
 * match for the plainer reason that subtracting euros from dollars is not
 * arithmetic. Same refusal the results schedule makes when its baseline
 * describes another set of environments.
 *
 * The period has to match for the same reason the schedule's does. A weather
 * file stopped meaning a year the day the Run strip's calendar could leave
 * months out, so a scheme pinned on twelve months and then read against a
 * January-to-March run would head every row "Δ against …" and report a
 * three-quarters saving that is nothing but a shorter run. Metered hours
 * rather than months, because February and March are both one month and
 * seventy-two hours apart.
 */
function comparable(a, b) {
  if (!a || !b || a.currency !== b.currency) return false;
  if (a.annual !== b.annual || a.hours !== b.hours) return false;
  const uses = (bill) => bill.lines.map((l) => l.use.id).join();
  return uses(a) === uses(b);
}

function renderBill() {
  const host = $('bill');
  host.hidden = !bill;
  if (!bill) return;

  // What is being measured against, and whether anyone asked for it. A pinned
  // scheme outranks the gesture, because it was chosen and the gesture is
  // merely current. Either is dropped unless it is like for like -- the same
  // end uses in the same currency -- so the schedule never heads a column with
  // a comparison that most of its rows have to leave blank.
  const candidate = pinned?.bill ?? billGhost;
  const against = comparable(bill, candidate) ? candidate : null;
  const againstLabel = !against ? null : pinned ? pinned.label : 'where you took hold';

  renderBillHead(againstLabel);
  renderMeterHeads();
  renderBillBar();
  renderBillTable(against);
  renderBillFinding();
  renderBillNotes();
}

function renderBillHead(againstLabel) {
  $('bill-scope').textContent = againstLabel ? ` Δ against ${againstLabel}` : '';
  // Named in full at the top as well as beside each rate, because "is this a
  // commercial rate or a household one" is the first question anyone sensible
  // asks of a bill they did not receive themselves.
  //
  // The geography is the rate's own `region` rather than the card's country:
  // North America is priced by state and province, so a Colorado bill headed
  // "published for the United States" would name a table one grain coarser
  // than the number it is describing.
  const tariff = bill.card.electricity;
  const priced = !isRate(tariff)
    ? ''
    : tariff.source.id === 'assumed'
      ? ' Priced at the rates assumed on the Tariff strip.'
      : ` Priced at the ${tariff.source.kind.toLowerCase()} published for ${placeName(tariff.region)}, never a residential one, and factored at its grid carbon intensity.`;
  // Three periods, not two. A weather file no longer means a year: months can
  // be taken out of the run, and a bill of ten of them has to say so, because
  // the reader's next move is to compare the total with a year's.
  $('bill-lede').textContent = bill.wholeYear
    ? `Metered across the ${group(bill.hours)}-hour run.${priced}`
    : bill.annual
      ? `Metered across the ${group(bill.hours)} hours of the run — ${bill.months} of the year's twelve months, so this is a bill for those months and not for a year. Put the missing months back on the Run strip for a year's.${priced}`
      : `These are the ${group(bill.hours)} hours of the sizing days — two conditions chosen for being extreme. They are a real bill for a real two days, and they are deliberately not multiplied up into a year; attach a weather file for a year's.${priced}`;
}

/**
 * One head per fuel that arrived, each showing what the amount was built from.
 *
 * The whole reason this section is not three big numbers in boxes: a figure
 * with its rate beside it can be argued with, and an architect who cannot
 * argue with the bill cannot design against it.
 */
function renderMeterHeads() {
  const host = $('bill-meters');
  host.textContent = '';
  for (const row of bill.byFuel) {
    const card = document.createElement('div');
    card.className = 'meterhead';

    const head = document.createElement('h4');
    head.textContent = row.fuel.meterLabel;
    const qty = document.createElement('b');
    qty.className = 'qty';
    qty.textContent = group(row.metered, row.metered < 100 ? 1 : 0);
    qty.append(Object.assign(document.createElement('i'), { textContent: 'kWh' }));

    const buildup = document.createElement('div');
    buildup.className = 'buildup';
    const step = (op, what, amount = '') => {
      buildup.append(
        Object.assign(document.createElement('span'), { className: 'op', textContent: op }),
        Object.assign(document.createElement('span'), { className: 'what', textContent: what }),
        Object.assign(document.createElement('b'), {
          // Blank where a row simply carries no amount, an em dash only where
          // there should have been one and no rate was published. The two must
          // not look alike: this schedule's whole claim is that a missing
          // figure says so.
          className: amount === null ? 'amount void' : 'amount',
          textContent: amount === null ? '—' : amount,
        }),
      );
    };
    // The rate a fuel is priced at, or the reason it could not be.
    step('×', isRate(row.costRate) ? row.costRate.text : row.costRate.what.toLowerCase());
    step('=', 'cost', row.cost == null ? null : bill.currency.format(row.cost, row.cost < 100 ? 2 : 0));
    step('×', isRate(row.carbonRate) ? `${row.carbonRate.value.toFixed(0)} gCO₂e/kWh` : row.carbonRate.what.toLowerCase());
    step('=', 'carbon', row.carbon == null ? null : `${group(row.carbon, row.carbon < 100 ? 1 : 0)} kg`);

    // One line per rate, each opening with what kind of number it is. Run
    // together on a single line the sector was the first thing to get lost.
    const cite = document.createElement('div');
    cite.className = 'cite';
    for (const r of [row.costRate, row.carbonRate].filter(isRate)) {
      const line = document.createElement('span');
      line.append(Object.assign(document.createElement('b'), { textContent: r.source.kind }));
      line.append(r.region === r.source.publisher ? r.region : `${r.source.publisher}, ${r.region}`);
      cite.append(line);
    }

    card.append(head, qty, buildup, cite);
    host.append(card);
  }
}

/**
 * Where it goes, as one measured length divided up.
 *
 * Never a pie and never a colour per end use. This palette has already spent
 * its colour on meaning, so the segments are told apart by tone -- each step
 * out mixed further towards the trough it sits in -- and ranked largest first,
 * so the ramp also ranks them. The three bases are the same energy measured
 * three ways, and watching the order change when you switch from cost to
 * carbon is the finding this whole section exists to hand over.
 */
const TONES = [100, 74, 54, 39, 28];

function renderBillBar() {
  const seg = $('bill-basis');
  if (!seg.childElementCount) {
    for (const column of BILL_COLUMNS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'segment';
      button.textContent = column.id === 'metered' ? 'Energy' : column.label;
      button.addEventListener('click', () => {
        billBasis = column;
        renderBill();
      });
      seg.append(button);
    }
  }
  for (const [i, button] of [...seg.children].entries()) {
    button.classList.toggle('here', BILL_COLUMNS[i] === billBasis);
    button.setAttribute('aria-pressed', String(BILL_COLUMNS[i] === billBasis));
  }

  const track = $('bill-track');
  const key = $('bill-key');
  track.textContent = '';
  key.textContent = '';

  const ranked = bill.ranked(billBasis.field);
  const total = ranked.reduce((a, l) => a + billBasis.at(l), 0);
  if (!total) {
    key.append(
      Object.assign(document.createElement('p'), {
        className: 'bill-note',
        textContent:
          billBasis.id === 'metered'
            ? 'Nothing on this run metered any energy at all.'
            : `Nothing on this run can be given ${billBasis.noun} — the rate behind it was not published for this location.`,
      }),
    );
    return;
  }

  const toneOf = (i) => `color-mix(in srgb, var(--ink) ${TONES[Math.min(i, TONES.length - 1)]}%, var(--inset))`;
  for (const [i, line] of ranked.entries()) {
    const fill = toneOf(i);
    const bar = document.createElement('i');
    bar.className = 'bar-seg';
    bar.style.width = `${(billBasis.at(line) / total) * 100}%`;
    bar.style.background = fill;
    bar.title = `${line.use.label}: ${billBasis.format(billBasis.at(line), bill)}`;
    track.append(bar);

    // Keyed in the order they are laid, so a swatch can be matched to its
    // segment by walking along the rule.
    const item = document.createElement('div');
    item.className = 'bar-item';
    const swatch = document.createElement('i');
    swatch.className = 'bar-swatch';
    swatch.style.background = fill;
    item.append(
      swatch,
      Object.assign(document.createElement('span'), { textContent: line.use.label }),
      Object.assign(document.createElement('b'), {
        textContent: billBasis.format(billBasis.at(line), bill),
      }),
      Object.assign(document.createElement('em'), {
        textContent: `${((billBasis.at(line) / total) * 100).toFixed(0)} %`,
      }),
    );
    key.append(item);
  }
}

function renderBillTable(against) {
  const table = $('bill-table');
  table.textContent = '';
  const diverging = bill.divergence?.line ?? null;

  const thead = document.createElement('thead');
  const hr = thead.insertRow();
  const th = (text, span = 1) => {
    const el = document.createElement('th');
    el.textContent = text;
    el.colSpan = span;
    hr.append(el);
  };
  th('End use');
  for (const column of BILL_COLUMNS) th(headOf(column), against ? 2 : 1);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const line = (row, values, { className = '', head = null, note = null, mark = false, base = null } = {}) => {
    const tr = tbody.insertRow();
    if (className) tr.className = className;
    const first = tr.insertCell();
    first.append(head ?? '');
    if (mark) first.append(Object.assign(document.createElement('i'), { className: 'diverges' }));
    if (note) {
      first.append(document.createElement('br'));
      const small = document.createElement('span');
      small.className = 'plant-note';
      small.textContent = note;
      first.append(small);
    }
    for (const [i, column] of BILL_COLUMNS.entries()) {
      const v = values[i];
      // Each figure carries its own head, for the same reason the results
      // schedule's do: below the breakpoint the row folds and the head above
      // the column is no longer above anything.
      const td = cell(tr, Number.isFinite(v) ? column.format(v, bill) : '—', Number.isFinite(v) ? '' : 'void');
      td.dataset.head = headOf(column);
      if (against) cell(tr, base ? billDelta(column, v, base[i]) : '', 'delta');
    }
    return tr;
  };

  const width = 1 + BILL_COLUMNS.length * (against ? 2 : 1);
  for (const section of GROUPS) {
    const rows = bill.section(section.id);
    if (!rows.length) continue;
    // A section heading is a heading, not a row of empty readings: one cell
    // across the schedule, the way a works section is titled in a priced bill.
    const head = tbody.insertRow();
    head.className = 'section';
    cell(head, section.label).colSpan = width;

    for (const row of rows) {
      const baseRow = against?.lines.find((l) => l.use === row.use);
      line(row, BILL_COLUMNS.map((c) => c.at(row)), {
        head: row.use.label,
        mark: row.use === diverging,
        note: row.divisor
          ? `${group(row.delivered, row.delivered < 100 ? 1 : 0)} kWh delivered ÷ ${row.divisor.value.toFixed(2)} ${row.divisor.noun}, ${row.divisor.label.toLowerCase()}`
          : null,
        base: baseRow ? BILL_COLUMNS.map((c) => c.at(baseRow)) : null,
      });
    }

    line(null, BILL_COLUMNS.map((c) => bill.total(c.field, section.id) ?? NaN), {
      className: 'sum',
      head: `${section.label} total`,
      base: against ? BILL_COLUMNS.map((c) => against.total(c.field, section.id) ?? NaN) : null,
    });

    // Per square metre only on a whole year. The figure exists to be held
    // against a published benchmark, every one of which is annual, and 0.3
    // kgCO₂e/m² over two design days — or 14 kWh/m² over a winter taken alone
    // — is a number whose only possible use is to be mistaken for one.
    if (section.id === 'building' && bill.wholeYear) {
      line(null, BILL_COLUMNS.map((c) => bill.intensity(c.field) ?? NaN), {
        className: 'sum',
        head: 'Per m² of floor, per year',
        base: against ? BILL_COLUMNS.map((c) => against.intensity(c.field) ?? NaN) : null,
      });
    }
  }

  line(null, BILL_COLUMNS.map((c) => bill.total(c.field) ?? NaN), {
    className: 'sum total',
    head: 'Everything metered',
    base: against ? BILL_COLUMNS.map((c) => against.total(c.field) ?? NaN) : null,
  });

  table.append(tbody);
  keepTableSemantics(table);
}

/**
 * Where cost and carbon disagree, said in a sentence.
 *
 * This is the argument the section exists to start, so it is stated in words
 * and not left for the reader to spot by comparing two orderings.
 */
function renderBillFinding() {
  const host = $('bill-finding');
  host.textContent = '';
  const d = bill.divergence;
  if (!d) return;

  const q = (text) =>
    Object.assign(document.createElement('span'), { className: 'q', textContent: text });
  // Nothing is the "first largest" anything.
  const ordinal = (n) => ['', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n + 1}th`;
  host.append(
    `${d.line.use.label} is only the `,
    q(ordinal(d.cost)),
    ' largest cost here but the ',
    ...(d.carbon === 0 ? [] : [q(ordinal(d.carbon)), ' ']),
    `largest emitter, because it runs on ${d.line.fuel.label.toLowerCase()} at `,
    q(`${d.line.carbonRate.value.toFixed(0)} gCO₂e/kWh`),
    '. Designing against the bill and designing against the carbon are not the same brief.',
  );
}

// A dataset's name and vintage, unless the vintage is already the name -- an
// assumed rate has no period and "assumed (assumed)" is not a citation.
const cited = (source) =>
  source.period === 'assumed' ? source.short : `${source.short} (${source.period})`;

function renderBillNotes() {
  const absences = bill.card.absences;
  $('bill-absences').textContent = absences.length
    ? `${absences.map((a) => `${a.what}: ${a.reason}`).join(' ')} Those figures read as an em dash and are left out of every total on this schedule.`
    : '';

  const refs = $('bill-refs');
  refs.textContent = '';
  refs.append('Rates and factors from ');
  const sources = bill.card.sources;
  for (const [i, source] of sources.entries()) {
    if (i) refs.append(i === sources.length - 1 ? ' and ' : ', ');
    if (source.url) {
      const a = document.createElement('a');
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = cited(source);
      refs.append(a);
    } else {
      refs.append(cited(source));
    }
  }
  refs.append('.');
}

/* ── pinning a scheme ─────────────────────────────────────────────────────
 *
 * The gesture ghost answers "what did that move just do", and evaporates when
 * you let go. A scheme has to outlast that: an architect works one option for
 * twenty minutes before comparing it with another, so the pin holds a whole
 * bill until it is unpinned, and every bill after it reads as a change against
 * the scheme rather than against the last thing they touched.
 */
const pinButton = $('bill-pin');

function syncPin() {
  pinButton.setAttribute('aria-pressed', String(Boolean(pinned)));
  // Just the state. Which scheme is pinned is lettered in the eyebrow beside
  // the heading, where it is set in the schedule's own type and keeps its
  // lowercase unit -- run through this button's tracked capitals, `4.57 m`
  // becomes `4.57 M`.
  $('bill-pin-label').textContent = pinned ? 'Pinned' : 'Pin as scheme';
  pinButton.disabled = !bill;
}

pinButton.addEventListener('click', () => {
  pinned = pinned ? null : { bill, label: shapeLabel(solvedParams ?? params) };
  syncPin();
  renderBill();
});

syncPin();

/* ── downloading the run ───────────────────────────────────────────────────
 *
 * The trust move on a page that solves where nobody can watch: hand the run
 * over whole — the IDF and EPW the engine was given, and the report it wrote —
 * so the numbers can be reproduced in any EnergyPlus rather than believed. The
 * button follows the run rather than the readings: dark until something has
 * been attempted, and live from then on, because a run that failed is a run
 * that happened and the inputs that provoked it are exactly what the reader
 * needs to take away. It was once gated on the readings, which meant the one
 * run nobody could debug on the page was also the one run they could not carry
 * off it.
 *
 * A failure says so on the button, because the manifest saying so is one click
 * too late: the reader is choosing whether to download, and "Download run
 * bundle" over a fatal promises results that are not in the ZIP. That is why
 * the label lives here and not in the markup as `#share`'s does — it is two
 * words, chosen by the outcome, and the markup carries only the state before
 * anything has run.
 */
const DOWNLOAD_LABEL = { ok: 'Download run bundle', failed: 'Download failed run' };

// Zipping a year's EPW takes long enough to be seen, and the button says so
// where it says everything else about its state. Declared above `syncDownload`
// because that is the one place the three states are chosen between.
let bundling = false;

function syncDownload() {
  downloadBtn.disabled = !lastBundle || bundling;
  downloadBtn.textContent = bundling
    ? 'Zipping…'
    : lastBundle?.failure
      ? DOWNLOAD_LABEL.failed
      : DOWNLOAD_LABEL.ok;
}

downloadBtn.addEventListener('click', async () => {
  if (!lastBundle || bundling) return;
  bundling = true;
  syncDownload();
  try {
    const { blob, filename } = await runBundle({ ...lastBundle, author: signature });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    // Freed on the next tick rather than at once: some browsers have not
    // finished reading the blob out to disk when click() returns, and revoking
    // synchronously cancels the download it was still fulfilling.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    statusEl.className = 'status bad';
    statusEl.textContent = `The run could not be bundled: ${error.message}`;
  } finally {
    bundling = false;
    syncDownload();
  }
});

syncDownload();

/* ── copying the scheme ────────────────────────────────────────────────────
 *
 * The other reproduction path: the bundle re-runs this run in a local
 * EnergyPlus, the link re-solves this scheme here. Unlike the download it is
 * never disabled — the scheme is the desk, not the results, and it exists
 * from the first frame whether the engine has run or not. The receiving page
 * does its own solving.
 */
const shareBtn = $('share');
// Captured once from the markup, so the label lives in exactly one place and
// the restore after "Copied" cannot resurrect a wording the HTML no longer has.
const shareLabel = shareBtn.textContent;
let shareTimer;

shareBtn.addEventListener('click', async () => {
  // The bar re-letters on gesture end, but a keyboard user can land here from
  // the middle of one; one write before reading it back costs nothing and can
  // never copy a stale address. During a pending link attach the write is
  // deliberately held, and the address being copied is then the link itself —
  // station claim and all — which is the truthful thing to hand on.
  updatePermalink();
  try {
    await navigator.clipboard.writeText(location.href);
  } catch {
    // The clipboard can be withheld; the address bar cannot. The same link is
    // sitting there, and saying so beats failing quietly.
    statusEl.className = 'status bad';
    statusEl.textContent =
      'The clipboard was refused here — the link is the address in the address bar, ready to copy by hand.';
    return;
  }
  shareBtn.textContent = 'Copied';
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    shareBtn.textContent = shareLabel;
  }, 1500);
});

const set = (id, text, cls) => {
  const el = $(id);
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
};

/**
 * Take down everything the last run lettered: the plate's schedule, the
 * sentence under it, the bill, the rail's meters and the instant they were
 * read at.
 *
 * Kept apart from `clearResults` because a run that fails has already written
 * its own exit code and error counts into the title block by the time it gives
 * up, and those are the only things on the sheet that describe the failure.
 * Blanking them with the readings would leave the reader a status line and
 * nothing to check it against.
 */
function clearReadings() {
  renderSchedule(null);
  // The meters go with the results they were read from. A bill left standing
  // over a cleared plate would be describing a run the sheet no longer shows.
  bill = null;
  lastRun = null;
  // And so do the readings the register's targets are judged on: a criterion
  // still showing "under by 3.2" over a cleared plate would be quoting a run
  // that is no longer on the sheet. The overheating block goes with them, and
  // it is the reason this line is worth a second sentence: it carries a count,
  // a coverage and a page of qualifications as well as five readings, and
  // `renderScore` draws all of them only where `lastOutcome.tm59` stands. A
  // fatal therefore takes the count and the qualifications down with the
  // figures they qualify, rather than leaving a paragraph explaining the
  // arithmetic of a board of em dashes — while a run merely *in flight*
  // touches none of it, because nothing here runs at the top of a solve.
  lastOutcome = null;
  // The instant goes with them: it is an index into a run that is no longer
  // on the sheet. The pin itself survives — it is a calendar stamp and a
  // request, not a reading, so the next solve is asked for the same hour.
  //
  // The meters go with the instant, in the same breath. Every figure on the
  // rail is a reading at one hour, so clearing the hour and leaving the watts
  // would draw a whole closed heat balance with nothing above it saying when
  // — which is the unfalsifiable rail the "Read at" line exists to prevent.
  // It is visible whenever a non-live solve fails: `clearResults` runs, the
  // engine fatals, and the next `applyGeometry` re-letters the strips.
  lastReadFrom = null;
  lastAt = null;
  lastReadings = new Map();
  // The window's computed figures go with the rest: they are a reading off a
  // run, and a U-factor left standing over a fatal would be the one number on
  // the strip claiming a run that did not happen. The network's computed air
  // change rate is the same kind of thing and leaves in the same breath.
  lastGlass = null;
  lastNetwork = null;
  renderBill();
  // The hour bar goes with the instant it was lettering. It is not hidden by
  // `markStale` -- that dims -- and a picker still standing over a cleared
  // plate would offer to move meters that are no longer reading anything.
  renderWhen();
  syncPin();
  // The bundle stays. It is not a reading — it is the run itself, and the two
  // paths through here are a run that failed and a link that was refused. The
  // first is precisely when someone wants the IDF in their hands, and the
  // second happens before anything has been attempted, so there is nothing to
  // hold. See `lastBundle`.
  //
  // The register does not stay: the scoreboard's margins and the kept schemes'
  // deltas are readings, so they are re-lettered here with the rest of them.
  renderRegister();
  $('finding').textContent = '';
}

// The readings and the run that produced them. This is the whole sheet back to
// having reported nothing, which is what a refused link and a run that never
// reached the engine both leave behind.
function clearResults() {
  clearReadings();
  set('t-vars', '—');
  set('t-err', '—', '');
  set('t-exit', '—', '');
}

/* ══ dimensions ══════════════════════════════════════════════════════════ */

const params = { ...DEFAULT_PARAMETERS };
const bypass = { ...DEFAULT_BYPASS };
let solo = null; // the one channel being heard alone, if any
const syncSlider = {}; // key -> redraw that slider from `params`
let solvedShape = null; // the shape the visible results were solved for
let lastMean = null; // zone mean of the last run, for the axonometric tint
let modelState = null; // which channels the model says are in the path
let studyScheduler = null; // built with the engine pool once the engine section runs
const studies = new Map(); // parameter key -> the study drawn under that control
let studyQuantity = null; // initialized once, shared by every open study
const openStudies = new Set(); // includes queued cards before their curves land
// A Stop is a decision about this desk, not about this instant: the key stays
// out of automatic refresh until the rest of the desk moves again, at which
// point the stopped curve is stale history like any other.
const studyStops = new Map(); // key -> the rest-shape the Stop was issued under
// The two controls that act on every study at once — Set aside in the status
// row, Clear in the desk head. Declared up here with the state they letter,
// not down beside their listeners, because `syncStudyControls` runs from the
// station attach, and a permalink carrying a station attaches during the boot
// awaits — before the studies section at the foot of this module has been
// evaluated at all. That is the same reason every `studyScheduler` call above
// is written `?.`; a const in its temporal dead zone has no such spelling and
// would simply throw.
const studiesStopBtn = $('studies-stop');
const studiesClearBtn = $('desk-clear-studies');

// E-02's state, declared up here with the studies' and for the same reason
// spelled out above: `applyGeometry` reads `survey` to decide which jobs a
// desk move reaches, and `applyGeometry` runs during boot — long before the
// survey section at the foot of this module has been evaluated. A `let` in its
// temporal dead zone has no `?.` spelling available and simply throws.
let survey = null; // the ground under measurement, or null
// Job id -> the row index it measures. The scheduler knows nothing about rows
// and should not; this is the one map back.
const surveyRows = new Map();
// Which pass is in the queue, so a landed ground knows whether it has a
// densify still owing. Null when nothing is queued.
let surveyPass = null;
// A survey set aside is suppressed the way a stopped study is: until the rest
// of the desk moves, so an idle refine does not quietly restart work the
// reader just shed.
let surveyStop = null;
// Held true across the enqueue loop, so `paused()` reports the queue shut for
// exactly as long as a survey's rows are going in together.
let surveyEnqueueing = false;
// The count the current ground was asked for, so a re-cut that is not meant to
// lose detail — flipping the axes — can come back at the density it had rather
// than dropping to the coarse pass and climbing out of it again.
let surveyGrid = COARSE_GRID;
// Why the last survey could not be cut, standing in place of the ground.
let surveyRefused = null;
// Where the keyboard is standing on the ground, as lattice indices.
//
// One roving cursor rather than a tab stop per position, which is the house
// rule the landmark marks already keep: "a row of tappable pips under sixty
// faces would be two hundred new tab stops". Eighty-one focusable spot heights
// would be worse. The ground takes one tab stop, the arrow keys walk this
// cursor across it, and Enter stands on the design under it — so the keyboard
// reaches every design the pointer can reach (FR-049), which is the promise,
// rather than every design having a stop of its own, which is not.
let groundCursor = null;
// The designs the desk has stood on this session, in order (FR-038). A
// session, not a history: cleared where the sample cache is cleared.
const traverse = [];

/**
 * Solo, as the desk applies it: one channel in, every other bypassable one out.
 *
 * Held here rather than in the console because it is a property of the model,
 * not of the drawing of it — the appliers need the same answer the strips do.
 */
function patching() {
  if (!solo) return bypass;
  return Object.fromEntries(
    CHANNELS.filter((c) => c.bypassable).map((c) => [c.id, c.id !== solo]),
  );
}

/**
 * Everything that reaches the IDF, in one string.
 *
 * The pump solves a shape only if its key differs from the one on screen, so
 * anything left out of this would move the drawing and never be simulated.
 * There are eighty-odd parameters now and no prospect of keeping a hand-written
 * key honest, so it is taken wholesale.
 */
// The two priced channels are the exception the note above now needs: nothing
// they own reaches the IDF, so a tariff or a boiler efficiency must not read as
// a new shape. Left in, every turn of the Tariff strip would start a run that
// could only ever produce the numbers already on the sheet.
const PRICED_KEYS = new Set(CHANNELS.filter((c) => c.prices).flatMap((c) => c.keys()));

// One builder for both keys below, because they must stay byte-compatible:
// staleness is a string comparison, and two hand-kept copies of "the shape
// that reaches the IDF" would drift the first time either gained a component.
// `omit` takes one key or several. A study omits its own swept key, so that
// walking the redline tick along a finished curve does not invalidate it; a
// survey omits both of its axes, so that standing on one of its own measured
// points — which is the whole point of the drawing — does not cancel the
// ground the reader is standing on and re-measure eighty-one designs it has
// already measured.
const deskKey = (p, patch, omit = null) => {
  const dropped = omit === null ? EMPTY_OMIT : new Set(Array.isArray(omit) ? omit : [omit]);
  return JSON.stringify([
    Object.fromEntries(
      Object.entries(p).filter(([key]) => !PRICED_KEYS.has(key) && !dropped.has(key)),
    ),
    patch,
  ]);
};
const EMPTY_OMIT = new Set();

const shapeKey = (p) => deskKey(p, patching());

const shapeLabel = (p) =>
  `${p.width.toFixed(2)} × ${p.depth.toFixed(2)} × ${p.height.toFixed(2)} m · ` +
  `${((p.wwrN + p.wwrE + p.wwrS + p.wwrW) * 25).toFixed(0)} % mean WWR`;

/**
 * The shape of everything except one control: what a study is a study of.
 *
 * A study holds the rest of the desk still and moves one key, so moving that
 * key afterwards just walks the redline tick along a curve that is still true.
 * Moving anything else puts the curve on a desk that no longer exists, which
 * is the one thing that makes it stale.
 */
const restShapeKey = (key, p = params, patch = patching()) => deskKey(p, patch, key);

function syncStudies() {
  for (const [key, study] of studies) {
    // A key being re-swept is the scheduler's to draw: this runs per drag
    // frame off the stored map, and repainting the finished old curve over an
    // in-flight partial would flicker the card backwards mid-drain.
    if (studyScheduler?.has(key)) continue;
    desk?.setStudy(key, study, { stale: study.restShape !== restShapeKey(key) });
  }
}

// The blocks a run letters: the plate, the hour bar under it, the sentence, the
// results schedule and the bill, and the register's two readings. They dim
// together and they are replaced together, so the list is stated once rather
// than repeated at each site that handles them.
//
// The register contributes two of these and withholds a third: the
// scoreboard's margins and the kept schemes' deltas are readings, so they dim
// with the plate and the bill, while the console's conformance chips are
// measurements of the desk as it stands and are true the instant a control
// moves — dimming those would say the opposite of what they mean.
const resultPanels = () =>
  [$('trace'), $('when'), $('finding'), $('schedule'), $('bill'), $('score'), $('shelf-table'), $('chase')];

// Results describe a shape. Once the shape moves, they describe a building that
// is no longer on the sheet, so say so rather than letting them sit there.
//
// Under auto-solve this is a sub-second transient, not a state worth a red note
// telling you to go and press something — the plate's own hairline carries it
// instead. The note is for the manual and annual modes, where the gap between
// the drawing and the results is real and can last as long as you like.
function markStale() {
  const stale = Boolean(solvedShape) && solvedShape !== shapeKey(params);
  // Continuous mode closes this gap within a frame or two, so dimming there
  // would be a strobe. On release-solving and by hand the gap is real.
  const show = stale && !continuous();
  for (const el of resultPanels()) el.classList.toggle('stale', show);
  if (!show) return;
  // A sheet that is about to solve itself does not need telling to go and press
  // something — it needs to say what it is waiting for.
  const pending = autoOn();
  statusEl.className = pending ? 'status' : 'status stale-note';
  statusEl.textContent = pending
    ? 'Model changed — solving when you let go.'
    : 'Model changed — run again to solve the new shape.';
  runBtn.textContent = 'Run simulation';
}

/**
 * Put the desk into the document and re-letter everything that reads it.
 *
 * This is the one path from a control to the model. The sheet's sliders and the
 * console's strips both come through it, which is what keeps them agreeing.
 */
function applyGeometry() {
  // Everything that re-applies the desk to the model comes through here, so
  // this is where studies in flight are cancelled — but only the ones the
  // change actually reaches. A job's rest-shape excludes priced keys and its
  // own swept key, so a tariff turned mid-study, or the swept control nudged
  // along its own curve, costs nothing. Samples already on an engine cannot
  // be stopped; they land into the cancelled job and are dropped.
  //
  // A survey row is asked a different question from a study's, because it is a
  // study of two controls: its rest shape omits both axes, so comparing it
  // against `restShapeKey(job.key)` — which omits only the swept one — would
  // never match and every row would be cancelled on every single apply,
  // including the applies the survey's own samples cause.
  studyScheduler?.cancelWhere(
    (job) =>
      job.origin === 'survey'
        ? survey === null || job.restShape !== surveyRestShape(survey)
        : job.restShape !== restShapeKey(job.key),
    'moved',
  );
  modelState = applyModel(model, params, patching());
  SURFACES = surfaceGeometry(model);
  WINDOWS = windowGeometry(model);
  // The neighbours are real geometry and belong in the model, but not in this
  // drawing: an obstruction a hundred metres off would set the viewBox and
  // leave the building a speck. The Context strip reads its altitude instead.
  SHADES = shadeGeometry(model).filter((s) => !s.context);
  renderAxon(lastMean);

  const facts = geometryFacts(model);
  const m2 = (v) => `${v.toFixed(1)} m²`;
  // The whole building the engine was handed, not the one storey the
  // axonometric draws, because these three are what every intensity on the
  // sheet is divided by and a reader has to be able to check the division.
  // They move together or not at all: a gross floor area over a single
  // storey's volume would put this building's ceiling at 1.5 m. The floor
  // row names the multiplier that made it, since it is the only one of the
  // three whose cause is not then obvious.
  $('q-floor').textContent =
    facts.storeys > 1
      ? `${m2(facts.grossFloor)} · ${facts.storeys} floors`
      : m2(facts.floor);
  $('q-exposed').textContent = facts.grossExposed > 0 ? m2(facts.grossExposed) : 'None — adiabatic';
  $('q-volume').textContent = `${facts.grossVolume.toFixed(1)} m³`;
  $('q-compact').textContent = Number.isFinite(facts.compactness)
    ? `${facts.compactness.toFixed(3)} m⁻¹`
    : '—';
  $('q-glazing').textContent = facts.grossGlazing > 0 ? m2(facts.grossGlazing) : 'None';
  // Area and ratio together, the way the overhang row below carries its depth
  // and its projection factor: the area is what was built, the ratio is what it
  // means against the roof it was cut out of.
  $('q-skylight').textContent =
    facts.grossRoofGlazing > 0
      ? `${m2(facts.grossRoofGlazing)} · SRR ${facts.srr.toFixed(3)}`
      : 'None';
  // Depth and projection factor together: the depth is what the slider says,
  // the factor is what it means against the opening it shades.
  $('q-overhang').textContent =
    facts.overhang > 0
      ? `${facts.overhang.toFixed(2)} m · PF ${facts.projection.toFixed(2)}`
      : 'None';

  desk?.setState(modelState);
  syncStudies();
  syncRunSub();
  desk?.setReadings(engagedReadings(), derivedReadings(facts), lastAt, readouts());
  desk?.setDerived(derivedLines());
  // Whether the desk is built to a standard is a measurement of the desk, not
  // a flag set when a button was pressed, so it is re-taken here — the one
  // place every change to the parameters passes through. Nudge a wall
  // resistance and the conformance falls away by itself.
  syncStandards();
  markStale();
}

/**
 * Commit one control, from wherever it was turned.
 *
 * `done` marks the end of a gesture — a pointer release or the keyboard's
 * commit — which is where the annual run solves and where a design day catches
 * its last shape.
 */
function commit(key, value, done = false) {
  if (params[key] !== value) {
    // A priced control changes what the energy was worth, not how much of it
    // there was, so it re-letters the bill from the meters already in hand and
    // never asks the engine for anything. It still opens a gesture, because the
    // bill still wants a ghost of where it stood when you took hold.
    const priced = PRICED_KEYS.has(key);
    beginGesture({ priced });
    params[key] = value;
    syncSlider[key]?.();
    desk?.sync(key);
    // What this control's value settles besides itself, asked of the
    // declaration rather than by name. `roomType` is the first control here
    // that writes others — naming a published room brings that room's figures
    // with it — and the question is put generically so the second one costs a
    // field in `controls.js` rather than another arm in the desk's one funnel.
    //
    // Written straight onto `params` rather than through a nested `commit`: a
    // second commit would open a gesture inside this one and take the ghost
    // with it, and the `applyGeometry` below covers every key at once anyway.
    const implied = controlFor(key).control.implies?.(value);
    if (implied) {
      Object.assign(params, implied);
      desk?.sync();
    }
    applyGeometry();
    if (priced) reprice();
    else if (continuous()) pump();
  }
  if (done) {
    // One stop on the traverse per design the desk actually came to rest on
    // (FR-038), and **at the end of the gesture rather than inside it**.
    // Standing on a measured point is two commits, one per axis, and recording
    // each would put the half-moved desk between them on the traverse — a
    // design nobody chose and, on a plan key, one that is not even on the
    // ground. Recorded in the one funnel every control comes through rather
    // than at the survey's own gestures, because the reader walks the design
    // space with the sliders as often as with the drawing.
    if (!PRICED_KEYS.has(key)) recordTraverse();
    endGesture();
    desk?.settle();
    if (autoOn()) pump();
  }
}

/**
 * The five the sheet keeps under its axonometric.
 *
 * Their specs are looked up out of the console's declaration rather than
 * written again here, so a range or a label changed there changes both.
 */
function buildSliders() {
  const host = $('sliders');
  host.textContent = '';
  for (const key of SHEET_KEYS) {
    const { control, side } = controlFor(key);
    const row = document.createElement('div');
    // The two that describe the opening rather than the box are ruled off from
    // the three lengths above them.
    row.className = key === 'wwrS' ? 'dim group' : 'dim';

    const label = document.createElement('label');
    label.htmlFor = `dim-${key}`;
    label.textContent = side ? `${control.short} ${side.label}` : control.label;

    const input = document.createElement('input');
    Object.assign(input, {
      type: 'range',
      id: `dim-${key}`,
      min: control.min,
      max: control.max,
      step: control.step,
      value: params[key],
    });
    input.setAttribute('aria-label', label.textContent);

    // The number is the other way to set the dimension: a box with nothing
    // drawn around it, in the place the reading already stood. Width runs 4 to
    // 40 m across the slider's ~200 px, so an exact 12.00 m was previously a
    // hundred presses of an arrow key away. See `field.js`.
    const value = quantityField({
      control,
      name: label.textContent,
      read: () => params[key],
      // Typing an exact dimension is taking hold of one, and note 2 now says
      // so outright — so it files the same square the drag does. Filed here
      // rather than in `commit` for the reason the listener below is: commit
      // is also the path a programmatic change takes, and only a reader can
      // fill a marker. The guard is the console's: a box left at the number
      // it already held resolves nothing.
      write: (v) => {
        if (params[key] !== v) tour?.note('drag');
        commit(key, v, true);
      },
    });

    // The landmarks the console's calibration faces carry, on the sheet's own
    // sliders. Three of these five have them; the two plan dimensions do not,
    // because nobody publishes a width a shoebox ought to be, and a face with
    // no cases behind it says so by carrying no rule rather than by carrying
    // an empty one.
    //
    // The pips are placed against the *thumb's* travel and not the track's:
    // this is a native range with a visible 9px thumb, so its centre only ever
    // reaches from 4.5px to 4.5px short of the far end, and a mark ruled at a
    // plain percentage would sit a few pixels off the value it names at both
    // ends of the face. The console's faces have the opposite arrangement —
    // their thumb is invisible and the tick is drawn — so there the plain
    // percentage is the right one.
    const marks = [];
    let rule = null;
    let standing = null;
    if (control.landmarks.length) {
      rule = document.createElement('div');
      rule.className = 'dim-marks';
      for (const mark of control.landmarks) {
        const from = Math.min(Math.max(control.fraction(mark.from), 0), 1);
        const to = Math.min(Math.max(control.fraction(mark.to), 0), 1);
        const pip = document.createElement('i');
        pip.className = mark.exact ? 'dim-mark point' : 'dim-mark';
        pip.style.left = `calc(4.5px + ${from} * (100% - 9px))`;
        if (!mark.exact) pip.style.width = `calc(${to - from} * (100% - 9px))`;
        pip.title = mark.caption(control);
        rule.append(pip);
        marks.push({ mark, pip });
      }
      standing = document.createElement('p');
      standing.className = 'dim-standing';
      input.setAttribute('aria-description', control.landmarkSummary());
    }

    const show = () => {
      const v = params[key];
      value.show();
      const said = control.standing(v);
      input.setAttribute('aria-valuetext', said ? `${control.format(v)}, ${said}` : control.format(v));
      if (standing) {
        // One reading of where the tick stands, used by both the words and the
        // rule under them. Read per mark instead, the two came apart at a zero
        // stop — see `landmarkAt` in controls.js.
        const here = control.landmarkAt(v);
        standing.textContent = said ?? '';
        standing.title = said ?? '';
        standing.classList.toggle('between', !here);
        for (const { mark, pip } of marks) pip.classList.toggle('here', mark === here);
      }
    };
    show();

    // The general notes hear about the gesture from the listener, not from
    // `commit`: commit is also the path programmatic changes take (a station
    // attach setting `sizingPeriods`), and those must not fill the square
    // that says the reader took hold of something.
    input.addEventListener('input', () => {
      tour?.note('drag');
      commit(key, Number(input.value));
    });
    input.addEventListener('change', () => commit(key, Number(input.value), true));

    row.append(label, input, value.node);
    if (rule) row.append(rule, standing);
    host.append(row);
    syncSlider[key] = () => {
      input.value = String(params[key]);
      show();
    };
  }
}

/**
 * Back to the issued drawing.
 *
 * Two scopes, because the two buttons sit under two different headings and a
 * control has to do what the words above it say. The sheet's is under
 * "Dimensions" and resets the five dimensions; the desk's says "Revert all" and
 * means it -- every control, every patch, and solo.
 */
function revert(keys = null) {
  beginGesture();
  if (keys) {
    for (const key of keys) params[key] = DEFAULT_PARAMETERS[key];
  } else {
    Object.assign(params, DEFAULT_PARAMETERS);
    Object.assign(bypass, DEFAULT_BYPASS);
    solo = null;
    if (desk) desk.solo = null;
  }
  for (const sync of Object.values(syncSlider)) sync();
  desk?.sync();
  applyGeometry();
  // Reverting takes the plant and the tariff back too, and those do not go
  // through the engine, so the bill has to be re-lettered by hand.
  reprice();
  endGesture();
  desk?.settle();
  if (autoOn()) pump();
}

$('reset').addEventListener('click', () => revert(SHEET_KEYS));

/* ══ the console ═════════════════════════════════════════════════════════ */

let desk = null;
let lastReadings = new Map();
let lastHours = null;
let lastAt = null; // the instant the desk's meters are reading, as the rail letters it

/**
 * The readings as the desk is allowed to show them.
 *
 * A reading survives until the next solve supersedes it, the way the plate's
 * curve does — except on a channel that has just gone out of the path, where
 * the last number it produced would now be describing a path that is no
 * longer there. Every route that re-letters the strips from the run already in
 * hand goes through here rather than handing `lastReadings` straight over:
 * turning a tariff and taking the reading pin both re-letter without solving,
 * and either would otherwise give a channel patched out since the run its
 * watts back, under a strip the drawing says is out of the document.
 */
function engagedReadings() {
  return new Map([...lastReadings].map(([id, w]) => [id, modelState?.get(id)?.engaged ? w : null]));
}

/**
 * The hour the reader has pinned, or null to read the worst one.
 *
 * The desk's own instant is an `argmax` over the zone temperature, so it is
 * chosen by one signal and applied to all of them: a control with no optical
 * effect can move the transmitted-solar reading, because it moved the hour.
 * Worse, it is discontinuous — the annual low and the annual high sit close
 * enough on a balanced climate that a slider can invert the ranking and take
 * every meter on the rail from an August afternoon to a January night in one
 * step. Both readings are true; the pair is not a comparison, and a console
 * whose whole purpose is turning a control back and forth has to be able to
 * hold its subject still.
 *
 * Deliberately not a parameter. It reaches no IDF object, so it must stay off
 * `params` — anything there starts a run, and this one could only reproduce
 * the numbers already in hand. Turning it re-letters from the ESO already
 * held, the way a tariff re-letters the bill.
 *
 * `pinnedHour`, not `pinned`: the bill has held a pinned *scheme* since long
 * before this, and the two are different instruments — one holds a whole bill
 * to measure against, this one holds the instant the meters read at.
 */
let pinnedHour = null;

/**
 * The hours the next run will solve, read off the desk — the sizing days when
 * they are kept, plus every month left in the run when a year is attached.
 * One computation, because the Run strip's meter, the title block and the
 * attach sentence all quote it, and three hand-kept copies of "8,760" would
 * go quietly wrong the first time a run period covered less than the year.
 */
function runHours() {
  return (params.sizingPeriods === 'Yes' ? 48 : 0) + (annual() ? monthHours(params.months) : 0);
}

/**
 * The title block's run sub-line, from the same reading. Re-lettered on every
 * `applyGeometry` because the Run strip can flip the sizing days or move the
 * run period long after the attach wrote this line, and a sheet claiming
 * 8,760 hours over a document solving 8,808 is the drift the read-back rule
 * exists to prevent.
 */
function syncRunSub() {
  if (!annual()) return;
  // "Annual" is a claim about the run, not about the weather file. The
  // calendar can take months out of it, and the attach that first lettered
  // this field happens once while the Run strip keeps moving — so the run type
  // is re-read off the mask here, alongside the hours it already quotes,
  // rather than left standing as whatever the attach said.
  $('t-run').textContent = isWholeYear(params.months) ? 'Annual' : 'Run period';
  $('t-run-sub').textContent = `${
    params.sizingPeriods === 'Yes' ? 'Weather file and sizing days' : 'Weather file'
  }, ${runHours().toLocaleString('en-US')} hours`;
}

/**
 * The readings that need no simulation.
 *
 * Four strips describe something true about the model rather than something
 * measured in it, and they are lettered from the geometry the same way the
 * quantities panel is — so they are right before the first run, and stay right
 * between runs.
 */
/**
 * What the model was *given* for a setting, under the setting itself.
 *
 * Three figures answer the leakiness question and they are three different
 * things: what the reader asked for is on the face (`0.50 ACH` at a 4 Pa
 * reference), what the model was given is here (a mass flow coefficient over an
 * envelope area), and what the run produced is the readout beside the meter.
 * They must not be lettered as one quantity — on the measured desk the stated
 * and computed rates differ by about a factor of three, and a reader who took
 * that gap for a failure to apply the setting would be wrong about the model.
 *
 * Read off the document rather than off `params`, so a channel patched out from
 * under the control letters nothing rather than an arithmetic about objects
 * that are not there.
 */
function derivedLines() {
  const lines = new Map();
  if (modelState?.get('air')?.engaged && params.airModel === 'Network') {
    const b = leakageBuildUp(model, params.envLeak);
    lines.set(
      'envLeak',
      `${b.coefficient.toFixed(3)} kg/s at 1 Pa over ${b.area.toFixed(1)} m² of envelope\n` +
        `${b.ach} ACH · ${b.volume.toFixed(1)} m³ / 3600 · ${b.density} kg/m³ / ${b.deltaP}^${b.exponent}`,
    );
  }
  return lines;
}

function derivedReadings(facts) {
  const hours = runHours();

  return new Map([
    ['massing', Number.isFinite(facts.compactness) ? `${facts.compactness.toFixed(3)} m⁻¹` : '—'],
    // How high the neighbours stand from where the building is looking, which
    // is the number that decides whether they matter.
    [
      'context',
      bypass.context || (solo && solo !== 'context')
        ? '—'
        : `${((Math.atan2(params.ctxHeight, params.ctxDistance) * 180) / Math.PI).toFixed(0)}° up`,
    ],
    // Area and the ratio it makes, both summed off the rooflights the document
    // actually holds — so a grid clamped by its reveal reads as the area it
    // really got rather than the one the slider asked for.
    // The building's, not one storey's, so a strip and the quantities panel
    // never letter the same area two ways.
    [
      'skylights',
      facts.grossRoofGlazing > 0
        ? `${facts.grossRoofGlazing.toFixed(1)} m² · SRR ${facts.srr.toFixed(3)}`
        : 'None',
    ],
    ['shading', facts.grossShadeArea > 0 ? `${facts.grossShadeArea.toFixed(1)} m²` : 'None'],
    ['solver', `${params.timestep} / hour`],
    ['run', lastHours ? `${lastHours.toLocaleString('en-US')} solved` : `${hours.toLocaleString('en-US')} to solve`],
    // What the plant has to buy to deliver the heat the system moved. Reads an
    // em dash until something has been solved, because it is a meter reading
    // and there is no meter reading before a run.
    [
      'plant',
      (() => {
        const heat = bill?.lines.find((l) => l.use.id === 'heating');
        return heat ? `${heat.metered.toFixed(0)} kWh ${heat.fuel.label.toLowerCase()}` : '—';
      })(),
    ],
    // What the site bought around the building. Same rule as the plant's
    // reading: it is a meter reading, so it is an em dash until a run has put
    // one in hand.
    [
      'grounds',
      (() => {
        const ext = bill?.lines.find((l) => l.use.id === 'exterior');
        return ext ? `${ext.metered.toFixed(0)} kWh` : '—';
      })(),
    ],
    // This one is true before any run at all: it describes the place, not the
    // building, and the place is known as soon as a station is picked.
    [
      'tariff',
      (() => {
        const rate = rateCard().electricity;
        return isRate(rate) ? rate.text : '—';
      })(),
    ],
  ]);
}

/**
 * The window's own performance, as the last run computed it — or null before
 * there has been one, and after one that failed.
 *
 * Kept here rather than derived on demand because the tabular report it comes
 * out of is 340 kB of markup: parsing it once per run costs nothing, parsing
 * it on every apply of the desk would put a scan of it inside a drag.
 */
let lastGlass = null;

/**
 * What the pressure network moved, as the last run computed it — or null before
 * there has been one, after one that failed, and on any run the network was not
 * in the path of.
 *
 * Null rather than zero is the whole of it: a missing series means the channel
 * was out or the scheduled model was in force, and lettering 0.00 ACH over a
 * building running on a stated rate would be a reading with nothing behind it.
 */
let lastNetwork = null;

/**
 * The readouts: what the engine made of the glazing, and what it made of the
 * air.
 *
 * Two lines where the opening carries a frame. The first is the glass, which
 * is what the layered controls above it build and what the simple model's
 * three sliders describe. The second is the whole window by the NFRC method —
 * the engine fills those cells only where there is a frame, because with none
 * there is nothing for the glass figures to be corrected against, and it is
 * the frame that makes them differ.
 */
function readouts() {
  const out = new Map();
  const glass = lastGlass;
  if (glass) {
    const trio = (t) =>
      `U ${or(t.u, (v) => v.toFixed(2))} W/m²K · SHGC ${or(t.shgc, (v) => v.toFixed(2))} · VT ${or(t.vt, (v) => v.toFixed(2))}`;
    const framed = Number.isFinite(glass.assembly.u);
    out.set('glazing', {
      text: trio(glass),
      sub: framed ? `Whole window · ${trio(glass.assembly)}` : null,
    });
  }
  // The Air strip's entry is written whenever the channel is in the path, even
  // with nothing to letter yet, because it carries two different things. The
  // rate is a reading and is absent until a run produces one — an em dash, by
  // the readout's own rule, and under the scheduled model there is no computed
  // rate to have. The **model in force** is not a reading at all: it is what
  // the strip is currently about, it is true before the first solve, and the
  // folded index row is the whole reading at 390 px, so a rate with no model
  // beside it would say nothing about which of the two produced it.
  if (modelState?.get('air')?.engaged) {
    const n = lastNetwork;
    out.set('air', {
      // A mean is only a thing a whole year can support, by the bill's own
      // rule; a run that is two design days, or ten months of one, letters the
      // range it actually saw rather than an average nobody can benchmark.
      text: n
        ? n.wholeYear
          ? `${n.ach.toFixed(2)} ACH`
          : `${n.achMin.toFixed(2)}–${n.achMax.toFixed(2)} ACH`
        : null,
      sub: n ? openSub(n) : null,
      fold: params.airModel === 'Network' ? 'Network' : 'Scheduled',
    });
  }
  return out;
}

/**
 * The hours the openings actually stood open, and the two ways of having
 * nothing to say about it.
 *
 * `null` is no opening at all and the line is left off, the way the demand rows
 * are omitted when their meters are absent. Zero is an opening that never
 * opened, which *is* a reading, so it is said in words — a zero lettered beside
 * a count reads as a measurement of almost-never rather than of never, and this
 * sheet exists not to print that.
 */
const openSub = (n) =>
  n.hoursOpen === null
    ? null
    : n.hoursOpen === 0
      ? 'The openings never opened'
      : `Open ${n.hoursOpen.toLocaleString('en-US')} of ${n.hoursTotal.toLocaleString('en-US')} h`;

/**
 * Everything the instant is chosen from, kept so the pin can be turned without
 * asking the engine for anything. The ESO is already held for the bill; this
 * adds the zone series and its environments, which are parsed out of it once
 * per solve rather than once per click.
 */
let lastReadFrom = null;

/** An hour pin lettered without a run to look it up in — for saying what went missing. */
const hourPinText = (pin) =>
  `${String(pin.hour).padStart(2, '0')}:00, ${pin.day} ${MONTHS[pin.month - 1]}` +
  (pin.kind === 'year' ? '' : ` on the ${pin.kind} design day`);

/**
 * Put the meters on one hour of a solved run: the pinned one if it is in
 * there, the worst one otherwise.
 *
 * A pin that cannot be found is released rather than slid to the nearest hour,
 * and the rail says which hour went missing. Sliding would be the substitution
 * this codebase refuses everywhere else, and it would be the worst kind here:
 * silently reading an hour nobody asked for, under a marker claiming the
 * reading is held still.
 */
function readAt(points, runs, leadIndex, eso) {
  let at = resolvePin(pinnedHour, points, runs);
  let released = null;
  if (pinnedHour && at == null) {
    released = pinnedHour;
    pinnedHour = null;
  }
  if (at == null) at = worstHour(points, runs[leadIndex]);
  // Set after the pin has been resolved or released, so `at` is the hour that
  // was actually read and the plate's marker cannot claim a different one.
  lastReadFrom = { points, runs, leadIndex, eso, at };
  const stamp = stampText(points, at);
  lastAt = stamp
    ? {
        // The temperature off `points` rather than the plate's parallel array
        // of bare values: the same number, and one series to be indexed by one
        // instant is one fewer thing that can be sliced differently.
        text: `${stamp} · zone ${points[at].value.toFixed(1)} °C`,
        pinned: Boolean(pinnedHour),
        released: released ? hourPinText(released) : null,
      }
    : null;
  lastReadings = readMeters(eso, at);
  // A released pin has to leave the address with it. Without this the bar goes
  // on carrying `at=winter.1-1T5` for an hour the desk has already told the
  // reader it could not find — the address claiming a scheme the sheet is not
  // showing, which is the failure the `hashchange` reload exists to prevent,
  // arriving by the one route that never touches the hash.
  if (released) updatePermalink();
}

/**
 * Take or release the pin, off the run already in hand.
 *
 * No solve: the hour is a way of reading a result, not a property of one, so
 * this is the same move `reprice` makes for a tariff. The address bar follows,
 * because a click is a whole gesture — there is no drag here to hold it still.
 */
function toggleHourPin() {
  if (!lastReadFrom) return;
  const { points, runs, leadIndex } = lastReadFrom;
  if (pinnedHour) return releasePin();
  const taken = pinAt(points, runs, worstHour(points, runs[leadIndex]));
  if (!taken) return; // no stamp to pin; leave the desk exactly as it was
  setPin(taken);
}

/** Are two stamps the same instant? */
const samePin = (a, b) =>
  Boolean(a && b && a.kind === b.kind && a.month === b.month && a.day === b.day && a.hour === b.hour);

/**
 * Hold one instant, off the run already in hand.
 *
 * The one setter every route goes through -- the rail's button, the plate's
 * drag, the named instants and the calendar picker -- so there is no path that
 * can move the hour without moving the marker, the meters and the address with
 * it. `address` is false only for the frames inside a drag; see the gesture.
 */
function setPin(pin, { address = true } = {}) {
  if (!lastReadFrom || !pin) return;
  const { points, runs, leadIndex, eso } = lastReadFrom;
  pinnedHour = pin;
  readAt(points, runs, leadIndex, eso);
  reletterReading({ address });
}

/** Let the run choose its own hour again. */
function releasePin() {
  if (!lastReadFrom) return;
  const { points, runs, leadIndex, eso } = lastReadFrom;
  pinnedHour = null;
  readAt(points, runs, leadIndex, eso);
  reletterReading();
}

/**
 * Take the hour a click on the plate named.
 *
 * Clicking the hour already being held releases it, so the plate can undo its
 * own gesture: a reader who found the pin by pointing at the curve should not
 * have to go and find the rail's button to let go of it again.
 */
function pinFromPlate(index, snap, { hold = false, address = true } = {}) {
  if (!lastReadFrom) return;
  const { points, runs } = lastReadFrom;
  const at = snap ? dayExtremeNear(points, runs, index) : index;
  if (at == null) return;
  const taken = pinAt(points, runs, at);
  if (!taken) return;
  // `hold` is what tells a drag apart from a click. A drag that happens to end
  // on the hour it began has still travelled, and releasing there would take
  // down the pin it just spent the gesture placing.
  if (!hold && samePin(pinnedHour, taken)) return releasePin();
  setPin(taken, { address });
}

/**
 * Everything that reads the instant, re-lettered from the run already in hand.
 *
 * The desk's meters, the plate's marker and the address bar are three views of
 * one hour, and a route that moved the hour without moving all three would put
 * the marker on one instant while the strips reported another.
 */
function reletterReading({ address = true } = {}) {
  desk?.setReadings(engagedReadings(), derivedReadings(geometryFacts(model)), lastAt, readouts());
  desk?.setDerived(derivedLines());
  renderWhen();
  renderTrace();
  // Held back for the frames inside a plate drag, the rule every gesture on
  // this page follows: the address is a reading and it updates when you let go.
  if (address) updatePermalink();
}

/* ══ the hour bar ════════════════════════════════════════════════════════ */

/**
 * The bar under the plate: which instant the desk is reading, and the two ways
 * of naming another one.
 *
 * It sits on the sheet rather than on the rail because of the desk's own rule.
 * The rail states the hour and holds it, but the rail is inside a console you
 * have to open, and the hour is the single most movable thing about every
 * figure on the page — the plate grew its marker for exactly that reason. The
 * marker says *when*; this says when, and what else you could ask for.
 *
 * Rebuilt whole on every reading, like the rail, so a drag re-letters it in
 * step with everything else. Focus is handed back by id afterwards: the node
 * that took the keystroke is detached by the time the handler returns, and a
 * reader stepping through the hours with the keyboard would otherwise be
 * dropped on the body at every step.
 */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * The named instants of the run in hand, found once.
 *
 * Keyed on the ESO's own identity: a solve parses a new one, and nothing else
 * can change where a peak lands. Without this the seven argmaxes — up to
 * 8,760 hours each, plus a variable lookup apiece — would run on every frame
 * of a plate drag, in a gesture that is otherwise array indexing and nothing
 * more.
 */
let offersCache = null;
function offersFor(points, runs, eso) {
  if (offersCache?.eso !== eso) offersCache = { eso, offers: instantOffers(points, runs, eso) };
  return offersCache.offers;
}

/** One environment's calendar, on the same terms and for the same reason. */
let calendarCache = null;
function calendarFor(points, run, eso) {
  if (calendarCache?.eso !== eso || calendarCache.key !== run.key) {
    calendarCache = { eso, key: run.key, calendar: runCalendar(points, run) };
  }
  return calendarCache.calendar;
}

// Whether the picker is unfolded. Kept for the session rather than reset per
// solve: a reader working the hour is working it across runs, and a panel that
// closed itself every time the engine came back would be unusable during
// auto-solve, where a run lands every second or so.
let whenOpen = false;

function renderWhen() {
  const host = $('when');
  // Which control had the keyboard, so it can have it back after the rebuild.
  const refocus = document.activeElement?.closest?.('#when') ? document.activeElement.id : null;
  host.textContent = '';

  if (!lastReadFrom || !lastAt) {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const { points, runs, leadIndex, eso, at } = lastReadFrom;
  const held = Boolean(pinnedHour);

  // ── the line that says when, and holds it
  const row = el('div', 'when-row');
  const pin = el('button', 'pin pin-inline');
  pin.type = 'button';
  pin.id = 'when-pin';
  pin.setAttribute('aria-pressed', String(held));
  pin.title = held
    ? 'Release the hour and read the worst one in each run again'
    : 'Hold this hour, so the meters keep reading it as the desk changes';
  pin.append(el('i', 'mark'), el('span', null, `${held ? 'Held at' : 'Read at'} ${lastAt.text}`));
  pin.addEventListener('click', () => {
    toggleHourPin();
    $('when-pin')?.focus();
  });
  row.append(pin);

  const open = el('button', 'link', whenOpen ? 'Close' : 'Choose the hour');
  open.type = 'button';
  open.id = 'when-open';
  open.setAttribute('aria-expanded', String(whenOpen));
  open.setAttribute('aria-controls', 'when-panel');
  open.addEventListener('click', () => {
    whenOpen = !whenOpen;
    renderWhen();
    $('when-open')?.focus();
  });
  row.append(open);
  host.append(row);

  // A pin that could not be found is released, and the sheet says which hour
  // went missing -- the plate's marker simply going from filled to hollow is
  // not an explanation, and this bar is the one place on the sheet that can
  // give one without opening the desk.
  if (lastAt.released) {
    host.append(
      el(
        'p',
        'when-note',
        `${lastAt.released} is not in this run, so the pin was released and the meters are reading the worst hour again.`,
      ),
    );
  }

  if (whenOpen) host.append(whenPanel(points, runs, leadIndex, eso, at, held));

  if (refocus) $(refocus)?.focus();
}

/**
 * One offer: a named hour, the instant it lands on, and what it reads there.
 *
 * A refused offer states its reason in place of its stamp and cannot be
 * pressed. There is no fallback to a neighbouring instant, for the reason the
 * pin has refused one since it was built: a meter quietly reading an hour
 * nobody asked for, under a label claiming to be the peak of something, is
 * worse than a chip that says why it is empty.
 */
function offerChip({ id, label, sub, where, blurb, active, refused, take }) {
  const chip = el('button', refused ? 'when-offer refused' : 'when-offer');
  chip.type = 'button';
  chip.id = `when-offer-${id}`;
  if (blurb) chip.title = blurb;
  chip.append(el('b', null, label), el('span', null, sub));
  if (where) chip.append(el('i', null, where));
  if (refused) {
    chip.disabled = true;
    return chip;
  }
  chip.setAttribute('aria-pressed', String(active));
  chip.addEventListener('click', () => {
    take();
    $(chip.id)?.focus();
  });
  return chip;
}

/** One bounded select, with its own eyebrow. */
function whenField(id, label, options, value, onChange) {
  const wrap = el('label', 'when-field');
  wrap.append(el('span', 'eyebrow', label));
  const select = el('select');
  select.id = id;
  for (const option of options) {
    const node = el('option', null, option.label);
    node.value = option.value;
    if (option.value === value) node.selected = true;
    select.append(node);
  }
  // A design day is one day in one month: the field still stands, because the
  // reader has to be able to see what it is fixed at, but there is nothing in
  // it to choose.
  select.disabled = options.length < 2;
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

/**
 * The panel: the hours a modeller already has words for, then the calendar.
 *
 * Both halves are walked out of the run's own timestamps and nothing else, so
 * neither can name an instant this run does not hold. That is what makes a
 * date control admissible here at all — the objection to one was never to
 * precision, it was to a free field that exists to be refused.
 */
function whenPanel(points, runs, leadIndex, eso, at, held) {
  const panel = el('div', 'when-panel');
  panel.id = 'when-panel';

  panel.append(el('p', 'eyebrow', 'Go to'));
  const offers = el('div', 'when-offers');
  offers.setAttribute('role', 'group');
  offers.setAttribute('aria-label', 'Named hours in this run');

  // The run's own choice, made legible. It was always the default and was
  // never stated as a choice anywhere, so the only way to get back to it was
  // to know that the rail's marker toggled.
  const freeAt = worstHour(points, runs[leadIndex]);
  offers.append(
    offerChip({
      id: 'free',
      label: "The run's own hour",
      blurb: `The hour the lead environment is furthest from ${NEUTRAL_C} °C — where the meters read when nothing is held.`,
      sub: `${stampText(points, freeAt)} · ${Math.abs(points[freeAt].value - NEUTRAL_C).toFixed(1)} K off ${NEUTRAL_C} °C`,
      where: runs.length > 1 ? runs[leadIndex].label : null,
      active: !held,
      take: () => releasePin(),
    }),
  );

  for (const offer of offersFor(points, runs, eso)) {
    const { instant } = offer;
    const landed = offer.at == null ? null : runs.find((r) => offer.at >= r.start && offer.at <= r.end);
    offers.append(
      offerChip({
        id: instant.id,
        label: instant.label,
        blurb: instant.blurb,
        sub:
          offer.at == null
            ? offer.reason
            : `${stampText(points, offer.at)} · ${instant.letter(
                // Divided back down where the series is reported at building
                // level, so an offer and the rail term behind it letter one
                // number. See `Term.perBuilding`.
                offer.value / (instant.perBuilding ? params.multiplier : 1),
              )}`,
        where: landed && runs.length > 1 ? landed.label : null,
        active: samePin(pinnedHour, offer.pin),
        refused: offer.at == null,
        take: () => setPin(offer.pin),
      }),
    );
  }
  panel.append(offers);

  // ── the calendar
  const here = runs.find((r) => at >= r.start && at <= r.end) ?? runs[0];
  const calendar = calendarFor(points, here, eso);
  const stamp = points[at].timestamp;

  /**
   * Land on a day, at the hour of it worth reading.
   *
   * Coarse to fine: choosing a month or a day leaves the hour to
   * `dayExtremeNear`, the same rule a click on an annual plate already
   * follows, so every step of the picker lands somewhere that means
   * something rather than at midnight. Only the hour field names an hour.
   */
  const goTo = (month, day, hour) => {
    const days = calendar.get(month);
    if (!days) return;
    const on = days.has(day) ? day : [...days.keys()][0];
    const hours = days.get(on);
    if (!hours) return;
    const index =
      hour != null && hours.has(hour)
        ? hours.get(hour)
        : dayExtremeNear(points, runs, [...hours.values()][0]);
    const taken = index == null ? null : pinAt(points, runs, index);
    if (taken) setPin(taken);
  };

  panel.append(el('p', 'eyebrow', 'Or name one'));
  const exact = el('div', 'when-exact');
  exact.append(
    whenField(
      'when-env',
      'Environment',
      runs.map((r, i) => ({ value: String(i), label: r.label })),
      String(runs.indexOf(here)),
      (v) => {
        // A new environment is a new weather story, so it opens where it is
        // hardest rather than at its first midnight -- the same instant the
        // run would have chosen for itself had that environment led.
        const next = runs[Number(v)];
        const taken = next && pinAt(points, runs, worstHour(points, next));
        if (taken) setPin(taken);
      },
    ),
    whenField(
      'when-month',
      'Month',
      [...calendar.keys()].map((m) => ({ value: String(m), label: MONTHS[m - 1] })),
      String(stamp.month),
      (v) => goTo(Number(v), stamp.day, null),
    ),
    whenField(
      'when-day',
      'Day',
      [...(calendar.get(stamp.month)?.keys() ?? [])].map((d) => ({ value: String(d), label: String(d) })),
      String(stamp.day),
      (v) => goTo(stamp.month, Number(v), null),
    ),
    whenField(
      'when-hour',
      'Hour',
      [...(calendar.get(stamp.month)?.get(stamp.day)?.keys() ?? [])].map((h) => ({
        value: String(h),
        label: `${String(h).padStart(2, '0')}:00`,
      })),
      String(stamp.hour ?? 0),
      (v) => goTo(stamp.month, stamp.day, Number(v)),
    ),
  );
  panel.append(exact);

  panel.append(
    el(
      'p',
      'when-hint',
      'Every option here is walked out of this run’s own timestamps, so nothing offered is an hour the run does not hold. The plate’s marker is the same instant — press it and drag.',
    ),
  );
  return panel;
}

/**
 * What each channel was contributing at one instant.
 *
 * At one instant, and not averaged over the run, which was the first attempt
 * and was useless: a free-running zone comes back to roughly where it started,
 * so every term of its balance averages to nearly nothing over a day and the
 * whole desk reads zero. A console meter shows level now, not the mean of the
 * song. So the desk reads at the hour the building is having the hardest time —
 * the one furthest from 20 °C, which is the hour the design is judged at, and
 * an instant where the balance genuinely closes. Unless the reader has pinned
 * an hour, in which case it is that one: see `pinned` below for why a console
 * that only ever picks its own instant cannot be used to compare two desks.
 *
 * A channel whose series the ESO did not carry reads null, not zero. Zero is a
 * measurement; this is the absence of one, and the strip letters it as an em
 * dash and stays out of the rail.
 */
function readMeters(eso, at) {
  const readings = new Map();
  if (!eso || at == null) return readings;
  for (const channel of CHANNELS) {
    if (!channel.meter || channel.meter.derived || !channel.meter.terms.length) continue;
    if (!modelState?.get(channel.id).engaged) {
      readings.set(channel.id, null);
      continue;
    }
    let total = 0;
    let found = true;
    for (const term of channel.meter.terms) {
      const series = hourly(eso, exactly(term.variable));
      const point = series[at];
      if (!point) {
        found = false;
        break;
      }
      total += (term.sign * point.value) / (term.perBuilding ? params.multiplier : 1);
    }
    readings.set(channel.id, found ? total : null);
  }
  return readings;
}

/**
 * Take a channel in or out of the path.
 *
 * The console's own patch markers are one caller; the scoreboard's "Patch
 * System in" is the other. It is one function rather than two because a second
 * copy would be a second chance to forget the solo release, the gesture
 * brackets or the auto-solve, and the desk would then behave differently
 * depending on which surface the reader happened to press.
 */
function patchChannel(id, off) {
  tour?.note('patch');
  beginGesture();
  bypass[id] = off;
  // Taking a channel in by hand is an answer to the solo question too.
  if (solo && solo !== id) {
    solo = null;
    desk.solo = null;
  }
  applyGeometry();
  // A channel patched out is a different design, and a design the desk stood
  // on. `commit` files the parameter moves; this path never goes through it.
  recordTraverse();
  endGesture();
  desk.settle();
  if (autoOn()) pump();
}

const deskPanel = $('desk');
const deskButton = $('desk-open');

desk = mountConsole({
  host: deskPanel,
  params,
  bypass,
  onChange(key, value, done = false) {
    // A console control genuinely turned is the same "take hold of
    // something" note the sheet's sliders file. Priced keys are excluded —
    // they re-letter the bill and resolve nothing, which is not the lesson.
    if (params[key] !== value && !PRICED_KEYS.has(key)) tour?.note('drag');
    commit(key, value, done);
  },
  onPin: toggleHourPin,
  onPatch: patchChannel,
  onSolo(next) {
    // Solo is patching by another route: every other channel goes out.
    tour?.note('patch');
    beginGesture();
    solo = next;
    applyGeometry();
    endGesture();
    desk.settle();
    if (autoOn()) pump();
  },
  onReset: () => revert(),
  onStudy: (key) => studyRun(key),
  onStudyQuantity: (id) => chooseStudyQuantity(id),
  onSurvey: (key) => nameSurveyAxis(key),
  onStudyClear(key) {
    studies.delete(key);
    openStudies.delete(key);
    desk.setStudy(key, null);
    updatePermalink();
    // The desk head's Clear counts the cards, and one just came down.
    syncStudyControls();
  },
});

function openDesk(open) {
  document.body.classList.toggle('desk-open', open);
  deskButton.setAttribute('aria-expanded', String(open));
  $('desk-count').textContent = open ? 'Close the desk' : 'Every control on the desk';
  if (open) tour?.note('desk');
  // The patch note's subject moves with the desk: the first patch button when
  // the console is open, the button that opens it when it is not.
  tour?.syncGuide();
  // The plate is inside a column that just changed width.
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderTrace, 60);
}

deskButton.addEventListener('click', () => openDesk(!document.body.classList.contains('desk-open')));
$('desk-revert').addEventListener('click', () => revert());
$('desk-close').addEventListener('click', () => {
  openDesk(false);
  deskButton.focus();
});

/* ══ the general notes ═══════════════════════════════════════════════════ */

// The onboarding reads the desk rather than asking it: this module reports
// each real event once — the solve, the drag, the attach, the patch — and the
// notes decide whether it fills a square. Mounted after the console so the
// patch note can point at a real patch button, and handed `openDesk` so a
// note whose subject lives on the console can stage it.
const tour = mountTour({ openDesk });
// The two carry-away paths are one step: either proves the scheme leaves the
// page. The buttons keep their own handlers; the note is a second listener.
$('share').addEventListener('click', () => tour?.note('link'));
$('download').addEventListener('click', () => tour?.note('link'));

/* ══ the baseline ════════════════════════════════════════════════════════ */

// What the sheet showed when you took hold of a slider, held so every solve
// that follows reads as a change rather than a replacement. It is captured per
// gesture, not per run: during a slow drag the previous run is 0.7 s old and
// nearly identical to the current one, so differencing against it would report
// nothing. Differencing against where you started is the reading you want.
let gesture = false;
let baseline = null; // { columns, label }
let solvedColumns = null; // the schedule behind the visible results
let solvedParams = null; // the shape those results describe

function beginGesture({ priced = false } = {}) {
  if (gesture) return;
  gesture = true;
  // Money gets the same treatment the plate gives temperature: a figure that
  // changes with no record of what it changed from is a flicker, not a reading.
  billGhost = bill;
  // And so does the chased line, which is the whole of its use: watching a
  // margin close as you drag insulation is the reading, and a margin with no
  // record of where it started is just a number that keeps changing.
  chaseGhost = chaseNow();
  // A priced control cannot move the plate or the results schedule, so it must
  // not letter them with a baseline it did not shift.
  if (priced || !solvedColumns || !solvedParams) return;
  baseline = { columns: solvedColumns, label: shapeLabel(solvedParams) };
  ghost = plot ? plot.zone : null;
  $('baseline-note').textContent = `Δ against ${baseline.label}`;
}

const endGesture = () => {
  gesture = false;
  // The chase ghost is deliberately *not* cleared here, which is the bill's
  // rule rather than the plate's. The plate re-draws continuously, so its ghost
  // has done its work by the time you let go; a margin on an attached year does
  // not move until the release solve lands, so clearing it here would mean the
  // annual cadence — the one where the numbers matter most — never showed a
  // ghost at all. It stands until the next gesture takes hold and replaces it.
  renderChase();
  // The address bar is a reading like any other: it updates when you let go,
  // never per frame, the same rule the gesture ghosts follow.
  updatePermalink();
  // The study pool held its dispatch while the hand was down — real cores go
  // to the drag's own solves — so the release is what hands them back, and it
  // is also when every study the gesture left behind re-queues itself.
  studyScheduler?.drain();
  refreshStudies();
  // The ground follows the same switch, and mostly does nothing: a survey's
  // rest shape omits both of its axes, so moving along either — which is what
  // standing on a measured point is — leaves the ground standing and only
  // walks the stance mark across it.
  refreshSurvey?.();
};

/* ══ controls ════════════════════════════════════════════════════════════ */

let epwText;
let engineReady = false;
const site = $('site');
const autoBox = $('auto');

/**
 * What a weather file's own calendar can offer the holiday list.
 *
 * `''` for a file that names no holidays — which is every TMYx there is, so it
 * is the answer the strip almost always prints. `null` when the file names days
 * this page cannot read: the offer is withdrawn entirely rather than stamping
 * the subset that happened to parse, and the strip says as much. Otherwise the
 * file's days as a holiday list.
 */
function weatherHolidays(epw) {
  const { holidays } = parseEpwCalendar(epw);
  if (holidays.length === 0) return '';
  try {
    return holidayList(holidays);
  } catch {
    return null;
  }
}

/**
 * Auto-solve has two cadences, because the two run types are three orders of
 * magnitude apart.
 *
 * A warm design day is two days at an hourly timestep and lands in about 60 ms,
 * which fits inside a drag with room to spare: it solves continuously, and what
 * you let go of is what you were already looking at. A weather file is 8,760
 * hours and takes about 3 s, which is far too slow to chase a thumb but nowhere
 * near slow enough to be worth a button — so it solves once, on release.
 *
 * The cadence is the only thing that changes. Both modes go through the same
 * scheduler and both are latest-wins, so an annual run started on one release
 * and overtaken by another simply re-solves the shape you ended on.
 */
const annual = () => Boolean(epwText);
const autoOn = () => autoBox.checked && engineReady;
const continuous = () => autoOn() && !annual();

function syncAuto() {
  $('auto-sub').textContent = !autoOn()
    ? 'Solve by hand'
    : annual()
      ? 'Re-runs when you let go'
      : 'Re-runs as you drag';
  $('runs-sub').textContent = autoOn() ? 'auto, latest shape wins' : 'this session';
  // The ledger is worth watching only when a run is slow enough to watch.
  $('phases').parentElement.classList.toggle('quiet', continuous());
}

autoBox.addEventListener('change', () => {
  syncAuto();
  if (autoOn()) {
    pump();
    resumeWaitingStudies();
    // Switching auto back on catches the studies up the way it catches the
    // sheet up: whatever went stale while solving by hand re-queues now.
    refreshStudies();
  } else {
    markStale();
    // Background healing is exactly what this toggle governs, so the refresh
    // backlog goes with it — but a study the reader asked for by name keeps
    // running, the way the sheet keeps the result it already has.
    studyScheduler?.cancelWhere((job) => job.origin === 'refresh', 'shed');
  }
});

/**
 * Whether a study can be taken at all, with the reason when it cannot.
 *
 * A study sweeps whatever run the sheet would solve — a score of design-day
 * solves inside a couple of seconds, or a score of annual runs in about
 * twenty, which the per-run counter makes worth the wait. Two things bar it:
 * no engine yet, and a link's station still in flight — that window carries
 * the link's `sizingPeriods=No` with no year attached, a desk whose every
 * sample would fatal on zero environments seconds before it would have swept
 * fine. The console boots with the gate closed, so nothing is callable before
 * this module reaches the state the gate reads.
 */
function syncSweepGate() {
  desk?.setSweepEnabled(
    engineReady && !linkAttachPending,
    engineReady
      ? 'The linked weather station is still being fetched.'
      : 'The engine is still arriving.',
  );
}

/* ── picking a weather location ──────────────────────────────────────────
 *
 * The sheet ships with Denver's two design days. Choosing a station swaps the
 * run for a real year at a real place — which means the drawing has to change
 * with it: the titleblock names the site, and the datum lines are redrawn from
 * that station's own annual heating and cooling design conditions, because a
 * Denver datum across a Singapore year would be a lie told in ink.
 *
 * Which conditions those are is not one answer. onebuilding omits whole
 * families of design day where a station has no record to build them from, so
 * `designConditionsFrom` takes the first it will accept from a declared order
 * and the plate letters whichever it got — `1% clg dp` over a station with no
 * wetbulb record, not `1% clg db` over a day that is not one. A station
 * publishing none it can accept is refused entirely, which is the same
 * sentence as the Denver-datum one above: a design day borrowed from anywhere
 * is a lie told in ink.
 */

const panel = $('site-panel');
const search = $('site-search');
const list = $('site-list');
const note = $('site-note');
const foot = $('site-foot');
const near = $('site-near');
const source = $('site-source');

// The foot carries the two things that depend on where you are in the list: on
// the way in, how to find a place; once you have one, how to get back out.
const back = document.createElement('button');
back.type = 'button';
back.className = 'link';
back.textContent = '← All locations';
back.addEventListener('click', () => query(search.value));
const resetFoot = () => foot.replaceChildren(near, source);

let rows = []; // what the list is showing
let cursor = -1; // which row Enter would take
let take; // what taking it does — a place, or a file of that place
let queryToken = 0; // latest-wins, exactly like the solver
let inflight; // the download in progress, if any
// Whether a station is being attached right now. `inflight` cannot answer
// this: its controller is only ever aborted by the *next* choose, so after a
// successful attach `signal.aborted` stays false for ever and anything gated
// on it would be gated shut permanently. This is set and cleared around the
// whole attach, which is what a caller actually wants to know.
let stationAttaching = false;

const say = (text, bad = false) => {
  note.hidden = !text;
  note.textContent = text ?? '';
  note.className = bad ? 'site-note bad' : 'site-note';
};

function openPanel() {
  site.classList.add('open');
  panel.hidden = false;
  $('site-field').setAttribute('aria-expanded', 'true');
  search.focus();
  search.select();
  // Always reopen on the places, never on the flavours of a place chosen a
  // minute ago — the question the panel asks first is "where".
  if (search.value) query(search.value);
  else {
    resetFoot();
    render([], { onPick: showFlavors });
    say('Type a city, or take the nearest station to you.');
  }
}

function closePanel() {
  site.classList.remove('open');
  panel.hidden = true;
  $('site-field').setAttribute('aria-expanded', 'false');
}

/**
 * One list, two states.
 *
 * Searching gives you places; choosing a place gives you that place's flavours.
 * Keeping both in the same list means the arrow keys never change meaning, and
 * the second step costs nothing to skip past — Enter twice takes the most recent
 * window at the top hit.
 */
function render(found, { distances = false, onPick } = {}) {
  rows = found;
  cursor = found.length ? 0 : -1;
  // Enter and a click must do the same thing, so they share one handler.
  take = onPick;
  list.replaceChildren(
    ...found.map((row, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'none'); // the option is the button inside it
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `site-opt-${i}`;
      button.className = 'site-opt' + (i === cursor ? ' here' : '');
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(i === cursor));

      const name = document.createElement('b');
      const far = document.createElement('span');
      far.className = 'far';

      if (row.flavors) {
        name.textContent = siteName(row.station);
        const where = document.createElement('i');
        where.textContent = ` · ${siteRegion(row.station)}`;
        name.append(where);

        const zone = document.createElement('span');
        zone.className = 'cz';
        zone.textContent = climateZone(row.station);

        far.textContent =
          distances && row.distanceKm != null
            ? `${row.distanceKm < 10 ? row.distanceKm.toFixed(1) : Math.round(row.distanceKm)} km`
            : `${row.flavors.length} ${row.flavors.length === 1 ? 'file' : 'files'}`;
        button.append(name, zone, far);
      } else {
        // A flavour: the years it samples, and the degree days that result.
        name.textContent = row.label;
        far.textContent = degreeDays(row.station);
        button.append(name, far);
      }

      button.addEventListener('mouseenter', () => setCursor(i, { scroll: false }));
      button.addEventListener('click', () => take(row));
      li.append(button);
      return li;
    })
  );
  search.setAttribute('aria-activedescendant', cursor >= 0 ? `site-opt-${cursor}` : '');
}

/** Step two: the chosen place's flavours, most recent window first. */
function showFlavors(row) {
  render(row.flavors, { onPick: (pick) => choose(row, pick) });
  say(null);
  const label = `${siteName(row.station)}, ${siteRegion(row.station)}`;
  foot.replaceChildren(back, document.createTextNode(label));
}

/**
 * A refusal that carries its next step.
 *
 * Saying why a station cannot be used and then handing back an empty field is
 * a stop, not an answer -- and the reader who met it typed a city name, so the
 * one thing they have already told us is where they want to be. The picker
 * reopens on the stations nearest the refused one, which for the case that
 * prompted this work is the whole fix: Boston 994971 publishes no annual
 * cooling conditions in any of its five windows, and Boston-Logan is 2 km away
 * and clean.
 *
 * The refused site itself is filtered out. Its other windows are still one
 * `← All locations` away, but offering them first would be offering four more
 * archives of the file that was just refused -- and they carry the identical
 * three design days, measured.
 *
 * The offer is a courtesy and the refusal has already been stated in full, so
 * a failure here is swallowed rather than replacing one refusal with another.
 */
async function offerNearby(refused, reason) {
  try {
    const token = ++queryToken;
    const found = await nearestSites(refused.latitude, refused.longitude, 8);
    if (token !== queryToken) return;
    const elsewhere = found.filter((row) => String(row.station.wmo) !== String(refused.wmo));
    site.classList.add('open');
    panel.hidden = false;
    $('site-field').setAttribute('aria-expanded', 'true');
    resetFoot();
    render(elsewhere, { distances: true, onPick: showFlavors });
    say(`${reason}. These are the nearest stations to it.`, true);
    search.focus();
  } catch {
    // Nothing to say: the reason is already on the sheet and in the status line.
  }
}

function setCursor(next, { scroll = true } = {}) {
  if (!rows.length) return;
  cursor = next;
  const options = [...list.querySelectorAll('.site-opt')];
  options.forEach((el, i) => {
    el.classList.toggle('here', i === cursor);
    el.setAttribute('aria-selected', String(i === cursor));
  });
  if (scroll) options[cursor]?.scrollIntoView({ block: 'nearest' });
  // The focus stays in the search box, so the highlighted row has to be named.
  search.setAttribute('aria-activedescendant', options[cursor]?.id ?? '');
}

const move = (delta) => setCursor((cursor + delta + rows.length) % rows.length);

/**
 * The index is 1.7 MB and arrives once. Every query after that is synchronous
 * inside the package, so the only thing worth narrating is the first one — and
 * only if it is slow enough to notice.
 */
async function query(text) {
  const token = ++queryToken;
  resetFoot();
  if (!text.trim()) {
    render([]);
    say('Type a city, or take the nearest station to you.');
    return;
  }
  const slow = setTimeout(() => token === queryToken && say('Loading the station index…'), 120);
  try {
    const found = await searchSites(text, 8);
    if (token !== queryToken) return;
    render(found, { onPick: showFlavors });
    say(found.length ? null : `Nothing matches “${text}”.`);
  } catch (error) {
    if (token === queryToken) say(`The station index could not be read: ${error.message}`, true);
  } finally {
    clearTimeout(slow);
  }
}

let typing;
search.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => query(search.value), 110);
});

search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (rows[cursor]) take(rows[cursor]);
  } else if (e.key === 'Escape') {
    // Escape backs out one step at a time: flavours, then the panel.
    if (foot.contains(back)) query(search.value);
    else {
      closePanel();
      $('site-field').focus();
    }
  }
});

$('site-field').addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));

document.addEventListener('pointerdown', (e) => {
  if (!panel.hidden && !site.contains(e.target)) closePanel();
});

$('site-near').addEventListener('click', async () => {
  say('Asking the browser where you are…');
  try {
    const [latitude, longitude] = await here();
    const token = ++queryToken;
    const found = await nearestSites(latitude, longitude, 8);
    if (token !== queryToken) return;
    render(found, { distances: true, onPick: showFlavors });
    say(null);
  } catch (error) {
    say(error.message, true);
  }
});

/**
 * Take a station: download its archive, unpack it, and re-letter the sheet. The
 * download is the one slow step on this page that is not the engine — a few
 * hundred kilobytes through a proxy — so it narrates itself in the status line
 * and can be superseded by a second choice mid-flight.
 *
 * The archive carries the site's design conditions beside its year, and both go
 * into the model: the run period comes off the EPW, the two design days and the
 * `Site:Location` come off the DDY. Keeping Denver's while running another
 * city's weather was not just untidy on the sheet — the engine warned that the
 * two disagreed, and sized the design days at the wrong pressure.
 */
async function choose(row, pick, sizing = 'No') {
  // Wrapped rather than flagged inline: `attach` below has half a dozen
  // refusal exits — no DDY, an aborted download, a design day the schema
  // types wrong — and a flag cleared at five of them is a flag that is
  // eventually left set at the sixth, which would gate the descent shut for
  // the rest of the session with nothing anywhere saying why.
  stationAttaching = true;
  try {
    return await attach(row, pick, sizing);
  } finally {
    stationAttaching = false;
  }
}

async function attach(row, pick, sizing) {
  const picked = pick.station;
  const studyContext = desk?.captureStudyContext();
  inflight?.abort();
  inflight = new AbortController();
  const { signal } = inflight;

  closePanel();
  site.classList.add('picked');
  $('site-main').textContent = `${siteName(picked)}, ${siteRegion(picked)}`;
  $('site-sub').replaceChildren(document.createTextNode('Fetching the weather file…'));
  statusEl.className = 'status';
  statusEl.textContent = `Downloading TMYx ${pick.label} for ${siteName(picked)}…`;

  // Hand the field back, saying why, and reopen the picker on somewhere the
  // reader can actually go. The sheet keeps whatever climate it already had,
  // which is the one it is still lettered with.
  const refuse = (what, reason) => {
    const message = `${siteName(picked)} ${what}: ${reason}`;
    site.classList.remove('picked');
    $('site-main').textContent = 'Choose a weather location';
    $('site-sub').textContent = 'Any of 17,292 TMYx stations, for a full 8,760-hour year';
    statusEl.className = 'status bad';
    statusEl.textContent = message;
    offerNearby(picked, message);
    return reason;
  };

  // Three outcomes, told apart for the permalink boot: true is attached, null
  // is superseded by a later choice and calls for nothing at all, and a string
  // is a refusal, and the string is the reason.
  //
  // The reason is handed back rather than only lettered because the link path
  // has its own sentence to write and used to write it over the top of this
  // one: `attachFromLink` lettered "could not be attached, so the whole link
  // was set aside" into the same status line `refuse` had just explained
  // itself in. A reader arriving on a link to a station with no annual cooling
  // conditions was told only that something had failed, which is the sheet
  // knowing exactly what was wrong and saying none of it.
  let files;
  try {
    files = await weatherFor(picked, signal);
  } catch (error) {
    if (signal.aborted) return null;
    return refuse('could not be fetched', error.message);
  }
  if (signal.aborted) return null;

  // The design conditions are not optional and there is nothing to fall back
  // to: keeping the previous city's design days under this city's name is the
  // exact mismatch this path exists to remove, and doing it quietly would be
  // worse than not running at all. So a station whose DDY cannot be read is
  // refused whole, before the EPW is attached.
  let conditions;
  try {
    if (!files.ddy) throw new Error('its archive carries no DDY');
    conditions = designConditionsFrom(files.ddy, schema);
  } catch (error) {
    return refuse('cannot be used', error.message);
  }

  const zone = document.createElement('span');
  zone.className = 'cz';
  zone.textContent = climateZone(picked);
  $('site-sub').replaceChildren(
    zone,
    document.createTextNode(
      [climateDescription(picked), `TMYx ${pick.label}`, `${picked.elevation} m`]
        .filter(Boolean)
        .join(' · ')
    )
  );

  // Studies in flight were sampling the outgoing climate — their captured
  // EPWs against design days the next line replaces. Cleared by hand, because
  // when `sizingPeriods` does not change hands the `commit` below never
  // reaches `applyGeometry`, and a curve mixing two cities must not survive
  // to be drawn under the new title block. The sample cache goes with them:
  // sample shapes deliberately carry no climate, so cached points solved
  // under the old one would answer for the new. Stops lapse too — they were
  // decisions about desks swept under the departed weather.
  studyScheduler?.clearAll();
  studyStops.clear();
  // The ground goes with them, and it has to go rather than be re-measured
  // in place: every spot height on it is a run against the outgoing climate,
  // and a relief holding Denver's readings under Munich's title block would be
  // the exact mismatch the design-conditions refusal two screens up exists to
  // prevent, in a third column. The traverse goes too — a list of designs
  // whose readings are no longer true of anything is not a history worth
  // keeping (FR-052). The chooser's own selection stays: which two controls
  // the reader is interested in is not a property of the weather.
  closeSurvey({ forgetTraverse: true });
  // The comfort line goes with them, and for the same reason: it is 365 daily
  // means of one city's year, and Bavaria's May is not Denver's. Cleared here
  // rather than left to fall out of the identity check in `runningMeanFor`,
  // because the file about to be attached is a new string either way and
  // holding the old one alive until the next solve keeps a megabyte of the
  // departed climate in the cache for no reading at all.
  meanCache = null;

  // The whole climate arrives together: the year on the EPW, the design days
  // and the location on the DDY. Denver's come out, this station's go in.
  epwText = files.epw;
  setDesignConditions(model, conditions);
  desk?.setWeatherHolidays(weatherHolidays(files.epw), parseEpwStartDay(files.epw));

  // The drawing follows the weather, and reads it off the model exactly as it
  // did for Denver: the datum lines from the design days, the co-ordinates from
  // `Site:Location`. Only the place name comes from the picker.
  $('t-location').textContent = `${siteName(picked)}, ${siteRegion(picked)}`;
  $('t-site').textContent = modelFacts(model).site;
  DATUMS = designDayDatums(model);

  // The datums are the one thing on the plate that does not wait for a run:
  // they describe the place, and the place has just changed.
  renderTrace();

  // The tariffs and the grid factor follow the weather, because they are
  // properties of where the building is and the building has just moved.
  //
  // The bill goes with them rather than being re-priced. Its meters were
  // solved against the old city's weather, and running the new city's tariffs
  // over the old city's energy would produce a figure that is true of nowhere
  // -- the exact mismatch the design-conditions refusal above exists to
  // prevent, in another column. A pinned scheme goes too: one priced in
  // Colorado cannot be differenced against one priced in Bavaria, in another
  // currency and against another grid.
  station = picked;
  pinned = null;
  bill = null;
  lastRun = null;
  // The register's targets go with them. A heating demand read in Denver has
  // nothing to say about a criterion being asked of a building in Bavaria, and
  // the kept schemes' deltas would be differencing two climates.
  lastOutcome = null;
  syncPin();
  renderBill();
  renderRegister();
  // The bundle stays where the bill goes, because the two answer to different
  // things. A bill re-priced across a station change would be one city's
  // energy at another city's tariffs, true of nowhere; the bundle is not
  // re-derived at all — it holds its own IDF, its own EPW, and a manifest that
  // names the city it was solved in. Downloaded after the picker has moved on
  // it is still exactly the run it says it is. This line used to call
  // `syncDownload`, back when the bundle rode on `lastRun` and clearing that
  // left the button lettered live over nothing; `lastBundle` cannot be in that
  // state, because lettered means loaded.
  // The old curves go; the studies do not. The chooser that sent a reader to
  // fetch weather is still their question, so every card becomes an explicit
  // wait under the incoming climate rather than disappearing with the outgoing
  // samples. The scheduler and cache were cleared above, so this redraw can
  // only show missing points and cannot accidentally carry Denver under this
  // station's title block.
  redrawStudiesForQuantity({ queue: false });
  syncStudyControls();

  // With a real year attached the sizing days stop earning their place. They
  // are 48 hours of the most extreme weather in the file, run ahead of 8,760
  // hours of the actual one, and every reading downstream then has to be told
  // which environment it means -- the plate labels them, the
  // meters had to be filtered to exclude them, and the bill would otherwise
  // carry them. Skipped by default once there is a year to run, and still
  // switchable on the Run strip for anyone sizing equipment. A permalink that
  // deliberately kept them hands its own setting in as `sizing`, so the run
  // solves once as the link wrote it instead of being corrected after a
  // wasted 8,760-hour solve.
  //
  // Through `commit` rather than by assignment, because that is the one path
  // from a control to the model and it is what keeps the Run strip agreeing
  // with the document. It also means auto-solve picks the change up, so the
  // year starts solving on the release rather than waiting to be asked.
  commit('sizingPeriods', sizing, true);
  // `commit` queues stale studies when it changes the run setting. If that
  // setting was already in place, queue them here; `has` prevents this pass
  // from superseding work the commit already started.
  redrawStudiesForQuantity({ queue: true });
  desk?.restoreStudyContext(studyContext);
  // When the setting already stood where the link or the last station left
  // it, that commit moved nothing and its pump found nothing to solve — yet
  // the climate above genuinely changed, and the station is deliberately not
  // part of the shape key. Force the solve the sentence below promises.
  if (autoOn() && shapeKey(params) === solvedShape) {
    forced = true;
    pump();
  }

  const hours = runHours().toLocaleString('en-US');
  // The run type goes on with the hours, out of `syncRunSub`, which reads both
  // off the calendar: an attach onto a desk with months already taken out is
  // not an annual run and must not be lettered as one.
  syncRunSub();
  statusEl.className = 'status';
  statusEl.textContent =
    sizing === 'Yes'
      ? `${siteName(picked)} attached, design conditions and all — the run covers ${hours} hours, sizing days included.`
      : `${siteName(picked)} attached, design conditions and all — the run covers ${hours} hours, with the sizing days skipped.`;
  syncAuto();
  markStale();
  // Filed on the attach itself, wherever it came from: a reader arriving on a
  // station link has a year genuinely attached, and the notes record what has
  // happened on this desk, not who did it.
  tour?.note('station');
  return true;
}

/* ══ the permalink ═══════════════════════════════════════════════════════ */

/**
 * The attached station as the link carries it, or null while the sheet still
 * has the Denver design days it shipped with. The stock `station` seed holds
 * only a tariff region and no archive, which is what `url` distinguishes.
 */
const stationToken = () =>
  station?.url ? { wmo: String(station.wmo), window: flavorWindow(station) } : null;

// True from the moment a link's station lookup starts until it attaches, is
// refused, or is superseded. It holds the address bar still (see
// `updatePermalink`) so the link being honoured cannot lose its own station.
let linkAttachPending = false;

/**
 * The one answer to "what is the scheme right now". It encodes `patching()`,
 * not the raw patch bay, because `patching()` is what reaches the IDF —
 * `applyModel` and `shapeKey` both consult it — and a link has to reproduce
 * the building on the sheet, solo included. The first cut had two builders,
 * one per surface, and they disagreed under solo: the address bar carried the
 * pre-solo patch state while the bundle's manifest carried the solo map.
 */
const schemeHash = (p = params) =>
  encodeState({
    params: p,
    bypass: patching(),
    station: stationToken(),
    pin: pinnedHour,
    quantity: studyQuantity,
    studies: openStudies,
    // The survey's declaration — its axes, its readings and each axis's
    // extent — and nothing else. The stance is the desk and the desk is
    // already what the pairs above encode; the measured values stay off it
    // because the recipient re-measures to identical numbers (FR-044); and
    // the relief's viewpoint stays off it by the chase pin's rule, that how
    // the ground is being looked at is not what it is (FR-044a).
    survey: survey
      ? {
          x: survey.x.key,
          y: survey.y.key,
          readings: survey.readings.map((reading) => reading.id),
          extents: {
            [survey.x.key]: { from: survey.x.from, to: survey.x.to },
            [survey.y.key]: { from: survey.y.from, to: survey.y.to },
          },
        }
      : null,
  });

/** The absolute form, for the clipboard and the run bundle's manifest. */
const schemeUrl = (p = params) => {
  const hash = schemeHash(p);
  return `${location.origin}${location.pathname}${location.search}${hash ? `#${hash}` : ''}`;
};

/**
 * A link pasted into a tab already on this page is a same-document navigation:
 * the browser moves the hash and loads nothing, which would leave the address
 * claiming a scheme the desk is not showing. Reloading routes it back through
 * the one path a link is honoured by — the boot decode, refusals included.
 * Gestures never trip this: `replaceState` fires no `hashchange`. Only a
 * scheme-shaped fragment (or a cleared one) reloads: an in-page anchor added
 * to this sheet some day must scroll, not reset the reader's whole desk.
 */
window.addEventListener('hashchange', () => {
  const raw = location.hash.slice(1);
  if (raw === schemeHash()) return; // the desk is already showing this scheme
  if (raw === '' || isSchemeFragment(raw)) location.reload();
});

// False until the boot decode has read the fragment. The share button and the
// controls are live markup from the first paint, minutes before a cold cache
// finishes the engine download — and a click or a drag in that window would
// rewrite the address from the default desk, destroying the very link the
// decode is about to honour.
let booted = false;

/** Re-letter the address bar from the desk. Called wherever a gesture ends. */
function updatePermalink() {
  // While the fragment is unread, or a link's station is still being fetched,
  // the address keeps the claim it arrived with: rewriting it mid-honour
  // would strip the scheme off the very link being opened.
  if (!booted || linkAttachPending) return;
  const hash = schemeHash();
  // `replaceState` rather than assigning `location.hash`: a drag session is
  // one address, not a browser-history entry per release.
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

/**
 * Refuse a link whole: back to the issued drawing — through `revert`, so solo
 * and the priced channels come back too — with the results of the refused
 * scheme cleared and the reason left standing in the status line. Auto-solve
 * is stopped first, so `revert` schedules no solve; if one is already in
 * flight, `pump` re-letters the reason after it settles, because the solve's
 * own status line would otherwise overwrite the one sentence that says what
 * happened to the link.
 */
let refusalNote = null;
function refuseLink(message) {
  linkAttachPending = false;
  syncSweepGate();
  stopAuto();
  revert();
  // `revert` restores the parameters and the patch bay; the pinned hour is
  // neither, so it has to be released by name or a refused link would leave
  // its one surviving claim on the desk.
  pinnedHour = null;
  clearResults();
  history.replaceState(null, '', location.pathname + location.search);
  statusEl.className = 'status bad';
  statusEl.textContent = message;
  refusalNote = message;
}

let linkedStudiesRestored = false;
/**
 * Cut the ground a link arrived carrying.
 *
 * After the studies rather than beside them, and after the station has landed
 * where there is one, because a survey queues thirty-six runs and a sample
 * built during a link attach would fatal on zero environments. The declaration
 * has already been validated whole by `decodeSurvey` — a link naming an axis,
 * a reading or an extent that cannot be honoured was refused before anything
 * was loaded — so what is left here is to name it and let the ground fill.
 */
function restoreLinkedSurvey(state) {
  if (!state?.survey) return;
  const { x, y, readings, extents } = state.survey;
  // The link's extents come back into the chooser too, or the boxes would
  // letter the control's full range over a ground cut narrower than that.
  surveyChoice = { x, y, readings: [...readings], extents: { ...extents } };
  syncSurveyAxes();
  openSurvey({ xKey: x, yKey: y, readingIds: readings, extents });
}

function restoreLinkedStudies(state) {
  if (linkedStudiesRestored || !state?.quantity) return;
  linkedStudiesRestored = true;
  studyQuantity = quantityOf(state.quantity).id;
  for (const key of state.studies ?? []) {
    const job = jobForStudy(key);
    const quantity = quantityOf(studyQuantity);
    const offers = studyOffers(job.snapshot, job.patch, job.epw);
    const selected = offers.find((offer) => offer.quantity.id === quantity.id);
    const waiting = {
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      wholeYear: job.annual && isWholeYear(job.snapshot.months),
      quantity: quantity.id,
      offers,
      waiting: {
        quantity: quantity.label,
        missing: job.total,
        reason: selected.available ? null : `${selected.reason} ${selected.fix}`,
      },
      curve: [],
      coarse: false,
    };
    openStudies.add(key);
    studies.set(key, waiting);
    desk.setStudy(key, waiting, { stale: false });
    if (selected.available && autoOn()) studyScheduler.enqueue(job);
  }
  syncStudyControls();
}

/**
 * Attach the station a link names, through the same `choose` path the picker
 * uses. The lookup is by WMO number against the live index, then by TMYx
 * window across every row that WMO groups into — either missing refuses the
 * link whole, because the design conditions are not optional and there is
 * nothing to fall back to. Anything `choose` throws past its own guards is a
 * refusal too, not an unhandled rejection: half a station is the one outcome
 * this path must not produce.
 */
async function attachFromLink(linked) {
  const { wmo, window: win } = linked.station;
  const named = `station ${wmo}${win ? ` (TMYx ${win})` : ''}`;
  // The full desk as the link set it, captured before the first await —
  // priced keys included, which `shapeKey` deliberately drops. If the desk
  // still reads exactly this when a refusal comes back, the whole link is set
  // aside; if the reader has meanwhile touched anything, even a tariff, their
  // work outranks a link that failed to finish.
  const untouched = JSON.stringify([params, patching()]);
  linkAttachPending = true;
  syncSweepGate();
  statusEl.className = 'status';
  statusEl.textContent = `Fetching the linked weather ${named}…`;
  try {
    let flavors;
    try {
      const rows = await searchSites(wmo, 8);
      // One WMO can group into several rows when onebuilding spells the city
      // differently between archives, so the window is searched across all of
      // them, not the first.
      flavors = rows
        .filter((r) => String(r.station.wmo) === wmo)
        .flatMap((r) => r.flavors);
    } catch (error) {
      refuseLink(
        `The linked ${named} could not be looked up: ${error.message}. The sheet is at its defaults.`,
      );
      return;
    }
    const pick = flavors.find((f) => flavorWindow(f.station) === win);
    if (!pick) {
      // Two different failures, blamed correctly: a station the index has
      // never heard of, or a real station without the year the link names.
      refuseLink(
        flavors.length
          ? `This link names ${named}, but station ${wmo} is published without that window. The sheet is at its defaults.`
          : `This link names ${named}, which is not in the station index. The sheet is at its defaults.`,
      );
      return;
    }
    let took;
    try {
      // The link's own sizing-day setting rides in with the attach, so a link
      // that kept them solves once, as itself, instead of being corrected
      // after a wasted annual run.
      took = await choose(null, pick, linked.params.sizingPeriods);
    } catch (error) {
      refuseLink(
        `The linked ${named} could not be attached — ${error.message} — so the whole link was set aside and the sheet is at its defaults.`,
      );
      return;
    }
    // `choose` hands back the reason it refused, and it is lettered rather
    // than summarised: "publishes no annual cooling design conditions" tells
    // the reader which link they were sent and what is wrong with it, where
    // "could not be attached" tells them only that today is not going well.
    if (typeof took === 'string' && JSON.stringify([params, patching()]) === untouched) {
      refuseLink(
        `The linked ${named} could not be attached — ${took} — so the whole link was set aside and the sheet is at its defaults.`,
      );
      return;
    }
  } finally {
    linkAttachPending = false;
    syncSweepGate();
  }
  restoreLinkedStudies(linked);
  // The ground last, and only now: it queues thirty-six runs, and a sample
  // built before the station landed would fatal on zero environments.
  restoreLinkedSurvey(linked);
  // The attach held the address still; now that the station is real, one
  // rewrite brings the bar back to lettering the desk.
  updatePermalink();
}

/* ══ the register ════════════════════════════════════════════════════════ */

/**
 * The schedule of schemes: what this design could be built to, and what you
 * kept.
 *
 * Two instruments in one section, because they answer the two halves of the
 * same question. A **standard** is somebody else's specification laid over your
 * building — it moves the controls it has an opinion about and leaves the rest
 * of the drawing alone, which is what makes "what would it take to build this
 * to Passivhaus" a question you can ask of the thing you have already drawn
 * rather than a different building you have to go and draw. A **kept scheme**
 * is an idea of your own, held as its permalink so that saving and sharing are
 * the same act, and restored whole.
 *
 * Nothing here is remembered state. Whether the desk is built to a standard is
 * measured off `params` every time the desk moves, exactly the way the
 * axonometric is measured off the vertices — press Apply and then nudge a wall
 * resistance, and the conformance falls away by itself, because there was
 * never a flag to go stale.
 */

const SCHEME_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * The shelf's storage, probed with a real write.
 *
 * Merely reading `localStorage` is not enough of a test: a browser with site
 * data switched off, and Safari in private browsing, hand over an object that
 * looks perfectly serviceable and throws on the first `setItem`. Finding that
 * out at the moment somebody presses Save is finding it out one press too
 * late, so the probe happens here and the register says up front that it
 * cannot keep anything.
 */
const shelfStore = (() => {
  const probe = '__shoebox_probe__';
  try {
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
})();

const shelf = new Shelf(shelfStore);
let kept = []; // the shelf as last read
let shelfNote = null; // why it could not be read, when it could not
// What the last run measured, in the terms the targets are written in. Read
// once at the solve rather than off the ESO at draw time, for the same reason
// the bundle's identity is captured before the await: the register re-letters
// on every gesture, and re-reading 8,760 points to do it would make a drag
// stutter for a number that cannot have changed.
let lastOutcome = null;

/** Every distinct temperature the shipped criteria count exceedances above. */
const OVERHEAT_THRESHOLDS = Object.freeze([
  ...new Set(
    PRESETS.flatMap((p) => p.targets).filter((t) => t.metric === 'overheat').map((t) => t.above),
  ),
]);

function readShelf() {
  if (!shelfStore) {
    kept = [];
    shelfNote =
      'This browser is not letting the page keep anything, so no scheme can be saved here. ' +
      'The scheme link still works — copy it and paste it back.';
    return;
  }
  try {
    kept = shelf.list();
    shelfNote = null;
  } catch (error) {
    // A shelf that cannot be read is not an empty shelf, and drawing it as one
    // would tell the reader they had never saved anything. It is refused
    // whole, with the reason standing where the schemes would have been.
    kept = [];
    shelfNote = `${error.message}. Nothing has been deleted — this page is simply not going to guess at it.`;
  }
}

/** The first unused letter, so a scheme has a name before it is asked for one. */
function nextSchemeName() {
  const taken = new Set(kept.map((s) => s.name));
  for (const letter of SCHEME_LETTERS) {
    const name = `Scheme ${letter}`;
    if (!taken.has(name)) return name;
  }
  return `Scheme ${kept.length + 1}`;
}


/* ── the overheating criteria ─────────────────────────────────────────── */

/**
 * What the attached EPW's own LOCATION record says about itself.
 *
 * **This belongs in `src/epw.js`**, beside `parseEpwCalendar`,
 * `parseEpwStartDay` and `dailyMeans`, and it is here only because that module
 * does not carry it yet. It is EPW parsing and its only honest test is a real
 * file, which is the whole argument for keeping every header reader in one
 * place; moving it costs one import and nothing else, because nothing outside
 * this pair of functions knows the record's shape.
 *
 * The record is the first line of every EPW and the fields are positional:
 * `LOCATION,City,State,Country,Source,WMO,Lat,Lon,TimeZone,Elevation`.
 * `WeatherFile` wants six of the ten and refuses a partial object outright, so
 * every one of them is passed and an absent field is passed as `null` — "the
 * file says nothing here" and "nobody read it" must not be the same state, and
 * an empty field between two commas is the first of those. A file carrying no
 * LOCATION record at all is the same statement made six times over, which is
 * exactly what `WeatherFile.declares` letters as "a file whose LOCATION record
 * declares nothing about itself"; there is nothing to throw about and nothing
 * to substitute.
 *
 * Nothing here judges the file. WFR:2026 names a specific one and this page
 * cannot read a file's provenance, so the two descriptions are printed side by
 * side and the reader draws the conclusion (FR-015).
 */
function readLocation(epw) {
  // Only the head of the file is searched. The record is the first line of a
  // conforming EPW, and scanning 8,760 data rows for a header that is not
  // there would be the one expensive way to answer "no".
  const line = epw.split(/\r?\n/, 16).find((row) => /^LOCATION\s*,/i.test(row));
  const fields = line ? line.split(',').map((field) => field.trim()) : [];
  // onebuilding writes a bare hyphen where a station has no record to publish,
  // the same convention the DDY uses for a design condition it cannot fill.
  const at = (i) => (fields[i] && fields[i] !== '-' ? fields[i] : null);
  return new WeatherFile({
    city: at(1),
    region: at(2),
    country: at(3),
    source: at(4),
    wmo: at(5),
    timeZone: at(8),
  });
}

/**
 * The same thing, or null on a desk that has attached no file at all.
 *
 * Deliberately **not** cached, unlike the running mean below, and the
 * difference is measured rather than assumed: `readLocation` is 0.003 ms on
 * Chicago TMY3 against `dailyMeans`'s 3.13 ms, because the split is bounded at
 * sixteen lines and never reaches the 8,760 data records. A cache that saves
 * three microseconds twice a solve is a second piece of state to clear on a
 * station change and nothing else.
 */
const declaredWeather = (epw) => (epw ? readLocation(epw) : null);

/**
 * The comfort line's climate half, cached on the attached file's identity.
 *
 * `dailyMeans` parses the file's 8,760 data records down to 365 numbers —
 * measured here at 3.13 ms for Chicago TMY3 under Node, which agrees with the
 * 3.2 ms `epw.js` records for itself, and budgeted at 13.2 ms in the browser.
 * That is more than every criterion of a solve put together (2.44 ms, measured
 * on the same run) and a fifth of a 16.7 ms frame. Those 365 numbers cannot
 * have changed unless the
 * station did, so this is cached exactly as `offersFor` and `calendarFor` are
 * cached on the ESO's identity, and cleared in `choose` where the studies and
 * the sample cache are cleared, for the same reason they are: what was true of
 * Denver's year is not true of Bavaria's.
 *
 * A file that cannot produce a running mean is **refused with its reason**
 * rather than seeded from a guess. A leap year, a file split into several data
 * periods, a record missing from the middle of April: `dailyMeans` and
 * `runningMean` each throw naming the day or the record they could not read,
 * and that sentence rides into criterion a's margin cell, which is the one
 * place on the page a reader can act on it. Criteria b and c need no running
 * mean at all — their thresholds are fixed — and go on reading.
 *
 * `source` is the LOCATION record's own fourth field, `TMYx.2009-2023` and the
 * like, carried into the `RunningMean` so the sheet can letter what the line
 * was built from in the file's own words rather than in ours.
 */
let meanCache = null;
function runningMeanFor(epw) {
  if (!epw) return { epw: null, mean: null, absence: ABSENCE.weather };
  if (meanCache?.epw !== epw) {
    try {
      meanCache = {
        epw,
        mean: runningMean(dailyMeans(epw), declaredWeather(epw)?.source ?? null),
        absence: null,
      };
    } catch (error) {
      meanCache = {
        epw,
        mean: null,
        absence: `the adaptive line cannot be built from this weather file — ${error.message}`,
      };
    }
  }
  return meanCache;
}

/**
 * Every TM59 criterion this run can answer, read once at the solve.
 *
 * Five readings: criterion a and criterion b at both categories, and criterion
 * c, which carries none because 26 °C is the line for both. No category is
 * selected and none can be — which of the two applies is a fact about who will
 * live in the building — so both are read on every run and each row says what
 * it presumes.
 *
 * Everything here is taken off the run and off the snapshot the run was
 * written from, never off live state: `snapshot` is the same object
 * `describeDesk` is handed in the same breath as the IDF, and `epw` is the
 * file `capture` held before the await. A slider turned or a station picked
 * during a 0.7 s annual run would otherwise have these readings describing one
 * building over another building's numbers, which is the failure the capture
 * exists to prevent.
 *
 * Measured at 2.44 ms over a whole Chicago TMY3 year under Node, median of two
 * hundred and stable to 0.03 ms across processes, with the running mean already
 * in hand: the five readings, the count and the qualifications together. That is a seventh of a 16.7 ms frame, and
 * it is paid once per solve rather than once per gesture — the register
 * re-letters on every gesture, and walking 8,760 points again to answer a
 * question that cannot have changed is exactly what `lastOutcome` exists to
 * stop.
 */
function readTm59(eso, snapshot, patched, epw) {
  // The value the occupancy schedule takes when nobody is there, which is a
  // property of the schedule `applyGains` wrote rather than a constant: 0.1
  // for the desk's own weekday band, 0 for a TM59 pattern. Read off the
  // snapshot through `model.js`'s own answer, because testing `> 0` instead
  // counts every hour of all 153 days — 3,672 of them, which is also the
  // figure CL:2026 publishes for a bedroom, so the wrong denominator agrees
  // with a published number for entirely the wrong reason.
  const floor = occupiedFloor(snapshot);
  const trm = runningMeanFor(epw);
  const readings = [];
  for (const category of CATEGORIES) {
    // The whole `{ mean, absence }` pair, not the line out of it. A missing
    // comfort line stands in the reader's own precedence — after the two series
    // it needs and before the season — so a desk with Gains patched out is told
    // to patch Gains in rather than sent to fetch a year it would then read
    // nothing over. Deciding that here is what would make it the second copy of
    // an ordering that lives in one place, and re-scanning the ESO twice per
    // category to do it.
    readings.push(readCriterionA(eso, trm, category, floor));
    readings.push(readCriterionB(eso, category));
  }
  readings.push(readCriterionC(eso, floor));

  return {
    readings,
    // A count of two, never a verdict, and it throws rather than quietly
    // counting over one criterion if a reading in scope is missing.
    count: clearedCount(readings),
    // Taken off a reading rather than by walking the series a sixth time. Any
    // reading that has one has the same one — coverage is a property of the
    // run, not of the criterion — and a run that could not answer anything has
    // none to give, which is the null the rows letter around.
    coverage: readings.find((r) => r.coverage)?.coverage ?? null,
    // The line the count's own category was judged against. Each criterion a
    // row letters its own — Category I's runs 1 K below Category II's, and one
    // block-level figure cannot be both — so this is here for what reads the
    // block as a whole rather than a row of it.
    line: readings.find((r) => r.criterion === CRITERION_BY_ID.a && r.category === COUNT_CATEGORY)
      ?.line ?? null,
    qualifications: qualificationsFor(eso, snapshot, patched, declaredWeather(epw)),
  };
}

/**
 * Everything the last run measured that a criterion might ask about.
 *
 * The demand intensities and the two temperature extremes come from the same
 * readers the study uses, so a target and a study curve of the same quantity
 * cannot disagree about what it is.
 *
 * The energy use intensity is the one reading here that does *not* come off
 * the demand meters, and deliberately: `demandOver` stopped returning a total
 * of the demand side because that figure is before the plant, has no published
 * definition and no benchmark to hold it against. Every published line a
 * criterion quotes — LETI's 55 kWh/m²·yr among them — is metered site energy
 * *after* the plant, which is precisely the bill's per-m² row. So it is read
 * from the bill, which `solve` builds a few lines before calling this, and only
 * over a whole year, by the same rule that gates the bill's own intensity: a
 * benchmark is twelve months long, and eleven of them compared against it is
 * not a near miss but a different quantity.
 *
 * The TM59 block is the one reading here with a shape rather than a number,
 * because its criteria are shares, night counts, absences with their own fixes
 * and a coverage that has to be lettered beside every one of them. It is taken
 * here for the reason everything else in this function is: the register
 * re-letters on every gesture, and re-reading 8,760 points to do it would make
 * a drag stutter for a figure that cannot have changed.
 */
function readOutcome(eso, snapshot, patched, epw) {
  const overheat = new Map();
  for (const above of OVERHEAT_THRESHOLDS) overheat.set(above, readOverheat(eso, above));
  // Gross floor, not the plate: a criterion is per square metre of building,
  // and dividing a four-storey block's demand by one storey reads four times
  // whatever it really is. The bill, the schedule's columns and every sweep
  // sample divide by the same figure, so the scoreboard cannot disagree with
  // the rows above it about how big the building is.
  const floorArea = geometryFacts(model).grossFloor;
  return {
    eui: bill?.wholeYear ? bill.intensity('metered') : null,
    ...(readDemand(eso, floorArea) ?? {}),
    ...(readPeaks(eso, floorArea) ?? {}),
    ...(readExtremes(eso) ?? {}),
    overheat,
    tm59: readTm59(eso, snapshot, patched, epw),
  };
}

/**
 * Which criterion of `tm59.js` each of the three TM59 metrics resolves to.
 *
 * Declared as a table rather than sliced out of the metric's name, because
 * `metric.slice(4)` is a string operation that happens to work and would go on
 * happening to work right up to the day a metric is called something else.
 */
const TM59_CRITERION = Object.freeze({ tm59a: 'a', tm59b: 'b', tm59c: 'c' });

/**
 * Whether a preset's lines are TM59's criteria, asked of the declaration.
 *
 * Matched on the metrics its targets carry rather than on its name or its id,
 * for the reason the console reads `--index` back off the stylesheet: a fact
 * spelled in two places is a bug that exists at exactly one of them.
 */
const carriesTm59 = (preset) => preset.targets.some((target) => target.metric in TM59_CRITERION);

/**
 * The reading behind one TM59 target, matched on criterion *and* category.
 *
 * The category is half the key and has to be. Criterion a is lettered twice on
 * this board, once against each of TM59's two adaptive lines, and the two
 * targets carry the same metric — matched on the metric alone, a·I and a·II
 * would both resolve to whichever reading came first in the list and the board
 * would print one number under two labels 1 K apart. Criterion c carries no
 * category and its target carries `null`, so the same comparison holds it.
 */
function tm59Reading(target) {
  const id = TM59_CRITERION[target.metric];
  if (!id || !lastOutcome?.tm59) return null;
  return (
    lastOutcome.tm59.readings.find(
      (reading) => reading.criterion.id === id && reading.category === target.category,
    ) ?? null
  );
}

/** The reading one target asks for, or null when the run does not carry it. */
function targetReading(target) {
  if (!lastOutcome) return null;
  const value =
    target.metric in TM59_CRITERION
      ? (tm59Reading(target)?.value ?? null)
      : target.metric === 'overheat'
        ? (lastOutcome.overheat?.get(target.above) ?? null)
        : (lastOutcome[target.metric] ?? null);
  return Number.isFinite(value) ? value : null;
}

/**
 * Why a target has no reading behind it — named, never left blank.
 *
 * An em dash on its own says a number is missing; it does not say what to do
 * about it, and every one of these has something to do about it. A criterion
 * about a year cannot be answered by two design days, and a demand intensity
 * cannot be answered by a zone nobody is conditioning.
 */
function runBlock(needs) {
  if (!lastRun) return 'unrun';
  // The order matters: a peak load asks only for a run, so telling somebody to
  // attach a weather file before telling them to patch System in would send
  // them off to fetch a year they do not need for this line.
  //
  // A summer criterion is the one line on this board that a free-running zone
  // answers perfectly — TM59 is a question about a dwelling with the windows
  // shut and nobody's boiler in it — so `'season'` is let past the System
  // check rather than being told to patch in a unit it has no use for. That is
  // an extension of the order and not a reordering of it: every other target
  // still meets System first, and a `'season'` line that is blank for some
  // other reason still falls through to `tm59Block` below, which reads the
  // reason off the reading itself.
  if (needs !== 'season' && !modelState?.get('system')?.engaged) return 'system';
  if (needs === 'year' && !lastRun.annual) return 'year';
  return null;
}

/**
 * Which of the three TM59 blockages one criterion is standing under, and the
 * sentence that says so.
 *
 * The sentence is the `Reading`'s own, never a second wording of it: a reader
 * who could not be told why a line is blank is the failure `ABSENCE` was
 * written to prevent, and two modules writing that sentence would drift on the
 * first edit. The key is what this table adds — the board's note groups blank
 * lines by it, and a key derived from a different question than the sentence
 * would have the note offering a press for one blockage while the margin cell
 * beside it named another.
 *
 * The precedence between them is settled in `tm59.js`, inside the readers,
 * and is deliberately not restated here. `readCriterionA` asks for its
 * occupancy series *before* it asks whether the run reached the season, which
 * is the ordering this board needs for exactly the reason it already orders
 * System before the weather file: telling somebody to run some of May to
 * September before telling them to patch Gains in would send them off to fetch
 * a summer they would then read nothing over. A `Reading` carries one absence,
 * so mapping that sentence to its key is the whole of the work — a second
 * ordering here could only ever disagree with the first.
 */
const TM59_BLOCK = new Map([
  [ABSENCE.season, 'season'],
  // A run holding every day of the period and not one complete night in the
  // last of them is short of the *period*, not of a series or of an occupant,
  // so it stands under the same key as the season and letters its own fix.
  [ABSENCE.night, 'season'],
  [ABSENCE.occupancy, 'occupancy'],
  [ABSENCE.schedule, 'occupancy'],
  [ABSENCE.operative, 'operative'],
  // Not a TM59 key at all: two design days are the board's existing `'year'`
  // blockage under a summer criterion's own wording, and grouping it anywhere
  // else would take these lines out of the count behind the picker offer that
  // is the one press that fixes them.
  [ABSENCE.weather, 'year'],
]);

function tm59Block(target) {
  const reading = tm59Reading(target);
  // No reading object at all means the solve never asked for this criterion,
  // which is a different state from a criterion that could not answer — and
  // one this page has no sentence for, because it is a bug rather than a desk
  // position.
  if (!reading?.absence) return { key: 'other', says: 'not carried by this run' };
  return { key: TM59_BLOCK.get(reading.absence) ?? 'other', says: reading.absence };
}

function targetBlock(target) {
  const key = runBlock(target.needs);
  if (key === 'unrun') return { key, says: 'nothing solved yet' };
  if (key === 'system') {
    return {
      key,
      says:
        target.needs === 'run'
          ? 'patch System in — a free-running zone has no load to size'
          : 'patch System in — a free-running zone has no demand to meter',
    };
  }
  if (key === 'year') {
    return { key, says: 'attach a weather file — this is a year’s number' };
  }
  // Ahead of the catch-all and behind the two above it, so a summer criterion
  // that is blank for a reason of its own says which one rather than reading
  // as though the series were missing.
  if (target.needs === 'season') return tm59Block(target);
  // The energy use intensity is read off the bill, and the bill draws a per-m²
  // figure only over twelve months, because every published benchmark is a
  // year long. A run with months left out of the calendar is a real run with a
  // real bill — it simply cannot answer this line, and saying so beats the
  // catch-all below, which reads as though the meter were missing.
  if (target.metric === 'eui' && bill && !bill.wholeYear) {
    return { key: 'months', says: 'run the whole year — this is a twelve-month benchmark' };
  }
  return { key: 'other', says: 'not carried by this run' };
}

/**
 * The same finding as a sentence for the margin column.
 *
 * The board's note above the table offers the *press* that clears a blockage
 * and the margin cell letters the reason, so they have to agree about which
 * blockage a line is under. They read one function to do it: the precedence
 * here — System before weather, because a peak load needs no year — is the
 * only copy of that ordering on the page.
 */
function targetAbsence(target) {
  return targetBlock(target).says;
}

/** What the desk is reading right now, in the form a kept scheme stores. */
function measureNow() {
  if (!lastRun) return new Measure();
  return new Measure({
    annual: lastRun.annual,
    hours: lastRun.hours,
    uses: bill ? bill.lines.map((l) => l.use.id) : null,
    // The code, not the `Currency`. A kept scheme goes through `JSON.stringify`
    // into the browser's storage and comes back without identities, so the
    // comparison rule has to be restated on data that survives the trip.
    currency: bill?.currency?.code ?? null,
    metered: bill?.total('metered') ?? null,
    cost: bill?.total('cost') ?? null,
    carbon: bill?.total('carbon') ?? null,
    eui: lastOutcome?.eui ?? null,
    tedi: lastOutcome?.tedi ?? null,
    cedi: lastOutcome?.cedi ?? null,
    peakHeat: lastOutcome?.peakHeat ?? null,
    peakCool: lastOutcome?.peakCool ?? null,
    low: lastOutcome?.low ?? null,
    high: lastOutcome?.high ?? null,
  });
}

/* ── applying a standard ──────────────────────────────────────────────── */

/**
 * Lay a preset over the desk, and say exactly what it did.
 *
 * The same shape as `revert`, and for the same reason: several controls move
 * at once, so the desk is written in one breath and re-applied to the model
 * once, rather than pumping a run per key. Solo comes off, because a soloed
 * desk is a diagnostic and a specification is a design — and because
 * `patching()` under solo would swallow the channels the preset just asked for.
 */
function applyStandard(preset) {
  const before = { ...params };
  const soloWas = solo;
  const next = applyPreset(params, bypass, preset);

  beginGesture();
  Object.assign(params, next.params);
  Object.assign(bypass, next.bypass);
  solo = null;
  if (desk) desk.solo = null;
  for (const sync of Object.values(syncSlider)) sync();
  desk?.sync();
  applyGeometry();
  reprice();
  endGesture();
  desk?.settle();

  // Said before the pump, not after. A solve narrates itself into the same
  // line and will overwrite this within a design day's 50 ms, which is
  // correct — the run is the newer news — but writing it afterwards would
  // have the two racing, and on a manual desk with nothing to solve the
  // sentence would never appear at all.
  const moved = preset.specs.filter((s) => before[s.key] !== s.value).length;
  const patched = preset.engages.length + preset.bypasses.length;
  statusEl.className = 'status';
  statusEl.textContent = preset.specs.length
    ? `${preset.name} laid over the desk — ${moved} control${moved === 1 ? '' : 's'} moved` +
      `${patched ? ` and ${patched} channel${patched === 1 ? '' : 's'} patched` : ''}. ` +
      `${LEFT_ALONE.join(', ')} are as you left them.` +
      (soloWas ? ' Solo came off, so the whole desk is in the path again.' : '')
    : `${preset.name} sets no control — it states an outcome. Its targets are on the scoreboard.`;
  syncStandards();
  if (autoOn()) pump();
}

/* ── keeping and restoring ────────────────────────────────────────────── */

function saveScheme() {
  const scheme = new Scheme({
    id: crypto.randomUUID?.() ?? `s${Date.now()}`,
    name: nextSchemeName(),
    // The scheme is stored exactly as the address bar carries it, `patching()`
    // and all, so a scheme kept under solo reproduces the soloed building —
    // the one place the raw patch bay and what actually reaches the IDF differ.
    hash: schemeHash() || 'v1',
    savedAt: Date.now(),
    station: $('t-location').textContent,
    label: shapeLabel(params),
    measure: measureNow(),
  });
  try {
    kept = shelf.add(scheme);
    shelfNote = null;
    statusEl.className = 'status';
    statusEl.textContent = scheme.measure.solved
      ? `Kept as ${scheme.name}, with what it was reading. Rename it in the schedule below.`
      : `Kept as ${scheme.name}. Nothing had been solved, so it carries its shape and no readings.`;
  } catch (error) {
    statusEl.className = 'status bad';
    statusEl.textContent = `${scheme.name} could not be kept: ${error.message}.`;
  }
  renderShelf();
}

const sameStation = (a, b) =>
  (a?.wmo ?? null) === (b?.wmo ?? null) && (a?.window ?? null) === (b?.window ?? null);

/**
 * Put a kept scheme back on the desk.
 *
 * Two paths, and which one is taken is decided by the weather, not by
 * convenience. A scheme that names the station already attached is applied in
 * place, instantly, exactly as `revert` applies the issued drawing. A scheme
 * that names a *different* station is a different climate — a different year,
 * different design conditions, a different tariff and a different grid — and
 * that is a boot, not a gesture. It goes through the link, which is the one
 * path a whole scheme is honoured by, refusals and all: if the archive cannot
 * be fetched, the reader gets the sentence that already exists for exactly
 * that failure rather than a second, thinner copy of it written here.
 */
function restoreScheme(scheme) {
  let state;
  try {
    state = decodeState(scheme.hash);
  } catch (error) {
    statusEl.className = 'status bad';
    statusEl.textContent =
      `${scheme.name} could not be read back — ${error.message}. It is still on the shelf; ` +
      'copy its link out before deleting it.';
    return;
  }

  if (!sameStation(state.station, stationToken())) {
    statusEl.className = 'status';
    statusEl.textContent = `Restoring ${scheme.name}, which names another station — reloading to fetch its weather…`;
    history.replaceState(null, '', `#${scheme.hash}`);
    location.reload();
    return;
  }

  beginGesture();
  Object.assign(params, state.params);
  Object.assign(bypass, state.bypass);
  // The hash encodes `patching()` rather than the patch bay, so what comes
  // back is the building as it was heard. Solo has already been baked into
  // that map and must not be applied on top of it a second time.
  solo = null;
  if (desk) desk.solo = null;
  for (const sync of Object.values(syncSlider)) sync();
  desk?.sync();
  applyGeometry();
  reprice();
  endGesture();
  desk?.settle();

  statusEl.className = 'status';
  statusEl.textContent = `${scheme.name} restored — ${scheme.label ?? 'the whole desk'}.`;
  syncStandards();
  if (autoOn()) pump();
}

function forgetScheme(scheme) {
  try {
    kept = shelf.remove(scheme.id);
    statusEl.className = 'status';
    statusEl.textContent = `${scheme.name} deleted from the shelf.`;
  } catch (error) {
    statusEl.className = 'status bad';
    statusEl.textContent = `${scheme.name} could not be deleted: ${error.message}.`;
  }
  renderShelf();
}

/* ── drawing the register ─────────────────────────────────────────────── */

const elem = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** A head row, so the register's tables are set like the two schedules above. */
const tableHead = (labels) => {
  const thead = document.createElement('thead');
  const tr = thead.insertRow();
  for (const [label, span] of labels.map((l) => (Array.isArray(l) ? l : [l, 1]))) {
    const th = document.createElement('th');
    th.textContent = label;
    if (span > 1) th.colSpan = span;
    tr.append(th);
  }
  return thead;
};

const linkButton = (text, onClick) => {
  const b = elem('button', 'link', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

// Built once and then only re-lettered: the specification of a standard is a
// published document and does not move, so rebuilding five accordions of it
// on every drag frame would be work done to produce the same nodes again.
const standardCards = new Map();

/**
 * The console half of the split: the specifications, folded to a line each on
 * the desk head, beside the paragraph that introduces the strips.
 *
 * A `Spec` sets controls and the controls are on the console, so this is where
 * the setting half lives — folded, each standard is its name and a conformance
 * reading, in the index sheet's own discipline: closed a row reads, open it is
 * worked. The `Target`s are deliberately *not* here. A target is read off the
 * run, so it is scored on the sheet beside the results (`renderScore`), and
 * the accordion carries one line saying so rather than a second copy of the
 * scoreboard that would have to be kept agreeing with the first.
 */
/*
 * Whether the register starts folded, asked of the stylesheet rather than of a
 * `matchMedia` string here — the arrangement `console.js` uses for `--index`,
 * and the reason is the same: a breakpoint written twice is a bug that exists
 * at exactly one window size.
 *
 * The desk is a column of viewport height with one scroller between two fixed
 * blocks, so a short screen takes its room out of the only part that can give:
 * measured on an iPad in landscape, the eighteen channels had 104px of a 736px
 * desk to scroll 12,000 in, while the register above them held 323. Folded,
 * the head is 135px and the channels get 429.
 *
 * It acts only when the flag *changes*, so a reader who opened the register on
 * a short desk keeps it open through every resize that does not cross the
 * threshold — the fold is the layout's opening position, not a policy about
 * what the reader is allowed to look at.
 */
let registerFolded = null;

function relayoutRegister() {
  const host = document.querySelector('.presets');
  if (!host) return;
  const fold = getComputedStyle(host).getPropertyValue('--fold').trim() === '1';
  if (fold === registerFolded) return;
  registerFolded = fold;
  host.open = !fold;
}

function buildStandards() {
  const host = $('presets');
  host.textContent = '';
  standardCards.clear();

  for (const preset of PRESETS) {
    const card = elem('details', `preset ${preset.kind}`);

    const summary = elem('summary');
    summary.append(elem('span', null, preset.name));
    // The folded line's reading. Conformance, not a selection: it is measured
    // off the controls by `syncStandards` every time the desk moves.
    const chip = elem('span', 'preset-state');
    summary.append(chip);
    card.append(summary);

    const body = elem('div', 'preset-body');
    body.append(
      elem(
        'p',
        'preset-cite',
        preset.kind === 'standard'
          ? `${preset.issuer} · ${preset.source}`
          : 'This sheet’s own arrangement — not a published standard',
      ),
    );
    body.append(elem('p', 'preset-blurb', preset.blurb));

    // What it currently is, against what it asks for. Re-lettered by
    // `syncStandards`; built empty so there is exactly one code path that
    // writes it and no first-draw special case.
    const verdict = elem('p', 'preset-verdict');
    body.append(verdict);

    let clauses = null;
    if (preset.specs.length || preset.engages.length || preset.bypasses.length) {
      const apply = elem('p', 'preset-apply');
      apply.append(linkButton('Apply to the desk', () => applyStandard(preset)));
      body.append(apply);
      const fold = elem('details', 'preset-fold');
      fold.append(elem('summary', null, 'What it sets, and where each number comes from'));
      clauses = elem('table', 'clauses');
      fold.append(clauses);
      body.append(fold);
    }

    if (preset.targets.length) {
      body.append(
        elem(
          'p',
          'presets-note',
          `Its ${preset.targets.length === 1 ? 'target is' : `${preset.targets.length} targets are`} ` +
            'scored on the sheet, under the results they are read from.',
        ),
      );
    }

    if (preset.unjudged.length) {
      const fold = elem('details', 'preset-fold');
      fold.append(
        elem('summary', null, `What this sheet cannot judge (${preset.unjudged.length})`),
      );
      const list = elem('dl', 'unjudged');
      for (const item of preset.unjudged) {
        list.append(elem('dt', null, item.criterion), elem('dd', null, item.why));
      }
      fold.append(list);
      if (preset.caveat) fold.append(elem('p', 'preset-caveat', preset.caveat));
      body.append(fold);
    } else if (preset.caveat) {
      // A parti has nothing unjudged — it makes no claims — but its caveat is
      // the label saying so, and a caveat only shown inside a fold that does
      // not exist is a caveat never shown.
      body.append(elem('p', 'preset-caveat', preset.caveat));
    }

    card.append(body);
    host.append(card);
    standardCards.set(preset.id, { preset, chip, verdict, clauses });
  }
}

const f1c = (v) => v.toFixed(1);

/**
 * Re-letter every standard from the desk, and the scoreboard from the run.
 *
 * Called wherever the desk moves and wherever a run lands, because those are
 * the only two things either half reads. Cheap by construction: the accordions
 * already exist, and only the chip, the verdict sentence, the clause tables
 * and the one score table are written.
 */
function syncStandards() {
  // What the register says when it is folded shut. A folded strip keeps its
  // reading and only its controls go behind the fold; the register is held to
  // the same rule, and the fact worth carrying at that size is the one the
  // chips inside would have given — whether this desk is built to anything.
  const built = [];
  // Kept apart from `built`, and the distinction is FR-017's. Every other
  // preset here is a specification a building can be built to, so "built to
  // Passivhaus Classic" is a claim about the desk and is true or false of it.
  // TM59 is a compliance *procedure*: what its specification sets is the
  // prescribed occupancy and gains of Appendix E, and whether those hold says
  // nothing whatever about whether the dwelling passes — that is assessed room
  // by room against the worst room, over a mandated weather file, in a staged
  // sequence this page cannot execute. "Built to TM59" is therefore a sentence
  // this sheet is not entitled to letter, and a folded one-line register has
  // no room to draw the distinction inside it. So the setup is reported as a
  // setup, in its own clause of the same line.
  const setups = [];
  for (const { preset, chip, verdict, clauses } of standardCards.values()) {
    const c = conformance(params, bypass, preset);
    const method = carriesTm59(preset);
    if (c.built) (method ? setups : built).push(preset.name);
    if (c.built === null) {
      chip.textContent = 'targets only';
      chip.className = 'preset-state';
      verdict.textContent = 'Sets nothing. Everything it has to say is on the scoreboard.';
      verdict.className = 'preset-verdict';
    } else if (c.built && method) {
      chip.textContent = 'setup applied';
      chip.className = 'preset-state met';
      verdict.textContent =
        `The desk holds this method’s prescribed setup — all ${c.clauses.length} clauses hold. ` +
        'What that setup produces is read on the scoreboard, criterion by criterion, and the block ' +
        'under those rows says what the readings do not answer.';
      verdict.className = 'preset-verdict met';
    } else if (c.built) {
      chip.textContent = 'built to it';
      chip.className = 'preset-state met';
      verdict.textContent = `The desk is built to this specification — all ${c.clauses.length} clauses hold.`;
      verdict.className = 'preset-verdict met';
    } else {
      chip.textContent = `${c.adrift.length} of ${c.clauses.length} adrift`;
      chip.className = 'preset-state';
      const first = c.adrift[0];
      verdict.textContent =
        `${c.adrift.length} of ${c.clauses.length} clauses adrift` +
        ` — ${first.label} is ${first.has} where it asks for ${first.wants}` +
        (c.adrift.length > 1 ? `, and ${c.adrift.length - 1} more.` : '.');
      verdict.className = 'preset-verdict';
    }

    if (clauses) {
      clauses.textContent = '';
      clauses.append(tableHead(['Clause', 'Asks for', 'Currently']));
      const body = document.createElement('tbody');
      for (const clause of c.clauses) {
        const tr = body.insertRow();
        if (!clause.met) tr.className = 'adrift';
        const head = tr.insertCell();
        head.append(clause.label);
        if (clause.spec?.why) head.append(elem('i', 'why', clause.spec.why));
        cell(tr, clause.wants, null, 'Asks for');
        // Only when it differs: a column repeating the value beside itself on
        // every row is noise, and the rows that matter are the ones that do not
        // agree.
        cell(tr, clause.met ? '' : clause.has, 'delta', 'Currently');
      }
      clauses.append(body);
    }
  }

  const state = $('presets-state');
  const total = standardCards.size;
  const parts = [];
  if (built.length) {
    parts.push(built.length === 1 ? `built to ${built[0]}` : `built to ${built.length} of ${total}`);
  }
  // Named rather than counted, because there is one of them and a count of one
  // says less than its name does — and because "1 setup applied" would invite
  // exactly the reading the clause exists to avoid.
  for (const name of setups) parts.push(`${name} setup applied`);
  state.textContent = parts.length ? parts.join(' · ') : `${total} standards`;
  state.classList.toggle('met', built.length > 0 || setups.length > 0);

  renderScore();
}

/**
 * A reading at the board's own precision, or whole where the quantity is a
 * count of things.
 *
 * Every other line on this scoreboard is an intensity or a share and reads to
 * one decimal. Criterion b is a count of nights, and `3.0 nights` is a share
 * wearing a count's unit: it invites the reader to wonder what four fifths of
 * a night would be, on a criterion whose whole 2026 revision was the move from
 * counting hours to counting nights. The margin takes the same treatment, or a
 * row reading `3` would be `over by 1.0` beside itself.
 *
 * The precision is the target's own, not a question about which metric this
 * is. Asked of the declaration, a line that counts whole things letters whole
 * things wherever it is drawn — and there are six call sites. `toFixed` rather
 * than a branch between two spellings, so `digits` means what it says: a
 * two-decimal line declared later letters two decimals, where a `digits === 0`
 * test would have sent it to the one-decimal arm and printed a figure short of
 * its declaration with nothing anywhere saying so. `Target` refuses a `digits`
 * `toFixed` cannot take, which is what keeps this total.
 */
const scoreFigure = (target, value) => value.toFixed(target.digits);

/**
 * Whether the criteria were read over the desk as it was drawn.
 *
 * Read off the qualifications the solve assembled rather than off live
 * `params`, which is the difference between describing the run and describing
 * the desk the reader has moved to since. `qualificationsFor` appends the
 * `profiles` entry exactly where the prescribed occupancy and gains reached
 * the document, so its absence is the same fact from the other side and there
 * is one place that fact is decided.
 */
const readAsDrawn = (tm59) => !tm59.qualifications.some((q) => q.id === 'profiles');

/**
 * What one TM59 row has to say about the run it was read from.
 *
 * The declaration half of a criterion is already on the row: `Target.note`
 * carries what the criterion applies to, what it presumes and where its
 * threshold comes from, in the method's own words. What none of that can carry
 * is the run — and three of this feature's requirements are about exactly
 * that.
 *
 * The comfort line moved (FR-006). Criterion a's threshold is recomputed for
 * every day of the period off the outdoor running mean, so there is no single
 * number to letter in the "asks for" column and a reader handed a verdict
 * against a limit they cannot see has been handed an assertion. The row states
 * the range it travelled and its mean over the days covered, and says where a
 * clamp held it still — which matters more on this desk than it would in a UK
 * compliance run, since a station in a cold May spends part of the period flat
 * and an exceedance share responding to nothing would otherwise have no
 * explanation on the page.
 *
 * The period is not the year (FR-010). All four criteria are read over 1 May
 * to 30 September, and 2 % over eleven days of August is not the same reading
 * as 2 % over the whole summer. The coverage is lettered at equal prominence
 * with the share, never inferred from the run strip.
 *
 * And what the reading is *of* (FR-007, FR-016): operative temperature, never
 * air temperature, and the building as drawn wherever the method's prescribed
 * occupancy has not been applied.
 *
 * Nothing here is lettered for a row with no value. An absent reading carries
 * its own sentence in the margin cell, and a paragraph explaining the
 * arithmetic of a figure that is an em dash is furniture.
 *
 * The words themselves are `tm59NotesFor` below; this is the memo in front of
 * it, which is where the rest of this note is about.
 *
 * `renderScore` clears and rebuilds the whole board, and `syncStandards` calls
 * it from `applyGeometry` — so on a desk with a station attached it runs on
 * every pointermove of every drag, while `lastOutcome` stands unchanged until
 * the release solve lands. Rebuilt each time, the five rows concatenate about
 * twenty-two fresh strings and eight kilobytes of text for a set of sentences
 * that cannot have moved: the whole TM59 read is 2.44 ms once per solve, and
 * this was paying a fraction of it again sixty times a second to arrive at the
 * same words.
 *
 * Keyed on the `Reading` object itself, which is frozen and is replaced
 * wholesale at each solve, so identity is exactly the question "is this still
 * the same reading". The same cache-on-identity `offersFor` and `calendarFor`
 * keep against the ESO. Five entries at a time, one per criterion row, and the
 * map is weak so a solve's readings take their prose with them when the next
 * solve replaces them.
 */
/**
 * The one line a criterion row keeps in view above its own reasoning.
 *
 * Five rows carrying three or four paragraphs each is about eight kilobytes of
 * prose under a table of five numbers, and it buried the numbers. So the
 * reasoning folds and this stands over it — the desk's own rule for the index
 * sheet, where a folded strip keeps its reading and only its controls go behind
 * the fold: closed a row reads, open it is worked.
 *
 * What may not fold is decided by the requirements rather than by length. The
 * line the run was judged against is FR-006 and it moved during the run, so a
 * reader cannot check the verdict without it. The coverage is FR-010. That the
 * reading is of operative temperature and not air temperature is FR-007, and it
 * is the difference between two questions rather than a nicety. Those three are
 * here; the derivations, the clamp counts, the hour arithmetic and the two
 * documents' positions on a partial period are one press away.
 *
 * The qualifications that change how a number should be read — that criterion b
 * presumes a bedroom, that the criteria are read over the building as drawn —
 * do not appear here because they do not fold at all: they stay in the row's
 * own notes, outside the disclosure, for the reason the index sheet keeps a
 * blocked channel's note outside its fold.
 */
// A note that says how the reading must be *taken* rather than how it was
// *made*. Matched on its own words rather than by position, because the notes
// are pushed in different orders per criterion and an index would silently
// point at the wrong sentence the next time one is added.
const QUALIFYING_NOTE = /presumes a bedroom|building as drawn|as it is drawn/i;

function tm59Precis(reading) {
  if (!reading || reading.value === null) return null;
  const { criterion, coverage, line } = reading;
  const parts = [];
  if (criterion.id === 'a' && line) {
    parts.push(`judged against ${f1c(line.low)}–${f1c(line.high)} °C`);
  }
  if (coverage) parts.push(`${coverage.days} of ${SEASON.days} days`);
  parts.push('operative temperature');
  return parts.join(' · ');
}

const noteCache = new WeakMap();

function tm59Notes(reading, asDrawn) {
  if (reading) {
    const held = noteCache.get(reading);
    // `asDrawn` is part of the key: it is read off the run rather than off live
    // params, so it moves only when a solve does, but a cache that ignored it
    // would letter "the building as drawn" over a desk that had since been
    // given the method's own profiles.
    if (held && held.asDrawn === asDrawn) return held.notes;
  }
  const notes = tm59NotesFor(reading, asDrawn);
  if (reading) noteCache.set(reading, { asDrawn, notes });
  return notes;
}

function tm59NotesFor(reading, asDrawn) {
  if (!reading || reading.value === null) return [];
  const { criterion, category, coverage, line } = reading;
  const notes = [];

  if (criterion.id === 'a') {
    let moved =
      `Read from the zone’s hourly operative temperature against ${category.label}’s adaptive line, ` +
      `which is recomputed every day off the outdoor running mean. Over the ${line.days} days this ` +
      `run covered it ran from ${f1c(line.low)} °C to ${f1c(line.high)} °C, mean ${f1c(line.mean)} °C.`;
    // Named as the published clamp rather than as "the minimum", because that
    // is what it is: TM59:2026 §2.4.1 stops the line at both ends, and a
    // reader watching a share stop responding to the weather is owed the
    // reason rather than left to find it.
    if (line.clampedLow) {
      moved +=
        ` It stood at its published floor of ${f1c(category.low)} °C on ${line.clampedLow} of them,` +
        ' where the running mean was below 10 °C and the line stops moving.';
    }
    if (line.clampedHigh) {
      moved +=
        ` It stood at its published ceiling of ${f1c(category.high)} °C on ${line.clampedHigh} of` +
        ' them, where the running mean was above 30 °C and the line stops moving.';
    }
    notes.push(moved);
    notes.push(
      `${reading.counted} of the ${reading.over} occupied hours the run held inside the period stood ` +
        'a rounded 1 K or more above it.',
    );
  }

  if (criterion.id === 'b') {
    notes.push(
      'Read from the zone’s hourly operative temperature, as the mean over the nine hours of sleep ' +
        `from 23:00, against a fixed Tn of ${category.nightLimit} °C for ${category.label}. ` +
        `${reading.counted} of the ${reading.over} complete nights the run held exceeded it.`,
    );
    notes.push(
      'The method reads this criterion over bedrooms alone, and nothing on this desk declares what ' +
        'its one room is, so the reading presumes a bedroom.',
    );
    // Only where the run holds the whole period and still not that night.
    // Below 153 days the coverage sentence has already said the period was not
    // covered, and naming one missing night inside a missing September would
    // be the smaller fact standing in front of the larger one.
    if (coverage.whole && !coverage.tail) {
      notes.push(
        'The period’s last night runs from 23:00 on 30 September to 08:00 on 1 October and this run ' +
          'stops at midnight, so that night is counted in neither term.',
      );
    }
  }

  if (criterion.id === 'c') {
    notes.push(
      `Read from the zone’s hourly operative temperature against a fixed ${criterion.threshold} °C, ` +
        'the same line for both categories and with no rounding — the rounding rule is criterion a’s ' +
        `provision for ∆T against a moving line. ${reading.counted} of the ${reading.over} occupied ` +
        'hours the run held inside the period stood above it.',
    );
  }

  notes.push(
    coverage.whole
      ? `Read over the whole assessment period: ${coverage.of} days from 1 May to 30 September ` +
        `(${coverage.months}).`
      : `Read over ${coverage.days} of the ${coverage.of} days of 1 May to 30 September ` +
        `(${coverage.months}), which is what this run covered.`,
  );

  // Both documents' positions, stated and not resolved (FR-011). Criterion a
  // only, because the provision is TM52 criterion 1's own and TM59 borrows
  // criterion 1 and nothing else from TM52 — extending it to criteria the
  // older document never wrote would be this sheet legislating.
  if (!coverage.whole && criterion.id === 'a') {
    notes.push(
      `${PARTIAL_PERIOD.permits} ${PARTIAL_PERIOD.written} The share above is taken over the hours ` +
        'this run held, with its coverage beside it; which of the two positions governs is not this ' +
        'sheet’s to settle.',
    );
  }

  if (asDrawn) {
    notes.push(
      'The occupied hours are the desk’s own occupancy schedule rather than the method’s prescribed ' +
        'profile, so this is read over the building as drawn.',
    );
  }

  return notes;
}

/**
 * A full-width row of prose inside the board, under the rows it is about.
 *
 * The same arrangement `tr.score-head` already uses for a standard's name: a
 * spanning cell, because the board is five published documents end to end and
 * a block after the table would sit under whichever one happens to be last,
 * which is not the one the sentence is about.
 */
function scoreProse(body) {
  const tr = body.insertRow();
  tr.className = 'score-prose';
  const td = tr.insertCell();
  td.colSpan = 5;
  return td;
}

/**
 * How many of the criteria in scope cleared. One row, and never a verdict.
 *
 * FR-017 forbids any pass or fail word attaching to TM59's name, and FR-017a
 * permits exactly this: a plain count naming both numbers, with the criteria
 * the run could not answer reported as unread rather than folded into either
 * of them. So the row says how many were read and how many of *those* cleared,
 * names its scope in full, and says what is standing outside it — because "2
 * cleared" over a method that states four criteria is a true sentence a reader
 * would finish reading as a compliance result.
 *
 * It carries no marker, no rule, no figure face and no colour. Every one of
 * those would make it the board's total, and a row that looks like a total is
 * read as one whatever the words in it say.
 */
function tm59CountRow(body, count) {
  const host = scoreProse(body);
  const p = elem('p', 'score-count');
  const n = (value) => elem('b', null, String(value));

  if (count.read === 0) {
    p.append(`None of the criteria in scope — ${count.scope} — could be read from this run.`);
  } else {
    // "2 cleared", not "2 cleared their limits" and not "2 of 2". The bare
    // verb is the only form that stays a sentence at every reading: a
    // possessive has to agree with a number that may be nought, and anything
    // of the shape "n of m" is the proportion FR-017a forbids wearing a
    // count's clothes. Each row already letters the limit it was read against.
    p.append(
      'Of the ',
      n(count.read),
      count.read === 1 ? ' criterion read over ' : ' criteria read over ',
      count.scope,
      ', ',
      n(count.cleared),
      ' cleared.',
    );
  }

  // Named one by one rather than counted. A criterion the run could not answer
  // is not one that failed and is not one that passed, and the only useful
  // thing to say about it is which one it is and what would fix it.
  for (const reading of count.unread) {
    const label = reading.category
      ? `${reading.criterion.label} · ${reading.category.label}`
      : reading.criterion.label;
    p.append(` ${label} could not be read: ${reading.absence}.`);
  }

  p.append(
    ' Criterion c is read separately and stands outside this count, because which of it and ' +
      'criterion a governs turns on how much of the occupied period the openings are held shut, ' +
      'which is a fact about a window model this desk does not carry. Criterion d is not read at ' +
      'all: this model holds no communal circulation for it to be read over, and the register’s ' +
      'list of what this sheet cannot judge says so in full.',
  );
  p.append(
    ' This is a count of lines, not a result against the method. TM59 is assessed room by room and ' +
      'the dwelling is governed by its worst room; this model is one zone, so there is no worst ' +
      'room to find.',
  );

  host.append(p);
}

/**
 * Why these figures are not a TM59 assessment, printed under them.
 *
 * The deliverable rather than a disclaimer, and it is in place and never on
 * hover: `pointer: coarse` has no hover at all, so a caveat that floats does
 * not exist on the phone where this sheet is most often read and least often
 * checked against the method it names.
 *
 * One entry per `Qualification`, `says` over `because`, so that a reader can
 * count the reasons rather than skim a paragraph — SC-005 asks that four
 * specific ones be statable from what is printed, and `tm59.js` asserts at
 * load that at least four standing ones are declared. Two tracks on a wide
 * sheet and one below 620 px, where the `because` stands under the `says` and
 * letters the head the adjacency was giving it. That head is set here, where
 * the cell is built, so the word beside a paragraph and the relation the
 * layout was drawing are one string.
 */
function tm59QualificationRow(body, qualifications) {
  const host = scoreProse(body);
  host.append(
    elem(
      'p',
      'score-count',
      'What these readings do not answer. TM59 is a compliance procedure with a modelling strategy, ' +
        'a prescribed occupancy, a mandated weather file and a staged sequence behind it; what is ' +
        'lettered above is the arithmetic of some of its criteria, which is a smaller thing. Each ' +
        'line below is one specific gap, with what it is measured or read from beside it.',
    ),
  );
  const list = elem('dl', 'qualifications');
  for (const q of qualifications) {
    list.append(elem('dt', null, q.says));
    const because = elem('dd', null, q.because);
    because.dataset.head = 'Because';
    list.append(because);
  }
  host.append(list);
}

/**
 * The sheet half of the split: every standard's targets on one scoreboard,
 * under the results they are read from.
 *
 * All of them at once, not the applied one's — there is no "applied one",
 * nothing is remembered — because the game the board affords is exactly that:
 * one run, every line it would clear or miss, Passivhaus's fifteen and
 * EnerPHit's twenty-five and LETI's fifty-five read off the same year. The
 * margin column is where the design gets pushed.
 */
function renderScore() {
  const table = $('score');
  table.textContent = '';
  table.append(tableHead(['Criterion', 'Asks for', 'Reads', 'Margin', '']));
  const body = document.createElement('tbody');
  for (const preset of PRESETS) {
    if (!preset.targets.length) continue;
    // The standard's name as a subhead row rather than repeated per line, the
    // way a drawing schedule sections its rows.
    const head = body.insertRow();
    head.className = 'score-head';
    const th = head.insertCell();
    th.colSpan = 5;
    // The name and its marker ride on an inner row rather than on the cell
    // itself: a `display: flex` table cell stops being a table cell, and the
    // colSpan that makes this a full-width subhead is quietly ignored.
    const bar = elem('div', 'score-bar');
    bar.append(elem('span', 'score-name', preset.name));
    th.append(bar);
    // The same armed square the run ledger, the auto-solve toggle and the
    // console's patch buttons use, meaning the same thing a fourth time: this
    // step is armed. Chasing is exactly the bill's pin in another column —
    // one chosen thing held up to be watched — so it is the same control.
    const chase = elem('button', 'pin pin-sm');
    chase.type = 'button';
    chase.setAttribute('aria-pressed', String(chased === preset.id));
    // Five of these markers stand on one board, and the word on each is the
    // same. Read aloud, "Chase" five times over names the standard for none of
    // them, so the accessible name carries the standard and what pressing it
    // does; `title` gives a pointer the same sentence on hover. Neither is
    // where the explanation actually lives — the lede above the board prints
    // it, because a hint that only exists on hover is no hint on a phone.
    // Both halves of the sentence flip together. Keeping the tail fixed read
    // "Stop chasing …: hold its worst line up beside the drawing", which
    // describes the state being left rather than the one the press reaches.
    const says =
      chased === preset.id
        ? `Stop chasing ${preset.name}: take its line down from beside the drawing`
        : `Chase ${preset.name}: hold its worst line up beside the drawing`;
    chase.setAttribute('aria-label', says);
    chase.title = says;
    chase.append(elem('i', 'mark'), elem('span', null, chased === preset.id ? 'Chasing' : 'Chase'));
    chase.addEventListener('click', () => {
      chased = chased === preset.id ? null : preset.id;
      // A fresh chase has no gesture behind it, so it starts without a ghost
      // rather than inheriting the one the last chased standard left.
      chaseGhost = gesture ? chaseNow() : null;
      renderScore();
      renderChase();
      // Chasing TM59 is what decides whether a study reads criterion a, so the
      // curves already up are now of the wrong quantity. They are re-swept the
      // way any other change to the reading re-sweeps them rather than left to
      // disagree with the offer that produced them.
      refreshStudies();
    });
    bar.append(chase);
    // Whether this standard's lines are read by `tm59.js`, asked of the
    // declaration rather than of the preset's id: the block of prose below the
    // rows belongs to whichever standard carries those metrics, and a name
    // matched here is a second place for it to be spelled.
    const criteria = carriesTm59(preset) ? (lastOutcome?.tm59 ?? null) : null;
    const asDrawn = criteria ? readAsDrawn(criteria) : false;
    for (const target of preset.targets) {
      const tr = body.insertRow();
      const label = tr.insertCell();
      label.append(target.label);
      if (target.note) label.append(elem('i', 'why', target.note));
      // What the run added to what the declaration already said: the line the
      // reading was judged against, the days it covered, and what it is a
      // reading of. One block per statement rather than one paragraph, because
      // they are separate claims a reader may want to check one at a time.
      if (criteria) {
        const reading = tm59Reading(target);
        const notes = tm59Notes(reading, asDrawn);
        const precis = tm59Precis(reading);
        // The two sentences that qualify the reading rather than derive it stay
        // outside the fold, because a reader who never opens it must still not
        // take a bedroom criterion for a statement about the room they drew.
        const qualifying = notes.filter((n) => QUALIFYING_NOTE.test(n));
        const deriving = notes.filter((n) => !QUALIFYING_NOTE.test(n));
        if (precis && deriving.length) {
          const fold = elem('details', 'why-fold');
          const head = elem('summary', null, precis);
          fold.append(head);
          for (const note of deriving) fold.append(elem('i', 'why', note));
          label.append(fold);
        } else {
          for (const note of deriving) label.append(elem('i', 'why', note));
        }
        for (const note of qualifying) label.append(elem('i', 'why', note));
      }
      cell(tr, target.limit == null ? target.asks : `≤ ${target.limit}`, 'asks', 'Asks for');
      const value = targetReading(target);
      // The unit rides on the folded label, because the unit column itself is
      // dropped at that width: `46.6` on a line of its own says nothing.
      const read = cell(
        tr,
        value == null ? '—' : scoreFigure(target, value),
        null,
        `Reads, ${target.unit}`,
      );
      if (value == null) read.className = 'void';
      const margin = tr.insertCell();
      margin.className = 'delta';
      margin.dataset.label = 'Margin';
      if (value == null) {
        margin.textContent = targetAbsence(target);
        margin.classList.add('absent');
      } else if (target.limit != null) {
        const over = value - target.limit;
        // One small redline mark on the divergence, and nothing at all on the
        // rows that clear — the accent marks "look here", it does not grade.
        margin.textContent =
          over > 0
            ? `over by ${scoreFigure(target, over)}`
            : `under by ${scoreFigure(target, -over)}`;
        if (over > 0) margin.classList.add('over');
      }
      const unit = tr.insertCell();
      unit.className = 'unit';
      unit.textContent = target.unit;
    }
    // Under the rows they are about, and only where there is a run behind
    // them. `clearReadings` puts `lastOutcome` back to null on every exit where
    // the readings stop being true, so a fatal takes the count and the
    // qualifications down with the figures they qualify rather than leaving
    // them standing over a board of em dashes.
    if (criteria) {
      tm59CountRow(body, criteria.count);
      tm59QualificationRow(body, criteria.qualifications);
    }
  }
  table.append(body);
  // The register folds to a block per row at 780px — the desk's own
  // threshold, not the 620 the two schedules fold at, since five columns
  // with four of them figures run out of width sooner than a schedule
  // does. It needs the schedules' repair either way: `display: block` on a `tr`
  // drops the implicit row and cell roles, and a scoreboard read aloud without
  // them is a list of loose numbers with no criterion attached to any of them.
  keepTableSemantics(table);
  scoreNote();
  // The board and the chased line are two drawings of one set of readings, so
  // they are lettered in one pass and cannot come to disagree about a margin.
  renderChase();
}

/**
 * The two blockages the board can offer a press for, in `targetBlock`'s own
 * precedence order.
 */
const OFFERS = [
  {
    key: 'system',
    verb: { every: 'asks', some: 'ask' },
    because:
      'about a conditioned building, and this zone is free-running — there is no demand to meter and no load to size.',
    label: 'Patch System in',
    then: 'Patching it in fills the lines a run of this kind can answer.',
    // The shelf is asking a different question of the same fact — not "why is
    // this criterion blank" but "what would a scheme kept from here hold" —
    // so it gets its own sentence, the way an environment's `noun` is kept
    // apart from its `label`.
    shelf: (blank) =>
      `${listOf(blank)} blank while this zone is free-running — nothing to meter and no load to size — so a scheme kept from here would keep the gap.`,
    press() {
      patchChannel('system', false);
      // The board's note is a question about the desk — what is standing in
      // the way — so it answers the press at once. The shelf's is a question
      // about the run: which columns actually came back empty. Re-lettered
      // here it would read the *old* run under the *new* block and call peak
      // heat, cost and carbon "year figures" when they are merely not solved
      // yet, so it waits for the solve that this press just started and stays
      // in agreement with the table beside it.
      renderScore();
    },
  },
  {
    key: 'year',
    // Worded so the number agrees either way: "Every one of these 9 lines
    // needs" and "7 of these 9 lines need" are both sentences.
    verb: { every: 'needs', some: 'need' },
    because: 'a full year behind them, and this run is design days.',
    label: 'Choose a weather location',
    then: 'The picker is at the head of the sheet.',
    shelf: (blank) =>
      `${listOf(blank)} year figures and this run is design days, so a scheme kept from here would keep the gap.`,
    press() {
      // The picker is a panel at the top of the page, so the reader is taken
      // to it rather than having it opened out of sight behind them.
      const field = $('site-field');
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.click();
    },
  },
];

/**
 * Why the board is mostly em dashes, when it is, and the one press that ends
 * it.
 *
 * Almost every criterion here asks about a conditioned building — a demand to
 * meter, a load to size — and the desk ships free-running, so a first reader
 * meets a board of em dashes with the same grey sentence beside every one of
 * them. `targetAbsence` has always named the fix; what was missing was any way
 * to take it from where it is read. The console is a panel away and eighteen
 * strips down, and a reader who does not already know that System is a channel
 * has nowhere to go with the instruction.
 *
 * One control rather than one per row: patching a channel is a fact about the
 * whole run, not about a standard or a criterion, and fifteen buttons doing
 * the same thing would be fifteen chances to think they do different things.
 *
 * The count is taken rather than asserted. "Most of this board" would be a
 * claim the sheet does not check, and it would be wrong on the desks where it
 * matters least: the overheating lines read perfectly well free-running, which
 * is exactly the criterion Passivhaus means them to answer.
 */
function offerNote(host, key, sentence) {
  host.textContent = '';
  const offer = key ? OFFERS.find((o) => o.key === key) : null;
  host.hidden = !offer;
  if (!offer) return;
  host.append(elem('span', null, sentence(offer)));
  // The same chip the Chase marker in the band below is, and the same one
  // every patch marker on the console is. Its square is left hollow and
  // carries no `aria-pressed`: this is an act, not a toggle — the note retires
  // once it has been taken — and hollow is the true reading of a channel that
  // is out of the path, or of a run with no weather file behind it.
  const act = elem('button', 'pin pin-sm');
  act.type = 'button';
  act.append(elem('i', 'mark'), elem('span', null, offer.label));
  act.addEventListener('click', offer.press);
  host.append(act);
}

function scoreNote() {
  const targets = PRESETS.flatMap((preset) => preset.targets);
  const blocked = targets.filter((target) => targetReading(target) == null).map(targetBlock);
  // Taken in the order `runBlock` resolves them, so the board offers the thing
  // standing in front of everything else rather than the second thing. Only
  // the two in `OFFERS` are offered: a partial calendar is fixed on the Run
  // strip's twelve-month mask, which is a gesture and not a press, and there
  // is no honest one-button version of it.
  const offer = OFFERS.find((o) => blocked.some((b) => b.key === o.key));
  offerNote($('score-note'), offer?.key, (o) => {
    const n = blocked.filter((b) => b.key === o.key).length;
    // "9 of these 9" is a fraction pretending to be one, and on the desk as it
    // ships every line is blank — which is the case a first reader meets.
    const count =
      n === targets.length
        ? `Every one of these ${n} lines ${o.verb.every}`
        : `${n} of these ${targets.length} lines ${o.verb.some}`;
    return `${count} ${o.because} ${o.then}`;
  });
}

/**
 * The same offer on the shelf, about a different thing.
 *
 * Four of the five columns here are year figures and the fifth needs a system
 * — `SHELF_COLUMNS` says so of the peak load in its own comment — so on the
 * desk as it ships every column a saved scheme could carry is blank. The
 * board's note would be the wrong sentence to reuse: it is about criteria,
 * this is about what a save from here would hold.
 *
 * And it is deliberately about the *live* desk, never about the rows. A kept
 * scheme's figures are stored at the moment it was kept, so no press on this
 * page can fill a row that was saved off a free-running run — offering one
 * would be the interface claiming a power it does not have.
 */
function shelfOffer() {
  // Which columns are blank is measured off the live desk, never asserted. The
  // first draft of this sentence said a design-day scheme would carry "its
  // peak load and nothing else", and the row beside it was reading a cost of
  // 6 USD and 36 kgCO₂e at the time: the bill totals whatever was run, and it
  // is only the two per-year intensities that need twelve months. Naming the
  // columns that are actually empty costs one filter and cannot go stale when
  // a column is added.
  const here = measureNow();
  const blank = SHELF_COLUMNS.filter((column) => !Number.isFinite(here[column.field]));
  offerNote($('shelf-offer'), blank.length ? runBlock('year') : null, (o) => o.shelf(blank));
}

/**
 * The blank columns as the subject of a sentence, with the verb that agrees
 * with however many of them there turn out to be.
 */
function listOf(columns) {
  const names = columns.map((column, i) => (i ? column.label.toLowerCase() : column.label));
  const list =
    names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list} ${names.length < 2 ? 'is' : 'are'}`;
}


/* ── chasing one standard ─────────────────────────────────────────────── */

/** The chased standard's worst line right now, or null if none is chased. */
function chaseNow() {
  const preset = chased ? PRESET_BY_ID[chased] : null;
  return preset ? chaseVerdict(preset, targetReading) : null;
}

/** A figure in the finding line's own type, redlined when it is the divergence. */
const mark = (text, hot = false) =>
  Object.assign(document.createElement('span'), {
    className: hot ? 'q hot' : 'q',
    textContent: text,
  });

/**
 * The chased standard, lettered up beside the drawing.
 *
 * The scoreboard is where a run is read; this is where a *gesture* is read. It
 * carries one line and one number — the worst of the standard's criteria, as a
 * ratio, so a dozen rows a screen away collapse into the single question
 * "is what my hand is doing right now helping" — with a ghost of where that
 * number stood when the gesture began.
 *
 * It says how many of the standard's lines it is speaking for, always. A
 * verdict drawn from the two criteria a design day can answer must not be
 * mistaken for a verdict on a standard that states four.
 */
function renderChase() {
  const host = $('chase');
  const preset = chased ? PRESET_BY_ID[chased] : null;
  host.hidden = !preset;
  host.textContent = '';
  if (!preset) return;

  host.append(mark(preset.name), ' — ');
  const now = chaseNow();

  if (!now) {
    // Absence with a reason, never a bare em dash: every one of these has
    // something the reader can go and do about it.
    const first = preset.targets.find((t) => t.limit != null) ?? preset.targets[0];
    // A colon rather than a full stop: the absence reasons are fragments that
    // open lowercase ("patch System in — …"), because the scoreboard sets them
    // in a margin cell where a capital would look like a heading.
    host.append(`no line of it reads yet: ${targetAbsence(first)}.`);
    return;
  }

  // The label is set exactly as declared, never case-folded to fit a sentence:
  // lowercasing turns "Hours above 25 °C" into "25 °c", which is the bill pin's
  // tracked-capitals bug in another costume — a unit is not prose and does not
  // take the sentence's case. So the sentence is built around the label rather
  // than the label bent to fit the sentence.
  // `scoreFigure` rather than `f1c`, so a night count reads as one here too.
  // The board and this line are two drawings of one reading, and a criterion
  // lettered `3` in the table and `3.0` beside the drawing would be the sheet
  // disagreeing with itself about what kind of quantity it had measured.
  const against = `reads ${scoreFigure(now.target, now.value)} against ${now.target.limit}`;
  const tally =
    now.read === 1
      ? now.clears
        ? ' Its one readable line clears.'
        : ''
      : ` ${now.clears} of its ${now.read} readable lines clear.`;

  if (now.over > 0) {
    host.append(
      mark(now.target.label),
      ` ${against}, over by `,
      mark(scoreFigure(now.target, now.over), true),
      ` ${now.target.unit}.`,
      tally,
    );
  } else {
    host.append(
      'every readable line clears. The closest, ',
      mark(now.target.label),
      `, ${against} — under by `,
      mark(scoreFigure(now.target, -now.over)),
      ` ${now.target.unit}.`,
    );
  }

  // What the verdict is not speaking for. The scoreboard says this row by row;
  // up here, where it is compressed to one sentence, the count has to carry it.
  if (now.read < now.stated) {
    host.append(elem('i', 'chase-part', ` ${now.stated - now.read} of its lines cannot be read on this run.`));
  }

  // And the one standard on the register whose name a verdict may not attach
  // to at all (FR-017). Every other preset here is a specification: "every
  // readable line clears" is a true and complete statement about Passivhaus's
  // published criteria. TM59 is a compliance procedure assessed room by room
  // against the worst room, and the same sentence beside its name reads as the
  // dwelling having passed it — which is exactly the reading the whole
  // qualifications block downstairs exists to prevent, and which would be
  // undone by one line of type up beside the drawing. So the chase line says
  // what it is a count of, unconditionally rather than only where a line is
  // missing: the reader who is watching this while dragging a slider is
  // precisely the reader who never scrolls down to the board.
  if (carriesTm59(preset)) {
    host.append(
      elem(
        'i',
        'chase-part',
        ' A count of lines, not a result against the method: criterion d is not read here at all, ' +
          'and the block under the scoreboard says what else these readings do not answer.',
      ),
    );
  }

  // The ghost: where this stood when the hand went down. Compared at display
  // precision, so a change too small to move the printed figure says nothing —
  // and at each side's *own* display precision, since the two may be different
  // lines of different standards and a night count does not print like a share.
  if (
    chaseGhost &&
    scoreFigure(chaseGhost.target, chaseGhost.over) !== scoreFigure(now.target, now.over)
  ) {
    const figure = (margin) => scoreFigure(chaseGhost.target, margin);
    const was = chaseGhost.over > 0 ? `over by ${figure(chaseGhost.over)}` : `under by ${figure(-chaseGhost.over)}`;
    const same = chaseGhost.target.id === now.target.id;
    host.append(
      elem('i', 'chase-ghost', same ? ` was ${was}` : ` was ${chaseGhost.target.label.toLowerCase()}, ${was}`),
    );
  }
}

/*
 * Four columns, and the currency is printed rather than symbolised.
 *
 * A kept scheme stores the currency's *code*, not the `Currency` that knows
 * how to letter it, because nothing with an identity survives a trip through
 * the browser's storage. That turns out to be the right presentation anyway:
 * two schemes kept in two countries sit in one table, and `$4,200` against
 * `$5,100` would look like a comparison when one of them is Canadian.
 */
const SHELF_COLUMNS = Object.freeze([
  { label: 'Energy', field: 'eui', unit: 'kWh/m²·yr', fmt: (v) => v.toFixed(1) },
  { label: 'Heating', field: 'tedi', unit: 'kWh/m²·yr', fmt: (v) => v.toFixed(1) },
  // The load beside the energy, because what a scheme costs to run and what it
  // costs to install are two different arguments and a shelf that carried only
  // the first would keep settling the second by accident. It is also the one
  // column here a design-day run can fill.
  { label: 'Peak heat', field: 'peakHeat', unit: 'W/m²', fmt: (v) => v.toFixed(1) },
  { label: 'Cost', field: 'cost', unit: '', fmt: (v, m) => `${group(v, 0)} ${m.currency ?? ''}`.trim() },
  { label: 'Carbon', field: 'carbon', unit: 'kgCO₂e', fmt: (v) => group(v, 0) },
]);

function renderShelf() {
  const note = $('shelf-note');
  note.textContent = shelfNote ?? '';
  note.hidden = !shelfNote;

  shelfOffer();

  const table = $('shelf-table');
  table.textContent = '';
  $('shelf-count').textContent = shelfNote
    ? ''
    : `${kept.length} of ${SHELF_LIMIT} kept`;

  if (!kept.length) {
    table.hidden = true;
    $('shelf-empty').hidden = Boolean(shelfNote);
    return;
  }
  table.hidden = false;
  $('shelf-empty').hidden = true;

  const here = measureNow();

  // The head sits over the figure it names, not over the pair.
  //
  // Every measured column carries a delta cell beside it, and heading both
  // with one `th` was the arrangement the results schedule makes. It does not
  // carry here. These heads are right-aligned, so a `th` spanning two columns
  // letters its word against the *delta's* right edge — and the schedule only
  // spans when it has a baseline, which is exactly when both halves carry
  // figures. The shelf differences strictly (same kind of run, same currency,
  // same end uses), so its delta column is empty on most rows and the head was
  // standing over blank paper about 60px to the right of its own number.
  table.append(tableHead(['Scheme', ...SHELF_COLUMNS.flatMap((c) => [c.label, '']), '']));

  const body = document.createElement('tbody');
  for (const scheme of kept) {
    const tr = body.insertRow();
    const head = tr.insertCell();

    // The name is an input rather than text, because a scheme is named after
    // it is kept, not before: saving is one press in the middle of working,
    // and being asked to think of a name at that moment is the friction that
    // stops anybody keeping anything.
    const name = document.createElement('input');
    Object.assign(name, { type: 'text', className: 'scheme-name', value: scheme.name });
    name.setAttribute('aria-label', `Name of ${scheme.name}`);
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (!next || next === scheme.name) {
        name.value = scheme.name;
        return;
      }
      try {
        kept = shelf.rename(scheme.id, next);
      } catch (error) {
        statusEl.className = 'status bad';
        statusEl.textContent = `That rename could not be kept: ${error.message}.`;
      }
      renderShelf();
    });
    head.append(name);

    const sub = elem('i', 'scheme-sub');
    const when = new Date(scheme.savedAt);
    sub.textContent = [
      scheme.label,
      scheme.station,
      scheme.measure.solved
        ? `${scheme.measure.annual ? 'annual' : 'design day'} · ${scheme.measure.hours.toLocaleString('en-US')} h`
        : 'never solved',
      Number.isFinite(when.getTime()) ? when.toLocaleDateString('en-CA') : null,
    ]
      .filter(Boolean)
      .join(' · ');
    head.append(sub);

    // Differenced only against a run of the same kind, in the same currency,
    // over the same end uses. Same refusal the bill makes: a saving that is
    // really an absence is worse than no column at all.
    const like = scheme.measure.comparableWith(here);
    for (const column of SHELF_COLUMNS) {
      const value = scheme.measure[column.field];
      const td = tr.insertCell();
      td.textContent = Number.isFinite(value) ? column.fmt(value, scheme.measure) : '—';
      td.dataset.label = column.unit ? `${column.label}, ${column.unit}` : column.label;
      if (!Number.isFinite(value)) td.className = 'void';
      const d = tr.insertCell();
      d.className = 'delta';
      d.dataset.label = `Δ ${column.label.toLowerCase()}`;
      const mine = here[column.field];
      // Formatted on both sides before differencing, the same rule the
      // schedule and the bill follow: a change too small to move the printed
      // figure is not a reading, and `+0` on every row buries the ones that moved.
      if (
        like &&
        Number.isFinite(value) &&
        Number.isFinite(mine) &&
        column.fmt(value, scheme.measure) !== column.fmt(mine, here)
      ) {
        const diff = mine - value;
        d.textContent = `${diff > 0 ? '+' : '−'}${column.fmt(Math.abs(diff), here)}`;
        d.title = `the sheet, against ${scheme.name}`;
      }
    }

    const actions = tr.insertCell();
    actions.className = 'scheme-actions';
    actions.append(
      linkButton('Restore', () => restoreScheme(scheme)),
      linkButton('Delete', () => forgetScheme(scheme)),
    );
  }
  table.append(body);
  keepTableSemantics(table);

  const foot = $('shelf-foot');
  foot.textContent = '';
  foot.append(
    document.createTextNode(
      here.solved
        ? 'Δ reads the sheet against the kept scheme, and appears only where the two are ' +
          'like for like — the same kind of run, the same currency, the same end uses.'
        : 'Nothing is solved, so there is nothing to difference the kept schemes against yet.',
    ),
  );
}

function renderRegister() {
  syncStandards();
  renderShelf();
}

$('save-scheme').addEventListener('click', saveScheme);

readShelf();
buildStandards();
renderRegister();
relayoutRegister();
window.addEventListener('resize', relayoutRegister);

/* ══ the run ═════════════════════════════════════════════════════════════ */

/*
 * The sheet's own revision, lettered into the title block once at boot.
 *
 * Everything else in that block describes the run; this one cell describes the
 * drawing, which is what a revision cell is for. It reads `E-01 · Rev 0.2.0` on
 * a tagged release and `E-01 · Rev 0.2.0+cd5881e` on a build published from
 * main without one, and the version clicks through to the release or the commit
 * it names — a reader who wants to say "this number looks wrong" can now say
 * which sheet the number was on.
 *
 * The date is the revision's, not the reader's. It used to be `new Date()`
 * evaluated in the browser, which lettered "Issued" with the day the page was
 * opened: a drawing dated by whoever picked it up. A build that could not read
 * its own revision has no date to state and prints the em dash the rest of the
 * sheet uses for a missing measurement.
 */
$('t-rev').textContent = 'E-01 · Rev ';
{
  const href = revisionHref();
  const stamp = document.createElement(href ? 'a' : 'span');
  stamp.textContent = REVISION.version ?? '—';
  if (href) {
    stamp.href = href;
    stamp.target = '_blank';
    stamp.rel = 'noreferrer';
    stamp.title = REVISION.tag
      ? `Released as ${REVISION.tag}`
      : `Built from commit ${REVISION.commit}`;
  }
  $('t-rev').append(stamp);
}
$('t-date').textContent = `Issued ${REVISION.date ?? '—'}`;

// The revisions block is CHANGELOG.md itself, mounted once at boot the same
// way the title block's own revision cell is lettered once above — the file
// does not change under a running page, so there is nothing here to redraw.
mountChangelog($('changelog-body'), CHANGELOG_SOURCE);

// Start the ~28 MB WASM download immediately; the schema bundle is small and
// arrives first, which is what lets the sheet draw itself before the engine is
// ready. Both are loaded once and reused across runs.
// Progress narration is for a run you are waiting on. An auto-solve is over
// before the ledger finishes animating into it, and rewriting the status line
// five times a second would make the one number worth reading — the wall clock
// — impossible to read at all.
let quiet = false;

const enginePromise = createEnergyPlus({
  // `BASE_URL` rather than a leading slash: a PR preview is built with
  // `--base=/<pr>/` and served from that subdirectory, and an absolute path
  // would have it download the published site's engine. See `weather.js`.
  assetBaseUrl: `${import.meta.env.BASE_URL}energyplus`,
  onConsole: log,
  onProgress: ({ phase, message }) => {
    if (quiet) return;
    setPhase(phase);
    statusEl.textContent = message;
  },
});

// `predev`/`prebuild` stage the bundle into `public/schemas/`; `httpSource`
// resolves the path against the document and inflates the `.gz` files, or not,
// depending on what the host has already done to them.
const schema = await new SchemaBundle(httpSource(`${import.meta.env.BASE_URL}schemas/`)).load(
  ENERGYPLUS_VERSION,
);
const model = buildModel(schema);

// Everything the drawing asserts is now read back off the model, so the sheet
// cannot describe a building the engine did not simulate.
DATUMS = designDayDatums(model);

// The address bar may be carrying a scheme. It is read here, before the
// sliders are built and the sheet first drawn, so a linked desk appears as
// itself rather than snapping over from the defaults — but a failure is only
// noted: the engine section below still writes the status line, so the
// refusal is delivered once boot has finished saying things, where it can
// stand and be read.
let linked = null;
let linkError = null;
if (location.hash.length > 1) {
  try {
    linked = decodeState(location.hash.slice(1));
    Object.assign(params, linked.params);
    Object.assign(bypass, linked.bypass);
    studyQuantity = linked.quantity ?? null;
    // The pinned hour is taken here rather than after the first solve, because
    // it has to be in force *for* that solve: honoured afterwards, the desk
    // would letter its own worst hour first and jump to the link's, which is
    // the flicker a link exists to avoid.
    pinnedHour = linked.pin;
    desk?.sync();
  } catch (error) {
    linkError = error;
  }
}
// The fragment has been read; gestures may letter the address bar from here.
booted = true;

buildSliders();
// The desk starts closed. The static markup already is the closed state --
// no `desk-open` on the body, the button reading "Every control on the desk"
// with `aria-expanded="false"` -- so arrival needs no call at all, and the
// sheet keeps its full width until the reader asks for the controls.
applyGeometry(); // also sets SURFACES and draws the axonometric
const facts = modelFacts(model);
$('t-project').textContent = facts.project;
$('t-site').textContent = facts.site;
$('t-timestep').textContent = facts.timestep;
$('t-engine-version').textContent = `EnergyPlus ${facts.version}`;

renderTrace();
renderSchedule(null);
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderTrace, 80);
}).observe($('trace'));

const ep = await enginePromise;

engineReady = true;
runBtn.disabled = false;
runBtn.textContent = 'Run simulation';
syncAuto();
syncSweepGate();
statusEl.textContent =
  'Engine compiled and resident. Nothing further is downloaded until you pick a weather station.';

/**
 * Solve the shape the sliders are showing right now.
 *
 * Only ever called from the pump below, which is what keeps it honest: the
 * engine serialises runs and rejects a second call while one is in flight, so
 * there is exactly one caller and it waits.
 */
async function solve() {
  // Read the shape and write the IDF in the same breath. `params` and `model`
  // both keep moving under a drag, and a result filed against the wrong shape
  // would leave the pump chasing a target it had already hit.
  const shape = shapeKey(params);
  const snapshot = { ...params };
  // The patch state this shape is being solved under, captured in the same
  // breath and for the same reason. `patching()` rather than `bypass`, because
  // that is what reaches the IDF: under solo the desk sends five channels out
  // that the patch bay has in, and a qualification about the run has to
  // describe the run.
  const patched = { ...patching() };
  // The rest of the run's identity, captured in the same breath as the shape.
  // `idf` below is held for the same reason, but these were once read live
  // after the await — and a station picked or a channel patched during a
  // 0.7 s annual run had the bundle pairing one city's IDF with another's
  // EPW, manifest and permalink.
  const capture = {
    epw: epwText ?? null,
    annual: Boolean(epwText),
    // Which months the weather run covers, off the snapshot that is being
    // solved. The manifest states the run in one line, and "Annual" over 4,344
    // hours is the drift the whole capture-before-the-await exists to prevent.
    // Named for the mask it holds, not for the months, because `lastRun.months`
    // beside it is a count — the bill divides by it and the manifest spells it
    // out, and one name over two shapes is a trap for whoever edits next.
    monthMask: epwText ? snapshot.months : null,
    weatherStem:
      epwText && station?.url ? station.url.split('/').pop().replace(/\.zip$/i, '') : null,
    location: $('t-location').textContent,
    permalink: schemeUrl(snapshot),
  };
  // The building this run is of, read here rather than after the await for the
  // same reason everything else in `capture` is: the finding opens with a
  // description, and a slider turned during a 0.7 s annual run would have that
  // sentence describing a building the chart under it never solved. The
  // document is the one the IDF is about to be written from, so the sentence
  // and the file agree by construction.
  const described = describeDesk({
    doc: model,
    params: snapshot,
    state: modelState,
    place: station?.url
      ? { name: siteName(station), zone: climateZone(station) === '—' ? null : climateZone(station) }
      : null,
  });
  const live = continuous();
  quiet = live;

  clearLog();
  // Every solve leaves the previous result standing until the new one lands —
  // dimmed by `markStale` if the desk has moved past it, and replaced in place
  // when this run reports. Blanking the plate first was a strobe at 50 ms, and
  // at 0.7 s it was worse than a strobe: the finding is a paragraph and
  // `.finding:empty` is `display: none`, so clearing it collapsed three lines
  // out of the flow and pulled the schedule, the bill and everything below
  // them up the page for the length of the run, then dropped them back when
  // the sentence returned. The reader loses their place in the sheet to be
  // told nothing the status line was not already saying. The readings are
  // taken down where they actually stop being true — on the failure exits
  // below, where there is no new result coming to replace them.
  if (!live) statusEl.className = 'status';

  const t0 = performance.now();
  // A ticking clock is worth watching at 8,760 hours and is a flicker at 48.
  const tick = live
    ? null
    : setInterval(() => {
        elapsedEl.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
      }, 100);

  setAnnual(model, Boolean(epwText));

  // Held rather than inlined into the run call, so the download bundle can hand
  // over the exact bytes the engine was given. A fresh `writeIdf(model)` at
  // download time would usually match, but "usually" is the whole thing the
  // bundle exists to remove: a slider nudged since the solve would have it
  // shipping inputs that never produced the results on the sheet.
  const idf = writeIdf(model);

  /**
   * The download's copy of this run, filed the moment its outcome is known.
   *
   * Everything the bundle needs, captured as it happens rather than read back
   * off live state at click time, and filed on every exit rather than only the
   * one that reaches the bottom of this function — a fatal is the run whose
   * inputs are worth the most, and it used to be the run that shipped nothing.
   * `capture` carries the identity taken before the await (the EPW, the run
   * kind, the location and the permalink of the scheme that produced this),
   * spread whole for the same reason `idf` is held above: a field-by-field
   * copy is one more list to forget a field in.
   */
  const file = (extra) => {
    lastBundle = { idf, version: ENERGYPLUS_VERSION, ...capture, ...extra };
    syncDownload();
  };

  let result;
  try {
    result = await ep.run({ idf, epw: epwText });
  } catch (error) {
    solvedShape = shape;
    stopAuto();
    // Nothing reached the engine, so nothing on the sheet is going to be
    // replaced: the previous run's readings and its title block both come
    // down, leaving the reason standing alone.
    clearResults();
    statusEl.className = 'status bad';
    statusEl.textContent = `The run could not be attempted: ${error.message}`;
    // The engine wrote nothing, so the bundle is the inputs and the reason —
    // which is the whole of what is known, and enough to hand to a local
    // EnergyPlus that will get further than this one did.
    file({ failure: statusEl.textContent });
    return;
  } finally {
    if (tick) clearInterval(tick);
    quiet = false;
  }

  const seconds = (performance.now() - t0) / 1000;
  elapsedEl.textContent = `${seconds.toFixed(2)} s`;
  $('runs').textContent = String((runCount += 1));
  setPhase('complete');
  // Filed as attempted, not as succeeded: the pump's job is to catch up with
  // the slider, and a shape that fails is still a shape it need not retry.
  solvedShape = shape;

  const errs = result.err?.entries ?? [];
  const severe = errs.filter((e) => e.severity === 'severe' || e.severity === 'fatal').length;
  const warnings = errs.filter((e) => e.severity === 'warning').length;
  set('t-exit', String(result.exitCode), result.exitCode === 0 ? '' : 'flag');
  set('t-err', `${severe} / ${warnings}`, severe ? 'flag' : '');

  // What the engine wrote back, in the shape the bundle takes it: the same
  // fields whatever the outcome, so the three exits below differ only in
  // whether they carry a failure and an hour count. `html` is the genuine
  // eplustbl.htm — the model requests AllSummary with an All column separator,
  // so EnergyPlus writes it on every run that gets that far and it arrives on
  // the result; a run that fataled first has none and the manifest leaves it
  // out rather than shipping an empty file. `log` is the engine's own console
  // output, which the run already carries: it costs nothing to keep, and the
  // worker echoes every line of `/output/eplusout.err` into it after each run,
  // so it holds the severes in EnergyPlus's own words rather than the counts
  // the page shows. That is what makes a failed bundle worth having at all.
  // The .eso and the .err *file* come back only parsed, so shipping either as
  // a file of its own would mean re-serialising into something that isn't what
  // the engine wrote — left out rather than faked.
  const wrote = {
    html: result.html ?? null,
    log: result.consoleOutput?.length ? result.consoleOutput.join('\n') : null,
    exitCode: result.exitCode,
    severe,
    warnings,
    seconds,
  };

  if (!result.success) {
    // A fatal is rarely about this one shape, so stop solving on every drag
    // frame and let the failure sit still long enough to be read.
    stopAuto();
    // The readings only, not the title block: the exit code and the error
    // counts written just above are this run's own account of how it died.
    // The variable count is a reading off an ESO this run never got as far as
    // producing, so it goes with them rather than standing as the previous
    // run's number under a line saying this one was fatal.
    clearReadings();
    set('t-vars', '—');
    statusEl.className = 'status bad';
    statusEl.textContent = result.fatalError ?? `Engine exited with code ${result.exitCode}`;
    for (const entry of errs) log(`[${entry.severity}] ${entry.message}`);
    // No hours: the run stopped somewhere inside them and this file does not
    // guess where. Everything else the engine wrote goes, which for a fatal is
    // the console — the page shows the error entries parsed into a count and a
    // severity, and the sentences that name the object and the field are only
    // in there.
    file({ ...wrote, failure: statusEl.textContent });
    return;
  }

  const eso = result.eso;
  set('t-vars', String(eso?.variables.size ?? 0));

  const zonePts = eso ? hourly(eso, /Zone Mean Air Temperature/i) : [];
  const outPts = eso ? hourly(eso, /Site Outdoor Air Drybulb Temperature/i) : [];
  if (!zonePts.length) {
    stopAuto();
    // The run stands — its variable count, exit code and warnings are all
    // true of it — but nothing here can be lettered from it, so the previous
    // run's readings go rather than sit under a sentence saying this one
    // produced no temperature.
    clearReadings();
    statusEl.className = 'status bad';
    statusEl.textContent = 'Run completed, but no hourly zone temperature was found in the ESO.';
    // A run that came back whole and still lettered nothing is the hardest of
    // the three to diagnose from the page, because the title block reports a
    // clean exit over a blank plate. The bundle carries the tabular report the
    // engine did write, and re-running it locally produces the .rdd, which is
    // where the answer to a missing output variable actually is.
    file({ ...wrote, failure: statusEl.textContent });
    return;
  }

  // From here the run letters every panel, so the dimming that said "these
  // describe a shape the sheet has moved past" comes off in the same breath as
  // the numbers that replace it — not at the top of the solve, where it would
  // have shown the old result as current for the length of an annual run.
  for (const el of resultPanels()) el.classList.remove('stale');

  // What the engine made of the glazing, off the tabular report this run
  // wrote. Read here rather than beside the ESO because the Glazing strip is
  // lettered from `setReadings` at the foot of this function, with the
  // meters, and the two describe the same run.
  lastGlass = glassProperties(wrote.html, WINDOW_CONSTRUCTION);
  // And what the pressure network moved, off the ESO. Null on every run the
  // network was not in the path of, which is what keeps the readout an em dash
  // rather than a zero under the scheduled model.
  lastNetwork = networkFlow(eso);

  const hasOutdoor = outPts.length > 0;
  const nn = hasOutdoor ? Math.min(zonePts.length, outPts.length) : zonePts.length;
  const zone = zonePts.slice(0, nn).map((p) => p.value);
  const out = (hasOutdoor ? outPts : zonePts).slice(0, nn).map((p) => p.value);
  const points = zonePts.slice(0, nn);
  const runs = environmentRuns(points, eso?.environments ?? []);

  plot = { zone, out, segments: axisSegments(points, runs) };

  // `noun` rides along beside the column's label because the finding says the
  // environment in a sentence and the label heads a column: "the winter design
  // day's swing" against a column headed `Winter design day · 21 Dec`. It was
  // cut out of the label with a string split until a run period could be
  // called `Run period · Jan–Mar`, which lowercased into a sentence as
  // "the jan–mar's".
  //
  // The demand intensities divide by the floor the run was solved with, read
  // off the document the same way the bill and every sweep sample read it. A
  // design day gets none: twenty-four hours of a sizing condition is not a
  // period anything is billed or benchmarked over, which is the same line the
  // bill draws when it picks the environments it prices.
  const floorArea = geometryFacts(model).grossFloor;
  const columns = runs.map((r) => ({
    label: r.label,
    noun: r.noun,
    metrics: metricsFor(
      zone,
      out,
      r,
      hasOutdoor,
      r.kind === null ? demandOver(eso, new Set([r.key]), floorArea) : null,
    ),
  }));
  renderSchedule(columns, baseline?.columns);
  solvedColumns = columns;
  solvedParams = snapshot;

  // Tint the model by the environment the finding talks about, so the swatch
  // and the sentence agree — and read the console's meters over that same
  // environment, so the strips, the drawing and the sentence are all describing
  // one weather story rather than an average of two that share nothing.
  const leadIndex = columns.reduce(
    (best, c, i) => (c.metrics.o.swing > columns[best].metrics.o.swing ? i : best),
    0,
  );
  const lead = columns[leadIndex];
  lastMean = lead.metrics.z.mean;
  renderAxon(lastMean);

  lastHours = nn;
  readAt(points, runs, leadIndex, eso);

  // The plate and the bar under it are drawn after the hour is known, not
  // before: they carry the marker and the stamp for that hour, and drawing
  // them first would post the previous run's instant for the rest of this
  // function.
  renderWhen();
  renderTrace();

  // The end-use meters ride in on the same ESO -- `Output:Meter` writes to both
  // the .eso and the .mtr -- so the bill is priced off the run that is already
  // in hand rather than a second parse of a second file.
  // Which environments the bill covers. A weather file brings a real run
  // period with it and that is the only thing anyone means by an energy bill;
  // without one there are just the sizing days, and those are billed as
  // themselves rather than passed off as a year.
  const billed = runs.some((r) => r.kind === null) ? runs.filter((r) => r.kind === null) : runs;
  const weather = billed.some((r) => r.kind === null);
  lastRun = {
    eso,
    environments: new Set(billed.map((r) => r.key)),
    hours: billed.reduce((total, r) => total + (r.end - r.start + 1), 0),
    annual: weather,
    // How much of the year the meters actually cover, counted off the run
    // rather than off the Run strip, which may have moved since. Months can be
    // taken out of the run, and a bill that divided ten of them by the floor
    // area and headed the row "per year" would be handing an architect a
    // number whose only use is to be held against an annual benchmark it
    // cannot be compared with.
    months: weather ? billed.reduce((total, r) => total + r.months, 0) : null,
  };
  // The run that did letter the sheet, filed for download like the three that
  // do not. `hours` is the count the readings were taken over, which is what
  // makes this the one bundle whose manifest can state the run in full.
  file({ ...wrote, hours: nn });
  bill = billFrom(lastRun);
  // What the criteria on the register ask about, read once here rather than
  // off the ESO whenever a card is re-lettered. The register re-letters on
  // every gesture, and walking 8,760 points to answer a question that cannot
  // have changed would put a stutter in every drag.
  lastOutcome = readOutcome(eso, snapshot, patched, capture.epw);
  syncPin();
  renderBill();
  renderRegister();

  desk?.setReadings(lastReadings, derivedReadings(geometryFacts(model)), lastAt, readouts());
  desk?.setDerived(derivedLines());

  // Denver is named only where Denver is what was solved. A short weather run
  // — January alone is 744 hours, and 792 with the sizing days kept — falls
  // into the same narrow-axis branch as a design-day run, so another city's
  // January was being lettered as Denver's two design days by nothing more
  // than its hour count. The run kind decides the sentence, not the width.
  $('fig-cap').textContent = hasOutdoor
    ? nn > 900
      ? 'Zone mean air temperature against outdoor drybulb over the full run period. Each column spans the hourly range within it; the model at left is drawn from the surface vertices in the IDF and tinted by the zone mean.'
      : capture.annual
        ? 'Zone mean air temperature against outdoor drybulb over the months in the run. The model at left is drawn from the surface vertices in the IDF and tinted by the zone mean.'
        : 'Zone mean air temperature against outdoor drybulb across both Denver design days. The model at left is drawn from the surface vertices in the IDF and tinted by the zone mean.'
    : 'Zone mean air temperature over the run. No outdoor drybulb was recorded in the ESO.';

  const q = (text, hot) =>
    Object.assign(document.createElement('span'), { className: hot ? 'q hot' : 'q', textContent: text });
  const finding = $('finding');
  finding.textContent = '';
  // The description first, then what the run made of it. Two sentences about
  // the same building: the first is what the reader drew, the second is the
  // only thing on this sheet that says what drawing it that way did.
  for (const token of described) finding.append(typeof token === 'string' ? token : q(token.q));
  const m = lead.metrics;
  // Whether an ideal unit was in the path, read off the run and not off the
  // desk: these meters exist only when the System strip is engaged, and the
  // controls may have moved since this run was started. The sentence below
  // used to open "with no heating or cooling anywhere in this model"
  // whatever the strip was doing, which was the sheet stating the opposite of
  // what it had just simulated.
  const conditioned = END_USES.some((u) => u.needs === 'system' && meterTotal(eso, u.meter) != null);
  // The same reading the sweep takes at every sample, over the same billed
  // environments, so the sentence, the schedule's columns and the tick under
  // a study's redline are one number rather than three that ought to agree.
  const demand = readDemand(eso, floorArea);
  const billedRuns = runs.filter((r) => r.kind === null);

  if (demand?.tedi != null && demand?.cedi != null) {
    // The redline goes on whichever way this building leans, because that is
    // the finding — a Denver year asks five times more cooling than heating,
    // and the pen is the only thing in the sentence that says so. Summing the
    // two was tried and is gone: a total of the demand side has no published
    // definition and no benchmark behind it, and the bill's per-m² row is the
    // figure anyone actually holds a building against.
    finding.append(
      'Holding the setpoints across ',
      billedRuns.length === 1 ? `the ${billedRuns[0].noun}` : `${RUN_TALLY[billedRuns.length]} run periods`,
      ' asks ',
      q(f1(demand.tedi), demand.tedi >= demand.cedi),
      ' kWh/m² of heat into the zone and ',
      q(f1(demand.cedi), demand.cedi > demand.tedi),
      ' kWh/m² back out of it — the demand the envelope sets, before the plant efficiencies the bill below divides it by.',
    );
  } else if (conditioned) {
    // The setpoints are in the description above, so this says what the unit
    // actually held rather than restating them: under an unmet hour the two
    // are different numbers, and that difference is the reading. It does not
    // say "holds" either, for the plainer reason that the sentence before it
    // has just said "holding".
    finding.append(
      'The zone sits between ',
      q(f1(m.z.min)),
      ' °C and ',
      q(f1(m.z.max), true),
      ` °C over the ${lead.noun}. Demand intensities need a run period to read over — a sizing day is a condition, not a period — so attach a weather file and TEDI and CEDI join the schedule above.`,
    );
  } else if (Number.isFinite(m.damping)) {
    finding.append(
      'With no heating or cooling anywhere in this model, the envelope alone takes the ',
      lead.noun,
      "'s ",
      q(f1(m.o.swing)),
      ' °C outdoor swing down to ',
      q(f1(m.z.swing), true),
      ' °C in the zone — a damping ratio of ',
      q(m.damping.toFixed(2)),
      m.lag > 0 ? ' — and delays the peak by ' : '.',
    );
    if (m.lag > 0) finding.append(q(String(m.lag)), m.lag === 1 ? ' hour.' : ' hours.');
  } else {
    finding.append(
      'Left free-running, the zone floats between ',
      q(f1(m.z.min)),
      ' °C and ',
      q(f1(m.z.max), true),
      ' °C — held there by nothing but the envelope.',
    );
  }

  statusEl.className = 'status';
  statusEl.textContent = live
    ? `${nn.toLocaleString('en-US')} hours solved locally in ${seconds.toFixed(2)} s · auto-solve`
    : `${nn.toLocaleString('en-US')} hours solved locally in ${seconds.toFixed(2)} s · ${warnings} warning${warnings === 1 ? '' : 's'}`;

  // The readings this run took, onto the traverse stop they describe. Off the
  // snapshot the run was written from rather than off live `params`, for the
  // reason the description is captured before the await: a slider turned
  // during a 0.7 s annual run would put this building's numbers on another
  // building's stop.
  landTraverseReadings(snapshot, patching(), {
    high: m.z.max,
    low: m.z.min,
    mean: m.z.mean,
    hours: nn,
    annual: weather,
  });

  // Only a run that produced readable results fills the first square — the
  // early returns above are exactly the runs the note must not claim.
  tour?.note('solve');

  // And the criteria square fills only where the board actually lettered them.
  // The test is the count's own pair rather than any one reading, because the
  // two halves of that pair are blocked by different things: criterion b needs
  // nothing but operative temperature over some of May to September, so a
  // station attached over the stock desk would answer it alone and fill the
  // square for a reader who never patched Gains in and never saw a share of
  // occupied hours. `unread` is empty exactly when both came back with a
  // number, which is the state the note's own sentence describes. A run whose
  // criteria all stood under a blockage has not taken the step, however many
  // em dashes it drew — the notes read the model, and an em dash is the model
  // saying it could not answer.
  if (lastOutcome?.tm59?.count.unread.length === 0) tour?.note('tm59');
}

/* ══ the scheduler ═══════════════════════════════════════════════════════ */

// The engine rejects a second `run()` while one is in flight, so nothing else
// may call `solve` — everything goes through this one loop. The studies no
// longer share this engine: they run on their own pool, so the live sheet
// never queues behind a curve and this guard is a plain boolean again.
//
// Latest wins. Whatever the sliders are showing when the engine comes free is
// what gets solved; every shape the drag passed through on the way is skipped
// rather than queued. That is what keeps a fast sweep to a single run and lets
// a slow one resolve continuously, about every 0.7 s, without ever falling
// further behind than the run currently in flight.
let pumping = false;
let forced = false;
let runCount = 0;
const plateEl = $('plate');

async function pump() {
  if (pumping) return;
  pumping = true;
  // A refusal noted before this pump began is history the moment the reader
  // asks for a new solve; only one noted mid-flight outranks the result.
  refusalNote = null;
  runBtn.disabled = true;
  runBtn.textContent = 'Solving';
  plateEl.classList.add('solving');
  try {
    while (forced || (autoOn() && shapeKey(params) !== solvedShape)) {
      forced = false;
      await solve();
    }
  } finally {
    pumping = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run again';
    plateEl.classList.remove('solving');
    markStale();
    // A link refused while this loop had a solve in flight had its reason
    // overwritten by the solve's own status line the moment it landed. The
    // refusal outranks a result for a scheme that has just been set aside, so
    // it is re-lettered once the loop settles.
    if (refusalNote) {
      statusEl.className = 'status bad';
      statusEl.textContent = refusalNote;
      refusalNote = null;
    }
  }
}

// Hand the sheet back to the button, without discarding what is on it.
function stopAuto() {
  if (!autoBox.checked) return;
  autoBox.checked = false;
  syncAuto();
}

runBtn.addEventListener('click', () => {
  forced = true;
  pump();
});

/* ══ the studies ═════════════════════════════════════════════════════════ */

/*
 * A drag is authorship; a study is a question. The desk as it stands is
 * solved at each sample of one key — the run the sheet would solve, design
 * days or the attached year — and only quantity readings are kept from each
 * run. Live `params` are never touched: every sample is an overlay handed to
 * `applyModel`, so the sliders, the axonometric, the plate and the address
 * bar hold still while the pool tries a score of buildings the reader never
 * chose.
 *
 * The samples run on their own pool of engines, so the pump never waits and
 * a single sweep fans out across every instance. The one shared mutable is
 * the document itself, and `buildSample` below is the whole discipline: the
 * overlay is applied, written and restored in one synchronous breath, so no
 * await ever sees the document describing anything but the live desk —
 * idempotence is what makes the restore a restore rather than a guess, and
 * the Node harness asserts it byte for byte.
 *
 * The reader's hand outranks the study: `applyGeometry` cancels the jobs a
 * change reaches, partial curves are discarded rather than drawn, and
 * samples already on an engine land into nothing.
 */

const studyCapacity = poolLimit({
  cores: navigator.hardwareConcurrency ?? 4,
  deviceMemoryGB: navigator.deviceMemory ?? null,
});

const studyPool = createEnginePool({
  // Born silent: no console, no progress. The pump's engine narrates the
  // sheet; a background sample writing the status line five times a second
  // would make the one number worth reading impossible to read.
  createEngine: () => createEnergyPlus({ assetBaseUrl: `${import.meta.env.BASE_URL}energyplus` }),
  limit: studyCapacity,
});

/**
 * The declaration one sweep is read under, refused by name where there is none.
 *
 * `study.js` owns the quantity's lettering, contents and reader together. The
 * lookup here is the one refusal gate between persisted ids and declarations.
 *
 * The throw is the point. Both uses below sit inside the sample's own promise,
 * where the scheduler turns a rejection into a gap, so an id matching no
 * declaration would come back as twenty-one missing points under a card
 * reporting no readings and nothing anywhere would say the id was wrong. That
 * is why `enqueueStudy` asks this at the mint too, out in its own stack.
 */
function quantityOf(id) {
  const quantity = QUANTITY_BY_ID[id];
  if (!quantity) {
    throw new Error(`no study quantity is declared as "${id}"; the declarations are QUANTITIES in study.js`);
  }
  return quantity;
}

class MeterBasis {
  constructor({ series, floorArea, hours, engaged, annual, months }) {
    this.series = Object.freeze(Object.fromEntries(series));
    this.floorArea = floorArea;
    this.hours = hours;
    this.engaged = Object.freeze([...engaged]);
    this.annual = annual;
    this.months = months;
    Object.freeze(this);
  }
}

class LandedRun {
  constructor({ eso, meters, environments, hours, months, annual, bill: landedBill }) {
    this.eso = eso;
    this.meters = meters;
    this.environments = Object.freeze([...environments]);
    this.hours = hours;
    this.months = months;
    this.annual = annual;
    this.bill = landedBill;
    Object.freeze(this);
  }
}

function billFromBasis(basis, pricing) {
  if (!basis || !Object.keys(basis.series).length) return null;
  return computeBill({
    series: new Map(Object.entries(basis.series)),
    params: pricing,
    card: assume(resolveRates(station), pricing),
    floorArea: basis.floorArea,
    hours: basis.hours,
    engaged: new Set(basis.engaged),
    annual: basis.annual,
    months: basis.months,
  });
}

function landedFrom(eso, job, built) {
  const points = hourly(eso, exactly('Zone Mean Air Temperature'));
  const runs = environmentRuns(points, eso?.environments ?? []);
  // Weather-file environments where the run holds any, the design days where
  // it does not — and the same question answers both halves, so it is asked
  // once. Asked a second time of the filtered list it reads as a fresh fact
  // and is not one: after the filter every environment is a run period by
  // construction, so the answer can only ever be the first question's.
  const annualRun = runs.some((run) => run.kind === null);
  const billedRuns = annualRun ? runs.filter((run) => run.kind === null) : runs;
  const environments = new Set(billedRuns.map((run) => run.key));
  const series = new Map();
  for (const use of END_USES) {
    const total = meterTotal(eso, use.meter, environments);
    if (total != null) series.set(use.meter, total);
  }
  const sampleParams = { ...job.snapshot, [job.key]: built.value };
  const engaged = new Set(
    [...channelState(sampleParams, job.patch)].filter(([, state]) => state.engaged).map(([id]) => id),
  );
  const basis = new MeterBasis({
    series,
    floorArea: built.floorArea,
    hours: billedRuns.reduce((total, run) => total + (run.end - run.start + 1), 0),
    engaged,
    annual: annualRun,
    months: annualRun ? billedRuns.reduce((total, run) => total + run.months, 0) : null,
  });
  return {
    basis,
    landed: new LandedRun({
      eso,
      meters: series,
      environments,
      hours: basis.hours,
      months: basis.months,
      annual: basis.annual,
      bill: billFromBasis(basis, sampleParams),
    }),
  };
}

function studyOffers(snapshot = params, patch = patching(), epw = epwText ?? null) {
  const state = channelState(snapshot, patch);
  const channels = [...state].filter(([, value]) => value.engaged).map(([id]) => id);
  const engaged = new Set(channels);
  const card = assume(resolveRates(station), snapshot);
  const uses = END_USES.filter((use) => !use.needs || engaged.has(use.needs));
  const pricingStatus = (field) => {
    const missing = [];
    for (const use of uses) {
      const gas = use.fuelFor(snapshot).id === 'gas';
      const rate = field === 'cost' ? (gas ? card.gas : card.electricity) : (gas ? card.gasFactor : card.grid);
      if (!isRate(rate)) missing.push(rate);
    }
    if (!missing.length) return new PricingStatus({ available: true });
    return new PricingStatus({
      available: false,
      reason: [...new Set(missing.map((rate) => rate.reason))].join(' '),
      fix:
        field === 'cost'
          ? 'Set the Tariff source to Assumed and enter the missing rate.'
          : 'Set the carbon-factor source to Assumed and enter the missing factor.',
    });
  };
  const pricing = new PricingAvailability({
    currency: card.currency.code,
    cost: pricingStatus('cost'),
    carbon: pricingStatus('carbon'),
  });
  return studyOffersFor({
    annual: Boolean(epw),
    wholeYear: Boolean(epw) && isWholeYear(snapshot.months),
    season: Boolean(epw) && touchesSeason(snapshot.months),
    channels,
    pricing,
  });
}

/**
 * What one sweep's runs must carry, and what they will be built carrying.
 *
 * The engaged channels of the desk decide which *meters* are producible, which
 * is what `contentsFor` uses them for. They are deliberately **not** what
 * `carried.channels` is set to. That field is a precondition — `syncReporting`
 * throws for any channel named there that the sample's own `channelState` does
 * not have engaged — and a sample is the desk with one control moved, so a
 * channel that was engaged on the snapshot can perfectly legitimately go out
 * under the overlay: sweep the only glazed wall's ratio down to nothing and
 * Blinds and Daylight lose the opening their `requires` asks for. Handed the
 * whole engaged set, every such sample throws inside `buildSample`, the
 * scheduler turns the rejection into a gap, and the curve comes back with a
 * hole in it at exactly the position the reader was asking about. So what
 * travels is the quantity's own requirement, which is what the throw's own
 * sentence claims to be checking; the rest of the desk is already in the cache
 * key through `deskKey`, so nothing about sample identity is lost.
 */
function sampleContentsFor(quantity, snapshot, patch, epw) {
  const state = channelState(snapshot, patch);
  const channels = [...state].filter(([, value]) => value.engaged).map(([id]) => id);
  const needed = contentsFor(quantity, channels);
  const carried = new RunContents({
    variables: needed.variables,
    meters: needed.meters,
    tables: needed.tables,
    annual: Boolean(epw),
    channels: needed.channels,
    season: Boolean(epw) && touchesSeason(snapshot.months),
  });
  return { needed, carried };
}

function repriceStudies() {
  if (!studyScheduler) return;
  studyScheduler.reprice((readings, basis) => {
    const priced = billFromBasis(basis, params);
    const landed = { bill: priced };
    return Object.freeze({
      ...readings,
      eui: QUANTITY_BY_ID.eui.read(landed),
      cost: QUANTITY_BY_ID.cost.read(landed),
      carbon: QUANTITY_BY_ID.carbon.read(landed),
    });
  });
  if (studyQuantity) redrawStudiesForQuantity({ queue: false });
}

/**
 * Overlay one sample onto the shared document, write it, and put the live
 * desk back — synchronously, which is the entire point. The pump's `solve`
 * reads this same document; the only reason they can share it is that
 * neither ever yields to the other while it is in overlay state.
 */
function buildSample(job, value) {
  try {
    // `setAnnual` lives outside `applyModel`, so it is bracketed here both
    // ways: forgetting the restore half would leave the pump solving design
    // days as a year, or a fatal run of no environments at all.
    setAnnual(model, job.annual);
    // Structured contents off the declaration, never a profile name inferred
    // from the selected id.
    applyModel(model, { ...job.snapshot, [job.key]: value }, job.patch, {
      reporting: job.carried,
    });
    // Each sample's intensity divides by that sample's own floor, which the
    // swept key may itself be moving — the same live read the bill takes.
    const floorArea = geometryFacts(model).grossFloor;
    return { idf: writeIdf(model), epw: job.epw, floorArea, carried: job.carried, value };
  } finally {
    applyModel(model, params, patching());
    setAnnual(model, annual());
  }
}

/**
 * The cache identity of one sample: the sample's whole desk — the overlay's
 * shape key — plus the run kind and the canonical carried contents, so a lean
 * design-day sample can never answer for an annual one. The station is
 * deliberately absent, which is why a station change clears the cache.
 *
 * A named function rather than an inline one because the survey names it too:
 * a `SpotHeight` carries the `exact` identity of the run behind it, which is
 * what makes "every figure traces to a run" a thing a harness can check
 * instead of a thing the module promises. Two copies of this would be two
 * answers to "which run was that", and the second one would be wrong.
 */
function sampleIdentity(job, value, carried) {
  const bucket = JSON.stringify([
    deskKey({ ...job.snapshot, [job.key]: value }, job.patch),
    job.annual ? 'year' : 'design-day',
  ]);
  return { bucket, exact: JSON.stringify([bucket, carried.serialize()]) };
}

studyScheduler = createStudyScheduler({
  // The cache key is the sample's whole desk — the overlay's shape key —
  // plus the run kind and canonical carried contents, so a lean design-day
  // sample can never answer for an annual one. The station is
  // deliberately absent, which is why a station change clears the cache.
  keyOf: sampleIdentity,
  buildSample,
  runSample: async ({ idf, epw }) => {
    const result = await studyPool.run({ idf, epw });
    // The counter counts engine runs, so cache hits — honestly — do not turn it.
    runCount += 1;
    $('runs').textContent = String(runCount);
    return result;
  },
  // The reader off the declaration too, and for the same reason the profile
  // above is: which numbers a sample is kept for is a fact about the metric,
  // and a ternary here is a second place to teach every time one is declared —
  // the failure being a metric whose samples all land as `undefined`, which the
  // scheduler spreads into the curve as points with nothing on them.
  //
  // `built` is what `buildSample` returned and `context` is what `contextFor`
  // resolved once for the whole sweep; each reader takes the pair and helps
  // itself to the half it needs.
  readPoint: (job, result, built) => {
    if (!result.eso) return null;
    const { landed, basis } = landedFrom(result.eso, job, built);
    const readings = {};
    const deskContext = {
      runningMean: job.context?.runningMean ?? null,
      occupiedFloor: job.context?.occupiedFloor,
    };
    for (const quantity of QUANTITIES) {
      const needed = contentsFor(quantity, basis.engaged);
      if (!built.carried.answers(needed)) continue;
      const context = quantity.context ? quantity.context(deskContext) : null;
      readings[quantity.id] = quantity.read(landed, { built, context });
    }
    return Object.freeze({
      carried: built.carried,
      readings: Object.freeze(readings),
      meterBasis: basis,
    });
  },
  /**
   * The facts a sample's reader needs that the sweep itself does not change.
   *
   * Criterion a is the only metric that needs any, and it needs two: the
   * adaptive line's climate half, and the value the occupancy schedule takes
   * when nobody is home. Neither can be recovered from a sample's own ESO. The
   * running mean is seeded from the seven days to 29 April, which are outside
   * every summer run this desk can produce and inside no simulation at all for
   * a June-to-August calendar; and the floor is a property of the schedule
   * `applyGains` wrote rather than of the series it reported — 0.1 for the
   * desk's own weekday band, 0 for a TM59 pattern — which is the trap this
   * whole feature is threaded around, since testing `> 0` instead counts every
   * hour of all 153 days, 3,672 of them, and 3,672 is also exactly the figure
   * CL:2026 publishes for a bedroom.
   *
   * It is built here rather than declared on the `Metric` because both halves
   * are things only this module holds: the running mean is a cache on the
   * attached file's identity and the floor comes from the applier, while
   * `study.js` is DOM-free and knows nothing about either. The declaration owns
   * the reader that consumes this, which is where the shape is documented.
   *
   * **The mean is read out of the cache, never rebuilt.** `dailyMeans` walks
   * the file's 8,760 records — 3.13 ms measured under Node on Chicago TMY3,
   * budgeted at 13.2 ms in the browser — and the sheet's own solve has already
   * paid for it against this exact file. The scheduler asks this once per
   * study for its own reasons; asking it twenty-one times would still be one
   * cache read each, and rebuilding would spend more than a design day's solve
   * answering a question whose answer is already in `meanCache`.
   *
   * **The whole `{ mean, absence }` pair travels, never the line out of it**,
   * which is the same rule `readTm59` follows on the sheet and for a sharper
   * reason here. A file that cannot yield a running mean is a state a reader
   * can reach — a leap year, a file split into several data periods, a record
   * missing from the middle of April — and `runningMeanFor` answers it with a
   * sentence rather than a throw. Handed the bare `null` that pair's `mean`
   * half holds, `readCriterionA` throws instead of returning a `Reading`
   * carrying the reason, and it throws from inside `readPoint`'s loop over
   * *every* declared quantity: one unreadable weather file would take down not
   * only criterion a's curve but every curve on the desk, all of it landing as
   * gaps with nothing anywhere saying why. The reader accepts the pair
   * precisely so the absence stands in its own precedence, so the pair is what
   * it is given.
   */
  contextFor: (job) => ({
    runningMean: runningMeanFor(job.epw),
    occupiedFloor: occupiedFloor(job.snapshot),
  }),
  // Shut during a gesture, and shut for the breath a survey's rows go in
  // together: enqueued one at a time with a drain on each, row 0 would fill the
  // pool before row 1 was in the list and the coarse pass would land as one
  // finished row over eight empty ones.
  paused: () => gesture || surveyEnqueueing,
  capacity: () => studyCapacity,
  onUpdate: onStudyUpdate,
});

/**
 * The Study button. Its own Stop when the key is already queued or running —
 * and a Stop is remembered against this desk, so automatic refresh does not
 * resurrect the study on the next release.
 */
function studyRun(key) {
  if (!studyScheduler) return;
  if (studyScheduler.has(key)) {
    studyStops.set(key, restShapeKey(key));
    studyScheduler.cancel(key, 'stopped');
    if (!studies.has(key)) openStudies.delete(key);
    updatePermalink();
    return;
  }
  studyStops.delete(key);
  let openingBasis = null;
  if (!studyQuantity) {
    const opening = openingQuantityForDesk(params, patching(), epwText ?? null);
    studyQuantity = opening.id;
    openingBasis = OPENING_QUANTITY_BASIS[opening.id];
    updatePermalink();
  }
  openStudies.add(key);
  updatePermalink();
  // Ahead of any refresh backlog: the reader asked for this one by name.
  enqueueStudy(key, { origin: 'manual', front: true, openingBasis });
}

/**
 * Whether a run's own calendar reaches any part of the assessment period.
 *
 * Read off `SEASON` rather than written out as May to September, for the reason
 * every date in this feature is: the period is declared once in `tm59.js` with
 * the clause it comes from, and a second copy of 5 and 9 out here is the drift
 * that declaration exists to prevent. A month mask is twelve characters,
 * January first.
 */
const touchesSeason = (mask) => {
  for (let m = SEASON.from.month; m <= SEASON.to.month; m += 1) {
    if (mask[m - 1] === '1') return true;
  }
  return false;
};

/**
 * What one sweep's runs are read for, decided off the desk they will describe.
 *
 * There is no metric menu on this page and there must not be one: a study is
 * offered under the control it sweeps and started with one press, and asking
 * the reader which of three readings they meant before drawing anything would
 * put a dialogue in the middle of a gesture. So the reading is read off the
 * desk, the way everything else here is.
 *
 * **Demand where there is plant and a year**, unchanged, and it stays first.
 * With ideal loads in the path the extremes flatten at the setpoints and the
 * demand the system pays to hold them there is the reading. Criterion a is
 * scoped by TM59:2026 §2.4.1 to spaces "predominantly naturally ventilated
 * during occupied hours"; the criterion for a mechanically cooled one is c,
 * which nothing here sweeps. A criterion-a curve over a cooled desk would be
 * sweeping a control against a line the plant is already holding, and the
 * sheet's own reading of that run says so — `qualificationsFor` appends "partly
 * the system's answer and not the fabric's" to every one of them.
 *
 * **Criterion a where the desk has asked the question.** Four things make it
 * answerable, and every one of them is a way for all twenty-one samples to come
 * back null rather than a way for the curve to be wrong:
 *
 *   - a weather file, because two design days are not a season whatever their
 *     dates — and a summer design day falls *inside* 1 May to 30 September by
 *     date, which is why `weatherRuns` drops it rather than trusting the dates;
 *   - some of 1 May to 30 September inside the run's own calendar, because the
 *     Run strip can take those months out and a run that reached no part of the
 *     period has nothing to be a share of;
 *   - Gains engaged, because `addOccupancyValue` writes no series where
 *     `applyGains` wrote no schedule, and the denominator is the occupancy the
 *     engine actually saw rather than a schedule read back in JavaScript;
 *   - a running mean the attached file can produce, since the comfort line is
 *     the other half of the reading and a file that cannot yield one is refused
 *     rather than seeded from a guess.
 *
 * Answerable is not the same as wanted, which is the fifth condition and the
 * only one that is a choice. Every free-running annual desk with Gains patched
 * in can answer criterion a, and taking that as the trigger would swap the
 * winter low off every insulation sweep on this page for a summer share nobody
 * on that desk asked for. `roomType` off *As drawn* is the one control here
 * that says this building is being assessed to TM59 — naming a space swaps the
 * desk's weekday band for the method's three profiles and its densities for
 * counts — so it is what turns the sweep from the zone's two extremes to the
 * one share those extremes are judged by. It is a `Selector` and carries no
 * face, so it can never be the swept key and can never move inside a study, and
 * it rides `restShapeKey`, so naming a space re-sweeps every curve on the desk
 * under the new reading rather than leaving one drawn under the old.
 *
 * **The extremes otherwise**, which is where a desk that has said none of that
 * stays: free-running, the zone's own two extremes are the design quantities
 * and one hourly series answers both.
 */
/** The register entry whose criterion a study reads. */
const TM59_PRESET = 'tm59';

function openingQuantityForDesk(snapshot, patch, epw) {
  const state = channelState(snapshot, patch);
  return openingQuantity({
    annual: Boolean(epw),
    system: state.get('system').engaged,
    chasingTm59: chased === TM59_PRESET,
    gains: state.get('gains').engaged,
    season: touchesSeason(snapshot.months),
    runningMean: Boolean(epw && runningMeanFor(epw).mean),
  });
}

function jobForStudy(key, { origin = 'refresh', n = SWEEP_SAMPLES, openingBasis = null } = {}) {
  const { control } = controlFor(key);
  // The desk this study describes, read in one breath — the same capture
  // rule the solve follows, for the same reason: params keep moving between
  // samples, and every sample of a job must describe the same desk.
  const snapshot = { ...params };
  const patch = patching();
  const epw = epwText ?? null;
  if (!studyQuantity) throw new Error(`the study of ${key} was queued before the desk quantity was initialized`);
  const quantity = quantityOf(studyQuantity);
  const { needed, carried } = sampleContentsFor(quantity, snapshot, patch, epw);
  const points = samplePoints(control, snapshot[key], n);
  return makeStudyJob({
    key,
    snapshot,
    patch,
    epw,
    annual: Boolean(epw),
    quantity: quantity.id,
    needed,
    carried,
    restShape: restShapeKey(key, snapshot, patch),
    points,
    order: sampleOrder(points, snapshot[key]),
    origin,
    asked: n,
    openingBasis: openingBasis ?? studies.get(key)?.openingBasis ?? null,
  });
}

/** Queue one study of the desk as it stands right now. */
function enqueueStudy(key, { origin, front = false, n = SWEEP_SAMPLES, openingBasis = null } = {}) {
  const job = jobForStudy(key, { origin, n, openingBasis });
  const quantity = quantityOf(job.quantity);
  const offers = studyOffers(job.snapshot, job.patch, job.epw);
  const selected = offers.find((offer) => offer.quantity.id === quantity.id);
  if (!selected.available) {
    const prior = studies.get(key);
    const waiting = {
      ...(prior ?? {}),
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      wholeYear: job.annual && isWholeYear(job.snapshot.months),
      quantity: quantity.id,
      offers,
      waiting: { quantity: quantity.label, missing: job.total, reason: `${selected.reason} ${selected.fix}` },
      curve: [],
      coarse: n === COARSE_SAMPLES,
    };
    openStudies.add(key);
    studies.set(key, waiting);
    desk.setStudy(key, waiting, { stale: false });
    syncStudyControls();
    return;
  }
  studyScheduler.enqueue(job, { front });
}

function redrawStudiesForQuantity({ queue = true } = {}) {
  if (!studyScheduler || !studyQuantity) return;
  const quantity = quantityOf(studyQuantity);
  const offers = studyOffers();
  for (const [key, prior] of studies) {
    const job = jobForStudy(key, { n: prior.coarse ? COARSE_SAMPLES : SWEEP_SAMPLES });
    const cached = studyScheduler.curveFor(job);
    const selected = offers.find((offer) => offer.quantity.id === quantity.id);
    const unavailable = !selected.available;
    const study = {
      ...prior,
      quantity: quantity.id,
      offers,
      curve: unavailable ? [] : cached.curve,
      waiting: unavailable
        ? { quantity: quantity.label, missing: job.total, reason: `${selected.reason} ${selected.fix}` }
        : cached.missing
          ? { quantity: quantity.label, missing: cached.missing, reason: null }
          : null,
      restShape: job.restShape,
    };
    studies.set(key, study);
    desk.setStudy(key, study, { stale: false });
    if (!unavailable && cached.missing && queue && autoOn() && !studyScheduler.has(key)) {
      studyScheduler.enqueue(job);
    }
  }
  syncStudyControls();
  updatePermalink();
}

function chooseStudyQuantity(id) {
  const quantity = quantityOf(id);
  if (studyQuantity === quantity.id) return;
  studyQuantity = quantity.id;
  redrawStudiesForQuantity({ queue: true });
}

/** Queue the current-shape studies that waited while auto-solve was off. */
function resumeWaitingStudies() {
  if (!studyScheduler || !autoOn() || linkAttachPending) return;
  for (const [key, study] of [...studies].reverse()) {
    if (!study.waiting || studyScheduler.has(key)) continue;
    const rest = restShapeKey(key);
    if (studyStops.get(key) === rest) continue;
    enqueueStudy(key, { origin: 'refresh', n: COARSE_SAMPLES });
  }
}

/**
 * Re-queue every study the desk has moved out from under.
 *
 * Called from `endGesture` — the one point all four gesture paths already
 * share — and from the auto-solve toggle, so curves heal themselves under
 * the same switch that governs the sheet's own re-solving. The first pass is
 * coarse: eleven points redraw every curve in half the runs, and the idle
 * densify below fills each back to twenty-one from the cache. Checked here
 * and not left to the button gate: `syncSweepGate` only disables buttons,
 * and this path never clicks one — during a link attach the desk carries
 * `sizingPeriods=No` with no year, and every sample would fatal on zero
 * environments.
 */
function refreshStudies() {
  if (!studyScheduler || !autoOn() || linkAttachPending) return;
  // Most recently swept first — the map holds insertion order and a finished
  // study re-sets its key — so the curves the reader touched last heal first.
  for (const [key, study] of [...studies].reverse()) {
    const rest = restShapeKey(key);
    if (study.restShape === rest) continue; // still true of this desk
    if (studyScheduler.has(key)) continue; // already re-sweeping
    if (studyStops.get(key) === rest) continue; // stopped, and the desk has not moved since
    studyStops.delete(key); // the desk moved past the Stop; it lapses
    enqueueStudy(key, { origin: 'refresh', n: COARSE_SAMPLES });
  }
}

/**
 * Fill coarse curves back to full resolution, one study per idle pass.
 *
 * The coarse grid is a strict subset of the full one, so the eleven solved
 * points return from the cache and a densify costs exactly the ten new runs.
 * One study at a time keeps the pool shallow enough that a fresh gesture is
 * never far behind a backlog it has to invalidate.
 */
function densifyStudies() {
  if (!studyScheduler || !autoOn() || gesture || linkAttachPending) return;
  for (const [key, study] of [...studies].reverse()) {
    if (!study.coarse) continue;
    const rest = restShapeKey(key);
    if (study.restShape !== rest) continue; // stale — refresh owns it, not densify
    if (studyScheduler.has(key)) continue;
    if (studyStops.get(key) === rest) continue;
    enqueueStudy(key, { origin: 'refresh', n: SWEEP_SAMPLES });
    return;
  }
}

/** A fresh object per call, so the console's identity check redraws the card. */
const partialStudy = (job) => ({
  label: shapeLabel(job.snapshot),
  restShape: job.restShape,
  annual: job.annual,
  // Whether the sweep's runs were a whole year of weather or a few months of
  // one, which is what the card's own words turn on: the extremes of a run
  // period that stops in May are not "the annual peak".
  wholeYear: job.annual && isWholeYear(job.snapshot.months),
  quantity: job.quantity,
  offers: studyOffers(job.snapshot, job.patch, job.epw),
  waiting: null,
  openingBasis: job.openingBasis,
  // Samples still in flight are simply absent, so the silhouette spans them
  // and sharpens as they land; a sample that failed stays in the curve with
  // no quantity reading and draws as a gap, never a substituted value.
  curve: job.curve.filter(Boolean),
  progress: { done: job.done, total: job.total },
});

/** The stored card back on the console after a cancel or a failure. */
function restoreStudyCard(key) {
  const prior = studies.get(key);
  if (prior) desk.setStudy(key, prior, { stale: prior.restShape !== restShapeKey(key) });
  else desk.setStudy(key, null);
}

/**
 * One quiet line for the drain — but only for a study the reader asked for.
 *
 * The status line reports what was last asked for, and a background refresh
 * is housekeeping rather than a request: left free to write, it replaced the
 * sheet's own "8,760 hours solved locally in 11.38 s" with a sample counter a
 * moment after the run it describes landed, which loses the one number the
 * reader was waiting on. Refreshes narrate on the cards instead, each with
 * its own count, and the Set-aside button appearing is the global sign that
 * the pool is busy. The same rule as the pump's tail keeps a refusal on top
 * of both.
 */
function syncStudyStatus(finalLine = null, { quietly = false } = {}) {
  const p = studyScheduler.progress();
  syncStudyControls();
  if (pumping || quietly || statusEl.classList.contains('bad')) return;
  if (p.manual > 0) {
    statusEl.className = 'status';
    statusEl.textContent = `Study — ${p.done} of ${p.total} samples solved.`;
  } else if (p.jobs === 0 && finalLine) {
    statusEl.className = 'status';
    statusEl.textContent = finalLine;
  }
}

// The impatience lever: one click sheds every queued study. Samples already
// on an engine cannot be stopped — they finish within the one they hold and
// land into nothing — so the desk feels stopped at once and the pool is free
// within a sample's time. Each shed key is suppressed like a per-study Stop,
// so the next idle pass does not quietly restart the work; the next desk
// move lapses the suppression and the studies refresh as usual.
studiesStopBtn.addEventListener('click', () => {
  // Everything in the queue, which since E-02 is three kinds of work rather
  // than one: studies, the survey's rows and the pull's probes all ride this
  // scheduler, so one press sheds all three. Saying "studies" over that would
  // be a count that does not include what it claims to include (FR-054), so
  // the sentence names what actually went.
  const shedding = [];
  if ((studyScheduler?.progress().jobs ?? 0) > 0) {
    if (desk?.studyCount()) shedding.push('studies');
    if (surveyRows.size) shedding.push('the survey');
    if (pullJobs.size) shedding.push('the pull');
  }
  studyScheduler?.cancelWhere(() => true, 'shed');
  if (!pumping) {
    statusEl.className = 'status';
    statusEl.textContent = shedding.length
      ? `${shedding.join(', ').replace(/, ([^,]*)$/, ' and $1')} set aside — they resume when the desk next moves.`
      : 'Nothing queued to set aside.';
    // Sentence case, whichever of the three came first.
    statusEl.textContent = statusEl.textContent.charAt(0).toUpperCase() + statusEl.textContent.slice(1);
  }
});

// The desk head's Clear, beside Revert all: one takes the controls back and
// leaves the curves, the other takes the curves down and leaves the controls.
// It lives in the console's own head because that is where every study is —
// the Study buttons and the cards are on the strips and nowhere else — and it
// is wired here rather than beside `desk-revert` so that everything that can
// cancel or discard a study reads in one place.
studiesClearBtn.addEventListener('click', () => clearAllStudies());

/**
 * Both global study controls, lettered from what is actually on the desk.
 *
 * Set aside appears while the pool has work; Clear appears while any card is
 * standing, which outlives the work by design — a finished curve is exactly
 * what there is to clear. The count comes off the console's cards rather than
 * the `studies` map so a sweep still landing is counted the moment its card
 * goes up, not when its curve is stored.
 */
function syncStudyControls() {
  studiesStopBtn.hidden = (studyScheduler?.progress().jobs ?? 0) === 0;
  const n = desk?.studyCount() ?? 0;
  studiesClearBtn.hidden = n === 0;
  // The count says studies and means studies: E-02 has its own Clear, on E-02,
  // beside the drawing it takes down. A single count spanning both would be a
  // number that cannot be checked against anything the reader can see, and a
  // button that cleared a drawing on another part of the sheet without saying
  // so is the silent effect FR-054 exists to forbid.
  if (n > 0) studiesClearBtn.textContent = `Clear ${n} ${n === 1 ? 'study' : 'studies'}`;
}

/**
 * Take every curve down at once, and leave the desk exactly as it stands.
 *
 * The per-card Clear is the right gesture for one curve and a poor one for
 * six: the cards hang under the controls they sweep, which on a five-column
 * desk means six clicks in six places, each one reflowing the column it sits
 * in. This is the same act performed once.
 *
 * Nothing here touches `params`, `bypass` or the document — a study never did,
 * so clearing one cannot. That is the whole difference from Revert all beside
 * it, and it is why no solve follows: the desk after this click describes the
 * same building it described before, and the sheet's own numbers still stand.
 *
 * Queued and running sweeps go first, or a sample landing a moment later would
 * draw its card straight back onto a console the reader has just cleared. They
 * are cancelled as `cleared` rather than `shed`, which is the difference
 * between a study set aside and one that no longer exists: a shed key is
 * suppressed so the idle densify does not restart it, whereas a cleared study
 * is simply gone from `studies`, and both `refreshStudies` and
 * `densifyStudies` walk that map. Stops go too, for the same reason — a
 * decision about a study that is no longer there.
 *
 * The sample cache is deliberately kept. It is keyed by the sample's own desk
 * and holds runs that are still true of it, so sweeping the same control again
 * costs nothing; clearing a drawing is not a claim that the arithmetic behind
 * it was wrong.
 */
function clearAllStudies() {
  // Only the studies' own jobs, by name. `cancelWhere(() => true)` would take
  // the survey's rows and the pull's probes with them — work the reader did
  // not ask to clear, from a button that says nothing about either, which is
  // the silent effect FR-054 forbids. E-02 has its own Clear beside its own
  // drawing.
  studyScheduler?.cancelWhere((job) => job.origin !== 'survey' && job.origin !== 'pull', 'cleared');
  studies.clear();
  openStudies.clear();
  studyStops.clear();
  desk?.clearStudies();
  updatePermalink();
  // Through `syncStudyStatus` rather than by writing the line here: it is the
  // one place that knows a run in flight or a refusal already owns the status
  // line, and it syncs both buttons on the way past.
  syncStudyStatus('Studies cleared — every control stands where it was.');
}

function onStudyUpdate(job, event) {
  // A survey row and a pull probe both carry a real control key, so without
  // these gates every one of them would draw a study card under that control
  // and the last to land would win.
  if (onSurveyUpdate(job, event)) return;
  if (onPullUpdate(job, event)) return;
  if (event === 'idle') {
    syncStudyStatus();
    // Densify in idle time, not now: the queue just drained, and the reader
    // may be reaching for a control this instant.
    (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300)))(() => densifyStudies());
    return;
  }
  const key = job.key;
  // The subject as a sentence names it: a plan key's wall says which wall,
  // because four of its curves can be drawn at once and "the study of the
  // window-to-wall ratio" would be true of all four.
  const said = phraseFor(key);
  const kind = !job.annual
    ? 'design-day'
    : isWholeYear(job.snapshot.months)
      ? 'annual'
      : 'run-period';

  if (event === 'point') {
    desk.setStudy(key, partialStudy(job), { stale: false });
    desk.setStudyProgress(key, { done: job.done, total: job.total });
    syncStudyStatus();
  } else if (event === 'done') {
    const study = {
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      wholeYear: job.annual && isWholeYear(job.snapshot.months),
      quantity: job.quantity,
      offers: studyOffers(job.snapshot, job.patch, job.epw),
      waiting: null,
      openingBasis: job.openingBasis,
      curve: job.curve,
      // A coarse first pass is a real study, drawn honestly at eleven points;
      // the flag is what tells the idle densify it is worth finishing.
      coarse: job.asked === COARSE_SAMPLES,
    };
    studies.set(key, study);
    openStudies.add(key);
    desk.setStudyProgress(key, null);
    // Stale already, when the desk moved while the curve was landing — drawn
    // dimmed rather than fresh, so the card never claims a desk it missed.
    desk.setStudy(key, study, { stale: study.restShape !== restShapeKey(key) });
    // A curve the reader asked for says so when it lands; one that healed
    // itself in the background just appears, which is the whole point of it.
    syncStudyStatus(`Study drawn — ${job.total} ${kind} runs across ${said}.`, {
      quietly: job.origin !== 'manual',
    });
  } else if (event === 'failed') {
    desk.setStudyProgress(key, null);
    restoreStudyCard(key);
    if (!studies.has(key)) openStudies.delete(key);
    updatePermalink();
    // The one branch that writes the status line itself and so never reaches
    // `syncStudyStatus`. A failed sweep can take the last card off the desk,
    // and Clear must go with it.
    syncStudyControls();
    // A failure is worth saying whichever way the study was asked for — it is
    // the one study outcome that leaves nothing drawn to speak for itself.
    if (!pumping) {
      statusEl.className = 'status bad';
      statusEl.textContent = `The study of ${said} could not be drawn: every sample failed to solve.`;
    }
  } else if (event === 'cancelled') {
    desk.setStudyProgress(key, null);
    // The study the key already had — still stored, still true — gets its
    // card back rather than reappearing on the next unrelated gesture.
    restoreStudyCard(key);
    if (job.cancelled === 'stopped' && !studies.has(key)) openStudies.delete(key);
    updatePermalink();
    // A global Set-aside suppresses each key the way a per-study Stop does,
    // or the next idle densify would quietly restart the work just shed.
    if (job.cancelled === 'shed') studyStops.set(key, restShapeKey(key));
    if (job.cancelled === 'stopped') syncStudyStatus(`Study of ${said} set aside.`);
    else syncStudyStatus();
  }
}

/* ══ E-02: the survey ════════════════════════════════════════════════════ */

/**
 * The ground, wired to the queue the studies already use.
 *
 * There is no second scheduler, no second pool and no second cache, and that
 * is the whole design rather than an economy. A survey row *is* a study job —
 * `buildSample` overlays one key onto a whole-desk snapshot, so a row at a
 * fixed value of axis Y is a job whose snapshot carries that Y — which makes
 * three requirements properties of the arrangement instead of features:
 *
 *   - **FR-011.** A study of axis X taken at the stance is byte-identical in
 *     cache identity to the survey's own stance row, so it is a cache hit and
 *     costs no engine run. Opening a survey on an axis already swept spends
 *     nothing on the positions the sweep covered.
 *   - **FR-053.** Rows and studies are literally in one queue, so there is no
 *     pool for one to hold against the other. The round-robin in `takeNext` is
 *     what makes that fair rather than merely shared.
 *   - **FR-052.** `clearAll` on a station change cancels the rows with the
 *     studies and clears the cache under both, because it is the same call.
 */

const SURVEY_ID = 'survey';

/**
 * What a survey's runs must carry, over both of its readings at once.
 *
 * The union rather than one quantity's contents, because a ground surveyed for
 * demand and overheating is one set of runs read twice, not two sets. Carried
 * follows `sampleContentsFor`'s rule and for its reason: `channels` is a
 * precondition `syncReporting` throws on, and a sample is the desk with one
 * control moved, so what travels is the quantities' own requirement rather
 * than the whole engaged set.
 */
function surveyContents(sv) {
  const state = channelState(sv.stance, sv.patch);
  const channels = [...state].filter(([, value]) => value.engaged).map(([id]) => id);
  const needed = RunContents.union(sv.quantities.map((quantity) => contentsFor(quantity, channels)));
  const carried = new RunContents({
    variables: needed.variables,
    meters: needed.meters,
    tables: needed.tables,
    annual: sv.annual,
    channels: needed.channels,
    season: sv.annual && touchesSeason(sv.stance.months),
  });
  return { needed, carried };
}

/** Whether every reading the survey carries can be answered on its own desk. */
function surveyRefusal(sv) {
  const offers = studyOffers(sv.stance, sv.patch, sv.epw);
  for (const reading of sv.readings) {
    const offer = offers.find((candidate) => candidate.quantity.id === reading.quantity.id);
    if (!offer.available) return `${offer.reason} ${offer.fix}`;
  }
  return null;
}

/**
 * Put one pass of the ground into the queue.
 *
 * Rows go in **in one breath** and then the queue drains, which is what the
 * round-robin needs to be able to interleave them: enqueued one at a time with
 * a drain on each, the first row would fill the pool before the second was in
 * the list, and the coarse pass would land as one finished row over eight
 * empty ones. `paused()` is already true during a gesture, so the natural
 * place for that breath is a gesture — but a survey is opened between
 * gestures, so the enqueue is bracketed explicitly.
 */
/** The rest of the desk, excluding both axes — see `deskKey`'s note. */
function surveyRestShape(sv, p = params, patch = patching()) {
  return deskKey(p, patch, [sv.x.key, sv.y.key]);
}

function queueSurvey(sv, { grid }) {
  if (!studyScheduler) return;
  const { needed, carried } = surveyContents(sv);
  const restShape = surveyRestShape(sv, sv.stance, sv.patch);
  const specs = rowsFor(sv, { needed, carried, restShape, id: SURVEY_ID });
  // Enqueue order is where the round-robin starts, so it is what decides which
  // ground is measured first (FR-010). On the coarse pass there is nothing to
  // rank — no reading exists yet — so rows go in as declared. On the densify
  // every row is scored by the best of the positions it would fill: steepest
  // ground first, then ground nearest the stance, which is where three
  // separate readings on this sheet refuse until the lattice is dense.
  if (sv.points.size) {
    const priority = new Map();
    for (const want of refineOrder(sv, { stance: sv.positionOf(sv.stance) })) {
      priority.set(want.iy, Math.max(priority.get(want.iy) ?? -Infinity, want.score));
    }
    specs.sort((left, right) => (priority.get(right.iy) ?? -Infinity) - (priority.get(left.iy) ?? -Infinity));
  }
  surveyRows.clear();
  surveyEnqueueing = true;
  try {
    for (const spec of specs) {
      const job = makeStudyJob(spec);
      surveyRows.set(job.id, spec.iy);
      studyScheduler.enqueue(job);
    }
  } finally {
    surveyEnqueueing = false;
  }
  surveyPass = grid;
  studyScheduler.drain();
}

/**
 * Take every landed sample of one row onto the ground.
 *
 * Walked rather than indexed, because `onUpdate('point')` says a point landed
 * and not which one, and a row is nine entries. Positions already carrying a
 * spot height are left alone; a gap is re-landed, so a densify that finally
 * reaches a position the coarse pass failed on records the run rather than the
 * old refusal.
 */
function absorbSurveyRow(job) {
  const iy = surveyRows.get(job.id);
  if (survey === null || iy === undefined) return;
  for (let ix = 0; ix < job.curve.length; ix += 1) {
    const point = job.curve[ix];
    if (!point) continue;
    // A position already carrying a run is left alone; a gap is re-landed, so
    // a densify that finally reaches a position the coarse pass failed on
    // records the run rather than the old refusal.
    const already = survey.at(ix, iy);
    if (already instanceof SpotHeight) continue;
    landPoint(survey, {
      ix,
      iy,
      sample: point.sample ?? null,
      // The run this figure came from, by the scheduler's own identity, so a
      // spot height can be traced to it rather than merely believed.
      cacheKey: point.sample
        ? sampleIdentity(job, job.points[ix], point.sample.carried).exact
        : null,
      floorArea: point.sample?.meterBasis?.floorArea ?? null,
    });
  }
}

/**
 * A survey row landing, and what the desk does about it.
 *
 * Returns true where the event was a survey's, so `onStudyUpdate` can leave
 * every study path below it untouched — a survey row must never draw a study
 * card, and `job.key` is a real control key, so without this gate every row
 * would put a curve under axis X's control and the last row to land would win.
 */
function onSurveyUpdate(job, event) {
  if (job?.origin !== 'survey') return false;
  if (event === 'point') {
    absorbSurveyRow(job);
    // Off the real event and nothing else: the marker fills when a ground has
    // actually measured a design, not when a chooser was opened or a button
    // pressed. There is no Next button on this sheet and this step does not
    // get one — that would be the onboarding taking the reader's word for it,
    // which is the one thing this page never does.
    if (survey && coverageOf(survey).measured > 0) tour?.note('survey');
    renderSurvey();
    return true;
  }
  if (event === 'done' || event === 'failed') {
    absorbSurveyRow(job);
    surveyRows.delete(job.id);
    if (!surveyRows.size) onSurveyPassDone();
    renderSurvey();
    return true;
  }
  if (event === 'cancelled') {
    surveyRows.delete(job.id);
    // A global Set-aside suppresses the ground the way a per-study Stop does,
    // or the next idle refine would quietly restart the work just shed. Only
    // where there is still a ground to suppress: a cancel that arrives after
    // `closeSurvey` has nothing to take a rest shape of.
    if (job.cancelled === 'shed' && survey) surveyStop = surveyRestShape(survey);
    if (!surveyRows.size) surveyPass = null;
    renderSurvey();
    return true;
  }
  return false;
}

/**
 * The coarse pass has landed. Refine, once, and then stop.
 *
 * Two passes and no more, because the coarse grid is a strict subset of the
 * fine one and a third would have no such relationship to either: the reuse
 * that makes a densify cost only its new runs is a property of 5 against 9,
 * not of refinement in general.
 */
function onSurveyPassDone() {
  const wasCoarse = surveyPass === COARSE_GRID;
  surveyPass = null;
  if (!survey || !wasCoarse) return;
  if (!autoOn() || linkAttachPending) return;
  if (surveyStop === surveyRestShape(survey)) return;
  // In idle time, by the rule `densifyStudies` follows: the queue has just
  // drained and the reader may be reaching for a control this instant.
  //
  // **With a timeout, which `densifyStudies` does not have and probably
  // should.** Chrome defers `requestIdleCallback` indefinitely in a
  // backgrounded tab: measured here, a coarse ground landed and the densify
  // simply never ran — no error, no symptom, a survey that stayed at 36 of 36
  // for as long as anybody watched. The timeout is the API's own answer to
  // that, and a two-second ceiling is far outside the window where the reader
  // is still reaching for the control this defers around.
  const later = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 300);
  later(() => refineSurvey());
}

/**
 * Densify the ground from the coarse pass to the fine one.
 *
 * The coarse positions come back from the sample cache, so this costs only the
 * new runs — 56 of the 81, the other 25 having been solved already. The order
 * they go in is `refineOrder`'s, steepest and nearest the stance first, so the
 * ground that can still move a contour is measured before the ground that
 * cannot.
 */
function refineSurvey() {
  if (!survey || !studyScheduler || !autoOn() || gesture || linkAttachPending) return;
  if (surveyPass !== null) return;
  if (surveyStop === surveyRestShape(survey)) return;
  const refined = makeSurvey({
    x: axisFor(survey.x.key, { from: survey.x.from, to: survey.x.to, count: FINE_GRID, stance: survey.stance }),
    y: axisFor(survey.y.key, { from: survey.y.from, to: survey.y.to, count: FINE_GRID, stance: survey.stance }),
    readings: survey.readings,
    stance: survey.stance,
    patch: survey.patch,
    annual: survey.annual,
    epw: survey.epw,
  });
  // Carry every coarse reading across by position rather than by index: the
  // fine grid holds the coarse one, so each coarse position has a fine index,
  // and re-landing them here is what keeps the drawing standing through the
  // densify instead of blanking and rebuilding under the reader.
  for (const point of survey.points.values()) {
    const x = survey.x.positions[point.ix];
    const y = survey.y.positions[point.iy];
    const ix = refined.x.indexOf(x);
    const iy = refined.y.indexOf(y);
    if (ix === -1 || iy === -1) continue;
    // Rebuilt through the constructors rather than cloned off the prototype.
    // A clone would carry the same readings under a different pair of indices
    // and would not be frozen, which is a `SpotHeight` in every respect except
    // the invariant that makes it one — and the whole argument for that class
    // is that there is no path to an instance of it except a completed run.
    landPoint(refined, {
      ix,
      iy,
      sample: point.readings ? { readings: point.readings } : null,
      reason: point.reason ?? null,
      floorArea: point.floorArea ?? null,
      cacheKey: point.cacheKey ?? null,
    });
  }
  survey = refined;
  surveyGrid = FINE_GRID;
  queueSurvey(survey, { grid: FINE_GRID });
  renderSurvey();
}

/**
 * Cut a fresh ground through the desk as it stands.
 *
 * Refused whole rather than half opened, by the rule every refusal here
 * follows: an axis that cannot be swept, a channel that prices rather than
 * shapes, a reading this desk cannot answer. `axisFor` and `makeSurvey` throw
 * for the first two and the offer roster answers the third.
 */
function openSurvey({ xKey, yKey, readingIds, extents = {}, count = COARSE_GRID }) {
  if (!studyScheduler) return;
  const stance = { ...params };
  const patch = patching();
  const readings = readingIds.map((id) => {
    const reading = READING_BY_ID[id];
    if (!reading) throw new Error(`no survey reading is declared as "${id}"`);
    return reading;
  });
  const cut = makeSurvey({
    x: axisFor(xKey, { ...(extents[xKey] ?? {}), count, stance }),
    y: axisFor(yKey, { ...(extents[yKey] ?? {}), count, stance }),
    readings,
    stance,
    patch,
    annual: Boolean(epwText),
    epw: epwText ?? null,
  });
  const refusal = surveyRefusal(cut);
  if (refusal) {
    closeSurvey();
    surveyRefused = refusal;
    renderSurvey();
    return;
  }
  surveyRefused = null;
  surveyStop = null;
  cancelSurveyJobs('moved');
  survey = cut;
  renderSurvey();
  // Gated on the same switch the studies are, and it says which of the three
  // it is waiting on rather than standing there apparently inert (FR-014). A
  // sample built during a link attach would fatal on zero environments, and
  // the button gate does not cover this path.
  const waiting = !autoOn()
    ? 'Auto-solve is off, so nothing is measured yet. Turn it on, or run the sheet by hand.'
    : linkAttachPending
      ? 'A link is still attaching. The ground is measured as soon as its station lands.'
      : stationAttaching
        ? 'A station is still attaching. The ground is measured against the new climate once it lands.'
        : null;
  if (waiting) surveySay(waiting);
  else {
    surveyGrid = count;
    queueSurvey(survey, { grid: count });
  }
  updatePermalink();
}

function cancelSurveyJobs(reason) {
  if (!studyScheduler) return;
  for (const id of [...surveyRows.keys()]) studyScheduler.cancel(id, reason);
  surveyRows.clear();
  surveyPass = null;
}

/**
 * Take the ground down. Touches no parameter: a survey never moved one.
 *
 * **The traverse is kept unless the caller says otherwise**, and the
 * distinction is the same one `clearAllStudies` draws from Revert all. Taking
 * a drawing down is not a claim that the designs the reader stood on were
 * wrong, and the traverse is a record of the desk rather than of the survey —
 * it is written by `commit`, from every control on the sheet. Only a station
 * change invalidates it, because then every reading taken at every stop is of
 * another city's weather (FR-052).
 *
 * The pull goes with the ground either way: its ranking is taken at a stance
 * against a reading the ground was cut for, and it is drawn inside E-02.
 */
function closeSurvey({ forgetTraverse = false } = {}) {
  cancelSurveyJobs('cleared');
  for (const id of [...pullJobs.keys()]) studyScheduler?.cancel(id, 'cleared');
  pullJobs.clear();
  pullLanded.clear();
  pullFinished.clear();
  pullStance = null;
  survey = null;
  surveyStop = null;
  groundCursor = null;
  if (forgetTraverse) traverse.length = 0;
  renderSurvey();
  updatePermalink();
}

/* ── E-02, drawn ─────────────────────────────────────────────────────────── */

/** Every control a ground may be cut along, with its refusal where it has one. */
function axisOffers(snapshot = params, patch = patching()) {
  const state = channelState(snapshot, patch);
  const offers = [];
  for (const channel of CHANNELS) {
    if (channel.prices) continue; // nothing it owns reaches the IDF
    const engaged = state.get(channel.id)?.engaged;
    for (const control of channel.controls) {
      const sides = control.kind === 'facade' ? control.sides : [null];
      // A control with no numeric face is listed and greyed with the sentence
      // the studies refuse it with, rather than omitted (FR-003).
      //
      // The studies omit it, and that is right there: `buildPattern` and
      // `buildDays` register no row, so no Study button is drawn at all —
      // there is no offer to grey and no legend line to grey it with. A
      // chooser is a different surface. It is an explicit list of what a
      // ground may be cut along, and a control absent from that list reads as
      // one the desk does not have, where a greyed one with its reason reads
      // as what it is. `refusesSweep` is the same predicate `samplePoints`
      // throws with, so the sentence a reader meets here is the sentence the
      // model would give them.
      const faceless = refusesSweep(control);
      for (const side of sides) {
        const key = side ? side.key : control.key;
        const channelOut = !faceless && !engaged;
        const reason = faceless
          ? null
          : !engaged
            ? `Patch ${channel.name} in; with it out of the path this control reaches no object.`
            : control.inert?.(snapshot)
              ? control.note
              : side && !side.reaches(snapshot)
                ? side.reasonFor(snapshot)
                : null;
        offers.push({
          key,
          channel,
          control,
          side,
          // A faceless control owns its key under a kind `controlFor` resolves
          // but `labelFor` may name oddly, so the declaration's own label is
          // the fallback.
          label: faceless ? (control.label ?? key) : labelFor(key),
          available: !faceless && !reason,
          reason,
          // True where the whole channel is out of the path, so the sentence
          // is one channel's rather than one control's.
          channelOut,
          // Refused because the control has no numeric face at all, rather
          // than because of anything about this desk. Carried as a flag rather
          // than as a sentence: the sentence is the same for all thirty-nine
          // of them and is printed once over the group.
          faceless: Boolean(faceless),
        });
      }
    }
  }
  return offers;
}

/** Every reading a ground may be surveyed for, against this desk's own offers. */
function surveyReadingOffers(snapshot = params, patch = patching(), epw = epwText ?? null) {
  const offers = studyOffers(snapshot, patch, epw);
  return SURVEY_READINGS.map((reading) => {
    const offer = offers.find((candidate) => candidate.quantity.id === reading.quantity.id);
    return {
      reading,
      available: offer.available,
      reason: offer.available ? null : `${offer.reason} ${offer.fix}`,
    };
  });
}

/**
 * One chooser of offers, closed reading what is selected.
 *
 * Drawn as a title-block cell: its caption, how many offers it holds, and the
 * value with its fold marker. The count is of what can be chosen *at this
 * desk*, with the whole list beside it where some are refused — "129
 * controls" over a list of which 37 can be picked would be the cell claiming
 * a choice the reader does not have.
 *
 * Pressing the value turns it into the box you type in, with the whole list
 * standing under it until a word is typed. Closed, the value is a button
 * rather than an input holding the selection, because two readings can stand
 * in one cell and an input does not wrap. Not a `details`: a text field
 * inside a `summary` is a field whose Space key toggles the disclosure in
 * some engines.
 */
function pickList({ label, noun, summary, placeholder, options, selected, onPick, multiple = false }) {
  const cell = el('div', 'survey-pick survey-combo');
  cell.dataset.pick = label;
  const head = el('div', 'survey-pick-head');
  const open = options.filter((option) => option.available).length;
  const count = open === options.length ? `${open} ${noun}` : `${open} of ${options.length} ${noun}`;
  const opener = el('button', 'survey-pick-open');
  opener.type = 'button';
  const sign = el('span', 'survey-pick-sign', '+');
  sign.setAttribute('aria-hidden', 'true');
  opener.append(el('span', 'survey-pick-value', summary || placeholder), sign);
  // The caption is lettered outside the button, so it is said inside it too:
  // "Choose a control" read aloud does not say which axis.
  opener.setAttribute('aria-label', `${label}: ${summary || placeholder}`);
  opener.setAttribute('aria-expanded', 'false');
  const field = el('input', 'survey-pick-field');
  field.hidden = true;
  const closer = el('button', 'survey-pick-close', '−');
  closer.type = 'button';
  closer.hidden = true;
  closer.setAttribute('aria-label', `Close the ${noun} for ${label}`);
  head.append(el('b', null, label), el('span', 'survey-pick-count', count), opener, field, closer);
  cell.append(head);
  const list = el('div', 'survey-options');
  list.hidden = true;
  list.id = `survey-options-${label.toLowerCase().replace(/\W+/g, '-')}`;
  // Every row with the words it can be found by and the heading it stands
  // under, so the filter can hide a heading once nothing beneath it matches.
  // The channel's name is among a row's words: "fabric" is how a reader who
  // knows where a control lives but not what it is called would look for it.
  const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const rows = [];
  const heads = [];
  let under = null;
  const draw = (option) => {
    const button = el('button', 'survey-option');
    button.type = 'button';
    const on = multiple ? selected.includes(option.id) : selected === option.id;
    button.setAttribute('aria-pressed', String(on));
    if (!option.available) {
      button.disabled = true;
      // In place, not on hover: `pointer: coarse` has no hover, so a reason
      // that only floats does not exist on the phone this is most read on.
      // A control with no numeric face carries none of its own — the sentence
      // is identical for all of them and is printed once over the group.
      button.append(el('span', null, option.label));
      if (option.reason) button.append(el('small', null, option.reason));
    } else {
      button.append(el('span', null, option.label));
      if (option.note) button.append(el('small', null, option.note));
      button.addEventListener('click', (event) => {
        onPick(option.id);
        // A pick redraws the chooser, which takes the focused row with it and
        // drops a keyboard reader on the body. `detail` is 0 for a key press
        // and a click count otherwise, so only a keyed pick is handed back to
        // the cell it was made in.
        if (event.detail === 0) {
          $('survey-choose')
            .querySelector(`[data-pick="${label}"] .survey-pick-open`)
            ?.focus();
        }
      });
    }
    list.append(button);
    // Each word whole and in its parts, so "fact" finds U-factor as well as
    // "u-fact" does.
    const text = fold(`${under?.dataset.group ?? ''} ${option.label} ${option.note ?? ''}`);
    const words = text.split(/\s+/).flatMap((word) => [word, ...word.split(/[^\p{L}\p{N}]+/u)]);
    rows.push({ button, head: under, words: words.filter(Boolean) });
  };

  /**
   * A heading for one run of options, carrying whatever is true of all of
   * them.
   *
   * This is the design system's own rule — explain it in printed body text at
   * the head of the block it belongs to, one sentence covering every copy of
   * the control — applied twice, because the chooser broke it twice. A channel
   * that is out of the path refuses every control it owns for one reason, and
   * a control with no numeric face is refused by one rule shared with the
   * other thirty-eight. Written per entry, those were 53 rows each repeating a
   * whole paragraph, which is a list nobody can read down.
   */
  const heading = (name, note) => {
    const head = el('div', 'survey-options-group');
    head.append(el('b', null, name));
    if (note) head.append(el('small', null, note));
    head.dataset.group = name;
    list.append(head);
    heads.push(head);
    under = head;
  };

  // Controls with a face first, grouped by the channel that owns them, in
  // channel order. Controls with no numeric face at all go last under one
  // statement of the rule — they stay in the list rather than being omitted,
  // because a control absent from a chooser reads as one the desk does not
  // have.
  const faceless = options.filter((option) => option.faceless);
  let group = null;
  for (const option of options) {
    if (option.faceless) continue;
    if (option.group && option.group !== group) {
      group = option.group;
      heading(group, option.groupReason);
    }
    draw(option);
  }
  if (faceless.length) {
    heading(
      `${faceless.length} controls with no face`,
      'A selector, a bearing, a daily profile or a list of dates carries no minimum, maximum or ' +
        'step, so there is nothing to sweep along and no ground to cut. That is the same rule a ' +
        'study is refused by.',
    );
    for (const option of faceless) draw(option);
  }

  // Typing filters. 129 rows is a list read by scrolling only if the reader
  // does not already know the name, and usually they do. Every word typed has
  // to begin one of a row's words, in any order, so "glaz s" finds Glazing S.
  // Begin, not appear anywhere: matched inside words, the lone "s" of that
  // query found Visible transmittance and Panes, which is a filter that has
  // stopped filtering. A refused row that matches stays in the list,
  // refused, for the reason the unfiltered list keeps it: a control missing
  // from a chooser reads as one the desk does not have.
  field.type = 'text';
  // What is held, in ghost ink, so the box opens empty without hiding the
  // selection it is about to replace.
  field.placeholder = summary || `Type to filter ${noun}`;
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('role', 'combobox');
  field.setAttribute('aria-autocomplete', 'list');
  field.setAttribute('aria-expanded', 'true');
  field.setAttribute('aria-label', `Filter the ${noun} for ${label}`);
  field.setAttribute('aria-controls', list.id);
  const none = el('p', 'survey-filter-none');
  none.hidden = true;
  list.append(none);

  const apply = () => {
    const terms = fold(field.value).split(/\s+/).filter(Boolean);
    const shown = new Set();
    let matches = 0;
    for (const row of rows) {
      const match = terms.every((term) => row.words.some((word) => word.startsWith(term)));
      row.button.hidden = !match;
      if (match) {
        matches += 1;
        shown.add(row.head);
      }
    }
    for (const group of heads) group.hidden = !shown.has(group);
    // Said, not left as an empty box: an empty list under a filter reads as a
    // chooser that failed to draw.
    none.hidden = matches > 0;
    none.textContent = matches ? '' : `No ${noun} match “${field.value.trim()}”.`;
    list.scrollTop = 0;
  };
  const pickable = () => rows.filter((row) => !row.button.hidden && !row.button.disabled).map((row) => row.button);

  // Open is one state carried by four elements, so it is set in one place.
  // Closing empties the box, so a cell reopened shows the whole list again: a
  // filter left standing from last time would open onto four rows with
  // nothing saying the other 125 were hidden on purpose.
  const show = (on) => {
    cell.classList.toggle('open', on);
    list.hidden = !on;
    field.hidden = !on;
    closer.hidden = !on;
    opener.hidden = on;
    opener.setAttribute('aria-expanded', String(on));
    if (!on && field.value) {
      field.value = '';
      apply();
    }
  };
  // Whatever takes the focus is shown and focused *before* whatever gives it
  // up is hidden. The other way round, a click on the value opened nothing:
  // the click had focused the opener, `show` hid it, and `focus()`'s own
  // style update found the focused element gone and blurred it with no
  // relatedTarget, which the focusout below reads as the reader leaving — so
  // the cell closed inside the click that opened it, before the field could
  // take the focus. Only a real pointer finds this: a page without window
  // focus fires no focus events, and a scripted `.click()` opened every time.
  const openCell = () => {
    if (!list.hidden) return;
    field.hidden = false;
    field.focus();
    show(true);
  };
  const closeCell = (refocus) => {
    if (refocus) {
      opener.hidden = false;
      opener.focus();
    }
    show(false);
  };

  // A letter typed on the closed cell, or on a row, lands in the box: the
  // reader should not have to find the box before they can use it. Space is
  // left alone, because on the value it is the key that opens the cell and on
  // a row it is the key that picks it.
  const printable = (event) =>
    event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;
  const typeInto = (event) => {
    event.preventDefault();
    openCell();
    field.value += event.key;
    apply();
    field.focus();
  };

  opener.addEventListener('click', openCell);
  opener.addEventListener('keydown', (event) => {
    if (printable(event)) typeInto(event);
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      openCell();
    }
  });
  // The caption and the count are part of the cell a finger lands on, and a
  // press on them that did nothing would make the cell's own edge a lie.
  head.addEventListener('click', (event) => {
    if (event.target === head || event.target.matches('b, .survey-pick-count')) openCell();
  });
  closer.addEventListener('mousedown', (event) => event.preventDefault());
  closer.addEventListener('click', () => closeCell(true));
  // A press on a row or on the list's scroll must not take the focus out of
  // the box, or the focusout below would close the list under the pointer
  // before the click it is part of could land.
  list.addEventListener('mousedown', (event) => event.preventDefault());
  // Leaving the cell closes it, the way a field is left: nothing on this
  // sheet stays open over the drawing once the reader has gone elsewhere.
  cell.addEventListener('focusout', (event) => {
    if (!list.hidden && !cell.contains(event.relatedTarget)) closeCell(false);
  });

  field.addEventListener('input', apply);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      pickable()[0]?.focus();
    } else if (event.key === 'Enter') {
      // Enter picks only when the filter has left exactly one choice. With
      // several, nothing on the list says which is first, so picking one would
      // be a guess about what the reader meant; the focus moves to the list
      // instead and the next Enter is theirs.
      event.preventDefault();
      const left = pickable();
      if (left.length === 1) left[0].click();
      else left[0]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (field.value) {
        field.value = '';
        apply();
      } else {
        closeCell(true);
      }
    }
  });
  list.addEventListener('keydown', (event) => {
    if (printable(event)) {
      typeInto(event);
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!step && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape') {
      field.focus();
      return;
    }
    const left = pickable();
    const next = left.indexOf(document.activeElement) + step;
    if (next < 0) field.focus();
    else left[Math.min(next, left.length - 1)]?.focus();
  });

  cell.append(list);
  return cell;
}

/** What the chooser is currently holding, so a half-made survey survives a redraw. */
let surveyChoice = { x: null, y: null, readings: [], extents: {} };

/** The chooser's extents with one axis's entry dropped, when that axis changes. */
const withoutExtent = (choice, which) => {
  const key = choice[which];
  if (!key) return choice.extents ?? {};
  const { [key]: gone, ...rest } = choice.extents ?? {};
  void gone;
  return rest;
};

/**
 * Swap the two axes, between the two pickers it swaps.
 *
 * Here rather than up in the head's act row because it is a gesture *about*
 * these two controls, and the head's acts — Let it fall, Clear the survey —
 * are about the ground as a whole. It sits where the reader's eye already is
 * when they decide the ground is the wrong way round.
 *
 * The label names what it does rather than what it is: a bare glyph would be
 * the unnamed-verb problem the design system writes about, and the same
 * sentence rides the `title` so it is read aloud as well as seen.
 */
function flipButton() {
  const wrap = el('div', 'survey-pick survey-flip');
  const { x, y } = surveyChoice;
  if (!x || !y) return wrap;
  const button = el('button', 'link', 'Flip axes');
  button.type = 'button';
  button.title =
    `Cut the same ground the other way round: ${labelFor(y)} across and ${labelFor(x)} up. ` +
    'Every position has already been run, so this costs no simulation.';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => flipSurveyAxes());
  wrap.append(button);
  return wrap;
}

/**
 * The two boxes that narrow one axis (FR-006).
 *
 * `axisFor`, `openSurvey` and the `sv` codec have carried `from` and `to`
 * since the ground was first cut; until now nothing on the page set them, so
 * an extent could only be narrowed by editing a link by hand.
 *
 * Two `quantityField`s rather than a second pair of sliders, and for the
 * reason the sheet's dimensions grew one: an extent is an exact figure a
 * reader arrives with — *survey the glazing between a fifth and a half* — and
 * a slider across two hundred pixels cannot say a fifth. The parsing, the
 * clamping to the control's own stops and the snapping to its step are
 * `Ruled.parse`'s, so the boxes accept exactly what the control can hold and
 * refuse the rest whole, the way a bad link is refused.
 *
 * Narrowing is a re-cut, not a filter: the ground is measured over the extent
 * it was asked for, so the samples inside the old extent are reused from the
 * cache and only the new positions cost a run.
 */
function extentField(which) {
  const key = surveyChoice[which];
  const wrap = el('div', 'survey-pick survey-extent');
  if (!key) return wrap;
  const { control } = controlFor(key);
  const held = surveyChoice.extents?.[key] ?? {};
  const from = held.from ?? control.min;
  const to = held.to ?? control.max;

  const set = (edge, value) => {
    const next = { from, to, [edge]: value };
    // An extent that is not an extent is refused where it is typed rather than
    // thrown from `axisFor` a moment later, because the box is where the reader
    // can see what they did. The old value comes back, as it does for anything
    // else the field cannot hold.
    if (!(next.to > next.from)) {
      surveySay(
        `An extent runs from a lower figure to a higher one, and ${formatValue(key, next.from)} to ` +
          `${formatValue(key, next.to)} does not.`,
      );
      renderSurveyChoose();
      return;
    }
    surveyChoice = {
      ...surveyChoice,
      extents: { ...(surveyChoice.extents ?? {}), [key]: { from: next.from, to: next.to } },
    };
    cutFromChoice();
  };

  const head = el('b', null, `Extent · ${labelFor(key)}`);
  const line = el('div', 'survey-extent-pair');
  for (const [edge, value] of [['from', from], ['to', to]]) {
    const field = quantityField({
      control,
      name: `${labelFor(key)} ${edge}`,
      read: () => value,
      write: (v) => set(edge, v),
    });
    // Lettered on the way in. `quantityField` writes nothing until something
    // asks it to — every other caller on this sheet calls `show()` from its own
    // redraw — so a field built and appended alone stands empty, which is what
    // these two did.
    field.show();
    line.append(field.node);
    if (edge === 'from') line.append(el('span', 'survey-extent-rule', 'to'));
  }
  wrap.append(head, line);
  return wrap;
}

/**
 * What the chooser was last drawn against, so it is not rebuilt for nothing.
 *
 * `renderSurvey` runs on every landed sample — a hundred and forty-four times
 * over one ground — and the chooser is 129 offers and four fields. Rebuilt
 * each time, the cost is the smaller half of the problem: `host.textContent =
 * ''` **destroys the node the reader is typing into**, so an extent typed
 * while the ground fills loses its focus, its `took` value and therefore the
 * keystrokes, and the box silently commits nothing. `field.js` guards its own
 * `show()` against a redraw writing over a field; nothing can guard a field
 * against being deleted.
 *
 * So the chooser is redrawn only when something it draws has actually moved:
 * the selection, or the desk the offers are measured against.
 */
let chooserDrawn = null;

function renderSurveyChoose() {
  const host = $('survey-choose');
  const signature = JSON.stringify([surveyChoice, shapeKey(params), Boolean(epwText)]);
  if (chooserDrawn === signature) return;
  chooserDrawn = signature;
  host.textContent = '';
  const axes = axisOffers();
  const readings = surveyReadingOffers();
  const named = (key) => (key ? labelFor(key) : '');

  const axisOptions = (other) =>
    axes.map((offer) => ({
      id: offer.key,
      // No channel prefix: the channel is the group heading above the run of
      // controls that belong to it, so repeating it on every row is the same
      // noise as repeating the channel's refusal on every row.
      label: offer.label,
      group: offer.channel.name,
      // Stated once by the group where it is true of the whole channel; the
      // per-entry `reason` below is for what differs *within* one — a wall
      // that can carry no opening, a control inert at this desk.
      groupReason: offer.channelOut ? offer.reason : null,
      // The one refusal that is about the pair rather than about the control:
      // a ground cut along one control twice is a line drawn twice.
      available: offer.available && offer.key !== other,
      reason:
        offer.key === other
          ? 'This control is already the other axis, and a ground needs two.'
          : offer.channelOut
            ? null
            : offer.reason,
      faceless: offer.faceless,
    }));

  host.append(
    pickList({
      label: 'Axis X',
      noun: 'controls',
      summary: named(surveyChoice.x),
      placeholder: 'Choose a control',
      options: axisOptions(surveyChoice.y),
      selected: surveyChoice.x,
      onPick: (key) => {
        // A different control brings a different range with it, so the extent
        // the reader set on the old one cannot be carried across: 0.2 to 0.9
        // means nothing on an axis running 4 to 40.
        surveyChoice = { ...surveyChoice, x: key, extents: withoutExtent(surveyChoice, 'x') };
        syncSurveyAxes();
        cutFromChoice();
      },
    }),
    extentField('x'),
    flipButton(),
    pickList({
      label: 'Axis Y',
      noun: 'controls',
      summary: named(surveyChoice.y),
      placeholder: 'Choose a control',
      options: axisOptions(surveyChoice.x),
      selected: surveyChoice.y,
      onPick: (key) => {
        surveyChoice = { ...surveyChoice, y: key, extents: withoutExtent(surveyChoice, 'y') };
        syncSurveyAxes();
        cutFromChoice();
      },
    }),
    extentField('y'),
    pickList({
      label: 'Reading',
      noun: 'readings',
      summary: surveyChoice.readings.map((id) => READING_BY_ID[id].label).join(' + '),
      placeholder: 'Choose a reading',
      options: readings.map((offer) => ({
        id: offer.reading.id,
        label: offer.reading.label,
        note: offer.available ? offer.reading.unit : null,
        available: offer.available,
        reason: offer.reason,
      })),
      selected: surveyChoice.readings,
      multiple: true,
      onPick: (id) => {
        const held = surveyChoice.readings;
        // Two is the ceiling and the third press replaces the second rather
        // than being refused: a reader adding a third reading has said which
        // two they now want, and a refusal here would be the interface
        // arguing with a gesture it understood perfectly well.
        const next = held.includes(id)
          ? held.filter((other) => other !== id)
          : held.length < 2
            ? [...held, id]
            : [held[0], id];
        surveyChoice = { ...surveyChoice, readings: next };
        cutFromChoice();
      },
    }),
  );
}

/**
 * Name one axis from a plan key's legend, and cut when both are named.
 *
 * The console's offer fills the chooser rather than cutting a ground on its
 * own, because a ground needs two controls and the second one — with the
 * extent and the reading — is chosen on E-02. Pressing an armed offer takes
 * that axis off again, which is what makes the button a switch rather than a
 * one-way trigger.
 */
function nameSurveyAxis(key) {
  const { x, y } = surveyChoice;
  // An axis leaving takes its extent with it: a range is a fact about one
  // control's face and means nothing on another's.
  if (x === key) surveyChoice = { ...surveyChoice, x: null, extents: withoutExtent(surveyChoice, 'x') };
  else if (y === key) surveyChoice = { ...surveyChoice, y: null, extents: withoutExtent(surveyChoice, 'y') };
  else if (!x) surveyChoice = { ...surveyChoice, x: key };
  else if (!y) surveyChoice = { ...surveyChoice, y: key };
  // Both taken: the newest press replaces the older axis, which is the same
  // rule the reading chooser follows. Refusing here would be the interface
  // arguing with a gesture it understood perfectly well.
  else surveyChoice = { ...surveyChoice, x: y, y: key, extents: withoutExtent(surveyChoice, 'x') };
  syncSurveyAxes();
  cutFromChoice();
  if (surveyChoice.x && surveyChoice.y && !surveyChoice.readings.length) {
    // Two axes and nothing to read them for. Say so where the reader is
    // looking, rather than leaving E-02 apparently inert.
    surveySay('Two axes named. Choose a reading on E-02 and the ground is cut.');
    $('survey').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
}

const syncSurveyAxes = () =>
  desk?.setSurveyAxes([surveyChoice.x, surveyChoice.y].filter(Boolean));

/** Cut a ground the moment the chooser holds enough to cut one. */
function cutFromChoice({ count = COARSE_GRID } = {}) {
  const { x, y, readings, extents } = surveyChoice;
  if (!x || !y || !readings.length) {
    renderSurvey();
    return;
  }
  openSurvey({ xKey: x, yKey: y, readingIds: readings, extents: extents ?? {}, count });
}

/**
 * Turn the ground ninety degrees.
 *
 * **It costs no engine runs at all**, and that is a property of the
 * arrangement rather than an optimisation. A sample's cache identity is the
 * whole desk — `deskKey({ ...snapshot, [key]: value }, patch)` — so the design
 * at glazing 0.3 against wall resistance 5 is the same design whichever of the
 * two the rows are cut along. Every measured point of a flipped ground is the
 * same desk transposed, so the whole thing comes back out of the cache the
 * scheduler already holds.
 *
 * Which is also why the flip re-cuts at the density the ground already had
 * rather than at the coarse pass: dropping a measured 12 x 12 to 7 x 7 and
 * climbing back out of it would be free in runs and expensive in what the
 * reader is looking at, for no reason but the default argument.
 *
 * The extents need no swapping — they are keyed by control, not by axis, which
 * is what makes a narrowed extent survive this and a change of axis drop it.
 */
function flipSurveyAxes() {
  const { x, y } = surveyChoice;
  if (!x || !y) return;
  surveyChoice = { ...surveyChoice, x: y, y: x };
  syncSurveyAxes();
  cutFromChoice({ count: surveyGrid });
}

/* The plan. Inline SVG, so every contour and every tick is a real node the
   page can letter, hit-test and read out. */

const GROUND_SIZE = 320;
// The bottom gutter carries two courses of type — the axis stops and the axis
// label — under a row of spot figures that at 12 x 12 reaches the frame edge,
// and a second reading puts a second figure under the first. Measured at the
// finest ground the desk can produce; below 42 the stops print through the
// bottom row.
const GROUND_PAD = { left: 44, right: 12, top: 14, bottom: 42 };

function groundFrame(sv) {
  const w = GROUND_SIZE - GROUND_PAD.left - GROUND_PAD.right;
  const h = GROUND_SIZE - GROUND_PAD.top - GROUND_PAD.bottom;
  const px = (ix) => GROUND_PAD.left + (sv.x.count === 1 ? w / 2 : (ix / (sv.x.count - 1)) * w);
  // Y grows up the page, as it does on a survey drawing and as it does not in
  // SVG, so the axis is flipped exactly once, here.
  const py = (iy) => GROUND_PAD.top + h - (sv.y.count === 1 ? h / 2 : (iy / (sv.y.count - 1)) * h);
  return { w, h, px, py };
}

/**
 * Draw the ground.
 *
 * Three states, told apart three ways, because colour may not be the only
 * carrier of a fact and here there is no colour to spend anyway:
 *
 *   - **measured** — a tick mark with its figure lettered beside it in the
 *     sheet's mono face. Every figure on this drawing is one of these.
 *   - **inferred** — a hairline contour with its level lettered at a turn.
 *     Nothing else on the page may be read off it, and the caption says so.
 *   - **unsurveyed** — bare sheet. No contour is carried across it, which is
 *     structural rather than styled: `contoursOf` emits nothing for a cell
 *     whose mask is not full, so there is no node to style into looking
 *     measured later.
 */
function drawGround(sv) {
  const host = $('survey-ground');
  host.textContent = '';
  const reading = sv.readings[0];
  const lattice = latticeOf(sv, reading);
  const { px, py } = groundFrame(sv);
  const root = svg('svg', {
    viewBox: `0 0 ${GROUND_SIZE} ${GROUND_SIZE}`,
    role: 'img',
    tabindex: '0',
    'aria-label': surveyAriaLabel(sv),
  });

  // The hatch the improving region is filled with. Hatching rather than a
  // wash: a tint would read as a fourth surface on a board that has four.
  const defs = svg('defs');
  const pattern = svg('pattern', {
    id: 'survey-hatch',
    width: 4,
    height: 4,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  pattern.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 4, stroke: 'var(--ink-ghost)', 'stroke-width': 0.6 }));
  defs.append(pattern);
  root.append(defs);

  /* ── axes, lettered with the controls' own names and stops ───────────── */
  const frame = groundFrame(sv);
  root.append(
    svg('line', {
      class: 'axis',
      x1: GROUND_PAD.left,
      y1: GROUND_PAD.top,
      x2: GROUND_PAD.left,
      y2: GROUND_PAD.top + frame.h,
    }),
    svg('line', {
      class: 'axis',
      x1: GROUND_PAD.left,
      y1: GROUND_PAD.top + frame.h,
      x2: GROUND_PAD.left + frame.w,
      y2: GROUND_PAD.top + frame.h,
    }),
  );
  // The stops carry a bare number and the axis label carries the unit, once,
  // which is how a survey drawing has always lettered a scale. Lettered on
  // both, `3.00 m²K/W` at the head of a 44px gutter simply ran off the left of
  // the frame and printed as `00 m²K/W` — a number that is not the reading and
  // not anything else either.
  const stop = (axis, value) => {
    const said = formatValue(axis.key, value);
    const unit = axis.control.unit;
    return unit && said.endsWith(unit) ? said.slice(0, -unit.length).trim() : said;
  };
  const axisTitle = (axis) => {
    const unit = axis.control.unit;
    return unit ? `${labelFor(axis.key)} · ${unit}` : labelFor(axis.key);
  };
  for (const [axis, along] of [[sv.x, 'x'], [sv.y, 'y']]) {
    const lo = axis.positions[0];
    const hi = axis.positions[axis.positions.length - 1];
    if (along === 'x') {
      const text = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left,
        y: GROUND_PAD.top + frame.h + 16,
        'text-anchor': 'start',
      });
      text.textContent = stop(axis, lo);
      const text2 = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left + frame.w,
        y: GROUND_PAD.top + frame.h + 16,
        'text-anchor': 'end',
      });
      text2.textContent = stop(axis, hi);
      const label = svg('text', {
        class: 'axis-label',
        x: GROUND_PAD.left + frame.w / 2,
        y: GROUND_PAD.top + frame.h + 30,
        'text-anchor': 'middle',
      });
      label.textContent = axisTitle(axis);
      root.append(text, text2, label);
    } else {
      const text = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left - 5,
        y: GROUND_PAD.top + frame.h,
        'text-anchor': 'end',
      });
      text.textContent = stop(axis, lo);
      const text2 = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left - 5,
        y: GROUND_PAD.top + 8,
        'text-anchor': 'end',
      });
      text2.textContent = stop(axis, hi);
      const label = svg('text', {
        class: 'axis-label',
        x: 11,
        y: GROUND_PAD.top + frame.h / 2,
        'text-anchor': 'middle',
        transform: `rotate(-90 11 ${GROUND_PAD.top + frame.h / 2})`,
      });
      label.textContent = axisTitle(axis);
      root.append(text, text2, label);
    }
  }

  /* ── the region where every reading improves, under everything ───────── */
  // Against where the desk is standing, not where the ground was cut, and
  // through `standingAt` rather than `positionOf` so a desk between two
  // measured designs is told apart from one outside the extent entirely.
  const here = sv.standingAt(params);
  const region = improvingRegion(sv, here);
  for (const spot of region.spots) {
    root.append(
      svg('rect', {
        class: 'improving',
        x: px(spot.ix) - 5,
        y: py(spot.iy) - 5,
        width: 10,
        height: 10,
      }),
    );
  }

  /* ── contours: inference, never lettered from ────────────────────────── */
  const levels = levelsFor(lattice);
  // Seeded with where the spot figures will stand, not empty. A contour label
  // only tested against other contour labels overprinted the measured figures,
  // which is the worst of the two collisions available: the spot heights are
  // the only figures on this drawing that mean anything, and a level lettered
  // over one hides a measurement behind an inference.
  const dense = sv.x.count > 7 || sv.y.count > 7;
  const figureAt = (spot) =>
    !dense || (spot.ix % 2 === 0 && spot.iy % 2 === 0) ? [px(spot.ix), py(spot.iy) - 5] : null;
  const lettered = sv
    .spots()
    .map(figureAt)
    .filter(Boolean);
  for (const { level, segments } of contoursOf(lattice, levels)) {
    // Every fifth line heavier, the way a contoured plan has always ranked its
    // interval, so the eye can count without reading every figure.
    const major = Math.round(level / (levels[1] - levels[0] || 1)) % 5 === 0;
    for (const [a, b] of segments) {
      root.append(
        svg('line', {
          class: major ? 'contour major' : 'contour',
          x1: px(a[0]),
          y1: py(a[1]),
          x2: px(b[0]),
          y2: py(b[1]),
        }),
      );
    }
    // The level, lettered once at a turn of its own line, which is where a
    // contour carries its value on a survey drawing — but only where the
    // figure has room to stand. A label per level placed blind collided with
    // the spot figures and with the other levels, and a drawing whose figures
    // overprint one another is a drawing that cannot be read at all. So each
    // candidate turn is tested against what has already been lettered and the
    // line simply goes unlabelled where nothing clears; the schedule below
    // carries every measured figure regardless.
    const clears = (at) =>
      lettered.every((prior) => Math.hypot(prior[0] - at[0], prior[1] - at[1]) > 26);
    const candidates = segments
      .map((segment) => [px(segment[0][0]), py(segment[0][1])])
      .filter((at) => at[0] > GROUND_PAD.left + 14 && at[0] < GROUND_PAD.left + frame.w - 14);
    const at = candidates.find(clears);
    if (at) {
      lettered.push(at);
      const text = svg('text', { class: 'level', x: at[0], y: at[1] - 3, 'text-anchor': 'middle' });
      text.textContent = level.toFixed(reading.digits);
      root.append(text);
    }
  }

  /* ── the traverse, where the desk has already stood ──────────────────── */
  //
  // A chain of ghost marks joined by a hairline, with the current stop
  // carrying the armed square — which is the stance mark below, so the two are
  // one idiom rather than two. Each earlier stop is restorable: a click puts
  // the desk back exactly where it was, params and patch together.
  if (traverse.length > 1) {
    const stops = traverse
      .map((visit) => ({
        stop: visit,
        ix: sv.x.indexOf(visit.params[sv.x.key]),
        iy: sv.y.indexOf(visit.params[sv.y.key]),
      }))
      .filter((at) => at.ix !== -1 && at.iy !== -1);
    if (stops.length > 1) {
      root.append(
        svg('polyline', {
          class: 'traverse',
          points: stops.map((at) => `${px(at.ix)},${py(at.iy)}`).join(' '),
        }),
      );
      for (const at of stops.slice(0, -1)) {
        const mark = svg('g');
        mark.append(svg('circle', { class: 'traverse-stop', cx: px(at.ix), cy: py(at.iy), r: 1.6 }));
        const title = svg('title');
        title.textContent = `Stood here earlier — ${formatValue(sv.x.key, sv.x.positions[at.ix])} by ${formatValue(sv.y.key, sv.y.positions[at.iy])}. Click to go back to it.`;
        mark.append(title);
        const hit = svg('rect', {
          x: px(at.ix) - 10,
          y: py(at.iy) - 10,
          width: 20,
          height: 20,
          fill: 'transparent',
          style: 'cursor: pointer',
        });
        hit.addEventListener('click', () => restoreTraverse(at.stop));
        mark.append(hit);
        root.append(mark);
      }
    }
  }

  /* ── spot heights: the only thing on this drawing carrying a figure ──── */
  for (const spot of sv.spots()) {
    const x = px(spot.ix);
    const y = py(spot.iy);
    const mark = svg('g');
    mark.append(
      svg('line', { class: 'spot', x1: x - 2.5, y1: y, x2: x + 2.5, y2: y }),
      svg('line', { class: 'spot', x1: x, y1: y - 2.5, x2: x, y2: y + 2.5 }),
    );
    const value = reading.valueOf(spot.readings);
    // A figure at every one of eighty-one positions is illegible, so on the
    // fine ground the figures thin out and the schedule below carries them
    // all. Nothing is lost: the schedule is a reading, not an appendix.
    if (value !== null && figureAt(spot)) {
      const text = svg('text', {
        class: 'spot-figure',
        x,
        y: y - 5,
        'text-anchor': 'middle',
      });
      text.textContent = value.toFixed(reading.digits);
      mark.append(text);
      // The second reading, where there is one, under the first (FR-031).
      // Lettered rather than encoded as a hue or a radius: two readings side
      // by side is exactly the arrangement that must not be summed into one,
      // and a size or a colour is a summing in disguise — it ranks them. The
      // sheet has no weighting to rank them with, because nobody published
      // one, so both stand as figures in their own units.
      const second = sv.readings[1];
      if (second) {
        const other = second.valueOf(spot.readings);
        const under = svg('text', { class: 'spot-figure second', x, y: y + 11, 'text-anchor': 'middle' });
        under.textContent = other === null ? '—' : other.toFixed(second.digits);
        mark.append(under);
      }
    }
    const title = svg('title');
    title.textContent = spotSentence(sv, spot);
    mark.append(title);
    // Standing on a point is a real target, at the coarse-pointer size, not a
    // 5px cross. The hit area is invisible and carries the gesture.
    const hit = svg('rect', {
      x: x - 12,
      y: y - 12,
      width: 24,
      height: 24,
      fill: 'transparent',
      style: 'cursor: crosshair',
    });
    hit.addEventListener('click', () => standOn(sv, spot));
    mark.append(hit);
    root.append(mark);
  }

  /* ── gaps: a cross, and its reason on the mark ───────────────────────── */
  for (const gap of sv.gaps()) {
    const x = px(gap.ix);
    const y = py(gap.iy);
    const mark = svg('g');
    mark.append(
      svg('line', { class: 'gap', x1: x - 3, y1: y - 3, x2: x + 3, y2: y + 3 }),
      svg('line', { class: 'gap', x1: x - 3, y1: y + 3, x2: x + 3, y2: y - 3 }),
    );
    const title = svg('title');
    title.textContent = `No reading here — ${gap.reason}`;
    mark.append(title);
    root.append(mark);
  }

  /* ── the stance: where the desk is standing now ──────────────────────── */
  //
  // Read off the live desk, never off `survey.stance`. That snapshot is where
  // the ground was *cut* and must not move — every row's samples are built
  // from it — so reading the mark from it left the crosshair pinned to a
  // position the reader had already walked away from, and FR-021 says in so
  // many words that it must move when the desk moves.
  //
  // Drawn at the desk's true position, which may be between two measured
  // columns after a slider nudge. A mark snapped to the nearest measured point
  // would be claiming the reader is standing on a design they are not.
  const at = sv.standingAt(params);
  if (at) {
    const x = px(at.ix);
    const y = py(at.iy);
    root.append(
      svg('line', { class: 'stance-rule', x1: x, y1: GROUND_PAD.top, x2: x, y2: GROUND_PAD.top + frame.h }),
      svg('line', { class: 'stance-rule', x1: GROUND_PAD.left, y1: y, x2: GROUND_PAD.left + frame.w, y2: y }),
      // Filled on a measured design, hollow between two — the tick-against-
      // hollow-circle distinction the year rule already draws, and the
      // difference between "the desk is on this run" and "the desk is here,
      // and this survey has not run it".
      at.on
        ? svg('rect', { class: 'stance', x: x - 2.5, y: y - 2.5, width: 5, height: 5 })
        : svg('rect', { class: 'stance stance-loose', x: x - 2.5, y: y - 2.5, width: 5, height: 5 }),
    );
  }

  /* ── the keyboard's own mark ─────────────────────────────────────────── */
  if (groundCursor) {
    const x = px(groundCursor.ix);
    const y = py(groundCursor.iy);
    // A ring rather than a second armed square: the square is the stance and
    // means "the desk is here", where this means "the keyboard is here" and
    // the two are only the same thing until the first arrow key.
    root.append(
      svg('circle', {
        class: 'ground-cursor',
        cx: x,
        cy: y,
        r: 6,
      }),
    );
  }

  root.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (step) {
      event.preventDefault();
      const here = sv.positionOf(params);
      const at = groundCursor ?? here ?? { ix: 0, iy: 0 };
      groundCursor = {
        ix: Math.min(sv.x.count - 1, Math.max(0, at.ix + step[0])),
        iy: Math.min(sv.y.count - 1, Math.max(0, at.iy + step[1])),
      };
      renderSurvey();
      $('survey-ground').querySelector('svg')?.focus({ preventScroll: true });
      // Said as well as drawn, or the mark is a colour and a position to a
      // reader who cannot see it.
      const under = sv.spotAt(groundCursor.ix, groundCursor.iy);
      surveySay(
        under
          ? spotSentence(sv, under)
          : `${formatValue(sv.x.key, sv.x.positions[groundCursor.ix])}, ` +
            `${formatValue(sv.y.key, sv.y.positions[groundCursor.iy])} — not measured.`,
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const at = groundCursor ?? sv.positionOf(params);
      const under = at && sv.spotAt(at.ix, at.iy);
      // Refused rather than approximated, exactly as a click on bare ground
      // is: there is no design here that this survey has measured.
      if (!under) {
        surveySay('That position has not been measured, so there is no design there to stand on.');
        return;
      }
      standOn(sv, under);
    }
  });

  host.append(root);
}

/**
 * The key to the ground.
 *
 * Five marks stand on this drawing and until now not one of them was named
 * anywhere a reader could see: every explanation lived in a `<title>`, which
 * `pointer: coarse` never shows, and which even on a desk requires knowing
 * there is something there to hover. The reader who asked what the hatching
 * meant was reading a drawing with no key, which is the drawing's fault.
 *
 * Each entry draws the mark itself rather than describing it, because a swatch
 * a reader can match against the ground is the whole point of a key — and it
 * is built from the same classes the ground uses, so a mark restyled there
 * cannot come to disagree with its own key.
 */
function renderGroundKey(sv) {
  const host = $('survey-key');
  host.textContent = '';
  const swatch = (draw) => {
    const box = svg('svg', { viewBox: '0 0 14 10', 'aria-hidden': 'true' });
    box.classList.add('ground');
    for (const node of draw()) box.append(node);
    return box;
  };
  const entry = (draw, said) => {
    const li = el('li');
    li.append(swatch(draw), el('span', null, said));
    host.append(li);
  };

  entry(
    () => [
      svg('line', { class: 'spot', x1: 4, y1: 5, x2: 10, y2: 5 }),
      svg('line', { class: 'spot', x1: 7, y1: 2, x2: 7, y2: 8 }),
    ],
    'A measured design — one completed run. The figure beside it is its reading.',
  );
  entry(
    () => [svg('path', { class: 'contour', d: 'M0 8 C 4 8, 6 2, 14 2', fill: 'none' })],
    'A contour: interpolation between measured designs, carrying no figure of its own.',
  );
  entry(
    () => [
      svg('line', { class: 'stance-rule', x1: 7, y1: 0, x2: 7, y2: 10 }),
      svg('rect', { class: 'stance', x: 4.5, y: 2.5, width: 5, height: 5 }),
    ],
    'Where the desk is standing now. It moves when the desk moves, and is hollow between measured designs.',
  );
  const region = improvingRegion(sv, sv.standingAt(params));
  if (region.spots.length) {
    entry(
      () => [svg('rect', { class: 'improving', x: 1, y: 1, width: 12, height: 8 })],
      `Hatched: ${region.spots.length} measured ${region.spots.length === 1 ? 'design that reads' : 'designs that read'} ` +
        `better than the one the desk is on. They are measured points, not gaps.`,
    );
  }
  if (sv.gaps().length) {
    entry(
      () => [
        svg('line', { class: 'gap', x1: 4, y1: 2, x2: 10, y2: 8 }),
        svg('line', { class: 'gap', x1: 4, y1: 8, x2: 10, y2: 2 }),
      ],
      `A run that could not be completed. ${sv.gaps().length} on this ground, each carrying its reason.`,
    );
  }
  if (traverse.length > 1) {
    entry(
      () => [
        svg('polyline', { class: 'traverse', points: '1,8 5,3 9,7 13,2' }),
        svg('circle', { class: 'traverse-stop', cx: 5, cy: 3, r: 1.6 }),
      ],
      'The traverse: designs the desk has stood on this session, in order. Each is restorable.',
    );
  }
  entry(
    () => [],
    'Bare sheet with no contour across it has not been measured at all.',
  );
}

/** One spot height, as a sentence — the tooltip, and the schedule's own row. */
function spotSentence(sv, spot) {
  const said = sv.readings
    .map((reading) => {
      const value = reading.valueOf(spot.readings);
      return `${reading.label} ${value === null ? '—' : value.toFixed(reading.digits)} ${reading.unit}`;
    })
    .join(', ');
  return `${labelFor(sv.x.key)} ${formatValue(sv.x.key, spot.x)}, ${labelFor(sv.y.key)} ${formatValue(sv.y.key, spot.y)} — ${said}. Measured.`;
}

function surveyAriaLabel(sv) {
  const coverage = coverageOf(sv);
  return (
    `${sv.readings.map((reading) => reading.label).join(' and ')} over ${labelFor(sv.x.key)} and ` +
    `${labelFor(sv.y.key)}, on a ${sv.density} ground with ${coverage.measured} of ${coverage.wanted} ` +
    'positions measured. Contours are drawn between measured points and carry no figure.'
  );
}

/**
 * Stand on a measured design (FR-032, FR-033).
 *
 * Through the same `commit` path a slider gesture uses, so the axonometric,
 * the quantities, the bill, the schedule, the description, the studies and the
 * address bar all follow without any of them being told separately. The
 * address bar waits for the release, by the rule every gesture here follows:
 * `commit(..., true)` on the last key is what ends the gesture.
 *
 * A position that was not measured is refused. There is no path here from an
 * interpolated point, because the argument is only ever handed a `SpotHeight`
 * and a `SpotHeight` cannot be built from interpolation.
 */
function standOn(sv, spot) {
  if (!(spot && spot.readings)) return;
  const already =
    params[sv.x.key] === spot.x && params[sv.y.key] === spot.y;
  if (already) return;
  recordTraverse();
  commit(sv.x.key, spot.x);
  commit(sv.y.key, spot.y, true);
  tour?.note('drag');
}

/**
 * Go back to a design the desk has already stood on, exactly (FR-038).
 *
 * Params and patch together, through the same commit path a slider gesture
 * uses, so everything that reads the desk follows. The ground is not re-cut:
 * a traverse stop is a position on it, and its rest shape excludes both axes,
 * so walking back along the traverse costs no runs at all where the stops
 * differ only in the two surveyed controls.
 */
function restoreTraverse(stop) {
  if (!stop) return;
  if (deskKey(stop.params, stop.patch) === shapeKey(params)) return;
  recordTraverse();
  beginGesture();
  // The patch bay first, because a parameter on a channel that is out reaches
  // no object: committing the parameters against the wrong patch state would
  // write half of them into a document that cannot hold them, and the second
  // half would then be applied to a different building from the first.
  //
  // Solo is dropped rather than reconstructed. `patching()` collapses solo into
  // a full bypass map, so a stop cannot tell "Fabric soloed" from "everything
  // but Fabric patched out" — and those are the same *document*, which is what
  // a restored design is. Leaving solo on would make the two disagree.
  let patched = false;
  for (const channel of CHANNELS) {
    if (!channel.bypassable) continue;
    const want = Boolean(stop.patch[channel.id]);
    if (bypass[channel.id] === want && !solo) continue;
    bypass[channel.id] = want;
    patched = true;
  }
  if (solo) {
    solo = null;
    desk.solo = null;
    patched = true;
  }
  // No console call is needed: `bypass` is the same object the console was
  // mounted with, and `applyGeometry` re-letters the strips from the model
  // state it computes — which is exactly the path `patchChannel` takes.
  if (patched) applyGeometry();

  const keys = Object.keys(stop.params).filter((key) => params[key] !== stop.params[key]);
  if (!keys.length) {
    // The patch bay was the whole difference. It still has to be committed as
    // a gesture, or the address bar keeps the scheme it arrived with and no
    // solve follows.
    if (patched) {
      endGesture();
      desk?.settle();
      if (autoOn()) pump();
    }
    return;
  }
  keys.forEach((key, at) => commit(key, stop.params[key], at === keys.length - 1));
}

/** One stop on the traverse, recorded where the desk actually moves (FR-038). */
function recordTraverse() {
  const here = shapeKey(params);
  const last = traverse[traverse.length - 1];
  if (last && deskKey(last.params, last.patch) === here) return;
  // A design revisited moves to the end of the record rather than being added
  // to it again, keeping the readings it already carries.
  //
  // A traverse is a path and a path may double back, so a duplicate is not
  // *wrong* — but the record exists to be restored from, and a second row for
  // one design offers nothing the first does not. Two of them also both
  // answered to "you are here", which is one claim too many, and a reader
  // dragging a slider back and forth would fill the list with a design they
  // never left. The path is redrawn over itself on the plan either way.
  const at = traverse.findIndex((stop) => deskKey(stop.params, stop.patch) === here);
  const known = at === -1 ? null : traverse.splice(at, 1)[0];
  traverse.push(
    new TraverseStop({
      params: known?.params ?? params,
      patch: known?.patch ?? patching(),
      readings: known?.readings ?? null,
      at: traverse.length,
    }),
  );
  // Redrawn here, because this is the only place the record changes. It had
  // no redraw of its own at first and rode on `renderSurvey`, which meant the
  // list was only ever refreshed when a solve happened to fill a stop's
  // readings — so walking back to a design already measured moved the record
  // and drew nothing, and the row marked "you are here" was the one the desk
  // had left two gestures ago.
  renderTraverse();
}

/**
 * Attach the readings a run produced to the stop it describes (FR-038).
 *
 * A stop is recorded at the end of the gesture that reached it, which is
 * *before* the desk has been solved — so the readings cannot be handed to the
 * constructor and the field cannot be filled where it is created. It is filled
 * here instead, from the solve, by matching the run's own snapshot against the
 * stop's shape rather than against the live desk: an annual run takes the best
 * part of a second and the reader may have moved on twice while it was in
 * flight, and a stop that took whichever readings landed next would carry
 * another building's numbers under its own name.
 *
 * `TraverseStop` is frozen, so the entry is replaced rather than mutated. That
 * is the point of the freeze: a stop's readings are settled once and cannot
 * drift afterwards.
 */
function landTraverseReadings(snapshot, patch, readings) {
  const shape = deskKey(snapshot, patch);
  // The desk the sheet opened on. `recordTraverse` is called from `commit`,
  // which is a *move*, so the design the reader arrived at has no stop until
  // they leave it — and the boot solve, which is the one run that describes it,
  // lands before any stop exists. Left alone the first row of the traverse
  // read as three em dashes for a design that had in fact been measured.
  // Seeded only from an empty traverse: a later run that matches no stop is a
  // stale solve of a desk already left, and inventing a stop for it would put
  // a design on the record that the reader never came to rest on.
  if (!traverse.length) {
    traverse.push(new TraverseStop({ params: snapshot, patch, readings, at: 0 }));
    renderTraverse();
    return;
  }
  for (let at = traverse.length - 1; at >= 0; at -= 1) {
    const stop = traverse[at];
    if (deskKey(stop.params, stop.patch) !== shape) continue;
    // Already carrying what this run says. Re-solving the same desk — a
    // release after a drag that ended where it began — must not mint a new
    // object and redraw the traverse for nothing.
    if (stop.readings) return;
    traverse[at] = new TraverseStop({
      params: stop.params,
      patch: stop.patch,
      readings,
      at: stop.at,
    });
    renderTraverse();
    return;
  }
}

/** The schedule of spot heights: every measured design, with its own figures. */
function renderSpots(sv) {
  const table = $('survey-spots');
  table.textContent = '';
  const spots = sv.spots();
  const heads = [labelFor(sv.x.key), labelFor(sv.y.key), ...sv.readings.map((reading) => reading.label)];
  const thead = el('thead');
  const headRow = el('tr');
  for (const head of heads) headRow.append(el('th', null, head));
  thead.append(headRow);
  const tbody = el('tbody');
  for (const spot of spots) {
    const row = el('tr');
    const cells = [
      formatValue(sv.x.key, spot.x),
      formatValue(sv.y.key, spot.y),
      ...sv.readings.map((reading) => {
        const value = reading.valueOf(spot.readings);
        // An absence is an em dash and stays out of every total. Zero is a
        // measurement; missing is not one.
        return value === null ? '—' : `${value.toFixed(reading.digits)} ${reading.unit}`;
      }),
    ];
    cells.forEach((text, at) => {
      const cell = el('td', null, text);
      // Set where the cell is built, so the words over a column and the words
      // beside a folded figure are one string.
      cell.dataset.head = heads[at];
      row.append(cell);
    });
    tbody.append(row);
  }
  table.append(thead, tbody);
  keepTableSemantics(table);
  $('survey-spots-scope').textContent = spots.length
    ? `${spots.length} measured ${spots.length === 1 ? 'design' : 'designs'}`
    : 'nothing measured yet';
}

/**
 * Coverage and density, lettered wherever the relief is drawn (FR-018i).
 *
 * The relief is smooth by decision, and a smooth surface does not report its
 * own sample density the way a faceted one does in its own texture. So these
 * two figures are the only thing separating a coarse survey from a convincing
 * picture of one, and they are load bearing rather than a caption. They must
 * not later be softened as cosmetic.
 */
function renderCoverage(sv) {
  const host = $('survey-coverage');
  const coverage = coverageOf(sv);
  host.textContent = '';
  host.append(
    document.createTextNode('Ground '),
    el('b', null, coverage.density),
    document.createTextNode(' · '),
    el('b', null, `${coverage.measured} of ${coverage.wanted}`),
    document.createTextNode(' positions measured'),
  );
  if (coverage.gaps) {
    host.append(document.createTextNode(` · ${coverage.gaps} could not be run`));
  }
  if (coverage.unsurveyed) {
    host.append(el('span', 'loose', ` · ${coverage.unsurveyed} not yet measured`));
  }
}

/**
 * A quantity along one axis, in that control's own units.
 *
 * Through the control's own `format` rather than `toFixed`, so the digits and
 * the unit are the declaration's — the same rule the margin numbers follow —
 * and so a unitless control (a ratio, a fraction) reads as a bare number
 * rather than as a number with a trailing space where a unit was expected.
 */
function amountOn(axis, value) {
  const unit = axis.control.unit;
  const digits = Math.max(0, Math.ceil(-Math.log10(axis.control.step)) || 0);
  const said = value.toFixed(Math.min(4, digits));
  return unit ? `${said} ${unit}` : said;
}

/**
 * A tolerance, with at least one figure in it.
 *
 * `toFixed(1)` on a tolerance of 0.04 °C prints `0.0`, and "holding high to
 * within 0.0 °C" is a claim of exactness the arithmetic did not make — the
 * one shape of rounding this sheet cannot let through, because the reader has
 * no way to see it. Below the reading's own precision it is lettered as a
 * bound rather than as a figure.
 */
function within(tolerance, reading) {
  const floor = 10 ** -reading.digits;
  return tolerance < floor
    ? `${floor.toFixed(reading.digits)} ${reading.unit}`
    : `${tolerance.toFixed(reading.digits)} ${reading.unit}`;
}

/**
 * The sentence under the ground: what it is, and what it is not.
 *
 * The inference is declared here **and** on the relief's own caption, because
 * a continuous surface is read as continuous data wherever it is drawn and a
 * declaration on the plan does not reach a reader looking at the relief
 * (FR-019).
 */
function renderSurveyFinding(sv) {
  const coverage = coverageOf(sv);
  const host = $('survey-finding');
  if (!coverage.measured) {
    host.textContent = coverage.gaps
      ? `Nothing on this ground could be measured: all ${coverage.gaps} runs failed. There is no relief to draw, and none is drawn.`
      : '';
    return;
  }
  const parts = [];
  // Against where the desk is standing, not where the ground was cut. Read
  // from the same call `drawGround` makes, or the sentence and the hatching
  // under it disagree about the same region — which they did: 26 designs named
  // in prose over a drawing showing none.
  const here = sv.standingAt(params);
  const region = improvingRegion(sv, here);
  if (region.spots.length) {
    const said = sv.readings
      .map((reading) => `a ${reading.better} ${reading.label.toLowerCase()}`)
      .join(' and ');
    parts.push(
      `${region.spots.length} measured ${region.spots.length === 1 ? 'design reads' : 'designs read'} ` +
        `${said} than the stance. That is a region of the measured ground, not an optimum.`,
    );
  } else if (region.refusal) {
    parts.push(region.refusal);
  }
  // Where two readings disagree, the trade is stated in both readings' own
  // units and no single figure ranks one against the other (FR-031). There is
  // no combined score on this sheet and there must not be one: nobody
  // published a weighting, and inventing one would be the drawing grading a
  // design instead of measuring it.
  if (sv.readings.length === 2) {
    const at = sv.positionOf(params);
    const standing = at && sv.spotAt(at.ix, at.iy);
    if (standing) {
      const base = sv.readings.map((entry) => entry.valueOf(standing.readings));
      const split = sv.spots().filter((spot) => {
        const values = sv.readings.map((entry) => entry.valueOf(spot.readings));
        if (values.some((value) => value === null) || base.some((value) => value === null)) return false;
        const better = sv.readings.map((entry, at2) => entry.improves(values[at2], base[at2]));
        return better[0] !== better[1];
      });
      if (split.length) {
        // The design where the *improvement* is largest, not where the first
        // reading moved most. Ranked the second way, the exemplar was the
        // design that made one reading worst while the other barely moved —
        // "+5.4 °C of high against +0.0 °C of low", which is a trade nobody
        // would make and therefore says nothing about the trade there is.
        // Each reading's change is scaled by its own range across the ground,
        // because the two are in different units and neither may be ranked
        // against the other in absolute terms.
        const spans = sv.readings.map((entry) => {
          const values = sv.spots().map((spot) => entry.valueOf(spot.readings)).filter((v) => v !== null);
          const span = Math.max(...values) - Math.min(...values);
          return span > 0 ? span : 1;
        });
        const gain = (spot) =>
          Math.min(
            ...sv.readings.map((entry, at2) => {
              const value = entry.valueOf(spot.readings);
              const better = entry.improves(value, base[at2]);
              return better ? Math.abs(value - base[at2]) / spans[at2] : 0;
            }).filter((score) => score > 0),
          );
        const worst = split.reduce((left, right) => (gain(right) > gain(left) ? right : left));
        const said = sv.readings.map((entry, at2) => {
          const value = entry.valueOf(worst.readings);
          const change = value - base[at2];
          return `${change >= 0 ? '+' : ''}${change.toFixed(entry.digits)} ${entry.unit} of ${entry.label.toLowerCase()}`;
        });
        parts.push(
          `${split.length} measured ${split.length === 1 ? 'design trades' : 'designs trade'} one reading ` +
            `against the other. The largest gain is at ${formatValue(sv.x.key, worst.x)} by ` +
            `${formatValue(sv.y.key, worst.y)}: ${said.join(' against ')}. Both are stated in their own ` +
            'units and neither is ranked against the other, because nobody published a weighting.',
        );
      }
    }
  }
  const exchange = freeExchange(sv, here);
  if (exchange.flat) {
    parts.push('The reading does not move around the stance, so there is no exchange to state.');
  } else if (exchange.refusal) {
    parts.push(exchange.refusal);
  } else {
    parts.push(
      `Along the level line at the stance, ${amountOn(sv.x, Math.abs(exchange.dx))} of ` +
        `${phraseFor(sv.x.key)} buys ${amountOn(sv.y, Math.abs(exchange.dy))} of ` +
        `${phraseFor(sv.y.key)}, holding ${sv.readings[0].label.toLowerCase()} to within ` +
        `${within(exchange.tolerance, sv.readings[0])}.`,
    );
  }
  // Said once. The region and the exchange are two readings taken against the
  // same stance, so when the stance itself is what refuses them they refuse
  // with one sentence — and printed twice it reads as two different problems.
  host.textContent = [...new Set(parts)].join(' ');
}

/* ── the pull ────────────────────────────────────────────────────────────── */

let pullReading = null; // the last ranking, or null
let pullJobs = new Map(); // job id -> the probe spec it came from
let pullLanded = new Map(); // job id -> { here, there }
let pullStance = null;
const pullFinished = new Map(); // job id -> its probe spec, once landed
// Where the ranking opens. Not a cap: `pullShowAll` reaches the rest, because
// a control missing from the table reads as one that was never probed.
const PULL_ROWS = 20;
let pullShowAll = false;

/**
 * Read the pull: one run per sweepable control, ranked at the stance.
 *
 * Queued through the existing scheduler, so a control already swept as a study
 * or already measured by a survey is a cache hit and costs no engine run
 * (FR-011, SC-011). There is no second pool and no second cache — the probes
 * are study jobs sweeping two points, and the round-robin is what keeps them
 * from holding the queue against a study or a survey.
 */
function readPull() {
  if (!studyScheduler || !survey) return;
  if (pullJobs.size) {
    for (const id of [...pullJobs.keys()]) studyScheduler.cancel(id, 'stopped');
    pullJobs.clear();
    pullLanded.clear();
    renderPull();
    return;
  }
  if (!autoOn() || linkAttachPending || stationAttaching) {
    surveySay('The pull waits for auto-solve and for any link or station still attaching.');
    return;
  }
  const reading = pullReadingFor(survey.readings[0].id);
  const stance = { ...params };
  const patch = patching();
  const state = channelState(stance, patch);
  const engaged = [...state].filter(([, value]) => value.engaged).map(([id]) => id);
  const { needed, carried } = surveyContents(survey);
  const { probes, inert } = pullProbes(stance, patch, {
    quantity: reading.quantity,
    engaged,
    annual: Boolean(epwText),
    epw: epwText ?? null,
    needed,
    carried,
    // The rest of the desk excluding the probed key, exactly as a study's is:
    // a probe is a study of two points, and moving the control it probes only
    // walks along the answer it gave.
    restShape: null,
  });
  pullStance = { stance, patch, reading, inert, annual: Boolean(epwText) };
  pullJobs = new Map();
  pullLanded = new Map();
  pullFinished.clear();
  surveyEnqueueing = true;
  try {
    for (const probe of probes) {
      const job = makeStudyJob({ ...probe, restShape: restShapeKey(probe.key, stance, patch) });
      pullJobs.set(job.id, probe);
      studyScheduler.enqueue(job);
    }
  } finally {
    surveyEnqueueing = false;
  }
  studyScheduler.drain();
  renderPull();
}

/** A landed probe, absorbed. Returns true where the event was a probe's. */
function onPullUpdate(job, event) {
  if (job?.origin !== 'pull') return false;
  if (event === 'point' || event === 'done' || event === 'failed') {
    const reading = pullStance?.reading;
    if (reading) {
      const here = job.curve[0]?.sample ? reading.valueOf(job.curve[0].sample.readings) : null;
      const there = job.curve[1]?.sample ? reading.valueOf(job.curve[1].sample.readings) : null;
      pullLanded.set(job.id, { here, there });
    }
    if (event !== 'point') pullDone(job.id);
    renderPull();
    return true;
  }
  if (event === 'cancelled') {
    pullDone(job.id);
    renderPull();
    return true;
  }
  return false;
}

function pullDone(id) {
  const probe = pullJobs.get(id);
  if (probe) pullFinished.set(id, probe);
  pullJobs.delete(id);
}

/** Every entry the ranking currently holds, measured and inert together. */
function pullEntries() {
  if (!pullStance) return [];
  const entries = [...pullStance.inert];
  for (const [id, probe] of [...pullFinished, ...pullJobs]) {
    const landed = pullLanded.get(id);
    if (!landed) continue;
    entries.push(entryFrom(probe, { ...landed, reading: pullStance.reading }));
  }
  return rankPull(entries);
}

/**
 * The ranking, drawn.
 *
 * The signed meter bar the balance rail uses, with one difference that is not
 * a detail: the rail's `--warm` / `--cold` pair encodes a signed *physical*
 * quantity, and "which way this control moves the reading" is not one. So the
 * bars are graphite and the direction is a word in its own column — which is
 * where the rail itself ended up, for the argument that a hue cannot be the
 * only thing saying which way a term points (FR-025).
 */
function renderPull() {
  const section = $('pull');
  if (!section) return;
  section.hidden = !survey;
  if (!survey) return;

  const running = pullJobs.size > 0;
  $('pull-read').textContent = running ? 'Stop reading the pull' : 'Read the pull';
  const entries = pullEntries();
  const measured = entries.filter((entry) => !entry.inert);
  const inert = entries.filter((entry) => entry.inert);

  if (!pullStance) {
    $('pull-scope').textContent = '';
    $('pull-lede').textContent =
      'Which of the ninety sweepable controls actually move this reading, at the desk as it stands — one ' +
      'run each, ranked. It is the question that comes before the ground: which two controls are worth ' +
      'cutting one along.';
    $('pull-table').textContent = '';
    $('pull-inert').textContent = '';
    return;
  }

  // Read off what the probes were actually run at, never off the desk as it
  // stands now: a station attached while the ranking was landing would have
  // the sentence describe a year the runs never saw.
  const kind = pullStance.annual ? 'annual' : 'design-day';
  pullReading = measured.length
    ? new PullReading({
        kind,
        reading: pullStance.reading,
        entries,
        probed: pullFinished.size,
      })
    : null;

  const total = pullFinished.size + pullJobs.size;
  $('pull-scope').textContent = running
    ? `${pullFinished.size} of ${total} controls read`
    : `${measured.length} controls read, ${inert.length} inert`;
  // Which run kind the ranking was read at, stated rather than assumed. On an
  // annual desk 90 runs is about 16 s, and a reader watching a ranking settle
  // is entitled to know whether they are looking at a year or at two days.
  $('pull-lede').textContent = pullReading
    ? `${pullReading.said} ${running ? 'The order settles as the runs land; the top entries are stable early.' : ''}`.trim()
    : 'Reading the pull — one run per control, at the desk as it stands.';

  const table = $('pull-table');
  table.textContent = '';
  const heads = ['Control', 'Moves the reading', 'Per unit', 'Effect', 'Room left'];
  // The whole ranking is reachable, not the top twenty of thirty-seven
  // (FR-025). Twenty is where it opens because that is a screen and the tail
  // of a ranking is by definition the part that moves the reading least — but
  // a reader who wants a particular control's pull has to be able to find it,
  // and a control that is missing from the table reads as one that was never
  // probed. The rest is one press away and the press says how many.
  const shown = pullShowAll ? measured.length : Math.min(PULL_ROWS, measured.length);
  const thead = el('thead');
  const headRow = el('tr');
  heads.forEach((head, at) => {
    const cell = el('th', at >= 3 ? 'num' : null, head);
    headRow.append(cell);
  });
  thead.append(headRow);
  const tbody = el('tbody');
  const widest = Math.max(...measured.map((entry) => entry.pull), 0) || 1;
  for (const entry of measured.slice(0, shown)) {
    const row = el('tr');
    if ([surveyChoice.x, surveyChoice.y].includes(entry.key)) row.classList.add('chosen');
    // The control's name is the way to cut a ground along it (FR-028): choosing
    // two entries names two axes without anything being retyped.
    const pick = el('button', 'pull-pick', entry.label);
    pick.type = 'button';
    pick.title = `Make ${entry.label} an axis of the survey`;
    pick.addEventListener('click', () => cutFromPull(entry.key));
    const name = el('td');
    name.append(pick);

    // The bar, and the word beside it. Both, always: in monochrome, under
    // forced colours, or read aloud as a swatch and a number, a bar says
    // nothing whatever about which way it points.
    const barCell = el('td');
    const bar = el('div', 'pull-bar');
    const fill = el('div', 'pull-fill');
    const width = (entry.pull / widest) * 50;
    const rising = entry.direction === 'raise';
    fill.style.left = rising ? '50%' : `${50 - width}%`;
    fill.style.width = `${width}%`;
    bar.append(fill);
    // The word, always, beside the bar. In monochrome, under forced colours,
    // or read aloud as a swatch and a number, a bar says nothing whatever
    // about which way it points — the same argument that put `in` and `out`
    // beside every figure on the balance rail.
    const said = el(
      'span',
      'pull-said',
      entry.direction === 'none'
        ? 'does not move it'
        : entry.direction === 'raise'
          ? 'raises it'
          : 'lowers it',
    );
    barCell.append(bar, said);

    const cells = [
      name,
      barCell,
      el('td', null, entry.perUnit || '—'),
      el('td', 'num', formatEffect(entry, pullStance.reading)),
      el('td', 'num', entry.atStop ? 'At its stop' : `${entry.room.toFixed(2)}${entry.perUnit ? ` ${entry.perUnit}` : ''}`),
    ];
    cells.forEach((cell, at) => {
      // Set where the cell is built, so the words over a column and the words
      // beside a folded figure are one string. Written rather than assigned:
      // `dataset` is a getter-only property, and `Object.assign` onto it
      // throws — which, from inside a scheduler callback, took down the drain
      // and left the ranking reading `0 of 37` for ever with the runs quietly
      // completing behind it.
      cell.dataset.head = heads[at];
      row.append(cell);
    });
    tbody.append(row);
  }
  table.append(thead, tbody);
  keepTableSemantics(table);

  const more = $('pull-more');
  more.hidden = measured.length <= PULL_ROWS;
  if (!more.hidden) {
    more.textContent = pullShowAll
      ? `Show the top ${PULL_ROWS}`
      : `Show all ${measured.length} controls`;
  }

  // Inert controls are listed rather than omitted or drawn as zero: "this
  // reaches nothing here" is often exactly the answer to "why does nothing I
  // try move this reading" (FR-027).
  $('pull-inert').textContent = inert.length
    ? `${inert.length} controls reach no object at this stance and cost no run: ` +
      `${inert.slice(0, 4).map((entry) => `${entry.label} — ${entry.inert.toLowerCase()}`).join('; ')}` +
      `${inert.length > 4 ? `; and ${inert.length - 4} more.` : ''}`
    : '';
}

/**
 * Name an axis from the ranking, and cut the ground once two are named
 * (FR-028).
 *
 * The pair goes through `axesFrom` rather than straight to `openSurvey`,
 * which is what that function is for: it refuses two entries that are the same
 * control, and refuses an inert one **with that entry's own reason**. Neither
 * refusal is hypothetical from here — the ranking lists inert controls
 * deliberately, so a reader can press one — and "the Gains channel is out of
 * the path" is a far better answer than the sentence `axisFor` would throw a
 * moment later about a control reaching no object.
 */
function cutFromPull(key) {
  const entries = pullEntries();
  nameSurveyAxis(key);
  const { x, y } = surveyChoice;
  if (!x || !y) return;
  try {
    axesFrom(entries, x, y);
  } catch (failure) {
    // Refused whole, with the reason where the reader pressed. The axis is put
    // back so the chooser does not hold a pairing the survey has just refused.
    surveyChoice = { ...surveyChoice, [x === key ? 'x' : 'y']: null };
    syncSurveyAxes();
    surveySay(failure.message.replace(/^axesFrom: /, ''));
    renderSurvey();
  }
}

/** One effect, per unit of the control's own travel and in the reading's units. */
function formatEffect(entry, reading) {
  if (entry.effect === null) return '—';
  const magnitude = Math.abs(entry.effect);
  const digits = magnitude >= 100 ? 0 : magnitude >= 1 ? 2 : 3;
  return `${entry.effect.toFixed(digits)} ${reading.unit}`;
}

/* ── letting the design fall ─────────────────────────────────────────────── */

let falling = null;

/**
 * Release the desk and let it walk downhill, one real run at a time.
 *
 * Every intermediate desk is a design that was actually simulated — `fallStep`
 * returns a measured neighbour or nothing, and there is no path here from an
 * interpolated position — so E-01 follows every step as a building rather than
 * as an animation of one. Each step goes through the same `commit` path a
 * slider gesture uses, which is what makes the axonometric, the quantities,
 * the bill, the schedule and the description all follow without any of them
 * being told separately.
 *
 * **Stated as steps, not flown.** There is no animated descent to disable
 * under `prefers-reduced-motion`, because there is none to begin with: each
 * step is a commit and a line of prose (FR-023). A reader who has asked for
 * reduced motion loses nothing here, which is the only version of that promise
 * worth making.
 */
function letItFall() {
  if (!survey) return;
  if (falling) {
    stopFalling('The descent was stopped. The desk is standing on the last completed design it reached.');
    return;
  }
  // A descent while the world is moving under it would be walking a ground
  // whose readings are about to be thrown away.
  if (linkAttachPending || stationAttaching) {
    surveySay('A link or a station is still attaching, so the ground is about to be re-measured. The descent waits for it.');
    return;
  }
  const at = survey.positionOf(params);
  if (!at) {
    surveySay(
      'The desk is not standing on a measured position of this ground, so there is nowhere on it to fall ' +
        'from. Stand on a spot height first, or widen the extent.',
    );
    return;
  }
  falling = { visited: new Set([`${at.ix},${at.iy}`]), steps: 0, said: [] };
  $('survey-fall').textContent = 'Stop the descent';
  fallOnce();
}

function fallOnce() {
  if (!falling || !survey) return;
  const at = survey.positionOf(params);
  const next = fallStep(survey, at, { visited: falling.visited });
  if (!next || next.stopped) {
    stopFalling(next?.stopped ?? 'The descent stopped.');
    return;
  }
  falling.visited.add(`${next.ix},${next.iy}`);
  falling.steps += 1;
  const reading = survey.readings[0];
  falling.said.push(
    `${formatValue(survey.x.key, next.x)} · ${formatValue(survey.y.key, next.y)} → ` +
      `${reading.valueOf(next.readings).toFixed(reading.digits)} ${reading.unit}`,
  );
  standOn(survey, next);
  surveySay(`Step ${falling.steps}: ${falling.said[falling.said.length - 1]}.`);
  // A quarter second per step, and neither of the two obvious alternatives.
  //
  // A loop would move the desk to the hollow with nothing in between ever
  // seen, which is the whole difference between letting a design fall and
  // computing where it lands. `requestAnimationFrame` was the first attempt
  // and is worse than it sounds: sixty designs a second is not watching a
  // descent, every one of them commits and re-solves E-01, and a backgrounded
  // tab stops delivering frames at all — measured, the descent took one step
  // and stalled.
  //
  // This is not an animation and it is not disabled under reduced motion
  // (FR-023): each step is a discrete state the reader asked for and can read,
  // and the alternative — arriving at the hollow with no steps — is the thing
  // that loses information rather than the thing that spares it.
  setTimeout(() => fallOnce(), 250);
}

/**
 * Stop, always on a completed design and never mid-run or on an interpolated
 * position (FR-036), and always saying why (FR-035, FR-037).
 */
function stopFalling(reason) {
  const steps = falling?.steps ?? 0;
  falling = null;
  $('survey-fall').textContent = 'Let it fall';
  surveySay(
    steps
      ? `${reason} ${steps} ${steps === 1 ? 'step' : 'steps'} taken, each one a completed run.`
      : reason,
  );
}

/** One line under the chooser, for what the survey is doing right now. */
function surveySay(sentence) {
  const note = $('survey-refusal');
  note.hidden = false;
  note.classList.remove('bad');
  note.textContent = sentence;
}

/**
 * One stop of an axis, bare of its unit — the same rule the plan follows, and
 * for the same reason: the unit is lettered once on the axis name rather than
 * on both ends, or a long one runs off the corner it is written into.
 */
function stopOf(axis, index) {
  const said = formatValue(axis.key, axis.positions[index]);
  const unit = axis.control.unit;
  return unit && said.endsWith(unit) ? said.slice(0, -unit.length).trim() : said;
}

/* ── the relief ──────────────────────────────────────────────────────────── */

let relief = null;
let reliefLoss = null;

/**
 * Draw the relief, or say in place why there is none.
 *
 * The relief is never the only carrier of anything (FR-018c). Every reading is
 * on the plan and in the schedule already, so a context that cannot be had, or
 * one the browser takes back mid-session, costs the reader the *shape* and
 * nothing else — which is why `createRelief` returns null rather than
 * substituting a still image, and why the loss is stated where the drawing
 * would have been rather than logged.
 */
function drawRelief(sv) {
  const host = $('survey-relief');
  const caption = $('survey-relief-cap');
  if (!relief && !reliefLoss) {
    relief = createRelief(host, {
      onLost: (reason) => {
        reliefLoss = reason;
        relief = null;
        drawRelief(sv);
      },
    });
    if (!relief && !reliefLoss) {
      reliefLoss = 'This browser has no WebGL2 drawing context, so the relief cannot be drawn.';
    }
  }
  const views = $('survey-views');
  if (!relief) {
    host.textContent = '';
    host.append(el('p', 'survey-note bad', `${reliefLoss} Every reading is on the plan and in the schedule beside it.`));
    views.textContent = '';
    caption.textContent = '';
    return;
  }

  const lattice = latticeOf(sv, sv.readings[0]);
  const extent = extentOf(lattice);
  const at = sv.standingAt(params);
  const under = at && at.on ? sv.spotAt(at.ix, at.iy) : null;
  const block = blockOf(lattice);
  relief.draw({
    mesh: meshOf(lattice),
    extent,
    // The block the ground stands in. Derived from the same lattice and the
    // same mask, so it can add no ground the surface does not already have.
    block,
    // The same levels the plan contours, ruled around the cut so the side of
    // the block is a vertical scale rather than a wash — and the arrises, so
    // an oblique says which way each corner folds.
    strata: strataOf(block, levelsFor(lattice)),
    arrises: arrisesOf(block),
    // The pin, only where the desk is standing on a design this survey has
    // actually run. Between two measured points there is no height to stand a
    // pin at, and interpolating one would be the relief inventing a reading —
    // the plan's hollow mark carries that state instead.
    stance: under ? { ix: at.ix, iy: at.iy, value: sv.readings[0].valueOf(under.readings) } : null,
    axes: {
      x: { label: labelFor(sv.x.key), from: stopOf(sv.x, 0), to: stopOf(sv.x, sv.x.count - 1) },
      y: { label: labelFor(sv.y.key), from: stopOf(sv.y, 0), to: stopOf(sv.y, sv.y.count - 1) },
    },
  });

  // Named viewpoints as real buttons: a coarse-pointer target and a tab stop
  // apiece, so every camera move the pointer can make the keyboard can make
  // too (FR-018e). There is no drag-to-orbit here that these do not cover.
  views.textContent = '';
  for (const viewpoint of relief.viewpoints) {
    const button = el('button', 'relief-view', viewpoint.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(relief.view.azimuth === viewpoint.azimuth));
    button.addEventListener('click', () => {
      relief.setView(viewpoint);
      drawRelief(sv);
    });
    views.append(button);
  }
  for (const [label, step] of [['Turn left', { azimuth: -1 }], ['Turn right', { azimuth: 1 }]]) {
    const button = el('button', 'relief-view', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      relief.step(step);
      drawRelief(sv);
    });
    views.append(button);
  }

  const coverage = coverageOf(sv);
  host.setAttribute(
    'aria-label',
    `${surveyAriaLabel(sv)} Drawn from ${relief.view.azimuth}° at ${relief.view.elevation}° above.`,
  );
  // The inference is declared here as well as on the plan, because a
  // continuous surface is read as continuous data wherever it is drawn and a
  // declaration on the other figure does not reach a reader looking at this
  // one (FR-019).
  caption.textContent =
    `The same ground cut as a block. The body under the terrain is not measurement and carries none: ` +
    `this survey knows the reading on the ground and nothing about what is beneath it, so the cut is ` +
    `ruled at the plan's own contour levels to serve as the vertical scale and shaded flat otherwise. ` +
    `A hole in the terrain is a shaft through the block. The surface between the posts is interpolation, not measurement: ` +
    `${coverage.measured} of ${coverage.wanted} positions carry a run, each marked by a post, and no ` +
    `figure anywhere on this sheet is read off the surface between them. Holes are positions that could ` +
    `not be measured. The vertical scale is fixed and the whole measured range fills the box — ` +
    `${extent ? `${extent.lo.toFixed(sv.readings[0].digits)} to ${extent.hi.toFixed(sv.readings[0].digits)} ${sv.readings[0].unit}` : 'nothing measured yet'} — ` +
    `and there is no exaggeration control, because a reader who can dial the drama of a result up and ` +
    `down can argue from the picture.`;
}

/**
 * Every design the desk has stood on this session, in order and restorable
 * (FR-038), with a keyboard route to each (FR-049).
 *
 * The plan draws the traverse too, as a chain of ghost marks — but it can only
 * draw the stops whose values fall inside the extent the ground was cut over,
 * and it draws nothing at all with no survey open. A design the reader walked
 * to with the sliders and then narrowed the extent past would simply vanish
 * from the record, which is not what "every design the desk has stood on" can
 * mean. So the list is the complete statement and the marks on the plan are
 * the shortcut for the ones that happen to be under the drawing — the same
 * arrangement the boundary key already keeps against the axonometric, where
 * three of six surfaces can be clicked and the key carries all six.
 *
 * It is also where the keyboard reaches them. A mark on an SVG would need a
 * tab stop apiece; a table row already has one.
 */
function renderTraverse() {
  const section = $('traverse');
  if (!section) return;
  // One stop is where the desk started and is not a traverse. The record
  // begins when the reader has actually moved.
  section.hidden = traverse.length < 2;
  if (section.hidden) return;

  const here = shapeKey(params);
  $('traverse-count').textContent = `${traverse.length} stops`;
  const table = $('traverse-table');
  table.textContent = '';
  const heads = ['Design', 'High', 'Low', 'Hours'];
  const thead = el('thead');
  const headRow = el('tr');
  heads.forEach((head, at) => headRow.append(el('th', at > 0 ? 'num' : null, head)));
  thead.append(headRow);

  const tbody = el('tbody');
  // Most recent first: the stop a reader wants back is usually the one they
  // just left, and a session's traverse has no natural ceiling.
  for (const stop of [...traverse].reverse()) {
    const row = el('tr');
    const standing = deskKey(stop.params, stop.patch) === here;
    if (standing) row.classList.add('here');

    const go = el('button', 'traverse-go', shapeLabel(stop.params));
    go.type = 'button';
    if (standing) {
      go.disabled = true;
      go.title = 'The desk is standing on this design.';
    } else {
      go.title = `Put the desk back on this design: ${shapeLabel(stop.params)}`;
      go.addEventListener('click', () => restoreTraverse(stop));
    }
    const name = el('td');
    name.append(go);

    // The readings taken at it, or an em dash where the run that would have
    // filled them never landed — a stop reached and immediately left again,
    // or one whose solve was overtaken. Absence is not zero.
    const cells = [
      name,
      el('td', 'num', stop.readings ? `${stop.readings.high.toFixed(1)} °C` : '—'),
      el('td', 'num', stop.readings ? `${stop.readings.low.toFixed(1)} °C` : '—'),
      el('td', 'num', stop.readings ? stop.readings.hours.toLocaleString('en-US') : '—'),
    ];
    cells.forEach((cell, at) => {
      cell.dataset.head = heads[at];
      row.append(cell);
    });
    tbody.append(row);
  }
  table.append(thead, tbody);
  keepTableSemantics(table);
}

/** Everything E-02 letters, from the ground in hand. */
function renderSurvey() {
  const section = $('survey');
  if (!section) return;
  section.hidden = false;
  renderSurveyChoose();

  const refusal = $('survey-refusal');
  refusal.hidden = !surveyRefused;
  if (surveyRefused) refusal.textContent = surveyRefused;

  const drawing = $('survey-drawing');
  $('survey-fall').hidden = !survey;
  $('survey-clear').hidden = !survey;
  // Drawn whether or not a ground is cut: the traverse is a record of the desk
  // rather than of the survey, and a reader who walked somewhere with the
  // sliders and never opened a survey has still stood on those designs.
  renderTraverse();

  if (!survey) {
    drawing.hidden = true;
    renderPull();
    $('survey-coverage').textContent = '';
    $('survey-finding').textContent = '';
    $('survey-spots').textContent = '';
    $('survey-spots-scope').textContent = '';
    $('survey-axes').textContent = '';
    $('survey-lede').textContent =
      'Choose two controls and a reading, and the sheet surveys that reading over that ground — one real ' +
      'EnergyPlus run at every position. Contours and relief are drawn between the runs and carry no figure ' +
      'of their own. Standing on a measured point moves the whole of E-01 to that design.';
    for (const [id, text] of [['s-ground', '—'], ['s-reading', '—'], ['s-runs', '—']]) {
      $(id).textContent = text;
    }
    return;
  }

  drawing.hidden = false;
  const coverage = coverageOf(survey);
  $('survey-axes').textContent =
    `${labelFor(survey.x.key)} × ${labelFor(survey.y.key)}`;
  $('survey-lede').textContent =
    `${survey.readings.map((reading) => reading.label).join(' and ')} over ` +
    `${phraseFor(survey.x.key)} and ${phraseFor(survey.y.key)}, cut through the desk as it stands. ` +
    `Every figure below is a completed ${survey.annual ? 'annual' : 'design-day'} run.`;

  drawGround(survey);
  renderGroundKey(survey);
  renderPull();
  renderCoverage(survey);
  renderSurveyFinding(survey);
  renderSpots(survey);
  drawRelief(survey);

  $('survey-plan-cap').textContent =
    `${survey.readings[0].label} in ${survey.readings[0].unit} over ${labelFor(survey.x.key)} and ` +
    `${labelFor(survey.y.key)}. Ticks are measured designs and carry the only figures on this drawing; ` +
    'the contours between them are interpolation and no figure anywhere is read off them. Ground with no ' +
    'contour across it has not been measured.';
  $('s-ground').textContent = coverage.density;
  $('s-ground-sub').textContent = `${coverage.wanted} positions asked for`;
  $('s-reading').textContent = survey.readings.map((reading) => reading.label).join(' + ');
  $('s-reading-sub').textContent = survey.readings.map((reading) => reading.unit).join(' · ');
  $('s-runs').textContent = String(coverage.measured);
  $('s-runs-sub').textContent = coverage.gaps ? `${coverage.gaps} could not be run` : 'Completed simulations';
}

/**
 * Re-cut the ground where the desk has moved out from under it.
 *
 * Called from `endGesture`, the one point every gesture path already shares.
 * A move along either axis is not a move out from under: `surveyRestShape`
 * omits both, so standing on a measured point leaves the ground exactly where
 * it was, which is what US6 scenario 2 asks for and what stops the feature
 * re-measuring itself every time the reader uses it.
 */
function refreshSurvey() {
  if (!survey || !studyScheduler || !autoOn() || linkAttachPending) return;
  const rest = surveyRestShape(survey);
  if (surveyRestShape(survey, survey.stance, survey.patch) === rest) {
    // The ground still describes this desk. Only the stance mark moves.
    if (surveyPass === null && coverageOf(survey).unsurveyed > 0) refineSurvey();
    renderSurvey();
    return;
  }
  if (surveyStop === rest) return;
  surveyStop = null;
  openSurvey({
    xKey: survey.x.key,
    yKey: survey.y.key,
    readingIds: survey.readings.map((reading) => reading.id),
    extents: {
      [survey.x.key]: { from: survey.x.from, to: survey.x.to },
      [survey.y.key]: { from: survey.y.from, to: survey.y.to },
    },
  });
}

$('survey-fall').addEventListener('click', () => letItFall());
$('pull-read').addEventListener('click', () => readPull());
$('pull-more').addEventListener('click', () => {
  pullShowAll = !pullShowAll;
  renderPull();
});
// Clearing the survey takes the drawing down and touches neither `params` nor
// the document, so no solve follows — the same difference `clearAllStudies`
// keeps from Revert all beside it. The sample cache is deliberately kept: those
// runs are still true of the desks they were solved for, so re-cutting the same
// ground costs nothing.
$('survey-clear').addEventListener('click', () => {
  surveyChoice = { x: null, y: null, readings: [], extents: {} };
  surveyRefused = null;
  syncSurveyAxes();
  closeSurvey();
});

// E-02 stands from the first frame, carrying its chooser and nothing else, so
// a reader can find it before they know what it is for.
renderSurvey();

// The first instance compiled ahead of the first click, in idle time: the
// binary is an HTTP-cache hit off the pump's download, so this trades a few
// idle milliseconds for the first study starting on a warm engine.
(window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => studyPool.prewarm());

// The verdict on a link the page was opened with, now that boot has finished
// writing the status line. A refusal stops auto-solve, so no pump starts and
// the reason stays readable. A station link defers the first solve to the
// attach itself: a link minted after a station attach carries
// `sizingPeriods=No`, and solving that desk before the year arrives is a run
// with no environments at all — it fataled, stopped auto-solve, and the
// promised annual never happened. `choose` pumps when the station lands.
if (linkError) {
  refuseLink(`This link could not be read — ${linkError.message} — so the sheet is at its defaults.`);
} else if (linked?.station) {
  attachFromLink(linked);
} else if (params.sizingPeriods === 'No' && !epwText) {
  // A shared station link with its `stn` pair trimmed off still carries the
  // station's `sizingPeriods=No`. That desk holds no environments at all, and
  // pumping it would end in an engine fatal blamed on nothing — stop instead,
  // and name the actual gap.
  stopAuto();
  statusEl.className = 'status bad';
  statusEl.textContent =
    'This scheme skips the sizing days but attaches no weather, so there is nothing to solve. Set Design days to Run on the Run strip, or pick a station.';
} else if (autoOn()) {
  restoreLinkedStudies(linked);
  restoreLinkedSurvey(linked);
  pump();
} else {
  restoreLinkedStudies(linked);
  restoreLinkedSurvey(linked);
}
