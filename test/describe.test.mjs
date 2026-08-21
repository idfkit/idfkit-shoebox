/**
 * The paragraph under the plate.
 *
 * `describe.js` is DOM-free and free of the network — the station arrives as
 * `{ name, zone }`, already read — precisely so its sentences can be asserted
 * over documents built here. Its failure mode is the worst kind this page has:
 * a sentence that is fluent, confident and about a different building.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { channelState } from '../src/model.js';
import { describeDesk } from '../src/describe.js';
import { DESKS, desk, documentFor, patch } from './helpers.mjs';

/** The description as one string, with the quantities lettered in place. */
async function sentence(params, bypass = patch(), place = null) {
  const doc = await documentFor(params, bypass);
  const tokens = describeDesk({ doc, params, state: channelState(params, bypass), place });
  return tokens.map((t) => (typeof t === 'object' && t !== null && 'q' in t ? t.q : t)).join('');
}

describe('it says something about every desk', () => {
  for (const [name, { params, bypass }] of Object.entries(DESKS)) {
    test(name, async () => {
      const text = await sentence(params, bypass);
      assert.ok(text.length > 40, `only ${text.length} characters: ${text}`);
      assert.ok(text.trim().endsWith('.'), text);
      assert.equal(text[0], text[0].toUpperCase(), 'the opening was not turned up');
      assert.ok(!text.includes('undefined') && !text.includes('NaN'), text);
      assert.ok(!/\s,|\s\./.test(text), `loose punctuation: ${text}`);
    });
  }

  test('it needs the channel state the model was applied with', async () => {
    const doc = await documentFor();
    assert.throws(() => describeDesk({ doc, params: desk(), state: null }));
  });
});

describe('the compass words are measured, not named', () => {
  // `turn()` puts the orientation into the vertices and leaves every wall's
  // name where it was, so on a building turned 40° the wall called south faces
  // south-west. Reading the plan key's name instead would have the sheet
  // stating the one thing about a turned desk that is flatly untrue.
  test('a turned desk letters the bearing beside the word', async () => {
    const text = await sentence(desk({ northAxis: 40, wwrS: 0.4 }));
    assert.ok(/\d{1,3}°/.test(text), `no bearing in: ${text}`);
  });

  test('a square desk does not', async () => {
    const text = await sentence(desk({ northAxis: 0, wwrS: 0.4 }));
    assert.ok(!/south[^.]*\d{1,3}°/.test(text), `a bearing on a square building: ${text}`);
  });
});

describe('a setting is described by the object it reached', () => {
  test('a unit with one setpoint is not described as having two', async () => {
    // At "Heat only" `applySystem` writes a ThermostatSetpoint:SingleHeating
    // and the cooling setpoint reaches nothing, so the clause is read off the
    // thermostat object in the document.
    const both = await sentence(DESKS.stock.params, patch({ system: false, gains: false }));
    const heat = await sentence(desk({ availability: 'HeatingOnly' }), patch({ system: false, gains: false }));
    assert.ok(/–|-/.test(both.match(/[\d.]+ ?[–-] ?[\d.]+ ?°C/)?.[0] ?? ''), `no band in: ${both}`);
    assert.ok(!/[\d.]+ ?[–-] ?[\d.]+ ?°C/.test(heat), `a band over a single setpoint: ${heat}`);
  });

  test('a building with Glazing bypassed is described as solid', async () => {
    // Areas, ratios and reaches come off the document, so a channel patched out
    // from under a control reads as what the document holds.
    const text = await sentence(desk({ wwrS: 0.6 }), patch({ glazing: true }));
    assert.ok(!/0\.6|60 ?%/.test(text), `it described glass that is not there: ${text}`);
  });
});

describe('which surfaces have an outside is part of the description', () => {
  // A wall set adiabatic is the model saying there is another heated space on
  // the far side, and a paragraph that only ever said what was *glazed* would
  // letter a party wall as solid — true of the drawing and silent about why.
  test('an adiabatic wall is said', async () => {
    const open = await sentence(desk());
    const party = await sentence(desk({ wallBoundaryW: 'Adiabatic' }));
    assert.notEqual(open, party, 'a party wall changed nothing in the paragraph');
  });
});

describe('a channel flip outranks anything a slider can reach', () => {
  // A pane emissivity taken the whole way across its range scores 1.00, and
  // before the flips outranked it the paragraph described the glass of a
  // building whose ideal unit it never mentioned.
  test('the ideal unit is mentioned when it is switched in', async () => {
    const text = await sentence(
      desk({ glazingModel: 'Layered', paneEmiss: 0.04 }),
      patch({ system: false, gains: false }),
    );
    assert.ok(/°C/.test(text), `the unit went unmentioned: ${text}`);
  });
});

describe('nothing is said that is not measured', () => {
  const forbidden = [
    // No typology: 12 m²/person is a number, not "an office".
    /\boffice\b/i, /\bdwelling\b/i, /\bschool\b/i,
    // No assembly names: an R-value is not "a cavity wall".
    /cavity wall/i, /\bstud\b/i,
    // And no verdict, because "well insulated" has no measurement behind it
    // and no benchmark on this page to earn it.
    /well[- ]insulated/i, /\befficient\b/i, /\bgood\b/i, /\bpoor\b/i, /\bshould\b/i,
  ];

  for (const [name, { params, bypass }] of Object.entries(DESKS)) {
    test(name, async () => {
      const text = await sentence(params, bypass);
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(text), `${pattern} in: ${text}`);
      }
    });
  }
});

describe('the station arrives already read', () => {
  test('and opens the paragraph', async () => {
    const text = await sentence(desk(), patch(), { name: 'Denver, Colorado', zone: '5B' });
    assert.ok(text.startsWith('In Denver, Colorado'), text);
    assert.ok(text.includes('5B'));
  });

  test('a desk with no station simply does not open with one', async () => {
    const text = await sentence(desk());
    assert.ok(!text.startsWith('In '), text);
  });
});
