# Implementation Plan: Console findability

**Branch**: `005-console-findability` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-console-findability/spec.md`

## Summary

The console holds 18 channels and 129 controls over 144 parameter keys, and a
reader meets all of them at once. Measured on the running page at 1500 x 913 with
the desk open: the strip grid is **11,807 px tall inside a 473 px scroller — 25
screens — and exactly one strip is fully visible**. The declaration says
`column-count: 5`, but the desk's flex basis is 436 px against a 320 px column
width, so the multi-column layout that is supposed to make eighteen channels
tractable resolves, at the width the desk actually gets, to a single column
twenty-five screens long. That is the complaint in one number.

The spec's answer is a grid of cards with two open states — a transient **peek**
under a fine pointer and a kept **reveal** from a click, a tap or a keypress —
and a search that reveals only matching controls through the same mechanism.

Phase 0 measured the one thing that decides whether that is buildable, and the
answer inverts the obvious approach. **A multi-column relayout of these eighteen
strips costs a median of 97 ms**, which is six frames; a peek under a moving
pointer is impossible in the layout the console is built from today. **The same
content as a CSS grid relayouts in 7.2 ms, and opening a single card inside one
costs 2.2 ms.** So the grid is not a presentational preference — it is the
precondition for the gesture, and everything else follows from it.

The approach has five moves, in dependency order:

1. **Replace the multi-column wrapper with a CSS grid**, three columns, with the
   desk widened to carry them. Three is the fewest that puts all eighteen closed
   cards inside the scroller (406 px against 473); two misses by 107 px, and
   because height is set by the row count, no amount of extra width rescues it.
2. **Give a card its two open states.** The closed face already exists — the
   index sheet's `.strip-read`, `.strip-mark` and `.strip-chev` letter exactly
   what a card must letter — but is gated to the narrow breakpoints and must be
   drawn at every width. Expansion is anchored so a card grows downward from its
   own top edge and never walks out from under the pointer.
3. **Build the finder** as a new DOM-free `src/finder.js` over the declaration.
   The vocabulary is 486 distinct strings and 6,002 characters, so a linear scan
   answers every keystroke and there is no index to build.
4. **Reveal by search**, hiding non-matching control rows with the `hidden`
   attribute so they leave the tab order, and carrying each match's channel, its
   subject, its swept curve and, where it cannot be turned, which of five reasons
   applies.
5. **Enumerate the edits** with a new exported function, asserted against the
   identity diff `encodeState` already takes — two independent pieces of code
   answering one question, which is the cheapest true test in the feature.

Full measurements and the reasoning behind each choice are in
[research.md](./research.md); the entities are in [data-model.md](./data-model.md);
the interfaces in [contracts/](./contracts/).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation. Browser
baseline is whatever runs the WebAssembly engine build.

**Primary Dependencies**: none added. This feature touches `src/console.js`,
`index.html`'s inline stylesheet, `src/main.js`, `src/tour.js` and
`.interface-design/system.md`, and adds `src/finder.js`. It imports
`src/controls.js` and nothing else new, as required by Principle V.

**Storage**: one new versioned `localStorage` key for kept reveals, obtained
through the probing accessor `main.js:4031-4040` already uses for the scheme
shelf. A peek is never stored. Nothing rides the URL fragment.

**Testing**: no test runner and no linter. Throwaway Node harnesses plus driving
the page, per the constitution's workflow section. `src/finder.js` is DOM-free by
the rule `readings.js`, `describe.js` and `tm59.js` follow, so the harness calls
the real functions. The grid, the peek and the animation are browser-only and are
driven; see [quickstart.md](./quickstart.md).

**Target Platform**: static site, client-side only. The console is a flex item
beside the sheet, sticky, `max-height: calc(100vh - 32px)`, with a fixed head, one
scroller and a pinned rail.

**Project Type**: single-page client-side application. One `src/` tree of ES
modules, no framework and no bundled UI library.

**Performance Goals**: a card opens inside a frame. Measured: grid relayout 7.2 ms
median / 13 ms p95, opening one card 2.2 ms / 9.3 ms, against a 16.7 ms frame.
The animation stays on the house scale of 0.14–0.2 s. A sweep across all eighteen
cards must leave nothing still finishing.

**Constraints**: nothing added may reach `params`, or it will start runs that
change nothing (Principle VI). Nothing may be reachable only on hover (Principle
VII) — the peek is an accelerator and shows nothing a reveal does not. Every
reading legible at 390 px. No new runtime dependency. The three sizes are the ones
the sheet already names; this introduces no fourth threshold.

**Scale/Scope**: 18 cards; 144 keys; 486 vocabulary strings; 85 sweepable controls
that can carry a study card; 66 controls that can be in a state a match must
explain; 1 new module, 1 new storage key, 0 new dependencies, 0 new link keys.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.0. **Initial check: PASS
with three items requiring design attention, all three resolved in Phase 1 and
re-checked below.**

| Principle | Verdict | Basis |
|---|---|---|
| I. Everything Runs in the Browser | PASS | Nothing here adds a request. The finder reads a declaration already in the bundle. |
| II. Deterministic and Shareable | PASS | Nothing added reaches the IDF, so nothing needs to ride the link. Reveal state, the query and the edit list are how the desk is *read*, which is the same argument that already keeps `pinnedHour` and the chased standard out of the fragment. No `LINK_VERSION` bump. |
| III. Read It Back Off the Model | PASS | FR-016 requires the vocabulary to be derived from the one control declaration, with a load-time assertion that every key is covered. The edit list is measured against `DEFAULT_PARAMETERS` on every ask rather than recorded. |
| IV. No Silent Fallbacks | PASS | A blocked match states which of five reasons applies and what would fix it; a `Blocked` without a sentence throws. A match is never dropped for being blocked. An empty result says so in place. |
| V. Only @idfkit/* at Runtime | PASS | No dependency added. |
| VI. Latency Is the Interface | **PASS, and it is the reason for the design** | See Attention 1. |
| VII. Mobile-First and Responsive | PASS, with two design gates | See Attention 2 and 3. |

**Attention 1: the peek is only affordable in one layout (Principle VI).** The
constitution says latency is a design budget to be spent, not a footnote. Measured,
a multi-column relayout of these strips is 97 ms median and 145 ms p95 — six to
nine frames — so a hover-driven expansion in the present layout would not be slow,
it would be broken. The same content as a grid is 7.2 ms, and opening one card is
2.2 ms. This is why D1 is a precondition rather than a preference, and it is the
one measurement that anybody revisiting this design should take again first.

A second obligation falls out and is carried as a task rather than assumed: an
opened Air card is **1,419 px against a 473 px scroller**. Left unbounded, a peek
passing over Air would push every later card three screens down and snap them back
as the pointer left. The card's body is bounded and scrolls its own overflow (D5).

**Attention 2: hover, and what Principle VII actually forbids (Principle VII).**
The principle forbids a reading, control or explanation existing *only* on hover,
because `pointer: coarse` has none. It does not forbid hover from accelerating
something reachable another way, and the stylesheet already has about thirty-five
`:hover` rules, every one of which recolours something already drawn. The peek is
compliant by construction: it shows nothing a reveal does not show equally, a
coarse pointer and a keyboard reach the reveal directly, and the peek is
unreachable — not degraded, unreachable — where there is no hovering to do. The
spec's SC-010 is written to test exactly this, at 390 px and again with a keyboard
alone.

**Attention 3: the design system is silent on motion, and this feature needs it to
speak (Principle VII, and workflow gate 8).** `.interface-design/system.md` has no
mention of motion, transition or animation anywhere, while the stylesheet has a
consistent unwritten practice: 0.14–0.2 s, `ease`, and only colour, background,
border-colour, opacity or transform — never a layout property, and nowhere an
entrance or exit reveal. The nearest precedent is `.strip-chev`'s rotate, which is
both transitioned and reduced-motion guarded. This feature relies on that practice
and extends it, and gate 8 requires a new pattern to be recorded in the design
system in the same change that introduces it. It also replaces the multicolumn
layout that file currently documents as settled (`:578-587`), so leaving it
unedited would make it wrong twice. Editing `.interface-design/system.md` is a
task, not a courtesy.

### Post-design re-check

Re-evaluated after Phase 1. **PASS.** The three attentions are answered by D1/D5,
by the peek/reveal split in [data-model.md](./data-model.md), and by the design
system task. One additional finding from Phase 1 is worth recording against
Principle IV: the general notes' `patch` note focuses `'#desk .patch'`, a selector
into the console's live markup, and `stage()` returns silently when it finds
nothing (`tour.js:172-173`). A card grid that drew patch markers only inside opened
cards would break the onboarding with no error anywhere. FR-001 requires the marker
on a closed card independently, so the note survives as a consequence of the spec
rather than as a special case — but it is asserted in the quickstart rather than
assumed.

## Project Structure

### Documentation (this feature)

```text
specs/005-console-findability/
├── plan.md              # This file
├── research.md          # Phase 0: five measurements, eleven decisions
├── data-model.md        # Phase 1: Card, CardState, Match, Vocabulary, Edit
├── quickstart.md        # Phase 1: eight validation passes
├── contracts/
│   ├── console.md       # what mountConsole gains, and what it may not do
│   ├── finder.md        # the new DOM-free module
│   └── notes.md         # the general notes' one structural dependency
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks - NOT created by /speckit-plan)
```

### Source code (repository root)

```text
src/
├── finder.js       # NEW. DOM-free: buildVocabulary, find, edits.
├── console.js      # the grid, the card, the two open states, the reveal API
├── controls.js     # unchanged; it is the vocabulary's single source
├── main.js         # hands the console a probed localStorage; nothing else
├── tour.js         # the patch note's focus, the desk note's copy, key -> v3
└── permalink.js    # unchanged; asserted against by the edit list

index.html          # the inline stylesheet: grid, card, peek, motion, [hidden] twins
.interface-design/
└── system.md       # the motion scale and the card/grid pattern, per gate 8
```

**Structure Decision**: unchanged from the repository's own shape — one flat `src/`
of ES modules with no framework. The single new module is `src/finder.js`, and it
is new rather than folded into `console.js` for the reason `readings.js`,
`describe.js` and `tm59.js` are separate: DOM-free modules are the ones the Node
harness can call directly, and the finder's correctness is exactly the part worth
asserting permanently.

## Where this lands

**This must not be built on `main`.** PR #46 (`002-tm59-overheating`) targets
`main`; PR #47 (`004-choose-sweep-metric`) targets #46. Relative to `main`, that
stack changes `src/console.js` by +449 lines, `src/main.js` by +1,452 and
`index.html` by +479 — the same regions this feature restructures. Implementation
branches from `004-choose-sweep-metric`, or from `main` once both have landed.

The counts differ between the two trees, measured by importing the declaration
from each:

| tree | channels | controls | keys | kinds |
|---|---|---|---|---|
| `main` | 18 | 123 | 138 | 8 |
| `004` head | 18 | 129 | 144 | 9, adding `pattern` |

The spec's "144 keys, 129 controls" describes the stack tip, which is the tree
this lands on. Every line number cited in these artifacts is `main`'s and will
have moved; they identify code, not addresses.

## Complexity Tracking

No constitutional violations require justification. Two choices cost more than the
obvious alternative and are recorded here because a later reader will wonder:

| Choice | Why | Simpler alternative rejected because |
|---|---|---|
| Replacing multicol with a grid, rather than folding the existing strips | The peek is 97 ms a frame in multicol and 2.2 ms in a grid | Folding alone leaves 18 closed rows at 1,083 px in a 473 px scroller — still 2.3 screens, so FR-001 fails and the feature's first complaint is unanswered |
| A new `src/finder.js` rather than a function inside `console.js` | DOM-free is what lets the harness assert coverage of every key against the real declaration | Inside `console.js` the finder could only be tested by driving a browser, which is exactly the verification this repository has least of |
