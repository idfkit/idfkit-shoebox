# Quickstart: Verifying Undo and Redo

There is no test runner. Verification is a Node harness in the scratchpad, then
the page driven with Playwright (Chromium is preinstalled).

## Prerequisites

```bash
npm install
```

```bash
npm run build
```

## 1. The stack, under Node

Write a throwaway harness that imports `src/undo.js` and `src/permalink.js`, and
asserts the seven invariants in
[contracts/undo-module.md](contracts/undo-module.md) with an injected clock. It
also feeds `readKept` a stored stack containing one hash from a fabricated
`v9` link and expects `null`.

## 2. Byte-identical models (SC-001)

Using `src/model.js` (schema from `localBundle()`, `load('26.1.0')`):

1. Build the default document and write its IDF.
2. Apply about 20 random control changes in sequence, recording a `Step` from
   each configuration hash.
3. Walk back through every step's `decodeState` and apply each. The IDF at the
   end must equal the first byte for byte.
4. Walk forward again. The final IDF must equal the one after the last change.

## 3. In the page

```bash
npm run preview
```

Drive the preview with Playwright and check each of these:

| Do | Expect |
|---|---|
| Drag Width, release, press Undo | Width back to default; address equals the boot address; one solve |
| Press Redo | Width at the dragged value |
| Ten ArrowRight presses on Width within a second, then Ctrl+Z | All ten undone together |
| Undo, then move another control | Redo disabled |
| Revert all, then Undo | Every earlier control and patch is back |
| Solo a channel, change a control, Undo, un-solo | The patch bay from before solo is back, not "everything out" |
| Type in a margin field, then Ctrl+Z | The field's text undoes; the desk does not |
| Three changes, reload, Undo three times | Same desks as without the reload |
| Three changes, press browser Back once | The page is left (`page.url()` changes origin or goes to `about:blank`) |
| 30 clicks across controls in 10 s | No console error; address equals the desk |
| Pick a station, then Undo | The status line says it is reloading; after boot the desk is on the default climate with the same params; Redo is enabled |
| Open the page in private mode, make changes, Undo | Works; after a reload Undo is disabled, with no error |
| Viewport 390 px, desk open and closed | Undo and Redo are visible and operable |

Also check the report's trail lists `Undid the last change`, and that the `drag`
general note mentions Undo with the new storage key.
