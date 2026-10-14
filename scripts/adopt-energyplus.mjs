/**
 * Move this repository to one EnergyPlus release.
 *
 *   node scripts/adopt-energyplus.mjs X.Y.Z
 *   node scripts/adopt-energyplus.mjs X.Y.Z --assets X.Y.N
 *
 * The `adopt-energyplus` workflow runs this as the `release-constant` step of
 * the version roster in idfkit-conformance. It can also be run by hand.
 *
 * WHAT MOVES
 *
 *   1. `ENERGYPLUS_VERSION` in `src/version.js`, to the full release.
 *   2. The `@idfkit/engine-assets` pin in `package.json` and
 *      `package-lock.json`, to the newest published version of the release
 *      line. That package's version names the EnergyPlus release it carries,
 *      and its patch number counts rebuilds of the same release, so the newest
 *      patch of the line is the current build of the release.
 *   3. The `version_identifier` literal in `src/model.js`, to the release line.
 *
 * WHAT DOES NOT MOVE
 *
 *   The engine's file name. `vite.config.js` reads it from the installed
 *   `@idfkit/engine-assets` at build time, so it follows the pin.
 *
 *   The `@idfkit/core`, `@idfkit/schemas` and `@idfkit/weather` level.
 *   `bump-idfkit-js.yml` moves it. The page cannot load the schema of a release
 *   the installed `@idfkit/schemas` does not carry, and this script does not
 *   check that: `scripts/write-models.mjs` fails on it.
 *
 * WHAT THE RELEASE MUST BE
 *
 *   A release that upstream published: a release of the GitHub repository
 *   NatLabRockies/EnergyPlus that is neither a draft nor a prerelease and whose
 *   tag is exactly `vX.Y.Z`. A version of `@idfkit/engine-assets` has the same
 *   form and is not one: 26.1.2 is the third build of EnergyPlus 26.1.0, and
 *   upstream never released 26.1.2. Nothing in this repository tells the two
 *   apart, so the list is read from GitHub on every run, with `GH_TOKEN` or
 *   `GITHUB_TOKEN` when either is set. When the list cannot be read, the script
 *   exits 1: it does not proceed unvalidated.
 *
 * ORDER AND FAILURE
 *
 *   Every precondition is checked before anything is written. When no version
 *   of `@idfkit/engine-assets` is published for the release line, the script
 *   exits 1 and leaves the working tree as it found it. A second run on a tree
 *   that already carries the release changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = '@idfkit/engine-assets';
const UPSTREAM = 'NatLabRockies/EnergyPlus';
// One request. One page of 100 reaches back to the 8.2 line, which is older
// than any release this project supports; a release older than the page is
// refused as unknown.
const UPSTREAM_RELEASES = `https://api.github.com/repos/${UPSTREAM}/releases?per_page=100`;

/** A refusal with a message for the person or the workflow log. */
class Refusal extends Error {}

/** An EnergyPlus release, as `X.Y.Z`. */
class Release {
  constructor(text) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text ?? '');
    if (!match) throw new Refusal(`'${text ?? ''}' is not a release of the form X.Y.Z.`);
    this.full = text;
    this.line = `${match[1]}.${match[2]}`;
    Object.freeze(this);
  }
}

/** One literal in one file: the pattern that finds it and the value it takes. */
class Literal {
  constructor({ path, pattern, value }) {
    this.path = path;
    this.pattern = pattern;
    this.value = value;
    Object.freeze(this);
  }

  /** The file's text as read and with the literal moved. Refuses unless it occurs exactly once. */
  #moved() {
    const before = readFileSync(resolve(ROOT, this.path), 'utf8');
    const found = [...before.matchAll(this.pattern)];
    if (found.length !== 1) {
      throw new Refusal(
        `${this.path}: expected exactly one match of ${this.pattern}, found ${found.length}.`,
      );
    }
    const [match] = found;
    const start = match.index + match[0].indexOf(match[1]);
    const after = before.slice(0, start) + this.value + before.slice(start + match[1].length);
    return { before, after };
  }

  /** The precondition alone: refuses unless the literal occurs exactly once. Writes nothing. */
  check() {
    this.#moved();
  }

  /** Write the moved text. Returns whether the file changed. */
  apply() {
    const { before, after } = this.#moved();
    if (before === after) return false;
    writeFileSync(resolve(ROOT, this.path), after);
    return true;
  }
}

/** The published versions of the assets package, as the registry lists them. */
function publishedAssets() {
  const listed = JSON.parse(
    execFileSync('npm', ['view', ASSETS, 'versions', '--json'], { cwd: ROOT, encoding: 'utf8' }),
  );
  return Array.isArray(listed) ? listed : [listed];
}

/**
 * The newest published build of a release line. Prereleases are not candidates.
 * `listed` is injected by the self-check below.
 */
export function newestOfLine(line, listed) {
  const patches = listed
    .map((version) => /^(\d+\.\d+)\.(\d+)$/.exec(version))
    .filter((match) => match && match[1] === line)
    .map((match) => Number(match[2]));
  return patches.length ? `${line}.${Math.max(...patches)}` : null;
}

function assetsFor(release, stated) {
  const listed = publishedAssets();
  if (stated) {
    if (!stated.startsWith(`${release.line}.`) || !listed.includes(stated)) {
      throw new Refusal(
        `${ASSETS}@${stated} is not a published version of the ${release.line} line.`,
      );
    }
    return stated;
  }
  const newest = newestOfLine(release.line, listed);
  if (!newest) {
    throw new Refusal(
      `No ${ASSETS} version is published for EnergyPlus ${release.line}. ` +
        `Published: ${listed.join(', ')}. Nothing was changed. ` +
        'Run this again once idfkit-engine has published the assets of the release.',
    );
  }
  return newest;
}

/**
 * Whether the manifest and the lockfile both state the version. A manifest
 * that was moved by hand leaves the lockfile behind, and `npm ci` then fails.
 */
function pinned(assets) {
  const read = (name) => JSON.parse(readFileSync(resolve(ROOT, name), 'utf8'));
  return (
    read('package.json').dependencies?.[ASSETS] === assets &&
    read('package-lock.json').packages?.[`node_modules/${ASSETS}`]?.version === assets
  );
}

/** One release object of the upstream repository, reduced to what the rule reads. */
class UpstreamRelease {
  constructor({ tag_name, draft, prerelease }) {
    this.tag = String(tag_name ?? '');
    this.draft = draft === true;
    this.prerelease = prerelease === true;
    Object.freeze(this);
  }
}

/** The decision on a release argument: accepted, or refused with a message. */
class Verdict {
  constructor({ accepted, message = null }) {
    this.accepted = accepted;
    this.message = message;
    Object.freeze(this);
  }
}

/**
 * The versions upstream released, as `X.Y.Z`, in the order listed. A draft, a
 * prerelease and a tag that is not exactly `vX.Y.Z` are not releases.
 */
export function releasedVersions(upstream) {
  return upstream
    .filter((entry) => !entry.draft && !entry.prerelease)
    .map((entry) => /^v(\d+\.\d+\.\d+)$/.exec(entry.tag))
    .filter(Boolean)
    .map((match) => match[1]);
}

/**
 * Whether `full` is an upstream release. `released` is the output of
 * `releasedVersions`, injected by the self-check below. A refusal names the
 * releases of the same MAJOR.MINOR line, when there are any, as the probable
 * intention.
 */
export function judgeRelease(full, released) {
  if (released.includes(full)) return new Verdict({ accepted: true });
  const line = full.split('.').slice(0, 2).join('.');
  const ofLine = released.filter((version) => version.startsWith(`${line}.`));
  const intention = ofLine.length
    ? `The ${line} line has ${ofLine.length === 1 ? 'the upstream release' : 'the upstream releases'} ` +
      `${ofLine.join(', ')}: ${ofLine.length === 1 ? 'that is' : 'one of those is'} probably what was meant. ` +
      `The PATCH number of ${ASSETS} counts rebuilds of one release and is not an EnergyPlus release; ` +
      'state it with --assets.'
    : `No upstream release is on the ${line} line.`;
  return new Verdict({
    accepted: false,
    message: `${full} is not a release of ${UPSTREAM}. ${intention} Nothing was changed.`,
  });
}

/** The release objects of the upstream repository. Refuses when they cannot be read. */
async function upstreamReleases() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const unread = (cause) =>
    new Refusal(
      `The releases of ${UPSTREAM} could not be read (${cause}), so the release cannot be validated. ` +
        'Nothing was changed.',
    );
  let response;
  try {
    response = await fetch(UPSTREAM_RELEASES, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'idfkit-shoebox-adopt-energyplus',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw unread(error.cause?.message ?? error.message);
  }
  if (!response.ok) throw unread(`HTTP ${response.status} ${response.statusText}`.trim());
  let listed;
  try {
    listed = await response.json();
  } catch (error) {
    throw unread(`the response is not JSON: ${error.message}`);
  }
  if (!Array.isArray(listed)) throw unread('the response is not a list');
  return listed.map((entry) => new UpstreamRelease(entry ?? {}));
}

/** The command line: one release, and the assets version when it is stated. */
class Arguments {
  constructor(argv) {
    const flag = argv.indexOf('--assets');
    const positional = argv.filter((_, index) => flag === -1 || (index !== flag && index !== flag + 1));
    const unknown = positional.find((word) => word.startsWith('-'));
    if (unknown) throw new Refusal(`'${unknown}' is not an option. The only option is --assets X.Y.N.`);
    if (positional.length > 1) throw new Refusal(`Expected one release, found ${positional.length}.`);
    this.stated = flag === -1 ? null : argv[flag + 1];
    if (flag !== -1 && (!this.stated || this.stated.startsWith('-'))) {
      throw new Refusal('--assets takes a version, as X.Y.N.');
    }
    this.release = new Release(positional[0]);
    Object.freeze(this);
  }
}

async function main(argv) {
  const { release, stated } = new Arguments(argv);

  const literals = [
    new Literal({
      path: 'src/version.js',
      pattern: /ENERGYPLUS_VERSION = '(\d+\.\d+\.\d+)'/g,
      value: release.full,
    }),
    new Literal({
      path: 'src/model.js',
      pattern: /version_identifier: '(\d+\.\d+)'/g,
      value: release.line,
    }),
  ];
  // Every refusal happens here, before the first write.
  for (const literal of literals) literal.check();
  const verdict = judgeRelease(release.full, releasedVersions(await upstreamReleases()));
  if (!verdict.accepted) throw new Refusal(verdict.message);
  const assets = assetsFor(release, stated);

  // `npm install` and not an edit of the manifest: the lockfile carries the
  // version and its integrity, and the build that follows needs the package
  // installed. It is a no-op on a tree that already pins and holds the version.
  if (pinned(assets)) {
    console.log(`${ASSETS} is already pinned to ${assets}`);
  } else {
    execFileSync('npm', ['install', '--save-exact', `${ASSETS}@${assets}`], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log(`${ASSETS} pinned to ${assets}`);
  }
  for (const literal of literals) {
    console.log(`${literal.path}: ${literal.apply() ? `moved to ${literal.value}` : 'already current'}`);
  }
}

/**
 * This repository has no test runner, so the rules that are not a plain
 * substitution are asserted here, by `--self-check`, without the network.
 */
function selfCheck() {
  const listed = ['9.4.0', '9.4.1', '9.5.0', '9.5.2', '9.5.10', '9.6.0-rc.1'];
  const cases = [
    ['9.5', '9.5.10'],
    ['9.4', '9.4.1'],
    ['9.6', null],
    ['.5', null],
  ];
  for (const [line, expected] of cases) {
    const actual = newestOfLine(line, listed);
    if (actual !== expected) throw new Error(`newestOfLine(${line}) gave ${actual}, expected ${expected}`);
  }

  const upstream = [
    { tag_name: 'v9.6.0', draft: false, prerelease: false },
    { tag_name: 'v9.6.0-RC1', draft: false, prerelease: true },
    { tag_name: 'v9.5.0-WithFix', draft: false, prerelease: false },
    { tag_name: 'v9.5.0', draft: false, prerelease: false },
    { tag_name: 'v9.4.0', draft: true, prerelease: false },
    { tag_name: 'v9.3.1', draft: false, prerelease: true },
    { tag_name: '9.2.0', draft: false, prerelease: false },
    { tag_name: 'v9.0.1', draft: false, prerelease: false },
    { tag_name: 'v9.0.0', draft: false, prerelease: false },
    {},
  ].map((entry) => new UpstreamRelease(entry));
  const released = releasedVersions(upstream);
  const expectedReleased = '9.6.0 9.5.0 9.0.1 9.0.0';
  if (released.join(' ') !== expectedReleased) {
    throw new Error(`releasedVersions gave ${released.join(' ')}, expected ${expectedReleased}`);
  }
  // Each case: the argument, whether it is accepted, and what a refusal must and must not say.
  const verdicts = [
    ['9.6.0', true, [], []],
    ['9.0.0', true, [], []],
    ['9.6.2', false, ['9.6.2 is not a release', 'upstream release 9.6.0', 'Nothing was changed'], []],
    ['9.0.3', false, ['upstream releases 9.0.1, 9.0.0'], []],
    ['9.4.0', false, ['No upstream release is on the 9.4 line'], ['probably']],
    ['9.3.1', false, ['No upstream release is on the 9.3 line'], ['probably']],
    ['9.2.0', false, ['No upstream release is on the 9.2 line'], ['probably']],
    ['19.6.0', false, ['No upstream release is on the 19.6 line'], ['probably']],
  ];
  for (const [full, accepted, says, omits] of verdicts) {
    const verdict = judgeRelease(full, released);
    const wrong =
      verdict.accepted !== accepted ||
      (accepted ? verdict.message !== null : false) ||
      says.some((text) => !verdict.message.includes(text)) ||
      omits.some((text) => verdict.message.includes(text));
    if (wrong) throw new Error(`judgeRelease(${full}) gave ${JSON.stringify(verdict)}`);
  }
  if (judgeRelease('9.6.0', []).accepted) throw new Error('judgeRelease accepted against an empty list');
  console.log(`self-check passed: ${cases.length + 1 + verdicts.length + 1} cases`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--self-check')) selfCheck();
    else await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`adopt-energyplus: ${error.message}`);
    process.exit(1);
  }
}
