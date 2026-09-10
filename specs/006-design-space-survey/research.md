# Phase 0 research: Survey the design space

Every decision below was taken against the code as it stands, and the ones that
turned on a number were measured or counted rather than estimated from memory.

## 1. A survey row is a study

**Decision**: A survey is a stack of ordinary study jobs, one per row of the grid,
queued into the existing `createStudyScheduler`. No new scheduler, no second pool,
no second cache.

**Rationale**: `buildSample(job, value)` in `main.js` applies
`{ ...job.snapshot, [job.key]: value }`. The snapshot is a whole desk, so a row is a
job whose snapshot carries axis Y at that row's value and whose swept key is axis X.
Two dimensions are reachable with no change to `buildSample` and no change to
`makeStudyJob`'s numeric-points assertion, because a row's points are numeric
positions along one axis.

Three consequences fall out for free rather than being written:

- **FR-011 (reuse study samples).** `keyOf` builds its identity from
  `deskKey({ ...job.snapshot, [job.key]: value }, job.patch)`, which is the whole
  desk shape. A study of axis X taken at the stance is byte-identical in identity to
  the survey's own stance row, so it is a cache hit and costs no engine run.
- **FR-053 (share the pool).** They are literally in the same queue, and `pending`
  already lets two jobs wanting one sample ride a single run.
- **FR-052 (station change takes the survey down).** `clearAll` bumps the epoch and
  clears the cache. Survey rows are cancelled by the same call that cancels studies.

**Alternatives considered**: A dedicated 2D scheduler was rejected because the sample
cache lives inside the scheduler, so a second one forfeits FR-011 outright and
duplicates the epoch, pending-share and cancellation logic that took this codebase
real debugging to get right. Generalising `points` to opaque 2D positions was
rejected as a larger change to a module whose interleavings are its whole risk.

## 2. Round-robin dispatch is required

**Decision**: Change `takeNext` from a strict walk over `jobs` to a round-robin that
takes one unstarted index from each active job in turn.

**Rationale**: `takeNext` currently returns the first unstarted index of the first
active job, so job 1 drains fully before job 2 begins. A survey enqueues many jobs at
once. Under the present rule an 11-row survey would hold every pool instance for its
whole duration and a study queued behind it would sit at `0 / 21` with nothing to say
why, which fails FR-053 and reads to the user as a hang.

Round-robin also improves the survey on its own terms: rows advance together, so the
coarse pass lands as a complete low-resolution ground rather than as three finished
rows and eight empty ones, which is what FR-009 asks for.

**Alternatives considered**: Enqueuing survey rows at the back inverts the starvation
rather than removing it. A priority field was rejected as a second thing to tune with
no principled setting. A separate pool doubles peak memory against a 256 MB
per-instance heap and splits the cache.

**Risk**: `takeNext` is exercised by the existing Node harness against a fake pool.
The change must preserve the invariant that every dispatched index is marked in
`job.started` before dispatch, or a sample is run twice.

## 3. WebGL2 without a library

**Decision**: Hand-written WebGL2. One vertex shader, one fragment shader, a
hand-rolled 4x4 matrix pair (perspective/orthographic and look-at), and an indexed
triangle mesh. Roughly 120 lines of maths and 60 of GLSL.

**Rationale**: Principle V restricts runtime *packages*, and explicitly prefers
platform APIs to packages, naming `DecompressionStream`, `URLSearchParams` and inline
SVG as the pattern the codebase already follows. WebGL2 is a platform API in exactly
that sense. gl-matrix, three.js, regl and deck.gl are all packages and all would
require a constitutional amendment; none is needed, because a constrained orbit over
a height field needs no scene graph, no loader, no material system and no physics.

An orthographic projection is the right default: this is a survey drawing, and
parallel projection is what makes two viewpoints comparable, which is the same reason
the axonometric on E-01 is a fixed parallel projection rather than a perspective one.

**Alternatives considered**: Canvas2D with a painter's-algorithm height field was
considered and is the natural fallback shape, but sorting several thousand quads per
frame in JavaScript is worse on a phone than a GPU draw call, and the decision that
the relief draws at full mesh everywhere (FR-018k) makes the cheap path the important
one. SVG was rejected for the relief specifically: a 121-cell mesh is fine, but the
refined grid plus contour overlay is thousands of nodes and the layout cost lands on
the main thread that the engine and the pump are already sharing.

## 4. Interpolating a grid that has holes

**Decision**: Bilinear interpolation over the regular grid, with a per-cell validity
mask. A mesh cell is emitted only when all four of its corners are measured; any cell
touching a gap or unsurveyed position is omitted, leaving a hole in the surface.

**Rationale**: The axes are snapped to each control's own step grid (FR-008), so the
samples are a regular lattice rather than scattered points. That rules out needing
Delaunay, natural-neighbour or kriging, all of which would be packages or hundreds of
lines. Bilinear over a lattice is a dozen lines and is exactly the inference the
contours are already drawn from, so the plan and the relief cannot disagree about the
shape of the ground.

Omitting cells rather than extrapolating is what makes FR-016 structural: a gap
cannot be filled from a neighbour because the geometry that would have covered it is
never generated.

**Alternatives considered**: Bicubic was rejected because it overshoots, and an
overshoot in a smooth relief invents a hollow that no run measured, which is the one
thing FR-019 exists to prevent. Nearest-neighbour fill was rejected as the silent
fallback the constitution forbids.

## 5. Contours by marching squares

**Decision**: Marching squares over the same lattice and the same validity mask,
emitting SVG polylines. About 60 lines with the standard 16-case table.

**Rationale**: It is the textbook algorithm for exactly this input, it shares the
lattice and mask with the relief so the two drawings agree by construction, and it
produces polylines that inline SVG can letter directly at their turns. d3-contour
does the same thing and is a package.

**Ambiguity to settle in implementation**: the saddle cases (5 and 10) must be
resolved consistently, by the cell's own mean, or contours will cross themselves at
saddles, which on this ground is precisely where the interesting reading is.

## 6. The pull costs 90 runs, and the run kind is the open question

**Counted, not estimated**: 18 channels, 144 control keys, 9 of them priced, and
**90 sweepable numeric faces** (`kind: 'scale'` is 84 of the 144, plus `bearing` and
the per-wall `facade` keys, less those on priced channels).

**Decision**: One-sided differences. The stance's own run is already in hand, so each
control costs exactly one extra run, not two.

**Measured cost**: 90 runs at the design-day cadence of about 50 ms across a pool of
four is roughly 1.1 s, which is inside the reader's attention span and comfortably
inside SC-001's 5 s. At the annual cadence of about 0.7 s the same 90 runs are about
**15.8 s**, which is slower than anything else on the desk.

**The open decision this forces**: the spec's assumption says the survey measures at
the run kind the desk is on and does not silently drop to design days to go faster.
That assumption was written about the ground. The pull is a different reading and
15.8 s is a long time to hold a reader. Two honest options, and this is a decision for
implementation rather than a thing to guess now:

1. Read the pull at the desk's own run kind and report progress as it fills, letting
   the ranking settle over 16 s with the top entries stable early.
2. Read the pull at design-day cadence always, and **letter that it did**, so the
   reader knows the ranking is a design-day ranking of an annual desk.

Option 1 is the one consistent with the assumption as written and is the default.
Option 2 is only admissible because it would be stated; silently doing it is the
substitution Principle IV forbids.

**A further saving**: many of the 90 are inert at any given stance, because their
channel is bypassed or their wall carries no opening. FR-027 requires those to be
listed as inert with a reason, and an inert control costs zero runs, so the real
count on a typical desk is well below 90.

## 7. The determinism guard

**Decision**: Implement FR-026a as an assertion with a harness behind it, not as an
assumption.

**Rationale**: The clarified answer is that the engine is perfectly repeatable on one
input, which matches CLAUDE.md's own statement that "the engine is deterministic on
one input, but the app reuses one WASM instance across solves". The reuse is real:
`pool.js` pushes a released engine onto `idle` and pops it for the next sample, so
one instance serves many runs. CLAUDE.md records a warm-session reading of 512 hours
open against a cold boot's 511 on the same link.

That drift is instance state rather than a property of the model, and it is reachable
from this feature because a survey is the first thing on this desk to measure a
hundred designs in one session. SC-005a is the gate: one design measured twice, on
different instances and at different points in a session's life, must return identical
readings, verified over at least 20 repeats spanning a cold instance and one that has
already served ten runs.

**If the gate fails**, the remedy is to retire a pooled instance after a bounded
number of runs, which costs a WASM compile per retirement and is measurable against
the budget. That is a contingency, not the plan.

## 8. The permalink key

**Decision**: One new reserved key, `sv`, carrying axes, reading or readings, and
extent. The stance is already carried by the existing parameter encoding, so it is
not restated.

**Rationale**: `RESERVED` is currently `['in', 'out', 'stn', 'win', 'at', 'sty']` and
is asserted against `ALL_KEYS` at module load, so a new key is one array entry plus
the assertion it already carries. `LINK_VERSION` stays `v1`: adding keys is free under
delta encoding, and this feature changes no existing default, no key name and no
range, so `MIGRATIONS` stays empty.

**The trap, already documented and now load-bearing**: `readValue`'s numeric regex
runs *before* the per-kind switch. A `sv` branch written inside the switch would be
unreachable and every survey link would be refused as "is not a number". The branch
goes **above the regex, beside `selector`**, exactly where the `pattern` kind had to
go. It must also re-serialise what it reads, so that two spellings of one survey do
not key two identical solves.

**The camera does not ride the link** (FR-044a). It is how the ground is being looked
at rather than what was measured, which is the rule the chase pin already follows.

## 9. The transfer budget

**Decision**: The 60 KB ceiling in SC-012 is comfortable.

**Rationale**: Source sizes in `src/` today run from 2 KB to 327 KB and the whole
page ships well inside its budget. The new code is roughly 20 KB of `survey.js`,
10 KB of `pull.js` and 20 KB of `relief.js` as source, of which the GLSL is a few
hundred bytes. Minified and brotli'd, source of that size lands near a quarter of its
raw figure, so the expected addition is on the order of 15 KB against a 60 KB
allowance. No asset, font or binary is added.

**To verify rather than assume**: measure `dist/` before and after with the existing
`npm run build`, since SC-012 is stated as transfer on a cold visit and the deploy
script's own brotli settings are what decide it.

## 10. Grid sizes and progressive refinement

**Decision**: Coarse pass is 5 x 5 = 25 runs. Refinement densifies to at most
11 x 11 = 121, reusing the coarse samples exactly, as `COARSE_SAMPLES` (11) and
`SWEEP_SAMPLES` (21) already do for a one-dimensional study.

**Rationale**: The spec's assumption asks for a coarse pass on the order of a few
dozen runs rather than a few hundred. 25 runs at design-day cadence across a pool of
four is about 0.3 s, so the first legible relief stands almost immediately and
SC-001's 5 s is met with room for the stance row to be a cache hit. 121 at annual
cadence is about 21 s across four instances, inside SC-001's 30 s.

The odd counts matter: an odd number of positions on each axis puts a sample exactly
at the midpoint, and `samplePoints` already forces the current value into the point
list, so the stance is always a measured position rather than an interpolated one.
FR-005 depends on that.

**Refinement priority** (FR-010) is steepness first, then proximity to the stance.
This is deliberately left as a heuristic to be tuned against a real ground rather than
specified numerically here, and it is the one number in this feature that no
measurement yet supports.

## 11. The reading roster is reused unchanged

**Confirmed by reading `study.js`**: `QUANTITIES` is 11 entries, several carrying two
`QuantitySeries` each, which is the "eleven choices covering thirteen outcomes" the
spec's assumption refers to. `offersFor` already computes availability and refusal
reasons per quantity, and `contentsFor` already decides what a sample must carry.

FR-002 is therefore satisfied by calling the same functions, and no new
`Output:Variable` is requested by this feature at all, which discharges FR-017 without
argument.

## 12. The layout threshold

**Decision**: One new threshold, declared once in `index.html`'s inline styles as a
custom property on E-02's host and read back by script, exactly as `--index` and
`--fold` already are.

**Rationale**: Principle VII requires thresholds to be declared in the stylesheet and
read back, never restated as a `matchMedia` string. `console.js` reads `--index` and
`main.js` reads `--fold`; the survey follows the same arrangement. It must consider
height as well as width, since E-02 carries a plan, a relief and a ranked list and a
short window is the shortage that caught the console out.

## 13. Which library version this plan assumes

**Asked during planning, and checked rather than assumed.**

This plan is written against **`main`**. PR #53 (`worktree-007-upgrade-idfkit-js`,
open and mergeable at the time of writing) upgrades `@idfkit/core`,
`@idfkit/schemas` and `@idfkit/weather` from `^0.1.0` to `0.3.0-rc.3`.
`@idfkit/engine` and `@idfkit/engine-assets` are unchanged by it, so EnergyPlus is
26.1.0 either way and every timing in this document holds.

**The overlap is three files and none of them is one this feature touches.**

| PR #53 changes | Extent | Bearing on this plan |
| --- | --- | --- |
| `src/model.js` | 77 lines | The `IDFDocument` -> `IdfDocument` rename, plus a rewritten comment on `holds()`. `applyModel`, `geometryFacts`, `writeIdf` and `setAnnual` keep their signatures. |
| `src/controls.js` | 1 line | Comment only. The control declarations are byte-identical. |
| `src/describe.js` | 1 line | Comment only. |
| `.specify/memory/constitution.md` | 25 lines | Version 1.0.0 -> 1.0.1, PATCH. Principle III's type spelling. No gate moves. |
| `CLAUDE.md`, `README.md` | 70 lines | The same rename and the `holds()` note. |

**Verified, not inferred**: the control census was re-run against PR #53's own
`controls.js` and returns the identical figures, 18 channels, 144 keys, 9 priced,
**90 sweepable numeric faces**. Section 6's costing therefore stands on both branches.

**Untouched by PR #53**: `scheduler.js`, `pool.js`, `study.js`, `permalink.js`,
`readings.js`, `console.js` and `main.js`. Every finding this plan rests on lives in
those files: the survey-row-is-a-study finding (section 1), the round-robin
starvation (section 2), the cache identity behind FR-011, the reserved-key list and
the `readValue` regex trap (section 8). None of them moves.

**One change is worth knowing about, and it helps.** Under 0.1.0, asking whether a
document held a type *registered* that type, because `all()` and `get()` went through
`collection()`, which inserted an empty collection, and `types()` is insertion order.
0.3.0-rc.3 stopped registering on read: measured in PR #53, the type count across
eight desk positions fell from a uniform 69 to between 28 and 45, which is the count
of types actually present.

This feature adds no applier and asks the document no new question, so it is unharmed
either way. But any implementation that *does* come to ask one must observe the
`holds(doc, type)` guard while `main` is the baseline, and need not once the upgrade
lands. The guard survives the upgrade in PR #53 for documentation reasons, so the
call is safe under both.

**Conclusion**: no rework either way. Whichever of the two merges first, the other
rebases cleanly, because the two changes have an empty intersection in `src/`.
