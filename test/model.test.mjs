/**
 * The document rules.
 *
 * Every assertion here has a sentence in `CLAUDE.md` behind it, and most of
 * those sentences record an error message the engine gave once. The ones that
 * say "measured" or "verified" were measured by a script that no longer exists;
 * these are that script.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeIdf } from '@idfkit/core';
import { applyModel, buildModel, geometryFacts, WALLS, ROOF, FLOOR } from '../src/model.js';
import { DEFAULT_PARAMETERS, monthSpans } from '../src/controls.js';
import { DESKS, count, desk, documentFor, idfFor, names, objects, patch, schema } from './helpers.mjs';

describe('applyModel is idempotent', () => {
  // It runs on every parameter change and again at the end of `buildModel`, and
  // the sweep's restore is byte-exact only because of this. Three applies, not
  // two: an applier that appends on every pass and one that appends only after
  // the first are different bugs and the second survives a pair.
  for (const [name, { params, bypass }] of Object.entries(DESKS)) {
    test(name, async () => {
      const doc = buildModel(await schema(), params, bypass);
      const once = writeIdf(doc);
      applyModel(doc, params, bypass);
      applyModel(doc, params, bypass);
      applyModel(doc, params, bypass);
      assert.equal(writeIdf(doc), once, 'a fourth apply changed the document');
    });
  }
});

describe('a bypassed channel is removed, not zeroed', () => {
  // "Bypass removes, it does not zero" — what keeps the drawing and the IDF
  // agreeing about what is in the path.
  const gone = [
    ['glazing', ['FenestrationSurface:Detailed']],
    ['shading', ['Shading:Zone:Detailed']],
    ['air', ['ZoneInfiltration:DesignFlowRate']],
    ['gains', ['People', 'Lights', 'ElectricEquipment']],
    ['system', ['ZoneControl:Thermostat', 'ZoneHVAC:IdealLoadsAirSystem']],
    ['grounds', ['Exterior:Lights']],
  ];
  for (const [channel, types] of gone) {
    test(channel, async () => {
      const inPath = await documentFor(desk(), patch({ [channel]: false }));
      const out = await documentFor(desk(), patch({ [channel]: true }));
      for (const type of types) {
        assert.ok(count(inPath, type) > 0, `${type} should exist with ${channel} engaged`);
        assert.equal(count(out, type), 0, `${type} survived ${channel} being patched out`);
      }
    });
  }
});

describe('the sweeps take their own abandoned objects out', () => {
  // A literal instead of `PANE_MAX` / `SKY_MAX` leaves orphans behind every
  // shrink, and an orphan is invisible until the day it is not.
  test('a unit taken from four panes to two is a two-pane unit', async () => {
    const two = desk({ glazingModel: 'Layered', panes: 2 });
    const doc = buildModel(await schema(), desk({ glazingModel: 'Layered', panes: 4 }), patch());
    applyModel(doc, two, patch());
    assert.equal(writeIdf(doc), await idfFor(two), 'abandoned panes or cavities were left behind');
  });

  test('a grid taken from four across to two is a two-across grid', async () => {
    const small = desk({ skyRatio: 0.06, skyCount: 2 });
    const doc = buildModel(await schema(), desk({ skyRatio: 0.1, skyCount: 4 }), patch({ skylights: false }));
    applyModel(doc, small, patch({ skylights: false }));
    assert.equal(writeIdf(doc), await idfFor(small, patch({ skylights: false })));
  });

  test('the run periods fall as well as rise', async () => {
    const one = desk({ months: '111111111111', sizingPeriods: 'No' });
    const several = desk({ months: '101010101010', sizingPeriods: 'No' });
    const doc = buildModel(await schema(), several, patch());
    assert.equal(count(doc, 'RunPeriod'), 6, 'six unbroken groups, six run periods');
    applyModel(doc, one, patch());
    assert.equal(count(doc, 'RunPeriod'), 1);
    assert.equal(writeIdf(doc), await idfFor(one));
  });
});

describe('the reporting profiles serialize the same as always-sheet', () => {
  // The sweep writes a sample with the metric's lean profile and restores the
  // live desk in the same synchronous breath. "Lean then sheet" has to come
  // back byte-identical to "always sheet" or the restore is not a restore.
  for (const reporting of ['extremes', 'energy']) {
    test(`${reporting} then sheet`, async () => {
      const { params, bypass } = DESKS.everything;
      const doc = buildModel(await schema(), params, bypass);
      const sheet = writeIdf(doc);
      applyModel(doc, params, bypass, { reporting });
      assert.notEqual(writeIdf(doc), sheet, `the ${reporting} profile wrote the full apparatus`);
      applyModel(doc, params, bypass, { reporting: 'sheet' });
      assert.equal(writeIdf(doc), sheet, 'the restore was not byte-exact');
    });
  }

  test('the meters stay Monthly whatever the profile', async () => {
    // Monthly is the one frequency `parseMTR` survives: an hourly meter's
    // three-field line falls below the parser's minimum of four and is dropped
    // from the dictionary entirely.
    const doc = await documentFor(DESKS.everything.params, DESKS.everything.bypass, { reporting: 'energy' });
    const meters = objects(doc, 'Output:Meter');
    assert.ok(meters.length > 0, 'the energy profile carries meters');
    for (const meter of meters) assert.equal(meter.get('reporting_frequency'), 'Monthly');
  });
});

describe('nothing is hung on a surface with no outside', () => {
  // EnergyPlus refuses a FenestrationSurface:Detailed or a
  // Shading:Zone:Detailed whose base surface is adiabatic and stops the run:
  //
  //   ** Severe  ** FenestrationSurface:Detailed="ZN001:WALL001:WIN001",
  //                 invalid Building Surface Name="ZN001:WALL001".
  //   **  Fatal  ** GetSurfaceData: Errors discovered, program terminates.
  //
  // Measured at cd5881e: the stock desk with Fabric out exited 1 on three of
  // these. The appliers ask the document rather than `params`, so one question
  // covers a face of the boundary key and Fabric being patched out alike.
  const hosted = (doc, type, field) =>
    objects(doc, type).map((o) => o.get(field)).filter(Boolean);

  const adiabatic = (doc) =>
    new Set(
      objects(doc, 'BuildingSurface:Detailed')
        .filter((s) => s.get('outside_boundary_condition') === 'Adiabatic')
        .map((s) => s.name),
    );

  for (const [name, { params, bypass }] of Object.entries(DESKS)) {
    test(name, async () => {
      const doc = await documentFor(params, bypass);
      const sealed = adiabatic(doc);
      for (const host of hosted(doc, 'FenestrationSurface:Detailed', 'building_surface_name')) {
        assert.ok(!sealed.has(host), `an opening was written into adiabatic ${host}`);
      }
      for (const host of hosted(doc, 'Shading:Zone:Detailed', 'base_surface_name')) {
        assert.ok(!sealed.has(host), `a shade was hung on adiabatic ${host}`);
      }
    });
  }

  test('every surface is adiabatic with Fabric out', async () => {
    const doc = await documentFor(DESKS.fabricOut.params, DESKS.fabricOut.bypass);
    const surfaces = objects(doc, 'BuildingSurface:Detailed');
    assert.equal(surfaces.length, 6);
    for (const s of surfaces) assert.equal(s.get('outside_boundary_condition'), 'Adiabatic');
    assert.equal(count(doc, 'FenestrationSurface:Detailed'), 0, 'the flask the Fabric strip advertises');
    assert.equal(count(doc, 'Shading:Zone:Detailed'), 0);
  });
});

describe('the document holds together', () => {
  for (const [name, { params, bypass }] of Object.entries(DESKS)) {
    test(`${name} has no dangling references`, async () => {
      const doc = await documentFor(params, bypass);
      assert.deepEqual(doc.danglingReferences(), []);
    });
  }
});

describe('orientation lives in the vertices', () => {
  // `GlobalGeometryRules` declares World coordinates, so `Building.north_axis`
  // is ignored outright. Pinning it at 0 and turning the geometry is the only
  // arrangement in which the drawing and the engine agree.
  test('north_axis is pinned at 0 however far the desk is turned', async () => {
    for (const northAxis of [0, 40, 90, 315]) {
      const doc = await documentFor(desk({ northAxis }));
      assert.equal(Number(doc.all('Building').toArray()[0].get('north_axis')), 0);
    }
  });

  test('turning moves the vertices', async () => {
    const square = await documentFor(desk({ northAxis: 0 }));
    const turned = await documentFor(desk({ northAxis: 40 }));
    const verticesOf = (doc) => JSON.stringify(objects(doc, 'BuildingSurface:Detailed').map((s) => s.get('vertices')));
    assert.notEqual(verticesOf(square), verticesOf(turned));
  });

  test('a wall keeps its name and loses its bearing', async () => {
    // Which is exactly why `describe.js` letters a measured bearing beside the
    // compass word rather than reading the plan key's name.
    const facts = geometryFacts(await documentFor(desk({ northAxis: 40 })));
    const south = facts.faces.find((f) => f.side === 'south');
    assert.ok(south, 'the south wall is still called south');
    assert.equal(south.bearing, 220, 'and faces south-west, which is what the sheet has to letter');
  });
});

describe('the run period is the calendar the file declares', () => {
  test('day_of_week_for_start_day is left empty', async () => {
    // Pinned to Tuesday it overrode what every weather file says about itself
    // and put the run on an invented calendar in which the third Monday of
    // January fell on the 21st.
    for (const [, { params, bypass }] of Object.entries(DESKS)) {
      const doc = await documentFor(params, bypass);
      for (const period of objects(doc, 'RunPeriod')) {
        const day = period.get('day_of_week_for_start_day');
        assert.ok(day === undefined || day === null || day === '', `pinned to ${day}`);
      }
    }
  });

  test('one run period per unbroken group of months', async () => {
    const doc = await documentFor(DESKS.brokenYear.params, DESKS.brokenYear.bypass);
    const periods = objects(doc, 'RunPeriod');
    assert.equal(periods.length, monthSpans('100001110000').length);
    assert.equal(periods.length, 2, 'January, and June through August');
    const spans = periods.map((p) => [Number(p.get('begin_month')), Number(p.get('end_month'))]);
    assert.deepEqual(spans, [[1, 1], [6, 8]]);
  });

  test('December and January are not joined into a wrapping period', async () => {
    // The engine allows it, but it would run them as one environment out of
    // calendar order, and every reading here is lettered from the timestamps
    // that come back.
    const doc = await documentFor(DESKS.wrapping.params, DESKS.wrapping.bypass);
    const spans = objects(doc, 'RunPeriod').map((p) => [Number(p.get('begin_month')), Number(p.get('end_month'))]);
    assert.deepEqual(spans, [[1, 1], [12, 12]]);
  });
});

describe('a thermostat type number and its control object are one statement', () => {
  // A 1 standing over a ThermostatSetpoint:DualSetpoint is a get-input fatal,
  // not a dual setpoint with its cooling half suppressed.
  const pairs = [
    ['Always', 4, 'ThermostatSetpoint:DualSetpoint'],
    ['Occupied', 4, 'ThermostatSetpoint:DualSetpoint'],
    ['HeatingOnly', 1, 'ThermostatSetpoint:SingleHeating'],
    ['CoolingOnly', 2, 'ThermostatSetpoint:SingleCooling'],
  ];
  const ALL = ['ThermostatSetpoint:DualSetpoint', 'ThermostatSetpoint:SingleHeating', 'ThermostatSetpoint:SingleCooling'];

  for (const [availability, controlType, type] of pairs) {
    test(availability, async () => {
      const doc = await documentFor(desk({ availability }), patch({ system: false, gains: false }));
      const schedule = doc.all('Schedule:Constant').toArray().find((s) => s.name === 'Control Type');
      assert.equal(Number(schedule.get('hourly_value')), controlType);
      assert.equal(count(doc, type), 1);
      for (const other of ALL) if (other !== type) assert.equal(count(doc, other), 0, `${other} was left standing`);
    });
  }
});

describe('Schedule:Compact keeps Until and its value apart', () => {
  // `Until: 08:00` and the value after it are two separate extensible fields.
  // Joined into one comma-bearing string they produce a malformed IDF that the
  // schema will happily hold and the engine will not read.
  test('no extensible field carries both', async () => {
    const doc = await documentFor(DESKS.conditioned.params, DESKS.conditioned.bypass);
    const schedules = objects(doc, 'Schedule:Compact');
    assert.ok(schedules.length > 0, 'the conditioned desk writes compact schedules');
    for (const schedule of schedules) {
      for (const { field } of schedule.toJSON().data) {
        if (typeof field !== 'string') continue;
        assert.ok(
          !(/^Until:/.test(field.trim()) && field.includes(',')),
          `an Until row joined to its value: ${field}`,
        );
      }
    }
  });

  test('a holiday row is written before AllOtherDays, and only when listed', async () => {
    // `AllOtherDays` is the catch-all and swallows holidays, which is why the
    // Run channel's holiday switch changed nothing whatever for as long as the
    // Gains channel had no row to go with it.
    const rowsOf = (doc) =>
      objects(doc, 'Schedule:Compact')
        .flatMap((s) => s.toJSON().data.map(({ field }) => field))
        .filter((field) => typeof field === 'string' && field.startsWith('For:'));

    const closed = rowsOf(await documentFor(
      desk({ holidays: 'Listed', holidayUse: 'Closed', holidayDays: '1/1: New Year', months: '111111111111', sizingPeriods: 'No' }),
      patch({ gains: false }),
    ));
    const holidayRow = closed.findIndex((row) => row.includes('Holidays'));
    const catchAll = closed.findIndex((row) => row.includes('AllOtherDays'));
    assert.ok(holidayRow !== -1, 'no For: Holidays row was written');
    assert.ok(holidayRow < catchAll, 'the holiday row must come before the catch-all that swallows it');

    const weekend = rowsOf(await documentFor(
      desk({ holidayUse: 'AsWeekend', months: '111111111111', sizingPeriods: 'No' }),
      patch({ gains: false }),
    ));
    assert.ok(
      !weekend.some((row) => row.includes('Holidays')),
      'AsWeekend writes no row, which is exactly what that setting means',
    );
  });
});

describe('the special days follow the weather file, or replace it', () => {
  test('a listed day turns the file\'s own days off', async () => {
    // The weather file's special days take precedence, so "Listed" has to write
    // use_weather_file_holidays_and_special_days = No or the listed days lose
    // silently where they collide.
    const doc = await documentFor(DESKS.conditioned.params, DESKS.conditioned.bypass);
    assert.ok(count(doc, 'RunPeriodControl:SpecialDays') > 0);
    for (const period of objects(doc, 'RunPeriod')) {
      assert.equal(period.get('use_weather_file_holidays_and_special_days'), 'No');
    }
  });

  test('the sizing-period switch does not reach them', async () => {
    // CLAUDE.md used to say "special days are never used with a
    // `SizingPeriod:*` — a design-day desk has no calendar at all", and both
    // halves were wrong. `applyRun` gates them on `holidays` alone, and there
    // is no such thing as a desk with no calendar in it: `isMonthMask` requires
    // a month, so the document always carries at least one `RunPeriod`. What a
    // design-day desk lacks is a weather file, which is the engine's business
    // and not the document's — `test/engine/` measures that half.
    const listed = (sizingPeriods) => desk({
      holidays: 'Listed',
      holidayDays: '1/1: New Year; 3 Mon in Jan: MLK',
      sizingPeriods,
      months: '111111111111',
    });
    const kept = await documentFor(listed('Yes'), patch());
    const skipped = await documentFor(listed('No'), patch());

    for (const doc of [kept, skipped]) {
      assert.equal(count(doc, 'RunPeriodControl:SpecialDays'), 2);
      assert.ok(count(doc, 'RunPeriod') > 0, 'a desk with no calendar in it');
    }
    // Which is to say the two documents differ in exactly one field.
    const sizing = (doc) => objects(doc, 'SimulationControl')[0].get('run_simulation_for_sizing_periods');
    assert.equal(sizing(kept), 'Yes');
    assert.equal(sizing(skipped), 'No');
  });

  test('every mask the calendar admits still carries a run period', async () => {
    // The other half of "no calendar at all": there is no setting of the Run
    // strip that empties the document of run periods.
    for (const months of ['111111111111', '100000000000', '000000000001', '101010101010']) {
      const doc = await documentFor(desk({ months, sizingPeriods: 'No' }), patch());
      assert.ok(count(doc, 'RunPeriod') > 0, `${months} wrote no run period`);
    }
  });

  test('"No" turns both sources off, however many days are listed', async () => {
    // The two holiday sources are independent fields and `holidays` is the one
    // switch over both of them: `No` writes no `RunPeriodControl:SpecialDays`
    // at all *and* declines the file's own, so a list left in the box from an
    // earlier setting cannot come back through either route.
    //
    // This used to stand as "a design-day desk has no calendar at all", under
    // a `holidayUse: 'Listed'` that is not a value that control admits (its
    // three options are AsWeekend, Closed and Open — `holidays` is the key
    // that takes Listed), and behind an `if (count(doc, 'RunPeriod') === 0)`
    // that can never be true: `applyRun` writes one run period per unbroken
    // group of months and every desk here has months in it. It asserted
    // nothing, twice over. There is nothing in the document for the original
    // claim to be about either — special days are written whatever
    // `sizingPeriods` says, and it is EnergyPlus that ignores them when no
    // weather-file period is simulated.
    const doc = await documentFor(
      desk({ holidays: 'No', holidayDays: '1/1: New Year', sizingPeriods: 'No', months: '111111111111' }),
      patch(),
    );
    assert.ok(count(doc, 'RunPeriod') > 0, 'the desk has a year to hang a calendar on');
    assert.equal(count(doc, 'RunPeriodControl:SpecialDays'), 0, 'a listed day was written under "No"');
    for (const period of objects(doc, 'RunPeriod')) {
      assert.equal(period.get('use_weather_file_holidays_and_special_days'), 'No');
    }
  });
});

describe('the ratios count only what has an outside', () => {
  test('an adiabatic wall is out of the window-to-wall denominator', async () => {
    // Three walls glazed to 1.0 against four walls of denominator reports 0.75,
    // a number no setting of the sliders can reach and about no part of the
    // building.
    const open = geometryFacts(await documentFor(desk({ wwrN: 0.5, wwrE: 0.5, wwrS: 0.5, wwrW: 0.5 })));
    assert.ok(Math.abs(open.wwr - 0.5) < 0.02, `four open walls at 0.5 read ${open.wwr}`);

    const party = geometryFacts(await documentFor(desk({
      wwrN: 0.5, wwrE: 0.5, wwrS: 0.5, wwrW: 0.5, wallBoundaryW: 'Adiabatic',
    })));
    assert.ok(Math.abs(party.wwr - 0.5) < 0.02, `a party wall moved the ratio to ${party.wwr}`);
  });
});

describe('the multiplier is the building, and the ratios are not', () => {
  // Every intensity used to divide by one zone's floor polygon while the meters
  // carried the multiplier, so a multiplier of 3 reported three times the true
  // intensity — TEDI 9.6 → 28.8, the bill's per-m² 77.1 → 231.
  test('gross is the storey times the multiplier', async () => {
    const one = geometryFacts(await documentFor(desk({ multiplier: 1 })));
    const three = geometryFacts(await documentFor(desk({ multiplier: 3 })));
    assert.equal(three.storeys, 3);
    assert.ok(Math.abs(three.grossFloor - one.grossFloor * 3) < 1e-6);
    assert.ok(Math.abs(three.grossVolume - one.grossVolume * 3) < 1e-6);
    assert.ok(Math.abs(three.floor - one.floor) < 1e-9, 'the storey itself does not grow');
  });

  test('every term of a ratio scales by the same n, so the ratio does not', async () => {
    const one = geometryFacts(await documentFor(desk({ multiplier: 1, wwrS: 0.4, skyRatio: 0.08 }), patch({ skylights: false })));
    const three = geometryFacts(await documentFor(desk({ multiplier: 3, wwrS: 0.4, skyRatio: 0.08 }), patch({ skylights: false })));
    for (const key of ['wwr', 'srr', 'compactness']) {
      assert.ok(Math.abs(one[key] - three[key]) < 1e-9, `${key} moved with the multiplier`);
    }
  });

  test('the multiplier is read off the Zone object, not off params', async () => {
    // `buildSample` hands `geometryFacts` a document carrying a sweep's
    // overlay, so a fact taken from live parameters would describe the desk
    // instead of the sample.
    const doc = await documentFor(desk({ multiplier: 3 }));
    const zone = doc.get('Zone', 'ZONE ONE');
    zone.set('multiplier', 5);
    // Asserted against the literal rather than against the field it was just
    // written to. Read back off the same object, both sides move together: a
    // nudge that silently failed to land would leave 3 standing on each side
    // and the test would go on passing while no longer able to see the bug it
    // is here for -- which is what the previous `set?.() ?? update?.()` pair
    // risked, since `set` returns undefined and the `??` therefore ran both.
    assert.equal(Number(zone.get('multiplier')), 5, 'the nudge did not reach the document');
    assert.equal(geometryFacts(doc).storeys, 5, 'the storeys were counted off params, not off the Zone');
  });
});

describe('the stock example keeps its shape', () => {
  test('six surfaces, one zone, the walls in plan order', async () => {
    const doc = await documentFor();
    assert.equal(count(doc, 'Zone'), 1);
    assert.deepEqual(names(doc, 'BuildingSurface:Detailed'), [...WALLS.map((w) => w.name), FLOOR, ROOF]);
  });

  test('the demonstration loads are gone', async () => {
    // The matched ±352 W OtherEquipment test pair and the .mtr-only meters were
    // removed outright: nothing read either, and a pair whose halves cancel
    // fails quietly the day an edit touches one half.
    const doc = await documentFor(DESKS.everything.params, DESKS.everything.bypass);
    assert.equal(count(doc, 'OtherEquipment'), 0);
  });

  test('the grounds lighting is behind its own strip', async () => {
    // 5.25 kW of grounds lighting is 23 MWh a year against the building's 18.
    assert.equal(count(await documentFor(desk(), patch({ grounds: true })), 'Exterior:Lights'), 0);
    assert.equal(count(await documentFor(desk(), patch({ grounds: false })), 'Exterior:Lights'), 1);
  });
});

describe('the defaults are the ones the link format froze', () => {
  test('DEFAULT_PARAMETERS is scalars only', async () => {
    // `Object.freeze` is shallow, so `revert`'s `Object.assign` would alias an
    // array default straight into live `params` — and `DEFAULTS_BY_VERSION.v1`
    // is that same object, so the link format itself would drift with no
    // symptom until a shared link came back wrong.
    for (const [key, value] of Object.entries(DEFAULT_PARAMETERS)) {
      assert.ok(
        ['string', 'number', 'boolean'].includes(typeof value),
        `${key} is ${typeof value}, and every parameter must be a scalar`,
      );
    }
  });
});
