# Research: A daylight reading on the roster

**Feature**: [spec.md](./spec.md) | **Branch**: `014-daylight-reading` | **Date**: 2026-09-20

Phase 0. Every decision below is either measured on this machine against EnergyPlus
26.1.0 or quoted from a file in this repository. Where a question was settled by a run,
the harness that ran it is named and its output is quoted. Nothing here is recalled.

The specification carries no `[NEEDS CLARIFICATION]` markers: the three the decide gate
left open were answered before it was written. What this document resolves is the set of
unknowns the *implementation* has, which the specification deliberately does not decide.

---

## 1. Where the probe is written, and what it is called when it gets there

**Decision.** One `Daylighting:Controls` object exists on every desk, owned by a new
applier rather than by the Daylight channel, carrying the probe as **reference point 1**.
Where the Daylight channel is engaged, its dimming sensor joins that same object as
reference point 2. The reading is taken from the output variable
`Daylighting Reference Point 1 Illuminance`, which is then the probe's on every desk the
sheet can reach.

**Rationale.** The output variable's name carries the point's *ordinal*, so an
arrangement where the probe's ordinal moves with the channel's state is a reading whose
own name changes underneath it. Measured in `.harness/tmp-probe-arrangement.mjs`, six
annual Chicago runs, native engine:

```
gains in,  daylight out,  no probe     exit  0  severe  0  lights  5975.5 kWh  points 0
gains in,  daylight out,  probe        exit  0  severe  0  lights  5975.5 kWh  points 1
                                          21 June noon: point 1 = 194 lx
gains OUT, daylight out,  probe        exit  0  severe  0  lights    —    kWh  points 1
                                          21 June noon: point 1 = 194 lx
no openings at all,        probe       exit  0  severe  0  lights  5975.5 kWh  points 1
                                          21 June noon: point 1 = 0 lx
daylight IN,  sensor only              exit  0  severe  0  lights  3698.4 kWh  points 1
                                          21 June noon: point 1 = 322 lx
daylight IN,  probe first              exit  0  severe  0  lights  3698.4 kWh  points 2
                                          21 June noon: point 1 = 194 lx, point 2 = 322 lx
```

Four things fall out of that table, and each answers a question the specification names:

- **The probe's ordinal can be pinned at 1** by writing it first. Point 1 reads 194 lx in
  every arrangement that carries a probe, including the one where the dimming sensor is
  also present and reads 322 lx as point 2. Without the pin, the probe would be point 1
  with the channel out and point 2 with it in, and the reading would have to ask the
  document which variable it is today.
- **Putting the probe ahead of the sensor does not change what the sensor dims.** Annual
  lighting energy is 3698.4 kWh with the sensor alone and 3698.4 kWh with the probe
  written in front of it. Order within `control_data` is presentation, not precedence,
  because the controlled fraction is declared per point.
- **The probe is neutral (FR-004, SC-004).** 5975.5 kWh with and without, reproducing
  `.harness/tmp-daylight-neutral.mjs` exactly.
- **Gains bypassed is fine.** The shipped `applyDaylight` returns early when there is no
  `Lights` object, with the comment "nothing to dim without a Lights object to dim"
  (`src/model.js:2149`). That reason does not carry over to a point that dims nothing: the
  run is clean, 0 severe, and the probe still reports 194 lx.

**Alternatives considered.**

- *Leave the Daylight channel owning `Daylighting:Controls` and append the probe.* Rejected:
  the probe's ordinal then depends on the channel, which is the defect above. Appending
  also makes the reading absent on precisely the desk the problem lives on.
- *Two `Daylighting:Controls` objects, one per purpose.* Not attempted past the schema:
  EnergyPlus takes one daylighting control object per zone, and the arrangement that did
  run with two (`.harness/tmp-daylight-neutral.mjs`) only ever had one present at a time.
- *`Output:IlluminanceMap`.* Rejected by the specification (out of scope: no drawn field,
  no `eplusmap.csv` parsing) and independently by cost, measured in
  `.harness/tmp-daylight-cost.mjs` and `.harness/tmp-daylight-wasm.mjs`.

**Consequence for the Daylight channel.** `applyDaylight` stops writing the
`Daylighting:ReferencePoint` / `Daylighting:Controls` pair and instead contributes its
sensor to the object the probe's applier owns. That is a change to an existing channel's
applier, and it is the one place this feature reaches code the specification did not name.
It is recorded here rather than discovered during implementation.

---

## 2. The output variable, confirmed against the engine rather than recalled

**Decision.** `Daylighting Reference Point 1 Illuminance`, reported `Hourly`, keyed on the
`Daylighting:Controls` object's name.

**Rationale.** Quoted from a real `.rdd` produced by this desk,
`.harness/out/dl-native-13x13/eplusout.rdd:274`:

```
Output:Variable,*,Daylighting Reference Point 1 Illuminance,hourly; !- Zone Average [lux]
```

`Zone Average`, units `lux`. CLAUDE.md requires output variable names be confirmed in the
`.rdd` rather than guessed, and this is that confirmation. Note the neighbouring
`Daylighting Window Reference Point 1 Illuminance` at line 279, which is the per-window
contribution and is **not** this reading; the two names differ by one word.

**The gate this creates.** `.harness/variables.mjs` is the standing harness asserting that
every output variable the sheet asks for exists at this version. It exists because a
drifted name does not stop a run: it writes one line into `eplusout.err` and carries on,
leaving the reader a reading absent for a reason about the run rather than about the typo.
The new variable must be added to it in the same change, or this feature ships with its
one engine dependency unguarded.

**Schema facts that bound the design**, from `/Applications/EnergyPlus-26-1-0/Energy+.idd`:

- `Daylighting:Controls` is `\extensible:3`, repeating (reference point name, fraction,
  setpoint). Ten are enumerated; more are legal.
- `Fraction of Lights Controlled by Reference Point N` is real with `minimum 0.0`, so the
  zero-fraction probe is inside the schema rather than exploiting it.
- `Daylighting:ReferencePoint` takes name, zone, x, y, z, with z defaulting to 0.8 m.

---

## 3. What "no opening at all" does

**Decision.** A desk with no glazing and no rooflight reports the reading as a **measured
zero**, not as an absence.

**Rationale.** Measured above: the run is clean, 0 severe, and point 1 reads 0 lx at noon
on 21 June. The engine computes the daylight and finds none, which is a measurement. This
matches the specification's edge case and the constitution's own rule that zero is a
measurement and missing is not (Principle IV).

This is worth stating because the Daylight *channel* refuses the same desk: its `requires`
says "Needs at least one opening, a window or a rooflight, to see daylight through"
(`src/controls.js:4593`). That refusal is about a sensor that would dim lights against
light that is not there, and it does not transfer to a point that dims nothing. The
channel's refusal stands unchanged; the probe's applier has no such gate.

---

## 4. The interior reflectance defect is deeper than one line

**Decision.** One new declared control, interior visible reflectance, written to the
`visible_absorptance` field of every opaque material the desk builds, as `1 - reflectance`.
The exterior solar absorptance controls (`wallAbs`, `roofAbs`) keep `solar_absorptance` and
stop reaching `visible_absorptance` at all.

**Rationale.** The defect the assessment measured is at `src/model.js:1011-1012`:

```js
  wall.visible_absorptance = params.wallAbs;
  roof.visible_absorptance = params.roofAbs;
```

Both `wallAbs` and `roofAbs` are declared as exterior surface properties
(`src/controls.js:4039`, `:4043`, labelled "Wall absorptance" and "Roof absorptance",
default 0.75), so the room's interior visible reflectance is 0.25 on the shipped desk.
That is the 2.49x the assessment measured.

Reading the surrounding code turns up three facts the assessment did not record, and each
one changes what the fix has to be:

- **The ceiling is slaved to `roofAbs`, exactly as the walls are to `wallAbs`.** `ROOF31`
  is a single layer, `R31LAYER` (`src/model.js:761`), whose `visible_absorptance` is
  written from `roofAbs`. So FR-012's "reach the ceiling" is not a new field on an
  uncontrolled surface; it is the same defect a second time.
- **The walls are not always slaved to `wallAbs`.** With `wallMass > 0` the construction
  becomes `R13LAYER` plus an inboard `WALLMASS` leaf (`src/model.js:1028`) whose visible
  absorptance is the hard-coded 0.65 at `src/model.js:1026`. EnergyPlus's split flux reads
  the **innermost** layer, so on a desk with mass the interior reflectance is 0.35 and
  `wallAbs` reaches nothing at all. A fix that writes only `R13LAYER` would silently miss
  every desk with mass on it.
- **The floor is hard-coded twice**, at 0.65 for the concrete slab (`src/model.js:747`) and
  0.65 again for the `FLOORLIGHT` massless stand-in used when Mass is bypassed
  (`src/model.js:1103`).

Writing the new control to every opaque material's `visible_absorptance` is therefore one
rule that lands correctly on all five materials and on both construction variants, rather
than a list of five writes that a sixth material would escape. Only the innermost layer of
each construction affects the daylight answer, so writing the outer layers too is
harmless; it costs nothing and removes a class of miss.

**Why this needs no new construction layer.** The obvious reading of "interior reflectance
must be independent of exterior absorptance" is that a single-layer `Material:NoMass`
cannot carry two different faces, so an interior finish layer has to be added. It does not:
`solar_absorptance` and `visible_absorptance` are separate fields on the same material, the
exterior shortwave calculation uses the solar one, and split flux uses the visible one. The
two controls therefore separate cleanly on the fields that already exist. This matters
because the code's own comment says a construction's layer count is its identity
(`src/model.js:1017`), and adding a layer would move thermal resistance as a side effect of
a lighting fix.

**Alternatives considered.**

- *Two controls, walls and ceiling separately.* Rejected at the specification stage
  (FR-011 says one control), and the reading above supports that: the ceiling defect and
  the wall defect are the same defect, so one control corrects one mistake.
- *A fixed realistic value with no control.* Rejected: `visT` already demonstrates what an
  input that reaches nothing costs, and a fixed interior reflectance would make the
  dominant surface unreachable by the reader while the number depends on it.

**Open, and deliberately left to implementation**: the control's own range, default, step
and published landmarks. Landmarks are required to cite a source (`CLAUDE.md`, "Only add
one where somebody published it"), so the default must be defended from a publication
rather than from the 0.60 the assessment used as a realistic comparator.

---

## 5. The reading's own arithmetic

**Decision.** The median of the hourly `Daylighting Reference Point 1 Illuminance` series,
over the hours the zone is occupied, design days excluded, computed in a DOM-free reader
beside the existing ones in `src/readings.js`.

**Rationale.** FR-001 fixes the statistic and the hour set. Three details follow from
existing code rather than from choice:

- **Occupancy is a floor, not a nonzero test.** `occupiedFloor(params)` exists precisely
  because the occupancy fraction is 0.1 out of hours, so `> 0` is not "occupied"
  (`CLAUDE.md`, TM59 section). The daylight reader uses the same question, or it will take
  its median over 8,760 hours and report a number about the night.
- **Design days are excluded** the same way the bill and the overheating count exclude
  them: by reading which environment each timestamp belongs to, never from `params`.
- **The series is hourly and zone-level.** Principle VI forbids per-surface output
  variables; this is a zone-average variable on one zone, so the cost is one more ESO
  series.

**A median needs the whole series, and that is new.** Every existing reader on this sheet
either sums, averages or counts, which can be done in one pass with constant memory. A
median has to hold the occupied hours to sort them. For an annual run that is at most 8,760
numbers, which is nothing beside the ESO already parsed, but it is a different shape of
reader and the plan should not pretend otherwise.

**The three pieces already exist and are reused rather than restated.**

- `occupiedFloor(params)` is at `src/model.js:2004-2019`, and its own comment records the
  measurement that forced it: over a Chicago year, 1 May to 30 September, `> 0` gives 3,672
  hours, which is 153 x 24 and also, exactly, the figure CL:2026 publishes for a bedroom,
  "so the wrong test agrees with a published number for entirely the wrong reason".
- `occupied(scheduleValue, floor)` at `src/tm59.js:1074-1089` throws rather than defaults
  when the floor is missing, which is the behaviour this reader wants unchanged.
- `weatherRuns(points, environments)` at `src/tm59.js:1091-1106` is the design-day
  exclusion, built on `environmentRuns` in `src/readings.js:43-79`. Its comment records
  that the bill learned this the expensive way: an annual run carrying two design days
  added about 3 % to the heating.

The floor reaches a sampled reading through the quantity's `context` hook, the same way
the three TM59 quantities get it (`src/study.js:611`, `:623`, `:648`, and
`contextFor` at `src/main.js:8921-8924`). The daylight quantity declares
`context: (desk) => ({ floor: desk.occupiedFloor })` and its `read` takes the floor from
there rather than from `params`, which is Principle III as it applies to a sampled run.

---

## 6. Where the method and the validity limit are stated, and a conflict with the spec

**This section records a conflict between the specification and the repository's own
conventions, and proposes a resolution rather than deciding it silently.**

FR-005 says the reading "MUST state, in view and not in a fold or on hover, what it is,
**how it was computed**, and where in the room it was taken". FR-006 says the validity
limit being passed must be stated in view.

The repository says the opposite about one of those three things. `CLAUDE.md:411-416`:

> In view: the reading, its verdict or absence, and at most one short line. **Method and
> citations go in a fold** (`fold()` in `console.js`). Readings, verdicts, absence reasons,
> blocking reasons and refusals never go in a fold.

And the design system already has a pattern for exactly this case, "Qualifying a reading in
place" (`.interface-design/system.md:1022-1057`), whose rules are:

> - **In place, never on hover.** Same rule that put what *Chase* means above the
>   scoreboard: `pointer: coarse` has no hover, so a caveat that floats does not exist on
>   the phone where a figure is most likely to be carried away from the page it was read on.
> - **In place, and folded under a summary that states the count.** The `dl` sits inside a
>   `.fold` whose summary says how many reasons there are, with the number read off the
>   list rather than typed.

**Proposed resolution**, which satisfies both documents and needs the maintainer's
agreement before it is built:

- **In view, never folded**: the figure, its unit, the probe's position, the statement that
  no published line judges this reading (FR-007), and the statement that the method's depth
  limit has been passed where it has (FR-006). These are the reading, its absence of a
  verdict, and a qualification on the figure, all of which the fold ban names.
- **Folded, under a summary that states the count in view**: the method's own text, what
  split flux does, why the value is offered as a ranking rather than a measurement, and the
  citations. This is method and citation, which `CLAUDE.md` sends to a fold, and the
  console already declares the summary word for it: `reading: 'Method'`
  (`src/console.js:100`).

The reading therefore never hides that there are caveats or how many, and never hides that
the limit is passed; it folds only the prose explaining them. That is what the design
system's own pattern does, and it is why that pattern exists.

**If the maintainer prefers FR-005 read literally**, the method text goes in view and the
`CEILING` budget (40 words, any single visible block, `src/copy.js:49`) becomes the binding
constraint on it, and `CLAUDE.md`'s convention needs amending in the same change rather
than being quietly broken. That is a larger change than this feature, which is why it is
raised here rather than assumed.

### Maintainer's decision, 2026-09-20

**The proposed resolution is what gets built.** The split above is the answer: the figure,
its unit, the probe's stated position, the sentence that no published line judges the
reading, and the validity breach are in view and never folded. The method's own text, what
split flux does, why the figure is offered as a ranking instrument, and the citations sit in
a fold whose summary states the count in view, under the console's existing `SUMMARY.reading`
word `'Method'` (`src/console.js:100`).

So `CLAUDE.md:411-416` is not amended and is not broken, FR-005's "not in a fold or on hover"
binds the qualification rather than the prose behind it, and the reader is never able to miss
that caveats exist or how many there are. T027 letters it, T041 records the pattern in
`.interface-design/system.md` so it does not live only in a stylesheet.

---

## 7. The reading gets no colour

**Decision.** Graphite. No hue, no `--cold` / `--warm`, and `--redline` only where the
sheet already spends it.

**Rationale.** `.interface-design/system.md:67-76` reserves the cold/warm pair for signed
physical quantities and refuses a hue for a category or a section: money and carbon get
none for exactly this reason, being unsigned magnitudes. An illuminance is an unsigned
magnitude. The survey is already graphite on the same argument
(`.interface-design/system.md:684-686`).

This also settles what the E-02 ground does with it: nothing new. The ground is already
drawn in one hue for any reading, so a daylight ground is the existing drawing with a
different series behind it.

---

## 8. Units

**Decision.** Nothing to add. `illuminance` is already a declared kind,
`src/units.js:175`:

```js
  kind({ id: 'illuminance', si: 'lx', ip: 'fc', factor: FT2, digits: 0 }),
```

Its offset is zero, so `deltaKindOf` returns it unchanged (`src/units.js:493-496`) and a
*change* in the reading letters through the same kind. This feature therefore does not
touch the trap that has caught this codebase three times, where a difference lettered
through a temperature kind carries Fahrenheit's 32.

One constraint it does inherit: `kindFor` throws at load if a declaration names
`quantityKind: 'illuminance'` and also spells a unit that is not exactly `'lx'`
(`src/units.js:307-330`). The existing `dlSetpoint` control complies
(`src/controls.js:4610`) and the new declarations must too.

---

## 9. The link

**Decision.** No `LINK_VERSION` bump for the reading. The interior reflectance control is a
new key, and adding a control is free under the existing delta-encoded format.

**Rationale.** The specification's assumption says this, and the mechanism supports it: a
chosen reading rides the link as a **value** under the reserved `sty` / `sv` keys, not as a
key of its own, so a new roster entry adds no key and changes no default. The one thing
that does move is what an old link *produces*: the reflectance correction changes lighting
energy and everything derived from it on any desk with Daylight engaged. The link still
restores the desk it named. The numbers that desk produces are the corrected ones, and the
specification records that as accepted.

Confirmed in the codec itself. `sty` carries a quantity id and `sv` carries series ids, both
as values under reserved keys declared once at `src/permalink.js:104`. The decoder accepts
any id the roster knows: `permalink.js:590` matches `sty` against
`/^([A-Za-z][A-Za-z0-9]*)(?:\.(...))?$/` and then asks `QUANTITY_BY_ID`, and
`decodeSurvey` splits `sv`'s reading field on `.` and asks `READING_BY_ID`
(`permalink.js:379-384`).

**Two constraints on the new ids follow directly**, and both are load-bearing:

- The quantity id must match `[A-Za-z][A-Za-z0-9]*`: letters and digits, starting with a
  letter, and **no dot, dash or underscore**. A dot would be read as the separator before
  the open study control keys.
- The series id must carry no dot either, because `sv` joins two of them with one.

**And the converse is the thing to be careful about.** A reading id cannot be renamed later:
`src/study.js:603-605` records that "a reading id is a value inside a shared link and
renaming one would quietly refuse every survey link ever sent at it", and
`src/survey.js:301-310` asserts series-id uniqueness across the whole roster for the same
reason. The id chosen in this feature is permanent. `.harness/links.mjs` is the standing
gate and gains a round trip for it.

---

## 10. Cost

**Decision.** One extra hourly ESO series on every solve, accepted, with the design-day
cadence measured rather than assumed before the feature is called done.

**Rationale.** The budget is Principle VI's. The measured baselines the specification cites
come from `.harness/tmp-daylight-wasm.mjs`: +5 % on a 0.98 s WebAssembly annual run at nine
probe points, +27 % at twenty-five. This feature writes **one** point, so the annual figure
should sit well inside the +5 % ceiling, but the number that actually matters is the one
nobody has measured: the design-day solve, which re-runs continuously during a drag at
about 50 ms and now carries the probe on every frame.

That measurement is owed before the feature ships, and it is the first thing to revisit if
the drag budget slips. The specification's own assumption says so.

---

### The design-day cost, measured (T011)

`.harness/tmp-daylight-dd-cost.mjs`, staged WebAssembly engine, five runs per configuration,
minima beside medians. Deleted after the measurement per T045; the figures below are the record. This is the figure nobody had taken, and the gate FR-014's always-on
decision hangs on.

```text
  no probe             solve    223 ms min /    227 ms med   parse    0.4 ms min   eso  16 kB, 20 series
  probe, as shipped    solve    230 ms min /    236 ms med   parse    0.2 ms min   eso  17 kB, 21 series

  the probe adds 7 ms to the solve (3.3 % of 223 ms) and nothing measurable to the parse.
  the ESO grew by 0.7 kB and exactly 1 series.
  run-to-run spread is 1476 ms without the probe and 49 ms with it, so this measurement
  resolves nothing finer than 1476 ms.
```

**Verdict: FR-014 stands, and the always-on decision does not need revisiting.** The probe
adds one hourly series and under a kilobyte to a design-day ESO, and its cost on the solve is
3.3 % on minima and comfortably inside a noise floor this machine cannot see past.

Two caveats are part of the result rather than apologies for it:

- **Every run here instantiates a fresh WebAssembly module**, because EnergyPlus's `main` is
  not re-entrant. The page does not: it keeps one engine warm across a drag, which is where
  the 50 ms warm cadence comes from. So the absolute totals above are much larger than what a
  reader feels, and the figure that transfers is the difference, which shares the
  instantiation and cancels it.
- **The difference is below the noise floor**, and the harness says so rather than quoting
  7 ms as though it were a cost. What can be asserted is the shape of the change, one series
  and 0.7 kB, and that is asserted exactly.

---

### The trade, measured (T019, T037)

`.harness/tmp-daylight-sweep.mjs`, Chicago O'Hare TMY3, Gains and System in, the daylight
quantity read **through the roster** rather than by calling the reader directly, so a wrong
declaration fails here.

```text
  south ratio   daylight       lighting    heating    cooling
        0.05      80 lx    5975.5   4192.5   9536.3
        0.20     371 lx    5975.5   4091.9  10632.6
        0.40     758 lx    5975.5   4023.3  12514.2
        0.60    1120 lx    5975.5   4041.0  14530.3
        0.90    1643 lx    5975.5   4200.1  17680.3
```

**This is the feature.** The reading climbs from 80 lx to 1,643 lx across the sweep while
cooling climbs from 9,536 kWh to 17,680 kWh. Every consequence the sheet reported before was
on the right of that table and all of them get worse as the window opens, which is why the
sheet pointed at the smallest window it could sweep. The left column is what was missing.

US5 falls out of the same runs. Visible transmittance, a declared control with published
landmarks and an eighteen-fold range, moves the daylight reading from 31 lx to 555 lx and
moves **no energy figure at all**: lighting 5975.5, heating 4091.9 and cooling 10632.6 at both
ends, identical to the last digit. That is the defect `tmp-vist-reaches-nothing.mjs` recorded,
still there, and now answered.

**One trap sprung, and worth recording because it is the same one twice.** The first run of
this harness reported 5 lx where the answer is 371. It passed `occupiedFloor` a parameter
*overlay* rather than the whole parameter set, so `roomType` was absent, the floor came back
as 0 instead of 0.1, and `occupied` counted the value the band schedule sits at out of hours
as occupancy. The median was then taken over every dark night of the year. This is exactly
the trap `tm59.js` carries a twenty-line comment about, sprung from the caller's end rather
than the reader's, and it is why the reader throws on a missing floor rather than defaulting
one. The harness now asserts the floor is above zero before it reads anything.

### The reflectance correction, measured (T035, T036)

`.harness/tmp-reflectance-sensitivity.mjs`, section 2, through `applyModel` rather than
through a probe the harness built itself. Section 1 of that file is retired: it cannot run any
more, because the document now carries a `Daylighting:ReferencePoint` named `Probe` of its own
and the old section's `doc.add` of the same name throws. The collision is the feature working.

One rule reaches the innermost layer of every construction the desk can build:

```text
  walls, no mass        R13WALL → R13LAYER               follows the control
  walls, wallMass > 0   R13WALL → WALLMASS               follows the control
  ceiling               ROOF31  → R31LAYER               follows the control
  floor, Mass in        FLOOR   → C5 - 4 IN HW CONCRETE  follows the control
  floor, Mass out       FLOOR   → FLOORLIGHT             follows the control
```

`WALLMASS` is the one a naive fix misses, and it took two passes to *report* correctly here:
`Construction` numbers its layers as named fields, `outside_layer` then `layer_2` upward, and
carries no extensible rows, so a first draft reading `c.extensible` named the **outside** layer
as innermost. The assertion passed anyway, because one rule gives every opaque material the
same value and there was nothing to disagree with. That is the shape of a gate that passes
about the wrong surface, and it is fixed.

With the Daylight channel engaged, on the shipped desk:

```text
  interior 0.25 (as shipped):  daylight 148 lx   lighting 3791.1 kWh
  interior 0.60 (corrected):   daylight 371 lx   lighting 3155.4 kWh
```

**What moved, and it is all traceable to this one control (SC-008):** the daylight reading, by
2.50x, and lighting energy, by 635.7 kWh, because a lighter room lets the sensor dim further.
Everything derived from metered energy moves with the lighting: energy use intensity, cost and
carbon. Heating and cooling move only through the lighting gain they no longer receive.

Two claims about what does **not** move, both asserted:

- Moving both exterior absorptances end to end, 0.95 against 0.05, leaves the daylight reading
  at exactly 371 lx. One control, one meaning: the reader moves the interior and the room gets
  lighter, and the exterior absorptances go on describing the outside of the building.
- `wallAbs` and `roofAbs` still write `solar_absorptance` and no longer write
  `visible_absorptance` at all. What they lost is a write they should never have had.

**The landmark is still owed (T031).** `CLAUDE.md` permits a landmark only where somebody
published it. The 0.60 default is the value the assessment used as a realistic comparator,
which is a comparator and not a citation, and no published interior reflectance schedule has
been read and verified for this repository. The control therefore ships **bare**, with a note
and no landmark band, which is what the task prescribed for exactly this case. A band drawn
from memory would be worse than no band.

### The quickstart, run end to end (T044): eight of nine

Every step was run on this machine against native EnergyPlus 26.1.0 except step 9, and each
result is recorded above or in the harness that produced it.

| Step | Checks | Result |
|---|---|---|
| 1. The declarations throw at load | FR-020, gate 5 | **Pass.** `.harness/declarations.mjs`, 11 invariants broken one at a time, 11 distinct throws. The reading's own four are there: no method statement, no stated position, a target attached, and the inherited non-target assertion. |
| 2. Idempotence, with ownership moving | gate 2 | **Pass.** `.harness/gains.mjs` section 7. Three applies byte-identical at six desk positions; Daylight, Gains and Glazing driven out and back; the probe listed first every time and no orphan reference point. This was the step named most likely to fail and it did not. |
| 3. The output variable exists at this version | gate 3 | **Pass.** `.harness/variables.mjs`. Present in the ESO dictionary hourly in lux, listed in the run's own `.rdd`, distinct from the neighbouring window variable, and nothing "requested but not generated" beyond `model.js`'s standing `OtherEquipment` pair. |
| 4. The measurement does not change the building | FR-004, SC-004 | **Pass.** `.harness/tmp-probe-shipped.mjs`. 5975.523532800727 kWh with the probe and without; 3698.4165654702533 kWh with and without while dimming. Full precision, no tolerance. |
| 5. The probe's ordinal is pinned at 1 | research §1 | **Pass.** Point 1 reads 194.04 lx with the channel out and in; with the probe's entry lifted out, point 1 becomes the sensor's 321.97 lx. A desk with no opening reads a clean measured 0 lx over 8,760 hourly values. |
| 6. The codec round trips, both ways | FR-017, gate 4 | **Pass.** `.harness/links.mjs`. The reading id round trips through `sty`; `interiorRef` encodes as a scalar and is omitted at its default; `LINK_VERSION` is still `v1` and `MIGRATIONS` gains no step. A link minted before this change adds only the daylighting objects, loses nothing, and changes one field of the materials it shares. |
| 7. The reflectance correction lands on every surface | FR-011, FR-012, SC-003, SC-008 | **Pass.** All five innermost layers follow the control, `WALLMASS` included. `wallAbs` and `roofAbs` keep `solar_absorptance` and no longer write `visible_absorptance`; moving both end to end leaves the reading at exactly 371 lx. |
| 8. The cost, on the cadence that matters | FR-016, SC-005 | **Pass.** One series, 0.7 kB, 3.3 % of a design-day solve on minima, inside a 1,476 ms noise floor. FR-014's always-on decision stands and does not need revisiting. |
| 9. Driven, at 390 px, in both unit systems | FR-005 to FR-007, FR-018, FR-019, SC-007 | **Partial.** See below. |

**Step 9 is the one that did not finish, and the reason is the environment rather than the
build.** What was verified in a real browser at 358 px, which is narrower than the 390 px the
step asks for:

- the daylight readout renders, **outside** the strip's fold, and is legible with the strip
  shut and with the Daylight channel patched out, which is the arrangement FR-005 and FR-014
  together require;
- its absence sentence letters correctly on the shipped desk: "patch Gains in; this run
  carries no hourly Occupancy series", naming the fix;
- the page has no horizontal scrolling at that width;
- the in-view qualification measures 37 words against the 40-word `CEILING` budget, and the
  method's prose measures 59 in its fold.

What could not be driven: a solve carrying an actual figure, the study curve, the E-02 ground,
and the SI to IP and back round trip. The browser this session could reach reported
`document.visibilityState === "hidden"` and would not resize above 358 px, and a hidden tab
starves `requestAnimationFrame`, which is the trap `CLAUDE.md` already records: the solve
never completes and the sheet never re-letters. Three attempts, including a fresh tab, behaved
the same way. **These four checks are owed and are the outstanding work on this feature.**

## 11. Gates evaluated, with the answers

| Workflow gate | Status | Note |
|---|---|---|
| 1. Verified outside the browser first | **Owed, and started** | `.harness/tmp-probe-arrangement.mjs` already answers the arrangement question; the reader and the reflectance correction need their own. |
| 2. Idempotence | **Owed** | This feature writes IDF objects, unlike 013. `applyModel` three times must be byte-identical, and the probe's applier must remove its objects when it stops writing them. |
| 3. Every IDF validated and run | **Owed** | Including `.harness/variables.mjs` gaining the new output variable, which is the gate for the one engine name this feature depends on. |
| 4. Codec round trip | **Owed** | The new reading id and the new control key, plus a pre-existing link re-read. `.harness/links.mjs`. |
| 5. Declaration invariants throw at load | **Owed** | FR-020 names three: no method statement, no stated position, a target attached. |
| 6. General notes | **Triggered** | FR-021. This feature adds a reading and changes what the Daylight channel writes, so `NOTES` in `src/tour.js` changes and the storage key bumps. Unlike 013, this gate is not merely evaluated. |
| 8. Design system | **Triggered** | Section 6 above. Whatever is decided there is recorded in `.interface-design/system.md` in the same change, because a pattern living only in a stylesheet is the second source of truth Principle III forbids. |

---

## 12. What a roster entry actually costs, and the three declarations it must not miss

**Decision.** The reading is one `Quantity` in `QUANTITIES` (`src/study.js:513-651`) and one
`QuantitySeries` under it, plus three declarations elsewhere that the roster's own load-time
assertions require. No chooser is edited.

**Rationale.** All three surfaces that let a reader pick a reading are generated from the
roster and pick a new entry up as data:

- the study card chooser, `studyQuantityChooser` (`src/console.js:1928-1982`), over
  `study.offers` from `offersFor` (`src/study.js:730-812`), which maps `QUANTITIES` directly;
- the E-02 survey chooser, `renderSurveyChoose` (`src/main.js:10514-10553`), over
  `surveyReadingOffers` (`src/main.js:9977-9987`), which maps `READINGS`;
- the pull, which has no chooser of its own and inherits the survey's first reading
  (`src/main.js:12101`).

That is the test of whether the roster is the right place for this. If a chooser needed
editing, daylight would not really be a reading.

**The three declarations that are not optional**, each enforced by a throw at module load:

1. **A `SENSE` entry** in `src/survey.js:132-159`, keyed by *series* id, declaring
   `better: 'higher'` with a stated why. Improving direction is not on `Quantity` at all,
   deliberately: a study draws a curve and lets the reader read it, so it needs no
   direction, while the survey's descent, its improving region and the pull's ranking all
   do. Without the entry, `Reading.improves` (`src/survey.js:211-220`) and `pullReadingFor`
   (`src/pull.js:377-387`) refuse the reading by name. This is FR-008, and daylight is only
   the second `'higher'` reading on the sheet after the zone low.
2. **Membership of `nonTargets`**, the closed set at `src/study.js:942`, currently
   `['extremes', 'demand', 'high', 'low', 'cost', 'carbon']`. The assertion at
   `src/study.js:946-950` requires every quantity to be either a target's `metric` or a
   member of that set, and throws naming the declaration otherwise. This is how FR-007 is
   satisfied structurally rather than by intention: a future standard that published a
   daylight line would have to take the reading off this list deliberately.
3. **Nothing in `movedBy`.** The 66-of-78 priced-pairing count is asserted exactly at
   `src/study.js:932-936`. Daylight reads no bill, so it declares no priced reach, and the
   count must come back unchanged. If it moves, something is wrong.

**FR-007's sentence already exists and is inherited, not written.** The survey already
letters a stated reason where no standard publishes a limit, `absenceIn` at
`src/survey.js:2170-2186`: *"No standard on this sheet publishes a limit for {label}, so
this ground carries no threshold line."* and, under a chase, *"{Preset} publishes no limit
for {label}, so this ground carries no line while it is chased."* Six readings already take
that path. The daylight reading is the seventh, and the only new thing about it is that it
is the first **measured physical quantity** on the list rather than a container, a series of
one, or a priced figure. That is the assessment's open question about whether such a reading
is a first-class citizen of the register, and the answer the code gives is yes, through a
mechanism that already runs.

**One correction to the specification's arithmetic.** The spec and the assessment both say
thirteen `Unjudged` criteria are declared. There are **fourteen**, across four presets:
three under `passivhaus` (`src/schemes.js:674`, `:680`, `:686`), two under `enerphit`
(`:747`, `:755`), one under `leti` (`:803`), and eight under `tm59` (`:1043` through
`:1096`). Nothing in the feature turns on the count; it is corrected here so the next
reader does not inherit it.

---

## 13. What `Quantity` and `RunContents` actually are

Recorded because two of this plan's own first guesses were wrong, and the wrong ones are
the kind that survive into a task list.

- **`RunContents` lives in `src/contents.js`, not `src/study.js`**, and is a deliberate leaf
  module: it exists to break the `model.js` -> `study.js` -> `schemes.js` -> `tm59.js` ->
  `model.js` import cycle (`src/contents.js:1-20`). `study.js` re-exports it. The daylight
  contents constant is declared beside the others at `src/study.js:464-480`, but the class
  it instantiates comes from `contents.js`.
- **The field on `Quantity` is `needs`, not `runContents`** (`src/study.js:278-280`), and it
  is refused if empty. There is no `requires`, `derived` or `withdrawn` field on `Quantity`:
  those belong to `Channel`, `Meter` and `Scale` respectively.
- **`syncReporting` has exactly two branches**, `reporting instanceof RunContents` and
  `reporting === 'sheet'`, and anything else throws (`src/model.js:2561-2667`). The
  `'extremes'`, `'energy'` and `'tm59'` profile names survive only as prose in a docstring
  describing the era before contents were declared. A daylight reading therefore declares a
  `RunContents` naming its one variable, and the sheet's own solve picks the variable up
  through the `'sheet'` branch, which is a second place the request has to be added.
- **`Quantity.pen` takes `'--warm'`, `'--cold'` or null.** Daylight takes null, per section 7.


---

## 14. The before-numbers, measured (T002)

`.harness/tmp-baseline-014.mjs`, Chicago O'Hare TMY3, native EnergyPlus 26.1.0, the shipped
desk with only the south window ratio moved. The harness was a one-off and has been deleted
per T045; the table below is its whole output and is the record. Recorded so SC-008's claim about which figures
moved can be checked against a figure rather than against a memory. Machine-readable copy at
`.harness/out/baseline-014/baseline.json`.

**The finding that was not in the plan: there are two desks, not one.** `DEFAULT_BYPASS`
ships with **Gains and System both out**, so the desk the page actually boots on reports no
lighting, no heating, no cooling, no bill and no peak loads. Its entire roster is the zone
temperature range and the overheating share. Two consequences follow, and neither changes a
requirement:

- The energy-against-daylight trade the problem statement is about does not exist on the
  booted desk, because the energy half of it is absent there too. It exists from the moment a
  reader patches Gains and System in, which is the desk every measurement in this feature is
  about.
- That same desk is the only one carrying an hourly `Occupancy` series, so on the booted desk
  the daylight reading lands as the stated absence `data-model.md` §4 already declares for it,
  "patch Gains in; this run carries no hourly Occupancy series", naming its fix. This is the
  designed behaviour and not a gap: FR-014 says the reading must not be conditional on the
  **Daylight** channel, and it is not. Gains is a different channel and a different question.

```text
desk      position     when         high     low  peakHeat  peakCool    TEDI    CEDI  overheat   heating   cooling  lighting    equip  severe
---------------------------------------------------------------------------------------------------------------------------------------------
shipped   wwrS-0.05    design day     31.9   -18.2       —       —       —       —       —       —       —       —       —       0
shipped   wwrS-0.05    year           34.9   -11.8       —       —       —       —    26.0       —       —       —       —       0
shipped   wwrS-0.20    design day     32.7   -18.1       —       —       —       —       —       —       —       —       —       0
shipped   wwrS-0.20    year           36.2    -9.5       —       —       —       —    30.8       —       —       —       —       0
shipped   wwrS-0.40    design day     34.3   -18.1       —       —       —       —       —       —       —       —       —       0
shipped   wwrS-0.40    year           38.2    -6.9       —       —       —       —    35.1       —       —       —       —       0
shipped   wwrS-0.60    design day     35.7   -18.1       —       —       —       —       —       —       —       —       —       0
shipped   wwrS-0.60    year           40.1    -5.6       —       —       —       —    39.0       —       —       —       —       0
shipped   wwrS-0.90    design day     37.8   -18.0       —       —       —       —       —       —       —       —       —       0
shipped   wwrS-0.90    year           43.0    -4.8       —       —       —       —    44.6       —       —       —       —       0

serviced  wwrS-0.05    design day     26.0    20.0    21.0    27.9       —       —       —    73.1     0.0    21.2    21.2       0
serviced  wwrS-0.05    year           26.0    20.0    24.7    29.3    18.1    41.1    45.4  4192.5  9536.3  5975.5  5975.5       0
serviced  wwrS-0.20    design day     26.0    20.0    22.6    29.3       —       —       —    82.5     0.0    21.2    21.2       0
serviced  wwrS-0.20    year           26.0    20.0    25.9    32.7    17.6    45.8    47.2  4091.9 10632.6  5975.5  5975.5       0
serviced  wwrS-0.40    design day     26.0    20.0    24.8    32.2       —       —       —    94.7     0.0    21.2    21.2       0
serviced  wwrS-0.40    year           26.0    20.0    27.1    39.3    17.3    53.9    49.5  4023.3 12514.2  5975.5  5975.5       0
serviced  wwrS-0.60    design day     26.0    20.0    27.0    35.4       —       —       —   106.8     0.0    21.2    21.2       0
serviced  wwrS-0.60    year           26.0    20.0    29.3    46.5    17.4    62.6    51.5  4041.0 14530.3  5975.5  5975.5       0
serviced  wwrS-0.90    design day     26.0    20.0    30.1    40.4       —       —       —   124.6     0.0    21.2    21.2       0
serviced  wwrS-0.90    year           26.0    20.0    33.0    57.5    18.1    76.1    53.4  4200.1 17680.3  5975.5  5975.5       0
```

Three things in this table are worth stating out loud, because each is a trap for a later
reading of it:

1. **Lighting is flat at 5975.5 kWh across the whole window sweep**, and so is equipment, and
   the two are equal because both are declared at 8 W/m² on the same schedule. Flat lighting
   is the defect the feature exists to answer: the window is doing no lighting work in this
   model, because the Daylight channel is out and nothing else reads the glass optically.
   It is also the neutrality baseline `tmp-daylight-neutral.mjs` measures the probe against.
2. **Cooling rises 85 % across the sweep and heating barely moves**, so every reported
   consequence of a bigger window on this desk is a cost. That is the problem statement,
   measured on this machine rather than quoted.
3. **The design day carries no cooling at all** (0.0 kWh) and no TEDI or CEDI, because those
   are whole-year readings by declaration. A design-day sample answering them would be a
   sample answering a question it cannot, which is what `wholeYear` refuses.
