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

  if (!carried.length) {
    return { spine, into: [], outOf: [], residual: null, intoTotal: 0, outOfTotal: 0, scale: 0, absent, closes: null };
  }

  // A stack that reads all zeros has no scale to divide by — but every one of
  // those zeros is still a measurement, and dropping the five bands here would
  // contradict the rule two paragraphs up and hand back a drawing with an empty
  // key over a spine, which is what "the run carried nothing" looks like. So
  // the flanks are stacked at the floor thickness against a unit of one, and
  // only `closes` goes null: there is genuinely nothing for the imbalance to be
  // a fraction *of*.
  const unit = scale > 0 ? scale : 1;

  /** Stack one flank from the spine outwards, largest nearest. */
  const stack = (list, side) => {
    let y = 0;
    return list.map((term, rank) => {
      const height = Math.max(Math.abs(term.watts) / unit, minRibbon);
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
        height: Math.max(Math.abs(residual) / unit, minRibbon),
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
export function layoutComponents(half, { minRibbon = 0.006, which = 'cooling' } = {}) {
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

  /*
   * The load itself, as the counterweight on the other flank.
   *
   * Without it the node did not balance and the head said so out loud: the
   * components came to `8.66 kW arriving` against `1.33 kW leaving`, which
   * invites a reader to check a balance that was never drawn. The load is what
   * those components add up to — it is the whole subject of the report — so it
   * belongs on the drawing, opposite them, at the figure EnergyPlus computed.
   * With it there the node closes to the report's own published residual and
   * nothing else, which is exactly the claim being made.
   *
   * Signed against the components: a cooling load is heat the system takes out,
   * so it leaves; a heating load is heat it puts in, so it arrives. That falls
   * out of `-peak` and needs no special case.
   */
  const load = Number.isFinite(half.peak) && Math.abs(half.peak) > 1e-9
    ? { label: `${which === 'cooling' ? 'Cooling' : 'Heating'} load`, watts: -half.peak, isLoad: true }
    : null;
  const all = load ? [...rows, load] : rows;

  const into = all.filter((r) => r.watts > 0).sort((a, b) => b.watts - a.watts);
  const outOf = all.filter((r) => r.watts < 0).sort((a, b) => a.watts - b.watts);
  const intoTotal = sum(into.map((r) => r.watts));
  const outOfTotal = -sum(outOf.map((r) => r.watts));
  // The load band is already on one flank or the other, so its own magnitude is
  // inside one of these two totals and does not need a third term here.
  const scale = Math.max(intoTotal, outOfTotal);
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
        // The load is not a component and has no instant/delayed split — null
        // rather than 0, which would draw it as entirely delayed. Every other
        // row here survived the `> 1e-9` filter above, so there is no zero-width
        // case left to test for.
        instantShare: row.isLoad
          ? null
          : Math.abs(row.instant) / (Math.abs(row.instant) + Math.abs(row.delayed) || 1),
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
    // On the flank that comes up short, exactly as the live drawing places its
    // own: with the load band in, the two flanks differ by the report's
    // residual and this is the stub that closes them.
    const side = intoTotal >= outOfTotal ? 'outOf' : 'into';
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
const W = 820;
const H = 320;
const PAD = { t: 42, b: 26 };
/** The spine sits at the middle; the flanks are what radiate from it. */
const SPINE = { x: W / 2, w: 13 };
/** How far a ribbon runs before its stub, and where the fuel chain goes on. */
const REACH = 150;
const CHAIN = 96;
/**
 * Where the lettering sits on one flank, measured from the spine's centre.
 *
 * Outboard of the chain lane where a chain is drawn, and tight against the
 * bands where none is. Inboard of the chain, the wedge printed straight over
 * the band labels — at a heating hour the system band is 97 % of its flank and
 * the wedge flares wider still, so `System 11.0 kW` was drawn and then buried.
 *
 * Reserving the lane on *both* flanks regardless was the first fix and it was
 * worse: the peak modes draw no chain at all, so it spent 96 px a side on
 * nothing and clipped `Fenestration Conduction 243 W` off the edge of the
 * viewBox. The lane is reserved where it is used.
 */
const laneFor = (hasChain) => SPINE.w / 2 + REACH + (hasChain ? CHAIN + 12 : 10);

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
function band(entry, { top, height, letter, lane }) {
  const group = svg('g');
  // The rail's segments become these, so they carry the same rank the rail
  // stacks by and unfold outward from the spine in that order.
  group.setAttribute('class', 'flow-band');
  group.style.setProperty('--i', String(entry.rank ?? 0));
  const y = top + entry.y * height;
  const h = Math.max(entry.height * height, 1.6);
  const leaving = entry.side === 'outOf';
  const inner = leaving ? SPINE.x + SPINE.w / 2 : SPINE.x - SPINE.w / 2;
  const outer = leaving ? inner + REACH : inner - REACH;
  const left = Math.min(inner, outer);

  group.style.transformOrigin = `${SPINE.x}px ${y + Math.max(entry.height * height, 1.6) / 2}px`;

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

  // The lettering is *not* drawn here. A ribbon thinner than its own label is
  // still a reading, so labels sit in the gutter beyond the stub — and two
  // hairline bands at the foot of a flank (a term reading zero, and a residual
  // that closes to nothing) put their labels in the same place and printed one
  // over the other. So the caller collects them and settles the flank top to
  // bottom against a minimum gap, which is the plate's own move and the study
  // cards' after it.
  return {
    group,
    label: letter
      ? {
          text: letter,
          x: SPINE.x + (leaving ? lane : -lane),
          anchor: leaving ? 'start' : 'end',
          y: y + h / 2 + 3,
        }
      : null,
  };
}

/**
 * Settle one flank's labels so none prints over its neighbour.
 *
 * Sorted by where each would rather sit, then pushed down only as far as the
 * minimum gap requires — so a flank whose bands are all comfortably thick is
 * lettered exactly where the bands are, and only a crowded foot moves.
 */
function settle(labels, { gap = 9, top, bottom }) {
  const settled = [...labels].sort((a, b) => a.y - b.y);
  for (const [i, label] of settled.entries()) {
    label.y = Math.max(label.y, top);
    if (i > 0) label.y = Math.max(label.y, settled[i - 1].y + gap);
  }
  // If the push has run the last one off the foot, walk the whole stack back up.
  const overshoot = settled.length ? settled.at(-1).y - bottom : 0;
  if (overshoot > 0) {
    for (let i = settled.length - 1; i >= 0; i -= 1) {
      settled[i].y = Math.min(settled[i].y, bottom - gap * (settled.length - 1 - i));
      if (i > 0) settled[i - 1].y = Math.min(settled[i - 1].y, settled[i].y - gap);
    }
  }
  return settled;
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
function chainOf(fuel, { y, h, leaving, watts, lane }) {
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
  // The chain's own lettering joins the flank's column rather than sitting at
  // the end of the wedge, so it settles against the band labels instead of
  // landing on whichever one shares its height.
  return {
    group,
    label: {
      text: `${fuel.plantLabel}${fuel.divisor ? ` ÷ ${fuel.divisor}` : ' (no plant)'}`,
      x: SPINE.x + (leaving ? lane : -lane),
      anchor: leaving ? 'start' : 'end',
      y: mid + 3,
    },
  };
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
  if (!view) return;

  // The panel is the whole instrument now that it opens from the rail rather
  // than standing on the sheet: which instant, the offers, the sentence, the
  // drawing and the key, in that order. Nothing above it says any of that.
  if (view.offers) host.append(renderOffers(view.offers));
  if (view.lede) host.append(renderLede(view.lede));

  if (view.empty) {
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
  const spine = svg('rect', {
    x: SPINE.x - SPINE.w / 2,
    y: top - 6,
    width: SPINE.w,
    height: height + 12,
    fill: 'var(--inset)',
    stroke: 'var(--rule)',
    'stroke-width': 1,
    'pointer-events': 'none',
  });
  // Named for the unfold: the rail's centre-zero hairline grows into this, so
  // it is the first thing to move and everything else hangs off it.
  spine.setAttribute('class', 'flow-spine');
  spine.style.transformOrigin = `${SPINE.x}px ${top + height / 2}px`;
  frame.append(spine);

  const letterFor = (entry) => `${entry.label} ${view.format(entry.watts)}`;

  // Which flank the chain lands on has to be known before anything is lettered,
  // because it decides how much room that flank's labels have.
  const chainSide = fuel && view.systemBand ? view.systemBand.side : null;
  const lanes = { into: laneFor(chainSide === 'into'), outOf: laneFor(chainSide === 'outOf') };

  // Drawn per flank, so each flank's labels can be settled against each other
  // without the other flank's crowding pushing them about.
  const flanks = { into: [], outOf: [] };
  const draw = (entry, letter) => {
    const drawn = band(entry, { top, height, letter, lane: lanes[entry.side] });
    frame.append(drawn.group);
    if (drawn.label) flanks[entry.side].push(drawn.label);
  };
  for (const entry of layout.into) draw(entry, letterFor(entry));
  for (const entry of layout.outOf) draw(entry, letterFor(entry));
  if (layout.residual) {
    // The published figure carries a sign and the key letters it — the drawing
    // has to say the same thing or the two disagree about a number the reader
    // can look up in the report.
    draw(layout.residual, `Residual ${view.format(layout.residual.signed ?? layout.residual.watts)}`);
  }
  // The fuel chain hangs off whichever flank the system landed on. At a cooling
  // hour that is the leaving side, and the plant sits beyond it — which is the
  // honest picture: you buy electricity to take heat out.
  if (fuel && view.systemBand) {
    const entry = view.systemBand;
    const drawn = chainOf(fuel, {
      y: top + entry.y * height,
      h: Math.max(entry.height * height, 1.6),
      leaving: entry.side === 'outOf',
      watts: entry.watts,
      lane: lanes[entry.side],
    });
    frame.append(drawn.group);
    if (drawn.label) flanks[entry.side].push(drawn.label);
  }

  // Settled last, once every label on the flank is known.
  for (const side of ['into', 'outOf']) {
    for (const label of settle(flanks[side], { top: top + 4, bottom: top + height })) {
      const node = text(label.text, {
        x: label.x,
        y: label.y,
        'text-anchor': label.anchor,
        fill: 'var(--ink-2)',
      });
      node.setAttribute('class', 'flow-label');
      frame.append(node);
    }
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
/**
 * The three instants, as a group of chips.
 *
 * A refused offer is shown and disabled rather than removed, with its reason on
 * `title`, because a mode that vanishes teaches the reader nothing about why it
 * is not there.
 */
function renderOffers(offers) {
  const group = el('div', 'flow-modes');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Which instant the flow drawing reads at');
  for (const offer of offers) {
    const chip = el('button', 'flow-mode');
    chip.type = 'button';
    chip.id = `flow-mode-${offer.id}`;
    chip.append(el('b', null, offer.label), el('span', null, offer.sub));
    if (!offer.available) {
      chip.disabled = true;
      chip.title = offer.refusal;
      group.append(chip);
      continue;
    }
    chip.setAttribute('aria-pressed', String(offer.active));
    chip.title = offer.blurb;
    chip.addEventListener('click', () => {
      offer.take();
      document.getElementById(chip.id)?.focus();
    });
    group.append(chip);
  }
  return group;
}

/**
 * The lede, with its emphasis rendered rather than stripped.
 *
 * The peak modes turn on one clause — *this is not an hour of the run* — and
 * for a while the markers around it were deleted with a regex, which made the
 * sentence's whole point indistinguishable from the rest of it.
 */
function renderLede(text) {
  const paragraph = el('p', 'flow-lede');
  for (const [i, part] of String(text).split('**').entries()) {
    if (!part) continue;
    paragraph.append(i % 2 ? el('b', null, part) : document.createTextNode(part));
  }
  return paragraph;
}

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
