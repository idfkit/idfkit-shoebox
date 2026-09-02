# Contract: the network half of `applyAir` (`src/model.js`)

One applier, two models, and the rule that the model that is out has its objects
**deleted rather than zeroed**. This is Bypass's rule extended to a selector,
and it is what keeps the drawing, the IDF and the engine's warning count all
agreeing about what is in the path.

## Signature and the sweep

```js
/** 09 — the air the building trades with outdoors, by one of two models. */
function applyAir(doc, params, engaged) {
  for (const type of AIR_TYPES) clear(doc, type);
  if (!engaged) return;
  if (params.airModel === 'Network') applyNetwork(doc, params);
  else applyScheduled(doc, params);
}
```

```js
// Every type either model owns, cleared on every apply whichever is in force.
//
// Clear-and-rewrite rather than differential, for the reason `syncReporting`
// gives: it is the only arrangement under which a desk that has just shrunk —
// four openable walls down to one, six exterior surfaces down to three, or the
// whole model switched — serialises byte-identically to one built that way.
// It is also FR-002a: the engine's own rule is that a network makes it discard
// every scheduled object, with one warning line in a file nobody opens, and
// the warning count is something the title block reports.
const AIR_TYPES = Object.freeze([
  'ZoneInfiltration:DesignFlowRate',
  'ZoneVentilation:DesignFlowRate',
  'AirflowNetwork:SimulationControl',
  'AirflowNetwork:MultiZone:Zone',
  'AirflowNetwork:MultiZone:ReferenceCrackConditions',
  'AirflowNetwork:MultiZone:Surface:Crack',
  'AirflowNetwork:MultiZone:Component:SimpleOpening',
  'AirflowNetwork:MultiZone:Surface',
  // The wind bound. Cleared by type like the rest, which is safe only while
  // nothing else on this desk uses EMS -- the day a second feature wants an
  // Erl program, this has to narrow to the objects `applyAir` wrote by name
  // or it will delete that feature's program on every apply.
  'EnergyManagementSystem:Sensor',
  'EnergyManagementSystem:Actuator',
  'EnergyManagementSystem:Program',
  'EnergyManagementSystem:ProgramCallingManager',
]);
```

The setpoint schedule is dropped by name (`drop(doc, 'Schedule:Compact', AFN_SETPOINT)`)
rather than by type, since `clear` on `Schedule:Compact` would take the
occupancy band and the always-on schedule with it.

**There is no `_MAX` constant here**, unlike `SKY_MAX` and `PANE_MAX`. Those
exist because their appliers sweep names generated from a slider, so a literal
would leave orphans the first time the slider widened. Here the object count
comes off the document's own surfaces and the clear is by type, so a shrink is
covered by construction.

## `applyNetwork`

```js
function applyNetwork(doc, params) {
  const facts = geometryFacts(doc);
  const ext = surfaceGeometry(doc).filter((s) => s.boundary === 'outdoors');
  // The channel's own `requires` has already refused this case, so an empty
  // list here is a bug rather than a state — the engine's answer to it is a
  // get-input fatal, so this throws by the same rule `must` does.
  if (!ext.length) throw new Error('a pressure network with no exterior surface to leak through');
  ...
}
```

### 1. Simulation control

```js
doc.add('AirflowNetwork:SimulationControl', 'Network', {
  airflownetwork_control: 'MultizoneWithoutDistribution',
  wind_pressure_coefficient_type: 'SurfaceAverageCalculation',
  height_selection_for_local_wind_pressure_calculation: 'OpeningHeight',
  building_type: 'LowRise',
  azimuth_angle_of_long_axis_of_building: longAxis(facts),
  ratio_of_building_width_along_short_axis_to_width_along_long_axis: widthRatio(facts),
});
```

`SurfaceAverageCalculation` is what avoids `ExternalNode`,
`WindPressureCoefficientArray` and `WindPressureCoefficientValues` entirely. The
engine documents it for rectangular buildings, which this box is, and it is why
a reader entering measured pressure coefficients is out of scope.

**`longAxis` and `widthRatio` are read off `facts.faces`, never off
`params.width` and `params.depth`.** `buildSample` hands the applier a document
carrying a sweep's overlay, so a fact taken from live parameters would describe
the desk instead of the sample. The two functions:

```js
/**
 * The bearing of the building's longer plan dimension, folded into 0 to 180.
 *
 * Off each wall's own outward normal rather than off the width and depth
 * parameters, so it stays true under `turn()` — the vertices carry the
 * orientation and `Building.north_axis` is pinned at 0, so a building turned
 * 40° has walls whose bearings are 40, 130, 220, 310 and nothing named "south"
 * facing south. The field's range is 0 to 180 because an axis has no front.
 */
function longAxis(facts)

/**
 * Short plan dimension over long, in (0, 1].
 *
 * Clamped at 1 because the field's maximum is 1 and a square box computes to
 * exactly that; floating point can put it a hair over.
 */
function widthRatio(facts)
```

### 2. The zone, and its rule

```js
const setpoint = NEEDS_SETPOINT.has(params.openRule)
  ? writeSetpoint(doc, params.openSetpoint)
  : undefined;

doc.add('AirflowNetwork:MultiZone:Zone', null, {
  zone_name: ZONE_NAME,
  ventilation_control_mode: params.openRule,
  ventilation_control_zone_temperature_setpoint_schedule_name: setpoint,
  indoor_and_outdoor_temperature_difference_lower_limit_for_maximum_venting_open_factor: params.openDeltaLo,
  indoor_and_outdoor_temperature_difference_upper_limit_for_minimum_venting_open_factor: params.openDeltaHi,
});
```

**`NEEDS_SETPOINT` is imported from `controls.js`, not restated here.** FR-011
is met by making the fatal unreachable: the same set decides whether the control
is offered and whether the schedule is written, so a mode added to one and
missed in the other cannot happen. The measured fatal, for the comment:

```
** Severe ** AirflowNetwork::Solver::get_input: : AirflowNetwork:MultiZone:Zone = ZONE ONE
**  ~~~   ** Ventilation Control Zone Temperature Setpoint Schedule Name cannot be
             empty when Ventilation Control Mode = TEMPERATURE.
**  Fatal ** Errors found getting inputs.
```

The schema marks that field optional, so `validate_model` passes and the engine
is the first thing to object.

### 3. Reference conditions, off the site

```js
const elevation = Number(must(doc, 'Site:Location').elevation);
doc.add('AirflowNetwork:MultiZone:ReferenceCrackConditions', REF_CONDITIONS, {
  reference_temperature: REF_TEMP_C,          // 20
  reference_barometric_pressure: barometric(elevation),
  reference_humidity_ratio: 0,
});
```

```js
/**
 * Site pressure from elevation, by the standard atmosphere the engine uses.
 *
 * FR-009, and it is worth a run: left at the sea-level default this raises
 *
 *   ** Warning ** Pressure = 101325 differs by more than 10% from Standard
 *                 Barometric Pressure = 81198.
 *
 * on the desk's own default station, which stands at 1,829 m. The title block
 * letters the warning count, so a warning nobody can act on is a number on the
 * sheet that means nothing. Set from the site, measured: gone.
 */
const barometric = (z) => 101325 * (1 - 2.25577e-5 * z) ** 5.2559;
```

The elevation comes off `Site:Location` in the document rather than off the
station the picker holds, for the reason every fact here does: the document is
what was simulated.

### 4. The cracks

```js
const total = ext.reduce((sum, s) => sum + polygonArea(s.verts), 0);
const coefficient = crackCoefficient(params.envLeak, facts.grossVolume);

for (const s of ext) {
  const name = `${CRACK} ${s.name}`;
  doc.add('AirflowNetwork:MultiZone:Surface:Crack', name, {
    air_mass_flow_coefficient_at_reference_conditions:
      coefficient * (polygonArea(s.verts) / total),
    air_mass_flow_exponent: FLOW_EXPONENT,
    reference_crack_conditions: REF_CONDITIONS,
  });
  doc.add('AirflowNetwork:MultiZone:Surface', null, {
    surface_name: s.name,
    leakage_component_name: name,
    window_door_opening_factor_or_crack_factor: 1,
  });
}
```

```js
/**
 * A stated air change rate, as the whole envelope's mass flow coefficient.
 *
 *   Q  = ach · V / 3600        m³/s
 *   ṁ  = ρ · Q                 kg/s
 *   C  = ṁ / ΔP^n              kg/s at 1 Pa
 *
 * at ΔP = 4 Pa, which is the natural-conditions reference the scheduled
 * model's `infiltration` already works in ("not the ACH50 a blower door
 * reports"). Keeping one reference is what lets both models share the
 * INFILTRATION landmark bands.
 *
 * The returned figure is for the envelope as a whole and is split between the
 * surfaces by area at the call site. That split is not cosmetic:
 * `air_mass_flow_coefficient_at_reference_conditions` is the coefficient for
 * that entire surface, not per square metre, and writing a per-square-metre
 * figure there runs clean, validates clean, warns about nothing, and is wrong
 * by about eighty-fold — measured at 0.0007 ACH against a stated 0.5. The
 * check that the split is right is that it is linear: tripling `ach` triples
 * the computed rate (0.154 → 0.451 on Golden, a factor of 2.93).
 *
 * `grossVolume` carries the zone multiplier, so a stacked building leaks in
 * proportion to its size and the resulting rate is per building, as every
 * other intensity on this sheet is.
 */
const crackCoefficient = (ach, volume) =>
  (AIR_DENSITY * ach * volume / 3600) / REF_DELTA_P ** FLOW_EXPONENT;
```

Constants, declared once: `AIR_DENSITY = 1.2041`, `REF_DELTA_P = 4`,
`FLOW_EXPONENT = 0.65`, `REF_TEMP_C = 20`.

**Every exterior surface leaks, including the roof and including a surface
carrying rooflights.** Nothing is subtracted for the glazing: the opaque area
and the glazed area both leak, and splitting the envelope coefficient by full
surface area is what makes the sum come back to the stated rate.

### 5. The openings

```js
const walls = WALL_FACES.filter(({ face, name, openable }) =>
  params[openable] > 0 && opensOutdoors(doc, name));

const openable = [];   // the window names, for the wind bound's actuators

if (walls.length) {
  doc.add('AirflowNetwork:MultiZone:Component:SimpleOpening', OPENING, {
    air_mass_flow_coefficient_when_opening_is_closed: 0.001,
    air_mass_flow_exponent_when_opening_is_closed: FLOW_EXPONENT,
    minimum_density_difference_for_two_way_flow: 0.0001,
    discharge_coefficient: 0.6,
  });
  for (const wall of walls) {
    for (const window of openingsOn(doc, wall.name)) {
      openable.push(window.name);
      doc.add('AirflowNetwork:MultiZone:Surface', null, {
        surface_name: window.name,
        leakage_component_name: OPENING,
        window_door_opening_factor_or_crack_factor: params[wall.openable],
        ventilation_control_mode: 'ZoneLevel',
      });
    }
  }
}

// The wind bound acts on the openings, so it is written from the same list
// rather than recomputed. Nothing is written where nothing is openable.
applyWindBound(doc, params, openable);
```

Three rules, each of which is a measured refusal:

**`opensOutdoors(doc, name)`, not `params`.** The same question
`applyGlazing`, `applySkylights` and `applyShading` ask, and it covers both ways
a wall loses its outside: its own face of the boundary key, and the Fabric
channel patched out, which no parameter records at all. Appliers run in strip
order and Fabric is 07 to Air's 09, so the boundaries are already written.

**Only fenestration hosted on a wall.** A window whose host is the roof is
within 10° of horizontal, and both opening models refuse it: the vertical model
because there is no bottom and top for a neutral plane to sit between, the
horizontal model because it is formulated between two zones and outdoors is an
external node with a wind pressure rather than a zone with a density. Both are
fatal, on every rooflight. This is FR-008, and the interface half of it belongs
on the Skylights strip, in the place that strip already says rooflights fall
outside the blind.

**A wall with no glass contributes no opening**, because `openingsOn` returns
nothing for it. The reader is told before they get here, by the `Side`'s own
refusal on the plan key, so this is the applier agreeing with the interface
rather than a second gate.

## `applyWindBound`

FR-012, and the one part of this feature that reaches the run through a program
rather than through a field.

```js
/**
 * Shut the openings above a wind speed.
 *
 * No AirflowNetwork object carries a wind speed: not `MultiZone:Zone`, not
 * `MultiZone:Surface`, and not `OccupantVentilationControl`, which carries
 * comfort curves, a PPD threshold and opening probabilities and nothing about
 * wind. `venting_availability_schedule_name` is a schedule and cannot read one
 * either.
 *
 * The engine does expose it, though, and the actuator dictionary says so:
 *
 *   EnergyManagementSystem:Actuator Available,ZN001:WALL001:WIN001,
 *     AirFlow Network Window/Door Opening,Venting Opening Factor,[Fraction]
 *
 * with `Site Wind Speed` sensed off `Environment`. So the bound is a five-line
 * Erl program called at `BeginTimestepBeforePredictor`.
 */
function applyWindBound(doc, params, windows)
```

Written only where `windows` is non-empty. Four objects plus one actuator per
openable window:

```js
doc.add('EnergyManagementSystem:Sensor', 'WindSpeed', {
  output_variable_or_output_meter_index_key_name: 'Environment',
  output_variable_or_output_meter_name: 'Site Wind Speed',
});

const lines = [{ program_line: `IF WindSpeed > ${params.openMaxWind}` }];
windows.forEach((name, i) => {
  doc.add('EnergyManagementSystem:Actuator', `Vent${i}`, {
    actuated_component_unique_name: name,
    actuated_component_type: 'AirFlow Network Window/Door Opening',
    actuated_component_control_type: 'Venting Opening Factor',
  });
  lines.push({ program_line: `SET Vent${i} = 0.0` });
});
lines.push({ program_line: 'ELSE' });
// `Null` hands the actuator back to the engine's own venting control, which is
// what makes this a bound on the opening rule rather than a replacement for
// it. An EMS actuator holds whatever it was last set to, so writing a value
// here instead -- `SET Vent0 = 0.5`, the obvious thing -- overrides the rule
// outright for every hour the wind is below the limit. Measured on the stock
// desk with the zone on `Temperature` at 22 degrees: 8,808 hours open of
// 8,808, against 2,601 with the release, and 4.160 ACH against 0.419. Exit 0,
// zero warnings, nothing in the error file. There is no signal for this
// anywhere but the reading.
windows.forEach((_, i) => lines.push({ program_line: `SET Vent${i} = Null` }));
lines.push({ program_line: 'ENDIF' });

doc.add('EnergyManagementSystem:Program', 'ShutOnWind', {}).set('lines', lines);
doc.add('EnergyManagementSystem:ProgramCallingManager', 'WindManager', {
  energyplus_model_calling_point: 'BeginTimestepBeforePredictor',
}).set('programs', [{ program_name: 'ShutOnWind' }]);
```

Three things this contract pins:

**The threshold is a literal in generated program text.** It is the only thing
this feature writes whose serialised form changes with a slider in a way that
is not a field value, so idempotence must be asserted over the program text and
not merely over the object count.

**`Null` composes, and it was verified rather than assumed.** With the bound set
where it cannot bite (99 m/s), the `Zone Air Heat Balance Outdoor Air Transfer
Rate` series differs from a run with no EMS at all by a maximum of **0 W over
8,808 hours**. The bound is a perfect no-op until it bites.

**It costs nothing on a design day.** 0.07 s engine elapsed either way, +4 ms of
wall clock, inside the noise of process startup. The annual run pays about 8 %.
Both measured over three interleaved passes.

## Reporting

Two additions to `syncReporting`'s `'sheet'` profile, gated on the channel the
way the balance-rail terms already are:

```js
if (state.get('air').engaged && params.airModel === 'Network') {
  addVariable(doc, 'AFN Zone Infiltration Air Change Rate', 'Hourly');
  addVariable(doc, 'AFN Zone Ventilation Air Change Rate', 'Hourly');
  if (anyOpening) {
    doc.add('Output:Variable', null, {
      key_value: '*',
      variable_name: 'AFN Surface Venting Window or Door Opening Factor',
      reporting_frequency: 'Hourly',
    });
  }
}
```

**The gate is not optional.** Without it EnergyPlus lists every unproducible
variable at the end of the error file and inflates the warning count the title
block reports, which is the reason `syncReporting` gates the rail terms and the
end-use meters already.

**The key `*` is safe here and is the exception that proves the rule.**
`CLAUDE.md`'s warning is about per-surface variables requested across 158
surfaces, which took an annual run from 681 ms to 2,984 ms. This one resolves
to one series per **openable window**, at most four on this desk, and it is the
only variable the engine publishes for the hours-open reading. Measured: three
new series against the run's twenty, ESO 3 % larger, no detectable time.

**The lean profiles get nothing.** `'extremes'` and `'energy'` are read for one
temperature series and four meters; neither reads the network, and adding the
requests would break the "lean then sheet serialises byte-identically to always
sheet" property the sweep's restore depends on.

## Verification obligations

These belong to the harness, not to the reader, and each one answers a way this
could be silently wrong.

1. **Idempotence.** `applyModel` three times over, byte-identical output, under
   both models and across a switch between them.
2. **The shrink.** A desk taken from four openable walls to one, and from six
   exterior surfaces to three, serialises byte-identically to one built that
   way.
3. **The linearity.** Tripling `envLeak` triples the computed rate. This is the
   check that the area split is right, and it is the one that would have caught
   the eighty-fold error.
4. **The exclusivity.** With `airModel: 'Network'` the document holds no
   `ZoneInfiltration:*` and no `ZoneVentilation:*`, and `eplusout.err` carries
   no discard warning. With `'Scheduled'` it holds no `AirflowNetwork:*`.
5. **The three fatals are unreachable.** No exterior surface is refused by
   `requires`; every setpoint-needing mode gets a schedule; no rooflight is ever
   linked to an opening component. Exhausted over the six rules against the
   desk's geometry cases, which is SC-009.
6. **The wind bound bounds rather than replaces.** Two runs at the same desk,
   the bound at 99 m/s and the bound absent entirely, must agree on the outdoor
   air term to **0 W over every hour**. Then the bound at 4 m/s must reduce the
   hours open without reaching either extreme: on the measured desk 3,896 to
   2,601, and never the 8,808 that says the actuator was forced instead of
   released.
7. **The Erl text is idempotent.** Three applies produce byte-identical program
   lines, and a desk taken from four openable walls to one produces the program
   a desk built at one produces. The threshold is a literal in that text, so
   this is not covered by the object-count check.
