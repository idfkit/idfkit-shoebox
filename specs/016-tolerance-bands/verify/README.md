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

## G3: bands agree with the scoreboard (T025)

`g3-agreement.mjs`. See the result section at the foot of this file.

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
