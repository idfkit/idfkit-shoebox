---

description: "Task list for Trim the App's Copy"
---

# Tasks: Trim the App's Copy

**Input**: Design documents from `/specs/008-trim-app-copy/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: no test tasks are generated; the spec does not ask for them and the repository has no test runner. Verification follows the constitution's workflow gates instead: throwaway Node harnesses in a scratch directory outside the repository, and driving the page. Those steps appear as verification tasks at the end of each phase.

**Organization**: tasks are grouped by user story so each can be implemented and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1 to US4)
- Line numbers are from commit `e4b5a77` and drift as edits land; find the named function or string when they do not match.

## Standing rules for every task

- **Move the long form verbatim** (research D2). Only glances, summaries, ledes, refusals and the duplicates in research D8 are rewritten. Never paraphrase text on its way into a fold.
- **Nothing that is a reading goes in a fold**: figures, units, labels, verdicts, em dashes and their absence reasons, blocking reasons, refusals and remedies ([contracts/fold.md](./contracts/fold.md)).
- **New copy is written to the house voice**: load the `editorial` skill before writing glances. No verdict words the sheet cannot back, no new claims, and no em dashes in any markdown.
- **No change reaches `src/model.js`, `src/permalink.js` or any applier.**

---

## Phase 1: Setup (baseline and tools)

**Purpose**: take the "before" measurements while the tree is still unchanged, and add the one inert module everything else needs.

- [X] T001 Copy `specs/007-upgrade-idfkit-js/verify/build-positions.mjs` into the session scratch directory and run it against the unchanged tree, saving the eight IDFs as `before/` in scratch (quickstart step 1). Do not commit anything from scratch.
- [X] T002 Create `src/copy.js` per [contracts/budget.md](./contracts/budget.md): a frozen `Budget` class `{ id, words, scope, asserted }`, the frozen `BUDGETS` roster with the nine entries and numbers from research D5, `words(text)` (strip `<...>` tags, split on whitespace, count non-empty tokens), and `withinBudget(budget, where, text)`, which returns `text` or throws `Error(\`${where}: ${n} words, over the ${budget.words}-word ${budget.id} budget (${budget.scope})\`)`. DOM-free, no imports. Comment in the house style (why, not what). Nothing imports it yet.
- [X] T003 Write the measurement snippet described in [contracts/measure.md](./contracts/measure.md) as a scratch file (`measure.js`) that runs in the page's devtools console, does `const { words } = await import('/src/copy.js')`, walks visible prose by the contract's three rules, and prints, per scope (sheet, console), the total and the five wordiest blocks.
- [X] T004 Run `npm run dev`, and at the four positions × two window sizes (1440 × 900, 390 × 844) in [contracts/measure.md](./contracts/measure.md), run the T003 snippet and save the results as `before.md` in scratch.
- [X] T005 At the same four positions, write `before-inventory.md` in scratch: every reading, figure, verdict, em dash with its reason, and blocking reason visible without opening anything. This is the checklist SC-004 is judged against.

**Checkpoint**: baseline IDFs, word counts and inventory are saved; `src/copy.js` exists and is imported by nothing.

---

## Phase 2: Foundational (the fold)

**Purpose**: the one disclosure pattern every story uses. No story can put text in a fold until this phase is done.

**⚠️ CRITICAL**: workflow gate 8 applies; T006 comes before any fold is wired.

- [X] T006 Run `/interface-design:init` for the fold pattern, then add a "The fold" subsection under Component patterns in `.interface-design/system.md`: native `<details class="fold">`, `+` closed and `-` open, summary at most 6 words naming what the fold holds, stable `data-fold` key, open state kept for the session only, and the list of what must never be folded. Add beside it a short "Copy budgets" rule stating the nine budgets and that a declared always-visible string over budget refuses at load.
- [X] T007 In `index.html`, replace the `.register #score td .why-fold` rule set (about lines 1529-1572) with one `.fold` rule set that works in any host: same marker, `--ink-ghost` summary at 10.5px sans, `--ink-2` on hover, `--rule-focus` outline on `:focus-visible`, no webkit marker, `width: fit-content` summary. Keep the comment's argument (a press is not a hover) and move it onto `.fold`. If `.fold` sets `display`, add a `.fold[hidden]` twin (CLAUDE.md, "`all: unset` defeats the `hidden` attribute").
- [X] T008 In `src/console.js`, add and export `fold(key, summary, { label } = {}, ...children)` beside `el()` (about line 53): builds `details.fold[data-fold=key]` with `summary` first (setting `aria-label` when `label` is given), appends the children, opens it if `key` is in a module-level `openFolds` `Set`, and on `toggle` adds or removes the key. Comment why the set is in memory only (research D6, spec FR-007).
- [X] T009 In `src/main.js`, import `fold` from `./console.js` and rebuild the existing `elem('details','why-fold')` construction in `renderScore` (about lines 5454-5463) on it, keyed `target:${target.id}:why`, summary text unchanged (`tm59Precis()`). Drive the page: the TM59 derivation fold looks and behaves as before, and stays open through a slider drag.

**Checkpoint**: one fold pattern exists, documented, styled, and proven on the scoreboard.

---

## Phase 3: User Story 1 - Read the sheet at a glance (Priority: P1) 🎯 MVP

**Goal**: the sheet shows the drawing, the figures and at most one short line of context per block; everything else is one tap away.

**Independent Test**: fresh load at 1440 × 900 and 390 × 844, default desk, first run landed: sheet prose is 600 words or fewer, no block over 40 words, and every item in `before-inventory.md` is still visible.

- [X] T010 [P] [US1] In `index.html`, cut the page lede (`p.lede`, about lines 4183-4190) to 25 words or fewer in view and put the rest in `<details class="fold" data-fold="lede:page"><summary>About this page</summary>...</details>` directly under it, verbatim.
- [X] T011 [P] [US1] In `index.html`, cut the scoreboard's register lede (about line 4404) to one Chase sentence of 20 words or fewer, still saying what pressing Chase does (research D7), and the other two register ledes (about lines 4415 and 4431) to 25 words or fewer each, folding each remainder verbatim under its paragraph with keys `lede:score`, `lede:standards`, `lede:shelf`.
- [X] T012 [P] [US1] In `index.html`, cut the default figure caption (`#fig-cap`, about lines 4338-4344) to 25 words or fewer. In `src/main.js`, apply the same limit to each caption the finding swaps in (about lines 6418-6424).
- [X] T013 [US1] In `src/main.js` `renderScore` (about line 5440), move each `Target.note` rendered as `i.why` into `fold(\`target:${target.id}\`, 'Method', { label: \`Method for ${target.label}\` }, note)`. For the TM59 notes the regex at about line 5122 keeps inline: a qualifying note of 25 words or fewer stays in view as the row's one sentence; a longer one joins the fold.
- [X] T014 [US1] In `src/main.js`, cut `scoreNote()` and its `OFFERS` sentences (about lines 5524 and 5609) to 25 words or fewer each, keeping what would fix the absence.
- [X] T015 [US1] In `src/tm59.js`, export `qualificationsSummary()`, returning a summary of 6 words or fewer whose number is read off `QUALIFICATIONS.filter(q => q.standing).length`, spelled as a word (for example "Four reasons this is not TM59"). In `src/main.js` `tm59QualificationRow()` (about lines 5342-5362), drop the fixed `p.score-count` intro (about lines 5348-5351) and wrap the unchanged `dl.qualifications` in `fold('tm59:qualifications', qualificationsSummary())`. Keep the at-least-four assertion in `src/tm59.js` (about lines 707-720) untouched.
- [X] T016 [US1] In `src/main.js` `tm59CountRow()` (about lines 5275-5323): delete the closing "This is a count of lines ... no worst room to find" sentence (about lines 5316-5320), which duplicates the `one-zone` and `procedure` qualifications (research D8); move the criterion c and d sentence (about lines 5309-5315) verbatim into `fold('tm59:cd', 'Criteria c and d')` under the count. The unread-criterion sentences (about line 5306) stay in view.
- [X] T017 [US1] In `src/main.js` `renderChase()` (about lines 5770-5778), keep only "A count of lines, not a result against the method." and delete the clause pointing at the block below (research D8). Update the comment at about lines 5760-5769 to say why the first clause survives.
- [X] T018 [P] [US1] In `src/describe.js`, change `MOVES` from 3 to 2 (about line 660) and update the comment beside it to record why (spec FR-014, research D9).
- [X] T019 [US1] In `src/main.js`, split the finding tail (the four branches at about lines 6448-6498): the reading sentence stays in the paragraph; each explanatory tail ("Demand intensities need a run period to read over ...", and its siblings) moves verbatim into `fold('finding:why', 'Why this reading')` appended after the paragraph. Keep `.finding:empty` behaviour: the fold must not stand alone when the paragraph is empty.
- [X] T020 [US1] In `src/main.js`, cut the bill lede (about lines 1539-1547, including the priced clause) to 25 words or fewer in view, fold the rest as `bill:lede` with summary "About these figures", and move the rate citations (about lines 1792 and 1818) into `fold('bill:sources', 'Sources')`. The absences line stays in view.
- [X] T021 [US1] Across `src/schemes.js`, `src/tm59.js` and `src/main.js`, find every absence reason shown beside an em dash (grep `absence`, `targetAbsence`, `new Reading(`) and cut each to 12 words or fewer, keeping what would fix it (Principle IV). Do not move any of them into a fold.
- [X] T022 [US1] In `src/main.js`, cut the status and refusal lines (about lines 1960, 2175, 3598, 3884, 4649, and the refused-link sentences) to one sentence of 15 words or fewer each, keeping the remedy. Cut the released-pin note (about line 2953) and the when-bar hint (about line 3146) to 25 words or fewer.
- [X] T023 [US1] Verify US1: rerun the T003 snippet at the four positions and both sizes; sheet scope 600 words or fewer on the default first visit, no block over 40, description plus finding 60 or fewer (if over, lower `MOVE_WORDS` in `src/describe.js` per research D9 and remeasure); check every line of `before-inventory.md` is still visible; time a reader-style check that heating demand and the Passivhaus verdict are findable within 10 seconds (SC-006).

**Checkpoint**: the sheet is at a glance; the console is untouched and still verbose.

---

## Phase 4: User Story 2 - Work the console without reading it (Priority: P1)

**Goal**: each strip reads as name, one line, controls, meter and any blocking reason; every explanation is one tap away on the thing it explains.

**Independent Test**: desk open at 1440 × 900, walk all 18 strips: console prose 400 words or fewer, each strip line 12 words or fewer, each removed note reachable on its own control; at 390 × 844 the folded index still shows readings and blocking reasons.

- [X] T024 [US2] In `src/controls.js`, add a required `line` to the `Channel` constructor (about lines 1736-1745) that throws when missing, following the constructor's existing validation. Then, for each of the 18 channels, move the first sentence of `blurb` into `line` and delete it from `blurb`; for `shading` and `air`, whose first sentences are 25 and 39 words (research D3), write a new `line` of 12 words or fewer and leave their blurbs whole.
- [X] T025 [US2] In `src/controls.js`, give the Air channel's `requires` a frozen `reasons` object of declared sentences, one per way it can be blocked, each 15 words or fewer; rewrite the function-valued `reason` (about line 3784) to return one of those constants by identity instead of composing text. Cut the other seven string `requires.reason` values and every string `Side.unreached` to 15 words or fewer. Leave function-valued `unreached` returning declared constants too if any compose text.
- [X] T026 [US2] In `src/console.js`, where a strip is built (about lines 261-281): render `p.strip-line` with `channel.line` as the first child inside `div.strip-fold`, then `fold(\`strip:${id}\`, 'About this channel', {}, p.strip-blurb)` in place of the bare blurb. `p.strip-blocked` stays outside the fold, as now.
- [X] T027 [US2] In `src/console.js`, move the readout note (about line 2031) and meter note (about line 2057) into `fold(\`meter:${id}\`, 'How this is read', { label: \`How ${meter.label} is read\` }, note)`. The meter label and reading stay in view.
- [X] T028 [US2] In `src/console.js`, at each static control-note site (`p.ctl-note` at about lines 502, 575, 691, 840, 1042, 1104, 1296, 1444, 1545), wrap the note in `fold(\`ctl:${control.key}\`, 'Note', { label: \`Note on ${control.label}\` }, note)`. For the dynamic notes (about lines 1442, 1539, 1542, including `.ctl-note.out`): if one says why a control is inert or blocked, it is a standing message, so keep it in view at 15 words or fewer; otherwise fold it the same way.
- [X] T029 [US2] In `src/console.js`, cut the balance rail's sign-convention text (about line 2499) from 36 to 25 words or fewer, still stating in words which direction is positive (research D7). Cut each "Unclosed by ..." sentence (about lines 2601-2623) to 25 words or fewer and fold any remainder as `rail:unclosed`.
- [X] T030 [US2] In `src/console.js`, cut the study card's "Opened here:" line (about line 1827) to 15 words or fewer.
- [X] T031 [P] [US2] In `index.html`, cut the desk subtitle (`desk-sub`, about lines 4645-4650) to 25 words or fewer, keeping "Eighteen channels in the order the physics happens."; cut `presets-note` (about lines 4666-4669) and `desk-widen` (about lines 4672-4675) to 25 words or fewer.
- [X] T032 [P] [US2] In `index.html`, add `.strip-line` styling beside `.strip-blurb` (about line 2672), and make sure a `.fold` inside a control row does not break the control grid in the 330 px console or push a slider off its row. Check that `.strip-fold[hidden]` (about line 2628) still hides the line and every fold inside it.
- [X] T033 [US2] Verify US2: desk open at 1440 × 900, run the T003 snippet on the console scope (400 words or fewer, no block over 40); walk every strip and confirm each note is on its own control's fold; drag a slider with a control note open and confirm it stays open through the solves; at 390 × 844 confirm folded strip rows still show reading, patch marker and blocking note, and that Tab skips folds inside a folded strip.

**Checkpoint**: US1 and US2 together meet SC-001 to SC-005.

---

## Phase 5: User Story 3 - First-visit guidance that gets out of the way (Priority: P2)

**Goal**: each general note is one instruction of 15 words or fewer; the fuller text is behind its own fold.

**Independent Test**: clear `localStorage`, load the page: the v4 key is in use, each note shows a single short instruction, opening a note shows its body, and markers still fill only on the genuine events.

- [X] T034 [US3] In `src/tour.js`, add a required `step` to `class Note` (about lines 46-58) that throws when missing, and write a `step` of 15 words or fewer for each of the 7 notes in `NOTES` (about lines 64-157), in the imperative. From the `desk` note's `body` (about line 99), delete "Eighteen channels in the order the physics happens." since the desk subtitle keeps it (research D8). Leave the other bodies verbatim.
- [X] T035 [US3] In `src/tour.js`'s render (about lines 273-295), show `.note-title` and the `step` in view, and put `.note-body` inside `<details class="fold" data-fold="note:${id}"><summary>More</summary>...</details>`. Stop the summary's click from also staging the note's scene, and make sure opening a fold never fills a marker. Cut the `.notes-lede` (about lines 273-277) to 15 words or fewer.
- [X] T036 [US3] In `src/tour.js`, bump `STORE` from `shoebox-general-notes-v3` to `shoebox-general-notes-v4` (about line 32) and add a line to the bump log in the comment above it (about lines 19-31) saying the steps changed wording.
- [X] T037 [US3] Verify US3 per quickstart step 7: clear storage, load, confirm v4, confirm each step's word count, open each fold, then trigger each genuine event (solve, drag, station, desk, patch, link) and confirm its marker fills, and that clicking a note (not its fold) still stages its scene.

**Checkpoint**: onboarding reads at a glance; no marker is filled by anything but its event.

---

## Phase 6: User Story 4 - Keep it short afterwards (Priority: P3)

**Goal**: an over-budget always-visible declaration stops the page at load, naming itself.

**Independent Test**: quickstart step 2: lengthen one declared string per budget and each import throws with the contract's message.

- [X] T038 [US4] In `src/controls.js`, import `BUDGETS` and `withinBudget` from `./copy.js` and add `assertCopy`, following `assertHideable` (about lines 3066-3077): for every channel, assert `line` against `STRIP_LINE`, a string `requires.reason` and every `requires.reasons` value against `STANDING`, and every string `Side.unreached` against `STANDING`; name each as `channel ${id} line`, `channel ${id} reason`, `${key} ${side} unreached`. Call it at the foot beside `assertHideable()` (about line 4646).
- [X] T039 [P] [US4] In `src/tour.js`, beside the load-time asserts (about lines 164-173), assert every `Note.step` and the notes lede against `STEP`.
- [X] T040 [P] [US4] In `src/tm59.js`, inside the assertion block (about lines 707-720), assert `qualificationsSummary()` against `SUMMARY`.
- [X] T041 [US4] In `src/console.js` and `src/main.js`, declare each fixed fold summary ('Method', 'Note', 'About this channel', 'How this is read', 'Criteria c and d', 'Why this reading', 'Sources', 'About these figures', 'About this page') as a named constant beside the code that uses it and assert each against `SUMMARY` at module load.
- [X] T042 [US4] Verify US4 per quickstart steps 2 and 3 in a scratch Node script: all four modules import cleanly; lengthening one string per asserted budget throws the contract's message naming it (revert each edit); and the Air `requires.reason` function returns one of `requires.reasons` by identity at each position that blocks it (Fabric bypassed, one exterior surface, adaptive venting with Gains out).

**Checkpoint**: the budgets bite; every story's result is protected.

---

## Phase 7: Polish & cross-cutting concerns

- [X] T043 [P] Update `CLAUDE.md`: in "What 'Chase' means is printed above the board", the TM59 qualifications passage ("The qualifications block is the deliverable") and the balance rail's "The sign is stated in words" passage, say that an in-view summary plus an in-place fold meets "in place" (research D7); correct the stale storage key `shoebox-general-notes-v2` in "The general notes" to `-v4`; add a short "Copy budgets and folds" paragraph under Conventions pointing at `src/copy.js` and the fold pattern.
- [X] T044 [P] Update `.interface-design/system.md` "Qualifying a reading in place" (about lines 642-671) so it describes the qualifications `dl` inside a fold whose summary states the count, and remove any remaining reference to `.why-fold` from the stylesheet and the docs (grep `why-fold` across `index.html`, `src/`, `CLAUDE.md`, `.interface-design/`).
- [X] T045 Rerun the build-positions harness on the finished branch into `after/` in scratch and byte-compare with `before/` (quickstart step 1, SC-008). Load a handful of existing permalinks, including one carrying a station and one carrying `at=`, and confirm each decodes to the same desk.
- [X] T046 Run quickstart steps 6 and 8 end to end: fold behaviour (open through solves, reload closes all, screen reader names, address bar unchanged by opening folds) and phone layouts at 390 × 844 and 844 × 390 (no fold summary wraps; check that a 12-word strip line sets on one line, and if it does not, lower `STRIP_LINE` in `src/copy.js` and in the table in [contracts/budget.md](./contracts/budget.md) together).
- [X] T047 Take the final `after.md` measurement at all positions and write the pull request description: a before/after word-count table per scope, the duplicates cut (research D8) and any other duplicate found during the rewrite, and the list of new glance copy for review against the text each summarises.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001, T004 and T005 must run on the unchanged tree, before any other edit. T002 precedes T003 and T004.
- **Foundational (Phase 2)**: depends on Setup. T006 → T007 → T008 → T009. Blocks every story.
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Phase 2 and touch mostly different files (`main.js`, `tm59.js`, `describe.js`, sheet parts of `index.html` against `controls.js`, `console.js`, console parts of `index.html`). They can run in parallel by two workers who coordinate their `index.html` edits.
- **US3 (Phase 5)**: depends on Phase 2 (the `.fold` CSS). Independent of US1 and US2; its only cross-reference is the desk subtitle sentence in T031.
- **US4 (Phase 6)**: depends on the stories whose strings it asserts: T038 on T024 and T025, T039 on T034 and T035, T040 on T015, T041 on T013 to T030. Assertions switched on before the strings fit would stop the page loading.
- **Polish (Phase 7)**: after all stories.

### Within stories

- US1: T013 before T014 (same function area); T015 before T016; T019 after T018 so the measured paragraph reflects two moves.
- US2: T024 before T026; T025 before T038; T026 and T027 before T032's layout check.
- US3: T034 → T035 → T036.

## Parallel Examples

### Phase 3 (US1)

```text
T010 [P] page lede in index.html
T011 [P] register ledes in index.html     (same file as T010: one worker, or sequence them)
T018 [P] MOVES 3 -> 2 in src/describe.js
T015     qualifications summary in src/tm59.js, alongside main.js work in T013/T014
```

### Phase 4 (US2)

```text
T024 channel lines in src/controls.js
T031 [P] desk subtitle and notes in index.html
T032 [P] strip-line CSS in index.html     (after T031 in the same file)
```

### Across stories, once Phase 2 is done

```text
Worker A: US1 (src/main.js, src/tm59.js, src/describe.js, index.html sheet ledes)
Worker B: US2 (src/controls.js, src/console.js, index.html console parts)
Worker C: US3 (src/tour.js)
```

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 (baseline), Phase 2 (the fold).
2. Phase 3: the sheet at a glance.
3. **Stop and validate**: T023. The first screen, which is the user's complaint in its plainest form, is fixed; the console is still verbose but works exactly as before.

### Incremental delivery

1. Setup plus Foundational → the fold exists.
2. US1 → the sheet reads at a glance (MVP).
3. US2 → the console reads at a glance; SC-002 met.
4. US3 → onboarding trimmed; storage key bumped.
5. US4 → budgets enforced at load; nothing grows back.
6. Polish → docs, byte identity, phone pass, PR write-up.

Per the stacked-PR convention, if US1 ships as its own pull request, US2 onward follow as pull requests stacked on it rather than as more commits on the first.
