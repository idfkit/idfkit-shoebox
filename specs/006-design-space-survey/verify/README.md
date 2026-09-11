# Harnesses for 006-design-space-survey

There is no test runner and no linter in this repository. These files are the
gate instead, and the constitution's Development Workflow makes several of them
mandatory rather than optional: model changes verified outside the browser
(gate 1), idempotence asserted (gate 2), codec changes round-tripped (gate 4),
declaration invariants throwing at module load (gate 5).

They are **throwaway**. They are run by hand, they are not wired into any npm
script, and nothing in the page imports them. They live here rather than under
a scratch directory only so that the measurements behind this feature can be
re-taken by whoever reads the spec next, which is the same reason the
measurements themselves are written into `CLAUDE.md` rather than into a commit
message.

## Before running any of them

```bash
npm install
npm run predev     # stages ~50 MB of engine assets, schemas and the station index
```

`public/energyplus/`, `public/schemas/` and `public/weather/` are gitignored, so
a fresh clone has none of them and every harness that boots the engine will fail
with a missing file rather than a wrong answer.

## The files

| File | Gate | What it asserts |
| --- | --- | --- |
| `engine.mjs` | — | Shared helper. Runs the staged WASM engine under Node, **one run per process**. Not a harness itself. |
| `engine-child.mjs` | — | The one run that process does. Not called by hand. |
| `scheduler-fairness.mjs` | FR-053 | A many-job survey and a single study interleave rather than one starving the other. Fake pool, no engine. |
| `repeatability.mjs` | SC-005a, FR-026a | One design measured 20 times returns identical readings, and instance reuse is asserted to be refused rather than measured. **Stop-the-line**: a failure changes the design, not the code. |
| `survey-invariants.mjs` | SC-003 | No figure originates outside a `SpotHeight`; no triangle touches a gap; coverage sums; every contour segment lies inside an emitted cell. No engine. |
| `survey-ground.mjs` | SC-010 | Builds a real coarse ground under Node. Every spot height traces to a run; 20 injected failures each appear as a gap with a reason and none is filled; an all-failed survey states that it measured nothing. About 90 s. |
| `link-roundtrip.mjs` | SC-004 | Every `sv` field round-trips exactly and every malformed class is refused whole — including the regression that a `sv` value which is syntactically a number is still read as a survey. No engine. |
| `pull-vs-sweeps.mjs` | SC-005 | On 10 test desks the pull's top three agree with three independent full sweeps, 10 of 10. **Expect half an hour**: one process per run, ~37 probes and three 21-point sweeps per desk. |
| `idempotence.mjs` | Gate 3 | Three applications of a survey sample's overlay are byte-identical, and the restore is byte-exact. |

## Running one

```bash
node specs/006-design-space-survey/verify/survey-invariants.mjs
```

Each prints its assertions as it makes them and exits non-zero on the first
failure. Outside the browser the schema comes from `localBundle()` in
`@idfkit/schemas/node`, not from `httpSource('/schemas/')`, and it wants the
full version string — `load('26.1.0')`, not `load('26.1')`.


## One run per process, and why

CLAUDE.md's recipe is to set `global.Module` before requiring
`public/energyplus/energyplus.js` and clear the require cache between runs.
The first half is right. The second is not enough, and the failure it produces
looks like a broken model rather than a broken harness, so it is written down
here as well as in `engine.mjs`.

Measured on the shipped 26.1 build, second run in one Node process:

| | exit | `/output` afterwards |
| --- | --- | --- |
| same instance, second `callMain` | 1, throws a raw number | the **first run's** files, untouched |
| fresh instance, require cache cleared | 1, throws | empty |

`main` cannot be called twice in one process at all. The raw number is a C++
exception pointer — EnergyPlus aborting because its globals are already
initialized, and aborting before doing any work, which is why the first row
leaves the previous run's ESO in place. A harness built on instance reuse would
read run one's output over and over and report perfect agreement, which is the
worst shape a false pass can have on a gate whose subject is whether two runs
agree. So `runIdf` spawns a process, at about 1.8 s a run against a design
day's own 0.28 s.

The consequence for SC-005a is that its two halves are gated in two places.
Determinism on one input is measured in `repeatability.mjs`. **Instance reuse
is a browser gate** — quickstart.md gate 7 — because only the browser reuses a
module across runs: `@idfkit/engine`'s worker holds one `wasmModule` and resets
`/output` between calls, and reaching it from Node means shimming
`importScripts`, `self` and `fetch` around a web worker, which measures the
shim.


## What these harnesses cannot answer

Two of quickstart.md's gates are not reachable from Node and are named here so
that nobody looks for them among the files above.

**The timings** (SC-001's 5 s and 30 s, SC-002's 10 percent live cadence) have
to be taken in a **foreground** browser tab. Chrome clamps background-tab timers
to roughly 1 Hz, which is plainly visible in any measurement taken through
automation: every figure lands within 10 ms of a whole second. A number taken
that way is a measurement of the throttle.

**Instance reuse** — the second half of SC-005a — is a browser gate for the
reason set out above: `main` cannot be called twice in one Node process at all.

One thing worth knowing before taking the timings by hand: `requestIdleCallback`
is deferred indefinitely in a backgrounded tab, so a survey's densify simply
never runs there. It is scheduled with a two-second timeout for that reason, and
the same is probably owed to `densifyStudies`.
