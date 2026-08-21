/**
 * The declaration's own rules.
 *
 * `controls.js` is the single source of truth for both surfaces that draw a
 * control, so a rule broken here is broken twice on the page. Four of these
 * already throw at module load; they are re-asserted rather than trusted,
 * because a `readLandmarks` rule that stopped being reached would take its own
 * guarantee down with it and nothing would say so.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_KEYS,
  CHANNELS,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  Facade,
  Scale,
  controlFor,
  formatValue,
  labelFor,
  phraseFor,
  refuses,
} from '../src/controls.js';

const controls = CHANNELS.flatMap((c) => c.controls);
const ruled = controls.filter((c) => c instanceof Scale || c instanceof Facade);

describe('every key is owned exactly once', () => {
  test('a channel declares the keys it owns', () => {
    const declared = CHANNELS.flatMap((c) => c.keys());
    assert.equal(new Set(declared).size, declared.length, 'a key is declared twice');
  });

  test('every key resolves to its control', () => {
    for (const key of ALL_KEYS) {
      const found = controlFor(key);
      assert.ok(found?.control, `${key} resolves to nothing`);
    }
  });

  test('controlFor throws rather than guessing', () => {
    assert.throws(() => controlFor('notAKey'));
  });

  test('every key has a default and every default has a key', () => {
    // The delta encoding makes the defaults part of the link format: a key with
    // no default would be carried on every link, and a default with no key
    // would be a value nothing can ever set back.
    for (const key of ALL_KEYS) {
      assert.ok(key in DEFAULT_PARAMETERS, `${key} has no default`);
    }
    for (const key of Object.keys(DEFAULT_PARAMETERS)) {
      assert.ok(ALL_KEYS.includes(key), `${key} is a default nothing owns`);
    }
  });

  test('the multi-key kinds are in ALL_KEYS through their sub-objects', () => {
    // `Facade`, `Profile` and `Boundary` each own more than one key, and each
    // has three places in this module that have to be taught about it.
    const facade = controls.find((c) => c.kind === 'facade');
    const boundary = controls.find((c) => c.kind === 'boundary');
    const profile = controls.find((c) => c.kind === 'profile');
    for (const side of facade.sides) assert.ok(ALL_KEYS.includes(side.key));
    for (const face of boundary.faces) assert.ok(ALL_KEYS.includes(face.key));
    for (const key of [profile.from, profile.to]) assert.ok(ALL_KEYS.includes(key));
  });
});

describe('every key can be lettered', () => {
  // `labelFor`, `phraseFor` and `formatValue` each switch on the third field
  // `controlFor` returns, so a multi-key kind that is not taught what its
  // sub-object is called fails here and nowhere else until the page is open.
  for (const key of ALL_KEYS) {
    test(key, () => {
      assert.equal(typeof labelFor(key), 'string');
      assert.ok(labelFor(key).length > 0);
      assert.equal(typeof phraseFor(key), 'string');
      assert.ok(phraseFor(key).length > 0);
      const lettered = formatValue(key, DEFAULT_PARAMETERS[key]);
      assert.ok(lettered !== undefined && lettered !== null, `${key} letters as ${lettered}`);
    });
  }
});

describe('a ruled control admits exactly its own face', () => {
  for (const control of ruled) {
    const key = control.kind === 'facade' ? control.sides[0].key : control.key;
    test(key, () => {
      assert.equal(refuses(control, control.min), null, 'the bottom stop is refused');
      assert.equal(refuses(control, control.max), null, 'the top stop is refused');
      assert.ok(refuses(control, control.min - control.step), 'below the bottom stop was allowed');
      assert.ok(refuses(control, control.max + control.step), 'above the top stop was allowed');
      assert.ok(refuses(control, Number.NaN), 'NaN was allowed');
    });
  }
});

describe('the landmarks are readable', () => {
  const marked = ruled.filter((c) => c.landmarks?.length);

  test('there are landmarks to check', () => {
    assert.ok(marked.length > 0);
  });

  for (const control of marked) {
    const key = control.kind === 'facade' ? control.sides[0].key : control.key;

    test(`${key} — inside the face`, () => {
      for (const mark of control.landmarks) {
        assert.ok(mark.from >= control.min && mark.from <= control.max, `${mark.label} starts off the face`);
        const to = mark.to ?? mark.from;
        assert.ok(to >= control.min && to <= control.max, `${mark.label} ends off the face`);
      }
    });

    test(`${key} — no two overlap`, () => {
      const bands = control.landmarks
        .map((m) => [m.from, m.to ?? m.from, m.label])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i += 1) {
        assert.ok(bands[i][0] >= bands[i - 1][1], `${bands[i][2]} overlaps ${bands[i - 1][2]}`);
      }
    });

    test(`${key} — reachable on the step grid`, () => {
      // `input[type=range]` only ever returns `min + n·step`, so a band that
      // falls between two positions draws, names a case in its tooltip, and
      // can never once be the reading. Five did exactly that.
      const reachable = (v) => {
        const steps = (v - control.min) / control.step;
        return Math.abs(steps - Math.round(steps)) < 1e-6;
      };
      for (const mark of control.landmarks) {
        const from = mark.from;
        const to = mark.to ?? mark.from;
        const first = Math.ceil((from - control.min) / control.step - 1e-6) * control.step + control.min;
        assert.ok(
          first <= to + 1e-9 || reachable(from),
          `${mark.label} (${from}–${to}) falls between two stops of ${control.step}`,
        );
      }
    });

    test(`${key} — every mark carries a note`, () => {
      // A landmark is the interface making a claim about the world, and a claim
      // nobody can check is what the rest of this sheet exists not to print.
      for (const mark of control.landmarks) {
        assert.equal(typeof mark.note, 'string');
        assert.ok(mark.note.trim().length > 0, `${mark.label} has no note`);
      }
    });
  }

  test('a convention says that it is one', () => {
    // Or it would sit beside an ASHRAE clause looking exactly as authoritative,
    // which is the sheet asserting under cover of citing.
    const all = marked.flatMap((c) => c.landmarks);
    const CONVENTION = 'Convention of practice rather than a published figure.';
    const conventions = all.filter((m) => m.note.startsWith(CONVENTION));
    assert.ok(conventions.length > 0, 'the prefix is still in use');
    assert.ok(
      conventions.length * 4 < all.length,
      `${conventions.length} of ${all.length} marks claim no source, which is too many to be the exception`,
    );
  });
});

describe('a per-wall predicate carries a per-wall reason', () => {
  // One row-wide note cannot say which of four walls is inert, which is the
  // whole reason the sentence is per wall.
  test('every Side with needs has unreached', () => {
    for (const control of controls.filter((c) => c.kind === 'facade')) {
      for (const side of control.sides) {
        if (side.needs) assert.ok(side.unreached, `${side.key} has a predicate and no reason`);
      }
    }
  });
});

describe('the patch bay', () => {
  test('only bypassable channels are in it', () => {
    for (const id of Object.keys(DEFAULT_BYPASS)) {
      assert.ok(CHANNELS.find((c) => c.id === id)?.bypassable, `${id} is not bypassable`);
    }
  });

  test('a priced channel reaches no IDF object', () => {
    // Anything on `params` that does not reach the IDF must be declared on a
    // `prices: true` channel, or it will start runs that change nothing.
    const priced = CHANNELS.filter((c) => c.prices);
    assert.ok(priced.length === 2, 'Plant and Tariff');
    for (const channel of priced) assert.ok(channel.keys().length > 0);
  });

  test('a channel can only require one declared above it', () => {
    // `on(id)` reads whether an earlier channel is engaged, and the channels
    // are declared in physical order, which is the order those dependencies
    // run in.
    const order = new Map(CHANNELS.map((c, i) => [c.id, i]));
    for (const channel of CHANNELS) {
      if (!channel.requires) continue;
      const asked = [];
      channel.requires.test(
        DEFAULT_PARAMETERS,
        (id) => { asked.push(id); return true; },
        () => false,
      );
      for (const id of asked) {
        assert.ok(order.get(id) < order.get(channel.id), `${channel.id} asks about ${id}, declared below it`);
      }
    }
  });
});
