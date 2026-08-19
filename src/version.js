/**
 * The build's revision, read back off the literal `vite.config.js` froze in.
 *
 * Which build of the sheet a reading came off is a fact about that reading, so
 * it belongs on the sheet — in the title block's revision cell, where a drawing
 * has always carried it — and in the run bundle's manifest, beside the
 * EnergyPlus version, since a bundle exists to be re-run and argued with months
 * later.
 *
 * `typeof` rather than a bare reference: the throwaway Node harnesses this
 * repository is verified with import `src/` modules directly, with no Vite and
 * therefore no substitution, and an undeclared identifier would throw at module
 * load and take the harness down before it built anything. Outside a build the
 * fields are null, which every reader already treats as an em dash.
 */
const stamp = typeof __SHEET_REVISION__ === 'undefined' ? null : __SHEET_REVISION__;

/**
 * `version` is `0.2.0` on a tagged release and `0.2.0+cd5881e` on everything
 * else; see `scripts/revision.mjs` for why. `commit` is the full sha, because
 * the seven characters shown are for reading and the forty are for linking.
 */
export const REVISION = Object.freeze({
  version: stamp?.version ?? null,
  tag: stamp?.tag ?? null,
  commit: stamp?.commit ?? null,
  date: stamp?.date ?? null,
});

const REPOSITORY = 'https://github.com/idfkit/idfkit-shoebox';

/**
 * Where the revision came from, so the stamp can be clicked through to the
 * source that produced it: a release for a tag, a commit for a sha. Null when
 * the build could not read its own revision — the cell then states the version
 * without offering a link that would 404.
 */
export function revisionHref() {
  if (REVISION.tag) return `${REPOSITORY}/releases/tag/${encodeURIComponent(REVISION.tag)}`;
  if (REVISION.commit) return `${REPOSITORY}/commit/${REVISION.commit}`;
  return null;
}
