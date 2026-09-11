# Contract: `src/space.js`

**DOM-free, engine-free.** Which keys are the design space, which are doors, which are held, and the one sequence every design is drawn from. Imports only `controls.js`, `study.js` (`refusesSweep`) and `schemes.js`.

## Exports

### `roleOf(key) -> FaceRole`

Total over `ALL_KEYS`. Throws on an unknown key. The table is built at load and asserted to cover every key exactly once (SC-011).

### `DIMENSION_ORDER`

Frozen, append-only. See data-model.md.

### `doorsOf(desk, patch) -> Door[]`

Every door on the desk, in design-stage order and then declaration order. A choice door on a channel that is out of the path is **still returned**, and its neighbours are refused with *Patch <channel> in to reach this world*. It is not omitted, because FR-043 lists what the plan has not visited.

### `worldOf(desk, patch) -> World`

The world the desk is in. `live` is read from `Control.shown`, the channel's engaged state as `channelState` decides it, and `refusesSweep`, never from where a control happens to be set.

### `neighboursOf(world) -> Neighbour[]`

One per other setting of every door. A door carrying `implies` is flipped through it. A neighbour whose channel `requires` is unmet at the home world's held values carries that channel's own `requires.reason` (evaluated with `(params, on, off)` exactly as `channelState` does) and no world.

### `designAt(world, index) -> Design`

Pure function of `(world.held, world.patch, index)`. Sobol with a hash-based Owen scramble at the declared constant seed, Joe and Kuo direction numbers, snapped to each control's step grid and rounded to the step's decimals.

### `matched(home, neighbour, index) -> [Design, Design]`

The pair for one index. Asserts that the two `params` objects differ only in the door key and its implications, and throws naming the stray key otherwise.

### `probesAt(world, base, reading) -> Probe[]`

One per key in `world.live`, by the pull's step rule. A key dark at this base (`Control.idle`, `Side.reaches`, or a channel `requires` that fails at the base's own values) is returned with `skip` set and costs no run.

## Invariants the harness asserts

1. `designAt` is a pure function: the same arguments return byte-identical `params` in two processes (SC-010).
2. Every design's every varied value is on its control's step grid, and `refuses(control, value)` is null for it (FR-007).
3. `matched` pairs differ only in the door (SC-007).
4. Every skipped probe, built as an IDF, is byte-identical to its base's IDF (research.md section 3).
5. At the default desk: 32 varied, 20 neighbours plus Blinds listed with its reason (research.md section 1).
6. `DIMENSION_ORDER` is append-only: the harness holds a frozen copy of the list as shipped, and fails on any reordering or deletion.
