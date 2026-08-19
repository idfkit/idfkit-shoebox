import {
  CHANNELS,
  DAYS_IN_MONTH,
  MONTHS,
  WEEKDAY_LABELS,
  controlFor,
  coveredDays,
  labelFor,
  parseHolidays,
  resolveHoliday,
  runDays,
  serializeHolidays,
} from './controls.js';
import { quantityField } from './field.js';

/**
 * The model console: a recall sheet for the zone heat balance.
 *
 * Eighteen channel strips in signal order, every control visible at once, no
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
  host, params, bypass, onChange, onPatch, onSolo, onReset, onStudy, onStudyClear, onPin,
}) {
  const strips = new Map(); // channel id -> { redraw(), meter, patch, solo }
  const faces = new Map(); // parameter key -> redraw for that control
  // Parameter key -> the node a study card hangs after: the control's own row
  // for the kinds that own one key, and a per-wall anchor for a plan key,
  // which owns four and can carry four curves at once.
  const rows = new Map();
  const cards = new Map(); // parameter key -> { node, kind, study, syncTick }
  const studyButtons = new Map(); // parameter key -> that scale's Study button
  const daysWidgets = new Map(); // parameter key -> that list's weather-file offer
  let solo = null;
  // The instant every meter on the desk is reading at: `{ text, pinned,
  // released }`, or null before anything has been solved.
  let reading = null;
  // The rail's pin, as of the last redraw. Held because the rail is rebuilt
  // whole on every reading, so the node that took a click is never the node
  // that has to take the focus back.
  let whenButton = null;
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
   * drawing and becomes a page of its own, where eighteen strips laid end to end
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
      // the index should meet eighteen rows, not eighteen rows and a hundred
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

    const readout = buildReadout(channel);
    if (readout) fold.append(readout.node);

    const meter = buildMeter(channel);
    if (meter) fold.append(meter.node);
    strip.append(fold);

    strips.set(channel.id, {
      strip, note, patch, solo: soloBtn, meter, readout, body, toggle, read, fold,
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
    if (control.kind === 'facade') return buildFacade(control, channel);
    if (control.kind === 'boundary') return buildBoundary(control);
    if (control.kind === 'profile') return buildProfile(control);
    if (control.kind === 'calendar') return buildCalendar(control);
    if (control.kind === 'days') return buildDays(control);
    throw new Error(`the console cannot draw a ${control.kind}`);
  }

  /**
   * The question every swept control carries: what would the rest of your
   * face do?
   *
   * Not on a priced channel — nothing it owns reaches the engine, so a sweep
   * of it could only redraw the numbers already on the sheet. `name` is the
   * subject as the offer says it, which for one wall of a plan key is that
   * wall and not the group: four buttons under one label would otherwise all
   * announce themselves identically.
   */
  function studyOffer(key, name, control, channel) {
    if (channel?.prices) return null;
    const btn = el('button', 'study', 'Study');
    btn.type = 'button';
    btn.setAttribute(
      'aria-label',
      `Study ${name}: sweep from ${control.format(control.min)} to ${control.format(control.max)}`,
    );
    btn.addEventListener('click', () => onStudy?.(key));
    studyButtons.set(key, btn);
    return btn;
  }

  /**
   * Whether that offer can be taken as the desk stands, with the reason
   * lettered when it cannot.
   *
   * While its own sweep runs the button is a Stop and stays live whatever the
   * gate says; the gate, the patch bay and the idle state govern only the
   * asking. A control on a channel that is out of the path would sweep
   * twenty-one byte-identical models — the flat line the priced exclusion
   * exists to prevent, bought at full engine price. `unreached` is what a
   * plan key's wall says for itself, since one row-wide note cannot name
   * which of four walls is inert.
   *
   * Written only on change: this runs for every control on every synced frame
   * of a drag, and attribute writes are never free.
   */
  function syncStudyOffer(btn, channel, { idle, unreached = null }) {
    if (!btn || btn.dataset.running) return;
    const out = !engaged.has(channel.id);
    const disabled = !sweepGate.ok || out || idle;
    const title = !sweepGate.ok
      ? sweepGate.reason
      : out
        ? 'This path is out of the model — patch it in to sweep it.'
        : idle
          ? unreached ?? 'Set, but not reaching the model — there is nothing to sweep.'
          : 'Sweep this control across its face: the desk solved at a score of positions, drawn as a curve.';
    if (btn.disabled !== disabled) btn.disabled = disabled;
    if (btn.title !== title) btn.title = title;
  }

  /**
   * The landmark rule that hangs under a calibration face.
   *
   * Drawn as dimension lines, which is what they are: a hairline the width of
   * the band with a serif at each end, and for a landmark that is a single
   * value — a code limit, an engine default — the serif alone. They are marks
   * and deliberately not controls. A row of tappable pips under every scale
   * would put four more tab stops on each of sixty faces, and the drafting
   * idiom is right as well as cheap: the graduations on a scale rule are read,
   * not pressed.
   *
   * So the marks are unlettered and the reading below letters them, one at a
   * time, as the tick is dragged past. Sweeping a face reads out its whole key.
   */
  function buildMarks(control) {
    if (!control.landmarks.length) return null;
    const rule = el('div', 'face-marks');
    const marks = control.landmarks.map((mark) => {
      const from = clamp(control.fraction(mark.from), 0, 1);
      const to = clamp(control.fraction(mark.to), 0, 1);
      const pip = el('i', mark.exact ? 'face-mark point' : 'face-mark');
      pip.style.left = `${from * 100}%`;
      if (!mark.exact) pip.style.width = `${(to - from) * 100}%`;
      pip.title = mark.caption(control);
      rule.append(pip);
      return { mark, pip };
    });
    return {
      rule,
      // Which band the reading stands in is a tone, not a hue: the one you are
      // in comes up to full graphite and the rest stay at ghost weight, the
      // same move the balance rail makes to tell its segments apart.
      //
      // Which band that is comes from `landmarkAt` rather than from each
      // mark's own `holds`, so the rule that lights a mark and the rule that
      // letters the line under it are one rule. They were two, and at a zero
      // stop they disagreed: `infWind` and `infStack` start at `None` with the
      // engine's own zero declared as a landmark, so the face drew that mark
      // at full graphite over a reading the desk had deliberately left blank.
      sync(v) {
        const here = control.landmarkAt(v);
        for (const { mark, pip } of marks) pip.classList.toggle('here', mark === here);
      },
    };
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
    // The reading is also the way to set it — see `field.js`. It carries no
    // `htmlFor` of its own: an editable field is its own control, not an
    // output of the face beside it, and it names itself for the reader.
    const value = quantityField({
      control,
      name: control.label,
      read: () => params[control.key],
      write: (v) => onChange(control.key, v, true),
      className: 'ctl-value',
    });

    const studyBtn = studyOffer(control.key, control.label, control, channel);
    head.append(label, ...(studyBtn ? [studyBtn] : []), value.node);

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
    const marks = buildMarks(control);
    // The whole key, on the input rather than on the face, because the input is
    // what a screen reader lands on and the face is a drawing it never reaches.
    if (marks) {
      input.setAttribute('aria-description', control.landmarkSummary());
      row.append(marks.rule);
    }
    const standing = marks ? el('p', 'ctl-standing') : null;
    if (standing) row.append(standing);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    input.addEventListener('input', () => {
      markGesture(control.key);
      onChange(control.key, Number(input.value));
    });
    input.addEventListener('change', () => onChange(control.key, Number(input.value), true));

    const redraw = () => {
      const v = params[control.key];
      input.value = String(v);
      value.show();
      // The landmark rides in the spoken value, not only in the drawing. A
      // reader who cannot see the marks hears "1.80 W/m²K, low-e double" as
      // the arrow keys walk the face, which is the whole of what the rule
      // under it is for.
      const said = control.standing(v);
      input.setAttribute('aria-valuetext', said ? `${control.format(v)}, ${said}` : control.format(v));
      if (standing) {
        // One line, always, clipped with its whole text on the title. A
        // reading that grew to two lines as it was dragged past a long band
        // name would relayout the strip's column under the reader's hand,
        // which is the same failure blanking the finding used to cause on the
        // sheet. `.study-desk` clips its one long string for the same reason.
        standing.textContent = said ?? '';
        standing.title = said ?? '';
        standing.classList.toggle('between', !control.landmarkAt(v));
      }
      marks?.sync(v);
      tick.style.left = `${clamp(control.fraction(v), 0, 1) * 100}%`;
      const was = ghost[control.key];
      const show = was != null && was !== v;
      ghostTick.hidden = !show;
      if (show) ghostTick.style.left = `${clamp(control.fraction(was), 0, 1) * 100}%`;
      const idle = control.needs ? !control.needs(params) : false;
      row.classList.toggle('idle', idle);
      syncStudyOffer(studyBtn, channel, { idle });
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
   *
   * Each wall carries its own Study offer, in the legend under the plan where
   * that wall's number is already lettered. Four separate offers rather than
   * one for the plan key, because a study moves one parameter and holds the
   * rest of the desk still — and the whole reason this control is a plan key
   * is that its four walls are four different decisions. "What does the west
   * elevation cost?" is the question, and it is not answerable by turning all
   * four at once.
   */
  function buildFacade(control, channel) {
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
      // The same landmarks the calibration faces carry, ruled along the wall
      // they belong to. All four walls of a plan key share one scale, so each
      // bar gets the whole set rather than the plan getting one key beside it:
      // the number you are setting has to be beside the wall it belongs to,
      // which is the argument for the plan key in the first place.
      const marks = control.landmarks.map((mark) => {
        const x1 = -24 + clamp(control.fraction(mark.from), 0, 1) * 48;
        const x2 = -24 + clamp(control.fraction(mark.to), 0, 1) * 48;
        const pen = svg('g', { class: 'plan-mark', 'pointer-events': 'none' });
        if (!mark.exact) {
          pen.append(svg('line', { x1, y1: 4, x2, y2: 4, 'stroke-width': 0.75 }));
        }
        for (const x of mark.exact ? [x1] : [x1, x2]) {
          pen.append(svg('line', { x1: x, y1: 2.4, x2: x, y2: 5.6, 'stroke-width': 0.75 }));
        }
        g.append(pen);
        return { mark, pen };
      });
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

      return { side, group: g, filled, cap, place, marks };
    });

    root.append(turning);
    row.append(root);

    const legend = el('div', 'plan-legend');
    const reads = control.sides.map((side) => {
      const item = el('div', 'plan-read');
      item.append(el('span', null, side.label));
      // One wall's number, typed where it is lettered. A plan key is dragged
      // along a 48-unit bar, which is coarser than any of the four scales it
      // stands for, so this is the only way to set a wall exactly.
      const out = quantityField({
        control,
        name: labelFor(side.key),
        read: () => params[side.key],
        write: (v) => onChange(side.key, v, true),
      });
      item.append(out.node);
      // A legend column is about fifty pixels wide, which holds a band's name
      // and cannot hold a sentence. So the cell letters the landmark the wall
      // is standing in and stays blank between two — unlike a calibration
      // face, which has the width for the whole reading. The between-form is
      // not lost: it is on the cell's `title`, and it is what the wall's bar
      // shows positionally anyway. The line is kept in the flow whether or not
      // it has words, so four walls crossing bands do not walk the legend up
      // and down the page.
      const stand = control.landmarks.length ? el('small', 'plan-mark-read') : null;
      if (stand) item.append(stand);
      const studyBtn = studyOffer(side.key, labelFor(side.key), control, channel);
      if (studyBtn) item.append(studyBtn);
      legend.append(item);
      return { side, item, out, stand, studyBtn };
    });
    row.append(legend);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    // Four curves can stand under one plan key, so each wall gets an anchor of
    // its own and its card is hung after that. A card is inserted after the
    // node `rows` holds, and four keys sharing the row itself would stack
    // their curves in whatever order the sweeps happened to land in, under a
    // control that is drawn in compass order. The anchors are empty and carry
    // no box of their own.
    const bay = el('div', 'plan-studies');
    for (const side of control.sides) {
      const anchor = el('div', 'plan-study');
      bay.append(anchor);
      rows.set(side.key, anchor);
    }
    row.append(bay);

    const redraw = () => {
      turning.setAttribute('transform', `rotate(${params.northAxis})`);
      const spent = control.needs ? !control.needs(params) : false;
      for (const bar of bars) {
        const v = params[bar.side.key];
        const f = clamp(control.fraction(v), 0, 1);
        bar.filled.setAttribute('x2', String(-24 + f * 48));
        bar.cap.textContent = v > 0 ? v.toFixed(control.digits) : '';
        // Keep the lettering upright however far the plan has been turned.
        const total = params.northAxis + bar.place.rotate;
        bar.cap.setAttribute('transform', `rotate(${-total})`);
        // A wall whose number reaches nothing is greyed on the plan as well as
        // in the legend, at the bar you would reach for — the row-wide `idle`
        // the other kinds use cannot say "this one and not those three".
        bar.group.classList.toggle('idle', !bar.side.reaches(params));
        // The band this wall stands in, read the one way the whole desk reads
        // it — see `buildMarks`, where the two rules first came apart.
        const here = control.landmarkAt(v);
        for (const { mark, pen } of bar.marks) pen.classList.toggle('here', mark === here);
      }
      for (const read of reads) {
        const v = params[read.side.key];
        read.out.show();
        if (read.stand) {
          const said = control.standing(v);
          read.stand.textContent = control.landmarkAt(v)?.label ?? '';
          read.item.title = said
            ? `${labelFor(read.side.key)}: ${control.format(v)} — ${said}`
            : `${labelFor(read.side.key)}: ${control.format(v)}`;
        }
        // Only the wall's own reason dims the legend entry: were the whole
        // control idle as well, two nested 0.4s would take the reading to a
        // sixth of its ink and out of legibility altogether.
        const reaches = read.side.reaches(params);
        read.item.classList.toggle('idle', !reaches);
        syncStudyOffer(read.studyBtn, channel, {
          idle: spent || !reaches,
          unreached: reaches ? null : read.side.reasonFor(params),
        });
      }
      row.classList.toggle('idle', spent);
      // Dragging a wall walks its own study's tick along its curve.
      for (const side of control.sides) cards.get(side.key)?.syncTick?.();
    };
    for (const side of control.sides) faces.set(side.key, redraw);
    // The plan turns with the north axis, so it has to redraw when that moves.
    const already = faces.get('northAxis');
    faces.set('northAxis', already ? () => { already(); redraw(); } : redraw);
    return row;
  }

  /**
   * The six surfaces of the box: a plan with a section drawn through it.
   *
   * Which surfaces are adiabatic is one decision about a building — a party
   * wall, a floor over a heated space, one bay cut out of a terrace — so it is
   * set at the places the surfaces stand rather than as six rows of
   * `Adiabatic / Outdoors` that would read as six unrelated switches. The four
   * walls are the edges of the plan and turn with it, exactly as the glazing
   * key's bars do. The roof and the floor cannot be in a plan at all — a plan
   * is a horizontal cut and they are the two things it cuts through — so they
   * are drawn as the section they would appear in, the roof above the floor,
   * inside the square the walls make.
   *
   * A surface has two states and no third, so the gesture is a flip rather
   * than a choice: tap the wall, or tap its entry in the legend. The legend
   * entries are real buttons, which is what makes the whole key reachable from
   * the keyboard — the bars in the drawing are pointer targets over the same
   * six parameters.
   *
   * The convention is the one a drawing already uses: a surface open to the
   * weather is a single hairline, and an adiabatic one is doubled inward, the
   * way a party wall is drawn on any plan, so reading the key needs no key of
   * its own. The axonometric says the same thing in the way a drawing says it
   * of a face rather than of an edge — it hatches the surface, as a section
   * hatches what it cuts.
   */
  function buildBoundary(control) {
    const row = el('div', 'ctl ctl-boundary');
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

    // The walls are the edges of the plan themselves, not bars set outside it:
    // the thing being set here *is* the wall, where the glazing key's bars are
    // a scale that belongs to one. Local +y points into the box under every
    // one of these rotations, which is what lets one offset double every wall
    // inward without four special cases.
    const EDGES = {
      north: { x: 0, y: -34, rotate: 0 },
      east: { x: 34, y: 0, rotate: 90 },
      south: { x: 0, y: 34, rotate: 180 },
      west: { x: -34, y: 0, rotate: 270 },
    };
    // The section: two lines through the middle of the plan, shorter than the
    // walls so the square still reads as a square behind them, and set clear
    // of where the walls letter themselves.
    const SECTION = {
      roof: { y: -16, half: 18, inward: 1, label: 8 },
      floor: { y: 16, half: 18, inward: -1, label: -8 },
    };
    // Each wall letters itself just inside its own edge — outside would put the
    // north wall's letter under the key's own north point, which marks true
    // north and does not turn with the building. Seven units in clears the
    // section by thirteen.
    const WALL_CAP = 7;

    const flip = (face) => {
      markGesture(face.key);
      onChange(face.key, face.flip(params[face.key]), true);
    };

    const marks = control.faces.map((face) => {
      const place = EDGES[face.face];
      const cut = SECTION[face.face];
      const g = svg('g', place
        ? { transform: `translate(${place.x} ${place.y}) rotate(${place.rotate})` }
        : {});
      // Every face is one edge drawn one of two ways. The single line and the
      // doubled pair are both built now and shown one at a time, so a flip
      // costs an attribute rather than a rebuild.
      const half = place ? 34 : cut.half;
      const inward = place ? 1 : cut.inward;
      const at = place ? 0 : cut.y;
      const line = (offset, attrs) =>
        svg('line', { x1: -half, y1: at + offset, x2: half, y2: at + offset, ...attrs });
      const open = line(0, { stroke: 'var(--rule-firm)', 'stroke-width': 1 });
      const shut = svg('g', { stroke: 'var(--ink)', 'stroke-width': 1.1 });
      shut.append(line(0), line(inward * 3));
      g.append(open, shut);

      const capY = place ? WALL_CAP : at + cut.label;
      const cap = svg('text', {
        x: 0, y: capY,
        'text-anchor': 'middle', fill: 'var(--ink-3)',
        'font-family': 'var(--cond)', 'font-size': 7, 'letter-spacing': '0.11em',
      });
      cap.textContent = face.label.toUpperCase();
      g.append(cap);

      // The targets are sized so that a wall's and the section's can never
      // overlap however far the plan has been turned: a wall's inner edge
      // stands 28 units off centre, and the section's furthest corner 26.
      const reach = place ? half : half - 2;
      const grab = svg('rect', {
        x: -reach, y: at - (place ? 6 : 4), width: reach * 2, height: place ? 12 : 8,
        fill: 'transparent', class: 'plan-flip',
      });
      grab.addEventListener('click', () => flip(face));
      g.append(grab);

      (place ? turning : root).append(g);
      return { face, group: g, open, shut, cap, capY, place };
    });

    row.append(root);

    // Six entries where a plan key has four, so three to a line rather than
    // four: `Adiabatic` is a word and not a number, and six of them across one
    // column of the console would each be two characters wide.
    const legend = el('div', 'plan-legend six');
    const reads = control.faces.map((face) => {
      const item = el('button', 'plan-read face-read');
      item.type = 'button';
      item.append(el('span', null, face.label));
      const out = el('b');
      item.append(out);
      item.addEventListener('click', () => flip(face));
      legend.append(item);
      return { face, item, out };
    });
    row.append(legend);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    const redraw = () => {
      turning.setAttribute('transform', `rotate(${params.northAxis})`);
      for (const mark of marks) {
        const shut = mark.face.shut(params[mark.face.key]);
        mark.open.style.display = shut ? 'none' : '';
        mark.shut.style.display = shut ? '' : 'none';
        // Keep the lettering upright however far the plan has been turned.
        if (mark.place) {
          const total = params.northAxis + mark.place.rotate;
          mark.cap.setAttribute('transform', `rotate(${-total} 0 ${mark.capY})`);
        }
      }
      for (const read of reads) {
        const state = params[read.face.key];
        read.out.textContent = read.face.format(state);
        read.item.setAttribute('aria-pressed', String(read.face.shut(state)));
        read.item.setAttribute(
          'aria-label',
          `${labelFor(read.face.key)}: ${state}. Flip to ${read.face.flip(state)}.`,
        );
      }
    };
    for (const face of control.faces) faces.set(face.key, redraw);
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

  /**
   * The year, as twelve months you take in and out of the run.
   *
   * Two calibration faces could only ever describe one unbroken span, so the
   * question this control exists to answer — solve January and July, skip the
   * spring — could not be asked at all. Twelve cells can be worked three ways,
   * because the desk is read on three kinds of screen: tapped one at a time,
   * swept in one gesture the way the occupancy band is swept, or walked with
   * the arrow keys and toggled from the keyboard. The cells are real buttons on
   * a grid rather than an SVG band for that last reason — the band has no
   * keyboard at all, and a year is a set rather than a span, so there is
   * nothing here for a range input to carry.
   *
   * The line under the grid says how many run periods the mask makes. That is
   * not decoration: one group of months is one `RunPeriod`, two groups are two,
   * and the count is the EnergyPlus fact a reader has to have in order to
   * understand why the chart below grows another band.
   */
  function buildCalendar(control) {
    const row = el('div', 'ctl ctl-calendar');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    const value = el('span', 'ctl-value');
    head.append(value);
    row.append(head);

    const grid = el('div', 'months');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', control.label);

    const mask = () => params[control.key];
    const set = (i, on) => {
      const next = mask();
      if (next[i] === (on ? '1' : '0')) return;
      // The floor: a weather-file run with no months in it is a run period
      // EnergyPlus refuses to start, so the last month standing cannot be
      // taken out. The cell says so rather than doing nothing quietly.
      if (!on && [...next].filter((c) => c === '1').length === 1) return;
      markGesture(control.key);
      onChange(control.key, `${next.slice(0, i)}${on ? '1' : '0'}${next.slice(i + 1)}`);
    };

    const cells = MONTHS.map((name, i) => {
      const cell = el('button', 'month', name);
      cell.type = 'button';
      cell.setAttribute('role', 'checkbox');
      cell.dataset.month = String(i);
      cell.tabIndex = i === 0 ? 0 : -1;
      // A pointer click is already handled on `pointerdown` below, where the
      // sweep starts, and the gesture calls `preventDefault`. What still
      // arrives here is activation that came from somewhere else: Enter and
      // Space on the focused cell, and a screen reader's own activation. Both
      // carry `detail === 0`, which is the one discriminator that does not
      // need a flag or a timer to stay right.
      cell.addEventListener('click', (event) => {
        if (event.detail !== 0) return;
        set(i, mask()[i] !== '1');
        onChange(control.key, mask(), true);
      });
      cell.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
        const to = step ? i + step : event.key === 'Home' ? 0 : event.key === 'End' ? 11 : null;
        if (to === null || to < 0 || to > 11) return;
        event.preventDefault();
        focus(to);
      });
      grid.append(cell);
      return cell;
    });

    // One tab stop for the whole year, the arrow keys inside it. Twelve stops
    // in one control would bury the strips below it for anyone tabbing the
    // desk.
    function focus(i) {
      for (const [at, cell] of cells.entries()) cell.tabIndex = at === i ? 0 : -1;
      cells[i].focus();
    }

    // Sweeping paints one state rather than toggling each cell it crosses: the
    // month you took hold of decides whether this gesture is adding months or
    // removing them, and crossing back over a cell does not undo it. Toggling
    // per cell makes a fast drag depend on how many times the pointer happened
    // to cross a boundary.
    let painting = null;
    const monthAt = (event) => {
      const found = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('.month');
      // Capture keeps the events coming here after the pointer has left the
      // grid entirely, which is what a sweep off the end of December looks
      // like, so a point outside is nothing rather than an error.
      return found && grid.contains(found) ? Number(found.dataset.month) : null;
    };
    drag(grid, {
      onStart: (event) => {
        const i = monthAt(event);
        if (i === null) return;
        painting = mask()[i] !== '1';
        set(i, painting);
      },
      onMove: (event) => {
        const i = monthAt(event);
        if (i !== null && painting !== null) set(i, painting);
      },
      onEnd: () => {
        painting = null;
        onChange(control.key, mask(), true);
      },
    });

    row.append(grid);
    const periods = el('p', 'ctl-note months-periods');
    row.append(periods);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    faces.set(control.key, () => {
      const now = mask();
      const was = ghost[control.key];
      const only = [...now].filter((c) => c === '1').length === 1;
      cells.forEach((cell, i) => {
        const on = now[i] === '1';
        cell.classList.toggle('on', on);
        cell.setAttribute('aria-checked', String(on));
        // Where this cell stood when the gesture began, drawn as the same
        // ghost mark every other control on the desk draws: a sweep across
        // half the year should leave a record of what it crossed.
        cell.classList.toggle('moved', was != null && was[i] !== now[i]);
        const locked = on && only;
        cell.classList.toggle('locked', locked);
        const why = locked
          ? 'A run period needs at least one month — bring another in before taking this one out.'
          : '';
        // Written only on change, the same rule the scales' Study buttons
        // follow: this redraws twelve cells on every settle.
        if (cell.title !== why) cell.title = why;
      });
      value.textContent = control.format(now);
      periods.textContent = control.periods(now);
    });
    return row;
  }

  /**
   * A list of days, over a year rule.
   *
   * The rule is not decoration. A fixed date knows where in the year it falls
   * and is ticked there; an nth-weekday date does not, because the run period
   * carries no year, so it is marked at its month's centre in ghost ink. Two
   * marks that look different because they *are* different — the alternative
   * was ticking both at a guessed day of the month, which is the kind of quiet
   * invention this sheet exists not to make.
   *
   * Nothing is registered in `rows`: that map is what gives a control a Study
   * button, and a list has no range to sweep.
   */
  function buildDays(control) {
    const row = el('div', 'ctl ctl-days');
    const head = el('div', 'ctl-head');
    head.append(el('span', 'ctl-label', control.label));
    const value = el('span', 'ctl-value');
    head.append(value);
    row.append(head);

    const rule = svg('svg', { viewBox: '0 0 240 26', class: 'days-rule', role: 'img' });
    row.append(rule);

    const list = el('div', 'days');
    row.append(list);

    // The field speaks the grammar the address bar speaks, so what you type
    // here is what a scheme link carries and the refusals are word for word
    // the ones a bad link gets.
    const add = el('div', 'day-add');
    const field = el('input', 'day-field');
    field.type = 'text';
    field.placeholder = '12/25: Christmas';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', `Add a holiday to ${control.label}`);
    const addBtn = el('button', 'day-put', 'Add');
    addBtn.type = 'button';
    add.append(field, addBtn);
    row.append(add);

    const error = el('p', 'day-error');
    error.hidden = true;
    error.setAttribute('role', 'status');
    row.append(error);

    const sets = el('div', 'day-presets');
    for (const calendar of control.presets) {
      const chip = el('button', 'day-set', `${calendar.code} ${calendar.count()}`);
      chip.type = 'button';
      // The whole sentence, permanently on the offer rather than shown once
      // after the click: a calendar that is four days short stays four days
      // short, and a notice that expires would be a lie by expiry.
      chip.title = calendar.title();
      chip.addEventListener('click', () => stamp(calendar.encode()));
      sets.append(chip);
    }
    // Only ever appended when a file actually names days, which no TMYx does.
    const fromFile = el('button', 'day-set', 'From file');
    fromFile.type = 'button';
    fromFile.hidden = true;
    fromFile.addEventListener('click', () => stamp(fromFile.dataset.days));
    sets.append(fromFile);
    row.append(sets);

    const fileNote = el('p', 'ctl-note');
    fileNote.hidden = true;
    row.append(fileNote);
    const outsideNote = el('p', 'ctl-note out');
    outsideNote.hidden = true;
    row.append(outsideNote);
    if (control.note) row.append(el('p', 'ctl-note', control.note));

    // The weekday the run's year begins on, from the attached file, or null
    // while there is no file and therefore no calendar to letter against.
    let startWeekday = null;
    // How much of one holiday the run actually simulates, in days.
    //
    // Not "is its start month in the mask": a special day is a span, so a
    // shutdown beginning in a month the run keeps and ending in one it drops is
    // partly simulated, and calling it wholly in would overstate what reaches
    // the engine by exactly the days it loses. Against the mask rather than a
    // range, too — the run is a set of months now, so a day can fall in a gap
    // between two run periods as easily as before the first.
    const reach = (day) => coveredDays(day, startWeekday, params.months);

    const commitList = (days) => {
      markGesture(control.key);
      onChange(control.key, serializeHolidays(days), true);
    };
    const stamp = (text) => {
      error.hidden = true;
      markGesture(control.key);
      onChange(control.key, text, true);
    };

    const put = () => {
      const typed = field.value.trim();
      if (typed === '') return;
      const kept = parseHolidays(params[control.key]);
      let next;
      try {
        // Parsed together with what is already there, so the duplicate-name
        // and length rules are checked against the list this would become
        // rather than against the entry alone.
        next = parseHolidays(serializeHolidays(kept) + (kept.length ? ';' : '') + typed);
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
        return;
      }
      field.value = '';
      error.hidden = true;
      commitList(next);
    };
    addBtn.addEventListener('click', put);
    field.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      put();
    });
    // Cleared here and not in `redraw`: `sync()` fires from a dozen paths, and
    // a redraw that wiped the message would erase a refusal a frame after it
    // appeared.
    field.addEventListener('input', () => { error.hidden = true; });

    const redraw = () => {
      const days = parseHolidays(params[control.key]);
      value.textContent = control.format(params[control.key]);

      // Resolved against the run's real calendar when there is one. Without an
      // attached file there is no calendar at all — the design days carry none
      // — so the dates are left unresolved rather than shown against a guess.
      const placed = startWeekday === null
        ? null
        : days.map((day) => ({ ...resolveHoliday(day, startWeekday), reaches: reach(day) }));

      rule.replaceChildren();
      rule.setAttribute(
        'aria-label',
        days.length === 0 ? 'No holidays listed' : `${days.length} holidays across the year`,
      );
      rule.append(svg('line', {
        x1: 0, y1: 16, x2: 240, y2: 16, stroke: 'var(--rule-firm)', 'stroke-width': 1,
      }));
      for (let m = 0; m <= 12; m += 1) {
        rule.append(svg('line', {
          x1: m * 20, y1: 13, x2: m * 20, y2: 16,
          stroke: 'var(--rule)', 'stroke-width': 0.5,
        }));
      }
      for (const [at, day] of days.entries()) {
        const here = placed?.[at];
        if (here) {
          const x = (here.month - 1 + (here.day - 1) / DAYS_IN_MONTH[here.month - 1]) * 20;
          rule.append(svg('line', {
            x1: x, y1: 4, x2: x, y2: 16,
            stroke: here.reaches === 0 ? 'var(--ink-ghost)' : 'var(--redline)', 'stroke-width': 1,
          }));
          continue;
        }
        // No calendar: a fixed date still knows where it falls, an nth weekday
        // does not, and the two are drawn differently rather than one of them
        // being invented.
        const fixed = day.date.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (fixed) {
          const month = Number(fixed[1]) - 1;
          const x = (month + (Number(fixed[2]) - 1) / DAYS_IN_MONTH[month]) * 20;
          rule.append(svg('line', {
            x1: x, y1: 4, x2: x, y2: 16, stroke: 'var(--redline)', 'stroke-width': 1,
          }));
        } else {
          rule.append(svg('circle', {
            cx: MONTHS.indexOf(day.date.slice(-3)) * 20 + 10, cy: 9, r: 2,
            fill: 'none', stroke: 'var(--ink-ghost)', 'stroke-width': 1,
          }));
        }
      }

      // In days, because a day is the unit that reaches the engine — and as a
      // union rather than a sum, because holidays overlap and the engine marks
      // a day once however many entries claim it.
      const { listed, covered } = placed === null
        ? { listed: 0, covered: 0 }
        : runDays(days, startWeekday, params.months);

      list.replaceChildren();
      for (const [at, day] of days.entries()) {
        const line = el('div', 'day');
        line.append(el('span', 'day-date', day.duration > 1 ? `${day.date} ×${day.duration}` : day.date));
        line.append(el('span', 'day-name', day.name));
        const here = placed?.[at];
        if (here) {
          // The whole point of following the weather file's calendar: an nth
          // weekday now has an answer, and it is lettered rather than left for
          // the error file to reveal.
          const when = `${WEEKDAY_LABELS[here.weekday]} ${here.day} ${MONTHS[here.month - 1]}`;
          // A span that only partly lands says so on its own row: the count
          // below cannot tell you *which* entry was cut short.
          const part = here.reaches > 0 && here.reaches < day.duration;
          const mark = el('span', 'day-when', part ? `${when} · ${here.reaches} of ${day.duration}` : when);
          if (here.reaches === 0) {
            mark.classList.add('out');
            mark.title = 'In a month no run period covers, so the engine drops it without saying so.';
          } else if (part) {
            mark.classList.add('part');
            mark.title = `${day.duration - here.reaches} of its ${day.duration} days run past the months this run covers, and the engine drops them without saying so.`;
          }
          line.append(mark);
        }
        const drop = el('button', 'day-drop', '×');
        drop.type = 'button';
        drop.setAttribute('aria-label', `Remove ${day.name}`);
        drop.addEventListener('click', () => {
          error.hidden = true;
          commitList(days.filter((_, i) => i !== at));
        });
        line.append(drop);
        list.append(line);
      }

      // The reading is of what the engine gets rather than of what was typed,
      // but only once there is a calendar to work it out against.
      value.textContent = placed === null
        ? control.format(params[control.key])
        : covered === listed
          ? `${listed} day${listed === 1 ? '' : 's'}`
          : `${covered} of ${listed} days`;

      // EnergyPlus drops a special day it cannot place in silence, whether it
      // loses the whole of one or the tail of one. Measured both ways against
      // 26.1: a January-plus-June-to-August mask carrying the eleven US federal
      // holidays simulated four of them, and a November-to-December mask
      // carrying a nine-day Christmas shutdown simulated eight of its days.
      // Neither run put anything in the error file, and the input echo lists
      // every special day under every run period whether it lands or not — so
      // there is no reading of this anywhere but here.
      const lost = listed - covered;
      outsideNote.hidden = placed === null || lost === 0;
      outsideNote.textContent = outsideNote.hidden
        ? ''
        : `${lost} of the ${listed} days listed fall in months the run does not cover, and the engine drops them without saying so.`;

      row.classList.toggle('idle', control.needs ? !control.needs(params) : false);
    };
    faces.set(control.key, redraw);

    daysWidgets.set(control.key, {
      fromFile,
      fileNote,
      setStartWeekday(weekday) {
        startWeekday = weekday;
        redraw();
      },
    });
    return row;
  }

  /* ── studies ─────────────────────────────────────────────────────────── */

  /**
   * What a card is a study of, when the control it hangs under is not answer
   * enough.
   *
   * Every other card stands directly beneath its own labelled row, so naming
   * its subject again would be the page repeating itself. A plan key's four
   * walls share one label and can have four curves standing under it at once,
   * which is exactly the case where the card has to say which wall it is.
   */
  function studySubject(key) {
    const { side } = controlFor(key);
    return side ? [el('span', 'study-side', labelFor(key))] : [];
  }

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
    head.append(el('span', 'study-tag', 'Study'), ...studySubject(key));
    // Which desk this curve was swept against, the way the bill names what it
    // is pinned to. Everything else about the card assumes that desk.
    const desk = el('span', 'study-desk', `of ${study.label}`);
    desk.title = `Swept with the rest of the desk at ${study.label}`;
    head.append(desk);
    // A curve still landing counts its samples where Clear will stand once it
    // is done: clearing a card the scheduler is mid-way through redrawing
    // would be a race dressed as a button.
    if (study.progress) {
      head.append(el('span', 'study-wait', `Solving ${study.progress.done} / ${study.progress.total}`));
    } else {
      const clear = el('button', 'link', 'Clear');
      clear.type = 'button';
      clear.addEventListener('click', () => onStudyClear?.(key));
      head.append(clear);
    }
    card.append(head);

    const W = 240;
    const H = 64;
    const energy = study.metric === 'energy';
    // Both metrics are the signed pair, which is why neither needs a third
    // pen. TEDI and CEDI are the year's heat asked into and out of the zone —
    // the rail's signed watts integrated, not a price or an emission — so
    // warm-in / cold-out encodes exactly the sign it does everywhere else on
    // the desk, exactly as the temperature extremes below do.
    const series = energy
      ? [
          { sel: (p) => p.tedi, pen: 'var(--warm)', name: 'TEDI', said: 'heating demand TEDI' },
          { sel: (p) => p.cedi, pen: 'var(--cold)', name: 'CEDI', said: 'cooling demand CEDI' },
        ]
      : [
          {
            sel: (p) => p.high,
            pen: 'var(--warm)',
            // Three periods, because a weather file no longer implies a year:
            // the extremes of a run period with months taken out of it are the
            // run period's, and calling them annual would be the card
            // reporting a figure the run never held.
            said: !study.annual
              ? 'summer design-day peak'
              : study.wholeYear
                ? 'annual peak'
                : 'run-period peak',
          },
          {
            sel: (p) => p.low,
            pen: 'var(--cold)',
            said: !study.annual
              ? 'winter design-day low'
              : study.wholeYear
                ? 'annual low'
                : 'run-period low',
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
    // "A year" only when the run was one. The intensities are the same
    // arithmetic over whatever months are in the run, and every sample on the
    // curve shares them, so the comparison holds — but the figure is not an
    // annual one and the card must not say it is.
    const unit = !energy
      ? '°C'
      : study.wholeYear
        ? 'kWh per square metre a year'
        : 'kWh per square metre over the run period';
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    root.setAttribute(
      'aria-label',
      `Study of ${labelFor(key)} from ${control.format(control.min)} to ${control.format(control.max)}: ` +
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
    if (energy) foot(study.wholeYear ? 'kWh/m²·a' : 'kWh/m² per run', plot.x + plot.w / 2, 'middle');

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

  /**
   * The channel's own declaration, as the engine settled it.
   *
   * Above the meter rather than below it, and inside the fold: what a window
   * came to is a detail of working the strip, whereas the meter reading is
   * half of what the folded index row is for. The value opens as an em dash
   * and stays one until a run has produced the figures — there is no
   * arithmetic here that could stand in for them.
   */
  function buildReadout(channel) {
    if (!channel.readout) return null;
    const node = el('div', 'readout');
    const head = el('div', 'readout-head');
    head.append(el('span', 'readout-label', channel.readout.label));
    const value = el('b', 'readout-value', '—');
    head.append(value);
    node.append(head);
    // The second line is the whole window including its frame, and it is
    // absent far more often than not — the engine computes it only where
    // there is a frame to correct the glass against — so it is built hidden
    // and stays that way rather than standing as a row of em dashes under
    // every frameless opening.
    const sub = el('p', 'readout-sub');
    sub.hidden = true;
    node.append(sub);
    if (channel.readout.note) node.append(el('p', 'meter-note', channel.readout.note));
    return { node, value, sub };
  }

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

    /**
     * What the attached weather file's own calendar contains.
     *
     * Four states, and they are four different sentences:
     *
     *   - `undefined` — no file attached, so the question does not arise;
     *   - `''` — a file that names no holidays at all, which is every TMYx
     *     there is, and the reason this method exists. "From file" has always
     *     read an empty list and said nothing about it, and a reading with
     *     nothing behind it has to say so rather than pass for a zero;
     *   - `null` — a file naming days this page cannot read, in which case the
     *     offer is withdrawn rather than stamping the part that parsed;
     *   - a holiday list — the file's own days, offered as one more stamp
     *     beside the published calendars.
     */
    setWeatherHolidays(days, startWeekday = null) {
      const offered = typeof days === 'string' && days !== '';
      for (const widget of daysWidgets.values()) widget.setStartWeekday(startWeekday);
      for (const { fromFile, fileNote } of daysWidgets.values()) {
        fromFile.hidden = !offered;
        if (offered) {
          fromFile.dataset.days = days;
          const n = days.split(';').length;
          fromFile.title = `Replace the list with the ${n} holiday${n === 1 ? '' : 's'} this weather file names.`;
        }
        const note = days === ''
          ? 'This weather file names no holidays of its own.'
          : days === null
            ? 'This weather file names holidays this page cannot read, so it offers none.'
            : '';
        fileNote.hidden = note === '';
        fileNote.textContent = note;
      }
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
     *
     * `readouts` is a map of channel id to `{ text, sub }` — what the engine
     * made of that channel's declaration, and an optional second line. It
     * rides along here rather than on a method of its own because it has the
     * same life as the readings: both are read off the last run, both are
     * re-lettered on every apply, and a readout left standing while the
     * meters were cleared would describe a run the strips no longer report.
     */
    setReadings(readings, derived, at = null, readouts = null) {
      reading = at;
      for (const channel of CHANNELS) {
        const here = strips.get(channel.id);
        if (!here.readout) continue;
        const found = readouts?.get(channel.id) ?? null;
        here.readout.value.textContent = found?.text ?? '—';
        here.readout.sub.textContent = found?.sub ?? '';
        here.readout.sub.hidden = !found?.sub;
      }
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
      // Before the first point lands there is nothing to draw, so a bare wait
      // card holds the space. Once a partial curve is up, the curve card
      // carries its own counter and must not be knocked down to a blank one —
      // the card only ever gets more drawn, never less.
      let have = cards.get(key);
      if (!have) {
        const row = rows.get(key);
        if (!row) throw new Error(`no control row to count the study of ${key} under`);
        const node = el('div', 'study-card');
        const head = el('div', 'study-head');
        const wait = el('span', 'study-wait');
        head.append(el('span', 'study-tag', 'Study'), ...studySubject(key), wait);
        node.append(head);
        have = { node, kind: 'wait', wait };
        row.after(node);
        cards.set(key, have);
      }
      if (have.kind === 'wait') have.wait.textContent = `Solving ${progress.done} / ${progress.total}`;
    },

    /** Whether a study can be asked for, with the reason lettered when not. */
    setSweepEnabled(ok, reason) {
      sweepGate = { ok, reason };
      api.sync();
    },

    /**
     * How many study cards are standing, counted off the console itself.
     *
     * The desk's Clear letters itself from this rather than from the caller's
     * map of finished studies: a sweep still landing has a card up before it
     * has a curve to store, so the two disagree for exactly as long as a study
     * takes to solve. The cards are what the reader can see and what Clear
     * takes down, so the cards are what it counts — the page's own rule about
     * reading a number back off the thing it describes.
     */
    studyCount: () => cards.size,

    /** The studies go with the climate they were swept under. */
    clearStudies() {
      for (const { node } of cards.values()) node.remove();
      cards.clear();
    },
  };

  /**
   * The line that says which instant the desk is reading, and holds it.
   *
   * The marker is the desk's own armed idiom — filled `--redline` when the
   * hour is held, a hairline outline when it is the run's own worst hour — so
   * "pinned" reads the same way "patched in" and "pinned as scheme" already
   * do. It labels the instant rather than sitting beside it, because what is
   * being armed is that hour and no other.
   */
  function whenLine() {
    const wrap = el('div', 'rail-when');
    const button = el('button', 'pin pin-inline');
    whenButton = button;
    button.type = 'button';
    button.setAttribute('aria-pressed', String(reading.pinned));
    button.title = reading.pinned
      ? 'Release the hour and read the worst one in each run again'
      : 'Hold this hour, so the meters keep reading it as the desk changes';
    button.append(el('i', 'mark'), el('span', null, `Read at ${reading.text}`));
    button.addEventListener('click', () => {
      onPin?.();
      // Turning the pin re-letters the rail, and `drawRail` empties the host,
      // so by the time this handler returns the button that was clicked is
      // detached and the focus has fallen to the body. Every other control on
      // the desk keeps its node across a redraw; this one is rebuilt, so it
      // has to hand the focus on to its replacement or a reader working the
      // desk from the keyboard loses their place on every press -- and the
      // `aria-pressed` they just changed is never announced.
      if (whenButton?.isConnected) whenButton.focus();
    });
    wrap.append(button);
    // A pin that could not be found is released, and the reader is told which
    // hour went missing -- a marker that quietly went dark would leave every
    // number on the rail claiming to be held when it is not.
    if (reading.released) {
      wrap.append(
        el(
          'p',
          'rail-note loose',
          `${reading.released} is not in this run, so the pin was released and the meters are reading the worst hour again.`,
        ),
      );
    }
    return wrap;
  }

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
    // say which instant, or the numbers are unfalsifiable. And because that
    // instant is chosen by the result — the hour furthest from 20 °C, which a
    // control can move without touching the quantity being read — the line
    // that states it is also where it is held still. One control, in the one
    // place the reading hour is already named.
    if (reading) railHost.append(whenLine());

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
