/**
 * The shoebox in a sentence, read off the document that was solved.
 *
 * The finding under the plate says what the run means. This says what the run
 * was *of* — the building the reader drew, in the order an architect would
 * describe it: where it stands, what the box is, and then the two or three
 * moves that make this desk different from the one the page shipped with.
 *
 * Two rules hold it up, and they are the same two the rest of the sheet keeps:
 *
 * - **Everything measurable is read off the `IDFDocument`.** Areas, ratios,
 *   overhangs and the way each wall faces come through `geometryFacts`, not off
 *   `params`, so a wall that took a clamp on its way into the model is
 *   described as it was built rather than as it was asked for. Only the
 *   settings that reach no geometry — a setpoint, a leakage rate, an
 *   illuminance — are read off the parameters, and those are read off the
 *   *snapshot* the run was started from.
 * - **Nothing is said that is not measured.** No typology (a density of
 *   12 m²/person is a number, not "an office"), no assembly names (an R-value
 *   is not "a cavity wall"), and no verdict: "well insulated" has no
 *   measurement behind it and no benchmark on this page to earn it.
 *
 * What to say is decided by difference. A desk has ninety-odd controls and a
 * paragraph has room for three, so the moves are ranked by how far each sits
 * from its own default — which is the same identity diff `encodeState` takes to
 * decide what a permalink has to carry, for the same reason: what the reader
 * changed is what the reader designed.
 *
 * DOM-free, like `readings.js` and `permalink.js`, so the Node harness can
 * assert the sentences over a document it built itself.
 */

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS, controlFor } from './controls.js';
import { WALLS, geometryFacts } from './model.js';

/**
 * A quantity, which the sheet letters in its mono face.
 *
 * The unit rides beside it as plain text rather than inside it, the way the
 * finding's own numbers do: `13.2` in the pen, "°C" in the sentence.
 */
const q = (text) => ({ q: String(text) });

/** Words in a clause, counting each quantity as one, for the budget below. */
const weigh = (tokens) =>
  tokens.reduce((n, t) => n + (typeof t === 'string' ? t.trim().split(/\s+/).filter(Boolean).length : 1), 0);

/** One control's number, at the digits its own declaration prints it to. */
const num = (key, value) => q(value.toFixed(controlFor(key).control.digits));

/** One control's option, as the console letters it. */
const option = (key, value) => controlFor(key).control.format(value).toLowerCase();

const hhmm = (hour) => `${String(hour).padStart(2, '0')}:00`;

/**
 * Which surface of the box each compass name belongs to.
 *
 * `geometryFacts().faces` is keyed by the wall's declared side and the
 * document's links are keyed by surface name, so one of the two has to be
 * translated. Taken off `WALLS`, which is the one list that carries both.
 */
const WALL_BY_SIDE = new Map(WALLS.map((w) => [w.side, w.name]));

/* ══ how far a desk has been moved ═══════════════════════════════════════ */

/**
 * How far these keys stand from their defaults, as a fraction of their travel.
 *
 * A `Scale` and a `Facade` both know their own range, so a slider taken to the
 * end of it outranks one nudged; a selector has no range and scores a flat
 * amount that puts a changed one above a nudge and below a slider thrown. The
 * point is only to order clauses against each other — a paragraph with room
 * for three of them has to choose, and choosing by declaration order would put
 * the site's terrain above an ideal unit.
 */
function moved(params, keys) {
  let most = 0;
  for (const key of keys) {
    const value = params[key];
    const base = DEFAULT_PARAMETERS[key];
    if (value === base) continue;
    const { control } = controlFor(key);
    if (typeof control.fraction === 'function') {
      most = Math.max(most, Math.abs(control.fraction(value) - control.fraction(base)));
    } else if (control.kind === 'bearing') {
      // Shortest way round the rose, so 350° is ten degrees off north rather
      // than the whole compass away from it.
      most = Math.max(most, Math.abs(((value - base + 540) % 360) - 180) / 180);
    } else {
      most = Math.max(most, 0.7);
    }
  }
  return most;
}

/**
 * What a channel being in or out of the path is worth against a slider.
 *
 * Every one of these outranks anything `moved` can return, because bypass
 * *removes* objects from the document: a mechanism the reader added is a
 * different building, where a slider is the same building at a different
 * number. A pane emissivity taken the whole way across its range scores 1.00
 * and used to bump an ideal unit out of the sentence, which had the paragraph
 * describing the glass of a building whose heating it never mentioned.
 *
 * They are ordered against each other as well, and the order is by how much of
 * the sheet each one changes rather than by where it is declared: taking a
 * channel out is the loudest thing the desk can do, the system decides what the
 * finding underneath is even about, and the grounds lighting is a load beside
 * the building rather than in it.
 */
const FLIP = Object.freeze({
  removed: 1.6,
  system: 1.5,
  air: 1.4,
  gains: 1.35,
  blinds: 1.3,
  daylight: 1.25,
  context: 1.2,
  grounds: 1.15,
});

/**
 * Whether a channel has been put in or taken out since the sheet arrived.
 */
function flipped(state, id) {
  const engaged = Boolean(state.get(id)?.engaged);
  const wasEngaged = !DEFAULT_BYPASS[id];
  if (engaged === wasEngaged) return null;
  return engaged ? 'in' : 'out';
}

/* ══ the compass ═════════════════════════════════════════════════════════ */

const POINTS = Object.freeze([
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
]);

/**
 * Which way a wall looks, in the words a description uses.
 *
 * The word alone while the building stands square, because "south" is then
 * exact and a bearing beside it is noise. Turned, the word is a rounding of up
 * to 22°, so the bearing itself follows it in the pen — the reader is told
 * which way the glass faces and can check it, and the sheet never letters a
 * compass point it has not measured.
 */
function facing(bearing) {
  if (!Number.isFinite(bearing)) return null;
  const word = POINTS[Math.round(bearing / 45) % 8];
  const square = Math.abs(((bearing + 45) % 90) - 45) < 0.5;
  return square ? [word] : [word, ' (', q(`${bearing.toFixed(0)}°`), ')'];
}

/**
 * A layered unit in the words the strip already uses for it.
 *
 * The pane count carries landmarks with a `phrase` apiece — "a double unit",
 * "a triple unit" — so the sentence reads the declaration rather than saying
 * "double glazing" out of a literal here, which is exactly what it did until
 * the count could be more than two and the paragraph went on calling a triple
 * a double.
 *
 * A count with no landmark on it is lettered as the count. That is not a
 * fallback for a value this cannot get: it is the same number said plainly,
 * which stays true if the slider is ever widened past the cases anyone has
 * named.
 */
function unitOf(panes) {
  const named = controlFor('panes').control.landmarkAt(panes);
  return named ? [named.phrase] : [q(String(panes)), ' panes'];
}

/**
 * The surfaces that have been shut, in the words a drawing uses for them.
 *
 * A slab on ground is a path that never sleeps and reads as its own move; an
 * adiabatic wall or roof is the model saying there is another heated space on
 * the far side of it. Both are read off the boundary the document holds rather
 * than off the key that set it, and the default desk — four exposed walls, an
 * exposed roof and a floating slab — says nothing at all.
 */
function closures(facts) {
  const shut = facts.faces.filter((f) => f.boundary === 'adiabatic');
  const parts = [];

  if (shut.length === facts.faces.length && facts.faces.length > 0) {
    parts.push(['every wall adiabatic']);
  } else if (shut.length) {
    parts.push([
      'the ',
      series(shut.map((f) => facing(f.bearing))),
      shut.length > 1 ? ' walls adiabatic' : ' wall adiabatic',
    ]);
  }
  if (facts.roofBoundary === 'adiabatic') parts.push(['an adiabatic roof']);
  if (facts.floorBoundary === 'ground') parts.push(['a slab on ground']);
  return parts.length ? series(parts) : [];
}

/* ══ the clauses ═════════════════════════════════════════════════════════ */

/** Clauses joined the way a sentence joins them: commas, then "and". */
function series(clauses) {
  const parts = [];
  for (const [i, clause] of clauses.entries()) {
    if (i) parts.push(i === clauses.length - 1 ? ' and ' : ', ');
    parts.push(clause);
  }
  return parts;
}

/** The box: how many storeys of what, and how big the box is. */
function massing(facts) {
  // Named rather than assumed: the plan dimensions are two particular walls'
  // own lengths, and a document that has lost one of them cannot be described
  // by guessing at the other.
  if (facts.faces.length < 2) throw new Error('the model has fewer than two walls to measure the plan by');
  const [a, b] = [facts.faces[0].length, facts.faces[1].length];
  const plan =
    Math.abs(a - b) < 0.005
      ? [q(a.toFixed(2)), ' m square']
      : [q(a.toFixed(2)), ' by ', q(b.toFixed(2)), ' m on plan'];
  const tall = [' and ', q(facts.height.toFixed(2)), facts.storeys > 1 ? ' m to a storey' : ' m tall'];
  return facts.storeys > 1
    ? [q(facts.storeys), ' floors of ', q(facts.floor.toFixed(1)), ' m² each, ', plan, tall]
    : ['A single storey of ', q(facts.floor.toFixed(1)), ' m², ', plan, tall];
}

/**
 * The openings and what hangs over them.
 *
 * Every figure here is measured off the document rather than taken from the
 * slider that asked for it, which is the only way the sentence can be trusted
 * on a desk where a channel may have been patched out from under a control: a
 * building with Glazing bypassed reads as solid, because it is.
 */
function envelope(params, facts) {
  const glazed = facts.faces.filter((f) => f.ratio > 0.0005);
  const parts = [];

  if (!glazed.length) {
    parts.push(facts.grossRoofGlazing > 0 ? 'solid on every wall' : 'solid on every face');
  } else if (glazed.length === facts.faces.length && glazed.every((f) => Math.abs(f.ratio - glazed[0].ratio) < 0.005)) {
    parts.push('glazed ', q(glazed[0].ratio.toFixed(2)), ' all round');
  } else {
    const order = [...glazed].sort((x, y) => y.ratio - x.ratio);
    parts.push('glazed ', series(order.map((f) => [q(f.ratio.toFixed(2)), ' ', facing(f.bearing)])));
  }

  // Overhangs are described by the reach that was built, and only where one
  // was: an overhang set on a solid wall reaches no object in the document at
  // all, which is the same fact the Shading strip greys that wall's study for.
  const shaded = facts.faces.filter((f) => f.overhang > 0.005);
  if (shaded.length === 1) {
    parts.push(' under a ', q(shaded[0].overhang.toFixed(2)), ' m overhang');
  } else if (shaded.length > 1) {
    const same = shaded.every((f) => Math.abs(f.overhang - shaded[0].overhang) < 0.005);
    parts.push(
      ' under ',
      same ? q(shaded[0].overhang.toFixed(2)) : q(Math.max(...shaded.map((f) => f.overhang)).toFixed(2)),
      same ? ' m overhangs' : ' m of overhang at the deepest',
    );
  }
  if (params.fin > 0 && facts.shadeArea > 0) parts.push(', fins ', num('fin', params.fin), ' m at every jamb');

  if (facts.grossRoofGlazing > 0) {
    parts.push(
      ', and ',
      q(facts.grossRoofGlazing.toFixed(1)),
      ' m² of rooflights at SRR ',
      q(facts.srr.toFixed(3)),
    );
  }
  return parts;
}

/**
 * Everything else the reader put in the path, as candidate clauses.
 *
 * Each returns what it has to say and how far the desk was moved to say it.
 * Producing them all and ranking afterwards is what keeps the order the
 * building's rather than this file's: a night flush the reader dialled in
 * outranks a terrain they nudged, whichever way round they are declared.
 */
// Each terrain as a terrain, which is what the setting is: it picks the wind
// profile the exterior film coefficients are computed against and says nothing
// about the view. "In a city" was tried and read as a location — two sentences
// into a paragraph that had already named the station, which is the one thing
// a site clause here must not be mistaken for. The suburb is the default and
// so is never printed, but it is named here so the table is total.
const TERRAIN = Object.freeze({
  Country: 'open country terrain',
  Suburbs: 'suburban terrain',
  City: 'city terrain',
  Ocean: 'ocean terrain',
});

/**
 * The ideal unit as the document holds it, not as the desk asked for it.
 *
 * *Available* is not a setting the unit takes alongside two setpoints: at "Heat
 * only" `applySystem` writes a `ThermostatSetpoint:SingleHeating` naming the
 * heating schedule and nothing else, so the cooling setpoint reaches no object
 * in the model at all. Read off `params.availability` this clause said "an
 * ideal unit holding 20.0–26.0 °C" over a run in which nothing whatever held
 * 26 °C — the sheet stating a number the engine was never given, which is the
 * one thing this paragraph exists not to do. So the thermostat object is what
 * decides the verb, and the setpoint that reaches it is the only one said.
 *
 * The availability schedule is read the same way and for a sharper version of
 * the same reason: "Occupied" falls back to the plant simply being on when
 * Gains is out of the path, so a clause taken off the parameter would promise
 * occupied hours on a desk whose unit runs all of them.
 */
function unit(doc, params) {
  const holds = (type) => doc.all(type).size > 0;
  const ideal = doc.all('ZoneHVAC:IdealLoadsAirSystem').first;
  const schedule = ideal ? String(ideal.availability_schedule_name) : 'AlwaysOn';
  const hours = schedule === 'AlwaysOn' ? [] : [' in occupied hours'];

  if (holds('ThermostatSetpoint:SingleHeating')) {
    return ['an ideal unit heating to ', num('heatSet', params.heatSet), ' °C', hours];
  }
  if (holds('ThermostatSetpoint:SingleCooling')) {
    return ['an ideal unit cooling to ', num('coolSet', params.coolSet), ' °C', hours];
  }
  if (holds('ThermostatSetpoint:DualSetpoint')) {
    return [
      'an ideal unit holding ',
      num('heatSet', params.heatSet),
      '–',
      num('coolSet', params.coolSet),
      ' °C',
      hours,
    ];
  }
  throw new Error('the System channel is in the path with no thermostat setpoint object in the document');
}

/**
 * The scheduled model in a clause: a rate stated, and a flush that gates it.
 *
 * Reached only where the document holds one of the two objects, which is what
 * lets the rates themselves be lettered off the snapshot: `applyScheduled`
 * writes `params.infiltration` and `params.ventilation` into the fields
 * verbatim and writes nothing at all where either is zero, so the object's
 * presence is the guarantee that the number beside it reached the engine. It
 * is the arrangement `unit` already uses for the setpoints, and the reason
 * both are gated on an object rather than on a parameter.
 *
 * The old `no air exchange` reading has moved into `airflow` below, where it
 * belongs: a desk with both rates at zero and a desk with the channel patched
 * out hand the engine the same document, and the sentence about them must not
 * depend on which of the two the reader arrived at it by. So neither rate
 * standing here is no longer a case to letter at all — it is the document and
 * the snapshot it was written from disagreeing, which is said rather than
 * papered over.
 */
function schedule(params) {
  const leak = params.infiltration > 0 ? [num('infiltration', params.infiltration), ' ACH of leakage'] : [];
  const flush =
    params.ventilation > 0
      ? ['a night flush of ', num('ventilation', params.ventilation), ' ACH above ', num('ventMinIndoor', params.ventMinIndoor), ' °C']
      : [];
  const both = [leak, flush].filter((c) => c.length);
  if (!both.length) {
    throw new Error('the document holds a scheduled air object that the snapshot it was written from has no rate for');
  }
  return series(both);
}

/**
 * The pressure network in a clause, read off what it reached.
 *
 * The rule comes off `ventilation_control_mode` in the document, so a mode the
 * applier did not write cannot be described; the openable walls come off the
 * linkages the applier actually made, so a wall whose glass is gone is not
 * claimed as an opening. The computed rate is deliberately not here: this
 * paragraph is captured before the await, off the snapshot the run was written
 * from, and a reading taken after it would be describing one building over
 * another building's chart. The rate is the strip's readout and the finding's
 * to say.
 */
function network(doc, params, facts) {
  const parts = ['a pressure network at ', num('envLeak', params.envLeak), ' ACH'];

  // Every opening the network actually linked, by the wall the document says
  // hosts it — and the wall is named by its own outward normal, so a building
  // turned 40° has its south wall lettered south-east.
  const hosts = new Set(
    doc
      .all('AirflowNetwork:MultiZone:Surface')
      .toArray()
      .map((link) => doc.get('FenestrationSurface:Detailed', String(link.surface_name)))
      .filter(Boolean)
      .map((w) => String(w.building_surface_name)),
  );
  const open = facts.faces.filter((f) => hosts.has(WALL_BY_SIDE.get(f.side)));
  if (open.length) {
    parts.push(
      ', openable ',
      open.length === facts.faces.length ? ['all round'] : ['on the ', series(open.map((f) => facing(f.bearing)))],
    );
    const rule = doc.all('AirflowNetwork:MultiZone:Zone').first;
    const mode = rule ? String(rule.ventilation_control_mode) : null;
    if (mode && mode !== 'NoVent') parts.push(' on ', option('openRule', mode).toLowerCase());
  }
  return parts;
}

/**
 * Which air model produced the flow, read off the objects it left behind.
 *
 * Three readings, and the third is the one this function was written for. The
 * desk declares two air models and `applyAir` writes one of them, but it writes
 * neither when the channel is out of the path — and the channel ships out, so
 * the commonest desk on this page is a box that exchanges no air with anything
 * at all. That was silent for as long as the clause was gated on the channel
 * being engaged, which is bearable while the sheet letters temperatures and is
 * not bearable now that it letters a comfort criterion over them: the adaptive
 * route is a statement about a building whose openings answer the weather, and
 * read over a sealed box it is a different claim wearing the same name. So the
 * paragraph says which flow the criteria were read over, including when the
 * answer is none.
 *
 * Read off the document rather than off `params` or off the patch bay, by the
 * rule the thermostat clause already follows: a setting is described by the
 * object it reached. Three desks reach the same objects here and therefore have
 * to read the same — the channel patched out, the channel blocked by its own
 * `requires`, and the channel engaged with both scheduled rates at zero all
 * hand the engine a document with no air-exchange object in it, and the engine
 * cannot tell them apart either.
 *
 * The types are asked of `doc.types()` before `doc.all()`, because `all()` goes
 * through the document's own `collection()` and *inserts* an empty collection
 * for a type it has never seen, at the position of the question — which moves
 * every later object of that type up the file for no reason a reader of the IDF
 * could ever work out. Every type asked for here is swept by `applyAir` or
 * `applySystem` on each apply and so is registered long before this runs, but
 * the guarded form cannot introduce the hazard and costs nothing.
 */
function airflow(doc, params, facts) {
  const standing = (type) => doc.types().includes(type) && doc.all(type).size > 0;

  if (standing('AirflowNetwork:SimulationControl')) return network(doc, params, facts);
  if (standing('ZoneInfiltration:DesignFlowRate') || standing('ZoneVentilation:DesignFlowRate')) {
    return schedule(params);
  }

  // Nothing crosses the envelope. Whether that is the whole story depends on
  // the unit: an ideal load carrying a `DesignSpecification:OutdoorAir` is
  // supplying the room mechanically, and "no air exchange" over that desk would
  // be flatly untrue — the one thing this paragraph exists not to be. It is
  // also the distinction the comfort routes are drawn on, a mechanically
  // ventilated home being judged by a different criterion from a naturally
  // ventilated one, so the object is worth the clause rather than only worth
  // the caveat. Read as the document holds it and not off `params.outdoorAir`,
  // since `applySystem` writes it only where the System channel is in the path.
  const spec = standing('DesignSpecification:OutdoorAir') ? doc.all('DesignSpecification:OutdoorAir').first : null;
  if (!spec) return ['no air exchange in the model'];

  // The method decides which field carries the rate, and this sheet only ever
  // writes one of them. Named rather than assumed: a specification written per
  // square metre answers `outdoor_air_flow_per_person` just as readily as one
  // written per person does, with whatever the schema leaves in a field the
  // engine is not reading, and a clause lettering that figure would be a rate
  // about nothing standing beside a building it was never applied to.
  const method = String(spec.outdoor_air_method);
  if (method !== 'Flow/Person') {
    throw new Error(`the outdoor air specification is written per ${method}, which this sentence has no words for`);
  }
  // The field is m³/s and the console is lettered in litres per second per
  // person, which is how an architect reads a ventilation rate; the digits are
  // the control's own, so the sentence and the strip letter one figure.
  const rate = Number(spec.outdoor_air_flow_per_person) * 1000;
  if (!Number.isFinite(rate)) throw new Error('the outdoor air specification carries no flow per person to letter');
  return ['nothing through the envelope beyond ', num('outdoorAir', rate), ' L/s per person of mechanical outdoor air'];
}

function moves(doc, params, facts, state) {
  const on = (id) => Boolean(state.get(id)?.engaged);
  const out = [];
  const say = (id, weight, tokens) => {
    if (weight > 0 && tokens.length) out.push({ id, weight, tokens });
  };

  // Site. The turn is worth saying even though every wall above now carries
  // its own bearing: those say where the glass ended up, this says that the
  // reader turned the building to put it there.
  say('turn', moved(params, ['northAxis']), ['the plan turned ', q(`${params.northAxis.toFixed(0)}°`)]);
  say('terrain', moved(params, ['terrain']), [TERRAIN[params.terrain] ?? []]);
  // Minimal shadowing is the one solar setting that quietly unbuilds
  // something the drawing shows, so it is worth a clause of its own wherever
  // there is a shade for it to ignore.
  if (params.solarDist === 'MinimalShadowing' && facts.grossShadeArea > 0) {
    say('solar', 0.9, ['shadowing set to minimal, so no shade on this sheet reaches the run']);
  }

  // Fabric and mass. Both are engaged on the desk as it ships, so what is
  // reported is the numbers being off their defaults — unless the channel
  // itself has gone, which is the larger fact and reads as one.
  if (flipped(state, 'fabric') === 'out') {
    say('fabric', FLIP.removed, ['every surface adiabatic']);
  } else {
    const wall = params.wallR !== DEFAULT_PARAMETERS.wallR;
    const roof = params.roofR !== DEFAULT_PARAMETERS.roofR;
    const both = [
      wall ? ['walls at R ', num('wallR', params.wallR)] : null,
      roof ? [wall ? 'roof R ' : 'the roof at R ', num('roofR', params.roofR)] : null,
    ].filter(Boolean);
    say('fabric', moved(params, ['wallR', 'roofR']), series(both));
  }

  // Which surfaces have an outside at all, which is a statement about what
  // this building *is* rather than about how well it is built: three exposed
  // walls and a party wall is one bay of a longer building, and a paragraph
  // that only ever said what was glazed would describe that fourth wall as
  // solid — true of the drawing, and silent about the reason. Read off the
  // document, so it says what the engine was handed however the boundary got
  // there. Ranked above any slider and below a channel flip: the surfaces are
  // all still in the path, but what is on the other side of them has changed.
  say('boundaries', 1.1, closures(facts));

  if (flipped(state, 'mass') === 'out') {
    say('mass', FLIP.removed, ['the slab swapped for a massless layer']);
  } else {
    const slab =
      params.slab !== DEFAULT_PARAMETERS.slab || params.slabMaterial !== DEFAULT_PARAMETERS.slabMaterial
        ? ['a ', q((params.slab * 1000).toFixed(0)), ' mm ', option('slabMaterial', params.slabMaterial), ' slab']
        : [];
    const inner = params.internalMass > 0 ? ['internal mass at ', num('internalMass', params.internalMass), ' × the floor'] : [];
    say('mass', moved(params, ['slab', 'slabMaterial', 'internalMass']), series([slab, inner].filter((c) => c.length)));
  }

  // The glass itself, and only where there is glass in the document to have a
  // specification: a U-factor quoted for a building with no window is a number
  // about nothing.
  // The wall glazing model, and only where the document holds glass built of
  // it: rooflights on their own unit carry `skyU` and `skySHGC` instead, so a
  // U-factor quoted off a roof-only desk would be a number about a construction
  // no surface in the model is made of.
  if (facts.grossGlazing > 0 || (facts.grossRoofGlazing > 0 && params.skyGlass === 'Walls')) {
    if (params.glazingModel === 'Layered') {
      say('glass', moved(params, ['glazingModel', 'panes', 'paneEmiss', 'gapWidth']), [
        // The coating leads rather than trailing on a "with" of its own: the
        // moves sentence opens on one, and "With a triple unit with a low-e
        // 0.04 inboard pane" is a preposition doing two jobs in nine words.
        params.paneEmiss < DEFAULT_PARAMETERS.paneEmiss
          ? ['a low-e coating of ε ', num('paneEmiss', params.paneEmiss), ' on ', unitOf(params.panes)]
          : unitOf(params.panes),
      ]);
    } else {
      say('glass', moved(params, ['uFactor', 'shgc', 'visT']), [
        'glass at U ',
        num('uFactor', params.uFactor),
        ' W/m²K and SHGC ',
        num('shgc', params.shgc),
      ]);
    }
  }

  // Air, gains, daylight, blinds, system, grounds and the neighbours all start
  // out of the path, so having them at all is the move; the numbers ride along
  // in the same clause because a mechanism named without its setting is not a
  // description of anything.
  //
  // Air is the one of them that speaks in its absence as well, since a
  // criterion read over a sealed box is a different claim from the same
  // criterion read over a building that breathes, and the weight is the same
  // whichever of the three readings `airflow` returns. `FLIP.air` is unchanged
  // at 1.4, and **switching models is still not a flip**: it is a change within
  // an engaged channel and ranks as a scalar move would, since a paragraph that
  // ranked it above a channel appearing would describe the air model of a
  // building whose ideal unit it never mentioned. Nor is there an honest second
  // number for the absence: the clause answers one question, and ranking the
  // answer "none" below the answer "a pressure network" would make the
  // paragraph likeliest to drop the reading in exactly the case it was asked
  // for, a criterion read over a box that breathes being the case nobody needed
  // warning about.
  say('air', FLIP.air, airflow(doc, params, facts));

  if (on('gains')) {
    say('gains', FLIP.gains, [
      'gains of ',
      q((params.lighting + params.equipment).toFixed(1)),
      ' W/m² over ',
      q(hhmm(params.occFrom)),
      '–',
      q(hhmm(params.occTo)),
      ' at ',
      num('occupancy', params.occupancy),
      ' m²/person',
    ]);
  }

  if (on('daylight')) {
    say('daylight', FLIP.daylight, ['the lights dimming to ', num('dlSetpoint', params.dlSetpoint), ' lx']);
  }

  if (on('blinds')) {
    const device = option('shadeType', params.shadeType);
    const trigger =
      params.shadeControl === 'AlwaysOn'
        ? [', always down']
        : params.shadeControl === 'OnIfHighSolarOnWindow'
          ? [' dropping above ', num('shadeSetpoint', params.shadeSetpoint), ' W/m² on the glass']
          : [
              ' dropping above ',
              num('shadeSetpoint', params.shadeSetpoint),
              params.shadeControl === 'OnIfHighZoneAirTemperature' ? ' °C in the zone' : ' °C outdoors',
            ];
    say('blinds', FLIP.blinds, ['an ', device, ' blind', trigger]);
  }

  if (on('system')) {
    say('system', FLIP.system, [
      unit(doc, params),
      params.setback > 0 ? [', set back ', num('setback', params.setback), ' K out of hours'] : [],
    ]);
  }

  if (on('context') && facts.contextArea > 0) {
    const altitude = (Math.atan2(params.ctxHeight, params.ctxDistance) * 180) / Math.PI;
    say('context', FLIP.context, [
      'a neighbour ',
      q(`${altitude.toFixed(0)}°`),
      ' up to the ',
      facing(params.ctxAzimuth),
    ]);
  }

  if (on('grounds')) {
    say('grounds', FLIP.grounds, [num('extLights', params.extLights), ' kW of grounds lighting']);
  }

  return out;
}

/* ══ the paragraph ═══════════════════════════════════════════════════════ */

/** How much of the desk the moves sentence will carry. */
const MOVES = 3;
const MOVE_WORDS = 36;

/**
 * The order the chosen clauses are read in, which is not the order they were
 * chosen in.
 *
 * Ranking decides *which* three moves are worth a paragraph; this decides how
 * they read once chosen, and they are different questions. Left in rank order
 * the sentence composed by luck — "a neighbour 63° up to the south, with
 * shadowing set to minimal, so nothing on the sheet shades anything and in a
 * city" — because a prepositional site clause, a mechanism and a caveat about
 * the whole run do not join in any order you please. Site first, then the
 * fabric, then what was added to the path, and the caveat last, where a caveat
 * goes.
 */
const READING_ORDER = Object.freeze([
  'terrain', 'turn', 'boundaries', 'fabric', 'mass', 'glass', 'air', 'gains', 'daylight',
  'blinds', 'system', 'context', 'grounds', 'solar',
]);

/**
 * Describe the desk that was solved.
 *
 * `doc` is the document the engine was handed and `params` the snapshot it was
 * written from — both taken in the same breath as the IDF, so a slider turned
 * during an annual run cannot have the sentence describing one building over
 * another building's chart. `place` is the station in the two words this
 * sentence needs; it arrives already read rather than looked up here, so this
 * module stays free of the network and the DOM alike.
 */
export function describeDesk({ doc, params, state, place = null }) {
  if (!state) throw new Error('describeDesk needs the channel state the model was applied with');
  const facts = geometryFacts(doc);
  const tokens = [];

  if (place?.name) {
    tokens.push('In ', place.name, place.zone ? [', ASHRAE zone ', q(place.zone), '. '] : '. ');
  }

  tokens.push(massing(facts), ', ', envelope(params, facts), '. ');

  // The three the reader moved furthest, said in one sentence. Ranked rather
  // than listed: everything here is true of the building, and a paragraph that
  // ran to all of it would be a table with the numerals hidden in prose.
  const chosen = [];
  let words = 0;
  for (const move of moves(doc, params, facts, state).sort((a, b) => b.weight - a.weight)) {
    const cost = weigh(move.tokens.flat(Infinity));
    if (chosen.length >= MOVES || words + cost > MOVE_WORDS) continue;
    chosen.push(move);
    words += cost;
  }
  chosen.sort((a, b) => READING_ORDER.indexOf(a.id) - READING_ORDER.indexOf(b.id));
  // Every clause above is written as a noun phrase so that one lead-in governs
  // all of them however they land — "with 0.50 ACH of leakage, gains of 16.0
  // W/m² … and an ideal unit holding 20.0–26.0 °C". Written as predicates they
  // read as a sentence only while there are two of them, and the desk that
  // changed exactly one thing is not a rare desk.
  if (chosen.length) tokens.push('with ', series(chosen.map((move) => move.tokens)), '. ');

  const flat = tokens.flat(Infinity).filter((t) => t !== '');

  // The clauses are written to be joined in any order, so whichever move
  // ranked first arrives with its sentence still in lower case. A sentence
  // that opens on a quantity — "3 floors of …" — wants no capital and simply
  // spends the turn.
  let opening = true;
  for (const [i, token] of flat.entries()) {
    if (opening && typeof token === 'string') flat[i] = token[0].toUpperCase() + token.slice(1);
    opening = typeof token === 'string' ? token.endsWith('. ') : false;
  }
  return flat;
}
