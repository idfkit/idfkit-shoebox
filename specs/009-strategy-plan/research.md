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
3. **Every island's own plan at reduced depth** (8 bases, 128 designs, of which the first 32 are the matched designs already run), in design-stage order, measured when the reader asks for that island, with its run count and estimated time stated before anything is spent. *Amended 2026-09-11 (section 20): this was automatic on a design-day desk, and is now on request on every desk.*

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

---

# Amendment 2026-09-11: width, campaign, panel

Four decisions from the 2026-09-11 clarifications, taken against the branch as it stands after the convergence phase (T079 to T115).

## 17. The pool's width: cores less two, bounded by half the memory

**Decision.** `src/pool.js` replaces `poolLimit` with `poolWidth({ cores, deviceMemoryGB, perInstanceMB = 256 })`, returning a frozen `PoolWidth` (data-model.md) whose `width` is

    max(1, min(cores − 2, floor((min(memory, 8) × 1024 / 2 − 256) / 256)))

where `memory` is `navigator.deviceMemory` or, where the browser does not report it, 4 GB. There is no fixed cap. The two cores held back are the page's main thread and the sheet's own engine; the 256 MB taken off the memory budget before dividing is that engine's heap. `deviceMemory` is Chromium's, and Chromium reports at most 8, so the memory term tops out at 15 engines (FR-011a).

**What it changes, as each browser reports the machine:**

| Machine as reported | Width before | Width after | What binds after |
| --- | --- | --- | --- |
| 4 cores, 8 GB (Chromium) | 2 | 2 | cores |
| 8 cores, no memory reported (Safari, Firefox, an iPad) | 3 | 6 | cores |
| 10 cores, 8 GB (Chromium) | 6 | 8 | cores |
| 12 cores, 8 GB (Chromium) | 6 | 10 | cores |
| 16 cores, 8 GB (Chromium) | 6 | 14 | cores |
| 24 cores, 8 GB (Chromium) | 6 | 15 | memory |

Before, the binding term was almost never the cores: a quarter of an assumed 4 GB held every Safari and Firefox visit to 3, and the cap of 6 held every larger Chromium machine to 6.

**The main thread's share, measured.** Every sample is built on the main thread before an engine can take it. Applying one design to the reference desk and writing its IDF takes **0.79 ms** on average (median 0.76 ms, 90th percentile 1.07 ms, 64 designs, full reporting profile, Node 22 on the same V8 the page runs). `buildSample` applies twice, the design and then the live desk put back, so a run costs about 1.5 ms of main thread. At about 50 ms per design-day run, a pool W wide spends about 3 % × W of the main thread building: 30 % at 10 engines, 45 % at 15. That does not saturate the thread, and it is not free. What keeps SC-002 is the scheduler's existing `paused()` while a hand is on a control, not the width; quickstart gate 9 step 2 is taken again at the new width, on the widest machine available.

**Stated, not hidden.** A browser may round or cap `hardwareConcurrency` for privacy, and not every browser reports memory. The plan letters the width it got and which term bound it ("10 engines side by side: 12 cores less two"), where it states a cost (FR-011a), so a reader on a capped browser sees why their plan is slower. The width changes when runs land, never what they read: nothing about it reaches the IDF or the link (Principle II).

**Alternatives rejected.** *N − 1* puts a sample on the sheet's own core, and a drag slows while the plan measures (SC-002). *Keeping the quarter-memory guard* leaves Safari at 3, the case the reader raised. *A reader-chosen width* was declined in clarification.

## 18. The campaign: pause, resume and cancel

**Decision.** The scheduler gains one additive operation, `holdWhere(pred, held)`, which sets a `held` flag on every active job the predicate matches. `takeNext` skips a held job; a run already on an engine is untouched and lands as usual; the scheduler is idle when nothing is in flight and no active job is unheld. The plan keeps a `Campaign` (data-model.md) in `main.js` whose state is `running`, `paused` or `cancelled`, and its three controls act on jobs of origin `'strategy'` only (FR-012a):

- **Pause** holds every plan job, and any plan job queued while paused (a door opened, an island asked for) is admitted held. The head says it is paused and how many runs wait.
- **Resume** releases them and drains. The queue continues exactly where it stopped, in the same order, because a held job keeps its `started` set.
- **Cancel** cancels every plan job as `'cancelled'`. Every completed run stays in the ledger. The plan queues nothing more until the reader presses Resume (which re-queues only what the ledger does not hold) or opens a door, which is a new world and a new campaign.

A pause survives a door: "not now" is about the reader's attention, not about the world. A cancel does not: it was a decision about the world being measured.

**Why hold rather than cancel and re-queue for Pause.** A cancelled job loses its place in the round-robin and its dispatch order, and re-queueing rebuilds its design lists (probes at every base, neighbours' pairs); a held job is resumed by clearing one flag. Pausing the whole scheduler through `paused()` was rejected: it would stop every study and the survey, which FR-012a forbids.

**The gate still governs.** Auto-solve off, a link attaching or a station attaching still cancels the plan's jobs (FR-012). When the gate lifts, the campaign's own state is honoured: a paused campaign comes back held, a cancelled one does not come back.

## 19. The panel on the left

**Decision.** `section#strategy` moves out of `section#survey` into `aside.planner#planner`, placed before `main.sheet` in the body. It mirrors `.desk` exactly: sticky at 16 px, at most the viewport less 32 px tall, scrolling inside itself, on the vellum ground, with the border and radius mirrored. `body.planner-open` shows it at `flex: 1 0 var(--planner)`, a new token at 436 px beside `--desk`, so the body's flex row is planner, sheet, desk (FR-001).

**The fit test is declared once, in the stylesheet.** The sheet keeps a minimum measure of 720 px (`--sheet-min`). Both panels stand open at full width wherever the window carries 720 + 436 + 436 px and the gutters, which is 1,624 px: a media query at that width sets `--both: 0` on the body and script reads the flag back, as `--index` and `--fold` are read today (Principle VII). Where `--both` is 0, opening one panel folds the other to its head: a 168 px rail (`--rail`, the ledger column's own width) carrying the panel's name, and for the plan its reading, its campaign state and its three controls, stacked. Below the index threshold (780 px wide or 600 px tall), the plan becomes its own page under the sheet and before the console, as the console already does (FR-046a).

**Where it is opened.** A button in the ledger beside the console's (`#planner-open`, mirroring `#desk-open`) and a link at the head of E-02 (FR-001). A strip tag's button opens the panel before focusing its entry, since the entry is now inside it. Pressing two controls in the screening still cuts the E-02 ground and scrolls the sheet to it.

**The drawings follow the column.** The plan, the one-move view and the ring size themselves off their host's width, which is now the panel's, so opening, folding or resizing a panel calls `renderStrategySoon`, as `openDesk` calls `renderTrace`.

**The general notes.** The plan's note targets `#planner` and its opener rather than `#strategy`, which changes what the step points at, so the storage key moves to `shoebox-general-notes-v6` (FR-048).

**Alternatives rejected.** An overlay drawer and one panel at a time were both declined in clarification. A grid for the three columns was rejected for the reason the desk's own comment gives: free space in a grid is handed to every unfinished track evenly, which would take the panels' growth out of the drawing's width.

## 20. What starts on its own (supersedes section 7, item 3)

**Decision** (FR-009a). On a design-day desk, opening the plan or stepping into a world starts that world's own designs and screening and every neighbour's jump, and nothing else. Each island's own screening starts only when the reader asks for that island, on every desk, with its runs and time stated first. On a weather year nothing starts until asked, as the convergence phase already built.

**What that does to a step into a world**, at the default desk's 32 varied controls and 19 neighbours, on design days:

| Stage | Runs | At width 4 | At width 10 |
| --- | --- | --- | --- |
| Home world, full | 1,024 | 12.8 s | 5.1 s |
| All 19 jumps | 608 | 7.6 s | 3.0 s |
| **Starts on its own** | **1,632** | **20.4 s** | **8.2 s** |
| One island's own screening, on request | 352 | 4.4 s | 1.8 s |
| All 19 islands, were every one asked for | 6,688 | 84 s | 33 s |

Before, a step started all 8,320 runs. It now starts a fifth of them, and the rest are the reader's to spend island by island.

---

# Amendment 2026-09-11 (second): the survey in the panel, the numbered sequence, and constraints

The 2026-09-11 clarification session settled thirteen questions. The first amendment above answered four of them. These sections answer the other nine, which fall into two groups: what the panel is now a panel *of* (FR-001 as revised, FR-001a, FR-001b, FR-019a, FR-046b), and the seventh user story, constraining the design space (FR-049 to FR-057). Every count and every line reference below was taken against the branch as it stands after Phase 15.

## 21. The survey moves whole into the panel

**Decision** (FR-001). `section.survey#survey` leaves `main.sheet` and becomes part 5 of the panel's sequence, carrying everything it owns: the axis chooser, the pull's own table, the ground, the relief, the spot readout, the coverage line, the ground key, the traverse, the finding, the schedule of spot heights and the E-02 stamp. The sheet keeps E-01 alone, and the panel's head carries the E-02 title. One ground, drawn in one place.

Today that section sits at `index.html:5636`, four levels inside the sheet (`main.sheet` to `div.body` to `div.field`). Moving it is mostly markup, and three things measured on the recon are not.

**The relief has no resize path, and inside a panel it needs one.** `createRelief(host)` makes its own canvas and takes its size from the host on every paint: `resize()` at `src/relief.js:414` reads `host.clientWidth` and `host.clientHeight`, and it is called only from `paint()` (`src/relief.js:440`), which runs on a draw, a viewpoint change, a step and a theme change. There is no `ResizeObserver` in the module, and `relief.repaint` is never called from `src/main.js` at all. The only window resize listener that knows about panels is `panelsMoved()` (`src/main.js:3505`), and it calls `renderTrace` and `renderStrategySoon` and nothing else. So a relief in the panel would keep whatever backing store it had when it was last drawn, and on a finished survey, where no further sample lands, that is for ever.

The fold makes it worse rather than merely stale. `body.planner-folded .planner-body` is `display: none` (`index.html:2577`), so a host inside the folded panel has `clientWidth === 0`, and `resize()`'s own `Math.max(1, ...)` floor turns that into a 1 by 1 canvas. Two changes, and both are needed:

- `resize()` refuses a zero box and keeps the last good size, because a measurement taken of a hidden element is not a measurement.
- `panelsMoved()` reaches the relief, as it already reaches the plate and the plan. A `ResizeObserver` was the alternative and is worse here: it fires through the fold's own transition, and the first frame it would see is the zero box.

**The two squares are laid out against the window, not against their container.** `.survey-body` is two equal columns (`index.html:4661`), flattened to one only under `@media (max-width: 900px), (max-height: 620px)` (`index.html:5320`). That is a window query, so in a 436 px panel on a 1,920 px window the ground and the relief would each stand about 200 px wide with `aspect-ratio: 1 / 1`, which is FR-046b's "one column at every width" broken by a media query that cannot see the panel. The fix is a **container query**: `container-type: inline-size` on `.planner-body`, and `.survey-body` going to two columns only above a declared container width. A container query is a platform API, which Principle V prefers to any script that would measure the panel and set a class.

`--survey` (`index.html:4360`) is the flag that query sets today, and its own comment records that nothing reads it back. FR-046b wants the side-by-side threshold declared once and read back, so it stops being write-only and joins `--index`, `--both` and `--cards` as a flag script asks about, for the one thing CSS cannot do: telling the two drawings what width to draw themselves at.

**What does not change.** `drawGround` writes a fixed `viewBox 0 0 320 320` (`src/main.js:9117`), so the plan scales into any column without being told. The SVG drawings in the panel already size off `host.clientWidth` through `frameFor` (`src/strategy-view.js:76`).

## 22. The numbered sequence, and the gates that have to stop being gates

**Decision** (FR-001a, FR-001b). The panel is one vertical sequence of six numbered parts, each headed by the question it answers: **1** the reading, **2** the plan and its moves, **3** the worlds one door away, **4** what pulls anywhere, **5** the ground cut along two of them, **6** the four kinds. The ground stands directly under the screening that hands it its axes, and the sequence closes on the decisions.

Four blocks are `hidden` today until something has been measured, and each is a gate of exactly the kind FR-001a forbids, because a part that is absent cannot say what it is waiting on:

| Block | Line | Hidden until | Becomes |
| --- | --- | --- | --- |
| `div.strategy-body#strategy-body` | `index.html:6000` | a plan exists | parts 2 to 4, each standing and saying what it waits on |
| `section.strategy-part#strategy-moves-part` | `index.html:6055` | two readings are chosen | part 6, standing, saying it needs a second reading |
| `section.survey#survey` | `index.html:5636` | a ground is cut | part 5, standing, saying two controls cut it |
| `div.survey-body#survey-drawing` | `index.html:5673` | a ground is cut | the drawings inside part 5, same rule |

**The two existing folds stay, and the rule is why.** There is exactly one `<details>` in the survey (`survey:spots`, the schedule of spot heights, `index.html:5759`) and exactly one in the panel (`strategy:designs`, every measured design, `index.html:6063`). Both hold the complete *record*; the readings themselves (`#survey-spot`, `#survey-coverage`, `#strategy-share`, the figures on both drawings) stand outside any fold already. That is the split the TM59 qualifications block and the survey's own schedule are both built on, and FR-001a's prohibition is on a reading in a fold, not on a record in one. Neither is a tab, an accordion or a wizard step, and neither shows one part at a time.

**Numbering is in the markup, not composed at render.** Each part carries its number in its heading, so the sequence reads the same with nothing measured as with everything measured, and a part cannot be renumbered by what has landed.

## 23. The panel's width, and the sheet's minimum

**Decision** (FR-046b). `--planner` (436 px) stays the base width and gains `--planner-max`; the sheet holds `min-width: var(--sheet-min)` so flex cannot take it below its own measure; the panel grows into what is left with `flex: 1 1 var(--planner); max-width: var(--planner-max)`.

`--sheet-min: 720px` is declared today at `index.html:52` and used in no rule at all: it exists to document the arithmetic behind the 1,624 px boundary in the comment at `index.html:2559`. FR-046b is what finally gives it a job, and it is the half that matters, because "the sheet MUST reach its own minimum before the panel takes any surplus" is a statement about the sheet's `min-width`, not about the panel's growth.

The sequence stays one column at every width for free: `.strategy-body` is already `grid-template-columns: minmax(0, 1fr)` (`index.html:5001`). The only two-column thing in the panel is the survey's own pair of drawings, which is section 21's container query.

`--planner-max` is declared, not measured, and it is the one number here that the driven gate has to confirm rather than derive. It is set so that the ground and the relief can stand side by side inside the panel at all, which needs two squares and the gap between them clear of the panel's padding. Gate 16 is what says whether the value chosen holds at the widths it claims.

## 24. Where a constraint binds, and why the re-cut is free

**Decision** (FR-049, FR-050). A constraint narrows the sequence itself. The Sobol coordinate is mapped into the constrained span rather than the control's full face, so every design generated after a constraint lies inside the region by construction, and there is nothing to filter afterwards.

There is exactly one place that mapping lives. `snapped(control, u)` (`src/space.js:314`) is called once, from `variedAt(index)` (`src/space.js:635`), which is itself called only from `designAt`. So the region binds there and nowhere else. Three things that follow are not obvious, and the third is a determinism hazard rather than a bug in waiting.

**The memo key has no region in it.** `variedAt` is memoised in `VALUES`, keyed by the design index alone (`src/space.js:628`, capped at 8,192). A constraint committed after a design had been generated would hand back the value from the unconstrained space, with nothing anywhere reporting the difference: the design would be drawn inside the region, keyed as if it were inside the region, and be a building from outside it. Principle II forbids exactly this, so the region joins the memo key.

**The moves are fitted over a normalisation that is still the full face.** `designAt` sets `u[at] = control.fraction(values[key])` (`src/space.js:669`), and `Ruled.fraction` divides by the control's whole range (`src/controls.js:339`). FR-052 requires an effect to be lettered per the constrained span, so the normalisation takes the region too. This is the second binding site, and missing it would produce shares and recipes that are arithmetically fine and about the wrong span.

**The probe step is sized off the full range as well.** `probesAt` takes `max(step, round(range / 20 / step) · step)` and steps up unless there is no room on the face (`src/space.js:748`). Under a constraint the twentieth is of the constrained span, and the room test is against the region's own bounds, or a probe would step out of the region the plan says it measured.

**Why SC-017 holds, and it is the survey's trick rather than a new one.** `samplePoints` anchors its grid at `control.min` and never at the extent's `from` (`src/study.js:140`), which is precisely what makes a narrowed survey axis land on bit-identical numbers and a re-cut cost nothing. `snapped` keeps the same property: it bins inside the region, but every value it returns is on the control's own global step grid, so one design measured before a constraint and the same design measured under it are one cache entry. Nothing else has to change for the re-cut to be free, because `deskKey` and `sampleIdentity` (`src/main.js:2288`, `:7433`) carry no notion of a bound at all: a sample's identity is the desk it built, and two identical desks are identical however the reader arrived at them.

Binning inside the region uses the same equal-probability rule `snapped` already uses over a full face (`src/space.js:304`), offset to the region's low stop, so the region's own rim stops are not sampled half as often as its interior.

## 25. What can be constrained, and what is refused

**Decision** (FR-055). A range constraint binds a `Scale` or a `Facade` side, pinning to one value being the degenerate case. A door constraint rules out settings: options of a `Selector`, or the in-or-out state of one of the five design-element channels.

**Only `Ruled` has a range to constrain.** `min`, `max` and `step` are fields of `Ruled` (`src/controls.js:316`) and therefore of `Scale` and `Facade` alone. `Bearing` and `Profile` carry no such fields: their ranges are literals inside `refuses` (0 to 360 at `src/controls.js:1631`, 0 to 24 at `:1634`). They are listed as not constrainable with that reason, which is the same shape of answer the plan already gives for a faceless kind. `Pattern`, `Days` and `Calendar` have no numeric face and are held already.

**A constraint cannot be hung on a control.** Every control is frozen in its own constructor (`src/controls.js:433` and the eight beside it). Constraints therefore live in a frozen map keyed by control key, owned by the desk, which is also what FR-051 asks for: they belong to the desk rather than to a world, so matched designs and the jumps taken on them still compare like with like.

**Four refusals, and the first is new validation rather than a reuse.** `refuses(control, value)` deliberately does not require step alignment (`src/controls.js:1622`), so it will not catch a region with no position in it:

| Case | Answer |
| --- | --- |
| A region narrower than the control's own step | Refused whole, naming the step, because no position on that control's grid lies inside it (spec edge case) |
| Every option of a door ruled out | Refused whole, naming the door. A design space with no world in it is not a space |
| A region excluding the desk's own stance | Kept. The stance mark stands outside it and says so, and the region is never widened to take it back in, which is `axisFor`'s own rule (`src/survey.js:306`) |
| A constraint on a control dark in this world | Kept, and stated as reaching nothing here, exactly as a dark control's effect is. It binds again wherever the control comes alive |

**A ruled-out door is never measured** (FR-055). It is dropped before `neighboursOf` (`src/space.js:559`) builds a world for it, and it is listed as ruled out **by the reader**, which is a different sentence from a world the engine cannot enter. Both lists stand, because FR-043 requires the plan to say what it has not visited.

## 26. The constraints link key

**Decision** (FR-051). One new reserved key, `cn`, read in `decodeState` beside `sv` and `sp`.

This is the fourth time this codebase has met the same trap, and the third time it has been written down before it was hit rather than after. `readValue`'s numeric regex runs before its per-kind switch (`src/permalink.js:448`), and the single-claim loop skips `RESERVED` before it ever calls `readValue` (`:594`), so a reserved key read in the right place is unreachable by the regex and a branch written inside the switch would be unreachable by the link. `RESERVED` becomes nine entries and keeps its load-time assertion against `ALL_KEYS` (`src/permalink.js:98`).

**The grammar is `sv`'s, because the escaping rules are the same.** `URLSearchParams` leaves only `*`, `.`, `-` and `_` unescaped; `-` cannot separate anything here because a bound may be negative, and `.` is spent on the decimal point inside a bound. One consequence is worth recording: a patch door's internal id is `patch:<channelId>` (`src/space.js:66`), and `:` is escaped, so that id cannot ride the link verbatim. The channel id alone is the link's spelling, asserted at load not to collide with any control key. The grammar is in contracts/constraints.md.

`LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty: adding a reserved key is free under delta encoding, and a link with no `cn` decodes exactly as it did before (US5 scenario 4, US7 scenario 7).

## 27. What these sections cannot settle until they are built

- **`--planner-max`**, which is declared rather than derived: gate 16.
- **Whether the moves are worth refitting under a constraint**, or whether the region's own sample is too small to fit them at the depths `DEPTH` declares. The arithmetic is unchanged, but a region a tenth of the face wide is a different sample, and SC-018's requirement that a constrained figure state its region is what keeps the answer honest either way: gate 14 step 6.
- **The cost of a re-cut in practice.** SC-017 says a narrower region runs nothing it already holds, which the min-anchored grid guarantees design by design. What no reading of the code settles is how much of a *typical* narrowing is already in the ledger: gate 15.
