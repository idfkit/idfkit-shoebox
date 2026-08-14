# Interface design system

A drawing sheet, not a dashboard. Everything on the page is read back off the
EnergyPlus model rather than transcribed, and the interface is expected to be
honest about what it does and does not know.

## Direction and feel

The product's world is a drafting office: bond paper on a board, 2H graphite,
one red pencil for markup, a trace sheet pulled across the drawing. Quiet,
dense, technical, and sharp rather than friendly. Craft here whispers: if a
border is the first thing you see, it is too strong.

Two surfaces carry the two halves of the product. The **sheet** is the drawing,
which is read. The **vellum** is the console, which is worked. They share one
hue and differ only in lightness, so the console reads as a second sheet laid on
the same board, never as a dialog floating over one.

## Depth

**Hairline borders only.** No shadows anywhere, in either theme. Paper does not
float. Elevation is expressed by surface lightness and by border weight.

Surface scale, base to highest:

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--board` | `#e6e2da` | `#131518` | the desk the sheet lies on |
| `--sheet` | `#f6f3ec` | `#1b1e22` | the drawing |
| `--vellum` | `#f1ede4` | `#191c20` | the console, a second sheet |
| `--inset` | `#efebe2` | `#17191d` | fields that receive content, meter troughs |

Inputs are **darker** than their surroundings, not lighter. An inset field
signals "type here" without needing a heavy border.

## Colour

Four ink levels, all used: `--ink` (primary), `--ink-2` (supporting),
`--ink-3` (labels and metadata), `--ink-ghost` (underlay, empty, disabled).

Four border weights, matched to the importance of the boundary:
`--rule-soft` (within a group), `--rule` (standard), `--rule-firm` (emphasis,
sheet edge), `--rule-focus` (focus rings only).

**Colour means something or it does not appear.**

- `--redline` is the markup pen. It marks what is live, what has changed, and
  what the pointer is on. One accent, nothing else.
- `--cold` / `--warm` encode a signed physical quantity and nothing else:
  degrees Celsius on the drawing, watts into or out of the zone on the console.
  Warm is heat arriving, cold is heat leaving.

Do not add a hue for a category, a channel, or a section. Non-photo blue was
explored for the "set but not in the model" state and rejected as a fourth
accent; ghost-weight graphite says the same thing in the palette that exists.

## Typography

`IBM Plex Sans` for prose, `IBM Plex Sans Condensed` for every label and
heading, `IBM Plex Mono` with `font-variant-numeric: tabular-nums` for every
number. A number that can change is always mono and always tabular, so it does
not jitter as it updates.

Labels are condensed, uppercase, and tracked. Tracking rises as size falls:

| Role | Spec |
| --- | --- |
| Eyebrow | `500 10.5px/1` cond, upper, `0.13em` |
| Panel heading | `600 17px/1.1` cond, upper, `0.05em` |
| Strip heading | `600 12px/1` cond, upper, `0.11em` |
| Control label | `500 9.5px/1.3` cond, upper, `0.11em` |
| Segment label | `500 9px/1.3` cond, upper, `0.07em` |
| Value readout | `400 11px/1.3` mono, tabular |
| Control note | `400 10.5px/1.45` sans, `--ink-ghost` |
| Strip blurb | `400 11.5px/1.5` sans, `--ink-3` |

## Radius

`--r: 2px` for panels, buttons, fields. `1px` for marks smaller than about
10px (the square patch marker, meter fills, swatches). Drafting is sharp;
nothing is rounded but the corner of a sheet.

## Spacing

Not a strict grid, and it should not pretend to be. The recurring component
values are what to reuse:

- Strip padding `14px 18px 16px`, separated by a `--rule` hairline.
- Controls within a strip: `11px` gap, `flex-direction: column`.
- Control head to its face: `4px`.
- Meter: `13px` above, `10px` below a `--rule-soft` hairline.
- Panel head and rail padding: `16px 18px 14px` and `12px 18px 14px`.

## Component patterns

### The calibration face (replaces a slider)

A ruled face with a penciled tick, with a real `input[type=range]` transparent
on top. The input carries the keyboard, the ARIA and the pointer handling; the
drawing below carries the reading. Never reimplement a slider on a `div`, it
costs the arrow keys.

- Face `15px` tall. Graduations via
  `repeating-linear-gradient(to right, var(--rule) 0 1px, transparent 1px 10%)`.
- Baseline `--rule-firm`, `1px`, `5px` from the bottom.
- Tick: `1px` wide, `13px` tall, `--ink`, with a `5px` square head at its foot.
- Ghost tick: `1px` by `9px`, `--ink-ghost`, marking where the value stood when
  the current gesture began.
- Hover turns the tick `--redline`. Focus ring goes on the face via
  `.face:has(input:focus-visible)`, because the input itself is invisible.

### Gesture ghosts

Any control whose value is being dragged shows a ghost of where it stood when
the gesture started, and the results it drives show a ghost of what they were.
A number that changes with no record of what it changed from is a flicker, not a
reading. Ghosts clear on gesture end, not on every frame.

### Segmented selector (replaces a dropdown)

Exclusive states on one segmented rule: `1px --rule` border, `var(--r)` radius,
`overflow: hidden`, segments divided by `--rule-soft`. Active segment is solid
`--ink` with `--vellum` text. Native `select` cannot be styled and hides state;
a console has to be readable without opening anything.

### The square marker

An `8px` to `9px` square with a `1px` border and `1px` radius means "a step that
is armed". Used by the run ledger, the auto-solve toggle, and the console's
patch buttons. Filled `--redline` when on, `--ink-ghost` outline when off.
Reuse it for any armed/not-armed state rather than inventing a switch.

### Signed meter bar

Centre-zero trough on `--inset` with a `--rule-soft` border, `6px` tall, a
`--rule-firm` hairline at 50%. Fill runs right from centre in `--warm` for
positive, left in `--cold` for negative, width scaled against the largest
reading on screen.

### Telling stacked segments apart without a second hue

When several segments stack on the same side of zero they share a hue, because
the hue is carrying the sign and nothing else may claim it. Separate them by
**tone**, stepping each one further towards the trough it sits in:

```js
const TONES = [100, 72, 50, 35, 26];           // percent of the hue
`color-mix(in srgb, var(--warm) ${TONES[i]}%, var(--inset))`
```

Mix towards `--inset` rather than towards a fixed lighter colour: the ramp then
steps down in light mode and up in dark, automatically, and always reads against
the trough. Order segments largest first from the centre so the ramp also ranks
them, and key the legend in the same order so a swatch can be matched by walking
outwards. Give segments a `box-shadow` divider in the panel surface colour
rather than a border, so it reads as a cut rather than an outline.

This is the general answer whenever a category needs distinguishing inside a
palette that has already spent its colour on meaning. Reach for tone, order and
labelling before reaching for a new hue.

### Absence is not zero

A reading with no data behind it renders as an em dash and is excluded from any
total. Zero is a measurement; missing is not one. Never substitute a previous
value or a default, and say in the interface which term is missing and why.
This is the visual half of the project's no-silent-fallbacks rule.

### Dimming conventions

- `.idle` at `opacity: 0.4`: the control is set but not currently reaching the
  model, given the rest of the configuration.
- `.out` at `opacity: 0.38` on the body and meter only, never the header: the
  whole path is out of the model. Values stay legible and settable.
- `.stale` at `opacity: 0.42`: results that describe a state the model no longer
  has.

### Drag bindings

Request `setPointerCapture` as an enhancement, but track drag state in a local
flag. Gating `pointermove` on `hasPointerCapture` produces a control that takes
its first click and silently ignores the rest of the gesture whenever capture is
declined. Always bind `pointercancel` alongside `pointerup`.

## Layout

The console is a real grid column, not an overlay:

```css
body.desk-open {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--desk); /* --desk: 436px */
  gap: 24px;
  padding-right: 0;
}
```

It is `position: sticky` with its own scroll, and its master readout is pinned
at the foot with `flex: none` so it stays visible while the strips scroll. Below
`780px` it stops being a column, stacks under the sheet, and gives up the sticky
foot.

## Declaring controls once

Controls live in one declarative module (`src/controls.js`) as typed classes,
not as duplicated markup. The panel reads it to draw, the model layer reads it
to write IDF, and any surface that repeats a control looks its spec up by key.
A range or a label changed there changes every place it appears. Prefer typed
objects over loose dictionaries for these declarations.

## Verify against the real thing

This interface generates input for a simulation engine, so "looks right" is not
a check. Build the artifact, run it, and read the errors. Doing so caught a
severe error, a control writing a field the engine silently discarded, a summed
readout that did not actually sum, and a meter averaging to zero. See the
`local-energyplus-validation` note for the workflow.
