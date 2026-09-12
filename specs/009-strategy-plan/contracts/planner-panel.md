# Contract: the planner panel

Added 2026-09-11 (FR-001, FR-046a, research.md section 19). The strategy plan leaves `section#survey` for a panel of its own on the left of the sheet, mirroring the Model Console on the right.

**Superseded in part, same day.** The later clarifications of 2026-09-11 send the survey into the panel after the plan, so `section#survey` moves too and the sheet keeps E-01 alone. What this contract says about the panel's box, its head, its folding and its layout at each width still holds; what it says about the panel's *contents* is replaced by contracts/panel-sequence.md, which also declares the numbered sequence and the panel's growth.

## Markup (`index.html`)

- `aside.planner#planner` (`aria-label="Strategy plan"`) sits after `main.sheet` in the DOM and before it on screen (`order: -1`), so focus reads sheet, plan, console. It holds everything `section#strategy` held: the reading chooser, the plan drawing, the one-move view, the islands, the screening and the four kinds, and the complete record.
- `header.planner-head`, mirroring `.desk-head`, carries the eyebrow and title, the reading scope, the campaign state line, and Pause, Resume and Cancel (contracts/campaign.md), and the close button. The head is what the folded rail shows.
- `#planner-open` in the ledger, beside `#desk-open`, with `aria-expanded` and `aria-controls="planner"`.
- A link at the head of E-02 that opens the panel.
- Every `display`-setting class gets its `[hidden]` twin, by the stylesheet's standing rule.

## Layout (the stylesheet decides; script reads the flags back)

| Window | Planner | Console | Sheet |
| --- | --- | --- | --- |
| ≥ 1,624 px wide, both open | full, `--planner` (436 px) | full, `--desk` | at least `--sheet-min` (720 px) |
| 781 to 1,623 px, both wanted | the one opened last is full; the other is a `--rail` (168 px) head | as the planner | the remainder |
| ≤ 780 px wide or ≤ 600 px tall | its own page under the sheet, before the console | its own page under the sheet, as today | full width |

- `--both` is declared once, on `body`, by the one media query at 1,624 px, and read by script with `getComputedStyle`. The number is never restated in a `matchMedia` string.
- The body stays a flex row, for the reason the desk's comment gives against a grid.
- The panel is sticky at 16 px, at most the viewport less 32 px tall, and scrolls inside itself.

## Behaviour (`src/main.js`)

- `openPlanner(open)` mirrors `openDesk`: toggles `body.planner-open`, sets `aria-expanded`, re-letters the opener, notes the tour event, and calls `renderStrategySoon` because the drawings take their width from the panel.
- Where `--both` is 0, opening one panel adds the other's `-folded` class, and opening the folded one swaps the two. A resize across the 1,624 px line recomputes the folds and redraws the plan.
- The folded planner still letters its readings, its campaign state and its controls. The folded console still letters its head.
- A strip tag's button opens the panel, unfolding it if folded, before scrolling to and focusing its entry.
- Pressing two controls in the screening cuts the E-02 ground and scrolls the sheet to E-02, whatever the panel's state.
- Closing the panel does not close the plan: its readings, its campaign and its tags stand. *Close the plan* inside the panel is what ends it, as today.

## The general notes

The plan's note in `NOTES` targets `#planner-open` while the panel is closed and `#planner` while it is open, the arrangement the patch note already follows with `#desk-open`, and the storage key moves to `shoebox-general-notes-v6`.

## Driven, not harnessed (quickstart gate 13)

At 1,920, 1,624, 1,440, 1,180, 900, 780 and 390 px wide, and at 1,280 × 600: each panel alone, both, and the fold swap. Nothing overflows the sheet's edge, no drawing is wider than its host, and every reading stays in view.
