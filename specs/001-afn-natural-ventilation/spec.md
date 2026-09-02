# Feature Specification: Natural ventilation by pressure network

**Feature Branch**: `001-afn-natural-ventilation`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Users requested the ability to model natural ventilation using the AirFlowNetwork method (AFN). The 'how' needs to be researched thoroughly with the help of /developing-with-idfkit."

## Overview

The desk currently answers "how much outdoor air moves through this building" with a
scheduled flow rate: the reader states air changes per hour, and the engine delivers
them whenever the stated conditions are met. The rate is an input, and the weather
only gates it.

A pressure network answers the same question the other way round. The reader states
how leaky the envelope is and how large the openings are, and the flow is *computed*
each timestep from wind pressure on each facade and the stack effect between inside
and outside. The rate becomes a result. That inversion is the whole feature: it is
what lets a reader ask whether an opening of a given size on a given facade will
actually flush this building on this night in this climate, rather than asserting
that it will.

The two cannot share a run. The engine simulates one or the other, so they are two
models of one subject rather than two subjects, and they are chosen the way the glazing
strip already chooses between a window taken off a product sheet and one built out of
panes: one selector, only the controls of the model in force on show, and a readout
lettering what the engine made of it. This specification is as much about making that
exclusivity legible as it is about adding the network.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compute the flow instead of asserting it (Priority: P1)

A modeller who has been moving the ventilation slider in air changes per hour wants
to stop asserting a rate. They switch the air strip from the scheduled model to the
pressure network, state an envelope leakiness in the same unit they have been using
and an openable area, and the strip reports the air change rate the weather actually
produced, beside the rate they asked for and the leakage figure the model was given.

**Why this priority**: This is the feature. Everything else on the list refines or
protects it, and without it there is nothing to ship. It is also the smallest thing
that delivers the value the request names: a natural ventilation rate that answers
the climate rather than a schedule.

**Independent Test**: Engage the pressure network on the stock desk with a weather
file attached, and confirm the sheet letters a computed air change rate that varies
across the year and differs from any figure the reader typed. Fully testable with no
other story built.

**Acceptance Scenarios**:

1. **Given** the stock desk with a weather file attached, **When** the reader switches
   the air strip to the pressure network, **Then** the run completes without severe
   errors and the strip letters a computed air change rate for the run.
2. **Given** the pressure network in force, **When** the reader reads the strip,
   **Then** the rate they stated, the leakage figure the model was given and the rate
   the run produced are all three legible, and none is mistakable for another.
3. **Given** the pressure network in force, **When** the reader increases the envelope
   leakiness, **Then** the computed air change rate rises and the heating demand rises
   with it.
4. **Given** the pressure network in force and a windy hour pinned, **When** the reader
   compares the same hour on a still day, **Then** the computed rate differs, because
   the flow is driven by the weather rather than by a schedule.
5. **Given** the pressure network in force, **When** the reader reads the balance rail,
   **Then** the outdoor air term still closes the zone air balance with the other four
   terms.

---

### User Story 2 - Never leave a dead control on the desk (Priority: P1)

A reader sets infiltration to 0.5 air changes per hour, then spends a while balancing
the constant, wind and stack coefficients against each other. Then they switch the strip
to the pressure network.

Those five controls are now dead. The engine discards the scheduled objects when a
network is present and computes the leakage off the envelope instead, so nothing those
sliders say reaches the run. If they are still on the strip, the reader can double the
infiltration, watch a solve go by, and get back exactly the numbers they had, with
nothing on the sheet to say why. They will conclude something false about the building.
This story is the guarantee that the situation cannot arise: only the model in force has
controls, and only the model in force letters figures.

**Why this priority**: Equal first, and it is not a nicety. The engine's only signal is
one warning line in an error file the reader never opens; everything else about the
switch is silent. A desk that lets a reader turn a dead slider and letter a plausible
number is the exact failure this sheet exists to prevent, and it would break the "no
silent fallbacks" principle outright.

**Independent Test**: With a working network already in place, switch models back and
forth and confirm that at no point is a control offered whose value does not reach the
model, and that the model in force can be named from the sheet without opening the strip.

**Acceptance Scenarios**:

1. **Given** the scheduled model is in force, **When** the reader switches to the
   pressure network, **Then** the scheduled controls are no longer offered and no figure
   on the sheet is derived from them.
2. **Given** the pressure network is in force, **When** the model is written for the run,
   **Then** it carries no object owned by the scheduled model, so the engine has nothing
   to discard and reports no warning about it.
3. **Given** the pressure network is in force, **When** the reader switches back,
   **Then** the scheduled controls return at the values they held, and the network's
   controls are withdrawn in the same way.
4. **Given** either model is in force, **When** the reader reads the description under
   the plate, **Then** it names which one produced the air flow.
5. **Given** either model is in force, **When** the reader reads the folded index row at
   the narrow layout, **Then** the model in force is named there.

---

### User Story 3 - Open a window on the facade that catches the wind (Priority: P2)

A modeller wants to know whether opening the south wall or the west wall gives a
better night flush on this site. Under a scheduled rate the question cannot be asked:
the flow is the same number whichever facade it is attributed to. Under a pressure
network the facades have different wind pressures, so the answer is a real one.

**Why this priority**: This is the argument for the network over the scheduled model,
and it is the question a designer actually has. It is second only because Story 1
delivers a working network and this makes it worth having.

**Independent Test**: Set an openable area on one wall, sweep it, and confirm the
resulting flow and the resulting demand differ from the same area set on a different
wall.

**Acceptance Scenarios**:

1. **Given** the pressure network engaged, **When** the reader sets an openable area
   on the west wall and the same area on the south wall in turn, **Then** the computed
   flows differ.
2. **Given** an openable area set on a wall carrying no glazing, **When** the reader
   reads that wall's entry, **Then** the offer is refused with the wall's own reason
   rather than reporting a flow through an opening that does not exist.
3. **Given** a wall set adiabatic, **When** the reader reads that wall's entry,
   **Then** it states that the wall has no outside to open onto.

---

### User Story 4 - Let the building decide when to open (Priority: P2)

The reader chooses the rule the openings obey: always open, open above an indoor
temperature, open on an enthalpy difference, or open against a comfort model. The
building then opens and closes itself through the run, and the sheet can letter how
much of the year the openings actually stood open.

**Why this priority**: The control rule is what turns a hole in a wall into a
ventilation strategy, and the comfort-model rules are the ones a reader cannot get
from the scheduled model at all. It follows Story 3 because an opening has to exist
before a rule can govern it.

**Independent Test**: Set each control rule in turn on an otherwise fixed desk and
confirm the fraction of hours the openings stand open changes, and that the sheet
reports that fraction.

**Acceptance Scenarios**:

1. **Given** the pressure network engaged with an opening, **When** the reader selects
   a temperature rule and a setpoint, **Then** the openings stand open only in hours
   satisfying it, and the sheet letters how many hours that was.
2. **Given** a control rule requiring a setpoint, **When** the reader engages it,
   **Then** a setpoint is always supplied, and the run never fails for the want of one.
3. **Given** the openings never open under the chosen rule, **When** the run returns,
   **Then** the sheet says the openings never opened rather than lettering a zero that
   reads as a measurement.

---

### User Story 5 - Share and sweep the network like every other control (Priority: P3)

A reader sends a colleague a link to a naturally ventilated desk, and the colleague
opens the same building. Either of them can put a study on the openable area and get a
curve.

**Why this priority**: The desk's existing guarantees have to keep holding, but they
follow from declaring the controls in the ordinary way rather than being separate work.
Third because the feature is useful before it is shareable.

**Independent Test**: Encode a desk with the network engaged, decode it in a fresh
session, and confirm an identical drawing, identical model text and identical numbers.

**Acceptance Scenarios**:

1. **Given** a desk with the network engaged and its controls off their defaults,
   **When** the link is opened in a fresh session, **Then** the drawing, the model and
   the numbers are identical.
2. **Given** the network engaged, **When** the reader starts a study on an openable
   area, **Then** a curve is produced on the same terms as every other study.
3. **Given** a link minted before this feature existed, **When** it is opened,
   **Then** it resolves to the scheduled model and reproduces its original numbers.

---

### Edge Cases

Each of these was reached by running the model, not by reading about it. The measured
evidence is in the Research Findings appendix.

- **A near-horizontal opening cannot be operable, and the reason is a gap between two
  models rather than one rule.** The vertical-opening model drives its two-way flow off
  the way the pressure difference varies from the bottom of the opening to its top, with
  a neutral plane in between; a flat opening has no bottom and top, so there is nothing
  to place a neutral plane in, and the model refuses anything within 10 degrees of
  horizontal. The horizontal-opening model exists for exactly that case, but is
  formulated between an upper and a lower zone and refuses a surface that faces outdoors,
  which is an external node carrying a wind pressure rather than a zone with a density.
  Neither covers "horizontal, to outdoors". Rooflights on this desk are horizontal, so
  under the network they can leak but can never open. The interface has to state this
  where the reader would otherwise look for the control, in the same way the Skylights
  strip already states that rooflights fall outside the blind.
- **That limit is the tool's, not the world's, and it makes the two models differ in
  capability rather than only in method.** Buildings do ventilate through roof hatches,
  and the scheduled model will happily do so, because it never asks where the air passes
  through. The network will not. The usual workaround, raising the opening into a monitor
  or a clerestory so that it becomes vertical, needs the roof itself to fold, which this
  desk has already ruled out. So a reader wanting roof ventilation has a reason to stay
  on the scheduled model, and the desk should not present the network as strictly better.
- **A control rule that needs a setpoint and is given none is fatal**, not a warning
  and not a default. The setpoint has to be written whenever such a rule is chosen.
- **The leakiness reference conditions belong to the site, not to sea level.** A
  reference pressure left at sea level warns on any elevated station, and the warning
  count is something the title block reports.
- **A wall with no glazing has no opening to operate**, and a wall set adiabatic has
  no outside at all. Both refusals already exist for the overhang and glazing keys and
  must be reused rather than restated.
- **A building with no openings at all is still a valid network**, leaking through its
  cracks. It must run, not refuse.
- **A network with no exterior surface left to leak through is a get-input fatal**, and
  it is reachable from the desk: patching Fabric out sends all six surfaces adiabatic,
  and so does setting every face of the boundary key by hand. Measured:
  `** Severe ** AirflowNetwork::Solver::get_input: An AirflowNetwork:MultiZone:Surface
  object is required but not found.` then `** Fatal ** Errors found getting inputs.` The
  answer is the `requires` gate the Glazing and Skylights strips already use for the
  same shape of problem — the channel is refused with its reason on the strip and no
  network object is written, so the fatal is unreachable rather than caught. The
  scheduled model needs no such gate: it puts air into a zone without asking where it
  came through, which is exactly the difference between the two models.
- **An EMS actuator that is forced rather than released replaces the opening rule
  instead of bounding it**, and it runs clean either way. An actuator holds whatever it
  was last set to, so an else-branch writing a value — `SET Vent0 = 0.5`, the obvious
  thing — overrides the temperature rule for every hour the wind is below the limit.
  Measured on the stock desk with the zone on `Temperature` at 22 °C: **8,808 hours open
  of 8,808** and 4.160 ACH, against 2,601 hours and 0.419 ACH with `SET Vent0 = Null`.
  Exit 0, zero warnings, nothing in the error file. There is no signal for this anywhere
  but the reading, which is why the wind bound carries a gate with a number on it.
- **A stacked building** (more than one storey by multiplier) runs, and every intensity
  read off it must divide by the whole building's floor area, as the sheet already does.
- **An annual run costs about two and a half times what it costs without the network.**
  The design day is unchanged. The live cadence during a drag therefore holds, and the
  release cadence is the one that slows.
- **What happens on the run in which the reader switches models**: the previous
  model's readings must come down where they stop being true rather than standing as
  numbers describing a building that is no longer in the path.

## Requirements *(mandatory)*

### Functional Requirements

**The model and its exclusivity**

- **FR-001**: The reader MUST be able to choose, on the strip that already owns outdoor air,
  between the scheduled model the desk has today and a pressure network that computes flow
  from wind and stack effect. The choice MUST be a single control, and the scheduled model
  MUST remain the default.
- **FR-002**: Exactly one model MUST be in the path for any run. The system MUST NOT produce
  a run in which both models' controls appear to be active.
- **FR-002a**: The model handed to the engine MUST carry only the objects of the model in
  force. The objects of the model that is out MUST be removed rather than left for the engine
  to discard, so that no run reports a warning about them and the warning count the title
  block letters stays true.
- **FR-003**: The strip MUST show only the controls of the model in force. A control belonging
  to the model that is out MUST NOT be presented as something the reader can turn, and its
  value MUST NOT reach the model.
- **FR-004**: The model in force MUST be readable without opening anything, including at the
  narrow layout where strips fold to a line.
- **FR-004a**: The strip MUST keep one meter on the balance rail across both models, since one
  term of the zone air balance is what both are describing.

**Stating the envelope and the openings**

- **FR-005**: The reader MUST be able to state how leaky the opaque envelope is, in air changes
  per hour, and that leakiness MUST be applied to every exterior surface that has an outside.
- **FR-005a**: The leakage figure the model is actually given MUST be lettered beside the air
  changes per hour the reader stated, together with the arithmetic that turned one into the
  other, so the conversion can be checked and disagreed with rather than being applied out of
  sight.
- **FR-005b**: The stated rate and the computed rate MUST be visibly distinct as a setting and
  a reading, and MUST NOT be lettered as though they were the same quantity.
- **FR-006**: The reader MUST be able to state an openable area per wall, so that the four
  walls are four separate subjects, as the window-to-wall ratio and the overhang projection
  already are.
- **FR-007**: Where a wall carries no glazing, or has been set adiabatic, the openable-area
  control for that wall MUST be refused with that wall's own reason.
- **FR-008**: The system MUST NOT offer an operable opening on a near-horizontal surface,
  and MUST state why where the reader would look for one.
- **FR-008a**: Where a reader carrying operable rooflights would lose them by choosing the
  network, the choice MUST say so at the point it is made, since the two models differ here
  in what they can represent rather than only in how they compute it.
- **FR-009**: The reference conditions for envelope leakiness MUST be taken from the site
  the desk is standing on, not from a fixed constant.

**Governing when the openings open**

- **FR-010**: The reader MUST be able to choose the rule the openings obey, including at
  minimum: never open, always open, open on an indoor temperature, open on an enthalpy
  difference, and open against an adaptive comfort model.
- **FR-011**: Where the chosen rule requires a setpoint, the system MUST always supply one,
  and a run MUST NOT fail for the want of it.
- **FR-012**: The reader MUST be able to state the temperature difference and wind speed
  bounds outside which the openings shut.

**Reading the result back**

- **FR-013**: The strip MUST letter the computed air change rate for the run in a readout
  beside its meter, on the same terms as the glazing strip's readout of what the engine made
  of an assembly: an em dash before the first run, taken down with the other readings when a
  run stops being true, and absent rather than zero when the model is out of the path.
- **FR-014**: The sheet MUST letter how much of the run the openings actually stood open.
- **FR-015**: Every figure the network produces MUST be read back off the run, never off the
  reader's live settings.
- **FR-016**: Where the network produced no flow, or the openings never opened, the sheet
  MUST say so rather than lettering a zero that reads as a measurement.
- **FR-017**: The zone air balance MUST continue to close with the network in the path, and
  the outdoor air term on the balance rail MUST carry the network's flows.
- **FR-018**: The description under the plate MUST name which model produced the air flow,
  and MUST describe the network in terms of what it reached in the model.

**Keeping the desk's existing guarantees**

- **FR-019**: Every setting this feature adds MUST ride the shareable link, so the same
  address reproduces the same building and the same numbers.
- **FR-020**: Links minted before this feature MUST continue to resolve, to the scheduled
  model, and reproduce their original numbers.
- **FR-021**: The network's numeric controls MUST be sweepable as studies on the same terms
  as every other control.
- **FR-022**: Engaging or bypassing the network MUST remove its objects from the model
  rather than zeroing them, so the drawing and the model agree about what is in the path.
- **FR-023**: Applying the desk repeatedly MUST produce identical model text, including when
  the network has been made smaller than it was.
- **FR-024**: The onboarding notes MUST be updated wherever this feature changes what a step
  teaches or renames a control it names.

**Latency**

- **FR-025**: The live cadence during a gesture MUST be preserved: a design day with the
  network engaged MUST solve within the budget the desk already holds.
- **FR-026**: Where the network makes a run materially slower, the sheet MUST behave as it
  does for any slow run: previous numbers stand, dimmed, rather than the sheet blanking.

### Key Entities

- **Air model**: which of the two ways of answering the outdoor-air question is in force,
  chosen by one control on the strip that owns the subject. Exactly one, always known, always
  visible, defaulting to the scheduled model.
- **Envelope leakiness**: how much air the opaque envelope passes. Held as air changes per
  hour, which is what the reader states, and carried into the model as a leakage coefficient
  referenced to the site's own conditions. Both figures are lettered, with the arithmetic
  between them. An input.
- **Opening**: an operable area on one wall, with the wall it belongs to, whether that wall
  can carry one, and the rule governing when it opens. Four of them, one per wall.
- **Opening rule**: the condition under which openings stand open, together with whatever
  setpoint and bounds that condition needs.
- **Computed flow**: the air change rate, the volume moved and the hours open, all read back
  off the run. Results, never settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can switch the building to the pressure network and get a completed
  run with no severe errors, on the stock desk, on a stacked desk, on a desk with adiabatic
  surfaces, and on a desk with no openings at all.
- **SC-002**: The air change rate the sheet letters varies across the hours of a year rather
  than holding one value, demonstrating that the flow answers the weather.
- **SC-003**: Switching models leaves no control on the sheet that appears active but
  reaches nothing: the strip shows the controls of the model in force and no others, in
  the same gesture.
- **SC-003a**: A reader can state a leakiness, read what the model was given for it, and
  redo the arithmetic between them from what the strip letters, without opening anything
  else.
- **SC-004**: The same link reproduces the same drawing, the same model text and the same
  numbers in a fresh session, for every combination of the settings this feature adds.
- **SC-005**: Moving a control during a gesture continues to re-solve at the desk's existing
  live cadence with the network engaged.
- **SC-006**: A reader can determine, without opening any strip, which model is in force, at
  the narrowest supported layout.
- **SC-007**: Setting the same openable area on two different walls produces two different
  flows, demonstrating that facade orientation reaches the result.
- **SC-008**: Every figure this feature letters can be traced to the run that produced it,
  and every claim it makes about the world cites a source in place.
- **SC-009**: No run produced by any reachable combination of this feature's controls fails
  with a severe error, verified by exhausting the control rules against the desk's own
  geometry cases.

## Assumptions

- **The pressure network is a second model of one subject, chosen on the strip that already
  owns it.** The desk has one strip owning outdoor air, and the engine refuses to simulate
  both approaches at once, so they are two models of one question rather than two questions.
  This is the arrangement the glazing strip already uses: one selector chooses between a
  simple model taken off a product sheet and a layered one built from parts, the strip only
  ever shows the controls of the model in force, and a readout letters what the engine made
  of it. The air strip gains the same shape, which also keeps one meter on the balance rail
  where one term belongs.
- **Leakiness is stated in air changes per hour, and what that becomes is lettered beside
  it.** The reader keeps the unit they think in and the landmark bands already built for it;
  the leakage coefficient the model is actually given stands next to it, derived and visible
  rather than applied out of sight. The arithmetic is printed the way the register already
  prints its blower-door conversion, so it can be disagreed with. This is deliberately three
  figures for one question, because they are three different things: what the reader asked
  for, what the model was given, and what the weather produced. The last of those is a
  reading and belongs with the results, not with the settings.
- The scheduled model stays exactly as it is and remains the default, so no existing link
  changes meaning and the link format needs no migration step.
- One thermal zone remains the whole building. Interior openings, stack shafts and
  zone-to-zone flow are out of scope, because there is no second zone for air to move to.
- No duct network is modelled. The building is served by an ideal unit, so there is nothing
  for a distribution network to describe. Verified to run in this configuration.
- Wind pressures are derived by the engine from the building's own shape rather than entered
  as coefficients, which is available because this building is a rectangular box. A reader
  wanting to enter measured pressure coefficients is out of scope.
- The slower annual run is accepted rather than mitigated. The design day is unaffected, so
  the cadence that matters during a gesture is unchanged, and the sheet's existing handling of
  a slow run covers the rest.
- Existing per-wall refusal machinery (a wall with no glazing, a wall with no outside) is
  reused rather than restated, since the walls' openings are governed by exactly the questions
  the overhang and glazing keys already ask.

## Dependencies

- The simulation engine bundled with the page, at the version the desk already pins. Every
  finding below was measured against that version; none may be assumed to hold across a
  version change without being re-measured.
- The weather and site data the desk already fetches, since the leakiness reference conditions
  and the wind pressures both depend on where the building stands.
- No new runtime dependency. Nothing in this feature requires a package outside the ones the
  page already carries.

## Research Findings

Measured against EnergyPlus 26.1.0 on the stock desk, generated by the page's own model code,
run against Golden CO TMY3. These are the facts the specification above is built on; each cost
a run to find, and none is available from the schema.

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Engaging a network makes the engine **not simulate** any scheduled infiltration, ventilation or mixing object. The two are mutually exclusive by the engine's own rule. | Documented in the engine's input reference, and confirmed by a run: `..Specified AirflowNetwork Control = "MultizoneWithoutDistribution" and ZoneInfiltration:* objects are present. ..ZoneInfiltration objects will not be simulated.` Warning only, in the error file. |
| 2 | A temperature control rule with no setpoint schedule is **fatal**, though the schema marks the field optional. | `** Severe ** ... Ventilation Control Zone Temperature Setpoint Schedule Name cannot be empty when Ventilation Control Mode = TEMPERATURE.` Program terminated. |
| 3 | An operable opening within **10 degrees of horizontal** facing outdoors is **fatal**, under either opening model, because neither is formulated for the case. | Runs: `** Severe ** ... which is within 10 deg of being horizontal. Airflows through horizontal openings are not allowed.` and, for the horizontal component, `The horizontal opening must be located between two thermal zones`. Both fatal, on all four rooflights. |
| 3a | The vertical model needs the opening to have **height**: its two-way flow comes from the pressure difference varying between the opening's bottom and top. A flat opening gives it no neutral plane to place. | Input reference: "assumes that open windows or doors are vertical or close to vertical", and "it is possible to have a positive pressure difference at the top of the opening, and a negative pressure difference at the bottom ... when the neutral height is between the bottom and top heights". |
| 3b | The horizontal model needs a **zone on both sides**: its buoyancy term compares an upper zone's air density against a lower zone's. Outdoors is an external node carrying a wind pressure, not a zone with a density. | Input reference: "assumes that these openings are horizontal or close to horizontal and are interzone surfaces", and "buoyancy flow only occurs when the air density in the upper zone is greater than the air density in the lower zone". |
| 4 | Leakiness reference pressure must match the **site**, not sea level. | `** Warning ** ... Pressure = 101325 differs by more than 10% from Standard Barometric Pressure = 81198.` Golden is at 1829 m. Gone when set to the site's own figure. |
| 5 | Engine-computed wind pressures avoid every coefficient object, and are documented for **rectangular** buildings, which this one is. They read the building's long-axis azimuth and its width ratio, both derivable from the desk's own geometry. | Engine input reference: "should only be used for rectangular buildings ... you do not have to enter any of the following objects". |
| 6 | **The network runs clean on this exact building**: one zone, an ideal unit, no ducts. Also clean at a zone multiplier of 3, with two walls adiabatic, and with no glazing at all. | Four runs, exit 0, no severe errors. |
| 7 | **Latency**: the design day costs **+20 ms** and the year **3.3x**. The design day is *not* free, which an earlier reading of this finding said it was: 20 ms is 40 % of the desk's 50 ms live budget. | Three interleaved passes on the stock desk. Design day 0.05 s scheduled, 0.07 s network (161 ms and 183 ms wall clock). Year 0.47 s scheduled, 1.55 s network (581 ms and 1,644 ms). The EMS wind bound adds a further 8 % to the year and nothing measurable to the design day. |
| 8 | Air change rate becomes a **result**, and it moves with the weather. | Computed hourly rate over the year ranged 0.002 to 0.708 ACH, mean 0.134, from a uniform crack coefficient. |
| 9 | The balance rail's outdoor air term **survives and carries the network's flows**, so the console's five-term balance keeps closing. | The same variable is present in both runs and reports different series: mean -1916 W without the network, -1805 W with it. |
