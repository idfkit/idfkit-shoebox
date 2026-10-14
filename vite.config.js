import { defineConfig } from 'vite';
import { energyPlusVersion, wasmFile } from '@idfkit/engine-assets';
import { revision } from './scripts/revision.mjs';
import { toolkit } from './scripts/toolkit.mjs';
import { ENERGYPLUS_VERSION } from './src/version.js';

/**
 * climate.onebuilding.org serves the TMYx archives without an
 * `Access-Control-Allow-Origin` header, so a page cannot fetch them directly —
 * `@idfkit/weather` documents this and takes a `rewriteUrl` hook for exactly
 * this reason. This proxy is that hook's target during `npm run dev` and
 * `npm run preview`: same-origin to the browser, upstream to Node.
 *
 * A static deployment has no dev server, so it needs the equivalent rewrite at
 * the host (a Netlify `_redirects` line, a Vercel rewrite, a Cloudflare Worker)
 * or a proxy origin in `VITE_WEATHER_PROXY`. See the README.
 */
const onebuilding = {
  target: 'https://climate.onebuilding.org',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/onebuilding/, ''),
};

/**
 * The build's own revision, frozen into the bundle as a literal.
 *
 * A page served as static files from a bucket has no way to ask what produced
 * it, so the answer has to be baked in at the moment it is produced — which is
 * here, the one place that runs with both the working tree and `git` in reach.
 * `define` and not an env var: `import.meta.env` only carries `VITE_*` names
 * out of a `.env` file, and there is no `.env` in this repository to put one
 * in. `src/version.js` reads the literal back and is the only module that
 * knows the name.
 */
const sheetRevision = revision();

/**
 * The toolkit that writes the models, frozen in for the same reason and read
 * back by the same module. It goes in beside the revision rather than being
 * asked for at runtime because the answer is a property of the build: the page
 * ships one resolved `@idfkit/core` and cannot acquire another while running.
 */
const toolkitVersion = toolkit();

/**
 * The engine's file name, frozen in for the same reason. `prebuild` and
 * `predev` stage the installed `@idfkit/engine-assets`, and that package
 * exports the name of the WebAssembly file it carries, so the page requests
 * the file that was staged whichever EnergyPlus release the pin names. It is
 * imported here, where Node resolves it, and not in `src/`: the package's
 * entry module also computes a URL relative to itself, which has no meaning
 * once a bundler has inlined the module.
 */
const engineWasmFile = wasmFile;

/**
 * The installed assets and the release the page states must be of one
 * EnergyPlus release line. Before the file name was read from the package, a
 * pin on another line failed in the browser, on a request for a file that was
 * not staged. That request now succeeds, so the disagreement is refused here:
 * otherwise the page would run one release's engine on a model, a schema and
 * a report that all name another. Lines are compared and not full versions,
 * because the line is what the file name and the model's version carry.
 */
const releaseLine = (version) => version.split('.').slice(0, 2).join('.');
if (releaseLine(energyPlusVersion) !== releaseLine(ENERGYPLUS_VERSION)) {
  throw new Error(
    `The installed @idfkit/engine-assets carries EnergyPlus ${energyPlusVersion}, ` +
      `and src/version.js states ${ENERGYPLUS_VERSION}. ` +
      'Move both together with: node scripts/adopt-energyplus.mjs X.Y.Z',
  );
}

export default defineConfig({
  define: {
    __SHEET_REVISION__: JSON.stringify(sheetRevision),
    __IDFKIT_VERSION__: JSON.stringify(toolkitVersion),
    __ENGINE_WASM_FILE__: JSON.stringify(engineWasmFile),
  },
  // A preview harness hands the port over in PORT; vite reads no such variable
  // itself, and left alone it would contend for 5173 with any other dev server.
  server: { port: Number(process.env.PORT) || undefined, proxy: { '/onebuilding': onebuilding } },
  preview: { proxy: { '/onebuilding': onebuilding } },
});
