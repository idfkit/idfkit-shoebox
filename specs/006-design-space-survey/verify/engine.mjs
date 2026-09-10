/**
 * Run the staged WebAssembly engine under Node — one run per process.
 *
 * CLAUDE.md's recipe for this is to set `global.Module` before requiring
 * `public/energyplus/energyplus.js` and to clear the require cache between
 * runs. The first half is right and is what `engine-child.mjs` does. **The
 * second half is not enough, and the measurement is worth writing down**
 * because the failure it produces looks like a broken model rather than a
 * broken harness.
 *
 * Measured while building this feature's gates, on the shipped 26.1 build:
 *
 *   | second run in one Node process | exit | /output afterwards |
 *   | --- | --- | --- |
 *   | same instance, second `callMain` | 1, throws a raw number | the **first run's** files, untouched |
 *   | fresh instance, require cache cleared | 1, throws | empty |
 *
 * So `main` cannot be called twice in one process at all — not on one
 * instance, and not on a fresh one either. The raw number is a C++ exception
 * pointer: EnergyPlus aborting because its globals are already initialized,
 * and aborting *before doing any work*, which is why the same-instance row
 * leaves the previous run's ESO sitting there. A harness that reused an
 * instance would therefore read run one's output over and over and report
 * perfect agreement — the worst possible false pass on a gate whose entire
 * subject is whether two runs agree.
 *
 * A process is the only unit of work that can be trusted to be independent, so
 * `runIdf` spawns one. It costs a Node boot and a WASM compile per run — about
 * 0.3 s each against a design day's own 0.28 s — which is the price of a
 * harness that cannot lie to itself.
 *
 * The consequence for SC-005a is stated in `repeatability.mjs`: the
 * determinism half is measurable here, the *instance reuse* half is not, and
 * it is a browser gate.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
const ENGINE_DIR = path.join(ROOT, 'public/energyplus');
const ENGINE_JS = path.join(ENGINE_DIR, 'energyplus.js');

/** The staged assets, refused by name rather than by a missing-file stack. */
export function assertStaged() {
  for (const file of ['energyplus.js', 'Energy+.idd']) {
    const at = path.join(ENGINE_DIR, file);
    if (!fs.existsSync(at)) {
      throw new Error(
        `${at} is not staged. Run \`npm run predev\` first — public/energyplus/ is gitignored, ` +
          'so a fresh clone has none of it.',
      );
    }
  }
}

const CHILD = path.join(here, 'engine-child.mjs');

/**
 * One EnergyPlus run, in a process of its own.
 *
 * Synchronous on purpose. Every caller is a harness draining a list of runs
 * one at a time and reporting as it goes, and `spawnSync` keeps the failure in
 * the caller's own stack rather than inside a promise where a throw becomes a
 * rejected sample with no line number.
 */
export function runIdf({ idf, epw = null }) {
  assertStaged();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoebox-verify-'));
  try {
    fs.writeFileSync(path.join(workdir, 'input.idf'), idf);
    if (epw) fs.writeFileSync(path.join(workdir, 'weather.epw'), epw);
    const child = spawnSync(process.execPath, [CHILD, workdir], {
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const at = path.join(workdir, 'result.json');
    if (!fs.existsSync(at)) {
      throw new Error(
        `the engine child wrote no result (exit ${child.status}): ${String(child.stderr).slice(-600)}`,
      );
    }
    return JSON.parse(fs.readFileSync(at, 'utf8'));
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

/**
 * Run the same input twice **in one process**, and report what happened.
 *
 * Not a way to measure instance reuse. A way to prove it cannot be measured
 * here, and to stop the next person writing a harness that thinks it can — see
 * the table at the head of this file. `repeatability.mjs` asserts the refusal
 * outright for exactly that reason.
 */
export function reuseRefusal({ idf, epw = null }) {
  assertStaged();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoebox-reuse-'));
  try {
    fs.writeFileSync(path.join(workdir, 'input.idf'), idf);
    if (epw) fs.writeFileSync(path.join(workdir, 'weather.epw'), epw);
    const child = spawnSync(process.execPath, [CHILD, workdir, '--twice'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const at = path.join(workdir, 'twice.json');
    if (!fs.existsSync(at)) {
      throw new Error(
        `the engine child wrote no reuse result (exit ${child.status}): ${String(child.stderr).slice(-600)}`,
      );
    }
    return JSON.parse(fs.readFileSync(at, 'utf8'));
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}
