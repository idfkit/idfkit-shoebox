# Data Model: Trim the App's Copy

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Nothing here reaches the IDF, the link or a reading. These are declarations of
text and the rules that bound it.

## Budget (new, `src/copy.js`)

A limit on how many words a kind of always-visible text may carry.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | unique, upper snake case (`STRIP_LINE`) |
| `words` | positive integer | the limit, inclusive |
| `scope` | string | one sentence naming what it applies to; shown in the error |
| `asserted` | boolean | `true` if checked at module load, `false` if only measured |

Instances are frozen and collected in `BUDGETS`. The roster and its numbers are
fixed in [research.md D5](./research.md#d5-the-budgets) and restated as a
contract in [contracts/budget.md](./contracts/budget.md).

**Operations**:

- `words(text)`: strip markup, split on whitespace, count non-empty tokens.
- `withinBudget(budget, where, text)`: returns `text`, or throws
  `Error(\`${where}: ${n} words, over the ${budget.words}-word ${budget.id} budget (${budget.scope})\`)`.

## Glance fields (added to existing declarations)

| Declaration | New field | Budget | Required |
| --- | --- | --- | --- |
| `Channel` (`src/controls.js`) | `line` | `STRIP_LINE` | yes, on all 18 channels |
| `Note` (`src/tour.js`) | `step` | `STEP` | yes, on all 7 notes |

`Channel.blurb`, `Control.note`, `Meter.note`, `Readout.note`, `Target.note`,
`Note.body`, `Qualification.says` and `Qualification.because` keep their names
and their text. What changes is where they render: inside a fold.

## Standing message (existing text, now budgeted)

A refusal, a blocking reason or an absence reason. Always in view, one sentence,
never folded.

| Source | Budget | Checked |
| --- | --- | --- |
| `Channel.requires.reason` when a string | `STANDING` | at load |
| `Channel.requires.reasons` (new: the constants a function-valued reason chooses among) | `STANDING` | at load |
| `Side.unreached` when a string | `STANDING` | at load |
| absence reasons in `src/schemes.js`, `src/tm59.js`, `src/main.js` | `ABSENCE` | measured |
| refusal and status lines in `src/main.js` | `STANDING` | measured |

**Rule**: a function-valued `reason` returns one of `requires.reasons` by
identity. A harness asserts this at the positions that block each channel
(quickstart step 3).

## Fold (new UI element)

An in-place disclosure attached to one element.

| Attribute | Rule |
| --- | --- |
| element | `<details class="fold">` with one `<summary>` first |
| `data-fold` | stable key, `<kind>:<id>` (for example `ctl:wallR`, `target:phi-heat`, `strip:fabric`, `tm59:qualifications`, `finding:why`) |
| summary text | at most 6 words (`SUMMARY`); names what the fold holds |
| accessible name | where the summary is generic ("Note"), `aria-label` names the subject ("Note on wall resistance") |
| initial state | closed, unless its key is in the session's open set |

The full DOM and CSS contract is [contracts/fold.md](./contracts/fold.md).

## Open set (new, in memory)

A module-level `Set` of `data-fold` keys the reader has opened this session.

**State transitions**:

```text
closed --(reader opens)--> open        : key added to the set
open   --(reader closes)--> closed     : key removed from the set
open   --(redraw)--------> open        : rebuilt fold reads the set
any    --(page reload)---> closed      : the set is not persisted
```

The set is never read by the model, the link codec, the scheduler or any
reader of the run (FR-007).

## Relationships

```text
Budget 1 ---- * glance field / standing message   (asserted or measured)
Channel 1 --- 1 line (glance)  + 0..1 fold (blurb, meter note, readout note)
Control 1 --- 0..1 fold (note)
Target  1 --- 0..1 fold (note)
Note    1 --- 1 step (glance)  + 0..1 fold (body)
QUALIFICATIONS * --- 1 fold (summary states the count)
Fold    * --- 1 open set
```
