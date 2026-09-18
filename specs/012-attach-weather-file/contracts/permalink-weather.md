# Contract: what a link carries about a weather file

`src/permalink.js` is the one place this is decided, and it stays DOM-free and
network-free so the round trip is verified under Node over the real codec.

## The keys

| key | value | grammar |
| --- | --- | --- |
| `wf` | the attached file's fingerprint | exactly 16 characters of `[A-Za-z0-9_-]` |
| `wfd` | what the file declares about itself, its own phrase | free text, percent-encoded |

Both join `RESERVED` alongside `in`, `out`, `stn`, `win`, `at`, `sty`, `sv`, and both
are read in `decodeState` **above** `readValue`, where the reserved keys are read. The
existing load-time assertion that no reserved key collides with a control parameter
covers them without change.

`LINK_VERSION` stays `v1`. An added reserved key is the additive case the codec's own
contract describes: every link in the wild omits it, and an omitted `wf` means what it
has always meant — that no file is wanted.

## Encoding

`encodeState` writes `wf` and `wfd` where the desk's source is a file, and `stn` / `win`
where it is a station, and never both. A desk with no source writes neither. The pair is
written in that order, after the patch lists, so a minted link reads in a stable order
and the identity diff is unaffected.

`wfd` is `WeatherFile.declares` verbatim — the file's own words, not a tidied version of
them. It is lettering carried in a link, never matched against; only `wf` decides
whether a file is the right one.

## Decoding, and the order the refusals run in

Each refuses the link whole, naming what was wrong, per the codec's standing rule:

1. **Repeated key** — the existing check, which runs before the reserved skip, covers
   `wf` and `wfd` unchanged.
2. **`wfd` without `wf`** — *a file's declaration ("wfd") with no fingerprint ("wf") to
   match a file against*.
3. **`wf` with `stn`** — *a weather file ("wf") and a station ("stn") on one desk, and a
   desk has one weather source*.
4. **`wf` malformed** — *"…" is not a weather-file fingerprint*.

The wording follows `win`-without-`stn`, which is the same shape of error and already
reads correctly.

## What the decoded scheme carries

`decodeState` returns `{ params, bypass, station, pin, … }` today. It gains `file`,
which is `{ fingerprint, declares }` or null, and `station` stays null whenever `file`
is set — the two are mutually exclusive by the refusal above, so no consumer has to
decide between them.

## What honouring it does

Stated here because it is a property of the link, not of the interface:

- Every parameter, patch, pin, study and survey the link carries is applied.
- The desk's shipped design days are **removed**. A desk told which file it needs must
  not solve Denver's design days under that file's title block (research R7).
- Nothing is solved, and every reading that needs a year is absent, with the reason in
  view and the wanted file named in its own words.
- Where the browser remembers a file whose fingerprint equals `wf`, it is attached
  immediately and the desk solves — which is what makes an ordinary reload work
  (research R9).
- Where the reader attaches a file whose fingerprint differs, the link's `wfd` and the
  file's own declaration are both printed, and the reader is offered the file on a fresh
  desk instead.

## Round trip

The standing rule: every key the encoder writes is a key the decoder reads back, and the
existing load-time assertion enforces it. For these two that means a desk with a file
attached encodes, decodes and re-encodes to a byte-identical fragment, including a
`wfd` carrying commas, spaces and the `·` separator `declares` uses.
