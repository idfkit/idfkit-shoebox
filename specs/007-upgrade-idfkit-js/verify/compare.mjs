/**
 * Compare two spreads of written IDFs, three ways over.
 *
 * Raw, which answers "did the file change at all"; content, which answers the
 * question the upgrade actually turns on — did anything about the *model*
 * change, as against the way the writer letters it; and order, which answers
 * where in the file the writer put each object.
 *
 * Two things are normalised away before the content question is asked, and
 * both are the writer lettering rather than the building.
 *
 * The first is the comment column: the run of spaces in front of a `!-`
 * comment collapses to one, because the target release moves every comment one
 * column left and that is a deliberate fix upstream.
 *
 * The second is object *order*, and it had to be found the hard way. Content
 * was originally asked as a line-by-line string equality, which meant a file
 * whose objects had merely moved failed the content test as well as the order
 * test — the two questions were one question wearing two labels, and no run
 * could ever produce the result this harness's own quickstart says to expect
 * ("content same" at a position reporting "ORDER DIFFERS"). A comparison that
 * cannot express its own expected outcome is not a gate. So content is asked
 * of the objects as a *set*: split each file at the `;` that ends an object,
 * sort, compare. Where the sets agree and the sequences do not, exactly one
 * thing changed and it is the order — which is the finding this feature exists
 * to bring to the engine, in FR-003a, rather than something to be argued away
 * on paper.
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

/**
 * Split an IDF into object blocks. An object runs from its type line to the
 * line carrying the `;` that closes it, so this is the writer's own unit and
 * not a guess about field counts.
 */
const objects = (text) => {
  const out = [];
  let cur = [];
  for (const line of normalise(text).split('\n')) {
    if (!line.trim()) continue;
    cur.push(line);
    if (/;\s*(!-.*)?$/.test(line)) {
      out.push(cur.join('\n'));
      cur = [];
    }
  }
  // A trailing run with no terminator is malformed, and saying so beats
  // dropping it silently.
  if (cur.length) out.push(cur.join('\n'));
  return out;
};

const idfs = readdirSync(A)
  .filter((f) => f.endsWith('.idf'))
  .sort();

let anyContent = false;
for (const file of idfs) {
  const a = readFileSync(resolve(A, file), 'utf8');
  const b = readFileSync(resolve(B, file), 'utf8');
  const rawSame = a === b;

  const oa = objects(a);
  const ob = objects(b);
  const sa = [...oa].sort();
  const sb = [...ob].sort();
  const contentSame = sa.length === sb.length && sa.every((o, i) => o === sb[i]);
  if (!contentSame) anyContent = true;

  // Order is the sequence of the same blocks, so a reordering shows even where
  // every object is present and every value identical.
  const orderSame = oa.length === ob.length && oa.every((o, i) => o === ob[i]);

  console.log(
    [
      file.padEnd(22),
      rawSame ? 'raw same    ' : 'RAW DIFFERS ',
      contentSame ? 'content same' : 'CONTENT DIFFERS',
      orderSame ? 'order same' : 'ORDER DIFFERS',
    ].join('  ')
  );

  if (!contentSame) {
    // Name what is actually missing from each side rather than the first line
    // where two files stopped agreeing, which after a reordering is every line.
    const onlyA = sa.filter((o) => !sb.includes(o));
    const onlyB = sb.filter((o) => !sa.includes(o));
    console.log(`    ${oa.length} objects in A, ${ob.length} in B`);
    for (const o of onlyA.slice(0, 6)) console.log(`    only in A: ${o.split('\n')[0]}`);
    for (const o of onlyB.slice(0, 6)) console.log(`    only in B: ${o.split('\n')[0]}`);
  }
}

console.log(
  anyContent
    ? '\nSOME CONTENT DIFFERS'
    : '\nEvery position: the same objects, field for field, once the comment column is normalised.'
);
