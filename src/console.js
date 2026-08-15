import { CHANNELS, controlFor } from './controls.js';

/**
 * The model console: a recall sheet for the zone heat balance.
 *
 * Sixteen channel strips in signal order, every control visible at once, no
 * tabs and no accordions -- the whole point of a desk is that you can read the
 * state of every path without opening anything. The one exception is the index
 * sheet below, which a screen too narrow to lay the desk out forces and which
 * is built to give up as little of that as it can.
 *
 * Two ideas do most of the work here. A control is drawn as a ruled
 * calibration face with a penciled tick and a ghost of where it stood when you
 * took hold of it, which is the same gesture-baseline idea the plate already
 * uses for its curve. And every strip carries a meter of what that path is
 * actually contributing, five of which are terms of the zone air heat balance
 * and therefore sum -- which is what the rail at the foot draws. A mixing desk
 * and a heat balance are the same diagram; this is the place you can see it.
 */

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (String(v).includes('var(')) el.style.setProperty(k, String(v));
    else el.setAttribute(k, String(v));
  }
  return el;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Watts, at a precision that reads on a strip rather than in a report. */
function watts(w) {
  if (!Number.isFinite(w)) return '—';
  const abs = Math.abs(w);
  if (abs >= 10000) return `${(w / 1000).toFixed(1)} kW`;
  if (abs >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${w.toFixed(0)} W`;
}

/* ══ mounting ════════════════════════════════════════════════════════════ */

/**
 * Draw the desk and wire it up.
 *
 * `params` and `bypass` are owned by the caller and read live -- the console
 * never keeps its own copy, so the sheet's five sliders and the console's
 * scales cannot drift apart. Every gesture goes back out through `onChange`.
 */
export function mountConsole({
  host, params, bypass, onChange, onPatch, onSolo, onReset, onStudy, onStudyClear,
}) {
  const strips = new Map(); // channel id -> { redraw(), meter, patch, solo }
  const faces = new Map(); // parameter key -> redraw for that control
  const rows = new Map(); // parameter key -> the control's row, for study cards
  const cards = new Map(); // parameter key -> { node, kind, study, syncTick }
  const studyButtons = new Map(); // parameter key -> that scale's Study button
  let solo = null;
  let reading = null; // the instant every meter on the desk is reading at
  let engaged = new Set(); // which channels the model says are in the path
  let ghost = {}; // where each control stood when the current gesture began
  // Whether a study can be taken at all, and the sentence for when it cannot.
  // Off until the caller says otherwise: the engine is not resident at mount.
  let sweepGate = { ok: false, reason: 'The engine is still arriving.' };

  const stripHost = el('div', 'strips');
  // The ruled column set the strips lie on, one element inside the scroller
  // rather than the scroller itself: the desk fixes `stripHost`'s height so it
  // can scroll, and a multicol box with a fixed height lays its overflow out
  // as extra columns to the side. The wrapper keeps its natural height, so the
  // columns balance to the content and the overflow stays vertical.
  const stripGrid = el('div', 'strip-grid');
  const railHost = el('div', 'rail');

  for (const channel of CHANNELS) stripGrid.append(buildStrip(channel));
  stripHost.append(stripGrid);
  host.append(stripHost, railHost);

  /* ── the index sheet ─────────────────────────────────────────────────────
   *
   * Below the stylesheet's breakpoint the desk stops being a column beside the
   * drawing and becomes a page of its own, where sixteen strips laid end to end
   * is about ten screens of scrolling with nothing in them to say which one you
   * are in. So the strips fold to a line each and the console becomes its own
   * index: number, name, reading and patch state, in signal order, on one
   * screen. A drawing set answers exactly this question with an index sheet.
   *
   * It bends the desk's own rule -- that every path is readable without opening
   * anything, which is why the selectors are segmented rules and not dropdowns
   * -- as little as it can. The folded row still carries the two things you
   * read: what that path is contributing, and whether it is in the model. The
   * fold hides only the controls. Reading stays free; working a control costs a
   * tap, which on a phone it already cost in scrolling.
   */

  // Which of the two presentations the stylesheet has chosen. The breakpoint is
  // declared once, in the media query, and read back here as a flag rather than
  // repeated as a `matchMedia` string -- a media query and its JavaScript twin
  // that disagree is a bug that exists at exactly one window width, which is
  // the width nobody tests at.
  const indexMode = () => getComputedStyle(stripHost).getPropertyValue('--index').trim() === '1';

  let indexing = null; // null until the first read, so the first apply always runs
  let opened = null; // the one strip unfolded, while indexing

  function refold() {
    for (const channel of CHANNELS) {
      const here = strips.get(channel.id);
      const shown = !indexing || opened === channel.id;
      // `hidden` rather than a class, so a folded strip's controls leave the
      // tab order and the accessibility tree with it. A reader tabbing through
      // the index should meet sixteen rows, not sixteen rows and ninety
      // controls they cannot see.
      here.fold.hidden = !shown;
      here.strip.classList.toggle('open', Boolean(indexing) && shown);
      here.toggle.disabled = !indexing;
      if (indexing) {
        here.toggle.setAttribute('aria-expanded', String(shown));
        here.toggle.setAttribute('aria-controls', here.fold.id);
      } else {
        here.toggle.removeAttribute('aria-expanded');
        here.toggle.removeAttribute('aria-controls');
      }
    }
  }

  function relayout() {
    const on = indexMode();
    if (on === indexing) return;
    indexing = on;
    stripHost.classList.toggle('index', on);
    // Arriving at the index closes everything, because the list is the point of
    // it; leaving it opens everything, which is the desk as it was.
    opened = null;
    refold();
  }

  relayout();
  window.addEventListener('resize', relayout);

  /* ── the strips ──────────────────────────────────────────────────────── */

  function buildStrip(channel) {
    const strip = el('section', 'strip');
    strip.dataset.channel = channel.id;

    const head = el('header', 'strip-head');

    // The heading wraps the disclosure button rather than sitting inside it: a
    // button's content model is phrasing, and an `h3` is not. Everything the
    // folded row has to read lives inside the button, so the whole line is one
    // tap target rather than a chevron you have to hit.
    const title = el('h3', 'strip-title');
    const toggle = el('button', 'strip-toggle');
    toggle.type = 'button';
    const read = el('b', 'strip-read');
    const mark = el('i', 'strip-mark');
    // A channel with no "off" has no arming to report, so its cell is left
    // blank rather than drawn as a marker that is permanently lit. Blank is not
    // an em dash: there is no figure missing here, there is no figure.
    //
    // An armed marker says "in the model" with a filled square and nothing
    // else, which is a colour -- no use to a reader who is being read the row,
    // and gone entirely under forced colours, where the custom-property
    // background is dropped. So the square is given the sentence it is drawing
    // and `setState` keeps it current. It sits inside the button, so the state
    // joins the row's name; above the breakpoint the marker is `display: none`
    // and leaves the accessibility tree with its label, which is right, because
    // there the patch button is on the row saying the same thing at full size.
    if (channel.bypassable) {
      mark.classList.add('armed');
      mark.setAttribute('role', 'img');
    }
    toggle.append(
      el('span', 'strip-no', channel.index),
      el('span', 'strip-name', channel.name),
      el('span', 'strip-term', channel.term),
      read,
      mark,
      el('i', 'strip-chev'),
    );
    title.append(toggle);
    head.append(title);

    toggle.addEventListener('click', () => {
      if (!indexing) return;
      // The row you tapped must not move out from under your thumb while a
      // strip somewhere above it closes. Measure where this head sits, let the
      // folds change, and put it back where it was.
      const before = head.getBoundingClientRect().top;
      opened = opened === channel.id ? null : channel.id;
      refold();
      const after = head.getBoundingClientRect().top;
      if (after !== before) window.scrollBy(0, after - before);
    });

    let patch = null;
    let soloBtn = null;
    if (channel.bypassable) {
      patch = el('button', 'patch');
      patch.type = 'button';
      patch.title = 'Take this path in or out of the model';
      patch.append(el('i', 'patch-mark'), el('span', null, 'In'));
      patch.addEventListener('click', () => onPatch(channel.id, !isBypassed(channel.id)));

      soloBtn = el('button', 'solo', 'Solo');
      soloBtn.type = 'button';
      soloBtn.title = 'Hear this path alone: every other bypassable channel goes out';
      soloBtn.addEventListener('click', () => {
        solo = solo === channel.id ? null : channel.id;
        onSolo(solo);
      });
      head.append(patch, soloBtn);
    }
    strip.append(head);

    // A refusal is not a detail of the strip's body, it is the strip's current
    // state, so it sits outside the fold and stays readable with the strip
    // closed. A channel you cannot patch in is worth saying on the index, not
    // one tap further in.
    const note = el('p', 'strip-blocked');
    note.hidden = true;
    strip.append(note);

    const fold = el('div', 'strip-fold');
    fold.id = `strip-fold-${channel.id}`;
    fold.append(el('p', 'strip-blurb', channel.blurb));

    const body = el('div', 'strip-body');
    for (const control of channel.controls) body.append(buildControl(control, channel));
    fold.append(body);

    const meter = buildMeter(channel);
    if (meter) fold.append(meter.node);
    strip.append(fold);

    strips.set(channel.id, {
      strip, note, patch, solo: soloBtn, meter, body, toggle, read, fold,
      mark: channel.bypassable ? mark : null,
    });
    return strip;
  }

  /**
   * Bind a drag to an element, without leaning on pointer capture for
   * correctness.
   *
   * Capture is still requested, because it is what keeps a drag alive when the
   * pointer leaves the element — but it is an enhancement, not the state. An
   * earlier version gated `pointermove` on `hasPointerCapture`, which meant
   * that any pointer the browser declined to capture produced a control that
   * took its first click and then quietly ignored the rest of the gesture.
   */
  function drag(target, { onStart, onMove, onEnd }) {
    let live = false;
    target.addEventListener('pointerdown', (event) => {
      live = true;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Some pointers cannot be captured; the gesture still works without it.
      }
      event.preventDefault();
      onStart(event);
    });
    target.addEventListener('pointermove', (event) => {
      if (live) onMove(event);
    });
    const finish = (event) => {
      if (!live) return;
      live = false;
      if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
      onEnd(event);
    };
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }

  /* ── controls ────────────────────────────────────────────────────────── */

  function buildControl(control, channel) {
    if (control.kind === 'scale') return buildScale(control, channel);
    if (control.kind === 'selector') return buildSelector(control);
    if (control.kind === 'bearing') return buildBearing(control);
    if (control.kind === 'facade') return buildFacade(control);
    if (control.kind === 'profile') return buildProfile(control);
    throw new Error(`the console cannot draw a ${control.kind}`);
  }

  /**
   * A ruled calibration face with a penciled tick.
   *
   * The range input is real and sits transparent over the drawing: it carries
   * the keyboard, the ARIA and the pointer handling, and the face below it is
   * what you actually look at. Reimplementing all of that on a div would have
   * cost the arrow keys, which are the only way to set one of these precisely.
   */
  function buildScale(control, channel) {
    const row = el('div', 'ctl ctl-scale');
    const head = el('div', 'ctl-head');
    const label = el('label', null, control.label);
    label.htmlFor = `k-${control.key}`;
    const value = el('output', 'ctl-value');
    value.htmlFor = `k-${control.key}`;

    // The question every scale can be asked: what would the rest of your face
    // do? Not on a priced channel — nothing it owns reaches the engine, so a
    // sweep of it could only redraw the numbers already on the sheet.
    let studyBtn = null;
    if (!channel?.prices) {
      studyBtn = el('button', 'study', 'Study');
      studyBtn.type = 'button';
      studyBtn.setAttribute(
        'aria-label',
        `Study ${control.label}: sweep from ${control.format(control.min)} to ${control.format(control.max)}`,
      );
      studyBtn.addEventListener('click', () => onStudy?.(control.key));
      studyButtons.set(control.key, studyBtn);
    }
    head.append(label, ...(studyBtn ? [studyBtn] : []), value);

    const face = el('div', 'face');
    const ruling = el('i', 'face-rule');
    const ghostTick = el('i', 'face-ghost');
    const tick = el('i', 'face-tick');
    const input = document.createElement('input');
    Object.assign(input, {
      type: 'range',
      id: `k-${control.key}`,
      min: control.min,
      max: control.max,
      step: control.step,
    });
    input.setAttribute('aria-label', control.label);
    face.append(ruling, ghostTick, tick, input);

    row.append(head, face);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    input.addEventListener('input', () => {
      markGesture(control.key);
      onChange(control.key, Number(input.value));
    });
    input.addEventListener('change', () => onChange(control.key, Number(input.value), true));

    const redraw = () => {
      const v = params[control.key];
      input.value = String(v);
      value.textContent = control.format(v);
      input.setAttribute('aria-valuetext', control.format(v));
      tick.style.left = `${clamp(control.fraction(v), 0, 1) * 100}%`;
      const was = ghost[control.key];
      const show = was != null && was !== v;
      ghostTick.hidden = !show;
      if (show) ghostTick.style.left = `${clamp(control.fraction(was), 0, 1) * 100}%`;
      const idle = control.needs ? !control.needs(params) : false;
      row.classList.toggle('idle', idle);
      // While its own sweep runs the button is a Stop and stays live whatever
      // the gate says; the gate, the patch bay and the idle state govern only
      // the asking. A control on a channel that is out of the path would
      // sweep twenty-one byte-identical models — the flat line the priced
      // exclusion exists to prevent, bought at full engine price.
      if (studyBtn && !studyBtn.dataset.running) {
        const out = !engaged.has(channel.id);
        const disabled = !sweepGate.ok || out || idle;
        const title = !sweepGate.ok
          ? sweepGate.reason
          : out
            ? 'This path is out of the model — patch it in to sweep it.'
            : idle
              ? 'Set, but not reaching the model — there is nothing to sweep.'
              : 'Sweep this control across its face: the desk solved at a score of positions, drawn as a curve.';
        // Written only on change: this redraw runs for every scale on every
        // synced frame of a drag, and attribute writes are never free.
        if (studyBtn.disabled !== disabled) studyBtn.disabled = disabled;
        if (studyBtn.title !== title) studyBtn.title = title;
      }
      // Dragging the swept control just walks the study's tick along its curve.
      cards.get(control.key)?.syncTick?.();
    };
    faces.set(control.key, redraw);
    rows.set(control.key, row);
    return row;
  }

  /** A small set of exclusive states on one segmented rule. */
  function buildSelector(control) {
    const row = el('div', 'ctl ctl-selector');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    row.append(head);

    const group = el('div', 'segments');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', control.label);
    const buttons = control.options.map((option) => {
      const button = el('button', 'segment', option.label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => {
        markGesture(control.key);
        onChange(control.key, option.value, true);
      });
      group.append(button);
      return { button, option };
    });
    row.append(group);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    faces.set(control.key, () => {
      const v = params[control.key];
      for (const { button, option } of buttons) {
        const here = option.value === v;
        button.classList.toggle('here', here);
        button.setAttribute('aria-checked', String(here));
      }
      row.classList.toggle('idle', control.needs ? !control.needs(params) : false);
    });
    return row;
  }

  /**
   * The north point, drawn as a rose you turn.
   *
   * The building turns under a fixed north, which is what actually happens in
   * the model: the vertices rotate and true north stays where it is.
   */
  function buildBearing(control) {
    const row = el('div', 'ctl ctl-bearing');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    const value = el('span', 'ctl-value');
    head.append(value);
    row.append(head);

    const R = 30;
    const root = svg('svg', { viewBox: '-40 -40 80 80', class: 'rose', role: 'img' });
    root.setAttribute('aria-label', control.label);
    root.append(svg('circle', { cx: 0, cy: 0, r: R, fill: 'none', stroke: 'var(--rule)', 'stroke-width': 1 }));
    for (let a = 0; a < 360; a += 15) {
      const t = (a * Math.PI) / 180;
      const long = a % 90 === 0;
      const r0 = long ? R - 7 : R - 3;
      root.append(
        svg('line', {
          x1: Math.sin(t) * r0, y1: -Math.cos(t) * r0,
          x2: Math.sin(t) * R, y2: -Math.cos(t) * R,
          stroke: long ? 'var(--rule-firm)' : 'var(--rule)', 'stroke-width': 1,
        }),
      );
    }
    const n = svg('text', {
      x: 0, y: -R + 13, 'text-anchor': 'middle', fill: 'var(--ink-3)',
      'font-family': 'var(--cond)', 'font-size': 9, 'letter-spacing': '0.1em',
    });
    n.textContent = 'N';
    root.append(n);

    // The plan of the building, turning inside the fixed rose.
    const plan = svg('g');
    plan.append(
      svg('rect', {
        x: -13, y: -9, width: 26, height: 18,
        fill: 'var(--redline-wash)', stroke: 'var(--redline)', 'stroke-width': 1.2,
      }),
    );
    // A tail on the face that starts out facing south, so the turn is readable.
    plan.append(svg('line', { x1: 0, y1: 9, x2: 0, y2: 17, stroke: 'var(--redline)', 'stroke-width': 1.2 }));
    root.append(plan);

    const handle = svg('circle', { cx: 0, cy: 0, r: R, fill: 'transparent', class: 'rose-grab' });
    root.append(handle);

    const set = (event) => {
      const box = root.getBoundingClientRect();
      const x = event.clientX - (box.left + box.width / 2);
      const y = event.clientY - (box.top + box.height / 2);
      let deg = (Math.atan2(x, -y) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      // Whole degrees, and snapped to the eight points within two degrees of
      // them: nobody means 44° when they are reaching for north-east.
      const snapped = Math.abs(deg % 45) < 2 || Math.abs((deg % 45) - 45) < 2
        ? Math.round(deg / 45) * 45
        : Math.round(deg);
      onChange(control.key, snapped % 360);
    };
    drag(handle, {
      onStart: (event) => {
        markGesture(control.key);
        set(event);
      },
      onMove: set,
      onEnd: () => onChange(control.key, params[control.key], true),
    });

    row.append(root);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    faces.set(control.key, () => {
      const v = params[control.key];
      value.textContent = control.format(v);
      plan.setAttribute('transform', `rotate(${v})`);
    });
    return row;
  }

  /**
   * Four walls on a plan key.
   *
   * Each wall's scale is ruled along its own edge, so the number you are
   * setting is beside the wall it belongs to and the four read as a parti
   * rather than as a list. The plan turns with the building, so once you have
   * rotated the box you can still see which opening now faces where.
   */
  function buildFacade(control) {
    const row = el('div', 'ctl ctl-facade');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    row.append(head);

    const root = svg('svg', { viewBox: '-56 -56 112 112', class: 'plan', role: 'group' });
    root.setAttribute('aria-label', control.label);

    const n = svg('text', {
      x: 0, y: -46, 'text-anchor': 'middle', fill: 'var(--ink-3)',
      'font-family': 'var(--cond)', 'font-size': 8.5, 'letter-spacing': '0.1em',
    });
    n.textContent = 'N';
    root.append(n);

    const turning = svg('g');
    root.append(turning);
    turning.append(
      svg('rect', { x: -26, y: -26, width: 52, height: 52, fill: 'none', stroke: 'var(--rule-firm)', 'stroke-width': 1 }),
    );

    // Where each wall's bar sits, at the box's default orientation: north is
    // the top edge, and the compass order of `sides` is N, E, S, W.
    const EDGES = {
      north: { x: 0, y: -34, rotate: 0 },
      east: { x: 34, y: 0, rotate: 90 },
      south: { x: 0, y: 34, rotate: 180 },
      west: { x: -34, y: 0, rotate: 270 },
    };

    const bars = control.sides.map((side) => {
      const place = EDGES[side.side];
      const g = svg('g', { transform: `translate(${place.x} ${place.y}) rotate(${place.rotate})` });
      g.append(svg('line', { x1: -24, y1: 0, x2: 24, y2: 0, stroke: 'var(--rule)', 'stroke-width': 1 }));
      const filled = svg('line', {
        x1: -24, y1: 0, x2: -24, y2: 0, stroke: 'var(--redline)', 'stroke-width': 2.5, 'stroke-linecap': 'butt',
      });
      g.append(filled);
      const cap = svg('text', {
        x: 0, y: -5, 'text-anchor': 'middle', fill: 'var(--ink-3)',
        'font-family': 'var(--mono)', 'font-size': 7.5,
      });
      g.append(cap);
      const grab = svg('rect', { x: -26, y: -8, width: 52, height: 16, fill: 'transparent', class: 'plan-grab' });
      g.append(grab);
      turning.append(g);

      const set = (event) => {
        const box = root.getBoundingClientRect();
        // Work in the bar's own frame: the plan turns, so the pointer has to be
        // brought back through the same rotation before it means anything.
        const px = ((event.clientX - box.left) / box.width) * 112 - 56;
        const py = ((event.clientY - box.top) / box.height) * 112 - 56;
        const t = (-(params.northAxis + place.rotate) * Math.PI) / 180;
        const local = px * Math.cos(t) - py * Math.sin(t);
        const f = clamp((local + 24) / 48, 0, 1);
        const raw = control.min + f * (control.max - control.min);
        onChange(side.key, Math.round(raw / control.step) * control.step);
      };
      drag(grab, {
        onStart: (event) => {
          markGesture(side.key);
          set(event);
        },
        onMove: set,
        onEnd: () => onChange(side.key, params[side.key], true),
      });

      return { side, filled, cap, place };
    });

    root.append(turning);
    row.append(root);

    const legend = el('div', 'plan-legend');
    const reads = control.sides.map((side) => {
      const item = el('div', 'plan-read');
      item.append(el('span', null, side.label));
      const out = el('b');
      item.append(out);
      legend.append(item);
      return { side, out };
    });
    row.append(legend);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    const redraw = () => {
      turning.setAttribute('transform', `rotate(${params.northAxis})`);
      for (const bar of bars) {
        const v = params[bar.side.key];
        const f = clamp(control.fraction(v), 0, 1);
        bar.filled.setAttribute('x2', String(-24 + f * 48));
        bar.cap.textContent = v > 0 ? v.toFixed(control.digits) : '';
        // Keep the lettering upright however far the plan has been turned.
        const total = params.northAxis + bar.place.rotate;
        bar.cap.setAttribute('transform', `rotate(${-total})`);
      }
      for (const read of reads) read.out.textContent = control.format(params[read.side.key]);
      row.classList.toggle('idle', control.needs ? !control.needs(params) : false);
    };
    for (const side of control.sides) faces.set(side.key, redraw);
    // The plan turns with the north axis, so it has to redraw when that moves.
    const already = faces.get('northAxis');
    faces.set('northAxis', already ? () => { already(); redraw(); } : redraw);
    return row;
  }

  /** The occupied span of a day, as a 24-cell band you sweep. */
  function buildProfile(control) {
    const row = el('div', 'ctl ctl-profile');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    const value = el('span', 'ctl-value');
    head.append(value);
    row.append(head);

    const root = svg('svg', { viewBox: '0 0 240 34', class: 'band', role: 'group' });
    root.setAttribute('aria-label', control.label);
    const cells = [];
    for (let h = 0; h < 24; h += 1) {
      const cell = svg('rect', {
        x: h * 10, y: 0, width: 10, height: 20,
        fill: 'transparent', stroke: 'var(--rule-soft)', 'stroke-width': 0.5,
      });
      root.append(cell);
      cells.push(cell);
    }
    for (const h of [0, 6, 12, 18, 24]) {
      const t = svg('text', {
        x: h * 10, y: 31, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle',
        fill: 'var(--ink-ghost)', 'font-family': 'var(--mono)', 'font-size': 7.5,
      });
      t.textContent = String(h).padStart(2, '0');
      root.append(t);
    }
    const grab = svg('rect', { x: 0, y: 0, width: 240, height: 20, fill: 'transparent', class: 'band-grab' });
    root.append(grab);
    row.append(root);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    let anchor = null;
    const hourAt = (event) => {
      const box = grab.getBoundingClientRect();
      return clamp(Math.floor(((event.clientX - box.left) / box.width) * 24), 0, 23);
    };
    const sweep = (event) => {
      const h = hourAt(event);
      onChange(control.from, Math.min(anchor, h));
      onChange(control.to, Math.max(anchor, h) + 1);
    };
    drag(grab, {
      onStart: (event) => {
        markGesture(control.from);
        markGesture(control.to);
        anchor = hourAt(event);
        sweep(event);
      },
      onMove: (event) => {
        if (anchor != null) sweep(event);
      },
      onEnd: () => {
        anchor = null;
        onChange(control.to, params[control.to], true);
      },
    });

    const redraw = () => {
      const [from, to] = [params[control.from], params[control.to]];
      cells.forEach((cell, h) => {
        const inside = h >= from && h < to;
        cell.style.fill = inside ? 'var(--redline)' : 'transparent';
        cell.style.fillOpacity = inside ? '0.5' : '0';
      });
      value.textContent = from >= to
        ? 'Never occupied'
        : `${String(from).padStart(2, '0')}:00 – ${String(to).padStart(2, '0')}:00`;
    };
    faces.set(control.from, redraw);
    faces.set(control.to, redraw);
    return row;
  }

  /* ── studies ─────────────────────────────────────────────────────────── */

  /**
   * The curve a sweep drew, under the control it swept.
   *
   * The x axis is `control.fraction` — the same 0..1 the face tick above it
   * uses — so the curve and the calibration face are one axis, stacked. What
   * the y axis reads is the study's `metric`: zone temperature extremes on a
   * free-running desk (the design days' own, or the year's), or the demand
   * intensities once ideal loads are in the path with a year to bill — where
   * the extremes would only letter the setpoints, the demand the system pays
   * to hold them is the curve worth drawing. A sample that failed is a gap in
   * the line, never a point invented across it. The redline stands where the
   * control stands now, and moving the control just walks it along the curve;
   * on a conditioned design-day desk the temperature lines still run flat at
   * the setpoints, which is not a failure of the study but its finding.
   */
  function studyCard(key, study) {
    const { control } = controlFor(key);
    const card = el('div', 'study-card');
    const head = el('div', 'study-head');
    head.append(el('span', 'study-tag', 'Study'));
    // Which desk this curve was swept against, the way the bill names what it
    // is pinned to. Everything else about the card assumes that desk.
    const desk = el('span', 'study-desk', `of ${study.label}`);
    desk.title = `Swept with the rest of the desk at ${study.label}`;
    const clear = el('button', 'link', 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', () => onStudyClear?.(key));
    head.append(desk, clear);
    card.append(head);

    const W = 240;
    const H = 64;
    const energy = study.metric === 'energy';
    // Which pens the metric takes. Temperatures are the signed pair outright.
    // TEDI and CEDI keep it deliberately: they are the year's heat asked into
    // and out of the zone — the rail's signed watts integrated, not a price
    // or an emission — so warm-in / cold-out encodes exactly the sign it does
    // everywhere else on the desk. The EUI, a directionless total like every
    // other energy figure on the sheet, is graphite.
    const series = energy
      ? [
          { sel: (p) => p.eui, pen: 'var(--ink)', name: 'EUI', said: 'building EUI' },
          { sel: (p) => p.tedi, pen: 'var(--warm)', name: 'TEDI', said: 'heating demand TEDI' },
          { sel: (p) => p.cedi, pen: 'var(--cold)', name: 'CEDI', said: 'cooling demand CEDI' },
        ]
      : [
          {
            sel: (p) => p.high,
            pen: 'var(--warm)',
            said: study.annual ? 'annual peak' : 'summer design-day peak',
          },
          {
            sel: (p) => p.low,
            pen: 'var(--cold)',
            said: study.annual ? 'annual low' : 'winter design-day low',
          },
        ];
    // The right gutter holds the curves' end labels: six mono characters of
    // "−18.7°" in one mode, "TEDI 142" in the other, which needs the wider cut.
    const plot = { x: 2, w: energy ? 190 : 200, top: 6, bottom: 42 };

    const vals = series.flatMap((s) => study.curve.map(s.sel).filter((v) => v != null));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const [dMin, dMax] = [lo - span * 0.08, hi + span * 0.08];
    const y = (v) => plot.bottom - ((v - dMin) / (dMax - dMin)) * (plot.bottom - plot.top);
    const x = (v) => plot.x + clamp(control.fraction(v), 0, 1) * plot.w;

    const range = (arr) => `${Math.min(...arr).toFixed(1)} to ${Math.max(...arr).toFixed(1)}`;
    const unit = energy ? 'kWh per square metre a year' : '°C';
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    root.setAttribute(
      'aria-label',
      `Study of ${control.label} from ${control.format(control.min)} to ${control.format(control.max)}: ` +
        series
          .map((s) => {
            const found = study.curve.map(s.sel).filter((v) => v != null);
            return found.length ? `${s.said} ${range(found)} ${unit}` : `no ${s.said} readings`;
          })
          .join('; ') +
        '.',
    );

    root.append(
      svg('line', {
        x1: plot.x, y1: plot.bottom + 0.5, x2: plot.x + plot.w, y2: plot.bottom + 0.5,
        stroke: 'var(--rule-firm)', 'stroke-width': 1, 'shape-rendering': 'crispEdges',
      }),
    );

    const segments = (sel) => {
      const segs = [];
      let seg = [];
      for (const p of study.curve) {
        const v = sel(p);
        if (v == null) {
          if (seg.length) segs.push(seg);
          seg = [];
        } else {
          seg.push([x(p.value), y(v)]);
        }
      }
      if (seg.length) segs.push(seg);
      return segs;
    };
    const draw = (sel, pen) => {
      for (const seg of segments(sel)) {
        // A run of one — a lone survivor between failures — still gets marked.
        if (seg.length === 1) {
          root.append(svg('circle', { cx: seg[0][0].toFixed(2), cy: seg[0][1].toFixed(2), r: 1.2, fill: pen }));
        } else {
          root.append(
            svg('polyline', {
              points: seg.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' '),
              fill: 'none', stroke: pen, 'stroke-width': 1.1, 'stroke-linejoin': 'round',
            }),
          );
        }
      }
    };
    for (const s of series) draw(s.sel, s.pen);

    // The curves' right-hand ends lettered directly in the gutter, the plate's
    // own move, settled top to bottom against a minimum gap when they converge.
    const labels = [];
    for (const s of series) {
      const found = study.curve.filter((p) => s.sel(p) != null);
      if (!found.length) continue;
      const v = s.sel(found[found.length - 1]);
      labels.push({
        text: energy ? `${s.name} ${v.toFixed(v >= 100 ? 0 : 1)}` : `${v.toFixed(1)}°`,
        pen: s.pen,
        y: clamp(y(v) + 2.5, plot.top + 5, plot.bottom),
      });
    }
    labels.sort((a, b) => a.y - b.y);
    for (const [i, l] of labels.entries()) {
      if (i > 0) l.y = Math.max(l.y, labels[i - 1].y + 9);
    }
    for (const l of labels) {
      const t = svg('text', {
        x: plot.x + plot.w + 5, y: l.y, fill: l.pen,
        'font-family': 'var(--mono)', 'font-size': 7.5,
      });
      t.textContent = l.text;
      root.append(t);
    }

    const foot = (text, fx, anchor, pen = 'var(--ink-ghost)') => {
      const t = svg('text', {
        x: fx, y: 56, 'text-anchor': anchor, fill: pen,
        'font-family': 'var(--mono)', 'font-size': 7.5,
      });
      t.textContent = text;
      root.append(t);
    };
    foot(control.format(control.min), plot.x, 'start');
    foot(control.format(control.max), plot.x + plot.w, 'end');
    // The intensities need their unit stated; degrees carry their own sign.
    if (energy) foot('kWh/m²·a', plot.x + plot.w / 2, 'middle');

    const tick = svg('line', {
      y1: plot.top - 2, y2: plot.bottom + 2, stroke: 'var(--redline)', 'stroke-width': 1,
    });
    root.append(tick);
    const syncTick = () => {
      const tx = x(params[key]).toFixed(2);
      tick.setAttribute('x1', tx);
      tick.setAttribute('x2', tx);
    };
    syncTick();

    card.append(root);
    return { node: card, kind: 'card', study, syncTick };
  }

  /* ── meters ──────────────────────────────────────────────────────────── */

  function buildMeter(channel) {
    if (!channel.meter) return null;
    const node = el('div', 'meter');
    const head = el('div', 'meter-head');
    head.append(el('span', 'meter-label', channel.meter.label));
    if (channel.meter.rail) head.append(el('i', 'meter-rail', 'rail'));
    const value = el('b', 'meter-value', '—');
    head.append(value);
    node.append(head);

    const bar = el('div', 'meter-bar');
    const fill = el('i', 'meter-fill');
    bar.append(el('i', 'meter-zero'), fill);
    node.append(bar);
    if (channel.meter.note) node.append(el('p', 'meter-note', channel.meter.note));
    return { node, value, fill, bar };
  }

  /* ── gestures ────────────────────────────────────────────────────────── */

  // Where a control stood when the current gesture began, so the face can show
  // a ghost of it — the same reading the plate gives with its "was" curve.
  function markGesture(key) {
    if (!(key in ghost)) ghost[key] = params[key];
  }

  const isBypassed = (id) => Boolean(bypass[id]);

  /* ── the public face ─────────────────────────────────────────────────── */

  const api = {
    /** Redraw one control, or all of them. */
    sync(key) {
      if (key) faces.get(key)?.();
      else for (const redraw of faces.values()) redraw();
    },

    /** Forget the ghosts: a gesture has ended and this is the new baseline. */
    settle() {
      ghost = {};
      api.sync();
    },

    get solo() {
      return solo;
    },

    set solo(next) {
      solo = next;
    },

    /** Letter every strip against the state the model reports. */
    setState(state) {
      engaged = new Set([...state].filter(([, s]) => s.engaged).map(([id]) => id));
      for (const channel of CHANNELS) {
        const here = strips.get(channel.id);
        const s = state.get(channel.id);
        here.strip.classList.toggle('out', !s.engaged);
        here.strip.classList.toggle('blocked', Boolean(s.blocked));
        here.strip.classList.toggle('soloed', solo === channel.id);
        here.note.hidden = !s.blocked;
        here.note.textContent = s.blocked ?? '';
        // The index row's marker draws this with a colour; this is the same
        // reading in words, so the folded row answers "is it in the model" to a
        // reader who is being read it rather than looking at it.
        if (here.mark) here.mark.setAttribute('aria-label', s.engaged ? 'In the model' : 'Out of the model');
        if (here.patch) {
          here.patch.classList.toggle('on', !s.bypassed);
          here.patch.setAttribute('aria-pressed', String(!s.bypassed));
          here.patch.lastChild.textContent = s.bypassed ? 'Out' : 'In';
        }
        if (here.solo) {
          here.solo.classList.toggle('on', solo === channel.id);
          here.solo.setAttribute('aria-pressed', String(solo === channel.id));
        }
      }
      api.sync();
    },

    /**
     * Put the readings on the strips and draw the rail.
     *
     * `readings` is a map of channel id to watts, or to null for a channel
     * whose series the ESO did not carry. Null is lettered as an em dash and
     * kept out of the rail — a meter with nothing behind it must not read zero,
     * because zero is a measurement and this is the absence of one.
     */
    setReadings(readings, derived, at = null) {
      reading = at;
      const magnitudes = [...readings.values()].filter((v) => Number.isFinite(v)).map(Math.abs);
      const scale = Math.max(1, ...magnitudes);

      for (const channel of CHANNELS) {
        const here = strips.get(channel.id);
        // The folded row carries the same figure its meter does, because that
        // reading is half of what the index is for. A channel with no meter
        // leaves the cell blank: there is no figure missing, there is no
        // figure, and an em dash would claim otherwise.
        if (!here.meter) continue;
        if (channel.meter.derived) {
          const lettered = derived?.get(channel.id) ?? '—';
          here.meter.value.textContent = lettered;
          here.read.textContent = lettered;
          here.meter.bar.hidden = true;
          continue;
        }
        here.meter.bar.hidden = false;
        const w = readings.get(channel.id);
        const lettered = watts(w);
        here.meter.value.textContent = lettered;
        here.read.textContent = lettered;
        const has = Number.isFinite(w);
        here.meter.fill.hidden = !has;
        if (!has) continue;
        const f = clamp(Math.abs(w) / scale, 0, 1) * 50;
        here.meter.fill.style.left = w >= 0 ? '50%' : `${50 - f}%`;
        here.meter.fill.style.width = `${f}%`;
        here.meter.fill.style.background = w >= 0 ? 'var(--warm)' : 'var(--cold)';
      }

      drawRail(readings);
    },

    /**
     * Draw, restyle or remove the study card under one control.
     *
     * Re-called on every `applyGeometry`, so the same study object restyles in
     * place rather than rebuilding — staleness moves per drag frame, the card
     * itself only when a sweep lands or clears.
     */
    setStudy(key, study, { stale = false } = {}) {
      const have = cards.get(key);
      if (study && have?.study === study) {
        have.node.classList.toggle('stale', stale);
        return;
      }
      have?.node.remove();
      cards.delete(key);
      if (!study) return;
      const row = rows.get(key);
      // A throw, not a skip: a card registered but hung nowhere would be a
      // sweep that reports "Study drawn" over a console showing nothing.
      if (!row) throw new Error(`no control row to hang the study of ${key} on`);
      const made = studyCard(key, study);
      made.node.classList.toggle('stale', stale);
      row.after(made.node);
      cards.set(key, made);
    },

    /** The sweep in flight: its button reads Stop, its card counts the runs. */
    setStudyProgress(key, progress) {
      const btn = studyButtons.get(key);
      if (!progress) {
        if (btn) {
          delete btn.dataset.running;
          btn.textContent = 'Study';
          btn.classList.remove('on');
        }
        const have = cards.get(key);
        if (have?.kind === 'wait') {
          have.node.remove();
          cards.delete(key);
        }
        api.sync(key);
        return;
      }
      if (btn) {
        btn.dataset.running = '1';
        btn.disabled = false;
        btn.textContent = 'Stop';
        btn.classList.add('on');
        btn.title = 'Set this study aside';
      }
      let have = cards.get(key);
      if (have?.kind !== 'wait') {
        const row = rows.get(key);
        if (!row) throw new Error(`no control row to count the study of ${key} under`);
        have?.node.remove();
        const node = el('div', 'study-card');
        const head = el('div', 'study-head');
        const wait = el('span', 'study-wait');
        head.append(el('span', 'study-tag', 'Study'), wait);
        node.append(head);
        have = { node, kind: 'wait', wait };
        row.after(node);
        cards.set(key, have);
      }
      have.wait.textContent = `Solving ${progress.done} / ${progress.total}`;
    },

    /** Whether a study can be asked for, with the reason lettered when not. */
    setSweepEnabled(ok, reason) {
      sweepGate = { ok, reason };
      api.sync();
    },

    /** The studies go with the climate they were swept under. */
    clearStudies() {
      for (const { node } of cards.values()) node.remove();
      cards.clear();
    },
  };

  /**
   * The master bus: the zone air heat balance, as one signed rail.
   *
   * Zero is at the centre. Terms adding heat to the zone air stack out to the
   * right in the warm pen, terms taking it away stack out to the left in the
   * cold one, and the two sides are the same length when the balance closes.
   * When it does not, the shortfall is drawn as a hatched stub and lettered,
   * because a rail that quietly rescaled itself to look balanced would be the
   * one dishonest thing on the sheet.
   */
  function drawRail(readings) {
    railHost.textContent = '';
    const terms = CHANNELS.filter((c) => c.meter?.rail)
      .map((c) => ({ channel: c, w: readings.get(c.id) }))
      .filter((t) => Number.isFinite(t.w) && Math.abs(t.w) > 0.5);

    const head = el('div', 'rail-head');
    head.append(el('p', 'eyebrow', 'Zone air heat balance'));
    railHost.append(head);
    // Every meter on the desk is an instantaneous reading, so the rail has to
    // say which instant, or the numbers are unfalsifiable.
    if (reading) railHost.append(el('p', 'rail-when', `Read at ${reading}`));

    if (!terms.length) {
      railHost.append(el('p', 'rail-empty', 'No solved run to balance yet.'));
      return;
    }

    const into = terms.filter((t) => t.w > 0).reduce((a, t) => a + t.w, 0);
    const outOf = terms.filter((t) => t.w < 0).reduce((a, t) => a - t.w, 0);
    const residual = into - outOf;
    const scale = Math.max(into, outOf) || 1;
    head.append(el('b', 'rail-total', `± ${watts(Math.max(into, outOf))}`));

    /*
     * Adjacent segments on the same side of zero share a hue, because the hue
     * is the sign and nothing else is allowed to claim it. So they are told
     * apart by tone instead: each step out from zero is mixed further towards
     * the trough it sits in, which is the same "one hue, shift only lightness"
     * move the surfaces make. Mixing towards `--inset` rather than to a fixed
     * lighter colour is what keeps the ramp working in both themes, where it
     * steps down in light and up in dark.
     *
     * Largest term nearest zero, so the ramp also ranks them.
     */
    const TONES = [100, 72, 50, 35, 26];
    const toneOf = (w, i) =>
      `color-mix(in srgb, var(${w >= 0 ? '--warm' : '--cold'}) ${
        TONES[Math.min(i, TONES.length - 1)]
      }%, var(--inset))`;

    const order = (side) =>
      terms
        .filter((t) => (side === 'into' ? t.w > 0 : t.w < 0))
        .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
        .map((t, i) => ({ ...t, side, fill: toneOf(t.w, i) }));
    const laid = [...order('into'), ...order('outof')];

    const track = el('div', 'rail-track');
    for (const side of ['into', 'outof']) {
      let run = 0;
      for (const t of laid.filter((x) => x.side === side)) {
        const w = Math.abs(t.w);
        const seg = el('i', `rail-seg ${side}`);
        seg.style[side === 'into' ? 'left' : 'right'] = `${50 + (run / scale) * 50}%`;
        seg.style.width = `${(w / scale) * 50}%`;
        seg.style.background = t.fill;
        seg.title = `${t.channel.name}: ${watts(t.w)}`;
        track.append(seg);
        run += w;
      }
    }
    track.append(el('i', 'rail-zero'));
    railHost.append(track);

    const key = el('div', 'rail-key');
    // Keyed in the order they are laid on the rail, so a swatch can be matched
    // to its segment by walking outwards from the centre.
    for (const t of laid) {
      const item = el('div', 'rail-item');
      const swatch = el('i', 'rail-swatch');
      swatch.style.background = t.fill;
      item.append(swatch, el('span', null, t.channel.name), el('b', null, watts(t.w)));
      key.append(item);
    }
    railHost.append(key);

    // A term that is out of the path is not reported at all, so the rail is
    // being asked to balance an equation with pieces missing. Saying which
    // pieces is the only honest thing to print; blaming the arithmetic when the
    // cause is a patch you pulled would be worse than printing nothing.
    const missing = CHANNELS.filter((c) => c.meter?.rail && !engaged.has(c.id));
    const closure = Math.abs(residual) / scale;
    const note = el('p', 'rail-note');
    if (missing.length) {
      note.textContent =
        `${missing.map((c) => c.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} out of the path and not reported, so the rail is weighing ${terms.length} of the balance's five terms rather than closing it.`;
      note.classList.add('loose');
      railHost.append(note);
      return;
    }
    if (scale < 50) {
      // A free-running zone at quasi-steady state really does balance at a few
      // watts: the air itself stores almost nothing, so whatever the surfaces
      // hand it, it hands straight back. Quoting a percentage of a 4 W stack
      // would be arithmetic, not a reading.
      note.textContent =
        'Every path is within a few watts of balance. Nothing is driving this zone at this hour — patch in Air, Gains or System to give the rail something to weigh.';
    } else if (closure < 0.01) {
      note.textContent = `Closes to ${(closure * 100).toFixed(2)} %.`;
    } else {
      note.textContent = `Unclosed by ${watts(residual)}, ${(closure * 100).toFixed(1)} % of the stack. These are hourly means of sub-hourly terms, so they do not cancel exactly.`;
      note.classList.add('loose');
    }
    railHost.append(note);
  }

  api.sync();
  return api;
}
