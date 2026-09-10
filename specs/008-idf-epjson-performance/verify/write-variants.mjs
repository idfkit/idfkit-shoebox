/**
 * Write one desk position in every candidate serialisation, and time the write
 * itself.
 *
 * The write is on the desk's own budget, not just the engine's: `solve` calls
 * `writeIdf(model)` on every re-solve and `buildSample` calls it once per
 * study sample, so the JS cost of a format is part of the answer and is
 * reported here beside the byte count.
 *
 *   OUT_DIR=… [PARAMS='{"key":value}'] [ANNUAL=1] node write-variants.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeIdf, writeEpJson, toEpJson } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { normaliseEnums } from './normalise-enums.mjs';

const ROOT = process.env.SHOEBOX_ROOT || resolve(import.meta.dirname, '../../..');
const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error('OUT_DIR is required');
mkdirSync(OUT, { recursive: true });

const { buildModel, applyModel, setAnnual } = await import(resolve(ROOT, 'src/model.js'));
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS } = await import(resolve(ROOT, 'src/controls.js'));

// Outside the browser the schema is `localBundle()`, not `httpSource`, and it
// wants the full version string.
const schema = await localBundle().load('26.1.0');
const params = { ...DEFAULT_PARAMETERS, ...JSON.parse(process.env.PARAMS || '{}') };
const doc = buildModel(schema, params, DEFAULT_BYPASS);
applyModel(doc, params, DEFAULT_BYPASS);
// A weather run period is not a parameter — the page turns it on when a station
// attaches — so the annual position has to be reached the way `solve` reaches it.
if (process.env.ANNUAL) setAnnual(doc, true);

const epjsonText = (indent) => {
  const j = toEpJson(doc);
  normaliseEnums(j, schema);
  return JSON.stringify(j, null, indent);
};

const VARIANTS = {
  'idf-commented': () => writeIdf(doc),
  'idf-nocomments': () => writeIdf(doc, { comments: false }),
  'idf-compressed': () => writeIdf(doc, { compressed: true }),
  'epjson-indent2': () => epjsonText(2),
  'epjson-compact': () => epjsonText(0),
  // What `writeEpJson` produces today, with no enum repair. Kept so the run can
  // show that it does not simulate.
  'epjson-unrepaired': () => writeEpJson(doc, { indent: 0 }),
};

const ext = (n) => (n.startsWith('epjson') ? 'epJSON' : 'idf');
const report = [];
for (const [name, fn] of Object.entries(VARIANTS)) {
  for (let i = 0; i < 20; i += 1) fn(); // let the JIT settle
  const t = [];
  for (let i = 0; i < 60; i += 1) { const a = performance.now(); fn(); t.push(performance.now() - a); }
  t.sort((x, y) => x - y);
  const text = fn();
  writeFileSync(resolve(OUT, `${name}.${ext(name)}`), text);
  report.push({ name, bytes: Buffer.byteLength(text), writeMedianMs: +t[30].toFixed(3) });
}

const moved = normaliseEnums(toEpJson(doc), schema);
console.log(JSON.stringify({ enumsRepaired: moved.length, repairs: moved, report }, null, 2));
