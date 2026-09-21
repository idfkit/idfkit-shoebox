# Quickstart: validating the daylight reading

**Feature**: [spec.md](../014-daylight-reading/spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-20

Nine steps. Each one is a thing that can come back wrong, ordered so the cheapest failure
is found first. There is no test runner and there is not going to be one: verification is
throwaway Node harnesses under `.harness/` that build the real document from `src/model.js`
and run it, then the page driven by hand.

**Prerequisites**

```bash
npm install
npm run predev          # stages the engine, schemas and station index into public/
```

EnergyPlus 26.1.0 at `/Applications/EnergyPlus-26-1-0`; the harness prefers it and falls
back to the staged WebAssembly build. Chicago O'Hare TMY3 ships with the install and is
what every measurement below was taken against.

---

## 1. The declarations throw at load

**Checks**: FR-020, gate 5.

Break each invariant one at a time and confirm the page stops at mount with a sentence
naming the declaration, rather than drawing.

```bash
node .harness/declarations.mjs
```

Expect: the reading declared without its method statement throws; without its stated probe
position throws; with a `Target` attached throws; and the existing `nonTargets` assertion
throws if the reading is neither a target metric nor a declared non-target. Four cases,
each naming what is wrong. A case that renders is a failure of this step even if the sheet
looks right.

---

## 2. Idempotence, with ownership moving

**Checks**: gate 2. **This is the step most likely to fail first.**

`applyModel` runs on every parameter change, so applying it three times must produce
byte-identical output. Ownership of `Daylighting:Controls` moves from `applyDaylight` to
`applyProbe` in this feature, which is exactly how orphans appear.

```bash
node .harness/gains.mjs        # the existing idempotence harness
```

Expect: three applications byte-identical, at each of these desk positions, and in each
direction of travel:

- Daylight bypassed, then engaged, then bypassed again. The sensor entry must appear and
  disappear from `control_data` leaving the probe entry untouched and no orphan
  `Daylighting:ReferencePoint` behind.
- Gains bypassed and engaged, same both ways.
- Glazing and Skylights both bypassed, so the zone has no opening.
- Wall mass at zero and above zero, which changes the wall construction's layer count.

---

## 3. The output variable exists at this version

**Checks**: gate 3, research §2.

A variable the engine never heard of does not stop a run. It writes one line into
`eplusout.err` and carries on, and the reader gets an absence explained by the run rather
than by the typo. This page has been caught by that before.

```bash
node .harness/variables.mjs
```

Expect: `Daylighting Reference Point 1 Illuminance` present in the run's own `.rdd`, and
`eplusout.err` free of "requested but not generated". Confirm it is the reference point
variable and not the neighbouring `Daylighting Window Reference Point 1 Illuminance`, which
is the per-window contribution and differs by one word.

---

## 4. The measurement does not change the building

**Checks**: FR-004, SC-004.

```bash
node .harness/tmp-daylight-neutral.mjs
node .harness/tmp-probe-arrangement.mjs
```

Expect, to full precision and not to a tolerance:

- 5975.5 kWh of annual lighting with the probe and without, Daylight bypassed.
- 3698.4 kWh with the probe and without, Daylight engaged and dimming.
- Every other figure the sheet reports identical either way.

A drift of any size here means the probe is acting, not measuring, and the feature does not
ship.

---

## 5. The probe's ordinal is pinned at 1

**Checks**: research §1, the reading's own name.

```bash
node .harness/tmp-probe-arrangement.mjs
```

Expect point 1 to be the probe in every arrangement:

```
gains in,  daylight out,  probe     21 June noon: point 1 = 194 lx
gains OUT, daylight out,  probe     21 June noon: point 1 = 194 lx
daylight IN,  probe first           21 June noon: point 1 = 194 lx, point 2 = 322 lx
```

The 322 lx is the dimming sensor at its own shallower depth, and its presence as point 2 is
the check: if the numbers swap, the probe is being written second and the reading is taking
its value from the sensor.

Also confirm, in the same run, that a desk with no opening reads **0 lx, clean, 0 severe**,
and that the sheet letters it as a measured zero rather than an em dash.

---

## 6. The codec round trips, both ways

**Checks**: FR-017, gate 4.

```bash
node .harness/links.mjs
```

Expect:

- The new reading id encodes and decodes exactly through `sty`, and through `sv` as a
  survey series. Confirm the id matches `[A-Za-z][A-Za-z0-9]*` and carries **no dot**: a dot
  is the separator before the open study control keys, and a second one would split `sv`.
- The new interior reflectance key encodes and decodes as a scalar, and is omitted from the
  link at its default.
- A link minted before this change resolves to the same desk it always did. Not the same
  numbers: the reflectance correction moves lighting energy on any desk with Daylight
  engaged, and that is accepted and recorded. The same **desk**.
- `LINK_VERSION` is unchanged, and `MIGRATIONS` gains no step.

---

## 7. The reflectance correction lands on every surface

**Checks**: FR-011, FR-012, SC-003, SC-008.

```bash
node .harness/tmp-reflectance-sensitivity.mjs
```

Expect the interior visible reflectance actually written to the innermost layer to follow
the new control on **all four** of these, which is the part the assessment did not separate:

| Desk | Innermost layer | Must follow the control |
|---|---|---|
| Walls, no mass | `R13LAYER` | yes |
| Walls, `wallMass > 0` | `WALLMASS` | yes, and this one is the miss a naive fix makes |
| Ceiling | `R31LAYER` | yes |
| Floor, Mass engaged and bypassed | slab / `FLOORLIGHT` | yes |

Then confirm `wallAbs` and `roofAbs` still write `solar_absorptance` and no longer write
`visible_absorptance` at all, and that moving either one leaves the daylight reading
unmoved.

---

## 8. The cost, on the cadence that matters

**Checks**: FR-016, SC-005, Principle VI. **The figure nobody has measured.**

```bash
node .harness/tmp-daylight-wasm.mjs
```

The annual budget is already bounded: +5 % at nine probe points over a 0.98 s WebAssembly
run, and this feature writes one. The number that has to be taken here is the **design-day**
solve, which re-runs continuously during a drag at about 50 ms and now carries the probe on
every frame.

Expect: three runs per configuration, minimum reported beside median, and the drag cadence
still inside its budget. If it is not, the always-on decision in FR-014 is the first
assumption to revisit, before the reading's definition. Record the number either way; an
unmeasured pass is not a pass.

---

## 9. Driven, at 390 px, in both unit systems

**Checks**: FR-005, FR-006, FR-007, FR-018, FR-019, SC-007, Principle VII.

```bash
npm run dev
```

A warm design day solves in about 50 ms, so the whole desk can be exercised quickly and
there is no excuse for not doing it.

- Sweep the south window ratio from its smallest stop to its largest and watch the daylight
  reading rise while the energy readings fall. This is the feature.
- Move visible transmittance from 0.05 to 0.90 and confirm the reading moves. Baseline: it
  moves nothing today.
- Confirm the reading is present on the **shipped default desk**, with the Daylight channel
  bypassed and never engaged.
- Cut a study curve against it, then an E-02 ground with daylight on one axis and an energy
  reading on the other. Confirm the ground carries **no threshold line** and says so in
  words.
- Confirm the reading's position and the statement that the method's depth limit is passed
  are both legible at 390 px, in lux and in footcandles, **without hover and without opening
  anything**. The shipped desk is already past the limit at 3.333 against a stated 3, so
  this statement should be visible on first load.
- Switch to IP and back and confirm the SI sheet comes back character for character.
- Force a paint before believing any E-02 or pull figure: a hidden tab starves
  `requestAnimationFrame` and three "stale" figures have been chased that way.

---

## What this quickstart does not cover

- **The conflict in research §6.** Whether the method text is in view or folded under a
  counted summary is a decision for the maintainer, and step 9 checks whichever is built.
- **The reading's own accuracy.** It is offered as a ranking instrument, and the ranking
  claim was measured at the decide gate against a Radiance annual daylight coefficient
  chain: Spearman 0.9957, Kendall tau-b 0.9638, identical thirteen-point Pareto frontiers.
  SC-006 holds the shipped reading to reproducing that ordering, and the harness that did it
  (`.harness/tmp-rank-compare.mjs`, `.harness/tmp-rank-decide.mjs`) depends on a Radiance
  build that lives only in a session scratchpad and does not survive.
