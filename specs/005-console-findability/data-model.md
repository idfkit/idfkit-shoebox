# Phase 1: data model

**Feature**: Console findability | **Branch**: `005-console-findability`

Five entities. Three are new declarations, one is a new piece of session state,
and one is an existing structure gaining a field. Nothing here reaches the IDF,
so nothing here belongs on `params` (Principle VI) and nothing here rides the
link (Principle II's own reasoning about how a desk is read, which already keeps
`pinned` and the chased standard out).

## `Card`

One channel at rest. Not a new declaration — a `Channel` already carries
everything a card letters — but a new *rendering*, replacing `buildStrip`'s
`.strip` section with a grid cell.

| field | source | notes |
|---|---|---|
| `channel` | `CHANNELS` | the declaration, unchanged |
| `index` | `Channel.index` | 01 to 18, the number on the card |
| `name` | `Channel.name` | |
| `blurb` | `Channel.blurb` | today behind the fold; a card shows it closed |
| reading | `api.setReadings` | the folded row's `strip-read` string, now drawn at every width |
| patch state | `api.setState` | the armed marker, `.out` / `.blocked` / `.soloed` |
| blocked reason | `Channel.requires.reason` | stays **outside** the fold, as `.strip-blocked` already does (`console.js:252`) |
| `state` | new, see below | `closed` / `peeking` / `revealed` |

**Validation.** A card must letter its reading, its marker and its blocked
sentence while closed (FR-001, FR-003). This is the existing index-sheet rule —
"closed a row reads, open it is worked" — extended to every width. The machinery
exists but is gated: `.strip-read`, `.strip-mark` and `.strip-chev` are
`display: none` by default and shown only under `.strips.index`
(`index.html:2471, 3239-3285`).

## `CardState`

The one piece of new session state, held per channel.

```
closed    →  nothing shown but the card's own face
peeking   →  open under a fine pointer, for as long as the pointer is on it
revealed  →  open because the reader chose it
```

Transitions, and this table is the whole of FR-004 through FR-007:

| from | event | to |
|---|---|---|
| `closed` | pointer enters (fine pointer only) | `peeking` |
| `peeking` | pointer leaves | `closed` |
| `peeking` | click, tap, Enter, Space | `revealed` |
| `closed` | click, tap, Enter, Space | `revealed` |
| `revealed` | click, tap, Enter, Space | `closed` |
| `revealed` | pointer enters or leaves | `revealed`, unchanged |
| any | search begins | driven by the match, prior state stacked |
| any | search cleared | the prior state, restored |

**Rules.**

- `peeking` is never written to storage and never announced to assistive
  technology (FR-014, FR-015). Nothing was chosen.
- `peeking` is unreachable where `pointer: coarse`, and unreachable from the
  keyboard. Both reach `revealed` directly.
- Only `revealed` is remembered, and only where the layout can hold it (FR-015).
- More than one card may be `revealed`; at most one may be `peeking` (SC-012).

## `Match`

What a search returns. A frozen record per matching **control**, not per card,
because the spec's search reveals controls rather than channels.

| field | type | source |
|---|---|---|
| `key` | string | one of `ALL_KEYS` |
| `control` | `Control` | `controlFor(key).control` |
| `channel` | `Channel` | `controlFor(key).channel` |
| `subject` | `Side` \| `Face` \| null | `controlFor(key).side ?? face ?? null` |
| `label` | string | `labelFor(key)` — already names the wall |
| `on` | string[] | which vocabulary entries matched, for the reader |
| `blocked` | `Blocked` \| null | see below |
| `study` | study \| null | the swept curve, where one stands |
| `stale` | boolean | the curve no longer describes the desk |

**`Blocked`** is the four-way answer FR-023 demands, and the four are genuinely
different questions already answered by four different mechanisms:

| reason | read from | sentence |
|---|---|---|
| channel patched out | the patch bay | "Air is patched out." |
| channel's precondition unmet | `Channel.requires.reason(params, on, off)` | the channel's own sentence |
| belongs to the other model | `Control.shown(params)` is false | the strip's selector is what brings it back |
| inert as the desk stands | `Control.idle(params)` is true | the control above it is what revives it |
| a wall that reaches nothing | `Side.reasonFor(params)` | per wall, four different sentences |

Note the fifth row: a `Facade` key can be unreached for its own reason, and
`Side.unreached` may be a function precisely because one sentence could not say
which of four walls is inert. A match on a wall key takes its sentence from
there.

**Validation.** `blocked` must be `null` or carry a sentence. A `Match` with a
`blocked` and no sentence is the silent fallback Principle IV forbids, and should
throw rather than render an empty explanation.

## `Vocabulary`

The searchable text, derived from the declaration and from nowhere else
(FR-019). Built once at mount, never hand-maintained.

Per key, the strings that may match:

| kind of string | from | count |
|---|---|---|
| control label | `labelFor(key)` | one per key |
| channel name | `Channel.name` | 18 |
| landmark names | `Landmark.label`, `Landmark.phrase` | 159 attachments |
| selector options | `Selector.options[].label` | 92 |
| zero-stop label | `Ruled.zero` | 22 |
| unit | `Ruled.unit` | 18 distinct |
| subject | `Side.label`/`.side`, `Face.label`/`.face` | per wall and face |

486 distinct strings, 6,002 characters (research M-vocabulary). A linear scan is
the implementation; there is no index to build.

**Validation.** Every one of `ALL_KEYS` must appear in the vocabulary with at
least its own label (FR-020, SC-003). This is assertable at module load in the
manner the codebase already prefers — `readLandmarks`, `assertHideable` and the
permalink's reserved-key check all throw at load rather than degrade — and it is
what stops a new control kind silently becoming unfindable.

## `Edit`

One control sitting off its default, or one channel patched away from its
default. Measured on demand, never recorded (FR-033).

| field | source |
|---|---|
| `key` | `ALL_KEYS` |
| `value` | `params[key]` |
| `base` | `DEFAULT_PARAMETERS[key]` |
| `label`, `channel`, `subject` | as `Match` |
| `formatted` | `formatValue(key, value)` and `formatValue(key, base)` |

Channel edits carry the channel and its default bypass state instead of a key.

**Validation.** The count must equal the identity diff `encodeState` takes
(`permalink.js:171`), because they are the same question: what did the reader
change. If a link round-trips *n* keys, the edit list shows *n* entries (SC-015).
That equivalence is the cheapest possible test of this entity and it runs
headlessly.

## What is deliberately not an entity

- **A search index.** 6 KB of vocabulary needs none, and building one would be a
  second copy of the declaration.
- **A "current search" on `params`.** Anything on `params` starts a run
  (Principle VI). The query is session state beside the card states.
- **A record of what the reader has changed.** `Edit` is derived on each ask, for
  the same reason `conformance()` is: a flag can go stale, a measurement cannot.
