# Contract: The Language Chooser

## Placement and form

- A native `<select id="language">` in the title block, beside the units selector, reachable in every state of the sheet, at 390 px and by keyboard (FR-001). A native select is chosen over a custom menu because it is accessible on every platform and needs no design-system pattern beyond the existing input surface.
- Its accessible name is the message `chooser.language.label`, translated like everything else, and additionally `"Language"` in English as a `lang="en"` visually hidden suffix, so a reader who chose a language they cannot read can find the way back.
- Each `<option>` shows the language's endonym and carries `lang="<tag>"`. English is `English`. No flags.
- In a development build (`npm run dev`), every language file appears, with unpublished ones suffixed `· unpublished` and `qps` listed last as `Pseudo`.

## Below the chooser (one line, in view, never a fold)

| State | Line |
| --- | --- |
| English | nothing |
| Any published language | `chooser.credit`: "translation by @alice-fr, @bruno-fr", each handle a link to `https://github.com/<handle>`, handles joined by `Intl.ListFormat`. Always in view while the language shows (FR-027). |
| Published, below 100% | `chooser.coverage`: e.g. "92 % traduit · Aider à traduire le reste" linking to `docs/translating.md` on GitHub (FR-023, FR-025) |
| Storage refused | `chooser.forgets`: "Will not be remembered in this browser" (FR-008) |
| A chunk failed to load or validate | `chooser.refused`, in the language showing and in English: the language and the reason. The sheet stays in the language it was in. |
| A remembered language was withdrawn | `chooser.withdrawn`, in English and in that language's own catalogue if still loadable: "Français is no longer offered: fewer than 90% of its strings are current." Sheet in English. |

Each line is within the `STANDING` budget.

## The untranslated mark

An untranslated or outdated string renders as its English inside `<span lang="en" class="untranslated">` followed by a small-capital `EN` in `--ink-3`. The mark is a glyph, not a colour, so it survives monochrome and is read by screen readers as "EN" (FR-030). Model text, engine text and quotations are `lang="en"` with **no** mark: they are not untranslated.

## Behaviour

1. **Switch**: await the chunk (R9), validate it, `setLanguage(tag)`, set `<html lang>`, persist, then `reletterSheet()`. No run, no `applyGeometry`, no stale marking (FR-003). On failure, nothing changes but the refusal line.
2. **Memory**: `localStorage['shoebox-language-v1']`, through `shelfStore`. On read, a value that is not a published tag (or `en`) is ignored and removed, and if it was a withdrawn language the withdrawn line is shown once.
3. **First visit**: RFC 4647 Lookup over `navigator.languages` against published tags plus `en`, both sides maximised with `Intl.Locale#maximize()`; English when nothing matches (FR-009).
4. **Never in the link, never in a kept scheme** (FR-010). A report body records `Language: <tag>` (FR-011).
5. **Announced**: the switch is announced through the existing polite live region, in the new language.

## Credits

The credit line is the translators' signature on their work, in the sense the title block's "drawn by" is the reader's: whoever is showing the sheet in French is reading Alice's and Bruno's French, and the line says so on the sheet itself, not in a fold. The handle list comes from `translators` in the language file through `virtual:l10n-manifest`; a handle is lettered verbatim, never translated. The About fold carries one sentence, in English and in the language, that translations are their translators' work and are reviewed by a second speaker, not by the maintainers.
