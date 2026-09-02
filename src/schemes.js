/**
 * Schemes: the standards a design can be built to, and the ideas you kept.
 *
 * Two different things live here, and running them together would be the
 * design failure this module exists to avoid.
 *
 * A **standard** is a specification. It is partial by nature — Passivhaus has
 * a great deal to say about a wall and nothing whatever to say about how big
 * the building is — so applying one is an *overlay*: it writes the controls it
 * speaks about and leaves every other control exactly where the architect put
 * it. That is what makes it usable as a question. You draw your massing on
 * your site, and then you ask what it would take to build that in this
 * climate, and the answer arrives without your building being taken away from
 * you.
 *
 * A **scheme** is a whole desk you decided to keep. It is not partial and it
 * does not overlay: restoring one replaces everything, because it is not a
 * specification, it is a drawing. A scheme is stored as its permalink, so the
 * saving format and the sharing format are the same string and the version
 * ledger in `permalink.js` carries both — a scheme saved today is readable by
 * a page that has since grown a channel, for exactly the reasons written out
 * there.
 *
 * Neither is remembered. Nothing on this page holds "the standard you picked":
 * whether the desk is built to a standard is *read back off the parameters*,
 * the same way the axonometric is read back off the vertices. Nudge a wall
 * resistance and the conformance falls away by itself, because it was never a
 * flag to go stale — it was a measurement of the desk.
 *
 * DOM-free and storage-free by construction (the shelf is handed its storage),
 * so the whole module can be exercised from Node the way `model.js` and
 * `permalink.js` are.
 *
 * It imports `tm59.js` and `tm59.data.js`, which is the one place a preset
 * reaches outside `controls.js` for its figures, and the reason is Principle
 * III rather than convenience. TM59's criteria, its two categories and its
 * thirteen prescribed room profiles are already declared once — with the clause
 * each was quoted from and the division each fraction came out of — and a
 * register that restated any of that would be the second source of truth this
 * page exists not to hold. So the preset below *composes* its citations out of
 * those declarations and writes almost no published sentence of its own; where
 * it does, it is saying something about this desk rather than about the
 * document. Both modules are themselves DOM-free and network-free, so nothing
 * about the harness's reach changes.
 */

import {
  CHANNELS,
  CHANNEL_BY_ID,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  controlFor,
  formatValue,
  labelFor,
  refuses,
  serializePattern,
} from './controls.js';
import {
  CATEGORY_BY_ID,
  COUNT_SCOPE,
  CRITERION_BY_ID,
  Category,
  QUALIFICATIONS,
  SEASON,
} from './tm59.js';
import { LIGHTING_PATTERN, PROFILE_IDS, profileFor } from './tm59.data.js';

/* ══ what a preset is allowed to touch ═══════════════════════════════════ */

/**
 * The channels a preset may never write.
 *
 * Massing, Site and Context are the architect's brief — where the building is,
 * which way it faces, what stands across the street and how big it is. A
 * standard that reached those would stop being a specification you can apply
 * to your design and become a different design, and the one move this feature
 * has to be trusted not to make is taking the drawing away.
 *
 * Solver and Run are not the building at all; a specification has no view on
 * how many warmup days the engine takes. And the two priced channels are
 * excluded for the reason `shapeKey` excludes them: nothing they own reaches
 * the IDF, so a preset that turned a tariff would move the bill without moving
 * the building, which is the one thing a specification must not be able to do.
 */
const UNTOUCHABLE = Object.freeze([
  'massing',
  'site',
  'context',
  'solver',
  'run',
  ...CHANNELS.filter((c) => c.prices).map((c) => c.id),
]);

/** The channels that are left alone, named for the interface to letter. */
export const LEFT_ALONE = Object.freeze(UNTOUCHABLE.map((id) => CHANNEL_BY_ID[id].name));

/* ══ the pieces of a preset ══════════════════════════════════════════════ */

/**
 * One control a preset sets, and where the number came from.
 *
 * `why` is not a nicety. Every figure in a published standard arrives in the
 * standard's own units, and almost none of them are the units an EnergyPlus
 * field wants: a blower-door air change rate is not an infiltration rate, and
 * an assembly U-value is not the resistance of the layer between the films. So
 * the conversion is done here, once, in the open, and the strip prints the
 * arithmetic beside the value — the same rule the bill's rate build-up
 * follows. A figure nobody can argue with is a figure nobody can design
 * against.
 */
export class Spec {
  constructor({ key, value, why }) {
    this.key = key;
    this.value = value;
    this.why = why;
    Object.freeze(this);
  }

  /** How this setting reads, through the control that owns it. */
  format() {
    return formatValue(this.key, this.value);
  }
}

/**
 * What a run has to carry for a target's question to mean anything.
 *
 * Three values and not a free string, because every one of them is read by
 * `targetBlock` on the sheet and a fourth arriving unannounced would fall
 * through its precedence into the catch-all — a line saying "not carried by
 * this run" over a run that carries it perfectly well. Declared here, refused
 * in the constructor, so a typo is a throw at mount rather than a wrong
 * sentence in the margin.
 */
const TARGET_NEEDS = Object.freeze(['run', 'season', 'year']);

/**
 * A number the standard asks of the finished building, as opposed to a
 * control it asks you to set.
 *
 * The distinction is the whole of the difference between a prescriptive
 * standard and a performance one, and it is worth drawing on the sheet: a
 * specification is something you *do*, a target is something you *find out*.
 * LETI is the pure case — it sets no control at all and asks two questions —
 * and having it in the list is what keeps the arrangement honest for the
 * others.
 *
 * `limit` may be null, which means the standard names a criterion whose value
 * is climate- or building-specific and therefore not a line this sheet is
 * entitled to draw. The reading is still shown, with no verdict against it.
 * Absence is not zero and it is not a pass either.
 */
export class Target {
  constructor({
    id, label, metric, needs = 'year', limit = null, above = null, unit, asks,
    note = null, category = null, digits = 1,
  }) {
    this.id = id;
    this.label = label;
    // How many decimals the board letters this line to. On the declaration
    // rather than in `renderScore`, because the alternative is a display rule
    // keyed off a metric id at every call site that letters a figure — and the
    // one line here that is not a continuous quantity proves why that fails
    // quietly: criterion b counts whole nights, and a `scoreFigure` arm that
    // forgot it would print `4.0 nights` with nothing anywhere saying so.
    //
    // Refused in the constructor, exactly as `needs` and `category` are, and
    // for the sharper version of the same reason. `scoreFigure` letters this
    // through `toFixed`, which takes 0 to 100 and throws outside it — so a
    // declaration of `-1` or `'0'` would not be a wrong number in the margin
    // but a `RangeError` or a `1` where a `0` was meant, thrown or lettered
    // from inside a board that redraws on every gesture. There is nothing on
    // the sheet that could say what happened, which is what makes this a
    // throw at mount naming the target.
    this.digits = digits;
    // Which reading answers it: 'tedi', 'cedi', 'eui' off the meters,
    // 'overheat' off the hourly zone temperature, 'peakHeat' / 'peakCool'
    // off the system's hourly transfer rate, or 'tm59a' / 'tm59b' / 'tm59c'
    // off the criteria `tm59.js` reads over the assessment period.
    this.metric = metric;
    // What the run has to carry for the question to mean anything. An energy
    // intensity and an exceedance frequency are both `'year'`: there is no
    // annual total in two design days and nothing to be a frequency of. A peak
    // load is `'run'`, and the distinction is the whole point — sizing days
    // are the conditions plant is designed against, so a load reads honestly
    // on a desk that has never been near a weather file.
    //
    // `'season'` is TM59's, and it is genuinely neither of those. Not
    // `'year'`, because the 2026 edition moved all four criteria onto 1 May to
    // 30 September and none of them wants twelve months any more — a
    // June-to-August calendar answers criterion a, over its own stated
    // coverage, and `'year'` would refuse it. Not `'run'` either, because two
    // design days in January are not a summer whatever else they are. What it
    // asks is that the run reach some part of the assessment period.
    this.needs = needs;
    this.limit = limit;
    this.above = above; // the threshold, for an exceedance-frequency target
    this.unit = unit;
    this.asks = asks; // the criterion in the standard's own words
    this.note = note;
    // Which of TM59's two categories this line is read at, or null for every
    // other target on this page and for TM59's own criterion c, which is 26 °C
    // for both. It carries the whole `Category` rather than its letter so the
    // row can letter what the category presumes without a second lookup, and
    // because a bare 'I' is one careless comparison away from a truthy string
    // standing in for a category nobody declared.
    this.category = category;
    if (!TARGET_NEEDS.includes(needs)) {
      throw new Error(
        `the target "${id}" needs a run that "${needs}", which is not one of ${TARGET_NEEDS.join(', ')}`,
      );
    }
    if (category !== null && !(category instanceof Category)) {
      throw new Error(`the target "${id}" carries a category that is not one of TM59's declared pair`);
    }
    if (!Number.isInteger(digits) || digits < 0 || digits > 20) {
      throw new Error(
        `the target "${id}" is lettered to ${digits} decimals, which is not a count of decimal places`,
      );
    }
    Object.freeze(this);
  }

  /**
   * Whether a reading clears the line, or null when there is no line.
   *
   * **Unchanged by TM59**, and that was checked rather than assumed. Criterion
   * b is a count of nights where every other line on this board is an
   * intensity or a share, so it was the candidate for needing a comparator of
   * its own; it does not, because §2.4.2 says "not more than four nights",
   * which is the same less-than-or-equal test as "≤ 15 kWh/(m²a)". Criteria a
   * and c are shares against 3 %, likewise. Had any of them been a strict
   * inequality this would have had to grow a per-target comparator, and the
   * difference would have shown only at exactly the value the criterion is
   * most often decided on.
   */
  meets(value) {
    if (this.limit == null || !Number.isFinite(value)) return null;
    return value <= this.limit;
  }
}

/**
 * A criterion of the standard that this sheet cannot judge, and why not.
 *
 * The most important list in the module. A shoebox with one zone, ideal loads
 * and no domestic hot water can speak to perhaps half of what Passivhaus
 * actually requires, and a panel that showed only the half it can answer would
 * read as a certification. Printing what is *not* being checked, beside what
 * is, is the difference between a design tool and a claim.
 */
export class Unjudged {
  constructor({ criterion, why }) {
    this.criterion = criterion;
    this.why = why;
    Object.freeze(this);
  }
}

/**
 * A named set of positions the desk can be put into.
 *
 * `kind` separates the two things in the shipped list, because they carry
 * completely different authority. A `standard` is somebody else's published
 * document and every number in it is cited. A `parti` is this sheet's own
 * arrangement — a familiar building idea, drawn quickly so it can be argued
 * with — and it cites nothing, because there is nothing to cite. Labelling
 * them alike would borrow authority the second kind does not have.
 */
export class Preset {
  constructor({
    id, name, kind, issuer = null, source = null, blurb,
    specs = [], engages = [], bypasses = [], targets = [], unjudged = [], caveat = null,
  }) {
    this.id = id;
    this.name = name;
    this.kind = kind;
    this.issuer = issuer;
    this.source = source; // the document and its version, for the citation line
    this.blurb = blurb;
    this.specs = Object.freeze(specs);
    // Declared as "puts these in the path" rather than as a bypass map,
    // because a preset is written as a sentence about what the building has,
    // and `{ air: false }` meaning "the building is airtight" reads backwards.
    this.engages = Object.freeze(engages);
    this.bypasses = Object.freeze(bypasses);
    this.targets = Object.freeze(targets);
    this.unjudged = Object.freeze(unjudged);
    this.caveat = caveat;
    Object.freeze(this);
  }

  /** Every channel this preset has an opinion about, in strip order. */
  channels() {
    const ids = new Set([
      ...this.specs.map((s) => controlFor(s.key).channel.id),
      ...this.engages,
      ...this.bypasses,
    ]);
    return CHANNELS.filter((c) => ids.has(c.id));
  }

  /** Its specs grouped under the strips they set, for the register to letter. */
  byChannel() {
    return this.channels()
      .map((channel) => ({
        channel,
        specs: this.specs.filter((s) => controlFor(s.key).channel.id === channel.id),
        patch: this.engages.includes(channel.id)
          ? 'in'
          : this.bypasses.includes(channel.id)
            ? 'out'
            : null,
      }))
      .filter((g) => g.specs.length || g.patch);
  }
}

/* ══ the shipped list ════════════════════════════════════════════════════ */

/*
 * Three published standards, one outcome standard, and two of this sheet's own
 * partis. The order is the order an argument goes in: the thing everybody
 * names first, its retrofit sibling, the target-only guide, the method that
 * asks about the summer rather than the winter, then the two buildings to
 * measure them against.
 *
 * Conversions used more than once, written out here so they are read the same
 * way everywhere they appear:
 *
 * — An **assembly U-value** becomes a construction resistance by taking the
 *   surface films off it, because the single `Material:NoMass` layer the
 *   Fabric strip writes is the construction alone and EnergyPlus adds the
 *   films itself. ISO 6946's standard values: R_si 0.13 m²K/W for horizontal
 *   heat flow (a wall), 0.10 upward (a roof), R_se 0.04 for both.
 *
 * — A **blower-door n50** becomes a natural-conditions infiltration rate by
 *   the divide-by-twenty rule of thumb (LBL). The two are not the same
 *   quantity: n50 is a pressurised leakage measurement, and the Air strip
 *   writes `ZoneInfiltration:DesignFlowRate`, which wants the rate the
 *   building actually leaks at. Twenty is a coarse constant that ignores
 *   height, shelter and climate zone; it is used because it is the rule the
 *   standard's own guidance uses, and the division is printed rather than
 *   hidden so it can be disagreed with.
 */

const filmsWall = 0.13 + 0.04;
const filmsRoof = 0.1 + 0.04;
const fromU = (u, films) => Math.round((1 / u - films) * 1000) / 1000;
const fromN50 = (n50) => Math.round((n50 / 20) * 1000) / 1000;

/* ── CIBSE TM59, and the pieces its specification is built out of ─────── */

/**
 * The space the prescribed setup puts the desk into.
 *
 * Appendix E prescribes an occupancy, an equipment profile and a lighting
 * profile *per room*, and a one-zone shoebox can be put into exactly one of the
 * thirteen. The double bedroom is the one where both of the Stage 1 criteria
 * are asked of the room the method asks them of: criterion a covers bedrooms
 * along with living rooms, kitchens and home offices, and criterion b covers
 * bedrooms and nothing else, so it is the only room type under which the pair
 * the sheet's count is taken over is read over a space TM59 applies both to.
 * Its occupied hours are also one of the two totals CL:2026 publishes, which is
 * what lets the denominator be checked against a published figure rather than
 * trusted.
 *
 * It is a *setting*, not a declaration about the reader's building, and that is
 * the whole point of a preset being an overlay: a reader assessing a living
 * room moves the room type and the register's chip drops by itself, because
 * conformance is a measurement of the desk and there is no remembered standard
 * anywhere on this page.
 */
const TM59_ROOM = 'Double bedroom';
const TM59_PROFILE = profileFor(TM59_ROOM);

/**
 * One line of a profile's published citation, found by what it opens with.
 *
 * `RoomProfile.why` is documented as the sentences its figures came out of, one
 * per line, and each spec below wants a different one of them. Selected by its
 * opening words rather than by position, because the order of lines in a
 * generated file is not a promise: `scripts/build-tm59.mjs` is rerun whenever
 * the transcription is corrected, and a spec quietly lettering the lighting
 * sentence under the equipment peak is exactly the kind of wrong that reads
 * perfectly. It throws where there is not exactly one such line, so a reworded
 * generator stops the page at mount instead of shipping a mismatched citation.
 */
const cite = (profile, opening) => {
  const lines = profile.why.split('\n').filter((line) => line.startsWith(opening));
  if (lines.length !== 1) {
    throw new Error(
      `the TM59 profile for "${profile.id}" carries ${lines.length} citation lines opening ` +
      `"${opening}", and each prescribed value letters exactly one of them`,
    );
  }
  return lines[0];
};

/**
 * A published 24-hour band as the canonical text its control carries.
 *
 * The precision is read off the `Pattern` declaration rather than written here,
 * for the reason `Ruled.parse` lives beside the `format` it undoes: the control
 * decides how many decimals its text holds, and a literal 3 in this file is how
 * a later widening of that precision becomes a preset quietly writing a coarser
 * profile than the desk is able to hold. Where a published fraction is finer
 * than the text — 85/450 is 0.188889 and three decimals is 0.189 — the spec's
 * own `why` letters the division that produced it, so the rounding is visible
 * rather than absorbed. The double bedroom's own fractions are 0.5, 0.7, 0.125
 * and 1, all exact at three places.
 */
const patternText = (key, hours) => serializePattern(hours, controlFor(key).control.digits);

/**
 * The equipment pattern's first hour, twice over: as the profile divides it and
 * as the control writes it down.
 *
 * A base gain is the one figure of Table E.1 that reaches the model through a
 * *fraction* rather than through a field of its own — 10 W under an 80 W peak
 * is 0.125 — so the spec's `why` has to letter it, and it has to letter the
 * number actually written rather than the number divided. On the double bedroom
 * the two are the same; on the home office they are 0.126667 and 0.127, and a
 * `why` quoting the first while the desk holds the second is a conversion the
 * reader cannot redo, which is the one thing this column exists to prevent.
 */
const EQUIP_BASE = TM59_PROFILE.equipment[0];
const EQUIP_BASE_TEXT = patternText('equipPattern', TM59_PROFILE.equipment).split(',')[0];

/**
 * The occupancy profile's shape and its denominator, both read off the profile.
 *
 * The `why` below has to describe the pattern it is writing, and describing it
 * in prose — "0.7 through the night, 1 at each end of the day" — would be a
 * sentence true of one of the thirteen spaces and silently false of the other
 * twelve the moment `TM59_ROOM` moved. So the levels are counted off the
 * declaration and the occupied hours are derived from it rather than asserted
 * about it.
 *
 * And the derivation is checked, because it is the one arithmetic on this
 * preset that CIBSE publishes an answer to. An hour is occupied where the
 * schedule stands above the value it takes when nobody is there, which for a
 * pattern is a literal zero, so the profile's own occupied-hour total has to be
 * the hours above zero times the days of the period. CL:2026 §2 publishes 3672
 * for a bedroom and 1989 for a living room, kitchen or study; 24 × 153 and
 * 13 × 153 are exactly those, and a profile whose two halves disagree would
 * hand every criterion a denominator nothing on the page could check.
 */
const OCC_LEVELS = Object.freeze([...new Set(TM59_PROFILE.occupied)].sort((a, b) => a - b));
const OCC_STANDING = TM59_PROFILE.occupied.filter((hour) => hour > 0).length;

if (OCC_STANDING * SEASON.days !== TM59_PROFILE.occupiedHours) {
  throw new Error(
    `the TM59 profile for "${TM59_ROOM}" stands above zero for ${OCC_STANDING} hours of the day, ` +
    `which over the ${SEASON.days} days of the assessment period is ${OCC_STANDING * SEASON.days} ` +
    `summer occupied hours, and the profile declares ${TM59_PROFILE.occupiedHours}`,
  );
}

/**
 * A qualification `tm59.js` already declares, by its id.
 *
 * Two surfaces state what this desk cannot judge and they are read in different
 * places: the scoreboard's block, under the readings, and the register's own
 * fold, beside the setup being applied. Writing the sentence twice would be two
 * copies to keep true, so the register composes its entries out of the same
 * declarations the block draws from and only writes the entries `tm59.js` has
 * no reason to hold. Throws on an id that has gone, rather than dropping an
 * entry from a list whose whole value is its length.
 */
const qualification = (id) => {
  const found = QUALIFICATIONS.find((q) => q.id === id);
  if (!found) {
    throw new Error(`tm59.js declares no qualification called "${id}", and the register cites it`);
  }
  return found;
};

const PH_WINDOW = new Spec({
  key: 'uFactor',
  value: 0.8,
  why:
    'PHI certifies a window for cool-temperate use at U_w ≤ 0.80 W/m²K. The Layered ' +
    'glazing model on this desk is a two-pane air-filled unit and cannot reach that, so ' +
    'the standard\'s window is described the way a product sheet describes it.',
});

export const PRESETS = Object.freeze([
  new Preset({
    id: 'passivhaus',
    name: 'Passivhaus Classic',
    kind: 'standard',
    issuer: 'Passive House Institute, Darmstadt',
    source: 'Criteria for the Passive House, EnerPHit and PHI Low Energy Building Standards',
    blurb:
      'The fabric-first case, stated as numbers. Insulation to U 0.15, a window that is a ' +
      'net gain in winter, a building that barely leaks, and mechanical ventilation with ' +
      'the heat taken back off the exhaust.',
    specs: [
      new Spec({
        key: 'wallR',
        value: fromU(0.15, filmsWall),
        why:
          'PHI\'s cool-temperate guidance puts the opaque envelope at U ≤ 0.15 W/m²K. ' +
          `1 ÷ 0.15 = 6.667 m²K/W of assembly, less ${filmsWall} for the inside and ` +
          'outside surface films, which EnergyPlus adds for itself.',
      }),
      new Spec({
        key: 'roofR',
        value: fromU(0.15, filmsRoof),
        why:
          `The same U ≤ 0.15 W/m²K, less ${filmsRoof} of films — a roof's inside film is ` +
          'thinner than a wall\'s because the heat flows upward through it.',
      }),
      new Spec({
        key: 'glazingModel',
        value: 'Simple',
        why: 'A certified window is bought by its U, g and light transmittance, not built up pane by pane.',
      }),
      PH_WINDOW,
      new Spec({
        key: 'shgc',
        value: 0.5,
        why:
          'PHI\'s cool-temperate window criterion is U_w − 1.6·g ≤ 0, so a window at U 0.80 ' +
          'has to pass g ≥ 0.5. That inequality is the whole idea of the standard in one ' +
          'line: the glass must collect more over a heating season than it loses.',
      }),
      new Spec({
        key: 'visT',
        value: 0.7,
        why:
          'Not a criterion. A plausible visible transmittance for the triple unit the U and ' +
          'g above describe, so the Daylight channel has something true to work against.',
      }),
      new Spec({
        key: 'infiltration',
        value: fromN50(0.6),
        why:
          'n50 ≤ 0.6 h⁻¹ at 50 Pa, the criterion everybody quotes, ÷ 20 for the ' +
          'natural-conditions rate the IDF field actually wants.',
      }),
      new Spec({
        key: 'outdoorAir',
        value: 8.5,
        why:
          'PHI designs the ventilation at 30 m³/h per person, which is 8.33 L/s; the ' +
          'control\'s half-litre grid puts that at 8.5.',
      }),
      new Spec({
        key: 'heatRecovery',
        value: 0.75,
        why: 'PHI certifies a heat recovery unit at an effectiveness of 75 % or better.',
      }),
      new Spec({
        key: 'coolSet',
        value: 25,
        why:
          '25 °C is the temperature the comfort criterion counts hours above, so it is the ' +
          'temperature the cooling holds to when there is cooling at all.',
      }),
    ],
    engages: ['air', 'system'],
    targets: [
      new Target({
        id: 'heating',
        label: 'Space heating demand',
        metric: 'tedi',
        limit: 15,
        unit: 'kWh/m²·yr',
        asks: '≤ 15 kWh/(m²a)',
      }),
      new Target({
        id: 'overheat',
        label: 'Hours above 25 °C',
        metric: 'overheat',
        limit: 10,
        above: 25,
        unit: '% of the year',
        asks: '≤ 10 % of the hours in a year',
        note:
          'Read off the hourly zone mean air temperature. With the System channel in the ' +
          'path the setpoints hold this down by definition; it is a criterion about a ' +
          'building that is meant to be comfortable without cooling, so it is worth reading ' +
          'with System out.',
      }),
      new Target({
        id: 'cooling',
        label: 'Space cooling demand',
        metric: 'cedi',
        unit: 'kWh/m²·yr',
        asks: 'a building-specific limit',
        note:
          'PHI sets the cooling and dehumidification limit per building and per climate ' +
          'rather than at one figure, so there is no line for this sheet to draw. The ' +
          'reading stands on its own.',
      }),
      new Target({
        id: 'heatload',
        label: 'Peak heating load',
        metric: 'peakHeat',
        needs: 'run',
        limit: 10,
        unit: 'W/m²',
        asks: '≤ 10 W/m², the alternative route',
        note:
          'PHI accepts either the demand or the load, not both, so this line and the ' +
          'heating demand above are two ways of passing rather than two hurdles. It reads ' +
          'off the same hourly system transfer rate the balance rail draws, over the ' +
          'billed environments — which on a desk with no weather file means the sizing ' +
          'days, and those are exactly the conditions plant is sized against. PHPP ' +
          'computes its load under two standardised design conditions instead, and an ' +
          'hourly figure is an average within the hour, so a true instantaneous peak sits ' +
          'above this.',
      }),
      new Target({
        id: 'coolload',
        label: 'Peak cooling load',
        metric: 'peakCool',
        needs: 'run',
        unit: 'W/m²',
        asks: 'no published figure',
        note:
          'PHI publishes no single cooling-load limit, so there is nothing to draw a line ' +
          'at. It is here because a peak is what sizes the plant whether or not a standard ' +
          'names it, and reading the heating peak while hiding the cooling one would be ' +
          'choosing which half of the plant matters.',
      }),
    ],
    unjudged: [
      new Unjudged({
        criterion: 'Renewable primary energy ≤ 60 kWh/(m²a)',
        why:
          'There is no domestic hot water and no household electricity in a shoebox, and ' +
          'PHI\'s PER factors are not on this page.',
      }),
      new Unjudged({
        criterion: 'The blower-door result itself, n50 ≤ 0.6 h⁻¹',
        why:
          'A measurement taken on a finished building, not an output of a simulation. The ' +
          'Air strip above carries it as a specification instead, divided by twenty.',
      }),
      new Unjudged({
        criterion: 'Thermal-bridge-free construction, Ψ ≤ 0.01 W/mK',
        why: 'One zone drawn as six surfaces has no junctions in it to detail.',
      }),
    ],
    caveat:
      'PHPP divides by treated floor area — a weighted net figure — and this sheet divides ' +
      'by the zone\'s gross floor, so every intensity here reads low against a real ' +
      'calculation. PHPP also assumes a standard internal gain, where the Gains strip is ' +
      'left as you set it. This is a shoebox, not a certification.',
  }),

  new Preset({
    id: 'enerphit',
    name: 'EnerPHit',
    kind: 'standard',
    issuer: 'Passive House Institute, Darmstadt',
    source: 'Criteria for the Passive House, EnerPHit and PHI Low Energy Building Standards',
    blurb:
      'Passivhaus for a building that already exists. The demand limit and the blower door ' +
      'are relaxed for the things a retrofit cannot undo; the ambition is not.',
    specs: [
      new Spec({
        key: 'glazingModel',
        value: 'Simple',
        why: 'As above: a certified window arrives as three numbers.',
      }),
      new Spec({
        key: 'uFactor',
        value: 0.85,
        why: 'EnerPHit\'s cool-temperate window criterion, U_w ≤ 0.85 W/m²K.',
      }),
      new Spec({
        key: 'infiltration',
        value: fromN50(1),
        why: 'n50 ≤ 1.0 h⁻¹, the relaxed retrofit figure, ÷ 20 for the natural-conditions rate.',
      }),
    ],
    engages: ['air', 'system'],
    targets: [
      new Target({
        id: 'heating',
        label: 'Space heating demand',
        metric: 'tedi',
        limit: 25,
        unit: 'kWh/m²·yr',
        asks: '≤ 25 kWh/(m²a)',
      }),
      new Target({
        id: 'overheat',
        label: 'Hours above 25 °C',
        metric: 'overheat',
        limit: 10,
        above: 25,
        unit: '% of the year',
        asks: '≤ 10 % of the hours in a year',
      }),
    ],
    unjudged: [
      new Unjudged({
        criterion: 'The opaque envelope',
        why:
          'EnerPHit publishes its component limits as climate-zone tables, and which line ' +
          'you are on depends on where the insulation goes as well as where the building ' +
          'is. A single figure would be an invention, so this strip sets no wall and no ' +
          'roof — yours stay where you put them.',
      }),
      new Unjudged({
        criterion: 'Renewable primary energy',
        why: 'Same absence as Passivhaus above: no hot water, no PER factors.',
      }),
    ],
    caveat:
      'The same gross-floor and shoebox qualifications as Passivhaus Classic apply, and ' +
      'EnerPHit additionally has a component route and a demand route which are not ' +
      'interchangeable. This is the demand route\'s number only.',
  }),

  new Preset({
    id: 'leti',
    name: 'LETI, commercial office',
    kind: 'standard',
    issuer: 'London Energy Transformation Initiative',
    source: 'Climate Emergency Design Guide, 2020',
    blurb:
      'A standard that sets nothing at all. LETI states the outcome an office has to reach ' +
      'and leaves every decision about how to reach it to the designer — so applying it ' +
      'moves no control, and the whole of it is two lines you have to hit.',
    specs: [],
    targets: [
      new Target({
        id: 'eui',
        label: 'Energy use intensity',
        metric: 'eui',
        limit: 55,
        unit: 'kWh/m²·yr',
        asks: '< 55 kWh/m²/yr for a commercial office',
        note:
          'LETI measures over gross internal area, and against everything the building ' +
          'uses. This sheet totals the bill\'s building section only, which is heating, ' +
          'cooling, lighting and equipment — a real office also has lifts, servers and ' +
          'hot water, so the reading here is the optimistic end of the number.',
      }),
      new Target({
        id: 'heating',
        label: 'Space heating demand',
        metric: 'tedi',
        limit: 15,
        unit: 'kWh/m²·yr',
        asks: '< 15 kWh/m²/yr',
      }),
    ],
    unjudged: [
      new Unjudged({
        criterion: 'Everything else in the guide',
        why:
          'LETI covers embodied carbon, demand response, metering and post-occupancy ' +
          'verification. None of those is a thing an hourly energy model answers, and only ' +
          'the two intensity targets above are reproduced here.',
      }),
    ],
    caveat:
      'A target-only standard is the honest limit of this sheet: it can tell you whether a ' +
      'number was reached, and nothing whatever about whether the building that reached it ' +
      'would be worth occupying.',
  }),

  new Preset({
    id: 'tm59',
    name: 'TM59, overheating in dwellings',
    kind: 'standard',
    issuer: 'Chartered Institution of Building Services Engineers',
    source: 'TM59 (2026)',
    blurb:
      'The only standard in this list that asks about the summer. It sets no wall and no ' +
      'window — TM59 has no opinion whatever about a construction — and instead prescribes who ' +
      'is in the room, what they have switched on and when, because a criterion about ' +
      'overheating is meaningless over gains somebody made up. Weekends are worked like ' +
      'weekdays and infiltration goes to zero, both because the method says so.',
    specs: [
      new Spec({
        key: 'roomType',
        value: TM59_ROOM,
        why:
          'TM59:2026 Appendix E prescribes a setup per room, and this desk is one zone, so it can ' +
          'hold exactly one of the thirteen. The double bedroom is the space both Stage 1 criteria ' +
          'are asked of — criterion a covers bedrooms among the habitable rooms, criterion b covers ' +
          'bedrooms alone — so it is the one room type under which the pair the count is taken over ' +
          'is read over a space the method applies both of them to. Move it and the register\'s chip ' +
          'drops by itself; the preset is an overlay and this is a setting, not a claim about your ' +
          `building.\n${cite(TM59_PROFILE, `${TM59_PROFILE.occupiedHours} summer occupied hours`)}`,
      }),
      new Spec({
        key: 'peopleCount',
        value: TM59_PROFILE.people,
        why:
          `${cite(TM59_PROFILE, 'Occupancy,')}\nThe peak headcount, which the occupancy pattern below ` +
          'is a fraction of. A count and not a density, and that is load bearing rather than a ' +
          'preference: a density would need the floor area, Massing is a channel no preset may write, ' +
          'and a figure derived from the plate would silently change meaning the moment the reader ' +
          'moved a wall. Two people stay two people.',
      }),
      new Spec({
        key: 'activity',
        value: TM59_PROFILE.sensible + TM59_PROFILE.latent,
        why:
          `Table E.2 gives the person as ${TM59_PROFILE.sensible} W sensible and ` +
          `${TM59_PROFILE.latent} W latent at the peak. This desk states one figure, total heat, so ` +
          `the two are added: ${TM59_PROFILE.sensible} + ${TM59_PROFILE.latent} = ` +
          `${TM59_PROFILE.sensible + TM59_PROFILE.latent} W per person. The split itself cannot be ` +
          'prescribed here and is not being: the People object\'s sensible heat fraction is left at ' +
          'Autocalculate, ' +
          'so EnergyPlus divides the total back into sensible and latent by its own correlation ' +
          'against the zone air temperature, which will not land on 75 and 55 at every hour.',
      }),
      new Spec({
        key: 'occPattern',
        value: patternText('occPattern', TM59_PROFILE.occupied),
        why:
          `${cite(TM59_PROFILE, 'Occupancy,')}\nWritten as twenty-four fractions of that peak ` +
          'headcount, hour by hour, because a from/to band cannot say what this profile says. It ' +
          `stands at ${OCC_LEVELS.length} different levels in one day — ${OCC_LEVELS.join(', ')} — ` +
          'and a band can only state when the room is used, never at what fraction. It is also the ' +
          `denominator every criterion is read against: ${OCC_STANDING} of the day's twenty-four ` +
          `hours stand above zero, which over the ${SEASON.days} days of 1 May to 30 September is ` +
          `the ${TM59_PROFILE.occupiedHours} summer occupied hours CL:2026 publishes for a space of ` +
          'this kind.',
      }),
      new Spec({
        key: 'equipPeak',
        value: TM59_PROFILE.equipPeak,
        why:
          `${cite(TM59_PROFILE, 'Equipment,')}\nThe peak in watts, absolute, for the same reason the ` +
          'headcount is: W/m² would be a reading of the Massing channel a preset is forbidden to ' +
          'write. The base gain is not a second control — it rides the pattern below as a fraction of ' +
          'this figure.',
      }),
      new Spec({
        key: 'equipPattern',
        value: patternText('equipPattern', TM59_PROFILE.equipment),
        why:
          `${cite(TM59_PROFILE, 'Equipment,')}\n${cite(TM59_PROFILE, 'Table E.2')}\nSo the base gain ` +
          'rides this pattern rather than a control of its own, which is where a standing load has ' +
          `to live on a face that carries only fractions: ${EQUIP_BASE} of the peak, written at the ` +
          `${controlFor('equipPattern').control.digits} decimals this control holds as ` +
          `${EQUIP_BASE_TEXT}.`,
      }),
      new Spec({
        key: 'lighting',
        value: TM59_PROFILE.lighting,
        why:
          `${cite(TM59_PROFILE, 'Lighting,')}\nThe one prescribed figure on this list that needs no ` +
          'conversion at all: TM59 states the lighting per square metre of usable floor area and the ' +
          'Gains strip\'s own control is W/m². Its hours are not on this control — they are the ' +
          'pattern below.',
      }),
      new Spec({
        key: 'lightPattern',
        value: patternText('lightPattern', LIGHTING_PATTERN),
        why:
          `${cite(TM59_PROFILE, 'Lighting,')}\nOn its own band, and this is the fourth and hardest of ` +
          'the ways TM59\'s gains do not fit the desk as it was: the lights run 18:00 to 23:00 ' +
          'whatever the room is doing, so one schedule shared by the people, the lights and the ' +
          'equipment cannot carry the method however it is drawn. Hence three patterns rather than ' +
          'one occupied band.',
      }),
      new Spec({
        key: 'weekend',
        value: 'Occupied',
        why:
          'TM59:2026 §3.7.1: "The same profiles should be applied throughout the year for both ' +
          'weekends and weekdays." That is a setting of this selector rather than a fact about the ' +
          'schedule writer, so it is written as one and the reader is free to disagree with it. ' +
          'Holidays are left where they are: at "As weekend" no For: Holidays row is written and the ' +
          'catch-all covers them with the same profile, which is what §3.7.1 asks for.',
      }),
      new Spec({
        key: 'infiltration',
        value: 0,
        why:
          'CL:2026 §2 sets infiltration to zero for new-build homes, and it is a modelling assumption ' +
          'the desk should not fight: TM59 is a design-stage method and the leakage of a building ' +
          'nobody has built yet is not a measurement. At the Sealed stop this desk writes no ' +
          'infiltration object at all rather than one carrying a rate of nothing. Purpose-provided ' +
          'ventilation is a different question and this preset leaves it, and the choice of air ' +
          'model, exactly where the reader put them.',
      }),
    ],
    // Gains and Air, and nothing else. TM59 prescribes what is in the room and
    // how it leaks and has no view whatever on the wall, the window or the
    // plant, which is what makes it applicable to a building already on the
    // sheet without taking the design away.
    engages: ['gains', 'air'],
    // `above` is left null on all five, unlike the fixed-line overheating
    // targets above. It carries one scalar threshold and none of these has one:
    // criterion a's line moves every day with the outdoor running mean, and
    // criterion b's Tn is 26 °C or 27 °C depending on which category the row is
    // read at. The threshold rides the `Criterion` and `Category` declarations
    // instead, which is where the sheet letters it from.
    targets: [
      new Target({
        id: 'tm59-a-I',
        label: `${CRITERION_BY_ID.a.label} · ${CATEGORY_BY_ID.I.label}`,
        metric: 'tm59a',
        needs: 'season',
        category: CATEGORY_BY_ID.I,
        limit: CRITERION_BY_ID.a.limit,
        unit: CRITERION_BY_ID.a.unit,
        asks: CRITERION_BY_ID.a.asks,
        note:
          `Applies to: ${CRITERION_BY_ID.a.applies} ` +
          `${CATEGORY_BY_ID.I.label} presumes: ${CATEGORY_BY_ID.I.presumes} ` +
          `The limit is not a fixed temperature: ${CRITERION_BY_ID.a.thresholdFrom} ` +
          `Read and lettered beside Category II and standing outside the sheet's own count, whose ` +
          `scope is ${COUNT_SCOPE}.`,
      }),
      new Target({
        id: 'tm59-a-II',
        label: `${CRITERION_BY_ID.a.label} · ${CATEGORY_BY_ID.II.label}`,
        metric: 'tm59a',
        needs: 'season',
        category: CATEGORY_BY_ID.II,
        limit: CRITERION_BY_ID.a.limit,
        unit: CRITERION_BY_ID.a.unit,
        asks: CRITERION_BY_ID.a.asks,
        note:
          `Applies to: ${CRITERION_BY_ID.a.applies} ` +
          `${CATEGORY_BY_ID.II.label} presumes: ${CATEGORY_BY_ID.II.presumes} ` +
          `The limit is not a fixed temperature: ${CRITERION_BY_ID.a.thresholdFrom} ` +
          `One of the two lines the sheet's count is taken over: ${COUNT_SCOPE}.`,
      }),
      new Target({
        id: 'tm59-b-I',
        label: `${CRITERION_BY_ID.b.label} · ${CATEGORY_BY_ID.I.label}`,
        metric: 'tm59b', digits: 0,
        needs: 'season',
        category: CATEGORY_BY_ID.I,
        limit: CRITERION_BY_ID.b.limit,
        unit: CRITERION_BY_ID.b.unit,
        asks: CRITERION_BY_ID.b.asks,
        note:
          `Applies to: ${CRITERION_BY_ID.b.applies} ` +
          `${CATEGORY_BY_ID.I.label} presumes: ${CATEGORY_BY_ID.I.presumes} ` +
          `${CRITERION_BY_ID.b.thresholdFrom} ` +
          `Read and lettered beside Category II and standing outside the sheet's own count, whose ` +
          `scope is ${COUNT_SCOPE}.`,
      }),
      new Target({
        id: 'tm59-b-II',
        label: `${CRITERION_BY_ID.b.label} · ${CATEGORY_BY_ID.II.label}`,
        metric: 'tm59b', digits: 0,
        needs: 'season',
        category: CATEGORY_BY_ID.II,
        limit: CRITERION_BY_ID.b.limit,
        unit: CRITERION_BY_ID.b.unit,
        asks: CRITERION_BY_ID.b.asks,
        note:
          `Applies to: ${CRITERION_BY_ID.b.applies} ` +
          `${CATEGORY_BY_ID.II.label} presumes: ${CATEGORY_BY_ID.II.presumes} ` +
          `${CRITERION_BY_ID.b.thresholdFrom} ` +
          `The other of the two lines the sheet's count is taken over: ${COUNT_SCOPE}. It is a count ` +
          'of nights rather than a share of hours, and it clears at four or fewer.',
      }),
      new Target({
        id: 'tm59-c',
        label: CRITERION_BY_ID.c.label,
        metric: 'tm59c',
        needs: 'season',
        limit: CRITERION_BY_ID.c.limit,
        unit: CRITERION_BY_ID.c.unit,
        asks: CRITERION_BY_ID.c.asks,
        note:
          `Applies to: ${CRITERION_BY_ID.c.applies} ${CRITERION_BY_ID.c.thresholdFrom} It carries no ` +
          'category, because 26 °C is the line for both. It is read on every run alongside criterion ' +
          'a and neither is chosen for the reader: which of the two governs turns on how much of the ' +
          'occupied period the openings are held shut, which is a fact about a window model this ' +
          'desk does not carry. It stands outside the count, which is the naturally ventilated ' +
          'Stage 1 pair.',
      }),
    ],
    unjudged: [
      new Unjudged({
        criterion: `${CRITERION_BY_ID.d.label}, communal areas (${CRITERION_BY_ID.d.clause})`,
        why: `${CRITERION_BY_ID.d.asks} ${CRITERION_BY_ID.d.unreadable}`,
      }),
      new Unjudged({
        criterion: 'The communal space\'s prescribed gains (Appendix E, Table E.1)',
        why:
          'Table E.1 gives the communal space an occupancy "Assumed to be zero" and equipment of ' +
          '"Heating system gains only", and quantifies neither, which is why it is the one row of ' +
          'the table this page carries no profile for. What that gain actually is in a real block — ' +
          'the losses of whatever heating distribution runs through the corridor — is a ' +
          'fact about a plant this model does not hold at all: there is no communal system here, no ' +
          'pipework, and no corridor for either to run through.',
      }),
      new Unjudged({
        criterion: 'Which category this dwelling is (TM59:2026 §2.4.1)',
        why:
          `${CATEGORY_BY_ID.I.presumes} Whether a dwelling is one of those is a fact about who will ` +
          'live in it, and nothing on this desk records an occupant beyond a headcount. So no ' +
          'category is selected, both are read on every run, and each row says what it presumes. The ' +
          `count the sheet letters is taken over ${COUNT_SCOPE}, and Category I stands beside it ` +
          'rather than in it — a reading, not a verdict about applicability.',
      }),
      new Unjudged({
        criterion: 'The mandated weather file (WFR:2026 §3)',
        why: qualification('weather-file').because,
      }),
      new Unjudged({
        criterion: 'The room-by-room assessment (TM59:2026 §2.3)',
        why: qualification('one-zone').because,
      }),
      new Unjudged({
        criterion: 'The staged assessment (TM59:2026 §2.3, Appendix B)',
        why:
          'Stage 1 is the assessment every dwelling must pass, with no site-specific constraints ' +
          'modelled, and it is read against criteria a and b for the rooms inside the dwelling and ' +
          'criterion d for the communal areas. Criteria b and c are the Stage 2 or Stage 3 pair, ' +
          'used where opening constraints keep the ventilation devices shut for 50 % or more of the ' +
          'occupied hours. This desk can establish that it is at Stage 1 and can establish nothing ' +
          'about the other two, so what is lettered above is one stage of a sequence, and passing it ' +
          'is not the sequence.',
      }),
      new Unjudged({
        criterion: 'Whether these windows could actually be opened',
        why:
          'What puts a dwelling past Stage 1 is a site constraint holding its openings shut, and ' +
          'whether one exists is a fact about a site: what the noise outside the window is, whether ' +
          'the opening can be left secure, whether it is safe to leave open at all. This desk ' +
          'records none of them. An opening here is a window-to-wall ratio and an openable fraction ' +
          'and it opens whenever the rule on the Air strip says so, so the desk cannot tell whether ' +
          'the naturally ventilated criterion or the mechanically ventilated one is the one that ' +
          'governs. Both are read; neither is chosen for the reader.',
      }),
      new Unjudged({
        criterion: 'Elevated air speed and any ceiling-fan allowance',
        why:
          'TM59:2026 §2.4.2 is explicit that no ceiling-fan uplift is permitted against criterion b. ' +
          'What the method allows against the others is not something this sheet could act on ' +
          'either way: there is no fan on this desk, no air-speed control and no elevated-air-speed ' +
          'adjustment anywhere in the readings, so every threshold above is read at still air. A ' +
          'design that would rely on moving air to be comfortable is read here as though it did not.',
      }),
    ],
    caveat:
      'Applying this puts the desk into the prescribed setup for one space. It does not make the ' +
      'run a TM59 assessment and nothing on the scoreboard may be read as one: the method is ' +
      'assessed room by room against the worst room, on a mandated weather file, through a staged ' +
      'sequence, and this is one zone on whatever file you attached at Stage 1 only. It also sets ' +
      'no fabric, no glazing and no plant, which is not an oversight — TM59 states no criterion ' +
      'about any of them, and the whole question the method asks is what the building you already ' +
      'drew does in the summer.',
  }),

  new Preset({
    id: 'heavyweight',
    name: 'The shaded heavyweight',
    kind: 'parti',
    blurb:
      'The old warm-climate answer, before there was plant to answer with: mass to carry ' +
      'the day\'s heat, deep shade on the openings, and the building opened up at night to ' +
      'throw the heat back out. Free-running, so the plate reads what the fabric alone can do.',
    specs: [
      new Spec({ key: 'wallMass', value: 0.3, why: '300 mm of masonry set inboard of the insulation.' }),
      new Spec({ key: 'slab', value: 0.25, why: 'A slab thick enough to have a day\'s worth of storage in it.' }),
      new Spec({ key: 'slabMaterial', value: 'Heavy', why: 'Concrete, for the density the storage lives in.' }),
      new Spec({ key: 'internalMass', value: 1.5, why: 'Partitions and furniture, at one and a half times the floor.' }),
      new Spec({ key: 'wallAbs', value: 0.3, why: 'Lime-washed rather than dark: reflect what you can before it arrives.' }),
      new Spec({ key: 'roofAbs', value: 0.25, why: 'A cool roof, which is the cheapest of every move on this list.' }),
      new Spec({ key: 'ohS', value: 1.2, why: 'Deep enough to cut the summer sun and shallow enough to let the winter one under.' }),
      new Spec({ key: 'ohE', value: 0.6, why: 'An east overhang does little against a low morning sun, but it is not nothing.' }),
      new Spec({ key: 'ohW', value: 0.6, why: 'Nor does a west one. The fins are what actually work here.' }),
      new Spec({ key: 'fin', value: 0.8, why: 'Side fins at every jamb, which is what catches the low sun an overhang cannot.' }),
      new Spec({ key: 'ventilation', value: 6, why: 'Six air changes of openable area — a building that can actually be opened.' }),
      new Spec({ key: 'ventType', value: 'Natural', why: 'Driven by stack and wind, with no fan anywhere in it.' }),
      new Spec({ key: 'ventMinIndoor', value: 22, why: 'Open only when the inside is already warm enough to be worth cooling.' }),
      new Spec({ key: 'ventMaxOutdoor', value: 20, why: 'And only when the outside is genuinely cooler.' }),
      new Spec({ key: 'ventDeltaT', value: 2, why: 'Below two degrees of difference the draught costs more than the flush is worth.' }),
    ],
    engages: ['mass', 'air', 'shading'],
    bypasses: ['system'],
    caveat:
      'This sheet\'s own arrangement, not a published standard. It cites nothing because ' +
      'there is nothing to cite — it is a building idea, drawn quickly so it can be argued ' +
      'with.',
  }),

  new Preset({
    id: 'curtainwall',
    name: 'The all-glass floor',
    kind: 'parti',
    blurb:
      'The thing everything else is measured against: a fully glazed speculative office ' +
      'plate, clear double glazing on all four sides, nothing hung in front of it, and a ' +
      'system left to answer for the consequences.',
    specs: [
      new Spec({ key: 'wwrN', value: 0.7, why: 'A curtain wall spandrel takes about 30 % whichever way it faces.' }),
      new Spec({ key: 'wwrE', value: 0.7, why: 'The same on the east.' }),
      new Spec({ key: 'wwrS', value: 0.7, why: 'The same on the south, which is where it costs most.' }),
      new Spec({ key: 'wwrW', value: 0.7, why: 'And the same on the west, which is where it costs second most.' }),
      new Spec({ key: 'aperture', value: 'Full', why: 'Floor to ceiling, because that is what is being sold.' }),
      new Spec({ key: 'glazingModel', value: 'Simple', why: 'Bought by the number on the product sheet.' }),
      new Spec({ key: 'uFactor', value: 1.6, why: 'An ordinary low-e double unit, not a bad one.' }),
      new Spec({ key: 'shgc', value: 0.35, why: 'A solar-control coating, which is the only shading in the scheme.' }),
      new Spec({ key: 'visT', value: 0.6, why: 'What is left of the daylight after that coating.' }),
      new Spec({ key: 'ohN', value: 0, why: 'No overhang. That is the point of the parti.' }),
      new Spec({ key: 'ohE', value: 0, why: 'Nor here.' }),
      new Spec({ key: 'ohS', value: 0, why: 'Nor on the south, which is what makes this worth solving.' }),
      new Spec({ key: 'ohW', value: 0, why: 'Nor here.' }),
      new Spec({ key: 'fin', value: 0, why: 'And nothing at the jambs.' }),
      new Spec({ key: 'infiltration', value: 0.4, why: 'A curtain wall is well sealed; it is the only thing about this that is.' }),
    ],
    // The Shading channel stays in the path with nothing on it, rather than
    // being patched out. Patching out is a diagnostic move — hear this path
    // alone — and this is not a diagnosis, it is a design decision: the
    // building has no shading. Set to zero the drawing shows bare glass, which
    // is the truth of the parti; patched out it would show the same thing for
    // a different and misleading reason.
    engages: ['air', 'gains', 'system'],
    caveat:
      'This sheet\'s own arrangement, not a published standard. It exists to be the thing ' +
      'the other four are read against.',
  }),
]);

export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));

/* ══ the assertions ══════════════════════════════════════════════════════ */

/*
 * Run at module load, so a preset that cannot be applied cannot ship. This is
 * the same move `permalink.js` makes with its reserved keys: the alternative is
 * a value that fails validation in front of a reader who did nothing wrong,
 * some minutes after the page loaded, with no way to tell whose mistake it was.
 */
/*
 * The one assertion in this file about a channel a preset may *not* write.
 *
 * TM59's gains are absolute — two people and 80 W in this room, not a density
 * and a W/m² — and `peopleCount` and `equipPeak` exist on the Gains strip for
 * exactly that reason. They have to stay absolute. A preset that turned a
 * published 450 W into a W/m² would be reading the Massing channel it is
 * forbidden to write, and the figure would then change meaning the moment the
 * reader moved a wall, silently and in the wrong direction: the density stays
 * where it was put and the watts in the room do not. That protection is the
 * `UNTOUCHABLE` list and
 * nothing else, so the list is asserted rather than documented and hoped for —
 * relax it and the area-derived version of these specs becomes writable, with
 * no symptom until somebody writes it.
 */
for (const id of ['massing', 'site', 'context', 'solver', 'run']) {
  if (!UNTOUCHABLE.includes(id)) {
    throw new Error(
      `the ${CHANNEL_BY_ID[id].name} channel has been taken off UNTOUCHABLE, and a preset that can ` +
      'write it can hand the reader a different building rather than a specification for theirs',
    );
  }
}
for (const channel of CHANNELS.filter((c) => c.prices)) {
  if (!UNTOUCHABLE.includes(channel.id)) {
    throw new Error(
      `the priced ${channel.name} channel has been taken off UNTOUCHABLE, and a preset that turns a ` +
      'tariff would move the bill without moving the building',
    );
  }
}

/*
 * The desk's room-type vocabulary and the profile library's have to be one
 * vocabulary.
 *
 * `controlFor` and `refuses` below would catch this anyway, as "sets roomType
 * to a value that is not one of its options", which is a true sentence about
 * the wrong file: the fault is not in the preset, it is that two declarations
 * of the same list of spaces have drifted apart, and only one of them carries
 * the published profiles. Named here so the throw says which two and what to do
 * about it.
 */
{
  const { control } = controlFor('roomType');
  if (!control.options.some((o) => o.value === TM59_ROOM)) {
    throw new Error(
      `the Room type selector does not offer "${TM59_ROOM}". TM59:2026 Appendix E tabulates ` +
      `${PROFILE_IDS.length} spaces and src/tm59.data.js carries a profile for each of them, but the ` +
      `selector offers ${control.options.map((o) => `"${o.value}"`).join(', ')}. One spelling of a ` +
      'space or the desk and the library disagree about what the reader chose: TM59_SPACES in ' +
      'controls.js is to be PROFILE_IDS from tm59.data.js.',
    );
  }
}

for (const preset of PRESETS) {
  const seen = new Set();
  for (const spec of preset.specs) {
    if (seen.has(spec.key)) {
      throw new Error(`${preset.id} sets ${spec.key} twice`);
    }
    seen.add(spec.key);
    const { channel, control } = controlFor(spec.key); // throws naming an unowned key
    if (UNTOUCHABLE.includes(channel.id)) {
      throw new Error(`${preset.id} sets ${spec.key}, which belongs to the ${channel.name} channel`);
    }
    const reason = refuses(control, spec.value);
    if (reason) throw new Error(`${preset.id} sets ${spec.key} to a value that ${reason}`);
  }
  for (const [ids, word] of [
    [preset.engages, 'engages'],
    [preset.bypasses, 'bypasses'],
  ]) {
    for (const id of ids) {
      const channel = CHANNEL_BY_ID[id];
      if (!channel?.bypassable) throw new Error(`${preset.id} ${word} "${id}", which is not a bypassable channel`);
      if (UNTOUCHABLE.includes(id)) throw new Error(`${preset.id} ${word} the ${channel.name} channel`);
    }
  }
  for (const id of preset.engages) {
    if (preset.bypasses.includes(id)) throw new Error(`${preset.id} both engages and bypasses "${id}"`);
  }
  // A preset that puts a channel in the path while specifying something that
  // blocks it — engaging Blinds and setting the Simple glazing model in the
  // same breath — would apply cleanly and then be refused by `applyModel`,
  // with the strip stating a precondition the reader never chose to break.
  // Checked against the preset laid over the issued drawing, which is the one
  // desk it can be checked against; over the reader's own it is their business.
  const over = applyPreset(DEFAULT_PARAMETERS, DEFAULT_BYPASS, preset);
  const engaged = (id) => !over.bypass[id];
  for (const id of preset.engages) {
    const { requires } = CHANNEL_BY_ID[id];
    if (requires && !requires.test(over.params, engaged)) {
      throw new Error(`${preset.id} engages "${id}", which its own settings then block: ${requires.reason}`);
    }
  }
}

/* ══ applying, and reading back ══════════════════════════════════════════ */

/**
 * Lay a preset over a desk. Returns fresh maps; nothing is mutated.
 *
 * An overlay, not a reset: keys the preset says nothing about keep the value
 * they had. That is the difference between "build this to Passivhaus" and
 * "throw this away and start from Passivhaus", and it is the whole reason the
 * feature is worth having.
 */
export function applyPreset(params, bypass, preset) {
  const next = { ...params };
  for (const spec of preset.specs) next[spec.key] = spec.value;
  const patch = { ...bypass };
  for (const id of preset.engages) patch[id] = false;
  for (const id of preset.bypasses) patch[id] = true;
  return { params: next, bypass: patch };
}

/**
 * Whether a desk is currently built to a preset, read off the desk.
 *
 * Not a flag set when the button was pressed. There is nowhere in this page a
 * "current standard" is stored, and there must not be: the reader can nudge a
 * wall resistance a second after applying Passivhaus, and a remembered flag
 * would go on claiming a specification the building no longer meets. Asking
 * the parameters is both simpler and incapable of lying — the same reasoning
 * that has the axonometric read its vertices out of the document.
 *
 * Returns every clause and whether it holds, so the interface can say *which*
 * one drifted rather than only that something did.
 */
export function conformance(params, bypass, preset) {
  const clauses = [
    ...preset.specs.map((spec) => ({
      kind: 'spec',
      spec,
      // `labelFor`, not the control's own label: a plan key is one control
      // owning four walls, so every overhang in a parti would otherwise be
      // lettered "Overhang projection" four times over with nothing to say
      // which wall each row was about.
      label: labelFor(spec.key),
      wants: spec.format(),
      has: formatValue(spec.key, params[spec.key]),
      met: params[spec.key] === spec.value,
    })),
    ...preset.engages.map((id) => ({
      kind: 'patch',
      label: CHANNEL_BY_ID[id].name,
      wants: 'in the path',
      has: bypass[id] ? 'out of the path' : 'in the path',
      met: !bypass[id],
    })),
    ...preset.bypasses.map((id) => ({
      kind: 'patch',
      label: CHANNEL_BY_ID[id].name,
      wants: 'out of the path',
      has: bypass[id] ? 'out of the path' : 'in the path',
      met: bypass[id],
    })),
  ];
  const adrift = clauses.filter((c) => !c.met);
  return {
    // A preset with no clauses at all — LETI — is not "conforming", it is a
    // question with no specification behind it, and saying it conforms would
    // be the emptiest true statement on the page. `null` is neither.
    built: clauses.length === 0 ? null : adrift.length === 0,
    clauses,
    adrift,
  };
}

/**
 * The one line of a standard that is furthest from being met, for a desk that
 * has chosen to chase it.
 *
 * The scoreboard shows every criterion of every standard at once, which is the
 * right thing to read *after* a run and the wrong thing to watch *during* a
 * drag: a dozen rows a screen away cannot answer "is what I am doing right now
 * helping". So a chased standard is reduced to its single worst line, drawn up
 * beside the drawing where the hand is.
 *
 * Ranked by the **ratio** to the limit rather than the raw difference, which is
 * the only ranking that survives criteria of different sizes: LETI's energy
 * line is 55 kWh/m²·yr and Passivhaus's heating line is 15, so being 3 over
 * means something very different against each, while being 20 % over means the
 * same thing against both.
 *
 * `readingFor` is injected rather than imported so this module stays free of
 * the run: the harness hands it a plain lookup, the sheet hands it the real
 * reader. Returns null when not one line of the standard has a reading behind
 * it — an absence for the caller to explain, never a verdict of its own.
 */
export function chaseVerdict(preset, readingFor) {
  const lines = preset.targets
    .filter((target) => target.limit != null)
    .map((target) => ({ target, value: readingFor(target) }))
    .filter((line) => Number.isFinite(line.value));
  if (!lines.length) return null;
  const ratio = (line) => line.value / line.target.limit;
  const worst = lines.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
  return {
    target: worst.target,
    value: worst.value,
    over: worst.value - worst.target.limit,
    clears: lines.filter((line) => line.value <= line.target.limit).length,
    read: lines.length,
    // How many the standard states in total, so a verdict drawn from three
    // lines out of five cannot read as a verdict on the standard.
    stated: preset.targets.filter((target) => target.limit != null).length,
  };
}

/* ══ schemes you kept ════════════════════════════════════════════════════ */

/**
 * What a saved scheme was reading when it was saved.
 *
 * Held as numbers rather than as a `Bill`, because a bill carries live
 * references — its currency is an object identity `comparable()` tests — and a
 * thing that goes through `JSON.stringify` into a browser's storage and comes
 * back cannot carry an identity. So the comparison rules are restated here on
 * the flat data: same currency *code*, same end uses, same kind of run. Two
 * schemes that fail any of those are not differenced at all, exactly as the
 * bill refuses to difference a design day against a year.
 *
 * Every field is nullable and null means *not measured*, never zero. A scheme
 * saved before the engine ever ran carries a measure of nothing but its own
 * shape, and its row in the register says so rather than printing a column of
 * noughts.
 */
export class Measure {
  constructor({
    annual = false, hours = null, uses = null, currency = null,
    metered = null, cost = null, carbon = null,
    eui = null, tedi = null, cedi = null, low = null, high = null,
    peakHeat = null, peakCool = null,
  } = {}) {
    this.annual = annual;
    this.hours = hours;
    this.uses = uses; // the end-use ids on the bill, in order
    this.currency = currency; // the ISO code, not the Currency object
    this.metered = metered;
    this.cost = cost;
    this.carbon = carbon;
    this.eui = eui;
    this.tedi = tedi;
    this.cedi = cedi;
    this.low = low;
    this.high = high;
    // The loads, kept beside the energy because comparing two schemes on what
    // they cost to run while saying nothing about what they cost to install is
    // half an argument. Unlike the intensities these survive a design-day run,
    // so a kept scheme carries them from the first solve.
    this.peakHeat = peakHeat;
    this.peakCool = peakCool;
    Object.freeze(this);
  }

  /** Whether anything at all was measured — a run had landed when this was kept. */
  get solved() {
    return this.hours != null;
  }

  /**
   * Whether these two can be differenced. Same refusal the bill makes, on the
   * same grounds: a design day against a year, or dollars against euros, is
   * not a comparison, and a saving that is really an absence is worse than no
   * column at all.
   */
  comparableWith(other) {
    if (!other?.solved || !this.solved) return false;
    if (this.annual !== other.annual) return false;
    if (this.currency !== other.currency) return false;
    return (this.uses ?? []).join() === (other.uses ?? []).join();
  }
}

/**
 * One kept idea: a name, when it was kept, the scheme itself and what it read.
 *
 * The scheme is stored as its permalink fragment and nothing else. That is the
 * single most useful decision in this module: the save format is the share
 * format, so a scheme survives a page that has since grown a channel by the
 * migration ledger already written in `permalink.js`, it can be pasted into a
 * message without any export step, and there is exactly one codec to keep
 * honest.
 */
export class Scheme {
  constructor({ id, name, hash, savedAt, station = null, measure = null, label = null }) {
    this.id = id;
    this.name = name;
    this.hash = hash;
    this.savedAt = savedAt;
    this.station = station; // the place name as it was lettered, for the row
    this.label = label; // the shape, in the sheet's own words
    this.measure = measure instanceof Measure ? measure : new Measure(measure ?? {});
    Object.freeze(this);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hash: this.hash,
      savedAt: this.savedAt,
      station: this.station,
      label: this.label,
      measure: { ...this.measure },
    };
  }
}

/**
 * How many schemes the shelf holds.
 *
 * A cap rather than an eviction. Dropping the oldest to make room for the
 * newest is precisely the silent fallback this codebase refuses everywhere
 * else: the reader would lose a scheme they had chosen to keep, and find out
 * only by going to look for it. A full shelf says it is full and names what to
 * do about it.
 */
export const SHELF_LIMIT = 24;

const STORE_KEY = 'shoebox.schemes.v1';

/**
 * The shelf, over whatever storage it is handed.
 *
 * Storage is a constructor argument rather than a reach for `localStorage`, so
 * the module stays DOM-free and a Node harness can drive the whole lifecycle
 * against a `Map`. It also makes the one genuinely awkward case explicit:
 * storage can be absent (a browser with site data switched off) or refuse a
 * write (quota), and both have to reach the interface as sentences rather than
 * as a save that quietly did not happen.
 */
export class Shelf {
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Every kept scheme, newest first. Throws when the shelf cannot be read,
   * naming what was wrong with it — a corrupt entry is not an empty shelf, and
   * showing an empty one would read as "you never saved anything".
   */
  list() {
    if (!this.storage) throw new Error('this browser is not letting the page keep anything');
    let raw;
    try {
      raw = this.storage.getItem(STORE_KEY);
    } catch (error) {
      throw new Error(`the shelf could not be read: ${error.message}`);
    }
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('the shelf is not readable as JSON — it may have been written by something else');
    }
    if (!Array.isArray(parsed)) throw new Error('the shelf is not a list of schemes');
    return parsed.map((row, i) => {
      if (!row?.id || !row?.name || typeof row.hash !== 'string') {
        throw new Error(`the scheme in position ${i + 1} is missing its name or its link`);
      }
      return new Scheme(row);
    });
  }

  /** Write the list back whole. Throws on a refused write; never swallows one. */
  write(schemes) {
    if (!this.storage) throw new Error('this browser is not letting the page keep anything');
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(schemes.map((s) => s.toJSON())));
    } catch (error) {
      throw new Error(`the shelf could not be written: ${error.message}`);
    }
  }

  /** Keep one, newest first. Throws when the shelf is full, rather than evicting. */
  add(scheme) {
    const kept = this.list();
    if (kept.length >= SHELF_LIMIT) {
      throw new Error(
        `the shelf holds ${SHELF_LIMIT} schemes and is full — delete one to make room, ` +
        'or copy its link out first',
      );
    }
    const next = [scheme, ...kept];
    this.write(next);
    return next;
  }

  remove(id) {
    const next = this.list().filter((s) => s.id !== id);
    this.write(next);
    return next;
  }

  rename(id, name) {
    const next = this.list().map((s) => (s.id === id ? new Scheme({ ...s.toJSON(), name }) : s));
    this.write(next);
    return next;
  }
}
