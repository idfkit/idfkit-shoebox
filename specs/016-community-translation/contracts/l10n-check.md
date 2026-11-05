# Contract: `npm run l10n:check`

`scripts/l10n-check.mjs`, Node 22, no dependencies. The same script runs locally and in `.github/workflows/l10n.yml` on every `pull_request` (fork-safe: no secrets, read-only token). Exit code 1 on any error; warnings print and exit 0.

## Invocation

```text
npm run l10n:check                 # every language
npm run l10n:check -- fr pt-BR     # only these
npm run l10n:status -- fr          # missing and outdated, old and new English side by side
npm run l10n:status -- fr --suggest   # plus existing translations of identical English
npm run l10n:status -- fr --fill      # add skeleton entries for every missing id
npm run l10n:carry -- <id>         # maintainer: English changed without changing meaning
npm run l10n:extract               # maintainer: regenerate en.json
```

## Output

One line per finding, in words, naming language, id and rule (FR-021):

```text
error   fr  control.wallR.note      figures: the English has 0.64, the translation does not
error   fr  main.hoursSolved        plural: "few" is not a plural category of fr (one, many, other)
error   de  tour.units.step         budget: 19 words, STEP allows 15
error   zh  control.roofR.label     budget: 9 graphemes = 6.0 words at 1.5 per word, LABEL allows 4
warn    fr  control.heatSP.label    glossary: "setpoint" is "consigne" in the glossary, here "point de consigne"
summary fr  1,204 of 1,318 current (91.4%) · 3 outdated · 111 missing · stays: all current · publishable
```

## Errors (block the pull request)

| Rule | Fails when |
| --- | --- |
| `syntax` | The text is not in the subset of [message-syntax.md](./message-syntax.md). |
| `arguments` | The set of `{name}`s differs from the English. |
| `figures` | A numeral in the English (compared by value, so `0.64` and `0,64` match) is missing from the translation, or the translation adds one. |
| `names` | A declared `names` entry is missing from the translation. |
| `markup` | The `<b>` pairs differ in count, or any other tag appears (FR-013). |
| `plural` | A branch key is not an `=N` or a category of the language per `Intl.PluralRules(tag).resolvedOptions().pluralCategories`; `other` is missing; or a category the English depends on is unreachable. |
| `outer-selector` | A `plural` or `select` has sentence text beside it at the top level (R1 rule 1). |
| `budget` | Over the entry's budget under the language's `measure` (FR-015, FR-016). |
| `orphan` | The id is not in the catalogue. |
| `quote` | A translation is given for a `quote` id. |
| `from` | `from` has never been an English text of that id (checked against the git history of `en.json`, so the workflow checks out with full history; catches a hand-edited `from`). |
| `header` | `$language` missing, `direction` not `ltr`/`rtl`, `measure` malformed, `endonym` empty. |
| `scope` | A pull request changes a language file together with source code or with another language's file. Maintainer pull requests labelled `l10n-carry` (from `l10n:carry`) are exempt. |
| `catalogue` | `src/l10n/en.json` differs from `l10n:extract`'s output. |
| `unknown-id` | Source code calls `say()` or `data-say` with an id the catalogue lacks (FR-033). |
| `unused-id` | The catalogue holds an id nothing uses. |

## Warnings (listed, never blocking)

| Rule | Raised when |
| --- | --- |
| `outdated` | `from` differs from today's English. |
| `glossary` | A glossary term's English appears in the source and its glossary translation does not appear in the text. |
| `identical` | `text` equals `english` (often right for "TM59", "PMV"). |
| `stays` | A `stays` entry is missing or outdated (blocks publication, not merge). |

## The second-speaker status

A separate job, `l10n / second speaker`, runs on `pull_request_review` and `pull_request`. For each language file changed, it passes when the pull request has an approving review, not dismissed, from a login in that language's `reviewers` other than the author, or from a member of `@idfkit/l10n-<tag>`. Otherwise it fails naming the language and who may approve. It is a required check on `main`.
