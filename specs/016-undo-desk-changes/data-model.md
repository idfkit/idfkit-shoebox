# Data Model: Undo and Redo on the Desk

All types live in a new DOM-free, network-free module, `src/undo.js`, so a Node
harness can drive the real code. The page wires them in `src/main.js`.

## Step (frozen class)

One state of the desk, held as a link.

| Field | Type | Rule |
|---|---|---|
| `hash` | string | The configuration hash: `encodeState` of `params`, `patching()`, station and file, with no view, pin, quantity, studies or survey. Non-empty and starts with a link version (`isSchemeFragment`). |
| `solo` | string \| null | The soloed channel id, or `null`. |
| `patchBay` | object \| null | The raw bypass map when `solo` is set, otherwise `null`. Frozen copy. |
| `key` | string \| null | The single control the gesture moved, or `null` for a multi-key, patch, climate or restore gesture. Used only for merging. Not persisted. |
| `at` | number \| null | When the step was recorded, from the injected clock. Not persisted (a reloaded present never merges). |

- `Step.same(a, b)`: true when `hash` and `solo` are equal, and when `patchBay`
  is equal if `solo` is set. `key` and `at` are not compared.
- Constructor throws on a `hash` that is not scheme-shaped, on `patchBay` given
  without `solo`, or on `solo` given without `patchBay`.

## UndoStack (class)

| Field | Type | Rule |
|---|---|---|
| `past` | Step[] | Oldest first. Length ≤ `LIMIT − 1`. |
| `present` | Step \| null | `null` until seeded. |
| `future` | Step[] | Nearest first. |
| `limit` | number | `LIMIT = 100` steps in all (FR-016). |
| `mergeWindow` | number | `MERGE_WINDOW = 1000` ms. |
| `now` | () => number | Injected clock. |
| `merging` | boolean | False after any undo or redo, until the next record. |

### Operations

| Operation | Effect |
|---|---|
| `seed(step)` | `present = step`, `past = []`, `future = []`. |
| `adopt(stored, step)` | Takes the stored stack if `Step.same(stored.present, step)`; otherwise behaves as `seed(step)`. Validation of the stored stack's hashes is the caller's (it needs `decodeState`). |
| `record(step)` | Ignored while unseeded or when `Step.same(step, present)` (FR-005). Merges (replaces `present`, keeps `past`) when `merging`, `step.key` is non-null and equal to `present.key`, and `step.at − present.at < mergeWindow`. Otherwise pushes `present` onto `past`, drops the oldest past step beyond `limit`, sets `present = step`, clears `future` (FR-012) and sets `merging = true`. |
| `undo()` | Returns the step to restore, or `null`. Moves `present` to the front of `future`, pops `past` into `present`, sets `merging = false`. |
| `redo()` | The mirror of `undo()`. |
| `canUndo` / `canRedo` | `past.length > 0` / `future.length > 0`. |
| `toJSON()` | `{ linkVersion, past, present, future }`, each step as `{ hash, solo, patchBay }`. |
| `static fromJSON(raw)` | Parses. Throws, naming the field, on any shape error. |

### State transitions

```text
unseeded --seed/adopt--> seeded(empty) --record--> seeded(past>0)
seeded --undo--> seeded(future>0) --record--> seeded(future=[])
any --refuseLink--> seeded(empty) on the issued drawing
```

## Undo record in storage

| Item | Value |
|---|---|
| Store | `sessionStorage` (per tab) |
| Key | `shoebox-undo-v1` |
| Value | `JSON.stringify(stack.toJSON())` |
| Written | After every `seed`, `record`, `undo` and `redo` |
| Read | Once, at seed time (research R2 and R6) |

## Page state added to `src/main.js`

| Name | Purpose |
|---|---|
| `undoStack` | The one `UndoStack`. |
| `gestureKeys` | A `Set`, cleared in `beginGesture` and filled by `commit`. Its sole member, if there is exactly one, is the step's `key`. |
| `restoring` | True while a step is being applied, so `updatePermalink` moves the address without recording. |
| `configHash()` | The configuration-hash builder beside `schemeHash`. |
| `currentStep()` | Builds a `Step` from `configHash()`, `solo`, `bypass`, `gestureKeys` and the clock. |
