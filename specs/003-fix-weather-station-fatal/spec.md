# Feature Specification: A station with incomplete design conditions is refused, not run

**Feature Branch**: `003-fix-weather-station-fatal`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Simple bug to fix: The Boston, MA weather locations (stn=994971) error the model with 'Fatal: Errors occurred on processing input file. Preceding condition(s) cause termination.'. That is an issue for any new user that goes to the platform for the first time and encounter an error even bofore they tried anything!"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A first reader searches for their city and gets a sheet, or gets told why not (Priority: P1)

Someone opens the page for the first time, types the name of a city into the
weather picker, and takes the station the picker puts at the top of the list.
Today, for Boston, that ends the session: the run stops with `Fatal: Errors
occurred on processing input file`, the sheet has no numbers on it, and nothing
on the page says what went wrong or what to do instead.

This is measured, not supposed. Typing `Boston` ranks WMO 994971 first, ahead of
Boston-Logan (725090). That site publishes design conditions with most of its
values missing: the placeholder text `N` stands where a wetbulb temperature and a
wind speed should be, and there is no annual cooling design day at all, only a
single January one. The sheet takes the January day as the cooling day anyway,
carries the placeholders through untouched, and hands the engine a model it
refuses to read. Two severe errors, then the fatal, before a single hour is
simulated.

Two things are wrong with that and both are the same rule: a value that could not
be read was passed on instead of refused, and a design day of the wrong season
was quietly stood in for the one that was missing. Running a Boston cooling
sizing against a 16.6 °C January day would be a wrong answer even in the case
where the engine accepted it.

**Why this priority**: it is the first thing a new reader does and it is the
worst outcome the page can produce. Every other claim this sheet makes, that its
numbers mean something, that a reading is traceable, that a refusal states its
reason, is unavailable to a reader whose first gesture ends in an engine fatal.

**Independent Test**: search for Boston, attach the top result, and observe the
outcome. It passes when the reader is either given a solved sheet or given one
sentence naming the station, saying what about its published design conditions
could not be used, and offering somewhere to go next. It fails on any run that
terminates during input processing.

**Acceptance Scenarios**:

1. **Given** a first visit with the stock desk solving on its built-in design
   conditions, **When** the reader searches for Boston and attaches the
   first-listed station, **Then** no run terminates on input processing, and the
   reader sees either that station's readings or a stated refusal.
2. **Given** a station whose published design conditions carry a value that is
   not a number where a number is required, **When** the reader attaches it,
   **Then** the station is refused whole and the sheet still shows the readings
   of the station it already had, unchanged.
3. **Given** a station that publishes no annual cooling design day, **When** the
   reader attaches it, **Then** the station is refused, and a design day of a
   different season is never used in its place.
4. **Given** a station whose published design conditions are complete, **When**
   the reader attaches it, **Then** it attaches and solves exactly as it does
   today, with no added wait and no extra download.

---

### User Story 2 - A shared link naming such a station is refused whole (Priority: P2)

A reader is sent a link that names a station whose design conditions cannot be
used. The link has to be refused the way every other unhonourable link on this
page is refused: whole, back to defaults, with the reason standing on the sheet,
rather than half applied into a desk that then fatals.

**Why this priority**: a link is the unit this page is shared in, so the failure
travels. It is second only because the reader arriving on such a link has usually
been sent it by someone who already met the picker, and fixing the picker path
stops most of these being minted at all.

**Independent Test**: open the page on a link naming the affected station and
confirm the desk lands on defaults with the reason stated, and that the sheet
never reaches the engine with that station's conditions.

**Acceptance Scenarios**:

1. **Given** a link naming a station whose design conditions cannot be used,
   **When** the page is opened on it, **Then** the whole link is refused, the desk
   stands at its defaults, and the status line names the station and the reason.
2. **Given** that refusal, **When** the reader moves a control, **Then** no solve
   overwrites the sentence explaining the refusal before the reader has read it.

---

### User Story 3 - The refusal is somewhere to go from, not a dead end (Priority: P3)

A reader refused a station wants the same city, not a lecture. The refusal has to
carry the next gesture with it: the same site's other published periods, and the
nearest other sites, so the reader gets to a station that works without starting
the search over.

**Why this priority**: it turns a stop into a detour. It is genuinely separable,
the sheet is already correct without it, and it is worth building only once the
refusal itself exists.

**Independent Test**: attach the affected Boston station, then reach a working
Boston station using only what the refusal put in front of you, and count the
gestures.

**Acceptance Scenarios**:

1. **Given** a refused station, **When** the reader reads the refusal, **Then**
   the other published periods of the same site and the nearest alternative sites
   are offered as things to attach.
2. **Given** a site with several published periods where one is refused, **When**
   the reader attaches a different period of that same site, **Then** it is
   judged on its own published conditions and attaches if they are usable.

---

### Edge Cases

- A site published with no design conditions file at all. This is already refused
  and must go on being refused, with the same sentence pattern as the new case.
- Design conditions that name no site location. Already refused; unchanged.
- A placeholder standing in a field the sheet never reads. The station must not
  be refused for a value nothing on the page depends on.
- One published period of a site is unusable and another is fine. Refusing the
  site as a whole would take four good archives down with one bad one.
- A refusal arriving while a run is in flight, or while a parameter sweep is
  landing samples. The sheet must not be left half attached, and readings already
  on the page belong to the station that is still attached, so they stay.
- A station reached from the reader's own coordinate rather than from a search.
  The same check applies; the reader did not choose the station by name and needs
  the refusal to say which one it was.
- A station whose heating conditions are usable and whose cooling conditions are
  not, or the reverse. Half a pair is not a pair.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST establish that a station's published design
  conditions are complete and usable before any part of the sheet, the model, the
  drawing, the title block or the bill, is switched to that station.
- **FR-002**: The system MUST require the specific heating and cooling design
  conditions it reads, and MUST NOT stand a design day of a different season,
  period or severity in place of one it did not find.
- **FR-003**: The system MUST treat a published value that is not a usable number,
  where a number is required, as missing, and MUST NOT pass it on to the engine.
- **FR-004**: A station whose design conditions fail either of the two preceding
  requirements MUST be refused whole. No parameter, reading, drawing or title
  block entry may change to reflect a refused station.
- **FR-005**: A refusal MUST state in place, on the sheet, which station was
  refused and what about its published design conditions could not be used, in
  terms a reader who does not know the file format can act on.
- **FR-006**: A refusal MUST offer the reader a next step: the same site's other
  published periods, and the nearest alternative sites.
- **FR-007**: After a refusal, the readings already on the sheet MUST stand
  unchanged and undimmed, because they remain true of the station that is still
  attached.
- **FR-008**: A shared link naming a station whose design conditions cannot be
  used MUST be refused whole, back to defaults, with the reason on the sheet, and
  no solve may overwrite that reason.
- **FR-009**: No station the picker can offer, by search, by nearest site, or by
  link, may produce a run that terminates during input processing.
- **FR-010**: The check MUST be made per published period, not per site, so one
  unusable period does not refuse the site's other periods.
- **FR-011**: The check MUST add no additional download and no perceptible delay
  to attaching a station.

### Key Entities

- **Site**: a named place the picker lists once, holding one or more published
  periods.
- **Published period**: one archive of a site, covering a stated span of years,
  carrying that period's weather year and that period's design conditions. Periods
  of one site disagree, so each is judged on its own.
- **Design conditions**: the heating design day, the cooling design day and the
  site location that the sheet reads out of a published period and puts into the
  model in place of the built-in ones. Complete or not usable; there is no partial
  state.
- **Refusal**: what the reader is shown instead of an attach: the station named,
  the reason stated, and the next steps offered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time reader who searches for a city and attaches the
  first-listed station never sees a run terminate during input processing. Every
  attach ends in one of exactly two states: a sheet with readings on it, or a
  stated refusal.
- **SC-002**: A reader refused a station reaches a working station for the same
  city in no more than two further gestures, using only what the refusal put in
  front of them.
- **SC-003**: Attaching a station whose conditions are complete takes no longer
  than it does today and makes no additional network request.
- **SC-004**: Across a sample of stations that includes at least one known to
  publish incomplete conditions, every design condition the sheet uses is
  traceable to the station and period that was attached, with no value taken from
  another period, another season, or another site.
- **SC-005**: The reported defect is closed: attaching WMO 994971 (Boston, MA), in
  every one of its five published periods, produces no engine fatal.

## Assumptions

- Refusing the station whole is the intended remedy, following the project's
  existing rule that a station whose design conditions cannot be read is refused
  rather than run against another city's. Attaching such a station for its weather
  year alone, with no design conditions and therefore no live design-day cadence
  and no datum lines on the plate, is a different and larger feature and is out of
  scope here.
- Whether a station's published conditions are usable cannot be known before its
  archive is fetched, so the check happens when the reader attaches, not while
  they are still reading the list. Marking stations in the list ahead of time is
  out of scope.
- The alternatives a refusal offers are offered by proximity and by being other
  periods of the same site. The sheet makes no promise that an offered
  alternative is itself complete until it too is attached and checked.
- Boston 994971 is the worked example, not the scope. The remedy is for the class:
  any published period whose design conditions are absent, incomplete, or carry
  placeholders where numbers belong.
- Behaviour for a site published with no design conditions file at all is already
  correct and is not changed, beyond making its refusal read like the new one.
- The remedy adds no run-time dependency and keeps everything on the reader's own
  machine.
