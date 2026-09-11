/**
 * Shared by the harnesses: the schema, one document, the two desks the
 * quickstart names, and the assertion helpers. Not a harness itself.
 *
 * The schema comes from `localBundle()` in `@idfkit/schemas/node` and wants
 * the full version string, `load('26.1.0')`, not `load('26.1')`.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIdf } from '@idfkit/core';
import { localBundle } from '@idfkit/schemas/node';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel, setAnnual } from '../../../src/model.js';

let schemaAt = null;
let modelAt = null;

export async function schema() {
  schemaAt ??= await localBundle().load('26.1.0');
  return schemaAt;
}

/** One document, reused the way the page reuses its own. */
export async function model() {
  modelAt ??= buildModel(await schema());
  return modelAt;
}

/**
 * The reference desk: the free-running default desk (the spec's own). Its
 * design days are whatever the station supplies; for the no-engine gates the
 * stock file's are enough, since what is compared is two documents built on
 * the same days.
 */
export const REFERENCE = Object.freeze({
  name: 'the reference desk',
  params: Object.freeze({ ...DEFAULT_PARAMETERS }),
  patch: Object.freeze({ ...DEFAULT_BYPASS }),
  annual: false,
});

/**
 * The annual evidence desk: System, Gains and Daylight patched in, on a year.
 * A weather file attached sets `sizingPeriods` to `No`, which is what the page
 * does through `choose`, so the no-engine gates build it the same way.
 */
export const ANNUAL = Object.freeze({
  name: 'the annual evidence desk',
  params: Object.freeze({ ...DEFAULT_PARAMETERS, sizingPeriods: 'No' }),
  patch: Object.freeze({ ...DEFAULT_BYPASS, system: false, gains: false, daylight: false }),
  annual: true,
});

/** One desk written as an IDF, the way `buildSample` writes a sample. */
export async function idfOf(params, patch, { annual = false, reporting = 'sheet' } = {}) {
  const doc = await model();
  setAnnual(doc, annual);
  applyModel(doc, params, patch, { reporting });
  return writeIdf(doc);
}

/* ── the engine, many runs at once ─────────────────────────────────────── */

const ENGINE_CHILD = fileURLToPath(new URL('../../006-design-space-survey/verify/engine-child.mjs', import.meta.url));

/**
 * One EnergyPlus run in a process of its own, asynchronously. The same child
 * `engine.mjs` spawns synchronously, for the same reason: `main` cannot be
 * called twice in one process, so a process is the only unit of work that can
 * be trusted to be independent. Many of them at once is what makes a thousand
 * runs a matter of minutes rather than of half an hour.
 */
function runOne({ idf, epw = null }) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoebox-009-'));
  fs.writeFileSync(path.join(workdir, 'input.idf'), idf);
  if (epw) fs.writeFileSync(path.join(workdir, 'weather.epw'), epw);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENGINE_CHILD, workdir], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      const at = path.join(workdir, 'result.json');
      const result = fs.existsSync(at)
        ? JSON.parse(fs.readFileSync(at, 'utf8'))
        : { success: false, err: `the engine child wrote no result (exit ${code}): ${stderr.slice(-400)}` };
      fs.rmSync(workdir, { recursive: true, force: true });
      resolve(result);
    });
  });
}

export async function runMany(jobs, { concurrency = Math.max(2, os.cpus().length - 2), label = 'runs' } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const started = Date.now();
  async function worker() {
    while (next < jobs.length) {
      const at = next;
      next += 1;
      results[at] = await runOne(jobs[at]);
      done += 1;
      if (done % 50 === 0 || done === jobs.length) {
        process.stdout.write(`       ${label}: ${done} of ${jobs.length} in ${Math.round((Date.now() - started) / 1000)} s\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

/** The engine's first severe line, or a sentence saying it gave none. */
export function failureOf(result) {
  const line = /\*\*\s+(?:Severe|Fatal)\s+\*\*\s*(.+)/.exec(String(result?.err ?? ''));
  return line ? line[1].trim() : 'The run did not complete, and the engine gave no reason.';
}

/**
 * A cache of landed runs on disk, keyed by the ledger id, so an analysis can
 * be re-read without re-running a thousand simulations. Kept under the system
 * temporary directory: it is a convenience of whoever is running the gate,
 * not a record.
 */
export function runCache(name) {
  const file = path.join(os.tmpdir(), `shoebox-009-${name}.json`);
  const held = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return {
    held,
    save() {
      fs.writeFileSync(file, JSON.stringify(held));
    },
    file,
  };
}

let failures = 0;

export function ok(label, condition, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return condition;
}

export function throws(label, fn, wanted = null) {
  try {
    fn();
    failures += 1;
    console.log(`  FAIL ${label} — it did not throw`);
  } catch (failure) {
    const hit = !wanted || failure.message.includes(wanted);
    if (!hit) failures += 1;
    console.log(`  ${hit ? 'ok  ' : 'FAIL'} ${label}${hit ? '' : ` — threw "${failure.message}"`}`);
  }
}

export function finish() {
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
