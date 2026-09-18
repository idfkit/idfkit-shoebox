# Feature Specification: An executing verification suite for the model

**Feature Branch**: `013-domain-test-suite`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "This repo has been developed without a test runner, which is contrary to best practices. The next piece of work needs to address this in full and use industry best practices for an application that is domain-driven (building energy simulation)."

## Overview

This repository has been built for twelve features without a test runner. Verification has been real but manual and disposable: a contributor writes a throwaway Node script under a gitignored `harness/`, builds the document at a few console positions, writes the IDF, runs EnergyPlus, reads the error file, then deletes the script. What that script proved is lost the moment it is deleted, so the next contributor proves it again, or — far more often — does not.

The cost of that is already written down. `CLAUDE.md` carries a section called **"Invariants that fail quietly"**: twenty-six rules, each one a bug that was found by driving the page and paid for in debugging. A temperature difference lettered through an absolute temperature kind reads `+1 °C` as `+33.8 °F`. A cache keyed without the unit system serves a figure in a system the reader has left. A hidden browser tab starves the frame callback and three separate figures were chased as lettering bugs before anyone checked `document.visibilityState`. Reading an absent object type used to register it and silently reorder the IDF. Each of these is a lesson recorded in prose, and prose does not fail. Nothing in the repository notices when one of them is broken again.

That section is therefore not preserved by this feature — it is *relocated into it*. Each bullet becomes an executing check, and the narrative that justifies it moves to a comment beside that check, which is where this project's house style has always said the reasoning belongs: prose recording why, frequently with the measurement or the error message that forced the decision. When the work is done the section is deleted, because a rule stated both in a document and in an assertion is two statements of one rule, and the assertion is the one that fails.

This feature turns that record into something that executes. It establishes a test runner and a verification suite organised around the domain — a building model written as an IDF document, handed to an EnergyPlus engine, and read back as physical quantities — rather than around the file layout. The suite's job is not to chase a coverage figure. It is to make each of the twenty-six invariants, the constitution's ten quality gates, and the physical behaviour of the model itself fail loudly, automatically, and before a human opens the page.

The work is bounded by what this repository already is: a static, browser-only, dependency-light sheet whose whole argument is that a serious simulation needs no stack under it. Verification must run against the real schema and the real engine — the same WebAssembly EnergyPlus the reader's browser runs, under Node, on a machine with no EnergyPlus installed — because schema validation alone does not catch what breaks a run, and a mocked engine would prove nothing about a building.

### A note on the constitution

The project constitution at `.specify/memory/constitution.md` (v1.0.1) does not merely happen to lack tests. Its **Development Workflow and Quality Gates** section opens: *"There is no test runner and no linter. Verification is done by throwaway Node harnesses under a scratch directory"*, and its ten numbered gates are written as instructions to a human running such a harness. `CLAUDE.md` and `docs/design-notes.md` say the same in their own words.

This feature contradicts that section directly, so it cannot ship without amending it. Both halves of its opening sentence stop being true here: a runner arrives, and so does a linter. The amendment is in scope and is part of the definition of done: the ten gates are not discarded — they are exactly the right gates — but they must be restated as checks the suite executes rather than steps a contributor remembers. Under the constitution's own versioning policy this is a MINOR bump (guidance materially expanded), proposed as part of this feature's pull request.

## Clarifications

### Session 2026-09-18

- Q: Is automated static analysis — a linter, a formatter, type checking of the source — in scope for this feature alongside the test runner, or a separate later piece of work? → A: In scope. A linter and a formatter ride along with the runner; type checking of the source does not.
- Q: How much of the existing code must be covered by the end of this feature? → A: The simulation-domain modules, plus every one of the 26 recorded invariants wherever it lives — including those whose subject sits in an interface module, which therefore need a browser-like environment for a handful of checks.
- Q: Should a coverage figure be a blocking threshold on every change, or a reported measure that informs review? → A: Reported, never blocking. The suite's gate is that deliberately breaking a recorded rule turns it red.
- Q: Once every invariant has an executing check, where should the single authored statement of each invariant live? → A: In the check. The "Invariants that fail quietly" section of `CLAUDE.md` is removed, and the narrative that justifies each invariant — the measurement, the error message, what it cost — is carried as a comment beside the check that enforces it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know a change is sound before opening the page (Priority: P1)

A contributor has changed something that reaches the model — an applier in `model.js`, a control declaration, the way a reading is derived. Today their only honest options are to write a disposable harness or to load the page and drive it, and the second finds only what they think to look for. They want to run one command and be told, in a plausible amount of time, whether the change broke anything the repository already knows about.

**Why this priority**: This is the whole request. Every other story exists to make this verdict worth trusting. A contributor who can get a trustworthy verdict in seconds will get one on every change; a contributor who must reconstruct a harness will get one when they suspect trouble, which is precisely when they are least likely to suspect it.

**Independent Test**: On a fresh clone with the documented setup performed, run the project's single verification command against unmodified `main` and confirm it reports a pass. Then break one recorded invariant on purpose — letter a temperature difference through the absolute temperature kind, say — and confirm the same command reports a failure naming that invariant.

**Acceptance Scenarios**:

1. **Given** an unmodified checkout with setup complete, **When** the contributor runs the verification command, **Then** it reports a single overall verdict and exits with a status that distinguishes pass from fail.
2. **Given** a change that breaks a recorded invariant, **When** the contributor runs the verification command, **Then** at least one check fails and its message names the invariant that was broken and where it is recorded, not only an assertion line number.
3. **Given** a contributor working on a control declaration with no interest in waiting for engine runs, **When** they run the fast tier alone, **Then** they get a verdict covering everything that does not need the engine, within the stated fast-tier budget.
4. **Given** a checkout where the engine assets have not been staged, **When** the contributor runs the engine-backed checks, **Then** the suite refuses with a stated reason naming what is missing and how to stage it, rather than passing by skipping them.
5. **Given** a change carrying a lint finding or a file that is not formatted, **When** the contributor runs the fast tier, **Then** it reports a failure in the same verdict as every other check, rather than static analysis being a separate thing to remember.
6. **Given** a lint rule the project has turned off, **When** a contributor asks why, **Then** the reason is recorded beside the rule.

---

### User Story 2 - Every recorded invariant fails loudly when broken (Priority: P1)

A maintainer reads the twenty-six entries under "Invariants that fail quietly" and the ten gates in the constitution, and wants each of them to be a thing the repository enforces rather than a thing a contributor is trusted to have read. The defining property is not that a check exists but that breaking the rule makes the check fail.

**Why this priority**: These are not hypothetical risks. Each entry is a bug that already happened, in this codebase, and cost real debugging — the list is the highest-yield test backlog that could possibly be written for this project, and it is already written. Covering it is the difference between a suite that asserts what is easy and one that asserts what has actually gone wrong.

**Independent Test**: For each recorded invariant, deliberately introduce the breakage the entry describes, confirm the suite fails, and confirm the failure names that invariant. Record the exercise so the proof can be repeated.

**Acceptance Scenarios**:

1. **Given** the twenty-six invariants this project has recorded, **When** the suite is complete, **Then** every one has at least one executing check associated with it by name, and the narrative justifying it sits beside that check.
2. **Given** any one recorded invariant, **When** it is deliberately broken in the source, **Then** the suite fails, and it fails for that invariant rather than incidentally through an unrelated check.
3. **Given** an invariant that the suite genuinely cannot execute (one that can only be seen by a human looking at a rendered page), **When** the suite is complete, **Then** that invariant is listed explicitly as unexecutable with the reason stated, rather than being quietly counted as covered.
4. **Given** a new invariant discovered during later work, **When** somebody goes to write it down, **Then** the only place to write it down is beside a check that enforces it, so recording it and enforcing it are not merely one practice but one act.

---

### User Story 3 - Verify the building, not just the code (Priority: P1)

A contributor changes an applier and wants to know that the document it writes is still a valid, runnable building that behaves the way physics says it should — that the model still loads against the real 26.1.0 schema, still runs to completion, still asks only for output variables the run actually generates, and that a wall of more glass still raises cooling demand rather than lowering it.

**Why this priority**: This is what makes the suite domain-driven rather than generic. A unit test that proves a function returns the number it was told to return proves nothing about a building. The failures that have hurt this project most — an output variable requested but not generated, a crack coefficient eighty times wrong, a nearly sealed box failing warmup, a surface silently deleted for coincident vertices — are all failures the engine reports and no amount of code-level testing can see.

**Independent Test**: Run the engine-backed tier on a machine with no EnergyPlus installed, against a set of representative desk positions, and confirm each model validates against the real schema, runs to completion, produces an error file free of fatals and of "requested but not generated", and yields readings inside their stated physical bounds.

**Acceptance Scenarios**:

1. **Given** a representative set of desk positions, **When** the engine-backed tier runs, **Then** each written document validates against the real EnergyPlus 26.1.0 schema bundle and passes an integrity check before any simulation is attempted.
2. **Given** the same set, **When** each model is simulated with the staged WebAssembly engine under Node, **Then** the run completes, the error file carries no fatal, and no requested output variable is reported as "requested but not generated".
3. **Given** a requested output variable, **When** the run completes, **Then** the suite confirms that variable's name appears in the run's data dictionary, rather than trusting the spelling that was written.
4. **Given** a scenario with a stated physical expectation — more south glazing raises cooling demand, more insulation lowers heating demand, a tighter envelope lowers infiltration loss — **When** the scenario runs, **Then** the reading moves in the stated direction and lands inside the stated tolerance, and the expectation cites the physical reasoning behind it.
5. **Given** a configuration the model is meant to refuse — a heating setpoint above the cooling one, a station whose design conditions cannot be read, a rooflight band that would not build — **When** the suite exercises it, **Then** the refusal happens, names what was missing, and the operation is refused whole rather than run with a substituted value.
6. **Given** EnergyPlus's non-re-entrant entry point, **When** the suite runs several simulations, **Then** each runs in isolation from the others and a second run never reads the previous run's output.

---

### User Story 4 - The document the engine gets does not drift (Priority: P2)

A contributor refactors an applier, or adds a control, and wants to see exactly what changed in the IDF the engine receives — and wants the repository to notice if the answer is "more than I meant".

**Why this priority**: `applyModel` rewrites the whole desk on every parameter change, which makes byte-level stability an actual requirement rather than a nicety. Three of the repository's standing rules are byte-identity claims: applying the model three times must give identical output, a shrunk desk must serialise identically to one built small, and "lean then sheet" must be identical to "always sheet". These are cheap to check automatically and impossible to check reliably by eye.

**Independent Test**: Apply the model three times at each representative desk position and confirm byte-identical output; shrink a sweeping channel and confirm the result matches a desk built at the smaller size; toggle reporting through both routes and confirm identity. Then change an applier and confirm the suite shows the resulting document differences as a reviewable diff.

**Acceptance Scenarios**:

1. **Given** any representative desk position, **When** the model applier runs three times over the same document, **Then** the serialised output is byte-identical after each application.
2. **Given** a channel that sweeps object names, **When** the desk is shrunk from a larger configuration, **Then** the resulting document is byte-identical to one built at the smaller size, proving no orphaned objects remain.
3. **Given** the reporting selection, **When** a lean selection is followed by a full one, **Then** the document is byte-identical to one that was set to the full selection throughout.
4. **Given** an intended change to what the model writes, **When** the suite runs, **Then** the difference is presented as a readable diff of the document, and accepting it is a deliberate, reviewable act rather than an automatic one.
5. **Given** the determinism rule, **When** the same parameters are applied under a different wall-clock time, time zone or locale, **Then** the serialised document is byte-identical.
6. **Given** the one-off reformatting of the existing source, **When** it is proposed, **Then** the document written at every representative desk position is byte-identical before and after it, proving a diff that touches every file changed no behaviour.

---

### User Story 5 - The link and the lettering are exercised exhaustively (Priority: P2)

A contributor changes a control's range, renames a key, adds a unit kind or refines a step, and wants to know whether any of the several hundred combinations of face, value and unit system now letters wrongly or produces a link that cannot be read back.

**Why this priority**: These two subsystems are combinatorial, mechanical, and already the source of repeated bugs — three separate entries in the invariants list are the same units trap reached by three different routes, and the link codec is the one place a reader-facing failure is total (a refused link shows nothing at all). Exhaustive checking is exactly what a machine is for and exactly what a human harness will not do.

**Independent Test**: Round-trip every declared control key through the link codec at several values including its extremes, confirm each decodes to the value that was encoded, confirm every class of malformed input is refused whole, and letter every face in both unit systems confirming the stated formatting guarantees hold.

**Acceptance Scenarios**:

1. **Given** every control key in the declaration, **When** a value is encoded into a link and decoded back, **Then** the decoded value equals the encoded one exactly, for each control kind including those carrying canonical text rather than a number.
2. **Given** each class of malformed link input, **When** it is decoded, **Then** it is refused whole with a stated reason and no partial state is adopted.
3. **Given** every frozen link version and its migration steps, **When** a link written under an older version is read, **Then** it resolves to the values that version's defaults imply.
4. **Given** every face the sheet letters, **When** it is lettered in both unit systems, **Then** the stated formatting guarantee holds in each — including that what a figure carries after it is asked of the suffix rather than assumed to be the unit string.
5. **Given** a quantity that is a difference rather than an absolute value — a temperature change, a span along a face, a change in a reading — **When** it is lettered in the imperial system, **Then** it is lettered as a difference, and the suite fails if it is lettered through the absolute kind.
6. **Given** a cache that letters a value, **When** the unit system changes, **Then** the cached text is not reused, and the suite fails if a cache key cannot see the unit system.

---

### User Story 6 - The check runs itself, on every change (Priority: P1)

A maintainer reviewing a pull request wants the verdict already there when they open it, produced by the project rather than by the author's good intentions, and wants a red verdict to mean the change does not merge.

**Why this priority**: A suite that must be remembered is a suite that gets skipped under time pressure, which is when it matters most. The repository already runs a consumer-register check on every push and pull request, so the mechanism exists and only needs the suite to run in it. Without this, the work produces a tool rather than a guarantee.

**Independent Test**: Open a proposed change that breaks a recorded invariant and confirm the automatic check reports a failure against that change, visibly, before a human reviews it.

**Acceptance Scenarios**:

1. **Given** any proposed change, **When** it is pushed, **Then** the verification suite runs automatically and its verdict is visible on the change before review.
2. **Given** a proposed change that fails any check, **When** a maintainer looks at it, **Then** the failure is reported as blocking, and the recorded practice is that it is fixed or the change withdrawn — never skipped, disabled or quarantined.
3. **Given** the automatic run needs the engine and schema assets, **When** it runs on a machine with nothing installed, **Then** it stages what it needs and completes without a locally installed EnergyPlus.
4. **Given** the suite runs on every change, **When** a maintainer measures how long it takes, **Then** it completes inside the stated budget, and a tier that outgrows its budget is treated as a defect in the suite.

---

### User Story 7 - A contributor knows where a new check goes (Priority: P3)

Someone adding a control, a landmark, a reading or a channel wants the suite to tell them what they now owe it, and wants adding the check to be an obvious, small act rather than a research project.

**Why this priority**: A suite decays when adding to it is harder than not. This is what keeps the guarantee alive past this feature, but it delivers nothing on its own, so it ranks below the checks themselves.

**Independent Test**: Follow the written contributor instructions to add a trivial new control and its check, from a fresh reading of the documentation alone, and confirm the suite covers it without the contributor having to invent a pattern.

**Acceptance Scenarios**:

1. **Given** the written instructions, **When** a contributor adds a new control, **Then** the instructions state which checks it must acquire and where they go.
2. **Given** a declaration that the suite can enumerate — controls, landmarks, readings, unit kinds — **When** a new one is added without its check, **Then** the suite notices the omission by enumeration rather than relying on the contributor to remember.
3. **Given** a bug fixed after this feature ships, **When** the fix is proposed, **Then** the recorded practice is that it carries a check which fails before the fix and passes after it.

---

### Edge Cases

- **The engine assets are not staged.** A fresh clone has no engine, no schema bundle and no station index; all three are gitignored. The suite must refuse the tiers that need them, naming what is missing and how to stage it, and must never report a pass for checks it did not run.
- **EnergyPlus is not re-entrant.** Its entry point throws a bare number on a second call without doing any work, and leaves the previous run's output in place — so a naive suite would silently grade the second model against the first model's results. Isolation between runs is a correctness requirement, not a performance one.
- **A model that is meant to fail.** A nearly sealed box failing warmup convergence is physics, not a bug. The suite must be able to assert that a scenario fails, and fails for the stated reason, without that failure being read as a suite failure.
- **Engine output is not bit-stable across every platform.** Physical expectations must be stated as directions and tolerance bands with the reasoning behind them, not as exact figures copied from one machine's run.
- **A golden document changes legitimately.** Most model changes change the document. The suite must make the difference readable and accepting it deliberate; a suite whose goldens are updated reflexively is a suite that proves nothing.
- **Purchased material must not enter the repository.** The TM59 tables are transcribed from a purchased document and deliberately kept out of the repository, generated into a data module instead. Fixtures must not become a back door for that content.
- **The suite must not reach the network.** Station data and climate files come from an external origin at run time; a check that silently depends on that origin is both slow and flaky. Fixtures stand in, and a check that would reach the network fails rather than succeeding slowly.
- **Some invariants cannot be executed.** "No reading exists only on hover" and "every reading is readable at 390 px" are claims about a rendered page a machine can only partly judge. These must be named as unexecutable with the reason, not silently counted.
- **A fast tier that stops being fast.** The project's whole interaction budget is 50 ms a solve; a verification tier that takes minutes stops being run during work. Its runtime is a stated budget, and exceeding it is a defect.
- **A rule with no check can no longer be written down — and that cuts both ways.** Removing the prose section removes the drift it could suffer, but it also removes the list the suite could have diffed itself against: nobody can record an invariant without enforcing it, and equally nobody is told they have failed to record one. The guarantee becomes structural rather than checked, which is stronger where it applies and silent where it does not.
- **A check's comment decays into a restatement of the assertion.** The comment carries the *why* — the measurement, the error message, what the bug cost. A comment that merely narrates what the assertion does has become the second statement again, in the one place nothing can catch it. This is the house comment rule applied where it now matters most.
- **A lint rule that fights the house style.** This project writes long prose comments recording the measurement that forced a decision, throws from declarations at module load, and assembles documents byte by byte on purpose. A stock rule set will flag all three. The rules are chosen against what has actually gone wrong here, and a rule turned off carries its reason beside it — the same standard the code itself is held to.
- **The reformatting sweep collides with work in flight.** Reformatting 1.9 MB of source touches every file, so any branch open across it conflicts everywhere. The sweep is its own change, sequenced deliberately, and proved to have moved no byte of any written document.
- **An interface invariant that only a rendered page can show.** Some of the 26 sit in interface modules but are still machine-checkable against a browser-like environment; a few — readable at 390 px, nothing on hover — are only partly so. The first are executed, the second named as unexecutable. Neither is quietly counted as covered.
- **Flaky checks.** A check that sometimes fails is worse than no check, because it teaches contributors to ignore red. The recorded practice is to fix the root cause; skipping or quarantining is not an option the suite offers.

## Requirements *(mandatory)*

### Functional Requirements

**The runner and its tiers**

- **FR-001**: The project MUST offer a single documented command that runs the whole verification and reports one overall verdict, with an exit status that distinguishes pass from fail.
- **FR-002**: Verification MUST be organised into at least two tiers: a fast tier needing no simulation engine, runnable during work, and a full tier including schema validation and real engine runs. Each tier MUST have a stated time budget, and exceeding that budget MUST be treated as a defect in the suite.
- **FR-003**: The suite MUST run on a fresh clone following written setup instructions alone, and MUST run on a machine with no EnergyPlus installed, using the same WebAssembly engine the reader's browser runs.
- **FR-004**: Where a tier's prerequisites are absent, the suite MUST refuse that tier with a stated reason naming what is missing and how to obtain it. It MUST NOT report a pass for checks it did not run, and MUST NOT silently skip them.
- **FR-005**: The suite MUST NOT make network requests. Any external data a check needs MUST be present as a vendored fixture, and a check that attempts to reach the network MUST fail rather than succeed slowly.

**What the suite must cover**

- **FR-006**: Every one of the twenty-six invariants the project had recorded in prose at the start of this work MUST have at least one executing check associated with it by name, or MUST be listed explicitly as unexecutable with the reason stated.
- **FR-007**: Each such check MUST be proved by deliberately breaking the invariant and confirming the check fails for that invariant, and the result of that exercise MUST be recorded so it can be repeated.
- **FR-008**: Each of the constitution's numbered quality gates MUST be restated as one or more executing checks, or MUST be recorded as a gate that remains a human act with the reason stated.
- **FR-009**: The suite MUST cover the model-writing rules the project already states as byte-identity claims: that applying the model three times produces identical output; that a shrunk configuration serialises identically to one built at the smaller size; and that a lean reporting selection followed by a full one is identical to a full one throughout.
- **FR-010**: The suite MUST assert determinism: the same parameters MUST produce a byte-identical document irrespective of wall-clock time, time zone, locale, or the order in which channels were touched.
- **FR-011**: The suite MUST round-trip every declared control key through the link codec at several values including its extremes, MUST confirm every class of malformed input is refused whole, and MUST exercise every frozen link version's migration path.
- **FR-012**: The suite MUST letter every face the sheet letters in both unit systems and assert the project's stated formatting guarantees in each, including that a value's trailing text is asked of the suffix rather than assumed, and that differences — temperature changes, spans along a face, changes in a reading — are lettered as differences and never through an absolute kind.
- **FR-013**: The suite MUST assert that any cache holding lettered text is invalidated by a change of unit system.
- **FR-014**: The suite MUST exercise the project's refusal paths and assert that each throws naming the specific thing that was missing, that the caller refuses the whole operation, and that no previous value, default or nearest match is substituted.
- **FR-015**: The suite MUST assert the declaration invariants that currently throw at module load, so a broken declaration fails a check rather than only a page load.

**Verifying the building**

- **FR-016**: For a stated set of representative desk positions covering every channel and both the bypassed and engaged state of each, the suite MUST write the document, validate it against the real EnergyPlus 26.1.0 schema bundle, and pass an integrity check, before any simulation is attempted.
- **FR-017**: The suite MUST simulate a stated subset of those positions with the real engine, and MUST assert that the run completes, that the error file carries no fatal, and that no requested output is reported as "requested but not generated".
- **FR-018**: The suite MUST confirm every requested output variable name against the run's own data dictionary, rather than trusting the spelling as written.
- **FR-019**: The suite MUST carry domain regression scenarios that state an expected physical behaviour — a direction of movement and a tolerance band — together with the physical reasoning behind the expectation, and MUST fail when a reading moves against the stated direction or outside the band.
- **FR-020**: The suite MUST be able to assert that a scenario the model is meant to refuse does refuse, and refuses for the stated reason, without that being reported as a suite failure.
- **FR-021**: The suite MUST run each simulation in isolation, such that the engine's non-re-entrant entry point cannot cause one model to be graded against another model's results.
- **FR-022**: Where the suite compares a written document against a retained expected document, a difference MUST be presented as a readable diff, and accepting a new expected document MUST be a deliberate, reviewable act rather than an automatic one.

**Running automatically**

- **FR-023**: The verification suite MUST run automatically on every proposed change and on every push to the default branch, and its verdict MUST be visible on the change before review.
- **FR-024**: A failing check MUST be reported as blocking. The recorded practice MUST be that a failure is fixed or the change withdrawn, and the suite MUST NOT offer skipping, disabling or quarantining a check as a way past it.
- **FR-025**: A check failure MUST name the invariant, rule or scenario that was broken and where it is recorded, not only the location of the assertion.

**Keeping it alive**

- **FR-026**: Where the project holds an enumerable declaration — controls, landmarks, readings, unit kinds, channels — the suite MUST enumerate it and notice a new member that has acquired no check, rather than relying on a contributor to remember.
- **FR-027**: Written contributor instructions MUST state, for each kind of addition the project supports, which checks it must acquire and where they belong.
- **FR-028**: The recorded practice MUST be that a bug fixed after this feature ships carries a check which fails before the fix and passes after it.
- **FR-029**: The project's governing documents MUST be brought into agreement with the new practice in the same change: the constitution's workflow section amended under its own amendment procedure and version policy, and `CLAUDE.md` and `docs/design-notes.md` updated wherever they state that there is no test runner and no linter, or describe the throwaway harness as the way changes are verified. `CLAUDE.md`'s "Invariants that fail quietly" section MUST be removed in the same change, with every bullet's reasoning relocated to the comment beside the check that now enforces it — removed, not summarised, since a summary is the second statement in miniature.
- **FR-030**: Each check MUST carry, as a comment beside it, the reasoning that justifies the rule it enforces — the measurement, the error message, or the cost that made the rule worth having — in the project's existing comment style. The comment MUST explain why the rule exists and MUST NOT restate what the assertion already says, since a comment that narrates the assertion is the second statement of the rule in the one place nothing can catch it.
- **FR-030a**: No invariant may be stated anywhere except beside the check that enforces it. A document, a roster or a summary restating a rule in its own words MUST NOT be introduced, so that the rule keeps exactly one statement by construction rather than by a check that compares two.
- **FR-031**: The suite MUST measure and report how much of the project's simulation-domain logic its checks exercise, so gaps are visible rather than assumed. That measure MUST be reported for review and MUST NOT block a change against a threshold. The gate is FR-007 — breaking a recorded rule turns the suite red — and a coverage figure that climbs while FR-007 goes unmet is describing nothing worth having.

**Static analysis**

- **FR-032**: The project MUST carry automated static analysis alongside the runner: a linter that reports likely defects, and a formatter that settles presentation so it stops being reviewed by hand. Type checking of the source is out of scope for this feature.
- **FR-033**: Linting and formatting MUST be enforced rather than offered — the fast tier and the automatic check MUST both fail on a lint finding or on a file that is not formatted — so that agreeing a rule and enforcing it are one act.
- **FR-034**: Lint rules MUST be chosen against this project's own recorded failure classes rather than adopted wholesale, and any rule that would fight a house convention — prose comments carrying the measurement or the error message that forced a decision, declarations that throw at module load, deliberate byte-level assembly of a document — MUST be turned off with its reason recorded beside it.
- **FR-035**: The one-off reformatting of the existing source MUST land as its own change, separate from the substantive work of this feature, so that neither review buries the other.
- **FR-036**: The reformatting change MUST be shown to have changed no behaviour, by the document written at every representative desk position being byte-identical before and after it.

**How much is covered**

- **FR-037**: The checks MUST cover the project's simulation-domain modules — those it already keeps free of browser and network dependencies — together with every one of the 26 recorded invariants wherever it lives, including those whose subject sits in an interface module.
- **FR-038**: Where a recorded invariant can only be observed against a rendered page, a browser-like environment MUST be used for that check, or the invariant MUST be listed as unexecutable under FR-006 with the reason stated.
- **FR-039**: Interface modules, beyond the recorded invariants they host, are out of scope for this feature. The suite MUST NOT be judged incomplete for leaving them uncovered, and that gap MUST appear in the coverage record so it is visible rather than assumed closed.

**Scope boundaries**

- **FR-040**: The suite MUST NOT introduce any run-time dependency. Anything it requires MUST reach only contributors and the automatic check, never a reader of the published page.
- **FR-041**: Fixtures MUST NOT carry content from purchased documents; where a check needs such content it MUST use the generated data the project already ships for that purpose.

### Key Entities

- **Check**: One executing assertion of one rule, and the single statement of that rule. Carries the name of the invariant, gate or physical expectation it enforces so its failure message points at the rule rather than the code, and carries beside it the reasoning that justifies the rule — which after this feature exists nowhere else.
- **Tier**: A group of checks sharing prerequisites and a time budget — the fast tier needing nothing staged, the full tier needing the schema bundle and the engine.
- **Desk position**: A named set of parameter values and patch state describing one building configuration the suite verifies. The representative set is chosen to cover every channel in both its engaged and bypassed state.
- **Fixture**: Vendored input a check needs and must not fetch — a climate file, a station record, a generated data table.
- **Expected document**: A retained serialisation of the document a desk position writes, compared byte-for-byte, whose change is reviewed as a diff.
- **Physical expectation**: A stated direction of movement and tolerance band for a reading under a named change, together with the physical reasoning that justifies it.
- **Coverage record**: The mapping from each invariant and constitutional gate to the checks that enforce it, including the entries marked unexecutable and why. It is a roster of identifiers, evidence classes and tiers — it holds no statement of any rule, so it is not a second source of one.
- **Style rule**: One linter or formatter rule the project has adopted, or has deliberately turned off, carrying its reason in either case.
- **Verdict**: The single pass or fail the suite reports, per tier and overall.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor with a fresh clone reaches a green verdict by following the written instructions alone, in under 15 minutes including asset staging, without asking anyone.
- **SC-002**: All 26 invariants the prose recorded at the start of this work are accounted for: each has at least one executing check, or is listed as unexecutable with a stated reason. No entry is unaccounted for, and none is left behind in a document when the section is removed.
- **SC-003**: For every invariant with a check, deliberately breaking that invariant makes the suite fail, and fail for that invariant. This is demonstrated for 100% of them and the demonstration is recorded.
- **SC-004**: All 10 of the constitution's numbered quality gates are either executed by the suite or recorded as remaining a human act with a stated reason.
- **SC-005**: The fast tier returns a verdict in under 60 seconds on a contributor's machine, and the full tier in under 20 minutes, both measured and recorded.
- **SC-006**: 100% of proposed changes receive an automatic verdict before human review.
- **SC-007**: The full tier passes on a machine with no simulation engine installed, proving the reader's own engine is what is being verified.
- **SC-008**: Every desk position in the representative set validates against the real schema, runs to completion, and produces an error file with no fatal and no "requested but not generated".
- **SC-009**: Every output variable the model requests is confirmed present in a real run's data dictionary; the count of unconfirmed requested variables is zero.
- **SC-010**: At least one domain regression scenario exists for each channel that reaches the model, each stating a direction, a tolerance band and its physical reasoning.
- **SC-011**: Zero checks are skipped, disabled or quarantined at any point; a check that cannot be made reliable is removed together with the claim it was making, and the removal is recorded.
- **SC-012**: Running the suite twice in succession on an unchanged checkout produces identical verdicts, demonstrated over at least ten consecutive runs, so that a red verdict is always a real failure.
- **SC-013**: After this feature ships, every subsequent bug fix carries a check that fails before the fix — measured on the first ten fixes that follow.
- **SC-014**: No run-time dependency is added: the published page's dependency list is unchanged by this feature.
- **SC-015**: Static analysis reports zero findings and zero unformatted files on the default branch, and both are enforced automatically on every proposed change.
- **SC-016**: The reformatting sweep is demonstrated to have changed no behaviour: the document written at every representative desk position is byte-identical before and after it. The suite proves this about itself.
- **SC-017**: Every lint rule the project turns off carries a recorded reason; the count of rules disabled without one is zero.
- **SC-019**: Every check enforcing one of the 26 invariants carries a comment giving the reasoning behind that rule; the count of such checks without one is zero.
- **SC-020**: After this feature, the count of invariants stated in a document rather than beside a check is zero, and `CLAUDE.md` carries no "Invariants that fail quietly" section.
- **SC-018**: Coverage is reported on every automatic run and blocks nothing; the number of changes blocked on a coverage threshold is zero.

## Assumptions

- **The constitution is amended, not worked around.** Its Development Workflow section states there is no test runner and frames its ten gates as human acts. This feature amends that section under the constitution's own procedure, as a MINOR bump, and treats the ten gates as the specification of what the suite must execute. Shipping the suite while leaving the constitution stating the opposite is not an acceptable outcome.
- **The recorded invariants are the backlog, and the backlog is consumed.** Rather than inventing coverage targets, this feature takes the twenty-six documented invariants and the ten gates as the definition of what must be enforced, on the grounds that each was paid for in real debugging and is therefore known to matter. The prose list is the input to this work and not an output of it: it is read, converted check by check, and then deleted.
- **The constitution's gates are not treated the same way.** They stay in `.specify/memory/constitution.md` and keep their own correspondence check, because the constitution is ratified governance text amended by procedure, not a working note that can be relocated into a test file. The asymmetry is deliberate: a gate is a rule about how the project works, an invariant is a rule about how the software behaves, and only the second can be stated as an assertion.
- **Real schema, real engine.** Verification runs against the actual EnergyPlus 26.1.0 schema bundle and the actual WebAssembly engine the page ships, because schema validation alone has repeatedly failed to catch what breaks a run and a substitute engine would prove nothing physical. Engine and schema staging is already a scripted step and is reused.
- **Physical expectations are directional and bounded.** Simulation output is not treated as a fixed figure to match exactly; each domain expectation states a direction and a tolerance with reasoning, so the suite survives a legitimate engine or platform difference without being weakened into meaninglessness.
- **The interface is covered where a recorded invariant lives there, and not otherwise.** The modules already kept free of browser dependencies are where the domain lives and where the suite concentrates, but the boundary is the invariant rather than the file: several of the costliest entries — the frame callback starving in a hidden tab, the `aria-label` that letters a figure and is never re-lettered, the class whose `[hidden]` twin it needs — sit in interface modules and are covered there, against a browser-like environment. Interface behaviour beyond those entries waits for later work. Claims a machine can only partly judge, such as readable at 390 px and nothing on hover, stay a human act, named as such rather than faked.
- **Static analysis is settled once, then enforced.** The linter and formatter are agreed, the existing source is brought into line in a single sweep of its own, and from then on a finding or an unformatted file is a failure like any other. The sweep is sequenced so it does not land on top of work in flight, and the suite is used to prove it moved no byte of any document the engine receives — which is the one reassurance worth having about a diff that touches every file.
- **A browser-like environment is development tooling.** The handful of recorded invariants that need one are checked against it by contributors and by the automatic check. It reaches no reader, so it sits under the same exemption as the existing build and deployment tooling.
- **Existing verification practice is absorbed, not discarded.** The throwaway-harness recipe already documented is a correct description of what must be checked; this feature makes those steps permanent and automatic rather than replacing them with something different.
- **The automatic check has somewhere to run.** The repository already runs a check workflow on every push and pull request, so adding the suite to automatic execution is an extension of existing machinery rather than new infrastructure.
- **Tooling reaches contributors only.** Whatever the suite needs is development tooling, exempt from the run-time dependency rule the same way the existing build and deployment tooling is, and is required to leave the published page's dependencies untouched.
- **Coverage is diagnostic, not the goal.** A percentage is reported to make gaps visible; the actual measure of the suite is whether breaking a known rule turns it red.

## Dependencies

- **`.specify/memory/constitution.md`** — its Development Workflow and Quality Gates section must be amended for this feature to be coherent, retiring both halves of "There is no test runner and no linter" and restating the ten gates as checks the suite executes. The amendment is part of this feature's change, not a follow-up.
- **`CLAUDE.md` and `docs/design-notes.md`** — both state that there is no test runner and both describe the throwaway-harness practice; both are updated in the same change.
- **The staged engine, schema bundle and station index** — all three are gitignored and produced by the existing setup scripts. The suite depends on those scripts continuing to stage them.
- **The existing automatic check workflow** — the suite runs alongside the consumer-register check that already runs on every push and pull request.
- **A browser-like environment** — needed for the recorded invariants whose subject sits in an interface module. Development tooling only; it reaches no reader.
- **The "Invariants that fail quietly" section as it stands today** — the suite's scope is defined by what it currently records, so an invariant missing from that list at the start of this work will be missing from the suite. After this feature the section no longer exists, and the checks are the record.
