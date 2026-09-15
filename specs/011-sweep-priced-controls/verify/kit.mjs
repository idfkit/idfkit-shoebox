/**
 * Shared by the harnesses in this directory; not a harness itself.
 *
 * A meter basis shaped like `MeterBasis` in `main.js`, and the one pricing
 * `pricedReadings` does there, written against the real `computeBill`,
 * `assume` and quantity readers. `main.js` touches the DOM at import, so the
 * harness cannot import `pricedReadings` itself; this copy reads the bill
 * through the same three `Quantity.read`s, which is where the arithmetic is.
 */

import { END_USES, computeBill } from '../../../src/bill.js';
import { CHANNELS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { assume, resolveRates } from '../../../src/rates.js';
import { QUANTITY_BY_ID } from '../../../src/study.js';

export const PRICED_KEYS = new Set(CHANNELS.filter((c) => c.prices).flatMap((c) => c.keys()));
export const PRICED_FACES = CHANNELS.filter((c) => c.prices)
  .flatMap((c) => c.controls)
  .filter((c) => c.kind === 'scale');

const J = 3_600_000;
const meter = (id) => END_USES.find((use) => use.id === id).meter;

/** A year of a small building, every building end use non-zero. */
export const BASIS = Object.freeze({
  series: Object.freeze({
    [meter('heating')]: 9000 * J,
    [meter('cooling')]: 4000 * J,
    [meter('lighting')]: 2500 * J,
    [meter('equipment')]: 3000 * J,
  }),
  floorArea: 100,
  hours: 8760,
  engaged: Object.freeze(['system', 'gains']),
  annual: true,
  months: 12,
});

/** The station-less card, so every rate is either Assumed or Absent. */
export const CARD = resolveRates(null);

export function billAt(pricing, basis = BASIS, card = CARD) {
  if (!basis) return null;
  return computeBill({
    series: new Map(Object.entries(basis.series)),
    params: pricing,
    card: assume(card, pricing),
    floorArea: basis.floorArea,
    hours: basis.hours,
    engaged: new Set(basis.engaged),
    annual: basis.annual,
    months: basis.months,
  });
}

export function pricedReadings(readings, basis, pricing, card = CARD) {
  const landed = { bill: billAt(pricing, basis, card) };
  return Object.freeze({
    ...readings,
    eui: QUANTITY_BY_ID.eui.read(landed),
    cost: QUANTITY_BY_ID.cost.read(landed),
    carbon: QUANTITY_BY_ID.carbon.read(landed),
  });
}

/** The three bill readings as numbers, for comparison. */
export const figures = (bag) => ({ eui: bag.eui, cost: bag.cost?.value ?? null, carbon: bag.carbon });

export const DESKS = Object.freeze({
  boiler: Object.freeze({ ...DEFAULT_PARAMETERS, heatSource: 'GasBoiler', rateBasis: 'Assumed', factorBasis: 'Assumed' }),
  electric: Object.freeze({ ...DEFAULT_PARAMETERS, heatSource: 'Resistance', rateBasis: 'Assumed', factorBasis: 'Assumed' }),
  heatPump: Object.freeze({ ...DEFAULT_PARAMETERS, heatSource: 'HeatPump', rateBasis: 'Assumed', factorBasis: 'Assumed' }),
});

export function harness(title) {
  let failures = 0;
  console.log(title);
  return {
    ok(label, condition, detail = '') {
      if (condition) console.log(`  ok   ${label}`);
      else {
        failures += 1;
        console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
      }
    },
    done() {
      console.log(failures ? `\n${failures} failed` : '\nall passed');
      process.exitCode = failures ? 1 : 0;
    },
  };
}
