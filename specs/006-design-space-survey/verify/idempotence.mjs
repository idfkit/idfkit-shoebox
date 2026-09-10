/**
 * Gate 3 of quickstart.md: idempotence and the shared document.
 *
 * The constitution's second quality gate, applied to this feature's own path.
 * A survey row uses `buildSample` unchanged — the overlay is applied, written
 * and restored in one synchronous breath — so what has to hold here is what
 * has always had to hold, plus one thing that is new: **the restore has to be
 * byte-exact for a two-key overlay**, because a survey row moves the desk in
 * two places at once (axis Y in the snapshot, axis X in the sweep) where a
 * study moves it in one.
 *
 * That is the property the whole arrangement leans on. `buildSample` restores
 * by re-applying the live desk rather than by remembering what it changed, so
 * a restore is only a restore if `applyModel` is idempotent; if it is not, the
 * pump and the pool share a document that drifts, one sample at a time, with
 * no symptom until a number is wrong.
 */

import { writeIdf } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel, setAnnual } from '../../../src/model.js';
import { COARSE_GRID, READING_BY_ID, axisFor, makeSurvey, rowsFor } from '../../../src/survey.js';
import { QUANTITY_BY_ID, contentsFor } from '../../../src/study.js';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const schema = await localBundle().load('26.1.0');
const model = buildModel(schema);
const patch = { ...DEFAULT_BYPASS };
const contents = { serialize: () => 'idempotence', answers: () => true, size: 0 };

console.log('idempotence and the shared document (gate 3)');

/* ── three applications are byte-identical ─────────────────────────────── */
{
  const desks = [
    { name: 'the default desk', params: {} },
    { name: 'a fully glazed south wall', params: { wwrS: 0.9, ohS: 1.2 } },
    { name: 'a heavy slab, turned 40 degrees', params: { slabThick: 0.3, northAxis: 40 } },
    { name: 'no glazing anywhere', params: { wwrN: 0, wwrE: 0, wwrS: 0, wwrW: 0 } },
  ];
  for (const desk of desks) {
    const params = { ...DEFAULT_PARAMETERS, ...desk.params };
    applyModel(model, params, patch);
    const once = writeIdf(model);
    applyModel(model, params, patch);
    const twice = writeIdf(model);
    applyModel(model, params, patch);
    const thrice = writeIdf(model);
    ok(`${desk.name}: three applications are byte-identical`, once === twice && twice === thrice);
  }
}

/* ── a survey row's overlay restores byte-exactly ──────────────────────── */
{
  const stance = { ...DEFAULT_PARAMETERS };
  const survey = makeSurvey({
    x: axisFor('wwrS', { count: COARSE_GRID, stance }),
    y: axisFor('wallR', { count: COARSE_GRID, stance }),
    readings: [READING_BY_ID.high],
    stance,
    patch,
    annual: false,
  });
  const rows = rowsFor(survey, { needed: contents, carried: contents, restShape: 'rest' });

  applyModel(model, stance, patch);
  const live = writeIdf(model);

  // `buildSample`'s own breath, reproduced exactly: bracket `setAnnual` both
  // ways, apply the overlay, write, and put the live desk back.
  let allRestored = true;
  let firstDrift = null;
  const built = [];
  for (const row of rows) {
    for (const value of row.points) {
      try {
        setAnnual(model, row.annual);
        applyModel(model, { ...row.snapshot, [row.key]: value }, row.patch, { reporting: 'sheet' });
        built.push(writeIdf(model));
      } finally {
        applyModel(model, stance, patch);
        setAnnual(model, false);
      }
      const back = writeIdf(model);
      if (back !== live && allRestored) {
        allRestored = false;
        firstDrift = `${row.key}=${value}`;
      }
    }
  }
  ok(
    `every one of ${built.length} row samples restores the live desk byte-exactly`,
    allRestored,
    firstDrift ? `first drift after ${firstDrift}` : '',
  );

  // A sample is the desk with **two** keys moved, which is what a survey row
  // is and a study's row is not. Built directly, it must serialise identically
  // to the one built through the overlay: if it does not, the drawing and the
  // engine are describing two different buildings at the same position.
  let sameAsDirect = true;
  let at = 0;
  for (const row of rows) {
    for (const value of row.points) {
      const direct = { ...stance, [survey.y.key]: row.snapshot[survey.y.key], [survey.x.key]: value };
      applyModel(model, direct, patch);
      if (writeIdf(model) !== built[at]) sameAsDirect = false;
      at += 1;
    }
  }
  applyModel(model, stance, patch);
  ok('a position built directly serialises identically to one reached through the overlay', sameAsDirect);
}

/* ── walking the desk to a position, against building it there ─────────── */
{
  // Standing on a measured point is the feature's own gesture, and it moves
  // the desk one key at a time through `commit`. The document that results has
  // to be the document a reader would get by building that design outright, or
  // a shared link and a walked desk would be two different buildings.
  const stance = { ...DEFAULT_PARAMETERS };
  const target = { ...stance, wwrS: 0.7, wallR: 6.5 };

  applyModel(model, stance, patch);
  applyModel(model, { ...stance, wwrS: 0.7 }, patch);
  applyModel(model, target, patch);
  const walked = writeIdf(model);

  const fresh = buildModel(schema);
  applyModel(fresh, target, patch);
  const straight = writeIdf(fresh);

  ok('a desk walked to a position serialises identically to one built at it', walked === straight);

  // And back again, which is what the traverse offers: the round trip has to
  // land on the document it started from.
  applyModel(model, stance, patch);
  const home = writeIdf(model);
  applyModel(model, stance, patch);
  ok('and walking back lands on the document it started from', home === writeIdf(model));
}

/* ── the reporting profiles a survey uses ──────────────────────────────── */
{
  // `syncReporting` clears and rewrites every `Output:*` on every apply, which
  // is what makes "lean then sheet" serialise identically to "always sheet" —
  // the property the sweep's restore depends on, and now the survey's too.
  const stance = { ...DEFAULT_PARAMETERS };
  applyModel(model, stance, patch, { reporting: 'sheet' });
  const sheet = writeIdf(model);
  // A real lean profile off the declaration, not a name: `syncReporting` takes
  // a `RunContents` and refuses anything else, which is what stops a profile
  // being inferred from a string somebody typed.
  applyModel(model, stance, patch, { reporting: contentsFor(QUANTITY_BY_ID.extremes, []) });
  applyModel(model, stance, patch, { reporting: 'sheet' });
  ok('lean then sheet serialises identically to always sheet', writeIdf(model) === sheet);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
