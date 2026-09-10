/**
 * Write the IDF at a spread of desk positions, so the same spread can be
 * written again on another toolkit and the two compared byte for byte.
 *
 * The positions are chosen for what they make the appliers *sweep*, not for
 * what they make the building look like. The behaviour under test is whether
 * asking a document about a type it does not yet hold registers that type, and
 * the only positions that can show it are the ones where a channel clears a
 * type nothing has added yet.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { writeIdf } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';

const ROOT = process.env.SHOEBOX_ROOT;
const OUT = process.env.OUT_DIR;
if (!ROOT || !OUT) throw new Error('SHOEBOX_ROOT and OUT_DIR are required');

const { buildModel, applyModel } = await import(resolve(ROOT, 'src/model.js'));
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS } = await import(resolve(ROOT, 'src/controls.js'));

// `localBundle()` is the bundle itself, not a source to wrap one around, and it
// wants the full version string.
const schema = await localBundle().load('26.1.0');

const off = (...ids) => {
  const bypass = { ...DEFAULT_BYPASS };
  for (const id of ids) bypass[id] = true;
  return bypass;
};
const on = (...ids) => {
  const bypass = { ...DEFAULT_BYPASS };
  for (const id of ids) bypass[id] = false;
  return bypass;
};
const p = (over) => ({ ...DEFAULT_PARAMETERS, ...over });

/**
 * Each position is a name, a parameter set and a patch state. `engaged` names
 * channels switched *in* from their shipped state, `bypassed` names channels
 * switched out.
 */
const POSITIONS = [
  ['01-default', DEFAULT_PARAMETERS, DEFAULT_BYPASS],
  ['02-fabric-out', DEFAULT_PARAMETERS, off('fabric')],
  ['03-glazing-out', DEFAULT_PARAMETERS, off('glazing')],
  ['04-system-out', DEFAULT_PARAMETERS, off('system')],
  ['05-gains-out', DEFAULT_PARAMETERS, off('gains')],
  ['06-air-out', DEFAULT_PARAMETERS, off('air')],
  ['07-everything-in', DEFAULT_PARAMETERS, on(...Object.keys(DEFAULT_BYPASS))],
  ['08-everything-out', DEFAULT_PARAMETERS, off(...Object.keys(DEFAULT_BYPASS))],
];

mkdirSync(OUT, { recursive: true });

const written = [];
for (const [name, params, bypass] of POSITIONS) {
  let doc;
  try {
    doc = buildModel(schema, params, bypass);
    // Idempotence: the page applies on every parameter change, so three
    // applications must serialise identically to one.
    const once = writeIdf(doc);
    applyModel(doc, params, bypass);
    applyModel(doc, params, bypass);
    const thrice = writeIdf(doc);
    if (once !== thrice) {
      writeFileSync(resolve(OUT, `${name}.NOT-IDEMPOTENT.idf`), thrice);
      written.push(`${name}\tNOT IDEMPOTENT`);
    }
    writeFileSync(resolve(OUT, `${name}.idf`), once);
    // The type order is the thing under test, so record it beside the file.
    writeFileSync(resolve(OUT, `${name}.types.txt`), doc.types().join('\n') + '\n');
    written.push(`${name}\t${once.length} bytes\t${doc.types().length} types`);
  } catch (error) {
    written.push(`${name}\tTHREW ${error.message}`);
  }
}
console.log(written.join('\n'));
