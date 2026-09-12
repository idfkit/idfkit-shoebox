# Feature Specification: SI and IP Units

**Feature Branch**: `010-si-ip-units`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "One toggle to change all the numbers on the deck from SI to IP units. All the modeling in the background is in SI, but the sliders, results, etc. can be whatever the user prefers. This makes shoebox.idfkit.com as relevant for an engineer in the US as one in Europe."

## Context

The desk already leans toward a US reader and then makes them convert. The default building is 15.24 m by 15.24 m by 4.572 m, which is 50 ft by 50 ft by 15 ft. The default roof is 5.456 m²K/W, which is R-31. A dozen landmarks are imperial figures carried into SI: "R-13 stud cavity", "R-30 above deck", ASHRAE 90.1 lighting allowances published in W/ft², ASHRAE 62.1 densities published per 1,000 ft². An engineer in the US reads each of these backwards through a conversion they have to do in their head, and the readings they would take to a client (an energy intensity, a peak load, a U-factor) arrive in units their codes and their colleagues do not use.

EnergyPlus works in SI, and so does everything this sheet hands to it. That does not change. What changes is only how the sheet letters a number for the reader and how it reads a number the reader types.

Two constraints from the constitution shape everything below.

- **The choice of units is lettering, not model.** Principle II forbids anything outside the link from reaching the document. The unit system therefore MUST NOT change a byte of the IDF, a run, or a result. It changes what the page draws.
- **Every figure is still read back off the model.** Principle III holds in both systems: an IP figure is the SI figure the document or the run holds, converted at the moment it is lettered. There is no second copy of any value kept in IP.

## Clarifications

### Session 2026-09-11

- Q: Do figures inside landmark notes and citations convert with the toggle? → A: No. The toggle covers readings, controls, scales, band edges and drawings. A note keeps its source's own figure, and the conversion it already states, whichever system is showing.
- Q: When a link is shared, which units does the recipient see? → A: Their own remembered choice. The link stays neutral and carries no unit system.
- Q: Which system does a reader see before they have chosen? → A: IP when the browser reports a United States region, SI otherwise.
- Q: A box lettering resistance in IP shows "R-20", which is a prefix rather than a trailing unit. Is that spelling accepted when the reader types it? → A: Yes. Whatever a box letters, the reader can retype and get back, so the prefix is read on the way in as well as written on the way out.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the whole sheet in IP (Priority: P1)

An engineer in the US opens the sheet, finds the units toggle, and switches to IP. Every number on the page is re-lettered at once: the building reads 50 ft by 50 ft by 15 ft, the roof reads R-31, the glazing reads its U-factor in Btu/h·ft²·°F, setpoints read in °F, the design day's temperatures read in °F, and the energy intensity reads in kBtu/ft²·yr. Nothing re-runs, and no reading changes its meaning. They switch back and the SI sheet is exactly as it was.

**Why this priority**: this is the request in its smallest useful form. A reader who can only read IP is served by this story alone, even before they can type in IP.

**Independent Test**: at the default desk and at three other desk positions, switch to IP and walk every strip, reading, table, drawing, study and survey on the sheet. Confirm that every dimensioned figure is in IP (outside the exceptions this spec names), that each converts correctly from the SI figure it replaces, that no run started, and that switching back restores the SI sheet exactly.

**Acceptance Scenarios**:

1. **Given** the sheet in SI, **When** the reader switches to IP, **Then** every control value, scale end, landmark band, reading, table, drawn dimension, datum line, study axis and survey axis is re-lettered in IP in place, and the toggle states in words which system is showing.
2. **Given** the sheet in IP, **When** the reader switches back to SI, **Then** the sheet reads exactly as it did before the first switch.
3. **Given** any desk, **When** the reader switches units in either direction, **Then** no run starts, no reading is marked stale, and the IDF the sheet would hand to the engine is byte-identical to the one before the switch.
4. **Given** a run in flight with dimmed readings on the sheet, **When** the reader switches units, **Then** the dimmed readings are re-lettered and stay dimmed, and the run lands in the newly chosen system.
5. **Given** a reading with no data behind it, **When** the sheet is in IP, **Then** it still reads as an em dash, never as a converted zero.

---

### User Story 2 - Set the model in IP (Priority: P1)

The same engineer now works the desk in IP. They drag the width and it moves through figures they would draw (48 ft, 49 ft, 50 ft), not 49.97 ft. They type "60" into the width's margin box and get 60 ft. They type "20" into the wall's resistance and get R-20. They share the link with a colleague, reload the page, and switch to SI and back, and the width still reads 60 ft and the wall still reads R-20.

**Why this priority**: reading in IP without being able to set in IP leaves the reader converting on the way in, which is half of the problem the request names.

**Independent Test**: in IP, set every control on the desk to at least three positions by dragging and by typing, including each scale end and a position inside each landmark band. For each, reload the page, open the shared link in a fresh browser set to IP, and switch units there and back. Confirm the value reads identically in IP every time and that the IDF matches the SI value the control holds.

**Acceptance Scenarios**:

1. **Given** the sheet in IP, **When** the reader drags a control, **Then** the positions it passes through letter as figures at the precision that control is lettered in IP, without figures that only exist because of a conversion (for example 10.01 ft for what the reader set as 10 ft).
2. **Given** the sheet in IP, **When** the reader types a bare number into a margin box, **Then** it is read in the IP unit that box letters.
3. **Given** either system, **When** the reader types a number followed by a unit of either system that the box's quantity accepts (for example "3 m" while in IP, or "10 ft" while in SI), **Then** it is read in the unit named, and the box letters the result in the system showing.
4. **Given** a box that letters its value with a prefix (resistance in IP, which reads "R-20"), **When** the reader selects the box and retypes exactly what it said, **Then** the value is read back unchanged rather than refused.
5. **Given** either system, **When** the reader types a unit that does not belong to the box's quantity, **Then** the value is refused whole and the box puts the model's value back, as it does today for text that is not a number.
6. **Given** a value set in IP, **When** the page is reloaded, the link is opened elsewhere, or units are switched there and back, **Then** the value letters identically in IP.
7. **Given** a control whose range ends are not round figures in IP (the width's 4 m minimum is 13.12 ft), **When** the reader drags to an end, **Then** the end is reachable and letters its exact converted limit.

---

### User Story 3 - Landmarks, standards and verdicts in IP (Priority: P2)

The engineer drags the wall's resistance and watches the landmarks it passes. In IP the bands read in R-values, and "R-13 stud cavity" now sits on the scale at R-13 rather than at 2.29. Their chosen standard's targets read in kBtu/ft²·yr, and the verdict against each target is the same one an SI reader sees.

**Why this priority**: landmarks and standards are where the sheet makes claims about the world, and those claims were largely published in IP to begin with. It depends on story 1 and adds no new interaction.

**Independent Test**: in both systems, drag every control with landmarks across its full range. Confirm that every band is reachable, lights at the same positions in both systems, and letters its edges in the system showing. Apply each standard and confirm every verdict and every "how far over" figure is identical in meaning across systems.

**Acceptance Scenarios**:

1. **Given** the sheet in IP, **When** a control with landmarks is dragged, **Then** each band is reachable on the IP positions and the band lit at a given model value is the same band that is lit in SI.
2. **Given** a standard applied, **When** units are switched, **Then** its verdicts do not change and its targets and margins are re-lettered in the system showing.
3. **Given** a landmark or standard whose source publishes its figure in the other system, **When** its note is read, **Then** the note reads the same in both systems: it cites the source's own figure as published, with the conversion it already states (for example "0.64 W/ft², which is 6.89 W/m²").

---

### User Story 4 - The choice follows the reader (Priority: P2)

The engineer closes the tab and comes back tomorrow; the sheet opens in IP without being asked. They send a link to a colleague in Lyon, who opens it and sees the same building lettered in SI, the system they chose. The link says nothing about units, so it is the same link it would have been before this feature.

**Why this priority**: a toggle that has to be pressed on every visit is a toggle a daily reader stops trusting. It depends on story 1.

**Independent Test**: choose IP, reload, close and reopen the browser, and confirm the sheet opens in IP. Share a link and open it in a second browser that has never visited, and in a third that last chose SI. Confirm the second opens in its region's default and the third in SI, and that the link is byte-identical to the one the same desk made before this feature. Repeat in a private window where the browser refuses to remember anything.

**Acceptance Scenarios**:

1. **Given** the reader chose a system, **When** they return in the same browser, **Then** the sheet opens in that system.
2. **Given** a reader who has never chosen, **When** they first open the sheet, **Then** it opens in IP when the browser reports a United States region and in SI otherwise.
3. **Given** a reader who remembered a system, **When** they open a link made by a reader who chose the other, **Then** the sheet opens in their own remembered system.
4. **Given** the browser will not let the page remember the choice, **When** the reader switches, **Then** the switch works for the session and the sheet states, beside the toggle, that it will not be remembered.
5. **Given** a link made before this feature, **When** it is opened, **Then** it loads the same desk it always did.

---

### User Story 5 - What leaves the sheet says which units it is in (Priority: P3)

The engineer copies a schedule from the sheet into a report, downloads the run's files, and files a feedback report. The copied table carries the units it was lettered in, named. The run's files are the model EnergyPlus ran, in SI, as they always were. The feedback report records which system the reader was looking at, so a maintainer reproducing it sees the same lettering.

**Why this priority**: small, but a copied table with no unit on it is a figure somebody will misread by a factor of ten.

**Independent Test**: in IP, copy each table the sheet lets a reader copy, download the run's files, and file a feedback report. Confirm each copied table names its units, the model file is byte-identical to one downloaded in SI, and the report states the unit system.

**Acceptance Scenarios**:

1. **Given** the sheet in IP, **When** the reader copies a table or text the sheet offers for copying, **Then** every figure in it carries or sits under the IP unit it was lettered in.
2. **Given** either system, **When** the reader downloads the run's files, **Then** they are byte-identical to the files downloaded in the other system, and the sheet says where it offers them that the model files are in SI.
3. **Given** either system, **When** the reader opens a feedback report, **Then** the report records which unit system the sheet was lettered in.

---

### Edge Cases

- **Temperature and temperature difference**: a setpoint of 21 °C is 69.8 °F, but a 3 K band is 5.4 °F of difference, not 37.4 °F. Every temperature on the sheet is either a temperature or a difference, and each converts as what it is. The two MUST NOT be lettered so they can be confused.
- **Zero words**: a stop that reads as a word ("None", "Sealed", "Empty", "Dark") reads the same word in both systems.
- **Signed quantities**: the balance rail and any other signed reading keep their sign in words and their cold and warm hues in both systems.
- **Switching mid-gesture**: switching units while a slider is held or a margin box is focused with half-typed text does not commit a value. A focused box keeps what the reader typed and reads it in the system showing when it is committed.
- **Switching during a study or survey**: samples already measured are re-lettered and nothing is re-run; the swept positions are the same positions in both systems.
- **Precision**: an IP figure is lettered no more precisely than the SI figure it came from warrants. A reading known to two significant figures in SI is not lettered to five in IP.
- **Quantities with no IP counterpart**: ratios, fractions, air changes, efficiencies, angles, dates, times and money read the same in both systems.
- **Figures the engine wrote**: the engine's own error text, quoted in the sheet or in a report, is left as the engine wrote it, in SI.
- **Narrow screens**: IP units are longer (Btu/h·ft²·°F against W/m²K). At 390 px wide every lettered value and its unit still fit where the SI one did, without clipping and without pushing a reading off its row.
- **Weather and climate**: station elevation, design day temperatures, EPW-derived running means and any other climate figure convert like the rest of the sheet; the station's name, coordinates and WMO number do not change.
- **Priced readings**: tariff rates stay per kWh in the tariff's own currency. The bill's energy totals stay in kWh, which is what a US utility bills electricity in, and only the per-area intensity changes unit.

## Requirements *(mandatory)*

### Functional Requirements

**The toggle**

- **FR-001**: The sheet MUST offer one control that switches every figure on the page between SI and IP. It MUST be reachable from every state the sheet can be in, at 390 px wide, and by keyboard alone, and MUST state in words which system is showing.
- **FR-002**: Switching MUST re-letter every figure in place without starting a run, marking a reading stale, moving a control, or changing the desk.
- **FR-003**: The unit system MUST NOT reach the model. The IDF, every run and every result MUST be byte-identical whichever system is showing.

**What converts**

- **FR-004**: In IP, every control MUST letter its value, its scale ends, its landmark band edges and its margin box in IP.
- **FR-005**: In IP, every reading, results table, the bill's per-area intensity, the balance rail, the schedules, the design day and climate figures, the generated description, standards' targets and margins, the overheating assessment's temperatures, and every study and survey axis and figure MUST be lettered in IP.
- **FR-006**: In IP, every dimension lettered on the drawings (the axonometric, the plan, the section and the title block) MUST be lettered in IP.
- **FR-007**: Each quantity kind MUST convert to the unit named in the Units table below. A quantity kind not in that table MUST NOT appear on the sheet in IP; adding one requires adding its row.
- **FR-008**: Conversions MUST use exact defined factors, and every lettered IP figure MUST equal the SI figure the model or the run holds, converted and then rounded to the precision the IP lettering declares for that quantity.
- **FR-009**: A temperature and a temperature difference MUST be distinct quantity kinds and MUST NOT convert by the same rule.
- **FR-010**: Figures inside explanatory notes and citations MUST NOT change with the unit system. A note cites its source's figure as published, and any conversion it states is part of its text in both systems.

**Entering values in IP**

- **FR-011**: In IP, a control MUST move through positions that letter as round figures at its IP precision, and a value set in IP MUST letter identically in IP after a reload, after the link is opened elsewhere, and after switching units there and back.
- **FR-012**: Every landmark MUST remain reachable, and lit at the same model values, in both systems. A landmark unreachable in either system MUST fail when the declarations load, as an unreachable SI landmark does today.
- **FR-013**: A bare number typed in a margin box MUST be read in the unit that box letters. A number followed by a unit of either system that belongs to the box's quantity MUST be read in that unit. Where a box letters its value with a prefix rather than a trailing unit, that prefix MUST be accepted on the way in too (so "R-20" is a spelling of 20 in a box lettering resistance in IP), because a reader who selects the box and retypes what it says MUST get that value back. Anything else MUST be refused whole, as today.
- **FR-014**: Every scale end MUST remain reachable in both systems and letter its exact converted limit.

**Remembering and sharing**

- **FR-015**: The reader's choice MUST be remembered in their own browser and nowhere else. Where the browser refuses to remember it, the switch MUST still work for the session and the sheet MUST say it will not be remembered.
- **FR-016**: A reader with no remembered choice MUST see IP when the browser reports a United States region, and SI otherwise, including when the browser reports no region. The region decides the lettering only and MUST NOT reach the model, the link or a run.
- **FR-017**: Shared links MUST NOT carry the unit system. A link MUST be byte-identical whichever system its maker had showing, and the recipient MUST see their own remembered choice, or the first-visit default of FR-016. Every link made before this feature MUST open to the same desk it did before.

**What leaves the sheet**

- **FR-018**: Any table or text the sheet offers for copying MUST name the units its figures were lettered in.
- **FR-019**: The run's files and the model MUST stay in SI and be byte-identical in both systems, and the sheet MUST say where it offers them that they are in SI.
- **FR-020**: A feedback report MUST record the unit system the sheet was lettered in.

**Constraints carried from the constitution**

- **FR-021**: A missing reading MUST read as an em dash in both systems and stay out of every total.
- **FR-022**: Nothing in the unit system MAY be explained only on hover. Unit strings MUST stay within the sheet's copy budgets and fit at 390 px.
- **FR-023**: The feature MUST add no run-time dependency beyond those the constitution permits.
- **FR-024**: The toggle MUST follow the design system. Colour MUST NOT be the only carrier of which system is showing.
- **FR-025**: If a step of the general notes mentions a unit, or a new step is added to teach the toggle, the notes, their call sites and the storage key MUST be updated as the constitution requires.

### Units

The IP column is the one the sheet letters. Kinds not listed read the same in both systems.

| Quantity kind | SI | IP |
| --- | --- | --- |
| Length, building scale (dimensions, overhangs, neighbours, elevation) | m | ft |
| Length, small (insulation thickness, slat width, cavity) | m, mm | in |
| Area | m² | ft² |
| Volume | m³ | ft³ |
| Floor area per person | m²/pp | ft²/person |
| Temperature | °C | °F |
| Temperature difference | K | Δ°F |
| Thermal transmittance (U-factor) | W/m²K | Btu/h·ft²·°F |
| Thermal resistance | m²K/W | h·ft²·°F/Btu (lettered R-) |
| Heat gain per person | W/pp | Btu/h·pp |
| Lighting and equipment density | W/m² | W/ft² |
| Peak heating and cooling load | kW | kBtu/h |
| Electrical power (a single appliance) | W | W |
| Solar and radiant flux density | W/m² | Btu/h·ft² |
| Airflow | L/s, m³/s | cfm |
| Air speed and wind | m/s | mph |
| Energy use intensity | kWh/m²·yr | kBtu/ft²·yr |
| Thermal energy (demand, loads) | kWh, MWh | kBtu, MBtu |
| Illuminance | lx | fc |
| Carbon intensity | gCO₂e/kWh | lb/MWh |
| Billed energy | kWh | kWh |
| Test pressure | Pa | Pa |
| Degree days | HDD18, CDD10 | HDD18, CDD10 |

Unit strings carry no whitespace, because the copy budgets count words: a temperature difference letters `Δ°F` and a metabolic rate `Btu/h·pp`. Degree days keep their Celsius bases in both systems: the base temperature is part of the published statistic, so converting the count while the label still says 18 would be arithmetic nobody can check, and relabelling it would claim a figure this page did not compute.

### Key Entities

- **Unit system**: the reader's choice, SI or IP. Lettering only; never part of the model.
- **Quantity kind**: what a figure measures (a length, a temperature, a temperature difference, a U-factor). Every lettered figure has one, and the kind alone decides how it converts and how precisely it is lettered in each system.
- **IP position**: a place a control can stand when the sheet is in IP, lettered as a round figure at the control's IP precision and corresponding to exactly one model value.
- **Remembered choice**: the unit system stored in the reader's own browser. Absent on a first visit and where the browser refuses storage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With IP showing, a sweep of every strip, reading, table, drawing, study and survey at the default desk and three other desk positions finds zero dimensioned figures in SI units other than the kinds the Units table keeps in SI.
- **SC-002**: Switching units changes zero bytes of the IDF and zero results at the default desk and three other positions, and starts zero runs.
- **SC-003**: The whole sheet is re-lettered within one tenth of a second of pressing the toggle, with no visible intermediate state in which the two systems are mixed.
- **SC-004**: For 100% of a sample of at least 200 lettered IP figures, recomputing from the model's SI value with the published exact factor gives the lettered figure to its stated precision.
- **SC-005**: For every control, at no fewer than five positions each including both ends, a value set in IP letters identically after a reload, a shared link and a switch there and back.
- **SC-006**: Every landmark on the desk is reachable and lit at the same model values in both systems.
- **SC-007**: A US engineer can set a 60 ft by 40 ft by 12 ft box with R-20 walls, R-30 roof, U-0.30 windows and a 72 °F heating setpoint, and read its annual energy intensity in kBtu/ft²·yr, without converting a figure by hand, in under two minutes.
- **SC-008**: Every link made before this feature opens to the same desk and, in SI, the same lettering as before.
- **SC-009**: At 390 px wide, with IP showing, no lettered value is clipped or pushed off its row, and every always-visible string stays within its copy budget.

## Assumptions

- **IP means the inch-pound units of ASHRAE practice**, which is what a US building engineer is handed by their codes (ASHRAE 90.1 and 62.1) and their software. A third, mixed system (for example UK practice) is out of scope.
- **Exact factors**: 1 ft = 0.3048 m, and the International Table Btu. Temperature converts exactly. Any factor derived from these is derived, not rounded.
- **Efficiencies stay dimensionless.** Heating and cooling efficiencies read as the coefficients the desk already uses, in both systems. Lettering cooling efficiency as EER or SEER is a separate feature.
- **Test pressure stays in pascals**, because airtightness is quoted at 50 Pa in US practice too (ACH50, CFM50).
- **Billed energy stays in kWh and money stays in the tariff's currency**, because a US utility bills electricity in kWh and the rates tables are per kWh. Gas billed in therms is a separate question for the tariff tables.
- **Number formatting is unchanged.** Decimal separators and digit grouping do not change with the unit system; that is a locale question and out of scope.
- **The overheating assessment keeps its method.** CIBSE TM59 defines its criteria in °C and K; in IP they are lettered as converted temperatures and temperature differences, and the verdict is the one the method gives.
- **"A United States region" is the region the browser reports in its preferred language** (for example `en-US` or `es-US`). That is the one signal a static page has without asking the reader or making a request, and a wrong guess costs one press of the toggle. Principle II forbids locale reaching the document, not the lettering, and FR-003 and FR-017 keep it there.
- **Landmark labels that already name an imperial product ("R-13 stud cavity") keep their names** in both systems. The names are how the trade refers to the thing, not a figure the toggle owns.
- **The link codec keeps carrying SI values.** How IP positions and the link's existing precision fit together is a planning decision; FR-011 and SC-008 are what it must satisfy. If it needs a finer grid on the link, that is a `LINK_VERSION` bump with a migration, as the constitution requires.
- **The model and the run's files stay in SI**, because EnergyPlus reads and writes SI, and a model file in two unit systems would be two models.
