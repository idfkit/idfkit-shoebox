# Contract: design-list jobs in `src/scheduler.js`

The one change to the shared queue, and the reason it is needed, are set out in research.md section 10. The change is additive: every existing caller passes no `designs` and behaves exactly as before.

## `makeStudyJob({ ..., designs })`

- **`designs`** (optional): an array of `{ params, patch, context }` entries, frozen. When it is present:
  - `points` MUST be `[0, 1, …, designs.length − 1]`, and `order` names each exactly once, as today;
  - `key` MAY be null. `omits` MUST be given, and is the full varied set of the job's world, so the cancel point in `applyGeometry` sees no change when a varied control moves;
  - `snapshot` and `patch` describe the **world** (its held keys and patch), and are what `restShape` is taken against.
- Throws when `designs` is present and `points` is anything else, and when any entry lacks `params` or `patch`.

## Injected functions (main.js), with `designs`

- `keyOf(job, index)`: `deskKey(job.designs[index].params, job.designs[index].patch)` plus the run kind, in the same `{ exact, bucket }` shape as today. A plan design and a study sample with identical params and patch are therefore the same cache entry (FR-011).
- `buildSample(job, index)`: applies `job.designs[index]` in the same one synchronous breath, restores the live desk in `finally`, and returns the same shape.
- `contextFor(job, index)`: resolved **per distinct `entry.context` signature**, memoised on the job. For a job without `designs`, the existing once-per-job behaviour is unchanged.

## Fairness

A plan contributes at most three active jobs: the home world's designs, its probes, and the neighbours (jumps, then islands). The round-robin in `takeNext` is untouched, so a study enqueued beside a plan receives at least one dispatch in four.

## Harness

`scheduler-designs.mjs`, against a fake pool with no engine, asserts:

1. A design-list job lands every index exactly once, and `done === total`.
2. A study enqueued behind a 1,024-design plan dispatches its first sample within its first four turns of the round-robin.
3. A neighbours job mixing two `roomType` worlds hands each design the context of its own world, never the first design's.
4. Moving a varied control cancels no plan job; changing a held key cancels all of them as `'moved'`.
5. `clearAll` drops design-list jobs and the ledger together, and a landing from the old epoch writes neither.
