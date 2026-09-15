# Feature Specification: Threshold isoline on the survey

**Feature Branch**: `012-survey-threshold-isoline`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "A reader running a design space survey asks that the threshold belonging to the plotted metric be shown on the topo map itself. Their example is the TM59 criterion they had selected: rather than reading spot heights and judging each one, they want the threshold drawn as an isoline across the relief, and, if possible, the ground on the accepting side of it picked out as a shaded area. The purpose is to see at a glance the region where combinations of the two chosen parameters fall below the threshold, so that the survey answers "which pairs of settings pass" and not only "how high is it here". This helps anyone using the survey to find a compliant design rather than to measure one: the map would separate the passing part of the design space from the failing part, in the same view where the two parameters are already swept, instead of leaving the reader to infer the boundary by eye from heights alone."

## Overview

The survey (E-02) already cuts a ground through two chosen controls and draws the reading's shape as contour lines and spot heights, both on a flat drawing and as an oblique relief. Reading that ground today means reading numbers: the reader compares each spot height (or each contour) against a limit they carry in their head, one point at a time, to figure out where a design would pass.

This feature draws the limit itself onto the ground. Where the plotted reading is a compliance metric with a published pass/fail figure — the reader's example is a CIBSE TM59 overheating criterion, which passes at a stated percentage of occupied hours or a stated count of hot nights — that figure is drawn as its own line across the surveyed ground, distinguished from the ordinary measurement contours, and the ground lying on the side of that line which satisfies the metric is picked out so it reads as one region rather than a scatter of individually-judged spot heights. The reader's own question changes from "how high is it here" to "which of these combinations pass," answered by where they are standing relative to a drawn boundary rather than by mental arithmetic against a remembered number.

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

### Edge Cases

- The threshold does not cross the surveyed ground at all (every measured point is on one side): the survey still tells the reader which side that is — wholly passing or wholly failing — rather than drawing nothing because there is no line to place.
- The threshold falls exactly on a measured spot height: that spot's own figure is unaffected; it is not double-counted or relabelled by the boundary passing through it.
- Ground the survey has not measured (unsurveyed ground, already left blank on principle) stays unshaded regardless of which side of the threshold it would fall on if it were measured — the shading follows the same "never smoothed over" rule the ordinary contours already obey.
- The reader changes which reading is plotted on the ground: the threshold line and shading update to the newly plotted reading's own limit, or disappear with a stated reason if the new reading has none.
- The reader changes which compliance target or standard is active elsewhere on the sheet, for a reading whose limit depends on that choice: the drawn threshold follows the currently active limit, never one left over from a prior selection.
- The reader has moved the desk (the stance) to a point that is on the failing side of the threshold: the existing "region where every reading improves from here" marking and the new "meets the published threshold" shading are shown as two distinct things and are not conflated, since improving on the current design and passing a published limit are different judgements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The survey MUST, for a plotted reading that carries a published pass/fail threshold, draw that threshold as a single line across the surveyed ground, positioned at the reading's own limit value.
- **FR-002**: The threshold line MUST be visually distinguished from the survey's ordinary measurement contours, so a reader cannot mistake a plain height contour (including a heavier interval line) for the pass/fail boundary.
- **FR-003**: The survey MUST shade the ground lying on the side of the threshold that satisfies the plotted reading's own published pass condition, so that passing ground reads as one region rather than a set of individually-judged points.
- **FR-004**: The shaded region MUST stop at the edge of ground the survey has actually measured; ground that is unsurveyed MUST remain unshaded regardless of which side of the threshold it would fall on.
- **FR-005**: Where the plotted reading carries no published, currently-applicable threshold, the survey MUST state plainly that no threshold applies to it, rather than drawing nothing without explanation or fabricating a value.
- **FR-006**: The threshold line and its shading MUST appear consistently everywhere the survey draws the same surveyed ground — the flat contoured drawing and the oblique relief both show it, at the same position.
- **FR-007**: Where the threshold does not cross any of the currently measured ground (all of it lies on one side), the survey MUST still tell the reader which side that is, rather than showing nothing because there is no crossing to draw.
- **FR-008**: Changing which reading is plotted MUST update or remove the threshold line and shading to match the newly plotted reading, with no stale line left from the previous one.
- **FR-009**: The threshold value drawn on the ground MUST be the same published figure the reading's own compliance definition already states elsewhere on the sheet, so the drawn line can never disagree with the pass/fail verdict already shown for that same reading.
- **FR-010**: Adding the threshold line and shading MUST NOT cover, replace, or make illegible any existing spot height figure, contour label, or the existing "improving from the current stance" marking.
- **FR-011**: The shaded region MUST be presented only as "meets the published threshold" — it MUST NOT be presented as, or imply, a recommended or optimal design within that region.

### Key Entities

- **Threshold**: The single published pass/fail figure belonging to a plotted reading (for example, a TM59 criterion's stated percentage of occupied hours or count of nights), together with which side of it counts as passing. Distinct from an ordinary measurement contour, which carries no verdict.
- **Passing ground**: The portion of the surveyed ground, bounded by what has actually been measured, that lies on the threshold's compliant side. Distinct from the existing "region where every reading improves from the current stance," which compares against the current design rather than against a published limit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader surveying a plotted reading with a published threshold can identify which side of the surveyed ground passes, without reading any individual spot height, within a few seconds of the ground finishing its draw.
- **SC-002**: For every plotted reading that carries a threshold, the value and pass side drawn on the ground match that reading's own published compliance definition with zero discrepancies, checked across all such readings on the sheet.
- **SC-003**: Given a surveyed ground that contains at least one passing combination of the two swept parameters, a reader can locate one directly from the shaded region alone, without running any additional simulation or opening a separate table.
- **SC-004**: Plotting a reading that has no defined threshold never shows a threshold line or shading; it shows a stated reason instead, verified across every reading that lacks one.

## Assumptions

- The plotted readings in scope for a drawn threshold are exactly those that already carry (or come to carry) a single, currently-applicable published pass/fail figure — today, the CIBSE TM59 criteria the sheet already treats as compliance metrics with stated limits. A reading whose limit instead depends on a compliance target the reader selects elsewhere on the sheet is treated as threshold-bearing only while such a target is active, matching the sheet's existing rule that an unset target yields no pass verdict.
- The survey's two existing representations of one surveyed ground — the flat contoured drawing and the oblique relief — are both required to show the identical threshold line and shading, since they are already required to agree on everything else they draw.
- No separate control is added to hide, move, or override the drawn threshold; it appears automatically whenever the plotted reading has one and disappears automatically when it does not, consistent with the sheet's preference for stated facts over optional toggles.
- The existing marking for "ground that improves on the current stance" is unaffected by this feature and continues to mean what it already means; the new threshold shading is a separate, compliance-based judgement and the two are shown as distinct.
