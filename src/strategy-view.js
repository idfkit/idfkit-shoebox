/**
 * The strategy plan, drawn.
 *
 * The one DOM-bound module of the feature, so that `main.js` stays wiring and
 * `strategy.js` stays arithmetic a harness can call. Every function here takes
 * what the arithmetic returned and the callbacks for what a press means, and
 * letters nothing that is not in its arguments.
 *
 * Three rules from the design system govern every drawing on this page:
 *
 * - **Graphite for magnitude.** A reading is a magnitude with no direction, so
 *   the dots and the terrain are ink levels on one hue and `--cold`/`--warm`
 *   are not spent on them (FR-022). Higher reads darker, for every reading,
 *   which is E-02's own convention: height is the reading (SC-003b).
 * - **The accent is markup.** `--redline` marks where the desk stands and
 *   where the keyboard is, and nothing else.
 * - **Nothing is carried by shading or position alone** (US6 scenario 3):
 *   every dot's reading is in the readout and the design list, every world's
 *   jump is lettered in words, and the kinds of move are words.
 */

import { CHANNEL_BY_ID, controlFor, labelFor } from './controls.js';
import { targetOf } from './strategy.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** A theme token as an RGB triple, read off the host so the terrain follows the theme. */
function tokenRgb(host, name) {
  const raw = getComputedStyle(host).getPropertyValue(name).trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(raw);
  if (hex) return [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16));
  const rgb = /rgba?\(([^)]+)\)/.exec(raw);
  if (rgb) return rgb[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  throw new Error(`the theme token ${name} is not a colour the terrain can mix ("${raw}")`);
}

/** A signed change in a reading's own units, with the minus sign the sheet uses. */
export function signed(value, reading) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(reading.digits)} ${reading.unit}`;
}

/** An unsigned figure in a reading's own units. */
export function plain(value, reading) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(reading.digits)} ${reading.unit}`;
}

/** A share as the sheet letters it: a percentage, or *none* at or below zero. */
export function percent(share) {
  if (share === null || !Number.isFinite(share)) return '—';
  return share <= 0 ? 'none' : `${Math.round(share * 100)} %`;
}

/** A move lettered as a recipe: its controls in the direction that raises the axis. */
export function recipeText(move) {
  const parts = move.recipe.map(({ key, word, share }) => `${word} ${labelFor(key)} ${Math.round(share * 100)} %`);
  if (move.others >= 0.005) parts.push(`others ${Math.round(move.others * 100)} %`);
  return parts.join(', ');
}

/** The plot's frame in viewBox units, sized off the host. */
function frameFor(host, { tall = 0.68, max = 420 } = {}) {
  const width = Math.max(280, Math.round(host.clientWidth || 600));
  const height = Math.round(Math.min(width * tall, max));
  return { width, height, l: 16, r: 10, t: 10, b: 22 };
}

function extent(values) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!(hi > lo)) {
    lo -= 0.5;
    hi += 0.5;
  }
  return [lo, hi];
}

/**
 * The terrain, painted cell by cell: ink levels from pale low ground to dark
 * high ground, with a Lambertian hillshade lit from the north-west at 45° so
 * the slopes read. No contour and no relief block (FR-019), and nothing is
 * lettered off it: the drawing has no figure on the canvas at all.
 */
function paintTerrain(canvas, terrain, box, host) {
  const ctx = canvas.getContext('2d');
  const paper = tokenRgb(host, '--sheet');
  const ink = tokenRgb(host, '--ink');
  const n = terrain.cells;
  const lat = terrain.lattice;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of lat) {
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const range = hi - lo || 1;
  const at = (ix, iy) => (ix >= 0 && iy >= 0 && ix < n && iy < n ? lat[iy * n + ix] : Number.NaN);
  const light = [-0.5, 0.5, Math.SQRT1_2];
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const v = at(ix, iy);
      if (!Number.isFinite(v)) continue;
      const slope = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? (b - a) / 2 : 0);
      const gx = (slope(at(ix - 1, iy), at(ix + 1, iy)) / range) * n * 0.35;
      const gy = (slope(at(ix, iy - 1), at(ix, iy + 1)) / range) * n * 0.35;
      const norm = Math.hypot(gx, gy, 1);
      const shade = Math.max(0, (-gx * light[0] - gy * light[1] + light[2]) / norm);
      const level = (v - lo) / range;
      const a = Math.min(0.78, Math.max(0.03, 0.05 + 0.42 * level + 0.3 * (0.72 - shade)));
      const mix = paper.map((p, k) => Math.round(p + (ink[k] - p) * a));
      ctx.fillStyle = `rgb(${mix.join(',')})`;
      const xa = box.px(box.x0 + (ix / n) * (box.x1 - box.x0));
      const xb = box.px(box.x0 + ((ix + 1) / n) * (box.x1 - box.x0));
      const ya = box.py(box.y0 + (iy / n) * (box.y1 - box.y0));
      const yb = box.py(box.y0 + ((iy + 1) / n) * (box.y1 - box.y0));
      ctx.fillRect(xa, yb, xb - xa + 0.6, ya - yb + 0.6);
    }
  }
}

/**
 * Pointer and keyboard on one drawing of dots.
 *
 * One handler for every pointer, choosing the nearest design within a radius
 * that grows under a coarse pointer (US6 scenario 2). A hover letters the
 * design under a mouse and a finger alike, but only a mouse's `pointerleave`
 * takes the reading away again: a touch pointer is destroyed at the end of
 * every tap, and honouring its leave would letter a design and remove it in
 * the same gesture — the survey's rule, for the survey's reason. The arrow
 * keys walk the designs in position order, and Enter stands on one.
 */
function bindDots(root, points, frame, { onPress, onHover, onCursor, cursorMark }) {
  let cursor = -1;
  let hovered = null;
  const order = points.map((_, i) => i).sort((l, r) => points[l].sx - points[r].sx || points[l].sy - points[r].sy);
  const scale = () => {
    const rect = root.getBoundingClientRect();
    return { rect, k: frame.width / (rect.width || frame.width) };
  };
  const nearest = (event, radius) => {
    const { rect, k } = scale();
    const x = (event.clientX - rect.left) * k;
    const y = (event.clientY - rect.top) * k;
    let best = null;
    let bestD = radius * k;
    for (const point of points) {
      const d = Math.hypot(point.sx - x, point.sy - y);
      if (d < bestD) {
        bestD = d;
        best = point;
      }
    }
    return best;
  };
  // The click event is the wrong place to ask what pressed it: `pointerType`
  // on a `click` is missing in Safari and empty for a synthesised one, and a
  // missing type read as a mouse gave a thumb a nine-unit target. So the type
  // is taken from the `pointerdown` that began the press, and failing that
  // from what the stylesheet itself asks, `(pointer: coarse)`.
  let pressedWith = null;
  const coarse = () => Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const radiusFor = (type) => ((type ? type === 'mouse' : !coarse()) ? 9 : 22);
  root.addEventListener('pointerdown', (event) => {
    pressedWith = event.pointerType || null;
  });
  root.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const point = nearest(event, radiusFor('mouse'));
    if (point === hovered) return;
    hovered = point;
    onHover?.(point?.dot ?? null);
  });
  root.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovered = null;
    onHover?.(null);
  });
  root.addEventListener('click', (event) => {
    const point = nearest(event, radiusFor(pressedWith));
    pressedWith = null;
    if (!point) return;
    onHover?.(point.dot);
    onPress?.(point.dot);
  });
  const place = (at) => {
    cursor = at;
    const point = points[order[cursor]];
    cursorMark.setAttribute('cx', point.sx);
    cursorMark.setAttribute('cy', point.sy);
    cursorMark.removeAttribute('visibility');
    onCursor?.(point.dot);
  };
  root.addEventListener('keydown', (event) => {
    if (!order.length) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      place(cursor < 0 ? 0 : Math.max(0, Math.min(order.length - 1, cursor + step)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      place(event.key === 'Home' ? 0 : order.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && cursor >= 0) {
      event.preventDefault();
      onPress?.(points[order[cursor]].dot);
    }
  });
}

/**
 * One plan: dots over the terrain along the reading's two moves.
 *
 * Returns a handle whose `setStance` moves the armed square without
 * rebuilding the drawing, because a slider drag moves the stance every frame
 * and a rebuilt SVG would take the keyboard cursor and its focus with it.
 */
export function drawPlan(host, plan, { stance = null, label = '', onPress = null, onHover = null, onCursor = null } = {}) {
  host.textContent = '';
  const dots = plan.dots;
  if (!dots.length) return null;
  const frame = frameFor(host);
  const pw = frame.width - frame.l - frame.r;
  const ph = frame.height - frame.t - frame.b;
  const [x0, x1] = extent(dots.map((dot) => dot.x));
  const [y0, y1] = extent(dots.map((dot) => dot.y));
  const padX = (x1 - x0) * 0.04;
  const padY = (y1 - y0) * 0.04;
  const px = (x) => frame.l + ((x - (x0 - padX)) / (x1 - x0 + 2 * padX)) * pw;
  const py = (y) => frame.t + ph - ((y - (y0 - padY)) / (y1 - y0 + 2 * padY)) * ph;

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(frame.width * dpr);
  canvas.height = Math.round(frame.height * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  if (plan.terrain?.lattice) {
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    paintTerrain(canvas, plan.terrain, { x0, x1, y0, y1, px, py }, host);
  }

  const root = svg('svg', {
    viewBox: `0 0 ${frame.width} ${frame.height}`,
    class: 'plan-svg',
    role: 'img',
    'aria-label': label,
    tabindex: 0,
  });
  root.append(svg('rect', { class: 'plan-frame', x: frame.l, y: frame.t, width: pw, height: ph }));
  const axisX = svg('text', { class: 'plan-axis', x: frame.l + pw, y: frame.height - 6, 'text-anchor': 'end' });
  axisX.textContent = 'Move 1 →';
  const axisY = svg('text', {
    class: 'plan-axis',
    x: 11,
    y: frame.t + 2,
    'text-anchor': 'end',
    transform: `rotate(-90 11 ${frame.t + 2})`,
  });
  axisY.textContent = 'Move 2 →';
  root.append(axisX, axisY);

  const [lo, hi] = extent(dots.map((dot) => dot.value));
  const points = dots.map((dot) => {
    const sx = px(dot.x);
    const sy = py(dot.y);
    root.append(
      svg('circle', {
        class: 'plan-dot',
        cx: sx.toFixed(1),
        cy: sy.toFixed(1),
        r: 3,
        'fill-opacity': (0.22 + (0.78 * (dot.value - lo)) / (hi - lo)).toFixed(2),
      }),
    );
    return { dot, sx, sy };
  });

  const mark = svg('rect', { class: 'plan-stance', width: 8, height: 8, visibility: 'hidden' });
  const cursorMark = svg('circle', { class: 'plan-cursor', r: 6, visibility: 'hidden' });
  root.append(mark, cursorMark);
  host.append(canvas, root);
  bindDots(root, points, frame, { onPress, onHover, onCursor, cursorMark });

  const handle = {
    setStance(at) {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) {
        mark.setAttribute('visibility', 'hidden');
        return;
      }
      mark.setAttribute('x', (px(at.x) - 4).toFixed(1));
      mark.setAttribute('y', (py(at.y) - 4).toFixed(1));
      mark.removeAttribute('visibility');
    },
  };
  handle.setStance(stance);
  return handle;
}

/**
 * The reading against the leading move alone (FR-018): dots, and a trend of
 * binned medians drawn dashed and lettered as an estimate.
 *
 * Returns a handle, as `drawPlan` does, so the stance line follows a slider
 * without the drawing being rebuilt (FR-021).
 */
export function drawOneMove(host, plan, trend, { stance = null, onPress = null, onHover = null } = {}) {
  host.textContent = '';
  if (!plan.dots.length) return null;
  const frame = frameFor(host, { tall: 0.42, max: 260 });
  const pw = frame.width - frame.l - frame.r;
  const ph = frame.height - frame.t - frame.b;
  const [x0, x1] = extent(plan.dots.map((dot) => dot.x));
  const [v0, v1] = extent(plan.dots.map((dot) => dot.value));
  const px = (x) => frame.l + ((x - x0) / (x1 - x0)) * pw;
  const py = (v) => frame.t + ph - ((v - v0) / (v1 - v0)) * ph;
  const root = svg('svg', {
    viewBox: `0 0 ${frame.width} ${frame.height}`,
    class: 'plan-svg',
    role: 'img',
    'aria-label': `${plan.reading.label} against the leading move alone`,
    tabindex: 0,
  });
  root.append(svg('rect', { class: 'plan-frame', x: frame.l, y: frame.t, width: pw, height: ph }));
  const points = plan.dots.map((dot) => {
    const sx = px(dot.x);
    const sy = py(dot.value);
    root.append(svg('circle', { class: 'plan-dot', cx: sx.toFixed(1), cy: sy.toFixed(1), r: 2.4, 'fill-opacity': 0.5 }));
    return { dot, sx, sy };
  });
  if (trend.length) {
    root.append(
      svg('polyline', {
        class: 'plan-trend',
        points: trend.map((bin) => `${px(bin.x).toFixed(1)},${py(bin.value).toFixed(1)}`).join(' '),
      }),
    );
    const last = trend[trend.length - 1];
    const tag = svg('text', { class: 'plan-axis', x: Math.min(px(last.x) + 4, frame.width - 24), y: py(last.value) - 4 });
    tag.textContent = 'est.';
    root.append(tag);
  }
  const axisX = svg('text', { class: 'plan-axis', x: frame.l + pw, y: frame.height - 6, 'text-anchor': 'end' });
  axisX.textContent = 'Move 1 →';
  root.append(axisX);
  const line = svg('line', { class: 'plan-stance-line', y1: frame.t, y2: frame.t + ph, visibility: 'hidden' });
  const cursorMark = svg('circle', { class: 'plan-cursor', r: 5, visibility: 'hidden' });
  root.append(line, cursorMark);
  host.append(root);
  bindDots(root, points, frame, { onPress, onHover, onCursor: onHover, cursorMark });
  const handle = {
    setStance(at) {
      if (!at || !Number.isFinite(at.x)) {
        line.setAttribute('visibility', 'hidden');
        return;
      }
      line.setAttribute('x1', px(at.x).toFixed(1));
      line.setAttribute('x2', px(at.x).toFixed(1));
      line.removeAttribute('visibility');
    },
  };
  handle.setStance(stance);
  return handle;
}

/**
 * The archipelago as a ring (FR-023, FR-026). The home world at the centre,
 * every neighbour on one ring at even angles in the order handed in, which is
 * design stage then declaration. No line, surface or trend joins two islands,
 * and nothing about the ring is a measurement: each island carries its number,
 * which the card list names, and its jump in the reading's own units.
 */
export function drawArchipelago(host, islands, { chosen = null, onOpen }) {
  host.textContent = '';
  if (!islands.length) return;
  const width = Math.max(280, Math.round(host.clientWidth || 600));
  const height = Math.round(Math.min(width * 0.62, 340));
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 30;
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'island-ring',
    role: 'img',
    'aria-label': `This world and the ${islands.length} worlds one door away. Positions are schematic.`,
  });
  root.append(svg('circle', { class: 'island-home', cx, cy, r: 24 }));
  const home = svg('text', { class: 'plan-axis', x: cx, y: cy + 3, 'text-anchor': 'middle' });
  home.textContent = 'This world';
  root.append(home);
  islands.forEach((island, at) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * at) / islands.length;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const group = svg('g', { class: `island${island.id === chosen ? ' chosen' : ''}`, role: 'button', tabindex: -1 });
    group.append(svg('circle', { class: `island-marker ${island.depth}`, cx: x, cy: y, r: 9 }));
    const number = svg('text', { class: 'island-no', x, y: y + 3, 'text-anchor': 'middle' });
    number.textContent = String(at + 1);
    const outward = Math.cos(angle) >= 0 ? 'start' : 'end';
    const jump = svg('text', {
      class: 'plan-axis',
      x: x + (outward === 'start' ? 13 : -13),
      y: y + 3,
      'text-anchor': outward,
    });
    jump.textContent = island.edge;
    group.append(number, jump);
    group.addEventListener('click', () => onOpen(island.id));
    root.append(group);
  });
  host.append(root);
}

/**
 * The same worlds as cards, in the same order: the complete list, the
 * keyboard's route to every island, and the whole archipelago below the
 * index threshold, where a ring of nineteen labels cannot be read (FR-046).
 */
export function renderIslandCards(host, islands, { chosen = null, onOpen }) {
  host.textContent = '';
  const list = el('ol', 'island-cards');
  islands.forEach((island, at) => {
    const item = el('li');
    const button = el('button', 'island-card');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(island.id === chosen));
    button.append(el('b', null, `${at + 1}. ${island.label}`), el('small', null, island.jump), el('small', null, island.detail));
    button.addEventListener('click', () => onOpen(island.id));
    item.append(button);
    list.append(item);
  });
  host.append(list);
}

/** A list of designs, each a building to stand on, lettered in full. */
export function renderDesignList(host, rows, onPress) {
  host.textContent = '';
  for (const row of rows) {
    const item = el('li');
    const button = el('button', 'strategy-design', row.text);
    button.type = 'button';
    button.addEventListener('click', () => onPress(row));
    item.append(button);
    host.append(item);
  }
}

/** Which channel an entry belongs to, for grouping; a patch door names its own. */
function channelOf(entry) {
  const key = entry.door ?? entry.key;
  if (key.startsWith('patch:')) return CHANNEL_BY_ID[key.slice(6)];
  return controlFor(key).channel;
}

/**
 * The screening beside the pull (FR-029 to FR-031): every measured control and
 * door, with its effect anywhere, its effect at the stance, how consistently
 * it pointed one way and what that means in words. A row folds into a block
 * at the schedule breakpoint, every figure keeping its head (`data-head`).
 */
export function renderScreening(table, entries, { reading, onPick, chosen = [], spots = new Map(), stanceRead = true }) {
  table.textContent = '';
  const heads = ['Control or door', 'Anywhere', 'At the stance', 'Consistency', 'In words'];
  const thead = el('thead');
  const headRow = el('tr');
  heads.forEach((head, at) => headRow.append(el('th', at > 0 && at < 4 ? 'num' : null, head)));
  thead.append(headRow);
  const measured = entries.filter((entry) => entry.effect !== null);
  const groups = [
    ['Controls', measured.filter((entry) => entry.kind === 'control')],
    ['Doors', measured.filter((entry) => entry.kind === 'door')],
  ];
  table.append(thead);
  for (const [name, rows] of groups) {
    if (!rows.length) continue;
    const body = el('tbody');
    const heading = el('tr', 'group');
    const cell = el('th', null, name);
    cell.colSpan = heads.length;
    heading.append(cell);
    body.append(heading);
    for (const entry of [...rows].sort((l, r) => r.effect - l.effect || l.label.localeCompare(r.label))) {
      const row = el('tr');
      if (chosen.includes(entry.key)) row.classList.add('chosen');
      const name = el('td');
      if (entry.kind === 'control' && onPick) {
        const pick = el('button', 'pull-pick', entry.label);
        pick.type = 'button';
        pick.title = `Make ${entry.label} an axis of the survey`;
        pick.addEventListener('click', () => onPick(entry.key));
        name.append(pick);
      } else {
        name.textContent = entry.label;
      }
      // "Only here" is a comparison with the pull at the stance, so where the
      // pull has not been read for this reading and this desk the words say
      // the comparison is missing rather than letting "nowhere" stand for a
      // question nobody asked (FR-030). A door has no stance column to miss.
      const said =
        stanceRead || entry.kind !== 'control'
          ? entry.words
          : `${entry.words}, not set against the stance: the pull is not read here`;
      const cells = [
        name,
        el('td', 'num', plain(entry.effect, reading)),
        el('td', 'num', entry.atStance === null ? '—' : plain(Math.abs(entry.atStance), reading)),
        // A door's consistency is over matched designs, one building run in
        // both worlds, not over screening points.
        el('td', 'num', `${entry.consistency.agree} of ${entry.consistency.of} ${entry.kind === 'door' ? 'matched designs' : 'points'}`),
        // A sweet spot or a limit rides on the words, labelled an estimate
        // (FR-032a): the best value inside the range, how consistently it held
        // and how much worse the worse end is, or the end it keeps improving to.
        el('td', null, spots.has(entry.key) ? `${said}; ${spotSentence(spots.get(entry.key))}` : said),
      ];
      cells.forEach((c, at) => {
        c.dataset.head = heads[at];
        row.append(c);
      });
      body.append(row);
    }
    table.append(body);
  }
  table.setAttribute('role', 'table');
  for (const node of table.querySelectorAll('thead, tbody')) node.setAttribute('role', 'rowgroup');
  for (const node of table.querySelectorAll('tr')) node.setAttribute('role', 'row');
  for (const node of table.querySelectorAll('thead th')) node.setAttribute('role', 'columnheader');
  // A group row names the rows under it, not a column: read as a column
  // header it would be announced as the head of every cell in its column.
  for (const node of table.querySelectorAll('tr.group th')) node.setAttribute('role', 'rowheader');
  for (const node of table.querySelectorAll('td')) node.setAttribute('role', 'cell');
}

/**
 * Every entry the screening did not measure, grouped under its channel with
 * each reason stated once (FR-003, FR-043). A reason is never folded away: it
 * is the answer to "why does nothing I try move this reading".
 */
export function renderInert(host, entries) {
  host.textContent = '';
  const inert = entries.filter((entry) => entry.inert !== null);
  const byChannel = new Map();
  for (const entry of inert) {
    const channel = channelOf(entry);
    if (!byChannel.has(channel)) byChannel.set(channel, new Map());
    const reasons = byChannel.get(channel);
    if (!reasons.has(entry.inert)) reasons.set(entry.inert, []);
    reasons.get(entry.inert).push(entry.label);
  }
  const channels = [...byChannel.keys()].sort((l, r) => l.index - r.index);
  for (const channel of channels) {
    const item = el('li');
    item.append(el('b', null, channel.name));
    for (const [reason, labels] of byChannel.get(channel)) {
      item.append(el('span', null, ` ${labels.join(', ')}: ${reason}`));
    }
    host.append(item);
  }
}

const KIND_HEAD = Object.freeze({
  'no-regret': ['Helps both', 'Take these early; nobody needs to argue.'],
  'trade-off': ['Trades one for the other', 'The real decisions, each with its exchange stated.'],
  lever: ['A lever on one', 'The compensators that buy back what a trade-off cost.'],
  free: ['Free for these two readings', 'Design them for daylight, view, cost or expression; they may matter for a reading not chosen.'],
});

/** The change in each reading when a move is taken the way that helps. */
function changeOf(c, index) {
  const reading = c.pair[index];
  // `mu` is improvement: the reading's own change in its better direction.
  return (reading.better === 'higher' ? 1 : -1) * c.mu[index];
}

function moveSentence(c, labelOf) {
  const [a, b] = c.pair;
  const how = c.door ? 'Entering it' : 'Raising it across its range';
  const da = changeOf(c, 0);
  const db = changeOf(c, 1);
  if (c.kind === 'no-regret') {
    const helps = c.mu[0] > 0 ? how : c.door ? 'Leaving it for this world' : 'Lowering it across its range';
    const flip = c.mu[0] > 0 ? 1 : -1;
    return `${helps} helps both: ${a.label} ${signed(flip * da, a)}, ${b.label} ${signed(flip * db, b)}.`;
  }
  if (c.kind === 'trade-off') {
    // Stated in the direction a lever pays back: taken for the reading it
    // improves, at the cost of the one `losing` names.
    const lost = c.losing.id === a.id ? 0 : 1;
    const won = 1 - lost;
    const gain = c.pair[won];
    const cost = c.pair[lost];
    const way = c.mu[won] > 0 ? how : c.door ? 'Leaving it for this world' : 'Lowering it across its range';
    const pays = c.levers.length
      ? ` Pays back with: ${c.levers.map(labelOf).join(', ')}, each moving ${cost.label.toLowerCase()} by at least that much and leaving ${gain.label.toLowerCase()} alone.`
      : ` ${c.unpaid}`;
    return (
      `${way} improves ${gain.label.toLowerCase()} by ${plain(Math.abs(won ? db : da), gain)} and costs ` +
      `${cost.label.toLowerCase()} ${plain(Math.abs(won ? da : db), cost)}.${pays}`
    );
  }
  if (c.kind === 'lever') {
    const at = c.on.id === a.id ? 0 : 1;
    const other = c.pair[1 - at];
    return `${how} moves ${c.on.label.toLowerCase()} by ${signed(changeOf(c, at), c.on)} and leaves ${other.label.toLowerCase()} within its free threshold.`;
  }
  return `Moves ${a.label.toLowerCase()} by ${plain(Math.abs(da), a)} and ${b.label.toLowerCase()} by ${plain(Math.abs(db), b)}, each below its threshold.`;
}

function spotSentence(spot) {
  const reading = spot.reading;
  if (spot.at !== null) {
    const { control } = controlFor(spot.key);
    return (
      `${reading.label} is best near ≈${control.format(spot.at)}, est., held at ${spot.consistency.agree} of ` +
      `${spot.consistency.of} points; the worse end is ${plain(spot.worseEnd.by, reading)} worse.`
    );
  }
  return `${reading.label} keeps improving toward its ${spot.limit === 'min' ? 'lowest' : 'highest'} setting.`;
}

/**
 * The moves panel (FR-033 to FR-037): four groups, each entry in design-stage
 * order, carrying its kind in words, its consistency, and for a trade-off its
 * exchange and the levers that pay it back. Nothing is carried by colour, and
 * no figure combines the two readings (FR-036).
 */
export function renderMoves(host, classifications, { spots = new Map(), stageNote, labelOf = labelFor }) {
  host.textContent = '';
  host.append(el('p', 'strategy-note', stageNote));
  for (const kind of ['no-regret', 'trade-off', 'lever', 'free']) {
    const rows = classifications
      .filter((c) => c.kind === kind)
      .sort((l, r) => l.stage - r.stage || l.label.localeCompare(r.label));
    const group = el('section', 'strategy-kind');
    const [head, line] = KIND_HEAD[kind];
    group.append(el('h4', null, `${head} · ${rows.length}`), el('p', 'strategy-note', line));
    const list = el('ol', 'strategy-kind-list');
    for (const c of rows) {
      const item = el('li', 'strategy-move');
      item.id = targetOf(c.key);
      item.tabIndex = -1;
      item.append(el('b', null, c.label), el('span', null, ` ${moveSentence(c, labelOf)}`));
      const held = `Held at ${c.consistency.agree} of ${c.consistency.of} ${c.door ? 'matched designs' : 'points'}`;
      item.append(el('span', 'strategy-held', ` ${held}${c.whole ? '.' : ', so it depends on the rest of the design.'}`));
      for (const spot of spots.get(c.key) ?? []) item.append(el('span', 'strategy-held', ` ${spotSentence(spot)}`));
      list.append(item);
    }
    group.append(list);
    host.append(group);
  }
}

/**
 * The reading chooser: every reading on the roster, one or two chosen, each
 * unavailable one greyed with its own reason and fix beside it, in place,
 * exactly as the study roster refuses one (FR-002).
 */
export function renderReadingChooser(host, offers, chosen, onToggle) {
  host.textContent = '';
  const list = el('ul', 'strategy-offers');
  for (const offer of offers) {
    const item = el('li');
    const button = el('button', 'strategy-reading', offer.reading.label);
    button.type = 'button';
    button.disabled = !offer.available;
    button.setAttribute('aria-pressed', String(chosen.includes(offer.reading.id)));
    button.addEventListener('click', () => onToggle(offer.reading.id));
    item.append(button);
    if (!offer.available) item.append(el('span', 'strategy-why', offer.reason));
    list.append(item);
  }
  host.append(list);
}
