/**
 * FR-036: no figure combining two readings, anywhere a pair is classified or
 * lettered (contracts/strategy-module.md, invariant 5).
 *
 * Engine-free, in two halves. A static scan of the source where the four kinds
 * are computed (`strategy.js`, from the four kinds to the strip tags) and
 * where they are lettered (`strategy-view.js`, the moves panel), for any
 * expression that adds, subtracts, multiplies, divides or reduces the two
 * readings' values together. And a check on real `Classification`s that the
 * class exposes nothing beyond its declared fields, and no number but the two
 * readings' own improvements, each in its own units.
 *
 * The scan is deliberately narrow: a comparison of two signs is how the kinds
 * are told apart and is allowed, and ranking by one reading alone is not a
 * combination. What it refuses is arithmetic across the pair, which is the
 * whole of what a weighting or a score would need.
 *
 *     node specs/009-strategy-plan/verify/no-combined.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Classification, classifyAll } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let passed = 0;
function ok(name, pass, detail = '') {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!pass) process.exit(1);
  passed += 1;
}

/** The source between two markers, with comments and string contents taken out. */
function region(file, from, to) {
  const text = readFileSync(`${root}${file}`, 'utf8');
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`${file}: the region "${from}" to "${to}" is not where it was`);
  return text
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

// Arithmetic across the pair: the first reading's value on one side of an
// operator and the second's on the other, in any of the spellings the two
// modules use for them.
const ACROSS = [
  [/\bmu\s*\[\s*0\s*\][^;\n]*?[+*/-][^;\n]*?\bmu\s*\[\s*1\s*\]/, 'mu[0] with mu[1]'],
  [/\bmu\s*\[\s*1\s*\][^;\n]*?[+*/-][^;\n]*?\bmu\s*\[\s*0\s*\]/, 'mu[1] with mu[0]'],
  [/\bmu\s*\.\s*(?:reduce|map\s*\([^)]*\)\s*\.\s*reduce)\s*\(/, 'a reduction over mu'],
  [/Math\.(?:hypot|max|min)\s*\(\s*\.\.\.\s*[\w.]*mu\b/, 'a norm or extreme over mu'],
  [/\bp\s*\[\s*0\s*\]\s*[+*/-]\s*[\w.]*\bp\s*\[\s*1\s*\]/, 'p[0] with p[1]'],
  [/\ba\s*\[\s*i\s*\]\s*[+*/-]\s*[\w.]*\bb\s*\[\s*i\s*\]/, 'a[i] with b[i]'],
  [/\bmuA\b\s*[+*/-]\s*[\w.]*\bmuB\b|\bmuB\b\s*[+*/-]\s*[\w.]*\bmuA\b/, 'muA with muB'],
  [/\bda\b\s*[+*/-]\s*[\w.]*\bdb\b|\bdb\b\s*[+*/-]\s*[\w.]*\bda\b/, 'da with db'],
  [/\b(?:weight(?:ed|ing)?|combined|composite|score)\w*\s*[=:(]/i, 'a weighting or a score'],
];

const sources = [
  ['src/strategy.js', region('src/strategy.js', '/* ══ the four kinds', '/* ══ strip tags')],
  ['src/strategy-view.js', region('src/strategy-view.js', 'const KIND_HEAD', 'export function renderReadingChooser')],
];
for (const [file, code] of sources) {
  const found = ACROSS.filter(([pattern]) => pattern.test(code)).map(([, name]) => name);
  ok(`${file}: no arithmetic across the two readings where the kinds are made or lettered`, !found.length, found.join(', '));
}

// The declared fields, and the one getter. A field added later that carries a
// number of its own is a combined figure until somebody argues otherwise.
const FIELDS = ['key', 'label', 'pair', 'kind', 'on', 'mu', 'consistency', 'levers', 'unpaid', 'losing', 'stage', 'door'];
const methods = Object.getOwnPropertyNames(Classification.prototype).filter((name) => name !== 'constructor');
ok('Classification declares no method or getter beyond `whole`', methods.length === 1 && methods[0] === 'whole', methods.join(', '));

// Real classifications of every kind, from effects laid out to reach all four:
// SHGC moves the high alone, U-factor trades them, sill moves neither, and
// ground reflectance helps both.
const pair = [READING_BY_ID.high, READING_BY_ID.low];
const keys = ['shgc', 'uFactor', 'sill', 'groundReflect'];
const at = (rows) => rows.map((row) => Float64Array.from(row));
const effects = [
  { keys, g: at([[2, 1.5, 0.1, -1], [2.5, 1.2, 0.05, -1.2], [1.8, 1.4, 0.1, -0.9], [2.2, 1.6, 0, -1.1]]) },
  { keys, g: at([[0.1, 1.2, 0.02, 1], [0.05, 1.4, 0, 0.9], [0.1, 1.1, 0.03, 1.2], [0, 1.3, 0.01, 1]]) },
];
const classes = classifyAll({ pair, effects, taus: [0.5, 0.5] });
ok('the fixture reaches all four kinds', new Set(classes.map((c) => c.kind)).size === 4, classes.map((c) => `${c.key} ${c.kind}`).join(', '));
for (const c of classes) {
  const own = Object.keys(c);
  const extra = own.filter((name) => !FIELDS.includes(name));
  ok(`${c.key}: no field beyond the declared ones`, !extra.length, extra.join(', '));
  const numbers = own.filter((name) => typeof c[name] === 'number' && name !== 'stage');
  ok(`${c.key}: no number of its own but the stage`, !numbers.length, numbers.join(', '));
  ok(`${c.key}: mu is the two readings' improvements, one each`, Array.isArray(c.mu) && c.mu.length === 2 && c.mu.every(Number.isFinite));
}

console.log(`\n${passed} assertions held.`);
