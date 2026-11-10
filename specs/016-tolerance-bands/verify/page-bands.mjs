/**
 * The driven page (T022, T026, T032, T036, T037, T041): tolerance bands on the
 * built sheet, in a real browser, against the staged engine.
 *
 * Serve the build first:  npm run build && npx vite preview --port 4173
 * Then:                   node specs/016-tolerance-bands/verify/page-bands.mjs
 *
 * The weather is the 012 feature's synthetic London year, attached through the
 * file input, because the station picker's upstream is unreachable from here
 * (see specs/012-attach-weather-file/verify/fixtures.mjs). Studies are opened
 * through a link (`sty`), System through `in`, so the desk under test is the
 * one the link names rather than one assembled by clicking.
 *
 * Writes screenshots beside itself under `shots/` (gitignored with fixtures).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { encodeState } from '../../../src/permalink.js';
import { PRESET_BY_ID, applyPreset } from '../../../src/schemes.js';
import { STATIONS, epwWholeYear } from '../../012-attach-weather-file/verify/fixtures.mjs';

// The sandbox's Playwright is a global install, which `require` resolves and a
// bare ESM import does not.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const AT = process.env.SHOEBOX_PAGE ?? 'http://localhost:4173/';
const STUDIES = (process.env.STUDIES ?? 'shgc,uFactor,groundReflect').split(',');
const STANDARD = process.env.STANDARD ?? 'EnerPHit';
const PARAMS = JSON.parse(process.env.PARAMS ?? '{}');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// APPLY=enerphit lays that standard's specification over the desk first, the
// way the register's Apply does, so a passing desk can be reached by name.
const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS, system: false } };
const applied = process.env.APPLY ? applyPreset(base.params, base.bypass, PRESET_BY_ID[process.env.APPLY]) : base;
const hash = encodeState({
  params: { ...applied.params, ...PARAMS },
  bypass: applied.bypass,
  quantity: 'extremes',
  studies: STUDIES,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 1400), height: 1000 } });
// The sheet picks IP for a United States locale, which is what the headless
// browser reports, so SI is pinned the way a reader's own choice is stored.
// The round trip below then starts from SI as SC-007 states it.
await page.addInitScript(() => localStorage.setItem('shoebox-units-v1', 'si'));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

await page.goto(`${AT}#${hash}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 180000 });

const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, sel);
const bands = () => page.evaluate(() => [...document.querySelectorAll('.study-band')].map((p) => p.textContent.trim()));
const runs = async () => Number(await text('#runs'));
const idle = async (ms = 900000) => {
  // Settled: no card counting samples, and the run counter still for eight
  // seconds. A status line goes quiet between a re-sweep's passes, so it was
  // not enough on its own: the first version of this harness read the block
  // while the year's re-sweep was still landing.
  const until = Date.now() + ms;
  let last = -1;
  let still = 0;
  while (Date.now() < until) {
    const busy = await page.evaluate(() => [...document.querySelectorAll('.study-wait')].some((n) => /Solving/.test(n.textContent)));
    const n = await runs();
    still = !busy && n === last ? still + 1 : 0;
    last = n;
    if (still >= 8) return;
    await page.waitForTimeout(1000);
  }
  throw new Error('the studies never settled');
};

// The year, so the demand and overheating lines can be read at all. NO_YEAR=1
// leaves the desk on its design days, which is US4's case: the annual lines are
// listed as not judged and the bands are measured on the peak loads alone.
if (!process.env.NO_YEAR) await page.setInputFiles('#site-file', { name: 'london.epw', mimeType: 'text/plain', buffer: Buffer.from(epwWholeYear(STATIONS.london), 'utf8') });
if (!process.env.NO_YEAR) await page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 180000 });
await idle();
const linkBefore = await page.evaluate(() => location.hash);

// Before any chase: the block is hidden and no card carries a band.
ok('nothing chased: no tolerance block', await page.evaluate(() => document.getElementById('tolerance').hidden));
ok('nothing chased: no band on any card', (await bands()).length === 0);

await page.getByRole('button', { name: new RegExp(`^Chase ${STANDARD}`) }).click();
await idle();
const t0 = performance.now();
console.log('\n#chase:', await text('#chase'));
console.log('link:', hash.slice(0, 300));
console.log('\n#tolerance:', await text('#tolerance'));
console.log('bands:\n  ' + (await bands()).join('\n  '));
await page.screenshot({ path: path.join(SHOTS, `chased-${STANDARD}.png`), fullPage: false });
const block = await text('#tolerance');
ok('chased: block names the standard and the count asked', block.includes(`Tolerance against ${STANDARD}`) && /\d+ levers? studied/.test(block), block.slice(0, 80));
ok('chased: the caveat is in view', block.includes('Each band holds every other lever where it stands.'));
ok('chased: every studied card carries a band line', (await bands()).length === STUDIES.length, String((await bands()).length));

// SC-004: switching the chase starts no run.
const before = await runs();
const other = STANDARD === 'EnerPHit' ? 'Passivhaus' : 'EnerPHit';
await page.getByRole('button', { name: new RegExp(`^Chase ${other}`) }).click();
await page.waitForTimeout(2500);
const after = await runs();
ok('SC-004: switching the chase adds no engine run', after === before, `${before} → ${after}`);
console.log(`\nafter switching to ${other}:`, await text('#tolerance'));
await page.getByRole('button', { name: new RegExp(`^Stop chasing ${other}`) }).click();
await page.waitForTimeout(800);
// G4 (FR-020): chasing reaches neither the link nor anything a run is made of.
ok('G4: the link is unchanged across chasing and stopping', (await page.evaluate(() => location.hash)) === linkBefore);
ok('stop chasing: block hidden, bands gone, no run', (await page.evaluate(() => document.getElementById('tolerance').hidden)) && (await bands()).length === 0 && (await runs()) === after);

// SC-007: IP and back, character for character.
await page.getByRole('button', { name: new RegExp(`^Chase ${STANDARD}`) }).click();
await page.waitForTimeout(800);
const si = { block: await text('#tolerance'), bands: (await bands()).join('|') };
const unitsButton = async (name) => page.locator('button, [role=radio]').filter({ hasText: new RegExp(`^${name}$`) }).first();
const ip = await unitsButton('IP');
if (await ip.count()) {
  await ip.click();
  await page.waitForTimeout(1200);
  const inIp = (await bands()).join('|');
  console.log('\nIP bands:\n  ' + (await bands()).join('\n  '));
  await (await unitsButton('SI')).click();
  await page.waitForTimeout(1200);
  ok('SC-007: SI → IP → SI is character for character', (await text('#tolerance')) === si.block && (await bands()).join('|') === si.bands);
  // Only meaningful where a band letters a unit that converts; a desk whose
  // bands are all inert or unitless (the design-days run) has nothing to show.
  const converts = /W\/m²K|m²K\/W|°C|kWh|W\/m²/.test(si.bands);
  if (converts) ok('IP letters the converting figures differently', inIp !== si.bands);
  else console.log('n/a   IP lettering: no band on this desk letters a converting unit');
} else {
  console.log('NOT RUN  SC-007: no SI/IP control found by its label');
}

// FR-021: nothing reads as a recommendation.
const words = `${await text('#tolerance')} ${(await bands()).join(' ')}`;
ok('FR-021: no "recommended", "best" or "optimal"', !/recommend|optimal|\bbest\b/i.test(words));

// 390 px: no sideways scroll with the block up.
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('390 px: no sideways scroll', overflow <= 0, `${overflow}px`);
await page.locator('#tolerance').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(SHOTS, `narrow-${STANDARD}.png`), fullPage: false });

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n(elapsed after chase ${Math.round(performance.now() - t0)} ms)`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\npage: every check passes');
process.exit(failed ? 1 : 0);
