# Data model: TM59 Category I as a reading

Entities here are declarations, not records. Nothing is stored, nothing is persisted, and
every one of these is frozen at construction. The reference for the existing shapes is the
source; this file states only what changes and what is added.

---

## Existing entities this feature consumes unchanged

| Entity | Where | What this feature uses it for |
|---|---|---|
| `Category` | `src/tm59.js:143` | The comfort line's offset `k`, the published clamps `low`/`high`, `nightLimit`, `presumes`, `label`. Both instances already exist and are asserted against the published clamps at load. |
| `Criterion` | `src/tm59.js` (`CRITERIA`) | `id`, `label`, `unit`, `limit`, and **`byCategory`** — the declaration that says whether a criterion is stated per category. This is the fact the roster is asserted against. |
| `Reading` (TM59's) | `src/tm59.js:563` | What `readCriterionA` / `readCriterionB` / `readCriterionC` return: a value or an absence with its reason, never both. Unchanged. |
| `RunContents` | `src/study.js` | `TM59_AB` and `TM59_B`, reused by reference so the new quantities ask for exactly what the existing ones ask for. |

---

## `Quantity` (`src/study.js`) — one field added

```js
new Quantity({ id, label, unit, quantityKind, digits, needs, context, read, category })
```

**Added fields** — two, and they are one statement: which criterion this reading answers,
and which of that criterion's categories it answers it at.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `criterion` | `Criterion` \| `null` | `null` | Which of `tm59.js`'s declared criteria this reading answers, or null for every reading that answers none — which is every reading on the roster except five. |
| `category` | `Category` \| `null` | `null` | Which of TM59's declared categories it is read at, or null where the criterion is not stated by category. |

**Validation, in the constructor, beside the existing `quantityKind` and `digits` checks**

- `criterion` must be `null` or an instance of `tm59.js`'s `Criterion`; `category` must be
  `null` or an instance of `Category`. A bare `'I'` is refused: a truthy string standing in
  for a category nobody declared is the same hazard `Target` already refuses in its own
  constructor (`src/schemes.js:221`).
- The two must agree with the method: `category` is non-null **if and only if**
  `criterion.byCategory` is true, and a `category` with no `criterion` is refused outright.
  This is I1 stated per declaration; I1 proper is the roster-wide half of it.
- Frozen with the rest of the instance.

**Why `criterion` and not just a category**: without it, nothing can state the invariant
this feature exists for. "Every criterion stated by category is on the roster at both
categories" is a sentence about criteria, and a roster of ids cannot be asked which
criterion an id answers without parsing its name — which is exactly the string operation
`TM59_CRITERION`'s own comment rejects (`src/main.js:5169`).

**Why on `Quantity` and not on the survey's `Reading`**: the study card reads a curve at a
category too, and the pull ranks against one. A field on the survey's wrapper would be a
fact the study path could not see.

---

## Roster entries added (`QUANTITIES`, `src/study.js`)

Two, declared beside the two they pair with, so a reader sees all four together.

| `id` | `label` | `criterion` | `category` | `needs` | `context` | `read` |
|---|---|---|---|---|---|---|
| `tm59aI` | `Criterion a · Category I` | `CRITERION_BY_ID.a` | `CATEGORY_BY_ID.I` | `TM59_AB` | `{ trm, floor }` | `readCriterionA(eso, trm, CATEGORY_BY_ID.I, floor)` |
| `tm59bI` | `Criterion b · Category I` | `CRITERION_BY_ID.b` | `CATEGORY_BY_ID.I` | `TM59_B` | — | `readCriterionB(eso, CATEGORY_BY_ID.I)` |

`unit`, `quantityKind` (`count`) and `digits` (1 and 0) are taken from the same
`CRITERION_BY_ID` entries the Category II pair takes them from, so the pair of readings for
one criterion cannot letter in two precisions.

**The three existing TM59 entries gain the same two fields and nothing else.** `tm59a` and
`tm59b` declare `criterion` and `category: CATEGORY_BY_ID.II` explicitly instead of taking
the category from `TM59_STUDY_CATEGORY`, and their labels are built from those same two
declarations. `tm59c` declares `criterion: CRITERION_BY_ID.c` and `category: null`, because
26 °C is the line for both and `Criterion.byCategory` is false for it. Their ids, their
values and their lettering are unchanged (SC-005).

---

## Removed: `TM59_STUDY_CATEGORY` (`src/study.js:192`)

The export goes, and with it the argument that the curve is read at one category. Its
comment does not simply vanish: the half that is still true — that two exceedance shares
are not a signed pair and must not spend `--warm`/`--cold` — moves to where it still
applies, which is the drawing of **one** reading at a time. The half that is no longer true
— that lettering both still leaves the reader to pick — is what this feature disagrees
with, and the note records that it was a scope decision rather than a finding.

Its only importer is `src/survey.js`.

---

## `Reading` (`src/survey.js:169`) — one field added

```js
this.category = quantity.category;   // taken, never declared again
```

Taken off the quantity for the same reason `quantityKind` and `digits` already are: a
second declaration of which category a reading is read at would be free to disagree with
the card drawing the same number.

---

## `Target` (`src/schemes.js`) — two declarations move

| Target id | `metric` before | `metric` after | `category` |
|---|---|---|---|
| `tm59-a-I` | `tm59a` | `tm59aI` | `CATEGORY_BY_ID.I` (unchanged) |
| `tm59-b-I` | `tm59b` | `tm59bI` | `CATEGORY_BY_ID.I` (unchanged) |
| `tm59-a-II` | `tm59a` | `tm59a` (unchanged) | `CATEGORY_BY_ID.II` (unchanged) |
| `tm59-b-II` | `tm59b` | `tm59b` (unchanged) | `CATEGORY_BY_ID.II` (unchanged) |
| `tm59-c` | `tm59c` | `tm59c` (unchanged) | `null` (unchanged) |

Nothing else about these targets changes: same `limit`, same `unit`, same `asks`, same
`needs`, same `note`. `Target.metric`'s own documented meaning — "which reading answers it"
— becomes exactly true, where before it named a criterion that two readings answered.

The board's output is unchanged, and the change lets one table go. The board resolves a
target through `tm59Reading(target)`, which matches on criterion **and** category, taking
the criterion from the `TM59_CRITERION` table (`src/main.js:5173`) that maps a metric id to
a criterion letter. With `Quantity` carrying `criterion`, that lookup is
`QUANTITY_BY_ID[target.metric]?.criterion ?? null`, read off the declaration the roster
already holds. The table is **deleted** rather than given two more rows: its own comment
rejects slicing the letter out of the metric's name because "it happens to work", and a
hand-kept table of the same fact is the other way to be wrong about it. `carriesTm59` and
`targetReading` ask the same derivation instead of `in TM59_CRITERION`.

If review prefers to keep the table, the fallback is two added rows (`tm59aI: 'a'`,
`tm59bI: 'b'`) and no other change; the board letters the same rows either way.

---

## `Qualifier` (`src/survey.js`) — `reads` and `says` become functions

```js
new Qualifier({ field, reads: (reading) => …, says: (reading) => …, decidable })
```

| Metric key | `field` | `reads(reading)` | `says(reading)` |
|---|---|---|---|
| `tm59a`, `tm59aI`, `tm59b`, `tm59bI` | `category` | `reading.category` | `reading.category.label` |
| `tm59c` | `category` | `null` | "both categories at once, which is what makes it carry none" |
| `overheat` | `above` | `OVERHEAT_ABOVE` | `hours above 25 °C` |

The four category-bearing readings share **one** declaration object rather than one each,
so a fifth cannot be added at the wrong category by copy-paste. The comparison at the call
site becomes `qualifier.on(target, preset, reading) === qualifier.reads(reading)`.

---

## Invariants — the three throws this feature is built on

Stated as what they refuse, in the order they run.

### I1 — the roster against the method (`src/study.js`, at load)

Over `quantity.criterion` and `quantity.category`, for every criterion `CRITERIA` declares
**and that the roster answers at all** (criterion d is read by nobody and stays that way):

- `byCategory: true` → the roster carries **exactly one** quantity per declared `Category`,
  and no quantity for that criterion carrying `category: null`;
- `byCategory: false` → the roster carries **exactly one** quantity for it, carrying
  `category: null`.

**Refuses**: a criterion offered at one category only (today's state, and the defect this
feature fixes); a criterion offered at a category the method does not state; a
category-free criterion duplicated per category. Answers FR-001, FR-008 and FR-017.

### I2 — a target's metric against its category (`src/study.js`, at load)

Lives in `study.js` rather than `schemes.js`: this module reads `PRESETS` from
`schemes.js`, so `schemes.js` cannot read `QUANTITY_BY_ID` back without closing a cycle.
Both sides are in hand here, beside the assertion that already holds a metric to a
declared reading.

For every `Target` whose `metric` names a declared quantity:

- the quantity declares a category → `target.category` must be **that same instance**;
- the quantity declares none → `target.category` must be `null`.

**Refuses**: the wrong-category line — a `tm59-a-I` target left filed under `tm59a`, which
would draw Category I's limit across Category II's ground at exactly the right height,
correct-looking and wrong. Answers FR-006.

### I3 — every category-bearing reading has a category qualifier (`src/survey.js`, at load)

For every reading in `READINGS`: `reading.category !== null` if and only if
`QUALIFIER_BY_METRIC[reading.id]` exists and reads the `category` field.

**Refuses**: a reading added by category with no qualifier, which would fall through to
matching every target of its metric regardless of category. Answers FR-007.

### Already present, and now covering more ground

- The `READINGS × targets` cross product at `src/survey.js:2338-2355` constructs a
  `Threshold` for every matched pairing, so a comparator with no side is refused at load.
  With fifteen readings it covers the new pairings with no change.
- `SENSE` keys are asserted to name declared series (`src/survey.js:299-305`), so the two
  new directions cannot name a reading that does not exist.
- Series ids are asserted unique across the roster (`src/survey.js:290-297`), which is what
  lets `sv` carry one token.

---

## Counted assertions that move

| Where | Today | After | Why |
|---|---|---|---|
| `src/study.js:796` | `pairings !== 66 \|\| refusedPairings !== 54` | `78` and `66` | 6 sweepable priced faces × 13 quantities. Neither new quantity declares `movedBy`, so all 12 new pairings are refused. |
| `src/survey.js:292-294` | "Thirteen series across eleven quantities today" | fifteen across thirteen | Prose beside the uniqueness assertion. |
| `src/survey.js:121` | "Ten of the thirteen are compliance metrics or costs" | recount against the roster as it stands | The two conventions (`high`, `low`) are unchanged; the sentence's arithmetic is not, and a count in prose that no longer counts is the quiet kind of wrong. |

---

## What is deliberately **not** modelled

- **No control, no channel, no parameter.** Nothing reaches `params`, so nothing reaches
  `shapeKey`, the IDF, or a solve key. A reader choosing a category is choosing a reading,
  which is a question about the run and not a change to it.
- **No change to the count.** `COUNT_CATEGORY`, `COUNT_SCOPE` and `clearedCount` are
  untouched (FR-013). The count's scope sentence is already asserted against its own
  declarations at load and goes on being true.
- **No third category.** `CATEGORIES` is unchanged, and I1 is stated over whatever it
  declares rather than over the number two.
