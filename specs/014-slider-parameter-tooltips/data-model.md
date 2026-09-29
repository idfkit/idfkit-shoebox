# Data model: Slider parameter help notes

Phase 1 for [spec.md](./spec.md), after [research.md](./research.md). No entity here
is stored anywhere but in memory for the life of the page; nothing reaches the IDF or
the link.

## Changed: `Control.note` (`src/controls.js`)

The field already exists (constructor parameter, default `null`) and is unchanged in
shape. What changes is coverage and enforcement.

| Field | Type | Meaning |
| --- | --- | --- |
| `note` | `string \| null` | What this field represents, how it drives the EnergyPlus simulation, and where its stated fact, default or limit comes from. `null` only for a control with no numeric face (a `Selector`, `Days`, `Pattern`, `Calendar`, or a `Bearing` used purely for orientation). |

**Validation, at declaration**: unchanged, a control may declare `note` or not.

**Validation, at module load (new, in `src/study.js`, research.md R2)**: for every
control in `CHANNELS` where `refusesSweep(control) === null`, `control.note` MUST be
a non-empty string. A sweepable control with no note throws, naming the channel and
control key, before the module finishes loading.

**Validation, per string (new, in `src/copy.js`, research.md R4)**: every declared
`note` is checked against the `CONTROL_NOTE` budget (77 words) at the point it is
declared, the same way `STRIP_LINE` and the other budgets already gate their strings.

**Content rule (FR-008 and FR-010, no new field)**: where a control maps to a specific
EnergyPlus object and field, its note cites that field's own definition in idfkit's
bundled EnergyPlus schema (FR-010); the citation is human-authored, with no automated
check against the schema. Where a control has no corresponding EnergyPlus object or
field (massing width, depth, height, and the rest of the schema-less remainder), the
note describes what the control writes and cites a real source where one applies. It
never cites something that does not exist, and it need not state that no field or no
published source backs the value (FR-008). This is
a content constraint on the string, not a schema change, there is no separate
"unsourced" or "schema field" flag, because a note is read in only one place and a
second field would be the second source of truth Principle III forbids.

## Unchanged: `Landmark.note` (`src/controls.js:208-242`)

Named here only to keep the two apart: a landmark's `note` documents one band on a
control's face (a range or a limit); `Control.note` documents the field as a whole.
A control can carry both, independently, and this feature does not touch
`Landmark` or `readLandmarks`.

## New: the axis offer's `explanation` (`src/main.js`, `axisOffers`)

Not a new class, one new key on the plain object `axisOffers` already builds per row,
and the same key on the option `axisOptions` derives from it.

| Field | Type | New | Meaning |
| --- | --- | --- | --- |
| `explanation` | `string \| null` | yes | `control.note`, carried onto the offer and passed through `axisOptions` to the option `pickList` draws. `null` for a faceless control. |

**Derivation**:

```text
explanation = faceless ? null : control.note ?? null
```

(Revised 2026-09-21: no control declares `inert`, so the branch that made a row's reason equal its note was deleted from `axisOffers`, and the de-duplication guard with it. The explanation is now `faceless ? null : control.note ?? null`.)

## Changed: `pickList` / `draw` rendering (`src/main.js`)

No signature change. In `draw`, each row is a `div.survey-row` holding the pick button, a marker button on the same line (`+` closed, `−` open, `aria-label` "Note on <label>", `aria-expanded`), and the note as `p.ctl-note` beneath both, hidden until the marker is pressed. This is drawn wherever `option.explanation` is set, on an available or
a refused row. The open state is held in `openPickNotes`, keyed
`${label}:${option.id}`. The filter's `apply` hides the whole row, and the row's
search text includes `option.explanation`. (Revised 2026-09-21: the first version
drew a `Note` fold under every row, which doubled the height of the list.)

`option.note` is unchanged: it remains the always-visible short line under an
available row's label, which the reading chooser uses for a unit string. The
explanation is not put there, because a note of up to 77 words standing in view on
every row breaks the copy budget, and because that slot is not drawn on refused rows.
