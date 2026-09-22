# Feature Specification: Slider Parameter Help Notes

**Feature Branch**: `014-slider-parameter-tooltips`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Every parameter that has a slider needs a discrete tooltip (? icon) that shows the energyplus-driven memo/note about that field. This should be shown in the Model Console but also in dropdown menus where these parameters appear such as in the Design Space Survey"

## Clarifications

### Session 2026-09-21

- Q: Should the "sourced from the EnergyPlus schema" rule apply to all 87
  slider parameters, or only to the ones that actually map to an EnergyPlus
  object:field? → A: Schema field required only where one exists; a
  parameter with no EnergyPlus object:field of its own (for example, a
  shoebox-only geometry control) falls back to the existing no-invented-
  citation rule (FR-008).
- Q: Should each note's cited EnergyPlus object:field be automatically
  checked against the real schema at build/load time, or is a human-written
  citation enough with no automated check? → A: Human-authored only, no
  automated check.
- Q: Must a note state explicitly that a parameter has no EnergyPlus field of
  its own, or that no published source backs its default? → A: No. A note
  describes what the parameter writes and cites a source where one applies;
  it does not disclaim the absence of a field or of a source. It must still
  never invent or imply a citation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand a slider on the Model Console (Priority: P1)

A person adjusting the desk meets an unfamiliar slider (for example, a glazing
U-factor or a frame width) and wants to know, in place, what the field
represents and where its number or behavior comes from before they trust it
enough to move it.

**Why this priority**: This is the core promise of the feature and the case
the request names first. Without it, a reader has no way to learn what a
slider means except by asking someone else or hunting through outside
documentation.

**Independent Test**: Open the Model Console, find any slider-based parameter,
activate its help indicator, and confirm a non-empty explanation appears that
names what the field does in the simulation and where its fact comes from.

**Acceptance Scenarios**:

1. **Given** a slider-based parameter on the Model Console, **When** the
   reader activates its help indicator, **Then** the field's explanatory note
   is shown without leaving the console or changing the parameter's value.
2. **Given** a help note is open for one parameter, **When** the reader closes
   it, **Then** the parameter's current reading and value are unchanged and
   the console returns to its prior state.

---

### User Story 2 - Understand a parameter before choosing it as a survey axis (Priority: P2)

A person setting up a Design Space Survey is choosing which parameter to
sweep along an axis. Before committing to a candidate parameter, they want to
read the same explanation they would get on the Model Console, without
leaving the chooser to go find that control elsewhere.

**Why this priority**: Choosing a survey axis is a commitment that costs
computation time; picking blind, or having to abandon the chooser to go
look the control up elsewhere, defeats the point of a dropdown that already
lists every candidate together.

**Independent Test**: Open the Design Space Survey's axis chooser, activate
the help indicator on any candidate parameter's row, and confirm the same
explanatory text shown on the Model Console for that parameter appears
in place, with the chooser still open and the current selection unchanged.

**Acceptance Scenarios**:

1. **Given** the Design Space Survey axis chooser is open, **When** the reader
   activates a candidate parameter's help indicator, **Then** that parameter's
   note is shown inline in the chooser without picking or discarding any
   axis.
2. **Given** a parameter's note has been read on the Model Console, **When**
   the same parameter is later seen in the Design Space Survey chooser,
   **Then** its note reads identically in both places.

---

### User Story 3 - No slider is left unexplained (Priority: P3)

A person lands on a slider-based parameter that, before this feature, had no
explanatory note at all. They still find the same discrete help indicator
present, and activating it still produces a real explanation rather than an
empty or missing disclosure.

**Why this priority**: The request is for *every* parameter with a slider,
not only the ones already documented. A feature that only surfaces existing
notes would leave a visible but broken affordance on the remaining fields,
which is worse than not offering one.

**Independent Test**: Pick any slider-based parameter at random, on the
Model Console and in a chooser that lists it, and confirm its help indicator
is present and opens to non-empty text in both places.

**Acceptance Scenarios**:

1. **Given** a slider-based parameter that previously had no explanatory
   note, **When** the reader activates its help indicator, **Then** a
   genuine explanation is shown, describing what the field writes and
   citing a source where one applies.

---

### Edge Cases

- A slider is currently unable to reach the simulation (its channel is
  patched out, or the field is otherwise inert). The chooser already shows a
  sentence explaining *why the parameter cannot be chosen right now* in that
  case. The help note explaining *what the field means* must stay legible and
  distinct from that unavailability reason, not overwrite or blend into it.
- A parameter's note runs to several sentences, shown inside a chooser that
  already lists well over a hundred rows. Opening one note must not push
  other rows out of reach or break the chooser's search/filter behavior.
- The same parameter is visible in more than one place at once (its Model
  Console strip and an open Design Space Survey chooser). Opening its note in
  one place does not need to open or close it in the other; each place
  manages its own disclosure independently.
- A parameter's underlying number or behavior has never been backed by a
  published source. Its note describes the parameter without inventing or
  implying a citation that does not exist; it need not state the absence.
- A slider-based parameter has no corresponding EnergyPlus object or field at
  all (for example, massing width, depth or height, which only shape the
  vertices handed to the simulation and appear in no schema field of their
  own). Its note is governed by the general no-invented-citation rule
  (FR-008) rather than the schema-citation rule (FR-010), since there is no
  schema field to cite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show a small, discrete help indicator next to
  every slider-based parameter on the Model Console.
- **FR-002**: The system MUST show the same help indicator for a slider-based
  parameter everywhere that parameter is offered as a selectable item in a
  dropdown or list elsewhere in the application, including the Design Space
  Survey's axis chooser.
- **FR-003**: Activating a help indicator (by click or tap, not requiring
  hover) MUST reveal that field's explanatory note: what the field
  represents, how it drives the underlying EnergyPlus simulation, and where
  its stated fact, default, or limit comes from.
- **FR-004**: The explanatory note for a given parameter MUST read
  identically wherever that parameter appears, so the Model Console and every
  chooser describe the field in one voice.
- **FR-005**: Revealing or hiding a parameter's explanatory note MUST NOT
  change that parameter's current value, reading, selection state, or any
  availability/refusal reason already shown for it.
- **FR-006**: A help indicator MUST be individually opened and closed
  wherever it appears, and MUST be readable without navigating away from the
  Model Console strip or the open chooser it was activated from.
- **FR-007**: Every slider-based parameter MUST have an explanatory note; a
  parameter that has none today MUST be given one before this feature is
  considered complete for that parameter, so no help indicator opens to
  nothing.
- **FR-008**: A note MUST NOT present an invented or implied citation. Where a
  parameter's number or behavior is backed by a published source, its note
  may cite it; where it is not, the note describes what the parameter does
  and writes, and is not required to state that no field or no published
  source backs it.
- **FR-009**: The help indicator and its revealed note MUST remain usable on
  every layout and input method the Model Console and Design Space Survey
  already support, including touch-only devices that have no hover state.
- **FR-010**: Where a slider-based parameter corresponds to a specific
  EnergyPlus object and field, its explanatory note MUST cite that field's
  own definition in the EnergyPlus schema bundled with idfkit as its source,
  rather than a secondhand or paraphrased description of the same fact. A
  parameter with no corresponding EnergyPlus object or field is governed by
  FR-008 instead. This citation is established by whoever writes the note;
  the system is not required to automatically verify it against the schema.

### Key Entities

- **Slider-based parameter**: an adjustable field on the Model Console whose
  value is set by dragging along a graduated face, as opposed to picking from
  a fixed set of choices, a calendar, or a multi-value pattern editor. Has a
  label, a current value, and, under this feature, an explanatory note.
- **Explanatory note**: the EnergyPlus-driven memo attached to a parameter,
  describing what the field does inside the simulation and citing where its
  stated number, default, or limit comes from. Where the parameter
  corresponds to an EnergyPlus object and field, that field's own definition
  in idfkit's bundled EnergyPlus schema is the required source (FR-010);
  otherwise the note describes what the parameter writes and cites whatever
  real source applies, without inventing one (FR-008).
- **Chooser**: any dropdown or list in the application that offers
  slider-based parameters for selection, such as the Design Space Survey's
  axis chooser.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can learn what any slider-based parameter means and
  where its number comes from in a single click or tap, without leaving the
  Model Console.
- **SC-002**: 100% of slider-based parameters show a help indicator with a
  non-empty explanatory note, both on the Model Console and in every chooser
  that lists them.
- **SC-003**: A reader choosing a Design Space Survey axis can read a
  candidate parameter's explanation from inside the chooser, without
  switching back to the Model Console to look it up.
- **SC-004**: Opening or closing an explanatory note never changes a
  parameter's value, availability, or reading; this holds for every
  slider-based parameter, not only the ones already documented today.

## Assumptions

- "Slider" means a continuously or discretely adjustable control whose value
  is set by dragging along a graduated face (for example, a straight scale,
  a rotary dial, or a drag-along-a-bar control), not a fixed-choice selector,
  a calendar, or a multi-value pattern/day editor. Fixed-choice selectors
  already reveal their own per-choice explanation in place and are unaffected
  by this feature.
- The help indicator is revealed by an explicit tap or click, consistent with
  the product's existing convention of never explaining something only on
  hover, and is kept visually and structurally separate from a parameter's
  always-visible reading, verdict, or unavailability reason.
- Roughly a third of today's slider-based parameters have no explanatory note
  yet. Writing those remaining notes, in the same voice as the notes that
  already exist and under the sourcing rule in FR-010, is in scope for this
  feature rather than a follow-on content task.
- The Design Space Survey's axis chooser is the example named in the request;
  the same requirement extends to any other chooser or list in the
  application that offers these same parameters for selection, present or
  future.
