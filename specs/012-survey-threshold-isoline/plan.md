# Implementation Plan: Threshold isoline on the survey

**Branch**: `012-survey-threshold-isoline` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-survey-threshold-isoline/spec.md`

## Summary

Draw each published pass/fail limit belonging to the reading E-02 has cut the ground
for as its own isoline across that ground, with the ground on its passing side picked
out, on **both** the plan and the relief; state the absence in words where the reading
carries none. The limits already exist as `Target` declarations on the presets in
`src/schemes.js` and are already lettered on the scoreboard — this feature reads the
same declarations and draws them, so a line can never disagree with its row (FR-009).

The threshold isoline is a contour: `contoursOf(lattice, [limit])` is the identical
marching-squares call the ordinary contours already make, over the identical masked
lattice, so FR-004 (shading stops at measured ground) and FR-006 (both drawings agree)
are properties of the arrangement rather than features — the geometry over unsurveyed
ground is never generated, exactly as it is never generated for a contour.

Nothing here reaches the IDF, the link, `shapeKey`, or the engine. No run is started
and no `Output:*` is added. The whole feature is a reading of declarations the page
already holds, drawn on a ground the page already has.

## Technical Context

**Language/Version**: vanilla ES modules (ES2022), no transpiler; Node 22 for harnesses

**Primary Dependencies**: none added. Existing `@idfkit/*` only; the drawing is inline
SVG (plan) and the hand-written WebGL2 in `src/relief.js`

**Storage**: N/A — thresholds are derived on every draw and remembered nowhere. Chase
state is the existing module-level `chased` in `src/main.js`, deliberately off the link

**Testing**: no test runner. Throwaway Node harnesses under the scratch directory
against the DOM-free modules (`survey.js`, `schemes.js`, `study.js`), then the page is
driven. See `quickstart.md`

**Target Platform**: static site, the reader's own browser; WebGL2 where the relief draws

**Project Type**: single-page client-side application, `src/*.js` + `index.html`

**Performance Goals**: the survey's draw budget is unchanged. One extra `contoursOf`
pass per threshold over an 11 × 11 lattice (≤ 3 thresholds today) is arithmetic on 121
doubles; the relief gains one uniform and one branch per fragment. No new engine run

**Constraints**: no hue may be spent (design system: `--redline` is the markup pen,
`--cold`/`--warm` are for signed physical quantities, and no hue may be added for a
category), so the threshold line and its band are told apart by drafting — weight,
dash signature, hatch angle — and by words in the key. Readable at 390 px. Nothing on
hover only

**Scale/Scope**: 13 survey readings; 7 of them carry at least one threshold, 6 carry
none. 3 thresholds is the largest set any one reading carries (TEDI: Passivhaus 15,
EnerPHit 25, LETI 15 — two of them coincident)

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. No violations, so
Complexity Tracking below is empty.*

| Principle | How this feature stands against it |
| --- | --- |
| I. Everything runs in the browser | No request, no service, no persistence. Thresholds are declarations already compiled into the page. **Pass** |
| II. Deterministic and shareable | Nothing reaches the IDF or the link. What is drawn is a pure function of the plotted reading, the measured lattice and the existing `chased` value; `chased` stays out of the permalink for the reason it already does — it is how the desk is being read, not what it is. `LINK_VERSION` is untouched. **Pass** |
| III. Read it back off the model | Every drawn limit is the `Target` instance itself, held by reference and never copied into a second number, so the isoline and the scoreboard row are one declaration (FR-009). The pass side is *probed* from `Target.meets` rather than restated. The heights the line is cut through are the measured lattice. **Pass** |
| IV. No silent fallbacks | A reading with no applicable limit draws nothing and **says so**, in view, naming why (FR-005/FR-014). A target whose `limit` is null (climate- or building-specific) is an absence with its own reason, never a guess. A declaration that cannot be matched — wrong kind, a `needs` the reading cannot satisfy, an inconsistent pass side — throws at module load naming both sides. **Pass** |
| V. Only `@idfkit/*` at runtime | No dependency added. Marching squares, the hatch and the shader branch are all already here. **Pass** |
| VI. Latency is the interface | No engine run, no new output variable, no change to `shapeKey`. Added work is one contour pass per threshold per draw. Chase toggling re-draws through the existing `renderSurveySoon`, which is frame-coalesced. **Pass** |
| VII. Mobile-first and responsive | The line carries its own label on the drawing and every threshold is stated in words in the ground key, which is already the drawing's on-sheet legend. Nothing is on hover. Verified at 390 px. **Pass** |

Workflow gates that apply (Development Workflow and Quality Gates):

- Gate 5, **declaration invariants throw at module load**: four new assertions
  (kind agreement, `needs` implication, pass-side consistency, qualifier match for
  `overheat`'s `above` and TM59's `category`). This is the substance of the feature's
  correctness and is listed as its own task group.
- Gate 6, **the general notes are part of done**: the E-02 step in `src/tour.js` now
  teaches something it did not — that the ground separates passing from failing — so
  `NOTES` is updated and `STORE` bumped `shoebox-general-notes-v4` → `-v5`.
- Gate 8, **interface changes go through the design system**: the threshold line's
  signature and the band's hatch are a new component pattern and are recorded in
  `.interface-design/system.md` in the same change, under the existing
  "A surveyed ground" and "Measuring against somebody else's number" sections.
- Gates 1–3 (model verification, idempotence, IDF validation) **do not apply**: no path
  in this feature reaches `applyModel` or the document. Gate 4 (codec round trip) does
  not apply: no key is added. That is asserted rather than assumed by the
  `shapeKey`/permalink check in `quickstart.md`.

## Project Structure

### Documentation (this feature)

```text
specs/012-survey-threshold-isoline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── thresholds.md    # Phase 1 output: the module contract and the load-time invariants
├── checklists/
│   └── requirements.md  # written by /speckit-checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── survey.js        # + Threshold, ThresholdSet, thresholdsFor, passingGround,
│                    #   thresholdLevels; the load-time assertions. DOM-free.
├── schemes.js       # unchanged declarations; may export a small accessor for the
│                    #   targets a metric carries, so survey.js does not walk PRESETS itself
├── main.js          # drawGround: the isoline, its label, the band, the suppressed
│                    #   coincident contour; renderGroundKey: an entry per threshold and
│                    #   the absence sentence; surveyAriaLabel; drawRelief: hands the
│                    #   relief its threshold lines and bands; the chase click handler
│                    #   calls renderSurveySoon()
├── relief.js        # draw({ thresholds }) — level lines on the surface, and the
│                    #   passing band as a screen-space stipple in the fragment shader
└── tour.js          # the E-02 note's body, and STORE bumped to -v5

index.html           # .ground .threshold / .threshold-label / .passing styles and the
                     #   second hatch pattern, beside the existing .contour and .improving

.interface-design/
└── system.md        # the new pattern recorded in the same change
```

**Structure Decision**: the existing single-project layout is kept exactly. The
arithmetic goes in `src/survey.js` because that is where `Reading`, `SENSE`,
`improvingRegion` and `contoursOf` already live and it is DOM-free, so a Node harness
drives the real code. `src/main.js` and `src/relief.js` draw and letter it; neither
decides anything. `survey.js` gains one import of `src/schemes.js`, which introduces no
cycle — `study.js` already imports `PRESETS` from it and `schemes.js` imports neither.

## Phase 0 — Research

Complete. See [research.md](./research.md). Eleven decisions, all resolved; no
NEEDS CLARIFICATION remains. The load-bearing ones:

- **A threshold is a `Target`, held by reference** — the line, the label and the
  scoreboard row read one object (FR-009).
- **The pass side is probed, not declared a second time.** `Target.meets` is the
  single published comparator and every target on this sheet passes at or below its
  limit; probing it either side of the limit reads that fact off the declaration
  instead of restating it, and the probe disagreeing with itself is a load-time throw.
- **The isoline is a contour of the same lattice**, which is what makes the two
  drawings agree and the unsurveyed ground stay unshaded structurally.
- **Two standards can publish the same figure** (TEDI: Passivhaus 15 and LETI 15) —
  one line, labelled with both, one band. This is real today, not an edge case.
- **A coincident ordinary contour is suppressed** so there is exactly one line at that
  level, which is what US2 scenario 2 asks for.
- **The plotted reading is `readings[0]` only.** A second reading's limit is a level on
  a surface that is not drawn.

## Phase 1 — Design & Contracts

Complete.

- [data-model.md](./data-model.md) — `Threshold`, `ThresholdSet`, `PassingGround`, the
  matching rule, and the four invariants that throw at load.
- [contracts/thresholds.md](./contracts/thresholds.md) — the module surface added to
  `src/survey.js` and the drawing contract `main.js` and `relief.js` hold to.
- [quickstart.md](./quickstart.md) — the Node harness and the driven-page checks that
  stand in for the tests this repository does not have, mapped to FR and SC.

**Constitution re-check after design**: unchanged, all seven pass. The design adds no
dependency, no network path, no IDF field, no link key and no engine run; it adds four
throws at module load and one new drawn pattern recorded in the design system.

## Complexity Tracking

No Constitution Check violations. This table is intentionally empty.
