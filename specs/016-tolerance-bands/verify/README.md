# Verification record: tolerance bands (016)

The repository has no test runner. These harnesses are the gates in
[quickstart.md](../quickstart.md), and this file is where their results are
recorded. A gate that could not be run is recorded as not run, never as passed.

Every page harness serves the production build (`npm run build`, then
`npx vite preview --port 4173`) and attaches the 012 feature's **synthetic**
London year through the file input, because the station picker's upstream is
unreachable from this environment
(`specs/012-attach-weather-file/verify/fixtures.mjs`). The figures below are
therefore a plausible climate, not a measured one: they prove the arithmetic and
the agreement, not anything about London.

## G1: what the wider study contents cost (T003, T004): PASS

`g1-contents-cost.mjs`. Median engine time (`callMain` only), 20 runs each,
one EnergyPlus per process, a study of the zone extremes carrying its own
contents ("default") against the band contents ("band").

| desk | run | default median | band median | ratio | "not generated" |
| --- | --- | --- | --- | --- | --- |
| default desk | design day | 772 ms | 765 ms | 0.991 | 0 |
| default desk | year | 2,160 ms | 2,131 ms | 0.987 | 0 |
| every channel in | design day | 892 ms | 858 ms | 0.961 | 0 |
| every channel in | year | 5,202 ms | 4,691 ms | 0.902 | 0 |

Worst ratio 0.991 against a budget of 1.10. The last row was re-run alone
(`G1_ONLY='every channel in|annual'`) after the first full run hit its
background time limit before reaching it; a one-run smoke test of the same row
had read 1.039. The spread is noise around zero.

Variables the band contents add, each confirmed in `eplus.rdd` by one extra run
with `Output:VariableDictionary` (the timed study runs request none):
`Zone Mean Air Temperature`, `Zone Operative Temperature`,
`Zone Air Heat Balance System Air Transfer Rate`, `Schedule Value` (all hourly,
zone level). Which of them the live solve's `'sheet'` profile already requests
is beside the point for cost, since the study samples never use that profile.

The fallback in research R1 was not needed. SC-004 stands as written.

## G2: band arithmetic (T014, T029): PASS

`g2-band.mjs`. 35 cases, every one passing, over hand-built curves laid on the
real positions `samplePoints` gives `shgc` and `gasPrice`, judged against
EnerPHit and Passivhaus through the real `readingForTarget`.

Two module bugs found and fixed on the way:

- **A tie compared floating-point distances exactly.** Two stretches the same
  number of steps from the stance arrived a few ulps apart and the upper one
  won, silently. Now equal within a thousandth of a step.
- Fixture mistakes, not module bugs: a curve that was exactly flat was
  correctly declared inert, and a "symmetric" tie was not symmetric on the real
  grid. Both fixtures were corrected rather than the module bent to them.

## G3: bands agree with the scoreboard (T025): PASS

`g3-agreement.mjs`. **45 of 45 checks agree** across ten desks: Passivhaus
specification chased against Passivhaus, EnerPHit and LETI; the same at
U-factor 2.5 and 1.6; SHGC at its stop; Fabric bypassed; a heating setpoint
swept past a cooling setpoint of 22 °C (refused positions); the EnerPHit
specification failing with no single lever; and a free-running desk where
heating is not judged. For every edge closed by a line failing, the desk was
reloaded without studies at the edge's last passing position (every readable
line clears on the chase line) and at its first failing one (the line the edge
named fails). Every named move restores every readable line (SC-003). Closest
call: ground reflectance at 0.54 reads 15.0 against 15, "over by 0.0", a fail
on both the band and the board.

The first run of this harness paired band lines with levers in link order;
cards come back in console order (Site before Glazing). It was stopped and
corrected before any result was read. The code review's fixes landed while
the second run was under way, so its later desks ran against the reviewed
build.

## G4: nothing leaks (T040): PASS

`g4-no-leak.mjs` (Node half): `applyModel` thrice byte-identical on the default,
Passivhaus and EnerPHit desks at design days and a year; `bandQuantities` has
one caller in `main.js`, `jobForStudy`; `encodeState` takes no chase or band.

Page half, in `page-bands.mjs`: the link (`location.hash`) is unchanged across
chasing one standard, switching to another, and stopping.

## G5: load invariants (T015): PASS

`g5-invariants.mjs`. The real module loads with all four invariants holding.
Broken once each in a copy of `src/` under the system temp directory:

| broken | caught by | names |
| --- | --- | --- |
| a line read off an unknown metric | `study.js`, first | the metric |
| band contents missing `overheat` | `tolerance.js` invariant 2 | the line and the quantity |
| band contents dropping the study's own reading | `tolerance.js` invariant 3 | the study quantity |
| a comparator passing above its limit | 012's pass-side probe in `survey.js`, first | the line |

Two are caught by an older invariant before the band's own is reached. The load
still fails naming the declaration, which is what the gate asks.

## The driven page (T022, T026, T032, T036, T037, T041)

`page-bands.mjs`, at 1400 px and then 390 px, SI pinned (the headless browser
reports a United States locale, which the sheet answers with IP).

**Passivhaus specification, chased against EnerPHit then Passivhaus** (studies
of ground reflectance, U-factor and SHGC): EnerPHit passes every judged line and
every band runs stop to stop. Against Passivhaus, the block reads
"U-factor 20 %, SHGC 60 % and Ground reflectance 100 %", least free first, and
lists cooling demand and peak cooling load as not judged in the standard's own
words.

**The same desk at U-factor 2.5, chased against Passivhaus**: heating reads
17.1 against 15. The block names **SHGC to 0.60 (+0.10, 12 % of travel)** as
the smallest single move, ahead of U-factor (−0.98 W/m²K, 18 %) and ground
reflectance (+0.39, 43 %).

**EnerPHit specification, chased against EnerPHit**: heating fails (about
33 kWh/m²·yr against 25 under this synthetic climate), no studied lever
restores every line alone, and the block says so and that only the three
studied were asked. SHGC is named as able to clear heating alone (it then
fails overheating), which is why its own card says no position passes every
line.

**US4, design days only** (`NO_YEAR=1`, Passivhaus specification, chased
against Passivhaus): peak heating load reads 14.8 against 10. Space heating
demand and hours above 25 °C are listed as **not judged** with the board's own
sentence ("attach a weather file — this is a year's number"), so SC-006 holds:
no band names a year-needing line as passed. U-factor is judged "on 1 of 3
lines". SHGC and ground reflectance are declared **inert by measurement**: a
winter design day's peak load does not move with either, exactly, across the
whole curve, so they draw no bar and say so rather than reading as free.

Checks, every one passing on each run:

- nothing chased: no block, no band;
- chased: block names the standard and the count asked, caveat in view, a band
  line on every studied card;
- **SC-004: switching the chase adds no engine run** (Runs counter 77 → 77);
- stop chasing: block hidden, bands gone, no run; link unchanged (G4);
- **SC-007: SI → IP → SI is character for character**, and IP really converts
  (U-factor 0.40–6.00 W/m²K reads 0.07–1.06 Btu/h·ft²·°F);
- FR-021: no "recommended", "best" or "optimal" anywhere in the block or bands;
- IP converts where a band letters a converting unit (not applicable on the
  design-days run, where every band is inert or unitless);
- 390 px: no sideways scroll;
- no page errors.

T037 needed no `aria-label` thunks: no band or block `aria-label` letters a
figure, and the block and card lines re-letter through `renderChase` and the
card rebuild, which the SC-007 round trip confirms.

One module bug found by driving the page and fixed: **the climate was stamped
when a point landed, not when its job was made.** A design-day sweep still in
flight when a year was attached landed its points as the year's, and the band
called every line unjudged. The job now carries `climateEpoch` from
`jobForStudy`.

Found and not fixed here, because it predates this feature: the chase line
letters its limit raw in SI beside an IP reading ("reads 10.6 against 25, over
by 2.7 kBtu/ft²·yr").

## Code review (xhigh, with fixes)

Fourteen findings; ten fixed and re-verified (G2, G5, the build, and the page
harness on two desks), three of them first reproduced in a browser:

- the band now measures from the lever's **current** setting, not the setting
  it was swept at, so moving the studied lever to the named position stops
  the card saying "Fails" (FR-002);
- a curve rebuilt from the cache drops placeholder points, so positions never
  run read as unlanded rather than as failed runs, and the climate reason
  survives an attach (FR-018);
- "Fails here" is said only where a run at the setting failed; otherwise the
  setting is "not judged" (FR-013);
- the block reads the curve each card is showing, partial sweeps included;
- `console.js` no longer imports `tolerance.js`, which had pulled its load-time
  checks ahead of the report sheet's error trap in the bundle;
- a chase change re-reads bands of sweeps still in flight;
- the climate flag resets on Clear;
- ties between levers compare shares within 1e-9 of travel;
- hidden-tab repaints coalesce on a microtask;
- the move wording has one helper.

Left, with reasons:

- ~~**Survey or pull samples answering a study position.**~~ Fixed after a
  report from the page; see "A study beside a survey" below.
- **Unjudged reasons read the live desk** (`targetBlock`), by design the
  board's own sentence; a per-study reason would need state the board lacks.
- **Keyboard focus on the method fold** is lost when the block repaints; fixing
  it means restructuring the block's markup so the fold survives a repaint.

## A study beside a survey of the same lever (reported from the page): PASS

`page-survey-shared.mjs`, on the reporter's own link: a study of wall
resistance beside a survey of wall resistance and infiltration, the desk on
the survey's infiltration-0 row, the Boston Logan TMYx year fetched through the
preview's proxy, chased against Passivhaus Classic. The card had read:

> Passivhaus Classic is not judged at this setting. Passes from 6.57 m²K/W (at
> 6.08 m²K/W this run carried no Peak heating load) to 6.57 m²K/W (…): move
> +0.01 m²K/W (0 % of travel). Also passes from 4.61 m²K/W to 4.61 m²K/W, kept
> apart. … The finer pass found a stretch the coarse pass stepped over.

Three causes, each fixed and each seen to change the line:

1. **The survey's samples answered the study's positions and carried TEDI
   alone.** The scheduler answers a job from any cached sample whose contents
   answer its `needed`, and the survey's fine 11 is the study's coarse 11, so
   every coarse position was a gap. Every sweep now builds `carried` through
   `sweepContents`. After this fix alone: "Passes from 4.61 (Peak heating load
   fails at 4.12) to 6.57 (not read beyond: at 7.06 this run carried no Peak
   heating load)".
2. **A run that never heated read as having no peak heating load.** Past about
   7 m²K/W this zone needs no heating in the Boston year; `readPeaks` returned
   null when no hour was positive. It now returns 0 when the series is present.
   After this fix: "Passes Passivhaus Classic from 4.61 m²K/W (Peak heating load
   fails at 4.12 m²K/W) to 10.00 m²K/W (the stop)", 55 % of travel.
3. **A setting between sweep positions read "not judged".** With the lever typed
   to 6.585 m²K/W (off the 0.49 grid; no re-sweep), the card adds "This setting,
   between two of the sweep's positions, is judged by the desk's own run."

Checks, all passing: a band line under the card; no position "carried no" or
"not read"; no single-point stretch and no "kept apart"; no stepped-over claim;
the setting judged; chasing adds no engine run (143 → 143); off the grid, judged
by the desk's run; no page errors. The rules for a gap that still happens (a
run that does not finish) are in G2: a gap inside a stretch is listed as
unread, never an edge, and "stepped over" is claimed only past a coarse run
that failed (46 cases, all passing). G4 now asserts `bandQuantities` is called
only from `sweepContents`, reached only by `jobForStudy` and `surveyContents`.
