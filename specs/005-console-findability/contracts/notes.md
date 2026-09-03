# Contract: the general notes

**Module**: `src/tour.js` | **Consumed by**: `src/main.js`

Workflow gate 6 and FR-034 make this part of done rather than a follow-up. The
notes are the one place outside `console.js` with a structural dependency on
what a strip is, and it fails silently.

## The dependency

`NOTES` holds six notes (`tour.js:46-112`). Two are affected:

- **`patch`** carries `focus: '#desk .patch'` (`tour.js:97`) — a CSS selector
  into the console's live markup. `stage()` does `if (!el) return;`
  (`tour.js:172-173`), so a selector that finds nothing produces no error, no
  log and no circled subject. `syncGuide()` (`tour.js:160-167`) has the same
  dependency for the `.guided` redline.
- **`desk`** ("Open the model console") describes what the reader will meet:
  "Eighteen channels in the order the physics happens." A grid of cards is still
  eighteen channels in that order, but the copy names what is behind the button
  and the thing behind the button has changed shape.

## Requirements

1. A **patch marker must exist on a closed card**, so `#desk .patch` continues to
   resolve with no card open. This is required by FR-001 independently — a
   card letters its patch state closed — so the note's subject survives as a
   consequence of the spec rather than as a special case for it.
2. The `desk` note's copy is rewritten to describe the grid and the reveal.
3. A note for the finder is considered. The notes record what has happened on
   the desk, and searching is now one of the things a reader does; but six notes
   is the established count and adding a seventh is a judgement for whoever
   writes it, not something this contract settles.
4. **The storage key is bumped** — `shoebox-general-notes-v2` becomes `-v3`
   (`tour.js:25`) — because the steps change meaning. A returning reader gets
   the new sheet rather than stale ticks against notes they never read.

## What must not change

A marker fills only when its step has actually happened on the desk. Revealing a
card is not patching a channel, and a peek is not a gesture the reader chose, so
neither may file a note. The `drag` note is filed from `onChange` only when
`params[key] !== value && !PRICED_KEYS.has(key)` (`main.js:3171-3177`), and that
guard is exactly why a search — which commits nothing — cannot claim it.
