# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Holidays you define. The Run strip's **Holidays** switch reads *From file*,
  *Listed* or *None*, and under it is the list itself: dates you type, days you
  remove, and five published calendars — United States, Canada, England and
  Wales, France, Germany, the same five regions the tariffs cover — that stamp
  themselves into it. Each entry becomes a `RunPeriodControl:SpecialDays`, so a
  fixed date (`12/25`), an nth weekday (`4 Thu in Nov`), a last weekday
  (`Last Mon in May`) and a multi-day shutdown (`12/24*9`) are all sayable. The
  list is drawn against a twelve-month rule, and the two kinds of date are
  marked differently on it: a fixed date gets a tick where it falls, an
  nth-weekday rule a hollow mark at its month's centre, because that is genuinely
  all the run period knows about it. What you type is what a scheme link carries
  — the field and the address bar speak one grammar — and a malformed entry is
  refused in words, in place, rather than clamped or dropped.

  The companion is on Gains, where the occupancy lives: **Holidays** as
  *As weekend*, *Closed* or *Open*. That control is the point of the exercise.
  Until it existed, every `Schedule:Compact` on the desk ran
  `For: Weekdays …` then `For: AllOtherDays`, and `AllOtherDays` swallows a
  holiday alongside Sunday — so observing a holiday and ignoring one produced
  the same building, and the switch that offered the choice was decorative. It
  now writes a `For: Holidays` row. Measured on a Denver year with the weekend
  open and the eleven federal holidays plus a nine-day Christmas shutdown
  listed: 488 against 499 MJ/m², a 2.2 % difference that was previously
  unreachable. At *As weekend* no row is written and the IDF is byte for byte
  what it was.

  Attach a year and each entry is lettered with the day it actually falls on —
  `3 Mon in Jan · Mon 16 Jan` — and ticked there on the rule. Anything outside
  the run is struck through and counted, because EnergyPlus drops such a day
  without a word — and there is no reading of it anywhere else: the error file
  is silent and the input echo lists every special day under every run period
  whether it lands or not.

  The reading is in **days, as a set**, because that is the unit that reaches the
  engine. One row can be a nine-day shutdown, and a shutdown beginning 24
  December is simulated up to the year end and then dropped, so a row can be
  partly in — it says `Sun 24 Dec · 8 of 9` on its own line rather than being
  struck through, which would be as wrong as saying nothing. Overlapping rows are
  unioned: the same shutdown swallows Christmas and, wrapping past the year end,
  New Year, so eleven federal holidays plus that shutdown is eighteen days and
  not twenty. Before a weather file supplies a calendar none of that is
  knowable, so the reading names what it can count — "12 holidays" — and becomes
  days once there is a year to count them in.

  All of it is checked against the engine rather than against itself: three runs,
  read back off their own `Site Day Type Index` series, agree with the desk's
  count exactly — 4, 9 and 10 days.

  One thing the arrangement cannot do, said here because the interface says it
  too. **Easter is not expressible** — an IDF date field carries no year, so Good
  Friday, Easter Monday, Ascension and Whit Monday cannot be written, and neither
  can Victoria Day, which is the Monday *preceding* 25 May and so is neither the
  third Monday nor the last. Each calendar therefore declares its whole national
  list and states, on the offer and before you press it, which days it is short
  and why: `DE 5/9`, `CA 8/10`.

  Attaching a station now also reads the EPW's own
  `HOLIDAYS/DAYLIGHT SAVINGS` record — not to fill the list, but to say what is
  in it. Every TMYx file names no holidays and no daylight saving period at all,
  measured across Denver, Berlin and the five files shipped with EnergyPlus, so
  *From file* has always been reading an empty list and reporting nothing about
  it. The strip now states it. A file that does name days offers them as one
  more stamp.

### Changed

- **A run that fails can be downloaded.** The bundle used to ride on the
  readings, so the download went dark at exactly the moment it became worth
  having: a fatal leaves no plate, no schedule and no bill, and until now it
  left nothing to carry off the page either — the one run nobody could debug
  here was the one run nobody could debug anywhere else. It now follows the
  run rather than the readings, and all three ways a solve can end without
  results — an engine that never accepted the model, a fatal, a run that came
  back clean but wrote no zone temperature — bundle exactly as a good one
  does.

  A failed bundle is not dressed up as a successful one. The button reads
  **Download failed run**, the file arrives as `…-failed.zip`, the manifest
  says so on its first line, quotes the sentence the page reported under *Why
  it stopped*, and leaves every figure the run never reached — the hours, the
  exit code, the error counts — as an em dash rather than a zero. It also
  points at `results/console.log` first, which is where the answer usually is:
  the engine echoes the whole of `eplusout.err` into its console, so the
  bundle carries the severes naming the object and the field, where the page
  itself could only ever show a count of them.

- **The run now follows the weather file's calendar.** `RunPeriod`'s day of week
  for the start day had been pinned to Tuesday since the model was written,
  which overrode what every weather file says about itself — TMYx declares
  `DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31` — and put every annual run on an
  invented year. Left empty, EnergyPlus takes the file's own start day and picks
  a real non-leap year to match it, so weekends fall where weekends fall. It is
  one field, and it is the only difference between the default IDF before this
  change and after.

  It matters more now that the year can be run in pieces. The field anchors to
  each run period's own begin date, so pinned, a January and a June would both
  start on a Tuesday and sit in two different calendars. Empty, they share one:
  measured, January begins Sunday and June begins Thursday, which is 2017.

  This moves results. Every annual run's day-of-week alignment shifts by two
  days, so anything scheduled by weekday — the occupancy band's weekends, the
  setpoint setback — lands on different dates than it used to, and any figure
  from a previous annual run is not comparable. Design-day runs are unaffected;
  a run period is not simulated without a weather file.

  It also makes the holidays true rather than approximately placed. Under the
  old Tuesday, Martin Luther King Day resolved to 21 January, Memorial Day to
  27 May and Thanksgiving to 28 November. Following the file they are 16 January,
  29 May and 23 November — the real 2017 dates, which is the year EnergyPlus
  picks for a Sunday start. And the weekend holiday rule finally does something
  real: with it on, New Year gains Monday 2 January and Veterans Day moves from
  Saturday the 11th to Monday the 13th, exactly as observed.

### Removed

- **A fifth weekday is no longer sayable.** `5 Fri in Dec` parsed happily and
  would have stopped the engine dead in any year December had only four Fridays
  — `** Severe ** SetSpecialDayDates: … not enough Nths`, a fatal error, not a
  warning. The nth now runs 1 to 4, plus `Last`. Every month has at least 28
  days, so those five always exist, which makes the grammar total: every list
  that parses runs, under every calendar. Nothing in any published calendar was
  a fifth weekday.

- Two entries starting on the same date are refused. EnergyPlus states plainly
  that it gives "no error message on duplicate days or overlapping days", so the
  second would have disappeared into the first without a word.

- Parameter studies. Every scale on the console now carries a quiet **Study**
  action that sweeps that one control across its full range — about twenty
  solves of whatever run the sheet would make, a second or two of engine on the
  design days, twenty seconds or so counted out per run on an attached year —
  and draws the response as a small curve under the control, with a redline
  tick standing where the control stands now. What the curve reads depends on
  the desk: free-running, the highest hour of zone temperature in the warm pen
  and the lowest in the cold one (the summer and winter design days' extremes,
  or the year's, sizing days excluded); with ideal loads in the path and a
  year attached, the demand intensities instead — TEDI in the warm pen, CEDI
  in the cold, and the building EUI in graphite, in kWh/m²·a of the bill's
  building section, delivered demand before any plant. The
  desk itself never moves during a sweep: the model ends byte-identical to
  where it started, the address bar and every readout hold still, and any real
  gesture cancels the sweep instantly. A study names the desk it was swept
  against and dims once any *other* control moves; dragging the swept control
  just walks the tick along a curve that is still true. Studies are cleared by
  a station change (they were swept under the old climate) and absent on
  priced channels, whose controls never reach the engine. A failed sample is
  drawn as a gap in the curve, never an invented point.

- Shareable scheme links. The address bar now carries the whole desk — every
  control off its default, the patch state, and the attached TMYx station with
  its exact year window — as a readable URL fragment
  (`#v1&width=20&wwrS=0.35&stn=725650`), rewritten on every gesture release. A
  **Copy scheme link** action joins the run ledger beside the bundle download,
  and the bundle's manifest now cites the link, so a run can be reproduced
  locally *and* re-solved live from the same download. Opening a link rebuilds
  and re-solves the scheme; a link that cannot be honoured — an unknown key, an
  out-of-range value, a station whose archive cannot be fetched — is refused
  whole with the reason in the status line, never half-loaded. The encoding is
  versioned so links keep working as controls are added.

- Downloadable run bundle. A **Download run bundle** button on the run ledger
  packages the exact IDF and EPW handed to the engine together with the tabular
  report and console log it wrote and a plain-text manifest, so any run can be
  reproduced in a local EnergyPlus rather than taken on faith. A design-day run
  carries no weather file, and the manifest says so instead of shipping a
  fabricated one.

### Changed

- The run period is a year of months, not two sliders. **Run from** and **Run
  to** on the Run strip are replaced by a twelve-cell calendar: tap a month to
  take it in or out, sweep across several in one gesture, or walk the year with
  the arrow keys and toggle from the keyboard. Months need not be consecutive —
  each unbroken group is handed to EnergyPlus as its own `RunPeriod`, so
  January and July can be solved without the spring between them, and the strip
  says in the engine's own words how many run periods the mask makes. Below
  400px the year folds to two rows of six rather than shrinking twelve cells
  past reading. A run needs at least one month, and the last one standing says
  so rather than quietly refusing.

  The rest of the sheet follows the run: a solve can now hold several weather
  environments, so the results schedule heads a column per run period with the
  months it covers, the chart letters each period's month ticks, and the run
  bundle's manifest names the periods instead of claiming "Annual". A weather
  file is no longer taken to mean a year — a bill metered over four months says
  so in its lede and draws no per-m² intensity, because every benchmark that
  figure exists to be compared against is twelve months long.

  Breaking, deliberately: the `beginMonth` and `endMonth` parameters are gone
  rather than migrated, and a scheme link naming either is refused. Nothing has
  been published yet, so there was no link to carry forward and no reason to
  spend a link version on one. The run period rides in a link as
  `months=001110000000`.

## [0.1.0] - 2026-08-14

Initial public build of the shoebox: a one-page, client-side EnergyPlus demo
laid out as a drafting sheet, served at
[shoebox.idfkit.com](https://shoebox.idfkit.com).

### Added

- In-browser EnergyPlus engine that re-solves as you work — a design day in
  about 50 ms — alongside an axonometric of the zone and a temperature plate,
  both drawn directly from the `IDFDocument`.
- Model console gathering every control onto one desk, with a balance rail that
  reads the zone air heat balance back off each run.
- Weather location picker over 17,000+ TMYx stations, searchable by city, state
  or WMO number or by nearest to your location; the chosen station's design
  conditions are taken from its DDY, and a full 8,760-hour year replaces the
  design days.
- Window overhang control, projecting shade measured along the host wall's
  outward normal so it holds under rotation.
- Bill of quantities priced from published, non-residential tariffs for North
  America (by state and province) and Europe (by country), reported in both
  cost and carbon.
- Licensing and disclosure section citing the open datasets and npm packages
  behind the page.

[unreleased]: https://github.com/idfkit/idfkit-shoebox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/idfkit/idfkit-shoebox/releases/tag/v0.1.0
