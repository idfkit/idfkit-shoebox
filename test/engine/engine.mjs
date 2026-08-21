/**
 * EnergyPlus, driven from Node.
 *
 * `CLAUDE.md` describes this arrangement and it was worth committing: the
 * engine assets are an ordinary dependency (`@idfkit/engine-assets`), so a run
 * costs no network, no staging and no installed EnergyPlus — the same wasm
 * build the browser worker loads, pointed at a memory filesystem.
 *
 * Two things about it are not obvious and both cost a while to find. The
 * emscripten module latches onto whatever `global.Module` held when the script
 * was first evaluated, and EnergyPlus's `main` is not re-entrant — so the
 * require cache is cleared between runs and a fresh `Module` is installed each
 * time. And the module is not usable when `require` returns: the heap is not
 * there until `onRuntimeInitialized`, and writing an input file before that
 * fails inside emscripten's own `FS.write` with a message about a buffer.
 *
 * A design day is about 0.7 s of simulation and two to four seconds wall-clock
 * once the wasm compile is counted, which is why these live apart from the
 * hermetic suite and run under `npm run test:engine`.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ASSETS = new URL('../../node_modules/@idfkit/engine-assets/assets/', import.meta.url).pathname;
const ENTRY = `${ASSETS}energyplus.js`;

/**
 * Solve one IDF and hand back everything the run wrote.
 *
 * `weather` is optional: a desk whose Run strip keeps its sizing periods has
 * design days to solve and needs no file, which is what makes a committed
 * engine test possible at all — an EPW is 1.5 MB of somebody else's data.
 */
export async function run(idf, { weather = null, args = [] } = {}) {
  delete require.cache[require.resolve(ENTRY)];
  const ready = Promise.withResolvers();
  const console = [];
  global.Module = {
    noInitialRun: true,
    locateFile: (file) => ASSETS + file,
    print: (text) => console.push(text),
    printErr: (text) => console.push(text),
    onRuntimeInitialized: () => ready.resolve(),
  };
  require(ENTRY);
  await ready.promise;

  const mod = global.Module;
  const { FS } = mod;
  FS.writeFile('/input.idf', idf);
  if (weather) FS.writeFile('/weather.epw', weather);
  FS.mkdir('/output');

  const code = mod.callMain([
    '-d', '/output',
    ...(weather ? ['-w', '/weather.epw'] : []),
    ...args,
    '/input.idf',
  ]);

  const read = (name) => {
    try {
      return FS.readFile(`/output/${name}`, { encoding: 'utf8' });
    } catch {
      return null;
    }
  };

  return {
    code,
    console: console.join('\n'),
    err: read('eplusout.err') ?? '',
    eso: read('eplusout.eso'),
    rdd: read('eplusout.rdd'),
    mdd: read('eplusout.mdd'),
    htm: read('eplustbl.htm'),
    files: FS.readdir('/output').filter((f) => f !== '.' && f !== '..'),
  };
}

/** Every severe error the run reported, as the title block counts them. */
export const severes = (err) =>
  err.split('\n').filter((line) => /\*\*\s*Severe\s*\*\*/.test(line)).map((l) => l.trim());

/** Every fatal. One is enough to mean no results were written. */
export const fatals = (err) =>
  err.split('\n').filter((line) => /\*\*\s*Fatal\s*\*\*/.test(line)).map((l) => l.trim());

/**
 * Variables the run was asked for and did not produce.
 *
 * EnergyPlus lists these at the end of the error file, and they are the reason
 * `syncReporting` gates every request on its channel: a desk with half its
 * strips out would otherwise inflate the warning count the title block reports
 * with warnings about itself.
 */
export const unproduced = (err) =>
  err
    .split('\n')
    .filter((line) => /requested but not generated/i.test(line))
    .map((l) => l.trim());
