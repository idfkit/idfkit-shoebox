/**
 * Shared by the harnesses in this directory; not a harness itself.
 *
 * The schema, the document, the IDF text and one EnergyPlus run — the four
 * things every gate from 5 onwards starts by doing, written once here so that a
 * harness is the assertion it makes rather than another copy of the setup.
 * Follows `specs/011-sweep-priced-controls/verify/kit.mjs`; the engine half
 * follows `specs/006-design-space-survey/verify/engine.mjs`, whose measurements
 * are repeated below because they are the reason this file is shaped the way it
 * is.
 *
 * **There is no local EnergyPlus in this environment.** CLAUDE.md's first
 * choice is the 26.1.0 install at `/Applications/EnergyPlus-26-1-0` and its
 * second is the staged WebAssembly build under Node; only the second is
 * available here, so that is what `runIdf` drives. The engine and the IDD are
 * gitignored, so a fresh clone must run `npm run predev` before any of this
 * works, and `assertStaged()` says so by name rather than letting a missing
 * file arrive as a stack.
 *
 * This module is also its own engine child: run as
 * `node kit.mjs --engine-child <dir>` it performs exactly one run and writes
 * `result.json` into that directory. One file rather than two, because the
 * constraint being enforced is that **the process which runs EnergyPlus does
 * nothing else**, and splitting the rule across two files is how it gets
 * forgotten.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeIdf } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel, setAnnual, setDesignConditions } from '../../../src/model.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
const ENGINE_DIR = path.join(ROOT, 'public/energyplus');
const ENGINE_JS = path.join(ENGINE_DIR, 'energyplus.js');

// ---------------------------------------------------------------------------
// The schema and the document
// ---------------------------------------------------------------------------

/**
 * The 26.1.0 schema, off the local bundle, loaded once per process.
 *
 * The full version string is not a nicety: `localBundle()` resolves `'26.1.0'`
 * and nothing shorter, and `'26.1'` — which is what the `Version` object in the
 * document carries — comes back as a miss. CLAUDE.md states the rule and this
 * is the only place in the directory that has to obey it.
 */
let bundled = null;
export function loadSchema() {
  bundled ??= localBundle().load('26.1.0');
  return bundled;
}

/**
 * A document at a desk position, with the annual switch thrown deliberately.
 *
 * `annual` is separate from `params` because it is: the sheet keeps it off the
 * parameter bag and flips it per solve, so a harness that wants a weather-file
 * year has to ask for one. Left at its default a document runs the two design
 * days and never opens the EPW at all, which is a quiet way to write a gate
 * about weather files that never reads one.
 *
 * `conditions` is what `designConditionsFrom` returned, for a desk sized on an
 * attached DDY rather than on the Denver pair `buildModel` ships with.
 */
export function documentFor({
  schema,
  params = DEFAULT_PARAMETERS,
  bypass = DEFAULT_BYPASS,
  annual = true,
  conditions = null,
  reporting = 'sheet',
} = {}) {
  const doc = buildModel(schema, params, bypass);
  if (conditions) setDesignConditions(doc, conditions);
  setAnnual(doc, annual);
  applyModel(doc, params, bypass, { reporting });
  return doc;
}

/** The same, serialized — the exact bytes a run is given. */
export const idfFor = (options) => writeIdf(documentFor(options));

/**
 * `applyModel` three times over, byte-identical, as CLAUDE.md requires of every
 * change that reaches the model.
 *
 * Returns the three texts rather than a verdict, so the harness that finds a
 * difference can print where it is instead of reporting that there was one.
 */
export function thrice(options) {
  const doc = documentFor(options);
  const { params = DEFAULT_PARAMETERS, bypass = DEFAULT_BYPASS, reporting = 'sheet' } = options;
  const texts = [writeIdf(doc)];
  for (let pass = 0; pass < 2; pass += 1) {
    applyModel(doc, params, bypass, { reporting });
    texts.push(writeIdf(doc));
  }
  return texts;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** The staged assets, refused by name rather than by a missing-file stack. */
export function assertStaged() {
  for (const file of ['energyplus.js', 'energyplus.js-26.1.wasm', 'Energy+.idd']) {
    const at = path.join(ENGINE_DIR, file);
    if (!fs.existsSync(at)) {
      throw new Error(
        `${at} is not staged. Run \`npm run predev\` first — public/energyplus/ is gitignored, ` +
          'so a fresh clone has none of it.',
      );
    }
  }
}

/**
 * One EnergyPlus run, in this process, and **only ever one**.
 *
 * `main` is not re-entrant. Measured on the shipped 26.1 build while feature
 * 006's gates were written: a second `callMain` on the same instance throws a
 * raw number — a C++ exception pointer, EnergyPlus aborting because its globals
 * are already initialized — *before doing any work*, and leaves the first run's
 * files sitting in `/output`. Clearing the require cache and building a fresh
 * instance does not help; it throws too. So a second run in one process cannot
 * be done, and the failure mode is the worst kind: a harness that reused an
 * instance would read run one's ESO over and over and report perfect agreement.
 *
 * Hence the latch. It costs nothing and it turns a silent false pass into a
 * sentence naming what happened. Anything wanting more than one run calls
 * `runIdf`, which spawns a process per run.
 */
let spent = null;
export function runOnce({ idf, epw = null }) {
  assertStaged();
  if (spent) {
    throw new Error(
      'EnergyPlus has already run in this process, and its `main` cannot be called twice: the' +
        ' second call throws a bare number before doing any work and leaves the first run\'s' +
        ' output in place, so whatever you read back would be the previous run\'s. Use `runIdf`,' +
        ' which spawns a process per run.',
    );
  }
  spent = true;

  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  // `FS` exists as soon as the script is evaluated, but its heap views are
  // bound during `run()`, which waits on the WebAssembly instantiation. Writing
  // before then throws `Cannot read properties of undefined (reading 'buffer')`
  // from inside `FS.writeFile` — a stack that names the engine and says nothing
  // about the handshake that was missed. So the callback is installed before
  // the require, which is the one moment the engine looks at it.
  global.Module = {
    noInitialRun: true,
    wasmBinary: fs.readFileSync(path.join(ENGINE_DIR, 'energyplus.js-26.1.wasm')),
    locateFile: (file) => path.join(ENGINE_DIR, file),
    print: () => {},
    printErr: () => {},
    onRuntimeInitialized: () => started(),
  };
  const loaded = createRequire(import.meta.url)(ENGINE_JS);
  const engine = loaded && typeof loaded === 'object' && loaded.FS ? loaded : global.Module;

  return ready.then(() => {
    const { FS } = engine;
    FS.writeFile('/input.idf', idf);
    if (epw) FS.writeFile('/weather.epw', epw);
    // The IDD has to be inside the virtual filesystem beside the input, not
    // merely on the host disk: the engine resolves it against its own cwd in
    // there.
    FS.writeFile('/Energy+.idd', fs.readFileSync(path.join(ENGINE_DIR, 'Energy+.idd'), 'utf8'));
    FS.mkdir('/output');

    const args = epw
      ? ['-d', '/output', '-w', '/weather.epw', '/input.idf']
      : ['-d', '/output', '/input.idf'];

    const started_at = Date.now();
    let exit = 0;
    let threw = null;
    try {
      engine.callMain(args);
    } catch (failure) {
      // Emscripten throws `ExitStatus` for a non-zero exit rather than
      // returning it, and EnergyPlus itself throws a raw number when it aborts.
      // Both are results the gate wants to read, not harness failures.
      exit = failure?.status ?? 1;
      threw = typeof failure === 'number' ? `pointer ${failure}` : String(failure?.message ?? failure);
    }
    const ms = Date.now() - started_at;

    const read = (name) => {
      try {
        return FS.readFile(`/output/${name}`, { encoding: 'utf8' });
      } catch {
        return null;
      }
    };
    const err = read('eplusout.err') ?? '';
    return {
      exit,
      success: exit === 0,
      threw,
      ms,
      err,
      eso: read('eplusout.eso'),
      mtr: read('eplusout.mtr'),
      rdd: read('eplusout.rdd'),
      htm: read('eplustbl.htm'),
      severe: (err.match(/\*\* Severe {2}\*\*/g) ?? []).length,
      warnings: (err.match(/\*\* Warning \*\*/g) ?? []).length,
      fatal: /\*\* {2}Fatal {2}\*\*/.test(err),
    };
  });
}

/**
 * One EnergyPlus run, in a process of its own. Call it as often as you like.
 *
 * Synchronous on purpose, as feature 006's is: every caller is a harness
 * draining a list of runs one at a time and reporting as it goes, and
 * `spawnSync` keeps a failure in the caller's own stack rather than inside a
 * promise where a throw becomes a sample with no line number.
 *
 * A Node boot and a WASM compile cost about 0.3 s per run on top of the run
 * itself. That is the price of a harness that cannot lie to itself.
 *
 * `keep` hands back the working directory instead of removing it, for the runs
 * whose `.err` or `.eso` a person wants to read afterwards.
 */
export function runIdf({ idf, epw = null, keep = false }) {
  assertStaged();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoebox-012-'));
  try {
    fs.writeFileSync(path.join(workdir, 'input.idf'), idf);
    if (epw) fs.writeFileSync(path.join(workdir, 'weather.epw'), epw);
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--engine-child', workdir], {
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const at = path.join(workdir, 'result.json');
    if (!fs.existsSync(at)) {
      throw new Error(
        `the engine child wrote no result (exit ${child.status}): ${String(child.stderr).slice(-600)}`,
      );
    }
    return { ...JSON.parse(fs.readFileSync(at, 'utf8')), workdir: keep ? workdir : null };
  } finally {
    if (!keep) fs.rmSync(workdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** The same counter feature 011's harnesses report through. */
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
    /**
     * A gate this environment cannot answer. Counted apart from a pass and
     * apart from a failure, and printed in every run, because tasks.md's rule
     * is that a gate which could not be run is recorded as not run and never
     * recorded as passed.
     */
    notRun(label, why) {
      console.log(`  ----  ${label} — NOT RUN: ${why}`);
    },
    done() {
      console.log(failures ? `\n${failures} failed` : '\nall passed');
      process.exitCode = failures ? 1 : 0;
    },
  };
}

/** The `.err` lines worth printing: the banner, the severes and the fatal. */
export const errSummary = (err, limit = 12) =>
  (err ?? '')
    .split('\n')
    .filter((line) => /(\*\* Severe|\*\* {2}Fatal|EnergyPlus Completed|EnergyPlus Terminated|requested but not generated)/.test(line))
    .slice(0, limit);

// ---------------------------------------------------------------------------
// The engine child
// ---------------------------------------------------------------------------

if (process.argv[2] === '--engine-child' && process.argv[1] === fileURLToPath(import.meta.url)) {
  const workdir = process.argv[3];
  if (!workdir) throw new Error('--engine-child takes a working directory');
  const at = (name) => path.join(workdir, name);
  const epwAt = at('weather.epw');
  const result = await runOnce({
    idf: fs.readFileSync(at('input.idf'), 'utf8'),
    epw: fs.existsSync(epwAt) ? fs.readFileSync(epwAt, 'utf8') : null,
  });
  fs.writeFileSync(at('result.json'), JSON.stringify(result));
  // `process.exit` rather than a natural return: emscripten keeps the runtime
  // alive (`noExitRuntime`), so the event loop never drains and the child hangs.
  process.exit(0);
}
