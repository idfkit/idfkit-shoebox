# Phase 0: Research

**Feature**: Natural ventilation by pressure network (`001-afn-natural-ventilation`)

**Date**: 2026-09-02

Everything below was measured against EnergyPlus 26.1.0, installed locally at
`/Applications/EnergyPlus-26-1-0`, driving documents built by this repository's
own `buildModel` / `applyModel` through a throwaway harness under `.harness/`.
The desk was the stock one with Air, Gains and System engaged, run annual
against `USA_CO_Golden-NREL.724666_TMY3.epw`, which is the station the default
model already carries.

The specification arrived with nine findings of its own. This phase confirmed
seven of them, corrected one, and found three the specification does not have.
The corrections are tabulated at the end and are owed to `spec.md` before
`/speckit-tasks` runs.

---

## The object set

**Decision**: six object types, all in the `AirflowNetwork` group, and no
others.

| Object | One per | Carries |
|---|---|---|
| `AirflowNetwork:SimulationControl` | model | the control mode and the wind pressure method |
| `AirflowNetwork:MultiZone:Zone` | zone | the opening rule, its setpoint and its bounds |
| `AirflowNetwork:MultiZone:ReferenceCrackConditions` | model | the site's own temperature, pressure and humidity |
| `AirflowNetwork:MultiZone:Surface:Crack` | exterior surface | that surface's share of the envelope leakage |
| `AirflowNetwork:MultiZone:Component:SimpleOpening` | model | the opening's discharge behaviour |
| `AirflowNetwork:MultiZone:Surface` | leaking or opening surface | the linkage from a surface to its component |

**Rationale**: this is the smallest set that expresses the specification.
`ExternalNode`, `WindPressureCoefficientArray` and
`WindPressureCoefficientValues` are all avoided by
`wind_pressure_coefficient_type = SurfaceAverageCalculation`, which the engine
documents for rectangular buildings and which this box is. Nothing in the
`AirflowNetwork:Distribution:*` family is written, because there are no ducts.

**Alternatives considered**:

- `AirflowNetwork:MultiZone:Surface:EffectiveLeakageArea` states leakage as an
  area rather than a mass flow coefficient. Rejected because its reference
  conditions are a pressure difference and a discharge coefficient rather than
  a temperature and a barometric pressure, so the site conditions FR-009
  requires could not be attached to it in the same way.
- `AirflowNetwork:MultiZone:Component:DetailedOpening` models the opening as up
  to four rectangular sub-openings with their own opening schedule. Rejected as
  more parameters than the specification asks for: FR-006 states one openable
  area per wall, and `SimpleOpening` takes exactly that through the surface's
  own opening factor.

### Field names, confirmed against the 26.1.0 schema

`AirflowNetwork:SimulationControl` has a name, and the fields used are
`airflownetwork_control` (`MultizoneWithoutDistribution`),
`wind_pressure_coefficient_type` (`SurfaceAverageCalculation`),
`height_selection_for_local_wind_pressure_calculation` (`OpeningHeight`),
`building_type` (`LowRise`), `azimuth_angle_of_long_axis_of_building` and
`ratio_of_building_width_along_short_axis_to_width_along_long_axis`.

`AirflowNetwork:MultiZone:Zone` and `AirflowNetwork:MultiZone:Surface` are both
nameless and keyed on `zone_name` and `surface_name` respectively.

`AirflowNetwork:MultiZone:Surface`'s
`window_door_opening_factor_or_crack_factor` has a **maximum of 1** and an
exclusive minimum of 0. It is a fraction, never a multiplier, which is what
forces the crack sizing decision below.

---

## The opening rule maps one to one onto the schema

**Decision**: the rule selector's options are the enum of
`ventilation_control_mode` on `AirflowNetwork:MultiZone:Zone`, unchanged.

The schema publishes exactly: `NoVent`, `Constant`, `Temperature`, `Enthalpy`,
`ASHRAE55Adaptive`, `CEN15251Adaptive`. FR-010 asks for "never open, always
open, open on an indoor temperature, open on an enthalpy difference, and open
against an adaptive comfort model", which is those six with the two adaptive
models counted as one requirement. Nothing has to be invented, and nothing the
reader can choose is outside what the engine accepts.

The temperature bounds FR-012 asks for are four more fields on the same object:
`indoor_and_outdoor_temperature_difference_lower_limit_for_maximum_venting_open_factor`
and its upper twin, and the enthalpy pair beside them.

**There is no wind speed field on any AirflowNetwork object.** Checked:
`MultiZone:Zone`, `MultiZone:Surface` and `OccupantVentilationControl`, the
last of which carries comfort curves, a PPD threshold and opening probabilities
and nothing about wind. `venting_availability_schedule_name` is a schedule and
cannot read a wind speed either.

That is not the end of it, and the next section is the correction.

---

## The wind bound, and the release that makes it a bound

**Decision**: FR-012's wind speed bound is met through EMS, and the `Null`
release is the load-bearing line.

This section exists because the first pass of this research concluded the bound
could not be met at all, having checked the AirflowNetwork objects' fields and
stopped there. That was wrong. The engine's own actuator dictionary, dumped by
`Output:EnergyManagementSystem` with verbose reporting, publishes exactly what
is needed:

```
EnergyManagementSystem:Actuator Available,ZN001:WALL001:WIN001,
  AirFlow Network Window/Door Opening,Venting Opening Factor,[Fraction]
```

and `Site Wind Speed` is an ordinary output variable, so it can be sensed. The
program is four lines plus one pair per openable window:

```
IF WindSpeed > <limit>
  SET Vent0 = 0.0        ... one per window
ELSE
  SET Vent0 = Null       ... one per window
ENDIF
```

called at `BeginTimestepBeforePredictor`.

### `Null` is the whole design, and forcing a value instead runs clean

An EMS actuator holds whatever it was last set to. The first working version
put `SET Vent0 = 0.5` in the else-branch, which does not bound the opening
rule, it **replaces** it. Measured, annual, Golden, zone rule `Temperature` at
22 °C:

| Else-branch | Hours open | Vent flow |
|---|---|---|
| `SET Vent0 = 0.5` (forces the opening) | **8,808 of 8,808** | 4.160 ACH |
| `SET Vent0 = Null` (releases the actuator) | 2,601 | 0.419 ACH |

Every hour of the year open, with the temperature rule silently overridden,
exit 0 and zero warnings. Nothing in the error file, the schema or the
validator says a word. It is the same class of failure as the per-area crack
coefficient below, and it is why this is written down rather than left to be
rediscovered.

### It composes with the opening rule

The check that `Null` is right is that the bound set where it cannot bite is a
perfect no-op:

| Bound | Hours open | Vent flow | Windy hours open |
|---|---|---|---|
| 99 m/s (never bites) | 3,896 | 0.684 ACH | 1,756 |
| 4 m/s | **2,601** | **0.419 ACH** | **316** |

And the isolation was verified rather than assumed: over all 8,808 hours the
`Zone Air Heat Balance Outdoor Air Transfer Rate` series of the run with EMS at
99 m/s and the run with no EMS at all differ by a **maximum of 0 W**. The
physics is identical, so the timing below is EMS overhead and nothing else.

### It costs nothing on the design day

Three interleaved passes, identical physics either side:

| | Wall clock, median of 3 | Engine elapsed | EMS overhead |
|---|---|---|---|
| Annual, no EMS | 1,351 ms | 1.24 s | baseline |
| Annual, with EMS | 1,453 ms | 1.34 s | **+102 ms, about 8 %** |
| Design day, no EMS | 176 ms | 0.07 s | baseline |
| Design day, with EMS | 180 ms | 0.07 s | **+4 ms, engine elapsed unchanged** |

The design-day figure is the one that matters against Principle VI, and the EMS
is free there: 0.07 s either way, and +4 ms of wall clock is inside the noise of
process startup. The live cadence is untouched.

### Four actuators work

The program text scales with the openable windows, so the maximum case was run
rather than reasoned about: all four walls glazed at 0.3, all four openable,
four actuators, bound at 4 m/s. Exit 0, zero warnings, 2.03 s annual.

**Alternatives considered**: `venting_availability_schedule_name` driven by a
schedule derived from the EPW ahead of the run. Rejected because the schedule
would be a second reading of the weather sitting beside the engine's own, and
because a bound that applies to hours rather than to the wind the engine is
actually computing with is a different claim from the one FR-012 makes.

---

## The leakage arithmetic, and the mistake it is easy to make

**Decision**: one `AirflowNetwork:MultiZone:Surface:Crack` per exterior
surface, sized by that surface's own share of the exterior area, from a
whole-envelope coefficient derived at a stated reference pressure difference of
4 Pa.

```
Q(4 Pa)  = ACH · V / 3600                      m³/s, V the gross zone volume
ṁ(4 Pa)  = ρ · Q(4 Pa)                          kg/s, ρ = 1.2041 kg/m³
C_total  = ṁ(4 Pa) / 4^n                        kg/s at 1 Pa, n = 0.65
C_i      = C_total · A_i / ΣA                   that surface's share
```

**This is the arithmetic FR-005a requires be printed**, and every term in it is
either a constant declared here or a quantity `geometryFacts` already returns.

**The mistake**: `air_mass_flow_coefficient_at_reference_conditions` is the
coefficient for **that whole surface**, not per unit area. The first probe gave
every surface the same per-square-metre figure as its whole coefficient and the
run came back at a computed mean of **0.0007 ACH** against a stated 0.5, which
is an eighty-fold error that completed cleanly with zero warnings. Nothing in
the schema, the validator or the error file says a word about it. It is exactly
the class of silent wrongness the "read it back off the model" principle
exists to catch, and it is why FR-005a's demand that the conversion be lettered
is not decoration.

### Measured: the arithmetic lands, and it scales

Openings shut (`NoVent`) so the reading is leakage alone, annual, Golden:

| Stated at 4 Pa | Computed mean | Median | Min | Max |
|---|---|---|---|---|
| 0.50 ACH | **0.154 ACH** | 0.144 | 0.016 | 0.609 |
| 1.50 ACH | **0.451 ACH** | 0.418 | 0.044 | 1.824 |

Tripling the stated rate triples the computed one (0.451 / 0.154 = 2.93), which
is the linearity the derivation predicts and the check that the split by area
is right. The computed rate is about **31 % of the stated rate**, because real
driving pressures over a year average well under 4 Pa.

That gap is the feature. The stated figure is a specification at a reference
condition; the computed figure is what this climate did with it. FR-005b's
insistence that the two be visibly distinct is not a style rule: a reader who
took 0.154 for a failure to apply 0.5 would be wrong about the model, and a
reader who took them for the same quantity would be wrong about the building.

**Why 4 Pa**: it is the natural-conditions reference the desk's existing
`infiltration` control already works in ("Air changes at natural pressure, not
the ACH50 a blower door reports"). Keeping the same reference is what lets the
existing `INFILTRATION` landmark bands stand unchanged under the new model,
which the specification's assumptions require.

**Alternative rejected**: sizing the coefficient so that the *computed annual
mean* equals the stated ACH. It would make the two figures agree, which is
precisely the thing that must not happen: it would need the run's own answer as
an input to the run, and it would hide the climate's contribution inside a
calibration.

---

## Reading the result back

**Decision**: the computed rate is the **sum of two series**, both zone level,
both hourly.

| Variable | Units | What it carries |
|---|---|---|
| `AFN Zone Infiltration Air Change Rate` | ach | flow through the cracks |
| `AFN Zone Ventilation Air Change Rate` | ach | flow through the openings |
| `AFN Surface Venting Window or Door Opening Factor` | – | how far one opening stands open |

Confirmed off `eplusout.rdd`, not recalled. Measured on the stock desk with a
south opening at factor 0.5, annual, Golden:

```
inf ACH    [ZONE ONE]  mean 0.0007  max 0.011
vent ACH   [ZONE ONE]  mean 0.6840  max 3.141
total                  mean 0.6847  max 3.143
open factr [ZN001:WALL001:WIN001]  4,433 of 8,808 hours above zero (50.3 %)
```

**Reading only the "Infiltration" series would letter 0.0007 ACH over a
building actually receiving 0.68.** The name is the engine's, and it means
"through cracks", not "the infiltration of this building". FR-013's readout
sums both or it is wrong by three orders of magnitude.

`AFN Surface Venting Window or Door Opening Factor` is the only per-surface
variable this feature needs, and it is what FR-014's hours-open reading is taken
from. The per-surface warning in `CLAUDE.md` is about requesting a variable with
key `*` across 158 surfaces; here `*` resolves to **one series per openable
window**, so at most four. Measured: the request added 3 series to the run's 20,
an ESO 3 % larger.

### The balance rail survives

`Zone Air Heat Balance Outdoor Air Transfer Rate` is present in both runs and
reports different series, so FR-017 holds and the console's five-term balance
needs no change:

| | Mean | Min | Max |
|---|---|---|---|
| Scheduled model | −1,939 W | −7,547 | +1,292 |
| Pressure network | −1,243 W | −17,090 | +30 |

The network's minimum is more than twice the scheduled model's, which is the
night flush arriving as a real event rather than as a rate.

---

## Latency, and a correction

**Decision**: the network is accepted as slower, but **the design day is not
free**, and the specification says it is.

Three interleaved passes, native, wall clock and the engine's own elapsed:

| | Wall clock (median of 3) | Engine elapsed |
|---|---|---|
| Annual, scheduled | 581 ms | 0.47 s |
| Annual, network with openings | **1,644 ms** | **1.55 s** |
| Design day, scheduled | 161 ms | 0.05 s |
| Design day, network with openings | **183 ms** | **0.07 s** |

The annual run costs **2.8× wall clock, 3.3× engine elapsed**, against the
specification's claim of 2.6×. The design day costs **+22 ms wall clock,
+20 ms engine elapsed**, against the specification's claim that it is
unchanged.

That +20 ms matters, because the desk's live cadence budget is about 50 ms and
this spends 40 % of it. It does not break FR-025: 70 ms is still inside a
frame's worth of a drag and the sheet's latest-wins pump skips shapes passed
through. But it is a real charge against Principle VI and it must be stated
rather than discovered, so `quickstart.md` carries it as a measured gate rather
than an assertion.

---

## Three fatals, and the gate each one needs

### 1. A network with no exterior surface is fatal

Not in the specification, and load-bearing.

```
** Severe  ** AirflowNetwork::Solver::get_input: An AirflowNetwork:MultiZone:Surface
              object is required but not found.
**  Fatal  ** AirflowNetwork::Solver::get_input: Errors found getting inputs.
```

Measured on the stock desk with Fabric patched out, which sends all six
surfaces adiabatic and leaves nothing to leak through. This is the exact
analogue of "The opening that had nowhere to go" that `CLAUDE.md` already
records for Glazing, Skylights and Shading, and it takes the same fix:
`Channel.requires` on Air, testing `off('fabric')` and the six boundary keys,
and only when the network is the model in force.

The specification's edge case "a building with no openings at all is still a
valid network, leaking through its cracks" is separately true and was measured:
the `NoVent` runs above have no openings and complete cleanly. The two cases are
different. No *openings* is fine; no *exterior surfaces* is fatal.

### 2. A temperature rule with no setpoint is fatal

Confirmed, exact text:

```
** Severe  ** AirflowNetwork::Solver::get_input: : AirflowNetwork:MultiZone:Zone = ZONE ONE
**   ~~~   ** Ventilation Control Zone Temperature Setpoint Schedule Name cannot be empty
              when Ventilation Control Mode = TEMPERATURE.
**  Fatal  ** AirflowNetwork::Solver::get_input: Errors found getting inputs.
```

The schema marks the field optional, so schema validation passes and the engine
is the first thing to object. FR-011's answer is that the applier writes the
setpoint schedule whenever the mode is one that needs it, which makes the fatal
unreachable rather than handled.

### 3. A near-horizontal operable opening is fatal

Carried from the specification's own measurement, which recorded both messages:
`within 10 deg of being horizontal. Airflows through horizontal openings are not
allowed` for the vertical model, and `The horizontal opening must be located
between two thermal zones` for the horizontal one. FR-008's answer is that
rooflights are never linked to an opening component. They may still be linked to
a crack, which is not an opening and is not refused.

---

## What runs clean

Every case below completed with **exit 0, zero warnings, zero severe errors**,
annual against Golden. These are SC-001's cases:

| Case | Result |
|---|---|
| Stock desk, cracks only, `NoVent` | clean, 0.89 s |
| Stock desk, cracks plus a south opening on `Temperature` | clean, 1.55 s |
| Zone multiplier 3 (gross volume 3,185.6 m³) | clean, 0.82 s |
| Design day rather than a year | clean, 0.07 s |
| Fabric patched out (no exterior surface) | **fatal, gated by `requires`** |

The zero-warning result is worth naming: it comes from taking the reference
barometric pressure off the site rather than leaving it at sea level.
`Site:Location` for the default station reports 1,829 m, which the barometric
formula turns into 81,198 Pa, and that is exactly the figure the specification's
finding 4 recorded the engine warning about. Set from the site, the warning is
gone and the title block's warning count stays honest.

---

## Corrections owed to `spec.md`

`/speckit-plan` is where the specification's provisional numbers meet the
engine. Three of them moved.

| # | Spec says | Measured | Consequence |
|---|---|---|---|
| 7 | "the design day is unchanged" | design day 0.05 s → 0.07 s, **+40 %** | FR-025 still holds but the budget is 40 % spent; the plan states it as a measured gate rather than a free pass |
| 7 | the year costs "about 2.6 times" | **3.3×** on engine elapsed, 2.8× wall clock | no requirement changes; the figure quoted in the interface must be the measured one |

**FR-012 stands as written.** An earlier draft of this document claimed the
wind speed bound could not be met, on the strength of checking the
AirflowNetwork objects' own fields. That was a conclusion drawn from an
incomplete search: the bound is reachable through EMS, it composes with the
opening rule, and it costs nothing measurable on a design day. See "The wind
bound, and the release that makes it a bound" above. No requirement changes and
nothing is dropped from the network's controls.

Two additions rather than corrections, both of which the specification's edge
cases should carry:

- **A network with no exterior surface is a get-input fatal**, answered by the
  `requires` gate on the Air channel.
- **An EMS actuator that is forced rather than released replaces the opening
  rule outright**, measured at 8,808 hours open against 2,601, clean.

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Which AFN objects, and their 26.1.0 field names | Six types, tabulated above, every field checked against the schema |
| How a stated ACH becomes a crack coefficient | Derived at 4 Pa, split by surface area, measured linear and printed on the strip |
| Which variable carries the computed rate | The **sum** of the zone infiltration and zone ventilation ACH series, off the `.rdd` |
| Which variable carries the hours open | `AFN Surface Venting Window or Door Opening Factor`, one series per opening |
| Whether the balance rail still closes | Yes; the same variable is present and reports the network's flows |
| Whether FR-012's wind bound is reachable | Yes, through an EMS actuator on the venting opening factor, released with `Null` so it bounds the rule rather than replacing it |
| What the network costs | +20 ms on a design day, 3.3× on a year, both measured three times |
| What the EMS adds on top | +4 ms wall clock on a design day with engine elapsed unchanged, about 8 % on a year |
| Whether a new runtime dependency is needed | No. Nothing outside `@idfkit/*` |
| Which link version this needs | `v1` still. Every key is an addition, and additions are free under delta encoding |
