# Phase 1 — Data model: threshold isoline on the survey

Three new typed objects, all in `src/survey.js`, all frozen, none of which stores a
figure that exists elsewhere. Everything here is derived on demand: nothing is
remembered, for the reason the register gives — a flag can go stale and a recomputation
cannot.

---

## `Threshold`

One published pass/fail figure belonging to the plotted reading, together with which
side of it passes.

| Field | Type | Source |
| --- | --- | --- |
| `preset` | `Preset` | the standard that published it, by reference |
| `target` | `Target` | the line itself, by reference — **never copied** |
| `reading` | `Reading` | the survey reading it was matched to |
| `limit` | getter → `number` | `this.target.limit`, so the line and the scoreboard row are one number |
| `passesBelow` | `boolean` | probed from `target.meets` at construction (research R-2) |
| `label` | getter → `string` | `${preset.name} · ${target.label}` |
| `asks` | getter → `string` | `target.asks`, the criterion in the publisher's own words |

**Methods**

- `passes(value)` → `boolean | null`. Delegates to `target.meets(value)`. `null` where
  the value is not finite, which is the same "missing is not a measurement" answer the
  rest of the sheet gives.
- `figure()` → the limit lettered through `reading.figure(this.limit)`, so it converts
  with the reading and carries no unit (the axis and the key carry the unit once).

**Construction throws** — at module load, not at draw time — when:

1. `target.quantityKind !== reading.quantityKind`;
2. the probe of `target.meets` does not resolve to exactly one side;
3. `target.limit == null` (such a target is an *absence*, never a `Threshold`).

**Identity.** Two `Threshold`s are **coincident** when their limits are equal to within
`max(1, |limit|) * 1e-9`. Coincident thresholds are drawn as one line carrying both
labels and one band (research R-5). This is live today for TEDI (Passivhaus 15, LETI 15)
and for `overheat` (Passivhaus 10, EnerPHit 10).

---

## `ThresholdSet`

What the survey draws for one reading at one moment. Returned by `thresholdsFor`.

| Field | Type | Meaning |
| --- | --- | --- |
| `reading` | `Reading` | the plotted reading, `survey.readings[0]` |
| `chased` | `string \| null` | the preset id being chased, as handed in |
| `lines` | `Threshold[]` | frozen; empty exactly when `absence` is set |
| `absence` | `string \| null` | the stated reason there is no line — never null when `lines` is empty, never non-null when it is not |

`lines` and `absence` are mutually exclusive and jointly exhaustive, asserted in the
constructor. That is Principle IV expressed as a type: there is no state in which the
drawing shows nothing and says nothing.

**The absence sentences** (each one a reason, not a blank):

| Situation | Sentence says |
| --- | --- |
| the reading carries no target at all | no standard on this sheet publishes a limit for this reading |
| every matching target has `limit: null` | the publisher sets it per building and per climate, so there is no line this sheet may draw — the target's own reason, from `target.note` |
| a standard is chased and publishes no limit for this reading | names the chased standard and says it carries no line for this reading (FR-014) |

---

## `PassingGround`

The measured ground lying on one threshold's compliant side. One per drawn line —
never merged across thresholds (FR-011).

| Field | Type | Meaning |
| --- | --- | --- |
| `threshold` | `Threshold` | which line this ground belongs to |
| `cells` | array of cell polygons in lattice coordinates | the fill, per cell, clipped to the isoline |
| `segments` | `contoursOf` output at `threshold.limit` | the boundary |
| `measured` | `number` | measured positions on the passing side |
| `wanted` | `number` | measured positions in total |
| `wholly` | `'passing' \| 'failing' \| null` | set when the line crosses no measured ground (FR-007); `null` when it crosses |

`measured + (wanted − measured) === wanted` is asserted in the constructor, the same
way `Coverage` asserts its own sum and for the same reason: a drawn band and the count
of what was measured must never be able to disagree.

**A cell contributes nothing unless all four of its corners carry a run.** Not styled —
never generated. This is what makes FR-004 structural rather than a rule somebody has to
remember, and it is the identical clause `contoursOf` and `meshOf` already hold to.

---

## The matching rule

`targetsFor(reading)` — the whole of the cross product, evaluated once at module load
and again never:

```text
for every preset in PRESETS where preset.kind === 'standard'
  for every target in preset.targets
    if target.metric !== reading.id            → not this reading
    if target is qualified and the qualifier
       does not describe what the reading reads → THROW, naming both
    if target.quantityKind !== reading.quantityKind → THROW, naming both
    if target.needs is not implied by
       reading.quantity.needs                   → THROW, naming both
    if target.limit == null                     → an absence, with its reason
    else                                        → a Threshold
```

**Qualifiers**, the part that fails quietly (research R-4):

| Metric | Qualifier | Must equal |
| --- | --- | --- |
| `overheat` | `target.above` | the temperature the `overheat` quantity reads at — 25 today |
| `tm59a`, `tm59b` | `target.category` | `TM59_STUDY_CATEGORY` (`COUNT_CATEGORY`, Category II) |
| `tm59c` | `target.category` | `null` — criterion c is 26 °C for both categories |
| everything else | — | no qualifier |

**`needs` implication**: `quantity.needs.annual ⇒ 'year'`; `quantity.needs.season ⇒
'season'`; any run at all ⇒ `'run'`. Every pair on the sheet satisfies this today.

---

## The four invariants that throw at module load

Gate 5 of the constitution's workflow. Each throws naming the declarations on both
sides, so the message says what to fix rather than that something is wrong.

1. **Kind agreement.** A target and the reading it matches letter in the same
   `quantityKind`. Unit *strings* are deliberately not compared: a converting kind owns
   its unit string, so `kWh/m²·yr` and `kWh/(m²a)` are the same kind spelled two ways
   by two publishers.
2. **Qualifier match.** A metric match whose qualifier describes something the reading
   does not measure is refused, not skipped. This is what stops a Category I criterion
   being drawn across a Category II ground — invisible today, because both categories
   carry the same limit.
3. **Pass side.** `Target.meets` probed either side of the limit resolves to exactly one
   side. Anything else is a comparator this feature cannot draw.
4. **`needs` implication.** A target asking for more run than the reading's own quantity
   ever asks for is refused: the ground could carry figures the line has no right to
   judge.

---

## What this model deliberately does **not** hold

- **No new parameter, and no link key.** Nothing here reaches the IDF, so nothing here
  belongs on `params` (Principle VI's rule, in the direction that catches you out: a
  value on `params` that reaches no IDF field starts runs that change nothing).
  `LINK_VERSION` is untouched, `DEFAULTS_BY_VERSION` unfrozen, no `MIGRATIONS` step.
- **No cached set.** `thresholdsFor` is recomputed on every draw, exactly as
  `conformance()` is recomputed on every apply. A cache here would need to carry both
  the chase state and the unit system in its key, which is the trap this codebase has
  now met three times.
- **No verdict on the design.** A `PassingGround` says where a published line falls on
  measured ground. It is not a recommendation, not an optimum, and not a combined
  judgement across standards (FR-011), and the key's wording is what carries that.
- **No relationship to `SENSE`.** The improving direction and the pass side are
  different declarations answering different questions, and the drawing keeps them
  apart.
