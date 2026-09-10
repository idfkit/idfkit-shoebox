# Phase 1: Quickstart and validation

**Feature**: Upgrade to idfkit-js v0.3.0-rc.3 | **Date**: 2026-09-09

How to run the gates this feature is judged by. The order matters: the baseline
has to exist before anything is changed, because it cannot be reconstructed
afterwards without reinstalling the old libraries.

## Prerequisites

- Node 22 and npm.
- EnergyPlus 26.1.0 at `/Applications/EnergyPlus-26-1-0` for gates 3 and 4. On a
  machine without it, the staged WebAssembly engine runs the same models under
  Node; see CLAUDE.md, "Verifying changes".
- A checkout with nothing uncommitted, so a comparison attributes a difference to
  the upgrade rather than to work in progress.
- The two harnesses are committed beside this file, under
  `specs/007-upgrade-idfkit-js/verify/`, and are run from there. That is a
  departure from the repository's usual arrangement, where a verification harness
  is throwaway and `harness/` is gitignored, and it is deliberate: this feature's
  whole claim is a comparison across two installs, so the thing that makes the
  comparison has to survive the commit that makes the claim. Copy them into
  `harness/` if you would rather iterate on them without dirtying the tree.

## Gate 0: take the baseline, before touching anything

```bash
npm install
SHOEBOX_ROOT="$PWD" OUT_DIR=/tmp/shoebox-base node specs/007-upgrade-idfkit-js/verify/build-positions.mjs
```

Expected: eight positions, each reporting a byte count and a type count, and no
position reporting `NOT IDEMPOTENT` or `THREW`. On `0.1.0` every position reports
**69 types**, because the old read path registered every type any applier swept.
That saturation is the artefact about to disappear, and seeing it is how you know
the baseline is the old behaviour.

Keep `/tmp/shoebox-base`. Everything after this compares against it.

## Gate 1: move the pins, and resolve exactly one of each

Move the three pins in `package.json` to the exact string `0.3.0-rc.3`, then:

```bash
npm install
npm ls @idfkit/core @idfkit/schemas @idfkit/weather
```

Expected: each package listed once, at `0.3.0-rc.3`, with no nested duplicate
underneath another. A second copy of `@idfkit/schemas` is the failure that
reports nothing at either end: the staged bundle and the bundle the parser reads
would be different builds.

## Gate 2: the rename, which fails loudly

```bash
npm run build
```

Expected before the rename: the build stops, naming the file and the line.

```
src/model.js (1:9): "IDFDocument" is not exported by
  "node_modules/@idfkit/core/dist/index.js", imported by "src/model.js".
```

Expected after: a clean build. Then confirm nothing was missed, including the
prose and the runnable README example:

```bash
grep -rn "IDFDocument" --include="*.js" --include="*.md" . \
  | grep -v node_modules | grep -v "specs/" | grep -v CHANGELOG.md \
  | grep -v "constitution.md"
```

Expected: no output. Three places keep the old spelling on purpose, because
each records what was true when it was written rather than asserting what is
true now: everything under `specs/`, the changelog, and the Sync Impact Report
at the head of `.specify/memory/constitution.md`, which names the superseded
type in stating what the amendment corrected. Principle III's own text — the
part of that file which does assert — is checked by reading it. This feature's
specification and contract deliberately name both spellings, which is why the
whole `specs/` directory is excluded rather than the earlier features alone.

The path filters are written without a `./` prefix deliberately: GNU and BSD
`grep -r .` disagree about whether they emit one, and a `^./specs/` pattern
silently matches nothing on the half that does not — which reads as a clean
gate while excluding nothing at all.

## Gate 3: the model did not move

```bash
SHOEBOX_ROOT="$PWD" OUT_DIR=/tmp/shoebox-new node specs/007-upgrade-idfkit-js/verify/build-positions.mjs
node specs/007-upgrade-idfkit-js/verify/compare.mjs /tmp/shoebox-base /tmp/shoebox-new
```

Expected, and this is the gate the feature turns on:

- Every position: `RAW DIFFERS`. This is the corrected comment column and is not
  a failure.
- Every position: `content same`. **Any position reporting `CONTENT DIFFERS` is a
  failure** and must be understood before going further.
- `07-everything-in`: `ORDER DIFFERS`, which is expected and sends you to gate 4.
  The other seven should report `order same`.
- Type counts fall from a uniform 69 to between 28 and 45, which is the
  registration change showing itself.
- No position reports `NOT IDEMPOTENT`.

## Gate 4: the engine cannot tell

For every position that reported `ORDER DIFFERS`:

```bash
/Applications/EnergyPlus-26-1-0/energyplus -d /tmp/run-base -r /tmp/shoebox-base/07-everything-in.idf
/Applications/EnergyPlus-26-1-0/energyplus -d /tmp/run-new  -r /tmp/shoebox-new/07-everything-in.idf
cmp /tmp/run-base/eplusout.eso /tmp/run-new/eplusout.eso
cmp /tmp/run-base/eplusout.mtr /tmp/run-new/eplusout.mtr
tail -1 /tmp/run-base/eplusout.err
tail -1 /tmp/run-new/eplusout.err
```

Expected: both exit 0, both `cmp` silent, and the two error summaries reporting
the same warning and severe counts. Measured in Phase 0: 1 warning, 0 severes,
identical result files.

Then the standing gate from the constitution, on the new libraries: run each
written IDF through schema validation and the integrity check, and grep
`eplusout.err` for "requested but not generated".

## Gate 5: the cold visit

```bash
npm run build
du -sk public/schemas
ls -l public/schemas/types.json.gz public/schemas/docs.json.gz
```

Expected: `types.json.gz` at about 919 KB, up from about 779 KB, which is the
roughly 140 KB a reader pays. `docs.json.gz` at about 175 KB, staged and
deployed and never fetched, because nothing on this page calls `loadProse()`.
The total under the 200 KB budget in FR-010.

## Gate 6: drive the page

```bash
npm run dev
```

Then, in order, because each step is a note the onboarding records and a path the
upgrade could have broken:

1. Drag a sheet slider and watch the plate re-letter. A design day should still
   land in roughly 50 ms once the engine is warm; if it does not, the type
   store's growth is the first suspect.
2. Open the console, patch a channel in and out, confirm the strip states change
   and the drawing follows.
3. Attach a weather station. This is the only path exercising
   `loadStationIndex` and `fetchWeatherFiles`, and it crosses the `/onebuilding`
   proxy.
4. Run a year. Roughly 0.7 s. Confirm the bill, the results schedule and the
   scoreboard all letter.
5. Open a study on any swept control and let it densify.
6. Copy the link, open it in a fresh tab, and confirm the desk comes back.
7. **Open a link minted before the upgrade** and confirm it is accepted whole.
   This is FR-006 and it is the one step no harness covers.
8. Download the run bundle. Confirm the IDF header and the manifest both name
   `0.3.0-rc.3`.

## Gate 7: the record

- `CHANGELOG.md` has an entry, short and in the house voice.
- `CLAUDE.md`'s governing rule and its note on type registration say what is now
  true. The registration note describes a hazard that no longer exists and is
  the one piece of prose in this repository the upgrade actually falsifies.
- `.specify/memory/constitution.md` Principle III names the type correctly, with
  the version line and the amended date moved. This is a PATCH under the
  document's own policy: a correction that changes no rule.
- The general notes in `src/tour.js` are **not** touched and the storage key is
  **not** bumped. No feature is added, no control renamed, no step's subject
  moved. Confirm this deliberately rather than by omission.
