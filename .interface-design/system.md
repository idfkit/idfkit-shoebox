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

Money and carbon get **no colour at all**. Energy, cost and emissions are
unsigned magnitudes, so the cold/warm pair would be encoding nothing, and a
green-for-clean or red-for-dirty on a carbon figure would be the interface
grading the design rather than measuring it. The bill is entirely graphite,
with one redline mark on the divergence. Extending the signed pair to "saved
against spent" was considered and rejected for the same reason the schedule's
delta column is deliberately uncoloured.

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

### Landmarks on a calibration face

A number is not yet a decision. `1.80 W/m²K` means nothing to a reader who
reads *low-e double* fluently, and a face that offers only a range and a tick
has handed them a quantity and withheld the vocabulary. So a scale carries the
published cases it is read against, and the desk says which one the reading is
standing in.

- **The marks are dimension lines.** A hairline the width of the band with a
  serif at each end, ruled `6px` under the face at `--ink-ghost`. Where the fact
  is a single value — a code limit, an engine default — the near serif stands
  alone with no rule between. The two must look different: a range you may land
  anywhere in and a line you may not cross are different kinds of knowledge, the
  same distinction the year rule draws between a tick and a hollow circle.
- **A landmark is a band, because the fact is a band.** Double glazing is 2.7 to
  3.0 W/m²K depending on the cavity and the spacer; writing 2.8 invents a
  precision nobody published.
- **The band you are in comes up to `--ink`; the rest stay ghost.** Tone, not
  hue — the palette has already spent its colour on sign, and "you are here" is
  not a signed physical quantity.
- **The marks are read, never pressed.** A row of tappable pips under sixty
  faces would be two hundred new tab stops, and a scale rule's graduations are
  not buttons. Nothing here is a pointer-only control either: the reading below
  the face letters the bands one at a time as the tick is dragged past, so
  sweeping a face reads out its whole key, and the same sentence rides in
  `aria-valuetext` so it is heard as well as seen.
- **The reading is one line, always.** Clipped with `text-overflow: ellipsis`
  and its whole text on the `title`, with the height held even when it is blank.
  A band name that wrapped to two lines mid-drag, or a line that vanished at a
  zero stop, would relayout the column under the reader's hand.
- **At a `zero` stop it says nothing.** `None`, `Solid`, `Sealed` in the readout
  is that position's own landmark and the only true one — "past a brick leaf"
  over a wall with no masonry in it is a different statement, not an
  approximation.
- **Only where somebody published it.** Most quantities have no named cases and
  their faces carry no rule at all. Inventing one so that every slider had a
  label would be the interface grading a design rather than measuring it, which
  is the same failure the em-dash rule prevents on the drawing.

Where four values share one scale — a plan key — the rule is ruled along each
wall's own bar rather than once beside the plan, because the argument for a plan
key is that the number is beside the wall it belongs to. The legend column is
about fifty pixels wide, so it letters the band a wall stands in and stays blank
between two, with the full reading on the cell's `title`.

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

### A list of dates, over a year rule

A control holding a set of days is drawn as a 12-month rule with the entries
listed beneath it, an entry field, and a row of ghost-ink stamps.

- The rule is `240 × 26`, a `--rule-firm` baseline with a `--rule` hairline at
  each month boundary, and a `1px` `--redline` tick where each day falls.
- **A rule that cannot be resolved is drawn differently from one that can.**
  Once a weather file supplies the calendar, every entry — a fixed date and an
  nth weekday alike — has a real place and is ticked there. Before one is
  attached there is no calendar at all, so an nth weekday becomes a hollow
  `--ink-ghost` circle at its month's centre instead of a tick at a guessed day.
  Two marks, because they are two different kinds of knowledge.
- Rows are `auto 1fr auto auto`: the date in `--mono` tabular figures, the name
  in `--sans` and ellipsised at `min-width: 0`, the resolved day in ghost `--mono`
  — read off the run, not set — and a `×`. Editing is remove-and-re-add, so a row
  is a reading, not a form.
- **What the engine will drop is struck through, and counted.** An entry in a
  month no run period covers is ignored by EnergyPlus in silence; the resolved
  date wears a line through it and a `--redline` note says how many and why.
  Silence about a dropped input is the failure the sheet exists to prevent,
  whoever is being silent.
- **Count in the unit that reaches the engine, and count it as a set.** The
  reading is days, not rows, because one row can be a nine-day shutdown — and
  overlapping rows are unioned, because the engine marks a day once however many
  entries claim it. A row only partly inside says so on its own line
  (`Sun 24 Dec · 8 of 9`) in `--redline` rather than struck through, since a
  strikethrough would be as wrong as silence. Where the unit cannot honestly be
  days — before any calendar exists — the reading names the unit it *can* count
  ("12 holidays"), so the later switch reads as a different measurement rather
  than a jump in the same one.
- The entry field is `--inset` ground with a `1px --rule` border, like
  `.site-field`, and speaks **the same grammar the address bar speaks** — what
  you type is what a shared link carries, and a refusal is word for word the one
  a bad link gets.
- A refused entry is stated in place, in the dashed `--rule-focus` box the
  blocked-channel note uses, so a refusal looks like every other refusal on the
  page. It is cleared by the next keystroke, never by a redraw: redraws fire
  from a dozen paths and would erase the message a frame after it appeared.
- Stamps that replace the list carry their whole truth in a `title`,
  permanently, including what they cannot supply and why. A list that is four
  days short stays four days short, so a notice shown once after the click would
  be a lie by expiry.

### The square marker

An `8px` to `9px` square with a `1px` border and `1px` radius means "a step that
is armed". Used by the run ledger, the auto-solve toggle, and the console's
patch buttons. Filled `--redline` when on, `--ink-ghost` outline when off.
Reuse it for any armed/not-armed state rather than inventing a switch.

### The general notes (onboarding)

New-reader guidance is lettered as a drawing set letters it: a numbered block
of general notes at the head of the sheet, never a modal tour — nothing on
this board floats, the onboarding included. Each note carries the square
marker, and the marker fills only when its step has genuinely happened on the
desk, because the onboarding obeys the same rule as the drawing: state is
read back, never asserted. The next step takes the redline (statically — the
ledger's breathing means a run in flight, and "your next move" is not one),
and its subject on the sheet is circled with the dashed markup hairline
(`.guided`), one region at a time. Folded, the notes are one row that still
reads — the index sheet's rule; retired, they are gone. If a feature changes
what a step points at or teaches, the note changes with it — see CLAUDE.md.

### Naming a control the reader has never met

A control whose label is a bare verb — **Chase**, **Solo**, **Pin** — tells a
first reader what it is called and nothing about what it does. Explain it in
**printed body text at the head of the block it belongs to**, one sentence
covering every copy of the control, never in a tooltip: nothing on this board
floats, and a hint that only appears on hover does not exist on a phone. Put
the same sentence on the control's `title` and `aria-label` — that is what
makes several identically-worded buttons tell themselves apart when they are
read aloud, and it is where the standard's or the channel's own name belongs,
since the visible label has no room for it. A control with two states writes
two sentences, both halves flipping together: "Stop chasing X: hold its worst
line up beside the drawing" describes the state being left, not the one the
press reaches.

Per-control `.why` notes are the wrong instrument here — five copies of one
definition down a board is noise. Reserve `.why` for what differs per row: the
arithmetic behind *this* clause, the caveat on *this* reading.

### Inline pin (`.pin-inline`)

The rail's reading hour is stated in one line of mono type, and that line is
also the control that holds it. So the pin keeps the marker — the one part
carrying the armed state, and the same square the patch buttons and the bill's
pin use — and gives up the button chrome entirely: no inset, no border, no
tracked capitals, the label set in the mono the instant was always lettered
in. The marker labels the instant rather than sitting beside it, because what
is being armed is that hour and no other.

Reach for this shape wherever a reading is *also* a switch. A second full
`.pin` button at the desk's foot would have made the rail's quietest line its
loudest, and a separate control elsewhere would have separated the state from
the sentence that states it.

### The reading hour on the plate

The armed square appears a third time, at the head of a vertical hairline on
the trace, marking the instant every meter on the desk is reading. Filled
`--redline` and solid when the reader holds that hour; `--ink-ghost` and
dashed when it is merely the hour this run happened to be worst at. One idiom,
three places — patch button, rail pin, plate marker — so "armed" is learned
once.

State that moves on its own belongs on the drawing, not only in the panel. The
hour was first shown only in the desk's footer, which put the most movable
thing about every reading behind a disclosure and two hundred tab stops. The
plate already had the axis for it.

The trace is a control as well as a picture: clicking it chooses the hour, with
`cursor: crosshair` while there is a run to read. It keeps `role="img"` and an
`aria-label` that states the current instant, which is honest but not
sufficient — choosing an arbitrary hour is pointer-only until the trace takes
arrow keys. Do not add a second pointer-only control here without closing that.

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

### The rate build-up

Any figure derived from a published number is drawn as `quantity × rate =
amount`, in three columns, with the rate carrying the dataset and the date that
published it. Reading down the operator column gives `× = × =`, which is the
arithmetic of any priced bill and is meant to be recognised on sight.

The rule this enforces: **a figure nobody can argue with is a figure nobody can
design against.** An architect shown "12,295 kg" has been told an answer; one
shown "37,296 kWh × 330 gCO₂e/kWh" has been shown where to push.

Where a row simply carries no amount — a multiplier line — the amount cell is
**blank**. The em dash is reserved for a figure that should have been there and
was not. The two must never look alike.

A rate also carries **what kind of number it is**, in the reader's terms rather
than the publisher's, set in label type at the head of its citation: `COMMERCIAL
TARIFF`, `GRID CARBON INTENSITY`, `COMBUSTION CONSTANT`. Every price table
behind this sheet is non-residential, but each agency has its own word for that
— commercial, non-household, other industries — and a bill that never states the
sector leaves the reader to guess whether they are looking at what the building
will be charged or at what a house is charged. That qualifier belongs beside the
rate, not in the reference line at the foot.

### Composition without a hue

A stacked composition (end uses within a total) is a **left-anchored rule in a
graphite tone ramp**, not a pie and not a colour per category:

```js
const TONES = [100, 74, 54, 39, 28];
`color-mix(in srgb, var(--ink) ${TONES[i]}%, var(--inset))`
```

Same move as the balance rail's tonal ramp, one level up: the rail spends its
hue on sign, and a composition has no sign to carry, so it spends nothing and
uses tone alone. Rank the segments largest first and key them in that order.

Where a section needs to say "look here" — a divergence, an exception — that is
what `--redline` is for, spent on one small mark, not on a category.

### Measuring the same thing three ways

When one quantity can be measured on several scales (energy, cost, carbon), draw
**one composition rule with a segmented selector**, not three charts. The
re-ordering as the basis changes is the finding; three charts side by side hide
it by making the reader do the comparison.

### Comparison is refused unless it is like for like

A delta column appears only when both sides describe the same thing: the same
rows, the same units, the same currency. Patching a channel out does not make a
scheme cheaper, it makes it a different building with fewer lines, and
differencing the two would report a saving that is really an absence. When the
two do not match, the comparison is dropped whole and the column disappears
rather than heading a mostly-blank field.

Deltas are **never coloured for good or bad**, in any section. They are set in
the margin of their own value at metadata weight. The reading is the number; the
delta is a note on it.

### Measuring against somebody else's number

A criterion is not a reading and must not be drawn as one. Set it as **asks for
· reads · margin**, in that order, with the criterion in the publisher's own
words and the reading in the sheet's — the same three-column build-up the bill
uses for a rate, one level up.

- The margin is a note on the reading, not a verdict on the design, so it is
  set at metadata weight in the reading's margin like every other delta.
- **A criterion that is met gets no mark at all.** A tick beside a number is the
  interface grading the design. A criterion that is *missed* gets one small
  `--redline` mark on the margin figure and nothing else, because a divergence
  is exactly what the markup pen is for.
- Where the publisher's limit is climate- or building-specific, there is no line
  to draw: print the reading with no margin and say in the row why. A missing
  limit is not a pass.
- List the criteria the sheet **cannot** judge beside the ones it can, with the
  reason for each. A panel showing only the questions it happens to be able to
  answer reads as a certification.

### Folding a table to stacked rows

The table equivalent of the index sheet. Where a schedule has more columns than
a narrow screen can carry, do not scroll it sideways and do not drop columns:
below the breakpoint, set every part of the table to `display: block` so each
row becomes a small stack, drop the head row, and give each cell the head it
lost as `data-label`, drawn back through `::before`. Write the label once, in
the builder, so the head row and the folded label cannot come to disagree.

Two mechanics that cost real debugging:

- **Column widths set as `.table td.class` out-specify anything shorter.** A
  media query does not win a specificity argument by coming later, so every
  width the wide layout set has to be named and given back explicitly.
- **Move a unit onto the label it belongs to.** A unit column on its own line
  reads as another value; folded, `46.6` under `READS, KWH/M²·YR` is the
  reading, and the unit column is dropped.

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

The console is a real flex item beside the sheet, not an overlay. The sheet
holds its measure and the desk takes everything the window has left, never less
than one column of strips:

```css
body.desk-open .sheet { flex: 0 1 1080px; min-width: 0; }
body.desk-open .desk { flex: 1 0 var(--desk); } /* --desk: 436px */
```

Flex rather than a grid track pair on purpose: a grid hands free space to every
unfinished track evenly, so the desk's growth would come half out of the
drawing's width on exactly the mid-sized windows that have none to spare.

Inside it the strips lie on a balanced multicolumn set — `column-width:
var(--card)` with `column-count: 5` as the ceiling — so a laptop reads the
single column it always did and a wide monitor reads two to five ruled columns
of cards. Columns rather than a grid of rows: the channels keep reading in
signal order down each column the way a drawing index reads, and strips of
unequal height pack instead of leaving the ragged whitespace row alignment
would. `break-inside: avoid` keeps each strip whole, the `column-rule` is the
same hairline the strips rule between themselves, and the multicol styling
lives on a natural-height wrapper inside the scroller — a multicol box whose
height is fixed lays its overflow out as new columns to the side.

The desk is `position: sticky` with its own scroll, and its master readout is
pinned at the foot with `flex: none` so it stays visible while the strips
scroll — whatever the column count, the rail is the desk's footer. Below
`780px` it stops being a column, stacks under the sheet, gives up the sticky
foot, and folds to the index sheet below.

**A fixed block either side of a scroller makes the window's height a budget,
and the scroller pays all of it.** A panel built this way looks fine on the
screen it was designed on and is unusable two hundred pixels shorter: measured
here, an iPad in landscape gave the eighteen channels 104px of a 736px desk to
scroll 12,000 in, because the head and the footer are `flex: none` and the
middle is the only thing that can give. Budget it deliberately, in this order:

1. **Fold the head's optional instrument**, on a height threshold, by the same
   closed-a-row-reads rule as the sections below it. The register cost 323 of
   the head's 458px; folded, the channels go from 104px to 381.
2. **Below the height where folding cannot rescue it, stop being a column** —
   the same escape the narrow breakpoint already takes. Put the height clause in
   the *same* media query rather than a new one: it is one question, "can this
   window hold a column", asked in two directions.
3. **Never answer a squeeze with an instruction the reader cannot follow.**
   "Widen the window" is addressed to a window manager; under `pointer: coarse`
   there isn't one, and the note is then two lines of red type taken out of the
   very column it says is short.

### The index sheet

Where a panel is too long to navigate on the screen it has, fold its sections to
one line each and let the list become its own index — the sheet a drawing set
already carries for this. On the console below `780px`, eighteen strips end to
end is about ten screens with nothing in them to say which one you are in; as an
index it is one screen, in signal order.

A folded row is a **reading, not a label**. It carries the section's number, its
name, its current reading and its armed marker, which is everything the reader
was getting from the open strip except the controls. That is what keeps the fold
honest against the rule the console is built on — that state is readable without
opening anything. Closed, a row reads; open, it is worked. Anything that would
leave the closed row unable to answer "what is this contributing, and is it in
the model" belongs on the row, not behind the fold — which is why a blocked
section states what it is missing while still closed. The armed marker draws
that second answer as a colour and nothing else, so it also carries it in words:
a live `aria-label` on the square, or the row reads identically in and out to
anyone being read it, and says nothing at all under forced colours. The control
that would have answered instead — the patch button — is behind the fold.

Two mechanics are worth copying:

- **The breakpoint is declared once, in the media query**, as a custom property
  (`--index: 0` / `1`) that the module reads back. A media query and a
  `matchMedia` string that disagree is a bug that exists at exactly one window
  width, which is the width nobody tests at.
- **Anchor the row you tapped.** Read its `getBoundingClientRect().top` before
  the folds change and `window.scrollBy` the difference after, or closing a
  section above the one you opened drags the page out from under your thumb.

Fold with the `hidden` attribute rather than a class, so a folded section's
controls leave the tab order and the accessibility tree with it. The heading
wraps the disclosure button rather than sitting inside it — a button's content
model is phrasing, and an `h3` is not — and the button is `disabled` in the
layout that has room to stay open, because a control that does nothing should
not take a tab stop.

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
