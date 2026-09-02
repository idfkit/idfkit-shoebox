# Contract: the Air channel (`src/controls.js`)

The declaration surface. `controls.js` is the single source of truth: the
console draws from it, the model applies from it, the sheet reads stops from it,
and the link codec validates against it. Everything below is a change to the
`air` channel's declaration and to nothing else.

**No new control kind.** Every control here is a `Scale`, a `Selector` or a
`Facade`. That is what keeps `console.js`'s `buildControl`, `permalink.js`'s
`readValue` and the study scheduler untouched: `buildControl` throws for a kind
it cannot draw, and `readValue`'s numeric regex runs before its per-kind switch,
so a new kind would need teaching in two places that fail in opposite
directions. Neither applies.

## The channel head

```js
new Channel({
  id: 'air',
  index: '09',
  name: 'Air',
  term: 'Qinf',
  blurb: /* unchanged in subject, extended to name both models */,
  bypassed: true,
  requires: { test, reason },   // NEW
  meter: /* unchanged */,       // FR-004a: one term, one meter, both models
  readout: new Readout({ ... }),// NEW
  controls: [ /* below */ ],
})
```

### `requires`: the gate the measurement forced

```js
requires: {
  // A pressure network needs something to leak through. With Fabric patched
  // out, or every surface of its key set adiabatic, there is no exterior
  // surface left and the engine stops at get-input:
  //
  //   ** Severe ** AirflowNetwork::Solver::get_input: An
  //                AirflowNetwork:MultiZone:Surface object is required but
  //                not found.
  //   ** Fatal  ** Errors found getting inputs.
  //
  // The scheduled model has no such requirement: it puts air into a zone
  // without asking where it came through, which is exactly the difference
  // between the two models. So the precondition is conditional on which one
  // is in force, and the channel stays engaged under the scheduled one.
  //
  // `off` rather than `on`, for the reason the Glazing strip's gate gives:
  // Fabric is declared at 07, two strips above this one, so `on('fabric')`
  // would be reading a channel that has been decided — but being patched out
  // is an input to that loop rather than something the loop decides, and can
  // be asked in any order.
  test: (p, on, off) =>
    p.airModel !== 'Network' ||
    (!off('fabric') && SURFACE_FACES.some(({ face }) => opensOut(p, face))),
  reason: 'The pressure network needs a surface with an outside to leak through — every surface of this box is adiabatic.',
}
```

`SURFACE_FACES` is all six, not the four walls: a box whose walls are all
adiabatic but whose roof is not still has something to leak through, and gating
on the walls alone would refuse a building the engine runs perfectly.

**Verified**: with Fabric patched out the channel is blocked, the strip states
the reason, and no AFN object is written, so the fatal is unreachable rather
than caught.

### `readout`: FR-013

```js
readout: new Readout({
  label: 'As run',
  note: 'The air change rate the weather actually produced, off the run: the '
      + 'cracks and the openings together. It is a result and not a setting — '
      + 'the rate above is what the envelope was specified at, this is what '
      + 'this climate did with it.',
})
```

The class needs no change. `console.js`'s `buildReadout` already draws a value
and a sub-line for any channel carrying one, and `setReadings` already letters
an em dash where the map has no entry, which is FR-013's "an em dash before the
first run" for free.

## The controls

Ten additions, and one edit repeated across the ten that already exist.

### 1. The choice

```js
new Selector({
  key: 'airModel',
  label: 'Air model',
  value: 'Scheduled',
  note: 'Scheduled states a rate and the weather only gates it. The network '
      + 'states how leaky the envelope is and how large the openings are, and '
      + 'computes the rate from wind and stack effect each timestep. The '
      + 'engine simulates one or the other, never both. The network cannot '
      + 'open a rooflight: a near-horizontal opening has no bottom and top for '
      + 'a neutral plane to sit between, so a desk that needs roof ventilation '
      + 'stays on the scheduled model.',
  options: [
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Network', label: 'Network' },
  ],
})
```

The `note` is where FR-008a lands: the two models differ in capability, and the
sentence is at the point the choice is made rather than discovered after it.
The rooflight limit is the **only** capability the network loses. An earlier
draft of this contract also claimed it had no wind speed bound; it has one, and
the note must not say otherwise.

### 2. The network's controls

Every one carries `needs: network`, where `const network = (p) => p.airModel === 'Network'`.

```js
new Scale({
  key: 'envLeak', label: 'Envelope leakiness', value: 0.5,
  min: 0, max: 3, step: 0.01, digits: 2, unit: 'ACH', zero: 'Sealed',
  landmarks: INFILTRATION,          // the same bands, deliberately
  needs: network,
  note: 'At a 4 Pa reference, split over every surface with an outside by its '
      + 'own area. What the model was given for it, and what the run made of '
      + 'it, are both lettered below.',
})
```

**`INFILTRATION` is reused rather than copied.** Both quantities are air
changes per hour at natural conditions, so the published cases a reader reads
0.5 against are the same cases, and the ranges and steps match so all four
`readLandmarks` rules already hold. A second set of bands would be the second
source of truth Principle III forbids, in the one place where the two models
have to agree about what a word means.

```js
new Facade({
  key: 'openable',
  label: 'Openable area',
  short: 'Openable',
  sides: OPENABLE_SIDES,
  min: 0, max: 1, step: 0.01, digits: 2,
  zero: 'Shut',
  needs: network,
})
```

with

```js
// The same two questions the overhang key already asks, because they are the
// same two questions: an operable window is cut from the opening it sits in,
// so a wall with no glass has nothing to open, and a wall with no outside has
// nowhere to open onto. Reused rather than restated — the sentences exist.
const OPENABLE_SIDES = WALL_FACES.map(({ face, label, wwr, openable }) => ({
  key: openable,
  side: face,
  label,
  needs: (p) => opensOut(p, face) && p[wwr] > 0,
  unreached: (p) => (opensOut(p, face) ? noOpening(face) : noOutside(face)),
}));
```

`WALL_FACES` gains an `openable` key beside its existing `wwr` and `overhang`,
which is the one edit outside the channel itself.

`noOpening`'s sentence is written for an overhang and reads correctly for an
opening ("has no opening, so an overhang there hangs on nothing" does not).
It needs a per-key variant or a parameter; the task list should treat that as
copy work, since a wrong sentence here is a refusal naming the wrong cause,
which the `Side` class exists to prevent.

```js
new Selector({
  key: 'openRule', label: 'Openings obey', value: 'Temperature',
  needs: network,
  options: [
    { value: 'NoVent', label: 'Never' },
    { value: 'Constant', label: 'Always' },
    { value: 'Temperature', label: 'Indoor temperature' },
    { value: 'Enthalpy', label: 'Enthalpy difference' },
    { value: 'ASHRAE55Adaptive', label: 'ASHRAE 55 adaptive' },
    { value: 'CEN15251Adaptive', label: 'EN 16798 adaptive' },
  ],
})
```

The values are the enum of `ventilation_control_mode` verbatim, so nothing is
translated on the way into the document and a value that reaches the field
cannot be one the engine rejects. `CEN15251Adaptive` is labelled EN 16798
because that is the standard that replaced EN 15251; the engine's field name is
the old one and the label is the reader's.

```js
new Scale({
  key: 'openSetpoint', label: 'Open above indoor', value: 22,
  min: 10, max: 32, step: 0.5, digits: 1, unit: '°C',
  needs: (p) => network(p) && NEEDS_SETPOINT.has(p.openRule),
})
new Scale({
  key: 'openDeltaLo', label: 'Full open at ΔT', value: 0,
  min: 0, max: 20, step: 0.5, digits: 1, unit: 'K',
  needs: network,
})
new Scale({
  key: 'openDeltaHi', label: 'Shut above ΔT', value: 100,
  min: 1, max: 100, step: 1, digits: 0, unit: 'K',
  needs: network,
})
new Scale({
  key: 'openMaxWind', label: 'Shut above wind', value: 40,
  min: 1, max: 40, step: 0.5, digits: 1, unit: 'm/s',
  landmarks: WIND,
  needs: (p) => network(p) && anyOpenable(p),
  note: 'No AirflowNetwork object carries a wind speed, so this one reaches '
      + 'the run through a short EMS program rather than through a field. '
      + 'Left at the stop the window never shuts: 40 m/s is past a hurricane.',
})
```

**`openMaxWind` mirrors the scheduled model's `ventMaxWind` exactly**: same
range, same step, same `WIND` landmarks, same default and the same closing
sentence about the stop. A reader who has been working in one model finds the
same face in the other, which is the point. What differs is only where it
lands, and that is stated in the note rather than left as a surprise.

It is gated on `anyOpenable` and not on `network` alone, because a bound on
openings that do not exist reaches no actuator: `applyWindBound` writes nothing
where no wall is openable, so offering the control there would be the dead
control this whole arrangement is built to prevent.

`NEEDS_SETPOINT` is declared here and **read by `applyAir`**, so the one place
that decides whether a setpoint is needed is the same place that decides whether
it is offered. Split between the two, a rule added to the selector and missed in
the applier is the measured get-input fatal.

### 3. The scheduled model's controls

Ten keys, unchanged but for their `needs`:

```js
const scheduled = (p) => p.airModel === 'Scheduled';
// infiltration:    needs: scheduled
// infConstant:     needs: (p) => scheduled(p) && p.infiltration > 0
// infWind:         needs: (p) => scheduled(p) && p.infiltration > 0
// infStack:        needs: (p) => scheduled(p) && p.infiltration > 0
// ventilation:     needs: scheduled
// ventType:        needs: (p) => scheduled(p) && p.ventilation > 0
// ventMinIndoor:   needs: (p) => scheduled(p) && p.ventilation > 0
// ventMaxOutdoor:  needs: (p) => scheduled(p) && p.ventilation > 0
// ventDeltaT:      needs: (p) => scheduled(p) && p.ventilation > 0
// ventMaxWind:     needs: (p) => scheduled(p) && p.ventilation > 0
```

**No default, range, step or landmark moves.** That is what keeps
`DEFAULTS_BY_VERSION.v1` frozen as it stands, `LINK_VERSION` at 1 and
`MIGRATIONS` empty. FR-020's pre-feature links carry none of the nine new keys,
take the new defaults, and land on `airModel: 'Scheduled'` with every scheduled
control exactly where it was.

## Invariants that must throw at module load

Two are existing machinery applied to new declarations, and one is new.

1. **`readLandmarks`'s four rules** over `envLeak`'s reuse of `INFILTRATION`.
   Free, since the range and step are identical to `infiltration`'s.
2. **`Side`'s "a precondition with no reason" check** over the four
   `OPENABLE_SIDES`. Free.
3. **NEW: `NEEDS_SETPOINT` must be a subset of `openRule`'s option values.** A
   mode named in the set but not in the selector is dead; a mode in the selector
   that needs a setpoint and is missing from the set is the measured fatal. One
   assertion at module load covers both directions, and it belongs beside the
   declaration rather than in the applier, by the rule that declaration errors
   throw at load rather than degrade at run time.

## What this contract deliberately does not add

- **No second meter.** FR-004a: one term of the zone air balance, one meter,
  across both models. The rail's `Zone Air Heat Balance Outdoor Air Transfer
  Rate` was measured present and carrying the network's flows.
- **No `prices: true`.** Everything here reaches the IDF, so everything here
  belongs in `shapeKey` and must start a run.
