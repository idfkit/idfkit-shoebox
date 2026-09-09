# Feature Specification: Upgrade to idfkit-js v0.3.0-rc.3

**Feature Branch**: `007-upgrade-idfkit-js`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Upgrade to idfkit-js v0.3.0-rc.3"

## Overview

The sheet is built on the idfkit JavaScript libraries and has been pinned to the
`0.1.0` line since it was written. Two releases have shipped since, `0.2.0` and
the `0.3.0` candidates, so the toolkit that writes every IDF this page hands out
is three lines behind the one its own authors maintain.

This feature moves the page onto `0.3.0-rc.3` and absorbs what that crossing
costs. It is a maintenance change with one hard promise attached: the building on
the sheet must not move. A reader who opens a link minted before the upgrade must
get the same drawing, the same IDF and the same numbers after it.

The upgrade crosses one release with breaking renames in it. The upstream release
notes name this page as the consumer they tested that crossing against, and
record it as two changed lines. This specification does not take that on trust.
It makes "the model did not move" a gate rather than an expectation, because the
two changed lines are the part that fails loudly and everything else is the part
that would fail quietly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shared link still reproduces its building (Priority: P1)

A modeller shared a link to a shoebox weeks ago. Someone opens it after the
upgrade is published. The drawing, every figure on the plate, the bill, the
results schedule and the scoreboard all read exactly as they did when the link
was minted, and the IDF downloaded from the run bundle describes the same
building it always did.

**Why this priority**: This is the whole promise of the page. A toolkit upgrade
that silently moves a vertex, reorders a construction's layers or changes how a
number is rounded turns every reading anybody has ever shared into an anecdote.
Nothing else in this feature is worth doing if this is not held.

**Independent Test**: Build the document at a spread of desk positions on the
current release and on the target release, and compare the written IDFs and the
simulation results. Fully testable outside the browser, with no interface work of
any kind, and it delivers the only outcome that matters on its own.

**Acceptance Scenarios**:

1. **Given** a set of desk positions covering every channel, **When** each is
   built and written on the current release and on the target release, **Then**
   the two IDFs are byte-identical apart from the header line naming the toolkit.
2. **Given** those same IDFs, **When** each is simulated, **Then** the resulting
   energy totals, zone temperature series and warning counts are identical.
3. **Given** a permalink minted before the upgrade, **When** it is opened after
   the upgrade, **Then** it is accepted whole and resolves to the same desk.
4. **Given** the document at any desk position, **When** the model is applied
   three times over, **Then** the output stays byte-identical.

---

### User Story 2 - The page still runs, end to end, on the new libraries (Priority: P1)

A reader loads the published page, drags a slider, watches it re-solve, attaches
a weather station, runs a year, opens a study, and downloads a run bundle. Every
one of those still works.

**Why this priority**: The crossing removes names the page imports and changes
what one of them is called. A missed rename does not degrade the page, it stops
it from building or from starting. This is P1 alongside the first story because
the two ship together: a page that reproduces its building perfectly and cannot
be loaded has delivered nothing.

**Independent Test**: Install the target release, start the page, and drive the
whole desk. The failure mode is loud: an unresolved name is reported by the build
with a file and a line, so this is testable in one pass.

**Acceptance Scenarios**:

1. **Given** the target release installed, **When** the page is built, **Then**
   the build completes with no unresolved import and no missing subpath.
2. **Given** the page loaded, **When** a slider is dragged, **Then** the sheet
   re-solves at the cadence it did before and the readings letter.
3. **Given** a weather station is chosen, **When** its files are fetched and a
   year is run, **Then** the bill, the schedule and the scoreboard all letter.
4. **Given** a run has landed, **When** the run bundle is downloaded, **Then**
   its manifest and its IDF header name the new toolkit version.

---

### User Story 3 - The sheet says which toolkit wrote the file (Priority: P2)

A reader comparing two IDFs downloaded months apart can tell from the header
which toolkit wrote each one, and the version stamped there is the one that was
actually bundled.

**Why this priority**: The stamp already exists and already works; what this
story protects is that it moves with the upgrade rather than being left behind.
It is P2 because the page is usable without it, but it is the one place where
this upgrade is visible to a reader at all, and a stale stamp is a false
statement in a file that outlives the tab.

**Independent Test**: Read the toolkit line in a downloaded IDF header and the
Toolkit row in the run bundle manifest, and confirm both name the resolved
version rather than the range in the manifest.

**Acceptance Scenarios**:

1. **Given** the upgrade is installed, **When** an IDF is downloaded, **Then**
   its header names the target version exactly, not a range and not the previous
   version.
2. **Given** a build that cannot read the installed version, **When** the sheet
   is drawn, **Then** the Toolkit row reads as an em dash rather than as a
   default version.

---

### User Story 4 - The written record matches the library (Priority: P3)

A maintainer reading the repository's own documentation finds the model document
called by the name the library now uses: in the architecture notes, in the
README, in the constitution's third principle, and in the prose comments that
explain the rule.

**Why this priority**: Documentation drift costs nothing on the day it happens
and costs a future reader an hour. It is P3 because no reading on the page
depends on it, but it belongs to this feature rather than to a follow-up because
a rename half applied is worse than one not applied at all.

**Independent Test**: Search the repository for the superseded name and find no
occurrence outside the changelog and the completed specifications, which record
what was true when they were written.

**Acceptance Scenarios**:

1. **Given** the upgrade is complete, **When** the repository is searched for the
   superseded document name, **Then** it appears only in the changelog and in
   previously completed specifications.
2. **Given** the governing rule in the architecture notes and in the
   constitution's third principle, **When** either is read, **Then** it names the
   document by the library's current name and states the same rule as before.

---

### Edge Cases

- **A type the document has never held.** The page relies on a measured
  behaviour: asking a document about a type it does not hold registers that type,
  and moves every later object of that type up the file. The page guards that at
  one call site, and the accumulated object order of every IDF it publishes
  depends on the guard being needed exactly where it is. The target release
  changed what happens when an *unrecognised* type is asked for. If it also
  changed what happens for a recognised type the document does not yet hold, the
  order of objects in every published IDF moves, no error is raised anywhere, and
  the only thing that would catch it is the byte comparison in User Story 1. This
  must be established rather than assumed.
- **Two resolved copies of one library.** The target release of the core library
  pins its schema package to an exact version. If the page's own schema pin does
  not move with it, the install tree may carry two copies: the page would then
  stage one schema bundle and read the schema through another, which is a
  disagreement with no error message at either end.
- **The toolkit stamp is inside the artifact being compared.** Every IDF this
  page writes carries a header line naming the toolkit that wrote it, so the
  upgrade changes one line of every file by design. The byte comparison has to
  treat that single line as the intended difference and everything else as a
  failure, or it either passes trivially or fails at every position.
- **A prerelease published to the released address.** The site's root address is
  a released issue of the drawing. A build whose stamped toolkit is a release
  candidate says so in the header of every file it hands out, which is honest but
  is a statement somebody has to intend.
- **The staged schema bundle grows.** The target schema package is larger than
  the pinned one, and the added weight is explanatory prose the page never
  fetches. It is staged and deployed regardless. What a reader downloads on a
  cold visit must not increase.
- **The weather calls still cross a rewritten origin.** The station index and the
  weather download are the page's only network requests beyond its own assets,
  and both go through a path rewrite that exists twice: once in the development
  server and once at the edge. Both must still work.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page MUST resolve the core, schema and weather libraries at
  version `0.3.0-rc.3`, and MUST resolve exactly one copy of each.
- **FR-002**: The page MUST continue to obtain from those libraries everything it
  obtains today: reading an IDF, writing an IDF, the model document type, the
  schema bundle and its HTTP source, the station index, and the weather file
  download.
- **FR-003**: For any desk position, the IDF written after the upgrade MUST be
  byte-identical to the IDF written before it, with the single exception of the
  header line naming the toolkit.
- **FR-004**: For any desk position, the simulation results after the upgrade
  MUST be identical to those before it: the same energy totals, the same
  temperature series, the same warning and error counts.
- **FR-005**: Applying the model repeatedly MUST continue to produce
  byte-identical output, at every desk position, on the new libraries.
- **FR-006**: A permalink minted before the upgrade MUST be accepted whole and
  MUST resolve to the same desk, with no change to the link format version.
- **FR-007**: The behaviour the page depends on when it asks a document about a
  type the document does not hold MUST be established on the new libraries, and
  the page's guard MUST be shown to be still necessary and still sufficient, or
  else corrected.
- **FR-008**: The toolkit version stamped into every written IDF and into the run
  bundle manifest MUST be the version actually resolved in the install tree, not
  the range declared in the manifest.
- **FR-009**: Where the installed version cannot be read, the sheet MUST letter
  an em dash rather than substitute any default.
- **FR-010**: The bytes a reader downloads on a cold visit MUST NOT increase.
- **FR-011**: The weather station picker MUST still find stations and fetch
  weather files, both through the development server and through the deployed
  distribution.
- **FR-012**: Every name the libraries have renamed MUST be updated at every use
  in the page's own code.
- **FR-013**: The repository's architecture notes, README, constitution and
  in-code prose MUST name the model document by the library's current name.
  Historical records (the changelog and the completed specifications) MUST be
  left as written.
- **FR-014**: The upgrade MUST NOT add any runtime dependency outside the idfkit
  packages the page already carries.
- **FR-015**: The change MUST be recorded in the repository's changelog.

### Key Entities

- **Toolkit pin**: the declared acceptable version for each idfkit library, in
  the page's manifest. What the page would accept.
- **Resolved toolkit version**: the version actually present in the install tree,
  frozen into the build and stamped into every IDF and every run bundle. What the
  file in the reader's hand was written by.
- **Staged schema bundle**: the schema data copied out of the installed package
  into the served directory before the page will load. Grows with the upgrade.
- **Desk position**: a complete set of parameters and patch state, which is what
  a permalink carries and what the byte comparison is run over.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a spread of desk positions exercising every channel, 100% of
  written models are byte-identical before and after the upgrade, once the single
  toolkit header line is set aside.
- **SC-002**: Across those same positions, 100% of simulation runs return
  identical energy totals, temperature series and warning counts.
- **SC-003**: 100% of permalinks minted before the upgrade are accepted and
  resolve to the same desk after it.
- **SC-004**: Repeated application of the model produces byte-identical output at
  every tested position, on the first, second and third application.
- **SC-005**: The whole desk can be driven end to end (drag, station attach,
  annual run, study, run bundle download) with no error, on the published build.
- **SC-006**: A design day still solves within the page's stated live budget of
  roughly 50 ms once the engine is warm, and an annual run within roughly 0.7 s.
- **SC-007**: The bytes transferred on a cold visit are the same or fewer than
  before the upgrade.
- **SC-008**: A search of the repository for the superseded document name returns
  no result outside the changelog and previously completed specifications.
- **SC-009**: Every IDF the page hands out names `0.3.0-rc.3` as its toolkit.

## Out of Scope

Three things this upgrade makes newly possible are deliberately not done here.
Each would change what the page computes, and this feature's promise is that the
page computes exactly what it computed before.

- **Reading the weather file through the library.** The target release adds a
  reader for the weather text this page already downloads, monthly means
  included. The page has its own reader, written for the overheating criteria,
  which computes daily means and reads the header. Replacing it would change the
  numbers on the scoreboard, or would have to be proved not to, and that proof is
  its own piece of work with its own gate.
- **Filtering stations by climate zone through the library.** The target release
  adds zone-code filtering that distinguishes the roughly three per cent of
  stations whose zone could not be determined. The page parses the zone out of
  the station's label itself, which is the shortcut the library's release notes
  argue against. Adopting it would change which stations the picker offers.
- **The engine and the engine assets.** These come from a different repository on
  a different version line, and the engine assets pin the EnergyPlus release the
  page simulates against. Moving either can move a result, which is the opposite
  of what this feature is for.

All three are worth doing, and each should be its own feature with its own
before-and-after comparison.

## Assumptions

- The request is read as a version move, not a refactor. Where the new libraries
  offer a better way to do something the page already does, the page keeps doing
  it its own way here, and the change is proposed separately.
- The exact prerelease named in the request is what gets pinned, rather than a
  range that would let the page drift onto a later candidate on its own. A
  prerelease pinned loosely is a build whose toolkit stamp is not reproducible,
  which the second principle forbids.
- Publishing a release candidate is intended. Every non-tagged build is served on
  the development channel, so the upgrade reaches a real address and is exercised
  there before any tag is cut.
- The libraries' own release notes are treated as a map of what to check, not as
  evidence that it holds. In particular, the claim that this page crosses the
  breaking release with two changed lines is a hypothesis this feature tests.
- Verification remains what it has always been on this page: throwaway harnesses
  under Node, a schema check, an integrity check and a real simulation, then
  driving the page. No test runner is introduced by this feature.
- The changelog entry is short and in the house voice, as the existing entries
  are.
