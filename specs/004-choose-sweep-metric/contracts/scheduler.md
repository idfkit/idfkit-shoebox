# Contract: the study scheduler's injected effects

**Module**: `src/scheduler.js` | **Injected by**: `src/main.js`

`createStudyScheduler` takes its effects by injection so the module stays
DOM-free and engine-free and a Node harness can drive the real thing. Four of the
six change. The scheduler's own concerns, queueing per sample, sharing an
in-flight run between studies, cancelling by rest-shape, and landing a gap rather
than a zero, do not change. Studies and scheduler jobs remain keyed only by the
swept control.

## `keyOf(job, value)`: CHANGED

**Was**: `[deskShape, job.metric, job.annual]`.

**Becomes**: `[deskShape, runKind, canonicalCarried]`, where
`canonicalCarried` is the canonical serialisation of the `RunContents` the
sample was written with.

The quantity leaves the exact key. Sample identity remains the desk shape, run
kind and contents the run carried, never the quantity that requested them
(FR-016, D1).

An exact key containing `canonicalCarried` cannot find a different entry whose
contents are a compatible superset. The cache therefore also indexes entries by
`[deskShape, runKind]`. Lookup for a quantity filters that bucket with
`entry.carried.answers(quantity.needs)`, prefers the entry with the fewest
carried items beyond those needs, and breaks ties by canonical `RunContents`
serialisation. Only a miss from this compatible lookup may schedule a run
(FR-003, FR-004a and FR-013).

The station stays out, as it is today, which is why a station change must
continue to clear the cache whole. It clears jobs and sample facts, not study
identity: each existing control-keyed study returns as waiting under the new
climate and reuses the same card context.

Pending work is additionally keyed by cache epoch. `clearAll()` increments that
epoch before incoming-climate jobs can dispatch, so an outgoing promise can
neither satisfy a same-key incoming job nor delete its pending entry when it
finishes. The old engine call is disowned rather than aborted.

## `readPoint(job, result, built)`: CHANGED

**Was**: read the one quantity the job asked for.

**Becomes**: normalize the finished result into one short-lived landed-run view,
read **every** quantity whose `needs` the run's `carried` satisfies, and return
the small readings bag. The view contains the parsed ESO, normalized building
meter totals and run metadata needed by the bill-derived quantities. Measured
reader cost is 1.8 to 2.6 ms per sample against roughly 430 ms of engine and 7.6
to 45.8 ms of parse (FR-017). The raw result and landed view are discarded after
this call.

The scheduler's `drew` test (`src/scheduler.js:148`) is already key-name-blind,
counting any non-null key other than `value` as a reading, so it needs no edit.

## `contextFor(job)`: CHANGED

**Was**: `null` unless the job's metric was `tm59a`.

**Becomes**: unconditional, resolving every declared quantity's `context` off the
desk the sample belongs to. Still synchronous, still once per job, still guarded
by `contextTaken`, because `null` remains a legitimate answer.

## `buildSample(job, value)`: CHANGED

Unchanged in shape and in its central rule: overlay, write, restore, all in one
synchronous breath, with the restore in a `finally` so a throw still restores.

Two changes inside it:

- The reporting profile is no longer a name looked up off the quantity. It is the
  `RunContents` the quantity needs, handed to `syncReporting`.
- `floorArea` was measured only when the metric was `energy`. It becomes
  unconditional, because a sample read for every answerable quantity may be read
  for one that divides by it. It must still be measured with the overlay in the
  document, since the swept key may be moving the floor.

The return becomes `{ idf, epw, built, carried }`, adding what the run was
written with so `keyOf` and the land-time read can both see it.

## Desk quantity changes: CHANGED

A reader choice mutates one desk value and refreshes every open study. Each study
first uses the compatible cache lookup above. A complete compatible curve redraws
immediately. Missing samples enter the existing coarse-first refresh path only
when the existing auto-solve gate is on. With auto-solve off, the change schedules
nothing (FR-004 and FR-004a).

When auto-solve is re-enabled, current-shape waiting studies use a separate
coarse-first resume path. Compatible points return from cache, only missing
points run, and a study explicitly stopped at that rest shape remains stopped.

Until missing samples land, the card must not present its old curve as the new
quantity. It either keeps that curve under its previous quantity label and marks
it visibly as waiting, or replaces it with an explicit waiting state. The study
remains keyed by its control throughout (FR-004b and FR-012).

## `paused` and `capacity`: UNCHANGED

## Price-only changes do not enter the queue

Plant and Tariff keys remain outside sample identity because they reach no IDF
object. The cache entry retains the physical meter totals needed by EUI, cost and
carbon. On a price-only change, `main.js` rederives those readings for cached
samples and redraws the open cards; `createStudyScheduler` schedules no work.
Currency comparison continues through the bill's existing refusal (FR-020).

## What must remain true

- No `await` ever sees the shared document in overlay state.
- The restore is byte-exact, which is what idempotence buys and what a harness
  asserts. A `RunContents` must therefore serialise canonically, or two runs
  carrying the same set would restore to different bytes.
- A failed sample is a gap, never a cached fact.
- In-flight samples cannot be aborted, only disowned.
- Changing the desk quantity never creates a second study for one control.
