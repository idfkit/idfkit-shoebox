# Phase 0 — Research: threshold isoline on the survey

Eleven questions, each resolved against what the repository already holds. Nothing
below is a NEEDS CLARIFICATION; the spec's own Clarifications session settled the three
questions about multiple standards and the chase, and these settle the rest.

---

## R-1. Where a published limit already lives, and what a threshold therefore *is*

**Decision.** A threshold is a `Target` instance from `src/schemes.js`, held by
reference. Nothing about it is copied into a second number: `Threshold.limit` is a
getter onto `target.limit`, and the label reads `target.label` and the preset's `name`.

**Rationale.** FR-009 asks that a drawn line can never disagree with the verdict shown
for the same reading and standard. The scoreboard (`renderScore`) and the chase line
(`renderChase`) already read these exact objects, and `chaseVerdict` ranks them. A
copied figure is the second source of truth Principle III forbids, and it is precisely
the drift the codebase has been bitten by elsewhere (the contour label lettered off
`toFixed`, which bypassed `Reading.figure` and drew an SI contour on an IP sheet).

**The roster as it stands**, read off `src/schemes.js` — this is the whole population
the feature has to be right about:

| Survey reading | Thresholds today | Note |
| --- | --- | --- |
| `tedi` | Passivhaus 15, EnerPHit 25, LETI 15 | three; **two coincident** |
| `overheat` | Passivhaus 10, EnerPHit 10 | two; **coincident**; both `above: 25` |
| `eui` | LETI 55 | one |
| `peakHeat` | Passivhaus 10 | one; `needs: 'run'` |
| `tm59a` | TM59 cat I and cat II, both at `CRITERION_BY_ID.a.limit` | one applies — see R-4 |
| `tm59b` | TM59 cat I and cat II, both at `CRITERION_BY_ID.b.limit` | one applies — see R-4 |
| `tm59c` | TM59, `CRITERION_BY_ID.c.limit`, no category | one |
| `cedi` | Passivhaus, `limit: null` | **absence**: per building and climate |
| `peakCool` | Passivhaus, `limit: null` | **absence**: same |
| `high`, `low` | none | **absence**; these are the two `CONVENTION` readings |
| `cost`, `carbon` | none | **absence** |

**Alternatives rejected.** A new `THRESHOLDS` table in `survey.js` restating the
figures: a second place for 15 kWh/(m²a) to be spelled, and the exact defect FR-009
exists to prevent. Reading the limits out of `tm59.js`'s `CRITERION_BY_ID` for the TM59
criteria and out of the presets for everything else: two matching rules where one will
do, and it would have missed that TM59's criteria reach the sheet as a preset's targets
like every other line.

---

## R-2. Which side passes, without declaring it twice

**Decision.** Probe `Target.meets` either side of the limit and take the answer.
`passesBelow` is true when `meets(limit − ε)` is true and `meets(limit + ε)` is false,
with `ε = max(1, |limit|) * 1e-6`. Where the probe does not give exactly one of those
two shapes, throw at module load naming the target.

**Rationale.** `Target.meets` is the sheet's single published comparator and its own
comment records that TM59 was checked against it rather than assumed — "not more than
four nights" is the same `<=` as "≤ 15 kWh/(m²a)". A second declaration of the pass
side on `Threshold` would be free to disagree with the comparator the scoreboard
actually uses, which is the FR-009 defect again one field along. Probing reads the
answer off the one declaration. Today every target on the sheet passes below; the
probe records that as a measurement rather than baking it in, so a future target that
passes above draws its band on the other side without anyone editing this feature.

**Note on `Reading.better`.** `SENSE` is *not* the pass side and must not be used as
one. It is a direction of improvement, it is declared for `low` as `'higher'`, and it
carries the `CONVENTION` prefix for exactly the two readings that carry no limit. The
improving region and the passing ground are different judgements, which is what the
spec's edge case about the stance on the failing side is about.

**Alternatives rejected.** A `passes: 'below'` field on the new `Threshold`
declaration. Reusing `Target.above`: that is the temperature an exceedance frequency
is counted above (25 °C), not a pass direction, and conflating the two would have made
`overheat` read as passing above 25.

---

## R-3. The geometry of the line

**Decision.** `contoursOf(lattice, [threshold.limit])` — the existing marching-squares
pass, over the existing masked lattice, at one level. Lattice coordinates out, mapped
by the plan's own `px`/`py`.

**Rationale.** Three requirements fall out of the arrangement rather than needing code:
FR-004 (the band stops at measured ground) because `contoursOf` emits nothing for a
cell whose mask is not full; FR-006 (both drawings agree) because the relief is built
from the same lattice; and the saddle resolution is already consistent, which matters
here more than for an ordinary contour — a saddle on this ground is where two ways of
improving the design meet, and a pass/fail boundary that crossed itself there would be
a boundary a reader could stand on both sides of.

**Alternatives rejected.** d3-contour (a package; Principle V). A separate
threshold-specific tracer: two marching-squares implementations that must agree about
saddles is the kind of divergence that shows only on the interesting ground.

---

## R-4. Matching a `Target` to a `Reading` — the part that fails quietly

**Decision.** A target applies to the plotted reading when **all** of:

1. `target.metric === reading.id`;
2. its qualifiers describe what the reading actually measures — for `overheat`,
   `target.above` equals the temperature the `overheat` quantity reads at (25, today
   hard-coded inside its `read`); for the TM59 criteria, `target.category` equals
   `TM59_STUDY_CATEGORY` (`COUNT_CATEGORY`, i.e. Category II) or is `null` for a
   criterion that is not read by category;
3. `target.quantityKind === reading.quantityKind`;
4. the target's `needs` is implied by the reading's quantity's own `needs`
   (`annual ⇒ 'year'`, `season ⇒ 'season'`, anything ⇒ `'run'`).

Each of 2, 3 and 4 is asserted at module load over the whole cross product of
`READINGS × every target of every preset`, and a metric match that fails any of them
throws naming both declarations.

**Rationale.** This is the one place the feature can be silently wrong. `tm59a`'s
quantity reads criterion a at **one** category (`TM59_STUDY_CATEGORY`), while the
preset declares the criterion at two; matching on `metric` alone would draw a Category I
line across a Category II ground, and because both categories carry the same *limit*
today it would look perfectly correct while citing the wrong criterion. `tm59.js` has
already met this exact problem — `clearedCount` matches on criterion **and** category
and throws when the match is not exactly one — so the rule is that module's, restated
where the survey needs it.

The kind check (3) is the units guarantee: the lattice holds SI, the limit is declared
in SI, and both are lettered through `Reading.figure`, which converts by
`reading.quantityKind`. A target declaring a different kind for the same metric would
letter its line in the wrong system on an IP sheet. Note the *unit strings* legitimately
differ — the `demand` quantity says `kWh/m²·yr` and the Passivhaus target says
`kWh/(m²a)` — and must **not** be compared: a converting kind owns its unit string
outright, so the kind is the comparison and the wording is the publisher's.

The `needs` check (4) is Principle IV. Every pair satisfies it today (a `'year'` target
only ever matches a reading whose quantity needs an annual run), so the assertion costs
nothing now and refuses the pairing loudly the day somebody adds a target the ground
cannot answer.

**Alternatives rejected.** Matching on `metric` alone (silently wrong for TM59).
Declaring the qualifiers again on the `Reading` (a third spelling of Category II).
Skipping a non-matching target quietly: that is the silent fallback, and it would have
hidden exactly the mismatch the assertion exists to catch.

---

## R-5. Two standards at one figure, and a threshold on a round contour

**Decision.** Two things, both about never drawing an unexplained doubled line:

- **Coincident thresholds** (`|a.limit − b.limit| ≤ tiny`): one isoline, labelled with
  both standards' names, and one band. The key lists each standard on its own row.
  This is live today — TEDI carries Passivhaus 15 **and** LETI 15, and `overheat`
  carries Passivhaus 10 and EnerPHit 10 — so it is the common case, not an edge one.
- **A threshold that lands on an ordinary contour level**: the ordinary contour at that
  level is not drawn. Suppressed when `|level − limit| < step / 10`, where `step` is the
  contour interval `levelsFor` chose.

**Rationale.** US2 scenario 2 asks for "one clearly identified threshold line rather
than an unexplained doubled or ambiguous line". Nothing is lost by suppressing the
contour: a contour is inference carrying only its own level, and the threshold line at
that level letters the same figure plus the standard that published it. The `step / 10`
tolerance rather than exact equality is because two lines a hair apart are visually one
line drawn twice, which is the ambiguity the requirement names, and because
`levelsFor` rounds its levels through `toFixed(10)`.

**Where the suppression does *not* reach**: `levels` is also handed to `strataOf` and to
the relief's height axis ticks. The suppression is applied at the plan's contour drawing
only, so the height scale keeps its full ladder of figures — the strata rule the *cut
face*, which is a scale, not the ground.

**Alternatives rejected.** Drawing both and offsetting one (a line drawn where the
value is not). Nudging the threshold to the nearest contour (fabricating a limit —
Principle IV).

---

## R-6. Telling the line apart, with no hue to spend

**Decision.** The threshold line is drawn at `--ink` weight with a long chain-dash
signature (dash-dot, the surveyor's convention for a boundary) and carries its own
label — the standard's name and the limit, lettered through `Reading.figure` — placed
on the line and entered into `drawGround`'s existing `lettered` collision list so it
cannot print over a spot figure (FR-010). Where more than one line is drawn they are
told apart by **dash signature** and by the label each carries, never by hue.

**Rationale.** `.interface-design/system.md` is explicit: `--redline` is the markup pen
and means "the desk is here" on four drawings already; `--cold`/`--warm` encode a signed
physical quantity and a threshold is not one; and "do not add a hue for a category".
The survey is graphite for the stated reason that its reading is a magnitude with no
direction. The existing ordinary contours are `--ink-ghost` hairline with every fifth at
`--ink-3`/1px, so a chain-dash at `--ink` sits above both and is not confusable with the
heavier interval line (FR-002).

Ranking is deliberately avoided: the several lines differ in signature, not in weight,
because weight would rank one standard over another and there is no published weighting
to rank them with — the same argument the design system already makes about a second
reading's spot figure.

**Alternatives rejected.** A second accent hue (rejected in the design system once
already, for the "set but not in the model" state). Weight alone (collides with the
`major` contour, and ranks).

---

## R-7. The band, on the plan

**Decision.** An SVG `<pattern>` hatch per threshold, at an angle distinct from the
improving region's existing 45° and from each other's (e.g. 0°, 90°, 135°), filling the
polygon bounded by the isoline and the measured extent. Each band's own key entry names
its standard in words.

**Rationale.** The improving region is already a 45° hatch and a tint would read as a
fourth surface on a board that has four (the existing comment says so). Angle is the
available second dimension and it distinguishes bands from one another per FR-003 while
leaving each band independently identifiable where they overlap — which, because every
threshold on this sheet passes below, means the bands are **nested**, and the overlap
reads as cross-hatch. The key words each band separately, so nothing presents a combined
verdict (FR-011); the cross-hatch is the union of two bands, not a third judgement.

**On building the polygon.** The band is not a new tracer: it is the same cells
`contoursOf` walks, filled per cell — a cell entirely on the passing side fills whole, a
crossed cell fills the sub-polygon on the passing side of the segment, and a cell whose
mask is not full emits nothing, exactly as the contour does. FR-004 is that last clause.

**Alternatives rejected.** A wash or tint (fourth surface, and it would read as a hue
for a category). Shading by density so denser = clears more standards (that *is* a
combined verdict, FR-011). A single merged "passes everything" region (the spec's
clarification explicitly refuses it).

---

## R-8. The band and the line, on the relief

**Decision.** Two additions to `src/relief.js`'s `draw({ … })`:

- **The line**: the same `contoursOf` polylines, emitted as 3-D line geometry at
  `z = limit`, drawn in the existing line path beside `strata` and `arrises` under a new
  `uMode`, standing a hair proud of the surface for the reason the pin does — run
  exactly on it, the depth test eats it and the reader is handed a boundary with no
  boundary in it.
- **The band**: a fragment-shader branch. `vHeight` is already the raw reading value at
  the fragment, so the passing side is a comparison against the limit — exact, free, and
  holed structurally because no triangle spans unsurveyed ground. It is drawn as a
  **screen-space stipple**, not a tint: the plan's band is a hatch, and the relief's has
  to be the same idiom or the two drawings are saying one thing two ways.

**Rationale.** FR-006 asks that the relief show the same line at the same position. A
horizontal level line on a height field *is* the threshold, which is why `strataOf`
already exists and why this needs no new machinery. Doing the band in the shader rather
than as draped geometry keeps it exact at every viewpoint and keeps `Coverage`'s
guarantee intact: the holes are in the index buffer, so a band cannot be painted over
ground nobody stood on.

**The one caution**, recorded because it will look like a maths error: the contour
segments are interpolated along cell *edges* while the surface is triangulated on the
bottom-left-to-top-right diagonal, so a segment's interior can sit a hair off the
drawn surface mid-cell. This is the disagreement `surfaceAt` was written for. The
proud offset covers it; drawing the line *through* the surface instead would show it as
a stitched line.

**Alternatives rejected.** Tinting the passing band a different ink (spends a hue on a
category, and breaks "the surface is shaded by height alone"). Draping hatch lines over
the mesh (real work, and it would need its own agreement with the triangulation).
Omitting the band from the relief (FR-006 forbids it).

---

## R-9. Where the absence is stated, and where the "wholly one side" sentence goes

**Decision.** Both stand in the **ground key** (`renderGroundKey`), which is the
drawing's on-sheet legend and is already where every mark on the ground is named. Never
in a fold: absence reasons, refusals and verdicts are the four things the copy
convention keeps out of folds.

- No applicable threshold → one entry, no swatch, saying which reading it is and why it
  carries none (FR-005). For `cedi` and `peakCool` the reason is the publisher's, read
  off the target: the limit is set per building and per climate, so there is no line
  this sheet may draw. For `high`/`low`/`cost`/`carbon` the reason is that no standard
  on this sheet publishes one.
- Chasing a standard that carries no limit for this reading → the same shape of entry,
  naming the chased standard (FR-014).
- A threshold that crosses no measured ground → the entry says which side the whole
  ground is on — every measured design on it passes this line, or none does (FR-007).

`surveyAriaLabel` gains the same facts in the same words, since it is the only route to
the drawing for a reader who cannot see it.

**Rationale.** Copy budgets: these are absence reasons and verdicts, held to `STANDING`
(15 words) and `ABSENCE` (12) — composed at render time, so measured on the page at four
desk positions rather than thrown on, which is what `asserted: false` means in
`src/copy.js`.

---

## R-10. Making the chase reach the drawing

**Decision.** `thresholdsFor(reading, { chased })` takes the chased preset id as an
argument; `src/survey.js` learns nothing about page state. The chase button's click
handler in `src/main.js` gains a `renderSurveySoon()` beside its existing
`renderScore()` / `renderChase()` / `refreshStudies()`.

**Rationale.** It mirrors `improvingRegion(survey, stance)` exactly: the module takes
the reader's position as an argument and keeps itself DOM-free and harness-drivable.
FR-015 (starting or stopping a chase updates the drawing immediately, with nothing left
over) is then one call, and it goes through `renderSurveySoon` because that is the entry
point the other callers use and it costs nothing when no ground is cut.

**Two traps this codebase has already paid for, both live here.**

- **The hidden-tab `requestAnimationFrame` starvation.** `renderSurveySoon` clears its
  frame flag only inside the callback, so in a background tab the flag stays set and
  every later call early-returns. A threshold that "did not update on chase" must be
  checked against `document.visibilityState` before it is believed.
- **A cache whose key cannot see the state that invalidates it.** `chooserDrawn` and
  `tm59Notes`' `noteCache` both had to learn `system()`. Any cache added here must carry
  the chase state *and* the system, or it holds a line for a standard the reader has
  stopped chasing.

**Alternatives rejected.** Reading `chased` from a module-level import in `survey.js`
(couples a DOM-free module to page state and makes the harness unable to drive it).
A second selection state for the survey (the spec's clarification explicitly refuses a
competing way to choose).

---

## R-11. Which reading the threshold belongs to, when two are plotted

**Decision.** `survey.readings[0]` only — the reading the ground's height is.

**Rationale.** A survey may carry a second reading, lettered as a ghost figure under the
first at each measured point; it has no contours, because the ground is not its surface.
A line at the second reading's limit would be a level on a surface that is not drawn —
there is nowhere on this ground for it to go. FR-001 says "the plotted reading", and the
plan caption, the relief's height axis and `levelsFor` all already mean `readings[0]` by
it.

Note this deliberately differs from `improvingRegion`, which consults **every** plotted
reading. They are different judgements and the spec's edge case says so: improving on
the current design and passing a published limit are not the same claim, and they are
drawn as two distinct things.
