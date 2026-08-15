import { createEnergyPlus } from '@idfkit/engine';
import { httpSource, SchemaBundle, writeIdf } from '@idfkit/core';
import {
  applyModel,
  buildModel,
  channelState,
  designConditionsFrom,
  designDayDatums,
  geometryFacts,
  modelFacts,
  setAnnual,
  setDesignConditions,
  shadeGeometry,
  surfaceGeometry,
  WALLS,
  windowGeometry,
} from './model.js';
import {
  CHANNELS,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  SHEET_KEYS,
  controlFor,
} from './controls.js';
import { mountConsole } from './console.js';
import { COARSE_SAMPLES, SWEEP_SAMPLES, samplePoints, sampleOrder } from './study.js';
import { createEnginePool, poolLimit } from './pool.js';
import { createStudyScheduler, makeStudyJob } from './scheduler.js';
import { runBundle } from './bundle.js';
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
import { decodeState, encodeState, isSchemeFragment } from './permalink.js';
import { MONTHS, environmentRuns, hourly, readDemand, readExtremes } from './readings.js';

const ENERGYPLUS_VERSION = '26.1.0';

const $ = (id) => document.getElementById(id);
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
// to the two design conditions. Colour is degrees, never decoration.
const NEUTRAL_C = 20;
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

  for (const s of SURFACES) {
    const screen = s.verts.map(draw);
    pts.push(...screen);
    for (let i = 0; i < screen.length; i++) edges.push([screen[i], screen[(i + 1) % screen.length]]);
    const n = normal(s.verts.map(square));
    const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
    if (facing > 1e-6) {
      // Top face reads brightest, then the +x wall, then the +y wall.
      faces.push({ screen, alpha: 0.1 + 0.2 * Math.max(0, n[2]) + 0.07 * Math.max(0, n[0]) });
    }
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
  root.append(wire);

  const fill = meanC == null ? 'var(--ink-3)' : tint(meanC);
  for (const f of faces) {
    root.append(
      svg('polygon', {
        points: f.screen.map((p) => p.join(',')).join(' '),
        fill,
        'fill-opacity': meanC == null ? f.alpha * 0.35 : f.alpha,
        stroke: 'var(--ink)',
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  }

  // Glazing, drawn after the walls so it reads as an opening cut into one.
  // Filled with the paper itself rather than a tint — the wall is carrying the
  // temperature colour, and glass has to stay legible against any of it — then
  // struck through on the diagonal, the way glass is marked in elevation.
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
      }),
    );
    root.append(
      svg('line', {
        x1: screen[1][0], y1: screen[1][1], x2: screen[3][0], y2: screen[3][1],
        stroke: 'var(--ink-3)', 'stroke-width': 0.6, opacity: 0.7,
        'vector-effect': 'non-scaling-stroke',
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
  host.append(root);
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
 * An annual run is both at once — two design days ahead of 8,760 hours — and
 * each environment is bucketed on its own, because running the month walk
 * across the whole axis would print the design days as two more months and set
 * their names against the year's January. Twenty-four hours out of 8,808 is far
 * too narrow a band to letter, so on a dense axis they keep their rule and give
 * up their label.
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
  return runs.flatMap((run) => {
    const found = months(run);
    return found.length > 1 ? found : [{ ...run, label: runs.length > 1 ? '' : run.label }];
  });
}

function metricsFor(zone, out, run, hasOutdoor) {
  const slice = (a) => a.slice(run.start, run.end + 1);
  const z = stats(slice(zone));
  const o = stats(slice(out));
  const damping = hasOutdoor && o.swing > 0.05 ? z.swing / o.swing : NaN;
  const lag = hasOutdoor ? slice(zone).indexOf(z.max) - slice(out).indexOf(o.max) : NaN;
  return { z, o, damping, lag, hours: run.end - run.start + 1, hasOutdoor };
}

const f1 = (v) => v.toFixed(1);
const or = (v, fmt) => (Number.isFinite(v) ? fmt(v) : '—');

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
  for (const row of SCHEDULE_ROWS) {
    const tr = tbody.insertRow();
    if (row.group) tr.className = 'group';
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
  constructor({ id, label, field, unit, format }) {
    this.id = id;
    this.label = label;
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

const group = (v, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const BILL_COLUMNS = Object.freeze([
  new BillColumn({
    id: 'metered', label: 'At the meter', field: 'metered', unit: 'kWh',
    format: (v) => group(v, v < 100 ? 1 : 0),
  }),
  new BillColumn({
    id: 'cost', label: 'Cost', field: 'cost', unit: '',
    format: (v, bill) => bill.currency.format(v, Math.abs(v) < 100 ? 2 : 0),
  }),
  new BillColumn({
    id: 'carbon', label: 'Carbon', field: 'carbon', unit: 'kgCO₂e',
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
    floorArea: geometryFacts(model).floor,
    hours: run.hours,
    engaged: new Set([...(modelState ?? [])].filter(([, s]) => s.engaged).map(([id]) => id)),
    annual: run.annual,
  });
}

/** Re-letter the bill from the meters already read, with no new run. */
function reprice() {
  if (!lastRun) return;
  bill = billFrom(lastRun);
  renderBill();
  desk?.setReadings(lastReadings, derivedReadings(geometryFacts(model)), lastAt);
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

const cell = (row, text, className) => {
  const td = row.insertCell();
  td.textContent = text;
  if (className) td.className = className;
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
 */
function comparable(a, b) {
  if (!a || !b || a.currency !== b.currency) return false;
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
  const site = bill.card.site;
  $('bill-scope').textContent = againstLabel ? ` Δ against ${againstLabel}` : '';
  // Named in full at the top as well as beside each rate, because "is this a
  // commercial rate or a household one" is the first question anyone sensible
  // asks of a bill they did not receive themselves.
  const tariff = bill.card.electricity;
  const priced = !isRate(tariff)
    ? ''
    : tariff.source.id === 'assumed'
      ? ' Priced at the rates assumed on the Tariff strip.'
      : ` Priced at the ${tariff.source.kind.toLowerCase()} published for ${placeName(site)}, never a residential one, and factored at its grid carbon intensity.`;
  $('bill-lede').textContent = bill.annual
    ? `Metered across the ${group(bill.hours)}-hour run.${priced}`
    : `These are the ${group(bill.hours)} hours of the sizing days — two conditions chosen for being extreme. They are a real bill for a real two days, and they are deliberately not multiplied up into a year; attach a weather file for one of those.${priced}`;
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
        textContent: `Nothing on this run can be measured in ${billBasis.label.toLowerCase()} — the rate behind it was not published for this location.`,
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
  for (const column of BILL_COLUMNS) th(column.unit ? `${column.label} (${column.unit})` : column.label, against ? 2 : 1);
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
      cell(tr, Number.isFinite(v) ? column.format(v, bill) : '—', Number.isFinite(v) ? '' : 'void');
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

    // Per square metre only on a year. The figure exists to be held against a
    // published benchmark, every one of which is annual, and 0.3 kgCO₂e/m²
    // over two design days is a number whose only possible use is to be
    // mistaken for one.
    if (section.id === 'building' && bill.annual) {
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
    ? `${absences.map((a) => `${a.what}: ${a.reason}`).join(' ')} Those columns read as an em dash and are left out of every total on this schedule.`
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
 * button follows the results it describes: dark until a run lands, gone again
 * the moment the plate is cleared, because a download offered over no results
 * would zip up the last run under the current sheet and call it this one.
 */
function syncDownload() {
  downloadBtn.disabled = !lastRun?.bundle;
}

let bundling = false;

downloadBtn.addEventListener('click', async () => {
  if (!lastRun?.bundle || bundling) return;
  bundling = true;
  const was = downloadBtn.textContent;
  downloadBtn.textContent = 'Zipping…';
  downloadBtn.disabled = true;
  try {
    const { blob, filename } = await runBundle(lastRun.bundle);
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
    downloadBtn.textContent = was;
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
    statusEl.textContent = 'The link could not be copied here — it is the address in the address bar.';
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

function clearResults() {
  renderSchedule(null);
  // The meters go with the results they were read from. A bill left standing
  // over a cleared plate would be describing a run the sheet no longer shows.
  bill = null;
  lastRun = null;
  renderBill();
  syncPin();
  syncDownload();
  set('t-vars', '—');
  set('t-err', '—', '');
  set('t-exit', '—', '');
  $('finding').textContent = '';
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
// A Stop is a decision about this desk, not about this instant: the key stays
// out of automatic refresh until the rest of the desk moves again, at which
// point the stopped curve is stale history like any other.
const studyStops = new Map(); // key -> the rest-shape the Stop was issued under

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
const deskKey = (p, patch, omit = null) =>
  JSON.stringify([
    Object.fromEntries(
      Object.entries(p).filter(([key]) => !PRICED_KEYS.has(key) && key !== omit),
    ),
    patch,
  ]);

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
  for (const el of [$('trace'), $('finding'), $('schedule'), $('bill')]) el.classList.toggle('stale', show);
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
  studyScheduler?.cancelWhere((job) => job.restShape !== restShapeKey(job.key), 'moved');
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
  $('q-floor').textContent = m2(facts.floor);
  $('q-exposed').textContent = facts.exposed > 0 ? m2(facts.exposed) : 'None — adiabatic';
  $('q-volume').textContent = `${facts.volume.toFixed(1)} m³`;
  $('q-compact').textContent = Number.isFinite(facts.compactness)
    ? `${facts.compactness.toFixed(3)} m⁻¹`
    : '—';
  $('q-glazing').textContent = facts.glazing > 0 ? m2(facts.glazing) : 'None';
  // Depth and projection factor together: the depth is what the slider says,
  // the factor is what it means against the opening it shades.
  $('q-overhang').textContent =
    facts.overhang > 0
      ? `${facts.overhang.toFixed(2)} m · PF ${facts.projection.toFixed(2)}`
      : 'None';

  desk?.setState(modelState);
  syncStudies();
  syncRunSub();
  // A reading survives until the next solve supersedes it, the way the plate's
  // curve does — except on a channel that has just gone out of the path, where
  // the last number it produced would now be describing a path that is no
  // longer there.
  desk?.setReadings(
    new Map([...lastReadings].map(([id, w]) => [id, modelState.get(id)?.engaged ? w : null])),
    derivedReadings(facts),
    lastAt,
  );
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
    applyGeometry();
    if (priced) reprice();
    else if (continuous()) pump();
  }
  if (done) {
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

    const value = document.createElement('output');
    value.htmlFor = `dim-${key}`;
    const show = () => {
      value.textContent = control.format(params[key]);
      input.setAttribute('aria-valuetext', control.format(params[key]));
    };
    show();

    input.addEventListener('input', () => commit(key, Number(input.value)));
    input.addEventListener('change', () => commit(key, Number(input.value), true));

    row.append(label, input, value);
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
let lastAt = null; // the instant the desk's meters are reading

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * The hours the next run will solve, read off the desk — the sizing days when
 * they are kept, plus the run period's own months when a year is attached.
 * One computation, because the Run strip's meter, the title block and the
 * attach sentence all quote it, and three hand-kept copies of "8,760" would
 * go quietly wrong the first time a run period covered less than the year.
 */
function runHours() {
  const [a, b] =
    params.beginMonth <= params.endMonth
      ? [params.beginMonth, params.endMonth]
      : [params.endMonth, params.beginMonth];
  const year = DAYS_IN_MONTH.slice(a - 1, b).reduce((total, d) => total + d, 0) * 24;
  return (params.sizingPeriods === 'Yes' ? 48 : 0) + (annual() ? year : 0);
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
    ['shading', facts.shadeArea > 0 ? `${facts.shadeArea.toFixed(1)} m²` : 'None'],
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

/** Anchor a variable name so one meter cannot pick up another's series. */
const exactly = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/**
 * What each channel was contributing at one instant.
 *
 * At one instant, and not averaged over the run, which was the first attempt
 * and was useless: a free-running zone comes back to roughly where it started,
 * so every term of its balance averages to nearly nothing over a day and the
 * whole desk reads zero. A console meter shows level now, not the mean of the
 * song. So the desk reads at the hour the building is having the hardest time —
 * the one furthest from 20 °C, which is the hour the design is judged at, and
 * an instant where the balance genuinely closes.
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

/** The hour the building is having the hardest time, within one environment. */
function worstHour(zone, run) {
  let at = run.start;
  let worst = -Infinity;
  for (let i = run.start; i <= run.end; i += 1) {
    const off = Math.abs(zone[i] - 20);
    if (off > worst) {
      worst = off;
      at = i;
    }
  }
  return at;
}

const deskPanel = $('desk');
const deskButton = $('desk-open');

desk = mountConsole({
  host: deskPanel,
  params,
  bypass,
  onChange: commit,
  onPatch(id, off) {
    beginGesture();
    bypass[id] = off;
    // Taking a channel in by hand is an answer to the solo question too.
    if (solo && solo !== id) {
      solo = null;
      desk.solo = null;
    }
    applyGeometry();
    endGesture();
    desk.settle();
    if (autoOn()) pump();
  },
  onSolo(next) {
    beginGesture();
    solo = next;
    applyGeometry();
    endGesture();
    desk.settle();
    if (autoOn()) pump();
  },
  onReset: () => revert(),
  onStudy: (key) => studyRun(key),
  onStudyClear(key) {
    studies.delete(key);
    desk.setStudy(key, null);
  },
});

function openDesk(open) {
  document.body.classList.toggle('desk-open', open);
  deskButton.setAttribute('aria-expanded', String(open));
  $('desk-count').textContent = open ? 'Close the desk' : 'Every control on the desk';
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
  // A priced control cannot move the plate or the results schedule, so it must
  // not letter them with a baseline it did not shift.
  if (priced || !solvedColumns || !solvedParams) return;
  baseline = { columns: solvedColumns, label: shapeLabel(solvedParams) };
  ghost = plot ? plot.zone : null;
  $('baseline-note').textContent = `Δ against ${baseline.label}`;
}

const endGesture = () => {
  gesture = false;
  // The address bar is a reading like any other: it updates when you let go,
  // never per frame, the same rule the gesture ghosts follow.
  updatePermalink();
  // The study pool held its dispatch while the hand was down — real cores go
  // to the drag's own solves — so the release is what hands them back, and it
  // is also when every study the gesture left behind re-queues itself.
  studyScheduler?.drain();
  refreshStudies();
};

/* ══ controls ════════════════════════════════════════════════════════════ */

let epwText;
let engineReady = false;
const site = $('site');
const autoBox = $('auto');

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
 * that station's own 99% heating and 1% cooling drybulb, because a Denver datum
 * across a Singapore year would be a lie told in ink.
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
  const picked = pick.station;
  inflight?.abort();
  inflight = new AbortController();
  const { signal } = inflight;

  closePanel();
  site.classList.add('picked');
  $('site-main').textContent = `${siteName(picked)}, ${siteRegion(picked)}`;
  $('site-sub').replaceChildren(document.createTextNode('Fetching the weather file…'));
  statusEl.className = 'status';
  statusEl.textContent = `Downloading TMYx ${pick.label} for ${siteName(picked)}…`;

  // Hand the field back, saying why. The sheet keeps whatever climate it
  // already had, which is the one it is still lettered with.
  const refuse = (message) => {
    site.classList.remove('picked');
    $('site-main').textContent = 'Choose a weather location';
    $('site-sub').textContent = 'Any of 17,292 TMYx stations, for a full 8,760-hour year';
    statusEl.className = 'status bad';
    statusEl.textContent = message;
  };

  // Three outcomes, told apart for the permalink boot: true is attached, false
  // is refused (and `refuse` has already said why), null is superseded by a
  // later choice and calls for nothing at all.
  let files;
  try {
    files = await weatherFor(picked, signal);
  } catch (error) {
    if (signal.aborted) return null;
    refuse(`${siteName(picked)} could not be fetched: ${error.message}`);
    return false;
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
    refuse(`${siteName(picked)} cannot be used: ${error.message}`);
    return false;
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

  // The whole climate arrives together: the year on the EPW, the design days
  // and the location on the DDY. Denver's come out, this station's go in.
  epwText = files.epw;
  setDesignConditions(model, conditions);

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
  syncPin();
  renderBill();
  // The bundle goes with the run it described. Without this, the download
  // button stayed lettered live over a cleared `lastRun` and clicking it did
  // nothing at all — the exact silent control the design refuses.
  syncDownload();
  // The studies go the way the pin does, and for the same reason: they were
  // swept under the old climate, and a curve of Denver design days under a
  // Singapore titleblock would be a lie told in graphite. New sweeps read the
  // new climate — a score of annual runs now, counted out on the strip.
  studies.clear();
  desk?.clearStudies();

  // With a real year attached the sizing days stop earning their place. They
  // are 48 hours of the most extreme weather in the file, run ahead of 8,760
  // hours of the actual one, and every reading downstream then has to be told
  // which of the three environments it means -- the plate labels them, the
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
  // When the setting already stood where the link or the last station left
  // it, that commit moved nothing and its pump found nothing to solve — yet
  // the climate above genuinely changed, and the station is deliberately not
  // part of the shape key. Force the solve the sentence below promises.
  if (autoOn() && shapeKey(params) === solvedShape) {
    forced = true;
    pump();
  }

  const hours = runHours().toLocaleString('en-US');
  set('t-run', 'Annual');
  syncRunSub();
  statusEl.className = 'status';
  statusEl.textContent =
    sizing === 'Yes'
      ? `${siteName(picked)} attached, design conditions and all — the run covers ${hours} hours, sizing days included.`
      : `${siteName(picked)} attached, design conditions and all — the run covers ${hours} hours, with the sizing days skipped.`;
  syncAuto();
  markStale();
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
  encodeState({ params: p, bypass: patching(), station: stationToken() });

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
  clearResults();
  history.replaceState(null, '', location.pathname + location.search);
  statusEl.className = 'status bad';
  statusEl.textContent = message;
  refusalNote = message;
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
    if (took === false && JSON.stringify([params, patching()]) === untouched) {
      refuseLink(
        `The linked ${named} could not be attached, so the whole link was set aside and the sheet is at its defaults.`,
      );
      return;
    }
  } finally {
    linkAttachPending = false;
    syncSweepGate();
  }
  // The attach held the address still; now that the station is real, one
  // rewrite brings the bar back to lettering the desk.
  updatePermalink();
}

/* ══ the run ═════════════════════════════════════════════════════════════ */

$('t-date').textContent = `Issued ${new Date().toLocaleDateString('en-CA')}`;

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
statusEl.textContent = 'Engine compiled and resident. Nothing further is downloaded.';

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
  // The rest of the run's identity, captured in the same breath as the shape.
  // `idf` below is held for the same reason, but these were once read live
  // after the await — and a station picked or a channel patched during a
  // 0.7 s annual run had the bundle pairing one city's IDF with another's
  // EPW, manifest and permalink.
  const capture = {
    epw: epwText ?? null,
    annual: Boolean(epwText),
    weatherStem:
      epwText && station?.url ? station.url.split('/').pop().replace(/\.zip$/i, '') : null,
    location: $('t-location').textContent,
    permalink: schemeUrl(snapshot),
  };
  const live = continuous();
  quiet = live;

  clearLog();
  for (const el of [$('trace'), $('finding'), $('schedule'), $('bill')]) el.classList.remove('stale');
  // An auto-solve leaves the previous result standing until the new one lands.
  // Blanking the plate every 0.7 s would be a strobe, and the old numbers are
  // the only thing that makes the new ones mean anything.
  if (!live) {
    statusEl.className = 'status';
    clearResults();
  }

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

  let result;
  try {
    result = await ep.run({ idf, epw: epwText });
  } catch (error) {
    solvedShape = shape;
    stopAuto();
    statusEl.className = 'status bad';
    statusEl.textContent = `The run could not be attempted: ${error.message}`;
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

  if (!result.success) {
    // A fatal is rarely about this one shape, so stop solving on every drag
    // frame and let the failure sit still long enough to be read.
    stopAuto();
    statusEl.className = 'status bad';
    statusEl.textContent = result.fatalError ?? `Engine exited with code ${result.exitCode}`;
    for (const entry of errs) log(`[${entry.severity}] ${entry.message}`);
    return;
  }

  const eso = result.eso;
  set('t-vars', String(eso?.variables.size ?? 0));

  const zonePts = eso ? hourly(eso, /Zone Mean Air Temperature/i) : [];
  const outPts = eso ? hourly(eso, /Site Outdoor Air Drybulb Temperature/i) : [];
  if (!zonePts.length) {
    stopAuto();
    statusEl.className = 'status bad';
    statusEl.textContent = 'Run completed, but no hourly zone temperature was found in the ESO.';
    return;
  }

  const hasOutdoor = outPts.length > 0;
  const nn = hasOutdoor ? Math.min(zonePts.length, outPts.length) : zonePts.length;
  const zone = zonePts.slice(0, nn).map((p) => p.value);
  const out = (hasOutdoor ? outPts : zonePts).slice(0, nn).map((p) => p.value);
  const points = zonePts.slice(0, nn);
  const runs = environmentRuns(points, eso?.environments ?? []);

  plot = { zone, out, segments: axisSegments(points, runs) };
  renderTrace();

  const columns = runs.map((r) => ({ label: r.label, metrics: metricsFor(zone, out, r, hasOutdoor) }));
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
  const at = worstHour(zone, runs[leadIndex]);
  const stamp = points[at]?.timestamp;
  lastAt = stamp
    ? `${String(stamp.hour ?? 0).padStart(2, '0')}:00, ${stamp.day} ${MONTHS[stamp.month - 1]} · zone ${zone[at].toFixed(1)} °C`
    : null;
  lastReadings = readMeters(eso, at);

  // The end-use meters ride in on the same ESO -- `Output:Meter` writes to both
  // the .eso and the .mtr -- so the bill is priced off the run that is already
  // in hand rather than a second parse of a second file.
  // Which environments the bill covers. A weather file brings a real run
  // period with it and that is the only thing anyone means by an energy bill;
  // without one there are just the sizing days, and those are billed as
  // themselves rather than passed off as a year.
  const billed = runs.some((r) => r.kind === null) ? runs.filter((r) => r.kind === null) : runs;
  lastRun = {
    eso,
    environments: new Set(billed.map((r) => r.key)),
    hours: billed.reduce((total, r) => total + (r.end - r.start + 1), 0),
    annual: billed.some((r) => r.kind === null),
    // Everything the download bundle needs, captured here rather than read back
    // off live state at click time: the inputs the engine ran and the report it
    // wrote, alongside the run facts the manifest states. `html` is the genuine
    // eplustbl.htm — the model requests AllSummary with an All column separator,
    // so EnergyPlus writes it on every run and it arrives on the result. `log`
    // is the engine's own console output, which the run already carries: it
    // costs nothing to keep and it is where EnergyPlus states its warnings and
    // severes in its own words, which the raw .err would otherwise be needed
    // for. The .eso and .err themselves come back only parsed, so shipping them
    // as files would mean re-serialising into something that isn't what the
    // engine wrote — left out rather than faked.
    bundle: {
      idf,
      html: result.html ?? null,
      log: result.consoleOutput?.length ? result.consoleOutput.join('\n') : null,
      version: ENERGYPLUS_VERSION,
      hours: nn,
      exitCode: result.exitCode,
      severe,
      warnings,
      seconds,
      // The run's identity — epw, annual, weatherStem, location and the
      // permalink of the scheme that produced it — spread whole from the
      // snapshot taken before the await, for the same reason `idf` is held: a
      // field-by-field copy is one more list to forget a field in, and a
      // slider nudged since the solve must not have the manifest citing a
      // scheme that never produced these results.
      ...capture,
    },
  };
  bill = billFrom(lastRun);
  syncPin();
  renderBill();
  syncDownload();

  desk?.setReadings(lastReadings, derivedReadings(geometryFacts(model)), lastAt);

  $('fig-cap').textContent = hasOutdoor
    ? nn > 900
      ? 'Zone mean air temperature against outdoor drybulb over the full run period. Each column spans the hourly range within it; the model at left is drawn from the surface vertices in the IDF and tinted by the zone mean.'
      : 'Zone mean air temperature against outdoor drybulb across both Denver design days. The model at left is drawn from the surface vertices in the IDF and tinted by the zone mean.'
    : 'Zone mean air temperature over the run. No outdoor drybulb was recorded in the ESO.';

  const q = (text, hot) =>
    Object.assign(document.createElement('span'), { className: hot ? 'q hot' : 'q', textContent: text });
  const finding = $('finding');
  finding.textContent = '';
  const m = lead.metrics;
  if (Number.isFinite(m.damping)) {
    finding.append(
      'With no heating or cooling anywhere in this model, the envelope alone takes the ',
      lead.label.split(' · ')[0].toLowerCase(),
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
 * days or the attached year — and only the metric numbers are kept from each
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
    applyModel(model, { ...job.snapshot, [job.key]: value }, job.patch, { reporting: job.metric });
    // Each sample's intensity divides by that sample's own floor, which the
    // swept key may itself be moving — the same live read the bill takes.
    const floorArea = job.metric === 'energy' ? geometryFacts(model).floor : null;
    return { idf: writeIdf(model), epw: job.epw, floorArea };
  } finally {
    applyModel(model, params, patching());
    setAnnual(model, annual());
  }
}

studyScheduler = createStudyScheduler({
  // The cache key is the sample's whole desk — the overlay's shape key —
  // plus the metric and the run kind, so a lean design-day sample can never
  // answer for an annual one or for the sheet's own solve. The station is
  // deliberately absent, which is why a station change clears the cache.
  keyOf: (job, value) =>
    JSON.stringify([deskKey({ ...job.snapshot, [job.key]: value }, job.patch), job.metric, job.annual]),
  buildSample,
  runSample: async ({ idf, epw }) => {
    const result = await studyPool.run({ idf, epw });
    // The counter counts engine runs, so cache hits — honestly — do not turn it.
    runCount += 1;
    $('runs').textContent = String(runCount);
    return result;
  },
  readPoint: (job, result, built) =>
    result.eso
      ? job.metric === 'energy'
        ? readDemand(result.eso, built.floorArea)
        : readExtremes(result.eso)
      : null,
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
    return;
  }
  studyStops.delete(key);
  // Ahead of any refresh backlog: the reader asked for this one by name.
  enqueueStudy(key, { origin: 'manual', front: true });
}

/** Queue one study of the desk as it stands right now. */
function enqueueStudy(key, { origin, front = false, n = SWEEP_SAMPLES } = {}) {
  const { control } = controlFor(key);
  // The desk this study describes, read in one breath — the same capture
  // rule the solve follows, for the same reason: params keep moving between
  // samples, and every sample of a job must describe the same desk.
  const snapshot = { ...params };
  const patch = patching();
  const epw = epwText ?? null;
  // What each run is read for. Free-running, the zone's two extremes are the
  // design quantities. With ideal loads in the path and a year to bill, the
  // extremes flatten at the setpoints and the demand the system pays to hold
  // them there is the reading — TEDI, CEDI and the building EUI.
  const metric = epw && channelState(snapshot, patch).get('system').engaged ? 'energy' : 'extremes';
  const points = samplePoints(control, snapshot[key], n);
  studyScheduler.enqueue(
    makeStudyJob({
      key,
      snapshot,
      patch,
      epw,
      annual: Boolean(epw),
      metric,
      restShape: restShapeKey(key, snapshot, patch),
      points,
      order: sampleOrder(points, snapshot[key]),
      origin,
      asked: n,
    }),
    { front },
  );
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
  metric: job.metric,
  // Samples still in flight are simply absent, so the silhouette spans them
  // and sharpens as they land; a sample that failed stays in the curve with
  // no metrics and draws as a gap, never a substituted value.
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
  studiesStopBtn.hidden = p.jobs === 0;
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
const studiesStopBtn = $('studies-stop');
studiesStopBtn.addEventListener('click', () => {
  studyScheduler?.cancelWhere(() => true, 'shed');
  if (!pumping) {
    statusEl.className = 'status';
    statusEl.textContent = 'Studies set aside — they refresh when the desk next moves.';
  }
});

function onStudyUpdate(job, event) {
  if (event === 'idle') {
    syncStudyStatus();
    // Densify in idle time, not now: the queue just drained, and the reader
    // may be reaching for a control this instant.
    (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300)))(() => densifyStudies());
    return;
  }
  const key = job.key;
  const said = controlFor(key).control.label.toLowerCase();
  const kind = job.annual ? 'annual' : 'design-day';

  if (event === 'point') {
    desk.setStudy(key, partialStudy(job), { stale: false });
    desk.setStudyProgress(key, { done: job.done, total: job.total });
    syncStudyStatus();
  } else if (event === 'done') {
    const study = {
      label: shapeLabel(job.snapshot),
      restShape: job.restShape,
      annual: job.annual,
      metric: job.metric,
      curve: job.curve,
      // A coarse first pass is a real study, drawn honestly at eleven points;
      // the flag is what tells the idle densify it is worth finishing.
      coarse: job.asked === COARSE_SAMPLES,
    };
    studies.set(key, study);
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
    // A global Set-aside suppresses each key the way a per-study Stop does,
    // or the next idle densify would quietly restart the work just shed.
    if (job.cancelled === 'shed') studyStops.set(key, restShapeKey(key));
    if (job.cancelled === 'stopped') syncStudyStatus(`Study of ${said} set aside.`);
    else syncStudyStatus();
  }
}

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
    'This scheme skips the sizing days but attaches no weather, so there is nothing to solve. Switch Design days back on in the Run strip, or pick a station.';
} else if (autoOn()) {
  pump();
}
