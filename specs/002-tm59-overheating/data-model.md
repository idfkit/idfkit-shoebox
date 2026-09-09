# Phase 1 data model: CIBSE TM59

**Feature**: `002-tm59-overheating` | **Date**: 2026-09-01

Every entity below is a frozen class with a constructor, by the constitution's
tenth workflow rule and the house preference for typed declarations over loose
dictionaries. Entities are grouped by the module that owns them, because which
module owns a declaration is itself a decision this page cares about: `tm59.js`
and `epw.js` are DOM-free and network-free so the Node harness can drive the
real ones.

## New module: `src/tm59.js`

DOM-free, network-free, engine-free. It is handed an ESO, a weather file's daily
means and a floor area, and it returns readings. It imports `hourly` and
`environmentRuns` from `readings.js` and nothing else from the app.

### `Category`

The dwelling's thermal expectation. Two frozen instances, no desk state.

| Field | Type | Notes |
|---|---|---|
| `id` | `'I' \| 'II'` | |
| `label` | string | `Category I` |
| `noun` | string | `a thermally sensitive dwelling` for a sentence |
| `k` | number | 2 or 3, the offset in `Tmax = 0.33·Trm + 18.8 + K` |
| `nightLimit` | number | Tn: 26 or 27 °C |
| `presumes` | string | Who the category is for, in TM59's own words |

`CATEGORIES` is the frozen pair. There is no control selecting one, by FR-003a's
rule: both are read on every run and each says what it presumes.

**Validation at module load**: `0.33·10 + 18.8 + k` must equal the published
lower clamp (24.1, 25.1) and `0.33·30 + 18.8 + k` the upper (30.7, 31.7), to
within 1e-9. This is the derivation in `research.md` Decision 2 turned into an
invariant that throws, so a mistyped `k` cannot ship.

### `Season`

The one assessment period. A single frozen instance, not a class with many.

| Field | Type | Value |
|---|---|---|
| `from` | `{month, day}` | 1 May |
| `to` | `{month, day}` | 30 September |
| `days` | number | 153 |
| `tail` | `{month, day}` | 1 October, the morning criterion b's last night ends on |
| `seedFrom` | `{month, day}` | 23 April |
| `seedTo` | `{month, day}` | 29 April |

**Validation at module load**: `days` must equal the day count between `from` and
`to` in a non-leap year, and `153 × 13` must equal 1989 and `153 × 24` equal
3672, the two figures CL:2026 publishes. A period that has drifted from its own
day count fails at load rather than producing a plausible share.

### `RunningMean`

The daily outdoor running mean, and the only quantity on this sheet legitimately
read from outside the run.

| Field | Type | Notes |
|---|---|---|
| `byDay` | `Map<dayOfYear, number>` | Trm for every day from 30 April to 30 September |
| `seed` | number | Trm at 30 April, from Equation 2.3 |
| `seedDays` | `number[]` | The seven daily means, 23 to 29 April, so the sheet can letter the lead-in it used (FR-008) |
| `source` | string | What the weather file declares itself to be |

Built by `runningMean(dailyMeans)`. It runs the full recursion 30 April to
30 September regardless of which days the engine simulated, which is what makes
a split calendar judged on a full year's line (FR-013).

**Throws** where the weather file does not carry all of 23 April to
30 September. There is no partial seeding and no assumed start value; the
criteria are then absent with that reason.

### `ComfortLine`

One day's adaptive threshold, per category. A result, never a setting.

| Field | Type | Notes |
|---|---|---|
| `day` | number | Day of year |
| `trm` | number | That day's running mean |
| `tmax` | `{I: number, II: number}` | Clamped at the published endpoints |
| `clamped` | `'low' \| 'high' \| null` | Which clamp is in force, so the face can say the line has stopped moving |

### `Criterion`

A published question, its limit, and the clause it is quoted from. Four frozen
instances in `CRITERIA`.

| Field | Type | Notes |
|---|---|---|
| `id` | `'a' \| 'b' \| 'c' \| 'd'` | TM59's own letters |
| `label` | string | `Criterion a` |
| `applies` | string | Which spaces and which ventilation route, in TM59's words |
| `asks` | string | The criterion verbatim |
| `clause` | string | `TM59:2026 §2.4.1` |
| `limit` | number | 3 (%), 4 (nights), 3 (%), 3 (%) |
| `unit` | string | `% of occupied hours` or `nights` |
| `byCategory` | boolean | True for a and b; c and d are the same for both |
| `stage1` | boolean | True for a and b: the pair the count is taken over |
| `judgeable` | boolean | False for d, which has no communal zone to read |
| `unreadable` | string \| null | Why d cannot be read, for the unjudged list |

**Validation at module load**: exactly two criteria carry `stage1`, and a
criterion with `judgeable: false` must carry an `unreadable` sentence. The
second is the same rule `Side` already enforces: a predicate with no reason
throws, because one row-wide note cannot say which line is inert.

### `Reading`

What one criterion returned over one run, or why it did not.

| Field | Type | Notes |
|---|---|---|
| `criterion` | `Criterion` | |
| `category` | `Category` \| null | Null where the criterion does not split |
| `value` | number \| null | The share, or the night count |
| `counted` | number | Hours (or nights) that exceeded |
| `over` | number | The denominator: occupied hours in the period, or nights covered |
| `coverage` | `Coverage` | How much of the season the run actually reached |
| `absence` | string \| null | Why there is no value, and what would fix it |
| `line` | `{low, high, mean}` \| null | The comfort line the run was judged against (FR-006), for a only |

`value == null` and `absence != null` are the same state and never disagree: a
`Reading` with neither, or both, throws in the constructor. This is the em dash
rule made structural rather than remembered.

### `Coverage`

How much of the assessment period a run reached. Read off the run's own
timestamps, never off `params`.

| Field | Type | Notes |
|---|---|---|
| `days` | number | Days of 1 May to 30 September present in the run |
| `of` | number | 153 |
| `months` | string | `Jun–Aug`, for the head |
| `whole` | boolean | `days === 153` |
| `tail` | boolean | Whether 1 October is present, which criterion b's last night needs |

### `Verdict`

A count, never a conclusion. One instance, over criteria a and b at Category II
(`research.md` Decision 6).

| Field | Type | Notes |
|---|---|---|
| `cleared` | number | Of the read criteria, how many met their limit |
| `read` | number | How many could be read at all |
| `unread` | `Reading[]` | Named separately, folded into neither number (FR-017a) |
| `scope` | string | `criteria a and b, the Stage 1 pair, for a Category II dwelling` |

It carries no boolean and no word. `Verdict` is a poor name for something that
refuses to give one; it is called `Count` in the interface for that reason.

### `Qualification`

One reason a reading is not a TM59 assessment. This is the deliverable Story 2
is about, and it is a list of instances rather than a paragraph so that each can
be checked against the desk in front of the reader.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `says` | string | The gap, in one sentence |
| `because` | string | What it is measured or read from |
| `standing` | boolean | True where it is always true of this desk (one zone, no communal area); false where it depends on the run and is tested per solve (the weather, the profiles, a cooling system in the path) |

**Validation at module load**: `SC-005` requires a reader to be able to state at
least four specific reasons from what is printed. So the module asserts that at
least four `standing` qualifications are declared. The count is an invariant,
not a hope.

## Extensions to existing declarations

### `src/controls.js`: the `Pattern` control kind

A 24-value hourly fraction band. New kind, and the constitution's scalar rule
(Principle II) makes its shape non-negotiable: it carries canonical text and
parses at the boundaries, exactly as `Days` does.

```
class Pattern extends Control {
  kind = 'pattern'
  hours: readonly number[24]   // the default, as a declaration
  digits: number               // how many decimals the canonical text carries
}
```

- `value` is the canonical string, `0.7,0.7,…,0.7`, one scalar on `params`.
- `parsePattern(text)` and `serializePattern(hours)` live in `controls.js`
  beside `parseHolidays` and `serializeHolidays`, for the reason `Ruled.parse`
  does: the rules for what a control can hold belong with the declaration, and
  the link codec reads them rather than restating them.
- `refuses()` learns the kind: 24 fields, each a number in `[0, 1]`, no more and
  no fewer. Anything else is refused whole, never half-read.

**Three gates this kind has to pass**, all named in `CLAUDE.md` and all of them
failing in different directions:

1. `console.js`'s `buildControl` throws for a kind it cannot draw. Loud, at
   mount.
2. `permalink.js`'s `readValue` runs a numeric regex **before** the per-kind
   switch, so a pattern branch added inside the switch is unreachable and every
   link carrying the key is refused as "not a number". It is taught above the
   regex, beside `selector`.
3. It owns exactly one key, so `Channel.keys()`, `INDEX` and the
   `DEFAULT_PARAMETERS` loop need no change. This is why a `Pattern` per gain is
   preferred to one multi-key `Gains` control: the multi-key kinds carry three
   more places to be taught and `labelFor`, `phraseFor` and `formatValue` all
   switch on what the sub-object is called.

### `src/controls.js`: three patterns and a room type on the Gains channel

| Key | Kind | Default | Note |
|---|---|---|---|
| `roomType` | `Selector` | `'As drawn'` | The 13 TM59 spaces plus the desk's own default |
| `occPattern` | `Pattern` | 24 × 1.0 | Gated on `roomType !== 'As drawn'` |
| `equipPattern` | `Pattern` | 24 × 1.0 | Same |
| `lightPattern` | `Pattern` | 24 × 1.0 | Same |
| `peopleCount` | `Scale` | derived | Absolute occupants, used only when a room type is named |
| `equipPeak` | `Scale` | derived | Absolute watts, same |

**`roomType` defaulting to `'As drawn'` is what keeps every link minted before
this feature resolving unchanged** (FR-027). At that value `applyGains` writes
exactly what it writes today: one shared band schedule, `Area/Person` people and
`Watts/Area` equipment. The new keys are omitted from such a link and take their
defaults under delta encoding, so `LINK_VERSION` does not move and `MIGRATIONS`
stays empty.

### `src/tm59.data.js`: the profile library

Generated from TM59:2026 Tables E.1 and E.2, in the shape
`scripts/build-rates.mjs` already establishes for `src/rates.data.js`. One
frozen `RoomProfile` per space:

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `label` | string | TM59's own name for the space |
| `people` | number | Peak occupants |
| `sensible` | number | 75 W per person |
| `latent` | number | 55 W per person |
| `occupied` | `number[24]` | Fractions, from E.1's absolute values |
| `equipPeak` | number | Watts |
| `equipment` | `number[24]` | Fractions, from E.1's absolute values |
| `lighting` | number | 2 W/m², all spaces |
| `lightHours` | `[18, 23]` | Its own band, not the occupied one |
| `occupiedHours` | number | 1989 or 3672, for the harness to assert |
| `why` | string | The E.1 sentence the fractions were divided out of |

The three findings in `research.md` Decision 5 each become a `why` line rather
than a silent resolution: the E.1/E.2 rounding gap, the three-bedroom
living/kitchen 75 % that two other statements contradict, and the two-bedroom
kitchen's mislabelled person count.

### `src/schemes.js`: the TM59 preset

A `Preset` of `kind: 'standard'`, issuer CIBSE, source `TM59 (2026)`. It is the
same machinery the register already carries, with three extensions.

- **`specs`** write `roomType`, the three patterns, `peopleCount`, `equipPeak`,
  `lighting`, `weekend: 'Occupied'` (TM59 §3.7.1: "The same profiles should be
  applied throughout the year for both weekends and weekdays") and
  `infiltration: 0` (CL:2026 §2, new builds). Each carries its `why`.
- **`targets`** are five: a·I, a·II, b·I, b·II and c. `Target` grows a
  `needs: 'season'` value and a `category` field.
- **`unjudged`** carries criterion d, Category I's applicability, the four
  weather mismatches, the per-room assessment, the three-stage strategy, ceiling
  fans, the noise and security constraints, and the communal pipework gains.

**`UNTOUCHABLE` is not relaxed.** The preset writes Gains and Air only. It
cannot write Massing, which is what forces `peopleCount` and `equipPeak` to be
absolute rather than area-derived: a preset that had to divide 450 W by the
desk's floor area would be reading a channel it is forbidden to write, and its
value would silently change meaning when the reader moved a wall.

### `src/model.js`: what changes

- `applyGains` writes three `Schedule:Compact` objects (`Occupancy`,
  `EquipmentUse`, `LightingUse`) instead of one when a room type is named, and
  switches `People` to `People` (absolute) and `ElectricEquipment` to
  `EquipmentLevel`. At `roomType: 'As drawn'` it writes byte-identically to
  today.
- `syncReporting` requests `Schedule Value` for `Occupancy` on the `'sheet'`
  profile, and gains a fourth profile, `'tm59'`, for study samples: the zone
  mean air temperature `zoneRuns` needs, plus `Zone Operative Temperature` and
  that one schedule series. Three series against the sheet's fifteen.

### `src/epw.js`: `dailyMeans`

Returns 365 daily mean dry-bulb temperatures off the EPW's data records, or
throws naming the first day it could not read. It belongs here rather than in
`tm59.js` for the reason the header parser does: this is EPW parsing, its only
honest test is a real file, and `weather.js` cannot be imported from Node.

## What is deliberately not an entity

- **A room type on the desk as TM59 state.** `roomType` is a gains profile
  selector and nothing reads it to decide which criterion applies. FR-003a
  stands: every criterion is asked of every run that can answer it and says what
  it presumes.
- **A ventilation route.** Which of criterion a or c governs turns on how much
  of the occupied period openings are shut, which this desk cannot measure until
  the pressure network lands. Both are read, both are lettered, and which kind
  of building each is for is stated (FR-004).
- **An applied-standard flag.** `conformance()` measures the desk against the
  preset's clauses on every `applyGeometry`, as it does for every other preset.
  Nothing remembers (FR-022).
- **A pinned category.** Both are read.
