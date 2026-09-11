# Contract: The fold

One disclosure pattern for every piece of explanation this feature takes out of
view. It generalises the scoreboard's `.why-fold` and replaces it.

## DOM

```html
<details class="fold" data-fold="ctl:wallR">
  <summary aria-label="Note on wall resistance">Note</summary>
  <!-- the long form, moved verbatim -->
</details>
```

- `<summary>` is the first child and the only one in view while closed.
- `data-fold` is `<kind>:<id>`, stable across redraws and across sessions.
- `aria-label` is set only where the summary text alone does not name its
  subject.
- Built by one helper, `fold(key, summary, ...children)`, exported from the
  module that builds most of them (`src/console.js`) and imported by
  `src/main.js`. `main.js`'s existing `why-fold` construction at `:5454-5463` is
  rewritten onto it.

## Behaviour

| Event | Result |
| --- | --- |
| click or Enter or Space on the summary | toggles, natively |
| `toggle` | the key is added to or removed from the open set |
| the host block is rebuilt | a fold whose key is in the open set is built `open` |
| page reload | every fold closed |
| a fold inside a folded strip (index layout) | reachable once the strip is opened; `hidden` on the strip takes it out of the tab order |

No script opens a fold on the reader's behalf. The general notes' staging may
scroll to an element; it does not open folds.

## CSS

- One rule set on `.fold`, lifted from `.register #score td .why-fold`
  (`index.html:1543-1572`): `+` closed, `-` open, `--ink-ghost` summary at the
  sheet's small sans, `--ink-2` on hover, `--rule-focus` outline on
  `:focus-visible`, no webkit marker.
- The open body uses the host's own note style (`.ctl-note`, `.meter-note`,
  `.why`), so moving a note into a fold does not restyle it.
- No `display` is set on `.fold` that would defeat `[hidden]`; if one is set, a
  `.fold[hidden]` twin is added beside it (`CLAUDE.md`, "`all: unset` defeats
  the `hidden` attribute").
- The pattern is recorded in `.interface-design/system.md` under Component
  patterns, in the same change.

## What must never be inside a fold

Readings, figures, units, labels, verdicts, em dashes and their absence reasons,
blocking reasons, refusals and their remedies (spec FR-001, FR-002).
