/**
 * A study beside a survey of the same lever, on the reader's own link.
 *
 * Reported from the page: a study of wall resistance, opened beside a survey of
 * wall resistance and infiltration with the desk standing on a survey row,
 * chased against Passivhaus Classic, read
 *
 *   "Passivhaus Classic is not judged at this setting. Passes from 6.57 m²K/W
 *    (at 6.08 m²K/W this run carried no Peak heating load) to 6.57 m²K/W (...):
 *    move +0.01 m²K/W (0 % of travel). Also passes from 4.61 m²K/W to
 *    4.61 m²K/W, kept apart. [...] The finer pass found a stretch the coarse
 *    pass stepped over."
 *
 * Every coarse position of the study was answered from the survey's samples,
 * which were built carrying TEDI alone, so each read as a gap and split the band
 * into single points. This drives that link and asserts the band is whole: no
 * position reads as carrying nothing, no stretch is split, no stepped-over claim,
 * and the setting is judged. Then it moves the lever off the sweep's grid and
 * asserts the setting is judged by the desk's own run, not left "not judged".
 *
 * Needs the network: the link names a station (725090, Boston Logan), fetched
 * through the preview's `/onebuilding` proxy.
 *
 * Serve the build first:  npm run build && npx vite preview --port 4173
 * Then:                   node specs/016-tolerance-bands/verify/page-survey-shared.mjs
 */
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const AT = process.env.SHOEBOX_PAGE ?? 'http://localhost:4173/';
const LINK =
  'v1&wwrN=0.19&wwrS=0.6&uFactor=0.8&shgc=0.5&visT=0.7&wallR=6.56&roofR=6.527&internalMass=4&infiltration=0' +
  '&roomType=One+bed+living+room&activity=130&lighting=2' +
  '&occPattern=0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.750%2C0.000%2C0.000' +
  '&equipPattern=0.233%2C0.233%2C0.233%2C0.233%2C0.233%2C0.233%2C0.233%2C0.233%2C0.233%2C0.400%2C0.400%2C0.400%2C0.400%2C0.400%2C0.400%2C0.400%2C0.400%2C0.400%2C1.000%2C1.000%2C1.000%2C1.000%2C0.400%2C0.400' +
  '&lightPattern=0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C0.000%2C1.000%2C1.000%2C1.000%2C1.000%2C1.000%2C0.000' +
  '&coolSet=25&outdoorAir=8.5&heatRecovery=0.75&sizingPeriods=No&in=air&in=gains&in=system&stn=725090' +
  '&sty=demand.wallR&sv=wallR*infiltration*tedi*0.2_10*0_3';
const STANDARD = 'Passivhaus Classic';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) failed += 1;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.addInitScript(() => localStorage.setItem('shoebox-units-v1', 'si'));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`${AT}#${LINK}`, { waitUntil: 'networkidle' });
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', sel);
const bandLine = () => page.evaluate(() => document.querySelector('.study-band')?.textContent.trim() ?? '');

// The station's year must be what was solved, not the design days before it.
await page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 300000 });

async function settle(ms = 1800000) {
  const until = Date.now() + ms;
  let last = -1;
  let still = 0;
  while (Date.now() < until) {
    const busy = await page.evaluate(() => [...document.querySelectorAll('.study-wait')].some((n) => /Solving/.test(n.textContent)));
    const n = Number(await text('#runs'));
    still = !busy && n === last ? still + 1 : 0;
    last = n;
    if (still >= 10) return n;
    await page.waitForTimeout(1000);
  }
  throw new Error('the study and the survey never settled');
}
const runs = await settle();
console.log(`settled after ${runs} engine runs`);

await page.getByRole('button', { name: new RegExp(`^Chase ${STANDARD}`) }).click();
await page.waitForTimeout(1500);
const line = await bandLine();
console.log(`\n#chase: ${await text('#chase')}`);
console.log(`band: ${line}`);
console.log(`block: ${(await text('#tolerance')).replace(/ Method.*$/, '')}\n`);

ok('a band line under the wall resistance card', line.length > 0);
ok('no position reads as carrying nothing', !/carried no/.test(line), line);
ok('no stretch is a single point split from the rest', !/from (\S+ m²K\/W) to \1/.test(line) && !/kept apart/.test(line), line);
ok('no stepped-over claim', !/stepped over/.test(line));
ok('the setting is judged', !/not judged at this setting/.test(line));
const runsAfterChase = Number(await text('#runs'));
ok('chasing started no run', runsAfterChase === runs, `${runs} → ${runsAfterChase}`);

// Off the grid: 6.56 → 6.585 sits between two sweep positions. Moving the
// studied lever moves no rest shape, so the curve stays and is not re-swept;
// the desk re-solves, and that run judges the setting.
const field = page.getByRole('textbox', { name: /^Wall resistance value/ }).first();
if (await field.count()) {
  await field.click();
  await field.fill('6.585');
  await field.press('Enter');
  await page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 300000 });
  await page.waitForTimeout(2500);
  const moved = await bandLine();
  console.log(`\nat 6.585: ${moved}`);
  ok('off the grid, the setting is judged by the desk’s own run', /by the desk’s own run/.test(moved) && !/not judged at this setting/.test(moved), moved);
} else {
  console.log('NOT RUN  off-grid check: no wall resistance field found by its label');
  failed += 1;
}

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nshared survey and study: every check passes');
process.exit(failed ? 1 : 0);
