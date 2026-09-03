# Contract: the console's mounted interface

**Module**: `src/console.js` | **Consumed by**: `src/main.js`

`mountConsole` keeps its signature and every method it returns today. This
feature is additive to that contract: `main.js` reaches past it in exactly one
place (`desk.solo = null`), and nothing else outside `console.js` knows what a
strip is — except the general notes, which are treated in their own contract.

## Unchanged

```js
mountConsole({ host, params, bypass, onChange, onPatch, onSolo, onReset,
               onStudy, onStudyClear, onPin })
```

returning `sync`, `settle`, `setWeatherHolidays`, `solo` (get/set), `setState`,
`setReadings`, `setDerived`, `setStudy`, `setStudyProgress`, `setSweepEnabled`,
`studyCount`, `clearStudies`.

Two existing behaviours are load-bearing here and must survive:

- **`setStudy` throws** when no row is registered for a key
  (`console.js:1998`). The `rows` map is what makes a control sweepable, and 85
  of the controls register into it. A card grid must keep every study anchor,
  including the four per-wall anchors a `Facade` registers (`console.js:808`).
- **`studyCount()` reads `cards.size`**, not the caller's `studies` map, so a
  sweep that has a card up but no curve yet is counted (`main.js:5962`).

## Added

```js
api.reveal(channelId, on)      // set or clear a kept reveal; returns nothing
api.revealed()                 // → string[] of channel ids, for the store
api.search(query)              // → { matches: Match[], revealed: string[] }
api.clearSearch()              // restores the reader's prior reveal state
api.edits()                    // → Edit[], measured against DEFAULT_PARAMETERS
api.showEdits(on)              // reveal exactly the edits, or restore
```

**Every one of these is presentational.** None may call `onChange`, `onPatch`,
`onSolo` or `onReset`, and therefore none can reach `commit`, `applyGeometry`,
`patchChannel`, `revert` or `pump`. `pump()` is the only thing in the
application that starts a simulation (`main.js:5658`), and it is reached only
from those callbacks. This is what makes FR-025 and SC-008 structural rather
than a promise: a method that does not call a callback cannot start a run.

`api.search` and `api.edits` read `params` and `bypass` — the live objects the
console already holds by reference (`console.js:63-66`) — and never copy them.

## The peek is not in this contract

Peeking is a pointer state inside `console.js` and reaches `main.js` not at all.
It writes nothing, announces nothing, and is not readable from outside. That is
the point: nothing outside the console can come to depend on a state that exists
only while a pointer is resting.

## What `main.js` must do

Three things, and no more:

1. Hand the console a store for kept reveals, obtained the way the scheme shelf
   is (`main.js:4031-4040`): probe `localStorage` with a real round trip, pass
   the store or `null`. The console degrades to "not remembered".
2. Nothing on `openDesk`. The grid is what the panel already contains.
3. Keep `desk.solo = null` working (`main.js:2379, 3156, 4236, 4334`).

## What must not change

`shapeKey` (`main.js:2078`) and `restShapeKey` (`main.js:2092`) must be
untouched. A card's state is not part of the desk's shape, so a revealed card
must not stale a study, and a study must not be re-swept because somebody opened
a card. This is the same rule that keeps `pinnedHour` off `params`.
