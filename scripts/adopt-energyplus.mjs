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

function main(argv) {
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
 * This repository has no test runner, so the one rule that is not a plain
 * substitution is asserted here, by `--self-check`, without the network.
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
  console.log(`self-check passed: ${cases.length} cases`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--self-check')) selfCheck();
    else main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`adopt-energyplus: ${error.message}`);
    process.exit(1);
  }
}
