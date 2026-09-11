# Feature Specification: Feedback Reports

**Feature Branch**: `009-feedback-reports`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "With more and more users using this app, its mainteners need an organized (and fully automated) way to collect feedback. This feedback should be simple to provide and it should include all the information the user was "seeing" on the screen (screenshots if possible, logs, files used/generated) for more effective debugging. The system should collect and categorize issues in different buckets such as bugs or feature requests."

## Context

Feedback reaches the maintainers today only when a reader finds the repository, opens an issue by hand and describes the sheet from memory. The four issues filed so far were written by people who already knew the code. A reader who does not can rarely say which build they were on, which station they had picked, or which of eighteen channels was patched out, and those are the facts that decide whether a problem can be reproduced.

The sheet is unusually well placed to answer that for them. Its link reproduces the whole desk (every parameter off its default, the patch state, the station, the weather window and the pinned hour), and the title block stamps the exact build. So the sheet the reader saw can be rebuilt from two short strings, without shipping the model anywhere. What the link cannot carry is the part that happened on the reader's machine: the engine's error text, the message the sheet showed, the browser and screen it was shown on, and what the reader did just before.

Two constraints shape everything below.

- **The page sends nothing.** The constitution forbids uploading a model, an IDF, a result or a parameter set to any service, and forbids any request/response service at run time. The page therefore assembles the report locally and the reader carries it to the project's public issue tracker themselves, the same way they would share a link.
- **Reports are public.** The repository is public, so whatever the reader submits is published. The reader sees every line before it leaves, and nothing is added after they have seen it.

## Clarifications

### Session 2026-09-11

- Q: Where should the starter `/speckit-specify` paragraph for a feature request appear, given that the tracker is public? → A: A folded comment from idfkit-bot on the issue, headed as a maintainers' draft and not a commitment.
- Q: What should triage be allowed to read when it drafts the starter paragraph? → A: The report plus a fixed bundle of project context supplied by the workflow (the constitution, the repository's `CLAUDE.md`, and the title and one-line summary of each existing spec), with no tools.
- Q: When a feature request conflicts with the constitution, what should the starter paragraph do? → A: Write the paragraph as asked, and open the comment by naming each conflicting principle and what an amendment would have to argue.
- Q: Should a starter paragraph also be written when a maintainer, not triage, marks a report as a feature request? → A: Yes, when a maintainer relabels a report as a feature request, with at most one draft per report, never replacing one already posted.
- Q: The tracker's prefill carries the report in the address of the tab it opens, so the text reaches the tracker before the reader submits. When does the report leave the reader's machine? → A: When the reader presses the button that opens the tracker's tab; FR-015 is about that press, and the button says so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Report a problem without leaving the sheet (Priority: P1)

A reader is working the desk when something goes wrong: a run fails, a number looks implausible, or a control does not do what its label says. They open "Report" from the sheet, write a sentence or two about what they expected and what happened, and see the report the page has put together: their words, the link to the desk they are looking at, the build, their browser and screen, the message the sheet is showing and the tail of the engine's log. They press one button, the project's issue tracker opens with all of it already filled in, and they submit it.

**Why this priority**: this is the whole request in its smallest form. Without it nothing else in this feature has anything to work on.

**Independent Test**: at the default desk, break a run on purpose (for example a heating setpoint above cooling via a hand-edited link), open the report, write one sentence, hand it off, and confirm the tracker opens with a filled title and body that contains the link, the build, the failure sentence and the engine log excerpt. Time the sequence.

**Acceptance Scenarios**:

1. **Given** any state of the sheet, **When** the reader opens the report, **Then** the report opens in place with the reader's description as the only required field and every captured item listed below it, readable before anything is sent.
2. **Given** the reader has written a description, **When** they hand the report off, **Then** the project's issue tracker opens in a new tab with a title taken from their words and a body carrying exactly what the preview showed, and the sheet they were on is left untouched.
3. **Given** a run failed, **When** the report is opened, **Then** it already carries the failure sentence the sheet reported and the error lines the engine wrote for that run.
4. **Given** the reader closes the report without handing it off, **When** they reopen it in the same session, **Then** their description is still there and the captured items are refreshed to the sheet as it is now.
5. **Given** the reader has no account on the issue tracker, **When** they open the report, **Then** the page says before they write anything that submitting needs an account there, and that the report can still be copied or saved.

---

### User Story 2 - Rebuild the reader's sheet from the report (Priority: P1)

A maintainer opens a new report. They want to be looking at what the reader was looking at within a minute, without an exchange of questions. The report gives them the link and the build; opening the link on that build puts the same desk, the same station and the same hour on their screen, and the environment lines tell them whether the screen was a phone or a desk.

**Why this priority**: a report that cannot be reproduced costs a maintainer more than no report. This is what makes story 1 worth filing.

**Independent Test**: file reports from five different desk positions, including one on a phone-width screen, one with a study running and one with a pinned hour. For each, open only the report and confirm that the link, loaded on the stated build, reproduces the desk and that the stated readings match the sheet the reader saw.

**Acceptance Scenarios**:

1. **Given** a report, **When** the maintainer opens its link on the stated build, **Then** the desk, patch state, station, weather window and pinned hour match what the reader had.
2. **Given** a report filed from a preview or development build, **When** the maintainer reads it, **Then** it states which build that was and links to the source it came from, and a build that could not read its own revision says so rather than looking like a release.
3. **Given** a report filed while a run was in flight or the readings were stale, **When** the maintainer reads it, **Then** it states that the readings on screen belonged to an earlier desk.

---

### User Story 3 - Reports arrive sorted (Priority: P2)

A maintainer checks the tracker once a day. Every report filed since the last visit is already in exactly one bucket (bug, feature request or question), carries labels for the parts of the sheet it concerns, and points to any earlier report it looks like. A report the automation could not place confidently is marked for a person rather than guessed at. The reader never chose a bucket; the automation read their words and the captured context.

**Why this priority**: the request asks for an organised, fully automated flow, and sorting is what lets the maintainers keep up as readers multiply. It depends on story 1 existing and delivers nothing to a reader directly.

**Independent Test**: file a batch of reports covering each bucket, an ambiguous one and a near-copy of an earlier one. Without any maintainer action, confirm that within the stated time each carries one bucket or the "needs a person" mark, area labels drawn from its captured context, and a duplicate pointer where one applies.

**Acceptance Scenarios**:

1. **Given** a newly filed report, **When** triage runs, **Then** it receives exactly one of bug, feature request or question, or is marked as needing a person, and never more than one bucket.
2. **Given** a report whose captured context shows a failed run, a refused link or a refused station, **When** triage runs, **Then** it is labelled with that kind of failure and with the channel or station involved.
3. **Given** a report closely resembling an open or recently closed one, **When** triage runs, **Then** a comment names the earlier report as a likely duplicate, and the new report is left open for a person to close.
4. **Given** triage cannot place a report with confidence, **When** it runs, **Then** it marks the report as needing a person and states why, rather than assigning a bucket.
5. **Given** a maintainer changes a report's bucket by hand, **When** triage runs again on that report for any reason, **Then** the maintainer's choice stands.
6. **Given** triage places a report in the feature request bucket, **When** it runs, **Then** idfkit-bot posts one folded comment on the report, headed as a maintainers' draft and not a commitment, holding a starter paragraph a maintainer can pass straight to `/speckit-specify`.
7. **Given** a report triage placed in another bucket, **When** a maintainer relabels it as a feature request, **Then** the same draft comment is posted; **and When** the report is later relabelled away and back, **Then** no second draft is posted and the first is left as it was.

---

### User Story 4 - Show what I was seeing (Priority: P2)

Some problems are about how the sheet looks: a figure clipped on a phone, a label over a drawing, a fold that will not open. Others need the run's own files: a fatal that only the complete engine log explains. The reader wants to add a picture of their screen, or the run's files, without having to work out how.

**Why this priority**: the link and build reproduce the model exactly, so most reports need no files. Layout problems and failed runs are the exceptions, and for those a picture or the complete log decides whether the report can be acted on.

**Independent Test**: from a phone-width screen, open the report, ask for a picture of the screen and the run's files, and confirm both are saved to the reader's device, named for the report, listed in the preview, and that the handed-off issue asks the reader to attach them.

**Acceptance Scenarios**:

1. **Given** the report is open, **When** the reader asks for a picture of the screen, **Then** the picture shows the sheet as it was when the report was opened, not the report itself, and is saved to the reader's device.
2. **Given** the browser cannot produce a picture of the page, **When** the report is open, **Then** the offer is shown as unavailable with the reason, and the rest of the report is unaffected.
3. **Given** a run has been made, **When** the reader asks for the run's files, **Then** they receive the same run bundle the sheet already offers, and the preview states that it contains the model, the weather file and the engine's reports.
4. **Given** the reader has signed the sheet, **When** they ask for the run's files, **Then** the preview states that the model file carries their signature, and they can take the files unsigned.
5. **Given** any file was saved for the report, **When** the report is handed off, **Then** the issue body names each file and asks the reader to attach it, since the page cannot place files in the tracker itself.

---

### User Story 5 - Report when the sheet itself is broken (Priority: P3)

The engine never finished loading, the page stopped on a refused link, or the weather picker refused every station the reader tried. These are the moments a reader most wants to report and the ones where the rest of the sheet is least able to help.

**Why this priority**: rare but high value, since these are the failures that stop a reader outright. It builds on story 1 and adds only reachability and a few captured items.

**Independent Test**: block the engine's assets from loading, and separately open a malformed link. In each case confirm the report can be opened, carries the failure the page showed, and hands off.

**Acceptance Scenarios**:

1. **Given** the engine failed to load, **When** the reader looks for the report, **Then** it is reachable and carries the loading failure the page showed.
2. **Given** a link was refused, **When** the reader opens the report, **Then** it carries the refused link as it was typed and the reason the sheet gave, and does not substitute the default desk's link for it.
3. **Given** the page has caught unexpected errors during the session, **When** the report is opened, **Then** each is listed with its message and the order in which it happened.

---

### Edge Cases

- **Too long to hand off**: the issue tracker accepts only so much text through a prefilled link. When the report exceeds that, the engine log excerpt is cut from its oldest lines first, the cut is stated in the report with the number of lines removed, and the complete report is offered as a saved file to attach. Nothing is shortened without saying so.
- **Pop-up blocked**: if the new tab cannot be opened, the report states that, and offers the destination as a plain link and the report text to copy.
- **No run yet**: before the first run lands, the report says there is no run and carries no log, rather than an empty excerpt that reads as a clean run.
- **Study or survey running**: the report states which study or survey was in progress and how far it had got; the samples themselves are not included.
- **Location**: if the reader used "Near me" to find a station, the report carries the chosen station only, never the coordinates the browser provided.
- **Signature and kept schemes**: the reader's signature and their shelf of kept schemes are personal and stay out of the report text. The signature can reach a report only through the run files, and only as described in story 4.
- **The report changes nothing**: opening, editing or handing off a report never touches the desk, the link, a run or a reading, and a run in flight is not interrupted.
- **Phone width**: the report opens, previews and hands off at 390 px wide, with nothing reachable only on hover.
- **Keyboard and screen readers**: the report can be opened, written, reviewed and handed off without a pointer, and each captured item is announced with its name.
- **A report of a feature request**: when nothing went wrong, the captured context is still included (it is how triage recognises a request), but the report does not claim a failure that did not happen.
- **Triage cannot run**: the triage allowance is used up, its credential has expired, or the service is down. The report is marked as needing a person with that reason, so a quiet failure of triage is visible on the tracker rather than looking like a report nobody sorted.
- **A report written to steer triage**: anyone can open an issue on a public repository, so a report body may carry instructions aimed at the automation. Because triage can only return a verdict that is checked before it is applied, the worst such a report can do is mislabel itself.
- **A feature request the constitution rules out**: a request for, say, saving models online collides with Principle I. The starter paragraph keeps the request as asked, and the comment opens by naming the principle and what an amendment would have to argue, so the maintainer decides with the conflict in front of them.

## Requirements *(mandatory)*

### Functional Requirements

**Opening and writing a report**

- **FR-001**: The sheet MUST offer a way to open a report from every state it can be in, including before the engine has loaded, after a refused link and at 390 px wide.
- **FR-002**: The reader's description MUST be the only field they are required to fill. The page MUST NOT ask the reader to choose a bucket.
- **FR-003**: The page MUST state, before the reader writes anything, that the report will be public and that submitting it needs an account on the issue tracker.
- **FR-004**: The reader's unsent description MUST survive closing and reopening the report within the session.

**What the report carries**

- **FR-005**: Every report MUST carry the desk's link, including the station, weather window and pinned hour, exactly as the sheet's own share would produce it; after a refused link it MUST carry the refused text as typed instead.
- **FR-006**: Every report MUST carry the build revision, the EnergyPlus version and the toolkit version as the sheet states them, with an em dash for any the build could not read.
- **FR-007**: Every report MUST carry the environment it was filed from: browser and version, operating system, screen and window size, which layout the sheet chose, and whether the pointer was coarse.
- **FR-008**: Every report MUST carry what was on screen at the moment it was opened: the status line, every refusal, failure or blocking reason in view, which run kind the readings came from, and whether they were stale.
- **FR-009**: Every report MUST carry the error lines the engine wrote for the latest run with their counts by severity, or state that no run has been made.
- **FR-010**: Every report MUST carry any unexpected errors the page caught during the session, in order, with their messages.
- **FR-011**: Every report MUST carry a short trail of the reader's most recent actions on the desk (controls moved, runs started, links loaded, refusals met), kept only in memory for the session and never stored.
- **FR-012**: A report MUST NOT carry the reader's signature, their kept schemes, their device location, or anything else not listed in FR-005 to FR-011.

**Review and handoff**

- **FR-013**: The reader MUST see every item the report carries, as it will be sent, before it is handed off. Nothing may be added to the report after the preview.
- **FR-014**: The reader MUST be able to remove any captured item except the build revision before handing off, and the report MUST state which items were removed.
- **FR-015**: Handing off MUST open the project's issue tracker in a new tab with the title and body prefilled. Pressing that button is the only moment the report leaves the reader's machine: the tracker receives the prefilled text when the tab opens, before the reader submits, and the button MUST say so where it is pressed. Nothing is sent before that press, and the page itself makes no request.
- **FR-016**: The reader MUST be able to copy the whole report as text and save it as a file, whether or not they hand it off.
- **FR-017**: When the report is too long to hand off whole, the page MUST trim only the log excerpt, oldest lines first, state the trim in the report, and offer the complete report as a file.

**Files**

- **FR-018**: The reader MUST be able to save a picture of the sheet as it was when the report was opened, when the browser allows it. When it does not, the offer MUST be shown unavailable with its reason.
- **FR-019**: The reader MUST be able to save the latest run's bundle from the report, and to take it unsigned when the sheet is signed.
- **FR-020**: Files MUST be opt-in. None is saved unless the reader asks, and every saved file MUST be named in the handed-off body with a request to attach it.

**Triage**

- **FR-021**: Every newly filed report MUST be placed, without maintainer action, in exactly one of three buckets (bug, feature request, question), or marked as needing a person with the reason stated.
- **FR-022**: Triage MUST read both the reader's words and the captured context, and MUST add area labels derived from the context (the kind of failure, the channel or station involved, the layout for display problems).
- **FR-023**: Triage MUST flag likely duplicates of open or recently closed reports by naming them, and MUST NOT close anything itself.
- **FR-024**: Triage MUST NOT override a bucket or label a maintainer has set by hand.
- **FR-025**: Reports filed by hand, without the page, MUST still be accepted and triaged from their words alone, and marked as missing captured context.
- **FR-026**: When triage cannot run or cannot finish, the report MUST still be marked as needing a person, with the reason stated (for example, the allowance ran out or the credential expired). No report may be left unmarked.
- **FR-027**: The part of triage that reads a report MUST be unable to change the repository. It returns a verdict only, and the verdict MUST be checked against the repository's existing labels and reports before anything is applied.
- **FR-028**: For a report placed in the feature request bucket, whether by triage at filing or by a maintainer relabelling it later, triage MUST post a comment on the report holding a starter paragraph a maintainer can pass to `/speckit-specify` to begin a specification. The comment MUST be folded, MUST be headed as a draft for maintainers, and MUST state that it is not a commitment to build the feature. Triage MUST draft it from the report and a fixed bundle of project context handed to it (the constitution, the repository's `CLAUDE.md`, and the title and one-line summary of each existing spec), with no tools and no other access to the repository. A report MUST receive at most one such comment: relabelling it again MUST NOT post a second draft or replace the first.
- **FR-029**: When a feature request conflicts with a principle of the constitution, the starter paragraph MUST still describe the request as the reporter made it, and the comment MUST open by naming each conflicting principle and what an amendment would have to argue. Triage MUST NOT rewrite the request to fit the constitution.

**Constraints carried from the constitution**

- **FR-030**: Nothing in the report flow MAY reach the model, the link, a run or a reading, and opening a report MUST NOT interrupt or delay a solve in flight.
- **FR-031**: The report flow MUST add no run-time dependency beyond those the constitution permits.
- **FR-032**: The report MUST follow the design system and the copy budgets, and the text shown in view MUST stay within the sheet's existing budget for a block.

### Key Entities

- **Report**: one reader's account of one problem or request. Holds the description, the captured context, the list of removed items, the list of saved files, and a trim note when the log was shortened. Exists only on the reader's machine until they submit it.
- **Captured context**: the facts the page adds to a report: link, build, environment, what was on screen, engine log excerpt, caught errors and action trail. Each item is named, previewable and removable (except the build).
- **Action trail**: a bounded, in-memory list of the reader's recent actions on the desk, in order. Never stored and never sent except inside a report.
- **Report file**: an opt-in file saved for a report: a picture of the sheet, the run bundle, or the complete report text.
- **Bucket**: one of bug, feature request or question, assigned by triage. A report has one bucket, or the "needs a person" mark instead.
- **Area label**: a label naming the part of the sheet a report concerns, derived from its captured context.
- **Starter paragraph**: a draft feature description written by triage for a report in the feature request bucket, ready to pass to `/speckit-specify`. Posted once, folded, on the report it came from, as a maintainers' draft rather than a commitment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader goes from opening the report to a submitted issue in under 2 minutes, with no more than three actions besides typing their description.
- **SC-002**: For at least 95% of bug reports filed through the page, a maintainer can put the reader's desk on screen from the report alone in under 1 minute, with no follow-up question.
- **SC-003**: 100% of reports receive a bucket or the "needs a person" mark within 10 minutes of being filed, with no maintainer action.
- **SC-004**: Over the first 50 reports, maintainers leave at least 90% of the buckets triage assigned unchanged.
- **SC-005**: At least 80% of reports that maintainers close as duplicates were flagged by triage as likely duplicates first.
- **SC-006**: Assembling, previewing and handing off a report causes zero network requests from the page, verified by watching the page's network activity through the whole flow.
- **SC-007**: 100% of what reaches the tracker appeared in the reader's preview, checked by comparing the preview with the prefilled body for every captured item.
- **SC-008**: The report can be opened and handed off at 390 px wide, with a keyboard alone, and after the engine has failed to load.
- **SC-009**: No generated model or link changes: the IDF at the default desk and at least three other desk positions is byte-identical before and after this feature, and every existing link loads to the same desk.
- **SC-010**: Every report in the feature request bucket, whether triage or a maintainer put it there, carries exactly one draft comment within 10 minutes of being placed there, and in at least 80% of cases a maintainer starts `/speckit-specify` from that paragraph without rewriting what the request is.

## Assumptions

- **Reading of Principle I.** The page sends nothing: it prepares text and opens a tab, and the reader decides whether to publish. That is taken to be the same act as sharing a link, which the constitution already allows. Planning MUST record this reading against Principle I; if a reviewer holds that a prefilled handoff is an upload, a clarifying amendment is written before implementation, not after.
- **The tracker is the project's public issue tracker**, and a reader needs an account there to submit. A private channel for readers who cannot publish their scheme is out of scope for this feature.
- **Files stay on the reader's machine until they attach them.** A prefilled issue cannot carry files, so every file is saved locally and attached by the reader's own hand.
- **Triage runs on the maintainers' side**, in the repository, after a report is filed. It is not part of the page, so the constitution's run-time rules for the page do not bind it.
- **Triage uses a Claude model and is paid for by a Claude subscription, not metered API credits.** It runs through Anthropic's own GitHub Action, authenticated with the one-year subscription token that `claude setup-token` generates, held as a repository secret. The token belongs to the maintainer who generated it, so triage shares that maintainer's usage limits and the token is renewed yearly. The model, the prompt and the verdict's exact shape are planning decisions.
- **Triage acts as idfkit-bot.** Labels and comments are applied under the organisation's GitHub App identity, which was granted Issues (read and write) on 2026-09-11 beside Actions, Contents and Pull requests. The subscription token was added as a repository secret the same day.
- **Reading and acting are two steps.** The step that reads the report gets read-only access and no tools, and returns a structured verdict (bucket or "needs a person", labels, likely duplicates, and for a feature request the starter paragraph). A second step checks every label and issue number in it against the repository, then applies it as idfkit-bot. The model never holds a credential that can write.
- **Reports from people without write access are accepted on purpose.** The action refuses such users by default; triage lifts that restriction for this one read-only workflow, which is the case the action's security guidance names for it.
- **The subscription terms are to be confirmed before triage ships.** The consumer terms allow automated access only where Anthropic explicitly permits it, and this documented setup is permitted. They also forbid making an account available to anyone else, and a workflow strangers can trigger may fall under that; a Team or Enterprise plan is governed by the commercial terms instead. If Anthropic's answer rules it out, the fallbacks are an API key obtained through workload identity federation, or Claude on Amazon Bedrock through the existing AWS account. Both are metered.
- **Three buckets to start**: bug, feature request, question. The repository's existing labels for the first two are reused. More buckets can be added without changing the shape of the feature.
- **Automated reproduction is out of scope.** Triage labels and points at duplicates; it does not re-run the reader's link to confirm a failure. That is a natural follow-up once reports carry the link reliably.
- **The action trail is short**: the most recent twenty or so actions, enough to show how the reader arrived rather than the whole session. The exact length is a planning decision.
- **The general notes are unchanged**, since no existing step changes meaning. If planning adds a step that teaches the report, the notes, their call sites and the storage key are updated as the constitution requires.
- **Existing issues are not re-triaged** when this ships; triage applies to reports filed from then on.
