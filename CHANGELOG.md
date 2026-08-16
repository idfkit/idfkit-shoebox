# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A register of standards, split the way the code splits them. The
  specifications live on the **console head** — five compact accordions beside
  the "Sixteen channels" paragraph, each folded to a name and a live
  conformance chip. **Standards** are laid *over* the drawing rather than in
  place of it: applying Passivhaus Classic writes the ten controls it has an
  opinion about — insulation derived from its U-values with the surface films
  taken off, a window at U 0.80 with the g ≥ 0.5 its own inequality demands, an
  airtightness converted from n50 0.6 by the divide-by-twenty rule, mechanical
  ventilation at 75 % recovery — and leaves the massing, the site, the context,
  the engine settings and the tariff exactly where you put them, so *what would
  it take to build this to Passivhaus* is a question you can ask of the building
  already on the sheet. Every number carries the arithmetic that produced it,
  the way the bill's rates do. Whether the desk still meets a specification is
  **measured off the controls** each time they move rather than remembered:
  nudge a wall and the chip falls adrift by itself, naming the clause that
  drifted. Alongside Passivhaus sit EnerPHit, LETI's commercial office targets —
  which set no control at all, and are in the list precisely to show that a
  specification and a target are different things — and two of this sheet's own
  partis, a shaded free-running heavyweight and an all-glass office plate,
  labelled as the sheet's own rather than borrowing anybody's authority.

- **Peak loads, read beside the energy.** A demand is what a building costs to
  run; a load is what has to be there on the worst hour, and it is the number
  the plant, the risers and the distribution are actually sized from — so the
  scoreboard now carries peak heating and peak cooling in W/m², and the shelf
  keeps the heating peak beside each scheme's energy. Passivhaus's *heating
  load ≤ 10 W/m²*, previously listed among the things this sheet could not
  judge, is now one of its lines, alongside the demand it is an alternative
  route to rather than a second hurdle. Unlike every other criterion here a
  load does **not** need a weather file: sizing days are precisely the
  conditions plant is designed against, so `Target.needs` distinguishes
  `'year'` from `'run'` and the board answers something on a desk that has
  never been near an EPW. It costs no new output request — the hourly system
  transfer rate the balance rail already draws is the whole of it. Worth
  seeing: the stock desk built to Passivhaus in Denver clears the heating
  *demand* at 8.6 kWh/m²·yr and misses the *load* at 13.9 W/m². Peaks get
  treated as an afterthought; this is what that costs.

- The targets became a **scoreboard on the sheet**, under the results they are
  read from — every standard's criteria against the one run, all at once, since
  nothing is remembered and there is no "applied standard" to filter by: one
  solved year, every published line it would clear or miss. Criteria read as
  *asks for · reads · margin*, with one redline mark on a miss and none at all
  on a pass; a criterion whose limit PHI sets per building prints its reading
  with no verdict, and one the run cannot answer says what to do about it
  instead of standing as an em dash. Each standard's accordion also lists what
  this sheet **cannot** judge — the blower door, the primary energy, the
  thermal bridges, the peak heating load — because a panel showing only the
  half it can answer would read as a certification, and a one-zone shoebox with
  ideal loads is not one.

- **Chasing a standard.** Any standard on the scoreboard can be armed with the
  same square marker the run ledger and the console's patch buttons use, which
  reduces it to its single worst line and letters that up beside the drawing —
  *Peak heating load reads 14.8 against 10, over by 4.8 W/m²* — with a ghost of
  where the margin stood when you took hold. The scoreboard reads a run; this
  reads a gesture, so the answer to "is what I am dragging right now helping"
  is under the hand rather than a screen away. The worst line is chosen by
  ratio rather than raw difference, since being 3 over means one thing against
  a limit of 15 and another against 55, and the line always says how many of
  the standard's criteria it is speaking for — a verdict from the two a design
  day can answer must not read as a verdict on a standard that states four.
  Chasing is the bill's pin in another column: chosen, visible, unchoosable,
  and making no claim about the building, so conformance stays the measured
  thing it was.

- **Kept schemes.** *Save this scheme* joins the run bundle and the scheme link
  in the run log, and keeps the whole desk — stored as the very fragment the
  link button copies, so keeping and sharing are one format and a scheme kept
  today still opens on a page that has since grown a channel. Each kept scheme
  carries what it was reading when it was kept, and the register differences the
  sheet against it — but only where the two are like for like, the same kind of
  run in the same currency over the same end uses, which is the bill's own
  refusal restated on data that survives the browser's storage. Restoring a
  scheme that names the attached station is instant; one that names a different
  station is a different climate, so it goes through the link and the page
  reloads into the decode that already knows how to refuse a weather file it
  cannot fetch. Schemes are named after they are kept, not before, because being
  asked to think of a name mid-thought is what stops anybody keeping anything.
  The shelf holds twenty-four and, when full, says so rather than quietly
  dropping the oldest; a shelf that cannot be read is refused whole with the
  reason in its place, never drawn as an empty one.

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
