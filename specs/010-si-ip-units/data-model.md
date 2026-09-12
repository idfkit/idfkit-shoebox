# Data Model: SI and IP Units

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

One new module holds three things: what a quantity is, which system is showing, and how a value becomes a string. Everything else in this feature is an existing declaration gaining one field. No value is stored in IP, and nothing here reaches `params`, the link or the IDF.

## `src/units.js`

### `Kind`

A quantity kind: what a figure measures, and therefore how it converts and how precisely it reads. Frozen; the roster is frozen.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | Unique across the roster, asserted at load. Named for the quantity (`length`, `temperature`, `temperatureDifference`), never for a unit. |
| `si` | string | The SI unit string, exactly as the declarations letter it today (`m`, `W/m²K`, `m²K/W`). |
| `ip` | string | The IP unit string. Whitespace-free, so `copy.js`'s word count is unchanged (research R6). |
| `factor` | number | IP per SI, an exact expression of the three constants, never a decimal literal. `1` for an identity kind. |
| `offset` | number | Added after scaling. Non-zero only for `temperature` (32). |
| `digits` | number | The IP precision for a figure with no step behind it (a reading). A control derives its own, below. |
| `prefix` | string or null | Lettered before the figure instead of a unit after it. `'R-'` on `resistance`, null everywhere else. |

An **identity kind** has `factor: 1`, `offset: 0` and `si === ip`. Ratios, `ACH`, `°`, `pp`, `days`, `×`, `× floor`, a single appliance's `W`, money per kWh and test pressure in `Pa` are all identity kinds. They are declared rather than left blank so that `assertKinds` can tell "this quantity does not convert" from "nobody said".

### `System`

`'si'` or `'ip'`. One module-level value, read through `system()` and changed through `setSystem(next)`, which notifies the page's one re-letter path (research R9). It is never passed into `model.js`, `permalink.js` or any applier; those modules do not import `units.js`.

### Lettering

| Function | Contract |
| --- | --- |
| `convert(kind, value)` | The number in the system showing. `value * factor + offset` in IP, `value` in SI. Pure. |
| `letter(kind, value, digits)` | The string: the converted number fixed to `digits`, with `prefix` before it or the system's unit after it. Never rounds a value that reaches the model. |
| `precisionFor(kind, step)` | The IP precision a control gets: `floor(-log10(step * factor))`, so one converted step is never finer than one lettered increment. This is what makes a round IP figure reachable. |
| `parseIn(kind, text)` | The inverse for typed text: strips either system's unit or the `R-` prefix, and returns the SI number. Refuses anything else by returning null, as `readQuantity` does today. |

### Invariants, both thrown at module load

| Assertion | Rule | Why |
| --- | --- | --- |
| `assertKinds()` | Unique ids; every kind has both unit strings, a finite non-zero factor and a precision; an identity kind has equal strings; no IP string contains whitespace. | A declaration naming a kind that does not exist fails where it is written, not when a reader drags it. |
| `assertReachable(control)` | For every `Ruled` control whose kind is not the identity, `step * factor` must be no larger than `10 ** -precisionFor(kind, step)`. | A control whose grid cannot produce a round IP figure is a foot the reader cannot stand on. Same arithmetic, and the same reason, as `readLandmarks`' third rule (`src/controls.js:284-290`). |

## Declarations that gain a `kind`

Each already carries a `unit` string and a `digits` count; the kind joins them, and the formatter beside it asks `units.js` instead of composing the string itself.

| Declaration | Where | What it letters | Note |
| --- | --- | --- | --- |
| `Ruled` (and `Scale`, `Facade`) | `src/controls.js:316-336` | Every control face, margin box, scale end and landmark band edge | The root: `formatValue` and `field.js` both reach it. Its IP precision is `precisionFor(kind, step)`, not the kind's own. |
| `Quantity` | `src/study.js:216-274` | Study cards, the console's series, the survey's readings through it | Already validates `unit` and `digits` in its constructor; the kind is validated beside them. |
| `Reading` | `src/survey.js:158-205` | The survey, the relief and the plan drawings | `Reading.format` is the dispatch point; four sites in `main.js` that bypass it are fixed (research R2). |
| `Target` | `src/schemes.js:155-224` | The scoreboard's targets and margins | `Spec.why` keeps its published arithmetic unconverted (FR-010). |
| `Criterion` | `src/tm59.js:365-385` | The overheating criteria | Its own units are dimensionless counts, so identity kinds; the temperatures it is judged on come through other kinds. |
| `Instant` | `src/readings.js:279-305` | The balance rail and the strip meters | Today the unit is baked into each `letter` closure; the closure becomes a kind, and `watts()` takes one. |
| `BillColumn` | `src/main.js:1363-1384` | The bill's columns | The build-up literals in the same card (`:1644-1826`) are converted with it. |
| `SCHEDULE_ROWS` | `src/main.js:1220-1246` | The schedules table | |
| `SHELF_COLUMNS` | `src/main.js:6071-6081` | The kept-scheme shelf | |

Sites with no declaration behind them (the quantities panel, the derived readings, the plate chart, the station picker, about forty in all) gain one as they are converted.

## Controls whose step changes

Eleven, listed with their measurements in research R4. Only `step` changes: no default moves, no range narrows, no key is renamed, and each new step divides the old one exactly, so every value an existing link carries is still a stop on the grid. `LINK_VERSION` stays `v1` and `MIGRATIONS` stays empty.

## The remembered choice

| Field | Rule |
| --- | --- |
| Key | `shoebox-units-v1`, alongside `shoebox-drawn-by-v1` and `shoebox.schemes.v1`. |
| Value | `'si'` or `'ip'`. Anything else is treated as absent. |
| Written | Only when the reader presses the toggle. |
| Read | Once at boot, through the real-write probe `main.js` already uses (`src/main.js:4383-4392`). |
| Absent | The first-visit default: IP when `navigator.language` carries the region `US`, SI otherwise, including when it carries no region. |
| Refused | The switch works for the session and the sheet says it will not be remembered (FR-015). |

Not stored: anything else. The system never joins the link, the IDF, the run bundle or a scheme.

## What a switch does, and does not

| Changes | Does not change |
| --- | --- |
| Every lettered figure, unit string and axis label | Any value on `params` |
| Which stops a slider's lettering names | Where a slider stands, or its SI grid |
| The description's unit words | What the description says it measured |
| The report's stated system | The IDF, the run bundle, or any result |
| The scoreboard's lettered targets and margins | Any verdict, pass or fail |
