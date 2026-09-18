# Contract: the reading roster after feature 013

This project exposes no HTTP API and no CLI. Its contracts are the module surfaces the rest
of the sheet draws from, and the invariants those modules throw on at load. This file states
the surface after Category I joins the roster, and the one call site whose argument changes.

`src/study.js`, `src/survey.js`, `src/schemes.js` and `src/tm59.js` are all **DOM-free and
network-free**, so a Node harness calls every function below directly. That property is what
makes the quickstart's checks the real checks rather than copies of them.

Field shapes and validation are in [data-model.md](../data-model.md); this file is the
surface and the throws.

---

## `src/study.js`

### `Quantity` — two fields added

```js
new Quantity({ …existing, criterion, category })
quantity.criterion   // → Criterion | null   (tm59.js's declaration, never a letter)
quantity.category    // → Category  | null   (tm59.js's declaration, never 'I')
```

Throws in the constructor, each naming the quantity:

| Condition | Message names |
|---|---|
| `criterion` is neither null nor a `Criterion` | the quantity id and what it was handed |
| `category` is neither null nor a `Category` | the quantity id and what it was handed |
| `category` set with no `criterion` | the quantity id — a category belongs to a criterion |
| `category` set where `criterion.byCategory` is false | both declarations, and that the method states one line for both categories |
| `category` null where `criterion.byCategory` is true | both declarations, and that the criterion is stated per category |

### `QUANTITIES` / `QUANTITY_BY_ID` — two entries added

```js
QUANTITY_BY_ID.tm59aI   // Criterion a · Category I
QUANTITY_BY_ID.tm59bI   // Criterion b · Category I
```

`tm59a`, `tm59b` and `tm59c` keep their ids, values, units, precisions and labels. The two
new entries reuse the `TM59_AB` and `TM59_B` `RunContents` instances by reference, so
`contentsFor` returns what it returned before for every desk.

### `TM59_STUDY_CATEGORY` — **removed**

Was `export const TM59_STUDY_CATEGORY = COUNT_CATEGORY`. Its only importer is
`src/survey.js`, which no longer needs it: a reading carries its own category.

### Load-time invariant added: the roster against the method (I1)

Throws unless, for every criterion the roster answers at all:

- `criterion.byCategory === true` → exactly one quantity per declared `Category`, and none
  for that criterion carrying `category: null`;
- `criterion.byCategory === false` → exactly one quantity, carrying `category: null`.

The message names the criterion, what the roster carries for it, and what the method states.
Criterion d is answered by no quantity and is not required to be — the invariant is over
what the roster claims to read, not over the whole method.

### Load-time invariant moved: the priced pairing count

```js
if (pairings !== 78 || refusedPairings !== 66) throw …
```

Six sweepable priced faces × thirteen quantities. Twelve draw, as before; the twelve new
pairings are all refused, because neither new quantity declares `movedBy`.

### Load-time invariant added: a target's metric against its category (I2)

Lives here rather than in `schemes.js`, which is where a reader would first look for it: this
module reads `PRESETS` from `schemes.js`, so `schemes.js` cannot read `QUANTITY_BY_ID` back
without closing a cycle. Both sides are in hand here instead, beside the assertion above that
already holds a metric to a declared reading.

Throws unless, for every `Target` whose `metric` names a declared quantity:

- the quantity declares a category → `target.category` is that same instance;
- the quantity declares none → `target.category` is `null`.

The message names the target, the quantity, and both categories, so it says which
declaration to edit.

---

## `src/survey.js`

### `Reading` — one field added

```js
reading.category    // → Category | null, taken off reading.quantity, never re-declared
```

### `READINGS` / `READING_BY_ID` — fifteen entries, two of them new

```js
READING_BY_ID.tm59aI
READING_BY_ID.tm59bI
```

The existing uniqueness assertion over series ids is unchanged and now covers fifteen.

### `SENSE` — two directions added

```js
tm59aI: { better: 'lower', why: … }
tm59bI: { better: 'lower', why: … }
```

Without these, `Reading.better` is null, `improves` throws, and the pull refuses the reading
outright (`pullReadingFor`, `src/pull.js:377-386`) — which is the visible symptom of a
missing direction and the reason the existing assertion over `SENSE` keys is kept.

### `Qualifier` — `reads` and `says` become functions of the reading

```js
new Qualifier({ field, reads: (reading) => …, says: (reading) => …, decidable })
qualifier.on(target, preset, reading)            // unchanged: the target's qualifier, or throws
qualifier.on(…) === qualifier.reads(reading)     // the match, at the one call site
```

`QUALIFIER_BY_METRIC` maps all four category-bearing reading ids to **one** shared
declaration, so a fifth cannot be registered at the wrong category by copying a line.

### Load-time invariant added: qualifier coverage (I3)

Throws unless, for every reading in `READINGS`, `reading.category !== null` exactly when
`QUALIFIER_BY_METRIC[reading.id]` exists and matches on the `category` field. The message
names the reading and which half is missing.

### Unchanged, and now covering more

`matchedTargets`, `thresholdsFor`, `Threshold`, `markSentence`, `latticeOf`, `fallStep`,
`refineOrder`, `freeExchange` and the `READINGS × targets` cross-product assertion take no
new argument and need no edit. They see two more readings because `READINGS` has two more
entries, which is the test of whether the category belongs on the reading.

---

## `src/schemes.js`

### `Target` — two declarations re-pointed, no field added

```js
{ id: 'tm59-a-I', metric: 'tm59aI', category: CATEGORY_BY_ID.I, … }
{ id: 'tm59-b-I', metric: 'tm59bI', category: CATEGORY_BY_ID.I, … }
```

`limit`, `unit`, `quantityKind`, `needs`, `asks` and `note` are untouched on all five TM59
targets.

### `targetsForMetric(metric)` — unchanged signature, unchanged caller

Still filtered on `Preset.kind === 'standard'`, still called as
`targetsForMetric(reading.id)` at its one call site (`src/survey.js:2083`). It now returns
each category's own targets for each category's own reading, which is the whole of the
routing change.

### I2, the invariant this re-pointing wants, is not here

It checks these two declarations against `QUANTITY_BY_ID`, so it lives in `src/study.js`
instead — see that module's section above — because `schemes.js` reads `PRESETS` at its own
foot and cannot read the roster back without closing a cycle.

---

## `src/main.js`

### The metric-to-criterion lookup is derived, not tabled

```js
// was: const TM59_CRITERION = Object.freeze({ tm59a: 'a', tm59b: 'b', tm59c: 'c' })
const criterionOf = (target) => QUANTITY_BY_ID[target.metric]?.criterion ?? null;
```

`carriesTm59`, `tm59Reading` and `targetReading` ask this instead of the table.
`tm59Reading` goes on matching the run's readings on criterion **and** category, unchanged
in behaviour: every row the board letters today it letters after the change, from the same
reading (SC-005).

---

## What no module gains

- No new export from `src/tm59.js`, and no change to any reader, category, criterion,
  clamp, coverage or absence in it.
- No new `Output:*`, no new `RunContents`, no new variable or meter request.
- No parameter, no control, no channel, no `shapeKey` contribution, and nothing in
  `PRICED_KEYS`.
- No link **key**. `sty` and `sv` carry two more legal values, under the grammars they
  already have.
