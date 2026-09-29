# Feature Specification: A daylight reading on the roster

**Feature Branch**: `014-daylight-reading`

**Created**: 2026-09-20

**Status**: Draft

**Input**: Handoff from `/speckit-assess-decide`, `.specify/assessments/daylight-reading/decision.md` (verdict: go, 2026-09-20). Problem: "An architect moving the window sliders is shown every consequence of the move except the one the window exists to deliver, and because every reported consequence improves as the window shrinks, the sheet points confidently at a room nobody would want to occupy and says nothing was lost." Chosen approach: Option B of `concept.md`, "one probe, one reading, offered as ranking evidence", as amended by the three binding amendments in `decision.md`.

## Overview

The sheet reports what a window costs. It reports heating, cooling, carbon, cost and overheating hours, and every one of them improves as the window shrinks. It reports nothing about the light the window was put there to deliver. Over four climates the energy optimum the sheet's own readings point at is the smallest window it can sweep, in a room where under 1 % of occupied hours reach 300 lx at 70 % of the plan depth. The reader is not told a criterion is unjudged. They are told nothing, so the absence reads as a settled matter rather than a missing one.

This feature puts one daylight quantity on the reading roster: a typical illuminance, over occupied hours, at one stated point deep in the room. Being on the roster is the whole feature. The roster is what the reading chooser, the study curve and the E-02 design space survey are all cut from, so one entry on it makes the energy and daylight trade a drawing the reader can cut for themselves, with no second view, no second reader and no second tool.

The number is offered as a **comparison between positions of this desk**, not as a measurement of a room. That distinction is load-bearing and is why the reading carries no published target, is never counted as a pass or a fail, and states its method and its validity limit in view rather than in a fold. The evidence for offering it at all is a ranking test run against a Radiance annual daylight coefficient chain on this desk's own geometry: ten of ten sweeps ordered identically, thirty-eight of thirty-eight adjacent steps, eleven of eleven matched-energy comparisons, identical thirteen-point Pareto frontiers, Spearman 0.9957 and Kendall tau-b 0.9638. The ordering holds; the absolute value does not, and the reading must say so.

Two things land with it, because the reading cannot be honest without them. Interior visible reflectance is currently slaved to an exterior solar absorptance slider and sits at 0.25, which understates daylight by about 2.49x against a realistic 0.60, and the correction has to reach the ceiling, not only the walls, because the ceiling is the surface a deep probe is actually lit by. And `visT`, a declared control with published landmarks and an eighteen-fold range, currently moves no reading at all on the shipped default; the new reading gives it a consequence.

The two known errors in today's arrangement run in opposite directions and are of similar size, so correcting only one makes the published number worse than correcting neither. They land together. The reflectance correction is nonetheless owed on its own merits, because it is wrong about lighting **energy** today regardless of any daylight reading.

Out of scope, unchanged from `concept.md`: compliance evidence and any published target; matching a Radiance-class tool; a second application, view, render or drawing; glare; any claim requiring ASE; a drawn illuminance field, `eplusmap.csv` parsing, or any spatial metric; any reading named sDA, UDI or daylight factor whether or not the arithmetic matches; preserving or shipping the session's Radiance build; and building a demand signal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what the window delivers, not only what it costs (Priority: P1)

An architect opens the sheet as it ships, moves the south window ratio from wide to narrow, and watches the readings respond. Today every figure that moves gets better as the glass disappears. With this feature a daylight figure moves the other way, on the same sheet, at the same cadence, without the reader engaging anything first.

**Why this priority**: This is the problem statement. Every other story exists to make this figure trustworthy or to make it reach further.

**Independent Test**: On a desk in its shipped state, sweep the window ratio from its smallest stop to its largest and confirm the daylight reading moves monotonically upward while the energy readings move the other way, and that the reader did not have to engage a bypassed channel to see it.

**Acceptance Scenarios**:

1. **Given** the sheet in its shipped default state, **When** the reader reads the sheet, **Then** a daylight reading is present and lettered, not absent and not gated behind a channel the reader has not engaged.
2. **Given** the reader narrows a glazed window, **When** the solve completes, **Then** the daylight reading falls, and it falls from a value the reader could see before the move.
3. **Given** the reader reaches the window ratio the energy readings favour, **When** they look at the daylight reading, **Then** the cost of that choice is lettered in place rather than implied by silence.

---

### User Story 2 - Cut the trade as a drawing (Priority: P1)

A reader wants to see energy against daylight rather than read them one at a time. They pick the daylight reading as the metric a study sweeps, and they put it on an axis of the E-02 design space survey. The trade appears as a curve and as ground, cut from the same roster every other reading is cut from.

**Why this priority**: The problem is that the trade is invisible where the reader is already making it. A reading that exists only on the sheet leaves the reader comparing two drawings by eye, which is the situation the assessment measured as harmful.

**Independent Test**: Sweep one control with the daylight reading chosen as the study metric, then cut a survey with daylight on one axis and an energy reading on the other, and confirm every sampled point, contour and spot height answers the daylight reading and nothing else.

**Acceptance Scenarios**:

1. **Given** a run the reading can be taken from, **When** the reader opens any list of readings, **Then** the daylight reading is offered there on the same terms as every other reading on the roster.
2. **Given** the daylight reading is chosen as a study metric, **When** the sweep completes, **Then** every sampled point on the curve is computed for that reading, and the curve declares which direction is an improvement.
3. **Given** a survey is cut with the daylight reading as its plotted metric, **When** the ground is drawn, **Then** no published threshold line is drawn across it, and the sheet states in words that there is none rather than leaving the ground unexplained.

---

### User Story 3 - Know what the number is not (Priority: P1)

A reader looking at the daylight figure needs to know, without opening anything, what it was computed by, where in the room it was taken, and where the method stops being valid. The desk as it ships is already outside the method's stated depth limit, and 51 % of the reachable parameter space is beyond it.

**Why this priority**: "A number offered is a number the method can honestly support" is the binding constraint on the whole feature. A figure that looks like every other figure on the sheet, but is a ranking instrument rather than a measurement, is worse than no figure at all.

**Independent Test**: Read the sheet at 390 px wide, in both unit systems, without hovering and without opening any fold, and confirm the method, the probe position and the validity limit are all legible, and that the limit is stated as breached on a desk whose depth exceeds three times its ceiling height.

**Acceptance Scenarios**:

1. **Given** the daylight reading is lettered anywhere, **When** the reader looks at it, **Then** what it is and how it was computed is stated in view, not in a fold and not on hover.
2. **Given** a desk whose room depth exceeds three times its ceiling height, **When** the reading is lettered, **Then** the sheet states that the method's own validity limit has been passed, and by how much or at what depth.
3. **Given** the reader looks for a pass or fail beside the figure, **When** they read it, **Then** the sheet says plainly that no published line judges this reading, and the figure is not counted in any cleared-criteria total.
4. **Given** the reading is lettered, **When** the reader asks where it was taken, **Then** the probe's position in the room is stated with the figure.

---

### User Story 4 - The room is lit the way a room is lit (Priority: P2)

A reader with the Daylight channel engaged is shown a lighting energy saving computed in a room whose interior surfaces reflect 25 % of the light that reaches them, because interior visible reflectance is slaved to an exterior solar absorptance slider. A real office interior is nearer 0.60. The correction applies to the ceiling as well as the walls.

**Why this priority**: It is a live wrongness in shipped output rather than an absence, and it is the one thing that makes any published daylight number defensible. It is P2 only because the P1 stories are what the reader asked for; it ships with them, not after them.

**Independent Test**: With the Daylight channel engaged, compare lighting energy before and after the correction on the same desk, and confirm the ceiling's visible reflectance moved with the walls' rather than staying at its construction value.

**Acceptance Scenarios**:

1. **Given** any desk, **When** interior visible reflectance is set, **Then** it is set by a control that means interior reflectance, and it is not moved by a control that means exterior solar absorptance.
2. **Given** interior reflectance is set, **When** the model is written, **Then** every interior surface moves with it, ceiling and floor as well as walls, because the deep probe is lit chiefly by the ceiling and a correction that stops at the walls leaves the dominant surface wrong.
3. **Given** the Daylight channel is engaged, **When** the correction lands, **Then** lighting energy, and every figure derived from it, changes by the amount the corrected model produces, and the change is recorded where the sheet records what it changed.

---

### User Story 5 - A declared control stops being inert (Priority: P2)

A reader moves the visible transmittance slider across its eighteen-fold range, from 0.05 to 0.90, and today nothing on the sheet moves: heating 4091.9, cooling 10632.6 and lighting 5975.5 kWh are identical at both ends. With a daylight reading on the roster, the slider has a consequence.

**Why this priority**: A control that moves nothing is a defect the sheet's own governing rule already condemns, independent of this feature. It is P2 because it falls out of Story 1 rather than needing work of its own, but it is stated separately because it is separately verifiable and separately owed.

**Independent Test**: On the shipped default desk, read the daylight reading at both ends of the visible transmittance range and confirm the two figures differ by more than the reading's own precision.

**Acceptance Scenarios**:

1. **Given** the shipped default desk, **When** the reader moves visible transmittance from its lowest stop to its highest, **Then** the daylight reading changes.
2. **Given** the same move, **When** the reader checks the energy readings, **Then** any change in them is one the model produced, and no reading changes that the model did not move.

---

### User Story 6 - Share the reading (Priority: P3)

A reader sends a colleague a link to a study or a survey cut against the daylight reading. The colleague opens it and gets that same reading, at that same probe position, on that same desk. Links made before this feature keep meaning what they meant.

**Why this priority**: A reading that cannot be shared is an anecdote, and shareability is one of the sheet's two non-negotiable claims. It is P3 because it follows from the reading being a first-class roster entry rather than needing a mechanism of its own.

**Independent Test**: Cut a study and a survey against the daylight reading, copy each link, open it fresh, and confirm the restored desk plots the same reading at the same position; then open a link made before this feature and confirm it restores what it always did.

**Acceptance Scenarios**:

1. **Given** a study or survey cut against the daylight reading, **When** the link is opened elsewhere, **Then** the same reading is restored and plotted.
2. **Given** a link made before this feature, **When** it is opened afterwards, **Then** it restores the desk it named, and it is not refused for naming a control or a reading it could not have known about.
3. **Given** a link the sheet cannot honour, **When** it is opened, **Then** it is refused whole with the reason stated, as any unhonourable link already is.

---

### Edge Cases

- **The desk is past the method's depth limit**, which it already is as shipped (3.333 against a stated limit of 3), and 51 % of the reachable parameter space is beyond it. The reading is still reported and the limit is stated as passed. It is not hidden, and the reading is not refused: a refusal here would remove the reading exactly where the problem lives.
- **No glass on any wall**, because the ratio is one the frame closes, or every face is adiabatic, or Fabric is bypassed. The illuminance the model computes is a genuine near-zero and is reported as a measurement. Absence and zero are different, and the distinction is the sheet's existing one.
- **Nobody is home.** With no occupied hours in the run there is no set to take a central statistic over, so the reading is an absence with a stated reason and a stated fix, renders as an em dash, and stays out of every total.
- **The run is a design day, not a year.** Design days are excluded from the reading's hours, exactly as they are excluded from the bill and from the overheating count. A desk solving only design days reports the reading's absence with its reason.
- **A part-year weather file** whose months carry no occupied hours: the same stated absence, taking the file-season reason rather than the season reason, since narrowing the run is not a fix the reader can act on.
- **The Daylight channel is engaged and dimming lights.** The measurement point and the control point coexist, the measurement point controls nothing, and the lighting energy the channel reports is the energy it would have reported without the measurement present.
- **A study or a survey sweeps the probe's own depth control.** The reading then moves because the probe moved, not because the building did, and the method's fidelity follows the same control. This is the one circular reading the feature can produce and the sheet must not present it as a design finding.
- **The measurement is on the design day too.** The probe is written on every solve, so the warm solve that re-runs continuously during a drag carries it. The reading is therefore present and moving during the gesture rather than appearing only when the annual run lands on release, and the drag's budget has to absorb it.
- **The engine writes a warning** about the reference point into `eplusout.err` on every run. A warning that is a property of the arrangement rather than a fault must not be surfaced as a fault, and must not cause the run to be reported as degraded.
- **Interior reflectance moves figures a reader has already linked.** Lighting energy, energy intensity, cost and carbon all change on any desk with Daylight engaged. The link still restores the desk it named; the numbers that desk produces are the corrected ones.
- **Unit system.** The reading is an illuminance, so it letters in lux or in footcandles, and it is a value rather than a difference: a change in it is a difference and letters through the difference path.
- **390 px.** One more entry in every reading chooser, plus a method sentence, a probe position and a validity limit in view, must all be readable at phone width without hover and without horizontal scrolling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reading roster MUST gain exactly one daylight quantity: the **median** illuminance at the measurement point, taken over **every occupied hour in the run**, dark hours included. It MUST NOT be a share of hours above a threshold, and it MUST NOT be taken over daylit hours alone, because both the seasonal signal and the hours a small window fails to light are part of what the reading exists to show.
- **FR-002**: The reading MUST be offered wherever the sheet asks a reader to choose a reading, at minimum the sheet itself, the metric a study sweeps, and either axis of the design space survey, on the same terms as every other reading on the roster.
- **FR-003**: The reading MUST exist on the shipped default desk, where the Daylight channel is bypassed, since a reading gated behind that channel would be absent exactly where the problem lives.
- **FR-004**: The measurement MUST NOT change the building it reads. Every other figure the sheet reports MUST be identical, to full precision, with the measurement present and absent.
- **FR-005**: The reading MUST state, in view and not in a fold or on hover, what it is, how it was computed, and where in the room it was taken.
- **FR-006**: Where the room's depth exceeds the method's stated validity limit of three times ceiling height, the sheet MUST state that the limit has been passed, in view, and MUST still report the reading.
- **FR-007**: The reading MUST carry no published target, MUST NOT be judged as a pass or a fail, and MUST NOT enter any cleared-criteria count. The sheet MUST state in words that no published line judges it, wherever the absence of a line would otherwise read as an omission.
- **FR-008**: The reading MUST declare which direction is an improvement, so a survey's descent, its improving region, and any ranking that needs a direction behave for it as they do for every other reading.
- **FR-009**: A run that cannot answer the reading MUST report its absence with a stated reason and, where one exists, a stated fix; MUST render as an em dash; and MUST stay out of every total. A genuine measured near-zero is a measurement, not an absence.
- **FR-010**: The reading MUST respond to the controls that change how much light reaches the room, at minimum window ratio, visible transmittance, overhang projection and orientation, and the response MUST come from the model rather than from arithmetic over parameters.
- **FR-011**: Interior visible reflectance MUST be set by **one** declared control that means interior visible reflectance, and MUST NOT be moved by the exterior solar absorptance control. One control, one meaning: the reader moves it and the room gets lighter or darker.
- **FR-012**: That one control MUST reach every interior surface, walls, ceiling and floor together, and not the walls alone. A deep probe is lit chiefly by the ceiling, so a correction that leaves the ceiling at its construction value leaves the dominant surface wrong and the number still wrong.
- **FR-013**: The reflectance correction and the daylight reading MUST land in the same change, because the two known errors run in opposite directions and are of similar size, so correcting either alone makes the published reading worse than correcting neither.
- **FR-014**: The measurement MUST be written on **every** solve, design day and year alike, and MUST NOT be conditional on anything the reader has selected. It therefore MUST NOT reach the solve identity key, and the study and survey sample caches MUST NOT key on it: every cached sample can answer this reading, because every sample carried the probe. The cost of this is paid on every solve and is bounded by SC-005.
- **FR-015**: The probe's position MUST be stated with the reading, and the reading MUST NOT let its own fidelity change silently when a control moves the probe. Where the reading and the probe's own position control are plotted against each other, the sheet MUST say that the figure is moving because the point moved.
- **FR-016**: The annual solve MUST stay inside its measured budget and the design-day solve MUST keep re-solving continuously during a drag. No output the measurement requires may be per-surface.
- **FR-017**: A shared link MUST carry which reading a study or a survey was cut for, and restore exactly that reading. A link made before this feature MUST restore the desk it named rather than being refused.
- **FR-018**: The reading MUST letter correctly in both unit systems, as an illuminance value, with a change in it lettered through the difference path rather than the value path.
- **FR-019**: The reading, its method sentence, its probe position and its validity statement MUST all be readable and selectable at 390 px wide, without hover and without horizontal scrolling.
- **FR-020**: A declaration that offers this reading without a method statement, without a stated position, or with a published target attached to it, MUST fail loudly at load rather than be drawn.
- **FR-021**: The general notes MUST be updated for what this feature adds and changes, and their storage key bumped where a step's meaning moves.
- **FR-022**: Nothing this feature adds may reach the network, add a runtime dependency outside `@idfkit/*`, or place anything about the reader's model anywhere but their own browser.

### Key Entities

- **Measurement point**: a point in the room at which the engine computes daylight illuminance and which controls nothing. Carries a position in the room and a stated relationship to the room's depth and the method's validity limit. It is distinct from the control point the Daylight channel already writes, which dims lights.
- **The daylight reading**: one entry on the roster of readings the sheet reports and a study or survey can be plotted against. Carries a central statistic over occupied hours, an improving direction, a method statement, a probe position, a validity statement, and no published target.
- **Occupied hours**: the hours over which the statistic is taken, defined by the same occupancy floor the sheet already uses rather than by any hour with a nonzero fraction, and excluding design days.
- **Interior visible reflectance**: one property of the room's interior surfaces, walls, ceiling and floor together, governing how much of the light entering the room reaches the back of it. Today it is slaved to an unrelated exterior property and reaches the walls only.
- **Validity limit**: the method's own stated boundary, room depth no more than three times ceiling height, which this desk already exceeds at its default and across 51 % of its reachable parameter space.

## Success Criteria *(mandatory)*

### Measurable Outcomes

The measurement difficulty is recorded first, as it was in `problem.md`: this project has no instrument that can measure adoption, by deliberate architecture. Every criterion below is a first-party measurement or a labelled qualitative signal.

- **SC-001**: At the energy optimum the sheet's other readings point at, the daylight consequence of that choice is lettered on the sheet. Baseline: at the four-climate energy optimum, 0.0 % to 0.7 % of occupied hours reach 300 lx, and this is invisible on the page.
- **SC-002**: Visible transmittance moves a reading on the shipped default desk. Baseline: it moves nothing, with heating 4091.9, cooling 10632.6 and lighting 5975.5 kWh identical at 0.05 and 0.90.
- **SC-003**: Both known errors are corrected, not one. Baseline: interior reflectance sits at 0.25 where a realistic interior is 0.60, a 2.49x error, and it currently cancels against the method's own bias. Success is that the shipped reading is right for both reasons, and that correcting only one is not shipped.
- **SC-004**: The measurement does not change the building. Annual lighting energy with the measurement present equals the energy without it to full precision. Baseline: achieved at 5975.5 kWh both ways in a harness, not in shipped code.
- **SC-005**: The annual solve stays inside its budget and the design day keeps its cadence. Baseline: a 0.98 s WebAssembly annual base, measured at +5 % with nine probe points and +27 % with twenty-five; a design day solves in about 50 ms and re-solves continuously during a drag.
- **SC-006**: The shipped reading reproduces the ordering the ranking test measured against a Radiance annual daylight coefficient chain on this desk's geometry: identical ordering on ten of ten sweeps, thirty-eight of thirty-eight adjacent steps and eleven of eleven matched-energy comparisons, identical thirteen-point Pareto frontiers, Spearman 0.9957 and Kendall tau-b 0.9638.
- **SC-007**: A reader can state what the number is not. The method, the probe position and the validity limit are legible in view at 390 px in both unit systems, and on the shipped desk, which is already past the limit at 3.333, the sheet says so. Qualitative, and no quantitative proxy is claimed.
- **SC-008**: Every figure the sheet reports today is unchanged by this feature except those the reflectance correction genuinely moves, and every figure that moves is traceable to that correction.
- **SC-009**: Qualitative, and weak: no issue arrives disputing the number. Recorded as the only demand-shaped signal this architecture can ever produce, and explicitly not a target.

## Assumptions

- **The probe can be written outside the Daylight channel's gate** without disturbing what that channel does, so the reading exists on the shipped default where the problem lives. Measured as achievable: a measurement point that controls nothing leaves annual lighting energy identical to full precision.
- **Always-on is affordable, and it is bought deliberately.** Writing the probe unconditionally costs every solve, and it was chosen over an on-demand flag because the alternative reaches the solve identity key and therefore the study and survey sample caches, which is the spreading `concept.md` warned about. The cost is assumed to sit inside the budget in SC-005: the measurement was taken at +5 % on an annual run with nine probe points, and this feature writes one. If one probe turns out to cost materially more than that on the design-day cadence, this assumption is the one to revisit first, before the reading's definition.
- **The median is taken over every occupied hour, not over daylit hours.** Dark occupied hours stay in the sample deliberately, because a window that lights the room for two hours of a winter working day and not the other six is exactly the case the reading exists to distinguish. This makes the figure sensitive to latitude, season and the occupancy profile, which is a property, not a fault, and is part of what the method statement in FR-005 has to say out loud.
- **A measured quantity with no line to judge it against is a first-class citizen of the register.** Thirteen unjudged criteria are already declared, so the vocabulary exists, but none of them is a measured quantity with no published line at all. This is assumed to be a new case the existing vocabulary can carry, and it is assumed that the honest presentation is to say so in words rather than to leave the space beside the figure empty.
- **The reflectance correction is acceptable as a breaking change to the numbers a shared link produces.** The one new interior reflectance control is a new key, and adding a control is free under the existing link format, so no version bump is assumed on its account. What changes for an old link is not which desk it names but what that desk now means: the exterior absorptance control stops setting interior reflectance, so a link made before this change restores the same desk and gets different lighting energy, energy intensity, cost and carbon from it. That is assumed acceptable, on the ground that the old numbers were wrong. If the correction is instead delivered by moving an existing control's default or narrowing its range, the format version moves with it and the outgoing defaults are frozen, as the format already requires.
- **A single stated probe position is defensible.** The ranking test that unblocked this feature was run against a deep probe, and depth is what makes the absolute value least trustworthy and the ordering most trustworthy. The reading is assumed not to need its position control frozen, provided FR-015 holds.
- **One point, not a lattice.** The reading is taken at a single point. A work-plane lattice, a drawn field and any spatial metric were considered and excluded, on the ground that split flux makes the internally reflected component nearly uniform across the room (measured at 123, 128, 132, 135, 136, 135, 131, 127 lx across the back row), so a drawn field would render a property of the method as a finding about the building.
- **Three external lookups remain unmade and none of them gates this feature.** LM-83-23's own text is unread because ies.org is Cloudflare-blocked; whether Sefaira, cove.tool or Autodesk Forma already plot daylight against energy across a design space is unchecked, Sefaira likewise blocked; and whether LETI's Climate Emergency Design Guide carries a daylight target for offices is unchecked. All three were non-blocking at the first gate and remain so, since none can void a reading that claims no compliance and carries no target.
- **The session's Radiance build is not preserved or shipped.** It produced the evidence that unblocked this feature and lives only in a session scratchpad. Its four-line patch is upstreamable on its own terms and is a separate question from this feature.
- **The existing daylight machinery is otherwise unchanged.** The Daylight channel's lighting-control behaviour moves only by what the reflectance correction moves. No third party is asked whether the absence of any user request means absence of need; the page carries no analytics by design, and the question is recorded rather than resolved.
