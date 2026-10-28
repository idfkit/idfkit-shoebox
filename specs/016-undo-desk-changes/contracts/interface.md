# Contract: What the Reader Sees and Presses

## Controls

| Where | Element | Accessible name | Visible text | Disabled when |
|---|---|---|---|---|
| `.controls` row, after Auto-solve | `button.link#undo` | Undo the last change | Undo | `!undoStack.canUndo` or the stack is unseeded |
| `.controls` row | `button.link#redo` | Redo the change just undone | Redo | `!undoStack.canRedo` |
| Desk head, before Revert all | `button.link#desk-undo` | Undo the last change | Undo | as `#undo` |
| Desk head | `button.link#desk-redo` | Redo the change just undone | Redo | as `#redo` |

- Both pairs are lettered by one `syncUndo()`, called after every seed, record,
  undo and redo. No other code sets `disabled` on them.
- The buttons are always present (never `hidden`) and are reachable at 390 px
  with the desk open or closed.
- A shortcut hint, if one is shown, is in the button's text or an adjacent line
  in view, never only in `title`.

## Keyboard

| Keys | Action | Not handled when |
|---|---|---|
| Ctrl+Z (⌘Z on Mac) | Undo | The focus is text-editable (`textarea`, `contenteditable`, or an `input` other than range, checkbox, radio or button); a gesture is open; the event is already `defaultPrevented` |
| Ctrl+Shift+Z (⇧⌘Z on Mac) | Redo | as above |
| Ctrl+Y (not on Mac) | Redo | as above |

`preventDefault` is called only when the action ran.

## Browser history

| Event | Before this feature | After |
|---|---|---|
| A gesture ends | `history.replaceState` | Unchanged: `replaceState` |
| An undo or redo in place | — | `replaceState` to the restored scheme |
| An undo or redo across a climate | — | `replaceState`, then `location.reload()` |
| Back or Forward | Leaves the page or reloads (`hashchange`) | Unchanged |

No `pushState` is added anywhere (FR-009).

## Status line

- In place: the restore is not narrated. The solve that follows letters the
  status line, as after any gesture.
- Across a climate, before the reload:
  - "Undoing to a desk solved against another station — reloading to fetch its weather…"
  - "Undoing to a desk solved against another weather file — reloading to ask for it…"
  - The same two sentences with "Redoing to" in place of "Undoing to".
- A step that cannot be applied: `status bad`, "That step could not be put
  back — <reason>. The desk is as it was." The stack does not move.

## Report trail

`TRAIL_KINDS` gains `undo`. Entries are `Undid the last change` and
`Redid a change`, and are unkeyed.

## Storage

`sessionStorage['shoebox-undo-v1']`: see [data-model.md](../data-model.md). It
reaches no link, no kept scheme and no report.
