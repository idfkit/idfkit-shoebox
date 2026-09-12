# Contract: `src/space.js`

**DOM-free, engine-free.** Which keys are the design space, which are doors, which are held, and the one sequence every design is drawn from. Imports `controls.js`, `model.js` (`channelState`), `study.js` (`refusesSweep`) and `schemes.js`.

## Exports

### `roleOf(key) -> FaceRole`

Total over `ALL_KEYS`. Throws on an unknown key. The table is built at load and asserted to cover every key exactly once (SC-011).

### `DIMENSION_ORDER`

Frozen, append-only. See data-model.md.

### `doorsOf() -> Door[]`

Takes no arguments: the doors are a property of the declaration, not of a desk, and the list is built once at load. Every door, in design-stage order and then declaration order. A choice door on a channel that is out of the path is **still returned**, and its neighbours are refused with *Patch <channel> in to reach this world*. It is not omitted, because FR-043 lists what the plan has not visited.

### `worldOf(desk, patch) -> World`

The world the desk is in. `live` is read from `Control.shown` and the channel's engaged state as `channelState` decides it, never from where a control happens to be set.

### `neighboursOf(world) -> Neighbour[]`

One per other setting of every door. A door carrying `implies` is flipped through it. A neighbour is refused, with a sentence and no world, in three cases:

- a patch door into a channel whose `requires` fails on the flipped patch carries that channel's own `requires.reason`, evaluated with `(params, on, off)` exactly as `channelState` does (Blinds while the glazing is a simple rating);
- a choice door on a channel that is out of the path, blocked, withdrawn from its strip, or idle at this desk carries the sentence saying so;
- a choice door whose **own flip** blocks its channel carries that channel's `requires.reason`, evaluated on the flipped desk (the network air model with fewer than two paths through the envelope). The home desk's state cannot see this case, so it is asked of the desk the door leads to.

At the default desk: 19 enterable neighbours, and the other door settings listed with their reasons, 55 in all.

### `designAt(world, index) -> Design`

Pure function of `(world.held, world.patch, index)`. Sobol with a hash-based Owen scramble at the declared constant seed, Joe and Kuo direction numbers, snapped to each control's step grid and rounded to the step's decimals.

### `matched(home, neighbour, index) -> [Design, Design]`

The pair for one index. Asserts that the two `params` objects differ only in the door key and its implications, and throws naming the stray key otherwise.

### `probesAt(world, base) -> Probe[]`

One per key in `world.live`, by the pull's step rule. No reading argument: which controls can be stepped is a property of the design, not of what is read off it. A probe is skipped, costing no run and recording an exact zero, only where the control is dark at **both** ends of its step (`Control.idle`, `Side.reaches`, or a channel `requires` that fails), because a control's darkness can turn on its own value: a 0.01 m overhang is deleted by the engine and a 0.16 m one is built.

## Invariants the harness asserts

1. `designAt` is a pure function: the same arguments return byte-identical `params` in two processes (SC-010).
2. Every design's every varied value is on its control's step grid, and `refuses(control, value)` is null for it (FR-007).
3. `matched` pairs differ only in the door (SC-007).
4. Every skipped probe, built as an IDF, is byte-identical to its base's IDF (research.md section 3).
5. At the default desk: 32 varied, 19 enterable neighbours, and Blinds listed with its reason (research.md section 1).
6. `DIMENSION_ORDER` is append-only: the harness holds a frozen copy of the list as shipped, and fails on any reordering or deletion.
