---

description: "Task list for console findability"
---

# Tasks: Console findability

**Input**: Design documents from `specs/005-console-findability/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This repository has no test runner and no linter. The constitution's
workflow section names throwaway Node harnesses plus driving the page as the
verification, and gates 5, 6, 7 and 8 apply to this change. The harness tasks
below are therefore *required by the constitution*, not the optional TDD tasks
the template contemplates. They are not written first: `src/finder.js` cannot be
asserted against before it exists. They are written immediately after, and no
story is complete without its own.

**Organization**: by user story, in the spec's priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1, US2, US3 — maps to the spec's user stories
- Every task names the file it touches

## Path conventions

One flat `src/` of ES modules at the repository root, no framework, no build step
beyond Vite. All CSS is inline in `index.html`. There is no `tests/` directory
and this feature does not create one; harnesses are throwaway scripts under a
scratch directory, per the constitution.

**Line numbers cited below are `main`'s.** This lands on the stack tip, where
they will have moved. They identify code, not addresses.

---

## Phase 1: Setup

**Purpose**: land on the right tree, and capture the baseline that two success
criteria are measured against, before anything changes.

- [ ] T001 Branch from `004-choose-sweep-metric`, not from `main` (research D11). Relative to `main` the open stack changes `src/console.js` by +449 lines, `src/main.js` by +1,452 and `index.html` by +479, in the same regions this feature restructures. If PRs #46 and #47 have landed, branch from `main` instead and say so in the branch's first commit.
- [ ] T002 Run `npm install` then `npm run dev` once, so `predev` stages the engine, schemas and station index into `public/` (a fresh clone will not load the page otherwise).
- [ ] T003 Capture the SC-005 / SC-006 baseline against the console **as it stands today**, before any code changes: median time from page load to first parameter changed, and first-attempt success at locating a named parameter. The spec's Assumptions require this baseline be taken before implementation begins; once the grid lands it is unrecoverable.
- [ ] T004 [P] Re-count the declaration on the implementation branch and record the figure in `specs/005-console-findability/research.md` beside the D11 table: import `src/controls.js` in Node and print `CHANNELS.length`, the control count and `ALL_KEYS.length`. Expect 18 / 129 / 144 on the stack tip. FR-020 and SC-003 are written against the count the declaration actually owns, so this number is the one the harness asserts.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the layout substrate. Every user story sits on the grid, and the
peek is unaffordable without it.

**CRITICAL**: no user story work can begin until this phase is complete. The one
measurement that decides this feature is here: a multi-column relayout of these
eighteen strips is 97 ms median and 145 ms p95 (research M2), which is six to
nine frames. The same content as a grid is 7.2 ms and opening one card is 2.2 ms
(M5). Everything the spec asks for downstream is comfortable at the second number
and impossible at the first.

- [ ] T005 Replace `.strip-grid`'s `column-width` / `column-count` with `display: grid` in `index.html`'s inline stylesheet (research D1). Multicol has no addressable cell, so "this card expands and its neighbours give way" has nothing to attach to; it also reads column-major, where channels numbered 01 to 18 must read row-major (FR-002).
- [ ] T006 Set the grid to three columns and widen `--desk` from 436 px in `index.html` (research D2, M4). Three is the fewest that puts all eighteen closed cards inside the 473 px scroller (406 px against 473); two misses by 107 px and no extra width rescues it, because height is set by the row count, not the column width. Four fits at 348 px but gives a 109 px card, narrower than several channel names.
- [ ] T007 Restructure `buildStrip` in `src/console.js` so a channel renders as an addressable grid cell rather than a `.strip` section, keeping the element the rest of the module already looks up by channel id.
- [ ] T008 Ungate the closed card face at every width in `index.html`: `.strip-read`, `.strip-mark` and `.strip-chev` are `display: none` by default and shown only under `.strips.index` (`index.html:2471, 3239-3285`). A card must letter its number, name, blurb, reading and patch marker closed. FR-001, FR-003, SC-001.
- [ ] T009 Keep the blocked-channel sentence **outside** the fold on a card, as `.strip-blocked` already does for the folded index row (`src/console.js:252`). A channel you cannot patch in has to say so on the card, not one gesture further in. FR-003.
- [ ] T010 Bound an opened card's body and give it its own scroll in `index.html` and `src/console.js` (research D5). Air opened is 1,419 px against a 473 px scroller. Unbounded, a *peek* passing over Air pushes every later card three screens down and snaps them back as the pointer leaves. FR-010, FR-011.
- [ ] T011 Give every new class that sets `display` and is toggled by the `hidden` attribute its own `.class[hidden] { display: none }` rule in `index.html` (research D6). `all: unset` and any author `display` declaration beat the user agent's `[hidden]` rule outright; the stylesheet already carries fifteen such twins (`index.html:534, 708, 863, 1028, 1189, 1480, 1928, 2472, 2529, 2716, 3090, 3108, 3174, 3182, 3224`) because of the defect that left `#studies-stop` rendered at all times.
- [ ] T012 Confirm `#desk .patch` still resolves with **no card revealed**, in `src/console.js` (contract: `notes.md`, research D9). This is the general notes' only structural dependency on strip markup, and `stage()` does `if (!el) return;` (`src/tour.js:172-173`), so a grid that drew patch markers only inside opened cards would break the onboarding with no error, no log and no circled subject.
- [ ] T013 Confirm every study anchor survives the restructure in `src/console.js`: `setStudy` throws when no row is registered for a key (`console.js:1998`), 85 controls register into `rows`, and a `Facade` registers four per-wall anchors (`console.js:808`) so four cards can stand under one plan key. Confirm `studyCount()` still reads `cards.size` rather than the caller's `studies` map (`main.js:5962`), so a sweep with a card up but no curve yet is still counted.
- [ ] T014 Confirm `shapeKey` (`src/main.js:2078`) and `restShapeKey` (`src/main.js:2092`) are untouched. A card's state is not part of the desk's shape: a revealed card must not stale a study, and a study must not be re-swept because somebody opened a card. Same rule that keeps `pinnedHour` off `params`.
- [ ] T015 [P] Correct `.interface-design/system.md:578-587`, which documents the multicolumn mechanism as a settled pattern. Workflow gate 8 requires the design system to be corrected in the same change that replaces what it describes; left alone it is wrong twice over.

**Checkpoint**: the grid is in place, a closed card reads, and the invariants that
fail quietly have been checked. User story work can begin.

---

## Phase 3: User Story 1 - Arrive at something you can take in (Priority: P1) 🎯 MVP

**Goal**: eighteen cards in view at once, each naming its channel and stating its
state; reveal one to work it; what you leave revealed stays revealed. A fine
pointer peeks.

**Independent Test**: load the page cold at each of the three sizes and confirm
all eighteen channels can be named and their state read with no scrolling and
nothing revealed; reveal two cards, confirm both stay revealed and every reading
legible before is legible still.

**Note on independence**: US2 and US3 are built on this story's reveal, and the
spec says so outright. US1 stands alone; the other two do not stand without it.

- [ ] T016 [US1] Add the three-state card model to `src/console.js` per [data-model.md](./data-model.md): `closed` / `peeking` / `revealed`, held per channel, with the transition table implemented as written. That table is the whole of FR-004 through FR-007.
- [ ] T017 [US1] Reveal and close a card on click, tap, Enter and Space in `src/console.js`. This is the only open state a coarse pointer or a keyboard has, and it must be reachable on every pointer alike. FR-004, FR-007.
- [ ] T018 [US1] Peek a card open on pointer arrival and closed on departure in `src/console.js`, gated to a fine pointer. A peek leaves no card open behind it, moves no scroll position, and disturbs no card the reader has revealed. At most one card peeks at a time. FR-005, SC-011, SC-012.
- [ ] T019 [US1] Anchor an opening card so it grows in the block direction only, from its own top edge, in `index.html` and `src/console.js` (research D4). This is the whole answer to FR-006: a card that grows inline displaces its row-mates, moves its own edge past the pointer, sets the neighbour peeking, which shrinks the first, which puts the pointer back on the first. That oscillation is the failure mode of the entire gesture.
- [ ] T020 [US1] Animate the card's content arriving — opacity and a short translate, plus the chevron — on the house scale of 0.14 to 0.2 s ease, in `index.html` (research D3). The layout change itself is not a transitioned property; M5 says it costs 2.2 ms and can simply happen. FR-008.
- [ ] T021 [US1] Guard the animation behind `prefers-reduced-motion` in `index.html`, following `.strip-chev`'s existing precedent (`index.html:3307, 3310-3312`). The peek and the reveal both still happen; only the animation drops. FR-008, SC-017.
- [ ] T022 [US1] Allow more than one card revealed at once in `src/console.js`; revealing one must not close another, and a peek at a neighbour must leave a revealed card exactly where it was. FR-009, FR-005.
- [ ] T023 [US1] Take controls inside a card that is neither peeking nor revealed out of the tab order in `src/console.js`, using the `hidden` attribute so they leave it genuinely, and ensure a peek does not move the reader's place in it. FR-012.
- [ ] T024 [US1] Announce a reveal to assistive technology and do **not** announce a peek, in `src/console.js`. Nothing was chosen in a peek, and a reader who is not using a pointer is not making one. FR-014.
- [ ] T025 [US1] Add `api.reveal(channelId, on)` and `api.revealed()` to `src/console.js` per [contracts/console.md](./contracts/console.md). Neither may call `onChange`, `onPatch`, `onSolo` or `onReset`, and therefore neither can reach `pump()` — the only thing in the application that starts a simulation (`main.js:5658`). This is what makes SC-008 structural rather than a promise.
- [ ] T026 [US1] Hand the console a probed `localStorage` store for kept reveals from `src/main.js`, obtained through the same accessor the scheme shelf uses (`main.js:4031-4040`), under a new versioned key (research D8). That accessor round-trips a real `setItem`/`removeItem` and returns `null` on throw, so private browsing degrades to "not remembered" rather than failing to boot. A peek is never written. FR-015.
- [ ] T027 [US1] Restore kept reveals on load in `src/console.js`, and do not let a stored reveal override the layout's own decision at a size that cannot hold it. Reveal state stays out of the shared link: it is how the desk is read, not what it is, which is the argument that already keeps `pinnedHour` and the chased standard out of the fragment. FR-015.
- [ ] T028 [US1] Shape the grid for the three sizes the sheet already names in `index.html` — several columns on the desk, a single column at the `--index` breakpoint (`max-width: 780px` or `max-height: 600px`), and the phone — keeping one reveal gesture across all of them and introducing no fourth threshold. Thresholds stay declared once in the stylesheet and read back, as `console.js` already reads `--index`. FR-013, FR-035.
- [ ] T029 [P] [US1] Record the motion scale and the card/grid pattern in `.interface-design/system.md` (research D10, workflow gate 8). The file has **no** mention of motion, transition or animation anywhere, while the stylesheet has a consistent unwritten practice this feature relies on and extends: 0.14 to 0.2 s ease, touching only colour, background, border-colour, opacity or transform, never a layout property. A pattern living only in a stylesheet rule is the second source of truth Principle III forbids.
- [ ] T030 [US1] Drive pass 3 of `specs/005-console-findability/quickstart.md` (the grid fits) at the desk's ordinary width, at the `--index` breakpoint and at 390 px. Confirm the grid relayout is around 7 ms and not around 97; if it is anything like 97, a multi-column wrapper is still in place somewhere. FR-001, SC-001.
- [ ] T031 [US1] Drive pass 4 of `specs/005-console-findability/quickstart.md` (the peek behaves), all seven checks: sweep, rest, promote, coexist, pace, reduced motion, and Air opened at 1,419 px. The rest check is the one that finds D4's oscillation. SC-011, SC-012, SC-013, SC-014.
- [ ] T032 [US1] Drive pass 5 of `specs/005-console-findability/quickstart.md` (keyboard and screen reader) with the pointer unplugged, then repeat at 390 px with a coarse pointer where no peek exists at all. This is the direct test of Principle VII and of FR-034: nothing this feature adds may be *reachable* only on hover, and the peek shows nothing a reveal does not. FR-034, SC-007, SC-010.

**Checkpoint**: the console is a grid you can take in, reveal, keep and return
to. This is a shippable increment with no finder at all.

---

## Phase 4: User Story 2 - Search reveals only what matches (Priority: P2)

**Goal**: type a term, and the grid reveals exactly the matching controls wherever
they live, each under its channel, each turnable, each with its swept curve.

**Independent Test**: with the grid in place, type a term matching controls in
three different channels and confirm exactly those controls are revealed, each
under its channel, each turnable, each carrying its study curve where one exists;
then clear the search and confirm the desk returns to the reveal state it had
before.

**Depends on**: Phase 3 (the reveal is the mechanism this drives).

- [ ] T033 [US2] Create `src/finder.js` per [contracts/finder.md](./contracts/finder.md): DOM-free and network-free, importing only `src/controls.js`, by the rule `readings.js`, `describe.js` and `tm59.js` already follow. It is a separate module rather than a function inside `console.js` precisely so the Node harness can call the real thing.
- [ ] T034 [US2] Implement `buildVocabulary()` in `src/finder.js` over the single control declaration: control labels, channel names, landmark labels and phrases, selector option labels, zero-stop labels, units, and per-wall and per-face subjects. Measured at 486 distinct strings and 6,002 characters, so a linear scan answers every keystroke and there is no index to build. A control added, renamed or removed in `controls.js` must become findable, renamed or unfindable with no further edit. FR-019.
- [ ] T035 [US2] Add the module-load assertions to `src/finder.js`, following `readLandmarks` and `assertHideable`, which throw at load rather than degrade: every key in `ALL_KEYS` has at least its own label in the vocabulary, and no vocabulary entry is the empty string (which would match every query). A control kind added without teaching the finder fails at mount, loudly, rather than becoming quietly unfindable. FR-020, SC-003.
- [ ] T036 [US2] Implement `find(vocabulary, query, params, bypass, { studies })` in `src/finder.js`, matching case-insensitively with punctuation and whitespace normalised, partial words included, returning matches in **declaration order** rather than by relevance. The desk's order is physical order: a reader who searches `air` and gets Fabric's infiltration above Air's own controls has been told something false about the building. No fuzzy matching, no stemming, no synonyms — each invents a vocabulary the declaration does not contain. FR-018, FR-022.
- [ ] T037 [US2] Compute `Match.blocked` in `src/finder.js`, first hit wins, in the order the contract sets: channel patched out, channel precondition unmet, belongs to the other of the strip's two models, inert as the desk stands, and a `Facade` wall that reaches nothing. Each carries a sentence and states what would bring the control back; a `Blocked` with no sentence throws (Principle IV). A match is **never dropped** for being blocked: 66 controls carry `when` or `needs`, and a finder that hid them would answer "there is no such control" to a reader looking straight at it. FR-023, SC-009. See Notes below on the count.
- [ ] T038 [US2] Carry each match's channel and, where a control serves several subjects, its subject, in `src/finder.js` — `labelFor(key)` already names the wall. Two identically-named controls on different channels must be told apart without choosing one. FR-021.
- [ ] T039 [US2] Carry a match's study curve and its staleness in `src/finder.js`. A curve that no longer describes the desk says so rather than standing as though it does. FR-024.
- [ ] T040 [US2] Add `api.search(query)` and `api.clearSearch()` to `src/console.js` per the contract, reading the live `params` and `bypass` the console already holds by reference (`console.js:63-66`) and never copying them. Neither may call a console callback, so neither can start a run. FR-017, FR-028.
- [ ] T041 [US2] Reveal matches by hiding the non-matching control rows within an opened card, using the `hidden` attribute, in `src/console.js`. This is what takes the hidden rows out of the tab order as well as off the page. Pairs with T011's `[hidden]` twins. FR-018, FR-012.
- [ ] T042 [US2] Add the search field to the console head in `src/console.js` and `index.html`, reachable from any scroll position and at any supported size, operable entirely from the keyboard — opened, typed into, moved through, acted on and dismissed — and reachable without hover. FR-017, FR-027, FR-035.
- [ ] T043 [US2] Say so in place when a search matches nothing, in `src/console.js`, without closing the cards the reader had revealed. An empty query and a query with no matches are different states and are distinguished: the first restores the desk, the second says so. FR-025.
- [ ] T044 [US2] Stack the reader's prior reveal state when a search begins and restore it when the search is cleared, in `src/console.js` — not the default state, the reader's own. A search that revealed a control inside a card the reader had deliberately closed must leave that choice intact. FR-026, SC-016.
- [ ] T045 [US2] Write the throwaway Node harness for pass 1 of `specs/005-console-findability/quickstart.md` under a scratch directory, calling the real `src/finder.js` and `src/controls.js`: coverage of every key, channel and subject on every match, set equality against an independent vocabulary scan for a sample of terms, a non-empty sentence on every blocked match in each of the five blocked states, and the load-time assertion firing for a key with no label. Zero misses is the pass. SC-003, SC-004, SC-009.
- [ ] T046 [US2] Drive the search in `src/console.js` end to end from the keyboard alone, then again at 390 px with a coarse pointer: open, type, move among revealed controls, turn one, clear. Confirm what changed is announced, and time the journey: a reader who knows a parameter's name must reach it in under 10 seconds and at most three interactions, on the phone and on the desk alike. FR-027, SC-002, SC-007.

**Checkpoint**: US1 and US2 both work; a reader can take the desk in and ask it a
question.

---

## Phase 5: User Story 3 - Find your own edits (Priority: P3)

**Goal**: reveal exactly what the reader has moved off its defaults, each with its
channel, its value and the default it left, turnable and returnable where it
stands.

**Independent Test**: move six controls across four channels, ask what has
changed, and confirm exactly those six are revealed, each with its channel, its
value and the default it left, and that each can be turned or put back where it
stands.

**Depends on**: Phase 3 (the reveal). Shares `src/finder.js` with US2 but no
logic: `edits` needs the declaration and the parameters, not the vocabulary.

- [ ] T047 [US3] Implement `edits(params, bypass)` in `src/finder.js`, walking `ALL_KEYS` with the same identity comparison `encodeState` uses (`src/permalink.js:171`) and returning declaration order. Nothing exported anywhere does this today: `moved()` and `moves()` in `src/describe.js:77-95, 392` rank by distance from default but are file-private and return clauses about topical clusters, not controls (research D7). FR-029.
- [ ] T048 [US3] Include channels patched in or out relative to `DEFAULT_BYPASS` in `edits`, in `src/finder.js`. Patching is an edit. FR-030.
- [ ] T049 [US3] Measure edits on every call in `src/finder.js`, caching nothing and recording nothing as edits happen. A flag can go stale, a measurement cannot — the same reason `conformance()` re-measures on every `applyGeometry`. FR-033.
- [ ] T050 [US3] Add `api.edits()` and `api.showEdits(on)` to `src/console.js` per the contract, revealing exactly the edits as a search does and restoring the prior state when dismissed. Presentational only; no callback, no run. FR-029, FR-028.
- [ ] T051 [US3] Letter each revealed edit with its channel, its current value and the default it left, in `src/console.js`, using `formatValue(key, value)` and `formatValue(key, base)`. The control stays turnable and returnable to its default where it stands. FR-029, FR-031.
- [ ] T052 [US3] Say the desk is at its defaults when nothing has been changed, in `src/console.js`, rather than presenting an empty grid. An empty table would tell the reader they never changed anything, which is the silent fallback this codebase refuses everywhere else. FR-032.
- [ ] T053 [US3] Write the throwaway Node harness for pass 2 of `specs/005-console-findability/quickstart.md` under a scratch directory, over `src/finder.js` and `src/permalink.js`: assert `|edits(params, bypass)|` equals the number of pairs `encodeState` writes, across a fresh desk (expect zero, and the sentence rather than an empty list), a desk with *n* controls moved, a desk with channels patched, a revert, a decoded link and a restored scheme. Two independent pieces of code answering one question is the cheapest true test in this feature. SC-015.

**Checkpoint**: all three stories work independently of one another's content and
together as one instrument.

---

## Phase 6: Polish and cross-cutting concerns

- [ ] T054 Rewrite the `desk` note's copy in `src/tour.js` ("Open the model console", "Eighteen channels in the order the physics happens") to describe the grid and the reveal. A grid of cards is still eighteen channels in that order, but the copy names what is behind the button and the thing behind the button has changed shape. FR-037, workflow gate 6.
- [ ] T055 Retarget the `patch` note's `focus: '#desk .patch'` in `src/tour.js:97` if T012 could not keep the selector resolving, and check `syncGuide()`'s `.guided` redline has the same subject (`src/tour.js:160-167`). FR-037, contract: `notes.md`.
- [ ] T056 Bump the general notes' storage key from `shoebox-general-notes-v2` to `-v3` in `src/tour.js:25`, so a returning reader gets the new sheet rather than stale ticks against notes they never read. FR-037.
- [ ] T057 Decide whether the finder earns a seventh general note in `src/tour.js`. Six is the established count and the contract deliberately does not settle this. If one is added, it fills only from a genuine search event, never from a reveal or a peek, by the rule that a marker fills only when its step has actually happened on the desk.
- [ ] T058 [P] Drive pass 6 of `specs/005-console-findability/quickstart.md` (nothing runs) with the network tab and the status line in view: search, clear, reveal, fold, sweep the grid and list edits, and expect zero solves. Structural by the contract, but worth watching once, because the whole claim of this feature is that finding is free. SC-008.
- [ ] T059 [P] Drive pass 7 of `specs/005-console-findability/quickstart.md` (the general notes still teach the page), against `src/tour.js`: clear `localStorage`, reload, walk all six notes, confirm the `patch` note finds a subject with no card revealed and that a stored `-v2` state does not tick the new sheet.
- [ ] T060 [P] Drive pass 8 of `specs/005-console-findability/quickstart.md` (the one thing that needs the engine): turn a control from inside a revealed card and watch a design day come back in about 50 ms. The point is that `commit` is still reached the same way from a card as it was from a strip.
- [ ] T061 [P] Walk FR-036 as a regression sweep across the whole console, against `index.html` and `src/console.js`: no reading, control or explanation legible today may have become less legible or harder to reach. Include the balance rail, which must remain a reading about the desk as a whole and must not have been reduced to one of the eighteen cards (FR-016), and the two priced channels, whose cards must not suggest a run is coming.
- [ ] T062 Re-measure SC-002, SC-005 and SC-006 against the T003 baseline in a moderated session. The page sends nothing anywhere, so these are measured with readers, not instrumented.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T003 in particular must happen before any code changes.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all three user stories.**
- **US1 (Phase 3)**: depends on Foundational. Independent of US2 and US3.
- **US2 (Phase 4)**: depends on US1. Search reveals, so the reveal must exist.
- **US3 (Phase 5)**: depends on US1. Independent of US2 in logic; shares one file.
- **Polish (Phase 6)**: depends on the stories being complete. T054 to T057 depend on US1 and US2 both, since the notes teach the grid *and* the search.

### Story dependencies, stated plainly

The template's ideal is three independently deliverable stories. That is not
this feature and the spec says so: "it is the mechanism the other two stories are
built on: search reveals, and the edit list lands by revealing." US1 is
independently shippable. US2 and US3 are independently *testable* once US1 is in,
and independent of each other.

### Within each story

- The card model (T016) before the gestures that drive it (T017, T018).
- The anchor (T019) before the animation (T020): a card that oscillates does not become correct by animating more slowly.
- `src/finder.js` (T033) before anything that calls it.
- The vocabulary (T034) before the assertions over it (T035) and the matching against it (T036).
- Harnesses (T045, T053) immediately after the module they assert, not at the end.

### Parallel opportunities

Genuinely limited, and worth saying rather than padding the markers. Almost every
task touches `src/console.js` or `index.html`, and those two are one change seen
from two files: a card's markup and the CSS that lays it out cannot be written by
two people at once.

What can actually go in parallel:

- **T004** with the rest of Setup.
- **T015** (`.interface-design/system.md`) with T005 to T014, being a different file.
- **T029** (the motion section) with T030 to T032, once the animation exists.
- **T033 to T039** (`src/finder.js`) with **T042** (the search field's markup), being different files — the finder is DOM-free by construction and the console does not need it to exist to have a text input.
- **T045** and **T053** are different scratch scripts over different functions and may be written by different people, though T053 needs T047.
- **T054 to T057** (`src/tour.js`) with **T058 to T061** (driven passes).

### Parallel example: the finder

```bash
# Different files, no shared state:
Task: "Implement buildVocabulary() in src/finder.js"           # T034
Task: "Add the search field to the console head in index.html" # T042
```

---

## Implementation strategy

### MVP first

1. Phase 1 Setup, and **take the T003 baseline before touching anything**.
2. Phase 2 Foundational. This is where the feature is won or lost: if the grid relayout is not around 7 ms, stop and find the multicol wrapper rather than proceeding.
3. Phase 3 US1.
4. **Stop and validate**: quickstart passes 3, 4 and 5. A desk you can take in at a glance is the difference between a page you explore and a page you retreat from, and it ships with no finder at all.

### Incremental delivery

1. Setup + Foundational: the grid stands, closed cards read.
2. + US1: reveal, peek, keep, return. **Shippable.**
3. + US2: search. The highest-frequency act on the page, and no new gesture to learn.
4. + US3: the return leg.
5. + Polish: the notes, the regression sweep, the moderated re-measure.

### Where this lands

Branch from `004-choose-sweep-metric` (T001, research D11). PR #46
(`002-tm59-overheating`) targets `main`; PR #47 (`004-choose-sweep-metric`)
targets #46. Building on `main` buys a merge of the two largest files in the
repository against a rewrite of their layout.

---

## Notes

- **The blocked count.** FR-023 says "four reasons"; [data-model.md](./data-model.md)
  and [contracts/finder.md](./contracts/finder.md) both enumerate **five**, the
  fifth being a `Facade` wall that reaches nothing, which takes its sentence from
  `Side.reasonFor(params)` because one sentence could not say which of four walls
  is inert. The fifth is arguably a specialisation of "inert as the desk stands",
  which is presumably how it came to be folded into four. T037 implements five.
  **This is a discrepancy in the spec, which is under review in PR #48**; it is
  recorded here rather than corrected silently, because a spec under review is
  not something to edit from a task list.
- **Line numbers are `main`'s** and will have moved on the branch this lands on.
  They identify code, not addresses.
- **Every task that says "confirm" is a real check**, not a reassurance. Three of
  them (T012, T013, T014) exist because the thing they check fails without an
  error: a silent `stage()` no-op, a `setStudy` anchor that throws only when a
  reader sweeps, and a `shapeKey` that would re-run studies for no reason.
- **Commit after each task or logical group.** No task should leave the page
  unable to load.
