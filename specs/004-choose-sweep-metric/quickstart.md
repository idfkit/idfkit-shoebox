# Quickstart: verifying "Choose what a sweep plots"

**Feature**: `004-choose-sweep-metric`

There is no test runner and no linter in this repository. Verification is
throwaway Node harnesses plus driving the page, which is what the constitution's
workflow section prescribes. This document is the running order, not the
implementation: it says what to prove, how to prove it, and what the answer looks
like when it is right.

## Prerequisites

```bash
npm install
npm run dev        # predev stages the engine, schemas and the station index
```

EnergyPlus 26.1.0 is expected at `/Applications/EnergyPlus-26-1-0`. Where none is
installed, `public/energyplus/energyplus.js` runs the same models under Node;
clear the require cache between runs, because the emscripten build latches onto
whatever `global.Module` held when it was first evaluated and EnergyPlus's `main`
is not re-entrant.

Harnesses go in a scratch directory outside the repository. Outside the browser
the schema comes from `localBundle()` in `@idfkit/schemas/node` and wants the full
version string, `load('26.1.0')`.

## The five things to prove, in order

### 1. The declarations hold, and they hold at module load

```bash
node -e "import('./src/study.js').then(() => console.log('roster loads'))"
```

Then break each invariant on purpose and confirm the throw, because an assertion
nobody has seen fail is an assertion nobody has tested: a duplicate id, a
quantity with empty `needs`, a `digits` that is not a non-negative integer, an id
missing from `Target.metric`, and a `needs` no reachable desk satisfies.

**Expected**: each names the specific quantity and what is wrong with it. A
message that says only "invalid declaration" has failed this step.

### 2. A reporting contents set serialises canonically, and the restore is exact

The sweep's restore depends on byte-identical serialisation, and this is the
single most breakable thing in the design.

Build the document, apply a sample's contents set, write the IDF, restore, and
compare. Then build the same contents set from a **different declaration order**
and from a different union order, and compare those IDFs to each other.

**Expected**: byte-identical in all three comparisons. Assert idempotence
alongside it, applying three times, as every model change on this desk must.

**Why this one matters**: on this codebase merely asking whether a type is
present inserts it and moves every later object of that type. A reordering has no
symptom, which is why it is asserted rather than eyeballed.

### 3. Reuse actually reuses, and re-runs only the shortfall

Drive the real scheduler from Node with a counting `runSample`.

1. Open studies on two different controls. Record the engine-run count.
2. Change the one desk quantity to another quantity the same runs answer, for
  example cost to carbon or criterion a to criterion b. **Expected: both curves
  redraw and zero further engine runs occur.**
3. Change to a quantity those runs cannot answer. **Expected: exactly the
  samples that fall short across both studies are re-run, coarse-first, and no
  others.**
4. Turn auto-solve off and choose a quantity with missing samples. **Expected:
  zero engine runs; every affected card remains visibly waiting.**
5. Change back to the first quantity. **Expected: both curves redraw and zero
  further engine runs occur.**
6. With EUI, cost or carbon selected, change Plant efficiency, COP, tariff and
  grid factor. **Expected: the curves rederive immediately from cached meter
  totals and the engine-run count does not move.**

Seed two compatible cache entries for the same desk shape and run kind, one with
fewer extra contents than the other. Confirm lookup takes the least superset.
Then seed an equal-size tie and confirm canonical `RunContents` serialisation
settles it deterministically. An exact `Map` lookup alone cannot pass this check.

These checks cover FR-003, FR-004a, FR-004b, FR-020 and SC-005. Any run at step
2, 5 or 6 means the quantity or a price-only control remains in sample identity,
or compatible lookup or repricing is missing.

### 4. The codec round-trips and refuses

A throwaway script over `encodeState` and `decodeState`, no browser:

- Every reachable `sty=<quantityId>[.<controlKey>[,<controlKey>]*]` value encodes
  and decodes exactly.
- An uninitialized desk with no studies omits `sty`. An initialized desk with all
  studies cleared retains `sty=<quantityId>`.
- Open study controls encode once each, in control declaration order. The
  quantity id encodes once for the desk, never once per control.
- Malformed classes are each refused **whole**, naming what failed: an unknown
  quantity id, an unknown control key, a control that cannot be swept, a
  duplicate control, a malformed separator, or a second `sty=`.
- **A link minted before this feature decodes to exactly the desk it decodes to
  today.** Take a handful of real fragments from before the change and diff the
  decoded `{ params, bypass, station, pin }` against the previous build's. This
  is SC-007's second half and it is the one a version bump would have been for.

### 5. The page, driven

A design day solves in about 50 ms warm, so the desk is quick to exercise.

- Start a study, change what it plots, change it back. The curve is of the
  quantity chosen each time, with its own unit and end labels (SC-001).
- Put a curve up, then engage System, name a room type, press Chase, attach a
  station, and move controls. **The curve's quantity never changes and nothing is
  re-swept for that reason** (SC-002). This is the defect that prompted the
  feature, so walk every one of the three old inference conditions.
- Open studies on two different controls, then change the quantity from either
  card. Both cards change together and continue to name the same quantity
  (SC-005).
- Clear every study, move the desk across an old inference boundary, and start a
  new study. It opens on the frozen desk quantity rather than re-inferring one
  (FR-005).
- With auto-solve off, choose a quantity that the cache cannot answer. No run
  starts. No card presents its previous curve under the new quantity label: it
  either names that curve's previous quantity and says it is waiting, or shows an
  explicit waiting state with no curve (FR-004b).
- Every quantity stands in the offer on a bare design-day desk with every channel
  patched out, each unavailable one carrying a reason and a fix (SC-004). Read
  them: "attach a weather file, this is a year's number" passes; a bare em dash
  fails.
- Open a chooser on an unavailable annual quantity, note the card's position,
  and follow its instruction to attach weather. The same study and strip remain,
  the chooser stays open and focused at the same viewport position, and its card
  reads as waiting until the new annual samples replace it. No outgoing-climate
  curve may remain under the incoming station.
- At 390 px wide and at 600 px tall, every offer and every card reads without
  hovering and without sideways scrolling (Principle VII).

## What "done" looks like

- The five steps above pass, and step 3 shows zero re-runs where a run answers.
- `studyMetric` is gone from `src/main.js`, along with the comment declaring that
  a metric menu must never exist.
- `.interface-design/system.md` carries the chooser as a pattern, added in the
  same change that introduces it.
- `src/tour.js` is untouched, deliberately, and `research.md` records why.
- A sweep of any offered quantity costs no more engine time per sample than the
  leanest sweep does today, measured against the same desk before the change
  (SC-006). The Phase 0 baseline is in `research.md`: 417 to 446 ms per annual
  sample, 7.6 ms of parse on a lean ESO.
