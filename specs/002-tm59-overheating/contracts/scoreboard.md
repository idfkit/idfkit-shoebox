# Contract: the scoreboard, the register and the link

What the existing surfaces have to grow. Nothing here is a new panel: the sheet
already letters a standard's targets under the results, and TM59's criteria go
there, beside the fixed-line criteria they sit next to.

## `Target`, in `src/schemes.js`

Two new fields and one new `needs` value. Existing targets are untouched.

```js
new Target({
  id, label, metric, limit, unit, asks,
  needs: 'year' | 'run' | 'season',   // 'season' is new
  category: null | Category,          // new: which category this line is
  above,                              // unchanged
  note,                               // unchanged
})
```

`needs: 'season'` means the run has to reach some part of 1 May to 30 September.
It is neither `'year'` (no TM59 criterion needs twelve months any more, since
2026 moved all four onto the summer) nor `'run'` (two design days in January
answer nothing here).

`metric` gains `'tm59a'`, `'tm59b'` and `'tm59c'`. `targetReading` resolves them
off `lastOutcome` exactly as it resolves `'tedi'` today, with the category
carried in the key so a·I and a·II do not collide.

**`Target.meets` is unchanged**, because criterion b happens to be a
less-than-or-equal test like every other line: four nights or fewer clears it.

## `readOutcome`, in `src/main.js`

Gains the TM59 readings, taken once at the solve rather than off the ESO at draw
time, by the rule `lastOutcome` already follows: the register re-letters on every
gesture and re-reading 8,760 points to do it would make a drag stutter for a
number that cannot have changed.

```js
tm59: {
  readings: Reading[],     // a·I, a·II, b·I, b·II, c
  count: Count,            // criteria a and b, Category II
  coverage: Coverage,
  line: { low, high, mean },   // the comfort line the run was judged against
  qualifications: Qualification[],
}
```

The running mean is **not** rebuilt here. It is cached on the attached weather
file's identity and is recomputed only when the station changes, which is the
same place `studies` and the sample cache are cleared.

## `targetBlock`, in `src/main.js`

Three new blockage keys, and the existing precedence is extended rather than
reordered. The order matters for the same reason it already does: telling
somebody to attach a weather file before telling them to patch Gains in would
send them off to fetch a year they do not need.

| Key | When | Says |
|---|---|---|
| `season` | The run reaches no part of May to September | `run some of May to September, this is a summer number` |
| `occupancy` | Gains is out, or the schedule sums to zero | `patch Gains in, with nobody home there are no occupied hours to be a share of` |
| `operative` | `Zone Operative Temperature` is not in the ESO | `not carried by this run` |

`targetAbsence` is the one copy of this ordering on the page, and the board's
note and the margin cell both read it, so they cannot disagree about which
blockage a line is under.

## `renderScore`

The TM59 lines join the existing scoreboard. Three additions to what a row
carries.

- **The comfort line, lettered** (FR-006). Criterion a's rows say the range the
  threshold moved through and its mean over the covered days, because the line
  moved during the run and a reader cannot check a verdict against a limit they
  cannot see. Where a clamp was in force for part of the period, the row says so.
- **The period covered** (FR-010). `Coverage.months` and `days of 153`, beside
  the reading.
- **What the reading is of** (FR-007, FR-016, FR-015). Operative temperature;
  the building as drawn where `roomType` is `'As drawn'`; and what the attached
  weather declares itself to be against what WFR:2026 requires, with no judgement
  of whether they match.

## The count row

One row, not four. It letters both numbers and its scope:

> Of the 2 criteria read for the naturally ventilated Stage 1 pair at Category
> II, 2 cleared. Criterion c is read separately and is outside this count;
> criterion d could not be read.

`renderScore` may not attach a pass or fail word to TM59's name anywhere
(FR-017, SC-006). The individual criterion rows carry verdicts, as every
scoreboard row does; the method does not.

## The qualifications block

Under the TM59 rows, in place, never on hover (Principle VII, FR-019). Each
`Qualification` is one line. It folds by the schedules' own rule at 620 px: the
`says` keeps its line and the `because` stands under it with its head lettered
from `data-head`, set where the cell is built.

`SC-005` is the acceptance test and it is countable: a reader who reads only this
block can state at least four specific reasons why this is not a TM59 compliance
assessment. The module asserts at least four `standing` qualifications at load,
so the count cannot silently fall below the promise.

## The permalink

Five new keys ride: `roomType`, `occPattern`, `equipPattern`, `lightPattern`,
`peopleCount`, `equipPeak`. All are ordinary controls under delta encoding, so:

- `LINK_VERSION` does **not** move. Adding a control is free.
- `DEFAULTS_BY_VERSION` is not frozen again and `MIGRATIONS` stays empty.
- A link minted before this feature omits all six, takes the defaults, and
  resolves to a byte-identical IDF (FR-027, SC-011). This is asserted, not
  assumed: the harness decodes a link captured at `HEAD` and compares the IDF.

The pattern keys are non-numeric and are taught to `readValue` **above** the
numeric regex. `ALL_KEYS` is re-asserted against the reserved keys (`in`, `out`,
`stn`, `win`, `at`) at module load, as it already is.

**Nothing about how the criteria are read rides the link**, because there is
nothing: no category is selected, no route is chosen, no room type is declared
for the criteria's sake. `roomType` rides because it reaches the IDF, not
because a criterion consults it.

## The study metric

`makeStudyJob` gains `metric: 'tm59a'`. Three consequences.

- **A new lean reporting profile**, `'tm59'`, in `syncReporting`: the zone mean
  air temperature `zoneRuns` needs, `Zone Operative Temperature`, and the
  `Occupancy` schedule value series. Three series, against `'sheet'`'s fifteen
  and `'extremes'`'s one. The clear-and-rewrite rule holds, so "lean then sheet"
  still serialises byte-identically to "always sheet", which the sweep's restore
  depends on.
- **`readPoint` returns null where the sample's run cannot answer** (FR-025), and
  a null sample is absent from the curve rather than plotted as zero. The
  scheduler already handles a null point.
- **The running mean is shared across every sample of a sweep**, because a
  sample carries the desk's climate and the sweep deliberately does not change
  it. It is computed once per study, not once per sample.

## `describe.js`

One clause (FR-026): which air model produced the flow the criteria were read
over, read off the document rather than off `params`, since a naturally
ventilated route read over a sealed building is a different claim. It ranks with
the other channel-flip clauses, above anything a slider can reach, by the `FLIP`
table's existing rule.

## `tour.js`

The general notes are part of done (Workflow gate 6). This feature adds a
criterion the sheet did not read and a control kind the console did not draw, so
`NOTES` and its `target` / `focus` selectors are reviewed, the `tm59` subject is
added where a step teaches what the scoreboard is for, and the storage key
`shoebox-general-notes-v2` is bumped, because the steps change meaning and a
returning reader must not get stale ticks against notes they never read.
