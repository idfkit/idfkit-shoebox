# Feature Specification: Survey the design space

**Feature Branch**: `006-design-space-survey`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Sweeps take one parameter and assesses its sensitivity to a particular metric. What is missing from shoebox.idfkit.com is a way to explore the whole design space, the parametric space. What pulls a design towards a certain performance? What are areas that fall into untapped efficiency (energy efficiency being one of them, but also thermal comfort, etc.). The industry standard to visualize a parametric analysis is the parallel coordinates plot. But, here, we want to push the boundaries, we want to be original, and we want to invent a new kind of experience that only near-instantaneous energy simulations can provide. Think outside of the box! Think big! Think webGL, 3D gaming, etc. Leave no stone unturned!"

## Overview

A study answers one question: what does *this* control do to *that* reading, with everything else held where it is. It is a line. The desk carries close to a hundred numeric faces across eighteen channels, so a line is a very thin thing to know about a space that wide, and the reader is left doing the hard part in their head: sweeping one control, remembering the shape, sweeping the next, and trying to hold two curves together well enough to guess what the pair does.

What is missing is the ground the curves are cut from.

### The desk stands somewhere

Every parameter on this sheet is a coordinate. The desk is therefore not a set of settings, it is a **position**, and a position has things a setting does not: a slope, a direction of steepest fall, directions along which nothing changes at all, and a neighbourhood that is either a hollow the design is already sitting in or a shoulder it is about to fall off. None of that is visible today, and all of it is what a designer actually wants: not "how sensitive is the window ratio", but "what is pulling this building, and which way is down".

So this feature gives the sheet a second drawing. The first sheet, E-01, is the building. The second, E-02, is the **survey**: the design space drawn the way a site is drawn, as ground, with contours, spot heights, a fall line and a basin, in the same graphite as everything else.

### Why not a parallel coordinates plot

Parallel coordinates is the industry standard and it earns that honestly: it puts many dimensions on one page and shows a bundle of finished runs. It is also, for this sheet, the wrong instrument, for three reasons that have nothing to do with taste.

1. **It is a picture of a batch that has already been run.** Its whole premise is that simulation is expensive, so you spend a night on a design of experiments and then spend a week reading it. This page solves a design day in about 50 ms. The interesting object here is not a finished dataset, it is ground that can be surveyed while the reader is standing on it.
2. **Its reading depends on the order of its axes**, which nobody publishes and which the reader did not choose. Two adjacent axes show their relationship; two axes at opposite ends of the page show nothing. A figure whose meaning changes with the column order is exactly the kind of quiet substitution this sheet refuses everywhere else.
3. **It says nothing about the space between the runs, and it cannot be walked.** A line bundle has no downhill. You cannot stand in it, you cannot ask what is next to you, and you cannot put the model where you are looking.

The survey answers those three directly: it fills in as you look at it, its axes are two controls the reader picked on purpose, and every point on it is a building the reader can step into.

### What only an instant engine can do

The experience this feature exists to invent is simple to state and impossible without a 50 ms solve: **the reader moves, and the ground under them is real.**

- The ground fills in **while it is being looked at**, coarse first, refining where it is steep and where the reader is working, so a relief stands in a few seconds and improves for as long as attention stays on it.
- Any point on it can be **stood on**. Choosing a point does not preview a design, it *is* the design: the whole of E-01 re-letters, the axonometric redraws, the bill re-prices, the description rewrites itself.
- The design can be **let go and allowed to fall**, one measured step at a time down the steepest line, every step a genuine EnergyPlus run, until it settles in a hollow. That is a design finding its own level, at reading speed, and no offline parametric workflow can offer it.

### The loop this creates

Two axes cannot show a hundred dimensions, and no drawing that claims to is telling the truth. What makes the whole space reachable is not one omniscient picture, it is a loop the reader can run quickly:

    read the pull at the stance   ->  which of the hundred faces actually move this reading, ranked
    cut the ground along two      ->  survey the plane through those two, from where the desk stands
    walk, or let it fall          ->  move the desk to a better measured point on that ground
    read the pull again           ->  at the new stance the ranking has changed; cut again

Each pass costs seconds, and each pass is honest about being local. The reader crosses the design space in a series of measured moves rather than being handed a picture that pretends to have seen all of it at once.

### The vocabulary

The instrument is a survey drawing, and it borrows the words a survey drawing already has, so that nothing needs a legend invented for it.

| Term | What it means here |
| --- | --- |
| **Stance** | Where the desk stands: the current value of every parameter |
| **Ground** | The surface of one chosen reading over two chosen controls, cut through the stance |
| **Spot height** | One measured design: a real run, at a real position, carrying a real number |
| **Contour** | A line of equal reading, inferred between spot heights and declared as inference |
| **Unsurveyed ground** | Area with no measurement in reach, left blank rather than smoothed over |
| **Fall line** | The direction of steepest improvement from a point |
| **The pull** | The fall line read across every control at once, ranked, at the stance |
| **The strike** | The direction along the contour: the moves that change the reading by nothing |
| **Basin** | A hollow the reading falls into, closed by measured ground on every side |
| **Traverse** | The connected path of designs the reader has actually stood on |

### What the survey must never do

Three rules, all of which follow from the constitution and each of which has a plausible and attractive violation.

- **It must not letter a number it did not measure.** Contours, shading and relief are inference drawn between spot heights, and they are drawn as inference. Every figure the reader can read off the survey belongs to a run.
- **It must not claim an optimum.** The lowest measured point is the lowest measured point. A descent that stops has stopped in a local hollow, and says so. There is no "best design", because nothing on this page is entitled to award one.
- **It must not move the model by a private route.** Standing on a point moves the desk through the same commit every slider gesture uses, so the drawing, the link, the studies and the description all follow, and a shared survey is a shared building.

## Clarifications

### Session 2026-09-09

- Q: What should the survey's base drawing be, and what if anything is rendered in 3D? → A: The contoured plan in inline SVG is the authoritative, always-available base drawing; a hand-written WebGL2 relief is a second view of the same measured points, drawn wherever the graphics context will carry it and refused in place with its reason where it will not.
- Q: Does the oblique relief give the reader a camera, and how much control over it? → A: A constrained orbit -- azimuth in fixed steps, elevation clamped to a legible band, named viewpoints -- reachable by keyboard and coarse pointer, snapping rather than animating. No free flight, pan or zoom.
- Q: How is the relief surface built so it cannot pass inference off as measurement? → A: One smooth interpolated surface across the whole extent, with unsurveyed ground given a distinct treatment that does not rely on colour. Because a smooth surface does not report its own sample density, the survey must letter that density and its coverage wherever the relief is drawn.
- Q: How does the survey establish the noise floor it refuses to draw basins out of? → A: There is no noise floor. The engine is perfectly repeatable and deterministic on one input, so every measured difference is real and is reported as real. What must be guarded instead is that a sample's reading never depends on which pooled instance ran it or how many runs that instance has already served.
- Q: Does the phone get the relief, given the plan already carries every reading at 390 px? → A: Yes, on by default, with one behaviour on every device. The relief is not withheld, deferred or coarsened by viewport, so what a phone draws is what a desk draws.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cut the ground and stand on it (Priority: P1)

A modeller has a desk they are unhappy with. They open the survey, choose two controls that matter to them (window-to-wall ratio on the south wall and the wall U-value, say) and a reading already on the study roster (heating and cooling demand). The sheet cuts a plane through the design space at the desk's stance and begins surveying it: a coarse grid of real runs lands within seconds and stands as a relief, spot heights lettered, contours drawn between them, ground it has not reached left blank. The stance is marked on it. They see a hollow off to one side, choose a measured point inside it, and the whole of E-01 becomes that building.

**Why this priority**: This is the feature. Every other story on this list reads the ground, moves across it, or keeps it honest.

**Independent Test**: Open the survey on any desk, choose two numeric controls and a reading, confirm a relief appears built only of runs that happened, and confirm that choosing a measured point moves the desk to exactly that design. Fully testable with nothing else on this list built.

**Acceptance Scenarios**:

1. **Given** a desk and two chosen numeric controls, **When** the reader opens the survey, **Then** a coarse relief stands within seconds, every point on it traceable to a completed run, and it continues to refine while attention stays on it.
2. **Given** a survey still filling, **When** the reader drags a slider on E-01, **Then** the live sheet re-solves at its usual cadence and the survey yields the engines rather than queueing the desk behind itself.
3. **Given** a measured point on the ground, **When** the reader chooses it, **Then** the desk moves to exactly that design through the same path a slider gesture uses, the drawing, quantities, bill, schedule and description all follow, and the address bar updates on release.
4. **Given** a sample that failed or was never reached, **When** the reader looks at that part of the ground, **Then** it is drawn as absent, states why, and no contour is carried across it.
5. **Given** any figure lettered anywhere on the survey, **When** it is checked, **Then** it is the value of a run, never a value read off a contour or a shaded surface.
6. **Given** a control with no numeric face (an hourly pattern, a list of dates), **When** the reader tries to make it an axis, **Then** it is refused with the reason, in the same terms studies already refuse it.
7. **Given** an axis whose channel is patched out, or a wall that can carry no opening, **When** the survey is asked for, **Then** it is refused with that wall's or that channel's own sentence rather than surveying ground where every run is identical.

---

### User Story 2 - Read what is pulling the design (Priority: P1)

The reader does not know which two controls are worth cutting. They ask the sheet. At the stance, every sweepable control is probed either side of its current value and ranked by how far it moves the chosen reading. The answer is a ranked list that says, in words and figures, which faces this building is actually sensitive to right now, which way each one pulls, and how much room each still has to move. The top of that list is what they cut the ground along.

**Why this priority**: This is the user's own question, "what pulls a design towards a certain performance", asked at full dimension rather than two at a time. It is also the only reading here that speaks about all hundred faces at once, and it is what makes the loop navigable instead of a guessing game about which plane to cut.

**Independent Test**: On a desk with a reading chosen, ask for the pull and confirm the ranking, the direction words and the figures; then sweep the top three controls as ordinary studies and confirm the sweeps agree with the ranking.

**Acceptance Scenarios**:

1. **Given** a desk and a chosen reading, **When** the reader asks for the pull, **Then** every sweepable control is ranked by how much it moves that reading at this stance, each with its direction stated in words and not by colour alone.
2. **Given** a control already sitting at one of its stops, **When** it appears in the pull, **Then** its remaining room to move is stated, because a steep face with nowhere left to go is a different fact from a steep face with half its range in hand, and the two must not be ranked as one.
3. **Given** a control that moves the chosen reading by exactly nothing at this stance, **When** it is reported, **Then** it is stated as not moving this reading rather than as a small number, and every non-zero difference is reported as real, because the engine is repeatable on one input and there is no noise floor to hide behind.
4. **Given** a control whose channel is bypassed, or which reaches no object in the document at this stance, **When** the pull is read, **Then** it is listed as inert with the reason rather than silently omitted or drawn as zero.
5. **Given** the pull has been read, **When** the reader chooses two of its entries, **Then** the ground is cut along exactly those two without retyping anything.
6. **Given** samples already solved by studies or by an earlier survey, **When** the pull is computed, **Then** those runs are reused and only the missing ones are run.

---

### User Story 3 - Let the design fall (Priority: P2)

The reader releases the desk and lets it fall. From the stance, the sheet takes the steepest measured step downhill, then the next, then the next, each one a real run and each one appearing on E-01 as it is taken, until no measured neighbour is better. The design settles in a hollow, and the sheet says plainly that it is a hollow reached from here and not the best building available. Every step is on the traverse, so the reader can step back up it at any point.

**Why this priority**: It is the experience that only an instant engine can offer, and it converts the survey from a picture into a machine the reader operates. It depends on the ground and the pull existing, so it comes after them.

**Independent Test**: From a stance with obvious headroom, let it fall and confirm that every intermediate desk is a real solved design, that the final desk is no worse than the start, that the stop reason is stated, and that the whole descent can be undone.

**Acceptance Scenarios**:

1. **Given** a stance, **When** the reader lets it fall, **Then** each step moves the desk to a measured neighbouring design, the drawing follows each step, and the reading improves or the descent stops.
2. **Given** a descent in progress, **When** the reader stops it or touches any control, **Then** it halts at the last completed step with the desk on a real design, never mid-run and never on an interpolated position.
3. **Given** a descent that has settled, **When** the reader reads the result, **Then** the sheet states that it is a hollow reached from this stance, states what was measured around it, and makes no claim of optimality.
4. **Given** a reader who has asked their system for reduced motion, **When** a descent runs, **Then** the steps are stated without animated flight.
5. **Given** a descent has finished, **When** the reader steps back along the traverse, **Then** each earlier design is restored exactly, including the readings that were taken at it.

---

### User Story 4 - Find where two readings fall together (Priority: P2)

Untapped efficiency is rarely one number. The reader carries a second reading on the same ground: demand as the relief, overheating hours as the second. The survey names the area where **both** improve on the stance, letters both figures at every spot height, and states the exchange where they disagree. It does not add them together into a score, because nobody published one.

**Why this priority**: The user's question names energy and thermal comfort in one breath, and a survey that answers only one at a time sends the reader back to holding two pictures in their head, which is the problem this feature exists to remove.

**Independent Test**: Survey a ground with two readings and confirm that the area where both improve is identified from measured points only, that both figures are lettered at each spot height, and that no combined score is invented.

**Acceptance Scenarios**:

1. **Given** a ground and two chosen readings, **When** the survey is drawn, **Then** both are lettered at every measured point and the second is encoded by more than colour alone.
2. **Given** measured points where both readings improve on the stance, **When** the reader looks for them, **Then** they are named as such, bounded by measured ground only.
3. **Given** points where the two readings disagree, **When** the reader reads them, **Then** the trade is stated in the two readings' own units, and no single figure is offered that ranks one against the other.
4. **Given** a reading the current run cannot answer, **When** it is offered as a second reading, **Then** it stands in the list greyed with its reason and its fix, exactly as the study roster already does.

---

### User Story 5 - See which moves are free (Priority: P3)

Along a contour, the reading does not change. The reader is shown that directly: at the stance, the sheet states the exchange along the level line, in the two controls' own units, so that "this much wall insulation buys this much glazing at constant demand" is a sentence on the page. Those are the moves an architect can make for nothing, and they are invisible in every sensitivity study ever drawn, because a study holds everything else still and can only ever report a cost.

**Why this priority**: It is the most original reading the ground makes possible and it is the one an architect can act on fastest, but it is a reading of a surface that must exist first, and it needs enough measured ground around the stance to be honest.

**Independent Test**: At a stance with enough surrounding measurement, read the free exchange, then move the desk along it by hand and confirm the reading is unchanged within the stated tolerance.

**Acceptance Scenarios**:

1. **Given** a stance surrounded by enough measured ground, **When** the reader reads the free exchange, **Then** it is stated in both controls' units with the tolerance it holds to.
2. **Given** a stance where the ground around it is not measured densely enough, **When** the free exchange is asked for, **Then** it is refused with what would fix it, rather than computed off a coarse grid and stated with false precision.
3. **Given** a reading that is flat across the whole ground, **When** the exchange is read, **Then** the sheet says the reading does not move here rather than drawing a direction out of noise.

---

### User Story 6 - Keep the ground you have walked (Priority: P3)

Every design solved this session is a specimen, and the reader's path across the space is a traverse. The survey draws it: where the desk has been, in order, with each stop restorable. Ground that has been surveyed stays surveyed as the reader moves, so the map is revealed by exploring rather than declared complete at the start, and what has not been measured continues to read as not measured.

**Why this priority**: It makes the exploration cumulative instead of episodic, and it is what stops the reader losing a good design they had two moves ago. It is last because the survey is usable without it.

**Independent Test**: Walk the desk across several positions, confirm each appears on the traverse, restore an earlier one exactly, and confirm ground measured earlier is still drawn as measured.

**Acceptance Scenarios**:

1. **Given** several designs stood on this session, **When** the reader reads the traverse, **Then** each is listed in order with its readings, and choosing one restores that desk exactly.
2. **Given** the reader has moved the stance, **When** the ground is redrawn, **Then** measurements already taken that still apply are kept and only what is genuinely new is run.
3. **Given** a station change, **When** it happens, **Then** the survey and its measurements are taken down with the studies and the sample cache, because a measurement of one climate is not a measurement of another.

---

### User Story 7 - Send someone the survey (Priority: P2)

The reader shares the link. The recipient gets the same desk, the same ground, the same reading, and, once it has surveyed, the same numbers, because the model is deterministic and the survey is built out of the model.

**Why this priority**: Reproducibility is a non-negotiable principle, and a survey that cannot be shared is a screenshot with extra steps. It is P2 only because the ground has to exist before it can be carried.

**Independent Test**: Open a survey, copy the link, open it in another browser and confirm the same axes, reading, extent and stance, and identical measured values at identical positions.

**Acceptance Scenarios**:

1. **Given** a survey open, **When** the reader copies the link, **Then** the axes, the reading or readings, the extent and the stance are carried in it.
2. **Given** such a link, **When** it is opened elsewhere, **Then** the same survey is re-measured and every point agrees exactly with the original.
3. **Given** a link naming an axis, a reading or an extent the sheet cannot honour, **When** it is opened, **Then** the whole link is refused with the reason stated on the sheet, never half loaded.
4. **Given** a survey open, **When** a run bundle is exported, **Then** it cites the permalink of the desk that was actually solved, as it already does.

---

### User Story 8 - Read it with a thumb (Priority: P2)

The sheet is read on a phone on site as often as at a desk. The survey is readable at 390 px wide: the relief is drawn there by default and at full mesh, it is operable with a thumb, every measured design is readable in full as text without hovering anything and without opening anything, and where the device cannot draw a relief at all the sheet says so and gives the same measurements as a schedule of spot heights.

The schedule is folded shut by default, because open it is some five hundred lines of table on a phone under two drawings. What that requires, and what the survey therefore does, is that a design is readable in full **without** opening it: tapping its tick or walking the ground with the arrow keys letters it under the plan. A tap is not a hover — `pointer: coarse` fires `pointerenter` on touch — and the keyboard reaches every position, so no reading sits behind a gesture the device cannot make. The fold's summary carries the count, so a reader who never opens it still knows what it holds.

**Why this priority**: A reading that cannot be read is not a reading, and this is a constitutional requirement rather than a nicety. It is P2 because it constrains the P1 stories rather than standing alone.

**Independent Test**: Drive the whole survey at 390 x 640 with a coarse pointer, with hover unavailable, and again with the relief drawing disabled.

**Acceptance Scenarios**:

1. **Given** a 390 px wide viewport, **When** the survey is open, **Then** every reading is readable without hovering, without sideways scrolling and without opening anything.
2. **Given** a coarse pointer, **When** the reader works the ground, **Then** every gesture has a target a thumb can hit and a keyboard route that reaches the same designs.
3. **Given** a device or setting where the relief cannot be drawn, **When** the survey is opened, **Then** the sheet states that plainly and letters the same measured points as a schedule, rather than showing an empty frame.
4. **Given** a 390 px viewport whose graphics context will carry the relief, **When** the survey is opened, **Then** the relief is drawn by default at the same mesh a desk would get, its camera is workable with a thumb and reachable from the keyboard, and every reading it carries is still readable on the plan without it.
4. **Given** a short viewport, **When** the survey is open, **Then** it folds by the same rules the console and the schedules already fold by.

---

### Edge Cases

- **The two axes are the same control.** Refused before anything is measured.
- **An axis is a control the desk cannot move**, because its channel is bypassed, its wall carries no opening, or its precondition is unmet. Refused with that control's own sentence, not a generic one.
- **An axis has fewer distinct positions than the survey wants**, because its step is coarse. The ground is measured at the positions the control can actually hold, and says how many there were, rather than inventing positions between the stops.
- **The reading needs a weather file and none is attached.** Offered, greyed, with the fix, exactly as the study roster does.
- **The reading needs a whole year and the calendar leaves months out.** Same refusal as everywhere else on the sheet.
- **A run in the survey fatals**, or the engine instance dies. That point is a gap, drawn as a gap, with its reason; the surrounding ground is not smoothed over it and the survey continues.
- **Every run in the survey fatals.** The survey states that it measured nothing and why, rather than presenting an empty relief.
- **The reading does not move across the whole ground.** Stated as flat. No relief is exaggerated to make a picture out of nothing.
- **Two samples of the same design return different readings.** The engine is repeatable on one input, so this is instance state leaking between runs rather than a property of the design, and it invalidates the ground. The survey MUST report it rather than average it away or redraw around it.
- **The desk moves while the survey is filling** (a slider, a preset, a revert). The measurements that no longer describe the stance are disowned the way study samples already are, and what is still true is kept.
- **A study is running when a survey is asked for.** They share the same pool and the same measured designs; neither starves the other and neither blocks the live sheet.
- **Auto-solve is off.** Nothing is measured; the survey says it is waiting and what would start it.
- **A descent is asked for on ground with no measured neighbour better than the stance.** It reports that it is already in a hollow and takes no step.
- **A descent oscillates between two points of equal reading.** It stops and says so rather than stepping forever.
- **The reader lets it fall while the link is being attached** or a station is being changed. Refused until the desk is settled, with the reason.
- **The relief cannot be drawn** because the device offers no accelerated graphics, or the drawing context is lost mid-session. Stated in place, with the measurements still readable.
- **Forced colours or monochrome.** Measured, inferred and unsurveyed ground stay distinguishable, because colour is never the only carrier.
- **A survey link arrives naming a control that no longer exists**, or a reading that has been renamed. The link is refused whole, with the reason.

## Requirements *(mandatory)*

### What the survey is of

- **FR-001**: The survey MUST take two controls as its axes and at least one reading as its subject, all chosen by the reader, and MUST state all three in place at all times.
- **FR-002**: The readings offered MUST be the roster the studies already offer, with the same availability rules, the same refusals and the same reasons, so the sheet has one vocabulary of outcomes rather than two.
- **FR-003**: Any control the studies can sweep MUST be available as an axis, and any control they cannot MUST be refused with the same sentence they refuse it with.
- **FR-004**: Controls declared on priced channels MUST NOT be axes, because nothing they own reaches the model.
  - *Superseded by [spec 011 FR-007](../011-sweep-priced-controls/spec.md): priced controls are axes, refused only by pairing (FR-003) or a withdrawn face (FR-005).*
- **FR-005**: The ground MUST be cut through the desk's current stance, so that the point the reader already understands is on the drawing.
- **FR-006**: The extent of each axis MUST default to the control's full declared range and MUST be narrowable by the reader, with the extent stated.

### Measuring

- **FR-007**: Every point drawn as measured MUST correspond to one completed EnergyPlus run of a document built by the same applier the live desk uses.
  - *Amended by [spec 011 FR-026](../011-sweep-priced-controls/spec.md): several points may share one run, priced at each position, only along a priced axis.*
- **FR-008**: Positions MUST be snapped to each control's own step grid, so no measured design is one the desk itself could not hold.
- **FR-009**: Measurement MUST be progressive: a coarse grid first, refining afterwards, with the relief legible from the first complete coarse pass.
- **FR-010**: Refinement MUST prefer ground that is steep, ground that separates two very different readings, and ground the reader is working near, over ground that is already flat and well described.
- **FR-011**: Measured designs MUST be shared with the studies and with earlier surveys through the existing sample cache, so that a control already swept appears as measured ground at no engine cost.
- **FR-012**: A survey MUST NOT run on the live sheet's engine, and the live sheet's own solves MUST NOT queue behind survey work.
- **FR-013**: Survey work MUST pause while a gesture is in progress and resume on release, by the same rule studies follow.
- **FR-014**: Survey work MUST be gated by the auto-solve control and by any pending link or station attach, and MUST say when it is waiting on one of them.
- **FR-015**: The survey MUST report its own progress as measured designs against designs wanted, and MUST make plain that a partly measured ground is partly measured.
- **FR-016**: A failed run MUST be recorded as a gap carrying its reason, MUST NOT be retried indefinitely, and MUST NOT be filled from a neighbour.
- **FR-017**: New output requests introduced by this feature MUST stay at zone or site level, and a survey sample MUST request no more than the reading it is being measured for needs.

### Drawing

- **FR-018**: The drawing MUST distinguish, at a glance and without colour being the only carrier, three states of ground: measured, inferred between measurements, and not measured at all.
- **FR-018a**: The base drawing MUST be a contoured plan in inline SVG, and it MUST be authoritative: every reading, every gesture and every keyboard route MUST be complete on it alone, and the survey MUST be fully usable with no relief drawn.
- **FR-018b**: The oblique relief MUST be a second view of the same measured points, written against a platform graphics API in this repository rather than a third-party 3D or charting library, and MUST add no run-time dependency.
- **FR-018c**: The relief MUST NOT be the only carrier of any reading, gesture or refusal that the plan does not also carry.
- **FR-018d**: The relief's viewpoint MUST be a constrained orbit: azimuth turning in fixed steps and elevation clamped to a band that keeps the ground legible. Free flight, pan and zoom MUST NOT be offered.
- **FR-018e**: Every camera move MUST be reachable from the keyboard and from a coarse-pointer target, and the survey MUST offer named viewpoints so a reader can reach a known view without aiming.
- **FR-018f**: Camera moves MUST snap between positions rather than animate, so that a reader who has asked for reduced motion loses no view and no reading.
- **FR-018g**: The relief MUST NOT offer a vertical exaggeration control, and its vertical scale MUST be stated in place, so that a reading which barely moves cannot be drawn into apparent terrain by the scale alone.
- **FR-018h**: The relief MUST be drawn as one smooth interpolated surface across the extent, and ground that was never measured MUST be given a treatment that separates it from measured ground without colour being the only carrier.
- **FR-018i**: Because a smooth surface does not report its own sample density, the survey MUST letter that density and its coverage wherever the relief is drawn, and MUST NOT rely on the drawing to convey how well surveyed the ground is. A relief and a schedule of spot heights MUST never be able to disagree about how much was measured.
- **FR-018j**: Every measured point MUST remain individually identifiable on the relief, so a reader can tell a real sample from the surface drawn between samples at any viewpoint.
- **FR-018k**: The relief MUST be drawn on every device whose graphics context will carry it, started by default and not gated on viewport size, and its mesh MUST NOT be coarsened by viewport. What a phone draws is what a desk draws, so a reader cannot be shown a less knowing surface than the one they would be shown elsewhere.
- **FR-019**: Contours, shading and relief MUST be declared as inference in place, and no figure lettered anywhere on the survey may be read off them. The declaration MUST stand in place on the relief itself, not only on the plan, because a continuous surface is read as continuous data wherever it is drawn.
- **FR-020**: Every measured point MUST be able to state its own reading, its own position on both axes, and the fact that it is a completed run.
- **FR-021**: The stance MUST be marked on the ground at all times, and MUST move when the desk moves.
- **FR-022**: The drawing MUST follow the design system: one hue, hairline work, no shadows, the accent reserved for markup, and the cold and warm pair reserved for signed physical quantities.
- **FR-023**: Any motion (flight over the ground, an animated descent) MUST be suppressed where the reader has asked their system for reduced motion, without losing any reading.
- **FR-024**: Where the relief cannot be drawn, or its drawing context is lost mid-session, the survey MUST say so in place with the reason and MUST continue to carry every reading on the plan and as a schedule of spot heights. It MUST NOT silently fall back to a still image or an empty frame. The schedule MAY be folded shut, provided a measured design remains readable in full without opening it.

### Reading the ground

- **FR-025**: The sheet MUST rank every sweepable control by how much it moves the chosen reading at the stance, stating for each its direction in words, its effect per unit of its own travel, and how much of its range remains in the direction that improves the reading.
- **FR-026**: The engine is repeatable on one input, so every measured difference MUST be reported as real and no effect may be dismissed as noise. A control that moves the reading by exactly nothing MUST be stated as not moving it, which is a different fact from a small effect and MUST NOT be lettered as one.
- **FR-026a**: A sample's reading MUST NOT depend on which pooled engine instance ran it, nor on how many runs that instance has already served. Two runs of one design MUST agree exactly, and a disagreement MUST be surfaced as a fault in the survey rather than smoothed, averaged or redrawn around.
- **FR-027**: The pull MUST list controls that reach no object at this stance as inert with the reason, rather than omitting them or reporting them as zero.
- **FR-028**: Choosing two entries from the pull MUST cut the ground along them directly.
- **FR-029**: Where enough measured ground surrounds the stance, the sheet MUST state the exchange along the level line in both controls' units together with the tolerance it holds to, and MUST refuse to state it otherwise.
- **FR-030**: A region where every chosen reading improves on the stance MUST be identifiable from measured points only, and MUST be named as a region of the measured ground rather than as an optimum.
- **FR-031**: Where two readings are carried, both MUST be lettered at every measured point, and no combined score ranking one against the other may be invented.

### Moving the desk

- **FR-032**: Choosing a measured point MUST move every parameter it names through the same commit path any control gesture uses, so that the drawing, the quantities, the bill, the schedule, the description, the studies and the link all follow.
- **FR-033**: The desk MUST NOT be moved to a position that has not been measured.
- **FR-034**: The address bar MUST be left alone during a gesture and updated on release, by the rule every gesture on this sheet follows.
- **FR-035**: A descent MUST take one measured step at a time, MUST stop when no measured neighbour improves the reading, and MUST state why it stopped.
- **FR-036**: A descent MUST be stoppable at any moment and MUST always leave the desk on a completed design.
- **FR-037**: A descent MUST NOT be described as finding the best design, and the sheet MUST state that the hollow it reached is local to the stance it started from.
- **FR-038**: Every design the desk has stood on this session MUST be restorable exactly, and MUST carry the readings that were taken at it.

### Honesty and refusals

- **FR-039**: Any condition that prevents a survey, an axis, a reading, an exchange or a descent MUST be refused whole, with the specific reason stated in place and the fix named where one exists.
- **FR-040**: A reading with no measurement behind it MUST render as an em dash and stay out of every total.
- **FR-041**: Declaration errors, such as an axis pairing that cannot exist or a reading with no reader, MUST throw at load rather than degrade at run time.
- **FR-042**: The survey MUST state what it has not measured whenever it states what it has, including the count of gaps and the coverage of the extent.

### The link

- **FR-043**: The axes, the readings, the extent and the stance MUST ride the URL fragment, and a link MUST reproduce the same survey on another machine.
- **FR-044**: Measured values MUST NOT ride the link; the recipient re-measures, and the result is identical because the model is deterministic.
- **FR-044a**: The relief's viewpoint MUST NOT ride the link. It is how the ground is being looked at rather than what was measured, which is the rule the chase pin already follows, and a link that carried it would make two readers of one survey disagree about the drawing while agreeing about every number.
- **FR-045**: Nothing carried by the survey may reach the IDF except through the desk's own parameters, so that a shared link is a shared building.
- **FR-046**: A link naming an axis, a reading or an extent that cannot be honoured MUST be refused whole with the reason, never half loaded.
- **FR-047**: Adding these keys MUST follow the existing versioning rule: reserved keys asserted against the control keys at load, and a version bump with a migration if any existing default, key or range changes.

### Layout and access

- **FR-048**: Every reading the survey letters MUST be readable at 390 px wide without hovering, without sideways scrolling and without opening anything.
- **FR-049**: Every gesture on the ground MUST have a coarse-pointer target and a keyboard route that reaches the same designs.
- **FR-050**: Layout thresholds MUST be declared once in the stylesheet and read back by script, and MUST consider height as well as width.
- **FR-051**: Anything folded away MUST leave the tab order with the fold, and any table semantics dropped by folding MUST be restated.

### Composition with the rest of the desk

- **FR-052**: A station change MUST take the survey and its measurements down with the studies and the sample cache.
- **FR-053**: A survey and any number of studies MUST be able to be up at once, sharing the pool and the cache, without either starving the other.
- **FR-054**: Setting studies aside and clearing all studies MUST have a stated, consistent effect on the survey, and the counts the head letters MUST include whatever they claim to include.
- **FR-055**: The general notes MUST be updated to reflect the survey wherever they now describe the sheet incompletely, and the storage key bumped where a step changes meaning.
- **FR-056**: The architecture notes, the design system and the changelog MUST be updated in the same change that introduces the feature.

### Key Entities

- **Survey**: One ground under measurement. Names two axes, one or two readings, an extent per axis, and the stance it was cut through. Carries its measured points, its gaps and its coverage.
- **Axis**: One control chosen as a direction, with the extent being surveyed and the positions the control can actually hold within it.
- **Spot height**: One measured design. A position on both axes, the parameters it implies, the run's readings, and the record of what that run carried.
- **Gap**: A position that was asked for and could not be measured, carrying the reason.
- **Stance**: The desk's current position, and the point every relative reading (the pull, the exchange, the region where readings improve) is taken against.
- **Pull entry**: One control at the stance: its direction, its effect per unit of travel, its remaining room, and whether it moves the reading at all.
- **Traverse stop**: One design the desk has stood on, in order, restorable.
- **Reading**: The existing quantity declaration, reused unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the survey, a legible relief built only of completed runs stands in under 5 seconds on a design-day desk and under 30 seconds with a weather file attached, on a four-core machine.
- **SC-002**: While a survey is filling, a slider drag on E-01 re-solves at the same cadence it does with no survey open, within 10 percent.
- **SC-003**: Every figure lettered on the survey traces to a completed run. Audited over at least 50 measured points: zero figures originate in interpolated ground.
- **SC-004**: The same link opened on a different machine and a different browser produces the same measured positions and identical readings at each, and each point's model input is byte-identical to the original's.
- **SC-005**: The pull's top three controls agree in rank with three independent full sweeps of those controls on 10 of 10 test desks. Because the engine is repeatable, there is no tolerance to appeal to and any disagreement is a defect to be fixed rather than an expected spread.
- **SC-005a**: One design measured twice, on different pooled instances and at different points in a session's life, returns identical readings. Verified over at least 20 repeats spanning a cold instance and an instance that has already served ten runs.
- **SC-006**: A descent never leaves the desk worse than where it started, always ends on a completed design, and always states its stopping reason.
- **SC-007**: The whole survey is operable and fully readable at 390 x 640 with a coarse pointer and no hover, and every gesture is reachable from the keyboard. The relief draws there by default at the same mesh a desk receives, and every reading remains complete on the plan with the relief removed.
- **SC-008**: A reader who has not seen the survey before can name, within 2 minutes and without assistance, the three controls that most move their chosen reading and one region of the ground where it improves.
- **SC-009**: Measured, inferred and unsurveyed ground remain distinguishable in both themes, in monochrome and under forced colours, verified by inspection.
- **SC-010**: Injected run failures always appear as gaps with reasons; no gap is ever filled, smoothed or silently dropped, verified over at least 20 injected failures.
- **SC-011**: A survey opened on an axis already swept as a study reuses those measured designs, spending zero engine runs on the positions they cover.
- **SC-012**: The feature adds no new run-time dependency and no more than 60 KB of transfer to a cold visit.

## Assumptions

- **The survey is a second sheet in the same set, not a mode.** E-01 remains the building and stays reachable; the survey is E-02 and reads the same model. The reader can see the desk change when they move it.
- **The relief is smooth, and the figures carry what the smoothness hides.** A continuous surface was chosen over a faceted one for legibility, at the cost that the drawing no longer reports its own sample density. The coverage and density figures beside it are therefore load bearing rather than decorative: they are the only thing standing between a coarse survey and a convincing picture of one.
- **One behaviour on every device.** The relief is not withheld, deferred behind an opt-in, or coarsened by viewport. A phone draws what a desk draws, so no reader is quietly handed a surface that appears to know less than somebody else's. The cost of that decision is that the relief must be cheap enough to start unasked beside a resident engine, which is a budget on the drawing rather than a reason to special-case the phone.
- **The contoured plan is the drawing; the relief is a second view of it.** The base drawing is a contoured plan in inline SVG, in the sheet's own ink, and it is authoritative: it carries every reading, every gesture and every keyboard route, and it is what the 390 px layout is designed against. An oblique relief drawn in WebGL2 is offered beside it as a second view of the same measured points, and the survey is complete and fully readable without it.
- **No run-time dependency is added, and WebGL is not one.** The constitution restricts run-time *packages* to `@idfkit/*` and prefers platform APIs to packages, citing `DecompressionStream`, `URLSearchParams` and inline SVG as the pattern. WebGL2 is a platform API in exactly that sense, so the relief is written as shaders in this repository rather than pulled from a 3D or charting library. Anything that cannot be built that way is out of scope for this feature rather than a reason to amend the constitution.
- **The reading roster is the one the studies already carry**: the eleven choices covering thirteen outcomes settled in the previous feature. No new outcome is defined here, and any new one is a separate change.
- **Two readings is the ceiling for one ground.** A third has nowhere honest to be drawn and no published way to be combined.
- **The coarse pass is on the order of a few dozen runs, not a few hundred**, so a relief stands inside the reader's attention span. Density beyond that is earned by refinement while the reader looks, not spent up front.
- **The survey measures at the run kind the desk is on**, design day or weather file, and says which. It does not silently drop to design days to go faster.
- **Descent is local and is described as local.** Global search, multi-start, genetic or Bayesian optimisation are out of scope: they cost more runs than the reading is worth here and they end in a claim ("the optimum") this sheet is not entitled to make.
- **The traverse is a session, not a history.** It lives as long as the page does, alongside the sample cache, and is cleared where the cache is cleared. Saving a design is what the scheme shelf is already for.
- **Nothing about the reader's exploration leaves the machine.** The survey is measured in the browser like everything else, and the link is the only thing that travels.

## Out of scope

- Any global or population-based optimisation, and any ranking of designs into a single score.
- New outcomes, meters or output variables beyond what the reading roster already carries.
- Surveying more than two controls in one ground, or an automatic choice of which plane to cut. The pull tells the reader; the reader decides.
- Persisting surveys across sessions, or exporting a measured ground as a data file.
- Any change to how the model itself is built. Nothing in this feature adds a channel, a control or an IDF object.
