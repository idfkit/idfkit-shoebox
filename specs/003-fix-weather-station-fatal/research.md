# Phase 0: Research

Three unknowns stood between the spec and a plan, and none could be answered by
reading the code. All three were settled by measurement.

1. Is the reported station one broken file, or a class?
2. The reader falls back from an exact name to any design day of the right
   season. FR-002 forbids that substitution. How many stations are currently
   standing on it, and what would deleting it cost?
3. What exactly does the engine reject, and would a stricter parse have caught it?

## The survey

**Method.** The shipped station index (`public/weather/stations.json.gz`, 69,638
archives over 17,330 sites) was reduced to one archive per site, taking the most
recent dated window. From that, 120 sites were drawn with a seeded pseudo-random
pick so the draw is reproducible: 100 from the ordinary WMO range and 20 from the
`99xxxx` band that the reported station sits in, which was oversampled on the
suspicion that it was the affected population. Each archive was downloaded, its
`.ddy` parsed with the same `parseIdf` and the same 26.1.0 schema the page uses,
and every `SizingPeriod:DesignDay` in it examined.

Throwaway Node harnesses under the scratch directory, per the constitution's
verification gates. Nothing was added to the repository.

**Result.**

| | ordinary WMO | custom `99xxxx` | total |
| --- | ---: | ---: | ---: |
| sampled | 100 | 20 | 120 |
| an annual cooling day published, numbers usable | 100 | 8 | 108 |
| **no annual cooling day at all** | **0** | **12** | **12** |
| `Site:Location` present | 100 | 20 | 120 |
| DDY absent from the archive | 0 | 0 | 0 |

Every one of the 12 publishes usable *heating* days. What they lack is any annual
cooling day: onebuilding omits the whole `DB=>MWB`, `WB=>MDB` and `Enth=>MDB`
families when a site has no wetbulb record, and for these sites it omits the
dewpoint family too, leaving one January monthly day as the only object in the
file with `day_type = SummerDesignDay`.

**Scale.** Nothing outside the `99xxxx` band was affected in 100 draws, and 12 of
20 inside it were. There are 330 such sites, which puts the affected population
at roughly 200 sites, against 17,330 reachable. Small in proportion and directly
in a first reader's path, since searching `Boston` ranks one of them first.

### Decision 1: it is a class, and the remedy is for the class

**Decision**: fix the reader, not the station. No allow-list, no deny-list, no
special case for WMO 994971.

**Rationale**: roughly 200 sites, and the population is defined by what the
publisher had to omit rather than by anything about the site, so it will move
when onebuilding republishes.

**Alternatives considered**: hard-coding the known-bad WMO numbers, rejected
because the list would be wrong within one upstream release and because it
answers the symptom; and filtering the `99xxxx` band out of search, rejected
because 8 of the 20 sampled are perfectly usable and a lighthouse or a harbour
station is sometimes exactly the record a reader wants.

## Decision 2: the fallback is load-bearing and must be narrowed, not deleted

This is the finding that shapes the whole change.

**Measured**: the exact name the reader asks for, `Ann Clg 1% Condns DB=>MWB`, is
published for **69 of 120** sites. The heating name it asks for,
`Ann Htg 99% Condns DB`, is published for **120 of 120**. So deleting the
fallback, the obvious reading of FR-002, would refuse **51 sites in 120**, and
**39 of those are perfectly usable today**. That is a 43% refusal rate to fix a
10% fatal rate, which is not a fix.

What the fallback actually reaches, in the 51:

| what the fallback lands on | sites | outcome today |
| --- | ---: | --- |
| `Ann Clg .4% Condns DP=>MDB`, a real annual cooling day | 39 | runs, but at .4% and on a dewpoint basis, while the plate letters `1% clg db` |
| a January monthly day carrying `N` | 12 | the reported fatal |

So there are two distinct wrongs under one fallback, and they need opposite
treatments. The 39 must keep working. The 12 must be refused.

**Decision**: replace the single name plus blind fallback with a **declared,
ordered list of acceptable annual design days**, and take the first one that is
published and whose numbers parse.

- Cooling, in order: `Ann Clg 1% Condns DB=>MWB`, `Ann Clg 1% Condns WB=>MDB`,
  `Ann Clg 1% Condns DP=>MDB`, `Ann Clg 1% Condns Enth=>MDB`.
- Heating, in order: `Ann Htg 99% Condns DB`, `Ann Htg 99.6% Condns DB`.
- A monthly day is never a candidate.

**Rationale**: the severity is held fixed at the 1% and 99% the sheet has always
claimed, and only the humidity basis is allowed to vary, because the basis is
what onebuilding omits when it has no record and the severity is what a reader
would notice changing. The order is a preference, not a search: the day the sheet
names is taken whenever it exists, so the 69 clean sites resolve exactly as they
do today. Measured against the sample, this attaches 108 of 120 and refuses
exactly the 12 that fatal.

The one open behaviour: the survey shows that when `DB=>MWB` is absent, so are
`WB=>MDB` and `Enth=>MDB` (all three are published for the same 69 sites), so in
practice the list collapses to two live candidates. The other two are declared
anyway, because a list that states the whole preference is the thing a later
reader can check, and because the collapse is an observation about today's
upstream files rather than a rule.

**Alternatives considered**: falling back across severities as well, `1%` then
`.4%` then `2%`, rejected because it changes what the number *means* rather than
how its humidity was derived, and the sheet would be sizing at a severity nobody
asked for; and accepting any annual cooling day in file order, which is what
happens today for the 39 and is how they came to be sized at .4% under a `1%`
label.

## Decision 3: the check is against the schema's own field types

**Measured**: EnergyPlus 26.1.0 on the reported day gives two severes and the
reported fatal, before any environment starts:

```text
** Severe ** <root>[SizingPeriod:DesignDay][Boston January .4% Condns DB=>MCWB]
             [wetbulb_or_dewpoint_at_maximum_dry_bulb]
             - Value type "string" for input "N" not permitted by 'type' constraint.
** Severe ** <root>[SizingPeriod:DesignDay][...][wind_speed]
             - Value type "string" for input "N" not permitted by 'type' constraint.
**  Fatal ** Errors occurred on processing input file. Preceding condition(s)
             cause termination.
```

Parsing the same DDY with `parseIdf(text, schema, { strict: true })` **does not
catch it**: the value survives as the string `"N"` under both settings, and the
document parses cleanly. Verified directly. So strictness is not the lever and
an explicit check is needed.

**Decision**: a candidate qualifies only if every field it carries that the
schema types numeric (`schema.field(type, name).t === 'n'`) holds a finite
number. Empty and absent fields are left alone, since an omitted optional field
is not a bad value and EnergyPlus supplies its own default.

**Rationale**: this reads the rule off the schema instead of restating it, which
is Principle III applied to a validation. A hand-written list of the fields to
check would be a second source of truth for the object's shape, and it would go
stale the next time EnergyPlus adds a field, which is exactly the drift the
codebase's own note about `watts_per_floor_area` records.

**Alternatives considered**: checking only the fields the sheet itself reads,
rejected because the engine reads all of them and the sheet's job is to hand over
a document that runs; and validating through a schema validator, rejected because
`@idfkit/core` exports none and adding a dependency for it would need a
constitutional amendment for something three lines of field lookup already does.

## Decision 4: the datum label has to follow the day

Once a family of days can be chosen, `designDayDatums`'s hard-coded `1% clg db`
is a claim about an object it did not look at. It is **already wrong** for the 39
sites the fallback rescues today, which are lettered `1% clg db` over a `.4%`
dewpoint day.

**Decision**: derive the datum label from the design day that was actually taken.

**Rationale**: Principle III, in the one place on the plate where a constant was
standing in for a reading. It is not scope creep bolted on: the candidate list
makes the label a variable, so leaving it constant would be shipping a new drift
rather than inheriting an old one.

**Note on scope**: the specification does not name the datum labels. It requires,
in SC-004, that every design condition the sheet uses be traceable to the station
and period attached, which this is the last piece of. Flagged for the reader of
this plan as the one place where the work is slightly wider than the sentences in
the spec, and it is the cheapest possible time to do it.

## Decision 5: what a refusal offers

**Measured**: all five published periods of Boston 994971 carry the identical
three design days and no annual cooling day. So for the reported station, "try
another period of this site" is a dead end, five times over.

**Decision**: the refusal reopens the picker with the nearest other sites listed,
and the refused site's own other periods reachable behind the existing
`← All locations` step. The nearest-site offer leads.

**Rationale**: it is the offer that actually rescues the reported case.
Boston-Logan is 2 km from the refused station and clean. `nearestSites` already
exists, takes the coordinates the refused station carries, and renders through the
list the picker already has, so this is a call and a render rather than a
mechanism.

**Alternatives considered**: leading with the site's other periods, rejected on
the measurement above; and pre-marking bad stations in the search list, rejected
because whether a period is usable cannot be known until its archive is fetched,
so the mark would be a guess, and a guessed warning on a good station is its own
kind of silent fallback.
