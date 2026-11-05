# Contract: Message Syntax

A strict subset of ICU MessageFormat 1 (research R1). Anything not listed here is refused by `scripts/l10n-check.mjs` and throws in `src/l10n/message.js`.

## Grammar

```text
message   := part*
part      := text | argument | plural | select | bold
text      := any characters except { } < and the sequence that opens a tag
argument  := "{" name "}"
plural    := "{" name ", plural," branch+ "}"        ; branches: =N, zero, one, two, few, many, other
select    := "{" name ", select," branch+ "}"        ; branches: lower-case keys, and other
branch    := key " {" message "}"
bold      := "<b>" message "</b>"                   ; no attributes, no nesting of <b> in <b>
name      := [a-z][A-Za-z0-9]*
```

- `#` inside a `plural` branch is replaced by the argument, **already lettered** by `units.js` in the active language. The plural category is chosen from the argument's numeric value, formatted with the same fraction digits it is lettered with, so "1.0 h" selects as `1.0` would in that language.
- `other` is required in every `plural` and `select`.
- Nesting depth is at most 2 (a `select` containing a `plural`, or the reverse).
- No apostrophe quoting. A literal `{`, `}`, `<` or `>` in text is refused; none is needed on this sheet.
- No number, date, ordinal, `selectordinal` or `offset` forms. Figures arrive as lettered strings.

## Rules for English authors

1. **Selectors outermost, whole sentences in each branch.** Not `"{n} warning{n, plural, one {} other {s}}"` but `"{n, plural, one {# warning} other {# warnings}}"`. The checker refuses a `plural` or `select` preceded or followed by text at the same level when the message has more than one sentence part.
2. **Lists are not built by hand.** Pass an array argument; `say()` joins it with `Intl.ListFormat` (conjunction, long) in the active language. The message writes `{moves}`.
3. **Never compose a sentence from two messages.** If a sentence varies, it is one message with a `select`.
4. **Figures and units go in as one lettered argument** (`{width}` → `"15.24 m"` or `"50 ft"`), so no language reorders a number away from its unit.

## Examples

```text
main.hoursSolved =
  {warnings, plural,
    =0 {{hours} hours solved locally in {seconds} s}
    one {{hours} hours solved locally in {seconds} s · # warning}
    other {{hours} hours solved locally in {seconds} s · # warnings}}

main.trade =
  {n, plural,
    one {# measured design trades. The largest gain is at {x} by {y}: {said}.}
    other {# measured designs trade. The largest gain is at {x} by {y}: {said}.}}

describe.storeys =
  {storeys, plural,
    one {A single storey of {area}, {plan}, {height} tall}
    other {# storeys of {area}, {plan}, {height} to a storey}}

tour.units.step = Switch to <b>IP</b> and every figure re-letters; nothing re-runs.
```

## Rendering

`say(id, args)` returns a lettered string with `<b>` intact; `render(el, id, args)` writes it into `el` as text nodes and `<b>` elements only (`src/l10n/render.js`). A message whose translation is missing or outdated is rendered from the English, wrapped in `<span lang="en" class="untranslated">` and followed by the visible `EN` mark ([language-chooser.md](./language-chooser.md)). `say()` with an unknown id throws.
