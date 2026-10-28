# Implementation Plan: Undo and Redo on the Desk

**Branch**: `feature/gallant-shannon-kzncrr` (spec directory `016-undo-desk-changes`) | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-undo-desk-changes/spec.md`

## Summary

Add an undo stack held inside the page, with the browser's history left as it is. A step is the
desk's **configuration hash**: the scheme link with the reading state (view,
pin, studies, survey) left out. Next to it the step holds the console's solo
state, which the link bakes into the patch bay.

- **Recording** happens in `updatePermalink`, the funnel every gesture already
  ends in.
- **Undo in place** reuses `restoreScheme`'s body.
- **Undo across a climate** goes through the link reload, as restoring a kept
  scheme does.
- **The stack** lives in a new DOM-free `src/undo.js`, is kept in
  `sessionStorage` so it survives a reload of the tab, and is adopted at boot
  only when its present equals the desk that arrived.
- **Controls**: two Undo/Redo pairs (the controls row and the desk head) and
  the usual shortcuts.

## Technical Context

| Item | Detail |
|---|---|
| Language/Version | JavaScript (ES modules, ES2022), browser and Node 20+ for harnesses |
| Primary Dependencies | `@idfkit/*` only. No new dependency (Principle V) |
| Storage | `sessionStorage` (per tab), key `shoebox-undo-v1`. Probe-and-wrap access as `weather.js` does |
| Testing | No runner. Node harness against `src/undo.js` and `src/permalink.js` plus `src/model.js`; Playwright against `npm run preview` ([quickstart.md](quickstart.md)) |
| Target Platform | Evergreen browsers, desktop and phone (390 px) |
| Project Type | Single-page client-side web app (Vite) |
| Performance Goals | Controls show the restored state within 100 ms of the press (SC-002). A restore costs one `applyModel`, as any gesture does; the solve that follows is latest-wins as usual |
| Constraints | No history writes beyond today's `replaceState` (FR-009); WebKit's limit of 100 history writes per 10 s is therefore untouched. Stack ≤ 100 steps, about 60 KB |
| Scale/Scope | One new module (~200 lines); edits to `main.js`, `report.js`, `tour.js` and `index.html`; one bump to the general notes storage key |

No unknowns remain; [research.md](research.md) resolves R1 to R10.

## Constitution Check

*Gate before Phase 0, re-checked after Phase 1. Both pass.*

| Principle | Assessment |
|---|---|
| I. Everything runs in the browser | Pass. The stack is in `sessionStorage`; nothing leaves the tab |
| II. Deterministic and shareable | Pass. Nothing new reaches the IDF or `params`. A step *is* a scheme link and is restored through `decodeState`, so undo can produce only desks a link could. The stack is not on the link, and `LINK_VERSION` does not move |
| III. Read it back off the model | Pass. A restore assigns `params` and the patch bay and re-applies the model; every figure is then read back as after any gesture. The buttons letter no figure |
| IV. No silent fallbacks | Pass. A step that will not decode, or whose solo map disagrees with its hash, is refused with a stated reason and the stack does not move. A kept stack that fails validation at boot is discarded whole, never partly used. Starting with an empty stack substitutes nothing the reader asked for, so it is stated as an absence (Undo disabled), not an error |
| V. Only `@idfkit/*` at runtime | Pass. Platform APIs only |
| VI. Latency is the interface | Pass. A restore is a gesture: `applyGeometry`, then a latest-wins `pump`. Results stay standing and dimmed (`markStale`). Studies cancel and re-queue through the existing `endGesture` path; the sample cache is kept |
| VII. Mobile-first | Pass. The buttons are in view at 390 px with the desk open or closed; shortcuts are an extra route, never the only one; nothing is hover-only |
| Gate 4 (codec round-trip) | Covered: the step hash is `encodeState`'s output, already round-tripped. The harness adds the stack's own JSON round-trip |
| Gate 6 (general notes) | `drag` note body gains the Undo clause; `STORE` bumped to `-v8` |
| Gate 8 (design system) | Reuses `button.link` and its disabled state, so no new token or pattern. If a shortcut hint line is added, it uses the existing `take-note` / `toggle-sub` type and is recorded in `.interface-design/system.md` if it is not already a listed pattern |

## Project Structure

### Documentation (this feature)

```text
specs/016-undo-desk-changes/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── interface.md     # controls, keys, history, status, trail
│   └── undo-module.md   # src/undo.js API and harness invariants
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (not created here)
```

### Source code (repository root)

```text
src/
├── undo.js        # NEW. Step, UndoStack, readKept, keep (DOM-free)
├── main.js        # configHash, currentStep, gestureKeys, restoring, the record in
│                  # updatePermalink, seeds (boot, attachFromLink, openFileLink,
│                  # refuseLink), applyDeskState extracted from restoreScheme,
│                  # restoreStep, undoDesk/redoDesk, syncUndo, keydown listener
├── report.js      # TRAIL_KINDS += 'undo'
└── tour.js        # drag note clause, STORE -> shoebox-general-notes-v8
index.html         # two Undo/Redo pairs (controls row, desk head)
docs/design-notes.md  # new section: "Undo is a stack of links, not the browser's history"
CLAUDE.md          # one paragraph under "Other subsystems"
```

**Structure decision**: The stack logic goes in its own DOM-free module, for
the reason `readings.js` and `permalink.js` are DOM-free: the Node harness then
asserts the real merge, limit and validation rules. Everything that touches
`params`, the console or the address stays in `main.js` beside the functions it
shares a body with (`restoreScheme`, `revert`, `updatePermalink`).

## Design notes for the implementer

- **Extract before adding.** Make `restoreScheme`'s in-place body into
  `applyDeskState(state, { solo, patchBay })` first, with no behaviour change,
  and only then call it from `restoreStep`. Two copies of "assign, sync, apply,
  reprice, settle, pump" is how solo handling drifted between surfaces before
  (see `schemeHash`'s comment).
- **`restoring` must wrap the whole restore**, including the `endGesture`
  inside it, or the restore records itself as a new step and wipes the redo
  branch.
- **`gestureKeys` is cleared in `beginGesture`**, not `endGesture`. `commit` can
  arrive with `done` after its gesture was already opened by an earlier
  non-final commit, so the set must collect across the whole gesture.
- **Seed at each settle point in research R2**, and nowhere else. An
  unseeded stack ignores `record`, which is what keeps a link's own station
  attach from becoming a step.
- **`attachClimate` runs `commit('sizingPeriods', ..., true)`.** During a link
  boot its `updatePermalink` is held by `linkAttachPending`, so it records
  nothing. During a picked station it is the one record for the whole climate
  change. Do not add a second.
- **Persist after `syncUndo`** on every change, through `keep(storage, stack)`.
  Before a climate reload, persist *after* moving the pointer.
- **Add to CLAUDE.md** the invariant that "every desk change must end in
  `updatePermalink`, or undo bundles it into the next step". Grep for
  `params[` / `bypass[` assignments outside a gesture as part of verification.

## Complexity Tracking

No constitution violations to justify.
