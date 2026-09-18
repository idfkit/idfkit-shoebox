# Quickstart: verifying "Attach a Weather File"

There is no test runner and no linter. Verification is throwaway Node harnesses over
the real DOM-free modules, then IDFs written and run, then the page driven — the
constitution's ten workflow gates, in the order they catch things.

Harnesses live in `specs/012-attach-weather-file/verify/`, beside the ones feature 011
left. They import from `src/` directly; nothing is copied.

## Before anything

```bash
npm install
npm run dev          # predev stages the engine, the schemas and the station index
```

**You need a real EPW, and more than one.** Every figure in
[research.md](./research.md) was measured over a *synthetic* file and is re-measured
here. Use at least:

| file | what it proves |
| --- | --- |
| a TMYx EPW saved from the station picker | an attached file and the same station picked give identical readings (SC-003) |
| a licensed CIBSE DSY1, if you hold one | the feature's actual subject: a UK place, a file that may declare a DST rule, no DDY beside it |
| any EPW with CRLF line endings, and the same file converted to LF | the fingerprint rule (R5) |
| a leap-year EPW, or one edited to carry 29 February | the attach gate refuses it in `dailyMeans`' own sentence |

A file that cannot be had is a gate you say you did not run, not one you assume passed.

---

## Gate 1 — the measurements, on a real file

Re-measure what research assumed, over each real EPW: raw size, gzip size, base64
length, `localStorage` cost, SHA-256 time, gzip and gunzip time, `dailyMeans` time.

**Passes when** the stored form of a typical bought file fits comfortably inside the
`~5 MiB` quota alongside the kept schemes and the general notes, and nothing on the
attach path lands inside a gesture. **Fails loudly** if a real file compresses far worse
than the synthetic 22.3 % — the remembering budget, and FR-021's "told about, not worked
around", both depend on it.

Record what you measure in `docs/design-notes.md`, replacing the synthetic figures.

## Gate 2 — the schema's field names

Before anything writes `Site:Location` from an EPW: confirm `latitude`, `longitude`,
`time_zone` and `elevation` against the 26.1.0 schema
(`schema.field('Site:Location', name)`), and confirm the type of each is what
`siteLocationValues` writes.

**Passes when** each name resolves. CLAUDE.md's rule is the point of this gate: field
names drift between versions and the DDY path never had to name them, so this is the
first time these four are spelled out in this repository.

## Gate 3 — the readers, over real files

Node, DOM-free, no engine:

- `readLocation` over every real EPW, and over a file with no LOCATION record, a file
  with empty fields, and one with onebuilding's bare hyphens. Every absence comes back
  `null`; nothing throws.
- `periodCovered` over a whole year, a part year, and a sub-hourly file.
- `dailyMeans` over the leap file and a file with a record deleted from the middle of
  April: each refusal names the day.
- `degreeDaysOf` against the index's published HDD18/CDD10 for the same TMYx station.
  They will not match exactly — the index's are published, these are measured — and the
  gate is that they are *close*, and that the reading says which it is.

## Gate 4 — the fingerprint

- The same file CRLF and LF: **equal**.
- The same file with and without a trailing newline: **equal**.
- One character changed inside a data field: **unequal**.
- A field's internal whitespace changed: **unequal**.
- The browser and Node, over the same bytes: **equal**. (Run it once in the page
  console and once under Node.)
- Every output matches `[A-Za-z0-9_-]{16}`.

## Gate 5 — the model, written and run

The constitution's gates 1 to 3, and this is where a plausible design dies if it is
going to:

1. Build the document at several desk positions against each real file, write each IDF,
   and run it — EnergyPlus 26.1.0 locally, or the staged WASM engine under Node, **one
   run per process**.
2. **Idempotence**: `applyModel` three times, byte-identical output, with a file
   attached and with a file attached that carries no DDY.
3. A desk that had design days and lost them serialises **identically** to one built
   without them.
4. Each IDF through `load_model`, `validate_model`, `check_model_integrity`,
   `run_simulation`.
5. Grep `eplus.err` for "requested but not generated", and for any warning naming a
   sizing period on the no-DDY desk.

**The no-DDY case is the one to watch.** `model.js:2329` says nothing here is
autosized, and this gate is where that claim is tested rather than trusted: a run with
no `SizingPeriod:DesignDay` and `run_simulation_for_sizing_periods: 'No'` must complete
with no fatal and no severe.

## Gate 6 — the link, round-tripped

Under Node, over the real codec:

- A desk with a file attached: encode → decode → re-encode, byte-identical, with a
  `wfd` carrying commas, spaces and `·`.
- Each malformed class refused whole, with the reason: `wfd` without `wf`, `wf` with
  `stn`, a malformed `wf`, each key repeated.
- Every link minted before this feature decodes to exactly what it decoded to before.
  Keep the `links-before.json` habit feature 011 established: mint a corpus on `main`,
  decode it on the branch, and diff.
- `LINK_VERSION` is still `v1` and `DEFAULTS_BY_VERSION` is unchanged.

## Gate 7 — the criteria, over an attached file

- All five criteria over a real DSY, against the same arithmetic run over a TMYx year:
  the numbers differ, the code path does not.
- A file not covering 23–29 April: criterion a is an em dash carrying the seed-week
  reason; b and c still read (their thresholds are fixed).
- A file not covering 1 May – 30 September: each affected criterion is an em dash
  naming the missing period, and **nothing is computed over a shortened period**.
- The weather qualification prints the file's own declaration beside
  `WFR_REQUIREMENT`, and asserts no relation.
- The local-time qualification says what *this* file's `HOLIDAYS/DAYLIGHT SAVINGS`
  record declares, in both states, and agrees with what `applyRun` wrote for `dst`.
- `TM59_SPACES` still equals `PROFILE_IDS`; no threshold moved.

## Gate 8 — the page, driven

A design day solves in about 50 ms, so drive the whole desk rather than a corner of it.

1. Attach each real file. Title block, site line, datum lines (or their stated absence),
   degree days, period, holidays.
2. Attach a TMYx file by hand and pick the same station from the list: **identical
   readings at five desk positions** (SC-003).
3. Attach while a run, a study and a survey are all in flight: the work in flight is
   abandoned, and no curve, spot height or priced figure from the outgoing climate
   survives (FR-005).
4. Swap file → station → file three times. Same check each time.
5. Every refusal the feature can produce, provoked deliberately: a PDF, a truncated
   EPW, a leap file, a DDY for another city, a mismatched fingerprint, a full quota.
   Each names what was missing, in view, with the previous climate untouched.
6. **At 390 px**, with a coarse pointer: the attach control, the remembered line, the
   forget action, the waiting-desk sentence and each refusal are all readable without
   opening a fold and without hovering. Folded controls leave the tab order.
7. The units toggle, in both directions, with a file attached: every figure re-letters,
   nothing re-runs, and the fingerprint, the period and the place are unchanged.
8. A background tab: force a paint before believing any E-02, pull or survey figure —
   CLAUDE.md's rAF trap, which this feature does not change but which will otherwise
   waste an afternoon.

## Gate 9 — nothing leaves the machine

The claim the whole feature rests on, so it is verified rather than asserted.

With the network panel recording from before the file dialog opens, run a full session:
attach, solve, open a study, open a survey, mint a link, copy it, download the bundle,
open the Report and hand it off.

**Passes when** no request carries any part of the file, its name, or anything derived
from it (SC-002), and when a desk on an attached file makes **no `/onebuilding` request
at all**. Read the hand-off's pre-filled address too, not just the request list: the
report's text is the thing that leaves, and the gate is that it carries nothing from the
file beyond what the sheet letters in view.

## Gate 10 — what the change owes the rest of the repo

Not optional, and easier now than in review:

- `src/copy.js` budgets: every new always-visible string asserted at load.
- `src/tour.js`: `NOTES` updated, the call sites with them, and
  `shoebox-general-notes-v4` → `-v5`.
- `.interface-design/system.md`: the file-attach control and the remembered line
  recorded as patterns, in this change.
- `docs/design-notes.md`: a section carrying gate 1's real measurements, the
  fingerprint rule, and the Principle II reasoning behind R9.
- `CHANGELOG.md`: the entry, since the sheet reads it back.
- The self-check (`.github/workflows/check.yml`) still passes: no governed package
  moved, so the consumer register is untouched.
