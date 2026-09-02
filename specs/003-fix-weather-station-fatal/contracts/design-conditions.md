# Contract: reading a station's design conditions

Two contracts. The first is a module boundary inside the page,
`src/model.js` to `src/main.js`, and it is the one the harness drives. The second
is what the reader is promised at the surface.

## 1. `designConditionsFrom(text, schema)`

**Called by**: `choose` in `src/main.js`, once per attach, with the DDY text
unzipped from the station's archive and the loaded 26.1.0 schema. It is the only
caller.

**Returns** `{ location: { name, values }, days: [heating, cooling] }`, where each
day is `{ name, values }` taken verbatim from the parsed document. Shape
unchanged from today, so `setDesignConditions` needs no change.

**Throws** an `Error` whose message is a sentence fragment that reads after the
station's name, because the caller letters it as
`` `${siteName(picked)} cannot be used: ${error.message}` ``. This is the
existing convention and it is why the messages are lower case and start mid
sentence.

### Guarantees

| # | Guarantee |
| --- | --- |
| C1 | The heating day returned is one of the declared heating candidates; the cooling day is one of the declared cooling candidates. No other object is ever returned. |
| C2 | A monthly design day is never returned, whatever its `day_type`. |
| C3 | Every field of a returned day that the schema types numeric holds a finite number. |
| C4 | Where several candidates qualify, the earliest in the declared order is returned. The choice does not depend on the order objects appear in the file. |
| C5 | The function is pure and total on its inputs: same text and schema, same result, no clock, no network, no randomness. |
| C6 | Either both days and the location are returned, or it throws. There is no partial return. |

### Refusal messages

Each names the specific missing thing, per the no-silent-fallbacks rule. All are
fragments completing "«station» cannot be used: ".

| Condition | Message |
| --- | --- |
| No candidate cooling day published | `it publishes no annual cooling design conditions` |
| No candidate heating day published | `it publishes no annual heating design conditions` |
| A candidate is published but every one carries a value that is not a number | `its published cooling design conditions carry no usable value for «field»` |
| No `Site:Location` | `its DDY carries no Site:Location` (unchanged) |
| Archive carries no DDY at all | `its archive carries no DDY` (unchanged, raised by the caller) |

### Cases the harness must cover

| Input | Expected |
| --- | --- |
| A DDY with the named 1% and 99% days, clean | both returned, `1% clg db` and `99% htg db` |
| A DDY with no `DB=>MWB` family but a clean `1% DP=>MDB` | returns the dewpoint day, lettered as the dewpoint day |
| The reported Boston DDY: heating days fine, one January day carrying `N` | throws, naming the absent annual cooling conditions |
| A DDY whose only 1% cooling candidate carries `N`, with a later clean candidate | returns the later candidate |
| A DDY with an annual cooling day typed `WinterDesignDay` | not accepted as cooling |
| A DDY with no `Site:Location` | throws |
| Empty text | throws, never returns half |

## 2. What the reader is promised

**On attach.** Exactly one of three things happens, and the sheet is never
between them: the station attaches whole, the station is refused and nothing on
the sheet moves, or a later choice supersedes it silently.

**On refusal.**

- The status line names the station and says which of the two things was wrong,
  in words that do not require knowing what a DDY is.
- The site field returns to `Choose a weather location`. The sheet keeps every
  reading it had, undimmed, because they are still true of the station still
  attached.
- The picker reopens on the nearest other sites to the refused one, so the next
  gesture is a click. The refused site's own other periods stay reachable through
  the existing `← All locations` step.
- No run is started, no study is cleared, no bill is dropped. A refusal is not an
  event in the model.

**On a link naming a refused station.** `refuseLink` handles it as it handles
every unhonourable link: the whole link is refused back to defaults, the reason
stands in the status line, and auto-solve is stopped so no solve overwrites it.
No new path.

**On the plate.** The two datum lines letter the design days that were actually
taken. A station sized on a dewpoint-basis cooling day says so, rather than
lettering `1% clg db` over a day that is not one.

## What this contract does not change

- The link format. No key added, renamed or re-defaulted; `LINK_VERSION` stays
  `v1` and `MIGRATIONS` stays empty.
- `setDesignConditions`, `modelFacts`, `renderTrace`, or anything downstream of
  the document.
- The built-in Denver design conditions the sheet boots on.
- The number of design days in a run, which stays two.
