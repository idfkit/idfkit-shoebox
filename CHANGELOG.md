# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
