/**
 * What build of the sheet this is, resolved at build time and lettered into the
 * title block's revision cell.
 *
 * A drawing carries its revision because a reading is only worth arguing with
 * when you know which issue of the drawing produced it, and this page is
 * deployed from `main` far more often than it is tagged. So the stamp is read
 * off the source rather than declared by hand, under one rule:
 *
 *   - HEAD carries a tag  ->  `0.2.0`, the release's own name and nothing else;
 *   - anything else       ->  `0.1.0+cd5881e`, the version being worked toward
 *                             with the commit that was built.
 *
 * The `+` is semver's build metadata, which is exactly what a sha is: the same
 * declared version, this particular build of it. It is ignored for precedence
 * by the specification, so a stamp never claims to be a release it is not.
 *
 * `git` is asked first and the CI environment second, because the environment
 * is the one thing that knows what a checkout cannot: `GITHUB_SHA` on a
 * `pull_request` event is the merge commit, which is not a commit anyone
 * reviewing the preview can find, so `preview.yml` passes the head sha in
 * `SHOEBOX_SHA` and it wins over both. When neither can answer, the build
 * metadata reads `unknown` rather than being dropped — a stamp with no sha
 * means "tagged release", and a build that simply could not read its own
 * revision must not pass for one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** One git command, or null. A tarball with no `.git` is a build, not a fault. */
function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The stamp, as the plain object `vite.config.js` freezes into the bundle and
 * `src/version.js` reads back.
 */
export function revision() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  // `--exact-match` and not plain `describe`: a tag five commits back describes
  // the last release, not this build, and the distinction is the whole point of
  // the sha. Note that CI checkouts are shallow — `fetch-tags: true` in both
  // workflows is what puts the tag within reach of this call.
  const tag =
    git('describe', '--tags', '--exact-match', 'HEAD') ??
    (process.env.GITHUB_REF_TYPE === 'tag' ? (process.env.GITHUB_REF_NAME ?? null) : null);

  const commit = process.env.SHOEBOX_SHA || git('rev-parse', 'HEAD') || process.env.GITHUB_SHA || null;
  const date = git('log', '-1', '--format=%cd', '--date=short');

  // Only ever true on someone's desk; a CI checkout is clean by construction,
  // and the staged engine assets are gitignored so `prebuild` cannot dirty one.
  // Worth saying out loud all the same: a stamp that named a commit whose code
  // is not what was built is the one lie this file exists to prevent.
  const dirty = Boolean(git('status', '--porcelain'));

  const short = commit ? commit.slice(0, 7) : null;
  const version = tag
    ? tag.replace(/^v/, '')
    : `${pkg.version}+${short ?? 'unknown'}${dirty ? '.dirty' : ''}`;

  // A tag that disagrees with the version in the manifest is a release cut
  // without the bump, which is worth noticing but not worth failing a deploy
  // over: the tag is the release's name whatever `package.json` says.
  if (tag && tag.replace(/^v/, '') !== pkg.version) {
    console.warn(`revision: tag ${tag} does not match package.json ${pkg.version}`);
  }

  // The tag is kept whole alongside the version it produced: `v0.2.0` reads as
  // `0.2.0` on the sheet but is `v0.2.0` in the release URL, and a link built
  // from the stripped name would 404 on exactly the builds that have one.
  return { version, tag: tag ?? null, commit, date: date || null };
}
