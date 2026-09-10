# Implementation Plan: Survey the design space

**Branch**: `006-design-space-survey` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-design-space-survey/spec.md`

## Summary

Give the sheet a second drawing, E-02, on which one chosen reading is surveyed over
two chosen controls, cut through the desk's current stance. The ground is built only
out of completed EnergyPlus runs; contours and relief are inference drawn between
them and are declared as such.

The technical approach rests on one finding from reading the existing scheduler:
**a survey row is already a study**. `buildSample` overlays exactly one key onto
`job.snapshot`, and `job.snapshot` is a whole desk, so a row at a fixed value of
axis Y is a job whose snapshot carries that Y and whose swept key is axis X. Nothing
in `scheduler.js` or `buildSample` has to change to measure two dimensions. The
survey is therefore a stack of study jobs sharing one queue, one pool and one sample
cache, which is what makes FR-011 (reuse what the studies already ran) and FR-053
(neither starves the other) properties of the arrangement rather than features to
be written.

Three new DOM-free modules carry the arithmetic: `survey.js` (the ground, its
coverage, its contours), `pull.js` (the ranked sensitivity at the stance), and
`relief.js` (the WebGL2 drawing, which is the only DOM-bound one). WebGL2 is used
as a platform API, adding no dependency, the way `DecompressionStream` and inline
SVG already are.

## Technical Context

**Language/Version**: Vanilla ES modules, ES2022, no transpilation. Browser targets are those supporting WebGL2 and `OffscreenCanvas`-free 2D fallback.

**Primary Dependencies**: `@idfkit/*` only. No new runtime dependency. WebGL2 and inline SVG are platform APIs, not packages.

**Baseline**: this plan is written against **`main`**, not against PR #53 (`worktree-007-upgrade-idfkit-js`, open and mergeable), which upgrades `@idfkit/core`, `@idfkit/schemas` and `@idfkit/weather` from `^0.1.0` to `0.3.0-rc.3`. The overlap was checked file by file and nothing in this plan depends on which of the two is in force; see research.md section 13. Whichever lands first, the other rebases cleanly: PR #53 touches `src/model.js`, `src/controls.js` and `src/describe.js`, and this feature touches none of those three.

**Storage**: None new. The URL fragment carries the survey's declaration; measured values are never persisted (FR-044). `localStorage` is untouched by this feature except for the general-notes storage key bump (FR-055).

**Testing**: No test runner exists. Verification is throwaway Node harnesses under the scratchpad, per the constitution's Development Workflow. The three DOM-free modules are written so the harness calls the real readers, as `readings.js`, `tm59.js` and `describe.js` already are.

**Target Platform**: Static site, browser only. EnergyPlus 26.1.0 as WebAssembly. Same CloudFront/S3 delivery, no infrastructure change.

**Project Type**: Single-project front end. Modules under `src/`, styles inline in `index.html`.

**Performance Goals**: Coarse relief legible under 5 s on a design-day desk, under 30 s with a weather file (SC-001). Live-sheet drag cadence unchanged within 10 percent while a survey fills (SC-002). The pull resolves in about 1.1 s on a design day (90 sweepable controls, one-sided differences, pool of 4 at 50 ms per run); see research.md for the annual figure and the decision it forces.

**Constraints**: No more than 60 KB added transfer on a cold visit (SC-012). New output requests stay zone or site level (FR-017, Principle VI). Every reading readable at 390 px without hover (Principle VII). The relief draws by default at full mesh on every device whose context carries it (FR-018k).

**Scale/Scope**: 18 channels, 144 control keys, of which 9 are priced and **90 are sweepable numeric faces**. A coarse ground is 5 x 5 = 25 runs; a refined one is capped at 11 x 11 = 121. The pull probes up to 90 controls. Sample cache is the existing one, `cacheLimit` 400.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Against constitution 1.0.0 on `main`, and 1.0.1 under PR #53; the amendment between them is a PATCH renaming `IDFDocument` to `IdfDocument` in the wording of Principle III, and it moves no gate, review item or constraint.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload, no compute endpoint | **PASS.** Every sample runs on the existing WASM pool. Nothing new leaves the machine. |
| II. Deterministic and Shareable | Anything changing a result rides the link; refusals are whole | **PASS with a guard.** Axes, readings, extent and stance ride a new reserved key. Measured values do not (FR-044). The camera does not (FR-044a), by the chase-pin precedent. The guard is FR-026a: see the risk below. |
| III. Read It Back Off the Model (`IdfDocument` under 0.3.0-rc.3, `IDFDocument` on `main`) | Every figure traceable to the document or the run | **PASS.** Spot heights are run readings; each sample's floor area comes from `geometryFacts` on that sample's own overlaid document, as `buildSample` already does. Contours are declared inference and are never lettered. |
| IV. No Silent Fallbacks | Throw, refuse whole, em dash for absent | **PASS.** Gaps carry reasons and are never filled (FR-016). Axis and link refusals are whole (FR-039, FR-046). Declaration errors throw at load (FR-041). |
| V. Only @idfkit/* at Runtime | No new runtime package | **PASS.** WebGL2 is a platform API and the constitution prefers platform APIs to packages, naming `DecompressionStream`, `URLSearchParams` and inline SVG as the pattern. Matrix maths and marching squares are written here, roughly 120 lines, rather than pulled from gl-matrix or d3-contour. |
| VI. Latency Is the Interface | Live sheet never queues behind sweeps; zone-level outputs only | **PASS with a change required.** The survey runs on `studyPool`, never the pump's engine. But `takeNext` drains jobs in list order, so a many-row survey enqueued ahead of a study would starve it. Round-robin dispatch is required; see Complexity Tracking. |
| VII. Mobile-First and Responsive | 390 px, no hover-only, keyboard routes, folding | **PASS with a cost.** The plan carries every reading and every gesture on its own (FR-018a). The camera is keyboard-reachable and snaps rather than animates (FR-018e, FR-018f). The relief draws at full mesh on a phone by decision (FR-018k), which is a spend rather than a violation; recorded below. |

**Result: PASS.** Two items carry into Complexity Tracking, neither of which is a violation of a principle so much as a cost this feature chose to take on knowingly.

## Constitution Check, re-evaluated after Phase 1

*Second pass, against the design in data-model.md and contracts/ rather than against
the spec.*

| Principle | Post-design verdict |
| --- | --- |
| I. Everything Runs in the Browser | **PASS, unchanged.** No artifact introduces a service. `relief.js` is a GPU draw on the reader's own machine. |
| II. Deterministic and Shareable | **PASS.** The `sv` key is specified in contracts/permalink-keys.md with the `readValue` regex trap named explicitly, since a branch below the regex would refuse every survey link as "is not a number". `LINK_VERSION` stays `v1`, `MIGRATIONS` stays empty. Gate 5 of quickstart.md is the guard on FR-026a. |
| III. Read It Back Off the Model | **PASS, strengthened by the design.** `SpotHeight` has no constructor path from interpolation, and `Contour`, `Mesh` and `Basin` are deliberately not entities, so there is no second copy of the ground to drift. |
| IV. No Silent Fallbacks | **PASS, strengthened.** `Gap` throws on an empty reason, mirroring `Reading` in `tm59.js`. `meshOf` omits any cell touching a gap, which makes "never fill a gap from a neighbour" geometric rather than remembered. `createRelief` returns `null` rather than substituting a still image. |
| V. Only @idfkit/* at Runtime | **PASS.** Marching squares and the 4x4 matrix pair are written here, roughly 120 lines, replacing d3-contour and gl-matrix. Bicubic interpolation was rejected partly because it overshoots and would invent a hollow no run measured. |
| VI. Latency Is the Interface | **PASS, with the change now specified.** Round-robin `takeNext` is in the source tree list and in Complexity Tracking, and quickstart.md gate 7 measures SC-002 against it. No new `Output:Variable` is requested at all, which discharges FR-017 outright. |
| VII. Mobile-First and Responsive | **PASS, with the cost now itemised.** contracts/relief-module.md forbids the relief being the only carrier of any reading, gesture or refusal, forbids coarsening by viewport, and requires a keyboard route for every camera move. The layout threshold is declared once in the stylesheet and read back, per research.md section 12. |

**Result: PASS.** No new violation surfaced in design. The four entries in Complexity
Tracking are unchanged, and three of the four are consequences of clarifications the
reader chose rather than of the implementation.

## Project Structure

### Documentation (this feature)

```text
specs/006-design-space-survey/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output: module contracts
│   ├── survey-module.md
│   ├── pull-module.md
│   ├── relief-module.md
│   └── permalink-keys.md
├── checklists/          # empty; /speckit-checklist fills it
└── tasks.md             # /speckit-tasks output, NOT created here
```

### Source Code (repository root)

```text
src/
├── survey.js        NEW  the ground: grid, coverage, interpolation, contours. DOM-free, engine-free.
├── pull.js          NEW  ranked sensitivity at the stance. DOM-free, engine-free.
├── relief.js        NEW  the WebGL2 oblique drawing. DOM-bound, the only new module that is.
├── scheduler.js     EDIT round-robin dispatch in `takeNext` so a survey cannot starve a study.
├── study.js         EDIT export the axis-eligibility predicate the survey shares with studies.
├── controls.js      EDIT nothing structural; the survey reads existing declarations. Untouched by this feature, which is why PR #53's edit to it cannot conflict.
├── permalink.js     EDIT one new reserved key, its codec branch above the numeric regex, its assertion.
├── console.js       EDIT the survey's entry point and its per-axis offers in the plan-key legends.
├── main.js          EDIT wire the survey to the existing scheduler, the stance, the commit path, E-02's render.
├── readings.js      EDIT nothing expected; the reading roster is reused unchanged.
└── tour.js          EDIT NOTES gain the survey step; bump `shoebox-general-notes-v2`.

index.html           EDIT E-02's markup and its inline styles, including one new layout threshold.
.interface-design/system.md  EDIT record the survey's component patterns in the same change.
CHANGELOG.md         EDIT one entry, house voice.
CLAUDE.md            EDIT an architecture section for the survey.
```

**Structure Decision**: Single project, no new directory. The three new modules sit beside `study.js`, `scheduler.js` and `readings.js` because they are the same kind of thing: DOM-free arithmetic that the Node harness can call directly. `relief.js` is the exception and is deliberately the only DOM-bound new file, so that everything testable is testable without a browser.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Round-robin dispatch in `scheduler.js`, replacing strict job-order `takeNext` | FR-053 requires that a survey and any number of studies share the pool without either starving the other. A survey enqueues many jobs at once; under the current `for (const job of jobs)` walk, job 1 drains completely before job 2 starts, so a 11-row survey would hold the whole pool for its entire duration and a study queued behind it would appear frozen. | Enqueuing the survey at the back of the queue was rejected: it inverts the problem, leaving the survey frozen behind studies instead. Giving the survey its own pool was rejected because it doubles peak memory against a 256 MB per-instance heap and, worse, splits the sample cache in two, which forfeits FR-011 outright. |
| A smooth interpolated relief (clarified 2026-09-09) rather than a faceted one | Chosen for legibility. | A faceted surface would have reported its own sample density in its texture, so coverage would have been something the reader sees. The smooth surface cannot do that, so FR-018i makes the coverage and density figures load bearing: they become the only thing separating a coarse survey from a convincing picture of one. This is a real transfer of honesty from the drawing to the lettering and must not be softened later as cosmetic. |
| The relief draws by default, at full mesh, on a 390 px phone (clarified 2026-09-09) | Chosen so no reader is handed a surface that appears to know less than somebody else's. | Opt-in below the index breakpoint, or a coarsened mesh, were both rejected by decision. The cost is that a GPU surface starts unasked beside a resident 28 MB engine and a 256 MB heap, so the relief's own budget is tight and is stated as a constraint rather than discovered later. |
| Asserting engine repeatability (clarified 2026-09-09) rather than measuring a noise floor | The engine is deterministic on one input, so every measured difference is real and SC-005 admits no tolerance. | The pool recycles instances (`idle.push`/`idle.pop` in `pool.js`), and CLAUDE.md records a warm-session reading of 512 hours against a cold 511. That drift is instance state, not the engine, but it is reachable from this feature. FR-026a and SC-005a therefore make it a guarded property rather than an assumption: two runs of one design must agree exactly, and a disagreement is surfaced as a fault, not averaged away. |
