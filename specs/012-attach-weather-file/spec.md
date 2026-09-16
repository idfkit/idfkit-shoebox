# Feature Specification: Attach a Weather File

**Feature Branch**: `012-attach-weather-file`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Using TM59 requires users to upload special epw files that need to be purchased (https://www.cibse.org/knowledge-research/weather-data/). If a UK engineer uses this app to explore efficient ways to meet TM59 targets, they need to be able to model the shoebox against the official weather data."

## Context

The sheet already computes CIBSE TM59's criteria, already writes TM59:2026 Appendix E's occupancy, equipment and lighting profiles into the model, and already prints, verbatim, the weather file the method asks for: the latest DSY1 for the site, 2050s, RCP8.5, 50th percentile, labelled `Zone Reference_DSY1_2050s_HIGH50_CIBSE_v1.1`. It then prints what was actually run — a TMYx typical year fetched from climate.onebuilding.org — and states the four things that separate the two: a typical year against a design summer year, present day against the 2050s, a station against a CIBSE climate zone, an open file against a licensed one.

Three of those four are the reader's to close, and they cannot close any of them, because the only climate the page can reach is the one it fetches for itself. CIBSE licenses its weather data; the files are bought, and they arrive on the buyer's own machine. A UK engineer who owns the right DSY1 today has no way to put it on this desk, so the one part of the method this page could actually honour is the one part it withholds.

The gap is a known one. `src/tm59.js` writes its weather qualification to be true "the day a reader attaches a licensed DSY of their own". This feature is that day.

Four constraints from the constitution shape everything below.

- **Nothing leaves the machine** (Principle I). The file is read in the reader's own browser and simulated there. No byte of it may reach any service, including the feedback report, and no purchase, account or upload happens on this page. Reading a local file does not weaken the privacy claim; it is the only mechanism that keeps it while honouring a licensed file.
- **Deterministic and shareable** (Principle II). The URL reproduces the desk. A multi-megabyte licensed file cannot travel in a URL, and must not: it is not the reader's to redistribute. This is the sharpest tension in the feature and is settled in the Clarifications below.
- **Read it back off the model** (Principle III). Everything the sheet letters about the place — the location, the elevation, the period covered, the holidays, the degree days — comes from the attached file's own records or from the run, never from the outgoing station and never from a variable.
- **No silent fallbacks** (Principle IV). A file that cannot supply what a reading needs produces an em dash and a stated reason. The shipped Denver design days must never stand under a British title block, and a British file must never be priced against a Colorado tariff.

## Clarifications

### Session 2026-09-16

- Q: What happens to a shared link, or a kept scheme, minted while a reader-supplied file was attached? → A: The link carries what the file declares about itself and a fingerprint of its contents, not the file. The recipient's desk loads whole, states which file the sender ran against, and refuses every reading that needs a year until a file whose fingerprint matches is attached. A file that does not match is refused with both descriptions printed.
- Q: Does the browser remember an attached file between reloads and sessions? → A: Yes, in the reader's own browser, and the sheet says so and offers to forget it. A remembered file is re-attached on load without a second trip to the filesystem.
- **Amended in planning (2026-09-16)**, research R9: FR-021 and User Story 4 originally had a remembered file re-attached on every load. Planning found that this would make a bare URL mean one thing on the machine that had once attached a file and another everywhere else, which Principle II forbids. The address bar already carries the file's fingerprint after an attach, so an ordinary reload is a link naming the file and re-attaches by that route; a link naming no file offers the remembered one instead of attaching it.
- Q: The archive a station arrives in carries a DDY, and a purchased EPW usually arrives without one. Where do the design days come from? → A: A DDY may be attached beside the EPW and supplies them. Where none is, the desk has no design days at all: they are removed, the Run strip's design-day choice is withdrawn with its reason, the datum lines are absent, and the file's year is the whole run.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the shoebox against a file you already hold (Priority: P1)

A UK engineer has bought the CIBSE weather set for their site and has the DSY1 EPW on their laptop. They open the sheet, and beside "Choose a weather location" there is a second way in: attach a file of your own. They pick the EPW. The title block re-letters to the place the file declares, the sheet solves the file's year, and every reading on the page is now about that climate. Nothing was uploaded, nothing was bought here, and no station was involved.

**Why this priority**: this is the request in its smallest useful form. Without it the rest of the feature has nothing to stand on, and with it alone a UK engineer can already model their building against the data their assessment is required to use.

**Independent Test**: attach a licensed DSY1 EPW and a TMYx EPW saved to disk from the station picker, at three desk positions each. Confirm that the run completes, that the readings differ from the shipped design-day desk, that the TMYx file attached by hand produces readings identical to the same station picked from the list, and that no network request carries any part of either file.

**Acceptance Scenarios**:

1. **Given** the shipped desk with no station chosen, **When** the reader attaches an EPW from their machine, **Then** the sheet letters the place, elevation, time zone and period from that file's own records, solves its year, and states in view which file is attached.
2. **Given** a file is attached, **When** the run completes, **Then** every reading that a station-supplied year produces is produced here too, by the same arithmetic, with no reading marked or qualified differently on account of where the file came from.
3. **Given** a file is attached, **When** the reader inspects every network request the page makes for the rest of the session, **Then** none of them carries any part of the file, its name, or its contents.
4. **Given** a file the page cannot read as a weather file, **When** it is attached, **Then** it is refused whole with the reason in view, and the climate that was attached before stands untouched.
5. **Given** a file is attached, **When** the reader attaches the same file again, **Then** the IDF handed to the engine is byte-identical and every reading is unchanged.
6. **Given** a station was picked earlier, **When** a file is attached, **Then** everything the outgoing climate had answered is cleared — studies, the sample cache, the survey ground and its traverse, the bill, the pinned scheme, the register's outcome and the comfort line — exactly as a change of station clears them.

---

### User Story 2 - Read the overheating criteria against the required file (Priority: P1)

The same engineer turns to the overheating block. The criteria are computed over their file's summer, and the qualification beside them now prints what *their* file declares about itself against what WFR:2026 asks for. It does not tell them they have complied, and it does not tell them they have not: both descriptions are printed and the judgement is theirs. The qualifications that were true only of an open TMYx file — the daylight-saving one in particular — are re-read from the file in hand rather than restated from a measurement of files this reader is not using.

**Why this priority**: this is the reason the feature exists. Running a purchased file while the page still describes the run as a typical year from onebuilding would be worse than not supporting it, because the sheet would be stating something false about its own run.

**Independent Test**: attach a file whose records declare a British location and a daylight-saving rule, and a file that declares neither. Read the whole overheating block in both cases and confirm that every sentence in it is true of the file attached, that no sentence claims a match or a mismatch with the required file, and that a reader can tell which file was run without opening a fold.

**Acceptance Scenarios**:

1. **Given** a reader-supplied file is attached, **When** the overheating block is read, **Then** the weather qualification prints what that file declares about itself, verbatim from its own records, beside the WFR:2026 requirement and its label, and asserts no relation between them.
2. **Given** an attached file that declares a daylight-saving rule, **When** the local-time qualification is read, **Then** it states what that file declares rather than the measurement that every file the picker can reach declares none.
3. **Given** an attached file that covers 1 May to 30 September and the seed week from 23 to 29 April, **When** the criteria are computed, **Then** they are computed from that file's own hours by the same arithmetic used for a station year.
4. **Given** an attached file that does not cover the seed week or the assessment period, **When** the criteria are read, **Then** each is an em dash with the missing period named, and no criterion is computed over a shortened period.
5. **Given** any attached file, **When** the register is read, **Then** no target's definition, threshold or verdict has changed on account of the file's provenance, and the page states no verdict about compliance with the method as a whole.

---

### User Story 3 - Share the desk, and reproduce someone else's (Priority: P2)

The engineer sends a colleague the link to a desk that clears criterion a. The colleague opens it. The whole desk is there — every control, the patch bay, the pin — and the sheet says plainly that this desk was run against a file the link cannot carry, names what that file declared about itself, and asks for it. The colleague, who bought the same data set, attaches their copy. The fingerprints match, the desk solves, and they are reading the same numbers the sender read. A colleague who attaches the wrong year's file is told so, with both descriptions printed, and nothing is drawn from it.

**Why this priority**: a reading that cannot be reproduced is an anecdote, and two engineers arguing over a design is the whole use this page is for. It is P2 rather than P1 only because the first engineer gets value from stories 1 and 2 alone.

**Independent Test**: mint a link from a desk running an attached file, open it in a fresh browser, and confirm the desk loads whole, the requirement is stated, and no reading that needs a year is lettered. Then attach the matching file, a differently-named file, and a file with the same name but different contents, and confirm the three outcomes are distinguishable and each states its reason.

**Acceptance Scenarios**:

1. **Given** a desk running an attached file, **When** a link is minted, **Then** it carries what the file declares about itself and a fingerprint of its contents, and carries no part of the file.
2. **Given** such a link, **When** it is opened, **Then** every parameter, patch and pin it carries is applied, the sheet states which file is wanted, and every reading that needs a year is absent with that reason rather than lettered from the design days.
3. **Given** such a link and the matching file, **When** the file is attached, **Then** the fingerprints match, the desk solves, and the readings equal the sender's for the same desk.
4. **Given** such a link and a different file, **When** it is attached, **Then** it is refused for that link with both what the link asked for and what the file declares printed, and the reader is told they may run this file on a fresh desk instead.
5. **Given** a kept scheme minted while a file was attached, **When** it is recalled, **Then** it follows the same rule as the link and names the file it was solved against.
6. **Given** a link minted while a file was attached, **When** it is opened by the reader who minted it and whose browser still remembers that file, **Then** the file is re-attached without a trip to the filesystem and the desk solves on load.

---

### User Story 4 - Keep working across reloads, and put the file down (Priority: P3)

The engineer reloads the page mid-afternoon and their file is still attached, because the address bar named it and the browser had kept its bytes, and the sheet says so and offers to forget it. Later they go back to a TMYx station to compare, then return to their own file. Each change of climate is a change of climate: nothing from the one before survives into the readings.

**Why this priority**: it is the difference between a demonstration and a tool somebody works in, but every story above is testable without it.

**Independent Test**: attach a file, reload, and confirm it is re-attached and stated. Clear the address bar's fragment and reload, and confirm the desk comes back with no climate and offers the remembered file rather than attaching it. Forget it and reload, and confirm the offer is gone. Swap between a file and a station three times and confirm that no reading, curve, spot height or priced figure from one survives into the other.

**Acceptance Scenarios**:

1. **Given** a file was attached, **When** the page is reloaded, **Then** the link the desk carries names that file, it is re-attached from the reader's own browser without a filesystem prompt, and the sheet states that it is remembered and how to forget it.
2. **Given** a remembered file and a desk whose link names no file, **When** the page is loaded, **Then** the desk comes back with no climate attached and the remembered file is offered in one click rather than attached, so that the same bare address means the same thing on every machine.
3. **Given** a remembered file, **When** the reader forgets it, **Then** it is gone from the browser, the desk has no climate attached, and the readings that needed one are absent with that reason.
4. **Given** an attached file, **When** the reader picks a station instead, **Then** the station's climate replaces it whole and the file is no longer attached.
5. **Given** a browser that cannot keep the file, **When** the reader attaches one, **Then** the desk works for the session, and the sheet says the file will not be remembered rather than failing silently or claiming it will.

---

### Edge Cases

- A file whose LOCATION record declares no city, no WMO number and no country: the sheet letters what is there and an em dash for the rest, and the bill refuses for want of a country to price against.
- A file that declares a country the tariff tables do not cover: the bill refuses with the reason it already publishes for an uncovered place, and the energy readings stand.
- A file covering less than a whole year, or with gaps or repeated timestamps: the period it actually covers is read off its records and its timestamps and stated, and every reading needing months outside that period is an em dash naming them. Per-square-metre figures on the bill stay withheld, as they already are off a whole year.
- A file at a sub-hourly timestep, or a leap-year file: the period is stated as the file declares it, and anything the run cannot honour is refused rather than resampled or truncated in silence.
- A DDY attached beside an EPW whose design days cannot be read, or which describes a different place than the EPW: refused, with the two places printed, and the EPW's year stands with no design days.
- An EPW attached with no DDY: no design days at all, the Run strip's design-day choice withdrawn with its reason, and the datum lines absent rather than left showing the last climate's.
- A file far larger than a weather file, or one that is not text at all: refused before anything is read into the desk, naming what was expected.
- An archive holding several EPWs: the reader chooses which one, and the choice is part of what the link's fingerprint is taken over.
- A file attached while a run, a study or a survey is in flight: the work in flight is abandoned, not folded into the new climate.
- The same file attached twice under two names: the fingerprint is of the contents, so a link minted under one name is satisfied by the other.
- A browser with no room left to remember the file: stated, and the session continues.

## Requirements *(mandatory)*

### Functional Requirements

**Attaching**

- **FR-001**: Readers MUST be able to attach a weather file held on their own machine, from the same part of the sheet where a station is chosen, without an account, a purchase, or a network round trip.
- **FR-002**: No part of an attached file — its contents, its name, or anything derived from it beyond what the sheet letters — MUST reach any service, at attach time or afterwards. This includes the feedback report, which is the one moment anything leaves the machine.
- **FR-003**: The sheet MUST accept an EPW, an accompanying DDY, and an archive containing them; where an archive holds more than one weather file the reader MUST choose which one is attached.
- **FR-004**: A file that cannot be read as what it claims to be MUST be refused whole, naming what was expected and what was found, leaving the climate attached before it untouched.
- **FR-005**: Attaching a file MUST clear everything the outgoing climate answered — studies and their sample cache, the survey ground and its traverse, the bill, the pinned scheme, the register's outcome, the comfort line and any lapsed stops — on the same rule a change of station clears them.
- **FR-006**: Exactly one weather source MUST be attached at a time; attaching a file replaces a station and attaching a station replaces a file.

**What the sheet says about the place**

- **FR-007**: The location the model is solved at MUST come from the attached file's own records, and the title block MUST letter the place from the same records. Nothing about the place may be carried over from a previous climate or from the shipped desk.
- **FR-008**: Anything the file does not declare MUST read as an em dash. Where a figure can be measured from the file's own hours rather than read from a record, the reading MUST say it was measured and MUST state the basis it was measured on.
- **FR-009**: Design days MUST come from a DDY attached beside the file. Where none is attached, the desk MUST carry no design days at all: they are removed, the design-day choice on the Run strip is withdrawn with its reason stated, the datum lines are absent, and the file's year is the whole run.
- **FR-010**: The period the file covers, its holidays and its daylight-saving rule MUST be read off that file and lettered from it, and the readings that depend on them MUST follow what is actually there rather than what files of that kind usually carry.
- **FR-011**: Tariffs, currency and grid carbon factor MUST follow the country the attached file declares. A country the tables do not cover MUST refuse the bill with the reason already published for an uncovered place, never price against another country, and never suppress the energy readings that do not depend on a tariff.

**Overheating and the method**

- **FR-012**: The weather qualification MUST print what the attached file declares about itself, verbatim from its own records, beside the requirement WFR:2026 states and its file label, and MUST assert no relation between the two. The page MUST NOT state that an attached file is, or is not, the file the method requires.
- **FR-013**: Every qualification whose truth depends on the weather file MUST be re-read from the attached file rather than restated from a measurement of the files the picker can reach.
- **FR-014**: The criteria MUST be computed from the attached file's own hours, by the arithmetic already published for them. Where the file does not cover the seed week or the assessment period, each affected criterion MUST be an em dash naming the missing period, and MUST NOT be computed over a shortened one.
- **FR-015**: No target's definition, threshold or verdict may change on account of a file's provenance, and the page MUST NOT draw a conclusion about compliance with the method as a whole.

**Handing the run over**

- **FR-016**: The downloadable run bundle MUST continue to carry the exact bytes the engine was handed, including an attached weather file, and its manifest MUST name that file as the reader's own and state that whatever licence governs it governs sharing the bundle.
- **FR-017**: The feedback report MUST carry nothing from an attached file beyond what the sheet already letters about it in view, and MUST never carry its data.

**The link, and remembering**

- **FR-018**: A link minted while a file is attached MUST carry what the file declares about itself and a fingerprint of its contents, and MUST NOT carry the file. The fingerprint MUST be taken over contents, so the same file under another name satisfies the same link.
- **FR-019**: Opening such a link MUST apply every parameter, patch and pin it carries, state which file the desk needs and what it was said to declare, and withhold every reading that needs a year, with that reason in view, until a file is attached.
- **FR-020**: A file attached against such a link whose fingerprint does not match MUST be refused for that link, with what the link asked for and what the file declares both printed, and the reader MUST be offered the file on a fresh desk instead.
- **FR-021**: An attached file MUST be remembered in the reader's own browser. Where the link being opened names that file, it MUST be re-attached on load without a second trip to the filesystem. Where the link names no file, the remembered one MUST be offered rather than attached, so that the same bare address means the same thing on every machine. The sheet MUST state that a file is remembered and MUST offer to forget it. A browser that cannot keep it MUST be told about, not worked around.
- **FR-022**: A kept scheme minted while a file was attached MUST follow the same rule as the link and MUST name the file it was solved against in its row.

**Interface**

- **FR-023**: Which climate is attached, and where it came from, MUST be readable at 390 px without opening a fold or hovering.
- **FR-024**: Every refusal this feature can produce MUST state its reason in view, and MUST state what would fix it where there is such a thing.

### Key Entities

- **Attached weather file**: the bytes a reader supplied, held in their own browser for the session and remembered there between sessions. Carries what its own records declare — place, elevation, time zone, country, period covered, holidays, daylight-saving rule, and whatever the file says about its own source — and a fingerprint of its contents. Never leaves the machine.
- **Weather source**: what the desk is solving against. Either a station chosen from the index or an attached file, never both, never none-but-pretending.
- **Design conditions**: the winter and summer design days and the site location. Supplied by a station's archive or by a DDY attached beside a file, and absent where neither supplies them.
- **File requirement on a link**: what a link records about the weather file it was minted under — the declaration and the fingerprint — and against which an attached file is matched or refused.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader holding a licensed weather file can go from opening the page to a completed annual run against that file in under two minutes, without an account, a purchase on this page, or any network request carrying the file.
- **SC-002**: Across a full session with a file attached — attaching, solving, studying, surveying, sharing and reporting — zero network requests carry any part of the file, verified by recording every request the page makes.
- **SC-003**: A TMYx file saved to disk and attached by hand produces readings identical to the same station picked from the list, at five desk positions.
- **SC-004**: Every figure the sheet letters about the place is traceable to a record in the attached file or to arithmetic over its hours, and a file whose optional records are empty produces em dashes rather than values, in 100% of those readings.
- **SC-005**: An annual run against an attached file completes within 10% of the time taken by a station file of the same length, and attaching a file adds no delay to the first solve beyond reading it.
- **SC-006**: A recipient of a link minted under an attached file can, holding the same file, reproduce every reading the sender saw, and a recipient holding a different file is told so before any reading is drawn — in 100% of both cases.
- **SC-007**: Every failure this feature can produce — unreadable file, wrong kind of file, a period too short for a reading, an uncovered country, a mismatched fingerprint, a browser that cannot remember — names what was missing in view, with no reading left standing from the previous climate.
- **SC-008**: A reader can say, from the sheet alone and without opening a fold, which file the run used and what the method asks for, and the sheet asserts no relation between the two.

## Assumptions

- The reader already holds the file. This page never fetches, sells, caches, bundles or proxies CIBSE data, and never links a reader to a purchase as though it were a step in a flow this page owns.
- CIBSE's licensed data arrives as EPW text, with related files beside it, in the same formats EnergyPlus already reads. No new weather format is being taken on.
- The bundle download goes to the reader's own machine, so including their own weather file in it is not redistribution. What the reader does with the bundle afterwards is governed by their licence, which the manifest states rather than polices.
- The page cannot verify a file's provenance, licence or vintage, and must not appear to. Printing what a file declares is the whole of what it can honestly do.
- One weather file at a time. Running a typical year for energy and a design summer year for overheating in the same session is a separate feature, not this one.
- Files are assumed to be of the size weather files are, a few megabytes. A file large enough to threaten the browser is refused rather than accommodated.
- The existing TM59 arithmetic — the period, the seed week, the running mean, the occupancy floor, the rounding — is unchanged. This feature changes where the hours come from, not what is done with them.

## Out of Scope

- Fetching, purchasing, hosting, mirroring or bundling CIBSE weather data, or any other licensed data set.
- Judging whether an attached file satisfies TM59, WFR:2026, or any other requirement.
- A room-by-room assessment, which remains the standing qualification it is today.
- Two weather files attached at once, or a comparison drawn between two climates on one sheet.
- Editing, repairing, resampling or converting a weather file the reader supplies.
