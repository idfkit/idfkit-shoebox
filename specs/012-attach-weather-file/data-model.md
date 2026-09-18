# Phase 1 data model: Attach a Weather File

Four things are declared by this feature: what a weather source is, what an attached
file is, what the link carries about it, and what the browser remembers. Everything
else on the sheet reads one of these rather than holding its own copy.

The house rule applies throughout: **prefer typed objects**, frozen, validating in the
constructor and naming what was missing when they refuse.

---

## `WeatherSource` — `src/source.js` (new, DOM-free, network-free)

The one answer to "what is this desk solving against". Exactly one exists at a time, or
none.

| field | type | station | attached file |
| --- | --- | --- | --- |
| `kind` | `'station'` \| `'file'` | `'station'` | `'file'` |
| `epw` | string | the archive's EPW | the file as read |
| `ddy` | string \| null | the archive's DDY | a DDY attached beside it, or null |
| `place` | `Place` | from the DDY's `Site:Location` and the index row | from the file's LOCATION record |
| `declares` | `WeatherFile` | the EPW's LOCATION record | the same |
| `label` | string | the flavour the reader chose (`2007–2021`) | the file's own name |
| `fingerprint` | string \| null | null | 16 base64url characters (R5) |
| `token` | `{ stn, win }` \| `{ wf, wfd }` | what the link carries | what the link carries |
| `climateZone` | string \| null | the index's ASHRAE zone | **null** — a file declares none |
| `degreeDays` | `DegreeDays` \| `Absence` | published by the index | measured from the file (R11) |
| `stem` | string | the archive name, `.zip` stripped | the file name, extension stripped, narrowed to ZIP-safe characters |

**Invariants.**

- Frozen on construction. Every field is passed, and `null` is a legitimate value for
  any nullable one — the `WeatherFile` rule, for the same reason: "the file says
  nothing here" and "nobody read it" must never be the same state.
- `kind: 'file'` requires a `fingerprint`; `kind: 'station'` refuses one.
- A source is never partially built. The constructor runs after the gate (R12), so a
  `WeatherSource` that exists is one the desk can solve.
- `climateZone` is null rather than `'—'`: the em dash is lettering, and lettering
  belongs to the reading, not to the model.

**Built by**: `sourceFromStation(station, files)` and
`sourceFromFile({ name, bytes, ddyText })`. The second is async — it hashes and parses —
and throws with the parser's own sentence where the gate refuses.

---

## `Place` — what the sheet letters about where the building is

Read from the file's LOCATION record, or from the station's index row and DDY. Every
field may be null, and a null is an em dash when lettered.

| field | from the EPW LOCATION record | used by |
| --- | --- | --- |
| `city` | field 1 | the title block, the site field |
| `region` | field 2 | the title block's qualifier; the US/Canada tariff key |
| `country` | field 3 | the tariffs, the currency, the grid factor (R10) |
| `wmo` | field 5 | `declares`, and the station link token |
| `latitude` | field 6 | `Site:Location` |
| `longitude` | field 7 | `Site:Location` |
| `timeZone` | field 8 | `Site:Location` |
| `elevation` | field 9 | `Site:Location`, the site line |

`siteLocationValues(place)` turns it into what `Site:Location` wants. The field
spellings are confirmed against the 26.1.0 schema before use (R3, quickstart gate 2),
never recalled.

---

## `AttachedFile` — the transient a file arrives as

Not stored and not frozen into the source: it is what the attach path holds between the
file dialog and `attachClimate`.

| field | type | note |
| --- | --- | --- |
| `name` | string | as the reader's filesystem gave it; never sent anywhere |
| `bytes` | `Uint8Array` | what was read; what the fingerprint is taken over |
| `text` | string | decoded once, handed to the engine and the parsers |
| `ddyText` | string \| null | a DDY attached beside it |

**The gate** (R12), in order, each refusal naming what was missing and leaving the
previous climate untouched:

1. It is text and it is of a size a weather file is.
2. `readLocation` runs. A file with no LOCATION record is not refused — that is a
   statement the file is entitled to make, and `declares` letters it.
3. `dailyMeans` runs. Any throw is the refusal, in its own sentence.
4. If a DDY came with it, `designConditionsFrom` runs, and its throw is the refusal —
   the same sentence the picker already gives for an archive whose DDY cannot be read.

---

## `Fingerprint` — `fingerprint(bytes)` in `src/source.js`

```
normalise:  CRLF → LF, lone CR → LF, trailing newlines stripped   (bytes, not text)
digest:     SHA-256
encode:     base64url
truncate:   16 characters (96 bits)
```

One rule, statable in a sentence: **the fingerprint is over the file's records, not
over how its lines end** (R5). Nothing else is normalised. Pure, async, and Node-callable,
so a harness fingerprints the same file the browser does and gets the same string.

---

## The link's weather tokens — `src/permalink.js`

Two keys join `RESERVED`, which already asserts that no reserved key collides with a
control parameter.

| key | carries | grammar |
| --- | --- | --- |
| `wf` | the fingerprint | `[A-Za-z0-9_-]{16}` |
| `wfd` | what the file declares about itself | free text, percent-encoded |

**Refusals**, read in `decodeState` above `readValue` with the other reserved keys, each
refusing the link whole:

| condition | reason |
| --- | --- |
| `wfd` without `wf` | a file's declaration with no fingerprint to match it against |
| `wf` with `stn` | a desk has one weather source, and this link claims two |
| `wf` malformed | not a weather-file fingerprint |
| either key repeated | the existing repeated-key refusal, unchanged |

`LINK_VERSION` stays `v1`: an added reserved key is additive, and every link in the wild
omits it (R6).

---

## `RememberedFile` — `localStorage`, `shoebox-weather-file-v1`

| field | type | note |
| --- | --- | --- |
| `fingerprint` | string | what a `wf` link is matched against |
| `name` | string | so the offer can name the file |
| `declares` | string | so a bare desk's offer reads in the file's own words |
| `gz` | base64 string | the file, gzipped (R8) |
| `ddyGz` | base64 string \| null | the DDY, if one was attached |

**Rules.**

- Written after an attach lands, never before: what is remembered is a file that
  already solved.
- Read on boot **only** when the fragment carries a `wf` that matches, or when a bare
  desk offers it to the reader (R9). It never puts a climate on the desk by itself.
- One file — the last attached. Attaching a station does not erase it; it stops being
  attached, and the offer remains.
- A write that exceeds the quota is not an error: the session goes on and the sheet
  says the file will not be remembered (FR-021).
- Cleared by the reader's own "forget", and by nothing else.

---

## State the desk can be in

| state | design days | year | what the sheet letters |
| --- | --- | --- | --- |
| **Shipped** | Denver's two | none | the design-day desk, as today |
| **Station attached** | the archive's DDY | the station's | as today |
| **File attached, DDY beside it** | that DDY's | the file's | the file's place, its measured degree days, its own declaration |
| **File attached, no DDY** | **none** | the file's | as above; the design-day choice withdrawn with its reason; no datum lines (R4) |
| **Waiting on a link's file** | **none** | none | what the link asked for, in the file's own words; every reading needing a year absent with that reason (R7) |
| **Refused** | unchanged | unchanged | the reason, in view; the previous climate untouched |

The waiting state is the one new one, and it is deliberately not the shipped state: a
desk that has been told which file it needs must not solve Denver's design days under
that file's title block.
