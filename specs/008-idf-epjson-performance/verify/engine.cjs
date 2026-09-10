/**
 * Boot the staged emscripten EnergyPlus under Node, once, and hand back a
 * module whose `callMain` can be called again and again.
 *
 * That reuse is the whole point of this harness. `engine.worker.js` holds one
 * WASM instance across every solve on the desk, so a benchmark that booted per
 * run would measure the boot — 700 ms of it — and report the answer to a
 * question nobody asked. Everything here is timed on an instance that has
 * already run the model at least once.
 *
 * `callMain` is assigned by the emscripten glue synchronously, while the wasm
 * is still compiling, so its presence is NOT readiness: writing to `FS` before
 * `onRuntimeInitialized` fires throws `Cannot read properties of undefined
 * (reading 'buffer')` from inside the glue, which reads like a corrupt asset
 * and is nothing of the kind. The gate has to be the callback, and the callback
 * has to be installed on the `Module` object *before* the glue is required,
 * because the glue latches onto whatever `global.Module` held at that moment.
 */
const path = require('node:path');

const ASSETS = process.env.EP_ASSETS || path.resolve(__dirname, '../../../public/energyplus');

const lines = [];
let resolveReady;
const readyPromise = new Promise((r) => { resolveReady = r; });

global.Module = {
  noInitialRun: true,
  locateFile: (p) => path.join(ASSETS, p),
  print: (t) => lines.push(t),
  printErr: (t) => lines.push(`[stderr] ${t}`),
  onRuntimeInitialized: () => resolveReady(),
};

require(path.join(ASSETS, 'energyplus.js'));
const M = global.Module;

/** Clear the output directory between runs, so a stale file cannot be read as a result. */
function rmrf(dir) {
  let entries;
  try { entries = M.FS.readdir(dir); } catch { return; }
  for (const e of entries) {
    if (e === '.' || e === '..') continue;
    const p = `${dir}/${e}`;
    if (M.FS.isDir(M.FS.stat(p).mode)) rmrf(p); else M.FS.unlink(p);
  }
  M.FS.rmdir(dir);
}

const read = (f) => { try { return M.FS.readFile(f, { encoding: 'utf8' }); } catch { return ''; } };

module.exports = { M, ready: () => readyPromise, rmrf, read, lines, ASSETS };
