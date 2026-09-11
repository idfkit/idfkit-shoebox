# Contract: `src/strategy.js`

**DOM-free, engine-free.** Everything the plan reads off landed runs: screening, moves, share explained, terrain, jumps, the four kinds, sweet spots, limits and strip tags. It takes the ledger and the declarations as arguments and never reads `params`, the document or the clock, so the Node harness drives it with plain lookups.

## Declarations

`FREE`, `SHORT`, `DESIGN_STAGE`, `MARGIN` and `DEPTH`, as in data-model.md. Each is asserted at load (FR-044).

## Exports

### `screen(world, reading, ledger, { stance }) -> ScreeningEntry[]`

One entry per key in `world.live` and per door, plus one inert entry for every dark or held key, carrying its reason. `stance` supplies the pull's own entries at the stance for `atStance`. **The entries and the reasons together name every key on the desk** (FR-003, SC-011). A key not yet measured has `effect === null` and the inert reason *Not yet measured*, never a zero.

### `movesOf(world, reading, ledger) -> [Move, Move] | null`

Cyclic Jacobi over C = (1/m) Σ g gᵀ. Null below 4 landed bases. Orients each move so it raises the reading (research.md section 4).

### `planOf(world, reading, ledger) -> Plan`

Projects every landed design, scores the share explained in two dimensions and in one, builds the terrain, and names the limits. A failed design is counted in `coverage.gaps` with its reason, and is never positioned and never filled (FR-013).

### `terrainOf(plan) -> Terrain`

The bandwidth ladder and audit of research.md section 8. Returns a `Terrain` carrying `refused` when no rung passes. The constructor re-runs the audit, so a terrain that fails it cannot be built.

### `jumpOf(door, reading, pairs, ledger) -> Jump`

Takes **pairs** of design ids, never two lists. Only pairs where both runs landed contribute; a pair with one failure is counted and reported as *n of 32 pairs measured*.

### `classify(key, pair, source) -> Classification`

`source` is the key's elementary effects for both readings, or its jump deltas for both. The kinds, consistency and paying levers are computed as in research.md section 6. The function never computes any quantity that combines the two readings.

### `sweetSpot(key, reading, plan, ledger) -> SweetSpot`

The quadratic-in-one least-squares fit of research.md section 13. Returns a spot or a limit, never both.

### `tagsFor(world, pair, classifications, spots) -> Map<key, StripTag>`

Every tag carries the stamp `world.signature + pair ids`. A control whose classification is not in hand gets no entry.

### `oneOrTwo(movesA, movesB) -> 'one' | 'two'`

`'one'` where the two leading moves sit within 15° of each other (the edge case *two readings whose moves point the same way*).

## Invariants the harness asserts

1. **No dot without a run** (SC-003): every position in a `Plan` indexes a `Landed` with readings.
2. **Terrain honesty** (SC-003a): the audit holds at every local best, independently recomputed from the landed designs.
3. **Height convention** (SC-003b): for all thirteen readings, the terrain's ink increases with the reading, and `better` matches `SENSE`.
4. **Words are exact** (FR-031): `'reaches nothing'` iff every measured effect is exactly 0.
5. **No combined figure** (FR-036): a static scan of the module finds no expression that adds, weights or ranks two readings' values together, and the harness asserts that `Classification` exposes no such field.
6. **Regression gates** on the reference desk: SC-004 (at least 65 % and 50 %, and more than the two strongest single controls), SC-005 (the named kinds and tags), SC-005a (the named sweet spots, and none within the margin).
7. **Freshness** (SC-013): after ten world changes and ten reading changes, every tag's stamp equals the current stamp.
