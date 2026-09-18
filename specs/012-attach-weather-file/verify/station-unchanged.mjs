/**
 * T021 / T084 — the refactor changed nothing about the station path.
 *
 * `choose()` was split so that a picked station and an attached file both end at
 * one `attachClimate`. That is the change in this feature with the most reach and
 * the least direct coverage: nothing about it is visible in the interface, and its
 * failure mode is not a crash but a station that writes a slightly different
 * document than it used to.
 *
 * Three claims, and they are answerable to different degrees here:
 *
 * 1. **What reaches the document is unchanged.** `setDesignConditions` was split
 *    into `setSiteLocation` and the design-day half, and `clearDesignDays` was
 *    added beside them. Given the same parsed design conditions, the IDF must come
 *    out byte-identical to the one `main` writes. Runnable: `main` is checked out
 *    into a worktree and its own `src/model.js` is imported and run.
 * 2. **What the description reads is unchanged.** Every field the old call sites
 *    took off `station.*` — `wmo`, `state`, `country`, `ashraeClimateZone`,
 *    `hdd18`, `cdd10`, `url` — must come back off the `WeatherSource`. Runnable,
 *    over a synthetic archive.
 * 3. **Three real stations, byte-identical, fetched from onebuilding.** NOT
 *    RUNNABLE here: the agent proxy denies climate.onebuilding.org outright, and
 *    the `/onebuilding` origin the page uses is a rewrite of that host rather than
 *    a second source of the data. This is the dozen lines between a successful
 *    archive download and `attachClimate` that `README.md` records as unexercised.
 *
 * Run from the repository root after `npm run predev`:
 *
 *     node specs/012-attach-weather-file/verify/station-unchanged.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The serializer, from the one place there is: `@idfkit/core` is the governed
// package and both checkouts resolve to this repository's copy of it, so the
// comparison is between two callers of one writer rather than two writers.
import { writeIdf } from '@idfkit/core';

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS } from '../../../src/controls.js';
import { designConditionsFrom } from '../../../src/model.js';
import { sourceFromStation } from '../../../src/source.js';
import { periodCovered } from '../../../src/epw.js';
import { ddyValid, epwWholeYear, STATIONS } from './fixtures.mjs';
import { ROOT, harness, idfFor, loadSchema } from './kit.mjs';

const h = harness('T084 — the station path, unchanged by the refactor');
const schema = await loadSchema();

/* ── 1. the document ──────────────────────────────────────────────────── */
//
// `main` is imported rather than described. A harness that restated what the old
// `setDesignConditions` did would be asserting its own paraphrase, which is the
// one thing a regression gate must not do: the paraphrase cannot regress.
//
// The worktree goes inside the repository — `.claude/worktrees/` is gitignored —
// so that Node's resolution of `@idfkit/core` walks up into this checkout's
// `node_modules`. Under /tmp it would not, and every import would fail for a
// reason that has nothing to do with the claim.

const WORKTREE = path.join(ROOT, '.claude/worktrees/t084-main');
const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

let mainModel = null;
let why = null;
if (!fs.existsSync(WORKTREE)) {
  const made = git('worktree', 'add', '--detach', WORKTREE, 'main');
  if (made.status !== 0) why = (made.stderr || made.stdout).trim().split('\n').at(-1);
}
if (!why) {
  try {
    mainModel = await import(pathToFileURL(path.join(WORKTREE, 'src/model.js')).href);
  } catch (error) {
    why = error.message;
  }
}

const conditions = designConditionsFrom(ddyValid(schema), schema);
const params = { ...DEFAULT_PARAMETERS, sizingPeriods: 'Yes' };
const here = idfFor({ schema, params, bypass: DEFAULT_BYPASS, annual: true, conditions });

if (mainModel) {
  // Built with `main`'s own modules, by the same three calls `kit.mjs` makes, so
  // the only difference between the two texts can be the code that wrote them.
  const before = (() => {
    const doc = mainModel.buildModel(schema, params, DEFAULT_BYPASS);
    mainModel.setDesignConditions(doc, mainModel.designConditionsFrom(ddyValid(schema), schema));
    mainModel.setAnnual(doc, true);
    mainModel.applyModel(doc, params, DEFAULT_BYPASS, { reporting: 'sheet' });
    return writeIdf(doc);
  })();
  h.ok(
    'a station desk writes byte-identical IDF to the one main writes',
    before === here,
    before === here ? '' : firstDifference(before, here),
  );
  h.ok('and it is not trivially empty', here.length > 10000, `${here.length} bytes`);
} else {
  h.notRun('the IDF against the one main writes', `main could not be imported — ${why}`);
}

/* ── 2. the description ───────────────────────────────────────────────── */
//
// Every field the pre-refactor call sites read straight off the index row. A
// synthetic archive answers this completely: none of these is a measurement, they
// are a copy, and what is being asserted is that the copy is faithful.

const fixture = STATIONS.london;
// The shape the picker hands over, which is `asIndexed()`'s in `weather.js`: the
// index itself is snake_case on disk and camelCase by the time it reaches a call
// site. Built here rather than imported because `weather.js` resolves its index
// against `import.meta.env.BASE_URL` and is a `TypeError` the moment Node
// evaluates it — the reason `source.js` does not import it either.
// `assertStationsMatchIndex()` is what keeps the fixture's own figures honest
// against the staged index; this is only the renaming.
const station = {
  city: fixture.city,
  state: fixture.region,
  country: fixture.country,
  wmo: fixture.wmo,
  latitude: fixture.latitude,
  longitude: fixture.longitude,
  timezone: fixture.timeZone,
  elevation: fixture.elevation,
  ashraeClimateZone: fixture.ashraeZone,
  hdd18: fixture.publishedHdd18,
  cdd10: fixture.publishedCdd10,
  url: fixture.indexUrl,
};
const archive = { epw: epwWholeYear(fixture), ddy: ddyValid(schema) };
const source = sourceFromStation(station, archive, '2009–2023');

h.ok('the WMO number survives as a string, leading zeros and all', source.place.wmo === station.wmo, String(source.place.wmo));
h.ok('the state becomes the region the tariffs are keyed on', source.place.region === station.state, String(source.place.region));
h.ok('the country comes through', source.place.country === station.country, String(source.place.country));
h.ok(
  'the ASHRAE zone is the index label, whole',
  source.climateZone === station.ashraeClimateZone,
  String(source.climateZone),
);
h.ok(
  'the published degree days are published, and say so',
  source.degreeDays.hdd18 === station.hdd18 &&
    source.degreeDays.cdd10 === station.cdd10 &&
    source.degreeDays.measured === false &&
    source.degreeDays.reason === null,
  `${source.degreeDays.hdd18} / ${source.degreeDays.cdd10}`,
);
h.ok(
  'the bundle stem is the archive name with .zip stripped',
  source.stem === station.url.split('/').pop().replace(/\.zip$/i, ''),
  source.stem,
);
h.ok('a station carries no fingerprint', source.fingerprint === null);
h.ok(
  'the period comes off the archive EPW',
  source.period.from.month === 1 && source.period.to.month === 12 && source.period.perHour === 1,
  JSON.stringify(source.period),
);
h.ok(
  'and it is the same answer periodCovered gives directly',
  JSON.stringify(source.period) === JSON.stringify(periodCovered(archive.epw)),
);
h.ok(
  'a station with no archive URL is refused rather than half-built',
  (() => {
    try {
      sourceFromStation({ ...station, url: '' }, archive, '2009–2023');
      return false;
    } catch {
      return true;
    }
  })(),
);

/* ── 3. three real stations ───────────────────────────────────────────── */

const reachable = (() => {
  const probe = spawnSync('curl', ['-sS', '-m', '20', '-o', '/dev/null', '-w', '%{http_code}', 'https://climate.onebuilding.org/'], {
    encoding: 'utf8',
  });
  return { ok: probe.stdout?.trim() === '200', why: (probe.stderr || probe.stdout || '').trim() };
})();

if (reachable.ok) {
  h.notRun(
    'three picked stations, byte-identical',
    'the network is open here, so this gate is now runnable — fetch the three archives through ' +
      "`weatherFor` in the page and compare each desk's IDF against main's",
  );
} else {
  h.notRun(
    'three picked stations fetched from onebuilding, each byte-identical to main',
    `climate.onebuilding.org is not reachable: ${reachable.why}. This leaves the dozen lines between a ` +
      'successful archive download and attachClimate unexercised — designConditionsFrom over a real DDY, ' +
      'and sourceFromStation being handed it',
  );
}
h.notRun(
  'SC-003, a hand-attached TMYx file against the same station picked from the list',
  'it cannot be approximated — a synthetic file has no station in the list to be identical to',
);

/* ── tidy ─────────────────────────────────────────────────────────────── */
//
// The worktree is removed on the way out rather than left for the next run to
// find: a stale checkout of `main` that has since moved on would compare against
// a commit nobody asked about, and would do it silently.
if (fs.existsSync(WORKTREE)) git('worktree', 'remove', '--force', WORKTREE);

h.done();

/** Where two IDFs first part company, so a failure names a line. */
function firstDifference(a, b) {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
    if (left[at] !== right[at]) return `line ${at + 1}: main "${left[at] ?? '—'}" vs here "${right[at] ?? '—'}"`;
  }
  return 'the texts differ in length only';
}
