# Quickstart — validating the threshold isoline

There is no test runner and no linter in this repository. Verification is a throwaway
Node harness against the DOM-free modules, then driving the page. This guide is the
run guide; the arithmetic it exercises is specified in
[data-model.md](./data-model.md) and [contracts/thresholds.md](./contracts/thresholds.md).

**Gates 1–3 of the constitution's workflow do not apply here** and that is asserted
rather than assumed — see "The no-model check" below. Nothing in this feature reaches
`applyModel`, the IDF, the link codec or the engine, so there is no model to build, no
idempotence to assert and no `.rdd` to confirm against.

## Prerequisites

```bash
npm install
npm run dev        # predev stages engine assets, schemas and the station index
```

A fresh clone must run `predev` or `prebuild` before the page will load. The harness
below needs neither — `survey.js`, `schemes.js`, `study.js` and `copy.js` are DOM-free
and import nothing staged.

## 1. The declaration harness (no engine, no browser)

Write it under the scratch directory, not into the repository. It imports the real
modules — never a copy of the rules.

```bash
node --experimental-vm-modules "$SCRATCH/thresholds.mjs"
```

What it must assert:

| # | Assertion | Covers |
| --- | --- | --- |
| 1 | importing `src/survey.js` **does not throw** — the four load-time invariants pass over the whole `READINGS × targets` cross product | data-model, gate 5 |
| 2 | for each of the 13 readings, `thresholdsFor(reading)` returns either a non-empty `lines` **or** a non-empty `absence`, never both and never neither | FR-005, SC-004 |
| 3 | `tedi` returns three lines while nothing is chased; two of them (Passivhaus, LETI) are coincident at 15 and collapse to one level in `thresholdLevels` | FR-012, R-5 |
| 4 | every returned `threshold.limit` is `===` the `Target.limit` the scoreboard reads for the same preset and metric | **FR-009, SC-002** |
| 5 | every `threshold.passesBelow` agrees with `target.meets` probed either side of the limit | FR-003, R-2 |
| 6 | `thresholdsFor(readingFor('tedi'), { chased: 'enerphit' })` returns exactly one line, EnerPHit's | FR-013, SC-005 |
| 7 | `thresholdsFor(readingFor('tm59a'), { chased: 'passivhaus' })` returns no lines and an absence naming Passivhaus | FR-014 |
| 8 | the `tm59a`/`tm59b` lines matched are the **Category II** targets, matching `TM59_STUDY_CATEGORY` — not Category I, whose limit is identical | R-4, the quiet failure |
| 9 | `overheat`'s matched targets all carry `above: 25`, the temperature its quantity reads at | R-4 |
| 10 | on a synthetic lattice with a hole, `passingGround` emits no cell touching an unmeasured corner, and `passing <= measured` | **FR-004** |
| 11 | on a lattice wholly below a limit, `wholly === 'passing'`; wholly above, `'failing'`; and `segments` is empty in both | **FR-007** |
| 12 | a lattice whose values straddle a limit gives `segments` identical to `contoursOf(lattice, [limit])` | FR-006, R-3 |
| 13 | `thresholdsFor` called twice with the same arguments gives equal sets, and switching `chased` and back gives the original set | **FR-015** |
| 13b | the six states of a band's key entry, driven through the imported `thresholdSentence` — the whole visible block, opening included, never a second spelling of it — against the real `passingGround`: the entry claims a hatch only where `hatched`, claims a crossing only where no rule was drawn, ends with the claim its opening introduces, and stays inside `CEILING`'s forty words (worst case 35) | FR-005, FR-007, copy |
| 14 | lettering: `threshold.figure()` in IP is the SI limit converted by the reading's kind, and `format(v).endsWith(unitNow)` still holds over all faces in both systems | units invariant |

## 2. The no-model check

Prove the gates that do not apply, do not apply:

```bash
grep -n "applyModel\|IdfDocument\|Output:" src/survey.js      # expect no new matches
git diff --stat -- src/permalink.js src/model.js src/controls.js
```

- `src/permalink.js`, `src/model.js` and `src/controls.js` are **unchanged**.
- `LINK_VERSION` is unchanged and `DEFAULTS_BY_VERSION` has no new entry.
- `shapeKey`'s inputs are unchanged, so a ground cut before the change and one cut after
  share sample-cache identity — chase and re-chase must cost **zero** engine runs. Watch
  the run count on the sheet: `#s-runs` must not move.

## 3. Driving the page

`npm run dev`, then open E-02. A design day solves in about 50 ms, so the whole desk is
exercised quickly.

| Scenario | Do | Expect | Covers |
| --- | --- | --- | --- |
| A | cut a ground for **TEDI** over two controls, annual run | three lines while nothing is chased — Passivhaus/LETI as one line at 15 labelled with both, EnerPHit at 25 — each with its own hatched band, each named in the key | US1, US4·1, FR-001/3/12 |
| B | look at the line against the contours | the threshold reads as a distinct chain-dashed line, not confusable with the hairline contour or the heavier every-fifth one | US2·1, FR-002 |
| C | switch to the relief | the same lines at the same positions on the ground, the same bands, no band over unsurveyed ground | US1·3, FR-006 |
| D | chase EnerPHit on the scoreboard | the ground redraws **immediately** to EnerPHit's line and band alone; the others are gone | US4·2, FR-013/15 |
| E | stop chasing | all three return, nothing left over | US4·4, FR-015 |
| F | chase Passivhaus, plot **TM59 criterion a** | no line; the key says Passivhaus carries no threshold for this reading | US4·3, FR-014 |
| G | plot **zone high** (a `CONVENTION` reading) | no line, no band, and the key states that no standard publishes a limit for it — and the improving-region hatch, if shown, is still plainly its own separate thing | US3·1, FR-005/11 |
| H | plot **CEDI** | absence, with the publisher's own reason: set per building and per climate | US3·2, FR-005 |
| I | move the desk to a failing corner | the improving hatch and the passing band read as two distinct things and are not conflated | edge case, FR-011 |
| J | change the plotted reading | line and band follow the new reading or disappear with a reason; nothing stale | FR-008 |
| K | find a threshold landing on a round contour level | exactly one line there, identified as the threshold | US2·2 |
| L | with a ground carrying gaps | the band stops at the measured edge; bare sheet stays bare | FR-004 |
| M | switch SI → IP and back | every threshold figure, in the key, on the line label and in the aria label, re-letters; the SI sheet comes back character for character | units |
| N | at **390 px** | every threshold, its band and the absence sentence are readable without opening, scrolling sideways or hovering | Principle VII |
| O | with a screen reader / by tabbing to the ground | the aria label states the thresholds, their standards and the pass side | US1·2, Principle VII |

**Before believing any "it did not update"**: check `document.visibilityState`. A hidden
tab starves `requestAnimationFrame`, `renderSurveySoon`'s frame flag stays set, and E-02
stops re-lettering entirely. Three "stale" figures were chased this way before. Force a
paint first.

## 4. Copy budgets

```bash
node "$SCRATCH/budgets.mjs"     # imports src/copy.js and counts the real strings
```

The threshold entries, the absence sentence and the `wholly` sentence are composed at
render time, so they are measured on the page at four desk positions rather than thrown
on: `STANDING` 15 words for a refusal or blocking reason, `ABSENCE` 12 beside an em
dash, `CEILING` 40 for any single visible block. Method and citation go in a fold;
the reading, the verdict, the absence reason and the refusal never do.

## 5. Done when

- [ ] all 14 harness assertions pass, and `src/survey.js` imports without throwing
- [ ] scenarios A–O pass on the driven page
- [ ] `#s-runs` does not move across a chase, a re-chase or a unit switch
- [ ] `src/tour.js`: the E-02 note's body teaches the boundary, and `STORE` is bumped to
      `shoebox-general-notes-v5` (workflow gate 6)
- [ ] `.interface-design/system.md` records the threshold line's signature and the
      band's hatch, in the same change (workflow gate 8)
- [ ] `docs/design-notes.md` gains the findings this work turned up, under the E-02
      section — not `CLAUDE.md`, which is the short form
