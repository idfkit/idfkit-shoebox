# Implementation Plan: Overheating risk to CIBSE TM59

**Branch**: `002-tm59-overheating` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-tm59-overheating/spec.md`

## Summary

Read CIBSE TM59 (2026) criteria a, b and c off the run the desk already
produces, letter them on the scoreboard beside the fixed-line overheating
criteria, and print beside them what is not being judged. Add the one thing the
criteria need that the desk cannot express: a `Pattern` control kind carrying 24
hourly fractions, so the method's prescribed occupancy, equipment and lighting
profiles can be applied as a register overlay.

The feature is almost entirely arithmetic over series already in the ESO. It was
measured rather than assumed: a default desk built through `buildModel` and run
under EnergyPlus 26.1.0 locally returns `Zone Operative Temperature` and `Site
Outdoor Air Drybulb Temperature` hourly, and the `.rdd` confirms `Schedule
Value` is producible. So the sheet profile costs **one** new output request, the
occupancy schedule's own value series, which is the denominator every share is
taken over.

**The plan phase did the job the specification asked of it and the answer moved
the feature.** The reader supplied four CIBSE documents; the specification was
drafted against a provisional secondary reading of TM59 (2017) and TM52, and
three of its nine published figures are wrong for the current method. Criterion
b is no longer a share of annual hours above 26 °C but a count of nights whose
sleeping-hours mean exceeds a fixed threshold; criterion c moved from annual to
summer; and the daily weighted exceedance the specification requires as FR-002
is not a TM59 criterion at all, in either edition. The corrections are tabulated
at the end of [research.md](./research.md) and are owed to `spec.md` before
`/speckit-tasks`.

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, ES2022. No TypeScript, no
framework, no build-time transform beyond Vite's own.

**Primary Dependencies**: `@idfkit/core`, `@idfkit/schemas`, `@idfkit/engine`,
`@idfkit/engine-assets` (26.1.0), `@idfkit/weather`. **No new runtime
dependency**, which Principle V makes a hard gate: the criteria are arithmetic
over series the run already carries.

**Storage**: the URL fragment (the desk) and `localStorage` (the kept-scheme
shelf, the general notes). Nothing else, and nothing leaves the machine.

**Testing**: throwaway Node harnesses under `.harness/`, plus driving the page.
No test runner and no linter exist and none is added. The validation scenarios
are in [quickstart.md](./quickstart.md).

**Target Platform**: static site behind a CDN; EnergyPlus 26.1.0 compiled to
WebAssembly, running in a worker in the reader's own browser.

**Project Type**: single-page client-side application. One `src/` tree, no
backend, no packages.

**Performance Goals**: measured, not asserted. See "Performance budget" below.
The headline is that the whole feature costs **about 1.7 ms per annual solve**
and nothing detectable in the engine.

**Constraints**: every reading legible at 390 px without hover (Principle VII);
no per-surface output requests, which once took an annual run from 681 ms to
2,984 ms; the same URL reproduces the same numbers (Principle II); nothing that
reaches the IDF may escape `params`.

**Scale/Scope**: about 20,000 lines across 22 modules today. This adds two
modules (`src/tm59.js`, `src/tm59.data.js`), one control kind, six controls, one
preset, and touches `model.js`, `main.js`, `console.js`, `permalink.js`,
`epw.js`, `describe.js` and `tour.js`.

## Performance budget

Principle VI makes latency a design budget rather than a footnote, and the house
rule is that a number in this repository is measured or it is not printed. So
the criteria were prototyped and timed before the plan claimed anything about
them.

**How these were taken**: the default desk with Gains engaged, `sizingPeriods:
'No'`, `setAnnual(doc, true)`, run against
`USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.epw` on EnergyPlus 26.1.0 natively.
The A/B engine pairs were interleaved in one session, the way the per-surface
measurement that took an annual run from 681 ms to 2,984 ms was taken. The
arithmetic is the median of 200 iterations over the real 8,760-point series.

### The engine: no detectable cost

| | Median | Samples (ms) |
|---|---|---|
| Annual run, as the sheet is today | **484 ms** | 601 468 537 484 455 |
| Annual run, plus the schedule-value series | **473 ms** | 470 472 473 489 510 |

The delta is **−10 ms**, which is to say the one new output request is inside
the run-to-run noise of 455 to 601 ms and cannot be measured. The ESO grows
2,276,091 to 2,346,213 bytes, **+3.1 %**. FR-030 is satisfied with room to
spare, and the reason is structural: the request is schedule-level, not
per-surface, so it adds one series to fifteen rather than 158.

These are native timings and include process startup; they are not comparable to
the browser's 0.7 s figure and are not meant to be. What is comparable is the
A/B delta, which is the only thing this table is claiming.

### The arithmetic: 1.7 ms per solve

| | Cost | When |
|---|---|---|
| `dailyMeans(epw)` | **13.2 ms** | Once per weather file, on station attach |
| `runningMean` | **0.08 ms** | Once per weather file |
| Criterion a | **0.10 ms** | Per solve, per category |
| Criterion b | **0.73 ms** | Per solve, per category |
| Criterion c | **0.05 ms** | Per solve |
| **All five readings** | **1.71 ms** | Per solve |

Two things follow, and both are why the caching in the contracts is specified
the way it is.

**The 13.2 ms is the whole reason the running mean is cached on the weather
file's identity.** It is 8,760 lines of CSV parsed to 365 means, and it is
by far the most expensive thing here. Recomputed per solve it would be eight
times the cost of every criterion put together; recomputed per gesture frame it
would be the one expensive thing in a drag that is otherwise array indexing. It
belongs beside `offersFor` and `calendarFor`, cleared where they are cleared, on
a station change.

**1.71 ms is inside a 16.7 ms frame with room to spare**, which is what
satisfies FR-031. The readings are in fact taken once at the solve into
`lastOutcome`, by the rule that block already follows, so a gesture frame
re-letters from held numbers and pays nothing. The measurement matters anyway:
it says the design could afford to re-read per frame if it ever had to, so the
caching is an optimisation rather than a load-bearing constraint.

**Criterion b is the expensive one** at 0.73 ms, seven times criterion a, and
the reason is worth recording so a later reader does not assume it is
inherently costly: the prototype rebuilds an 8,760-entry hour index on every
call to reach across midnight into the following day. Sharing one index across
all readers would take it under 0.1 ms. It is left unoptimised because 1.71 ms
is already inside budget, and an optimisation nobody needs is a second thing to
keep correct.

**The design-day path costs nothing measurable.** 48 points against 8,760 is
180 times less work, and the criteria are absent on such a run in any case (see
the design-day exclusion in research.md). FR-030's design-day budget is not
under pressure from this feature.

### What must be re-measured in the browser

These are native Node figures. Before this feature ships, quickstart §10
re-takes the annual A/B against the WebAssembly engine in the page, because the
engine is a different build and the 0.7 s figure the desk quotes is the one
SC-010 is written against.

## Constitution Check

*Evaluated before Phase 0, re-evaluated after Phase 1. Both passes below.*

### I. Everything Runs in the Browser (NON-NEGOTIABLE): PASS

No simulation server, no compute endpoint, no upload. The criteria are read from
the ESO the local engine produced and from the EPW already in memory. The only
new data is `src/tm59.data.js`, generated at author time from the published
tables and shipped as a static module, exactly as `src/rates.data.js` is.

### II. Deterministic and Shareable (NON-NEGOTIABLE): PASS, with one design constraint

Six new keys reach the IDF and all six ride the fragment. The constraint is the
scalar rule: a `Pattern` is 24 numbers, so it carries **canonical text** and
parses at the boundaries, with `Days` as the worked example. This is not a
concession; it is what keeps `commit`'s guard, `encodeState`'s identity diff,
`decodeState`'s one-value-per-key rule and `revert`'s shallow `Object.assign`
all working unchanged, and it is what stops an array default being aliased into
live `params` and drifting `DEFAULTS_BY_VERSION.v1` with no symptom.

`LINK_VERSION` does **not** move. `roomType` defaults to `'As drawn'`, at which
`applyGains` writes byte-identically to today, so every link minted before this
feature omits the new keys, takes their defaults, and resolves to the same IDF.
Asserted, not assumed: quickstart §6.

Nothing about *how* the criteria are read rides the link, because there is
nothing to ride. No category is selected, no ventilation route is chosen, no
room type is declared for a criterion's sake.

### III. Read It Back Off the Model: PASS, and one departure argued in the open

Every figure is read off the run: operative temperature from the ESO, the
occupied-hours denominator from the run's own schedule-value series, coverage
from the run's timestamps, the ventilation route from the document.

**The departure**: the outdoor running mean is read from the **attached EPW**
rather than from the run. This is deliberate, it is the specification's
clarified decision (FR-008), and TM59:2026 §2.4.1 prescribes it outright: the
history is the daily means of 23 to 29 April, which no summer run period
contains. The defence is that the EPW is not outside the model. It is the other
half of what was handed to the engine (`ep.run({ idf, epw })`), so reading it
back is the principle rather than an exception to it. What would violate the
principle is the alternative: EnergyPlus's own `AdaptiveCEN15251` starts its
running mean at the beginning of the run, so on a June-to-August calendar it
would silently produce a different line from the one the method mandates, which
is the substituted value Principle IV forbids. Measured against a real run and
recorded in research.md Decision 3.

**One control declaration, once.** The `Pattern` kind, the six controls and the
TM59 preset are declared in `controls.js` and `schemes.js`; the console draws
them, `applyGains` applies them, the link codec validates against them. No
markup, default or label string is restated.

**Every claim cites its source in place.** Each criterion carries its clause
(`TM59:2026 §2.4.1`), each spec its `why` with the arithmetic, each
qualification its `because`. The adaptive formula is not taken on trust: it is
derived in research.md from the four clamp values the primary document prints,
and the derivation is asserted at module load.

### IV. No Silent Fallbacks: PASS

- `runningMean` throws where the EPW does not cover 23 April to 30 September;
  the criteria are then absent with that reason.
- A `Reading` with neither a value nor an absence, or with both, throws in its
  constructor. The em dash rule is structural rather than remembered.
- No criterion falls back to `Zone Mean Air Temperature` when operative
  temperature is missing. It is a different question by several degrees.
- A malformed pattern is refused whole, naming the field that is wrong. No
  half-reading of 23 hours.
- Criterion d has **no reader**, because a reader that always returned an
  absence would be a reading pretending to be one. It is declared, never read,
  and its reason is on the unjudged list.
- Six declaration invariants throw at module load (quickstart §1), including one
  that did not exist before: at least four `standing` qualifications, so SC-005's
  promise cannot silently fall below what it says.

### V. Only @idfkit/* at Runtime: PASS

Nothing added. The running mean is seven multiplications and a loop; the EPW
daily means are a column sum; the criteria are three array passes.

### VI. Latency Is the Interface: PASS

- **One** new output request on the sheet profile, schedule-level, not
  per-surface.
- A new lean profile `'tm59'` for study samples: three series, against
  `'sheet'`'s fifteen. Clear-and-rewrite is preserved, so "lean then sheet"
  still serialises byte-identically to "always sheet" and the sweep's restore
  holds.
- The running mean is cached on the weather file's identity, the way `offersFor`
  and `calendarFor` are cached on the ESO's, because the qualifications block
  and the criterion rows are rebuilt on every frame of a plate drag.
- Everything that reaches the IDF is on `params`. Nothing on `params` fails to
  reach the IDF, so no `prices: true` channel is needed and no key joins
  `PRICED_KEYS`.
- A run in flight does not blank the rows: they join `resultPanels` and are
  cleared by `clearReadings` on `solve`'s failure exits, where they actually
  stop being true.

### VII. Mobile-First and Responsive: PASS

The criterion rows fold at the schedules' existing 620 px breakpoint, each
figure keeping the head it was under via `data-head` set where the cell is
built. The qualifications block is prose in place, never on hover, by the rule
that put what *Chase* means above the scoreboard. The `Pattern` control's 24
fields fold behind the strip fold using the `hidden` attribute so they leave the
tab order with it. No new breakpoint is declared; if one were needed it would be
declared once in the stylesheet and read back as a custom property.

### Post-Phase-1 re-evaluation

No new violation appeared during design, and one risk was removed. The first
pass flagged the prescribed-profiles overlay as a possible `UNTOUCHABLE`
pressure: TM59's gains are per room in absolute watts, and converting them to
the desk's `m²/pp` and `W/m²` would need the floor area, which lives on Massing,
which a preset may never write. The design resolves it without relaxing
`UNTOUCHABLE`: `peopleCount` and `equipPeak` are **absolute** controls, so the
preset writes the published figure directly and never reads a channel it cannot
write. A figure that had been divided by the desk's floor area would also have
silently changed meaning the moment the reader moved a wall, which is the worse
failure of the two.

**The Complexity Tracking table is empty.** Nothing here needs an exemption.

## Project Structure

### Documentation (this feature)

```text
specs/002-tm59-overheating/
├── spec.md                       # the specification (corrections owed, see research.md)
├── plan.md                       # this file
├── research.md                   # Phase 0: the published figures, verified
├── data-model.md                 # Phase 1: the entities
├── contracts/
│   ├── tm59-module.md            #   src/tm59.js, the readers
│   ├── pattern-control.md        #   the new control kind and its three gates
│   └── scoreboard.md             #   what the existing surfaces grow
├── quickstart.md                 # Phase 1: how this is verified
├── checklists/requirements.md    # spec quality gate (passed)
└── tasks.md                      # Phase 2, by /speckit-tasks. Not created here
```

### Source Code (repository root)

```text
src/
├── tm59.js          NEW  the criteria, the running mean, the readers. DOM-free
├── tm59.data.js     NEW  the profile library, generated from TM59:2026 App. E
├── epw.js           +    dailyMeans(epw): 365 daily mean dry-bulb temperatures
├── controls.js      +    class Pattern; parsePattern / serializePattern;
│                         roomType, occPattern, equipPattern, lightPattern,
│                         peopleCount, equipPeak on the Gains channel;
│                         refuses() learns the kind
├── model.js         ~    applyGains writes three schedules and absolute levels
│                         when a room type is named; syncReporting adds the
│                         Occupancy schedule-value series and a 'tm59' profile
├── schemes.js       +    the TM59 preset; Target gains needs:'season', category
├── readings.js      ~    unchanged in behaviour; tm59.js imports hourly and
│                         environmentRuns from it
├── main.js          ~    readOutcome, targetBlock, renderScore, the count row,
│                         the qualifications block, the study metric
├── console.js       ~    buildControl draws the pattern kind
├── permalink.js     ~    readValue learns 'pattern' ABOVE the numeric regex
├── describe.js      +    which air model the criteria were read over (FR-026)
└── tour.js          ~    NOTES reviewed, storage key bumped

scripts/
└── build-tm59.mjs   NEW  generates src/tm59.data.js from the published tables,
                          cross-checked against the supplied 2017 CSV

.harness/            NEW  throwaway verification. Add to .gitignore
```

**Structure Decision**: the existing flat `src/` tree, unchanged. Two new
modules join it, both DOM-free and network-free so the Node harness drives the
real functions rather than a copy, which is the arrangement `readings.js`,
`describe.js`, `study.js` and `epw.js` already establish. `tm59.data.js` follows
`rates.data.js`: generated by a hand-run script, checked in, and never edited by
hand.

## Phase 0 output

[research.md](./research.md). Eleven decisions, **all NEEDS CLARIFICATION
resolved**. Every figure in this feature is quoted from a primary source and
none is reconstructed.

Settled here, against the documents themselves:

1. **TM59:2026 only.** The reader chose it at the plan phase.
2. **The four criteria as published**, all four over one assessment period,
   1 May to 30 September, 153 days. FR-002's weighted exceedance does not exist.
3. **The running mean is seeded from the EPW at 23 to 29 April**, exactly as
   §2.4.1 prescribes. FR-008 is vindicated unchanged.
4. **The series are verified against a real run**, not recalled. Occupied hours
   come from the schedule's own value series rather than a JavaScript
   reimplementation of EnergyPlus's day-type dispatch.
5. **The profiles are generated from Tables E.1 and E.2**, with the supplied CSV
   kept as the independent cross-check that caught two errors in the source
   tables and one internal disagreement between them.
6. **FR-017b discharged**: the count is over criteria a and b at Category II,
   the Stage 1 pair, and its row says so.
7. **The weather requirement is specific** (DSY1, 2050s, RCP8.5, 50th
   percentile, CIBSE 28-zone) and is quoted, never judged.
8. **Profiles are applied at the file's own local time**, unshifted, and the
   sheet says so.
9. **CL:2026 publishes two figures the harness asserts against**: 3672 and 1989
   occupied hours.
10. **TM52:2013 Box 2 is quoted**, closing the last open item. Equations 2.2 and
    2.3 are exactly as reconstructed, including the 3.8 denominator, and TM52
    independently confirms `K = 2` and `K = 3` from its own equations 6 and 8 and
    its Table 2. Two details the quotation settles: `Tod` is always the
    *previous* day's mean, so an off-by-one shifts the comfort line by a day for
    the whole season; and 3.8 is the sum of the weights, so equation 2.3 is a
    weighted mean and a dropped denominator is wrong by nearly four times while
    still looking plausible.
11. **A partial summer is a reading, not an absence, for criterion a.** TM52
    criterion 1 permits it outright ("If data are not available for the whole
    period ... then 3 per cent of available hours should be used") and TM59:2026
    neither restates nor contradicts it, while publishing absolute hour limits
    written for the full period. Both facts are printed beside the coverage and
    neither is resolved, on the same terms as the weather.

**Nothing is escalated.** The earlier draft of this plan carried TM52 as a
blocker for citing; it is now in hand.

## Phase 1 output

- [data-model.md](./data-model.md): `Category`, `Season`, `RunningMean`,
  `ComfortLine`, `Criterion`, `Reading`, `Coverage`, `Count`, `Qualification`,
  the `Pattern` control kind, the profile library, and what is deliberately not
  an entity.
- [contracts/](./contracts/): the three interfaces this feature exposes. It is a
  single-page application with no API, so the contracts are the module
  boundaries that a harness drives and that a later change must not break
  silently.
- [quickstart.md](./quickstart.md): eleven validation scenarios, in the order
  they are cheapest to run.

## Sequencing note for `/speckit-tasks`

The user stories are independently testable in the specification's own priority
order, and one thing should be built before any of them:

1. **Correct `spec.md`** from research.md's table. Building against FR-002,
   FR-003 and FR-004 as currently written would implement the 2017 method.

Then Story 1 (criterion a) and Story 2 (the qualifications) are one increment,
not two: the specification makes them equal-first, and shipping a reading before
the block that bounds it is the failure the whole of Story 2 exists to prevent.

## Complexity Tracking

*No Constitution Check violations. Nothing to justify.*
