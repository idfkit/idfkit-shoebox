/* ═══ generated, do not edit by hand ══════════════════════════════════════
 *
 * Written by scripts/build-tm59.mjs from CIBSE TM59:2026 Appendix E, Tables E.1
 * and E.2. Rerunning that script is how these numbers change; editing them here
 * would break the one promise this file makes, which is that every fraction on
 * it was divided out of a published absolute figure whose sentence is printed
 * beside it in `why`.
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
 * primary statement. Each profile's `why` letters the division and the gap.
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
      if (!Array.isArray(hours) || hours.length !== 24) throw new Error(`RoomProfile ${id}: ${what} is not 24 hours`);
      for (const [h, v] of hours.entries()) {
        if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`RoomProfile ${id}: ${what} at ${h}:00 is ${v}, not a fraction`);
      }
      return Object.freeze([...hours]);
    };
    if (!Number.isInteger(people) || people < 1) throw new Error(`RoomProfile ${id}: ${people} is not a headcount`);
    if (!(equipPeak > 0)) throw new Error(`RoomProfile ${id}: ${equipPeak} W is not an equipment peak`);
    this.id = id;
    this.label = label;
    /** Peak occupants of the space, the figure `peopleCount` is set to. */
    this.people = people;
    /** Watts per person, sensible and latent, from Table E.2's peak columns. */
    this.sensible = sensible;
    this.latent = latent;
    /** Fractions of the peak headcount, hour by hour, hour 0 being 00:00 to 01:00. */
    this.occupied = band(occupied, 'occupied');
    /** Watts at the peak, the figure `equipPeak` is set to. */
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
 * Emitted expanded as well as as the `lightHours` band on each profile because
 * the preset writes a 24-value pattern and reconstructing one from a band at
 * the call site would be a second statement of the same published row. Both
 * come off the one transcription in the generator, so they cannot drift.
 */
export const LIGHTING_PATTERN = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0]);

/** The thirteen spaces, in Table E.1's own order. */
export const PROFILES = Object.freeze([
  new RoomProfile({
    id: "Studio",
    label: "Studio apartment",
    people: 2,
    sensible: 75,
    latent: 55,
    occupied: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.7],
    equipPeak: 450,
    equipment: [0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 1, 1, 0.444444, 0.444444, 0.244444, 0.244444],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 3672,
    why: [
      "Occupancy, Table E.1: \"2 people at 70% gains from 11 pm to 8 am; 2 people at 100% gains from 8 am to 11 pm\", over a peak of 2 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 450 W from 6 pm to 8 pm; 200 W from 8 pm to 10 pm; 110 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 85 W for the rest of the day\", divided by the 450 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.24 where E.1's 110 W over 450 is 0.244444, which multiplied back is 108 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "3672 summer occupied hours: 24 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for bedrooms.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "One bed living/kitchen",
    label: "1-bedroom dwelling: living room/kitchen",
    people: 1,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    equipPeak: 450,
    equipment: [0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 1, 1, 0.444444, 0.444444, 0.244444, 0.244444],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"1 person from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 1 person at 75 W sensible and 55 W latent.",
      "Equipment, Table E.1: \"Peak gain of 450 W from 6 pm to 8 pm; 200 W from 8 pm to 10 pm; 110 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 85 W for the rest of the day\", divided by the 450 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.24 where E.1's 110 W over 450 is 0.244444, which multiplied back is 108 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "One bed living room",
    label: "1-bedroom dwelling: living room",
    people: 1,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0, 0],
    equipPeak: 150,
    equipment: [0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 1, 1, 1, 1, 0.4, 0.4],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"1 person at 75% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 1 person at 75 W sensible and 55 W latent.",
      "Equipment, Table E.1: \"Peak gain of 150 W from 6 pm to 10 pm; 60 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 35 W for the rest of the day\", divided by the 150 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.23 where E.1's 35 W over 150 is 0.233333, which multiplied back is 34.5 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "One bed kitchen",
    label: "1-bedroom dwelling: kitchen",
    people: 1,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0, 0],
    equipPeak: 300,
    equipment: [0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 1, 1, 0.166667, 0.166667, 0.166667, 0.166667],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"1 person at 25% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 1 person at 75 W sensible and 55 W latent.",
      "Equipment, Table E.1: \"Peak gain of 300 W from 6 pm to 8 pm; Base gain of 50 W for the rest of the day\", divided by the 300 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.17 where E.1's 50 W over 300 is 0.166667, which multiplied back is 51 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Two bed living/kitchen",
    label: "2-bedroom dwelling: living room/kitchen",
    people: 2,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    equipPeak: 450,
    equipment: [0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 1, 1, 0.444444, 0.444444, 0.244444, 0.244444],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"2 people from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 2 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 450 W from 6 pm to 8 pm; 200 W from 8 pm to 10 pm; 110 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 85 W for the rest of the day\", divided by the 450 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.24 where E.1's 110 W over 450 is 0.244444, which multiplied back is 108 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Two bed living room",
    label: "2-bedroom dwelling: living room",
    people: 2,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0, 0],
    equipPeak: 150,
    equipment: [0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 1, 1, 1, 1, 0.4, 0.4],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"2 people at 75% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 2 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 150 W from 6 pm to 10 pm; 60 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 35 W for the rest of the day\", divided by the 150 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.23 where E.1's 35 W over 150 is 0.233333, which multiplied back is 34.5 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Two bed kitchen",
    label: "2-bedroom dwelling: kitchen",
    people: 2,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0, 0],
    equipPeak: 300,
    equipment: [0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 1, 1, 0.166667, 0.166667, 0.166667, 0.166667],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"2 people at 25% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 2 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 300 W from 6 pm to 8 pm; Base gain of 50 W for the rest of the day\", divided by the 300 W peak.",
      "Table E.2 heads this row \"Two bed kitchen, 1 person\" while giving it a peak of 150 W sensible and 110 W latent, which is two people at 75 W and 55 W. Table E.1's \"2 people at 25% gains\" is implemented, which is what E.2's own watts and its 0.25 fraction come to. The label is the part that is wrong.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.17 where E.1's 50 W over 300 is 0.166667, which multiplied back is 51 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Three bed living/kitchen",
    label: "3-bedroom dwelling: living room/kitchen",
    people: 3,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    equipPeak: 450,
    equipment: [0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.188889, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 0.244444, 1, 1, 0.444444, 0.444444, 0.244444, 0.244444],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"3 people at 75% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 3 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 450 W from 6 pm to 8 pm; 200 W from 8 pm to 10 pm; 110 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 85 W for the rest of the day\", divided by the 450 W peak.",
      "Table E.1 says \"3 people at 75% gains from 9 am to 10 pm\", where Table E.2's own row for the same space gives a fraction of 1 and TM59:2017 says \"3 people from 9 am to 10 pm\". Full occupancy is implemented. Two independent statements stand against one, and 75 % also breaks the pattern that a combined living/kitchen carries the dwelling's whole occupancy while a separate living room carries 75 % of it and a separate kitchen 25 %.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.24 where E.1's 110 W over 450 is 0.244444, which multiplied back is 108 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Three bed living room",
    label: "3-bedroom dwelling: living room",
    people: 3,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0, 0],
    equipPeak: 150,
    equipment: [0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.233333, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 1, 1, 1, 1, 0.4, 0.4],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"3 people at 75% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 3 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 150 W from 6 pm to 10 pm; 60 W from 9 am to 6 pm and from 10 pm to 12 pm; Base gain of 35 W for the rest of the day\", divided by the 150 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.23 where E.1's 35 W over 150 is 0.233333, which multiplied back is 34.5 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Three bed kitchen",
    label: "3-bedroom dwelling: kitchen",
    people: 3,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0, 0],
    equipPeak: 300,
    equipment: [0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 0.166667, 1, 1, 0.166667, 0.166667, 0.166667, 0.166667],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"3 people at 25% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 3 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 300 W from 6 pm to 8 pm; Base gain of 50 W for the rest of the day\", divided by the 300 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.17 where E.1's 50 W over 300 is 0.166667, which multiplied back is 51 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Single bedroom",
    label: "Single bedroom",
    people: 1,
    sensible: 75,
    latent: 55,
    occupied: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.7],
    equipPeak: 80,
    equipment: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.125],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 3672,
    why: [
      "Occupancy, Table E.1: \"1 person at 70% gains from 11 pm to 8 am; 1 person at full gains from 8 am to 11 pm\", over a peak of 1 person at 75 W sensible and 55 W latent.",
      "Equipment, Table E.1: \"Peak gain of 80 W from 8 am to 11 pm; Base gain of 10 W during the sleeping hours\", divided by the 80 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.13 where E.1's 10 W over 80 is 0.125, which multiplied back is 10.4 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "3672 summer occupied hours: 24 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for bedrooms.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Double bedroom",
    label: "Double bedroom",
    people: 2,
    sensible: 75,
    latent: 55,
    occupied: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.7],
    equipPeak: 80,
    equipment: [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.125],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 3672,
    why: [
      "Occupancy, Table E.1: \"2 people at 70% gains from 11 pm to 8 am; 2 people at full gains from 8 am to 9 am and from 10 pm to 11 pm; 1 person at full gains from 9 am to 10 pm\", over a peak of 2 people at 75 W sensible and 55 W latent each.",
      "Equipment, Table E.1: \"Peak gain of 80 W from 8 am to 11 pm; Base gain of 10 W during the sleeping hours\", divided by the 80 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.13 where E.1's 10 W over 80 is 0.125, which multiplied back is 10.4 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "3672 summer occupied hours: 24 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for bedrooms.",
    ].join('\n'),
  }),
  new RoomProfile({
    id: "Home office",
    label: "Home office",
    people: 1,
    sensible: 75,
    latent: 55,
    occupied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0, 0],
    equipPeak: 150,
    equipment: [0.126667, 0.126667, 0.126667, 0.126667, 0.126667, 0.126667, 0.126667, 0.126667, 0.126667, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.126667, 0.126667],
    lighting: 2,
    lightHours: [18, 23],
    occupiedHours: 1989,
    why: [
      "Occupancy, Table E.1: \"1 person at 75% gains from 9 am to 10 pm; unoccupied for the rest of the day\", over a peak of 1 person at 75 W sensible and 55 W latent.",
      "Equipment, Table E.1: \"Peak gain of 150 W from 9 am to 10 pm; Base gain of 19 W for the rest of the day\", divided by the 150 W peak.",
      "Table E.2 states the same profile as fractions rounded to two decimals, and the two tables disagree: it prints 0.13 where E.1's 19 W over 150 is 0.126667, which multiplied back is 19.5 W. The figures above are divided out of E.1, which is the primary statement.",
      "Lighting, Table E.2: 2 W/m² of usable floor area for the five hours 18:00 to 23:00 and none otherwise, on its own band rather than the occupied one.",
      "1989 summer occupied hours: 13 hours a day over the 153 days of 1 May to 30 September, which is the total CL:2026 publishes for living rooms, kitchens and studies.",
    ].join('\n'),
  }),
]);

/**
 * The thirteen ids, for the `roomType` selector to offer.
 *
 * Exported so the selector's options and the library's keys are one list rather
 * than two spellings of one vocabulary — a room type the reader can choose that
 * reaches no profile is a refusal at the moment the model is applied, and the
 * only way to be sure there is not one is for the desk to read the names off
 * the library. The desk's own `'As drawn'` is not among them: it is the setting
 * at which no room type is named at all.
 *
 * A generic `'Bedroom'` or `'Living room'` is deliberately not offered.
 * Appendix E publishes a single and a double bedroom, and a living room for a
 * one, two and three-bedroom dwelling, and they differ in the one figure that
 * matters most: how many people are in the room. A generic name would have to
 * pick a headcount TM59 does not publish under it.
 */
export const PROFILE_IDS = Object.freeze([
  "Studio",
  "One bed living/kitchen",
  "One bed living room",
  "One bed kitchen",
  "Two bed living/kitchen",
  "Two bed living room",
  "Two bed kitchen",
  "Three bed living/kitchen",
  "Three bed living room",
  "Three bed kitchen",
  "Single bedroom",
  "Double bedroom",
  "Home office",
]);

/**
 * Every profile is keyed by the string the `roomType` selector offers, and the
 * two vocabularies have to be one vocabulary or the desk and the library
 * disagree about what the reader chose. Duplicate ids throw here rather than
 * shadowing each other silently.
 */
const BY_ID = new Map();
for (const profile of PROFILES) {
  if (BY_ID.has(profile.id)) throw new Error(`tm59.data: two profiles are called ${profile.id}`);
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
  throw new Error(`TM59 has no prescribed profile called "${id}"; Appendix E tabulates ${[...BY_ID.keys()].join(', ')}`);
}
