import { defineConfig } from 'vite';

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

export default defineConfig({
  server: { proxy: { '/onebuilding': onebuilding } },
  preview: { proxy: { '/onebuilding': onebuilding } },
});
