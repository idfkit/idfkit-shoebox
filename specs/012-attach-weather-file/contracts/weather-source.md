# Contract: the weather source and the EPW readers

What `src/source.js`, the additions to `src/epw.js`, and the split in `src/model.js`
guarantee to everything that consumes them. These are the page's internal interfaces;
the page exposes no network API and this feature adds none.

Everything here is DOM-free and network-free, so the Node harnesses in
[quickstart.md](../quickstart.md) call the real code rather than a copy of it.

---

## `src/source.js`

### `sourceFromFile({ name, bytes, ddyText })` → `Promise<WeatherSource>`

**Guarantees**

1. Resolves only for a file the desk can solve. The gate is `readLocation` followed by
   `dailyMeans`, and a DDY's `designConditionsFrom` where one was passed.
2. Rejects with **the parser's own sentence**, unchanged. No wrapping that loses the
   record or the day it named.
3. Makes no network request and reads no global beyond `crypto.subtle`.
4. Is pure in the sense that matters: the same bytes give the same `WeatherSource`,
   including the same fingerprint, in the browser and under Node.
5. `kind === 'file'`, `fingerprint` set, `climateZone === null`, `ddy` null unless one
   was passed.

**Refuses**

| input | message names |
| --- | --- |
| bytes that are not text | what was expected |
| a file above the size a weather file is | the size found and the ceiling |
| a leap file, a multi-period file, a short or missing record | whatever `dailyMeans` names |
| a DDY that cannot be read, or that describes another place | the same sentence the picker gives an archive, plus both places |

### `sourceFromStation(station, files)` → `WeatherSource`

**Guarantees**: `kind === 'station'`, `fingerprint === null`, `degreeDays` published by
the index rather than measured, `token` as `stationToken()` builds it today. Behaviour
of a picked station is unchanged in every respect — this is the same data, typed.

### `fingerprint(bytes)` → `Promise<string>`

**Guarantees**: 16 characters from `[A-Za-z0-9_-]`. Equal for two byte sequences that
differ only in line terminators or trailing newlines. Unequal for any other difference,
including whitespace inside a field. Never throws for well-formed input; the digest is
taken before any text decoding, so encoding cannot move it.

### `degreeDaysOf(dailyMeans)` → `DegreeDays`

**Guarantees**: `HDD18 = Σ max(0, 18 − mean)` and `CDD10 = Σ max(0, mean − 10)` over the
365 daily means, on Celsius bases in both unit systems, carrying `measured: true` so the
reading can say where the figure came from. It never converts with the unit toggle
(`weather.js`'s standing rule, research R11 of this feature and R11 of the units work).

---

## `src/epw.js` (additions)

### `readLocation(epw)` → `WeatherFile`

Moved from `main.js` unchanged in behaviour, widened to carry latitude, longitude and
elevation alongside the six fields it already reads. Still bounded to the first sixteen
lines. Still passes `null` for an empty field and for onebuilding's bare hyphen. Still
never throws: a file with no LOCATION record declares nothing, which is a statement it
is entitled to make.

### `siteLocationValues(place)` → object

**Guarantees**: the fields `Site:Location` wants, spelled as the 26.1.0 schema spells
them, with the name taken from the city. **Contract on the caller**: the spellings are
confirmed against `schema.field('Site:Location', …)` before this ships (quickstart gate
2). CLAUDE.md's rule stands — field names drift between versions and are checked, never
recalled.

### `periodCovered(epw)` → `{ from, to, perHour }`

**Guarantees**: read off the `DATA PERIODS` record and the first and last timestamps,
never from `params` and never assumed to be a whole year. It is what the sheet letters
as the period, and what decides whether a reading whose months fall outside it is an em
dash.

---

## `src/model.js` (split)

`setDesignConditions(doc, conditions)` splits into two, and keeps its own name for the
pair so that the station path is untouched:

### `setSiteLocation(doc, location)`

Clears and rewrites `Site:Location` alone. Called by the file path with
`siteLocationValues(place)`, and by the station path with the DDY's parsed object, as
today.

### `clearDesignDays(doc)`

Removes every `SizingPeriod:DesignDay`. **Guarantees** the document stays complete:
nothing in this model is autosized (`model.js:2329`), so a desk with no design days and
`run_simulation_for_sizing_periods: 'No'` runs. `designDayDatums(doc)` returns `[]`
rather than throwing, and the callers letter the absence.

**Idempotence**, as for everything in `applyModel`: applying three times gives
byte-identical output, and a desk that had design days and lost them serialises
identically to one built without them.

---

## What does not change

Stated because the value of this contract is as much in what it fixes as in what it
adds:

- **`ep.run({ idf, epw })`** is handed the same kind of text whatever the source. The
  engine never learns where a file came from.
- **`shapeKey`** is untouched. The weather source is deliberately not part of it, as a
  station is not today.
- **The unit system** reaches no part of this. A fingerprint, a place and a period are
  the same in SI and IP.
- **`WeatherFile` and `qualificationsFor`** keep their signatures. `tm59.js` was already
  written to be handed what an attached file declares.
