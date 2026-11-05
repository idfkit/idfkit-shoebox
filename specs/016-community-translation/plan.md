# Implementation Plan: Community Translation

**Branch**: `016-community-translation` (developed on `feature/happy-ramanujan-o9wlps`) | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-community-translation/spec.md`

## Summary

One chooser re-letters every word the sheet writes, the way the units selector re-letters every figure, without touching the model, the link or a run. Translations arrive as pull requests that edit one JSON file per language; a dependency-free checker refuses any translation that drops a figure, adds markup or overruns a budget, a second speaker approves it, and a language is published once 90% of it, and every refusal and verdict in it, is current.

The approach, in dependency order:

1. **A DOM-free message layer, `src/l10n/`.** A ~150-line interpreter for a strict subset of ICU MessageFormat 1 (arguments, `plural`, `select`, `<b>`) over `Intl.PluralRules` and `Intl.ListFormat`; the active language held like the active unit system; a renderer that builds text nodes and `<b>` only, never `innerHTML`. No run-time dependency (R1, R10).
2. **English stays declared once.** Declarations in `controls.js` and its siblings keep their English fields and gain IDs derived from their own keys. Render-code literals move into frozen `Message` tables in DOM-free `src/say/<module>.js`, the `COPY` pattern of `report-sheet.js` made general. Extraction writes the committed source catalogue, `src/l10n/en.json`, with each string's location, budget, keeps and note (R2).
3. **One file per language, `src/l10n/locales/<tag>.json`.** Each entry stores the English it was made from; a translation whose English has changed is shown as English, marked, never as itself (R3). Lazy, content-hashed chunks; English is never fetched (R9).
4. **`units.js` letters figures in the language** (decimal sign, Latin digits, no grouping in a box) and `parseIn` reads back what it letters (R7).
5. **The checker and the review rule.** `npm run l10n:check` locally and in a fork-safe `l10n` workflow; CODEOWNERS per language plus a `second speaker` status for reviewers without write access (R4, R5). A `qps` pseudo-locale proves every string is translatable and fits at 390 px (R11).
6. **The chooser, the guide, the credits**, shipped only once `qps` finds no untranslatable text (R18).

Decisions and their alternatives are in [research.md](./research.md) (R1 to R19).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation. Node 22 for the harnesses, the extractor and the checker.

**Primary Dependencies**: none new at run time (Principle V). Platform APIs only: `Intl.PluralRules`, `Intl.NumberFormat` (`formatToParts`), `Intl.ListFormat`, `Intl.Locale` (`maximize`), `Intl.Segmenter` (graphemes, checker only). No i18n library, no `messageformat` polyfill: `Intl.MessageFormat` is TC39 Stage 1 (R1). No new development dependency either.

**Storage**: `localStorage`, one new key, `shoebox-language-v1`, holding a published language tag. Language files are static JSON in the repository, bundled as hashed chunks.

**Testing**: no test runner. `npm run l10n:check` (the same script in CI); Node harnesses over `message.js`, `units.js` and the extractor; the IDF and link byte-identity checks from specs 007 and 010 repeated per language; the `qps` walk at desktop and 390 px. See [quickstart.md](./quickstart.md).

**Target Platform**: static site, desktop and phone browsers that ship `Intl.PluralRules`, `ListFormat`, `Locale` and `Segmenter` (every browser the sheet already supports).

**Project Type**: single-page client-side application, plus build and CI scripts.

**Performance Goals**: a switch re-letters the whole sheet in under 200 ms at the default desk (SC-002) and starts no run. A language chunk is a few hundred kilobytes uncompressed, fetched once and cached by hash. English costs nothing new.

**Constraints**: the language reaches no IDF object, no link, no kept scheme and no run (FR-004); no translated string reaches `innerHTML` (FR-013); every figure, placeholder and name survives translation (FR-012); refusals, absence reasons and verdicts stay in view (FR-014); copy budgets hold in every language, by words or by graphemes (FR-015, FR-016); the feedback report body stays English because `triage-apply.cjs` parses it (FR-011).

**Scale/Scope**: about 4,000 reader-visible literals across 30 modules and ~1,580 words of static `index.html` text to bring under the catalogue; ~120 reader-facing thrown errors to convert to `Refusal`; 32 plural ternaries; 22 hard-coded number-locale sites; 4 `innerHTML` sites; 1 new directory (`src/l10n/`), ~12 new `src/say/` tables, 4 new scripts, 1 workflow, 1 CODEOWNERS file, 1 contributor's guide. 0 languages at merge: the first is the community's (SC-008).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.1. **Initial check: PASS.**

| Principle | Verdict | Basis |
| --- | --- | --- |
| I. Everything Runs in the Browser | PASS | A language is a hashed chunk of the site's own build; choosing one requests nothing else (FR-028, R9). The choice lives in `localStorage`. The first-visit default reads `navigator.languages`, a platform value. |
| II. Deterministic and Shareable | PASS | The principle already names locale among what MUST NOT reach the document. The language never reaches the IDF, the link or a kept scheme, verified byte for byte per language (SC-001). Link canonical text, `Days` and `Pattern` keep `.` and English grammar (R7, R16). No `LINK_VERSION` bump: no key, default or range moves. |
| III. Read It Back Off the Model | PASS | English stays at its declaration; IDs are derived from declaration keys, never typed twice (R2). The catalogue is generated from the declarations and checked against them, so it cannot drift. Names read off the document are lettered as the document holds them, not translated (FR-005). |
| IV. No Silent Fallbacks | PASS, with a stated mark | An untranslated or outdated string reads in English **with a visible mark** and `lang="en"`, and the coverage is stated beside the chooser, so the substitution is never silent (FR-017, FR-025). An unknown ID throws. A language chunk that fails to load or validate is refused whole, with its reason, rather than half-applied (R9). Typed numbers with a group sign are refused, not guessed (R7). |
| V. Only @idfkit/* at Runtime | PASS | No dependency, run time or development. The interpreter, renderer, matcher, extractor, checker and pseudo-locale are written here (R1, R5, R11). |
| VI. Latency Is the Interface | PASS | A switch re-letters through `reletterSheet` and never calls `applyGeometry`, so no solve starts and no study is cancelled (R17). Dimmed readings stay dimmed. |
| VII. Mobile-First and Responsive | PASS, with attention | Translations run longer; the 390 px fit is the `qps` walk's job (R11), budgets bind every language (R6), the chooser is a native select, and nothing about a language is on hover (FR-030). |

**Workflow gates.** Gate 1 and 3: the IDF is byte-identical in English, `qps` and every language file present, at four desk positions. Gate 2: no applier changes. Gate 4: the codec is untouched; its refusals become `Refusal`s and are round-tripped for message and ID. Gate 5: new load-time invariants: every declaration string has an ID; every ID used exists; no two IDs collide; every `letteringKey` cache uses both system and language (R17). Gate 6: the eight `NOTES` become messages; their meaning does not change, so the key stays `shoebox-general-notes-v7` unless a step is added to teach the chooser, in which case it becomes `v8` (FR-032). Gate 8: the chooser, the `EN` mark and the coverage line are recorded in `.interface-design/system.md` in the change that adds them. Gate 9 and 10: `Message`, `Language` and `Refusal` are frozen classes; comments carry the measurements (the census figures, the 1.5 ratio).

**Post-Phase 1 re-check: PASS, no new violations, Complexity Tracking empty.** Two judgements are worth naming. (1) The committed generated catalogue, `en.json`, looks like a second source of truth; it is not one, because the checker refuses any pull request where it differs from extraction, the same arrangement as `rates.data.js`. (2) Showing English inside a French sheet is a substitution, which Principle IV is wary of; it is permitted here because it is marked in place, stated in coverage, and refused for exactly the strings (refusals, reasons, verdicts) where a reader could not do without it (R13).

## Project Structure

### Documentation (this feature)

```text
specs/016-community-translation/
├── plan.md                    # This file
├── research.md                # Phase 0: census, decisions R1 to R19
├── data-model.md              # Phase 1: Message, Catalogue, Language, Translation, Refusal
├── quickstart.md              # Phase 1: how to verify
├── contracts/
│   ├── message-syntax.md      # The MF1 subset, exactly, with examples
│   ├── catalogue-format.md    # en.json and <tag>.json schemas
│   ├── l10n-check.md          # Every checker rule, error or warning, and its wording
│   └── language-chooser.md    # The control, the EN mark, coverage line, memory, default
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── l10n/
│   ├── message.js        # NEW. DOM-free MF1-subset parser and formatter (R1)
│   ├── render.js         # NEW. Lettered message -> text nodes and <b>; EN mark (R10, R16)
│   ├── index.js          # NEW. Active language, say(), letteringKey(), lazy chunk loader (R9, R17)
│   ├── match.js          # NEW. RFC 4647 Lookup over maximised tags (R8)
│   ├── en.json           # NEW, generated and committed. The source catalogue (R2)
│   └── locales/          # NEW. One file per language, edited by contributors
│       └── <tag>.json
├── say/                  # NEW. DOM-free Message tables for render-code copy (R2)
│   ├── main.js  console.js  plate.js  survey.js  tm59.js  describe.js  …
├── units.js              # figureIn / parseIn take the language (R7)
├── copy.js               # words() gains a per-language measure (R6)
├── controls.js           # declarations gain derived IDs; formatValue/labelFor/phraseFor via messages
├── describe.js           # messages with outer selectors; Intl.ListFormat (R14)
├── main.js               # SAY tables, chooser wiring, reletterSheet, Refusal lettering
├── console.js  plate.js  tour.js  report-sheet.js  report.js  …   # copy via say(); innerHTML removed
├── permalink.js  schemes.js  source.js  epw.js  weather.js       # reader-facing throws -> Refusal (R15)
index.html                # data-say IDs on static text; chooser markup
scripts/
├── l10n-extract.mjs      # NEW. Declarations + SAY tables -> src/l10n/en.json
├── l10n-check.mjs        # NEW. The checker (contracts/l10n-check.md)
├── l10n-status.mjs       # NEW. Missing/outdated per language, --suggest, carry
└── l10n-pseudo.mjs       # NEW. qps, dev only
vite.config.js            # virtual:l10n-manifest plugin (R13); qps only in dev
.github/
├── CODEOWNERS            # NEW. src/l10n/locales/<tag>.json @idfkit/l10n-<tag>
└── workflows/l10n.yml    # NEW. check + build + dist artifact, + second-speaker status
CONTRIBUTING-l10n.md      # NEW. The contributor's guide (FR-023)
.interface-design/system.md  # chooser, EN mark, coverage line
CLAUDE.md, docs/design-notes.md  # the l10n subsystem, its invariants
```

**Structure Decision**: single project, as today. New run-time code lives in `src/l10n/` (DOM-free except `render.js`) and `src/say/` (DOM-free tables), so Node harnesses import the real code, as `units.js` and `readings.js` already allow. Contributors touch only `src/l10n/locales/<tag>.json`.

## Complexity Tracking

No constitution violations. Nothing to justify.
