/**
 * Write the generated model to disk at several desk positions, for the run a
 * person makes outside the browser (constitution, quality gate 1).
 *
 *   node scripts/write-models.mjs            # writes to harness/energyplus-<release>/
 *   node scripts/write-models.mjs <directory>
 *
 * The `adopt-energyplus` workflow runs this as the `model-outside-browser` step
 * of the version roster in idfkit-conformance. It prepares the step and does
 * not perform it: no EnergyPlus is run here.
 *
 * WHAT IT ESTABLISHES
 *
 *   1. The installed `@idfkit/schemas` carries the release `src/version.js`
 *      names. `load` rejects otherwise, and the script exits 1.
 *   2. `buildModel` completes at every position on that schema.
 *   3. Applying the model three times serialises byte for byte as applying it
 *      once (constitution, quality gate 2).
 *
 * WHAT IT DOES NOT ESTABLISH
 *
 *   That the engine accepts the models. That is the manual step: run each
 *   written file with the release's engine and accept when each completes with
 *   no severe error.
 *
 * The default directory is under `harness/`, which is ignored by git, so the
 * files never enter a pull request.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeIdf } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../src/controls.js';
import { applyModel, buildModel } from '../src/model.js';
import { ENERGYPLUS_VERSION } from '../src/version.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A stated directory is relative to where the command is run, as any path on a
// command line is. The default is relative to the repository.
const STATED = process.argv[2];
const OUT = STATED
  ? resolve(process.cwd(), STATED)
  : resolve(ROOT, `harness/energyplus-${ENERGYPLUS_VERSION}`);

/** One desk position: a file name and the patch state the model is built at. */
class Position {
  constructor(name, bypass) {
    this.name = name;
    this.bypass = Object.freeze({ ...bypass });
    Object.freeze(this);
  }
}

const withAll = (value) =>
  Object.fromEntries(Object.keys(DEFAULT_BYPASS).map((channel) => [channel, value]));

// The shipped desk, each channel switched the other way from its shipped
// state, and the two extremes. A channel that is switched out clears the types
// it owns, which is where a schema change between releases is most likely to
// show.
const POSITIONS = Object.freeze([
  new Position('00-default', DEFAULT_BYPASS),
  ...Object.keys(DEFAULT_BYPASS).map(
    (channel, index) =>
      new Position(`${String(index + 1).padStart(2, '0')}-${channel}-toggled`, {
        ...DEFAULT_BYPASS,
        [channel]: !DEFAULT_BYPASS[channel],
      }),
  ),
  new Position('90-everything-in', withAll(false)),
  new Position('91-everything-out', withAll(true)),
]);

let schema;
try {
  // `localBundle()` is the bundle itself and takes the full version string.
  schema = await localBundle().load(ENERGYPLUS_VERSION);
} catch (error) {
  console.error(
    `write-models: the installed @idfkit/schemas does not load EnergyPlus ${ENERGYPLUS_VERSION}: ${error.message}`,
  );
  process.exit(1);
}

// The default directory is this script's own, so it is emptied first: a model
// left by an earlier run at a position that no longer exists would otherwise
// be run and accepted with the rest. A stated directory is left as it is.
if (!STATED) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const failures = [];
for (const { name, bypass } of POSITIONS) {
  try {
    const doc = buildModel(schema, DEFAULT_PARAMETERS, bypass);
    const once = writeIdf(doc);
    applyModel(doc, DEFAULT_PARAMETERS, bypass);
    applyModel(doc, DEFAULT_PARAMETERS, bypass);
    if (writeIdf(doc) !== once) failures.push(`${name}: three applications differ from one`);
    writeFileSync(resolve(OUT, `${name}.idf`), once);
    console.log(`${name}.idf\t${once.length} bytes\t${doc.types().length} types`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`write-models: ${failures.length} position(s) failed\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`${POSITIONS.length} models for EnergyPlus ${ENERGYPLUS_VERSION} written to ${OUT}`);
