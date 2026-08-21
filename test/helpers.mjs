/**
 * What the throwaway harnesses used to be.
 *
 * Every "measured", "verified" and "asserted" in `CLAUDE.md` was once a Node
 * script written beside the change, run once, and deleted -- which left the
 * whole invariant list standing on the memory of whoever ran it. These are the
 * same scripts, kept: the schema comes from `localBundle()` rather than
 * `httpSource('/schemas/')` because there is no server here, and everything
 * else calls the page's own modules, so a rule that moves in `src/` moves the
 * test with it or breaks it.
 *
 * Nothing in here touches the DOM or the network. That is a constraint on what
 * can be tested this way and it is also why `readings.js`, `describe.js`,
 * `bill.js`, `study.js` and `pool.js` were pulled out of `main.js` in the first
 * place -- the harness was always the reason those modules are pure.
 */

import { localBundle } from '@idfkit/schemas/node';
import { writeIdf } from '@idfkit/core';
import { buildModel, applyModel } from '../src/model.js';
import { DEFAULT_PARAMETERS, DEFAULT_BYPASS } from '../src/controls.js';

/**
 * The schema, loaded once per process.
 *
 * `localBundle()` wants the full version string -- `load('26.1')` is not the
 * same call and does not resolve -- which is the first thing every one of the
 * throwaway harnesses got wrong.
 */
let bundle = null;
export async function schema() {
  if (!bundle) bundle = await localBundle().load('26.1.0');
  return bundle;
}

/** A desk: the defaults with a few controls moved, as a fresh mutable object. */
export const desk = (overrides = {}) => ({ ...DEFAULT_PARAMETERS, ...overrides });

/** The patch bay: `true` is bypassed, as `DEFAULT_BYPASS` has it. */
export const patch = (overrides = {}) => ({ ...DEFAULT_BYPASS, ...overrides });

/**
 * Build the document for one desk position.
 *
 * `buildModel` already ends in an `applyModel`, so this is the document the
 * page holds after a parameter change and not some cleaner thing assembled for
 * the test.
 */
export async function documentFor(params = desk(), bypass = patch(), options = {}) {
  const doc = buildModel(await schema(), params, bypass);
  applyModel(doc, params, bypass, options);
  return doc;
}

/** The IDF text for one desk position -- what actually reaches the engine. */
export async function idfFor(params = desk(), bypass = patch(), options = {}) {
  return writeIdf(await documentFor(params, bypass, options));
}

export const objects = (doc, type) => doc.all(type).toArray();
export const names = (doc, type) => doc.all(type).names();
export const count = (doc, type) => doc.all(type).size;

/**
 * The desk positions every model assertion is checked at.
 *
 * Chosen to be the corners rather than a sample: the cases below are the ones
 * that have actually broken -- a building whose surfaces have no outside, a
 * unit that has lost panes, a grid that has shrunk, a year with a hole in it,
 * a box that has been turned off the cardinals, a zone standing for three
 * floors. A rule that holds at the stock desk and nowhere else holds nowhere
 * that matters.
 */
export const DESKS = Object.freeze({
  stock: { params: desk(), bypass: patch() },

  /** Every channel in the path at once, which no default ever is. */
  everything: {
    params: desk({ glazingModel: 'Layered', months: '111111111111' }),
    bypass: patch({
      context: false, glazing: false, skylights: false, shading: false, blinds: false,
      fabric: false, mass: false, air: false, gains: false, daylight: false,
      system: false, grounds: false,
    }),
  },

  /** The layered unit at its widest, with a coating on the inboard pane. */
  layered: {
    params: desk({ glazingModel: 'Layered', panes: 4, paneEmiss: 0.04, frameWidth: 0.05 }),
    bypass: patch({ blinds: false }),
  },

  /** A roof full of rooflights on their own glass, curbed. */
  skylit: {
    params: desk({ skyRatio: 0.1, skyCount: 4, skyCurb: 1.2, skyGlass: 'Own' }),
    bypass: patch({ skylights: false }),
  },

  /**
   * Three walls with nothing outside them, every opening channel engaged.
   * This is the desk that used to fatal on three severe errors.
   */
  adiabatic: {
    params: desk({
      wallBoundaryN: 'Adiabatic', wallBoundaryE: 'Adiabatic', wallBoundaryW: 'Adiabatic',
      wwrN: 0.4, wwrE: 0.4, wwrS: 0.4, wwrW: 0.4, ohN: 0.6, ohE: 0.6, ohW: 0.6,
      skyRatio: 0.08,
    }),
    bypass: patch({ skylights: false }),
  },

  /**
   * Fabric patched out from under the openings. Bypassing Fabric sends all six
   * surfaces adiabatic, which no parameter records, so this is the case only
   * `off(id)` can see.
   */
  fabricOut: {
    params: desk({ wwrS: 0.4, skyRatio: 0.08 }),
    bypass: patch({ fabric: true, skylights: false }),
  },

  /** Off the cardinals, which is where every name in the model stops being a bearing. */
  turned: { params: desk({ northAxis: 40, wwrS: 0.35, ohS: 1.2 }), bypass: patch() },

  /** One zone standing for three floors. */
  stacked: { params: desk({ multiplier: 3 }), bypass: patch({ system: false, gains: false }) },

  /** A year with a hole in it: January, then June to August, and nothing else. */
  brokenYear: {
    params: desk({ months: '100001110000', sizingPeriods: 'No' }),
    bypass: patch({ system: false }),
  },

  /** December and January in, the months between them out. */
  wrapping: { params: desk({ months: '100000000001', sizingPeriods: 'No' }), bypass: patch() },

  /** A conditioned desk with a list of holidays to place. */
  conditioned: {
    params: desk({
      heatSet: 20, coolSet: 26, setback: 3, availability: 'Occupied', outdoorAir: 0.0025,
      economizer: 'DifferentialDryBulb', holidays: 'Listed', holidayUse: 'Closed',
      holidayDays: '1/1: New Year; 3 Mon in Jan: MLK; Last Mon in May: Memorial; 7/4: Independence',
      months: '111111111111', sizingPeriods: 'No',
    }),
    bypass: patch({ system: false, gains: false, air: false }),
  },

  /** Heating only: the thermostat type number and its control object are one statement. */
  heatOnly: {
    params: desk({ availability: 'HeatingOnly', heatSet: 21 }),
    bypass: patch({ system: false, gains: false }),
  },

  /** And the other half of that pair, which fatalled the same way. */
  coolOnly: {
    params: desk({ availability: 'CoolingOnly', coolSet: 25 }),
    bypass: patch({ system: false, gains: false }),
  },
});

export const deskNames = Object.keys(DESKS);
