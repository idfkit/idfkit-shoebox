# Contract: the daylight reading's module surface

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-09-20

What each module exports after this change, what it throws at load, and the one ownership
that moves. This is the surface a reviewer checks the diff against.

---

## `src/daylight.js` (added)

DOM-free and network-free. A Node harness calls these directly, which is how gate 1 is
satisfied without a browser.

```text
medianIlluminance(eso, { floor })  ->  number | null
    The reading. Median of the hourly reference-point illuminance over occupied
    hours in the weather-file environments, design days excluded.
    Returns null where the run cannot answer; the caller turns null into an
    absence carrying its reason.

illuminanceSeries(eso)             ->  points[] | null
    The hourly `Daylighting Reference Point 1 Illuminance` series, or null when
    the run carries none.

readDaylight(eso, { floor })       ->  Reading
    The reading or its absence, as one object that cannot carry both and cannot
    carry neither.

PROBE_DEPTH, PROBE_HEIGHT          ->  the probe's stated position
VALIDITY_DEPTH_RATIO = 3           ->  the method's own limit, room depth over
                                       ceiling height
withinValidity(built)              ->  boolean
    Asked of the document's own geometry, never of `params`.

ABSENCE                            ->  frozen table of reasons, each held to the
                                       12-word budget and each naming the fix first
```

**Throws at load**: nothing on its own. Its declarations are data the roster asserts.

**Does not export**: anything that touches the DOM, `document`, `window`, or the network.
The module is imported by a Node harness, and that is the check.

---

## `src/model.js`

**Added.** One applier for the probe, run on every solve, outside the Daylight channel's
gate.

```text
applyProbe(doc, params)
    Clears and rewrites `Daylighting:ReferencePoint` and `Daylighting:Controls`.
    Writes the probe as control_data entry 1, fraction 0.
    Runs unconditionally: no `engaged` argument, no `requires`.
```

**Changed.** `applyDaylight(doc, params, engaged, gainsOn)` no longer creates either object.
It appends its dimming sensor to the `control_data` of the object `applyProbe` owns, as
entry 2, and removes that entry when the channel is out. It keeps its early return and keeps
its `requires`.

**Changed.** `applyFabric` stops writing `visible_absorptance` from `wallAbs` and `roofAbs`
(`src/model.js:1011-1012`). One interior reflectance is written as `1 - reflectance` to the
`visible_absorptance` of every opaque material the desk builds.

**Changed.** `syncReporting`'s `'sheet'` branch requests the illuminance variable, `Hourly`.
The `RunContents` branch gets it from the quantity's own `needs`.

**The ownership rule, stated once.** `applyProbe` owns both daylighting object types.
`applyDaylight` owns one entry inside one of them and nothing else. Any object of either
type present after a solve was written by `applyProbe`, and `must(doc, …)` is how a missing
one is found rather than re-added.

---

## `src/study.js`

**Added.** One `DAYLIGHT` `RunContents` beside the others at `:464-480`, naming one
`VariableRequest` and nothing else. One `Quantity` in `QUANTITIES`, one `QuantitySeries`
under it. The new id joins `nonTargets` at `:942`.

**Throws at load** (existing assertions, now covering one more declaration):

- unique quantity ids (`:827-829`)
- every quantity is a target's `metric` or a declared non-target (`:946-950`)
- the priced-pairing count, which must come back **unchanged** (`:932-936`)

---

## `src/survey.js`

**Added.** One `SENSE` entry keyed by the new series id, `better: 'higher'`, with a why.

**Throws at load** (existing): series-id uniqueness across the whole roster (`:301-310`),
and SENSE coverage.

**Inherited, not written**: `absenceIn` (`:2170-2186`) already letters the sentence for a
reading no standard publishes a limit for. Six readings take that path; this is the seventh.

---

## `src/controls.js`

**Added.** One `Scale` for interior visible reflectance on the Fabric channel, with
published landmarks.

**Unchanged in meaning.** `wallAbs` and `roofAbs` keep their declared labels and their
`solar_absorptance` writes. What they lose is a write they should never have had.

**Throws at load** (existing): `assertKinds`, `assertReachable` over every face in both unit
systems, and `readLandmarks`, which refuses a landmark outside the range, overlapping,
unreachable on the step grid, or unreadable at a zero stop.

---

## `src/console.js`

**Pending the decision in research §6.** The reading's figure, unit, probe position, the
statement that no published line judges it, and the validity statement where the limit is
passed are in view. The method's own text and its citations are folded under a summary that
states the count in view, using the existing `SUMMARY.reading` word, `'Method'`
(`src/console.js:100`).

If the maintainer reads FR-005 literally instead, the method text moves into view and the
40-word `CEILING` budget binds it.

---

## `src/tour.js`

**Changed.** `NOTES` gains the new reading and states that the Daylight channel no longer
owns the daylighting objects. The storage key bumps, because a step's meaning moves.

---

## Harnesses

```text
.harness/variables.mjs   + `Daylighting Reference Point 1 Illuminance` joins the
                           standing existence gate. Without this, a drifted name
                           would write one line into eplusout.err and leave the
                           reader an absence with the wrong explanation.

.harness/links.mjs       + the new control key and the new reading id round trip,
                           and a link minted before this change still resolves.
```
