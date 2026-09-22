# Quickstart: validating slider parameter help notes

There is no test runner. Verification is throwaway Node harnesses under the
scratchpad, plus driving the page, per the constitution. Interfaces are in
[contracts/slider-notes.md](./contracts/slider-notes.md) and entities in
[data-model.md](./data-model.md); this file is the run guide.

No model change is made by this feature (research.md R5), so no IDF needs writing,
validating or running through EnergyPlus. Every gate below runs against the real,
DOM-free `src/controls.js`, `src/study.js` and `src/copy.js`.

## Prerequisites

```bash
npm install
```

`predev`/`prebuild` staging is not needed for these gates, nothing here touches
`public/energyplus`, the schema bundle or the station index. Gate 5 drives the real
page, so run `npm run dev` first for that gate only.

## Gate 1: every sweepable control has a note (SC-002, FR-007)

A harness imports `CHANNELS` from `src/controls.js` and `refusesSweep` from
`src/study.js`, iterates every control, and asserts:

1. Every control with `refusesSweep(control) === null` has a non-empty `control.note`.
2. The count of such controls is 87 (research.md R1); if it differs, the desk has
   gained or lost a control since this plan was written and the number in
   research.md needs updating alongside it.
3. Deliberately importing a patched copy of `controls.js` with one covered control's
   `note` deleted throws at import, naming that control's channel and key
   (contracts/slider-notes.md's load-time gate).

## Gate 2: every note stays inside its budget (FR-008's neighbour, research.md R4)

A harness imports `BUDGETS`/`withinBudget` from `src/copy.js` and every `note` string
off `CHANNELS`, and asserts:

1. `CONTROL_NOTE` exists in `BUDGETS` at 77 words.
2. Every existing and newly authored note is at or under it.
3. A harness-local string over budget, run through `withinBudget` directly, throws
   naming the control and the word count (the same shape every other budget already
   throws in).

## Gate 3: the chooser shows the note, once, never twice (US2, FR-002, FR-004, research.md R3)

A harness imports `axisOffers` from `src/main.js` against a built default `params`
snapshot (no browser needed, `axisOffers` takes `params`/`patching()` as plain
data) and asserts, over every returned offer:

1. Every offer for a covered, available control carries `note === control.note`.
2. Every refused offer (patched out, blocked, withdrawn, a side that cannot reach)
   keeps both its `reason` and its note, and no `reason` equals a control's note.
   (Revised 2026-09-21: no control declares `inert`, so the branch that made a row's reason equal its note was deleted from `axisOffers`, and the de-duplication guard with it. The explanation is now `faceless ? null : control.note ?? null`.)

## Gate 4: the note and the Model Console fold agree, word for word (FR-004)

A harness compares, for every covered control, the string `axisOffers` would show
(gate 3) against `control.note` read directly, they are the same field, so this
gate mainly guards against a future edit that starts formatting one of them (adding
a prefix, trimming trailing punctuation) without the other. Assert byte-identical
strings.

## Gate 5: driven on the page (US1, US2, SC-001, SC-003)

```bash
npm run dev
```

1. Open the Model Console. Pick three controls at random from the 45 newly noted
   ones (research.md R1 lists them). Confirm each row's `+ Note` fold opens by click,
   states a real explanation, and closes again without changing the control's value
   or reading.
2. Open the Design Space Survey (E-02) and its axis chooser. Confirm the same three
   controls now show a note line under their label, reading identically to what
   Console showed in step 1.
3. In the chooser, find a refused row (for example, a control of a channel that is
   patched out). Confirm its reason and its note, opened by the row's `+` marker, say different things.
4. Type a distinctive word from one of the 45 new notes into the chooser's filter
   field. Confirm the matching control's row survives the filter (data-model.md:
   the search text already folds `note` in).
5. At 390 px wide, with the browser's device toolbar set to no-hover/touch, repeat
   steps 1 and 2 by tap. Confirm nothing requires a hover to be reached.

## Done when

- Gates 1-4 pass as Node harnesses.
- Gate 5's five checks are confirmed by hand on the running page.
- `research.md`'s counts (87 / 42 / 45) match a fresh run of gate 1's harness, or
  have been updated to match the desk as it now stands.
