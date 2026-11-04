/**
 * G3 (T025): bands agree with the scoreboard, on the page, against the engine.
 *
 * For each desk: open it with its studies through a link, chase the standard,
 * let every study settle, read every band line and the tolerance block. Then,
 * for every edge closed by a line failing, reload the same desk **without
 * studies** at the edge's last passing position and at its first failing one,
 * and read the chase line's own verdict: the inside must clear every readable
 * line, the outside must fail the line the edge named. On a failing desk with
 * a named move, reload at the move and require every readable line to clear
 * (SC-002, SC-003).
 *
 * Positions are parsed from the lettered band line, so every lever used here
 * letters its position exactly at its own step (two decimals at step 0.01, one
 * at 0.5). A lever whose lettering rounds its grid would need the numbers off
 * the page by another route.
 *
 * Serve the build first:  npm run build && npx vite preview --port 4173
 * Then:                   node specs/016-tolerance-bands/verify/g3-agreement.mjs
 */
import { createRequire } from 'node:module';
import { CHANNELS, DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { encodeState } from '../../../src/permalink.js';
import { PRESET_BY_ID, applyPreset } from '../../../src/schemes.js';
import { STATIONS, epwWholeYear } from '../../012-attach-weather-file/verify/fixtures.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const AT = process.env.SHOEBOX_PAGE ?? 'http://localhost:4173/';
const EPW = Buffer.from(epwWholeYear(STATIONS.london), 'utf8');

const LEVERS = ['shgc', 'uFactor', 'groundReflect'];
const DESKS = [
  { name: 'Passivhaus spec, chase Passivhaus (passing, U-factor tight)', apply: 'passivhaus', chase: 'Passivhaus' },
  { name: 'Passivhaus spec at U 2.5, chase Passivhaus (failing, one lever restores)', apply: 'passivhaus', params: { uFactor: 2.5 }, chase: 'Passivhaus' },
  { name: 'Passivhaus spec, chase EnerPHit (every band to its stops)', apply: 'passivhaus', chase: 'EnerPHit' },
  { name: 'EnerPHit spec, chase EnerPHit (failing, no lever alone)', apply: 'enerphit', chase: 'EnerPHit' },
  { name: 'Passivhaus spec, chase LETI (EUI and heating)', apply: 'passivhaus', chase: 'LETI' },
  { name: 'Passivhaus spec with SHGC at its stop', apply: 'passivhaus', params: { shgc: 0.9 }, chase: 'Passivhaus' },
  { name: 'Passivhaus spec at U 1.6 (near the edge)', apply: 'passivhaus', params: { uFactor: 1.6 }, chase: 'Passivhaus' },
  { name: 'Passivhaus spec, Fabric bypassed', apply: 'passivhaus', out: ['fabric'], chase: 'EnerPHit' },
  { name: 'Heating setpoint swept past cooling (refused positions)', apply: 'passivhaus', params: { coolSet: 22 }, studies: ['heatSet', 'uFactor'], chase: 'Passivhaus' },
  { name: 'Free-running desk, chase EnerPHit (heating not judged)', apply: null, free: true, chase: 'EnerPHit' },
];

let failed = 0;
let checked = 0;
const ok = (name, cond, detail = '') => {
  checked += 1;
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function linkFor(desk, { studies = true, at = {} } = {}) {
  const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS, system: !!desk.free } };
  const applied = desk.apply ? applyPreset(base.params, base.bypass, PRESET_BY_ID[desk.apply]) : base;
  const bypass = { ...applied.bypass };
  for (const id of desk.out ?? []) bypass[id] = true;
  return encodeState({
    params: { ...applied.params, ...(desk.params ?? {}), ...at },
    bypass,
    quantity: 'extremes',
    studies: studies ? desk.studies ?? LEVERS : [],
  });
}

const browser = await chromium.launch();

async function open(hash) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('shoebox-units-v1', 'si'));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${AT}#${hash}`, { waitUntil: 'networkidle' });
  const solved = () => page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 240000 });
  await solved();
  await page.setInputFiles('#site-file', { name: 'london.epw', mimeType: 'text/plain', buffer: EPW });
  await solved();
  return { page, errors };
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', sel);

async function settle(page) {
  let last = -1;
  let still = 0;
  for (let i = 0; i < 900; i += 1) {
    const busy = await page.evaluate(() => [...document.querySelectorAll('.study-wait')].some((n) => /Solving/.test(n.textContent)));
    const n = Number(await text(page, '#runs'));
    still = !busy && n === last ? still + 1 : 0;
    last = n;
    if (still >= 8) return;
    await page.waitForTimeout(1000);
  }
  throw new Error('the studies never settled');
}

async function chase(page, standard) {
  await page.getByRole('button', { name: new RegExp(`^Chase ${standard}`) }).click();
  await page.waitForTimeout(1500);
}

/** The chase line's verdict at one desk: { clears: boolean, worst: label | null, line }. */
async function verdictAt(desk, at) {
  const { page } = await open(linkFor(desk, { studies: false, at }));
  await chase(page, desk.chase);
  // The solve after the file has landed; the chase line reads it.
  await page.waitForTimeout(1500);
  const line = await text(page, '#chase');
  await page.close();
  return { clears: /every readable line clears/.test(line), line };
}

const num = (s) => Number(String(s).match(/-?[0-9]+(?:\.[0-9]+)?/)[0]);

for (const desk of DESKS) {
  console.log(`\n=== ${desk.name}`);
  const { page, errors } = await open(linkFor(desk));
  await settle(page);
  await chase(page, desk.chase);
  // Cards hang under their controls, so they come back in the console's own
  // order, not the link's. The first run of this harness paired them by link
  // order and would have set the wrong lever at every edge.
  const order = CHANNELS.flatMap((channel) => channel.keys());
  const studies = [...(desk.studies ?? LEVERS)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const lines = await page.evaluate(() => [...document.querySelectorAll('.study-band')].map((p) => p.textContent.trim()));
  const block = await text(page, '#tolerance');
  console.log(`block: ${block.replace(/ Method.*$/, '')}`);
  for (const [i, line] of lines.entries()) console.log(`  ${studies[i] ?? '?'}: ${line}`);
  ok(`${desk.name}: a band line per study, no page error`, lines.length === studies.length && errors.length === 0, errors.join(' | '));
  await page.close();

  // Each edge closed by a failing line: inside clears, outside fails that line.
  for (const [i, line] of lines.entries()) {
    const key = studies[i];
    const edge = /from (\S+)[^(]*\(([^)]*)\) to (\S+)[^(]*\(([^)]*)\)/.exec(line);
    if (!edge) continue;
    for (const [inside, why] of [[edge[1], edge[2]], [edge[3], edge[4]]]) {
      const failsAt = /^(.*) fails at (\S+)/.exec(why);
      if (!failsAt) continue;
      const named = failsAt[1].split(' and ')[0];
      const a = await verdictAt(desk, { [key]: num(inside) });
      ok(`${key} at ${inside} (inside) clears every readable line`, a.clears, a.line);
      const b = await verdictAt(desk, { [key]: num(failsAt[2]) });
      ok(`${key} at ${failsAt[2]} (outside) fails ${named}`, !b.clears && b.line.includes(named), b.line);
    }
  }

  // The named move restores every line (SC-003).
  const move = /restore every line: (.+?) to (\S+)/.exec(block);
  if (move) {
    // The lever named is the card whose own move lands on that position.
    const at = move[2].replace('.', '\\.');
    const target = studies.find((k, i) => /^Fails/.test(lines[i] ?? '') && new RegExp(`(from|to) ${at} \\(`).test(lines[i]));
    if (!target) throw new Error(`no card carries the named move to ${move[2]}`);
    const c = await verdictAt(desk, { [target]: num(move[2]) });
    ok(`named move ${move[1]} to ${move[2]} restores every readable line`, c.clears, c.line);
  }
}

await browser.close();
console.log(failed ? `\n${failed} of ${checked} FAILED` : `\nG3: all ${checked} checks agree with the scoreboard`);
process.exit(failed ? 1 : 0);
