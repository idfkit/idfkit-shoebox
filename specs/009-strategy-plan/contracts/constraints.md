# Contract: constraining the design space

Added 2026-09-11 (FR-049 to FR-057, research.md sections 24 to 26). A constraint narrows what is **sampled and run**, not what is drawn. It belongs to the desk rather than to a world, it rides the link, and setting one is a re-cut rather than a filter.

Ownership: the declarations and the region arithmetic go in `src/space.js`, beside the roles, the doors and the sequence, because the region binds inside `variedAt` and that is the one place a design's values are made. The codec is `src/permalink.js`, the face is `src/console.js` and `src/field.js`, the summary is the panel's part 1.

## Types (`src/space.js`, frozen, throwing constructors)

See data-model.md for the fields. `Bound` is one numeric range, `RuledOut` is one door's excluded settings, and `Region` is every constraint in force plus the arithmetic that binds them.

## Exports

### `new Bound({ key, from, to })`

Throws, naming the thing that was wrong, when:

- `key` is not a `Scale` or a `Facade` side. `Bearing` and `Profile` carry no `min`, `max` or `step` of their own (their ranges are literals inside `refuses`, `src/controls.js:1631` and `:1634`), so they are not constrainable and say so.
- `from` or `to` is not finite, or lies outside the control's own face.
- `to < from`. `to === from` is accepted: pinning is the degenerate case FR-055 names.
- **No position on the control's own step grid lies inside `[from, to]`.** This is new validation, not a reuse: `refuses(control, value)` deliberately does not require step alignment (`src/controls.js:1622`). The refusal names the step, because that is the fact the reader needs.

### `new RuledOut({ door, settings })`

Throws when a setting is not one of the door's own, and when `settings` names **every** setting the door has: a door with no world left behind it is refused whole, naming the door.

### `new Region(constraints)`

The constrained design space. `Region.EMPTY` is the unconstrained one, and every function below takes a `Region` so that no call site has a second path for "no constraints".

| Member | Answers |
| --- | --- |
| `spanOf(key)` | `{ from, to }`, the control's own face where no bound binds it |
| `admits(key, value)` | whether one value is inside the region |
| `allows(door, setting)` | whether a door setting is still a world |
| `stateOf(key)` | the sentence lettered beside a figure (FR-052, SC-018), naming the span |
| `signature` | the string that joins the memo key and the link, stable under key order |

### The three binding sites

All three are inside `src/space.js` and all three take the region. Missing any one of them produces figures that are arithmetically correct and about the wrong span.

1. **`snapped(control, u, span)`** (`src/space.js:314`). Bins `u` inside the span, not the face. It keeps equal-probability binning, offset to the span's low stop, so the span's own rim stops are not sampled half as often as its interior. **Every value it returns still lies on the control's own global step grid**, anchored at `control.min` and never at `span.from`, which is what `samplePoints` already does (`src/study.js:140`) and what makes SC-017 true: every design a region can produce is one the unconstrained space could have produced too, so a desk measured under one region and the same desk measured under another are one cache entry. The identity is between equal desks, never between equal indices.
2. **`designAt`'s normalisation** (`src/space.js:669`). `u[at]` is the position within the **span**, not `Ruled.fraction`'s position within the face, because FR-052 letters an effect per the constrained span and the moves are fitted over this `u`.
3. **`probesAt`'s step** (`src/space.js:748`). A twentieth of the span rather than of the range, with the room test against the span's bounds, so a probe cannot step out of the region the plan says it measured.

### The memo key carries the region

`variedAt(index)` is memoised in `VALUES` keyed by the index alone (`src/space.js:628`). The key becomes `index` plus `region.signature`. Without it, a constraint committed after a design was generated hands back the unconstrained value, and the design is drawn inside the region, keyed as if it were inside the region, and is a building from outside it. There is no symptom. Principle II is the rule it breaks.

### `neighboursOf(world, region)`

A ruled-out door setting is dropped before a world is built for it, so it is never measured (FR-055). It is listed as **ruled out by the reader**, which is a different sentence from a world the engine cannot enter, and both lists stand (FR-043).

## The four refusals, and the two that are not refusals

| Case | Answer |
| --- | --- |
| A region narrower than the control's own step | Refused whole, naming the step |
| Every setting of a door ruled out | Refused whole, naming the door |
| The region excludes the desk's own stance | **Kept.** The stance mark stands outside it and says so. The region is never widened to take it back in, which is `axisFor`'s own rule (`src/survey.js:306`): a reader who constrained past where they are standing has said so |
| A constraint on a control dark in this world | **Kept**, and stated as reaching nothing here, exactly as a dark control's effect is. It binds again wherever the control comes alive, so stepping into a world cannot quietly widen the region |

## Commit, and what it does not do

Committing, changing or removing a constraint (FR-056):

- takes effect **at once** in what is drawn, re-lettering every figure from the designs the ledger already holds inside the new region;
- **queues no run by itself.** The runs that would fill the region are offered with their count and their time, and queued only when the reader asks, which is the consent pattern the annual cost and each island's *Measure this world* already use;
- keeps every design measured outside the new region in the ledger, stated as ruled out and left out of every figure (FR-050). Nothing is deleted, so widening the region again is free, and gate 15 confirms it: widening back ran nothing at all. Narrowing is the other way about and costs a fresh sample, so its offer states the whole count rather than a remainder.

A binding constraint (FR-057) is read off the measured designs inside the region, so saying that it binds is always honest. What relaxing it would buy is lettered **only** from completed runs outside it that the ledger already holds; where it holds none, the panel offers to measure a probe just outside with its cost stated first, and never extrapolates.

## The face (FR-053, FR-054)

- Bounds are **typed**, on the control's own face, through `quantityField` (`src/field.js:33`), which is the surface the survey's extent boxes already use (`src/main.js:8907`). Two boxes for a range is an existing component pattern.
- The disallowed part of the face is drawn as disallowed, in the console strip and in the panel alike. It is not a hover state: `pointer: coarse` has no hover.
- Every active constraint is stated again at the head of the panel's sequence, each naming its control and its bounds, each removable there, and all removable at once.
- A field built and appended alone stands empty, so each calls its own `show()`, and the redraw that rebuilds the summary must not destroy the node the reader is typing into. That is the defect `renderSurveyChoose` already carries a signature guard against (`src/main.js:8940`).

## The link key `cn` (research.md section 26)

    cn    = entry *( "*" entry )
    entry = bound / ruled
    bound = key "_" from "_" to
    ruled = key "_" setting *( "." setting )

`RESERVED` becomes `['in', 'out', 'stn', 'win', 'at', 'sty', 'sv', 'sp', 'cn']`, keeping its load-time assertion against `ALL_KEYS` (`src/permalink.js:98`). It is read in `decodeState` **beside `sv` and `sp`**, above everything `readValue` does: the numeric regex runs before the per-kind switch (`src/permalink.js:448`), and the single-claim loop skips `RESERVED` before calling `readValue` (`:594`). This is the fourth time this trap has been recorded and the third time it has been written down before being hit.

Two load-time assertions make the grammar unambiguous, since a bound and a ruled entry are told apart by shape:

- no door setting is a bare number;
- no door setting contains `_`.

A patch door's internal id is `patch:<channelId>` (`src/space.js:66`) and `:` is escaped by `URLSearchParams`, so the **channel id alone** is the link's spelling, asserted at load not to collide with any control key.

`encodeState` writes `cn` only where a constraint is in force, and re-serialises what `decodeState` read, so two spellings of one region cannot key two identical states. `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty.

Refusals are whole, with the reason on the sheet: an unknown key or setting, a bound that fails `Bound`'s own rules, a door with every setting ruled out, a malformed entry, and a key the desk does not own.

## Harness (`verify/constraints.mjs`, no engine)

1. Every `Bound` and `RuledOut` refusal class throws, naming the thing that was wrong, and a sub-step region names the step.
2. **Every design of a constrained region lies inside it** (SC-016), over at least 100 designs and every ruled-out door, and every value is on the control's own step grid.
3. **The grid is region-independent** (SC-017): every value `designAt` returns under any region lies on the control's own step grid anchored at `control.min`, so a constrained design is a desk the unconstrained space could also have produced and two identical desks key one cache entry. It is **not** true that one index gives one design under two regions: `snapped` bins into the span, so design *i* under a narrower region is a different design, which is the whole of FR-049. Measured on 300 designs of the reference desk: 121 had their unconstrained `wallR` admitted by a 2 to 6 region and none of the 121 was byte-identical under both. What a re-cut saves is therefore the designs whose params happen to coincide, which is a share gate 15 measures rather than an identity this contract can promise. **Measured, that share is zero**: gate 15 narrowed `wallR` to about half its face over 64 designs and reused none of them, because a region binding one control leaves every other varied key identical and reuse would need one index to snap to the same value under both bins. Narrowing therefore costs full price and only widening back is free, which is why the cost of a re-cut is offered to the reader as a fresh sample rather than as a top-up.
4. The memo carries the region: generating a design, committing a constraint and generating it again returns the constrained value, not the cached unconstrained one.
5. A ruled-out door produces no `Neighbour` and one listed reason; a door with every setting ruled out is refused whole.
6. `cn` round-trips every entry shape, and every refusal class is refused whole. `sv`, `sp` and `cn` together round-trip. A pre-feature corpus decodes byte-identically.
7. Effects and shares carry their region: two regions over one control produce the same words and different numbers, and neither is lettered without `stateOf` (SC-018).
