/**
 * Write every desk position the upgrade harness uses, in each candidate
 * serialisation, so `equivalence.cjs` can run all eight.
 *
 * Eight positions rather than one, because a format that agrees on the default
 * desk and disagrees on a channel nobody had engaged is exactly what a
 * single-position check cannot see. The list is the one in
 * `specs/007-upgrade-idfkit-js/verify/build-positions.mjs`, chosen for what the
 * appliers sweep rather than for what the building looks like.
 *
 *   OUT_DIR=… node write-positions.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeIdf, toEpJson } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { normaliseEnums } from './normalise-enums.mjs';

const ROOT = process.env.SHOEBOX_ROOT || resolve(import.meta.dirname, '../../..');
const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error('OUT_DIR is required');

const { buildModel, applyModel } = await import(resolve(ROOT, 'src/model.js'));
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS } = await import(resolve(ROOT, 'src/controls.js'));
const schema = await localBundle().load('26.1.0');

const off = (...ids) => { const b = { ...DEFAULT_BYPASS }; for (const i of ids) b[i] = true; return b; };
const on = (...ids) => { const b = { ...DEFAULT_BYPASS }; for (const i of ids) b[i] = false; return b; };
const POSITIONS = [
  ['01-default', DEFAULT_BYPASS],
  ['02-fabric-out', off('fabric')],
  ['03-glazing-out', off('glazing')],
  ['04-system-out', off('system')],
  ['05-gains-out', off('gains')],
  ['06-air-out', off('air')],
  ['07-everything-in', on(...Object.keys(DEFAULT_BYPASS))],
  ['08-everything-out', off(...Object.keys(DEFAULT_BYPASS))],
];

const rows = [];
for (const [name, bypass] of POSITIONS) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const doc = buildModel(schema, DEFAULT_PARAMETERS, bypass);
  applyModel(doc, DEFAULT_PARAMETERS, bypass);
  const j = toEpJson(doc);
  const repaired = normaliseEnums(j, schema);
  const commented = writeIdf(doc);
  const compressed = writeIdf(doc, { compressed: true });
  const epjson = JSON.stringify(j, null, 0);
  writeFileSync(resolve(dir, 'idf-commented.idf'), commented);
  writeFileSync(resolve(dir, 'idf-compressed.idf'), compressed);
  writeFileSync(resolve(dir, 'epjson-compact.epJSON'), epjson);
  rows.push({ name, commented: commented.length, compressed: compressed.length, epjson: epjson.length, enumsRepaired: repaired.length });
}
console.log(JSON.stringify(rows, null, 1));
