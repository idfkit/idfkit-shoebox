# Feature Specification: The strategy plan

**Feature Branch**: `009-strategy-plan`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "The strategy plan, a whole-desk companion to the E-02 survey. The E-02 survey cuts a 2-D topographic ground along two controls the reader chooses; this feature adds the component that reads the whole design space at once and answers the question the survey leaves open: what pulls a design toward a performance, across every control, and what should the designer do about it." (The full description, with its measurements, is summarised under Overview. The exploration it draws on is published at https://claude.ai/code/artifact/27027f54-b1d4-4957-8183-6a0474f3cb72.)

## Overview

The E-02 survey is ground. Two controls are its axes, a reading is its height, and every spot height is a building the reader can stand on. It answers "what does this plane of the design space look like from here", and it answers it honestly. What it cannot answer is the question that comes before it and the one that comes after.

Before it: **which two controls?** The desk carries around ninety numeric faces and some thirty choices. The pull ranks the numeric faces at the stance, which is the right answer for the building on the desk and a partial one for the design space, because a control that barely matters here may matter a great deal three moves away, and a choice the reader has never flipped may open a design space they have never seen.

After it: **so what?** Knowing that a control pulls hard on a reading is a fact about the model. An architect does not decide which parameter matters. They decide what to commit to now, what to trade, where they are free, and which door to open next.

The strategy plan is the instrument that answers both, in a panel of its own on the left of the sheet, with the survey's own ground inside it. It reads the whole design space at once and turns what it measures into the decisions an architect actually makes.

### Every reading on the desk

The plan is for every outcome the desk can measure, not for a class of them. It reads the same roster the studies and the survey already offer: eleven choices covering thirteen outcomes.

| What the run needs | Readings |
| --- | --- |
| Any run, design days included | the zone's high and low temperature; peak heating and peak cooling load |
| A weather year | heating and cooling demand intensity (TEDI, CEDI); energy use intensity; cost; carbon; hours above 25 °C; CIBSE TM59 criteria a, b and c |

Each reading keeps the availability rules it already has: cost and carbon need a tariff for the station, TM59 needs Gains in the path and a summer in the run, the peak loads need System, and every year-long reading needs a weather file.

### What the exploration measured

The idea was tested before it was specified. On 1,600 native EnergyPlus 26.1 runs of the shoebox (every live numeric face drawn independently across its range; the free-running default desk and the same desk with System patched in; Denver Centennial design days), each way of drawing the whole design space on one sheet was scored by how much of a reading a reader could recover from a design's position on the drawing alone, measured on designs the drawing was not built from.

| How the designs are arranged | Zone summer high | Zone winter low |
| --- | --- | --- |
| By how alike their settings are (three standard methods) | none to 15 % | none to 10 % |
| The survey today: the two controls that pull hardest | 54 % | 13 % |
| Along the moves the reading actually follows | 72 to 75 % | 57 to 68 % |

With System in, the same approach explained 78 % of the peak heating load and 78 % of the peak cooling load along a single move each.

Three findings shape everything below.

1. **Principal components of the settings draw nothing.** A sample spread evenly over every control has no shape of its own, so any map that sorts designs by similarity of settings (principal component analysis of the inputs among them) puts a hot building beside a cool one. Removing the controls that reached no object only lifted the best of these maps to 23 %.
2. **Principal components of the response draw the structure.** Applied instead to how the reading changes as each control moves, the same analysis finds a few combined moves that decide the reading. One combination of controls, turned together in fixed proportions, held 58 % of what drives the zone's summer high. Every such move is a weighted mix of named controls, so it can be lettered as a recipe: *lower U-factor, higher SHGC, a brighter ground*. This is the approach the plan takes.
3. **Each reading has its own moves.** The summer high's leading move sits 57° from the winter low's; the heating peak's sits 62° from the cooling peak's. A single map shared by every reading would serve none of them, so there is one plan per reading.

**What the evidence does not yet cover.** Two things. First, these measurements are of the four readings two design days can answer; the nine year-long readings have not been measured, and three of them are counts against a threshold (hours above 25 °C, TM59 criteria), where a small move can flip an hour or a night across the line and straight moves may explain less. Second, the exploration held every choice at the stance and left the patch bay as it was, so nothing yet measures the jumps between worlds described next. The plan is therefore required to letter how much it explains for every reading and every world, and to be checked on year-long readings and on jumps before it ships.

### Choices are other worlds

A numeric control is a direction the design can walk along. A choice is not. Switching the glazing model from a simple rating to a built-up assembly of panes does not nudge the design: it moves it into another world, where the pane count, the coating and the cavity width come alive, the U-factor and SHGC sliders go dark, and the reading follows a different set of moves. Choosing a heavier slab material, a different shade type or, with Air in the path, a network air model does the same. So does adding a design element the building did not have: patching in Blinds, Skylights, Shading, Daylight controls or the neighbouring Context opens a design space the desk has not shown until then.

That is the experience this component exists for. The reader is not handed one map of everything; they discover the design space the way a traveller does, world by world.

- **The plan shows the world the desk is in, and the worlds one door away.** A door is a choice, or a design element patched in or out. Each neighbouring world stands on the plan as its own island of measured designs, placed on the same reading. The islands form an archipelago laid out by the doors between them, and their positions are schematic and say so, because a reduction cannot place them: measured on 812 annual runs across two glazing worlds, maps of the settings put the two worlds on top of each other, and the worlds overlap in performance too, each jump being 3 to 35 % of the spread within a world. So the distance between two islands means nothing, and the size of each jump is lettered beside its door instead. Worlds two or more doors away are not enumerated up front: the doors make far more combinations than any run budget could visit, and most of them are never wanted.
- **The jump is measured, not inferred.** The difference a door makes is taken on matched designs: the same numeric settings, run once in each world. A jump is therefore a spread of real differences, one per building, never the gap between two averages of different buildings.
- **Stepping into a world is how exploration continues.** Pressing a design on another world's island moves the desk there. The plan redraws from the new world: its own live controls, its own moves, its own neighbours.
- **A door is also a move.** Across two readings, a jump can help both, trade one for the other, move one alone, or change neither, and it is classified exactly as a numeric control is.
- **Some switches are not doors.** System, Plant and Tariff stay as the reader set them. Patching System in or out changes what a reading means (a free-running temperature against a conditioned one) rather than what the building is, and Plant and Tariff price the result without reaching the model.

### What the architect gets from it

Pulled through to decisions, the same measurements say four things a designer can act on. For the free-running zone's summer high and winter low across the full desk:

| Kind of move | Measured examples (direction that helps) | The decision it supports |
| --- | --- | --- |
| **No-regret**: helps both readings | less east and west glazing, more exposed thermal mass, a lower storey | take it early; nobody needs to argue |
| **Trade-off**: one reading pays for the other | U-factor, roof and wall insulation, plan depth | the real design decisions, needing judgement and a stated exchange rate |
| **Lever**: moves one reading and leaves the other | SHGC, ground reflectance, roof colour, overhangs | the compensators that buy back what a trade-off cost |
| **Free here**: moves neither | sill height, frame, north overhang | permission to design it for daylight, view, cost or expression |

The first two rows pair into a strategy: *insulate for winter, then buy the summer back with solar control*. That is the passive-design rule of thumb, derived from this building rather than recited, and it is what the plan exists to produce. The same four kinds apply to any two readings on the roster, energy use against hours above 25 °C as readily as summer against winter, and to doors as well as to sliders.

The kinds are worth most where the architect's hand is. So each control's kind is also printed on its own strip in the console, beside the landmarks it already carries, and free controls are dimmed there rather than hidden: the architect sees *trade-off* on the U-factor strip at the moment they reach for it.

The measurements found the real peaks of this design space inside single controls rather than on the map. On the annual evidence desk (System, Gains and Daylight in, the Golden NREL year), SHGC was best for energy use near 0.41, because heating wants the sun and cooling does not; plan width and depth were best near 28 m; night setback near 7 to 8 °C. Everywhere else the best designs stood at the rim of their island, pushing a control to the end of its slider. So the plan names a sweet spot where one exists, on the moves panel and on the control's strip, and names the controls at their limit where the best designs lie at the rim, rather than implying a summit the map does not have.

### The vocabulary

The plan extends the survey's own vocabulary rather than inventing a second one.

| Term | What it means here |
| --- | --- |
| **Strategy plan** | The whole design space drawn on one sheet for one reading: every sampled design as a dot, placed along that reading's two leading moves |
| **Move** | A combination of numeric controls turned together in fixed proportions, along which a reading changes; lettered as a recipe with each control's share |
| **Door** | A choice on a building channel, or a design element (Shading, Blinds, Skylights, Daylight, Context) patched in or out |
| **World** | The design space behind one setting of every door: its own live controls and its own moves |
| **Neighbouring world** | A world one door away from the one the desk is in |
| **Archipelago** | The worlds drawn as islands, placed by the doors between them; positions are schematic, and each door carries its jump |
| **Jump** | The difference a door makes to a reading, measured on matched designs run in both worlds |
| **Share explained** | How much of the difference between designs a drawing accounts for, measured on designs it was not built from |
| **Terrain** | The smoothed, shaded surface drawn under one island's measured designs for one reading, its height the reading itself as on E-02's ground; inference, stated as such, and never a source of figures |
| **Screening** | The pull, taken at many points spread across the design space instead of only at the stance, for numeric controls and for doors |
| **Consistency** | How often a control's or a door's effect points the same way across the points measured |
| **Campaign** | The runs the plan has queued for the world the desk is in and the worlds around it; the reader can pause, resume or cancel it, and cancelling keeps every run already completed |
| **Sweet spot** | A value inside a control's range at which a reading is best, read as an estimate from the measured designs |
| **At its limit** | A control whose best designs stand at one end of its slider, because the reading keeps improving all the way there |
| **No-regret, trade-off, lever, free** | What a control or a door does to a chosen pair of readings, as tabled above |

### What the plan must never do

Each of these has an attractive violation, and each follows from the sheet's constitution.

- **It must not draw what it did not measure as if it had.** Every dot is a completed run. The terrain under the dots is inference: the space between two dots is many different designs averaged, so the terrain is stated in place as inference, smoothed so it shows no rise or hollow the dots do not support, drawn only where the dots are dense enough to carry it, and never read for a figure. Measured on 812 annual runs, a raw surface over a reading's map explained 41 to 76 % of it and showed two to six false local best spots; the smoothing is what keeps those off the sheet.
- **It must not blur one world into another.** A door cannot be part of a straight move, so islands are never joined by a line, a surface or a trend, and a move measured in one world is never lettered on another.
- **It must not look more certain than it is.** The share explained is lettered on every plan and every island, and the consistency on every classification and every strip tag. A drawing explaining 75 % and one explaining 15 % can look equally convincing; the number is the only thing that tells them apart.
- **It must not offer a map of resemblance.** It looks like a map of the design space and says nothing about performance.
- **It must not pick a design or a world.** The plan shows where designs fall, what moves them and where the doors lead. It awards nothing, ranks no design into a single score, and names no optimum.
- **It must not drop anything silently.** Every control and every door it did not vary is listed with the reason: not the building, a world the engine cannot enter from here, or measured to reach nothing for this reading.

## Clarifications

### Session 2026-09-10

- Q: Are choices such as the glazing model or the air model sampled as part of the design space, or held at the stance? → A: Sampled. A choice creates a jump into another world of the design space, like discovering a new world, and that is what the experience is all about. The plan shows the stance's world and every world one choice away, measures each jump on matched designs, and lets the reader step into a world to explore it and its own neighbours.
- Q: Is patching a design element in or out itself a door to a neighbouring world? → A: Yes, for the channels that are a design element: Shading, Blinds, Skylights, Daylight and Context. System, Plant and Tariff stay as the reader set them, because switching System changes what the readings mean rather than what the building is, and Plant and Tariff do not reach the model.
- Q: Does each control's kind (helps both, trade-off, lever, free) appear on its own strip in the console, or only in the survey's moves panel? → A: Both. The full moves panel stays in the survey, and a short printed tag stands on each control's strip and its folded index row, with free controls dimmed rather than hidden.
- Q: Inside each island, should the plan draw a topographic surface under the dots, or only the dots? → A: Dots over a smoothed, shaded terrain, stated in place as inference: smoothed so no summit appears that the dots do not support, drawn only where dots are dense enough, with the share it explains lettered and no figure read off it.
- Q: How should the worlds be laid out as islands on the strategy plan? → A: An archipelago: each world is its own island with its own moves and terrain, placed by the doors between worlds, with island positions stated as schematic and each door's jump lettered beside it.
- Q: On the terrain inside each island, should the best designs be the peaks or the valleys? → A: Height is the reading, as on E-02's ground: the best designs are the low ground wherever less is better (the zone's winter low is the one exception), and each terrain states in place which way is better.
- Q: When a control has a best value inside its range for a reading (a sweet spot), should the plan name it, and where? → A: Yes, in the moves panel and on the control's strip tag, labelled as an estimate with how consistently it held, and refused when it sits near an end of the slider; where an island's best designs lie at its rim, the plan names the controls at their limit.
- The design brief and "what is still in play" were removed from this feature at the user's direction. (Partly superseded in this session: constraints on the design space are back in scope and bind the sampler. A reading of what is still in play given decisions already made stays out.)
- Q (during planning): How are the worlds one door away measured, given that each island's own moves need their own screening? → A: Jumps first, islands after. Every neighbour's jump is measured automatically on matched designs; each island's own moves, terrain and share explained follow at reduced depth, in design-stage order, automatically on a design-day desk and on request (with the cost stated first) on an annual one. Until then an island shows its matched designs and its jump and says its moves are not yet measured, with its share explained an em dash and the reason. (When an island's own screening starts is superseded by Session 2026-09-11: on request, on every desk.)

### Session 2026-09-11

- Q: How many simulations should run side by side on the reader's machine? → A: N−2: the device's logical cores minus two, with no fixed cap, bounded only by a memory guard of half the device's memory at 256 MB per engine (4 GB assumed where the browser does not report it), and never fewer than one.
- Q: What should the reader be able to do to the runs the plan has queued? → A: Pause, Resume and Cancel, acting on the plan's campaign only: Pause holds its queue with runs already on an engine finishing, Resume continues it, and Cancel drops everything queued while keeping every completed run; studies and the survey are untouched.
- Q: What should the new left-hand panel hold, and what stays on the sheet? → A: Everything moves into its own panel on the left, mirroring the Model Console: the reading chooser, the campaign controls, the plan drawing, the islands, the screening and the four kinds. E-02 keeps a control that opens it, and pressing two controls in the screening still cuts the E-02 ground. (Where E-02 itself stands is superseded below: the survey moves into the panel too.)
- Q: What should happen when the plan's panel and the Model Console are both wanted but the window cannot hold the sheet and both? → A: Both stand open either side of the sheet where the window has room; where it has not, opening one folds the other to its head, still reading; below the index threshold (780 px wide or 600 px tall) the plan becomes its own page under the sheet, as the console does.
- Q: When the reader steps into a world, which of its runs should start without being asked? → A: On a design-day desk, the home world's own designs and screening and every neighbour's jump start on their own; each island's own screening starts only when the reader asks for that island, with its cost stated first, on every desk; on a weather year nothing starts until asked, as before.
- Q: When the topo map moves into the panel, where does the E-02 survey live? → A: It moves whole into the panel: its ground, its relief, its schedule of spot heights and its axis chooser. The sheet holds E-01 alone, the panel carries the E-02 title, and there is one ground drawn in one place. (Supersedes the panel-contents answer above, which left the ground on the sheet and gave E-02 a control that opened the panel.)
- Q: How should the reader move through the panel's parts? → A: One vertical sequence of numbered parts, every one present and readable without opening anything, each headed by the question it answers, and a part with nothing measured yet saying what it is waiting on. No tab, accordion or wizard gate, because each of those would put a reading, a share explained or a refusal behind a press.
- Q: In what order should the panel's numbered parts run? → A: The reading, then the plan and its moves, then the worlds one door away, then what pulls anywhere, then the ground cut along two of them, then the four kinds. The ground stands directly under the screening that hands it its two axes, and the sequence closes on the decisions.
- Q: On a wide window, how much width should the panel take? → A: One column that grows from its base width to a declared maximum, the sheet keeping its own minimum first. The numbered sequence stays one column at every width; within a part, a drawing and its readings may stand side by side above a declared threshold. Both numbers are declared once in the stylesheet and read back by script.
- Q: Now that the plan's terrain and the survey's ground stand in one panel, should the survey keep its contour lines and its relief block? → A: Yes. Each drawing keeps its own convention, because the difference is a fact about what each one measured: the survey's ground is measured along two chosen controls and carries contours and a relief, the plan's terrain is inference along moves and carries neither. The panel states that difference once, where the two meet.
- Q: Should a constraint narrow what is sampled and run, or only what is drawn? → A: It narrows what is sampled and run, and every figure the panel letters is computed inside the constrained region. A constraint is a re-cut rather than a filter, the rule the survey's extents already follow: designs already measured inside the new region are reused, designs measured outside it stay in the ledger and are listed as ruled out rather than deleted, and effects are lettered per the constrained span rather than per the full slider, with the region stated wherever a share is. Constraints belong to the desk rather than to a world, so matched designs and jumps still compare like with like. No constraint is ever demanded before exploring, because the research finds designers discover their criteria while exploring rather than before.
- Q: How should a designer state a constraint? → A: On the control itself, in the console strip and in the panel alike: bounds typed into the control's own face, the disallowed part of that face shaded out, and every active constraint summarised again at the head of the panel's sequence. Not by brushing a drawing, which measures poorly for discoverability and accuracy and is impractical under a thumb, and not by a brief filled in before exploring.
- Q: What should a designer be able to constrain? → A: A numeric control's range, pinning to one value being its degenerate case, and a door: which options of a choice, and whether a design element may be in or out, so a ruled-out world is never measured. Not rules relating two controls, which appear only in statistics tools and which this desk has few natural couplings for. Not a limit on a reading, because a reading exists only after its run, so such a limit could only filter completed runs and would be the filter this session already rejected.
- Q: When a constraint is committed, should the campaign start measuring the new region at once? → A: No. The commit takes effect immediately in what is drawn, re-lettering from the designs already measured inside the new region, and the runs for the rest of that region are queued only when the reader asks, with their count and time stated first. That is the consent pattern the annual cost and each island's Measure this world already use, and it lets a designer state several constraints before spending a run.
- Q: When the best designs pile against a constraint's edge, should the panel say the constraint is costing performance? → A: Yes, and it prices the relaxation only where it has measured it. That a constraint binds is read off the measured designs inside it, so it is always honest to say. What relaxing it would buy is lettered only from runs the ledger already holds outside the constraint; where it holds none, the panel offers to measure a small probe just outside with its cost stated first, and never extrapolates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole desk on one sheet (Priority: P1)

An architect has cut a ground along two controls and wonders what the rest of the desk is doing. They open the strategy plan, the panel that ground is drawn in, and choose a reading, the zone's summer high. The sheet begins measuring designs spread across every live control, a first scatter of dots standing within seconds and filling in as they look. Each dot is a building, shaded by its reading, placed along the two moves that decide it. Under each axis the move is spelled out as a recipe: *lower U-factor 55 %, higher SHGC 21 %, brighter ground 14 %*. Beside the plan, how much of the difference between buildings the drawing explains. They press a hot dot, and the desk becomes that building. Next week, with a weather file attached, they open the same plan for energy use intensity.

**Why this priority**: This is the component. Every other story reads it or acts on it.

**Independent Test**: Open the plan on any desk with any available reading chosen, confirm a scatter appears made only of completed runs, that both axes are lettered as recipes with shares, that the share explained is lettered, and that pressing a dot moves the desk to exactly that design.

**Acceptance Scenarios**:

1. **Given** a desk and any reading the run can answer, **When** the reader opens the plan, **Then** a first scatter of measured designs stands within seconds and keeps filling, every dot traceable to a completed run, with the count measured against the count wanted stated in place.
2. **Given** a plan with enough designs measured, **When** it is drawn, **Then** its two axes are that reading's two leading moves in the desk's current world, each lettered as a recipe naming its controls in design terms, with each control's share of the move.
3. **Given** any plan, **When** it is drawn, **Then** the share of the reading it explains is lettered beside it, measured on designs the moves were not derived from.
4. **Given** a dot, **When** the reader presses it, **Then** the desk moves to exactly that design through the same path any gesture uses, and every surface of the sheet follows.
5. **Given** a reading whose leading move alone explains nearly as much as two, **When** the plan is drawn, **Then** the sheet also offers the reading against that single move, with the trend marked as an estimate and the spread around it stated as the part the other controls decide.
6. **Given** a run that failed, **When** the plan is drawn, **Then** the failure is counted and listed with its reason, and never drawn as a dot or filled from a neighbour.
7. **Given** any plan, **When** it is drawn, **Then** the dots stand over a smoothed, shaded terrain stated in place as inference, with the share it explains lettered, the terrain left bare wherever the dots are too sparse to carry it, and no figure lettered off it; no contour lines, relief block or arrangement by resemblance is offered.
8. **Given** a reading the current run cannot answer (a year-long reading on a design-day desk, cost where the station has no tariff), **When** it is offered, **Then** it stands greyed with its reason and its fix, exactly as the study roster does.
9. **Given** a terrain for any reading, **When** it is drawn, **Then** its height is the reading itself, as on E-02's ground, the best designs stand in the low ground wherever less is better, and the terrain states in place which way is better for that reading.
10. **Given** the panel open, **When** the reader reads it, **Then** its parts stand as one numbered vertical sequence in this order, the reading, the plan and its moves, the worlds one door away, what pulls anywhere, the ground cut along two controls, and the four kinds; each part is headed by the question it answers, no part stands behind a tab, accordion or wizard step, and a part with nothing measured yet stands in its place saying what it waits on.
11. **Given** the plan's terrain and the survey's ground in one panel, **When** both are drawn, **Then** the ground keeps its contour lines and its relief block, the terrain carries neither, and the panel states once, where the two meet, that the ground is measured along two chosen controls and the terrain is inference along moves.

---

### User Story 2 - Jump to another world (Priority: P1)

Around the desk's own scatter stand smaller islands: the worlds one door away. One is labelled *Glazing built up from panes*; its designs sit mostly below the architect's, and beside it the jump is lettered with how far the summer high moved and on how many matched designs. Another reads *With blinds*. They press into the first. The desk switches to the layered glazing model, the plan redraws from inside the new world, and three controls the architect has never seen move anything (pane count, coating, cavity width) appear on its moves, while U-factor and SHGC are listed as dark in this world. New islands appear around it, the worlds one door away from here, and the *With blinds* island is now reachable where before it was not. The architect has found a part of the design space they did not know was there.

**Why this priority**: It is what the experience is about. Sliders refine a design; doors change what kind of design it is, and a reader who cannot see where the doors lead will never open them.

**Independent Test**: On the default desk, confirm every door reachable from the stance appears as a neighbouring world or is listed with the reason it cannot be entered, that each jump is measured on matched designs and lettered with its spread, and that pressing into a world moves the desk there and redraws the plan with that world's own live controls, moves and neighbours.

**Acceptance Scenarios**:

1. **Given** a desk in one world, **When** the plan is drawn, **Then** every world one door away is shown as its own island of measured designs on the same reading, labelled by the door that leads to it, or listed with the reason it cannot be entered from here.
2. **Given** a design element out of the path (Blinds, Skylights, Shading, Daylight or Context), **When** the plan is drawn, **Then** the world with it patched in stands as a neighbouring island, and a design element in the path offers the world without it, each measured like any other door.
3. **Given** a neighbouring world, **When** its jump is lettered, **Then** it is measured on matched designs (the same numeric settings run in both worlds), and states how much and in which direction the reading moved on how many of them.
4. **Given** a design on a neighbouring world's island, **When** the reader presses it, **Then** the desk moves into that world at exactly that design, and the plan redraws from inside it: its live controls, its moves, its share explained and its own neighbouring worlds.
5. **Given** a world where some controls come alive and others go dark, **When** the reader enters it, **Then** the controls that came alive and the controls that went dark are both stated, in words.
6. **Given** a world the engine cannot enter from here (Blinds while the glazing is a simple rating), **When** the plan is drawn, **Then** that world is listed with the model's own sentence, not drawn and not guessed.
7. **Given** a door that changes nothing for this reading on every matched design, **When** it is reported, **Then** it is stated as leading to the same reading, not drawn as a separate island.
8. **Given** islands on one plan, **When** they are drawn, **Then** no line, surface, trend or move joins one island to another, and a move measured in one world is never lettered on another.
9. **Given** worlds two or more doors away, **When** the reader wants to reach them, **Then** they get there by stepping world to world, and the plan never claims to have shown every combination.
10. **Given** System, Plant or Tariff, **When** the plan is drawn, **Then** they are not offered as doors, and the plan states that switching them changes what a reading means or what it costs rather than what the building is.
11. **Given** the archipelago, **When** it is drawn, **Then** the islands stand where the doors between them place them, the drawing states that their positions are schematic, and each door carries its jump in the reading's own units, so that two worlds that barely differ are not mistaken for far apart.

---

### User Story 3 - Read what pulls, everywhere (Priority: P1)

Before cutting a ground, the architect wants to know which controls are worth cutting along, not just here but anywhere in this world. They ask for the screening. The sheet takes the pull at many points across the design space and returns, for every control, how far it moves the reading anywhere, how consistently it pulls the same way, and how that compares with the pull at the stance. It returns the same for every door: how big its jump is and how consistently it points one way. Choosing two controls from the screening cuts the ground along them, a few centimetres further down the same panel.

**Why this priority**: It is the question the survey leaves open, "which two", answered at full dimension. It also supplies the measurements the moves and the four kinds of move are read from.

**Independent Test**: With a reading chosen, run the screening and confirm every live control and every door is reported with its effect, its consistency and its effect at the stance; confirm every control not screened is listed with its reason; confirm choosing two controls cuts the ground along them.

**Acceptance Scenarios**:

1. **Given** a chosen reading, **When** the screening completes, **Then** every live numeric control is reported with how far it moves the reading across its range, in the reading's own units, and how often its effect pointed the same way, as a share of the points measured.
2. **Given** a chosen reading, **When** the screening completes, **Then** every door is reported with its jump, taken on matched designs, and how often the jump pointed the same way.
3. **Given** the screening and the pull at the stance, **When** the reader reads them together, **Then** each control states whether it matters anywhere, only here, or nowhere for this reading, in words.
4. **Given** a control or door measured to move the reading by exactly nothing at every point, **When** it is reported, **Then** it is stated as reaching nothing for this reading, which is a different fact from a small effect.
5. **Given** controls that were not screened, **When** the screening is read, **Then** every one is listed with its reason, and the counts of screened and listed controls add up to every control on the desk.
6. **Given** the screening, **When** the reader chooses two numeric entries, **Then** the ground is cut along exactly those two in the same panel, without retyping anything and without leaving it.
7. **Given** designs already measured by studies, the pull or the survey, **When** the screening runs, **Then** those runs are reused and only the missing ones are run.
8. **Given** a control whose effect on the reading turns back inside its range, **When** the screening completes, **Then** the plan names its sweet spot for that reading, labelled as an estimate, with how consistently it held and how much worse the far end of the slider is; a best value too close to an end of the slider is not named as a sweet spot, and the plan says the reading keeps improving toward that end instead.
9. **Given** an island whose best designs lie at its rim, **When** it is drawn, **Then** the plan names the controls standing at their limit there, and implies no best region inside the island.

---

### User Story 4 - Decide with two readings (Priority: P1)

The architect cares about two outcomes together: summer comfort and winter comfort, or energy use and overheating hours. They choose both. Every control and every door is sorted into one of four kinds: moves that help both, moves that trade one for the other, levers that move one and leave the other alone, and controls that are free. Each classification carries its consistency. Each trade-off is stated as an exchange in both readings' own units, beside the lever that pays it back: *Lower U-factor: warmer winter nights, hotter summer afternoons. Pays back with: lower SHGC, which cools the summer and leaves the winter alone.* When they go back to the console, the U-factor strip now carries a small printed *trade-off*, the SHGC strip *lever: summer*, and the sill height strip is dimmed and marked *free*.

**Why this priority**: This is the "so what". A ranking of pulls is a fact about the model; four kinds of move with their compensators are decisions the architect can take, and printed on the strips they are taken where the hand is. Without this story the feature explains the design space without helping anyone design in it.

**Independent Test**: With two readings chosen, confirm every screened control and door carries one of the four kinds with its consistency, in the survey's moves panel and on each control's strip; that every trade-off states its exchange in both units and names a lever where one exists; and that no combined score of the two readings appears anywhere.

**Acceptance Scenarios**:

1. **Given** any two readings from the roster, **When** the screening completes for both, **Then** every screened control and every door is classified as helping both, trading one for the other, a lever on one, or free, stated in words and not by colour alone.
2. **Given** a classification, **When** it is lettered, **Then** its consistency is lettered with it, and a classification that held at fewer than all measured points states that it depends on the rest of the design.
3. **Given** a trade-off, **When** it is stated, **Then** the exchange is given in both readings' own units, and the levers on the losing reading are named beside it, each with what it moves and what it leaves alone.
4. **Given** a trade-off with no lever that pays it back on this desk, **When** it is stated, **Then** the sheet says so rather than naming a weak one.
5. **Given** two readings, **When** anything is ranked or compared, **Then** no single figure combining them is offered, because nobody publishes one.
6. **Given** the free controls, **When** they are listed, **Then** they are stated as free for these two readings, not as unimportant, because they may matter for a reading not chosen.
7. **Given** the moves panel, **When** the reader reads it, **Then** the moves are ordered from those usually settled earliest in a design to those settled latest, with that ordering marked as a convention of practice rather than a published rule.
8. **Given** a classification for two chosen readings, **When** the reader works the console, **Then** each classified control's strip carries a short printed tag naming its kind and the two readings it was judged against, the folded index row carries the same tag, and free controls are dimmed there but stay reachable and legible.
9. **Given** strip tags on the console, **When** the reader asks for the reason behind one, **Then** the tag leads to that control's entry in the moves panel, with its consistency and exchange, readable without hovering.
10. **Given** the desk enters another world or the readings change, **When** the console is read, **Then** every tag reflects the classification for the current world and readings, and a control with no classification yet carries no tag rather than a stale one.
11. **Given** a control with a named sweet spot for a chosen reading, **When** the console is read, **Then** its strip tag carries the sweet spot and the reading it is for, labelled as an estimate.

---

### User Story 5 - Send someone the plan (Priority: P2)

The architect sends the link. The engineer gets the same desk, the same world and the same reading, and once it has measured, the same dots at the same positions with the same readings, because the sample is decided by the link and the model is deterministic.

**Why this priority**: Reproducibility is non-negotiable on this sheet, and a plan the recipient cannot reproduce is a screenshot.

**Independent Test**: Open a plan, copy the link, open it in another browser and confirm the same designs and the same neighbouring worlds are sampled and every reading agrees exactly.

**Acceptance Scenarios**:

1. **Given** a plan open, **When** the link is copied, **Then** it carries the reading or readings and whatever decides which designs are sampled.
2. **Given** such a link, **When** it is opened elsewhere, **Then** the same designs and worlds are sampled and every reading agrees exactly with the original.
3. **Given** a link naming a reading or a sample the sheet cannot honour, **When** it is opened, **Then** the whole link is refused with the reason, never half loaded.
4. **Given** a link made before this feature, **When** it is opened, **Then** it reproduces exactly what it did before.

---

### User Story 6 - Read it with a thumb (Priority: P2)

On site, on a phone, every reading the plan carries (the recipe under each axis, the share explained, each world's jump, the four kinds of move and the strip tags) is readable at 390 px without hovering, and every dot and every island can be pressed with a thumb or reached from the keyboard.

**Why this priority**: A reading that cannot be read is not a reading, and the sheet is read on site as often as at a desk.

**Independent Test**: Drive the whole plan at 390 × 640 with a coarse pointer and no hover, including entering a neighbouring world and reading the strip tags on the folded index.

**Acceptance Scenarios**:

1. **Given** a 390 px viewport, **When** the plan is open, **Then** every figure and sentence it carries is readable without hovering, sideways scrolling or opening anything.
2. **Given** a coarse pointer, **When** the reader presses a dot, **Then** the nearest design is chosen, and the same designs and worlds are reachable from the keyboard as lists.
3. **Given** forced colours or monochrome, **When** the plan is read, **Then** neither shading nor island position is the only carrier of any reading or any world, and no strip tag relies on colour, because every design's reading, every world and every kind are available as text.
4. **Given** a window wider than the panel's base width, **When** the panel is drawn, **Then** the sheet reaches its own minimum before the panel takes any surplus, the panel grows no wider than its declared maximum, its numbered sequence stays one column, and a part lays its drawing beside that drawing's own readings only above the declared threshold.

---

### User Story 7 - Constrain the space before it is explored (Priority: P1)

The architect knows things about this project before any run: the plan cannot be wider than 30 m, the glazing will not be a simple rating, and blinds are not in the budget. They type the width's bounds on its own face, and the part of the slider they have ruled out is drawn as ruled out. They rule the blinds door out entirely. The panel re-letters at once from what it already measured inside those bounds, states what it would cost to measure the rest, and waits. When they ask for it, the sample is drawn inside the region, so the moves are fitted to the building they can actually build. Later, the best designs are all standing against the 30 m edge, and the panel says so: the constraint is binding, and on the runs already measured outside it, relaxing to 34 m was worth 1.4 K of summer high.

**Why this priority**: Without it the sample spreads over a space the designer has already ruled out, so the moves are fitted to buildings nobody will build and most of the run budget is spent proving it.

**Independent Test**: Set a range constraint on one control and rule out one door, confirm the panel re-letters from measured designs without queueing a run, that asking for the rest measures only inside the region, that the ruled-out world is never measured, and that every design drawn lies inside the constraint.

**Acceptance Scenarios**:

1. **Given** a numeric control, **When** the reader types bounds on its own face, **Then** the design space is re-cut to those bounds, the part of the face the constraint disallows is drawn as disallowed, and the constraint is stated both there and in the summary at the head of the panel's sequence.
2. **Given** a constraint just committed, **When** the panel redraws, **Then** every figure re-letters at once from the designs already measured inside the new region, no run is queued by the commit alone, and the runs that would fill the region are offered with their count and their time.
3. **Given** a door ruled out by a constraint, **When** the plan is drawn, **Then** the world behind it is never measured, and it is listed as ruled out by the reader rather than as a world the engine cannot enter.
4. **Given** designs measured before the constraint that fall outside it, **When** the panel is read, **Then** they stay in the ledger, are stated as ruled out, and are left out of every figure the panel letters.
5. **Given** a constrained control, **When** its effect is lettered, **Then** it is given per the constrained span, and the region it was measured in is stated wherever that figure stands.
6. **Given** the best measured designs standing at a constraint's edge, **When** the panel is read, **Then** it states that the constraint is binding, and prices relaxing it only from runs already measured outside it, offering to measure a probe where it holds none.
7. **Given** a plan with constraints, **When** its link is opened elsewhere, **Then** the same constraints, the same region and the same designs are sampled, and every reading agrees exactly.
8. **Given** a 390 px viewport and a coarse pointer, **When** the reader sets, reads or removes a constraint, **Then** every part of the gesture works without hovering and is reachable from the keyboard.

---

### Edge Cases

- **Choices that are not the building** (the solver's algorithms, the run's timestep and calendar). Not treated as doors and listed with that reason, by the register's existing rule that Solver and Run are not the building.
- **System, Plant and Tariff.** Not doors. Patching System in or out changes what a reading means rather than what the building is, and Plant and Tariff price the result without reaching the model; they stay as the reader set them, and the plan says so.
- **A world whose requirements the door breaks** (Blinds needs the layered glazing model). Listed with the model's own sentence; not drawn, not guessed. It becomes reachable from a world that meets the requirement, and is offered there.
- **A choice with many options.** Each option is its own neighbouring world, so a five-option choice adds up to four islands. The plan states how many worlds lie one door away and how many it has measured.
- **Two worlds that perform almost alike.** They still stand as two islands, because they are different buildings; the small jump lettered on the door between them is what says how little separates them, not the gap on the page.
- **A control that reaches nothing for this reading at every point** (the layered glazing controls while the desk is on simple glazing, the zone multiplier for a temperature). Listed as reaching nothing in this world for this reading, never shown as a small effect, and named as a control that may come alive in another world.
- **A reading that is a count against a threshold** (hours above 25 °C, the TM59 criteria). Measured and drawn like any other. A small move can flip an hour or a night, so the share explained may be lower and consistency may fall; both are lettered as they come out, and nothing is smoothed.
- **Cost and carbon.** They are the run's meters multiplied by a rate. When the tariff or the grid factor changes, a cost or carbon plan is re-lettered from the runs already in hand, with no new runs, by the rule that nothing a priced channel owns reaches the model.
- **The desk moves while the plan is measuring.** A slider gesture moves the stance mark and invalidates nothing. A door opened on the desk, by a choice or by the patch bay, is a jump into another world: the plan redraws from there and keeps every world it has already measured.
- **Strip tags on a crowded strip or a folded row at 390 px.** The tag is a short word, never a sentence; the reason lives in the moves panel. A tag that cannot fit is abbreviated by a declared short form, never truncated mid-word.
- **Two topographic drawings in one panel.** The plan's terrain and the survey's ground are both surfaces over a reading, and they follow opposite rules: the ground is measured along two chosen controls and carries contours and a relief block, the terrain is inference along moves and carries neither. Both keep their own convention, and the panel says once, where they meet, which is which and why.
- **The share explained is low, in the desk's world or on an island.** Drawn, and stated plainly. It is not hidden, and no second arrangement is substituted to look better.
- **A reading does not move across the design space.** Stated as flat. No plan is drawn out of nothing.
- **The zone's winter low, the one reading where more is better.** Its terrain keeps the same convention, height is the reading, so its best designs are the high ground; the terrain says so in place, and nothing is flipped to make it match the others.
- **A best value near an end of its slider.** Not a sweet spot. Measured on the annual evidence desk, the heating setpoint was best near 12 °C on a slider running 10 to 26 °C; a value that close to the end cannot be told apart from "push it to the limit", so the plan states the control is at its limit instead of naming a spot.
- **Two readings whose moves point the same way.** The plan says one plan serves both, rather than drawing two identical ones.
- **A run fails** (crossed setpoints, a window larger than its wall). Counted and listed with its reason, never drawn, never filled.
- **Every run fails.** The plan states that it measured nothing and why.
- **Auto-solve is off, or a link or station is attaching.** Nothing is measured; the plan says what it is waiting on.
- **A station change.** The plan, the screening, every visited world, every strip tag and their measurements come down with the studies and the sample cache.
- **An annual desk.** The plan measures at the run kind the desk is on and says which; it never drops to design days to go faster, and states how long the full sample will take. Neighbouring worlds multiply the cost, and the plan says so before it spends it.
- **A constraint that excludes the desk's own stance.** The stance mark stands outside the constrained region and says so. The region is not widened to take it back in, by the rule the survey's extents already keep: a reader who constrained past where they are standing has said so, and widening it silently would undo what they asked for.
- **A constraint narrower than its control's own step.** Refused whole, naming the step, because no position on that control's grid lies inside it and a region with no position in it cannot be sampled.
- **Every option of a door ruled out.** Refused whole, naming the door. A design space with no world in it is not a space.
- **A constraint on a control that is dark in the current world.** Kept, and stated as reaching nothing here, exactly as a dark control's effect is. It binds again wherever that control comes alive, so stepping into a world cannot quietly widen the region.
- **A design sampled that the desk cannot hold.** Impossible by construction: every sampled position is on each control's own step grid and every world is a setting the desk's own doors can hold.

## Requirements *(mandatory)*

### What the plan is of

- **FR-001**: The plan MUST be its own panel, opening on the left-hand side of the sheet as the Model Console stands on the right, and MUST hold the whole instrument: the reading chooser, the campaign controls (FR-012a) in its head, the plan drawing, the islands, the screening, the four kinds, and the E-02 survey itself, being its ground, its relief, its schedule of spot heights and its axis chooser. The survey MUST leave the sheet, so that one ground is drawn in one place; the panel MUST carry the E-02 title and the sheet MUST hold E-01 alone.
- **FR-001a**: The panel MUST present its parts as one vertical sequence, numbered, each part headed by the question it answers, and every part MUST be readable by scrolling alone. No part MUST stand behind a tab, an accordion, a wizard step or any other gate that shows one part at a time, and no reading, share explained, verdict, absence reason or refusal MUST sit in a fold. A part with nothing measured yet MUST stand in its place and state what it is waiting on.
- **FR-001b**: The panel's parts MUST run in this order: the reading chosen, the plan and its moves, the worlds one door away, what pulls anywhere, the ground cut along two controls, and the four kinds. The ground MUST stand directly below the screening that hands it its two axes, and each part's heading MUST state the question it answers so the sequence reads as one storyline.
- **FR-002**: A plan MUST be of one reading, chosen from the full roster the studies and the survey already offer (the zone's high and low temperature, peak heating and cooling load, TEDI, CEDI, energy use intensity, cost, carbon, hours above 25 °C, and TM59 criteria a, b and c), with each reading's existing availability rules and refusals.
- **FR-003**: Within the desk's current world, the plan MUST vary every numeric control that reaches the building, and MUST list every other control with its reason, so the varied and the listed add up to every control on the desk.
- **FR-004**: Every choice on a channel that is part of the building, and the in-or-out state of the Shading, Blinds, Skylights, Daylight and Context channels, MUST be treated as a door to neighbouring worlds. Choices on the Solver and Run channels, and the in-or-out state of System, Plant and Tariff, MUST NOT be, and MUST be listed with the reason.
- **FR-005**: Controls on priced channels MUST NOT be varied, because nothing they own reaches the building.
- **FR-006**: The plan MUST measure at the run kind the desk is on, and state which.

### Constraining the design space

- **FR-049**: A constraint MUST narrow what is sampled and run, not merely what is drawn. Every design generated after a constraint is set MUST lie inside the constrained region, and every figure the panel letters, the moves, the shares explained, the screening, the terrain and the sweet spots, MUST be computed from designs inside it.
- **FR-050**: Setting, changing or removing a constraint MUST be a re-cut rather than a filter: designs already measured that lie inside the new region MUST be reused without running again, and designs measured outside it MUST be kept in the ledger, stated as ruled out, and left out of the arithmetic. No constraint MUST be demanded before the reader explores, and a constraint MUST be settable, changeable and removable at any time.
- **FR-051**: Constraints MUST belong to the desk rather than to one world, so that matched designs and the jumps taken on them still compare like with like across every world, and MUST ride the link with whatever else decides the sample.
- **FR-055**: A constraint MUST be able to bind a numeric control's range, including pinning it to a single value, and a door, being which options of a choice and whether a design element may be in or out. A door ruled out MUST NOT be measured as a world at all. A constraint MUST NOT relate two controls to each other, and MUST NOT be stated as a limit on a reading, because a reading exists only once its run has completed and such a limit could only filter; both MUST be listed as out of scope with that reason where a reader would look for them.
- **FR-056**: Committing, changing or removing a constraint MUST take effect at once in what is drawn, re-lettering every figure from the designs already measured inside the new region, and MUST NOT by itself queue any run. The runs that would fill the new region MUST be queued only when the reader asks for them, with their count and the time they will take stated first, by the consent pattern the annual cost and each island's measure action already follow.
- **FR-057**: Where the best measured designs of a constrained region stand at a constraint's edge, the panel MUST state that the constraint is binding. What relaxing it would buy MUST be lettered only from completed runs outside the constraint that the ledger already holds; where there are none, the panel MUST offer to measure a probe just outside the constraint, with its cost stated first, and MUST NOT extrapolate, infer or estimate the figure from designs inside the region.
- **FR-053**: A constraint MUST be stated on the control it constrains, on that control's own face, in the console strip and in the panel alike, with its bounds typed rather than dragged, and the part of the face the constraint disallows MUST be drawn as disallowed. The gesture MUST be operable at 390 px with a coarse pointer and from the keyboard, and MUST NOT exist only on hover.
- **FR-054**: Every active constraint MUST also be stated together, at the head of the panel's sequence, each naming its control and its bounds, each removable there, and all removable at once. A constraint MUST therefore be readable in both places, beside its control and in that summary.
- **FR-052**: Where the design space is constrained, an effect MUST be lettered per the constrained span rather than per the control's full range, and the region a figure was measured in MUST be stated wherever that figure is lettered, so that two plans carrying the same words cannot carry different numbers.

### Measuring

- **FR-007**: Every design drawn MUST be one completed EnergyPlus run of a document built by the same applier the live desk uses, at positions on each control's own step grid and in a world the desk's own doors can hold.
- **FR-008**: Which designs and worlds are sampled MUST be decided by the link alone, never by chance, the clock or the machine, so that the same link samples the same designs everywhere.
- **FR-009**: Measurement MUST be progressive, the desk's own world legible first and its neighbouring worlds after, with measured against wanted stated in place for each.
- **FR-009a**: Opening the plan or stepping into a world MUST start, without being asked, only that world's own designs and screening and the jump to every world one door away, and only on a design-day desk. Each island's own screening MUST start only when the reader asks for that island, with its run count and time stated first, on every desk. On a weather year nothing MUST start until the reader asks, with the cost stated first (FR-006).
- **FR-010**: A jump MUST be measured on matched designs, each run with the same numeric settings in both worlds, and MUST NOT be computed as the difference between averages of different designs.
- **FR-011**: The plan and the screening MUST share the study pool, queue and sample cache with the studies, the pull and the survey, reusing any design already measured, and MUST NOT run on the live sheet's engine or delay its solves.
- **FR-011a**: The shared study pool MUST run as many engines side by side as the device's logical cores minus two (one core held for the page and one for the sheet's own engine), with no fixed cap, bounded only by a memory guard of half the device's memory at 256 MB per engine, where a browser that does not report its memory is assumed to have 4 GB, and never fewer than one engine. The width in force MUST be stated where the plan states its cost.
- **FR-012**: Measurement MUST pause during a gesture and resume on release, and MUST be gated by auto-solve and any pending attach, saying which it waits on.
- **FR-012a**: The plan's campaign MUST offer Pause, Resume and Cancel, always in view while it has runs queued. Pause MUST hold every run the campaign has queued, letting runs already on an engine finish and file their readings, and MUST say it is paused and how many runs wait. Resume MUST continue the same queue. Cancel MUST drop every run the campaign has queued, MUST keep every completed run in the ledger, and MUST NOT queue again until the reader asks or opens a door. None of the three MUST touch a study, the survey or the pull.
- **FR-013**: A failed run MUST be recorded with its reason, MUST NOT be retried indefinitely, and MUST NOT be drawn or filled from a neighbour.
- **FR-014**: Measurement MUST request no more output from a run than the chosen readings need.
- **FR-015**: A reading that is a run's meters multiplied by a rate (cost, carbon) MUST be re-lettered from the runs already measured when its rate changes, with no new runs.

### The plan drawing

- **FR-016**: The plan MUST place every measured design of the desk's world along the chosen reading's two leading moves in that world, found from how the reading changes as each control moves and not from how the designs' settings compare, and MUST letter each move as a recipe: its controls named as design moves in the direction that raises the axis, each with its share of the move.
- **FR-017**: The plan MUST letter the share of the reading it explains, measured on designs the moves were not derived from, wherever it is drawn, for every reading and every world, whatever the share turns out to be.
- **FR-018**: Where one move explains nearly as much as two, the plan MUST also offer the reading against that move alone, with any trend marked as an estimate.
- **FR-019**: The plan MUST draw its measured designs over a shaded terrain that is stated in place as inference, smoothed so that it shows no local rise or hollow the measured designs around it do not also support, drawn only where the measured designs are dense enough to carry it, carrying the share of the reading it explains, and never read for a figure. Its height MUST be the reading itself, the convention E-02's ground already uses, so the best designs lie in the low ground wherever less is better, and it MUST state in place which way is better for its reading. It MUST NOT draw contour lines or a relief block, and MUST NOT offer an arrangement of designs by resemblance of their settings.
- **FR-019a**: The survey's ground MUST keep its own conventions inside the panel, contour lines and relief block included, and MUST NOT be brought to the terrain's convention. Where the two drawings stand in one panel, the panel MUST state once, where they meet, why the ground carries contours and a relief and the terrain carries neither: the ground is measured along two chosen controls, the terrain is inference along moves.
- **FR-020**: Every design MUST be able to state its reading, its world, its position on the plan and the fact that it is a completed run; pressing it MUST move the desk to exactly that design, in that world, through the commit path any gesture uses.
- **FR-021**: The stance MUST be marked on the plan at all times and MUST move when the desk moves.
- **FR-022**: The drawing MUST follow the design system: graphite ink levels for a reading's magnitude, hairline work, the accent reserved for markup, and the cold and warm pair reserved for signed physical quantities.

### Worlds

- **FR-023**: Every world one door away from the desk's MUST be shown as its own island of measured designs on the same reading, labelled by the door that leads to it, or listed with the reason it cannot be entered. The islands MUST be laid out by the doors between them, with their positions stated in place as schematic, and no distance, direction or overlap between islands MUST be drawn or read as a difference in the reading.
- **FR-024**: Each neighbouring world MUST letter its jump: the direction and size of the change on matched designs, and on how many of them it held.
- **FR-025**: Entering a world MUST redraw the plan from inside it, with its own live controls, moves, share explained and neighbouring worlds, and MUST state which controls came alive and which went dark.
- **FR-026**: No line, surface, trend or move MUST join one world to another, and a move measured in one world MUST NOT be lettered on another.
- **FR-027**: The plan MUST state how many worlds lie one door away and how many it has measured, and MUST NOT claim to show combinations of doors it has not visited.
- **FR-028**: Worlds already measured this session MUST be kept as the reader steps between them, and MUST come down only with the sample cache.

### Reading what pulls

- **FR-029**: The screening MUST report, for every varied control and a chosen reading, how far it moves the reading across its range, in the reading's own units, and the share of screened points at which its effect pointed the same way; and for every door, its jump on matched designs and how often the jump pointed the same way.
- **FR-030**: The screening MUST set each control's effect anywhere against the pull at the stance, and state in words whether it matters anywhere, only here, or nowhere for this reading.
- **FR-031**: A control or door whose effect is exactly nothing at every point measured MUST be stated as reaching nothing for this reading, and every non-zero effect MUST be reported as real, because the engine is repeatable on one input.
- **FR-032**: Choosing two screened numeric controls MUST cut the survey's ground along them, in the panel the screening stands in, without retyping anything and without leaving the panel.
- **FR-032a**: Where a control's effect on a reading turns back inside its range, the plan MUST name the value at which the reading is best as that control's sweet spot, labelled as an estimate read from the measured designs, with the consistency it held and how much worse the far end of the slider is. A best value within a declared margin of either end of the slider MUST NOT be named as a sweet spot; the plan MUST state instead that the reading keeps improving toward that end.
- **FR-032b**: Where an island's best designs lie at the rim of what the sliders allow, the plan MUST name the controls standing at their limit there, and MUST NOT imply a best region inside the island.

### Deciding with two readings

- **FR-033**: For any two chosen readings from the roster, every varied control and every door MUST be classified as helping both, trading one for the other, a lever on one, or free, using each reading's declared improving direction, and MUST carry its consistency.
- **FR-034**: The threshold below which an effect counts as free MUST be stated in place in each reading's own units.
- **FR-035**: Every trade-off MUST state its exchange in both readings' units and MUST name the levers that pay it back where any exist, and say so where none do.
- **FR-036**: No figure combining two readings into one MUST be offered anywhere.
- **FR-037**: Where the moves are ordered by design stage, the ordering MUST be declared per channel with the convention-of-practice prefix the sheet already uses for conventions.
- **FR-038**: Each classified control MUST carry a short printed tag on its console strip and on its folded index row, naming its kind and the two readings it was judged against; free controls MUST be dimmed there, never hidden and never taken out of reach.
- **FR-039**: A strip tag MUST lead to that control's entry in the moves panel, where its consistency and exchange are readable without hovering, and MUST NOT be the only place a classification is stated.
- **FR-040**: Strip tags MUST always reflect the classification for the current world and readings; a control with no classification for them MUST carry no tag rather than a stale one.
- **FR-040a**: A control with a named sweet spot for a chosen reading MUST carry it on its strip tag with the reading it is for, labelled as an estimate, under the same freshness rule as the tag's kind.

### Honesty and refusals

- **FR-041**: Any condition preventing a plan, a world, a screening, a classification or a tag MUST be refused whole, with the reason in place and the fix named where one exists.
- **FR-042**: A reading with no measurement behind it MUST render as an em dash and stay out of every total.
- **FR-043**: The plan MUST state what it has not measured whenever it states what it has: the count of failed runs, the worlds not yet visited, and the controls and doors not varied with their reasons.
- **FR-044**: Declaration errors in the plan's own vocabulary MUST throw at load rather than degrade at run time.

### The link, layout and composition

- **FR-045**: The plan's reading or readings, and whatever decides its sample, MUST ride the link; measured values and strip tags MUST NOT, because they are re-measured. A link that cannot be honoured MUST be refused whole, and links made before this feature MUST reproduce exactly.
- **FR-046**: Every reading the plan letters, and every strip tag, MUST be readable at 390 px without hovering, sideways scrolling or opening anything, and every design and world MUST be reachable by a coarse pointer and from the keyboard.
- **FR-046a**: The plan's panel and the Model Console MUST be able to stand open together, either side of the sheet, wherever the window can carry the sheet and both. Where it cannot, opening one MUST fold the other to its head, which MUST still letter its reading and, for the plan, its campaign state and controls; the sheet MUST NOT be narrowed below its own minimum to make room. Below the index threshold (780 px wide or 600 px tall) the plan's panel MUST become its own page under the sheet, as the console does, and the threshold MUST be read from the stylesheet, not restated.
- **FR-046b**: The panel MUST grow from its base width to a declared maximum as the window allows, and the sheet MUST reach its own minimum before the panel takes any surplus. The numbered sequence MUST remain one column at every width; a part MAY lay its drawing and that drawing's own readings side by side above a declared threshold. The base width, the maximum and that threshold MUST each be declared once in the stylesheet and read back by script, never restated in a media query string.
- **FR-047**: A station change MUST take the plan, the screening, every visited world, every strip tag and their measurements down with the studies and the sample cache.
- **FR-048**: The general notes, the architecture notes, the design system (including the strip tag as a new component pattern) and the changelog MUST be updated in the same change that introduces the feature, and the general notes' storage key bumped where a step changes meaning.

### Key Entities

- **Strategy plan**: One reading's view of the design space from the desk's world: that world's sampled designs and two leading moves, its neighbouring worlds as islands, and the share explained for each.
- **Terrain**: The smoothed, shaded surface under one island's measured designs for one reading, its height the reading itself, with the share it explains, which way is better, and the areas left bare where designs are too sparse; inference, never a source of figures.
- **Door**: A choice on a building channel, or the in-or-out state of a design-element channel; each of its settings leads to a world.
- **World**: One setting of every door; its live controls, its dark controls, its moves.
- **Archipelago**: The layout of the desk's world and its neighbouring worlds, placed by the doors between them; schematic positions, with each door's jump lettered beside it.
- **Sampled design**: One completed run at one position of every varied control, in one world; restorable as a whole desk.
- **Jump**: For one door and one reading, the differences measured on matched designs run in both worlds, with their direction and consistency.
- **Move**: A combination of numeric controls in fixed proportions along which a reading changes within one world, with each control's share and its recipe wording.
- **Screening entry**: One control or door for one reading: its effect or jump, its consistency, its effect at the stance, and whether it matters anywhere, here or nowhere.
- **Classification**: One control or door for a pair of readings: its kind, its consistency, and for a trade-off, its exchange and its levers.
- **Sweet spot**: For one control and one reading, the estimated value at which the reading is best, its consistency, and how much worse the far end of the slider is; or the statement that the control is at its limit.
- **Strip tag**: A classification's short printed form on a control's strip and folded row, naming its kind and the readings it was judged against.
- **Not-varied entry**: One control or door the plan did not vary, with its reason.
- **Constraint**: A restriction the reader places on what the design space may contain, belonging to the desk rather than to a world, binding what is sampled and run, and carried by the link.
- **Binding constraint**: A constraint whose edge the best measured designs stand against, with what relaxing it would buy where runs outside it have been measured.
- **Constrained region**: The part of the design space every constraint admits; what the sample is drawn from, what every figure is computed inside, and what is stated wherever a figure is lettered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a design-day desk on a four-core machine, a first plan of at least 100 measured designs in the desk's world stands within 5 seconds of asking, and the full sample of that world completes within 30 seconds.
- **SC-002**: While the plan is measuring, a slider drag on E-01 re-solves at the same cadence it does with no plan open, within 10 percent.
- **SC-003**: Every dot on every plan and island traces to a completed run. Audited over at least 100 dots: zero exceptions.
- **SC-003a**: The terrain never shows a rise or hollow the measured designs do not support. Audited on every world and reading of the reference desk: every local best area of the terrain holds measured designs that are themselves better than the measured designs around them, and no terrain is drawn over an area below the declared density.
- **SC-003b**: The terrain and E-02's ground never disagree about which way is up: for every reading on the roster, both draw height as the reading, and every terrain states in place which way is better. Verified against the full roster.
- **SC-004**: On the reference desk (the free-running default desk, Denver Centennial design days), the plan explains at least 65 % of the zone's summer high and at least 50 % of its winter low, and in both cases more than the survey's two strongest single controls do.
- **SC-005**: On the reference desk with the zone's summer high and winter low chosen, the classification reproduces this document's measured result: SHGC and ground reflectance as levers on the summer high, U-factor as a trade-off, and east and west glazing as helping both; and the U-factor, SHGC and sill height strips carry the matching tags.
- **SC-005a**: On the annual evidence desk (System, Gains and Daylight in, the Golden NREL year), the plan names a sweet spot for SHGC on energy use intensity and for plan width and depth, each labelled as an estimate, and names no sweet spot for a control whose measured best value lies within the declared margin of an end of its slider. Every sweet spot on the sheet is labelled as an estimate: audited over every one named.
- **SC-006**: On the reference desk, every choice on a building channel and every design-element channel is accounted for as a neighbouring world or listed with its reason, and entering the layered glazing world states pane count, coating and cavity width as come alive and U-factor and SHGC as gone dark.
- **SC-007**: Every jump the plan letters is taken on matched designs. Audited over every neighbouring world on the reference desk: zero jumps computed from unmatched designs.
- **SC-007a**: Nothing on the archipelago letters or implies a difference in the reading from the distance, direction or overlap between islands, and every door carries its jump in the reading's own units. Audited over every world on the reference desk.
- **SC-008**: Before release, the plan is measured on at least two year-long readings from the roster with a weather file attached, one of them a count against a threshold (hours above 25 °C or a TM59 criterion), and the share explained for each is recorded in the architecture notes whatever it is.
- **SC-009**: Changing the tariff re-letters a cost plan with zero new engine runs.
- **SC-010**: The same link opened on a different machine and browser samples the same designs and worlds and returns identical readings at each.
- **SC-011**: Every control and door on the desk is accounted for, varied, treated as a world, or listed with a reason. Verified against the full declaration.
- **SC-012**: An architect new to the plan can, within 3 minutes and without assistance, name one move that helps both chosen readings, one trade-off and the lever that pays it back, enter one neighbouring world and say what came alive there, and find the same trade-off tagged on its strip in the console.
- **SC-013**: No strip tag is ever stale. Audited across ten world changes and ten reading changes: every tag matches the current classification, and no control carries a tag its classification does not support.
- **SC-014**: The whole plan, including entering a world and reading the strip tags on the folded index, is readable and operable at 390 × 640 with a coarse pointer and no hover, and every design and world is reachable from the keyboard.
- **SC-015**: The feature adds no new run-time dependency and no more than 60 KB of transfer to a cold visit.
- **SC-016**: With constraints set, every design measured and every design drawn lies inside the constrained region. Audited over at least 100 designs and every ruled-out door: zero exceptions.
- **SC-017**: Re-cutting to a narrower region runs nothing it already holds: for every design already measured that lies inside the new region, the solve counter does not move.
- **SC-018**: Every figure lettered under a constraint states the region it was measured in, and no effect lettered per a constrained span is presented in the same words as one lettered per a full range. Audited over every figure the panel letters.

## Assumptions

- **The plan is its own panel, and the survey is in it.** It opens on the left of the sheet as the Model Console stands on the right, because a campaign of thousands of runs and a world to step through are an instrument to work, not a figure to read. The ground it helps choose is inside it rather than across the page: the screening hands the survey its two axes and the ground is cut where the reader is standing. Its reach into the console is the strip tag, which puts a classification where the control is moved.
- **The moves are straight, and they live inside one world.** A move turns numeric controls in fixed proportions. Where a reading bends, the spread around the trend shows it, and the share explained measures it. A door cannot be part of a straight move, which is why it is a door rather than an axis. Curved maps are out of scope, because they cannot be lettered as recipes.
- **Neighbours, not combinations.** Showing worlds one door away keeps the run budget proportional to the number of doors rather than to the number of their combinations, and matches how a designer actually decides: one door at a time. Distant worlds are reached by walking.
- **Design elements are doors; System is not.** Patching in blinds, rooflights, an overhang, daylight controls or the neighbouring buildings changes what the building is. Patching System in or out changes what the readings mean, and a free-running temperature set beside a conditioned one is not a jump in the same quantity.
- **Screening is the pull, repeated.** It uses the pull's own step rule at points spread over the design space, so a control's effect at the stance and its effect anywhere are the same measurement taken in different places. A jump is the same idea for a door: one flip, on the same design.
- **"Anywhere" means every slider across its full range.** How much a control appears to matter depends on how far it is allowed to move, so a control with a wide slider can look more important than it is in a real project. The plan says it reads the full ranges, and the pull at the stance remains the local answer; the two are always shown together because they can disagree.
- **Samples are in the hundreds, not the thousands.** The reference measurements used 800 designs per desk and 20 screening points; at the design-day cadence across a pool of four that is roughly ten seconds per world. Each neighbouring world adds its matched designs, and an annual desk costs about fourteen times as much per run, so the plan states the cost of a world before spending it.
- **Design stage is a convention.** Which channels are usually settled early in a project is a claim about practice, declared per channel and marked as a convention, not a published rule.
- **The reference measurements were taken with the native engine.** On the default desk it agrees with the browser build to 4.7 × 10⁻¹⁰ relative on every figure in the output, so the figures stand for what the page will measure.
- **The model's validity rules are handled elsewhere.** Crossed setpoints and a framed window larger than its wall are being made refusals of the model itself in separate changes; until they land, those designs appear here as failed runs with the engine's reason.

## Out of scope

- Any search or optimisation, any ranking of designs or worlds into one score, and any claim of a best design.
- Arrangements of designs by resemblance of their settings, and curved or learned maps whose axes cannot be lettered as recipes.
- Contour lines or a relief block on a projection, and anything drawn between worlds.
- Enumerating combinations of doors beyond the worlds one door away from the desk.
- Treating System, Plant or Tariff as doors.
- More than two readings in one classification.
- Any reading of what is still in play given decisions already made. (Stating constraints and reading the design space inside them is now in scope, under Constraining the design space.)
- Persisting a plan or its visited worlds across sessions, or exporting a sample as a data file.
- Any change to how the model is built. This feature adds no channel, no control and no model object.
