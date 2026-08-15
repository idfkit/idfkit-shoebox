# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A schedule of schemes, below the bill. Two instruments in one section, kept
  deliberately apart. **Standards** are laid *over* the drawing rather than in
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
  nudge a wall and the conformance falls away by itself, naming the clause that
  drifted. Alongside Passivhaus sit EnerPHit, LETI's commercial office targets —
  which set no control at all, and are in the list precisely to show that a
  specification and a target are different things — and two of this sheet's own
  partis, a shaded free-running heavyweight and an all-glass office plate,
  labelled as the sheet's own rather than borrowing anybody's authority.
  Criteria are read against the run as *asks for · reads · margin*, with one
  redline mark on a miss and none at all on a pass; a criterion whose limit PHI
  sets per building prints its reading with no verdict, and one the run cannot
  answer says what to do about it instead of standing as an em dash. Each
  standard also lists what this sheet **cannot** judge — the blower door, the
  primary energy, the thermal bridges, the peak heating load — because a panel
  showing only the half it can answer would read as a certification, and a
  one-zone shoebox with ideal loads is not one.

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
