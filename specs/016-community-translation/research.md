# Research: Community Translation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-05

Two inputs: a census of the English the sheet writes today (read off the repository at `9452cc5`), and a survey of how community-translated projects work, checked against primary sources on 2026-11-05. Each decision below names what was chosen, why, and what was set aside. Claims about other projects carry their source; anything marked *(inference)* is reasoning, not an observed practice.

## The census, in brief

| Where | How much | Shape |
| --- | --- | --- |
| `controls.js` | ~776 literals | Typed declarations: 400 `label`, 260 `note`, 144 `Landmark` (`label`, `phrase`, `note`), 33 `options`, 24 `zero`, 19 `line`, 18 `blurb`, 27 `withdrawn` |
| `main.js` | ~987 literals | Template literals into `textContent` (255 sites), 165 `reason`, copy objects `FOLD`, `FILE_SAYS`, `DOWNLOAD_LABEL`, `PHASES` |
| `console.js`, `plate.js` | ~370, ~337 | Composed in render code; 38 `aria-label` between them |
| `schemes.js`, `tm59*.js`, `survey.js` | ~306, ~316, ~110 | `label`, `why`, `refusal`; part paraphrase, part verbatim quotation |
| `report-sheet.js`, `tour.js`, `describe.js` | ~109, ~95, ~70 | `COPY` (24 budgeted strings), 8 `Note`s, a token-composed paragraph |
| Other modules | ~500 | `readings.js`, `views.js`, `study.js`, `units.js`, `source.js`, `epw.js`, `rates.js`, `bundle.js`, … |
| `index.html` | ~1,580 words | Static body text, 8 `aria-label`, 1 placeholder, `<title>`, `og:` meta |
| Thrown errors shown to readers | ~120 | `permalink.js` 50, `schemes.js` 26, `source.js` 25, `epw.js` 16, `weather.js` 3, surfaced through `status` and `refuseLink` |

About 4,000 reader-visible literals and no lookup between any of them and the page. 32 plural ternaries, no `Intl.PluralRules`, no `Intl.ListFormat`. 20 `toLocaleString('en-US')` and 2 `en-CA` call sites. `words()` in `copy.js` counts whitespace tokens; 59 `withinBudget` call sites throw at load. `tour.js:364,374,415` and `main.js:288` assign `innerHTML` from copy. `index.html` hard-codes `lang="en"` and nothing sets it. Preview builds skip forks (`preview.yml`), and no workflow runs the load-time assertions.

## R1. Message syntax: a hand-written subset of ICU MessageFormat 1

**Decision.** Messages are written in a strict subset of ICU MessageFormat 1: `{name}` arguments, `{n, plural, =0 {…} one {…} few {…} other {…}}` with `#`, `{x, select, a {…} other {…}}`, nesting at most two deep, and literal `<b>…</b>`. No apostrophe quoting: a literal `{`, `}` or `'`-as-escape is refused by the checker. Plural categories come from `Intl.PluralRules`; every figure is formatted in code (by `units.js`) and passed in as a string, so messages hold no number, date or currency skeletons. The interpreter is a DOM-free module of roughly 150 lines, `src/l10n/message.js`, with no dependency.

**Rationale.**
- MessageFormat 2 is stable as a specification (CLDR 47 moved it to Stable in March 2025; UTS #35 Part 9 in CLDR 49, 2026-10-21, calls itself "a stable document"), but `Intl.MessageFormat` is still at TC39 Stage 1 ([tc39/proposals, ecma402](https://github.com/tc39/proposals/blob/main/ecma402/README.md)). Using MF2 today means the `messageformat` polyfill at run time, which Principle V forbids.
- MF1's `plural` and `select` are what the composed sentences need: ICU advises the selector at the outermost level with **a full sentence in each branch** ([ICU user guide](https://unicode-org.github.io/icu/userguide/format_parse/messages/)), which is how a language reorders a sentence. That advice becomes a checker rule (R5).
- ICU's apostrophe quoting is the one well-known trap of MF1, and it bites French and Italian hardest. Dropping it costs nothing: no message on this sheet needs a literal brace.
- The subset maps one-to-one onto MF2's `.input`/`.match` and `{#b}…{/b}` markup, so a later move to `Intl.MessageFormat`, once it ships in browsers, is a mechanical conversion *(inference)*.

**Alternatives considered.**
- *Fluent*: the best linguistics (required `*` default variant, terms, localizer comments; [Fluent guide](https://projectfluent.org/fluent/guide/selectors.html)), but its runtime is a package, and a hand-written FTL parser is several times the code of an MF1 subset.
- *gettext PO with `ngettext`*: plurals by count only, no `select`, no reordering inside one message; the composed sentences would still need an interpolator.
- *Flat strings with `${}`-style holes and no plural*: cannot say "1 warning" and "2 warnings" in Polish or Arabic, which FR-007 requires.

## R2. Where the English lives: declared once, at its declaration

**Decision.** English stays where it is declared, which is what Principle III asks of a label string. Two homes:

1. **Declarations keep their fields.** `Scale`, `Selector`, `Landmark`, `Channel`, `Note`, `Target`, `Criterion`, `Reading`, `Quantity`, `Budget`-checked `COPY` objects and the rest keep `label`, `note`, `phrase`, `blurb`, `why`, `zero`, `withdrawn` in English. Each translatable field gets a stable ID derived from the declaration's own key and field name (`control.wallR.note`, `landmark.wallR.studCavity.phrase`), so nothing new is typed by hand and a rename of a key is a rename of every ID under it.
2. **Render-code copy moves to message tables.** Every literal composed in render code (`main.js`, `console.js`, `plate.js`, `survey.js`, `tm59.js` notes, `describe.js`) moves into a frozen table of `Message` declarations in a DOM-free module beside it, `src/say/<module>.js`, each entry carrying its English, where it appears, its budget and its translator's note. `main.js` imports `SAY` from `src/say/main.js` and letters `say(SAY.hoursSolved, { n, s, warnings })`. This is the `COPY` pattern `report-sheet.js` already uses, made general.

A build script, `scripts/l10n-extract.mjs`, imports every declaring module under Node (they are DOM-free, or become so: the message tables are) and writes the **source catalogue**, `src/l10n/en.json`: one entry per ID with the English and its context. The file is generated and committed, like `src/rates.data.js`, because contributors read it on GitHub; the checker refuses a pull request whose committed catalogue is not what extraction produces.

**Rationale.**
- "Never put user facing text directly in code" ([Home Assistant developer guide](https://contributors.home-assistant.io/translate/guides/developers/)) is the right rule for render code, where today a literal sits beside a `toFixed`. It is the wrong rule for `controls.js`, where the English *is* the declaration and moving it to a JSON file would make two sources of one control.
- Stable semantic IDs rather than English-as-key: English-as-key turns every typo fix into a rename across every language. Staleness is detected by R3 instead.
- A generated, committed catalogue gives contributors FR-019's context in one file without a development setup for reading, and keeps a single source: the declarations.

**Alternatives considered.** *Move all English into `en.json`*: violates Principle III for declarations and turns `controls.js` into a file of IDs. *`t('id', 'English')` inline at each call site* (Chromium GRIT style): keeps English at the call site but leaves context, budget and keeps scattered through 13,000 lines of `main.js`, where nobody reviewing a translation can find them.

## R3. Staleness: each translation stores the English it was made from

**Decision.** Each entry in a language file is `{ "text": "…", "from": "<the English it translates>" }`. A translation is **current** only when its `from` equals today's English byte for byte. Anything else is outdated, and an outdated translation is treated as missing: the sheet letters the English, marked (FR-017). `npm run l10n:status -- fr` lists missing and outdated entries and prints old and new English side by side (FR-022). When a maintainer changes English without changing its meaning (a typo, a curly quote), `npm run l10n:carry -- <id>` rewrites `from` in every language in the same pull request, so translations survive a change that does not need them redone.

**Rationale.**
- Chromium fingerprints translations by English text, so editing the text orphans them and they fall back to English ([Chromium UI localization](https://www.chromium.org/developers/design-documents/ui-localization)); gettext's `msgfmt` drops fuzzy entries by default ([msgfmt(1)](https://tribblix.org/man/man1/msgfmt.html)); Weblate puts a changed source in its own "Needs rewriting" state ([Weblate workflows](https://docs.weblate.org/en/latest/workflows.html)). All three refuse to show a translation of a sentence the source no longer says, which is FR-017.
- Mozilla's rule for when a string needs a new identifier, a change in meaning but not a typo ([Firefox Fluent review](https://firefox-source-docs.mozilla.org/l10n/fluent/review.html)), is what `l10n:carry` lets a maintainer state.
- Storing the English rather than a hash costs a few kilobytes and lets the status listing show the diff, which a hash cannot.

**Alternatives considered.** *A hash in place of `from`*: smaller, but the contributor cannot see what changed. *Per-file source commit* (MDN's `l10n.sourceCommit`, [CONTRIBUTING](https://github.com/mdn/translated-content/blob/main/CONTRIBUTING.md)): far too coarse for 4,000 strings, and known to produce false "outdated" flags.

## R4. Second-speaker approval: CODEOWNERS plus a reviewer check

**Decision.** Each language file is owned in `.github/CODEOWNERS` by a team, `@idfkit/l10n-<tag>`, and the branch rule requires a code owner's review. GitHub already refuses an author's approval of their own pull request ([GitHub docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews)), and stale approvals are dismissed on a new push. For speakers without write access, the language file lists `reviewers` by GitHub login, and a required status, `l10n / second speaker`, reads the pull request's approving reviews with a read-only token and passes when an approval comes from a listed reviewer other than the author. A language opens only with two named speakers.

**Rationale.** MDN maps each locale directory to a team ([MDN CODEOWNERS](https://github.com/mdn/translated-content/blob/main/.github/CODEOWNERS)); Kubernetes requires "at least two contributors to begin a localization" because authors cannot approve their own work ([k8s localization](https://kubernetes.io/docs/contribute/localization/)). Code-owner approvals count only from accounts with write access ([GitHub: about code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)), which is why the status check exists *(inference)*. The maintainer publishing the language reads two green checks and a coverage figure (FR-026), not the language.

**Alternatives considered.** *CODEOWNERS alone*: excludes reviewers without write access, which is most volunteers. *A single coordinator per language* (PEP 545): one person becomes the bottleneck and the second speaker is no longer guaranteed.

## R5. The checker: one Node script, local and in CI

**Decision.** `scripts/l10n-check.mjs`, no dependencies, run as `npm run l10n:check` and in a new workflow `.github/workflows/l10n.yml` on `pull_request` (no secrets, so it runs for forks). Rules split as Pontoon splits them ([Pontoon docs](https://pontoon.mozilla.org/docs/localizer/translate/)): **errors** fail the check, **warnings** are listed and pass. Full rule list in [contracts/l10n-check.md](./contracts/l10n-check.md). In brief:

- *Errors*: syntax outside the subset (R1); an argument, figure, name or `<b>` pair present in the English and missing from the translation, or the reverse (FR-012, FR-013); plural keys outside `Intl.PluralRules(tag).resolvedOptions().pluralCategories`, or no `other`; a selector not at the outermost level; a budget overrun under the language's measure (R6, FR-015, FR-016); a `from` that names no English the catalogue has ever held; a committed `en.json` that differs from extraction; an ID used in code and missing from the catalogue (FR-033); the language file touching another language.
- *Warnings*: a glossary term translated inconsistently; a translation identical to its English (often fine: "PMV", "TM59"); outdated entries.
- *Figure parity* is checked on numerals as the English writes them, so a note's "0.64 W/ft²" must reappear with its digits; a language whose decimal sign is a comma writes "0,64", and the checker compares numbers, not strings.

The same workflow runs `npm run build` on the fork's code, so a translation that breaks the page is caught before review, and uploads `dist/` as an Actions artifact a reviewer can open locally (R12).

**Rationale.** `formatjs verify --structural-equality` ([FormatJS CLI](https://formatjs.github.io/docs/tooling/cli/)) covers part of this, but not budgets, figures in prose, glossary or `from`, and would be a second parser of the subset. One script checks exactly this sheet's rules, and the load-time assertions in `copy.js` and the declarations finally run in CI.

## R6. Budgets in every language

**Decision.** Every budget in `copy.js` keeps its meaning (a glance stays a glance) and gains a measure per language, declared in the language file:

- `words` (the default): `words()` as today, whitespace tokens with markup stripped. French, German, Portuguese, Polish.
- `graphemes`: grapheme clusters by `Intl.Segmenter(tag, { granularity: 'grapheme' })` divided by a per-language ratio. Chinese starts at 1.5 characters per English word (translators' range 1.35 to 1.8; [anycount](https://anycount.com/WordCountBlog/word-count-in-oriental-languages)); Japanese has no published ratio we trust and starts at 2.0, recalibrated from its first reviewed strings.

Budgets bind translations in the checker (an error, so it cannot reach `main`) and in `npm run dev`; in a production build a loaded language is not re-measured, since a throw mid-render would turn a copy defect into a broken sheet (the same reasoning `copy.js` records for `asserted: false`). The 390 px fit (FR-015, SC-006) is a layout question words cannot answer, and is checked by the pseudo-locale walk (R11).

**Rationale.** Word segmentation of CJK by `Intl.Segmenter` uses dictionary data that differs by engine and ICU version ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/segment)), so a gate built on it would pass in one CI image and fail in the next. Grapheme counts are stable. Short strings expand most (200 to 300% under 10 characters; [W3C, text size in translation](https://www.w3.org/International/articles/article-text-size)), so a percentage allowance on top of the English budget would be wrong at both ends; the budget stays the English one.

## R7. Figures and margin boxes in a language

**Decision.** `units.js` stays the one place a figure is lettered, and gains the active language beside the active system. `figureIn` formats through a cached `Intl.NumberFormat(tag + '-u-nu-latn', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping })`: Latin digits always (right-to-left is deferred, and the sheet's figures are engineering figures), the language's decimal sign, and grouping only on read-only figures, never in a margin box. `parseIn` learns the language's decimal and minus signs from `formatToParts`, accepts **both** the language's decimal sign and `.` (unambiguous because a box never groups), accepts ASCII `-` and U+2212, and refuses a group sign or anything else whole. The 20 `toLocaleString('en-US')` and 2 `en-CA` sites go through it. The link, `Days` and `Pattern` canonical text, kept schemes and the IDF never pass through it and keep `.`.

**Rationale.** There is no number parsing in ECMA-402 ([tc39/proposals](https://github.com/tc39/proposals/blob/main/ecma402/README.md)); `formatToParts` gives the signs ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/formatToParts)). `1.234` is ambiguous in German if grouping is allowed, so refusing a group sign in a box is No Silent Fallbacks applied to input. French groups with U+202F, which nobody can type, which is another reason boxes do not group. The harness assertion `parse(format(v)) === v` over all 87 faces in both systems (spec 010) is extended to every published language.

## R8. Choosing and remembering a language

**Decision.** Mirror the units choice exactly (`main.js:3863` to `4052`): `shoebox-language-v1` in `localStorage` through the existing `shelfStore` probe, a whitelist against published languages on read, and a first-visit default by **RFC 4647 Lookup** over `navigator.languages`, each tag and each candidate maximised with `Intl.Locale#maximize()` so `zh-TW` meets `zh-Hant` and not `zh-Hans`. English when nothing matches. `document.documentElement.lang` is set on every switch. The chooser is a native `<select>` in the title block beside the units selector, each option its endonym from the language file with `lang` set on the option, no flags ([W3C: language selectors](https://www.w3.org/International/questions/qa-navigation-select); [WCAG 3.1.2](https://w3.org/WAI/WCAG21/Understanding/language-of-parts)). See [contracts/language-chooser.md](./contracts/language-chooser.md).

**Rationale.** `Intl.LocaleMatcher` is Stage 1; Lookup over maximised tags is twenty lines. Language and units are independent (spec assumption), so they get two controls and two keys.

## R9. Loading: English bundled, each language a lazy chunk

**Decision.** English is not loaded: it is the declarations. Each published language is `import.meta.glob('./locales/*.json')` in `src/l10n/index.js`, which Vite splits into content-hashed same-origin chunks ([Vite features](https://vite.dev/guide/features.html)). A switch awaits the chunk, validates it (R5's structural rules, cheap) and then re-letters. A chunk that fails to load or validate refuses the language whole, keeps the sheet in the language it was in, and says why beside the chooser.

**Rationale.** Chunks resolve under every `--base` channel with no `BASE_URL` handling, are cached immutably by hash, and request nothing but the site's own files (FR-028, Principle I). Bundling every language eagerly would cost every reader every language. Excalidraw's loader is the model, except that its production `t()` returns an empty string for an unknown key ([i18n.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/i18n.ts)); here an unknown ID throws.

## R10. Markup: text nodes and one allowlisted element

**Decision.** No translated string reaches `innerHTML`. `src/l10n/render.js` turns a lettered message into DOM nodes: text, and `<b>` only, by the same approach as `changelog.js`'s `renderInline`. The four `innerHTML` sites (`tour.js:364`, `374`, `415`; `main.js:288`) are rewritten to build nodes. The checker refuses any other markup (FR-013), and the renderer throws on it, so a contribution cannot inject content even if the checker were bypassed.

**Rationale.** Translations arrive from forks by strangers. Two independent refusals cost one small function.

## R11. Proving every string is translatable: the pseudo-locale

**Decision.** A development-only language, `qps` (never published, absent from production builds), generated from `en.json` by `scripts/l10n-pseudo.mjs`: every letter accented, each string padded by 40% and wrapped in `⟦ ⟧`. Walking the sheet in `qps` at 390 px finds untranslatable text (anything unaccented) and overflow (anything clipped). It is the acceptance test for FR-033 and SC-006, and the gate before the chooser ships.

**Rationale.** Pseudo-localization is the standard way to find hard-coded strings and expansion faults before any translator arrives ([pseudo-localization](https://npmjs.com/package/pseudo-localization); Excalidraw keeps a dev-only test locale). Writing the transform here is twenty lines and no dependency.

## R12. Previewing a contribution

**Decision.** Three routes, in order of effort. (1) `npm run dev`, then choose the language: the dev build offers every language file whatever its coverage, marked "unpublished" (FR-020). (2) The `l10n` workflow uploads the fork's built `dist/` as an artifact, which a reviewer runs with `npm run preview`. (3) A maintainer may push the branch to this repository to get the usual `/<number>/` preview. No change to `preview.yml`: it deliberately skips forks because it holds deployment credentials.

## R13. Coverage, publication and credit, computed at build

**Decision.** A Vite plugin reads every language file at build and writes a virtual module, `virtual:l10n-manifest`, holding for each language its endonym, measure, coverage (current entries over catalogue entries), translators and whether it is published (coverage at least 90%, FR-025). Nothing derived is committed: Excalidraw commits its `percentages.json` and every translation pull request then touches it *(inference from [i18n.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/i18n.ts))*. Everything merged to `main` has passed R4, so every current entry is approved. A published language that falls below 90% after an English change is withdrawn by the next build, and a reader who had chosen it is told so (spec edge case). Translators are listed in the language file by GitHub handle and credited **in view**, beside the chooser, as "translation by @handle" whenever their language is showing (FR-027). The credit is the accountability mechanism: machine drafts are allowed without disclosure (FR-027a), and the named translators answer for the result, not the maintainers. The README also lists them with all-contributors' "translation" convention ([emoji key](https://allcontributors.org/reference/emoji-key/)).

**Additional rule.** A language is published only when, beyond 90% overall, **every refusal, absence reason, blocking reason and verdict** is current. Those are the strings FR-014 says must never leave view, and an English refusal in a French sheet is the one place a mixed sheet costs a reader the reason they need.

## R14. Composed sentences

**Decision.** `describe.js`, the trade sentence (`main.js:12095`, `12141`), the TM59 notes (`main.js:6797`) and the 32 plural ternaries are rewritten as messages whose selectors sit at the outermost level with whole sentences in each branch. Lists are joined by `Intl.ListFormat(tag, { type: 'conjunction' })`, replacing `series()`. Sentence-initial capitals use `toLocaleUpperCase(tag)` on the first grapheme, replacing the `'. '`-following uppercase pass. Compass words, terrain words and selector phrases become messages too, with `select` where a language inflects them. `describe.js` stays DOM-free: it receives the active catalogue from `src/l10n/index.js` as `units.js` receives the system.

**Rationale.** These are the only places the sheet assembles English grammar. A language that cannot say a generated sentence leaves that message untranslated and the sentence reads in English, marked (spec edge case), never a word salad.

## R15. Errors the reader sees

**Decision.** A thrown error that a reader can see becomes a `Refusal` (a subclass of `Error`) carrying a message ID and its arguments. `error.message` stays English, for the console, the trail and the report; the sheet letters `say(refusal.said, refusal.args)`. The ~120 reader-facing throws in `permalink.js`, `schemes.js`, `source.js`, `epw.js` and `weather.js` are converted; programmer errors stay plain `Error` in English.

## R16. What stays English, and how the sheet says so

- **Model text**: names read off the document, `Days` and `Pattern` canonical text (the link's grammar and `RunPeriodControl:SpecialDays` names), selector `value`s, and schema `Type:Name` citations inside notes. Lettered with `lang="en"` and no untranslated mark: they are not untranslated, they are the model's.
- **Engine text**: `eplusout.err` lines and versions.
- **Sources**: station names, rate table sources, and verbatim quotations (TM59 Table E.1 in `tm59.data.js`, the quoted parts of PHI and LETI `why`). A quotation is marked as such in the catalogue and cannot be translated; the sentence around it can.
- **Maintainer text**: the feedback report body, its `HEADINGS`, the trail and the error log. `triage-apply.cjs` parses headings and line prefixes, so the body must stay English. `HEADINGS` is split into a reader-facing label (translated) and a body heading (English). The report records `Language: fr` (FR-011).
- **The changelog**, rendered from `CHANGELOG.md`, stays English and is marked as such.

Untranslated reader copy is lettered with `lang="en"` and a visible small-capital `EN` after it (FR-030: not colour alone, not hover), from `src/l10n/render.js`.

## R17. The re-letter path

**Decision.** A language switch goes through the existing single re-letter path, `reletterSheet`, extended so that boot-time copy is re-lettered too: static `index.html` text carries `data-say="<id>"` and is filled from the catalogue at boot and on every switch, and the console's strips and folds are rebuilt by the same `reletter()` that replays `studySweeps` for units. Every cache keyed by `system()` (`noteCache`, `chooserDrawn`, and any added since) is keyed by `[system(), language()]` instead, through one helper, `letteringKey()`, so the next cache cannot forget one of the two. `reletterSheet` still never calls `applyGeometry` (FR-003).

## R18. Phasing

The feature ships in four steps, each mergeable on its own, with the chooser hidden until step 3:

1. **Infrastructure**: `message.js`, `render.js`, `src/l10n/index.js`, `units.js` gains a language, extraction, checker, pseudo-locale, workflow, CODEOWNERS. English renders byte-for-byte as before.
2. **Extraction, module by module**: declarations first (cheap, about 1,100 strings), then `index.html`, then render code (`main.js` last). Each module's pull request ends with no unaccented text from that module in `qps`.
3. **The chooser and the contributor's guide** (`docs/translating.md`, linked from a root `CONTRIBUTING.md`), once `qps` shows nothing unaccented at four desk positions.
4. **The first language**, by a contributor outside the maintainers (SC-008).

## R19. Practices adopted from hosted platforms, without the platform

| Platform practice | Here |
| --- | --- |
| String context, location, comments | `en.json` entry: `where`, `budget`, `keeps`, `note` (FR-019) |
| Untranslated / needs rewriting / approved | missing / outdated by `from` / merged after R4 |
| Blocking errors vs. advisory warnings | `l10n:check` errors and warnings |
| Translation memory | `l10n:status --suggest` lists existing translations of identical English in that language |
| Glossary / term base | `glossary` in each language file, consistency is a warning |
| String freeze before release | English changes merged no later than seven days before a `v*` tag; `main` → `/dev/` stays open |
| "Do not rely solely on machine translation" ([Python devguide](https://devguide.python.org/documentation/translations/translating/)) | Machine drafts allowed without disclosure (FR-027a); the translators are credited in view by handle and answer for the result, and a second speaker reviews it |
