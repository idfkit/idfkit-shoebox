# Feature Specification: Tolerance bands

**Feature Branch**: `016-tolerance-bands`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Add \"Tolerance bands\" to Shoebox: the inverse of the design space survey. The survey answers \"what happens to my results if I vary this lever?\" Tolerance bands answer the question designers actually ask in early design: \"given my targets, how far can I move each lever and still meet all of them?\" Borrow the idea from engineering tolerances. The output tells an architect where they have creative freedom and which single lever is currently breaking a target."

## Overview

The sheet already has three ways to look at what a control does. A study draws one reading along one control. The pull ranks every control by how hard it is pulling one reading. The survey (E-02) cuts a ground through two controls and, since feature 012, draws each standard's published line across it. All three start from a lever and report a result: *move this, and here is what happens*.

An architect in early design usually holds the question the other way round. The targets are fixed first (a client brief, a standard, a planning condition), and the open question is how much room is left: *how far can I take the glazing, the depth of the plan, the wall build-up, before something fails?* Today the reader answers that by sweeping one control at a time, reading each target off each curve, and keeping the passing interval in their head.

Tolerance bands do that work for every lever at once. An engineering drawing letters a dimension with its tolerance (50 mm, +0.2 / −0.1) and says how far the part may deviate and still be acceptable. A tolerance band does the same for a lever on the desk. Holding every other control where it stands, it gives the stretch of that lever's travel over which **every** target in force still passes, measured from completed runs and lettered against the lever's current setting.

Read together, the bands answer two questions:

- **Where is there freedom?** A lever whose band is wide, or runs to both stops, can be set on architectural grounds and costs nothing against the targets. A lever whose band is a sliver is where the design is tight.
- **What is breaking it?** When the current design fails a target, no band contains the current setting. For each lever, the band then shows the nearest position that would restore compliance on its own, if one exists, and how far away it is. The lever with the smallest such move is named as the single lever that would put the design back inside its targets. If no single lever can do it, the sheet says so plainly.

A tolerance band is a one-at-a-time measure, as an engineering tolerance is before anyone checks the stack-up. Each band holds the other levers at their current settings, so moving two levers to the edge of their own bands at once is not guaranteed to pass. The sheet states this in place every time bands are shown.

## Clarifications

### Session 2026-11-03

- *(pending; see the open questions below and `[NEEDS CLARIFICATION]` markers)*

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how much room each lever has (Priority: P1)

An architect has a desk that currently meets every target in force. Before committing to a form, they want to know which controls they can move freely and which ones are tight, without sweeping each control by hand and reading each target off each curve.

**Why this priority**: This is the core inversion the feature exists for. Every other story builds on a band measured against the targets in force, and on its own this story already gives the reader a map of their creative freedom.

**Independent Test**: Start from a desk that passes every target in force, ask for tolerance bands, and confirm that each lever shows a band containing its current setting, with each edge lettered as a value of that lever (or as reaching its stop). Then set one lever just outside its band and confirm that at least one target now fails on the scoreboard.

**Acceptance Scenarios**:

1. **Given** a desk that meets every target in force, **When** the reader asks for tolerance bands, **Then** every lever whose travel reaches the model shows a band containing its current setting. The band's lower and upper edges are each lettered as a value in that lever's own units, or stated as running to the lever's stop.
2. **Given** bands are shown, **When** the reader moves one lever to a position inside its band and lets the desk solve, **Then** every target in force still passes on the scoreboard, as the band said it would.
3. **Given** bands are shown, **When** the reader moves one lever to a measured position just outside its band, **Then** at least one target fails, and the band named that target as the one that closes this side.
4. **Given** bands are shown, **When** the reader looks at any one band, **Then** they can tell from the band alone which target closes each edge, so the reason a lever is tight is visible without opening anything.

---

### User Story 2 - Find the single lever that is breaking a target (Priority: P1)

An architect has a desk that fails one or more targets in force. They want to know which control, moved on its own, would bring the design back into compliance, and how far it would have to move.

**Why this priority**: This is the second half of what the reader asked for, and it is where the feature saves the most work. A failing design has no band around its current setting, so the useful answer is the nearest passing position for each lever and the smallest move among them.

**Independent Test**: Start from a desk that fails exactly one target. Ask for bands and confirm that the sheet names one lever and a position for it. Set that lever to that position and confirm every target in force then passes.

**Acceptance Scenarios**:

1. **Given** a desk that fails at least one target in force, **When** the reader asks for tolerance bands, **Then** for each lever the sheet shows either the measured stretch of its travel where every target would pass with that lever moved alone, or a stated reason why no such stretch exists within its range.
2. **Given** at least one lever can restore compliance on its own, **When** bands are shown, **Then** the sheet names the lever whose smallest move restores every target in force, gives the position it would have to reach, and states which targets currently fail.
3. **Given** no single lever can restore every target in force within its range, **When** bands are shown, **Then** the sheet says so in words. For each failing target, it still names the levers that could clear that target alone, so the reader knows where a combination might start.
4. **Given** the sheet has named a lever and a position, **When** the reader sets that lever to that position and the desk solves, **Then** every target in force passes on the scoreboard.

---

### User Story 3 - Trust where an edge is (Priority: P2)

A reader sees a band edge lettered at a value and wants to know how precisely that edge is known, since it comes from a finite set of runs rather than a solved equation.

**Why this priority**: A band edge reads as a hard limit. If it is coarser than it looks, a designer will set a lever right at the edge and be surprised. The sheet's standing rule is that nothing is lettered as more certain than it was measured.

**Independent Test**: Ask for bands, wait for the coarse pass to finish, and confirm each edge states the two measured positions it lies between. Let the fine pass complete and confirm the bracket narrows, with no edge moving outside its earlier bracket.

**Acceptance Scenarios**:

1. **Given** a band has been measured, **When** the reader looks at an edge, **Then** the sheet shows the last measured passing position and the first measured failing position on that side, and never letters an edge as a single exact value it did not run.
2. **Given** a coarse band is shown, **When** the finer pass completes, **Then** each edge's bracket narrows, and the finer edge lies inside the coarse bracket or the sheet states that the finer pass found a narrow passing or failing stretch the coarse pass stepped over.
3. **Given** a lever's travel passes, fails, then passes again, **When** the band is shown, **Then** the stretch containing the current setting (or the nearest passing stretch, for a failing desk) is the band, and the other passing stretches are stated as separate, not merged into it.

---

### User Story 4 - Know what the bands are not judging (Priority: P2)

A reader sees a wide band and wants to be sure it means "passes every target" and not "passes the targets this run could read".

**Why this priority**: The register already refuses to treat a target with no line as a pass, and lists what it does not judge beside what it does. A band computed against half the targets would read as freedom the design does not have.

**Independent Test**: Put the desk on design days only, with targets in force that need a whole year, and confirm the sheet states that those targets are not judged by the bands and why. Confirm no band is drawn as if they passed.

**Acceptance Scenarios**:

1. **Given** some targets in force cannot be read by the current run (for example, an annual demand target while the desk is solving design days only), **When** bands are shown, **Then** the sheet lists those targets as not judged, with the reason and what would fix it. The bands are lettered as measured against the remaining targets only, never against "all targets".
2. **Given** no target in force can be read by the current run, **When** the reader asks for bands, **Then** no band is drawn and the sheet states why.
3. **Given** a target in force has no published limit (a line the standard sets per building), **When** bands are shown, **Then** that target is listed as carrying no line and takes no part in any band.

---

### User Story 5 - Bands that stay true as the desk moves (Priority: P3)

A reader has bands on the sheet and keeps working: they nudge a lever, change the climate, or change which targets are in force.

**Why this priority**: Bands describe the room around one stance. Once the stance moves, every band is a statement about a desk that no longer exists. The sheet's rule that a run in flight never blanks the sheet, and that stale figures are dimmed rather than presented as current, has to hold here too.

**Independent Test**: Measure bands, move one lever, and confirm the bands are marked as belonging to the previous desk until they are re-measured. Change the weather station and confirm the bands are withdrawn, not carried over.

**Acceptance Scenarios**:

1. **Given** bands are shown, **When** the reader moves any lever that reaches the model, **Then** every band is marked as measured against the previous desk until it is re-measured, and none is presented as current.
2. **Given** bands are shown, **When** the reader changes the climate the desk solves against, **Then** every band is withdrawn and the sheet states why, because a band measured under one climate says nothing about another.
3. **Given** bands are shown, **When** the set of targets in force changes, **Then** every band is re-judged against the new set. Where the runs already completed can answer the new set, no new run is needed.
4. **Given** bands are shown, **When** the reader moves a priced lever (energy prices, plant efficiency), **Then** bands for targets that read a priced quantity are re-judged without re-running the engine, and all other bands are unaffected.

---

### Edge Cases

- **A lever whose band reaches a stop.** The edge is stated as "to the stop" with the stop's value, never as a measured limit, because nothing beyond the control's own range was run.
- **A lever that cannot reach the model at the current desk** (its channel is bypassed, or it sets a wall with no opening). It gets no band. It is listed with the same stated reason the pull already gives, because "this lever cannot move any target here" is itself an answer.
- **A lever that can move none of the targets in force** (a priced lever against a demand-side target). It is listed as unconstrained by the targets for the stated reason, which is different from a measured band running to both stops.
- **A position the lever cannot be set to** (a sample the desk would refuse, for example a heating setpoint above the cooling one). It is a refusal, not a failure. It closes the band on that side with its own stated reason, and the sheet does not count it as a target failing.
- **A run that fails in the engine** at a sampled position (for example, a nearly sealed box failing to converge). The position is a gap, not a pass or a fail. The band on that side is stated as unknown beyond the last measured position, never extended across the gap.
- **A target that passes exactly at its limit.** Whether the limit counts as passing follows that target's own published pass condition, the same one the scoreboard uses, so a band edge and a scoreboard verdict can never disagree at the same value.
- **A band that is a single measured position** (the current setting passes, both neighbours fail). It is shown as a band of zero measured width, bracketed on both sides, not dropped as empty.
- **A list-valued or non-numeric lever** (a selector, a profile, an hourly pattern, a calendar). It has no ordered travel to bound and is out of scope. These are listed as not banded, with that reason, so their absence is not mistaken for freedom.
- **Several targets close the same edge at nearly the same position.** The edge names the first target that fails when moving outward. Others that fail within the same measured bracket are named with it, not hidden.
- **The reader asks for bands while a survey or study is already running.** The bands share the same queue and the same completed runs. A lever that a study has already swept costs no new run, and the bands neither starve the study nor are starved by it.
- **A shared link.** A link reproduces the desk, so a reader who opens it and asks for bands under the same targets gets the same bands.

## Requirements *(mandatory)*

### Functional Requirements

**What is measured**

- **FR-001**: The sheet MUST, on the reader's request, measure a tolerance band for every lever that has a numeric, ordered travel and can reach the model at the current desk. Each band is measured by moving that lever alone across its own range while every other control stays at its current setting. [NEEDS CLARIFICATION: Which levers are banded by default: every sweepable numeric face on the desk (up to 90, which costs the most runs but misses nothing), only the levers the pull finds moving at least one target in force, or a set the reader picks?]
- **FR-002**: A lever's band MUST be the contiguous stretch of its measured travel, around its current setting, where every target in force passes. For a desk that fails at least one target, it is the nearest such stretch on either side, with the distance from the current setting to it.
- **FR-003**: The targets a band is measured against MUST be the published pass/fail lines already on the sheet's scoreboard, each judged by the same limit and the same pass condition the scoreboard uses, so a band and a scoreboard verdict can never disagree about the same design. [NEEDS CLARIFICATION: Which targets are "in force" for a band: every line of the one standard currently chased, every published line on the scoreboard across all standards at once, or a set of lines the reader ticks?]
- **FR-004**: Every band edge MUST be stated as a bracket between the last measured passing position and the first measured failing (or refused, or failed-run) position, or as reaching the lever's stop. It MUST NOT be lettered as an exact value that was not run.
- **FR-005**: Every band edge that is closed by a target MUST name that target, together with any other target that also fails within the same bracket.
- **FR-006**: Bands MUST be measured coarse first and then refined, on positions that reuse every run already completed for the same desk by a study, a survey row or an earlier band. A lever already swept by a study at the current desk MUST cost no new run.
- **FR-007**: Where a lever's travel holds more than one passing stretch, the band MUST be the one containing the current setting (or the nearest one, on a failing desk), and the other stretches MUST be stated separately rather than merged into it.

**What the reader is told**

- **FR-008**: On a desk that passes every target in force, the sheet MUST let the reader see, for every banded lever, how much of its travel lies inside its band, so the levers with the most and least freedom can be told apart at a glance.
- **FR-009**: On a desk that fails at least one target in force, the sheet MUST name the failing targets and the single lever whose smallest measured move brings every target in force back to passing, with the position it has to reach. Where no single lever can do so within its range, the sheet MUST say so in words, and for each failing target MUST name the levers that could clear that target alone.
- **FR-010**: The sheet MUST state, wherever bands are shown, that each band holds every other lever at its current setting, and that moving two levers within their own bands at once is not guaranteed to pass.
- **FR-011**: Targets in force that the current run cannot read MUST be listed as not judged by the bands, each with the reason and what would fix it. Bands MUST then be described as measured against the remaining targets only. A target with no published line MUST be listed as carrying none and take no part in any band.
- **FR-012**: Levers that are not banded (no ordered travel, cannot reach the model at this desk, or cannot move any target in force) MUST be listed with their reason, never omitted, and never drawn as a band running to both stops.
- **FR-013**: A sampled position the desk would refuse MUST be shown as a refusal with its reason, and a sampled position whose run failed MUST be shown as a gap. Neither may be counted as a target failing or as a pass.
- **FR-014**: Band readings, verdicts, absences and refusals MUST be visible without hovering or opening a fold. Method, the one-at-a-time caveat in full, and citations for each target MAY sit in a fold, as long as the one-line form of the caveat stays in view.
- **FR-015**: Everything a band shows MUST be readable at the narrowest supported width without sideways scrolling, and MUST state pass and fail in words as well as by colour.
- **FR-016**: Every band value MUST be lettered in the unit system the reader has chosen and MUST re-letter when they switch, without re-running anything. A band's width is a difference and MUST be lettered as one.

**Staying true**

- **FR-017**: When any lever that reaches the model moves, every band MUST be marked as measured against the previous desk until it is re-measured. A band MUST NOT be presented as current for a desk it was not measured at.
- **FR-018**: When the climate the desk solves against changes, every band MUST be withdrawn, with the reason stated.
- **FR-019**: When the set of targets in force changes, or a priced lever moves, bands MUST be re-judged from the runs already completed wherever those runs can answer, without new engine runs.
- **FR-020**: Measuring bands MUST NOT change the desk, the link, or anything that reaches the model, and MUST NOT delay the live solve of the reader's own desk.
- **FR-021**: The bands MUST make no claim beyond pass or fail against published lines. They MUST NOT present any position inside a band as recommended or optimal, and MUST NOT present the named lever as the right design change, only as the smallest single move that was measured to restore compliance.

### Key Entities

- **Lever**: One control with a numeric, ordered travel between two stops, on a step grid. It is the thing a tolerance is stated for, and it is always one of the controls the desk already declares.
- **Target in force**: One published pass/fail line (a standard's limit on a reading, or a fixed criterion such as a TM59 limit), with its pass condition and the kind of run it needs to be read. It is the same object the scoreboard judges.
- **Tolerance band**: For one lever at one desk, the contiguous stretch of measured travel where every target in force passes, bounded on each side by an edge. It records which targets were judged and which were not.
- **Band edge**: One side of a band. It is a bracket between the last passing and first non-passing measured positions, or the lever's stop. It names what closed it: the failing targets, a refusal, or a failed run.
- **Restoring move**: On a failing desk, the smallest measured change to a single lever that puts every target in force back to passing. It names the lever, the position to reach and the failing targets it clears. Its absence is stated rather than shown blank.
- **Not banded**: A lever left out of the bands, with its reason (no ordered travel, cannot reach the model here, cannot move any target in force).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a passing desk, a reader can name the three levers with the least freedom and the three with the most within 30 seconds of the bands finishing, without opening a fold or running a study by hand.
- **SC-002**: For every band edge measured, setting the lever to the edge's last passing position passes every judged target, and setting it to the first failing position fails the target the edge names, with zero disagreements against the scoreboard. This is checked across at least ten desks that include a lever at its stop, a bypassed channel, a refused position and a failing desk.
- **SC-003**: On a failing desk where a single lever can restore compliance, setting the named lever to the named position passes every judged target in 100% of checked desks.
- **SC-004**: A lever that a study has already swept at the current desk adds no engine run to the bands, verified by run count.
- **SC-005**: The coarse bands for every banded lever on the default desk at design-day cadence are on the sheet within the time the survey's coarse pass takes for the same number of runs, and the live solve of the desk is never held behind them.
- **SC-006**: No band ever names a target the run could not read as passed. This is verified across every target that needs a whole year, with the desk solving design days only.
- **SC-007**: Switching between SI and IP re-letters every band value with no engine run, and switching back restores every figure character for character.

## Assumptions

- **Targets are the scoreboard's own.** No new kind of target is introduced, and the reader does not type limits of their own. The lines a band is judged against are the published lines the register already carries, with the same limits, pass conditions and citations. Readings with no published limit (the zone's own high and low, which are conventions) take no part. Which of those lines are in force is the open question in FR-003.
- **One-at-a-time, like a tolerance before the stack-up.** Bands do not search combinations of levers. Joint freedom is what the survey already shows for any chosen pair, and the sheet points the reader there rather than restating it.
- **Bands are a reading, not a setting.** Like the chase, asking for bands is how the desk is being read, not what it is. Bands are not stored on the desk, in the link or in a kept scheme. A link reproduces the desk, and the bands follow from it.
- **Same runs, same queue.** Bands are measured by the same kind of sample a study and a survey row already take, on the same pool and the same step grid, so the three share completed runs. No new kind of simulation and no new output request is needed.
- **Run kind follows the desk.** Bands are measured at whatever run kind the desk is on (design days or a year). Targets the run kind cannot read are listed as not judged (FR-011), not silently dropped.
- **Priced levers** (plant efficiency, energy prices) are banded only against targets that read a priced quantity, priced from runs already completed, at no engine cost. Against every other target they are listed as unable to move it.
- **Non-numeric controls** (selectors, profiles, hourly patterns, calendars, date lists) are out of scope for this feature and are listed as not banded.
- **Everything stays on the reader's machine**, as the rest of the sheet does. Bands cost runs on the reader's own engine pool and nothing else.
