# Quickstart: validating console findability

**Feature**: Console findability | **Branch**: `005-console-findability`

There is no test runner and no linter in this repository. Verification is
throwaway Node harnesses under a scratch directory plus driving the page, per
the constitution's workflow section. This feature splits unusually cleanly down
that line, and the split is worth stating before the steps:

- **`src/finder.js` is DOM-free**, so the vocabulary, the matching, the blocked
  reasons and the edit list are all callable from Node against the real
  declaration. These are the assertions that can be made to hold permanently.
- **The grid, the peek and the animation exist only in a browser.** No harness
  can tell you whether a card walks out from under a pointer. Those are driven,
  and the numbers to beat are in [research.md](./research.md).

## Prerequisites

```bash
npm install
npm run dev          # predev stages ~50 MB of engine, schemas and stations
```

A fresh clone must run `predev` or `prebuild` once or the page will not load.
The engine is not needed for any check in this document except the last.

## 1. Headless: the finder answers for every key

Write a throwaway script under a scratch directory that imports
`src/controls.js` and `src/finder.js` and asserts:

1. **Coverage.** Every key in `ALL_KEYS` is returned by `find` for a query equal
   to its own `labelFor(key)`. Expect the count to equal the declaration's own
   key count — 138 on `main`, 144 on the stack tip this lands on (research D11).
   Zero misses is the pass; SC-003.
2. **Channel and subject.** Every `Match` carries a channel, and every match on a
   `Facade` wall key or a `Boundary` face key carries a subject. FR-021.
3. **Only matches.** For a sample of terms, the returned set equals the set
   computed independently by scanning the vocabulary. Zero non-matching, zero
   omitted; SC-004.
4. **Blocked is explained.** Construct parameter sets that put controls into each
   of the five blocked states, and assert every blocked match carries a
   non-empty sentence. A `Blocked` with no sentence must throw; SC-009, FR-023.
5. **Load-time assertions fire.** Add a key to a fake channel with no label and
   confirm the vocabulary assertion throws at load rather than at first search.

Run against the real functions, never a copy.

## 2. Headless: the edit list equals the link's own diff

The cheapest true test in the feature, because two independent pieces of code
answer the same question:

```
for a set of desks: |edits(params, bypass)|  ==  number of pairs encodeState writes
```

`encodeState` diffs `params[key] !== DEFAULT_PARAMETERS[key]` inline
(`src/permalink.js:171`). Assert equality after: a fresh desk (expect zero, and
the "at its defaults" sentence rather than an empty list, FR-032), a desk with
*n* controls moved, a desk with channels patched, a revert, a decoded link, and
a restored scheme. SC-015.

## 3. Driven: the grid fits

Open the page, open the console, and confirm against the research numbers:

| check | expected | source |
|---|---|---|
| all eighteen cards visible, nothing revealed, no scrolling | yes | FR-001, SC-001 |
| closed card carries number, name, reading, patch marker | yes | FR-001 |
| a blocked channel's sentence readable closed | yes | FR-003 |
| grid relayout | ~7 ms, not ~97 | research M5 vs M2 |

If the grid is still costing anything like 97 ms, the multi-column wrapper is
still in place somewhere; see research D1.

Do this at the desk's ordinary width, at the `--index` breakpoint
(`max-width: 780px` or `max-height: 600px`) and at 390 px. The three sizes are
the ones the sheet already names; this feature introduces no fourth threshold.

## 4. Driven: the peek behaves

This is the part no harness reaches, and the failure it is looking for is the
one in FR-006.

1. **Sweep.** Move the pointer at reading speed across the full width of the
   grid, several rows. Expect: each card opens and closes in turn; **zero** cards
   left open; the scroll position unmoved; no card the reader had revealed
   disturbed. SC-011.
2. **Rest.** Hold the pointer still over one card. Expect exactly one card
   peeking, and it stays that card. If the card oscillates with a neighbour, the
   expansion is not anchored — research D4. SC-012.
3. **Promote.** Click a peeking card; it stays open when the pointer leaves.
   Leave and return; it is still open. FR-007.
4. **Coexist.** Reveal a card, then peek at its neighbour. The revealed card
   stays revealed and its controls do not move. FR-005.
5. **Pace.** Sweep all eighteen and confirm nothing is still animating behind
   the pointer. SC-013.
6. **Reduced motion.** Set the OS preference and repeat 1 and 3. The peek still
   happens; the animation does not. FR-008, SC-017.
7. **Big cards.** Open Air (18 controls, measured at 1,419 px against a 473 px
   scroller). Every control reachable, nothing truncated, no sideways scroll,
   and the grid did not jump. FR-011, D5.

## 5. Driven: keyboard and screen reader

Unplug the pointer, literally or by discipline.

- Tab to a card, open it with Enter and Space, close it again. FR-004.
- Confirm controls inside a closed card are **not** reachable by tabbing, and
  that opening a card does not move your place in the tab order. FR-012.
- Confirm a reveal is announced and a peek is not. FR-014.
- Drive the search: open it, type, move among revealed controls, turn one. FR-027.
- Repeat at 390 px with a coarse pointer, where no peek exists at all. SC-010.

## 6. Driven: nothing runs

With the network tab and the status line in view, search, clear, reveal, fold,
sweep the grid and list edits. Expect **zero** solves. SC-008.

This is structural rather than observational — none of the added methods calls a
console callback, and `pump()` is only reachable from those (contract:
`console.md`) — but it is worth watching once, because the whole claim of the
feature is that finding is free.

## 7. Driven: the general notes still teach the page

Clear `localStorage`, reload, and walk all six notes. Confirm the `patch` note
finds a subject with no card revealed, and that the `desk` note describes what
is actually behind the button. Confirm the key was bumped to `-v3` by checking
that a stored `-v2` state does not tick the new sheet. Contract: `notes.md`.

## 8. The one thing that needs the engine

Confirm the desk still solves. Open the console, turn a control from inside a
revealed card, and watch a design day come back in about 50 ms. The point is
that `commit` is still reached the same way from a card as it was from a strip.
