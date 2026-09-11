# Phase 0 research: The strategy plan

Every decision below was taken against the code as it stands on `main` at `82d098d`, and every count was measured on the declarations rather than estimated. The exploration the spec cites (1,600 native EnergyPlus runs, published as an artifact) left no scripts behind, so its method is reconstructed from its own technical note: an active subspace fitted on finite differences at 20 points, a control's share of a move taken as its weight squared, and every score a five-fold cross-validated R² of a ten-nearest-neighbour regression on the 2-D coordinates.

## 1. What the plan varies, what it holds, and what it treats as a door

**Measured on the declarations** (`node` over `CHANNELS`, `refusesSweep`, `DEFAULT_BYPASS`): 18 channels, 90 sweepable numeric faces on unpriced channels, **37 live at the default desk**, of which 5 are on Solver. The default desk therefore varies **32** controls, which agrees with the pull's own count of 37 probed at that stance.

**Decision.** Three disjoint sets, asserted at module load to cover every key in `ALL_KEYS` exactly once (FR-003, SC-011):

| Set | Members | Reason lettered |
| --- | --- | --- |
| **Varied** | every sweepable face (`refusesSweep(control) === null`) on a channel that is not priced, not Solver and not Run | none; these are the design space |
| **Doors** | every `Selector` on Site (`terrain`), Glazing (`aperture`, `glazingModel`), Skylights (`skyForm`, `skyGlass`), Blinds (`shadeType`, `shadeControl`), Fabric (the six `Boundary` faces, `windExposure`), Mass (`slabMaterial`), Air (`airModel`, `openRule`, `ventType`), Gains (`roomType`, `weekend`, `holidayUse`), Daylight (`dlControl`), Grounds (`extControl`); plus the in-or-out state of Shading, Blinds, Skylights, Daylight and Context | none; these are the neighbouring worlds |
| **Held, with a reason** | Solver and Run in full; System, Plant and Tariff choices and patch state; Fabric, Mass, Air, Gains, System and Grounds patch state; `solarDist` and `hbAlgorithm`; the three `Pattern`s, the `Profile`, the `Calendar` and the `Days` | one sentence per group, see below |

Four of those calls needed deciding rather than reading off the spec:

- **`solarDist` (Site) and `hbAlgorithm` (Mass) are held.** Both are solution algorithms that happen to sit on a building channel: one chooses how shadows are calculated, the other how heat is conducted through a layer. They change how the engine answers, not what the building is, which is the register's reason for keeping Solver out of every preset. Reason lettered: *A solution algorithm, not the building; held as set, by the rule that keeps Solver out.*
- **System's own choices are held, and its numeric faces are varied.** The spec's edge case says System "stays as the reader set it", and switching its `availability` or `economizer` changes what a conditioned reading measures in the same way patching it does. Its setpoints are numbers along which a design walks, and the annual evidence in the spec (night setback best near 7 to 8 °C, heating setpoint at its limit near 12 °C) is only reachable by varying them.
- **Fabric, Mass, Air, Gains and Grounds patch state is held.** FR-004 names exactly five design-element channels as doors. The others are held with the sentence *Patching this channel changes which physics is modelled, not which building is drawn; patch it yourself to explore that world.* Their choices remain doors whenever the channel is in the path.
- **A multi-key control with no face (`Pattern`, `Profile`, `Days`, `Calendar`) is held.** Twenty-four hourly fractions are a shape rather than a position, which is `buildPattern`'s own reason for registering no study row, and the reason is reused verbatim from `refusesSweep`.

**Doors counted at the default desk: 19 neighbouring worlds.** `terrain` 3, `aperture` 2, `glazingModel` 1, the six boundary faces and `windExposure` 7, `slabMaterial` 2, and four patch doors (Context in, Skylights in, Shading out, Daylight in). (An earlier draft of this section said 20; its own terms sum to 19, which is also what `neighboursOf` returns, and the harness asserts the measurement.) **Blinds in** is listed with its channel's own `requires.reason`, because the glazing is a simple rating (FR-023, US2 scenario 6). With Gains in the path the count rises by 13 for `roomType` alone, which is why the neighbour budget in section 7 is per door rather than per desk.

A door that carries `implies` (`roomType` through `gainsForRoom`) is flipped through the same implication `commit` applies, so a neighbouring world is always a desk the console itself could reach.

## 2. One sequence over every face, so that matched designs are the same parameters

**Decision.** Designs are the points of **one fixed, prefix-extensible low-discrepancy sequence**, one dimension per sweepable face, assigned by a frozen, append-only `DIMENSION_ORDER` list. Every design assigns a value to **every** sweepable face on an eligible channel, including the faces that are dark in the world being sampled. Everything else is held at the stance.

**Rationale.** This one choice discharges four requirements at once, which is why it is the foundation rather than a detail:

1. **A matched pair is literally the same parameters with one door flipped** (FR-010). Design *i* in the home world and design *i* in a neighbouring world differ in the door's key and nothing else, so the jump is a difference between two runs of one building rather than between two averages.
2. **Entering a world costs nothing already measured there** (FR-025, FR-028). The island's matched designs are, key for key, the first designs of that world's own sample, so they come back from the ledger (section 9) when the reader steps in.
3. **A slider gesture invalidates nothing** (edge case). The sample does not depend on where the varied controls stand, only on the held ones, so the stance mark moves and no run is repeated.
4. **The same link samples the same designs everywhere** (FR-008, SC-010). No seed, clock or machine enters.

**The sequence is Sobol with Owen scrambling from a hash**, using Joe and Kuo's direction numbers (2008, `new-joe-kuo-6.21201`) for the first 90 dimensions and Burley's hash-based nested uniform scramble (JCGT 2020) at a declared constant seed. Unscrambled Sobol has poor two-dimensional projections for some pairs of high dimensions, and a scatter drawn along two moves is exactly a two-dimensional projection. The scramble is a pure function of the point index and the dimension, so it is as deterministic as the unscrambled sequence. The direction-number table is about 90 short rows, roughly 1 KB.

**Alternatives rejected.**

- *Latin hypercube with a seeded generator.* Not prefix-extensible, so a first plan of 128 designs would not be a subset of the full 512 and progressive measurement (FR-009) would throw its first pass away. That is the same argument that fixed the survey's 6 and 11.
- *Halton.* Its high dimensions correlate badly without scrambling, and scrambling it well costs more than scrambling Sobol.
- *A Kronecker sequence (R_d).* It is ten lines, but its lattice structure shows in exactly the two-dimensional projections the plan draws.
- *Dimensions in strip order (`ALL_KEYS`).* Inserting a control mid-strip would renumber every later dimension and silently change the sample behind every plan link. `DIMENSION_ORDER` is append-only and asserted at load to name every sweepable face exactly once, which is `MIGRATIONS` in miniature: a new face takes the next dimension.

**Snapping.** A coordinate *u* in [0, 1) becomes `min + round(u · (max − min) / step) · step`, then rounded to the step's own decimals, the rule `field.js` already applies so that `0 + 3 · 0.05` does not ride into the IDF as `0.15000000000000002`. Every design is therefore on each control's own step grid (FR-007).

**Counts.** Powers of two, because a Sobol prefix of 2^k points is balanced: 128 for a first plan, **512** for a world at full depth, **128** for an island at reduced depth, **32** matched designs per jump.

## 3. The screening is the pull, repeated at the sample's own first designs

**Decision.** The screening takes one-sided differences at **base points that are the sample's own first designs** (designs 0 to *m* − 1), stepping each varied control by the pull's own rule, `max(step, round(range / 20 / step) · step)`, upward where there is room and downward otherwise. *m* is **16** for the home world and **8** for an island, grown progressively from 4.

**Rationale.** The spec's assumption says the screening is the pull, repeated, so a control's effect at the stance and its effect anywhere are one measurement taken in different places. Reusing the step rule keeps the two comparable. Choosing the bases from the sample means every base run is also a dot on the plan and, in a neighbouring world, a matched design. Nothing is run for one purpose only.

**What each probe yields.** The elementary effect of control *j* at base *b*, in the reading's own units **per full range of the control**:

    g[b][j] = (f(x_b + h_j e_j) − f(x_b)) / (h_j / range_j)

Per full range, because "anywhere means every slider across its full range" (Assumption), and because it makes two controls in different units comparable. The screening entry's *effect* is the mean of |g| over the bases (Morris's μ*, Campolongo, Cariboni and Saltelli 2007). Its *consistency* is the share of bases at which g had the majority sign, with exact zeros counted as pointing neither way.

**Probes that cannot reach anything are not run, and the harness proves they could not have.** At a base where the control is dark by its channel, its `when`, its own `idle(params)` or its `Side.reaches`, g is recorded as exactly zero with that reason, and no run is spent. On the default desk this saves the same share the pull saves. It is only honest if the predicates are complete, so the harness builds the IDF both ways for every skipped probe on the reference desk and asserts byte identity (quickstart gate 3). It is the same argument the pull makes, now checked rather than assumed.

**A defect inherited from the pull, and fixed before this feature.** `inertReason` in `src/pull.js:137` calls `control.inert?.(snapshot)`, and no `Control` declares `inert`; the method is `idle`. So the pull has never consulted a control's own `needs` predicate. `infConstant` at `infiltration: 0`, for example, is probed and comes back as an exact zero rather than being listed with its reason. The screening would inherit that. The fix is one identifier and changes what the pull letters on some desks, so it goes in its own pull request ahead of this feature and gets its own changelog entry under *Fixed*.

**Alternatives rejected.** *Sobol indices from the sample alone* need thousands of runs per reading for 32 controls to separate interaction from main effect. *A regression slope over the sample* gives one direction and no consistency, and consistency is the figure FR-033 attaches to every classification.

## 4. The moves: an active subspace from the screening's own gradients

**Decision.** The moves are the two leading eigenvectors of

    C = (1 / m) · Σ_b g_b g_bᵀ

over the varied controls, computed by the cyclic Jacobi method (about 60 lines; *d* is at most 90 and in practice near 32). A control's share of a move is its weight squared, and a move explains λ_k / Σλ of what drives the reading. Designs are placed by projecting their normalised coordinates, `t = Wᵀ u`, with *u* taken over each control's full range.

**Rationale.** It is finding 2 of the spec, applied as measured. It uses the screening's gradients directly, so the moves, the screening entries and the four kinds of move (section 6) all come from **one** set of runs and cannot disagree about which way a control pulls. The exploration scored PLS and SIR marginally higher (74 % and 75 % against 72 % on the summer high). Both are fitted on the sample instead of the gradients, which would mean a second derivation of "what pulls" beside the screening's, and two sources for one fact drift (Principle III). An active subspace also needs no hyper-parameter a link would have to carry.

**Orientation.** An eigenvector has no sign. Each move is turned so that travelling along it **raises** the reading, which is what FR-016 asks the recipe to say. The test is the sign of the correlation between the projected coordinate and the reading over the sample, with the largest weight made positive where that correlation is exactly zero. The recipe names controls in the direction that raises the axis: *lower U-factor 55 %, higher SHGC 21 %, brighter ground 14 %*. It lists up to five controls holding at least 5 % each and letters the remainder as *others*.

**Two readings whose moves point the same way.** Where the leading moves of two chosen readings sit within 15° of each other, the plan says one plan serves both rather than drawing two identical ones. The measured separations the spec quotes are 57° and 62°, so the threshold is far from any measured pair.

**Straight moves and curved maps.** Out of scope by the spec's assumption. Where the reading bends, the spread around the trend shows it and the share explained measures it.

## 5. The share explained, and the one-move offer

**Decision.** Five-fold cross-validated R² of a ten-nearest-neighbour regression on the plan's standardised two-dimensional coordinates. Folds are `index mod 5`, deterministic. It is lettered as a percentage, and as *none* at or below zero, never as a negative number.

**Rationale.** It is the exploration's own score, and the only one SC-004's thresholds (65 % and 50 %) were measured with. The moves come from the screening's runs, and the neighbour regression is fitted fold by fold, so every design is scored by a predictor that never saw it (FR-017).

**The one-move offer (FR-018).** Also scored in one dimension. Where R²₁ ≥ R²₂ − 0.05, the plan also offers the reading against the leading move alone, drawn with a trend of binned medians (ten equal-count bins) marked as an estimate. The spread about it is lettered as the part the other controls decide. The margin is a declared constant, printed with the convention prefix.

## 6. The four kinds of move, consistency, and the free threshold

**Decision.** For a chosen pair of readings (r1, r2), each control's elementary effects are turned into *improvements*: I[r][b] = g[r][b] when the reading's `better` is `'higher'`, and −g[r][b] when it is `'lower'`, the direction `SENSE` in `src/survey.js` already declares for all thirteen readings. With μ_r the mean of I over the bases and τ_r the reading's free threshold:

| Kind | Condition |
| --- | --- |
| No-regret | \|μ1\| ≥ τ1, \|μ2\| ≥ τ2, same sign |
| Trade-off | \|μ1\| ≥ τ1, \|μ2\| ≥ τ2, opposite signs |
| Lever on r | \|μ_r\| ≥ τ_r, the other below its τ |
| Free | both below their τ |

The same rule is applied to each base alone, and **consistency** is the share of bases whose own kind equals the overall kind. Doors are classified identically, with the matched differences Δ_i in place of the bases. A classification that held at fewer than all points says it depends on the rest of the design (FR-033, US4 scenario 2).

**The free threshold τ is declared per reading, as a convention**, in a `FREE` table beside `SENSE`, and asserted at load to cover every reading on the roster (FR-034). Proposed values: 0.5 K for the zone's high and low; 1 W/m² for the peaks; 1 kWh/m²·yr for TEDI, CEDI and EUI; 1 % for hours above 25 °C and for TM59 a and c; 1 night for TM59 b. Cost and carbon take 1 % of the stance's own reading, because an absolute threshold in a currency means nothing across stations. Every row carries the `CONVENTION` prefix, because nobody publishes the magnitude below which a design move stops mattering. SC-005 is the check that these values reproduce the measured result.

**Trade-offs and their levers (FR-035).** A trade-off states its exchange as μ1 and μ2 across the control's range, each in its own reading's units: *warmer winter nights by 1.8 K, hotter summer afternoons by 2.4 K, across its range*. A lever **pays it back** when its improvement on the losing reading, across its own range, is at least the trade-off's loss. Only paying levers are named. Where levers exist and none pays in full, the sheet says so, and where none exists it says that. Naming a weak one is what US4 scenario 4 forbids.

**No combined figure (FR-036).** Nothing sums, weights or ranks the two readings together. The classification uses each reading's own threshold and its own sign.

**Screening words (FR-030, FR-031).** A control *matters anywhere* when μ* ≥ τ, *only here* when μ* < τ and its pull at the stance is ≥ τ, and *nowhere* when both are below τ. A control whose effect was **exactly** zero at every base and at the stance is lettered *reaches nothing for this reading*, which is a different fact and a different sentence. There is no noise floor, for the reason the pull already records: 20 runs of one design agree exactly.

**Design stage (FR-037).** Declared per channel in a `DESIGN_STAGE` table in the new module, asserted at load to name every building channel. Every row carries the `CONVENTION` prefix. Massing, Site and Context are stage 1, Fabric and Mass 2, Glazing, Skylights and Shading 3, Blinds, Air and Gains 4, Daylight, System and Grounds 5. It lives beside the strategy vocabulary rather than on `Channel`, because it is a claim about practice that nothing else on the desk reads, the way `TM59_SPACES` and `PROFILE_IDS` are held apart and asserted equal rather than merged.

## 7. The neighbour budget (clarified 2026-09-10)

**Decision.** Chosen by the reader in this planning session: jumps first, islands after.

1. **The home world**, progressively: 4 bases and 128 designs (a first plan), then 16 bases and 512 designs.
2. **Every neighbour's jump**, automatically, on 32 matched designs each.
3. **Every island's own plan at reduced depth** (8 bases, 128 designs, of which the first 32 are the matched designs already run), in design-stage order. Automatic on a design-day desk. On an annual desk, measured when the reader asks for that island, with its run count and estimated time stated before anything is spent.

Until its plan is measured, an island shows its matched designs ordered by reading, carries its jump, and says in place that its moves are not yet measured. Its share explained is then an em dash with the reason, not a zero.

**Measured cost at the default desk** (32 varied, 20 neighbours, a pool of 4, about 50 ms per design day and 0.7 s per annual run):

| Stage | Runs | Design day | Annual |
| --- | --- | --- | --- |
| First plan (4 × 32 probes + 128 designs) | 256 | 3.2 s | 45 s |
| Home world, full (16 × 32 + 512) | 1,024 | 12.8 s | 179 s |
| All 20 jumps (20 × 32) | 640 | 8.0 s | 112 s |
| All 20 islands (20 × (8 × 32 + 96)) | 7,040 | 88 s | on request, about 90 s each |

The first two rows meet SC-001's 5 s and 30 s on a design-day desk. The annual figures are the ones the plan states before it spends them (the *annual desk* edge case).

**If SC-004 fails at 16 bases**, 32 is the contingency, at about 6.4 s more per home world on design days. It is recorded here because the reference used 20 and the powers-of-two argument chose 16. That is a decision taken for the sequence's sake, and the gate is what can overrule it.

## 8. The terrain: a kernel smoother with a bandwidth chosen by audit

**Decision.** The terrain over one island is a Nadaraya-Watson estimate with a Gaussian kernel on a 40 × 40 lattice over the island's extent. It is drawn only on cells with at least six measured designs within one bandwidth. The bandwidth is the **smallest** on a declared ladder (0.06, 0.09, 0.13, 0.18 and 0.25 of the extent's diagonal) that passes the audit SC-003a states. At every local best of the smoothed surface (a cell better than its eight neighbours in the reading's improving direction), the designs within one bandwidth must read better on average than the designs between one and two bandwidths away. Where no rung passes, no terrain is drawn, and the sheet says so.

**Rationale.** The spec measured that a raw surface over a reading's map showed two to six false local bests on 812 annual runs, and requires that none reach the sheet. The kernel smoother cannot overshoot its data, which is the property bicubic interpolation lacked when the survey rejected it. Choosing the bandwidth by the very test the success criterion audits makes SC-003a true by construction, and the harness then checks it independently. The terrain's own share explained is the same five-fold score, applied to the smoother at the chosen bandwidth.

**Drawing.** Height is the reading (FR-019, SC-003b): graphite ink levels from pale at the low ground to dark at the high, with a Lambertian hillshade lit from the north-west at 45° to make the slopes legible, and no hue. It is painted with 2D canvas (a platform API) under the SVG dots. There are no contour lines and no relief block, both excluded by FR-019. Each terrain states in place which way is better for its reading. For the zone's low, the one reading where more is better, that means the best designs are the high ground, and nothing is flipped to make it match (edge case).

## 9. A ledger beside the cache

**Decision.** Landed designs are kept in a `DesignLedger` owned by the plan: world signature and design index to the readings bag, meter basis and failure reason. It is filled from the scheduler's `point` events and cleared only where the sample cache is cleared, on a station change (FR-028, FR-047).

**Rationale.** The scheduler's cache is FIFO at 400 entries (`scheduler.js:138`). One world at full depth is 1,024 runs, so the cache alone could not keep a world the reader has left, and FR-028 requires exactly that. Raising the limit was rejected: the cache's eviction protects the studies' own memory, and the plan's retention rule is different. The ledger holds only what the plan needs. It stays in the few megabytes at the counts above: about 8,700 entries at the default desk with every island measured, measured by quickstart gate 9 rather than assumed.

**Repricing (FR-015, SC-009).** The ledger keeps each design's meter basis, and `reprice()` passes it the same transform `repriceStudies` passes the scheduler. A cost or carbon plan re-letters with no new run.

## 10. The scheduler: a job whose points are whole designs

**Decision.** `makeStudyJob` accepts an optional `designs` array of `{ params, patch }` entries, one per point. When it is present, `points` are the indices, and the injected `keyOf` and `buildSample` read `job.designs[index]` in place of `{ ...job.snapshot, [job.key]: value }`. `contextFor` is asked per distinct design context rather than once per job, because a design carrying a different `roomType` has a different occupied-hour floor.

**Rationale.** A plan design moves every varied control at once, and a job today moves exactly one. Expressing 1,024 designs as 1,024 one-point jobs would work with the queue as written, and it would also hand a study one dispatch in 1,025 under the round-robin, which is FR-011's "must not delay" broken by arithmetic. With design-list jobs, the plan has at most **three** active jobs (home designs, home probes, neighbours), so a study queued beside it keeps at least a quarter of the dispatches. The same argument made the survey's `enqueueAll` necessary.

**The per-design context is the subtle half.** `contextFor(job)` is resolved once per job in `dispatch`, from `job.snapshot`. TM59 criteria a and c read the occupied-hour floor, which `roomType` decides, and `roomType` is a door. A neighbours job mixing worlds would read every design against the first design's floor. So a design-list job memoises context by each entry's world signature. This is also the one scheduler change that needs a harness of its own (quickstart gate 4).

**Cancellation.** A plan job's `omits` is the full varied set, so moving any varied control leaves its rest shape unchanged and cancels nothing. Opening a door on the desk changes a held key, so every plan job is cancelled as `'moved'`, the ledger keeps what landed, and the plan re-queues from the new world, where the ledger answers everything it already holds.

## 11. The link

**Decision.** One new reserved key, `sp`, carrying one or two reading ids joined by `.` (`sp=high.low`), read in `decodeState` beside `sv` and `sty`, above `readValue`'s numeric regex. That is the trap this codebase has met three times, and it is written into the contract. It re-serialises what it reads, so two spellings of one plan cannot key two identical states.

**Nothing else rides it.** The sample is decided by the desk and the frozen sequence, so the readings are all a recipient needs to sample the same designs and worlds (FR-045). Measured values and strip tags are re-measured, as the survey's are. Whether an annual desk's island was measured on request does not ride either: that is how the plan was looked at, not what it is, which is the chase pin's rule.

`LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty. Adding a reserved key is free under delta encoding, and a link with no `sp` reproduces exactly what it did before (US5 scenario 4).

## 12. The strip tag

**Decision.** `console.js` gains `setTags(map)`, modelled on `setDerived(map)`. It adds one short printed line under a classified control's face, beside `.ctl-derived`, and the same short form in the folded index row after the channel's reading. The tag is a button that scrolls to and focuses the control's entry in the moves panel (FR-039). A free control's face takes a new `.free` class at `opacity: 0.62`, distinct from `.idle` at 0.4, because *free for these two readings* is not *reaching nothing*, and the two must not look alike. The map is keyed by world signature and reading pair and replaced whole on every change, so a stale tag is structurally impossible: a control absent from the current map is drawn with none (FR-040, SC-013).

**Short forms are declared, never truncated.** Each reading declares a `short` (*High*, *Low*, *TEDI*, *EUI*, *Heat peak* and so on), and a tag reads *Trade-off · High/Low*, *Lever · High*, *No-regret*, *Free*, or *Best ≈ 0.41 · EUI, est.*. A new `TAG` budget in `src/copy.js` (five words) is asserted at load over every combination the declarations can produce.

**The cost, stated.** About 32 new tab stops at the default desk, one per classified control. The landmark rule refused 200 tab stops for marks that are read rather than pressed. A tag has somewhere to go, so it is a control.

## 13. Sweet spots and limits

**Decision.** Per control and reading, fit the sample by least squares on `[1, u_1 … u_d, u_j²]`, which is linear in every control and quadratic in the one being examined. Where the curvature bowls toward the better direction and the stationary point u* lies at least **0.15** of the range from either end, name it as the sweet spot. It is snapped to the control's step grid, lettered *≈* with *est.*, and given two more figures: its consistency (the share of bases whose gradient points toward u*, meaning upward below it and downward above it) and how much worse the worse end of the slider is on the fitted curve.

**The 0.15 margin is the spec's own example turned into a number.** The heating setpoint was best near 12 °C on a 10 to 26 °C slider, 0.125 of the range from its end, and the spec says that case cannot be told apart from "push it to the limit". A margin of 0.15 refuses it with room to spare, and the three annual sweet spots the spec names (SHGC near 0.41, plan width and depth near 28 m, setback near 7 to 8 °C) all sit well inside. SC-005a is the check.

**At its limit (FR-032b).** A control is at its limit on an island when its fitted curve improves monotonically toward one end and the median value among the island's best tenth of designs lies within the margin of that end. The island names every such control, and the terrain's audit (section 8) guarantees it draws no best region inside.

## 14. The archipelago

**Decision.** The home island stands at the centre. Neighbours are laid out on one ring, grouped by door and ordered by design stage, at evenly spaced angles. There are no connecting lines. Each door's label and jump are lettered at the island's own edge, and the drawing carries one sentence in place: *Island positions are schematic: distance means nothing, and each door carries its jump.* Below the index threshold (`--index`, already declared once in the stylesheet and read back by script), the ring becomes a list of island cards in the same order, each with its door, jump, share explained and designs (FR-046, SC-014).

**Rationale.** FR-023 and SC-007a forbid reading distance, direction or overlap between islands as a difference in the reading. A ring at even spacing carries no geometry to misread. A reduction was the alternative, and the spec measured it placing two worlds on top of each other.

## 15. Transfer, dependencies and where the code goes

**Decision.** No run-time dependency. Sobol, the scramble, Jacobi, the neighbour regression, the kernel smoother and the least-squares fit are written here, together about 600 lines of arithmetic, which is the survey's own precedent for marching squares and a 4 × 4 matrix pair. Three new modules: `space.js` (sets, doors, worlds, the sequence) and `strategy.js` (screening, moves, share explained, terrain, kinds, sweet spots, tags), both DOM-free and engine-free so the Node harness calls the real arithmetic; and `strategy-view.js`, DOM-bound, drawing the plan, the archipelago and the moves panel.

**Estimated transfer:** about 70 KB of new source, landing near 20 KB brotli against SC-015's 60 KB. Measured against the baseline in `specs/006-design-space-survey/verify/baseline-size.txt` with the same brotli settings `scripts/deploy.mjs` uses.

## 16. What the plan still cannot know until it is built

Three figures no amount of reading can settle, each with a gate that measures it:

- **SC-004 at 16 bases on the page's own engine**: quickstart gate 6.
- **SC-008, the share explained on two year-long readings**, one of them a count against a threshold. It is recorded in CLAUDE.md whatever it comes out as: quickstart gate 7.
- **The jump sizes and their consistency on the reference desk**, which nothing has measured yet (the spec's *What the evidence does not yet cover*): quickstart gate 5.
