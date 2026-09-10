/**
 * The same desk, padded with K harmless uniquely-named schedules, so the two
 * readers can be measured on a slope rather than at one point.
 *
 * The shoebox is 106 objects, which is small enough that a fixed startup cost
 * could hide the whole difference between the two readers — and does. Padding
 * and re-measuring separates the fixed part from the per-object part, which is
 * what says whether the answer would change for a bigger model.
 *
 *   OUT_DIR=… K=2000 node write-scaled.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeIdf, toEpJson } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { normaliseEnums } from './normalise-enums.mjs';

const ROOT = process.env.SHOEBOX_ROOT || resolve(import.meta.dirname, '../../..');
const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error('OUT_DIR is required');
const K = Number(process.env.K || 0);
mkdirSync(OUT, { recursive: true });

const { buildModel, applyModel } = await import(resolve(ROOT, 'src/model.js'));
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS } = await import(resolve(ROOT, 'src/controls.js'));
const schema = await localBundle().load('26.1.0');

const doc = buildModel(schema, DEFAULT_PARAMETERS, DEFAULT_BYPASS);
applyModel(doc, DEFAULT_PARAMETERS, DEFAULT_BYPASS);

// `Schedule:Constant` because an unused one costs an informational note and
// nothing else: the padding has to be inert, or the slope measures the padding.
for (let i = 0; i < K; i += 1) {
  const s = doc.add('Schedule:Constant', `Pad ${i}`);
  s.schedule_type_limits_name = 'Fraction';
  s.hourly_value = 0.5;
}

const j = toEpJson(doc);
normaliseEnums(j, schema);
const commented = writeIdf(doc);
const compressed = writeIdf(doc, { compressed: true });
const epjson = JSON.stringify(j, null, 0);
writeFileSync(resolve(OUT, 'idf-commented.idf'), commented);
writeFileSync(resolve(OUT, 'idf-compressed.idf'), compressed);
writeFileSync(resolve(OUT, 'epjson-compact.epJSON'), epjson);
console.log(`K=${K}  commented ${commented.length}B  compressed ${compressed.length}B  epjson ${epjson.length}B`);
