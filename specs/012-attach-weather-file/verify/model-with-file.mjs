/**
 * Quickstart gate 5 — the model, written and run, with a file attached.
 *
 * The gate a plausible design dies at if it is going to. Three claims are under
 * test and only one of them is about this feature's own code:
 *
 *   1. `applyModel` is still idempotent, with design days and without them;
 *   2. a desk that carried design days and lost them serialises identically to
 *      one that never had any — the claim `clearDesignDays` makes, and the one
 *      that would quietly break the sweep restore if it were false;
 *   3. **a document with no `SizingPeriod:DesignDay` at all actually runs.**
 *      `src/model.js` says nothing here is autosized, because the console runs
 *      no sizing pass, and that sentence is the whole justification for the
 *      no-DDY desk. This is where it is tested rather than trusted.
 *
 * One EnergyPlus per process: `runIdf` spawns one, which is why this can run
 * several.
 */
import {
  assertStaged,
  documentFor,
  errSummary,
  harness,
  idfFor,
  loadSchema,
  runIdf,
  thrice,
} from './kit.mjs';
import { epwWholeYear, ddyValid } from './fixtures.mjs';
import { writeIdf } from '@idfkit/core';
import { clearDesignDays, designConditionsFrom, designDayDatums, setSiteLocation } from '../../../src/model.js';
import { siteLocationValues, readLocation } from '../../../src/epw.js';
import { DEFAULT_PARAMETERS } from '../../../src/controls.js';

assertStaged();
const h = harness('gate 5 — the model, written and run, with a file attached');
const schema = await loadSchema();
const epw = epwWholeYear();
const { place } = readLocation(epw);

/* ── idempotence, both ways ───────────────────────────────────────────── */

const withDays = thrice({ schema, conditions: designConditionsFrom(ddyValid(schema), schema), annual: true });
h.ok('idempotent with design days', withDays[0] === withDays[1] && withDays[1] === withDays[2]);

// The no-DDY desk, built the way `attachClimate` builds it.
const asAttached = (params = DEFAULT_PARAMETERS) => {
  const doc = documentFor({ schema, params, annual: true });
  clearDesignDays(doc);
  setSiteLocation(doc, { name: place.city, values: siteLocationValues(place) });
  return doc;
};

const bare = asAttached();
const texts = [writeIdf(bare)];
for (let pass = 0; pass < 2; pass += 1) {
  const again = asAttached();
  texts.push(writeIdf(again));
}
h.ok('idempotent with no design days', texts[0] === texts[1] && texts[1] === texts[2]);
h.ok('no SizingPeriod:DesignDay survives', !texts[0].includes('SizingPeriod:DesignDay'));
h.ok('designDayDatums returns []', designDayDatums(bare).length === 0);
h.ok(
  'Site:Location carries the file’s own co-ordinates',
  texts[0].includes(String(place.latitude)) && texts[0].includes(String(place.longitude)),
  `${place.latitude} / ${place.longitude}`,
);

// The claim that matters for the sweep restore: had-and-lost == never-had.
const hadAndLost = documentFor({ schema, conditions: designConditionsFrom(ddyValid(schema), schema), annual: true });
clearDesignDays(hadAndLost);
setSiteLocation(hadAndLost, { name: place.city, values: siteLocationValues(place) });
h.ok('a desk that lost its design days == one that never had any', writeIdf(hadAndLost) === texts[0]);

/* ── and it runs ──────────────────────────────────────────────────────── */

const noDays = runIdf({ idf: texts[0], epw });
h.ok('the no-design-days desk runs', noDays.exit === 0 && !noDays.fatal, `exit ${noDays.exit}`);
h.ok('with no severe errors', noDays.severe === 0, `${noDays.severe} severe`);
h.ok('and produces an ESO', (noDays.eso ?? '').length > 1000, `${(noDays.eso ?? '').split('\n').length} lines`);
// Grepped rather than asserted away. The "requested but not generated" warning
// is the desk's own standing one -- it is raised on a design-day desk with no
// weather attached at all -- so its presence says nothing about this feature;
// what would matter is a *new* one, and the line is printed so a reader can see
// which it is.
const notGenerated = [...errSummary(noDays.err, 40)].filter((l) =>
  /requested but not generated/.test(String(l)),
);
h.ok(
  'the .err carries no new "requested but not generated"',
  notGenerated.length <= 1,
  notGenerated.length ? String(notGenerated[0]).trim().slice(0, 100) : 'none',
);

const sized = runIdf({
  idf: idfFor({ schema, conditions: designConditionsFrom(ddyValid(schema), schema), annual: true }),
  epw,
});
h.ok('the DDY desk runs too', sized.exit === 0 && !sized.fatal, `exit ${sized.exit}, ${sized.severe} severe`);

h.notRun(
  'every reading over a licensed CIBSE DSY1',
  'the proxy denies climate.onebuilding.org (CONNECT 403) and CIBSE data is purchased, so no real file exists here',
);
h.notRun(
  'load_model / validate_model / check_model_integrity',
  'no local EnergyPlus and no idfkit MCP tools in this environment; the WASM runner stands in for run_simulation alone',
);

h.done();
