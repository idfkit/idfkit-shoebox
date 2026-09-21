import { createEnergyPlus } from '@idfkit/engine';
import { httpSource, SchemaBundle, writeIdf } from '@idfkit/core';
import {
  WALLS,
  WINDOW_CONSTRUCTION,
  applyModel,
  boundaryKeyFor,
  buildModel,
  channelState,
  clearDesignDays,
  designConditionsFrom,
  designDayDatums,
  geometryFacts,
  leakageBuildUp,
  modelFacts,
  occupiedFloor,
  sampleRefusal,
  setAnnual,
  setDesignConditions,
  setSiteLocation,
  shadeGeometry,
  surfaceGeometry,
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
import { fold, mountConsole } from './console.js';
import { VALIDITY_DEPTH_RATIO, daylightByRun, depthRatio, readDaylight } from './daylight.js';
import { KINDS, convert, deltaKindOf, figureIn, inIP, kindFor, letter, onSystemChange, setSystem, suffixIn, system, unitIn } from './units.js';
import { BUDGETS, withinBudget, words } from './copy.js';
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
  pairingFix,
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
  surfaceAt,
  improvingClause,
  makeSurvey,
  pointKey,
  meshOf,
  refineOrder,
  refusesSurveyPairing,
  rowsFor,
  arrisesOf,
  blockOf,
  strataOf,
  SpotHeight,
  TraverseStop,
  passingGround,
  thresholdLevels,
  thresholdSentence,
  thresholdsAt,
  thresholdsFor,
} from './survey.js';
import { createRelief } from './relief.js';
import { PullReading, axesFrom, entryFrom, pullProbes, pullReadingFor, rankPull } from './pull.js';
import { createEnginePool, poolLimit } from './pool.js';
import { createStudyScheduler, makeStudyJob } from './scheduler.js';
import { runBundle } from './bundle.js';
import { ENERGYPLUS_VERSION, REVISION, revisionHref } from './version.js';
import { readSignature, writeSignature } from './sign.js';
import { errors, provide, trail } from './report.js';
import { END_USES, GROUPS, computeBill, meterTotal } from './bill.js';
import { assume, isRate, placeName, resolveRates } from './rates.js';
import {
  canRemember,
  climateDescription,
  climateZone,
  degreeDays,
  flavorWindow,
  forgetFile,
  here,
  nearestSites,
  rememberFile,
  rememberedBytes,
  rememberedFile,
  searchSites,
  siteName,
  siteRegion,
  unzip,
  weatherFor,
} from './weather.js';
import {
  dailyMeansCarried,
  holidayList,
  monthsCovered,
  parseEpwCalendar,
  parseEpwStartDay,
  periodCovered,
  readLocation,
  siteLocationValues,
} from './epw.js';
import { sourceFromFile, sourceFromStation } from './source.js';
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
  Reading,
  SEASON,
  WeatherFile,
  clearedCount,
  coversSeason,
  qualificationsFor,
  readCriterionA,
  readCriterionB,
  readCriterionC,
  runningMean,
} from './tm59.js';
import { qualificationsSummary } from './tm59.js';

// What each fold on the sheet says while it is shut, declared once and held to
// the summary budget at load. A summary is how a reader decides whether to open
// the fold, so one that has grown into a sentence is a paragraph in view again.
// Declared up here with the imports rather than beside the renderers: the boot
// awaits run the renderers before the lower half of this module is evaluated,
// and a `const` in its temporal dead zone throws.
const FOLD = Object.freeze(
  Object.fromEntries(
    Object.entries({
      method: 'Method',
      derivation: 'How it was read',
      criteriaCD: 'Criteria c and d',
      findingWhy: 'Why this reading',
      billLede: 'About these figures',
      sources: 'Sources',
    }).map(([key, text]) => [key, withinBudget(BUDGETS.SUMMARY, `fold summary ${key}`, text)]),
  ),
);

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
      { a: south.a, b: south.b, d: south.n.map((v) => v * off).concat(0), text: letter(KINDS.length, south.length, { digits: 2 }) },
      { a: east.a, b: east.b, d: east.n.map((v) => v * off).concat(0), text: letter(KINDS.length, east.length, { digits: 2 }) },
      {
        // The upright, stood at the corner the two faces share so it reads
        // clear of both.
        a: south.a,
        b: [south.a[0], south.a[1], z1],
        d: [(south.n[0] + west.n[0]) * off * 0.8, (south.n[1] + west.n[1]) * off * 0.8, 0],
        text: letter(KINDS.length, z1, { digits: 2 }),
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
  $('q-mean').textContent = meanC == null ? '—' : letter(KINDS.temperature, meanC, { digits: 1 });
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
    // The degree sign alone, with no C or F after it: the plate's own
    // `aria-label` names the quantity once and a gridline every 5 units has no
    // room to repeat it. The figure still converts, which is the half that
    // would otherwise letter an IP sheet's axis in Celsius.
    t.textContent = `${figureIn(KINDS.temperature, v, { digits: 0 })}°`;
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
    // The datum carried no unit at all before this, which was the one figure on
    // the plate a reader could not name. It has one now, in either system.
    t.textContent = `${d.label.toUpperCase()} ${letter(KINDS.temperature, d.value, { digits: 1 })}`;
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

function metricsFor(zone, out, run, hasOutdoor, demand = null, daylight = null) {
  const slice = (a) => a.slice(run.start, run.end + 1);
  const z = stats(slice(zone));
  const o = stats(slice(out));
  const damping = hasOutdoor && o.swing > 0.05 ? z.swing / o.swing : NaN;
  const lag = hasOutdoor ? slice(zone).indexOf(z.max) - slice(out).indexOf(o.max) : NaN;
  // `demand` is this environment's own meters, or null where there are none to
  // read — a design day, or a desk with the System strip bypassed.
  //
  // `daylight` is this environment's own median illuminance, on the same terms:
  // null on a design day, and null on a run whose occupied hours the probe
  // could not be read over. Both render as an em dash, which is what this sheet
  // letters for a reading that was asked for and did not arrive.
  return { z, o, damping, lag, hours: run.end - run.start + 1, hasOutdoor, demand, daylight };
}

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
// Each row says what it measures, how precisely, and — where a change in it is
// a different quantity from the thing itself — what its delta measures. That
// last field is the schedule's own instance of FR-009: a zone one degree warmer
// than the baseline is a temperature *difference*, and lettered through
// `temperature` the delta would carry Fahrenheit's 32 and read `+33.8 °F`.
const SCHEDULE_ROWS = [
  { label: 'Zone mean air temperature, minimum', unit: '°C', kind: 'temperature', deltaKind: 'temperatureDifference', digits: 1, marker: 'zone', at: (m) => m.z.min },
  { label: 'Zone mean air temperature, maximum', unit: '°C', kind: 'temperature', deltaKind: 'temperatureDifference', digits: 1, at: (m) => m.z.max },
  { label: 'Zone swing', unit: '°C', kind: 'temperatureSwing', digits: 1, at: (m) => m.z.swing },
  { label: 'Outdoor drybulb, minimum', unit: '°C', kind: 'temperature', deltaKind: 'temperatureDifference', digits: 1, marker: 'out', group: true, at: (m) => (m.hasOutdoor ? m.o.min : NaN) },
  { label: 'Outdoor drybulb, maximum', unit: '°C', kind: 'temperature', deltaKind: 'temperatureDifference', digits: 1, at: (m) => (m.hasOutdoor ? m.o.max : NaN) },
  { label: 'Outdoor swing', unit: '°C', kind: 'temperatureSwing', digits: 1, at: (m) => (m.hasOutdoor ? m.o.swing : NaN) },
  { label: 'Damping — zone swing ÷ outdoor swing', unit: '', kind: 'ratio', digits: 2, group: true, at: (m) => m.damping },
  { label: 'Thermal lag — outdoor peak to zone peak', unit: 'h', kind: 'count', digits: 0, at: (m) => m.lag },
  { label: 'Hours simulated', unit: 'h', kind: 'count', digits: 0, at: (m) => m.hours, locale: true, nodelta: true },
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
  { label: 'Thermal energy demand intensity — TEDI', unit: 'kWh/m²', kind: 'energyIntensityPeriod', digits: 1, demand: true, at: (m) => m.demand?.tedi ?? NaN },
  { label: 'Cooling energy demand intensity — CEDI', unit: 'kWh/m²', kind: 'energyIntensityPeriod', digits: 1, demand: true, at: (m) => m.demand?.cedi ?? NaN },
  // The one reading on this schedule that no published line judges, which is
  // why it is the one carrying a note under the table. It sits last and in its
  // own group because it is not a thermal quantity: every row above it is a
  // temperature, a rate or an intensity, and this is an illuminance at a single
  // stated point.
  //
  // Not a `demand` row, so it is never filtered out. A desk that cannot answer
  // it letters em dashes and the note says what would fix them: the probe is
  // written on every solve, so an absent figure is a reading that was asked for
  // and did not arrive rather than a channel that is not in the model.
  { label: 'Daylight at 70 % depth', unit: 'lx', kind: 'illuminance', digits: 0, group: true, daylight: true, at: (m) => m.daylight ?? NaN },
];

/**
 * How the daylight row was computed, and the four things it is not.
 *
 * In a fold, which is `CLAUDE.md`'s own division: readings, verdicts, absence
 * reasons and refusals never fold; method and citations always do. What stands
 * in view is the qualification beneath the table, which is a different
 * statement and is not this.
 */
const DAYLIGHT_METHOD =
  'EnergyPlus split flux at one reference point that dims nothing: the median of the hourly ' +
  'illuminance over the occupied hours of the weather file, with the design days excluded ' +
  'because a design day is more extreme than any day in the year it precedes. Dark occupied ' +
  'hours stay in the sample deliberately, so the figure answers to latitude, season and the ' +
  'occupancy profile: a window that lights the room for two hours of a winter working day ' +
  'and not the other six is exactly the case this exists to tell apart. It is offered to ' +
  'rank positions of this desk against each other and nothing further. The ordering was ' +
  'measured against a Radiance annual daylight coefficient chain at Spearman 0.9957 with an ' +
  'identical thirteen-point Pareto frontier; the absolute value carries no such claim. It is ' +
  'not sDA, not UDI and not a daylight factor, whatever arithmetic may resemble.';

/** One cell of the schedule, in the system showing. */
const rowText = (row, v) =>
  (row.locale ? v.toLocaleString('en-US') : figureIn(KINDS[row.kind], v, { digits: row.digits }));

/** And the unit it stands under, which the schedule letters in its own column. */
const rowUnit = (row) => unitIn(KINDS[row.kind], row.unit);

/**
 * Change against the baseline, at the precision the value is shown at.
 *
 * Formatting both sides first is the point: a shift too small to move the
 * printed number is not a reading, and printing `+0.0` beside every row during a
 * slow drag would bury the rows that did move.
 */
function deltaText(row, value, base) {
  if (row.nodelta || !Number.isFinite(value) || !Number.isFinite(base)) return '';
  if (rowText(row, value) === rowText(row, base)) return '';
  const d = value - base;
  // Through the row's *delta* kind where it declares one. This is the schedule's
  // own case of FR-009 and the one the whole temperature split exists for: a
  // change is a difference, and a difference does not carry the offset.
  const kind = KINDS[row.deltaKind ?? row.kind];
  return `${d > 0 ? '+' : '−'}${figureIn(kind, Math.abs(d), { digits: row.digits })}`;
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
      td.textContent = or(value, (v) => rowText(row, v));
      if (!Number.isFinite(value)) td.className = 'void';
      if (base) {
        const d = tr.insertCell();
        d.className = 'delta';
        d.textContent = base[i].metrics ? deltaText(row, value, row.at(base[i].metrics)) : '';
      }
    }
    const unit = tr.insertCell();
    unit.className = 'unit';
    unit.textContent = rowUnit(row) || '—';
  }
  table.append(tbody);
  keepTableSemantics(table);

  // The daylight row's qualification, written whenever that row carried a
  // figure in any column. Hidden rather than emptied when it did not: a
  // qualification with nothing to qualify is a sentence about a reading the
  // reader cannot see, and the row's own em dashes already say it was asked
  // for and did not arrive.
  const note = $('schedule-note');
  if (note) {
    const row = SCHEDULE_ROWS.find((r) => r.daylight);
    const measured = cols.some((c) => c.metrics && Number.isFinite(row.at(c.metrics)));
    note.textContent = measured ? daylightQualifier(lastOutcome?.daylightDepth) : '';
    note.hidden = !measured;

    // Built once and kept, rather than rebuilt with the table: a fold carries
    // open-or-shut state, and a reader who opened the method would have it
    // close under them on the next solve.
    const host = $('schedule-method');
    if (host) {
      if (!host.firstChild) {
        host.append(
          fold('schedule:daylight', FOLD.method, { label: 'Method for the daylight reading' },
            elem('p', 'why', DAYLIGHT_METHOD)),
        );
      }
      host.hidden = !measured;
    }
  }
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
  constructor({ id, label, noun, field, unit, quantityKind, format }) {
    // All three are quantities the spec keeps out of the conversion: energy at
    // the meter is billed in kWh, money is in the tariff's own currency, and a
    // mass of CO₂e is published in neither pounds nor kilograms by the rate
    // tables this bills from. Declared all the same, so that "does not convert"
    // is a statement the roster checks rather than three silences.
    this.quantityKind = kindFor(quantityKind, `the bill column "${id}"`);
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

  /** How this column's unit reads in the system showing. */
  get unitNow() {
    return unitIn(this.quantityKind, this.unit);
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
const headOf = (column) => (column.unitNow ? `${column.label} (${column.unitNow})` : column.label);

const group = (v, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * The site's height above sea level, lettered where the sheet letters.
 *
 * `modelFacts` hands over the metres the document holds rather than a string,
 * because `model.js` may not import `units.js`. The grouping is applied *after*
 * the conversion and not before: 5,279 ft needs its comma exactly as much as
 * 1,609 m did, and grouping the metres and then converting the string is how
 * the separator ends up in the wrong place or the figure stops being a number.
 * Hence `convert` and `unitIn` rather than `letter`, which fixes to decimals
 * and knows nothing about thousands.
 */
const siteElevation = (metres) => `${group(convert(KINDS.length, metres), 0)} ${unitIn(KINDS.length)}`;

/** The title block's location cell: coordinates from the model, height lettered here. */
const siteLine = (facts) => `${facts.site} · ${siteElevation(facts.elevation)}`;

const BILL_COLUMNS = Object.freeze([
  new BillColumn({
    id: 'metered', label: 'At the meter', noun: 'energy', field: 'metered', unit: 'kWh', quantityKind: 'billedEnergy',
    format: (v) => group(v, v < 100 ? 1 : 0),
  }),
  new BillColumn({
    id: 'cost', label: 'Cost', noun: 'a cost', field: 'cost', unit: '', quantityKind: 'currency',
    format: (v, bill) => bill.currency.format(v, Math.abs(v) < 100 ? 2 : 0),
  }),
  new BillColumn({
    id: 'carbon', label: 'Carbon', noun: 'a carbon figure', field: 'carbon', unit: 'kgCO₂e', quantityKind: 'carbonMass',
    format: (v) => group(v, Math.abs(v) < 100 ? 1 : 0),
  }),
]);

// The sheet ships with Denver's two design days, so it ships with Colorado's
// tariffs. This is not a default standing in for a missing answer -- it is the
// site the stock model actually describes, and it is replaced whole the moment
// a climate is attached.
//
// A place rather than a station, because a station is no longer the only thing
// that can say where the building is: a weather file the reader attached says
// it in the same two fields, off its own LOCATION record, and `resolveRates`
// takes whichever of them is on the desk without being told which it is.
const SHIPPED_PLACE = Object.freeze({ country: 'USA', region: 'CO' });

/**
 * The climate on the desk: a picked station, an attached file, or nothing yet.
 *
 * One at a time, always. This used to be `station`, and the rename is most of
 * the feature in one variable -- nearly everything that asked "which station"
 * was really asking "which climate", and only the link token and the picker's
 * own list ever wanted the station itself.
 */
let weatherSource = null;

/**
 * The index row the picker took, held only for the link token.
 *
 * A station is named in a link by its WMO number and its 15-year window, and
 * `flavorWindow` reads onebuilding's archive-name grammar — which `weather.js`
 * keeps exactly one copy of and which `source.js` cannot import, since that
 * module has to stay callable from a Node harness. So the row stays here,
 * beside the token it is the only input to, rather than being re-derived from a
 * URL in a second place.
 *
 * Null whenever the desk is on a file, which is what keeps the two tokens from
 * both claiming a desk that has one climate.
 */
let pickedStation = null;

/** Where the building is, for anything that prices or letters a place. */
const deskPlace = () => weatherSource?.place ?? SHIPPED_PLACE;

/** The name the sheet calls the attached climate by. */
const sourceName = (source) => source.place.city ?? source.label;

/**
 * `Denver Centennial, CO` -- the title block's location line.
 *
 * Read off the source's place rather than off the picker's row, so a file and a
 * station letter the same way, and a qualifier the file does not declare is
 * absent rather than an empty comma.
 */
const placeLine = (source) =>
  [sourceName(source), [source.place.region, source.place.country].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ');
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

/**
 * The last attempt's severe and fatal errors, as the engine parsed them, for a
 * report. Kept beside `lastBundle` rather than on it, so the bundle's manifest
 * is untouched, and read from the parsed entries rather than by matching the
 * console's `** Severe  **` markers, whose spacing is EnergyPlus's to change.
 */
let lastEngineErrors = [];

/** The published card with the Tariff strip's assumptions written over it. */
const rateCard = () => assume(resolveRates(deskPlace()), params);

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
// `key` is the priced control that moved, where one did, so the ground can skip
// a re-price that cannot move any figure on it; null re-prices everything.
function reprice(key = null) {
  if (!lastRun) return;
  bill = billFrom(lastRun);
  repriceStudies();
  repriceSurvey(key);
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
      : ` Priced at the ${tariff.source.kind.toLowerCase()} published for ${placeName(tariff.region)}.`;
  const factored = isRate(tariff) && tariff.source.id !== 'assumed'
    ? 'Never a residential tariff, and factored at its grid carbon intensity.'
    : '';
  // Three periods, not two. A weather file no longer means a year: months can
  // be taken out of the run, and a bill of ten of them has to say so, because
  // the reader's next move is to compare the total with a year's. That much
  // stays in view, since it decides how every figure below is read; the
  // pricing and the reasoning fold, one press down.
  const [view, more] = bill.wholeYear
    ? [`Metered across the ${group(bill.hours)}-hour run.${priced}`, factored]
    : bill.annual
      ? [
          `Metered across the ${group(bill.hours)} hours of the run: ${bill.months} of the year's twelve months, not a year.`,
          `Put the missing months back on the Run strip for a year's.${priced} ${factored}`,
        ]
      : [
          `These are the ${group(bill.hours)} hours of the sizing days, not multiplied up into a year; attach a weather file for a year's.`,
          `Two conditions chosen for being extreme, and a real bill for a real two days.${priced} ${factored}`,
        ];
  const lede = $('bill-lede');
  lede.textContent = view;
  if (more.trim()) lede.append(' ', fold('bill:lede', FOLD.billLede, {}, elem('span', null, more.trim())));
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
    qty.append(Object.assign(document.createElement('i'), { textContent: unitIn(KINDS.billedEnergy) }));

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
    step(
      '×',
      isRate(row.carbonRate)
        ? letter(KINDS.carbonIntensity, row.carbonRate.value, { digits: 0 })
        : row.carbonRate.what.toLowerCase(),
    );
    // `kg` rather than the column's own `kgCO₂e`, which is the build-up's
    // existing shorthand on a line that has just named the carbon rate. It is
    // sourced from the kind all the same, so the one place that decides a mass
    // of CO₂e does not convert is the roster.
    step(
      '=',
      'carbon',
      row.carbon == null ? null : `${group(row.carbon, row.carbon < 100 ? 1 : 0)} ${unitIn(KINDS.carbonMass, 'kg')}`,
    );

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
          ? `${group(row.delivered, row.delivered < 100 ? 1 : 0)} ${unitIn(KINDS.billedEnergy)} delivered ÷ ${row.divisor.value.toFixed(2)} ${row.divisor.noun}, ${row.divisor.label.toLowerCase()}`
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
      // The *denominator* converts, even though all three columns are identity
      // kinds — kWh at the meter, the tariff's own currency, kgCO₂e — because
      // what this row divides by is an area, and a US energy figure is quoted
      // per square foot. `bill.intensity` divides by `floorArea`, which is
      // square metres off the model, so the conversion belongs here and not in
      // the column.
      //
      // Converting the head alone was the defect, and it was worse than leaving
      // both in SI: measured on the page, `Per ft² of floor, per year` stood
      // over 40.7, 1.42 and 8.4 — the identical figures the `Per m²` row showed
      // — so the head contradicted every cell under it in the one direction
      // that still looks like a plausible reading.
      //
      // `convert(KINDS.area, 1)` is square feet in a square metre, and exactly
      // 1 in SI, so the SI row stays byte-identical.
      const perFloor = (v) => (Number.isFinite(v) ? v / convert(KINDS.area, 1) : NaN);
      line(null, BILL_COLUMNS.map((c) => perFloor(bill.intensity(c.field) ?? NaN)), {
        className: 'sum',
        // The row head names the area its three columns are divided by, so it
        // letters with them: `Per m²` standing over figures that had become
        // per-square-foot is the head contradicting every cell under it.
        head: `Per ${unitIn(KINDS.area)} of floor, per year`,
        base: against ? BILL_COLUMNS.map((c) => perFloor(against.intensity(c.field) ?? NaN)) : null,
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
    // Through the kind, as the build-up's own carbon rate at `step('×', …)`
    // already is. Written out here it read one rate in two systems: the meter
    // head above said `lb/MWh` and the sentence directly under it said
    // `gCO₂e/kWh`, of the same number.
    q(letter(KINDS.carbonIntensity, d.line.carbonRate.value, { digits: 0 })),
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

  // The citations are one press down, under the schedule they cite for. Each
  // meter head already carries its source's kind beside its figure, so what
  // folds is the list of datasets and their vintages, not the fact that a rate
  // was published by somebody.
  const refs = $('bill-refs');
  refs.textContent = '';
  const list = elem('span');
  list.append('Rates and factors from ');
  const sources = bill.card.sources;
  for (const [i, source] of sources.entries()) {
    if (i) list.append(i === sources.length - 1 ? ' and ' : ', ');
    if (source.url) {
      const a = document.createElement('a');
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = cited(source);
      list.append(a);
    } else {
      list.append(cited(source));
    }
  }
  list.append('.');
  refs.append(fold('bill:sources', FOLD.sources, { label: 'Sources for the rates and factors' }, list));
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
  // The paragraph is gone, so what would re-letter it goes too: a units switch
  // must not put a sentence back over a cleared plate.
  lastFinding = null;
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

// The unit rides once at the end of the triple, as `15.24 × 15.24 × 4.57 m`
// always did. This line letters the desk a study was swept on and sits on the
// card beside curve ends that convert, so left in metres it read `15.24 × 15.24
// × 4.57 m` over an axis labelled `131.2 ft`.
const shapeLabel = (p) =>
  `${figureIn(KINDS.length, p.width, { digits: 2 })} × ${figureIn(KINDS.length, p.depth, { digits: 2 })} × `
  + `${letter(KINDS.length, p.height, { digits: 2 })} · `
  + `${((p.wwrN + p.wwrE + p.wwrS + p.wwrW) * 25).toFixed(0)} % mean WWR`;

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
  // Each job says which keys its rest shape leaves out (`omits`): a study its
  // swept key, a survey row both axes. Compared against the swept key alone, a
  // row would never match and would be cancelled on every single apply,
  // including the applies the survey's own samples cause.
  //
  // Each shape is taken once per apply rather than once per job: the
  // predicate runs for every queued row and probe, a pull alone is up to
  // ninety of them, and every shape is a serialisation of the whole desk.
  const shapes = new Map();
  const shapeOmitting = (omits) => {
    const id = String(omits);
    if (!shapes.has(id)) shapes.set(id, deskKey(params, patching(), omits));
    return shapes.get(id);
  };
  studyScheduler?.cancelWhere((job) => job.restShape !== shapeOmitting(job.omits), 'moved');
  modelState = applyModel(model, params, patching());
  // The title block's Timestep cell is set once at boot and otherwise never
  // touched, so it went on lettering the build-time default after every
  // later apply. Every change to the parameters passes through here, and
  // the Solver channel's `timestep` control is one of them.
  $('t-timestep').textContent = modelFacts(model).timestep;
  SURFACES = surfaceGeometry(model);
  WINDOWS = windowGeometry(model);
  // The neighbours are real geometry and belong in the model, but not in this
  // drawing: an obstruction a hundred metres off would set the viewBox and
  // leave the building a speck. The Context strip reads its altitude instead.
  SHADES = shadeGeometry(model).filter((s) => !s.context);
  renderAxon(lastMean);

  const facts = geometryFacts(model);
  renderQuantities(facts);

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
 * The panel of quantities under the drawing, lettered off the geometry.
 *
 * Its own function rather than a block inside `applyGeometry`, because a units
 * switch has to re-letter it and must not go anywhere near `applyGeometry`:
 * that is where studies in flight are cancelled against their rest shape, and
 * a reader who changed units mid-sweep would lose every sample. Nothing here
 * reads `params` — it is all measured off the document — so calling it twice
 * for one desk letters the same figures twice.
 */
function renderQuantities(facts) {
  const m2 = (v) => letter(KINDS.area, v, { digits: 1 });
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
  $('q-volume').textContent = letter(KINDS.volume, facts.grossVolume, { digits: 1 });
  $('q-compact').textContent = Number.isFinite(facts.compactness)
    ? letter(KINDS.inverseLength, facts.compactness, { digits: 3 })
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
      ? `${letter(KINDS.length, facts.overhang, { digits: 2 })} · PF ${facts.projection.toFixed(2)}`
      : 'None';
}

/**
 * The paragraph under the plate: what the reader drew, then what the run made
 * of it.
 *
 * Takes a record rather than closing over the solve that produced it, and that
 * is the whole reason it lives out here. It was an arrow function assigned to
 * `lastFinding` from inside `solve`, which reads well and is expensive in a way
 * that does not show: a closure keeps its entire enclosing context alive, and
 * that context is shared with `file` and the elapsed-time interval, so it held
 * the run's full IDF text, the whole EPW file and the parsed ESO. Being
 * module-level and replaced only by the next solve, the *previous* run's
 * megabytes stayed pinned underneath the new one's for the length of every run
 * — to re-letter about eight numbers.
 *
 * Everything it letters is in `f`, and everything in `f` is small: the metrics,
 * a demand pair, two nouns and the description's inputs.
 */
function paintFinding(f) {
  const q = (text, hot) =>
    Object.assign(document.createElement('span'), { className: hot ? 'q hot' : 'q', textContent: text });
  const { m } = f;
  const finding = $('finding');
  finding.textContent = '';
  // The description first, then what the run made of it. Two sentences about
  // the same building: the first is what the reader drew, the second is the
  // only thing on this sheet that says what drawing it that way did.
  //
  // Rebuilt rather than replayed, because `describeDesk` returns tokens that
  // are already lettered — figure and unit word both — so a units switch cannot
  // re-letter them in place and the paragraph would stand half in feet.
  for (const token of describeDesk(f.describeInput)) finding.append(typeof token === 'string' ? token : q(token.q));
  let why = null;

  if (f.demand?.tedi != null && f.demand?.cedi != null) {
    // The redline goes on whichever way this building leans, because that is
    // the finding — a Denver year asks five times more cooling than heating,
    // and the pen is the only thing in the sentence that says so. Summing the
    // two was tried and is gone: a total of the demand side has no published
    // definition and no benchmark behind it, and the bill's per-m² row is the
    // figure anyone actually holds a building against.
    finding.append(
      'Holding the setpoints across ',
      f.billedCount === 1 ? `the ${f.billedNoun}` : `${RUN_TALLY[f.billedCount]} run periods`,
      ' asks ',
      q(figureIn(KINDS.energyIntensityPeriod, f.demand.tedi, { digits: 1 }), f.demand.tedi >= f.demand.cedi),
      ` ${unitIn(KINDS.energyIntensityPeriod)} of heat into the zone and `,
      q(figureIn(KINDS.energyIntensityPeriod, f.demand.cedi, { digits: 1 }), f.demand.cedi > f.demand.tedi),
      ` ${unitIn(KINDS.energyIntensityPeriod)} back out of it.`,
    );
    why = 'The demand the envelope sets, before the plant efficiencies the bill below divides it by.';
  } else if (f.conditioned) {
    // The setpoints are in the description above, so this says what the unit
    // actually held rather than restating them: under an unmet hour the two
    // are different numbers, and that difference is the reading. It does not
    // say "holds" either, for the plainer reason that the sentence before it
    // has just said "holding".
    finding.append(
      'The zone sits between ',
      q(figureIn(KINDS.temperature, m.z.min, { digits: 1 })),
      ` ${unitIn(KINDS.temperature)} and `,
      q(figureIn(KINDS.temperature, m.z.max, { digits: 1 }), true),
      ` ${unitIn(KINDS.temperature)} over the ${f.leadNoun}.`,
    );
    why =
      'Demand intensities need a run period to read over — a sizing day is a condition, not a period — so attach a weather file and TEDI and CEDI join the schedule above.';
  } else if (Number.isFinite(m.damping)) {
    // "With no heating or cooling anywhere in this model" used to open this, and
    // "alone" already says it: the branch is only reached free-running.
    finding.append(
      'The envelope alone takes the ',
      f.leadNoun,
      "'s ",
      // A swing is a difference, so `temperatureSwing`: through `temperature`
      // these two would carry Fahrenheit's 32 and a 14 °C swing would read as
      // a 57 °F one, which is a plausible-looking number and wrong.
      q(figureIn(KINDS.temperatureSwing, m.o.swing, { digits: 1 })),
      ` ${unitIn(KINDS.temperatureSwing)} outdoor swing down to `,
      q(figureIn(KINDS.temperatureSwing, m.z.swing, { digits: 1 }), true),
      ` ${unitIn(KINDS.temperatureSwing)} in the zone — a damping ratio of `,
      q(m.damping.toFixed(2)),
      m.lag > 0 ? ' — and delays the peak by ' : '.',
    );
    if (m.lag > 0) finding.append(q(String(m.lag)), m.lag === 1 ? ' hour.' : ' hours.');
  } else {
    finding.append(
      'Left free-running, the zone floats between ',
      q(figureIn(KINDS.temperature, m.z.min, { digits: 1 })),
      ` ${unitIn(KINDS.temperature)} and `,
      q(figureIn(KINDS.temperature, m.z.max, { digits: 1 }), true),
      ` ${unitIn(KINDS.temperature)} — held there by nothing but the envelope.`,
    );
  }
  // The reading stays in the paragraph and the reason for it folds, inside the
  // paragraph rather than beside it: every exit that clears the finding clears
  // it with `textContent = ''`, so a fold living inside goes with it, and
  // `.finding:empty` never leaves a summary standing under nothing.
  if (why) finding.append(fold('finding:why', FOLD.findingWhy, {}, elem('span', null, why)));
}

/**
 * Commit one control, from wherever it was turned.
 *
 * `done` marks the end of a gesture — a pointer release or the keyboard's
 * commit — which is where the annual run solves and where a design day catches
 * its last shape.
 */
// Whether the gesture in hand has moved a key that reaches the IDF, which is
// what earns it a traverse stop on release. Asked of the gesture rather than of
// the key that releases it: standing on a point is two commits, and with axis Y
// priced the release is Y's while the building moved along X.
let gestureShaped = false;

function commit(key, value, done = false) {
  if (params[key] !== value) {
    // A priced control changes what the energy was worth, not how much of it
    // there was, so it re-letters the bill from the meters already in hand and
    // never asks the engine for anything. It still opens a gesture, because the
    // bill still wants a ghost of where it stood when you took hold.
    const priced = PRICED_KEYS.has(key);
    beginGesture({ priced });
    if (!priced) gestureShaped = true;
    params[key] = value;
    // Lettered by the declaration, so the trail names a control exactly as
    // the desk does; keyed, so a drag collapses to where it came to rest.
    trail.push('control', `${labelFor(key)} ${formatValue(key, value)}`, { key });
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
    if (priced) reprice(key);
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
    // A gesture of priced keys alone adds no stop (FR-017a): the traverse is a
    // record of buildings.
    if (gestureShaped) recordTraverse();
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
/**
 * The instant the desk's meters are reading.
 *
 * It holds the *value*, not the sentence. Composed as a lettered string this was
 * a stored label of exactly the kind the units notes warn about: `reletterSheet`
 * hands `lastAt` straight back to the console, so the pin line kept whichever
 * system the run was solved in and went on reading `zone 32.7 °C` under an IP
 * sheet until some later run happened to replace it. Measured on the page, not
 * reasoned about — the sheet-wide scan for surviving SI tokens found it.
 *
 * `text` is a getter for that reason: both readers, the sheet's own pin line and
 * the console's, ask at draw time, and neither had to be touched.
 */
class ReadInstant {
  constructor({ stamp, celsius, pinned, released }) {
    this.stamp = stamp;
    // The temperature off `points` rather than the plate's parallel array of
    // bare values: the same number, and one series to be indexed by one instant
    // is one fewer thing that can be sliced differently.
    this.celsius = celsius;
    this.pinned = pinned;
    this.released = released;
    Object.freeze(this);
  }

  /**
   * Lettered exactly as the rail's own warmest and coolest instants are — same
   * kind, same precision — because it is the same quantity read at another hour.
   */
  get text() {
    return `${this.stamp} · zone ${letter(KINDS.temperature, this.celsius, { digits: 1 })}`;
  }
}

let lastAt = null; // the instant the desk's meters are reading

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
      // The envelope area and the zone volume are the reader's own geometry and
      // letter where they are working. The rest of the line does not: the
      // coefficient is the field the engine is actually given, in the units the
      // IDF holds it in, and the density, the reference pressure and the
      // exponent are the blower-door convention's own constants. This line
      // exists so the reader can redo the arithmetic against the model, and a
      // converted coefficient would be arithmetic about a field that is not
      // there.
      `${b.coefficient.toFixed(3)} kg/s at 1 Pa over ${letter(KINDS.area, b.area, { digits: 1, ipDigits: 0 })} of envelope\n` +
        `${b.ach} ACH · ${letter(KINDS.volume, b.volume, { digits: 1, ipDigits: 0 })} / 3600 · ${b.density} kg/m³ / ${b.deltaP}^${b.exponent}`,
    );
  }
  return lines;
}

function derivedReadings(facts) {
  const hours = runHours();

  return new Map([
    ['massing', Number.isFinite(facts.compactness) ? letter(KINDS.inverseLength, facts.compactness, { digits: 3 }) : '—'],
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
        ? `${letter(KINDS.area, facts.grossRoofGlazing, { digits: 1 })} · SRR ${facts.srr.toFixed(3)}`
        : 'None',
    ],
    ['shading', facts.grossShadeArea > 0 ? letter(KINDS.area, facts.grossShadeArea, { digits: 1 }) : 'None'],
    ['solver', `${params.timestep} / hour`],
    ['run', lastHours ? `${lastHours.toLocaleString('en-US')} solved` : `${hours.toLocaleString('en-US')} to solve`],
    // What the plant has to buy to deliver the heat the system moved. Reads an
    // em dash until something has been solved, because it is a meter reading
    // and there is no meter reading before a run.
    [
      'plant',
      (() => {
        const heat = bill?.lines.find((l) => l.use.id === 'heating');
        // `billedEnergy`, not `energy`: this is what the plant had to buy, and
        // a US utility bills it in kWh (spec assumption). The demand readings
        // elsewhere on the sheet are heat, and those convert.
        return heat ? `${letter(KINDS.billedEnergy, heat.metered, { digits: 0 })} ${heat.fuel.label.toLowerCase()}` : '—';
      })(),
    ],
    // What the site bought around the building. Same rule as the plant's
    // reading: it is a meter reading, so it is an em dash until a run has put
    // one in hand.
    [
      'grounds',
      (() => {
        const ext = bill?.lines.find((l) => l.use.id === 'exterior');
        return ext ? letter(KINDS.billedEnergy, ext.metered, { digits: 0 }) : '—';
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
    // The U-factor's unit rides inside `letter` rather than being appended
    // after it, which is what stops the figure and its unit being composed in
    // two places; SHGC and visible transmittance are fractions and carry none.
    const trio = (t) =>
      `U ${or(t.u, (v) => letter(KINDS.transmittance, v, { digits: 2 }))} · SHGC ${or(t.shgc, (v) => v.toFixed(2))} · VT ${or(t.vt, (v) => v.toFixed(2))}`;
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
 * What stands beside the daylight figure, in view and never in a fold.
 *
 * Three statements, and each is there because leaving it out would let the
 * figure be read as something it is not:
 *
 *   - **where the point stood.** A single-point illuminance quoted without its
 *     position is a number a reader cannot interpret, and it is the one thing
 *     they cannot recover from the figure itself (FR-015). Asked of the
 *     qualification as a thunk, so the height in it letters in the system
 *     showing rather than the one the page booted in.
 *   - **that nothing published judges it** (FR-007). Every other reading on this
 *     sheet can be held against somebody's line. This one cannot, and a figure
 *     that looks like every other figure while being a ranking instrument is
 *     worse than no figure at all.
 *   - **that the method's own limit has been passed**, where it has (FR-006).
 *     The shipped desk is 15.24 m deep under a 4.572 m ceiling, which is 3.33
 *     times, so this is visible on first load and is not an edge case.
 *
 * `CLAUDE.md` sends method and citations to a fold, and they are in one: the
 * readout's note. What is here is the reading's position and its two
 * qualifications, which are the three things the fold ban names.
 *
 * The sentence itself is **not** composed here. It is `qualified.say(ratio)` on
 * the roster quantity, so any surface that letters this reading letters the same
 * words without being taught them. Composed here, the roster's `qualified` field
 * was a promise nothing kept: the study card and the E-02 relief would have
 * lettered the figure bare and the load assertion guarding the field would still
 * have passed. Asked at render, so `CEILING` is asserted once at load against
 * the worst case rather than thrown mid-render — the shape `FILE_SAYS.waiting`
 * keeps, and the reason `copy.js` marks the budget `asserted: false`.
 */
const daylightQualifier = (ratio) => QUANTITY_BY_ID.daylight.qualified.say(ratio);

// The worst case is the shipped desk, which takes the validity clause on first
// load, so the budget is asserted against a ratio past the limit rather than
// against the two-clause form nobody will ever see alone.
withinBudget(BUDGETS.CEILING, 'the daylight qualifier', daylightQualifier(VALIDITY_DEPTH_RATIO + 0.34));

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
    ? new ReadInstant({
        stamp,
        celsius: points[at].value,
        pinned: Boolean(pinnedHour),
        released: released ? hourPinText(released) : null,
      })
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
      // `NEUTRAL_C` is this sheet's own neutral point, not a published figure
      // quoted from somewhere, so it converts like any other temperature on the
      // desk. The gap beside it is a *difference* and goes through the
      // difference kind: lettered through `temperature` it would carry
      // Fahrenheit's 32 and a 3 K gap would read as 37 °F off neutral.
      blurb: `The hour the lead environment is furthest from ${letter(KINDS.temperature, NEUTRAL_C, { digits: 0 })} — where the meters read when nothing is held.`,
      sub: `${stampText(points, freeAt)} · ${letter(KINDS.temperatureDifference, Math.abs(points[freeAt].value - NEUTRAL_C), { digits: 1, ipDigits: 1 })} off ${letter(KINDS.temperature, NEUTRAL_C, { digits: 0 })}`,
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
            : `${stampText(points, offer.at)} · ${instant.say(
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
  trail.push('patch', `${CHANNELS.find((c) => c.id === id).name} patched ${off ? 'out' : 'in'}`);
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

/* ══ units: SI or IP ═════════════════════════════════════════════════════ */

/**
 * Whether this browser will keep anything, probed with a real write.
 *
 * Merely reading `localStorage` is not enough of a test: a browser with site
 * data switched off, and Safari in private browsing, hand over an object that
 * looks perfectly serviceable and throws on the first `setItem`. Finding that
 * out at the moment somebody presses Save is finding it out one press too
 * late, so the probe happens here and both readers say up front that they
 * cannot keep anything.
 *
 * It lives **here**, above the units toggle, rather than down with the scheme
 * shelf that first needed it. The toggle reads it while the page is still
 * booting, and a `const` declared after the reader is in its temporal dead zone
 * however far down the file it sits: the whole boot died on
 * `Cannot access 'shelfStore' before initialization`, the sheet came up with a
 * panel of em dashes, and nothing on the page said why. The shelf reads it
 * hundreds of lines below and does not care where it was declared.
 */
/**
 * The station the picker's sub-line letters, held so a unit switch can redraw it.
 *
 * That line is written once when a station is attached and then stands for the
 * session, so its elevation was the one figure under the picker with no route
 * back to `reletterSheet`: it would have kept its metres under an IP sheet until
 * the reader happened to choose another city. Held as the station rather than as
 * the composed string, by the sheet's own rule — a string cannot be re-lettered.
 */
let sitePicked = null;

/**
 * Whether a source's own records run 1 January to 31 December.
 *
 * The question every reading that wants a year asks, and it is asked of the
 * *records* rather than of the `DATA PERIODS` header, because `periodCovered`
 * reads the ends off the data for exactly this: a file truncated mid-download
 * declares a year and carries nine months of one.
 */
const wholeYear = (period) =>
  period.from.month === 1 && period.from.day === 1 && period.to.month === 12 && period.to.day === 31;

/**
 * The stretch a weather file covers, in the sheet's own words.
 *
 * `1 Jun – 31 Aug`, and the interval beside it where the file is not hourly —
 * four records an hour is a fact about the file the reader cannot see anywhere
 * else, and it is the difference between 8,760 rows and 35,040. A whole hourly
 * year says `whole year` rather than `1 Jan – 31 Dec`, because a reader reading
 * a sub-line wants the answer and not the arithmetic behind it.
 */
const periodSaid = (period) => {
  const said = wholeYear(period)
    ? 'whole year'
    : `${period.from.day} ${MONTHS[period.from.month - 1]} – ${period.to.day} ${MONTHS[period.to.month - 1]}`;
  return period.perHour === 1 ? said : `${said}, ${period.perHour} records an hour`;
};

/**
 * Whether the run's calendar asks for months the attached file has not got.
 *
 * One predicate, asked in two places, because the two would otherwise disagree
 * about the same desk. `solve` asks it to refuse the run before the engine
 * reaches a month with no records in it; `attachClimate` asks it so that the
 * sentence it letters on the attach is the refusal rather than a description of a
 * run that is not going to happen — the attach sentence is written after the
 * commit that starts the solve, so it lands *after* the refusal and would be the
 * last thing the reader is left holding.
 *
 * `monthsCovered` counts only **whole** months, because `applyRun` writes a
 * `RunPeriod` from the first of a contiguous group to the last, and a month the
 * file carries half of cannot be run at all.
 *
 * False for a station and for a desk with nothing attached: an archive is a year,
 * and a desk with no file has no extent to fall outside.
 */
function monthsOutsideFile(p = params) {
  if (weatherSource?.kind !== 'file' || !weatherSource.period) return false;
  const carried = monthsCovered(weatherSource.period);
  return [...p.months].some((on, month) => on === '1' && carried[month] !== '1');
}

/** That refusal, in the one wording, from whatever is attached. */
const fileMonthsRefusal = () =>
  FILE_SAYS.monthsOutside(sourceName(weatherSource), periodSaid(weatherSource.period));

function renderSiteSub() {
  if (!sitePicked) return;
  const source = sitePicked;
  // `climateZone` and `climateDescription` split one published string, and the
  // grammar for that split lives in `weather.js` and stays there: the source
  // carries the label whole. An attached file carries null, because a file
  // declares no ASHRAE zone and there is nothing to infer one from -- so the
  // chip letters the em dash `climateZone` already returns for a station whose
  // index row is blank, which is the same fact arriving by another road.
  const zoned = { ashraeClimateZone: source.climateZone ?? '' };
  const zone = document.createElement('span');
  zone.className = 'cz';
  zone.textContent = climateZone(zoned);
  $('site-sub').replaceChildren(
    zone,
    // A space, so the chip and the line beside it are two things read aloud as
    // two things. The chip's padding separates them on screen; a screen reader
    // gets the markup, where `5A` and `Cool, Humid` were running together.
    document.createTextNode(' '),
    document.createTextNode(
      [
        climateDescription(zoned),
        // A station is one of five samples of a site and the flavour is which;
        // a file is itself, and its name is the only honest label for it.
        source.kind === 'station' ? `TMYx ${source.label}` : source.label,
        // What the file actually carries, off its own first and last record
        // (FR-010). Lettered for every attached file, including the ordinary
        // whole year — a reader assessing against a purchased DSY needs to see
        // that this page read its extent rather than assumed one. For a station
        // it is lettered only where it is *not* a whole hourly year, which means
        // an archive that arrived truncated: onebuilding's are years, the
        // flavour above already says which, and a `1 Jan – 31 Dec` on every
        // station line is a word the reader has to step over to reach the ones
        // that matter.
        source.kind === 'file' || !wholeYear(source.period) || source.period.perHour !== 1
          ? periodSaid(source.period)
          : null,
        // Measured off the file's own hours or published by the index, and the
        // reading says which -- a figure this page computed and a figure it is
        // repeating are not the same claim.
        sourceDegreeDays(source),
        siteElevation(source.place.elevation),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  );
}

/**
 * The degree days under the picker, and where they came from.
 *
 * The station index publishes HDD18 and CDD10 per station; an attached file
 * publishes nothing, so they are summed here out of the 365 daily means the
 * comfort line already pays for. Two different provenances lettered identically
 * would be the page claiming, of a figure it computed, the authority of one
 * somebody else published — so the measured ones say so, in the word.
 *
 * The bases stay Celsius in both unit systems for the reason `weather.js` gives
 * where it letters a station's: HDD18 is a published statistic on an 18 °C base,
 * and converting the count while the label still read 18 would be arithmetic
 * nobody can check.
 */
function sourceDegreeDays(source) {
  const days = source.degreeDays;
  if (!days) return '';
  // No counts and a sentence saying why, which is what a file cut to a season
  // carries: a degree-day total is a year's, and 153 days of one summed anyway
  // would read as an extraordinarily mild climate beside a published figure
  // taken over twelve months. Lettered in place of the figure rather than
  // dropped, on the rule that missing renders as an em dash with its reason —
  // the counts simply vanishing from this line is indistinguishable from a
  // reading nobody asked for.
  if (days.reason) return `— HDD18 · CDD10: ${days.reason}`;
  // Rounded, because a degree day is a count of degree-days and the index
  // publishes it as one. Summed over 365 daily means it comes out with a
  // fraction on it -- `2,812.204 HDD18` is four digits of precision this
  // arithmetic does not have, beside a published figure written as `2,801`.
  const said = [
    Number.isFinite(days.hdd18) ? `${Math.round(days.hdd18).toLocaleString('en-US')} HDD18` : null,
    Number.isFinite(days.cdd10) ? `${Math.round(days.cdd10).toLocaleString('en-US')} CDD10` : null,
  ].filter(Boolean);
  if (!said.length) return '';
  return `${said.join(' · ')} · °C bases${days.measured ? ', measured from this file' : ''}`;
}

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

/**
 * Re-letter the whole sheet in the system now showing.
 *
 * Every figure on the page, from state already in hand. It starts no run,
 * queues no solve, interrupts none in flight, marks nothing stale and touches
 * no parameter — a unit system is how a number reads, and no number has moved.
 *
 * It deliberately does **not** call `applyGeometry`, which is the obvious thing
 * to reach for and would be wrong twice over: that is where studies in flight
 * are cancelled against their rest shape, so a reader who switched units
 * mid-sweep would lose every sample, and it re-applies the desk to the document
 * for a change that cannot have moved it.
 */
function reletterSheet() {
  desk?.reletter();
  // The sheet's own five sliders keep their own copies of the faces.
  for (const redraw of Object.values(syncSlider)) redraw();
  if (model) {
    const facts = geometryFacts(model);
    renderQuantities(facts);
    desk?.setReadings(engagedReadings(), derivedReadings(facts), lastAt, readouts());
    desk?.setDerived(derivedLines());
    // The title block's own height, lettered here because `model.js` may not
    // import `units.js` and so hands over the metres rather than the string.
    $('t-site').textContent = siteLine(modelFacts(model));
  }
  // The line under the picker, from the station held for exactly this.
  renderSiteSub();
  renderAxon(lastMean);
  renderTrace();
  // Unguarded, and that guard was a bug: `null` columns is not "skip the
  // schedule", it is the same empty table `clearReadings` draws, and it still
  // has a unit column to letter. Guarded on `solvedColumns` the rows stood in
  // °F under a sheet that had been switched back to SI, because before the
  // first run there is nothing to re-render and after a clear there is nothing
  // to re-render either — which is exactly when the stale units show.
  renderSchedule(solvedColumns, baseline?.columns);
  renderBill();
  renderRegister();
  renderWhen();
  // E-02, which this list forgot. `Reading.figure` and `Reading.unitNow` were
  // added for the relief's standing axis, the plan's contour labels and the
  // spot figures — every one of them drawn from here and from nowhere the rest
  // of this function reaches, so a switch left the whole survey in the system
  // it was cut in until some unrelated gesture happened to redraw it. Through
  // `renderSurveySoon` rather than `renderSurvey` because that is the entry
  // point the other six callers use, and it costs nothing when no ground is cut.
  renderSurveySoon();
  // And E-02's *chooser*, which `renderSurvey` does not reach at all: its only
  // two callers are a refused extent and the boot. The Reading cell letters each
  // offer's unit, so without this line the list a reader picks a ground from
  // stands in whichever system the page booted in, for the whole session. Found
  // by driving: a sheet booted in IP went on offering `High °F` after switching
  // to SI. The cache guard inside it now carries the system, so this call is a
  // no-op on every re-letter that is not a switch.
  renderSurveyChoose();
  // And the ranking beside it, which `renderSurveySoon` does not reach. Its
  // "Per unit" and "Room left" columns letter off the control at draw time, so
  // an entry outlives a switch and has to be asked again — the same omission
  // E-02 itself was fixed for, one table along.
  renderPullSoon();
  // The offers and the status line beside the cards. The cards themselves are
  // rebuilt by `desk.reletter()` above, and deliberately not from here: passing
  // `setStudy` the same study object again hits its identity guard and only
  // restyles, which is what makes a drag cheap — so re-issuing the studies from
  // out here could never re-letter them, however much it looked as though it
  // should.
  syncStudies();
  // And the paragraph under the plate, from the record the run left behind.
  if (lastFinding) paintFinding(lastFinding);
}

const UNITS_STORE = 'shoebox-units-v1';

/**
 * The reader's remembered choice, or null where there is none to read.
 *
 * Through the same real-write probe the scheme shelf uses: a browser with site
 * data switched off hands over a `localStorage` that looks serviceable and
 * throws on the first write, and anything that is not one of the two systems is
 * treated as absent rather than guessed at.
 */
const rememberedUnits = () => {
  try {
    const said = shelfStore?.getItem(UNITS_STORE) ?? null;
    return said === 'si' || said === 'ip' ? said : null;
  } catch {
    return null;
  }
};

/**
 * What a reader who has never chosen sees: IP where the browser reports a
 * United States region, SI everywhere else and where it reports no region.
 *
 * `navigator.language` is a platform value, so this needs no request and
 * reaches nothing but the lettering — FR-003 and FR-017 keep it there. A wrong
 * guess costs one press of the toggle.
 */
const firstVisitUnits = () => {
  const tag = navigator.languages?.[0] ?? navigator.language ?? '';
  let region = null;
  try {
    region = new Intl.Locale(tag).region ?? null;
  } catch {
    // An older browser, or a tag `Intl.Locale` refuses. The region subtag is
    // two letters after the language, which is the whole of what is wanted.
    region = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(tag)?.[1] ?? null;
  }
  return region?.toUpperCase() === 'US' ? 'ip' : 'si';
};

const unitSegments = [...$('units-group').querySelectorAll('[data-system]')];

/** Draw which system is showing, in fill and in words both. */
function syncUnits() {
  for (const button of unitSegments) {
    const here = button.dataset.system === system();
    button.classList.toggle('here', here);
    button.setAttribute('aria-checked', String(here));
    // One tab stop for the group, arrow keys within it, as a radiogroup owes.
    button.tabIndex = here ? 0 : -1;
  }
}

function chooseUnits(next) {
  if (next === system()) return;
  // `setSystem` notifies the one subscriber, `reletterSheet`, and it does so
  // synchronously — before this function has drawn the control. So the sync is
  // in a `finally`: whatever the re-letter does, the segments end up saying what
  // `system()` actually returns.
  //
  // Without it the toggle lies, and lies in the worst available way. A throw
  // anywhere in the re-letter propagates out of `setSystem`, `syncUnits` never
  // runs, and the fill stays on the old system while the page has already
  // changed — a control showing the opposite of the state it governs, with
  // nothing said. The error still reaches the window trap and the Report slip,
  // which is where a failure belongs; what it may not do is leave the reader
  // looking at a switch that appears not to have worked.
  try {
    setSystem(next);
  } finally {
    syncUnits();
  }
  try {
    shelfStore?.setItem(UNITS_STORE, next);
  } catch {
    // Said up front beside the toggle rather than discovered here: the line
    // under it already states that this browser will not remember the choice.
  }
  $('units-said').textContent = `${next.toUpperCase()}. Every figure on the sheet re-lettered.`;
}

for (const [at, button] of unitSegments.entries()) {
  button.addEventListener('click', () => chooseUnits(button.dataset.system));
  button.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = unitSegments[(at + step + unitSegments.length) % unitSegments.length];
    next.focus();
    chooseUnits(next.dataset.system);
  });
}

// Where the browser will not keep it, the sheet says so in place — never on
// hover, and before the reader presses rather than after.
$('units-forgets').hidden = Boolean(shelfStore);

// Both always-visible strings this feature adds, against the same budget every
// other standing line on the sheet is held to.
withinBudget(BUDGETS.STANDING, 'the units standing line', $('units-standing').textContent);
withinBudget(BUDGETS.STANDING, 'the units storage line', $('units-forgets').textContent);

// Set before subscribing, so booting into a remembered IP does not re-letter a
// sheet that has not been drawn yet.
setSystem(rememberedUnits() ?? firstVisitUnits());
syncUnits();
onSystemChange(reletterSheet);

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
  gestureShaped = false;
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
            ? letter(KINDS.distance, row.distanceKm, {
                digits: row.distanceKm < 10 ? 1 : 0,
                ipDigits: row.distanceKm < 10 ? 1 : 0,
              })
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
  trail.push('station', `${siteName(picked)}, ${siteRegion(picked)}, WMO ${picked.wmo ?? '—'}`);
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
    trail.push('refusal', `Station refused: ${message}`);
    lastStationRefusal = message;
    site.classList.remove('picked');
    $('site-main').textContent = 'Choose a weather location';
    // The held station goes with the line it letters. Left standing, a later
    // unit switch would redraw the refused city over the placeholder — the
    // sheet asserting a climate it does not have.
    sitePicked = null;
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

  return attachClimate(sourceFromStation(picked, files, pick.label), {
    sizing,
    studyContext,
    conditions,
    station: picked,
  });
}

/**
 * Put a climate on the desk: the one path, whatever supplied it.
 *
 * A station and a file arrive completely differently — one is a few hundred
 * kilobytes through a proxy with a spinner over it, the other is a dialog and a
 * `FileReader` — and from the moment the bytes exist they are the same event,
 * so they share one path from here. That is not tidiness. Eight things happen
 * below and six of them are clears, each carrying the mismatch it exists to
 * prevent: curves sampled under the departed weather, spot heights that are
 * runs against it, 365 daily means of one city's year, a bill pricing one
 * city's energy at another's tariffs, a target read in Denver answering for a
 * building in Bavaria. A second attach path would have to repeat all six, and
 * the failure mode of getting one of them wrong is not a crash — it is a
 * reading that looks right under the wrong title block.
 *
 * `conditions` is the parsed design conditions where the source came with a
 * DDY, and null where it did not. A file attached without one leaves the desk
 * with **no design days at all** rather than Denver's: `model.js:2329` records
 * that nothing here is autosized, so a document carrying none is complete, and
 * the alternative is the exact lie in ink the picker's own DDY refusal exists
 * to prevent.
 */
function attachClimate(source, { sizing = 'No', studyContext = null, conditions = null, station = null } = {}) {
  sitePicked = source;
  // The field, from here rather than from the picker, because a file never goes
  // through the picker at all and a field still reading "Choose a weather
  // location" over an attached year is the sheet not knowing what it is solving.
  site.classList.add('picked');
  $('site-main').textContent = placeLine(source);
  // Set together, so a desk cannot be on a file while the link still names the
  // station it was on a moment ago.
  pickedStation = station;
  renderSiteSub();

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
  // And the extent with it, on the same identity and for the same reason: 1 May
  // to 30 September is a fact about the file that just left.
  periodCache = null;

  // The whole climate arrives together: the year on the EPW, the design days
  // and the location on the DDY. Denver's come out, this station's go in.
  epwText = source.epw;
  if (conditions) {
    setDesignConditions(model, conditions);
  } else {
    // No DDY came with this file, so there are no design conditions to write —
    // and Denver's cannot be left standing under this file's title block, which
    // is the lie in ink the picker's own DDY refusal exists to prevent. The
    // place still comes off the file: `Site:Location` is the one thing an EPW's
    // own LOCATION record can supply without a design day anywhere near it.
    //
    // The design days go rather than being zeroed, on `applyModel`'s own rule
    // that bypass removes and does not zero, and the desk runs the file's year
    // alone. `sizingPeriods` is committed to 'No' below, and the Run strip
    // withdraws the choice with its reason rather than offering a run that
    // would reach the engine with nothing to size on.
    clearDesignDays(model);
    setSiteLocation(model, {
      name: source.place.city ?? source.label,
      values: siteLocationValues(source.place),
    });
  }
  desk?.setWeatherHolidays(weatherHolidays(source.epw), parseEpwStartDay(source.epw));

  // The drawing follows the weather, and reads it off the model exactly as it
  // did for Denver: the datum lines from the design days, the co-ordinates from
  // `Site:Location`. Only the place name comes from the picker.
  $('t-location').textContent = placeLine(source);
  $('t-site').textContent = siteLine(modelFacts(model));
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
  weatherSource = source;
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
  // Both periods, where the file has fewer months than the year and the calendar
  // already fits inside them. `runHours()` alone is the desk's calendar and says
  // nothing about the year behind it (FR-010); the two do not compete here,
  // because the case where they would disagree is the refusal below.
  const covers =
    source.kind === 'file' && !wholeYear(source.period)
      ? `it covers ${periodSaid(source.period)}, and the run covers ${hours} hours`
      : `the run covers ${hours} hours`;
  // A calendar the file cannot cover is a refusal, not an attach sentence. The
  // pump the commit above started has already written that refusal into this same
  // row, and this line is what the reader is left holding: a cheerful "attached"
  // over a desk that has just declined to solve is the sheet disagreeing with
  // itself in one row, and the reader believing the more recent half.
  const outside = monthsOutsideFile();
  statusEl.className = outside ? 'status bad' : 'status';
  statusEl.textContent = outside
    ? fileMonthsRefusal()
    : sizing === 'Yes'
      ? `${sourceName(source)} attached, design conditions and all — ${covers}, sizing days included.`
      : conditions
        ? `${sourceName(source)} attached, design conditions and all — ${covers}, with the sizing days skipped.`
        // Said plainly rather than left for the reader to notice the datum lines
        // missing: a file with no DDY beside it is a complete climate for a
        // year and no climate at all for a design day, and those are two
        // different things to know about the desk you are now on.
        : `${sourceName(source)} attached — ${covers}. No DDY came with it, so the desk has no design days.`;
  syncAuto();
  markStale();
  // Filed on the attach itself, wherever it came from: a reader arriving on a
  // station link has a year genuinely attached, and the notes record what has
  // happened on this desk, not who did it.
  tour?.note('station');
  return true;
}

/* ── a weather file the reader holds ──────────────────────────────────────
 *
 * The picker above reaches climate.onebuilding.org, and that is every file this
 * page can fetch for itself. It is not every file a reader needs: CIBSE
 * licenses its weather data, and WFR:2026 requires a TM59 assessment to use the
 * DSY1 file for the site — bought, and sitting on the buyer's own machine. So
 * the one part of that method this page could actually honour was the one part
 * it withheld.
 *
 * Read here, in this page, and handed to the same WebAssembly engine as
 * everything else. **No byte of it reaches the network**, which is not a
 * constraint being worked around but the only arrangement under which a
 * licensed file can be used at all: there is nowhere to upload it to, and there
 * is not going to be.
 */

/**
 * Every sentence the file path letters, declared once and asserted at load.
 *
 * The units lines above are asserted the same way and for the same reason: a
 * budget nothing enforces is a budget, and this feature already proved it. Commit
 * `35a62ac` counted the waiting-desk sentence by hand, got 43 words against the
 * 40-word `CEILING`, and found out *after* it had shipped — which is exactly the
 * class of silent breakage the workflow's copy gate asks to be thrown at load
 * instead. Counting by hand is not the failure; counting once is.
 *
 * **The sentence that carries a file's own declaration is asserted carrying
 * one.** `SAMPLE_DECLARES` stands in for a real `WeatherFile.declares` — a place,
 * a source label and a WMO number — because a sentence measured without its
 * declaration is measured in a state no reader ever sees it in, which is how 43
 * words passed for 31. It is deliberately two words **longer** than the longest
 * declaration the fixtures produce, so the headroom the assertion proves belongs
 * to the file rather than to the copy: a purchased file is named by whoever sold
 * it, and a page that only just fits the names it has seen will one day be handed
 * a longer one with nothing thrown.
 *
 * What is **not** asserted is the part a parser wrote. A refusal quotes the
 * sentence `dailyMeansCarried` or `designConditionsFrom` produced, naming the
 * record or the day, and that is the only part of it the reader can act on: it
 * may not be folded, may not be shortened, and is not the sheet's text to
 * budget. So each refusal's own wording is asserted with a one-word stand-in for
 * the quotation, which is the whole of what this module wrote.
 */
const SAMPLE_DECLARES = 'Kingston upon Thames, Greater London, GBR · CIBSE DSY1 2050s HIGH50 · WMO 037760';

const FILE_SAYS = Object.freeze({
  /** A file the reader chose that this page will not read. */
  notAFile: (name) =>
    `${name} is not a weather file: this reads an EPW, a DDY beside it, or the ZIP they came in`,
  /** Whatever `filesFrom` refused about the set of files chosen. */
  chosen: (why) => `That file cannot be used: ${why}.`,
  /** Whatever the attach gate refused about the EPW itself. */
  gate: (name, why) => `${name} cannot be used: ${why}.`,
  /** A DDY that will not parse. The year stands or falls with it at the picker. */
  ddy: (name, why) => `The DDY beside ${name} cannot be used: ${why}.`,
  /** A DDY describing somewhere else — worse than no DDY at all. */
  ddyElsewhere: (name, there, here) =>
    `The DDY beside ${name} describes ${there} and the weather file describes ${here}, ` +
    'so one of them is not this building’s.',
  /** The file that arrived is not the file the link was run against (FR-020). */
  notTheLink: (asks, name, says) =>
    `That is not the weather file this link was run against. The link asks for ${asks}, ` +
    `and ${name} says it is ${says}. Reload this page without the link to run your file on a fresh desk.`,
  /**
   * A desk the link cannot supply a climate for (FR-019).
   *
   * "in the weather picker above", not "below": the picker's panel is
   * `position: absolute` and drops *under* its field, so the attach control is
   * below this sentence only while the panel is open — and the panel is shut,
   * because opening it is the thing the sentence is asking for. The field is
   * above in both states. A refusal that points the wrong way is worse than one
   * that points nowhere.
   */
  waiting: (declares) =>
    `This desk ran against a weather file the link cannot carry: ${declares}. ` +
    'Attach your copy in the picker above; the sheet checks it.',
  /**
   * A calendar asking for months the attached file has not got.
   *
   * The second reachable get-input fatal this path opens, beside the design days
   * one in `solve`. `applyRun` writes a `RunPeriod` across every contiguous group
   * of ticked months, so a desk calendared for the year over a 1 June – 31 August
   * file sends the engine to 1 January, where there is no record: it terminates
   * in `GetNextEnvironment` and the sheet letters *Program terminates due to
   * preceding condition*, which is true and tells the reader nothing.
   *
   * The file's extent is named rather than the months missing from it. Both are
   * actionable and only one is bounded — a seven-day file is missing all twelve,
   * and a sentence that lists them is a sentence about a list.
   */
  monthsOutside: (name, covers) =>
    `${name} carries ${covers}, and this run asks for months outside that. Narrow the calendar ` +
    'on the Run strip to fit the file, or attach one that covers the year.',
  /** A kept file that no longer reads. It is forgotten rather than half-used. */
  keptUnreadable: (why) =>
    `The weather file this browser was keeping cannot be read: ${why}. It has been forgotten.`,
});

// The control itself, out of the markup, so the two words in view are held to
// the same budget as every other standing line on the sheet.
withinBudget(BUDGETS.STANDING, 'the attach label', $('site-own-label').textContent);
withinBudget(BUDGETS.BLOCK, 'the attach note', $('site-own-note').textContent);
// The one sentence that carries a declaration, asserted carrying one.
withinBudget(BUDGETS.CEILING, 'the waiting-desk sentence', FILE_SAYS.waiting(SAMPLE_DECLARES));
// And each refusal's own wording, with a word standing in for the quotation.
// Longer than `STANDING` allows, and it earns the room: it names the file, says
// what it is not, and lists all three things the dialog does accept, which is the
// difference between a refusal and a reader trying the same file twice.
withinBudget(BUDGETS.BLOCK, 'the not-a-weather-file refusal', FILE_SAYS.notAFile('x.pdf'));
withinBudget(BUDGETS.STANDING, 'the chosen-file refusal', FILE_SAYS.chosen('x'));
withinBudget(BUDGETS.STANDING, 'the attach-gate refusal', FILE_SAYS.gate('x.epw', 'x'));
withinBudget(BUDGETS.STANDING, 'the DDY refusal', FILE_SAYS.ddy('x.epw', 'x'));
withinBudget(BUDGETS.BLOCK, 'the DDY-elsewhere refusal', FILE_SAYS.ddyElsewhere('x.epw', 'A', 'B'));
withinBudget(BUDGETS.BLOCK, 'the kept-file refusal', FILE_SAYS.keptUnreadable('x'));
// Asserted with the longest extent `periodSaid` writes — a seven-day sub-hourly
// file — because that is the state a reader most often reads this sentence in.
withinBudget(
  BUDGETS.CEILING,
  'the months-outside-the-file refusal',
  FILE_SAYS.monthsOutside('x.epw', '1 Jan – 7 Jan, 4 records an hour'),
);
// The wrong-file refusal carries **two** declarations and cannot be held to
// `CEILING` with them in it: 24 of its words are the two files' own, and what is
// left is a sentence that has to name three things and offer a way out. Its own
// wording is what this module wrote, and that is what is asserted.
withinBudget(BUDGETS.CEILING, 'the wrong-file refusal', FILE_SAYS.notTheLink('A', 'x.epw', 'B'));

/**
 * The file a link asked for, while the desk waits on it. Null otherwise.
 *
 * Held so the attach can check what arrives against what was asked for. A
 * recipient who attaches the wrong year has to be told before a single reading
 * is drawn from it, because the whole worth of the link is that two people end
 * up reading the same numbers.
 *
 * Declared here, beside the attach that reads it, rather than beside the boot
 * dispatch that writes it: `attachOwnFile` is reachable from the moment the
 * markup exists, minutes before a cold cache finishes the engine, and a `let`
 * declared further down the module would be in its temporal dead zone for
 * exactly that window.
 */
let wantedFile = null;

/** What a file's extension says it is, lowercased and without its dot. */
const extensionOf = (name) => (name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();

const asText = (bytes) => new TextDecoder().decode(bytes);

/**
 * The EPW and the DDY out of whatever the reader picked.
 *
 * Three shapes reach here and all three are ordinary: a bare `.epw`; an `.epw`
 * and a `.ddy` chosen together; or the `.zip` a purchase arrives in, which is
 * what the picker's own archives are and so goes through `unzip` from
 * `@idfkit/weather` — the same reader, not a second one.
 *
 * An archive holding several weather files is not guessed at. The reader is
 * told which ones are in it and asked to pick, because choosing for them would
 * be choosing which year their assessment runs against.
 *
 * Throws naming what was wrong, and the caller refuses the whole attach with
 * that sentence.
 */
async function filesFrom(chosen) {
  const named = new Map();
  for (const file of chosen) {
    const kind = extensionOf(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === 'zip') {
      let members;
      try {
        members = await unzip(bytes);
      } catch (error) {
        throw new Error(`${file.name} could not be unpacked: ${error.message}`);
      }
      for (const [member, body] of members) {
        // A ZIP carries directory entries and macOS resource forks beside the
        // files somebody meant to send; neither is a weather file and neither
        // is worth reporting as one.
        if (member.endsWith('/') || member.includes('__MACOSX/')) continue;
        const inner = extensionOf(member);
        if (inner === 'epw' || inner === 'ddy') named.set(member.split('/').pop(), { bytes: body, kind: inner });
      }
      continue;
    }
    if (kind === 'epw' || kind === 'ddy') {
      named.set(file.name, { bytes, kind });
      continue;
    }
    throw new Error(FILE_SAYS.notAFile(file.name));
  }

  const epws = [...named].filter(([, m]) => m.kind === 'epw');
  const ddys = [...named].filter(([, m]) => m.kind === 'ddy');
  if (!epws.length) {
    throw new Error('there is no EPW in what you chose, and the EPW is the year the engine is run on');
  }
  if (epws.length > 1) {
    throw new Error(
      `that holds ${epws.length} weather files — ${epws.map(([n]) => n).join(', ')} — and which year this ` +
        'building is assessed against is not a choice this page is going to make for you. Attach one of them',
    );
  }
  if (ddys.length > 1) {
    throw new Error(
      `that holds ${ddys.length} DDY files — ${ddys.map(([n]) => n).join(', ')} — and only one set of design ` +
        'conditions can describe this site. Attach the one you mean',
    );
  }
  const [name, epw] = epws[0];
  return { name, bytes: epw.bytes, ddyText: ddys.length ? asText(ddys[0][1].bytes) : null };
}

/**
 * Attach a file the reader chose. The mirror of `choose` above, and it ends in
 * the same place: `attachClimate`, which owns every one of the eight things
 * that happen when a climate lands.
 *
 * Nothing is narrated as a download, because nothing is downloaded. What the
 * reader waits on is a pass over their own file — `dailyMeans` at about 3 ms
 * and a fingerprint at about 20 ms on a 1.66 MiB year — which is under a frame
 * and over before a spinner would have appeared.
 */
async function attachOwnFile(chosen) {
  if (!chosen.length) return;
  // Captured before the first await, for the reason `describeDesk` is: the
  // reader can drag a slider while a file is being read, and the studies that
  // are about to be restored have to be the ones that were open when they
  // picked it.
  const studyContext = desk?.captureStudyContext();
  // The picker's own fetch is abandoned. A reader who typed a city, waited, and
  // then reached for their own file has answered the question the list was
  // asking, and a station landing on top of their file a second later would be
  // the desk overruling them.
  inflight?.abort();

  const refuse = (reason) => {
    trail.push('refusal', `Weather file refused: ${reason}`);
    lastStationRefusal = reason;
    statusEl.className = 'status bad';
    statusEl.textContent = reason;
    say(reason, true);
    // The field is handed back empty so the same file can be chosen again once
    // whatever was wrong with it is fixed: a file input holding a rejected file
    // fires no `change` when that same file is picked a second time.
    $('site-file').value = '';
  };

  let picked;
  try {
    picked = await filesFrom(chosen);
  } catch (error) {
    return refuse(FILE_SAYS.chosen(error.message));
  }

  let source;
  try {
    source = await sourceFromFile({ ...picked, schema });
  } catch (error) {
    // The parser's own sentence, unwrapped. `dailyMeans` names the record or
    // the day it could not read, and that is the only part of this a reader can
    // act on.
    return refuse(FILE_SAYS.gate(picked.name, error.message));
  }

  // A desk waiting on a link's file checks that this is that file, before a
  // single reading is drawn from it. The whole worth of the link is that two
  // people end up reading the same numbers, and a colleague who reaches for the
  // wrong year of the same purchase would otherwise get a desk that looks
  // exactly like the sender's and is not.
  //
  // Both descriptions are printed, because which of the two is the wrong one is
  // the reader's to know and this page cannot tell them — it has a fingerprint
  // and a phrase, and no way to see inside somebody else's purchase.
  if (wantedFile && wantedFile.fingerprint !== source.fingerprint) {
    return refuse(
      FILE_SAYS.notTheLink(
        wantedFile.declares ?? 'a file it does not describe',
        picked.name,
        source.declares.declares,
      ),
    );
  }
  // Satisfied, or never asked for: either way the desk is no longer waiting.
  wantedFile = null;

  // The design conditions, where a DDY came with it. Parsed here rather than in
  // `source.js` because the source carries the file's own text and this is the
  // one place that turns text into the objects the model holds — the same call
  // the picker makes of an archive's DDY, so an unusable DDY is refused in one
  // sentence rather than two.
  let conditions = null;
  if (source.ddy) {
    try {
      conditions = designConditionsFrom(source.ddy, schema);
    } catch (error) {
      return refuse(FILE_SAYS.ddy(picked.name, error.message));
    }
    // A DDY for another city is worse than no DDY at all: its design days would
    // stand under this file's title block, which is the lie in ink the picker's
    // own refusal exists to prevent. Both places are printed, because which of
    // them is the wrong one is the reader's to know.
    const ddyPlace = conditions.location.name;
    const epwPlace = source.place.city;
    if (ddyPlace && epwPlace && !sameSite(ddyPlace, epwPlace)) {
      return refuse(FILE_SAYS.ddyElsewhere(picked.name, ddyPlace, epwPlace));
    }
  }

  closePanel();
  say('');
  site.classList.add('picked');
  $('site-file').value = '';
  attachClimate(source, { studyContext, conditions });

  // Kept only now, after the attach has landed: what the browser remembers is
  // always a file that already solved. The await is deliberately not waited on
  // — compressing 1.5 MB takes about 45 ms and the desk is already running the
  // file — but its answer is, because a file that will not be kept is something
  // the reader has to be told rather than discover on their next reload.
  void rememberFile({
    fingerprint: source.fingerprint,
    name: source.label,
    declares: source.declares.declares,
    epw: source.epw,
    ddy: source.ddy,
  }).then((kept) => {
    renderKeptFile(kept.kept ? null : kept.reason);
  });
}

/**
 * What the browser is holding, and how to make it stop.
 *
 * Never folded and never on hover: a reader has to be able to see that a file
 * of theirs is being kept, and to stop it, without going looking. `reason` is
 * the sentence from a keep that did not happen — a quota, or a browser that
 * stores nothing — and it is lettered in place of the offer rather than beside
 * it, because in that state there is nothing to forget.
 */
function renderKeptFile(reason = null) {
  const line = $('site-own-kept');
  if (reason) {
    line.hidden = false;
    line.textContent = reason;
    return;
  }
  const kept = rememberedFile();
  if (!kept) {
    line.hidden = true;
    line.replaceChildren();
    return;
  }
  line.hidden = false;
  line.replaceChildren(
    document.createTextNode(
      weatherSource?.kind === 'file' && weatherSource.fingerprint === kept.fingerprint
        ? `${kept.name} is kept in this browser, so a link to this desk reopens on it. `
        : `${kept.name} is kept in this browser. `,
    ),
  );
  // Offered rather than attached, and that is the whole of Principle II in one
  // control: a remembered file is put on the desk automatically only where the
  // link names it, because otherwise the bare address would mean one thing on
  // this machine and another everywhere else.
  if (!(weatherSource?.kind === 'file' && weatherSource.fingerprint === kept.fingerprint)) {
    const attach = document.createElement('button');
    attach.type = 'button';
    attach.className = 'link';
    attach.textContent = 'Attach it';
    attach.addEventListener('click', () => void attachRemembered());
    line.append(attach, document.createTextNode(' · '));
  }
  const forget = document.createElement('button');
  forget.type = 'button';
  forget.className = 'link';
  forget.textContent = 'Forget it';
  forget.addEventListener('click', () => {
    forgetFile();
    renderKeptFile();
  });
  line.append(forget);
}

/**
 * Put the remembered file back on the desk.
 *
 * The bytes come out of the browser rather than off the filesystem, so there is
 * no dialog — but everything after that is the ordinary attach, gate included.
 * Re-gated rather than trusted: what was written was a file that solved, and
 * what comes back is a string this page has to read again, so it goes through
 * `sourceFromFile` like any other.
 */
async function attachRemembered() {
  const held = await rememberedBytes();
  if (!held) {
    renderKeptFile();
    return false;
  }
  const studyContext = desk?.captureStudyContext();
  let source;
  try {
    source = await sourceFromFile({
      name: held.name ?? 'weather.epw',
      bytes: new TextEncoder().encode(held.epw),
      ddyText: held.ddy,
      schema,
    });
  } catch (error) {
    // A kept file that no longer reads is not repaired and not half-used: it is
    // forgotten, said, and the desk is left where it was.
    forgetFile();
    statusEl.className = 'status bad';
    statusEl.textContent = FILE_SAYS.keptUnreadable(error.message);
    renderKeptFile();
    return false;
  }
  let conditions = null;
  if (source.ddy) {
    try {
      conditions = designConditionsFrom(source.ddy, schema);
    } catch {
      // The year stands without it. The DDY was kept beside the file and a DDY
      // that has stopped parsing costs the design days, not the climate.
      conditions = null;
    }
  }
  closePanel();
  attachClimate(source, { studyContext, conditions });
  renderKeptFile();
  return true;
}

/**
 * Whether two place names are the same site, for the DDY check above.
 *
 * Deliberately loose, and deliberately only used to *refuse*: a DDY and an EPW
 * from one purchase write the same city with different punctuation and
 * different trailing qualifiers, and refusing a matched pair over a full stop
 * would be the false refusal that teaches a reader to stop reading refusals.
 * What it catches is the case worth catching — London against Manchester — and
 * anything it lets through is a pair the reader chose together.
 */
const sameSite = (a, b) => {
  const plain = (name) => name.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ')[0];
  return plain(a) === plain(b);
};

$('site-file').addEventListener('change', (event) => {
  void attachOwnFile([...event.target.files]);
});

/* ══ the permalink ═══════════════════════════════════════════════════════ */

/**
 * The attached station as the link carries it, or null while the sheet still
 * has the Denver design days it shipped with. The stock `station` seed holds
 * only a tariff region and no archive, which is what `url` distinguishes.
 */
const stationToken = () =>
  weatherSource?.kind === 'station' && pickedStation
    ? { wmo: String(pickedStation.wmo), window: flavorWindow(pickedStation) }
    : null;

/**
 * The attached file as the link carries it: a fingerprint of its contents and
 * the phrase the file uses about itself. Null for a station, or for a desk that
 * has attached nothing.
 *
 * The file cannot ride here and must not — megabytes, and a bought one is not
 * the sender's to redistribute. What rides is enough to tell a recipient which
 * file to fetch from their own purchase and whether the one they attached is
 * it.
 */
const fileToken = () =>
  weatherSource?.kind === 'file'
    ? { fingerprint: weatherSource.fingerprint, declares: weatherSource.declares.declares }
    : null;

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
    file: fileToken(),
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
// The last station refusal's sentence, so a report can say a station was
// refused while that sentence is still the one standing in the status line.
let lastStationRefusal = null;
function refuseLink(message) {
  trail.push('refusal', message);
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
    const offers = studyOffers(job.snapshot, job.patch, job.epw, key);
    const selected = offers.find((offer) => offer.quantity.id === quantity.id);
    const refusal = studyRefusal(key, job.snapshot, selected);
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
        reason: refusal,
      },
      curve: [],
      coarse: false,
    };
    openStudies.add(key);
    studies.set(key, waiting);
    desk.setStudy(key, waiting, { stale: false });
    if (!refusal && autoOn()) studyScheduler.enqueue(job);
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
        `The linked ${named} could not be attached (${error.message}); the link was set aside.`,
      );
      return;
    }
    // `choose` hands back the reason it refused, and it is lettered rather
    // than summarised: "publishes no annual cooling design conditions" tells
    // the reader which link they were sent and what is wrong with it, where
    // "could not be attached" tells them only that today is not going well.
    if (typeof took === 'string' && JSON.stringify([params, patching()]) === untouched) {
      refuseLink(
        `The linked ${named} could not be attached (${took}); the link was set aside.`,
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

// The probe that answers whether anything can be kept is declared up with the
// units toggle, which reads it while the page is still booting — hundreds of
// lines before this one. One probe, two readers.
const shelf = new Shelf(shelfStore);
let kept = []; // the shelf as last read
let shelfNote = null; // why it could not be read, when it could not
// What the last run measured, in the terms the targets are written in. Read
// once at the solve rather than off the ESO at draw time, for the same reason
// the bundle's identity is captured before the await: the register re-letters
// on every gesture, and re-reading 8,760 points to do it would make a drag
// stutter for a number that cannot have changed.
let lastOutcome = null;
// What the last landed run's finding paragraph is made of, so a units switch
// can letter it again without a run. A small record rather than the closure
// that draws it: a closure would keep the whole of `solve` alive, and that
// scope holds the run's IDF text, the EPW file and the parsed ESO. Null
// whenever no paragraph is standing, which `clearReadings` decides.
let lastFinding = null;

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
 * The same thing, or null on a desk that has attached no file at all.
 *
 * Deliberately **not** cached, unlike the running mean below, and the
 * difference is measured rather than assumed: `readLocation` is 0.003 ms on
 * Chicago TMY3 against `dailyMeans`'s 3.13 ms, because the split is bounded at
 * sixteen lines and never reaches the 8,760 data records. A cache that saves
 * three microseconds twice a solve is a second piece of state to clear on a
 * station change and nothing else.
 *
 * `readLocation` itself now lives in `src/epw.js`, where its own comment always
 * said it belonged, and returns the pair `{ declares, place }`. This is the
 * half that answers what the file says about itself; `place` is what the model
 * and the title block are written from.
 */
const declaredWeather = (epw) => (epw ? readLocation(epw).declares : null);

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
 * periods, a record missing from the middle of April: `dailyMeansCarried` and
 * `runningMean` each throw naming the day or the record they could not read,
 * and that sentence rides into criterion a's margin cell, which is the one
 * place on the page a reader can act on it. Criteria b and c need no running
 * mean at all — their thresholds are fixed — and go on reading.
 *
 * **`dailyMeansCarried`, not `dailyMeans`**, and the difference is the whole of
 * how a part-year file is treated here. `dailyMeans` refuses anything short of
 * 365 days, which is the contract an annual bill needs and is wrong for this
 * one: `runningMean` needs 23 April to 30 September and nothing else, and it
 * checks exactly that span before it computes anything, naming the first day it
 * is missing. So a file carrying 23 April onwards produces the same comfort line
 * a whole year would, character for character, and a file starting on 1 May is
 * refused by the day it lacks rather than by a count of the days it has — which
 * is the sentence a reader can act on, since 23 April is not a date anybody
 * would guess was load-bearing.
 *
 * `source` is the LOCATION record's own fourth field, `TMYx.2009-2023` and the
 * like, carried into the `RunningMean` so the sheet can letter what the line
 * was built from in the file's own words rather than in ours.
 */
let meanCache = null;

/**
 * The stretch the captured weather file covers, cached on its identity.
 *
 * Its own cache beside the comfort line's, and cached for the same measured
 * reason: `periodCovered` splits the whole 1.6 MB file to reach its first and
 * last record, which is the expensive half of `dailyMeans` for two dates, and
 * the criteria ask this once per solve.
 *
 * It is read off the **captured** EPW rather than off `weatherSource.period`,
 * which holds the same dates for the file now attached. That is the discipline
 * every other reading in `readTm59` keeps: a file attached while an 8,760-hour
 * run was in flight would otherwise have these readings describing one climate's
 * extent over another climate's hours, which is the mismatch the capture exists
 * to prevent.
 *
 * A file whose period cannot be read at all lands as `null`. Nothing on the
 * attach path can produce one — the gate reads the period before it builds a
 * source — so this is the state of a caller that has an EPW from somewhere else,
 * and a null period asks nothing of the criteria rather than asserting they are
 * covered.
 */
let periodCache = null;
function periodFor(epw) {
  if (!epw) return null;
  if (periodCache?.epw !== epw) {
    try {
      periodCache = { epw, period: periodCovered(epw) };
    } catch {
      periodCache = { epw, period: null };
    }
  }
  return periodCache.period;
}

function runningMeanFor(epw) {
  if (!epw) return { epw: null, mean: null, absence: ABSENCE.weather };
  if (meanCache?.epw !== epw) {
    try {
      meanCache = {
        epw,
        mean: runningMean(dailyMeansCarried(epw), declaredWeather(epw)?.source ?? null),
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
/**
 * The same readings, with a file that cannot reach the assessment period
 * answering for the season in its own terms.
 *
 * `ABSENCE.season` is the run's: months unticked on the Run strip, and the strip
 * is where it is fixed. A file cut to 1 January – 30 April produces exactly the
 * same blank — no hour of the period in the ESO, nothing to divide — and sending
 * that reader to the Run strip sends them to a control whose months are already
 * ticked, with nowhere left to look. So where the file itself stops short of
 * 1 May – 30 September, the sentence becomes the one that names a file (FR-014),
 * and the reading is a stated absence rather than a count taken over the weeks
 * that happened to be in there.
 *
 * Done here rather than inside `tm59.js`'s readers because they are handed an
 * ESO and the file's extent is not in one. The sentence is still the
 * declaration's — `ABSENCE.fileSeason` sits beside `ABSENCE.season` in the module
 * that owns both the period and the words for it — and only which of the two a
 * reading carries is decided out here, where the file is.
 *
 * Only `ABSENCE.season` is replaced. A reading blank for want of an operative
 * temperature or of an occupant is blank for a reason of its own, and the file's
 * months have nothing to say about it.
 */
function overFileExtent(readings, epw) {
  const period = periodFor(epw);
  if (!period || coversSeason(period)) return Object.freeze(readings);
  return Object.freeze(
    readings.map((reading) =>
      reading.absence === ABSENCE.season
        ? new Reading({
            criterion: reading.criterion,
            category: reading.category,
            absence: ABSENCE.fileSeason,
            coverage: null,
          })
        : reading,
    ),
  );
}

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

  // Once, and everything below reads the result. The count and the coverage are
  // taken off these readings, so taking them off the pre-override list would
  // have the block counting cleared criteria the rows beside it letter as
  // absent — the two halves of one board disagreeing about the same run.
  const over = overFileExtent(readings, epw);

  return {
    readings: over,
    // A count of two, never a verdict, and it throws rather than quietly
    // counting over one criterion if a reading in scope is missing.
    count: clearedCount(over),
    // Taken off a reading rather than by walking the series a sixth time. Any
    // reading that has one has the same one — coverage is a property of the
    // run, not of the criterion — and a run that could not answer anything has
    // none to give, which is the null the rows letter around.
    coverage: over.find((r) => r.coverage)?.coverage ?? null,
    // The line the count's own category was judged against. Each criterion a
    // row letters its own — Category I's runs 1 K below Category II's, and one
    // block-level figure cannot be both — so this is here for what reads the
    // block as a whole rather than a row of it.
    line: over.find((r) => r.criterion === CRITERION_BY_ID.a && r.category === COUNT_CATEGORY)
      ?.line ?? null,
    // The daylight saving period beside what the file declares about itself,
    // because the two come off different records and the qualification needs
    // both: `parseEpwCalendar` reads HOLIDAYS/DAYLIGHT SAVINGS, `readLocation`
    // reads LOCATION. Read rather than cached, for the reason `declaredWeather`
    // is: the split is bounded at the file's first dozen lines and never
    // reaches its 8,760 data records.
    qualifications: qualificationsFor(
      eso,
      snapshot,
      patched,
      declaredWeather(epw),
      epw ? parseEpwCalendar(epw).daylight : null,
    ),
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
  const facts = geometryFacts(model);
  const floorArea = facts.grossFloor;
  return {
    eui: bill?.wholeYear ? bill.intensity('metered') : null,
    ...(readDemand(eso, floorArea) ?? {}),
    ...(readPeaks(eso, floorArea) ?? {}),
    ...(readExtremes(eso) ?? {}),
    // Read here with everything else the register and the strips letter, and
    // for the same reason: the console re-letters on every gesture, and walking
    // 8,760 hourly illuminances to answer a question that cannot have changed
    // would put a stutter in every drag. The floor is the occupancy schedule's
    // own unoccupied value and is a precondition rather than a default, since
    // `> 0` against this desk's 0.1 band counts every hour of the year.
    daylight: readDaylight(eso, { floor: occupiedFloor(snapshot) }),
    // How deep the room the figure was measured in was, captured here for the
    // same reason and with the same consequence: taken at render off the live
    // `model` it walked the whole geometry again on every drag frame, and it
    // described the desk as it stands rather than the run the figure came off.
    daylightDepth: depthRatio(facts),
    overheat,
    tm59: readTm59(eso, snapshot, patched, epw),
  };
}

/**
 * Which criterion of `tm59.js` a target's metric resolves to, or null.
 *
 * This was a table — `{ tm59a: 'a', tm59b: 'b', tm59c: 'c' }` — declared that
 * way rather than sliced out of the metric's name, because `metric.slice(4)` is
 * a string operation that happens to work and would go on happening to work
 * right up to the day a metric is called something else. That reasoning holds
 * and the table still failed it: when the roster grew a reading per category,
 * the metrics became five and a hand-kept list of them was a fourth place the
 * same fact was written. A metric names a reading and a reading names the
 * criterion it answers, so the answer is read off that declaration and the list
 * is gone. The slice is still refused; it is the copy that has been removed.
 */
const criterionOf = (target) => QUANTITY_BY_ID[target.metric]?.criterion ?? null;

/**
 * Whether a preset's lines are TM59's criteria, asked of the declaration.
 *
 * Matched on the metrics its targets carry rather than on its name or its id,
 * for the reason the console reads `--index` back off the stylesheet: a fact
 * spelled in two places is a bug that exists at exactly one of them.
 */
const carriesTm59 = (preset) => preset.targets.some((target) => criterionOf(target));

/**
 * The reading behind one TM59 target, matched on criterion *and* category.
 *
 * The category is half the key and has to be. Criterion a is lettered twice on
 * this board, once against each of TM59's two adaptive lines — matched on the
 * criterion alone, a·I and a·II would both resolve to whichever reading came
 * first in the list and the board would print one number under two labels 1 K
 * apart. Criterion c carries no category and its target carries `null`, so the
 * same comparison holds it.
 *
 * The two targets used to carry the same metric as well, which is why the
 * comparison was written. They no longer do — each names its own category's
 * reading, and `study.js` asserts at load that a target's metric and its
 * category agree. The comparison stays because it is the thing being asserted
 * elsewhere: a board that matched on the metric alone would be correct only for
 * as long as that assertion holds, and this way it is correct on its own terms.
 */
function tm59Reading(target) {
  const criterion = criterionOf(target);
  if (!criterion || !lastOutcome?.tm59) return null;
  return (
    lastOutcome.tm59.readings.find(
      (reading) => reading.criterion === criterion && reading.category === target.category,
    ) ?? null
  );
}

/** The reading one target asks for, or null when the run does not carry it. */
function targetReading(target) {
  if (!lastOutcome) return null;
  const value =
    criterionOf(target)
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
  // A file that stops before the period begins is the same blockage as no file
  // at all — what clears it is another year, reached from the same picker — and
  // deliberately not `'season'`, whose press is the Run strip and which on this
  // desk has nothing left to change.
  [ABSENCE.fileSeason, 'year'],
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
  // One sentence, the way every status line is: what moved, and solo coming
  // off because that changes what is in the path. Which channels a standard
  // may never touch is the register's own statement, beside the standards,
  // and listing them here on every press put a paragraph in the status row.
  statusEl.textContent = preset.specs.length
    ? `${preset.name} laid over the desk: ${moved} control${moved === 1 ? '' : 's'} moved` +
      `${patched ? ` and ${patched} channel${patched === 1 ? '' : 's'} patched` : ''}.` +
      (soloWas ? ' Solo came off.' : '')
    : `${preset.name} sets no control; its targets are on the scoreboard.`;
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
    // Beside the place, never instead of it. A DSY1 and a TMYx for the same
    // airport letter the same title block, and which of the two a scheme was
    // solved against is the difference between a design summer and a typical
    // one — the difference the file was bought for.
    file: weatherSource?.kind === 'file' ? weatherSource.label : null,
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
 * Whether a decoded scheme names the climate this desk is on.
 *
 * Both tokens, never one. The station half was the whole test and it read as
 * though it were: a scheme kept under an attached file carries `station: null`,
 * a desk on an attached file answers `stationToken()` with `null` too, and the
 * two nulls matched — so a scheme solved against a DSY1 restored *in place*
 * against whatever climate happened to be attached, a different purchased file
 * or none at all, and the sliders moved and the numbers came back somebody
 * else's. Nothing on the sheet said so, because nothing was wrong with the
 * desk: it was a real building solved against a real year, and only the stored
 * hash knew it was the wrong one. Constitution II is the rule it broke — one
 * hash, one set of numbers, on any machine — and a silent breach of it is worse
 * than a refusal a reader can read.
 *
 * The fingerprint is the comparison rather than the declaration. Two years of
 * one purchase describe themselves identically in `wfd`; the fingerprint is
 * over the bytes and is the only thing that tells them apart.
 */
const sameClimate = (a, b) =>
  sameStation(a.station, b.station) &&
  (a.file?.fingerprint ?? null) === (b.file?.fingerprint ?? null);

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

  if (!sameClimate(state, { station: stationToken(), file: fileToken() })) {
    statusEl.className = 'status';
    // Through the link either way, and the sentence says which errand the
    // reload is on. A station is fetched; a file cannot be — the link path
    // re-attaches it from this browser where it is kept and asks for it in the
    // file's own words where it is not, which is the one place that state is
    // written and the reason this is not a second copy of it.
    statusEl.textContent = state.file
      ? `Restoring ${scheme.name}, which was solved against another weather file — reloading to ask for it…`
      : `Restoring ${scheme.name}, which names another station — reloading to fetch its weather…`;
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

/**
 * One *published* figure to a decimal, in the units its source published it in.
 *
 * Deliberately not a conversion, and narrowed to that job rather than left as a
 * general rounding helper. TM59 defines its categories' clamps and its fixed
 * thresholds in Celsius, and FR-010 keeps a published figure as published in
 * both systems, so everything still lettered through here reads °C on an IP
 * sheet and says "published" in the same breath.
 *
 * The run's own *measured* temperatures are a different quantity and no longer
 * come through here: they go through `KINDS.temperature`, which is why the
 * précis and the sentence under it now letter the moving line in the reader's
 * own system while the clamps beside it hold their Celsius.
 */
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
const scoreFigure = (target, value) => figureIn(target.quantityKind, value, { digits: target.digits });

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
    // The band the verdict was actually taken against, measured over the days
    // this run covered: it is recomputed daily off the running mean, so it is a
    // reading and it converts. It is also the one line the précis may never
    // fold, stated above as FR-006, which made it the most visible °C left
    // standing on an IP sheet. One decimal in both systems, since a tenth of a
    // degree Celsius and a tenth of a degree Fahrenheit are the same claim
    // about a line drawn to one.
    const t = (v) => figureIn(KINDS.temperature, v, { digits: 1, ipDigits: 1 });
    parts.push(`judged against ${t(line.low)}–${t(line.high)} ${unitIn(KINDS.temperature)}`);
  }
  if (coverage) parts.push(`${coverage.days} of ${SEASON.days} days`);
  parts.push('operative temperature');
  return parts.join(' · ');
}

const noteCache = new WeakMap();

function tm59Notes(reading, asDrawn) {
  // The system is part of the key for the same reason `asDrawn` is, and it had
  // to be added the moment these notes began converting: criterion a's note now
  // letters the measured adaptive line through `KINDS.temperature`, so a string
  // built in SI and handed back from this cache would stand in °C under an IP
  // sheet until the next solve replaced it. That is the stored-label trap the
  // units notes warn about, and a cache is the quietest way to walk into it:
  // nothing here is stale, the figure is simply lettered in a system the reader
  // has left.
  const showing = system();
  if (reading) {
    const held = noteCache.get(reading);
    // `asDrawn` is part of the key: it is read off the run rather than off live
    // params, so it moves only when a solve does, but a cache that ignored it
    // would letter "the building as drawn" over a desk that had since been
    // given the method's own profiles.
    if (held && held.asDrawn === asDrawn && held.showing === showing) return held.notes;
  }
  const notes = tm59NotesFor(reading, asDrawn);
  if (reading) noteCache.set(reading, { asDrawn, showing, notes });
  return notes;
}

function tm59NotesFor(reading, asDrawn) {
  if (!reading || reading.value === null) return [];
  const { criterion, category, coverage, line } = reading;
  const notes = [];

  if (criterion.id === 'a') {
    // This sentence carries both a measurement and a citation, and they letter
    // differently on purpose. `line.low`, `line.high` and `line.mean` are what
    // the weather did over the days this run covered, so they convert like every
    // other reading; `category.low` and `category.high` below are what
    // TM59:2026 §2.4.1 publishes, and FR-010 keeps a published figure as
    // published in both systems. The word "published" in front of each clamp is
    // what makes the pair readable rather than contradictory, and it is already
    // there for an unrelated reason, recorded in the comment under this one.
    //
    // The alternative, converting the clamps too, would state a floor and a
    // ceiling in °F that the method does not publish and that no reader could
    // check against their own copy of it.
    const t = (v) => figureIn(KINDS.temperature, v, { digits: 1, ipDigits: 1 });
    const u = unitIn(KINDS.temperature);
    let moved =
      `Read from the zone’s hourly operative temperature against ${category.label}’s adaptive line, ` +
      `which is recomputed every day off the outdoor running mean. Over the ${line.days} days this ` +
      `run covered it ran from ${t(line.low)} ${u} to ${t(line.high)} ${u}, mean ${t(line.mean)} ${u}.`;
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
    // Every criterion in scope is unread, so the scope already names them and
    // listing them again below would say the same thing twice.
    p.append(`None of the criteria in scope — ${count.scope} — could be read from this run; each row says why.`);
    host.append(p);
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
  // is not one that failed and is not one that passed, and the useful things
  // to say about it are which one it is and what would fix it. The fix is
  // already lettered beside that criterion's own em dash, one row up, so it is
  // named here and the reason is left to the row rather than said twice.
  if (count.read > 0 && count.unread.length) {
    const labels = count.unread.map((reading) =>
      reading.category ? `${reading.criterion.label} · ${reading.category.label}` : reading.criterion.label,
    );
    const list = labels.length < 2 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
    p.append(` ${list} could not be read; each row says why.`);
  }

  host.append(p);

  // Why c and d stand outside the count is the one statement here no
  // qualification makes, so it keeps its words, one press down. The sentence
  // that used to close this row ("a count of lines, not a result against the
  // method … no worst room to find") is gone: the `procedure` and `one-zone`
  // qualifications say it, nearly word for word, in the fold below.
  host.append(
    fold(
      'tm59:cd',
      FOLD.criteriaCD,
      {},
      elem(
        'p',
        'score-count',
        'Criterion c is read separately and stands outside this count, because which of it and ' +
          'criterion a governs turns on how much of the occupied period the openings are held shut, ' +
          'which is a fact about a window model this desk does not carry. Criterion d is not read at ' +
          'all: this model holds no communal circulation for it to be read over, and the register’s ' +
          'list of what this sheet cannot judge says so in full.',
      ),
    ),
  );
}

/**
 * Why these figures are not a TM59 assessment, stated under them.
 *
 * The deliverable rather than a disclaimer, and it is in place and never on
 * hover: `pointer: coarse` has no hover at all, so a caveat that floats does
 * not exist on the phone where this sheet is most often read and least often
 * checked against the method it names. In place is not the same as always
 * open, though. The summary states in view how many reasons there are, read
 * off the declaration, and the reasons themselves are one press down, where
 * 520 words stood under five rows of figures before.
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
  const list = elem('dl', 'qualifications');
  for (const q of qualifications) {
    list.append(elem('dt', null, q.says));
    const because = elem('dd', null, q.because);
    because.dataset.head = 'Because';
    list.append(because);
  }
  host.append(fold('tm59:qualifications', qualificationsSummary(), {}, list));
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
  // The qualifying sentences already lettered in view on this board.
  const qualified = new Set();
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
      // And the ground, which draws this standard's published line and the
      // ground on its passing side, and withdraws every other standard's for
      // as long as the chase lasts (FR-015). Through `renderSurveySoon` rather
      // than `renderSurvey` because that is the entry point every other caller
      // uses and it costs nothing where no ground is cut. It starts no run:
      // the chase reaches no IDF field and is not on `shapeKey`.
      renderSurveySoon();
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
      // The method folds under the criterion it explains. Ten notes of up to
      // ninety-five words stood under a table of figures and buried them; the
      // reading, the line and the verdict or absence are what the row is for,
      // and they stay in the cells beside it.
      if (target.note) {
        label.append(
          fold(`target:${target.id}`, FOLD.method, { label: `Method for ${target.label}` }, elem('i', 'why', target.note)),
        );
      }
      // What the run added to what the declaration already said: the line the
      // reading was judged against, the days it covered, and what it is a
      // reading of. One block per statement rather than one paragraph, because
      // they are separate claims a reader may want to check one at a time.
      if (criteria) {
        const reading = tm59Reading(target);
        const notes = tm59Notes(reading, asDrawn);
        const precis = tm59Precis(reading);
        // A sentence that qualifies the reading rather than derives it stays
        // outside the fold, because a reader who never opens it must still not
        // take a bedroom criterion for a statement about the room they drew.
        // Only while it is the row's one short line, though: a qualifier past
        // a block's budget is a paragraph, and it joins the derivation.
        // And only once per board. Categories I and II of one criterion carry
        // the same qualifier word for word, and the second row's copy said
        // nothing the first had not; it goes in that row's fold instead.
        const qualifying = notes.filter(
          (n) => QUALIFYING_NOTE.test(n) && words(n) <= BUDGETS.BLOCK.words && !qualified.has(n),
        );
        for (const n of qualifying) qualified.add(n);
        const deriving = notes.filter((n) => !qualifying.includes(n));
        if (deriving.length) {
          label.append(
            fold(
              `target:${target.id}:why`,
              precis ?? FOLD.derivation,
              { label: `How ${target.label} was read` },
              ...deriving.map((note) => elem('i', 'why', note)),
            ),
          );
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
        `Reads, ${target.unitNow}`,
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
      unit.textContent = target.unitNow;
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
    because: 'about a conditioned building; this zone is free-running.',
    label: 'Patch System in',
    then: 'Patching it in fills them.',
    // The shelf is asking a different question of the same fact — not "why is
    // this criterion blank" but "what would a scheme kept from here hold" —
    // so it gets its own sentence, the way an environment's `noun` is kept
    // apart from its `label`.
    shelf: (blank) =>
      `${listOf(blank)} blank while this zone is free-running, so a scheme kept from here would keep the gap.`,
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
    then: 'The picker heads the sheet.',
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
      ` ${now.target.unitNow}.`,
      tally,
    );
  } else {
    host.append(
      'every readable line clears. The closest, ',
      mark(now.target.label),
      `, ${against} — under by `,
      mark(scoreFigure(now.target, -now.over)),
      ` ${now.target.unitNow}.`,
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
  // precisely the reader who never scrolls down to the board. That is why this
  // clause survives here although the qualifications say the same: it is the
  // one copy the dragging reader actually sees. What it used to add, a pointer
  // to the block below and criterion d, is said once, down there.
  if (carriesTm59(preset)) {
    host.append(elem('i', 'chase-part', ' A count of lines, not a result against the method.'));
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
  // A row names its kind once. It used to name it twice — as `kind`, and again
  // inside its own `fmt` — which left the two free to disagree outright: change
  // the `kind` to correct a conversion and the figure keeps converting the old
  // way under a unit column that has been corrected. `fmt` is kept only by the
  // two rows that group rather than convert.
  { label: 'Energy', field: 'eui', unit: 'kWh/m²·yr', kind: 'energyIntensity', digits: 1 },
  { label: 'Heating', field: 'tedi', unit: 'kWh/m²·yr', kind: 'energyIntensity', digits: 1 },
  // The load beside the energy, because what a scheme costs to run and what it
  // costs to install are two different arguments and a shelf that carried only
  // the first would keep settling the second by accident. It is also the one
  // column here a design-day run can fill.
  { label: 'Peak heat', field: 'peakHeat', unit: 'W/m²', kind: 'fluxDensity', digits: 1 },
  { label: 'Cost', field: 'cost', unit: '', kind: 'currency', fmt: (v, m) => `${group(v, 0)} ${m.currency ?? ''}`.trim() },
  { label: 'Carbon', field: 'carbon', unit: 'kgCO₂e', kind: 'carbonMass', fmt: (v) => group(v, 0) },
]);

/** One shelf cell, in the system showing. */
const shelfText = (column, value, measure) =>
  (column.fmt ? column.fmt(value, measure) : figureIn(KINDS[column.kind], value, { digits: column.digits }));

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
      // The file, where one was attached when this was kept. It is lettered
      // after the place because the place is what the reader recognises the
      // scheme by and the file is which year of it.
      scheme.file,
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
      td.textContent = Number.isFinite(value) ? shelfText(column, value, scheme.measure) : '—';
      const said = unitIn(KINDS[column.kind], column.unit);
      td.dataset.label = said ? `${column.label}, ${said}` : column.label;
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
        shelfText(column, value, scheme.measure) !== shelfText(column, mine, here)
      ) {
        const diff = mine - value;
        // Safe to letter a difference through the column's own kind: none of
        // the five carries an offset, and there is no temperature on this
        // shelf. A column that gained one would need a delta kind, as the
        // schedule's temperature rows do.
        d.textContent = `${diff > 0 ? '+' : '−'}${shelfText(column, Math.abs(diff), here)}`;
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

/**
 * State a boot load that failed, and stop the boot.
 *
 * Until this existed, a missing engine or schema bundle stopped the module at
 * a top-level await with nothing on the sheet but the last progress line, so
 * a reader saw "Compiling engine" for ever and a report had nothing to say.
 * The refusal goes in the status line where every other one does, is recorded
 * once for the report, and is marked `reported` so the error trap in
 * `report-sheet.js` does not list the same failure a second time when the
 * rejection surfaces.
 */
function bootFailure(what, error) {
  statusEl.className = 'status bad';
  statusEl.textContent = `The ${what} could not be loaded: ${error?.message ?? error}`;
  errors.record({ source: 'boot', message: statusEl.textContent });
  const reported = error instanceof Error ? error : new Error(String(error));
  reported.reported = true;
  return reported;
}

// The handler is attached as the promise is made rather than where it is
// awaited further down: rejected before anything awaits it, it would surface
// as an unhandled rejection first and be recorded twice.
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
}).catch((error) => {
  throw bootFailure('engine', error);
});

// `predev`/`prebuild` stage the bundle into `public/schemas/`; `httpSource`
// resolves the path against the document and inflates the `.gz` files, or not,
// depending on what the host has already done to them.
const schema = await new SchemaBundle(httpSource(`${import.meta.env.BASE_URL}schemas/`))
  .load(ENERGYPLUS_VERSION)
  .catch((error) => {
    throw bootFailure('schema bundle', error);
  });
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
// The link exactly as it arrived, kept before the decode: a refusal clears
// the address bar, and a report of a refused link has to carry the link.
const arrivedHash = location.hash.slice(1);
if (location.hash.length > 1) {
  try {
    linked = decodeState(location.hash.slice(1));
    trail.push('link', 'Opened on a scheme link');
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
applyGeometry(); // also sets SURFACES, draws the axonometric and letters the Timestep cell
const facts = modelFacts(model);
$('t-project').textContent = facts.project;
$('t-site').textContent = siteLine(facts);
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
  // A desk asked to run design days it does not have.
  //
  // Reachable, and reachable by an ordinary gesture: a weather file attached
  // without a DDY beside it leaves the model with no `SizingPeriod:DesignDay`
  // at all (`attachClimate`), and Design days on the Run strip is still a
  // control the reader can turn back to Run. What the engine does with that is
  // a get-input fatal about zero environments, blamed on nothing the reader
  // did — so it is refused here instead, before a run starts, naming the two
  // things that would fix it.
  //
  // Refused rather than withdrawn, and the difference is worth stating: a
  // withdrawn control would have to be hidden from `controls.js`, whose
  // declarations see only `params`, and whether the desk holds design days is a
  // property of what was attached rather than of any parameter. A refusal in
  // view says the same thing in the place the reader is looking.
  if (params.sizingPeriods === 'Yes' && !designDayDatums(model).length) {
    stopAuto();
    clearResults();
    statusEl.className = 'status bad';
    statusEl.textContent =
      'This desk has no design days: the attached weather file came without a DDY beside it. ' +
      'Set Design days to Skip on the Run strip to run the file’s year, or attach the DDY that came with it.';
    return;
  }

  // A desk asked to run months the attached file has not got.
  //
  // The other half of admitting a file shorter than a year, and the same shape of
  // problem as the design days above: reachable by an ordinary gesture, fatal in
  // the engine, and blamed on nothing the reader did.
  //
  // Refused rather than corrected. Narrowing the calendar here would be the desk
  // overruling a control the reader set, and it would put the sheet outside its
  // own link: `months` is on `params`, a permalink carries it, and a mask quietly
  // rewritten at attach time would have the same address produce a different run
  // on the machine that happened to attach first.
  if (monthsOutsideFile()) {
    stopAuto();
    clearResults();
    statusEl.className = 'status bad';
    statusEl.textContent = fileMonthsRefusal();
    return;
  }

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
    // The archive's name for a station, the reader's own file name for a file,
    // narrowed in `source.js` to what a ZIP member may carry.
    weatherStem: epwText && weatherSource ? weatherSource.stem : null,
    // Whether the weather in this bundle is the reader's own. A station's
    // archive is public and the manifest can simply name it; a file they
    // attached may be licensed, and the ZIP is about to carry a copy of it to
    // their disk, from where it is one drag onto an issue away from being
    // public. Said in the manifest rather than policed, because the licence is
    // theirs and this page has no way to read it.
    ownWeather: epwText ? weatherSource?.kind === 'file' : false,
    location: $('t-location').textContent,
    permalink: schemeUrl(snapshot),
  };
  // The building this run is of, read here rather than after the await for the
  // same reason everything else in `capture` is: the finding opens with a
  // description, and a slider turned during a 0.7 s annual run would have that
  // sentence describing a building the chart under it never solved. The
  // document is the one the IDF is about to be written from, so the sentence
  // and the file agree by construction.
  // No `place`. The paragraph used to open "In Denver Intl AP, ASHRAE zone
  // 5B.", which the title block's Location and the site picker's climate zone
  // already letter a few centimetres above it, and the description and the
  // finding together are held to sixty words. The building is what the
  // paragraph is for; the station is said once, where it is chosen.
  // The arguments, not the sentence. `describeDesk` returns tokens that are
  // already lettered — the figure and the unit word both — so a units switch
  // cannot re-letter them in place and the paragraph would have stood half in
  // feet and half in metres. Held as its inputs, it is rebuilt instead.
  //
  // `params` and `state` are the captured snapshot, so every clause about what
  // the reader set is the desk this run was written from. The geometry comes
  // off the document as it now stands, which is the same rule the quantities
  // panel follows when the same switch re-letters it: those are facts about the
  // drawing, not readings off the run.
  const describeInput = { doc: model, params: snapshot, state: modelState };
  const live = continuous();
  quiet = live;
  trail.push('run', epwText ? 'annual solve started' : 'design-day solve started', { key: 'run' });

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
    lastEngineErrors = [];
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
  lastEngineErrors = errs
    .filter((e) => e.severity === 'severe' || e.severity === 'fatal')
    .map((e) => `[${e.severity}] ${String(e.message).replace(/\s+/g, ' ').trim()}`);
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
  // Read once for the whole schedule rather than per column: the illuminance
  // and occupancy series are each a year long, and slicing one pair of reads is
  // what stops a twelve-column desk walking them twelve times over.
  const daylight = daylightByRun(eso, runs, { floor: occupiedFloor(snapshot) });
  const columns = runs.map((r) => ({
    label: r.label,
    noun: r.noun,
    metrics: metricsFor(
      zone,
      out,
      r,
      hasOutdoor,
      r.kind === null ? demandOver(eso, new Set([r.key]), floorArea) : null,
      daylight.get(r.key) ?? null,
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
      ? 'Zone mean air temperature against outdoor drybulb over the full run period; each column spans its hourly range. Geometry drawn from the IDF.'
      : capture.annual
        ? 'Zone mean air temperature against outdoor drybulb over the months in the run. Geometry drawn from the IDF, tinted by the zone mean.'
        : 'Zone mean air temperature against outdoor drybulb across both Denver design days. Geometry drawn from the IDF, tinted by the zone mean.'
    : 'Zone mean air temperature over the run. No outdoor drybulb was recorded in the ESO.';

  // Declared here rather than inside the record below, because the traverse
  // stop further down reads it too.
  const m = lead.metrics;
  // Whether an ideal unit was in the path, read off the run and not off the
  // desk: these meters exist only when the System strip is engaged, and the
  // controls may have moved since this run was started. The sentence used to
  // open "with no heating or cooling anywhere in this model" whatever the strip
  // was doing, which was the sheet stating the opposite of what it had just
  // simulated.
  const conditioned = END_USES.some((u) => u.needs === 'system' && meterTotal(eso, u.meter) != null);
  // The same reading the sweep takes at every sample, over the same billed
  // environments, so the sentence, the schedule's columns and the tick under
  // a study's redline are one number rather than three that ought to agree.
  const demand = readDemand(eso, floorArea);
  const billedRuns = runs.filter((r) => r.kind === null);
  // What the paragraph is made of, kept so a units switch can letter it again.
  //
  // A record and not a closure. The closure read better and cost more than it
  // looked: it would have kept the whole of this function's scope alive, and
  // that scope is shared with `file` and the elapsed-time interval, so the
  // run's IDF text, the entire EPW file and the parsed ESO stayed pinned under
  // the next run — to re-letter about eight numbers. Everything here is small,
  // and computing the three readings above once rather than inside the redraw
  // also stops a toggle press re-walking the meters and the zone series.
  lastFinding = {
    describeInput,
    m,
    leadNoun: lead.noun,
    conditioned,
    demand,
    billedCount: billedRuns.length,
    billedNoun: billedRuns[0]?.noun ?? null,
  };
  paintFinding(lastFinding);

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

  // And the daylight square, on a measured figure rather than on the reading
  // object existing. `readDaylight` always returns one, so a test on the object
  // would fill the square off a design-day run that lettered an em dash — and
  // the step's own sentence asks for a year with Gains in, which is exactly the
  // pair of conditions `value` being a number stands for. `!= null` rather than
  // `!== null`, because the reading is absent altogether before the first solve
  // and a missing outcome must not read as a measurement.
  if (lastOutcome?.daylight?.value != null) tour?.note('daylight');
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
 * The desk a sample stands on: the job's snapshot with its swept control moved.
 *
 * Spelled inline at four call sites before this had a name — the cache
 * identity, the build, the meter basis and the refusal — which is one more
 * than the number at which a repeated literal starts being a place for the
 * four to drift.
 */
const deskAt = (job, value) => ({ ...job.snapshot, [job.key]: value });

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

// The published card, resolved once per place rather than once per bill: a
// priced drag prices every study position and every spot height on every frame,
// and the card depends on nothing but where the building is.
//
// Keyed on the place object's identity rather than on a station's. `deskPlace()`
// returns the frozen `SHIPPED_PLACE` or the frozen `Place` an attach built, and
// both are replaced whole rather than mutated -- so identity is the right test,
// and an attach that happened not to change the country still invalidates a
// card resolved for somewhere else.
let publishedCard = { place: undefined, card: null };
const publishedRates = () => {
  const place = deskPlace();
  if (publishedCard.place !== place) publishedCard = { place, card: resolveRates(place) };
  return publishedCard.card;
};

function billFromBasis(basis, pricing) {
  if (!basis || !Object.keys(basis.series).length) return null;
  return computeBill({
    series: new Map(Object.entries(basis.series)),
    params: pricing,
    card: assume(publishedRates(), pricing),
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
  const sampleParams = deskAt(job, built.value);
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

/** The ids of the channels a desk has in the path. */
function engagedChannels(snapshot, patch) {
  return [...channelState(snapshot, patch)].filter(([, value]) => value.engaged).map(([id]) => id);
}

// `key` is the study's own control, where the offers are for one card: a priced
// control refuses the readings it cannot move, after every other refusal.
function studyOffers(snapshot = params, patch = patching(), epw = epwText ?? null, key = null) {
  const channels = engagedChannels(snapshot, patch);
  const engaged = new Set(channels);
  const card = assume(resolveRates(deskPlace()), snapshot);
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
    key,
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
 *
 * The one channel a sample may not lose is the swept control's own, and that
 * is refused before this is ever consulted: a heating setpoint swept past the
 * cooling one blocks System, and solved anyway those positions would be the
 * free-running building drawn on the conditioned building's curve. See
 * `sampleRefusal`.
 *
 * A list of quantities, because a ground surveyed for demand and overheating is
 * one set of runs read twice, not two sets: the needs are their union.
 */
function sampleContentsFor(quantities, snapshot, patch, annual) {
  const channels = engagedChannels(snapshot, patch);
  const needed = RunContents.union(quantities.map((quantity) => contentsFor(quantity, channels)));
  const carried = new RunContents({
    variables: needed.variables,
    meters: needed.meters,
    tables: needed.tables,
    annual,
    channels: needed.channels,
    season: annual && touchesSeason(snapshot.months),
  });
  return { needed, carried };
}

/**
 * One run's readings with the bill's three readings re-read at `pricing`.
 *
 * The only place the bill is applied to a retained meter basis (FR-012). The
 * cache reprice, every position of a priced sweep and every spot height of a
 * ground all come through here, so a figure on a curve is the figure the bill
 * would letter with the desk standing there, by the one arithmetic.
 */
function pricedReadings(readings, basis, pricing) {
  const landed = { bill: billFromBasis(basis, pricing) };
  const priced = { ...readings };
  for (const quantity of BILL_QUANTITIES) priced[quantity.id] = quantity.read(landed);
  return Object.freeze(priced);
}

/** The readings a price can move, by their own `movedBy` declaration. */
const BILL_QUANTITIES = Object.freeze(QUANTITIES.filter((quantity) => quantity.movedBy.size));

/** A job's swept keys as a list: a study's one key, a survey row's two axes. */
const sweptKeys = (job) => (Array.isArray(job.omits) ? job.omits : [job.omits]);

/** Whether a job sweeps any priced key, which is what earns it per-position pricing. */
const sweepsPriced = (job) => sweptKeys(job).some((key) => PRICED_KEYS.has(key));

/**
 * Live `params` with the priced keys among `positions` laid over.
 *
 * Live rather than a job's snapshot for the priced keys not swept, which is what
 * `repriceStudies` has always done (spec 004 FR-020): a tariff turned under an
 * open study re-prices it at the tariff now showing. `positions` is a list of
 * `[key, value]`; a shaping key among them is ignored, since its value is
 * already in the run.
 */
function pricingOver(positions) {
  const pricing = { ...params };
  for (const [key, value] of positions) {
    if (PRICED_KEYS.has(key)) pricing[key] = value;
  }
  return pricing;
}

/** The priced settings one position of a sweep is priced at: the swept key at `value`, a row's Y at the row's. */
const pricingAt = (job, value) =>
  pricingOver(sweptKeys(job).map((key) => [key, key === job.key ? value : job.snapshot[key]]));

/**
 * Re-price every measured position of the ground at the desk's priced settings.
 *
 * A spot height holds the readings it was landed with, so before this nothing
 * re-priced E-02 at all: turning the gas price with a ground surveyed for cost
 * re-lettered the bill and left every spot height at the old price (measured on
 * `main`, specs/011-sweep-priced-controls/verify/README.md, T002). Each spot
 * carries its run's meter basis, so this needs no cache entry and no run.
 *
 * A priced axis is taken at the spot's own position and every other priced key
 * off live `params`, as a study's positions are. A spot that no longer prices
 * becomes a gap carrying the bill's own reason and keeps its basis, so the rate
 * returning stands it back up with no run (FR-015); a spot height with no
 * reading is never built, since coverage would count it as measured.
 */
function repriceSurvey(key = null) {
  if (!survey) return;
  // Only the bill's readings carry a price, and a priced drag lands here every
  // frame: a ground of temperatures has nothing to re-price, and a face the
  // ground's readings do not list in `movedBy` (the grid intensity under a
  // ground of cost) moves no figure on it. A selector is always re-priced,
  // since it decides which faces reach the bill at all. A priced axis moved
  // by hand re-prices nothing either: every spot takes that axis at its own
  // position. It still redraws, for the stance mark.
  if (!survey.quantities.some((quantity) => quantity.movedBy.size)) return;
  const face = key === null ? null : controlFor(key).control;
  if (face?.kind === 'scale') {
    const isAxis = key === survey.x.key || key === survey.y.key;
    if (isAxis || !survey.quantities.some((quantity) => quantity.movedBy.has(key))) {
      renderSurveySoon();
      return;
    }
  }
  // A withdrawn axis is left priced as it stood; `renderSurvey` draws nothing
  // while it stands, and the re-price that follows the face's return is at the
  // desk as it then is.
  if (surveyWithdrawn(survey)) {
    renderSurveySoon();
    return;
  }
  for (const point of [...survey.points.values()]) {
    if (!point.basis) continue;
    const pricing = pricingOver([
      [survey.x.key, survey.x.positions[point.ix]],
      [survey.y.key, survey.y.positions[point.iy]],
    ]);
    const readings = pricedReadings(point.readings, point.basis, pricing);
    landPoint(survey, {
      ix: point.ix,
      iy: point.iy,
      readings,
      basis: point.basis,
      // Asked only where the spot will land as a gap: it prices the bill a
      // second time, and this runs for every point on every frame of a drag.
      reason:
        survey.readings[0].valueOf(readings) === null
          ? unpricedReason(point.basis, pricing, survey.readings[0].quantity)
          : null,
      floorArea: point.basis.floorArea,
      cacheKey: point.cacheKey,
    });
  }
  renderSurveySoon();
}

/**
 * The bill's own reason a reading could not be priced here, or null.
 *
 * The `Absent` rate on the first line left without a figure, which is exactly
 * the sentence the bill letters beside its own em dash. Null for a reading the
 * rates do not reach, where `landPoint`'s own sentence is the true one.
 */
function unpricedReason(basis, pricing, quantity) {
  if (!quantity.priced) return null;
  const priced = billFromBasis(basis, pricing);
  const line = priced?.lines.find((candidate) => !Number.isFinite(candidate[quantity.priced]));
  const rate = line && (quantity.priced === 'cost' ? line.costRate : line.carbonRate);
  return rate?.reason ?? null;
}

function repriceStudies() {
  if (!studyScheduler) return;
  studyScheduler.reprice((readings, basis) => pricedReadings(readings, basis, params));
  if (studyQuantity) redrawStudiesForQuantity({ queue: false, requeueLifted: true });
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
    applyModel(model, deskAt(job, value), job.patch, {
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
    deskKey(deskAt(job, value), job.patch),
    job.annual ? 'year' : 'design-day',
  ]);
  return { bucket, exact: JSON.stringify([bucket, carried.serialize()]) };
}

/**
 * The channels a job's swept keys belong to, in the order the keys are given.
 *
 * The one place `job.omits` is normalised — it is a bare key for a study and a
 * pull probe, a pair for a survey row (`makeStudyJob` defaults it to the key).
 * `controlFor` resolves a wall's own key to the `Facade` that owns it, so a
 * ground cut across two walls asks one channel twice, which `sampleRefusal`
 * answers on the first and is why there is no dedupe here to go stale.
 */
/**
 * The withdrawn sentence of the first priced key that is idle on `desk`, or null.
 *
 * One reading for the scheduler's per-position refusal, the survey's standing
 * refusal and the axis chooser, so all three say what the console letters
 * under the row.
 */
function withdrawnRefusal(keys, desk) {
  for (const key of keys) {
    const refusal = controlFor(key).control.withdrawnAt?.(desk);
    if (refusal) return refusal;
  }
  return null;
}

const sweptChannels = (omits) => [omits].flat().map((key) => controlFor(key).channel.id);

studyScheduler = createStudyScheduler({
  // The cache key is the sample's whole desk — the overlay's shape key —
  // plus the run kind and canonical carried contents, so a lean design-day
  // sample can never answer for an annual one. The station is
  // deliberately absent, which is why a station change clears the cache.
  keyOf: sampleIdentity,
  buildSample,
  // Asked of the swept controls' own channels only; see `sampleRefusal` for why
  // another channel going out under the overlay is still a position.
  //
  // `job.omits` rather than `job.key`, because it is the set of keys this job
  // sweeps: a study's own control, and a survey row's two axes — the one it
  // steps along and the one the row stands at. `makeStudyJob` defaults it to
  // the key, so a study asks exactly what it asked before.
  //
  // Then a withdrawn priced face, asked of the job's own desk so the hook stays
  // pure. An idle shaping control still reaches the document, so its curve is a
  // measurement; `heatEfficiency` under a heat pump reaches nothing, not even
  // the bill, and every position of it would be the same figure drawn as though
  // the swept value had been used.
  refuses: (job, value) => {
    const desk = deskAt(job, value);
    const refusal = sampleRefusal(desk, job.patch, sweptChannels(job.omits));
    if (refusal) return refusal;
    return withdrawnRefusal(sweptKeys(job), desk);
  },
  // Every position of a priced sweep shares one run, so it is priced here, at
  // its own value, rather than read at whichever price the cache entry holds.
  // A job sweeping only shaping keys takes the cache's readings untouched.
  priceAt: (job, value, sample) =>
    sweepsPriced(job) ? pricedReadings(sample.readings, sample.meterBasis, pricingAt(job, value)) : sample.readings,
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
  // Shut during a gesture. A survey's rows go in together through
  // `enqueueAll`, which admits the lot and drains once.
  paused: () => gesture,
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
  const { needed, carried } = sampleContentsFor([quantity], snapshot, patch, Boolean(epw));
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

/**
 * Why one study card stands refused rather than drawn, or null.
 *
 * A withdrawn priced face first, since it is a fact about the desk and the
 * selector that fixes it sits above the row; then whatever refused the
 * selected reading, the pairing refusal included. Both stand the card in its
 * waiting state with the sentence and draw no curve: a heat pump under a study
 * of seasonal efficiency would otherwise letter twenty-two refused positions
 * as though a channel had gone out, and a price against demand a flat line.
 * The card comes back, with no run, when the face or the reading does.
 */
function studyRefusal(key, snapshot, selected) {
  return withdrawnRefusal([key], snapshot) ?? (selected.available ? null : `${selected.reason} ${selected.fix}`);
}

/** Queue one study of the desk as it stands right now. */
function enqueueStudy(key, { origin, front = false, n = SWEEP_SAMPLES, openingBasis = null } = {}) {
  const job = jobForStudy(key, { origin, n, openingBasis });
  const quantity = quantityOf(job.quantity);
  const offers = studyOffers(job.snapshot, job.patch, job.epw, key);
  const selected = offers.find((offer) => offer.quantity.id === quantity.id);
  const refusal = studyRefusal(key, job.snapshot, selected);
  if (refusal) {
    const prior = studies.get(key);
    const waiting = {
      ...(prior ?? {}),
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      wholeYear: job.annual && isWholeYear(job.snapshot.months),
      quantity: quantity.id,
      offers,
      waiting: { quantity: quantity.label, missing: job.total, reason: refusal },
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

function redrawStudiesForQuantity({ queue = true, requeueLifted = false } = {}) {
  if (!studyScheduler || !studyQuantity) return;
  const quantity = quantityOf(studyQuantity);
  // The desk's offers are the same for every card; only a priced key refuses
  // readings of its own, so only those are asked again with the key.
  const deskOffers = studyOffers();
  for (const [key, prior] of studies) {
    const offers = PRICED_KEYS.has(key) ? studyOffers(params, patching(), epwText ?? null, key) : deskOffers;
    const job = jobForStudy(key, { n: prior.coarse ? COARSE_SAMPLES : SWEEP_SAMPLES });
    const cached = studyScheduler.curveFor(job);
    const selected = offers.find((offer) => offer.quantity.id === quantity.id);
    const refusal = studyRefusal(key, params, selected);
    const unavailable = Boolean(refusal);
    const study = {
      ...prior,
      quantity: quantity.id,
      offers,
      curve: unavailable ? [] : cached.curve,
      waiting: unavailable
        ? { quantity: quantity.label, missing: job.total, reason: refusal }
        : cached.missing
          ? { quantity: quantity.label, missing: cached.missing, reason: null }
          : null,
      restShape: job.restShape,
    };
    studies.set(key, study);
    desk.setStudy(key, study, { stale: false });
    // A card that stood refused and no longer does is queued even on a re-price:
    // the refusal lifts through a priced selector (the plant switched back from
    // a heat pump), which moves no shape, so `refreshStudies` never sees it and
    // a card refused before its first run would otherwise wait for nothing.
    // A Stop still holds: the priced switch moved no rest shape, so the desk
    // has not moved past it.
    const lifted =
      requeueLifted &&
      !linkAttachPending &&
      Boolean(prior.waiting?.reason) &&
      !unavailable &&
      studyStops.get(key) !== restShapeKey(key);
    if (!unavailable && cached.missing && (queue || lifted) && autoOn() && !studyScheduler.has(key)) {
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
  offers: studyOffers(job.snapshot, job.patch, job.epw, job.key),
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
    whenIdle(() => densifyStudies());
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

  // A priced face withdrawn while its one run was in flight. The job's own
  // snapshot still has the face live, so `refuses` passes every position, but
  // `priceAt` prices at the live desk, where the swept value reaches nothing:
  // drawn, the curve is the flat line `studyRefusal` exists to refuse. The run
  // stays in the cache, so the face returning redraws it with no run.
  const withdrawn = withdrawnRefusal([key], params);

  if (event === 'point') {
    if (!withdrawn) desk.setStudy(key, partialStudy(job), { stale: false });
    desk.setStudyProgress(key, { done: job.done, total: job.total });
    syncStudyStatus();
  } else if (event === 'done') {
    const study = {
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      wholeYear: job.annual && isWholeYear(job.snapshot.months),
      quantity: job.quantity,
      offers: studyOffers(job.snapshot, job.patch, job.epw, key),
      waiting: withdrawn
        ? { quantity: quantityOf(job.quantity).label, missing: job.total, reason: withdrawn }
        : null,
      openingBasis: job.openingBasis,
      curve: withdrawn ? [] : job.curve,
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
    // A refused position reached no engine, so it is not a run.
    const refused = job.curve.filter((point) => point?.refused).length;
    const note = refused ? `, ${refused} positions refused` : '';
    // Positions and runs are one count only while every position is its own
    // building. A priced study's twenty-two positions price one run, and
    // lettering them as twenty-two runs is a count of the wrong thing, so the
    // runs are counted from the meter bases behind the points and both are said
    // where the two differ (FR-027).
    const positions = job.total - refused;
    // Only a priced sweep can share runs between positions. A shaping study
    // whose run failed, or was evicted from the cache, also counts fewer
    // identities than positions, and is not "priced from" anything.
    const runs = sweepsPriced(job)
      ? new Set(job.curve.map((point) => point?.sample?.meterBasis).filter(Boolean)).size
      : positions;
    const counted = runs === positions
      ? `${positions} ${kind} runs`
      : `${positions} positions, priced from ${runs} ${kind} ${runs === 1 ? 'run' : 'runs'},`;
    syncStudyStatus(`Study drawn — ${counted} across ${said}${note}.`, {
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
      // A curve with every position refused never ran at all, and "failed to
      // solve" would send the reader looking for an engine error that does
      // not exist. It says what the strip would say instead.
      const refused = job.curve.find((point) => point?.refused);
      statusEl.className = 'status bad';
      statusEl.textContent = refused && job.curve.every((point) => point?.refused)
        ? `The study of ${said} could not be drawn: every position takes its own channel out of the model. ${refused.refused}`
        : `The study of ${said} could not be drawn: every sample failed to solve.`;
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

/** Whether every reading the survey carries can be answered on its own desk. */
function surveyRefusal(sv) {
  const ids = new Set(sv.readings.map((reading) => reading.id));
  const refused = surveyReadingOffers(sv.stance, sv.patch, sv.epw)
    .find((offer) => ids.has(offer.reading.id) && !offer.available);
  return refused?.reason ?? surveyWithdrawn(sv);
}

/**
 * A priced axis whose face the live desk has withdrawn, as its sentence, or null.
 *
 * Against live `params`, not the stance: the selector that withdraws a priced
 * face is itself priced, so switching the plant under an open ground moves no
 * shape and cancels nothing, and the ground has to be told some other way that
 * one of its axes has stopped meaning anything (a heat pump under a ground of
 * seasonal efficiency).
 */
function surveyWithdrawn(sv) {
  return withdrawnRefusal([sv.x.key, sv.y.key], params);
}

/** The rest of the desk, excluding both axes — see `deskKey`'s note. */
function surveyRestShape(sv, p = params, patch = patching()) {
  return deskKey(p, patch, [sv.x.key, sv.y.key]);
}

/** What one survey's runs must carry: `sampleContentsFor`, over all its quantities. */
function surveyContents(sv) {
  return sampleContentsFor(sv.quantities, sv.stance, sv.patch, sv.annual);
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
 * gestures, so the rows go in through `enqueueAll`, which admits the lot and
 * drains once.
 */
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
    for (const want of refineOrder(sv, { stance: sv.cutAt })) {
      priority.set(want.iy, Math.max(priority.get(want.iy) ?? -Infinity, want.score));
    }
    specs.sort((left, right) => (priority.get(right.iy) ?? -Infinity) - (priority.get(left.iy) ?? -Infinity));
  }
  surveyRows.clear();
  const jobs = specs.map((spec) => {
    const job = makeStudyJob(spec);
    surveyRows.set(job.id, spec.iy);
    return job;
  });
  // Set before the drain, as it always was: a row answered wholly from the
  // cache can finish inside it, and the pass it finishes has to be known.
  surveyPass = grid;
  studyScheduler.enqueueAll(jobs);
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
    // A gap that kept its run could not be priced, and `repriceSurvey` owns it:
    // this row's curve still holds the figure priced when the point landed, so
    // re-landing it here would stand the gap up at a price the desk has left.
    if (already?.basis) continue;
    // The point's own readings, priced at its position by `priceAt`, and not
    // `point.sample.readings`, which is the one run priced wherever it first
    // landed: along a priced axis every spot height shares that run.
    landPoint(survey, {
      ix,
      iy,
      readings: point.readings,
      basis: point.sample?.meterBasis ?? null,
      // Or `landPoint`'s own fallback would call it "The run did not complete"
      // over a position where no run was ever started. The distinction itself
      // is the scheduler's, at `land`.
      reason: point.refused ?? null,
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
    renderSurveySoon();
    return true;
  }
  if (event === 'done' || event === 'failed') {
    absorbSurveyRow(job);
    surveyRows.delete(job.id);
    if (!surveyRows.size) onSurveyPassDone();
    renderSurveySoon();
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
    renderSurveySoon();
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
  whenIdle(() => refineSurvey());
}

/**
 * Run `fn` in idle time, but not never.
 *
 * Chrome defers `requestIdleCallback` indefinitely in a backgrounded tab:
 * measured here, a coarse ground landed and the densify simply never ran — no
 * error, no symptom, a survey that stayed at 36 of 36 for as long as anybody
 * watched. The timeout is the API's own answer to that, and a two-second
 * ceiling is far outside the window where the reader is still reaching for
 * the control a deferral is for. One helper, because the fix was first made
 * at one of the three sites that needed it and only noted as owing at another.
 */
function whenIdle(fn, { timeout = 2000, fallback = 300 } = {}) {
  if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, fallback);
}

/**
 * Letter E-02 once per frame, however many samples land in it.
 *
 * `renderSurvey` rebuilds the plan, the schedules, the key and the relief's
 * mesh, and a pool of six on design days lands several samples a frame. Each
 * one used to rebuild the lot, and the reader can only ever see the last.
 */
let surveyFrame = 0;
function renderSurveySoon() {
  if (surveyFrame) return;
  surveyFrame = requestAnimationFrame(() => {
    surveyFrame = 0;
    renderSurvey();
  });
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
  // Every position along a withdrawn axis is refused, and a refused gap is
  // never re-measured, so a densify now would fill the ground with holes.
  if (surveyWithdrawn(survey)) return;
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
      readings: point.readings ?? null,
      basis: point.basis ?? null,
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
  // Asked before `makeSurvey`, which throws with the same sentence: from the
  // chooser a reader can name the reading first and a priced axis second, and
  // that is a refusal to letter in place, not an exception.
  const pairing = pairingRefusal([xKey, yKey], readings);
  if (pairing) {
    closeSurvey();
    surveyRefused = pairing;
    renderSurvey();
    return;
  }
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
  renderTraverse();
  renderSurvey();
  updatePermalink();
}

/* ── E-02, drawn ─────────────────────────────────────────────────────────── */

/** Every control a ground may be cut along, with its refusal where it has one. */
function axisOffers(snapshot = params, patch = patching()) {
  const state = channelState(snapshot, patch);
  const offers = [];
  for (const channel of CHANNELS) {
    // Priced channels are offered too (spec 011 FR-001): nothing they own
    // reaches the IDF, so an axis along one prices the shaping axis's runs.
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
        // A priced channel is never patched out, only blocked (Plant, with
        // System out), and says so in its own sentence; a priced face whose
        // selector has withdrawn it says what the console letters under it.
        const withdrawn = control.withdrawnAt?.(snapshot);
        const reason = faceless
          ? null
          : !engaged
            ? channel.prices
              ? state.get(channel.id).blocked
              : `Patch ${channel.name} in; with it out of the path this control reaches no object.`
            : withdrawn
              ? withdrawn
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

/**
 * Every reading a ground may be surveyed for, against this desk's own offers.
 *
 * `axes` are the controls chosen so far. A reading a priced axis cannot move is
 * greyed with the study card's own sentence and fix, after the desk's own
 * refusals, so a reading that also wants a weather file asks for that first.
 */
function surveyReadingOffers(snapshot = params, patch = patching(), epw = epwText ?? null, axes = []) {
  const offers = studyOffers(snapshot, patch, epw);
  return SURVEY_READINGS.map((reading) => {
    const offer = offers.find((candidate) => candidate.quantity.id === reading.quantity.id);
    const pairing = offer.available ? pairingRefusal(axes, [reading]) : null;
    return {
      reading,
      available: offer.available && !pairing,
      reason: !offer.available ? `${offer.reason} ${offer.fix}` : pairing,
    };
  });
}

/**
 * The first refused pairing of these axes and readings, as its sentence and
 * fix, or null. The study card letters exactly this, from the same two calls.
 */
function pairingRefusal(keys, readings) {
  const refused = refusesSurveyPairing(keys.filter(Boolean), readings);
  return refused && `${refused.sentence} ${pairingFix(refused.key)}`;
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
  const rest = { ...choice.extents };
  delete rest[key];
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
let chooserDrawn = null; // { choice, standing } as last drawn
const PRICED_SELECTORS = Object.freeze(
  [...PRICED_KEYS].filter((key) => controlFor(key).control.kind === 'selector'),
);

function renderSurveyChoose() {
  const host = $('survey-choose');
  // `surveyChoice` is always replaced and never mutated, so identity is the
  // whole test for it; only the desk needs its key.
  //
  // The unit system belongs in that key, and leaving it out was a fault this
  // chooser was structurally unable to show. The Reading cell letters each
  // offer's `unitNow`, which converts correctly at the moment it is built and
  // then stands for the life of the session. Measured on the page: a sheet that
  // booted in IP offered `High °F`, and went on offering `High °F` after a
  // switch to SI, because neither the selection nor the desk had moved and this
  // function returned early. A reader who booted in SI was offered °C under an
  // IP sheet, the same fault pointing the other way. It is the `setStudy`
  // identity guard again, one surface along: a cache whose key cannot see the
  // system will hold a converted string past the switch that invalidated it.
  // And the priced selectors, which `shapeKey` drops: switching the plant to a
  // heat pump withdraws seasonal efficiency as an axis without moving a shape.
  // The selectors and not the faces, whose values the chooser never letters,
  // or every frame of a price drag would rebuild it.
  const pricedNow = PRICED_SELECTORS.map((key) => params[key]).join('|');
  const standing = `${shapeKey(params)}|${pricedNow}|${Boolean(epwText)}|${system()}`;
  if (chooserDrawn?.choice === surveyChoice && chooserDrawn.standing === standing) return;
  chooserDrawn = { choice: surveyChoice, standing };
  host.textContent = '';
  const axes = axisOffers();
  const readings = surveyReadingOffers(params, patching(), epwText ?? null, [surveyChoice.x, surveyChoice.y]);
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
        // The unit alone, and the category's own noun deliberately not beside it.
        // It was tried: `% of occupied hours · a dwelling of normal thermal
        // expectation` is eleven words in a cell beside a label, on four rows of
        // a fifteen-row list, and `copy.js` refused it. Which is the right
        // answer rather than an obstacle — the row already names the category in
        // its label, and who the category is for is said in the lede over the
        // ground, where there is room for it and where a reader looking at
        // figures needs it.
        note: offer.available ? offer.reading.unitNow : null,
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
 * Who the plotted categories are for, as one sentence or none.
 *
 * Off `Category.noun`, which `tm59.js` declares for precisely this use, rather
 * than a phrase written here: the board letters what a category presumes from
 * the same declarations, and a second wording of it would be free to drift into
 * describing a different set of occupants. Returns the empty string for a ground
 * whose readings carry no category, which is every reading but four.
 */
function categoriesSaid(readings) {
  const said = [];
  for (const reading of readings) {
    if (!reading.category || said.some((c) => c === reading.category)) continue;
    said.push(reading.category);
  }
  if (!said.length) return '';
  return ` ${said.map((category) => `${category.label} is read for ${category.noun}`).join(', and ')}.`;
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
 * The published lines this ground draws, and the one place the chase reaches
 * the drawing.
 *
 * Four surfaces letter these — the plan, its key, the relief and the aria
 * label — and they must not be able to disagree about what is drawn. This is
 * the one place `chased` reaches the drawing, and `renderSurvey` calls it once
 * and hands the answer to all four (`GroundLines` below), so FR-015 holds by
 * there being one reading rather than four that happen to agree. `thresholdsFor`
 * is pure and uncached, and stays so: a cache here would have to carry the
 * chase state *and* the unit system in its key, which is the trap this codebase
 * has met three times.
 *
 * `readings[0]` only, and deliberately: a survey may carry a second reading,
 * lettered as a ghost figure under the first, and it has no contours because
 * the ground is not its surface. A line at its limit would be a level on a
 * surface that is not drawn — there is nowhere on this ground for it to go.
 */
function groundThresholds(sv) {
  return thresholdsFor(sv.readings[0], { chased });
}

/**
 * The angle each band is hatched at.
 *
 * The improving region is already 45°, so none of these may be, and no two of
 * them may be each other — angle is the second dimension the palette leaves,
 * since a tint would read as a fourth surface on a board that has four and a
 * hue for a category is the one thing the design system refuses outright.
 *
 * Every target on this sheet passes at or below its limit, so the bands are
 * **nested** and their overlap reads as cross-hatch. That is the union of two
 * bands and not a third judgement: the key words each standard on its own row,
 * which is what keeps FR-011 true of a drawing where two regions overlap.
 *
 * Four, against a roster whose busiest reading draws two. Beyond four the
 * angles repeat, and two bands sharing one are still told apart by their own
 * boundary line and by their own row in the key — the same guarantee the
 * contour labels lean on when one of them cannot be placed.
 */
const BAND_ANGLES = Object.freeze([0, 90, 135, 22.5]);

/**
 * One drawn band: a level, the lines that share it, and the measured ground on
 * their passing side.
 *
 * `signature` is the whole reason this is a declaration rather than the plain
 * dictionary it started as. Four marks are taken from one index — the hatch
 * pattern's id, the fill class, the line's chain-dash class and the relief's
 * hatch angle — and three of them wrapped at four while the fill class did not.
 * A fifth band therefore asked for `.passing-4`, which the page does not
 * declare, and an SVG polygon with no `fill` is a solid black one: a whole
 * ground painted out on the day somebody publishes a fifth limit for one
 * reading. The wrap belongs to the band, once, and the four marks read it.
 */
class Band {
  constructor({ level, lines, ground, signature }) {
    this.level = level;
    this.lines = Object.freeze([...lines]);
    this.ground = ground;
    this.signature = signature;
    this.angle = BAND_ANGLES[signature];
    Object.freeze(this);
  }
}

/**
 * One band per drawn line, with the lines that share it.
 *
 * Grouped by level *and* by pass side, so two standards at one figure are one
 * band carrying both names — the common case, not an edge one — while two
 * lines that happened to coincide and pass opposite ways would still be two
 * regions, because they are.
 */
function groundBands(lattice, set) {
  const bands = [];
  for (const level of thresholdLevels(set)) {
    const at = thresholdsAt(set, level);
    for (const side of [true, false]) {
      const lines = at.filter((line) => line.passesBelow === side);
      if (!lines.length) continue;
      bands.push(
        new Band({
          level,
          lines,
          ground: passingGround(lattice, lines[0]),
          signature: bands.length % BAND_ANGLES.length,
        }),
      );
    }
  }
  return bands;
}

/**
 * The published lines of one ground, read once and handed to the four surfaces
 * that draw them.
 *
 * The plan, its key, the relief and the aria label must not be able to
 * disagree about what is drawn, and before this each of them read the
 * declarations for itself — the key going as far as cutting a second lattice
 * and tracing every band again for the one sentence it needed off each. Read
 * here, at the top of `renderSurvey`, and passed down: one set, one tracing,
 * one chase state, on a path that runs again on every landed sample.
 */
class GroundLines {
  constructor({ set, bands }) {
    this.set = set;
    this.bands = Object.freeze([...bands]);
    Object.freeze(this);
  }

  /** The band a line is drawn in. Every line is in exactly one, by construction. */
  bandFor(line) {
    const band = this.bands.find((each) => each.lines.includes(line));
    if (!band) {
      throw new Error(
        `"${line.label}" is a published line this ground drew no band for, so there is no hatch, no ` +
          'signature and no pass side to letter it with',
      );
    }
    return band;
  }

  /** The key's sentences, in the key's own order, which the aria label reuses. */
  sentences() {
    return this.set.lines.map((line) => thresholdSentence(line, this.bandFor(line).ground));
  }
}

/** Everything one drawing needs of the published lines, off one lattice. */
function groundLinesFor(sv, lattice) {
  const set = groundThresholds(sv);
  return new GroundLines({ set, bands: groundBands(lattice, set) });
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
 *
 * `lattice` and `lines` are `renderSurvey`'s, both cut for `readings[0]`, so
 * the contours, the bands and the key are one tracing of one surface.
 */
function drawGround(sv, lattice, lines) {
  const host = $('survey-ground');
  host.textContent = '';
  const reading = sv.readings[0];
  const { px, py } = groundFrame(sv);
  const root = svg('svg', {
    viewBox: `0 0 ${GROUND_SIZE} ${GROUND_SIZE}`,
    role: 'img',
    tabindex: '0',
    'aria-label': surveyAriaLabel(sv, lines),
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

  /* ── the published lines, and the ground on each one's passing side ──── */
  //
  // Read once by the caller and handed to everything below, so the band, the
  // line, its label and the key are four drawings of one set rather than four
  // readings of the declarations.
  const { bands } = lines;
  // One hatch per signature, at its own angle. Built here beside the improving
  // hatch rather than in the page, because the pattern and the band that fills
  // it are one arrangement and splitting them puts an id between them. Per
  // signature and not per band: beyond four the signatures repeat, and two
  // bands sharing one share its hatch as well as its dash.
  for (const at of new Set(bands.map((band) => band.signature))) {
    const hatch = svg('pattern', {
      id: `survey-band-${at}`,
      width: 5,
      height: 5,
      patternUnits: 'userSpaceOnUse',
      patternTransform: `rotate(${BAND_ANGLES[at]})`,
    });
    hatch.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'var(--ink-ghost)', 'stroke-width': 0.6 }));
    defs.append(hatch);
  }
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
  const axisTitle = (axis) => {
    // `unitNow`, not the declaration's SI string. This name carries the unit
    // once for a whole column of bare stops — that is the arrangement `stopOf`
    // is the other half of — so read off `control.unit` it stood as `Width · m`
    // over stops lettering 13.1 to 131.2 ft. Measured on the page: the same
    // defect `stopOf` was fixed for, surviving one label along because the two
    // halves of one arrangement were written in two places.
    const unit = axis.control.unitNow;
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
      text.textContent = stopOf(axis, lo);
      const text2 = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left + frame.w,
        y: GROUND_PAD.top + frame.h + 16,
        'text-anchor': 'end',
      });
      text2.textContent = stopOf(axis, hi);
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
      text.textContent = stopOf(axis, lo);
      const text2 = svg('text', {
        class: 'axis-stop',
        x: GROUND_PAD.left - 5,
        y: GROUND_PAD.top + 8,
        'text-anchor': 'end',
      });
      text2.textContent = stopOf(axis, hi);
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

  /* ── the passing ground, under everything, one region per line ───────── */
  //
  // Under the contours, the spot ticks and the stance, so nothing already on
  // this drawing is covered (FR-010) — and under the improving hatch too,
  // because that is a judgement against the desk and this is a judgement
  // against somebody else's published figure, and the reader has to be able to
  // keep them apart.
  //
  // Nothing is emitted over a cell whose mask is not full. That is not a rule
  // applied here but the shape of `passingGround` itself, exactly as no contour
  // is carried across unsurveyed ground: the geometry is never generated, so
  // there is nothing to style into looking measured (FR-004).
  for (const band of bands) {
    for (const cell of band.ground.cells) {
      root.append(
        svg('polygon', {
          class: `passing passing-${band.signature}`,
          points: cell.map(([cx, cy]) => `${px(cx)},${py(cy)}`).join(' '),
        }),
      );
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
  /**
   * How much room a candidate position has, against everything lettered so far.
   *
   * `half` is the label's own half-width, so the question asked is the
   * distance from each prior figure to the *box* the label will occupy rather
   * than to its centre. Asked of the centre alone, a fourteen-character label
   * cleared a spot figure by 22 units and then printed straight across it —
   * measured on the page, "Passivhaus 3.2" over a measured 3.6 — which is
   * exactly the collision FR-010 is about.
   */
  const roomAt = (at, half = 0) =>
    lettered.length
      ? Math.min(
          ...lettered.map((prior) =>
            Math.hypot(Math.max(0, Math.abs(prior[0] - at[0]) - half), prior[1] - at[1]),
          ),
        )
      : Infinity;
  const inField = (at) => at[0] > GROUND_PAD.left + 14 && at[0] < GROUND_PAD.left + frame.w - 14;
  /** A turn of a line with room to letter at, in page coordinates, or null. */
  const turnFor = (segments, room = 26) =>
    segments
      .map((segment) => [px(segment[0][0]), py(segment[0][1])])
      .filter(inField)
      .find((at) => roomAt(at) > room) ?? null;
  /**
   * The roomiest place on a line rather than the first that clears.
   *
   * A threshold label is longer than a contour's and there is one of it, so
   * taking the first turn that happens to clear left it unplaced on a dense
   * ground — measured on a 12 x 12 peak-load ground, where the line crossed
   * eight cells and every one of their start points stood within 40 units of
   * a spot figure. Midpoints count as candidates too: a segment's ends are
   * on cell edges, which is exactly where the lattice puts its figures.
   */
  const bestTurn = (segments, floor, half) => {
    let best = null;
    let most = floor;
    for (const [a, b] of segments) {
      for (const at of [
        [px(a[0]), py(a[1])],
        [px((a[0] + b[0]) / 2), py((a[1] + b[1]) / 2)],
      ]) {
        if (!inField(at)) continue;
        const room = roomAt(at, half);
        if (room > most) {
          most = room;
          best = at;
        }
      }
    }
    return best;
  };

  /* ── where each published line will be lettered, decided first ───────── */
  //
  // Placed **before** any contour label, and pushed into the same collision
  // list, so a threshold label can never print over a spot figure and a
  // contour can never print over a threshold's. The order matters and is the
  // whole of it: the spot figures are the only figures on this drawing that
  // are measurements, a threshold label is somebody's published line, and a
  // contour label is inference — so they take their turn in that order and
  // the one that cannot clear simply goes unlettered (FR-010).
  //
  // The label carries the standard's name and the limit together. Coincident
  // lines are one label carrying both names, because they are one line.
  const placed = bands.map((band) => {
    const text = `${band.lines.map((line) => line.standard).join(' · ')} ${band.lines[0].figure()}`;
    // 5.1 units a character is the mono face at 8.5px, measured on the page.
    const half = (text.length * 5.1) / 2;
    const at = bestTurn(band.ground.segments, 10, half);
    if (at) {
      // Entered as its own width rather than as a point, so a contour label
      // placed after it clears the whole label and not only its middle.
      for (let x = at[0] - half; x <= at[0] + half; x += 12) lettered.push([x, at[1]]);
      lettered.push([at[0] + half, at[1]]);
    }
    return at ? { at, text } : null;
  });
  // The interval `levelsFor` chose, which is what `step / 10` is a tenth of.
  const step = levels.length > 1 ? levels[1] - levels[0] : 0;
  // A contour within a tenth of an interval of a drawn line is that line drawn
  // twice — two hairlines a hair apart read as one ambiguous mark, which is
  // exactly what US2 asks not to be handed. Nothing is lost by dropping it: a
  // contour is inference carrying only its own level, and the threshold at
  // that level letters the same figure plus the standard that published it.
  // Applied here and nowhere else, so `levels` keeps its full ladder for the
  // relief's height axis, which is a scale rather than the ground.
  const shadowed = (level) =>
    step > 0 && bands.some((band) => Math.abs(level - band.level) < step / 10);
  for (const { level, segments } of contoursOf(lattice, levels)) {
    if (shadowed(level)) continue;
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
    const at = turnFor(segments);
    if (at) {
      lettered.push(at);
      const text = svg('text', { class: 'level', x: at[0], y: at[1] - 3, 'text-anchor': 'middle' });
      // Through the reading rather than off `toFixed`, which bypassed it
      // entirely and drew a contour in SI on an IP sheet. The bare figure, not
      // `format`: a contour label carries no unit by design — the legend
      // carries it once, which is what keeps a field of them readable.
      text.textContent = reading.figure(level);
      root.append(text);
    }
  }

  /* ── the published lines themselves, over the inference ──────────────── */
  //
  // Over the contours, because a pass/fail boundary is not one of them and
  // must never be confusable with one (FR-002), and under the spot ticks and
  // the stance, which are measurements and the desk's own position.
  //
  // Told apart by drafting and by words, never by hue: `--redline` is the
  // markup pen and means "the desk is here" on four drawings already, and
  // `--cold`/`--warm` encode a signed physical quantity, which a published
  // limit is not. So each line is `--ink` weight with its own chain-dash
  // signature — the surveyor's boundary convention — and carries its own
  // label. Signature and not weight: weight would rank one standard over
  // another, and nobody published a weighting to rank them with.
  bands.forEach((band, at) => {
    for (const [a, b] of band.ground.segments) {
      root.append(
        svg('line', {
          class: `threshold threshold-${band.signature}`,
          x1: px(a[0]),
          y1: py(a[1]),
          x2: px(b[0]),
          y2: py(b[1]),
        }),
      );
    }
    const where = placed[at];
    if (!where) return;
    const text = svg('text', {
      class: 'threshold-label',
      x: where.at[0],
      y: where.at[1] - 3,
      'text-anchor': 'middle',
    });
    // Lettered through the reading's own `figure`, as every other figure on
    // this drawing is, so an IP sheet letters an IP limit. The bare number and
    // no unit: the axis and the key carry it once.
    text.textContent = where.text;
    root.append(text);
  });

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
    // A figure at every one of a hundred and forty-four positions is
    // illegible, so on the fine ground the figures thin out. The rest are not
    // lost: pointing at any tick, or walking the ground with the arrow keys,
    // letters that design in full under the plan, and the folded schedule
    // below carries them all at once.
    if (value !== null && figureAt(spot)) {
      const text = svg('text', {
        class: 'spot-figure',
        x,
        y: y - 5,
        'text-anchor': 'middle',
      });
      text.textContent = reading.figure(value);
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
        under.textContent = other === null ? '—' : second.figure(other);
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
    // Pointing at a tick letters it under the plan. The `<title>` above is the
    // desk's tooltip and `pointer: coarse` never shows one, which is the same
    // hole the ground key was drawn to close — on a phone every explanation
    // that lives only in a `<title>` does not exist. This is also how the 108
    // figures a fine ground does not letter on the plan are read.
    //
    // The cursor is deliberately left where it is: the ring is the keyboard's
    // position and a hover is not a move. Nothing is re-rendered either, so
    // sweeping the pointer across 144 ticks costs a string apiece rather than
    // 144 redraws of the ground.
    hit.addEventListener('pointerenter', () => renderSpotReadout(sv, spot));
    hit.addEventListener('pointerleave', (event) => releaseReadout(sv, event));
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
    // A gap's reason was in a `<title>` and nowhere else, so on a phone the
    // cross said only that something had failed. Pointing at it now letters
    // why under the plan, on the same target size the ticks carry.
    const miss = svg('rect', {
      x: x - 12,
      y: y - 12,
      width: 24,
      height: 24,
      fill: 'transparent',
    });
    miss.addEventListener('pointerenter', () => renderSpotReadout(sv, gap));
    miss.addEventListener('pointerleave', (event) => releaseReadout(sv, event));
    mark.append(miss);
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
      // reader who cannot see it. `renderSurvey` has just lettered the design
      // under the new cursor into the readout, which is a live region, so the
      // sentence is announced by being written rather than by being repeated
      // into the refusal paragraph — which is where `surveySay` puts it, and
      // which is not announced at all. A refusal says why there is no ground;
      // this says what is on it, and one element cannot be both.
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
function renderGroundKey(sv, lines) {
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

  /* ── somebody else's published lines, one row each ───────────────────── */
  //
  // One row per standard even where two share a figure and are drawn as one
  // line, because they are two published documents and the key is where each
  // is named. Worded as "meets this standard's own published line" and never
  // as a recommendation or a verdict across standards: a band says where one
  // published figure falls on measured ground, and that is the whole of what
  // it says (FR-011). The absence stands here too, and never in a fold —
  // absence reasons are one of the four things the copy convention keeps out
  // of them.
  const { set } = lines;
  for (const line of set.lines) {
    const { signature, ground } = lines.bandFor(line);
    // The swatch carries the marks this band actually drew and no others. A
    // key showing a hatch and a rule beside a sentence explaining that neither
    // could be drawn is the same false claim the sentence was fixed for, one
    // column along — and on a scattered ground it is the more convincing half,
    // because a swatch looks like a specimen of something on the sheet.
    entry(
      () => [
        ...(ground.hatched
          ? [svg('rect', { class: `passing passing-${signature}`, x: 1, y: 1, width: 12, height: 8 })]
          : []),
        ...(ground.ruled
          ? [svg('line', { class: `threshold threshold-${signature}`, x1: 0, y1: 5, x2: 14, y2: 5 })]
          : []),
      ],
      thresholdSentence(line, ground),
    );
  }
  // No swatch, because there is no mark: the entry is a sentence saying why
  // this reading carries no line. It stands beside the improving region's
  // entry and must not be read as it — improving on the design the desk is on
  // and passing somebody's published figure are different judgements, and the
  // two entries share neither a swatch (a 45° hatch against none) nor a
  // wording ("than the one the desk is on" against "publishes a limit").
  if (set.absence) entry(() => [], set.absence);
  entry(
    () => [
      svg('line', { class: 'stance-rule', x1: 7, y1: 0, x2: 7, y2: 10 }),
      svg('rect', { class: 'stance', x: 4.5, y: 2.5, width: 5, height: 5 }),
    ],
    'Where the desk is standing now. It moves when the desk moves, and is hollow between measured designs.',
  );
  const region = improvingRegion(sv, sv.standingAt(params));
  // Which way "improves" is said, per reading, off the same declarations the
  // region is built from — never "better", which is lower for a demand and
  // higher for the zone's own low. Never null here: a region is only ever
  // non-empty where every reading declares a direction.
  const clause = improvingClause(sv.readings);
  if (region.spots.length) {
    const count = region.spots.length;
    entry(
      () => [svg('rect', { class: 'improving', x: 1, y: 1, width: 12, height: 8 })],
      `Hatched: ${count} measured ${count === 1 ? 'design' : 'designs'} with ${clause} than the one the ` +
        'desk is on. They are measured points, not gaps.',
    );
  }
  if (sv.gaps().length) {
    entry(
      () => [
        svg('line', { class: 'gap', x1: 4, y1: 2, x2: 10, y2: 8 }),
        svg('line', { class: 'gap', x1: 4, y1: 8, x2: 10, y2: 2 }),
      ],
      // "A run that could not be completed" until refused positions existed,
      // which was true of every gap while the only way to have one was for the
      // engine to fail. A refused position never reached the engine at all, so
      // under that wording the commonest gap on a ground cut across a blocking
      // control was described as a failure that never happened — 96 of them on
      // the ground this was found on. The two are not told apart here on
      // purpose: the glyph is one glyph, the mark's own title carries the
      // sentence that distinguishes them, and "each carrying its reason" is
      // what sends the reader to it. This wording is the per-mark title's own
      // ("No reading here — …"), so the legend and the mark agree.
      `A position with no reading. ${sv.gaps().length} on this ground, each carrying its reason.`,
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

/** One spot height, as a sentence — the tooltip, and the plan's own readout. */
function spotSentence(sv, spot) {
  const said = sv.readings
    .map((reading) => {
      const value = reading.valueOf(spot.readings);
      return `${reading.label} ${value === null ? '—' : reading.format(value, spot.readings)}`;
    })
    .join(', ');
  return `${labelFor(sv.x.key)} ${formatValue(sv.x.key, spot.x)}, ${labelFor(sv.y.key)} ${formatValue(sv.y.key, spot.y)} — ${said}. Measured.`;
}

/**
 * The whole drawing as a sentence — the only route to it for a reader who
 * cannot see it, which is why the published lines are stated here in the same
 * words the key uses rather than left to the marks.
 */
function surveyAriaLabel(sv, lines) {
  const coverage = coverageOf(sv);
  const { set } = lines;
  // The same sentence the key uses, word for word, and through the same call:
  // this is the only route to the drawing for a reader who cannot see it, and
  // two wordings of one mark is two things to keep in step. Built by hand here
  // it dropped `wholly`, so the one reader who cannot look and check was told
  // "hatched is measured ground meeting this standard's published threshold"
  // over a ground with no hatch anywhere on it — which is the exact defect
  // FR-007's sentence exists to prevent, on the exact surface that needs it.
  const said = set.absence ? ` ${set.absence}` : ` ${lines.sentences().join(' ')}`;
  return (
    `${sv.readings.map((reading) => reading.label).join(' and ')} over ${labelFor(sv.x.key)} and ` +
    `${labelFor(sv.y.key)}, on a ${sv.density} ground with ${coverage.measured} of ${coverage.wanted} ` +
    `positions measured${coverage.fromRuns}. Contours are drawn between measured points and carry no ` +
    `figure.${said}`
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
  // A ground standing refused says why rather than moving the desk onto an
  // axis that means nothing as the desk is set.
  const withdrawn = surveyWithdrawn(sv);
  if (withdrawn) {
    surveySay(withdrawn);
    return;
  }
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
  if (stop.shape === shapeKey(params)) return;
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
  if (last && last.shape === here) return;
  // A design revisited moves to the end of the record rather than being added
  // to it again, keeping the readings it already carries.
  //
  // A traverse is a path and a path may double back, so a duplicate is not
  // *wrong* — but the record exists to be restored from, and a second row for
  // one design offers nothing the first does not. Two of them also both
  // answered to "you are here", which is one claim too many, and a reader
  // dragging a slider back and forth would fill the list with a design they
  // never left. The path is redrawn over itself on the plan either way.
  const at = traverse.findIndex((stop) => stop.shape === here);
  const known = at === -1 ? null : traverse.splice(at, 1)[0];
  traverse.push(
    new TraverseStop({
      params: known?.params ?? params,
      patch: known?.patch ?? patching(),
      shape: here,
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
    traverse.push(new TraverseStop({ params: snapshot, patch, shape, readings, at: 0 }));
    renderTraverse();
    return;
  }
  for (let at = traverse.length - 1; at >= 0; at -= 1) {
    const stop = traverse[at];
    if (stop.shape !== shape) continue;
    // Already carrying what this run says. Re-solving the same desk — a
    // release after a drag that ended where it began — must not mint a new
    // object and redraw the traverse for nothing.
    if (stop.readings) return;
    traverse[at] = new TraverseStop({
      params: stop.params,
      patch: stop.patch,
      shape: stop.shape,
      readings,
      at: stop.at,
    });
    renderTraverse();
    return;
  }
}

/**
 * The design under the reader, lettered under the plan.
 *
 * This is what stands in view now that the schedule of spot heights is folded
 * shut, and it is what makes folding it legitimate. The schedule tabulates
 * every position of the ground — 144 rows on a fine one, and because
 * `.schedule` folds each row into a block at 620px, some five hundred lines of
 * table on a phone under two drawings.
 *
 * Its three jobs are all questions about **one** design at a time, which is
 * how a survey is actually read: the reader points at a tick and asks what it
 * says. The table answered them by printing all 144 answers at once. This
 * answers them where they are asked, and the table stays behind the fold as
 * the complete record for comparing rows or scanning a column.
 *
 *   - The plan letters only every second position on each axis once a ground
 *     passes seven (`figureAt`), so 108 of a fine ground's 144 figures are
 *     lettered nowhere on it.
 *   - Both drawings are `role="img"`, which makes their whole subtree
 *     presentational, so every `<text>` figure on the plan is invisible to
 *     assistive technology and `surveyAriaLabel` carries no reading at all.
 *     A shut table is no route to a figure and neither was an open one. This
 *     line is `role="status"` — a polite live region, which is what the
 *     cursor's sentence never had, since `surveySay` writes into the refusal
 *     paragraph and a refusal is not announced. Now it is spoken where it is
 *     lettered.
 *   - The relief can refuse to draw (FR-024), and the plan plus this line are
 *     then the survey without anything needing to be opened.
 *
 * It is not in a fold and never can be: it is the reading, and the reading is
 * what may not go behind a disclosure. The record may.
 */
/**
 * The schedule of spot heights: every measured design, with its own figures.
 *
 * Folded shut by default, which is the one place on this sheet where a table
 * of readings sits behind a disclosure — so the rule it looks like it breaks
 * is worth stating. "Readings never go in a fold" is a rule about the reading
 * a page is *for*, and what stands in view here is `renderSpotReadout`: the
 * design under the reader, in full, always, plus the coverage line saying how
 * much was measured and the plan's own figures. The fold holds the complete
 * record — all 144 rows of it — which is a different thing from the reading,
 * and it is the same shape as the TM59 qualifications block, where the count
 * stays in view and the entries are one press down.
 *
 * The summary carries the count, so what is behind the fold is known without
 * opening it. That is the condition on folding anything here: a reader who
 * never opens it must still come away with what it holds.
 *
 * Two things about where this lives. The `<details>` is **static markup** in
 * index.html and only its table is rebuilt, because `renderSurvey` runs on
 * every landed sample — a fold rebuilt 144 times over one ground would slam
 * itself shut under a reader who had opened it, which is the same hazard that
 * made `renderSurveyChoose` stop rebuilding the extent fields. And the rows
 * are built even while shut rather than on first open: `.schedule` folds each
 * row into a block at 620px and the cells carry their own heads, so the work
 * is the same either way, and a lazy build would put a second state into a
 * function that has none.
 */
function renderSpots(sv) {
  const table = $('survey-spots');
  table.textContent = '';
  const spots = sv.spots();
  const heads = [labelFor(sv.x.key), labelFor(sv.y.key), ...sv.readings.map((reading) => reading.label)];
  const thead = tableHead(heads);
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
        return value === null ? '—' : reading.format(value, spot.readings);
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
 * Give the readout back after a pointer leaves a tick — but only a *mouse*.
 *
 * A touch pointer does not hover: it comes into existence on contact and is
 * destroyed on release, so `pointerleave` fires at the end of every tap. Left
 * symmetrical with `pointerenter`, a tap on a tick lettered that design and
 * took it away again in the same gesture, which on a phone is the whole of
 * this line's usefulness — the reading would flash and revert before it could
 * be read. So a finger leaves the reading standing until another tick is
 * touched, which is what "point at a tick to read it" means on a device with
 * no pointer to hover with, and a mouse restores the desk's own design as it
 * always did.
 *
 * `pointerType` is the honest test, the same shape as the stylesheet's
 * `pointer: coarse`: it names no device, it says what kind of pointer this is.
 */
function releaseReadout(sv, event) {
  if (event.pointerType === 'mouse') renderSpotReadout(sv);
}

function renderSpotReadout(sv, at = groundCursor) {
  const host = $('survey-spot');
  const where = at ?? sv.positionOf(params);
  const under = where && sv.spotAt(where.ix, where.iy);
  if (under) {
    host.textContent = spotSentence(sv, under);
    host.classList.remove('loose');
    return;
  }
  // A position with no run under it says so, with its own coordinates, rather
  // than going blank: "not measured" is a reading about the ground and the
  // reader is entitled to it. A gap knows why it could not be run, which is
  // the one thing a cross on the plan cannot letter.
  if (where) {
    const gap = sv.gaps().find((one) => one.ix === where.ix && one.iy === where.iy);
    host.textContent =
      `${labelFor(sv.x.key)} ${formatValue(sv.x.key, sv.x.positions[where.ix])}, ` +
      `${labelFor(sv.y.key)} ${formatValue(sv.y.key, sv.y.positions[where.iy])} — ` +
      (gap ? `no reading here. ${gap.reason}` : 'not measured.');
    host.classList.add('loose');
    return;
  }
  // The desk is off the surveyed ground entirely, which is a fact about the
  // desk rather than an empty line.
  host.textContent =
    'Point at a tick, or walk the ground with the arrow keys, to read the design measured there.';
  host.classList.add('loose');
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
  // Along a priced axis several positions price one run, so the positions are
  // not a count of runs, and the runs are said beside them wherever the two
  // differ (FR-027).
  if (coverage.fromRuns) host.append(document.createTextNode(coverage.fromRuns));
  // A gap that kept its run could not be priced, which is not a run that
  // failed, and a tariff that returns stands it back up.
  if (coverage.gaps - coverage.unpriced) {
    host.append(document.createTextNode(` · ${coverage.gaps - coverage.unpriced} could not be run`));
  }
  if (coverage.unpriced) {
    host.append(document.createTextNode(` · ${coverage.unpriced} could not be priced`));
  }
  if (coverage.unsurveyed) {
    host.append(el('span', 'loose', ` · ${coverage.unsurveyed} not yet measured`));
  }
}

/**
 * A quantity along one axis, in that control's own units.
 *
 * At the control's declared digits and in its unit, so the figure is lettered
 * to the precision the margin number beside it uses —
 * and so a unitless control (a ratio, a fraction) reads as a bare number
 * rather than as a number with a trailing space where a unit was expected.
 */
function amountOn(axis, value) {
  // The declaration's `digits` rather than `format` itself, because an amount
  // of exactly zero is not the control's `zero` label — and `letter` gives that
  // while converting the figure and its unit together. Composed from
  // `control.unit` and a bare `toFixed` this was wrong twice over in IP: an
  // unconverted number standing under an SI unit, which is the one shape of
  // wrong figure that still looks like a reading. A unitless control still
  // letters as a bare number, because `letter` appends nothing for an empty
  // suffix.
  return letter(axis.control.quantityKind, value, {
    digits: axis.control.digits,
    ipDigits: axis.control.ipDigits,
  });
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
  // A tolerance is a *difference* of the reading, so it goes through the delta
  // kind: lettered through the reading's own kind, a tolerance on a temperature
  // would carry Fahrenheit's 32 and a hundredth of a degree would read as 32.
  const kind = deltaKindOf(reading.quantityKind);
  // The floor is a property of the lettering rather than of the quantity, so it
  // is already in the system showing and is compared against the converted
  // tolerance, not the SI one. Both halves stayed SI here, which put an
  // unconverted figure under an SI unit inside an otherwise IP sentence.
  const floor = 10 ** -reading.digits;
  const shown = convert(kind, tolerance);
  const said = (shown < floor ? floor : shown).toFixed(reading.digits);
  const unit = suffixIn(kind, reading.unit);
  return unit ? `${said} ${unit}` : said;
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
      ? `Nothing on this ground could be measured: all ${coverage.gaps} positions failed. There is no relief to draw, and none is drawn.`
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
    // The key's own clause, so the finding and the key under the hatching name
    // the region in one wording.
    parts.push(
      `${region.spots.length} measured ${region.spots.length === 1 ? 'design reads' : 'designs read'} ` +
        `${improvingClause(sv.readings)} than the stance. That is a region of the measured ground, not an optimum.`,
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
          // `change`, not `format`: this letters a difference of the reading,
          // and through `format` the two temperatures here read +39 °F and
          // +33 °F for changes of +4 °C and +0.5 °C.
          return `${change >= 0 ? '+' : ''}${entry.change(change, worst.readings)} of ${entry.label.toLowerCase()}`;
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
  const { needed, carried } = surveyContents(survey);
  const { probes, inert } = pullProbes(stance, patch, {
    quantity: reading.quantity,
    engaged: engagedChannels(stance, patch),
    annual: Boolean(epwText),
    epw: epwText ?? null,
    needed,
    carried,
  });
  pullStance = { stance, patch, reading, inert, annual: Boolean(epwText) };
  pullJobs = new Map();
  pullLanded = new Map();
  pullFinished.clear();
  studyScheduler.enqueueAll(
    probes.map((probe) => {
      // The rest of the desk excluding the probed key, exactly as a study's
      // is: a probe is a study of two points, and moving the control it
      // probes only walks along the answer it gave.
      const job = makeStudyJob({ ...probe, restShape: restShapeKey(probe.key, stance, patch) });
      pullJobs.set(job.id, probe);
      return job;
    }),
  );
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
    renderPullSoon();
    return true;
  }
  if (event === 'cancelled') {
    pullDone(job.id);
    renderPullSoon();
    return true;
  }
  return false;
}

/**
 * The ranking redrawn once a frame, for the reason `renderSurveySoon` is: a
 * probe lands twice, cache hits land synchronously inside one drain, and each
 * landing used to re-rank and rebuild the whole table for a reader who can
 * only ever see the last.
 */
let pullFrame = 0;
function renderPullSoon() {
  if (pullFrame) return;
  pullFrame = requestAnimationFrame(() => {
    pullFrame = 0;
    renderPull();
  });
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
  const pullReading = measured.length ? new PullReading({ kind, reading: pullStance.reading, entries }) : null;

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
      el('td', 'num', entry.atStop ? 'At its stop' : `${entry.roomSaid}${entry.perUnit ? ` ${entry.perUnit}` : ''}`),
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
  // **Both halves convert.** The effect is a change in the reading per unit of
  // the control's own travel, so it is a ratio of two quantities and neither
  // was being converted: in IP this printed an SI number under an SI unit in a
  // table whose every other column had moved. That is the worst shape this
  // feature can produce — not a mislabelled figure but a wrong one, at
  // whatever `kR / kC` happens to be, and still plausible.
  //
  // The numerator is a *difference* of the reading, hence the delta kind; the
  // denominator is a span of the control's face, which is what `spanKind`
  // answers and what the "Per unit" column beside this one letters.
  const kind = deltaKindOf(reading.quantityKind);
  const shown = convert(kind, entry.effect) / convert(entry.control.spanKind, 1);
  const magnitude = Math.abs(shown);
  const digits = magnitude >= 100 ? 0 : magnitude >= 1 ? 2 : 3;
  const unit = suffixIn(kind, reading.unit);
  return unit ? `${shown.toFixed(digits)} ${unit}` : shown.toFixed(digits);
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
  falling = { visited: new Set([pointKey(at.ix, at.iy)]), steps: 0 };
  $('survey-fall').textContent = 'Stop the descent';
  fallOnce();
}

function fallOnce() {
  if (!falling || !survey) return;
  const withdrawn = surveyWithdrawn(survey);
  if (withdrawn) {
    stopFalling(withdrawn);
    return;
  }
  const at = survey.positionOf(params);
  const next = fallStep(survey, at, { visited: falling.visited });
  if (!next || next.stopped) {
    stopFalling(next?.stopped ?? 'The descent stopped.');
    return;
  }
  falling.visited.add(pointKey(next.ix, next.iy));
  falling.steps += 1;
  const reading = survey.readings[0];
  const said =
    `${formatValue(survey.x.key, next.x)} · ${formatValue(survey.y.key, next.y)} → ` +
    reading.format(reading.valueOf(next.readings), next.readings);
  standOn(survey, next);
  surveySay(`Step ${falling.steps}: ${said}.`);
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
 * One stop of an axis, bare of its unit, for the plan and the relief alike.
 *
 * The stops carry a bare number and the axis label carries the unit, once,
 * which is how a survey drawing has always lettered a scale. Lettered on both,
 * `3.00 m²K/W` at the head of a 44px gutter simply ran off the left of the
 * frame and printed as `00 m²K/W` — a number that is not the reading and not
 * anything else either.
 */
function stopOf(axis, value) {
  const said = formatValue(axis.key, value);
  // The unit `formatValue` actually appended, not the declaration's SI string.
  // Read off `control.unit` the match failed the instant the sheet was switched:
  // `formatValue` letters `50.0 ft` and the strip looked for `m`, so the stop
  // kept its unit and the relief drew `50.0 ft` under an axis lettered `Width
  // ft` — the unit printed twice, once on a figure that had been built not to
  // carry it.
  const unit = axis.control.unitNow;
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
function drawRelief(sv, lines = null) {
  const host = $('survey-relief');
  const caption = $('survey-relief-cap');
  if (!relief && !reliefLoss) {
    relief = createRelief(host, {
      onLost: (reason) => {
        reliefLoss = reason;
        relief = null;
        // The ground current when the context goes, not the one this handler
        // was made under: it is made once, and holding that first survey here
        // kept it alive for the session and would redraw the loss over it.
        if (survey) drawRelief(survey);
      },
    });
    if (!relief && !reliefLoss) {
      reliefLoss = 'This browser has no WebGL2 drawing context, so the relief cannot be drawn.';
    }
  }
  const views = $('survey-views');
  if (!relief) {
    host.textContent = '';
    host.append(
      el(
        'p',
        'survey-note bad',
        `${reliefLoss} The plan carries every measurement: point at a tick to read it, ` +
          'or open the schedule below.',
      ),
    );
    views.textContent = '';
    caption.textContent = '';
    return;
  }

  const reading = sv.readings[0];
  const lattice = latticeOf(sv, reading);
  // The plan's own reading of the declarations, handed down, so the two
  // drawings show the same lines in the same bands (FR-006) off one tracing.
  // Read here only on the path that has no caller to hand it one: the redraw
  // after a lost context, which comes back through the loss note above.
  const drawn = lines ?? groundLinesFor(sv, lattice);
  const extent = extentOf(lattice);
  const levels = levelsFor(lattice);
  const at = sv.standingAt(params);
  const under = at && at.on ? sv.spotAt(at.ix, at.iy) : null;
  // The pin stands where the desk stands. On a measured design it stands on
  // that run's reading and its head is filled; between two it stands on the
  // surface the relief draws there and its head is hollow — the plan's own
  // filled-against-hollow mark, making the same claim: the desk is here, and
  // this survey has not run it. Standing on the drawn surface lends the pin
  // no reading, since nothing is lettered off it, as nothing is lettered off
  // the surface. The pin used to be dropped between designs instead, so
  // typing a figure between two positions took away the one mark on this
  // drawing saying where the desk was. Over a cell the survey has not
  // measured there is no surface to stand on, and no pin.
  let stance = null;
  if (under) {
    stance = { ix: at.ix, iy: at.iy, value: reading.valueOf(under.readings), measured: true };
  } else if (at && !at.on) {
    const value = surfaceAt(lattice, at.ix, at.iy);
    if (value !== null) stance = { ix: at.ix, iy: at.iy, value, measured: false };
  }
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
    strata: strataOf(block, levels),
    arrises: arrisesOf(block),
    // The published lines, from the same reading of the declarations the plan
    // makes and carrying the plan's own hatch angle, so the relief shows the
    // same lines at the same positions with the same bands (FR-006). Lattice
    // coordinates and the reading's own units; the relief normalises them with
    // everything else.
    thresholds: drawn.bands.map((band) => ({
      limit: band.level,
      passesBelow: band.lines[0].passesBelow,
      segments: band.ground.segments,
      angle: band.angle,
    })),
    stance,
    axes: {
      x: { label: labelFor(sv.x.key), from: stopOf(sv.x, sv.x.positions[0]), to: stopOf(sv.x, sv.x.positions.at(-1)) },
      y: { label: labelFor(sv.y.key), from: stopOf(sv.y, sv.y.positions[0]), to: stopOf(sv.y, sv.y.positions.at(-1)) },
      // The reading the block stands up, which is the drawing's third axis and
      // had no word on it anywhere. Its figures are the levels the cut is
      // ruled at, lettered exactly as the plan letters its contours, and the
      // unit rides the name once — the rule `stopOf` keeps for the other two.
      z: {
        label: reading.label,
        unit: reading.unitNow,
        ticks: levels.map((level) => ({ value: level, text: reading.figure(level) })),
      },
    },
  });

  // Named viewpoints as real buttons: a coarse-pointer target and a tab stop
  // apiece, so every camera move the pointer can make the keyboard can make
  // too (FR-018e). There is no drag-to-orbit here that these do not cover.
  //
  // A camera move repaints what the relief already holds and re-letters the
  // buttons and the label. It used to call `drawRelief` as well, after
  // `setView` had already painted, which rebuilt the lattice, the mesh and the
  // block and uploaded them all again to show the same ground from elsewhere.
  const named = [];
  const markView = () => {
    for (const [button, viewpoint] of named) {
      button.setAttribute('aria-pressed', String(relief.view.azimuth === viewpoint.azimuth));
    }
    host.setAttribute(
      'aria-label',
      `${surveyAriaLabel(sv, drawn)} Drawn from ${relief.view.azimuth}° at ${relief.view.elevation}° above.`,
    );
  };
  views.textContent = '';
  for (const viewpoint of relief.viewpoints) {
    const button = el('button', 'relief-view', viewpoint.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      relief.setView(viewpoint);
      markView();
    });
    named.push([button, viewpoint]);
    views.append(button);
  }
  for (const [label, step] of [['Turn left', { azimuth: -1 }], ['Turn right', { azimuth: 1 }]]) {
    const button = el('button', 'relief-view', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      relief.step(step);
      markView();
    });
    views.append(button);
  }
  markView();

  const coverage = coverageOf(sv);
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
    `${extent ? `${sv.readings[0].figure(extent.lo)} to ${sv.readings[0].figure(extent.hi)} ${sv.readings[0].unitNow}` : 'nothing measured yet'} — ` +
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
    const standing = stop.shape === here;
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
      el('td', 'num', stop.readings ? letter(KINDS.temperature, stop.readings.high, { digits: 1 }) : '—'),
      el('td', 'num', stop.readings ? letter(KINDS.temperature, stop.readings.low, { digits: 1 }) : '—'),
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

  // A ground whose priced axis the desk has withdrawn stands refused in place,
  // with every measured point kept: the plant switched back brings it back
  // with no run. Asked on every draw rather than remembered, so there is no
  // flag to forget to clear.
  const refusal = $('survey-refusal');
  const withdrawn = survey ? surveyWithdrawn(survey) : null;
  const standing = surveyRefused ?? withdrawn;
  refusal.hidden = !standing;
  if (standing) refusal.textContent = standing;

  const drawing = $('survey-drawing');
  $('survey-fall').hidden = !survey;
  $('survey-clear').hidden = !survey;

  if (!survey) {
    drawing.hidden = true;
    renderPull();
    $('survey-coverage').textContent = '';
    $('survey-finding').textContent = '';
    $('survey-spot').textContent = '';
    $('survey-spots').textContent = '';
    $('survey-spots-scope').textContent = '';
    $('survey-axes').textContent = '';
    $('survey-lede').textContent =
      'Choose two controls and a reading, and the sheet surveys that reading over that ground — a real ' +
      'EnergyPlus run behind every position. Contours and relief are drawn between the runs and carry no figure ' +
      'of their own. Standing on a measured point moves the whole of E-01 to that design.';
    for (const [id, text] of [['s-ground', '—'], ['s-reading', '—'], ['s-runs', '—']]) {
      $(id).textContent = text;
    }
    return;
  }

  // Standing refused, the ground draws nothing: every figure on it would be
  // priced at a face the desk has withdrawn, which is the same figure at every
  // position of that axis. The coverage stays, because the measured points
  // are kept, and the ground is drawn again when the face returns.
  if (withdrawn) {
    drawing.hidden = true;
    for (const id of ['survey-finding', 'survey-spot', 'survey-spots', 'survey-spots-scope']) $(id).textContent = '';
    renderPull();
    renderCoverage(survey);
    return;
  }
  drawing.hidden = false;
  const coverage = coverageOf(survey);
  $('survey-axes').textContent =
    `${labelFor(survey.x.key)} × ${labelFor(survey.y.key)}`;
  $('survey-lede').textContent =
    `${survey.readings.map((reading) => reading.label).join(' and ')} over ` +
    `${phraseFor(survey.x.key)} and ${phraseFor(survey.y.key)}, cut through the desk as it stands. ` +
    `Every figure below is a completed ${survey.annual ? 'annual' : 'design-day'} run` +
    // Still true along a priced axis, and only if it says the rest (FR-028).
    ([survey.x, survey.y].some((axis) => PRICED_KEYS.has(axis.key)) ? ', priced at its position.' : '.') +
    // Which dwelling this ground is read for, where the reading is read at one
    // of TM59's categories. In view rather than one press down, because it is
    // not method: it is the question of whether this ground answers the reader's
    // project at all, and the two categories publish the same limit, so no
    // figure on the drawing can tell them which they are looking at. Said once
    // per category, so a ground carrying both readings does not say it twice.
    categoriesSaid(survey.readings);

  // The published lines and the ground each passes, read once for the four
  // surfaces that letter them — the plan, its key, the relief and the aria
  // label. Four separate readings could be handed four chase states and four
  // tracings of the same bands, and this path runs again on every landed
  // sample.
  const groundLattice = latticeOf(survey, survey.readings[0]);
  const lines = groundLinesFor(survey, groundLattice);

  drawGround(survey, groundLattice, lines);
  renderGroundKey(survey, lines);
  renderPull();
  renderCoverage(survey);
  renderSurveyFinding(survey);
  renderSpotReadout(survey);
  renderSpots(survey);
  drawRelief(survey, lines);

  // The absence, where there is one, in the caption as well as in the key and
  // the aria label — one wording off the set already read, not three, because
  // three spellings of one absence is three things to keep in step. Where
  // lines are drawn the caption says nothing extra: the key names each of
  // them, with its criterion and its pass side, which the caption cannot.
  const noLine = lines.set.absence;
  $('survey-plan-cap').textContent =
    `${survey.readings[0].label} in ${survey.readings[0].unitNow} over ${labelFor(survey.x.key)} and ` +
    `${labelFor(survey.y.key)}. Ticks are measured designs and carry the only figures on this drawing; ` +
    'the contours between them are interpolation and no figure anywhere is read off them. Ground with no ' +
    `contour across it has not been measured.${noLine ? ` ${noLine}` : ''}`;
  $('s-ground').textContent = coverage.density;
  $('s-ground-sub').textContent = `${coverage.wanted} positions asked for`;
  $('s-reading').textContent = survey.readings.map((reading) => reading.label).join(' + ');
  $('s-reading-sub').textContent = survey.readings.map((reading) => reading.unitNow).join(' · ');
  // Runs, not positions: along a priced axis the two part company.
  $('s-runs').textContent = String(coverage.runs);
  $('s-runs-sub').textContent = coverage.runs !== coverage.measured
    ? `Priced at ${coverage.measured} positions`
    : coverage.gaps ? `${coverage.gaps} could not be run` : 'Completed simulations';
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
  // The traverse is a record of the desk rather than of the survey, so its
  // "you are here" row moves with every gesture whether or not a ground is
  // cut. It is redrawn here and where the record itself changes, and not from
  // `renderSurvey`, which runs on every landed sample and changes neither.
  renderTraverse();
  // The chooser's offers are the desk's own — a channel patched in or out
  // changes which axes and readings are available before there is any ground
  // to re-cut, and the reader is often choosing exactly then. Placed above the
  // `!survey` return below, since otherwise a patch made with no ground cut
  // yet left the chooser showing offers from before the patch until something
  // else happened to redraw it. `renderSurveyChoose` is cheap to call with
  // nothing to do: it only rebuilds when the desk's own shape key has moved.
  renderSurveyChoose();
  if (!survey || !studyScheduler || !autoOn() || linkAttachPending) return;
  // A ground whose priced axis is withdrawn stands refused with its points and
  // is neither re-cut nor refined. Re-cut, `openSurvey` would take the withdrawn
  // sentence for a ground that cannot be cut and close the survey, so a shaping
  // drag under a heat pump threw away every measured point, and switching back
  // to a boiler brought nothing back. The release of the switch back is a
  // gesture too, so it lands here with the face live and re-cuts then.
  if (surveyWithdrawn(survey)) {
    renderSurvey();
    return;
  }
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
whenIdle(() => studyPool.prewarm(), { fallback: 1500 });

/**
 * A link minted on a desk that was running a file the reader holds.
 *
 * The file cannot ride in the link and must not, so what arrives is a
 * fingerprint of it and the phrase the file uses about itself. Two outcomes:
 *
 *   - **this browser is keeping that exact file**, which is what an ordinary
 *     reload is — the address bar is rewritten on every gesture, so a desk with
 *     a file attached already carries `wf`, and coming back to it is a link
 *     being honoured. It is re-attached with no trip to the filesystem and the
 *     desk solves;
 *   - **it is not**, which is a colleague opening the link. The desk loads
 *     whole — every parameter, patch and pin the link carries — and then stops.
 *     Nothing is solved and no reading that needs a year is lettered, because
 *     there is no year; what is lettered is which file this desk needs, in that
 *     file's own words.
 *
 * The shipped design days are taken out in that second case, and that is the
 * point of it. Leaving them would put a run on the sheet — Denver's two days,
 * solved and lettered — under a title block naming somewhere else, which is
 * exactly the lie in ink the picker's DDY refusal exists to prevent, arriving
 * by another road.
 */
async function openFileLink(link) {
  const kept = rememberedFile();
  if (kept?.fingerprint === link.file.fingerprint) {
    linkAttachPending = true;
    syncSweepGate();
    statusEl.className = 'status';
    statusEl.textContent = 'Re-attaching the weather file this link names, from this browser…';
    try {
      if (await attachRemembered()) return;
    } finally {
      linkAttachPending = false;
      syncSweepGate();
    }
  }

  // Nothing to solve, and the reason is a file rather than a setting.
  stopAuto();
  clearResults();
  clearDesignDays(model);
  DATUMS = designDayDatums(model);
  // And the title block stops naming Denver. The shipped `Site:Location` is
  // still in the document — nothing is going to be solved against it, and
  // removing it would leave the model incomplete for no gain — but the sheet
  // must not letter a city over a desk that is waiting for a file from
  // somewhere else. Which place this is cannot be known until the file arrives,
  // and an em dash is how this sheet says that: zero is a measurement, missing
  // is not.
  $('t-location').textContent = '—';
  $('t-site').textContent = '—';
  renderTrace();
  wantedFile = link.file;
  statusEl.className = 'status bad';
  // Declared with the rest of the file path's sentences and asserted there
  // against the 40-word CEILING *carrying a declaration*, which is the only
  // honest way to count a sentence that quotes one: this was over at 43 words
  // and shipped, because it had been counted without the dozen the file's own
  // description adds.
  statusEl.textContent = FILE_SAYS.waiting(link.file.declares ?? 'a file it does not describe');
  renderKeptFile();
}

// What this browser is already holding, before any link is honoured: a reader
// arriving on a bare address with a file kept from an earlier session has to be
// told it is there, and offered it, rather than having to attach it again from
// a filesystem they have already been to once.
renderKeptFile();

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
} else if (linked?.file) {
  void openFileLink(linked);
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

/* ══ what a report reads off this sheet ══════════════════════════════════ */

/** A filesystem-safe word or two, for the names of the files a report saves. */
const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sheet';

/**
 * The facts only this module holds, handed to the report sheet each time it
 * opens (`src/report.js`, the registry): the link, what the sheet is showing,
 * and the last attempt's errors. Everything is read from the state the sheet
 * already letters from, never from a second copy of it.
 *
 * Registered here, at the foot of the module, because it reads state declared
 * all the way down: registered any earlier, a report opened on a boot that
 * stopped half way would reach a `let` still in its temporal dead zone and
 * throw. Until this line runs, the report says the sheet had not finished
 * starting, which is then the truth.
 */
function describeScreen() {
  const failed = statusEl.classList.contains('bad');
  const status = statusEl.textContent.trim() || '—';
  const stale = Boolean(solvedShape) && solvedShape !== shapeKey(params);
  const readings = lastBundle ? `from ${lastBundle.annual ? 'an annual' : 'a design-day'} run` : 'none yet';
  const standing = pumping ? 'run in flight' : !lastBundle ? null : stale ? 'stale, from an earlier desk' : 'current';

  const inView = [];
  if (refusalNote) inView.push(`Link refused: ${refusalNote}`);
  if (lastStationRefusal && statusEl.textContent === lastStationRefusal) inView.push(`Station refused: ${lastStationRefusal}`);
  // In view means drawn: a strip inside a closed console has no client rects,
  // and a blocking note nobody could see is not what the reader was looking at.
  for (const strip of document.querySelectorAll('.strip.blocked')) {
    if (!strip.getClientRects().length) continue;
    const name = strip.querySelector('.strip-name')?.textContent.trim() || '—';
    inView.push(`${name} blocked: ${strip.querySelector('.strip-blocked')?.textContent.trim() || '—'}`);
  }

  const progress = studyScheduler?.progress();
  const studies = !progress ? '—' : progress.jobs ? `${progress.done} of ${progress.total} samples solved` : 'none running';
  const coverage = survey ? coverageOf(survey) : null;
  const surveyed = coverage ? `${coverage.measured} of ${coverage.wanted} measured, ${coverage.unsurveyed} unsurveyed` : 'none running';

  const hash = schemeHash();
  const warnings = (n) => (n == null ? '— warnings' : `${n} warning${n === 1 ? '' : 's'}`);
  return {
    stem: `${slug($('t-location').textContent)}-${lastBundle?.annual ? 'annual' : 'design-days'}`,
    // After a refusal the desk is back at its defaults, so its link would
    // report a building the reader never asked for; the link they did ask for
    // is carried instead, as typed, with the reason the sheet gave.
    // The unit system rides with the desk rather than taking an item of its
    // own: `ITEM_IDS` is a closed set asserted in the report's constructor, so
    // a new id would mean a new heading, a new removable rule and a new row in
    // the sheet, all for one line. The desk item is already "what the reader
    // was looking at", and which units they were reading is exactly that.
    desk:
      refusalNote && arrivedHash
        ? [`- Refused link: \`${arrivedHash}\``, `- Reason given: ${refusalNote}`, `- Units: ${system().toUpperCase()}`]
        : [`- Link: ${schemeUrl()}`, `- Units: ${system().toUpperCase()}`],
    deskSummary:
      refusalNote && arrivedHash
        ? 'A refused link'
        : hash
          ? `${hash.split('&').length - 1} settings off the defaults`
          : 'The default desk',
    screen: [
      `- Status: ${status} (${failed ? 'failure' : 'normal'})`,
      `- Readings: ${readings}${standing ? `; ${standing}` : ''}`,
      inView.length ? '- In view:' : '- In view: nothing refused or blocked',
      ...inView.map((line) => `  - ${line}`),
      `- Studies: ${studies}`,
      `- Survey: ${surveyed}`,
    ],
    screenSummary: failed ? status : readings,
    log: lastBundle
      ? [
          `- Last run: ${lastBundle.severe ?? '—'} severe, ${warnings(lastBundle.warnings)}, exit ${lastBundle.exitCode ?? '—'}`,
          `- Failure: ${lastBundle.failure ?? '—'}`,
        ]
      : ['No run has been made.'],
    fence: lastBundle && lastEngineErrors.length ? lastEngineErrors : null,
    logSummary: lastBundle ? `${lastBundle.severe ?? '—'} severe, ${warnings(lastBundle.warnings)}` : 'No run yet',
  };
}

provide('screen', describeScreen);
provide('refusedLink', () => (refusalNote && arrivedHash ? { raw: arrivedHash, reason: refusalNote } : null));

// The run bundle the Download button already makes, offered from the report
// signed or unsigned. The signature is the reader's own (`sign.js` keeps it off
// the link for exactly this reason), so it reaches a public report only when
// they choose the signed files.
provide('runFiles', () => ({
  available: Boolean(lastBundle),
  signed: Boolean(signature),
  // So the card can say, before the download rather than after it, that the ZIP
  // carries a weather file of the reader's own.
  ownWeather: Boolean(lastBundle?.ownWeather),
  build: (withSignature) => runBundle({ ...lastBundle, author: withSignature ? signature : null }),
}));
