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
} from './controls.js';

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
  constructor({ id, label, metric, limit = null, above = null, unit, asks, note = null }) {
    this.id = id;
    this.label = label;
    // Which reading answers it: 'tedi', 'cedi', 'eui' off the meters, or
    // 'overheat' off the hourly zone temperature.
    this.metric = metric;
    this.limit = limit;
    this.above = above; // the threshold, for an exceedance-frequency target
    this.unit = unit;
    this.asks = asks; // the criterion in the standard's own words
    this.note = note;
    Object.freeze(this);
  }

  /** Whether a reading clears the line, or null when there is no line. */
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
 * Two published standards, one outcome standard, and two of this sheet's own
 * partis. The order is the order an argument goes in: the thing everybody
 * names first, its retrofit sibling, the target-only guide, then the two
 * buildings to measure them against.
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
    ],
    unjudged: [
      new Unjudged({
        criterion: 'Heating load ≤ 10 W/m², the alternative to the demand criterion',
        why: 'This sheet totals meters monthly and never reads a peak, so it cannot see a load.',
      }),
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
