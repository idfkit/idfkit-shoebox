# Phase 1: Data model

**Feature**: Natural ventilation by pressure network (`001-afn-natural-ventilation`)

There is no database and no schema of our own here. The entities the
specification names are of three kinds, and keeping them apart is the whole
discipline of this feature:

1. **Settings** live on `params` as scalars, declared once in `controls.js`,
   and ride the permalink.
2. **Objects** are what an applier writes into the `IDFDocument`. They are
   derived from settings and from the document's own geometry, never stored.
3. **Readings** are read back off the finished run. They are never settings and
   are absent rather than zero.

The specification's five key entities map onto these as follows.

| Spec entity | Kind | Where it lives |
|---|---|---|
| Air model | Setting | `params.airModel`, one `Selector` |
| Envelope leakiness | Setting **and** derived object | `params.envLeak` (ACH), and the crack coefficients derived from it |
| Opening | Setting | four `Facade` keys, one per wall |
| Opening rule | Setting | `params.openRule` plus its setpoint, its two ΔT bounds and `openMaxWind` |
| Computed flow | Reading | off the ESO, never on `params` |

---

## 1. Settings

Ten keys, all scalars, all additions. Declared on the existing `air` channel in
`src/controls.js`. Nothing here is a new control kind, which is why
`console.js`, `permalink.js` and the study scheduler need no teaching.

### The choice

| Key | Kind | Default | Options | Notes |
|---|---|---|---|---|
| `airModel` | `Selector` | `Scheduled` | `Scheduled`, `Network` | FR-001. The default is what keeps every pre-feature link resolving unchanged (FR-020). |

Its `note` carries FR-008a: the two models differ in what they can represent,
not only in how they compute, and a reader with operable rooflights loses them
by choosing the network.

### The network's own controls

Every one carries `needs: (p) => p.airModel === 'Network'`, so it is withdrawn
under the scheduled model. This is the mechanism, and User Story 2's whole
guarantee rests on it.

| Key | Kind | Default | Range | Unit | Reaches |
|---|---|---|---|---|---|
| `envLeak` | `Scale` | 0.5 | 0 to 3, step 0.01 | ACH | the crack coefficients |
| `openable` | `Facade` (4 keys: `openN`/`openE`/`openS`/`openW`) | 0 | 0 to 1, step 0.01 | – | `window_door_opening_factor_or_crack_factor` per wall |
| `openRule` | `Selector` | `Temperature` | the six engine modes | – | `ventilation_control_mode` |
| `openSetpoint` | `Scale` | 22 | 10 to 32, step 0.5 | °C | the setpoint schedule |
| `openDeltaLo` | `Scale` | 0 | 0 to 20, step 0.5 | K | ΔT lower limit for the maximum open factor |
| `openDeltaHi` | `Scale` | 100 | 1 to 100, step 1 | K | ΔT upper limit for the minimum open factor |
| `openMaxWind` | `Scale` | 40 | 1 to 40, step 0.5 | m/s | the EMS wind bound's threshold |

**`envLeak` deliberately mirrors `infiltration`'s range, step and landmark
bands.** Both are air changes per hour at natural conditions, so the published
cases a reader reads 0.5 against are the same cases. Reusing `INFILTRATION`
rather than declaring a second set is what stops the two models disagreeing
about what "background ventilation" means.

**`openable` is a `Facade` and not four `Scale`s** for the reason the glazing
ratio and the overhang projection already are: four walls are four subjects,
each gets its own study offer and its own curve, and `controlFor` already
resolves a wall key to `{ control, side }`.

Each of its four `Side`s carries the per-wall refusal FR-007 requires, and the
predicate is the one `SHADE_SIDES` already uses, because the question is the
same question:

```
needs:     (p) => opensOut(p, face) && p[wwr] > 0
unreached: (p) => opensOut(p, face) ? noOpening(face) : noOutside(face)
```

A wall with no glazing has no opening to operate; a wall set adiabatic has no
outside at all. Both sentences exist already and are reused rather than
restated.

### The scheduled model's controls

Unchanged in every respect but one: each of the ten existing keys
(`infiltration`, `infConstant`, `infWind`, `infStack`, `ventilation`,
`ventType`, `ventMinIndoor`, `ventMaxOutdoor`, `ventDeltaT`, `ventMaxWind`)
gains `p.airModel === 'Scheduled'` to its existing `needs`. Their defaults,
ranges, steps and landmarks do not move, so `DEFAULTS_BY_VERSION.v1` is
untouched and no `MIGRATIONS` step is owed.

### FR-012's wind bound

`openMaxWind` deliberately mirrors the scheduled model's `ventMaxWind`: the
same range, the same step, the same `WIND` landmark bands, and the same default
of 40 m/s, which leaves the window never shutting because 40 m/s is past a
hurricane. A reader who has been working in one model finds the same face in
the other.

What differs is where it lands. `ventMaxWind` writes `maximum_wind_speed` on
`ZoneVentilation:DesignFlowRate`; **no AirflowNetwork object carries a wind
speed at all**, so `openMaxWind` reaches the run through an EMS program instead.
The objects are in "2. Objects written into the document" below and the rule
that makes it a bound rather than a replacement is in
[contracts/network-model.md](./contracts/network-model.md).

It is still a scalar on `params`, it still rides the link, and it is still
sweepable, so nothing else in this document treats it specially.

### Validation rules, all enforced at module load

These follow from the existing declaration invariants and cost no new
machinery:

- **`readLandmarks`'s four rules** apply to `envLeak` unchanged: inside the
  face's range, no two overlapping, reachable on the step grid, and not
  permanently suppressed at a zero stop. Reusing `INFILTRATION` against an
  identical range and step means all four already hold.
- **A `Side` with a predicate and no reason throws**, which is what makes the
  per-wall refusal sentences mandatory rather than optional.
- **`ALL_KEYS` collision check**: the ten new keys are asserted against the
  reserved permalink keys (`in`, `out`, `stn`, `win`, `at`) at module load, as
  every key already is.

---

## 2. Objects written into the document

Written by `applyAir` when `params.airModel === 'Network'` and the channel is
engaged. Cleared on every apply, whichever model is in force, so FR-002a holds
and FR-023's idempotence falls out.

### The sweep

`applyAir` clears **twelve** types on every apply: two scheduled, six network
and four EMS.

```
ZoneInfiltration:DesignFlowRate
ZoneVentilation:DesignFlowRate
AirflowNetwork:SimulationControl
AirflowNetwork:MultiZone:Zone
AirflowNetwork:MultiZone:ReferenceCrackConditions
AirflowNetwork:MultiZone:Surface:Crack
AirflowNetwork:MultiZone:Component:SimpleOpening
AirflowNetwork:MultiZone:Surface
EnergyManagementSystem:Sensor
EnergyManagementSystem:Actuator
EnergyManagementSystem:Program
EnergyManagementSystem:ProgramCallingManager
```

The four EMS types are cleared by type like the rest, which is safe **only
because nothing else on this desk uses EMS**. The day a second feature wants an
Erl program, this sweep has to narrow to the objects this channel owns by name,
or it will delete that feature's program on every apply. That is worth an
assertion rather than a comment: the clear can check it is removing only what
`applyAir` wrote.

Clear-and-rewrite rather than differential, for the reason `syncReporting`
gives: it is the only arrangement in which a desk that has just shrunk (four
walls openable down to one, or six exterior surfaces down to three) serialises
identically to one built at the smaller size. There is no `_MAX` constant to
declare here, because unlike `SKY_MAX` and `PANE_MAX` the object count is read
off the document's own surfaces rather than off a slider, and the clear is
by type rather than by name.

### The objects

**`AirflowNetwork:SimulationControl`**, one, named `Network`:

| Field | Value | From |
|---|---|---|
| `airflownetwork_control` | `MultizoneWithoutDistribution` | fixed; there are no ducts |
| `wind_pressure_coefficient_type` | `SurfaceAverageCalculation` | fixed; the box is rectangular |
| `height_selection_for_local_wind_pressure_calculation` | `OpeningHeight` | fixed |
| `building_type` | `LowRise` | fixed |
| `azimuth_angle_of_long_axis_of_building` | derived | the longer plan dimension's bearing, off `geometryFacts().faces`, folded into 0 to 180 |
| `ratio_of_building_width_along_short_axis_to_width_along_long_axis` | derived | short / long, off the same faces, clamped to (0, 1] |

The last two are the only place the wind pressure method touches the desk's
geometry, and both are **read off the document's faces** rather than off
`params.width` and `params.depth`, so a study overlay describes the sample and
not the desk.

**`AirflowNetwork:MultiZone:Zone`**, one, keyed on the zone:

| Field | Value |
|---|---|
| `zone_name` | `ZONE_NAME` |
| `ventilation_control_mode` | `params.openRule` |
| `ventilation_control_zone_temperature_setpoint_schedule_name` | the written schedule, whenever the mode needs one; omitted otherwise |
| `indoor_and_outdoor_temperature_difference_lower_limit_for_maximum_venting_open_factor` | `params.openDeltaLo` |
| `indoor_and_outdoor_temperature_difference_upper_limit_for_minimum_venting_open_factor` | `params.openDeltaHi` |

**`Schedule:Compact`**, named `AFN Setpoint`, written **whenever
`openRule` is one of the modes that needs it**, which is FR-011's whole
answer. The measured fatal is in [research.md](./research.md); writing the
schedule unconditionally for those modes makes it unreachable rather than
handled.

**`AirflowNetwork:MultiZone:ReferenceCrackConditions`**, one, named
`Site Conditions`:

| Field | Value |
|---|---|
| `reference_temperature` | 20 °C |
| `reference_barometric_pressure` | derived from `Site:Location.elevation` |
| `reference_humidity_ratio` | 0 |

FR-009. The pressure comes from the barometric formula
`101325 · (1 − 2.25577e−5 · z)^5.2559`, and the elevation is read off the
document, not off the station the picker holds. Measured: Golden at 1,829 m
gives 81,198 Pa, which is exactly the figure the engine warns about when the
field is left at sea level, and the warning is gone when it is set.

**`AirflowNetwork:MultiZone:Surface:Crack`**, one per exterior surface, named
`Crack <surface>`. Its coefficient is the arithmetic below.

**`AirflowNetwork:MultiZone:Component:SimpleOpening`**, one, named `Openable`,
written only where at least one wall has a non-zero openable area:

| Field | Value |
|---|---|
| `air_mass_flow_coefficient_when_opening_is_closed` | 0.001 kg/s·m |
| `air_mass_flow_exponent_when_opening_is_closed` | 0.65 |
| `minimum_density_difference_for_two_way_flow` | 0.0001 kg/m³ |
| `discharge_coefficient` | 0.6 |

**The EMS wind bound**, four objects plus one actuator per openable window,
written only where at least one wall has a non-zero openable area:

| Object | Count | Carries |
|---|---|---|
| `EnergyManagementSystem:Sensor` | 1 | `Site Wind Speed` on key `Environment` |
| `EnergyManagementSystem:Actuator` | one per openable window | `AirFlow Network Window/Door Opening` / `Venting Opening Factor` |
| `EnergyManagementSystem:Program` | 1 | the Erl below, with `openMaxWind` as a literal |
| `EnergyManagementSystem:ProgramCallingManager` | 1 | at `BeginTimestepBeforePredictor` |

```
IF WindSpeed > <openMaxWind>
  SET Vent0 = 0.0        one line per window
ELSE
  SET Vent0 = Null       one line per window
ENDIF
```

**`Null` is the whole design.** An actuator holds what it was last set to, so
forcing a value in the else-branch replaces the opening rule rather than
bounding it. Measured: 8,808 hours open against 2,601, the `Temperature` rule
silently overridden, exit 0 and zero warnings.

The threshold is a **literal inside generated program text**, which makes this
the one object here whose serialised form changes with a slider in a way that
is not a field value. Idempotence therefore has to be asserted over the program
text itself and not only over the object count.

**`AirflowNetwork:MultiZone:Surface`**, one per linked surface. Two populations:

- Every `BuildingSurface:Detailed` for which `opensOutdoors(doc, name)` is true,
  linked to its own crack, factor 1.
- Every `FenestrationSurface:Detailed` whose host is a **wall** that opens
  outdoors and whose wall's openable area is non-zero, linked to `Openable` with
  `window_door_opening_factor_or_crack_factor` set to that wall's key and
  `ventilation_control_mode` at `ZoneLevel`.

**Rooflights are in the first population's host surface and in neither
linkage as an opening.** FR-008. A window whose host is the roof is
near-horizontal, both opening models refuse it, and the run is fatal. It is not
skipped silently: the Skylights strip states it, in the same place and the same
way that strip already states rooflights fall outside the blind.

### The leakage arithmetic

Stated once, here, and printed on the strip so FR-005a's reader can redo it:

```
Q  = envLeak · V / 3600          m³/s   V = geometryFacts(doc).grossVolume
ṁ  = ρ · Q                       kg/s   ρ = 1.2041 kg/m³ at 20 °C
C  = ṁ / ΔP^n                    kg/s at 1 Pa    ΔP = 4 Pa, n = 0.65
Cᵢ = C · Aᵢ / ΣA                 that surface's share of the exterior area
```

**`C` is a whole-surface coefficient, not a per-area one.** A per-area figure
written into that field runs clean and is wrong by roughly eighty-fold; the
measurement is in [research.md](./research.md). The split by area is what makes
it right, and the linearity check (tripling the stated rate triples the computed
one) is what proves the split.

Every input is read off the document. `grossVolume` carries the zone multiplier,
so a stacked building leaks in proportion to its size, and the resulting ACH is
per building as every other intensity on this sheet is.

---

## 3. Readings

Read off the ESO in `readings.js`, returned as one frozen object. Never on
`params`, never in `shapeKey`, never letterable before a run.

```
NetworkFlow {
  ach        // number | null — the run's mean computed air change rate
  achMin     // number | null
  achMax     // number | null
  hoursOpen  // number | null — hours any opening stood open
  hoursTotal // number | null — hours in the environments read
}
```

**`ach` is the sum of two series.** `AFN Zone Infiltration Air Change Rate` is
the cracks and `AFN Zone Ventilation Air Change Rate` is the openings; measured
on the stock desk they were 0.0007 and 0.684. Either alone is a number about
part of the building under a label claiming the whole of it.

**`hoursOpen` is counted off `AFN Surface Venting Window or Door Opening
Factor`**, one series per openable window, an hour counted once however many
openings were open in it.

### The refusals

Every one of these is Principle IV in this feature's terms.

| Condition | Reading | Sheet says |
|---|---|---|
| No run yet, or the run failed | every field `null` | em dash, per the readout's rule |
| `airModel === 'Scheduled'`, or the channel is out | every field `null` | absent, not zero |
| The ACH series are not in the ESO | every field `null`, **not zero** | em dash. A missing series means the network was not in the path, which is not a measurement of no flow. |
| The openings never opened | `hoursOpen === 0` with the series present | **"the openings never opened"**, in words. FR-016: the zero is real here and reads as a measurement, so it is said rather than lettered. |
| No opening exists at all | `hoursOpen === null` | the row is omitted, as the demand rows are omitted when their meters are absent |

The last two are deliberately different, and the distinction is the same one the
demand rows already draw: a building with no openings is not a building whose
openings never opened.

### Which environments are read

The billed ones, through `environmentRuns`, exactly as `readExtremes` and
`readDemand` already do. A design-day run's two environments carry no meaningful
annual mean, so the readout letters the range rather than the mean where the run
is not a year, by the rule the bill's per-m² row already follows.

---

## Relationships and the order they run in

```
params.airModel ─┬─ 'Scheduled' → applyAir writes ZoneInfiltration + ZoneVentilation
                 └─ 'Network'   → applyNetwork writes the six AFN types
                                       │
                                       ├── reads geometryFacts(doc).grossVolume
                                       ├── reads surfaceGeometry(doc) for areas
                                       ├── reads opensOutdoors(doc, name)
                                       └── reads Site:Location.elevation
                                              │
                                       (applyFabric has already written the
                                        boundaries: appliers run in strip order,
                                        and Fabric is 07 to Air's 09)
```

The dependency on `applyFabric` running first is the same one `applyGlazing`,
`applySkylights` and `applyShading` already have, and it is why
`opensOutdoors` can be asked of the document rather than of `params`: one
question covers both a wall set adiabatic on the boundary key and the whole
Fabric channel being patched out.

## State transitions

There is one, and it is the run in which the reader switches models.

| From | To | What must happen |
|---|---|---|
| Scheduled | Network | scheduled objects deleted, AFN objects written, the seven scheduled controls withdrawn, `lastNetwork` still null so the readout letters an em dash until the new run lands |
| Network | Scheduled | AFN objects deleted, scheduled objects written, the network's controls withdrawn **at the values they held**, `lastNetwork` cleared so no network reading stands over a scheduled run |

FR-003's "the value must not reach the model" and User Story 2's scenario 3
"the scheduled controls return at the values they held" are not in tension:
`params` keeps every key at all times, and `needs` decides only what is offered
and what is applied. That is how `uFactor` already survives a trip through the
layered glazing model.

The readings coming down is `clearReadings`'s existing job, and `lastNetwork`
joins `lastGlass` in it. The spec's last edge case, "the previous model's
readings must come down where they stop being true", is therefore the existing
mechanism applied to one more variable, not new behaviour.
