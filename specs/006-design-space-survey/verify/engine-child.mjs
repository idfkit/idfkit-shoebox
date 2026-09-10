/**
 * One EnergyPlus run, in its own process. Not called by hand.
 *
 * `engine.mjs` spawns this per run and reads `result.json` back out of the
 * working directory it is handed. The whole reason it exists is in
 * `engine.mjs`'s own note: EnergyPlus's `main` cannot be called twice in one
 * Node process, on the same instance *or* a fresh one, so a process is the
 * only unit of work that can be trusted to be independent.
 *
 * Argv: <workdir> [--twice]. The caller has already written `input.idf` and,
 * where the run has weather, `weather.epw` into it. `--twice` calls `main` a
 * second time on the same instance and writes `twice.json` instead — not to
 * measure reuse, but to assert that it is refused, so that nobody builds a
 * reuse harness that silently reads the first run's output.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const workdir = process.argv[2];
if (!workdir) throw new Error('engine-child.mjs takes a working directory');

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(here, '../../../public/energyplus');
const ENGINE_JS = path.join(ENGINE_DIR, 'energyplus.js');

const idf = fs.readFileSync(path.join(workdir, 'input.idf'), 'utf8');
const epwAt = path.join(workdir, 'weather.epw');
const epw = fs.existsSync(epwAt) ? fs.readFileSync(epwAt, 'utf8') : null;

let started;
const ready = new Promise((resolve) => {
  started = resolve;
});
// `FS` exists the moment the script is evaluated, but its heap views are bound
// during `run()`, which waits on the WebAssembly instantiation. Writing before
// then throws `Cannot read properties of undefined (reading 'buffer')` from
// inside `FS.writeFile` — a stack that names the engine and says nothing about
// the handshake that was missed. So the callback is installed before the
// require, which is the only moment the engine looks at it.
global.Module = {
  noInitialRun: true,
  wasmBinary: fs.readFileSync(path.join(ENGINE_DIR, 'energyplus.js-26.1.wasm')),
  locateFile: (file) => path.join(ENGINE_DIR, file),
  print: () => {},
  printErr: () => {},
  onRuntimeInitialized: () => started(),
};
const require_ = createRequire(import.meta.url);
const loaded = require_(ENGINE_JS);
const engine = loaded && typeof loaded === 'object' && loaded.FS ? loaded : global.Module;
await ready;

const { FS } = engine;
FS.writeFile('/input.idf', idf);
if (epw) FS.writeFile('/weather.epw', epw);
// The IDD has to be inside the virtual filesystem beside the input, not merely
// on the host disk: the engine resolves it relative to its own cwd in there.
FS.writeFile('/Energy+.idd', fs.readFileSync(path.join(ENGINE_DIR, 'Energy+.idd'), 'utf8'));
FS.mkdir('/output');

const ARGS = epw
  ? ['-d', '/output', '-w', '/weather.epw', '/input.idf']
  : ['-d', '/output', '/input.idf'];

const read = (name) => {
  try {
    return FS.readFile(`/output/${name}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
};

function once() {
  let exit = 0;
  let threw = null;
  try {
    engine.callMain(ARGS);
  } catch (failure) {
    // Emscripten throws `ExitStatus` for a non-zero exit rather than returning
    // it, and EnergyPlus itself throws a raw number — a C++ exception pointer
    // — when it aborts. Both are results, not harness failures.
    exit = failure?.status ?? 1;
    threw = typeof failure === 'number' ? `pointer ${failure}` : String(failure?.message ?? failure);
  }
  const err = read('eplusout.err') ?? '';
  return {
    exit,
    success: exit === 0,
    threw,
    err,
    eso: read('eplusout.eso'),
    mtr: read('eplusout.mtr'),
    rdd: read('eplusout.rdd'),
    htm: read('eplustbl.htm'),
    severe: (err.match(/\*\* Severe {2}\*\*/g) ?? []).length,
    warnings: (err.match(/\*\* Warning \*\*/g) ?? []).length,
  };
}

if (process.argv.includes('--twice')) {
  const first = once();
  const second = once();
  fs.writeFileSync(path.join(workdir, 'twice.json'), JSON.stringify({ first, second }));
} else {
  fs.writeFileSync(path.join(workdir, 'result.json'), JSON.stringify(once()));
}
// `process.exit` rather than a natural return: emscripten keeps the runtime
// alive (`noExitRuntime`), so the event loop never drains and the child hangs.
process.exit(0);
