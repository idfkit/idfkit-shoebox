# Data Model: Community Translation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Every entity below is a frozen class instance or a validated JSON record. None reaches `params`, the link, a kept scheme or the IDF.

## Message (source)

One piece of English copy the sheet writes. Declared once, at the declaration that owns it or in a `src/say/<module>.js` table.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | Stable, dotted, lower camel segments: `control.wallR.note`, `main.hoursSolved`. Derived from the declaration's key for declaration fields; written by hand in `say/` tables. Unique across the catalogue (asserted at load). |
| `english` | string | Valid in the MF1 subset ([contracts/message-syntax.md](./contracts/message-syntax.md)). |
| `where` | string | Where it appears, in the sheet's own words: `"Fabric strip · wall resistance · note fold"`. Required. |
| `budget` | Budget id \| null | A `copy.js` budget id, or null for strings no budget governs (a table head). |
| `keeps` | derived | The arguments, numerals, names and `<b>` pairs in `english`. Computed by the parser, never typed. |
| `names` | string[] | Literal names in `english` that must survive untranslated: schema `Type:Name`, standard names, "EnergyPlus". Declared. |
| `args` | `{ [name]: string }` | What each argument holds, for context. Required when `english` has arguments. |
| `quote` | boolean | True for verbatim quotations (TM59 Table E.1, PHI and LETI passages). A quotation is listed in the catalogue for context but is not translatable. |
| `note` | string \| undefined | The translator's note: what the term means here, what not to confuse it with. |
| `stays` | boolean | True for refusals, absence reasons, blocking reasons and verdicts. Feeds the publication rule (R13). Set from the declaring field (`reason`, `refusal`, `withdrawn`, absence, `Refusal`) rather than by hand. |

**Validation at load**: `id` unique; `english` parses; `budget` exists in `BUDGETS`; English within its budget (as today). **Validation at extraction**: every `say(SAY.x)` and every `data-say` in `index.html` names an existing id (FR-033).

## Catalogue (`src/l10n/en.json`)

The generated, committed list of every `Message`, sorted by `id`, one entry per line block. Schema in [contracts/catalogue-format.md](./contracts/catalogue-format.md). It is never read by the page: the page reads the declarations. It exists for contributors and the checker. **Invariant**: byte-identical to what `scripts/l10n-extract.mjs` produces from the current source.

## Language (`src/l10n/locales/<tag>.json`, header)

| Field | Type | Rule |
| --- | --- | --- |
| `tag` | BCP 47 | The file's name. Shortest tag that does the job (`fr`, `pt-BR`, `zh-Hans`). |
| `endonym` | string | The language's name in itself, as the chooser shows it. |
| `direction` | `"ltr"` | Only `ltr` accepted while right-to-left is deferred; an `rtl` file is checked but never published. |
| `measure` | `{ kind: "words" }` \| `{ kind: "graphemes", perWord: number }` | How budgets are counted (R6). |
| `reviewers` | GitHub login[] | At least two before the language may be published (R4). |
| `contributors` | `{ name: string, github?: string }[]` | Credited by the name each chose; absent means not credited (FR-027). |
| `glossary` | `{ [english term]: string }` | Preferred terms; inconsistency is a warning. |

**Derived at build** (`virtual:l10n-manifest`, never committed): `coverage` = current translatable entries ÷ translatable catalogue entries; `staysCurrent` = every `stays` entry current; `published` = `coverage ≥ 0.90 ∧ staysCurrent ∧ reviewers.length ≥ 2 ∧ direction = "ltr"`.

## Translation (an entry in a language file)

| Field | Type | Rule |
| --- | --- | --- |
| key | Message id | Must exist in the catalogue, or the entry is an error (orphan). |
| `text` | string | MF1 subset; same arguments, numerals (by value), names and `<b>` pairs as `english`; plural keys within the language's categories; fits the budget under the language's measure. |
| `from` | string | The English this was translated from. |

**State**, computed on every load and every check, never stored:

```text
             catalogue has id?
                  │ no ──────────────► orphan (checker error)
                  │ yes
        entry exists in language?
                  │ no ──────────────► missing   → English, marked
                  │ yes
        from === catalogue english?
                  │ no ──────────────► outdated  → English, marked; listed by l10n:status
                  │ yes
                  └──────────────────► current   → lettered in the language
```

There is no "approved" state on disk: every entry on `main` reached it through a pull request that passed the second-speaker rule (R4).

## Refusal

`class Refusal extends Error`, frozen after construction.

| Field | Rule |
| --- | --- |
| `said` | A `Message` with `stays: true`. |
| `args` | The arguments `said` needs, figures already lettered. |
| `message` | English, formatted from `said` in English, for the console, the trail and the report. |

The sheet letters `say(refusal.said, refusal.args)` in the active language. Programmer errors remain plain `Error`.

## Lettering state

`src/l10n/index.js` holds the active `Language` (or English) beside `units.js`'s active system, with one subscriber, as `onSystemChange` has. `letteringKey()` returns `[system(), language()]` and is the only key a lettered-string cache may use (asserted by a harness that greps for `system()` as a cache key outside it).

## Relationships

```text
Declaration (controls.js, schemes.js, …) ──owns──► Message ◄──owns── say/<module>.js table
                                                     │
                                       extraction    ▼
                                               Catalogue (en.json)
                                                     │ id
                                                     ▼
                     Language (<tag>.json header) ──holds──► Translation (text, from)
                                │                                   │
                                └──── manifest at build: coverage, published
Refusal ──said──► Message (stays)
```
