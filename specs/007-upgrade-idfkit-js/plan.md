# Implementation Plan: Upgrade to idfkit-js v0.3.0-rc.3

**Branch**: `007-upgrade-idfkit-js` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-upgrade-idfkit-js/spec.md`

## Summary

Move the three idfkit libraries the page depends on from `0.1.0` to
`0.3.0-rc.3`, absorb what the crossing costs, and prove the building did not
move.

Phase 0 measured the crossing rather than reading about it, and it costs three
things rather than the one the upstream release notes advertise:

1. **One rename**, at seven places. The document type is now spelled
   `IdfDocument`: two lines of code in `src/model.js` (the import and the
   construction), one runnable example in the README, two prose comments in
   `src/`, the governing rule in the architecture notes, and the constitution's
   third principle. The upstream release notes advertise this crossing as two
   changed lines, which is true of the imports and wrong about the total. Four of
   the release's five breaking changes reach nothing here.
2. **Every comment shifts one column left.** An upstream fix: `commentColumn` was
   documented as a column and applied as a zero-based index. The default desk
   falls from 22,403 to 22,022 bytes and the raw diff is 898 lines, almost all of
   it whitespace. The fix is kept, and the byte-identity gate becomes a content
   gate with a one-line normalisation.
3. **Reading a type no longer registers it**, which reorders objects in the file.
   This is the risk the specification named as the one that would fail quietly,
   and it is real: with every channel engaged, `Schedule:Compact` and four other
   types change position. It is inert to the engine, and that was checked. Both
   files run to exit 0 with byte-identical `.eso` and `.mtr`.

Seven of eight desk positions are content-identical. The eighth differs only in
object order, and the engine cannot tell.

The work is therefore small and its verification is most of it. Nothing about
the model, the link format, the solve loop or the interface changes. The one
thing a reader will see is the toolkit version stamped in the header of every
IDF the page hands out.

## Technical Context

**Language/Version**: JavaScript, ES modules, no build-time type system. Browser
ES2022, plus Node 22 for the verification harnesses.

**Primary Dependencies**: `@idfkit/core` (`parseIdf`, `writeIdf`, `IdfDocument`),
`@idfkit/schemas` (the bundle behind `SchemaBundle` and `httpSource`, and
`@idfkit/schemas/node` for the harnesses), `@idfkit/weather`
(`loadStationIndex`, `fetchWeatherFiles`), all moving to `0.3.0-rc.3`.
`@idfkit/engine` and `@idfkit/engine-assets` are untouched: they come from a
different repository, carry a different version line, and `@idfkit/engine`
depends on no idfkit package, so nothing forces them. No dependency is added and
none is removed.

**Storage**: none. The desk rides the URL fragment and `localStorage`, as today.
Neither is touched.

**Testing**: no test runner exists and none is introduced. Verification is the
throwaway Node harnesses under `harness/`, which is gitignored, then EnergyPlus
26.1.0 locally, then driving the page. The Phase 0 harnesses
(`build-positions.mjs`, `compare.mjs`) are the regression check and are extended
rather than rewritten.

**Target Platform**: static site, modern browsers, EnergyPlus 26.1.0 compiled to
WebAssembly running on the reader's own machine.

**Project Type**: single-page client-side application, vanilla ES modules.

**Performance Goals**: unchanged and unmeasurable at the model layer. The
crossing adds no work to `applyModel`; if anything it removes some, since the
read path no longer allocates and stores a collection per probed type. The design
day budget of about 50 ms and the annual budget of about 0.7 s are re-measured
rather than assumed, because the schema type store grew by 140 KB and is parsed
at load.

**Constraints**: no run-time dependency may be added; exactly one copy of each
package must resolve; the cold-visit increase must stay within 200 KB; every
figure the sheet letters must still be read off the document.

**Scale/Scope**: two lines of code in `src/`, two prose comments there, one
runnable README example, two governing documents, one manifest and its lock file,
and one changelog entry. Eight desk positions in the
comparison harness, of which one exercises the reordering. The verification is
larger than the change and that is the correct ratio for this feature.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. No violations.*

| Principle | Bearing on this feature | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service is added; the libraries are the same client-side ones. The only network calls remain the site's own assets and `/onebuilding`. | Pass |
| II. Deterministic and Shareable | The load-bearing one. The pin is exact so two builds of one commit agree about what wrote the file. FR-006 requires links minted before the upgrade to be accepted whole, and nothing here touches `LINK_VERSION`, a default, a key name or a range, so no migration is owed. | Pass |
| III. Read It Back Off the Model | Untouched. No reading changes source. The rename is a spelling of the type the whole principle is written about, so the principle's own text is corrected in the same change. | Pass |
| IV. No Silent Fallbacks | Reinforced. The upgrade removes a read that mutated the document, which is the library's own version of this rule. The toolkit stamp keeps its em dash where the version cannot be read. | Pass |
| V. Only @idfkit/* at Runtime | Nothing is added. Three `@idfkit/*` packages move version. | Pass |
| VI. Latency Is the Interface | Re-measured rather than assumed, because the type store grew. Nothing reaches `params` and no output request is added. Measured on the finished work: a design day lands at a median of 50 ms over twenty consecutive solves (min 50, max 70) once the engine is warm, and an annual run at 0.61–0.66 s — both the budgets this document set. The first measurement read 220 ms and was discarded: it was taken against a dev server still re-optimising after the lockfile change, which is a fact about the measurement rather than about the libraries. | Pass, measured |
| VII. Mobile-First and Responsive | No interface change, so nothing to check beyond confirming the desk still draws. | Pass |

Quality gates 1 through 5 of the development workflow all apply and are the
substance of Phase 1's quickstart. Gate 6, the general notes in `src/tour.js`,
does **not** apply: no feature is added, no control renamed, no step's subject
moved, and nothing a note teaches has changed, so the notes stay as written and
the storage key is not bumped. Gate 8, the design system, does not apply: there
is no visual change.

## Project Structure

### Documentation (this feature)

```text
specs/007-upgrade-idfkit-js/
├── plan.md              # This file
├── research.md          # Phase 0: the three measured findings
├── data-model.md        # Phase 1: what a version pin is, and what a comparison is
├── quickstart.md        # Phase 1: how to run the gates
├── contracts/
│   └── toolkit-surface.md   # The library surface the page consumes
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output, not created by /speckit-plan
```

### Source Code (repository root)

There is no new structure. The change touches files that already exist:

```text
package.json                 # three pins moved to the exact target version
package-lock.json            # regenerated; one copy of each package
src/model.js                 # the import, the construction, and the guard's prose
src/controls.js              # one prose comment
src/describe.js              # one prose comment
README.md                    # a runnable example constructs the type by name
CLAUDE.md                    # the governing rule, and the registration note
.specify/memory/constitution.md   # Principle III names the type
CHANGELOG.md                 # one entry
harness/                     # gitignored; the Phase 0 harnesses, extended
```

**Structure Decision**: No structural change. This is a dependency move in a
single-page vanilla ES module application, and every file it touches is an
existing one. The one new directory is `harness/`, which is gitignored by
existing rule and holds the throwaway verification the constitution's quality
gates call for.

## Approach

Four movements, in this order, because each one's verification depends on the
one before it.

**1. Establish the baseline before changing anything.** Write the IDF at the
eight desk positions on `0.1.0` and keep them. This has been done in Phase 0 and
the artefacts are on disk, but the implementation repeats it from a clean install
so the baseline belongs to the commit rather than to a research session.

**2. Move the pins and take the rename.** All three packages to the exact string
`0.3.0-rc.3`, then the five uses of the document type in `src/`. The failure mode
is loud: the bundler names the file and the line. Confirm exactly one copy of
each package resolves, which is the check that catches the nested-schemas hazard
described in research Decision 5.

**3. Prove the model did not move.** Re-run the spread, compare content, run the
reordered position through EnergyPlus both ways, assert idempotence at every
position. This is the gate, and it is where the feature is either true or not.

**4. Correct the record.** The prose that explains the registration hazard now
describes a hazard that no longer exists, so the `holds()` guard and its comment
are part of the change rather than a tidy-up afterwards. The three documents and
the constitution's third principle take the new spelling. The constitution's
change is a PATCH under its own versioning policy: a correction that changes no
rule.

Then the page is driven, and the changelog gets its entry.

### What is deliberately not done

The specification's Out of Scope section holds. Neither the new weather reader
nor the new climate-zone filter is adopted, and the engine packages stay where
they are. Research Decision 6 records why: each would change what the page
computes, and folding any of them into an upgrade whose promise is that nothing
moved would make the promise unverifiable.

## Risks

| Risk | Where it shows | Mitigation |
| --- | --- | --- |
| A reordering at a desk position the eight do not cover | Nowhere, until somebody diffs two run bundles | The eight positions were chosen for what they make the appliers sweep, not for what the building looks like, and the "every channel engaged" position is the one that exercises every applier at once. The engine-level check in FR-003a is what makes an unnoticed reordering harmless rather than merely unlikely. |
| Two resolved copies of `@idfkit/schemas` | Nowhere: one bundle is staged, another is validated against, and neither end errors | An explicit resolution check is a step of the work, not an assumption. |
| The 140 KB type store slows the load past the latency budget | The design day cadence during a drag | Re-measured against the budget rather than assumed. |
| A prerelease reaches the released address | The header of every IDF a reader downloads | The pin is exact, and every non-tagged build is served on the development channel, so the upgrade is exercised at a real address before any tag is cut. |

## Complexity Tracking

> No constitution violations. This section is empty by design.
