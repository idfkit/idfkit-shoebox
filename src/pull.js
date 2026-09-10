/**
 * The pull: every sweepable control ranked by how far it moves the reading.
 *
 * **DOM-free and engine-free**, by the rule `readings.js`, `describe.js`,
 * `tm59.js` and `survey.js` already follow, so the Node harness calls the real
 * ranking rather than a copy of it.
 *
 * A survey answers "what does this ground look like". The pull answers the
 * question that comes before it: *which two controls are worth cutting a
 * ground along*. Ninety sweepable faces is far too many to try, and a reader
 * with no answer to that picks the two they already had a hypothesis about,
 * which is the failure mode this whole feature exists to end.
 *
 * ## One-sided differences, and what that buys
 *
 * The stance's own run is already in hand, so each control costs exactly one
 * extra run rather than two: 90 controls at most, not 180. Counted rather than
 * estimated — 18 channels, 144 control keys, 9 of them priced, and **90
 * sweepable numeric faces**. At the design-day cadence of about 50 ms across a
 * pool of four that is roughly 1.1 s, inside SC-001's five seconds with room
 * to spare. At the annual cadence of about 0.7 s the same 90 runs are about
 * **15.8 s**, which is slower than anything else on this desk.
 *
 * The spec's assumption is that a survey measures at the run kind the desk is
 * on and does not silently drop to design days to go faster, and that
 * assumption governs here too. So the pull reads at the desk's own kind and
 * reports progress as it fills, with the top entries stable early. Reading at
 * design-day cadence on an annual desk is admissible **only if stated** —
 * `PullReading.kind` carries which it was, and the sheet letters it — because
 * doing it silently is exactly the substitution Principle IV forbids.
 *
 * ## Inert controls cost nothing and are listed anyway
 *
 * A control whose channel is bypassed, or whose wall can carry no opening,
 * reaches no object in the document: sweeping it would spend a run on a
 * byte-identical model. It is returned as an entry carrying its reason rather
 * than omitted or drawn as zero (FR-027), because "this does nothing here" and
 * "this does nothing" are different facts and the second one would be a lie.
 * That is read from the document and the patch bay, never from `params`.
 */

import { CHANNELS, controlFor, labelFor } from './controls.js';
import { READING_BY_ID } from './survey.js';
import { refusesSweep } from './study.js';

/**
 * One control at the stance (FR-025).
 *
 * `inert` and `effect` are mutually exclusive and never both null, the same
 * shape `Reading` in `tm59.js` enforces and for the same reason: an entry that
 * carried neither would be a row on the ranking with nothing to say, and an
 * entry that carried both would be two claims about one control.
 */
export class PullEntry {
  constructor({ key, control, side, channel, direction = null, effect = null, perUnit = '', room = 0, atStop = false, inert = null, at = null }) {
    if (!key) throw new Error('a pull entry needs a control key');
    if ((inert === null) === (effect === null)) {
      throw new Error(
        `the pull entry for "${key}" carries ${inert === null ? 'neither an effect nor a reason it has none' : 'both an effect and a reason it has none'}`,
      );
    }
    if (effect !== null && !['raise', 'lower', 'none'].includes(direction)) {
      throw new Error(`the pull entry for "${key}" states its direction as "${direction}"`);
    }
    if (effect !== null && (room < 0 || (room === 0) !== Boolean(atStop))) {
      throw new Error(
        `the pull entry for "${key}" has ${room} of range left in the improving direction and says atStop is ${atStop}`,
      );
    }
    this.key = key;
    this.control = control;
    this.side = side ?? null;
    this.channel = channel;
    this.label = labelFor(key);
    /** 'raise' | 'lower' | 'none' — stated in words, never by colour alone. */
    this.direction = direction;
    /** Change in the reading per unit of this control's own travel. */
    this.effect = effect;
    this.perUnit = perUnit;
    /** How much range remains in the direction that improves the reading. */
    this.room = room;
    /** True where `room` is zero: a steep face with nowhere left to go. */
    this.atStop = Boolean(atStop);
    this.inert = inert;
    /** Where the probe was taken, so a reader can check the arithmetic. */
    this.at = at;
    Object.freeze(this);
  }

  /** The magnitude the ranking sorts on. Zero for an inert control. */
  get pull() {
    return this.effect === null ? 0 : Math.abs(this.effect);
  }
}

/**
 * Which run kind the ranking was read at, carried so it can be lettered.
 *
 * A class rather than a string because the sentence is the point: nothing here
 * may state a ranking without stating what it was read from, and a bare
 * `'annual'` on the side of a return value is a field somebody eventually
 * forgets to print.
 */
export class PullReading {
  constructor({ kind, reading, entries, probed }) {
    if (kind !== 'annual' && kind !== 'design-day') {
      throw new Error(`a pull was read at "${kind}", which is not a run kind`);
    }
    this.kind = kind;
    this.reading = reading;
    this.entries = Object.freeze([...entries]);
    /**
     * Controls probed. Deliberately **not** a count of cache hits beside it:
     * the scheduler reports a landed sample and says nothing about whether it
     * cost an engine run, so a `cached` field here could only ever be zero —
     * a figure that is a claim rather than a measurement, which is the one
     * thing this sheet exists not to print. The desk's own solve counter is
     * where the reader can see what a pull actually spent.
     */
    this.probed = probed;
    Object.freeze(this);
  }

  /** The sentence that must accompany the ranking wherever it is drawn. */
  get said() {
    return this.kind === 'annual'
      ? `Read against ${this.reading.label.toLowerCase()} over the attached weather year, one run per control.`
      : `Read against ${this.reading.label.toLowerCase()} over the two design days, one run per control.`;
  }
}

/**
 * Whether a control reaches any object in the document at this stance.
 *
 * Asked of the channel state and of the control's own declaration, never of
 * `params`: a control set to something is not the same as a control that
 * reaches something, and the difference is precisely what FR-027 is about.
 */
function inertReason(control, side, channel, engaged, snapshot) {
  if (!engaged.has(channel.id)) {
    return `The ${channel.name} channel is out of the path, so this control reaches no object.`;
  }
  if (control.inert?.(snapshot)) return control.note ?? 'Set, but reaching no object at this stance.';
  if (side && !side.reaches(snapshot)) return side.reasonFor(snapshot);
  return null;
}

/**
 * Every control worth probing at this stance, and every one that is not.
 *
 * Returns `{ probes, inert }`: the probes are shaped for `makeStudyJob`
 * exactly as `rowsFor`'s row specs are, so they go through the same queue, the
 * same pool and the same cache — which is what makes FR-011 true here as well
 * as for the ground. A control already swept by a study, or already measured
 * by an earlier survey, is a cache hit and costs no run.
 *
 * One probe per control, one step from the stance. Which direction the step is
 * taken in is decided by where there is room: at the top of its face a control
 * is probed downward, everywhere else upward. That is not a preference, it is
 * the only step available — a probe off the end of the face would be a
 * position the desk cannot hold.
 */
export function pullProbes(stance, patch, { quantity, engaged, annual, epw = null, needed, carried, restShape, id = 'pull' }) {
  if (!quantity) throw new Error('pullProbes: a pull is read against one declared quantity');
  const engagedSet = new Set(engaged);
  const probes = [];
  const inert = [];
  for (const channel of CHANNELS) {
    // Nothing a priced channel owns reaches the IDF, so a probe of one would
    // be a run that could only reproduce the number already on the sheet.
    if (channel.prices) continue;
    for (const control of channel.controls) {
      if (refusesSweep(control)) continue; // no numeric face; there is nothing to step along
      const sides = control.kind === 'facade' ? control.sides : [null];
      for (const side of sides) {
        const key = side ? side.key : control.key;
        const reason = inertReason(control, side, channel, engagedSet, stance);
        if (reason) {
          inert.push(new PullEntry({ key, control, side, channel, inert: reason }));
          continue;
        }
        const here = stance[key];
        const { min, max, step } = control;
        // A step of the control's own grid, or a twentieth of its face where
        // that is coarser — a probe one step wide on a control whose face is
        // two hundred steps long measures the rounding, not the building.
        const size = Math.max(step, Math.round((max - min) / 20 / step) * step);
        const up = here + size <= max;
        const to = up ? here + size : here - size;
        if (!(to >= min && to <= max) || to === here) {
          inert.push(
            new PullEntry({
              key,
              control,
              side,
              channel,
              inert: 'This control has no room left on its face to step along from where it stands.',
            }),
          );
          continue;
        }
        probes.push({
          id: `${id}:${key}`,
          key,
          snapshot: { ...stance },
          patch,
          epw,
          annual,
          quantity: quantity.id,
          needed,
          carried,
          restShape,
          points: [here, to],
          // The stance first, because it is the likeliest cache hit on the
          // desk — every study and the sheet's own solve share it.
          order: [0, 1],
          origin: 'pull',
          asked: 2,
          control,
          side,
          channel,
          from: here,
          to,
          size,
        });
      }
    }
  }
  return { probes, inert };
}

/**
 * Turn one landed probe into an entry.
 *
 * `direction` is `'none'` **only where the effect is exactly zero**. There is
 * no noise floor and no effect is dismissed as small (FR-026): the engine is
 * repeatable on one input — 20 runs of one design agree exactly, measured —
 * so every difference that comes back is real, and rounding one away would be
 * this sheet deciding which of its own measurements to believe.
 */
export function entryFrom(probe, { here, there, reading }) {
  const { control, side, channel, key, from, to, size } = probe;
  if (here === null || there === null) {
    return new PullEntry({
      key,
      control,
      side,
      channel,
      inert:
        here === null
          ? 'The stance itself could not be read for this quantity.'
          : 'The probe run did not complete, so this control could not be measured.',
    });
  }
  const delta = there - here;
  // Per unit of the control's own travel, which is what makes two controls in
  // different units comparable at all — and what `perUnit` then has to say, or
  // the figure is a number with no dimension.
  const effect = delta / (to - from);
  const direction = delta === 0 ? 'none' : delta > 0 ? 'raise' : 'lower';
  // Which way improves the reading, and therefore how much range is left in
  // that direction. A steep face with nowhere to go is a different fact from
  // one with half its range in hand (US2 scenario 2), and ranking them
  // together would send the reader to a control they cannot move.
  const wantLower = reading.better === 'lower';
  const improvingUp = wantLower ? effect < 0 : effect > 0;
  const room = effect === 0
    ? 0
    : improvingUp
      ? control.max - from
      : from - control.min;
  return new PullEntry({
    key,
    control,
    side,
    channel,
    direction,
    effect,
    // A control with no unit is a ratio or a fraction, and lettering it
    // `0.20 unit` is worse than lettering it `0.20`: it invents a dimension
    // the declaration deliberately does not have.
    perUnit: control.unit || '',
    room: Math.max(0, room),
    atStop: Math.max(0, room) === 0,
    at: { from, to, size, here, there },
  });
}

/**
 * The ranking, by magnitude of effect per unit of the control's own travel.
 *
 * Inert entries sort last and keep their reasons, because they are a reading
 * about the desk rather than a gap in one: "the Blinds channel is out of the
 * path" is often exactly the answer to "why does nothing I try move this".
 */
export function rankPull(entries) {
  return [...entries].sort((left, right) => {
    if ((left.inert === null) !== (right.inert === null)) return left.inert === null ? -1 : 1;
    // A control at its stop sorts below one with room, at equal steepness,
    // because the reader can act on the second and not on the first.
    if (left.inert === null && left.atStop !== right.atStop) return left.atStop ? 1 : -1;
    return right.pull - left.pull || left.key.localeCompare(right.key);
  });
}

/**
 * Two chosen entries as two axis declarations (FR-028).
 *
 * So that choosing from the ranking cuts the ground without retyping
 * anything — which is the loop the whole feature exists for: read what is
 * pulling the design, cut a ground along the two that pull hardest, stand on
 * the best measured point, read what is pulling it now.
 */
export function axesFrom(entries, a, b) {
  const find = (id) => entries.find((entry) => entry.key === id);
  const x = find(a);
  const y = find(b);
  if (!x || !y) throw new Error('axesFrom: one of those controls is not on this ranking');
  if (x.key === y.key) throw new Error('axesFrom: a ground needs two different controls');
  for (const entry of [x, y]) {
    if (entry.inert) throw new Error(`axesFrom: ${entry.label} ${entry.inert.toLowerCase()}`);
  }
  return { x: x.key, y: y.key };
}

/** The reading a pull is taken against, resolved by series id. */
export function pullReadingFor(id) {
  const reading = READING_BY_ID[id];
  if (!reading) throw new Error(`no survey reading is declared as "${id}"`);
  if (!reading.better) {
    throw new Error(
      `"${reading.label}" declares no improving direction, so "how much range is left in the improving ` +
        'direction" has no answer and a pull cannot be ranked against it',
    );
  }
  return reading;
}

{
  // The key ownership every entry depends on, asserted at module load rather
  // than discovered as an entry whose label is the raw key.
  for (const channel of CHANNELS) {
    if (channel.prices) continue;
    for (const control of channel.controls) {
      if (refusesSweep(control)) continue;
      const keys = control.kind === 'facade' ? control.sides.map((side) => side.key) : [control.key];
      for (const key of keys) controlFor(key);
    }
  }
}
