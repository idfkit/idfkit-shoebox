# Contract: the units toggle

What the reader meets. The visual form is settled through `/interface-design:init` and recorded in `.interface-design/system.md` (workflow gate 8); this contract fixes behaviour, structure and copy.

## Placement

A two-segment selector in the header's stamp — the block that states what the page *is*: engine, runtime, toolkit, simulation server — as a fifth row of it. Not in the console, not in a channel strip, not in the desk header: the desk is closed most of the time and FR-001 needs the toggle reachable from every state the sheet can be in, including before the engine loads and after a refused link. The stamp satisfies that as well as the control row did, being static markup at the head of the sheet.

**It began in the field's control row and was moved** (R7 records the original reasoning, which held except on weight). There it stood at the scale of the two buttons that start runs, which reads far louder than a mode set once and then forgotten; the stamp is the quietest block the sheet has, and every other row in it is the same kind of statement — a fact about the page rather than a reading off the run. Which system the figures are lettered in is exactly that. The restraint is scale, not contrast: the active segment keeps its solid `--ink` fill, because that is the carrier that is not colour.

It is static markup, so it works when `main.js` never finishes booting, the arrangement `report-sheet.js` already relies on.

## Form

The design system's segmented selector (`.interface-design/system.md:185-190`): two segments on one hairline rule, the active one solid `--ink` on `--vellum`. Not the square marker, which "means a step that is armed" and is reserved for armed states (`:421-426`); a unit system is a mode, not an arming.

```text
Units  [ SI | IP ]
```

- `role="radiogroup"` with two `role="radio"` segments, or two radio inputs with the labels as segments. Arrow keys move between them, Space or Enter selects, and the active segment is announced with its name.
- No new hue. The active segment is carried by fill and by `aria-checked`, never by colour alone.

## Copy

| Where | Text | Budget |
| --- | --- | --- |
| Label | `Units` | fits `SUMMARY` |
| Segments | `SI`, `IP` | |
| Standing line, under the segments | `Every number reads in the system you pick. The model stays in SI.` | 13 words, within `STANDING` |
| When storage refuses | `This browser will not remember the choice.` | 7 words, within `STANDING` |

The first draft of the standing line read `Every number on the sheet reads in the
system you pick. The model stays in SI.` — **sixteen** words, not the fourteen
this contract claimed, and `copy.js` threw the page at load rather than let it
through. A line printed on the sheet can leave out "on the sheet".

The standing line is the naming prose the design system requires for a control a reader has never met (`:475-492`), in place and never on hover, and it is duplicated onto the group's `aria-label`. Nothing about the toggle is explained only on hover.

## What pressing it does

1. Sets the system and writes `shoebox-units-v1`.
2. Re-letters every face through `api.sync()` (`src/console.js:2262-2265`), then replays the render of the last landed outcome.
3. Announces the change in a `role="status"` element **of its own**, not in the
   page's `#status` line. That line carries no `role` and the page has no live
   region at all; `markStale` writes to it on every drag transition, so making
   it live would speak a stale note each time a slider settled.

And what it must not do: start a run, queue a solve, interrupt one in flight, mark a reading stale, move a control, touch `params`, change the link, or rebuild a host that holds a focused margin box (`show()` already returns early while focused, `src/field.js`).

## States

| State | What the reader sees |
| --- | --- |
| First visit, browser region `US` | IP selected |
| First visit, any other or no region | SI selected |
| Returning reader | Their stored choice, whatever the region says |
| Opening someone else's link | Their own choice; the link carries no system |
| Storage refused | The switch works, and the line above says it will not be remembered |
| Run in flight | Figures re-letter and stay dimmed; the run lands in the system now showing |
| Study or survey running | Samples re-letter in place; nothing is re-run; no sample is dropped |
| Engine failed to load | The toggle still works, since it letters from declarations, not from a run |

## At 390 px

The selector sits in the header stamp, which is one column of the `.head` grid and becomes a full-width block below 780px. Both segments keep their full labels. No figure on any strip is clipped by the longer IP strings, which is what the quickstart measures rather than assumes.

**Measured at 390 px**, in a viewport that genuinely narrows rather than a window that reports it: `innerWidth` 390 with the 780px media query firing, `scrollWidth` equal to `clientWidth` so nothing scrolls sideways, and the stamp, the units row, both segment labels and the standing line all unclipped. By keyboard alone, focus on SI then ArrowRight checks IP, moves the roving tabindex to `si:-1 / ip:0`, carries focus with it, and announces "IP. Every figure on the sheet re-lettered."
