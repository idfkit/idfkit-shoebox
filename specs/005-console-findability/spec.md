# Feature Specification: Console Findability

**Feature Branch**: `005-console-findability`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "The console is quite large and intimidating at first. It is also difficult to quickly find a parameter to change. This is really all about user experience and making their journey editing their shoebox a more efficient and pleasant experience."

**Amended**: 2026-09-03, with the card grid and the reveal, proposed after the first draft.

## Context

The model console today presents **18 channels holding 129 controls over 144 parameter
keys**. On the wide layout every channel is opened at once, so a reader arriving at the
page meets the whole desk end to end in a single scroller. There is no way to search for a
parameter, no way to jump to one, and no overview of what the eighteen channels are for
short of scrolling past all of them.

A folded overview already exists, but only below the narrow breakpoints, where the desk
stops being a column beside the drawing. There the strips fold to one line each — number,
name, reading, patch marker — and the console becomes its own index. That behaviour is
this feature's own precedent: it is the desk's existing answer to "eighteen strips is too
many to hold in the head", and it is currently unavailable at exactly the width where the
reader has the most of them open at once.

This feature is about the journey — arriving, orienting, finding, editing, returning. It
changes **no control, no default, no model object and no reading**.

### The card grid and the reveal

The console's resting state becomes a **grid of eighteen cards**, one per channel, each
carrying what a channel row already carries — its number, its name, what it is for, its
reading and whether it is in the path — and hiding only its controls. A card is **revealed**
to work it: it expands in place and its controls appear.

A card has two open states and they answer two different questions:

- A **peek** is what a fine pointer gets for passing over a card. It opens as the pointer
  arrives, shows what the channel holds, and closes again as the pointer leaves. Nothing is
  chosen and nothing is kept. Browsing the grid with the pointer is therefore a way of
  reading the desk rather than a series of decisions about it, and the animation carrying
  a card open and shut is the thing that makes that legible — a peek that snapped would
  read as eighteen cards flickering rather than as one card being looked into.
- A **reveal** is what a click, a tap or a keypress gets, on any pointer and on none. It is
  chosen, it is kept, it survives the pointer leaving and a reload, and it is the only open
  state a touch device or a keyboard has.

The reveal is then one mechanism serving two journeys, which is the point of it:

- A reader **orienting** reveals a card and gets that channel's controls.
- A reader **searching** types a name, and the grid reveals *only the matching controls*,
  across however many cards hold them, with everything else left closed. A search is
  therefore not a jump to one control but a redrawing of the desk around a question, and
  a control's own study curve comes up with it where one has been swept.

The grid takes a different shape at each of the three sizes the sheet is read at — several
columns on a desk, a single column of rows on a tablet, and a form tailored to a phone —
but it is one instrument with one gesture, not three arrangements to be learnt separately.
The peek is the one thing that does not carry across, because a coarse pointer has no
hovering to do.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arrive at something you can take in (Priority: P1)

A first-time reader opens the page and meets the console. Instead of eighteen fully-opened
channels running past the bottom of the window, they meet eighteen cards — every channel
named, said in a phrase, with its reading and whether it is in the path — laid out so the
whole desk is in view at once. They reveal the one they want to work, and its controls
appear in place. What they leave revealed stays revealed.

**Why this priority**: This is the first complaint, and it is the mechanism the other two
stories are built on: search reveals, and the edit list lands by revealing. It is also the
one that stands alone — even with no finder at all, a desk you can take in at a glance is
the difference between a page you explore and a page you retreat from.

**Independent Test**: Load the page cold at each of the three sizes and confirm all
eighteen channels can be named and their state read with no scrolling and nothing revealed;
reveal two cards, confirm both stay revealed and every reading legible before is legible
still.

**Acceptance Scenarios**:

1. **Given** a first load at any supported size, **When** the console is drawn, **Then**
   all eighteen cards can be seen and named without scrolling the console, and no card is
   revealed.
2. **Given** a card that is not revealed, **When** the reader reads it, **Then** its
   number, its name, what it is for, its reading and its patch state are legible without
   revealing it, and a channel that cannot be patched in says so on the card rather than
   one gesture further in.
3. **Given** a card is revealed, **When** the reader reveals a second, **Then** the first
   stays revealed, so two related channels can be worked together.
4. **Given** a reader working the keyboard only, **When** they move through the grid and
   reveal a card, **Then** every step is reachable without a pointer, the card's revealed
   state is announced, and no control inside a closed card is reachable by tabbing.
5. **Given** a fine pointer, **When** it passes over a card, **Then** the card peeks open
   under the pointer and closes again as the pointer leaves, having changed nothing.
6. **Given** a card peeks open, **When** it expands, **Then** the card stays under the
   pointer rather than moving out from beneath it, so a pointer at rest does not set off a
   second card.
7. **Given** a pointer sweeping across the grid, **When** it passes over several cards,
   **Then** each opens and closes in turn without the grid scrolling and without any card
   left open behind it.
8. **Given** a card the reader has revealed, **When** a pointer peeks at a neighbour,
   **Then** the revealed card stays revealed and its controls stay where they were.
9. **Given** a card is peeking, **When** the reader clicks, taps or presses it, **Then**
   the peek becomes a reveal and is kept when the pointer leaves.
10. **Given** a card is revealed, **When** the layout reflows to make room, **Then** the
    card the reader acted on stays where they can see it and the grid does not scroll out
    from under them.
11. **Given** a channel with many controls is opened, **When** its controls exceed the room
    available, **Then** they remain reachable without the grid becoming unreadable.
12. **Given** a reader has revealed cards, **When** they return to the page later in the
    same browser, **Then** the console opens as they left it, with no card peeking.
13. **Given** the reader has expressed a preference for reduced motion, **When** a card
    opens, **Then** it opens without animation and every other rule here still holds.

---

### User Story 2 - Search reveals only what matches (Priority: P2)

A reader knows what they want to change — something to do with windows — but not which of
the eighteen channels owns it. They type `window`. The grid answers by revealing exactly
the controls that match, wherever they live, and leaving everything else closed. The
window-to-wall ratio on each of the four walls, the glazing unit, the rooflight controls:
each appears under its own channel's name, each ready to turn, each with its swept curve
if one has been run. Clearing the search puts the desk back as it was.

**Why this priority**: This is the second complaint and the highest-frequency act on the
page, but it is built on the reveal, so it follows it. Once the reveal exists this is the
cheapest large win available: no new place to look and no new gesture to learn, only a
different question put to the same grid.

**Independent Test**: With the grid in place, type a term matching controls in three
different channels and confirm exactly those controls are revealed, each under its channel,
each turnable, each carrying its study curve where one exists; then clear the search and
confirm the desk returns to the reveal state it had before.

**Acceptance Scenarios**:

1. **Given** any scroll position and any size, **When** the reader searches for a term,
   **Then** every control matching it is revealed with its channel named, and controls that
   do not match are not.
2. **Given** matches in several channels, **When** the results are revealed, **Then** each
   is under the name of the channel that owns it, so two identically-named controls on
   different channels are told apart without choosing one.
3. **Given** a control belonging to one of four walls of a plan key, **When** it is
   revealed, **Then** the wall it serves is named, because four subjects share one label.
4. **Given** a matching control that has been swept, **When** it is revealed, **Then** its
   study curve is revealed with it.
5. **Given** a matching control whose channel is patched out, or which belongs to the other
   of its strip's two models, or which is inert as the desk stands, **When** it is revealed,
   **Then** it says which of those is true and what would bring it back, rather than being
   silently omitted or offered as a control that will not move the model.
6. **Given** a search matching nothing, **When** the grid answers, **Then** it says so in
   place, leaves the reader able to retype, and does not close the cards they had open.
7. **Given** a search is cleared, **When** the grid is redrawn, **Then** it returns to the
   reveal state the reader had before searching, not to the default one.
8. **Given** a reader working the keyboard only, **When** they open the search, type, move
   among the revealed controls and turn one, **Then** every step is reachable without a
   pointer and what changed is announced to assistive technology.
9. **Given** any search, **When** it is typed, refined or cleared, **Then** no simulation is
   started, no parameter moves, no reading changes and the shared link is unchanged.

---

### User Story 3 - Find your own edits (Priority: P3)

A reader who has been turning controls for ten minutes wants to see what they have actually
changed — to check one, to reconsider one, or to put one back. The desk can already rank
every control by how far it sits from its own default; this makes that ranking something
the reader can walk, revealed in the grid exactly as a search result is.

**Why this priority**: It is the return leg of the journey and what makes a long session
pleasant rather than merely navigable, but a reader can complete every task without it. It
is also the smallest of the three, and once the reveal and the search exist it is one more
question put to the same grid.

**Independent Test**: Move six controls across four channels, ask what has changed, and
confirm exactly those six are revealed, each with its channel, its value and the default it
left, and that each can be turned or put back where it stands.

**Acceptance Scenarios**:

1. **Given** several controls moved off their defaults across several channels, **When** the
   reader asks what they have changed, **Then** exactly those controls are revealed, each
   with its channel, its value and the default it left.
2. **Given** a channel patched in or out relative to its default, **When** the list is
   shown, **Then** that change appears too, because patching is an edit.
3. **Given** the reader is looking at a revealed edit, **When** they act on it, **Then** they
   can turn it or put it back to its default where it stands.
4. **Given** nothing has been changed, **When** the reader asks, **Then** the answer says the
   desk is at its defaults rather than showing an empty grid.
5. **Given** a revert, a link load, a scheme restore or a standard applied, **When** the
   reader asks again, **Then** the answer describes the desk as it now stands.

---

### Edge Cases

- **A peeking card must not walk out from under the pointer.** It expands while the pointer
  is on it, and if the expansion moves the card sideways or downwards far enough that the
  pointer lands on a neighbour, the neighbour peeks, which moves the first card back, which
  puts the pointer on the first card again. That oscillation is the failure mode of the
  whole gesture and it is a property of where the expansion is anchored.
- **A peek must leave no trace.** A pointer that has swept the grid must leave it exactly as
  it found it: no card left open, no scroll moved, no reveal the reader chose disturbed.
- **A peek is not available to everyone, and the reveal is.** `pointer: coarse` has no
  hover and a keyboard has none either, so a card must always be openable by a click, a tap
  and a keypress. The peek is an accelerator for one input, never the route to anything.
- **An animation is part of the reading, so it has to be quick enough to be one.** A card
  that takes longer to open than a reader takes to move to the next one turns a sweep into a
  queue of animations finishing after the pointer has gone.
- **A reader who has asked for reduced motion still gets the peek**, without the animation.
  The peek is information; the animation is how it is delivered.
- **A control that is drawn but inert** (its own precondition is unmet) and **a control that
  is not drawn at all** (it belongs to the other of its strip's two models) are different
  facts, and a reveal must not report them as one. Saying "hidden" about a control the
  reader could revive with the selector above it has told them the wrong thing.
- **A channel whose precondition the rest of the desk does not meet** cannot be patched in.
  A card must carry the same sentence its strip carries, unrevealed.
- **The largest channels hold 18, 15 and 12 controls.** A card revealing eighteen controls
  is taller than a phone and taller than most of a desk's grid row, so a reveal has to have
  an answer for a card that does not fit that is not "the reader scrolls the grid sideways"
  and not "the controls are cut off".
- **Two channels price rather than simulate.** Revealing one of their cards must not
  suggest a run is coming; turning them re-letters the bill and starts nothing.
- **The balance rail is not one of the eighteen cards.** It reads five channels at once and
  is the console's signature; it sits beside the strips today rather than among them, and a
  grid that absorbed it would lose the one reading that is about the desk as a whole.
- **The grid's reading order is the signal order.** The channels are declared in physical
  order, which is the order they are applied in and the order their dependencies run in, and
  a grid read left to right and top to bottom must not put Gains before Fabric.
- **A search term matching a landmark rather than a control** — "Passivhaus", "low-e",
  "double glazing" — is a reasonable thing to type, and the desk publishes those names
  already.
- **A reader searching for a unit or a symbol** (`W/m²K`, `ACH`, `°C`) is searching for a
  kind of quantity rather than a name.
- **A search that reveals a control inside a card the reader had deliberately closed**, and
  a search cleared afterwards, must leave the reader's own choices intact rather than
  overwriting them with the search's.
- **Crossing a breakpoint** re-shapes the grid. A reader's reveals must survive the reshape
  where the new shape can hold them, and the layout's own decisions must not be overridden
  by a preference recorded at another size.
- **At 390 px wide** the grid, the search, the revealed controls and every explanation must
  work with no hover available and nothing scrolled sideways.
- **A study curve revealed with its control** must be the curve that was swept, and a
  control whose sweep is stale or was set aside must say so rather than show a curve that no
  longer describes the desk.

## Requirements *(mandatory)*

### Functional Requirements

**The grid**

- **FR-001**: The console's resting state MUST be a grid of one card per channel, in which
  every channel's number, name, purpose, reading and patch state is legible with nothing
  revealed and without scrolling the console.
- **FR-002**: The grid MUST read in the channels' declared signal order at every size and
  in every shape it takes.
- **FR-003**: A card MUST carry, unrevealed, any sentence saying why its channel cannot be
  patched in.
- **FR-004**: A card MUST be revealed and closed again by a gesture available to a coarse
  pointer, a fine pointer and a keyboard alike. The reveal MUST be a chosen state: it
  survives the pointer leaving, and it is the only open state available where there is no
  hovering to be done.
- **FR-005**: On a fine pointer, a card MUST peek open as the pointer arrives over it and
  close again as the pointer leaves. A peek MUST change nothing: it leaves no card open
  behind it, moves no scroll position, and disturbs no card the reader has revealed.
- **FR-006**: A peeking card MUST remain under the pointer as it expands, so that a pointer
  held still cannot set a second card peeking.
- **FR-007**: A peek MUST become a reveal when the reader clicks, taps or presses the card
  they are peeking at.
- **FR-008**: Opening and closing MUST be animated, and the animation MUST be quick enough
  that a pointer sweeping the grid at reading speed leaves no animation still finishing
  behind it. Where the reader has asked for reduced motion the peek and the reveal MUST
  still happen, without animation.
- **FR-009**: More than one card MUST be able to stand revealed at once, and revealing one
  MUST NOT close another.
- **FR-010**: Revealing or closing a card MUST NOT move the card the reader acted on out of
  their view, and neither a reveal nor a peek may scroll the grid under them.
- **FR-011**: A card whose controls exceed the room available, peeking or revealed, MUST
  keep them all reachable without sideways scrolling and without truncation.
- **FR-012**: Controls inside a card that is neither peeking nor revealed MUST be out of the
  tab order, and a peek MUST NOT move the reader's place in it.
- **FR-013**: The grid MUST take a shape suited to each of the three sizes the sheet is read
  at — several columns, a single column, and a phone — while keeping one reveal gesture
  across all of them.
- **FR-014**: A reveal MUST be announced to assistive technology. A peek MUST NOT be, since
  nothing was chosen and a reader who is not using a pointer is not making one.
- **FR-015**: The reader's revealed/closed choices MUST survive a reload in the same
  browser, MUST NOT be carried into the shared link, and MUST NOT override the layout's own
  decision at a size that cannot hold them. A peek MUST never be remembered, because nothing
  was chosen.
- **FR-016**: The balance rail MUST remain a reading about the desk as a whole and MUST NOT
  be reduced to one of the eighteen cards.

**Searching**

- **FR-017**: Readers MUST be able to search every parameter the console owns, from any
  scroll position, at any supported size.
- **FR-018**: A search MUST reveal exactly the controls that match it and leave the rest
  closed.
- **FR-019**: The searchable vocabulary MUST be derived from the single existing control
  declaration and MUST NOT be a second, separately-maintained list of names. A control
  added, renamed or removed there MUST become findable, renamed or unfindable with no
  further edit.
- **FR-020**: Every one of the 144 parameter keys MUST be reachable by search.
- **FR-021**: Each revealed match MUST be under the name of the channel that owns it, and
  where a control serves several subjects MUST name the subject.
- **FR-022**: Search MUST match a control's own label, its channel's name, and the published
  landmark names the desk already letters for that control, and MUST tolerate partial words,
  differing case and differing punctuation.
- **FR-023**: A revealed match that cannot be turned as the desk stands MUST say which of
  the four reasons applies — its channel is patched out, its channel's precondition is
  unmet, it belongs to the other of its strip's two models, or it is inert — and MUST state
  what would bring it back. Matches MUST NOT be silently dropped for this reason.
- **FR-024**: A revealed match that has been swept MUST have its study curve revealed with
  it, and a curve that no longer describes the desk MUST say so rather than stand as though
  it does.
- **FR-025**: A search matching nothing MUST say so in place and MUST NOT close the cards
  the reader had revealed.
- **FR-026**: Clearing a search MUST restore the reveal state the reader had before it, not
  the default one.
- **FR-027**: The search MUST be operable entirely from the keyboard — opened, typed into,
  moved through, acted on and dismissed — and MUST be reachable without hover.
- **FR-028**: Searching, revealing and turning a revealed control MUST NOT start a
  simulation beyond what turning that control would have started from its own strip, and
  searching alone MUST start none.

**Returning**

- **FR-029**: Readers MUST be able to reveal every control they have moved off its default,
  each with its channel, its current value and the default it left.
- **FR-030**: That reveal MUST include channels patched in or out relative to their
  defaults.
- **FR-031**: A revealed edit MUST be turnable and returnable to its default where it
  stands.
- **FR-032**: A desk sitting at its defaults MUST say so rather than present an empty grid.
- **FR-033**: What counts as an edit MUST be measured against the desk each time it is
  asked for, and MUST NOT be a record kept as edits happen.

**Throughout**

- **FR-034**: Nothing this feature adds may be *reachable* only on hover. The peek is an
  accelerator and MUST show nothing that a reveal does not show equally.
- **FR-035**: Every affordance MUST work at 390 px wide with no sideways scrolling.
- **FR-036**: No reading, control or explanation legible on the console today may become
  less legible or harder to reach.
- **FR-037**: The general notes at the head of the sheet MUST be updated to teach the grid,
  the reveal and the search, and their storage key bumped, because every step that names the
  console names something that has changed.

### Key Entities

- **Card**: One channel at rest. Carries its number, name, purpose, reading, patch state and
  any sentence about why it cannot be patched in. Hides only its controls.
- **Peek**: A card open under a fine pointer for as long as the pointer is on it. Chosen by
  nobody, kept by nothing, unavailable where there is no hover.
- **Reveal**: The state of a card, or of individual controls within one, being shown and
  kept. Set by the reader directly, by a search, or by asking what has been changed.
- **Channel**: One of the eighteen. Owns controls, holds a place in signal order, and may be
  in or out of the path.
- **Control**: One parameter, declared once. Carries a label, a value, a unit, optionally the
  published cases it is read against, optionally a study curve, and the two separate facts of
  whether it is drawn at all and whether it is currently reaching the model.
- **Match**: A control found by a search, carrying the control, its channel, its subject
  where a control serves several, its curve where one exists, and any reason it cannot be
  turned as the desk stands.
- **Edit**: One control sitting off its default, or one channel patched away from its default
  state, measured against the desk rather than recorded as it happens.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All **18 channels** can be named and their state read **without scrolling the
  console and with nothing revealed**, at every supported size.
- **SC-002**: A reader who knows a parameter's name reaches it in **under 10 seconds and at
  most three interactions**, from any scroll position, on a 390 px phone and on a desktop
  alike.
- **SC-003**: **All 144 parameter keys** are reachable by search, and every revealed match
  names its channel and, where it applies, its subject.
- **SC-004**: A search reveals **only** matching controls: measured over a set of terms, the
  count revealed equals the count that match, with **zero** non-matching controls revealed
  and **zero** matching controls omitted.
- **SC-005**: **90 % of first-time readers** locate a named parameter on the first attempt
  without scrolling the console end to end.
- **SC-006**: Median **time from page load to first parameter changed** falls by at least
  **half** against the console as it stands today.
- **SC-007**: Every affordance — revealing, searching, turning, listing edits — is operable
  **keyboard-only end to end**, and every reveal and state change is announced to a screen
  reader.
- **SC-008**: **Zero** simulations are started by revealing a card, searching, clearing a
  search, or listing edits.
- **SC-009**: **100 %** of revealed matches that cannot be turned state the reason and what
  would bring the control back; none is silently dropped.
- **SC-010**: **No** reading, control or explanation added by this feature is *reachable*
  only on hover: every card and every control a peek shows is equally reachable by a reveal,
  verified at 390 px with no hover available and again with a keyboard alone. The peek
  itself is an accelerator and shows nothing a reveal does not.
- **SC-011**: A pointer crossing the full width of the grid at reading speed leaves **zero**
  cards open behind it, moves the scroll position by **zero**, and disturbs **zero** cards
  the reader had revealed.
- **SC-012**: A pointer held still over a card sets **exactly one** card peeking, and it
  stays that one card for as long as the pointer does not move.
- **SC-013**: A card opens and closes fully within the time a reader takes to move between
  two cards, so a sweep across all eighteen leaves **no** animation still finishing.
- **SC-014**: Revealing or closing any card causes **no** movement of the card acted on and
  no scroll of the grid.
- **SC-015**: A reader who has moved *n* controls sees exactly *n* revealed edits, for every
  *n*, including after a revert, a link load, a scheme restore and a standard applied.
- **SC-016**: Clearing a search restores the reader's prior reveal state in **100 %** of
  cases.
- **SC-017**: Every rule above holds with reduced motion asked for, the animation excepted.

## Assumptions

- **Scope is the journey, not the desk's content.** No control is added, removed, renamed,
  re-defaulted or re-ranged; no model object changes; no reading changes; the link format
  does not move. If a control's label turns out to be unsearchable prose, that is a finding
  to raise rather than a licence to rename it here.
- **The grid is what is inside the console, and the button that opens the console is the
  only gesture in front of it.** That button exists today, at the foot of the title block,
  labelled *Model console · Every control on the desk*. Nothing new stands between the
  reader and the grid.
- **The peek is wanted and is settled.** A fine pointer passing over a card opens it and
  passing off closes it, animated, and that browsing gesture is the point rather than a side
  effect to be suppressed. Two constraints hold it up rather than cut it down: it must be
  anchored so a peeking card does not walk out from under the pointer and start the next one
  (FR-006), and it must change nothing, so a reader who has revealed a card keeps it while
  the pointer wanders (FR-005). Principle VII is met by the reveal rather than by the peek:
  click, tap and keypress reach the same state, and a coarse pointer or a keyboard simply
  never sees a peek.
- **The animation is a requirement, not a decoration.** A peek that snapped open would read
  as flicker rather than as a card being looked into, so the animation is what makes the
  gesture legible. Its budget is the reader's own pace (SC-013), and reduced motion drops
  the animation while keeping everything it was carrying (FR-008).
- **Search reveals rather than jumps.** This is the proposal's own idea and it replaces the
  first draft's find-and-jump-and-highlight: one mechanism, no second place to look, and a
  desk that answers a question rather than scrolling to an answer.
- **A revealed control is a working control.** A match is turnable where it stands, with its
  curve, rather than a link to the real thing elsewhere. Otherwise search is a table of
  contents and the reader still makes the journey.
- **Search matches labels, channel names and published landmark names.** Units and symbols
  are matched where they are already lettered on a control. Free-text matching against the
  long explanatory notes is out of scope for a first cut, because a note is prose and would
  return a result for every control mentioning insulation.
- **The three sizes are the ones the sheet already names**: the wide desk, the size at which
  the column stops fitting beside the drawing, and the phone. This feature does not introduce
  a fourth threshold, and thresholds stay declared once in the stylesheet and read back.
- **How the desk is read stays out of the shared link.** Reveal state, a search term and the
  edit list are all how the desk is being read rather than what it is, and the desk already
  keeps the pinned scheme and the chased standard out of the link on exactly that argument.
- **Metrics are gathered by moderated testing, not by instrumentation.** The page sends
  nothing anywhere, so SC-005 and SC-006 are measured in a session with readers, against a
  build of the console as it stands today as the baseline. Capture that baseline before
  implementation begins.
- **The general notes are part of done.** Changing how a reader gets around the sheet changes
  what the onboarding has to teach.
- **Out of scope for this feature**: reordering or regrouping the channels themselves;
  favourites or a personal subset of controls; any change to what a control does; any change
  to the sheet, the drawing, the schedules, the bill or the rail's arithmetic.
