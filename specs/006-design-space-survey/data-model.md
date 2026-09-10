# Phase 1 data model: Survey the design space

Typed objects with constructors and frozen instances, per the constitution's
"prefer typed objects" rule and the pattern `controls.js`, `study.js` and `tm59.js`
already follow. Every invariant listed as *throws* is asserted in the constructor or
at module load, so a bad declaration fails at mount rather than degrading at run time
(FR-041).

All of this lives in `src/survey.js` and `src/pull.js`, both DOM-free and engine-free.

## Survey

One ground under measurement.

| Field | Type | Notes |
| --- | --- | --- |
| `x`, `y` | `Axis` | The two axes. |
| `quantities` | `Quantity[]` | One or two, from the existing `QUANTITIES` roster. |
| `stance` | `object` | The frozen desk snapshot the ground was cut through. |
| `patch` | patch state | As `deskKey` takes it. |
| `annual` | `boolean` | The run kind. Stated, never silently changed (assumption). |
| `points` | `Map<string, SpotHeight \| Gap>` | Keyed `"ix,iy"` on lattice indices. |
| `coverage` | `Coverage` | Derived, never stored stale. |

**Throws**: if `x.key === y.key` (edge case: the two axes are the same control); if
`quantities.length` is 0 or greater than 2 (assumption: two is the ceiling); if a
quantity is not in `QUANTITY_BY_ID`.

**Derived, not stored**: `coverage`, the contour set, and the mesh. All three are
recomputed from `points`, so there is no second copy of the ground to drift
(Principle III).

## Axis

One control chosen as a direction.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` | A control key, resolved through `controlFor`. |
| `control` | control declaration | Read, never copied. |
| `side` | `string \| null` | The wall, for a `Facade` key. |
| `from`, `to` | `number` | The extent under survey. Defaults to the control's full range (FR-006). |
| `positions` | `number[]` | Snapped to the control's own step grid (FR-008), stance included. |

**Throws**: if the control declares no finite `min`, `max` or `step`, reusing
`samplePoints`'s existing sentence so studies and surveys refuse an unsweepable
control identically (FR-003); if the channel is priced (FR-004); if `from`/`to` fall
outside the declared range (FR-006).

**Refuses with a reason, rather than throwing**: a channel patched out, a wall that
can carry no opening. These are `Side.needs` / `Control.needs` conditions that are
true of the desk rather than of the declaration, so they are a refusal the interface
states (FR-039, US1 scenario 7), not a load-time error.

**Note on `positions`**: a control whose step is coarse may offer fewer distinct
positions than the survey asked for. The axis holds what the control can actually
hold and reports the count, rather than inventing positions between stops (edge case).

## SpotHeight

One measured design. The only thing on the survey any figure may be lettered from
(FR-007, FR-019).

| Field | Type | Notes |
| --- | --- | --- |
| `ix`, `iy` | `number` | Lattice indices. |
| `x`, `y` | `number` | Positions on the two axes. |
| `readings` | `object` | The frozen readings bag the scheduler cached. |
| `floorArea` | `number` | This sample's own gross floor, from its own document. |
| `cacheKey` | `string` | The scheduler's `exact` identity, so a spot height can be traced to its run. |

**Invariant**: a `SpotHeight` exists only where a run completed. There is no
constructor path that produces one from interpolation.

## Gap

A position that was asked for and could not be measured (FR-016).

| Field | Type | Notes |
| --- | --- | --- |
| `ix`, `iy` | `number` | Lattice indices. |
| `reason` | `string` | Why. Never null. |
| `retried` | `boolean` | A gap is not retried indefinitely (FR-016). |

**Throws**: if `reason` is empty. This is the same rule `Reading` in `tm59.js`
enforces by refusing a value and an absence together, and it is what keeps the em
dash structural rather than remembered.

## Coverage

What the survey has not measured, stated whenever it states what it has (FR-042).
Load-bearing under the smooth-relief decision, because the drawing no longer reports
its own density (FR-018i).

| Field | Type | Notes |
| --- | --- | --- |
| `wanted` | `number` | Positions in the current lattice. |
| `measured` | `number` | Spot heights. |
| `gaps` | `number` | Failed positions carrying reasons. |
| `unsurveyed` | `number` | `wanted - measured - gaps`. |
| `density` | `string` | The lattice, as `"11 x 11"`. |

**Invariant**: `measured + gaps + unsurveyed === wanted`, asserted, because a relief
and a schedule of spot heights must never be able to disagree about how much was
measured (FR-018i).

## Stance

The desk's current position, and the point every relative reading is taken against.

Not a new object. It is the existing `params` snapshot plus `patching()`, frozen at
the moment the ground is cut, exactly as a study job's `snapshot` already is. It is
recorded here because three separate readings are defined relative to it: the pull,
the free exchange, and the region where every reading improves.

## PullEntry

One control at the stance (FR-025).

| Field | Type | Notes |
| --- | --- | --- |
| `key` | `string` | The control key. |
| `direction` | `'raise' \| 'lower' \| 'none'` | Stated in words, never by colour alone (FR-025, Principle VII). |
| `effect` | `number \| null` | Change in the reading per unit of the control's own travel. |
| `perUnit` | `string` | The unit that travel is expressed in, off the declaration. |
| `room` | `number` | How much range remains in the improving direction (FR-025). |
| `atStop` | `boolean` | True where `room` is zero. A steep face with nowhere to go is a different fact (US2 scenario 2). |
| `inert` | `string \| null` | The reason this control reaches no object at this stance (FR-027). |

**Invariants**: `inert` and `effect` are mutually exclusive, the same shape as
`tm59.js`'s `Reading`. An inert entry costs no run and is listed rather than omitted
or drawn as zero. `direction` is `'none'` only where the effect is exactly zero,
because the engine is repeatable and there is no noise floor to round into
(FR-026, clarified 2026-09-09).

## TraverseStop

One design the desk has stood on this session, in order, restorable (FR-038).

| Field | Type | Notes |
| --- | --- | --- |
| `params` | `object` | Frozen. |
| `patch` | patch state | Frozen. |
| `readings` | `object \| null` | What was read at it. |
| `at` | `number` | Sequence index, for ordering only. |

**Lifetime**: the session. Cleared where the sample cache is cleared, on a station
change (assumption, FR-052). Not persisted; the scheme shelf is what saving a design
is already for.

## What is deliberately not modelled

- **No `Contour` entity.** Contours are derived from the lattice on every draw and
  are never stored, so nothing can letter a figure off a stale one.
- **No `Mesh` entity.** Same reason. The relief is a projection of the same lattice.
- **No `Basin` entity.** A basin is a description of measured points, not a thing the
  survey owns, and giving it an identity is the first step toward claiming an
  optimum (FR-037).
- **No combined score.** Two readings are lettered side by side and never summed
  (FR-031), because nobody published a weighting.
- **No noise floor.** Removed by clarification: the engine is repeatable, so every
  measured difference is real.
