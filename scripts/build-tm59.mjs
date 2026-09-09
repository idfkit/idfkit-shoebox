/**
 * Rebuild `src/tm59.data.js` from CIBSE TM59:2026 Appendix E.
 *
 * Not part of `predev` or `prebuild`. It is run by hand, the way
 * `scripts/build-rates.mjs` is, and for the same reason: no figure the sheet
 * letters is ever typed in by a person at the place it is read.
 *
 *     node scripts/build-tm59.mjs
 *
 * It needs the reader-supplied cross-check transcription, at
 * `.tm59-cache/tm59_occupancy_equipment_profile_library.csv` or wherever
 * `TM59_PROFILE_CSV` points, and it stops and says so when that is missing
 * rather than writing a file with an unchecked transcription in it.
 *
 * **Where the numbers come from, and why this file is shaped the way it is.**
 * The bill's generator can fetch its four datasets because they are published
 * open. Appendix E is not: TM59:2026 is a purchased document, the supplied copy
 * is watermarked to a named individual, and it may not enter this repository —
 * the same rule the register already keeps for Passivhaus and LETI, which are
 * quoted and never reproduced. So the primary source cannot be a file this
 * script reads. It is a transcription, and it lives *here*, in the generator,
 * rather than in `src/`: the page then reads one generated declaration, and the
 * hand-copying is confined to an author-time script that checks itself.
 *
 * It checks itself three ways, because a transcription nobody can diff against
 * the original is exactly the kind of number this sheet exists not to print:
 *
 *   1. **Table E.1 against Table E.2.** E.1 states the gains in absolute watts
 *      and people ("Base gain of 85 W for the rest of the day"); E.2 states the
 *      same profile as a fraction of the peak, rounded to two decimals. Both
 *      are transcribed below, the fractions are divided out of E.1, and every
 *      hour of every space must agree with E.2's printed figure once rounded.
 *      Two tables, one arithmetic, and a slip in either transcription shows up
 *      as a named hour rather than as a plausible wrong profile.
 *   2. **Table E.2's peak watts against its own people counts.** Every space's
 *      sensible peak must be its headcount times 75 W and its latent peak that
 *      headcount times 55 W. This is what catches the two-bedroom kitchen,
 *      whose row is *labelled* one person while carrying two people's watts.
 *   3. **The reader-supplied CSV**, an independent transcription of the 2017
 *      edition's same two tables as absolute hourly values. It is a secondary
 *      source and by Principle III it cannot be the one the page reads from,
 *      but it is a second pair of eyes on twelve of the thirteen spaces, and it
 *      caught two of the three findings recorded below. Its absence stops this
 *      script rather than being shrugged off, because a generator that quietly
 *      drops its cross-check is a generator with no cross-check.
 *
 * The fractions are divided out of **E.1's absolute watts**, never lifted from
 * E.2. 85/450 is 0.188889, which E.2 prints as 0.19 and which multiplied back
 * is 85.5 W; the two tables disagree by up to 2 % and E.1 is the primary
 * statement. Every division is lettered into the profile's own `why` so a
 * reader can redo it.
 *
 * Three findings are printed rather than resolved silently, each becoming a
 * `why` line on the profile it belongs to. They are recorded in the feature's
 * `research.md` under Decision 5:
 *
 *   1. E.1 and E.2 disagree by up to 2 %, above.
 *   2. E.1's three-bedroom living/kitchen says "3 people at 75% gains", where
 *      E.2's own row for the same space gives a fraction of 1 and TM59:2017
 *      says "3 people". Two independent statements against one, and 75 % also
 *      breaks the pattern that a combined living/kitchen carries the dwelling's
 *      full occupancy while a separate living room carries 75 % and a separate
 *      kitchen 25 %. 100 % is implemented and the discrepancy is printed.
 *   3. E.2 labels the two-bedroom kitchen "1 person" while giving it 150 W
 *      sensible and 110 W latent, which is two people, against E.1's "2 people
 *      at 25% gains". The label is wrong and the arithmetic is right.
 *
 * What is **not** generated: the communal space. E.1 gives it "Assumed to be
 * zero" occupancy and "Heating system gains only" equipment, quantifying
 * neither, so there is no profile to write and inventing a pipework figure
 * would be the sheet asserting under cover of citing. It is criterion d's
 * space, and criterion d is on the unjudged list where it belongs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const out = new URL('../src/tm59.data.js', import.meta.url).pathname;

/**
 * The independent transcription, wherever the reader put it.
 *
 * Defaulted into a gitignored cache beside the one `build-rates.mjs` uses, and
 * overridable because the file arrives as a download rather than as something
 * this repository can fetch.
 */
const csvPath =
  process.env.TM59_PROFILE_CSV ??
  new URL('../.tm59-cache/tm59_occupancy_equipment_profile_library.csv', import.meta.url).pathname;

/* ── the constants Appendix E states once and applies to every space ─────── */

/** Hours in a day, and the length of every profile in both tables. */
const HOURS = 24;

/**
 * Watts per person, sensible and latent, off Table E.2's peak columns.
 *
 * Every occupancy row in E.2 is its headcount times these two figures — one
 * person 75/55, two people 150/110, three people 225/165 — so they are stated
 * once here and asserted against all thirteen rows below rather than copied
 * thirteen times.
 */
const PERSON_SENSIBLE = 75;
const PERSON_LATENT = 55;

/** Lighting gain, W/m² of usable floor area, from E.2's own lighting row. */
const LIGHTING = 2;

/**
 * Days in the assessment period, and the reason the occupied-hour totals are
 * derived here rather than typed.
 *
 * 1 May to 30 September is 31 + 30 + 31 + 31 + 30 = 153 days, and CL:2026 §2
 * publishes what that must come to: "Summer occupied hours should total 3672
 * for bedrooms and 1989 for living rooms, kitchens and studies." Counting the
 * hours each profile is above zero and multiplying by 153 has to land on one of
 * those two figures, which is a check on the profile rather than a restatement
 * of it — a mistranscribed occupancy band moves the total off both.
 */
const SEASON_DAYS = 153;
const PUBLISHED_HOURS = Object.freeze([1989, 3672]);

/**
 * Decimals the emitted fractions carry.
 *
 * Six, which is finer than any figure either table prints and coarse enough to
 * keep float noise out of the IDF: 2 × 0.7 is 1.4000000000000001 in binary
 * floating point, and divided back out that becomes a schedule value with
 * sixteen digits on it. Deliberately *not* two: rounding to two decimals here
 * would throw away the whole point of dividing out of E.1 and hand back E.2's
 * own 0.19.
 */
const PRECISION = 6;

const round = (v, digits = PRECISION) => {
  const scale = 10 ** digits;
  return Math.round(v * scale) / scale;
};

/* ── the declarations ───────────────────────────────────────────────────── */

/**
 * One clause of Table E.1's occupancy sentence: so many people, at such a
 * fraction of their gains, between two clock hours.
 *
 * The clause's own headcount is kept apart from the space's peak headcount
 * because the double bedroom needs both in one row: "2 people at 70% gains from
 * 11 pm to 8 am ... 1 person at full gains from 9 am to 10 pm" is a space whose
 * `People` object is two people and whose schedule falls to 0.5 through the
 * day. Folded into a single percentage the sentence would read as "50 % gains",
 * which is not what the table says and not what a reader could check.
 */
class Presence {
  constructor({ from, to, people, pct }) {
    this.from = band(from, to, 'Presence');
    this.to = to;
    this.people = people;
    this.pct = pct;
    this.value = people * pct;
    Object.freeze(this);
  }
}

/** One clause of Table E.1's equipment sentence: so many watts, between two clock hours. */
class Load {
  constructor({ from, to, watts }) {
    this.from = band(from, to, 'Load');
    this.to = to;
    this.value = watts;
    Object.freeze(this);
  }
}

/**
 * Both clause kinds share their bounds check, and it throws at module load.
 *
 * A band runs from one clock hour to another and may wrap midnight, which is
 * how E.1 writes the sleeping hours ("from 11 pm to 8 am"). What it may not do
 * is be empty or run off the clock, and a transcription slip of that shape
 * would otherwise expand into a profile that is merely wrong rather than one
 * that stops the build.
 */
function band(from, to, kind) {
  if (!Number.isInteger(from) || from < 0 || from > 23) throw new Error(`${kind}: from ${from} is not a clock hour`);
  if (!Number.isInteger(to) || to < 1 || to > 24) throw new Error(`${kind}: to ${to} is not a clock hour`);
  if (from === to % HOURS) throw new Error(`${kind}: ${from} to ${to} is not a band`);
  return from;
}

/**
 * One space as Table E.1 states it, with the sentences verbatim.
 *
 * The sentences are carried rather than paraphrased because they are what the
 * profile's `why` has to letter: a fraction of 0.188889 means nothing on its
 * own, and "Base gain of 85 W for the rest of the day" divided by a 450 W peak
 * is a division the reader can redo.
 */
class Space {
  constructor({ id, label, people, occupancy, occupancyBase, occupancySays, equipPeak, equipment, equipmentBase, equipmentSays, findings = [] }) {
    this.id = id;
    this.label = label;
    this.people = people;
    this.occupancy = Object.freeze([...occupancy]);
    this.occupancyBase = occupancyBase;
    this.occupancySays = occupancySays;
    this.equipPeak = equipPeak;
    this.equipment = Object.freeze([...equipment]);
    this.equipmentBase = equipmentBase;
    this.equipmentSays = equipmentSays;
    this.findings = Object.freeze([...findings]);
    Object.freeze(this);
  }
}

/**
 * One row of Table E.2, as printed.
 *
 * `label` is verbatim, including the two-bedroom kitchen's wrong person count,
 * because the finding is about the label and quoting it is the whole evidence.
 * `occupied` and `equipment` are the printed fractions, and they exist here to
 * be disagreed with: nothing downstream reads them, they are the check.
 */
class Printed {
  constructor({ label, sensible, latent, occupied, equipment }) {
    this.label = label;
    this.sensible = sensible;
    this.latent = latent;
    this.occupied = Object.freeze(runs(occupied, `${label} occupancy`));
    this.equipment = Object.freeze(runs(equipment, `${label} equipment`));
    Object.freeze(this);
  }
}

/**
 * A printed row expanded from its runs of equal fractions.
 *
 * E.2 is printed as runs — eight hours of 0.7, fifteen of 1, one of 0.7 — and
 * transcribing it that way is both shorter and closer to what the eye reads off
 * the page than twenty-four comma-separated figures would be. The count must
 * come to 24 or the transcription lost a column, which is precisely the slip
 * that would otherwise shift a whole profile by an hour.
 */
function runs(pairs, what) {
  const hours = [];
  for (const [count, value] of pairs) for (let i = 0; i < count; i += 1) hours.push(value);
  if (hours.length !== HOURS) throw new Error(`${what}: ${hours.length} hours transcribed from Table E.2, expected ${HOURS}`);
  return hours;
}

/** A finding recorded against a space: what the source says, and what was done about it. */
class Finding {
  constructor({ says, done }) {
    this.says = says;
    this.done = done;
    Object.freeze(this);
  }
}

/* ── Table E.1, transcribed ─────────────────────────────────────────────── */

/*
 * The equipment sentences repeat verbatim across dwelling sizes — every
 * living/kitchen carries the same 450 W profile, every separate living room the
 * same 150 W one, every kitchen the same 300 W one, and both bedrooms the same
 * 80 W one — so they are declared once and referenced, which is a statement
 * about the table rather than a compression of it: E.1 prints the identical
 * text in each of those rows.
 *
 * "10 pm to 12 pm" is E.1's own phrasing and is read as 10 pm to midnight, the
 * reading E.2's own fractions force (it prints the 110 W figure's 0.24 in both
 * the 22–23 and 23–24 columns) and the one the supplied CSV's transcriber
 * arrived at independently.
 */

const LIVING_KITCHEN_EQUIPMENT = {
  equipPeak: 450,
  equipment: [
    new Load({ from: 18, to: 20, watts: 450 }),
    new Load({ from: 20, to: 22, watts: 200 }),
    new Load({ from: 9, to: 18, watts: 110 }),
    new Load({ from: 22, to: 24, watts: 110 }),
  ],
  equipmentBase: 85,
  equipmentSays:
    'Peak gain of 450 W from 6 pm to 8 pm; 200 W from 8 pm to 10 pm; ' +
    '110 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 85 W for the rest of the day',
};

const LIVING_ROOM_EQUIPMENT = {
  equipPeak: 150,
  equipment: [
    new Load({ from: 18, to: 22, watts: 150 }),
    new Load({ from: 9, to: 18, watts: 60 }),
    new Load({ from: 22, to: 24, watts: 60 }),
  ],
  equipmentBase: 35,
  equipmentSays:
    'Peak gain of 150 W from 6 pm to 10 pm; 60 W from 9 am to 6 pm and from 10 pm to 12 pm; ' +
    'Base gain of 35 W for the rest of the day',
};

const KITCHEN_EQUIPMENT = {
  equipPeak: 300,
  equipment: [new Load({ from: 18, to: 20, watts: 300 })],
  equipmentBase: 50,
  equipmentSays: 'Peak gain of 300 W from 6 pm to 8 pm; Base gain of 50 W for the rest of the day',
};

const BEDROOM_EQUIPMENT = {
  equipPeak: 80,
  equipment: [new Load({ from: 8, to: 23, watts: 80 })],
  equipmentBase: 10,
  equipmentSays: 'Peak gain of 80 W from 8 am to 11 pm; Base gain of 10 W during the sleeping hours',
};

/** The daytime occupancy every separate room shares, at its own share of the dwelling. */
const daytime = (people, pct) => [new Presence({ from: 9, to: 22, people, pct })];
const UNOCCUPIED = 'unoccupied for the rest of the day';

const SPACES = Object.freeze([
  new Space({
    id: 'Studio',
    label: 'Studio apartment',
    people: 2,
    occupancy: [
      new Presence({ from: 23, to: 8, people: 2, pct: 0.7 }),
      new Presence({ from: 8, to: 23, people: 2, pct: 1 }),
    ],
    occupancyBase: null,
    occupancySays: '2 people at 70% gains from 11 pm to 8 am; 2 people at 100% gains from 8 am to 11 pm',
    ...LIVING_KITCHEN_EQUIPMENT,
  }),

  new Space({
    id: 'One bed living/kitchen',
    label: '1-bedroom dwelling: living room/kitchen',
    people: 1,
    occupancy: daytime(1, 1),
    occupancyBase: 0,
    occupancySays: `1 person from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_KITCHEN_EQUIPMENT,
  }),

  new Space({
    id: 'One bed living room',
    label: '1-bedroom dwelling: living room',
    people: 1,
    occupancy: daytime(1, 0.75),
    occupancyBase: 0,
    occupancySays: `1 person at 75% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_ROOM_EQUIPMENT,
  }),

  new Space({
    id: 'One bed kitchen',
    label: '1-bedroom dwelling: kitchen',
    people: 1,
    occupancy: daytime(1, 0.25),
    occupancyBase: 0,
    occupancySays: `1 person at 25% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...KITCHEN_EQUIPMENT,
  }),

  new Space({
    id: 'Two bed living/kitchen',
    label: '2-bedroom dwelling: living room/kitchen',
    people: 2,
    occupancy: daytime(2, 1),
    occupancyBase: 0,
    occupancySays: `2 people from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_KITCHEN_EQUIPMENT,
  }),

  new Space({
    id: 'Two bed living room',
    label: '2-bedroom dwelling: living room',
    people: 2,
    occupancy: daytime(2, 0.75),
    occupancyBase: 0,
    occupancySays: `2 people at 75% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_ROOM_EQUIPMENT,
  }),

  new Space({
    id: 'Two bed kitchen',
    label: '2-bedroom dwelling: kitchen',
    people: 2,
    occupancy: daytime(2, 0.25),
    occupancyBase: 0,
    occupancySays: `2 people at 25% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...KITCHEN_EQUIPMENT,
    findings: [
      new Finding({
        says: 'Table E.2 heads this row "Two bed kitchen, 1 person" while giving it a peak of 150 W sensible and 110 W latent, which is two people at 75 W and 55 W.',
        done: 'Table E.1\'s "2 people at 25% gains" is implemented, which is what E.2\'s own watts and its 0.25 fraction come to. The label is the part that is wrong.',
      }),
    ],
  }),

  new Space({
    id: 'Three bed living/kitchen',
    label: '3-bedroom dwelling: living room/kitchen',
    people: 3,
    occupancy: daytime(3, 1),
    occupancyBase: 0,
    // E.1's own sentence for this row, quoted as printed. It is the one this
    // generator does not implement, and the finding beside it says so.
    occupancySays: `3 people at 75% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_KITCHEN_EQUIPMENT,
    findings: [
      new Finding({
        says: 'Table E.1 says "3 people at 75% gains from 9 am to 10 pm", where Table E.2\'s own row for the same space gives a fraction of 1 and TM59:2017 says "3 people from 9 am to 10 pm".',
        done: 'Full occupancy is implemented. Two independent statements stand against one, and 75 % also breaks the pattern that a combined living/kitchen carries the dwelling\'s whole occupancy while a separate living room carries 75 % of it and a separate kitchen 25 %.',
      }),
    ],
  }),

  new Space({
    id: 'Three bed living room',
    label: '3-bedroom dwelling: living room',
    people: 3,
    occupancy: daytime(3, 0.75),
    occupancyBase: 0,
    occupancySays: `3 people at 75% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...LIVING_ROOM_EQUIPMENT,
  }),

  new Space({
    id: 'Three bed kitchen',
    label: '3-bedroom dwelling: kitchen',
    people: 3,
    occupancy: daytime(3, 0.25),
    occupancyBase: 0,
    occupancySays: `3 people at 25% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    ...KITCHEN_EQUIPMENT,
  }),

  new Space({
    id: 'Single bedroom',
    label: 'Single bedroom',
    people: 1,
    occupancy: [
      new Presence({ from: 23, to: 8, people: 1, pct: 0.7 }),
      new Presence({ from: 8, to: 23, people: 1, pct: 1 }),
    ],
    occupancyBase: null,
    occupancySays: '1 person at 70% gains from 11 pm to 8 am; 1 person at full gains from 8 am to 11 pm',
    ...BEDROOM_EQUIPMENT,
  }),

  new Space({
    id: 'Double bedroom',
    label: 'Double bedroom',
    people: 2,
    occupancy: [
      new Presence({ from: 23, to: 8, people: 2, pct: 0.7 }),
      new Presence({ from: 8, to: 9, people: 2, pct: 1 }),
      new Presence({ from: 9, to: 22, people: 1, pct: 1 }),
      new Presence({ from: 22, to: 23, people: 2, pct: 1 }),
    ],
    occupancyBase: null,
    occupancySays:
      '2 people at 70% gains from 11 pm to 8 am; 2 people at full gains from 8 am to 9 am and from 10 pm to 11 pm; ' +
      '1 person at full gains from 9 am to 10 pm',
    ...BEDROOM_EQUIPMENT,
  }),

  new Space({
    id: 'Home office',
    label: 'Home office',
    people: 1,
    occupancy: daytime(1, 0.75),
    occupancyBase: 0,
    occupancySays: `1 person at 75% gains from 9 am to 10 pm; ${UNOCCUPIED}`,
    equipPeak: 150,
    equipment: [new Load({ from: 9, to: 22, watts: 150 })],
    equipmentBase: 19,
    equipmentSays: 'Peak gain of 150 W from 9 am to 10 pm; Base gain of 19 W for the rest of the day',
  }),
]);

/* ── Table E.2, transcribed as printed ──────────────────────────────────── */

/*
 * The rows below are the *second* statement of the same thirteen profiles and
 * are read by nothing but the cross-check. Their fractions are E.2's own,
 * rounded to two decimals by CIBSE, and where they disagree with E.1's watts it
 * is E.1 that is implemented — see finding 1. Runs are `[hours, fraction]`.
 */

const DAY_FRACTION = (f) => [[9, 0], [13, f], [2, 0]];
const LIVING_KITCHEN_PRINTED = [[9, 0.19], [9, 0.24], [2, 1], [2, 0.44], [2, 0.24]];
const LIVING_ROOM_PRINTED = [[9, 0.23], [9, 0.4], [4, 1], [2, 0.4]];
const KITCHEN_PRINTED = [[18, 0.17], [2, 1], [4, 0.17]];
const BEDROOM_PRINTED = [[8, 0.13], [15, 1], [1, 0.13]];

const PRINTED = Object.freeze({
  Studio: new Printed({
    label: 'Studio, 2 people',
    sensible: 150,
    latent: 110,
    occupied: [[8, 0.7], [15, 1], [1, 0.7]],
    equipment: LIVING_KITCHEN_PRINTED,
  }),
  'One bed living/kitchen': new Printed({
    label: 'One bed living/kitchen, 1 person',
    sensible: 75,
    latent: 55,
    occupied: DAY_FRACTION(1),
    equipment: LIVING_KITCHEN_PRINTED,
  }),
  'One bed living room': new Printed({
    label: 'One bed living room, 1 person',
    sensible: 75,
    latent: 55,
    occupied: DAY_FRACTION(0.75),
    equipment: LIVING_ROOM_PRINTED,
  }),
  'One bed kitchen': new Printed({
    label: 'One bed kitchen, 1 person',
    sensible: 75,
    latent: 55,
    occupied: DAY_FRACTION(0.25),
    equipment: KITCHEN_PRINTED,
  }),
  'Two bed living/kitchen': new Printed({
    label: 'Two bed living/kitchen, 2 people',
    sensible: 150,
    latent: 110,
    occupied: DAY_FRACTION(1),
    equipment: LIVING_KITCHEN_PRINTED,
  }),
  'Two bed living room': new Printed({
    label: 'Two bed living room, 2 people',
    sensible: 150,
    latent: 110,
    occupied: DAY_FRACTION(0.75),
    equipment: LIVING_ROOM_PRINTED,
  }),
  'Two bed kitchen': new Printed({
    // Verbatim, wrong person count and all: the label is finding 3's evidence.
    label: 'Two bed kitchen, 1 person',
    sensible: 150,
    latent: 110,
    occupied: DAY_FRACTION(0.25),
    equipment: KITCHEN_PRINTED,
  }),
  'Three bed living/kitchen': new Printed({
    label: 'Three bed living/kitchen, 3 people',
    sensible: 225,
    latent: 165,
    occupied: DAY_FRACTION(1),
    equipment: LIVING_KITCHEN_PRINTED,
  }),
  'Three bed living room': new Printed({
    label: 'Three bed, living room, 3 people',
    sensible: 225,
    latent: 165,
    occupied: DAY_FRACTION(0.75),
    equipment: LIVING_ROOM_PRINTED,
  }),
  'Three bed kitchen': new Printed({
    label: 'Three bed kitchen, 3 people',
    sensible: 225,
    latent: 165,
    occupied: DAY_FRACTION(0.25),
    equipment: KITCHEN_PRINTED,
  }),
  'Single bedroom': new Printed({
    label: 'Single bedroom, 1 person',
    sensible: 75,
    latent: 55,
    occupied: [[8, 0.7], [15, 1], [1, 0.7]],
    equipment: BEDROOM_PRINTED,
  }),
  'Double bedroom': new Printed({
    label: 'Double bedroom, 2 people',
    sensible: 150,
    latent: 110,
    occupied: [[8, 0.7], [1, 1], [13, 0.5], [1, 1], [1, 0.7]],
    equipment: BEDROOM_PRINTED,
  }),
  'Home office': new Printed({
    label: 'Home office, 1 person',
    sensible: 75,
    latent: 55,
    occupied: DAY_FRACTION(0.75),
    equipment: [[9, 0.13], [13, 1], [2, 0.13]],
  }),
});

/**
 * E.2's lighting row, which is one profile for every space on the table.
 *
 * 2 W/m² of usable floor area at a fraction of 1 for the five hours ending
 * 19:00 through 23:00, and zero otherwise. It is a third band of its own and
 * not the occupied one, which is the whole reason the desk's single shared
 * `Occupancy` schedule cannot carry TM59: a living room is occupied from 09:00
 * and its lights are not on until 18:00.
 */
const LIGHTING_PRINTED = Object.freeze(runs([[18, 0], [5, 1], [1, 0]], 'lighting'));

/* ── the derivation ─────────────────────────────────────────────────────── */

/**
 * Clauses to twenty-four absolute values.
 *
 * Every hour must be claimed exactly once, by a clause or by the base, and both
 * ways of getting that wrong throw with the hour named. An hour written twice
 * is two clauses of one sentence overlapping, which means the sentence was
 * misread; an hour left unclaimed with no base is a band that does not cover
 * the day. And a base that never applies is the third case: E.1 writes "for the
 * rest of the day" only where there *is* a rest of the day, so a base standing
 * over a fully claimed profile means a clause was transcribed too wide.
 */
function expand(clauses, base, what) {
  const hours = Array.from({ length: HOURS }, () => null);
  for (const clause of clauses) {
    for (let h = clause.from; h !== clause.to % HOURS; h = (h + 1) % HOURS) {
      if (hours[h] !== null) throw new Error(`${what}: hour ${h}:00 is claimed by two clauses`);
      hours[h] = clause.value;
    }
  }
  const unclaimed = hours.filter((v) => v === null).length;
  if (base === null && unclaimed) throw new Error(`${what}: ${unclaimed} hours are claimed by no clause and there is no base gain`);
  if (base !== null && !unclaimed) throw new Error(`${what}: a base gain of ${base} is declared and every hour is already claimed`);
  return hours.map((v) => (v === null ? base : v));
}

/** A profile, and the checks that make it worth reading. */
const profiles = SPACES.map((space) => {
  const printed = PRINTED[space.id];
  if (!printed) throw new Error(`${space.id}: no Table E.2 row transcribed to check it against`);

  const people = expand(space.occupancy, space.occupancyBase, `${space.id} occupancy`);
  const watts = expand(space.equipment, space.equipmentBase, `${space.id} equipment`);

  // The fractions, divided out of E.1. Occupancy divides by the space's peak
  // headcount rather than by the peak of its own profile: a kitchen's People
  // object is a whole person whose schedule never rises above 0.25, which is
  // what E.2's peak column of 75 W beside a fraction of 0.25 states.
  const occupied = people.map((v) => round(v / space.people));
  const equipment = watts.map((v) => round(v / space.equipPeak));

  // Check 2, and finding 3's evidence: E.2's peak watts against its headcount.
  if (space.people * PERSON_SENSIBLE !== printed.sensible || space.people * PERSON_LATENT !== printed.latent) {
    throw new Error(
      `${space.id}: ${space.people} ${space.people === 1 ? 'person' : 'people'} at ${PERSON_SENSIBLE}/${PERSON_LATENT} W is ` +
        `${space.people * PERSON_SENSIBLE}/${space.people * PERSON_LATENT} W, where Table E.2 prints ` +
        `${printed.sensible}/${printed.latent} W for "${printed.label}"`,
    );
  }

  // Check 1: every derived fraction must be E.2's printed one once rounded to
  // the two decimals E.2 carries. The gap between the two is finding 1, and the
  // largest one on this space is lettered into its `why` below.
  let gap = null;
  for (const [series, derived, absolute, peak, unit, asPrintedRow] of [
    ['occupancy', occupied, people, space.people, 'people', printed.occupied],
    ['equipment', equipment, watts, space.equipPeak, 'W', printed.equipment],
  ]) {
    for (let h = 0; h < HOURS; h += 1) {
      const asPrinted = round(derived[h], 2);
      if (asPrinted !== asPrintedRow[h]) {
        throw new Error(
          `${space.id} ${series}: hour ${h}:00 divides out of Table E.1 as ${derived[h]}, which rounds to ` +
            `${asPrinted}, where Table E.2 prints ${asPrintedRow[h]}`,
        );
      }
      const drift = Math.abs(asPrinted * peak - absolute[h]);
      if (drift > 1e-9 && (!gap || drift > gap.drift)) {
        gap = { drift, printed: asPrinted, derived: derived[h], absolute: absolute[h], peak, unit };
      }
    }
  }

  // CL:2026's two figures, derived rather than asserted. An hour is occupied
  // where the profile stands above zero, which is the whole of the rule for a
  // TM59 pattern: Table E.2's unoccupied hours are literally 0, unlike the
  // desk's own band schedule, whose out-of-hours value is 0.1.
  const occupiedHours = occupied.filter((v) => v > 0).length * SEASON_DAYS;
  if (!PUBLISHED_HOURS.includes(occupiedHours)) {
    throw new Error(
      `${space.id}: ${occupiedHours} summer occupied hours, which is neither of the two figures CL:2026 ` +
        `publishes (${PUBLISHED_HOURS.join(' and ')}). The occupancy band is transcribed wrong.`,
    );
  }

  const why = [
    `Occupancy, Table E.1: "${space.occupancySays}", over a peak of ${space.people} ${space.people === 1 ? 'person' : 'people'} at ${PERSON_SENSIBLE} W sensible and ${PERSON_LATENT} W latent${space.people === 1 ? '' : ' each'}.`,
    `Equipment, Table E.1: "${space.equipmentSays}", divided by the ${space.equipPeak} W peak.`,
    // Straight after the sentences, because a finding is what qualifies one of
    // them: the three-bedroom living/kitchen's `why` opens by quoting a 75 %
    // this file does not implement, and the reader has to reach the reason in
    // the next line rather than four lines down past the lighting band.
    ...space.findings.map((f) => `${f.says} ${f.done}`),
    gap
      ? `Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints ${gap.printed} where E.1's ${gap.absolute} ${gap.unit} over ${gap.peak} is ${gap.derived}, which multiplied back is ${round(gap.printed * gap.peak, 3)} ${gap.unit}. The figures above are divided out of E.1, which is the primary statement.`
      : `Table E.2's printed fractions for this space are exact, so both tables give the same profile.`,
    `Lighting, Table E.2: ${LIGHTING} W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.`,
    `${occupiedHours} summer occupied hours: ${occupied.filter((v) => v > 0).length} hours a day over the ${SEASON_DAYS} days of 1 May to 30 September, which is the total CL:2026 publishes for ${occupiedHours === 3672 ? 'bedrooms' : 'living rooms, kitchens and studies'}.`,
  ];

  return { space, occupied, equipment, occupiedHours, why, people, watts };
});

/* ── check 3: the reader's independent transcription ────────────────────── */

/**
 * The 2017 CSV names its dwellings "apartment" where the 2026 tables say
 * "dwelling", and spells the single bedroom with the qualification E.1 moved
 * into a note, so the two vocabularies are mapped rather than matched. The
 * communal corridor row is deliberately unmapped: it carries no equipment
 * figure at all (its own note says "Pipework heat loss only"), which is the
 * same reason no communal profile is generated.
 */
const CSV_SPACES = Object.freeze({
  Studio: 'Studio',
  '1-bedroom apartment: living room/kitchen': 'One bed living/kitchen',
  '1-bedroom apartment: living room': 'One bed living room',
  '1-bedroom apartment: kitchen': 'One bed kitchen',
  '2-bedroom apartment: living room/kitchen': 'Two bed living/kitchen',
  '2-bedroom apartment: living room': 'Two bed living room',
  '2-bedroom apartment: kitchen': 'Two bed kitchen',
  '3-bedroom apartment: living room/kitchen': 'Three bed living/kitchen',
  '3-bedroom apartment: living room': 'Three bed living room',
  '3-bedroom apartment: kitchen': 'Three bed kitchen',
  'Double bedroom': 'Double bedroom',
  'Single bedroom (too small to accommodate double bed)': 'Single bedroom',
});

/** The quoted-field dialect, parsed properly, as `build-rates.mjs` parses StatCan's. */
function readCsv(path) {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') (field += '"'), (i += 1);
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') (row.push(field), (field = ''));
    else if (ch === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) (row.push(field), rows.push(row));
  // Served with a byte-order mark, which would otherwise make the first column
  // name unmatchable.
  const head = Object.fromEntries(rows[0].map((h, i) => [h.replace(/^\ufeff/, ''), i]));
  return { head, rows: rows.slice(1).filter((r) => r.length > 1) };
}

if (!existsSync(csvPath)) {
  throw new Error(
    `the cross-check transcription is missing.\n` +
      `  expected: ${csvPath}\n` +
      `  This script will not write src/tm59.data.js from one transcription of a table it cannot\n` +
      `  fetch. Put tm59_occupancy_equipment_profile_library.csv at the path above, or point\n` +
      `  TM59_PROFILE_CSV at wherever it is, and run it again.`,
  );
}

const csv = readCsv(csvPath);
const HOUR_COLUMNS = Array.from({ length: HOURS }, (_, h) => `h${String(h).padStart(2, '0')}_${String((h + 1) % HOURS).padStart(2, '0')}`);
for (const column of HOUR_COLUMNS) {
  if (csv.head[column] === undefined) throw new Error(`${csvPath}: no column ${column}; this is not the profile library`);
}

const checked = new Set();
for (const row of csv.rows) {
  const id = CSV_SPACES[row[csv.head.unit_room_type]];
  if (!id) continue;
  const kind = row[csv.head.load_type];
  const found = profiles.find((p) => p.space.id === id);
  if (!found) throw new Error(`${csvPath}: names ${id}, which Table E.1 above does not declare`);
  const mine = kind === 'occupancy' ? found.people : found.watts;
  for (let h = 0; h < HOURS; h += 1) {
    const theirs = Number(row[csv.head[HOUR_COLUMNS[h]]]);
    if (Math.abs(theirs - mine[h]) > 1e-9) {
      throw new Error(
        `${id} ${kind}: hour ${h}:00 is ${mine[h]} off Table E.1 and ${theirs} in the 2017 transcription. ` +
          `Two transcriptions of the same table disagree; neither may be assumed right.`,
      );
    }
  }
  checked.add(`${id} ${kind}`);
}

/* ── emit ───────────────────────────────────────────────────────────────── */

const list = (values) => `[${values.join(', ')}]`;
const text = (s) => JSON.stringify(s);

const file = `/* ═══ generated, do not edit by hand ══════════════════════════════════════
 *
 * Written by scripts/build-tm59.mjs from CIBSE TM59:2026 Appendix E, Tables E.1
 * and E.2. Rerunning that script is how these numbers change; editing them here
 * would break the one promise this file makes, which is that every fraction on
 * it was divided out of a published absolute figure whose sentence is printed
 * beside it in \`why\`.
 *
 * The publication itself is not in this repository and may not be added: it is
 * a purchased document and the supplied copy is watermarked to a named
 * individual. It is quoted here the way the register already quotes Passivhaus
 * and LETI. The transcription of the two tables lives in the generator, which
 * checks it three ways before writing this file — E.1's watts against E.2's
 * printed fractions, E.2's peak watts against its own headcounts, and both
 * against an independent transcription of the 2017 edition supplied by the
 * reader — so a slip shows up as a named hour of a named space rather than as a
 * plausible wrong profile.
 *
 * **The fractions are divided out of Table E.1's absolute watts, not lifted
 * from Table E.2.** 85/450 is 0.188889, which E.2 prints as 0.19 and which
 * multiplied back is 85.5 W; the tables disagree by up to 2 % and E.1 is the
 * primary statement. Each profile's \`why\` letters the division and the gap.
 *
 * Thirteen spaces, which is what Appendix E tabulates. The fourteenth row of
 * Table E.1, the communal space, is deliberately absent: E.1 gives it "Assumed
 * to be zero" occupancy and "Heating system gains only" equipment and
 * quantifies neither, so there is no profile to write. It is criterion d's
 * space, and criterion d is on the unjudged list.
 */

/**
 * One space's prescribed setup, as TM59:2026 Appendix E states it.
 *
 * Absolute where TM59 is absolute and fractional where it is fractional: the
 * peak headcount and the peak watts are the figures the table publishes, and
 * the two 24-hour bands are multipliers on them. That split is what the Gains
 * channel's absolute calculation methods exist for — a room type carries "2
 * people" and "450 W", not a density, because a density would be a reading of
 * the Massing channel that no preset is allowed to write.
 *
 * Every invariant below throws in the constructor rather than being checked by
 * whoever reads a profile, because a profile is a declaration and a declaration
 * that is wrong should stop the page at mount.
 */
export class RoomProfile {
  constructor({ id, label, people, sensible, latent, occupied, equipPeak, equipment, lighting, lightHours, occupiedHours, why }) {
    const band = (hours, what) => {
      if (!Array.isArray(hours) || hours.length !== 24) throw new Error(\`RoomProfile \${id}: \${what} is not 24 hours\`);
      for (const [h, v] of hours.entries()) {
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(\`RoomProfile \${id}: \${what} at \${h}:00 is \${v}, not a fraction\`);
      }
      return Object.freeze([...hours]);
    };
    if (!Number.isInteger(people) || people < 1) throw new Error(\`RoomProfile \${id}: \${people} is not a headcount\`);
    if (!(equipPeak > 0)) throw new Error(\`RoomProfile \${id}: \${equipPeak} W is not an equipment peak\`);
    this.id = id;
    this.label = label;
    /** Peak occupants of the space, the figure \`peopleCount\` is set to. */
    this.people = people;
    /** Watts per person, sensible and latent, from Table E.2's peak columns. */
    this.sensible = sensible;
    this.latent = latent;
    /** Fractions of the peak headcount, hour by hour, hour 0 being 00:00 to 01:00. */
    this.occupied = band(occupied, 'occupied');
    /** Watts at the peak, the figure \`equipPeak\` is set to. */
    this.equipPeak = equipPeak;
    /** Fractions of that peak, hour by hour. */
    this.equipment = band(equipment, 'equipment');
    /** W/m² of usable floor area, on its own band rather than the occupied one. */
    this.lighting = lighting;
    this.lightHours = Object.freeze([...lightHours]);
    /** Hours of the 1 May to 30 September period this profile is occupied for. */
    this.occupiedHours = occupiedHours;
    /** The sentences these figures came out of, one per line. */
    this.why = why;
    Object.freeze(this);
  }
}

/**
 * The lighting profile, which Table E.2 prints once for every space.
 *
 * Emitted expanded as well as as the \`lightHours\` band on each profile because
 * the preset writes a 24-value pattern and reconstructing one from a band at
 * the call site would be a second statement of the same published row. Both
 * come off the one transcription in the generator, so they cannot drift.
 */
export const LIGHTING_PATTERN = Object.freeze(${list(LIGHTING_PRINTED)});

/** The thirteen spaces, in Table E.1's own order. */
export const PROFILES = Object.freeze([
${profiles
  .map(
    ({ space, occupied, equipment, occupiedHours, why }) => `  new RoomProfile({
    id: ${text(space.id)},
    label: ${text(space.label)},
    people: ${space.people},
    sensible: ${PERSON_SENSIBLE},
    latent: ${PERSON_LATENT},
    occupied: ${list(occupied)},
    equipPeak: ${space.equipPeak},
    equipment: ${list(equipment)},
    lighting: ${LIGHTING},
    lightHours: [${LIGHTING_PRINTED.indexOf(1)}, ${LIGHTING_PRINTED.lastIndexOf(1) + 1}],
    occupiedHours: ${occupiedHours},
    why: [
${why.map((line) => `      ${text(line)},`).join('\n')}
    ].join('\\n'),
  }),`,
  )
  .join('\n')}
]);

/**
 * The thirteen ids, for the \`roomType\` selector to offer.
 *
 * Exported so the selector's options and the library's keys are one list rather
 * than two spellings of one vocabulary — a room type the reader can choose that
 * reaches no profile is a refusal at the moment the model is applied, and the
 * only way to be sure there is not one is for the desk to read the names off
 * the library. The desk's own \`'As drawn'\` is not among them: it is the setting
 * at which no room type is named at all.
 *
 * A generic \`'Bedroom'\` or \`'Living room'\` is deliberately not offered.
 * Appendix E publishes a single and a double bedroom, and a living room for a
 * one, two and three-bedroom dwelling, and they differ in the one figure that
 * matters most: how many people are in the room. A generic name would have to
 * pick a headcount TM59 does not publish under it.
 */
export const PROFILE_IDS = Object.freeze([
${profiles.map(({ space }) => `  ${text(space.id)},`).join('\n')}
]);

/**
 * Every profile is keyed by the string the \`roomType\` selector offers, and the
 * two vocabularies have to be one vocabulary or the desk and the library
 * disagree about what the reader chose. Duplicate ids throw here rather than
 * shadowing each other silently.
 */
const BY_ID = new Map();
for (const profile of PROFILES) {
  if (BY_ID.has(profile.id)) throw new Error(\`tm59.data: two profiles are called \${profile.id}\`);
  BY_ID.set(profile.id, profile);
}

/**
 * The profile a room type names, or a refusal saying what is missing.
 *
 * There is no nearest match and no default room: a room type that reaches no
 * published profile would put invented gains into the model under CIBSE's name,
 * which is the failure this whole file is arranged against.
 */
export function profileFor(id) {
  const profile = BY_ID.get(id);
  if (profile) return profile;
  if (!PROFILES.length) {
    throw new Error(
      'the TM59 Appendix E profile library has not been generated; ' +
        'run scripts/build-tm59.mjs against the published tables',
    );
  }
  throw new Error(\`TM59 has no prescribed profile called "\${id}"; Appendix E tabulates \${[...BY_ID.keys()].join(', ')}\`);
}
`;

writeFileSync(out, file);
console.log(`wrote ${out}`);
console.log(`  ${profiles.length} spaces off Tables E.1 and E.2`);
console.log(`  ${checked.size} of ${profiles.length * 2} series cross-checked against ${csvPath}`);
for (const { space, occupiedHours } of profiles) {
  const uncrossed = ['occupancy', 'equipment'].filter((k) => !checked.has(`${space.id} ${k}`));
  console.log(
    `  ${space.id.padEnd(24)} ${String(space.people).padStart(2)}p ` +
      `${String(space.equipPeak).padStart(3)}W ${occupiedHours} h` +
      (uncrossed.length ? `  (${uncrossed.join(' and ')} not in the 2017 transcription)` : ''),
  );
}
