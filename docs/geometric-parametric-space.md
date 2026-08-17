# A geometric parametric space for the shoebox

*Research note, August 2026. No code — this is the survey and the pathway. File and line
references are against `89dd023`.*

The ask: give the reader control over the geometry of more than one zone — core and
perimeter, articulated footprints, interior layout, presets, and the further reaches
(fractals, "topology optimal"). This note inventories what holds the current model to one
box, surveys what the field actually does, and lays out a phased pathway that keeps every
invariant this desk is built on.

The one-sentence conclusion, argued below: **the literature and every shipping tool
converged on exactly this app's own invariant** — a few named scalars plus a deterministic
derivation rule beat free geometry everywhere anyone measured — so the right space is a
*typology selector over rectilinear plans, two or three shape scalars, and a derived
core/perimeter zoning*, not a polygon editor, and the work is one structural refactor
(the surface set becomes derived) followed by three additive phases.

---

## 1. What holds the model to one box today

Eight load-bearing constraints, in rough order of how much they resist multi-zone:

1. **The surface set is fixed at `buildModel`.** The six `BuildingSurface:Detailed` are
   written once (`model.js:565`), and `applyMassing` can only reshape them — a missing
   surface throws `the model has lost surface …` (`model.js:668`). No applier adds or
   removes a surface. This is the pivotal constraint: a parametric zone count means the
   surface set must become *derived*, cleared and rewritten the way `applyRun` rewrites
   run periods and `syncReporting` rewrites every `Output:*`.
2. **Wall identity is an index into a frozen 4-array.** `WALLS` (`model.js:49`) hardwires
   name, compass side, and the two facade keys each wall owns; `planPoints`
   (`model.js:126`) emits exactly four corners; `boxSurfaces` zips plan against `WALLS`
   by index, and floor/roof index `plan[0..3]` literally.
3. **One `Zone` by literal name**, referenced from twelve object types — loads,
   infiltration, thermostat, ideal-loads node names, daylighting, `WindowShadingControl`,
   one keyed `Output:Variable` (`ZONE_NAME` at `model.js:38`, uses at 526–1503).
4. **One zone temperature series, first match wins.** `hourly(eso, /Zone Mean Air
   Temperature/i)` takes `.find()`'s first hourly series (`readings.js:22–25`, `195`;
   `main.js:3244`). It feeds the plate, the tint, `worstHour`, the pin, the finding,
   `readExtremes`, and every study sample. With two zones in the ESO it would silently
   read one of them.
5. **The rail divides its per-building term by live `params.multiplier`**
   (`main.js:2206`), not by the multiplier of the run being read — a latent bug already,
   and multi-zone widens it.
6. **Every parameter is a scalar** — four mechanisms depend on it (`controls.js:286–303`),
   and `permalink.js`'s numeric regex runs before the per-kind switch. Geometry
   parameters must stay scalars (or canonical text, the `Days` pattern).
7. **The drawing gates on `walls.length === 4`** and destructures `[south, east, , west]`
   for the dimension lines (`main.js:243`); visibility is a pure backface test, correct
   only for one convex volume.
8. **`geometryFacts` assumes one prism**: volume is `floor × globalHeight`
   (`model.js:1590`), and the projection-factor reading is pinned to `SOUTH_WALL`
   (`model.js:1604–1609`). The floor-area sum itself is Newell over all floor surfaces
   and survives any footprint unchanged.

Worth noting what *already* generalizes: `polygonArea` (Newell) is
footprint-agnostic; `addVariable` defaults to key `*` so zone-level variables expand per
zone on their own; the bill, TEDI/CEDI/EUI and the whole tariff apparatus read
**meters**, which aggregate the building whatever the zone count; and the
`Channel.requires` machinery is exactly the "presets as subspaces" mechanism the
parametric-design literature recommends.

---

## 2. What the field does

### 2.1 Core/perimeter is the industry Schelling point

ASHRAE 90.1 Appendix G (G3.1, unchanged 2010→2022): perimeter depth **15 ft / 4.57 m**
from glazed exterior walls, corner area "divided proportionately" — implemented
everywhere as a **45° miter at each corner** (the straight skeleton of a rectangle) —
giving four trapezoidal perimeter zones and a rectangular core. The DOE Medium Office
prototype is the canonical instance: 4 perimeter + 1 core per floor at 4.6 m. Tall
prototypes model ground, one mid floor under a zone multiplier with adiabatic
floor/ceiling, and top floor — "storeys" as one scalar, which this desk already has.
Sefaira ships perimeter/core as its default zoning (~4 m, adjustable) and states the
rationale: substantially more accurate than one zone per floor for whole-building energy
and sizing. UMI/Shoeboxer's tradition is **3.0 m** (also geomeppy's default
`perim_depth`).

How much it buys, honestly measured (Dogan, Saratsis & Reinhart, BS2015, 1,200 runs
against 25 real floor plans): core/perimeter zoning holds **annual EUI to ~15 % RMSE**,
but heating/cooling *load disaggregation* misses by 105–175 % — layout alone can swing
loads by 180 %. Shoeboxer (Energy & Buildings 2017) validates the two-zone
perimeter+core shoebox at **5–10 % EUI RMSE, ~300× faster**, across 121 buildings. The
desk should say this the way the bill says a partial year: zoned readings are for EUI
and envelope comparison, not equipment sizing.

### 2.2 Autozoning algorithms — and the browser escape hatch

The open tools all reach core/perimeter through a **straight skeleton** (Felkel &
Obdržálek 1998): Autozoner (Dogan, Reinhart & Michalatos, JBPS 2016), dragonfly's
`Room2D.to_core_perimeter`, ClimateStudio's massing templates. Two facts matter here:

- **Robust straight skeleton in JavaScript is a real gap.** The credible npm option is
  CGAL compiled to WASM (multi-MB); the pure-JS Felkel–Obdržálek ports are exactly the
  implementations whose degeneracies dragonfly hides behind `try/except Exception:
  return [self]` — a *silent fallback to one zone*, the precise thing this codebase
  forbids. A 2025 successor ("Convex Partition Zoner", JBPS) exists because skeleton
  zoning misbehaves on complex plans.
- **Nobody actually needs it for an early-design tool.** For axis-aligned rectilinear
  plans (rectangle, L, U, T, H, O) the Appendix-G partition is **closed form**: offset
  each edge inward by `d`, miter corners at 45°, and every degeneracy reduces to a
  scalar check — *if `2d ≥ min(limb width)`, the core vanishes there*. That is an `if`,
  not computational geometry. DOE prototypes, Sefaira, geomeppy and Shoeboxer all live
  in this regime. Free-polygon drawing plus autozoning is offered by no early-design
  tool; FloorspaceJS offers the polygon and delegates the zoning to the user.

The strongest precedent for "a handful of scalars → zoned building" is OpenStudio's
`create_bar_from_building_type_ratios` (URBANopt/ComStock): total area, storeys,
NS:EW aspect ratio, WWR, party-wall fraction, zoning switch. Dragonfly's "Building from
Footprint" adds exactly one scalar (`perimeter_offset`) to go from footprint to zoned
model.

### 2.3 EnergyPlus mechanics

- **Interzone walls**: `Outside Boundary Condition = Surface` (mirror pairs, reversed
  winding) or `= Zone` (EnergyPlus creates the counterpart itself — halves what the
  applier writes). `= Adiabatic` self-references and is the standard mid-floor and
  party-wall abstraction; mass still participates.
- **Air boundaries**: `Construction:AirBoundary` merges the zones' solar and radiant
  enclosures (since 9.6 that grouping is the only behavior); convective exchange is
  `SimpleMixing` (default 0.5 ACH of the smaller zone) or an AirflowNetwork. This is the
  honest "open plan vs partitioned" control, one selector, later.
- **Solar distribution constraint worth designing around**:
  `FullInteriorAndExterior` requires *convex zones*. A one-zone L is non-convex; the
  core/perimeter partition of any rectilinear plan is all-convex (trapezoids and
  rectangles). So articulated footprints and zoning are not independent features — the
  zoned form is also the one the engine's solar model is happiest with.
- **Multipliers**: per-zone variables report *before* the multiplier; the rail's
  `perBuilding` exception (`controls.js:1575`, measured in this repo) is the same fact
  from the other side and generalizes to every zone the multiplier touches.
- **Cost** (LBNL-1311E run-time analysis; ratios transfer, absolutes don't): zone/surface
  growth is superlinear — 15→30 zones ≈ 2.6× annual time; windows 12→120 alone was
  2.6×. For this app: 1 zone/6 surfaces → 5 zones/~30 surfaces plus interior pairs.
  Expect the 50 ms design day in the **150–300 ms** band and the 0.7 s annual around
  **2–3 s**. The two-cadence solve (continuous on design days, on-release for annual)
  already absorbs exactly this; the pool's 256 MB heap calibration (`pool.js:20`) needs
  re-measuring.

### 2.4 The parametric space literature

The relative-compactness lineage (Ourghi/AlAnzi/Krarti 2004–2009; Depecker 2001) showed
annual energy tracks **RC + WWR + SHGC** nearly independent of form at low WWR — the
strongest evidence that a single compactness number captures most of what footprint
articulation does thermally. But RC is a *reading*, not a control: you cannot invert one
scalar to a footprint. The proven interface is the inverse — expose 2–4 generating
scalars, letter RC on the sheet as a derived quantity. Baker & Steemers' passive-zone
concept gives perimeter depth its physical meaning (daylit band ≈ 2× floor-to-ceiling
height, ~5.5 m; crossing ~11 m plan depth is when a core exists at all) — the
**passive-zone fraction** is a second derived reading worth lettering.

Per-typology parameterization is the academic convention: rectangle = aspect ratio;
L/U/T/H = wing depth and width ratios; courtyard = aspect + void:built ratio. Studies
fit *separate* regressions per shape — a typology change is a step, not a slide, and a
study curve must not interpolate across a selector boundary (the per-point redraw
already draws honest steps).

Interior-layout generation, judged against this app's requirements (deterministic,
scalar-encodable, <100 ms, legible):

| Approach | Verdict |
|---|---|
| Core/perimeter offset (Autozoner) | **Adopt** — 0–1 new scalars, drafting-room vocabulary |
| Fixed-shape slicing tree, k split-ratio sliders (Knecht & König) | Adopt *if* user-steered zone walls are wanted — continuous, legible ("where the party wall stands") |
| Squarified treemaps (Marson & Musse) | Skip — small area changes flip a subtree's slicing direction; discontinuous under drag |
| Adjacency graph → rectangular dual | Skip — the input is a graph, not a scalar; illegible at a drafting desk |
| Evolutionary layout (Michalek; Rodrigues' EPSAP) | Skip for live geometry — stochastic, variable-length genome, seconds-to-minutes |
| ML floorplan generators (HouseGAN, Graph2Plan) | Skip — latent vectors are the opposite of legible, and WebGPU float behavior is not byte-stable across devices, which poisons a params-keyed cache |

**Fractals**: fractal *dimension* as a control or metric is numerology — no credible
study makes it a causal energy variable; where geometric complexity carries measured
energy content the mechanism is plain **self-shading** (up to ~30 % cooling in hot
climates, little in cool ones), which the typology scalars already exercise. What
survives is recursion as a *generator* with nameable steps: depth 0 = slab, 1 =
courtyard, 2 = cloister, each step trading envelope area against daylit perimeter. Cap
at 2 — zone count grows geometrically and the simulation, not the geometry, is the cost.

**"Topology optimal"**: the research paradigm is GA/CMA-ES over form scalars with
budgets of 10²–10⁴ EnergyPlus runs (Waibel's benchmark; EvoMass; Yi & Malkawi). No
usable adjoint of EnergyPlus exists and discrete zoning topology is non-differentiable
in principle. At this app's peak throughput (6 workers × ~0.7 s ≈ 8.5 runs/s, before the
multi-zone slowdown) a 300–1,000-evaluation CMA-ES is a 1–5 minute batch, and a voxel
topology search is 20+ minutes whose *answer is a bit pattern* — not scalar-encodable,
so it cannot ride the permalink, cannot be re-derived idempotently, cannot be dragged.
Interactive topology optimization is incoherent with the desk's contract, not merely
slow. What is coherent: an **optimizer as a study** — CMA-ES or golden-section over one
or two declared scalars, run through the existing sample queue, landing its answer as a
marked point the reader clicks to adopt, adoption being an ordinary `commit` of ordinary
params. Surrogate models are a category break for the same reason: everything on this
sheet is read back off a real run.

---

## 3. The recommended space

Principles first, all of them restatements of rules the desk already has:

- **Every geometry parameter stays a scalar** (or canonical text at the boundaries, the
  `Days` pattern). Presets are subspaces: the typology selector decides which scalars
  are live, exactly as `Channel.requires` already gates strips, and a dead scalar
  round-trips the permalink at its default for free.
- **Zoning is derived, never drawn.** The reader chooses a typology and a perimeter
  depth; the partition, the interzone surfaces, RC and the passive-zone fraction are all
  consequences, read back off the document.
- **Degeneracies fail loudly.** The core vanishing under a deep offset is a
  `requires`-style precondition stated on the strip ("the perimeter depth swallows the
  core at this footprint"), never a silent merge — the dragonfly `try/except` is the
  named anti-pattern.
- **Rectilinear only.** Closed-form 45° miters, scalar degeneracy checks, all-convex
  zones, no skeleton library, no WASM geometry dependency.

The controls, by channel:

- **Massing** (existing): `width`, `depth`, `height`, `multiplier` unchanged. Sheet
  dimension lines keep reading true lengths off walls.
- **Plan** (new, or grown inside Massing): `typology` Selector — *Bar / L / U /
  Court* (T and H can come later; each is one more case in the same closed form) — plus
  two Scales live per typology: wing depth fraction and notch/void width fraction. Keep
  `width`/`depth` as the absolute bounding box and let the scalars carve within it
  (the desk's dimensions stay honest); letter floor area and RC on the sheet so the
  confound the area-preserving literature warns about is *visible* rather than
  prevented. Every scalar is sweepable by the existing 1-D study machinery on day one.
- **Zoning** (new, bypassable — bypass *is* single-zone, which keeps the default desk
  byte-identical): `perimDepth` Scale, 2–6 m, default 4.57 (Appendix G) with 3.0 noted
  as the UMI/shoebox tradition; later a `partitions` Selector (*Open plan / Partitioned*)
  choosing `Construction:AirBoundary` vs a real interior construction; later still the
  slicing-tree split sliders if user-steered zone walls earn their place.
- **Derived readings**: RC (A/V normalized to the equal-volume cube), passive-zone
  fraction, per-limb dimensions. All Newell sums off the document, like `compactness`
  today.

Facade controls generalize without new keys: a wall's compass side becomes a property
*derived from its outward normal* rather than a position in a frozen array, and
`wwrN/E/S/W`, `ohN/E/S/W` apply to every exterior wall whose normal falls in that
sector. An L-shaped plan has two south-facing walls; both read `wwrS`. The `Facade`
control, `glazed()`, and the permalink don't change at all.

---

## 4. The pathway

### Phase 0 — the structural refactor (no visible change)

The gate for this phase: the default desk's IDF serializes **byte-identical** before and
after, the throwaway harness asserts idempotence ×3, and every console position still
passes `validate_model` / `check_model_integrity` / `run_simulation`.

1. **Surfaces become derived.** `applyMassing` goes clear-and-rewrite over a derived
   plan → zones → surfaces pipeline with deterministic names (the `applyRun` /
   `syncReporting` precedent). Openings and shades already derive their names by suffix,
   so they follow their walls.
2. **Wall identity by outward normal**, not index. `wallPlan` returns walls with a
   derived compass sector; `boxSurfaces`' `WALLS[i]` zip and the floor/roof `plan[0..3]`
   winding go. Naming scheme becomes zone-qualified (`CORE`, `PERIM-S:Wall001`, …) —
   settle it here, since `Zn001:` appears in six places and the title block reads
   `Building.name`.
3. **Zone plumbing goes plural.** A `zones()` derivation replaces the `ZONE_NAME`
   literal. The load appliers (People, Lights, ElectricEquipment, Infiltration,
   Ventilation, InternalMass) keep writing **one object each**, targeted at a
   `ZoneList` — their fields are already `zone_or_zonelist_…` (`model.js:994–1118`).
   Per-zone loops are needed only where EnergyPlus demands them: thermostat +
   IdealLoads + node names, `WindowShadingControl`, daylighting, the one keyed
   `Output:Variable`. `InternalMass` area and the economizer's volume cap compute from
   per-zone floor area and volume instead of `width*depth*…`.
4. **Readings become zone-aware.** The building series the plate, tint, `worstHour`,
   pin and finding read is the **floor-area-weighted mean** of the per-zone
   `Zone Mean Air Temperature` series (weights off the document, Newell). The rail sums
   each `Zone Air Heat Balance` term across zones; the `perBuilding` division reads the
   multiplier **off the run**, not live `params` — fixing the existing latent bug. Fix
   `hourly()`'s first-match while here. `geometryFacts` volume becomes a per-zone sum;
   the projection-factor reading generalizes from `SOUTH_WALL` to the south sector.
5. **The drawing sorts.** Painter's algorithm on projected depth along `VIEW` replaces
   pure backface culling (needed the moment there are interior walls or a concave
   silhouette); the `walls.length === 4` dimension gate becomes per-limb edge
   extraction. `square()` and the north arrow already key off `params` and survive.
6. **Definition of done** per CLAUDE.md: `index.html`'s lede ("a single free-running
   zone") and the `1ZoneUncontrolled` title-block line, the axon `aria-label`, the tour
   `NOTES`, and `shapeLabel` all say the new truth; re-measure the pool's heap budget.

This phase is most of the cost and all of the risk. Everything after it is additive.

### Phase 1 — core and perimeter

The Zoning channel: 45°-miter closed-form partition of the rectangle into four
trapezoids and a core; interzone walls with `Outside Boundary Condition = Zone` (the
engine mirrors them, halving what the applier writes); daylighting sensors move to the
perimeter zones; `requires` states the degeneracy (`2·perimDepth < min(width, depth)`).
The results schedule can now grow an optional per-zone breakdown; the plate keeps the
one building-mean curve, and says so. The lede carries the BS2015 caveat: zoned readings
are for EUI and envelope comparison, not sizing.

### Phase 2 — footprint typologies

The Plan selector and its two scalars; walls-by-sector already handles the facades; the
zoning partition extends to L/U/Court limb by limb (still closed form, still scalar
degeneracy checks). Constraint to honor: non-rectangular *single-zone* plans are
non-convex, so either require Zoning engaged for articulated typologies or drop solar
distribution to `FullExterior` in that state — prefer the former; it is also the truer
model. RC and passive-zone fraction join the derived readings. Studies over notch/wing
scalars work immediately; a typology flip is a lettered step, not an interpolation.

### Phase 3 — optional articulations, each earning its place separately

Courtyard recursion depth ≤ 2 (slab → court → cloister; the cost cap is zone count, not
geometry); slicing-tree split sliders for user-steered interior walls; the
open-plan/partitioned air-boundary selector; a "room width" third scalar in the
Shoeboxer tradition if per-orientation shoebox weighting ever matters.

### Phase 4 — the optimizer as a study

A "find the knee" card: golden-section or CMA-ES over one or two declared scalars,
scheduled through the existing per-sample queue, cache-shared with ordinary sweeps,
landing as a marked point whose adoption is a plain `commit`. No new machinery below
`scheduler.js`; explicitly not interactive topology optimization, for the contract
reasons in §2.4.

---

## 5. What is deliberately rejected

- **A free polygon editor** (FloorspaceJS-style): breaks the scalar invariant, forces
  the straight-skeleton dependency and its silent-fallback failure mode, and no
  early-design tool ships it with autozoning anyway.
- **Treemap / graph-dual / evolutionary / ML layout generation**: each fails
  determinism, scalar-encoding, or legibility (§2.4 table).
- **Fractal dimension as metric or control**: numerology; self-shading is the real
  mechanism and the typology scalars already own it.
- **Interactive topology optimization and surrogate oracles**: the answer isn't a
  permalink, and a surrogate answering the reader is a category break with "everything
  is read back off the run".

## 6. Open questions for the desk

- The rail with zones: one summed rail (recommended first) vs a per-zone picker — the
  balance still closes summed, but a core-vs-perimeter rail comparison is genuinely
  interesting and might be Phase 3's best card.
- The plate: does a per-zone ghost curve (core vs perimeter south) earn its ink, or
  does the schedule's per-zone breakdown carry it?
- Naming: settle the zone-qualified surface scheme once, in Phase 0, and never again —
  the permalink never carries names, so this is free until someone reads an IDF.
- Multiplier × zoning: the mid-floor abstraction composes cleanly (adiabatic
  floor/ceiling already the default), but the `perBuilding` accounting needs the
  per-zone generalization measured, not assumed.
- Whether `LINK_VERSION` survives: every new key ships with a default equal to today's
  behavior (typology Bar, Zoning bypassed), so delta encoding gives old links the new
  defaults free — no bump, no migration, *if* no existing key is renamed or re-ranged.
  Bump the tour storage key regardless; the steps change meaning.

## 7. Sources

Zoning & tools: ASHRAE 90.1 App G / PNNL-25130; DOE prototypes (OSTI 1607029); Sefaira
zoning docs; Autozoner (Dogan, Reinhart & Michalatos, JBPS 2016,
doi:10.1080/19401493.2015.1006527); Convex Partition Zoner (JBPS 2025); dragonfly
`Room2D.to_core_perimeter` and ladybug-geometry-polyskel; geomeppy; OpenStudio
`create_bar_from_building_type_ratios`; FloorspaceJS (NREL FY18OSTI/70491).
Shoebox abstraction: Dogan & Reinhart, Shoeboxer (Energy & Buildings 140, 2017); Dogan,
Saratsis & Reinhart (BS2015); UMI docs; ISO 52016-1.
EnergyPlus: I/O Reference (Thermal Zone group; Construction:AirBoundary, 9.6 grouped
enclosures); LBNL-1311E run-time analysis.
Parametric space: Ourghi, Al-Anzi & Krarti 2004; AlAnzi et al. 2009; Depecker et al.
2001; Baker & Steemers (LT method / passive zone); U-shape parameterizations (MDPI
Sustainability 12(5):2079; PMC10338471); Knecht & König 2010 (slicing trees); Marson &
Musse 2010 (treemaps); Michalek et al. 2002; Rodrigues et al. EPSAP/FPOP; HouseGAN
(arXiv 2003.06988); Graph2Plan; Granadeiro et al. (shape grammars + energy); Ostwald &
Vaughan, *The Fractal Dimension of Architecture*; self-shading review (Energy &
Buildings 2024); Yi & Malkawi; Waibel et al. optimization benchmark; EvoMass; Design
Galleries (Marks et al., SIGGRAPH 1997); Design Explorer; Woodbury & Burrow, "Whither
design space?" (AIEDAM 2006).
