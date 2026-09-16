# Phase 0 research: Attach a Weather File

Every finding below was read out of this repository or measured in it. Where a figure
is synthetic it says so, and where something must be checked against the schema or a
run before it can be relied on, it says that instead of guessing.

**Measurement conditions.** Node 22.22.2 in the session container, over a synthetic
8,760-row EPW built to the real record shape (35 comma-separated fields, jittered
values so the text is not artificially compressible): 1,741,631 bytes, 1.66 MiB. It is
a stand-in, not a bought file, and every figure taken over it is re-measured against a
real EPW in quickstart gate 1.

---

## R1 — Where a second weather source plugs in

**Decision**: extract `attachClimate(source)` out of `choose()` in `main.js`. The
picker calls it after it has fetched and read an archive; the file path calls it after
it has read and gated a file. Neither path owns any of the eight steps.

**Rationale**: `choose()` (`src/main.js`, around 4440–4600) does eight things, and six
of them are clears, each carrying a comment naming the mismatch it prevents:
`studyScheduler.clearAll()` and `studyStops.clear()` (curves sampled under the outgoing
climate), `closeSurvey({ forgetTraverse: true })` (every spot height is a run against
the departed weather), `meanCache = null` (365 daily means of one city's year),
`bill = null` / `lastRun = null` (one city's energy at another city's tariffs is true
of nowhere), `lastOutcome = null` (a heating demand read in Denver says nothing about a
target asked of a building in Bavaria). The other two are the model write and the
title-block re-letter. A second attach path would have to repeat all eight, and the
failure mode of getting one wrong is a reading that looks right.

**Alternatives considered**: a parallel `attachFile()` beside `choose()` — rejected,
the six clears are exactly what must not be duplicated. Passing a flag into `choose()`
— rejected, the fetch-and-refuse half at the top is entirely about archives and has no
meaning for a file.

---

## R2 — One shape for a station and a file

**Decision**: a frozen `WeatherSource` class in a new DOM-free `src/source.js`, built
by `sourceFromStation(station, files)` or `sourceFromFile({ name, bytes, ddyText })`.
Consumers stop reading `station.*` and read the source.

**Rationale**: the sheet reads `station.url` (the bundle's weather stem, and the
"is a real archive attached" test in `stationToken`), `station.wmo`, `station.country`
and `station.state` (the tariffs), `station.elevation`, `station.ashraeClimateZone` and
`station.hdd18` / `station.cdd10` (the picker's sub-line). A file has a city and a
country and no ASHRAE climate zone at all. Handing the rest of the page an object with
those fields `undefined` would letter an absence as a value, which is the one thing
Principle IV forbids — `climateZone()` already returns `'—'` for an absent zone, and
that is the behaviour every field needs, declared rather than accidental.

**Alternatives considered**: duck-typing a file as a station — rejected above.
Branching at each of the dozen call sites — rejected: twelve places that must each
remember which kind they are holding is twelve places to forget.

---

## R3 — Reading the place off the file

**Decision**: move `readLocation` from `main.js` to `src/epw.js` (where its own comment
says it belongs), widen it to the four positional fields it currently drops, and add
`siteLocationValues(location)` returning what `Site:Location` wants.

**Rationale**: the LOCATION record is
`LOCATION,City,State,Country,Source,WMO,Lat,Lon,TimeZone,Elevation` and
`readLocation` keeps six of the ten. `Site:Location` needs latitude, longitude, time
zone and elevation, which are fields 6, 7, 8 and 9 — three of them currently discarded.
Everything else about the move is mechanical: the function is already written to pass
`null` for an empty field, already treats onebuilding's bare hyphen as absence, and
already bounds its search to the first sixteen lines so that a file without the record
costs nothing to reject.

**Open, and checked rather than assumed**: the `Site:Location` field *names*. CLAUDE.md
records that field names drift between versions, and the DDY path never had to name
them because it copies the parsed object with `toJSON()`. The EPW path must name
`latitude`, `longitude`, `time_zone` and `elevation` explicitly, and those spellings are
confirmed against the 26.1.0 schema in quickstart gate 2 before anything depends on
them.

---

## R4 — Design days when the file arrives without a DDY

**Decision** (the spec's third clarification): a DDY attached beside the file supplies
them. Where none is, the desk carries none: `SizingPeriod:DesignDay` is cleared,
`sizingPeriods` is committed to `'No'` and withdrawn on the Run strip with its reason,
and the datum lines are absent.

**Rationale**: `src/model.js:2329` states it outright — *"Nothing here is autosized
(the console does not run a sizing pass)"* — in the comment explaining why the
economizer's cooling flow limit is computed from the zone volume rather than left to
size. So no object in this model needs a sizing period to be complete, and removing the
design days costs nothing but the datum lines and the design-day readings themselves.
The alternative is what Principle IV exists to forbid: Denver's two design days
standing under a British title block, which is the same failure the station picker
already refuses a DDY-less archive over.

**Consequences to carry**: `designDayDatums(doc)` must return an empty list rather than
throw; `renderTrace` must draw no datum lines and the plate must letter their absence
with the reason; the Run strip's design-day choice needs a `requires` that states why it
is withdrawn; and `main.js:11593`'s "nothing to solve" sentence (`sizingPeriods === 'No'
&& !epwText`) stays correct, because a file attached means `epwText` is set.

**Alternatives considered**: reading the EPW's own `DESIGN CONDITIONS` header record —
rejected. It is optional, frequently `DESIGN CONDITIONS,0`, and its contents vary by
publisher; building design days out of it would be inventing a day the file did not
publish. Requiring a DDY — rejected by the clarification: it locks out a reader whose
purchase includes only the year, for the sake of two datum lines.

---

## R5 — What the fingerprint is taken over

**Decision**: SHA-256 over the file's bytes with CRLF and lone CR normalised to LF and
trailing newlines stripped, encoded base64url, truncated to 16 characters (96 bits).

**Rationale**: the fingerprint's job is to establish that the recipient's file will
reproduce the sender's numbers. What EnergyPlus reads is the records; how their lines
end is not one of them. A purchased file copied between Windows and macOS, or opened
and saved by a text editor, changes its line terminators and not one value — and
refusing a colleague's identical data on that basis would be a false refusal, which is
worse than no check at all because it teaches the reader to distrust the check. So the
rule is one sentence a reader can hold: *the fingerprint is over the file's records,
not over how its lines end.* Nothing else is normalised — not whitespace inside a
field, not field order, not a header record — because any of those can change a result.

Normalisation happens on the bytes, before any text decoding, so a file whose city name
is Latin-1 rather than UTF-8 fingerprints identically for two readers whatever their
browser makes of the name on screen.

**Measured**: SHA-256 over 1.66 MiB, 4.75 ms median of 25 passes (synthetic file).
Once per attach, off the solve path.

**Why 16 characters**: 96 bits is far past any collision a human-scale set of weather
files could produce, and it keeps the link short. Base64url's alphabet is
`A–Z a–z 0–9 - _`, every character of which survives `URLSearchParams` unescaped —
which CLAUDE.md names as the constraint the link grammar lives under.

**Alternatives considered**: the raw bytes with no normalisation — rejected for the
false-refusal case above. A digest of the LOCATION record plus the data records' dry
bulbs — rejected: cleverer, cheaper, and it would call two genuinely different files
the same one.

---

## R6 — What the link carries, and whether it costs a version

**Decision**: two new reserved keys, `wf` (the fingerprint) and `wfd` (the declaration,
percent-encoded). `LINK_VERSION` stays `v1`.

**Rationale**: `permalink.js` states the contract — *"Adding a control costs nothing.
Old links simply omit the new key and take its default"* — and bumps the version only
for a changed default, a renamed key or a narrowed range. A new reserved key is the
additive case: every link in the wild omits it, and an omitted `wf` means what it has
always meant, that no file is wanted. `RESERVED` already carries seven keys and asserts
that none collides with a control parameter; two more join that assertion.

`wfd` carries `WeatherFile.declares` — the file's own phrase, `London Gatwick, GBR ·
CIBSE DSY1 · WMO 037760` — because a recipient handed only a hash has been told that
their file is wrong and not which file is right. It costs 40–80 characters
percent-encoded, which is the price of the sentence being useful.

**Refusal order**, following the existing `win`-without-`stn` rule: `wfd` without `wf`
is refused; `wf` together with `stn` is refused, because a desk has one weather source
and a link claiming two is a link that cannot be honoured. Both are read in
`decodeState` above `readValue`, where the reserved keys are read, and both are refused
whole rather than dropped.

---

## R7 — What a `wf` link lands on

**Decision**: a waiting desk. Every parameter, patch, pin, study and survey the link
carries is applied; the shipped Denver design days are **removed**; nothing is solved;
the site field letters what the link asked for, in the file's own words, and the
readings that need a year are absent with that reason.

**Rationale**: the alternative is to leave the shipped design days in place and solve
them, which would put readings on the sheet that are about Denver under a title block
naming Gatwick — the precise failure `choose()`'s DDY refusal exists to prevent, one
column along. A desk that says "I need this file" and shows no numbers is the honest
state, and it is the same shape as the refusal the picker already writes.

**Consequence**: `linkAttachPending` — which today holds the address bar still while a
linked station is fetched — gains a sibling for the file case, or is generalised. The
address must not be rewritten from a desk that has not yet got its climate, or the link
being honoured loses the very token it is waiting on.

---

## R8 — Remembering the file

**Decision**: one `localStorage` key, `shoebox-weather-file-v1`, holding the file
gzipped through `CompressionStream('gzip')` and base64'd, with its fingerprint, the
name the reader gave it, and the DDY if one was attached.

**Measured** (synthetic 1.66 MiB EPW, medians):

| step | cost | when |
| --- | --- | --- |
| gzip | 44.51 ms | once, per attach |
| base64 | 0.43 ms | once, per attach |
| gunzip | 15.40 ms | once, per boot that re-attaches |
| stored size | 388 KB gzipped → 518 K base64 characters → **~1.0 MiB** of a ~5 MiB quota (`localStorage` stores UTF-16) | — |

**Rationale**: the principle names `localStorage` and the URL fragment as the
persistence this page has, and gzip is already this page's idiom — the station index
arrives gzipped and is inflated with `DecompressionStream`, and `bundle.js` compresses
ZIP members with `CompressionStream('deflate-raw')`. So the file fits the mechanism
that already exists rather than bringing a new one. The 44.5 ms is paid once, after the
attach has already landed, and never inside a gesture.

**Alternatives considered**: IndexedDB — rejected as a second persistence mechanism
the measurement does not require. Not remembering at all — rejected: a reload is how a
permalink is opened, and sending the reader back to the filesystem on every reload
makes the link feature unusable.

**The quota case is a stated outcome, not an error**: a file too large to store leaves
the session working and the sheet saying the file will not be remembered (FR-021).

---

## R9 — When a remembered file is re-attached (this amends FR-021)

**Decision**: a remembered file is attached automatically **only where the fragment's
`wf` matches its fingerprint**. On a bare URL the desk comes back as it ships, with no
climate, and the site field offers the remembered file in one click.

**Rationale**: this is a Principle II finding and it is worth stating plainly.
`updatePermalink` rewrites the fragment on every gesture, so a desk with a file attached
already carries its fingerprint in the address bar — which means an ordinary reload is a
`wf` link being honoured, and US4's "reload and the file is still attached" falls out
of the link mechanism at no extra cost. But auto-attaching on a *bare* URL would make
`shoebox.idfkit.com` mean one thing on the machine that once attached a file and
another on every other machine, which is exactly what Principle II forbids: *"The same
URL MUST reproduce the same drawing, the same IDF and the same numbers in any browser,
on any machine, at any time."*

So the division is: **the address bar remembers which file; `localStorage` remembers
its bytes.** Neither can put a climate on the desk without the other agreeing.

**Spec change**: FR-021's "re-attached on load without a second trip to the filesystem"
is narrowed to loads whose link names the file, and the bare-desk case becomes an
offer. US4's first acceptance scenario is refined the same way.

---

## R10 — Tariffs, currency and the grid factor

**Decision**: `pricesFor` takes the source's place — `{ country, state }` — instead of
a station object. A country the tables do not cover refuses the bill with the sentence
`rates.js` already publishes, naming the place as the file spelled it.

**Rationale**: `rates.js` keys North America by state and Europe by country in ISO
3166-1 alpha-3, and `GRID_INTENSITY` carries `GBR: 217.41`, so a British file prices
correctly the moment its country reaches the function. The existing refusal sentence —
*"These tables cover the United States and Canada by state and province and Europe by
country, and nothing in them is published for …"* — already reads correctly for a file,
and `countryName(iso3) ?? iso3` already letters an unrecognised code rather than
substituting.

**Explicitly rejected**: a mapping from "United Kingdom" or "UK" to `GBR`. That is a
nearest match, which Principle IV forbids, and it would have to guess at a publisher's
spelling conventions. A file that spells its country in a way the tables do not know
gets a refusal naming what it said.

---

## R11 — Degree days, measured rather than published

**Decision**: HDD18 and CDD10 for an attached file are computed from the daily means
`dailyMeans` already produces, and the reading says they were measured from this file.

**Rationale**: degree days on a base are defined over daily mean temperatures —
`HDD18 = Σ max(0, 18 − mean)`, `CDD10 = Σ max(0, mean − 10)` — and `dailyMeans` already
returns exactly those 365 numbers and is already cached on the file's identity for the
comfort line. So the figure costs nothing beyond two additions per day, is traceable to
the file's own hours, and keeps `degreeDays()`'s existing rule that the bases stay
Celsius in both unit systems and the reading says so.

The reading must distinguish itself from a station's: an index station's HDD18 is
published, a file's is measured here. Two different provenances lettered identically
would be the claim this page cannot check.

**Where `dailyMeans` throws** — a leap file, a multi-period file, a missing record —
the degree-day reading is an em dash carrying that sentence, exactly as criterion a's
margin cell already does.

---

## R12 — The attach gate is the parser that already exists

**Decision**: a file is accepted if `readLocation` can be run over it and `dailyMeans`
does not throw. A throw becomes the attach refusal, in the sentence `dailyMeans` already
writes.

**Rationale**: `dailyMeans` (`src/epw.js`) already refuses, by name and with the day or
record named: a file declaring more than one data period (*"a daily mean series wants
one unbroken year"*), a leap file (*"8,784 records and its dates cannot be read against
the 365-day calendar the run uses"* — which is a property of the desk's `RunPeriod`
leaving `begin_year` empty, not of TM59), a record too short to reach its dry bulb, a
date that is not a date, a dry bulb outside the EPW dictionary's −70…70 °C, and a day
missing records. Those are precisely the files that cannot be run on this desk. Writing
a second validator would be a second opinion about what a valid file is, and the two
would disagree the first time one was changed.

It costs 3.2 ms (measured in `epw.js`'s own comment, 3.13 ms re-measured in `main.js`),
paid once at attach, and the result is the cached `dailyMeans` the comfort line wants
anyway.

**What this does not gate**: a sub-hourly file passes — `dailyMeans` reads `records per
hour` and counts against it — and so it should; the run reads it the same way.

---

## R13 — The qualifications that stop being true

**Decision**: the local-time qualification splits. The standing half states TM59:2026
§3.7.1's rule that profile times are local UK time. The run-dependent half states what
the **attached file's own** `HOLIDAYS/DAYLIGHT SAVINGS` record declares, read by
`parseEpwCalendar`, which already returns `{ holidays, daylight }`.

**Rationale**: the current text asserts a measurement — *"every file the picker can
reach declares none: measured, `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0` on Denver 725650 and
Berlin-Tegel 103820 … and on all five EPWs shipped with EnergyPlus 26.1"* — and that
sentence is true of the picker and stops being true of the page the moment a reader
attaches a file of their own. Keeping it would be the page stating something false about
its own run, which is the failure User Story 2 exists to prevent.

**And it is already wired**: `applyRun` writes
`use_weather_file_daylight_saving_period: params.dst`, and the Run strip already carries
a `dst` control ("Daylight saving: Observe / Ignore", default Observe). So a file that
declares a rule already has it honoured by the run; only the sentence needs to catch up,
saying which of the two states this run is in.

**The weather qualification** keeps its shape exactly: `weather.declares` beside
`WFR_REQUIREMENT`, no relation asserted between them (FR-012). Nothing about its wording
needs to change for an attached file — which is what `tm59.js` meant by writing it to
stay true *"the day a reader attaches a licensed DSY of their own"*.

---

## R14 — Where the file's bytes may and may not go

**Decision**: the bundle carries the file, as it carries a station's, with a manifest
line naming it as the reader's own and stating that its licence governs sharing the
bundle. The report's run-files card says the same before the reader downloads it. The
report text itself carries nothing from the file beyond what the sheet already letters.

**Rationale**: `report-sheet.js` `renderRunFiles` calls `save(blob, filename)` — the
bundle goes to the reader's own disk and the page transmits nothing. The hand-off is a
pre-filled new-issue address carrying the report's text, so the only way a licensed file
reaches the public is a reader choosing to attach the downloaded ZIP to an issue. That
is their decision to make, and the sheet's job is to make sure they know they are making
it, at the moment they download. `bundle.js`'s existing rule — the EPW is the file as
fetched, and a design-day run carries no weather file rather than an invented one — is
unchanged.

`run.weatherStem` today is `station.url.split('/').pop()` with `.zip` stripped. For a
file it becomes the name the reader's own file carried, with its extension stripped and
its characters narrowed to what a ZIP member name may hold.

---

## R15 — What else must move in the same change

Read off CLAUDE.md's standing rules and the constitution's gates, so that none of it is
discovered late:

- **`src/copy.js`** — every new always-visible string (the attach control's label, the
  remembered line, the waiting-desk sentence, each refusal) is asserted against a
  budget at load. New long text goes in a `blurb`, `note` or `body`, never in view.
- **`src/tour.js`** — the `station` note now covers a second way of getting a year onto
  the desk, so `NOTES` and its call sites change and `shoebox-general-notes-v4` bumps
  to `-v5`. This is gate 6 of the constitution's workflow, and it is not optional.
- **`.interface-design/system.md`** — a file-attach control and a "remembered, forget
  it" line are new component patterns, and gate 8 requires them recorded there in the
  same change that introduces them, not in the stylesheet.
- **`docs/design-notes.md`** — a new section carrying the measurements above, the
  fingerprint rule and the Principle II reasoning in R9, per CLAUDE.md's opening
  instruction that hard-won findings live there.
- **`CHANGELOG.md`** — the sheet reads it back through `changelog.js`, so the entry is
  part of the feature rather than paperwork after it.
- **`index.html`** — the site panel's second way in, and its styles. Any class that
  toggles `display` needs its own `[hidden]` twin, per CLAUDE.md.
