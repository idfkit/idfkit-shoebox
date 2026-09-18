# Implementation Plan: TM59 Category I as a reading

**Branch**: `013-tm59-category-i` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-tm59-category-i/spec.md`

## Summary

Put TM59's stricter comfort category on the roster of readings, so it can be picked
wherever a reading is picked: the study card's metric, the design space survey's ground,
the pull's ranking. Two new declarations — `tm59aI` and `tm59bI` — each carrying the
`Category` it is read at, and every chooser on the sheet picks them up because every
chooser is already generated from that roster.

Nothing is computed that the sheet does not already compute. `readCriterionA` and
`readCriterionB` take a `Category` today, both categories are read on every solve, and the
board already letters all five readings. What this feature moves is **which readings can be
chosen**, and the single declaration that pinned that to one category
(`TM59_STUDY_CATEGORY`, `src/study.js:192`).

The whole risk of the change sits in one place, and the plan is arranged around it: both
categories publish the **same numeric limit**, so a published line taken from the wrong
category sits at exactly the right height on the ground and looks correct while citing a
criterion the ground does not answer. Three load-time invariants answer that — the roster
against `Criterion.byCategory`, a target's `metric` against its `category`, and every
category-bearing reading against a category qualifier — so the failure throws at mount
naming both declarations rather than drawing.

Nothing here reaches the IDF, `params`, `shapeKey`, `LINK_VERSION` or the engine. No
`Output:*` is added, no run contents change, and a sample already run for one category
answers the other from the same cached run.

## Technical Context

**Language/Version**: vanilla ES modules (ES2022), no transpiler; Node 22 for harnesses

**Primary Dependencies**: none added, and none needed. `@idfkit/*` only, per Principle V

**Storage**: N/A. The chosen reading rides the URL fragment as it already does (`sty`, `sv`);
nothing new is remembered in `localStorage` and nothing new is remembered at all

**Testing**: no test runner, no linter. Throwaway Node harnesses under the scratch
directory against the DOM-free modules (`study.js`, `survey.js`, `schemes.js`, `tm59.js`,
`permalink.js`), then the page is driven. See [quickstart.md](./quickstart.md)

**Target Platform**: static site, the reader's own browser

**Project Type**: single-page client-side application, `src/*.js` + `index.html`

**Performance Goals**: unchanged. No new engine run, no new output variable, no new run
contents. The one measurable delta is two more ESO passes per landed study or survey
sample where the run answers TM59; the budget is Principle VI's, and the measurement is
step 5 of the quickstart rather than an assumption

**Constraints**: no new hue and no second curve — a reader plots one reading at a time, so
the `--warm`/`--cold` pair stays reserved for signed physical quantities. Two more rows in
every reading chooser must stay readable and selectable at 390 px without hover

**Scale/Scope**: the roster goes from 11 quantities / 13 readings to 13 / 15. Six source
files change; two counted assertions move with their prose. No file is added

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes below.*

| Principle | Verdict | Why |
|---|---|---|
| I. Everything runs in the browser | **Pass, untouched** | No request, no service, no upload. The feature is declarations and arithmetic already in the page. |
| II. Deterministic and shareable | **Pass** | A reading id is a link **value**, not a key, so `LINK_VERSION`, `DEFAULTS_BY_VERSION` and `MIGRATIONS` are untouched (research §3). `tm59a`/`tm59b` keep their ids, so every link ever shared restores the reading it named (FR-012). Both new ids pass the `sty` regex and carry no `.` to confuse `sv`. `params` is not touched at all, so the scalar rule, the commit guard and the identity diff are not in play. |
| III. Read it back off the model | **Pass, and strengthened** | Every figure is read off the run by the same readers the board uses; the comfort line, its clamps and the night limit come off the `Category` declaration `tm59.js` already asserts. The one new duplication — a target's `metric` implying a category its `category` also states — is closed by a load assertion rather than left to inspection (research §4). |
| IV. No silent fallbacks | **Pass, and the point of the feature** | Absences already come back as `Reading`s carrying their reason; the new readings inherit that unchanged. The three new invariants throw at load naming both declarations. The qualifier keeps refusing a target whose category cannot be decided rather than matching it. |
| V. Only `@idfkit/*` at runtime | **Pass** | Nothing added. |
| VI. Latency is the interface | **Pass, with a measurement owed** | No new run contents, so `shapeKey` is unchanged and a cached sample answers both categories (FR-015, SC-004). `readPoint` gains two ESO passes per sample where TM59 is answerable; the board's own five readings measure 2.44 ms for a whole year, so the expectation is a fraction of a millisecond per sample — measured in quickstart step 5, not assumed. |
| VII. Mobile-first and responsive | **Pass, with a check owed** | Two more rows in choosers that already draw rows, with labels of the shape the board already letters. Nothing moves to hover. Checked at 390 px in quickstart step 7. |

**Workflow gates.** Gate 1 (verified outside the browser first): the changed modules are
DOM-free, so the harness calls the real functions. Gate 2 (idempotence): `applyModel` is
not touched — no channel, no applier, no IDF object — so the gate is satisfied by the diff
rather than by a run, and the quickstart asserts byte-identical IDFs anyway (SC-005).
Gate 4 (codec round trip): both new ids round-trip through `sty` and `sv`, and a
pre-existing link is re-read. Gate 5 (declaration invariants throw at load): three added,
listed above. Gate 6 (general notes): **evaluated and not triggered** — neither the `tm59`
nor the `survey` note teaches anything this change makes untrue, so `NOTES` is unchanged and
the storage key is not bumped; the reasoning is recorded in research §9 so that the
judgement is reviewable rather than silent. Gate 8 (design system): no new token, pattern
or threshold (research §10).

**No complexity tracking table**: there are no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/013-tm59-category-i/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── readings.md      # Phase 1 output — the module surface and its invariants
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # /speckit-tasks output — NOT created here
```

### Source code (repository root)

Six files change. No file is added, and no module gains a dependency it did not have.

```text
src/
├── study.js      # the roster: two Quantity declarations, `category` on Quantity,
│                 # TM59_STUDY_CATEGORY removed, two counted assertions moved,
│                 # the roster-against-the-method invariant added
├── survey.js     # SENSE entries for the two new series; QUALIFIER_BY_METRIC keyed
│                 # off the reading's own category; Reading carries `category`
├── schemes.js    # the two Category I targets' `metric` moves to name their reading;
│                 # the metric-against-category invariant added
├── main.js       # the metric-to-criterion table is derived off the roster instead of
│                 # hand-kept (the board is unchanged in what it draws)
├── tm59.js       # unchanged in arithmetic; COUNT_CATEGORY's comment says why the
│                 # count stays at Category II now that both are choosable
└── controls.js   # untouched — no control is added (recorded here because a reader
                  # looking for one should find the reason, not silence)

docs/design-notes.md   # the TM59 and E-02 sections: why one category became two,
                       # and the three invariants that make it safe
CLAUDE.md              # the one-line summary of the same, under the TM59 entry
```

**Structure Decision**: The existing single-project layout is kept, and the feature lands
entirely in the declaration layer: `study.js` declares what a reading is, `survey.js`
decides which published line answers it, `schemes.js` declares the lines. The three
surfaces that draw a chooser — the study card, the survey chooser, the pull — are not
touched, because each is generated from the roster and picks the new readings up as data.
That is the test of whether the roster was the right place for this: if a chooser needed
editing, the category would not really be a property of the reading.

## Phase 1 design summary

- **[data-model.md](./data-model.md)** — the fields added to `Quantity` and `Reading`, the
  two new roster entries, the two target declarations that move, and the three invariants
  stated as the throws they compile to.
- **[contracts/readings.md](./contracts/readings.md)** — the module surface after the change:
  what `study.js`, `survey.js` and `schemes.js` export, what each throws at load, and the
  one call whose argument changes.
- **[quickstart.md](./quickstart.md)** — eight steps, each a thing that can come back wrong:
  the invariants, the cross product of readings against targets, the codec both ways, the
  byte-identical sheet, the per-sample cost, the IP lettering, 390 px, and the page driven.

## Post-design constitution re-check

Re-evaluated against the artifacts above: unchanged, all pass. The design added no
run-time dependency, no network call, no `params` key, no link key, no `Output:*`, no hue
and no hover-only text. The one thing it added that the constitution watches closely is a
second statement of one fact (a target's metric implying its category), and that is
answered with a load-time throw in the same change that introduces it, which is Principle
III's own remedy rather than an exception to it.
