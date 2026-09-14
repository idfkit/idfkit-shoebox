# Implementation Plan: SI and IP Units

**Branch**: `010-si-ip-units` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-si-ip-units/spec.md`

## Summary

One segmented control, SI or IP, re-letters every figure on the sheet without touching the model. The value a control holds stays the SI number the document and the run hold; a **quantity kind** declared beside it says how that number is lettered, and conversion happens at the moment of lettering and nowhere else. The choice is remembered in the reader's own browser, defaults to IP only where the browser reports a United States region, and never reaches the link, so a shared link is byte-identical whichever system its maker had showing.

The approach, in dependency order:

1. **A DOM-free `src/units.js`.** Frozen `Kind` instances (SI unit, IP unit, exact factor, offset, IP precision), the active system, `letter(kind, value)` and `convert(kind, value)`, and the load-time assertions. A Node harness drives the real code.
2. **Kinds land on the declarations that already exist.** `Ruled` in `controls.js` is the root formatter; `Quantity` (study.js), `Reading` (survey.js), `Target` (schemes.js), `Criterion` (tm59.js), `Instant` (readings.js) and the three row tables in `main.js` each already carry a `unit` string. Each gains a kind, and its formatter asks `units.js` instead of composing the string itself.
3. **The scattered literals are brought in.** About forty sites, most of them in `main.js`, hardcode a unit in a template beside a `toFixed`. Each becomes a kind-lettered figure. This is the bulk of the work and the part with no shortcut.
4. **Eleven SI steps are refined** so whole IP figures are reachable, each to a divisor of its old step, which keeps every existing link's value on the grid.
5. **The toggle, the memory and the default**, then the report, the notes and the design system record.

Decisions and their alternatives are in [research.md](./research.md) (R1 to R15).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation. Node 22 for the harnesses.

**Primary Dependencies**: none new at run time (Principle V). No `Intl` unit formatting: the kinds carry their own strings, because `Intl` has no entry for `Btu/h·ft²·°F` and would put a second source of truth beside the declaration.

**Storage**: `localStorage`, one key, `shoebox-units-v1`, holding `'si'` or `'ip'`. Nothing else, and nothing sent.

**Testing**: no test runner. Node harnesses over `src/units.js` and the refined grids, the IDF byte-identity check from spec 007, and the page driven at desktop and 390 px. See [quickstart.md](./quickstart.md).

**Target Platform**: static site, desktop and phone browsers.

**Project Type**: single-page client-side application.

**Performance Goals**: no engine time. A switch re-letters from the last landed outcome and starts no run (FR-002, SC-002). The whole sheet re-letters within a tenth of a second (SC-003), which is two orders off the 50 ms design-day budget it must not disturb.

**Constraints**: the unit system reaches no IDF object, no link and no run (FR-003); IP unit strings must be single whitespace-free tokens, because `copy.js` counts words and throws at load (R6); no new hue and no floating explanation (design system); every figure stays readable at 390 px.

**Scale/Scope**: 1 new module; 87 numeric controls gaining a kind; 11 of them gaining a finer step; about 40 literal lettering sites rewritten, roughly 55 to 65 in `main.js` alone by the census; 1 toggle in `index.html`; 20 quantity kinds, 9 of which are the identity.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.1. **Initial check: PASS.**

| Principle | Verdict | Basis |
| --- | --- | --- |
| I. Everything Runs in the Browser | PASS | No request of any kind. The choice lives in `localStorage` beside the signature and the shelf, which is the persistence the principle names. The first-visit default reads `navigator.language`, a platform value, not a lookup. |
| II. Deterministic and Shareable | PASS | The unit system never reaches the document, and the link never carries it (FR-017), so the same URL gives the same drawing, IDF and numbers to every reader. The eleven refined steps make each grid a strict superset of the old one, verified stop by stop, so nothing narrows and no `LINK_VERSION` bump is owed (R4). Every parameter stays a scalar. |
| III. Read It Back Off the Model | PASS | No value is stored in IP. Every IP figure is the SI value the document or the run holds, converted at the moment it is lettered. The kind is declared once, beside the unit string it replaces, and the console, the sheet, the codec and the description all read it from there. |
| IV. No Silent Fallbacks | PASS, and improved | A lettering site whose kind is unknown throws at module load, as does a kind whose IP precision is unreachable on its control's grid (R5). Where the browser refuses storage the sheet says the choice will not be remembered (FR-015). A missing reading stays an em dash in both systems. |
| V. Only @idfkit/* at Runtime | PASS | No dependency. Exact factors are three constants. |
| VI. Latency Is the Interface | PASS | No engine cost. A switch re-letters from the last landed outcome and never starts, queues or interrupts a solve; studies and surveys keep their samples and re-letter in place. |
| VII. Mobile-First and Responsive | PASS, with attention | IP strings are longer (`Btu/h·ft²·°F` against `W/m²K`), which is why R6 makes every one a single token and the quickstart measures the strips at 390 px. The toggle is a segmented selector, an existing pattern, not a new floating control. |

**Workflow gates.** Gate 1 and 3: the IDF is byte-identical, checked outside the browser at several desk positions. Gate 2: idempotence is untouched, since no applier changes. Gate 4: the codec is round-tripped over the refined grids, including every existing link fixture. Gate 5: two new load-time invariants (R5). Gate 6: no existing note changes meaning; if any step letters a unit it goes through `units.js` and the key is bumped to `shoebox-general-notes-v5` (R12). Gate 8: the segmented selector and the toggle's placement are recorded in `.interface-design/system.md` in the same change. Gate 9: the comments carry the measurements (the 1.64 ft step, the eleven divisors, the word counts). Gate 10: `Kind` is a frozen class, and the kinds are a frozen roster.

**Post-Phase 1 re-check: PASS, no new violations, Complexity Tracking empty.** The one judgement worth naming is the eleven refined steps: they change what an SI reader's slider does, which no requirement asked for. They are the only way to satisfy FR-011 without storing a second grid, and R4 records the measurement that forced them.

## Project Structure

### Documentation (this feature)

```text
specs/010-si-ip-units/
├── plan.md                  # This file
├── research.md              # Phase 0: decisions R1 to R15
├── data-model.md            # Phase 1: Kind, System, the declarations that gain a kind
├── quickstart.md            # Phase 1: how to verify
├── contracts/
│   ├── quantity-kinds.md    # Every kind: SI, IP, factor, precision, and the exceptions
│   └── units-toggle.md      # The control: placement, copy, keyboard, memory, default
├── checklists/
│   └── requirements.md      # Written by /speckit-specify
└── spec.md
```

### Source Code (repository root)

There is no `tests/` tree; harnesses are throwaway.

```text
src/
├── units.js       # NEW. DOM-free: Kind, KINDS, the active system, letter(), convert(),
│                  #   assertKinds() and assertReachable(); the storage probe's reader.
├── controls.js    # CHANGED. `kind` on Ruled; Ruled.format asks units.js; readQuantity
│                  #   accepts either system's unit and the R- prefix; eleven steps
│                  #   refined; assertReachable() run over every Ruled at load.
├── console.js     # CHANGED. The strip meters, the plan key and the study card letter
│                  #   through units.js; api.sync() is the re-letter entry point.
├── main.js        # CHANGED. The largest surface: the quantities panel, the derived
│                  #   readings, the plate chart, the bill card build-up, the scoreboard,
│                  #   the schedules, the shelf, the relief and plan figures, the
│                  #   station picker. BillColumn, SCHEDULE_ROWS and SHELF_COLUMNS gain
│                  #   kinds; the four reading.digits bypasses go through Reading.format.
├── readings.js    # CHANGED. watts() takes a kind; each Instant.letter is a kind.
├── describe.js    # CHANGED. The prose letters its quantities through units.js; the unit
│                  #   words stop being hand-typed.
├── survey.js      # CHANGED. Reading carries a kind; Reading.format asks units.js.
├── study.js       # CHANGED. Quantity carries a kind.
├── schemes.js     # CHANGED. Target carries a kind. Spec.why keeps its published
│                  #   arithmetic untouched (R12).
├── tm59.js        # CHANGED. Criterion carries a kind (its units are dimensionless
│                  #   counts, so the kinds are the identity, declared for the assertion).
├── weather.js     # CHANGED. degreeDays keeps its °C bases and says so (R11).
└── field.js       # UNCHANGED. It delegates to control.format already.

index.html         # CHANGED. The segmented SI/IP selector as a fifth row of the
                   #   header stamp, beside engine/runtime/toolkit, and its styles.
.interface-design/
└── system.md      # CHANGED. The segmented selector as a page-level mode control.
CLAUDE.md          # CHANGED. One subsystem line, the new invariant, the storage key.
docs/design-notes.md  # CHANGED. A "Units" section with the measurements in research.
```

**Structure Decision**: the page keeps its flat `src/` layout. `units.js` sits beside `readings.js` and `report.js` as a third DOM-free module, imported by `controls.js` so that a control's own `format` is the first thing that asks it. Nothing imports `units.js` for a value; only for how a value reads.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

This plan ends after Phase 1 design. The next `/speckit-tasks` run derives `tasks.md` from these artifacts.
