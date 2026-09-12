# Research: SI and IP Units

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-11

Every decision is recorded as Decision, Rationale and Alternatives. Facts about the page come from reading the source in this worktree, cited by `file:line`. Facts measured rather than read say so and name the script that measured them; those scripts are throwaway and live in the scratch directory.

## R1. The unit system is lettering, and it lives in one DOM-free module

**Decision**: a new `src/units.js` holds the `Kind` class, the frozen `KINDS` roster, the active system, `convert(kind, value)`, `letter(kind, value)` and the load-time assertions. It imports nothing from the page. `controls.js` imports it, so a control's own `format` is the first caller.

**Rationale**: the constitution requires every figure to be read back off the model (Principle III), so the SI value must stay the only value and conversion must happen at the moment of lettering. A DOM-free module is what lets a Node harness letter every kind at every precision without a browser, which is this repository's whole method of verification. `readings.js`, `report.js` and `tm59.js` are the established precedent.

**Alternatives considered**: converting `params` on the toggle (two copies of every value, and the IDF would move, which FR-003 forbids); converting inside each renderer (the drift Principle III exists to prevent); `Intl.NumberFormat` with unit styles (no entry for `Btu/h·ft²·°F` or `h·ft²·°F/Btu`, and it would put a second source of truth beside the declaration).

## R2. Kinds land on the declarations that already carry a unit string

**Decision**: every declaration that today carries a `unit` string gains a `kind`, and its formatter asks `units.js` instead of composing the string itself: `Ruled` (`src/controls.js:316-336`), `Quantity` (`src/study.js:216-274`), `Reading` (`src/survey.js:158-205`), `Target` (`src/schemes.js:155-224`), `Criterion` (`src/tm59.js:365-385`), `Instant` (`src/readings.js:279-305`), and `BillColumn`, `SCHEDULE_ROWS` and `SHELF_COLUMNS` in `main.js` (`:1363`, `:1220`, `:6071`). Sites that hardcode a unit in a template gain one too.

**Rationale**: a census of the lettering surface found **one** root formatter, `Ruled.format` reached through `formatValue` (`src/controls.js:333-335`, `:4848`), about eight partial per-domain formatters, and roughly forty bare literals with no declaration behind them at all, most of them in `main.js`: the quantities panel and derived readings (about twenty sites around `src/main.js:2346-2770`), the plate chart (`:735`), the bill build-up (`:1644-1826`), the schedules (`:10517`), the station picker (`:3710`). There is no single seam to cut. Putting the kind on the declarations that already exist means the surfaces that are already disciplined change in one line each, and the undisciplined ones acquire the discipline as they are converted.

Three bypasses are fixed on the way through: `src/main.js:9067`, `:9136`, `:9148` and `:10394` letter a survey `Reading` with `value.toFixed(reading.digits)` and never call `Reading.format` (`src/survey.js:200-204`), so today they draw a figure with no unit at all. They go through `Reading.format`.

**Alternatives considered**: a post-pass over the rendered DOM rewriting numbers (it cannot know a kind, and it would letter the same fact twice); a lint rule banning `toFixed` (useful later, but it does not convert anything).

## R3. IP positions are not stored: they fall out of the SI grid

**Decision**: no IP grid is stored, and no control gains a second set of stops. A control keeps its SI `min`, `max` and `step`. Each kind declares an **IP precision**, and the sheet letters the SI stop at that precision. A figure is "round in IP" because the precision is chosen so that the SI grid cannot skip one.

**Rationale**: the two boundaries disagree today, and the disagreement decides the design. `onFace` hard-snaps any value to `min + n*step` and then fixes it to the step's decimals (`src/controls.js:122-126`), so a slider or a typed box can never hold a value off the grid. But `decodeState` does not snap: it checks the text against `/^-?\d+(\.\d+)?$/` and then only `refuses(control, value)` (`src/permalink.js:412-422`), and `refuses` deliberately does not test step alignment for a scale (`src/controls.js:1614-1630`, with the comment saying why). So a link can carry `width=18.288` and hold it, while the reader's next nudge snaps it to `18.29` and the 60 ft is gone with no signal. Storing IP stops would widen exactly that gap. Deriving the lettering from the one grid closes it: every figure the reader sees is a figure their slider can return to.

**Alternatives considered**: a per-control IP step used while IP is showing (two grids, two round-trip stories, and `onFace` would have to know which system is showing, which puts the unit system one call away from `params`); storing values in IP for IP readers (Principle II and III both forbid it).

## R4. Eleven SI steps are refined, each to a divisor of its old step

**Decision**: these eleven controls take a finer step, and nothing else about them changes:

| Control | Step now | Step after | One old step in IP |
| --- | --- | --- | --- |
| `context.ctxDistance` | 0.5 m | 0.1 m | 1.64 ft |
| `context.ctxHeight` | 0.5 m | 0.1 m | 1.64 ft |
| `context.ctxWidth` | 1 m | 0.25 m | 3.28 ft |
| `air.openDeltaHi` | 1 K | 0.5 K | 1.80 °F |
| `air.openMaxWind` | 0.5 m/s | 0.25 m/s | 1.12 mph |
| `air.ventMaxWind` | 0.5 m/s | 0.25 m/s | 1.12 mph |
| `gains.occupancy` | 0.5 m²/pp | 0.05 m²/pp | 5.38 ft²/person |
| `gains.activity` | 5 W/pp | 0.25 W/pp | 17.06 Btu/h |
| `system.outdoorAir` | 0.5 L/s·pp | 0.25 L/s·pp | 1.06 cfm/person |
| `system.supplyMaxT` | 1 °C | 0.5 °C | 1.80 °F |
| `tariff.gridFactor` | 5 gCO₂e/kWh | 0.25 gCO₂e/kWh | 11.02 lb/MWh |

**Rationale**: *measured*, by `ip-reachability.mjs` over all 87 numeric controls. Thirty-five of the forty-six convertible controls are already fine enough that no IP figure at a sensible precision is skipped: one 0.01 m step is 0.0328 ft, so every tenth of a foot is reachable. These eleven are not. At `ctxDistance` one step is 1.64 ft, so most whole feet cannot be reached at all, and no choice of lettering can invent a position the grid does not have. FR-011 asks for round IP positions, so the grid has to give them.

Refining is safe because each new step **divides** the old one exactly, which makes the new grid a strict superset of the old. `step-refinement.mjs` walks every old stop of all eleven (235, 237, 197, 100, 79, 79, 113, 67, 41, 36 and 181 stops) through `onFace` on the new grid: **all eleven reproduce every old stop with zero drift**, every declared landmark stays reachable, and the converted step is now under one whole IP unit in each case. Nothing narrows, no default moves and no key is renamed, so by the constitution's own rule no `LINK_VERSION` bump is owed and `MIGRATIONS` stays empty.

Five of them (`ctxWidth`, `openDeltaHi`, `activity`, `supplyMaxT`, `gridFactor`) have a whole-number step and a whole-number minimum today, which is what makes `refuses`' integer rule apply (`src/controls.js:1620-1630`). After refining, that rule stops applying and a link may carry a fraction there. That rule exists because "a fraction there reaches an integer IDF field the engine rejects (a RunPeriod month of 6.5)", so each destination was checked against the 26.1.0 schema rather than recalled:

- `openDeltaHi` writes `AirflowNetwork:MultiZone:Zone`'s upper venting limit, `"field_type": "number"`, units `deltaC` (`src/model.js:1870`).
- `activity` writes `Schedule:Constant.hourly_value`, `"field_type": "number"` (`src/model.js:2084`).
- `supplyMaxT` writes `ZoneHVAC:IdealLoadsAirSystem.maximum_heating_supply_air_temperature`, `"field_type": "number"`, units `C` (`src/model.js:2333`).
- `ctxWidth` only computes shading vertices (`src/model.js:605`), which are coordinates.
- `gridFactor` is priced and reaches no IDF object at all (`src/rates.js:431`).

None is integer-typed, so the widening is safe.

**Alternatives considered**: leaving the steps and lettering those eleven at a coarser IP precision (a context distance lettered 10, 12, 13 ft, which is the "round figures" FR-011 rules out, and reads as a fault); a second IP-only grid (R3).

## R5. Two new invariants that throw at module load

**Decision**: `units.js` exports two assertions, both run at load.

1. `assertKinds()`: every kind has an SI unit, an IP unit, a finite non-zero factor and a precision, and no two kinds share an id. A declaration naming a kind that does not exist throws where it is declared.
2. `assertReachable(control)`: for every `Ruled` control whose kind is not the identity, one converted step must be no larger than the IP lettering increment. Refining a step, or adding a control with a coarse one, fails at load rather than drawing a figure the slider can never return to.

**Rationale**: gate 5 of the workflow, and the precedent is `readLandmarks`' third rule, which is the same arithmetic for the same reason: a band "falls between two positions of a `${step}` step, so the control can never read it" (`src/controls.js:284-290`). That check had to be written before anyone noticed five landmarks were unreachable. The IP grid deserves the check up front, not after a reader finds a foot they cannot stand on.

**Alternatives considered**: a one-off audit script (it answers for today's declarations only).

## R6. Every IP unit string is a single token

**Decision**: IP unit strings carry no whitespace: `Δ°F` for a temperature difference, `Btu/h·pp` for heat gain per person, `ft²/person`, `cfm/person`, `Btu/h·ft²·°F`, `h·ft²·°F/Btu`, `lb/MWh`.

**Rationale**: `copy.js` counts whitespace tokens after stripping markup (`src/copy.js:58-63`) and throws at module load for the asserted budgets, which are 12 words for a strip line, 15 for a step or a standing line and 6 for a fold summary (`src/copy.js:41-49`). `words()` already counts `1.80 W/m²K` as two tokens. Spelling the spec's "°F difference" or "Btu/h per person" literally would cost a strip line two or three extra words and throw the page at load, in a module nobody would think to look in. A single token costs exactly what the SI string cost.

This is a change of lettering from the spec's Units table, not of meaning; the table's "°F difference" is `Δ°F` on the page, and "Btu/h per person" is `Btu/h·pp`.

**Alternatives considered**: raising the budgets (the budgets are the reason the strips read at 390 px); a non-breaking space (still a token boundary for `words()` only if it were whitespace, and it invites a line break where the number is).

## R7. The toggle is a segmented selector (built in the control row, since moved to the header stamp)

**Decision**: a two-segment selector, **SI | IP**, in `.field .controls` beside the auto-solve toggle and the Run button (`index.html:5152-5158`), not in the console and not in a channel strip.

**Rationale**: the design system's segmented selector is exactly this shape, "exclusive states on one bordered rule", and exists so a console is "readable without opening anything" (`.interface-design/system.md:185-190`). The square marker is explicitly reserved: it "means a step that is armed" and the system says to reuse it "for any armed/not-armed state rather than inventing a switch" (`:421-426`). A unit system is not armed or unarmed, it is one of two modes, so the marker would say the wrong thing. The control row is where the page's other page-level controls already live, above the drawing and console split, and `mountConsole` owns only the strips and the rail (`src/console.js:138-190`), so a page-level control does not belong inside it. The system's rule for a control a reader has never met (`:475-492`) asks for the naming prose at the head of the block, never a tooltip, which the contract writes out.

**Alternatives considered**: the desk header beside Revert all (it is inside the desk panel, which is closed most of the time, and FR-001 needs the toggle reachable from every state); a checkbox styled like auto-solve (it would carry the armed marker, R7's own objection).

**Revised after the fact.** The selector was built in the control row exactly as decided here, then moved into the header stamp — the block carrying engine, runtime, toolkit and simulation server — as a fifth row of it. Everything above held except weight: at control-row scale it stood beside the two buttons that start runs, which reads far louder than a mode set once and then forgotten, while every row of the stamp is the same kind of statement, a fact about the page rather than a reading off the run. The stamp is static markup at the head of the sheet, so it keeps FR-001 as well as the control row did. `contracts/units-toggle.md` and `.interface-design/system.md` describe what is built; this entry records why it started where it did.

## R8. Remembering the choice, and the first visit

**Decision**: one key, `shoebox-units-v1`, holding `'si'` or `'ip'`, written through the same real-write probe `main.js` already uses for the scheme shelf (`src/main.js:4383-4392`). With no stored choice, the sheet reads `navigator.language`'s region subtag and starts in IP when it is `US`, in SI otherwise, including when there is no region.

**Rationale**: the three existing preferences all take this shape, a versioned key and every access in a try/catch (`shoebox-general-notes-v4` at `src/tour.js:43`, `shoebox-drawn-by-v1` at `src/sign.js:33`, `shoebox.schemes.v1` at `src/schemes.js:1527`). The probe is what distinguishes "storage is there" from "storage accepts a write", which a browser with site data blocked does not. A region subtag is a platform value, needs no request (Principle I) and reaches nothing but the lettering, which is what keeps Principle II's ban on locale honest: FR-003 and FR-017 already forbid the system reaching the document or the link, so the default cannot move a result.

**Alternatives considered**: always SI (every US reader pays a press, and the spec chose otherwise); guessing from the weather station (a reader who picks Boston to study it is not thereby American, and the station arrives long after the first figure is lettered).

## R9. Re-lettering without a run

**Decision**: switching calls one re-letter path: `api.sync()` for every control face (`src/console.js:2262-2265`), then the same render the last landed run drives, replayed from the outcome already in memory. No engine call, no `pump()`, no study tick.

**Rationale**: `api.sync()` already exists to redraw every face and is what `setState` ends with (`src/console.js:2317-2342`), so the controls half is solved. The readings half is lettered by `main.js` from the last outcome, which is the same object a landing run hands it, so replaying it is both cheapest and the only way to keep Principle III: a re-lettered figure is the same measurement, not a recomputed one. A run in flight is untouched and its readings stay dimmed (FR-002, story 1 scenario 4).

**Alternatives considered**: re-solving on a switch (it would spend the 50 ms budget to compute numbers it already has, and would make the toggle a thing a reader hesitates over).

## R10. Temperature and temperature difference are two kinds

**Decision**: `temperature` (factor 1.8, offset 32) and `temperatureDifference` (factor 1.8, no offset) are separate kinds. The five `K` controls and every dT on the sheet take the second.

**Rationale**: FR-009, and it is the single most likely way to letter a wrong number that still looks plausible: a 3 K deadband lettered as 37.4 °F reads as a setpoint. The declarations already distinguish them, since `K` and `°C` are different unit strings today (`air.openDeltaLo`, `air.ventDeltaT`, `system.setback`, `air.openDeltaHi`, `solver.tempTol` carry `K`), so the split costs nothing and the assertion catches a kind put on the wrong one.

## R11. What stays in SI, and two kinds the spec's table missed

**Decision**: unchanged in both systems, each for a stated reason: ratios and fractions, `ACH`, `×`, `× floor`, `°`, `pp`, `days`, `W` for a single appliance, money and rates per kWh, and test pressure in Pa. Two kinds the spec's Units table did not name are added: **illuminance**, `lx` to `fc` (`daylight.dlSetpoint`), and **carbon intensity**, `gCO₂e/kWh` to `lb/MWh` (`tariff.gridFactor`). Degree days keep their Celsius bases in both systems and say so.

**Rationale**: the roster came out of a dump of all 87 controls rather than from the spec's prose, which is how the two missing kinds surfaced. Degree days are the interesting case: `degreeDays` letters `HDD18` and `CDD10` (`src/weather.js:142-148`), where the number is a °C-day count and the 18 and the 10 are the base temperatures the published statistic is defined at. Converting the count while the label keeps saying 18 would be arithmetic nobody can check, and relabelling to `HDD65` would claim a statistic at a base this page did not compute. So the figure is left as published, in °C-days, and the reading says the base is in Celsius. That is the same call as the spec's Pa exception: a quantity defined by its convention, not by the reader's system.

**Alternatives considered**: converting degree days to °F-days at a converted base (a number this page cannot derive from what the station index carries).

## R12. Prose, published arithmetic and the general notes

**Decision**: `describe.js` letters its quantities through `units.js`, so the hand-typed unit words in its sentences (`' m tall'`, `' m²'`, `src/describe.js:223-273`) come from the kind. Landmark notes, `Spec.why` and every published citation are left exactly as written (FR-010). No general note is added, and no existing note changes meaning; the key is bumped to `shoebox-general-notes-v5` only if a step turns out to letter a unit.

**Rationale**: FR-010 was settled in clarification: a note cites its source as published. `Spec.why` is the same case one level up, since it "carries the arithmetic, because almost no published figure is in the units an IDF field wants" (design notes, "The register"), and converting a conversion would leave a reader unable to check either end. The description's own budget is unaffected because R6 keeps every unit one token, so a sixty-word paragraph stays a sixty-word paragraph.

## R13. The report records the system

**Decision**: the unit system joins the existing `desk` captured item's lines, built in `describeScreen()` (`src/main.js:10740-10743`) and lettered in `src/report-sheet.js:213`.

**Rationale**: FR-020, at the smallest possible cost. `ITEM_IDS` is a closed set asserted in the constructor (`src/report.js:47`, `:77-92`), so a new item id would mean a new heading, a new removable rule and a new row in the sheet for one line of text. The desk item is already "what the reader was looking at", which is exactly what the system is.

## R14. Typing in either system

**Decision**: `readQuantity` (`src/controls.js:138-151`) learns three things: the IP unit suffix for the box's own kind, the SI suffix whichever system is showing, and a leading `R-` where the kind letters with that prefix. A bare number is read in the system showing. Anything else is refused whole, as today.

**Rationale**: FR-013 and the clarification of 2026-09-11. The existing function already strips the control's unit "because it is what the box says when it is not being typed in", and the same reasoning extends to both systems: whatever the box letters, the reader can retype. The `R-` prefix is the one lettering on the desk that is not a suffix, and a reader who selects `R-20` and retypes it must get 20 back, not a refusal.

## R15. How this is verified without a test runner

**Decision**: three Node harnesses and two driven passes, in [quickstart.md](./quickstart.md): `units.js` lettered across every kind and precision against a table of hand-checked figures; the refined grids walked stop by stop for superset and landmark reachability (the script already written for R4); the codec round-tripped over every existing link fixture; then the page driven at desktop and at 390 px, in both systems, with the IDF byte-identity check from spec 007 on either side of a switch.

**Rationale**: the repository's established method (`CLAUDE.md`, "Verifying changes"), and `units.js` is DOM-free precisely so the first harness is possible.
