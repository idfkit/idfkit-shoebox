# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Downloadable run bundle. A **Download run bundle** button on the run ledger
  packages the exact IDF and EPW handed to the engine together with the tabular
  report it wrote and a plain-text manifest, so any run can be reproduced in a
  local EnergyPlus rather than taken on faith. A design-day run carries no
  weather file, and the manifest says so instead of shipping a fabricated one.

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
