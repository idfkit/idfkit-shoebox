# Contract: the pool's width in `src/pool.js`

Added 2026-09-11 (FR-011a, research.md section 17).

## `poolWidth({ cores, deviceMemoryGB, perInstanceMB = 256 }) -> PoolWidth`

Replaces `poolLimit`, which has one caller (`studyCapacity` in `src/main.js`).

- `cores` is `navigator.hardwareConcurrency` as the browser reports it, or 4 where it is absent.
- `deviceMemoryGB` is `navigator.deviceMemory` or null. Null is taken as 4 GB, and `assumed` is set.
- `width = max(1, min(cores − 2, floor((min(memory, 8) × 1024 / 2 − perInstanceMB) / perInstanceMB)))`. There is no fixed cap.
- `why` names the binding term in words: `"12 cores less two"`, or `"half of 8 GB at 256 MB an engine"`, or `"half of an assumed 4 GB at 256 MB an engine"`, or `"one engine at least"`.
- The result is frozen. It is DOM-free, so the harness calls the real function.

`studyCapacity` becomes `poolWidth(...).width`, and the `PoolWidth` is kept so the plan can letter `why`.

## Where it is lettered

Wherever the plan states a cost: the annual consent sentence, an island's *Measure this world* button, and the coverage line (`N engines side by side: <why>`).

## Invariants the harness asserts (`verify/pool-width.mjs`, no engine)

1. The six rows of research.md section 17's table come out exactly.
2. `width ≥ 1` for every `cores` from 1 to 64 and every `deviceMemoryGB` in `[null, 0.25, 0.5, 1, 2, 4, 8, 16]`.
3. `width ≤ cores − 2` wherever `cores ≥ 3`: the page and the sheet's own engine always keep a core each.
4. No input yields more than 15, and none is capped below what cores and memory allow.
5. `why` names the term that is actually the minimum.
