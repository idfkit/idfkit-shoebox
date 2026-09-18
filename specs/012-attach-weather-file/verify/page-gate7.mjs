/**
 * Gate 7's other half, and gate 8's part-year rows — driven in a real browser.
 *
 * Everything in this directory but this file is DOM-free. The criteria's
 * *lettering* is not: gate 7 asks that each criterion's absence be readable
 * without opening a fold, and "in view rather than in a fold" is a question about
 * rendered markup that no Node harness can answer. So this one drives the built
 * page.
 *
 * It needs two things this repository does not carry:
 *
 *     npm run build && npx vite preview --port 4173     # the page
 *     npm i playwright                                  # in a scratch directory
 *
 * and a Chromium. This environment has one staged under `PLAYWRIGHT_BROWSERS_PATH`
 * and no matching Playwright download, so the executable is passed explicitly and
 * `SHOEBOX_CHROME` overrides it. Run from the repository root:
 *
 *     SHOEBOX_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *       node specs/012-attach-weather-file/verify/page-gate7.mjs
 *
 * Over *synthetic* files, for the reason `fixtures.mjs` sets out at length. What
 * it proves is that the sheet letters what it read; it proves nothing about a
 * bought file.
 */
import { epw, epwWholeYear, STATIONS } from './fixtures.mjs';
import { harness } from './kit.mjs';

const AT = process.env.SHOEBOX_PAGE ?? 'http://localhost:4173/';
const CHROME = process.env.SHOEBOX_CHROME ?? undefined;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('gate 7, driven — NOT RUN: playwright is not installed. See the head of this file.');
  process.exit(0);
}

const h = harness('gate 7, driven — the criteria and the period, lettered');
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(AT, { waitUntil: 'networkidle' });
// The engine compiles before anything can be solved, and the first design-day
// run narrates itself into the same row everything below is read from.
await page.waitForFunction(() => /solved locally/.test(document.getElementById('status')?.textContent ?? ''), null, {
  timeout: 120000,
});

const text = (id) => page.evaluate((i) => document.getElementById(i)?.textContent?.trim() ?? null, id);

/**
 * Attaches a file, and hands back every sentence the status row held while it
 * landed.
 *
 * Polling cannot see the attach sentence. `attachClimate` writes it and then
 * calls `markStale`, which on a desk whose shape the attach changed replaces it
 * with *Model changed — solving when you let go* inside the same task, and the
 * solve's own narration follows. That ordering is correct — the run is the newer
 * news — and it means the sentence has to be recorded rather than read. One entry
 * per observer callback, so synchronous writes within one task collapse to the
 * last of them, which is exactly what a reader sees.
 */
const attach = async (name, body) => {
  await page.evaluate(() => {
    const el = document.getElementById('status');
    window.__said = [el.textContent.trim()];
    window.__watch?.disconnect();
    window.__watch = new MutationObserver(() => window.__said.push(el.textContent.trim()));
    window.__watch.observe(el, { childList: true, subtree: true, characterData: true });
  });
  await page.setInputFiles('#site-file', { name, mimeType: 'text/plain', buffer: Buffer.from(body, 'utf8') });
  await page.waitForTimeout(6000);
  const said = await page.evaluate(() => window.__said);
  return { said, last: said.at(-1) ?? '' };
};

const station = STATIONS.london;
const YEAR = epwWholeYear(station);
const SUMMER = epw({ station, from: { month: 6, day: 1 }, to: { month: 8, day: 31 }, startDay: 'Monday' });
const SPRING = epw({ station, from: { month: 1, day: 1 }, to: { month: 4, day: 30 }, startDay: 'Monday' });

/* ── a whole hourly year ──────────────────────────────────────────────── */

// Attached twice on purpose. The first attach turns Design days from Run to Skip,
// which makes the desk stale, and `markStale` takes the row — so the attach
// sentence of the *first* file a session sees is never read by anybody. The
// second attach changes no setting, so its sentence stands, which is the state
// this assertion is about.
await attach('luton-first.epw', YEAR);
const first = await attach(
  'luton-year.epw',
  epw({ station, from: { month: 1, day: 1 }, to: { month: 12, day: 31 }, startDay: 'Monday' }),
);
h.ok('the attach sentence letters the run', /the run covers 8,760 hours/.test(first.said.join(' ')), first.last);
const yearSub = await text('site-sub');
h.ok('the sub-line letters the extent it read', /whole year/.test(yearSub ?? ''), yearSub);
h.ok('and the degree days say they were measured', /measured from this file/.test(yearSub ?? ''));

/* ── a part year, against a whole-year calendar ───────────────────────── */

const summer = await attach('luton-summer.epw', SUMMER);
h.ok('a part-year file is admitted rather than refused', !/cannot be used/.test(summer.said.join(' ')), summer.last);
const summerSub = await text('site-sub');
h.ok('the sub-line letters 1 Jun – 31 Aug', /1 Jun – 31 Aug/.test(summerSub ?? ''), summerSub);
h.ok('and the degree days are a stated absence', /92 of the 365 days/.test(summerSub ?? ''));
h.ok(
  'the calendar it cannot cover is refused, naming the extent',
  /carries 1 Jun – 31 Aug, and this run asks for months outside that/.test(summer.last),
  summer.last,
);
h.ok('and no engine fatal reaches the sheet', !/GetNextEnvironment|Program terminates/.test(summer.said.join(' ')));

/* ── a file that reaches no part of the assessment period ─────────────── */

await attach('luton-spring.epw', SPRING);
// The months refusal stops auto-solve, exactly as the design-days one does, so
// the run below is asked for by hand — which is what the reader does too.
await page.click('#desk-open');
await page.waitForTimeout(500);
for (let month = 4; month <= 11; month += 1) {
  await page
    .locator('.ctl-calendar .month')
    .nth(month)
    .evaluate((cell) => cell.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
}
await page.waitForTimeout(600);
await page.click('#run');
await page.waitForFunction(
  () => /solved locally|could not|cannot/.test(document.getElementById('status')?.textContent ?? ''),
  null,
  { timeout: 180000 },
);
await page.waitForTimeout(3000);
const narrowed = await text('status');
h.ok('a calendar narrowed to the file solves', /solved locally/.test(narrowed ?? ''), narrowed);

const lettered = await page.evaluate(() => {
  const want = 'attach a file reaching 1 May to 30 September';
  const hits = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    if (!(el.textContent ?? '').includes(want)) continue;
    const fold = el.closest('details');
    hits.push({ tag: el.tagName, folded: Boolean(fold) && !fold.open });
  }
  return hits;
});
h.ok('each criterion names a file rather than the Run strip', lettered.length > 0, `${lettered.length} cells`);
h.ok('and says it in view rather than in a fold', lettered.length > 0 && lettered.every((hit) => !hit.folded));
const runStrip = await page.evaluate(() =>
  [...document.querySelectorAll('*')].some(
    (el) => el.children.length === 0 && (el.textContent ?? '').includes('run some of May to September'),
  ),
);
h.ok('the Run strip sentence is not shown beside it', runStrip === false);

/* ── the qualifications, which are gate 7's other lettering ───────────── */
//
// Opened first, and deliberately. The criteria's absences are refusals and are in
// view, which is what the two assertions above check; a qualification is method
// and a citation, and the house convention puts those in a fold. So the fold is
// expanded here rather than asserted open — what gate 7 asks of these two is that
// they print the file's own words beside WFR:2026 and assert no relation, not that
// they stand on the first screen.

await page.evaluate(() => {
  for (const fold of document.querySelectorAll('details')) fold.open = true;
});
await page.waitForTimeout(400);

const qualified = await page.evaluate(() => {
  const said = document.body.innerText;
  return {
    said,
    declares: /GBR/.test(said),
    requirement: /WFR:2026/.test(said),
    noRelation: /(no relation|cannot read|does not state|is not a claim)/i.test(said),
    localTime: /daylight saving/i.test(said),
  };
});
h.ok(
  'the weather qualification prints what the file declares',
  qualified.declares,
  qualified.said.match(/[^\n]*GBR[^\n]*/)?.[0]?.slice(0, 140),
);
h.ok('beside the requirement WFR:2026 states', qualified.requirement);
h.ok('and asserts no relation between the two', qualified.noRelation);
h.ok('the local-time qualification is lettered', qualified.localTime);

h.ok('no page error throughout', errors.length === 0, errors.join(' | '));

h.notRun(
  'the same lettering over a licensed CIBSE DSY1',
  'the proxy denies climate.onebuilding.org (CONNECT 403) and a DSY is purchased, so no real file exists here',
);
h.notRun(
  'attaching while a study and a survey are both in flight',
  'both need a driven study, which is minutes of engine time per sample',
);

await browser.close();
h.done();
