/**
 * G4 (T040), the Node half: nothing about tolerance bands reaches the model or
 * the link codec.
 *
 * The page half (the link unchanged across chasing every standard and none) is
 * asserted in `page-bands.mjs`, because the chase is page state and the link is
 * written by `main.js`. Here:
 *
 *   - `applyModel` three times is byte-identical on desks the bands are driven
 *     on (the standing idempotence gate; this feature does not touch the
 *     applier, and this proves it rather than assuming it);
 *   - the live solve's reporting is untouched: the wider contents reach the
 *     engine through `bandQuantities`, whose one caller in `main.js` is
 *     `sweepContents`, reached by a study (`jobForStudy`), the survey
 *     (`surveyContents`) and the pull (`readPull`), so the live solve's
 *     `'sheet'` profile never sees them;
 *   - `encodeState` takes no chase and no band, so neither can reach a link.
 *
 * Run: node specs/016-tolerance-bands/verify/g4-no-leak.mjs
 */
import fs from 'node:fs';
import { writeIdf } from '@idfkit/core';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { encodeState } from '../../../src/permalink.js';
import { PRESET_BY_ID, applyPreset } from '../../../src/schemes.js';
import { documentFor, loadSchema } from '../../012-attach-weather-file/verify/kit.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const schema = await loadSchema();
const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS, system: false } };
const desks = {
  default: { params: DEFAULT_PARAMETERS, bypass: DEFAULT_BYPASS },
  passivhaus: applyPreset(base.params, base.bypass, PRESET_BY_ID.passivhaus),
  enerphit: applyPreset(base.params, base.bypass, PRESET_BY_ID.enerphit),
};

for (const [name, desk] of Object.entries(desks)) {
  for (const annual of [false, true]) {
    const texts = [0, 1, 2].map(() => writeIdf(documentFor({ schema, ...desk, annual })));
    ok(`${name} ${annual ? 'year' : 'design days'}: applyModel thrice is byte-identical`, texts[0] === texts[1] && texts[1] === texts[2]);
  }
}

const main = fs.readFileSync(new URL('../../../src/main.js', import.meta.url), 'utf8');
const calls = [...main.matchAll(/bandQuantities\(/g)].map((m) => m.index);
// The enclosing top-level function of each call: the last `\nfunction NAME(`
// before it, which is how every function in main.js is declared.
const caller = calls.map((at) => [...main.slice(0, at).matchAll(/\nfunction (\w+)\(/g)].at(-1)?.[1] ?? '?');
ok('bandQuantities has one caller in main.js, sweepContents', calls.length === 1 && caller[0] === 'sweepContents', caller.join());
// And sweepContents is reached only by the sweeps: a study, and the survey and
// the pull through surveyContents. Never by the live solve.
const sweepCalls = [...main.matchAll(/(?<!function )sweepContents\(/g)].map((m) => m.index);
const sweepCallers = [...new Set(sweepCalls.map((at) => [...main.slice(0, at).matchAll(/\nfunction (\w+)\(/g)].at(-1)?.[1] ?? '?'))].sort();
// readPull builds its probes' contents at the desk the probes run at, not the
// survey's stance, because the band contents name that desk's channels.
ok('sweepContents is called by the sweeps only (jobForStudy, readPull, surveyContents)', sweepCallers.join() === 'jobForStudy,readPull,surveyContents', sweepCallers.join());

// The codec's whole input surface. A chase or a band would have to be one of
// these to reach a link, and none of them is.
const src = encodeState.toString();
const signature = src.slice(src.indexOf('{'), src.indexOf('}') + 1);
ok('encodeState takes no chase and no band', !/chase|band|tolerance/i.test(signature), signature);
const one = encodeState({ ...desks.passivhaus, quantity: 'extremes', studies: ['shgc', 'uFactor'] });
const two = encodeState({ ...desks.passivhaus, quantity: 'extremes', studies: ['shgc', 'uFactor'] });
ok('the same desk and studies encode to the same link', one === two, one);

console.log(failed ? `\n${failed} FAILED` : '\nG4 (Node half): nothing leaks');
process.exit(failed ? 1 : 0);
