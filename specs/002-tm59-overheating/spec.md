# Feature Specification: Overheating risk to CIBSE TM59

**Feature Branch**: `002-tm59-overheating`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Adjacent to the spec'd AFN modeling capabilities, user's requested the ability to assess the shoebox in accordance with CIBSE TM59."

## Overview

The sheet already reads one overheating question: how much of the year the zone
stood above a fixed temperature. Passivhaus asks it at 25 °C and LETI at 28 °C,
and the scoreboard answers both off the same hourly series.

TM59 asks it differently, and the difference is the feature. A fixed line says
the same thing in Aberdeen in April as in London in August, and it is not what
anybody feels: comfort in a free-running home moves with the weather the
occupants have been living in. So the line moves too, being derived each day
from a running mean of the outdoor temperature, and what is counted against it
is not "hours above a number" but hours a whole degree or more above the
*moving* line, over the occupied hours of a defined summer, in operative
temperature rather than air temperature, with a separate criterion over the
sleeping hours that counts whole nights against a mean rather than hours against
a peak.

That is four separate departures from what the sheet reads today, and every one
of them is a reading rather than a control. Nothing in this feature reaches the
IDF except the profiles TM59 prescribes, which the register already knows how to
apply as an overlay. The rest is arithmetic over a run the desk already produces,
lettered where the sheet already letters a standard's targets.

The reason it is adjacent to the pressure network is that TM59's headline route
is for *predominantly naturally ventilated* homes, and the criterion is only
meaningful over a building whose windows actually open against the weather. The
two features compose, but neither blocks the other: this one reads whatever air
model produced the run, and says which one it was.

The honesty problem is the hardest part of this feature, and it is bigger here
than for any standard the register already carries. TM59 is a compliance method
with a mandated weather file, a mandated set of rooms, and mandated profiles.
This desk is one zone, and the weather it is standing on is whatever the reader
attached, which the sheet can describe but cannot certify. A panel that lettered
"TM59: PASS" would be the sheet asserting
under cover of citing, which is the one thing the register was built not to do.
So the specification below spends as much of itself on what is *not* being
judged as on what is.

## Clarifications

### Session 2026-09-01

- Q: Should the ability to attach your own `.epw` and `.ddy` files be built as part of this TM59 feature, or specified separately as its own weather feature that TM59 then depends on? -> A: Separate feature. TM59 ships reading whatever weather is attached, names the upload capability as a companion dependency, and must not hardcode the assumption that the attached weather is a typical year.
- Q: When the TM59 block says the weather is not what the method mandates, where should that sentence get its facts from? -> A: Read it off the attached weather. State the source, station and period the file itself declares, and what the method asks for, and withhold the judgement of whether they match, because the sheet cannot verify it.
- Q: Once a reader can attach a genuine licensed design summer year, should the sheet ever letter an overall TM59 pass or fail? -> A: Never as a verdict. The sheet may letter a plain count of which criteria the run cleared, with no pass/fail word attached to the method as a whole. Which criteria make up that count is settled at the plan phase against the TM59 documentation itself.
- Q: How should the sheet establish the running mean history that the first days of the assessment period need? -> A: Read the lead-in off the weather file. The running mean is a property of the weather rather than of the building, so it is seeded from the outdoor temperatures immediately preceding each assessment period whether or not those days were simulated. No engine cost, no days excluded from judgement, and the lead-in used is stated.
- Q: TM59's night-time criterion applies only to bedrooms, but this desk is one undeclared room. How should that criterion be presented? -> A: Always read, always qualified. It is lettered on every run, stating that it presumes the room is a bedroom, on the same terms as every other unearned line on the scoreboard. No room-type state is added to the desk.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the adaptive criterion instead of a fixed line (Priority: P1)

A modeller has a free-running shoebox on a summer's worth of weather and wants to
know whether it overheats by the measure a UK planning authority actually asks
for. They read the scoreboard and find, beside the fixed-line criteria already
there, TM59's first criterion: the share of occupied hours between 1 May and
30 September in which the operative temperature stood a whole degree or more
above the adaptive comfort line. It reads against its published limit of 3 %,
and it states the line it was measured against, because that line moved through
the run.

**Why this priority**: This is the feature. The adaptive criterion is the thing
the desk cannot express today and cannot be approximated by moving the existing
threshold, because the threshold is not a constant. Everything else on this list
refines it, bounds it, or protects the reader from over-reading it.

**Independent Test**: Engage a free-running desk with a full year attached, and
confirm the sheet letters an exceedance share that changes when the glazing ratio
is moved, and that the comfort line lettered beside it differs between a cool
climate and a hot one on the same building. Fully testable with no other story
built.

**Acceptance Scenarios**:

1. **Given** a desk with a full year of weather attached, **When** the reader
   reads the scoreboard, **Then** TM59's criteria are lettered with their readings,
   their published limits and a verdict against each.
2. **Given** the same building on two different stations, **When** the reader
   compares the comfort line each run reported, **Then** the lines differ, because
   the line is derived from each climate's own outdoor temperatures.
3. **Given** the reader increases the glazing ratio on the sunlit wall, **When**
   the run returns, **Then** the share of exceeding hours rises.
4. **Given** a run reaching no part of 1 May to 30 September, **When** the reader
   reads the criteria, **Then** each is absent with the reason and what would fix
   it, rather than lettering a share of nothing; and **given** a run covering only
   part of that period, **Then** the criteria are lettered over the hours and
   nights they have, with that coverage lettered beside them.
5. **Given** any TM59 reading on the sheet, **When** the reader asks where it came
   from, **Then** the reading, the period it covers, the hours it counted and the
   comparison it was made against are all legible without opening anything.

---

### User Story 2 - Never let this read as a certificate (Priority: P1)

A reader who does TM59 assessments professionally opens the sheet, sees the two
criteria pass, and is about to take that as an answer about a building. Before
they can, the sheet has told them the four things that make this not a TM59
assessment: the weather is whatever file is attached, described but never
certified against the design summer year the method mandates, the model is one
zone and TM59 assesses every occupied room with the worst
governing, the occupancy is whatever they drew unless they applied the prescribed
profiles, and several of the method's requirements have no representation on this
desk at all.

**Why this priority**: Equal first, and it is the reason this feature is
specifiable at all. The register's existing standards are approximated on a
shoebox and say so; TM59 is further from what this desk can do than any of them,
because it is a compliance procedure rather than a performance line. A verdict
lettered without those four sentences beside it is a false claim about a real
building, made in the name of a real institution. It would break "no silent
fallbacks" and the register's own rule that what is not being checked is printed
beside what is.

**Independent Test**: Read every TM59 figure the sheet letters and confirm each
one either carries its own qualification or stands under a standing one, and that
the list of what is not being judged is reachable at the narrowest layout without
hovering.

**Acceptance Scenarios**:

1. **Given** TM59 readings on the sheet, **When** the reader reads them, **Then**
   what the assessment does not cover is stated beside what it does.
2. **Given** any weather attached, **When** the reader reads any TM59 criterion,
   **Then** the sheet states what that weather declares itself to be and what the
   method requires, and does not itself judge whether the two match.
3. **Given** the reader has not applied TM59's prescribed profiles, **When** they
   read the criteria, **Then** the sheet states that the readings are of the
   building as drawn rather than of the method's prescribed occupancy.
4. **Given** the narrowest supported layout, **When** the reader reads the TM59
   block, **Then** every qualification is readable without hovering or scrolling
   sideways.
5. **Given** a run with no attached year, **When** the reader reads the criteria,
   **Then** nothing is lettered as zero and nothing reads as a pass.

---

### User Story 3 - Put the method's own occupancy on the desk (Priority: P2)

A reader wants the criteria read against the occupancy TM59 actually prescribes
rather than against the office-shaped default the desk ships with. They apply the
method's setup from the register, which writes the occupant density, the gains,
the profile and the opening rule TM59 names, leaves everything about the building
where they put it, and letters the arithmetic behind each figure so it can be
checked against the published document.

**Why this priority**: The criteria are readable without it, which is why it is
not P1, and the readings mean much more with it. It follows Story 1 because there
must be a criterion before there is any point prescribing what it is read over.

**Independent Test**: Apply the prescribed setup to the stock desk, confirm the
controls it names move and no other control moves, and confirm the criteria
readings change accordingly.

**Acceptance Scenarios**:

1. **Given** the stock desk, **When** the reader applies TM59's prescribed setup,
   **Then** the controls the method has an opinion about take its values and every
   other control stays where it was.
2. **Given** the setup applied, **When** the reader reads any prescribed value,
   **Then** the published figure it came from and any conversion between them are
   lettered in place.
3. **Given** the setup applied, **When** the reader then moves one of those
   controls, **Then** the desk's agreement with the method falls by itself, with
   nothing remembering that the setup was ever applied.
4. **Given** the setup applied, **When** the run returns, **Then** the occupied
   hours the criterion counted are the ones the prescribed profile produced.

---

### User Story 4 - Ask the sleeping-hours question (Priority: P2)

A reader wants to know whether the room would be sleepable. They read TM59's
bedroom criterion: the nights between 1 May and 30 September whose *mean*
operative temperature over the hours of sleep, 23:00 to 08:00, stood above Tn,
against a limit of four such nights. It is a different quantity from the daytime
one rather than a stricter version of it, and it frequently governs, which is the
point of reading it.

**Why this priority**: It is the other half of the pair TM59 requires of every
dwelling at Stage 1 and the half that most often decides the outcome, but the
daytime criterion is the one that carries the adaptive machinery, so this follows
it.

**Independent Test**: Read the night criterion on a desk with a year attached and
confirm it counts nights rather than hours, over 1 May to 30 September, taking
each night's mean over 23:00 to 08:00 and attributing it to the date it opened
on, and reports a count against four nights.

**Acceptance Scenarios**:

1. **Given** a full year attached, **When** the reader reads the bedroom criterion,
   **Then** it letters a count of nights whose 23:00 to 08:00 mean operative
   temperature exceeded Tn, against a limit of four nights.
2. **Given** a run covering part of the assessment period, **When** the reader
   reads it, **Then** it is lettered over the nights the run actually carries, with
   that count of nights stated as the denominator rather than 153; and **given** a
   run that stops at midnight on 30 September, **Then** the sheet says the last
   night is incomplete, because that night runs to 08:00 on 1 October.
3. **Given** any run that can answer it, **When** the reader reads the criterion,
   **Then** it is lettered and states that it presumes the room is a bedroom, rather
   than being withheld or presented as a judgement of the room as drawn.
4. **Given** the reader looks for a control declaring what kind of room this is,
   **Then** there is none, and the criteria say what they presume instead.

---

### User Story 5 - Ask it of a home that is not naturally ventilated (Priority: P3)

A reader whose building has mechanical ventilation and no useful openings reads
the criterion TM59 sets for that case instead: a fixed 26 °C over the occupied
hours of 1 May to 30 September, against 3 %. The adaptive criterion does not
apply to such a building, and the sheet says which route it is reading.

**Why this priority**: It completes the method and is a small addition once the
occupied-hours machinery exists, but the naturally ventilated route is the one the
request is about and the one the pressure network makes worth having.

**Independent Test**: Read the mechanically ventilated criterion on a desk with no
openable area and confirm it letters a share of the assessment period's occupied
hours above 26 °C against 3 %.

**Acceptance Scenarios**:

1. **Given** a full year attached, **When** the reader reads the mechanically
   ventilated criterion, **Then** it letters a share of the occupied hours between
   1 May and 30 September above 26 °C against a 3 % limit.
2. **Given** either route's readings, **When** the reader reads them, **Then**
   which route applies to which kind of building is stated, and neither is
   presented as the answer for a building of the other kind.

---

### User Story 6 - Sweep the design against the criterion (Priority: P3)

A reader puts a study on the glazing ratio, or the openable area, and gets a curve
of the TM59 exceedance share rather than of demand, so the control can be moved
against the criterion it is actually being judged by.

**Why this priority**: It is the payoff of having the criterion at all, and it
follows from declaring the reading in the ordinary way rather than being separate
work. Third because the criterion is useful before it is sweepable.

**Independent Test**: Start a study on a control with the criterion selected as the
metric and confirm a curve is produced on the same terms as every other study.

**Acceptance Scenarios**:

1. **Given** a year attached, **When** the reader starts a study reading the
   exceedance share, **Then** a curve is produced on the same terms as every other
   study.
2. **Given** a sample whose run cannot answer the criterion, **When** the curve is
   drawn, **Then** that sample is absent from it rather than plotted as zero.

---

### Edge Cases

- **The comfort line is a lagged quantity, and the history it needs is not in the
  run.** The running mean is defined recursively from the previous day's, and the
  first day of any environment has no previous day inside the run. Left to start from
  an assumed value it would carry a stated error through roughly the first week, which
  is inside the assessment period. But the quantity reads only outdoor temperatures,
  which the weather file holds for every day of the year whether or not the engine
  simulated them, so the history is taken from the file rather than invented or
  waited for.
- **A day that was not simulated still has a real outdoor temperature.** This is why
  the lead-in works at all, and it is the one place on this sheet where a reading is
  legitimately taken from outside the run: the running mean is a property of the
  climate, not of the building, so restricting it to simulated days would be an
  artifact of this desk rather than anything the method asks for.
- **A run made of several separate months is several separate environments**, and the
  desk's calendar can produce exactly that. The running mean is seeded once, at
  30 April, from the file's own days and not from anything the engine touched, and the
  recursion then runs straight through the gaps, so a reader who runs June to August
  alone is judged on exactly the comfort line the whole year would have produced over
  those days, and no group loses days to a warm-up. Re-seeding each group from the
  seven days before it would look equivalent and is not: the seven-day approximation
  is a starting value, and starting it again in July would put a different line under
  August.
- **A throwaway lead-in environment would not work and is not the remedy.** Each
  environment converges its own warm-up from its own first day, so the zone's state at
  the end of one does not carry into the next; a simulated week before the assessment
  period would cost engine time and establish nothing. What it cannot fix is a
  separate matter: the zone's own thermal history at the start of an environment is
  the engine's convergence against a repeated first day rather than a real preceding
  week, and the only remedy for that is extending the run period itself, which is the
  reader's decision and not this feature's.
- **The assessment period and the run period need not agree.** Every criterion is
  defined over 1 May to 30 September. A run covering June to August covers part of
  it; a run covering January covers none of it. Neither is a zero, and only the
  second is an absence.
- **TM52 permits a partial period and TM59 does not restate the permission**, which
  is a disagreement between the two documents this feature has to print rather than
  settle. TM52's criterion 1 says outright that where data are not available for the
  whole period, three per cent of the available hours should be used. TM59's own
  table publishes absolute limits (59 hours for a living room, 110 for a bedroom)
  which are three per cent of the *full* 153 days, and it quotes neither TM52's
  provision nor anything contradicting it. So the reading is taken over the hours the
  run has, the coverage stands beside it at equal prominence, both facts are stated,
  and the conclusion is the reader's. Silently applying the provision would be
  answering a question TM59 has not clearly asked.
- **The published hour limits are truncated, not rounded, so a share test and a
  count test disagree at the boundary.** Three per cent of 1989 occupied hours is
  59.67 and TM59 publishes 59; three per cent of 3672 is 110.16 and it publishes
  110. A run reading exactly 59.67 hours clears the count and not the share. The
  sheet letters the share, which is the criterion's own words, and the arithmetic
  behind the published counts is printed so the two can be reconciled by the reader
  rather than by a silent choice.
- **Occupied hours are read off the schedule, not off the reader's controls.** A
  study sample and a stale solve both make live parameters disagree with the
  document that was simulated, and the share is a ratio whose denominator is the
  schedule the engine actually saw.
- **The desk's occupancy schedule is never zero anywhere in the year**, so an
  occupied hour cannot be an hour whose schedule value is above zero. The applier
  writes a small out-of-hours value rather than nothing, for every hour outside the
  band and for whole unoccupied days, so testing above zero counts every hour of all
  153 days, which is 3672, where the stock desk's true answer is 1100, being 110
  weekdays at a ten hour band. Worse, 3672 is exactly the figure the method
  publishes for a bedroom, so the wrong denominator agrees with a published number
  for entirely the wrong reason. An occupied hour is one standing above whatever
  value that schedule takes when nobody is there, and that value is a property of
  the schedule the document holds rather than a constant assumed by the reader of
  it.
- **A summer design day falls inside the assessment period by date and must not be
  counted.** A design day exists to be more extreme than any day in the year it
  precedes, so two of them sitting alongside 153 ordinary days would set the share by
  themselves, and the identical building would read worse with the sizing periods
  kept than with them switched off. That is a difference in what was asked of the
  engine and not a difference in the building. The criteria are read over the weather
  file's environments alone, which is the rule the bill already follows for the same
  reason.
- **A building with the System channel engaged holds its own setpoint**, and every
  overheating criterion on this sheet reads trivially well against a cooled zone.
  That is true of the fixed-line criteria already, and the note that says so must
  say it here too, because the adaptive criterion looks more authoritative and will
  be over-read further.
- **Operative temperature and air temperature are not the same series**, and the
  criteria are defined in the first. A desk with heavy solar gain and a cold slab
  can carry a mean radiant temperature several degrees off the air temperature, so
  reading the wrong series would not merely be imprecise, it would be a different
  question.
- **Rounding is part of the published method**, and it belongs to the daytime
  criterion's own ∆T rather than to any weighting. ∆T is rounded to the nearest whole
  degree before it is tested, so an hour 1.4 K above the line and an hour 1.6 K above
  it are not the same reading, and an hour 0.6 K above counts as a full degree over.
  An implementation that skips the rounding produces plausible numbers that are not
  the method's.
- **∆T at exactly 1.5 K rounds up, and only one of the two documents settles it.**
  TM52 writes the bands as 0.5 to 1.5 and 1.5 to 2.5, which puts 1.5 in both and
  decides nothing at the boundary; TM59 closes the first interval at 1.49, which puts
  1.5 in the 2 K band. The criterion is decided at exactly these values more often
  than anywhere else, so the ambiguity is not academic: half-up is correct and a
  round-half-to-even helper would be wrong at 1.5 while looking more careful.
- **The last night of the assessment period ends outside it.** A night is attributed
  to the date it opens on, so the night of 30 September runs to 08:00 on 1 October,
  one day past the period the criterion is defined over. A run that stops at midnight
  on 30 September holds 152 complete nights and not 153, and the sheet must say which
  it had rather than counting a nine hour mean over three hours of data.
- **A run in which the criteria cannot be answered must take the previous run's
  criteria down** where they stop being true, on the same terms as every other
  reading the sheet letters.
- **The occupied-hours denominator can be zero.** A desk whose gains channel is
  bypassed has no occupancy schedule at all, and a share of no hours is not a pass.

## Requirements *(mandatory)*

### Functional Requirements

**The criteria**

- **FR-001**: The sheet MUST letter the share of occupied hours between 1 May and
  30 September inclusive during which ∆T, the operative temperature less the adaptive
  comfort line for that day, stood at one degree or more, against the method's
  published limit of 3 % of the occupied hours in that period. ∆T MUST be rounded to
  the nearest whole degree before it is tested, as the method requires, and the
  rounding MUST follow the closed interval the method prints, which puts exactly
  1.5 K in the 2 K band rather than leaving the boundary undecided.
- **FR-002**: *Struck.* An earlier draft of this specification required the greatest
  daily weighted exceedance, which is TM52's criterion 2 against a limit of 6. No
  such criterion exists in TM59, in either edition: the 2017 document says outright
  that TM52's criteria 2 and 3 may fail to be met, and the 2026 document borrows from
  TM52 only the rounding rule for ∆T, which is attached to FR-001 where it belongs.
  Implementing it would import another document's compound judgement under TM59's
  name. The number is left vacant rather than reused, so that a requirement cited by
  number elsewhere cannot quietly come to mean something else.
- **FR-003**: The sheet MUST letter the number of nights between 1 May and
  30 September inclusive whose *mean* operative temperature over the hours of sleep,
  23:00 to 08:00, exceeded Tn, against the method's published limit of four nights.
  Tn is 26 °C for Category I and 27 °C for Category II, fixed rather than adaptive. A
  night is attributed to the date it opens on, so the period's last night runs to
  08:00 on 1 October and the sheet MUST say where the run did not reach it. The
  criterion MUST be read on every run that can answer it, and MUST state that it
  presumes the room is a bedroom, since the method applies it to bedrooms alone,
  naturally and mechanically ventilated alike, and this desk holds no declaration of
  what its one room is.
- **FR-003a**: The desk MUST NOT gain any state recording what kind of room it holds.
  Which criteria are read is not a setting; each is asked of every run it can be asked
  of, and says what it presumes, on the same terms as every other line on the
  scoreboard that the building was not built to.
- **FR-004**: The sheet MUST letter the share of occupied hours between 1 May and
  30 September inclusive during which the operative temperature exceeded 26 °C,
  which is the criterion the method sets for predominantly mechanically ventilated
  spaces, against its published limit of 3 %, and MUST state which kind of building
  each route applies to. The threshold is 26 °C for both categories, and the period
  is the same one every other criterion is read over: it is not annual.
- **FR-005**: Every criterion MUST cite the clause it comes from, in the standard's
  own words and units, in place on the sheet.
- **FR-006**: The adaptive comfort line MUST be derived per day from a running mean
  of outdoor temperature by the method's published formula, and the sheet MUST
  letter the line the run was actually judged against.
- **FR-007**: The criteria MUST be read from operative temperature, and the sheet
  MUST say so where it letters them.
- **FR-008**: The running mean MUST be seeded from the outdoor temperatures that
  immediately precede the assessment period in the attached weather file, whether or
  not those days were simulated, and MUST NOT be started from an assumed value. The
  method prescribes the lead-in exactly: the seven days from 23 to 29 April give the
  value for 30 April by the published approximate form, and the recursion carries it
  from there. The sheet MUST state the lead-in it used. No day inside the assessment
  period may be excluded from judgement for want of history.
- **FR-008a**: Establishing the running mean MUST cost no engine time. It reads
  outdoor temperatures from the weather file already in hand, so it MUST NOT require
  an extra environment, an extended run period, or any change to what the run covers.

**What the criteria are read over**

- **FR-009**: Occupied hours MUST be read off the occupancy schedule in the
  document that was simulated, never off the reader's live settings. An hour counts as
  occupied where that schedule stands above the value it takes when nobody is there,
  and that floor MUST be a property of the schedule the document holds rather than a
  constant assumed by the code reading it, since the desk's own schedules do not fall
  to zero out of hours.
- **FR-010**: Every criterion MUST be read only over the run's hours that fall within
  the method's assessment period, 1 May to 30 September inclusive, and the sheet MUST
  letter how much of that period the run covered. All the criteria share that one
  period; none of them is read over the year.
- **FR-011**: Where the run reaches no part of the assessment period, every criterion
  MUST be absent with its reason and with what would fix it, and MUST NOT be lettered
  as a zero or as a pass. Where the run covers part of the period, the criteria MUST
  be lettered over the hours and nights it actually carries, with that coverage
  lettered beside the reading at equal prominence and with both of the documents'
  positions stated: that TM52's criterion 1 permits a partial period outright and
  that TM59's own table publishes its limits for the whole one. The sheet MUST NOT
  resolve that disagreement on the reader's behalf.
- **FR-012**: Where the occupied-hours denominator is zero, the criterion MUST be
  absent with that reason rather than divided.
- **FR-013**: The running mean MUST be seeded once, from the weather file's own days
  before the assessment period, and MUST then recurse through days the run did not
  cover, so that a run made of several separated groups of months is judged against
  exactly the comfort line a full year would have produced over the same days. A group
  MUST NOT be re-seeded from the seven days preceding it: the seven-day form is a
  starting value for a run of days, and starting it again mid-season would put a
  different line under the months that follow.

**Not reading as a certificate**

- **FR-014**: The sheet MUST print what the method requires and this desk cannot
  judge, beside what it does judge, at minimum:
  - the mandated weather file, stated as the four separate ways the attached file may
    differ from it (a typical year against a design summer year, present-day against
    the 2050s, a weather station against the method's own climate zones, and an open
    file against a licensed one), each of which the reader can check against the file
    in hand;
  - the per-room assessment this one-zone model cannot perform, the method being
    governed by the worst room in the dwelling;
  - the communal-areas criterion, which is read over circulation outside the dwelling
    that this desk does not hold at all;
  - Category I, whose readings may be lettered beside Category II's but whose
    applicability cannot be established here, the method reserving it for thermally
    sensitive and fragile occupants;
  - and any other prescribed condition not represented on this desk.
- **FR-015**: Every criterion MUST state what weather it was read over, taken from
  what the attached file declares about itself, together with what the method
  requires of a weather file, which is specific rather than general: a named design
  summer year for the site's climate zone, at a stated future period, emissions
  scenario and percentile, quoted in the method's own words. The sheet MUST NOT
  assert that the two do or do not match: it cannot verify that a file is the design
  summer year the method names, and a claim it cannot check is exactly what it must
  not make. The reader is given both
  facts and draws the conclusion.
- **FR-015a**: No requirement, reading or sentence in this feature MAY be written
  against a fixed assumption about what kind of weather the desk carries. Every such
  statement MUST be derived from the weather actually attached, so that it stays true
  when a reader attaches a licensed file of their own.
- **FR-016**: Where the desk does not hold the method's prescribed occupancy and
  gains, the criteria MUST state that they are read over the building as drawn.
- **FR-017**: The sheet MUST NOT letter an overall pass or fail against the method
  as a whole, and MUST NOT attach any pass or fail word to the method's name. The
  compound judgement the method makes is a statement about a dwelling assessed room
  by room, and this desk has one room, which no weather file fixes.
- **FR-017a**: The sheet MAY letter a plain count of how many of the criteria it read
  were cleared, out of how many it was able to read. The count MUST name both numbers,
  MUST NOT be lettered as a proportion or a score, and MUST NOT stand where it could
  be read as the method's own verdict. Criteria the run could not answer MUST be
  reported as unread rather than folded into either number.
- **FR-017b**: *Discharged.* The membership of that count was settled against the
  method itself at the plan phase and is no longer open. The count is lettered once,
  over the daytime criterion (FR-001) and the bedroom criterion (FR-003) at
  Category II: the pair the method requires of every dwelling at its first stage,
  read at the category it assigns to dwellings of normal thermal expectation. The
  mechanically ventilated criterion (FR-004) MUST be lettered as its own line and MUST
  stand outside the count, because which of the two routes applies at a later stage
  turns on how much of the occupied period the openings are held shut, which is a fact
  about a window model this desk does not hold; guessing it would be the sheet
  asserting under cover of citing. The communal-areas criterion is unjudged, and
  Category I's readings likewise stand outside the count.
- **FR-018**: Where a cooling system is in the path, the criteria MUST say that a
  conditioned zone holds its own setpoint and the reading is therefore about the
  system rather than the fabric.
- **FR-019**: Every qualification this feature carries MUST be readable at the
  narrowest supported layout, without hovering.

**The prescribed setup**

- **FR-020**: The reader MUST be able to apply the method's prescribed occupancy,
  gains and opening rule to the desk as an overlay that writes only the controls the
  method has an opinion about and leaves every other control where the reader put
  it.
- **FR-021**: Each prescribed value MUST letter the published figure it came from
  and any arithmetic between the published units and the desk's own, so the
  conversion can be checked and disagreed with.
- **FR-022**: Nothing MUST remember that the setup was applied. Agreement with the
  method MUST be measured off the desk's current controls every time the desk is
  applied, so moving a control drops it by itself.
- **FR-023**: The prescribed setup MUST NOT write any control the register already
  forbids a preset to write.

**Keeping the desk's existing guarantees**

- **FR-024**: Every figure this feature letters MUST be read back off the run that
  produced it, never off live settings.
- **FR-025**: The criteria MUST be selectable as study metrics on the same terms as
  the readings already are, and a sample whose run cannot answer a criterion MUST be
  absent from the curve rather than plotted as zero.
- **FR-026**: The description under the plate MUST be able to say which air model
  produced the flow the criteria were read over, since a naturally ventilated route
  read over a sealed building is a different claim.
- **FR-027**: Any setting this feature adds to the desk MUST ride the shareable
  link, and links minted before this feature MUST continue to resolve unchanged.
- **FR-028**: Where the criteria stop being true they MUST come down with the
  sheet's other readings, and a run in flight MUST NOT blank them.
- **FR-029**: The onboarding notes MUST be updated wherever this feature changes
  what a step teaches or renames a control it names.

**Latency**

- **FR-030**: The criteria MUST cost no new per-surface output request, and MUST
  NOT move the design-day solve outside the budget the desk already holds.
- **FR-031**: The arithmetic MUST be cheap enough to re-letter within a gesture,
  since it is read over the same series the sheet already redraws per frame when the
  pinned hour moves.

### Key Entities

- **Assessment period**: the calendar window every criterion is defined over, 1 May
  to 30 September inclusive, and how much of it the run actually covered. There is
  one of them, shared by all the criteria, with one tail: the bedroom criterion's
  last night opens inside the period and closes at 08:00 the day after it ends.
- **Comfort line**: the adaptive limit for one day, derived from the running mean of
  outdoor temperature, which is itself a property of the climate rather than of the
  building and is therefore read from the weather file rather than from the run. One
  per day of the assessment period, a result rather than a setting, and lettered so
  the reader can see what the run was judged against.
- **Exceedance**: for one hour, how far the operative temperature stood above the
  comfort line for that day, rounded to the nearest whole degree, and whether that
  hour was occupied. The atom the daytime criterion is summed from.
- **Criterion**: a published question, its limit, its units, its assessment period,
  what a run must carry for it to mean anything, and the clause it is quoted from.
- **Unjudged clause**: a requirement of the method that this desk cannot answer, and
  why not. The list is a deliverable of this feature, not a footnote to it.
- **Prescribed setup**: the occupancy, gains and opening rule the method names, each
  with the published figure and the arithmetic that turned it into a control's own
  units. An overlay, never a remembered state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can attach a year, read every criterion this desk can answer
  with its limit and its verdict, and trace each reading to the run's own series and
  the run's own schedule without opening anything else.
- **SC-002**: The comfort line the sheet letters differs between two climates for
  the same building, and moves through a single run, demonstrating that it is
  derived from the weather rather than fixed.
- **SC-003**: The daytime exceedance share and the bedroom criterion's night count
  both respond to moving glazing ratio, openable area and shading, so the criteria
  can be designed against.
- **SC-004**: Every criterion is either lettered with a reading and a verdict, or
  absent with a reason and the fix. No reachable combination of run, calendar,
  station and channel state produces a zero, a blank or a pass where the question
  could not be answered.
- **SC-005**: A reader who reads only the TM59 block can state, from what is
  printed there, at least four specific reasons why it is not a TM59 compliance
  assessment.
- **SC-006**: No overall pass or fail against the method, and no pass or fail word
  attached to the method's name, appears anywhere on the sheet. Where a count of
  cleared criteria is lettered, both its numbers are legible and the criteria that
  could not be read are named separately.
- **SC-007**: Applying the prescribed setup to the stock desk moves only the
  controls the method names, and every value it writes letters its published source
  and its arithmetic.
- **SC-008**: Moving any control the setup wrote reduces the desk's stated agreement
  with the method without any further gesture.
- **SC-009**: Every criterion, limit, qualification and unjudged clause is readable
  at 390 px wide without hovering or sideways scrolling.
- **SC-010**: Adding the criteria leaves the design-day solve inside the desk's
  existing live cadence, measured against the same desk before the change.
- **SC-011**: The same link reproduces the same criteria readings in a fresh
  session, and every link minted before this feature resolves unchanged.

## Assumptions

- **This is a reading, not a channel.** Nothing in the criteria reaches the IDF, so
  they belong where the sheet already reads a standard's targets off a run, beside
  the fixed-line overheating criteria they sit next to. The one thing that does
  reach the IDF is the method's prescribed occupancy and gains, and that is an
  overlay of exactly the kind the register already applies. Consequently the feature
  adds no channel, no meter and no term to the balance rail.
- **Two of the three series the criteria need are already in the run.** Operative
  temperature and outdoor dry-bulb temperature are both requested hourly today, at
  zone and site level. The occupied-hours denominator needs one more, the occupancy
  schedule's own value series, which is schedule level and not per surface: one
  series against the fifteen already requested, well inside the budget the
  per-surface measurement drew. Reading the schedule's value out of the run rather
  than re-evaluating the schedule in JavaScript is what keeps the denominator the one
  the engine actually saw, since which branch of a schedule an hour takes depends on
  the calendar the engine picked. This is what makes the latency requirements
  satisfiable rather than aspirational.
- **The weather file itself is available to be read, and the running mean is read
  from it.** The desk already holds the attached weather as text and already parses
  its header, and the daily outdoor means the running mean needs are in that text.
  Reading them there rather than out of the run is what makes the lead-in free, makes
  it use the right days, and makes a partial run judged on the same line as a full
  one.
- **The occupancy schedule in the document is the definition of an occupied hour.**
  The method prescribes profiles, but the sheet's own rule is to read what was
  simulated, so the denominator is the schedule the engine saw whether or not the
  prescribed setup was applied. What was applied is stated rather than assumed.
- **Category II of the adaptive comfort model is the one the count is read at**,
  being the category the method assigns to all dwellings other than those housing
  thermally sensitive and fragile people, for whom Category I is reserved and which
  it names as care homes and sheltered accommodation. Both categories can be
  lettered, since the difference between them is one degree on a published line; which
  of the two a dwelling belongs in is a fact about its occupants that this desk cannot
  establish, so it is cited in place and stated as unjudged rather than chosen
  silently. Category III is not offered at all: the comfort document assigns it to
  existing buildings and the method names only I and II, so a third line would be
  this sheet adding a category the method does not use.
- **The criteria are read over whatever weather is attached, and this feature does
  not assume what that is.** Obtaining design summer years is out of scope here: they
  are licensed products rather than open data, and the station index the desk fetches
  publishes typical years. But "typical year" is a fact about today's weather source,
  not about the sheet, and a reader attaching a licensed file of their own is
  specified separately. So nothing in this feature may hardcode that the weather is a
  typical year. What the run was judged over is stated from the weather actually
  attached, which keeps the qualification true both before and after that capability
  arrives, and is why Story 2 is a P1 either way.
- **One zone remains the whole building.** The method assesses every occupied room
  and is governed by the worst; this desk has one room and can only report that one.
  The gap is printed rather than papered over, and it is the single largest reason
  the readings are not a compliance assessment.
- **The criteria are read over whatever air model produced the run.** This feature
  neither requires nor blocks the pressure network. The naturally ventilated route
  is most meaningful over a building whose openings answer the weather, which is
  what the network provides, so the two compose; but the criteria are arithmetic
  over a temperature series and do not care how the air got in, provided the sheet
  says which model it was.
- **No room type is held anywhere on the desk.** The method applies different
  criteria to bedrooms and to living spaces, which is a reason to say what each
  criterion presumes and not a reason to make the desk remember an answer. The
  register's rule that nothing is remembered applies here as it does to standards:
  every criterion is asked of every run that can answer it, and states its own
  presumption, so there is no stored declaration to go stale and nothing new to ride
  the link.
- **No overall verdict is offered even though the method defines one, but a count
  is.** The method's compound judgement is a statement about a dwelling assessed room
  by room; this desk has one room, and no weather file fixes that, so the judgement
  is not this sheet's to make. What the sheet may do is say plainly how many of the
  criteria it read were cleared and how many it read, which is arithmetic over its
  own readings rather than a claim in the method's name. The line between the two is
  the difference between counting and concluding, and it is drawn in the requirements
  rather than left to the interface: both numbers are always named, criteria that
  could not be read are reported separately, and no pass or fail word ever attaches to
  the method itself.
- **The existing fixed-line overheating criteria stay exactly as they are.** They
  answer a different question and are cited to different documents; nothing about
  this feature changes or replaces them.

## Dependencies

- The simulation engine and its output variables at the version the desk pins.
  Variable names drift between versions and must be confirmed against the run rather
  than recalled.
- The weather the desk already fetches, for the outdoor temperature series the
  comfort line is derived from.
- The register's existing preset machinery, for the prescribed setup and for the
  list of what is not judged.
- No new runtime dependency. The arithmetic is over series the run already carries.
- The pressure network specified in `001-afn-natural-ventilation` is a companion
  rather than a prerequisite: it makes the naturally ventilated route mean more, and
  neither feature blocks the other.
- The ability for a reader to attach their own licensed `.epw` and `.ddy` files,
  specified separately, is a companion rather than a prerequisite. It is what would
  let this sheet read the criteria over the weather the method actually mandates, and
  it is the single largest thing standing between these readings and a real
  assessment. Because it is separate, this feature must state what the attached
  weather is rather than assert what it must be, so that no requirement here has to
  be rewritten when it lands.

## Where the published figures live

An earlier draft carried a table of figures here, each row quoted from a secondary
source and marked provisional. It has been deleted rather than corrected. The CIBSE
documents were read in full at the plan phase, and every figure this feature rests
on is now quoted from one of them, with the clause it came from, in `research.md`.
That document is the authority; nothing in this feature is reconstructed from a
secondary reading, and the figures above are the specification's statement of what
those quotations require rather than a second transcription of them.

Three of the deleted table's nine rows described the superseded 2017 edition, and two
more described a criterion that exists in neither edition, which is precisely the
failure the desk's own rule predicts: a figure whose source nobody can check is
exactly what this sheet exists not to print. The requirements above have been
corrected against the primary documents, and the corrections are recorded at the
end of `research.md`.

The comfort documents themselves stay out of this repository. The supplied copy of
one of them is watermarked to a named individual, and in any case the register's
practice is to quote a clause in place, as it already does for Passivhaus and LETI,
rather than to carry the document.
