# Implementation Plan: A daylight reading on the roster

**Branch**: `014-daylight-reading` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-daylight-reading/spec.md`

## Summary

Put one daylight quantity on the roster of readings, so the energy and daylight trade can
be cut as a study curve or an E-02 ground without a second view or a second tool. The
reading is the median illuminance over occupied hours at one point deep in the room,
measured by a reference point that controls nothing.

Three things have to be true for that number to be worth lettering, and the plan is
arranged around them rather than around the modules it touches.

**It has to exist where the problem lives.** The Daylight channel is bypassed on the
shipped desk, so a reading gated behind it would be absent exactly where the sheet
recommends the darkest room. The probe is therefore written by its own applier on every
solve, outside that channel's gate, and the channel's dimming sensor joins the object the
probe owns rather than the other way round. Measured: the probe reports 194 lx at noon on
21 June with Gains in, with Gains out, and with the Daylight channel engaged, and it is
reference point 1 in all three (research §1).

**It must not change the building it reads.** A reference point at zero controlled fraction
computes daylight and dims nothing: 5975.5 kWh of annual lighting with and without, and
3698.4 kWh with and without when the channel is dimming. Both measured.

**It has to be honest about being a ranking instrument.** The number is offered as a
comparison between positions of this desk. It carries no published line, and the register
already has the mechanism for saying so: membership of the closed `nonTargets` set at
`src/study.js:942`, which a load assertion makes mandatory, and the survey's existing
`absenceIn` sentence, which already letters "No standard on this sheet publishes a limit
for {label}". Six readings take that path today. Daylight is the seventh, and the first
that is a measured physical quantity rather than a container or a priced figure.

The reflectance correction ships in the same change, because the two known errors run in
opposite directions and correcting either alone makes the published reading worse than
correcting neither. Reading the code turned the correction out to be wider than the
assessment recorded: the ceiling is slaved to `roofAbs` exactly as the walls are to
`wallAbs`, and on a desk with wall mass the interior face is a hard-coded 0.65 that no
control reaches at all (research §4).

**One thing in the specification conflicts with the repository's own conventions and is
not resolved here.** FR-005 requires the method be stated in view and not in a fold;
`CLAUDE.md:411-416` requires method and citations go in a fold. Research §6 proposes the
reconciliation the design system's own "Qualifying a reading in place" pattern already
uses, and flags it for the maintainer rather than deciding it quietly.

## Technical Context

**Language/Version**: vanilla ES modules (ES2022), no transpiler; Node 22 for harnesses

**Primary Dependencies**: none added. `@idfkit/*` only, per Principle V

**Storage**: N/A. The chosen reading rides the URL fragment as a value under the existing
reserved `sty` / `sv` keys; the new interior reflectance control rides it as a new
parameter key. Nothing new is remembered in `localStorage`

**Testing**: no test runner, no linter. Throwaway Node harnesses under `.harness/`, then
the page is driven. EnergyPlus 26.1.0 is installed at `/Applications/EnergyPlus-26-1-0`
and the harness prefers it. See [quickstart.md](./quickstart.md)

**Target Platform**: static site, the reader's own browser

**Project Type**: single-page client-side application, `src/*.js` + `index.html`

**Performance Goals**: one additional hourly zone-average ESO series on every solve. The
annual budget is bounded by the measured +5 % at nine probe points
(`.harness/tmp-daylight-wasm.mjs`); this writes one. The figure nobody has measured is the
design-day solve that re-runs continuously during a drag at about 50 ms and now carries
the probe on every frame. That measurement is quickstart step 8 and is owed before the
feature is called done, not assumed

**Constraints**: no new hue. An illuminance is an unsigned magnitude, so `--cold` / `--warm`
are unavailable by `.interface-design/system.md:67-76` and the reading is graphite. One
more entry in every reading chooser, plus a probe position and a validity statement, must
stay readable at 390 px without hover

**Scale/Scope**: the roster goes from 13 quantities / 15 series to 14 / 16. One control is
added. Eight source files change, one is added, and two harnesses gain standing checks. The
one existing behaviour that moves is which module owns `Daylighting:Controls`

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes below.*

| Principle | Verdict | Why |
|---|---|---|
| I. Everything runs in the browser | **Pass, untouched** | No request, no service, no upload. One more output variable in a document the reader's own engine runs. |
| II. Deterministic and shareable | **Pass, with a bump owed to nothing** | A reading id is a link **value**, so `LINK_VERSION` does not move for the reading (research §9, `src/permalink.js:104`, `:590`). The interior reflectance control is a **new key**, and adding a control is free under the delta-encoded format. Every parameter added is a scalar. What does change is what an old link *produces*: the reflectance correction moves lighting energy on any desk with Daylight engaged, and the spec records that as accepted. Two id constraints are load-bearing and stated in research §9: no dot in either id, and neither can ever be renamed. |
| III. Read it back off the model | **Pass, and it is the point of the feature** | The reading is read off the ESO of the run that was solved, never computed from `params`. The occupied floor reaches a sampled reading through the quantity's `context` hook, as the three TM59 quantities already do, rather than off live `params`. The probe's position is read back off the document's own floor extent, not recomputed from the width and depth controls. |
| IV. No silent fallbacks | **Pass, and sharpened** | A run that cannot answer the reading returns an absence carrying its reason, by the same constructor that makes "a value and a reason" unconstructable (`src/tm59.js:563-593`). A desk with no opening reports a **measured zero**, which is a different thing and is measured, not assumed (research §3). Three new load-time throws carry FR-020. |
| V. Only `@idfkit/*` at runtime | **Pass** | Nothing added. A median needs a sort, not a library. |
| VI. Latency is the interface | **Pass, with a measurement owed** | One hourly zone-average series, not per-surface. `shapeKey` is untouched because the probe is unconditional: it is not a thing the reader selects, so it cannot reach the solve identity key, and every cached study or survey sample can answer the reading because every sample carried the probe. The design-day cost is measured in quickstart step 8 rather than assumed. |
| VII. Mobile-first and responsive | **Pass, with a check owed** | One more row in choosers that already draw rows. The probe position and validity statement are new always-visible text and are the real risk; checked at 390 px in both unit systems in quickstart step 9. Nothing moves to hover. |

**Workflow gates.** Unlike feature 013, this one writes IDF objects, so the gates that 013
satisfied by its diff have to be satisfied by runs.

- **Gate 1 (verified outside the browser first)**: started. `.harness/tmp-probe-arrangement.mjs`
  already answers where the probe can be written and what it is called. The reader and the
  reflectance correction need their own.
- **Gate 2 (idempotence)**: **triggered and load-bearing.** `applyModel` three times must be
  byte-identical, and the probe's applier must remove its objects rather than leave orphans
  when the Daylight channel's sensor comes and goes. This is the gate most likely to catch a
  defect in this feature, because ownership of `Daylighting:Controls` moves.
- **Gate 3 (every IDF validated and run)**: triggered, including `.harness/variables.mjs`
  gaining the new output variable. That harness exists because a drifted variable name does
  not stop a run: it writes one line into `eplusout.err` and the reader gets an absence with
  the wrong explanation.
- **Gate 4 (codec round trip)**: triggered by the new control key and the new reading id,
  plus a pre-existing link re-read. `.harness/links.mjs`.
- **Gate 5 (declaration invariants throw at load)**: three added, listed in
  [data-model.md](./data-model.md).
- **Gate 6 (general notes)**: **triggered**, not merely evaluated. FR-021. This feature adds
  a reading and changes what the Daylight channel writes, so `NOTES` in `src/tour.js` changes
  and its storage key bumps.
- **Gate 8 (design system)**: **triggered.** Whatever is decided about research §6 is
  recorded in `.interface-design/system.md` in the same change, because a pattern living only
  in a stylesheet is the second source of truth Principle III forbids.

**No complexity tracking table**: there are no violations to justify. The one open question
is a conflict between the specification and a convention, not a departure from a principle,
and it is raised in research §6 for decision rather than carried as a violation.

## Project Structure

### Documentation (this feature)

```text
specs/014-daylight-reading/
├── plan.md              # This file
├── research.md          # Phase 0 output, 13 sections, every decision measured or quoted
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── daylight.md      # Phase 1 output, the module surface and its invariants
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # /speckit-tasks output, NOT created here
```

### Source code (repository root)

Eight files change, one is added. The added module is the reader, which is DOM-free so a
Node harness calls the real code.

```text
src/
├── model.js        # the probe's own applier, owning Daylighting:Controls on every desk;
│                   # applyDaylight contributes its sensor to it instead of writing it;
│                   # applyFabric stops writing visible_absorptance from wallAbs/roofAbs;
│                   # one interior reflectance written to every opaque material;
│                   # syncReporting's 'sheet' branch gains the illuminance variable
├── daylight.js     # ADDED. DOM-free: the median over occupied hours, the absence
│                   # reasons, the validity limit, the probe's stated position
├── controls.js     # one new Scale for interior visible reflectance, on the Fabric
│                   # channel, with published landmarks; wallAbs and roofAbs keep their
│                   # own meaning and lose the one they should never have had
├── contents.js     # untouched, but named here because the RunContents class lives in it
│                   # and a reader looking for it in study.js will not find it
├── study.js        # one Quantity + one QuantitySeries; the DAYLIGHT RunContents
│                   # constant; the new id added to the nonTargets set at :942
├── survey.js       # one SENSE entry, better: 'higher', with its why
├── readings.js     # untouched in arithmetic; the daylight reader lives in daylight.js
│                   # because it needs the occupancy and design-day rules, not the ESO
│                   # helpers alone
├── console.js      # the reading's method fold and its in-view qualification, pending
│                   # the decision in research §6
└── tour.js         # NOTES for the new reading and the changed Daylight channel;
                    # storage key bumped

.harness/
├── variables.mjs   # the new output variable joins the standing existence gate
└── links.mjs       # the new control key and reading id round trip

docs/design-notes.md        # why the probe owns the controls object, the ordinal pin,
                            # and the reflectance defect's three-surface shape
.interface-design/system.md # whatever research §6 settles
CLAUDE.md                   # the one-line summary under a new Daylight entry
```

**Structure Decision**: The existing single-project layout is kept. The feature lands in
three layers and the split is deliberate: `model.js` decides what the engine is asked,
`daylight.js` decides what the answer means, and `study.js` / `survey.js` decide where the
answer can be chosen. The reader is a new module rather than an addition to `readings.js`
because it needs the occupancy floor and the design-day exclusion, which live with the
TM59 machinery, and folding it into `readings.js` would pull those rules into a module
whose whole discipline is that it knows only the ESO.

## Phase 1 design summary

- **[data-model.md](./data-model.md)**: the probe and its ownership, the `Quantity` and
  `QuantitySeries` entries with every field, the new control, the reader's inputs and
  outputs, the absence reasons, and the three invariants stated as the throws they compile
  to.
- **[contracts/daylight.md](./contracts/daylight.md)**: the module surface after the
  change: what `daylight.js` exports, what `model.js` writes and when, what throws at load,
  and the one call whose ownership moves.
- **[quickstart.md](./quickstart.md)**: nine steps, each a thing that can come back wrong:
  the invariants, idempotence with ownership moving, the output variable's existence, the
  neutrality claim at full precision, the ordinal pin, the codec both ways, the reflectance
  correction across both construction variants, the design-day cost during a drag, and
  390 px in both unit systems.

## Post-design constitution re-check

Re-evaluated against the artifacts above: unchanged, all pass. The design added no run-time
dependency, no network call, no hue, and no hover-only text. It adds one `params` key, which
is a scalar and rides the link as the format already allows, and one output variable, which
is zone-level rather than per-surface.

Two things the constitution watches closely are worth naming rather than leaving to the
table above.

**Ownership of an IDF object moves between appliers**, which is the kind of change that
leaves orphans. Principle IV's answer is a throw rather than a tidy-up, and gate 2's answer
is a measurement; both are in the quickstart, and the idempotence check is the one step of
this plan most likely to fail first.

**The feature makes a reading that no standard judges a first-class citizen of the
register**, which the assessment flagged as possibly a new case. It is not: the mechanism
exists, six readings already use it, and the load assertion at `src/study.js:946-950` forces
the new reading to declare itself one way or the other. What is new is only that this is the
first measured physical quantity to take that path, and nothing in the mechanism cares.
