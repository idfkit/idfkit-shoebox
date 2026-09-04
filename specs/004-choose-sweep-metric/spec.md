# Feature Specification: Choose what a sweep plots

**Feature Branch**: `004-choose-sweep-metric`

**Created**: 2026-09-02

**Status**: Draft

**Input**: User description: "Let users choose which metric a study sweep plots, instead of the desk inferring it."

## Overview

A study sweeps one control across its range and draws a curve. The reader chooses
the control. They do not choose what the curve is *of*.

The desk decides that for them, by inspecting the desk:

    system engaged + a weather file   ->  TEDI and CEDI
    chasing TM59 + a year + gains     ->  TM59 criterion a
    otherwise                         ->  the zone temperature high and low

Every one of those has already misfired. The TM59 rule was previously written
against the room type, so a reader who named "Double bedroom" because they wanted
a bedroom's gains silently lost the high/low curve on every study on the desk, and
because the room type reaches the sample key, every curve already drawn re-swept
itself under a reading nobody had asked for. That particular rule has since been
moved onto the chase pin, which is a better guess. It is still a guess.

The failure is not any one of the three rules. It is that the sheet is answering a
question the reader is better placed to answer, and answering it silently. A curve
whose quantity changed because of something you did elsewhere is worse than a
missing curve: you read it as an answer to the question you thought you asked.

So the reader picks. Every quantity the sheet already reports off a run is offered
as the curve for a sweep, chosen once for the desk, stated on every card, and
changed without losing a study. The desk stops inferring.

The choice is the desk's rather than each study's. Every open sweep plots the same
quantity, and changing it changes all of them together. Curves on one sheet are
read against one another, and a page of sweeps each measuring something different
is a page with no common axis to compare along.

The whole of this feature is a *choice about a reading*. Nothing here reaches the
IDF, no channel is added, and no number is computed that the sheet does not already
compute somewhere. What changes is who decides which of them is drawn.

## Clarifications

### Session 2026-09-02

- Q: When a reader changes what a study plots, which already-solved samples should be reusable without running EnergyPlus again? → A: Reuse whenever the sample's finished run can answer the new quantity, whatever reporting profile wrote it; re-run only the samples that fall short.
- Q: What should a solved sample keep, so that a later question about a different quantity can be answered from it? → A: At land time, read every quantity the run can answer and cache that bag of numbers alongside a record of what the run carried; the run itself is discarded as it is today.
- Q: What should the shareable link carry about studies? → A: Each open study rides under one new reserved key and is re-swept on arrival. The 2026-09-03 clarification below supersedes the original per-study quantity pairing: the key carries one desk-wide quantity followed by the open control keys.
- Q: Which quantity should a study open on, before the reader has chosen anything? → A: Whatever today's rule would infer, evaluated once at the moment the study starts and never again, and stated on the card.
- Q: When the current run cannot answer a quantity, should it still appear in the list of offers? → A: Always offered, greyed, with its reason and its fix in place of a value; nothing ever leaves the list.

### Session 2026-09-03

- Q: Should the chosen quantity belong to each study, or to the desk as a whole? → A: The desk as a whole. One choice, shown by every open sweep; changing it changes all of them at once.
- Q: When the reader changes the desk-wide quantity, what should happen to open sweeps whose solved runs cannot answer it? → A: Redraw instantly wherever a cached run answers; re-queue only the rest, coarse-first through the existing refresh path, gated on auto-solve.
- Q: When should the desk read its opening quantity, given there is now only one for the whole sheet? → A: Once, when the first study of the session is started, and frozen from then on until the reader chooses otherwise.
- Q: Which quantities belong to the initial roster? → A: The 13 aggregate outcomes already used for whole-run comparison: high and low zone temperature; TEDI, CEDI and EUI; cost and carbon; overheating frequency; peak heating and cooling load; and TM59 criteria a, b and c. Channel-local glazing and airflow readouts, pin-dependent balance readings and the bill's unnormalised metered total are outside this feature.
- Q: Which outcomes should share one chooser row? → A: Exactly two natural pairs: high with low zone temperature, and TEDI with CEDI thermal demand. The individual members of those pairs are not separate rows. The other nine outcomes remain unchanged, so the 13 outcomes are exposed through 11 choices.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick what the curve measures (Priority: P1)

A modeller sweeps the window-to-wall ratio and wants to see what it does to the
annual cost, not to the zone temperature. They choose the cost from the offers on
the study card and the curve is redrawn as cost against ratio, with its own unit
and its own end label, on the same terms as every other study.

**Why this priority**: This is the feature. Everything else on this list bounds it,
explains it, or keeps it honest.

**Independent Test**: Start a study on any sweepable control, choose a different
quantity from the one the card opened with, and confirm the curve is redrawn as
that quantity with the right unit, and that choosing back returns the first curve.
Fully testable with no other story built.

**Acceptance Scenarios**:

1. **Given** a study on a control, **When** the reader chooses a different
   quantity, **Then** the curve is redrawn as that quantity with its own unit and
   end labels.
2. **Given** two studies up at once, **When** the reader changes the quantity,
   **Then** both are redrawn as that quantity, because the choice belongs to the
   desk rather than to one study.
3. **Given** any curve on the sheet, **When** the reader reads its card, **Then**
   what the curve is of is stated on the card rather than inferred from its shape.
4. **Given** a quantity the current run cannot answer, **When** the reader looks
   for it, **Then** it stands in the list, greyed, with its reason and what would
   fix it in place of a value — never absent, and never offered and then silently
   drawn as nothing.
5. **Given** several studies up and auto-solve on, **When** the reader changes the
   quantity, **Then** every study whose solved runs already answer it is redrawn
   with no engine run, only those that fall short are re-swept, and each of those
   is legible as waiting rather than as cleared or lost.
6. **Given** several studies up and auto-solve off, **When** the reader changes the
   quantity, **Then** nothing is run at all, and the studies that cannot be redrawn
   from runs in hand say so and wait.
7. **Given** an unavailable quantity whose fix is to attach weather, **When** the
  reader follows that instruction and successfully attaches a station, **Then**
  the same study, strip, open chooser, focus and viewport position remain in
  place while its samples are re-solved for the new climate.

---

### User Story 2 - Never change the reading under the reader (Priority: P1)

A reader has a curve of the zone temperature extremes up. They engage the System
channel, name a room type, or press Chase on a standard. The curve stays a curve of
the zone temperature extremes, because they never asked for anything else.

**Why this priority**: Equal first, and it is the defect that prompted the feature.
A silent substitution is not a smaller version of a wrong answer, it is a different
and worse kind of wrong: the reader has no way to know the question changed, so
they read the new curve as an answer to the old question. Nothing else here matters
if the desk can still do this.

**Independent Test**: Put a curve up, then move every control and channel that used
to change the inferred metric, and confirm the curve's quantity never changes and
no curve is re-swept for that reason.

**Acceptance Scenarios**:

1. **Given** a study up, **When** any control, channel or pin the reader touches
   would previously have changed the inferred metric, **Then** the study's quantity
   is unchanged.
2. **Given** a study up, **When** the desk changes such that the chosen quantity
   can no longer be read, **Then** the study says so and keeps its identity, rather
   than silently becoming a study of something else.
3. **Given** a reader who has never made a choice, **When** a study is started,
   **Then** it opens on a stated default, and which default it opened on is
   legible.

---

### User Story 3 - Do not pay for what is not being drawn (Priority: P2)

A reader sweeping the cost does not wait for a run carrying every series the sheet
can request. Each quantity asks the run for what it needs and no more, so a sweep
of twenty-one samples stays as cheap as it is today.

**Why this priority**: The lean sample is an existing property of the desk that this
feature could easily lose: offering ten quantities where there were three is an
invitation to request everything and read one. It is not P1 only because a correct
slow sweep is better than a fast wrong one.

**Independent Test**: Sweep the same control on each offered quantity and confirm
each sample's run requests only what its quantity needs, and that a sweep's samples
restore the desk exactly as they do today.

**Acceptance Scenarios**:

1. **Given** a sweep of any quantity, **When** its samples are built, **Then** the
   run carries the series that quantity needs rather than the full apparatus.
2. **Given** a sweep of any quantity, **When** it finishes, **Then** the live desk
   is exactly as it was before the sweep began.

---

### Edge Cases

- **A quantity can stop being answerable while its curve is up.** Patching out the
  System channel takes the demand meters with it; detaching a year takes every
  annual quantity. The study must say which quantity it can no longer read and why,
  and must not fall back to one it can.
- **Some quantities need a whole year and some do not.** A peak load reads on two
  design days, because sizing days are the conditions plant is designed against; an
  energy intensity or an exceedance frequency has nothing to say about them. The
  offer has to distinguish these, since a reader on a design-day desk offered an
  annual quantity is being offered a curve of nothing.
- **A sample that cannot answer is not a zero.** This is the desk's existing rule
  and it is per sample rather than per study: a sweep can cross a stop where the
  quantity becomes unreadable, and those positions are absent from the curve while
  the rest of it stands.
- **Two quantities can share one run.** Cost and carbon come off the same meters,
  and the TM59 criteria come off one temperature series. Turning the desk from one
  such quantity to the other must not solve a single sample again. Sharing is
  decided by what a finished run carries against what a quantity declared it needs,
  so a lean run answers every quantity whose needs it happens to meet, including
  quantities that would have been written under a different profile. This is what
  makes a desk-wide change affordable: without it, one turn of the chooser would
  re-sweep every open study at once.
- **Plant and Tariff change value without changing the run.** Those channels are
  deliberately absent from sample identity because nothing they own reaches the
  IDF. A cached sample therefore retains the handful of physical meter totals
  needed to rederive EUI, cost and carbon. Changing either channel recomputes
  those readings and redraws the chosen curve without running the engine.
- **A curve of a currency is not comparable across stations**, and the sheet
  already refuses to difference one currency against another. A quantity that
  carries a currency inherits that refusal rather than restating it.
- **A quantity whose reader cannot run at land time cannot be shared.** The
  numbers are extracted while the run is in hand, so a reader wanting something
  the sample does not carry and the desk cannot supply has nothing to read from
  later. Such a quantity is either given what it needs off the station and the
  desk, or it is not offered; it must not be offered and then quietly re-sweep
  every time it is chosen.
- **Not every reported quantity is a curve.** Some readings are text, dates or
  schedules; others are channel-local diagnostics, pin-dependent balance
  readings or intermediate bill totals. The initial roster is the 13 aggregate
  whole-run outcomes settled in clarification, exposed through 11 choices because
  high and low zone temperature form one pair and TEDI and CEDI form another.
  The choices are declared once rather than inferred from whichever readings
  happen to be wired up.
- **One change redraws some curves instantly and re-sweeps others.** The desk-wide
  quantity moves every open study at once, and the studies whose solved runs already
  answer it come back immediately while the rest have to be run again. That is two
  visibly different behaviours from one gesture, and the sheet has to say which
  curve is which rather than leaving a reader to wonder whether a study was lost.
- **A study's quantity is not part of what identifies it.** A study is the control
  it sweeps; the quantity is a property of the desk it is drawn on. The desk's
  bookkeeping — which curves are stale, which are cached, which are cleared — keys
  on the control alone, as it does today.
- **Unmet hours are not a reading this sheet has.** They were named in the request,
  and the sheet does not compute them anywhere: they would be a new reading with its
  own cost, not a re-plot of an existing one. Adding them is a separate feature and
  this one must not pretend otherwise.

## Requirements *(mandatory)*

### Functional Requirements

**The choice**

- **FR-001**: The desk MUST carry one choice of what a sweep plots, and that choice
  MUST be the reader's rather than derived from the state of the desk. Every open
  study plots that quantity.
- **FR-002**: Every study MUST state on its card what its curve is of, in the same
  words the sheet uses for that quantity elsewhere.
- **FR-003**: The reader MUST be able to change the quantity without losing any
  study, and without restarting any sample whose run already answers the new
  quantity. A run answers a quantity when it carries what that quantity declared
  it needs (FR-009), whatever reporting profile wrote it — the test is what the
  run holds, never which quantity asked for it. Only the samples that fall short
  are re-run.
- **FR-004**: Changing the quantity MUST change every open study together, and no
  study may be left plotting the previous one. A page of sweeps each measuring
  something different has no common axis to be read along, which is the reason the
  choice is the desk's; the cost of that reason is that the change is never partial.
- **FR-004a**: On a change of quantity, every study whose solved runs answer the new
  quantity MUST be redrawn immediately from those runs, with no engine run. Only
  the studies that fall short MUST be re-swept, and they MUST re-queue by the same
  coarse-first path a stale study already takes, under the same auto-solve gate. A
  reader with auto-solve off MUST get no run from a change of quantity at all.
- **FR-004b**: While a change of quantity is settling, a study waiting to be re-swept
  MUST be legible as such and MUST NOT be indistinguishable from one that was
  cleared or lost.
- **FR-004c**: Following an unavailable quantity's fix MUST preserve the context
  that presented it. A successful weather attachment MUST invalidate old climate
  samples while retaining each study and restoring the open strip, open chooser,
  focus and viewport anchor through the waiting and landed-result redraws.
- **FR-005**: The desk MUST open on a stated default quantity, and which quantity
  that is MUST be legible rather than inferred from the curve. The default is what
  today's rule would infer from the desk, read **once**, at the moment the first
  study of the session is started, and frozen from then on until the reader chooses
  otherwise: the rule keeps its use as an opening guess and loses its ability to
  move a curve the reader is already reading. It MUST NOT be re-read when a later
  study is started, when the desk changes, or when the sheet is cleared of curves.
- **FR-006**: The rule choosing the desk's opening quantity MUST be declared in one
  place, beside the quantities themselves, and MUST be readable by the reader as a
  statement about the desk rather than discoverable only by starting a study.

**What may be offered**

- **FR-007**: The initial chooser MUST expose the 13 aggregate whole-run outcomes
  settled in the 2026-09-03 clarification through 11 choices. High and low zone
  temperature MUST form one pair, TEDI and CEDI MUST form one thermal-demand
  pair, and the other nine outcomes MUST remain scalar. A quantity is admitted
  by one declaration in the roster, not by a second list in the study machinery.
  A later scalar or paired aggregate view becomes offerable by adding that
  declaration, without changing scheduler, cache, card or link logic.
- **FR-008**: Each offered quantity MUST carry its own label, unit and the
  precision it is lettered to, and the curve MUST use them.
- **FR-009**: Each offered quantity MUST declare what a run has to carry for it to
  mean anything, and a quantity the current run cannot answer MUST still be
  offered — greyed, unselectable, carrying its reason and its fix in place of a
  value. The list MUST NOT shorten: a quantity that vanishes teaches the reader
  nothing, where a greyed row saying "attach a weather file, this is a year's
  number" says what to do next. This is the rule the hour picker already keeps,
  refusing an instant with its reason in place of its stamp rather than falling
  back to a neighbour, and the rule that puts TM59's criterion d on the unjudged
  list by name rather than dropping it.
- **FR-010**: Offering a quantity MUST NOT require computing it. The offer is a
  declaration, and it MUST NOT cost a run.

**Never changing the reading under the reader**

- **FR-011**: No control, channel, pin or preset MAY change what the open studies
  plot. The desk MUST NOT infer its quantity at any point after the first study has
  been started. The only thing that may change it is the reader choosing, which
  changes every study at once and is visible as a change.
- **FR-012**: Where the chosen quantity stops being readable, each affected study
  MUST say which quantity it cannot read and why, and MUST NOT substitute another.
  A quantity readable for one open study and not another MUST be reported per study,
  since which controls are swept differs and the reason may differ with them.
- **FR-013**: Changing the quantity MUST NOT re-solve a sample whose existing run
  answers it, and MUST NOT discard any curve. A quantity whose
  needs are met by a leaner profile's finished run MUST read from that run rather
  than re-sweeping, so switching between two quantities one run answers is free
  and switching to one it cannot re-runs only the samples that fall short.

**Keeping the desk's existing guarantees**

- **FR-014**: A sample whose run cannot answer the chosen quantity MUST be absent
  from the curve rather than plotted as zero, per sample rather than per study.
- **FR-015**: Each quantity MUST declare the reporting profile its samples are run
  under, so a sweep requests what that quantity needs and no more, and the sweep's
  restore of the live desk MUST remain exact.
- **FR-016**: A solved sample MUST be identified by the desk it was solved for,
  the kind of run it was, and what that run carries — never by the quantity that
  asked for it. A quantity in the sample's identity is what makes every metric
  change cost a whole sweep, and it is what this feature removes.
- **FR-017**: A sample MUST keep, for every quantity its run can answer, the
  numbers that quantity reads, extracted while the run is in hand, together with
  the record of what the run carried. The run itself MUST NOT be retained: an
  annual sample's output is 465 to 733 KB of text before parsing, and a sweep is
  twenty-one of them beside a pool of engine instances. A metric change is then a
  lookup, and what is kept per sample stays the handful of numbers it is today,
  so the cache's existing bound and its existing clear on a station change need
  no rethinking.
- **FR-018**: Every offered quantity's reader MUST be callable at the moment a
  sample lands. A reader needing facts beyond the run itself MUST take them from
  the station and the desk the sample was solved for, never from the study that
  asked — a fact that can only be resolved per study is a quantity that cannot be
  read for a sample some other study solved, which is the reuse in FR-003 lost at
  the first criterion that needs a context.
- **FR-019**: Every figure a curve letters MUST be read back off the sample's own
  run, never off live settings.
- **FR-020**: A quantity that carries a currency MUST inherit the sheet's existing
  refusal to compare unlike currencies rather than restating it. EUI, cost and
  carbon MUST be rederived from each cached sample's physical meter totals when a
  Plant or Tariff setting changes, without changing sample identity or starting
  an engine run.
- **FR-021**: The onboarding notes MUST be updated wherever this feature changes
  what a step teaches or renames a control it names.

**The link**

- **FR-022**: The desk's chosen quantity MUST ride the shareable link, as one
  value. This was the open question the request left to this specification and it
  is settled here: a link is how one reader hands another the desk they are looking
  at, and a curve of cost that arrives as a curve of temperature is the same silent
  substitution this feature exists to remove. What rides is the choice, not the
  curve — the samples are re-swept on arrival, as they are today.
- **FR-023**: Each open study MUST ride the link as the control it sweeps, under
  one key of the link's own reserved set, beside the single desk-wide quantity of
  FR-022. The quantity MUST appear once, followed by zero or more open control
  keys in canonical control declaration order. The link has never carried a
  study, so the quantity alone cannot reproduce the curves the sender was reading;
  carrying the open controls makes those studies arrive to be re-swept. A control
  added to the desk later MUST NOT be able to collide with the reserved key, and
  the collision MUST be impossible rather than merely unlikely.
- **FR-024**: Links minted before this feature MUST continue to resolve unchanged.
  A link carrying no study key MUST resolve to a desk with no studies, which is
  what every existing link is, so no version bump and no migration step is
  required. A link carrying a quantity that no longer exists MUST be refused whole
  with its reason rather than resolved to a different quantity.

### Key Entities

- **Quantity**: something the sheet reports off a run that resolves to one number,
  with its label, its unit, its precision, what a run must carry for it to be
  readable, and the reporting profile its samples are run under. A declaration, not
  a computation.
- **Study**: a control and the samples solved for it. What it plots is the desk's
  choice rather than its own, so two studies never disagree about the quantity, and
  the desk's bookkeeping keys on the control alone.
- **Offer**: a quantity as it stands against the current run — available, or
  standing greyed with a reason and a fix. Never absent.
- **Sample**: one position of one swept control, solved once and kept as the
  numbers every quantity its run could answer, plus the record of what that run
  carried. It belongs to the desk it was solved for rather than to the study that
  asked for it, which is what lets a second study — or the same study asking a
  second question — read it without solving it again.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader can start a study, change what it plots, and change it back,
  and the curve is of the quantity they chose each time.
- **SC-002**: No sequence of moves on the desk — engaging a channel, naming a room
  type, chasing a standard, attaching a station, moving any control — changes what
  an existing study plots.
- **SC-003**: Every curve on the sheet states what it is of, and a reader can say
  what a curve measures without looking at its shape or its units.
- **SC-004**: Every quantity stands in the list on every desk, either drawable on
  the current run or carrying the reason it is not and what would fix it. No
  reachable combination of run, calendar, station and channel state removes a
  quantity from the list, produces a curve of nothing, or leaves an offer that
  silently draws nothing.
- **SC-005**: Every open study plots the same quantity at all times, and no sequence
  of changes leaves two curves measuring different things. Changing the quantity
  re-runs only the samples whose existing run cannot answer the new one, re-runs
  none at all where every run can, and re-runs nothing whatever while auto-solve is
  off.
- **SC-006**: A sweep of any offered quantity costs no more engine time per sample
  than the leanest sweep does today, measured against the same desk before the
  change.
- **SC-007**: The same link reproduces the same studies of the same quantities in a
  fresh session, and every link minted before this feature resolves unchanged.
- **SC-008**: A quantity added to the sheet after this feature becomes offerable
  without any change to the study machinery.

## Assumptions

- **This is a choice about a reading, and nothing here reaches the IDF.** No channel
  is added, no output request is added for its own sake, and no quantity is computed
  that the sheet does not already compute. Consequently the feature adds nothing to
  the balance rail, nothing to the bill and no new term to any total.
- **The quantities are the ones already on the sheet.** The scoreboard's targets,
  the results schedule's demand rows, the bill's cost and carbon, the zone
  temperature extremes and the peak loads are all read off a run today. They are the
  candidate set, and the value of this feature is that they stop being locked to the
  panel that happens to letter them.
- **Unmet hours are out of scope.** They were named in the request and the sheet
  does not compute them: they would be a new reading with its own cost and their own
  argument about what an unmet hour is, which is a separate feature this one should
  not smuggle in. Naming the gap is the honest answer.
- **The inference survives as an opening default and nothing else.** A default is a
  quantity the desk opens on and states; an inference is a quantity that changes
  underneath the reader. This feature keeps the first and removes the second, and
  the distinction is the whole of it. In practice that means today's three rules
  are read exactly once in a session, at the moment the first study is started, and
  are never consulted again.
- **The existing per-sample absence rule is right and is inherited.** A sample the
  run cannot answer is already absent rather than zero, and that rule needs widening
  to every offered quantity rather than rewriting.
- **The studies and the desk's one quantity ride the link, and the samples do
  not.** The link carries the desk, not the results; a study arrives as a study to
  be swept, which is what it already does. Both halves are part of the desk in the
  sense that matters — which controls are being asked about, and what the reader
  asked to see of them. This is new: the link has carried params, patch state,
  station and pin, and never a curve.
- **The chase pin stays what it is.** It says which published line the reader is
  working against and it is deliberately remembered and deliberately off the link.
  This feature stops it deciding what a curve measures; it does not otherwise touch
  it.
- **Nothing here changes what the sheet's own panels letter.** The scoreboard, the
  schedule and the bill go on reporting exactly what they report; the curves stop
  being the one place a reading cannot be asked for.

## Dependencies

- The readings the sheet already takes off a run, and the declarations that letter
  them. This feature is a re-presentation of those rather than a new source of
  numbers.
- The existing study scheduler, its per-sample queue, its sample cache and its
  cancellation rule.
- The reporting profiles a sample is run under, which are what keeps a sweep cheap.
- The TM59 criteria specified in `002-tm59-overheating` are among the quantities
  offered, and this feature is what makes their sweep something a reader asks for
  rather than something the desk infers. Neither blocks the other: this one can ship
  over whatever set of quantities exists when it lands.
- No new runtime dependency.
