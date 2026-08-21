/**
 * Runs, written by hand.
 *
 * The readers in `readings.js` are pure functions over a parsed ESO and over
 * the tabular report's markup, so they can be driven with a run small enough to
 * read — three series and a handful of hours, rather than the 8,760 the sheet
 * actually gets. That is the point: an assertion about which hour is chosen is
 * only legible if you can see all the candidates in the fixture.
 *
 * The real engine's own output is exercised in `test/engine/`, where a design
 * day is solved and the same readers are pointed at what comes back. These two
 * are complementary and neither replaces the other: this one says what the
 * arithmetic is, that one says the format has not moved under it.
 */

import { parseESO } from '@idfkit/engine';

const DICT_HEAD = `Program Version,EnergyPlus, Version 26.1.0-test, YMD=2026.01.01 00:00
1,5,Environment Title[],Latitude[deg],Longitude[deg],Time Zone[],Elevation[m]
2,8,Day of Simulation[],Month[],Day of Month[],DST Indicator[1=yes 0=no],Hour[],StartMinute[],EndMinute[],DayType`;

/**
 * Build an ESO out of environments and series.
 *
 * `environments` is `[{ title, dayType, hours: [{ month, day, hour }] }]` and
 * `series` is `[{ id, key, name, units, values }]`, values in the flat order
 * the hours are declared across every environment — the shape `getTimeSeries`
 * hands back, so a fixture reads the way the assertion does.
 */
export function esoOf({ environments, series }) {
  // A meter is declared without the key field a variable carries, which is the
  // whole reason `parseMTR` mis-parses one: the name lands in `keyValue` with
  // its units and frequency still attached, and `bill.js` recovers it from
  // there. A fixture that wrote meters as ordinary variables would be testing a
  // shape the engine never produces.
  const dict = series.map((s) =>
    s.meter
      ? `${s.id},1,${s.name} [${s.units ?? 'J'}] !${s.frequency ?? 'Monthly'}${
          (s.frequency ?? 'Monthly') === 'Monthly' ? '  [Value,Min,Day,Hour,Minute,Max,Day,Hour,Minute]' : ''
        }`
      : `${s.id},1,${s.key},${s.name} [${s.units ?? 'C'}] !${s.frequency ?? 'Hourly'}`,
  );
  const lines = [DICT_HEAD, ...dict, 'End of Data Dictionary'];
  let n = 0;
  environments.forEach((env, e) => {
    lines.push(`1,${env.title},  39.83,-104.65, -7.00,1650.00`);
    for (const at of env.hours) {
      lines.push(`2,${e + 1},${at.month},${at.day}, 0,${at.hour}, 0.00,60.00,${env.dayType ?? 'SummerDesignDay'}`);
      for (const s of series) lines.push(`${s.id},${s.values[n]}`);
      n += 1;
    }
  });
  lines.push('End of Data');
  return parseESO(lines.join('\n'));
}

/** A day of hours, 1 to 24. */
export const dayOf = (month, day) =>
  Array.from({ length: 24 }, (_, i) => ({ month, day, hour: i + 1 }));

/**
 * The Envelope Summary's exterior fenestration table.
 *
 * `columns` is passed in so a test can add one in front of the ones the reader
 * wants, which is what actually happened between versions and what a counted
 * index would have read straight through.
 */
export function fenestrationHtml({ columns, rows }) {
  const cells = (values) => values.map((v) => `<td align="right">${v}</td>`).join('');
  return `<html><body>
<!-- FullName:Envelope Summary_Entire Facility_Exterior Fenestration-->
<table border="1">
<tr>${cells(columns)}</tr>
${rows.map((row) => `<tr>${cells(row)}</tr>`).join('\n')}
</table>
<!-- FullName:Envelope Summary_Entire Facility_Exterior Fenestration Shaded State-->
<table border="1"><tr><td>Construction</td></tr><tr><td>WINDOW</td></tr></table>
</body></html>`;
}

/** The columns EnergyPlus 26.1 writes, in the order it writes them. */
export const FENESTRATION_COLUMNS = Object.freeze([
  'Construction',
  'Frame and Divider',
  'Glass Area [m2]',
  'Frame Area [m2]',
  'Divider Area [m2]',
  'Area of One Opening [m2]',
  'Area of Multiplied Openings [m2]',
  'Glass U-Factor [W/m2-K]',
  'Glass SHGC',
  'Glass Visible Transmittance',
  'Frame Conductance [W/m2-K]',
  'Divider Conductance [W/m2-K]',
  'NFRC Product Type',
  'Assembly U-Factor [W/m2-K]',
  'Assembly SHGC',
  'Assembly Visible Transmittance',
  'Shade Control',
  'Parent Surface',
  'Azimuth [deg]',
  'Tilt [deg]',
  'Cardinal Direction',
]);
