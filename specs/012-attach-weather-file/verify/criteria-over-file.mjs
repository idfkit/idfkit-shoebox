/**
 * Quickstart gate 7 — the five TM59 criteria over an attached file.
 *
 * Over *synthetic* files (see `fixtures.mjs` for why), so what this proves is
 * that the criteria are read off whatever hours are in front of them and refuse
 * themselves by name where the file has not got the hours. What it cannot prove
 * is anything about a licensed CIBSE DSY1, which is the file the whole feature
 * exists for; that gate is recorded not-run at the foot.
 *
 * Four files, one run each (`runIdf` spawns a process per run, so the loop is
 * safe — `main` is not re-entrant and `runOnce` would hand back the previous
 * run's ESO):
 *
 *   - a whole year, which every criterion can be read over;
 *   - a part year cut to 1 June – 31 August, which reaches the season but not the
 *     23 April seed of the comfort line;
 *   - a year cut to 1 January – 30 April, which reaches neither;
 *   - the whole year again with the calendar narrowed to June–August, which is
 *     the control: the comfort line must come out **identical** to the whole
 *     year's, because it is computed from the file rather than from the run.
 *
 * Run from the repository root after `npm run predev`:
 *
 *     node specs/012-attach-weather-file/verify/criteria-over-file.mjs
 */
import { DEFAULT_BYPASS, DEFAULT_PARAMETERS, TM59_SPACES } from '../../../src/controls.js';
import { PROFILE_IDS } from '../../../src/tm59.data.js';
import { occupiedFloor } from '../../../src/model.js';
import {
  ABSENCE,
  CATEGORIES,
  CRITERIA,
  SEASON,
  clearedCount,
  coversSeason,
  readCriterionA,
  readCriterionB,
  readCriterionC,
  runningMean,
} from '../../../src/tm59.js';
import { dailyMeansCarried, monthsCovered, periodCovered } from '../../../src/epw.js';
import { degreeDaysOf } from '../../../src/source.js';
import { parseESO } from '@idfkit/engine';
import { epw, epwWholeYear, STATIONS } from './fixtures.mjs';
import { errSummary, harness, idfFor, loadSchema, runIdf } from './kit.mjs';

const h = harness('gate 7 — the five criteria over an attached file');
const schema = await loadSchema();

/* ── the declaration, before anything is read off a run ───────────────── */

// `schemes.js` asserts this at load and it is asserted again here, because the
// two lists being one list is what makes a TM59 room type selectable at all: a
// space in the method's table with no profile behind it would letter a schedule
// nobody wrote.
h.ok(
  'TM59_SPACES is still PROFILE_IDS',
  TM59_SPACES === PROFILE_IDS && TM59_SPACES.join() === PROFILE_IDS.join(),
  TM59_SPACES.join(', '),
);

// Every published threshold, in one place, so a harness run after an edit says
// which number moved rather than which reading changed. These are TM59:2026's
// own: 3 % of occupied hours for a and c, four nights for b, 3 % for d, and the
// two fixed night lines 26 °C and 27 °C.
const LIMITS = { a: 3, b: 4, c: 3, d: 3 };
for (const criterion of CRITERIA) {
  h.ok(
    `criterion ${criterion.id}'s limit is still ${LIMITS[criterion.id]}`,
    criterion.limit === LIMITS[criterion.id],
    String(criterion.limit),
  );
}
h.ok("criterion c's line is still a fixed 26 °C", CRITERIA.find((c) => c.id === 'c').threshold === 26);
h.ok(
  'the night lines are still 26 and 27 °C',
  CATEGORIES.map((c) => c.nightLimit).join() === '26,27',
  CATEGORIES.map((c) => `${c.label} ${c.nightLimit}`).join(' · '),
);
h.ok(
  'the period is still 1 May to 30 September, 153 days, seeded from 23 April',
  SEASON.from.month === 5 && SEASON.to.month === 9 && SEASON.days === 153 &&
    SEASON.seedFrom.month === 4 && SEASON.seedFrom.day === 23,
);

/* ── the files ────────────────────────────────────────────────────────── */

const station = STATIONS.london;
const FILES = {
  year: epwWholeYear(station),
  summer: epw({ station, from: { month: 6, day: 1 }, to: { month: 8, day: 31 }, startDay: 'Monday' }),
  spring: epw({ station, from: { month: 1, day: 1 }, to: { month: 4, day: 30 }, startDay: 'Monday' }),
};

/** The whole `{ mean, absence }` pair the sheet hands its readers, never the line. */
const meanFor = (text) => {
  try {
    return { mean: runningMean(dailyMeansCarried(text)), absence: null };
  } catch (error) {
    return { mean: null, absence: `the adaptive line cannot be built from this weather file — ${error.message}` };
  }
};

/** Every criterion this run can answer, as `readTm59` assembles them. */
const criteriaOf = (eso, params, text) => {
  const trm = meanFor(text);
  const floor = occupiedFloor(params);
  const readings = [];
  for (const category of CATEGORIES) {
    readings.push(readCriterionA(eso, trm, category, floor));
    readings.push(readCriterionB(eso, category));
  }
  readings.push(readCriterionC(eso, floor));
  return readings;
};

/** The sheet's own override: a file that cannot reach the period says so. */
const overFileExtent = (readings, text) =>
  coversSeason(periodCovered(text))
    ? readings
    : readings.map((r) => (r.absence === ABSENCE.season ? { ...r, absence: ABSENCE.fileSeason } : r));

/**
 * Gains patched in, which is not a detail: `applyGains` writes the hourly
 * `Occupancy` schedule series, and criteria a and c divide by the hours the
 * engine actually saw rather than by a schedule read back in JavaScript. On the
 * shipped desk Gains is bypassed, so every one of them would come back as
 * *patch Gains in* and the harness would be asserting the wrong absence.
 */
const BYPASS = Object.freeze({ ...DEFAULT_BYPASS, gains: false });

/** One run, against one file, with the calendar the file can actually carry. */
const solve = (text, months = monthsCovered(periodCovered(text))) => {
  const params = { ...DEFAULT_PARAMETERS, months, sizingPeriods: 'No' };
  const run = runIdf({ idf: idfFor({ schema, params, bypass: BYPASS, annual: true }), epw: text });
  if (!run.eso) throw new Error(`no ESO came back: ${errSummary(run.err).join(' | ')}`);
  // The readers take a parsed ESO, the way the sheet's own do: `runIdf` hands
  // back the file's text because a process boundary carries text and nothing
  // else, and parsing it here is the same `parseESO` `solve` calls.
  const eso = parseESO(run.eso);
  return { params, run, readings: overFileExtent(criteriaOf(eso, params, text), text) };
};

const named = (readings, id, category = null) =>
  readings.find((r) => r.criterion.id === id && (category === null || r.category?.label === category));

/* ── a whole year: every criterion readable ───────────────────────────── */

const year = solve(FILES.year);
h.ok('the whole year runs', /EnergyPlus Completed Successfully/.test(year.run.err ?? ''), errSummary(year.run.err).join(' | '));
h.ok(
  'all five criteria come back with a value',
  year.readings.length === 5 && year.readings.every((r) => r.value !== null),
  year.readings.map((r) => `${r.criterion.id}${r.category ? ` ${r.category.label}` : ''}=${r.absence ?? r.value}`).join(' · '),
);
h.ok('and the count reads over all five', clearedCount(year.readings).unread.length === 0);
h.ok(
  'the coverage is the whole 153 days',
  year.readings.find((r) => r.coverage)?.coverage.days === SEASON.days,
  String(year.readings.find((r) => r.coverage)?.coverage.days),
);
const yearLine = meanFor(FILES.year).mean;
h.ok('the comfort line is seeded from the file', yearLine !== null && Number.isFinite(yearLine.seed), String(yearLine?.seed));

/* ── the control: the same file, a June-to-August calendar ────────────── */
//
// The whole reason the comfort line is read off the weather file rather than off
// the run. Off the run, July would have 30 days of history behind it here and 181
// in the year above, and the line would move under a calendar the reader thought
// only narrowed what was reported.

const narrowed = solve(FILES.year, '000001110000');
const narrowedLine = meanFor(FILES.year).mean;
h.ok(
  'a narrowed calendar does not move the comfort line',
  narrowedLine.seed === yearLine.seed &&
    [...narrowedLine.byDay.keys()].every((day) => narrowedLine.byDay.get(day) === yearLine.byDay.get(day)),
);
h.ok(
  'and the criteria still read, over the days the run reached',
  narrowed.readings.every((r) => r.value !== null),
  narrowed.readings.map((r) => `${r.criterion.id}=${r.absence ?? r.value}`).join(' · '),
);
h.ok(
  'over fewer than the 153 days, and saying so',
  narrowed.readings.find((r) => r.coverage)?.coverage.days < SEASON.days,
  String(narrowed.readings.find((r) => r.coverage)?.coverage.days),
);

/* ── a part year reaching the season but not the seed ─────────────────── */

const summerPeriod = periodCovered(FILES.summer);
h.ok('1 Jun – 31 Aug does not reach the assessment period', coversSeason(summerPeriod) === false);
const summer = solve(FILES.summer);
h.ok('a part-year file runs', /EnergyPlus Completed Successfully/.test(summer.run.err ?? ''), errSummary(summer.run.err).join(' | '));
const summerA = named(summer.readings, 'a', 'Category I');
h.ok(
  'criterion a refuses, naming 23 April rather than computing over a shortened line',
  summerA.value === null && /23 Apr/.test(summerA.absence ?? ''),
  summerA.absence,
);
h.ok(
  'criteria b and c still read — their thresholds are fixed',
  named(summer.readings, 'b', 'Category I').value !== null && named(summer.readings, 'c').value !== null,
  `b=${named(summer.readings, 'b', 'Category I').value} · c=${named(summer.readings, 'c').value}`,
);
h.ok(
  'and the degree days are a stated absence rather than a mild year',
  degreeDaysOf(dailyMeansCarried(FILES.summer)).hdd18 === null &&
    /92 of the 365 days/.test(degreeDaysOf(dailyMeansCarried(FILES.summer)).reason ?? ''),
  degreeDaysOf(dailyMeansCarried(FILES.summer)).reason,
);

/* ── a file that reaches no part of the season ────────────────────────── */

const spring = solve(FILES.spring);
h.ok('a 1 Jan – 30 Apr file runs', /EnergyPlus Completed Successfully/.test(spring.run.err ?? ''), errSummary(spring.run.err).join(' | '));
h.ok(
  'every criterion is absent',
  spring.readings.every((r) => r.value === null),
  spring.readings.map((r) => `${r.criterion.id}=${r.absence}`).join(' · '),
);
h.ok(
  'and the season ones name a file rather than the Run strip',
  spring.readings.some((r) => r.absence === ABSENCE.fileSeason),
  spring.readings.map((r) => r.absence).join(' · '),
);
h.ok(
  'the Run strip sentence is not used, because its months are already ticked',
  spring.readings.every((r) => r.absence !== ABSENCE.season),
);
h.ok(
  'nothing is counted over the weeks that happened to be in there',
  clearedCount(spring.readings).read === 0,
  `read ${clearedCount(spring.readings).read}, unread ${clearedCount(spring.readings).unread.length}`,
);

/* ── what this environment cannot answer ──────────────────────────────── */

h.notRun(
  'every criterion over a licensed CIBSE DSY1 — the file this feature exists for',
  'the proxy denies climate.onebuilding.org (CONNECT 403) and a DSY is purchased, so no real file exists here',
);
h.notRun(
  'the criteria lettered on the page, in view and not in a fold',
  'that is gate 7’s other half and needs a browser; it is driven by page-gate7.mjs',
);

h.done();
