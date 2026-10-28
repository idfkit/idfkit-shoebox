# Feature Specification: Undo and Redo on the Desk

**Feature Branch**: `016-undo-desk-changes`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "there is currently no way to reverse a user action (undo changing a configuration for the shoebox). Should we use the browser's history (back forward buttons) to do so?"

## Clarifications

### Session 2026-10-28

- Q: Should the browser's history (Back / Forward) be the undo record? → A: No.
  Undo is a stack held inside the page, driven by on-page controls and the usual
  keyboard shortcuts. The browser's history is left as it is today: the address
  is overwritten so it always carries the current desk, and Back still means
  "leave this page".
- Q: Should the undo stack survive a reload of the tab? → A: Yes. It is kept for
  the tab and used again when the page boots on the scheme the stack ends on
  (User Story 3, FR-014).

## Why not the browser's history

Using the browser's history as the undo record was considered and rejected:

- **Back means "go to where I was", not "undo my last edit".** Adding an entry
  per edit traps readers on the page: getting back to where they came from
  would take dozens of Back presses.
- **Browsers work against it.** Some skip entries added without a user gesture.
  Some keep only about fifty entries per tab, so a busy session would push the
  reader's earlier sites out of that tab's history. Some throttle history
  writes, which this page has already hit.
- **Editing tools don't do it.** Drawing, document and CAD tools on the web keep
  an in-app undo stack and leave Back alone.
- **This page already chose not to.** A drag session is one address, not one
  history entry per release.

The one advantage history had, that every past state is a scheme link, is kept:
each step on the stack *is* the scheme link the address would carry, restored
through the same path a link or a kept scheme is restored through. One format
for the state means the undo record cannot drift from the address.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Take back the last change (Priority: P1)

A reader drags the insulation slider, sees the heating peak jump, and wants the
previous value back. Today they have to remember the old figure and drag back to
it, or press Revert all and lose every other change. With this feature they
press Undo (or Ctrl/Cmd+Z) and the desk returns to exactly how it was before the
drag. The drawing, the model, the readings and the address all match the
earlier scheme.

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
2. **Given** the reader has just undone a change, **When** they press Redo,
   **Then** the undone change is re-applied exactly.
3. **Given** the reader has undone a change, **When** they make a different
   change, **Then** the undone change can no longer be redone (the redo branch
   is discarded, as with any undo).
4. **Given** a drag that passed through many values before release, **When** the
   reader presses Undo once, **Then** the desk returns to the value before the
   drag began, not to an intermediate value.
5. **Given** a focused number field in the margin with typed text, **When** the
   reader presses Ctrl/Cmd+Z, **Then** the field's own text undo runs and the
   desk is not undone.
6. **Given** any number of undo steps, **When** the reader presses the browser's
   Back, **Then** the browser leaves the page (or goes to whatever came before
   it) exactly as it does today; undo has added nothing to the browser's
   history.

---

### User Story 2 - Step back through several moves (Priority: P1)

A reader makes a run of changes: glazing ratio, then pane count, then bypasses
Shading, then applies a standard. They step back one move at a time to find the
point where a reading crossed a limit, then step forward again.

**Why this priority**: Single-level undo turns exploring into a gamble. The
sheet exists so readers can compare schemes, and a stack of steps lets them
compare the path they took.

**Independent Test**: Make five distinct changes of different kinds (slider,
selector, patch toggle, standard, Revert all), undo all five one at a time, and
check after each step that the desk equals the recorded state at that point.
Then redo all five.

**Acceptance Scenarios**:

1. **Given** five recorded changes, **When** the reader presses Undo five times,
   **Then** each press restores the state before the matching change, in reverse
   order, and Undo is then disabled.
2. **Given** the reader pressed Revert all, **When** they press Undo, **Then**
   every control, patch and solo setting they had before Revert all comes back.
3. **Given** the reader applied a standard or restored a kept scheme, **When**
   they press Undo, **Then** the desk returns to its state before that action in
   one step.
4. **Given** the reader nudges one slider with the arrow keys ten times in quick
   succession, **When** they press Undo, **Then** all ten nudges are undone as
   one step.

---

### User Story 3 - Undo survives a reload of the tab (Priority: P2)

A reader reloads the tab, by accident or to recover from a stuck run, and still
wants to step back through what they did before the reload.

**Why this priority**: This is the one benefit the browser's history would have
given for free, and it was asked for explicitly. A reload is the reader's own
way out of a stuck run, and it should not also throw away the path they took.

**Independent Test**: Make three changes, reload the tab, press Undo three times,
and check that each step matches what it would have been without the reload.

**Acceptance Scenarios**:

1. **Given** three changes and a reload of the same tab, **When** the page has
   booted on the same scheme it was showing, **Then** Undo is enabled and steps
   back through the three changes.
2. **Given** the page boots on a different scheme from the one the kept stack
   ends on (a pasted link, an edited address, a refused link), **When** it
   finishes booting, **Then** the kept stack is discarded and Undo starts empty.
3. **Given** a new tab, or the same scheme link opened in another tab, **When**
   the page boots, **Then** Undo starts empty; stacks are never shared between
   tabs.

---

### User Story 4 - Undo across a change of climate (Priority: P3)

A reader switches the weather station (or attaches a weather file) and wants to
go back to the previous climate.

**Why this priority**: Climate changes are rarer and already take a heavier
path. They should be undoable, but they do not need to be instant.

**Independent Test**: Change station, press Undo, and check that the desk is
back on the previous station with the previous parameters, having gone through
the same path a link naming that station takes.

**Acceptance Scenarios**:

1. **Given** the reader changed station, **When** they press Undo, **Then** the
   previous station is restored by the same path a link naming it takes, with
   the status line saying it is fetching that station's weather, and the stack
   is kept across that reload (Story 3).
2. **Given** the previous step names a weather file this browser no longer
   holds, **When** the reader undoes to it, **Then** the desk asks for that file
   in the file's own words, exactly as a link carrying it does. Nothing is
   solved against another climate in the meantime.

### Edge Cases

- **Undo during a drag**: Undo pressed mid-drag (keyboard while pointer held) is
  ignored until the gesture ends. A gesture becomes a step only once it is
  complete.
- **Undo while a solve is in flight**: the restored state is solved next
  (latest wins). The run in flight is not shown as the current desk.
- **Undo while a study or survey is running**: Undo is a change to the desk like
  any other and cancels in-flight study work exactly as a gesture does. Completed
  study and survey results, and the sample cache, are kept.
- **A refused link** empties the stack: the desk was reset to the issued drawing,
  and nothing on the stack led there.
- **A step that no longer decodes** (a stack kept across a reload into a newer
  page version): the whole kept stack is discarded at boot, before Undo is
  enabled, and nothing from it is half applied.
- **Reading state** (the pinned hour and the plate's chosen view) rides the
  address but is not a configuration change. It adds no steps and is not undone.
  Undo carries the current view and pin across, and a pin the restored run
  cannot honour is released with its existing stated reason.
- **Units (SI / IP)** are lettering, not part of the scheme, and are never undone.
- **Kept schemes and the shelf**: keeping or deleting a scheme is not a desk
  change and is not undone. Restoring one is (Story 2, scenario 3).
- **No change**: a gesture that ends where it began (drag and release on the same
  value, typing the same number) adds no step.
- **A long session**: the stack holds at least the last 100 steps. Past that the
  oldest step is dropped, and the stack does not say it was ever there.
- **Storage unavailable** (private mode, blocked site data): undo works for the
  life of the page and starts empty after a reload. No error is shown, because
  nothing the reader asked for has failed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each completed configuration gesture MUST push exactly one step
  onto the page's undo stack, holding the scheme as it was before the gesture.
  Configuration means anything that changes the scheme the address carries,
  apart from the reading state: control values, patch bay, solo, priced
  controls, station or weather file, run calendar.
- **FR-002**: Intermediate states during a gesture (drag frames, held keys) MUST
  NOT push steps.
- **FR-003**: Consecutive changes to the same control with no other change
  between them, each within a short window of the last (default one second),
  MUST merge into one step.
- **FR-004**: Multi-control actions (Revert all, the sheet's dimension reset,
  applying a standard, restoring a kept scheme, a patch-bay solo) MUST each be
  one step.
- **FR-005**: A gesture that leaves the scheme unchanged MUST NOT push a step.
- **FR-006**: Each step MUST be held in the same form the address carries (the
  scheme link). Undo and Redo MUST restore it through the same path a kept
  scheme is restored through: in place when it names the attached climate,
  through the link path (refusals included) when it names another.
- **FR-007**: After an undo or redo, the desk (parameters, patch bay, solo,
  priced channels, climate) MUST equal the step's decoded scheme, and the
  address MUST equal that scheme.
- **FR-008**: An undo or redo MUST re-solve and re-price as a gesture does. The
  previous results stay standing, dimmed, until the new run lands. Studies in
  flight are cancelled as by a gesture; completed results and the sample cache
  are kept.
- **FR-009**: The browser's session history MUST be unchanged by this feature:
  the address keeps being overwritten, never added to. Back and Forward behave
  exactly as before.
- **FR-010**: The desk MUST show Undo and Redo controls, each disabled when there
  is nothing to undo or redo. Both MUST be operable by keyboard and have
  accessible names that say what they do.
- **FR-011**: Ctrl+Z / Cmd+Z MUST undo, and Ctrl+Shift+Z / Cmd+Shift+Z (and Ctrl+Y on
  platforms other than Mac) MUST redo, except when focus is in a text-editable
  field, where the field's own text undo runs.
- **FR-012**: Making a new change after an undo MUST discard the redo steps.
- **FR-013**: The pinned hour and the plate's view MUST NOT push steps and MUST
  NOT be undone.
- **FR-014**: The stack MUST be kept for the tab across a reload, and only used
  if the page boots on the scheme the stack ends on and every step on it still
  decodes. Otherwise it is discarded whole. It MUST NOT be shared between tabs
  and MUST NOT leave the reader's browser.
- **FR-015**: Refusing a link MUST empty the stack.
- **FR-016**: The stack MUST hold at least 100 steps, dropping the oldest beyond
  its limit.
- **FR-017**: Undo and redo MUST be recorded in the report trail as moves, so a
  feedback report shows that the desk was stepped back.
- **FR-018**: The onboarding notes MUST mention Undo where they teach the desk's
  controls, and the notes' storage key MUST be bumped.

### Key Entities

- **Undo step**: one scheme the desk was in before a completed configuration
  gesture, held as the scheme link. It also records which control the gesture
  moved (for the merge rule) and is otherwise opaque.
- **Undo stack**: the steps behind the current desk and the redo steps ahead of
  it. It belongs to one tab, is bounded, and is kept across a reload of that
  tab.
- **Reading state**: the pinned hour and the plate's view. Carried on the address
  and owned by no step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any sequence of up to 100 gestures, undoing all of them
  returns a desk whose generated model is byte-identical to the model before the
  first gesture. Redoing all of them returns a model byte-identical to the one
  after the last.
- **SC-002**: Undo and Redo on the same climate cause zero page reloads, and the
  controls show the restored state within 100 ms of the press, before the
  re-solve lands.
- **SC-003**: After any number of gestures and undos, one press of the browser's
  Back leaves the page.
- **SC-004**: A reader can undo an accidental Revert all in one press.
- **SC-005**: After a reload on the same scheme, undoing gives the same sequence
  of desks as it would have without the reload, in 100% of tested cases.
- **SC-006**: In a hallway test, at least 4 of 5 first-time readers asked to
  "put the last change back" do so without help within 10 seconds.

## Assumptions

- **The stack holds scheme links, not diffs.** A link is small (a delta against
  the defaults), so holding whole schemes keeps restoring simple and makes every
  step something that could be copied out as a link.
- **Merge window** for repeated nudges to one control is one second by default.
  It only shapes how many steps Undo takes, never what any step restores.
- **The stack limit** is 100 steps. It is generous for a session at the desk and
  keeps the kept stack small.
- **Persistence is per tab and for the session only**, using the browser's
  storage for the tab. It reaches no link, no kept scheme and no report beyond
  the trail's record that undo was used.
- **Readings are re-solved, not cached**, on undo. A warm design day solves in
  about 50 ms, so a run cache for undo is not needed for this feature.
- **Study and survey results are not part of the desk** and are not undone. They
  already key their samples by shape, so returning to an earlier shape reuses
  them.
- **Units and the shelf of kept schemes** are outside undo.
- **Adding browser history entries for "place-like" changes** (a change of
  station, restoring a kept scheme) is a possible later addition and is out of
  scope here.
