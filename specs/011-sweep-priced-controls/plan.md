# Implementation Plan: Sweep the priced controls

**Branch**: `78-priced-sweeps` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-sweep-priced-controls/spec.md`

## Summary

Offer Study and Survey on the six numeric faces of Plant and Tariff, refuse the 54
pairings a priced control cannot move with one shared sentence, and keep the pull as
it is (issue #78, spec clarification option C).

The approach rests on one finding from reading the scheduler: **a priced sweep already
costs one run and nothing needs to be taught to make it so**. Sample identity is built
from `deskKey`, which drops `PRICED_KEYS`, so every position of a study of
`heatEfficiency` has the same identity; the first dispatch runs it, the rest ride the
same pending promise, and the cache answers every densify. What is missing is only
that every position is currently lettered at the one price the cache holds. So the
work is:

1. **Price at the point, not in the cache.** A new scheduler hook, `priceAt`, prices
   each curve point at its own position through the bill arithmetic `repriceStudies`
   already uses, extracted once as `pricedReadings`.
2. **Declare reach and refuse by it.** `Quantity.movedBy` names the priced controls
   that can move each reading; `refusesPairing` turns that into the one sentence the
   study card, the survey chooser, `makeSurvey` and the survey link all give.
3. **Let the ground carry its price.** Spot heights keep their meter basis and are
   re-priced by `reprice()` (a spot that stops pricing becomes a gap with the bill's reason
   and comes back when the rate does), which also closes what reads as an existing gap: nothing
   re-prices E-02 today when the tariff turns (research R6, confirmed in quickstart
   gate 4).
4. **Keep the counts honest.** Where positions and runs differ, both are lettered.

Two findings in planning amended the spec: a study link with a refused pairing opens
and reproduces the refused card rather than being refused (FR-019, research R8), and
the traverse stays a record of buildings (FR-017a, research R9).

## Technical Context

**Language/Version**: vanilla ES modules, ES2022, no transpilation.

**Primary Dependencies**: `@idfkit/*` only. No dependency added.

**Storage**: none new. `sty` and `sv` carry priced keys under their existing grammar;
nothing new in `localStorage`.

**Testing**: no test runner. Node harnesses under the scratchpad, calling the real
DOM-free modules, then the page driven, per the constitution and
[quickstart.md](./quickstart.md).

**Target Platform**: static site, browser only; EnergyPlus 26.1.0 WASM. No
infrastructure change.

**Project Type**: single-project front end, modules under `src/`.

**Performance Goals**: a priced study costs zero runs beyond its shape's one (SC-001);
a priced ground costs its shaping axis's positions (SC-002); a priced drag re-letters
every open curve and ground within a frame of the bill (SC-005), budgeted in research
R11 at about two thousand bill lines a frame in the worst case.

**Constraints**: nothing reaches the IDF (Principle VI's priced-channel rule is
untouched); every new sentence within a `copy.js` budget and visible without hover at
390 px; `LINK_VERSION` unchanged.

**Scale/Scope**: 6 priced numeric faces, 11 roster choices, 66 pairings of which 54
are refused. At most 121 spot heights and a handful of 22-point curves re-priced per
priced commit.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Against constitution
1.0.1.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload | **PASS.** Arithmetic over meters already in the page. |
| II. Deterministic and Shareable | Anything changing a result rides the link; refusals whole; no version bump without a changed default | **PASS.** Priced studies ride `sty` and priced axes ride `sv` under their existing grammar. No default, key or range changes; old survey links never named a priced axis, so they decode identically. Survey pairing refusals are whole. Study pairing refusals are reproduced, which is this principle's own rule for a reachable desk (research R8). |
| III. Read It Back Off the Model | Every figure traceable to the document, the run, or arithmetic over them | **PASS.** Each priced figure is the bill's arithmetic over that run's meters, through the one function the bill's reprice already uses (FR-012). Reach is declared once and verified against `computeBill`. |
| IV. No Silent Fallbacks | Throw; refuse with reasons; em dash for absent | **PASS.** A refused pairing or a withdrawn face refuses with its sentence instead of drawing a flat line. An unpriceable position is an em dash, never a default. Reach and `withdrawn` declarations throw at load. |
| V. Only @idfkit/* at Runtime | No new package | **PASS.** |
| VI. Latency Is the Interface | Live sheet never queues; priced keys never start runs | **PASS.** `PRICED_KEYS` stay out of `shapeKey`; priced drags reach `reprice()` only. |
| VII. Mobile-First and Responsive | 390 px, no hover-only | **PASS, after correction.** The first draft lettered the withdrawn sentence only in the disabled offer's `title`, following the existing pattern for idle shaping controls; `/speckit-analyze` flagged that as hover-only (C1). The sentence is now lettered in view under the dimmed row, in the refusal box the design system already names, and the title only repeats it. The pairing refusal already stands in view on the study card and in the chooser. |

**Result: PASS.** No violation; Complexity Tracking is empty.

## Constitution Check, re-evaluated after Phase 1

| Principle | Post-design verdict |
| --- | --- |
| II | **PASS.** contracts/priced-sweeps.md fixes the order of checks in `decodeSurvey` (unknown names before pairings), so an old malformed link is refused for the same reason as before. |
| III | **PASS, strengthened.** `pricedReadings` is the only application of the bill to a cached basis; `SpotHeight.basis` means a re-price never depends on the bounded cache. |
| IV | **PASS.** `refuses` stays pure (asked at `deskAt`); the one impure hook, `priceAt`, says so in its contract and is re-run by every `reprice()`, so no figure stands priced at settings the desk has left. |
| VII | **PASS.** Every new refusal is in view at 390 px; the in-view withdrawn line is recorded in `.interface-design/system.md` (constitution workflow gate 8). |

## Project Structure

### Documentation (this feature)

```text
specs/011-sweep-priced-controls/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── priced-sweeps.md # Phase 1: every changed interface, by module
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── study.js       EDIT  Quantity.movedBy, refusesPairing, pairingFix, offersFor({ key }), load assertions
├── scheduler.js   EDIT  priceAt hook in pointAt; curveFor returns runs
├── survey.js      EDIT  refusesAxis admits priced faces; makeSurvey refuses pairings;
│                        landPoint takes priced readings and basis; SpotHeight.basis; Coverage.runs
├── controls.js    EDIT  withdrawn sentences on five priced Scales; load assertion
├── permalink.js   EDIT  decodeSurvey refuses a pairing whole
├── console.js     EDIT  Study and Survey offers on priced faces; withdrawn sentence in view under the row
├── pull.js        EDIT  PullReading.said names Plant and Tariff as not ranked
├── copy.js        EDIT  budgets for the pairing sentence, its fix, and the withdrawn sentences
└── main.js        EDIT  pricedReadings, pricingAt, priceAt, refuses, repriceSurvey,
                         studyOffers/surveyReadingOffers/surveyRefusal/axisOffers, count sentences
docs/design-notes.md   EDIT  "Channels that price rather than simulate", the studies and survey sections
CLAUDE.md              EDIT  priced-channel line; survey line
CHANGELOG.md           EDIT  Added (priced studies and surveys); Fixed (E-02 re-pricing, if gate 4 confirms)
.interface-design/system.md  EDIT  the withdrawn line under a row; a ground standing refused with its points kept
specs/006-design-space-survey/spec.md  EDIT  pointer at FR-004 and FR-007 to 011's FR-007 and FR-026
```

**Structure Decision**: no new module. Every change lands in the module that already
owns the concern, which is what keeps the pricing arithmetic, the refusal sentence and
the reach declaration to one copy each. `src/tour.js` is not edited (research R12).

## Complexity Tracking

No constitution violations to justify.
