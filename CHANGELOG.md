# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The zone air heat balance opens out.** The rail has always drawn the five
  terms as one signed bar; pressing **Open out** in its head expands it into the
  full flow drawing, and the bar stays above as the summary being extended. It is
  the rail at full size rather than a second instrument: where the rail has a
  centre-zero line the drawing has a spine, and where it has stacked segments it
  has ribbons.

  It arrives by doing exactly that. The spine grows from the centre, each ribbon
  extends out of it in the order the rail already stacks them — largest first —
  and the lettering follows. A transition between two drawings of one quantity,
  which is the only thing that earns the motion; all of it is off under
  `prefers-reduced-motion`.

  That unfold is the *opening*, and only that. Every reading after it is the
  same drawing at another instant, so the ribbons **travel** to their new widths
  instead of being drawn again — which is what a plate drag is: one continuous
  gesture over one continuous quantity, stepping hour to hour. It used to replay
  the whole unfold on every frame of that drag (measured: thirty-seven
  animations started over twenty-four frames), so the drawing spent the gesture
  being drawn for the first time, over and over. The drawing now keeps its nodes
  between readings and re-letters them in place, and the transition tracks the
  hand — a median 0.3 px between the drawn ribbon and its own target over a
  brisk drag, with the large steps travelled rather than jumped.

  On the wide layout the strips give up the desk's column and the rail takes it,
  which is the full window height the desk is already sized to. At the index
  breakpoint there is no footer to expand into — the desk is `position: static`
  with no height to fill — so the balance becomes a layer over the page instead,
  with its own scroll, a sticky head so the way out never scrolls off, Escape to
  close, and the page behind it locked.

- **A drawing of the heat flow, from fuel through the plant to the loads that
  called for it.** The sheet could say what each path contributes at one instant
  (the balance rail), what the year cost (the bill) and what the demand
  intensities came to (the schedule). What none of them drew was the chain. The
  balance opened out of the rail draws it, and the pin moves it: take hold of
  the plate's marker and the ribbons re-letter on every frame, the balance
  re-closing at each hour.

  **The spine is a balanced node, and the sign of a term picks its side of it.**
  That is the move that lets a Sankey draw this balance at all: a ribbon diagram
  with only positive widths cannot show a sink among sources, and this balance is
  full of them — at the cooling peak the interzone floor runs at −1.33 kW while
  everything around it is a gain. Positives on one flank, negatives on the other,
  and the sink is simply a ribbon on the leaving side at its true width with the
  node still balancing. Both totals are lettered at the head of the spine —
  `5.74 kW arriving`, `5.74 kW leaving` — in words as well as hues, so the
  balance is checkable by eye and survives greyscale and a screen reader.

  What it is *not* is a multi-stage Sankey whose every node closes by
  construction. Only the zone air balances, because it is the only thing that was
  measured to, and whatever the node does not close by is drawn as a hatched stub
  rather than absorbed — the rail has said "unclosed by N W" in words since long
  before there was a picture.

  **The figures beside a ribbon are read against it and do not divide it.**
  People, lights and equipment are lettered under the Gains band; windows and
  opaque conduction under Fabric. They are true readings of real quantities and
  none is a share of the band it sits under: measured on the stock desk, the
  three internal ones come to 539 W against a gains term of 322 W, the
  difference being the radiant half that reaches the air later through the
  fabric. Drawing them as widths would assert an arithmetic that is false, so
  they are lettered with the caveat that travels with them.

  **The fuel chain is the bill's own division, carried into watts.** There is no
  boiler in this model — the ideal unit reports delivered heat at 100 % — so the
  seasonal efficiency or COP divides after the run, and the drawing shows that
  division as the width step it is: `supply ÷ divisor = draw`. It reaches no IDF
  object, so turning a COP re-letters the chain with no simulation, exactly as
  it re-letters the bill. Measured: 3.5 to 2.7 moves the draw from 2.00 kW to
  2.59 kW against an unchanged 6.99 kW of supply.

- **The two sizing peaks, decomposed into what caused them.**
  `ZoneComponentLoadSummary` is the only report this engine will produce that
  breaks a load into the components that caused it, and it is now requested. Two
  further modes on the drawing read it: one ribbon per component — people,
  lights, equipment, infiltration, roof, walls, floor, fenestration — each
  divided into the part that reached the air at once and the part the mass gave
  back later, with the report's own published residual drawn hatched beside
  them. The delayed half is drawn lighter than the instant half, because it is
  estimated from the radiant decay curves rather than directly computed; the
  drawing gets fainter as the claim gets weaker.

  **That instant cannot be moved, and the block says so rather than implying
  otherwise.** The decomposition is computed inside the zone sizing routines — a
  second "pulse sizing" run injects a single-timestep radiant pulse, per-surface
  decay curves are differenced out of it, and those curves are applied to the
  gain history up to the sizing-day peak. It therefore exists at exactly two
  instants per zone, sub-hourly, on a design day that may not be among the run's
  environments at all. So the two peaks are lettered as what they are — a
  calculation over the design day, not an hour of the run above — which is what
  keeps three instants on one sheet from being quoted as though they were one.

  It costs two extra zone sizing passes. Measured, interleaved A/B, at both
  cadences: on a conditioned design day, 0.20 s to 0.24 s of engine time, about
  **20 %**; on a Denver year, 1.15 s to 1.11 s, or **−3.5 %** — noise. The two
  passes are a fixed cost over the design days and do not grow with the run
  period, so the design day is the worst case and a year does not notice it. It
  survives `sizingPeriods = 'No'`, which is what the weather picker sets when it
  attaches a year: measured, such a run comes back as 8,760 hours in one
  environment with both peak tables present, because the sizing calculation runs
  over the design days whether or not those days are simulated. It is requested
  only under the sheet's own reporting profile, so a study sample never pays for
  a table nobody parses, and only with **System in the path** — zone sizing on
  an unconditioned zone is a get-input fatal, not a warning, and the stock desk
  has System bypassed, so ungated this would have taken down the default page
  load. Where a run cannot answer a mode, the offer is refused with its reason
  in place of its stamp rather than hidden.

  The report is **per zone, not per building**: at a multiplier of 3 the cooling
  peak is 7,310 W either way, ratio 1.000. The drawing letters which building it
  is describing rather than leaving it to be assumed.

### Changed

- **The heat balance says which way it points.** The rail lettered five signed
  watt figures and a ± total, and the only things carrying direction were the
  hue — warm right of zero, cold left — and the absence of a minus sign. That is
  a colour-only encoding of the one fact the block exists to state: in
  monochrome, under forced colours, or read aloud as a swatch, a name and a
  number, a positive term said nothing whatever about being positive. So the
  convention is now stated where the signs are — under the rail's head, in
  place rather than on hover — and every rail figure carries `in` or `out`
  beside its watts, on the rail's key, the strip meter and the folded index row
  alike. The head also says what the `±` is, which nothing did: the size of one
  side of the balance, not the two netted. The hue still ranks and groups the
  terms; it no longer has to be believed on its own.

- **Two rail readings are not the variable they are named after, and both now
  say so on the strip.** System air transfer is reported by EnergyPlus for the
  whole building and divided back down, so at a zone multiplier of 3 the ESO
  reads three times what the strip letters. Air energy storage enters the
  balance negated — and that meter is relettered **Air energy release**,
  because under the variable's own name a reading of −400 W said "storage" and
  "out" in one breath, and the only reading of that which parses, discharging,
  is the opposite of what is happening. Negated, the label and the sign agree:
  a negative release is the air charging. Neither transformation was wrong;
  neither was checkable. Nothing here reaches the IDF.

## [0.2.0] - 2026-08-19

### Added

- **The reading hour drags, and it has a picker.** The plate's marker could be
  placed with a click; it can now be taken hold of and moved along the curve,
  with every meter on the rail, the balance total and the stamp under the plate
  re-lettering as it travels. Nothing is simulated — the run is already in hand
  and the hour is only a way of reading it — so a drag across a Denver year
  costs a re-read of an array rather than 8,760 hours of engine time. A press
  that never travels is still a click and still toggles the hour it names; a
  drag that ends where it began keeps the pin it just placed; and the address
  bar updates on release, never per frame, like every other gesture here.

  Under the plate there is now a bar carrying the instant, the hold, and two
  ways of naming another one. **Named hours** first, because "which hour" is a
  question the field already has stock answers to: EnergyPlus reports its own
  component loads at the *time of the peak load*, heating and cooling apart, so
  **peak heating** and **peak cooling** are the two a modeller arrives with; a
  results tool's period list offers summer and winter design weeks read off the
  weather file's statistics, which becomes the **hottest** and **coldest
  outdoor** hour; the zone's own **warmest** and **coolest** stand beside them
  because a free-running desk has no heating or cooling rate at all; and **peak
  solar gain** is the hour every glazing and shading control on the desk is
  arguing about. Each is found in the run that came back and letters the
  environment it landed in, with the value it reads there — on Denver's design
  days, peak heating at 24:00 on 21 December is 5.91 kW and peak cooling at
  15:00 on 21 July is 2.18 kW.

  An offer the run cannot make **states its reason where its stamp would have
  been** and cannot be pressed. Bypass the System strip and both peaks say so
  rather than quietly handing back the least-cooled hour of the year under a
  label claiming the opposite — an `argmax` always returns something, which is
  exactly why it needs a gate.

  Then a **calendar**, every option of it walked out of the run's own
  timestamps, so it cannot name an hour the run does not hold. A date field was
  rejected when the marker was built, on the argument that it invites February
  the 30th and hour 25 purely to meet a refusal message; that was an objection
  to a free field, and there is nothing left here to refuse. It earns its place
  because the gesture cannot reach everywhere — an annual plate at ten hours to
  the pixel is physically unable to name 15:00 on 14 February, and a pointer is
  not the keyboard's instrument at all. It works coarse to fine: an environment
  opens at its own worst hour, a month or a day at that day's extreme, and only
  the hour field names an hour.

  The bar sits on the sheet rather than only on the rail for the reason the
  plate grew its marker in the first place: the rail is inside a console you
  have to open, and the hour is the single most movable thing about every
  figure on the page. It also says, on the sheet, when a pin could not be found
  in the new run and was released — until now the marker simply went from
  filled to hollow, which is not an explanation.

- **Any of the six surfaces can be made adiabatic**, on a key of their own at
  the foot of the Fabric strip. A shoebox is almost never a free-standing
  object: it is one bay of a terrace, a middle floor of a stack, a corner unit
  with two party walls. Until now this desk could only say so about the floor,
  and every other surface was exposed whether the building it stood for was or
  not.

  The key is a plan with a section drawn through it. The four walls are the
  edges of the plan and turn with north, exactly as the glazing key's bars do;
  the roof and the floor are the two surfaces a plan cannot show — it is a
  horizontal cut and they are what it cuts through — so they are drawn as the
  section they would appear in, roof over floor, inside the square. Adiabatic
  is a doubled line, the way a party wall is drawn on any plan, and open to the
  weather is a single hairline. **The axonometric is the same control**: the
  three faces the viewpoint shows can be clicked to flip them, and every
  adiabatic surface is hatched like a cut — faintly, through the box, for the
  three facing away.

  On Denver's two design days, with the ideal unit and the internal gains in
  the path: the stock free-standing box carries 511.0 m² of exposed envelope
  at an A/V of 0.481 and asks for 82.5 kWh of heat. Take the east and west
  walls out as party walls and it is 371.6 m², 0.350 and 39.6 kWh — a little
  over half the heating for a building nobody moved a millimetre. Take the roof
  out instead, as a middle floor, and it is 47.8 kWh. Take all four walls out
  and the heating is 0.0 kWh against 99.0 kWh of cooling: a top-lit core, which
  is a real building and not one this page could previously describe at all.

  An adiabatic surface has no outside, and the engine refuses an opening cut
  into one, so the wall that goes out takes its glass, its overhang and its
  fins with it — the glazing key greys that wall and says *The north wall is
  adiabatic, so there is nothing outside it to open onto*, and Skylights
  blocks itself when the roof goes. The window-to-wall and skylight-to-roof
  ratios now divide by the surfaces that have an outside, which is what those
  ratios have always been measured over.

- **The sheet says which build of itself you are reading.** The title block's
  Sheet cell has always carried a revision, and it was the string `Rev A`,
  hand-lettered and never once true. It now carries the build: `E-01 · Rev
  0.2.0` on a tagged release, and `E-01 · Rev 0.2.0+cd5881e` on the far more
  common case of a deploy from `main` with no tag on it, the sha being semver's
  build metadata — the same declared version, this particular build of it. It
  links to the release or the commit it names, so a reader who thinks a number
  looks wrong can now say which drawing the number was on, and the run bundle's
  manifest carries the same line beside the EnergyPlus version.

  The date under it is the revision's, taken off the commit. It used to be
  `new Date()` evaluated in the browser, which lettered "Issued" with the day
  the page happened to be opened: a drawing dated by whoever picked it up.

- **Every number a slider carries is now a box you can type in.** The five
  seventy-six scales on the desk, the eight walls of its two plan keys and the
  five dimensions under the drawing — which are five of those same controls,
  drawn twice — all letter their value exactly as before, and every one of them
  is now also the way to set it: click the number, type, Enter. A slider cannot
  say an exact figure — width runs 4 to 40 m across about 200 px, which is
  0.18 m to the pixel — so 12.00 m was a hundred presses of an arrow key away.

  Nothing is drawn around the box. No border, no fill, no spinner, no focus
  ring: the number reads as the lettering it always was, and the only thing
  that says it can be edited is the I-beam the cursor becomes over it. A sheet
  made of hairlines cannot afford eighty more rectangles to say the same thing.

  A typed value is brought onto the control's own face — clamped to the stops
  and snapped to the step, then rounded to the step's own decimals, because
  `0 + 3 * 0.05` is 0.15000000000000002 and that number would ride the
  permalink and be written into the IDF exactly as it stands. Anything that is
  not a number is refused whole and the model's own value comes back, the way a
  bad link is: no half-reading of `12abc`. The unit and the zero word are
  accepted, since they are what the box says when it is not being typed in —
  `12 m` means 12 m, and `Solid` closes a wall.

  Two quieter rules keep it honest. Focus shows the value itself rather than
  its lettering, because a height of 4.572 m reads as `4.57 m` on a face ruled
  to two places and a reader who touched the box and left it alone would have
  silently trimmed 2 mm off the building — and the box compares what it gave
  against what it got back, so a touch-and-leave commits nothing whatever.
  And a redraw never types over the reader: a study tick landing or a station
  attaching redraws every face on the desk, and the one being edited is left
  alone until it is let go.

- **The layered glazing model has a pane count, and the window says what it
  came to.** Two things were missing from the same strip. The layered model
  built a double unit and only a double unit — there was no way to ask for a
  triple — and neither model would tell you the one pair of numbers a window is
  actually specified by, because the layered one is set in causes (panes, a
  coating, a cavity) and the simple one hides its equivalent layer.

  **Panes** is a slider from 2 to 4, and it writes real sheets: *n* panes of
  6 mm clear float with *n* − 1 air cavities between them, the low-e coating
  staying on the cavity face of the inboard pane wherever that now falls —
  surface 3 in a double, 5 in a triple. On the default desk it is worth more
  than any other control on the strip: U 2.68 W/m²K at two panes, 1.73 at
  three, 1.29 at four, and 0.93 with a hard coat on the fourth.

  **As built** is the answer, read off the run rather than computed here. It
  stands under the controls and above the transmitted-solar meter, and letters
  the U-factor, SHGC and visible transmittance EnergyPlus itself worked out for
  the assembly, from the envelope summary the run already writes. Where the
  opening carries a frame it adds a second line for the whole window by the
  NFRC method, since that is where the frame's own conductance lands and the
  glass figures stop being the window's. It obeys the readings' rules like
  everything else on the sheet: an em dash before the first run, and nothing at
  all where the channel is out. Under the simple model it reads back the three
  sliders above it, which is the quiet confirmation that the equivalent layer
  is what you asked for.

- **Landmarks on the calibration faces.** A slider set in W/m²K is a quantity
  before it is a decision: `1.80` says nothing to a reader who reads *low-e
  double* perfectly well, and a face offering only a range and a tick has
  handed them the number and withheld the vocabulary. Fifty-one faces now carry
  the published cases they are read against — 149 of them — ruled under the
  face as dimension lines, with the one the reading is standing in lettered
  underneath. Dragging the U-factor face reads out *single · double, clear ·
  double, low-e · triple*, and the same sentence rides in `aria-valuetext`, so
  a reader on the arrow keys hears "1.80 W/m²K, double, low-e".

  Some of it was already on the desk as prose — "fresh snow reads near 0.7,
  asphalt near 0.1", "the stock R13LAYER is 2.29" — where the drawing could not
  reach it and the slider could not point at it. Those notes are landmarks now,
  declared once in `controls.js` and drawn by the console, by the plan key
  along each wall's own bar, and by the sheet's own dimension sliders.

  Where the cases come from is carried with them: ASHRAE 90.1's fenestration
  and lighting limits, 62.1's occupant densities and outdoor-air rates, 55's
  comfort bands, the Handbook of Fundamentals for glazing and metabolic rate,
  EN 12464-1 for illuminance, the Passive House Institute, the CRRC, the
  Beaufort scale, and EnergyPlus's own Input Output Reference for the engine
  defaults. `Landmark` refuses to be constructed without a source, because a
  landmark nobody can check is the interface asserting rather than measuring.

  The layered model's **pane count** is landmarked too, at *Double*, *Triple*
  and *Quadruple*, so the two glazing models name the same cases: the simple
  one's U-factor face is read in *clear double* and *low-e double*, and the
  layered one is set in the sheets that produce them. The notes carry what the
  engine returns for each on the default desk — U 2.67, 1.73 and 1.28 W/m²K —
  which is also the finding that an uncoated triple lands in the low-e double
  band, so the coating is the cheaper of the two moves.

  Nothing here reaches the IDF. A throwaway harness built the document at six
  desk positions before and after and hashed each one: byte-identical, with
  `applyModel` still idempotent at every position.

- **The blind's slat angle now says which way it runs.** EnergyPlus measures
  `WindowMaterial:Blind.slat_angle` from the *glazing's outward normal*, so 0°
  and 180° are closed and 90° is fully open — the opposite of what a slider
  running 0 to 180 suggests, and nothing on the face said so. Both stops and
  the middle are landmarked, and the strip states the convention.

- **The finding says what the building is before it says what the run made of
  it.** The paragraph under the plate was a reading with no subject: it opened
  *With no heating or cooling anywhere in this model, the envelope alone takes
  the summer design day's 15.1 °C outdoor swing down to 4.4 °C in the zone* over
  a desk of eighteen strips, none of which it named. It now opens with the
  shoebox — *A single storey of 232.3 m², 15.24 m square and 4.57 m tall,
  glazed 0.20 south under a 0.60 m overhang* — and then reads it.

  What the second sentence carries is decided by difference: a desk has ninety
  controls and a paragraph has room for three, so the moves are ranked by how
  far each sits from its own default, and a channel patched into the path
  outranks any slider — *With 0.50 ACH of leakage, gains of 16.0 W/m² over
  08:00–18:00 at 12.0 m²/person and an ideal unit holding 20.0–26.0 °C.*

  **Every compass word is measured rather than named.** `turn()` puts the
  orientation into the vertices and leaves the wall names alone, so on a
  building turned 40° the wall the plan calls south faces south-east; the
  description reads each wall's bearing off its own outward normal and letters
  it beside the word — *glazed 0.45 south-west (220°) and 0.30 north-east
  (40°)*. Areas, ratios and overhang reaches are read off the document too, so
  a channel patched out from under a control describes what the document holds
  and not what the slider still says: with Fabric and Mass out, the sentence is
  *solid on every face. With every surface adiabatic and the slab swapped for a
  massless layer.*

  Which surfaces have an outside at all is part of it: a wall or roof set
  adiabatic reads as *the north wall adiabatic*, since three exposed walls and
  a party wall is one bay of a longer building and a paragraph that only said
  what was glazed would letter that fourth wall as solid.

  A setting is described by the object it reached rather than by its own value,
  which is a sharper rule than it sounds: *Available* is not a modifier on a
  unit that has two setpoints, so at "Heat only" — where the model holds a
  `ThermostatSetpoint:SingleHeating` and the cooling setpoint reaches nothing —
  the sentence reads *an ideal unit heating to 20.0 °C*, and "Occupied" claims
  occupied hours only when Gains is in the path to give it a band to follow.

  Nothing else is claimed that is not measured — no typology, no assembly names
  and no verdict — for the reason the rest of the sheet gives an em dash: 12 m²
  per person is a number, and "an open-plan office" is a building this model
  was never given.

- **Each wall of a plan key can be swept.** The window-to-wall ratio and the
  overhang projection were the two controls on the desk a study could not be
  taken of, which is the wrong two: an elevation is where orientation stops
  being a diagram and becomes a number, and "what does glass on the west cost
  me?" is the question a shoebox exists to answer. Each of the eight walls now
  carries its own **Study**, in the legend under the plan where that wall's
  number is already lettered, and draws its own curve.

  Four walls are four studies, not one, because a study holds the whole desk
  still and moves a single parameter — turning all four together would answer a
  question about a building nobody is designing. So the curves stack under the
  plan in compass order, each card naming its wall, and each is stale, stopped,
  cleared and re-swept on its own. On Denver's design days the difference is the
  point: north from solid to 0.90 moves the summer peak 32.7 → 36.8 °C, and the
  same glass on the west moves it 32.7 → 51.1 °C.

  **An overhang over a solid wall is refused, and says why.** Overhangs are cut
  from the opening they shelter, so a projection set on an unglazed elevation
  reaches no object in the document — measured, four positions of the west
  overhang wrote four byte-identical IDFs. That is a sweep of twenty-one
  identical models at full engine price, so the offer is disabled with the
  wall's own sentence — *The west wall has no opening, so an overhang there
  hangs on nothing* — and the reading and its bar on the plan are greyed
  alongside it. Until now that control could be turned all day, on a desk that
  never moved, with nothing anywhere to say so.

- Skylights, as their own strip at **04**, between Glazing and Shading. The
  roof was the one elevation this desk could not open: it carried an R-value
  and an absorptance and nothing else, so the whole question of top-lighting —
  the one an architect asks about any deep plan — could not be put to the
  engine at all.

  The strip owns a **skylight-to-roof ratio**, an **arrangement** (square
  lights on an n × n grid, or linear rooflights running the width), how many
  **units across**, a **curb height**, and whether the glass is the walls' own
  assembly or **its own** unit with its own U-factor, SHGC and visible
  transmittance. Each light is a `FenestrationSurface:Detailed` cut into
  `Zn001:Roof001` and wound to match it, so its normal points at the sky; the
  curb is four `Shading:Zone:Detailed` faces standing round the opening.

  The curb is the part that earns its keep, and it is written as real geometry
  rather than as the one field that would say the same thing. A
  `WindowProperty:FrameAndDivider` has an `outside_reveal_depth` that shades an
  opening exactly as a curb does, in one number — but this sheet draws by
  reading coordinates back off the document, so a curb expressed as a number
  would shade the run and be invisible on the drawing, and a curb you cannot
  see is the one you forget you set. Measured on the Denver design days at a
  10 % roof ratio, four lights: transmitted solar falls from 57.0 to 33.5 kWh
  over the pair as the curb goes from flush to 1.2 m — 41 % — and the summer
  zone peak with it, 46.5 to 39.8 °C, monotone at every step between.

  What the rooflights themselves are worth is the finding the strip exists to
  produce. At the default 6 % ratio on the stock Denver box, transmitted solar
  goes from 5.1 to 33.6 kWh over the two design days — 6.6× — against a wall
  ratio of 5 % that contributes the smaller half of it, because a horizontal
  opening faces the one part of the sky that is never behind a neighbour and
  never off to one side. Swept from solid to 30 % the summer high climbs to
  63.3 °C while the winter low moves 0.4 K, which is the asymmetry a top-lit
  plan lives or dies by and which no wall control on this desk can show.

  Two joins with the rest of the desk, both stated in the interface rather than
  left to be discovered. **Daylight** now takes a rooflight as an opening, so a
  building with no window in any wall can still be top-lit and dimmed — and its
  precondition now asks whether the opening is actually in the document rather
  than only whether a slider is off zero, which it did not before. **Blinds**
  reach the rooflights when their glass is the walls' assembly and cannot when
  it is their own: simple glazing is one equivalent layer with no cavity to
  hang a slat in, and naming such a surface on a `WindowShadingControl` is a
  severe error rather than a blind that quietly does nothing. So the shading
  control is written for the surfaces it can serve, and the glass selector says
  which those are. Its precondition asks the same question Daylight's now does,
  of both kinds of opening: that the channel owning the glass is actually in the
  path, not merely that a slider is off zero — a blind with nothing to hang in
  used to read as engaged while writing no shading control at all.

- Holidays you define. The Run strip's **Holidays** switch reads *From file*,
  *Listed* or *None*, and under it is the list itself: dates you type, days you
  remove, and five published calendars — United States, Canada, England and
  Wales, France, Germany, the same five regions the tariffs cover — that stamp
  themselves into it. Each entry becomes a `RunPeriodControl:SpecialDays`, so a
  fixed date (`12/25`), an nth weekday (`4 Thu in Nov`), a last weekday
  (`Last Mon in May`) and a multi-day shutdown (`12/24*9`) are all sayable. The
  list is drawn against a twelve-month rule, and the two kinds of date are
  marked differently on it: a fixed date gets a tick where it falls, an
  nth-weekday rule a hollow mark at its month's centre, because that is genuinely
  all the run period knows about it. What you type is what a scheme link carries
  — the field and the address bar speak one grammar — and a malformed entry is
  refused in words, in place, rather than clamped or dropped.

  The companion is on Gains, where the occupancy lives: **Holidays** as
  *As weekend*, *Closed* or *Open*. That control is the point of the exercise.
  Until it existed, every `Schedule:Compact` on the desk ran
  `For: Weekdays …` then `For: AllOtherDays`, and `AllOtherDays` swallows a
  holiday alongside Sunday — so observing a holiday and ignoring one produced
  the same building, and the switch that offered the choice was decorative. It
  now writes a `For: Holidays` row. Measured on a Denver year with the weekend
  open and the eleven federal holidays plus a nine-day Christmas shutdown
  listed: 488 against 499 MJ/m², a 2.2 % difference that was previously
  unreachable. At *As weekend* no row is written and the IDF is byte for byte
  what it was.

  Attach a year and each entry is lettered with the day it actually falls on —
  `3 Mon in Jan · Mon 16 Jan` — and ticked there on the rule. Anything outside
  the run is struck through and counted, because EnergyPlus drops such a day
  without a word — and there is no reading of it anywhere else: the error file
  is silent and the input echo lists every special day under every run period
  whether it lands or not.

  The reading is in **days, as a set**, because that is the unit that reaches the
  engine. One row can be a nine-day shutdown, and a shutdown beginning 24
  December is simulated up to the year end and then dropped, so a row can be
  partly in — it says `Sun 24 Dec · 8 of 9` on its own line rather than being
  struck through, which would be as wrong as saying nothing. Overlapping rows are
  unioned: the same shutdown swallows Christmas and, wrapping past the year end,
  New Year, so eleven federal holidays plus that shutdown is eighteen days and
  not twenty. Before a weather file supplies a calendar none of that is
  knowable, so the reading names what it can count — "12 holidays" — and becomes
  days once there is a year to count them in.

  All of it is checked against the engine rather than against itself: three runs,
  read back off their own `Site Day Type Index` series, agree with the desk's
  count exactly — 4, 9 and 10 days.

  One thing the arrangement cannot do, said here because the interface says it
  too. **Easter is not expressible** — an IDF date field carries no year, so Good
  Friday, Easter Monday, Ascension and Whit Monday cannot be written, and neither
  can Victoria Day, which is the Monday *preceding* 25 May and so is neither the
  third Monday nor the last. Each calendar therefore declares its whole national
  list and states, on the offer and before you press it, which days it is short
  and why: `DE 5/9`, `CA 8/10`.

  Attaching a station now also reads the EPW's own
  `HOLIDAYS/DAYLIGHT SAVINGS` record — not to fill the list, but to say what is
  in it. Every TMYx file names no holidays and no daylight saving period at all,
  measured across Denver, Berlin and the five files shipped with EnergyPlus, so
  *From file* has always been reading an empty list and reporting nothing about
  it. The strip now states it. A file that does name days offers them as one
  more stamp.

- A register of standards, split the way the code splits them. The
  specifications live on the **console head** — five compact accordions beside
  the desk's own subheading, each folded to a name and a live
  conformance chip. **Standards** are laid *over* the drawing rather than in
  place of it: applying Passivhaus Classic writes the ten controls it has an
  opinion about — insulation derived from its U-values with the surface films
  taken off, a window at U 0.80 with the g ≥ 0.5 its own inequality demands, an
  airtightness converted from n50 0.6 by the divide-by-twenty rule, mechanical
  ventilation at 75 % recovery — and leaves the massing, the site, the context,
  the engine settings and the tariff exactly where you put them, so *what would
  it take to build this to Passivhaus* is a question you can ask of the building
  already on the sheet. Every number carries the arithmetic that produced it,
  the way the bill's rates do. Whether the desk still meets a specification is
  **measured off the controls** each time they move rather than remembered:
  nudge a wall and the chip falls adrift by itself, naming the clause that
  drifted. Alongside Passivhaus sit EnerPHit, LETI's commercial office targets —
  which set no control at all, and are in the list precisely to show that a
  specification and a target are different things — and two of this sheet's own
  partis, a shaded free-running heavyweight and an all-glass office plate,
  labelled as the sheet's own rather than borrowing anybody's authority.

- **Peak loads, read beside the energy.** A demand is what a building costs to
  run; a load is what has to be there on the worst hour, and it is the number
  the plant, the risers and the distribution are actually sized from — so the
  scoreboard now carries peak heating and peak cooling in W/m², and the shelf
  keeps the heating peak beside each scheme's energy. Passivhaus's *heating
  load ≤ 10 W/m²*, previously listed among the things this sheet could not
  judge, is now one of its lines, alongside the demand it is an alternative
  route to rather than a second hurdle. Unlike every other criterion here a
  load does **not** need a weather file: sizing days are precisely the
  conditions plant is designed against, so `Target.needs` distinguishes
  `'year'` from `'run'` and the board answers something on a desk that has
  never been near an EPW. It costs no new output request — the hourly system
  transfer rate the balance rail already draws is the whole of it. Worth
  seeing: the stock desk built to Passivhaus in Denver clears the heating
  *demand* at 8.6 kWh/m²·yr and misses the *load* at 13.9 W/m². Peaks get
  treated as an afterthought; this is what that costs.

- The targets became a **scoreboard on the sheet**, under the results they are
  read from — every standard's criteria against the one run, all at once, since
  nothing is remembered and there is no "applied standard" to filter by: one
  solved year, every published line it would clear or miss. Criteria read as
  *asks for · reads · margin*, with one redline mark on a miss and none at all
  on a pass; a criterion whose limit PHI sets per building prints its reading
  with no verdict, and one the run cannot answer says what to do about it
  instead of standing as an em dash. Each standard's accordion also lists what
  this sheet **cannot** judge — the blower door, the primary energy, the
  thermal bridges, the peak heating load — because a panel showing only the
  half it can answer would read as a certification, and a one-zone shoebox with
  ideal loads is not one.

- **Chasing a standard.** Any standard on the scoreboard can be armed with the
  same square marker the run ledger and the console's patch buttons use, which
  reduces it to its single worst line and letters that up beside the drawing —
  *Peak heating load reads 14.8 against 10, over by 4.8 W/m²* — with a ghost of
  where the margin stood when you took hold. The scoreboard reads a run; this
  reads a gesture, so the answer to "is what I am dragging right now helping"
  is under the hand rather than a screen away. The worst line is chosen by
  ratio rather than raw difference, since being 3 over means one thing against
  a limit of 15 and another against 55, and the line always says how many of
  the standard's criteria it is speaking for — a verdict from the two a design
  day can answer must not read as a verdict on a standard that states four.
  Chasing is the bill's pin in another column: chosen, visible, unchoosable,
  and making no claim about the building, so conformance stays the measured
  thing it was.

- **Kept schemes.** *Save this scheme* joins the run bundle and the scheme link
  in the run log, and keeps the whole desk — stored as the very fragment the
  link button copies, so keeping and sharing are one format and a scheme kept
  today still opens on a page that has since grown a channel. Each kept scheme
  carries what it was reading when it was kept, and the register differences the
  sheet against it — but only where the two are like for like, the same kind of
  run in the same currency over the same end uses, which is the bill's own
  refusal restated on data that survives the browser's storage. Restoring a
  scheme that names the attached station is instant; one that names a different
  station is a different climate, so it goes through the link and the page
  reloads into the decode that already knows how to refuse a weather file it
  cannot fetch. Schemes are named after they are kept, not before, because being
  asked to think of a name mid-thought is what stops anybody keeping anything.
  The shelf holds twenty-four and, when full, says so rather than quietly
  dropping the oldest; a shelf that cannot be read is refused whole with the
  reason in its place, never drawn as an empty one.

- Parameter studies. Every scale on the console now carries a quiet **Study**
  action that sweeps that one control across its full range — about twenty
  solves of whatever run the sheet would make, a second or two of engine on the
  design days, twenty seconds or so counted out per run on an attached year —
  and draws the response as a small curve under the control, with a redline
  tick standing where the control stands now. What the curve reads depends on
  the desk: free-running, the highest hour of zone temperature in the warm pen
  and the lowest in the cold one (the summer and winter design days' extremes,
  or the year's, sizing days excluded); with ideal loads in the path and a
  year attached, the demand intensities instead — TEDI in the warm pen, CEDI
  in the cold, and the building EUI in graphite, in kWh/m²·a of the bill's
  building section, delivered demand before any plant. The
  desk itself never moves during a sweep: the model ends byte-identical to
  where it started, the address bar and every readout hold still, and any real
  gesture cancels the sweep instantly. A study names the desk it was swept
  against and dims once any *other* control moves; dragging the swept control
  just walks the tick along a curve that is still true. Studies are cleared by
  a station change (they were swept under the old climate) and absent on
  priced channels, whose controls never reach the engine. A failed sample is
  drawn as a gap in the curve, never an invented point.

- Shareable scheme links. The address bar now carries the whole desk — every
  control off its default, the patch state, and the attached TMYx station with
  its exact year window — as a readable URL fragment
  (`#v1&width=20&wwrS=0.35&stn=725650`), rewritten on every gesture release. A
  **Copy scheme link** action joins the run ledger beside the bundle download,
  and the bundle's manifest now cites the link, so a run can be reproduced
  locally *and* re-solved live from the same download. Opening a link rebuilds
  and re-solves the scheme; a link that cannot be honoured — an unknown key, an
  out-of-range value, a station whose archive cannot be fetched — is refused
  whole with the reason in the status line, never half-loaded. The encoding is
  versioned so links keep working as controls are added.

- Downloadable run bundle. A **Download run bundle** button on the run ledger
  packages the exact IDF and EPW handed to the engine together with the tabular
  report and console log it wrote and a plain-text manifest, so any run can be
  reproduced in a local EnergyPlus rather than taken on faith. A design-day run
  carries no weather file, and the manifest says so instead of shipping a
  fabricated one.

### Fixed

- **Bypassing Fabric fatalled any desk with an opening on it.** Patching that
  channel out sends every surface adiabatic, and EnergyPlus refuses a
  `FenestrationSurface:Detailed` or a `Shading:Zone:Detailed` whose base
  surface is one:

      ** Severe ** FenestrationSurface:Detailed="ZN001:WALL001:WIN001",
                   invalid Building Surface Name="ZN001:WALL001".
      ** Fatal  ** GetSurfaceData: Errors discovered, program terminates.

  One wall window was enough — the desk ships with one — so the flask the
  Fabric strip advertises was only reachable by patching Glazing, Shading and
  Skylights out by hand first, and reaching for it any other way stopped the
  run. It was recorded as unfixable through `Channel.requires`, on the grounds
  that a precondition can only ask about channels already decided and Fabric is
  declared at 07, below all three that would need to ask. That was the wrong
  reading of the machinery: being *bypassed* is an input to that loop rather
  than something the loop decides, so it can be asked of any channel in any
  order. `requires.test` now takes an `off(id)` beside its `on(id)`, and
  Glazing and Skylights refuse themselves with a sentence each instead. The
  appliers ask the document as well — the boundary `applyFabric` has already
  written, rather than a parameter — so an opening is never written where it
  cannot stand, however it came to be there.

- **The low-e coating note named the wrong coating.** The Glazing strip said
  "0.04 is a hard coat"; 0.04 is a *soft* coat's emissivity. A pyrolytic hard
  coat is fired on at the float line and sits near 0.15 to 0.20, four times
  that, and the two are chosen for different reasons — one survives handling,
  the other performs. Both are landmarks now, with uncoated float at 0.84.

- **Five landmarks could be seen and never reached**, which is how the rule
  that catches it came to be written. `input[type=range]` only ever returns
  `min + n·step`, so a case declared at a published figure that falls between
  two positions draws on the face, names itself in its tooltip, and can never
  once be the reading — the reader is shown a place they cannot stand. The
  BLAST infiltration constant (0.606 against a 0.01 step), the DOE-2 wind term
  (0.224 against 0.005), BLAST's stack term (0.03636 against 0.001) and two of
  ASHRAE's lighting allowances (imperial figures landing at 6.89 and 10.76 W/m²
  against 0.1) were all of them. They are declared now as the narrow band the
  step grid actually makes, with the published figure in the note, and
  `readLandmarks` throws at module load for any that is not reachable.

- **A fin was read as an overhang.** A wall carries up to three shades and the
  overhang is written first, so the quantities panel took the first shade on
  the south wall and reported its reach — which on any elevation carrying fins
  and no overhang is a *fin's* depth, lettered as `Overhang, south 0.40 m ·
  PF 0.29` over a window with nothing above its head. The overhang sits at one
  height and a fin runs sill to head, so the two are told apart by their own
  geometry now rather than by which was written first.

- **"Heat only" and "Cool only" fatalled the engine.** The System strip's
  *Available* selector wrote the thermostat's control type number — 1 for
  heating only, 2 for cooling only — but left the control itself named as the
  `ThermostatSetpoint:DualSetpoint` the *Always* setting uses. EnergyPlus reads
  that number as a thermostat *type* and then looks for a control of that type
  in the zone's own list, so a 1 over a dual setpoint is not a dual setpoint
  with its cooling half suppressed; it is a control of a type the zone does not
  have, and the run stops in get-input before any environment starts:

      ** Severe  ** Control Type Schedule=CONTROL TYPE
      **   ~~~   ** ..specifies 1 (ThermostatSetpoint:SingleHeating) as the
                     control type. Not valid for this zone.
      **  Fatal  ** Errors getting Zone Control input data.

  So two of the four settings of that control could not be solved at all, on
  any weather, on any desk — the sheet reported only that the engine had
  crashed. Each setting now writes the setpoint object its number names, and
  the meters say what the labels do: on a Boston 725090 year *Heat only* heats
  and never cools, *Cool only* the reverse, and *Always* does both.

- **The results schedule and the bill collided on a phone.** Both are tables of
  right-aligned figures, and a bill of a year's run under a pinned scheme wants
  seven columns: an end use, three bases and a change against each. At 390 px
  that is about twice the sheet's width, so the figures ran into one another —
  `18,456 −3,193$1,090 −$1893,727 −645` was one row of it — and the results
  schedule pushed its unit column clean off the sheet, which is the one failure
  a page whose claim is that every figure means something cannot have.

  Below 620 px a row now folds the way the desk's strips fold below `--index`:
  the quantity keeps its own line, and every figure stands on a line of its own
  beneath it, carrying the head it was under. Nothing is dropped and nothing
  scrolls out of sight. The head each cell carries is set where the cell is
  built, so the words over a column and the words beside a figure are one
  string and cannot drift, and `keepTableSemantics` states the table roles
  outright because `display: grid` on a row drops them in every engine — a
  reader on a screen reader would otherwise lose the structure at exactly the
  width where the figures need it most. Above the breakpoint the two schedules
  gain the one thing they were also missing: a gutter between one column of
  figures and the next, which is what had `COST` and `CARBON (KGCO₂E)` running
  together into a single head as the window narrowed.

- The window-to-wall ratio counted every opening in the model against the wall
  area alone. With nothing but wall openings in the document that was right by
  accident; with a roof that can be glazed it would have put the rooflights
  into the numerator over the walls' denominator and reported a ratio about no
  part of the building. Openings are now sorted by the surface they are cut
  into, and the quantities panel reads *Glazing, walls* and *Rooflights*
  separately — the first of which was already mislabelled *Glazing, south*
  while summing all four elevations.

- The model console described itself as sixteen channels while carrying
  seventeen, in the desk's own subheading, in the general notes and in four
  layout comments. It is eighteen now, and says so.

- **The console was unusable on a tablet in landscape.** The desk is a column
  of viewport height with a fixed head and a fixed rail either side of its one
  scroller, so a short window took its room out of the eighteen channels and
  out of nothing else. Measured on an iPad at 768pt: the head was 458px, the
  rail 172, and the channels were left **104px** — 14 % of the desk — to scroll
  12,147px of controls in. A phone held sideways at 390pt got 3px.

  Three changes, in the order the room is worth taking back. The register folds
  on a short desk, since it was holding 323 of the head's 458px and is the one
  block on the desk you reach for occasionally rather than constantly — closed
  it still reads, carrying *built to Passivhaus Classic* or *5 standards*, by
  the same rule that keeps a folded strip a reading. Below 600px tall, where no
  amount of folding rescues a column, the desk goes under the sheet and becomes
  its own index sheet — the escape the phone breakpoint already takes, since it
  is one question asked in two directions rather than two questions. And
  *Widen the window* is no longer said to a touch device, which has no window to
  widen and was losing two lines of the head to being told so.

  The channels now get 381px on an iPad 9.7 in landscape (was 104), 433 on an
  iPad Air (was 156), 513 on a 1440×900 laptop (was 298), and 710 on a phone in
  landscape (was 3). A desk tall enough to hold the register open — an iPad Pro
  12.9, a desktop — is unchanged.

- The scoreboard and the kept-schemes shelf lost their table semantics on a
  phone. Both fold to a block per row below 620px, and `display: block` on a
  `tr` drops the implicit row and cell roles in every engine — so the two
  tables the register is made of read aloud as loose numbers with no criterion
  attached to any of them, at exactly the width where the columns are gone and
  the roles are the only structure left. They now go through the same
  `keepTableSemantics` the results schedule and the bill do.

- **The scoreboard's *Chase* marker never said what chasing was.** A bare verb
  on a small button names the control and explains nothing, and the five copies
  of it down the board were identical to a screen reader — five buttons reading
  "Chase", none of them naming the standard they belong to. The board's lede now
  prints the whole of it in a sentence, which is where an explanation on this
  sheet goes: a tooltip floats, and a hint that only exists on hover does not
  exist on a phone at all. The marker carries the same sentence on its `title`
  and `aria-label`, with the standard's name in it, and both halves flip when it
  is armed — *Stop chasing Passivhaus Classic: take its line down from beside
  the drawing*, rather than a tail still describing the state being left.

### Changed

- **A run that fails can be downloaded.** The bundle used to ride on the
  readings, so the download went dark at exactly the moment it became worth
  having: a fatal leaves no plate, no schedule and no bill, and until now it
  left nothing to carry off the page either — the one run nobody could debug
  here was the one run nobody could debug anywhere else. It now follows the
  run rather than the readings, and all three ways a solve can end without
  results — an engine that never accepted the model, a fatal, a run that came
  back clean but wrote no zone temperature — bundle exactly as a good one
  does.

  A failed bundle is not dressed up as a successful one. The button reads
  **Download failed run**, the file arrives as `…-failed.zip`, the manifest
  says so on its first line, quotes the sentence the page reported under *Why
  it stopped*, and leaves every figure the run never reached — the hours, the
  exit code, the error counts — as an em dash rather than a zero. It also
  points at `results/console.log` first, which is where the answer usually is:
  the engine echoes the whole of `eplusout.err` into its console, so the
  bundle carries the severes naming the object and the field, where the page
  itself could only ever show a count of them.

- **The run now follows the weather file's calendar.** `RunPeriod`'s day of week
  for the start day had been pinned to Tuesday since the model was written,
  which overrode what every weather file says about itself — TMYx declares
  `DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31` — and put every annual run on an
  invented year. Left empty, EnergyPlus takes the file's own start day and picks
  a real non-leap year to match it, so weekends fall where weekends fall. It is
  one field, and it is the only difference between the default IDF before this
  change and after.

  It matters more now that the year can be run in pieces. The field anchors to
  each run period's own begin date, so pinned, a January and a June would both
  start on a Tuesday and sit in two different calendars. Empty, they share one:
  measured, January begins Sunday and June begins Thursday, which is 2017.

  This moves results. Every annual run's day-of-week alignment shifts by two
  days, so anything scheduled by weekday — the occupancy band's weekends, the
  setpoint setback — lands on different dates than it used to, and any figure
  from a previous annual run is not comparable. Design-day runs are unaffected;
  a run period is not simulated without a weather file.

  It also makes the holidays true rather than approximately placed. Under the
  old Tuesday, Martin Luther King Day resolved to 21 January, Memorial Day to
  27 May and Thanksgiving to 28 November. Following the file they are 16 January,
  29 May and 23 November — the real 2017 dates, which is the year EnergyPlus
  picks for a Sunday start. And the weekend holiday rule finally does something
  real: with it on, New Year gains Monday 2 January and Veterans Day moves from
  Saturday the 11th to Monday the 13th, exactly as observed.

- The run period is a year of months, not two sliders. **Run from** and **Run
  to** on the Run strip are replaced by a twelve-cell calendar: tap a month to
  take it in or out, sweep across several in one gesture, or walk the year with
  the arrow keys and toggle from the keyboard. Months need not be consecutive —
  each unbroken group is handed to EnergyPlus as its own `RunPeriod`, so
  January and July can be solved without the spring between them, and the strip
  says in the engine's own words how many run periods the mask makes. Below
  400px the year folds to two rows of six rather than shrinking twelve cells
  past reading. A run needs at least one month, and the last one standing says
  so rather than quietly refusing.

  The rest of the sheet follows the run: a solve can now hold several weather
  environments, so the results schedule heads a column per run period with the
  months it covers, the chart letters each period's month ticks, and the run
  bundle's manifest names the periods instead of claiming "Annual". A weather
  file is no longer taken to mean a year — a bill metered over four months says
  so in its lede and draws no per-m² intensity, because every benchmark that
  figure exists to be compared against is twelve months long.

  Breaking, deliberately: the `beginMonth` and `endMonth` parameters are gone
  rather than migrated, and a scheme link naming either is refused. Nothing has
  been published yet, so there was no link to carry forward and no reason to
  spend a link version on one. The run period rides in a link as
  `months=001110000000`.

### Removed

- **A fifth weekday is no longer sayable.** `5 Fri in Dec` parsed happily and
  would have stopped the engine dead in any year December had only four Fridays
  — `** Severe ** SetSpecialDayDates: … not enough Nths`, a fatal error, not a
  warning. The nth now runs 1 to 4, plus `Last`. Every month has at least 28
  days, so those five always exist, which makes the grammar total: every list
  that parses runs, under every calendar. Nothing in any published calendar was
  a fifth weekday.

- Two entries starting on the same date are refused. EnergyPlus states plainly
  that it gives "no error message on duplicate days or overlapping days", so the
  second would have disappeared into the first without a word.

## [0.1.0] - 2026-08-14

Initial public build of the shoebox: a one-page, client-side EnergyPlus demo
laid out as a drafting sheet, served at
[shoebox.idfkit.com](https://shoebox.idfkit.com).

### Added

- In-browser EnergyPlus engine that re-solves as you work — a design day in
  about 50 ms — alongside an axonometric of the zone and a temperature plate,
  both drawn directly from the `IDFDocument`.
- Model console gathering every control onto one desk, with a balance rail that
  reads the zone air heat balance back off each run.
- Weather location picker over 17,000+ TMYx stations, searchable by city, state
  or WMO number or by nearest to your location; the chosen station's design
  conditions are taken from its DDY, and a full 8,760-hour year replaces the
  design days.
- Window overhang control, projecting shade measured along the host wall's
  outward normal so it holds under rotation.
- Bill of quantities priced from published, non-residential tariffs for North
  America (by state and province) and Europe (by country), reported in both
  cost and carbon.
- Licensing and disclosure section citing the open datasets and npm packages
  behind the page.

[unreleased]: https://github.com/idfkit/idfkit-shoebox/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/idfkit/idfkit-shoebox/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/idfkit/idfkit-shoebox/releases/tag/v0.1.0
