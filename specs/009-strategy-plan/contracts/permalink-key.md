# Contract: the `sp` key in `src/permalink.js`

## Grammar

    sp = reading [ "." reading ]
    reading = a series id in READING_BY_ID

Examples: `sp=high`, `sp=high.low`, `sp=eui.overheat`.

`.` is chosen for the reason `sv` chose it: `URLSearchParams` leaves only `*`, `.`, `-` and `_` unescaped, and a series id contains none of them.

## Where it is read

In `decodeState`, **beside `sv` and `sty`**, before any pair reaches `readValue`. `RESERVED` becomes `['in', 'out', 'stn', 'win', 'at', 'sty', 'sv', 'sp']`, and the existing load-time assertion against `ALL_KEYS` covers it. A branch written inside `readValue`'s per-kind switch would be unreachable behind the numeric regex, and every plan link would be refused as *is not a number for sp*. This trap is the reason reserved keys are read where they are.

## Refusals (whole link, with the reason on the sheet)

- an id not in `READING_BY_ID`;
- more than two ids, or the same id twice;
- an empty value, or a trailing `.`;
- an id the desk cannot offer at all, through `surveyReadingOffers` for the linked desk, with that offer's own `reason` and `fix`, as the survey's refusal already does (US5 scenario 3).

## Encoding

`encodeState` writes `sp` only when a plan is open, and re-serialises what `decodeState` read, so `sp=high.low` and any other spelling of the same pair produce one string. Measured values, strip tags, visited worlds and islands measured on request do **not** ride the link (FR-045, research.md section 11).

## Versioning

`LINK_VERSION` stays `v1`, and `MIGRATIONS` stays empty. A link with no `sp` decodes exactly as it did before this feature (US5 scenario 4).

## Harness

`link-roundtrip.mjs` (extended): every reading, and every ordered pair of distinct readings, round-trips exactly; every refusal class above is refused whole; a link carrying `sv` and `sp` together round-trips both; and a pre-feature link corpus decodes byte-identically.
