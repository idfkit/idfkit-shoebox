// Stage the weather station index where Vite can serve it, the same way
// `copy-schemas.mjs` stages the schema bundle. The index is one 1.7 MB gzipped
// file covering 69,638 TMYx stations; the page fetches it lazily, the first
// time someone opens the location picker.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = resolve(root, 'node_modules/@idfkit/weather');
const to = resolve(root, 'public/weather');

mkdirSync(to, { recursive: true });
cpSync(resolve(pkg, 'data/stations.json.gz'), resolve(to, 'stations.json.gz'));
console.log(`Copied station index to ${to}`);

// @idfkit/weather 0.0.0 shipped without its `dist/` directory — the tarball
// holds only `data/` and `LICENSE`, so the package has no code to import. Until
// a fixed version is published, point IDFKIT_WEATHER_DIST at a local build
// (`npm run build` in the package) and this stages it into node_modules.
if (!existsSync(resolve(pkg, 'dist/index.js'))) {
  const from = process.env.IDFKIT_WEATHER_DIST;
  if (from && existsSync(from)) {
    cpSync(from, resolve(pkg, 'dist'), { recursive: true });
    console.log(`Staged @idfkit/weather dist from ${from}`);
  } else {
    console.error(
      '\n@idfkit/weather has no dist/ — the published 0.0.0 tarball omits it.\n' +
        'Build the package from source and re-run with:\n' +
        '  IDFKIT_WEATHER_DIST=/path/to/idfkit-js/packages/weather/dist npm run dev\n'
    );
    process.exitCode = 1;
  }
}
