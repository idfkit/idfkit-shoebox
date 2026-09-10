/**
 * SC-005a / FR-026a: one design, measured many times, reads identically.
 *
 * **The stop-the-line gate.** SC-005 admits no tolerance — the pull's ranking
 * must agree with full sweeps on 10 of 10 desks, and `direction: 'none'` is
 * reported only where the effect is *exactly* zero — and the whole of that
 * rests on the engine being repeatable on one input. If it is not, the feature
 * needs a noise floor it was clarified out of having, so a failure here
 * changes the design rather than the code.
 *
 * The reason the question is live at all is that this feature is the first
 * thing on the desk to measure a hundred designs in one session. The engine is
 * deterministic on one input, but `pool.js` recycles instances — `idle.push`
 * on release, `idle.pop` for the next sample — so one WASM instance serves
 * many runs, and CLAUDE.md records a warm session reading 512 hours open
 * against a cold boot's 511 on the same link. That drift is instance state
 * rather than a property of the model, and it is reachable from here.
 *
 * **The gate is in two halves, and only one of them can be run here.** That
 * was not the plan and it is worth stating plainly rather than quietly
 * dropping, because the half Node cannot reach is the half the drift was
 * observed in.
 *
 * *Determinism on one input* is measured here, over twenty runs on twenty
 * fresh instances. It is a necessary condition and it is the one every
 * arithmetic claim in this feature leans on.
 *
 * *Instance reuse* cannot be. Measured while writing this: the second
 * `callMain` on one Node instance throws a raw number — a C++ exception
 * pointer, EnergyPlus aborting because its globals are already initialized —
 * and throws **before doing any work**, leaving `/output` holding the first
 * run's files. So a harness that reused an instance would read run one's ESO
 * twenty times and report perfect agreement, for entirely the wrong reason.
 * That trap is closed below by asserting the refusal outright, so nobody
 * later writes the reuse harness that appears to pass.
 *
 * The browser does reuse: `@idfkit/engine`'s worker holds one `wasmModule`
 * across runs and only resets `/output` between them, which is where
 * CLAUDE.md's 512-against-511 came from. Reaching it from Node means shimming
 * `importScripts`, `self` and `fetch` around a web worker, which measures the
 * shim. **So the reuse half is a browser gate**: quickstart.md gate 7, cold
 * boot a link and read it, then solve the same link as a warm session's tenth
 * run, and compare.
 *
 * Contingency if either half fails, per research.md section 7: retire a pooled
 * instance after a bounded number of runs, and measure the WASM compile cost
 * against the budget before adopting it.
 */

import { writeIdf } from '@idfkit/core';
// `localBundle()` already *is* a `SchemaBundle` — it is not a source to be
// wrapped in one, which is what the browser's `httpSource` is — and it wants
// the full version string, `26.1.0` rather than `26.1`.
import { localBundle } from '@idfkit/schemas/node';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { applyModel, buildModel } from '../../../src/model.js';
import { environmentRuns, hourly, exactly, readExtremes } from '../../../src/readings.js';
import { parseESO } from '@idfkit/engine';
import { reuseRefusal, runIdf } from './engine.mjs';

const REPEATS = 20;

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('engine repeatability (SC-005a, FR-026a)');
console.log(`  one design, ${REPEATS} runs on ${REPEATS} fresh instances`);

const schema = await localBundle().load('26.1.0');
const model = buildModel(schema);
applyModel(model, DEFAULT_PARAMETERS, DEFAULT_BYPASS);
const idf = writeIdf(model);

/**
 * Everything a survey would ever read off one run, reduced to a string.
 *
 * Not the extremes alone: the drift CLAUDE.md records showed up in an *hours*
 * count, which is a different shape of reading from a temperature, and nothing
 * on the desk was fine grained enough to see it before that count existed. So
 * the fingerprint is the whole hourly zone series to full precision, which is
 * the strictest statement available and the one a survey's readings are all
 * derived from.
 */
function fingerprint(eso) {
  const points = hourly(eso, exactly('Zone Mean Air Temperature'));
  const runs = environmentRuns(points, eso?.environments ?? []);
  const extremes = readExtremes(eso);
  return JSON.stringify({
    environments: runs.map((run) => [run.key, run.start, run.end]),
    extremes,
    series: points.map((point) => point.value),
  });
}

const read = (result) => {
  if (!result.success) throw new Error(`the run exited ${result.exit}: ${result.err.slice(-400)}`);
  if (!result.eso) throw new Error('the run produced no ESO');
  return fingerprint(parseESO(result.eso));
};

/* ── half one: the same input, many times, on fresh instances ─────────── */

const seen = new Map();
let first = null;
for (let i = 0; i < REPEATS; i += 1) {
  const print = read(await runIdf({ idf }));
  if (first === null) first = print;
  seen.set(print, (seen.get(print) ?? 0) + 1);
}

ok('a run produces a reading at all', Boolean(first) && first.length > 100);
ok(
  `all ${REPEATS} runs of one design agree exactly`,
  seen.size === 1,
  `${seen.size} distinct readings across ${REPEATS} runs`,
);
if (seen.size > 1) {
  // Which hour they part company at is the whole diagnosis, so print it rather
  // than leaving the reader with a count.
  const [a, b] = [...seen.keys()].slice(0, 2).map((print) => JSON.parse(print).series);
  const at = a.findIndex((value, i) => value !== b[i]);
  console.log(`       first disagreement at hour ${at}: ${a[at]} against ${b[at]}`);
}

/* ── half two: the trap, closed ──────────────────────────────────────────── */

const reuse = await reuseRefusal({ idf });
ok('the first call on a fresh instance succeeds', reuse.first.exit === 0);
ok(
  'a second call on the same Node instance is refused rather than run',
  reuse.second.exit !== 0 && reuse.second.threw !== null,
  `second call exited ${reuse.second.exit}`,
);
ok(
  "and leaves the first run's outputs in place, which is why no reuse harness may be built on it",
  reuse.second.eso === reuse.first.eso && reuse.second.err === reuse.first.err,
  'the refused call changed the output directory, so the finding above needs re-taking',
);
console.log(
  '  note the reuse half of SC-005a is a browser gate: quickstart.md gate 7, cold boot a link\n' +
    "       and read it, then solve the same link as a warm session's tenth run, and compare.",
);

if (failures) {
  console.log(
    '\nSTOP. FR-026a is the guard on SC-005, and it has failed. Do not continue past T012:\n' +
      '  - revisit research.md section 7 before writing any more of this feature;\n' +
      '  - the contingency is retiring a pooled instance after a bounded number of runs;\n' +
      '  - measure the WASM compile cost of that retirement against the budget first.',
  );
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
