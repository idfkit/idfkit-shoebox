# Feature Specification: Tolerance bands

**Feature Branch**: `016-tolerance-bands`

**Created**: 2026-11-03

**Status**: Draft (clarified)

**Input**: User description: "Add \"Tolerance bands\" to Shoebox: the inverse of the design space survey. The survey answers \"what happens to my results if I vary this lever?\" Tolerance bands answer the question designers actually ask in early design: \"given my targets, how far can I move each lever and still meet all of them?\" Borrow the idea from engineering tolerances. The output tells an architect where they have creative freedom and which single lever is currently breaking a target."

## Overview

The sheet already has three ways to look at what a control does. A study draws one reading along one control. The pull ranks every control by how hard it is pulling one reading. The survey (E-02) cuts a ground through two controls and, since feature 012, draws each standard's published line across it. All three start from a lever and report a result: *move this, and here is what happens*.

An architect in early design usually holds the question the other way round. The targets are fixed first (a client brief, a standard, a planning condition), and the open question is how much room is left: *how far can I take the glazing, the depth of the plan, the wall build-up, before something fails?* Today the reader answers that by sweeping one control at a time, reading each target off each curve, and keeping the passing interval in their head.

Tolerance bands do that work for every lever the reader is sweeping. An engineering drawing letters a dimension with its tolerance (50 mm, +0.2 / −0.1) and says how far the part may deviate and still be acceptable. A tolerance band does the same for a lever on the desk. Holding every other control where it stands, it gives the stretch of that lever's travel over which **every** target in force still passes, measured from completed runs and lettered against the lever's current setting.

The targets in force are the lines of the standard the reader is chasing: the one choice the sheet already keeps about which standard matters right now, and the same choice the survey's threshold lines answer to (feature 012). The levers banded are the ones the reader has a study running on. A study already sweeps one lever across its range with everything else held, which is exactly the run a band needs, so a band is a second reading of a curve the reader asked for rather than a new sweep. Turning a study on is how a lever joins the bands, and the sheet says so.

Read together, the bands answer two questions:

- **Where is there freedom?** A lever whose band is wide, or runs to both stops, can be set on architectural grounds and costs nothing against the targets. A lever whose band is a sliver is where the design is tight.
- **What is breaking it?** When the current design fails a target, no band contains the current setting. For each lever, the band then shows the nearest position that would restore compliance on its own, if one exists, and how far away it is. Among the levers being swept, the one with the smallest such move is named as the single lever that would put the design back inside its targets. If none of them can do it, the sheet says so plainly, and says that only the swept levers were asked.

A tolerance band is a one-at-a-time measure, as an engineering tolerance is before anyone checks the stack-up. Each band holds the other levers at their current settings, so moving two levers to the edge of their own bands at once is not guaranteed to pass. The sheet states this in place every time bands are shown.

## Clarifications

### Session 2026-11-03

- Q: Which targets are "in force" for a band: every line of the chased standard, every published line on the scoreboard across all standards, or lines the reader ticks? → A: Every line of the standard currently chased. With nothing chased, no bands are drawn and the sheet says why.
- Q: Which levers get a band: every sweepable numeric control, only those the pull finds moving a target, or a set the reader picks? → A: The levers that have a study (a sweep) turned on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how much room each lever has (Priority: P1)

An architect has a desk that currently meets every target in force. Before committing to a form, they want to know which controls they can move freely and which ones are tight, without sweeping each control by hand and reading each target off each curve.

**Why this priority**: This is the core inversion the feature exists for. Every other story builds on a band measured against the targets in force, and on its own this story already gives the reader a map of their creative freedom.

**Independent Test**: Chase a standard the desk currently meets, turn on studies for three levers, and confirm that each studied lever shows a band containing its current setting, with each edge lettered as a value of that lever (or as reaching its stop). Then set one lever just outside its band and confirm that at least one of the chased standard's lines now fails on the scoreboard.

**Acceptance Scenarios**:

1. **Given** a chased standard whose every line the desk meets, and studies running on several levers, **When** those studies have landed, **Then** every studied lever whose travel reaches the model shows a band containing its current setting. The band's lower and upper edges are each lettered as a value in that lever's own units, or stated as running to the lever's stop.
2. **Given** a standard is chased, **When** the reader turns a study on for one more lever, **Then** that lever gains a band as its sweep lands, and turning the study off or clearing it takes that lever's band away with it.
3. **Given** studies are running but no standard is chased, **When** the reader looks for bands, **Then** none is drawn, and the sheet states that bands are measured against a chased standard's lines and how to chase one.
4. **Given** a standard is chased but no study is running, **When** the reader looks for bands, **Then** none is drawn, and the sheet states that a lever gains a band by turning on its study.
5. **Given** bands are shown, **When** the reader moves one lever to a position inside its band and lets the desk solve, **Then** every target in force still passes on the scoreboard, as the band said it would.
6. **Given** bands are shown, **When** the reader moves one lever to a measured position just outside its band, **Then** at least one target fails, and the band named that target as the one that closes this side.
7. **Given** bands are shown, **When** the reader looks at any one band, **Then** they can tell from the band alone which target closes each edge, so the reason a lever is tight is visible without opening anything.

---

### User Story 2 - Find the single lever that is breaking a target (Priority: P1)

An architect has a desk that fails one or more targets in force. They want to know which control, moved on its own, would bring the design back into compliance, and how far it would have to move.

**Why this priority**: This is the second half of what the reader asked for, and it is where the feature saves the most work. A failing design has no band around its current setting, so the useful answer is the nearest passing position for each lever and the smallest move among them.

**Independent Test**: Chase a standard the desk fails on exactly one line, with studies running on several levers. Confirm that the sheet names one of the studied levers and a position for it. Set that lever to that position and confirm every line of the chased standard then passes.

**Acceptance Scenarios**:

1. **Given** a desk that fails at least one target in force, **When** the studied levers' sweeps have landed, **Then** for each studied lever the sheet shows either the measured stretch of its travel where every target would pass with that lever moved alone, or a stated reason why no such stretch exists within its range.
2. **Given** at least one studied lever can restore compliance on its own, **When** bands are shown, **Then** the sheet names the lever whose smallest move restores every target in force, gives the position it would have to reach, and states which targets currently fail.
3. **Given** no studied lever can restore every target in force within its range, **When** bands are shown, **Then** the sheet says so in words and says that only the studied levers were asked. For each failing target, it still names the studied levers that could clear that target alone, so the reader knows where a combination might start.
4. **Given** the sheet has named a lever and a position, **When** the reader sets that lever to that position and the desk solves, **Then** every target in force passes on the scoreboard.

---

### User Story 3 - Trust where an edge is (Priority: P2)

A reader sees a band edge lettered at a value and wants to know how precisely that edge is known, since it comes from a finite set of runs rather than a solved equation.

**Why this priority**: A band edge reads as a hard limit. If it is coarser than it looks, a designer will set a lever right at the edge and be surprised. The sheet's standing rule is that nothing is lettered as more certain than it was measured.

**Independent Test**: With a standard chased and a study running, wait for the study's coarse pass to finish, and confirm each edge states the two measured positions it lies between. Let the fine pass complete and confirm the bracket narrows, with no edge moving outside its earlier bracket.

**Acceptance Scenarios**:

1. **Given** a band has been measured, **When** the reader looks at an edge, **Then** the sheet shows the last measured passing position and the first measured failing position on that side, and never letters an edge as a single exact value it did not run.
2. **Given** a coarse band is shown, **When** the finer pass completes, **Then** each edge's bracket narrows, and the finer edge lies inside the coarse bracket or the sheet states that the finer pass found a narrow passing or failing stretch the coarse pass stepped over.
3. **Given** a lever's travel passes, fails, then passes again, **When** the band is shown, **Then** the stretch containing the current setting (or the nearest passing stretch, for a failing desk) is the band, and the other passing stretches are stated as separate, not merged into it.

---

### User Story 4 - Know what the bands are not judging (Priority: P2)

A reader sees a wide band and wants to be sure it means "passes every target" and not "passes the targets this run could read".

**Why this priority**: The register already refuses to treat a target with no line as a pass, and lists what it does not judge beside what it does. A band computed against half the targets would read as freedom the design does not have.

**Independent Test**: Put the desk on design days only, chase a standard whose lines include one that needs a whole year, and confirm the sheet states that those targets are not judged by the bands and why. Confirm no band is drawn as if they passed.

**Acceptance Scenarios**:

1. **Given** some targets in force cannot be read by the current run (for example, an annual demand target while the desk is solving design days only), **When** bands are shown, **Then** the sheet lists those targets as not judged, with the reason and what would fix it. The bands are lettered as measured against the remaining targets only, never against "all targets".
2. **Given** no line of the chased standard can be read by the current run, **When** studies land, **Then** no band is drawn and the sheet states why.
3. **Given** a line of the chased standard has no published limit (a line the standard sets per building), **When** bands are shown, **Then** that target is listed as carrying no line and takes no part in any band.

---

### User Story 5 - Bands that stay true as the desk moves (Priority: P3)

A reader has bands on the sheet and keeps working: they nudge a lever, change the climate, chase a different standard, or stop chasing.

**Why this priority**: Bands describe the room around one stance. Once the stance moves, every band is a statement about a desk that no longer exists. The sheet's rule that a run in flight never blanks the sheet, and that stale figures are dimmed rather than presented as current, has to hold here too.

**Independent Test**: Measure bands, move one lever, and confirm the bands are marked as belonging to the previous desk until the studies re-sweep. Chase a different standard and confirm the bands are re-judged with no new run. Change the weather station and confirm the bands are withdrawn, not carried over.

**Acceptance Scenarios**:

1. **Given** bands are shown, **When** the reader moves any lever that reaches the model, **Then** every band is marked as measured against the previous desk until its study has re-swept, and none is presented as current.
2. **Given** bands are shown, **When** the reader changes the climate the desk solves against, **Then** every band is withdrawn and the sheet states why, because a band measured under one climate says nothing about another.
3. **Given** bands are shown, **When** the reader chases a different standard, **Then** every band is re-judged against that standard's lines from the runs the studies already hold, with no new engine run.
4. **Given** bands are shown, **When** the reader stops chasing, **Then** every band is withdrawn and the sheet states that bands need a chased standard; the studies themselves stay up.
5. **Given** bands are shown, **When** the reader moves a priced lever (energy prices, plant efficiency), **Then** bands for targets that read a priced quantity are re-judged without re-running the engine, and all other bands are unaffected.

---

### Edge Cases

- **A lever whose band reaches a stop.** The edge is stated as "to the stop" with the stop's value, never as a measured limit, because nothing beyond the control's own range was run.
- **A lever that cannot reach the model at the current desk** (its channel is bypassed, or it sets a wall with no opening). The sheet already refuses a study of it; it gets no band, with the same stated reason.
- **A lever with no study running.** It has no band and is not asked. The bands state how many levers were asked, so a short list is not read as the whole desk, and a lever that is not swept is never presented as free or as not breaking anything.
- **A study set aside or still landing.** A set-aside study (Stop, or "Set studies aside") keeps the band its completed runs support, marked as incomplete where its sweep did not finish. A band whose study is still on its coarse pass is shown as coarse, as US3 describes.
- **A study whose chosen reading is not one the chased standard judges.** The band does not depend on which reading the study's curve draws. It is judged on every line of the chased standard, read from the same runs.
- **A chased standard with no published line at all** (for example, one whose only lines are set per building). No band is drawn, and the sheet states that this standard publishes no line the bands could judge against.
- **A lever that can move none of the targets in force** (a priced lever against a demand-side target). It is listed as unconstrained by the targets for the stated reason, which is different from a measured band running to both stops.
- **A position the lever cannot be set to** (a sample the desk would refuse, for example a heating setpoint above the cooling one). It is a refusal, not a failure. It closes the band on that side with its own stated reason, and the sheet does not count it as a target failing.
- **A run that fails in the engine** at a sampled position (for example, a nearly sealed box failing to converge). The position is a gap, not a pass or a fail. The band on that side is stated as unknown beyond the last measured position, never extended across the gap.
- **A target that passes exactly at its limit.** Whether the limit counts as passing follows that target's own published pass condition, the same one the scoreboard uses, so a band edge and a scoreboard verdict can never disagree at the same value.
- **A band that is a single measured position** (the current setting passes, both neighbours fail). It is shown as a band of zero measured width, bracketed on both sides, not dropped as empty.
- **A list-valued or non-numeric lever** (a selector, a profile, an hourly pattern, a calendar). It has no ordered travel to bound, cannot carry a study, and is out of scope.
- **Several targets close the same edge at nearly the same position.** The edge names the first target that fails when moving outward. Others that fail within the same measured bracket are named with it, not hidden.
- **A survey is running at the same time.** Bands add no runs of their own, so they take nothing from the survey's share of the pool.
- **A shared link.** A link reproduces the desk but not the studies or the chase, which are how the desk is being read. A reader who opens it, chases the same standard and studies the same levers gets the same bands.

## Requirements *(mandatory)*

### Functional Requirements

**What is measured**

- **FR-001**: While a standard is chased, the sheet MUST show a tolerance band for every lever that has a study running, read from that study's own runs: that lever moved alone across its range, every other control at its current setting. Turning a study on MUST add its lever to the bands, and turning it off or clearing it MUST remove the lever's band.
- **FR-002**: A lever's band MUST be the contiguous stretch of its measured travel, around its current setting, where every target in force passes. For a desk that fails at least one target, it is the nearest such stretch on either side, with the distance from the current setting to it.
- **FR-003**: The targets in force MUST be every line of the standard currently chased, each judged by the same limit and the same pass condition the scoreboard uses, so a band and a scoreboard verdict can never disagree about the same design. While no standard is chased, no band MUST be drawn, and the sheet MUST state that bands need a chased standard and how to chase one. While a standard is chased but no study is running, the sheet MUST state that a lever gains a band by turning on its study.
- **FR-004**: Every band edge MUST be stated as a bracket between the last measured passing position and the first measured failing (or refused, or failed-run) position, or as reaching the lever's stop. It MUST NOT be lettered as an exact value that was not run.
- **FR-005**: Every band edge that is closed by a target MUST name that target, together with any other target that also fails within the same bracket.
- **FR-006**: Bands MUST add no engine run of their own. A band is read off the runs its lever's study already holds, coarse while the study is coarse and refined as the study densifies.
- **FR-007**: Where a lever's travel holds more than one passing stretch, the band MUST be the one containing the current setting (or the nearest one, on a failing desk), and the other stretches MUST be stated separately rather than merged into it.

**What the reader is told**

- **FR-008**: On a desk that passes every target in force, the sheet MUST let the reader see, for every banded lever, how much of its travel lies inside its band, so the levers with the most and least freedom can be told apart at a glance.
- **FR-009**: On a desk that fails at least one target in force, the sheet MUST name the failing targets and the single studied lever whose smallest measured move brings every target in force back to passing, with the position it has to reach. Where no studied lever can do so within its range, the sheet MUST say so in words, MUST say that only the studied levers were asked, and for each failing target MUST name the studied levers that could clear that target alone.
- **FR-010**: The sheet MUST state, wherever bands are shown, that each band holds every other lever at its current setting, and that moving two levers within their own bands at once is not guaranteed to pass.
- **FR-011**: Targets in force that the current run cannot read MUST be listed as not judged by the bands, each with the reason and what would fix it. Bands MUST then be described as measured against the remaining targets only. A target with no published line MUST be listed as carrying none and take no part in any band.
- **FR-012**: The bands MUST state how many levers were asked, so the set is never read as the whole desk. A studied lever that cannot move any line of the chased standard MUST be stated as such, never drawn as a band running to both stops. A lever with no study MUST NOT be presented as free or as not breaking a target.
- **FR-013**: A sampled position the desk would refuse MUST be shown as a refusal with its reason, and a sampled position whose run failed MUST be shown as a gap. Neither may be counted as a target failing or as a pass.
- **FR-014**: Band readings, verdicts, absences and refusals MUST be visible without hovering or opening a fold. Method, the one-at-a-time caveat in full, and citations for each target MAY sit in a fold, as long as the one-line form of the caveat stays in view.
- **FR-015**: Everything a band shows MUST be readable at the narrowest supported width without sideways scrolling, and MUST state pass and fail in words as well as by colour.
- **FR-016**: Every band value MUST be lettered in the unit system the reader has chosen and MUST re-letter when they switch, without re-running anything. A band's width is a difference and MUST be lettered as one.

**Staying true**

- **FR-017**: When any lever that reaches the model moves, every band MUST be marked as measured against the previous desk until its study has re-swept. A band MUST NOT be presented as current for a desk it was not measured at.
- **FR-018**: When the climate the desk solves against changes, every band MUST be withdrawn, with the reason stated.
- **FR-019**: When the reader chases a different standard, or a priced lever moves, bands MUST be re-judged from the runs the studies already hold, without new engine runs. When the reader stops chasing, every band MUST be withdrawn with the reason stated, and the studies MUST stay as they were.
- **FR-020**: Bands MUST NOT change the desk, the link, the studies, or anything that reaches the model, and MUST NOT delay the live solve of the reader's own desk.
- **FR-021**: The bands MUST make no claim beyond pass or fail against published lines. They MUST NOT present any position inside a band as recommended or optimal, and MUST NOT present the named lever as the right design change, only as the smallest single move that was measured to restore compliance.

### Key Entities

- **Lever**: One control with a numeric, ordered travel between two stops, on a step grid. It is the thing a tolerance is stated for, and it is always one of the controls the desk already declares.
- **Target in force**: One published pass/fail line of the chased standard (a limit on a reading, or a fixed criterion such as a TM59 limit), with its pass condition and the kind of run it needs to be read. It is the same object the scoreboard judges.
- **Study**: The existing sweep of one lever, which the reader turns on and off. Its runs are the only runs a band reads, and its presence is what puts a lever in the bands.
- **Tolerance band**: For one lever at one desk, the contiguous stretch of measured travel where every target in force passes, bounded on each side by an edge. It records which targets were judged and which were not.
- **Band edge**: One side of a band. It is a bracket between the last passing and first non-passing measured positions, or the lever's stop. It names what closed it: the failing targets, a refusal, or a failed run.
- **Restoring move**: On a failing desk, the smallest measured change to a single lever that puts every target in force back to passing. It names the lever, the position to reach and the failing targets it clears. Its absence is stated rather than shown blank.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a passing desk with six studies running, a reader can name the two studied levers with the least freedom and the two with the most within 30 seconds of the studies landing, without opening a fold or reading any curve.
- **SC-002**: For every band edge measured, setting the lever to the edge's last passing position passes every judged target, and setting it to the first failing position fails the target the edge names, with zero disagreements against the scoreboard. This is checked across at least ten desks that include a lever at its stop, a bypassed channel, a refused position and a failing desk.
- **SC-003**: On a failing desk where a single studied lever can restore compliance, setting the named lever to the named position passes every judged target in 100% of checked desks.
- **SC-004**: Turning bands on (by chasing a standard), switching the chased standard, and stopping the chase each add zero engine runs, verified by run count.
- **SC-005**: A lever's band appears on the sheet as soon as its study's coarse pass has landed, with no wait beyond the study itself, and the live solve of the desk is never held behind it.
- **SC-006**: No band ever names a target the run could not read as passed. This is verified across every target that needs a whole year, with the desk solving design days only.
- **SC-007**: Switching between SI and IP re-letters every band value with no engine run, and switching back restores every figure character for character.

## Assumptions

- **Targets are the chased standard's own lines.** No new kind of target is introduced, no new selection state is added, and the reader does not type limits of their own. The chase already says which standard matters right now, and the survey's threshold lines already answer to it (feature 012), so the bands answer to the same choice. Readings with no published limit (the zone's own high and low, which are conventions) take no part.
- **Levers are the studied ones.** A study is the reader's own statement that a lever is worth sweeping, and it already holds the runs a band needs. Banding every sweepable control was set aside for now: it would cost up to about 90 × 11 runs per desk to answer a question about levers the reader has not asked about. Widening the set later (for example, to every lever the pull finds moving a target) is a follow-up, not part of this feature.
- **One-at-a-time, like a tolerance before the stack-up.** Bands do not search combinations of levers. Joint freedom is what the survey already shows for any chosen pair, and the sheet points the reader there rather than restating it.
- **Bands are a reading, not a setting.** Like the chase and the studies they follow from, bands are how the desk is being read, not what it is. They are not stored on the desk, in the link or in a kept scheme.
- **No runs of their own.** Bands are read off the studies' runs. No new kind of simulation and no new output request is needed, provided a study's runs keep every reading the chased standard's lines need, not only the one reading its curve draws.
- **Run kind follows the desk.** Bands are judged at whatever run kind the studies ran at (design days or a year). Targets the run kind cannot read are listed as not judged (FR-011), not silently dropped.
- **Priced levers** (plant efficiency, energy prices) are banded only against targets that read a priced quantity, priced from runs already completed, at no engine cost. Against every other target they are listed as unable to move it.
- **Non-numeric controls** (selectors, profiles, hourly patterns, calendars, date lists) cannot carry a study and are out of scope for this feature.
- **Everything stays on the reader's machine**, as the rest of the sheet does. Bands read only the runs the studies made on the reader's own engine.
