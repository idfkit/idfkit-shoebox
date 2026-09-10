# Quickstart: validating the design space survey

There is no test runner and no linter in this repository. Verification is throwaway
Node harnesses plus driving the page, per the constitution's Development Workflow.
Write the harnesses under the scratchpad, not into the repo.

Details live in [data-model.md](./data-model.md) and
[contracts/](./contracts/); this file is the run guide.

## Prerequisites

```bash
npm install
npm run dev        # predev stages ~50 MB of engine assets, schemas and stations
```

A fresh clone must run `predev` or `prebuild` before the page will load, because
`public/energyplus/`, `public/schemas/` and `public/weather/` are gitignored.

Outside the browser the schema comes from `localBundle()` in `@idfkit/schemas/node`
and wants the full version string, `load('26.1.0')`. EnergyPlus 26.1.0 is installed
at `/Applications/EnergyPlus-26-1-0`; where none is installed, the staged WASM engine
runs the same models under Node (set `global.Module` to
`{ noInitialRun: true, locateFile }` before requiring `public/energyplus/energyplus.js`,
and clear the require cache between runs, because EnergyPlus's `main` is not
re-entrant).

## Gate 1: the modules answer without a browser

`survey.js` and `pull.js` are DOM-free and engine-free, so the harness calls the real
functions rather than a copy.

```bash
node scratch/survey-invariants.mjs
```

Assert, from [contracts/survey-module.md](./contracts/survey-module.md):

1. No returned figure originates anywhere but a `SpotHeight`. Audit at least 50
   measured points (SC-003).
2. `meshOf` emits no triangle touching a gap or an unsurveyed position.
3. `coverageOf` sums to `wanted` on every reachable lattice (FR-018i).
4. Every contour segment lies inside an emitted cell, so the plan and the relief
   cannot disagree about the shape of the ground.
5. `fallStep` never returns a point worse than the one it was given, always stops
   with a reason, and halts on a two-point oscillation (FR-035, SC-006).
6. Declaration errors throw at load: the same control on both axes, three
   quantities, an axis on a priced channel, an axis with no numeric face (FR-041).

## Gate 2: the ground is built of runs, and gaps stay gaps

```bash
node scratch/survey-ground.mjs      # builds a 5 x 5 ground under Node
```

- Every spot height traces to a completed run (FR-007).
- Inject at least 20 run failures and confirm each appears as a gap carrying its
  reason, that none is filled, smoothed or dropped, and that the survey continues
  (SC-010, FR-016).
- Make every run fail and confirm the survey states that it measured nothing and why,
  rather than presenting an empty relief (edge case).

## Gate 3: idempotence and the shared document

`buildSample` overlays the shared document and restores it in one synchronous breath.
A survey row uses that path unchanged, so the existing rule applies:

- Applying the model three times produces byte-identical output.
- A desk walked to a position serialises byte-identically to one built at it.
- No await ever sees the document in overlay state.

```bash
node scratch/idempotence.mjs
```

## Gate 4: the codec round-trips and refuses

Per the constitution's gate 4 and
[contracts/permalink-keys.md](./contracts/permalink-keys.md):

```bash
node scratch/link-roundtrip.mjs
```

- Every `sv` field encodes and decodes exactly, and re-serialises what it read.
- Every malformed class is refused **whole**: the same control on both axes, an axis
  on a priced channel, an unknown reading id, an extent outside the control's range,
  a control that no longer exists (FR-046).
- **The regression that matters**: a `sv` value that is syntactically a number must
  still be read as a survey. If the branch was written below `readValue`'s numeric
  regex it is unreachable and every survey link is refused as "is not a number".
- Confirm `LINK_VERSION` is still `v1` and `MIGRATIONS` is still empty.

## Gate 5: determinism, which this feature is the first to stress

This is the gate behind SC-005a and FR-026a, and it is the one most likely to fail,
because `pool.js` recycles instances and CLAUDE.md records a warm-session reading of
512 hours against a cold boot's 511 on the same link.

```bash
node scratch/repeatability.mjs
```

Measure one design at least 20 times, spanning a cold instance and one that has
already served ten runs, and assert the readings are **identical**. A disagreement is
a fault to be surfaced, never averaged away. If this gate fails, the contingency is
retiring a pooled instance after a bounded number of runs; measure the WASM compile
cost against the budget before adopting it.

## Gate 6: the pull agrees with full sweeps

```bash
node scratch/pull-vs-sweeps.mjs
```

On 10 test desks, sweep the pull's top three controls as ordinary studies and confirm
the ranking agrees on **10 of 10** (SC-005). There is no noise floor to appeal to, so
a disagreement is a defect. Confirm inert controls are listed with reasons and cost no
runs (FR-027), and that the module letters which run kind it read at (research.md
section 6).

## Gate 7: drive the page

A design day solves in about 50 ms once the engine is warm, so the whole desk is
exercised quickly and there is no excuse for not doing it.

- Open a survey and confirm a legible relief stands under 5 s on a design-day desk and
  under 30 s with a weather file, on a four-core machine (SC-001).
- **While it fills**, drag a slider on E-01 and confirm the live cadence is within 10
  percent of its no-survey figure (SC-002). This is the round-robin change earning its
  keep; check a study queued behind a survey is not starved (FR-053).
- Choose a measured point and confirm the whole of E-01 follows: axonometric,
  quantities, bill, schedule, description, and the address bar on release (FR-032).
- Let it fall, stop it mid-descent, and confirm the desk is on a completed design
  (FR-036).
- Open a survey on an axis already swept as a study and confirm zero engine runs are
  spent on the positions it covers (SC-011).
- Change the station and confirm the survey and its measurements go down with the
  studies and the sample cache (FR-052).

## Gate 8: the drawing, at both sizes and in both themes

- Drive the whole survey at **390 x 640** with a coarse pointer and hover unavailable.
  Every reading readable without hovering, without sideways scrolling, without opening
  anything (SC-007).
- Confirm the relief draws there **by default and at full mesh** (FR-018k), that its
  camera is workable with a thumb and reachable from the keyboard (FR-018e), and that
  every reading is still complete on the plan with the relief removed (FR-018a).
- Kill the WebGL context mid-session and confirm the survey says so in place and keeps
  every reading (FR-024).
- Confirm measured, inferred and unsurveyed ground stay distinguishable in both
  themes, in monochrome and under forced colours (SC-009). Colour is never the only
  carrier.
- Confirm the reading is **not** drawn with `--cold` / `--warm`: those are reserved for
  signed physical quantities, which is why the survey is grey.
- Ask the system for reduced motion and confirm the camera snaps and the descent is
  stated as steps, losing no reading (FR-023, FR-018f).

## Gate 9: the budget

```bash
npm run build
```

Compare `dist/` before and after. SC-012 allows 60 KB of added transfer on a cold
visit; the estimate is about 15 KB after minification and brotli. Measure rather than
assume, because the deploy script's own brotli settings decide the figure.

## Gate 10: the general notes are part of done

Update `NOTES` in `src/tour.js` and the `tour?.note(...)` call sites in `main.js`
wherever the survey changes what a step teaches, and **bump the storage key** so a
returning reader gets the new sheet rather than stale ticks (FR-055). An onboarding
that walks a page that no longer exists is worse than none.

Record any new token, component pattern or layout threshold in
`.interface-design/system.md` in the same change (FR-056), and add the CHANGELOG
entry and the CLAUDE.md architecture section.
