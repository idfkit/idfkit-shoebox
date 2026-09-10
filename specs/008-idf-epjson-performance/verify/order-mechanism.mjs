/**
 * What decides the order EnergyPlus runs the environments in?
 *
 * The epJSON run comes back with the design days the other way round from the
 * IDF run, and there are two candidate explanations that look identical from
 * one measurement: the JSON object's key order, or the engine sorting by object
 * name. They are told apart by making three files — the same model with the
 * keys written Htg-first, the same model written Clg-first, and one with the
 * names replaced so that alphabetical order agrees with the IDF's statement
 * order — and running all three beside the IDF.
 *
 *   OUT_DIR=… node order-mechanism.mjs   then   MODELS=… node order-run.cjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeIdf, toEpJson } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { normaliseEnums } from './normalise-enums.mjs';

const ROOT = process.env.SHOEBOX_ROOT || resolve(import.meta.dirname, '../../..');
const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error('OUT_DIR is required');
mkdirSync(OUT, { recursive: true });

const { buildModel, applyModel } = await import(resolve(ROOT, 'src/model.js'));
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS } = await import(resolve(ROOT, 'src/controls.js'));
const schema = await localBundle().load('26.1.0');

const doc = buildModel(schema, DEFAULT_PARAMETERS, DEFAULT_BYPASS);
applyModel(doc, DEFAULT_PARAMETERS, DEFAULT_BYPASS);
writeFileSync(resolve(OUT, 'idf-compressed.idf'), writeIdf(doc, { compressed: true }));

const base = toEpJson(doc);
normaliseEnums(base, schema);
const days = base['SizingPeriod:DesignDay'];
const names = Object.keys(days);
const htg = names.find((n) => n.includes('Htg'));
const clg = names.find((n) => n.includes('Clg'));

const withDays = (pairs) => {
  const copy = JSON.parse(JSON.stringify(base));
  copy['SizingPeriod:DesignDay'] = Object.fromEntries(pairs);
  return JSON.stringify(copy, null, 0);
};

writeFileSync(resolve(OUT, 'epjson-htg-key-first.epJSON'), withDays([[htg, days[htg]], [clg, days[clg]]]));
writeFileSync(resolve(OUT, 'epjson-clg-key-first.epJSON'), withDays([[clg, days[clg]], [htg, days[htg]]]));
// Names chosen so that alphabetical order puts the winter day first, which is
// the order the IDF states them in. Keys still written Clg-first, so name and
// key order disagree and only one of them can be what the engine follows.
writeFileSync(resolve(OUT, 'epjson-renamed.epJSON'), withDays([['ZZZ Summer Day', days[clg]], ['AAA Winter Day', days[htg]]]));
console.log(`wrote four inputs into ${OUT}`);
