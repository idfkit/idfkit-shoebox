# Contract: the finder

**Module**: new, `src/finder.js` | **Consumed by**: `src/console.js`

DOM-free and network-free, by the rule `readings.js`, `describe.js` and `tm59.js`
already follow, so the Node harness calls the real functions rather than a copy
of them. It imports only `src/controls.js`.

## Shape

```js
buildVocabulary()                    // → Vocabulary, once, at module load
find(vocabulary, query, params, bypass, { studies })   // → Match[]
edits(params, bypass)                // → Edit[]
```

`find` returns matches in **declaration order** — channel 01 to 18, and within a
channel the order the controls are declared. Not by relevance score: the desk's
order is physical order, and a reader who searches `air` and gets Fabric's
infiltration above Air's own controls has been told something false about the
building. Where the reader wants ranking they have the channel names in front of
them.

## Matching

A query matches a key when any string in that key's vocabulary contains the
query, compared case-insensitively and with punctuation and whitespace
normalised (FR-022). Partial words match; `wall` finds `Wall U-value` and
`West wall`.

Empty or whitespace-only query returns `[]`, which `clearSearch` distinguishes
from "no matches" — the first restores the desk, the second says so in place
(FR-025, FR-026).

**No fuzzy matching, no stemming, no synonyms.** Every one of those invents a
vocabulary the declaration does not contain, and a match the reader cannot
account for is worse on this page than a miss they can retype past. The
vocabulary is 486 strings; the honest fix for a term that finds nothing is to
say so.

## `Match.blocked`

Computed in this order, first hit wins, because the outer reasons subsume the
inner ones:

1. `bypass[channel.id]` → patched out.
2. `channel.requires` and its `test(params, on, off)` fails → the channel's own
   `reason`, which may be a function and may name any of three causes.
3. `control.shown(params)` is false → belongs to the other model.
4. `control.idle(params)` is true → inert as the desk stands.
5. the key is a `Facade` wall and `side.reaches(params)` is false →
   `side.reasonFor(params)`.

Each carries a sentence. A `Blocked` without one throws (Principle IV). A match
is **never dropped** for being blocked — 66 controls carry `when` or `needs` and
could be in one of these states at any moment, and a finder that hid them would
answer "there is no such control" to a reader looking straight at it.

## `edits`

Walks `ALL_KEYS` with the same identity comparison `encodeState` uses
(`permalink.js:171`), plus the channels whose bypass differs from
`DEFAULT_BYPASS`. Returns declaration order. Measured on every call; nothing is
cached, and there is no listener anywhere that records an edit as it happens.

## Assertions at module load

Following `readLandmarks` and `assertHideable`, which throw at load rather than
degrade:

1. Every key in `ALL_KEYS` has at least its own label in the vocabulary. A
   control kind added without teaching the finder fails at mount, loudly, rather
   than becoming quietly unfindable.
2. No vocabulary entry is the empty string, which would match every query.

## What this module may not do

Import anything from `console.js`, `main.js` or the DOM. Read the document, the
run or the readings — a match is about the declaration and the parameters, not
about a result. Start anything.
