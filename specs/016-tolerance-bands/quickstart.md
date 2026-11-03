# Quickstart: verifying tolerance bands

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/tolerance.md](./contracts/tolerance.md)

There is no test runner. These are the gates that stand in for one: Node harnesses under the scratch directory against the DOM-free modules and the staged engine, then the page driven by hand. Harness scripts are throwaway, and their results are recorded in `specs/016-tolerance-bands/verify/README.md`.

## Prerequisites

```bash
npm install
npm run build   # stages public/energyplus, public/schemas, public/weather
```

For annual runs, use a weather file from `public/weather/` or any TMYx EPW.

## G1. Contents cost (blocks the design; see research R1)

1. Build the default desk's IDF twice from `src/model.js`:
   - with `syncReporting` given the study contents for `extremes` alone;
   - with it given `bandQuantities(QUANTITY_BY_ID.extremes, engaged)`.
2. Run each 20 times, design day and annual, **one EnergyPlus per process** (`main` is not re-entrant).
3. Record the medians.

**Pass:** the band-contents median is no more than 10 % above the default median, at both run kinds.

**Fail:** take the fallback recorded in R1 (contents widened only while chased) and amend SC-004 before tasks are written.

## G2. Band arithmetic (FR-002, FR-004, FR-005, FR-007, FR-013; SC-002)

A Node harness feeds `bandFor` hand-built curves. No engine is needed. Cases:

- **Passing stance mid-travel:** band brackets the stance and each edge names its target.
- **Band to a stop:** `stop` edge, `outside === null`.
- **Pass / fail / pass:** `others` holds the second stretch and it is not merged.
- **Failing stance:** `move` points to the nearest segment; an equidistant pair sets `tie`.
- **Refused and gap neighbours:** they close an edge with their reason, and `failing` is empty.
- **Single passing point:** `share === 0`, bracketed on both sides.
- **Two targets failing at one position:** both named, worst ratio first.
- **Unsolved positions:** `incomplete`, and an edge next to one reads unknown.
- **Inert, declared:** a priced key against targets whose quantities' `movedBy` lacks it gives `inert` set, `band === null`, and no `share` or `move`.
- **Inert, measured:** identical readings at every solved position give `inert`. The same curve with one unsolved position is not inert, and one value differing in the last bit is not inert either.
- **Every position fails:** `band === null` with judged targets and `inert === null` constructs without throwing (the data-model validation that used to reject it).

Then assert the data-model validations hold for every case.

## G3. Bands agree with the scoreboard (SC-002, SC-003)

Use at least ten desks, including a lever at its stop, Fabric bypassed, a refused position (heating setpoint swept past cooling), and a failing desk. For each desk:

1. Build the studies' samples through the real `buildSample` path.
2. Compute bands under the chased standard.
3. For each edge, solve the desk with the lever at `inside` and at `outside`, and read the targets through the scoreboard's `targetReading`.

**Pass:**

- `inside` passes every judged target, and `outside` fails exactly the targets the edge named. Zero disagreements.
- On failing desks, setting the named lever to `move.to` passes every judged target in 100 % of cases.

## G4. Nothing leaks into the desk (FR-020; Principle II)

For a desk with three studies open:

1. Record `encodeState(...)` and `shapeKey`.
2. Toggle the chase across every standard and off again.

**Pass:** both are byte-identical throughout. `applyModel` applied three times is byte-identical, which is the standing idempotence gate (the feature does not touch it, and this proves it).

## G5. Load invariants

Import `src/tolerance.js` under Node, so the four invariants in the contract run. Then break each once, in a scratch copy of the declarations, and confirm the throw names the declaration:

- a target with an unmatched metric;
- a standard with a limitless target counted as judged;
- a `meets` that passes above its limit.

## Driven page

The engine runs in about 50 ms per design day, so drive all of it:

1. **US1:** Chase Passivhaus on a desk that meets it with a weather file attached. Turn on studies for glazing S, wall resistance and infiltration.
   - Each card shows a bracketed band containing the stance.
   - The block under the chase line ranks the three levers, least free first, and says *"3 levers studied"*.
   - Move one lever just past its band's `outside`: the scoreboard row named by that edge fails.
2. **US1 absences:** Stop chasing and the block states that bands need a chase. Chase again with no study open and the block states that a study gives a lever a band.
3. **US2:** Move the desk until it fails one Passivhaus line. The block names a lever and a position. Set it there, and every line on the board passes. Find a desk where no studied lever can do it alone, and confirm the sentence says so and lists, per failing line, the levers that could clear it.
4. **US3:** Watch a study go coarse → fine. Each edge's bracket narrows and stays inside its coarse bracket.
5. **US4:** Take the year off (design days only). Annual lines are listed as not judged with the scoreboard's own sentence, and bands are measured against the peak loads alone.
6. **US5:**
   - Nudge a lever: bands dim as stale and recover when the re-sweep lands.
   - Switch the chase from Passivhaus to EnerPHit: the bands re-read, and the **Runs** counter does not move (SC-004).
   - Turn a gas price with an EUI-bearing standard chased: the band follows with no run.
   - Change station: bands are withdrawn with the climate reason.
7. **Units:** Switch to IP and back. Every band figure re-letters, and the SI sheet returns character for character (SC-007). Widths read as differences: no `°F` offset on a setpoint band.
8. **390 px:** Every band line, the block, the caveat and the absences are readable with no hover and no sideways scroll. Force a paint before trusting any figure in a background tab.
9. **Notes:** The general notes show the new marker once the first band draws, and the storage key reads `-v8`.
