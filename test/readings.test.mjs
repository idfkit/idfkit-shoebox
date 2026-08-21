/**
 * What a run means.
 *
 * These readers decide which hour every meter on the desk is reading, which
 * environments count toward a bill, and what the sheet is entitled to letter
 * where a figure is missing. Nearly all of them are argmaxes or filters whose
 * failure mode is a number that looks perfectly reasonable and is about the
 * wrong hour.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTANTS,
  MONTHS,
  dayExtremeNear,
  demandOver,
  environmentRuns,
  findInstant,
  glassProperties,
  hourly,
  instantOffers,
  kindToken,
  pinAt,
  readExtremes,
  readOverheat,
  resolvePin,
  runCalendar,
  stampText,
  worstHour,
} from '../src/readings.js';
import { FENESTRATION_COLUMNS, dayOf, esoOf, fenestrationHtml } from './fixtures.mjs';

const ZONE = 'Zone Mean Air Temperature';
const zoneSeries = (values) => ({ id: 7, key: 'ZONE ONE', name: ZONE, units: 'C', values });

/** A design-day pair: a January day and a July day, 24 hours each. */
function designDays({ winter, summer }) {
  return esoOf({
    environments: [
      { title: 'DENVER ANN HTG 99.6% CONDNS DB', dayType: 'WinterDesignDay', hours: dayOf(1, 21) },
      { title: 'DENVER ANN CLG .4% CONDNS DB=>MWB', dayType: 'SummerDesignDay', hours: dayOf(7, 21) },
    ],
    series: [zoneSeries([...winter, ...summer])],
  });
}

const flat = (v, n = 24) => Array.from({ length: n }, () => v);
const points = (eso) => hourly(eso, /Zone Mean Air Temperature/i);
const runsOf = (eso) => environmentRuns(points(eso), eso.environments);

describe('an environment is read off its own timestamps', () => {
  // Never off `params` — the desk may have moved since the solve.
  test('a design day pair is named by its title', () => {
    const runs = runsOf(designDays({ winter: flat(-5), summer: flat(31) }));
    assert.equal(runs.length, 2);
    assert.equal(runs[0].kind, 'Winter design day');
    assert.equal(runs[1].kind, 'Summer design day');
    assert.equal(kindToken(runs[0]), 'winter');
    assert.equal(kindToken(runs[1]), 'summer');
  });

  test('a run period is named by the months that came back', () => {
    const eso = esoOf({
      environments: [{
        title: 'Denver TMYx',
        dayType: 'Monday',
        hours: [
          ...dayOf(1, 15),
          ...dayOf(2, 15),
          ...dayOf(3, 15),
        ],
      }],
      series: [zoneSeries(flat(18, 72))],
    });
    const [run] = runsOf(eso);
    assert.equal(run.kind, null, 'a weather-file environment is not a design day');
    assert.equal(run.months, 3);
    assert.ok(run.label.includes(MONTHS[0]) && run.label.includes(MONTHS[2]), run.label);
    assert.ok(!run.noun.includes(MONTHS[0]), `the noun carries no dates: ${run.noun}`);
  });

  test('several run periods come back as several environments', () => {
    const eso = esoOf({
      environments: [
        { title: 'Denver TMYx', dayType: 'Sunday', hours: dayOf(1, 15) },
        { title: 'Denver TMYx', dayType: 'Thursday', hours: dayOf(7, 15) },
      ],
      series: [zoneSeries(flat(18, 48))],
    });
    assert.equal(runsOf(eso).length, 2);
  });
});

describe('the hour every meter is read at', () => {
  test('is the one furthest from 20 °C, within its environment', () => {
    const winter = flat(0);
    winter[5] = -12; // 32 K off
    const summer = flat(24);
    summer[14] = 33; // 13 K off
    const eso = designDays({ winter, summer });
    const [w, s] = runsOf(eso);
    assert.equal(points(eso)[worstHour(points(eso), w)].value, -12);
    assert.equal(points(eso)[worstHour(points(eso), s)].value, 33);
  });

  test('a click on an annual axis can only honestly mean a day', () => {
    // Ten hours to the pixel, so the pick snaps to the extreme within the
    // clicked day rather than to whichever hour sat under the cursor.
    const day = flat(21, 24);
    day[9] = 30;
    const eso = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: [...dayOf(6, 1), ...dayOf(6, 2)] }],
      series: [zoneSeries([...day, ...flat(19, 24)])],
    });
    const p = points(eso);
    const runs = runsOf(eso);
    assert.equal(p[dayExtremeNear(p, runs, 3)].value, 30, 'snapped outside the clicked day');
    assert.equal(dayExtremeNear(p, runs, 30), 24, 'a flat day snaps to its own first hour, not the other day\'s');
  });

  test('the stamp is the one way the sheet letters an hour', () => {
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    assert.equal(stampText(points(eso), 0), '01:00, 21 Jan');
  });
});

describe('a pin is a calendar stamp, and it is released rather than slid', () => {
  test('it is found again in a run that has the hour', () => {
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    const p = points(eso);
    const runs = runsOf(eso);
    const pin = pinAt(p, runs, 5);
    assert.deepEqual(pin, { kind: 'winter', month: 1, day: 21, hour: 6 });
    assert.equal(resolvePin(pin, p, runs), 5);
  });

  test('a year pin is not resolved into a design-day run', () => {
    // Which is the case that used to slide the reading to a neighbour: the
    // stamp is by environment *kind*, so there is nothing here to slide to.
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    const pin = { kind: 'year', month: 8, day: 3, hour: 13 };
    assert.equal(resolvePin(pin, points(eso), runsOf(eso)), null);
  });

  test('a design-day pin is not resolved into a year', () => {
    const eso = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: dayOf(1, 21) }],
      series: [zoneSeries(flat(18))],
    });
    const pin = { kind: 'winter', month: 1, day: 21, hour: 3 };
    assert.equal(resolvePin(pin, points(eso), runsOf(eso)), null, 'matched on date alone');
  });
});

describe('the extremes are read over the billed environments', () => {
  test('with a year in the run, the sizing days stay out of it', () => {
    // Their whole point is to be more extreme than the year they precede.
    const eso = esoOf({
      environments: [
        { title: 'DENVER ANN HTG 99.6% CONDNS DB', dayType: 'WinterDesignDay', hours: dayOf(1, 21) },
        { title: 'DENVER ANN CLG .4% CONDNS DB=>MWB', dayType: 'SummerDesignDay', hours: dayOf(7, 21) },
        { title: 'Denver TMYx', dayType: 'Sunday', hours: dayOf(4, 15) },
      ],
      series: [zoneSeries([...flat(-30), ...flat(45), ...flat(19).map((v, i) => (i === 3 ? 12 : i === 9 ? 26 : v))])],
    });
    assert.deepEqual(readExtremes(eso), { low: 12, high: 26 });
  });

  test('without one, the winter day owns the low and the summer day the high', () => {
    const winter = flat(2);
    winter[4] = -8;
    const summer = flat(26);
    summer[15] = 34;
    assert.deepEqual(readExtremes(designDays({ winter, summer })), { low: -8, high: 34 });
  });

  test('a frequency needs a year to be a frequency of', () => {
    // Two deliberately punishing days must not set the exceedance rate for
    // eight thousand ordinary ones.
    assert.equal(readOverheat(designDays({ winter: flat(0), summer: flat(40) }), 25), null);
  });
});

describe('an offer is refused with its reason rather than sliding', () => {
  test('peak heating over a run that never called for heat is refused', () => {
    // `Instant.holds` is the honesty gate: an argmax always returns something,
    // so without it this hands back the least-cooled hour under a label
    // claiming the opposite.
    const eso = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: dayOf(7, 15) }],
      series: [
        zoneSeries(flat(26)),
        { id: 8, key: 'ZONE ONE', name: 'Zone Air Heat Balance System Air Transfer Rate', units: 'W', values: flat(-500) },
      ],
    });
    const p = points(eso);
    const runs = runsOf(eso);
    const heating = INSTANTS.find((i) => i.id === 'heating');
    const found = findInstant(heating, p, runs, eso);
    assert.equal(found.at, null, 'a heating hour was found in a run that only cooled');
    assert.equal(found.reason, heating.never);
    const offer = instantOffers(p, runs, eso).find((o) => o.instant.id === 'heating');
    assert.equal(offer.at, null, 'the offer stands unrefused');
  });

  test('a series the run does not carry is refused as missing, not as zero', () => {
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    const offers = instantOffers(points(eso), runsOf(eso), eso);
    const offer = offers.find((o) => o.instant.id === 'cooling');
    assert.equal(offer.at, null);
    assert.equal(offer.reason, INSTANTS.find((i) => i.id === 'cooling').missing);
  });

  test('the zone\'s own warmest and coolest hold on any run at all', () => {
    // A free-running desk has no heating or cooling rate, which is why these
    // two belong beside the peak-load pair.
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    const offers = instantOffers(points(eso), runsOf(eso), eso);
    for (const id of ['warmest', 'coolest']) {
      const offer = offers.find((o) => o.instant.id === id);
      assert.ok(offer.at != null, `${id} was refused on a run that has it: ${offer.reason}`);
    }
  });
});

describe('the calendar is walked out of the run\'s own timestamps', () => {
  test('so there is nothing left to refuse', () => {
    const eso = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: [...dayOf(2, 14), ...dayOf(2, 15)] }],
      series: [zoneSeries(flat(18, 48))],
    });
    const calendar = runCalendar(points(eso), runsOf(eso)[0]);
    assert.deepEqual([...calendar.keys()], [2], 'a month the run does not hold was offered');
    const days = calendar.get(2);
    assert.deepEqual([...days.keys()], [14, 15]);
    assert.deepEqual([...days.get(14).keys()], Array.from({ length: 24 }, (_, i) => i + 1));
  });
});

describe('the demand intensities', () => {
  const meterSeries = (id, name, values) => ({ id, meter: true, name, units: 'J', values });

  test('divide by the floor area they are handed', () => {
    const eso = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: dayOf(1, 15) }],
      series: [
        zoneSeries(flat(18)),
        meterSeries(8, 'Heating:DistrictHeatingWater', flat(3_600_000)),
        meterSeries(9, 'Cooling:DistrictCooling', flat(1_800_000)),
      ],
    });
    const environments = new Set(runsOf(eso).map((r) => r.key));
    const demand = demandOver(eso, environments, 100);
    // 24 hours × 3.6 MJ is 24 kWh, over 100 m².
    assert.ok(Math.abs(demand.tedi - 0.24) < 1e-9, `tedi ${demand.tedi}`);
    assert.ok(Math.abs(demand.cedi - 0.12) < 1e-9, `cedi ${demand.cedi}`);
  });

  test('are null, not zero, where the meter was never requested', () => {
    // Which is what a bypassed System looks like from here: a building with no
    // system is not a missing measurement, and the row is omitted rather than
    // drawn as an em dash over a zero.
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    const environments = new Set(runsOf(eso).map((r) => r.key));
    const demand = demandOver(eso, environments, 100);
    assert.equal(demand.tedi, null);
    assert.equal(demand.cedi, null);
  });

  test('an hourly meter is dropped from the dictionary entirely', () => {
    // `parseMTR` is `parseESO` under another name: a meter is declared without
    // the key field a variable carries, so an hourly meter's three-field line
    // falls below the parser's minimum of four and never reaches the
    // dictionary. Monthly is the one frequency that survives, which is why
    // `syncReporting` requests that whatever the profile.
    const monthly = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: dayOf(1, 15) }],
      series: [zoneSeries(flat(18)), meterSeries(8, 'Heating:DistrictHeatingWater', flat(3_600_000))],
    });
    const hourlyMeter = esoOf({
      environments: [{ title: 'Denver TMYx', dayType: 'Monday', hours: dayOf(1, 15) }],
      series: [
        zoneSeries(flat(18)),
        { ...meterSeries(8, 'Heating:DistrictHeatingWater', flat(3_600_000)), frequency: 'Hourly' },
      ],
    });
    assert.equal(monthly.variables.size, 2);
    assert.equal(hourlyMeter.variables.size, 1, 'an hourly meter survived the parse');
  });

  test('refuse a floor area of nothing rather than dividing by it', () => {
    const eso = designDays({ winter: flat(0), summer: flat(30) });
    assert.equal(demandOver(eso, new Set([0]), 0), null);
  });
});

describe('the window\'s own performance, off the tabular report', () => {
  const row = (overrides = {}) => {
    const cells = FENESTRATION_COLUMNS.map((c) => overrides[c] ?? '0.000');
    return cells;
  };

  const table = (rows) => fenestrationHtml({ columns: FENESTRATION_COLUMNS, rows });

  test('is read by column head, not by position', () => {
    // The table has grown columns between versions — the NFRC assembly trio is
    // newer than the glass one — and a counted index would silently read the
    // wrong one.
    const shifted = ['Some New Column', ...FENESTRATION_COLUMNS];
    const html = fenestrationHtml({
      columns: shifted,
      rows: [['new', ...row({
        Construction: 'WINDOW',
        'Glass U-Factor [W/m2-K]': '1.732',
        'Glass SHGC': '0.412',
        'Glass Visible Transmittance': '0.633',
      })]],
    });
    const glass = glassProperties(html, 'WINDOW');
    assert.equal(glass.u, 1.732);
    assert.equal(glass.shgc, 0.412);
    assert.equal(glass.vt, 0.633);
  });

  test('throws for a table it no longer understands', () => {
    // Rather than returning null, which would letter an em dash and look
    // exactly like a window that was not built.
    const html = fenestrationHtml({
      columns: ['Construction', 'Glass SHGC'],
      rows: [['WINDOW', '0.4']],
    });
    assert.throws(() => glassProperties(html, 'WINDOW'), /Glass U-Factor/);
  });

  test('reads the named construction, never the Total or Average row', () => {
    // That row is area-weighted across every exterior opening, so with
    // rooflights on their own glass it averages two windows into a number no
    // assembly has — measured, 1.732 and 2.603 averaging to neither.
    const html = table([
      row({ Construction: 'WINDOW', 'Glass U-Factor [W/m2-K]': '1.732' }),
      row({ Construction: 'SKYGLASS', 'Glass U-Factor [W/m2-K]': '2.603' }),
      row({ Construction: 'Total or Average', 'Glass U-Factor [W/m2-K]': '2.104' }),
    ]);
    assert.equal(glassProperties(html, 'WINDOW').u, 1.732);
    assert.equal(glassProperties(html, 'SKYGLASS').u, 2.603);
  });

  test('an empty assembly cell is absent, not zero', () => {
    // `Number('')` is 0, which would print a U-factor of zero over every
    // frameless window.
    const html = table([row({
      Construction: 'WINDOW',
      'Glass U-Factor [W/m2-K]': '1.732',
      'Assembly U-Factor [W/m2-K]': '',
      'Assembly SHGC': '-',
      'Assembly Visible Transmittance': '',
    })]);
    const glass = glassProperties(html, 'WINDOW');
    assert.equal(glass.u, 1.732);
    assert.equal(glass.assembly.u, null);
    assert.equal(glass.assembly.shgc, null);
    assert.equal(glass.assembly.vt, null);
  });

  test('a construction that glazes nothing has no performance', () => {
    const html = table([row({ Construction: 'SKYGLASS' })]);
    assert.equal(glassProperties(html, 'WINDOW'), null);
  });

  test('a run with no tabular report reads as absent', () => {
    assert.equal(glassProperties('', 'WINDOW'), null);
    assert.equal(glassProperties('<html><body>nothing here</body></html>', 'WINDOW'), null);
  });
});
