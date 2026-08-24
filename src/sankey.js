/**
 * The flow drawing: where the heat at one instant came from and went.
 *
 * The sheet can already say what each path is contributing (the balance rail),
 * what the year cost (the bill) and what the demand intensities came to (the
 * schedule). What none of them draws is the chain — fuel at the meter, through
 * the plant, into the zone, and back out through the fabric that called for it.
 *
 * **The spine is a balanced node, and the sign of a term picks its side of it.**
 * That is what lets a Sankey draw this balance at all. A ribbon diagram with
 * only positive widths cannot show a sink among sources, and this balance is
 * full of them — at the cooling peak the interzone floor runs at −1,329 W while
 * everything around it is a gain. Put the positives on one flank of a balanced
 * node and the negatives on the other, and that difficulty disappears: the
 * floor is simply a ribbon on the leaving side, drawn at its true width, and
 * the node still balances. So this *is* a conservative diagram about its one
 * node — `arriving` and `leaving` are lettered at the head of each flank so the
 * reader can check that by eye.
 *
 * What it is deliberately **not** is a multi-stage Sankey whose every node
 * balances by construction. Only the zone air balances here, because the zone
 * air is the only thing that was measured to. The figures beside each ribbon
 * are read against it and do not divide it; and whatever the node does not
 * close by is a hatched residual stub rather than heat quietly absorbed into a
 * neighbouring ribbon, because the rail's own note has said "unclosed by N W"
 * in words since long before there was a picture.
 *
 * The geometry below touches no `document` — the harness asserts flank
 * assignment, ordering and residual width without a browser — and `render` at
 * the foot is the half that draws it.
 */

/**
 * Per the design system: several segments on one side of zero share a hue,
 * because the hue is carrying the sign and nothing else may claim it, and they
 * are told apart by stepping each further toward the trough it sits in.
 */
export const TONES = [100, 72, 50, 35, 26];

/** The tone a ribbon takes, by its rank on its own flank. */
export const toneOf = (watts, rank) =>
  `color-mix(in srgb, var(${watts >= 0 ? '--warm' : '--cold'}) ${TONES[Math.min(rank, TONES.length - 1)]}%, var(--inset))`;

/** Graphite, for a ribbon whose sign is not the point — the fuel chain's. */
export const inkTone = (rank) =>
  `color-mix(in srgb, var(--ink) ${[100, 74, 54, 39, 28][Math.min(rank, 4)]}%, var(--inset))`;

const sum = (xs) => xs.reduce((t, x) => t + x, 0);

/**
 * Lay the flows out around the spine.
 *
 * `terms` arrive as `{ id, label, watts, note }`, already read — this function
 * never touches an ESO. Anything whose `watts` is not a finite number is not a
 * zero-width ribbon, it is a term the run did not carry, and it is dropped from
 * the geometry and handed back under `absent` so the key can say which and why.
 *
 * The layout is in a unit box: `x` and `width` run 0..1 across the drawing,
 * `y` and `height` 0..1 down it. Turning that into a viewBox is the renderer's
 * business, and keeping it out of here is what lets the harness check the
 * arithmetic without inventing a width.
 */
export function layoutFlows(terms, { spine = 0.58, minRibbon = 0.006 } = {}) {
  const carried = terms.filter((t) => Number.isFinite(t.watts));
  const absent = terms.filter((t) => !Number.isFinite(t.watts));

  // A term reading exactly zero is a measurement and stays in the reckoning —
  // it is drawn at the floor thickness with its figure lettered, because "this
  // path moved no heat at this hour" is a true and often interesting answer,
  // and dropping it would make it look like the term was never read.
  const into = carried.filter((t) => t.watts >= 0).sort((a, b) => b.watts - a.watts);
  const outOf = carried.filter((t) => t.watts < 0).sort((a, b) => a.watts - b.watts);

  const intoTotal = sum(into.map((t) => t.watts));
  const outOfTotal = -sum(outOf.map((t) => t.watts));

  // The residual is the imbalance, and it hangs on the *short* flank — the side
  // that is missing the heat needed to close. The rail states the same quantity
  // in words; this is the drawn form of it.
  const residual = intoTotal - outOfTotal;
  const scale = Math.max(intoTotal, outOfTotal);

  if (!carried.length || scale <= 0) {
    return { spine, into: [], outOf: [], residual: null, scale: 0, absent, closes: null };
  }

  /** Stack one flank from the spine outwards, largest nearest. */
  const stack = (list, side) => {
    let y = 0;
    return list.map((term, rank) => {
      const height = Math.max(Math.abs(term.watts) / scale, minRibbon);
      const band = { ...term, side, rank, y, height, tone: toneOf(term.watts, rank) };
      y += height;
      return band;
    });
  };

  const intoBands = stack(into, 'into');
  const outOfBands = stack(outOf, 'outOf');

  // Hung on the flank that comes up short, at the foot of that flank's stack.
  const shortSide = residual > 0 ? 'outOf' : 'into';
  const shortStack = shortSide === 'into' ? intoBands : outOfBands;
  const stub = Math.abs(residual) < 1e-9
    ? null
    : {
        id: 'residual',
        label: 'Residual',
        watts: Math.abs(residual),
        side: shortSide,
        hatched: true,
        y: shortStack.length ? shortStack.at(-1).y + shortStack.at(-1).height : 0,
        height: Math.max(Math.abs(residual) / scale, minRibbon),
      };

  return {
    spine,
    into: intoBands,
    outOf: outOfBands,
    residual: stub,
    intoTotal,
    outOfTotal,
    scale,
    absent,
    // What the rail letters as "Closes to X %". Null when there is nothing to
    // close against, rather than a triumphant zero.
    closes: scale > 0 ? Math.abs(residual) / scale : null,
  };
}

/**
 * The fuel chain, in watts at the same instant.
 *
 * The bill divides delivered heat by a seasonal efficiency or a COP *after* the
 * run, because there is no boiler in this model — the ideal unit reports
 * delivered heat at 100 %. That division is arithmetic, not a simulation
 * result, so it is just as true of one hour as it is of a year, and doing it
 * here is what lets the drawing carry the chain the issue asks for without
 * inventing a quantity: `supply ÷ divisor = draw`, the bill's own sum, in W.
 *
 * Returns null when there is no system reading at this instant — not a chain of
 * zeros, which would draw a boiler burning nothing rather than no boiler.
 */
export function fuelChain({ sensible, latent, divisor, fuelLabel, plantLabel }) {
  if (!Number.isFinite(sensible)) return null;
  const supply = sensible + (Number.isFinite(latent) ? latent : 0);
  if (Math.abs(supply) < 1e-9) return null;
  const draw = divisor ? Math.abs(supply) / divisor : Math.abs(supply);
  return {
    supply,
    latent: Number.isFinite(latent) ? latent : null,
    divisor: divisor ?? null,
    draw,
    fuelLabel,
    plantLabel,
    // Which way the unit is working, which decides the spine flank the chain
    // attaches to and which of the two divisors applies.
    mode: supply >= 0 ? 'heating' : 'cooling',
  };
}

/**
 * The peak decomposition, laid out as ribbons on the same spine.
 *
 * One ribbon per component row, width = instant + delayed, with the two drawn
 * as a division *inside* the ribbon — which is allowed here and nowhere else on
 * this drawing, because those two do sum to the row's own sensible total by the
 * report's construction. The sign of the row picks its flank, exactly as a rail
 * term's does, so a component acting as a sink draws on the leaving side.
 *
 * The report's published residual is carried straight through rather than
 * recomputed. It is the difference between the peak EnergyPlus computed and the
 * instant-plus-delayed estimate, and it belongs to the report.
 */
export function layoutComponents(half, { minRibbon = 0.006 } = {}) {
  if (!half?.components?.length) return null;

  const rows = half.components
    .map((c) => {
      const instant = c.instant ?? 0;
      const delayed = c.delayed ?? 0;
      return { label: c.label, instant, delayed, watts: instant + delayed, latent: c.latent, area: c.area };
    })
    // A row that is zero in both sensible columns contributed nothing to the
    // sensible peak this drawing is of. Dropped from the geometry rather than
    // drawn at the floor width, because the report lists every component type
    // it knows about — refrigeration, water use, DOAS — and a shoebox has
    // twenty of them at a flat zero. They are still counted in the key.
    .filter((r) => Math.abs(r.watts) > 1e-9);

  const into = rows.filter((r) => r.watts > 0).sort((a, b) => b.watts - a.watts);
  const outOf = rows.filter((r) => r.watts < 0).sort((a, b) => a.watts - b.watts);
  const intoTotal = sum(into.map((r) => r.watts));
  const outOfTotal = -sum(outOf.map((r) => r.watts));
  const scale = Math.max(intoTotal, outOfTotal, Math.abs(half.peak ?? 0));
  if (scale <= 0) return null;

  const stack = (list, side) => {
    let y = 0;
    return list.map((row, rank) => {
      const height = Math.max(Math.abs(row.watts) / scale, minRibbon);
      const band = {
        ...row,
        side,
        rank,
        y,
        height,
        tone: toneOf(row.watts, rank),
        // The instant/delayed division, as a fraction of this ribbon's own
        // width. Guarded against a row that is entirely one or the other.
        instantShare: Math.abs(row.watts) > 0 ? Math.abs(row.instant) / (Math.abs(row.instant) + Math.abs(row.delayed) || 1) : 0,
      };
      y += height;
      return band;
    });
  };

  const intoBands = stack(into, 'into');
  const outOfBands = stack(outOf, 'outOf');

  /**
   * The report's own error term, placed the way the live residual is.
   *
   * `Difference Between Peak and Estimated Sensible Load` is the peak
   * EnergyPlus computed minus the instant-plus-delayed estimate the components
   * add up to. So a positive difference is load the components do not account
   * for and belongs on the same flank as they do; a negative one is the
   * estimate overshooting and belongs opposite, where it reads as the
   * correction it is. Either way it is drawn rather than absorbed, because the
   * delayed column is an estimate from the decay curves and this is the report
   * saying by how much.
   */
  let residual = null;
  if (Number.isFinite(half.residual) && Math.abs(half.residual) > 1e-9) {
    const dominant = intoTotal >= outOfTotal ? 'into' : 'outOf';
    const opposite = dominant === 'into' ? 'outOf' : 'into';
    const side = half.residual > 0 ? dominant : opposite;
    const onSide = side === 'into' ? intoBands : outOfBands;
    residual = {
      label: 'Residual',
      watts: Math.abs(half.residual),
      signed: half.residual,
      side,
      y: onSide.length ? onSide.at(-1).y + onSide.at(-1).height : 0,
      height: Math.max(Math.abs(half.residual) / scale, minRibbon),
      hatched: true,
    };
  }

  return {
    into: intoBands,
    outOf: outOfBands,
    intoTotal,
    outOfTotal,
    scale,
    peak: half.peak,
    estimated: half.estimated,
    residual,
    at: half.at,
    zeroRows: half.components.length - rows.length,
  };
}


/* ══ drawing it ══════════════════════════════════════════════════════════ */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Custom properties are not resolved inside SVG presentation attributes, so
 * anything token-valued goes through the style declaration instead. The same
 * helper and the same trap as `main.js` and `console.js`; `color-mix` needs it
 * too, since the tone ramp is built out of one.
 */
function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const text = String(value);
    if (text.includes('var(') || text.includes('color-mix')) node.style.setProperty(key, text);
    else node.setAttribute(key, text);
  }
  return node;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Fixed viewBox, fluid element — the plate's arrangement. */
const W = 760;
const H = 320;
const PAD = { t: 42, b: 26 };
/** The spine sits at the middle; the flanks are what radiate from it. */
const SPINE = { x: W / 2, w: 13 };
/** How far a ribbon runs before its stub, and where the fuel chain goes on. */
const REACH = 150;
const CHAIN = 96;

/**
 * The hatch, for the one thing on this drawing that is not a measurement.
 *
 * Lifted from the axonometric's adiabatic poché, including the rule that cost
 * real debugging there: `pointer-events: none`, or the pattern swallows every
 * gesture aimed at whatever is beneath it.
 */
function hatchDefs() {
  const defs = svg('defs');
  const pattern = svg('pattern', {
    id: 'flow-residual',
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
    width: 5,
    height: 5,
  });
  pattern.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'var(--ink-3)', 'stroke-width': 1 }));
  defs.append(pattern);
  return defs;
}

const text = (string, attrs) => {
  const node = svg('text', {
    'font-family': 'var(--mono)',
    'font-size': 8.5,
    fill: 'var(--ink-3)',
    ...attrs,
  });
  node.textContent = string;
  return node;
};

/** One band, drawn from the spine outwards on its own flank. */
function band(entry, { top, height, letter }) {
  const group = svg('g');
  const y = top + entry.y * height;
  const h = Math.max(entry.height * height, 1.6);
  const leaving = entry.side === 'outOf';
  const inner = leaving ? SPINE.x + SPINE.w / 2 : SPINE.x - SPINE.w / 2;
  const outer = leaving ? inner + REACH : inner - REACH;
  const left = Math.min(inner, outer);

  const rect = svg('rect', {
    x: left,
    y,
    width: REACH,
    height: h,
    fill: entry.hatched ? 'url(#flow-residual)' : entry.tone,
    // Deaf, for the axon's reason: nothing under the drawing should lose a
    // gesture to it, and the hatch is the worst offender.
    'pointer-events': 'none',
  });
  if (entry.hatched) {
    rect.setAttribute('stroke', 'var(--rule)');
    rect.setAttribute('stroke-width', '0.6');
  }
  group.append(rect);

  /*
   * The instant/delayed division, drawn along the ribbon's length.
   *
   * This is the one place on this drawing where a band is divided, and it is
   * allowed here because those two columns do sum to the row's own sensible
   * total by the report's construction — unlike the tributaries, which are
   * lettered beside a ribbon precisely because they do not. Along the length
   * rather than across the width because the statement is about time: what
   * reached the air at once sits against the spine, what the mass gave back
   * later sits beyond it.
   */
  // `< 1` rather than `> 0 && < 1`: a row that is *entirely* delayed — a roof,
  // an exterior wall — has to be lightened over its whole width, or the two
  // most delayed components on the drawing would be the only ones shown at
  // full strength.
  if (entry.instantShare != null && entry.instantShare < 1) {
    const instantW = REACH * entry.instantShare;
    const cutX = leaving ? left + instantW : left + REACH - instantW;
    const delayedW = REACH - instantW;
    group.append(
      svg('rect', {
        // The *delayed* half is the one drawn lighter, and which half gets the
        // lighter tone is not arbitrary: the instant column is directly
        // computed, while the delayed one is estimated from the radiant decay
        // curves. Lightening the estimate is the same move as hatching the
        // residual — the drawing gets fainter as the claim gets weaker.
        x: leaving ? cutX : left,
        y,
        width: delayedW,
        height: h,
        fill: `color-mix(in srgb, ${entry.tone} 55%, var(--sheet))`,
        'pointer-events': 'none',
      }),
    );
    // A cut rather than an outline, in the sheet's own colour — the divider
    // idiom the rail's segments use. Only where there are two parts to divide.
    if (instantW > 0) {
      group.append(
        svg('line', {
          x1: cutX, y1: y, x2: cutX, y2: y + h,
          stroke: 'var(--sheet)', 'stroke-width': 1, 'pointer-events': 'none',
        }),
      );
    }
  }

  // A ribbon thinner than its own label is still a reading, so the lettering
  // sits in the gutter beyond the stub rather than inside the band.
  if (letter) {
    group.append(
      text(letter, {
        x: leaving ? outer + 7 : outer - 7,
        y: y + h / 2 + 3,
        'text-anchor': leaving ? 'start' : 'end',
        fill: 'var(--ink-2)',
      }),
    );
  }
  return group;
}

/**
 * The plant division, drawn as the width step it is.
 *
 * `supply ÷ divisor = draw` is the bill's own arithmetic and the sheet's rate
 * build-up idiom in another medium: the ribbon leaves the system stub at the
 * width of the heat delivered and arrives at the fuel node at the width of the
 * fuel bought, and the step between them *is* the efficiency. Nothing here is
 * simulated — there is no boiler in this model — so the step is lettered with
 * the number it divides by and the reader can redo it.
 */
function chainOf(fuel, { y, h, leaving, watts }) {
  const group = svg('g');
  const dir = leaving ? 1 : -1;
  const from = leaving ? SPINE.x + SPINE.w / 2 + REACH : SPINE.x - SPINE.w / 2 - REACH;
  const to = from + dir * CHAIN;
  // Drawn to the same scale as the ribbon it continues, so the step is a real
  // comparison rather than a decoration.
  const drawH = Math.max((h * fuel.draw) / Math.max(Math.abs(watts), 1e-9), 1.6);
  const mid = y + h / 2;

  const path = svg('path', {
    d: `M ${from} ${y} L ${to} ${mid - drawH / 2} L ${to} ${mid + drawH / 2} L ${from} ${y + h} Z`,
    fill: inkTone(3),
    stroke: 'var(--rule)',
    'stroke-width': 0.6,
    'pointer-events': 'none',
  });
  group.append(path);
  group.append(
    text(fuel.plantLabel, {
      x: to + dir * 7,
      y: mid - 2,
      'text-anchor': leaving ? 'start' : 'end',
      fill: 'var(--ink-2)',
    }),
  );
  group.append(
    text(`${fuel.divisor ? `÷ ${fuel.divisor}` : 'no plant'}`, {
      x: to + dir * 7,
      y: mid + 9,
      'text-anchor': leaving ? 'start' : 'end',
    }),
  );
  return group;
}

/**
 * The drawing, rebuilt whole on every reading.
 *
 * `view` is null before the first run and after a failed one, which draws the
 * empty state rather than an axis with nothing on it — the plate's own rule.
 * A `refusal` is a mode this run cannot answer, and it says which and why in
 * place of the drawing, never as an empty frame.
 */
export function renderSankey(host, view) {
  if (!host) return;
  host.replaceChildren();

  if (!view) {
    host.append(el('p', 'flow-empty', 'AWAITING RUN'));
    return;
  }
  if (view.refusal) {
    host.append(el('p', 'flow-refused', view.refusal));
    return;
  }

  const { layout, fuel } = view;
  const frame = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    role: 'img',
    'aria-label': view.summary,
  });
  frame.append(hatchDefs());

  const top = PAD.t;
  const height = H - PAD.t - PAD.b;

  // The spine. It is the only thing on this drawing that claims to balance, so
  // it is the only thing drawn as a single continuous object.
  frame.append(
    svg('rect', {
      x: SPINE.x - SPINE.w / 2,
      y: top - 6,
      width: SPINE.w,
      height: height + 12,
      fill: 'var(--inset)',
      stroke: 'var(--rule)',
      'stroke-width': 1,
      'pointer-events': 'none',
    }),
  );

  const letterFor = (entry) => `${entry.label} ${view.format(entry.signedWatts ?? entry.watts)}`;
  for (const entry of layout.into) frame.append(band(entry, { top, height, letter: letterFor(entry) }));
  for (const entry of layout.outOf) frame.append(band(entry, { top, height, letter: letterFor(entry) }));
  if (layout.residual) {
    frame.append(band(layout.residual, {
      top,
      height,
      // The published figure carries a sign and the key letters it — the
      // drawing has to say the same thing or the two disagree about a number
      // the reader can look up in the report.
      letter: `Residual ${view.format(layout.residual.signed ?? layout.residual.watts)}`,
    }));
  }

  // The fuel chain hangs off whichever flank the system landed on. At a cooling
  // hour that is the leaving side, and the plant sits beyond it — which is the
  // honest picture: you buy electricity to take heat out.
  if (fuel && view.systemBand) {
    const entry = view.systemBand;
    frame.append(
      chainOf(fuel, {
        y: top + entry.y * height,
        h: Math.max(entry.height * height, 1.6),
        leaving: entry.side === 'outOf',
        watts: entry.watts,
      }),
    );
  }

  /*
   * The node, and what balances across it.
   *
   * The spine is a balanced node — that is the whole claim of the arrangement,
   * and until now it was the one figure the drawing did not letter: the two
   * flank totals were in the `aria-label` and in the lede and nowhere a reader
   * could see them against the ribbons they sum. Stating them at the head of
   * each flank is what makes the balance checkable by eye, which is the same
   * rule as everywhere else on this sheet.
   *
   * The direction is said in a **word** as well as a hue. Warm and cold carry
   * the sign, but a hue is not a reading in greyscale, on a printed sheet or
   * read aloud, and this is the one place on the drawing where saying it costs
   * two words.
   */
  // Two lines: the node's name over the balance across it. One line put the
  // totals either side of a centred label and they ran straight through it.
  const head = top - 10;
  frame.append(
    text('ZONE AIR', {
      x: SPINE.x,
      y: top - 25,
      'text-anchor': 'middle',
      'font-family': 'var(--cond)',
      'font-size': 8,
      'letter-spacing': '0.13em',
      fill: 'var(--ink-3)',
    }),
  );
  frame.append(
    text(`${view.format(layout.intoTotal)} arriving`, {
      x: SPINE.x - SPINE.w / 2 - 14,
      y: head,
      'text-anchor': 'end',
      fill: 'var(--ink-2)',
    }),
  );
  frame.append(
    text(`${view.format(layout.outOfTotal)} leaving`, {
      x: SPINE.x + SPINE.w / 2 + 14,
      y: head,
      'text-anchor': 'start',
      fill: 'var(--ink-2)',
    }),
  );

  host.append(frame);
  host.append(renderKey(view));
}

/**
 * The key, which is the drawing's real text.
 *
 * Everything the SVG letters is repeated here and several things are only
 * here — a tributary's figures, the caveat that they do not sum, the reason a
 * term is missing. That is deliberate and it is the same rule the folded strip
 * keeps: this list is what survives a 390 px screen, a printed sheet and a
 * screen reader, so a reading that exists only as a ribbon does not exist.
 */
function renderKey(view) {
  const list = el('div', 'flow-key');
  for (const group of view.keyed) {
    // One cell per ribbon, carrying its own tributaries. The outer grid lays
    // out *groups* rather than lines, because a grid that flowed line by line
    // would put a tributary in the next column and break the one relationship
    // this key exists to show — that these figures were read against that band
    // and not against each other.
    const cell = el('div', 'flow-group');
    cell.append(keyLine(group));
    for (const sub of group.subs ?? []) cell.append(keyLine(sub));
    list.append(cell);
  }
  return list;
}

function keyLine(entry) {
  const classes = ['flow-item'];
  if (entry.absent) classes.push('absent');
  // A tributary is indented under the ribbon it was read against and carries no
  // swatch, because it is not a segment of anything — giving it one would say it
  // was a share of the band above, which is the single claim this drawing must
  // not make.
  if (entry.sub) classes.push('sub');
  const item = el('div', classes.join(' '));

  const swatch = el('i', 'flow-swatch');
  if (entry.sub) swatch.classList.add('none');
  else if (entry.hatched) swatch.classList.add('hatched');
  else if (entry.tone) swatch.style.background = entry.tone;
  else swatch.classList.add('bare');
  item.append(swatch);

  item.append(el('b', null, entry.label), el('span', null, entry.reading));
  if (entry.note) item.append(el('i', 'why', entry.note));
  return item;
}
