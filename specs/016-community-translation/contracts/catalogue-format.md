# Contract: Catalogue and Language Files

Both are UTF-8 JSON, two-space indent, keys sorted, LF line endings, one trailing newline. Sorted keys and one entry per block keep concurrent pull requests for different strings from conflicting.

## `src/l10n/en.json`: the source catalogue (generated, committed)

Written only by `npm run l10n:extract`. A pull request whose committed file differs from extraction fails `l10n:check`. Contributors read it; they never edit it.

```json
{
  "control.wallR.note": {
    "english": "Thermal resistance of the opaque wall, written to Material:NoMass Thermal Resistance. …",
    "where": "Fabric strip · wall resistance · note fold",
    "budget": "CONTROL_NOTE",
    "names": ["Material:NoMass"],
    "note": "Resistance, not conductance. Keep 'R-' where it appears."
  },
  "main.hoursSolved": {
    "english": "{warnings, plural, =0 {…} one {…} other {…}}",
    "where": "Status line, after a run",
    "budget": null,
    "args": { "hours": "count, lettered", "seconds": "figure", "warnings": "count" }
  },
  "tm59.criterionA.why": {
    "english": "…",
    "where": "Overheating fold · criterion a",
    "budget": "BLOCK",
    "quote": "CIBSE TM59 (2017) Table E.1"
  },
  "permalink.refused.notANumber": {
    "english": "The link gives {key} as {value}, which is not a number.",
    "where": "Status line, when a link is refused",
    "budget": "STANDING",
    "stays": true
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `english` | yes | The source message. |
| `where` | yes | Where on the sheet it appears. |
| `budget` | yes (may be `null`) | `copy.js` budget id. |
| `names` | no | Literal names that must survive untranslated. |
| `args` | when the message has arguments | Each argument and what it holds, for context. |
| `note` | no | Translator's note. |
| `stays` | no | `true` for refusals, absence and blocking reasons, verdicts. |
| `quote` | no | The source of a verbatim quotation. Present means not translatable. |

## `src/l10n/locales/<tag>.json`: one language (edited by contributors)

```json
{
  "$language": {
    "endonym": "Français",
    "direction": "ltr",
    "measure": { "kind": "words" },
    "reviewers": ["alice-fr", "bruno-fr"],
    "contributors": [{ "name": "Alice Martin", "github": "alice-fr" }, { "name": "Bruno L." }],
    "glossary": { "setpoint": "consigne", "design day": "jour de dimensionnement" }
  },
  "control.wallR.note": {
    "text": "Résistance thermique de la paroi opaque, écrite dans Material:NoMass Thermal Resistance. …",
    "from": "Thermal resistance of the opaque wall, written to Material:NoMass Thermal Resistance. …"
  },
  "main.hoursSolved": {
    "text": "{warnings, plural, =0 {…} one {… # avertissement} other {… # avertissements}}",
    "from": "{warnings, plural, =0 {…} one {…} other {…}}"
  }
}
```

- `$language` sorts first and is the only key that is not a catalogue id.
- `measure.kind` is `words` or `graphemes`; `graphemes` requires `perWord` (Chinese starts at `1.5`, Japanese at `2.0`).
- An entry for a `quote` id is an error. An entry for an id not in the catalogue is an error (orphan); `l10n:status --prune` removes orphans.
- `from` is copied from `english` at the moment of translating. `l10n:status --fill <tag>` writes skeleton entries with `from` set and `text` empty for every missing id; an empty `text` counts as missing and is not an error.
- A file may not be added for `en` or `qps`.
