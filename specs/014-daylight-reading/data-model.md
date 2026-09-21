# Data model: A daylight reading on the roster

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-20

What is declared, what each field carries, and what throws at load if a declaration is
wrong. Field names and line numbers are from the code as it stands; where a shape is
proposed rather than existing, it says so.

---

## 1. The probe

A `Daylighting:ReferencePoint` that controls nothing, plus the `Daylighting:Controls`
object it is the first entry of. Written on every solve by its own applier.

| Field | Value | Why |
|---|---|---|
| Name | one stable constant | The reading never asks the document what the point is called. |
| Zone | `ZONE_NAME` | One zone on this desk. |
| x | centre of the floor's own extent | Read back off the floor surface's vertices, not recomputed from `width`. Principle III. |
| y | `PROBE_DEPTH` (0.7) of the way across the plan from the south wall | Measured along the south wall's own inward normal, because orientation lives in the vertices and `Building.north_axis` is ignored. **Not `dlDepth`**: see the reversal below. |
| z | `PROBE_HEIGHT` (0.8 m) | The work plane. Schema default is 0.8 m. **Not `dlHeight`**, for the same reason. |
| Controlled fraction | **0** | The whole arrangement. Schema minimum is 0.0, so this is inside the schema rather than exploiting it. |
| Illuminance setpoint | any legal value | Unused: a point controlling zero lights has no setpoint behaviour. Declared because the field is required. |

**Ordinal.** The probe is written **first** into `control_data`, so its output variable is
`Daylighting Reference Point 1 Illuminance` on every desk, whether or not the Daylight
channel's sensor is also present. Measured in research §1: point 1 reads 194 lx in all
three arrangements. Without the pin the reading would have to ask the document which
variable it is today, which is a reading whose name changes underneath it.

**Reversal, decided during implementation on 2026-09-20.** This section first said the probe
sat at `dlDepth` and `dlHeight`, the Daylight channel's own two faces. It does not. It sits at
its own constants, and four things forced that:

1. `dlDepth` and `dlHeight` are **Daylight channel** faces, and that channel is bypassed on
   the desk the page boots on. Following them would let a bypassed channel's slider reach the
   IDF and silently move a reading that is on the sheet whether or not the channel is in.
   That is both `applyModel`'s own rule (bypass removes, it does not zero) and FR-014's
   requirement that the measurement not be conditional on anything the reader selected.
2. At the shipped `dlDepth` of 0.5 the probe and the dimming sensor **land on the same point**,
   so the point 1 against point 2 evidence in research §1 does not reproduce at all.
3. The ranking claim that unblocked this feature, Spearman 0.9957 against a Radiance annual
   daylight coefficient chain, was measured at a probe fixed at 0.7 of the plan depth
   (`.harness/tmp-probe-arrangement.mjs:51`). A reading taken somewhere else is not the
   reading that was validated.
4. `contracts/daylight.md` exports `PROBE_DEPTH` and `PROBE_HEIGHT` as constants, the
   quickstart calls the sensor's depth "its own shallower depth", and the spec's overview
   quotes the problem at "70 % of the plan depth". Three documents and one measurement
   against one sentence here.

**What this costs.** FR-015's second clause, "where the reading and the probe's own position
control are plotted against each other, the sheet MUST say that the figure is moving because
the point moved", describes a case that can no longer arise: no control moves the probe. The
first clause, that the position be stated with the reading, is unaffected and is what T025
throws for. `dlDepth` goes on meaning what it always meant, which is where the *dimming
sensor* sits, and it goes on reaching the IDF only when the Daylight channel is engaged.

**Ownership moves.** Today `applyDaylight` creates both objects (`src/model.js:2144-2180`).
After this change the probe's applier creates them and `applyDaylight` appends its sensor
as a second entry. This is the single riskiest edit in the feature, because an object whose
owner moves is how orphans appear, and it is why gate 2 is load-bearing here.

---

## 2. The reading

One `Quantity` and one `QuantitySeries` in `QUANTITIES` (`src/study.js:513-651`). Every
field of `Quantity` is listed, including the ones that take null, because a field left off
a declaration is a decision too.

| Field | Value | Note |
|---|---|---|
| `id` | one token matching `[A-Za-z][A-Za-z0-9]*` | **No dot, dash or underscore**: `sty` splits on `.` (`src/permalink.js:590`). Permanent: renaming it refuses every link ever sent (`src/study.js:603-605`). |
| `label` | names the quantity and its position | Carries the probe's depth, per FR-015. |
| `unit` | `'lx'` | Must equal the kind's SI spelling exactly or `kindFor` throws (`src/units.js:307-330`). |
| `quantityKind` | `'illuminance'` | Already declared, `src/units.js:175`. Offset zero, so `deltaKindOf` returns it unchanged and a change in the reading letters correctly without a sibling kind. |
| `digits` | `0` | Matches the kind's own IP precision. Lux at one decimal would claim precision split flux does not have. |
| `needs` | a new `DAYLIGHT` `RunContents` | Names one `VariableRequest`: the illuminance variable, `Hourly`. No meters, no tables, no channels. |
| `context` | `(desk) => ({ floor: desk.occupiedFloor })` | How the occupancy floor reaches a sampled reading, exactly as the three TM59 quantities do (`src/study.js:611`, `:623`, `:648`). |
| `read` | `(landed, { context }) => …` | Calls the reader in `daylight.js`. Returns a number, or null where the run cannot answer. |
| `pen` | `null` | An illuminance is an unsigned magnitude, so the signed pen pair is unavailable (`.interface-design/system.md:67-76`). |
| `series` | one `QuantitySeries` | Its id is what `sv` carries; same no-dot rule. |
| `meterScope` | `null` | Reads no meter. |
| `wholeYear` | `false` | The reading is defined over whatever occupied hours the run holds. A part-year run answers for its own months, and says which. |
| `priced` | `null` | Not a priced reading. |
| `movedBy` | `[]` | Reads no bill. The 66-of-78 pairing count at `src/study.js:932-936` must come back unchanged. |
| `criterion` | `null` | Not a TM59 criterion. |
| `category` | `null` | No category. |

**Improving direction** is not on `Quantity`. It is one `SENSE` entry in
`src/survey.js:132-159`, keyed by **series** id:

- `better: 'higher'`: more light at the back of the room is the improvement.
- `why`, a sentence stating that this is the sheet's judgement about the reading, not a
  published line. Daylight is only the second `'higher'` reading on the sheet, after the
  zone low.

Without this entry, `Reading.improves` (`src/survey.js:211-220`) and `pullReadingFor`
(`src/pull.js:377-387`) refuse the reading by name, and the survey has no descent and no
improving region.

**No target, declared as such.** The id joins the closed `nonTargets` set at
`src/study.js:942`, today `['extremes', 'demand', 'high', 'low', 'cost', 'carbon']`. The
assertion at `:946-950` requires every quantity be either a target's `metric` or a member,
and throws naming the declaration otherwise. The survey's existing `absenceIn`
(`src/survey.js:2170-2186`) then letters the reason on the ground with no new code.

---

## 3. The interior reflectance control

One new `Scale` on the Fabric channel.

| Field | Value | Note |
|---|---|---|
| `key` | a new scalar parameter key | Adding a control is free under the link format. |
| `quantityKind` | `'ratio'` | As `wallAbs` and `roofAbs` are. |
| `label` | names the interior, not the wall | The whole point is that it is not an exterior property. |
| `value` / `min` / `max` / `step` / `digits` | **open** | Left to implementation. The step must reach a round IP figure or `assertReachable` throws, and `digits` must be refined with the step. |
| `landmarks` | **required, and owed a source** | `CLAUDE.md`: "Only add one where somebody published it." The 0.60 the assessment used as a realistic comparator is a comparator, not a citation. A published interior reflectance schedule has to be found before the default is defensible. |

**What it writes.** `1 - reflectance` into the `visible_absorptance` field of every opaque
material the desk builds: `R13LAYER`, `R31LAYER`, `WALLMASS`, the concrete slab, and
`FLOORLIGHT`. One rule rather than five writes, because split flux reads only the innermost
layer of each construction and a per-material list is what a sixth material would escape.

**What stops.** `applyFabric` stops writing `visible_absorptance` from `wallAbs` and
`roofAbs` (`src/model.js:1011-1012`). Those two keep `solar_absorptance` and keep their
declared meaning, which is exterior.

**The three surfaces the assessment did not separate**, all corrected by the one control:

| Surface | Today | Why it matters |
|---|---|---|
| Walls, no mass | `1 - wallAbs` = 0.25 | The defect as recorded. |
| Walls, `wallMass > 0` | hard-coded 0.35 (`src/model.js:1026`) | `wallAbs` reaches nothing at all here. A fix writing only `R13LAYER` misses every desk with mass on it. |
| Ceiling | `1 - roofAbs` = 0.25 | The surface the deep probe is actually lit by. FR-012. |
| Floor | hard-coded 0.35, twice (`:747`, `:1103`) | Minor for a work-plane point, included so one rule covers everything. |

---

## 4. The reader, `src/daylight.js`

DOM-free and network-free, so a Node harness calls the real code.

**In**: a parsed ESO, the occupied floor, and the run's environments.

**Out**: either a value or an absence carrying its reason, by the same discipline as
`src/tm59.js:563-593`, whose constructor makes "a value and a reason" and "neither"
unconstructable.

**The arithmetic**, in order:

1. Take the hourly `Daylighting Reference Point 1 Illuminance` series.
2. Take the hourly occupancy `Schedule Value` series keyed `Occupancy`, read back off the
   run rather than re-evaluated in JS (`src/tm59.js:1246-1257` gives the reason: EnergyPlus's
   day-type dispatch would fail silently if reimplemented).
3. Keep only the weather-file environments, dropping design days, via the same rule as
   `weatherRuns` (`src/tm59.js:1091-1106`). A design day is more extreme than any real day
   by construction, so counting one in would let `sizingPeriods: 'Yes'` move a reading
   without changing the building.
4. Keep hours where `occupied(scheduleValue, floor)` (`src/tm59.js:1074-1089`), which
   throws rather than defaults when the floor is missing.
5. Return the median of what is left.

**Absence reasons**, each held to the 12-word `ABSENCE` budget (`src/copy.js:44`) and each
naming the fix first:

| Case | Reason |
|---|---|
| No illuminance series in the run | the run carries no daylight series; solve the desk itself |
| No occupancy series | patch Gains in; this run carries no hourly Occupancy series |
| No occupied hours in the run's own months | nobody is home in the months this run covers |
| Only design days ran | attach a weather file; two design days are not a year |

**A measured zero is not an absence.** A desk with no opening reports 0 lx, measured, clean,
0 severe (research §3). It renders as a figure, enters every comparison, and is not an em
dash.

---

## 5. Invariants that throw at load

FR-020 names three. Each fails at module load naming the declaration, not at draw time.

1. **A reading offered without a method statement.** The declaration that puts daylight on
   the roster must carry the text stating what the reading is and how it was computed.
   Absent, the module throws rather than lettering a bare number that looks like every other
   number on the sheet.
2. **A reading offered without a stated probe position.** FR-015. The position is what makes
   the figure interpretable, and it is the one thing a reader cannot recover from the number.
3. **A published target attached to this reading.** The `nonTargets` assertion at
   `src/study.js:946-950` already throws if the reading is neither a target metric nor a
   declared non-target. The new invariant is the other direction: a future declaration that
   gave this reading a `Target` must throw, because the specification forbids one and a
   target would turn a ranking instrument into a certificate.

A fourth is inherited rather than added: `kindFor` (`src/units.js:307-330`) throws if the
declaration names `quantityKind: 'illuminance'` and spells its unit as anything but `'lx'`.

---

## 6. What does not change

Recorded because a reader looking for these should find the reason rather than silence.

- **`shapeKey` and the sample caches.** The probe is unconditional, so it is not something
  the reader selects and cannot reach the solve identity key. Every cached study or survey
  sample carried the probe, so every one of them can answer this reading.
- **`LINK_VERSION`.** No default moves, no key is renamed, no range narrows. A reading id is
  a value; a new control key is the additive case the format already allows.
- **The Daylight channel's `requires`.** It goes on refusing a desk with no opening, because
  a dimming sensor in a room with no light is a control the engine warns about. The probe has
  no such gate, and the two are different questions.
- **The compliance board, the bill, the balance rail, TM59.** Untouched, and every figure
  they letter must be identical after this change except those the reflectance correction
  genuinely moves.
