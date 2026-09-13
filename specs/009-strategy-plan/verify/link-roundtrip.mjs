/**
 * Quickstart gate 8: the `sp` codec round-trips and refuses. No engine.
 *
 * contracts/permalink-key.md, in four blocks: every reading and every ordered
 * pair round-trips exactly; every refusal class is refused whole; `sv` and
 * `sp` ride together; and a corpus of links minted before this feature decodes
 * byte-identically to what the parent commit's own `permalink.js` makes of it,
 * which is imported from git rather than remembered.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { LINK_VERSION, decodeState, encodeState } from '../../../src/permalink.js';
import { READINGS } from '../../../src/survey.js';
import { finish, ok, throws } from './desk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS } };

console.log('the plan link (gate 8)');

ok('LINK_VERSION is still v1', LINK_VERSION === 'v1');

/* ── every reading, every ordered pair ─────────────────────────────────── */
{
  let bad = null;
  let count = 0;
  const check = (ids) => {
    const link = encodeState({ ...base, plan: ids });
    const back = decodeState(link).plan;
    if (JSON.stringify(back) !== JSON.stringify(ids) || encodeState({ ...base, plan: back }) !== link) bad ??= ids.join('.');
    count += 1;
  };
  for (const a of READINGS) {
    check([a.id]);
    for (const b of READINGS) if (a.id !== b.id) check([a.id, b.id]);
  }
  ok(`all ${count} plans round-trip exactly`, !bad, bad);
  ok('a plan link reads sp=high.low', encodeState({ ...base, plan: ['high', 'low'] }) === 'v1&sp=high.low');
}

/* ── refused whole ─────────────────────────────────────────────────────── */
throws('an empty value is refused', () => decodeState('v1&sp='), 'empty');
throws('a trailing full stop is refused', () => decodeState('v1&sp=high.'), 'not a plan value');
throws('an unknown reading is refused', () => decodeState('v1&sp=nope'), 'no reading is called');
throws('three readings are refused', () => decodeState('v1&sp=high.low.eui'), 'one or two readings');
throws('the same reading twice is refused', () => decodeState('v1&sp=high.high'), 'twice');
throws('sp given twice is refused', () => decodeState('v1&sp=high&sp=low'), 'given 2 times');
// The trap this codebase has met three times: a value that is syntactically a
// number must still be read as a plan, and refused as one.
throws('a numeric plan value is refused as a plan, not as a number', () => decodeState('v1&sp=12'), 'no reading is called');

/* ── beside the survey ─────────────────────────────────────────────────── */
{
  const survey = { x: 'wwrS', y: 'wallR', readings: ['high'], extents: {} };
  const link = encodeState({ ...base, survey, plan: ['eui', 'overheat'] });
  const back = decodeState(link);
  ok('sv and sp round-trip together', back.survey?.x === 'wwrS' && JSON.stringify(back.plan) === '["eui","overheat"]', link);
}

/* ── a pre-feature corpus decodes as it did ────────────────────────────── */
{
  const baseline = path.join(here, '.baseline-permalink.mjs');
  const source = execFileSync('git', ['show', '82d098d:src/permalink.js'], { cwd: path.resolve(here, '../../..') })
    .toString()
    .replaceAll("from './", "from '../../../src/");
  fs.writeFileSync(baseline, source);
  try {
    const before = await import(baseline);
    const corpus = [
      'v1',
      'v1&width=12',
      'v1&out=fabric&in=blinds',
      'v1&stn=725650&win=2009-2023&sizingPeriods=No',
      'v1&sty=extremes.width,wallR',
      'v1&sv=wwrS*wallR*high*0_0.9*0.2_10',
      'v1&at=year.8-3T13&stn=725650&win=2009-2023',
      'v1&roomType=Double+bedroom&in=gains',
    ];
    let differs = null;
    for (const fragment of corpus) {
      if (JSON.stringify(before.decodeState(fragment)) !== JSON.stringify(decodeState(fragment))) differs ??= fragment;
      const decoded = decodeState(fragment);
      if (before.encodeState(decoded) !== encodeState(decoded)) differs ??= `${fragment} (re-encoded)`;
    }
    ok(`all ${corpus.length} pre-feature links decode and re-encode byte-identically (US5 scenario 4)`, !differs, differs);
  } finally {
    fs.rmSync(baseline, { force: true });
  }
}

finish();
