# Phase 1: Data model

Nothing here is persisted, nothing rides the permalink, and nothing is a control.
These are declarations and the shapes that pass between three functions.

## `DesignDayWanted` (new, `src/model.js`)

One acceptable design day, named exactly as onebuilding writes it after the site
prefix. Frozen instances in a declared array, in the house style of
`src/controls.js`: a class with a constructor, not a loose dictionary.

| Field | Type | Meaning |
| --- | --- | --- |
| `suffix` | string | The published name after the site prefix, e.g. `Ann Clg 1% Condns DB=>MWB`. Matched against the tail of the object's name, case-insensitively. |
| `dayType` | `'WinterDesignDay'` \| `'SummerDesignDay'` | The season it must also declare. A file that names a day one thing and types it another is not a file to guess about. |
| `label` | string | What the plate letters on that datum line, e.g. `1% clg db`, `.4% clg dp`. Read by `designDayDatums`; this is the string that stops being a constant. |
| `note` | string | What the reader is told when this is the day that was taken and it is not the first choice. Carries the basis, e.g. `dewpoint basis: this station publishes no wetbulb record`. |

### `DESIGN_DAYS` (the declaration)

Two ordered lists, most-wanted first. Order is preference, not search: the first
entry that is published and passes the numeric check wins.

```text
heating: Ann Htg 99% Condns DB          -> "99% htg db"
         Ann Htg 99.6% Condns DB        -> "99.6% htg db"

cooling: Ann Clg 1% Condns DB=>MWB      -> "1% clg db"
         Ann Clg 1% Condns WB=>MDB      -> "1% clg wb"
         Ann Clg 1% Condns DP=>MDB      -> "1% clg dp"
         Ann Clg 1% Condns Enth=>MDB    -> "1% clg enth"
```

**Invariants, thrown at module load** in the house style, because a declaration
error must fail at load rather than degrade at run time:

- Every `suffix` is unique across both lists.
- Every entry's `dayType` matches its list's season.
- Every entry carries a non-empty `label` and `note`.
- Each list is non-empty, since a list of no acceptable days would refuse every
  station on the planet silently.
- No `suffix` matches a monthly form. A month name in a candidate is the exact
  mistake this change exists to close, so it is asserted rather than trusted.

## `DesignConditions` (existing shape, now carrying its provenance)

What `designConditionsFrom` returns and `setDesignConditions` writes.

| Field | Type | Change |
| --- | --- | --- |
| `location` | `{ name, values }` off `Site:Location` | unchanged |
| `days` | `[{ name, values }, ...]` the heating day then the cooling day | unchanged in shape |

The `label` and `note` of the chosen candidates are **not** added to this object
and must not be. `setDesignConditions` writes the days into the document, and
`designDayDatums` reads them back out; carrying the label alongside would create
a second path for the same fact, which is what Principle III forbids. The label
is re-derived from the name in the document, which is the only copy.

## `Datum` (existing, `designDayDatums`)

| Field | Type | Change |
| --- | --- | --- |
| `value` | number, the day's `maximum_dry_bulb_temperature` | unchanged |
| `label` | string | **was** a constant chosen by `day_type`; **becomes** the `label` of the `DesignDayWanted` whose suffix the day's own name ends with |

A design day in the document whose name matches no candidate can only arrive from
the built-in Denver pair, which is why that pair keeps names the declaration
covers. Anything else is a bug and throws by the no-silent-fallbacks rule rather
than lettering a blank.

## `Refusal` (interface state, `src/main.js`)

Not a stored object; the arguments to the existing `refuse` in `choose`, widened.

| Field | Meaning |
| --- | --- |
| station | The station refused, named as the reader saw it in the list |
| reason | Which of the two failures happened, in the reader's terms: publishes no annual cooling design conditions, or publishes one whose values cannot be read |
| offers | The nearest other sites, computed from the refused station's own coordinates |

## State transitions

Attaching a station has three outcomes today and keeps exactly three. The change
moves one class of station from the first arrow to the second.

```text
attach ──> attached      the archive fetched, a heating and a cooling candidate
       │                 found and parsed, the whole climate written together
       │
       ├─> refused       fetch failed, no DDY, no Site:Location, no candidate
       │                 published, or no candidate whose numbers parse.
       │                 Nothing on the sheet changes. The reason stands in the
       │                 status line and the picker reopens on the nearest sites.
       │
       └─> superseded    a later choice took over mid-flight. Nothing is said,
                         because nothing happened to the sheet.
```

There is no partial attach and there must not be one: the year and the design
conditions arrive in the same archive and are written in the same breath, so a
station is either the sheet's climate or it is not.
