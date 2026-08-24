/**
 * The console's declaration: what may be set, and what each setting means.
 *
 * This file is the one place a control exists. `model.js` reads it to write the
 * IDF, `console.js` reads it to draw the panel, and the sheet's five dimension
 * sliders are a named subset of it — so the drawing, the desk and the document
 * cannot disagree about what a control is called or what range it has.
 *
 * Nothing here touches an `IDFDocument`. These are descriptions; the appliers
 * that act on them live in `model.js`, next to the geometry they need.
 */

/* ══ controls ════════════════════════════════════════════════════════════ */

/**
 * A setting the console can draw and the model can apply.
 *
 * `key` is the property it owns on the flat parameter object. Everything the
 * panel needs to letter a row — the name, the unit, how the number reads — is
 * carried here rather than looked up somewhere else at draw time.
 */
class Control {
  constructor({ key, label, value, note = null, needs = null }) {
    if (!key) throw new Error('a control needs a key');
    this.key = key;
    this.label = label;
    this.value = value;
    this.note = note;
    // A predicate on the whole parameter set. False means this control is not
    // doing anything right now — the strip greys it and says why rather than
    // letting you turn something that is not connected to the model.
    this.needs = needs;
  }

  /** How this control's value reads in the margin. Overridden per kind. */
  format(v) {
    return String(v);
  }
}

/**
 * How many decimals a step is written to, which is the resolution any value
 * of that control may honestly carry.
 */
const decimalsOf = (step) => (String(step).split('.')[1] ?? '').length;

/**
 * A number typed into the margin, brought onto the control's own face.
 *
 * Clamped to the stops and snapped to the step, because the face is what the
 * value means here: a projection of 4 m on a control that stops at 3 is not a
 * building this desk can draw, and a value off the step grid would sit between
 * two positions the slider can return to. Neither is a silent substitution —
 * the box re-letters itself from the model the instant the edit lands, so what
 * was made of what you typed is the next thing you read.
 *
 * The rounding at the end is not cosmetic. Binary floating point turns
 * `0 + 3 * 0.05` into 0.15000000000000002, and that number would ride the
 * permalink and be written into the IDF exactly as it stands.
 */
function onFace(control, n) {
  const held = Math.min(control.max, Math.max(control.min, n));
  const stops = Math.round((held - control.min) / control.step);
  return Number((control.min + stops * control.step).toFixed(decimalsOf(control.step)));
}

/**
 * Read a value back out of a quantity's own lettering.
 *
 * The inverse of `format`, and deliberately strict: `null` for anything that
 * is not a number, so the field can put the model's value back rather than
 * invent one out of "abc". The unit is accepted because it is what the box
 * says when it is not being typed in, and a reader who selects all and
 * retypes "12 m" means 12 m. The zero word is accepted for the same reason —
 * "None" is what that stop reads as, so it has to be a thing you can say.
 */
function readQuantity(control, text) {
  const said = String(text).trim();
  if (!said) return null;
  if (control.zero && said.toLowerCase() === control.zero.toLowerCase()) {
    return onFace(control, 0);
  }
  const unit = control.unit.toLowerCase();
  const bare = unit && said.toLowerCase().endsWith(unit)
    ? said.slice(0, said.length - unit.length).trim()
    : said;
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? onFace(control, n) : null;
}

/**
 * A named stretch of a scale — the repère a number is read against.
 *
 * A calibration face set in W/m²K is a number before it is a decision. 1.8
 * means nothing until it means *a low-e double unit*, and 5.8 means nothing
 * until it means *a single sheet of glass*; an architect who knows the second
 * pair fluently can still be handed the first and have nowhere to stand. So
 * the scales carry the cases the trade already knows, ruled on the face where
 * they actually fall, and the desk letters whichever one the reading is
 * standing in as it is dragged past.
 *
 * A landmark is a **band, not a point**, because that is the shape of the
 * underlying fact: double glazing is 2.7 to 3.0 W/m²K depending on the cavity,
 * the fill and the spacer, and writing 2.8 would be inventing a precision
 * nobody published. Where the fact really is one number — an engine default, a
 * code limit — `to` is left off and the band closes to a point, which draws as
 * a single hairline rather than a stretch. The two read differently on the
 * face on purpose: a limit you may not cross and a range you might land
 * anywhere in are two different kinds of knowledge, the same distinction the
 * holiday rule draws between a tick and a hollow circle.
 *
 * `note` is required, and that is the point of the class rather than an
 * accident of it. A landmark is the interface making a claim about the world,
 * and a claim nobody can check is exactly what the rest of this sheet exists
 * not to print — so every band has to name where it came from, and the note
 * rides into the mark's `title` and the face's description where a reader can
 * reach it. A landmark with no source throws at module load, the way a `Side`
 * with a predicate and no reason does.
 */
export class Landmark {
  constructor({ from, to = null, label, phrase = null, note }) {
    if (!Number.isFinite(from)) throw new Error(`a landmark needs a value: "${label}"`);
    if (to !== null && !(to >= from)) {
      throw new Error(`"${label}" runs from ${from} to ${to}, which is backwards`);
    }
    if (!label) throw new Error(`a landmark at ${from} has no label`);
    if (!note) throw new Error(`"${label}" cites nothing — a landmark has to say where it came from`);
    this.from = from;
    this.to = to ?? from;
    this.label = label;
    // How it reads inside a sentence rather than on its own. "Between low-e
    // double and triple" wants the label uncapitalised, which is right for
    // ordinary words and wrong for a name the trade capitalises, so the
    // lowercasing is a default and never a rule.
    this.phrase = phrase ?? label.toLowerCase();
    this.note = note;
    Object.freeze(this);
  }

  /** A point, as opposed to a stretch — a code limit rather than a range. */
  get exact() {
    return this.from === this.to;
  }

  holds(v) {
    return v >= this.from && v <= this.to;
  }

  /** How the mark reads on its own, which is what its `title` carries. */
  caption(control) {
    const where = this.exact
      ? control.format(this.from)
      : `${control.format(this.from)} to ${control.format(this.to)}`;
    return `${this.label} · ${where} — ${this.note}`;
  }
}

/**
 * Read a control's landmarks, or throw naming what is wrong with them.
 *
 * Three rules, all enforced here rather than trusted, and the third of them is
 * the one that had to be found by writing the check.
 *
 * A landmark **outside the face** cannot be drawn at all, so the range has to
 * hold it — and where it does not, the *range* is usually the thing that is
 * wrong rather than the landmark.
 *
 * Two landmarks may **not overlap**. The desk letters the one a reading stands
 * in, and a value standing in two of them has no single answer; ambiguity is
 * what this page refuses everywhere else and there is no reason to start here.
 *
 * And a landmark has to be **reachable on the control's own step grid**. This
 * is the quiet one. `input[type=range]` only ever hands back `min + n·step`, so
 * a band that falls between two of those positions draws on the face, names a
 * case in its tooltip, and can never once be the reading — the reader is shown
 * a place they cannot stand. It is not hypothetical: the BLAST infiltration
 * set is A = 0.606 against a 0.01 step, the DOE-2 wind term is 0.224 against
 * 0.005, and ASHRAE's lighting allowances are imperial figures that land at
 * 6.89 and 10.76 W/m² against 0.1. All five were declared as the exact
 * published numbers, all five drew, and none of them could be reached. They
 * are declared now as the narrow band the step grid actually makes, with the
 * published figure in the note, so the rounding is stated rather than absorbed.
 */
function readLandmarks(list, control) {
  const { key, min, max, step } = control;
  // `format` is reached through the control rather than destructured with the
  // rest of them, because it is a method and reads `this.zero`, `this.digits`
  // and `this.unit`. Pulled off the object it loses its receiver, and in a
  // module — where `this` is undefined rather than the global — every call
  // below died as `Cannot read properties of undefined (reading 'zero')`
  // instead of naming the landmark that was wrong. Measured on both the range
  // and the step-grid throws: the guards still fired, and the sentences this
  // function exists to write never reached anybody.
  const format = (v) => control.format(v);
  const marks = [...list].sort((a, b) => a.from - b.from || a.to - b.to);
  let previous = null;
  for (const mark of marks) {
    if (mark.from < min || mark.to > max) {
      throw new Error(
        `${key}: "${mark.label}" lies at ${format(mark.from)}–${format(mark.to)}, outside the face's ${format(min)}–${format(max)}`,
      );
    }
    if (previous && mark.from <= previous.to) {
      throw new Error(`${key}: "${previous.label}" and "${mark.label}" overlap, so a reading could stand in both`);
    }
    // Counted in whole steps rather than by walking the grid, because walking
    // it accumulates float error over the thousand-odd positions a fine face
    // has. The epsilon is for the division, not for the physics.
    const first = Math.ceil((mark.from - min) / step - 1e-9);
    const last = Math.floor((mark.to - min) / step + 1e-9);
    if (last < first || min + first * step > max) {
      throw new Error(
        `${key}: "${mark.label}" at ${format(mark.from)}–${format(mark.to)} falls between two positions of a ${step} step, so the control can never read it`,
      );
    }
    // The same rule again, against the other thing that can make a mark
    // unreadable. A `zero` stop silences every band but the one that *is* that
    // stop, so a band lying wholly at or below it draws and can never be the
    // reading — which is how the first cut of this went wrong, quietly retiring
    // the engine's own C = 0 and B = 0 on the Air strip.
    if (control.zero && mark.to <= 0 && !(mark.exact && mark.from === 0)) {
      throw new Error(
        `${key}: "${mark.label}" lies at or below the zero stop, where "${control.zero}" is the only reading, so it can never be read`,
      );
    }
    previous = mark;
  }
  return Object.freeze(marks);
}

/**
 * A continuous quantity on a ruled face: a number, a range, and the cases that
 * range is read against.
 *
 * Shared by `Scale` and `Facade`, which are one kind of question drawn two
 * ways — one on a calibration face, four along the edges of a plan. Everything
 * below this line was written twice before the landmarks arrived and would
 * have been written a third time; a scale whose bands the plan key did not
 * know about is exactly the drift `controls.js` exists to prevent.
 */
class Ruled extends Control {
  constructor({
    key, label, value, min, max, step,
    unit = '', digits = 2, zero = null, note = null, needs = null, landmarks = [],
  }) {
    super({ key, label, value, note, needs });
    this.min = min;
    this.max = max;
    this.step = step;
    this.unit = unit;
    this.digits = digits;
    // What the low stop means, when it means something other than "a very small
    // number" — "None" at zero glazing says more than "0.00".
    this.zero = zero;
    this.landmarks = readLandmarks(landmarks, this);
  }

  format(v) {
    if (this.zero && !(v > 0)) return this.zero;
    return `${v.toFixed(this.digits)}${this.unit ? ` ${this.unit}` : ''}`;
  }

  /** Where the tick sits on the face, 0 to 1. */
  fraction(v) {
    return (v - this.min) / (this.max - this.min);
  }

  /** What a reader typing in the margin means, or null if it is not a number. */
  parse(text) {
    return readQuantity(this, text);
  }

  /**
   * The landmark a value stands in, or null. Never more than one.
   *
   * This is the one reading of where the tick stands, and every surface that
   * lights a mark or letters a band takes it from here — the face's rule, the
   * sheet slider's, the plan key's bars and the plan key's legend. Lit from
   * each mark's own `holds` instead, the four came apart at a zero stop and
   * the default Air strip drew marks at full graphite over a reading line the
   * desk had deliberately left blank.
   *
   * At a `zero` stop only a landmark *of that stop itself* stands. The
   * distinction is not fussiness, it is the difference between the two claims
   * a mark at the bottom of a face can be making. A band that merely reaches
   * zero on its way up is claiming the quantity in some amount — `infiltration`
   * has a Passive House band open at 0, and 0 ACH is not a Passive House
   * envelope, it is a sealed box — so it is suppressed, and the readout's own
   * `Sealed` is that position's only true landmark. A landmark that *is* the
   * zero point is claiming the absence itself, which is exactly what the
   * reader is looking at: `infWind` and `infStack` start at `None` because
   * C = 0 and B = 0 are the engine's own defaults, and saying so is the whole
   * value of the mark. Blanket silence here cost both of them — they could be
   * drawn and never once be read, which is the failure `readLandmarks` throws
   * over — and split the three coefficients of one equation across two
   * behaviours on one strip, since `infConstant` carries no `zero` label and
   * went on reading `DOE-2` at the same position.
   */
  landmarkAt(v) {
    const here = this.landmarks.find((mark) => mark.holds(v)) ?? null;
    if (this.zero && !(v > 0)) return here?.exact && here.from === v ? here : null;
    return here;
  }

  /**
   * Where the reading stands among the landmarks, as the desk letters it.
   *
   * Null when the control carries none, which is a real answer and not a
   * missing one: most of this desk is quantities nobody has published cases
   * for, and inventing a band so that every face has one would be the sheet
   * asserting rather than measuring.
   *
   * Null too at a stop that carries a `zero`, and that one was found by
   * reading the output rather than by reasoning about it. A `zero` label means
   * the bottom of the face is not a small quantity but the absence of one —
   * no frame, no mass, no ventilation — so "past a brick leaf" over a wall
   * with no masonry leaf in it at all is not an approximation, it is a
   * different statement. The readout beside it already says `None`, which is
   * that position's own landmark and the only true one.
   *
   * "Past" reads correctly at both ends because it is about the face and not
   * about the quantity: below the lowest band and above the highest you have
   * gone past the last case anyone named, whichever direction that is. It
   * deliberately says nothing about better or worse — a lower U-factor is
   * better and a lower COP is not, and the sheet does not grade designs.
   */
  standing(v) {
    if (!this.landmarks.length) return null;
    const here = this.landmarkAt(v);
    if (here) return here.label;
    // Past the named band, a zero stop says nothing at all. `landmarkAt` has
    // already let through the one landmark that can stand here — the engine's
    // own C = 0 — so what is left is the inferred reading, and inferring
    // "past a brick leaf" over a wall with no masonry in it is a different
    // statement rather than a rounder one.
    if (this.zero && !(v > 0)) return null;
    const above = this.landmarks.find((mark) => mark.from > v);
    const below = [...this.landmarks].reverse().find((mark) => mark.to < v);
    if (!below) return `Past ${above.phrase}`;
    if (!above) return `Past ${below.phrase}`;
    return `Between ${below.phrase} and ${above.phrase}`;
  }

  /** The whole set in one string, for the face's description. */
  landmarkSummary() {
    if (!this.landmarks.length) return null;
    return this.landmarks.map((mark) => mark.caption(this)).join('. ');
  }
}

/**
 * A continuous quantity, drawn as a ruled calibration face with a penciled tick.
 */
export class Scale extends Ruled {
  constructor(spec) {
    super(spec);
    this.kind = 'scale';
    Object.freeze(this);
  }
}

/**
 * A small set of exclusive states, drawn as one segmented rule.
 *
 * Never a dropdown: the whole point of a console is that you can read the
 * current state of every channel without opening anything.
 */
export class Selector extends Control {
  constructor({ key, label, value, options, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'selector';
    this.options = options.map((o) => Object.freeze({ ...o }));
    Object.freeze(this);
  }

  format(v) {
    const found = this.options.find((o) => o.value === v);
    if (!found) throw new Error(`${this.key} has no option ${v}`);
    return found.label;
  }
}

/**
 * The building's north point, drawn as a north arrow you can turn.
 *
 * An angle set on a linear scale is a number you have to convert in your head
 * before it means anything. Set on a rose, it is the thing itself.
 */
export class Bearing extends Control {
  constructor({ key, label, value, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'bearing';
    Object.freeze(this);
  }

  format(v) {
    const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return `${v.toFixed(0)}° ${points[Math.round(v / 22.5) % 16]}`;
  }
}

/**
 * One wall of a plan key: the parameter it owns and how it is lettered.
 *
 * A typed object rather than the loose dictionary this used to be, because a
 * side now carries a predicate as well as three strings, and a predicate with
 * no reason beside it is exactly the kind of silent state this desk refuses
 * elsewhere. `needs` is the per-wall twin of `Control.needs`: true when
 * setting this wall's number reaches the model at all. `unreached` is the
 * sentence for when it does not — the four walls of a plan key are set from
 * one control, so a single row-wide note could not say which of them is
 * inert. It is a sentence, or a function of the parameters when the wall has
 * more than one way to fall out of the model — see `reasonFor`.
 */
class Side {
  constructor({ key, side, label, needs = null, unreached = null }) {
    if (!key) throw new Error('a wall of a plan key needs a parameter key');
    if (Boolean(needs) !== Boolean(unreached)) {
      throw new Error(`${key} carries a precondition with no reason, or a reason with no precondition`);
    }
    this.key = key;
    this.side = side; // 'north' | 'east' | 'south' | 'west', as the model names it
    this.label = label; // 'N' … 'W', as the plan key letters it
    this.needs = needs;
    this.unreached = unreached;
    Object.freeze(this);
  }

  /** Whether this wall's number is reaching the model as the desk stands. */
  reaches(params) {
    return this.needs ? Boolean(this.needs(params)) : true;
  }

  /**
   * Why it is reaching nothing, in the wall's own words.
   *
   * `unreached` may be a sentence or a function of the parameters, because a
   * wall can now be inert for either of two reasons: an overhang is cut from
   * the opening it shelters, and an opening needs a wall with an outside to be
   * cut into. One sentence covering both would name the wrong cause half the
   * time, and the whole reason this lives per wall rather than per row is that
   * a note which cannot say *which* is not worth printing.
   */
  reasonFor(params) {
    const said = typeof this.unreached === 'function' ? this.unreached(params) : this.unreached;
    if (this.needs && !said) throw new Error(`${this.key} gives no reason for reaching nothing`);
    return said;
  }
}

/**
 * Four values that belong to four walls, drawn on a plan key rather than as
 * four rows.
 *
 * Window-to-wall ratio is not four numbers, it is one decision about a
 * building. Ruling each wall's scale along its own edge of a small plan is the
 * only arrangement where the number you are setting is beside the wall it
 * belongs to, and where the four read as a parti rather than a list.
 *
 * Each wall is nevertheless its own parameter, and therefore its own question:
 * a study sweeps one key, so the plan key carries four of them rather than a
 * single "the glazing" that no single number in the document corresponds to.
 */
export class Facade extends Ruled {
  constructor({ key, label, short, sides, ...ruled }) {
    // The plan key owns four keys, not one. `key` names the group.
    super({ key, label, value: null, ...ruled });
    this.kind = 'facade';
    // What one wall of it is called when it is drawn on its own, away from the
    // plan key — the sheet's narrow label column has no room for the full name.
    this.short = short ?? label;
    // Drawn in compass order, which is also the order `boxSurfaces` generates.
    this.sides = Object.freeze(sides.map((s) => new Side(s)));
    Object.freeze(this);
  }

  keys() {
    return this.sides.map((s) => s.key);
  }
}

/* ── the six surfaces ──────────────────────────────────────────────────── */

/**
 * The state a surface is in when the model stops at its inside face.
 *
 * Named once rather than written out six times because it is the only state
 * all six surfaces share: what a surface opens onto when it is *not* adiabatic
 * differs — a wall or a roof onto the weather, a floor onto the ground.
 */
export const ADIABATIC = 'Adiabatic';

/**
 * One surface of the box: what is on the other side of it.
 *
 * A two-state question, but not a `Selector`, because the second state is not
 * the same question twice: the opposite of an adiabatic floor is the ground,
 * and the opposite of an adiabatic wall is the weather. So the pair is
 * declared per surface, which is also what lets the key be drawn as one
 * gesture — a tap flips a surface between its own two states, and there is
 * never a third to choose from.
 *
 * A face carries its own default as well, which a `Facade`'s walls do not: the
 * four openings of a plan key all start from one declaration, whereas the six
 * surfaces disagree about where they start. The stock model floats its slab
 * and exposes everything else, and that is the desk this page has always
 * opened on.
 */
export class Face {
  constructor({ key, face, label, open, value }) {
    if (!key) throw new Error('a surface of the boundary key needs a parameter key');
    if (open === ADIABATIC) throw new Error(`${key} would have adiabatic as both its states`);
    if (value !== open && value !== ADIABATIC) {
      throw new Error(`${key} cannot start at ${value}, which is not one of its two states`);
    }
    this.key = key;
    this.face = face; // 'north' … 'west' | 'roof' | 'floor', as the model names it
    this.label = label; // how the key and its legend letter it
    this.open = open; // 'Outdoors', or 'Ground' under a floor
    this.value = value;
    Object.freeze(this);
  }

  /** Whether this surface is stopping the model, as the desk stands. */
  shut(v) {
    return v === ADIABATIC;
  }

  /** The other of its two states. With two, the gesture is the whole control. */
  flip(v) {
    return this.shut(v) ? this.open : ADIABATIC;
  }

  format(v) {
    if (v !== this.open && v !== ADIABATIC) throw new Error(`${this.key} has no state ${v}`);
    // The engine's own words, which are also the reader's: `Outdoors`,
    // `Ground`, `Adiabatic`. Nothing is gained by translating a term that
    // appears verbatim in the IDF the sheet will hand you.
    return v;
  }
}

/**
 * The six surfaces of the box, drawn as one key rather than six rows.
 *
 * Which surfaces are adiabatic is one decision about a building — a party
 * wall, a floor over a heated space, one bay cut out of a longer terrace — and
 * six rows reading `Adiabatic / Outdoors` would make it six unrelated
 * switches. Set on a plan with a section through the middle of it, each
 * surface is toggled at the place it stands, which is the same argument the
 * `Facade` plan key makes about the four window-to-wall ratios.
 *
 * Every face is nevertheless its own parameter: `applyFabric` writes them one
 * at a time, and a wall that has gone adiabatic has to be able to say so on
 * its own account to the channels that were going to cut an opening into it.
 */
export class Boundary extends Control {
  constructor({ key, label, faces, note = null, needs = null }) {
    // The key names the group; the six faces own the parameters, as a plan
    // key's four walls do.
    super({ key, label, value: null, note, needs });
    this.kind = 'boundary';
    this.faces = Object.freeze(faces.map((f) => new Face(f)));
    Object.freeze(this);
  }

  keys() {
    return this.faces.map((f) => f.key);
  }

  faceFor(key) {
    const found = this.faces.find((f) => f.key === key);
    if (!found) throw new Error(`no surface of ${this.key} owns "${key}"`);
    return found;
  }

  format(v) {
    if (v !== ADIABATIC && v !== 'Outdoors' && v !== 'Ground') {
      throw new Error(`${this.key} has no state ${v}`);
    }
    return v;
  }
}

/* ── the calendar ──────────────────────────────────────────────────────── */

export const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

/** Days per month, on the non-leap year an EnergyPlus weather file carries. */
export const DAYS_IN_MONTH = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

/**
 * A year of months as twelve characters, January first: `'111111111111'` is the
 * whole year, `'110000000011'` is November through February.
 *
 * A string rather than an array of booleans because a parameter has to behave
 * like a value everywhere the desk treats it as one: the permalink writes
 * `String(params[key])` and compares against the default with `!==`, and two
 * arrays holding the same twelve booleans are never `!==`-equal, so every link
 * would carry a mask nobody had set. Twelve characters also read in an address
 * bar, which is the point of the delta encoding.
 *
 * The empty mask is not a mask. A run with no months in it is a weather-file
 * run period EnergyPlus would refuse to start, so "at least one month" is part
 * of what a mask *is* rather than a rule bolted on at one of the three places
 * that set one — the control declaration, the console's gesture and the link
 * decoder all ask this question here.
 */
export const isMonthMask = (v) => typeof v === 'string' && /^[01]{12}$/.test(v) && v.includes('1');

/** The year entire, which is what the desk starts at and what a benchmark is. */
export const FULL_YEAR = '111111111111';
export const isWholeYear = (mask) => mask === FULL_YEAR;

/**
 * The unbroken groups of months in a mask, as inclusive 1-based month numbers.
 *
 * This is the whole reason the desk can offer months rather than a span: months
 * that do not touch cannot be one `RunPeriod`, and EnergyPlus is perfectly
 * happy to be handed several. Each group becomes one, in calendar order.
 *
 * December and January are deliberately *not* joined when both are set and the
 * months between them are not. A `RunPeriod` whose end date precedes its begin
 * date does wrap the turn of the year in EnergyPlus, but it would run those two
 * months as one environment out of calendar order, and every reading on this
 * sheet — the chart's month ticks, the schedule's columns, the bill's
 * environments — is lettered from the timestamps that come back. Two groups in
 * January-to-December order is the arrangement that stays legible.
 */
export function monthSpans(mask) {
  if (!isMonthMask(mask)) throw new Error(`"${mask}" is not a twelve-month mask`);
  const spans = [];
  for (let m = 0; m < 12; m += 1) {
    if (mask[m] !== '1') continue;
    if (spans.length && spans.at(-1).to === m) spans.at(-1).to = m + 1;
    else spans.push({ from: m + 1, to: m + 1 });
  }
  return spans;
}

/** The hours a mask covers, which is what the Run strip's meter counts. */
export function monthHours(mask) {
  let days = 0;
  for (let m = 0; m < 12; m += 1) if (mask[m] === '1') days += DAYS_IN_MONTH[m];
  return days * 24;
}

const spanLabel = ({ from, to }) =>
  from === to ? MONTHS[from - 1] : `${MONTHS[from - 1]}–${MONTHS[to - 1]}`;

/** `a`, `a and b`, `a, b and c` — a list a sentence can end on. */
const sentenceList = (items) =>
  items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * Which months are simulated, drawn as a twelve-cell year you set month by
 * month.
 *
 * The run period used to be two numbers on two calibration faces, which could
 * only ever describe one unbroken span and made "January and July" — the
 * two-season comparison anyone actually wants from a shoebox — impossible to
 * ask for. A year of cells can be worked with one gesture, states which months
 * are in the run without arithmetic, and can say plainly how many run periods
 * the engine is being handed, which is the part of this that is an EnergyPlus
 * fact rather than a preference.
 */
export class Calendar extends Control {
  constructor({ key, label, value, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'calendar';
    if (!isMonthMask(value)) throw new Error(`${key} starts at "${value}", which is not a mask`);
    Object.freeze(this);
  }

  format(v) {
    if (isWholeYear(v)) return 'All year';
    const spans = monthSpans(v);
    if (spans.length === 1) return spanLabel(spans[0]);
    const months = [...v].filter((c) => c === '1').length;
    return `${months} months · ${spans.length} periods`;
  }

  /** What the engine is actually being handed, in its own vocabulary. */
  periods(v) {
    const spans = monthSpans(v);
    const count = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'][spans.length - 1];
    const what = isWholeYear(v) ? 'the whole year' : sentenceList(spans.map(spanLabel));
    return `${count} run period${spans.length > 1 ? 's' : ''}: ${what}.`;
  }
}

/**
 * The occupied span of a day, drawn as a 24-hour band you sweep.
 *
 * The one control on the desk that is a shape rather than a number, and it is
 * the shape an architect actually argues about: when the building is used. It
 * writes a `Schedule:Compact`, so the band is the schedule.
 */
export class Profile extends Control {
  constructor({ key, label, from, to, note = null, needs = null }) {
    super({ key, label, value: null, note, needs });
    this.kind = 'profile';
    this.from = from; // key holding the first occupied hour
    this.to = to; // key holding the first unoccupied hour
    Object.freeze(this);
  }
}

/**
 * A list of days, drawn as a year rule with the entries listed under it.
 *
 * The value is a string, not an array, and that is a deliberate and load-bearing
 * choice. Every other parameter on the desk is a scalar, and four separate
 * mechanisms assume it: `commit`'s `params[key] !== value` guard, `encodeState`'s
 * identity diff against a frozen default, `decodeState`'s one-value-per-key rule,
 * and — the one that would have been found late and painfully — `revert`'s
 * `Object.assign(params, DEFAULT_PARAMETERS)`. `Object.freeze` is shallow, so an
 * array default would be *aliased* into live `params` by that assign, and the
 * first edit would corrupt `DEFAULT_PARAMETERS` for the rest of the session. The
 * permalink's `DEFAULTS_BY_VERSION.v1` is that same object, so the link format
 * itself would have drifted, with no symptom until a shared link came back
 * describing a different building.
 *
 * So the list is carried as text and parsed at every boundary that needs the
 * days themselves. `parseHolidays` below is that boundary.
 */
export class Days extends Control {
  constructor({ key, label, value, presets = [], max = 24, note = null, needs = null }) {
    super({ key, label, value, note, needs });
    this.kind = 'days';
    this.presets = Object.freeze([...presets]);
    // Most entries the list may hold. A cap exists because the list travels in a
    // URL fragment, and an unbounded one would make a scheme link unshareable.
    this.max = max;
    Object.freeze(this);
  }

  /**
   * Entries, not days — the honest reading with no calendar behind it.
   *
   * Days would be the better unit, and it is what the console prints the moment
   * a weather file supplies a year. But it cannot be counted from the text
   * alone: an nth weekday has no day of the year until the calendar is known,
   * and overlapping spans have to be unioned before they can be totalled. So
   * this counts what it can actually see, and names that unit so the change to
   * days later reads as a different measurement rather than a jump in the same
   * one.
   */
  format(v) {
    const entries = parseHolidays(v).length;
    if (entries === 0) return 'None';
    return `${entries} holiday${entries === 1 ? '' : 's'}`;
  }
}

/* ══ the holiday grammar ═════════════════════════════════════════════════ */

const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);
const WEEKDAY_NAMES = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);
// `MONTHS` and `DAYS_IN_MONTH` are the run period's, above, and are the same
// twelve facts. February has 28 of them and no leap year is reachable, which is
// why 29 February is a parse error below rather than a day quietly dropped.

/** How many entries a list may carry, and how long a name may be. */
const MAX_DAYS = 24;
const MAX_NAME = 40;
/**
 * A name becomes an IDF object name and is echoed into `eplus.err` by a local
 * EnergyPlus, so it stays ASCII. It also travels in a URL fragment, where every
 * accented character costs six.
 */
const NAME = /^[A-Za-z0-9 '.&-]+$/;

const FIXED = /^(\d{1,2})\/(\d{1,2})$/;
/**
 * One to four, never five.
 *
 * Every month has at least 28 days, so a first, second, third and fourth of any
 * weekday exist in every year, as does a last. A *fifth* exists only in some
 * years, and when it does not EnergyPlus does not warn and carry on — it stops:
 *
 *     ** Severe ** SetSpecialDayDates: Special Day Date, Nth Day of Month,
 *                  not enough Nths, for SpecialDay=IMPOSSIBLE DAY
 *     EnergyPlus Terminated--Fatal Error Detected.
 *
 * measured on `5th Monday in December` against a year beginning Sunday. A
 * grammar that can express a desk which fatals the engine is not a grammar this
 * page should offer, and nothing in any published calendar is a fifth weekday.
 * So the range is closed at four and the whole grammar is total: every list
 * that parses runs, under every calendar.
 */
const NTH = /^([1-4]) ([A-Za-z]{3}) in ([A-Za-z]{3})$/;
const LAST = /^Last ([A-Za-z]{3}) in ([A-Za-z]{3})$/;

/**
 * One day the run period should treat as a holiday.
 *
 * `date` is the canonical token this module reads and writes; `startDate()` is
 * the same date in EnergyPlus's own spelling, which is what goes into the IDF.
 * The two are kept apart on purpose: the canonical token is short, because it
 * travels in an address bar, and the engine's spelling is long, because the
 * stock example files spell it out and there is nothing to gain from betting on
 * the abbreviations the schema says it also accepts.
 */
export class Holiday {
  constructor({ date, duration = 1, name }) {
    this.date = date;
    this.duration = duration;
    this.name = name;
    Object.freeze(this);
  }

  /** The date as `RunPeriodControl:SpecialDays` wants it. */
  startDate() {
    const fixed = this.date.match(FIXED);
    if (fixed) return `${MONTH_NAMES[Number(fixed[1]) - 1]} ${Number(fixed[2])}`;
    const nth = this.date.match(NTH);
    if (nth) {
      const ordinal = ['1st', '2nd', '3rd', '4th', '5th'][Number(nth[1]) - 1];
      return `${ordinal} ${WEEKDAY_NAMES[WEEKDAYS.indexOf(nth[2])]} in ${MONTH_NAMES[MONTHS.indexOf(nth[3])]}`;
    }
    const last = this.date.match(LAST);
    return `Last ${WEEKDAY_NAMES[WEEKDAYS.indexOf(last[1])]} in ${MONTH_NAMES[MONTHS.indexOf(last[2])]}`;
  }
}

/**
 * Read a holiday list, or throw naming what is wrong with it.
 *
 * The grammar is
 *
 *     list   := "" | record (";" record)*
 *     record := date ["*" duration] ":" name
 *     date   := M "/" D | nth " " Www " in " Mmm | "Last " Www " in " Mmm
 *
 * with the three date forms taken from the three the 26.1 `start_date` field
 * accepts. Two shapes are deliberate. `*` carries the duration because it is one
 * of the few characters `URLSearchParams` leaves unescaped, so a shutdown costs
 * no extra length in a link. And weekdays and months are the three-letter forms
 * only, though the schema also takes the full names: exactly one spelling per
 * value is what makes `serializeHolidays(parseHolidays(s)) === s` an assertion
 * rather than a hope, and two spellings of one calendar would key two identical
 * solves through `shapeKey`.
 *
 * Every failure throws. Nothing is clamped, repaired or dropped — this list is
 * the reader's own calendar, and a holiday that silently did not make it into
 * the model would be invisible in the results it changed.
 */
export function parseHolidays(raw) {
  if (typeof raw !== 'string') throw new Error('a holiday list is text');
  if (raw === '') return Object.freeze([]);

  const days = [];
  const seen = new Set();
  const dates = new Set();
  for (const record of raw.split(';')) {
    if (record.trim() === '') throw new Error('an empty entry in the holiday list (a stray ";")');

    const cut = record.indexOf(':');
    if (cut === -1) {
      throw new Error(`"${record.trim()}" has no name — write it as "${record.trim()}: Christmas"`);
    }
    const name = record.slice(cut + 1).trim();
    if (name === '') throw new Error(`"${record.slice(0, cut).trim()}" has no name after its colon`);
    if (name.length > MAX_NAME) {
      throw new Error(`"${name}" is ${name.length} characters, and a holiday name takes at most ${MAX_NAME}`);
    }
    if (!NAME.test(name)) {
      throw new Error(`"${name}" — a holiday name takes letters, digits, spaces and ' . & - only`);
    }
    // Names become IDF object names, which must be unique. Two Christmases would
    // be rejected by the engine long after the desk had accepted them.
    const seenKey = name.toUpperCase();
    if (seen.has(seenKey)) throw new Error(`two holidays are both called "${name}"`);
    seen.add(seenKey);

    const head = record.slice(0, cut).trim();
    const star = head.indexOf('*');
    const date = star === -1 ? head : head.slice(0, star).trim();
    let duration = 1;
    if (star !== -1) {
      const tail = head.slice(star + 1).trim();
      if (!/^\d+$/.test(tail)) throw new Error(`"${head}" — a duration is a whole number of days`);
      duration = Number(tail);
      if (duration < 1 || duration > 366) {
        throw new Error(`"${head}" lasts ${duration} days, and a special day runs 1 to 366`);
      }
    }

    const canonical = readDate(date);
    // Two entries on one date is a mistake the engine will not report: the
    // schema says plainly that there is "no error message on duplicate days or
    // overlapping days", so the second would simply vanish into the first.
    if (dates.has(canonical)) throw new Error(`two holidays both start on ${canonical}`);
    dates.add(canonical);

    days.push(new Holiday({ date: canonical, duration, name }));
  }

  if (days.length > MAX_DAYS) {
    throw new Error(`${days.length} holidays listed, and the list holds at most ${MAX_DAYS}`);
  }
  return Object.freeze(days);
}

/** One date token, validated into its canonical spelling. */
function readDate(raw) {
  const fixed = raw.match(FIXED);
  if (fixed) {
    const month = Number(fixed[1]);
    const day = Number(fixed[2]);
    if (month < 1 || month > 12) throw new Error(`"${raw}" is not a date: months run 1 to 12`);
    if (day < 1 || day > DAYS_IN_MONTH[month - 1]) {
      const reason = month === 2 && day === 29
        ? 'the run period carries no year, so its February has 28 days'
        : `${MONTH_NAMES[month - 1]} has ${DAYS_IN_MONTH[month - 1]} days`;
      throw new Error(`"${raw}" is not a date: ${reason}`);
    }
    return `${month}/${day}`;
  }

  const nth = raw.match(NTH);
  if (nth) return `${nth[1]} ${weekday(nth[2], raw)} in ${month(nth[3], raw)}`;

  const last = raw.match(LAST);
  if (last) return `Last ${weekday(last[1], raw)} in ${month(last[2], raw)}`;

  if (/^\d+ /.test(raw)) {
    throw new Error(
      `"${raw}" is not a date: the nth weekday runs 1 to 4, or "Last" — a fifth does not exist in every year, and EnergyPlus stops with a severe error in the years it does not`,
    );
  }
  throw new Error(`"${raw}" is not a date: write 12/25, "4 Thu in Nov" or "Last Mon in May"`);
}

const cased = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

function weekday(word, raw) {
  const found = WEEKDAYS.indexOf(cased(word));
  if (found === -1) {
    throw new Error(`"${raw}" — "${word}" is not a weekday: write ${WEEKDAYS.join(', ')}`);
  }
  return WEEKDAYS[found];
}

function month(word, raw) {
  const found = MONTHS.indexOf(cased(word));
  if (found === -1) {
    throw new Error(`"${raw}" — "${word}" is not a month: write ${MONTHS.join(', ')}`);
  }
  return MONTHS[found];
}

/**
 * Where a holiday actually falls, given the year the run will use.
 *
 * The run period's calendar is a real one: `day_of_week_for_start_day` is left
 * empty, so EnergyPlus takes the weather file's own `DATA PERIODS` start day —
 * Sunday, on every TMYx — and picks a real non-leap year to match, 2017 for a
 * Sunday. A non-leap year is fully determined by the weekday its 1 January
 * falls on, so that weekday is all this needs: no year is passed, because none
 * is needed and naming one would invite the belief that the weather is that
 * year's.
 *
 * Returns `{ month, day, weekday, doy, ends }`, 1-indexed month and day,
 * `weekday` 0 for Sunday. `ends` is the last day the special day covers, which
 * wraps past 31 December the way EnergyPlus wraps it.
 */
export function resolveHoliday(holiday, startWeekday) {
  const doyOf = (month, day) => DAYS_IN_MONTH.slice(0, month - 1).reduce((n, d) => n + d, 0) + day;
  const weekdayOf = (doy) => (startWeekday + doy - 1) % 7;

  let month;
  let day;
  const fixed = holiday.date.match(FIXED);
  if (fixed) {
    [month, day] = [Number(fixed[1]), Number(fixed[2])];
  } else {
    const nth = holiday.date.match(NTH);
    const last = holiday.date.match(LAST);
    const want = WEEKDAYS.indexOf(nth ? nth[2] : last[1]);
    month = MONTHS.indexOf(nth ? nth[3] : last[2]) + 1;
    const firstWeekday = weekdayOf(doyOf(month, 1));
    const first = 1 + ((want - firstWeekday + 7) % 7);
    day = nth
      ? first + 7 * (Number(nth[1]) - 1)
      // The last one is the last occurrence at or before the month's end. Four
      // always exist, so stepping back from `first + 28` cannot underflow.
      : first + 7 * Math.floor((DAYS_IN_MONTH[month - 1] - first) / 7);
  }

  const doy = doyOf(month, day);
  return {
    month,
    day,
    doy,
    weekday: weekdayOf(doy),
    // A shutdown beginning 24 December runs into January, and EnergyPlus wraps
    // it into the same simulated year rather than losing the tail. Measured:
    // `12/24*9` flagged 24–31 December and 1 January as Holiday.
    ends: ((doy + holiday.duration - 2) % 365) + 1,
  };
}

/** Which month a day of the year falls in, 1-indexed. */
function monthOfDoy(doy) {
  let left = doy;
  for (let m = 0; m < 12; m += 1) {
    if (left <= DAYS_IN_MONTH[m]) return m + 1;
    left -= DAYS_IN_MONTH[m];
  }
  return 12;
}

/**
 * How many of a holiday's days the run actually simulates.
 *
 * Counted day by day rather than judged by the start date, because a special
 * day is a *span*: a nine-day shutdown beginning 24 December reaches into
 * January, and a run that keeps December but drops January simulates eight of
 * its nine days. Measured — the engine flagged 24 to 31 December and stopped,
 * with nothing in the error file to say two days had gone.
 *
 * That is the whole reason this counts days and not entries. EnergyPlus is
 * silent about a special day it cannot place, whether it loses all of one or
 * part of one, so the only honest reading is of what actually lands.
 */
export function coveredDays(holiday, startWeekday, mask) {
  const { doy } = resolveHoliday(holiday, startWeekday);
  let covered = 0;
  for (let i = 0; i < holiday.duration; i += 1) {
    // Wrapping at 365 the way the engine wraps it, back into the same year.
    const day = ((doy - 1 + i) % 365) + 1;
    if (mask[monthOfDoy(day) - 1] === '1') covered += 1;
  }
  return covered;
}

/**
 * The whole list as days of the year — how many it names, and how many of those
 * the run simulates.
 *
 * Sets, not sums, because holidays overlap and a day is a day. A nine-day
 * shutdown from 24 December swallows Christmas and — wrapping — New Year, so
 * eleven federal holidays plus that shutdown is eighteen days and not twenty.
 * Summing the entries reported eleven days for a November-to-December run where
 * the engine flagged ten, which is how this was found: the schema says outright
 * that there is "no error message on duplicate days or overlapping days", so the
 * engine simply marks each day once and says nothing about the arithmetic.
 */
export function runDays(holidays, startWeekday, mask) {
  const listed = new Set();
  const covered = new Set();
  for (const holiday of holidays) {
    const { doy } = resolveHoliday(holiday, startWeekday);
    for (let i = 0; i < holiday.duration; i += 1) {
      const day = ((doy - 1 + i) % 365) + 1;
      listed.add(day);
      if (mask[monthOfDoy(day) - 1] === '1') covered.add(day);
    }
  }
  return { listed: listed.size, covered: covered.size };
}

/** `Sun` … `Sat`, for lettering a resolved day. The months are `MONTHS`. */
export const WEEKDAY_LABELS = WEEKDAYS;

/** The list as text, in the one spelling the parser reads back unchanged. */
export function serializeHolidays(days) {
  return days
    .map((day) => `${day.date}${day.duration > 1 ? `*${day.duration}` : ''}: ${day.name}`)
    .join(';');
}

/* ══ national calendars ══════════════════════════════════════════════════ */

/**
 * One day of a published calendar, written or not.
 *
 * A preset declares its *whole* national calendar, including the days it cannot
 * express, each carrying the reason it cannot. That is what lets the offer say
 * "CA 8/10" and name the two missing days before the reader presses it, rather
 * than stamping ten days' worth of expectation and delivering eight. Deriving
 * the counts from the days themselves also means the label cannot drift from the
 * list the day somebody edits one.
 */
class PresetDay {
  constructor({ name, date = null, missing = null }) {
    if ((date === null) === (missing === null)) {
      throw new Error(`${name} needs either a date or a reason it has none`);
    }
    this.name = name;
    this.date = date;
    this.missing = missing;
    Object.freeze(this);
  }
}

/** The two reasons a published holiday cannot be written as an IDF date. */
const EASTER = 'set by Easter, which a date field with no year cannot carry';
const VICTORIA = 'the Monday preceding 25 May, which is neither an nth weekday nor the last';

/** A published calendar, offered as a starting point for the list. */
class HolidayCalendar {
  constructor({ code, label, days }) {
    this.code = code;
    this.label = label;
    this.days = Object.freeze([...days]);
    Object.freeze(this);
  }

  get written() {
    return this.days.filter((d) => d.date !== null);
  }

  get unwritten() {
    return this.days.filter((d) => d.missing !== null);
  }

  /** This calendar as a holiday list, ready to become the parameter. */
  encode() {
    return serializeHolidays(
      this.written.map((d) => new Holiday({ date: d.date, name: d.name })),
    );
  }

  /**
   * What the offer says about itself, in full, before it is pressed.
   *
   * Grouped by reason rather than listed day by day, because four German
   * holidays share one sentence about Easter and printing it four times reads
   * as noise instead of as the one fact it is.
   */
  title() {
    const head = `Replace the list with the ${this.written.length} ${this.label} holidays this page can write`;
    if (this.unwritten.length === 0) return `${head}.`;
    const reasons = new Map();
    for (const d of this.unwritten) {
      reasons.set(d.missing, [...(reasons.get(d.missing) ?? []), d.name]);
    }
    const short = [...reasons]
      .map(([why, names]) => `${series(names)} ${names.length === 1 ? 'is' : 'are'} ${why}`)
      .join('; ');
    return `${head}. ${this.unwritten.length} cannot be: ${short}.`;
  }

  /** `US 11` when whole, `CA 8/10` when short. */
  count() {
    return this.unwritten.length === 0
      ? String(this.written.length)
      : `${this.written.length}/${this.days.length}`;
  }
}

const day = (name, date) => new PresetDay({ name, date });
const absent = (name, missing) => new PresetDay({ name, missing });

/** `A`, `A and B`, `A, B and C`. */
const series = (names) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * The five regions the tariff data covers, so the calendar and the bill agree
 * about which countries this page claims to know anything about.
 */
export const HOLIDAY_CALENDARS = Object.freeze([
  new HolidayCalendar({
    code: 'US',
    label: 'United States federal',
    days: [
      day('New Year', '1/1'),
      day('Martin Luther King Day', '3 Mon in Jan'),
      day('Presidents Day', '3 Mon in Feb'),
      day('Memorial Day', 'Last Mon in May'),
      day('Juneteenth', '6/19'),
      day('Independence Day', '7/4'),
      day('Labor Day', '1 Mon in Sep'),
      day('Columbus Day', '2 Mon in Oct'),
      day('Veterans Day', '11/11'),
      day('Thanksgiving', '4 Thu in Nov'),
      day('Christmas', '12/25'),
    ],
  }),
  new HolidayCalendar({
    code: 'CA',
    label: 'Canadian federal',
    days: [
      day('New Year', '1/1'),
      absent('Good Friday', EASTER),
      absent('Victoria Day', VICTORIA),
      day('Canada Day', '7/1'),
      day('Labour Day', '1 Mon in Sep'),
      day('Truth and Reconciliation', '9/30'),
      day('Thanksgiving', '2 Mon in Oct'),
      day('Remembrance Day', '11/11'),
      day('Christmas', '12/25'),
      day('Boxing Day', '12/26'),
    ],
  }),
  new HolidayCalendar({
    code: 'UK',
    label: 'England and Wales bank',
    days: [
      day('New Year', '1/1'),
      absent('Good Friday', EASTER),
      absent('Easter Monday', EASTER),
      day('Early May', '1 Mon in May'),
      day('Spring Bank Holiday', 'Last Mon in May'),
      day('Summer Bank Holiday', 'Last Mon in Aug'),
      day('Christmas', '12/25'),
      day('Boxing Day', '12/26'),
    ],
  }),
  new HolidayCalendar({
    code: 'FR',
    label: 'French public',
    days: [
      day("Jour de l'An", '1/1'),
      absent('Lundi de Paques', EASTER),
      day('Fete du Travail', '5/1'),
      day('Victoire 1945', '5/8'),
      absent('Ascension', EASTER),
      absent('Lundi de Pentecote', EASTER),
      day('Fete Nationale', '7/14'),
      day('Assomption', '8/15'),
      day('Toussaint', '11/1'),
      day('Armistice', '11/11'),
      day('Noel', '12/25'),
    ],
  }),
  new HolidayCalendar({
    code: 'DE',
    label: 'German public',
    days: [
      day('Neujahr', '1/1'),
      absent('Karfreitag', EASTER),
      absent('Ostermontag', EASTER),
      day('Tag der Arbeit', '5/1'),
      absent('Christi Himmelfahrt', EASTER),
      absent('Pfingstmontag', EASTER),
      day('Tag der Deutschen Einheit', '10/3'),
      day('Erster Weihnachtstag', '12/25'),
      day('Zweiter Weihnachtstag', '12/26'),
    ],
  }),
]);

/**
 * Why a control cannot hold a value handed to it, or null when it can.
 *
 * A gesture can never produce an inadmissible value — the range input and the
 * segmented rule only offer what the declaration allows. Everything that sets a
 * control *without* a gesture does it by handing over a bare value: a pasted
 * link, a saved scheme, a standard's specification. Each of those has to be
 * checked against the same rules, and those rules are the declaration's own, so
 * they are read off it here once rather than restated in each codec.
 *
 * The reason is a phrase, not a sentence, because the caller knows things this
 * function does not: a link can quote the fragment it was given, a preset can
 * name the clause that asked for it.
 */
export function refuses(control, value) {
  if (control.kind === 'selector') {
    return control.options.some((o) => o.value === value) ? null : 'is not one of its options';
  }
  // Non-numeric kinds are named here, above the numeric gate, for the reason
  // CLAUDE.md gives for the same ordering in `readValue`: a branch added below
  // it is unreachable, and every value of that kind is refused as "not a
  // number" — a true sentence about the wrong thing. A month mask and a day
  // list are both strings, both belong to the Run channel, and Run is
  // `UNTOUCHABLE`, so no preset can reach them; they throw rather than
  // validate, because the only way to arrive here is a programming error and
  // an explicit one is worth more than a plausible verdict.
  if (control.kind === 'calendar' || control.kind === 'days') {
    throw new Error(`a "${control.kind}" control is not set by value here`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'is not a number';
  let min;
  let max;
  let integer = false;
  switch (control.kind) {
    case 'scale':
    case 'facade':
      ({ min, max } = control);
      // Step alignment is deliberately not required — several defaults (a wall
      // R of 2.290965) sit off their own step grid, and a figure derived from a
      // published U-value has no reason to land on one either. But a control
      // whose step and floor are both whole numbers can only ever produce whole
      // numbers, and a fraction there reaches an integer IDF field the engine
      // rejects (a RunPeriod month of 6.5).
      integer = Number.isInteger(control.step) && Number.isInteger(control.min);
      break;
    case 'bearing':
      [min, max] = [0, 360];
      break;
    case 'profile':
      [min, max] = [0, 24]; // an hour of the day, and the band sweeps whole cells
      integer = true;
      break;
    default:
      // A new control kind must be taught its rules here explicitly, not fall
      // into whichever range happens to be last.
      throw new Error(`no value rules are written for a "${control.kind}" control`);
  }
  if (value < min || value > max) return `is outside its ${min}–${max} range`;
  if (integer && !Number.isInteger(value)) return 'is not a whole number';
  return null;
}

/* ══ metering ════════════════════════════════════════════════════════════ */

/**
 * One term of a reading, named by the EnergyPlus output variable that carries
 * it.
 *
 * Every variable used here reports watts. That is not a coincidence and it was
 * not the first attempt: the rail was originally built out of the per-mechanism
 * variables — infiltration and ventilation in joules, ideal loads in watts —
 * and summing them did not close, because those are terms of different
 * balances. `Zone Air Heat Balance …` is one purpose-built family covering the
 * zone *air* balance and nothing else, and it does close. Measured on the
 * design days, to about a hundredth of a percent.
 */
export class Term {
  constructor({ variable, sign = 1, perBuilding = false }) {
    this.variable = variable;
    this.sign = sign;
    // Reported for the whole building rather than for the one zone, so it
    // arrives already multiplied by the zone multiplier and has to be divided
    // back down before it can be added to terms that were not. Found by
    // arithmetic, not by reading: at a multiplier of 3 the other four terms
    // summed to −25,251 W and this one read 75,756 W, which is 25,252 × 3.
    this.perBuilding = perBuilding;
    Object.freeze(this);
  }
}

/**
 * What a channel is actually contributing, as opposed to what you set it to.
 *
 * `rail` marks the readings that are terms of the zone *air* heat balance and
 * therefore sum to roughly zero. The others are diagnostics: true readings of a
 * real quantity, but not summable against the rail terms, so the rail leaves
 * them out and the strip says so.
 */
export class Meter {
  constructor({ label, terms, rail = false, note = null, derived = false }) {
    this.label = label;
    this.terms = terms;
    this.rail = rail;
    this.note = note;
    // Read off the geometry rather than out of the ESO, so it is true before
    // anything has been simulated.
    this.derived = derived;
    Object.freeze(this);
  }
}

/**
 * What the engine made of a channel's declaration, read back off the run.
 *
 * A meter says what a channel is contributing; a readout says what it *is*, in
 * the terms the engine settled on rather than the ones the controls are typed
 * in. There is one, on Glazing, and it exists because the layered model is the
 * only place on this desk where you set causes and are given no result: panes,
 * a coating and a cavity go in, and the U-factor and SHGC that come out are
 * the two numbers a window is actually specified by. They are computed at
 * get-input and printed in the tabular report, so the sheet reads them back —
 * by the rule that nothing here is lettered from a variable when the run holds
 * the answer.
 *
 * It is a reading, so it obeys the readings' rules: an em dash before the
 * first run and after a failed one, and never a figure the engine did not
 * produce.
 */
export class Readout {
  constructor({ label, note = null }) {
    this.label = label;
    this.note = note;
    Object.freeze(this);
  }
}

/**
 * One named contributor *inside* a rail term, for the flow drawing to letter.
 *
 * The rail's five terms are the whole zone air balance and they close. What
 * they do not say is which part of a term is which: `Fabric 2,140 W` is the
 * convection off every inside face at once, and a reader looking at a Sankey
 * wants to know how much of that was the glass. A tributary names that finer
 * quantity and the EnergyPlus variable carrying it.
 *
 * The critical thing about a tributary, and the reason it is a separate class
 * rather than another `Term`: **it does not sum into its parent**. Windows
 * total heat gain carries transmitted solar, which lands on the surfaces and
 * reaches the air later; inside face conduction is not the same quantity as
 * convection to air; people, lights and equipment are the convective *and*
 * radiant fractions of gains whose radiant half arrives through the fabric.
 * Every one is a true reading of a real quantity and none of them is a share of
 * the ribbon it hangs under. So the drawing letters them as figures beside the
 * ribbon and never as divisions of its width — the same distinction `Meter.rail`
 * already draws between a term of the balance and a diagnostic beside it.
 *
 * `of` names the rail channel it is read against, `needs` the channels that
 * have to be in the path for the variable to exist at all (any one of them, for
 * the window pair, which either wall glass or a rooflight can produce), and
 * `note` is the sentence the key prints so the caveat travels with the figure.
 */
export class Tributary {
  constructor({ id, label, terms, of, needs, note = null }) {
    this.id = id;
    this.label = label;
    this.terms = terms;
    this.of = of;
    this.needs = Object.freeze(Array.isArray(needs) ? [...needs] : [needs]);
    this.note = note;
    Object.freeze(this);
  }
}

/* ══ channels ════════════════════════════════════════════════════════════ */

/**
 * One path heat takes, with everything that shapes it.
 *
 * The strips are ordered the way a signal chain is ordered, which here is the
 * order the physics happens: the sun arrives at a site, past whatever the
 * neighbours put in the way, through the glass, past the shades, into the
 * fabric, out of the mass; the air trades with outdoors and with whatever the
 * building is doing to itself; and the system, like a master bus, answers
 * everything above it. The last two strips are the engine room.
 *
 * `bypassable` channels can be taken out of the path entirely — not turned
 * down, removed: the applier deletes their objects from the document. A channel
 * that cannot be bypassed is one with no "off" that means anything; a building
 * has dimensions whether you like it or not.
 */
export class Channel {
  constructor({
    id, index, name, term, blurb, controls,
    meter = null, readout = null, bypassable = true, bypassed = false, requires = null, prices = false,
  }) {
    this.id = id;
    this.index = index;
    this.name = name;
    this.term = term; // its symbol in the heat balance, set in the header
    this.blurb = blurb;
    this.controls = Object.freeze(controls);
    this.meter = meter;
    this.readout = readout;
    this.bypassable = bypassable;
    // This channel prices the run rather than shaping it. Nothing it owns
    // reaches the IDF, so nothing it owns belongs in the solve key either --
    // turning a tariff must re-letter the bill within the frame and must never
    // start a simulation, because the physics did not move. The strip says so,
    // in the one place where "set this and nothing runs" could otherwise read
    // as a control that had stopped working.
    this.prices = prices;
    // Where a channel starts. The ones that start out are the ones whose
    // objects are absent from the baseline document -- the stock
    // `1ZoneUncontrolled.idf` fabric and geometry, minus the demonstration
    // loads the stock file hung on it (see the note atop `model.js`). Grounds
    // starts out for exactly that reason: its 5.25 kW is the stock example's,
    // but a load nobody engaged has no business in anyone's baseline.
    this.bypassed = bypassed;
    // A precondition the rest of the desk has to meet. Unmet, the channel is
    // not written into the document at all and the strip states what is
    // missing — a patch that cannot be made is worth saying out loud, and is
    // certainly worth more than objects the engine would reject.
    this.requires = requires;
    Object.freeze(this);
  }

  /** Every parameter key this channel owns, plan keys expanded. */
  keys() {
    return this.controls.flatMap((c) =>
      c.kind === 'facade' || c.kind === 'boundary'
        ? c.keys()
        : c.kind === 'profile'
          ? [c.from, c.to]
          : [c.key],
    );
  }
}

/* ══ landmarks ═══════════════════════════════════════════════════════════ */

/**
 * The cases the faces are read against, declared once and shared where the
 * same fact serves two controls.
 *
 * Kept here rather than inline in `CHANNELS` for two reasons. The rooflight's
 * glass and the wall's glass are the same physics and must be lettered with
 * the same bands or the sheet would be teaching two vocabularies for one
 * material; and a citation is several lines of prose, which inside an already
 * dense channel declaration would bury the control it belongs to.
 *
 * Three rules governed what got declared and what did not.
 *
 * **Only where somebody published it.** A landmark is a claim, and most of
 * this desk is quantities with no published cases at all — a shoebox's width,
 * a sensor's depth into the plan, a fin's offset from its jamb. Those faces
 * carry none, and that absence is the honest answer rather than a gap: making
 * one up so that every slider had a label would be the sheet grading a design
 * instead of measuring it, which is the failure the em-dash rule exists to
 * prevent on the other half of the page.
 *
 * **A band where the fact is a band, a point where it is a limit.** Double
 * glazing is a range; a code maximum is a line. Where the line is metric-exact
 * and lands on the control's step it is declared as a point; where it is a
 * conversion out of imperial units it is declared as the narrow band the
 * rounding actually makes, and the note carries the published figure so the
 * rounding is visible rather than absorbed.
 *
 * **Say which way the definition runs when it is not obvious.** The blind's
 * slat angle is the worked example: 0° and 180° are *closed* and 90° is *open*,
 * because EnergyPlus measures the angle from the glazing's outward normal and
 * not from the horizontal. Nothing on a slider labelled 0–180° says that, and
 * a reader who assumes the other convention gets the shading exactly backwards.
 */

const ASHRAE_FEN = 'ASHRAE Handbook of Fundamentals, Ch. 15, typical whole-window values.';
/**
 * How a landmark that rests on practice rather than on a published figure
 * opens its note.
 *
 * Most of these bands cite a standard, and a reader is entitled to assume the
 * number came from one. A few cannot: nobody legislates the depth at which an
 * overhang stops being a reveal and becomes a canopy, and yet those are the
 * bands an architect reads fastest, because they name the thing you would have
 * to build. Keeping them means saying which kind of claim they are, or a
 * convention sits beside an ASHRAE clause looking exactly as authoritative —
 * which is the sheet asserting under cover of citing.
 */
const CONVENTION = 'Convention of practice rather than a published figure.';
const IO_REF = 'EnergyPlus 26.1 Input Output Reference.';

/* ── glass ─────────────────────────────────────────────────────────────── */

/**
 * The four generations of window, which is the one scale on this desk that an
 * architect can already read fluently in words and not at all in W/m²K.
 *
 * Whole-window U including the frame's share, which is what a product sheet
 * quotes and what this control writes into `WindowMaterial:SimpleGlazingSystem`
 * — the simple model's `u_factor` is defined as the whole assembly's, so the
 * bands are the assembly's too.
 */
const GLASS_U = [
  new Landmark({
    from: 0.6, to: 1.0, label: 'Triple, low-e', phrase: 'triple',
    note: `Two coatings and argon in both cavities. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 1.4, to: 2.0, label: 'Double, low-e', phrase: 'low-e double',
    note: `One soft coating, argon fill. The centre of gravity of current commercial practice. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 2.6, to: 3.1, label: 'Double, clear', phrase: 'clear double',
    note: `Air-filled, no coating — the sealed unit as it was built for thirty years. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 5.4, to: 6.0, label: 'Single', phrase: 'single glazing',
    note: `One sheet of float glass. Roughly ten times the loss of a triple unit. ${ASHRAE_FEN}`,
  }),
];

/**
 * A rooflight is a worse assembly than a wall window of the same generation —
 * a domed unit has no thermally broken frame to speak of and it faces a sky
 * that is colder than any wall's surroundings — so it gets its own bands
 * rather than borrowing the wall's.
 */
const ROOFLIGHT_U = [
  new Landmark({
    from: 1.2, to: 1.8, label: 'Insulated unit', phrase: 'an insulated rooflight',
    note: 'A triple-skin or low-e glazed rooflight on a thermally broken kerb. NFRC-rated skylight range.',
  }),
  new Landmark({
    from: 2.4, to: 3.2, label: 'Double dome', phrase: 'a double dome',
    note: 'Two skins of polycarbonate or acrylic — the standard proprietary rooflight.',
  }),
  new Landmark({
    from: 4.8, to: 6.0, label: 'Single skin', phrase: 'a single skin',
    note: 'One sheet, no cavity. Condenses on itself in any heated building.',
  }),
];

const GLASS_SHGC = [
  new Landmark({
    from: 0.05, to: 0.2, label: 'Reflective', phrase: 'reflective glass',
    note: `A metallic coating. Buys the solar rejection back in daylight and in what the building looks like. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.25, to: 0.4, label: 'Solar-control low-e', phrase: 'solar-control low-e',
    note: `A spectrally selective coating. ASHRAE 90.1-2019 prescriptive SHGC limits fall in this band for the warmer climate zones. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.5, to: 0.65, label: 'Low-e, high gain', phrase: 'high-gain low-e',
    note: `A coating tuned to keep the winter sun, which is what a heating-dominated climate wants. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.7, to: 0.86, label: 'Clear glass', phrase: 'clear glass',
    note: `Uncoated float, single or double. Very nearly all the sun that reaches it. ${ASHRAE_FEN}`,
  }),
];

const GLASS_VT = [
  new Landmark({
    from: 0.1, to: 0.25, label: 'Reflective', phrase: 'reflective glass',
    note: `A quarter of the daylight, and the room reads as overcast on a clear day. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.35, to: 0.55, label: 'Tinted', phrase: 'tinted glass',
    note: `Body-tinted glass. It sheds light and heat in roughly equal measure, which is what a selective coating exists to avoid. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.6, to: 0.75, label: 'Low-e double', phrase: 'low-e double',
    note: `A coated unit still passes most of the visible band — that selectivity is the whole point of it. ${ASHRAE_FEN}`,
  }),
  new Landmark({
    from: 0.78, to: 0.9, label: 'Clear', phrase: 'clear glass',
    note: `Uncoated float. A single sheet reads about 0.90, a clear double about 0.80. ${ASHRAE_FEN}`,
  }),
];

/**
 * The emissivity of the coating on the inboard pane's outward face, which is
 * the whole mechanism of a low-e unit: the coating cannot stop conduction
 * across the cavity, it stops the pane *radiating* across it.
 *
 * The two coating families are made differently and land in different places,
 * and the strip used to say the wrong one — it called 0.04 a hard coat, which
 * is a soft coat's figure by a factor of four.
 */
const PANE_EMISS = [
  new Landmark({
    from: 0.04, to: 0.1, label: 'Soft coat', phrase: 'a soft coat',
    note: 'A sputtered silver coating, applied off-line and sealed inside the cavity because it will not survive handling. The best of them reach 0.03.',
  }),
  new Landmark({
    from: 0.15, to: 0.2, label: 'Hard coat', phrase: 'a hard coat',
    note: 'A pyrolytic coating fired on to the hot ribbon at the float line. Durable enough to face a room, and about four times the emissivity of a soft coat.',
  }),
  new Landmark({
    from: 0.8, to: 0.84, label: 'Uncoated float', phrase: 'uncoated float',
    note: 'Plain glass radiates like almost every other non-metal: 0.84.',
  }),
];

/**
 * How many sheets of glass, which is the layered model's own half of the
 * vocabulary the simple model's U-factor face is lettered in.
 *
 * The two glazing models ask the same question from opposite ends — one is set
 * in the assembly's result, the other in its causes — so they have to name the
 * cases identically or the strip teaches two languages for one window. The
 * U-values are measured on this desk at the default coating rather than quoted
 * from anywhere, which is why they are exact.
 *
 * `Single` is not here and cannot be: the layered model builds n panes with
 * n − 1 cavities and the coating lives on a cavity face, so one sheet has
 * nowhere to put it. A single-glazed opening is the simple model's job, where
 * its own face carries that band.
 */
const PANE_COUNT = [
  new Landmark({
    from: 2, label: 'Double', phrase: 'a double unit',
    note: 'Two sheets and one cavity — the sealed unit as ordinarily built. Measured on the default desk it comes to U 2.67 W/m²K, which is the clear-double band on the simple model\'s own face.',
  }),
  new Landmark({
    from: 3, label: 'Triple', phrase: 'a triple unit',
    note: 'Measured on the default desk: U 1.73 W/m²K with no coating — which lands in the *low-e double* band, so an uncoated triple buys roughly what a coated double does. That is the argument for spending on the coating before spending on the third sheet.',
  }),
  new Landmark({
    from: 4, label: 'Quadruple', phrase: 'a quadruple unit',
    note: 'Measured on the default desk: U 1.28 W/m²K uncoated, and 0.93 with a soft coat on the inboard pane. Rare in practice — the weight and the depth of frame it needs are what stop it, not the physics.',
  }),
];

/**
 * The cavity of a sealed unit, which is the one dimension on this desk with an
 * optimum rather than a direction. Narrow, the panes conduct across the gap;
 * wide, the fill starts to convect and carries the heat over instead. The
 * minimum sits between, and past about 20 mm widening the unit buys nothing at
 * all.
 */
const GAP_WIDTH = [
  new Landmark({
    from: 0.006, to: 0.009, label: 'Too narrow', phrase: 'a narrow cavity',
    note: 'Under about 9 mm the panes are close enough to conduct across the fill, and the unit loses most of the benefit of being double.',
  }),
  new Landmark({
    from: 0.012, to: 0.016, label: 'The optimum', phrase: 'the optimum',
    note: 'Both air and argon reach their lowest conductance between roughly 12 and 16 mm — argon at the narrow end, air at the wide. This desk starts at 13 mm.',
  }),
  new Landmark({
    from: 0.02, to: 0.05, label: 'Convecting', phrase: 'a convecting cavity',
    note: 'Past about 20 mm the fill circulates and carries heat across the gap, so the unit stops improving however much wider it is made.',
  }),
];

/**
 * `WindowProperty:FrameAndDivider.frame_conductance` is measured inside face to
 * outside face and excludes the air films, so these are frame conductances and
 * not the frame U-factors a product sheet quotes — the two differ by about
 * 0.17 m²K/W of film.
 */
const FRAME_COND = [
  new Landmark({
    from: 0.8, to: 1.4, label: 'Passive House frame', phrase: 'a Passive House frame',
    note: 'A deep insulated composite frame, which is what a certified window has to have before its glass matters.',
  }),
  new Landmark({
    from: 1.6, to: 2.6, label: 'Timber or uPVC', phrase: 'timber or uPVC',
    note: 'A multi-chamber plastic or a solid timber section — inherently poor conductors, so they need no break.',
  }),
  new Landmark({
    from: 3.0, to: 4.5, label: 'Broken aluminium', phrase: 'broken aluminium',
    note: 'A polyamide strip set between the inner and outer halves of an aluminium section.',
  }),
  new Landmark({
    from: 5.5, to: 12, label: 'Aluminium, no break', phrase: 'unbroken aluminium',
    note: 'A single metal section right through the wall. NFRC rates such frames at U 8.5 to 11 W/m²K *including* the films; strip the films off, as this field does, and the true conductance is past the top of this face — the stop is as close as the desk gets. At a 10 % frame fraction this alone can undo a low-e unit.',
  }),
];

const FRAME_WIDTH = [
  new Landmark({
    from: 0.045, to: 0.07, label: 'Slim metal', phrase: 'a slim metal frame',
    note: 'A 45 to 70 mm aluminium or steel section — the narrowest sightline a window is made with.',
  }),
  new Landmark({
    from: 0.075, to: 0.1, label: 'Standard', phrase: 'a standard frame',
    note: 'The 75 to 100 mm of a uPVC or timber casement.',
  }),
  new Landmark({
    from: 0.11, to: 0.16, label: 'Insulated frame', phrase: 'an insulated frame',
    note: 'A deep certified frame. It shades the glass as well as insulating it, which is why the width is a control here and not a constant.',
  }),
];

const SKY_CURB = [
  new Landmark({
    from: 0.1, to: 0.2, label: 'Proprietary kerb', phrase: 'a proprietary kerb',
    note: 'The upstand a standard rooflight is bedded on. NRCA asks for at least 200 mm above the finished roof surface so that ponding and snow cannot reach the seal.',
  }),
  new Landmark({
    from: 0.45, to: 1.2, label: 'Monitor', phrase: 'a monitor',
    note: 'Deep enough to be a piece of roof construction. Measured on this desk: taking the kerb from flush to 1.2 m removes 41 % of the transmitted solar at a 10 % roof ratio.',
  }),
];

/* ── the opaque envelope ───────────────────────────────────────────────── */

/**
 * These faces set the resistance of one `Material:NoMass` layer, not of the
 * whole construction, so the U-value a band corresponds to is
 * `1 / (R + 0.17)` for a wall and `1 / (R + 0.14)` for a roof — the surface
 * films EnergyPlus adds either side. Every figure below has been converted
 * that way rather than quoted as though the layer were the assembly.
 */
const WALL_R = [
  new Landmark({
    from: 0.2, to: 0.6, label: 'Uninsulated', phrase: 'an uninsulated wall',
    note: 'Solid masonry with nothing in it: a 1.3 to 2.7 W/m²K wall once the surface films are counted. Most of the stock built before insulation was required.',
  }),
  new Landmark({
    from: 2.1, to: 2.5, label: 'R-13 stud cavity', phrase: 'a stud cavity',
    note: 'Imperial R-13 batts between studs, which is 2.29 m²K/W and is the stock example\'s own R13LAYER — about 0.41 W/m²K with the films.',
  }),
  new Landmark({
    from: 3.3, to: 5.0, label: 'Continuous insulation', phrase: 'continuous insulation',
    note: 'A wrapped layer outside the frame, breaking the bridging: 0.19 to 0.29 W/m²K. Current code practice in cold zones.',
  }),
  new Landmark({
    from: 6.5, to: 10, label: 'Passive House', phrase: 'a Passive House wall',
    note: 'The Passive House Institute asks for U ≤ 0.15 W/m²K in a cool-temperate climate, which is 6.5 m²K/W of layer once the films are counted.',
  }),
];

const ROOF_R = [
  new Landmark({
    from: 0.2, to: 0.6, label: 'Uninsulated deck', phrase: 'a bare deck',
    note: 'Structural deck and a membrane, nothing between. 1.4 to 2.9 W/m²K with the films.',
  }),
  new Landmark({
    from: 5.1, to: 5.5, label: 'R-30 above deck', phrase: 'R-30 above deck',
    note: 'ASHRAE 90.1-2019 prescriptive insulation entirely above deck for most commercial climate zones: R-30 imperial, 5.28 m²K/W.',
  }),
  new Landmark({
    from: 6.5, to: 7.0, label: 'R-38 above deck', phrase: 'R-38 above deck',
    note: 'ASHRAE 90.1-2019 for the colder zones: R-38 imperial, 6.69 m²K/W.',
  }),
  new Landmark({
    from: 9, to: 14, label: 'Passive House', phrase: 'a Passive House roof',
    note: 'U 0.07 to 0.11 W/m²K, comfortably past the Passive House Institute\'s 0.15 — a roof reaches it more cheaply than a wall because nothing is competing for the depth.',
  }),
];

const SOLAR_ABS = [
  new Landmark({
    from: 0.2, to: 0.35, label: 'White or pale', phrase: 'a pale surface',
    note: 'Titanium-dioxide white paint, pale render, light stone. ASHRAE Handbook of Fundamentals, surface-property tables.',
  }),
  new Landmark({
    from: 0.45, to: 0.65, label: 'Mid-tone', phrase: 'a mid-tone surface',
    note: 'Grey render, buff brick, weathered concrete.',
  }),
  new Landmark({
    from: 0.75, to: 0.92, label: 'Dark', phrase: 'a dark surface',
    note: 'Dark brick, dark paint, oxidised metal. Nearly everything the sun brings is absorbed at the face.',
  }),
];

const ROOF_ABS = [
  new Landmark({
    from: 0.1, to: 0.3, label: 'Cool roof', phrase: 'a cool roof',
    note: 'ASHRAE 90.1 asks a cool roof in the warm climate zones for an initial solar reflectance of 0.70 — absorptance 0.30 — or 0.55 aged, tested to CRRC methods. Aged is the honest one: these surfaces darken.',
  }),
  new Landmark({
    from: 0.45, to: 0.65, label: 'Grey membrane', phrase: 'a grey membrane',
    note: 'A single-ply membrane after a few years of weathering, or ballast.',
  }),
  new Landmark({
    from: 0.85, to: 0.95, label: 'Bitumen', phrase: 'bitumen',
    note: 'Built-up felt or a dark membrane. Reaches 70 °C on a clear summer afternoon.',
  }),
];

const EMITTANCE = [
  new Landmark({
    from: 0.05, to: 0.25, label: 'Bare metal', phrase: 'bare metal',
    note: 'Polished or mill-finish aluminium, galvanised steel. It barely radiates, so it stays warm at night — the reason a foil-faced surface is a radiant barrier.',
  }),
  new Landmark({
    from: 0.85, to: 0.95, label: 'Almost everything else', phrase: 'a non-metallic surface',
    note: 'Paint, masonry, glass, render, timber. Non-metals sit at 0.90 with remarkably little spread, which is why 0.9 is the field\'s usual default.',
  }),
];

const WALL_MASS = [
  new Landmark({
    from: 0.09, to: 0.12, label: 'A brick leaf', phrase: 'a brick leaf',
    note: 'One 102 mm skin of brickwork set inboard of the insulation.',
  }),
  new Landmark({
    from: 0.14, to: 0.22, label: 'Blockwork', phrase: 'blockwork',
    note: 'A 140 or 200 mm dense block inner leaf — the common way a masonry building gets its mass.',
  }),
  new Landmark({
    from: 0.3, to: 0.4, label: 'Heavy masonry', phrase: 'heavy masonry',
    note: 'A structural concrete wall. Past about 0.15 m the extra depth stops answering the daily cycle — see the slab.',
  }),
];

const SLAB_DEPTH = [
  new Landmark({
    from: 0.09, to: 0.11, label: 'Effective depth', phrase: 'the effective depth',
    note: 'About 0.10 m is the depth conventionally counted as effective on a 24-hour cycle — the CIBSE admittance method\'s figure for dense concrete. The diffusion depth proper, √(2α/ω), is 0.16 m, and the two differ because the deeper material is still responding but by then too little and too late to matter. The stock example\'s 4-inch slab is 0.1015 m, right on the design figure.',
  }),
  new Landmark({
    from: 0.15, to: 0.25, label: 'Structural slab', phrase: 'a structural slab',
    note: 'A 150 to 250 mm floor plate, which is what a concrete frame actually casts.',
  }),
  new Landmark({
    from: 0.3, to: 0.6, label: 'Deeper than it can use', phrase: 'more than a day reaches',
    note: 'Real for a transfer deck or a raft, but three times the diurnal depth: the inner two thirds never take part in a daily cycle.',
  }),
];

const INTERNAL_MASS = [
  new Landmark({
    from: 0.5, to: 1.0, label: 'Lightly fitted', phrase: 'a light fit-out',
    note: 'Desks, screens, a few partitions — surface area of about half to one times the floor.',
  }),
  new Landmark({
    from: 1.5, to: 2.5, label: 'Furnished office', phrase: 'a furnished office',
    note: 'The usual modelling assumption for a fitted-out office is internal surface area of roughly twice the floor area.',
  }),
];

/* ── air ───────────────────────────────────────────────────────────────── */

/**
 * Air changes at natural pressure, which is what `ZoneInfiltration:DesignFlowRate`
 * takes — *not* the ACH50 a blower-door test reports. The rule of thumb that
 * relates them divides by about 20, so Passive House's 0.6 ACH50 is roughly
 * 0.03 ACH here; the bands below are already converted.
 */
const INFILTRATION = [
  new Landmark({
    from: 0.01, to: 0.06, label: 'Passive House', phrase: 'a Passive House envelope',
    note: 'The Passive House Institute limit is 0.6 air changes an hour at 50 Pa, which the usual n/20 rule makes about 0.03 ACH at natural pressure.',
  }),
  new Landmark({
    from: 0.15, to: 0.35, label: 'Tight, tested', phrase: 'a tested envelope',
    note: 'A commercial envelope built to an air-tightness specification and tested, roughly 3 to 7 ACH50.',
  }),
  new Landmark({
    from: 0.5, to: 0.9, label: 'Typical new-build', phrase: 'a typical new-build',
    note: 'Ordinary construction with no tightness testing. This desk starts at 0.5.',
  }),
  new Landmark({
    from: 1.2, to: 3, label: 'Leaky or historic', phrase: 'a leaky envelope',
    note: 'Single glazing, no continuous barrier, openable everything. The leakage alone outweighs most of what the fabric channels can buy.',
  }),
];

/**
 * The A, B and C of `A + B·|ΔT| + C·v`, whose published sets are the closest
 * thing this desk has to a landmark that is a citation and nothing else.
 *
 * EnergyPlus's own defaults are 1, 0, 0 — a constant flow that answers neither
 * the weather nor the season, which is where this desk starts. BLAST and DOE-2
 * each shipped a measured set, and the Input Output Reference gives both along
 * with what they do: at 0 K and 3.35 m/s the BLAST set returns exactly 1.0, and
 * at a winter 40 K and 6 m/s it returns 2.75.
 */
const INF_CONSTANT = [
  new Landmark({
    from: 0, label: 'DOE-2', phrase: 'the DOE-2 set',
    note: `DOE-2's air-change method used A = 0: leakage entirely wind-driven. ${IO_REF}`,
  }),
  new Landmark({
    from: 0.6, to: 0.61, label: 'BLAST', phrase: 'the BLAST set',
    note: `BLAST used A = 0.606, with the stack and wind terms carrying the rest; this face's 0.01 step reaches 0.60 and 0.61 either side of it. ${IO_REF}`,
  }),
  new Landmark({
    from: 1, label: 'EnergyPlus default', phrase: 'the EnergyPlus default',
    note: `A = 1 with B and C at zero is a constant volumetric flow under all conditions, which is the field's default and this desk's. ${IO_REF}`,
  }),
];

const INF_STACK = [
  new Landmark({
    from: 0, label: 'DOE-2 and EnergyPlus', phrase: 'no stack term',
    note: `Both the DOE-2 set and the EnergyPlus default leave B at zero. ${IO_REF}`,
  }),
  new Landmark({
    from: 0.036, to: 0.037, label: 'BLAST', phrase: 'the BLAST set',
    note: `BLAST's temperature term is B = 0.03636 per kelvin, which this face's 0.001 step straddles. ${IO_REF}`,
  }),
];

const INF_WIND = [
  new Landmark({
    from: 0, label: 'EnergyPlus default', phrase: 'no wind term',
    note: `C = 0: leakage that does not answer the wind at all. ${IO_REF}`,
  }),
  new Landmark({
    from: 0.115, to: 0.12, label: 'BLAST', phrase: 'the BLAST set',
    note: `BLAST's velocity term is C = 0.1177 per m/s, which this face's 0.005 step straddles. ${IO_REF}`,
  }),
  new Landmark({
    from: 0.22, to: 0.225, label: 'DOE-2', phrase: 'the DOE-2 set',
    note: `DOE-2 put the whole of leakage on the wind: C = 0.224, which returns 1.0 at 4.47 m/s. ${IO_REF}`,
  }),
];

const VENTILATION = [
  new Landmark({
    from: 0.5, to: 1.5, label: 'Background', phrase: 'background ventilation',
    note: 'Trickle vents and the odd open window — enough for air quality, nothing like enough to cool.',
  }),
  new Landmark({
    from: 3.5, to: 4.5, label: 'Purge', phrase: 'purge ventilation',
    note: 'Approved Document F asks for a purge capability of about 4 air changes an hour, which is what openable windows are sized on.',
  }),
  new Landmark({
    from: 6, to: 12, label: 'Night flush', phrase: 'a night flush',
    note: 'Cross-ventilation with the building open. This is the rate at which a slab can actually be emptied overnight.',
  }),
];

/**
 * The Beaufort scale, which is the one wind vocabulary anyone reads without
 * converting. The top of this face is 40 m/s — force 13, past a hurricane — so
 * a shutdown wind left at the stop is a window that never closes.
 */
const WIND = [
  new Landmark({
    from: 1.6, to: 3.3, label: 'Light air · Bft 2', phrase: 'a light air',
    note: 'Leaves rustle, a vane moves. WMO Beaufort scale.',
  }),
  new Landmark({
    from: 5.5, to: 7.9, label: 'Moderate · Bft 4', phrase: 'a moderate breeze',
    note: 'Dust and loose paper lift; small branches move. Roughly where an open window starts to be a nuisance. WMO Beaufort scale.',
  }),
  new Landmark({
    from: 10.8, to: 13.8, label: 'Strong · Bft 6', phrase: 'a strong breeze',
    note: 'Large branches in motion, umbrellas used with difficulty. WMO Beaufort scale.',
  }),
];

/* ── what is in the room ───────────────────────────────────────────────── */

const OCCUPANCY = [
  new Landmark({
    from: 5.5, to: 7, label: 'Retail floor', phrase: 'a retail floor',
    note: 'ASHRAE 62.1-2019 Table 6-2 default for retail sales is 15 people per 1,000 ft², which is 6.2 m² each.',
  }),
  new Landmark({
    from: 8, to: 13, label: 'Dense open plan', phrase: 'a dense open plan',
    note: 'The BCO Guide to Specification designs UK office workplaces at 8 to 13 m² a person.',
  }),
  new Landmark({
    from: 17, to: 21, label: 'Office · 62.1 default', phrase: 'the 62.1 office default',
    note: 'ASHRAE 62.1-2019 Table 6-2 default occupant density for office space is 5 people per 1,000 ft², which is 18.6 m² each.',
  }),
];

/**
 * Total heat per person, sensible and latent together, which is what
 * `People.activity_level_schedule` takes. From ASHRAE Handbook of Fundamentals,
 * Ch. 9, Table 4 — the adjusted figures for a mixed adult population.
 *
 * Heavy machine work is 425 W and athletics 525 W, both past the top of this
 * face; a shoebox held at an office setpoint is not a gymnasium, and widening
 * the range to reach them would cost the resolution where the answers are.
 */
const ACTIVITY = [
  new Landmark({
    from: 95, to: 105, label: 'Seated, quiet', phrase: 'sitting quietly',
    note: 'About 100 W total, 60 of it sensible. ASHRAE Handbook of Fundamentals, Ch. 9, Table 4.',
  }),
  new Landmark({
    from: 115, to: 130, label: 'Office work', phrase: 'office work',
    note: 'Typing and seated light work, about 120 W. ASHRAE Handbook of Fundamentals, Ch. 9, Table 4. This desk starts here.',
  }),
  new Landmark({
    from: 145, to: 165, label: 'Standing, walking', phrase: 'standing work',
    note: 'Filing while standing, or walking about a room: 150 to 160 W. ASHRAE Handbook of Fundamentals, Ch. 9, Table 4.',
  }),
  new Landmark({
    from: 210, to: 235, label: 'Light machine work', phrase: 'light machine work',
    note: 'About 220 W. ASHRAE Handbook of Fundamentals, Ch. 9, Table 4.',
  }),
];

/**
 * Lighting power density, which is the one internal gain that has been
 * legislated downwards for forty years, so its landmarks are dates as much as
 * they are numbers. The allowances are ASHRAE 90.1 building-area-method values
 * converted from W/ft², and each band is as narrow as the rounding to this
 * control's 0.1 W/m² step allows.
 */
const LIGHTING = [
  new Landmark({
    from: 4.7, to: 4.9, label: '90.1-2019 warehouse', phrase: 'the warehouse rate',
    note: 'ASHRAE 90.1-2019 building-area allowance for a warehouse: 0.45 W/ft², which is 4.84 W/m².',
  }),
  new Landmark({
    from: 6.8, to: 7.0, label: '90.1-2019 office', phrase: '90.1-2019 office',
    note: 'ASHRAE 90.1-2019 building-area allowance for an office: 0.64 W/ft², which is 6.89 W/m². An all-LED installation meets it without trying.',
  }),
  new Landmark({
    from: 10.7, to: 10.9, label: '90.1-2004 office', phrase: '90.1-2004 office',
    note: 'ASHRAE 90.1-2004 allowed 1.00 W/ft² for an office, which is 10.76 W/m² — 56 % more than the same building is allowed today.',
  }),
  new Landmark({
    from: 16, to: 21.5, label: 'Fluorescent, pre-1990', phrase: 'pre-1990 fluorescent',
    note: 'T12 lamps on magnetic ballasts ran 1.5 to 2.0 W/ft², which is 16 to 21.5 W/m². At this density the lighting is the heating system.',
  }),
];

const EQUIPMENT = [
  new Landmark({
    from: 7.5, to: 8.5, label: 'Office receptacles', phrase: 'office receptacle load',
    note: 'The usual modelling baseline for office plug load is 0.75 W/ft², which is 8.07 W/m². This desk starts at 8.',
  }),
  new Landmark({
    from: 27, to: 54, label: 'Trading floor or lab', phrase: 'a trading floor',
    note: '2.5 to 5 W/ft². A room at this density is cooling-dominated in every climate there is.',
  }),
];

/* ── comfort, light and the system ─────────────────────────────────────── */

const ILLUMINANCE = [
  new Landmark({
    from: 100, to: 150, label: 'Circulation', phrase: 'circulation lighting',
    note: 'EN 12464-1 maintained illuminance for corridors and circulation areas: 100 lx.',
  }),
  new Landmark({
    from: 280, to: 320, label: 'General indoor work', phrase: 'general work',
    note: 'EN 12464-1: 300 lx for filing, copying, and general indoor tasks.',
  }),
  new Landmark({
    from: 480, to: 520, label: 'Office task', phrase: 'an office task',
    note: 'EN 12464-1: 500 lx for writing, typing, reading and data processing. This desk starts here.',
  }),
  new Landmark({
    from: 700, to: 1000, label: 'Detailed work', phrase: 'detailed work',
    note: 'EN 12464-1: 750 lx for technical drawing, 1,000 lx for fine inspection work.',
  }),
];

const WORK_PLANE = [
  new Landmark({
    from: 0.7, to: 0.85, label: 'Work plane', phrase: 'the work plane',
    note: 'EN 12464-1 and the IES both take the horizontal work plane at 0.8 m above the floor for seated tasks. This desk starts there.',
  }),
];

const HEAT_SET = [
  new Landmark({
    from: 10, to: 14, label: 'Frost protection', phrase: 'frost protection',
    note: 'Enough to keep pipes and finishes intact in an unoccupied building, and nothing like enough for comfort.',
  }),
  new Landmark({
    from: 20, to: 23.5, label: 'ASHRAE 55 winter', phrase: 'the winter comfort band',
    note: 'ASHRAE 55-2020 operative temperature for 80 % acceptability at 1.0 clo and sedentary activity: about 20 to 23.5 °C.',
  }),
];

const COOL_SET = [
  new Landmark({
    from: 23, to: 26, label: 'ASHRAE 55 summer', phrase: 'the summer comfort band',
    note: 'ASHRAE 55-2020 operative temperature for 80 % acceptability at 0.5 clo and sedentary activity: about 23 to 26 °C. This desk starts at the top of it.',
  }),
  new Landmark({
    from: 28, to: 31, label: 'Adaptive, free-running', phrase: 'the adaptive band',
    note: 'ASHRAE 55 adaptive model, which applies only to occupant-controlled naturally conditioned spaces: the upper 80 % limit reaches about 30 °C at a 30 °C prevailing mean.',
  }),
];

const OUTDOOR_AIR = [
  new Landmark({
    from: 2.5, label: '62.1 people rate', phrase: 'the 62.1 people rate',
    note: 'ASHRAE 62.1-2019 breathing-zone rate per person for an office is 5 cfm, which is 2.36 L/s — this face\'s 0.5 step reaches it at 2.5. The area rate is on top of this, so this alone is never the whole requirement.',
  }),
  new Landmark({
    from: 7, to: 10, label: 'Office, all in', phrase: 'a whole office rate',
    note: 'The 62.1 people and area rates together at the 18.6 m² a person 62.1 assumes come to 7.9 L/s a person (2.36 + 0.3 × 18.6), which is about where EN 16798-1 category II lands too.',
  }),
];

const HEAT_RECOVERY = [
  new Landmark({
    from: 0.5, to: 0.6, label: '90.1 minimum', phrase: 'the 90.1 minimum',
    note: 'ASHRAE 90.1-2019 §6.5.6.1 requires at least 50 % enthalpy recovery effectiveness where energy recovery is triggered.',
  }),
  new Landmark({
    from: 0.75, to: 0.9, label: 'Passive House', phrase: 'a Passive House unit',
    note: 'The Passive House Institute certifies heat recovery units at 75 % effectiveness or better, measured to its own protocol.',
  }),
];

/* ── plant ─────────────────────────────────────────────────────────────── */

const BOILER = [
  new Landmark({
    from: 0.6, to: 0.72, label: 'Old atmospheric', phrase: 'an old boiler',
    note: 'A standing-pilot cast-iron boiler over a heating season, standby losses and all.',
  }),
  new Landmark({
    from: 0.8, to: 0.86, label: 'Non-condensing', phrase: 'non-condensing',
    note: 'ASHRAE 90.1 sets 80 % thermal efficiency as the floor for most gas-fired boilers. This desk starts at 0.85.',
  }),
  new Landmark({
    from: 0.9, to: 1.05, label: 'Condensing', phrase: 'condensing',
    note: 'Only reached if the return water is cold enough to condense the flue gas — an underfloor or oversized-emitter system, not a rebuilt one. Figures above 1.00 are on net calorific value.',
  }),
];

const HEAT_COP = [
  new Landmark({
    from: 1.5, to: 2.2, label: 'Air source, deep cold', phrase: 'deep-cold air source',
    note: 'What an air-source heat pump returns at design condition in a cold climate, before any resistance back-up.',
  }),
  new Landmark({
    from: 2.6, to: 3.4, label: 'Air source, seasonal', phrase: 'seasonal air source',
    note: 'A seasonal figure for an air-source unit in a mixed climate, averaged over the hours it actually runs. This desk starts at 3.',
  }),
  new Landmark({
    from: 3.8, to: 5.5, label: 'Ground source', phrase: 'ground source',
    note: 'A ground loop holds its source temperature through the winter, which is the whole of the difference.',
  }),
];

const COOL_COP = [
  new Landmark({
    from: 2.8, to: 3.5, label: 'Packaged DX', phrase: 'a packaged DX unit',
    note: 'A rooftop or split direct-expansion unit at rated condition — around the ASHRAE 90.1 minimum for air-cooled equipment.',
  }),
  new Landmark({
    from: 3.8, to: 4.6, label: 'Air-cooled chiller', phrase: 'an air-cooled chiller',
    note: 'ASHRAE 90.1-2019 minimum full-load COP for an air-cooled screw chiller is about 3.0, and good equipment reaches 4.5.',
  }),
  new Landmark({
    from: 5.5, to: 7, label: 'Water-cooled centrifugal', phrase: 'a centrifugal',
    note: 'ASHRAE 90.1-2019 asks about 6.1 COP full-load for a large water-cooled centrifugal chiller. It buys that with a cooling tower and its water.',
  }),
];

/* ── the grid ──────────────────────────────────────────────────────────── */

/**
 * Grid carbon intensity, which is the one number on this desk that will move
 * more over the building's life than anything the building does.
 */
const GRID = [
  new Landmark({
    from: 0, to: 60, label: 'Hydro or nuclear', phrase: 'hydro or nuclear',
    note: 'Québec, Norway, Sweden and Ontario sit well under 60 gCO₂e/kWh, and France near the top of it. A heat pump on one of these is very nearly carbon-free heat. These move year to year — check the current figure rather than this one.',
  }),
  new Landmark({
    from: 120, to: 260, label: 'Decarbonising', phrase: 'decarbonising',
    note: 'Great Britain, Spain, California — grids that have taken most of the coal out and are working on the gas.',
  }),
  new Landmark({
    from: 350, to: 450, label: 'Mixed fossil', phrase: 'mixed fossil',
    note: 'The US average sits near 370 gCO₂e/kWh, most of it gas with coal behind it.',
  }),
  new Landmark({
    from: 600, to: 900, label: 'Coal-heavy', phrase: 'coal-heavy',
    note: 'Poland, India, South Africa. Electric heat on a grid like this is worse than the gas boiler it replaced.',
  }),
];

/* ── openings ──────────────────────────────────────────────────────────── */

const WWR = [
  new Landmark({
    from: 0.1, to: 0.25, label: 'Punched', phrase: 'punched',
    note: `${CONVENTION} Windows as holes in a wall — the traditional arrangement and, in a heating-dominated climate, usually still the right one.`,
  }),
  new Landmark({
    from: 0.4, label: 'Code limit', phrase: 'the code limit',
    note: 'ASHRAE 90.1-2019 caps vertical fenestration at 40 % of the gross above-grade wall area on the prescriptive path (§5.5.4.2). Past it the building has to be traded out on performance instead.',
  }),
  new Landmark({
    from: 0.6, to: 0.9, label: 'Curtain wall', phrase: 'curtain wall',
    note: `${CONVENTION} A glazed envelope. Whatever the glass, the wall is now the weakest surface the building has.`,
  }),
];

const SKY_RATIO = [
  new Landmark({
    from: 0.03, label: 'Code limit', phrase: 'the code limit',
    note: 'ASHRAE 90.1-2019 caps skylight fenestration at 3 % of the gross roof area on the prescriptive path (§5.5.4.2), with a wider allowance where daylight controls are fitted.',
  }),
  new Landmark({
    from: 0.04, to: 0.07, label: 'Toplighting', phrase: 'toplighting',
    note: `${CONVENTION} The range toplighting guidance generally asks for in a single-storey space: enough to hold a daylit illuminance without the gain running away.`,
  }),
  new Landmark({
    from: 0.1, to: 0.3, label: 'Gain dominates', phrase: 'runaway gain',
    note: `${CONVENTION} A rooflight faces the part of the sky that is never shaded and never off to one side, so past about 10 % the summer gain outruns the light it buys.`,
  }),
];

const OVERHANG = [
  new Landmark({
    from: 0.2, to: 0.45, label: 'Reveal', phrase: 'a deep reveal',
    note: `${CONVENTION} What a thick wall gives you for nothing — enough to cut the highest sun off the head of the opening and no more.`,
  }),
  new Landmark({
    from: 0.6, to: 1.0, label: 'Canopy', phrase: 'a canopy',
    note: `${CONVENTION} A brise-soleil or a projecting hood: a piece of building rather than a detail, and the depth at which a south elevation starts to be genuinely shaded.`,
  }),
  new Landmark({
    from: 1.4, to: 2.2, label: 'Balcony', phrase: 'a balcony',
    note: `${CONVENTION} Deep enough to stand on, and structure rather than cladding. It shades the floor below it as much as it shades its own opening.`,
  }),
];

/* ── the engine's own numbers ──────────────────────────────────────────── */

/**
 * The blind's slat angle, which is the landmark that most needed writing down.
 *
 * `WindowMaterial:Blind.slat_angle` is measured between the glazing's outward
 * normal and the slat's, so **0° and 180° are closed and 90° is open** — the
 * opposite of the convention anyone would assume from a slider running 0 to
 * 180. A reader who takes 0 for "flat and open" gets the shading backwards and
 * nothing on the face would have told them.
 */
const SLAT_ANGLE = [
  new Landmark({
    from: 0, label: 'Closed, tipped down', phrase: 'closed one way',
    note: `At 0° the slats lie parallel to the glazing and the blind is shut. ${IO_REF}`,
  }),
  new Landmark({
    from: 90, label: 'Fully open', phrase: 'fully open',
    note: `At 90° the slats stand perpendicular to the glazing and the blind is fully open. ${IO_REF}`,
  }),
  new Landmark({
    from: 180, label: 'Closed, tipped up', phrase: 'closed the other way',
    note: `At 180° the slats are parallel to the glazing again, shut the other way about. ${IO_REF}`,
  }),
];

const SLAT_WIDTH = [
  new Landmark({
    from: 0.015, to: 0.027, label: 'Mini-blind', phrase: 'a mini-blind',
    note: 'The 16 to 25 mm slat of an interior venetian blind. This desk starts at 25 mm.',
  }),
  new Landmark({
    from: 0.045, to: 0.06, label: 'Venetian', phrase: 'a venetian blind',
    note: 'The traditional 50 mm slat.',
  }),
  new Landmark({
    from: 0.08, to: 0.12, label: 'External louvre', phrase: 'an external louvre',
    note: 'An exterior blade, sized to survive weather rather than to be drawn by a cord.',
  }),
];

const SHADOW_FREQ = [
  new Landmark({
    from: 1, label: 'Every day', phrase: 'recut every day',
    note: 'Exact, and the slowest setting on this face — the sun angles are re-cut for all 365 days.',
  }),
  new Landmark({
    from: 20, label: 'EnergyPlus default', phrase: 'the engine default',
    note: `ShadowCalculation's shading_calculation_update_frequency defaults to 20 days. ${IO_REF}`,
  }),
];

const WARMUP_MAX = [
  new Landmark({
    from: 25, label: 'EnergyPlus default', phrase: 'the engine default',
    note: `Building.maximum_number_of_warmup_days defaults to 25. ${IO_REF}`,
  }),
];

const LOADS_TOL = [
  new Landmark({
    from: 0.04, label: 'EnergyPlus default', phrase: 'the engine default',
    note: `Building.loads_convergence_tolerance_value defaults to 0.04 W. ${IO_REF}`,
  }),
];

const GROUND_REFLECT = [
  new Landmark({
    from: 0.05, to: 0.12, label: 'Asphalt', phrase: 'asphalt',
    note: 'Fresh blacktop reflects almost nothing back at the elevation above it.',
  }),
  new Landmark({
    from: 0.18, to: 0.25, label: 'Grass or soil', phrase: 'grass or soil',
    note: 'The ordinary ground cover, and the value EnergyPlus assumes when nothing is said: 0.20.',
  }),
  new Landmark({
    from: 0.3, to: 0.45, label: 'Concrete or gravel', phrase: 'a pale hard surface',
    note: 'A light paved forecourt, which throws a real second sun at the lower storeys.',
  }),
  new Landmark({
    from: 0.6, to: 0.85, label: 'Fresh snow', phrase: 'fresh snow',
    note: 'A winter ground cover that reflects most of the beam back up at the glazing — worth setting on any building that gets a lying snowpack.',
  }),
];

const GROUND_TEMP = [
  new Landmark({
    from: 17.5, to: 18.5, label: 'Under a conditioned slab', phrase: 'a conditioned slab',
    note: `Not undisturbed soil. The Input Output Reference says outright that for a typical commercial building "a reasonable default value is 2 degreeCelsius less than the average indoor space temperature" — 18 °C under a room held at 20. ${IO_REF}`,
  }),
];

const STOREY_HEIGHT = [
  new Landmark({
    from: 2.4, to: 2.7, label: 'Dwelling', phrase: 'a dwelling',
    note: `${CONVENTION} From the 2.4 m a habitable room is conventionally held above, up to the 2.7 m a good apartment gets. Codes set their own minima and they differ.`,
  }),
  new Landmark({
    from: 3.0, to: 3.9, label: 'Office', phrase: 'an office',
    note: `${CONVENTION} Floor to soffit for a commercial plate, with the services and the raised floor already taken out of it above and below.`,
  }),
  new Landmark({
    from: 5.0, to: 9.0, label: 'Industrial', phrase: 'a shed',
    note: `${CONVENTION} A warehouse or a workshop, where the clear height is set by what has to move through it rather than by anyone standing up in it.`,
  }),
];

const STOREYS = [
  new Landmark({
    from: 1, to: 4, label: 'Low-rise', phrase: 'low-rise',
    note: `${CONVENTION} Walk-up height. The envelope still dominates the heat balance at this depth of stack.`,
  }),
  new Landmark({
    from: 5, to: 12, label: 'Mid-rise', phrase: 'mid-rise',
    note: `${CONVENTION} The ratio of envelope to floor has fallen far enough that the internal gains start to run the building.`,
  }),
  new Landmark({
    from: 13, to: 30, label: 'High-rise', phrase: 'high-rise',
    note: `${CONVENTION} Almost all the heat balance is now internal gain and glazing — and note that this control stacks identical floors, so nothing about wind, stack effect or plant is stacked with them.`,
  }),
];

/**
 * The four walls, with every parameter key that belongs to one.
 *
 * `model.js` keeps its own table of the same walls, because that one carries
 * the surface names the document uses and this file may not import the model.
 * Within this file, though, one table: the plan key's ratios, the shading
 * key's projections and the boundary key's states are three questions asked of
 * the same four walls, and three separate lists is how the north wall's
 * overhang ends up asking about the east wall's glass.
 */
const WALL_FACES = Object.freeze([
  { face: 'north', label: 'N', wwr: 'wwrN', overhang: 'ohN', boundary: 'wallBoundaryN' },
  { face: 'east', label: 'E', wwr: 'wwrE', overhang: 'ohE', boundary: 'wallBoundaryE' },
  { face: 'south', label: 'S', wwr: 'wwrS', overhang: 'ohS', boundary: 'wallBoundaryS' },
  { face: 'west', label: 'W', wwr: 'wwrW', overhang: 'ohW', boundary: 'wallBoundaryW' },
].map(Object.freeze));

/**
 * Which parameter carries each surface's boundary condition.
 *
 * Read here rather than off the `Boundary` control below, because four
 * channels ask this question before that control is ever drawn: whether an
 * opening can be cut into a wall, whether an overhang can hang on it, whether
 * a rooflight has a roof with an outside. The control's faces are built from
 * this same table, so there is one list of six keys and not two.
 */
export const BOUNDARY_KEYS = Object.freeze({
  ...Object.fromEntries(WALL_FACES.map((w) => [w.face, w.boundary])),
  roof: 'roofBoundary',
  floor: 'floorBoundary',
});

/** Whether a surface has anything on the other side of it, as the desk stands. */
export const opensOut = (params, face) => params[BOUNDARY_KEYS[face]] !== ADIABATIC;

/**
 * An adiabatic wall has no outside, and EnergyPlus refuses a subsurface cut
 * into one — `** Severe ** FenestrationSurface:Detailed=…, invalid Building
 * Surface Name=…`, and then a fatal that takes the whole run down before any
 * environment starts. So `applyGlazing` writes no opening there, and a ratio
 * set on that wall reaches no object in the document: the same silent state
 * the overhang note below exists to refuse, arrived at from the other end.
 */
const noOutside = (wall) =>
  `The ${wall} wall is adiabatic, so there is nothing outside it to open onto.`;

const ORIENTATIONS = WALL_FACES.map(({ face, label, wwr }) => ({
  key: wwr,
  side: face,
  label,
  needs: (p) => opensOut(p, face),
  unreached: noOutside(face),
}));

/**
 * An overhang is cut from the opening it shelters — `applyShading` asks
 * `apertureOn` for the wall's opening first and writes nothing at all when
 * there is none. So a projection set on a solid wall is a number that reaches
 * no object in the document, which is worth saying on the wall it was set on:
 * silently, it is the reader turning a control and watching the sheet not
 * move.
 */
const noOpening = (wall) =>
  `The ${wall} wall has no opening, so an overhang there hangs on nothing.`;

const SHADE_SIDES = WALL_FACES.map(({ face, label, wwr, overhang }) => ({
  key: overhang,
  side: face,
  label,
  // Two ways for this one to reach nothing, and the note has to say which:
  // the wall can be solid, or it can have no outside for an opening to be in.
  // Hence a function here where the ratios above carry a sentence.
  needs: (p) => opensOut(p, face) && p[wwr] > 0,
  unreached: (p) => (opensOut(p, face) ? noOpening(face) : noOutside(face)),
}));

// An opening exists where the ratio is off zero *and* the wall it would be cut
// into has an outside — the applier writes exactly that set, so every
// precondition asking "is there any glass" has to ask the same question or it
// will engage a channel that has nothing to work on.
const glazed = (p) => WALL_FACES.some(({ face, wwr }) => opensOut(p, face) && p[wwr] > 0);
const layered = (p) => p.glazingModel === 'Layered';
// Roof glazing is deliberately a separate question from wall glazing: the two
// channels own different holes in different surfaces, and everything that
// depends on "is there glass here" has to say which glass it means. Fins and
// frames are a wall opening's business; daylight is either one's.
const skylit = (p) => p.skyRatio > 0 && opensOut(p, 'roof');
// Whether the rooflights are built of the walls' own assembly. It matters
// beyond the Skylights strip: a blind can only be hung on the layered
// construction, so a rooflight glazed in its own simple unit is one the Blinds
// channel cannot reach.
const skyAsWalls = (p) => p.skyGlass === 'Walls';

export const CHANNELS = Object.freeze([
  new Channel({
    id: 'massing',
    index: '00',
    name: 'Massing',
    term: 'A∕V',
    blurb: 'The box itself. Every channel below is measured against the envelope this makes.',
    bypassable: false,
    meter: new Meter({ label: 'Envelope ÷ volume', terms: [], derived: true }),
    controls: [
      new Scale({ key: 'width', label: 'Width', value: 15.24, min: 4, max: 40, step: 0.01, unit: 'm' }),
      new Scale({ key: 'depth', label: 'Depth', value: 15.24, min: 4, max: 40, step: 0.01, unit: 'm' }),
      new Scale({
        key: 'height', label: 'Height', value: 4.572, min: 2.4, max: 12, step: 0.01, unit: 'm',
        landmarks: STOREY_HEIGHT,
      }),
      new Scale({
        key: 'multiplier',
        label: 'Zone multiplier',
        value: 1,
        min: 1,
        max: 30,
        step: 1,
        digits: 0,
        unit: '×',
        landmarks: STOREYS,
        note: 'Stands identical floors on this one. Loads scale; the drawing does not.',
      }),
    ],
  }),

  new Channel({
    id: 'site',
    index: '01',
    name: 'Site',
    term: 'Q☼',
    blurb:
      'Where the box stands and which way it faces. North turns the building under the sun — the vertices themselves turn, so the drawing holds the box square to the page and turns its north point instead.',
    bypassable: false,
    controls: [
      new Bearing({
        key: 'northAxis',
        label: 'North axis',
        value: 0,
        note: 'Turned into the vertices, since World coordinates have EnergyPlus ignore Building.north_axis. At 0 the wall this demo glazes faces due south.',
      }),
      new Selector({
        key: 'terrain',
        label: 'Terrain',
        value: 'Suburbs',
        note: 'Sets the wind profile the exterior film coefficients are computed against.',
        options: [
          { value: 'Country', label: 'Country' },
          { value: 'Suburbs', label: 'Suburb' },
          { value: 'City', label: 'City' },
          { value: 'Ocean', label: 'Ocean' },
        ],
      }),
      new Scale({
        key: 'groundReflect',
        label: 'Ground reflectance',
        value: 0.2,
        min: 0,
        max: 0.9,
        step: 0.01,
        digits: 2,
        landmarks: GROUND_REFLECT,
      }),
      new Scale({
        key: 'groundTemp',
        label: 'Ground temperature',
        value: 18,
        min: 2,
        max: 26,
        step: 0.5,
        digits: 1,
        unit: '°C',
        landmarks: GROUND_TEMP,
        needs: (p) => p.floorBoundary === 'Ground',
        note: 'Only reaches the model with a grounded floor.',
      }),
      new Selector({
        key: 'solarDist',
        label: 'Solar distribution',
        value: 'FullExterior',
        note: 'What the engine bothers to shade. Minimal ignores every overhang on the sheet.',
        options: [
          { value: 'MinimalShadowing', label: 'Minimal' },
          { value: 'FullExterior', label: 'Exterior' },
          { value: 'FullInteriorAndExterior', label: 'Full' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'context',
    index: '02',
    name: 'Context',
    term: 'Q☼∅',
    blurb:
      'The neighbours. One obstructing slab at a bearing and a distance, which is all it takes to find out whose shadow the south elevation you designed is standing in.',
    bypassed: true,
    meter: new Meter({ label: 'Obstruction altitude', terms: [], derived: true }),
    controls: [
      new Bearing({ key: 'ctxAzimuth', label: 'Bearing from site', value: 180 }),
      new Scale({ key: 'ctxDistance', label: 'Distance', value: 20, min: 3, max: 120, step: 0.5, digits: 1, unit: 'm' }),
      new Scale({ key: 'ctxHeight', label: 'Height', value: 18, min: 2, max: 120, step: 0.5, digits: 1, unit: 'm' }),
      new Scale({ key: 'ctxWidth', label: 'Width', value: 40, min: 4, max: 200, step: 1, digits: 0, unit: 'm' }),
    ],
  }),

  new Channel({
    id: 'glazing',
    index: '03',
    name: 'Glazing',
    term: 'Q☼→',
    blurb:
      'The openings, wall by wall. Punched lights keep their proportion at any ratio; a ribbon spends the same area on width instead.',
    requires: {
      // A window is cut into a wall, so it needs a wall with an outside to be
      // cut into. Both ways of losing them all are asked here: every wall set
      // adiabatic on the Fabric strip's key, and the Fabric channel itself
      // patched out, which sends all six surfaces the same way.
      //
      // `off` reads the patch bay rather than the decided state, which is what
      // makes this precondition legal at all: Fabric is declared four strips
      // below this one, so `on('fabric')` would be asking about a channel that
      // has not been decided yet. Being bypassed is an input to that decision
      // and can be read in any order — see `channelState`.
      test: (p, on, off) => !off('fabric') && WALL_FACES.some(({ face }) => opensOut(p, face)),
      reason: 'Needs a wall with an outside — every wall of this box is adiabatic.',
    },
    meter: new Meter({
      label: 'Transmitted solar',
      terms: [new Term({ variable: 'Enclosure Windows Total Transmitted Solar Radiation Rate' })],
      note: 'Reaches the air through the surfaces, so it is read here and summed under Fabric.',
    }),
    readout: new Readout({
      label: 'As built',
      note: 'The engine\'s own figures for this assembly, off the run\'s envelope summary: the glass, and under it the whole window wherever there is a frame for the glass to be corrected against. Under the simple model they are the three sliders above, back from the equivalent layer they were turned into; under the layered one they are what the panes, the coating and the cavity came to, and there is nowhere else to read them.',
    }),
    controls: [
      new Facade({
        key: 'wwr',
        label: 'Window-to-wall ratio',
        short: 'Glazing',
        sides: ORIENTATIONS,
        min: 0,
        max: 0.9,
        step: 0.01,
        digits: 2,
        zero: 'Solid',
        landmarks: WWR,
      }),
      new Selector({
        key: 'aperture',
        label: 'Aperture',
        value: 'Punched',
        note: 'How the ratio is spent: as a proportioned light, a band, or a full-height slot.',
        options: [
          { value: 'Punched', label: 'Punched' },
          { value: 'Ribbon', label: 'Ribbon' },
          { value: 'Full', label: 'Full height' },
        ],
      }),
      new Scale({
        key: 'sill',
        label: 'Sill height',
        value: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        digits: 2,
        needs: (p) => p.aperture !== 'Full',
        note: 'Where the opening sits in its travel. 0 is on the floor, 1 is under the ceiling.',
      }),
      new Selector({
        key: 'glazingModel',
        label: 'Glazing model',
        value: 'Simple',
        note: 'Simple takes the three numbers off a product sheet. Layered builds a real assembly, which is what a blind can be hung on.',
        options: [
          { value: 'Simple', label: 'Simple' },
          { value: 'Layered', label: 'Layered' },
        ],
      }),
      new Scale({
        key: 'uFactor',
        label: 'U-factor',
        value: 1.8,
        min: 0.4,
        max: 6,
        step: 0.01,
        unit: 'W/m²K',
        landmarks: GLASS_U,
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'shgc',
        label: 'SHGC',
        value: 0.4, min: 0.05, max: 0.9, step: 0.01, digits: 2,
        landmarks: GLASS_SHGC,
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'visT',
        label: 'Visible transmittance',
        value: 0.6, min: 0.05, max: 0.9, step: 0.01, digits: 2,
        landmarks: GLASS_VT,
        needs: (p) => !layered(p),
      }),
      new Scale({
        key: 'panes',
        label: 'Panes',
        value: 2,
        min: 2,
        max: 4,
        step: 1,
        digits: 0,
        landmarks: PANE_COUNT,
        needs: layered,
        note: 'Sheets of glass, with a cavity of the width below between each pair. The simple model has no pane count to give — its three numbers are the whole assembly already — so this is the one place on the desk where a window is built rather than specified.',
      }),
      new Scale({
        key: 'paneEmiss',
        label: 'Low-e coating',
        value: 0.84,
        min: 0.04,
        max: 0.84,
        step: 0.01,
        digits: 2,
        landmarks: PANE_EMISS,
        needs: layered,
        note: 'Inboard pane, outside face.',
      }),
      new Scale({
        key: 'gapWidth',
        label: 'Cavity width',
        value: 0.013,
        min: 0.006,
        max: 0.05,
        step: 0.001,
        digits: 3,
        unit: 'm',
        landmarks: GAP_WIDTH,
        needs: layered,
      }),
      new Scale({
        key: 'frameWidth',
        label: 'Frame width',
        value: 0,
        min: 0,
        max: 0.2,
        step: 0.005,
        digits: 3,
        unit: 'm',
        zero: 'None',
        landmarks: FRAME_WIDTH,
        needs: glazed,
        note: 'Adds a framed perimeter outside the glass, with its own conductance.',
      }),
      new Scale({
        key: 'frameCond',
        label: 'Frame conductance',
        value: 3,
        min: 0.5,
        max: 12,
        step: 0.1,
        digits: 1,
        unit: 'W/m²K',
        landmarks: FRAME_COND,
        needs: (p) => p.frameWidth > 0,
      }),
    ],
  }),

  new Channel({
    id: 'skylights',
    index: '04',
    name: 'Skylights',
    term: 'Q☼↧',
    blurb:
      'The other way in. A rooflight faces the one part of the sky that is never behind a neighbour and never off to one side, so it collects hardest exactly when the building least wants it — and a curb is the only overhang it will ever have.',
    bypassed: true,
    requires: {
      // The same precondition as Glazing, asked of the one surface this
      // channel opens. A curb is a `Shading:Zone:Detailed` on the roof and the
      // engine refuses that on an adiabatic base surface exactly as it refuses
      // the rooflight itself, so both go out together with the boundary.
      test: (p, on, off) => !off('fabric') && opensOut(p, 'roof'),
      reason: 'Needs a roof with an outside to cut a rooflight into.',
    },
    // Read off the roof rather than out of the ESO. The transmitted-solar
    // series the Glazing strip reads is the enclosure's total, walls and roof
    // together, so repeating it here would say nothing about the rooflights in
    // particular; the area and the ratio it makes are what this strip is for,
    // and they are true before anything has been run.
    meter: new Meter({ label: 'Roof glazing', terms: [], derived: true }),
    controls: [
      new Scale({
        key: 'skyRatio',
        label: 'Skylight-to-roof ratio',
        value: 0.06,
        min: 0,
        max: 0.3,
        step: 0.005,
        digits: 3,
        zero: 'Solid',
        landmarks: SKY_RATIO,
        note: 'Of the gross roof.',
      }),
      new Selector({
        key: 'skyForm',
        label: 'Arrangement',
        value: 'Square',
        options: [
          { value: 'Square', label: 'Square lights' },
          { value: 'Linear', label: 'Linear' },
        ],
        needs: skylit,
        note: 'The same area, spread as discrete lights or as continuous rooflights running the width.',
      }),
      new Scale({
        key: 'skyCount',
        label: 'Units across',
        value: 2,
        min: 1,
        max: 4,
        step: 1,
        digits: 0,
        unit: '×',
        needs: skylit,
        note: 'Square lights sit one per cell of an n × n grid, so 4 across is sixteen of them; linear rooflights are n bands.',
      }),
      new Scale({
        key: 'skyCurb',
        label: 'Curb height',
        value: 0.15,
        min: 0,
        max: 1.2,
        step: 0.01,
        unit: 'm',
        zero: 'Flush',
        landmarks: SKY_CURB,
        needs: skylit,
        note: 'The upstand a rooflight is bedded on, standing all the way round. It is the roof\'s overhang, and the only shade a horizontal opening gets.',
      }),
      new Selector({
        key: 'skyGlass',
        label: 'Rooflight glass',
        value: 'Walls',
        options: [
          { value: 'Walls', label: 'As walls' },
          { value: 'Own', label: 'Its own' },
        ],
        needs: skylit,
        note: 'Its own is a simple unit and nothing can be hung inside one, so rooflights glazed that way take no blind — the walls\' assembly is what the Blinds strip reaches.',
      }),
      new Scale({
        key: 'skyU',
        label: 'Rooflight U-factor',
        value: 2.6,
        min: 0.4,
        max: 6,
        step: 0.01,
        unit: 'W/m²K',
        landmarks: ROOFLIGHT_U,
        needs: (p) => skylit(p) && !skyAsWalls(p),
        note: 'A domed unit is a worse assembly than a wall window of the same generation, and it loses to a colder sky.',
      }),
      new Scale({
        key: 'skySHGC',
        label: 'Rooflight SHGC',
        value: 0.35,
        min: 0.05,
        max: 0.9,
        step: 0.01,
        digits: 2,
        landmarks: GLASS_SHGC,
        needs: (p) => skylit(p) && !skyAsWalls(p),
      }),
      new Scale({
        key: 'skyVisT',
        label: 'Rooflight visible transmittance',
        value: 0.5,
        min: 0.05,
        max: 0.9,
        step: 0.01,
        digits: 2,
        landmarks: GLASS_VT,
        needs: (p) => skylit(p) && !skyAsWalls(p),
      }),
    ],
  }),

  new Channel({
    id: 'shading',
    index: '05',
    name: 'Shading',
    term: 'Q☼↓',
    blurb:
      'Overhangs run the width of their opening, so what you set is the one thing that matters on a sunny elevation: how far they reach. Fins stand at both jambs.',
    meter: new Meter({ label: 'Shade area', terms: [], derived: true }),
    controls: [
      new Facade({
        key: 'overhang',
        label: 'Overhang projection',
        short: 'Overhang',
        sides: SHADE_SIDES,
        min: 0, max: 3, step: 0.01, digits: 2, unit: 'm', zero: 'None',
        landmarks: OVERHANG,
      }),
      new Scale({
        key: 'ohRise',
        label: 'Overhang above head',
        value: 0, min: 0, max: 1.5, step: 0.01, unit: 'm', zero: 'At head',
        note: 'Lifting it off the head lets low winter sun back under.',
      }),
      new Scale({
        key: 'fin',
        label: 'Side fins',
        value: 0, min: 0, max: 3, step: 0.01, unit: 'm', zero: 'None',
        needs: glazed,
        note: 'Stood at both jambs of every opening there is.',
      }),
      new Scale({
        key: 'finOffset',
        label: 'Fin offset from jamb',
        value: 0, min: 0, max: 1.5, step: 0.01, unit: 'm', zero: 'At jamb',
        needs: (p) => p.fin > 0,
      }),
    ],
  }),

  new Channel({
    id: 'blinds',
    index: '06',
    name: 'Blinds',
    term: 'Q☼⇅',
    blurb:
      'Shading that answers the weather instead of standing still. The control decides when it deploys, and the slat angle decides what gets through when it does.',
    bypassed: true,
    requires: {
      // The rooflights count as openings a blind can hang on only when they
      // are glazed in the walls' own assembly; their own unit is simple
      // glazing, which is one equivalent layer with no cavity to hang anything
      // in, and EnergyPlus will not accept a shading device on it.
      //
      // Both branches ask whether the opening is actually in the document and
      // not only whether a slider is off zero, for the reason Daylight's
      // precondition does: a channel that is patched out has had its openings
      // deleted, and a blind with nothing to hang in writes an unreferenced
      // material and no shading control at all while the strip reads engaged.
      test: (p, on) =>
        layered(p) &&
        ((glazed(p) && on('glazing')) || (skylit(p) && skyAsWalls(p) && on('skylights'))),
      reason: 'Needs the layered glazing model and at least one opening it can hang in.',
    },
    meter: new Meter({
      label: 'Transmitted solar',
      terms: [new Term({ variable: 'Enclosure Windows Total Transmitted Solar Radiation Rate' })],
      note: 'The same reading as Glazing. Watch it fall as the blind deploys.',
    }),
    controls: [
      new Selector({
        key: 'shadeType',
        label: 'Device',
        value: 'InteriorBlind',
        options: [
          { value: 'InteriorBlind', label: 'Interior' },
          { value: 'ExteriorBlind', label: 'Exterior' },
          { value: 'BetweenGlassBlind', label: 'Mid-pane' },
        ],
        note: 'Exterior stops the heat before it is in the room, and weathers for a living.',
      }),
      new Selector({
        key: 'shadeControl',
        label: 'Deploys',
        value: 'OnIfHighSolarOnWindow',
        options: [
          { value: 'AlwaysOn', label: 'Always' },
          { value: 'OnIfHighSolarOnWindow', label: 'On solar' },
          { value: 'OnIfHighZoneAirTemperature', label: 'On zone temp' },
          { value: 'OnIfHighOutdoorAirTemperature', label: 'On outdoor temp' },
        ],
      }),
      new Scale({
        key: 'shadeSetpoint',
        label: 'Setpoint',
        value: 200, min: 20, max: 600, step: 5, digits: 0,
        needs: (p) => p.shadeControl !== 'AlwaysOn',
        note: 'W/m² on the glass, or °C, depending on what it is watching.',
      }),
      new Scale({
        key: 'slatAngle', label: 'Slat angle', value: 45, min: 0, max: 180, step: 1, digits: 0, unit: '°',
        landmarks: SLAT_ANGLE,
        note: 'Measured from the glazing\'s outward normal, not from the horizontal, so 90° is fully open and both stops are shut.',
      }),
      new Scale({
        key: 'slatWidth', label: 'Slat width', value: 0.025, min: 0.01, max: 0.12, step: 0.001, digits: 3, unit: 'm',
        landmarks: SLAT_WIDTH,
      }),
    ],
  }),

  new Channel({
    id: 'fabric',
    index: '07',
    name: 'Fabric',
    term: 'Q↔',
    blurb:
      'The opaque envelope, and which of the six surfaces are in it. Bypassed, every surface goes adiabatic and the box becomes a flask — the cleanest way there is to see what the other channels are worth. Glazing, Skylights and Shading come out with it, and say so: an opening needs a surface with an outside to be cut into.',
    meter: new Meter({
      label: 'Surface convection to air',
      rail: true,
      terms: [new Term({ variable: 'Zone Air Heat Balance Surface Convection Rate' })],
      note: 'Every inside face, glass included. This is where solar and conduction reach the air.',
    }),
    controls: [
      new Scale({
        key: 'wallR', label: 'Wall resistance', value: 2.290965,
        min: 0.2, max: 10, step: 0.005, unit: 'm²K/W',
        landmarks: WALL_R,
        note: 'One insulating layer, not the whole build-up: EnergyPlus adds the surface films either side.',
      }),
      new Scale({
        key: 'roofR', label: 'Roof resistance', value: 5.456, min: 0.2, max: 14, step: 0.005, unit: 'm²K/W',
        landmarks: ROOF_R,
      }),
      new Scale({
        key: 'wallMass', label: 'Wall mass layer', value: 0,
        min: 0, max: 0.4, step: 0.005, digits: 3, unit: 'm', zero: 'None',
        landmarks: WALL_MASS,
        note: 'Heavyweight masonry set inboard of the insulation.',
      }),
      new Scale({
        key: 'wallAbs', label: 'Wall absorptance', value: 0.75, min: 0.05, max: 0.95, step: 0.01, digits: 2,
        landmarks: SOLAR_ABS,
      }),
      new Scale({
        key: 'roofAbs', label: 'Roof absorptance', value: 0.75, min: 0.05, max: 0.95, step: 0.01, digits: 2,
        landmarks: ROOF_ABS,
      }),
      new Scale({
        key: 'emittance', label: 'Thermal emittance', value: 0.9, min: 0.05, max: 0.95, step: 0.01, digits: 2,
        landmarks: EMITTANCE,
        note: 'How well the outer face radiates to the sky at night.',
      }),
      new Boundary({
        key: 'boundaries',
        label: 'Surface boundaries',
        faces: [
          ...WALL_FACES.map(({ face, label, boundary }) => ({
            key: boundary, face, label, open: 'Outdoors', value: 'Outdoors',
          })),
          { key: 'roofBoundary', face: 'roof', label: 'Roof', open: 'Outdoors', value: 'Outdoors' },
          // The stock model floats its slab, which is where this desk has
          // always opened. Grounding it opens a path that never sleeps.
          { key: 'floorBoundary', face: 'floor', label: 'Floor', open: 'Ground', value: 'Adiabatic' },
        ],
        note:
          'Adiabatic stops the model at the inside face: a party wall, a floor over a heated space, one bay of a longer building. Such a surface carries no opening — the engine refuses a window cut into a surface with no outside — so glazing, rooflights and shading come off it with the boundary.',
      }),
      new Selector({
        key: 'windExposure', label: 'Wind exposure', value: 'WindExposed',
        options: [
          { value: 'WindExposed', label: 'Exposed' },
          { value: 'NoWind', label: 'Sheltered' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'mass',
    index: '08',
    name: 'Mass',
    term: 'Qsto',
    blurb:
      'What the building remembers. Bypassed, the slab is swapped for a massless layer of the same resistance, so the only thing that changes is storage.',
    meter: new Meter({
      label: 'Air energy storage',
      rail: true,
      // The accumulation side of the balance, so it enters the rail negated:
      // heat going into store is heat the air does not keep.
      terms: [new Term({ variable: 'Zone Air Heat Balance Air Energy Storage Rate', sign: -1 })],
    }),
    controls: [
      new Scale({
        key: 'slab', label: 'Slab thickness', value: 0.1014984,
        min: 0.02, max: 0.6, step: 0.001, digits: 3, unit: 'm',
        landmarks: SLAB_DEPTH,
        note: 'Four inches of heavyweight concrete is the stock example.',
      }),
      new Selector({
        key: 'slabMaterial', label: 'Slab material', value: 'Heavy',
        options: [
          { value: 'Heavy', label: 'Concrete' },
          { value: 'Light', label: 'Lightweight' },
          { value: 'Timber', label: 'Timber' },
        ],
      }),
      new Scale({
        key: 'internalMass', label: 'Internal mass', value: 0,
        min: 0, max: 4, step: 0.05, digits: 2, unit: '× floor', zero: 'None',
        landmarks: INTERNAL_MASS,
        note: 'Partitions and furniture, as a multiple of the floor area.',
      }),
      new Scale({
        key: 'internalMassThickness', label: 'Its thickness', value: 0.1,
        min: 0.01, max: 0.4, step: 0.005, digits: 3, unit: 'm',
        needs: (p) => p.internalMass > 0,
      }),
      new Selector({
        key: 'hbAlgorithm', label: 'Heat balance', value: 'ConductionTransferFunction',
        note: 'Finite difference resolves the slab through its depth, and costs several times the run time.',
        options: [
          { value: 'ConductionTransferFunction', label: 'CTF' },
          { value: 'ConductionFiniteDifference', label: 'CondFD' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'air',
    index: '09',
    name: 'Air',
    term: 'Qinf',
    blurb:
      'Leakage you did not ask for, and ventilation you did. The night-flush controls only open the building when it actually helps: warm inside, cooler out, and a real difference between the two.',
    bypassed: true,
    meter: new Meter({
      label: 'Outdoor air transfer',
      rail: true,
      // Infiltration and ventilation together, which is the shape of the term
      // in the air balance — the two enter the zone air the same way.
      terms: [new Term({ variable: 'Zone Air Heat Balance Outdoor Air Transfer Rate' })],
    }),
    controls: [
      new Scale({
        key: 'infiltration', label: 'Infiltration', value: 0.5,
        min: 0, max: 3, step: 0.01, digits: 2, unit: 'ACH', zero: 'Sealed',
        landmarks: INFILTRATION,
        note: 'Air changes at natural pressure, not the ACH50 a blower door reports — the usual rule divides one by about twenty to get the other.',
      }),
      new Scale({
        key: 'infConstant', label: 'Constant coefficient', value: 1,
        min: 0, max: 1, step: 0.01, digits: 2,
        landmarks: INF_CONSTANT,
        needs: (p) => p.infiltration > 0,
        note: 'The A of A + B·ΔT + C·v. Move weight off it and on to the two below to make leakage answer the weather.',
      }),
      new Scale({
        key: 'infWind', label: 'Wind coefficient', value: 0,
        min: 0, max: 0.4, step: 0.005, digits: 3, zero: 'None',
        landmarks: INF_WIND,
        needs: (p) => p.infiltration > 0,
      }),
      new Scale({
        key: 'infStack', label: 'Stack coefficient', value: 0,
        min: 0, max: 0.1, step: 0.001, digits: 3, zero: 'None',
        landmarks: INF_STACK,
        needs: (p) => p.infiltration > 0,
      }),
      new Scale({
        key: 'ventilation', label: 'Ventilation', value: 0,
        min: 0, max: 12, step: 0.05, digits: 2, unit: 'ACH', zero: 'None',
        landmarks: VENTILATION,
        note: 'Openable area, as air changes. Night flush lives here.',
      }),
      new Selector({
        key: 'ventType', label: 'Driven by', value: 'Natural',
        needs: (p) => p.ventilation > 0,
        options: [
          { value: 'Natural', label: 'Stack' },
          { value: 'Intake', label: 'Supply fan' },
          { value: 'Exhaust', label: 'Extract fan' },
          { value: 'Balanced', label: 'Balanced' },
        ],
      }),
      new Scale({
        key: 'ventMinIndoor', label: 'Open above indoor', value: 22,
        min: 10, max: 32, step: 0.5, digits: 1, unit: '°C',
        needs: (p) => p.ventilation > 0,
      }),
      new Scale({
        key: 'ventMaxOutdoor', label: 'Open below outdoor', value: 20,
        min: 5, max: 32, step: 0.5, digits: 1, unit: '°C',
        needs: (p) => p.ventilation > 0,
      }),
      new Scale({
        key: 'ventDeltaT', label: 'Minimum ΔT', value: 2,
        min: 0, max: 10, step: 0.5, digits: 1, unit: 'K',
        needs: (p) => p.ventilation > 0,
        note: 'Indoor minus outdoor. Below this the opening is not worth the draught.',
      }),
      new Scale({
        key: 'ventMaxWind', label: 'Shut above wind', value: 40,
        min: 1, max: 40, step: 0.5, digits: 1, unit: 'm/s',
        landmarks: WIND,
        needs: (p) => p.ventilation > 0,
        note: 'Left at the stop the window never shuts: 40 m/s is past a hurricane.',
      }),
    ],
  }),

  new Channel({
    id: 'gains',
    index: '10',
    name: 'Gains',
    term: 'Qint',
    blurb:
      'People, light and equipment on one occupancy profile. Bypassed, the zone holds nothing that gives off heat; these are the first gains that land.',
    bypassed: true,
    meter: new Meter({
      label: 'Internal convective gain',
      rail: true,
      terms: [new Term({ variable: 'Zone Air Heat Balance Internal Convective Heat Gain Rate' })],
    }),
    controls: [
      new Scale({
        key: 'occupancy', label: 'Occupant density', value: 12,
        min: 4, max: 60, step: 0.5, digits: 1, unit: 'm²/pp',
        landmarks: OCCUPANCY,
      }),
      new Scale({
        key: 'activity', label: 'Activity level', value: 120,
        min: 70, max: 400, step: 5, digits: 0, unit: 'W/pp',
        landmarks: ACTIVITY,
        note: 'Total heat, sensible and latent together. Heavy machine work is 425 W and athletics 525 W, both past the top of this face.',
      }),
      new Scale({
        key: 'lighting', label: 'Lighting', value: 8, min: 0, max: 30, step: 0.1, digits: 1, unit: 'W/m²', zero: 'Dark',
        landmarks: LIGHTING,
      }),
      new Scale({
        key: 'lightRadiant', label: 'Lighting radiant fraction', value: 0.42,
        min: 0, max: 0.9, step: 0.01, digits: 2,
        needs: (p) => p.lighting > 0,
        note: 'What goes to the surfaces rather than straight to the air.',
      }),
      new Scale({
        key: 'equipment', label: 'Equipment', value: 8, min: 0, max: 60, step: 0.1, digits: 1, unit: 'W/m²', zero: 'None',
        landmarks: EQUIPMENT,
      }),
      new Scale({
        key: 'equipLatent', label: 'Equipment latent fraction', value: 0,
        min: 0, max: 0.6, step: 0.01, digits: 2, zero: 'Dry',
        needs: (p) => p.equipment > 0,
      }),
      new Profile({
        key: 'occupied', label: 'Occupied hours', from: 'occFrom', to: 'occTo',
        note: 'Writes a Schedule:Compact. Outside the band the gains fall to a tenth.',
      }),
      new Selector({
        key: 'weekend', label: 'Weekends', value: 'Unoccupied',
        options: [
          { value: 'Unoccupied', label: 'Closed' },
          { value: 'Occupied', label: 'Open' },
        ],
      }),
      // Lives here rather than on Run because Run says *when* the holidays are
      // and this says what the building does on one, which is a question about
      // occupancy. At "As weekend" no `For: Holidays` row is written at all and
      // `AllOtherDays` catches a holiday exactly as it always has — which is
      // also the admission that until this control existed, a holiday and a
      // Sunday were the same day to every schedule on the desk.
      new Selector({
        key: 'holidayUse', label: 'Holidays', value: 'AsWeekend',
        options: [
          { value: 'AsWeekend', label: 'As weekend' },
          { value: 'Closed', label: 'Closed' },
          { value: 'Open', label: 'Open' },
        ],
        needs: (p) => p.holidays !== 'No',
      }),
    ],
  }),

  new Channel({
    id: 'daylight',
    index: '11',
    name: 'Daylight',
    term: 'Qlux',
    blurb:
      'The channel that closes the loop. A sensor in the room dims the lights against the daylight the windows let in, so a bigger opening buys back some of the load it costs.',
    bypassed: true,
    requires: {
      // Either kind of opening will do, but it has to be one the document
      // actually holds: a channel that is patched out has had its openings
      // removed, and a daylight sensor in a room with none is a control the
      // engine warns about and the sheet would letter as if it worked.
      test: (p, on) => (glazed(p) && on('glazing')) || (skylit(p) && on('skylights')),
      reason: 'Needs at least one opening — a window or a rooflight — to see daylight through.',
    },
    meter: new Meter({
      label: 'Lighting power',
      terms: [new Term({ variable: 'Zone Lights Electricity Rate' })],
      note: 'Watch it fall away from the Gains setting as the sensor dims.',
    }),
    controls: [
      new Selector({
        key: 'dlControl', label: 'Dimming', value: 'Continuous',
        options: [
          { value: 'Continuous', label: 'Continuous' },
          { value: 'ContinuousOff', label: 'Cont. + off' },
          { value: 'Stepped', label: 'Stepped' },
        ],
      }),
      new Scale({
        key: 'dlSetpoint', label: 'Illuminance setpoint', value: 500, min: 100, max: 1000, step: 10, digits: 0, unit: 'lx',
        landmarks: ILLUMINANCE,
      }),
      new Scale({
        key: 'dlFraction', label: 'Fraction controlled', value: 1,
        min: 0.1, max: 1, step: 0.05, digits: 2,
        note: 'How much of the installed lighting the sensor speaks for.',
      }),
      new Scale({
        key: 'dlDepth', label: 'Sensor depth', value: 0.5,
        min: 0.1, max: 0.95, step: 0.01, digits: 2,
        note: 'Across the plan from the south wall. Deep in the room is the honest place to put it.',
      }),
      new Scale({
        key: 'dlHeight', label: 'Sensor height', value: 0.8, min: 0.1, max: 2, step: 0.05, digits: 2, unit: 'm',
        landmarks: WORK_PLANE,
      }),
    ],
  }),

  new Channel({
    id: 'system',
    index: '12',
    name: 'System',
    term: 'Qsys',
    blurb:
      'The master bus. Bypassed, this is the free-running zone the sheet was built on and the plate reads a float. Engaged, an ideal unit holds the setpoints and the plate reads what that costs.',
    bypassed: true,
    meter: new Meter({
      label: 'System air transfer',
      rail: true,
      terms: [
        new Term({ variable: 'Zone Air Heat Balance System Air Transfer Rate', perBuilding: true }),
      ],
    }),
    controls: [
      new Scale({
        key: 'heatSet', label: 'Heating setpoint', value: 20, min: 10, max: 26, step: 0.5, digits: 1, unit: '°C',
        landmarks: HEAT_SET,
      }),
      new Scale({
        key: 'coolSet', label: 'Cooling setpoint', value: 26, min: 18, max: 34, step: 0.5, digits: 1, unit: '°C',
        landmarks: COOL_SET,
      }),
      new Scale({
        key: 'setback', label: 'Night setback', value: 0,
        min: 0, max: 10, step: 0.5, digits: 1, unit: 'K', zero: 'None',
        note: 'Widens the band outside the occupied hours set under Gains.',
      }),
      new Selector({
        key: 'availability', label: 'Available', value: 'Always',
        options: [
          { value: 'Always', label: 'Always' },
          { value: 'Occupied', label: 'Occupied' },
          { value: 'HeatingOnly', label: 'Heat only' },
          { value: 'CoolingOnly', label: 'Cool only' },
        ],
      }),
      new Scale({
        key: 'outdoorAir', label: 'Outdoor air', value: 0,
        min: 0, max: 20, step: 0.5, digits: 1, unit: 'L/s·pp', zero: 'None',
        landmarks: OUTDOOR_AIR,
        note: 'Air the system has to condition, as opposed to the openings above.',
      }),
      new Selector({
        key: 'economizer', label: 'Economiser', value: 'NoEconomizer',
        needs: (p) => p.outdoorAir > 0,
        options: [
          { value: 'NoEconomizer', label: 'None' },
          { value: 'DifferentialDryBulb', label: 'Drybulb' },
          { value: 'DifferentialEnthalpy', label: 'Enthalpy' },
        ],
      }),
      new Scale({
        key: 'heatRecovery', label: 'Heat recovery', value: 0,
        min: 0, max: 0.9, step: 0.01, digits: 2, zero: 'None',
        landmarks: HEAT_RECOVERY,
        needs: (p) => p.outdoorAir > 0,
        note: 'Sensible effectiveness on the outdoor air stream.',
      }),
      new Scale({ key: 'supplyMaxT', label: 'Max supply air', value: 50, min: 25, max: 60, step: 1, digits: 0, unit: '°C' }),
      new Scale({ key: 'supplyMinT', label: 'Min supply air', value: 13, min: 5, max: 20, step: 0.5, digits: 1, unit: '°C' }),
      new Selector({
        key: 'humidity', label: 'Dehumidification', value: 'None',
        options: [
          { value: 'None', label: 'None' },
          { value: 'ConstantSensibleHeatRatio', label: 'Fixed SHR' },
          { value: 'ConstantSupplyHumidityRatio', label: 'Fixed w' },
        ],
      }),
    ],
  }),

  new Channel({
    id: 'grounds',
    index: '13',
    name: 'Grounds',
    term: '☾',
    blurb:
      'The site after dark. The stock example hangs 5.25 kW of car-park lighting off this model — 23 MWh a year against the building\'s 18 — which is why the bill sections it under Site, outside the building intensity, and why it starts bypassed: a load that size belongs on a strip, not buried in the baseline.',
    bypassed: true,
    meter: new Meter({ label: 'Site electricity', terms: [], derived: true }),
    controls: [
      new Scale({
        key: 'extLights', label: 'Grounds lighting', value: 5.25,
        min: 0.05, max: 20, step: 0.05, digits: 2, unit: 'kW',
        note: 'Installed power across the site: car park, paths, floodlighting. The stock example carries 5.25 kW.',
      }),
      new Selector({
        key: 'extControl', label: 'Switched', value: 'AstronomicalClock',
        options: [
          { value: 'AstronomicalClock', label: 'Dusk to dawn' },
          { value: 'ScheduleNameOnly', label: 'Always on' },
        ],
        note: 'Dusk to dawn follows the sun at the site, so the same kilowatts burn longer hours in a northern winter.',
      }),
    ],
  }),

  new Channel({
    id: 'plant',
    index: '14',
    name: 'Plant',
    term: 'η',
    prices: true,
    bypassable: false,
    blurb:
      'What would have to supply the heat. The ideal unit above delivers it at 100 % efficiency and no efficiency is simulated anywhere in this model, so the plant is applied to the meter reading instead — and the bill prints the division rather than burying it.',
    requires: {
      test: (p, on) => on('system'),
      reason: 'Needs the System channel in the path before there is any heat to supply.',
    },
    meter: new Meter({ label: 'Heat at the meter', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'heatSource', label: 'Heating plant', value: 'GasBoiler',
        options: [
          { value: 'GasBoiler', label: 'Gas boiler' },
          { value: 'Resistance', label: 'Direct electric' },
          { value: 'HeatPump', label: 'Heat pump' },
        ],
      }),
      new Scale({
        key: 'heatEfficiency', label: 'Seasonal efficiency', value: 0.85,
        min: 0.5, max: 1.05, step: 0.01, digits: 2,
        landmarks: BOILER,
        needs: (p) => p.heatSource !== 'HeatPump',
        note: 'Fuel in against useful heat out, across the season.',
      }),
      new Scale({
        key: 'heatCOP', label: 'Seasonal COP', value: 3, min: 1.5, max: 5.5, step: 0.1, digits: 1,
        landmarks: HEAT_COP,
        needs: (p) => p.heatSource === 'HeatPump',
        note: 'Heat delivered per unit of electricity, across the season.',
      }),
      new Scale({
        key: 'coolCOP', label: 'Cooling COP', value: 3.5, min: 2, max: 7, step: 0.1, digits: 1,
        landmarks: COOL_COP,
        note: 'The chiller is electric whatever the heat runs on.',
      }),
    ],
  }),

  new Channel({
    id: 'tariff',
    index: '15',
    name: 'Tariff',
    term: '¤',
    prices: true,
    bypassable: false,
    blurb:
      'The published rate, and what happens if it is wrong. Left alone the bill uses the tariff and grid factor published for this place; taken to Assumed, it uses what you set — which is how a grid that has not decarbonised yet gets tested against one that has.',
    meter: new Meter({ label: 'Electricity rate', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'rateBasis', label: 'Tariff', value: 'Published',
        options: [
          { value: 'Published', label: 'Published' },
          { value: 'Assumed', label: 'Assumed' },
        ],
      }),
      new Scale({
        key: 'elecPrice', label: 'Electricity', value: 0.15, min: 0.02, max: 0.6, step: 0.005, digits: 3,
        unit: '/kWh', needs: (p) => p.rateBasis === 'Assumed',
      }),
      new Scale({
        key: 'gasPrice', label: 'Gas', value: 0.07, min: 0.01, max: 0.3, step: 0.005, digits: 3,
        unit: '/kWh', needs: (p) => p.rateBasis === 'Assumed',
      }),
      new Selector({
        key: 'factorBasis', label: 'Grid factor', value: 'Published',
        options: [
          { value: 'Published', label: 'Published' },
          { value: 'Assumed', label: 'Assumed' },
        ],
      }),
      new Scale({
        key: 'gridFactor', label: 'Grid intensity', value: 200, min: 0, max: 900, step: 5, digits: 0,
        unit: 'gCO₂e/kWh', landmarks: GRID, needs: (p) => p.factorBasis === 'Assumed',
        note: 'The building will outlive the grid it was designed against. Wind this down to find out what it costs then.',
      }),
    ],
  }),

  new Channel({
    id: 'solver',
    index: '16',
    name: 'Solver',
    term: 'Δt',
    blurb:
      'The engine room. Nothing here changes the building; everything here changes how carefully, and how slowly, the building is worked out.',
    bypassable: false,
    meter: new Meter({ label: 'Timesteps per run', terms: [], derived: true }),
    controls: [
      new Selector({
        key: 'timestep', label: 'Timestep', value: 4,
        note: 'Substeps per hour. Reporting stays hourly whatever this says.',
        options: [
          { value: 1, label: '1' },
          { value: 4, label: '4' },
          { value: 6, label: '6' },
          { value: 12, label: '12' },
          { value: 60, label: '60' },
        ],
      }),
      new Selector({
        key: 'insideConv', label: 'Inside convection', value: 'TARP',
        options: [
          { value: 'Simple', label: 'Simple' },
          { value: 'TARP', label: 'TARP' },
          { value: 'AdaptiveConvectionAlgorithm', label: 'Adaptive' },
        ],
      }),
      new Selector({
        key: 'outsideConv', label: 'Outside convection', value: 'DOE-2',
        options: [
          { value: 'SimpleCombined', label: 'Simple' },
          { value: 'TARP', label: 'TARP' },
          { value: 'DOE-2', label: 'DOE-2' },
          { value: 'MoWiTT', label: 'MoWiTT' },
        ],
      }),
      new Scale({
        key: 'shadowFreq', label: 'Shadow recalculation', value: 20,
        min: 1, max: 60, step: 1, digits: 0, unit: 'days',
        landmarks: SHADOW_FREQ,
        note: 'How often the sun angles are re-cut. Every day is exact and slow.',
      }),
      new Selector({
        key: 'skyDiffuse', label: 'Sky diffuse', value: 'SimpleSkyDiffuseModeling',
        options: [
          { value: 'SimpleSkyDiffuseModeling', label: 'Simple' },
          { value: 'DetailedSkyDiffuseModeling', label: 'Detailed' },
        ],
      }),
      new Scale({ key: 'warmupMin', label: 'Warmup, minimum', value: 6, min: 1, max: 25, step: 1, digits: 0, unit: 'days' }),
      new Scale({
        key: 'warmupMax', label: 'Warmup, maximum', value: 30, min: 5, max: 60, step: 1, digits: 0, unit: 'days',
        landmarks: WARMUP_MAX,
      }),
      new Scale({
        key: 'loadsTol', label: 'Loads tolerance', value: 0.04, min: 0.001, max: 0.2, step: 0.001, digits: 3,
        landmarks: LOADS_TOL,
      }),
      new Scale({ key: 'tempTol', label: 'Temperature tolerance', value: 0.004, min: 0.001, max: 0.05, step: 0.001, digits: 3, unit: 'K' }),
    ],
  }),

  new Channel({
    id: 'run',
    index: '17',
    name: 'Run',
    term: '∑h',
    blurb:
      'What gets simulated. Narrowing the run period is the cheapest speed control on the desk, and the only one that costs you nothing but months you were not reading.',
    bypassable: false,
    meter: new Meter({ label: 'Hours to solve', terms: [], derived: true }),
    controls: [
      new Calendar({
        key: 'months', label: 'Run months', value: FULL_YEAR,
        note:
          'Only reaches the model with a weather file attached; without one the run is the two ' +
          'design days. Months need not touch — each unbroken group is written as its own run ' +
          'period, so a January and a July can be solved without the spring between them.',
      }),
      new Selector({
        key: 'sizingPeriods', label: 'Design days', value: 'Yes',
        options: [
          { value: 'Yes', label: 'Run' },
          { value: 'No', label: 'Skip' },
        ],
      }),
      // The two sources are orthogonal in EnergyPlus and the strip has to say so.
      // `use_weather_file_holidays_and_special_days = No` turns off the file's
      // days but leaves any `RunPeriodControl:SpecialDays` standing, and where
      // both are on the file's specification takes precedence. So "From file"
      // still writes the list — it just loses to the file where they collide —
      // and "None" parks a list rather than destroying it, which is what makes
      // the preset buttons safe to press.
      new Selector({
        key: 'holidays', label: 'Holidays', value: 'Yes',
        options: [
          { value: 'Yes', label: 'From file' },
          { value: 'Listed', label: 'Listed' },
          { value: 'No', label: 'None' },
        ],
      }),
      new Days({
        key: 'holidayDays', label: 'Holidays observed', value: '',
        presets: HOLIDAY_CALENDARS,
        needs: (p) => p.holidays !== 'No',
        note:
          'One RunPeriodControl:SpecialDays each. Only reaches the model on a weather-file run period — the design days carry no calendar.',
      }),
      new Selector({
        key: 'holidayRule', label: 'Weekend holiday rule', value: 'No',
        options: [
          { value: 'No', label: 'Keep' },
          { value: 'Yes', label: 'Observe' },
        ],
        needs: (p) => p.holidays !== 'No' && p.holidayUse !== 'AsWeekend',
        note:
          'Moves a holiday that lands on a weekend onto the adjacent weekday. The run follows the weather file\'s own calendar, so the weekend it moves off is a real one.',
      }),
      new Selector({
        key: 'dst', label: 'Daylight saving', value: 'Yes',
        options: [
          { value: 'Yes', label: 'Observe' },
          { value: 'No', label: 'Ignore' },
        ],
      }),
    ],
  }),
]);

/**
 * What the flow drawing letters inside each rail term.
 *
 * Ten hourly zone-level series, which is roughly what the whole console costs
 * today — and the reason every one of them is zone-level and keyed to the one
 * zone rather than requested with `*`. The regression that shaped this file's
 * output policy took the ESO from 15 series to 173 and the annual run from
 * 681 ms to 2,984 ms, and it did so entirely through per-surface keys.
 *
 * Each is gated on the channel that produces it, so a desk with Gains out asks
 * for none of the three internal ones and EnergyPlus lists nothing it could not
 * produce. Verified against the run's own `.rdd` rather than spelled from
 * memory — `Zone Lights Total Heating Rate` and `Zone Electric Equipment Total
 * Heating Rate`, not the `watts_per_zone_floor_area`-era names.
 */
export const TRIBUTARIES = Object.freeze([
  new Tributary({
    id: 'people',
    label: 'People',
    terms: [new Term({ variable: 'Zone People Sensible Heating Rate' })],
    of: 'gains',
    needs: 'gains',
  }),
  new Tributary({
    id: 'lights',
    label: 'Lights',
    terms: [new Term({ variable: 'Zone Lights Total Heating Rate' })],
    of: 'gains',
    needs: 'gains',
    note: 'The whole lighting gain. Its radiant share reaches the air later, through the fabric.',
  }),
  new Tributary({
    id: 'equipment',
    label: 'Equipment',
    terms: [new Term({ variable: 'Zone Electric Equipment Total Heating Rate' })],
    of: 'gains',
    needs: 'gains',
    note: 'The whole equipment gain, radiant share included.',
  }),
  new Tributary({
    id: 'opaque',
    label: 'Opaque surfaces',
    // The signed variable rather than the gain/loss pair: one series instead of
    // two, and no arithmetic to get the sign back.
    terms: [new Term({ variable: 'Zone Opaque Surface Inside Faces Conduction Rate' })],
    of: 'fabric',
    needs: 'fabric',
    note: 'Conduction at the inside face, which is not the same quantity as the convection to the air beside it.',
  }),
  new Tributary({
    id: 'windows',
    label: 'Windows',
    // No signed variable exists for this one, so the gain and the loss are read
    // as a pair and differenced. Only one of the two is ever non-zero.
    terms: [
      new Term({ variable: 'Zone Windows Total Heat Gain Rate' }),
      new Term({ variable: 'Zone Windows Total Heat Loss Rate', sign: -1 }),
    ],
    of: 'fabric',
    needs: ['glazing', 'skylights'],
    note: 'Everything crossing the glass, transmitted solar included — which lands on the surfaces, not in the air.',
  }),
  new Tributary({
    id: 'heatSensible',
    label: 'Sensible heating',
    terms: [new Term({ variable: 'Zone Ideal Loads Supply Air Sensible Heating Rate' })],
    of: 'system',
    needs: 'system',
  }),
  new Tributary({
    id: 'coolSensible',
    label: 'Sensible cooling',
    terms: [new Term({ variable: 'Zone Ideal Loads Supply Air Sensible Cooling Rate', sign: -1 })],
    of: 'system',
    needs: 'system',
  }),
  new Tributary({
    id: 'heatLatent',
    label: 'Latent heating',
    terms: [new Term({ variable: 'Zone Ideal Loads Supply Air Latent Heating Rate' })],
    of: 'system',
    needs: 'system',
  }),
  new Tributary({
    id: 'coolLatent',
    label: 'Latent cooling',
    terms: [new Term({ variable: 'Zone Ideal Loads Supply Air Latent Cooling Rate', sign: -1 })],
    of: 'system',
    needs: 'system',
  }),
]);

// Every `of` and every `needs` has to name a channel that exists, or a rename
// would leave a tributary hanging on nothing and the drawing would quietly lose
// a figure. Thrown at module load, like the landmark rules.
{
  const ids = new Set(CHANNELS.map((c) => c.id));
  const rails = new Set(CHANNELS.filter((c) => c.meter?.rail).map((c) => c.id));
  for (const tributary of TRIBUTARIES) {
    if (!rails.has(tributary.of)) {
      throw new Error(`tributary "${tributary.id}" hangs on "${tributary.of}", which is not a rail channel`);
    }
    for (const need of tributary.needs) {
      if (!ids.has(need)) {
        throw new Error(`tributary "${tributary.id}" needs "${need}", which is not a channel`);
      }
    }
  }
}

/**
 * Parameters no single control owns.
 *
 * The plan keys belong to a `Facade`, which names the group rather than any one
 * wall, and the occupancy band belongs to a `Profile`, which owns two.
 */
const LOOSE = Object.freeze({
  occFrom: 8,
  occTo: 18,
  // Openings, per wall. The stock example has no fenestration at all; south at
  // 20 % is this demo's addition and the only one that starts open.
  wwrN: 0,
  wwrE: 0,
  wwrS: 0.2,
  wwrW: 0,
  ohN: 0,
  ohE: 0,
  ohS: 0.6,
  ohW: 0,
});

/** Every control's starting position, flattened. */
export const DEFAULT_PARAMETERS = Object.freeze(
  CHANNELS.reduce(
    (all, channel) => {
      for (const control of channel.controls) {
        // A boundary key owns six parameters and carries all six defaults,
        // which a plan key cannot do: its four walls take theirs from `LOOSE`
        // below because the ratios have no per-wall declaration to hold one,
        // whereas the six surfaces of the box disagree about where they start
        // and each face says so itself.
        if (control.kind === 'boundary') {
          for (const face of control.faces) all[face.key] = face.value;
          continue;
        }
        if (control.kind === 'facade' || control.kind === 'profile') continue;
        all[control.key] = control.value;
      }
      return all;
    },
    { ...LOOSE },
  ),
);

/** Which channels start out of the path. */
export const DEFAULT_BYPASS = Object.freeze(
  Object.fromEntries(CHANNELS.filter((c) => c.bypassable).map((c) => [c.id, c.bypassed])),
);

/**
 * The five the sheet keeps under its axonometric.
 *
 * Not a second definition of anything: `main.js` looks the specs up out of
 * `CHANNELS` by these keys, so the sheet's sliders and the console's scales are
 * the same controls drawn twice, and a range changed here changes both.
 */
export const SHEET_KEYS = Object.freeze(['width', 'depth', 'height', 'wwrS', 'ohS']);

const INDEX = new Map();
for (const channel of CHANNELS) {
  for (const control of channel.controls) {
    if (control.kind === 'facade') {
      for (const side of control.sides) INDEX.set(side.key, { channel, control, side });
    } else if (control.kind === 'boundary') {
      for (const face of control.faces) INDEX.set(face.key, { channel, control, face });
    } else if (control.kind === 'profile') {
      INDEX.set(control.from, { channel, control });
      INDEX.set(control.to, { channel, control });
    } else {
      INDEX.set(control.key, { channel, control });
    }
  }
}

/** Find a control by the parameter key it owns. Throws rather than guessing. */
export function controlFor(key) {
  const found = INDEX.get(key);
  if (!found) throw new Error(`no control owns the parameter "${key}"`);
  return found;
}

/** How a value reads, for any key, wherever it is being lettered. */
export function formatValue(key, value) {
  const { control, face } = controlFor(key);
  // A surface knows its own two states; the control it belongs to only knows
  // the union of six surfaces' states, and would let a floor read `Outdoors`.
  return face ? face.format(value) : control.format(value);
}

/** A label the sheet can use for a key it draws on its own. */
export function labelFor(key) {
  const { control, side, face } = controlFor(key);
  if (face) return `${face.label} boundary`;
  return side ? `${control.short} ${side.label}` : control.label;
}

/**
 * How a key reads inside a sentence, as opposed to on a label.
 *
 * A wall of a plan key has to name its wall here even though the label above
 * it does not: "the study of the overhang projection" is four controls at
 * once, and the reader has four cards on the desk to tell apart. Lower case
 * because every caller sets it mid-sentence.
 */
export function phraseFor(key) {
  const { control, side, face } = controlFor(key);
  const said = control.label.toLowerCase();
  // A surface names itself rather than the group: "the north wall's boundary",
  // and for the two horizontal ones "the roof's boundary" — not "the roof
  // wall's", which is what the plan key's phrasing would have made of it.
  if (face) return face.face === 'roof' || face.face === 'floor'
    ? `the ${face.face}'s boundary`
    : `the ${face.face} wall's boundary`;
  return side ? `the ${side.side} wall's ${said}` : said;
}

export const CHANNEL_BY_ID = Object.freeze(Object.fromEntries(CHANNELS.map((c) => [c.id, c])));

/** Every parameter key, in strip order. Used to key a solve. */
export const ALL_KEYS = Object.freeze([...CHANNELS.flatMap((c) => c.keys()), 'occFrom', 'occTo'].filter(
  (k, i, all) => all.indexOf(k) === i,
));
