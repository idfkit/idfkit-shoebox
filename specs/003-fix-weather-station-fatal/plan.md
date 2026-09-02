# Implementation Plan: A station with incomplete design conditions is refused, not run

**Branch**: `003-fix-weather-station-fatal` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-weather-station-fatal/spec.md`

## Summary

`designConditionsFrom` in `src/model.js` reads a station's two design days out of
its DDY. It fails in two ways at once, and a survey of 120 sites says how far
each reaches.

It looks for one exact name per season and, failing that, takes the first design
day of the right `day_type`. For 51 of the 120 sites sampled, the named annual
cooling day it asks for is not published at all, so the fallback runs. For 39 of
those it lands on a real annual cooling day of a different severity and humidity
basis, which works but is not what the plate then letters. For the other 12 there
is no annual cooling day in the file whatsoever, and the fallback reaches a
**January** monthly day. That day carries the text `N` where onebuilding had no
number to publish, and `N` in a numeric field is what stops the engine.

The fix is three changes in one reader, plus the refusal path that already exists
around it:

1. **Candidates are declared, ordered, and annual.** A named list of acceptable
   annual heating and cooling design days, most-wanted first, all at the severity
   the sheet claims. A monthly design day is never a candidate, which is what
   closes the fatal.
2. **A candidate must parse.** Every field the schema types as numeric must hold a
   finite number, checked against the schema itself. The first candidate that
   passes is taken; when none does, the station is refused whole through the
   refusal path `choose` already has.
3. **The plate letters the day it actually got.** `designDayDatums` hard-codes
   `1% clg db` for every cooling day. With a family of candidates that becomes a
   claim about the wrong object, and it is already wrong today for the 39 sites
   the fallback rescues.

Nothing about the model, the link format, or the solve loop changes. The refusal
gains the one thing it lacks: somewhere to go next, which for the reported station
has to be a nearby site, because all five of its published periods are broken the
same way.

## Technical Context

**Language/Version**: JavaScript, ES modules, no build-time type system. Browser
ES2022 plus Node 22 for the verification harnesses.

**Primary Dependencies**: `@idfkit/core` (`parseIdf`, `IDFDocument`),
`@idfkit/schemas` (field types, and `@idfkit/schemas/node` for the harness),
`@idfkit/weather` (station index, archive fetch and unzip). No dependency is
added; the schema field type this fix reads is already loaded on the page.

**Storage**: none. The station and its window ride the URL fragment, as today.

**Testing**: no test runner exists. Verification is throwaway Node harnesses in
the scratch directory, then driving the page, per the constitution's quality
gates. The survey harness written for Phase 0 is the regression check.

**Target Platform**: static site, modern browsers, EnergyPlus 26.1.0 compiled to
WebAssembly running in the reader's own machine.

**Project Type**: single-page client-side application, vanilla ES modules.

**Performance Goals**: the check adds no network request, since the DDY is
already unzipped in memory beside the EPW. Parsing is the cost already paid; the
numeric sweep is a few dozen field lookups over at most a handful of candidate
objects, against a design-day solve of about 50 ms. Target is unmeasurable.

**Constraints**: no run-time dependency may be added; the refusal must read at
390 px; the candidate list must be declared once and read by everything that
letters it.

**Scale/Scope**: 17,330 sites and 69,638 published archives are reachable from
the picker. The survey puts the affected population at roughly 200 sites, all in
the custom `99xxxx` band, and the code change at two functions in `src/model.js`
and one path in `src/main.js`.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. No violations.*

| Principle | How this change stands against it |
| --- | --- |
| **I. Everything runs in the browser** | No new request, no service, no upload. The DDY being checked already arrived in the archive the reader asked for. |
| **II. Deterministic and shareable** | The link format is untouched: no key is added, renamed or re-defaulted, so `LINK_VERSION` stays at `v1` and `MIGRATIONS` stays empty. A link naming a refused station is refused whole by `refuseLink`, which already exists. The candidate order is a frozen declaration, so the same station resolves to the same design day in every browser and at every hour. |
| **III. Read it back off the model** | Strengthened in the one place it was broken. The datum label stops being a constant and becomes a reading off the chosen design day. The numeric check is read off the schema rather than restating a list of field names. |
| **IV. No silent fallbacks** | This is the principle the bug violates, twice. The nearest-match by `day_type` becomes a declared, ordered, lettered choice, and an unreadable value stops being passed on. When nothing qualifies the station is refused whole, with the reason in place, which is what `choose`'s `refuse` already does. |
| **V. Only `@idfkit/*` at run time** | No dependency added. `schema.field(...)` is already on the page. |
| **VI. Latency is the interface** | No new engine run, no new download, no new await. The work is a handful of field lookups inside a parse that already happens. |
| **VII. Mobile-first and responsive** | The refusal and its offers are the picker's own list and note, which are already built for 390 px. The offers are buttons in the list, so they are reachable without hover, as the constitution requires. |

Two workflow gates apply and are carried as tasks rather than assumed:

- **Gate 6, the general notes.** `NOTES` in `src/tour.js` teaches attaching a
  station. What that step teaches does not change, so no copy change and no
  storage-key bump is expected, but the notes are read against the new refusal
  before this is called done.
- **Gate 8, the design system.** A refusal that carries its next step is a
  component pattern this page has not had, so it is recorded in
  `.interface-design/system.md` in the same change, beside `Absence is not zero`
  and `Comparison is refused unless it is like for like`.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-weather-station-fatal/
├── plan.md              # This file
├── spec.md              # The specification
├── research.md          # Phase 0: the survey and the three decisions it forced
├── data-model.md        # Phase 1: the declarations and what they hold
├── quickstart.md        # Phase 1: how to prove this works, outside the browser and in
├── contracts/
│   └── design-conditions.md   # The reader's contract and the refusal's
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output, not created here
```

### Source Code (repository root)

```text
src/
├── model.js       # designConditionsFrom (the reader), designDayDatums (the label),
│                  # and the new DESIGN_DAYS declaration they both read
├── main.js        # choose(): the refusal already here, now carrying its offers;
│                  # the stale comment above renderTrace about "99% heating and
│                  # 1% cooling drybulb"
└── tour.js        # read against the new refusal; no change expected

.interface-design/
└── system.md      # the new component pattern: a refusal that carries its next step
```

**Structure Decision**: no new module. The declaration belongs in `src/model.js`
beside the reader that consumes it, not in `src/controls.js`, because it is not a
control: nothing about it is a parameter, it reaches the link nowhere, and the
reader is the only consumer besides the labeller two functions below it. The
refusal's offers belong in `src/main.js` because that is where the picker,
`nearestSites` and the panel already live, and `choose` already holds the `row`
whose other periods are the first offer.

## Complexity Tracking

No constitution violations, so nothing to justify.

One judgement worth recording anyway, because it is where this plan is most
likely to be argued with: the candidate list is names, and names are a
convention rather than a structure. `SizingPeriod:DesignDay` carries no field
saying whether a day is annual or monthly, so the only signal is that
onebuilding writes `Ann Htg` and `Ann Clg` into the name. That is safe here
because every archive the picker can reach comes from onebuilding, and the
survey found the heating name in 120 of 120 sites. It would stop being safe the
day this page accepts a DDY from anywhere else, which is worth a comment at the
declaration rather than a mechanism today.
