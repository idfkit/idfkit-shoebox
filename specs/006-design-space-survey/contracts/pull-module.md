# Contract: `src/pull.js`

**DOM-free, engine-free.** The ranking at the stance, over all 90 sweepable controls.

## Exports

### `pullProbes(stance, patch, { quantity }) -> ProbeSpec[]`

One probe per sweepable control, each a one-step displacement from the stance. Returns
specs shaped for `makeStudyJob` exactly as `rowsFor` does, so the probes go through the
same queue, the same pool and the same cache. A control already probed by a study or an
earlier survey is a cache hit and costs no run (FR-011).

**One-sided differences**, because the stance's own run is already in hand: 90 controls
cost at most 90 runs, not 180.

**Inert controls produce no probe at all.** A control whose channel is bypassed, or whose
wall can carry no opening, is returned as an inert `PullEntry` carrying its reason
(FR-027). This is read from the document and the patch bay, never from `params`.

### `rankPull(entries, { quantity }) -> PullEntry[]`

Sorts by magnitude of effect per unit of the control's own travel. Every entry carries
`direction` as a word, `room`, and `atStop`, because a steep face with nowhere left to go
must not be ranked as one with half its range in hand (US2 scenario 2).

### `axesFrom(entries, a, b) -> { x, y }`

Turns two chosen pull entries into two axis declarations, so choosing from the ranking
cuts the ground without retyping anything (FR-028).

## The run-kind decision

`pullProbes` takes the desk's own run kind. At design-day cadence 90 runs across a pool
of four is about 1.1 s. At annual cadence it is about 15.8 s.

**The module must letter which kind it read at.** Reading at design-day cadence on an
annual desk is admissible only if stated; doing it silently is the substitution
Principle IV forbids. See research.md section 6.

## Invariants the harness asserts

1. `direction` is `'none'` only where the effect is exactly zero. There is no noise
   floor and no effect is dismissed as small (FR-026).
2. `inert` and `effect` are never both set, and never both null.
3. Every entry's `room` is measured against the control's declared stops, so `atStop`
   cannot disagree with `room === 0`.
4. Ranking the top three agrees with three independent full sweeps of those controls
   (SC-005). Any disagreement is a defect, not a tolerance.
