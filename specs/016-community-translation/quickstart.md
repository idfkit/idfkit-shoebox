# Quickstart: Verifying Community Translation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

There is no test runner. Each scenario below is a Node harness in the scratch directory, a checker run, or a walk of the page. Harnesses import the real modules (`src/l10n/message.js`, `src/l10n/index.js`, `src/units.js`, `src/model.js`), which stay DOM-free.

## Prerequisites

```bash
npm install
npm run dev
```

A fixture language for verification only, `src/l10n/locales/xx-test.json` (never committed), made with `npm run l10n:status -- xx-test --fill` and filled by a script that writes each English back reversed word by word, keeping arguments, figures and `<b>`. It gives a complete, structurally valid language with no translator. Delete it afterwards.

## 1. English is unchanged (step 1 of R18, and after every extraction pull request)

1. Before and after the change, at the default desk and three others (a turned box, Air on `network`, a TM59 room type), capture `document.body.innerText` and every `aria-label` in English. **Expect**: identical, apart from the chooser itself once it ships.
2. Build the IDF at the same four positions with the language set to `en`, `qps` and `xx-test`. **Expect**: byte-identical IDFs and byte-identical links in all three (FR-004, SC-001). Apply three times: byte-identical (gate 2).

## 2. Every string is translatable and fits (FR-033, FR-015, SC-006)

1. `npm run dev`, choose **Pseudo** (`qps`). Walk every strip, fold, reading, table, plate view, study, survey, the general notes, the report slip and the About fold, at desktop width and at 390 px.
2. **Expect**: every word on the sheet is accented and inside `⟦ ⟧`, except model names, engine text, station names, quotations and the changelog, which are `lang="en"` with no mark. Anything unaccented is a string that escaped the catalogue: a defect.
3. **Expect**: nothing clips, wraps out of its row or scrolls sideways at 390 px.

## 3. Switching re-letters and runs nothing (US1, FR-003, SC-002)

1. With a run in flight and readings dimmed, switch `en` → `xx-test` → `en`.
2. **Expect**: no new run in the run log, readings stay dimmed, controls do not move, `location.hash` unchanged. The second English snapshot equals the first.
3. In the performance panel, time the switch from `change` to the last mutation. **Expect**: under 200 ms at the default desk.

## 4. Untranslated and outdated strings (US3, FR-017)

1. Delete 20 entries from `xx-test`, and change `from` on 20 others.
2. **Expect**: those 40 strings read in English, each followed by the `EN` mark and inside `lang="en"`; none shows its stale text. `npm run l10n:status -- xx-test` lists 20 missing and 20 outdated, with old and new English for the latter.
3. Change one English `note` in `controls.js` and run `npm run l10n:extract`. **Expect**: in every language the entry becomes outdated; `npm run l10n:carry -- <id>` makes it current again everywhere.

## 5. The checker refuses what it must (US2, FR-012, FR-013, FR-016, SC-004)

Make one defect at a time in `xx-test` and run `npm run l10n:check -- xx-test`. **Expect**: exit 1 and a single line naming the language, id and rule.

| Defect | Rule named |
| --- | --- |
| Drop `{hours}` from `main.hoursSolved` | `arguments` |
| Change `0.64` to `0.46` in a landmark note | `figures` |
| Write `0,64` for `0.64` | none: passes |
| Add `<i>` or `<img src=x onerror=…>` | `markup` |
| Add a `few` branch in a `words` language whose plural categories lack it | `plural` |
| Put a `STEP` message at 20 words | `budget` |
| Set `measure` to `graphemes`, `perWord: 1.5`, and a `LABEL` at 9 characters | `budget` |
| Translate a `quote` id | `quote` |
| Leave `en.json` stale after editing a declaration | `catalogue` |
| Add `say(SAY.notThere)` in `main.js` | `unknown-id` |

Open a pull request from a fork with one such defect. **Expect**: the `l10n` workflow fails with the same line; it needs no secrets.

## 6. Figures and margin boxes in a language (FR-006)

1. Harness: for every published language and `xx-test` mapped to `fr` number rules, for every face of all 87 numeric controls in SI and IP, assert `parseIn(figureIn(v)) === v`.
2. In the page, in French, type `2,5` and `2.5` into the height box. **Expect**: both read 2.5 m and the box letters `2,5 m`. Type `1.234,5`. **Expect**: refused whole; the box puts the model's value back.
3. **Expect**: the link still writes `2.5`; the IDF still writes `2.5`.

## 7. Memory and default (US4, FR-008, FR-009, FR-010)

1. Choose `xx-test`, reload: it persists. Private window with storage refused: switch works, the "will not be remembered" line shows.
2. Set the browser's languages to `fr-CA, en`: first visit opens in French if `fr` is published, otherwise English. `zh-TW` with only `zh-Hans` published: English, not Simplified Chinese.
3. Share a link from French; open in a browser that chose English. **Expect**: English, same desk, link byte-identical to one made in English.
4. File a report in French. **Expect**: the body is English, contains `Language: fr`, and `.github/scripts/triage-apply.cjs` parses it unchanged.

## 8. Publication (US5, FR-024 to FR-027)

1. Build with `xx-test` at 89% coverage, then 91%, then 91% with one `stays` entry outdated, then with one reviewer. **Expect**: published only at 91% with all `stays` current and two reviewers; `virtual:l10n-manifest` says why otherwise.
2. On a test pull request changing `xx-test.json`, approve as the author, then as a listed reviewer. **Expect**: `l10n / second speaker` fails, then passes.
3. **Expect**: beside the chooser, in view at 390 px, "translation by @handle, …" names every translator in the language file, each a link to their GitHub profile. A pull request whose author changes a `text` without being in `translators` fails the `credit` rule.

## 9. No new requests (FR-028, Principle I)

With the network panel open, switch through every language. **Expect**: only same-origin, content-hashed `.js` chunks, each once.
