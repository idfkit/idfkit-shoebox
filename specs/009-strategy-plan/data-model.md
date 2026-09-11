# Phase 1 data model: The strategy plan

Every entity is a frozen class with a constructor that throws on an inconsistent shape, following the house rule (typed objects over dictionaries, Principle IV) and the precedent of `Reading` in `tm59.js`, `Coverage` and `PullEntry`. Entities whose field is *either* a value *or* a reason carry both and throw when both or neither are set, which makes the em-dash rule structural.

Module ownership: **S** is `src/space.js`, **T** is `src/strategy.js`. Both are DOM-free and engine-free.

## The design space (S)

### `FaceRole`

The role one key plays in the design space. One per key in `ALL_KEYS`, asserted at load to cover every key exactly once (SC-011).

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | a key `controlFor` resolves |
| `role` | `'varied' \| 'door' \| 'held'` | |
| `dimension` | integer or null | set iff `role === 'varied'`; its index in `DIMENSION_ORDER` |
| `reason` | string or null | set iff `role === 'held'`; one sentence, the group's reason (research.md section 1) |

### `DIMENSION_ORDER`

Frozen, **append-only** list of sweepable face keys. Asserted at load: every sweepable face on an eligible channel appears exactly once, and nothing else appears. A key removed from the desk is not deleted from the list. It is marked retired, so later dimensions keep their indices.

### `Door`

One choice, or one design-element patch state, that leads to other worlds.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | the control key, or `patch:<channelId>` |
| `channel` | Channel | |
| `kind` | `'choice' \| 'patch'` | |
| `settings` | frozen list | the option values, or `[true, false]` for a patch (true is *out*) |
| `stage` | integer 1..5 | from `DESIGN_STAGE[channel.id]` |
| `label(setting)` | function | the world's name in design terms: *Glazing built up from panes*, *With blinds* |

### `World`

One setting of every door, and what is live in it.

| Field | Type | Rule |
| --- | --- | --- |
| `signature` | string | `deskKey` of the held keys and patch only; two worlds are equal iff their signatures are equal |
| `held` | frozen params | every held and door key at its value in this world |
| `patch` | frozen object | patch map, key order identical to `patching()` |
| `live` | frozen list of keys | varied keys that are shown and whose channel is engaged in this world |
| `dark` | frozen list of `{ key, reason }` | varied keys that are not, each with its reason |
| `via` | `{ door, from, to }` or null | the door that leads here from the home world; null for the home world |

**Derived:** `cameAlive(from)` and `wentDark(from)` return the key lists that differ from another world, lettered in words on entry (FR-025, SC-006).

### `Neighbour`

One world one door away, or the reason it cannot be entered.

| Field | Type | Rule |
| --- | --- | --- |
| `door` | Door | |
| `setting` | value | the door's setting in the neighbour |
| `world` | World or null | exactly one of `world` and `refusal` |
| `refusal` | string or null | the channel's own `requires.reason`, verbatim (US2 scenario 6) |

### `Design`

One point of the sequence, made into a whole desk in one world.

| Field | Type | Rule |
| --- | --- | --- |
| `index` | integer ≥ 0 | its index in the sequence |
| `world` | World | |
| `params` | frozen params | the held values from `world.held`, plus every varied key at its snapped sequence value (including keys dark in this world) |
| `u` | Float64Array | normalised coordinates of the live keys, in `world.live` order |

**Invariant (research.md section 2):** for one index and two worlds one door apart, `params` differ in that door's key, and in what its `implies` writes, and in nothing else. Asserted by the harness over every neighbour on the reference desk (SC-007).

### `Probe`

One screening run: a base design with one live control stepped.

| Field | Type | Rule |
| --- | --- | --- |
| `base` | Design | a design with `index < m` |
| `key` | string | a live key |
| `from`, `to` | numbers | on the key's step grid; the pull's step rule |
| `skip` | string or null | set when the control is dark at this base (channel, `when`, `idle`, `Side.reaches`); no run is spent |

## The measurements (T)

### `DesignLedger`

The plan's own record of landed runs, kept beside the scheduler's FIFO cache (research.md section 9).

| Field | Type | Rule |
| --- | --- | --- |
| entries | Map of `signature:index` or `signature:index:key` to `Landed` | |
| `epoch` | integer | bumped on a station change; a landing from an older epoch is dropped |

**Operations:** `land(id, landed)`, `get(id)`, `reprice(transform)`, `clear()`. Cleared only where `studyScheduler.clearAll()` is called.

### `Landed`

| Field | Type | Rule |
| --- | --- | --- |
| `readings` | frozen bag | the same shape as a scheduler cache entry |
| `meterBasis` | object or null | for repricing |
| `failure` | string or null | exactly one of `readings` and `failure`; the engine's reason, never retried (FR-013) |

### `ScreeningEntry`

One control, or one door, for one reading in one world (FR-029 to FR-031).

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | control key or door id |
| `reading` | Reading | |
| `effect` | number or null | mean \|g\| per full range (μ*), in the reading's units; for a door, the median \|Δ\| |
| `signed` | number or null | mean g, or median Δ |
| `consistency` | `{ agree, of }` | integers; `agree ≤ of` |
| `atStance` | number or null | the pull's effect at the stance, scaled per full range; null for a door |
| `words` | `'anywhere' \| 'only here' \| 'nowhere' \| 'reaches nothing'` | `'reaches nothing'` iff every measured g (and the stance effect) is exactly 0 |
| `inert` | string or null | exactly one of `effect` and `inert`; a dark or not-varied entry's reason |

### `Move`

| Field | Type | Rule |
| --- | --- | --- |
| `world` | World | a move is never lettered on another world (FR-026) |
| `reading` | Reading | |
| `rank` | 1 or 2 | |
| `weights` | frozen `{ key, w }[]` | unit vector over `world.live`; oriented so the axis raises the reading |
| `explains` | number | λ_k / Σλ |
| `recipe` | frozen `{ key, word, share }[]` | up to five with `share ≥ 0.05`, `word` is `'higher'` or `'lower'`, then `others` |
| `bases` | integer | how many screening bases it was fitted from, lettered while it grows |

### `Plan`

One reading's view of one world (the strategy plan proper).

| Field | Type | Rule |
| --- | --- | --- |
| `world`, `reading` | | |
| `moves` | `[Move, Move]` or null | null until 4 bases have landed |
| `positions` | Float64Array (2n) | per landed design, `Wᵀ u` |
| `explained2`, `explained1` | number or null | five-fold kNN R²; null with a reason until at least 50 designs have landed |
| `oneMove` | boolean | `explained1 ≥ explained2 − 0.05` |
| `coverage` | `Coverage` | the survey's own class: wanted, measured, gaps (failed runs), unsurveyed |
| `flat` | string or null | set when every landed reading is equal: *This reading does not move across the design space* |
| `terrain` | Terrain or null | |
| `limits` | frozen `{ key, end }[]` | controls at their limit (FR-032b) |
| `kind` | `'design-day' \| 'annual'` | lettered (FR-006) |

### `Terrain`

| Field | Type | Rule |
| --- | --- | --- |
| `lattice` | 40 × 40 Float64Array | NaN on cells below the density floor |
| `bandwidth` | number | the smallest rung that passed the audit |
| `explained` | number | its own five-fold R² |
| `better` | `'lower' \| 'higher'` | from `SENSE`, stated in place |
| `refused` | string or null | exactly one of `lattice` and `refused`; *No smoothing on the ladder keeps every best area honest here* |

**Invariant (SC-003a):** at every local best cell, the designs within one bandwidth read better on average than the designs between one and two bandwidths away. Asserted by the constructor, not merely by the chooser.

### `Island`

A neighbour as drawn on the archipelago.

| Field | Type | Rule |
| --- | --- | --- |
| `neighbour` | Neighbour | |
| `jump` | Jump or null | |
| `plan` | Plan or null | null until its own bases land; the island then shows its matched designs by reading and says its moves are not yet measured |
| `depth` | `'jump' \| 'plan'` | |
| `cost` | `{ runs, seconds }` | stated before an annual island is measured on request |

### `Jump`

| Field | Type | Rule |
| --- | --- | --- |
| `door`, `reading` | | |
| `deltas` | Float64Array | f(world) − f(home) per matched design; only pairs where **both** runs landed |
| `median`, `p10`, `p90` | numbers | in the reading's units |
| `consistency` | `{ agree, of }` | share with the majority sign; exact zeros count as neither |
| `same` | boolean | every delta exactly 0: the door is reported as leading to the same reading and drawn as no island (US2 scenario 7) |

**Invariant (FR-010, SC-007):** constructed only from pairs whose two `Design.params` differ in the door key and its implications, and nothing else. The constructor is handed the pairs, not two lists.

### `Classification`

One control or door for a pair of readings (FR-033 to FR-036).

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | |
| `pair` | `[Reading, Reading]` | ordered as chosen |
| `kind` | `'no-regret' \| 'trade-off' \| 'lever' \| 'free'` | |
| `on` | Reading or null | set iff `kind === 'lever'` |
| `mu` | `[number, number]` | improvement across the control's range, in each reading's units |
| `consistency` | `{ agree, of }` | |
| `levers` | frozen list of keys | set only for a trade-off; only levers that pay back in full |
| `unpaid` | string or null | for a trade-off with no paying lever, the sentence saying so |
| `stage` | integer | for the moves panel's ordering |

There is deliberately **no** field combining the two readings.

### `SweetSpot`

| Field | Type | Rule |
| --- | --- | --- |
| `key`, `reading` | | |
| `at` | number or null | snapped to the step grid; null when refused |
| `consistency` | `{ agree, of }` | |
| `worseEnd` | `{ end: 'min' \| 'max', by }` | in the reading's units |
| `limit` | `'min' \| 'max'` or null | exactly one of `at` and `limit`: a best value within 0.15 of an end is a limit, never a spot |

### `StripTag`

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | |
| `text` | string | built from declared short forms; asserted within the `TAG` budget |
| `free` | boolean | the face takes `.free` |
| `target` | string | the moves-panel entry id the tag's button focuses |
| `stamp` | string | `world.signature` plus the reading pair; `console.js` draws no tag whose stamp is not the current one |

## Declarations (T)

| Name | Shape | Load-time assertion |
| --- | --- | --- |
| `FREE` | reading id to `{ tau, relative?, why }` | covers every reading in `READINGS`; every `why` opens with `CONVENTION` |
| `SHORT` | reading id to short form | covers every reading; every tag combination is within `TAG` |
| `DESIGN_STAGE` | channel id to `{ stage, why }` | covers every unpriced, non-Solver, non-Run channel; every `why` opens with `CONVENTION` |
| `HOLD_REASONS` | group to sentence | every held `FaceRole` resolves to one |
| `MARGIN` | 0.15 | sweet-spot refusal margin, printed with `CONVENTION` |
| `DEPTH` | `{ home: { bases: 16, designs: 512 }, island: { bases: 8, designs: 128 }, jump: 32, first: { bases: 4, designs: 128 } }` | all design counts are powers of two; `jump ≤ island.designs` |

## State transitions

**A plan's lifecycle in one world:** `waiting` (auto-solve off, attach pending, gesture held: the reason is lettered) → `measuring` (first bases and designs landing) → `drawn` (4 bases and 50 designs: moves, positions, share explained) → `complete` (16 bases, 512 designs) → `stale`, when a door is opened on the desk. The ledger keeps everything from a stale plan, and the plan re-enters `measuring` in the new world, where every design already in the ledger is answered without a run.

**An island:** `listed` (refused, with reason) or `queued` → `jumped` (32 matched pairs) → `planned` (its own 8 bases and 128 designs). On an annual desk, `jumped` → `planned` only on request, and the cost is stated first.

## What is deliberately not modelled

- **A combined score of two readings**, anywhere, in any entity (FR-036).
- **A world two doors away.** A `Neighbour` is one door from the home world by construction, and there is no type for a combination (FR-027).
- **A position of an island that means anything.** The archipelago's layout is computed by the view from door order alone and is never stored beside a reading.
- **A terrain figure.** `Terrain` has no accessor that returns a reading at a point; the view paints the lattice and letters nothing off it (FR-019).
