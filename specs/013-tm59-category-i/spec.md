# Feature Specification: TM59 Category I as a reading

**Feature Branch**: `013-tm59-category-i`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "A reader working on a home-office scheme in Boston asks why TM59 Category I is not offered as one of the readings the sheet can report. They had a design space survey running with a TM59 criterion as the plotted metric, and found only the comfort category the sheet already reports; Category I, the stricter category CIBSE publishes for occupants with limited opportunity to adapt, is not among the choices. They want to be able to read the shoebox against Category I as well as the category currently available, and to pick it wherever a reading is chosen: on the sheet itself, and as the metric a study or a survey plots. This would help anyone assessing dwellings or spaces occupied by vulnerable people, where the stricter category is the one the project actually has to meet, instead of leaving them to judge a stricter line by eye against a result computed for a different one."

## Overview

CIBSE TM59 states two comfort categories. The stricter one applies to dwellings for thermally sensitive and fragile occupants — care homes, sheltered accommodation, spaces where people have limited opportunity to adapt — and its adaptive comfort line sits one degree below the other category's, with a night-time limit one degree lower too. The other category covers all other dwellings and is the one a new-build assessment is normally read against.

The sheet already computes both. Its compliance board letters the two category-bearing criteria at **both** categories on every run, each row citing the line it was judged against and saying what that category presumes. What it does not do is let a reader **choose** the stricter category as a reading: the list of readings a study curve or a design space survey can be plotted against — and the list the sheet offers wherever a reading is picked — carries the two category-bearing criteria exactly once each, fixed to the normal-expectation category. A reader assessing a care home can therefore see a stricter figure on the board but cannot sweep a control against it, cannot cut a design space survey for it, and cannot have the survey draw the stricter category's published line across the ground.

The consequence is the one the reader describes: with a survey plotted against a TM59 criterion, the ground, its contours, its spot heights and the published threshold drawn across it all answer the normal-expectation category, and the reader assessing a sensitive dwelling is left to judge a stricter line by eye against a result computed for a different one. Because both categories publish the **same numeric limit** — the criterion passes at the same share of occupied hours, and the night criterion at the same count of nights — nothing on the drawing looks wrong while this happens. Only the underlying comfort line differs, and it is invisible in the plotted figure.

This feature adds the stricter category to the roster of readings, so that it can be picked anywhere a reading is picked: as the metric a study sweeps, as the reading a design space survey cuts its ground for, and wherever else the sheet asks a reader which reading they want. A reading of either category must state which category it is and what that category presumes, and each must be judged only against its own category's published line — never the other's.

Out of scope: changing which criteria and which category the sheet's existing cleared-criteria count is taken over, adding a third comfort category the method does not use, and changing how either category's figures are computed. The arithmetic behind both categories already exists and is unchanged by this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Survey the design space against the stricter category (Priority: P1)

A reader assessing a dwelling for sensitive occupants opens a design space survey, sweeps two controls, and wants the ground cut for the stricter category's overheating criterion rather than the normal-expectation one. They pick the stricter category from the same list of readings they already pick from, and the ground, its contours, its spot heights and its readings all answer that category.

**Why this priority**: This is the reader's own case and the one that cannot be worked around today. Every other story exists to make this reading trustworthy once it can be chosen.

**Independent Test**: Cut a design space survey for the stricter category's version of an overheating criterion and confirm the ground, every spot height and every figure lettered beside it are computed against that category's comfort line — verifiable by comparing against the same ground cut for the other category, which must differ wherever the two lines separate the result.

**Acceptance Scenarios**:

1. **Given** a run that can answer the TM59 criteria, **When** the reader opens the list of readings a survey can be cut for, **Then** the stricter category's versions of the category-bearing criteria appear as choices alongside the existing ones, each naming its category.
2. **Given** the reader picks the stricter category's criterion, **When** the survey completes, **Then** every spot height, contour and reading on that ground is computed against the stricter category's own comfort line.
3. **Given** a ground already surveyed for one category, **When** the reader switches to the other category's version of the same criterion, **Then** the ground redraws for the newly chosen category with no figure left over from the previous one.

---

### User Story 2 - Draw the stricter category's own published line, never the other's (Priority: P1)

A reader surveying against the stricter category expects the published threshold drawn across the ground to be the one belonging to that category. A survey cut for one category must never have the other category's line drawn across it, and must never leave a category's line undrawn because it was filed under the other.

**Why this priority**: This is the one place the feature can be silently wrong. Both categories publish the same numeric limit, so a line taken from the wrong category would sit at exactly the right height and look perfectly correct while citing a criterion the ground does not answer. That is worse than the status quo, because today the reader at least knows they are eyeballing.

**Independent Test**: Cut a survey for each category's version of a category-bearing criterion, and confirm that in each case the threshold line drawn and named on the ground is the published target belonging to that same category, and that no target belonging to the other category is drawn or named.

**Acceptance Scenarios**:

1. **Given** a survey cut for the stricter category's criterion, **When** the published threshold is drawn across the ground, **Then** the line drawn is that criterion's threshold **at the stricter category**, and it is named as such.
2. **Given** a survey cut for the normal-expectation category's criterion, **When** the published threshold is drawn, **Then** no threshold belonging to the stricter category is drawn or named on that ground.
3. **Given** a reader is chasing a standard while a category-bearing reading is plotted, **When** the survey narrows to that standard's line, **Then** the line it narrows to is the one matching both the criterion and the plotted category.

---

### User Story 3 - Sweep one control against the stricter category (Priority: P2)

A reader wants to see how one control moves the stricter category's result — how much shading, glazing or ventilation it takes to bring a sensitive dwelling inside the criterion. They pick the stricter category as the metric a study is swept for, exactly as they pick any other reading.

**Why this priority**: The study card is the other surface where a reading is chosen, and a reader who can survey a two-control ground against the stricter category but cannot sweep a single control against it would have to open a survey to answer a one-dimensional question.

**Independent Test**: Sweep any sweepable control with the stricter category's criterion selected as the study metric, and confirm the curve, its end figures and its card lettering are all computed and named at that category.

**Acceptance Scenarios**:

1. **Given** a run that can answer the TM59 criteria, **When** the reader opens the study metric chooser, **Then** the stricter category's criteria are offered alongside the existing ones, each naming its category.
2. **Given** the stricter category's criterion is chosen as the study metric, **When** the sweep completes, **Then** every sampled point on the curve is computed against the stricter category's comfort line.
3. **Given** a sweep the sheet cannot answer for a TM59 criterion (for example, a run that is not a summer run), **When** the stricter category's criterion is chosen, **Then** the sheet refuses it with the same stated reason and the same suggested fix it already gives for the existing category.

---

### User Story 4 - Know which category a reading is, and what it presumes (Priority: P2)

A reader looking at any TM59 figure — on a curve, on a ground, on a chooser, in a shared link's restored state — needs to see which category produced it and what that category presumes about who lives in the building, because the two categories carry the same published limit and differ only in the line behind it.

**Why this priority**: A figure that does not name its category is unusable for the reader's purpose: the whole point is that the stricter category is the one the project has to meet, and two readings of the same criterion, at the same limit, differing by a degree, cannot be told apart by the number alone.

**Independent Test**: With each category's version of a criterion selected in turn, confirm that every place the reading is named — the chooser, the plotted axis or card, and any sentence describing the reading — states the category, and that the presumption behind the category is available in place on the sheet.

**Acceptance Scenarios**:

1. **Given** either category's version of a category-bearing criterion is selected, **When** the reader reads the name of that reading anywhere it appears, **Then** the category is named as part of it.
2. **Given** the stricter category is selected, **When** the reader looks for what that category presumes, **Then** the sheet states it (dwellings for thermally sensitive and fragile occupants) in place, without depending on hover.
3. **Given** the criterion that carries no category (because its limit is the same fixed temperature for both), **When** the reader opens any list of readings, **Then** it is offered exactly once, with no category attached to it, and is not duplicated per category.

---

### User Story 5 - Share and restore a reading at either category (Priority: P3)

A reader sends a colleague a link to a survey or a study they cut against the stricter category. The colleague opens it and gets that same reading at that same category. Links shared before this feature existed keep meaning exactly what they meant.

**Why this priority**: A reading that cannot be shared is an anecdote, and the sheet's whole shareability claim rests on a link reproducing the same drawing and the same numbers. It is P3 only because it follows automatically once a category-bearing reading is a first-class choice.

**Independent Test**: Cut a survey or study at each category, copy the link, open it fresh, and confirm the restored reading is the same reading at the same category; then open a link created before this feature and confirm it restores the same reading it always did.

**Acceptance Scenarios**:

1. **Given** a survey or study cut for the stricter category, **When** the reader shares the link and it is opened elsewhere, **Then** the restored sheet shows the same reading at the same category.
2. **Given** a link created before this feature, which names a TM59 reading with no category distinction, **When** it is opened after this feature ships, **Then** it restores the same reading it named before — the normal-expectation category — rather than being refused or silently switched.
3. **Given** a link naming a reading the sheet cannot honour, **When** it is opened, **Then** it is refused whole with the reason stated, as any unhonourable link already is.

---

### Edge Cases

- **A run cannot answer a criterion at all** (no summer period, nobody home, no weather file to build the adaptive line from): the stricter category's reading states the same absence, with the same fix, that the existing category's reading already states. It is an em dash with a reason, never a zero.
- **The two categories give the same number** for a given design, which happens wherever no hour falls between the two lines: both readings are shown as measured, and neither is presented as confirming the other. Equal figures are a measurement, not an agreement.
- **The criterion with no category** (its limit is the same fixed temperature at both categories) stays a single reading and gains no category-bearing twin, so a reader is never asked to choose a category for a criterion that does not have one.
- **The sheet's cleared-criteria count** stays scoped to the criteria and the category it is already taken over, and goes on saying so in full. Readings at the stricter category stand outside that count exactly as they do today, so choosing one as a plotted metric does not change what the count means.
- **Improving direction**: each newly offered reading declares which way is better (fewer exceedance hours, fewer hot nights), so the survey's descent and its improving region behave for the stricter category exactly as they do for the existing one, rather than refusing them.
- **The stricter category's reading on a ground where every measured design fails** (likely, since it is the stricter line): the survey states which side of the line the whole ground is on, as it already does for any threshold that crosses no measured ground.
- **A reader switches category on ground already surveyed**: the switch must not invalidate or discard runs that have already been made, since both categories are read from the same simulated period.
- **Both categories plotted at once**: not offered. A reader chooses one reading at a time, as they already do for every other reading on the roster.
- **Copy and layout at 390 px**: two more entries in every reading chooser, each carrying a category in its name, must remain readable at phone width without hover and without horizontal scrolling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The roster of readings the sheet can report MUST include, for each TM59 criterion that TM59 states by category, a reading at **each** of the two published categories.
- **FR-002**: Each category-bearing reading MUST be offered wherever the sheet asks a reader to choose a reading — at minimum the metric a study sweeps and the reading a design space survey cuts its ground for — on the same terms as every other reading on the roster.
- **FR-003**: Every figure produced for a category-bearing reading MUST be computed against that reading's own category's published comfort line and night-time limit, and against no other.
- **FR-004**: Every place a category-bearing reading is named MUST state its category as part of the name, so two readings of the same criterion can never be told apart only by their figures.
- **FR-005**: What a category presumes about its occupants MUST be available in place on the sheet for a reader looking at a reading of that category, without depending on hover.
- **FR-006**: A published threshold drawn for a category-bearing reading MUST be the published target for that same criterion **and** that same category; a target belonging to the other category MUST NOT be drawn, named, or counted for that reading.
- **FR-007**: Where a target's category cannot be decided against the plotted reading's category, the sheet MUST refuse rather than draw the line, by the same rule that already governs a threshold whose qualifier cannot be decided.
- **FR-008**: The criterion whose published limit is the same for both categories MUST remain a single reading carrying no category, and MUST NOT be duplicated per category.
- **FR-009**: Each newly offered reading MUST declare which direction is an improvement, so the survey's descent, its improving region and any ranking that needs a direction behave for it as they do for the existing category's reading.
- **FR-010**: A reading that a run cannot answer MUST report its absence with a stated reason and a stated fix, identical in kind to the absence already reported for the same criterion at the existing category, and MUST stay out of every total.
- **FR-011**: A shared link MUST carry which reading, at which category, a study or survey was cut for, and restore exactly that reading and category.
- **FR-012**: A link created before this feature, naming a TM59 reading that carried no category distinction, MUST continue to restore the reading it named — the normal-expectation category — and MUST NOT be refused or silently reinterpreted as the other category.
- **FR-013**: The sheet's cleared-criteria count MUST keep its current scope and keep stating that scope in full; readings at the stricter category MUST stand outside it, as they do today.
- **FR-014**: Adding these readings MUST NOT change any figure the sheet reports today for the existing category, for the criterion carrying no category, or for the compliance board, which already letters both categories.
- **FR-015**: Choosing between the two categories for the same criterion MUST NOT require more simulation than the sheet already does for that criterion, since both categories are read from the same simulated period.
- **FR-016**: Every newly offered reading MUST be readable and selectable at 390 px wide, without hover and without horizontal scrolling.
- **FR-017**: A declaration that offers a reading at a category the method does not state, or a reading by category with no category named, MUST fail loudly at load rather than be drawn.

### Key Entities

- **Comfort category**: one of the two thermal expectations TM59 publishes — the stricter one for thermally sensitive and fragile occupants, the other for all other dwellings. Carries the offset that places its adaptive comfort line, the fixed night-time limit for the night criterion, and the sentence stating what it presumes about occupants.
- **Criterion**: one of TM59's stated overheating criteria. Some are stated **by category** (their pass condition is read against a category's line or night limit); at least one is not (its limit is the same fixed temperature for both).
- **Reading**: one selectable thing the sheet reports and a study or survey can be plotted against. For a criterion stated by category, a reading is the pairing of criterion and category; for a criterion stated without one, the criterion alone.
- **Published target**: a standard's published pass/fail figure for a criterion, qualified by the category it is read at where the criterion is stated by category. A target is matched to a reading on criterion **and** category.
- **Cleared-criteria count**: the sheet's existing count of how many criteria in a stated scope cleared their limit. Its scope is unchanged by this feature and continues to be stated in full wherever it is lettered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader assessing a sensitive dwelling can cut a design space survey judged against the stricter category without leaving the sheet, doing any arithmetic of their own, or comparing against a result computed for the other category.
- **SC-002**: Every TM59 criterion the method states by category is selectable at both published categories, and the criterion stated without one is selectable exactly once — with no criterion missing a category and none carrying a category it does not have.
- **SC-003**: For every pairing of a published standard's target with a plotted reading, the target drawn is the one matching both the criterion and the category — verified exhaustively across every target and every reading, with no unmatched or cross-matched pairing.
- **SC-004**: Switching between the two categories on ground or a curve already produced costs no additional simulation runs.
- **SC-005**: Every figure the sheet reports today is byte-identical after this change for the existing category, for the criterion carrying no category, and for the compliance board.
- **SC-006**: Every link produced before this change restores the same reading it restored before, and every link produced after it restores the reading and category it names.
- **SC-007**: 100 % of places a TM59 reading is named state its category where it has one, checked in both unit systems and at 390 px width.
- **SC-008**: A reader who has only the drawing in front of them can tell which category a ground or curve was cut for, without consulting the link, the chooser or any other surface.

## Assumptions

- **Readings are offered per category, not behind a category switch.** The stricter category's criteria appear as their own entries in the reading roster, the way the compliance board already letters the two categories as their own rows, rather than as a separate control that re-reads whichever TM59 reading is selected. This keeps one reading selected at a time, keeps a shared link naming exactly one reading, and adds nothing to the desk that has to be encoded separately. If the reader would rather have a single category selector applying to whichever TM59 reading is plotted, that is a different design and this spec should be revisited before planning.
- **The cleared-criteria count does not move.** It stays over the criteria and the category it is taken over today, and it stays outside the scope of this feature. Making it switchable is a change to what the sheet claims about compliance and would need its own request.
- **No third category.** Only the two categories the method states are offered; the third category published elsewhere for existing buildings stays unoffered, as today.
- **Both categories are read from the same run.** The stricter category needs no simulated output the existing category does not already need, so no new run contents, no new output requests and no additional engine cost are assumed.
- **The comfort-line arithmetic is unchanged.** Both categories' lines, clamps and night limits are already derived and checked at load; this feature consumes them and does not restate them.
- **Both categories publish the same numeric limit** for the criteria in question, which is exactly why every requirement above about naming and matching on category is load-bearing rather than cosmetic.
- **Existing thresholds on the survey ground** (the published-line feature already on the sheet) are the mechanism the new readings' lines are drawn by; this feature widens what that mechanism matches, it does not introduce a second way to draw a line.
