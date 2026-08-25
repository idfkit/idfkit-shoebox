import { defineConfig } from 'vite';
import { revision } from './scripts/revision.mjs';
import { toolkit } from './scripts/toolkit.mjs';

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

export default defineConfig({
  define: {
    __SHEET_REVISION__: JSON.stringify(sheetRevision),
    __IDFKIT_VERSION__: JSON.stringify(toolkitVersion),
  },
  server: { proxy: { '/onebuilding': onebuilding } },
  preview: { proxy: { '/onebuilding': onebuilding } },
});
