# Harnesses for 011-sweep-priced-controls

There is no test runner and no linter in this repository. These files are the
gate instead, following `specs/006-design-space-survey/verify/`.

They are **throwaway**: run by hand from the repository root with `node`, wired
into no npm script, imported by nothing in the page. None of them boots the
engine, so none needs `npm run predev`; driving the page does.

## The files

| File | Quickstart gate | What it asserts |
| --- | --- | --- |
| `kit.mjs` | shared | Shared. A meter basis, the station-less rate card, three desks, and the pricing `pricedReadings` does in `main.js`, through the real `computeBill`, `assume` and quantity readers. |
| `fake-pool.mjs` | shared | Shared. The real scheduler over a counting fake pool, keyed as `sampleIdentity` keys it (priced keys dropped). |
| `links-before.mjs` | 6 (baseline) | Run on `main` before any edit: decodes 12 links, including the one in issue #78, into `links-before.json`. |
| `reach.mjs` | 1 | All 66 priced pairings: `movedBy` and `refusesPairing` agree with the bill's arithmetic at each face's stops on three plants; 54 refused, 12 drawn; the weather-file reason comes before the pairing's; three patched copies of `src/` throw at load. |
| `priced-scheduler.mjs` | 2 | A priced study costs one run, zero on re-enqueue, `curveFor(job).runs === 1`; a shaping study costs one run per position; 1,170 priced figures over 6 faces × 3 desks equal the bill. |
| `priced-survey.mjs` | 3 | A priced ground costs its shaping axis (the coarse axis is 7 positions, not 6, because the stance's own U-factor is forced in, so the gate asserts runs equal to the axis's own count); two priced axes cost one run; a refused pairing throws; every spot equals the bill; an `Absent` rate turns spots into gaps with its reason and back with no run. |
| `link-roundtrip.mjs` | 6 | Priced `sty` and `sv` round-trip; a refused `sv` pairing is refused whole; a refused `sty` pairing decodes; every link in `links-before.json` decodes identically. |

```bash
for f in reach priced-scheduler priced-survey link-roundtrip; do
  node specs/011-sweep-priced-controls/verify/$f.mjs || break
done
```

## Page checks

Recorded as they were taken.

### T002: E-02 on `main` when the tariff turns (research R6)

Taken 2026-09-14 on `main` at 2fde992, from a detached worktree served on its
own port, carrying none of this feature's edits. Link:
`#v1&uFactor=0.96&rateBasis=Assumed&sizingPeriods=No&in=gains&in=system&stn=725090&sv=uFactor*wwrS*cost`
(Boston-Logan, Tariff Assumed, ground of U-factor by south glazing read for
cost, densified to 11 × 12, 133 runs).

The tab was hidden, which starves `requestAnimationFrame` (CLAUDE.md), so the
page's rAF was replaced with a 16 ms timer before the ground measured; the spot
schedule then tracked coverage row for row, so E-02 was painting.

Gas price moved from 0.070 to 0.250 /kWh through the Tariff face's own commit:

| | Before | After |
| --- | --- | --- |
| Bill, gas line | $192 | $687 |
| Bill, electricity line | $2,204 | $2,204 |
| E-02 spot schedule, first three rows | $2,389 each | $2,389 each |
| E-02 standing spot line | Cost $2,397 | Cost $2,397 |
| Run counter | 133 | 133 |

**Confirmed.** The bill re-priced and no spot height did: E-02 kept lettering
the ground at the old gas price. T048 records a Fixed entry.

### Pages driven on this branch

All on `npm run dev` (port 5191), Boston-Logan, an annual run, System and Gains
in. The tab was hidden throughout, so every check below replaced
`requestAnimationFrame` with a 16 ms timer first, as for T002. Figures in the
bill are read off `#bill-meters`; the sheet letters IP.

**T015, T017 (US1).** `sty=carbon.heatEfficiency` on a gas boiler at 0.85. The
card drew 22 positions and the run counter read 2 (the sheet's solve and the
study's one run). The curve's aria description letters carbon from 6,098.3 to
6,592.3 kgCO₂e; the bill with the slider at 1.05, 0.85 and 0.50 letters gas
carbon 449, 555 and 943 kg over 5,649 kg of electricity, which is 6,098, 6,204
and 6,592. Walking the slider across all three moved no counter and left the
card fresh. Pressing Study on Cooling COP letters, after "Study drawn", "21 positions,
priced from 1 annual run, across cooling cop." with the counter still at 2.
Moving U-factor marked both cards stale; they re-drew fresh and the counter
went to 4: the sheet's solve and one run shared by both priced studies. Station
change, Set aside, Clear and Revert all take no priced branch in code
(`clearAll`, `cancelWhere`, `clearAllStudies` act on every job and card), and
the head's count comes off the console's cards, which include priced ones; not
exercised separately on the page. The landmarks are the face's own marks, which
share the card's x axis, so FR-016 holds by construction.

**T023 (US2).** With the card open, choosing demand stands it refused with
"Seasonal efficiency is applied after the run and cannot move heating + cooling
demand. Choose energy use intensity, cost or carbon." and draws nothing; peak
heating load the same; cost draws $3,783 to $3,928 and carbon comes back, with
the counter unmoved throughout. Switching the plant to Heat pump stands the card
refused with the withdrawn sentence, letters the same sentence under the dimmed
row at full ink (opacity 1, redline, sibling of the row), disables Study with it
as title and accessible name; back to Gas boiler redraws the curve with no run.
A gas price study on Direct electric draws flat at $2,616 (US2 scenario 3).
Tariff to Published stands that card refused with its sentence and letters both
price faces' sentences in view; back to Assumed redraws it with no run. System
patched out disabled the Plant offers with the generic "patch it in" title;
changed so a priced channel's offers carry its own requirement sentence, which
the strip already letters in view.

**T032 (US3).** `sv=uFactor*heatEfficiency*cost`, Tariff Assumed: the ground
densified to 11 × 12 and letters "132 of 132 positions measured from 11 runs";
the counter read 12 (the sheet and 11 U-factor positions), the Runs stamp 11
with "Priced at 132 positions", and the lede ends "priced at its position."
With the Reading chooser open on this ground, every non-bill reading is greyed
with the pairing sentence and its fix; Seasonal COP and Grid intensity are
greyed as axes with their withdrawn sentences. Standing on (0.17, 0.94) moved
efficiency to 0.94 with no run and the bill letters $2,204 + $174 = $2,378,
the spot's own figure; it added no traverse stop. Standing on (0.27, 0.94)
added the second stop and one run. Before a fix in `standOn`, that shaping step
added no stop either, because the gesture's release is axis Y's commit and
`commit` records only on a shaping key's release. Restoring the first stop put
efficiency back to 0.85 and U-factor to 0.96.

**T036 (US4).** Same ground plus the efficiency study, read for cost. At gas
0.070 the spot and the bill agree at efficiency 0.50, 0.85 and 1.05 ($2,531,
$2,397 against $2,396 lettered by line, $2,360); after gas to 0.200, $3,138,
$2,754 against $2,753, $2,649, and the study card's range moved from $2,360 to
$2,531 to $2,649 to $3,138. The counter stayed at 12 and no card went stale.
Compare T002, where the same move left every spot height standing. Switching
the plant to Heat pump stood the ground refused with the withdrawn sentence,
hid the drawing, kept "132 of 132 positions measured from 11 runs", and
refused Let it fall with the same sentence; back to Gas boiler redrew it with
no run. SC-005: 20 synchronous input events of the gas price with that ground
and two priced studies open took 12.1 ms median, 22.2 ms worst, and 17.3 ms for
the release, with zero runs; no performance panel was opened.

**T039 (US5).** `sty=demand.heatEfficiency,wallR` opened: the efficiency card
stands refused with the pairing sentence and the wall resistance study draws.
`sv=uFactor*heatEfficiency*tedi` is refused whole: the status line says the link
could not be read, quotes "Seasonal efficiency is applied after the run and
cannot move heating + cooling demand.", and leaves the sheet at its defaults. The issue #78 link decodes
identically to `main` in `link-roundtrip.mjs`; it was not re-measured on the
page, since its 121 runs are the same shaped ground as before.

**T047 (Principle VII).** Chrome would not size the window below 500 px, so the
check was at 500 px, not 390, with the model console open on a heat pump desk:
the withdrawn sentence stands in view under the dimmed Seasonal efficiency row
in the dashed box, 438 px wide, and the page does not scroll sideways
(`scrollWidth` 500). The pairing sentence stands in view on the study card and
in the chooser's option text. No sentence depends on hover. Not checked with a
coarse pointer.

**T049 (gate 8, SC-007).** `npm run build` passed (the existing chunk-size
warning only) and the build was served with `vite preview`. From the issue #78
link, scripted rather than read by a person: open the console, press Study on
Seasonal efficiency. The desk's opening reading is demand, so the card stands
refused with the pairing sentence and "Choose energy use intensity, cost or
carbon."; choosing carbon on the card draws 6,438.9 to 6,696.2 kgCO₂e; choosing
Seasonal efficiency as Axis Y re-cuts the ground as U-factor × Seasonal
efficiency read for carbon. 8.7 s of scripted gestures, including fixed waits.
**SC-007 as written (a reader, unassisted, under a minute) was not measured**:
nobody but the script took the path.

**Withdrawn ground survives a shaping drag (code review finding, fixed after
T049).** `sv=uFactor*heatEfficiency*carbon`, measured to 132 positions from 11
runs, counter 12. Heat pump: refused in place, points kept. Width dragged from
50 to 60 ft: still refused, still 132 of 132, counter 13 (the sheet's solve
only, no re-cut). Back to Gas boiler: the ground re-cut for the 60 ft desk,
counter 24 (11 runs), and the stance spot letters 7,357.7 kgCO₂e against the
bill's 7,358 kg. Before the fix the drag closed the survey and the switch back
brought nothing back.

**After `/simplify` (the next day).** Re-driven on the same ground and studies:
the withdrawn line and the Study button's accessible name follow the plant; a
gas drag left the survey chooser's DOM in place (it no longer rebuilds per
frame); a grid intensity drag over a cost ground left every spot unchanged;
priced-only steps added no stop and a shaping step added one. SC-005 was
re-timed as an A/B against a tree carrying the pre-simplify source, the same
day and link: medians per input event of 29 to 44 ms against 34 to 50 ms before,
so no regression. Both are slower than the 12 ms measured the day before, which
is the machine, not the code.
