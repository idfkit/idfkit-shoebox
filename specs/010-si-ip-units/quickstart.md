# Quickstart: verifying SI and IP Units

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

There is no test runner. These are the checks that prove the feature, in the order they can run. Harnesses are throwaway and live in the scratch directory, not the repository.

## Prerequisites

- `npm install` and `npm run dev` (stages the engine, schemas and station index).
- Node 22. `src/units.js` and `src/controls.js` both import cleanly under Node, which is what makes checks 1 and 2 possible.
- EnergyPlus 26.1.0 at `/Applications/EnergyPlus-26-1-0` for check 3.

## 1. The kinds under Node (FR-007 to FR-009, SC-004)

A harness imports `src/units.js` and letters a table of hand-checked figures in both systems.

Expect:

- Every anchor converts exactly: 15.24 m is 50.0 ft; 4.572 m is 15.0 ft; 5.456 m²K/W is R-31.0; 0 °C is 32 °F; 21 °C is 69.8 °F; a 3 K band is 5.4 Δ°F, never 37.4; 1 W/m²K is 0.176 Btu/h·ft²·°F.
- `temperature` and `temperatureDifference` never agree except at the origin of the difference scale.
- No IP unit string contains whitespace, and `copy.js`'s `words()` counts every one as a single token.
- `assertKinds()` throws on a duplicate id, a missing unit string, a zero factor and an identity kind whose two strings differ.
- `letter()` returns the zero word at a zero stop in both systems, and an em dash for a missing value in both.
- Round trip: for every kind, `parseIn(kind, letter(kind, v, d))` returns `v` to the lettered precision, with and without the unit typed, and for `resistance` with and without the `R-` prefix.

## 2. The grids under Node (FR-011 to FR-014, SC-005, SC-006)

Extend the script already written for research R4, over all 87 numeric controls.

Expect:

- **Superset**: for each of the eleven refined controls, every stop of the old grid is reproduced exactly on the new one, through `onFace`'s own arithmetic. Measured: zero drift across 1,365 stops.
- **Reachability**: `assertReachable` passes for every convertible control, and fails when a step is deliberately coarsened in a fixture.
- **Landmarks**: every declared landmark is reachable on both the old and the new grid, and `landmarkAt` lights the same band at the same model value whichever system is showing.
- **Ends**: both ends of every control are reachable and letter their exact converted limit.
- **Typed entry**: for every control, typing the IP figure the box letters returns the same model value; typing a unit from the other system returns the same value; typing a unit that does not belong to the kind is refused whole.

## 3. Nothing reaches the model or the link (FR-003, SC-002, SC-008)

- Run the IDF byte-identity harness from spec 007 at the default desk and three others, in SI and again in IP. Expect byte-identical IDFs, and byte-identical `eplusout.eso` results.
- Round-trip the codec over every existing link fixture, including links that carry values on the eleven refined controls. Expect each to load to the same desk and to re-encode byte-identically, with `LINK_VERSION` still `v1`.
- Encode the same desk with SI showing and with IP showing. Expect the identical string.

## 4. Drive the page (stories 1 to 5; SC-001, SC-003, SC-007, SC-009)

At desktop width, with the network panel open and recording:

1. Default desk, first run landed. Switch to IP and walk every strip, reading, table, drawing, study and survey. Expect every dimensioned figure in IP except the identity kinds, zero runs started, zero requests, and the switch complete within a tenth of a second.
2. Switch back. Expect the sheet identical to before the first switch, field by field.
3. In IP, drag the width: expect 50.0, 50.1, 50.2 ft, never 49.97. Type `60`: expect 60.0 ft. Type `R-20` into the wall: expect R-20. Select each box and retype exactly what it letters: expect no value to change.
4. Start a study, switch units while it runs. Expect samples re-lettered, none re-run, and the solve uninterrupted.
5. Start an annual run and switch while it is in flight. Expect dimmed figures re-lettered, still dimmed, and the run landing in IP.
6. Set a heating setpoint above cooling to force a refusal. Expect the refusal sentence in IP temperatures and the same block, in words.
7. Open the report. Expect it to state the unit system. Download the run's files in both systems and compare: expect byte-identical.
8. Break the engine (rename `public/energyplus/`) and reload. Expect the toggle still to work and still to re-letter the controls.

At 390 px wide, and with the keyboard alone: repeat steps 1 and 3. Expect both segments labelled, every figure and its unit on its row unclipped, no horizontal scrolling, and the selector reachable and announced.

## 5. The gates that throw (FR-012, gate 5)

- Add a fixture control with a coarse step and a converting kind: expect `assertReachable` to throw at load, naming the control and the step.
- Name a kind that is not in the roster: expect `assertKinds` to throw, naming the declaration.
- Put a whitespace-bearing IP string in the roster: expect the load to throw rather than a copy budget to fail later in a module nobody would look in.
