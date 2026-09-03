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

**And that sentence is now on the page, because a hue cannot be the only one
saying it.** The balance rail letters five signed figures whose direction was
carried by the hue and by the absence of a minus sign — nothing else. In
monochrome, under forced colours, or read aloud as a swatch, a name and a
number, a positive term said nothing whatever about being positive, on the one
block whose entire argument is which way each term points. So the rail states
the convention outright under its head and every term carries `in` or `out`
beside its watts (`flowWord` in `readings.js`, so the rail's key, the strip
meters and the folded index row cannot disagree about it). The hue still ranks
and groups the terms; it no longer has to be believed on its own. Any new
reading that leans on `--cold` / `--warm` to say something owes the reader the
same second carrier.

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

### The desk quantity, chosen from every study card

Eleven choices are too many for a segmented selector, and the choice
belongs to the desk rather than to one card. Every open study therefore carries
the same native disclosure: its closed summary states the selected quantity,
and changing it from any card updates every card together. The disclosure is a
working surface, not a menu hidden behind an unfamiliar icon.

- **Closed, the card still reads.** The study heading names the swept control;
  the quantity line names what the curve measures, its unit, and its precision.
  A folded card never reduces the quantity to an unlabeled value.
- **The first guess states its basis.** Only the first study initialized by the
  desk's opening rule carries a short `Opened here` note from the declaration.
  Linked and explicitly chosen quantities carry none, and the note remains a
  historical explanation rather than mutable choice state.
- **The complete offer is always present.** Opening the disclosure shows all
  eleven choices in declaration order. An unavailable row stays in its
  place, disabled, with both the specific reason and the action that would make
  it available. No explanation depends on hover.
- **Native controls carry the interaction.** Each offer is a radio input in one
  desk-wide group. Arrow keys move through the set, Space selects, and the
  disclosure summary is a native button. The visible focus treatment uses
  `--rule-focus`; selected state is also stated in text and through
  `aria-checked`, never by colour alone.
- **The selected row uses graphite, not another hue.** A square marker and the
  word `Selected` carry state. `--redline` remains reserved for the live pointer
  and focus path; `--cold` and `--warm` remain reserved for signed physical
  quantities.
- **Waiting is a reading, not an empty card.** When cached samples cannot answer
  a newly selected quantity, the card says `Waiting for <quantity>` in place and
  keeps stable dimensions. An old curve may remain only while it keeps its old
  quantity label and the waiting statement names the new one. It is never
  relabelled as the requested quantity.
- **Only natural pairs share one choice.** High and low zone temperature share
  one run and one physical question; TEDI and CEDI are the heating and cooling
  halves of thermal demand. Those two choices each draw both lines with the
  established warm and cold pens. Every other metric stays scalar, and the
  chooser does not repeat either member of a pair as a separate row.
- **The chart uses the card without becoming tall.** Its wide `320 × 64` view
  box takes the full available width; the plot expands while its end-label
  gutter stays fixed in chart coordinates. The line legend carries each value's
  unit, so the chart footer labels only the swept control's two endpoints and
  does not repeat the metric unit at its centre. Its y-domain is never narrower
  than two increments at the quantity's displayed precision, so floating-point
  noise between values that all letter `20.0` cannot become a full-height
  zigzag.
- **The fold owns its tab order.** Offer controls are inside the disclosure, so
  closing it removes them from sequential keyboard navigation. Any author rule
  that gives the offer list a display value must include a matching `[hidden]`
  rule.
- **A refusal's fix returns to the refusal.** When a quantity says to attach a
  weather file, a successful attachment invalidates the old samples but keeps
  the study, open strip, open chooser, focus and viewport anchor. The card
  returns in place as waiting for the new climate; following its instruction
  must not make the reader find the question again.
- **Landing results do not close the question.** A study card is rebuilt as
  partial points and the finished curve arrive. Each rebuild preserves an open
  chooser, its focus and its viewport anchor, so the context restored after a
  weather attachment survives the solve it started.
- **Width and height use the existing index decision.** At 390 px wide and at
  600 px high, study cards and chooser disclosures live on the index sheet,
  remain within the viewport, and introduce no horizontal scrolling. Offer
  reason and fix text wraps below its label; no fixed row height clips it. No
  additional breakpoint is declared.

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

### A day of hourly values, read as a shape and worked in a fold

Twenty-four numbers is not twenty-four fields. A reader setting an hourly
profile is setting a shape, so the shape is what stands on the strip and the
numbers are what stands behind a disclosure.

- **The reading is outside the fold and only the working is inside.** The
  silhouette (the same 240 unit band the occupancy profile is drawn on) and one
  line of lettering in the head are always visible, which is the desk's own
  rule that every path reads without opening anything. Only the boxes cost a
  tap.
- **Six across and four down, because the rows are then the quarters the
  drawing above is already ticked at**: 00, 06, 12, 18, 24. The afternoon is
  the third band rather than something you count your way into. Four across is
  roomier and rules the day at boundaries nothing on the sheet draws; twelve
  across is the drawing's own shape and does not fit, since a box letters five
  mono characters and twelve of those want about 440px.
- **Ask the control's own container how much room it has, not the window.**
  This rule used to read "size it against the narrower of the strip's two narrow
  cases, which is not the phone", and it named 284px — the floor a multicolumn
  column could reach. The desk is a grid of cards now and that floor is gone: a
  card gives this control 168px, where six cells are 28px, the box inside one is
  24px, and `0.000` is 33.00px in IBM Plex Mono at 11px. It clipped.

  A viewport width was standing in for "how much room does this control have",
  and the two were the same question only while the desk was one column wide.
  Every control that has a width it cannot go below now asks a **container
  query** on `.strip-body` instead — the hour grid folds to three across under
  282px, the year's twelve cells fold to six under 240px — so the answer follows
  the control wherever it is drawn rather than following the browser.

  **Fold to a count that keeps the structure the control is drawn around.** The
  hour grid's rows have to land on the boundaries its silhouette is ticked at,
  00, 06, 12, 18, 24. Three across rules the day at every third hour, so all
  four quarters are still row starts. Four across is roomier and rules it at 00,
  04, 08, 12, 16, 20, which puts 06 and 18 in the middle of a row and breaks the
  one property the grid exists for. Roomier is not the criterion.
- **Rule the top of each cell and make the column gutter `padding`.** The four
  ruled bands are the structure, and the same mechanic the qualification block
  records applies here: a grid has no row box to carry a border, and a
  `column-gap` cuts a hole in every hairline so the bands read as ruled in
  dashes. The last column hands its gutter back, as a segmented row's last cell
  hands back its divider.
- **The hour goes above its box, in ghost ink and the smallest mono on the
  desk.** Side by side the pair is 58.5px of lettering in 43px of room. The
  hour is the box's address rather than one of the day's readings, and the
  readings are the figures under them.
- **The values are margin numbers like every other settable figure**
  (`.num-field`, box and border and fill already taken off), at the desk's
  standard 11px tabular mono. Hold each one to its cell's width rather than to
  the `size` attribute the field fits to its text: focus swaps the lettering
  for the value itself, `0.500` becomes `0.5`, and a box that narrowed by two
  characters as it was entered would walk the whole column sideways under the
  caret.
- **Any rule giving a folded block a `display` of its own owes it a `[hidden]`
  twin.** This is the general rule, not a note about this control. An author
  declaration beats the user agent's `[hidden] { display: none }` outright, so
  the attribute does nothing at all. Measured by deleting the twin out of the
  live stylesheet: a shut fold went straight back to computing `display: grid`
  and put its twenty-four boxes into the tab order, seventy-two across the
  three patterns of one strip. It is the failure `.link[hidden]` was written
  for after `#studies-stop` was found rendering permanently, and it is
  invisible until somebody reaches the strip with a keyboard.
- **The fold's own offer sits where a scale's Study offer sits**, hard against
  the reading with the label taking the slack, at the offer's whisper size
  rather than the status row's: it is the one gesture the control's head
  affords, and three of these stand on one strip. The word on it does not flip.
  `aria-expanded` is the state, and what a reader sees is that the boxes are
  there; a second saying of it is the one that goes stale.

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

### What the model was given, under the setting itself (`.ctl-derived`)

Where a control's number is not what reaches the document — where an applier
converts it into some other quantity — the converted figure is lettered on a
line under the face, in **mono**, with the arithmetic that made it on a second
line. The Air strip's envelope leakiness is the case: the face carries
`0.50 ACH`, the line under it carries

```
0.072 kg/s at 1 Pa over 511.0 m² of envelope
0.5 ACH · 1061.9 m³ / 3600 · 1.2041 kg/m³ / 4^0.65
```

and the readout beside the meter carries what the run then made of it. **Three
figures, three different things, and they must stand apart**: on the measured
desk the stated and computed rates differ by about a factor of three, and a
reader who took that gap for a failure to apply the setting would be wrong about
the model.

Same rule as the bill's rate build-up and the register's blower-door conversion,
one level down: a derivation the reader cannot redo is a number applied out of
sight. Mono rather than the note's sans, because that is what tells a
derivation apart from prose at a glance — the sheet already letters every
quantity in its mono face.

Two lines of height are **held** whatever it says, the way `.ctl-standing` holds
one: this line re-letters on every frame of a drag, and a wrap that came and
went would relayout the strip's column under the reader's hand.

Reach for it only where the conversion is real. A control whose number is
written into the field as it stands needs no second line, and a blank one under
every face would be sixty lines of nothing.

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

**There are exactly two folding thresholds on this page and there must not be a
third.** They answer two different questions and a new block joins whichever one
its own question belongs to, rather than declaring its own:

| Threshold | Question it answers | Who folds there | Head attribute |
| --- | --- | --- | --- |
| `780px` wide **or** `600px` tall | Can this window still hold the console as a column beside the sheet? | The console's strips (to the index sheet), and every table inside `.register`: the scoreboard and the shelf of kept schemes | `data-label` |
| `620px` wide | Have this table's own columns collided? | The results schedule and the bill | `data-head` |

Two consequences that are easy to get wrong, and both were:

- **The scoreboard folds at 780, not at 620.** It lives inside `.register`, and
  the register's fold is the *wider* of the two, so a rule written for the
  scoreboard at 620 is dead code sitting under a live rule a hundred and sixty
  pixels above it. A new row on that board is folded already; what it owes is
  its `data-label` and, if it introduces a classed cell with a width, that width
  given back.
- **The two folds letter the head from two different attributes.** `data-label`
  is the register's and `data-head` is the schedules'. One name would be
  better and it is not worth a rename that touches every builder on the page,
  so the rule is: use the attribute belonging to the fold your block actually
  falls under, which is the table it is a row of. A cell carrying the other
  one folds with no head at all, and the failure is invisible on a desk.

### Prose on a schedule, and a count that is not a score

Some things a table has to say are not readings. How many of a method's criteria
were read, which of them stand outside that count, and which could not be read
at all are statements *about* the rows, and a column of right-aligned mono is
the wrong place for a sentence. Give them a row of their own, spanning the whole
table (`tr.score-prose > td[colspan]`), set in the section's own prose face and
measure rather than in the figure face.

Two rules, and the second is the one that matters:

- **A spanning cell is still a first child**, so any width the first column was
  given through an id selector has to be handed back with `width: auto`. This is
  the same repair the standard-name subhead already needed on that board.
- **A count of criteria cleared must not be drawn as a total.** No figure face,
  no marker, no rule above it, no colour, no percentage, no ratio. It names both
  numbers in a sentence and it names its scope. A row set like a total is read
  as one whatever its words say, and on a published method that is the interface
  issuing a certificate the model cannot support. The individual criterion rows
  carry verdicts, as every criterion row on this page does; **the method does
  not**, and its name never appears beside a pass or a fail word.

### Qualifying a reading in place

The companion to `List the criteria the sheet cannot judge beside the ones it
can`. That rule governs the clauses a method contains and this sheet never
reaches; this one governs the readings it *does* letter, and the distance
between what they measure and what the method means by them.

- **In place, never on hover.** Same rule that put what *Chase* means above the
  scoreboard: `pointer: coarse` has no hover, so a caveat that floats does not
  exist on the phone where a figure is most likely to be carried away from the
  page it was read on.
- **One entry is two statements, so it gets two tracks**, as a `dl` laid out on
  a grid: what the figure does not answer, and what that is measured or read
  from. Written as one paragraph each they become grey blocks a reader skims,
  and the point of the block is that a reader can *count* the reasons.
- **The number of standing entries is asserted in the module, not hoped for.**
  The interface promises a reader some specific number of reasons; a list that
  one careless edit could shorten would still render perfectly.
- **Rule the entries on both cells, and make the gutter `padding`, not `gap`.**
  A grid has no row box to carry a border, so the hairline between entries is
  drawn on each cell; a `column-gap` then cuts a hole in every one of them and
  the block reads as ruled in dashes.
- **Long unbroken strings belong to this pattern.** Qualifications quote file
  names and standard labels, and a 43-character token with nothing to break on
  sets the block's minimum width and pushes the sheet sideways at 390px. Give
  the evidence track `overflow-wrap: anywhere`.
- Folded, the evidence stands under the statement and letters the head the
  layout was carrying for it. It folds at `620px`, the schedules' threshold, not
  the register's: two tracks of prose survive some way below the width at which
  five columns of figures stop being a table.

### Absence is not zero

A reading with no data behind it renders as an em dash and is excluded from any
total. Zero is a measurement; missing is not one. Never substitute a previous
value or a default, and say in the interface which term is missing and why.
This is the visual half of the project's no-silent-fallbacks rule.

### A refusal that carries its next step

The visual other half of `Absence is not zero`. That pattern governs a reading
with no data behind it; this one governs an *operation* the sheet declines to
perform.

Stating the reason is necessary and it is not sufficient. A refusal that hands
the reader an empty field is a stop, and the reader is left to guess what would
have worked. So a refusal has three parts, in one place:

1. **What was refused**, named as the reader named it, not as the system knows
   it.
2. **Why**, specifically enough to act on. Not "could not be attached" but
   "publishes no annual cooling design conditions".
3. **Where to go instead**, as targets rather than as advice. The offer is the
   control itself, reopened on candidates: pointer targets and tab stops, never
   a sentence telling the reader to go and look somewhere.

Two rules the weather picker's refusal had to learn:

- **The thing just refused is filtered out of its own offer.** Nearest-station
  ordering puts the refused site first at 0 km, which offers the reader exactly
  what they cannot have.
- **The offer is a courtesy and the reason is not.** If building the offer
  fails, it is swallowed. Replacing a specific refusal with a second, vaguer
  one because the courtesy could not be paid is the worse outcome of the two.

Where an operation is refused on two paths, the reason travels rather than
being re-summarised at each surface. A path that writes its own sentence over
the top of the specific one is the sheet knowing exactly what is wrong and
saying none of it.

### Withdrawing a control: dim it, or do not draw it

Two different facts, two treatments, and one treatment for both was misreading
the more important of them.

**Not drawn** — the control belongs to a model that is not in force. A strip
that offers two models of its own subject withdraws a whole block at once: the
Air strip's scheduled rate against its pressure network, Glazing's simple unit
against its layered one, the rooflights' own glass against the walls'. Nothing
near those controls brings them back; the only thing that does is a selector at
the top of the strip. So the strip does not draw them, using the `hidden`
attribute, which takes them out of the tab order too.

Dimming them instead says *these are inert right now* when what is true is
*these belong to the other instrument*, and it leaves the reader working out
why a whole section has gone grey. It is also a dead control by this desk's own
definition: a dimmed slider is still draggable, still tabbable, and still moves
under an arrow key.

**Dimmed** (`.idle`) — the control belongs to the model in force but is not
reaching it at this setting of the rest. `infConstant` while `infiltration` is
zero. Here the control that revives it is the one directly above, so dimming
keeps that relationship visible and teaches it, and a row appearing and
disappearing under the reader's hand would be worse than a grey one.

The rule of thumb: **if the thing that brings it back is adjacent, dim it; if it
is a mode switch, do not draw it.** In code this is `Control.when` against
`Control.needs`, and it also makes the declaration read as the two facts it is
— `when: scheduled, needs: (p) => p.infiltration > 0` rather than one predicate
doing both jobs.

A block that is not drawn changes the strip's height when the model is
switched. That is accepted, and it is the point: the strip is a different
instrument, and it should look like one.

### Dimming conventions

- `.idle` at `opacity: 0.4`: the control is set but not currently reaching the
  model, given the rest of the configuration. Never for a control belonging to
  a model that is out — see above.
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
body.desk-open .desk { flex: 1 0 var(--desk); } /* --desk: 580px */
```

Flex rather than a grid track pair on purpose: a grid hands free space to every
unfinished track evenly, so the desk's growth would come half out of the
drawing's width on exactly the mid-sized windows that have none to spare.

Inside it the channels lie on a **CSS grid of cards** with `align-items: start`
— three columns at the desk's own width, four and five where the desk has the
width to pay for them. This replaced a balanced multicolumn set, and the reason
is worth keeping because it is the kind of decision that looks like taste and is
not.

Multicol was the obvious choice and it was wrong on two counts. **It cannot be
relaid out inside a frame**: measured on eighteen strips, 116.8 ms median and
148.8 ms at p95, because balancing children across columns is the whole of what
multicol does and there is nothing in it to make cheaper. The same content as a
grid relaid out in 1.0 ms and opening one card cost 5.3 ms. Anything that
happens under a moving pointer — a card that opens as you pass over it — is
impossible at the first number and comfortable at the second. **And it has no
addressable cell**: a balanced column set decides for itself what lands where,
so "this card expands and its neighbours give way" has nothing to attach to.

The reading order improved as a side effect. Multicol reads column-major, down
one column and on to the head of the next; a grid reads row-major, which is how
channels numbered 01 to 18 are read aloud.

**The column count is stated, not derived from a minimum width.** This was
`repeat(auto-fill, minmax(--card, 1fr))`, which is the tidier declaration and
gets the arithmetic backwards: a `minmax` floor is the width at which another
column *opens*, so the moment the desk reached four times the floor every card
snapped down to the floor itself. Measured — the default desk gives three cards
of 193px, and a fourth column arrived at 704px of desk making four cards of 176.
The reader was handed a column for being given more room and paid for it in card
width.

Raising the floor cannot fix it either, because the same number was deciding two
things: at 580px of desk any floor above 193 drops the layout to two columns, and
three is the fewest that puts all eighteen closed cards in the scroller at once.
So the breaks are stated instead, each at the width where its column count still
lands a card at 210px or more — four at 840, five at 1,050 — and five is the
ceiling the multicolumn set already carried. Measured across the range, the
narrowest card anywhere is the 193px of the default desk, and each new column
arrives at 210 and grows from there.

They are asked of **the desk**, not the window: the desk takes what the sheet
leaves, so its width is a function of the window *and* of how far the drawing has
been squeezed. Two different questions that were the same one only while the desk
was a single column.

Three mechanics that cost real debugging:

- **`align-items: start` is a correctness rule, not a cosmetic one.** It holds
  every card at its own height so an opening card grows downward from its own
  top edge. Stretched, a card opening resizes every card beside it, which moves
  edges under the pointer that is doing the opening — and a card whose edge
  moves past the pointer sets its neighbour opening, which shrinks the first,
  which puts the pointer back on it.
- **An opened card is bounded, and the bound is on the card rather than on the
  fold inside it.** The largest channel is 1,513 px of controls against a 388 px
  scroller; unbounded, a pointer merely passing over it pushes every later card
  three screens down and snaps them back on the way out.

  What the bound has to guarantee is that **opening a card never buries the row
  beneath it** — the grid is what the reader navigates by, and a card filling the
  scroller leaves them working one channel with no way to see where in eighteen
  they are standing, which is the original complaint returning one card at a
  time. Bounding the fold cannot do that, because a card's face costs a different
  amount on every channel: 36 px of toggle, sometimes a patch row, sometimes a
  blocked channel's sentence. Measured, a fold bound that assumed 51 px of face
  left the next row 24 px of the 60 it was promised, because Air actually spends
  87. Capped at the card and left to a flex column, the fold takes whatever is
  over and the row below always gets its `--next-row`.

  The room is read off the scroller in **container query units** (`100cqh`),
  which is what lets it follow a head whose own height moves with the register's
  fold. That is legal only because the desk is given a height rather than a
  ceiling; the containment is dropped below the index breakpoint, where the
  console scrolls with the page and a container refusing to look at its contents
  would compute to nothing.

  A card the reader opens is then scrolled just far enough that the row under it
  shows — never on a peek, which must move no scroll position at all.
- **Give the desk a height, not just a ceiling.** The console is a fixed head and
  a fixed rail either side of one scroller, and with a content-driven height
  those three only add up to the window when the strips are long enough to fill
  it — so on a desk of eighteen closed cards the rail floated up under the grid
  and the panel stopped short of the board. Given the height outright, the rail
  is the footer it is drawn as and the cards take everything between.
- **The hairline between cards is a border on each card, not a gap with the
  grid's rule colour showing through.** The gap is the tidier mechanism and it
  was tried first: with `align-items: start`, a short card sharing a row with a
  tall one leaves the rest of its cell empty, and the rule colour behind that is
  not a hairline, it is a grey panel the size of a card.

### Motion

There is a house scale, it had been unwritten for the life of this page, and a
pattern living only in a stylesheet rule is the second source of truth this
document exists to prevent.

**0.14 to 0.2 s, `ease`, and only colour, background, border-colour, opacity or
transform.** No layout property is ever transitioned, and there is no entrance
or exit reveal anywhere except where a card opens. Motion on this sheet is
feedback that a state changed, never an event in its own right.

- **What animates when a card opens is the content arriving** — opacity and a
  2 px rise — and the chevron's rotate. The row-height change is not a
  transitioned property: it costs about 2 ms and can simply happen. Animating it
  would need a guessed height, which the tallest channel breaks.
- **There is no exit.** A card closes at once, so sweeping the grid leaves
  nothing still finishing behind the pointer.
- **Every transition is guarded by `prefers-reduced-motion: reduce`**, following
  the chevron's own precedent. The state change still happens; only the
  animation drops. A guard that also removed the state change would be a
  reader's motion preference deciding what they may use.

**A row's height is set by its tallest card, and nothing else in the row moves.**
Measured on opening one card in the middle row: earlier rows `dy 0`, the two
cards beside it `dx 0, dy 0, dw 0, dh 0`, and every later row moved down by
exactly the growth. That is the "neighbours give way" the grid is for; the only
alternative that leaves later rows still is an overlay, which this sheet does not
have. A card that grew *inline* instead would resize its row-mates, and a card
wide enough to do that is wide enough to move its own edge past the pointer that
opened it.

**A row that carries a blocked channel's sentence grows, and the sentence is not
what gives way.** Outside the fold it took its card from 52 px to 129, and with
`align-items: start` that leaves its row-mates ending 77 px early. The sentence
is compacted while the card is shut — 10 px over about three lines instead of
11.5 over four, the same size the card's own reading is set in — and nothing is
clamped, hidden or moved behind a `title`. Buying the row back by truncating an
explanation trades the thing that must be legible for the thing that must be
complete.

### A card's face must not move when it opens

Height first, contents second. A card opening changes what is in its head — the
term chip arrives, the reading and the marker leave — and twice now that has
walked the channel name down the page and back up again on closing. Measured at
10 px the first time, from giving the open card a grid template of its own, and
3.3 px the second, from the term chip being 18.5 px against the name's 12 in a
row sized by its contents.

So: **one template across both states, the rows packed to the top, and the first
row given a fixed height.** The name, the number, the marker's cell and the
chevron all sit on that row and none of them moves. Verified at 0 px across all
eighteen cards.

### The three states of a card

Closed, a card letters its number, its name, its reading and its armed marker —
the index sheet's rule, "closed a row reads, open it is worked", which turned
out to be the rule the whole desk wanted. Revealed, by click, tap, Enter or
Space, it is worked, and more than one may stand. Peeking, it is open under a
resting fine pointer and nothing more.

**A peek may accelerate something, never be the only way to it.** It shows
exactly what a reveal shows, it is never remembered and never announced (nothing
was chosen), and it does not exist under a coarse pointer or at the keyboard —
both of which reach the reveal directly. That is the test for any hover on this
page: remove hovering entirely and ask whether anything has become unreachable.

The desk is `position: sticky` with its own scroll, and its master readout is
pinned at the foot with `flex: none` so it stays visible while the strips
scroll — whatever the column count, the rail is the desk's footer. Below
`780px` it stops being a column, stacks under the sheet, gives up the sticky
foot, and folds to the index sheet below.

**A fixed block either side of a scroller makes the window's height a budget,
and the scroller pays all of it.** There are now three of them — the head, the
finder's band and the rail — and each one added is taken whole out of the
eighteen channels, which are the thing the desk is for. Measured on a 777px
viewport: head 217, finder 33, rail 208, leaving the cards 287 of 745. Anything
new that wants a fixed line on this panel has to be costed against that, in
pixels, before it is drawn. A panel built this way looks fine on the
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
