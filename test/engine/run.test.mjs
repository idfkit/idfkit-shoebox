/**
 * Runs that actually run.
 *
 * Schema validation does not catch what breaks a run: every fatal recorded in
 * `CLAUDE.md` — the opening on an adiabatic wall, the thermostat control type
 * standing over the wrong setpoint object — was a document the schema was
 * perfectly happy with. Those are exactly the cases below, and each was
 * verified once by a script that no longer exists.
 *
 * Slow by the standards of the rest of the suite (a few seconds per run), so
 * these are `npm run test:engine` rather than part of `npm test`. They need no
 * network and no installed EnergyPlus.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseESO } from '@idfkit/engine';
import { DESKS, desk, idfFor, patch } from '../helpers.mjs';
import { WINDOW_CONSTRUCTION } from '../../src/model.js';
import { environmentRuns, glassProperties, hourly, readExtremes } from '../../src/readings.js';
import { fatals, run, severes, unproduced } from './engine.mjs';

const MINUTE = 60_000;

/** The desks worth the engine's time: the stock one, and the ones that fatalled. */
const SOLVED = ['stock', 'everything', 'adiabatic', 'fabricOut', 'heatOnly', 'coolOnly', 'layered'];

describe('the desk solves', { timeout: 10 * MINUTE }, () => {
  for (const name of SOLVED) {
    test(name, { timeout: 2 * MINUTE }, async () => {
      const { params, bypass } = DESKS[name];
      const result = await run(await idfFor(params, bypass));
      assert.deepEqual(fatals(result.err), [], `${name} fatalled`);
      assert.deepEqual(severes(result.err), [], `${name} reported severe errors`);
      assert.equal(result.code, 0, `${name} exited ${result.code}`);
      assert.ok(result.eso, 'no results were written');
    });
  }
});

describe('the openings that had nowhere to go', { timeout: 10 * MINUTE }, () => {
  // Measured at cd5881e: the stock desk with Fabric out exited 1 on three
  // severes — a fenestration surface and two shades naming adiabatic base
  // surfaces. The flask the Fabric strip advertises was only reachable with
  // Glazing, Shading and Skylights patched out by hand.
  test('Fabric out, every opening channel in', { timeout: 2 * MINUTE }, async () => {
    const params = desk({ wwrN: 0.4, wwrE: 0.4, wwrS: 0.4, wwrW: 0.4, ohS: 1.2, skyRatio: 0.1 });
    const result = await run(await idfFor(params, patch({ fabric: true, skylights: false, blinds: false })));
    assert.deepEqual(fatals(result.err), []);
    assert.deepEqual(severes(result.err), []);
    assert.equal(result.code, 0);
  });

  test('three party walls, every opening channel in', { timeout: 2 * MINUTE }, async () => {
    const params = desk({
      wallBoundaryN: 'Adiabatic', wallBoundaryE: 'Adiabatic', wallBoundaryW: 'Adiabatic',
      wwrN: 0.4, wwrE: 0.4, wwrS: 0.4, wwrW: 0.4, ohN: 0.6, ohE: 0.6, ohS: 0.6, ohW: 0.6,
      skyRatio: 0.1,
    });
    const result = await run(await idfFor(params, patch({ skylights: false })));
    assert.deepEqual(fatals(result.err), []);
    assert.deepEqual(severes(result.err), []);
  });
});

describe('a thermostat the zone actually has', { timeout: 10 * MINUTE }, () => {
  // `..specifies 1 (ThermostatSetpoint:SingleHeating) as the control type. Not
  // valid for this zone.` is a get-input fatal: it takes the run down before
  // any environment starts, whatever the weather, so "Heat only" and "Cool
  // only" simply could not be solved.
  for (const availability of ['HeatingOnly', 'CoolingOnly']) {
    test(availability, { timeout: 2 * MINUTE }, async () => {
      const result = await run(await idfFor(
        desk({ availability }),
        patch({ system: false, gains: false }),
      ));
      assert.ok(!/Not valid for this zone/i.test(result.err), result.err.slice(0, 400));
      assert.deepEqual(fatals(result.err), []);
      assert.equal(result.code, 0);
    });
  }
});

describe('every variable the sheet asks for is one the engine produces', { timeout: 10 * MINUTE }, () => {
  // "Read the run's `eplus.rdd` to confirm any output variable name exists
  // rather than guessing its spelling, and grep `eplus.err` for 'requested but
  // not generated'." Field names drift between versions — in 26.1 transmitted
  // solar is `Enclosure Windows Total …`, not the older `Zone Windows …`.
  test('with every channel in the path', { timeout: 2 * MINUTE }, async () => {
    const { params, bypass } = DESKS.everything;
    const result = await run(await idfFor(params, bypass));
    assert.deepEqual(unproduced(result.err), []);
  });

  test('and with the default desk, whose strips are mostly out', { timeout: 2 * MINUTE }, async () => {
    // Without the channel gating, EnergyPlus lists every unproducible variable
    // at the end of the error file and inflates the warning count the title
    // block reports.
    const result = await run(await idfFor());
    assert.deepEqual(unproduced(result.err), []);
  });
});

describe('a special day the run cannot place is ignored in silence', { timeout: 10 * MINUTE }, () => {
  // The other half of a claim CLAUDE.md got wrong for a while: it is not that
  // the model withholds special days from a design-day desk — it writes them
  // identically whatever `sizingPeriods` says, which `test/model.test.mjs`
  // asserts — but that the engine never reaches the run period they belong to,
  // and says nothing about it. The silence is the finding: there is no reading
  // of an unplaced special day anywhere in the output, which is why the desk
  // counts what reaches the engine itself rather than looking for a number in
  // the error file.
  test('a design-day run carrying a calendar it cannot use', { timeout: 2 * MINUTE }, async () => {
    const params = desk({
      holidays: 'Listed',
      holidayDays: '1/1: New Year; 3 Mon in Jan: MLK; Last Mon in May: Memorial',
      sizingPeriods: 'Yes',
      months: '111111111111',
    });
    // No weather file, so the two sizing periods are all there is to simulate.
    const result = await run(await idfFor(params, patch()));
    assert.equal(result.code, 0);
    assert.deepEqual(fatals(result.err), []);
    assert.deepEqual(severes(result.err), []);

    const named = result.err
      .split('\n')
      .filter((line) => /special day|new year|mlk|memorial/i.test(line));
    assert.deepEqual(named, [], 'the error file said something about them after all');

    const environments = parseESO(result.eso).environments.map((e) => e.title);
    assert.equal(environments.length, 2, `simulated ${environments.join(', ')}`);
    for (const title of environments) assert.ok(/CONDNS/i.test(title), `${title} is not a design day`);
  });
});

describe('the balance rail closes', { timeout: 10 * MINUTE }, () => {
  // Five channel meters are terms of the zone *air* heat balance and therefore
  // sum. Mixing in per-mechanism variables — infiltration in joules, ideal
  // loads in watts — does not close, because those belong to different
  // balances. The storage term is the accumulation side and enters negated;
  // the system term is reported at building level and is divided back down.
  const RAIL = [
    ['Zone Air Heat Balance Surface Convection Rate', 1, false],
    ['Zone Air Heat Balance Air Energy Storage Rate', -1, false],
    ['Zone Air Heat Balance Outdoor Air Transfer Rate', 1, false],
    ['Zone Air Heat Balance Internal Convective Heat Gain Rate', 1, false],
    ['Zone Air Heat Balance System Air Transfer Rate', 1, true],
  ];

  /** The worst hour's residual, and the largest single term standing at it. */
  function residual(eso, multiplier, { divide = true } = {}) {
    const series = RAIL.map(([variable, sign, perBuilding]) => {
      const points = hourly(eso, new RegExp(`^${variable}$`, 'i'));
      assert.ok(points.length > 0, `${variable} is not in this run`);
      return { points, sign, perBuilding };
    });
    let worst = 0;
    let largest = 1;
    for (let i = 0; i < series[0].points.length; i += 1) {
      let sum = 0;
      let scale = 0;
      for (const { points, sign, perBuilding } of series) {
        const value = (sign * points[i].value) / (divide && perBuilding ? multiplier : 1);
        sum += value;
        scale = Math.max(scale, Math.abs(value));
      }
      if (Math.abs(sum) > Math.abs(worst)) {
        worst = sum;
        largest = Math.max(scale, 1);
      }
    }
    return { worst, largest, share: Math.abs(worst) / largest };
  }

  // Only a desk with every rail channel engaged has all five terms in the run,
  // and four fifths of a sum is not a sum: the stock desk carries two of them
  // and "closes" to 50 % of nothing much.
  const engaged = DESKS.everything;

  test('to the resolution the reporting frequency allows', { timeout: 2 * MINUTE }, async () => {
    // The rail reads hourly averages of rates the engine integrates per
    // timestep, so the closure is bounded by the timestep rather than by the
    // physics. Measured on this desk over the design days: 1.21 % of the
    // largest term at the default 4 steps an hour, and 0.09 % at 60. CLAUDE.md
    // has long said "about a hundredth of a percent", which is the fine-
    // timestep figure and was being quoted for every desk.
    const coarse = await run(await idfFor(engaged.params, engaged.bypass));
    const at4 = residual(parseESO(coarse.eso), 1);
    assert.ok(at4.share < 0.02, `${at4.worst.toFixed(1)} W is ${(at4.share * 100).toFixed(2)} % of the largest term`);

    const fine = await run(await idfFor({ ...engaged.params, timestep: 60 }, engaged.bypass));
    const at60 = residual(parseESO(fine.eso), 1);
    assert.ok(at60.share < 0.002, `at 60 steps an hour it is still ${(at60.share * 100).toFixed(3)} %`);
    assert.ok(at60.share < at4.share, 'a finer timestep did not close the rail further');
  });

  test('and the multiplier is divided back out of the system term', { timeout: 2 * MINUTE }, async () => {
    // Found by arithmetic rather than by reading: at a multiplier of 3 the
    // other four terms summed to −25,251 W and this one read 75,756 W, which
    // is 25,252 × 3.
    const one = await run(await idfFor(engaged.params, engaged.bypass));
    const three = await run(await idfFor({ ...engaged.params, multiplier: 3 }, engaged.bypass));

    const divided = residual(parseESO(three.eso), 3);
    assert.ok(
      Math.abs(divided.worst - residual(parseESO(one.eso), 1).worst) < 1,
      'stacking three identical floors moved the rail',
    );

    const undivided = residual(parseESO(three.eso), 3, { divide: false });
    assert.ok(
      undivided.share > divided.share * 10,
      'the rail closes without dividing the system term, so this run cannot detect the bug',
    );
  });
});

describe('the readings read a real run', { timeout: 10 * MINUTE }, () => {
  test('the extremes are the design days\' own', { timeout: 2 * MINUTE }, async () => {
    const result = await run(await idfFor());
    const eso = parseESO(result.eso);
    const points = hourly(eso, /Zone Mean Air Temperature/i);
    const runs = environmentRuns(points, eso.environments);

    assert.equal(runs.length, 2, 'a design-day desk is two environments');
    assert.equal(runs[0].kind, 'Winter design day');
    assert.equal(runs[1].kind, 'Summer design day');

    const extremes = readExtremes(eso);
    assert.ok(Number.isFinite(extremes.low) && Number.isFinite(extremes.high));
    assert.ok(extremes.low < extremes.high);
  });

  test('the engine\'s own U-factor comes back off the tabular report', { timeout: 2 * MINUTE }, async () => {
    // Measured on the default desk: U 2.675 at two panes, 1.732 at three,
    // 1.285 at four, and 0.932 at four with a 0.04 coating.
    const layered = (panes, paneEmiss = 0.84) =>
      idfFor(desk({ glazingModel: 'Layered', panes, paneEmiss }), patch());

    const two = await run(await layered(2));
    const glass = glassProperties(two.htm, WINDOW_CONSTRUCTION);
    assert.ok(glass, 'no fenestration table came back');
    assert.ok(Math.abs(glass.u - 2.675) < 0.05, `two panes read ${glass.u}`);

    const four = await run(await layered(4, 0.04));
    const coated = glassProperties(four.htm, WINDOW_CONSTRUCTION);
    assert.ok(Math.abs(coated.u - 0.932) < 0.05, `four coated panes read ${coated.u}`);
    assert.ok(coated.u < glass.u, 'more panes and a coating did not help');
  });

  test('a frameless window reports no assembly figures', { timeout: 2 * MINUTE }, async () => {
    // EnergyPlus fills the Assembly cells only for an opening carrying a
    // `WindowProperty:FrameAndDivider`; with none they arrive empty, and
    // `Number('')` is 0.
    const result = await run(await idfFor(desk({ glazingModel: 'Layered', frameWidth: 0 })));
    const glass = glassProperties(result.htm, WINDOW_CONSTRUCTION);
    assert.equal(glass.assembly.u, null, 'a U-factor was printed over a window with no frame');
  });
});

describe('the IDF the desk writes is the IDF the engine reads', { timeout: 10 * MINUTE }, () => {
  test('a study sample under a lean profile still solves', { timeout: 2 * MINUTE }, async () => {
    // The lean profiles exist because a sweep sample is read for one series and
    // used to carry nothing else. A profile that produced an unreadable run
    // would show up as a curve with holes in it and nothing else.
    const { params, bypass } = DESKS.everything;
    const result = await run(await idfFor(params, bypass, { reporting: 'extremes' }));
    assert.deepEqual(fatals(result.err), []);
    assert.deepEqual(unproduced(result.err), []);
    assert.ok(hourly(parseESO(result.eso), /Zone Mean Air Temperature/i).length > 0);
  });
});
