# Quickstart: Verifying Trim the App's Copy

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

There is no test runner. Verification is the steps below: two Node harnesses in
a scratch directory and a pass through the page.

## Prerequisites

- `npm install` has run, and `npm run dev` stages the engine and schemas.
- A scratch directory outside the repository for harness scripts and their
  output.
- The baseline taken **before** any change: steps 1 and 4 run once on `main`
  and saved as `before/`.

## 1. The model does not move (SC-008)

Copy `specs/007-upgrade-idfkit-js/verify/build-positions.mjs` to the scratch
directory and run it against the baseline and the branch.

**Expected**: all eight IDFs are byte-identical between `before/` and `after/`.
Any difference is a defect: this feature touches no applier.

## 2. Budgets refuse at load (SC-007)

In a Node script, `await import('src/controls.js')`, `src/tour.js`,
`src/tm59.js` and `src/schemes.js`.

**Expected**: all four load without throwing. Then, one budget at a time,
lengthen one declared string past its limit (a `Channel.line`, a `Note.step`, a
string `requires.reason`, the qualifications summary) and import again.

**Expected**: each import throws with the message shape in
[contracts/budget.md](./contracts/budget.md), naming that declaration. Revert
each edit.

## 3. Function-valued reasons choose declared text

For each channel whose `requires.reason` is a function, build the desk at a
position that blocks it (Air with Fabric bypassed, Air with one exterior
surface, Air with adaptive venting and Gains out) and call the reason.

**Expected**: the returned string is one of that channel's `requires.reasons`,
by identity.

## 4. What is on screen (SC-001 to SC-003)

Run the page, and at each position in
[contracts/measure.md](./contracts/measure.md) paste the measurement snippet
into the console.

**Expected**:

| Scope | Before (approx.) | After |
| --- | --- | --- |
| sheet, default desk, first visit | 2,000 | 600 or fewer |
| console, open, wide | 2,500 | 400 or fewer |
| any single block | up to 520 | 40 or fewer |
| description and finding | 70 to 90 | 60 or fewer |

## 5. Nothing a reader relied on went missing (SC-004, SC-005)

At the default desk and the three other positions, list every reading, figure,
verdict, em dash and blocking reason visible before; confirm each is visible
after without opening anything. Then list every piece of text that left view;
confirm each is either one tap away on the element it explains or is on the
duplicate list in [research.md D8](./research.md#d8-what-is-cut-as-a-duplicate).

## 6. Folds behave

- Open a target's method note, drag a slider through several design-day solves.
  **Expected**: the note stays open.
- Open a control's note in a strip, then fold and unfold that strip on a
  390 px window. **Expected**: the note is still open, and Tab skips it while
  the strip is folded.
- Reload. **Expected**: every fold is closed.
- Tab through the console with a screen reader running. **Expected**: each fold
  is announced as collapsed or expanded with a name that says what it is about.
- Copy the address before and after opening folds. **Expected**: identical.

## 7. The general notes

Clear `localStorage`, load the page. **Expected**: the new storage key is in
use; each note shows one instruction of 15 words or fewer; opening a note shows
its fuller text; each marker still fills only on its genuine event (a solve, a
drag, a station attach, opening the desk, a patch, a link).

## 8. The page on a phone

At 390 x 844 and at 844 x 390: every reading readable without scrolling
sideways or hovering; no fold summary wraps to a second line; the folded strip
index still shows each strip's reading and any blocking reason.
