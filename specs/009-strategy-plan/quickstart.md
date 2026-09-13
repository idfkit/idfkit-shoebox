# Quickstart: validating the strategy plan

There is no test runner. These gates are throwaway harnesses under `specs/009-strategy-plan/verify/`, run by hand, following the shape and the one-run-per-process rule of `specs/006-design-space-survey/verify/README.md`. Each prints its assertions and exits non-zero on the first failure. The contracts named below hold the detail; this page says what to run and what must come out.

## Prerequisites

```bash
npm install
npm run predev    # stages the engine, the schema bundle and the station index
```

Outside the browser, the schema comes from `localBundle()` in `@idfkit/schemas/node`, loaded as `load('26.1.0')`. Engine runs use `specs/006-design-space-survey/verify/engine.mjs`, one run per process.

**The reference desk** is the free-running default desk on Denver Centennial design days (the spec's own). **The annual evidence desk** is System, Gains and Daylight patched in, on the Golden NREL year.

## Gate 0: the pull's defect is fixed first

`pull.js` consults `control.idle(params)` where it called `control.inert?.()`. On the default desk with `infiltration: 0` and Air in the path, `infConstant` is listed with its reason rather than probed. This lands as its own pull request before this feature (research.md section 3).

## Gate 1: the design space accounts for every key (no engine)

`node verify/space-roles.mjs`

- Every key in `ALL_KEYS` has exactly one role (SC-011).
- At the default desk: 32 varied, 19 neighbours, and Blinds listed with its `requires.reason` (SC-006, first half).
- `DIMENSION_ORDER` matches the frozen copy exactly.

## Gate 2: designs are deterministic and on the grid (no engine)

`node verify/space-designs.mjs`

- `designAt` for indices 0 to 511 in two child processes gives byte-identical `params` (SC-010).
- Every varied value passes `refuses` and lies on its step grid (FR-007).
- For every neighbour at the default desk, `matched` pairs differ only in the door and its implications (SC-007).

## Gate 3: skipped probes could not have reached anything (no engine)

`node verify/skip-proof.mjs`

- For every probe `probesAt` skips at the first 16 bases of the reference desk and of the annual evidence desk, the probe's IDF is byte-identical to its base's IDF.
- Idempotence: three applications of any design are byte-identical, and the live desk is restored byte-exact after `buildSample` (constitution gate 2).

## Gate 4: the scheduler's design-list jobs (fake pool, no engine)

`node verify/scheduler-designs.mjs`, asserting every item in contracts/scheduler-designs.md.

## Gate 5: jumps are measured on matched designs (engine, about 25 minutes)

`node verify/jumps.mjs`

- For each of the 20 neighbours of the reference desk, 32 matched pairs are run, and the jump's median, spread and consistency are printed for the zone's high and low. These are the first measurements of jumps anywhere, and they are recorded in CLAUDE.md.
- Every lettered jump traces to pairs that `matched` produced (SC-007).
- Entering the layered glazing world states pane count, coating and cavity width as come alive, and U-factor and SHGC as gone dark (SC-006, second half).

## Gate 6: the plan explains what the evidence said it would (engine, about 40 minutes)

`node verify/reference-plan.mjs`

- The reference desk at full depth (16 bases, 512 designs): the share explained is at least 65 % for the zone's high and at least 50 % for its low, and more than the survey's two strongest single controls, scored the same way (SC-004). **If this fails at 16 bases, rerun at 32** (research.md section 7) before touching anything else.
- With the high and low chosen: SHGC and ground reflectance are levers on the high, U-factor is a trade-off, and east and west glazing are no-regret (SC-005).
- Every dot indexes a completed run, with zero exceptions over all of them (SC-003). The terrain audit holds at every local best, recomputed independently (SC-003a), and the height convention holds for all thirteen readings (SC-003b).

## Gate 7: year-long readings, before release (engine, several hours)

`node verify/annual-plan.mjs`

- The annual evidence desk: a sweet spot is named for SHGC on EUI and for plan width and depth, each labelled as an estimate, and none is named within 0.15 of an end (SC-005a).
- The share explained is recorded for EUI and for hours above 25 °C or one TM59 criterion, **whatever it is**, in CLAUDE.md (SC-008).

## Gate 8: the link (no engine)

`node verify/link-roundtrip.mjs` (extended), asserting contracts/permalink-key.md.

## Gate 9: drive the page

In a **foreground** tab (background tabs clamp timers to about 1 Hz):

1. On a four-core machine, open the plan on the reference desk: a first plan of at least 100 designs stands within 5 s, and the home world completes within 30 s (SC-001).
2. With the plan measuring, drag a slider on E-01: the solve cadence is within 10 % of the cadence with no plan open (SC-002).
3. Change the tariff with a cost plan open: the solve counter does not move (SC-009).
4. Copy the link, and open it in a different browser on a different machine: the same designs and worlds, and identical readings at each (SC-010).
5. Step into the layered glazing world by pressing one of its designs, then step back out: no design already measured runs again (the solve counter and the ledger size agree).
6. Ten world changes and ten reading changes: every strip tag matches the current classification, and none survives a change it should not (SC-013).
7. At 390 × 640 with a coarse pointer and no hover: enter a neighbouring world, read every tag on the folded index, and reach every design and island from the keyboard (SC-014). Repeat in forced colours.
8. Record the ledger's heap size with every island measured on the reference desk (research.md section 9).
9. Hand the page to someone who has not seen it. Within 3 minutes they name a no-regret move, a trade-off and its lever, enter one world and say what came alive there, and find the trade-off tagged on its strip (SC-012).

## Gate 11: the pool's width (no engine)

`node verify/pool-width.mjs`, asserting contracts/pool-width.md: the six rows of research.md section 17, never below one engine, never more than cores less two, never above 15, and `why` naming the binding term.

## Gate 12: holding the plan's jobs (fake pool, no engine)

`node verify/scheduler-hold.mjs`, asserting contracts/campaign.md: a held job dispatches nothing while a study beside it keeps its turns, runs in flight land, release continues in order, a job admitted held waits, a held-only queue is idle, and cancelling keeps the ledger.

## Gate 13: the panel and the campaign, driven

In a **foreground** tab:

1. The layouts of contracts/planner-panel.md at every width it names, each panel alone and both together, including the fold swap. Nothing crosses the sheet's edge, and no drawing is wider than its host.
2. The coverage line letters the width and why, and on this machine it matches `poolWidth` for the reported cores and memory.
3. On a design-day desk, open the plan: the solve counter rises by the home world and the jumps (about 1,632 runs at the default desk) and stops. No island's own screening runs until it is asked for (FR-009a).
4. Pause mid-campaign: the counter stops within the runs already in flight, and a study opened beside it keeps solving. Resume: it continues, and no design already measured runs again. Cancel: the counter stops, every measured dot stays drawn, and nothing more queues until Resume or a door.
5. Step 2 of gate 9 again, at this machine's full width: a slider drag on E-01 while the plan measures keeps its cadence within 10 % (SC-002).
6. With the console open and the panel folded to its rail at 1,440 px, press a strip tag: the panel unfolds and its entry takes focus.

## Gate 10: budget and the general notes

- `npm run build`, then measure `dist/` against `specs/006-design-space-survey/verify/baseline-size.txt` with the deploy script's brotli settings: the added transfer is under 61,440 bytes (SC-015).
- `NOTES` in `src/tour.js` gains the plan's step, `TALLY` is extended if the count passes nine, and the storage key moves from `shoebox-general-notes-v4` to `v5` (FR-048).
- CLAUDE.md gains an architecture section, `.interface-design/system.md` gains the strip tag and the archipelago patterns, and CHANGELOG.md gains one entry in house voice.

## Gate 14: constraints bind the sample (no engine)

`node verify/constraints.mjs`, asserting every item in contracts/constraints.md.

- Every refusal class throws naming what was wrong, and a region narrower than its control's step names the step.
- Over at least 100 designs and every ruled-out door: every design lies inside the region and every value is on the control's own step grid (SC-016).
- `designAt` under `Region.EMPTY` and under a narrowing region that still admits the value produce byte-identical `params`, so the cache identity is one string (SC-017).
- Generating a design, committing a constraint and generating it again returns the constrained value: the `VALUES` memo carries the region.
- A ruled-out door produces no `Neighbour` and one listed reason, distinct from a world the engine cannot enter.
- Two regions over one control letter the same words and different numbers, and no constrained figure is lettered without its region (SC-018).
- `cn` round-trips every entry shape; every refusal class is refused whole; `sv`, `sp` and `cn` together round-trip; a pre-feature corpus decodes byte-identically.

## Gate 15: a re-cut costs only what it has not measured (engine, about 10 minutes)

`node verify/recut.mjs` on the reference desk.

- Measure a region, narrow it, and confirm the solve count rises by exactly the designs the ledger did not already hold (SC-017). Record what share of a typical narrowing was already in hand, which nothing settles on paper (research.md section 27).
- Designs measured outside the new region stay in the ledger, are stated as ruled out, and are in no figure the panel letters.
- Widening back to the previous region runs nothing at all.

## Gate 16: the panel, its sequence and the survey inside it, driven

In a **foreground** tab, at 1,920, 1,624, 1,440, 1,180, 900, 780 and 390 px wide and at 1,280 by 600:

1. All six parts stand at every width, in the order FR-001b names, each headed by its question. A part with nothing measured says what it waits on rather than being absent (FR-001a).
2. The sequence is one column at every width. The ground and the relief stand side by side only above the declared container width, and nothing is wider than its host (FR-046b).
3. The sheet holds E-01 alone and reaches `--sheet-min` before the panel takes any surplus; the panel stops growing at `--planner-max`.
4. **The relief after a fold, an unfold and a resize**: it redraws at the host's real size, and never at 1 by 1. Fold the panel to its rail on a finished survey, unfold it, and confirm the relief is correct without a new sample landing (research.md section 21).
5. Pressing two controls in part 4 cuts the ground in part 5 and scrolls within the panel, not the sheet.
6. The sentence saying why the ground carries contours and the terrain does not stands where the two meet, in place and not on hover (FR-019a).
7. Setting, reading and removing a constraint at 390 px with a coarse pointer and from the keyboard, including the summary at the head of part 1 (FR-053, FR-054, US7 scenario 8).
8. A constraint commit re-letters at once and queues no run; asking for the rest states its count and time first (FR-056).
9. The general notes' storage key is `shoebox-general-notes-v7`, and the survey step opens the panel.
