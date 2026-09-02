# Implementation Plan: Natural ventilation by pressure network

**Branch**: `001-afn-natural-ventilation` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-afn-natural-ventilation/spec.md`

## Summary

Give the Air strip a second model of its own subject. One `Selector` chooses
between the scheduled rate the desk has today and an AirflowNetwork pressure
network that computes the flow from wind and stack effect; the strip shows only
the controls of the model in force, and a `Readout` letters the air change rate
the engine came back with. This is the arrangement the Glazing strip already
uses for simple against layered glass, down to the readout, and taking that
shape is most of the plan.

The feature costs **no new module, no new control kind and no new runtime
dependency**. Every control it needs is a `Scale`, a `Selector` or a `Facade`,
all of which `console.js`, `permalink.js` and the study scheduler already draw,
encode and sweep. What it costs is one new applier in `model.js`, one reader in
`readings.js`, a `requires` gate on the Air channel, and the ordinary
obligations any feature here carries: the description, the general notes, the
folded index row.

**The plan phase did the job the specification asked of it, and two of the
specification's numbers moved.** The design day is *not* free under the network
(+20 ms of a 50 ms budget, measured three times), and the annual run costs 3.3×
rather than 2.6×. Two further findings are new and both are silent failures
that run clean: a network with no exterior surface left to leak through is a
get-input fatal, answered by the same `requires` gate that "the opening that had
nowhere to go" already established; and an EMS actuator that is forced rather
than released **replaces** the opening rule instead of bounding it, measured at
8,808 hours open against 2,601. All four are at the end of
[research.md](./research.md) and are owed to `spec.md` before implementation.

**FR-012 stands as written.** An earlier draft of this plan reported that the
wind speed bound could not be met, having checked the AirflowNetwork objects'
fields and stopped there. It is reachable through EMS, it composes with the
opening rule, and on a design day it costs nothing the engine can measure.
Nothing is dropped from the network's controls.

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, ES2022. No TypeScript, no
framework, no build-time transform beyond Vite's own.

**Primary Dependencies**: `@idfkit/core`, `@idfkit/schemas`, `@idfkit/engine`,
`@idfkit/engine-assets` (26.1.0), `@idfkit/weather`. **No new runtime
dependency**, which Principle V makes a hard gate. The AirflowNetwork objects
are schema objects like any other and the readings are arithmetic over series
the run already writes.

**Storage**: the URL fragment (the desk) and `localStorage` (the kept-scheme
shelf, the general notes). Nothing else, and nothing leaves the machine.

**Testing**: throwaway Node harnesses under `.harness/`, plus driving the page.
No test runner and no linter exist and none is added. The validation scenarios
are in [quickstart.md](./quickstart.md).

**Target Platform**: static site behind a CDN; EnergyPlus 26.1.0 compiled to
WebAssembly, running in a worker in the reader's own browser.

**Project Type**: single-page client-side application. One `src/` tree, no
backend, no packages.

**Performance Goals**: measured, not asserted. Design day 0.05 s → 0.07 s;
annual 0.47 s → 1.55 s. See "Performance budget" below, and the correction it
owes the specification.

**Constraints**: every reading legible at 390 px without hover (Principle VII);
the same URL reproduces the same numbers (Principle II); nothing reaching the
IDF may escape `params`; a reading with nothing behind it is an em dash and
never a zero (Principle IV).

**Scale/Scope**: about 20,500 lines across 22 modules today. This adds **no
module**. It adds one applier and one gate to `model.js`, one reader to
`readings.js`, one selector plus ten controls to `controls.js`, and touches
`main.js`, `describe.js` and `tour.js`. The applier also generates a short EMS
program, which is the first Erl on this desk.

## Performance budget

Principle VI makes latency a design budget rather than a footnote, and the house
rule is that a number here is measured or it is not printed. So the network was
built and run before the plan claimed anything about it.

**How these were taken**: the stock desk with Air, Gains and System engaged,
built through `buildModel` / `applyModel`, `setAnnual(doc, true)` for the annual
pair and `false` for the design-day pair, run against
`USA_CO_Golden-NREL.724666_TMY3.epw` on EnergyPlus 26.1.0 natively. Three
interleaved passes, the way the per-surface measurement that took an annual run
from 681 ms to 2,984 ms was taken.

| | Wall clock, median of 3 | Engine elapsed | Against baseline |
|---|---|---|---|
| Annual, scheduled | 581 ms | 0.47 s | baseline |
| Annual, network with openings | 1,644 ms | 1.55 s | **3.3×** |
| Design day, scheduled | 161 ms | 0.05 s | baseline |
| Design day, network with openings | 183 ms | 0.07 s | **+20 ms** |

And the EMS wind bound on top of the network, isolated by setting the bound
where it cannot bite so the physics is identical (verified: the outdoor air
term differs by a maximum of 0 W over 8,808 hours):

| | Wall clock, median of 3 | Engine elapsed | EMS overhead |
|---|---|---|---|
| Annual, network | 1,351 ms | 1.24 s | baseline |
| Annual, network plus EMS | 1,453 ms | 1.34 s | **+102 ms, about 8 %** |
| Design day, network | 176 ms | 0.07 s | baseline |
| Design day, network plus EMS | 180 ms | 0.07 s | **+4 ms, engine elapsed unchanged** |

Four things follow.

**The design day is not free, and the specification says it is.** Twenty
milliseconds is 40 % of the desk's 50 ms live budget. FR-025 still holds, since
70 ms is inside a drag frame and the pump is latest-wins so shapes passed
through are skipped rather than queued. But it is spent, and a later feature
that also wants 20 ms of that budget needs to know this one took it. The
quickstart carries it as a gate with a number rather than as a claim.

**The annual cost is the release cadence and nothing else.** 1.55 s is squarely
inside the sheet's existing slow-run handling: `resultPanels` stand with the
previous run's numbers, dimmed by `markStale`, and are cleared only where they
stop being true. FR-026 needs no new code, only the confirmation that the
existing behaviour covers it.

**The output requests cost nothing measurable.** Three new series against the
run's twenty, an ESO 3 % larger. The one per-surface variable resolves to a
series per openable window, at most four, not the 158 the `CLAUDE.md` warning is
about.

**The EMS is free where the budget is tight.** Its cost lands on the annual
release cadence, where 8 % of 1.3 s is not the constraint, and the design day is
unchanged at 0.07 s engine elapsed. So the first Erl on this desk buys FR-012
without touching the number Principle VI actually guards.

## Constitution Check

*GATE: passed before Phase 0 research, re-checked after Phase 1 design.*

| Principle | Verdict | How |
|---|---|---|
| I. Everything runs in the browser | **PASS** | AirflowNetwork is a group of IDF objects. Nothing is fetched, nothing is uploaded, the engine is the same WebAssembly build. |
| II. Deterministic and shareable | **PASS** | Every setting is a scalar on `params`: one `Selector`, eight `Scale`s and one `Facade` of four keys. All are additions, so the link stays at `v1` with no `MIGRATIONS` step, and FR-020's pre-feature links resolve to the scheduled default. |
| III. Read it back off the model | **PASS** | The crack coefficients are derived from `geometryFacts` and `surfaceGeometry` off the document, never from `params`. The computed rate, the hours open and the description's clause are read off the run. `opensOutdoors(doc, name)` decides which surfaces get a linkage, so a sweep overlay and a bypassed Fabric are both covered by one question. |
| IV. No silent fallbacks | **PASS, and it is the plan's centre** | Three fatals, three refusals: no exterior surface refuses the channel through `requires`; a rule needing a setpoint always gets one written; a near-horizontal surface is never linked to an opening and the Skylights strip says so. A run that produced no flow letters an em dash, not a zero. |
| V. Only `@idfkit/*` at runtime | **PASS** | Nothing added. |
| VI. Latency is the interface | **PASS with a charge** | +20 ms on the design day, measured. Inside the budget, but 40 % of it. The three output requests are two zone-level and one that resolves to at most four series. |
| VII. Mobile-first and responsive | **PASS** | FR-004 requires the model in force be readable at the folded index row, which is what the folded strip's existing reading slot is for. The readout follows Glazing's, which already folds. No new breakpoint and no hover-only anything. |

**No entry in Complexity Tracking.** Nothing in this feature needs a
justification against a principle, which is the direct result of it taking a
shape the desk already has rather than inventing one.

**Re-checked after Phase 1.** The design added one thing the pre-research check
did not anticipate, and it strengthens rather than weakens the position: the
`requires` gate on the Air channel, forced by the measured no-exterior-surface
fatal. It is Principle IV machinery that already exists, used for the case it
was built for. Nothing in `data-model.md` or the three contracts introduced a
new module, a new control kind, a new dependency, a new breakpoint or a new
link version, so every verdict above stands as written.

The one place worth naming explicitly: **FR-012's wind bound is built, through
EMS, and it is the first Erl program on this desk.** No AirflowNetwork object
carries a wind speed field, but the engine exposes an actuator on the venting
opening factor and `Site Wind Speed` as a sensor, so the bound is reachable and
was measured working. Its whole subtlety is the `Null` release: an actuator
that is forced rather than released does not bound the opening rule, it
replaces it, and that failure is clean and silent. The contract carries the
rule and the quickstart carries the gate.

The alternative was to declare the control and let it reach nothing, which is
the dead control User Story 2 exists to prevent and would have been the wrong
answer to a question that turned out to have a right one.

## Project Structure

### Documentation (this feature)

```text
specs/001-afn-natural-ventilation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── air-channel.md   # The control declarations and the exclusivity rule
│   ├── network-model.md # applyAir's network half: objects, names, arithmetic
│   └── readings.md      # What is read back off the run, and its refusals
├── checklists/
│   └── requirements.md  # Existing
└── tasks.md             # Phase 2 output, NOT created by /speckit-plan
```

### Source code

No new module. The feature lands in files that already exist, and the reason is
worth stating: a `src/afn.js` was considered and rejected. TM59 earned its own
module because it is a published method with its own data and its own
vocabulary. A pressure network is not a method laid over the desk, it is a
second way of writing one channel's objects, so it belongs in the applier that
owns that channel.

```text
src/
├── controls.js   # + `airModel` selector, `envLeak`, the `openable` Facade,
│                 #   `openRule`, `openSetpoint`, the two ΔT bounds,
│                 #   `openMaxWind`, and `Readout` on the Air channel.
│                 #   `needs:` on every existing
│                 #   scheduled control so it withdraws under the network.
├── model.js      # + `applyNetwork` and `applyWindBound` (the EMS), called
│                 #   from `applyAir`; + the Air
│                 #   channel's `requires` gate; + the AFN types in the sweep
│                 #   that `applyAir` clears; + two output requests in
│                 #   `syncReporting`, channel-gated as the rail terms are.
├── readings.js   # + `networkFlow(eso)`: the summed ACH and the hours open,
│                 #   DOM-free, so the harness calls the real one.
├── main.js       # + the Air entry in `readouts()`; + `lastNetwork` beside
│                 #   `lastGlass`, taken down by `clearReadings`.
├── describe.js   # + the air clause branching on which model is in force.
└── tour.js       # + the note copy wherever it names the Air strip's controls.
```

**Structure Decision**: the existing single `src/` tree, unchanged in shape.
The feature adds roughly 400 lines across six files and no new file.

## The six decisions that shape the work

Everything below follows from the specification and the measurements; they are
here because each one has an obvious alternative that is wrong.

**1. The scheduled model's controls withdraw through `needs`, not through a
second strip.** Every existing Air control gains
`needs: (p) => p.airModel === 'Scheduled'`, and every new one the mirror of it.
This is the mechanism Glazing already uses for `uFactor` against `panes`, it
takes a control out of the tab order through the existing fold machinery, and it
means User Story 2's guarantee is enforced by the same declaration the console
draws from. A second strip would put two meters on the rail where FR-004a says
there is one term.

**2. The objects of the model that is out are deleted, not zeroed.**
`applyAir` already clears `ZoneInfiltration:DesignFlowRate` and
`ZoneVentilation:DesignFlowRate` on every apply. It gains the six AFN types in
the same sweep, and then writes one side or the other. FR-002a's requirement
that the engine report no discard warning falls out of this for free, and so
does FR-023's idempotence: clear-and-rewrite serialises identically however the
desk got to its current position.

**3. The crack coefficient is derived per surface, from the document.** One
`Surface:Crack` per exterior surface, sized by that surface's share of the
exterior area. The research phase found that a per-square-metre figure written
as a whole-surface coefficient runs clean and is wrong by eighty-fold, so this
is the decision the harness has to check hardest.

**4. The computed rate is the sum of two series.** `AFN Zone Infiltration Air
Change Rate` is the cracks, `AFN Zone Ventilation Air Change Rate` is the
openings, and on the measured desk they were 0.0007 and 0.684. Reading either
alone letters a number about part of the building under a label claiming the
whole of it.

**5. The wind bound is EMS, and the actuator is released rather than forced.**
No AirflowNetwork object carries a wind speed, but the engine exposes an
actuator on the venting opening factor and `Site Wind Speed` as a sensor. The
program shuts every openable window above the threshold and sets each actuator
to `Null` below it, which hands control back to the engine's own venting logic.
Forcing a value in the else-branch instead is the failure that runs clean:
measured at 8,808 hours open against 2,601, the temperature rule silently
overridden, exit 0 and zero warnings.

**6. The Air channel gains a `requires` gate, conditional on the model in
force.** `(p, on, off) => p.airModel !== 'Network' || (!off('fabric') && any
surface opens outdoors)`. The predicate reads `off` rather than `on` for the
reason `CLAUDE.md` records under "The opening that had nowhere to go": Fabric is
declared two strips below Air, so `on('fabric')` would be asking about a channel
that has not been decided. Being patched out is an input to that loop and can be
asked in any order.

## Complexity Tracking

Not applicable. The Constitution Check passed with no violations.
