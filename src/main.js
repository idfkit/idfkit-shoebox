import { createEnergyPlus, findVariables, getTimeSeries } from '@idfkit/engine';
import { httpSource, SchemaBundle, writeIdf } from '@idfkit/core';
import {
  buildModel,
  DEFAULT_PARAMETERS,
  designConditionsFrom,
  designDayDatums,
  geometryFacts,
  modelFacts,
  PARAMETERS,
  setAnnual,
  setDesignConditions,
  setParameters,
  shadeGeometry,
  surfaceGeometry,
  windowGeometry,
} from './model.js';
import {
  climateDescription,
  climateZone,
  degreeDays,
  here,
  nearestSites,
  searchSites,
  siteName,
  siteRegion,
  weatherFor,
} from './weather.js';

const ENERGYPLUS_VERSION = '26.1.0';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const $ = (id) => document.getElementById(id);
const runBtn = $('run');
const statusEl = $('status');
const logEl = $('log');
const elapsedEl = $('elapsed');

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

  for (const s of SURFACES) {
    const screen = s.verts.map(project);
    pts.push(...screen);
    for (let i = 0; i < screen.length; i++) edges.push([screen[i], screen[(i + 1) % screen.length]]);
    const n = normal(s.verts);
    const facing = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
    if (facing > 1e-6) {
      // Top face reads brightest, then the +x wall, then the +y wall.
      faces.push({ screen, alpha: 0.1 + 0.2 * Math.max(0, n[2]) + 0.07 * Math.max(0, n[0]) });
    }
  }

  // The overhang is drawn last but measured now: it stands outside the box, so
  // the frame has to be told about it before the viewBox is settled.
  const shades = SHADES.map((s) => s.verts.map(project));
  for (const screen of shades) pts.push(...screen);

  // One dimension line per slider, each offset off the model in its own
  // coordinate space and anchored to an edge the south-east view keeps in
  // silhouette.
  const all = SURFACES.flatMap((s) => s.verts);
  const ext = (i) => [Math.min(...all.map((v) => v[i])), Math.max(...all.map((v) => v[i]))];
  const [x0, x1] = ext(0);
  const [y0, y1] = ext(1);
  const [, z1] = ext(2);
  const off = Math.max(x1 - x0, y1 - y0) * 0.15;
  const dims = [
    { a: [x0, y0, 0], b: [x1, y0, 0], d: [0, -off, 0], text: `${(x1 - x0).toFixed(2)} m` },
    { a: [x1, y0, 0], b: [x1, y1, 0], d: [off, 0, 0], text: `${(y1 - y0).toFixed(2)} m` },
    { a: [x0, y0, 0], b: [x0, y0, z1], d: [-off, -off * 0.35, 0], text: `${z1.toFixed(2)} m` },
  ];
  const centre = project([(x0 + x1) / 2, (y0 + y1) / 2, z1 / 2]);
  const dimGeo = dims.map((dim) => {
    const a = project(dim.a.map((v, i) => v + dim.d[i]));
    const b = project(dim.b.map((v, i) => v + dim.d[i]));
    const geo = { a, b, from: project(dim.a), to: project(dim.b), text: dim.text };
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
    const screen = win.verts.map(project);
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

function hourly(eso, pattern) {
  const v = findVariables(eso, pattern).find((x) => x.reportFrequency === 'hourly');
  return v ? getTimeSeries(eso, v.id)?.data ?? [] : [];
}

const stats = (v) => {
  const min = Math.min(...v);
  const max = Math.max(...v);
  return { min, max, mean: v.reduce((a, b) => a + b, 0) / v.length, swing: max - min };
};

// Each EnergyPlus environment is its own weather story. A design-day run holds
// two of them, and averaging across the pair would be nonsense — the winter and
// summer days share nothing. Everything below is computed per environment.
function environmentRuns(points, environments) {
  const runs = [];
  points.forEach((p, i) => {
    const key = p.timestamp.environmentIndex;
    if (!runs.length || runs.at(-1).key !== key) runs.push({ key, start: i, end: i, first: p.timestamp });
    else runs.at(-1).end = i;
  });
  return runs.map((r, i) => {
    const title = environments[i]?.title ?? '';
    const kind = /htg/i.test(title) ? 'Winter design day' : /clg/i.test(title) ? 'Summer design day' : null;
    return { ...r, kind, label: kind ? `${kind} · ${r.first.day} ${MONTHS[r.first.month - 1]}` : 'Annual run period' };
  });
}

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

const set = (id, text, cls) => {
  const el = $(id);
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
};

function clearResults() {
  renderSchedule(null);
  set('t-vars', '—');
  set('t-err', '—', '');
  set('t-exit', '—', '');
  $('finding').textContent = '';
}

/* ══ dimensions ══════════════════════════════════════════════════════════ */

const params = { ...DEFAULT_PARAMETERS };
const syncSlider = {}; // key -> redraw that slider from `params`
let solvedShape = null; // the shape the visible results were solved for
let lastMean = null; // zone mean of the last run, for the axonometric tint

// Every parameter that reaches the IDF belongs in here: the pump solves a shape
// only if its key differs from the one on screen, so anything left out would
// move the drawing and never be simulated.
const shapeKey = (p) => `${p.width}×${p.depth}×${p.height}@${p.wwr}+${p.overhang}`;
const shapeLabel = (p) =>
  `${p.width.toFixed(2)} × ${p.depth.toFixed(2)} × ${p.height.toFixed(2)} m · ${(p.wwr * 100).toFixed(0)} %` +
  (p.overhang > 0 ? ` · ${p.overhang.toFixed(2)} m overhang` : '');

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
  for (const el of [$('trace'), $('finding'), $('schedule')]) el.classList.toggle('stale', show);
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

function applyGeometry() {
  setParameters(model, params);
  SURFACES = surfaceGeometry(model);
  WINDOWS = windowGeometry(model);
  SHADES = shadeGeometry(model);
  renderAxon(lastMean);

  const facts = geometryFacts(model);
  const m2 = (v) => `${v.toFixed(1)} m²`;
  $('q-floor').textContent = m2(facts.floor);
  $('q-exposed').textContent = m2(facts.exposed);
  $('q-volume').textContent = `${facts.volume.toFixed(1)} m³`;
  $('q-compact').textContent = `${facts.compactness.toFixed(3)} m⁻¹`;
  $('q-glazing').textContent = facts.glazing > 0 ? m2(facts.glazing) : 'None';
  // Depth and projection factor together: the depth is what the slider says,
  // the factor is what it means against the opening it shades.
  $('q-overhang').textContent =
    facts.overhang > 0
      ? `${facts.overhang.toFixed(2)} m · PF ${facts.projection.toFixed(2)}`
      : 'None';
  markStale();
}

function buildSliders() {
  const host = $('sliders');
  host.textContent = '';
  for (const [key, spec] of Object.entries(PARAMETERS)) {
    const row = document.createElement('div');
    row.className = spec.group ? 'dim group' : 'dim';

    const label = document.createElement('label');
    label.htmlFor = `dim-${key}`;
    label.textContent = spec.label;

    const input = document.createElement('input');
    Object.assign(input, {
      type: 'range',
      id: `dim-${key}`,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      value: params[key],
    });
    input.setAttribute('aria-label', spec.label);

    const value = document.createElement('output');
    value.htmlFor = `dim-${key}`;
    const show = () => {
      value.textContent = spec.format(params[key]);
      input.setAttribute('aria-valuetext', spec.format(params[key]));
    };
    show();

    input.addEventListener('input', () => {
      params[key] = Number(input.value);
      show();
      beginGesture();
      applyGeometry();
      if (continuous()) pump();
    });
    // Pointer release, or the keyboard's commit. Where the annual run solves,
    // and where a design day catches its last shape. The baseline stays on
    // screen after it — you have only stopped moving, not stopped comparing.
    input.addEventListener('change', () => {
      endGesture();
      if (autoOn()) pump();
    });

    row.append(label, input, value);
    host.append(row);
    syncSlider[key] = () => {
      input.value = String(params[key]);
      show();
    };
  }
}

$('reset').addEventListener('click', () => {
  beginGesture();
  Object.assign(params, DEFAULT_PARAMETERS);
  for (const sync of Object.values(syncSlider)) sync();
  applyGeometry();
  endGesture();
  if (autoOn()) pump();
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

function beginGesture() {
  if (gesture) return;
  gesture = true;
  // The label comes off the solved shape, not off `params` — by the time the
  // first input event fires the slider has already moved.
  if (!solvedColumns || !solvedParams) return;
  baseline = { columns: solvedColumns, label: shapeLabel(solvedParams) };
  ghost = plot ? plot.zone : null;
  $('baseline-note').textContent = `Δ against ${baseline.label}`;
}

const endGesture = () => {
  gesture = false;
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
  if (autoOn()) pump();
  else markStale();
});

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
async function choose(row, pick) {
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

  let files;
  try {
    files = await weatherFor(picked, signal);
  } catch (error) {
    if (signal.aborted) return;
    refuse(`${siteName(picked)} could not be fetched: ${error.message}`);
    return;
  }
  if (signal.aborted) return;

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
    return;
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

  set('t-run', 'Annual');
  $('t-run-sub').textContent = 'Weather file, 8,760 hours';
  statusEl.className = 'status';
  statusEl.textContent = `${siteName(picked)} attached, design conditions and all — the next run covers all 8,760 hours.`;
  syncAuto();
  markStale();
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
  assetBaseUrl: '/energyplus',
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
const schema = await new SchemaBundle(httpSource('/schemas/')).load(ENERGYPLUS_VERSION);
const model = buildModel(schema);

// Everything the drawing asserts is now read back off the model, so the sheet
// cannot describe a building the engine did not simulate.
DATUMS = designDayDatums(model);
buildSliders();
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
  const live = continuous();
  quiet = live;

  clearLog();
  for (const el of [$('trace'), $('finding'), $('schedule')]) el.classList.remove('stale');
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

  let result;
  try {
    result = await ep.run({ idf: writeIdf(model), epw: epwText });
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
  // and the sentence agree.
  const lead = columns.reduce((a, b) => (b.metrics.o.swing > a.metrics.o.swing ? b : a));
  lastMean = lead.metrics.z.mean;
  renderAxon(lastMean);

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
// may call `solve` — everything goes through this one loop.
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

if (autoOn()) pump();
