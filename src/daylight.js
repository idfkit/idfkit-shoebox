/**
 * The daylight reading: a typical illuminance, over occupied hours, at one
 * stated point deep in the room.
 *
 * The sheet reports what a window costs. Heating, cooling, carbon, cost and
 * overheating hours all improve as the window shrinks, so the energy optimum
 * the sheet's own readings point at is the smallest window it can sweep, in a
 * room nobody would want to occupy, and nothing on the page says anything was
 * lost. This module is the other half of that trade.
 *
 * **What this reading is.** The median of the hourly illuminance at the probe,
 * over the occupied hours of the run's weather-file environments. Split flux,
 * one point, no spatial claim. It is offered as a comparison between positions
 * of *this* desk and it carries no target, because no line this sheet holds
 * judges it and inventing one would turn a ranking instrument into a
 * certificate.
 *
 * **What it is not.** Not sDA, not UDI, not a daylight factor, whether or not
 * some arithmetic happens to match. Not compliance evidence. Not a Radiance
 * answer: the absolute value is the least trustworthy thing here and the
 * ordering is the most, which is why the claim made for it is the ordering and
 * was measured as one -- Spearman 0.9957 and an identical thirteen-point Pareto
 * frontier against an annual daylight coefficient chain.
 *
 * DOM-free and network-free, so the Node harnesses call this same code.
 */

import { BUDGETS, withinBudget } from './copy.js';
// The probe's position is declared where the probe is written, because a
// position stated in one file and written in another is a position that will
// one day be changed in only one of them. `model.js` imports nothing from here,
// which is what keeps this out of the import cycle `contents.js` exists to
// break.
import { ILLUMINANCE_VARIABLE, PROBE_DEPTH, PROBE_HEIGHT } from './model.js';
import { exactly, hourly } from './readings.js';
import { alignedWith, occupancySeries, occupied, weatherRuns } from './tm59.js';
// The probe's height is a length and has to be lettered like every other length
// on the sheet. `units.js` is DOM-free and network-free, so importing it here
// costs this module none of what its header promises.
import { KINDS, letter } from './units.js';

// Re-exported so the roster can declare what the run must carry without
// importing `model.js`, which would close the cycle `contents.js` exists to
// break. The name itself is declared beside the request that asks for it.
export { ILLUMINANCE_VARIABLE };

/**
 * Where split flux stops being worth believing: a room deeper than three times
 * its ceiling height.
 *
 * The limit is the method's own, not this sheet's. Split flux distributes the
 * internally reflected component as though the room were a uniformly lit box,
 * and a deep plan is the case where that assumption parts company with the
 * room. The shipped desk is 15.24 m deep under a 4.572 m ceiling, which is
 * 3.333, so the sheet is past the limit on first load and the statement of it
 * is not an edge case.
 */
export const VALIDITY_DEPTH_RATIO = 3;

/**
 * How deep the room is over how high it is, asked of the geometry the document
 * holds rather than of `params`.
 *
 * `built` is a `geometryFacts` result, which is taken off a sample's own
 * document. A sweep's overlay is in that document and is not in `params`, so a
 * validity statement read from parameters would describe the desk instead of
 * the sample it is lettered beside.
 */
export function depthRatio(built) {
  const depth = built?.faces?.find((face) => face.side === 'east')?.length;
  const height = built?.height;
  if (!Number.isFinite(depth) || !Number.isFinite(height) || !(height > 0)) {
    throw new Error(
      'depthRatio: the geometry carries no east face length or no ceiling height, and the ' +
        'method\'s validity limit is a statement about the room rather than about the reading',
    );
  }
  return depth / height;
}

/** Whether split flux is inside its own stated limit on this room. */
export function withinValidity(built) {
  return depthRatio(built) <= VALIDITY_DEPTH_RATIO;
}

/**
 * What stands beside the figure, in view and never in a fold.
 *
 * Declared here rather than at the surface that draws it, because FR-020 makes
 * the absence of it a load-time failure: a figure that looks like every other
 * figure on the sheet, but is a ranking instrument rather than a measurement, is
 * worse than no figure at all. The roster asserts that it exists; `console.js`
 * decides where it sits.
 *
 * **The whole sentence is declared, not just its first clause.** The first draft
 * carried the position here and left the other two clauses hardcoded in
 * `main.js`'s render path, which made the roster's `qualified` field a promise
 * nothing kept: a second surface lettering this reading would have lettered it
 * bare, and the assertion guarding the field would still have passed. `say()` is
 * what makes the declaration the thing every surface asks for.
 *
 * The method's own prose is deliberately *not* here. Per the maintainer's
 * decision of 2026-09-20 the method folds and the qualification stands in view,
 * so the method text is the readout's `note` in `controls.js`, in a fold, spelled
 * once. A copy here would be a fourth wording of it that nothing draws.
 */
export class ReadingQualification {
  /**
   * `position` is a thunk, not a string, and that is the units rule rather than
   * a style. The position names a height above the floor, a height is a length,
   * and a length is lettered at the moment it is drawn or it stands in the
   * system the page booted in for the life of the session -- which is how
   * `0.8 m` came to sit beside `29 fc` on an IP sheet. The same reason
   * `console.js` keeps `studySweeps` as a thunk per key.
   */
  constructor({ position, unjudged }) {
    if (typeof position !== 'function') {
      throw new Error(
        'a qualified reading needs its position stated, as a thunk lettered at draw time; where in ' +
          'the room a single-point illuminance was taken is the one thing a reader cannot recover ' +
          'from the figure, and it carries a length that has to answer to the unit system',
      );
    }
    if (typeof unjudged !== 'string' || !unjudged.trim()) {
      throw new Error(
        'a qualified reading needs to say that no published line judges it; every other reading on ' +
          'this sheet can be held against somebody\'s limit, and one that cannot must say so where ' +
          'it stands rather than look like the others',
      );
    }
    this.position = position;
    this.unjudged = unjudged;
    Object.freeze(this);
  }

  /**
   * The sentence, composed at draw time against the room the figure was measured
   * in.
   *
   * `ratio` is the room's depth over its height, measured on the document the
   * run was solved from and never read off the live desk: the desk moves between
   * runs, and a validity statement taken from it describes a building the figure
   * beside it is not about.
   *
   * The breach is tested on the value that will be *printed* rather than on the
   * full-precision one. Otherwise a room at 3.0009× read "Room 3.0× its own
   * height, past split flux's stated limit of 3", which is a sentence
   * disagreeing with itself.
   */
  say(ratio) {
    const parts = [this.position(), this.unjudged];
    const shown = Number.isFinite(ratio) ? Number(ratio.toFixed(1)) : null;
    if (shown !== null && shown > VALIDITY_DEPTH_RATIO) {
      parts.push(
        `Room ${shown.toFixed(1)}× its own height, past split flux's stated limit of ${VALIDITY_DEPTH_RATIO}`,
      );
    }
    return parts.join(' · ');
  }
}

/**
 * The probe's position, said in words, with the depth read off the constant
 * rather than typed beside it.
 *
 * In view and never folded, per FR-005 as the maintainer settled it on
 * 2026-09-20: the figure, its unit, this position, the absence of a published
 * line and the validity breach stand in view; the method's prose and its
 * citations fold under a summary that states the count.
 *
 * A function rather than a constant, because it letters a height. Frozen into a
 * module constant at load it said `0.8 m` beside a figure reading `29 fc`, on a
 * sheet where every other length was in feet, and no gesture could recover it --
 * the value had no conversion path at all rather than a stale one.
 */
export const probePosition = () =>
  `${Math.round(PROBE_DEPTH * 100)} % of the way into the room from the south wall, ` +
  `${letter(KINDS.length, PROBE_HEIGHT)} above the floor`;

export const DAYLIGHT_QUALIFICATION = new ReadingQualification({
  position: probePosition,
  unjudged: 'No published line judges this figure',
});

/**
 * Why there is no figure, each naming the fix first and each inside the
 * twelve-word `ABSENCE` budget, asserted here at load rather than counted by
 * eye.
 *
 * A measured zero takes none of these. A desk with no opening reports 0 lx,
 * clean, nought severe, and that is a measurement: the engine computed the
 * daylight and found none. Zero is a measurement, missing is not, and the two
 * render differently on purpose.
 */
const reason = (id, text) => withinBudget(BUDGETS.ABSENCE, `ABSENCE.${id}`, text);

export const ABSENCE = Object.freeze({
  series: reason('series', 'the run carries no daylight series; solve the desk itself'),
  occupancy: reason('occupancy', 'patch Gains in; this run carries no hourly Occupancy series'),
  unoccupied: reason('unoccupied', 'nobody is home in the months this run covers'),
  weather: reason('weather', 'attach a weather file; two design days are not a year'),
});

/**
 * The reading, or the reason there is none, as one object that cannot carry
 * both and cannot carry neither.
 *
 * The same discipline `tm59.js`'s `Reading` keeps, and for the same reason: a
 * missing figure renders as an em dash with its fix beside it and stays out of
 * every total, and the only way to be sure of that everywhere is to make the
 * other two shapes unconstructable.
 */
export class DaylightReading {
  constructor({ value = null, counted = 0, absence = null }) {
    if (value !== null && absence !== null) {
      throw new Error(
        `the daylight reading carries a value (${value}) and a reason for having none ` +
          `("${absence}"); one of them is a lie`,
      );
    }
    if (value === null && absence === null) {
      throw new Error(
        'the daylight reading carries neither a value nor a reason for having none, and would ' +
          'render as a blank rather than as an em dash with its fix beside it',
      );
    }
    // A third unconstructable shape, and it is the one that was reachable. `NaN`
    // is not null, so it passed both tests above, reached the sheet as a value
    // and threw out of `figureIn` inside `readouts()` -- which builds the map
    // for *every* strip, so one non-numeric illuminance in an ESO stopped the
    // Glazing U-factor and the Air network rate re-lettering too. Named here,
    // where the fact is, rather than four hundred lines away in a render path.
    if (value !== null && !Number.isFinite(value)) {
      throw new Error(
        `the daylight reading carries ${value} as its figure; an illuminance that is not a finite ` +
          'number is a fact about the run rather than a measurement, and the reading has no way to ' +
          'letter it',
      );
    }
    this.value = value;
    // The hours the median was taken over, carried beside the figure rather
    // than derived back out of it: a median of 40 occupied hours and a median
    // of 2,400 are the same figure about different amounts of evidence.
    this.counted = counted;
    this.absence = absence;
    Object.freeze(this);
  }
}

/**
 * The probe's hourly series, or null where the run carries none.
 *
 * Null rather than an empty array, because an empty array is what a run with
 * the variable and no hours would give and those are different facts.
 */
export function illuminanceSeries(eso) {
  const points = hourly(eso, exactly(ILLUMINANCE_VARIABLE));
  return points.length ? points : null;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The median over the hours somebody was in the room, given the three things
 * the run has already been asked for.
 *
 * Handed its series rather than reading them again, because `readDaylight` has
 * just established all three to choose its absence reason between them. Read
 * twice, the pre-flight test and the computation could in principle disagree
 * inside one call, which is a worse fault than the duplicated work.
 *
 * `floor` is the schedule's own unoccupied floor and is a precondition rather
 * than a default: the desk writes a band schedule sitting at 0.1 out of hours,
 * so `> 0` would count every hour of the year as occupied. `occupied` throws
 * rather than guessing, and that throw is left to propagate.
 */
function medianOver(points, occupancy, runs, floor) {
  // Two hourly series of one run are written at the same timestamps, so they
  // are walked together by index. `tm59.js` holds that assertion, because it is
  // a rule about two series of one run rather than about what either measures.
  alignedWith(points, occupancy, 'illuminances', 'occupancy');

  const lit = [];
  for (const run of runs) {
    for (let i = run.start; i <= run.end; i += 1) {
      if (occupied(Number(occupancy[i].value), floor)) lit.push(Number(points[i].value));
    }
  }
  if (!lit.length) return null;
  return { value: median(lit), counted: lit.length };
}

/**
 * The reading or its absence, with the reason chosen by asking the run what it
 * is missing rather than by returning one reason for every kind of silence.
 *
 * The order matters: a run with no daylight series at all is a different fact
 * from a run that has one and no occupied hours to read it over, and a reader
 * told the wrong one of those goes looking in the wrong place.
 *
 * Each of the three is established once and carried down. The first draft asked
 * the run the same three questions twice -- once to choose the reason and once
 * inside the median -- which cost three variable lookups and a second walk over
 * every hour of the year on a reader the study scheduler calls per sample, and
 * left the pre-flight test and the computation free to disagree.
 */
export function readDaylight(eso, { floor } = {}) {
  const points = illuminanceSeries(eso);
  if (!points) return new DaylightReading({ absence: ABSENCE.series });

  // `tm59.js` owns this reader, and owning it is the point: it matches the
  // series on the ESO's *key* rather than its variable name, anchored so a
  // future `Zone People Occupant Count` cannot match it. Its own absence
  // sentence is TM59's and is left there; this module states the same fact in
  // its own words, inside its own budget. Only the reading is shared.
  const { points: occupancy } = occupancySeries(eso);
  if (!occupancy) return new DaylightReading({ absence: ABSENCE.occupancy });

  // The weather-file environments only. A design day exists to be more extreme
  // than any day in the year it precedes, so counting one in would let
  // `sizingPeriods: 'Yes'` move this reading without changing the building.
  const runs = weatherRuns(points, eso.environments ?? []);
  if (!runs.length) return new DaylightReading({ absence: ABSENCE.weather });

  const reading = medianOver(points, occupancy, runs, floor);
  if (!reading) return new DaylightReading({ absence: ABSENCE.unoccupied });
  return new DaylightReading({ value: reading.value, counted: reading.counted });
}
