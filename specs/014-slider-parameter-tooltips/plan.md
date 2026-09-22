# Implementation Plan: Slider Parameter Help Notes

**Branch**: `014-slider-parameter-tooltips` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-slider-parameter-tooltips/spec.md`

## Summary

Give every sweepable parameter an EnergyPlus-driven explanatory note, in the Model
Console and in the Design Space Survey's axis chooser, from one field on the control's
own declaration.

Reading the code first changed the shape of the work. `Control` already carries a
`note` field (`src/controls.js`), rendered on the Model Console today as a fold, `+ Note` closed, the text open beneath the row it explains (`noteFold`, `src/console.js:114-117`,
called at nine strip builders). 42 of the 87 controls a survey can be cut along
(`refusesSweep(control) === null`, `src/study.js:110`) already carry one; 45 do not
(measured directly, see [research.md](./research.md) R1). The Design Space Survey's
axis chooser (`pickList`, `src/main.js:10113-10270`) already knows how to draw an
option's `note` as a line under its label and fold it into the search text
(`src/main.js:~10156`, `.interface-design/system.md:900`), but `axisOffers`
(`src/main.js:9998-10060`), which builds the rows that chooser draws, never sets
`note` on the offer object it pushes. So the chooser's own rendering path for this is
already built and simply never fed.

There is accordingly no new UI affordance to invent. The design system already rules
out a menu hidden behind an unfamiliar icon (`.interface-design/system.md:231-232`)
in favour of disclosures and in-place lines the reader can search and filter; the
fold's own `+`/`−` marker and `Note` summary are the discrete indicator the request
asks for, already built and already on 42 of the 87 controls. The work is:

1. **Wire, and fold.** Add `explanation` (the control's `note`) to the offer object
   `axisOffers` pushes, pass it through `axisOptions`, and draw it in `pickList` as a
   `+` marker on the row's own line that opens the note beneath it. `option.note` is not used: it is an
   always-visible line, and a 77-word note in view on every row breaks the copy
   budget (tasks.md, findings 1 and 2).
2. **Write the missing 45 notes**, in the voice the other 42 already keep
   (`src/controls.js`, up to ~77 words). Per FR-010, where the control maps to a
   specific EnergyPlus object and field, the note cites that field's own definition
   in idfkit's bundled EnergyPlus schema; where it does not (massing width, depth,
   height, and the rest of the schema-less 45), FR-008 applies and the note either
   names its real source (a standard, a measurement off the default desk) or says
   describes what the control writes, without inventing a citation.
3. **Close the gap at its source.** A load-time assertion in `src/study.js`, beside
   `refusesSweep`, throws naming any sweepable control with no `note`, the same
   shape as `Landmark`'s own "cites nothing" throw (`src/controls.js:213`), so the
   45 cannot regress to 44 by a future control being added without one, and this
   plan's own work is verified complete rather than eyeballed.
4. **Keep the refusal and the explanation apart where they already share a field.**
   `axisOffers` already reads `control.note` as the *reason* an inert control cannot
   be swept right now (`src/main.js:10036-10037`; the same reuse in `src/pull.js:175`).
   Where that is the row's `reason`, the chooser must not also print the identical
   sentence again as its `note`, one sentence, once, per row (research.md R3).
   (Revised 2026-09-21: no control declares `inert`, so the branch that made a row's reason equal its note was deleted from `axisOffers`, and the de-duplication guard with it. The explanation is now `faceless ? null : control.note ?? null`.)

No control gains a numeric face it did not have, nothing new reaches the IDF or the
link, and no model-verification gate in the constitution's workflow section applies:
this feature writes no object into any `IdfDocument`.

## Technical Context

**Language/Version**: vanilla ES modules, ES2022, no transpilation.

**Primary Dependencies**: `@idfkit/*` only. No dependency added.

**Storage**: none new. Fold-open state stays in the existing in-memory `Set`
(`openFolds`, `src/console.js`); nothing about this feature reaches `localStorage` or
the URL fragment.

**Testing**: no test runner. Node harnesses under the scratchpad import the real,
DOM-free `src/controls.js` and `src/study.js` directly, per the constitution and
[quickstart.md](./quickstart.md).

**Target Platform**: static site, browser only. No infrastructure change.

**Project Type**: single-project front end, modules under `src/`.

**Performance Goals**: none new to hold. Nothing here runs during a drag or a solve;
the note is read once when a row is built. No budget in Principle VI is at risk.

**Constraints**: every authored note stays within the existing 77-word ceiling the 42
current notes already hold (`console.js:108`, held as a fresh `copy.js` budget rather
than an eyeballed number, research.md R4); every note is reachable by click or tap,
never only on hover (Principle VII); a note never substitutes for, or duplicates
word-for-word, a refusal already shown for the same row (Principle IV; research.md R3);
`control.note` remains the one declared copy of the text (Principle III), the chooser
reads it from the control, it is never re-typed as chooser-specific copy; where a
control maps to an EnergyPlus object and field, its note cites that field's own
schema definition as the source, and otherwise falls back to FR-008's plain-absence
rule (FR-010; the citation is human-authored, with no automated check against the
schema).

**Scale/Scope**: 87 sweepable controls; 42 already noted, 45 to write; one field added
to one object literal in `src/main.js`; one load-time assertion in `src/study.js`.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Against constitution 1.0.1.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload | **PASS.** Static text shown from a control declaration already in the bundle. |
| II. Deterministic and Shareable | Anything changing a result rides the link; nothing here does | **PASS.** A note is prose, not a parameter; it is not on `params`, does not reach `encodeState`, and `LINK_VERSION` is untouched. Opening or closing a note is UI state only (FR-005). |
| III. Read It Back Off the Model | One declaration, read back everywhere it is shown | **PASS.** `control.note` is declared once in `src/controls.js`; the console fold and the chooser row both read that same field. Writing chooser-specific copy would be the second source of truth Principle III forbids, and this plan does not do that (FR-004). |
| IV. No Silent Fallbacks | Missing data is refused or stated as absent, not invented | **PASS.** FR-010 requires a schema-field citation wherever one exists; FR-008 forbids an invented or implied citation, and the new load-time assertion (research.md R2) means no slider is left without a note. A note is not required to disclaim a missing field or source. |
| V. Only @idfkit/* at Runtime | No new package | **PASS.** |
| VI. Latency Is the Interface | The solve budget is undisturbed | **PASS.** No control gains a face, no channel applier changes, nothing here runs on `params` or during a drag. |
| VII. Mobile-First and Responsive | 390 px, no hover-only | **PASS.** The fold and the chooser row are both already click/tap disclosures (`.interface-design/system.md:394-429`, `:868-904`); this feature adds no hover-dependent affordance. |

**Result: PASS.** No violation; Complexity Tracking is empty.

## Constitution Check, re-evaluated after Phase 1

| Principle | Post-design verdict |
| --- | --- |
| III | **PASS, strengthened.** `data-model.md`'s assertion reads `control.note` directly off the declaration for every sweepable control; nothing in `contracts/slider-notes.md` introduces a second place the text could be typed. |
| IV | **PASS.** `contracts/slider-notes.md` states the de-duplication rule for R3 as a contract, not a convention left to the call site, so a future refusal sentence cannot silently start repeating a note again. |
| VII | **PASS.** No system.md change is required, both surfaces' disclosure patterns are already documented (`:394-429`, `:868-904`); Project Structure below still touches system.md, but only to record that the axis chooser's already-specified note line (`:900`) now has real content behind it for slider controls, not to define a new pattern. |

## Project Structure

### Documentation (this feature)

```text
specs/014-slider-parameter-tooltips/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md         # Phase 1
├── contracts/
│   └── slider-notes.md  # Phase 1: the note contract, both surfaces
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md              # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── controls.js    EDIT  write the 45 missing `note` strings, in place on their
│                        existing control declarations; no new field, no new kind
├── study.js       EDIT  load-time assertion: every control with refusesSweep(control)
│                        === null carries a non-empty `note` (mirrors the Landmark
│                        "cites nothing" throw at controls.js:213)
├── main.js        EDIT  axisOffers pushes `explanation` (the note), de-duplicated
│                        against `reason` per research.md R3; axisOptions passes it
│                        through; pickList draws a + marker on the row's line
└── copy.js        EDIT  a `CONTROL_NOTE` budget (77 words) asserted over every
                         `note` at load, replacing the eyeballed number in the
                         console.js comment with a declared, checked one
docs/design-notes.md          EDIT  a short section recording where a control's note
                                    comes from and that the survey chooser reads the
                                    same field, not a copy
CLAUDE.md                     EDIT  one line under "Add a control": a control with a
                                    numeric face needs a `note`, checked at load
.interface-design/system.md   EDIT  one line under "A long list of offers" (:900)
                                    confirming the note line now carries real content
                                    for every slider axis, not only for other choosers
CHANGELOG.md                  EDIT  Added (explanatory notes on every slider parameter,
                                    on the console and in the Design Space Survey chooser)
```

**Structure Decision**: no new module. `controls.js` keeps owning the text,
`study.js` keeps owning what "sweepable" means and now also owns the assertion that
depends on it, and `main.js` keeps owning how the chooser's offer objects are built.
The chooser's `draw` wraps each row with a `+` marker that opens its note; `option.note` keeps its meaning as the in-view short line.

## Complexity Tracking

No constitution violations to justify.
