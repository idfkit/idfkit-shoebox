# Implementation Plan: Choose what a sweep plots

**Branch**: `004-choose-sweep-metric` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-choose-sweep-metric/spec.md`

## Summary

A study sweeps one control and draws a curve; the reader chooses the control but
not what the curve is *of*. `studyMetric` (`src/main.js:6770-6800`) infers that
from the desk, and the inference has misfired three ways. This feature replaces
it with a declared roster of **quantities**, one chosen for the desk, stated on
every card, changed without losing any study, and carried on the link.

The technical approach has four moves, in dependency order:

1. **Declare quantities once.** A `Quantity` class in `src/study.js` carrying
   label, unit, digits, the run contents it needs, the context its reader needs,
   and the reader itself. `METRICS` becomes that roster. Every switch on a metric
   id in `console.js` and `main.js` is replaced by a read off the declaration.
2. **Make a sample's identity what the run carries, not who asked.** The cache
   key drops `job.metric` and gains the run's declared contents; every quantity
   whose needs are a subset of those contents is read off that run at land time
   and cached as a bag of numbers. A compatible index by desk shape and run kind
   finds the least cached superset, since the exact key alone cannot. Changing
   the desk quantity then re-runs only the samples that fall short across all
   open studies. Each sample also retains its small physical meter basis so
   Plant and Tariff changes can rederive EUI, cost and carbon without an engine
   run.
3. **Keep study identity on the swept control.** `studies`, `studyStops`, the
   scheduler's `byKey`, and the console's `rows` / `cards` / `studyButtons` stay
   keyed by the control. A separate desk-wide quantity changes every open card
   together and is initialized once, when the first study starts.
4. **Carry the choice and open studies on the link** under one new reserved key,
   and offer the desk-wide choice on every card.

Two measurements taken during Phase 0 govern the design and are recorded in
[research.md](./research.md): reading every answerable quantity off a sample
instead of one costs 1.8 to 2.6 ms, and the ESO parse rather than the engine is
what a wide reporting profile costs (7.6 ms at 454 KB against 45.8 ms at
2.62 MB).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation. Browser
baseline is whatever runs the WebAssembly engine build.

**Primary Dependencies**: `@idfkit/core` (`writeIdf`, `SchemaBundle`),
`@idfkit/engine` (`createEnergyPlus`, `parseESO`, `findVariables`,
`getTimeSeries`), `@idfkit/schemas`, `@idfkit/weather`, `@idfkit/engine-assets`.
No new runtime dependency, as required by Principle V.

**Storage**: none beyond the reader's own browser. The URL fragment carries the
desk; `localStorage` carries the general notes and the kept schemes.

**Testing**: no test runner and no linter exist in this repository. Verification
is throwaway Node harnesses under a scratch directory, plus driving the page.
The modules this feature touches most (`study.js`, `readings.js`, `tm59.js`,
`permalink.js`) are DOM-free precisely so the harnesses call the real functions.

**Target Platform**: static site, client-side only, served from S3 behind
CloudFront. EnergyPlus 26.1.0 as a WebAssembly build in the reader's tab.

**Project Type**: single-page client-side application. One `src/` tree of ES
modules, no framework and no bundled UI library.

**Performance Goals**: a design day solves in about 50 ms warm and an annual run
in about 430 ms; a sweep is 21 of the latter across a pool sized by cores. The
feature must add no engine time beyond the chosen quantity's lean reporting
contents. Its land-time readers run on the main thread and must stay within the
measured 1.8 to 2.6 ms per sample.

**Constraints**: sample retention must stay at a handful of numbers per entry so
the existing 400-entry cache bound holds (FR-017). Every reading must be legible
at 390 px and must not exist only on hover (Principle VII). No new
`Output:Variable` may be per-surface (Principle VI). Price-only controls stay out
of sample identity and rederive their quantities from retained meter totals.

**Scale/Scope**: 13 aggregate outcomes exposed through 11 choices against 3 today; one
desk-wide chosen quantity; existing study maps remaining keyed by control; 4
reporting profiles becoming a declared contents set; 1 new reserved link key.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0. **Initial check:
PASS with two items requiring design attention, both resolved in Phase 1 and
re-checked below.**

| Principle | Verdict | Basis |
|---|---|---|
| I. Everything Runs in the Browser | PASS | Nothing here adds a request. The feature is a choice about a reading already computed in the tab. |
| II. Deterministic and Shareable | PASS | The chosen quantity and open study controls ride the fragment once (FR-022 through FR-024). No `LINK_VERSION` bump: the code's own bump rule (`src/permalink.js:25-34`) names changing a default, renaming a key and narrowing a range, and a new reserved key whose absence preserves old-link behaviour does none of the three. |
| III. Read It Back Off the Model | PASS | FR-019 requires every curve figure to come off the sample's own run. The roster is a declaration in one module, which is the same rule `controls.js` keeps for controls. |
| IV. No Silent Fallbacks | PASS | FR-009 forbids the list shortening, FR-012 forbids substitution, and FR-014 keeps absence per sample. An unknown quantity id on a link refuses the link whole. |
| V. Only @idfkit/* at Runtime | PASS | No dependency added. |
| VI. Latency Is the Interface | PASS, with a measurement | See "Attention 1" below. |
| VII. Mobile-First and Responsive | PASS, with a design gate | See "Attention 2" below. |

**Attention 1: the per-sample budget (Principle VI).** Decision A reads every
answerable quantity at land time rather than one. Measured on this repository's
own runs, all readers together cost 1.8 ms on a lean ESO and 2.6 ms on the full
one, against 7.6 ms and 45.8 ms of parse and about 430 ms of engine. The
addition is under half a per cent of a sample and is accepted. The same
measurement is what rules out running samples under a union profile: the cost of
a wide profile is the parse, six times over, on the main thread.

Two related obligations fall out and are carried as tasks rather than assumed:
`buildSample` currently measures `floorArea` only when the metric is `energy`
(`src/main.js:6596`) and `contextFor` returns `null` unless the metric is
`tm59a` (`src/main.js:6665-6675`). Both become unconditional. `geometryFacts` on
the overlay is the one of these whose cost is not yet measured, and measuring it
is a task of its own, taken before the eager read is committed to.

**Attention 2: the chooser at 390 px (Principle VII, and workflow gate 8).**
`.study-head` is a single non-wrapping flex row whose only elastic member is the
ellipsised desk label (`index.html:2786-2825`), so the chooser cannot simply be
appended to it. Eleven choices also exceed what the segmented selector
pattern carries. The design system's own fold pattern is the candidate, and by
workflow gate 8 the work is started with `/interface-design:init` and any new
pattern is recorded in `.interface-design/system.md` in the same change. It is a
gate on the feature rather than a finishing touch, and `/speckit-tasks` should
order it before the card is wired rather than after.

**Post-Phase 1 re-check: PASS, no new violations, Complexity Tracking empty.**
The design adds no project, no layer and no indirection that a principle does not
already ask for. Replacing four named reporting-profile strings with a declared
contents set is a reduction: it is what makes SC-008 true, and it is the same
"declare it once" rule Principle III states for controls.

## Project Structure

### Documentation (this feature)

```text
specs/004-choose-sweep-metric/
├── plan.md              # This file
├── research.md          # Phase 0 output: decisions, measurements, rejected alternatives
├── data-model.md        # Phase 1 output: Quantity, Study, Offer, Sample, RunContents
├── quickstart.md        # Phase 1 output: how to verify this feature
├── contracts/
│   ├── quantity.md      # The Quantity declaration and the roster's invariants
│   ├── scheduler.md     # The injected-effect contract, as it changes
│   └── link.md          # The `sty=` fragment key: grammar, refusals, precedent
├── checklists/
│   └── requirements.md  # Written by /speckit-specify, revalidated by /speckit-clarify
└── spec.md              # Authoritative requirements; unchanged by this plan
```

### Source Code (repository root)

This is a single-project client-side application. There is no `tests/` tree,
because there is no test runner; the verification harnesses are throwaway and
live outside the repository, which the constitution's workflow section states
outright.

```text
src/
├── study.js         # HEAVILY CHANGED. The Quantity class and the roster; the
│                    #   admission rule; sampling and sample order are untouched.
├── scheduler.js     # CHANGED. Exact sample identity gains carried contents; a
│                    #   compatible index finds supersets; the cache value is a bag.
├── main.js          # HEAVILY CHANGED. studyMetric deleted; studies/studyStops
│                    #   remain keyed by control; owns the one desk quantity;
│                    #   buildSample/contextFor/readPoint/keyOf; link call sites.
├── console.js       # CHANGED. The study card is drawn off the declaration; a
│                    #   desk-wide chooser changes every open card together.
├── model.js         # CHANGED. syncReporting takes a declared contents set
│                    #   rather than one of four profile names.
├── permalink.js     # CHANGED. The `sty=` reserved key, its grammar and refusals.
├── readings.js      # UNCHANGED as a rule. Readers are used, not rewritten.
├── tm59.js          # UNCHANGED.
├── bill.js          # UNCHANGED. Its totals are read through the roster.
├── schemes.js       # READ ONLY. Target.metric is the vocabulary the roster
│                    #   validates against from study.js.
└── tour.js          # UNCHANGED, and deliberately so. No note mentions studies,
                     #   so none goes stale and the storage key does not move.

index.html           # CHANGED. The card's own CSS, and the chooser's.
.interface-design/
└── system.md        # CHANGED. The chooser is a new component pattern.
```

**Structure Decision**: no new directory and no new module. Every change lands
in a module that already owns the concern: the roster beside the sampling in
`study.js`, identity in `scheduler.js`, the reporting contents in `model.js`,
the fragment key in `permalink.js`. A new `quantities.js` was considered and
rejected in [research.md](./research.md) (D8): `study.js` already holds "what a
sample is read for", it is already DOM-free so the harnesses reach it, and a
separate module would put the roster one import away from the sampling rules
that decide whether a control can be swept at all.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

This plan ends after Phase 1 design. It does not create `tasks.md`; the next
`speckit-tasks` run derives that file from these reconciled artifacts.
