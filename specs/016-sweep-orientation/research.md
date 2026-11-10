# Research: Sweep the building's orientation

Phase 0 for [plan.md](./plan.md). Each section records a decision, why it was taken, and
what else was considered. The inventories behind them were taken by reading the study
path (`study.js`, `scheduler.js`, `console.js` `studyCard`, the five study call sites in
`main.js`, `permalink.js` `sty`) and the survey path (`survey.js`, `relief.js`, the E-02
drawing in `main.js`, `permalink.js` `sv`, `pull.js`). Line numbers below are as of
`d1e1f0d`.

## R1. What North axis must carry to be sweepable, and how only it carries it

**Finding.** The one gate is `refusesSweep` (`study.js:110`), which asks for finite
`min`, `max` and `step`. Study, survey axis (`refusesAxis`, `survey.js:409`), the axis
chooser (`main.js:9971`), the pull roster (`pull.js:210`) and the `sty` / `sv` codecs
all ask it. `Bearing` (`controls.js:594`) extends `Control`, not `Ruled`, so it carries
none of the three, and none of `fraction`, `valueAt`, `figure`, `unitNow`, `spanKind`,
`spanUnitNow`, `parse`, `quantityKind`, `landmarks`.

There are two Bearings. If the class gained a range, `ctxAzimuth` would too, and it has
no note, so the load assertion at `study.js:128` (every sweepable control has a note)
would throw. It would also put "Bearing from site" into the pull and the chooser, which
the spec rules out.

**Decision.** A typed `Wrap` (the spec's "wrapping range") is declared on North axis
alone: `new Bearing({ key: 'northAxis', …, wrap: new Wrap({ step: 1 }) })`. A Bearing
holding a `Wrap` exposes `min = 0`, `max = 360`, `step = 1` and `wraps = true`, and
carries the members the sweep paths call (R9). `max` is the period, not a position: on
a wrapping face 360 *is* 0, and `max` exists so that `fraction`, an axis's length and
the pull's "a twentieth of the face" keep their meaning. A Bearing without a `Wrap`
is unchanged, so `ctxAzimuth` keeps the sentence it is refused with today. FR-003 holds
because `refusesSweep` stays the only rule.

**Alternatives.**
- *Make Bearing extend Ruled.* Rejected. It drags in `readLandmarks`, `assertReachable`
  and `precisionFor` for a control with no landmarks. It also hands `ctxAzimuth` a face.
- *A new control kind (`compass`).* Rejected. It is the four-gate change CLAUDE.md
  warns about (console, `readValue`, key ownership, `assertHideable`) for no gain. The
  rose is already drawn by `buildBearing`.
- *A carve-out in `refusesSweep` naming `northAxis`.* Rejected. It is a second rule
  wearing the first one's name.

## R2. Grid counts: 8 then 16, and where the counts live

**Finding.** The counts are module constants: `COARSE_SAMPLES` / `SWEEP_SAMPLES`
(11/21) and `COARSE_GRID` / `FINE_GRID` (6/11). They are passed by name at eight sites:
`main.js:9091`, `:9155`, `:9174`, `:9227`, `:9254`, `:9274`, `:9484`, `:5480`; for the
survey `:2256`, `:9745`, `:9804`, `:9838`, `:10744`. `surveyGrid` is one number for both
axes.

**Decision.** One function per surface, asked of the control:
`studyCounts(control) → { coarse, fine }` in `study.js` and
`gridCounts(control) → { coarse, fine }` in `survey.js`. Each returns `{8, 16}` for a
wrapping control. Otherwise they return the existing constants, which keep their names.
Every site above asks the function. `job.coarse` becomes `job.asked === counts.coarse`
for the job's own control. A survey carries counts per axis, so a ground of North axis
against glazing is 8 × 6 coarse and 16 × 11 fine.

**Why 8/16 and not 11/21 on a circle.** The spec settles this (Assumptions, "Grid
sizes"). Two facts make it cheap. The fine set nests the coarse one, so FR-006 holds.
The survey along a wrapping axis uses the *same* 8/16 as the study, so every
orientation a study measured is a cache hit for a survey row. That is a stronger
sharing than the linear case, where 6/11 lands inside 11/21 on only some faces.

**Run budget (SC-002).** The coarse pass is 8 runs against 11 and the fine pass adds 8
against 10. Both fall within the ruled budget.

## R3. Sixteen points on a whole-degree grid

**Finding.** 360/16 = 22.5, which is not whole. The rose sets whole degrees only
(`console.js:968`, `Math.round`). The link accepts fractions (R4), but no gesture
makes one. `Bearing.format` letters 22.5 as `23° NNE` (digits 0), so a point at 22.5
would be lettered as a building the reader can turn to and that was not the one run.

**Decision.** Positions are snapped to the control's own grid (step 1) with
`Math.round`, as every sweep snaps. The fine set is 0, 23, 45, 68, 90, 113, 135, 158,
180, 203, 225, 248, 270, 293, 315 and 338. Spacing alternates 23° and 22°. Every
position is one the rose can stand on (SC-003 is then checkable by hand). Every
position is named by the 16-point table in `format`, because `round(v / 22.5)` lands on
its own index for each one. The coarse eight are multiples of 45 and are untouched by
the snap.

A load assertion in `study.js` states the nesting, for whatever `Wrap` is declared:
every coarse position is a fine position, and no two fine positions snap together.

**Alternatives.**
- *Step 0.5.* Rejected. Half the fine points are unreachable by the rose and lettered
  as a neighbour.
- *Twelve positions every 30°.* Rejected. The positions would carry no compass name
  (FR-005).

## R4. 360, fractions and the link version

**Finding.** `refuses` (`controls.js:1766`) admits a bearing in `[0, 360]`, closed, with
no whole-number rule. So `#v1&northAxis=360` decodes today as a desk distinct from the
default. It mints its own `deskKey` and its own cache entry, and `turn()` runs at 360
(the `!degrees` shortcut applies only at 0). Fractions such as `northAxis=12.5` decode
too.

The spec wants 360 "read and written as 0" and, in the same edge case, a value at or
beyond a full turn "refused whole". The constitution (Principle II) requires that
narrowing a range bumps `LINK_VERSION` with a migration.

**Decision.** Narrow the wrapping control's range to `[0, 360)` and bump the link to
`v2`:

- `DEFAULTS_BY_VERSION.v2 = DEFAULT_PARAMETERS`. No default moves; `v1` is frozen as it
  stands.
- `MIGRATIONS.v1` rewrites `northAxis=360` (exactly that text, or any spelling of
  `Number(raw) === 360`) to drop the pair, since 0 is the default. Anything else passes
  through untouched, so an out-of-range `v1` value is still refused by `readValue` with
  today's sentence.
- Under `v2`, `refuses` returns "is outside its 0–360 range, and a full turn is 0" for
  `v >= 360`. That is the refusal-whole the spec asks for.

This reconciles both sentences of the edge case: a `v1` link carrying 360 is *read* as
0 by a stated migration, never wrapped silently by the decoder, and a `v2` link
carrying it is refused. Fractions are not narrowed. They decode as they do today; a
study simply keeps the stance verbatim among its points, as `samplePoints` does for any
off-grid stance.

**SC-005 caveat, to measure (quickstart gate 2).** A `v1` link at 360 now builds the
document at 0. If `turn()` at 360 differs from 0 by floating-point residue, that link's
IDF bytes change while the building does not. No gesture or kept scheme can have
produced such a link, since the rose writes `% 360`. The quickstart measures the
difference rather than assuming it.

**Alternatives.**
- *Keep `[0, 360]` and map 360 to 0 in `readValue`.* Rejected. It is a silent wrap
  (Principle IV).
- *Keep `[0, 360]` and accept the duplicate.* Rejected. A study's closing point would
  be a second cache identity for the same building, and FR-004's "read as 0" fails.

## R5. Drawing a closed curve on a straight card

**Finding.** The study card (`console.js:2110–2398`) maps `x` through
`control.fraction`. It draws open polylines broken at null readings, letters the two
ends with `format(min)` / `format(max)`, interpolates the tick's reading linearly
(`readAt`), and maps a click through `valueAt`.

**Decision.** Keep the straight card and draw the circle as a period. With
`max = 360`, `fraction` places 0 at the left and 360 at the right. The curve gets one
extra drawn vertex at 360 carrying the reading measured at 0. This is the *seam point*:
drawn, never sampled, never counted. It is added by the card from the curve's own
0° point and dropped if that point is a gap, so the edge case "a run fails at one
orientation" breaks the closure exactly as a gap breaks any segment.

Under that one rule:
- the closing segment is "like any other" (FR-007);
- `readAt` interpolates between 338° and north without a special case (FR-008);
- a desk at 350° stands where it stands;
- `valueAt(1)` returns 360, which the card hands back through `wrap.norm` as 0.

The foot letters `0° N` at the left and `N, again` at the right, with the axis caption
"the whole turn; wraps at north" (wording to fit `BLOCK`). Ticks stand at the eight
principal points. Only the eight are lettered, and at 390 px the four cardinals only.

**Alternatives.**
- *A polar plot.* Rejected. It is a second card geometry with its own tick, click and
  gap rules, and it is unreadable at 390 px for a reading whose range is small against
  its value.
- *Repeat the first point at both ends as a sample.* Rejected. 360 would be a second
  cache identity (R4).

## R6. Read the turn back off the document (FR-010)

**Finding.** `buildSample` (`main.js:8791`) already reads one document fact beside
`writeIdf` (`geometryFacts(model).grossFloor`). `geometryFacts(...).faces` carries each
wall's `side` (its plan name, which does not turn) and `bearing`, measured off the
outward normal of its vertices (`model.js:2751`). At North axis 0 the wall the plan
calls south faces 180°.

**Decision.** Add `turnOf(facts)` in `model.js`, defined as
`norm(bearing of the 'south' plan wall − 180)`. It identifies the wall by its plan side,
which is the identity that turned, never the compass word. `buildSample` returns
`turn: turnOf(facts)` when the job's key is a wrapping control, and the scheduler
stores it on the point. The card and the survey place the point at the *measured*
turn.

If the measured turn differs from the asked position by more than 0.01°, the position
is a failed position with the reason "the document turned to X, not Y". It is never
drawn at either. The same check runs for survey rows sweeping North axis, since they go
through `buildSample` too.

## R7. A survey axis that wraps

**Finding.** Every consumer of the lattice walks cells as `ix < nx − 1`:
`contoursOf` `:1018`, `meshOf` `:1100`, `surfaceAt` `:1131`, `blockOf` `:1177`,
`strataOf`, `arrisesOf`, `passingGround` `:2284`. Positions are read as
`positions[0]..positions.at(-1)`: `standingAt` `:709`, `standingRefusal` `:1361`,
`freeExchange` `:1436`, `groundFrame` `:10766`, `axisRules` / `letterAxes` in
`relief.js`. Neighbours are `ix ± 1` without modulo: `fallStep`, `refineOrder`, the
keyboard cursor at `main.js:11463`.

Three further defects bite before any of that:
- `Axis.indexOf` uses `step / 1000` and is NaN for a bearing, so a densify drops every
  coarse point (`main.js:9816`).
- `axisFor` refuses `from > to` (`:376`).
- `inside` (`:385`) uses min/max and would invert a 300→60 extent.

**Decision.** The seam lives in the *cell walk*, not in the data. `Axis` gains:
- `closed`, true for a whole turn;
- `cells`, which is `count` when closed and `count − 1` otherwise;
- `next(ix)`, which is `(ix + 1) % count` when closed;
- `offset(v)`, the clockwise distance from `from`, in `[0, span]`;
- `at(f)`, the value at a fractional index, where `f` may reach `count` on a closed
  axis and means north again.

Every consumer above iterates `ix < axis.cells` and takes its neighbour through
`axis.next`, `blockOf` and the relief included. The lattice stays `nx × ny`, so
`Coverage` counts each orientation once without a guard (FR-012), and its existing sum
assertion keeps holding. `meshOf` emits one aliased vertex column at `ix = count` so the
relief closes. `relief.js` divides by `cells`, not `nx − 1`.

A narrowed extent is an *open* wrapping axis. `from > to` means clockwise through north
(FR-014). Positions are spaced along `offset` with the open `i / (n − 1)` rule,
normalised to `[0, 360)`, and ordered by offset rather than by value. `inside`,
`standingAt` and `freeExchange` measure by `offset`. A whole turn is written `0_360`,
the only place 360 is admissible, as an extent end and never as a value. `from === to`
is refused with a sentence.

The extent field (`main.js:10463`) loses its "lower figure to a higher one" refusal on a
wrapping axis and gains "the same bearing at both ends is no extent".

The `sv` grammar is untouched. `300_60` already parses; it is refused today only by
the bounds check, and no `sv` has ever carried `northAxis`, so nothing narrows.

**Alternatives.**
- *Duplicate a column at 360 in the lattice.* Rejected. Coverage, `measured` /
  `passing` sums, the spot schedule and the cursor would each need a "don't count the
  ghost" rule. That is five guards against one double count, where the cell walk needs
  one rule.

## R8. The pull (FR-015, amended)

**Finding.** `pull.js:220` steps a control by `max(step, round((max − min) / 20))`. For
a 360° face that is 18°. It steps up where there is room and down otherwise, and
letters "room" to the stop.

**Decision.** Use the same measure, as FR-015's first clause asks: 18°, always
clockwise, `to = norm(here + 18)`. The effect divides by the signed short arc (+18),
not `to − from`. `PullEntry` gains `wraps`, under which `room` is `null` and the
`room === 0 ⇔ atStop` invariant is not asked. The entry letters "turned 18° clockwise"
where a ruled entry letters its room.

**Spec amendment.** FR-015's "one fine step" is 22.5°, which is not whole (R3) and is
not the measure the pull applies to anything else. The plan amends the wording to
"one twentieth of a turn, 18°, clockwise". This is the same kind of correction 011 made
to its spec in planning.

## R9. Units and lettering

`KINDS.angle` exists, identity in both systems, digits 0 (`units.js:206`). A wrapping
Bearing letters through it as today.

- `unitNow` is `''`, in the same way a prefixed `resistance` carries nothing after its
  figure: `format` already ends in a compass point (`135° SE`), so an axis heading that
  said `°` would say the unit twice and `stopOf` would fail to strip it. Axis stops are
  `format` whole.
- `spanKind` / `spanUnitNow` are `KINDS.angle` / `°`. These are for the pull's
  "per degree clockwise" and E-02's exchange sentence (`amountOn`), whose `dx` is now a
  signed short arc.
- The harness assertion `format(v).endsWith(unitNow)` holds trivially. SC-006 is
  checked by lettering every new figure in both systems and diffing.

## R10. The rose as a study host

**Finding.** `buildBearing` registers only `faces.set`. It sets no `rows` (so
`setStudy` throws "no control row to hang the study of …"), no `probes`, no
`studySweeps` and no `studyOffer`. Its face is also chained onto by `buildFacade` and
`buildBoundary` through `faces.get('northAxis')`.

**Decision.** For a Bearing with a `Wrap`, `buildBearing` registers `rows`, a `probe`
(a redline radius on the rose at the probed bearing) and the `studyOffer` with a
`studySweeps` thunk. The offer's label reads "sweep the whole turn, from north round
to north". Its face composes with any face already registered rather than replacing
it. Site (01) is built first today, but the chain must not depend on order. `idle` and
`shown` are toggled as on any row. A Bearing without a `Wrap` gets none of this.

## R11. Silent traps found in passing

- **`describe.js:101`** tests `typeof control.fraction === 'function'` *before*
  `kind === 'bearing'`. Once North axis has a `fraction`, its shortest-way-round
  distance would be skipped without a sound. The bearing branch moves first.
- **The chooser's faceless heading (`main.js:10219`)** says "a bearing … carries no
  minimum". After this change it is true of one bearing, not both. It is reworded to
  name "the neighbour's bearing".
- **`main.js:11105` `dense = count > 7`.** This reads an 8-position coarse axis as dense
  and thins its figures. The threshold is asked of `gridCounts(control).fine` instead.
- **Sample identity.** Positions are always normalised to `[0, 360)` before
  `deskAt`, so 0 and 360 can never mint two identities.

## R12. General notes (FR-017)

`src/tour.js` has no step that teaches what can or cannot be studied (`grep` finds no
study, sweep or bearing in `NOTES`). There is nothing to update and no storage-key
bump, as in 011 R12. The faceless sentence in R11 is the one place the sheet teaches
the rule, and it is updated.

## R13. Best and worst on the card (FR-009)

No study card letters extremes today. For a wrapping study only, the card letters one
line in view: "Lowest 135° SE · highest 315° NW". It uses `lowest` / `highest` rather
than best and worst unless the reading declares `better`, so the sheet grades nothing.
Ties letter "lowest at N positions" with no bearing chosen. The figures are the plotted
points' own (R6), so each is one the sheet would letter with the rose there. The line
is within `BLOCK` and outside any fold.
