# Phase 0 research: CIBSE TM59

**Feature**: `002-tm59-overheating` | **Date**: 2026-09-01

This document replaces the "Published figures this specification rests on" table
in `spec.md`, which was a provisional secondary-source reading and is now
superseded. Every figure below is quoted from a document the reader supplied,
with the section it came from. Where this document and `spec.md` disagree, this
document governs and the specification is to be corrected; the list of
corrections owed is in the final section.

## Sources

Four documents were supplied and all four were read in full.

| Ref | Document | Used for |
|-----|----------|----------|
| **TM59:2026** | CIBSE, *Overheating risk in dwellings: a design stage methodology*, TM59 (2026), ISBN 978-1-912034-12-3 | The criteria, the modelling strategy, the gains profiles |
| **WFR:2026** | CIBSE, *Overheating risk in dwellings: weather file requirements*, TM59 (2026) | The mandated weather file |
| **CL:2026** | CIBSE, *Overheating risk in dwellings: overheating compliance checklist*, TM59 (2026) | The QA figures the harness asserts against |
| **TM59:2017** | CIBSE, *Design methodology for the assessment of overheating risk in homes*, TM59 (2017) | Establishing what changed, and only that |
| **TM52:2013** | CIBSE, *The limits of thermal comfort: avoiding overheating in European buildings*, TM52 (2013), ISBN 978-1-906846-34-3 | Equations 2.2 and 2.3, the category offsets, the ∆T rounding, the partial-period provision |

TM52 was supplied after the first pass of this document and closed its one open
item. Every figure in this feature is now quoted from a primary source and none
is reconstructed. See Decision 10.

**One note on the copy.** The supplied TM52 PDF is watermarked to a named
individual and a 2014 download (`031374`). That is a fact about the file rather
than about the figures, and it bears on one thing only: what this repository may
contain. Quote the equations and the clauses in comments and in the interface,
as the register already quotes Passivhaus and LETI; do not commit the PDF or
extracted pages of it.

## Decision 1: the 2026 edition, and only that

**Decision**: implement TM59:2026. TM59:2017 is read for context and is not
shipped.

**Rationale**: it is the current edition, it is what a UK planning authority now
asks for, and shipping both would double every declaration, every unjudged list
and every citation for a document that has been superseded. The reader chose
this at the plan phase.

**Alternatives considered**: shipping both editions behind a register entry
each, which was rejected for the cost above; shipping 2017 alone, which matches
the specification as drafted but is the superseded document.

**Consequence**: `spec.md`'s provisional table describes 2017 in three of its
nine rows and is wrong about the current method. The corrections are listed at
the end.

## Decision 2: the four criteria, as published

All four are quoted from TM59:2026 section 2.4 and Table 2. The assessment
period for **every** one of them is 1 May to 30 September inclusive, which is
153 days. This is the single largest correction to the specification: the 2017
bedroom criterion was annual and the 2017 mechanical criterion was annual, and
neither is any more.

### Criterion a, predominantly naturally ventilated spaces

> the number of occupied hours for which ∆T is greater than or equal to one
> degree (K) between 1st May and 30th September inclusive shall not be more than
> 3% of the occupied hours during this period.
> (TM59:2026 §2.4.1)

- Applies to living rooms, kitchens, home offices **and bedrooms**, in spaces
  that are predominantly naturally ventilated during occupied hours May to
  September.
- ∆T is operative temperature minus the applicable threshold, **rounded to the
  nearest whole degree**, which TM59 spells out: "for ∆T between 0.5 and 1.49,
  the value used is 1 K; for 1.5 to 2.49, the value used is 2 K, and so on."
  **Use TM59's wording, not TM52's.** TM52 §6.1.2 writes the same rule as "for
  ∆T between 0.5 and 1.5 the value used is 1 K; for 1.5 to 2.5 the value used is
  2 K", which puts 1.5 in both bands and settles nothing at the boundary.
  TM59:2026 closes the interval at 1.49 and so decides it: 1.5 rounds **up**.
  JavaScript's `Math.round` is half-up for positive numbers, so `Math.round` is
  the correct implementation and a "round half to even" helper would be wrong at
  exactly the values the criterion is most often decided on.
- Unchanged from 2017 (TM59:2026 §1.6 says so outright). It is TM52 Criterion 1
  and nothing else.

### Criterion b, bedrooms

> the number of nights for which the mean operative temperature during hours of
> sleep exceeds Tn, between 1st May and 30th September inclusive shall not be
> more than four nights during this period.
> (TM59:2026 §2.4.2)

- **Tn = 26 °C for Category I, 27 °C for Category II.** Fixed, not adaptive.
- Hours of sleep are **23:00 to 08:00**, and the reading is the **mean** over
  those nine hours, not an hourly count.
- The night is attributed to its opening date: "The mean bedroom temperature for
  1st May is based on the temperatures between 11 pm on 1st May and 8 am on
  2nd May, and the mean bedroom temperature for 30th September is based on the
  temperatures between 11 pm on 30th September and 8 am on 1st October."
- Applies to naturally ventilated **and** mechanically ventilated bedrooms, in
  addition to criterion a or c.
- No ceiling-fan uplift is permitted against this criterion.
- **Completely different from 2017**, which counted hourly exceedances of 26 °C
  between 22:00 and 07:00 against 1 % of the annual hours. The basis is new
  evidence (Lomas and Li, 2023: a literature review plus measurements in 591
  English homes) that the right quantity is nights of disrupted sleep against a
  mean, not hours against a peak.

### Criterion c, predominantly mechanically ventilated spaces

> the room operative temperature shall not exceed 26 °C between 1st May and
> 30th September inclusive for more than 3% of occupied hours during this
> period. (TM59:2026 §2.4.3)

- Threshold is 26 °C for both categories.
- Used only where natural ventilation openings are constrained and mechanical
  ventilation and/or cooling is installed.
- **The period changed**: 2017 read this over annual occupied hours.

### Criterion d, communal areas

> the operative temperature shall not exceed 28 °C between 1st May and
> 30th September for more than 3% of occupied hours during this period.
> (TM59:2026 §2.4.4)

- Communal circulation outside the dwelling: corridors, stairwells, lift and
  entrance lobbies.
- New as an integral criterion in 2026 (2017 carried it as a flag with "no
  mandatory target").
- **This desk has one zone and no communal circulation, so criterion d is
  unjudged.** It is declared on the unjudged list, not on the scoreboard.

### The adaptive threshold

TM59:2026 §2.4.1 does not print the formula; it prints the two clamps and the
slope condition, which pin it exactly:

- Thresholds increase linearly with Trm between Trm = 10 °C and Trm = 30 °C.
- Below Trm = 10 °C: **24.1 °C** (Cat I), **25.1 °C** (Cat II).
- Above Trm = 30 °C: **30.7 °C** (Cat I), **31.7 °C** (Cat II).

The BS EN 16798-1 form `Tmax = 0.33·Trm + 18.8 + K` reproduces all four
endpoints exactly at K = 2 for Category I and K = 3 for Category II:

| | Trm = 10 | Trm = 30 |
|---|---|---|
| Cat I (K=2) | 0.33·10 + 18.8 + 2 = **24.1** | 0.33·30 + 18.8 + 2 = **30.7** |
| Cat II (K=3) | 0.33·10 + 18.8 + 3 = **25.1** | 0.33·30 + 18.8 + 3 = **31.7** |

So the formula is not taken on trust from a secondary source: it is the unique
line through the two clamps the primary document prints, and the check above is
the arithmetic that establishes it. This is the derivation to letter in place.

**TM52:2013 confirms it from the other direction**, which is worth having
because the two derivations are independent. TM52 §6.1.2 gives the comfort
temperature as `Tcomf = 0.33 Trm + 18.8` (equation 6) and the Category II
maximum as

> Tmax = 0.33 Trm + 21.8 (equation 8)

which is equation 6 plus 3, and then:

> This sets the maximum acceptable temperature (Tmax) at 1 K less than the above
> recommendation. (Category I)

which is equation 6 plus 2. TM52 Table 2 gives the same offsets as the
categories' own acceptable ranges: **Category I ±2 K, Category II ±3 K,
Category III ±4 K**, with Category I "only used for spaces occupied by very
sensitive and fragile persons" and Category II "Normal expectation (for new
buildings and renovations)". So `K = 2` and `K = 3` are published figures, not
inferences, and the clamp arithmetic above is a check on the transcription
rather than the source of it.

**Category III is not offered.** TM52 assigns it to existing buildings and TM59
names only I and II. A third line on the scoreboard would be this sheet adding a
category the method does not use.

### There is no weighted-exceedance criterion, in either edition

`spec.md` FR-002 requires "the greatest daily weighted exceedance reached on any
day", TM52 criterion 2, against a limit of 6. **TM59 uses no such criterion.**
TM59:2017 §4.2 says it in as many words:

> Criteria 2 and 3 of CIBSE TM52 may fail to be met, but both (a) and (b) above
> must be passed for all relevant rooms.

TM59:2026 borrows from TM52 only the rounding rule for ∆T. FR-002 is to be
struck, and with it the "Daily weighted exceedance limit" and "Hourly weighting"
rows of the provisional table. The rounding survives, attached to criterion a
where it belongs.

With TM52 now in hand, the figures FR-002 was reaching for can be stated exactly
so that the deletion is made knowingly rather than by omission. TM52 §6.1.2(b)
defines `We = Σ(he × wf)` with `wf = 0` where `∆T ≤ 0` and `wf = ∆T` otherwise,
against a limit of 6 in any one day; §6.1.2(c) defines criterion 3 as `∆T` not
exceeding 4 K; and a room "that fails any two of the three criteria is classed
as overheating". **That whole apparatus is TM52's, and TM59 adopts none of it.**
TM59 takes one criterion, criterion 1, applies it on its own with no
two-of-three rule, and adds its own criteria b, c and d. Implementing We here
would be importing a different document's compound judgement under TM59's name.

## Decision 3: the running mean, and where its history comes from

TM59:2026 §2.4.1 prescribes the seeding exactly, and it vindicates the
specification's clarification decision (FR-008) without amendment:

> First, using Equation 2.3, the Trm value for 30th April is calculated using the
> daily mean temperatures of the seven days between 23rd April and 29th April.
> Then, using Equation 2.2, Trm for 30th April is fed into Equation 2.2 as Trm-1
> and, together with the daily mean temperature for 30th April, the Trm value for
> 1st May is obtained. These calculations would usually be done by the modelling
> tool.

**Decision**: read the daily mean outdoor dry-bulb temperatures for 23 April
onwards out of the attached EPW and run the recursion in JavaScript. Seed at
30 April by Equation 2.3 over 23 to 29 April; recurse by Equation 2.2 to
30 September.

**Rationale**: the method itself says the history is 23 to 29 April, which is
outside any summer run period the desk can produce and inside no simulation at
all for a June-to-August calendar. The quantity reads only outdoor temperature,
which the EPW carries for all 365 days whether or not the engine touched them.
It therefore costs no engine time (FR-008a), needs no extra environment, and
loses no assessed day to warm-up. A run split into several month groups is
seeded once, from 23 April, and the recursion runs through the gaps: the comfort
line is a property of the climate and does not know which days were simulated,
so a June-to-August run is judged against exactly the line a full year would
have produced over those days (FR-013).

**Alternatives considered and rejected**:

- **EnergyPlus's own `AdaptiveCEN15251` comfort model.** Measured against a real
  run: the engine offers one adaptive series in the `.rdd`, `Zone Adaptive
  Comfort Operative Temperature Set Point`, and the CEN15251 category variables
  appear only when a `People` object declares the model. Two disqualifications.
  First, it couples the comfort line to the Gains channel being engaged, so
  bypassing Gains would take the line away, which is a physical absurdity: the
  weather does not stop having a running mean because nobody is home. Second,
  and decisively, EnergyPlus starts its running mean from the beginning of the
  run rather than from 23 April, so on a June-to-August calendar it would
  silently produce a different line from the one TM59 mandates. A quietly
  substituted value is exactly what Principle IV forbids.
- **A throwaway lead-in environment.** Each environment converges its own
  warm-up from its own first day, so a simulated week before 1 May establishes
  nothing that carries forward, and it costs engine time to establish it.
- **Seeding from an assumed Trm.** Carries a stated error through roughly the
  first week of the assessment period, which is inside the period being judged.

## Decision 4: reading the run rather than reasoning about it

Three series are needed. Two are already requested and one is new.

**Verified against a real run**, not recalled: the default desk was built through
`buildModel`, written to IDF, and run under EnergyPlus 26.1.0 locally (exit 0).
The `.eso` dictionary carries, hourly:

```
7,1,Environment,Site Outdoor Air Drybulb Temperature [C] !Hourly
16,1,ZONE ONE,Zone Operative Temperature [C] !Hourly
```

and the `.rdd` confirms `Zone Operative Temperature` and `Schedule Value` are
both producible at this version. So criteria a, b and c cost **no new output
request on the sheet profile** (FR-030), which is what makes the latency
requirement satisfiable rather than aspirational.

**Decision on occupied hours**: request `Output:Variable, Occupancy, Schedule
Value, Hourly` and read the denominator off the run.

**Rationale**: FR-009 requires occupied hours to come from the document that was
simulated. Two routes satisfy that literally. Evaluating the `Schedule:Compact`
in JavaScript would mean reimplementing EnergyPlus's day-type dispatch, because
the Occupancy schedule the Gains channel writes carries `For: Weekdays`,
`For: Weekends` and, at `holidayUse: 'Listed'`, `For: Holidays` branches, and
which branch a given hour takes depends on the calendar EnergyPlus picked for
the weather file. That is a second implementation of somebody else's dispatch,
and the failure would be silent. The schedule's own value series is one
schedule-level series, is what the engine actually saw, and cannot disagree with
it. One extra series against the fifteen already requested is inside the budget
that the per-surface measurement (15 to 173 series, 681 ms to 2,984 ms) drew.

## Decision 5: the prescribed gains, and the shape they need

TM59:2026 Appendix E is the authority, in two tables. The reader supplied a CSV,
`tm59_occupancy_equipment_profile_library.csv`, which is a transcription of the
**2017** tables as absolute hourly values. It was cross-checked row by row
against Table E.2 and the result is worth recording, because it decides what the
implementation reads from.

### The CSV is faithful, and it is not the source

Every one of the CSV's 13 room types reproduces Table E.2's fractions to within
rounding, and its notes are honest about the one ambiguity in the source (the
"10 pm to 12 pm" that both editions print, and that both the CSV and Table E.2's
own fractions resolve as 10 pm to midnight). Three findings from the check:

1. **Tables E.1 and E.2 disagree with each other, by up to 2 %.** E.1 gives
   absolute watts ("Base gain of 85 W for the rest of the day"); E.2 gives the
   same profile as a fraction of peak, rounded to two decimals. 85/450 is
   0.1889, printed as 0.19, which multiplied back is 85.5 W. The same gap
   appears at 0.23 (34.5 W against E.1's 35 W), 0.17 (51 W against 50 W) and
   0.13 (10.4 W against 10 W). **Decision: derive the fractions from E.1's
   absolute watts**, which is the primary statement, and letter the division so
   it can be checked. The CSV independently made the same choice, which is why
   its fractions read 0.189 rather than 0.19.

2. **Table E.1 has a transcription error at the three-bedroom living/kitchen.**
   Its text says "3 people at 75% gains from 9 am to 10 pm". Table E.2's own row
   for the same space gives a fraction of 1, and TM59:2017 says "3 people from
   9 am to 10 pm". Two independent statements against one, and the 75 % figure
   also breaks the pattern that a combined living/kitchen carries the dwelling's
   full occupancy while a separate living room carries 75 % and a separate
   kitchen 25 %. **Decision: implement 100 %, and print the discrepancy in the
   spec's `why` line** rather than resolving it silently.

3. **Table E.2 mislabels the two-bedroom kitchen** as "1 person" while giving it
   a peak of 150 W sensible and 110 W latent, which is two people, and a
   fraction of 0.25. E.1's "2 people at 25% gains" agrees with the numbers. The
   label is wrong and the arithmetic is right; the CSV encodes 0.5 people
   equivalent, which is the same thing.

### What the CSV does not carry

- **The home office**, which is new in 2026: 1 person at 75 % from 9 am to
  10 pm, 150 W equipment peak from 9 am to 10 pm over a 19 W base.
- **The lighting profile**: 2 W/m² of usable floor area, 18:00 to 23:00, zero
  otherwise. This is a third schedule on its own band and is the reason the
  desk's single shared `Occupancy` schedule cannot carry TM59.
- **Latent gains**: 55 W per person against the 75 W sensible, and 70 % of both
  while asleep.
- **Category I and II**, which do not exist in the 2017 document.

**Decision**: generate the profile data from Tables E.1 and E.2 into a frozen
declaration, and keep the CSV as the cross-check that it is. It is a secondary
source and by Principle III it cannot be the one the page reads from; it earns
its keep as the independent second transcription that caught findings 1 and 3.

### The shape the desk does not have

TM59's gains cannot be expressed by the Gains channel as it stands, in four
separate ways:

| TM59 asks for | The desk offers | Gap |
|---|---|---|
| 2 people in this room | `occupancy`, m² per person | Needs floor area, and Massing is untouchable to a preset |
| 450 W of equipment in this room | `equipment`, W/m² | Same |
| A 24-value fraction per hour | `occupied`, a from/to band | A band cannot express 0.7 / 1.0 / 0.5 |
| Three different profiles | One `Occupancy` schedule shared by People, Lights and ElectricEquipment | Lighting is 18:00 to 23:00, not the occupied band |

**Decision** (taken by the reader at the plan phase): add a `Pattern` control
kind carrying 24 hourly fractions, add a `roomType` selector naming the TM59
spaces, split the one shared schedule into three, and give People and
ElectricEquipment absolute calculation methods when a room type is named. The
design is in `data-model.md` and the interface in `contracts/`.

**The constraint this runs into** is Principle II: every parameter must be a
scalar. A `Pattern` is 24 numbers. It is therefore a list-valued control in the
sense the constitution already names, carrying canonical text and parsing at the
boundaries, with `Days` as the worked example to follow.

## Decision 5a: what an occupied hour is, which is not obvious

Found by prototyping the readers against a real annual run rather than by
reading the code, and it would have shipped as a silent wrong answer.

**`bandSchedule` in `model.js` writes `0.1` out of hours, not zero.** The
signature is `{ on = 1, off = 0.1 }`, and the off value is written for every
hour outside the occupied band, for a whole weekend day at `weekend:
'Unoccupied'`, and for a holiday at `holidayUse: 'Closed'`. So the desk's
occupancy schedule is **never zero anywhere in the year**.

The consequence is that the obvious denominator is wrong by a factor of three.
Measured on the default desk over a Chicago TMY3 year:

| Occupied-hour test | Hours counted, 1 May to 30 Sep |
|---|---|
| `scheduleValue > 0` | **3672**, which is every hour of all 153 days |
| `scheduleValue > 0.1` | **1100**, which is 110 weekdays × a 10 hour band |

3672 is not a coincidence: it is `153 × 24`, and it is also, exactly, the figure
CL:2026 publishes for a **bedroom**. A naive implementation would therefore
produce a plausible number, agreeing with a published figure, for entirely the
wrong reason, on a desk that is not a bedroom. That is the worst shape a bug can
have on this sheet.

**Decision**: an hour is occupied where the schedule stands **above the value it
takes when nobody is there**, and that floor is a property of the schedule the
applier wrote rather than a constant the reader assumes. `model.js` exports the
floor beside `bandSchedule`; a TM59 `Pattern` carries a floor of 0, because
Table E.2's own unoccupied hours are literally 0.

This also lands correctly on both published figures once the prescribed setup is
applied, which is the check quickstart §7 makes:

- A TM59 living-room pattern is 0 outside 09:00 to 22:00, so the floor is 0 and
  the count is 13 × 153 = **1989**.
- A TM59 bedroom pattern never drops below 0.7, so every hour is occupied and
  the count is 24 × 153 = **3672**.

And it makes FR-016 concrete rather than a disclaimer. The stock desk counts
1100 occupied hours where TM59's living room counts 1989, because the desk ships
an office-shaped weekday band and the method prescribes a home. That gap is
exactly what the criteria must say they are read over when the prescribed setup
has not been applied.

## Decision 5b: design days are outside the assessment period

A summer design day falls inside 1 May to 30 September by date, and the desk
ships two of them. They must not be counted.

**Decision**: the criteria are read over the weather-file environments only, by
the rule `readOverheat` and `computeBill` already follow.

**Rationale**: a design day exists to be more extreme than any day in the year it
precedes. Counted in, two deliberately punishing 24-hour environments would sit
alongside 153 ordinary days and set the share; on a desk with `sizingPeriods:
'Yes'` the same building would read worse than the identical desk with them
switched off, which is a difference in what was asked of the engine and not a
difference in the building. The bill already learned this: an annual run carried
an extra 48 hours of the most extreme weather in the file, about 3 % on the
heating.

**Consequence**: on a desk with no weather file attached, every criterion is
absent with its reason. Two design days are not a season, whatever their dates.

## Decision 6: the count of cleared criteria (settles FR-017b)

FR-017a permits a plain count and FR-017b defers its membership to this
document. TM59:2026 §2.3 and Appendix B settle it:

- **Stage 1** is the assessment every dwelling must pass, with no site-specific
  constraints modelled, and it uses **criteria a and b** for spaces inside
  dwellings and criterion d for communal areas.
- Criteria b and c are the Stage 2 or Stage 3 pair, used where opening
  constraints keep ventilation devices closed 50 % or more of occupied hours.

**Decision**: the count is lettered once, over **criteria a and b at Category
II**, and its row says so: the naturally ventilated Stage 1 pair, for a dwelling
of normal thermal expectation. Criterion c is read and lettered as its own line
but is outside the count, criterion d is unjudged, and Category I is read and
lettered beside Category II but is likewise outside the count.

**Rationale**: Stage 1 is the only stage TM59 requires of every dwelling
unconditionally, and it is the only one whose applicability this desk can
establish. Which of criterion a or c applies at Stage 2 turns on how much of the
occupied period the openings are shut, which is a fact about a window model this
desk does not have until `001-afn-natural-ventilation` lands, and guessing it
would be the sheet asserting under cover of citing. Counting all four
combinations of route and category instead was considered and rejected: four
counting rows for an optional figure is furniture, and privileging none of them
by lettering all of them still leaves a reader to pick.

**What the row may not do**: FR-017 stands. No pass or fail word attaches to
TM59, and the row names both numbers and reports unread criteria separately.

## Decision 7: the weather, stated and never judged

WFR:2026 §3 is specific, and it is far more specific than "a design summer
year":

> Overheating assessment should be undertaken using the latest version of the
> DSY1 file appropriate to the site location for the 2050s, RCP8.5, 50th
> percentile scenario. This file represents the minimum requirement for
> assessments carried out in accordance with TM59 (2026a).
>
> These weather files are labelled
> `Zone Reference_DSY1_2050s_HIGH50_CIBSE_v1.1`.

CIBSE has also moved from station locations to a 28-zone UK climate system, and
DSY1 is defined as a moderate year containing heat events with a return period
of seven years.

**Decision**: letter this requirement verbatim beside every criterion, letter
what the attached file declares about itself (source, station, period), and
draw no conclusion about whether they match. This is FR-015 and it needs no
amendment; what changes is that the requirement is now quotable rather than
paraphrased, and it names a file this desk demonstrably does not have. The
station index the desk fetches publishes TMYx typical years from
climate.onebuilding.org, which is neither a DSY, nor 2050s, nor CIBSE's, nor
licensed.

**Consequence for the unjudged list**: the weather gap is not one sentence, it
is four separate mismatches (typical year against design summer year, present
day against 2050s, a station against a CIBSE climate zone, an open file against
a licensed one), and each is checkable by the reader against the file in hand.

## Decision 8: British Summer Time

TM59:2026 §3.7.1 states that all profile times are local UK time, "i.e. British
Summer Time from April to October approx.", and that "If necessary, modellers
should shift the profiles to match the timing convention in other geographical
locations."

**Decision**: apply the profiles at the weather file's own local standard time,
unshifted, and state that this is what was done.

**Rationale**: shifting requires knowing the file's daylight saving rule, and
`src/epw.js` already records the measurement that decides it: every TMYx file
tested declares `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0`, on Denver 725650, on
Berlin-Tegel 103820, and on all five EPWs shipped with EnergyPlus 26.1. There is
no rule in the file to shift by, so a shift would be an invention. The profiles
are one hour early against a UK summer as a result, which is a real and stated
difference from a compliance run, and it belongs on the qualifications list
rather than in a silent correction.

## Decision 9: the figures the harness asserts against

CL:2026 §2 hands the implementation two numbers to check itself against, which
is unusual and valuable:

> Summer occupied hours should total 3672 for bedrooms and 1989 for living
> rooms, kitchens and studies.

Both are derivable and both check out: 1 May to 30 September is
31 + 30 + 31 + 31 + 30 = **153 days**; 153 × 24 = **3672**; 153 × 13 (09:00 to
22:00) = **1989**. Table 2 of TM59:2026 turns them into hour limits: 3 % of 1989
is 59.67, published as **59 hours**, and 3 % of 3672 is 110.16, published as
**110 hours**. The published limits are therefore **truncated, not rounded**,
which is a real implementation detail: a share compared against 3 % and a count
compared against 59 are not the same test at 59.5 hours. The desk letters the
share against 3 % (the criterion's own words) and the harness asserts the hour
counts against 59 and 110 to prove the denominator is right.

CL:2026 also confirms two modelling assumptions the desk should not fight:
infiltration set to **zero** for new-build homes, and cooling load zero unless
mechanical cooling is specified.

## Decision 10: the two equations, quoted

TM52:2013 was supplied and Box 2 prints both. They are reproduced here exactly,
because they are the arithmetic the whole of criterion a rests on:

> The exponentially weighted running mean temperature, Trm, for any day is
> expressed in the series:
>
>     Trm = (1 – a) (Tod–1 + a Tod–2 + a² Tod–3 ....)                (2.1)
>
> where a is a constant (<1) and Tod–1, Tod–2, etc. are the daily mean
> temperatures for yesterday, the day before, and so on. (Note that 'today's'
> daily mean temperature is not used because it remains unknown until the end of
> the day.) [...] For a series of days the value of Trm for any day can be simply
> calculated from the value of the running mean and of the mean outdoor
> temperature for the previous day (Trm–1 and Tod–1):
>
>     Trm = (1 – a) Tod–1 + a Trm–1                                  (2.2)
>
> This makes the running mean very simple to use once a starting value has been
> established. [...] The value of Trm calculated using equation 2.1 correlates
> best with Tc when **a = 0.8**.
>
> Where an extensive run of days is not available, BS EN 15251 (BSI, 2007) gives
> an approximate calculation method using the mean temperatures for the last
> seven days (a = 0.8):
>
>     Trm = (Tod–1 + 0.8 Tod–2 + 0.6 Tod–3 + 0.5 Tod–4
>            + 0.4 Tod–5 + 0.3 Tod–6 + 0.2 Tod–7) / 3.8              (2.3)
>
> This approximate value can also be used to 'start off' a longer run of Trm.
> (TM52:2013, Box 2)

At a = 0.8, equation 2.2 is `Trm = 0.2·Tod−1 + 0.8·Trm−1`. Nothing in this
feature is now reconstructed, and the note that the earlier draft of this
document required is no longer owed.

Three details the quotation settles that a paraphrase would have lost:

- **Equation 2.3 is a starting value, and TM52 says so in as many words**:
  "can also be used to 'start off' a longer run of Trm". That is exactly the use
  TM59:2026 puts it to at 30 April, so the two documents agree about what the
  seed is for and the implementation is not choosing between readings.
- **`Tod` is the previous day's mean, never today's**, and TM52 explains why:
  today's is unknown until the day ends. So the recursion at 1 May consumes
  30 April's daily mean, and an off-by-one here would shift the entire comfort
  line by a day for the whole season.
- **The denominator 3.8 is the sum of the weights** (1 + 0.8 + 0.6 + 0.5 + 0.4 +
  0.3 + 0.2), so equation 2.3 is a weighted mean and not a sum. Worth asserting
  in the harness, since a dropped denominator produces a number that is still
  plausible in shape and wrong by a factor of nearly four.

## Decision 11: a partial summer, and the clause TM59 does not restate

TM52:2013 §6.1.2(a) carries a provision that materially affects this desk, and
TM59:2026 quotes neither it nor anything contradicting it:

> If data are not available for the whole period (or if occupancy is only for a
> part of the period) then 3 per cent of available hours should be used.
> (TM52:2013, criterion 1)

This is directly about the case the specification worried over as an edge case:
a run that covers June to August, or a calendar with months left out. TM52's own
answer is that the share is taken over the hours available, which is what the
implementation does naturally.

**But TM59:2026 does not restate it, and its Table 2 points the other way**,
publishing absolute limits (59 hours for a living room, 110 for a bedroom) that
are 3 % of a *full* 153-day period. A tool that silently applied TM52's
provision would be answering a question TM59 has not clearly asked.

**Decision**: read criterion a over the run's available occupied hours, letter
the coverage beside the reading with equal prominence, and state both facts:
that TM52's criterion 1 permits a partial period explicitly, and that TM59's own
table is written for the whole one. The reader is given the provision, the
coverage and the arithmetic, and draws the conclusion. This is the same shape as
the weather decision: two facts stated, the judgement withheld, because the
judgement is not this sheet's to make.

**Consequence for the specification**: FR-011's absence rule narrows. Criterion a
over a *partial* summer is a reading with a stated coverage, not an absence.
Only a run reaching **no** part of 1 May to 30 September is absent. Criteria b
and c get no such provision from anywhere and keep the stricter reading:
criterion b counts nights it actually has, and its denominator is nights
covered rather than 153.

## Corrections owed to `spec.md`

The specification asked to be corrected here (FR-017b, and the "Published
figures" preamble). These are the changes:

| Where | Change |
|-------|--------|
| Published figures table | Delete entirely; this document replaces it |
| **FR-002** | **Strike.** No weighted-exceedance criterion exists in TM59 |
| FR-003 | Rewrite: criterion b is a count of nights whose 23:00 to 08:00 **mean** operative temperature exceeds Tn (26 °C Cat I, 27 °C Cat II), against **four nights**, over **1 May to 30 September**, not a 1 % share of annual hours above 26 °C between 22:00 and 07:00 |
| FR-004 | Rewrite: criterion c is 26 °C over **3 % of occupied hours 1 May to 30 September**, not of annual occupied hours |
| FR-010 | Now governs every criterion, not only the "summer criteria": all four share one assessment period |
| FR-011 | The "carries no year" clause weakens twice over: no criterion needs a whole year any more, only coverage of May to September; and by TM52 criterion 1's own partial-period provision (Decision 11), criterion a over *part* of the period is a reading with a stated coverage rather than an absence. Only a run reaching no part of the period is absent. Criterion b additionally needs 1 October for its last night to be complete |
| FR-014 | Add criterion d (communal areas) and Category I to the unjudged list; expand the weather clause into the four distinct mismatches under Decision 7 |
| FR-015 | Unchanged in force; the requirement it quotes is now specific (DSY1, 2050s, RCP8.5, 50th percentile, CIBSE 28-zone) |
| FR-017b | Discharged. See Decision 6 |
| FR-020 to FR-023 | Unchanged in force, but the overlay needs a control kind that does not exist. See Decision 5 |
| Key Entities, "Assessment period" | "Two of them, since the daytime criteria are summer and the sleeping-hours criterion is annual" is now wrong. There is **one** assessment period |
| Assumptions, "Category II ... being the category the method names for new-build dwellings" | Correct, and now quotable: Category I is for "thermally sensitive and fragile people, including care homes and sheltered accommodation", Category II for "all other dwellings" |
| Edge case, "Rounding is part of the published method" | Correct in principle, wrong in attachment: the rounding belongs to criterion a's ∆T, not to a weighted exceedance |
| New edge case | Criterion b's last night runs to 08:00 on 1 October, one day past the assessment period |
| New edge case | The published hour limits (59, 110) are truncated from 3 %, so a share test and a count test disagree at the boundary |
| New edge case | TM52 permits a partial assessment period for criterion a and TM59 does not restate the permission. Both are printed; neither is resolved (Decision 11) |
| New edge case | The desk's occupancy schedule is never zero: `bandSchedule` writes 0.1 out of hours. An occupied hour is one above that floor, and testing `> 0` counts 3672 hours where the answer is 1100 (Decision 5a) |
| New edge case | A summer design day falls inside the assessment period by date and must be excluded, or `sizingPeriods: 'Yes'` would worsen a criterion without changing the building (Decision 5b) |
| New edge case | ∆T at exactly 1.5 K rounds up, by TM59's closed interval rather than TM52's ambiguous one. `Math.round`, not round-half-to-even |
| Assumptions, TM52 | The document is now in hand. Every figure in this feature is quoted from a primary source and none is reconstructed |
