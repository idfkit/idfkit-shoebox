# Contract: Measuring visible prose

SC-001, SC-002 and SC-003 are word counts of what is on the screen. This is the
one method used to take them, before and after, so the two numbers are
comparable.

## What counts

A text node counts when all of these hold:

1. It is rendered: no ancestor has `hidden`, `display: none` or
   `visibility: hidden`, and its nearest `<details>` ancestor, if any, is `open`
   or the node is inside that ancestor's `<summary>`.
2. It is prose: its nearest element ancestor is a `p`, `dd`, `dt`, `li`,
   `summary`, `figcaption`, `caption`, `blockquote` or `label` with no `for`
   (a free sentence, not a control's name).
3. It is not a figure: it is not inside `svg`, `output`, `input`, or an element
   with class `q` (the mono quantities `describe.js` emits), and it is not the
   bare text of a `td` or `th`.

**Refinement, found taking the baseline.** The scoreboard's method notes and the
TM59 blocks are prose that renders inside table cells, as `i.why`, `p` and `dd`.
Excluding every `td` descendant, as the first version of rule 3 did, counted
the default desk at 920 words and missed the largest blocks on the sheet. So a
cell's text counts as prose when a prose element or `.why` stands between the
text and the cell, and is a figure otherwise. Both the before and the after
numbers were taken with this rule.

Words are counted with `words()` from `src/copy.js`, so the measurement and the
load assertion count the same way.

## Scopes

| Scope | Root element | Used for |
| --- | --- | --- |
| sheet | `document.body` minus the console | SC-001, SC-003 |
| console | the console root | SC-002, SC-003 |
| block | each direct child block of either root | SC-003's 40-word ceiling |

## Positions

Taken on a 1440 x 900 window and on a 390 x 844 window, after the run lands,
with the general notes shown, at:

1. the default desk, first visit, design days;
2. the default desk with a weather file attached (annual, bill priced);
3. every channel engaged;
4. Fabric bypassed (blocking reasons in view).

## Output

A table per position: scope, total words, the five wordiest blocks with their
counts. Saved beside the quickstart run as `before.md` and `after.md` in the
scratch directory, not in the repository.
