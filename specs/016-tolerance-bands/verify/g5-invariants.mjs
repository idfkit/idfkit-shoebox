/**
 * G5 (T015): the load-time invariants of `src/tolerance.js`, proved to bite.
 *
 * Importing the real module runs all four. Then each is broken once, in a copy
 * of `src/` under the system temp directory (the repository is never touched),
 * and the copy's `tolerance.js` is imported in a fresh process: the import must
 * throw, and the message must name the declaration that was broken.
 *
 * Run: node specs/016-tolerance-bands/verify/g5-invariants.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const real = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(ROOT, 'src/tolerance.js'))})`], { encoding: 'utf8' });
ok('the real module loads, all four invariants hold', real.status === 0, real.stderr.split('\n').find((l) => /Error/.test(l)) ?? '');

/** Copy src/, apply one edit, import the copy's tolerance.js, return the error text. */
function broken(file, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoebox-g5-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
    // Bare imports resolve from the copy's own folder upward, so link the
    // repository's packages beside it.
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package.json'), fs.readFileSync(path.join(ROOT, 'package.json')));
    const at = path.join(dir, 'src', file);
    const text = fs.readFileSync(at, 'utf8');
    if (!text.includes(from)) throw new Error(`the edit to ${file} no longer applies: ${from.slice(0, 60)}`);
    fs.writeFileSync(at, text.replace(from, to));
    const run = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(dir, 'src/tolerance.js'))})`], { encoding: 'utf8' });
    return { status: run.status, message: run.stderr.split('\n').find((l) => /Error:/.test(l)) ?? run.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 1. A limited line read off a metric no reading carries.
{
  const r = broken('schemes.js', "label: 'Energy use intensity',\n        metric: 'eui',", "label: 'Energy use intensity',\n        metric: 'euiNowhere',");
  // Caught first by `study.js`, which refuses a target metric with no study
  // quantity before `tolerance.js` is evaluated. The load still fails and still
  // names the metric; `readingForTarget`'s own throw is the second line behind it.
  ok('a line with no answering reading throws at load, naming its metric', r.status !== 0 && /euiNowhere/.test(r.message), r.message);
}

// 2. The band contents leave out a quantity a line is read off.
{
  const r = broken('tolerance.js', 'return QUANTITIES.filter((quantity) => wanted.has(quantity));', "return QUANTITIES.filter((quantity) => wanted.has(quantity) && quantity.id !== 'overheat');");
  ok('contents missing a line’s quantity throws, naming the line', r.status !== 0 && /Hours above 25/.test(r.message) && /overheat/.test(r.message), r.message);
}

// 3. The band contents no longer answer the study's own reading.
{
  const r = broken('tolerance.js', 'return Object.freeze([...ownList, ...usable]);', 'return Object.freeze([...usable]);');
  ok('contents that drop the study’s own reading throw, naming it', r.status !== 0 && /a study of \w+/.test(r.message), r.message);
}

// 4. A line that passes above its own limit.
{
  const r = broken('schemes.js', 'return value <= this.limit;', 'return value <= this.limit * 2;');
  // Caught first by feature 012's pass-side probe in `survey.js`, which runs
  // while `BAND_QUANTITIES` is matched. Invariant 4 here is the second line,
  // for the day the survey stops probing; either way the load names the line.
  ok('a comparator passing above the limit throws at load, naming the line', r.status !== 0 && /Space heating demand/.test(r.message), r.message);
}

console.log(failed ? `\n${failed} FAILED` : '\nG5: every invariant loads clean and bites when broken');
process.exit(failed ? 1 : 0);
