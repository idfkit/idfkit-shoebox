# Implementation Plan: Attach a Weather File

**Branch**: `012-attach-weather-file` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-attach-weather-file/spec.md`

## Summary

Let a reader attach a weather file from their own machine — a purchased CIBSE DSY1, or
anything else EnergyPlus reads — as a second kind of weather source beside the TMYx
station picker, read entirely in the browser, and make every reading, refusal and
qualification on the sheet true of the file that was actually attached.

Planning turned up five findings that shape the work, one of which amends the spec.

1. **The clearing list is the feature.** `choose()` in `main.js` does eight things when
   a station is attached, and six of them are clears: studies, the sample cache, the
   survey ground and its traverse, the comfort line, the bill, the register's outcome.
   Each is a correctness rule with a comment explaining which mismatch it prevents. A
   second attach path that reimplemented them would drift, and the drift would be
   silent — Denver's curve under a British title block. So the work starts by
   extracting `attachClimate(source)` from `choose()`, with the picker as its first
   caller and the file as its second (research R1).
2. **A file is not a station wearing a hat.** Consumers read `station.url`,
   `station.hdd18`, `station.ashraeClimateZone`. A file object with those fields
   undefined would letter absences as values. A frozen `WeatherSource` in a new
   DOM-free `src/source.js` gives both kinds one shape and makes every absence
   explicit (R2).
3. **The address bar is already the memory of *which* file.** `updatePermalink`
   rewrites the fragment on every gesture, so a desk with a file attached carries its
   fingerprint in the URL, and a reload is a link being honoured. That makes the
   remembered bytes in `localStorage` a cache keyed by the fragment rather than a
   second source of truth — and it is what keeps Principle II intact, because a bare
   URL must not mean one thing on the machine that once attached a file and another
   everywhere else (R9). **This amends FR-021**: re-attachment on load happens where
   the link names the file; a bare desk *offers* the remembered file in one click and
   does not attach it silently.
4. **Two parsers already do most of the reading, and one of them already refuses
   what must be refused.** `readLocation` (in `main.js`, with a comment saying it
   belongs in `epw.js`) reads the LOCATION record; `dailyMeans` in `epw.js` already
   refuses a leap file, a multi-period file and a file with a record missing, each
   naming the day. Making `dailyMeans` the attach gate means there is no second
   opinion about what a usable file is, and degree days fall out of the daily means it
   already computes for nothing (R11, R12).
5. **Design days can be removed safely.** `model.js:2329` records that nothing in this
   model is autosized, because the console runs no sizing pass. So a desk with no
   `SizingPeriod:DesignDay` and `run_simulation_for_sizing_periods: 'No'` is a
   complete model, and the clarified answer — a DDY beside the file, or no design days
   at all — costs no fallback (R4).

The daylight-saving half of the TM59 qualification turns out to be already wired: a
`dst` control writes `use_weather_file_daylight_saving_period`, so a file that declares
a rule is already honoured by the run. What is missing is only that the qualification
says every reachable file declares none, which stops being true the moment a reader
attaches one of their own (R13).

## Technical Context

**Language/Version**: vanilla ES modules, ES2022, no transpilation.

**Primary Dependencies**: `@idfkit/*` only. **No dependency added.** Hashing is
`crypto.subtle.digest`, compression is `CompressionStream`/`DecompressionStream`, and
the file arrives through a plain `<input type="file">` — three platform APIs, which is
the substitution Principle V asks for.

**Storage**: one new `localStorage` key, `shoebox-weather-file-v1`, holding the
attached file gzipped and base64'd with its fingerprint and name. Measured on a
synthetic 8,760-row EPW: 1.66 MiB raw → 0.37 MiB gzipped → 518 K base64 characters →
about 1.0 MiB of a ~5 MiB quota (R8). `shoebox-general-notes-v4` bumps to `-v5`.

**Testing**: no test runner. Node harnesses under `specs/012-attach-weather-file/verify`
calling the real DOM-free modules (`source.js`, `epw.js`, `permalink.js`, `tm59.js`,
`model.js`), then IDFs written and run, then the page driven — per the constitution's
ten gates and [quickstart.md](./quickstart.md).

**Target Platform**: static site, browser only; EnergyPlus 26.1.0 WASM. No
infrastructure change, no new origin, no new proxy route.

**Project Type**: single-project front end, modules under `src/`.

**Performance Goals**: attaching costs one pass over the file's records —
`dailyMeans` at 3.2 ms measured, a SHA-256 at 4.75 ms measured, and a gzip at 44.5 ms
measured, all once per attach and none of them on the solve path or inside a gesture.
Boot with a remembered file costs one gunzip, 15.4 ms measured, before the first solve.
A solve against an attached file costs exactly what a solve against a station file of
the same length costs: the engine is handed the same kind of text (SC-005).

**Constraints**: no byte of the file may reach the network (Principle I, FR-002); the
unit system, the link and the solve key are untouched by where the file came from;
every new always-visible sentence inside a `src/copy.js` budget and readable at 390 px
without hover; `LINK_VERSION` stays `v1`, because two added reserved keys are additive
exactly as an added control is (R6).

**Scale/Scope**: one weather source at a time. Two new reserved link keys. One new
DOM-free module (`src/source.js`), three header readers moved or added in `src/epw.js`,
one function split in `src/model.js`, and the eight-step attach in `main.js` extracted
once and called twice. Files of a few megabytes; anything that will not fit the
remembering budget is run for the session and said so.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Against constitution
1.0.1.*

| Principle | Gate | Verdict |
| --- | --- | --- |
| I. Everything Runs in the Browser | No service, no upload, no compute endpoint; persistence is the reader's own browser | **PASS.** The file is read with `FileReader`/`Blob.text()` and handed to the WASM engine in the same page. No request carries it, and the feature *removes* a network dependency rather than adding one: a desk on an attached file makes no `/onebuilding` request at all. Remembering is `localStorage`, which is the mechanism the principle names. |
| II. Deterministic and Shareable | Anything changing a result rides the link; refusals whole; a version bump for a changed default | **PASS, and it is the hard case.** The file cannot ride the link, so the link rides a fingerprint of it and the desk refuses to letter a year until a file that matches is in hand (FR-018–FR-020). The same URL therefore reproduces the same drawing on any machine, or reproduces nothing and says why. R9 closes the one hole planning found: a remembered file is attached only where the fragment names it, so a bare URL means the same thing everywhere. No default, key or range changes; two added reserved keys are additive, so `LINK_VERSION` stays `v1`. |
| III. Read It Back Off the Model | Every figure traceable to the document, the run, or arithmetic over them | **PASS.** `Site:Location` is written from the file's LOCATION record and then read back off the document exactly as a station's is. Degree days are arithmetic over the file's own hours and say so. The period covered is read off its timestamps. Nothing about the place survives from the outgoing climate. |
| IV. No Silent Fallbacks | Throw naming what was missing; refuse whole; em dash for absent | **PASS.** The attach gate is `dailyMeans`, which already throws naming the record it could not read. A file with no DDY gets no design days rather than Denver's. An uncovered country refuses the bill with the sentence `rates.js` already publishes. A fingerprint mismatch refuses with both descriptions printed. Nothing is normalised into usability except line endings, and that rule is stated in one sentence and justified in R5. |
| V. Only @idfkit/* at Runtime | No new package; platform APIs preferred | **PASS.** Three platform APIs replace what would otherwise be a hashing library, a compression library and an upload client. |
| VI. Latency Is the Interface | Live sheet never queues; a run in flight never blanks the sheet | **PASS.** Everything this feature costs is paid once per attach or once per boot, never per frame and never inside a gesture. The attach goes through `attachClimate`, which is the path that already handles a run in flight. |
| VII. Mobile-First and Responsive | 390 px, no hover-only, `hidden` for folds | **PASS by construction, verified in quickstart gate 8.** The attach control, the remembered line, the forget action and every refusal this feature can produce are lettered in view. The file dialog is the platform's own and is reachable by keyboard. |

**Result: PASS.** No violation. Complexity Tracking is empty.

Two things were considered and rejected as violations rather than carried:

- **IndexedDB for the remembered file.** It would be a second persistence mechanism
  where the principle names one, and the measurement says it is not needed: gzip puts
  a 1.66 MiB file into about 1.0 MiB of quota (R8).
- **A country-name mapping table**, so that a file declaring "United Kingdom" rather
  than `GBR` could still be priced. That is a nearest match by another name, which
  Principle IV forbids; the bill refuses and names the place as the file spelled it.

## Constitution Check, re-evaluated after Phase 1

| Principle | Post-design verdict |
| --- | --- |
| I | **PASS.** [contracts/weather-source.md](./contracts/weather-source.md) puts the gate and the fingerprint in a module that reads no global but `crypto.subtle`, so there is no path a byte of the file could take to the network even by accident. Quickstart gate 9 records the whole session rather than trusting it. |
| II | **PASS, and stronger than at Phase 0.** R9 was found while designing the remembered file and moved a requirement: the address bar remembers which file, `localStorage` remembers its bytes, and neither can put a climate on the desk without the other. [contracts/permalink-weather.md](./contracts/permalink-weather.md) fixes the refusal order and keeps the whole-link refusal rule. The pre-feature link corpus is diffed in quickstart gate 6. |
| III | **PASS.** The data model gives `Place` one origin per field, and `Site:Location` is written from it and then read back off the document. The one recalled thing — the schema's field spellings — is a gate (quickstart 2) rather than an assumption. |
| IV | **PASS.** The design surfaced a new absence, `WeatherSource.climateZone`, and it is `null` in the model and an em dash only where lettered. The gate is the parser that already refuses, so no new opinion about a valid file was invented. |
| V | **PASS.** Unchanged: no package. |
| VI | **PASS.** The measurements moved into Technical Context and the one that matters — 44.5 ms of gzip — is placed after the attach has landed, off the solve path. Quickstart gate 8.3 drives an attach with a run, a study and a survey all in flight. |
| VII | **PASS.** Quickstart gate 8.6 walks the whole feature at 390 px with a coarse pointer, including the waiting-desk sentence, which is the one genuinely new thing on the sheet. |

**Result: PASS.** No violation after design. Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-attach-weather-file/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R15, with what was measured
├── data-model.md        # Phase 1: WeatherSource, the file record, the link tokens
├── contracts/
│   ├── weather-source.md    # what source.js and the epw readers guarantee
│   └── permalink-weather.md # the two reserved keys and the refusal order
├── quickstart.md        # Phase 1: the verification gates
├── checklists/
│   └── requirements.md  # written by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source code (repository root)

```text
src/
├── source.js        # NEW, DOM-free: WeatherSource, fingerprint(), measured degree days
├── epw.js           # + readLocation (moved from main.js, widened), siteLocationValues,
│                    #   degreeDaysFrom, periodCovered
├── weather.js       # + rememberFile / rememberedFile / forgetFile (browser-only, as this
│                    #   module already is)
├── model.js         # setDesignConditions split: setSiteLocation + clearDesignDays
├── permalink.js     # + reserved keys `wf`, `wfd`, and their refusal order
├── main.js          # choose() split into attachClimate(source); the file path; the
│                    #   waiting state a `wf` link lands in; the picker's second way in
├── console.js       # the attach control, the remembered line, the forget action
├── tm59.js          # the weather and local-time qualifications, read off the file
├── rates.js         # pricesFor takes a place, not a station
├── bundle.js        # the manifest names a reader's own file and its licence
├── report-sheet.js  # the run-files card says the bundle carries that file
├── tour.js          # NOTES for the station step; storage key → shoebox-general-notes-v5
└── copy.js          # budgets for the new always-visible strings

index.html                      # the site panel's second way in; styles for it
.interface-design/system.md     # the file-attach pattern and the remembered line
docs/design-notes.md            # a new section: attaching a weather file
CHANGELOG.md                    # the entry the sheet reads back
```

**Structure Decision**: the existing single-project layout. One new module, `src/source.js`,
because the typed source is shared by `main.js`, `rates.js`, `bundle.js` and the Node
harnesses, and because it must stay DOM-free and network-free while `weather.js` — which
resolves `import.meta.env.BASE_URL` and cannot be imported from Node — cannot. The
remembering goes into `weather.js` for the mirrored reason: it touches `localStorage`,
so it belongs in the module that is already browser-only.

## Complexity Tracking

> No constitution violations. This section is empty by design.
