// Copy the schema bundle where Vite can serve it, the same way
// `idfkit-engine-assets` stages the WASM engine. ~1 MB gzipped for every
// EnergyPlus version; the browser only fetches the index, the type blobs and
// the one manifest it asks for.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/@idfkit/schemas/data');
const to = resolve(root, 'public/schemas');

mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`Copied schema bundle to ${to}`);
