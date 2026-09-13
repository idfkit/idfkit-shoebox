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

## Added 2026-09-11

### `PoolWidth` (`src/pool.js`)

How many engines run side by side, and which term decided it (FR-011a, research.md section 17).

| Field | Type | Rule |
| --- | --- | --- |
| `cores` | integer ≥ 1 | `navigator.hardwareConcurrency` as reported, 4 where absent |
| `memoryGB` | number | `navigator.deviceMemory` as reported, capped at 8 |
| `assumed` | boolean | true where the browser reported no memory and 4 GB was assumed |
| `byCores` | integer | `cores − 2` |
| `byMemory` | integer | `floor((memoryGB × 1024 / 2 − 256) / 256)` |
| `width` | integer ≥ 1 | `max(1, min(byCores, byMemory))`; no fixed cap |
| `why` | string | the binding term in words, lettered where the plan states a cost |

### `Campaign` (`src/main.js`)

The plan's queued runs, as the reader controls them (FR-012a, research.md section 18). Held on `strategyPlan`, and handed to the view as a frozen snapshot.

| Field | Type | Rule |
| --- | --- | --- |
| `state` | `'running' \| 'paused' \| 'cancelled'` | see *State transitions* |
| `world` | string | the world signature the campaign was last queued for; a new signature ends a `cancelled` state |
| `waiting` | integer ≥ 0 | runs queued and not started, held or not |
| `inFlight` | integer ≥ 0 | plan runs on an engine now; they land whatever the state |
| `withheld` | integer ≥ 0 | the neighbours' runs held back until the home world's first depth lands |

A job of origin `'strategy'` carries `held: boolean`; the scheduler's `takeNext` never dispatches a held job.

### `PanelLayout` (`index.html`, read by `src/main.js`)

Which arrangement the stylesheet chose, read back through custom properties, never restated as a media query (Principle VII, research.md section 19).

| Flag | Where | Meaning |
| --- | --- | --- |
| `--index` | `.strips` (existing) | 1 below 780 px wide or 600 px tall: both panels are pages under the sheet |
| `--both` | `body` (new) | 1 where the sheet at `--sheet-min` and both panels at full width fit; 0 where opening one folds the other |
| `body.planner-open`, `body.desk-open` | classes | which panels are open |
| `body.planner-folded`, `body.desk-folded` | classes | set only where `--both` is 0: that panel is a `--rail` wide head |

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

**An island:** `listed` (refused, with reason) or `queued` → `jumped` (32 matched pairs) → `planned` (its own 8 bases and 128 designs). `jumped` → `planned` only on request, on every desk, and the cost is stated first (FR-009a, amended 2026-09-11).

**The campaign** (FR-012a): `running` → `paused` (Pause) → `running` (Resume); `running` or `paused` → `cancelled` (Cancel); `cancelled` → `running` when the reader presses Resume or a door opens. A door opened while `paused` stays `paused`, with the new world's jobs admitted held.

## What is deliberately not modelled

- **A combined score of two readings**, anywhere, in any entity (FR-036).
- **A world two doors away.** A `Neighbour` is one door from the home world by construction, and there is no type for a combination (FR-027).
- **A position of an island that means anything.** The archipelago's layout is computed by the view from door order alone and is never stored beside a reading.
- **A terrain figure.** `Terrain` has no accessor that returns a reading at a point; the view paints the lattice and letters nothing off it (FR-019).

## Added 2026-09-11 (second): constraints and the panel's sequence

### `Bound` (`src/space.js`)

One numeric range the reader has placed on one control (FR-055). Frozen; the constructor throws.

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | a `Scale` or a `Facade` side. Only `Ruled` carries `min`, `max` and `step` (`src/controls.js:316`); a `Bearing` or `Profile` key throws with that reason |
| `from`, `to` | numbers | finite, inside the control's own face, `to >= from`. `to === from` is pinning, the degenerate case FR-055 allows |
| `stops` | integer >= 1 | positions on the control's own step grid inside the range. **Zero throws, naming the step**: `refuses` does not test step alignment (`src/controls.js:1622`), so this is the only thing that catches a region no design can sit in |

### `RuledOut` (`src/space.js`)

One door's excluded settings (FR-055). Frozen; the constructor throws.

| Field | Type | Rule |
| --- | --- | --- |
| `door` | Door | |
| `settings` | frozen list | each one of the door's own. Naming **every** setting throws: a door with no world behind it is refused whole |

### `Region` (`src/space.js`)

Every constraint in force, and the arithmetic that binds them. Frozen. `Region.EMPTY` is the unconstrained space, so no call site carries a second path for "no constraints".

| Member | Type | Rule |
| --- | --- | --- |
| `bounds` | frozen map of key to `Bound` | |
| `ruled` | frozen map of door id to `RuledOut` | |
| `signature` | string | stable under key order; joins both the `VALUES` memo key and the link |
| `spanOf(key)` | `{ from, to }` | the control's own face where nothing binds it |
| `admits(key, value)` | boolean | |
| `allows(door, setting)` | boolean | |
| `stateOf(key)` | string or null | the sentence lettered wherever a figure measured in this region stands (FR-052, SC-018) |

**Invariant (SC-017):** every value `snapped` returns under any region lies on the control's own global step grid, anchored at `control.min` and never at `spanOf(key).from`, so every desk a region can produce is one the unconstrained space could have produced too and two equal desks key one cache entry. The identity is between equal **desks**, never between equal **indices**: `snapped` bins into the span, so design *i* under a narrower region is a different building, which is what makes a constraint narrow the sample rather than filter it.

### `Binding` (`src/strategy.js`)

A constraint whose edge the best measured designs stand against (FR-057).

| Field | Type | Rule |
| --- | --- | --- |
| `key` | string | |
| `end` | `'from' \| 'to'` | which edge they pile against |
| `share` | `{ at, of }` | how many of the best tenth stand at the edge; read off measured designs, so saying it binds is always honest |
| `worth` | number or null | what relaxing it would buy, **only** from completed runs outside the region the ledger already holds |
| `absence` | string or null | exactly one of `worth` and `absence`. Where no run outside exists, the offer to measure a probe with its cost stated, never an extrapolation |

### `PanelPart` (`index.html`, read by `src/main.js`)

One of the six numbered parts (FR-001a, FR-001b). Declared in the markup, never composed at render, so the sequence reads the same with nothing measured as with everything measured.

| Field | Rule |
| --- | --- |
| `number` | 1 to 6, in the heading |
| `question` | the heading states the question the part answers |
| `waiting` | the sentence a part with nothing measured stands and states. A part is never absent and never behind a gate |

### `PanelLayout`, amended

| Flag | Where | Meaning |
| --- | --- | --- |
| `--planner-max` | `:root` (new) | the panel's declared maximum width; it grows from `--planner` to this as the window allows |
| `--sheet-min` | `:root` (existing, used in no rule until now) | a real `min-width` on the sheet, so the panel takes only surplus (FR-046b) |
| `--pair` | `.survey-body` (new) | 1 where the ground and the relief stand side by side. Set by a **container** query on `.planner-body`, because the existing `--survey` media query is a window query and cannot see the panel |

### What is deliberately not modelled, added

- **A constraint on a reading.** A reading exists only once its run has completed, so such a limit could only filter completed runs, which is the filter the clarification rejected (FR-055).
- **A constraint relating two controls.** Out of scope with that reason stated where a reader would look for it (FR-055).
- **A region per world.** Constraints belong to the desk, so matched designs and their jumps still compare like with like (FR-051).
