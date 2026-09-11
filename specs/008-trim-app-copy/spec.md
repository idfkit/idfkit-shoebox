# Feature Specification: Trim the App's Copy

**Feature Branch**: `feature/app-copy-verbosity-f963e7`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "The copy on the app is currently way too **verbose**. Too much information to read on the screen is worse than not enough!"

## Context

The sheet explains itself in prose everywhere, and the prose has grown faster than the drawing. An inventory of the current build found the following always in view:

| Surface | When it shows | Approximate words |
| ------- | ------------- | ----------------- |
| TM59 qualifications block | after any run, under the scoreboard | 520 |
| Target notes under the scoreboard rows | after any run | 470 (up to 95 per note) |
| General notes (onboarding) | first visit | 340 (up to 75 per note) |
| Register ledes (three) | always | 165 |
| TM59 count row | after any run | 150 |
| Description and finding | after any run | 80 |
| Page lede | always | 70 |
| Bill lede, finding and citations | after a priced run | up to 110 |
| Channel blurbs (18) | desk open, wide screen | 641 (up to 60 each) |
| Control notes | desk open, wide screen | 1,500 (up to 77 each) |
| Meter notes | desk open, wide screen | 320 (up to 81 each) |

So a first reader on a desktop meets roughly 2,000 words of prose on the sheet before touching anything, and about 4,500 once the console is open. The house rules forbid hover-only explanation and require sources to be cited in place, and the sheet has satisfied both by printing everything, always. A fold satisfies both rules too, and costs the reader nothing they did not ask for.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the sheet at a glance (Priority: P1)

A modeller opens the page, lets the first run land, and wants to see what the building does: the drawing, the plate, the key readings and whether it meets the standards. Today the readings sit among paragraphs of method, caveat and citation, and the reader has to hunt for the numbers. After this change, what is in view by default is the drawing, the figures, their labels and at most one short line of context per block. Everything else is one deliberate tap away.

**Why this priority**: this is the complaint in its plainest form. The first screen decides whether a reader stays, and it is currently a wall of text.

**Independent Test**: load the page fresh on a desktop and on a 390 px phone, let the default run finish, and count the words of prose visible without opening anything. Confirm that every reading that was visible before is still visible.

**Acceptance Scenarios**:

1. **Given** a first visit with the default desk, **When** the first run finishes, **Then** the prose visible without opening anything (excluding figures, units, labels and table heads) totals no more than 600 words across the whole sheet.
2. **Given** any block on the sheet that letters a reading, **When** it is shown by default, **Then** its explanatory text in view is at most one sentence of no more than 25 words.
3. **Given** the scoreboard after a run, **When** the reader scans it, **Then** each target row shows its reading, its line and its verdict or absence in view, and its method note is folded.
4. **Given** the TM59 block after a run, **When** the reader scans it, **Then** the criteria readings and the count are in view, and the qualifications are summarised in one line with the full statement one tap away.

---

### User Story 2 - Work the console without reading it (Priority: P1)

A reader opens the model console to change the building. Today each of the eighteen strips carries a paragraph-length blurb, and many controls carry a note of up to 77 words, all printed on a wide screen. The reader wants the name of the channel, the controls, their values, the meter and any blocking reason. The explanation of how a control reaches the engine is for the reader who asks.

**Why this priority**: the console is where the reader spends their time, and it carries the largest volume of prose on the page.

**Independent Test**: open the desk on a wide screen and walk every strip. Confirm each strip reads as name, controls, meter and (if blocked) a short reason, and that each piece of explanation removed from view can be reached in one tap on the strip it belongs to.

**Acceptance Scenarios**:

1. **Given** the desk is open on a wide screen, **When** a strip is shown, **Then** its channel description in view is at most one line of no more than 12 words.
2. **Given** a control that carries an explanatory note, **When** the strip is shown, **Then** the note is not in view by default, and one tap on that control's own disclosure shows it in full.
3. **Given** a channel that is blocked, **When** the strip is shown folded or open, **Then** the blocking reason stays in view and is no longer than 15 words.
4. **Given** a meter whose reading is a transformation of an engine variable, **When** the strip is shown, **Then** the meter shows its label and reading in view and states the transformation behind one tap.

---

### User Story 3 - First-visit guidance that gets out of the way (Priority: P2)

A first-time reader meets the general notes. Today they are about 340 words of numbered paragraphs. The reader wants to know what to try next, in a line, and to be able to read more if they choose.

**Why this priority**: onboarding is read once and matters most on that one read, but it is a single block and smaller than the two stories above.

**Independent Test**: clear the stored onboarding state, load the page, and check that each note is readable at a glance, that completing a step still fills its marker from the genuine event, and that the longer explanation of each step is still reachable.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the general notes are shown, **Then** each note in view is a single instruction of no more than 15 words, and the block's lede is no more than 15 words.
2. **Given** a note's step has meaning beyond its instruction, **When** the reader opens that note, **Then** the fuller explanation is shown in place.
3. **Given** the notes change meaning, **When** the change ships, **Then** a returning reader is shown the new sheet rather than stale ticks.

---

### User Story 4 - Keep it short afterwards (Priority: P3)

A maintainer adds a control, a landmark, a target or a note next month. Without a limit, the copy grows back. The maintainer wants to be told, at the moment they write it, that an always-visible string is over its budget.

**Why this priority**: it protects the result of stories 1 to 3 but delivers nothing a reader sees on its own.

**Independent Test**: add a deliberately over-long always-visible string to a declaration and confirm the page refuses to load with a message naming the string and its budget.

**Acceptance Scenarios**:

1. **Given** a declared always-visible string over its budget, **When** the page loads, **Then** it fails at load naming the declaration, the string's word count and the budget.
2. **Given** a declared folded explanation of any length, **When** the page loads, **Then** no budget is enforced on it.

---

### Edge Cases

- **Refusals and failures**: a refused link, a station that cannot be read, or a failed run must still say why and what would fix it, in place and in view. These messages are shortened to one sentence but never folded, since a refusal nobody sees is a silent fallback.
- **Absent readings**: an em dash with its reason stays in view. The reason is shortened to at most 12 words.
- **Folded index layout (phone, short window)**: the folded strip row still shows its reading, patch marker and any blocking reason. The trimmed channel line appears only when the strip is opened.
- **Screen readers**: text moved behind a fold must stay reachable by keyboard and announced as expandable. Labels that currently carry explanation through accessible descriptions keep a short description; the long form lives in the fold, not in an attribute nobody can see.
- **Hover**: nothing currently printed may be moved into a tooltip or title attribute as its only home. Where a title attribute currently duplicates printed text, it may stay.
- **Citations**: a landmark, rate or target that cites a source keeps that citation reachable in place, one tap away at most.
- **Content that says the same thing twice**: where the same explanation appears in two places (for example the Chase explanation in the register lede, the general notes and the marker's label), it is kept once in view and removed elsewhere.

## Requirements *(mandatory)*

### Functional Requirements

**What stays in view**

- **FR-001**: Every reading, figure, unit, label, verdict, absence marker and blocking reason that is visible today MUST remain visible without opening anything.
- **FR-002**: Refusals, failure messages and their remedies MUST remain in view and in place; they MUST be shortened to one sentence each.
- **FR-003**: Each block that letters readings MUST carry at most one sentence of explanatory text in view, of no more than 25 words.

**What moves behind a tap**

- **FR-004**: Method notes, derivations, caveats, citations and "why" text MUST move behind an in-place disclosure attached to the thing they explain, closed by default.
- **FR-005**: A disclosure MUST open in place, with one tap or one key press, on every screen size, and MUST NOT depend on hover.
- **FR-006**: A closed disclosure MUST say what it holds in no more than 6 words (for example "Method", "Sources", "What this cannot judge"), so a reader knows whether to open it.
- **FR-007**: The open or closed state of disclosures MUST NOT reach the model, the link or any reading.

**What is rewritten or cut**

- **FR-008**: Channel descriptions in view MUST be one line of no more than 12 words; the rest of each current description MUST either move to the strip's disclosure or be cut.
- **FR-009**: Page-level ledes (the page lede, the register ledes, the desk subtitle) MUST each be no more than 25 words in view.
- **FR-010**: The general notes MUST be rewritten as one instruction per step of no more than 15 words, with each step's fuller explanation behind its own disclosure. Completion MUST still come only from the genuine event, and the onboarding storage key MUST be bumped.
- **FR-011**: The TM59 qualifications MUST be summarised in view in a single line that states how many qualifications apply, with the full statement of each behind a disclosure. The requirement that at least four qualifications exist is unchanged.
- **FR-012**: The scoreboard's per-target method notes MUST be folded; the Chase explanation MUST stay in view as one sentence of no more than 20 words.
- **FR-013**: Text that repeats an explanation available elsewhere on the sheet MUST be cut from all but one place.
- **FR-014**: The description and finding under the plate MUST together be no more than 60 words.
- **FR-015**: Rewritten copy MUST keep the house voice (plain, specific, no verdict words the sheet cannot back), MUST NOT introduce claims that were not made before, and MUST NOT drop a source that a claim depends on.

**Keeping it short**

- **FR-016**: Every always-visible string declared in the code's declarations (channel lines, control labels, blocking reasons, target lines, note instructions) MUST carry a word budget checked at page load, and a string over budget MUST stop the page from loading with a message naming it.
- **FR-017**: The design system document MUST record the copy budgets and the disclosure pattern as a standing rule, in the same change that introduces them.

### Key Entities

- **Glance text**: the short, always-visible line attached to a block, strip, control or note. Carries a word budget.
- **Disclosure**: an in-place, closed-by-default container attached to one block, strip, control or note, holding the long form of its explanation, citations and caveats. Has a short title and no budget.
- **Standing message**: a refusal, failure, blocking reason or absence reason. Always in view, one sentence, never folded.
- **Copy budget**: the maximum word count for a kind of glance text, declared once and checked at load.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a first visit with the default desk, after the first run, visible prose on the sheet falls from about 2,000 words to no more than 600 (at least a 70% reduction), measured by counting rendered words outside figures, units, labels and table heads.
- **SC-002**: With the console open on a wide screen, visible prose in the console falls from about 2,500 words to no more than 400.
- **SC-003**: No single always-visible block on the sheet exceeds 40 words of prose.
- **SC-004**: 100% of readings, figures, verdicts, absence markers and blocking reasons visible before the change are still visible after it, checked against a before-and-after inventory at the default desk and at least three other desk positions.
- **SC-005**: 100% of explanatory text removed from view is either reachable in one tap from the element it explains or was deliberately cut as a duplicate, checked against the same inventory.
- **SC-006**: A first-time reader can name the building's heating demand intensity and whether it meets Passivhaus within 10 seconds of the first run landing, without scrolling past prose to find them.
- **SC-007**: Adding an over-budget always-visible string to any declaration stops the page from loading, verified by one deliberate test per budget.
- **SC-008**: No generated model or link changes: the IDF at the default desk and at least three other desk positions is byte-identical before and after, and every existing permalink loads to the same desk.

## Assumptions

- **Folding, not deleting, is the default.** The user's complaint is about what is on the screen, not what exists. Most long text is folded rather than removed, and only true duplicates are cut. This keeps the sheet's commitment to citing its sources while ending the habit of printing every source always.
- **A fold satisfies the house rules.** The constitution forbids explanation that exists only on hover and requires citations in place. An in-place disclosure opened by a tap is neither hover nor elsewhere, so no constitutional amendment is needed. Where `CLAUDE.md` or the design system says a specific text is "printed in place" (the Chase explanation, the TM59 qualifications, the rail's sign convention), the in-view summary line plus an in-place fold is taken to meet it, and those documents are updated to say so.
- **The budgets above are starting points** chosen from the inventory: 12 words for a strip line, 15 for a note instruction or blocking reason, 25 for a block's explanation or a page lede, 40 as the hard ceiling for any visible block. They can be tuned during planning without changing the shape of the feature.
- **Landmark notes are out of scope.** They are already title-only and never printed, which is a separate question (hover-only text) from this one.
- **The folded engine console, revisions and disclosure sections are out of scope**; they are already closed by default.
- **No change reaches the model.** Copy and disclosure state are presentation only, so the model, the link format and every reading are untouched and the link version does not move.
- **The house voice is preserved.** The editorial standard used across the workspace governs the rewrite; shorter is the goal, not blander.
