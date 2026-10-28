# Feature Specification: Undo and Redo on the Desk

**Feature Branch**: `016-undo-desk-changes`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "there is currently no way to reverse a user action (undo changing a configuration for the shoebox). Should we use the browser's history (back forward buttons) to do so?"

## The question asked, answered

**Yes, the browser's history should hold the record, but it should not be the
only way to reach it.** The page already rewrites the address after every
gesture so that it always carries the whole desk. Today it does that by
overwriting the current history entry, so the record of where the reader has
been is thrown away one gesture at a time. Adding an entry per gesture instead
gives undo almost for free, and it has properties no in-page stack has:

- **One record, not two.** The address already is the desk. A separate undo
  stack would be a second copy of the same state, and the two could drift. With
  history as the record, what Undo restores and what the address bar shows
  cannot disagree.
- **It survives a reload,** and the gestures readers already know (Back, the
  mouse's back button, a trackpad swipe, Alt+Left) work with no teaching.
- **Every step back is itself a shareable link.** A reader who undoes three
  moves can copy the address and send that earlier scheme.

There are three costs, and the requirements below are written against them:

1. **The page reloads on any address change today.** A scheme-shaped fragment
   arriving by navigation reloads the page, because a pasted link has to go
   through the boot decode. Unchanged, every Back press would cost a full
   reload. A step through the reader's own history has to restore in place.
2. **Back is not discoverable as undo, and it leaves the page.** Readers do not
   expect Back to undo a slider, and one press too many leaves the page. So the
   desk also gets visible Undo / Redo controls and the usual keyboard shortcuts.
   These walk the same history and stop at the first entry of this visit, so
   they never leave the page.
3. **Browsers throttle history writes** (WebKit throws on the 101st write in ten
   seconds). One entry per completed gesture, never per frame, with repeated
   nudges to one control merged, keeps well inside that limit.

The rejected alternative, an in-page stack with history left as it is, is
simpler to build. It loses the reload and Back behaviour and adds a second copy
of the desk's state that has to agree with the address. It is recorded under
Assumptions as the fallback if traversal in place turns out to be unworkable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Take back the last change (Priority: P1)

A reader drags the insulation slider, sees the heating peak jump, and wants the
previous value back. Today they have to remember the old figure and drag back to
it, or press Revert all and lose every other change. With this feature they
press Undo (or Ctrl/Cmd+Z, or the browser's Back) and the desk returns to
exactly how it was before the drag. The drawing, the IDF, the readings and the
address all match the earlier scheme.

**Why this priority**: This is the gap the request names. Without it, every
exploratory move is a commitment.

**Independent Test**: Change one control, press Undo, and check that every
parameter, the patch bay and the address equal the state before the change, and
that the re-solved readings equal those of the earlier run.

**Acceptance Scenarios**:

1. **Given** a desk with insulation at its default, **When** the reader drags it
   to a new value and releases, then presses Undo, **Then** insulation is back at
   its default, the address is the one before the drag, and the sheet re-solves
   to the earlier readings.
2. **Given** the reader has just undone a change, **When** they press Redo (or
   the browser's Forward), **Then** the undone change is re-applied exactly.
3. **Given** the reader has undone a change, **When** they make a different
   change, **Then** the undone change can no longer be redone (the redo branch
   is discarded, as with any undo).
4. **Given** a drag that passed through many values before release, **When** the
   reader presses Undo once, **Then** the desk returns to the value before the
   drag began, not to an intermediate value.
5. **Given** a focused number field in the margin with typed text, **When** the
   reader presses Ctrl/Cmd+Z, **Then** the field's own text undo runs and the
   desk is not undone.

---

### User Story 2 - Step back through several moves (Priority: P1)

A reader makes a run of changes: glazing ratio, then pane count, bypasses
Shading, then applies a standard. They step back one move at a time to find the
point where a reading crossed a limit, then step forward again.

**Why this priority**: Single-level undo turns exploring into a gamble. The
sheet exists so readers can compare schemes, and a history makes the path they
took into something they can compare.

**Independent Test**: Make five distinct changes of different kinds (slider,
selector, patch toggle, standard, Revert all), undo all five one at a time, and
check after each step that the desk equals the recorded state at that point.
Then redo all five.

**Acceptance Scenarios**:

1. **Given** five recorded changes, **When** the reader presses Undo five times,
   **Then** each press restores the state before the matching change, in reverse
   order, and the sixth press does nothing (Undo is disabled at the first entry
   of the visit).
2. **Given** the reader pressed Revert all, **When** they press Undo, **Then**
   every control, patch and solo setting they had before Revert all comes back.
3. **Given** the reader applied a standard or restored a kept scheme, **When**
   they press Undo, **Then** the desk returns to its state before that action as
   one step.
4. **Given** the reader nudges one slider with the arrow keys ten times in quick
   succession, **When** they press Undo, **Then** all ten nudges are undone as
   one step.

---

### User Story 3 - The browser's Back and Forward do the same thing (Priority: P2)

A reader who habitually uses the browser's Back button, a mouse back button or a
trackpad swipe gets the same undo as the on-page control. No reload, no lost
studies, no flash of an empty sheet.

**Why this priority**: The visible control covers the need. This story makes
the platform's own gesture agree with it rather than fight it. Today a Back
press would reload the page, or leave it.

**Independent Test**: Make three changes, press the browser's Back three times
and Forward three times, and check that the page never reloads and that each
step matches the on-page Undo/Redo result.

**Acceptance Scenarios**:

1. **Given** three changes made in this visit, **When** the reader presses the
   browser's Back, **Then** the previous state is restored in place without a
   page reload, and the results on the sheet stay standing (dimmed) until the
   re-solve lands.
2. **Given** the reader is at the first entry of the visit, **When** they press
   the browser's Back, **Then** the browser leaves the page as it normally would.
   The on-page Undo is already disabled at that point.
3. **Given** the reader has reloaded the page after making changes, **When** they
   press Back, **Then** they reach the earlier scheme, restored in place or
   through the boot path. Either way the desk ends equal to that entry's scheme.

---

### User Story 4 - Undo across a change of climate (Priority: P3)

A reader switches the weather station (or attaches a weather file) and wants to
go back to the previous climate.

**Why this priority**: Climate changes are rarer and already go through a
heavier path. They should be undoable, but they do not need to be instant.

**Independent Test**: Change station, press Undo, and check the desk is back on
the previous station with the previous parameters, having gone through the same
path a link naming that station takes.

**Acceptance Scenarios**:

1. **Given** the reader changed station, **When** they press Undo, **Then** the
   previous station is restored by the same path a link naming it takes, with
   the status line saying it is fetching that station's weather.
2. **Given** the previous entry names a weather file this browser no longer
   holds, **When** the reader steps back to it, **Then** the desk asks for that
   file in its own words, exactly as a link carrying it does. Nothing is solved
   against another climate in the meantime.

### Edge Cases

- **Undo during a drag**: Undo pressed mid-drag (keyboard while pointer held) ends
  nothing and is ignored until the gesture ends; a gesture is one entry only once
  it completes.
- **Undo while a solve is in flight**: the restored state is solved next
  (latest wins). The run in flight is not shown as the current desk.
- **Undo while a study or survey is running**: Undo is a change to the desk like
  any other and cancels in-flight study work exactly as a gesture does. Completed
  study and survey results and the sample cache are kept.
- **A refused link**: the refused address is replaced (not added to), so Undo
  never lands on a scheme the desk refused.
- **An entry that no longer decodes** (for example from an older page version in
  the same tab): it is refused whole with the existing link-refusal sentence,
  never half applied.
- **Reading state** (the pinned hour and the plate's chosen view) rides the
  address but is not a configuration change. It does not create entries and is
  not undone by Undo; stepping to another entry carries the current view and pin
  across. A pin the restored run cannot honour is released with its existing
  stated reason.
- **Units (SI / IP)** are lettering, not on the address, and are never undone.
- **Kept schemes and the shelf**: keeping or deleting a scheme is not a desk
  change and is not undone. Restoring one is (Story 2, scenario 3).
- **Rapid gestures**: thirty distinct clicks in ten seconds must not trip the
  browser's history throttle. Repeated nudges to one control merge, and if the
  throttle is reached anyway the newest state still reaches the address (the
  entry is overwritten rather than lost), with no error surfaced to the reader.
- **A pasted link into the same tab** still reloads through the boot decode as
  today. Only traversal through this visit's own entries restores in place.
- **No change**: a gesture that ends where it began (drag and release on the same
  value, typing the same number) creates no entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each completed configuration gesture MUST add exactly one entry to
  the browser's session history, whose address is the desk's scheme after the
  gesture. Configuration means anything that changes the scheme the address
  carries apart from the reading state: control values, patch bay, solo, priced
  controls, station or weather file, run calendar.
- **FR-002**: Intermediate states during a gesture (drag frames, held keys) MUST
  NOT add entries; they continue to overwrite the current entry or wait for the
  gesture's end, as today.
- **FR-003**: Consecutive changes to the same control with no other change
  between them, each within a short window of the last (default one second),
  MUST merge into one entry.
- **FR-004**: Multi-control actions (Revert all, the sheet's dimension reset,
  applying a standard, restoring a kept scheme, a patch-bay solo) MUST each be
  one entry.
- **FR-005**: A gesture that leaves the scheme unchanged MUST NOT add an entry.
- **FR-006**: Moving to another entry of this visit by any route (on-page Undo or
  Redo, keyboard shortcut, browser Back or Forward, history menu) MUST restore
  that entry's scheme in place, without a page reload, when the entry names the
  climate already attached.
- **FR-007**: Moving to an entry that names a different climate MUST restore it
  through the same path a link naming that climate takes, refusals included,
  and say so in the status line before it reloads.
- **FR-008**: After any restore, the desk (parameters, patch bay, solo, priced
  channels, climate) MUST equal the entry's decoded scheme, and the address MUST
  equal that entry's address.
- **FR-009**: A restore MUST re-solve and re-price as a gesture does. The previous
  results stay standing, dimmed, until the new run lands. Studies in flight are
  cancelled as by a gesture; completed results and the sample cache are kept.
- **FR-010**: The desk MUST show Undo and Redo controls, each disabled when there
  is no earlier or later entry from this visit. Both MUST be operable by
  keyboard and have accessible names that say what they do.
- **FR-011**: Ctrl+Z / Cmd+Z MUST undo and Ctrl+Shift+Z / Cmd+Shift+Z (and Ctrl+Y on
  non-Mac platforms) MUST redo, except when focus is in a text-editable field,
  where the field's own text undo runs.
- **FR-012**: The on-page Undo MUST NOT leave the page: it is disabled at the
  first entry of the visit, even if the browser holds earlier entries from other
  pages.
- **FR-013**: The pinned hour and the plate's view MUST NOT add entries and MUST
  NOT be undone. A step to another entry keeps the current view and pin and
  writes them onto the entry it lands on.
- **FR-014**: Refusing a link MUST replace the current entry, never add one.
- **FR-015**: An entry that cannot be decoded when reached MUST be refused whole
  with the existing link-refusal behaviour.
- **FR-016**: Pasting or typing a different scheme link into the address bar of
  the same tab MUST keep today's behaviour (boot through the link decode).
- **FR-017**: Undo and redo MUST be recorded in the report trail as moves, so a
  feedback report shows that the desk was stepped back.
- **FR-018**: The onboarding notes MUST mention Undo where they teach the desk's
  controls, and the notes' storage key MUST be bumped.

### Key Entities

- **History entry**: one completed configuration gesture's resulting scheme, held
  as the address the browser records. It has an address (the scheme link), a
  position in this visit's sequence, and whether it belongs to this visit.
- **Visit boundary**: the first entry created or arrived at in this page load
  (or, after a reload, the first entry of the earliest load still in history
  that this page recognises). The on-page Undo does not cross it.
- **Reading state**: the pinned hour and the plate's view. Carried on every
  entry's address, owned by none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any sequence of up to 50 gestures, undoing all of them
  returns a desk whose generated model is byte-identical to the model before the
  first gesture. Redoing all of them returns a model byte-identical to the one
  after the last.
- **SC-002**: Stepping back or forward between entries on the same climate causes
  zero page reloads, and the controls show the restored state within 100 ms of
  the press, before the re-solve lands.
- **SC-003**: The browser's Back and the on-page Undo, pressed from the same
  state, produce identical desks and identical addresses in 100% of tested cases.
- **SC-004**: Thirty distinct gestures in ten seconds, and a held arrow key on a
  slider for ten seconds, produce no history-throttle error, and the address
  equals the desk afterwards.
- **SC-005**: A reader can undo an accidental Revert all in one press.
- **SC-006**: In a hallway test, at least 4 of 5 first-time readers asked to
  "put the last change back" find a way to do it without help within 10 seconds.

## Assumptions

- **History is the record.** There is no separate in-page undo stack. If
  in-place traversal proves unworkable in a target browser, the fallback is an
  in-page stack of scheme addresses with the browser's history left as it is
  today; this spec's Undo/Redo controls and shortcuts stand unchanged under that
  fallback, and only Story 3 is lost.
- **Merge window** for repeated nudges to one control is one second by default;
  it only shapes how many steps Undo takes, never what any step restores.
- **The browser's own history length** limits how far back a reader can go (some
  browsers keep about fifty entries). No additional limit is imposed and none is
  promised beyond what the browser keeps.
- **Readings are re-solved, not cached**, on undo. A warm design day solves in
  about 50 ms, which makes a run cache for undo unnecessary for this feature.
- **Study and survey results are not part of the desk** and are not undone; they
  already key their samples by shape, so returning to an earlier shape reuses
  them.
- **Units and the shelf of kept schemes** are outside undo (they are not part of
  the scheme the address carries, or are not desk changes).
- Mobile browsers' back gesture is treated exactly as Back.
