# Quickstart: validating TM59 Category I as a reading

There is no test runner and no linter. Verification is throwaway Node harnesses against the
DOM-free modules, then the page driven. Every step below is a thing that can come back
wrong; a step that cannot fail is not in the list.

## Prerequisites

```bash
npm install
npm run dev        # predev stages the engine assets, schemas and the station index
```

Harnesses live under the session scratch directory, not in the repository. They import
`src/*.js` directly — `study.js`, `survey.js`, `schemes.js`, `tm59.js` and `permalink.js`
are DOM-free and network-free, which is exactly why they are where the arithmetic lives.

---

## 1. The three invariants throw when they should

The point of a load-time assertion is the message it gives when the declaration is wrong, so
each is checked by breaking the declaration on purpose in a scratch copy and reading what
comes out.

| Break | Expect |
|---|---|
| Delete the `tm59aI` declaration | I1 throws naming criterion a, that the method states it at two categories, and that the roster carries one |
| Declare `tm59cI` at Category I | I1 (or the constructor) throws naming criterion c and `byCategory: false` |
| Leave `tm59-a-I`'s `metric` at `'tm59a'` | I2 throws naming the target, the quantity, and the two categories that disagree |
| Remove `tm59aI` from `QUALIFIER_BY_METRIC` | I3 throws naming the reading and the missing half |
| Declare `category: 'I'` as a string | the `Quantity` constructor throws naming the quantity |

**Pass**: every one throws at import, before any drawing, with a message naming both
declarations. **Fail**: any of them mounts, or throws something that does not say what to
edit.

---

## 2. Every target matches exactly one reading, at its own category

The cross product is the substance of FR-006 and SC-003, and it is cheap to take whole.

```js
// over every standard's targets × every reading on the roster
for (const reading of READINGS)
  for (const { preset, target } of matchedTargets(reading)) …
```

Assert, over the full product:

- every TM59 target is matched by **exactly one** reading;
- the reading that matches it declares `target.category` as its own `category`;
- no Category I target is matched by a Category II reading, or the reverse;
- `thresholdsFor` gives lines or a stated absence for all fifteen readings, never both and
  never neither.

**Pass**: counts are exact and no cross-category pairing exists. **Fail**: any target matched
zero or twice, or matched by a reading whose category differs.

---

## 3. The codec, both ways, including a link written before this change

```js
encodeState({ …, quantity: 'tm59aI', studies: ['wwrS'] })   // → sty=tm59aI.wwrS
decodeState('…sv=wwrS*wallR*tm59aI')                        // → reading tm59aI
decodeState('…sv=wwrS*wallR*tm59a')                         // → reading tm59a, Category II
decodeState('…sty=tm59aX')                                  // → refused, whole, by name
```

Assert: both new ids round-trip through `sty` and `sv` and re-serialise to canonical text;
a two-reading survey carrying both categories (`sv=wwrS*wallR*tm59a.tm59aI`) round-trips;
`LINK_VERSION` is unchanged and `DEFAULTS_BY_VERSION` has no new entry; and a link captured
from the current deployment before the change restores the same reading afterwards
(FR-012, SC-006).

**Pass**: every round trip is exact and the pre-existing link restores Category II.
**Fail**: any refusal of a link that was good before, or any silent reinterpretation.

---

## 4. The sheet is byte-identical where it should be (SC-005)

Two harness runs over the same desk, before and after the change, at several console
positions:

- the IDF written at each position is **byte-identical** — this feature touches no applier,
  so any difference at all is a defect, not a tolerance;
- the board's five TM59 rows letter identical figures and identical labels;
- `clearedCount` returns the same count with the same scope sentence;
- `tm59c`, `overheat` and every non-TM59 reading are unchanged.

**Pass**: no diff. **Fail**: any diff, including a whitespace one.

---

## 5. What the two extra readings cost a sample (Principle VI)

Measured, not assumed — this is the one number the plan owes.

1. Time `readPoint` over a landed annual sample that answers TM59, median of 200, before
   and after.
2. Cut a survey along two controls for `tm59a`, note the run count from `Coverage.runs`,
   then switch the same ground to `tm59aI` and confirm the run count does not rise
   (FR-015, SC-004) — both categories land from the same cached sample because
   `contentsFor` returns the same contents and `shapeKey` never saw the reading.

**Pass**: the per-sample delta is a fraction of a millisecond against the engine run that
produced the sample, and switching category costs zero runs. **Fail**: any new run, or a
delta large enough to show in a drag.

---

## 6. IP lettering (the trap this sheet keeps re-finding)

Both new readings are counts — a share of occupied hours and a count of nights — so neither
converts, and that is exactly why it is checked rather than assumed:

- `format(v).endsWith(unitNow)` holds for both readings in **both** unit systems, under the
  existing 87-face harness;
- the survey's trade sentence letters a *change* in either reading through `Reading.change`,
  not `Reading.format`;
- switching SI ↔ IP re-letters the chooser, the axis name and the contour labels, and no
  cached string survives the switch (`chooserDrawn` and `noteCache` both carry `system()`).

**Pass**: no figure carries a unit it was not lettered in. **Fail**: any figure standing in
the system it was built in.

---

## 7. The page, at 390 px and at a desk

Drive it. A design day solves in about 50 ms, so there is no excuse.

1. Attach a weather file, patch Gains in, run some of May to September.
2. Open the study metric chooser: fifteen readings, the four TM59 ones each naming their
   category, the two new ones offered on the same terms as their pair and refused with the
   same sentence and fix when the run cannot answer them.
3. Sweep one control at `tm59aI`. The curve is computed at Category I — confirm it differs
   from `tm59a` wherever hours fall between the two lines, and that it is not simply a copy.
4. Cut a survey for `tm59aI`. Confirm the Category I published line is drawn and named on
   both the plan and the relief, and that no Category II line appears.
5. Chase TM59 and confirm the ground narrows to the chased standard's line for the plotted
   category.
6. At 390 px: every new chooser row readable and selectable, nothing on hover, no sideways
   scroll.
7. In a background tab, force a paint before believing any E-02 figure — `renderSurveySoon`
   starves under `requestAnimationFrame` and it looks exactly like a lettering bug.

**Pass**: all seven. **Fail**: any figure that does not name its category, or any line drawn
from the other one.

---

## 8. The absences still say what to do

With Gains patched out, or with a run that never reaches May to September, confirm the two
new readings report the same absence, with the same reason and the same fix, as their
Category II pair — an em dash with a sentence, out of every total, never a zero
(Principle IV, FR-010).
