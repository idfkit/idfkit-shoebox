# Contract: `src/strategy.js`

**DOM-free, engine-free.** Everything the plan reads off landed runs: screening, moves, share explained, terrain, jumps, the four kinds, sweet spots, limits and strip tags. It takes the ledger and the declarations as arguments and never reads `params`, the document or the clock, so the Node harness drives it with plain lookups.

## Declarations

`FREE`, `SHORT`, `DESIGN_STAGE`, `MARGIN`, `ONE_MOVE`, `SAME_MOVE` and `DEPTH`, as in data-model.md. Each is asserted at load (FR-044).

## Exports

### `effectsOf(world, reading, ledger, { bases }) -> Effects`

The elementary effect of every live control at every base, per full range and in the reading's units, with the bases at which every control has one (`complete`). A skipped probe is an exact zero; a probe with a failed side is a gap.

### `screen(world, reading, ledger, { bases, stance, neighbours, jumps, tau }) -> ScreeningEntry[]`

One entry per key in `world.live` and per door, plus one inert entry for every dark or held key, carrying its reason. `stance` supplies the pull's own entries at the stance for `atStance`. **The entries and the reasons together name every key on the desk** (FR-003, SC-011). A key not yet measured has `effect === null` and the inert reason *Not yet measured*, never a zero.

### `movesOf(world, reading, ledger, { bases, designs = 0, effects = null }) -> [Move, Move] | null`

Cyclic Jacobi over C = (1/m) Σ g gᵀ. Null below 4 complete bases. Orients each move so it raises the reading: by its correlation with the reading over the landed designs, or, called without designs, by the sign of the mean gradient along it over the complete bases, and only where both are exactly zero by making the largest weight positive (research.md section 4).

### `planOf(world, reading, ledger, { designs, bases, kind, tau }) -> Plan`

Projects every landed design, scores the share explained in two dimensions and in one, builds the terrain, and names the sweet spots (`plan.spots`, a sealed map of key to `SweetSpot`) and the limits (`plan.limits`). The share is scored only on designs the moves were not fitted from: the screening bases, designs `0` to `bases − 1`, are left out of the score entirely. A `Plan` holds exactly one of `explained2` and `scoreAbsence`. A failed design is counted in `coverage.gaps` with its reason, and is never positioned and never filled (FR-013).

### `terrainOf(dots, reading) -> Terrain`

The bandwidth ladder and audit of research.md section 8. Returns a `Terrain` carrying `refused` when no rung passes. The audit refuses an unsupported local worst as well as an unsupported local best (FR-019: no rise *or* hollow the dots do not support). The constructor re-runs it, so a terrain that fails it cannot be built.

### `new MatchedPairs(home, neighbour, count)` and `jumpOf(pairs, reading, ledger) -> Jump`

A jump takes **matched pairs** of design ids, never two lists, and computes its own deltas off them and the ledger. Only pairs where both runs landed contribute; `aligned` keeps one slot per pair in pair order (NaN where unmeasured) so two readings' jumps line up building by building, and `failures` lists every failed run of the pairs with its reason.

### `new Island({ neighbour, jump, plan, cost })`

A neighbour as the archipelago draws it. `plan` is kept only once it has moves, and must be of the neighbour's own world; `depth` is `'plan'` or `'jump'` accordingly; `cost` is `{ runs, seconds }`; `failures` merges the jump's and the plan's.

### `classifyAll({ pair, effects, jumps, neighbours, taus }) -> Classification[]`

Every screened control, from both readings' effects at the shared bases, and every door, from both readings' `aligned` jump deltas. The kinds, consistency and paying levers are computed as in research.md section 6, a trade-off being tried in both directions for a paying lever. The function never computes any quantity that combines the two readings.

### `tagsFor(world, pair, classifications, spots, doors) -> Map<key, StripTag>`

Every tag carries the stamp `world.signature + pair ids` and a `label`. A control whose classification is not in hand gets no entry. `doors` maps a door's console key to its neighbour ids: a choice door by its selector's key, a patch door as `patch:<channel>`. Each tag names both readings; a sweet spot rides joined to the reading it is for (`High≈0.41`), one per chosen reading, and the tag closes with `est.` (FR-040a).

### `oneOrTwo(movesA, movesB) -> 'one' | 'two'`

`'one'` where the two leading moves sit within 15° of each other (the edge case *two readings whose moves point the same way*).

## Invariants the harness asserts

1. **No dot without a run** (SC-003): every position in a `Plan` indexes a `Landed` with readings.
2. **Terrain honesty** (SC-003a): the audit holds at every local best, independently recomputed from the landed designs.
3. **Height convention** (SC-003b): for all thirteen readings, the terrain's ink increases with the reading, and `better` matches `SENSE`.
4. **Words are exact** (FR-031): `'reaches nothing'` iff every measured effect is exactly 0.
5. **No combined figure** (FR-036): `no-combined.mjs` scans the classification and its lettering for arithmetic across the two readings, and asserts that `Classification` exposes no field or number beyond its declared ones.
6. **Regression gates** on the reference desk: SC-004 (at least 65 % and 50 %, and more than the two strongest single controls), SC-005 (the named kinds and tags), SC-005a (the named sweet spots, and none within the margin).
7. **Freshness** (SC-013): after ten world changes and ten reading changes, every tag's stamp equals the current stamp.
