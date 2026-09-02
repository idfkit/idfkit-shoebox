# Contract: `src/tm59.js`

The reading module. DOM-free, network-free and engine-free, by the same rule
`readings.js` and `describe.js` follow: the Node harness calls the real
functions, not a copy of them.

Imports `hourly` and `environmentRuns` from `readings.js`, `CATEGORIES` and the
frozen declarations from within itself. No new runtime dependency (Principle V).

**Two further imports were taken during implementation and are ratified here**,
both under the same argument and both narrower than they look. `AS_DRAWN`,
`DAYS_IN_MONTH` and `MONTHS` come from `controls.js`, and `OCCUPANCY_SCHEDULE`
comes from `model.js`. In each case the alternative was not "no import" but "a
copy", and a copy is the second source of truth Principle III forbids. The
schedule name is the sharp one: the denominator is matched out of the ESO by the
*key* the request carried, which is the name `applyGains` gave the schedule, so
renaming it in `model.js` would carry the request's key along and leave this
reader finding nothing. Every criterion would then go absent saying "patch Gains
in" over a desk whose Gains channel is in, which is a visible failure with a
misleading reason and worse than a loud one. Nothing in `model.js` or
`controls.js` imports this module back, so the dependency stays one way.

## Declarations

```js
export const CATEGORIES        // frozen [Category I, Category II]
export const SEASON            // frozen Season, 1 May to 30 Sep
export const CRITERIA          // frozen [a, b, c, d]
export const QUALIFICATIONS    // frozen Qualification[]
export const COUNT_SCOPE       // the string the count's row letters
```

All four throw at module load if their invariants fail. The invariants are in
`data-model.md`; the ones that matter most are the two clamp checks on
`Category.k` and the `153 × 13 = 1989`, `153 × 24 = 3672` checks on `SEASON`.

## The running mean

```js
/**
 * Daily outdoor running mean, 30 April to 30 September.
 * @param {number[]} dailyMeans  365 daily mean dry-bulb temperatures, from epw.js
 * @returns {RunningMean}
 * @throws  where 23 April to 30 September is not covered
 */
export function runningMean(dailyMeans, source = null)
```

Seeds at 30 April by TM52 Equation 2.3 over 23 to 29 April, then recurses by
Equation 2.2 to 30 September. **The recursion is unconditional on what was
simulated** (FR-013): it runs every day of the period whether the engine saw it
or not, which is what makes a June-to-August run judged against the line a full
year would have produced.

```js
/**
 * One day's adaptive threshold, both categories, clamped.
 * @returns {ComfortLine}
 */
export function comfortLine(trm, dayOfYear)
```

Clamped at Trm = 10 and Trm = 30 to the published endpoints. `clamped` reports
which clamp is in force so a face can say the line has stopped moving.

## The readers

Each takes the ESO the run returned, and returns a `Reading` whose `value` and
`absence` are never both set and never both null.

```js
/**
 * Criterion a: occupied hours with rounded dT >= 1 K, as a share.
 * @param {Eso} eso
 * @param {RunningMean} trm
 * @param {Category} category
 * @returns {Reading}
 */
export function readCriterionA(eso, trm, category, floor)

/**
 * Criterion b: nights whose 23:00-08:00 mean operative temperature exceeds Tn.
 * @returns {Reading}   value is a count of nights, not a share
 */
export function readCriterionB(eso, category)

/**
 * Criterion c: occupied hours above 26 C, as a share.
 * @returns {Reading}
 */
export function readCriterionC(eso, floor)

/**
 * How much of 1 May to 30 September this run reached, off its own timestamps.
 * @returns {Coverage}
 */
export function seasonCoverage(eso)

/**
 * The count of cleared Stage 1 criteria. Never a verdict.
 * @param {Reading[]} readings
 * @returns {Count}   { cleared, read, unread, scope }
 */
export function clearedCount(readings)

/**
 * Which qualifications are true of this run, for the block under the readings.
 * @returns {Qualification[]}  the standing ones plus whichever run-dependent
 *                             ones apply: the weather, the profiles, cooling
 *                             in the path, the unshifted BST
 */
export function qualificationsFor(eso, params, bypass, weather)
```

There is no `readCriterionD`. Criterion d is declared, is never read, and its
`unreadable` sentence goes on the unjudged list. A reader that always returned
an absence would be a reading pretending to be one.

**The `floor` argument is required by rule 2 below, not an addition to it.** It
is what separates an occupied hour from an out-of-hours one, it differs between
the band schedule (0.1) and a TM59 pattern (0), and it is passed in rather than
assumed for the reason rule 2 gives: the wrong one counts 3,672 hours where the
answer is 1,100. `runningMean`'s `source` is the weather file's identity, carried
so a reading can letter which file its comfort line came from.

## Rules every reader keeps

1. **Operative temperature, never air temperature** (FR-007). The series is
   `Zone Operative Temperature`. Where it is not in the ESO, the reading is
   absent with that reason rather than falling back to `Zone Mean Air
   Temperature`, which is a different question by several degrees on a desk with
   heavy solar gain and a cold slab.
2. **The denominator is the run's own occupancy schedule series** (FR-009), not
   `params` and not the schedule re-evaluated in JavaScript. Where the series is
   absent, or sums to zero, the reading is absent with that reason and is not
   divided (FR-012). **An hour is occupied where the series stands above the
   floor the applier wrote**, which is 0.1 for `bandSchedule` and 0 for a TM59
   pattern, and the floor is passed in rather than assumed. Testing `> 0`
   instead counts every hour of all 153 days: 3672, which happens to equal the
   figure CL:2026 publishes for a bedroom, so the bug agrees with a published
   number for the wrong reason. Measured, research.md Decision 5a.
3. **Design-day environments are excluded**, by the rule `readOverheat` and
   `computeBill` already follow. A summer design day is inside 1 May to
   30 September by date and is deliberately more extreme than any day in the
   year; counting it would make `sizingPeriods: 'Yes'` worsen a criterion
   without changing the building.
4. **∆T is rounded before it is tested** (TM59:2026 §2.4.1). An hour 1.4 K over
   and an hour 1.6 K over do not weigh the same, and an implementation that
   skips the rounding produces plausible numbers that are not the method's.
   Half-up, so 1.5 becomes 2: TM59 closes the band at 1.49 where TM52 left 1.5
   in both. `Math.round`, never round-half-to-even.
5. **A partial assessment period is a reading for criterion a, not an absence.**
   TM52 criterion 1 permits it outright and TM59:2026 neither restates nor
   contradicts it while publishing hour limits written for the full period. The
   share is taken over available occupied hours, `Coverage` is returned beside
   it with equal prominence, and both documents' positions are stated. Only a
   run reaching no part of 1 May to 30 September is absent. Criteria b and c get
   no such provision and take their denominators from what the run covered.
6. **Coverage is read off timestamps**, never off `params`, because a study
   sample and a stale solve both make the two disagree and the document is what
   was simulated (Principle III).
7. **A partial night is not a night.** Criterion b's last night ends at 08:00 on
   1 October. A night whose nine hours are not all in the run is not counted in
   either the numerator or the denominator, and `Coverage.tail` reports whether
   the last one was complete.
8. **Absence names its fix** (FR-011). "Run some of May to September, this is a
   summer number" and "patch Gains in, with nobody home there are no occupied
   hours to be a share of" are sentences, not blanks.

## Cost

Measured on a Chicago TMY3 year, 8,760 points, median of 200 iterations. The
full working is in the plan's performance budget.

| | Cost | When |
|---|---|---|
| `dailyMeans(epw)` | 13.2 ms | Once per weather file |
| `runningMean` | 0.08 ms | Once per weather file |
| `readCriterionA` | 0.10 ms | Per solve, per category |
| `readCriterionB` | 0.73 ms | Per solve, per category |
| `readCriterionC` | 0.05 ms | Per solve |
| **All five readings** | **1.71 ms** | Per solve |

**`dailyMeans` is the expensive one and it is why the cache exists.** At 13.2 ms
it is eight times every criterion put together, and it is 8,760 lines of CSV
parsed to 365 numbers that cannot have changed unless the station did. It is
cached on the attached weather file's identity, the way `offersFor` and
`calendarFor` are cached on the ESO's, and cleared where the studies and the
sample cache are cleared: on a station change.

**1.71 ms is inside a 16.7 ms frame**, which satisfies FR-031 with the readings
taken once at the solve and a gesture frame paying nothing. The measurement is
still worth having: it says the design could afford to re-read per frame if it
had to, so the cache is an optimisation rather than a load-bearing constraint.

**`readCriterionB` is seven times `readCriterionA`** because it rebuilds an hour
index to reach across midnight into the following day. Sharing one index across
the readers would take it under 0.1 ms. Left alone deliberately: 1.71 ms is
already inside budget, and an optimisation nobody needs is a second thing to
keep correct.

The design-day path is 48 points against 8,760 and costs nothing measurable. It
is also absent by rule 3, so FR-030's design-day budget is not under pressure.
