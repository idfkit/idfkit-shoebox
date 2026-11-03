# Research: Tolerance bands

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-03

Each section records one decision: what was chosen, why, and what else was weighed. The two clarifications (targets = the chased standard's lines; levers = the studied ones) are settled in the spec and are not reopened here.

## R1. A study's runs do not carry what a band needs today

**Finding.** The spec's last open assumption was that "a study's runs keep every reading the chased standard's lines need". They do not. `jobForStudy` (`src/main.js`) builds a sample's contents from **one** quantity, the desk-wide `studyQuantity`:

```js
const { needed, carried } = sampleContentsFor([quantity], snapshot, patch, Boolean(epw));
```

`readPoint` then reads every quantity in `QUANTITIES` whose needs `built.carried.answers(...)`, and skips the rest. So a study drawn for *High + low zone temperature* carries only `Zone Mean Air Temperature`. Its points have no `demand`, `eui`, `peakHeat` or TM59 reading, and a band read from them could judge nothing but `overheat`.

**Decision.** Every study sample carries the **band contents**: the union, via `sampleContentsFor`, of the study's own quantity and every quantity that answers a `Target` of **any** published standard (`Preset.kind === 'standard'`), resolved against the snapshot's engaged channels as `contentsFor` already does. The list is a module constant (`BAND_QUANTITIES` in `src/tolerance.js`), derived from the declarations: for each standard's targets, the `READING_BY_ID[target.metric].quantity`.

**Rationale.**

- **Switching the chase costs nothing.** Sample identity (`sampleIdentity`) includes `carried.serialize()`. If the contents depended on which standard is chased, chasing would change every sample's identity and re-sweep every study, against SC-004. Carrying all standards' needs makes the chase a pure re-reading, as it already is for the scoreboard and for feature 012's isolines.
- **The chase stays off the shape.** `shapeKey` and `restShapeKey` must not learn about the chase (Principle II, and the register note: the chase is how the desk is read, not what it is). Contents keyed on all standards, not on the chased one, keep it so.
- **The study's own reading is unaffected.** `carried.answers(needed)` still holds for the study's quantity, because the carried set is a superset of it.
- **Channel preconditions stay honest.** `contentsFor` already drops meters whose end use needs a channel that is out, and `sampleContentsFor` sends only the quantities' own `channels` as preconditions. A quantity whose `needs.channels` names a channel the snapshot has out (`demand`, `peakHeat`, `peakCool` need System, TM59 a and c need Gains) is **left out of the union** for that snapshot. If it were included, `syncReporting` would throw inside `buildSample` and every sample would land as a gap. Its targets are then "not judged" for the stated `targetBlock` reason (R6).

**The cost has to be measured, not assumed.** The union adds, at most: `Zone Operative Temperature` and the occupancy `Schedule Value` (hourly, zone level), `Zone Air Heat Balance System Air Transfer Rate` (hourly, zone level), and the building meters (Monthly). All are zone- or site-level, as Principle VI requires, and the solve already asks for most of them. Gate G1 in [quickstart.md](./quickstart.md) measures one design-day and one annual run at default contents against band contents, 20 runs each, one EnergyPlus per process. **Budget: the median grows by no more than 10 %.**

**If G1 fails**, the fallback is a planning decision, not a runtime one. Carry the band contents only while a standard is chased, and amend SC-004 to "switching between chased standards adds zero runs; the first chase re-sweeps each study once". This is recorded so `/speckit-tasks` can branch on the measurement. It is not built speculatively.

**Alternatives considered.**

- *Carry only the chased standard's needs.* Rejected: it changes sample identity on every chase toggle (SC-004), and a study re-sweeping because of how the desk is being *read* is the confusion the register note warns against.
- *`EVERY_NEED`, the union of all `QUANTITIES`.* Rejected: it adds `Site Outdoor Air Drybulb Temperature` (lag) and the cost and carbon meters, which no target reads. The union should be exactly what the targets need.
- *A second sweep for bands.* Rejected by the clarification: bands add no runs of their own.

## R2. Which reading answers a target

**Decision.** Reuse the matching that feature 012 already proves at load in `src/survey.js`. A target is answered by `READING_BY_ID[target.metric]`, subject to the same qualifier rule (`QUALIFIER_BY_METRIC`: `overheat`'s `above`, TM59's `category`). Export one helper from `survey.js`, `readingForTarget(preset, target)`, which returns the `Reading` or throws naming both declarations. `tolerance.js` calls it; it does not re-derive the mapping.

**Rationale.** Principle III: one declaration, one matcher. The two TM59 categories publish the same limit, so a second matcher that dropped the category would judge Category II ground against a Category I line and land at exactly the right height. That trap is documented, and 012's invariants already guard it.

**Alternative.** A `metric → quantity` table in `tolerance.js`. Rejected as a second copy of the matching.

## R3. What a band is, and where its edges are

**Decision.** For one study curve (the points of one `job`), sorted by position:

1. Classify each point:
   - `pass`: every judged target's `meets()` is `true`.
   - `fail`: at least one is `false`. The failing targets are kept.
   - `refused`: `point.refused`, with its sentence.
   - `gap`: `point.sample == null`, or a judged target's reading is non-finite at this point while it is finite elsewhere on the curve.
2. **Segments** are maximal runs of consecutive `pass` points.
3. **The band** is the segment containing the snapshot's own value. On a failing desk it is the nearest segment by position; a tie goes to the lower side and is stated as a tie.
4. **Each edge** is the band's outermost passing point together with its outward neighbour (`fail` / `refused` / `gap`), or the control's stop when the segment reaches `min` / `max`.

**Rationale.**

- **Nothing between samples is claimed.** FR-004 forbids lettering an edge that was not run, so there is no interpolation. The edge is the bracket.
- **The curve already holds the right positions.** `samplePoints` lays positions on the control's own step grid, and `axisFor` / `sampleOrder` force the stance value in. So the band always contains the actual setting when it passes, and coarse (11) nests inside fine (21). FR-006's "coarse then refined" is the study's own coarse/densify lifecycle; the band recomputes on every `'point'` update.
- **The tie rule is written down** because "nearest" with two equidistant candidates is a silent choice otherwise (Principle IV). It is stated in the band's line, not chosen quietly.

**Alternatives.** Linear interpolation of the limit crossing: rejected, as a claimed value between runs. Fine-only bands: rejected, because a coarse band is useful the moment it lands, and US3 asks for the bracket to narrow visibly.

## R4. "Smallest move" across levers in different units

**Decision.** A restoring move's size is its **share of the lever's travel**:

```text
|target position − stance| / (max − min)
```

The ranking and the named lever use that share. The figure lettered in view is the move in the lever's own units (through `spanKind`, since a move is a difference), with the share beside it, e.g. `+0.15 (8 % of travel)`.

**Rationale.** It is the same argument the chase makes for ranking by ratio rather than difference. 0.1 m²K/W and 0.1 of glazing ratio are not comparable; 8 % of a lever's travel is the same claim on both. The share is also what FR-008's "how much of its travel lies inside its band" is measured in, so one normalisation serves both.

**Alternative.** Raw distance in the lever's units: rejected, because it is incomparable across levers. Distance in steps: rejected, because step sizes are a lettering choice (`digits`), not a design quantity.

## R5. Which target closes an edge

**Decision.** An edge closed by `fail` names **every** target that fails at the outward point (FR-005: "together with any other target that also fails within the same bracket"). They are ordered by ratio to the limit, worst first, using `chaseVerdict`'s ranking. A refused edge letters the refusal sentence `sampleRefusal` produced; a gap edge says the run did not finish there. Neither counts as a target failing (FR-013).

## R6. Targets the run cannot judge

**Decision.** A target of the chased standard is **judged** by a study's band only when:

- its `limit != null`, and
- its reading is finite on at least one non-refused point of that curve.

Otherwise it is **not judged**, and the reason is `targetBlock(target).says`. That is the same sentence the scoreboard's margin letters for the same target, so the band panel and the board cannot disagree about why (Principle III). A target with `limit == null` is listed as carrying no line, in the standard's own words (`target.asks`), as 012's `absenceIn` does.

If no target of the chased standard is judged on a curve, that study gets no band and the panel states the shared reason (`sharedAbsence` where it applies).

**Rationale.** FR-011. The band never claims "all targets" when a design-day run could only read the peak loads.

## R7. Where the bands are drawn

**Decision.** Two surfaces:

1. **On each study card** (`console.js` `setStudy`): a band drawn on the curve's own position axis as a bracketed bar. Hairline brackets mark each edge, the passing stretch gets a hatch, and other passing stretches get a lighter hatch. One line under the curve reads, for example: *"Passes Passivhaus 0.20 to 0.45 · closed above by Space heating demand"*. The words carry pass and fail; colour does not (FR-015).
2. **A tolerance block under the chase line** (`#chase`, beside the drawing, `renderChase`). The chase is where the reader has already said which standard matters, so the summary sits with it:
   - **Passing desk:** the studied levers ranked by share of travel inside the band, least free first.
   - **Failing desk:** the failing targets, the named restoring lever and position, or "no studied lever can do it alone" plus, per failing target, the levers that could clear it.
   - The count of levers asked ("3 levers studied").
   - The one-line caveat ("Each band holds every other lever where it stands.").
   - The not-judged list.

**Rationale.** The study card is where the lever is, and the chase line is where the standard is, so neither surface needs a new region of the sheet. Principle VII: both are text plus a bar and fold at 390 px like the existing study cards. A new E-03 drawing was considered and rejected: the content is a list keyed by studies that already have cards.

**Design system.** The bracketed band is a new component pattern. It uses no new hue: hairline brackets, the existing hatch vocabulary from E-02's passing band, and `--redline` only for the named lever, as the one markup pen. It is recorded in `.interface-design/system.md` in the same change (Gate 8).

## R8. Staleness, clearing, climate

**Decision.**

- **The band follows its study's state** and holds no state of its own. A card drawn `stale` draws its band dimmed with the same class. The tolerance block is marked stale whenever any banded study is stale, and says how many are.
- **On a station or file change**, `attachClimate` already clears every study (the sample shapes carry no climate). The tolerance block letters a transient reason, *"Bands left with the studies when the climate changed"*. It is set in `attachClimate` and cleared by the next study landing. This is FR-018's stated reason; no other state is kept.
- **Stop or "Set studies aside"**: the band is drawn from whatever points landed and marked *incomplete* where the curve has unsolved positions. An edge whose outward neighbour is unsolved is lettered as unknown beyond the last measured position.
- **On a chase toggle**, `renderChase` and every `setStudy` re-read their bands. That is pure, with no run (SC-004).
- **On a priced commit**, `redrawStudiesForQuantity({ queue: false })` already re-mints every curve through `priceAt`, and the bands follow (FR-019).

## R9. Lettering and units

**Decision.**

- **Positions** letter through the swept control's own `format`, the same lettering as the margin field.
- **Band widths and moves** are differences. They letter through `spanKind` / `spanUnitNow` (`deltaKindOf`) at a flat precision, never through `precisionFor` (the "span along a face is a difference too" invariant).
- **Target figures** letter through `Target`'s own `unitNow` / `digits`.
- Every `aria-label` that letters a band figure is registered as a thunk replayed by `reletter()`, as `studySweeps` is.
- No cache of lettered strings is kept, so nothing needs `system()` in a key.

## R10. Copy, notes, budgets

**Decision.**

- **In-view strings** (the caveat, the "turn a study on" and "chase a standard" absences, and the climate reason) are declared once and asserted with `withinBudget(BUDGETS.STANDING, …)`. Method and the full one-at-a-time argument go in a `fold()` under the block.
- **General notes:** the study step and the chase step now teach something new. `NOTES` in `src/tour.js` gains the sentence, a `tour?.note(...)` call fires when the first band is drawn, and `STORE` bumps `shoebox-general-notes-v7` → `-v8` (Gate 6).

## R11. Performance of the read

**Decision.** A band is recomputed on each study `'point'` update: at most 21 points × at most 11 targets of `meets()` per study, which is trivial. The tolerance block is coalesced through one `requestAnimationFrame` flag. It must check `document.visibilityState` before trusting a stale-looking figure, as noted for `renderSurveySoon`; the flag is cleared outside the callback when the tab is hidden, so the block does not freeze in a background tab.

## R12. A lever that cannot move any line

**Finding.** With the wider contents of R1, every study's points carry the chased standard's readings, including readings the swept lever has no way to move. A study of `gasPrice` reads the same TEDI at every position, so every position passes or every position fails. If it passes, `bandFor` would build a band from stop to stop. That reads as "complete freedom" when the truth is "this lever does not touch this line", and FR-012 forbids drawing it that way.

**Decision.** `Band.inert` is set, with its reason, before any segment is built. It is set in either of two ways:

1. **Declared, for priced levers.** The key is in `PRICED_KEYS`, and for every judged target `!readingForTarget(preset, target).quantity.movedBy.has(key)`. Reason: *"{lever} reaches only the bill, and none of {standard}'s lines is read from it."* This is the same declaration `refusesPairing` already trusts. It is checked against the real bill by the reach harness, so it is not inferred from a flat line.
2. **Measured, for every other lever.** For every judged target, the reading is exactly equal across every solved, non-refused position, with at least two such positions. Reason: *"{lever} did not move any of {standard}'s lines across its travel."* The test is exact equality, not a tolerance. This follows the pull's rule (`direction` is `'none'` only where the effect is exactly zero), and it relies on the same fact: the engine is repeatable on one input. A coarse curve that is flat but incomplete stays undecided until the curve is complete, so it is never declared inert off a partial sweep.

**How it is shown.** An inert band draws no bar. Its card letters the reason, and the tolerance block lists inert levers separately from the ranked ones. They are counted among the levers asked, never ranked as most free, and never offered as a restoring move.

**Partial reach is not inert.** A lever that moves some judged lines and not others is banded normally. The lines it cannot move simply pass or fail at every position, and the edges are closed by the lines that do move.

**Alternatives.**

- *A noise tolerance on "flat".* Rejected, because there is no noise to tolerate. A tolerance would also call a lever with a genuinely tiny effect inert, which is a claim the measurement does not support.
- *Leaving priced levers to the measured test.* Rejected. It would pass on the same evidence, but it would hide the reason ("reaches only the bill") behind a measurement, when a declaration already says it.

