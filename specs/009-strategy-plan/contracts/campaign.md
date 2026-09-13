# Contract: the plan's campaign

Added 2026-09-11 (FR-012a, research.md section 18). Two halves: one additive operation on the shared queue, and the plan's own controls.

## `scheduler.holdWhere(pred, held: boolean)` in `src/scheduler.js`

- Sets `job.held = held` on every **active** job the predicate matches, then drains.
- `takeNext` skips a held job. A held job keeps its `order`, `started` and `curve`, so releasing it continues exactly where it stopped.
- A run already on an engine is untouched: it lands, is cached and fires `point` whatever the flag says.
- `enqueue` and `enqueueAll` accept a job whose `held` is already true; it is admitted in place and dispatches nothing until released.
- Idle means nothing in flight and no active job that is unheld. A queue holding only held jobs is idle, so the `'idle'` event still reaches the studies' densify pass.
- Every existing caller passes no `held`, and the queue behaves exactly as before.

## The controls in `src/main.js`

Three buttons in the planner panel's head, in view whenever the plan has runs waiting or in flight, and on the folded rail (FR-012a, FR-046a). They act on jobs of origin `'strategy'` only and never on a study, the survey or the pull.

| Control | Shown when | Does | Then says |
| --- | --- | --- | --- |
| Pause | `running` with runs waiting | `holdWhere(strategy, true)`; state `paused` | *Paused: N runs wait. Runs already on an engine finish.* |
| Resume | `paused`, or `cancelled` | `paused`: `holdWhere(strategy, false)`. `cancelled`: `queueStrategy()`, which queues only what the ledger does not hold. State `running` | the coverage line as today |
| Cancel | `running` or `paused` with runs waiting | cancel every plan job as `'cancelled'`; state `cancelled`; the ledger is untouched | *Cancelled: M runs kept, N not run. Resume to measure the rest.* |

- `queueStrategy` admits its jobs held while the campaign is `paused`, and queues nothing while it is `cancelled` for the same world. A new world signature ends `cancelled`, and leaves `paused` as it is.
- The gate (auto-solve, a link or a station attaching) still cancels plan jobs as today, without changing the campaign's state; when the gate lifts, the state is honoured.
- `onStrategyUpdate` treats `'cancelled'` like `'replaced'`: no suppression, unlike `'shed'`.
- Nothing about the campaign rides the link. It is how the plan is being run, not what it is, by the chase pin's rule.

## Harness (`verify/scheduler-hold.mjs`, fake pool, no engine)

1. A held job dispatches nothing; a study beside it keeps dispatching every turn.
2. Runs in flight when a job is held land and are cached.
3. Releasing continues the same indices in the same order, with no index started twice.
4. A job enqueued already held dispatches nothing until released.
5. A queue of held jobs reports idle; releasing one makes it busy again.
6. Cancelling a held job fires `cancelled` and leaves the ledger's entries in place.
