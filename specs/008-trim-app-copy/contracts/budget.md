# Contract: Copy budgets

The declaration a maintainer meets when they add always-visible text, and the
refusal they get when it is too long.

## Module

`src/copy.js`. DOM-free, network-free, no imports, so every declaring module and
every Node harness can load it.

## Exports

| Export | Kind | Meaning |
| --- | --- | --- |
| `Budget` | class | `new Budget({ id, words, scope, asserted })`; frozen |
| `BUDGETS` | frozen object | the roster, keyed by `id` |
| `words(text)` | function | markup stripped, whitespace-split, non-empty tokens counted |
| `withinBudget(budget, where, text)` | function | returns `text` or throws |

## Roster

| `id` | `words` | `asserted` | Scope |
| --- | --- | --- | --- |
| `STRIP_LINE` | 12 | yes | a channel's line in the console |
| `STEP` | 15 | yes | a general note's instruction, and the notes lede |
| `STANDING` | 15 | yes for declarations | a blocking reason, a refusal |
| `ABSENCE` | 12 | no | a reason beside an em dash |
| `SUMMARY` | 6 | yes where declared | a fold's summary |
| `BLOCK` | 25 | no | one block's explanation in view; a page lede |
| `CHASE` | 20 | no | the Chase sentence above the board |
| `DESCRIPTION` | 60 | no | description and finding together |
| `CEILING` | 40 | no | any single visible block |

Changing a number is an edit to this table and to `src/copy.js` in one commit.

## Refusal

At module load, an over-budget declared string throws:

```text
Error: channel fabric line: 14 words, over the 12-word STRIP_LINE budget (a channel's line in the console)
```

`where` names the declaration the way the existing load assertions do (the
control key or channel id first), so the message points at the line to edit.

## Where it is called

| Module | What is asserted |
| --- | --- |
| `src/controls.js` | every `Channel.line`; every string `requires.reason`; every `requires.reasons` constant; every string `Side.unreached` |
| `src/tour.js` | every `Note.step`; the lede |
| `src/tm59.js` | the qualifications summary |
| `src/main.js` / `src/console.js` | fixed fold summaries, at the point they are declared as constants |

## Invariants

- A fold's long form has no budget.
- `words` is the only counter. The measurement script
  ([measure.md](./measure.md)) imports it rather than counting its own way.
