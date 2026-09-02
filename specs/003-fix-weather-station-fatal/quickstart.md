# Phase 1: Validating this change

Five checks, in the order the constitution's quality gates ask for them: outside
the browser first, the engine second, the page last. The first three are the ones
that would have caught this bug.

## Prerequisites

```bash
npm install
npm run predev        # stages the engine, the schema bundle and the station index
```

`public/energyplus/`, `public/schemas/` and `public/weather/` are gitignored, so a
fresh clone has none of them until a script runs. Harnesses go in a scratch
directory and are not committed, per the repo's convention; they must live inside
the repository while they run, or `@idfkit/*` will not resolve.

Outside the browser the schema comes from `localBundle()` in `@idfkit/schemas/node`
and wants the full version string:

```js
import { localBundle } from '@idfkit/schemas/node';
const schema = await localBundle().load('26.1.0');
```

EnergyPlus 26.1.0 is at `/Applications/EnergyPlus-26-1-0`. Where none is
installed, `public/energyplus/energyplus.js` runs the same models under Node.

## 1. The reader, against the cases in the contract

Drive `designConditionsFrom` directly over the fixture DDYs listed in
[contracts/design-conditions.md](./contracts/design-conditions.md), asserting the
day returned by name and the message thrown by text. Fixtures are real archives,
downloaded once into the scratch directory rather than committed:

| Site | WMO | What it proves |
| --- | --- | --- |
| Denver Centennial | 725650 | the clean case, the named 1% and 99% days |
| Boston-Logan Intl AP | 725090 | the clean case, 2 km from the broken one |
| Boston | 994971 | the reported fatal, refused |
| Bardsey Island Lighthouse | 034000 | no `DB=>MWB` family, a clean dewpoint day, must still attach |

Expected: the first two and the fourth return a pair, the third throws naming the
absent annual cooling conditions, and the fourth's cooling day is the dewpoint one
lettered as such.

## 2. The survey, re-run as a regression

The Phase 0 harness is the real regression test, because it is the only thing that
can say the fix has not refused half the index. Sample sites from
`public/weather/stations.json.gz`, one archive per site, fetch, parse, and put
each through the new reader.

Expected, against the 120-site sample recorded in [research.md](./research.md):

- 108 attach, 12 are refused.
- All 12 refused are in the `99xxxx` band and all 12 publish no annual cooling day.
- 0 ordinary WMO sites are refused.
- No site that attaches today is refused after the change, other than those 12.

That last line is the one that matters. Requiring the exact name the code asks
for today would refuse 51 of the 120, so a run that refuses appreciably more than
12 means the candidate list has been narrowed too far.

## 3. Idempotence and byte-identity

`applyModel` runs on every parameter change, so this has to hold across the
change:

- Applying the model three times over a document carrying the new design
  conditions produces byte-identical output.
- A document built with a station attached serialises identically before and
  after this change **for every station that was already clean**. The reader is
  choosing the same objects for those; if any byte moves, the candidate order is
  wrong.

## 4. The engine

Write the IDF for each fixture station at several console positions and run it.

```bash
/Applications/EnergyPlus-26-1-0/energyplus -d out -w station.epw -r model.idf
grep -iE "Severe|Fatal" out/eplusout.err
```

Expected: no severe, no fatal, on every station the reader accepts. The reported
failure to watch for is the one this closes:

```text
** Severe ** ...[wetbulb_or_dewpoint_at_maximum_dry_bulb]
             - Value type "string" for input "N" not permitted by 'type' constraint.
**  Fatal ** Errors occurred on processing input file.
```

A design day is about 0.6 s under Node, about 50 ms in the warm browser engine.
The staged engine latches onto whatever `global.Module` held when it was first
evaluated and EnergyPlus's `main` is not re-entrant, so clear the require cache
between runs.

## 5. Drive the page

```bash
npm run dev
```

- Type `Boston`. The first row is the broken station; take its most recent
  window. Expect a refusal naming it, the sheet still carrying Denver's numbers
  undimmed, and the picker reopening on nearby sites with Boston-Logan among
  them. Take Boston-Logan and expect a normal attach and solve.
- Take a station with no `DB=>MWB` family, Bardsey Island Lighthouse, and read
  the plate: the cooling datum must letter the dewpoint day it actually got, not
  `1% clg db`.
- Paste a link carrying `stn=994971`. Expect the whole link refused back to
  defaults with the reason standing, and auto-solve stopped so nothing overwrites
  it.
- Refuse a station while a study is sweeping. Expect the curves untouched: a
  refusal is not an event in the model.
- Read the refusal at 390 px wide and at 600 px tall. Nothing may be hover-only
  and nothing may scroll sideways.

## Definition of done

Beyond the five checks:

- `NOTES` in `src/tour.js` read against the new refusal. No copy change is
  expected, since what the station step teaches is unchanged; if any is needed,
  the storage key is bumped with it.
- `.interface-design/system.md` carries the new component pattern, a refusal that
  carries its next step, beside `Absence is not zero`.
- The comment above `renderTrace` in `src/main.js` no longer says the datum lines
  come from "that station's own 99% heating and 1% cooling drybulb", which stops
  being true the moment a dewpoint day can be chosen.
