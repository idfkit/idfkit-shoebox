# Phase 0 research: TM59 Category I as a reading

Every question below was settled against the declarations in the repository rather than
from recollection, and each records where the answer is written. Line references are to
the tree at the time of writing.

---

## 1. Where the category is already fixed to one value

**Decision**: The roster of readings is single-category at exactly one declaration,
`TM59_STUDY_CATEGORY` in `src/study.js:192`, which is assigned `COUNT_CATEGORY`
(`src/tm59.js:1681` — Category II). The two category-bearing quantities take both their
reader's argument and their label from it (`src/study.js:538-548`).

**Rationale**: Nothing else in the run path is category-fixed. `readCriterionA` and
`readCriterionB` already take a `Category` (`src/tm59.js:1336, 1476`), the sheet's board
already reads all five readings on every solve (`readTm59`, `src/main.js:5085-5100`), and
`Category` already carries the offset, both published clamps, the night limit and the
presumes sentence (`src/tm59.js:143-206`). The arithmetic for Category I is finished,
asserted at load against the published clamps, and consumed today.

**Alternatives considered**: Re-deriving Category I's line inside the study path — rejected
outright; it would be a second copy of an arithmetic the module already asserts, which is
the drift Principle III exists to forbid.

---

## 2. Separate readings per category, or a category switch

**Decision**: Two new quantities on the roster, `tm59aI` and `tm59bI`, each declaring its
own `Category`. Not a control, not a switch, and nothing new on `params`.

**Rationale**: Three independent reasons, and the third is decisive.

1. It is what the sheet already does one surface along: the board declares `tm59-a-I` and
   `tm59-a-II` as separate `Target`s (`src/schemes.js:950-1010`) and letters them as
   separate rows. A roster that pairs criterion with category matches the declarations it
   is read against.
2. Every chooser is generated from the roster — `offersFor` (`src/study.js:633`),
   `surveyReadingOffers` (`src/main.js:9051`), `READINGS` (`src/survey.js:280`) — so two
   declarations reach all three surfaces with no chooser code at all.
3. A switch would be a second thing that changes a reading and is not the reading. It
   would have to be encoded in the link beside `sty` and `sv`, be part of study and survey
   job identity, and be excluded from `shapeKey` — a whole new axis of state for a fact the
   reading can simply carry. The `sty` and `sv` tokens name a reading today and would
   name a reading and a modifier tomorrow, which is the link-format change this avoids
   entirely.

**Alternatives considered**: a `Selector` control on a `prices: true`-like channel (rejected:
it reaches no IDF and is not a price, so it fits no existing channel kind and would need a
fourth rule in `shapeKey`); a category argument threaded through `latticeOf`, `fallStep`
and `refineOrder` (rejected: it would make every one of those functions ask a question the
`Reading` can answer, at eleven call sites).

---

## 3. Which ids, and what that costs the link

**Decision**: `tm59aI` and `tm59bI` are added. The existing `tm59a` and `tm59b` keep their
ids and stay Category II. No `LINK_VERSION` bump, no `MIGRATIONS` step, no change to
`DEFAULTS_BY_VERSION`.

**Rationale**: A reading id reaches a link as a **value**, not a key: `sty=tm59a.wwrS`
and `sv=wwrS*wallR*tm59a`. `LINK_VERSION` governs parameter keys, defaults and ranges
(`src/permalink.js`, and the constitution's Principle II), none of which this touches —
`params` is untouched, so `encodeState`'s identity diff is untouched. Renaming `tm59a` to
`tm59aII` for symmetry would silently invalidate every survey and study link ever shared
at that reading, and there is no migration path for a value inside `sv` short of writing
one. The label already reads `Criterion a · Category II`, so the asymmetry is invisible to
a reader and lives only in the id.

**Checked**: both tokens survive their own grammars. `sty`'s regex is
`^([A-Za-z][A-Za-z0-9]*)(?:\.(...))?$` (`src/permalink.js:509`) and `tm59aI` is
alphanumeric with no dot; `sv` splits reading ids on `.` (`src/permalink.js:287, 330`)
and `tm59aI` carries none. `URLSearchParams` escapes neither, since both are alphanumeric
throughout.

**Alternatives considered**: renaming both to carry their category and migrating — rejected
as above. Encoding the category as a suffix the codec parses (`tm59a~I`) — rejected: it
would make the reading id a structured value, and `READING_BY_ID` a parse rather than a
lookup.

---

## 4. How a published line finds the right category — the one place this can be silently wrong

**Decision**: The Category I targets move from `metric: 'tm59a'` / `'tm59b'` to
`metric: 'tm59aI'` / `'tm59bI'`, so a target's metric names the one reading that answers
it. `target.category` stays exactly as declared, and a new load-time invariant asserts the
two agree.

**Rationale**: This is forced, not chosen. `src/study.js:810-814` already asserts that
every quantity id is some target's `metric` or an explicitly declared non-target outcome:

```js
for (const quantity of QUANTITIES) {
  if (!targetIds.has(quantity.id) && !nonTargets.has(quantity.id)) throw ...
}
```

A new quantity `tm59aI` therefore has exactly two futures — it is named by a target, or it
is listed among `nonTargets` beside `extremes` and `cost`. The second would be a lie: TM59
publishes a limit for criterion a at Category I and the sheet already draws it on the
board. So the target names it, and `targetsForMetric(reading.id)` (`src/survey.js:2083`,
the function's only caller) then resolves each category's ground to its own category's
line with no change to the matching call at all.

The duplication this introduces — `metric` now implies a category that `category` also
states — is answered the way this repository answers every other two-places-one-fact: an
assertion at load. For every target whose metric names a quantity that declares a category,
`target.category` must be that quantity's category, and for every target whose metric names
a quantity declaring none, `target.category` must be null. A target filed under the wrong
category then cannot mount, rather than drawing a correct-looking line at the right height
citing a criterion the ground does not answer — which is exactly the failure
`src/survey.js:1985-2010` warns about, and it is only dangerous because **both categories
publish the same limit**: 3 % of occupied hours for criterion a, four nights for
criterion b (`src/tm59.js:399-447`).

**Alternatives considered**: keeping `metric: 'tm59a'` on all four targets and giving
`Quantity` a separate `metric` family field, with the survey matching on family and then
narrowing by category. It works and needs one extra field plus a changed call — but it
fails the `targetIds` assertion above unless `tm59aI` is also added to `nonTargets`, which
would state that no standard publishes a line for it. Rejected on that.

---

## 5. How the qualifier learns the new categories without being told twice

**Decision**: `Qualifier.reads` and `Qualifier.says` become functions of the reading, and
the four category-bearing readings share **one** declaration in `QUALIFIER_BY_METRIC`
rather than one each.

**Rationale**: Written as four entries, each restating its own category
(`src/survey.js:2038-2056` is the two-entry version today), the table is one copy-paste away
from a Category I reading declaring `reads: TM59_STUDY_CATEGORY` and matching Category II's
line. Since `Reading` will carry `category` off its quantity, the qualifier can ask the
reading, and the failure mode disappears rather than being guarded. `overheat` becomes
`() => OVERHEAT_ABOVE` and `tm59c` stays `() => null`; the comparison at
`src/survey.js:2108` becomes `qualifier.on(...) === qualifier.reads(reading)`.

A second invariant then closes the loop: a reading whose quantity declares a category must
have a category qualifier, and one that declares none must not. A future criterion added by
category cannot reach the ground without one.

**Alternatives considered**: four literal entries — rejected as above. Deriving the
qualifier entirely from the declaration, with no table (so `above` would move onto the
`overheat` quantity) — rejected as scope: it is a good change and it is not this feature's.

---

## 6. What the roster's own counted assertions cost

**Decision**: Two counted invariants move and must move with their prose.

| Assertion | Today | After | Where |
|---|---|---|---|
| priced pairings | `pairings !== 66 \|\| refusedPairings !== 54` | 78 and 66 | `src/study.js:796` |
| series uniqueness note | "Thirteen series across eleven quantities" | fifteen across thirteen | `src/survey.js:292-294` |

**Rationale**: Six sweepable priced faces × 11 quantities is 66 pairings, of which 12 draw
(three plant faces × three bill readings, plus each tariff face against the one reading it
prices) and 54 are refused. Two more quantities, neither of them priced and neither
declaring `movedBy`, add 12 pairings and 12 refusals: 78 and 66. The assertion exists so a
reach declaration widened by accident fails at load, and updating it is part of the change
rather than a consequence of it — a number edited to make a throw stop is the one way this
assertion could be made worthless.

**Alternatives considered**: deriving the expected counts instead of stating them — rejected;
a derived count asserts nothing, which the comment at `src/study.js:776` already says.

---

## 7. A new invariant worth having: the roster against the method

**Decision**: Assert at load that for every criterion `tm59.js` declares, the roster
carries exactly one reading per declared `Category` where `criterion.byCategory` is true,
and exactly one reading carrying no category where it is false.

**Rationale**: `Criterion` already declares `byCategory` (`src/tm59.js:416, 455`), and it
is the fact this whole feature turns on. Asserted, FR-001, FR-008 and FR-017 stop being
things a reviewer checks and become things the page refuses to mount without: a criterion
added by category with only one reading declared throws naming both declarations, and a
reading declared at a category for a criterion that has none throws too. Without it, the
roster and the method agree only by inspection.

**Alternatives considered**: generating the two category quantities from `CRITERIA ×
CATEGORIES` in a loop. Tempting and rejected: the reader ids are not derivable (`tm59a` is
Category II by history, not by rule), the two criteria need different `RunContents`
(`TM59_AB` against `TM59_B`) and different `context`, and a loop would hide all of that to
save four declarations. Declare them, assert the shape.

---

## 8. What the extra readings cost a run

**Decision**: No new run contents, no new `Output:*`, no new engine run. Two more ESO
passes per landed study or survey sample, to be measured rather than assumed.

**Rationale**: `tm59aI` reuses the frozen `TM59_AB` instance and `tm59bI` reuses `TM59_B`
(`src/study.js:415-421`), so `contentsFor` returns what it returned before and
`shapeKey` is untouched — which is what makes FR-015 and SC-004 true: a sample already run
for one category is byte-identical in cache identity to the same sample for the other, and
`readPoint` (`src/main.js:7931`) reads **every** quantity the sample can answer into the
bag, so both categories land from one run.

The cost that is real: `readPoint` now walks the operative-temperature series twice more
per sample where the run answers TM59. The sheet's own board already reads all five on
every solve at a measured 2.44 ms for a whole Chicago year (`src/main.js:5070`), so the
expected per-sample cost is a fraction of a millisecond against a sample that took an
engine run to produce. Expected, not known — `quickstart.md` takes the measurement, and
Principle VI is the reason it is taken rather than reasoned about.

**Alternatives considered**: reading the two categories in one pass over the series and
splitting the result — rejected as premature; it would fuse two readers that are correct
and separate, for a saving nobody has measured yet.

---

## 9. Whether the general notes change

**Decision**: `NOTES` in `src/tour.js` is unchanged and the storage key
(`shoebox-general-notes-v5`) is **not** bumped.

**Rationale**: Gate 6 of the constitution's workflow applies to a change that alters what a
step teaches. The two candidate steps are `tm59` (`src/tour.js:153`), which teaches that the
board reads one run against every published line and that TM59 asks more of a run than the
rest, and `survey` (`src/tour.js:179`), which teaches that a reader chooses two controls and
a reading. Neither sentence mentions a category, neither becomes untrue, and the `tm59`
marker fills off the count's pair, whose scope this feature explicitly does not move
(FR-013). Two more entries in a chooser the note already describes as "a reading" is not a
change of subject. Bumping the key would re-open six steps for every returning reader to
teach them nothing new, which is the cost that makes the gate a judgement rather than a
reflex.

**Recorded because it was evaluated.** If review disagrees, the change is a `NOTES` edit and
a key bump to `v6`, and nothing else moves.

---

## 10. Whether the design system changes

**Decision**: No change to `.interface-design/system.md`. No new hue, no new component
pattern, no new layout threshold.

**Rationale**: The feature adds rows to choosers that already draw rows, and labels built
from the same `${criterion.label} · ${category.label}` shape the board already letters. The
pen argument that used to justify one category (`src/study.js:180-190` — two exceedance
shares are not a signed pair and must not spend `--warm`/`--cold`) is untouched by this
change and stays true: a reader plots **one** reading at a time, so no second curve is drawn
in a second hue. That argument was never a reason not to offer the choice; it was a reason
not to draw both at once, and it is recorded as such when the constant it justified is
removed.

---

## 11. Open questions

None. Every `NEEDS CLARIFICATION` from the Technical Context is resolved above.

One decision is carried from the spec's Assumptions rather than re-litigated here: readings
are offered per category rather than behind a switch (§2). If that is overturned in review,
§3, §4 and §5 are all rewritten and this plan should be re-run.
