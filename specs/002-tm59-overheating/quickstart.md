# Quickstart: validating the TM59 feature

**Feature**: `002-tm59-overheating`

There is no test runner and no linter in this repository. Verification is
throwaway Node harnesses under `.harness/`, then driving the page. This guide is
the list of things that have to be true and the cheapest way to find out;
implementation belongs in `tasks.md`.

## Prerequisites

```bash
npm install
npm run predev          # stages the engine, schemas and station index
```

Two facts about running `src/` modules under Node, both of which cost time to
rediscover:

- The harness must live **inside the repository** (`.harness/`), or
  `@idfkit/*` will not resolve.
- Outside the browser the schema comes from `localBundle()` in
  `@idfkit/schemas/node`, not from `httpSource('/schemas/')`, and it wants the
  full version string:

```js
import { localBundle } from '@idfkit/schemas/node';
import { writeIdf } from '@idfkit/core';
const schema = await localBundle().load('26.1.0');
```

`doc.toIDF()` does not exist; serialise with `writeIdf(doc)`.

EnergyPlus 26.1.0 is installed at `/Applications/EnergyPlus-26-1-0`. Where it is
not, `public/energyplus/energyplus.js` runs the same models under Node: set
`global.Module` to `{ noInitialRun: true, locateFile }` before requiring it,
then `callMain(['-d', '/output', '-w', '/weather.epw', '/input.idf'])`. It
latches onto whatever `global.Module` held at first evaluation and EnergyPlus's
`main` is not re-entrant, so clear the require cache between runs.

Add `.harness/` to `.gitignore` in the first task, or it dirties `git status`.

## 1. The declarations throw before anything runs

Import `src/tm59.js` and `src/controls.js` under Node. They must load. Then
break each invariant on a copy and confirm it throws with a sentence naming the
thing that is wrong:

- A `Category` whose `k` does not reproduce the published clamps.
- A `SEASON` whose `days` disagrees with its own from/to.
- Fewer or more than two criteria carrying `stage1`.
- A criterion with `judgeable: false` and no `unreadable` sentence.
- Fewer than four `standing` qualifications.
- A `Pattern` declared with other than 24 hours, or a fraction outside `[0, 1]`.

**Expected**: six throws, six distinct messages. This is Workflow gate 5, and
these are the invariants that would otherwise fail silently at run time.

## 2. The comfort line reproduces the published clamps

Pure arithmetic, no engine.

```
comfortLine(trm =  5).tmax  ->  { I: 24.1, II: 25.1 }   (clamped low)
comfortLine(trm = 10).tmax  ->  { I: 24.1, II: 25.1 }
comfortLine(trm = 20).tmax  ->  { I: 27.4, II: 28.4 }
comfortLine(trm = 30).tmax  ->  { I: 30.7, II: 31.7 }
comfortLine(trm = 35).tmax  ->  { I: 30.7, II: 31.7 }   (clamped high)
```

**Expected**: all five exact to within 1e-9. The four clamp values are printed
in TM59:2026 §2.4.1, and TM52:2013 equations 6 and 8 give the same offsets
independently, so this is a transcription check against two sources.

And the rounding, which decides the criterion at the values it is most often
decided on (TM59:2026 §2.4.1, whose closed interval settles what TM52's
ambiguous one does not):

```
roundDT(0.49) -> 0    roundDT(0.5) -> 1    roundDT(1.49) -> 1
roundDT(1.5)  -> 2    roundDT(2.49) -> 2   roundDT(2.5)  -> 3
```

1.5 rounds **up**. `Math.round` is half-up for positive numbers and is correct;
a round-half-to-even helper would give 2 for 2.5 and 2 for 1.5, and would be
wrong on the second.

## 3. The running mean is seeded where TM59 says

Attach a station, take its EPW text, and:

- `dailyMeans(epw)` returns 365 values, and the mean of hours 1 to 24 of
  1 January equals `dailyMeans(epw)[0]` to within rounding.
- `runningMean(...).seedDays` is exactly the daily means for 23 to 29 April.
- `runningMean(...).seed` equals Equation 2.3 over those seven, computed by hand
  in the harness, **weights divided by 3.8**. Assert the denominator explicitly:
  a dropped 3.8 gives a number that is still plausible in shape and wrong by
  nearly four times, which is the sort of error a plot does not show.
- **`Tod` is always the previous day's mean, never the current day's**
  (TM52 Box 2: "today's daily mean temperature is not used because it remains
  unknown until the end of the day"). Assert that `Trm(1 May)` consumes
  `dailyMeans` for **30 April**. An off-by-one here shifts the whole comfort
  line by a day for the whole season and is invisible in the shape of the curve.
- `byDay` covers 30 April to 30 September inclusive and no more.
- **The split-calendar property** (FR-013): build the same desk with the run
  calendar set to the whole year, and again set to June through August. The Trm
  values for every day in June, July and August are **identical** between the
  two. This is the property the whole EPW-seeding decision exists to buy, and it
  is the one assertion that would catch a regression to seeding from the run.
- A weather file truncated before 23 April makes `runningMean` throw, and the
  criteria come back absent with that reason rather than seeded from a guess.

## 4. The output variables exist, at this version

Already measured once and worth re-measuring after any change to
`syncReporting`. Build the default desk, write the IDF, run it:

```bash
/Applications/EnergyPlus-26-1-0/energyplus -d out -r probe.idf
```

**Expected in `out/eplusout.eso`'s dictionary**, hourly:

```
Site Outdoor Air Drybulb Temperature [C]
Zone Operative Temperature [C]
Occupancy:Schedule Value []
```

Then `grep 'requested but not generated' out/eplusout.err` must find nothing,
and `out/eplusout.rdd` must list every variable requested. Confirm names against
the `.rdd` rather than from memory: they drift between versions.

## 5. The model is idempotent and shrinks cleanly

Workflow gate 2, and the `Pattern` kind makes it sharper than usual because
`applyGains` now writes a variable number of schedule objects.

- `applyModel` three times over, at `roomType: 'As drawn'` and at each of the 13
  named room types: byte-identical output every time.
- A desk taken from a named room type back to `'As drawn'` serialises
  **byte-identically** to one built at `'As drawn'`. This proves
  `EquipmentUse` and `LightingUse` leave the document rather than orphaning.
- At `roomType: 'As drawn'`, the IDF is byte-identical to `HEAD`'s. Nothing
  about the default desk moves.

## 6. Old links resolve unchanged

FR-027 and SC-011. Capture a handful of permalinks from the page at `HEAD`,
including one carrying a station and one carrying a pinned hour. Then, on the
feature branch:

- `decodeState` accepts each one.
- The IDF each produces is byte-identical to the one `HEAD` produced.
- `LINK_VERSION` is unchanged and `MIGRATIONS` is still empty.

And the new keys round-trip: every declared pattern, every room type, encoded
and decoded exactly; and every malformed pattern refused whole, naming what was
wrong (23 fields, 25 fields, a fraction of 1.2, a fraction of `abc`, an empty
string).

## 7. The criteria read, and the denominator is the published one

The strongest available check, because CIBSE publishes the numbers.

Apply the TM59 preset at `roomType: 'Double bedroom'`, attach a station, run the
whole year, and assert on the returned readings:

- Occupied hours counted over 1 May to 30 September = **3672** (CL:2026 §2).
- At `roomType: '2-bedroom dwelling: living room'`, the same figure = **1989**.
- 3 % of 1989 is 59.67 and 3 % of 3672 is 110.16, published as 59 and 110 hours.
  Assert that a reading of exactly 59 hours over 1989 clears and 60 does not,
  against the share the sheet letters.
- Criterion b counts at most 153 nights, and exactly 153 when the run covers
  1 May to 1 October. Where the run stops on 30 September, it counts 152 and
  `Coverage.tail` is false.

**The occupied-hour floor is the trap here** (research.md Decision 5a). Assert it
directly, because the wrong answer agrees with a published figure:

- On the **stock** desk (office band, weekends unoccupied), occupied hours over
  the period are **1100**, being 110 weekdays at a 10 hour band.
- Testing `scheduleValue > 0` instead gives **3672**, every hour of all 153
  days, which is exactly CL:2026's bedroom figure. If the harness sees 3672 on a
  desk that is not a bedroom, the floor is not being applied.

Then the partial period (research.md Decision 11). Run June to August only:

- Criterion a is **lettered**, not absent, over the available occupied hours,
  with `Coverage` reporting 92 of 153 days. TM52 criterion 1 permits this
  outright.
- The row states both facts: that TM52 permits a partial period and that TM59's
  own table is written for the full one. Neither is resolved for the reader.
- Criterion b's denominator is nights covered, not 153.
- A run reaching **no** part of May to September makes every criterion absent
  with its reason. That is the only absence coverage can cause.

## 8. The criteria respond to design, and to climate

SC-002 and SC-003, and they are what make the feature worth having.

- Sweep the glazing ratio on the sunlit wall. Criterion a's share **rises**.
- Compare the same building on two stations. The comfort line's mean **differs**,
  because it is derived from each climate's own outdoor temperatures. Assert the
  lines are not equal; this is the one check that proves the line is not fixed.
- Move the slab from concrete to lightweight. Criterion b's night count moves,
  and criterion a's share moves less. (Watch the pinned hour here: `worstHour`
  is an argmax with candidates half a year apart and it inverts on exactly this
  change on Boston TMYx. The TM59 readings are over a period, not an instant, so
  they must **not** move with the pin. Assert that turning the pin changes no
  TM59 figure.)

## 9. Nothing reads as a certificate

SC-004, SC-005 and SC-006, and they are checked by exhausting the failure
combinations rather than by inspection.

For each of: no run; a run of two design days; a January-only calendar; Gains
bypassed; a weather file that stops in August; System engaged with cooling:

- Every criterion is **either** lettered with a reading and a verdict, **or**
  absent with a reason and a fix.
- No criterion is lettered as zero, blank, or a pass.
- `grep` the rendered scoreboard for a pass or fail word adjacent to "TM59".
  There must be none.
- The count row, where present, names both its numbers and its scope.

Then read the qualifications block alone and write down four specific reasons
this is not a TM59 assessment. If four cannot be found, the block is short of
what SC-005 promises.

## 10. Latency, against the numbers the plan already measured

SC-010 and FR-030. The plan's performance budget holds native Node figures taken
at plan time. This step re-takes them in the browser, against the WebAssembly
engine, which is the build SC-010 is actually written against.

**The targets to beat**, from the plan:

| | Measured natively | Expect in the browser |
|---|---|---|
| Annual A/B, extra output request | −10 ms, inside noise | No detectable delta |
| ESO growth | +3.1 % | The same, it is the same file |
| All five readings, per solve | 1.71 ms | Same order; JIT differs |
| `dailyMeans(epw)`, per station attach | 13.2 ms | Same order |

Interleave A/B in one session, the way the per-surface measurement that took an
annual run from 681 ms to 2,984 ms was taken. Five pairs minimum: the native
runs varied 455 to 601 ms, so a single pair cannot see a 10 ms effect.

- **Design day solve**: unchanged, around 50 ms. 48 points against 8,760 is 180
  times less work, and the criteria are absent on a design-day run in any case.
- **Annual solve**: the one extra `Schedule Value` series against fifteen.
- **A plate drag** re-letters the TM59 rows per frame without stutter. If it
  does not, the `dailyMeans` cache is not being hit, and that is the 13.2 ms
  showing up 60 times a second.

Record what it actually was, and correct the plan's table if the browser
disagrees. A number in this repository is measured or it is not printed.

## 11. Then drive the page

At 1440 px and at 390 px, and at 800 px tall so the index layout is exercised.

- Every criterion, limit, qualification and unjudged clause is readable at
  390 px without hovering or scrolling sideways (SC-009).
- The scoreboard's TM59 rows fold at 620 px with every figure keeping the head
  it was under.
- The register's TM59 accordion opens, applies, and moves only the controls it
  names (SC-007); moving one of them drops the conformance chip with no further
  gesture (SC-008).
- Start a study on the glazing ratio with criterion a as the metric. A curve is
  produced on the same terms as every other study, and a sample whose run cannot
  answer is absent from it rather than plotted at zero.
- Walk the general notes. Every step's subject still exists and the redline
  circles it.

## Before this is implemented

`research.md` has no open items. Every figure is quoted from a primary source.
One thing is owed first: **correct `spec.md`** from the table at the end of
`research.md`, since FR-002, FR-003 and FR-004 as written describe the 2017
method.

**Do not commit the TM52 PDF.** The supplied copy is watermarked to a named
individual. Quote the equations and clauses in comments and in the interface, as
the register already quotes Passivhaus and LETI; the document itself stays out
of the repository.
