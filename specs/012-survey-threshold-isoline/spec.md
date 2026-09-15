# Feature Specification: Threshold isoline on the survey

**Feature Branch**: `012-survey-threshold-isoline`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "A reader running a design space survey asks that the threshold belonging to the plotted metric be shown on the topo map itself. Their example is the TM59 criterion they had selected: rather than reading spot heights and judging each one, they want the threshold drawn as an isoline across the relief, and, if possible, the ground on the accepting side of it picked out as a shaded area. The purpose is to see at a glance the region where combinations of the two chosen parameters fall below the threshold, so that the survey answers "which pairs of settings pass" and not only "how high is it here". This helps anyone using the survey to find a compliant design rather than to measure one: the map would separate the passing part of the design space from the failing part, in the same view where the two parameters are already swept, instead of leaving the reader to infer the boundary by eye from heights alone."

## Overview

The survey (E-02) already cuts a ground through two chosen controls and draws the reading's shape as contour lines and spot heights, both on a flat drawing and as an oblique relief. Reading that ground today means reading numbers: the reader compares each spot height (or each contour) against a limit they carry in their head, one point at a time, to figure out where a design would pass.

This feature draws the limit itself onto the ground. Where the plotted reading is a compliance metric with a published pass/fail figure — the reader's example is a CIBSE TM59 overheating criterion, which passes at a stated percentage of occupied hours or a stated count of hot nights — that figure is drawn as its own line across the surveyed ground, distinguished from the ordinary measurement contours, and the ground lying on the side of that line which satisfies the metric is picked out so it reads as one region rather than a scatter of individually-judged spot heights. The reader's own question changes from "how high is it here" to "which of these combinations pass," answered by where they are standing relative to a drawn boundary rather than by mental arithmetic against a remembered number.

Some readings carry more than one published figure at once, because more than one standard sets its own limit for the same metric — space heating demand, for instance, is a target under Passivhaus, under EnerPHit and under LETI, each at its own number. The survey does not pick one of those for the reader: it draws every applicable standard's line and shaded band together, each told apart from the others. The sheet already has a way for a reader to say which one standard currently matters — chasing it, which pins that standard's worst line up beside the drawing elsewhere on the sheet — and the survey answers to that same choice: chase a standard and the ground narrows to that standard's line and band alone; stop chasing and every applicable line returns.

## Clarifications

### Session 2026-09-15

- Q: When a plotted reading's published threshold differs by standard (e.g. space heating demand is ≤15 kWh/m²·yr under Passivhaus, ≤25 under EnerPHit, ≤15 under LETI), which threshold should the survey draw for that reading? → A: Draw every applicable standard's line for that reading, each distinguished from the others.
- Q: With several standards' lines drawn for the same reading, how should the shaded compliant region work, since a point can pass one standard's line and fail another's? → A: Shade per line, each tied to its own standard — overlapping bands show where a point clears one, several, or all of the applicable standards, rather than being combined into one verdict.
- Q: Should the standard the reader is already chasing (the sheet's existing single "watch this standard's worst line" mechanic) change what the survey draws? → A: Yes — while a standard is chased, only that standard's threshold line and shaded band are drawn for the plotted reading; every applicable standard's line and band are drawn only while nothing is chased.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the pass/fail boundary at a glance (Priority: P1)

A reader has swept two controls against a CIBSE TM59 criterion (or another reading that carries a published limit) and is looking at the resulting ground. They want to know, without reading and comparing individual spot heights, where on that ground the design would pass.

**Why this priority**: This is the whole point of the request — it is the one capability that turns "how high is it here" into "which pairs of settings pass," and every other requirement exists to make this trustworthy.

**Independent Test**: Sweep two controls against a reading that has a published threshold (e.g. a TM59 criterion), and confirm the survey shows a distinguished line at that reading's own limit and a visibly separate shaded region on the passing side, without needing to open any table of spot heights.

**Acceptance Scenarios**:

1. **Given** a survey plotted against a reading with a published pass/fail limit, **When** the surveyed ground includes both passing and failing measured points, **Then** a single line marks the limit and the ground on the passing side is shaded distinctly from the ground on the failing side.
2. **Given** the same survey, **When** the reader looks only at the shaded region (without reading any spot height figure), **Then** they can identify at least one combination of the two swept parameters that meets the metric's published pass condition, if one exists among the measured ground.
3. **Given** the survey is showing the flat contoured drawing, **When** the reader switches to the oblique relief of the same ground, **Then** the threshold line and the shaded region appear there too, at the same position relative to the surveyed ground.

---

### User Story 2 - Tell the threshold line apart from ordinary contours (Priority: P2)

A reader looking at the ground sees both the regular measurement contours (lines of equal reading, spaced at a round interval) and, now, the pass/fail line. They need to be able to tell at a glance which line is the one that matters for compliance, rather than counting contour lines to find the right one.

**Why this priority**: A threshold line that looks like just another contour defeats the purpose — the reader is right back to comparing numbers, just against a line instead of a spot height. This is what makes the "at a glance" promise real.

**Independent Test**: With a threshold-bearing reading plotted, visually confirm the threshold line reads as a distinct, singular feature (not counted among, or confusable with, the ordinary contour interval), even where its value happens to coincide with a round contour level.

**Acceptance Scenarios**:

1. **Given** a plotted reading with a published threshold, **When** the ordinary contours and the threshold line are both drawn, **Then** the threshold line is visually distinguished from every ordinary contour, including the heavier "every fifth" contour the ground already draws.
2. **Given** a threshold whose value happens to land on the same level as a round contour interval, **When** both would be drawn at the same position, **Then** the reader still sees one clearly identified threshold line rather than an unexplained doubled or ambiguous line.

---

### User Story 3 - Know when no threshold applies (Priority: P3)

A reader plots a reading that has no single published pass/fail figure (for example, one of the two readings whose "better" direction is only a stated convention, not a compliance limit). They should be told plainly that no threshold is being drawn, rather than seeing no line and wondering whether the feature failed to find one.

**Why this priority**: The sheet's standing rule is that it never letters a number it did not measure and never claims a judgement it cannot support; silently omitting the threshold line here would look like a bug rather than an honest absence, and the reader would not know whether to trust the blank ground.

**Independent Test**: Plot a reading with no declared threshold and confirm the survey states, in the same place a threshold would otherwise be described, that this reading carries none — rather than leaving that description blank or misleadingly showing the "improving from current stance" marking in its place.

**Acceptance Scenarios**:

1. **Given** a plotted reading with no published threshold, **When** the reader looks at the survey, **Then** no isoline or shading is drawn for a limit, and a stated reason explains that this reading has none.
2. **Given** a plotted reading whose threshold depends on a compliance target the reader has not currently selected elsewhere on the sheet, **When** no such target is active, **Then** the survey behaves the same as for a reading with no threshold at all (states the absence) rather than guessing a value.

---

### User Story 4 - Narrow a busy reading down to the standard being chased (Priority: P2)

A reader has been sweeping a reading that carries more than one standard's threshold — space heating demand, for example, is a limit under Passivhaus, EnerPHit and LETI all at once — and the ground is now carrying several lines and shaded bands. They already have a way to say which one standard they care about right now (chasing it, which the sheet already offers), and want that same choice to declutter the survey too.

**Why this priority**: Without it, a reading with several applicable standards draws every one of their lines at once by default, which is exactly the "will get very busy quickly" outcome a reader would want to escape — and the sheet already has the one mechanism (chasing) that says which standard currently matters, so the survey should answer to it rather than adding a second, competing way to choose.

**Independent Test**: Plot a reading with more than one applicable standard's threshold (e.g. space heating demand under Passivhaus and EnerPHit), confirm multiple lines and bands are drawn while nothing is chased, then chase one of those standards and confirm the survey narrows to that standard's line and band alone.

**Acceptance Scenarios**:

1. **Given** a plotted reading with thresholds from more than one standard and nothing currently chased, **When** the reader looks at the survey, **Then** every applicable standard's threshold line and shaded band are drawn, each distinguished from the others.
2. **Given** the same survey, **When** the reader chases one of those standards, **Then** the survey redraws showing only that standard's threshold line and shaded band for the plotted reading, and the others are withdrawn.
3. **Given** a standard is chased that has no published threshold for the plotted reading, **When** the reader looks at the survey, **Then** the survey states plainly that the chased standard carries no threshold for this reading, the same way it would for a reading with no threshold at all — rather than falling back to showing every applicable standard's line.
4. **Given** the reader stops chasing a standard, **When** they look at the survey again, **Then** it returns to drawing every applicable standard's threshold line and shaded band for the plotted reading.

---

### Edge Cases

- The threshold does not cross the surveyed ground at all (every measured point is on one side): the survey still tells the reader which side that is — wholly passing or wholly failing — rather than drawing nothing because there is no line to place.
- The threshold falls exactly on a measured spot height: that spot's own figure is unaffected; it is not double-counted or relabelled by the boundary passing through it.
- Ground the survey has not measured (unsurveyed ground, already left blank on principle) stays unshaded regardless of which side of the threshold it would fall on if it were measured — the shading follows the same "never smoothed over" rule the ordinary contours already obey.
- The reader changes which reading is plotted on the ground: the threshold line and shading update to the newly plotted reading's own limit, or disappear with a stated reason if the new reading has none.
- The reader changes which compliance target or standard is active elsewhere on the sheet, for a reading whose limit depends on that choice: the drawn threshold follows the currently active limit, never one left over from a prior selection.
- The reader has moved the desk (the stance) to a point that is on the failing side of the threshold: the existing "region where every reading improves from here" marking and the new "meets the published threshold" shading are shown as two distinct things and are not conflated, since improving on the current design and passing a published limit are different judgements.
- A plotted reading carries published thresholds from more than one standard and a design meets some of them but not others: the survey shows each standard's own shaded band as drawn, overlapping where they agree, rather than collapsing them into one combined pass/fail verdict the reader never asked it to compute.
- The reader starts or stops chasing a standard while a reading with more than one applicable threshold is plotted: the survey narrows to the chased standard's line and band alone, or returns to drawing every applicable standard's line and band once nothing is chased, with nothing left over from the prior state.
- The reader chases a standard that sets no threshold at all for the plotted reading: the survey states that absence directly rather than silently showing every applicable standard's line as if nothing were chased.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The survey MUST, for a plotted reading that carries one or more published pass/fail thresholds — whether a single fixed limit or one published separately by each of several standards — draw each threshold currently in view as its own line across the surveyed ground, positioned at that threshold's own limit value.
- **FR-002**: Every threshold line MUST be visually distinguished from the survey's ordinary measurement contours, so a reader cannot mistake a plain height contour (including a heavier interval line) for a pass/fail boundary; where more than one threshold line is drawn at once, each MUST also be distinguished from the others.
- **FR-003**: The survey MUST shade the ground lying on the side of each drawn threshold that satisfies its own published pass condition, keyed to that threshold, so that passing ground reads as its own region for each threshold rather than a single combined verdict.
- **FR-004**: The shaded region MUST stop at the edge of ground the survey has actually measured; ground that is unsurveyed MUST remain unshaded regardless of which side of the threshold it would fall on.
- **FR-005**: Where the plotted reading carries no published, currently-applicable threshold, the survey MUST state plainly that no threshold applies to it, rather than drawing nothing without explanation or fabricating a value.
- **FR-006**: The threshold line and its shading MUST appear consistently everywhere the survey draws the same surveyed ground — the flat contoured drawing and the oblique relief both show it, at the same position.
- **FR-007**: Where the threshold does not cross any of the currently measured ground (all of it lies on one side), the survey MUST still tell the reader which side that is, rather than showing nothing because there is no crossing to draw.
- **FR-008**: Changing which reading is plotted MUST update or remove the threshold line and shading to match the newly plotted reading, with no stale line left from the previous one.
- **FR-009**: Each threshold value drawn on the ground MUST be the same published figure that its compliance definition already states elsewhere on the sheet — the reading's own fixed limit, or, for a standard-published threshold, that standard's own target — so a drawn line can never disagree with the pass/fail verdict already shown for that same reading and standard.
- **FR-010**: Adding the threshold line and shading MUST NOT cover, replace, or make illegible any existing spot height figure, contour label, or the existing "improving from the current stance" marking.
- **FR-011**: Each shaded region MUST be presented only as "meets [its standard's] published threshold" — it MUST NOT be presented as, or imply, a recommended or optimal design within that region, and where more than one region is shown, none MUST be presented as an overall or combined verdict across standards.
- **FR-012**: Where a plotted reading carries a published threshold from more than one standard and the reader is not currently chasing a standard, the survey MUST draw every applicable standard's threshold line and shaded band at once, each visually distinguished from the others.
- **FR-013**: Where the reader is chasing a standard, the survey MUST draw only that standard's threshold line and shaded band for the plotted reading (when it has one), and MUST withdraw every other applicable standard's line and band for as long as the chase continues.
- **FR-014**: Where the reader is chasing a standard that carries no published threshold for the plotted reading, the survey MUST state that plainly, the same way it states the absence of a threshold entirely, rather than falling back to drawing every applicable standard's line.
- **FR-015**: Starting or stopping a chase MUST immediately update which threshold line(s) and shaded band(s) the survey draws for the plotted reading, with nothing left over from the prior chase state.

### Key Entities

- **Threshold**: One published pass/fail figure belonging to a plotted reading (for example, a TM59 criterion's stated percentage of occupied hours or count of nights, or one standard's stated limit on an energy intensity), together with which side of it counts as passing. Distinct from an ordinary measurement contour, which carries no verdict. A reading may carry a single fixed threshold that does not vary by standard, or several thresholds at once — one published by each standard that sets a limit for it.
- **Passing ground**: The portion of the surveyed ground, bounded by what has actually been measured, that lies on one threshold's compliant side. Distinct from the existing "region where every reading improves from the current stance," which compares against the current design rather than against a published limit. Where a reading carries more than one threshold, each has its own passing ground, shown separately rather than merged into one verdict; which thresholds' passing ground is shown at once follows whether the reader is currently chasing a standard.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader surveying a plotted reading with a published threshold can identify which side of the surveyed ground passes, without reading any individual spot height, within a few seconds of the ground finishing its draw.
- **SC-002**: For every plotted reading that carries a threshold, the value and pass side drawn on the ground match that reading's own published compliance definition with zero discrepancies, checked across all such readings on the sheet.
- **SC-003**: Given a surveyed ground that contains at least one passing combination of the two swept parameters, a reader can locate one directly from the shaded region alone, without running any additional simulation or opening a separate table.
- **SC-004**: Plotting a reading that has no defined threshold never shows a threshold line or shading; it shows a stated reason instead, verified across every reading that lacks one.
- **SC-005**: For a reading whose threshold is published by more than one standard, chasing one of those standards reduces the survey to that standard's own threshold line and shaded band alone, verified across every reading that carries more than one applicable threshold.

## Assumptions

- The plotted readings in scope for a drawn threshold are those that carry a published, currently-applicable pass/fail figure: either a single fixed limit that does not vary by standard (today, the CIBSE TM59 criteria), or one published separately by each standard that sets a limit for that reading (today, for example, space heating demand under Passivhaus, EnerPHit and LETI). The sheet has no general "currently active standard" concept, so which of a reading's several standard-published thresholds are drawn, and how many at once, is governed entirely by the existing chase mechanism (Clarifications, Session 2026-09-15) rather than a new selection state.
- The survey's two existing representations of one surveyed ground — the flat contoured drawing and the oblique relief — are both required to show the identical threshold line(s) and shading, since they are already required to agree on everything else they draw.
- No separate control is added to hide, move, or override a drawn threshold beyond the existing chase mechanism; a threshold line appears automatically whenever it applies (and, for a multi-standard reading, whenever it is the one being chased) and disappears automatically when it does not, consistent with the sheet's preference for stated facts over optional toggles.
- The existing marking for "ground that improves on the current stance" is unaffected by this feature and continues to mean what it already means; the new threshold shading is a separate, compliance-based judgement and the two are shown as distinct.
