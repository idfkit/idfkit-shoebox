---

description: "Task list for Community Translation"
---

# Tasks: Community Translation

**Input**: Design documents from `specs/016-community-translation/`

**Prerequisites**: plan.md, spec.md, research.md (R1 to R19), data-model.md,
contracts/message-syntax.md, contracts/catalogue-format.md,
contracts/l10n-check.md, contracts/language-chooser.md, quickstart.md

**Tests**: The repository has no test runner and the spec does not ask for
TDD. Verification is by Node harnesses under the gitignored `.harness/`
directory, by `npm run l10n:check`, and by driving the page, as quickstart.md
§1 to §9 define. Verification tasks write or run those; no `tests/` tree is
created.

**Organization**: Tasks are grouped by user story so each story can be
implemented, verified and delivered on its own. Research R18's phasing holds
inside that grouping: infrastructure first (Phase 2), extraction module by
module (US1), and the chooser is offered in production only once the `qps`
walk finds no unaccented text.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, and no dependency on an
  incomplete task).
- **[Story]**: the user story the task belongs to (US1 to US5).
- Every description names the file it changes.

## Path Conventions

Single static web project. Run-time source under `src/` (new: `src/l10n/`,
`src/say/`), scripts under `scripts/`, CI under `.github/`, throwaway
harnesses under `.harness/`. Line numbers cited (from research.md's census at
`9452cc5`) are approximate and must be re-found before editing.

Two rules bind every task below:

- **English is byte-identical until the chooser changes it.** After any task
  in Phase 2 or US1, the English sheet's `innerText` and `aria-label`s at the
  four desks of T001 must equal the fixtures (quickstart.md §1).
- **The language reaches no IDF object, no link, no kept scheme, no run.**
  Nothing in this feature edits an applier in `src/model.js` or a key in
  `src/permalink.js`'s codec; `LINK_VERSION` stays `v1`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: capture what the feature must not change, and add the script
entry points, before any source file is touched.

- [ ] T001 Capture the English fixture from unmodified `main`: write `.harness/capture-sheet.mjs` (Playwright, `chromium.launch()`) that loads `npm run dev` at four desks (default; a turned box; Air on `network`; a TM59 room type, per quickstart.md §1), waits for the design-day solve, and writes `document.body.innerText` plus every `[aria-label]` value, in DOM order, to `.harness/fixtures/l10n-en-<desk>.json`. Record the four fragments in `.harness/fixtures/README.md`.
- [ ] T002 [P] Capture the model fixture: write `.harness/capture-model.mjs`, which imports `src/model.js` and `src/permalink.js`, builds the document at the same four desks (schema from `localBundle()` in `@idfkit/schemas/node`, `load('26.1.0')`), and writes each IDF and its `encodeState(...)` link to `.harness/fixtures/l10n-<desk>.idf` and `.harness/fixtures/l10n-links.json`.
- [ ] T003 [P] Add the npm scripts to `package.json`: `l10n:extract` (`node scripts/l10n-extract.mjs`), `l10n:check` (`node scripts/l10n-check.mjs`), `l10n:status` (`node scripts/l10n-status.mjs`), `l10n:carry` (`node scripts/l10n-status.mjs --carry`), `l10n:pseudo` (`node scripts/l10n-pseudo.mjs`). No new dependency, run time or development (Principle V).
- [ ] T004 [P] Create `src/l10n/locales/` with a `README.md` of three lines pointing to `docs/translating.md`, and add `src/l10n/locales/xx-*.json` and `src/l10n/locales/qps.json` to `.gitignore` (the verification fixture of quickstart.md and the generated pseudo-locale are never committed).

**Checkpoint**: both fixtures exist and were captured from unmodified `main`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the DOM-free message layer, the renderer, the active language,
figures in a language, the extractor, the loader and manifest, and the
pseudo-locale. After this phase the sheet still renders English byte for
byte, and a language file, if one existed, could be loaded and rendered.

**CRITICAL**: no user story work can begin until this phase is complete.

### The message layer

- [ ] T005 Create `src/l10n/message.js` (DOM-free, no dependency): a parser for exactly the grammar of contracts/message-syntax.md (`{name}`, `plural` with `=N` and the six categories and `#`, `select`, `<b>…</b>`, nesting at most 2, `other` required, no apostrophe quoting, any literal `{ } < >` refused) into a frozen AST, and `format(ast, args, tag)` that picks plural categories with `Intl.PluralRules(tag)` from the argument's numeric value (the `value` beside a lettered string, per the `#` rule), substitutes lettered strings, joins array arguments with `Intl.ListFormat(tag, { type: 'conjunction', style: 'long' })`, and keeps `<b>` as tokens. Every refusal throws naming the rule (`syntax`, `plural`, `markup`, depth). Export `keepsOf(ast)` returning the arguments, numerals (by value) and `<b>` count, for the checker and the loader.
- [ ] T006 Create the frozen `Message` class in `src/l10n/message.js` per data-model.md §Message: `id` (dotted, lower camel segments, validated), `english` (parsed at construction, so a malformed English message throws at load), `where` (required), `budget` (an id in `BUDGETS` of `src/copy.js` or `null`), `names`, `args` (required when `english` has arguments, and must list exactly them), `quote`, `note`, `stays`. Its English is checked against its budget at construction with `withinBudget`, as declarations are today.
- [ ] T007 Write `.harness/l10n-message.mjs`: round-trip every example in contracts/message-syntax.md; Polish `few`/`many` and Arabic `zero`/`two` selection; `#` with `1.0` selecting as lettered; ListFormat in `en` and `fr`; one refused fixture per rule (literal brace, `<i>`, depth 3, missing `other`, unknown category). Run it.
- [ ] T008 Create `src/l10n/verify.js` (DOM-free): `structural(english, text, tag, names)` returning a list of `{ rule, said }` for the rules the loader and the checker share: `syntax`, `arguments`, `figures` (numerals compared by value, so `0,64` matches `0.64`), `names`, `markup`, `plural` (keys within `Intl.PluralRules(tag).resolvedOptions().pluralCategories` or `=N`, `other` present), `outer-selector` (contracts/l10n-check.md), wording as in that contract's Output section.
- [ ] T009 Create `src/l10n/refusal.js`: `class Refusal extends Error` per data-model.md §Refusal, taking a `Message` that must have `stays: true` (throw otherwise) and its args, setting `message` to the English formatted from it (for the console, the trail and the report), and freezing itself after construction.

### The active language and lettering

- [ ] T010 Create `src/l10n/index.js` (DOM-free): the active language held beside `units.js`'s active system (`language()`, `setLanguage(tag, loaded)`, `onLanguageChange(fn)` with one subscriber, as `onSystemChange`); a registry `declare(messages)` that refuses a duplicate id at load; `say(message, args)` returning `{ text, english: boolean }` where `english` is true when the active language has no **current** entry (state machine of data-model.md §Translation: missing, outdated by `from !== english`, current) or the message is a `quote`; `sayEnglish(message, args)` for maintainer text; an unknown id throws; `letteringKey()` returning `[system(), language()]` as the one cache key for lettered strings; `capitalise(text, tag)` (first grapheme via `toLocaleUpperCase(tag)`).
- [ ] T011 Create `src/l10n/render.js` (the one DOM module of `src/l10n/`): `render(el, message, args)` writes a `say()` result as text nodes and `<b>` elements only (the approach of `changelog.js`'s `renderInline`), throws on any other markup even if the checker were bypassed (R10), and when `english` is true wraps the text in `<span lang="en" class="untranslated">` followed by a small-capital `EN` mark (contracts/language-chooser.md §The untranslated mark); `asModel(el, text)` letters model names, engine text and station names with `lang="en"` and no mark (R16); `fillStatic(root)` fills every `[data-say]` element's text and every `[data-say-label]` element's `aria-label` from its id.
- [ ] T012 [P] Add the `.untranslated` and `.en-mark` styles to `src/style.css` (small capitals, `--ink-3`, a glyph not a colour, FR-030) and record the mark in `.interface-design/system.md`.
- [ ] T013 Teach `src/units.js` the active language (R7): `figureIn` formats through a cached `Intl.NumberFormat(tag + '-u-nu-latn', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping })` with grouping only on read-only figures, never in a margin box; `parseIn` learns the decimal and minus signs from `formatToParts`, accepts the language's decimal sign and `.`, ASCII `-` and U+2212, and refuses a group sign or anything else whole. In `en` every output must be byte-identical to today's. `units.js` stays DOM-free; the link, `Days`, `Pattern`, kept schemes and the IDF never pass through it.
- [ ] T014 [P] Teach `src/copy.js` a per-language measure (R6): `words(text, measure)` counts whitespace tokens with markup stripped for `{ kind: 'words' }` and `Intl.Segmenter(tag, { granularity: 'grapheme' })` clusters divided by `perWord` for `{ kind: 'graphemes' }`; `withinBudget` takes the measure, defaulting to English words so every existing call site behaves as today. Add the `STANDING`-budgeted declarations for the chooser lines of contracts/language-chooser.md here or confirm `STANDING` exists.
- [ ] T015 Write `.harness/l10n-units.mjs` (quickstart.md §6 step 1): for `en`, `fr` and `de` number rules, every face of every numeric control in SI and IP, assert `parseIn(figureIn(v)) === v`, that `en` output equals today's for every face, that `figureIn` with grouping off never emits a group sign, and that `1.234,5` is refused in `de`. Run it.

### Extraction, loading and the manifest

- [ ] T016 Create `src/l10n/sources.js` (DOM-free): the ordered list of declaring modules and their exported message arrays, imported by the extractor under Node and by `src/main.js` at boot, so the page and the catalogue read one list. Start it empty apart from `src/l10n/chooser.js` (T018); each US1 extraction task adds its module.
- [ ] T017 Create `scripts/l10n-extract.mjs`: import `src/l10n/sources.js` under Node, collect every `Message`, scan `index.html` for `data-say` / `data-say-label` ids and `src/**/*.js` for `say(`/`render(` uses (FR-033), and write `src/l10n/en.json` per contracts/catalogue-format.md (sorted keys, two-space indent, LF, one trailing newline; fields `english`, `where`, `budget`, `names`, `args`, `note`, `stays`, `quote`). Exit 1 naming the id when a use names an id the sources lack, or when an id is declared and unused.
- [ ] T018 [P] Create `src/l10n/chooser.js` (DOM-free): the `Message`s of contracts/language-chooser.md (`chooser.language.label`, `chooser.credit`, `chooser.coverage`, `chooser.forgets`, `chooser.refused`, `chooser.withdrawn`, `chooser.unpublished`, `chooser.help`), each with `where`, `budget: 'STANDING'`, `args` and a translator's note; `refused` and `withdrawn` carry `stays: true`.
- [ ] T019 Add the lazy loader to `src/l10n/index.js` (R9): `import.meta.glob('./locales/*.json')`; `loadLanguage(tag)` awaits the chunk, validates the header (contracts/catalogue-format.md: `$language` with `endonym`, `direction`, `measure`, `reviewers`, `translators`, `glossary`) and every current entry with `verify.structural` (T008), and on any failure throws a `Refusal` (`chooser.refused`) naming the language and the reason, leaving the active language unchanged. English is never fetched.
- [ ] T020 Add the `virtual:l10n-manifest` plugin to `vite.config.js` (R13): read `src/l10n/en.json` and every `src/l10n/locales/*.json` at build; for each language emit `tag`, `endonym`, `direction`, `measure`, `translators`, `coverage` (current translatable entries ÷ translatable catalogue entries, `quote` entries excluded), `staysCurrent`, and `published = coverage ≥ 0.90 ∧ staysCurrent ∧ reviewers.length ≥ 2 ∧ direction === 'ltr'`, plus `why` naming each unmet condition; omit `qps` and unpublished languages from production builds, list all in dev. Commit nothing derived.
- [ ] T021 Create `scripts/l10n-pseudo.mjs` (R11): generate `src/l10n/locales/qps.json` from `src/l10n/en.json`, every Latin letter accented, each text padded by 40% and wrapped in `⟦ ⟧`, arguments, numerals, names and `<b>` untouched, `quote` ids skipped, `from` set to the English; run it from `predev` in `package.json` so the dev server always has a current `qps`, never from `prebuild`.

### The re-letter path

- [ ] T022 Extend `reletterSheet` in `src/main.js` (about line 3887) to run on `onLanguageChange` as well as `onSystemChange`, to call `fillStatic(document.body)`, to set `document.documentElement.lang`, and to call `console.js`'s `reletter()`; assert in a comment and by grep that it never calls `applyGeometry` (FR-003, R17). Re-key `noteCache` (about line 6777) and `chooserDrawn` (about line 10529) with `letteringKey()`, and any other cache keyed by `system()` (`grep -n "system()" src/*.js`).
- [ ] T023 Wire boot in `src/main.js`: import `src/l10n/sources.js` and `declare` every message array before the first render; render nothing differently in English.
- [ ] T024 Verify the foundation: run `npm run l10n:extract` (a catalogue holding only the chooser messages), rerun T001's capture and diff against the fixtures (identical), rerun `.harness/capture-model.mjs` (identical IDF and links), apply `applyModel` three times (byte-identical), and run `npm run build` to confirm `virtual:l10n-manifest` resolves with no languages.

**Checkpoint**: English unchanged; message layer, loader, manifest and `qps`
in place.

---

## Phase 3: User Story 1 - Read the sheet in my language (Priority: P1) 🎯 MVP

**Goal**: every word the sheet writes is lettered through the catalogue, and
one chooser re-letters the whole sheet in place, without a run.

**Independent Test**: quickstart.md §1, §2, §3 and §6: with `xx-test`
complete, walk the sheet at four desks; every word is in the language apart
from FR-005's exceptions; switching starts no run; switching back gives the
English fixture exactly; the IDF and link are byte-identical in `en`, `qps`
and `xx-test`.

### Declarations (about 1,100 strings; each task ends with `npm run l10n:extract` and the T001 diff clean)

- [ ] T025 [US1] Give the declaration classes in `src/controls.js` derived message ids (R2): `Scale`, `Selector`, `Bearing`, `Facade`, `Profile`, `Pattern`, `Boundary`, `Calendar`, `Days`, `Channel` and `Landmark` build a frozen `Message` for each translatable field (`label`, `note`, `phrase`, `blurb`, `zero`, `line`, `withdrawn`, each `options` label but never its `value`) with id `control.<key>.<field>`, `landmark.<key>.<mark>.<field>`, `channel.<id>.<field>`; `withdrawn`, `requires.reason` and blocking reasons get `stays: true`; a function-valued `requires.reason` becomes a message with arguments. `where` is built from the strip and control names. Export `MESSAGES` and add it to `src/l10n/sources.js`.
- [ ] T026 [US1] Route the readers of those fields in `src/controls.js` through `say()`: `formatValue`, `labelFor`, `phraseFor`, `Ruled.format` and `Scale.withdrawn`; replace its plural ternaries with `plural` messages; figures go in as lettered arguments (contracts/message-syntax.md rule 4).
- [ ] T027 [P] [US1] Extract `src/schemes.js`: standards' names as the sheet describes them, `label`, `why` (quoted passages of PHI and LETI marked `quote` with their source, the sentence around them translatable), `refusal` (`stays: true`), `Spec`/`Target`/`Unjudged` wording and verdicts (`stays: true`); export `MESSAGES`, add to `src/l10n/sources.js`.
- [ ] T028 [P] [US1] Extract `src/tm59.js` and `src/tm59.data.js`: criterion and category labels, verdict and count sentences (`stays: true`), absence reasons; TM59 Table E.1 text in `tm59.data.js` marked `quote: 'CIBSE TM59 (2017) Table E.1'`; export `MESSAGES`, add to `src/l10n/sources.js`.
- [ ] T029 [P] [US1] Extract `src/readings.js` and `src/views.js`: `Reading` and `Term` labels, `noun` kept apart from `label`, `ABSENCE` reasons (`stays: true`), `SeriesDef` and `View` labels, `Unavailable` reasons and remedies (`stays: true`); `Reading.format` and `Reading.change` letter through `units.js` in the language; export `MESSAGES`, add to `src/l10n/sources.js`.
- [ ] T030 [P] [US1] Extract `src/study.js`, `src/survey.js`, `src/pull.js` and `src/relief.js` copy into `src/say/survey.js` (DOM-free `Message` table): `Coverage` wording, measured / inferred / unsurveyed, `Gap` reasons (`stays: true`), isoline statements; route the modules through `say()`/`render()`; add to `src/l10n/sources.js`.
- [ ] T031 [P] [US1] Extract `src/units.js` unit words that are words, not symbols (`h`, `person`; FR-006: symbols never translate), `src/rates.js` and `src/bill.js` table heads and row names (rate table sources stay as published, R16), `src/bundle.js`, and `src/comfort.js`/`src/psychro.js`/`src/pmv.js` lettered labels into `src/say/sheet.js`; add to `src/l10n/sources.js`.

### Reader-facing errors become `Refusal`s (R15)

- [ ] T032 [P] [US1] Convert the ~50 reader-facing throws in `src/permalink.js` to `Refusal`s with messages in `src/say/permalink.js` (`permalink.refused.*`, `stays: true`, `budget: 'STANDING'`); `error.message` stays English; programmer errors stay plain `Error`. The codec itself, its keys and canonical text do not change.
- [ ] T033 [P] [US1] Convert the ~26 reader-facing throws in `src/schemes.js` to `Refusal`s (messages added to its `MESSAGES` from T027).
- [ ] T034 [P] [US1] Convert the ~25 throws in `src/source.js`, ~16 in `src/epw.js` and 3 in `src/weather.js` to `Refusal`s with messages in `src/say/weather.js`; `source.js` and `epw.js` stay DOM-free and network-free.
- [ ] T035 [US1] In `src/main.js`, letter every caught `Refusal` (`status`, `refuseLink`, the weather file gate, the scheme shelf) as `render(el, refusal.said, refusal.args)` and keep `refusal.message` for the trail and the error log; a plain `Error` is lettered as today. Depends on T032 to T034.

### Generated sentences (R14)

- [ ] T036 [US1] Rewrite `src/describe.js` with messages in `src/say/describe.js`: each paragraph shape a message with its selector outermost and whole sentences per branch (`describe.storeys` of contracts/message-syntax.md), compass and terrain words and selector phrases as messages with `select` where a language inflects, `series()` replaced by array arguments joined by `Intl.ListFormat`, sentence capitals by `capitalise()`; the sixty-word budget measured in the language; DOM-free. A sentence a language has not translated reads in English, marked, never half-translated.
- [ ] T037 [US1] Rewrite the trade sentence (`src/main.js` about lines 12095 and 12141) as `main.trade` in `src/say/main.js`, through `Reading.change` for the difference (CLAUDE.md, "A change in a reading is a difference too").

### Render-code copy

- [ ] T038 [P] [US1] Extract `src/console.js` into `src/say/console.js`: strip lines, fold heads, the study buttons' `aria-label`s (and `studySweeps` thunks replayed by `reletter()`), the patch bay, `buildControl` lettering; `reletter()` rebuilds strips and folds without rebuilding a host that contains a focused field (CLAUDE.md, the margin numbers).
- [ ] T039 [P] [US1] Extract `src/plate.js` into `src/say/plate.js`: view chooser labels, axis names (`suffixIn`, never `unitIn`), the reading-hour announcement, "AWAITING RUN", refusal and remedy text; `aria-label`s included.
- [ ] T040 [P] [US1] Extract `src/report-sheet.js`'s `COPY` (24 budgeted strings) into `src/say/report.js`, and split `HEADINGS` in `src/report.js` into a reader-facing label (translated) and a body heading (English, `sayEnglish`), so `.github/scripts/triage-apply.cjs` parses the body unchanged (FR-011). `report-sheet.js` loads before `main.js`: it must `declare` its own messages and work in English if the language layer never finishes booting.
- [ ] T041 [P] [US1] Turn `NOTES` in `src/tour.js` into messages in `src/say/tour.js` (meaning unchanged, so `shoebox-general-notes-v7` stays: no step is added to teach the chooser, FR-032) and replace the three `innerHTML` assignments (about lines 364, 374, 415) with `render()`.
- [ ] T042 [US1] Add `data-say` / `data-say-label` ids to every static text node, `aria-label` and the placeholder in `index.html` (~1,580 words), with the messages in `src/say/page.js` (including `<title>`); leave the English in the markup so the page reads before boot; mark the changelog host `lang="en"` (R16).
- [ ] T043 [US1] Extract `src/main.js` copy objects into `src/say/main.js`: `FOLD`, `FILE_SAYS`, `DOWNLOAD_LABEL`, `PHASES`, and the 165 `reason`s (`stays: true`); route their uses through `say()`/`render()`.
- [ ] T044 [US1] Extract the remaining `textContent` template literals of `src/main.js` (~255 sites) into `src/say/main.js`, a strip of the file at a time (title block, run log and status line, readings rail, balance rail, bill, register, E-02, weather picker and file gate, scheme shelf, About fold), turning each of the 32 plural ternaries into a `plural` message, and replacing the `innerHTML` at about line 288 with `render()`. Model names (constructions, materials, schedules, zones, surfaces), engine text and station names go through `asModel()` (FR-005).
- [ ] T045 [US1] Route the 20 `toLocaleString('en-US')` and 2 `en-CA` call sites (`grep -n "toLocaleString" src/*.js`) through `figureIn` in `src/units.js`, and date lettering through `Intl.DateTimeFormat` in the active language where the sheet letters a date (FR-006).

### The chooser

- [ ] T046 [US1] Add the chooser markup to the title block in `index.html` beside the units selector per contracts/language-chooser.md: a native `<select id="language">` with accessible name `chooser.language.label` plus a visually hidden `lang="en"` "Language", one line below it for the credit, coverage, forgets, refused and withdrawn states, all in view, never in a fold.
- [ ] T047 [US1] Style the chooser in `src/style.css` per `.interface-design/system.md` (input surface, hairline borders, a `[hidden]` twin for every class that sets `display`, wrapping at 390 px) and record the chooser and the line below it in `.interface-design/system.md`.
- [ ] T048 [US1] Wire the chooser in `src/main.js`: options from `virtual:l10n-manifest` plus English, each its endonym with `lang` set, no flags; on `change`, `await loadLanguage(tag)`, `setLanguage`, `reletterSheet()`, then announce the switch in the existing polite live region in the new language; on a `Refusal` show `chooser.refused` (in the language showing and in English) and change nothing else. No run, no `applyGeometry`, no `markStale` (FR-003); a run in flight lands in the new language with dimmed readings still dimmed.
- [ ] T049 [US1] Run the `qps` walk (quickstart.md §2): `npm run dev`, choose Pseudo, walk every strip, fold, reading, table, the seven plate views, a study, a survey, the general notes, the report slip and the About fold, at desktop and 390 px; fix every unaccented string by extending the extraction task that owns its module, and every clip or overflow in `src/style.css`. Record the walk in `.harness/fixtures/README.md`.
- [ ] T050 [US1] Build the `xx-test` fixture (quickstart.md Prerequisites) with `.harness/l10n-xx-test.mjs`: every English written back reversed word by word, arguments, figures, names and `<b>` kept, number rules of `fr`; and verify quickstart.md §1 step 2 (byte-identical IDF and links in `en`, `qps`, `xx-test` at four desks, and three applies byte-identical), §3 (switch `en` → `xx-test` → `en` during a run: no new run, readings dimmed, controls still, hash unchanged, second English snapshot equal to the fixture, switch under 200 ms, SC-002) and §6 steps 2 and 3 (`2,5` and `2.5` read as 2.5 m, `1.234,5` refused, link and IDF write `2.5`).

**Checkpoint**: the sheet can be read in any loadable language; production
still offers only English until a language is published (US5).

---

## Phase 4: User Story 2 - Contribute a language by pull request (Priority: P1)

**Goal**: a contributor with git can start, fill, check and preview a
language, and open a pull request that touches only that language's file,
with every defect named in words.

**Independent Test**: quickstart.md §5 (each defect refused with the rule
named, locally and in a fork pull request) and SC-003 (a first-time
contributor reaches a local preview of ten strings in under 30 minutes from
the sheet's link).

- [ ] T051 [US2] Create `scripts/l10n-check.mjs` (Node 22, no dependency) per contracts/l10n-check.md: arguments `[tag…]`; for every entry run `verify.structural` (T008) and the remaining errors, `budget` (under the file's `measure`, via `src/copy.js`), `orphan`, `quote`, `header`, `catalogue` (rerun extraction in memory, compare to the committed `src/l10n/en.json`), `unknown-id` and `unused-id`; warnings `outdated`, `glossary`, `identical`, `stays`; one line per finding in the contract's exact format, then a `summary` line per language (current, outdated, missing, stays, publishable); exit 1 on any error.
- [ ] T052 [US2] Add the history rules to `scripts/l10n-check.mjs`: `from` (the text must have been an English of that id in `git log -p -- src/l10n/en.json`), and, when `GITHUB_EVENT_PATH` names a pull request, `credit` (the author changes a `text` and is not in `translators`) and `scope` (a language file changed together with source code or another language's file, exempt under the `l10n-carry` label).
- [ ] T053 [P] [US2] Create `scripts/l10n-status.mjs`: `<tag>` lists missing and outdated ids, outdated ones with the old English (`from`) and the new side by side (FR-022); `--fill` writes skeleton entries with `from` set and `text` empty for every missing id (sorted, contract formatting); `--suggest` lists existing translations of identical English in that language (R19); `--prune` removes orphans; refuses `en` and `qps`.
- [ ] T054 [US2] Offer every language file in the dev chooser (FR-020): in `src/main.js`, when `import.meta.env.DEV`, list unpublished languages suffixed with `chooser.unpublished` and `qps` last as "Pseudo"; production builds list only published ones (`virtual:l10n-manifest`, T020).
- [ ] T055 [P] [US2] Create `.github/workflows/l10n.yml`: on `pull_request` touching `src/**`, `index.html` or `src/l10n/**`, read-only token, no secrets (fork-safe), checkout with `fetch-depth: 0`, `npm ci`, `npm run l10n:check`, `npm run build`, upload `dist/` as an artifact for a reviewer's `npm run preview` (R12). `preview.yml` is not changed.
- [ ] T056 [P] [US2] Create `.github/ISSUE_TEMPLATE/start-a-language.yml`: fields for the language (name and BCP 47 tag), two speakers' GitHub handles (both required), and a checkbox that they searched for an existing issue; title prefix `Start a language:`; no `labels:` the reader cannot apply (CLAUDE.md: never `labels=` in a new-issue address). Leave `.github/ISSUE_TEMPLATE/config.yml` with blank issues enabled.
- [ ] T057 [P] [US2] Write `docs/translating.md` (English, Diátaxis how-to): start-a-language issue for a new language (corrections go straight to a pull request); fork; `npm install`; `npm run l10n:status -- <tag> --fill`; reading an `en.json` entry (`english`, `where`, `budget`, `names`, `args`, `note`, `stays`, `quote`); the message rules of contracts/message-syntax.md for translators (plural categories of their language, keep `{args}` and figures, `0,64` is fine); `measure` for languages without spaces; `npm run l10n:check -- <tag>`; preview with `npm run dev` and the chooser; opening the pull request; second-speaker review; publication at 90% with every refusal and verdict current; credit "translation by @handle"; machine drafts allowed, the credited translator answers for them (FR-027a).
- [ ] T058 [P] [US2] Create a short root `CONTRIBUTING.md` that points translators to `docs/translating.md` and the start-a-language form, and states that code contributions follow `CLAUDE.md` (FR-023).
- [ ] T059 [US2] Link the sheet to the guide (FR-023): `chooser.help` beside the chooser in `index.html` / `src/main.js`, linking to `docs/translating.md` on GitHub; in view at 390 px.
- [ ] T060 [US2] Verify quickstart.md §5: one defect at a time in `xx-test`, `npm run l10n:check -- xx-test` exits 1 with one line naming language, id and rule for every row of the table (and `0,64` passes); then open a pull request from a fork carrying one defect and confirm `l10n` fails with the same line and needs no secrets. Time a dry run of `docs/translating.md` from the sheet's link to ten previewed strings (SC-003) and record it in `.harness/fixtures/README.md`.

**Checkpoint**: the contribution route works end to end; a language can be
submitted and previewed.

---

## Phase 5: User Story 3 - A language stays honest as the sheet changes (Priority: P2)

**Goal**: a changed English string never shows its old translation; the
reader sees coverage and an invitation to help; contributors see what
changed.

**Independent Test**: quickstart.md §4: change one string of each kind and
add one; build; each reads in English, marked, in every language, appears in
`l10n:status`, and coverage moved.

- [ ] T061 [US3] Add `--carry <id>` to `scripts/l10n-status.mjs` (R3): rewrite `from` to today's English for that id in every language file, for a maintainer English change that keeps the meaning; print each file touched; the pull request carries the `l10n-carry` label that exempts it from `scope` (T052).
- [ ] T062 [US3] Show coverage beside the chooser (FR-025): in `src/main.js`, while a published language below 100% is showing, letter `chooser.coverage` (percentage through `figureIn`, link to `docs/translating.md`) in view on the line below the chooser, in that language.
- [ ] T063 [US3] Handle withdrawal (spec edge case, contracts/language-chooser.md Behaviour 2): when the remembered or showing language is absent from the manifest's published list, letter the sheet in English and show `chooser.withdrawn` once, in English and in that language if its chunk still loads, naming the `why` from `virtual:l10n-manifest`.
- [ ] T064 [US3] Verify quickstart.md §4 steps 1 to 3 with `xx-test`: 20 missing and 20 outdated entries read in English with the `EN` mark and `lang="en"`, none shows stale text, `l10n:status -- xx-test` lists 20 and 20 with old and new English; change one `note` in `src/controls.js`, a strip line in `src/say/console.js`, a refusal in `src/say/permalink.js` and a step in `src/say/tour.js`, add one new message, run `l10n:extract`: each becomes outdated or missing everywhere, coverage drops, and `l10n:carry` restores the carried one. Revert the English changes.

**Checkpoint**: staleness is visible and never silent.

---

## Phase 6: User Story 4 - The choice follows the reader (Priority: P2)

**Goal**: the choice is remembered in the reader's browser, the first visit
follows the browser's languages, links never carry it, and reports record
it.

**Independent Test**: quickstart.md §7 steps 1 to 4.

- [ ] T065 [P] [US4] Create `src/l10n/match.js` (DOM-free, R8): RFC 4647 Lookup of `navigator.languages` against published tags plus `en`, both sides maximised with `Intl.Locale#maximize()`, so `zh-TW` meets `zh-Hant` and never `zh-Hans`, `fr-CA` meets `fr`; `en` when nothing matches. Write `.harness/l10n-match.mjs` with those cases and run it.
- [ ] T066 [US4] Remember the choice in `src/main.js`, mirroring the units choice (about lines 3863 to 4052): `shoebox-language-v1` through `shelfStore`; on read, a tag not published (or `en`) is ignored and removed, and a withdrawn one triggers T063; with no stored choice, `match.js` picks; when `shelfStore` is null, the switch works for the session and `chooser.forgets` shows (FR-008, FR-009).
- [ ] T067 [US4] Record the language in the report: `src/report.js` adds `Language: <tag>` to the body; the trail, the error log and the engine log stay English (`sayEnglish`, `refusal.message`); confirm `.github/scripts/triage-apply.cjs` parses a body made in `xx-test` unchanged (FR-011).
- [ ] T068 [US4] Verify quickstart.md §7: choose `xx-test`, reload, it persists; a private window with storage refused shows the forgets line and still switches; browser languages `fr-CA, en` and `zh-TW` resolve as T065 says; a link shared from `xx-test` is byte-identical to the English one and opens in the recipient's language; a kept scheme made in `xx-test` restores identically in English (FR-010); a report filed in `xx-test` carries `Language: xx-test`.

**Checkpoint**: the choice persists and never travels.

---

## Phase 7: User Story 5 - A language is published with care (Priority: P3)

**Goal**: a maintainer can publish a language they do not read from checks,
review state and coverage, and the translators are credited in view.

**Independent Test**: quickstart.md §8: the publication rule, the
second-speaker status and the credit line.

- [ ] T069 [P] [US5] Create `.github/CODEOWNERS` with a commented template line `src/l10n/locales/<tag>.json @idfkit/l10n-<tag>` and the rule that each language's line is added with its first pull request; record in `docs/translating.md` that the branch rule on `main` requires a code owner's review and `l10n / second speaker` (a maintainer setting, stated, not automated).
- [ ] T070 [US5] Add the `second speaker` job to `.github/workflows/l10n.yml` (contracts/l10n-check.md §The second-speaker status): on `pull_request` and `pull_request_review`, read-only token; for each changed language file, pass when a non-dismissed approving review comes from a login in that file's `reviewers` other than the author, or from a member of `@idfkit/l10n-<tag>`; otherwise fail naming the language and who may approve. Put the logic in `.github/scripts/second-speaker.cjs`.
- [ ] T071 [US5] Letter the credit (FR-027): in `src/main.js`, while a published language other than English shows, `chooser.credit` on the line below the chooser, handles from the manifest's `translators` lettered verbatim through `asModel()`, each a link to `https://github.com/<handle>`, joined by `Intl.ListFormat`; in view at 390 px, never in a fold; and one sentence in the About fold (`index.html` / `src/say/page.js`) that translations are their translators' work, reviewed by a second speaker and not by the maintainers.
- [ ] T072 [P] [US5] Add a "Translations" section to `README.md` listing published languages and their translators with all-contributors' "translation" convention (R13), and a maintainer's publication checklist to `docs/translating.md`: `l10n` green, `second speaker` green, `summary` line says publishable (FR-026, SC-007).
- [ ] T073 [US5] Verify quickstart.md §8: build with `xx-test` at 89%, 91%, 91% with one `stays` entry outdated, and with one reviewer; published only at 91% with all `stays` current and two reviewers, and `virtual:l10n-manifest`'s `why` names the condition otherwise; on a test pull request, an author's own approval leaves `second speaker` failing and a listed reviewer's passes it; a pull request whose author changes a `text` without being in `translators` fails `credit`; the credit line names every translator at 390 px.

**Checkpoint**: publication needs no reading of the language, and credit is
in view.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T074 [P] Add the l10n subsystem to `CLAUDE.md` (Other subsystems, one paragraph; Invariants that fail quietly: an unknown id throws; `letteringKey()` is the only cache key for lettered strings; no translated string reaches `innerHTML`; the language reaches no IDF, link or kept scheme; maintainer text uses `sayEnglish`; new copy needs a `Message` or the build fails) and the `l10n:*` scripts to Commands.
- [ ] T075 [P] Record the findings in `docs/design-notes.md` under a new section, "Every word the sheet says, in somebody else's language": the census figures, R1's choice of an MF1 subset over MF2 and why, R3's `from`, R6's 1.5 graphemes per word, R7's refusal of group signs, R13's publication rule, and anything the `qps` walk and T050 measured.
- [ ] T076 [P] Add a harness `.harness/l10n-cache-keys.mjs` that greps `src/` for a cache keyed by `system()` outside `letteringKey()` and for `innerHTML` assignments, failing on either (data-model.md §Lettering state).
- [ ] T077 Run `npm run l10n:check` from `.github/workflows/check.yml` as well, so the load-time copy assertions and the catalogue check run on every push to `main`, not only on translation pull requests.
- [ ] T078 Verify quickstart.md §9: with the network panel open, switch through every language in a production `npm run build && npm run preview`; only same-origin content-hashed `.js` chunks, each once (FR-028).
- [ ] T079 Rerun the full English fixture diff (T001) and the model fixture (T002) one final time, run the four desks' IDFs through `load_model`, `validate_model`, `check_model_integrity` and `run_simulation`, and grep `eplusout.err` for "requested but not generated" (CLAUDE.md, Verifying changes).
- [ ] T080 [P] Add the feature to `CHANGELOG.md` under `[Unreleased]` / `Added`: the sheet can be lettered in a community-contributed language; how to contribute one.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none; T001 and T002 must run on unmodified `main`.
- **Foundational (Phase 2)**: after Setup. Blocks every story.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after Foundational. T051 to T058 can start beside US1;
  T060's checker rows need the US1 catalogue to be substantially extracted,
  and T059 needs the chooser (T046 to T048).
- **US3 (Phase 5)**: after US1 (marking and the chooser) and T053.
- **US4 (Phase 6)**: after US1's chooser (T048). Independent of US2, US3.
- **US5 (Phase 7)**: after US2 (workflow, guide) and T062/T063 for the line
  below the chooser.
- **Polish (Phase 8)**: after the stories that ship.

### Within US1

- T025 before T026 (same file, ids before readers).
- T032 to T034 before T035.
- T043 before T044 (same file, copy objects before literals); T037 after T043.
- T046 before T047 and T048; T048 before T049 and T050.
- T049 (the `qps` walk) is the gate before the chooser is offered in
  production (R18).

### Parallel opportunities

- **Setup**: T002, T003, T004 together after T001 starts.
- **Foundational**: T012, T014 and T018 beside the message layer; T008 and
  T009 after T005/T006; T013 then T015.
- **US1**: T027 to T031 (five different modules), T032 to T034 (three files),
  and T038 to T041 (four files) each run together; `src/main.js` tasks (T035,
  T037, T043, T044, T048) are sequential.
- **US2**: T053, T055, T056, T057, T058 together.
- **US4**: T065 beside T066's reading of the units code.
- **US5**: T069 and T072 together.
- **Polish**: T074, T075, T076, T080 together.

### Parallel example: User Story 1 declarations

```text
Task: "T027 Extract src/schemes.js"
Task: "T028 Extract src/tm59.js and src/tm59.data.js"
Task: "T029 Extract src/readings.js and src/views.js"
Task: "T030 Extract study/survey/pull/relief into src/say/survey.js"
Task: "T031 Extract units words, rates, bill, comfort into src/say/sheet.js"
```

Each adds its module to `src/l10n/sources.js`: merge those one-line edits in
turn.

### Parallel example: User Story 2

```text
Task: "T053 scripts/l10n-status.mjs"
Task: "T055 .github/workflows/l10n.yml"
Task: "T056 .github/ISSUE_TEMPLATE/start-a-language.yml"
Task: "T057 docs/translating.md"
Task: "T058 CONTRIBUTING.md"
```

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 on unmodified `main`.
2. Phase 2. English must be unchanged (T024).
3. Phase 3, module by module, each extraction a mergeable pull request whose
   English diff is empty (R18 step 2).
4. Stop at T049 and T050: every word goes through the catalogue, `qps` shows
   nothing unaccented at four desks, and a switch runs nothing.

### Incremental delivery

1. **US2** next (also P1): without it no language reaches anyone but the
   maintainers. The chooser, the guide and `CONTRIBUTING.md` ship together
   (R18 step 3).
2. **US3** and **US4** (P2), in either order.
3. **US5** (P3) before the first language is published.
4. The first language is the community's (SC-008, R18 step 4); no task here
   writes one.

### Open items that block merge

- T049: the `qps` walk must find no unaccented reader copy before the chooser
  is offered in production.
- T050: SC-002's 200 ms must be measured, not estimated.
- T069 / T070: the branch rule requiring a code owner and `second speaker` is
  a repository setting a maintainer must apply.
