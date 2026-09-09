/**
 * Overheating risk to CIBSE TM59 (2026): the declarations and the arithmetic.
 *
 * DOM-free, network-free and engine-free, by the rule `readings.js`,
 * `describe.js` and `schemes.js` already follow — the throwaway Node harnesses
 * call *these* functions rather than a copy of them, because "which hours
 * count" and "which day the comfort line belongs to" are exactly the rules
 * that drift silently when a harness reimplements them. Nothing here touches
 * the document, the engine or the page; it is handed a parsed ESO, a weather
 * file's daily means and a category, and it hands back readings.
 *
 * Every figure below is quoted from a primary document, with the clause it
 * came from, and the quotations are in the declarations rather than in this
 * header so that the sheet can letter them in place. Four documents stand
 * behind this module:
 *
 *   TM59:2026  CIBSE, *Overheating risk in dwellings: a design stage
 *              methodology* — the four criteria, the assessment period, the
 *              rounding rule and the seeding of the running mean.
 *   WFR:2026   CIBSE, *Overheating risk in dwellings: weather file
 *              requirements* — what file a compliance run is required to use.
 *   CL:2026    CIBSE, *Overheating risk in dwellings: overheating compliance
 *              checklist* — the two occupied-hour totals this module asserts
 *              its own period against.
 *   TM52:2013  CIBSE, *The limits of thermal comfort* — equations 2.2 and 2.3,
 *              the category offsets, and the partial-period provision TM59
 *              neither restates nor contradicts.
 *
 * None of those documents is in this repository and none may be added. They
 * are quoted here the way the register already quotes Passivhaus and LETI.
 *
 * **This module reads. It does not judge.** TM59 is a compliance procedure
 * assessed room by room against the worst room, with a modelling strategy, a
 * prescribed occupancy, a mandated weather file and a stage sequence; a
 * one-zone shoebox on a typical-year file can compute the arithmetic of some
 * of its criteria and can say nothing whatever about compliance. That is what
 * `QUALIFICATIONS` is for, and it is the deliverable rather than a disclaimer:
 * the reasons are declared as instances so each one can be checked against the
 * desk in front of the reader.
 */

import { environmentRuns, exactly, hourly } from './readings.js';
// The calendar is declared once, on the Run channel's own controls, and every
// reader of a run letters its timestamps with it — which is why `readings.js`
// re-exports `MONTHS` rather than keeping a second copy. This module needs the
// same two facts (the month names for a column head, the month lengths for a
// day-of-year) and takes them from the same declaration for the same reason: a
// third calendar in `src/` is the drift Principle III exists to prevent, and
// `controls.js` is DOM-free and already loads under Node.
// `AS_DRAWN` comes from the same place for the same reason: whether the
// prescribed profiles reached the run is a question about the `roomType`
// control, and the one string that answers it is declared beside that control
// rather than typed a second time here.
import { AS_DRAWN, DAYS_IN_MONTH, MONTHS } from './controls.js';
// The one import from the applier, and the module contract's import rule is
// bent for it deliberately. The denominator is read out of the ESO by the
// *key* the request carried, which is the name `applyGains` gave the schedule
// — so the name is one fact, and a copy of it here is the second source of
// truth Principle III forbids. It is not a harmless copy either: rename the
// schedule in `model.js` and the request's key follows it, this reader finds
// nothing, and every criterion goes absent saying "patch Gains in" on a desk
// whose Gains channel is in. A visible failure with a misleading reason is
// worse than a loud one. Nothing else is taken from `model.js` and nothing
// there imports this, so the direction of the dependency stays one way.
import { OCCUPANCY_SCHEDULE } from './model.js';

/* ══ the calendar this method is written on ══════════════════════════════ */

/**
 * Day of the year, on the non-leap year an EnergyPlus weather file carries.
 *
 * The whole of TM59's arithmetic is dated — 23 April, 30 April, 1 May,
 * 30 September, 1 October — and a weather file is 365 days with no year
 * attached, so a day number is the only index that lets the running mean, the
 * assessment period and the run's own timestamps be spoken about together.
 * `RunPeriod.begin_year` is deliberately never set on this desk (a leap year
 * silently runs 365 days against a 365-day file and shifts every date after
 * February), so there is no leap case to handle and adding one would be
 * handling a state the model cannot reach.
 */
export function dayNumber({ month, day }) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`dayNumber: month ${month} is not a month of the year`);
  }
  if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    throw new Error(`dayNumber: ${day} is not a day of ${MONTHS[month - 1]}, which has ${DAYS_IN_MONTH[month - 1]}`);
  }
  let n = day;
  for (let m = 0; m < month - 1; m += 1) n += DAYS_IN_MONTH[m];
  return n;
}

/** The same date the other way round, for a sentence that has to name a day. */
export function dateOfDay(n) {
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    throw new Error(`dateOfDay: ${n} is not a day of a 365 day year`);
  }
  let left = n;
  for (let m = 0; m < 12; m += 1) {
    if (left <= DAYS_IN_MONTH[m]) return { month: m + 1, day: left };
    left -= DAYS_IN_MONTH[m];
  }
  throw new Error(`dateOfDay: ${n} fell off the end of the year`);
}

/** A day number as the sheet letters every other date: `23 Apr`. */
export const dayText = (n) => {
  const { month, day } = dateOfDay(n);
  return `${day} ${MONTHS[month - 1]}`;
};

/* ══ the two categories ══════════════════════════════════════════════════ */

/**
 * The dwelling's thermal expectation, and the offset its comfort line carries.
 *
 * TM59:2026 §2.4.1 does not print the adaptive formula at all. It prints two
 * clamps and a slope condition — thresholds rise linearly with Trm between
 * Trm = 10 °C and Trm = 30 °C, are 24.1 °C (Cat I) and 25.1 °C (Cat II) below
 * the first, and 30.7 °C and 31.7 °C above the second — and those four numbers
 * pin the line exactly. The BS EN 16798-1 form `Tmax = 0.33·Trm + 18.8 + K`
 * reproduces all four at K = 2 and K = 3, which is the derivation the module
 * asserts at load rather than taking on trust from a secondary source.
 *
 * TM52:2013 confirms the same two offsets from the other direction, which is
 * worth having because the derivations are independent: §6.1.2 gives
 * `Tcomf = 0.33 Trm + 18.8` (equation 6) and the Category II maximum as
 * `Tmax = 0.33 Trm + 21.8` (equation 8), which is equation 6 plus 3, then sets
 * Category I "at 1 K less than the above recommendation". So K = 2 and K = 3
 * are published figures and the clamp arithmetic is a check on the
 * transcription rather than the source of it.
 *
 * **Category III is not offered.** TM52 assigns it to existing buildings and
 * TM59 names only I and II. A third line on the scoreboard would be this sheet
 * adding a category the method does not use.
 *
 * There is no control selecting one. Both are read on every run and each says
 * what it presumes, because which category applies is a fact about who lives
 * in the building and this desk has no way to know it.
 */
export class Category {
  constructor({ id, label, noun, k, low, high, nightLimit, presumes }) {
    this.id = id;
    this.label = label;
    this.noun = noun;
    this.k = k;
    this.low = low;
    this.high = high;
    this.nightLimit = nightLimit;
    this.presumes = presumes;
    Object.freeze(this);
  }

  /**
   * The adaptive maximum at a running mean, unclamped.
   *
   * Computed from the line rather than special-cased at the endpoints: the
   * module-load invariant below is precisely the guarantee that this
   * expression reproduces the two published clamp values to within 1e-9, so
   * returning the published number at Trm = 10 would be belt and braces over
   * an assertion that has already been made. `comfortLine` bounds Trm before
   * it calls this, which is where the clamping actually happens.
   */
  tmax(trm) {
    return SLOPE * trm + NEUTRAL + this.k;
  }
}

/** `Tcomf = 0.33 Trm + 18.8` — TM52:2013 §6.1.2, equation 6. */
const SLOPE = 0.33;
const NEUTRAL = 18.8;

/** The running means the published thresholds stop moving at (TM59:2026 §2.4.1). */
export const TRM_LOW = 10;
export const TRM_HIGH = 30;

export const CATEGORIES = Object.freeze([
  new Category({
    id: 'I',
    label: 'Category I',
    noun: 'a thermally sensitive dwelling',
    k: 2,
    low: 24.1,
    high: 30.7,
    nightLimit: 26,
    presumes:
      'Dwellings for thermally sensitive and fragile people, including care homes and sheltered ' +
      'accommodation. TM52 Table 2 puts the same category more narrowly still: "only used for spaces ' +
      'occupied by very sensitive and fragile persons".',
  }),
  new Category({
    id: 'II',
    label: 'Category II',
    noun: 'a dwelling of normal thermal expectation',
    k: 3,
    low: 25.1,
    high: 31.7,
    nightLimit: 27,
    presumes:
      'All other dwellings. TM52 Table 2 calls it the "normal expectation (for new buildings and ' +
      'renovations)", which is the category a new-build assessment is read against.',
  }),
]);

/**
 * The transcription check, and the reason `low` and `high` are fields at all.
 *
 * A mistyped K is the one error in this module that would produce a plausible
 * number on every row of the scoreboard and never look wrong: a line 1 K out
 * shifts an exceedance share by a few per cent and nothing on the sheet would
 * contradict it. So the published clamps are carried beside the offset and the
 * arithmetic between them is asserted here, at load, where a wrong figure
 * cannot ship.
 */
for (const category of CATEGORIES) {
  const low = SLOPE * TRM_LOW + NEUTRAL + category.k;
  const high = SLOPE * TRM_HIGH + NEUTRAL + category.k;
  if (Math.abs(low - category.low) > 1e-9) {
    throw new Error(
      `${category.label}: 0.33·${TRM_LOW} + 18.8 + ${category.k} is ${low}, and TM59:2026 §2.4.1 publishes ` +
        `${category.low} °C as the threshold below Trm = ${TRM_LOW} °C`,
    );
  }
  if (Math.abs(high - category.high) > 1e-9) {
    throw new Error(
      `${category.label}: 0.33·${TRM_HIGH} + 18.8 + ${category.k} is ${high}, and TM59:2026 §2.4.1 publishes ` +
        `${category.high} °C as the threshold above Trm = ${TRM_HIGH} °C`,
    );
  }
}

/** A category by TM59's own letter, for a reading that carries one. */
export const CATEGORY_BY_ID = Object.freeze(Object.fromEntries(CATEGORIES.map((c) => [c.id, c])));

/* ══ the one assessment period ═══════════════════════════════════════════ */

/**
 * 1 May to 30 September inclusive, for every criterion.
 *
 * This is the single largest correction the 2026 edition makes to the 2017
 * one, and it is worth stating rather than assuming: 2017's bedroom criterion
 * and 2017's mechanical criterion were both annual, and neither is any more.
 * All four criteria of TM59:2026 §2.4 share one period, which is why this is a
 * single frozen instance rather than a class with several.
 *
 * `tail` is the one date outside the period that the method still needs.
 * Criterion b attributes a night to the date it opens on, and TM59:2026 §2.4.2
 * spells the last one out: "the mean bedroom temperature for 30th September is
 * based on the temperatures between 11 pm on 30th September and 8 am on 1st
 * October". So a run that stops at midnight on 30 September is one night short
 * of the period, and `Coverage.tail` reports it rather than quietly counting a
 * partial night as a whole one.
 *
 * `seedFrom` and `seedTo` are the running mean's lead-in, which is outside the
 * period by design and outside any summer run this desk can produce.
 */
export class Season {
  constructor({ from, to, days, tail, seedFrom, seedTo, livingHours, bedroomHours, livingLimit, bedroomLimit }) {
    this.from = Object.freeze(from);
    this.to = Object.freeze(to);
    this.days = days;
    this.tail = Object.freeze(tail);
    this.seedFrom = Object.freeze(seedFrom);
    this.seedTo = Object.freeze(seedTo);
    this.livingHours = livingHours;
    this.bedroomHours = bedroomHours;
    this.livingLimit = livingLimit;
    this.bedroomLimit = bedroomLimit;
    Object.freeze(this);
  }

  /** Whether a run's timestamp falls inside the period at all. */
  holds({ month, day }) {
    const n = dayNumber({ month, day });
    return n >= dayNumber(this.from) && n <= dayNumber(this.to);
  }
}

export const SEASON = new Season({
  from: { month: 5, day: 1 },
  to: { month: 9, day: 30 },
  days: 153,
  tail: { month: 10, day: 1 },
  seedFrom: { month: 4, day: 23 },
  seedTo: { month: 4, day: 29 },
  // CL:2026 §2: "Summer occupied hours should total 3672 for bedrooms and 1989
  // for living rooms, kitchens and studies." Both are carried here because a
  // published figure a tool can check itself against is rare and valuable, and
  // because 3672 is the number a wrong occupied-hour test lands on by accident
  // — see `occupied` below, where that trap is written out.
  livingHours: 1989,
  bedroomHours: 3672,
  // TM59:2026 Table 2 turns the same two totals into hour limits, and the
  // arithmetic says something an implementation has to know: 3 % of 1989 is
  // 59.67 and is published as 59 hours, 3 % of 3672 is 110.16 and is published
  // as 110. The limits are **truncated, not rounded**, so a share tested
  // against 3 % and a count tested against 59 are not the same test at 59.5
  // hours. This sheet letters the share, because 3 % is the criterion's own
  // wording; the counts are carried so a harness can prove the denominator.
  livingLimit: 59,
  bedroomLimit: 110,
});

/**
 * Four checks on one period, every one of which would otherwise fail as a
 * plausible share rather than as an error.
 *
 * The first catches a period that has drifted from its own day count — an
 * edited `to` date with `days` left where it was would divide a real numerator
 * by the wrong denominator and letter the result to two decimal places. The
 * second and third are CL:2026's published totals, and they are the only
 * external check this module has on its own calendar: 31 + 30 + 31 + 31 + 30
 * is 153 days, 153 × 13 occupied hours for a living room and 153 × 24 for a
 * bedroom. The fourth holds the tail against the period it is the tail of,
 * since criterion b's last night is defined by the end of the period and
 * moving one without the other would drop or double a night.
 */
{
  const counted = dayNumber(SEASON.to) - dayNumber(SEASON.from) + 1;
  if (counted !== SEASON.days) {
    throw new Error(
      `SEASON: ${dayText(dayNumber(SEASON.from))} to ${dayText(dayNumber(SEASON.to))} is ${counted} days, ` +
        `and the period declares ${SEASON.days}`,
    );
  }
  if (SEASON.days * 13 !== SEASON.livingHours) {
    throw new Error(
      `SEASON: ${SEASON.days} days of 09:00–22:00 is ${SEASON.days * 13} hours, and CL:2026 §2 publishes ` +
        `${SEASON.livingHours} for living rooms, kitchens and studies`,
    );
  }
  if (SEASON.days * 24 !== SEASON.bedroomHours) {
    throw new Error(
      `SEASON: ${SEASON.days} days of 24 hours is ${SEASON.days * 24} hours, and CL:2026 §2 publishes ` +
        `${SEASON.bedroomHours} for bedrooms`,
    );
  }
  if (dayNumber(SEASON.tail) !== dayNumber(SEASON.to) + 1) {
    throw new Error(
      `SEASON: criterion b's last night ends on the morning after ${dayText(dayNumber(SEASON.to))}, ` +
        `and the tail is declared as ${dayText(dayNumber(SEASON.tail))}`,
    );
  }
}

/* ══ the four criteria ═══════════════════════════════════════════════════ */

/**
 * A published question, its limit, and the clause it is quoted from.
 *
 * `asks` is verbatim. That is not decoration: the sheet's whole claim is that
 * a figure means something, and a criterion paraphrased into the units a
 * slider happens to carry is a figure nobody can argue with. `applies` is the
 * other half of the same rule — which spaces and which ventilation route a
 * criterion is written for, in TM59's own terms, because this desk cannot
 * establish which route governs and printing all of them without saying what
 * each is for would leave the reader to guess.
 *
 * `judgeable` is false exactly once, for criterion d, and the pairing with
 * `unreadable` is the same rule `Side` already enforces on a plan key: a
 * predicate with no reason throws, because one row-wide note cannot say which
 * line is inert.
 */
export class Criterion {
  constructor({
    id, label, applies, asks, clause, limit, unit, threshold, thresholdFrom,
    byCategory, stage1, judgeable = true, unreadable = null,
  }) {
    this.id = id;
    this.label = label;
    this.applies = applies;
    this.asks = asks;
    this.clause = clause;
    this.limit = limit;
    this.unit = unit;
    this.threshold = threshold;
    this.thresholdFrom = thresholdFrom;
    this.byCategory = byCategory;
    this.stage1 = stage1;
    this.judgeable = judgeable;
    this.unreadable = unreadable;
    Object.freeze(this);
  }
}

export const CRITERIA = Object.freeze([
  new Criterion({
    id: 'a',
    label: 'Criterion a',
    applies:
      'Living rooms, kitchens, home offices and bedrooms, in spaces that are predominantly naturally ' +
      'ventilated during occupied hours from May to September.',
    asks:
      'the number of occupied hours for which ∆T is greater than or equal to one degree (K) between ' +
      '1st May and 30th September inclusive shall not be more than 3% of the occupied hours during ' +
      'this period.',
    clause: 'TM59:2026 §2.4.1',
    limit: 3,
    unit: '% of occupied hours',
    threshold: null,
    thresholdFrom:
      'The adaptive line, Tmax = 0.33·Trm + 18.8 + K, recomputed for every day of the period from the ' +
      'outdoor running mean. ∆T is operative temperature less that line, rounded to the nearest whole ' +
      'degree before it is tested.',
    byCategory: true,
    stage1: true,
  }),
  new Criterion({
    id: 'b',
    label: 'Criterion b',
    applies:
      'Bedrooms, naturally ventilated and mechanically ventilated alike, in addition to criterion a or ' +
      'criterion c. No ceiling-fan uplift is permitted against it.',
    asks:
      'the number of nights for which the mean operative temperature during hours of sleep exceeds Tn, ' +
      'between 1st May and 30th September inclusive shall not be more than four nights during this period.',
    clause: 'TM59:2026 §2.4.2',
    limit: 4,
    unit: 'nights',
    threshold: null,
    thresholdFrom:
      'Tn, fixed rather than adaptive: 26 °C for Category I and 27 °C for Category II. The reading is the ' +
      'mean operative temperature over the nine hours of sleep, 23:00 to 08:00, and the night is ' +
      'attributed to the date it opens on.',
    byCategory: true,
    stage1: true,
  }),
  new Criterion({
    id: 'c',
    label: 'Criterion c',
    applies:
      'Spaces that are predominantly mechanically ventilated, where natural ventilation openings are ' +
      'constrained and mechanical ventilation and/or cooling is installed.',
    asks:
      'the room operative temperature shall not exceed 26 °C between 1st May and 30th September inclusive ' +
      'for more than 3% of occupied hours during this period.',
    clause: 'TM59:2026 §2.4.3',
    limit: 3,
    unit: '% of occupied hours',
    threshold: 26,
    thresholdFrom: 'A fixed 26 °C, the same for both categories.',
    byCategory: false,
    stage1: false,
  }),
  new Criterion({
    id: 'd',
    label: 'Criterion d',
    applies:
      'Communal circulation outside the dwelling: corridors, stairwells, lift lobbies and entrance ' +
      'lobbies. New as an integral criterion in 2026; the 2017 edition carried it as a flag with no ' +
      'mandatory target.',
    asks:
      'the operative temperature shall not exceed 28 °C between 1st May and 30th September for more than ' +
      '3% of occupied hours during this period.',
    clause: 'TM59:2026 §2.4.4',
    limit: 3,
    unit: '% of occupied hours',
    threshold: 28,
    thresholdFrom: 'A fixed 28 °C, the same for both categories.',
    byCategory: false,
    stage1: false,
    judgeable: false,
    unreadable:
      'This model is one zone and one dwelling. There is no communal corridor, stairwell or lobby in it, ' +
      'so there is no space for the criterion to be read over and no length of run that would create one. ' +
      'It is named on the unjudged list rather than reported as an absence, because a reader that always ' +
      'returned an absence would be a reading pretending to be one.',
  }),
]);

export const CRITERION_BY_ID = Object.freeze(Object.fromEntries(CRITERIA.map((c) => [c.id, c])));

/**
 * Two invariants on the criteria, in opposite directions.
 *
 * The Stage 1 pair is the membership of the cleared count, settled against
 * TM59:2026 §2.3 and Appendix B: Stage 1 is the assessment every dwelling must
 * pass with no site-specific constraints modelled, and inside a dwelling it is
 * criteria a and b. A count taken over three criteria, or over one, would be a
 * different statement under the same words, so the pair is asserted rather
 * than assumed by whatever happens to carry the flag.
 *
 * The second is the `Side.needs` rule: a criterion declared unjudgeable
 * without a sentence saying why leaves the unjudged list with a blank in it,
 * and a blank on that list is the one thing this feature exists not to print.
 * The converse throws too — a reason attached to a criterion that is read is a
 * contradiction the interface would have to resolve at draw time.
 */
{
  const stage1 = CRITERIA.filter((c) => c.stage1);
  if (stage1.length !== 2) {
    throw new Error(
      `CRITERIA: TM59:2026 §2.3 makes Stage 1 the pair of criteria a and b, and ${stage1.length} ` +
        `criteria carry stage1 (${stage1.map((c) => c.id).join(', ') || 'none'})`,
    );
  }
  for (const criterion of CRITERIA) {
    if (!criterion.judgeable && !criterion.unreadable) {
      throw new Error(`${criterion.label}: cannot be judged and carries no sentence saying why`);
    }
    if (criterion.judgeable && criterion.unreadable) {
      throw new Error(
        `${criterion.label}: carries a sentence saying why it cannot be read, and is declared judgeable`,
      );
    }
  }
}

/* ══ what a criterion returns ════════════════════════════════════════════ */

/**
 * How much of 1 May to 30 September a run reached.
 *
 * Read off the run's own timestamps and never off `params`, by Principle III:
 * a study sample carries an overlay, a stale solve carries yesterday's desk,
 * and in both cases the document is what was simulated while `params` is what
 * the reader is looking at. Coverage is lettered beside every criterion at
 * equal prominence, because a 2 % exceedance over eleven days of August and a
 * 2 % exceedance over the whole summer are not the same reading and nothing
 * about the figure itself says which one it is.
 */
export class Coverage {
  constructor({ days, months, tail }) {
    this.days = days;
    this.of = SEASON.days;
    this.months = months;
    this.whole = days === SEASON.days;
    this.tail = tail;
    Object.freeze(this);
  }
}

/**
 * What one criterion returned over one run, or why it did not.
 *
 * The constructor is the point of the class. `value === null` and
 * `absence !== null` are one state and they must never disagree, so a
 * `Reading` carrying both, or neither, throws where it is built rather than
 * rendering as a blank cell three modules later. This is the em dash rule made
 * structural instead of remembered: a reading with no data behind it renders
 * as an em dash and stays out of every total, and the only way to be sure of
 * that everywhere is to make the other shapes unconstructable.
 *
 * `counted` and `over` are carried beside the value rather than derived back
 * out of it, because a share is an argument and the two numbers that made it
 * are the argument's premises — 3 % of 1989 hours and 3 % of 210 hours are the
 * same figure about different amounts of evidence.
 */
export class Reading {
  constructor({
    criterion, category = null, value = null, counted = 0, over = 0,
    coverage, absence = null, line = null,
  }) {
    if (value !== null && absence !== null) {
      throw new Error(
        `${criterion.label}: a reading carries a value (${value}) and a reason for having none ` +
          `("${absence}"); one of them is a lie`,
      );
    }
    if (value === null && absence === null) {
      throw new Error(
        `${criterion.label}: a reading carries neither a value nor a reason for having none, and would ` +
          'render as a blank rather than as an em dash with its fix beside it',
      );
    }
    this.criterion = criterion;
    this.category = category;
    this.value = value;
    this.counted = counted;
    this.over = over;
    this.coverage = coverage;
    this.absence = absence;
    this.line = line ? Object.freeze({ ...line }) : null;
    Object.freeze(this);
  }

  /** Whether the reading met its criterion's limit. Null where there is none. */
  get cleared() {
    return this.value === null ? null : this.value <= this.criterion.limit;
  }
}

/**
 * A count, never a conclusion.
 *
 * `Verdict` is a poor name for something that refuses to give one, and it is
 * called *Count* everywhere the reader can see it for exactly that reason. It
 * carries no boolean and no word: FR-017 forbids any pass or fail word
 * attaching to TM59's name, because the compound judgement the method makes is
 * a statement about a dwelling assessed room by room and this desk has one
 * room, which no weather file fixes.
 *
 * `unread` is named separately and folded into neither number. A criterion the
 * run could not answer is not a criterion that failed and it is not one that
 * passed, and averaging it into either is how a scoreboard starts lying.
 */
export class Verdict {
  constructor({ cleared, read, unread, scope }) {
    this.cleared = cleared;
    this.read = read;
    this.unread = Object.freeze([...unread]);
    this.scope = scope;
    Object.freeze(this);
  }
}

/* ══ why this is not an assessment ═══════════════════════════════════════ */

/**
 * One reason a reading here is not a TM59 assessment.
 *
 * A list of instances rather than a paragraph, so that each one can be checked
 * against the desk in front of the reader: `says` is the gap in one sentence,
 * `because` is what it is measured or read from. A paragraph would be read as
 * a disclaimer and skipped; four checkable statements are an argument.
 *
 * `standing` separates the qualifications that are always true of this desk —
 * one zone, no communal area, a method this page cannot execute — from the
 * ones that depend on what was run and are therefore tested per solve, which
 * is what `qualificationsFor` adds to the list below.
 */
export class Qualification {
  constructor({ id, says, because, standing }) {
    this.id = id;
    this.says = says;
    this.because = because;
    this.standing = standing;
    Object.freeze(this);
  }
}

/**
 * The qualifications that are true of every run this page can produce.
 *
 * The run-dependent ones — which weather file was attached and what it
 * declares about itself, whether the prescribed profiles were applied, whether
 * a cooling system was in the path, the unshifted local time — are not here
 * because they are not true of every desk. They are assembled per solve and
 * appended to these.
 */
export const QUALIFICATIONS = Object.freeze([
  new Qualification({
    id: 'one-zone',
    says:
      'TM59 is assessed room by room and the dwelling is governed by its worst room. This model is one ' +
      'zone, so there is no worst room to find.',
    because:
      'The document carries a single Zone, and every criterion above is read from that one zone’s ' +
      'operative temperature. A real assessment would model each habitable room separately, including ' +
      'the ones this shoebox averages away, and report the worst of them.',
    standing: true,
  }),
  new Qualification({
    id: 'weather-file',
    says:
      'The weather is whatever file the reader attached, and TM59 mandates a particular one. Both are ' +
      'printed; whether they are the same file is not something this page can check.',
    because:
      'WFR:2026 §3 asks for "the latest version of the DSY1 file appropriate to the site location for ' +
      'the 2050s, RCP8.5, 50th percentile scenario", labelled ' +
      'Zone Reference_DSY1_2050s_HIGH50_CIBSE_v1.1, and CIBSE has moved from station locations to a ' +
      '28-zone UK climate system. The station picker on this page fetches TMYx typical years from ' +
      'climate.onebuilding.org. Four things separate those two descriptions — a typical year against a ' +
      'design summer year, present day against the 2050s, a station against a climate zone, an open ' +
      'file against a licensed one — and each is checkable by the reader against the file in hand. ' +
      'Nothing here asserts that the attached file does or does not match: this page cannot read a ' +
      'file’s provenance, and a claim it cannot check is exactly the claim it must not make. The ' +
      'sentence stays true the day a reader attaches a licensed DSY of their own, which is the test ' +
      'every weather statement in this feature is written to pass.',
    standing: true,
  }),
  new Qualification({
    id: 'procedure',
    says:
      'TM59 is a compliance procedure, not a performance line. What is lettered here is the arithmetic ' +
      'of some of its criteria, which is a smaller thing.',
    because:
      'The method carries a modelling strategy, a prescribed occupancy and gains, a mandated weather ' +
      'file, a staged sequence in which site constraints are added and re-tested, and a reporting ' +
      'format. This page runs one model of one zone and computes the criteria that model can answer. ' +
      'No count on this sheet is TM59’s own verdict and none may be read as one.',
    standing: true,
  }),
  new Qualification({
    id: 'as-drawn',
    says:
      'The criteria are read over the building as it is drawn, with the occupancy and gains the desk ' +
      'holds — which are the method’s only where the prescribed setup has been applied.',
    because:
      'Occupied hours come from the occupancy schedule in the document that was simulated, and the ' +
      'desk’s own default is a weekday band rather than a home. Measured on the stock desk over a ' +
      'Chicago TMY3 year, it counts 1100 occupied hours across the period where TM59’s living room ' +
      'counts 1989 and its bedroom 3672. That gap is not a rounding difference, it is a different ' +
      'building being asked the question.',
    standing: true,
  }),
]);

/**
 * SC-005 asks that a reader who reads only this block can state at least four
 * specific reasons why what they are looking at is not a TM59 assessment. That
 * promise is kept by a list that could be shortened by one careless edit and
 * would still render perfectly, so the count is asserted here rather than
 * hoped for. The standing ones are what a reader gets on every desk; the
 * run-dependent ones are a bonus and do not count towards it.
 */
{
  const standing = QUALIFICATIONS.filter((q) => q.standing);
  if (standing.length < 4) {
    throw new Error(
      `QUALIFICATIONS: SC-005 promises a reader four specific reasons from what is printed, and ` +
        `${standing.length} standing qualifications are declared`,
    );
  }
  for (const q of QUALIFICATIONS) {
    if (!q.says || !q.because) {
      throw new Error(`QUALIFICATIONS: "${q.id}" carries no ${q.says ? 'because' : 'says'}`);
    }
  }
}

/* ══ the running mean ════════════════════════════════════════════════════ */

/**
 * TM52:2013 Box 2, equation 2.3: the seven-day approximation BS EN 15251 gives
 * for starting a run of Trm off, at a = 0.8.
 *
 *     Trm = (Tod−1 + 0.8 Tod−2 + 0.6 Tod−3 + 0.5 Tod−4
 *            + 0.4 Tod−5 + 0.3 Tod−6 + 0.2 Tod−7) / 3.8
 *
 * **3.8 is the sum of the weights**, which is the trap in this equation: it is
 * a weighted *mean*, and an implementation that drops the denominator produces
 * a number that is still plausible in shape — a temperature-looking quantity
 * that rises and falls with the weather — and is wrong by nearly four times.
 * Nothing downstream would catch it, so the sum is asserted at load.
 */
const SEED_WEIGHTS = Object.freeze([1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2]);
const SEED_DIVISOR = 3.8;

/**
 * TM52:2013 Box 2: "The value of Trm calculated using equation 2.1 correlates
 * best with Tc when a = 0.8." Equation 2.2 is then
 * `Trm = (1 − a) Tod−1 + a Trm−1`, which at a = 0.8 is
 * `Trm = 0.2·Tod−1 + 0.8·Trm−1`.
 */
const ALPHA = 0.8;

{
  const sum = SEED_WEIGHTS.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - SEED_DIVISOR) > 1e-9) {
    throw new Error(
      `runningMean: TM52 equation 2.3 divides by the sum of its weights, which is ${sum}, and the ` +
        `divisor is declared as ${SEED_DIVISOR}`,
    );
  }
  // The lead-in and the weights are one statement in two places, and equation
  // 2.3 consumes exactly one weight per day. A seven-weight equation walked
  // over a six-day lead-in reads `undefined` off the end of the array and
  // returns NaN, which at least fails loudly; walked over an eight-day one it
  // silently drops the oldest day and returns a number.
  const leadIn = dayNumber(SEASON.seedTo) - dayNumber(SEASON.seedFrom) + 1;
  if (leadIn !== SEED_WEIGHTS.length) {
    throw new Error(
      `runningMean: TM52 equation 2.3 carries ${SEED_WEIGHTS.length} weights, and the lead-in ` +
        `${dayText(dayNumber(SEASON.seedFrom))} to ${dayText(dayNumber(SEASON.seedTo))} is ${leadIn} days`,
    );
  }
}

/**
 * The daily outdoor running mean over the assessment period, and the lead-in
 * it was seeded from.
 *
 * This is the only quantity on this sheet legitimately read from outside the
 * run, and it is worth saying why that is not a breach of "read it back off
 * the model". TM59:2026 §2.4.1 prescribes the seeding exactly — "the Trm value
 * for 30th April is calculated using the daily mean temperatures of the seven
 * days between 23rd April and 29th April" — and those seven days are outside
 * any summer run this desk can produce and inside no simulation at all for a
 * June-to-August calendar. The quantity reads outdoor dry-bulb temperature and
 * nothing else, which the EPW carries for all 365 days whether or not the
 * engine touched them, so it costs no engine time, no extra environment and no
 * assessed day lost to warm-up.
 *
 * `source` is what the weather file declares itself to be, carried through so
 * the sheet can letter what the line was built from. It is not read here and
 * cannot be: this module never touches the network or a file.
 */
export class RunningMean {
  constructor({ byDay, seed, seedDays, source }) {
    this.byDay = byDay;
    this.seed = seed;
    this.seedDays = Object.freeze([...seedDays]);
    this.source = source;
    Object.freeze(this);
  }

  /** Trm on a day of the year, or null where the recursion does not reach it. */
  at(day) {
    const trm = this.byDay.get(day);
    return trm === undefined ? null : trm;
  }
}

/**
 * Run the recursion, 30 April to 30 September.
 *
 * **Unconditional on what was simulated** (FR-013). Every day of the period is
 * computed whether the engine saw it or not, which is the whole point of
 * seeding from the file rather than from the run: a June-to-August calendar is
 * judged against exactly the line a full year would have produced over those
 * same days, because the comfort line is a property of the climate and does
 * not know which days were handed to the engine. EnergyPlus's own adaptive
 * model was rejected for precisely this — it starts its running mean at the
 * beginning of the run, so a split calendar would silently be judged against a
 * different line, and a quietly substituted value is what Principle IV forbids.
 *
 * **Tod is always the previous day's mean, never the current day's**, and
 * TM52 explains why: "today's daily mean temperature is not used because it
 * remains unknown until the end of the day". So the step to 1 May consumes
 * 30 April's mean. An off-by-one here shifts the entire comfort line by a day
 * for the whole season and is invisible in the shape of the curve, which is
 * why the harness asserts the consumed index rather than eyeballing a plot.
 *
 * @param {number[]} dailyMeans  365 daily mean dry-bulb temperatures, from `epw.js`
 * @param {string|null} source   what the file declares itself to be, for the lettering
 * @returns {RunningMean}
 * @throws  where the file does not carry 23 April to 30 September
 */
export function runningMean(dailyMeans, source = null) {
  if (!Array.isArray(dailyMeans)) {
    throw new Error('runningMean: expected an array of daily mean dry-bulb temperatures');
  }
  const first = dayNumber(SEASON.seedFrom);
  const seedTo = dayNumber(SEASON.seedTo);
  const seedAt = seedTo + 1;
  const last = dayNumber(SEASON.to);
  // Checked over the whole span before anything is computed, so a truncated
  // file is refused whole with the first day it is missing rather than seeded
  // from a guess and carrying the error through the first week of the period —
  // which is inside what is being judged.
  for (let d = first; d <= last; d += 1) {
    if (!Number.isFinite(dailyMeans[d - 1])) {
      throw new Error(
        `runningMean: the weather file carries no daily mean for ${dayText(d)}, and TM59:2026 §2.4.1 ` +
          `seeds the running mean from ${dayText(first)}, so the comfort line cannot be started`,
      );
    }
  }

  const seedDays = [];
  for (let d = first; d <= seedTo; d += 1) seedDays.push(dailyMeans[d - 1]);

  // Equation 2.3, weighted from the most recent day backwards: weight 1 on
  // 29 April, 0.2 on 23 April. Walking the weights rather than the days is
  // what keeps that direction explicit — reversed, the seed still looks like a
  // temperature and is wrong by about the spread of the week.
  let weighted = 0;
  for (let i = 0; i < SEED_WEIGHTS.length; i += 1) weighted += SEED_WEIGHTS[i] * dailyMeans[seedTo - 1 - i];
  const seed = weighted / SEED_DIVISOR;

  const byDay = new Map([[seedAt, seed]]);
  let previous = seed;
  for (let d = seedAt + 1; d <= last; d += 1) {
    // `dailyMeans[d - 2]` is the mean for day `d - 1`: yesterday, by equation
    // 2.2's own definition of Tod−1.
    previous = (1 - ALPHA) * dailyMeans[d - 2] + ALPHA * previous;
    byDay.set(d, previous);
  }

  return new RunningMean({ byDay, seed, seedDays, source });
}

/* ══ the comfort line ════════════════════════════════════════════════════ */

/**
 * One day's adaptive threshold, both categories, clamped.
 *
 * A result, never a setting. `clamped` reports which of the two published
 * clamps is in force so a face can say the line has stopped moving, which
 * matters on this desk more than it would in a UK compliance run: attach a
 * station in a cold May or a hot August and the line spends part of the period
 * flat, and a reader watching an exceedance share respond to nothing would
 * otherwise have no way to see why.
 */
export class ComfortLine {
  constructor({ day, trm, tmax, clamped }) {
    this.day = day;
    this.trm = trm;
    this.tmax = Object.freeze({ ...tmax });
    this.clamped = clamped;
    Object.freeze(this);
  }
}

/**
 * @param {number} trm         the day's outdoor running mean
 * @param {number|null} dayOfYear  the day it belongs to, carried for the lettering
 * @returns {ComfortLine}
 */
export function comfortLine(trm, dayOfYear = null) {
  if (!Number.isFinite(trm)) {
    throw new Error(`comfortLine: ${trm} is not a running mean temperature`);
  }
  if (dayOfYear !== null && (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 365)) {
    throw new Error(`comfortLine: ${dayOfYear} is not a day of a 365 day year`);
  }
  // Strictly outside the two bounds, so the endpoints themselves read as the
  // line rather than as a clamp: at Trm = 10 exactly the formula *is* 24.1,
  // and calling that "clamped" would have the face say the line has stopped
  // moving at the one position where it is about to start.
  const clamped = trm < TRM_LOW ? 'low' : trm > TRM_HIGH ? 'high' : null;
  const bounded = Math.min(Math.max(trm, TRM_LOW), TRM_HIGH);
  const tmax = {};
  for (const category of CATEGORIES) tmax[category.id] = category.tmax(bounded);
  return new ComfortLine({ day: dayOfYear, trm, tmax, clamped });
}

/**
 * ∆T rounded to the nearest whole degree, before it is tested.
 *
 * TM59:2026 §2.4.1 spells the rule out — "for ∆T between 0.5 and 1.49, the
 * value used is 1 K; for 1.5 to 2.49, the value used is 2 K, and so on" — and
 * it is part of the published method rather than a presentation choice: an
 * hour 1.4 K over and an hour 1.6 K over do not weigh the same, and an
 * implementation that skips the rounding produces plausible numbers that are
 * not the method's.
 *
 * **Use TM59's wording and not TM52's.** TM52 §6.1.2 writes the same rule as
 * "for ∆T between 0.5 and 1.5 the value used is 1 K; for 1.5 to 2.5 the value
 * used is 2 K", which puts 1.5 in both bands and settles nothing at exactly
 * the values the criterion is most often decided on. TM59:2026 closes the
 * lower band at 1.49, so 1.5 rounds up. `Math.round` is half-up for positive
 * numbers and is therefore correct; a round-half-to-even helper would return 2
 * for both 1.5 and 2.5 and would be wrong on the first.
 */
export const roundDT = (dt) => Math.round(dt);

/* ══ the shared readers ══════════════════════════════════════════════════ */

/** The one series every criterion is read from (TM59:2026 §2.4, FR-007). */
const OPERATIVE = 'Zone Operative Temperature';

/**
 * The sentences a reading stands under when it has no value.
 *
 * Declared once because the four readers would otherwise each carry their own
 * wording of the same fact, and two surfaces stating one fact from two sources
 * drift. They are written the way the scoreboard's own blockages are written:
 * the thing to do, then why it is the thing to do — "attach a weather file —
 * this is a year's number" — because an absence that does not say what would
 * fix it is a blank with punctuation.
 */
export const ABSENCE = Object.freeze({
  season:
    'run some of May to September — this is a summer number, and the assessment period is 1 May to ' +
    '30 September',
  occupancy:
    'patch Gains in — with nobody home there are no occupied hours to be a share of',
  // Kept apart from `occupancy` because the two are different failures with
  // different fixes, and one sentence covering both would send a reader to the
  // wrong one. A schedule that sums to nothing is a desk with nobody in it; a
  // series that is not in the run at all is a run that was never asked for it,
  // which is what a lean reporting profile produces and what the denominator
  // rule (FR-009) refuses to work around by re-evaluating the schedule here.
  schedule:
    'patch Gains in — this run carries no hourly Occupancy schedule value series, and the denominator is ' +
    'the occupancy the engine actually saw rather than the schedule read back in JavaScript',
  operative:
    'solve the desk itself — this run carries no hourly operative temperature, and zone air temperature ' +
    'is a different question by several degrees on a desk with heavy solar gain and a cold slab',
  weather:
    'attach a weather file — two design days are not a season, whatever their dates',
  // Criterion b alone can have every hour of the period and still have no
  // reading, because its unit is a night rather than an hour: a run ending at
  // midnight on 30 September holds all 153 days and not one complete night in
  // the last of them.
  night:
    'run through to the morning of 1 October — a night is the nine hours from 23:00, and this run holds ' +
    'no complete one opening inside 1 May to 30 September',
});

/**
 * Whether an hour counts as occupied, against the floor the applier wrote.
 *
 * The most expensive thing in this module to get wrong, and it runs clean when
 * it is wrong. `bandSchedule` in `model.js` writes `0.1` out of hours, not
 * zero — the signature is `{ on = 1, off = 0.1 }` and the off value is written
 * for every hour outside the occupied band, for a whole weekend day at
 * `weekend: 'Unoccupied'`, and for a holiday at `holidayUse: 'Closed'` — so
 * the desk's occupancy schedule is never zero anywhere in the year. Measured
 * on the default desk over a Chicago TMY3 year:
 *
 *   scheduleValue > 0     3672 hours, which is every hour of all 153 days
 *   scheduleValue > 0.1   1100 hours, which is 110 weekdays × a 10 hour band
 *
 * 3672 is not a coincidence. It is 153 × 24, and it is also exactly the figure
 * CL:2026 §2 publishes for a **bedroom**, so the naive test produces a
 * plausible number that agrees with a published figure for entirely the wrong
 * reason on a desk that is not a bedroom. That is the worst shape a bug can
 * have on this sheet.
 *
 * So the floor is a property of the schedule that was written and is passed in
 * by the caller rather than assumed here: 0.1 for a `bandSchedule`, 0 for a
 * TM59 pattern, whose own unoccupied hours in Table E.2 are literally zero.
 */
export const occupied = (scheduleValue, floor) => {
  if (!Number.isFinite(floor)) {
    throw new Error(
      'occupied: no unoccupied floor was passed, and the schedule the desk writes sits at 0.1 out of ' +
        'hours rather than at zero, so a missing floor would count every hour of the period as occupied',
    );
  }
  // A non-finite schedule value is refused rather than quietly read as
  // unoccupied. `NaN > 0.1` is already false, so the wrong answer here would
  // be the *silent* one: an hour dropped out of the denominator with nothing
  // anywhere saying a share was taken over fewer hours than the run held.
  if (!Number.isFinite(scheduleValue)) {
    throw new Error(`occupied: the occupancy series carries ${scheduleValue} for an hour, which is not a fraction`);
  }
  return scheduleValue > floor;
};

/**
 * The environments a criterion may be read over: the weather-file ones, never
 * the design days.
 *
 * The same rule `readOverheat` and `computeBill` already follow, and here it
 * is load-bearing in a way it is not for them: a summer design day falls
 * *inside* 1 May to 30 September by date, and the desk ships two design days.
 * A design day exists to be more extreme than any day in the year it precedes,
 * so counting one in would let `sizingPeriods: 'Yes'` worsen a criterion
 * without changing the building — a difference in what was asked of the engine
 * rather than a difference in what was built. The bill learned this the
 * expensive way: an annual run carried an extra 48 hours of the most extreme
 * weather in the file, about 3 % on the heating.
 */
export const weatherRuns = (points, environments) =>
  environmentRuns(points, environments).filter((r) => r.kind === null);

/**
 * The operative temperature series and its environments, or the reason there
 * is none.
 *
 * Returns `{ points, runs, absence }` with the same discipline `Reading` keeps:
 * either the series is there or the sentence is, never both and never neither.
 * **There is no fallback to `Zone Mean Air Temperature`** and there must not
 * be. Operative temperature is the mean of air and radiant, and on a desk with
 * heavy solar gain and a cold slab the two are several degrees apart — a
 * criterion read off air temperature is a different question answered under
 * TM59's name, which is exactly the silent substitution Principle IV forbids.
 */
export function operativeSeries(eso) {
  const points = hourly(eso, exactly(OPERATIVE));
  if (!points.length) return { points: null, runs: null, absence: ABSENCE.operative };
  return { points, runs: weatherRuns(points, eso.environments ?? []), absence: null };
}

/* ══ how much of the period a run reached ════════════════════════════════ */

/** Consecutive months as one span, the way the run strip letters its own. */
function monthsText(present) {
  if (!present.length) return null;
  const groups = [];
  for (const m of present) {
    const last = groups.at(-1);
    if (last && m === last.to + 1) last.to = m;
    else groups.push({ from: m, to: m });
  }
  return groups
    .map((g) => (g.from === g.to ? MONTHS[g.from - 1] : `${MONTHS[g.from - 1]}–${MONTHS[g.to - 1]}`))
    .join(', ');
}

/**
 * How much of 1 May to 30 September this run reached, off its own timestamps.
 *
 * Never off `params` (Principle III): a study sample carries an overlay and a
 * stale solve carries yesterday's desk, and in both cases the two disagree
 * while the document is what was simulated.
 *
 * The timestamps are taken off the operative temperature series rather than
 * off the site's own dry-bulb, for the reason `zoneRuns` gives in
 * `readings.js`: it is the one prelude every criterion here shares, so
 * "which hours the run holds" cannot drift between the coverage lettered
 * beside a reading and the hours the reading was taken over.
 *
 * It throws where that series is absent rather than reporting zero days
 * covered. Zero days is a statement about the run — that it reached no part of
 * the summer — and a run whose operative temperature was never requested may
 * have covered the whole of it. The callers ask `operativeSeries` first and
 * return the absence; this is the failure that has no honest reading.
 */
export function seasonCoverage(eso) {
  const series = operativeSeries(eso);
  if (series.absence) {
    throw new Error(
      `seasonCoverage: the run carries no hourly ${OPERATIVE} series, so which days of the assessment ` +
        'period it reached cannot be read off its own timestamps',
    );
  }
  return coverageOf(series.points, series.runs);
}

/**
 * The same reading over a series a caller already holds, so a criterion that
 * has walked the points once does not walk them again to letter its coverage.
 */
export function coverageOf(points, runs) {
  const from = dayNumber(SEASON.from);
  const to = dayNumber(SEASON.to);
  const tailDay = dayNumber(SEASON.tail);
  const days = new Set();
  const months = new Set();
  let tail = false;
  // One trip through the date arithmetic per *day* rather than per hour, by
  // carrying the previous point's date forward: the timestamps arrive in
  // order and twenty-four of them in a row share a day. Measured over an
  // annual run of 8,760 points, median of 300: `seasonCoverage` went from
  // 1.12 ms to 0.29 ms, of which 0.22 ms is now `environmentRuns` walking the
  // series and only 0.07 ms is this loop. The whole budget for the readers is
  // 1.71 ms, so a coverage that cost most of it on a number that cannot have
  // changed since the hour before was the wrong half to be spending it on.
  let lastMonth = 0;
  let lastDay = 0;
  let n = 0;
  for (const run of runs) {
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month !== lastMonth || t.day !== lastDay) {
        lastMonth = t.month;
        lastDay = t.day;
        n = dayNumber(t);
      }
      // 1 October is outside the period and is still needed: criterion b's
      // last night runs to 08:00 on it, so a run that stops at midnight on
      // 30 September is one night short of what it looks like.
      if (n === tailDay) tail = true;
      if (n < from || n > to) continue;
      days.add(n);
      months.add(t.month);
    }
  }
  return new Coverage({
    days: days.size,
    months: monthsText([...months].sort((a, b) => a - b)),
    tail,
  });
}

/* ══ the criteria ════════════════════════════════════════════════════════ */

/**
 * The two dates every reader indexes by, resolved once.
 *
 * `dayNumber` walks the month lengths, which is nothing beside an 8,760 point
 * loop but is called on every day change inside one, and both are properties
 * of a frozen declaration that cannot move between calls. The tail is not one
 * of them on purpose: criterion b reaches it as `SEASON_LAST + 1`, which is
 * the arithmetic the load-time invariant on `SEASON.tail` already asserts, so
 * a third constant here would be a second way of spelling the same day.
 */
const SEASON_FIRST = dayNumber(SEASON.from);
const SEASON_LAST = dayNumber(SEASON.to);

/**
 * The occupancy series, or the reason there is none.
 *
 * Same shape as `operativeSeries` and the same discipline: the series or the
 * sentence, never both. There is deliberately no second route to this
 * denominator. Evaluating the `Schedule:Compact` in JavaScript would mean
 * reimplementing EnergyPlus's day-type dispatch — the schedule carries
 * `For: Weekdays`, `For: Weekends` and, at `holidayUse: 'Listed'`, a
 * `For: Holidays` branch, and which one an hour takes depends on the calendar
 * the engine picked for the weather file — and a second implementation of
 * somebody else's dispatch fails silently. This is the series the engine
 * itself saw.
 */
export function occupancySeries(eso) {
  // Matched against the ESO's *key* rather than its variable name: the request
  // is `Output:Variable, Occupancy, Schedule Value, Hourly`, so the variable is
  // called `Schedule Value` and the key is the schedule's own name. Anchored,
  // because `findVariables` tests the pattern against both halves and an
  // unanchored `Occupancy` would also match a future `Zone People Occupant
  // Count`. `applyGains` names the people object `Occupants` and the schedule
  // `Occupancy`, so this resolves to exactly one series.
  const points = hourly(eso, exactly(OCCUPANCY_SCHEDULE));
  if (!points.length) return { points: null, absence: ABSENCE.schedule };
  return { points, absence: null };
}

/**
 * Two hourly series of one run, read at the same index.
 *
 * EnergyPlus writes every hourly variable at every hourly timestamp, so the
 * operative temperature and the occupancy fraction for one hour arrive at the
 * same position in their respective series and the readers walk them together
 * rather than building a timestamp index for the second one. That saves about
 * the 0.2 ms `readCriterionB` pays for the index it genuinely needs, and it is
 * safe only while the two are the same length — so the assumption is asserted
 * here rather than trusted. It throws instead of falling back to a keyed lookup:
 * two hourly series of different lengths off one run is a fact about the run
 * this module does not understand, and reading it anyway would be guessing
 * which hours the shorter one is missing.
 */
function alignedWith(points, other, what) {
  if (points.length !== other.length) {
    throw new Error(
      `the run carries ${points.length} hourly operative temperatures and ${other.length} hourly ` +
        `${what} values; two hourly series of one run are written at the same timestamps, so which ` +
        'hours the shorter series is missing cannot be established',
    );
  }
  return other;
}

/**
 * The two documents' positions on a partial assessment period, unresolved.
 *
 * TM52:2013 criterion 1 permits one outright and TM59:2026 neither restates
 * nor contradicts it while publishing hour limits (Table 2: 59 hours for a
 * living room, 110 for a bedroom) that are 3 % of a *full* 153-day period. A
 * tool that silently applied TM52's provision would be answering a question
 * TM59 has not clearly asked, and a tool that refused to read a partial period
 * at all would be refusing a reading TM52 explicitly allows.
 *
 * So the share is taken over the hours available, the coverage is lettered
 * beside it at equal prominence, and both positions are printed. This is the
 * same shape as the weather decision one section down: two facts stated, the
 * judgement withheld, because the judgement is not this sheet's to make.
 */
export const PARTIAL_PERIOD = Object.freeze({
  permits:
    'TM52:2013 criterion 1: "If data are not available for the whole period (or if occupancy is only ' +
    'for a part of the period) then 3 per cent of available hours should be used."',
  written:
    'TM59:2026 restates no such provision, and its Table 2 publishes absolute hour limits — 59 hours ' +
    'for a living room, 110 for a bedroom — which are 3 % of the whole 153-day period.',
});

/**
 * Criterion a: occupied hours whose operative temperature stands at least 1 K
 * above the adaptive line, as a share of the occupied hours available.
 *
 * The fourth argument is not in the module contract's signature and has to be.
 * Rule 2 of that contract requires the occupied-hour floor to be *passed in
 * rather than assumed*, and there is no honest way to satisfy it inside a
 * three-argument signature: the floor is a property of the schedule
 * `applyGains` wrote — 0.1 for a `bandSchedule`, 0 for a TM59 pattern, whose
 * own unoccupied hours in Table E.2 are literally zero — and `model.js`
 * exports `occupiedFloor(params)` to answer it. Defaulting it here would be
 * exactly the silent substitution rule 2 exists to prevent: measured on the
 * default desk over a Chicago TMY3 year, the wrong floor counts 3,672 occupied
 * hours where the answer is 1,100, and 3,672 is also the figure CL:2026
 * publishes for a bedroom, so the wrong denominator agrees with a published
 * number for entirely the wrong reason. It is required, and `occupied` throws
 * naming it when it is missing.
 *
 * @param {object} eso        the parsed ESO the run returned
 * @param {RunningMean | {mean: RunningMean|null, absence: string|null}} trm
 *   the running mean off the weather file, not off the run — or the pair a
 *   caller holding the file already has, which is what lets the absence of a
 *   comfort line be answered in this function's own precedence. See below.
 * @param {Category} category which of the two adaptive lines to read against
 * @param {number} floor      the value the occupancy schedule takes when nobody is there
 * @returns {Reading}
 */
export function readCriterionA(eso, trm, category, floor) {
  const criterion = CRITERION_BY_ID.a;
  if (!(category instanceof Category)) {
    throw new Error('readCriterionA: expected one of the two declared categories');
  }
  // Either the line itself, or the `{ mean, absence }` pair a caller holding a
  // weather file already has. Both, because the absence of a comfort line
  // belongs in this function's own precedence and nowhere else: a caller that
  // had to decide for itself what to letter when the line is missing would be
  // holding the second copy of an ordering that lives here, and the two would
  // drift on the first edit — the sheet telling a reader with Gains patched out
  // to go and fetch a year it would then read nothing over. Handing the pair in
  // is what lets the answer stay in one place.
  //
  // The pair is checked in both of its halves, not merely for having one of
  // them. `mean` present but not a `RunningMean` passes a test that only asks
  // "is either half filled in", and then reaches `adaptive.mean.at(n)` two
  // hundred lines down and inside the day loop, where the failure is a bare
  // `.at is not a function` naming nothing a caller could act on — a silent
  // fallback's twin, refused here for the same reason.
  const adaptive = trm instanceof RunningMean ? { mean: trm, absence: null } : trm;
  const given = adaptive?.mean ?? null;
  if (!adaptive || (given === null ? !adaptive.absence : !(given instanceof RunningMean))) {
    throw new Error(
      'readCriterionA: expected the running mean built from the weather file, or the {mean, absence} ' +
        'pair saying why there is none. The comfort line is a property of the climate rather than of ' +
        'the run, which is what makes a June-to-August calendar judged against the line a full year ' +
        'would have produced',
    );
  }
  const absent = (absence) => new Reading({ criterion, category, absence, coverage: null });

  const series = operativeSeries(eso);
  if (series.absence) return absent(series.absence);
  // Asked before the season, so a desk with Gains patched out is told to patch
  // Gains in rather than sent to fetch a year it would then read nothing over.
  const occupancy = occupancySeries(eso);
  if (occupancy.absence) return absent(occupancy.absence);
  // And the line after both of them, for the same reason in the same order.
  if (!adaptive.mean) return absent(adaptive.absence);
  if (!series.runs.length) return absent(ABSENCE.weather);

  const { points } = series;
  const occ = alignedWith(points, occupancy.points, 'occupancy schedule');
  const coverage = coverageOf(points, series.runs);
  // The one absence a partial period earns. Everything between one day and 153
  // is a reading with its coverage lettered beside it (rule 5); only a run that
  // reached no part of the period at all has nothing to divide.
  if (!coverage.days) return absent(ABSENCE.season);

  let counted = 0;
  let over = 0;
  // The line's own travel over the days the run reached, for the row that says
  // what the reading was judged against (FR-006). Accumulated per day rather
  // than per occupied hour: the line is a property of the day, and weighting it
  // by how many hours of that day someone was in would letter a mean of the
  // occupancy rather than a mean of the climate.
  let low = Infinity;
  let high = -Infinity;
  let sum = 0;
  let lineDays = 0;
  let clampedLow = 0;
  let clampedHigh = 0;

  for (const run of series.runs) {
    // The day cache is reset at every environment boundary, not only when the
    // date changes: two run periods of one year carry different days under the
    // same month and day only by accident, but a design day and a run period
    // can carry the same date outright, and a cache carried across the join
    // would read the second environment's first day against the first's line.
    let lastMonth = 0;
    let lastDay = 0;
    let inSeason = false;
    let tmax = 0;
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month !== lastMonth || t.day !== lastDay) {
        lastMonth = t.month;
        lastDay = t.day;
        const n = dayNumber(t);
        inSeason = n >= SEASON_FIRST && n <= SEASON_LAST;
        if (inSeason) {
          const mean = adaptive.mean.at(n);
          if (mean === null) {
            throw new Error(
              `readCriterionA: the running mean carries no value for ${dayText(n)}, which is inside the ` +
                'assessment period. The recursion runs unconditionally from 30 April to 30 September, so ' +
                'a gap here is a running mean built from a different period rather than a day the engine ' +
                'did not simulate',
            );
          }
          const line = comfortLine(mean, n);
          tmax = line.tmax[category.id];
          if (tmax < low) low = tmax;
          if (tmax > high) high = tmax;
          sum += tmax;
          lineDays += 1;
          if (line.clamped === 'low') clampedLow += 1;
          if (line.clamped === 'high') clampedHigh += 1;
        }
      }
      if (!inSeason) continue;
      if (!occupied(occ[i].value, floor)) continue;
      over += 1;
      // Rounded before it is tested, and half-up: TM59:2026 §2.4.1 closes the
      // lower band at 1.49, so 1.5 K counts as 2 K and is an exceedance. See
      // `roundDT`, where the difference from TM52's wording is written out.
      if (roundDT(points[i].value - tmax) >= 1) counted += 1;
    }
  }

  if (!over) return absent(ABSENCE.occupancy);

  return new Reading({
    criterion,
    category,
    // A percentage, because the criterion's own limit is 3 % and a reading has
    // to be comparable with the limit it is lettered against without a unit
    // conversion happening somewhere between here and the row.
    value: (100 * counted) / over,
    counted,
    over,
    coverage,
    line: {
      low,
      high,
      mean: sum / lineDays,
      days: lineDays,
      clampedLow,
      clampedHigh,
    },
  });
}

/**
 * Criterion b: the count of nights whose *mean* operative temperature over the
 * nine hours of sleep exceeds Tn.
 *
 * Completely different arithmetic from criterion a, and completely different
 * from the 2017 criterion it replaces, which counted hourly exceedances of
 * 26 °C between 22:00 and 07:00 against 1 % of the *annual* hours. The 2026
 * basis is a mean over a night against a count of nights, on new evidence
 * (Lomas and Li, 2023: a literature review with measurements in 591 English
 * homes) that the quantity that matters is nights of disrupted sleep rather
 * than hours above a peak. An implementation that counts hours here produces a
 * number of the right sign that is not the method's.
 *
 * **The night belongs to the date it opens on**, and TM59:2026 §2.4.2 spells
 * both ends of the period out: "The mean bedroom temperature for 1st May is
 * based on the temperatures between 11 pm on 1st May and 8 am on 2nd May, and
 * the mean bedroom temperature for 30th September is based on the temperatures
 * between 11 pm on 30th September and 8 am on 1st October." So the last night
 * of the period runs one day past the end of it, which is the whole reason
 * `SEASON.tail` exists.
 *
 * **There is no occupancy floor and no `floor` argument.** Criterion a and c
 * are shares of occupied hours and take their denominator from the schedule;
 * this one is a count of nights, and hours of sleep are the method's own
 * window rather than the desk's. A bedroom profile in Table E.2 never drops
 * below 0.7 anyway, so filtering by occupancy would change nothing on a
 * prescribed desk and would silently discard nights on a desk carrying the
 * shipped weekday band.
 *
 * @returns {Reading}  `value` is a count of nights, not a share
 */
export function readCriterionB(eso, category) {
  const criterion = CRITERION_BY_ID.b;
  if (!(category instanceof Category)) {
    throw new Error('readCriterionB: expected one of the two declared categories');
  }
  const absent = (absence) => new Reading({ criterion, category, absence, coverage: null });

  const series = operativeSeries(eso);
  if (series.absence) return absent(series.absence);
  if (!series.runs.length) return absent(ABSENCE.weather);

  const { points } = series;
  const coverage = coverageOf(points, series.runs);
  if (!coverage.days) return absent(ABSENCE.season);

  // The hour index this criterion needs and the other two do not: a night
  // reaches across midnight into the following day, so the hours of one
  // reading are not contiguous in a series indexed by position. Measured over
  // 8,760 points under Node, median of 200: criterion a 0.89 ms, criterion b
  // 1.08 ms, criterion c 0.84 ms, so the index is worth about 0.2 ms and the
  // five readings a solve takes — a and b at both categories, and c — come to
  // 4.8 ms. That is dearer than the plan's prototype budgeted (1.71 ms) and
  // still under a third of a 16.7 ms frame, and the readings are taken once at
  // the solve rather than per gesture frame. So sharing one index across the
  // three readers is deliberately not done: an optimisation nobody needs is a
  // second thing to keep correct.
  //
  // One index **per environment**, keyed by day of the year inside it, so a
  // night can only ever be assembled out of hours the *same* environment held.
  // A January and a July handed to the engine as two run periods must not lend
  // each other a morning, and a design day cannot lend one at all —
  // `weatherRuns` has already taken those out. A single index shared across
  // the environments read as though it kept that rule and did not: it is keyed
  // by day of the year alone, so the join between two run periods is invisible
  // to it. Nothing on this desk can reach the difference today, because
  // `applyRun` writes one run period per *unbroken* group of months and two
  // groups are therefore never a day apart — but a guarantee stated in a
  // comment and enforced nowhere is the shape of thing this file exists to
  // turn into structure.
  const byRun = [];
  for (const run of series.runs) {
    const byDay = new Map();
    byRun.push(byDay);
    let lastMonth = 0;
    let lastDay = 0;
    let hours = null;
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month !== lastMonth || t.day !== lastDay) {
        lastMonth = t.month;
        lastDay = t.day;
        const n = dayNumber(t);
        hours = byDay.get(n);
        if (!hours) {
          hours = new Map();
          byDay.set(n, hours);
        }
      }
      // EnergyPlus stamps an hourly record with the hour it *ends*, 1 to 24 —
      // verified against a run's own `.eso`, whose first record of the year is
      // `2,1, 1, 1, 0, 1, 0.00,60.00,Sunday` and whose last of that day is
      // hour 24. So the nine hours of sleep from 23:00 are hour 24 of the
      // opening date and hours 1 to 8 of the morning after. Read as 0 to 23
      // the whole window lands an hour early, which is a plausible reading of
      // a different nine hours.
      hours.set(t.hour, points[i].value);
    }
  }

  let nights = 0;
  let counted = 0;
  for (const byDay of byRun) {
    for (let n = SEASON_FIRST; n <= SEASON_LAST; n += 1) {
      const evening = byDay.get(n);
      const morning = byDay.get(n + 1);
      if (!evening || !morning) continue;
      let sum = evening.get(24);
      if (sum === undefined) continue;
      let complete = true;
      for (let hour = 1; hour <= 8; hour += 1) {
        const value = morning.get(hour);
        if (value === undefined) {
          complete = false;
          break;
        }
        sum += value;
      }
      // A partial night is not a night, and it is counted in neither term. A
      // run stopping at midnight on 30 September holds all 153 days of the
      // period and no ninth hour for its last night; averaging the eight it
      // has would letter a night that ended at 07:00 as one that ended at
      // 08:00, and dropping it from the numerator while keeping it in the
      // denominator would credit the building with a night it was never asked
      // about. `Coverage.tail` is what says on the sheet whether the last one
      // landed.
      if (!complete) continue;
      nights += 1;
      if (sum / 9 > category.nightLimit) counted += 1;
    }
  }

  if (!nights) return absent(ABSENCE.night);

  return new Reading({
    criterion,
    category,
    // Nights, not a share: the criterion's limit is four nights and the row
    // letters a count. `over` is the nights the run actually held rather than
    // 153, which is what a partial period leaves the reading standing on.
    value: counted,
    counted,
    over: nights,
    coverage,
  });
}

/**
 * Criterion c: occupied hours whose operative temperature exceeds 26 °C, as a
 * share of the occupied hours available.
 *
 * **The period changed in 2026.** The 2017 edition read this over *annual*
 * occupied hours; TM59:2026 §2.4.3 reads it over 1 May to 30 September like
 * every other criterion, which is the single largest correction the new
 * edition makes and the one an implementation carried over from the old one
 * would get wrong while producing a number of the right shape.
 *
 * It takes no category: 26 °C is the threshold for both, and it is fixed
 * rather than adaptive, which is why it needs no running mean either.
 *
 * TM52's partial-period provision is deliberately **not** stated against this
 * criterion. That provision is criterion 1's own, TM59 borrows criterion 1 and
 * nothing else from TM52, and extending it to a criterion TM52 never wrote
 * would be this sheet legislating. The reading is still taken over the hours
 * the run covered — there is nothing else to take it over — with the coverage
 * lettered beside it.
 *
 * @param {number} floor  as `readCriterionA`, and required for the same reason
 * @returns {Reading}
 */
export function readCriterionC(eso, floor) {
  const criterion = CRITERION_BY_ID.c;
  const absent = (absence) => new Reading({ criterion, absence, coverage: null });

  const series = operativeSeries(eso);
  if (series.absence) return absent(series.absence);
  const occupancy = occupancySeries(eso);
  if (occupancy.absence) return absent(occupancy.absence);
  if (!series.runs.length) return absent(ABSENCE.weather);

  const { points } = series;
  const occ = alignedWith(points, occupancy.points, 'occupancy schedule');
  const coverage = coverageOf(points, series.runs);
  if (!coverage.days) return absent(ABSENCE.season);

  let counted = 0;
  let over = 0;
  for (const run of series.runs) {
    let lastMonth = 0;
    let lastDay = 0;
    let inSeason = false;
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month !== lastMonth || t.day !== lastDay) {
        lastMonth = t.month;
        lastDay = t.day;
        const n = dayNumber(t);
        inSeason = n >= SEASON_FIRST && n <= SEASON_LAST;
      }
      if (!inSeason) continue;
      if (!occupied(occ[i].value, floor)) continue;
      over += 1;
      // Strictly above, by the criterion's own word: "shall not exceed 26 °C".
      // There is no rounding here and there must not be — the rounding rule is
      // TM59's provision for ∆T against the *adaptive* line in §2.4.1, and
      // importing it into a fixed threshold would move the line to 26.5 °C.
      if (points[i].value > criterion.threshold) counted += 1;
    }
  }

  if (!over) return absent(ABSENCE.occupancy);

  return new Reading({
    criterion,
    value: (100 * counted) / over,
    counted,
    over,
    coverage,
  });
}

/* ══ the count ═══════════════════════════════════════════════════════════ */

/**
 * The pair the count is taken over, and the sentence its row letters.
 *
 * TM59:2026 §2.3 and Appendix B settle the membership. Stage 1 is the
 * assessment every dwelling must pass with no site-specific constraints
 * modelled, and inside a dwelling it is criteria a and b; criteria b and c are
 * the Stage 2 or Stage 3 pair, used where opening constraints keep ventilation
 * devices shut for 50 % or more of occupied hours. Which of a or c governs at
 * Stage 2 therefore turns on a fact about a window model this desk does not
 * have, and guessing it would be the sheet asserting under cover of citing.
 *
 * Category II is the count's category because it is the one TM59 names for
 * "all other dwellings"; Category I is read and lettered beside it and stays
 * outside the count, as criterion c does. Counting all four combinations of
 * route and category was considered and rejected: four counting rows for an
 * optional figure is furniture, and lettering all of them still leaves the
 * reader to pick one.
 */
export const COUNT_CATEGORY = CATEGORY_BY_ID.II;
export const COUNT_SCOPE = 'criteria a and b, the Stage 1 pair, for a Category II dwelling';

/**
 * The scope sentence and the `stage1` flags are one statement in two places,
 * and the sentence is the half a reader sees. Flipping a flag without editing
 * the sentence would letter a count of criteria a and c under a row saying
 * "criteria a and b", which is the shape of error this file exists to make
 * impossible: it reads perfectly and is wrong about which question was asked.
 */
{
  const named = `criteria ${CRITERIA.filter((c) => c.stage1).map((c) => c.id).join(' and ')}`;
  if (!COUNT_SCOPE.includes(named)) {
    throw new Error(`COUNT_SCOPE says "${COUNT_SCOPE}" and the criteria carrying stage1 are ${named}`);
  }
  if (!COUNT_SCOPE.includes(COUNT_CATEGORY.label)) {
    throw new Error(
      `COUNT_SCOPE says "${COUNT_SCOPE}" and the count is taken at ${COUNT_CATEGORY.label}`,
    );
  }
}

/**
 * How many of the Stage 1 pair cleared their limit. Never a verdict.
 *
 * Two numbers and a list, and the list is the point of it: a criterion the run
 * could not answer is not one that failed and is not one that passed, so it is
 * named separately and folded into neither number (FR-017a). Nothing here
 * returns a proportion — "1 of 2" is a count of two things, and "50 %" is a
 * score, which is the word FR-017 forbids attaching to this method.
 *
 * It throws where a criterion in scope is missing from the readings entirely.
 * That is not the same state as a criterion that could not be read: a reader
 * that could not answer still returns a `Reading` carrying its absence, so an
 * absent *object* means the caller never asked, and a count silently taken
 * over one criterion under a row naming two would be exactly the lie this
 * class refuses to tell.
 *
 * @param {Reading[]} readings  every reading the solve produced
 * @returns {Verdict}  { cleared, read, unread, scope }
 */
export function clearedCount(readings) {
  if (!Array.isArray(readings)) throw new Error('clearedCount: expected the run’s readings');
  const scoped = [];
  for (const criterion of CRITERIA.filter((c) => c.stage1)) {
    const found = readings.filter(
      (r) =>
        r.criterion === criterion &&
        (criterion.byCategory ? r.category === COUNT_CATEGORY : r.category === null),
    );
    if (found.length !== 1) {
      throw new Error(
        `clearedCount is taken over ${COUNT_SCOPE}, and the readings carry ${found.length} for ` +
          `${criterion.label}${criterion.byCategory ? ` at ${COUNT_CATEGORY.label}` : ''}`,
      );
    }
    scoped.push(found[0]);
  }
  const read = scoped.filter((r) => r.value !== null);
  return new Verdict({
    cleared: read.filter((r) => r.cleared).length,
    read: read.length,
    unread: scoped.filter((r) => r.value === null),
    scope: COUNT_SCOPE,
  });
}

/* ══ what the file declares, against what the method requires ════════════ */

/**
 * What an attached EPW says about itself, as its own header declares it.
 *
 * The parsing lives in `src/epw.js` for the reason the calendar record's does:
 * that is EPW parsing, its only honest test is a real file, and this module is
 * handed facts rather than text so the Node harness can drive it over
 * documents it builds itself. Every field is the `LOCATION` record's, in the
 * order the record writes them.
 *
 * **Every field must be passed, and `null` is a legitimate value for any of
 * them.** A file that carries no WMO number and a caller that never looked for
 * one are different states, and a constructor accepting a partial object would
 * make them the same one: the sheet would letter "declares nothing" over a
 * field it simply failed to read. So the presence of the key is checked and
 * its value is not.
 */
export class WeatherFile {
  constructor(declared) {
    for (const field of ['city', 'region', 'country', 'source', 'wmo', 'timeZone']) {
      if (!(field in declared)) {
        throw new Error(
          `WeatherFile: no ${field} was passed. The EPW's LOCATION record carries one, and a field the ` +
            'file leaves empty is passed as null — "the file says nothing here" and "nobody read it" ' +
            'must not be the same state',
        );
      }
      this[field] = declared[field];
    }
    Object.freeze(this);
  }

  /**
   * The file in one phrase, in its own words. Nothing is inferred and nothing
   * is tidied: `TMYx.2009-2023` is what the record says, and it is what the
   * reader has to be able to hold against the requirement below.
   */
  get declares() {
    const place = [this.city, this.region, this.country].filter(Boolean).join(', ');
    const marks = [place || null, this.source, this.wmo ? `WMO ${this.wmo}` : null].filter(Boolean);
    return marks.length ? marks.join(' · ') : 'a file whose LOCATION record declares nothing about itself';
  }
}

/**
 * What a compliance run is required to use, quoted.
 *
 * Far more specific than "a design summer year", which is why it is worth
 * carrying verbatim: it names a scenario, a decade, a percentile and a file
 * label, and every one of those is checkable by a reader against the file in
 * their hand.
 */
export const WFR_REQUIREMENT = Object.freeze({
  clause: 'WFR:2026 §3',
  asks:
    'Overheating assessment should be undertaken using the latest version of the DSY1 file appropriate ' +
    'to the site location for the 2050s, RCP8.5, 50th percentile scenario. This file represents the ' +
    'minimum requirement for assessments carried out in accordance with TM59 (2026a).',
  label: 'Zone Reference_DSY1_2050s_HIGH50_CIBSE_v1.1',
  zones:
    'CIBSE has moved from station locations to a 28-zone UK climate system, and DSY1 is defined as a ' +
    'moderate year containing heat events with a return period of seven years.',
});

/**
 * The threshold under which a system transfer rate is not a system doing
 * anything. Half a watt, which is the rail's own floor: `watts()` already
 * letters −0.2 W as `-0 W`, and `flowWord` returns null under the same figure
 * rather than claiming a direction for a quantity too small to have one.
 */
const SYSTEM_NOISE_W = 0.5;

/* ══ why this is not an assessment, for this run ═════════════════════════ */

/**
 * The qualifications that depend on what was run, assembled per solve.
 *
 * They are appended to the standing four rather than replacing them, and they
 * are constructed rather than declared because each carries a figure off the
 * run in its `says`. The fixed halves are declared here so that the prose is
 * in one place and only the numbers are assembled.
 *
 * `params` is the snapshot the run was written from — the same object
 * `describeDesk` takes, captured in the same breath as the IDF — and not live
 * `params`. A slider turned during a 0.7 s annual run would otherwise have
 * this block describing one building over another building's readings, which
 * is the failure `describe.js` already solved this way.
 */
const WHY = Object.freeze({
  declared:
    'The station picker on this page fetches TMYx typical years from climate.onebuilding.org, and the ' +
    'file above is whichever one the reader attached. Four things separate the two descriptions — a ' +
    'typical year against a design summer year, present day against the 2050s, a station against a ' +
    'CIBSE climate zone, an open file against a licensed one — and each is checkable by the reader ' +
    'against the file in hand. Nothing here asserts that this file does or does not match: this page ' +
    'cannot read a file’s provenance, and a claim it cannot check is exactly the claim it must not ' +
    'make. The sentence stays true the day a reader attaches a licensed DSY of their own.',
  profiles:
    'The occupancy, equipment and lighting profiles of TM59:2026 Appendix E are in the document that ' +
    'was simulated, at the counts and levels Tables E.1 and E.2 publish for that space. What is still ' +
    'not the method is everything around them: one zone rather than a room-by-room assessment, and ' +
    'whatever weather file is attached.',
  cooling:
    'Read off the run rather than off the patch bay: Zone Air Heat Balance System Air Transfer Rate is ' +
    'signed positive into the zone, so an hour below −0.5 W is one in which the unit was removing heat. ' +
    'A zone holding its own setpoint reports the setpoint, so a criterion read over it says more about ' +
    'the thermostat than about the envelope — and TM59 sends a mechanically cooled dwelling to ' +
    'criterion c rather than to the adaptive line, which is the more authoritative-looking of the two ' +
    'and therefore the one that will be over-read.',
  localTime:
    'TM59:2026 §3.7.1 states that all profile times are local UK time, "i.e. British Summer Time from ' +
    'April to October approx.", and that "If necessary, modellers should shift the profiles to match ' +
    'the timing convention in other geographical locations." Shifting needs a daylight saving rule to ' +
    'shift by, and every file the picker can reach declares none: measured, ' +
    'HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0 on Denver 725650 and Berlin-Tegel 103820 in the 2009–2023 ' +
    'window, and on all five EPWs shipped with EnergyPlus 26.1. There is no rule in the file to shift ' +
    'by, so a shift would be an invention. The profiles therefore run one hour early against a UK ' +
    'summer, which is a real difference from a compliance run and is said here rather than corrected ' +
    'in silence.',
});

/**
 * Which qualifications are true of this run.
 *
 * The standing four, plus whichever of the run-dependent ones apply. Three of
 * the four are appended only where they have something to say, which is the
 * same rule the description follows: a clause about a mechanism that is not in
 * the path is furniture, and a block that grows a line per run whether or not
 * the line is about anything trains a reader to stop reading it.
 *
 * @param {object} eso     the parsed ESO the run returned
 * @param {object} params  the snapshot the run was written from, not live params
 * @param {object} bypass  the patch state that snapshot was solved under
 * @param {WeatherFile|null} weather  what the attached file declares, or null
 * @returns {Qualification[]}
 */
export function qualificationsFor(eso, params, bypass, weather) {
  if (!eso) throw new Error('qualificationsFor: expected the parsed ESO the run returned');
  if (!params) {
    throw new Error(
      'qualificationsFor: expected the parameter snapshot the run was written from. Live params would ' +
        'have this block describing a desk the reader has moved to since the solve',
    );
  }
  if (!bypass) throw new Error('qualificationsFor: expected the patch state the run was solved under');
  if (weather !== null && !(weather instanceof WeatherFile)) {
    throw new Error(
      'qualificationsFor: expected a WeatherFile carrying what the attached EPW declares about itself, ' +
        'or null where the desk still holds the design days it shipped with',
    );
  }

  const list = QUALIFICATIONS.filter((q) => q.standing);

  // Nothing attached is not a weather qualification, it is the reason every
  // criterion above is absent, and the absences say it in the terms that would
  // fix it. The standing `weather-file` entry already carries the requirement
  // itself, so a desk on its two design days is not told about DSY1 twice.
  if (weather) {
    list.push(
      new Qualification({
        id: 'weather-declared',
        says:
          `This run used ${weather.declares}. ${WFR_REQUIREMENT.clause} requires the DSY1 file for the ` +
          `site for the 2050s, RCP8.5, 50th percentile, labelled ${WFR_REQUIREMENT.label}. Both are ` +
          'printed here; which of them you are looking at is for you to decide.',
        because: `${WFR_REQUIREMENT.asks} ${WFR_REQUIREMENT.zones} ${WHY.declared}`,
        standing: false,
      }),
    );
  }

  // Only where they were applied. The standing `as-drawn` qualification already
  // says what the desk's own weekday band is and what it counts against TM59's
  // published totals, so the case where nothing was applied is covered without
  // a second line saying the same thing from the other side.
  const roomType = params.roomType ?? AS_DRAWN;
  if (roomType !== AS_DRAWN) {
    list.push(
      new Qualification({
        id: 'profiles',
        says:
          `The prescribed occupancy, gains and lighting for a ${roomType} were applied, so the hours ` +
          'this is read over are the method’s own. Everything else about the assessment still is not.',
        because: WHY.profiles,
        standing: false,
      }),
    );
  }

  const cooled = coolingHours(eso);
  if (cooled && cooled.hours) {
    list.push(
      new Qualification({
        id: 'cooling',
        says:
          `A system removed heat from this zone in ${cooled.hours.toLocaleString('en-US')} of the ` +
          `${cooled.assessed.toLocaleString('en-US')} hours inside the assessment period, so what is ` +
          'read above is partly the system’s answer and not the fabric’s.',
        because: WHY.cooling,
        standing: false,
      }),
    );
  }

  list.push(
    new Qualification({
      id: 'local-time',
      says:
        'TM59’s profiles are stated in UK local time, British Summer Time included. They are applied ' +
        'here at the weather file’s own local standard time, unshifted.',
      because: WHY.localTime,
      standing: false,
    }),
  );

  return list;
}

/**
 * How many of the assessed hours a system was cooling in, off the run.
 *
 * Counted over exactly the hours the criteria were read over — the weather-file
 * environments, inside 1 May to 30 September — because the qualification is
 * about those readings and a count over the whole year would letter a February
 * the criteria never saw. Returns null where the run holds no such series (the
 * System channel was out, so its rail term was never requested) or where it
 * reached no assessed hour at all, in which case the readings are absent and
 * their own sentences are the thing to read.
 */
function coolingHours(eso) {
  const points = hourly(eso, exactly('Zone Air Heat Balance System Air Transfer Rate'));
  if (!points.length) return null;
  const runs = weatherRuns(points, eso.environments ?? []);
  if (!runs.length) return null;

  let hours = 0;
  let assessed = 0;
  for (const run of runs) {
    let lastMonth = 0;
    let lastDay = 0;
    let inSeason = false;
    for (let i = run.start; i <= run.end; i += 1) {
      const t = points[i].timestamp;
      if (t.month !== lastMonth || t.day !== lastDay) {
        lastMonth = t.month;
        lastDay = t.day;
        const n = dayNumber(t);
        inSeason = n >= SEASON_FIRST && n <= SEASON_LAST;
      }
      if (!inSeason) continue;
      assessed += 1;
      if (points[i].value < -SYSTEM_NOISE_W) hours += 1;
    }
  }
  return assessed ? { hours, assessed } : null;
}
