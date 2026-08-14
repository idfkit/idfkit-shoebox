// Stage the weather station index where Vite can serve it, the same way
// `copy-schemas.mjs` stages the schema bundle. The index is one 1.7 MB gzipped
// file covering 69,638 TMYx stations; the page fetches it lazily, the first
// time someone opens the location picker.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = resolve(root, 'node_modules/@idfkit/weather');
const to = resolve(root, 'public/weather');

mkdirSync(to, { recursive: true });
cpSync(resolve(pkg, 'data/stations.json.gz'), resolve(to, 'stations.json.gz'));
console.log(`Copied station index to ${to}`);
