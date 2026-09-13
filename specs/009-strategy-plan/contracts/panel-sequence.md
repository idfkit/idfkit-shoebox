# Contract: the panel's numbered sequence, and the survey inside it

Added 2026-09-11 (FR-001 as revised, FR-001a, FR-001b, FR-019a, FR-046b; research.md sections 21 to 23). This supersedes the contents half of contracts/planner-panel.md, which put the plan in the panel and left the ground on the sheet. The ground follows it in.

## What moves (FR-001)

`section.survey#survey` (`index.html:5636`) leaves `main.sheet` whole and becomes part 5 of the panel. It carries everything it owns: the axis chooser `#survey-choose`, `section.pull#pull`, the refusal paragraph, the two drawings in `#survey-drawing` (the ground `#survey-ground` and the relief `#survey-relief`), the ground key, the spot readout, the coverage line, the traverse, the finding, the schedule of spot heights, and the E-02 stamp. Every existing id stays, so `renderSurvey` and its eight helpers need no id changes.

The sheet then holds **E-01 alone**. The panel's head carries the E-02 title, and `button#survey-planner` ("Open the strategy plan", `index.html:5643`) goes: there is nothing left on the sheet to open it from, and the ledger's `#planner-open` is the route.

## The six parts (FR-001b)

One vertical sequence, numbered in the markup, each part headed by the question it answers:

| Part | Question it answers | Holds |
| --- | --- | --- |
| 1 | What is this plan of? | the reading chooser, the campaign's state, and the summary of every active constraint (FR-054) |
| 2 | What decides this reading? | the plan drawing, both recipes, the share explained, the coverage, the one-move offer, the limits |
| 3 | What is one door away? | the archipelago or its cards, the islands, the refused and same-reading doors |
| 4 | What pulls anywhere in this world? | the screening table, the inert list, the sweet spots |
| 5 | What does the ground look like along two of them? | the whole of E-02 |
| 6 | What should be decided now? | the four kinds, the exchanges and their levers |

Part 5 stands **directly under** part 4, because the screening is what hands it its two axes.

## No part is a gate (FR-001a)

Every part is present and readable by scrolling alone. No tab, accordion or wizard step, and no reading, share explained, verdict, absence reason or refusal in a fold. Four blocks are `hidden` today until something has landed, and each becomes a part that stands and states what it waits on:

| Block | Line | Was hidden until | Now |
| --- | --- | --- | --- |
| `div.strategy-body#strategy-body` | `index.html:6000` | a plan existed | parts 2 to 4 stand, each saying what it waits on |
| `section.strategy-part#strategy-moves-part` | `index.html:6055` | two readings | part 6 stands, saying it needs a second reading |
| `section.survey#survey` | `index.html:5636` | a ground was cut | part 5 stands, saying two controls in part 4 cut it |
| `div.survey-body#survey-drawing` | `index.html:5673` | a ground was cut | the drawings inside part 5, same rule |

**The two record folds stay.** `survey:spots` (`index.html:5759`) and `strategy:designs` (`index.html:6063`) each hold the complete record, and the readings stand outside them already. FR-001a forbids a reading in a fold, not a record in one, and neither is a gate that shows one part at a time. This is the split the TM59 qualifications block keeps.

## The two drawings, stated once (FR-019a)

The survey's ground keeps its contour lines and its relief block; the plan's terrain carries neither, and neither is brought to the other's convention. Where the two meet, which is the head of part 5, the panel states once why: **the ground is measured along two chosen controls, the terrain is inference along moves.** One sentence, in place, not on hover.

## Width (FR-046b)

| Token | Value | Job |
| --- | --- | --- |
| `--planner` | 436px (existing) | the panel's base width |
| `--planner-max` | new | the declared maximum it grows to |
| `--sheet-min` | 720px (existing, `index.html:52`, used in no rule today) | the sheet's own minimum, now a real `min-width`, so flex cannot take it below its measure before the panel takes surplus |
| `--pair` | new, on `.survey-body` | the flag script reads back to learn whether the two drawings stand side by side |

- The panel is `flex: 1 1 var(--planner); max-width: var(--planner-max)`.
- The sequence stays one column at every width, which `.strategy-body` already is (`index.html:5001`).
- The **only** two-column thing is the survey's pair of drawings, and it becomes a **container query**: `container-type: inline-size` on `.planner-body`, two columns above a declared container width. A container query is a platform API, which Principle V prefers to a script that measures the panel. The existing `--survey` media query (`index.html:5320`) is a window query and cannot see the panel: at 436px inside a 1,920px window it would leave two 200px squares.
- Every threshold is declared once in the stylesheet and read back through a custom property, never restated as a `matchMedia` string.

## The relief needs a resize path (research.md section 21)

`createRelief` sizes off its host on every paint (`src/relief.js:414`), and `paint()` runs only on a draw, a viewpoint change, a step or a theme change. There is no `ResizeObserver`, and `relief.repaint` is never called from `src/main.js`. Two changes, both required:

- **`resize()` refuses a zero box** and keeps the last good size. `body.planner-folded .planner-body` is `display: none` (`index.html:2577`), so a host in a folded panel measures 0 and `Math.max(1, ...)` would lock in a 1 by 1 canvas that never recovers on a finished survey.
- **`panelsMoved()` (`src/main.js:3505`) reaches the relief**, as it already reaches the plate and the plan. A `ResizeObserver` was the alternative and is worse: it fires through the fold's own transition and the first box it sees is the zero one.

`drawGround` needs nothing: its `viewBox` is a fixed 320 square (`src/main.js:9117`).

## Cross-links that change

- `cutFromScreening` (`src/main.js:11751`) no longer scrolls the sheet. Part 5 is a few centimetres below part 4 in the same scroller, so it scrolls **within the panel**.
- `nameSurveyAxis`'s scroll (`src/main.js:9070`) moves with it.
- The tour's `survey` step (`src/tour.js:198`) targets a part inside the panel, so it opens the panel first, as the `strategy` step already does. The storage key moves to `shoebox-general-notes-v7`.

## Driven, not harnessed (quickstart gate 16)

At 1,920, 1,624, 1,440, 1,180, 900, 780 and 390 px wide and at 1,280 by 600: every part present at every width, the sequence one column throughout, the two drawings side by side only above the declared container width, nothing wider than its host, and the relief correct after a fold, an unfold and a resize.
