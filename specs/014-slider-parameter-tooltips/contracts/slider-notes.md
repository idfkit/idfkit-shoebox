# Contract: the slider note, on the console and in the chooser

What a maintainer can rely on about `control.note` after this feature, on both
surfaces that show it, and the two checks that hold it true.

## The one source

`note` is a field on `Control` (`src/controls.js`), declared once per control beside
its `label`, `min`, `max` and `step`. Every surface that shows a control's
explanation reads this same field. Nothing in this feature introduces a second place
the text can be typed, not a chooser-specific string, not a copy of it in
`main.js`, not a duplicate in a schema or a JSON file.

## Who is covered

`covered(control) ⟺ refusesSweep(control) === null` (`src/study.js:110`). A control
outside that set (a `Selector`, `Days`, `Pattern`, `Calendar`, an orientation-only
`Bearing`) may carry a `note` or not; nothing here requires or forbids it for them.

## The load-time gate

**Module**: `src/study.js`, run once at import, beside the module's existing roster
assertions.

**Rule**: for every control in `CHANNELS` with `covered(control)`, `control.note` is
a non-empty string.

**Refusal**, at load:

```text
Error: fabric:roofR has a face to sweep and no note
```

Naming the channel id and the control key, the same shape every other declaration
throw on this sheet already uses, so the message points at the control to fix.

## The word budget

**Module**: declared in `src/copy.js`, asserted in `assertCopy` in `src/controls.js`.

**Rule**: `CONTROL_NOTE` joins the existing `BUDGETS` roster at 77 words. Every
`note` string on every control, sweepable or not, is checked against it via
`withinBudget` in `assertCopy`, beside the `STRIP_LINE` and `STANDING` checks.

## Where it is drawn: the Model Console

**Unchanged.** `noteFold(control)` (`src/console.js:114-117`) is called wherever a
control row already calls it (nine strip builders); it renders unconditionally on
`control.note`, so the moment a covered control's `note` stops being `null`, its fold
appears with no further code change. The fold contract itself
(`.interface-design/system.md:394-429`) is untouched: `+` closed, `Note` summary with
an `aria-label` naming the control, opened by click or Enter/Space, never by hover.

## Where it is drawn: the Design Space Survey axis chooser

**Changed.** `axisOffers` (`src/main.js`) gains one derived field on the object it
already pushes per row:

```text
explanation = faceless ? null : control.note ?? null
```

- `reason` (channel out, blocked, withdrawn, or a side that cannot reach) is never
  the note: the branch that set it to `control.note` for an `inert` control was
  deleted, since no control declares `inert`. (Revised 2026-09-21: no control declares `inert`, so the branch that made a row's reason equal its note was deleted from `axisOffers`, and the de-duplication guard with it. The explanation is now `faceless ? null : control.note ?? null`.)
- `axisOptions` in `renderSurveyChoose` copies only named fields from an offer into
  the option `pickList` draws, so it passes `explanation` through explicitly. An
  offer field that `axisOptions` does not copy never reaches the chooser.

The field is named `explanation`, not `note`, because `option.note` already has a
meaning in `pickList`: an always-visible `<small>` line under an available row's
label, used by the reading chooser for a unit string. A note of up to 77 words in
that slot would stand in view on every row, which the copy-budget rule forbids (in
view, at most one short line; long text goes in a fold), and it would be absent from
refused rows. `option.note` keeps its current meaning.

**Rendering, in `pickList`'s `draw`.** Where `option.explanation` is set, on an
available row or a refused one, each row is a `div.survey-row` holding the pick button, a marker button on the same line (`+` closed, `−` open, `aria-label` "Note on <label>", `aria-expanded`), and the note as `p.ctl-note` beneath both, hidden until the marker is pressed. A closed note adds no height to
the list. The filter hides and shows the whole row, and the row's search text
includes the explanation. The open state is keyed by the chooser's label and the
control, so Axis X and Axis Y keep it independently, and `openPickNotes` keeps it
across the chooser's redraws. (Revised 2026-09-21: a `Note` fold under every row
doubled the length of the list.)

## Invariants

- A row's `reason` is never its note, so the two never repeat each other.
- A covered control with `note === null` cannot reach a build: the load-time gate
  above throws first.
- Opening or closing a note (console fold or chooser row) changes no entry on
  `params`, is not read by `encodeState`/`decodeState`, and does not appear in
  `CHANNELS[*].controls[*]` beyond the one field it already was.
- A note authored for this feature cites where its fact comes from. Where the control
  maps to a specific EnergyPlus object and field, that citation is the field's own
  definition in idfkit's bundled EnergyPlus schema (FR-010); otherwise it names its
  real source where one applies and never invents one (FR-008). The load gate
  checks presence and length, not truthfulness or accuracy of the citation, which
  (per the 2026-09-21 clarification) is a review responsibility the same way it
  already is for every existing note and every `Landmark`, not an automated check
  against the schema.

## Non-goals

- No change to `Landmark` or `readLandmarks`.
- No change to the reading chooser or the study-quantity chooser (`studyQuantityChooser`,
  `src/console.js:2001`), neither builds its offers through `axisOffers`, and neither
  is in scope (spec.md's parameters are controls, not readings).
- No new icon glyph: the chooser's marker uses the register's own `+` and `−`.
  The CSS added is the `.survey-row` grid, the marker, and the note's placement.
