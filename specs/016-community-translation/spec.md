# Feature Specification: Community Translation

**Feature Branch**: `016-community-translation`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "let the tool be translated by the community"

## Context

Every word on the sheet is English, and it is written into the code. Control names, the 260 control notes, the 144 landmark notes, strip lines, absence reasons, refusals, the general notes, the generated description, table heads and the title block are all English strings set where they are used. An engineer in Lyon, Stuttgart or São Paulo can now read every figure in the units they work in (feature 010), but still has to read every word in a second language. A student meeting building physics for the first time pays the most for that.

The maintainers cannot translate the sheet themselves, and a machine translation of a sentence like "Sealed below the stud cavity's published leakage" is a liability, not a translation. The people who can do it well are the sheet's own readers: practitioners who know both the language and the trade. This feature lets them.

It has two halves, and both are in scope:

1. **A reader can read the sheet in their language.** One choice re-letters every word the sheet says, the way feature 010 re-letters every figure.
2. **A reader can contribute a language.** Someone comfortable with a pull request can add a language, or improve one, by editing translation files in this repository, and see their work on the sheet before it is published, without the maintainers translating or checking the language themselves. A no-code route for translators who do not use GitHub is not required.

Four constraints from the constitution shape everything below.

- **The language is lettering, not model** (Principle II already names locale among what MUST NOT reach the document). The IDF, every run, every result and every link are byte-identical in every language. Names written into the document stay as the document holds them.
- **A translation may change the words, never the claims** (Principles III and IV). A figure, a citation, a verdict and a reason stated in English are the same figure, citation, verdict and reason in every language. A translator cannot introduce a number, drop one, or move a refusal into a fold.
- **The page makes no request it does not make today** (Principle I). Every language is published with the site. Choosing one fetches only the site's own files.
- **Every reading is readable at 390 px and the copy budgets hold** (Principle VII and `CLAUDE.md`'s copy budgets). Languages whose words run longer than English, or which do not separate words with spaces, are held to the same glance.

## Clarifications

### Session 2026-11-05

- Q: Must a translator be able to contribute without writing code or using GitHub? → A: No. Contributions arrive as pull requests that edit translation files in this repository; a hosted or no-code translation route is out of scope.
- Q: Is a language offered to readers while some strings are still English? → A: Yes, from 90% coverage. The sheet states the coverage beside the chooser, in that language, with a link to the contributor's guide; the remaining strings read in English, marked as untranslated.
- Q: Where on GitHub does the translation contributor's guide live? → A: A short root `CONTRIBUTING.md` that GitHub surfaces to every contributor, linking to the full step-by-step guide at `docs/translating.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the sheet in my language (Priority: P1)

A building engineer in France opens the sheet. It opens in French because their browser asks for French. Control names, strip lines, readings' labels, absence reasons, refusals, verdicts, the general notes, folds and the title block read in French. The figures are the same figures; the station name, the construction names the model carries and the engine's own error text are as they were. They switch to English to check a term against a colleague's screenshot, and every word re-letters in place without a run.

**Why this priority**: it is what a translation is for. Without it, no contribution reaches anyone.

**Independent Test**: with one complete language available, open the sheet at the default desk and at three other positions in that language. Walk every strip, reading, fold, table, drawing, study, survey and the general notes. Confirm every word the sheet writes is in that language apart from the exceptions this spec names, that switching language starts no run, and that switching back gives the English sheet exactly.

**Acceptance Scenarios**:

1. **Given** the sheet in English, **When** the reader chooses another available language, **Then** every word the sheet writes re-letters in place in that language, and the chooser names the language showing in that language's own name.
2. **Given** any desk, **When** the reader switches language in either direction, **Then** no run starts, no reading is marked stale, no control moves, and the IDF and the link are byte-identical to before the switch.
3. **Given** a run in flight with dimmed readings, **When** the reader switches language, **Then** the dimmed readings re-letter and stay dimmed, and the run lands in the chosen language.
4. **Given** the sheet in any language, **When** a reading is missing, **Then** it reads as an em dash with its absence reason in that language, never as an untranslated code or an empty space.
5. **Given** any language, **When** a value is typed into a margin box in the form that box letters it, **Then** it is read back unchanged, as in English.

---

### User Story 2 - Contribute a language by pull request (Priority: P1)

A Brazilian engineer who has used the sheet for a year wants their students to have it in Portuguese. They follow a link on the sheet to a contributor's guide, fork the repository, and start a Portuguese translation file beside the English one. Each string in the English file carries its budget, the figures it must keep and a note on what it means. They run the sheet locally in Portuguese, then open a pull request. The checks tell them exactly which strings dropped a figure or overran a budget, in words, before a person reviews anything. They touch no file but their language's.

**Why this priority**: it is the "by the community" half of the request. Without it the first story depends on the maintainers translating, which is the situation the feature exists to end.

**Independent Test**: a person who has not contributed before follows the guide from the sheet's link, starts a new language, translates a portion, previews it locally, and opens a pull request. Time it, and confirm each automated check names the offending string and the rule it broke, and that the pull request changes only that language's files.

**Acceptance Scenarios**:

1. **Given** a contributor who can use git and run the sheet locally, **When** they follow the sheet's link to contribute, **Then** they reach a guide that takes them from a fork to an open pull request for a new or existing language.
2. **Given** a string to translate, **When** the contributor reads it in the source file, **Then** they see the English source, where on the sheet it appears, the word budget it must fit, which figures and names it must keep, and any translator's note the maintainers wrote for it.
3. **Given** a translation in progress, **When** the contributor runs the sheet locally, **Then** they can letter it in their unpublished language, including one below the publication threshold.
4. **Given** a pull request carrying a translation, **When** a string drops, adds or changes a figure or a placeholder, carries markup the source does not, or overruns its budget, **Then** the check fails with the string named and the rule stated, and the same check can be run locally before pushing.
5. **Given** a new or changed language, **When** the contributor adds it, **Then** they edit only that language's translation files; no code file needs to change to add a language.
6. **Given** an existing language, **When** a contributor improves one string, **Then** the pull request changes that one string and nothing else.

---

### User Story 3 - A language stays honest as the sheet changes (Priority: P2)

The maintainers rewrite an absence reason and add a control. Next morning the Portuguese sheet shows the old reason nowhere: the changed string reads in English, marked as not yet translated, and the language's coverage dropped from 100% to 99.6%. The Portuguese contributors are told which strings changed, translate them, and the language is whole again.

**Why this priority**: the sheet changes weekly. A translation that silently keeps an outdated sentence states something the sheet no longer says, which is the failure Principle IV forbids. It depends on stories 1 and 2.

**Independent Test**: change the English source of one string of each kind (a strip line, a note, a refusal, a step) and add one new string. Build the site. Confirm each changed and new string reads in English in every other language, is marked untranslated, and appears in that language's to-do list for contributors, and that the coverage figure moved.

**Acceptance Scenarios**:

1. **Given** a translated string whose English source has since changed, **When** the sheet is lettered in that language, **Then** the string reads in English, marked as untranslated, and never in its outdated translation.
2. **Given** a language with untranslated strings, **When** a reader chooses it, **Then** the sheet states how much of it is translated and invites the reader to help, in that language.
3. **Given** a change to English strings, **When** it is published, **Then** contributors to every language can see which strings changed and what the change was.

---

### User Story 4 - The choice follows the reader (Priority: P2)

The engineer in France reloads tomorrow and the sheet opens in French. They send a link to a colleague in Toronto, who opens it in English, their own choice. The link says nothing about language. The colleague files a feedback report; the maintainer reading it sees which language the reader had showing and can open the same sheet in that language.

**Why this priority**: a choice that has to be made on every visit is a choice readers stop making. It depends on story 1.

**Independent Test**: choose a language, reload, reopen the browser, and confirm the sheet opens in it. Open a shared link in browsers that have never visited (one asking for an available language, one for an unavailable one, one for none) and in one that chose English. Repeat in a private window that remembers nothing. File a report and check it records the language.

**Acceptance Scenarios**:

1. **Given** a reader who chose a language, **When** they return in the same browser, **Then** the sheet opens in that language.
2. **Given** a reader who never chose, **When** they first open the sheet, **Then** it opens in the first language their browser asks for that the sheet offers, and in English if it offers none of them.
3. **Given** a link made in any language, **When** anyone opens it, **Then** it is byte-identical to the link the same desk made in English, and the recipient sees their own language.
4. **Given** a browser that will not let the page remember, **When** the reader switches, **Then** the switch holds for the session and the sheet says, beside the chooser, that it will not be remembered.
5. **Given** a feedback report, **When** it is filed, **Then** it records the language showing, and the maintainer-facing parts of the report (the trail, the error log, the engine log) are in English whatever language was showing.

---

### User Story 5 - A language is published with care (Priority: P3)

A maintainer who reads no Polish is asked to publish a Polish translation. They can see that every automated check passes, that a second Polish speaker has reviewed it, and which strings are still in English. They publish it without reading a word of Polish, and the contributors are credited on the sheet.

**Why this priority**: it protects the readers from a translation nobody checked, and the contributors from having their work go unacknowledged. It depends on story 2.

**Independent Test**: take one language through submission, peer review, the coverage threshold and publication. Confirm the maintainer's decision needed no reading of the language, and that the credit appears on the sheet.

**Acceptance Scenarios**:

1. **Given** a new language, **When** it has not reached the publication threshold, **Then** it is not offered to readers, though contributors can still preview it.
2. **Given** a translated string, **When** it has been written by one contributor and not yet approved by a second, **Then** it is not published.
3. **Given** a published language, **When** a reader looks for who translated it, **Then** the sheet names its contributors, as they asked to be named.

---

### Edge Cases

- **Names from the model**: construction, material, schedule, zone and surface names are read back off the document and stay as the document holds them. They are not translated, because translating them would make the sheet letter something the model does not hold.
- **The engine's words**: EnergyPlus error and warning text, quoted on the sheet or in a report, stays as the engine wrote it.
- **Citations**: a source's title, publisher, clause number and published figure stay as published. The sentence around them is translated.
- **Generated sentences**: the description and the trade sentence are built from parts at render time. Every language MUST be able to order those parts as its grammar needs, and a language that cannot yet say a generated sentence correctly shows that sentence in English, marked, rather than a word salad.
- **Plurals and gender**: "1 warning" and "2 warnings" generalise badly. A language with several plural forms (Polish, Arabic) MUST be able to give each.
- **Languages without spaces**: Chinese and Japanese do not separate words with spaces, so a word budget counted by spaces passes any length. Such a language is held to an equivalent length, not exempted.
- **Longer languages**: German and Finnish run about 30% longer than English. A string that fits its budget but not its place at 390 px is refused, not clipped.
- **Right-to-left languages**: the sheet is a drawing with a direction (axes, the axonometric, the balance rail). A right-to-left language is not offered until the sheet can be mirrored correctly; see Assumptions.
- **Numbers and dates**: a language decides its decimal separator, digit grouping and date order where the sheet letters a figure, and the margin boxes read figures typed in the form the language letters them. The link, the IDF and every kept scheme keep the language-neutral form.
- **Units**: a unit symbol (W/m²K, °F, kBtu/h) is the same in every language. A unit spelled as a word (`h`, `person`) MAY be translated.
- **Kept schemes and links made before this feature**: they open to the same desk; a kept scheme's name stays as the reader typed it.
- **Markup in a translation**: a translation carries text only, plus exactly the inline emphasis its source carries. Anything else is refused at submission, so a contribution cannot inject content into the page.
- **A language withdrawn**: if a published language falls below the threshold and is withdrawn, a reader who chose it sees English and is told, in English and in that language, why.
- **The contributor's guide and the station picker**: station names are from their source and are not translated; the guide itself is in English and MAY be translated like the sheet.

## Requirements *(mandatory)*

### Functional Requirements

**Reading the sheet in a language**

- **FR-001**: The sheet MUST offer one control that chooses the language the whole sheet is lettered in. It MUST be reachable from every state of the sheet, at 390 px, and by keyboard alone, and MUST name each language in that language.
- **FR-002**: Every word the sheet writes MUST be lettered in the chosen language: controls, strip lines, notes and landmarks' explanatory sentences, readings' labels, absence reasons, blocking reasons, refusals, verdicts, folds, table heads, drawings' lettering, the general notes, the generated description, studies, surveys, standards' names as the sheet describes them, accessible labels, and the page's declared language.
- **FR-003**: Switching language MUST re-letter in place without starting a run, marking a reading stale, moving a control, or changing the desk.
- **FR-004**: The language MUST NOT reach the model or the link. The IDF, every run, every result, every link and every kept scheme MUST be byte-identical in every language.
- **FR-005**: Names read off the model, the engine's own text, station names, and the titles, clause numbers and figures of citations MUST NOT be translated.
- **FR-006**: Where the sheet letters a figure, the chosen language MUST decide its decimal separator, digit grouping and date order, and a margin box MUST read back what it letters in that language. Unit symbols MUST be identical in every language.
- **FR-007**: A generated sentence MUST be composable in each language in that language's word order, with as many plural forms as the language has.

**Remembering and sharing**

- **FR-008**: The choice MUST be remembered in the reader's own browser and nowhere else. Where the browser refuses, the switch MUST work for the session and the sheet MUST say it will not be remembered.
- **FR-009**: A reader with no remembered choice MUST see the first language their browser asks for that the sheet offers, or English when it offers none.
- **FR-010**: Shared links MUST NOT carry the language. Every link made before this feature MUST open to the same desk.
- **FR-011**: A feedback report MUST record the language showing, and its maintainer-facing parts MUST stay in English.

**What a translation may and may not change**

- **FR-012**: Every figure, placeholder and name in an English string MUST appear in its translation, and a translation MUST NOT add one. A translation breaking this MUST be refused.
- **FR-013**: A translation MUST carry no markup its source does not carry.
- **FR-014**: A refusal, an absence reason, a blocking reason or a verdict MUST stay in view in every language; no language may move one into a fold or drop it.
- **FR-015**: Every translated string MUST fit the copy budget its English source is held to, measured in a way fit for that language (FR-016), and MUST fit its place at 390 px without clipping.
- **FR-016**: Languages that do not separate words with spaces MUST be held to an equivalent length budget rather than exempted from it.
- **FR-017**: A string with no current translation, including one whose English source changed after it was translated, MUST be lettered in English and marked as untranslated. An outdated translation MUST NOT be shown. A language MAY be offered while some strings are still English, under FR-025.

**Contributing**

- **FR-018**: Contributions MUST arrive as pull requests to this repository. Each language MUST live in its own translation files, kept apart from the code, so that adding or improving a language changes only that language's files. A no-code or hosted translation route is out of scope.
- **FR-019**: The English source file MUST carry, beside each string, where it appears on the sheet, its budget, the figures and names it must keep, and any translator's note, so a contributor needs no other document to translate it.
- **FR-020**: A contributor MUST be able to letter the sheet in their unpublished language when running it locally, whatever its coverage, without it reaching other readers.
- **FR-021**: Every pull request touching a translation MUST be checked automatically against FR-012, FR-013, FR-015 and FR-016, and each failure MUST name the string, the language and the rule broken, in words. The same check MUST be runnable locally.
- **FR-022**: When English strings change, contributors to every language MUST be able to list which strings in their language are missing or outdated, and see the English change behind each.
- **FR-023**: The contributor's guide MUST live at `docs/translating.md`, and a root `CONTRIBUTING.md` MUST link to it so GitHub shows the way to translators opening an issue or a pull request. The sheet MUST link to the guide from where the language is chosen, and from any language that is not fully translated.

**Publishing**

- **FR-024**: A translated string MUST be approved by a speaker of that language other than its translator before it is published.
- **FR-025**: The publication threshold is 90% coverage: the share of translatable strings that have a current, approved translation. A language MUST reach it before it is offered to readers, and MUST be withdrawn, with a stated reason, if it falls below it. While a published language is below 100%, the sheet MUST state its coverage beside the chooser, in that language, with the link to the contributor's guide of FR-023.
- **FR-026**: A maintainer MUST be able to decide whether to publish a language from the checks, the review state and the coverage alone, without reading the language.
- **FR-027**: The sheet MUST credit each language's contributors, by the name each contributor chose, or not at all if they chose not to be named.
- **FR-028**: Every language MUST be published with the site, and choosing one MUST request nothing beyond the site's own files.

**Constraints carried from the constitution**

- **FR-029**: The feature MUST add no run-time dependency beyond those the constitution permits. Contribution and build tooling is exempt.
- **FR-030**: Nothing about a language MAY be explained only on hover, and colour MUST NOT be the only mark of an untranslated string.
- **FR-031**: The chooser and the untranslated mark MUST follow the design system.
- **FR-032**: The general notes MUST be translatable like the rest of the sheet. If a step is added to teach the chooser, the notes, their call sites and the storage key MUST be updated as the constitution requires.
- **FR-033**: Every new piece of English copy added to the sheet after this feature MUST be translatable; a string that cannot be offered to translators MUST fail the build.

### Key Entities

- **Language**: a language the sheet can be lettered in. Has its own name, its writing direction, how its figures and dates are written, its plural rules, how its length budget is measured, its coverage, whether it is published, and its contributors.
- **Translatable string**: one piece of English copy the sheet writes. Has a stable identity, its English source, where it appears, its budget, the figures, placeholders and names it must keep, and an optional translator's note.
- **Translation**: one string in one language. Has its text, the English source it was made from (so a change to the source makes it outdated), its translator, and its review state.
- **Contributor**: a person who translates or reviews. Has the name they wish to be credited by, or none, and the languages they work in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With one language fully translated, a walk of the whole sheet at four desk positions finds no English word outside the exceptions of FR-005, and the IDF and the link are byte-identical to the English sheet at every position.
- **SC-002**: Switching language re-letters the whole sheet in under 200 ms at the default desk, with no run started.
- **SC-003**: A first-time contributor who can already use git goes from the sheet's link to a local preview of their first ten translated strings in under 30 minutes, following only the contributor's guide.
- **SC-004**: 100% of submissions that drop or add a figure, carry foreign markup or overrun a budget are refused by the automated checks before a person reviews them.
- **SC-005**: Within one publication of an English string changing, it reads in English in every language and no reader sees its outdated translation.
- **SC-006**: At 390 px, no translated string in any published language clips or pushes a reading off its row.
- **SC-007**: A maintainer publishes a language they do not read in under 10 minutes, from the checks and the review state alone.
- **SC-008**: At least one language other than English is published within three months of the feature shipping, translated by someone outside the maintainers.

## Assumptions

- English stays the source language. Every string is written in English first, and the maintainers write no other language.
- The first release supports left-to-right languages only. A right-to-left language is accepted for translation but not offered to readers until the sheet's drawings and layout can be mirrored; that work is a separate feature.
- The language and the unit system are independent choices. A French reader may letter in IP and an American reader in French; neither choice sets the other.
- Translators are trusted to translate, not to state facts. Review by a second speaker covers meaning; the automated checks cover figures, markup and budgets.
- Contributors can use git, fork the repository and run the sheet locally. Translators who cannot are served by finding a contributor who can, not by a separate tool.
- The same contribution route, a pull request, serves new languages and corrections to existing ones.
- Pull request previews today run only for branches in this repository, not for forks, so a contributor previews locally (FR-020). A maintainer MAY push a contributor's branch into the repository to get a published preview for a second speaker to review.
- Contributors are credited by name only with their consent; nothing else about them is published.
- The station index, design-day names, weather file contents and published rate tables are data from their sources, not copy, and are out of scope.
- `docs/design-notes.md`, `CLAUDE.md`, the README and code comments stay in English.
