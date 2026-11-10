/**
 * Tolerance bands (feature 016): how far each studied lever can move before a
 * line of the chased standard fails.
 *
 * The survey asks "what does this lever do to that reading". An architect in
 * early design usually holds the question the other way round: the targets
 * come first, and what is open is how much room is left. An engineering drawing
 * answers that for a part by lettering a dimension with its tolerance. This
 * module answers it for a lever. Holding every other control where it stands,
 * a band is the stretch of the lever's travel over which **every** line of the
 * chased standard passes, bracketed by the runs either side of each edge.
 *
 * **No runs of its own.** A band is read off a study's curve. A study already
 * sweeps one lever across its range with everything else held, which is
 * exactly the run a band needs, so a band is a second reading of a curve the
 * reader asked for. What that took is in `bandQuantities`: before this, a study
 * sample asked the engine for its own chosen reading and nothing else, so a
 * curve drawn for zone temperature carried no demand, no peak load and no TM59
 * criterion for a band to judge.
 *
 * **One-at-a-time, like a tolerance before the stack-up.** Each band holds the
 * other levers at the desk's own settings, so two levers moved to the edges of
 * their own bands at once are not guaranteed to pass. `CAVEAT` says so wherever
 * a band is shown, and the survey is where two levers are read together.
 *
 * DOM-free and network-free, like `survey.js` and `study.js`, so a Node harness
 * drives the real arithmetic. It imports `survey.js` and nothing imports it
 * back from there: `survey.js` → `schemes.js` is already an edge, and a cycle
 * through `readings.js` is the trap `views.js` documents.
 *
 * Nothing here holds state. Every band is rebuilt from a curve and the chased
 * preset each time it is read, for the reason `conformance()` is recomputed on
 * every apply: a cache would have to carry the chase, the unit system and the
 * curve's identity in its key, and this codebase has met that trap three times.
 */

import { BUDGETS, withinBudget } from './copy.js';
import { PRESETS } from './schemes.js';
import { COARSE_SAMPLES, QUANTITIES, RunContents, contentsFor, samplePoints } from './study.js';
import { readingForTarget } from './survey.js';

/* ══ what a study sample carries ══════════════════════════════════════════ */

/** The published standards' lines that carry a figure, which are the only ones a band can judge. */
const limitedTargets = () =>
  PRESETS.filter((preset) => preset.kind === 'standard').flatMap((preset) =>
    preset.targets.filter((target) => target.limit != null).map((target) => ({ preset, target })),
  );

/**
 * Every quantity a published standard's line is read off, in roster order.
 *
 * All standards, not the chased one. A sample's identity includes what it
 * carries (`sampleIdentity` in `main.js`), so contents that followed the chase
 * would re-sweep every study each time the reader chased a different standard:
 * a change in how the desk is being *read* starting runs, which is the
 * confusion the register's note on the chase warns against. Carrying every
 * standard's needs keeps the chase a pure re-reading, as it is for the board
 * and for the survey's threshold lines. Measured before it was built (G1,
 * `specs/016-tolerance-bands/verify/README.md`): the wider contents cost at
 * most +4 % of an engine run's median, against a budget of +10 %.
 *
 * Asserted rather than assumed: `readingForTarget` throws at load, naming the
 * line, for any limited target no reading on the roster answers.
 */
export const BAND_QUANTITIES = Object.freeze(
  (() => {
    const wanted = new Set(limitedTargets().map(({ preset, target }) => readingForTarget(preset, target).quantity));
    return QUANTITIES.filter((quantity) => wanted.has(quantity));
  })(),
);

/**
 * The quantities a sweep's samples must carry at a desk with these channels
 * in: the sweep's own readings (one for a study, the survey's list for a
 * survey row or a pull probe), and every band quantity the desk can produce.
 *
 * Channel-filtered because `RunContents.channels` is a precondition, not a
 * wish: `syncReporting` throws for a named channel the sample has out, the
 * scheduler turns the throw into a gap, and a study of glazing on a
 * free-running desk would come back as twenty-one holes because Passivhaus
 * reads a peak load off System. A quantity whose channel is out is left off,
 * and its lines are then "not judged" for the reason the board already gives.
 *
 * Every kind of sweep carries the same band contents, not only a study,
 * because the sample cache is shared. A survey row standing on the desk's own
 * value of its other axis runs exactly the desks a study of its swept axis
 * would, and the scheduler answers the study from the survey's sample: built
 * carrying only the survey's reading, every such position read as a gap, and
 * a study of wall resistance beside a survey of wall resistance and
 * infiltration lost every second position, which split its band into single
 * points that each passed alone.
 */
export function bandQuantities(own, engagedChannels) {
  const ownList = [own].flat();
  const engaged = new Set(engagedChannels);
  const usable = BAND_QUANTITIES.filter(
    (quantity) => !ownList.includes(quantity) && quantity.needs.channels.every((channel) => engaged.has(channel)),
  );
  return Object.freeze([...ownList, ...usable]);
}

/* ══ the words in view ═════════════════════════════════════════════════════ */

/**
 * The sentences a band block letters in view, declared once and held to the
 * standing budget where they are written, so a longer wording is refused at
 * mount rather than found at 390 px.
 */
export const SAYS = Object.freeze({
  caveat: withinBudget(BUDGETS.STANDING, 'the tolerance caveat', 'Each band holds every other lever where it stands.'),
  noChase: withinBudget(
    BUDGETS.STANDING,
    'the tolerance absence with nothing chased',
    'Chase a standard on the board to read tolerance bands off the studies.',
  ),
  noStudy: withinBudget(
    BUDGETS.STANDING,
    'the tolerance absence with no study open',
    'Turn on a study under a control to give that lever a band.',
  ),
  noRun: withinBudget(
    BUDGETS.STANDING,
    'the tolerance absence with studies on and no run behind any',
    'The studies are on, but none has landed a run yet.',
  ),
  climate: withinBudget(
    BUDGETS.STANDING,
    'the tolerance absence after a climate change',
    'Bands left with the studies when the climate changed.',
  ),
  runFailed: withinBudget(BUDGETS.STANDING, 'a band edge at a failed run', 'the run did not finish here'),
  noneAlone: withinBudget(
    BUDGETS.STANDING,
    'a band with no passing position',
    'No position of this lever passes every line alone.',
  ),
});

/** "a", "a and b", "a, b and c": the block's lists of levers and lines. */
export const listed = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/* ══ one position ══════════════════════════════════════════════════════════ */

const VERDICT_KINDS = Object.freeze(['pass', 'fail', 'refused', 'gap', 'unsolved']);

/**
 * One sampled position of a lever, judged against the lines a band can read.
 *
 * Five kinds and not two, because three of them say nothing about the lines.
 * A refused position is the sheet declining to build that desk (a heating
 * setpoint above the cooling one); a gap is the engine not finishing, or a run
 * that carried no figure for a line it carries elsewhere; an unsolved position
 * has not landed yet. None of them is a target failing, and none of them is a
 * pass (FR-013), so each closes an edge with its own reason.
 */
export class Verdict {
  constructor({ value, kind, failing = [], values = new Map(), reason = null, byDesk = false }) {
    if (!Number.isFinite(value)) throw new Error('a verdict needs the position it judges');
    if (!VERDICT_KINDS.includes(kind)) throw new Error(`a verdict cannot be "${kind}"`);
    if ((kind === 'fail') !== failing.length > 0) {
      throw new Error(`a ${kind} verdict at ${value} carries ${failing.length} failing lines`);
    }
    if ((kind === 'refused' || kind === 'gap') && !reason) {
      throw new Error(`a ${kind} verdict at ${value} must say why`);
    }
    this.value = value;
    this.kind = kind;
    // Worst ratio to the limit first, the chase's own ranking: 3 over a limit
    // of 15 and 3 over a limit of 55 are not the same distance from passing.
    this.failing = Object.freeze([...failing]);
    // Every judged line's figure at this position, so the block can ask which
    // levers clear one line alone without re-reading the curve.
    this.values = values;
    this.reason = reason;
    // Read off the desk's own solve rather than a sweep's sample: the setting
    // between two of the sweep's positions, judged by the run the chase line
    // reads (`bandFor`'s `atSetting`).
    this.byDesk = byDesk;
    Object.freeze(this);
  }

  get solved() {
    return this.kind === 'pass' || this.kind === 'fail';
  }
}

function judge(point, value, lines) {
  if (!point) return new Verdict({ value, kind: 'unsolved' });
  if (point.refused) return new Verdict({ value, kind: 'refused', reason: point.refused });
  if (!point.sample || !point.readings) return new Verdict({ value, kind: 'gap', reason: SAYS.runFailed });
  const missing = lines.find(({ reading }) => reading.valueOf(point.readings) === null);
  if (missing) return new Verdict({ value, kind: 'gap', reason: `this run carried no ${missing.target.label}` });
  return measured(value, lines, ({ reading }) => reading.valueOf(point.readings));
}

/** A pass or a fail over every judged line, given each line's figure. */
function measured(value, lines, figureOf, { byDesk = false } = {}) {
  const values = new Map();
  const failing = [];
  for (const line of lines) {
    const figure = figureOf(line);
    values.set(line.target, figure);
    if (line.target.meets(figure) === false) failing.push(line.target);
  }
  failing.sort((a, b) => values.get(b) / b.limit - values.get(a) / a.limit);
  return new Verdict({ value, kind: failing.length ? 'fail' : 'pass', failing, values, byDesk });
}

/* ══ one side of a band ════════════════════════════════════════════════════ */

/**
 * One side of a band: the last position that passed, and the first that did
 * not. Never a value between them, because nothing was run there (FR-004).
 */
export class Edge {
  constructor({ side, inside, outside = null, stop = false, closedBy = null }) {
    if (side !== 'lower' && side !== 'upper') throw new Error(`an edge is lower or upper, not "${side}"`);
    if (!Number.isFinite(inside)) throw new Error('an edge needs the last position that passed');
    if (stop !== (outside === null) || stop !== (closedBy === null)) {
      throw new Error(`the ${side} edge at ${inside} is a stop exactly when nothing lies beyond it`);
    }
    this.side = side;
    this.inside = inside;
    this.outside = outside;
    this.stop = stop;
    this.closedBy = closedBy;
    Object.freeze(this);
  }

  /** Whether nothing is known beyond this edge yet: the next position has not landed. */
  get unknown() {
    return this.closedBy?.kind === 'unsolved';
  }
}

/* ══ one lever ═════════════════════════════════════════════════════════════ */

const near = (a, b, step) => Math.abs(a - b) < step / 1000;

/**
 * The tolerance band of one studied lever under one chased standard.
 *
 * Built only through `bandFor`; the constructor is where the data model's
 * validations are asserted, so a band that contradicts itself is a throw
 * naming the lever rather than a figure on a card.
 */
export class Band {
  constructor(fields) {
    Object.assign(this, fields);
    const { key, judged, band, inert, share, move, contains, stance, others, verdicts } = this;
    const fail = (why) => {
      throw new Error(`the band of ${key}: ${why}`);
    };
    if (!judged.length && (band || inert || verdicts.some((v) => v.solved))) {
      fail('no line is judged, so it can have no band, no inert reason and no verdict');
    }
    if (!band && judged.length && !inert && verdicts.some((v) => v.kind === 'pass')) {
      fail('a position passes every line and no band was built around it');
    }
    if (inert && (band || share !== null || move !== null)) fail('an inert lever is never drawn as a band');
    if (band) {
      if (contains !== (band.lower.inside <= stance && stance <= band.upper.inside)) fail('contains disagrees with its edges');
      if (contains === (move !== null)) fail('a band either contains the stance or offers a move, never both or neither');
      if (others.some((o) => !(o.to < band.lower.inside || o.from > band.upper.inside))) fail('another stretch overlaps the band');
    }
    Object.freeze(this);
  }
}

/**
 * Edges and segments over one ordered list of verdicts. Shared by the band and
 * by its coarse-grid re-reading, so the stepped-over check is the same rule
 * run twice rather than a second rule.
 */
function bracket(verdicts, stance, control) {
  // A stretch runs from a pass to a pass, and a gap between two passes does not
  // end it. A gap is a position with no figure for some line (a run that did
  // not finish, or a sample built before it carried the band's readings): it
  // says nothing about the lines, so ending the stretch there lettered a hole
  // in the data as an edge of the design space, and split one passing stretch
  // into single points that each "passed alone". It is still not a pass: the
  // unread positions are kept on the stretch and said in view beside it, and
  // an edge is still only ever a measured pass. A gap at the end of a stretch,
  // with no pass beyond it, closes that edge in its own words as before. A
  // refusal, a failure and a position not yet landed all end a stretch.
  const segments = [];
  let start = null;
  let lastPass = null;
  const close = () => {
    if (start !== null) segments.push({ first: start, last: lastPass });
    start = null;
    lastPass = null;
  };
  verdicts.forEach((verdict, index) => {
    if (verdict.kind === 'pass') {
      if (start === null) start = index;
      lastPass = index;
    } else if (verdict.kind !== 'gap') {
      close();
    }
  });
  close();

  const span = (segment) =>
    Object.freeze({
      from: verdicts[segment.first].value,
      to: verdicts[segment.last].value,
      unread: Object.freeze(verdicts.slice(segment.first, segment.last + 1).filter((verdict) => verdict.kind === 'gap')),
    });
  const at = segments.find((segment) => span(segment).from <= stance && stance <= span(segment).to);
  let chosen = at ?? null;
  let tie = false;
  if (!chosen && segments.length) {
    const distance = (segment) => {
      const { from, to } = span(segment);
      return stance < from ? from - stance : stance - to;
    };
    // Equal within a thousandth of a step, the tolerance `samplePoints` merges
    // positions at: two distances that are the same number of steps arrive a
    // few ulps apart, and comparing them exactly let the upper stretch win a
    // tie the rule gives to the lower one, and said nothing about it.
    const same = (a, b) => near(distance(a), distance(b), control.step);
    const ranked = [...segments].sort((a, b) => (same(a, b) ? span(a).from - span(b).from : distance(a) - distance(b)));
    chosen = ranked[0];
    tie = ranked.length > 1 && same(ranked[0], ranked[1]);
  }
  const spans = segments.map(span);
  if (!chosen) return { segments: spans, band: null, tie: false };

  const edge = (side) => {
    const index = side === 'lower' ? chosen.first : chosen.last;
    const beyond = side === 'lower' ? index - 1 : index + 1;
    const inside = verdicts[index].value;
    if (beyond < 0 || beyond >= verdicts.length) {
      const end = side === 'lower' ? control.min : control.max;
      if (!near(inside, end, control.step)) {
        throw new Error(`the ${side} edge at ${inside} runs off a curve that does not reach the stop at ${end}`);
      }
      return new Edge({ side, inside, stop: true });
    }
    return new Edge({ side, inside, outside: verdicts[beyond].value, closedBy: verdicts[beyond] });
  };
  return {
    segments: spans,
    band: Object.freeze({ lower: edge('lower'), upper: edge('upper') }),
    chosen: spans[segments.indexOf(chosen)],
    tie,
  };
}

/**
 * Whether a lever cannot move any judged line, and why (research R12).
 *
 * Two routes, both deliberately strict. A priced lever is decided off the
 * declaration (`Quantity.movedBy`), the same one `refusesPairing` trusts and
 * the reach harness checks against the real bill, so the reason it reaches
 * only the bill is said rather than inferred from a flat line. Every other
 * lever is decided by measurement, and only by **exact** equality across a
 * complete curve: the engine is repeatable on one input, so there is no noise
 * to tolerate, and a tolerance would call a lever with a small real effect
 * inert. A curve still landing is never declared inert.
 */
function inertness({ key, label, preset, lines, verdicts, priced, unjudged = [] }) {
  // Said of the lines these runs judge, and only of all of the standard's when
  // that is what they are. A lever flat on the one line a design day can read
  // (a cooling setpoint against Passivhaus's peak heating load) was lettered as
  // moving none of Passivhaus's lines, two of which it drives and neither of
  // which a design day can answer.
  const partial = unjudged.some((line) => line.target.limit != null);
  const these = !partial
    ? `${preset.name}'s lines`
    : lines.length === 1
      ? `the one line of ${preset.name} these runs judge`
      : `the ${lines.length} lines of ${preset.name} these runs judge`;
  if (priced && lines.every(({ reading }) => !reading.quantity.movedBy.has(key))) {
    return `${label} reaches only the bill, and none of ${these} is read from it.`;
  }
  if (verdicts.some((v) => v.kind === 'unsolved')) return null;
  const solved = verdicts.filter((v) => v.solved);
  if (solved.length < 2) return null;
  const flat = lines.every(({ target }) => solved.every((v) => v.values.get(target) === solved[0].values.get(target)));
  return flat ? `${label} did not move ${partial ? these : `any of ${these}`} across its travel.` : null;
}

/**
 * One lever's band under one chased standard. Pure.
 *
 * `curve` is the study's points (a point per landed position, possibly sparse
 * while the sweep is landing) and `positions` every position the study will
 * visit, so an unlanded position is known to be there rather than silently
 * bridged by a bracket. `says(target)` is the board's own sentence for a line
 * the run cannot read, injected so this module stays free of the page.
 *
 * `stance` is where the lever stands now and `swept` where it stood when the
 * sweep was made, the position `samplePoints` forced into the grid. They part
 * the moment the reader moves the studied lever itself: that moves no rest
 * shape, so the curve stays current and is never re-swept, and a band measured
 * from the old setting went on saying "fails here, move +0.05" after the
 * reader had made exactly that move (FR-002 measures from the current setting).
 */
export function bandFor({
  key,
  label = key,
  control,
  stance,
  swept = stance,
  curve,
  positions = null,
  preset,
  coarse = false,
  stale = false,
  priced = false,
  landed = 0,
  says,
  atSetting = null,
  afterCoarse = true,
}) {
  if (!preset) throw new Error(`the band of ${key} was asked for with no standard chased`);
  if (!Number.isFinite(stance)) throw new Error(`the band of ${key} has no stance to measure from`);
  if (!Number.isFinite(swept)) throw new Error(`the band of ${key} has no record of where it was swept from`);
  if (typeof says !== 'function') throw new Error(`the band of ${key} has no way to say why a line is not judged`);

  const points = (curve ?? []).filter(Boolean);
  const byValue = (value) => points.find((point) => near(point.value, value, control.step)) ?? null;
  const at = [...new Set([...(positions ?? []), ...points.map((point) => point.value)])].sort((a, b) => a - b);
  const order = at.filter((value, index) => index === 0 || !near(value, at[index - 1], control.step));
  // Snapped onto the position the sweep ran there, where it ran one. The desk's
  // own value and the grid's arrive a few ulps apart (`samplePoints` snaps
  // through floating point), and compared exactly a desk standing on a
  // measured position read as just outside its own band, with a move of
  // 3e-17 to make. Off the grid it stays where it is: a setting between two
  // runs, which the band can place but no verdict speaks for.
  const here = order.find((value) => near(value, stance, control.step)) ?? stance;

  // Judged: a line with a figure that this curve carries somewhere. A line the
  // run cannot read takes no part, and says so in the board's own words.
  const lines = [];
  const unjudged = [];
  for (const target of preset.targets) {
    if (target.limit == null) {
      unjudged.push(Object.freeze({ target, says: `${preset.name} names ${target.asks}` }));
      continue;
    }
    const reading = readingForTarget(preset, target);
    const carried = points.some((point) => !point.refused && point.readings && reading.valueOf(point.readings) !== null);
    if (carried) lines.push({ target, reading });
    else unjudged.push(Object.freeze({ target, says: says(target) }));
  }
  const judged = Object.freeze(lines.map(({ target }) => target));

  const positionsRead = lines.length ? order.map((value) => judge(byValue(value), value, lines)) : [];
  // A setting with no landed sample of its own read "not judged at this
  // setting" with a move of a step's fraction to the nearest run, on a desk
  // whose own solve the chase line was judging a few centimetres above. That
  // solve is a run at exactly this setting, under the same climate and the
  // same everything else, so where it carries every judged line it stands in
  // the band as the measured position there, never in part: a line the desk's
  // run cannot read leaves the setting unjudged as before. Asked wherever the
  // sweep holds no sample at the setting, not only off its grid: a re-price
  // rebuilds a stored study around the lever's current value
  // (`redrawStudiesForQuantity`, which queues nothing), so a setting that was
  // between two runs becomes a position of the grid with no run behind it,
  // and asked only off the grid it went back to "not judged" for good. A
  // sample that did land there (passed, failed, refused or gap) is what speaks.
  const onGrid = order.some((value) => near(value, stance, control.step));
  const figures = !(onGrid && byValue(here)) && lines.length && atSetting ? lines.map(({ target }) => atSetting(target)) : null;
  const deskJudged = Boolean(figures?.every(Number.isFinite));
  if (deskJudged) {
    const desk = measured(here, lines, (line) => figures[lines.indexOf(line)], { byDesk: true });
    if (onGrid) positionsRead[order.indexOf(here)] = desk;
    else positionsRead.splice(positionsRead.filter((verdict) => verdict.value < here).length, 0, desk);
  }
  // Still landing: a position the sweep will visit with no run behind it yet,
  // other than the setting when the desk's own run has judged it there.
  const incomplete = order.some((value) => !byValue(value) && !(deskJudged && value === here));
  const verdicts = Object.freeze(positionsRead);
  // Inertness is a claim of exact flatness across the sweep, so it is asked of
  // the sweep's own samples only: the desk's run is read by another reader,
  // and a last-digit difference between the two would call a flat lever live.
  const inert = lines.length
    ? inertness({ key, label, preset, lines, verdicts: verdicts.filter((verdict) => !verdict.byDesk), priced, unjudged })
    : null;

  const base = { key, label, stance: here, judged, unjudged: Object.freeze(unjudged), verdicts, coarse, stale, incomplete, landed };
  if (!lines.length || inert) {
    return new Band({
      ...base,
      inert,
      segments: Object.freeze([]),
      band: null,
      unread: Object.freeze([]),
      contains: false,
      tie: false,
      share: null,
      move: null,
      others: Object.freeze([]),
      steppedOver: false,
    });
  }

  const read = bracket(verdicts, here, control);
  const travel = control.max - control.min;
  const chosen = read.band ? read.chosen : null;
  let contains = false;
  let share = null;
  let move = null;
  let others = [];
  if (read.band) {
    const { lower, upper } = read.band;
    contains = lower.inside <= here && here <= upper.inside;
    share = (upper.inside - lower.inside) / travel;
    if (!contains) {
      const to = here < lower.inside ? lower.inside : upper.inside;
      move = Object.freeze({ to, by: to - here, share: Math.abs(to - here) / travel });
    }
    others = read.segments.filter((segment) => segment !== chosen);
  }

  return new Band({
    ...base,
    inert: null,
    segments: Object.freeze(read.segments),
    band: read.band,
    unread: chosen ? chosen.unread : Object.freeze([]),
    contains,
    tie: read.tie,
    share,
    move,
    others: Object.freeze(others),
    // Only a fine curve that followed a coarse one the reader saw, and read off
    // the sweep's own runs: the desk's run is no part of either pass, and
    // counted it turned a stretch found only by the desk into one "the finer
    // pass found". A Study press sweeps the fine grid at once, so it has no
    // coarse pass to have stepped over anything.
    steppedOver:
      !coarse && !incomplete && afterCoarse
        ? steppedOver({ verdicts: verdicts.filter((verdict) => !verdict.byDesk), here, swept, control })
        : false,
  });
}

/**
 * Whether the fine pass found an edge the coarse pass could not have (US3).
 *
 * The coarse grid (11) is every second position of the fine one (21), and the
 * stance is in both, so a finished fine curve already contains its coarse
 * curve. The band is read again over those positions only, and a fine edge
 * outside the coarse bracket on its side is a stretch the coarse pass stepped
 * over. Nothing about an earlier band is kept between renders.
 *
 * The coarse grid is laid around `swept`, the position both passes forced in,
 * so it is the grid the coarse pass actually ran; the bracket is still chosen
 * around `here`, where the lever stands now, as the fine band's was.
 */
function steppedOver({ verdicts, here, swept, control }) {
  const read = bracket(verdicts, here, control);
  const grid = samplePoints(control, swept, COARSE_SAMPLES);
  const coarse = verdicts.filter((verdict) => grid.some((value) => near(value, verdict.value, control.step)));
  const thin = bracket(coarse, here, control);
  // Only what the coarse pass actually saw can have been stepped over. Where
  // its positions carried no figure the coarse band is narrower for want of
  // data, not for a line failing, and saying the finer pass "found a stretch
  // the coarse pass stepped over" there was false: it was said on every card
  // whose coarse positions came from a narrow survey sample.
  if (!read.band) return false;
  if (!thin.band) return coarse.length > 0 && coarse.every((verdict) => verdict.solved);
  return ['lower', 'upper'].some((side) => {
    const fine = read.band[side];
    const rough = thin.band[side];
    if (rough.stop) return !fine.stop;
    // Narrower than the coarse band is a failure the coarse pass ran past, and
    // always a finding. Wider is a finding only past a coarse run that failed:
    // past one that carried no figure, the coarse pass simply could not see.
    const toward = side === 'lower' ? -1 : 1;
    const wider = (fine.inside - rough.outside) * toward >= 0 && !near(fine.inside, rough.inside, control.step);
    if (wider) return rough.closedBy.kind === 'fail';
    return (fine.inside - rough.inside) * toward < 0 && !near(fine.inside, rough.inside, control.step);
  });
}

/* ══ every lever, read together ════════════════════════════════════════════ */

/** On a failing desk, the smallest single move measured to restore every line. */
export class RestoringMove {
  constructor({ failing, lever, alone, asked, tied }) {
    this.failing = Object.freeze([...failing]);
    this.lever = lever;
    this.alone = alone;
    this.asked = asked;
    this.tied = Object.freeze([...tied]);
    if (lever && (lever.inert || !lever.move)) throw new Error(`${lever.key} cannot be offered as a move`);
    Object.freeze(this);
  }
}

/** The block under the chase line. */
export class Tolerance {
  constructor({ preset, bands = [], passing = null, ranked = [], inert = [], restore = null, absence = null, stale = 0, unjudged = [], landing = false }) {
    if (!preset && !absence) throw new Error('a tolerance block with nothing chased must say so');
    this.preset = preset;
    this.bands = Object.freeze([...bands]);
    this.passing = passing;
    this.ranked = Object.freeze([...ranked]);
    this.inert = Object.freeze([...inert]);
    this.restore = restore;
    this.absence = absence;
    this.stale = stale;
    this.unjudged = Object.freeze([...unjudged]);
    // Whether a band read here is off a sweep still landing: a "no lever
    // restores" said over a curve whose passing stretch has not run yet is a
    // verdict on positions nobody has measured.
    this.landing = landing;
    this.asked = this.bands.length;
    Object.freeze(this);
  }
}

/**
 * Every studied lever's band, read together. Pure.
 *
 * Whether the desk passes is read off the stance verdicts of the current bands,
 * which all measure the same desk; when every band is stale, off the most
 * recently landed one, and the block is then marked as describing the previous
 * desk rather than left blank (data model, `RestoringMove.failing`).
 */
export function toleranceFor({ preset, bands, climateReason = null }) {
  if (!preset) return new Tolerance({ preset: null, absence: SAYS.noChase });
  if (!bands.length) return new Tolerance({ preset, absence: climateReason ?? SAYS.noStudy });
  if (!preset.targets.some((target) => target.limit != null)) {
    return new Tolerance({ preset, bands, absence: `${preset.name} publishes no line the bands could judge.` });
  }

  const judging = bands.filter((band) => band.judged.length);
  const stale = bands.filter((band) => band.stale).length;
  if (!judging.length) {
    const reasons = [...new Set(bands.flatMap((band) => band.unjudged.map((line) => line.says)))];
    return new Tolerance({
      preset,
      bands,
      stale,
      absence: `No line of ${preset.name} can be read by these runs: ${reasons.join('; ')}.`,
    });
  }

  const current = judging.filter((band) => !band.stale);
  const source = current.length ? current : [[...judging].sort((a, b) => b.landed - a.landed)[0]];
  const stanceOf = (band) => band.verdicts.find((verdict) => verdict.value === band.stance && verdict.solved) ?? null;
  const stances = source.map(stanceOf).filter(Boolean);
  const passing = stances.length ? stances.every((verdict) => verdict.kind === 'pass') : null;
  const failing = [...new Set(stances.flatMap((verdict) => verdict.failing))];

  const inert = bands.filter((band) => band.inert);
  const live = source.filter((band) => !band.inert);
  const unjudged = [...new Map(bands.flatMap((band) => band.unjudged).map((line) => [line.target, line])).values()];
  const landing = live.some((band) => band.incomplete);

  if (passing !== false) {
    const ranked = live.filter((band) => band.band && band.contains).sort((a, b) => a.share - b.share);
    return new Tolerance({ preset, bands, passing, ranked, inert, stale, unjudged, landing });
  }

  // Equal within a billionth of the travel, far below any lever's one step
  // (the finest face here is 1 in 3,600) and far above the ulps two equal shares
  // arrive apart by: 0.085 of SHGC's 0.85 is 0.09999999999999996 and 5 of a
  // setpoint's 50 is 0.1, so compared exactly two levers ten per cent away
  // were never tied, and which one was named came down to rounding — the trap
  // `bracket` already met with distances inside one lever.
  const sameShare = (a, b) => Math.abs(a - b) < 1e-9;
  const movers = live
    .filter((band) => band.move)
    .sort((a, b) => (sameShare(a.move.share, b.move.share) ? 0 : a.move.share - b.move.share));
  const best = movers[0] ?? null;
  const tied = best ? movers.filter((band) => sameShare(band.move.share, best.move.share)).map((band) => band.key) : [];
  const alone = new Map(
    failing.map((target) => [
      target,
      live
        .filter((band) => band.verdicts.some((verdict) => verdict.values.has(target) && target.meets(verdict.values.get(target))))
        .map((band) => band.key),
    ]),
  );
  const restore = new RestoringMove({
    failing,
    lever: best,
    alone,
    asked: bands.length,
    tied: tied.length > 1 ? tied : [],
  });
  return new Tolerance({ preset, bands, passing, inert, restore, stale, unjudged, landing });
}

/* ══ load-time invariants ══════════════════════════════════════════════════ */

// 1 and 2: every limited line of every standard is answered by a reading, and
// that reading's quantity is one the band contents carry. `BAND_QUANTITIES`
// already threw for an unanswered line while it was built; this is the second
// half, which a later edit to the filter above could break on its own.
for (const { preset, target } of limitedTargets()) {
  const quantity = readingForTarget(preset, target).quantity;
  if (!BAND_QUANTITIES.includes(quantity)) {
    throw new Error(
      `"${preset.name} · ${target.label}" is read off ${quantity.id}, which a study sample does not carry, ` +
        'so every band would leave that line unjudged',
    );
  }
}

// 3: what a study sample carries answers what the study itself asks for, at
// every combination of the channels any quantity depends on. Without it a
// study would stop drawing its own curve the day the band contents left
// something out.
{
  const gates = [...new Set(QUANTITIES.flatMap((quantity) => quantity.needs.channels))];
  for (let mask = 0; mask < 1 << gates.length; mask += 1) {
    const engaged = gates.filter((_, bit) => mask & (1 << bit));
    for (const quantity of QUANTITIES) {
      if (!quantity.needs.channels.every((channel) => engaged.includes(channel))) continue;
      const carried = RunContents.union(bandQuantities(quantity, engaged).map((q) => contentsFor(q, engaged)));
      if (!carried.answers(contentsFor(quantity, engaged))) {
        throw new Error(
          `a study of ${quantity.id} with ${engaged.join(', ') || 'no gated channel'} in would carry less than ` +
            'its own reading needs once the band contents are added',
        );
      }
    }
  }
}

// 4: every line passes at its limit and fails just above it. A band's verdict
// is `meets` and nothing else, so a line that ever grows another comparator is
// caught here rather than drawn on the wrong side of its own edge.
for (const { preset, target } of limitedTargets()) {
  const above = target.limit + Math.max(1, Math.abs(target.limit)) * 1e-9;
  if (target.meets(target.limit) !== true || target.meets(above) !== false) {
    throw new Error(
      `"${preset.name} · ${target.label}" does not pass at its limit and fail just above it, so a band ` +
        'judged with it would draw an edge on the wrong side',
    );
  }
}
