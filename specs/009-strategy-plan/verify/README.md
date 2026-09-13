# Harnesses for 009-strategy-plan

There is no test runner and no linter in this repository. These files are the
gate instead, and the constitution's Development Workflow makes several of them
mandatory rather than optional: model changes verified outside the browser
(gate 1), idempotence asserted (gate 2), codec changes round-tripped (gate 4),
declaration invariants throwing at module load (gate 5).

They are **throwaway**. They are run by hand, they are not wired into any npm
script, and nothing in the page imports them. They live here rather than under
a scratch directory so that the measurements behind this feature can be
re-taken by whoever reads the spec next, which is the same reason the
measurements themselves are written into `CLAUDE.md`.

## Before running any of them

```bash
npm install
npm run predev     # stages ~50 MB of engine assets, schemas and the station index
```

`public/energyplus/`, `public/schemas/` and `public/weather/` are gitignored, so
a fresh clone has none of them and every harness that boots the engine fails
with a missing file rather than a wrong answer.

The harnesses that run EnergyPlus reuse
`specs/006-design-space-survey/verify/engine.mjs`, which spawns **one process
per run**. Its own note says why: `main` cannot be called twice in one Node
process, on the same instance or a fresh one, and a harness that reused an
instance would read the first run's output over and over and report perfect
agreement. Outside the browser the schema comes from `localBundle()` in
`@idfkit/schemas/node`, loaded as `load('26.1.0')`.

## The files

| File | Gate | Engine | What it asserts |
| --- | --- | --- | --- |
| `desk.mjs` | n/a | no | Shared helper: the schema, a document per desk, the reference and annual evidence desks, and `runMany`, which runs many engine processes at once. Not a harness itself. |
| `measure.mjs` | n/a | yes | Shared helper: runs a list of designs on the reference desk and files them into a real `DesignLedger`, caching the runs on disk under the system temporary directory. |
| `dimension-order.json` | quickstart 1 | n/a | The frozen copy of `DIMENSION_ORDER` as shipped, which `space-roles.mjs` holds the module to. |
| `space-roles.mjs` | quickstart 1, SC-011 | no | Every key in `ALL_KEYS` has exactly one role; the default desk's varied count and neighbours; Blinds listed with its channel's reason; `DIMENSION_ORDER` against a frozen copy. |
| `space-designs.mjs` | quickstart 2, SC-010, SC-007 | no | `designAt` for indices 0 to 511 is byte-identical across two child processes; every varied value passes `refuses` and lies on its step grid; every `matched` pair differs only in its door and what the door implies. |
| `skip-proof.mjs` | quickstart 3 | no | Every probe `probesAt` skips at the first 16 bases of both desks builds an IDF byte-identical to its base's; three applications of a design are byte-identical and the live desk is restored byte-exact. **Stop-the-line**: a failure means the dark predicate is wrong, and the screening cannot trust its own zeros. |
| `scheduler-designs.mjs` | quickstart 4 | no (fake pool) | The five assertions of contracts/scheduler-designs.md. |
| `scheduler-hold.mjs` | quickstart 12 | no (fake pool) | The six assertions of contracts/campaign.md: a held job dispatches nothing while a study beside it keeps its turns, runs in flight land and are cached, release continues the same indices in order, a job admitted held waits, a held-only queue is idle, and cancelling a held job leaves the ledger alone. |
| `pool-recycle.mjs` | found in gate 13 | no (fake engine) | An instance whose run failed is retired, never handed another design: after one fatal, a fake that crashes every later run as the WebAssembly engine does leaves no collateral failures at one engine or four, and a cancelled run keeps its instance. |
| `pool-width.mjs` | quickstart 11, FR-011a | no | The six rows of research.md section 17's table exactly, and over every machine a browser can report: width at least one, two cores held back, never above fifteen, never capped below what cores and memory allow, and `why` naming the binding term. |
| `jumps.mjs` | quickstart 5, SC-006, SC-007 | yes, about 25 min | 32 matched pairs for every neighbour of the reference desk, the jump printed for the zone's high and low, and what entering the layered glazing world brings alive. |
| `reference-plan.mjs` | quickstart 6, SC-003 to SC-005 | yes, about 40 min | The share explained on the reference desk against SC-004, the terrain audit recomputed independently, the height convention for all thirteen readings, and the four kinds and tags SC-005 names. |
| `tag-freshness.mjs` | SC-013 | no | Ten world changes and ten reading changes: every drawn tag matches the current classification and none survives. |
| `no-combined.mjs` | FR-036 | no | A static scan of where the four kinds are computed and lettered for arithmetic across the two readings, and a check that a `Classification` of every kind exposes no field or number beyond its declared ones. |
| `link-roundtrip.mjs` | quickstart 8 | no | Every `sp` value and ordered pair round-trips; every refusal class is refused whole; `sv` and `sp` together round-trip; a pre-feature corpus decodes byte-identically. |
| `constraints.mjs` | quickstart 14, SC-016 to SC-018 | no | The seven items of contracts/constraints.md: every `Bound` and `RuledOut` refusal throws naming what was wrong; every design of a constrained region lies inside it on the control's own grid; the grid is region-independent, and narrowing genuinely changes which building an index names; the `VALUES` memo carries the region; a ruled-out door is listed and never measured; `cn` round-trips and refuses whole; and every figure carries the span it was measured over. |
| `recut.mjs` | quickstart 15 | yes, about 10 min | Measure a region, narrow it, and confirm the solve count rises only by designs the ledger did not already hold; designs outside the new region stay in the ledger and are in no figure; widening back runs nothing at all. Records the share of a typical narrowing that was already in hand, which no reading of the code settles. |
| `annual-plan.mjs` | quickstart 7, SC-005a, SC-008 | yes, several hours | The annual evidence desk's sweet spots and the share explained for two year-long readings. |
| `baseline-size.txt` | SC-015 | n/a | Transfer before and after, measured with the deploy script's brotli settings. |

## Running one

```bash
node specs/009-strategy-plan/verify/space-roles.mjs
```

Each prints its assertions as it makes them and exits non-zero on the first
failure.

## What these harnesses cannot answer

The timings (SC-001's 5 s and 30 s, SC-002's 10 percent live cadence), the
ledger's heap size, cross-browser determinism (SC-010's second machine) and the
first-reader test (SC-012) are quickstart gate 9, and they are taken in a
**foreground** browser tab. Chrome clamps background-tab timers to about 1 Hz,
so a number taken in a background tab is a measurement of the throttle.
