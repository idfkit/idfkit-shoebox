# Research: Undo and Redo on the Desk

Phase 0 for [plan.md](plan.md). Every question below was answered by reading the
code as it stands on `main`; line references are to `src/main.js` unless
another file is named, and will drift.

## R1. Where a step is recorded

**Decision**: Record in `updatePermalink`, after its `booted` /
`linkAttachPending` gate. That is the one place that already runs "wherever a
gesture ends". The recorder compares the desk's configuration hash (R3)
with the stack's present. Equal means nothing to record. Different means the
present moves onto the past and the new state becomes the present.

**Rationale**: Every configuration path already ends there:

- `commit(..., done)` → `endGesture` → `updatePermalink` covers every slider,
  margin field and console control, including `roomType`'s implied keys.
- `patchChannel`, `onSolo`, `revert`, `applyStandard` and `restoreScheme`'s
  in-place path all bracket with `beginGesture` / `endGesture`.
- A station or file attach ends in `attachClimate`'s
  `commit('sizingPeriods', sizing, true)` (about line 4736), which closes a
  gesture even when the value does not change.
- Reading-state calls (`setView`, `releaseZoom`, `reletterReading`, the study
  and survey calls) also reach `updatePermalink`. They leave the configuration
  hash unchanged, so they record nothing, with no special case needed
  (FR-013).

Drags never record mid-gesture, because `updatePermalink` is called only on
release (FR-002). The address already obeys the same rule.

**Alternatives considered**:

- *Capture in `beginGesture`*: this needs a matching end anyway, and it misses
  the station attach, whose gesture is opened inside `attachClimate`.
- *Hook every call site*: twelve sites, and the next feature would forget one.
  That is the failure `patchChannel`'s comment already describes.

## R2. Seeding: when the stack learns where the desk started

**Decision**: The recorder is unseeded at load and ignores `record` until
`seed(state)` is called. `seed` is called once the arrival has settled:

| Arrival | Seeded at |
|---|---|
| No fragment, or a fragment with no climate | Directly after `booted = true` and the first `applyGeometry()` (about line 7765) |
| Station link | End of `attachFromLink`, beside its closing `updatePermalink()` (about line 5533) |
| File link re-attached from this browser | When `attachRemembered()` succeeds in `openFileLink` |
| File link waiting for the reader's file | Not seeded. Undo stays disabled until the file attaches, then seeds there |
| Refused link | `refuseLink` seeds a fresh stack on the issued drawing (FR-015) |

**Rationale**: Without an explicit seed, the first state observed would be the
state *after* the reader's first gesture, so that gesture could never be undone.
Seeding at `booted` alone is also wrong for a climate link: the station attach
would become an undoable step back to Denver with the link's parameters, which
is a desk nobody sent.

A reader who moves a control while a station link is still being fetched is
already treated by `attachFromLink` as outranking the link. The seed captures
the desk as it then stands, so that early move is part of the starting point
and not a step. This is accepted: the window is seconds long, and the link path
already treats it the same way.

## R3. What a step holds

**Decision**: A step is `{ hash, solo, patchBay }`, frozen.

- `hash` is the **configuration hash**: `encodeState` with `params`,
  `bypass: patching()`, `station` and `file`, and with `view`, `pin`,
  `quantity`, `studies` and `survey` all left out. It is a new one-line builder
  beside `schemeHash`, sharing its arguments, so the two cannot drift.
- `solo` is the soloed channel id or `null`.
- `patchBay` is the raw `bypass` map, kept only when `solo` is set (otherwise
  `null`, because the hash already is the patch bay).

**Rationale**: The hash is the address's own grammar, so a step is a link and
is restored by `decodeState`, refusals and migrations included (FR-006). The
reading state is excluded because the spec keeps it out of undo, and
`schemeHash` carries studies and the survey too, which are not part of the
desk.

Solo is the one thing the address cannot give back. `schemeHash` encodes
`patching()`, which bakes solo into the patch bay. `restoreScheme` therefore
sets `solo = null`, and the building comes back identical but the console's
solo light does not. That is acceptable for a shared link, but not for undo:
un-soloing after an undo would leave every other channel patched out. So the
step carries the console's own state beside the hash.

**Guard (no silent fallback)**: on restore, `patching()` computed from
`{ patchBay, solo }` must equal the decoded hash's `bypass`. If it does not,
the step is refused with a stated reason and the stack is left as it was. It
never half-applies.

**Alternatives considered**:

- *Store the whole `params` object*: this duplicates the codec and loses
  `LINK_VERSION` migration across a reload into a newer build.
- *Diffs*: these are smaller, but they need an inverse for every multi-key
  action (Revert all, standards). A link is already a delta against defaults
  and is a few hundred bytes.

## R4. Restoring a step

**Decision**: There are two paths, chosen by `sameClimate`, the same split
`restoreScheme` makes.

- **Same climate (in place)**: a new `restoreStep(step)` with `restoreScheme`'s
  in-place body: `beginGesture`, assign `params` and `bypass` from the decoded
  hash, set `solo` and `patchBay` from the step, sync the sliders and the desk,
  then `applyGeometry`, `reprice`, `endGesture`, `desk.settle`, and `pump` if
  auto is on. A `restoring` flag makes `updatePermalink` move the address
  without recording. `endGesture` already refreshes studies and the survey, so
  completed results and the sample cache stand (FR-008).
- **Other climate (through the link)**: persist the stack with the pointer
  already moved, write the address as the step's hash plus the current reading
  state (view, quantity, studies, survey; the pin is left to `resolvePin`),
  then call `location.reload()`, as `restoreScheme` does. The status line says
  which errand the reload is on, using `restoreScheme`'s two sentences adapted
  for undo. After the reload, R2's seed finds the stored present equal to the
  arrived configuration and adopts the stack (R6).

**Rationale**: One restore path per kind, and both already exist and are
proven. The refactor extracts `restoreScheme`'s in-place body into a shared
`applyDeskState(state, { solo, patchBay })` called by both, so a later fix to
one is a fix to both.

`revert` stays separate: its two-scope behaviour (`keys`) is its own.

## R5. Merging repeated nudges

**Decision**: `beginGesture` resets a `gestureKeys` set, and `commit` adds its
`key` to it. At record time, the gesture's key is the set's sole member, or
`null` if it holds zero or several keys. The recorder merges the new state into
the present, without pushing, when all of these hold:

- the key is non-null;
- it equals the key that produced the present;
- less than `MERGE_WINDOW` (1,000 ms) has passed since that step;
- no undo or redo has happened since.

`patchChannel`, `onSolo`, `revert`, `applyStandard`, restores and climate
attaches reach `record` with a null key, so they never merge (FR-004).

**Rationale**: Ten arrow-key nudges are ten commits with `done`, so ten
gestures. The trail already coalesces by key (`Trail.push`, `COALESCE_WITHIN`).
This is the same idea with a time window, because the undo stack must not
merge a nudge made a minute later.

The clock is injected, so the Node harness asserts the rule without waiting.
The window affects only how many steps an undo takes, never what any step
restores.

## R6. Persistence across a reload

**Decision**: `sessionStorage` under `shoebox-undo-v1`, written on every
change to the stack. Access goes through a probe-and-wrap like
`rememberedStorage` in `weather.js` (private modes hand out a store that
throws on `setItem`). Payload:

```json
{ "linkVersion": "v1", "past": [Step...], "present": Step, "future": [Step...] }
```

At seed, the stored stack is adopted only if all of these hold:

- the payload parses;
- `linkVersion` names a version `decodeState` accepts;
- every step's `hash` decodes;
- its `present` equals the seeded state (hash and solo).

Anything else discards it whole and starts empty (FR-014). The stored
`present` carries no `at` time, so after a reload nothing merges into it.

**Rationale**: `sessionStorage` is per tab and survives a reload, which is what
the spec asks for. It is copied into a *duplicated* tab, and the two copies
then diverge. Nothing is shared, which meets "never shared between tabs".
`localStorage` would leak one tab's undo into another.

Decoding every step at adoption means a stack written by an older build is
either migrated by `MIGRATIONS` (an older link version) or discarded before
Undo is enabled. It is never discovered broken on the fifth press.

When storage is unavailable, the stack lives in memory only, with no message
(spec Edge Cases). This is not a fallback in Principle IV's sense: nothing the
reader asked for is substituted. The reload simply starts a new record.

**Size**: 100 steps of a few hundred bytes each comes to about 30–60 KB as
UTF-16, well inside the 5 MB per-origin quota.

## R7. Keyboard shortcuts

**Decision**: One `keydown` listener on `document`, which does the following:

- **Ignores the press** when any of these hold:
  - `event.defaultPrevented`;
  - the target is a text-editable element: `isContentEditable`, a `textarea`,
    or an `input` whose type is not one of `range`, `checkbox`, `radio` or
    `button` (the margin fields from `field.js` are text inputs, and the
    station search is too);
  - a gesture is open (`gesture === true`), so a key pressed while a drag is
    held does nothing.
- **Undoes** on `Mod+Z`.
- **Redoes** on `Mod+Shift+Z`, and also on `Ctrl+Y` when the platform is not
  Mac. `Mod` is `metaKey` on Mac (`navigator.platform` / `userAgentData`) and
  `ctrlKey` elsewhere.
- Calls `preventDefault` only when it acts.

**Rationale**: A range input has no native text undo, so Ctrl+Z on a focused
slider should undo the desk. The platform test touches lettering of the
shortcut and key handling only, never the document, so Principle II's ban on
feature detection reaching the IDF is not engaged.

## R8. Where the buttons go

**Decision**: There are two pairs, both driven by one `syncUndo()`:

- in the `.controls` row beside Run and Auto-solve, which is always on the
  sheet;
- in the desk head beside Revert all, because the most valuable undo is undoing
  Revert all, and at the index layout the open desk covers the sheet.

They are `button.link`, the page's existing pattern, using `disabled` when the
action has nothing to do. Undo and Redo are always present, so the reader learns
where they are; this differs from Clear studies, which is absent when empty.
The accessible names are fixed ("Undo the last change", "Redo the change just
undone"). The visible words are "Undo" and "Redo", with the shortcut lettered
in the button's own text for wider layouts and never only in a `title`
(Principle VII).

**Rationale**: Naming the step ("Undo Width 12.00 m") was considered. A
lettered value in a label is a reading that needs re-lettering on a units
switch (the `studySweeps` trap in CLAUDE.md). The fixed names avoid the
problem, and the trail already records what moved.

## R9. Report trail and onboarding

**Decision**:

- `TRAIL_KINDS` in `src/report.js` gains `'undo'`. Undo and redo push
  `'Undid the last change'` / `'Redid a change'`, unkeyed so they are never
  coalesced (FR-017).
- The `drag` note in `src/tour.js` gains one clause in its body: "Undo, or
  Ctrl+Z (⌘Z), puts it back." `STORE` is bumped to
  `shoebox-general-notes-v8` (FR-018). No new note: undo is a property of
  every move, not a step to fill in.

## R10. Refused or failing steps

**Decision**:

- A step whose hash no longer decodes at press time cannot happen after R6's
  check at adoption, and in-session steps are written by this build. If it
  happens anyway, `decodeState` throws, the status line states it, and the
  stack is not moved.
- A different-climate step whose station cannot be fetched goes through
  `refuseLink` after the reload, which re-seeds an empty stack (FR-015). The
  reader is told why in the existing sentence.

## Open items

None. Everything the Technical Context marked unknown is resolved above.
