/**
 * The plate: one completed run, drawn in the view the reader chose (spec 015).
 *
 * `drawPlate(host, frame)` reads only its `PlateFrame` (data-model.md §3.2) and
 * computes nothing it letters: every count, share, sort, mean, grid and
 * outline comes from `views.js` or `comfort.js`, which Node harnesses call
 * directly (SC-003). `main.js` holds the state, builds the frame and calls
 * this; nothing here can start a solve (FR-003).
 *
 * The time series renderer is `renderTrace` from `main.js`, moved here. At the
 * default setting with no ghost its SVG is attribute for attribute what it was
 * (FR-002), which `.harness/fixtures/plate-ts-*.svg` holds it to.
 */

import { KINDS, deltaKindOf, figureIn, letter, suffixIn } from './units.js';
import { MONTHS, stampText } from './readings.js';
import {
  REFUSAL,
  REGION_NEEDS,
  SELECTABLE,
  SERIES_BY_ID,
  VIEWS,
  VIEW_BY_ID,
  WasNow,
  aggregate,
  assessedHours,
  assessedValues,
  averageDay,
  carpetChange,
  carpetGrid,
  dailySignature,
  durationCurve,
  hoursAtOrAbove,
  availabilityOf,
  dayOfYear,
  dateOfDay,
  dayText,
  densityOutline,
  hourIndex,
  hourIndexOf,
  moveRange,
  nearestHour,
  rangeSegments,
  settingFor,
  zoomSpan,
  zoomText,
} from './views.js';
import { ADAPTIVE_MODELS, GRAPHIC, MODEL_BY_ID, REGIONS, adaptiveCounts, graphicShares, occupiedHours } from './comfort.js';
import { humidityRatio, rhCurve, saturationPressure } from './psychro.js';

/* ══ drawing primitives ══════════════════════════════════════════════════ */

export function svg(tag, attrs = {}) {
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

const html = (tag, attrs = {}, text = null) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (text !== null) el.textContent = text;
  return el;
};

export const PAD = { t: 18, r: 68, b: 30, l: 46 }; // right gutter holds the curve labels
// The height the plate is drawn at when it has a row of its own to fill is
// that row's; `H_FLOOR` is the height it had before, and still has stacked.
export const H_FLOOR = 268;

function niceStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

/** A step of 1, 2 or 5 times a power of ten, so an axis lettered to whole figures never rounds a tick. */
function roundStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
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
export function axisSegments(points, runs) {
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

/**
 * How each selectable series is drawn on the time series. Air keeps the
 * redline it has always had and outdoor its dashed ghost ink; operative and
 * radiant take the two remaining inks and a dash each, so every series is
 * told apart by pattern and gutter label as well as by ink (FR-022).
 */
const PENS = Object.freeze({
  air: { stroke: 'var(--redline)', width: 1.9, denseWidth: 1.4, dash: null, band: 'var(--redline)', bandOpacity: 0.28, label: 'var(--redline)' },
  operative: { stroke: 'var(--ink)', width: 1.4, denseWidth: 1.1, dash: null, band: 'var(--ink)', bandOpacity: 0.12, label: 'var(--ink)' },
  radiant: { stroke: 'var(--ink-2)', width: 1.3, denseWidth: 1.1, dash: '1 2.5', band: 'var(--ink-2)', bandOpacity: 0.1, label: 'var(--ink-2)' },
  outdoor: { stroke: 'var(--ink-ghost)', width: 1.4, denseWidth: 1.4, dash: '4 3', band: 'var(--ink-ghost)', bandOpacity: 0.32, label: 'var(--ink-3)' },
});

/* ══ the frame ═══════════════════════════════════════════════════════════ */

/** The plate's measured drawing box, read off its host. */
function measure(host, frame) {
  // The content box, less the 16px padding each side, so a user unit is a
  // client pixel: drawn at the padded width the svg was scaled by about 0.95
  // and its hairlines landed between pixels. The floor is the preview's, not
  // the 320px it was: a phone leaves 282px, and a 320-unit drawing scaled into
  // it lettered every figure at 0.88 of its size and stood 6 to 9px off the
  // range preview drawn 1:1 under it.
  const w = Math.max(host.clientWidth - 32, 120);
  // Beside the model column the plate fills the row the column sets; the svg
  // is out of the flow there, so this reads the row and never the chart.
  // Stacked, there is no row to fill and it keeps its own height.
  const stretch = getComputedStyle(host).getPropertyValue('--plate-stretch').trim() === '1';
  const H = stretch ? Math.max(H_FLOOR, host.clientHeight - 22) : H_FLOOR;
  void frame;
  return { w, H, inner: { w: w - PAD.l - PAD.r, h: H - PAD.t - PAD.b } };
}

const MEASURING = typeof location !== 'undefined' && new URLSearchParams(location.search).has('measure');

/**
 * Draw the frame into the plate's host and return the field a pointer or a key
 * is resolved against, or null where nothing on the plate can be picked.
 */
export function drawPlate(host, frame) {
  if (MEASURING) performance.mark('plate-draw-start');
  const field = drawInto(host, frame);
  if (MEASURING) {
    performance.mark('plate-draw-end');
    performance.measure('plate-draw', 'plate-draw-start', 'plate-draw-end');
  }
  return field;
}

function drawInto(host, frame) {
  const view = VIEW_BY_ID[frame.setting.view];
  const box = measure(host, frame);
  host.textContent = '';
  // What the renderer letters beside the field, rebuilt on every draw so a
  // refused view never shows the last view's readings.
  frame.readout = [];
  frame.cite = null;
  // Before the first run every view but the time series, which draws its
  // datums on an empty field, says only that it is waiting.
  if (!frame.live && view.id !== 'ts') {
    const { w, H, inner } = box;
    const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': `${view.label}: awaiting a run` });
    awaiting(root, inner);
    host.append(root);
    host.classList.remove('pickable');
    return null;
  }
  const availability = frame.live ? availabilityOf(view, frame.live) : null;
  if (availability && !availability.available) {
    drawRefusal(host, box, view, availability);
    host.classList.remove('pickable');
    return null;
  }
  return RENDERERS[view.id](host, frame, box);
}

/** A view the run cannot support: its reason and remedy stand where the field would, never another view (SC-005). */
function drawRefusal(host, { w, H, inner }, view, why) {
  const root = svg('svg', {
    viewBox: `0 0 ${w} ${H}`,
    width: '100%',
    height: H,
    role: 'img',
    'aria-label': `${view.label}: unavailable. ${why.reason}${why.remedy ? ` ${why.remedy}` : ''}`,
  });
  const cx = PAD.l + inner.w / 2;
  const cy = PAD.t + inner.h / 2;
  const head = svg('text', {
    x: cx, y: cy - 6, 'text-anchor': 'middle',
    fill: 'var(--ink-3)', 'font-family': 'var(--cond)', 'font-size': 11, 'letter-spacing': '0.16em',
  });
  head.textContent = `${view.label.toUpperCase()} · ${why.reason.replace(/\.$/, '').toUpperCase()}`;
  root.append(head);
  if (why.remedy) {
    const t = svg('text', {
      x: cx, y: cy + 12, 'text-anchor': 'middle',
      fill: 'var(--redline)', 'font-family': 'var(--sans)', 'font-size': 11,
    });
    t.textContent = why.remedy;
    root.append(t);
  }
  host.append(root);
}

/* ══ the time series ═════════════════════════════════════════════════════ */

function drawTimeSeries(host, frame, { w, H, inner }) {
  const { live, datums, setting } = frame;
  const view = VIEW_BY_ID.ts;
  // Every drawn series, and every drawn zone series' ghost. Air and outdoor
  // are the default, and in that case the element sequence below is exactly
  // `renderTrace`'s: ghost, outdoor, zone, marker, labels, axis.
  const drawn = live ? setting.series.filter((id) => live.series.has(id)) : [];
  const zones = drawn.filter((id) => SERIES_BY_ID[id].zone);
  const outside = drawn.filter((id) => !SERIES_BY_ID[id].zone);
  const ghost = frame.ghost;
  const ghosts = ghost ? zones.filter((id) => ghost.series.has(id)) : [];

  // The hours shown: the whole run, or the zoomed range, or one point per
  // day or month of it.
  const zoom = live && setting.zoom ? zoomSpan(live, setting.zoom) : null;
  const first = zoom ? zoom.start : 0;
  const last = zoom ? zoom.end : live ? live.points.length - 1 : 0;
  const hours = [];
  for (let i = first; i <= last; i += 1) hours.push(i);
  const grain = setting.aggregation;
  const periods = live && grain !== 'h' ? new Map(drawn.concat(ghosts.map((id) => `ghost:${id}`)).map((key) => {
    const id = key.replace('ghost:', '');
    const run = key.startsWith('ghost:') ? ghost : live;
    return [key, aggregate(run.series.get(id), live.points, grain, hours)];
  })) : null;
  const valuesOf = (id, run = live) => {
    const all = run.series.get(id);
    return zoom ? all.subarray(first, last + 1) : all;
  };

  // The ghost is inside the field it is drawn on, so it has to be inside the
  // domain too — otherwise a shape that was hotter than the current one gets
  // clipped at the top of the plate.
  const vals = [];
  if (live) {
    for (const id of drawn) for (const v of valuesOf(id)) if (Number.isFinite(v)) vals.push(v);
    for (const id of ghosts) for (const v of valuesOf(id, ghost)) if (Number.isFinite(v)) vals.push(v);
  }
  const lo = Math.min(...datums.map((d) => d.value), ...(vals.length ? vals : [0]));
  const hi = Math.max(...datums.map((d) => d.value), ...(vals.length ? vals : [0]));
  const span = (hi - lo) || 1;
  const [dMin, dMax] = [lo - span * 0.1, hi + span * 0.12];
  const y = (v) => PAD.t + inner.h - ((v - dMin) / (dMax - dMin)) * inner.h;
  const x = (i, n) => PAD.l + (n <= 1 ? inner.w / 2 : (i / (n - 1)) * inner.w);

  const root = svg('svg', {
    viewBox: `0 0 ${w} ${H}`,
    width: '100%',
    height: H,
    role: 'img',
    'aria-label': view.describe(setting),
  });

  // ── ruling
  const grid = svg('g', { 'shape-rendering': 'crispEdges' });
  const right = w - PAD.r;
  // About one rule per 48px of field, never fewer than six: drawn to the row's
  // height the plate is two and a half times as tall as it was, and six rules
  // across it left 20° between them.
  const step = niceStep(dMax - dMin, Math.max(6, Math.round(inner.h / 48)));
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

  drawDatums(root, datums, y, right);

  if (!live) {
    awaiting(root, inner);
    host.append(root);
    host.classList.remove('pickable');
    return null;
  }

  // The axis runs over the points shown: the hours, or the periods.
  const n = periods ? periods.get(drawn[0])?.length ?? 0 : hours.length;
  const dense = !periods && n > 900;
  const cols = dense ? Math.min(Math.floor(inner.w), 520) : n;

  const bandPath = (bins) => {
    const top = bins.map((b, i) => `${x(i, bins.length).toFixed(2)},${y(b.max).toFixed(2)}`);
    const bot = bins.map((b, i) => `${x(i, bins.length).toFixed(2)},${y(b.min).toFixed(2)}`).reverse();
    return `M${top.join('L')}L${bot.join('L')}Z`;
  };
  // The line joins every hour it is given, across environments too: on the
  // design-day desk that draws the stroke from the last winter hour to the
  // first summer one, as `main` did, and FR-002 holds the default plate to
  // `main` byte for byte. A missing value still lifts the pen, where it used
  // to letter `NaN` into the path and end it there; no run on `main` had one,
  // so the fixtures are unchanged by it.
  const linePath = (vals) => {
    let d = '';
    let open = false;
    vals.forEach((v, i) => {
      if (!Number.isFinite(v)) { open = false; return; }
      d += `${open ? 'L' : 'M'}${x(i, vals.length).toFixed(2)},${y(v).toFixed(2)}`;
      open = true;
    });
    return d;
  };
  const seriesValues = (id, run = live) => (periods ? periods.get(run === live ? id : `ghost:${id}`).map((p) => p.mean) : [...valuesOf(id, run)]);

  // The shape you took hold of, drawn first so the live curve reads on top of
  // it. Same pen, no weight: this is where the building was, not a second
  // measurement.
  for (const id of ghosts) {
    root.append(
      svg('path', {
        d: linePath(seriesValues(id, ghost)), fill: 'none', stroke: PENS[id].stroke,
        'stroke-width': 1.1, opacity: 0.34, 'stroke-linejoin': 'round',
      }),
    );
  }

  if (periods) {
    // Each point is its period's mean, with the period's range as a band
    // (FR-018): the band is the range, not a spread about the mean.
    for (const id of [...outside, ...[...zones].reverse()]) {
      const pen = PENS[id];
      const bins = periods.get(id);
      root.append(svg('path', { d: bandPath(bins), fill: pen.band, 'fill-opacity': pen.bandOpacity }));
      root.append(
        svg('path', {
          d: linePath(bins.map((b) => b.mean)), fill: 'none', stroke: pen.stroke,
          'stroke-width': pen.denseWidth, 'stroke-dasharray': pen.dash, 'stroke-linejoin': 'round',
        }),
      );
    }
  } else if (dense) {
    for (const id of outside) {
      root.append(svg('path', { d: bandPath(bucket(seriesValues(id), cols)), fill: PENS[id].band, 'fill-opacity': PENS[id].bandOpacity }));
    }
    const zoneBins = new Map(zones.map((id) => [id, bucket(seriesValues(id), cols)]));
    for (const id of [...zones].reverse()) {
      root.append(svg('path', { d: bandPath(zoneBins.get(id)), fill: PENS[id].band, 'fill-opacity': PENS[id].bandOpacity }));
    }
    for (const id of [...zones].reverse()) {
      root.append(
        svg('path', {
          d: linePath(zoneBins.get(id).map((b) => b.mean)), fill: 'none',
          stroke: PENS[id].stroke, 'stroke-width': PENS[id].denseWidth, 'stroke-dasharray': PENS[id].dash,
          'stroke-linejoin': 'round',
        }),
      );
    }
  } else {
    for (const id of outside) {
      root.append(
        svg('path', {
          d: linePath(seriesValues(id)), fill: 'none', stroke: PENS[id].stroke,
          'stroke-width': PENS[id].width, 'stroke-dasharray': PENS[id].dash, 'stroke-linejoin': 'round',
        }),
      );
    }
    for (const id of [...zones].reverse()) {
      root.append(
        svg('path', {
          d: linePath(seriesValues(id)), fill: 'none', stroke: PENS[id].stroke,
          'stroke-width': PENS[id].width, 'stroke-dasharray': PENS[id].dash,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }),
      );
    }
  }

  /*
   * ── the reading hour
   *
   * The instant every meter on the desk is reading, drawn on the one picture
   * that has an axis for it. The head is the same square the patch buttons and
   * the rail's pin carry: filled `--redline` when the hour is held, a hairline
   * outline when it is whichever hour this run happened to be worst at. One
   * armed idiom, three places.
   *
   * Drawn only when the hour is inside what is shown: a zoom that leaves it
   * out, or an aggregation that has no single hour, says so in the readout.
   */
  const reading = frame.reading && !periods && frame.reading.at >= first && frame.reading.at <= last ? frame.reading : null;
  if (frame.reading && !reading) {
    // FR-019: a view that cannot place the hour says so, in view and in its
    // description, rather than dropping the marker with nothing said.
    const mean = `a ${grain === 'd' ? 'daily' : 'monthly'} mean`;
    const stamp = stampText(live.points, frame.reading.at);
    frame.readout.push({
      label: 'Reading hour',
      value: periods ? null : stamp,
      note: periods ? `cannot be placed on ${mean}` : 'outside the range shown',
    });
    root.setAttribute(
      'aria-label',
      `${view.describe(setting)}. ` +
        (periods ? `The reading hour cannot be placed on ${mean}.` : `The reading hour, ${stamp}, is outside the range shown.`),
    );
  }
  const marked = zones[0] ?? drawn[0];
  if (reading) {
    const mx = x(reading.at - first, n);
    const held = reading.held;
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
    const v = live.series.get(marked)[reading.at];
    if (Number.isFinite(v)) mark.append(svg('circle', { cx: mx, cy: y(v), r: 2.6, fill: ink }));
    const title = svg('title');
    title.textContent = `${held ? 'Held at' : 'Read at'} ${stampText(live.points, reading.at)}`;
    mark.append(title);
    root.append(mark);
    // The plate's description says what it is now showing, since the marker is
    // part of the picture a reader who cannot see it is being told about.
    root.setAttribute(
      'aria-label',
      `${view.describe(setting)}. ` +
        `The desk's meters are ${held ? 'held at' : 'reading at'} ` +
        `${stampText(live.points, reading.at)}.`,
    );
  }

  // ── direct labels in the right gutter beat a legend box
  const lastOf = (id, run = live) => {
    const v = seriesValues(id, run);
    return v[v.length - 1];
  };
  const labels = [];
  for (const id of [...zones, ...outside]) {
    labels.push({ text: SERIES_BY_ID[id].label, y: y(lastOf(id)), fill: PENS[id].label, opacity: 1 });
  }
  for (const id of ghosts) {
    labels.push({ text: ghosts.length > 1 ? `Was ${SERIES_BY_ID[id].label}` : 'Was', y: y(lastOf(id, ghost)), fill: PENS[id].stroke, opacity: 0.55 });
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

  // ── x axis: one label per environment, or per month for an annual run;
  // a zoomed range is lettered by its dates instead.
  const axis = svg('g');
  const lettered = []; // each label with the band it has to fit, checked once drawn
  const segments = zoom
    ? [{ start: 0, end: n - 1, label: zoomText(setting.zoom) }]
    : periods
      ? periodSegments(periods.get(drawn[0]), live)
      : axisSegments(live.points, live.runs);
  for (const seg of segments) {
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
    // A design day also has a short form, its season and date: the band a
    // day gets on a phone is about 100px, and the full "WINTER DESIGN DAY ·
    // 21 DEC" in tracked capitals needs about 160, so the two centred labels
    // ran into each other.
    // A month has one too, its initial: a year on a phone gives each month
    // about 14px, and "JAN" needs 22, so every month name was erased and the
    // axis said nothing about when.
    const short = seg.kind ? seg.label.replace(/ design day/i, '').toUpperCase() : seg.label ? seg.label[0].toUpperCase() : null;
    // On a period axis a segment of one point, which is every month under
    // Month mean, spans no distance between its ends: measured that way its
    // band was zero and `fitLabels` erased every month name. Its band is the
    // spacing its points take. The hourly axis is measured as it always was.
    const band = periods ? ((seg.end - seg.start + 1) * inner.w) / Math.max(1, n - 1) : Math.abs(x1 - x0);
    lettered.push({ t, band, short });
  }
  root.append(axis);

  // Where the field the marker travels in ended up, so the gesture can
  // hit-test it. The hours are pickable only where each point is an hour.
  const field = !periods
    ? {
        root,
        w,
        innerW: inner.w,
        n,
        first,
        // Snapping is decided by the axis's own resolution rather than by run
        // kind: an annual run at ten hours to the pixel cannot mean an hour, a
        // design day at five pixels to the hour can.
        snap: n / inner.w > 1,
        pick(clientX, _clientY, { clamped = false } = {}) {
          const box = root.getBoundingClientRect();
          if (!box.width) return null;
          const px = (clientX - box.left) * (w / box.width);
          const i = Math.round(((px - PAD.l) / inner.w) * (n - 1));
          if (i < 0 || i > n - 1) return clamped ? first + Math.min(n - 1, Math.max(0, i)) : null;
          return first + i;
        },
        steps: (at) => ({ min: first, max: last, at }),
      }
    : null;
  // Nothing is pickable until the desk has read this run at some hour, which
  // is what `renderTrace` asked of `lastReadFrom` before it drew a field.
  const pickable = Boolean(frame.reading && field);
  host.classList.toggle('pickable', pickable);

  host.append(root);
  fitLabels(lettered);
  return pickable ? field : null;
}

/**
 * The axis bands of an aggregated series: one per month, or one per
 * environment. A design day is named as the hourly axis names it, by its
 * environment, so its one point is not lettered as a month ahead of January.
 */
function periodSegments(periods, live) {
  const segments = [];
  periods.forEach((p, i) => {
    const t = live.points[p.start].timestamp;
    const key = `${t.environmentIndex}:${t.month}`;
    if (!segments.length || segments.at(-1).key !== key) {
      const run = live.runs.find((r) => p.start >= r.start && p.start <= r.end);
      const day = run && run.kind !== null;
      segments.push({ key, start: i, end: i, label: day ? run.label : MONTHS[t.month - 1], kind: day ? run.kind : null });
    } else segments.at(-1).end = i;
  });
  const wide = (seg) => (seg.end - seg.start + 1) / periods.length > 0.06;
  return segments.map((s) => (wide(s) ? s : { ...s, label: '' }));
}

function drawDatums(root, datums, y, right) {
  // ── design-day datums
  for (const d of datums) {
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
}

function awaiting(root, inner) {
  const t = svg('text', {
    x: PAD.l + inner.w / 2, y: PAD.t + inner.h / 2 + 4, 'text-anchor': 'middle',
    fill: 'var(--ink-ghost)', 'font-family': 'var(--cond)', 'font-size': 11,
    'letter-spacing': '0.16em',
  });
  t.textContent = 'AWAITING RUN';
  root.append(t);
}

/**
 * Only a drawn label has a length. One that overruns its band takes its short
 * form, and one that overruns in that too is left out, as a month too narrow to
 * letter already is: a label over its neighbour's band reads as the neighbour's.
 */
function fitLabels(lettered) {
  for (const { t, band, short } of lettered) {
    if (t.getComputedTextLength() <= band) continue;
    if (short) t.textContent = short;
    if (!short || t.getComputedTextLength() > band) t.textContent = '';
  }
}


/* ══ scatter views: shared axes, marks, pick and ghost outline ═══════════ */

/** A linear scale over a domain onto the plot box. */
function scales({ inner }, xDomain, yDomain) {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  return {
    x: (v) => PAD.l + ((v - x0) / (x1 - x0)) * inner.w,
    y: (v) => PAD.t + inner.h - ((v - y0) / (y1 - y0)) * inner.h,
    box: { x0: PAD.l, x1: PAD.l + inner.w, y0: PAD.t, y1: PAD.t + inner.h },
  };
}

/** Extend a declared domain to the data, so no mark is ever clipped (research.md R3). */
function reach(domain, values) {
  let [lo, hi] = domain;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * Ruled axes for a scatter view, each lettered in the sheet's unit system
 * through its kind, with its name and unit once at the end of the axis.
 */
function scatterAxes(root, { w, H, inner }, s, { xDomain, yDomain, xKind, yKind, xName, yName }) {
  const grid = svg('g', { 'shape-rendering': 'crispEdges' });
  // About one figure per 70px, never fewer than three: the floor of five put
  // five four-digit hour counts into the 168px a phone leaves the duration
  // field, and they ran together as "0 2000400060008000".
  const xStep = Math.max(1, roundStep(xDomain[1] - xDomain[0], Math.max(3, Math.round(inner.w / 70))));
  for (let v = Math.ceil(xDomain[0] / xStep) * xStep; v <= xDomain[1] + 1e-9; v += xStep) {
    const gx = Math.round(s.x(v)) + 0.5;
    grid.append(svg('line', { x1: gx, y1: PAD.t, x2: gx, y2: PAD.t + inner.h, stroke: 'var(--rule-soft)', 'stroke-width': 1 }));
    const t = svg('text', { x: gx, y: PAD.t + inner.h + 13, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-family': 'var(--mono)', 'font-size': 10 });
    t.textContent = figureIn(xKind, v, { digits: 0, ipDigits: 0 });
    grid.append(t);
  }
  const yStep = Math.max(1, roundStep(yDomain[1] - yDomain[0], Math.max(5, Math.round(inner.h / 48))));
  for (let v = Math.ceil(yDomain[0] / yStep) * yStep; v <= yDomain[1] + 1e-9; v += yStep) {
    const gy = Math.round(s.y(v)) + 0.5;
    grid.append(svg('line', { x1: PAD.l, y1: gy, x2: w - PAD.r, y2: gy, stroke: 'var(--rule-soft)', 'stroke-width': 1 }));
    const t = svg('text', { x: PAD.l - 8, y: gy + 3.5, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-family': 'var(--mono)', 'font-size': 10 });
    t.textContent = figureIn(yKind, v, { digits: 0, ipDigits: 0 });
    grid.append(t);
  }
  grid.append(svg('line', { x1: PAD.l - 0.5, y1: PAD.t, x2: PAD.l - 0.5, y2: PAD.t + inner.h, stroke: 'var(--rule)', 'stroke-width': 1 }));
  grid.append(svg('line', { x1: PAD.l, y1: PAD.t + inner.h + 0.5, x2: w - PAD.r, y2: PAD.t + inner.h + 0.5, stroke: 'var(--rule)', 'stroke-width': 1 }));
  const name = (text, attrs) => {
    const t = svg('text', { fill: 'var(--ink-3)', 'font-family': 'var(--cond)', 'font-size': 9.5, 'letter-spacing': '0.12em', ...attrs });
    t.textContent = text;
    grid.append(t);
  };
  // The name in the plate's capitals, the unit as its kind spells it: `G/KG`
  // is not a unit anybody writes.
  const named = (text, kind) => (suffixIn(kind) ? `${text.toUpperCase()}, ${suffixIn(kind)}` : text.toUpperCase());
  name(named(xName, xKind), { x: w - PAD.r, y: H - 3, 'text-anchor': 'end' });
  // Above the field rather than inside its top corner, where a datum near the
  // top of the range (the average day's 1 % cooling line) was lettered over it.
  name(named(yName, yKind), { x: PAD.l - 0.5, y: PAD.t - 7 });
  root.append(grid);
}

/**
 * One series of hourly marks as a single path of zero-length subpaths, so a
 * year is one node rather than 8,760 (research.md R9). The cap is the mark's
 * shape: square for the zone, round for outdoors, so the two differ by shape
 * as well as ink (FR-022).
 */
function marks(xs, ys, { ink, cap, opacity = 0.4, width = 2.4 }) {
  let d = '';
  for (let i = 0; i < xs.length; i += 1) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) d += `M${xs[i].toFixed(1)} ${ys[i].toFixed(1)}h0`;
  }
  return svg('path', { d, fill: 'none', stroke: ink, 'stroke-width': width, 'stroke-linecap': cap, opacity });
}

/** The ghost's 90 % outline (FR-020b), dashed in the redline at a ghost's weight. */
function outline(xs, ys, box) {
  const segments = densityOutline(xs, ys, box, 0.9);
  const d = segments.map(([a, b]) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`).join('');
  return svg('path', { d, fill: 'none', stroke: 'var(--redline)', 'stroke-width': 1.1, 'stroke-dasharray': '3 2', opacity: 0.55 });
}

/** The reading hour on a scatter view: the armed square, filled when held (FR-019). */
function readingSquare(cx, cy, held) {
  return svg('rect', {
    x: cx - 4, y: cy - 4, width: 8, height: 8,
    fill: held ? 'var(--redline)' : 'none',
    stroke: held ? 'var(--redline)' : 'var(--ink)', 'stroke-width': 1.2, 'pointer-events': 'none',
  });
}

/** A gutter legend entry: the mark's shape and its name, so the key is read in words and shape. */
function legend(root, entries, { w }) {
  entries.forEach(({ text, ink, cap }, i) => {
    const y = PAD.t + 10 + i * 14;
    root.append(svg('path', { d: `M${w - PAD.r + 10} ${y - 3}h0`, stroke: ink, 'stroke-width': 6, 'stroke-linecap': cap }));
    const t = svg('text', { x: w - PAD.r + 18, y, fill: 'var(--ink-2)', 'font-family': 'var(--cond)', 'font-size': 9.5, 'letter-spacing': '0.11em' });
    t.textContent = text.toUpperCase();
    root.append(t);
  });
}

/**
 * The keyboard's range on a view that draws a subset of the run's hours: its
 * first to its last drawn hour, a page being one per cent of the hours drawn.
 * Over every hour of the run, Home landed on the winter design day's first
 * hour, which no scatter view and no carpet draws, and moved every meter on
 * the desk there.
 */
const drawnRange = (hours) => (hours.length ? { min: hours[0], max: hours[hours.length - 1], shown: hours.length } : null);

/** The pick of a scatter view: the nearest hour-identifiable mark to a client point. */
function scatterField(root, { w, H }, index, hours) {
  return {
    root,
    n: hours.length,
    snap: false,
    pick(clientX, clientY) {
      const box = root.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const px = (clientX - box.left) * (w / box.width);
      const py = (clientY - box.top) * (H / box.height);
      return nearestHour(index, px, py, 12);
    },
    steps: () => drawnRange(hours),
  };
}

/** A lettered zero with no sign: `toFixed` writes "-0" and "-0.0" for small negatives. */
const ZERO = /^0(?:\.0+)?(?:\s|$)/;
const unsignedZero = (text) => text.replace(/^-(?=0(?:\.0+)?(?:\s|$))/, '');

/** A share of occupied hours as the sheet letters one. */
const pct = (share) => (Number.isFinite(share) ? `${(share * 100).toFixed(1)} %` : '—');
const hoursText = (n) => `${Number(n).toLocaleString('en-US')} h`;
/** A reading, lettered `was → now` while a ghost stands and alone otherwise. */
const pair = (now, was, say) => (was === undefined ? say(now) : new WasNow(was, now).letter(say));

/* ══ the psychrometric view (US1) ════════════════════════════════════════ */

function drawPsychrometric(host, frame, box) {
  const { live, ghost, setting, reading } = frame;
  const view = VIEW_BY_ID.psy;
  const { w, H } = box;
  const hours = assessedHours(live);
  const tZone = live.series.get('air');
  const wZone = live.series.get('wZone');
  const tOut = live.series.get('outdoor');
  const wOut = live.series.get('wOut');
  const pick = (values) => Float64Array.from(hours, (i) => values[i]);
  const pressure = live.facts.pressure;

  const xDomain = reach([-10, 40], [...pick(tZone), ...pick(tOut)]);
  const yDomain = reach([0, 30], [...pick(wZone), ...pick(wOut)]);
  const s = scales(box, xDomain, yDomain);
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  scatterAxes(root, box, s, {
    xDomain, yDomain, xKind: KINDS.temperature, yKind: KINDS.humidityRatio,
    xName: 'Dry bulb', yName: 'Humidity ratio',
  });

  // The saturation curve and the relative-humidity curves at 10 % intervals,
  // at the site's standard pressure (research.md R3), clipped to the field.
  const curves = svg('g', { fill: 'none', 'pointer-events': 'none' });
  for (let phi = 1; phi >= 0.1 - 1e-9; phi -= 0.1) {
    const points = rhCurve(phi, pressure, xDomain[0], xDomain[1], 0.5)
      .map(([t, W]) => [s.x(t), s.y(W * 1000)])
      .filter(([, py]) => py >= PAD.t);
    if (points.length < 2) continue;
    curves.append(svg('path', {
      d: `M${points.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L')}`,
      stroke: phi > 0.99 ? 'var(--ink-2)' : 'var(--rule-firm)',
      'stroke-width': phi > 0.99 ? 1.2 : 0.8,
    }));
    const [lx, ly] = points.at(-1);
    const t = svg('text', { x: lx + 3, y: ly + 3, fill: 'var(--ink-3)', 'font-family': 'var(--mono)', 'font-size': 8.5 });
    t.textContent = `${Math.round(phi * 100)} %`;
    // Below the gutter's two-entry legend: at 282px the 60 % curve met the
    // gutter at the legend's own height and its label was lettered over it.
    if (ly > PAD.t + 34) curves.append(t);
  }
  root.append(curves);

  // The comfort region the reader chose.
  const regionNeeds = availabilityOf(REGION_NEEDS[setting.region], live);
  const regionOn = regionNeeds.available;
  const readout = [];
  if (setting.region === 'g') {
    GRAPHIC.forEach(({ clo, polygon }) => {
      const d = `M${polygon.map(([t, W]) => `${s.x(t).toFixed(1)},${s.y(W).toFixed(1)}`).join('L')}Z`;
      root.append(svg('path', { d, fill: 'var(--ink)', 'fill-opacity': 0.04, stroke: 'var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': clo === 1 ? '5 3' : null }));
      // Each zone is named at its own outer edge, the 1.0 clo zone on its cold
      // side and the 0.5 clo zone on its warm side, since the two overlap, and
      // near the top of that edge: halfway up, at 390px, the 0.5 clo name sat
      // on the summer zone states and the reading marker. The halo keeps it
      // legible where hours still fall on it.
      const warm = clo < 1;
      const edge = warm ? polygon.slice(0, polygon.length / 2) : polygon.slice(polygon.length / 2);
      const [lt, lw] = edge[warm ? edge.length - 3 : 2];
      const t = svg('text', {
        x: s.x(lt) + (warm ? 5 : -5), y: s.y(lw) + 3, 'text-anchor': warm ? 'start' : 'end',
        fill: 'var(--ink-2)', 'font-family': 'var(--cond)', 'font-size': 9, 'letter-spacing': '0.1em',
        stroke: 'var(--sheet)', 'stroke-width': 3, 'paint-order': 'stroke',
      });
      t.textContent = `${clo.toFixed(1)} CLO`;
      root.append(t);
    });
    const shares = graphicShares(live);
    const was = ghost ? graphicShares(ghost) : null;
    if (!shares) {
      readout.push({ label: 'Occupied hours inside', value: `— ${REFUSAL.gains.reason} ${REFUSAL.gains.remedy}` });
    } else {
      shares.forEach((z, i) => {
        const share = z.occupied ? z.inside / z.occupied : NaN;
        const before = was ? (was[i].occupied ? was[i].inside / was[i].occupied : NaN) : undefined;
        readout.push({ label: `Inside the ${z.clo.toFixed(1)} clo zone`, value: pair(share, before, pct) });
      });
    }
    frame.cite = { text: REGIONS.graphic.citation, fold: REGIONS.graphic.fold };
  } else if (regionOn) {
    const model = MODEL_BY_ID.a80;
    const trm = live.facts.runningMean.mean;
    const at = reading?.at ?? null;
    const t = at === null ? null : live.points[at].timestamp;
    const day = t ? dayOfYear({ month: t.month, day: t.day }) : null;
    const mean = day === null ? null : trm.at(day);
    if (mean !== null && model.judges(mean).upper && model.judges(mean).lower) {
      const x0 = s.x(model.lowerAt(mean));
      const x1 = s.x(model.upperAt(mean));
      root.append(svg('rect', { x: x0, y: PAD.t, width: x1 - x0, height: box.inner.h, fill: 'var(--ink)', 'fill-opacity': 0.05, stroke: 'var(--ink-2)', 'stroke-width': 1 }));
      const label = svg('text', { x: x0 + 4, y: PAD.t + 22, fill: 'var(--ink-2)', 'font-family': 'var(--cond)', 'font-size': 9, 'letter-spacing': '0.1em' });
      label.textContent = `80 % STRIP · ${t.day} ${MONTHS[t.month - 1].toUpperCase()}`;
      root.append(label);
    } else {
      readout.push({ label: 'Strip', value: t ? `— the method does not reach ${t.day} ${MONTHS[t.month - 1]}` : '— no reading hour' });
    }
    const counts = adaptiveCounts(live, model, trm);
    const before = ghost ? adaptiveCounts(ghost, model, ghost.facts.runningMean.mean) : null;
    // The share over every occupied hour, as the graphic zones' is, so the two
    // regions answer one question (FR-011); hours out of the method's scope
    // stay in the denominator and are lettered apart below, never as inside.
    if (counts) {
      const within = (c) => (c.occupied ? c.within / c.occupied : NaN);
      readout.push({ label: 'Inside the strip', value: pair(within(counts), before ? within(before) : undefined, pct) });
    }
    pushCounts(readout, counts, before);
    frame.cite = { text: REGIONS.adaptive.citation, fold: REGIONS.adaptive.fold };
  } else {
    readout.push({ label: 'Adaptive strip', value: `— ${regionNeeds.reason}${regionNeeds.remedy ? ` ${regionNeeds.remedy}` : ''}` });
    frame.cite = { text: REGIONS.adaptive.citation, fold: REGIONS.adaptive.fold };
  }

  // Two zone states that read as a fault unless the sheet says what it
  // measured. A zone that trades moisture with nothing and holds no source
  // keeps the humidity ratio it was initialised with, lowered only where
  // EnergyPlus caps the air at saturation: at Chicago the starting desk holds
  // 1.634 g/kg for 8,584 of 8,760 hours, a horizontal line. Give it occupants
  // and no exchange and their moisture builds until the air saturates, which
  // it then rides for 5,623 hours within 2 % (79.1 g/kg at 48 °C). The cause is stated
  // only where the document shows it.
  const sealed = !live.facts.moistureExchange;
  if (sealed && !live.facts.moistureSource) {
    const tally = new Map();
    // Counted at the precision the figure is lettered at. Counted exactly, a
    // sealed Boston year whose every hour letters as 11.3 gr/lb differed in
    // its last bits from hour to hour and was said to hold it for 0.5 % of
    // hours; counted this way it is 100.0 %.
    for (const i of hours) {
      if (!Number.isFinite(wZone[i])) continue;
      const w = Math.round(wZone[i] * 100) / 100;
      tally.set(w, (tally.get(w) ?? 0) + 1);
    }
    const [mode, held] = [...tally].reduce((a, b) => (b[1] > a[1] ? b : a), [NaN, 0]);
    if (held) {
      readout.push({
        label: 'Zone humidity held at',
        value: letter(KINDS.humidityRatio, mode, { digits: 2 }),
        note: `for ${pct(held / hours.length)} of hours: nothing adds, removes or exchanges moisture.`,
      });
    }
  }
  // Within 2 %, since the engine takes the weather file's station pressure and
  // the curve is drawn at the standard one (see psychro.js).
  let saturated = 0;
  for (const i of hours) {
    if (Number.isFinite(tZone[i]) && wZone[i] >= 0.98 * 1000 * humidityRatio(saturationPressure(tZone[i]), pressure)) saturated += 1;
  }
  if (saturated) {
    readout.push({
      label: 'Saturated',
      value: hoursText(saturated),
      note: sealed && live.facts.moistureSource ? 'Occupants add moisture a sealed zone cannot lose.' : null,
    });
  }

  // The ghost's zone states as they stood when the gesture began (FR-020b).
  if (ghost) {
    const gx = Float64Array.from(hours, (i) => s.x(ghost.series.get('air')[i]));
    const gy = Float64Array.from(hours, (i) => s.y(ghost.series.get('wZone')[i]));
    root.append(outline(gx, gy, s.box));
  }

  const ox = Float64Array.from(hours, (i) => s.x(tOut[i]));
  const oy = Float64Array.from(hours, (i) => s.y(wOut[i]));
  const zx = Float64Array.from(hours, (i) => s.x(tZone[i]));
  const zy = Float64Array.from(hours, (i) => s.y(wZone[i]));
  root.append(marks(ox, oy, { ink: 'var(--ink-ghost)', cap: 'round', opacity: 0.35 }));
  root.append(marks(zx, zy, { ink: 'var(--redline)', cap: 'square', opacity: 0.45 }));
  legend(root, [
    { text: 'Zone', ink: 'var(--redline)', cap: 'square' },
    { text: 'Outdoor', ink: 'var(--ink-ghost)', cap: 'round' },
  ], box);

  if (reading && Number.isFinite(tZone[reading.at]) && Number.isFinite(wZone[reading.at])) {
    root.append(readingSquare(s.x(tZone[reading.at]), s.y(wZone[reading.at]), reading.held));
  }

  const shares = readout.map((r) => `${r.label}: ${spoken(r)}`).join('; ');
  root.setAttribute(
    'aria-label',
    `${view.describe(setting)}, one mark per hour for the zone (squares) ` +
      `and outdoors (circles), with ${setting.region === 'g' ? 'the ASHRAE 55 graphic comfort zones' : 'the ASHRAE 55 adaptive strip'}. ` +
      `${shares}.` +
      (reading ? ` The desk's meters are ${reading.held ? 'held at' : 'reading at'} ${stampText(live.points, reading.at)}.` : ''),
  );
  frame.readout = readout;
  host.append(root);
  const index = hourIndexOf(zx, zy, hours);
  const field = scatterField(root, box, index, hours);
  host.classList.toggle('pickable', Boolean(reading));
  return reading ? field : null;
}

/** The five adaptive counts, lettered apart (FR-011a), `was → now` while a ghost stands. */
function pushCounts(readout, counts, before) {
  if (!counts) {
    readout.push({ label: 'Occupied hours', value: `— ${REFUSAL.gains.reason} ${REFUSAL.gains.remedy}` });
    return;
  }
  for (const [key, label] of [['above', 'Above'], ['within', 'Within'], ['below', 'Below'], ['unassessed', 'Unassessed'], ['outOfScope', 'Out of scope']]) {
    readout.push({ label, value: pair(counts[key], before ? before[key] : undefined, hoursText) });
  }
}

/* ══ the adaptive comfort view (US3) ═════════════════════════════════════ */

function drawAdaptive(host, frame, box) {
  const { live, ghost, setting, reading } = frame;
  const { w, H } = box;
  const model = MODEL_BY_ID[setting.model];
  const trm = live.facts.runningMean.mean;
  const op = live.series.get('operative');
  const hours = occupiedHours(live) ?? new Int32Array(0);
  const meanOf = (run, i) => {
    const t = run.points[i].timestamp;
    return run.facts.runningMean.mean?.at(dayOfYear({ month: t.month, day: t.day })) ?? NaN;
  };
  const xs = Float64Array.from(hours, (i) => meanOf(live, i));
  const ys = Float64Array.from(hours, (i) => op[i]);
  const { upperFrom, upperTo, lowerFrom, lowerTo } = model.range;
  const xDomain = reach([Math.min(upperFrom, lowerFrom) - 5, Math.max(upperTo, lowerTo) + 2], xs);
  const yDomain = reach([15, 35], ys);
  const s = scales(box, xDomain, yDomain);
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  scatterAxes(root, box, s, {
    xDomain, yDomain, xKind: KINDS.temperature, yKind: KINDS.temperature,
    xName: 'Running mean outdoor', yName: 'Operative',
  });

  // The band, each limit drawn only across the running means it applies to.
  const line = (from, to, at, attrs) =>
    svg('path', { d: `M${s.x(from).toFixed(1)},${s.y(at(from)).toFixed(1)}L${s.x(to).toFixed(1)},${s.y(at(to)).toFixed(1)}`, fill: 'none', ...attrs });
  const band = `M${s.x(Math.max(upperFrom, lowerFrom)).toFixed(1)},${s.y(model.upperAt(Math.max(upperFrom, lowerFrom))).toFixed(1)}` +
    `L${s.x(Math.min(upperTo, lowerTo)).toFixed(1)},${s.y(model.upperAt(Math.min(upperTo, lowerTo))).toFixed(1)}` +
    `L${s.x(Math.min(upperTo, lowerTo)).toFixed(1)},${s.y(model.lowerAt(Math.min(upperTo, lowerTo))).toFixed(1)}` +
    `L${s.x(Math.max(upperFrom, lowerFrom)).toFixed(1)},${s.y(model.lowerAt(Math.max(upperFrom, lowerFrom))).toFixed(1)}Z`;
  root.append(svg('path', { d: band, fill: 'var(--ink)', 'fill-opacity': 0.05, stroke: 'none' }));
  // Graphite, told apart by their words. A published limit is not a signed
  // quantity (system.md), and a hue here read two ways: warm for "too hot
  // above", or, beside the signature view's cooling in `--cold`, for "cooling
  // needed above".
  root.append(line(upperFrom, upperTo, (t) => model.upperAt(t), { stroke: 'var(--ink)', 'stroke-width': 1.2 }));
  root.append(line(lowerFrom, lowerTo, (t) => model.lowerAt(t), { stroke: 'var(--ink)', 'stroke-width': 1.2 }));
  root.append(line(Math.min(upperFrom, lowerFrom), Math.max(upperTo, lowerTo), (t) => model.neutral(t), { stroke: 'var(--ink-3)', 'stroke-width': 0.8, 'stroke-dasharray': '4 3' }));
  for (const [text, at, fill] of [['UPPER', model.upperAt(upperTo), 'var(--ink-2)'], ['LOWER', model.lowerAt(lowerTo), 'var(--ink-2)']]) {
    const t = svg('text', { x: s.x(Math.min(upperTo, lowerTo)) + 4, y: s.y(at) + 3, fill, 'font-family': 'var(--cond)', 'font-size': 9, 'letter-spacing': '0.1em' });
    t.textContent = text;
    root.append(t);
  }

  if (ghost) {
    const gh = occupiedHours(ghost) ?? new Int32Array(0);
    const gop = ghost.series.get('operative');
    root.append(outline(Float64Array.from(gh, (i) => s.x(meanOf(ghost, i))), Float64Array.from(gh, (i) => s.y(gop[i])), s.box));
  }
  const px = Float64Array.from(xs, (v) => s.x(v));
  const py = Float64Array.from(ys, (v) => s.y(v));
  root.append(marks(px, py, { ink: 'var(--redline)', cap: 'square', opacity: 0.4 }));
  legend(root, [{ text: 'Occupied h', ink: 'var(--redline)', cap: 'square' }], box);

  const placed = Boolean(reading) && Number.isFinite(meanOf(live, reading.at)) && Number.isFinite(op[reading.at]);
  if (placed) {
    root.append(readingSquare(s.x(meanOf(live, reading.at)), s.y(op[reading.at]), reading.held));
  }

  const counts = adaptiveCounts(live, model, trm);
  const before = ghost ? adaptiveCounts(ghost, model, ghost.facts.runningMean.mean) : null;
  const readout = [];
  pushCounts(readout, counts, before);
  // FR-019: an hour the view cannot place is said, not dropped.
  if (reading && !placed) {
    const why = Number.isFinite(meanOf(live, reading.at)) ? 'with no operative temperature' : 'on a day the running mean does not reach';
    readout.push({ label: 'Reading hour', value: `${stampText(live.points, reading.at)}, ${why}` });
  }
  frame.readout = readout;
  frame.cite = { text: model.citation, fold: model.fold };
  root.setAttribute(
    'aria-label',
    `Adaptive comfort: operative temperature against the running mean outdoor temperature for occupied hours, ` +
      `with the ${model.label} band. ${readout.map((r) => `${r.label} ${spoken(r)}`).join(', ')}.` +
      (reading ? ` The desk's meters are ${reading.held ? 'held at' : 'reading at'} ${stampText(live.points, reading.at)}.` : ''),
  );
  host.append(root);
  const field = scatterField(root, box, hourIndexOf(px, py, hours), hours);
  host.classList.toggle('pickable', Boolean(reading));
  return reading ? field : null;
}

/* ══ the carpet (US4) ════════════════════════════════════════════════════ */

/** The fill of a bin: one hue in nine steps, or cold and warm either side of a clear zero bin. */
function binFill(b, grid) {
  if (!grid.signed) return { fill: 'var(--redline)', opacity: 0.08 + (0.84 * b) / (grid.bins.length - 1) };
  const mid = (grid.bins.length - 1) / 2;
  if (b === mid) return { fill: 'var(--ink-ghost)', opacity: 0.12 };
  const reachOut = Math.abs(b - mid) / mid;
  return { fill: b < mid ? 'var(--cold)' : 'var(--warm)', opacity: 0.18 + 0.72 * reachOut };
}

function drawCarpet(host, frame, box) {
  const { live, ghost, setting, reading } = frame;
  const { w, H, inner } = box;
  const id = setting.shade;
  const def = SERIES_BY_ID[id];
  const change = Boolean(frame.change && ghost);
  const grid = change ? carpetChange(live, ghost, id) : carpetGrid(live, id);
  const days = grid.days;
  const cw = inner.w / days.length;
  const ch = inner.h / 24;
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  // One path per bin, made of rectangle subpaths: nine or eleven nodes for a year.
  const paths = grid.bins.map(() => []);
  days.forEach((_, col) => {
    for (let h = 0; h < 24; h += 1) {
      const b = grid.cells[col * 24 + h];
      if (b < 0) continue;
      // Hour 0 at the top, so a day reads downwards as a clock does.
      paths[b].push(`M${(PAD.l + col * cw).toFixed(2)} ${(PAD.t + h * ch).toFixed(2)}h${(cw + 0.3).toFixed(2)}v${(ch + 0.3).toFixed(2)}h${(-cw - 0.3).toFixed(2)}z`);
    }
  });
  paths.forEach((d, b) => {
    if (!d.length) return;
    const { fill, opacity } = binFill(b, grid);
    root.append(svg('path', { d: d.join(''), fill, 'fill-opacity': opacity.toFixed(2), stroke: 'none' }));
  });

  // Hours of the day down the side, months along the bottom.
  const axes = svg('g', { fill: 'var(--ink-3)', 'font-family': 'var(--mono)', 'font-size': 9.5 });
  for (const h of [0, 6, 12, 18, 24]) {
    const t = svg('text', { x: PAD.l - 8, y: PAD.t + h * ch + 3, 'text-anchor': 'end' });
    t.textContent = `${String(h).padStart(2, '0')}:00`;
    axes.append(t);
  }
  // Each month is lettered in its own band, and falls back to its initial and
  // then to nothing when the band is too narrow, as the time series' months do.
  const monthBands = [];
  days.forEach((d, col) => {
    if (monthBands.at(-1)?.month === d.month) monthBands.at(-1).end = col;
    else monthBands.push({ month: d.month, start: col, end: col });
  });
  const lettered = [];
  for (const band of monthBands) {
    const x = PAD.l + band.start * cw;
    axes.append(svg('line', { x1: x, y1: PAD.t + inner.h, x2: x, y2: PAD.t + inner.h + 12, stroke: 'var(--rule)', 'stroke-width': 1 }));
    const t = svg('text', { x: x + 2, y: H - 4, 'font-family': 'var(--cond)', 'letter-spacing': '0.12em', 'font-size': 9 });
    const name = MONTHS[band.month - 1].toUpperCase();
    t.textContent = name;
    axes.append(t);
    lettered.push({ t, band: (band.end - band.start + 1) * cw - 3, short: name[0] });
  }
  root.append(axes);

  // Weekends and holidays, by tick length as well as ink: short for a weekend,
  // tall for a holiday, read from `Site Day Type Index` (1 Sunday, 7 Saturday,
  // 8 holiday).
  const dayType = live.daily.get('dayType');
  if (dayType) {
    const byDay = new Map(live.dailyStamps.map((st, i) => [`${st.env}:${st.month}:${st.day}`, dayType[i]]));
    let ticks = '';
    let holidays = '';
    days.forEach((d, col) => {
      const kind = byDay.get(`${d.env}:${d.month}:${d.day}`);
      const x = (PAD.l + (col + 0.5) * cw).toFixed(2);
      if (kind === 1 || kind === 7) ticks += `M${x} ${PAD.t + inner.h + 2}v3`;
      else if (kind === 8) holidays += `M${x} ${PAD.t + inner.h + 2}v8`;
    });
    root.append(svg('path', { d: ticks, stroke: 'var(--ink-3)', 'stroke-width': Math.max(0.6, cw * 0.6) }));
    root.append(svg('path', { d: holidays, stroke: 'var(--redline)', 'stroke-width': Math.max(1, cw) }));
  }

  // The legend, in the right gutter: every bin's range, lettered.
  const kind = change ? KINDS.temperatureDifference : def.kind;
  const key = svg('g', { 'font-family': 'var(--mono)', 'font-size': 8.5, fill: 'var(--ink-2)' });
  const rows = grid.bins.length;
  const step = Math.min(14, inner.h / (rows + 1));
  const head = svg('text', { x: w - PAD.r + 8, y: PAD.t + 6, 'font-family': 'var(--cond)', 'letter-spacing': '0.1em', fill: 'var(--ink-3)' });
  head.textContent = suffixIn(kind);
  key.append(head);
  // Each bound to the fewest decimals, at most two, at which no two edges
  // letter alike in the system showing, and never as "-0". Lettered to whole
  // units, nine bins over a 20 to 26 °C zone read "21…21" twice, and the change
  // carpet after a small drag read "-0…-0" in half its rows.
  const edges = [grid.bins[0].from, ...grid.bins.map((bin) => bin.to)];
  const edge = (v, places) => unsignedZero(figureIn(kind, v, { digits: places, ipDigits: places }));
  let places = 0;
  while (places < 2 && new Set(edges.map((v) => edge(v, places))).size < edges.length) places += 1;
  const legendTexts = [];
  grid.bins.forEach((bin, b) => {
    const y = PAD.t + 10 + (rows - 1 - b) * step;
    const { fill, opacity } = binFill(b, grid);
    key.append(svg('rect', { x: w - PAD.r + 8, y, width: 8, height: step - 2, fill, 'fill-opacity': opacity.toFixed(2), stroke: 'var(--rule)', 'stroke-width': 0.5 }));
    const t = svg('text', { x: w - PAD.r + 20, y: y + step - 4 });
    t.textContent = `${edge(bin.from, places)}…${edge(bin.to, places)}`;
    key.append(t);
    legendTexts.push(t);
  });
  root.append(key);

  // The reading hour, in the armed square idiom, on its cell.
  let at = null;
  if (reading) {
    days.forEach((d, col) => d.hours.forEach((i, h) => {
      if (i === reading.at) at = { col, h };
    }));
    if (at) {
      root.append(svg('rect', {
        x: PAD.l + at.col * cw - 2, y: PAD.t + at.h * ch - 2, width: cw + 4, height: ch + 4,
        fill: 'none', stroke: reading.held ? 'var(--redline)' : 'var(--ink)', 'stroke-width': 1.2,
      }));
    }
  }

  // The extremes, in the sheet's units, `was → now` whenever a ghost stands, in either state.
  const plain = carpetGrid(live, id);
  const was = ghost ? carpetGrid(ghost, id) : null;
  const sayT = (v) => letter(def.kind, v, { digits: 1 });
  const readout = [
    { label: 'Lowest', value: pair(plain.min, was?.min, sayT) },
    { label: 'Highest', value: pair(plain.max, was?.max, sayT) },
  ];
  if (change) {
    // One decimal in both systems (the kind reads whole Δ°F by default, which
    // lettered a 0.4 K change as "+1"), and no sign on a change that rounds to
    // nothing.
    const sayD = (v) => {
      const text = unsignedZero(letter(KINDS.temperatureDifference, v, { digits: 1, ipDigits: 1 }));
      return v > 0 && !ZERO.test(text) ? `+${text}` : text;
    };
    readout.push({ label: 'Change', value: `${sayD(grid.min)} to ${sayD(grid.max)}` });
  }
  // FR-019: an hour the carpet has no cell for, such as a design-day hour, is
  // said, not dropped.
  if (reading && !at) {
    readout.push({ label: 'Reading hour', value: stampText(live.points, reading.at), note: 'outside the days drawn' });
  }
  readout.push({ label: 'Ticks', value: null, note: 'short for weekends, tall for holidays' });
  frame.readout = readout;
  root.setAttribute(
    'aria-label',
    `Carpet of ${change ? 'the change in ' : ''}${def.name}: hour of day down, day of the run across, in ${grid.bins.length} ` +
      `lettered bins. ${readout.slice(0, 2).map((r) => `${r.label} ${spoken(r)}`).join(', ')}.` +
      (reading ? ` The desk's meters are ${reading.held ? 'held at' : 'reading at'} ${stampText(live.points, reading.at)}.` : ''),
  );
  host.append(root);
  fitLabels(lettered);
  // Two decimals can overrun the gutter; such a bound is set to the gutter's
  // width rather than clipped at the plate's edge.
  const room = PAD.r - 22;
  for (const t of legendTexts) {
    if (t.getComputedTextLength() > room) {
      t.setAttribute('textLength', room);
      t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  }

  const field = {
    root,
    n: live.points.length,
    snap: false,
    pick(clientX, clientY) {
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const px = (clientX - r.left) * (w / r.width);
      const py = (clientY - r.top) * (H / r.height);
      const col = Math.floor((px - PAD.l) / cw);
      const h = Math.floor((py - PAD.t) / ch);
      if (col < 0 || col >= days.length || h < 0 || h > 23) return null;
      const i = days[col].hours[h];
      return i >= 0 ? i : null;
    },
    steps: () => drawnRange(assessedHours(live)),
  };
  host.classList.toggle('pickable', Boolean(reading));
  return reading ? field : null;
}

/* ══ the duration curve (US5) ════════════════════════════════════════════ */

function drawDuration(host, frame, box) {
  const { live, ghost, setting, reading, datums } = frame;
  const { w, H, inner } = box;
  const drawn = setting.series.filter((id) => live.series.has(id));
  const curves = new Map(drawn.map((id) => [id, durationCurve(assessedValues(live, id))]));
  const ghosts = ghost ? drawn.filter((id) => SERIES_BY_ID[id].zone && ghost.series.has(id)).map((id) => [id, durationCurve(assessedValues(ghost, id))]) : [];
  const n = Math.max(1, ...[...curves.values()].map((c) => c.length));
  const all = [...curves.values(), ...ghosts.map(([, c]) => c)];
  let lo = Math.min(...datums.map((d) => d.value));
  let hi = Math.max(...datums.map((d) => d.value));
  for (const c of all) if (c.length) { lo = Math.min(lo, c[c.length - 1]); hi = Math.max(hi, c[0]); }
  const span = (hi - lo) || 1;
  const yDomain = [lo - span * 0.08, hi + span * 0.1];
  const s = scales(box, [0, n], yDomain);
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  scatterAxes(root, box, s, { xDomain: [0, n], yDomain, xKind: KINDS.count, yKind: KINDS.temperature, xName: 'Hours at or above', yName: 'Temperature' });
  drawDatums(root, datums, s.y, w - PAD.r);
  const path = (c) => {
    const step = Math.max(1, Math.floor(c.length / (inner.w * 2)));
    let d = '';
    for (let r = 0; r < c.length; r += step) d += `${d ? 'L' : 'M'}${s.x(r + 1).toFixed(1)},${s.y(c[r]).toFixed(1)}`;
    return d + `L${s.x(c.length).toFixed(1)},${s.y(c[c.length - 1]).toFixed(1)}`;
  };
  for (const [id, c] of ghosts) {
    root.append(svg('path', { d: path(c), fill: 'none', stroke: PENS[id].stroke, 'stroke-width': 1.1, opacity: 0.34 }));
  }
  for (const id of drawn) {
    const pen = PENS[id];
    root.append(svg('path', { d: path(curves.get(id)), fill: 'none', stroke: pen.stroke, 'stroke-width': pen.width, 'stroke-dasharray': pen.dash }));
  }
  // The reading hour's rank on each curve (US5 scenario 3).
  if (reading) {
    for (const id of drawn) {
      const v = live.series.get(id)[reading.at];
      if (!Number.isFinite(v)) continue;
      const rank = hoursAtOrAbove(curves.get(id), v);
      root.append(readingSquare(s.x(rank), s.y(v), reading.held));
    }
  }
  // The cursor, set by tap, click or key, and lettered for every drawn series.
  const cursor = Math.min(n, Math.max(1, frame.cursor ?? Math.round(n / 10)));
  const cx = s.x(cursor);
  root.append(svg('line', { x1: cx, y1: PAD.t, x2: cx, y2: PAD.t + inner.h, stroke: 'var(--ink)', 'stroke-width': 1, 'stroke-dasharray': '2 2', 'pointer-events': 'none' }));
  const readout = [];
  for (const id of drawn) {
    const c = curves.get(id);
    if (!c.length) continue;
    const v = c[Math.min(c.length, cursor) - 1];
    const count = hoursAtOrAbove(c, v);
    readout.push({ label: SERIES_BY_ID[id].label, value: `${letter(KINDS.temperature, v, { digits: 1 })} · ${hoursText(count)}`, note: 'at or above' });
  }
  const labels = drawn.map((id) => ({ text: SERIES_BY_ID[id].label, y: s.y(curves.get(id)[Math.floor(curves.get(id).length / 2)] ?? 0), fill: PENS[id].label }));
  gutterLabels(root, labels, box);
  frame.readout = readout;
  root.setAttribute(
    'aria-label',
    `Duration curve of ${listedNames(drawn)}, each sorted from highest to lowest against hours. ` +
      `${readout.map((r) => `${r.label} ${spoken(r)}`).join('; ')}.`,
  );
  host.append(root);
  const field = {
    root,
    n,
    snap: false,
    cursor: true,
    current: cursor,
    pick(clientX) {
      const r = root.getBoundingClientRect();
      if (!r.width) return null;
      const px = (clientX - r.left) * (w / r.width);
      const rank = Math.round(((px - PAD.l) / inner.w) * n);
      return rank < 1 || rank > n ? null : rank;
    },
    steps: (at) => ({ min: 1, max: n, at }),
  };
  host.classList.add('pickable');
  return field;
}

const listedNames = (ids) => {
  const words = ids.map((id) => SERIES_BY_ID[id].name);
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
};

/** Labels in the right gutter, settled top to bottom against a minimum gap, as the time series does. */
function gutterLabels(root, labels, { w, inner }) {
  labels.sort((a, b) => a.y - b.y);
  for (const [i, l] of labels.entries()) if (i > 0) l.y = Math.max(l.y, labels[i - 1].y + 11.5);
  for (const l of labels) {
    const t = svg('text', {
      x: w - PAD.r + 8, y: Math.max(PAD.t + 4, Math.min(l.y + 3.5, PAD.t + inner.h)),
      fill: l.fill, opacity: l.opacity ?? 1,
      'font-family': 'var(--cond)', 'font-size': 10, 'letter-spacing': '0.11em', 'font-weight': 500,
    });
    t.textContent = l.text.toUpperCase();
    root.append(t);
  }
}

/* ══ the average day (US6) ═══════════════════════════════════════════════ */

function drawAverageDay(host, frame, box) {
  const { live, ghost, setting, reading, datums } = frame;
  const { w, H } = box;
  const drawn = setting.series.filter((id) => live.series.has(id));
  const profiles = new Map(drawn.map((id) => [id, averageDay(live, id)]));
  const ghosts = ghost ? drawn.filter((id) => SERIES_BY_ID[id].zone && ghost.series.has(id)).map((id) => [id, averageDay(ghost, id)]) : [];
  const values = [];
  for (const m of [...profiles.values(), ...ghosts.map(([, p]) => p)]) for (const p of m.values()) values.push(...p);
  let lo = Math.min(...datums.map((d) => d.value));
  let hi = Math.max(...datums.map((d) => d.value));
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = (hi - lo) || 1;
  const yDomain = [lo - span * 0.08, hi + span * 0.1];
  const s = scales(box, [0, 23], yDomain);
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  scatterAxes(root, box, s, { xDomain: [0, 23], yDomain, xKind: KINDS.count, yKind: KINDS.temperature, xName: 'Hour of day', yName: 'Mean' });
  drawDatums(root, datums, s.y, w - PAD.r);
  const line = (p) => {
    let d = '';
    p.forEach((v, h) => { if (Number.isFinite(v)) d += `${d ? 'L' : 'M'}${s.x(h).toFixed(1)},${s.y(v).toFixed(1)}`; });
    return d;
  };
  for (const [id, byMonth] of ghosts) {
    for (const p of byMonth.values()) root.append(svg('path', { d: line(p), fill: 'none', stroke: PENS[id].stroke, 'stroke-width': 1, opacity: 0.25 }));
  }
  const labels = [];
  for (const id of drawn) {
    const pen = PENS[id];
    for (const [month, p] of profiles.get(id)) {
      root.append(svg('path', { d: line(p), fill: 'none', stroke: pen.stroke, 'stroke-width': 1.1, 'stroke-dasharray': pen.dash, opacity: 0.8 }));
      if (id === drawn[0]) labels.push({ text: MONTHS[month - 1], y: s.y(p[23]), fill: pen.label });
    }
  }
  gutterLabels(root, labels, box);
  // A single hour cannot be placed on an averaged day, so the reading hour is
  // marked at its month and hour of day instead (FR-019, US6 scenario 2).
  const readout = [{ label: 'Reading hour', value: null, note: 'cannot be placed on an averaged day' }];
  if (reading) {
    const t = live.points[reading.at].timestamp;
    const h = (t.hour + 23) % 24;
    const p = profiles.get(drawn[0])?.get(t.month);
    if (p && Number.isFinite(p[h])) {
      root.append(readingSquare(s.x(h), s.y(p[h]), reading.held));
      // The axis counts hours from midnight and EnergyPlus stamps an hour by
      // its end, so the mark at `h` is the hour from h:00 to t.hour:00; lettered
      // by its end alone it read one hour right of where it stood.
      const hh = (n) => `${String(n).padStart(2, '0')}:00`;
      readout.push({ label: 'Marked at', value: `${MONTHS[t.month - 1]}, ${hh(h)} to ${hh(t.hour)}` });
    }
  }
  readout.push({ label: 'Months', value: `${profiles.get(drawn[0])?.size ?? 0} covered` });
  frame.readout = readout;
  root.setAttribute(
    'aria-label',
    `Average day of ${listedNames(drawn)}: the mean of each hour of the day, one profile per month the run covers ` +
      `(${[...(profiles.get(drawn[0])?.keys() ?? [])].map((m) => MONTHS[m - 1]).join(', ')}). A single hour cannot be placed on an averaged day.`,
  );
  host.append(root);
  host.classList.remove('pickable');
  return null;
}

/* ══ the energy signature (US7) ══════════════════════════════════════════ */

function drawSignature(host, frame, box) {
  const { live, ghost } = frame;
  const { w, H } = box;
  const sig = dailySignature(live);
  const was = ghost && ghost.has('heat') && ghost.has('cool') ? dailySignature(ghost) : null;
  const t = sig.days.map((d) => d.tOut);
  const e = sig.days.flatMap((d) => [d.heat, d.cool]);
  const xDomain = reach([-10, 30], t);
  const yDomain = reach([0, 10], e);
  const s = scales(box, xDomain, yDomain);
  const root = svg('svg', { viewBox: `0 0 ${w} ${H}`, width: '100%', height: H, role: 'img' });
  scatterAxes(root, box, s, { xDomain, yDomain, xKind: KINDS.temperature, yKind: KINDS.energy, xName: 'Daily mean outdoor', yName: 'Daily demand' });
  if (was) {
    const gx = [];
    const gy = [];
    for (const d of was.days) { gx.push(s.x(d.tOut), s.x(d.tOut)); gy.push(s.y(d.heat), s.y(d.cool)); }
    root.append(outline(Float64Array.from(gx), Float64Array.from(gy), s.box));
  }
  const xs = Float64Array.from(sig.days, (d) => s.x(d.tOut));
  root.append(marks(xs, Float64Array.from(sig.days, (d) => s.y(d.heat)), { ink: 'var(--warm)', cap: 'round', opacity: 0.7, width: 3.2 }));
  root.append(marks(xs, Float64Array.from(sig.days, (d) => s.y(d.cool)), { ink: 'var(--cold)', cap: 'square', opacity: 0.7, width: 3.2 }));
  legend(root, [
    { text: 'Heating', ink: 'var(--warm)', cap: 'round' },
    { text: 'Cooling', ink: 'var(--cold)', cap: 'square' },
  ], box);
  // Grouped as the bill groups its kWh, so the two totals can be read against it.
  const say = (v) => `${Number(figureIn(KINDS.energy, v, { digits: 0, ipDigits: 0 })).toLocaleString('en-US')} ${suffixIn(KINDS.energy)}`;
  const readout = [
    { label: 'Heating', value: pair(sig.heat, was?.heat, say) },
    { label: 'Cooling', value: pair(sig.cool, was?.cool, say) },
    { label: 'Reading hour', value: null, note: 'cannot be placed on a daily total' },
  ];
  frame.readout = readout;
  root.setAttribute(
    'aria-label',
    `Energy signature: daily heating (circles) and cooling (squares) demand against daily mean outdoor temperature, ` +
      `one mark per day. Heating ${readout[0].value}, cooling ${readout[1].value} over the run. A single hour cannot be placed.`,
  );
  host.append(root);
  host.classList.remove('pickable');
  return null;
}

/* ══ the renderers, one per view ═════════════════════════════════════════ */

const RENDERERS = Object.freeze({
  ts: drawTimeSeries,
  psy: drawPsychrometric,
  adp: drawAdaptive,
  crp: drawCarpet,
  dur: drawDuration,
  avg: drawAverageDay,
  sig: drawSignature,
});

/**
 * The list of views and the list of renderers are one list. A view with no
 * renderer would be offered and then crash the plate; a renderer with no view
 * is dead code a link could never reach.
 */
{
  const views = VIEWS.map((v) => v.id);
  const drawn = Object.keys(RENDERERS);
  const missing = views.filter((id) => !drawn.includes(id));
  const orphan = drawn.filter((id) => !views.includes(id));
  if (missing.length) throw new Error(`plate.js draws no ${missing.join(', ')}, which views.js offers`);
  if (orphan.length) throw new Error(`plate.js draws ${orphan.join(', ')}, which views.js does not offer`);
}

/* ══ the range preview, beneath the time series (FR-018a to FR-018d) ════ */

// The preview's height, and its field inside it: the month names go under.
const RANGE_H = 56;
const RANGE_PAD = { t: 4, b: 18 };
// The break between two run periods, so January and July never read as one
// stretch of days.
const RANGE_GAP = 8;
// A step of Page Up or Page Down, in days.
const RANGE_PAGE = 7;
// A slider's keys: the plate's own, and Up and Down, which a slider also takes.
const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageDown', 'PageUp', 'Home', 'End']);

/**
 * Where each host's preview stands: the frame it was last drawn from, its
 * layout, the range as last previewed (ahead of the redraw that letters it)
 * and any drag in progress. Read by listeners attached once per host, which
 * is why they sit on the host and not on the drawing a redraw replaces.
 */
const ranges = new WeakMap();

/**
 * The whole run at daily means, with two handles and a window over the range
 * the time series draws at every hour (FR-018a). Its own drawing: no ghost,
 * no design days, no aggregation, and a tick where the reading hour stands
 * (FR-018b). Shown only under the time series of a run with weather-file days.
 */
export function drawRangePreview(host, frame) {
  const { live, setting } = frame;
  const shown = setting.view === 'ts' && Boolean(live?.facts.weatherDays) && rangeSegments(live).length > 0;
  host.hidden = !shown;
  if (!shown) {
    host.textContent = '';
    ranges.delete(host);
    return;
  }
  const had = host.contains(document.activeElement) ? (document.activeElement.dataset?.focus ?? null) : null;
  const segments = rangeSegments(live);
  // Drawn at the width it is given, as the plate is: a floor wider than the
  // 282px a phone leaves scales the drawing off the handles placed over it.
  const w = Math.max(host.clientWidth - 32, 120);
  const total = segments.reduce((n, s) => n + s.days, 0);
  const dw = (w - PAD.l - PAD.r - RANGE_GAP * (segments.length - 1)) / total;
  // Each segment's place along the run's days, gaps left out, and its x.
  let before = 0;
  const placed = segments.map((s, k) => {
    const at = { segment: s, before, x: PAD.l + before * dw + k * RANGE_GAP };
    before += s.days;
    return at;
  });
  const placeOf = (day) => placed.find((p) => p.segment.holds(day));
  const xOf = (day) => {
    const p = placeOf(day);
    return p.x + (day - p.segment.from) * dw;
  };
  const top = RANGE_PAD.t;
  const h = RANGE_H - RANGE_PAD.t - RANGE_PAD.b;

  const root = svg('svg', { viewBox: `0 0 ${w} ${RANGE_H}`, width: '100%', height: RANGE_H, 'aria-hidden': 'true' });
  const drawn = setting.series.filter((id) => live.series.has(id));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of segments) for (const id of drawn) for (const v of s.means.get(id)) if (Number.isFinite(v)) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  const y = (v) => top + h - 2 - ((v - lo) / span) * (h - 4);
  for (const p of placed) {
    root.append(svg('rect', {
      x: p.x, y: top, width: p.segment.days * dw, height: h,
      fill: 'var(--inset)', stroke: 'var(--rule)', 'stroke-width': 1, 'shape-rendering': 'crispEdges',
    }));
  }
  // The daily means, broken at a day with no hour to average and between
  // periods, in the pens the time series uses so each curve is the same one.
  for (const id of drawn) {
    let d = '';
    for (const p of placed) {
      let open = false;
      p.segment.means.get(id).forEach((v, k) => {
        if (!Number.isFinite(v)) { open = false; return; }
        d += `${open ? 'L' : 'M'}${(p.x + (k + 0.5) * dw).toFixed(2)},${y(v).toFixed(2)}`;
        open = true;
      });
    }
    root.append(svg('path', {
      d, fill: 'none', stroke: PENS[id].stroke, 'stroke-width': 1,
      'stroke-dasharray': PENS[id].dash, 'stroke-linejoin': 'round',
    }));
  }
  // Month names under the field, where a month is wide enough to carry one.
  for (const p of placed) {
    for (let day = p.segment.from; day <= p.segment.to;) {
      const { month } = dateOfDay(day);
      let end = day;
      while (end + 1 <= p.segment.to && dateOfDay(end + 1).month === month) end += 1;
      const x0 = xOf(day);
      const x1 = xOf(end) + dw;
      if (day > p.segment.from) {
        root.append(svg('line', {
          x1: x0, y1: top + h, x2: x0, y2: top + h + 3,
          stroke: 'var(--rule-firm)', 'stroke-width': 1, 'shape-rendering': 'crispEdges',
        }));
      }
      // The month's initial where its name does not fit, as on the chart.
      if (x1 - x0 >= 8) {
        const t = svg('text', {
          x: (x0 + x1) / 2, y: RANGE_H - 5, 'text-anchor': 'middle',
          fill: 'var(--ink-3)', 'font-family': 'var(--cond)', 'font-size': 9, 'letter-spacing': '0.12em',
        });
        const name = MONTHS[month - 1].toUpperCase();
        t.textContent = x1 - x0 >= 22 ? name : name[0];
        root.append(t);
      }
      day = end + 1;
    }
  }
  // The reading hour, at its hour within its day, in the marker's own inks.
  const at = frame.reading?.at;
  if (at != null && segments.some((s) => at >= s.start && at <= s.end)) {
    const t = live.points[at].timestamp;
    const rx = xOf(dayOfYear(t)) + ((hourIndex(t) + 0.5) / 24) * dw;
    root.append(svg('line', {
      x1: rx, y1: top, x2: rx, y2: top + h,
      stroke: frame.reading.held ? 'var(--redline)' : 'var(--ink-ghost)', 'stroke-width': 1,
      'stroke-dasharray': frame.reading.held ? null : '2 2', 'shape-rendering': 'crispEdges',
    }));
  }

  // What is shown: the zoom, or on the whole run every period end to end.
  const zoom = setting.zoom && zoomSpan(live, setting.zoom) ? setting.zoom : null;
  const range = zoom ?? { from: segments[0].from, to: segments.at(-1).to };
  // Outside the range is veiled, so the window reads as the part held.
  const left = zoom ? xOf(range.from) : PAD.l;
  const right = zoom ? xOf(range.to) + dw : w - PAD.r;
  for (const p of placed) {
    const a = p.x;
    const b = p.x + p.segment.days * dw;
    for (const [x0, x1] of [[a, Math.min(b, left)], [Math.max(a, right), b]]) {
      if (x1 - x0 > 0.01) root.append(svg('rect', { x: x0, y: top, width: x1 - x0, height: h, fill: 'var(--sheet)', 'fill-opacity': 0.62 }));
    }
  }
  host.textContent = '';
  host.append(root);

  // The handles and the window: blocks over the drawing, each a slider, at
  // the drawing's own scale whatever width the host lays it out at.
  const across = (x) => `calc(16px + (100% - 32px) * ${(x / w).toFixed(5)})`;
  const first = segments[0].from;
  const last = segments.at(-1).to;
  const slider = (part, label, now, text, x0, x1) => {
    const el = html('div', {
      class: part === 'window' ? `range-window${zoom ? '' : ' whole'}` : 'range-handle',
      role: 'slider',
      tabindex: '0',
      'aria-label': label,
      'aria-valuemin': String(first),
      'aria-valuemax': String(last),
      'aria-valuenow': String(now),
      'aria-valuetext': text,
      'data-part': part,
      'data-focus': `range:${part}`,
    });
    el.style.left = across(x0);
    if (x1 !== undefined) el.style.width = `calc((100% - 32px) * ${((x1 - x0) / w).toFixed(5)})`;
    el.style.top = `${2 + top}px`;
    el.style.height = `${h}px`;
    return el;
  };
  host.append(
    slider('window', 'Range shown', range.from, zoom ? zoomText(range) : 'the whole run', left, right),
    slider('from', 'Range start', range.from, dayText(range.from), left),
    slider('to', 'Range end', range.to, dayText(range.to), right),
  );

  const state = ranges.get(host);
  ranges.set(host, { frame, w, dw, placed, zoom, drag: state?.drag ?? null, keyed: state?.keyed ?? false });
  wireRange(host);
  if (had) host.querySelector(`[data-focus="${CSS.escape(had)}"]`)?.focus();
}

/** Position along the run's days, gaps left out, of a client x: continuous, clamped to the run. */
function positionAt(host, clientX) {
  const { w, dw, placed } = ranges.get(host);
  const box = host.querySelector('svg').getBoundingClientRect();
  const px = (clientX - box.left) * (w / (box.width || w));
  // A point in a gap belongs to the nearer period's edge.
  let best = placed[0];
  for (const p of placed) if (px >= p.x - RANGE_GAP / 2) best = p;
  const k = Math.min(best.segment.days, Math.max(0, (px - best.x) / dw));
  return best.before + k;
}

/** The day at a whole position along the run's days, clamped to the run. */
function dayAtPosition(host, position) {
  const { placed } = ranges.get(host);
  const total = placed.at(-1).before + placed.at(-1).segment.days;
  const k = Math.min(total - 1, Math.max(0, position));
  const p = placed.findLast((q) => q.before <= k);
  return p.segment.from + (k - p.before);
}

const positionOf = (host, day) => {
  const p = ranges.get(host).placed.find((q) => q.segment.holds(day));
  return p.before + (day - p.segment.from);
};

const sameZoom = (a, b) => (a === null ? b === null : b !== null && a.from === b.from && a.to === b.to);

/** Show a range without writing it: a step of a drag or a held key (FR-018c). */
function previewRange(host, zoom) {
  const state = ranges.get(host);
  if (sameZoom(zoom, state.zoom)) return false;
  state.zoom = zoom;
  state.frame.on.preview(settingFor(state.frame.setting, { zoom }));
  return true;
}

/** Commit the range shown: the one write of the link a gesture makes. */
function commitRange(host) {
  const state = ranges.get(host);
  state.frame.on.choose(settingFor(state.frame.setting, { zoom: state.zoom }));
}

const wired = new WeakSet();
function wireRange(host) {
  if (wired.has(host)) return;
  wired.add(host);

  host.addEventListener('pointerdown', (event) => {
    const state = ranges.get(host);
    if (!state || event.button !== 0) return;
    const part = event.target.closest?.('[data-part]')?.dataset.part ?? null;
    const zoom = state.zoom;
    const live = state.frame.live;
    if (part === 'window' && !zoom) return;
    event.preventDefault();
    const at = positionAt(host, event.clientX);
    if (!part) {
      // A tap beside the window moves it there, centred where it can be.
      if (!zoom) return;
      const day = dayAtPosition(host, Math.floor(at));
      const length = zoom.to - zoom.from + 1;
      const into = state.placed.find((p) => p.segment.holds(day)).segment;
      if (previewRange(host, moveRange(live, zoom, 'window', Math.max(into.from, day - Math.floor(length / 2))))) commitRange(host);
      return;
    }
    const range = zoom ?? { from: state.placed[0].segment.from, to: state.placed.at(-1).segment.to };
    const anchor = part === 'to' ? positionOf(host, range.to) + 1 : positionOf(host, range.from);
    state.drag = { pointerId: event.pointerId, part, zoom, anchor, at, moved: false };
    // An enhancement, never the gate (system.md, "Drag bindings"): the drag
    // is the flag above, and capture can be declined with a throw.
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // Declined: the drag still follows the pointer while it stays over the preview.
    }
    host.classList.add('dragging');
    event.target.closest('[data-part]').focus({ preventScroll: true });
  });

  host.addEventListener('pointermove', (event) => {
    const state = ranges.get(host);
    const drag = state?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = Math.round(drag.anchor + positionAt(host, event.clientX) - drag.at);
    const day = dayAtPosition(host, drag.part === 'to' ? moved - 1 : moved);
    // Snapped to whole days by `moveRange`; the plate redraws only when the
    // day changes, never on every pixel of the pointer.
    if (previewRange(host, moveRange(state.frame.live, drag.zoom, drag.part, day))) drag.moved = true;
  });

  const release = (event) => {
    const state = ranges.get(host);
    const drag = state?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    state.drag = null;
    host.classList.remove('dragging');
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (drag.moved && !sameZoom(state.zoom, drag.zoom)) commitRange(host);
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);

  // The keyboard's way to the same range: Left and Right one day, Page Up and
  // Page Down a week, Home and End to the run's ends. Shown on each step and
  // written on the key's release, as the plate's own hour is: a held arrow
  // repeats at about 30 Hz, and WebKit throws on the 101st `replaceState`
  // within ten seconds.
  host.addEventListener('keydown', (event) => {
    const state = ranges.get(host);
    const part = event.target.closest?.('[data-part]')?.dataset.part;
    if (!state || !part || !RANGE_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const zoom = state.zoom;
    if (part === 'window' && !zoom) return;
    const first = state.placed[0].segment;
    const last = state.placed.at(-1).segment;
    const range = zoom ?? { from: first.from, to: last.to };
    const length = range.to - range.from + 1;
    const now = part === 'to' ? range.to : range.from;
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -RANGE_PAGE, PageUp: RANGE_PAGE }[event.key];
    let day;
    if (event.key === 'Home') day = first.from;
    else if (event.key === 'End') day = part === 'window' ? Math.max(last.from, last.to - length + 1) : last.to;
    else day = now + step;
    // Asked of the map again: a redraw drawn at once, as a hidden tab draws
    // it, has replaced the state this handler began with.
    if (previewRange(host, moveRange(state.frame.live, zoom, part, day))) ranges.get(host).keyed = true;
  });
  host.addEventListener('keyup', (event) => {
    const state = ranges.get(host);
    if (!state?.keyed || !RANGE_KEYS.has(event.key)) return;
    state.keyed = false;
    commitRange(host);
  });
}

/* ══ the chooser and the readout, beneath the field ══════════════════════ */

/**
 * The view chooser (FR-001, FR-004). Every view is listed; one the run cannot
 * support stays in the list, `aria-disabled`, with its reason lettered under
 * it in view rather than in a tooltip, and choosing it draws the reason on the
 * plate rather than another view (SC-005).
 */
export function drawChooser(host, frame) {
  // Rebuilt only when something it shows has changed, and the keyboard is
  // handed back when it is. `renderTrace` runs on every drag frame, key step,
  // solve, resize and unit switch; a rebuild on each one detached the focused
  // control, so focus fell to the body after every choice, and it shut an
  // open citation and an open day list under the reader. `renderWhen` hands
  // focus back for the same reason.
  const key = JSON.stringify([
    runId(frame.live),
    Boolean(frame.ghost),
    Boolean(frame.change),
    frame.note ?? null,
    frame.setting,
    frame.readout ?? [],
    frame.cite?.text ?? null,
  ]);
  if (key === chooserKey && host.childElementCount) return;
  chooserKey = key;
  const had = host.contains(document.activeElement) ? (document.activeElement.dataset?.focus ?? null) : null;
  host.textContent = '';
  const group = html('div', { class: 'plate-choice', role: 'radiogroup', 'aria-label': 'Plate view' });
  // An unavailable view keeps its place in the row, and its reason and remedy
  // are lettered once under the row for every view that shares them. Under
  // each name, a design-day run said "Needs a run over a weather file." four
  // times, and at 390px the row stood 330px tall for one sentence; the remedy
  // was not lettered at all (FR-004).
  const absent = new Map();
  for (const view of VIEWS) {
    const why = frame.live ? availabilityOf(view, frame.live) : { available: true };
    if (!why.available) {
      const text = [why.reason, why.remedy].filter(Boolean).join(' ');
      if (!absent.has(text)) absent.set(text, []);
      absent.get(text).push(view);
    }
  }
  const whyId = (text) => `plate-why-${[...absent.keys()].indexOf(text)}`;
  for (const view of VIEWS) {
    const why = frame.live ? availabilityOf(view, frame.live) : { available: true };
    const on = frame.setting.view === view.id;
    const button = html('button', {
      type: 'button',
      class: 'plate-view',
      role: 'radio',
      'aria-checked': String(on),
      'aria-disabled': why.available ? null : 'true',
      'data-view': view.id,
      'data-focus': `view:${view.id}`,
      'aria-describedby': why.available ? null : whyId([why.reason, why.remedy].filter(Boolean).join(' ')),
    });
    button.append(html('span', { class: 'plate-view-name' }, view.label));
    button.addEventListener('click', () => {
      if (!on) frame.on.choose(settingFor(frame.setting, { view: view.id }));
    });
    group.append(button);
  }
  host.append(group);
  if (absent.size) {
    const key = html('div', { class: 'plate-why' });
    for (const [text, views] of absent) {
      const line = html('p', { id: whyId(text) });
      line.append(html('span', { class: 'plate-why-names' }, views.map((v) => v.label).join(' · ')), ' ', text);
      key.append(line);
    }
    host.append(key);
  }
  drawOptions(host, frame);
  // A refusal or a release is in view until the next choice, never on hover.
  if (frame.note) host.append(html('p', { class: 'plate-note', role: 'status' }, frame.note));
  if (had) {
    // "Whole run" leaves the row once it has done its work, so its keyboard
    // goes to the range it released: the preview's window, which the caller
    // has drawn before this.
    const back = host.querySelector(`[data-focus="${CSS.escape(had)}"]`) ??
      (had === 'whole' ? document.querySelector('[data-focus="range:window"]') : null);
    back?.focus();
  }
}

/** A readout entry as a sentence fragment, for a field's `aria-label`: the figure and its note. */
const spoken = (r) => [r.value, r.note].filter(Boolean).join(' ');

/** Each run's identity as a number, for the chooser's key. */
const runIds = new WeakMap();
let runCount = 0;
const runId = (run) => {
  if (!run) return 0;
  if (!runIds.has(run)) runIds.set(run, (runCount += 1));
  return runIds.get(run);
};
let chooserKey = null;
// The citations the reader has opened, by their text, as `fold()` in
// `console.js` keeps the console's open folds: a rebuilt chooser opens them
// again rather than shutting them on the next solve.
const openCites = new Set();

/** The chosen view's own choices: its series, and whatever else it declares. */
function drawOptions(host, frame) {
  const view = VIEW_BY_ID[frame.setting.view];
  const row = html('div', { class: 'plate-options' });
  if (view.drawsSeries) drawSeriesToggles(row, frame);
  if (view.id === 'psy') drawRegionChoice(row, frame);
  if (view.id === 'adp') drawModelChoice(row, frame);
  if (view.id === 'crp') drawShadeChoice(row, frame);
  // Offered on a year run, and on any run the time series is aggregated on:
  // `pv=ts.a-d` loads on a design-day desk too, and without the grain choice
  // nothing on the page could set it back to the hour.
  if (view.id === 'ts' && frame.live && (frame.live.facts.weatherDays || frame.setting.aggregation !== 'h')) {
    drawTimeChoices(row, frame);
  }
  if (row.childElementCount) host.append(row);
  drawReadout(host, frame);
}

/**
 * What the view letters beside the field: its readings, then its citation in
 * place with the method in a fold (FR-005, FR-025). Readings, verdicts and
 * absences are never folded.
 */
function drawReadout(host, frame) {
  if (frame.readout?.length) {
    const p = html('p', { class: 'plate-readout' });
    // A figure is set in mono and a sentence is not. An absence arrives as
    // `— reason`, and its reason is prose like any other note: lettered in
    // the figure's bold mono it read as a measurement.
    for (const { label, value, note } of frame.readout) {
      const absent = typeof value === 'string' && value.startsWith('— ');
      const figure = absent ? '—' : value;
      const words = [absent ? value.slice(2) : null, note].filter(Boolean).join(' ');
      const item = html('span');
      item.append(label);
      if (figure) item.append(' ', html('b', {}, figure));
      if (words) item.append(' ', html('span', { class: 'plate-readout-note' }, words));
      p.append(item);
    }
    host.append(p);
  }
  if (frame.cite) {
    const { text } = frame.cite;
    const cite = html('details', { class: 'plate-cite' });
    cite.append(html('summary', { 'data-focus': 'cite' }, text));
    cite.append(html('p', {}, frame.cite.fold));
    cite.open = openCites.has(text);
    cite.addEventListener('toggle', () => {
      if (cite.open) openCites.add(text);
      else openCites.delete(text);
    });
    host.append(cite);
  }
}

/** A row of radio choices, each with its availability, for a view's own published model or region. */
function radioRow(row, frame, { legend, options, current, field }) {
  const group = html('fieldset', { class: 'plate-series' });
  group.append(html('legend', { class: 'plate-options-head' }, legend));
  const name = `plate-${field}`;
  for (const { value, label, why } of options) {
    const item = html('label', { class: 'plate-toggle' });
    const radio = html('input', { type: 'radio', name, value, disabled: why && !why.available, 'data-focus': `${field}:${value}` });
    radio.checked = current === value;
    radio.addEventListener('change', () => {
      if (radio.checked) frame.on.choose(settingFor(frame.setting, { [field]: value }));
    });
    item.append(radio, html('span', { class: 'plate-toggle-name' }, label));
    if (why && !why.available) item.append(html('span', { class: 'plate-view-why' }, [why.reason, why.remedy].filter(Boolean).join(' ')));
    group.append(item);
  }
  row.append(group);
}

function drawModelChoice(row, frame) {
  radioRow(row, frame, {
    legend: 'Model',
    field: 'model',
    current: frame.setting.model,
    options: ADAPTIVE_MODELS.map((m) => ({ value: m.id, label: m.label })),
  });
}

/** The carpet's one series, and its "change" toggle, offered only while a ghost stands (FR-020c). */
function drawShadeChoice(row, frame) {
  radioRow(row, frame, {
    legend: 'Shade by',
    field: 'shade',
    current: frame.setting.shade,
    options: SELECTABLE.map((id) => ({
      value: id,
      label: SERIES_BY_ID[id].label,
      why: frame.live && !frame.live.series.has(id) ? { available: false, reason: 'Not reported.' } : null,
    })),
  });
  if (frame.ghost) {
    const item = html('label', { class: 'plate-toggle' });
    const box = html('input', { type: 'checkbox', 'data-focus': 'change' });
    box.checked = Boolean(frame.change);
    box.addEventListener('change', () => frame.on.toggleChange());
    item.append(box, html('span', { class: 'plate-toggle-name' }, 'Change since the drag began'));
    row.append(item);
  }
}

/**
 * The time series' grain (FR-018): hourly, daily or monthly means, and the
 * one action back to the whole run while a range is drawn. The range itself
 * is set on the range preview beneath the plate (FR-018a), which replaced two
 * date lists: a drag is how a range is found by eye, and the preview's
 * handles are sliders, so it is still reachable by tap and by keyboard. The
 * drag on the plate stays the hour's.
 */
function drawTimeChoices(row, frame) {
  radioRow(row, frame, {
    legend: 'Each point',
    field: 'aggregation',
    current: frame.setting.aggregation,
    options: [
      { value: 'h', label: 'Hour' },
      { value: 'd', label: 'Day mean' },
      { value: 'm', label: 'Month mean' },
    ],
  });
  const zoom = frame.setting.zoom;
  if (!zoom || !frame.live.facts.weatherDays) return;
  const group = html('fieldset', { class: 'plate-series' });
  group.append(html('legend', { class: 'plate-options-head' }, 'Range'));
  group.append(html('span', { class: 'plate-toggle' }, zoomText(zoom)));
  const back = html('button', { type: 'button', class: 'link', 'data-focus': 'whole' }, 'Whole run');
  back.addEventListener('click', () => frame.on.choose(settingFor(frame.setting, { zoom: null })));
  group.append(back);
  row.append(group);
}

function drawRegionChoice(row, frame) {
  radioRow(row, frame, {
    legend: 'Region',
    field: 'region',
    current: frame.setting.region,
    options: [
      { value: 'g', label: REGIONS.graphic.label },
      { value: 'a', label: REGIONS.adaptive.label, why: frame.live ? availabilityOf(REGION_NEEDS.a, frame.live) : null },
    ],
  });
}

function drawSeriesToggles(row, frame) {
  const { setting, live } = frame;
  const group = html('fieldset', { class: 'plate-series' });
  group.append(html('legend', { class: 'plate-options-head' }, 'Series'));
  for (const id of SELECTABLE) {
    const def = SERIES_BY_ID[id];
    const on = setting.series.includes(id);
    const reported = !live || live.series.has(id);
    const label = html('label', { class: 'plate-toggle', 'data-series': id });
    const box = html('input', { type: 'checkbox', checked: on, disabled: !reported, 'data-focus': `series:${id}` });
    box.checked = on;
    box.addEventListener('change', () => {
      const next = box.checked ? [...setting.series, id] : setting.series.filter((s) => s !== id);
      if (!next.length) {
        box.checked = true;
        frame.on.refuse(REFUSAL.lastSeries.reason);
        return;
      }
      frame.on.choose(settingFor(setting, { series: next }));
    });
    label.append(box, html('span', { class: 'plate-toggle-name' }, def.name.replace(/^./, (c) => c.toUpperCase())));
    if (!reported) label.append(html('span', { class: 'plate-view-why' }, `Not reported: ${live.absent.get(id)}.`));
    group.append(label);
  }
  row.append(group);
}

/* ══ the keyboard (research.md R11) ══════════════════════════════════════ */

/** The keys that step a plate's hour or cursor; the only ones `stepFor` answers. */
export const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End']);

/**
 * Step a field's hour by a key, or null where the key does not step. Left and
 * Right move one hour, Page Up and Page Down one per cent of the hours shown,
 * Home and End to the ends. The caller pins the result.
 */
export function stepFor(key, field, at) {
  if (!STEP_KEYS.has(key) || !field?.steps) return null;
  const range = field.steps(at);
  // A field that draws no hours has nowhere to step to.
  if (!range) return null;
  const { min, max } = range;
  const page = Math.max(1, Math.round((range.shown ?? max - min + 1) / 100));
  const from = at ?? min;
  const to = {
    ArrowLeft: from - 1,
    ArrowRight: from + 1,
    PageDown: from - page,
    PageUp: from + page,
    Home: min,
    End: max,
  }[key];
  return to === undefined ? null : Math.min(max, Math.max(min, to));
}

/* ══ measurement (research.md R12) ═══════════════════════════════════════ */

if (MEASURING && typeof window !== 'undefined') {
  // The console helper the SC-001 procedure reads: the median of every
  // `plate-draw` measure so far, and how many there were.
  window.plateMeasure = () => {
    const times = performance.getEntriesByName('plate-draw').map((e) => e.duration).sort((a, b) => a - b);
    const m = times.length >> 1;
    const median = times.length ? (times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2) : NaN;
    return { count: times.length, median: Number(median.toFixed(2)) };
  };
  window.plateMeasureClear = () => performance.clearMeasures('plate-draw');
}

export { deltaKindOf, REGION_NEEDS };
