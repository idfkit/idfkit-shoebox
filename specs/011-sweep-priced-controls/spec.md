# Feature Specification: Sweep the priced controls

**Feature Branch**: `78-priced-sweeps`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Sweep the priced controls (issue #78). A reader asked: How come I can't create a sweep for the Heating Plant efficiency (Gas Boiler or Heat Pump)? Scope chosen by the maintainer: studies and surveys."

## Context

A reader filed issue #78 from the sheet, standing on a survey of wall U-value against south glazing read for carbon, with the heating plant set to a gas boiler:

> How come I can't create a sweep for the Heating Plant efficiency (Gas Boiler or Heat Pump)?

The answer today is a rule, and the rule was right for the reason it was written and wrong about what it concluded.

The Plant channel (seasonal efficiency, heat pump COP, cooling COP) and the Tariff channel (electricity price, gas price, grid intensity) **price** a run rather than shape it. Nothing they own reaches the model, so turning one of them never starts a run: the bill is recomputed from the meters already in hand. Because of that, the sheet withholds the Study offer on every face of both channels, refuses them as axes of a survey (spec 006, FR-004), and leaves them out of the pull. The stated reason is that a sweep of one "could only redraw the numbers already on the sheet", or that a ground cut along one "would be the same building at every position".

The second half of that is true and the first half is not. It **is** the same building at every position, which is exactly why the sweep is cheap: one run's meters, priced at each position, give the whole curve with no further engine time. But the numbers at the other positions are not on the sheet. A reader who wants to know how much a condensing boiler buys against a better wall, or at what grid intensity a heat pump stops paying for itself, has no way to see it other than dragging a slider and remembering what the bill said.

That is the question this feature answers, and it is the question a building designer asks first: **fabric or plant**.

### What moves with what

A priced control moves some bill readings and not others, and which ones is a fact about the arithmetic, not about the stance:

| Priced control | Energy use intensity | Cost | Carbon |
| --- | --- | --- | --- |
| Seasonal efficiency (boiler, direct electric) | moves | moves | moves |
| Seasonal COP (heat pump) | moves | moves | moves |
| Cooling COP | moves | moves | moves |
| Electricity price | cannot move | moves | cannot move |
| Gas price | cannot move | moves | cannot move |
| Grid intensity | cannot move | cannot move | moves |

Every other reading on the roster (zone temperatures, heating and cooling demand, overheating hours, peak loads, the three TM59 criteria) is read before the plant and the tariff are applied, so no priced control can move any of them.

"Cannot move" is structural: at every stance, on every building, the reading is the same at every position. That is different from a pairing that **can** move a reading and happens not to at this stance (a cooling COP on a building that never cools, a gas price on a desk heated by a heat pump), which is a measurement and is reported as one.

### The objections, and what survives them

These were put to the feature before it was specified, and are recorded because each one shaped a requirement.

- **"A priced curve is trivial arithmetic."** Against efficiency, carbon is a hyperbola; against grid intensity, a straight line. On a lone study card that is nearly true, and what the reader gains is scale: how steep the plant is beside the fabric studies, and where the published landmarks fall on it. On a ground it is false. The shaping axis changes how much heat there is to supply, so the priced axis's slope changes along it and the contours bend. That bend is the trade, and no single slider shows it.
- **"Every figure must be read off the model."** Principle III admits arithmetic over the run, and the bill already letters exactly this arithmetic from exactly these meters. A priced position is what the bill would say with the desk standing there (FR-012).
- **"A spot height is one completed run."** Spec 006 FR-007 promises it, and the survey letters coverage as designs measured. With a priced axis, several spot heights share one run. The objection does not defeat the feature, but it does bind the wording: the sheet must never letter a count of designs as a count of runs (FR-026 to FR-028).
- **"A flat line reads as a finding."** Efficiency against heating demand would draw a confident horizontal line that says nothing about the building. So those pairings are refused rather than drawn (FR-003).
- **"The pull ranks what is pulling the building, and a tariff is not the building."** This one holds. The pull keeps leaving priced controls out (FR-021); a reader who wants the plant against the fabric cuts a ground along both.

## Clarifications

### Session 2026-09-14

- Q: Does the pull rank priced controls? → A: No. The pull keeps leaving them out. It answers what is pulling the building, and a price or a grid intensity is not the building. Studies and surveys carry them; the pull does not.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Study a plant efficiency (Priority: P1)

The reader from issue #78 has a gas boiler on the desk at 0.85 and the study reading set to carbon. They press Study on the seasonal efficiency. A curve of carbon against efficiency stands across the whole face, from 0.50 to 1.05, at once, because it is the one run already solved priced twenty-one ways. The redline tick stands on 0.85. The landmarks (old atmospheric, non-condensing, condensing) are read against the curve the same way they are on any other study. They drag the efficiency to 0.92 and the tick walks along the curve; nothing re-runs.

**Why this priority**: This is the issue as filed, and the smallest change that answers it.

**Independent Test**: On a desk with System in and a boiler, press Study on the seasonal efficiency with carbon chosen, and confirm the curve appears without any engine run beyond the one the desk already needed, that each point equals what the bill letters when the slider is set to that position, and that walking the slider moves only the tick.

**Acceptance Scenarios**:

1. **Given** a desk whose System channel is in and whose heating plant is a gas boiler, **When** the reader presses Study on the seasonal efficiency, **Then** a curve of the chosen bill reading is drawn across the control's full face.
2. **Given** that curve, **When** any position on it is checked, **Then** its figure equals the figure the bill letters with the desk set to that position, to the lettered precision.
3. **Given** a study of a priced control whose run is already cached, **When** it is opened, **Then** no engine run is started for it.
4. **Given** a study of a priced control, **When** the reader moves that same control, **Then** the tick walks along the curve and the curve is neither re-swept nor marked stale.
5. **Given** a study of a priced control, **When** the reader moves a shaping control (a U-value, a setpoint), **Then** the curve goes stale and re-sweeps by the rule every study already follows, at the cost of the one run the new shape needs.
6. **Given** studies of the heat pump COP and the cooling COP, **When** each is opened on a desk where that face is live, **Then** each draws by the same rules.

---

### User Story 2 - Refuse a pairing that cannot move (Priority: P1)

The same reader switches the study reading to heating and cooling demand. The efficiency study does not redraw as a flat line. It stands refused, saying that the plant is applied after the demand is read, so no efficiency can change it, and naming the readings that it can change. The electricity price, studied for carbon, is refused the same way, naming cost.

**Why this priority**: Without it, User Story 1 draws flat lines that read as findings ("efficiency does nothing to demand") when they are tautologies. That is a figure the sheet did not measure, which the survey spec and the constitution both forbid.

**Independent Test**: For each of the six priced controls, choose each reading on the roster and confirm that every pairing marked "cannot move" in the table above is refused with a sentence naming what the control can move, and every pairing marked "moves" draws.

**Acceptance Scenarios**:

1. **Given** a study of a priced control, **When** the chosen reading is one the control cannot move, **Then** the study is refused in place with a sentence saying why and naming the readings it can move, and no curve is drawn.
2. **Given** a refused pairing, **When** the reader chooses a reading the control can move, **Then** the curve is drawn without any engine run the desk has not already made.
3. **Given** a pairing that can move a reading and does not at this stance (a cooling COP on a building that never cools), **When** it is studied, **Then** a flat curve is drawn and stated as not moving the reading here, which is a measurement and is not refused.

---

### User Story 3 - Cut the ground between fabric and plant (Priority: P1)

The reader opens E-02 and cuts a ground along wall U-value and seasonal efficiency, read for carbon. The U-value axis is run, eleven designs on the coarse pass; the efficiency axis costs nothing, because every row along it is the same eleven runs priced again. The relief stands as quickly as a one-axis study would. The contours now say the thing the reader wanted to know: how much boiler efficiency buys the same carbon as a step of insulation. They stand on a point in the condensing band and the desk moves there, bill and all.

**Why this priority**: This is the trade the issue was reaching for, and it is the scope the maintainer chose.

**Independent Test**: Cut a ground along one shaping control and one priced control, and confirm that the number of engine runs equals the number of positions on the shaping axis, that every spot height equals the bill at that design, and that standing on a point moves both controls.

**Acceptance Scenarios**:

1. **Given** the survey chooser, **When** the reader looks for a priced control as an axis, **Then** every numeric face of Plant and Tariff is offered by the same rules as any other control, and refused by the same rules where its face is withdrawn.
2. **Given** a ground with one shaping axis and one priced axis, **When** it is measured, **Then** the engine runs only at the positions of the shaping axis, and the priced axis is filled by pricing those runs.
3. **Given** a ground with both axes priced (efficiency against grid intensity, read for carbon), **When** it is measured, **Then** the whole ground is one run.
4. **Given** a ground with a priced axis, **When** a reading that axis cannot move is chosen, as the first or the second reading, **Then** it is refused in the chooser with the same sentence the study gives, and a ground is not cut.
5. **Given** a measured point on a ground with a priced axis, **When** the reader stands on it, **Then** the desk moves to that design through the same commit any gesture uses, the priced control included, and the bill, the schedule and the link follow.
6. **Given** a ground with a priced axis, **When** the reader lets the design fall, **Then** each step along the priced axis is a measured position (a priced one) and the descent follows every rule of spec 006 unchanged.

---

### User Story 4 - The tariff moves under a priced sweep (Priority: P2)

A study of seasonal efficiency is up, read for cost. The reader takes the Tariff strip to Assumed and turns the gas price up. The efficiency curve re-prices in place at the new gas price: every point moves, no run starts, and the curve is not marked stale. The same holds for a survey with a priced axis, and for a study of the gas price itself when the efficiency moves.

**Why this priority**: The sheet already re-prices every shaped study when a priced control moves (spec 004, FR-020). A priced study that did not follow would be the one curve on the sheet lettered at a price the desk no longer shows.

**Independent Test**: With a priced study and a priced survey up, move each other priced control and confirm every figure equals the bill at that position under the new setting, with zero engine runs.

**Acceptance Scenarios**:

1. **Given** a study of one priced control, **When** a different priced control moves, **Then** the curve is re-priced at every position under the new setting, without an engine run and without being marked stale.
2. **Given** a survey with a priced axis, **When** a priced control that is not one of its axes moves, **Then** every spot height is re-priced the same way.
3. **Given** a study of a priced control, **When** the swept control's own face is withdrawn (the heating plant switched from a boiler to a heat pump under a study of seasonal efficiency, or the tariff taken back to Published under a study of the electricity price), **Then** the study stands refused with that face's own reason, as any study does whose control is withdrawn, and returns when the face does.

---

### User Story 5 - Send someone the plant study (Priority: P2)

The reader copies the link and sends it. The recipient opens the same desk with the efficiency study up and the U-value by efficiency ground cut, and after their own run the same figures at the same positions.

**Why this priority**: Principle II is non-negotiable; a study that cannot ride the link is a screenshot. It is P2 only because the study must exist first.

**Independent Test**: Round-trip a link carrying a priced study and a survey with a priced axis, and confirm both open with identical figures; confirm a link written before this feature still opens exactly as it did.

**Acceptance Scenarios**:

1. **Given** a priced study open, **When** the link is copied, **Then** the study rides it by the same rule every open study does.
2. **Given** a survey with a priced axis, **When** the link is copied, **Then** the axis, its extent and the readings ride it by the same rule every survey does.
3. **Given** a survey link naming a priced axis together with a reading that axis cannot move, **When** it is opened, **Then** the whole link is refused with the same sentence the chooser gives.
4. **Given** a link whose desk-wide study reading is one an open priced study cannot move, **When** it is opened, **Then** the desk opens and that study stands refused with its sentence, exactly as it stood on the desk the link was copied from.
5. **Given** any link that opened before this feature, **When** it is opened after, **Then** it opens to the same desk, studies and survey, with no version change.

---

### Edge Cases

- **Plant is out because System is out.** Plant requires the System channel. With System bypassed, every Plant face is withdrawn, and a study or axis on one is refused with Plant's own reason, as any control on a blocked channel is.
- **A face withdrawn by its own channel's selector.** Seasonal efficiency is live only while the plant is not a heat pump, and seasonal COP only while it is. The electricity and gas prices are live only when the tariff is Assumed, and grid intensity only when the grid factor is. A study or an axis on a withdrawn face is refused with that face's own reason.
- **The heating plant switched mid-survey.** A ground cut along seasonal efficiency when the plant becomes a heat pump stands refused with the reason rather than being redrawn along the COP, which is a different control with a different range.
- **Direct electric heating under a gas price study.** The gas price can move cost and does not here, because nothing burns gas. The curve is drawn flat and stated as not moving cost at this stance.
- **A bill that cannot be priced at all**, because the station has no published rate and the tariff is Published. The study and the ground render their figures as em dashes, stay out of every total, and say why, exactly as the bill does. Nothing is priced from a default.
- **A partial bill**, some lines priced and some not. The same rule as the bill: a total that is not whole is not lettered.
- **Energy use intensity on a desk that is not a whole year.** Already refused on the roster for every study; a priced study inherits that refusal unchanged.
- **Cost across stations.** A priced curve of cost carries its station's currency, and the station change that takes every study down takes these down too.
- **Grid intensity at zero.** Carbon from electricity reads zero there, which is a measurement and is lettered as zero, not as missing.
- **Units.** Every priced axis, tick and extent letters in the reader's chosen system by the rules of spec 010, and a span along a priced face is a difference like any other.
- **A priced study densified.** The coarse and fine passes still exist and still nest, and the fine pass costs no run beyond what the shaped half of the job costs.
- **Choosing two pull entries to cut a ground** can only ever name shaping controls, since priced controls are not on the pull. A priced axis is chosen in the survey chooser.

## Requirements *(mandatory)*

### What can be swept

- **FR-001**: Every numeric face of the Plant and Tariff channels MUST be offered as a study subject and as a survey axis, by the same rules and with the same refusals as any other numeric face.
- **FR-002**: The sheet MUST declare, for each priced control, which readings on the roster it can move, and that declaration MUST agree with the table under "What moves with what". Readings read before the plant and tariff are applied MUST be declared as moved by no priced control.
- **FR-003**: A study or survey pairing a priced control with a reading that control cannot move MUST be refused whole, in place, with a sentence stating why and naming the readings the control can move. No curve or ground MUST be drawn for it.
- **FR-004**: A pairing that can move a reading and moves it by exactly nothing at this stance MUST NOT be refused. A study draws it as the flat curve it measured, lettered like any other curve; a ground states it as flat by spec 006's existing rule for a reading that does not move. No new statement is added to the study card.
- **FR-005**: A priced face that is withdrawn (its channel blocked, or its own condition unmet) MUST be refused as a study subject or axis with that face's own reason, the same sentence the console gives it. The sentence MUST be lettered in view beside the withdrawn face, never only in a hover title (Principle VII).
- **FR-006**: The refusal sentences of FR-003 and FR-005 MUST be one sentence each, so no two surfaces can refuse the same thing for different reasons. The pairing sentence (FR-003) is shared by the study card, the survey chooser, the ground and the survey link decoder. The withdrawn sentence (FR-005) is shared by the console, the survey chooser and the refusal of a position; the link reproduces it rather than refusing (FR-019).
- **FR-007**: Spec 006 FR-004 ("Controls declared on priced channels MUST NOT be axes") is superseded by this feature. The rule that nothing a priced channel owns reaches the model is unchanged.

### What a priced sweep costs

- **FR-008**: A study of a priced control MUST spend no engine run beyond the one its shape needs, which is a single run for the whole curve.
- **FR-009**: A survey with one priced axis MUST spend engine runs only at the positions of its shaping axis. A survey with two priced axes MUST spend one run.
- **FR-010**: Priced controls MUST stay out of the identity of a run, so that moving one never starts a run and never marks any study or ground stale.
- **FR-011**: A priced sweep MUST share runs with studies and surveys of shaping controls through the existing sample cache, so a design already run for any of them is priced rather than re-run.

### What a priced sweep letters

- **FR-012**: Every figure a priced sweep letters at a position MUST equal the figure the bill would letter with the desk standing at that position, computed from the same run's meters by the same pricing the bill uses. There MUST be no second copy of the pricing arithmetic.
- **FR-013**: Priced controls other than the swept one or ones MUST be taken at the desk's current setting, and every priced study and ground MUST be re-priced in place, without an engine run, whenever one of them moves.
- **FR-014**: A study of a priced control MUST treat a move of that same control as a move of its tick, and a survey MUST treat a move of either of its axes as a move of its stance, by the rules both already follow.
- **FR-015**: A position whose bill cannot be priced, or is only partly priced, MUST letter an em dash and stay out of every total, with the reason the bill gives. Nothing MUST be priced from a default or a neighbouring position. This holds when a position that priced stops pricing under a later change of a priced control (a tariff taken back to Published where no rate is published): it MUST become a gap carrying that reason, MUST NOT stay counted as measured, and MUST price again, with no run, when the rate returns.
- **FR-016**: Landmarks on a priced face MUST be drawn against a priced study exactly as landmarks on any face are drawn against its study.

### Moving the desk

- **FR-017**: Standing on a point of a ground with a priced axis and letting the design fall MUST move priced controls through the same commit path every gesture uses, so the bill, the schedule, the description and the link follow.
- **FR-017a**: The traverse MUST remain a record of buildings. A move that changes only priced controls MUST NOT add a stop, and restoring a stop MUST restore the priced settings it was recorded with, by the rules the traverse already follows.

### The link

- **FR-018**: A priced study MUST ride the link by the rule every open study rides it (spec 004, FR-023), and a priced axis by the rule every survey axis rides it (spec 006, FR-043).
- **FR-019**: A survey link naming a pairing refused by FR-003 MUST be refused whole with the same sentence, because no desk can cut that ground. A study link whose desk-wide reading cannot be moved by one of its open priced studies MUST open and reproduce that study standing refused, because the reading is chosen after studies are opened and the desk it describes is reachable; refusing it would make copying the address on a reachable desk produce a link that cannot be opened. A face refused by FR-005 is a fact about the desk and MUST be reproduced as refused, not refuse the link.
- **FR-020**: Every link that opened before this feature MUST open identically after it. Because this feature changes no default, key or range, it MUST NOT bump the link version.

### The pull

- **FR-021**: The pull MUST continue to leave priced controls out of its ranking, and MUST NOT list them as inert entries either, because they are not absent from the building at this stance, they are not the building at all. Where the pull states what it ranks, it MUST say that plant and tariff are not ranked, so a reader does not take their absence for a finding.

### Composition with the rest of the desk

- **FR-022**: A station change MUST take priced studies and grounds down with every other study and ground.
- **FR-023**: Setting studies aside, clearing all studies and Revert all MUST treat priced studies exactly as they treat any study, and the counts the head letters MUST include them.
- **FR-024**: The general notes MUST be updated wherever they state or imply that priced controls cannot be studied or surveyed, and the storage key bumped if a step's meaning changes.
- **FR-026**: Spec 006 FR-007 is amended: a point drawn as measured MUST correspond to one completed run, priced at its position where an axis is priced. Several points MAY share one run, and only positions on priced axes may share one.
- **FR-027**: Wherever a study, a survey or the pull letters a count, it MUST say what it counts. A count of measured designs MUST NOT be lettered as, or beside words implying, a count of engine runs; where the two differ, both MUST be stated.
- **FR-028**: Any sentence that states a run cost ("one run per control", "every step a genuine run") MUST remain true for priced positions, or be reworded where they appear.
- **FR-029**: The architecture notes (the priced-channels and survey sections of the design notes, and the short form in CLAUDE.md), the design system where a new refusal pattern is drawn, and the changelog MUST be updated in the same change.

### Key Entities

- **Priced control**: A numeric face on a channel that prices the run. Carries the set of roster readings it can move.
- **Reach**: The declaration, per priced control, of which readings it can move. The single source for FR-003's refusal and for which pairings are offered.
- **Priced position**: One position of a priced control on a study or an axis. Identified by the run it prices (shared with every other position on the same shape) and the value it prices that run at.
- **Reading**: The existing roster declaration, reused unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A study of any priced control, on a desk whose shape has already been run, draws its full curve with zero additional engine runs, counted.
- **SC-002**: A survey of one shaping axis of *n* positions against one priced axis costs exactly *n* engine runs on its coarse pass, and a survey of two priced axes costs exactly one, counted.
- **SC-003**: For every priced control and every reading it can move, at every position of a 21-point study on at least 3 desks (boiler, heat pump, Assumed tariff), the lettered figure equals the bill's figure at that position: 0 disagreements.
- **SC-004**: For all 6 priced controls against all 11 roster choices (66 pairings), every pairing the "What moves with what" table marks as unable to move is refused with a sentence and every other pairing draws: 66 of 66 correct.
- **SC-005**: Moving any priced control with a priced study and a priced ground up re-letters both within one frame of the bill re-lettering, with zero engine runs.
- **SC-006**: A link carrying a priced study and a priced axis opens on another browser to identical figures at identical positions; every link in a sample of at least 10 links written before this feature opens byte-identically.
- **SC-007**: The reader from issue #78 can, from their own desk and without assistance, draw carbon against seasonal efficiency and cut a ground of U-value against seasonal efficiency in under 1 minute.
- **SC-008**: On a ground with a priced axis, every count the survey letters is checked against the scheduler's own counts of designs and engine runs: 0 counts lettered as the wrong one.

## Assumptions

- **The roster is unchanged.** No reading is added; the three bill readings (energy use intensity, cost, carbon) are the ones a priced control can move.
- **Priced sweeps use the controls' declared faces**, their full ranges and step grids, and their existing landmarks. No range is widened or narrowed.
- **The heating plant selector stays unsweepable.** It is a choice between fuels, not a face, and switching it is how a reader compares a boiler with a heat pump. A boiler efficiency and a heat pump COP are different controls on different ranges and are never joined into one axis.
- **One run per shape is the whole cost.** Pricing a run at a position is arithmetic over a handful of meter totals and is treated as free next to an engine run.
- **Withdrawn is the existing rule.** A priced face whose condition becomes unmet under an open study behaves exactly as any other withdrawn face under an open study does today.
- **Currency and station rules are inherited** from spec 004 (FR-020) unchanged.
- **The traverse records buildings, not prices.** It already adds no stop for a priced move and settles a stop's readings once; this feature keeps both rules (FR-017a).

## Out of scope

- Sweeping the heating plant selector, the tariff basis or the grid factor basis.
- New plant or tariff controls, and any change to how the bill prices a run.
- Any priced reading that is not already on the roster (a simple payback, a lifecycle cost, a cost of carbon).
- Joining a boiler efficiency and a heat pump COP into one "plant performance" axis.
