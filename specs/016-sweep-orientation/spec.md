# Feature Specification: Sweep the building's orientation

**Feature Branch**: `feature/upbeat-noether-3q2prt`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Is it possible to run a sweep (sensitivity analysis) on the site 'north axis' or the building's orientation? Does the interface support it? I don't think so. I can't see it."

## Context

A reader asked for a sweep of the building's orientation and could not find one. They are right: the sheet offers none.

The North axis on the Site strip (01) is the only control on the desk that turns the building under the sun. It is set on a rose rather than on a ruled scale, and that choice is why it cannot be swept. A study, a survey axis and the pull all accept only controls that have a lowest value, a highest value and a step. The rose has none of the three, so it is refused, by the same rule that refuses an hourly profile. The model already handles every angle, since the turn is written into the vertices. The gap is entirely on the sheet.

Orientation is the first question a designer asks of a box and one of the cheapest to answer. It is also the only control whose range has no ends. 0° and 360° are the same building, so a sweep that treats the range as a line counts that building twice, puts its two copies at opposite ends of the axis, and draws a ground with a cliff at north that is not in the building. Every requirement below about wrapping exists to prevent that.

### What a turn moves

A turn changes which way every wall, window, overhang and fin faces. It changes nothing about the fabric, the areas, the gains or the systems. It can therefore move any reading that depends on the sun or the wind: zone temperatures, heating and cooling demand, peak loads, overheating hours, the TM59 criteria, and the bill. The amount depends on the stance: a box glazed evenly on four walls with no shading moves little, and a box glazed on one wall moves a great deal. Whether a reading moves is something a sweep measures, never something the sheet assumes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Study the orientation (Priority: P1)

A reader standing on a design wants to know how a reading changes as the building turns. They press Study on the North axis, as they would on any ruled control, and get a curve of the chosen reading against orientation all the way round the compass. The current orientation is marked and the best and worst orientations are lettered by compass point.

**Why this priority**: This is the question the reader asked. It needs one control and one card, and it answers "which way should this face" without any other part of this feature.

**Independent Test**: On the default desk, open the Study offer on North axis, choose cooling demand, and confirm that a closed curve over the full circle appears, that its positions are lettered as bearings with their compass points, that the desk's own orientation is marked, and that each plotted figure equals what the sheet letters when the rose is turned by hand to that position.

**Acceptance Scenarios**:

1. **Given** the default desk, **When** the reader studies North axis against any reading, **Then** the curve covers the full circle once, no orientation is plotted twice, and 0° and 360° are lettered as one position.
2. **Given** a completed study, **When** the reader turns the rose by hand to any plotted position, **Then** the sheet letters the same figure the curve plotted at that position.
3. **Given** a desk whose North axis stands between two plotted positions, **When** the study completes, **Then** the desk's own position is marked where it stands and is not moved to the nearest plotted one.
4. **Given** a completed study, **When** the reader reads the card without hovering, **Then** the best and worst positions are lettered as a bearing with its compass point (for example `135° SE`), in the reader's chosen unit system.
5. **Given** a study in flight, **When** the reader turns the rose, **Then** the study is cancelled or kept by exactly the same rule that applies to every other study.

---

### User Story 2 - Cut a ground along the orientation (Priority: P2)

A reader wants to see how orientation trades against another design variable, for example how much south glazing a box can carry at each orientation before it overheats. They choose North axis as one axis of an E-02 survey and the other axis as any ruled control, and they get a ground with no seam at north.

**Why this priority**: The trade is where orientation stops being trivial. The right glazing ratio depends on which way the glass faces. It builds on story 1's grid and is worth less without it.

**Independent Test**: Cut a survey of North axis against south glazing ratio, and confirm that the contours, the relief and any published isoline are continuous across north, that the spot heights at 0° match those that would be lettered at 360°, and that coverage counts each orientation once.

**Acceptance Scenarios**:

1. **Given** a survey with North axis on one axis, **When** it completes, **Then** every contour and every published limit line that crosses north continues across it without a break or a jump.
2. **Given** such a survey, **When** coverage is lettered, **Then** the orientation at north is counted once, not twice.
3. **Given** a survey with North axis on one axis, **When** the reader reads the axis, **Then** it is lettered in bearings with compass points, and it states that the axis wraps.
4. **Given** a link to such a survey, **When** another reader opens it, **Then** the same ground is cut.

---

### User Story 3 - Rank the orientation in the pull (Priority: P3)

A reader running the pull to find which controls move a reading the most sees North axis ranked alongside the ruled controls.

**Why this priority**: It completes coverage, but the pull answers which controls to cut a ground along, and a reader asking about orientation already knows they want it.

**Independent Test**: Run the pull on the default desk and confirm that North axis appears with a measured figure and a stated direction of turn.

**Acceptance Scenarios**:

1. **Given** the pull on any desk, **When** it completes, **Then** North axis is ranked by the same measure as every other control, and the entry states which way the building was turned to measure it.

---

### Edge Cases

- **The desk stands near north.** A desk at 350° must be marked at 350° on a curve whose range wraps, not pushed to either end of a line.
- **A link carries 360°.** A North axis of 360 is the same building as 0 and must be read and written as 0. A link carrying a value at or beyond a full turn, or a negative value, is refused whole, stating that the value is outside the range. It is never wrapped silently.
- **The box is symmetrical.** A square box glazed evenly with no context gives a curve with repeating values. Those are measurements and are drawn as they come; the sheet does not say one orientation is best when several tie.
- **A channel is bypassed or a wall carries no opening.** The turn still reaches every surface, so North axis is never inert while the building exists. If a future stance makes it reach nothing, it is listed as inert with its reason, as any other control is.
- **The other Bearing.** The Context strip's "Bearing from site" is a rose too. It is not part of this feature (see Assumptions) and must keep stating why it cannot be studied, rather than offering a study it cannot run.
- **A run fails at one orientation.** That position is drawn as a gap and lettered with its reason, as a failed position on any study is. The curve is not closed across the gap.
- **Units.** A degree is a degree in both systems. Switching between SI and IP must leave every bearing figure on the card, axis and pull unchanged, character for character.

## Requirements *(mandatory)*

### Functional Requirements

**The control**

- **FR-001**: North axis MUST declare a range of whole bearings from 0° up to, but not including, 360°. It MUST also declare that the range wraps, so that its highest position is followed by its lowest.
- **FR-002**: The rose MUST keep working exactly as it does today: dragged, snapped to the eight principal points within two degrees, and lettered as a bearing with its compass point.
- **FR-003**: Every surface that asks whether a control can be swept MUST give North axis the same answer, from one rule. A control that can be studied but not surveyed, or the reverse, is a defect.
- **FR-004**: Links MUST keep reading and writing North axis as they do today. No existing link may change meaning, and no default changes.

**Studying it (P1)**

- **FR-005**: A study of North axis MUST place its positions evenly round the full circle, with no position repeated and 0° included. The coarse pass MUST letter at each of the 8 principal compass points and the fine pass at each of the 16, so every plotted position has a compass name.
- **FR-006**: The fine positions MUST include every coarse position, so the coarse pass is never measured again.
- **FR-007**: The curve MUST be drawn as closed: the segment from the last position back to 0° is drawn like any other segment, and the horizontal axis states that it wraps.
- **FR-008**: The desk's own orientation MUST be marked where it stands, including between plotted positions and between the last position and north.
- **FR-009**: The card MUST letter the best and worst positions, or state that several positions tie, as bearings with compass points. Every figure MUST be one the sheet would letter with the rose turned to that position.
- **FR-010**: Each plotted orientation MUST be read back from the model that was simulated, taking the turn from the building's vertices, not from the value the reader set.

**Surveying it (P2)**

- **FR-011**: North axis MUST be accepted as either axis of an E-02 survey, against any control that can already be surveyed.
- **FR-012**: The survey's grid along North axis MUST wrap as in FR-005 to FR-006, with each orientation sampled once, and every coverage count MUST count it once.
- **FR-013**: Contours, the relief, spot heights and every published limit line MUST be continuous across north. No line may stop or jump at 0°.
- **FR-014**: A narrowed survey range along North axis that crosses north (for example 300° to 60°) MUST be cut as the short way round, not as its complement.

**Ranking it (P3)**

- **FR-015**: The pull MUST rank North axis by the same measure as every other control, turning the building one fine step clockwise, and the entry MUST say so.

**Everywhere**

- **FR-016**: Every new string that is always visible MUST fit the existing copy budgets. Method and reasoning go in a fold, and verdicts, refusals and absence reasons never do.
- **FR-017**: The general notes MUST be updated where a step teaches what can and cannot be studied.
- **FR-018**: Nothing in this feature may add a request to the network or a run-time dependency.

### Key Entities

- **Wrapping range**: a control's range whose highest position is followed by its lowest. It is held by North axis only. It defines what "evenly spaced", "between", "the next step" and "a sub-range" mean for that control.
- **Orientation study**: a study whose positions are bearings round a full circle. It has the same lifecycle, cancellation, queueing and caching as every other study.
- **Orientation axis**: a survey axis whose positions wrap. It shares its sample grid with the study so that measured positions are reused.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader who wants to know how a reading varies with orientation can get the answer from the Study offer on North axis in one action, without turning the rose by hand.
- **SC-002**: On a warm design day, a coarse orientation study completes within the time a coarse study of any ruled control takes today, and its fine pass needs no more runs than a ruled control's fine pass.
- **SC-003**: Across 100% of the fine positions of a study, the plotted figure matches the figure the sheet letters with the rose turned to that position, to the precision lettered.
- **SC-004**: In a survey with North axis on one axis, no contour, isoline or relief edge has a break at north, checked on at least three stances with different glazing.
- **SC-005**: Every link that loaded before this feature loads after it to the same desk, the same IDF and the same numbers.
- **SC-006**: Every bearing figure added by this feature is identical, character for character, in SI and in IP.

## Assumptions

- **Scope covers all three surfaces.** The study, the survey axis and the pull all use one rule about what can be swept. Letting a control through that rule but keeping it off a surface would be the inconsistency FR-003 forbids. Studies are delivered first (P1) and can ship alone.
- **Grid sizes.** Linear studies use 11 positions, then 21, and surveys 6, then 11. Those counts land on a line's two ends and divide it evenly. On a circle they land on bearings with no compass name. 8 positions, then 16, is what the rose already letters. The fine pass nests the coarse one, and the counts are close to the linear ones, so the run budget is about the same. The survey uses the same 8 and 16 along its orientation axis.
- **The Context strip's "Bearing from site" is out of scope.** It is a rose too and could take the same treatment later. Its meaning differs: it turns a neighbour round the box, not the box under the sun. It also has no note to explain a study of it. It keeps stating why it cannot be studied.
- **No landmarks.** Nobody has published a band of orientations for this desk to cite, so North axis carries none.
- **Bearings are whole degrees.** That is the value a link already carries.
- **The model needs no change.** The turn is already written into the vertices at any whole bearing the rose can set. Each of the 16 positions must still be run once during verification, since a turn that brings two vertices within the engine's merge tolerance would delete a surface silently.
