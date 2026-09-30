# Feature Specification: Chart Views on the Plate

**Feature Branch**: `015-chart-views`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Give users more control over what information is displayed in the interactive chart, starting with the ability to plot the same information differently, for instance in a psychrometric chart instead of a timeseries. I'd like you to propose a few other chart options that you think users would like to have. We can then choose together and fold them inside the spec."

## Clarifications

### Session 2026-09-29

- Q: Which alternative views of the same run are in scope beside the
  psychrometric chart? → A: All four proposed: carpet plot, adaptive comfort,
  duration curve, and average day by month.
- Q: Which further controls over the chart's content are in scope? → A: All
  four proposed: choice of series, energy signature, time aggregation, and
  zooming to a date range.
- Q: Is the chosen view carried in the permalink? → A: Yes, under a reserved
  view key. It reaches no IDF object, no solve key and no kept scheme, but a
  shared link opens on the same picture.
- Q: On the three scatter views (psychrometric, adaptive comfort, energy
  signature), what form should the previous run's ghost take? → A: An outline
  enclosing 90 % of the ghost's marks, taken from those marks without
  smoothing, plus each lettered count or share stated as "was → now".
- Q: What should the carpet view show as its ghost? → A: A "change" toggle,
  offered while a ghost stands, redraws the carpet as the difference now minus
  was on a signed cold/warm scale; the lettered extremes always read
  "was → now".
- Q: Which comfort region should the psychrometric view draw? → A: A choice.
  The ASHRAE 55-2020 graphic comfort zones (§5.3.1, 0.5 and 1.0 clo) by
  default, or the ASHRAE 55-2020 adaptive strip (§5.4) as the alternative,
  refused while mechanical cooling is in the path. Both are cited.
- Q: On what machine, or under what conditions, should the view-switch
  target (SC-001) be measured? → A: Two conditions on a year run, median of
  10 switches: under 150 ms on the maintainer's development Mac unthrottled,
  and under 500 ms in Chrome with 4× CPU slowdown.

## Definitions

- **Plate**: the chart beside the axonometric that currently draws zone mean
  air temperature against outdoor dry bulb temperature over the run, with the
  design-day datum lines, the previous-run ghost and the reading-hour marker.
- **View**: one way of drawing the results of the current run on the plate.
  The existing drawing is the **time series** view and remains the default.
- **Series**: one hourly (or per-timestep) quantity reported by the run, for
  example zone operative temperature or outdoor dry bulb temperature.
- **Ghost**: the results as they stood when the reader's current gesture
  began, drawn faintly beside the live results so that a figure that changes
  carries a record of what it changed from. It is replaced when the next
  gesture begins.
- **Stale state**: the last completed run, dimmed while a newer run is in
  flight. It is distinct from the ghost: the stale state stands in for results
  not yet arrived, the ghost records where a gesture started.
- **Reading hour**: the instant every meter on the desk reads, either the
  worst hour of the run or an hour the reader has pinned.
- **Year run** and **design-day run**: the two run lengths the desk solves.
  A design-day run covers one or a few 24-hour days; a year run covers the
  months selected on the Run strip.
- **View key**: the reserved permalink key that carries the view and its
  settings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the run on a psychrometric chart (Priority: P1)

A modeller looking at the plate wants to see the same run as states of moist
air rather than as temperatures over time: where the zone and the outdoor air
sit in dry bulb and humidity ratio, how much of the year falls inside a
published comfort region, and where the reading hour lies. They choose
"Psychrometric" on the plate and the drawing changes without a new
simulation.

**Why this priority**: It is the view the request names, and it introduces the
mechanism every other story depends on: a chooser on the plate that redraws
the same run in a different form.

**Independent Test**: Solve a year run, choose the psychrometric view, and
confirm the plate shows saturation and relative-humidity curves, the hourly
zone and outdoor states, a cited comfort region, and the reading hour, with no
new solve started.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** the reader chooses the psychrometric
   view, **Then** the plate draws dry bulb temperature on the horizontal axis
   and humidity ratio on the vertical axis, with the saturation curve and
   relative-humidity curves at 10 % intervals, and plots one mark per hour for
   the zone and for outdoors, distinguished by more than hue alone.
2. **Given** the psychrometric view is shown, **When** the reader reads the
   comfort region, **Then** its source is cited in place and the share of
   occupied hours the zone spends inside it is lettered beside it, one share
   per graphic zone.
2a. **Given** the psychrometric view on a free-running desk, **When** the
   reader chooses the adaptive region, **Then** the strip for the reading
   hour's day is drawn and labelled with that day, and the share tests every
   occupied hour against its own day's strip.
2b. **Given** mechanical cooling is in the path, **When** the reader opens the
   region choice, **Then** the adaptive region is listed as unavailable with
   the reason that ASHRAE 55 §5.4 excludes mechanically cooled spaces.
3. **Given** the psychrometric view is shown on a year run, **When** the
   reader clicks a zone mark, **Then** that mark's hour becomes the pinned
   reading hour, exactly as a click on the time series does.
4. **Given** the psychrometric view is shown, **When** the reader switches the
   sheet between SI and IP, **Then** the axes re-letter (humidity ratio in
   g/kg or gr/lb) without a new solve and without moving any mark.
5. **Given** the psychrometric view is shown, **When** the reader drags a
   control and new runs arrive, **Then** an outline enclosing 90 % of the zone
   states at the start of the drag stays drawn, and the comfort share reads
   "was → now".

---

### User Story 2 - Choose which series the time series draws (Priority: P2)

A modeller wants to compare air temperature with operative or mean radiant
temperature, or to hide outdoor temperature to read the zone more closely.
They open the series choice on the plate and turn series on or off.

**Why this priority**: It is the most direct reading of "more control over
what information is displayed", it uses series the run already reports, and
it is useful on every run length.

**Independent Test**: On the time series view, turn on zone operative
temperature and turn off outdoor dry bulb, and confirm the plate draws exactly
the chosen series, each labelled, with the legend and the accessible
description naming them.

**Acceptance Scenarios**:

1. **Given** the time series view, **When** the reader turns a series on,
   **Then** it is drawn with its own label in the right gutter and named in
   the plate's accessible description.
2. **Given** only one series remains on, **When** the reader tries to turn it
   off, **Then** the choice is refused and the plate says that at least one
   series must be drawn.
3. **Given** a series that the current desk does not report (for example a
   series owned by a bypassed channel), **When** the reader opens the series
   choice, **Then** that series is listed as unavailable with the reason
   stated, not silently omitted.

---

### User Story 3 - Judge comfort against an adaptive band (Priority: P3)

A modeller assessing a free-running or mixed-mode design wants to see zone
operative temperature against the running-mean outdoor temperature, with a
published adaptive comfort band drawn, so that they can see how many hours
fall above or below it.

**Why this priority**: It turns the plate into a comfort judgement that the
desk already half-computes for TM59, and it is the standard picture for
naturally ventilated buildings.

**Independent Test**: Solve a year run, choose the adaptive comfort view, and
confirm the band, its citation and the counts of occupied hours above, within
and below it.

**Acceptance Scenarios**:

1. **Given** a year run, **When** the reader chooses the adaptive comfort
   view, **Then** the plate draws one mark per occupied hour at (running-mean
   outdoor temperature, zone operative temperature), the upper and lower
   limits of the chosen category, and the count of hours above, within and
   below.
2. **Given** the adaptive comfort view, **When** the reader chooses a
   different published model or category, **Then** the band and counts are
   redrawn without a new solve.
3. **Given** a design-day run, or a weather file whose months cannot seed the
   running mean, **When** the reader chooses the adaptive comfort view,
   **Then** the view is refused in place with the reason stated and what would
   make it available.

---

### User Story 4 - See the year as a carpet (Priority: P3)

A modeller wants to see at a glance when in the day and the year the zone is
warm or cold: schedules, weekends, seasons and overheating episodes. They
choose the carpet view, which draws hour of day against day of year, shaded by
the chosen series.

**Why this priority**: It is the densest honest picture of a year run and
shows patterns that the time series band hides.

**Independent Test**: Solve a year run, choose the carpet view, and confirm a
24 by N grid with a lettered scale, weekends and holidays distinguishable, and
the reading hour marked.

**Acceptance Scenarios**:

1. **Given** a year run, **When** the reader chooses the carpet view, **Then**
   each cell is one hour, shaded on a single-hue scale with its extremes
   lettered in the sheet's unit system.
2. **Given** the carpet view, **When** the reader clicks a cell, **Then** that
   hour becomes the pinned reading hour.
3. **Given** a design-day run, **When** the reader chooses the carpet view,
   **Then** the view is refused in place with the reason stated.
4. **Given** the carpet view and a ghost standing from a drag, **When** the
   reader turns on "change", **Then** each cell shows the live value minus the
   ghost value on a signed scale centred on zero, and turning it off restores
   the plain carpet.

---

### User Story 5 - Count hours above a temperature (Priority: P3)

A modeller wants to know how many hours the zone spends above 26 °C, or below
18 °C, without reading a table. They choose the duration curve view, which
sorts the run's hours by temperature.

**Why this priority**: It answers the most common overheating question
directly and pairs with the existing TM59 readings.

**Independent Test**: Choose the duration curve view on a year run, tap or
step with the keyboard to a temperature, and confirm the count of hours at or above it matches
the count taken directly from the hourly series.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** the reader chooses the duration curve
   view, **Then** the chosen series are drawn sorted from hottest to coldest
   against the number of hours, with the design-day datum lines kept.
2. **Given** the duration curve view, **When** the reader taps, clicks or
   steps with the keyboard to any position, **Then** the plate letters the temperature and the number of
   hours at or above it, for each drawn series.
3. **Given** the duration curve view, **When** the reading hour is set,
   **Then** its rank on each curve is marked.

---

### User Story 6 - Read a typical day for each month (Priority: P3)

A modeller wants to see the diurnal swing and its damping and lag month by
month. They choose the average day view, which draws the mean 24-hour profile
of each chosen series for each month the run covers.

**Why this priority**: It makes the damping and lag readings visible and is a
familiar summary for clients.

**Independent Test**: Choose the average day view on a year run and confirm
one 24-hour profile per covered month, with the month named and the mean
computed only over that month's hours.

**Acceptance Scenarios**:

1. **Given** a year run covering N months, **When** the reader chooses the
   average day view, **Then** N profiles are drawn, each labelled with its
   month, and months the run does not cover are absent rather than drawn flat.
2. **Given** the average day view, **When** the reader asks for the reading
   hour, **Then** the plate states that a single hour cannot be placed on an
   averaged day, and marks the reading hour's month and hour of day instead.

---

### User Story 7 - Read demand against outdoor temperature (Priority: P4)

A modeller with the System channel in the path wants to see the building's
energy signature: daily heating and cooling demand against daily mean outdoor
temperature, and where the balance points fall.

**Why this priority**: It is valuable to energy modellers but only applies
when the desk carries a system, and it needs demand series at a finer grain
than the monthly meters.

**Independent Test**: With System in the path, solve a year run, choose the
energy signature view, and confirm one mark per day for heating and one for
cooling, and that the daily totals sum to the run's heating and cooling
totals.

**Acceptance Scenarios**:

1. **Given** System is in the path and a year run is complete, **When** the
   reader chooses the energy signature view, **Then** daily heating and
   cooling demand are drawn against daily mean outdoor temperature, and their
   sums equal the totals the sheet already reports.
2. **Given** System is bypassed, **When** the reader opens the view chooser,
   **Then** the energy signature is listed as unavailable with the reason
   stated.

---

### User Story 8 - Aggregate and zoom the time series (Priority: P4)

A modeller reading a year run wants daily or monthly means instead of the
hourly band, or wants to look at one week in July at full hourly resolution.

**Why this priority**: It refines the default view rather than adding a new
one, and the existing min/max band already gives a usable year overview.

**Independent Test**: On a year run, choose daily aggregation and confirm one
point per day; then select a date range and confirm every hour inside it is
drawn individually.

**Acceptance Scenarios**:

1. **Given** the time series view on a year run, **When** the reader chooses
   hourly, daily or monthly aggregation, **Then** the series are drawn at that
   grain, each point the mean of its period with the period's range shown.
2. **Given** a year run, **When** the reader selects a date range on the time
   axis, **Then** the plate redraws that range with every hour drawn, the
   range is lettered, and a single action returns to the whole run.
3. **Given** a zoomed range, **When** a new run arrives, **Then** the range is
   kept if the new run covers it, and released with a stated reason if it does
   not.

---

### Edge Cases

- A view that needs a year run is chosen during a design-day run: the view is
  refused in place with the reason, and the chooser does not fall back to the
  time series silently.
- A link opens on a view that the linked desk cannot draw (for example the
  energy signature with System bypassed): the desk loads, and the plate states
  why the linked view is unavailable; the link is not refused whole, because
  the view does not change what was simulated.
- A link carries an unknown view name or a malformed view setting: the link is
  refused whole, as any other malformed reserved key is.
- A run is in flight when the view changes: the view redraws the last
  completed run, dimmed as stale, and never blanks.
- The reader switches views while a study or survey is running: the studies
  continue uninterrupted and are not cancelled.
- The run carries no humidity series (for example an older link replayed by a
  build without them): the psychrometric view is refused with the missing
  series named, never drawn from a derived or default humidity.
- A reading is missing for some hours: those hours render as absent marks and
  stay out of every count and mean; zero is never substituted.
- A weather file covers part of a year: views that need whole-year data are
  refused for the months the file cannot support, using the existing
  file-season absence reason.
- Occupancy is at its 0.1 floor: occupied-hour counts use the desk's existing
  definition of occupied, not "fraction above zero".
- The plate is narrower than 780 px (the index sheet): every view remains
  legible, with the chooser reachable and no horizontal page scroll.

## Requirements *(mandatory)*

### Functional Requirements

#### The chooser

- **FR-001**: The plate MUST offer a view chooser listing: time series,
  psychrometric, adaptive comfort, carpet, duration curve, average day, and
  energy signature.
- **FR-002**: The time series view MUST remain the default and MUST render
  identically to the current plate when no view setting is changed.
- **FR-003**: Changing the view, the series selection, the aggregation, the
  zoomed range, or a view's own published model MUST NOT start a simulation,
  change the IDF, change the solve key, or cancel a study or survey in
  progress.
- **FR-004**: A view that the current run or desk cannot support MUST be
  listed as unavailable with its reason stated in view, and MUST name what
  would make it available where such a thing exists.
- **FR-005**: Every view MUST draw only what is read from the current run's
  results or from the IDF document that was simulated, and every comfort
  region, band or limit drawn MUST cite its published source in place.

#### Series and reporting

- **FR-006**: The run MUST report outdoor humidity ratio and zone air humidity
  ratio as hourly site-level and zone-level series on every sheet run, so that
  choosing the psychrometric view never requires a new solve.
- **FR-007**: When the System channel is in the path, the run MUST report zone
  heating and cooling demand at a grain sufficient to form daily totals for
  the energy signature (daily or finer).
- **FR-008**: Added series MUST be zone-level or site-level only; no
  per-surface series may be added.
- **FR-009**: The series choice MUST offer at least: zone mean air
  temperature, zone operative temperature, zone mean radiant temperature, and
  outdoor dry bulb temperature. Only series of one quantity kind may share an
  axis.
- **FR-010**: At least one series MUST remain drawn; the last one cannot be
  turned off.

#### The views

- **FR-011**: The psychrometric view MUST draw the saturation curve, relative
  humidity curves at 10 % intervals, one mark per hour for the zone and for
  outdoors, a published comfort region with its source cited, and the share of
  occupied hours the zone spends inside that region.
- **FR-011a**: The psychrometric view MUST offer two comfort regions, one at a
  time:
  1. **Graphic** (default): the ASHRAE 55-2020 §5.3.1 graphic comfort zones
     for 0.5 clo and 1.0 clo, bounded above by a humidity ratio of 0.012. One
     share is lettered per zone. An hour is inside a zone when its zone
     operative temperature and zone humidity ratio both fall inside it; air
     temperature is not used for the test.
  2. **Adaptive**: the ASHRAE 55-2020 §5.4 acceptability strip (80 % limits),
     drawn for the prevailing mean outdoor temperature of the reading hour's
     day and labelled with that day. The share tests every occupied hour's
     operative temperature against its own day's limits. Hours whose
     prevailing mean lies outside the method's 10 to 33.5 °C range are counted
     as outside its scope and lettered separately, never as inside or outside
     the strip.
- **FR-011b**: The adaptive region MUST be refused, with the reason stated,
  while mechanical cooling is in the path, and on any run that cannot seed the
  prevailing mean. Each region's applicability conditions (for the graphic
  zones, 1.0 to 1.3 met and air speed below 0.2 m/s) MUST be stated in a fold
  beside its citation.
- **FR-012**: The adaptive comfort view MUST draw zone operative temperature
  against running-mean outdoor temperature for occupied hours, the limits of
  the chosen published model and category, and the counts of hours above,
  within and below. It MUST offer the EN 16798-1 categories (the model TM59
  uses, Category II by default) and the ASHRAE 55 80 % and 90 % acceptability
  limits.
- **FR-013**: The running-mean outdoor temperature MUST be computed by the
  same method the desk already uses for TM59, not by a second method.
- **FR-014**: The carpet view MUST draw one cell per hour, hour of day against
  day of the run, shaded on a single-hue scale with its extremes lettered, and
  MUST distinguish weekends and holidays by more than hue.
- **FR-015**: The duration curve view MUST draw each chosen series sorted by
  value against hours, and MUST letter, at any position the reader taps,
  clicks or steps to with the keyboard, the value and the number of hours at
  or above it. The reading MUST NOT exist only on hover.
- **FR-016**: The average day view MUST draw one 24-hour mean profile per
  covered month per chosen series, computed only over that month's hours.
- **FR-017**: The energy signature view MUST draw daily heating and daily
  cooling demand against daily mean outdoor temperature; the daily values
  MUST sum to the run totals the sheet already reports.
- **FR-018**: The time series view MUST offer hourly, daily and monthly
  aggregation, each point the mean of its period with the period's range
  shown, and MUST allow the reader to select a date range and return to the
  whole run in one action.

#### Shared behaviour

- **FR-019**: The reading hour MUST be marked on every view that can place a
  single hour, and a click on an hour-identifiable mark MUST pin that hour as
  the time series does. A view that cannot place a single hour MUST say so.
- **FR-020**: The last completed run MUST remain visible in its stale state
  while a new run is in flight, on every view. The view MUST NOT blank during
  a solve.
- **FR-020a**: The ghost MUST be kept for every view. It MUST hold the whole
  set of results the gesture began from, not only the drawn series, so that a
  view switched to mid-gesture can draw it. It is drawn only when it covers
  the same hours as the live run.
- **FR-020b**: On the psychrometric, adaptive comfort and energy signature
  views, the ghost MUST be drawn as an outline enclosing 90 % of its marks,
  derived from those marks without smoothing, and every count or share the
  view letters MUST read as "was → now" while a ghost stands.
- **FR-020c**: On the carpet view, while a ghost stands, a "change" toggle
  MUST redraw each cell as the difference between the live and ghost values
  on a signed cold/warm scale centred on zero, lettered as a temperature
  difference. The carpet MUST NOT switch to the difference without the
  reader's action, and its lettered extremes MUST read "was → now" in either
  state. The toggle is withdrawn when no ghost stands.
- **FR-020d**: On the time series (at any aggregation), duration curve and
  average day views, the ghost MUST be drawn as a faint line for each drawn
  zone series, in the same pen as that series.
- **FR-021**: Every figure on every view MUST letter in the sheet's unit
  system, re-letter on a unit switch without a new solve, and treat
  temperature differences as differences.
- **FR-022**: Every view MUST carry an accessible description naming the view,
  its axes and its principal reading, and MUST NOT convey meaning by hue
  alone.
- **FR-023**: The view, the series selection, the aggregation, the zoomed
  range and a view's chosen published model or comfort region MUST be carried by the permalink
  under one reserved view key, omitted when at its default, and a malformed
  value MUST refuse the link whole. The ghost and the carpet's "change"
  toggle are transient and MUST NOT be carried.
- **FR-024**: A kept scheme MUST NOT store or restore the view; restoring a
  scheme leaves the current view in place.
- **FR-025**: Always-visible text added by this feature MUST stay within the
  copy budgets; method and citations beyond one short line go in a fold.
- **FR-026**: The general notes (onboarding) MUST be updated where a step's
  teaching changes, with the storage key bumped.

### Key Entities

- **View**: a named way of drawing the current run. Attributes: name, the run
  lengths it supports, the series or channels it requires, whether it can
  place a single hour, its accessible description, and its default settings.
- **Series selection**: the set of series drawn by views that draw series.
  Attributes: the series, each with its quantity kind and the channel that
  must be in the path for it to exist.
- **Published comfort model**: a region or band drawn on a view. Attributes:
  source citation, category or acceptability level, the inputs it requires
  (for example running mean or occupied hours), and its limits.
- **View setting**: the combination of view, series selection, aggregation,
  zoomed range and published model that the view key encodes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Switching between any two available views on a completed year
  run redraws the plate, as the median of 10 switches, in under 150 ms on the
  maintainer's development Mac unthrottled and in under 500 ms in Chrome with
  4× CPU slowdown, with zero simulations started in either case.
- **SC-002**: Adding the humidity series (and, with System in the path, the
  daily demand series) increases the median annual solve time by no more
  than 5 %, measured interleaved A/B as for the existing reporting profile.
- **SC-003**: For each view, the counts and shares it letters (hours inside a
  comfort region, hours above an adaptive limit, hours at or above a
  temperature) agree exactly with the same counts taken directly from the
  hourly series in a verification harness.
- **SC-004**: A permalink opened on another machine reproduces the same view
  and settings in 100 % of tested links, and the time series view with no
  settings changed produces a permalink byte-identical to today's.
- **SC-005**: Every view that needs a year run or a channel states a reason
  when unavailable; no view ever shows an empty plate without a stated
  reason.
- **SC-006**: Every view remains legible and operable at 390 px wide with no
  horizontal page scroll.

## Assumptions

- The psychrometric view's regions come from ASHRAE 55-2020 only (§5.3.1 and
  §5.4). A PMV region computed from clothing, activity and air speed is out
  of scope, because the model writes no clothing level or air speed today.
- The adaptive region's prevailing mean outdoor temperature is computed from
  the weather file by the method the adaptive comfort view uses (FR-013).
- The psychrometric chart is drawn at the site's standard barometric pressure
  derived from the elevation in `Site:Location`, read off the document.
- Occupied hours follow the desk's existing definition, which treats the
  0.1 occupancy floor as unoccupied.
- The view is a way of looking, like the unit system: it is carried by a
  shared link so that the recipient sees the same picture, but it is not part
  of what was simulated and therefore not part of a kept scheme.
- Series owned by a bypassed channel are unavailable rather than hidden.
- Studies, surveys and the E-02 relief are unchanged by this feature; their
  readings do not gain new views here.
- The energy signature uses the ideal-loads demand the bill already reports,
  before plant efficiency, consistent with TEDI and CEDI.
