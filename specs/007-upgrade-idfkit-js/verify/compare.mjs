/**
 * Compare two spreads of written IDFs, twice over.
 *
 * Raw, which answers "did the file change at all", and normalised, which
 * answers the question the upgrade actually turns on: did anything about the
 * *model* change, as against the way the writer letters it. Normalising means
 * collapsing the run of spaces in front of a `!-` comment to one, because the
 * target release moves every comment one column left and that is a deliberate
 * fix upstream rather than a difference in the building.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [A, B] = process.argv.slice(2);
if (!A || !B) throw new Error('usage: compare.mjs <dir-a> <dir-b>');

const normalise = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t]+!-/, ' !-'))
    .join('\n');

const idfs = readdirSync(A).filter((f) => f.endsWith('.idf')).sort();

let anyContent = false;
for (const file of idfs) {
  const a = readFileSync(resolve(A, file), 'utf8');
  const b = readFileSync(resolve(B, file), 'utf8');
  const rawSame = a === b;
  const normSame = normalise(a) === normalise(b);
  if (!normSame) anyContent = true;

  // Object order, read off the type-name comment the writer puts above each
  // object, so a reordering shows even where every value is identical.
  const order = (text) => text.split('\n').filter((l) => /^\s*[A-Za-z][\w:]*,\s*$/.test(l)).join('|');
  const orderSame = order(a) === order(b);

  console.log(
    [
      file.padEnd(22),
      rawSame ? 'raw same    ' : 'RAW DIFFERS ',
      normSame ? 'content same' : 'CONTENT DIFFERS',
      orderSame ? 'order same' : 'ORDER DIFFERS',
    ].join('  ')
  );

  if (!normSame) {
    const la = normalise(a).split('\n');
    const lb = normalise(b).split('\n');
    let shown = 0;
    for (let i = 0; i < Math.max(la.length, lb.length) && shown < 12; i++) {
      if (la[i] !== lb[i]) {
        console.log(`    ${i + 1}  A: ${la[i] ?? '(end)'}`);
        console.log(`    ${i + 1}  B: ${lb[i] ?? '(end)'}`);
        shown++;
      }
    }
  }
}

console.log(anyContent ? '\nSOME CONTENT DIFFERS' : '\nEvery position: content identical once the comment column is normalised.');
