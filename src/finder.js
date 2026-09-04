/**
 * Asking the desk a question.
 *
 * A hundred and twenty-nine controls over a hundred and forty-four parameter
 * keys, spread across eighteen channels, and a reader who knows what they are
 * looking for has until now had to know which channel it lives on as well.
 * This module answers two questions about that declaration and nothing else:
 * which controls match a word, and which controls the reader has moved.
 *
 * It is DOM-free and network-free, by the rule `readings.js`, `describe.js`
 * and `tm59.js` already follow, so a throwaway Node harness calls these
 * functions rather than a copy of them — and the correctness worth asserting
 * permanently in this feature is exactly here: that every key the declaration
 * owns can be found by its own name, and that the edit list agrees with the
 * permalink about what has been changed.
 *
 * **The vocabulary is derived and never written.** Every string a query is
 * matched against comes out of `controls.js`, so a control added, renamed or
 * removed there becomes findable, renamed or unfindable with no edit here. A
 * hand-kept list of search terms would be the second copy of the declaration
 * that Principle III exists to refuse, and it would go stale silently — the
 * failure mode being a control that is on the desk and cannot be found, which
 * reads to the reader as a control that does not exist.
 *
 * **Two imports, and the second one is deliberate.** The contract for this
 * module says it imports `controls.js` alone. It imports `channelState` from
 * `model.js` as well, because that function is the desk's own answer to "is
 * this channel in the path, and if not, why not" — the same three states the
 * strips letter. Recomputing it here from `Channel.requires` would be a second
 * copy of fifteen lines whose whole job is to agree with the first, and a
 * finder that told you Plant was available while the Plant card said it was
 * blocked would be worse than no finder. `model.js` is DOM-free and is what the
 * repository's own harnesses already import, so nothing is lost by it.
 *
 * **No fuzzy matching, no stemming, no synonyms.** Each of those invents a
 * vocabulary the declaration does not contain, and on this page a match the
 * reader cannot account for is worse than a miss they can retype past. The
 * vocabulary is small enough to scan whole on every keystroke; the honest
 * answer to a term that finds nothing is to say so.
 */

import {
  ALL_KEYS,
  CHANNELS,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  controlFor,
  formatValue,
  labelFor,
  phraseFor,
} from './controls.js';
import { channelState } from './model.js';

/* ══ the vocabulary ══════════════════════════════════════════════════════ */

/**
 * A query and a declared string, brought into the one form they are compared
 * in: lower case, and every run of anything that is not a letter or a digit
 * flattened to a single space.
 *
 * So `U-value` and `u value` are the same word, and a reader who types
 * `window to wall` finds `Window-to-wall ratio`. It is deliberately no cleverer
 * than that. `m²` keeps its superscript because `²` is a number to Unicode and
 * dropping it would make `m²` and `m` the same string, which is two different
 * quantities under one name.
 */
const normalise = (text) => String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * One string a key can be found by, and what kind of thing said it.
 *
 * The kind is carried so a match can tell the reader *why* it matched — a
 * search for `passive house` that lands on the infiltration scale has matched a
 * landmark rather than the control's own name, and a reader who cannot see
 * which is left wondering whether the desk understood them.
 */
class Phrase {
  constructor(text, kind) {
    this.text = String(text);
    this.norm = normalise(text);
    this.kind = kind; // 'label' | 'channel' | 'landmark' | 'option' | 'zero' | 'unit' | 'subject'
    Object.freeze(this);
  }
}

/** Everything one key can be found by. */
class Entry {
  constructor(key, phrases) {
    this.key = key;
    this.phrases = Object.freeze(phrases);
    Object.freeze(this);
  }
}

/** The whole searchable desk, in declaration order. */
class Vocabulary {
  constructor(entries) {
    this.entries = Object.freeze(entries);
    Object.freeze(this);
  }

  /** Every distinct string in it, which is what the assertions below count. */
  strings() {
    return new Set(this.entries.flatMap((e) => e.phrases.map((p) => p.text)));
  }
}

/**
 * Read the searchable text off the declaration.
 *
 * Built once at mount and never rebuilt: nothing in it depends on the
 * parameters, only on what the controls *are*. What depends on the parameters
 * is whether a match can be turned, which is `find`'s business and is measured
 * on every call.
 */
export function buildVocabulary() {
  const entries = [];
  for (const key of ALL_KEYS) {
    const { channel, control, side, face } = controlFor(key);
    const seen = new Set();
    const phrases = [];
    const say = (text, kind) => {
      if (!text) return; // an absent unit or zero label is not a searchable string
      const norm = normalise(text);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      phrases.push(new Phrase(text, kind));
    };

    // Its own name, as the desk letters it — for a wall of a plan key that is
    // already the wall's ("Overhang W"), and for a surface of the boundary key
    // the surface's ("North boundary").
    say(labelFor(key), 'label');
    // The group's name as well, because a plan key's four walls are one
    // question and a reader searching "window-to-wall ratio" means all four.
    say(control.label, 'label');
    // And how it reads in a sentence, which is what carries "the west wall's".
    say(phraseFor(key), 'label');
    say(channel.name, 'channel');

    // The cases the number is read against. These are the strings a reader is
    // most likely to arrive with, because they are the words the trade uses:
    // somebody looking for the glazing wants "triple", not "U-factor".
    for (const mark of control.landmarks ?? []) {
      say(mark.label, 'landmark');
      say(mark.phrase, 'landmark');
    }
    for (const option of control.options ?? []) {
      say(option.label, 'option');
      // The value too, where it differs from the label: `ContinuousOff` is what
      // the IDF says and a reader who has read the model may search for it.
      say(option.value, 'option');
    }
    say(control.zero, 'zero');
    say(control.unit, 'unit');
    if (side) {
      say(side.label, 'subject');
      say(side.side, 'subject');
    }
    if (face) {
      say(face.label, 'subject');
      say(face.face, 'subject');
    }
    entries.push(new Entry(key, phrases));
  }
  return new Vocabulary(entries);
}

/* ══ what a match cannot do, and why ═════════════════════════════════════ */

/**
 * A control that was found but cannot be turned where it stands, with the
 * sentence saying so.
 *
 * The sentence is the whole class. A greyed control with no explanation is the
 * silent fallback this codebase refuses everywhere else, and it is worse here
 * than elsewhere: the reader went looking for this control, found it, and is
 * now being shown something inert with no account of what would revive it. So
 * a `Blocked` with no sentence throws rather than rendering an empty
 * explanation.
 *
 * A match is **never dropped** for being blocked. Sixty-six of the controls
 * carry a `when` or a `needs` and could be in one of these states at any
 * moment; a finder that hid them would answer "there is no such control" to a
 * reader looking straight at it.
 */
class Blocked {
  constructor({ reason, sentence, fix = null }) {
    if (!sentence) {
      throw new Error(`a control blocked as "${reason}" gives no reason for it`);
    }
    this.reason = reason; // 'patched-out' | 'precondition' | 'other-model' | 'inert' | 'unreached'
    this.sentence = sentence;
    // What would bring it back, where that is a different sentence from why it
    // is away. Null where the first sentence already says it.
    this.fix = fix;
    Object.freeze(this);
  }
}

/**
 * Which of the five, first hit wins.
 *
 * The order is outermost first, because the outer reasons subsume the inner
 * ones: a control on a patched-out channel is also, technically, not reaching
 * the model, and telling the reader the inner reason would send them to fix
 * something that is not what is wrong.
 */
function blockedFor(key, { channel, control, side }, params, state) {
  const here = state.get(channel.id);

  if (here?.bypassed) {
    return new Blocked({
      reason: 'patched-out',
      sentence: `${channel.name} is patched out.`,
      fix: `Patch ${channel.name} back in and this control reaches the model again.`,
    });
  }
  if (here?.blocked) {
    // The channel's own sentence, resolved by `channelState` — which may be a
    // function of the parameters, because a channel can have more than one way
    // to be blocked and one sentence would name the wrong cause half the time.
    return new Blocked({ reason: 'precondition', sentence: here.blocked });
  }
  if (!control.shown(params)) {
    return new Blocked({
      reason: 'other-model',
      sentence: `${channel.name} is set to its other model, and this control belongs to the one that is out.`,
      fix: `The selector at the head of the ${channel.name} card is what brings it back.`,
    });
  }
  if (control.idle(params)) {
    return new Blocked({
      reason: 'inert',
      sentence: 'Set, but reaching nothing as the desk stands.',
      fix: `The control above it on ${channel.name} is what revives it.`,
    });
  }
  // A wall of a plan key, which has its own reason and its own sentence —
  // `Side.unreached` is per wall precisely because one row-wide note could not
  // say which of four walls is inert.
  if (side && !side.reaches(params)) {
    return new Blocked({ reason: 'unreached', sentence: side.reasonFor(params) });
  }
  return null;
}

/* ══ the search ══════════════════════════════════════════════════════════ */

/** One control a query found. */
class Match {
  constructor({ key, control, channel, subject, label, on, blocked, study, stale }) {
    this.key = key;
    this.control = control;
    this.channel = channel;
    // A `Side` or a `Face` where the control serves several subjects, so two
    // identically-named controls can be told apart without choosing one.
    this.subject = subject;
    this.label = label;
    // Which of the key's own strings the query landed on, so a match by a
    // landmark rather than by a name can say so.
    this.on = Object.freeze(on);
    this.blocked = blocked;
    this.study = study;
    this.stale = stale;
    Object.freeze(this);
  }
}

/**
 * Every control a query names, in declaration order.
 *
 * Declaration order rather than by relevance, and that is a claim about the
 * building rather than a shrug about ranking. This desk's order is physical
 * order — channel 01 to 18, in the order the physics happens — so a reader who
 * searches `air` and is handed Fabric's infiltration above the Air channel's
 * own controls has been told something false about where air goes. Where they
 * want ranking they have the channel names in front of them.
 *
 * `studies` is a map from key to `{ study, stale }`, handed in rather than
 * worked out: whether a curve still describes the desk is a question about
 * `restShapeKey`, which lives in `main.js` and is not this module's to answer.
 */
export function find(vocabulary, query, params, bypass, { studies = new Map() } = {}) {
  const wanted = normalise(query);
  // An empty query is not "no matches" — it is "no question", and the caller
  // distinguishes them: the first restores the desk, the second says so in
  // place.
  if (!wanted) return [];

  const state = channelState(params, bypass);
  const found = [];
  for (const entry of vocabulary.entries) {
    const on = entry.phrases.filter((p) => p.norm.includes(wanted));
    if (!on.length) continue;
    const owner = controlFor(entry.key);
    const held = studies.get(entry.key) ?? null;
    found.push(new Match({
      key: entry.key,
      control: owner.control,
      channel: owner.channel,
      subject: owner.side ?? owner.face ?? null,
      label: labelFor(entry.key),
      on: on.map((p) => p.text),
      blocked: blockedFor(entry.key, owner, params, state),
      study: held?.study ?? null,
      stale: Boolean(held?.stale),
    }));
  }
  return found;
}

/* ══ what the reader has changed ═════════════════════════════════════════ */

/** One control sitting off its default. */
class Edit {
  constructor({ key, control, channel, subject, label, value, base }) {
    this.key = key;
    this.control = control;
    this.channel = channel;
    this.subject = subject;
    this.label = label;
    this.value = value;
    this.base = base;
    // Lettered through the control that owns the key, so a boundary reads
    // `Adiabatic` and a scale reads `1.80 W/m²K` — the same words the card
    // beside it is using.
    this.said = formatValue(key, value);
    this.wasSaid = formatValue(key, base);
    Object.freeze(this);
  }
}

/** One channel patched away from where it starts. Patching is an edit. */
class ChannelEdit {
  constructor({ channel, bypassed, base }) {
    this.key = null;
    this.channel = channel;
    this.bypassed = bypassed;
    this.base = base;
    this.label = channel.name;
    this.said = bypassed ? 'Out of the path' : 'In the path';
    this.wasSaid = base ? 'Out of the path' : 'In the path';
    Object.freeze(this);
  }
}

/**
 * Everything the reader has moved, measured now.
 *
 * The same identity comparison `encodeState` takes against the same frozen
 * defaults, over the same `ALL_KEYS`, plus the channels whose patch state
 * differs from `DEFAULT_BYPASS` — which is one entry per channel, exactly as
 * the link writes one `in` or `out` pair per channel. That is not a
 * coincidence to be preserved by hand: they are the same question, *what did
 * the reader change*, and the cheapest true test of this function is that its
 * count equals the link's.
 *
 * Nothing is cached and nothing anywhere records an edit as it happens. A flag
 * can go stale; a measurement cannot. It is the same argument that has
 * `conformance()` re-measuring the desk against every preset on every
 * `applyGeometry` rather than remembering which standard was applied.
 */
export function edits(params, bypass) {
  const moved = [];
  const keysOf = new Map();
  for (const key of ALL_KEYS) keysOf.set(key, controlFor(key));
  for (const channel of CHANNELS) {
    if (channel.bypassable && bypass[channel.id] !== DEFAULT_BYPASS[channel.id]) {
      moved.push(new ChannelEdit({
        channel,
        bypassed: Boolean(bypass[channel.id]),
        base: Boolean(DEFAULT_BYPASS[channel.id]),
      }));
    }
    for (const key of channel.keys()) {
      if (params[key] === DEFAULT_PARAMETERS[key]) continue;
      const { control, side, face } = keysOf.get(key);
      moved.push(new Edit({
        key,
        control,
        channel,
        subject: side ?? face ?? null,
        label: labelFor(key),
        value: params[key],
        base: DEFAULT_PARAMETERS[key],
      }));
    }
  }
  return moved;
}

/* ══ the assertions ══════════════════════════════════════════════════════ */

/**
 * Two things the vocabulary has to be true of before the desk is drawn,
 * checked here rather than at the first search.
 *
 * This follows `readLandmarks`, `assertHideable` and the permalink's reserved
 * key check, all of which throw at module load rather than degrade, and the
 * reason is the same in all four: the failure they guard against has no
 * symptom. A control kind added without teaching `buildVocabulary` about it
 * does not error, it simply cannot be found — and "cannot be found" is
 * indistinguishable, from the reader's chair, from "is not there". Failing at
 * mount is loud, immediate, and lands on whoever added the kind.
 */
function assertVocabulary(vocabulary) {
  const byKey = new Map(vocabulary.entries.map((e) => [e.key, e]));
  for (const key of ALL_KEYS) {
    const entry = byKey.get(key);
    if (!entry) throw new Error(`the finder has no vocabulary for "${key}"`);
    const own = normalise(labelFor(key));
    if (!entry.phrases.some((p) => p.norm === own)) {
      throw new Error(`"${key}" cannot be found by its own name, "${labelFor(key)}"`);
    }
  }
  for (const entry of vocabulary.entries) {
    for (const phrase of entry.phrases) {
      // An empty string is `includes`-true of every query, so one entry left
      // blank would quietly make its control the answer to everything.
      if (!phrase.norm) throw new Error(`"${entry.key}" carries an empty search term`);
    }
  }
  return vocabulary;
}

/**
 * The one vocabulary, built and checked at load.
 *
 * Exported as a value rather than left to the caller to build, so the
 * assertions above run whether or not anybody has searched yet — a desk that
 * boots is a desk whose every control can be found.
 */
export const VOCABULARY = assertVocabulary(buildVocabulary());
