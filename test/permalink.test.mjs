/**
 * The link format.
 *
 * `permalink.js` is validated "the same way `model.js` is: a throwaway Node
 * script asserting exact round-trip of every key and refusal of every malformed
 * input class". This is that script, and it is the one whose loss would have
 * cost the most: the codec's failures are silent by construction — a link that
 * decodes to a slightly different desk produces a page that works perfectly and
 * is about another building.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_KEYS,
  CHANNELS,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  controlFor,
} from '../src/controls.js';
import { LINK_VERSION, decodeState, encodeState, isSchemeFragment } from '../src/permalink.js';

const params = (overrides = {}) => ({ ...DEFAULT_PARAMETERS, ...overrides });
const bypass = (overrides = {}) => ({ ...DEFAULT_BYPASS, ...overrides });

/** A value this control admits that is not the one it starts on. */
function otherValue(key) {
  const { control, face } = controlFor(key);
  const now = DEFAULT_PARAMETERS[key];
  switch (control.kind) {
    case 'selector': {
      const option = control.options.find((o) => o.value !== now);
      return option.value;
    }
    case 'boundary':
      return now === face.open ? 'Adiabatic' : face.open;
    case 'calendar':
      return now === '111111111111' ? '100001110000' : '111111111111';
    case 'days':
      // Canonicalised on the way back in — see the round-trip test below.
      return '1/1: New Year;3 Mon in Jan: MLK';
    case 'bearing':
      return (now + 40) % 360;
    case 'profile':
      // The band sweeps whole cells, so an hour of the day and nothing between.
      return now === 0 ? 1 : now - 1;
    default: {
      const up = now + control.step;
      return up <= control.max ? Number(up.toFixed(6)) : Number((now - control.step).toFixed(6));
    }
  }
}

describe('the delta encoding', () => {
  test('a default desk needs no link', () => {
    assert.equal(encodeState({ params: params(), bypass: bypass() }), '');
  });

  test('only what moved is carried', () => {
    const link = encodeState({ params: params({ width: 12 }), bypass: bypass() });
    assert.equal(link, `${LINK_VERSION}&width=12`);
  });

  test('a bypass carries as in or out, whichever way it moved', () => {
    assert.equal(
      encodeState({ params: params(), bypass: bypass({ air: false }) }),
      `${LINK_VERSION}&in=air`,
    );
    assert.equal(
      encodeState({ params: params(), bypass: bypass({ glazing: true }) }),
      `${LINK_VERSION}&out=glazing`,
    );
  });

  test('the value is exact, not the printable one', () => {
    // The display rounds — `height` defaults to 4.572 m and reads `4.57 m` — and
    // a link must hand back what was set.
    const link = encodeState({ params: params({ height: 4.573 }), bypass: bypass() });
    assert.ok(link.includes('height=4.573'));
    assert.equal(decodeState(link).params.height, 4.573);
  });
});

describe('every key survives the round trip', () => {
  for (const key of ALL_KEYS) {
    test(key, () => {
      const value = otherValue(key);
      // The fixture has to move the control before anything below means
      // anything. Left as an `|| value === the default` escape on the next
      // assertion, a key `otherValue` failed to move would encode to the empty
      // link, decode straight back to the defaults, and pass every line of this
      // test while being the one key nothing had checked.
      assert.notEqual(
        String(value),
        String(DEFAULT_PARAMETERS[key]),
        `otherValue did not move ${key} off its default, so this test is about nothing`,
      );
      const link = encodeState({ params: params({ [key]: value }), bypass: bypass() });
      assert.ok(link.includes(`${key}=`), `${key} was not carried`);
      const back = decodeState(link);
      assert.equal(back.params[key], value, `${key} came back as ${back.params[key]}`);
      // Round-tripping the decoded value again has to be a fixed point, or the
      // link a reader copies is not the link they were handed.
      assert.equal(
        encodeState({ params: params({ [key]: back.params[key] }), bypass: bypass() }),
        link,
      );
      // And nothing else moved with it.
      for (const other of ALL_KEYS) {
        if (other === key) continue;
        assert.equal(back.params[other], DEFAULT_PARAMETERS[other], `${other} moved when ${key} did`);
      }
    });
  }
});

describe('every channel survives the round trip', () => {
  for (const channel of CHANNELS.filter((c) => c.bypassable)) {
    test(channel.id, () => {
      const flipped = bypass({ [channel.id]: !DEFAULT_BYPASS[channel.id] });
      const back = decodeState(encodeState({ params: params(), bypass: flipped }));
      assert.deepEqual(back.bypass, flipped);
    });
  }
});

describe('the reserved keys', () => {
  test('a station rides as wmo and window', () => {
    const link = encodeState({
      params: params(),
      bypass: bypass(),
      station: { wmo: '725650', window: '2009-2023' },
    });
    const back = decodeState(link);
    assert.equal(back.station.wmo, '725650');
    assert.equal(back.station.window, '2009-2023');
  });

  test('the pin rides as a calendar stamp', () => {
    // `at=year.8-3T13`, separator a full stop because `URLSearchParams` escapes
    // `@`. By environment *kind*, because the index is not a property of the
    // desk — keeping the sizing days renumbers the year from 0 to 2.
    const pin = { kind: 'year', month: 8, day: 3, hour: 13 };
    const station = { wmo: '725650', window: '2009-2023' };
    const link = encodeState({ params: params(), bypass: bypass(), station, pin });
    assert.ok(link.includes('at=year.8-3T13'), link);
    assert.deepEqual(decodeState(link).pin, pin);
  });

  test('an hour pinned in a year with no year to pin it in is refused', () => {
    // The design-day pin needs no station; the run period's does, and a link
    // carrying one without a station describes an environment that will not be
    // in the run.
    const pin = { kind: 'year', month: 8, day: 3, hour: 13 };
    assert.throws(() => decodeState(encodeState({ params: params(), bypass: bypass(), pin })));
  });

  test('no control key can collide with one', () => {
    for (const reserved of ['in', 'out', 'stn', 'win', 'at']) {
      assert.ok(!ALL_KEYS.includes(reserved), `${reserved} is both reserved and a control key`);
    }
  });

  test('a scheme fragment is recognised by its version', () => {
    assert.ok(isSchemeFragment(`${LINK_VERSION}&width=12`));
    assert.ok(isSchemeFragment(LINK_VERSION));
    assert.ok(!isSchemeFragment('width=12'));
  });
});

describe('a bad link is refused whole', () => {
  const refused = [
    ['no version', 'width=12'],
    ['an unknown version', 'v99&width=12'],
    ['a key nothing owns', `${LINK_VERSION}&notAKey=1`],
    ['a value off the face', `${LINK_VERSION}&width=400`],
    ['a value below the face', `${LINK_VERSION}&width=-4`],
    ['text where a number goes', `${LINK_VERSION}&width=wide`],
    ['an empty number', `${LINK_VERSION}&occFrom=`],
    ['hex, which Number would take', `${LINK_VERSION}&occFrom=0x18`],
    ['an option that does not exist', `${LINK_VERSION}&terrain=Moon`],
    ['a boundary state the desk cannot make', `${LINK_VERSION}&floorBoundary=Outdoors`],
    ['a calendar of no months', `${LINK_VERSION}&months=000000000000`],
    ['a calendar of the wrong length', `${LINK_VERSION}&months=1111`],
    ['a holiday with no name', `${LINK_VERSION}&holidayDays=1%2F1`],
    ['a fifth weekday, which is fatal in a year that has four', `${LINK_VERSION}&holidayDays=5+Mon+in+Dec%3A+Nothing`],
    ['a channel that cannot be patched', `${LINK_VERSION}&out=massing`],
    ['a channel that does not exist', `${LINK_VERSION}&out=nothing`],
    ['a prototype walk', `${LINK_VERSION}&toString=1`],
  ];

  for (const [why, link] of refused) {
    test(why, () => {
      assert.throws(() => decodeState(link), Error, `"${link}" was accepted`);
    });
  }

  test('nothing is half-loaded', () => {
    // Every pair is validated before anything is returned: the caller gets a
    // scheme it can apply wholesale or a reason to refuse the link wholesale.
    assert.throws(() => decodeState(`${LINK_VERSION}&width=12&depth=nonsense`));
    // And the good pair before it left nothing behind on the defaults.
    assert.equal(DEFAULT_PARAMETERS.width, 15.24);
  });
});

describe('an omitted key means the default as of that version', () => {
  test('a link minted today decodes to today\'s defaults', () => {
    const back = decodeState(`${LINK_VERSION}&width=12`);
    for (const key of ALL_KEYS) {
      if (key === 'width') continue;
      assert.equal(back.params[key], DEFAULT_PARAMETERS[key]);
    }
  });

  test('the decoded desk is its own object', () => {
    // `Object.freeze` is shallow and `DEFAULTS_BY_VERSION.v1` is the live
    // `DEFAULT_PARAMETERS`, so a decode that handed back a reference would let
    // the next gesture edit the link format itself.
    const back = decodeState(`${LINK_VERSION}&width=12`);
    assert.notEqual(back.params, DEFAULT_PARAMETERS);
    back.params.width = 20;
    assert.equal(DEFAULT_PARAMETERS.width, 15.24);
  });
});
