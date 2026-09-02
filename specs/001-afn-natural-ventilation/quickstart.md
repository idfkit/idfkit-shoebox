# Quickstart: validating the pressure network

**Feature**: Natural ventilation by pressure network (`001-afn-natural-ventilation`)

There is no test runner and no linter in this repository. Verification is done
by throwaway Node harnesses under `.harness/` and then by driving the page, in
that order, because the browser is a slow place to find out that a model is
wrong. This guide is the running order and the numbers each step has to hit.

Every figure below was measured during Phase 0 on the stock desk against
EnergyPlus 26.1.0 natively. They are gates, not illustrations: a step that
comes back with a different number has found something.

## Prerequisites

```bash
npm install
npm run predev          # stages the engine, schemas and station index
```

EnergyPlus 26.1.0 at `/Applications/EnergyPlus-26-1-0`. Where none is
installed, `public/energyplus/energyplus.js` runs the same models under Node;
set `global.Module` to `{ noInitialRun: true, locateFile }` before requiring it,
and clear the require cache between runs, because `main` is not re-entrant.

Outside the browser the schema comes from `localBundle()` in
`@idfkit/schemas/node` and it wants the full version string:

```js
import { localBundle } from '@idfkit/schemas/node';
const schema = await localBundle().load('26.1.0');
```

Weather: `/Applications/EnergyPlus-26-1-0/WeatherData/USA_CO_Golden-NREL.724666_TMY3.epw`,
which is the station the default desk already carries and the one every figure
here was taken against.

---

## 1. The model, outside the browser

Build the document at several console positions, write each IDF, run each one.

### 1.1 Idempotence, including across a model switch

```
applyModel three times → byte-identical output
```

Under `airModel: 'Scheduled'`, under `'Network'`, and after
`Scheduled → Network → Scheduled`, which must serialise identically to a desk
that was never switched.

### 1.2 The shrink

A desk taken **from four openable walls to one** must serialise byte-identically
to one built at one. Likewise **six exterior surfaces to three**. This is what
`AIR_TYPES`'s clear-and-rewrite buys and it is the assertion that proves no
orphan is left behind.

### 1.3 Exclusivity

| Under | The document must hold | And must not hold |
|---|---|---|
| `Scheduled` | `ZoneInfiltration:*`, `ZoneVentilation:*` | any `AirflowNetwork:*` |
| `Network` | six `AirflowNetwork:*` types, plus the four `EnergyManagementSystem:*` where a wall is openable | any `ZoneInfiltration:*` or `ZoneVentilation:*` |

And under `Network`, `eplusout.err` must carry **no discard warning**. The one
the engine would otherwise write is:

```
..Specified AirflowNetwork Control = "MultizoneWithoutDistribution" and
  ZoneInfiltration:* objects are present. ..ZoneInfiltration objects will not
  be simulated.
```

Its absence is FR-002a, and it is checkable by grep.

### 1.4 Schema and integrity

Every IDF through `validate_model`, then `check_model_integrity`, then
`run_simulation`. **Schema validation passing means very little here**: the
missing-setpoint fatal is a field the schema marks optional, and the eighty-fold
crack error validates perfectly. The run is the gate.

### 1.5 Output variables against the `.rdd`

Confirm each name exists rather than guessing its spelling, then grep
`eplusout.err` for "requested but not generated". The three:

```
AFN Zone Infiltration Air Change Rate                 [ach]  hourly, zone
AFN Zone Ventilation Air Change Rate                  [ach]  hourly, zone
AFN Surface Venting Window or Door Opening Factor     [ ]    hourly, per opening
Site Wind Speed                                       [m/s]  the EMS sensor's source
```

The EMS actuator is confirmed the same way, off `eplusout.edd` with
`Output:EnergyManagementSystem` set to verbose. It is a debugging aid only and
must **not** be left in the shipped model:

```
EnergyManagementSystem:Actuator Available,<window>,
  AirFlow Network Window/Door Opening,Venting Opening Factor,[Fraction]
```

---

## 2. The leakage arithmetic

This is the step that matters most, because the way it goes wrong runs clean.

### 2.1 The linearity check

Openings shut (`openRule: 'NoVent'`) so the reading is leakage alone. Annual,
Golden:

| `envLeak` | Computed mean | Median | Min | Max |
|---|---|---|---|---|
| 0.50 ACH | **0.154 ACH** | 0.144 | 0.016 | 0.609 |
| 1.50 ACH | **0.451 ACH** | 0.418 | 0.044 | 1.824 |

**The gate is 0.451 / 0.154 = 2.93, within a few percent of 3.** Tripling the
stated rate must triple the computed one. A per-square-metre coefficient written
where a whole-surface one belongs gives a computed mean of about **0.0007 ACH**
against a stated 0.5 and completes with zero warnings, so this ratio is the only
thing standing between the sheet and an eighty-fold error nothing else reports.

### 2.2 The gap is expected

The computed rate is about **31 % of the stated rate**, because real driving
pressures average well under the 4 Pa reference. That gap is the feature, not a
defect. What must never happen is the two figures agreeing, which would mean the
run's own answer had been used to calibrate the run.

---

## 3. The failures that must be unreachable

SC-009. The first three are measured get-input fatals and the gate is that no
reachable combination of the controls can produce one. The fourth is worse than
a fatal, because it runs clean.

### 3.1 No exterior surface

Patch Fabric out, or set all six surfaces adiabatic, with `airModel: 'Network'`.

**Expected**: the Air channel is **blocked** by `requires`, the strip states the
reason, and **no AFN object is written**. The run completes.

Without the gate, measured:

```
** Severe ** AirflowNetwork::Solver::get_input: An AirflowNetwork:MultiZone:Surface
             object is required but not found.
** Fatal  ** Errors found getting inputs.
```

### 3.2 A rule with no setpoint

Every value of `openRule` in turn, on an otherwise fixed desk.

**Expected**: every one runs. Every mode in `NEEDS_SETPOINT` has a
`Schedule:Compact` written and named on the zone object.

Without it, measured:

```
** Severe ** Ventilation Control Zone Temperature Setpoint Schedule Name cannot be
             empty when Ventilation Control Mode = TEMPERATURE.
```

### 3.3 A near-horizontal opening

A desk with rooflights and `airModel: 'Network'`.

**Expected**: the roof's window is linked to **no opening component**. The roof
surface itself may carry a crack. The run completes, and the Skylights strip
says the rooflights cannot be opened under the network.

### 3.4 The wind bound must bound, not replace

Not a fatal, which is why it needs its own gate: it runs clean either way.

Set `openMaxWind` to its top stop (40 m/s, where it cannot bite) and compare
against a desk with the EMS objects absent entirely.

**Expected**: the `Zone Air Heat Balance Outdoor Air Transfer Rate` series agree
to **0 W over every hour**. Then bring the bound down to 4 m/s and confirm the
hours open fall without collapsing to either extreme.

| | Hours open | Vent flow |
|---|---|---|
| Bound where it cannot bite | 3,896 | 0.684 ACH |
| Bound at 4 m/s | **2,601** | **0.419 ACH** |
| Actuator forced rather than released | **8,808** | 4.160 ACH |

**The third row is the bug.** `SET Vent0 = 0.5` in the else-branch instead of
`SET Vent0 = Null` overrides the opening rule outright: every hour of the year
open, exit 0, zero warnings, nothing in the error file. If the hours-open figure
equals the hours in the run, the release is missing.

### 3.5 Exhaust the grid

Six `openRule` values × the geometry cases in section 4. Every combination runs
with exit 0 and no severe error, which is SC-009 stated as a loop.

---

## 4. The geometry cases

SC-001. All annual, Golden, all must complete with **exit 0, zero severe
errors**. The three marked measured were run in Phase 0.

| Case | Expected |
|---|---|
| Stock desk, cracks only | **clean, 0.89 s** (measured) |
| Stock desk, cracks plus a south opening | **clean, 1.55 s** (measured) |
| Zone multiplier 3, gross volume 3,185.6 m³ | **clean, 0.82 s** (measured) |
| Two walls adiabatic | clean; the ratio denominators count only surfaces with an outside |
| No glazing at all | clean; every wall's openable control is refused with its own reason |
| Fabric patched out | the channel is blocked, per 3.1 |
| All four walls glazed at 0.3 and openable, bound at 4 m/s | **clean, 2.03 s** (measured). Four actuators and a ten-line Erl program, which is the largest this feature generates |

For the stacked case, the additional gate is that **every intensity divides by
`grossFloor`**: the computed ACH must be flat against the multiplier, because
stacking identical floors buys three times the air over three times the volume.

---

## 5. Latency

Principle VI, measured three times interleaved, the way the per-surface
measurement that took an annual run from 681 ms to 2,984 ms was taken.

| | Wall clock | Engine elapsed | Gate |
|---|---|---|---|
| Design day, scheduled | 161 ms | 0.05 s | baseline |
| Design day, network | 183 ms | 0.07 s | **≤ +30 ms** |
| Annual, scheduled | 581 ms | 0.47 s | baseline |
| Annual, network | 1,644 ms | 1.55 s | **≤ 4×** |

And the EMS wind bound on top, isolated by setting the bound where it cannot
bite so the physics is identical:

| | Wall clock | Engine elapsed | Gate |
|---|---|---|---|
| Design day, network | 176 ms | 0.07 s | baseline |
| Design day, network plus EMS | 180 ms | 0.07 s | **engine elapsed unchanged** |
| Annual, network | 1,351 ms | 1.24 s | baseline |
| Annual, network plus EMS | 1,453 ms | 1.34 s | **≤ 15 %** |

**The design-day gate is the one that matters.** Twenty milliseconds is 40 % of
the desk's 50 ms live budget. It passes FR-025, and it is spent: a change that
pushes it past 30 ms has taken the live cadence somewhere it should not go
without a decision.

The ESO grows from 20 series to 23, about 3 %.

---

## 6. The link

Codec changes are round-tripped. `permalink.js` is DOM-free, so this is a Node
harness.

1. **Every one of the nine new keys** encodes and decodes exactly.
2. **Every malformed input class is refused whole**: a bad `openRule` option, an
   `envLeak` out of range or off the step grid, an `openable` value above 1.
   Refused, never half-loaded, with the reason on the sheet.
3. **FR-020**: a link carrying no `airModel` key resolves to `Scheduled` and
   reproduces its original numbers exactly. The link stays at `v1`,
   `DEFAULTS_BY_VERSION.v1` is unchanged and `MIGRATIONS` stays empty, because
   every key here is an addition and additions are free under delta encoding.
4. **The reserved keys** (`in`, `out`, `stn`, `win`, `at`) still do not collide,
   asserted at module load.

---

## 7. Drive the page

A design day solves in about 70 ms with the network engaged, so the whole desk
can be exercised quickly and there is no excuse for not doing it.

| Story | What to do | What must be true |
|---|---|---|
| **US1** | Switch to the network with a year attached | the run completes; the readout letters a computed rate; the rate varies across the year and differs from any figure typed (SC-002) |
| **US1** | Raise `envLeak` | the computed rate rises and the heating demand rises with it |
| **US1** | Read the balance rail | the outdoor air term still closes the balance with the other four (measured present, mean −1,243 W against the scheduled model's −1,939 W) |
| **US2** | Switch models back and forth | **at no point is a control offered whose value reaches nothing** (SC-003); the scheduled controls return at the values they held |
| **US2** | Read the folded index row at 390 px | the model in force is named there (SC-006) |
| **US2** | Read the description under the plate | it names which model produced the air flow |
| **US3** | Set the same openable area on the west wall, then the south | **the computed flows differ** (SC-007) |
| **US3** | Set an openable area on a wall with no glazing | the offer is refused with that wall's own reason |
| **US3** | Set a wall adiabatic | its entry says the wall has no outside to open onto |
| **US4** | Each `openRule` in turn | the hours-open figure changes and the sheet reports it (FR-014) |
| **US4** | A rule under which the openings never open | the sheet says **"the openings never opened"**, not a zero (FR-016) |
| **US4** | Lower `openMaxWind` through its range on a windy site | the hours-open figure falls and the computed rate with it; at the top stop the run matches one with no bound at all |
| **US5** | Copy the link, open it in a fresh session | identical drawing, identical model text, identical numbers (SC-004) |
| **US5** | Start a study on an openable area | a curve on the same terms as every other study; four cards can stand at once under one plan key, each naming its wall |

### The staleness case

Switch models with a run on the sheet. The four blocks a run letters must
**stand with the previous run's numbers, dimmed**, until the new ones replace
them. They must not blank: the finding is a paragraph and `.finding:empty` is
`display: none`, so clearing it takes three lines out of the flow and pulls
everything below up the page for the length of the run. The previous model's
readout comes down where it stops being true, which is `clearReadings` on
`solve`'s failure exits, not at the start of a run.

---

## 8. The general notes

Part of done, not a follow-up.

- Re-read `NOTES` in `src/tour.js` against the new declaration. Seven Air
  controls now appear under one model only, so any note naming one by name is
  either wrong or needs a condition.
- Bump `STORE` to `shoebox-general-notes-v3` if any step changes meaning.
- The `tour?.note(...)` call sites need no change: switching air models is a
  `commit` from an input listener, which already files the `drag` note, and a
  priced key it is not.

---

## 9. Interface work

`.interface-design/system.md` is the authority, read before any visual change
and revised in the same change that introduces a pattern. Nothing here should
need a new token: the readout, the plan key, the folded row and the refusal note
are all existing patterns. If one is invented, it is recorded there in the same
commit, because a pattern living only in a stylesheet rule is the second source
of truth Principle III forbids in the one place the model cannot arbitrate.

---

## Definition of done

- [ ] Sections 1 to 6 pass, with the measured numbers hit
- [ ] The wind bound's release is verified by 3.4, not assumed
- [ ] Section 7's table walked on a real page
- [ ] `NOTES` re-read and the storage key bumped where a step's meaning moved
- [ ] `CLAUDE.md` gains the measured invariants: the per-surface crack
      coefficient, the two-series sum, the no-exterior-surface fatal, the
      +20 ms design-day charge, and the EMS `Null` release
- [ ] The corrections in [research.md](./research.md) are folded back into
      `spec.md`, in particular FR-012's wind bound
- [ ] `.harness/` is empty again
