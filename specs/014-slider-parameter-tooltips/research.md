# Research: Slider parameter help notes

Phase 0 for [spec.md](./spec.md). Every figure below was measured by importing the
real, DOM-free modules in Node, not estimated from reading; the script and its output
are recorded so the count can be re-run after `controls.js` changes.

## R1. What "every parameter that has a slider" means, and how many there are

**Decision**: a slider-based parameter is exactly a control for which
`refusesSweep(control)` (`src/study.js:110`) returns `null`, the same predicate that
already decides whether the Design Space Survey's axis chooser lists a control as
available rather than under "controls with no face." A control counts once even where
it draws through several `sides` (a `Facade`'s four walls resolve to one control with
one `note`).

**Measured**, importing `CHANNELS` from `src/controls.js` and `refusesSweep` from
`src/study.js` directly in Node:

| | Count |
| --- | --- |
| Controls, every kind | 129 |
| Sweepable (a slider, by this definition) | 87 |
| Sweepable, already carrying a `note` | 42 |
| Sweepable, no `note` yet | 45 |

After implementation (census re-run 2026-09-21): 87 sweepable, 87 with a note, 0 without.

The 45 include the desk's own massing (`width`, `depth`, `height`), context geometry,
several fabric and glazing faces, most of Gains, and the solver's own convergence
tolerances. None is a `Selector`, a `Days` list, a `Pattern`, a `Calendar` or a bare
`Bearing` used only for orientation, those either carry their explanation on their
own chosen option already (a `Selector`'s options each cite their own source,
e.g. `controls.js:1986`) or have no numeric face and are excluded from `refusesSweep`
by construction.

**Rationale**: reusing `refusesSweep` rather than inventing a second "is this a
slider" test means the scope of this feature is never able to disagree with what the
survey chooser itself already offers as an axis, the two questions (does the sheet
let you cut a ground along this control, does this control get a help note) are
answered by the same fact about the control, which is Principle III's own rule applied
to a boundary between two features rather than within one.

**Alternatives considered**:

- *Scope to `kind === 'scale'` only.* Undercounts: two `Bearing`s and the `Facade`
  walls are dragged along a graduated face exactly as a `Scale` is, and the request's
  own example fields (frame width, U-factor) are ordinary `Scale`s already inside this
  set. `refusesSweep` already draws the line the reader would draw by eye.
- *Scope to controls already offered on the Model Console with a numeric readout,
  independent of the survey.* The same set in practice, a control with a numeric
  face is drawn as a slider on the console specifically because it has one, but
  defined against a console rendering detail rather than a single predicate a load-time
  assertion (R2) can check without importing `console.js`, which has a DOM.

**Finding, measured 2026-09-21 against the bundled 26.1.0 schema and prose**: of the
34 unnoted controls that map to an EnergyPlus object and field, 14 carry an IDD memo
(for example `WindowMaterial:SimpleGlazingSystem.u_factor`: "Enter U-Factor including
film coefficients"). Another 19 carry only a type, units, bounds and sometimes a
default (for example `Material:NoMass.solar_absorptance`: `{d: 0.7, min: 0, max: 1}`).
The remaining one, `daylight:dlSetpoint`, sits in the extensible `control_data` group
of `Daylighting:Controls`, which `schema.field()` does not resolve; it is read through
`schema.get(...).x.p`. Under FR-010 a note cites the memo where one exists and
otherwise the field's units, bounds and default.

## R2. Closing the gap at load time, not by inspection

**Decision**: add one assertion in `src/study.js`, run once at module load beside the
existing roster assertions that module already makes, over every control in `CHANNELS`:

```text
for (const channel of CHANNELS) {
  for (const control of channel.controls) {
    if (refusesSweep(control)) continue;
    if (!control.note) throw new Error(`${channel.id}:${control.key} has a face to sweep and no note`);
  }
}
```

**Rationale**: `Landmark` already throws at construction when its own `note` is
missing (`"${label}" cites nothing`, `src/controls.js:213`) precisely so that a claim
about the world cannot enter the page unsourced. A slider's own note is the same kind
of claim at a coarser grain, not "double glazing runs 2.7 to 3.0" but "this is the
field EnergyPlus calls X and here is what moving it does", and deserves the same
gate: a control added later with a numeric face and no note fails the build the same
way a landmark with no citation always has, rather than shipping a chooser row with an
indicator and nothing behind it (spec FR-007).

Placed in `study.js` rather than `controls.js` because `study.js` already imports
`CHANNELS` and already owns `refusesSweep`; `controls.js` does not import `study.js`
and must not start to, so the check has to live on the side of the import that already
has both pieces.

**Alternatives considered**:

- *Assert inside `controls.js` itself, re-deriving "has a face" from `min`/`max`/`step`
  directly.* Works, but restates `refusesSweep`'s own three-field check a second time
  in a second module, which is exactly the drift Principle III's "declared once" rule
  exists to prevent, a future change to what counts as a face (a fourth required
  field, say) would have to be made in two places to stay true.
- *A Node script run by hand rather than a load-time throw.* Every other declaration
  invariant on this sheet throws at load (constitution, workflow gate 5); a script run
  by habit is a check that stops running the day someone forgets to run it.

## R3. The note and the "why this is inert" reason share a field today; keep them from repeating themselves

(Revised 2026-09-21: no control declares `inert`, so the branch that made a row's reason equal its note was deleted from `axisOffers`, and the de-duplication guard with it. The explanation is now `faceless ? null : control.note ?? null`.) The analysis below is kept as the record of why the guard was first specified.

**Decision**: where `axisOffers` (`src/main.js:9998-10060`) already sets a row's
`reason` to `control.note`, the existing behaviour for a control that is inert at
this desk (`control.inert?.(snapshot) ? control.note : ...`, `src/main.js:10036-10037`,
the same reuse `pull.js:175` makes), the offer's `note` field is left unset for that
row rather than repeating the identical sentence a second time under a second label.
Every other row (available, or refused for a different reason: patched out, blocked,
a side that does not reach) carries its `note` as well as its `reason`, since the two
say different things there.

**Rationale**: `control.note` was written to answer one question, what this field
does and how it reaches the engine, and reusing that same sentence as the *reason* an
inert control cannot be swept is coherent, not a bug: a field that only matters under
natural ventilation already explains that fact in its own note, and that is exactly
why it is not reachable under the network model. Printing it once, as the reason, tells
the reader everything the note would have; printing it twice would be the copy-budget
mistake the design system already names once for group-shared reasons
(`.interface-design/system.md:854-864`, "a reason that is true of a whole group
belongs to the group") applied to a single row instead of a group.

**Alternatives considered**:

- *Always show both `reason` and `note`, letting the identical sentence appear twice.*
  Simplest to implement, and exactly the defect spec.md's edge cases call out: the
  help text and the unavailability reason would blend into one one restated line
  rather than staying distinct as two different kinds of fact where they are two.
- *Suppress `note` on every refused row, not only the inert one.* Loses information
  for a row refused for an unrelated reason (channel patched out, a side that cannot
  reach), the reader still wants to know what the field does even though it is
  greyed out for a reason that has nothing to do with the field's own explanation.

## R4. A declared budget for the note, not an eyeballed one

**Decision**: add `CONTROL_NOTE` to the roster in `src/copy.js`
(`contracts/slider-notes.md` for the exact export), at 77 words, and assert every
`control.note` against it in `assertCopy` in `controls.js`, beside the existing
`STRIP_LINE` and `STANDING` checks. The budget is declared in `copy.js`; the
assertion lives with the declarations it checks. The 77-word figure is not invented:
it is the ceiling the console's own doc comment already states for the 42 notes that
exist today (`src/console.js:108`), turned from a sentence in a comment into a number
the load path checks.

**Rationale**: `src/copy.js`'s whole reason to exist is that a budget stated only in
prose drifts the day nobody is looking (`docs/design-notes.md` "Copy budgets and
folds"); the 45 new notes are exactly the moment a second author, without having read
that comment, could write a hundred-word paragraph and have nothing catch it before it
reached the page. The budget holds regardless of what a note cites: a schema-field
citation (FR-010, the required source wherever a control maps to an EnergyPlus object
and field) reads no longer than a citation of some other real source or a plain
description of what a schema-less control writes (FR-008).

**Alternatives considered**: leave the ceiling as a comment. Consistent with nothing
enforcing it today, which is itself the gap; adding 45 notes under an unenforced
ceiling is the wrong moment to leave it unenforced.

## R5. Nothing here touches a model, a link, or a solve

**Decision**: none of the constitution's model-verification gates (idempotence,
schema validation, a run through EnergyPlus, `.rdd` cross-checks) apply to this
feature, and [quickstart.md](./quickstart.md) does not exercise them.

**Rationale**: `control.note` is prose attached to a declaration; it is never read by
`applyModel`, never appears in `encodeState`/`decodeState`, and is not among the
fields any channel applier reads. The only things that change are what the console and
the chooser draw and one array of strings in `controls.js`. The relevant constitution
gates are Principle III (one field, read twice, never restated) and Principle VII
(reachable by click or tap, at 390 px), both covered above.

**Alternatives considered**: none, this is a scope boundary, not a choice between
approaches, and it is stated here only so a future reader does not assume a run
through EnergyPlus is part of this feature's own verification.
