# Phase 1: data model

**Feature**: Choose what a sweep plots | **Branch**: `004-choose-sweep-metric`

Five declared or cached entities are new or reshaped; `Study` already exists and
keeps its control-only identity. The desk also gains one mutable chosen-quantity
state shared by every study, and land time gains one transient run view. Declared
entities are frozen instances of classes with constructors, per the repository's
preference for typed objects over loose dictionaries. Every invariant below that
can be checked at module load is checked there rather than documented and hoped
for.

## `Quantity`

The declaration. One instance per offerable reading, frozen, in `src/study.js`.
Replaces the current `Metric` class (`src/study.js:175-182`), whose three fields
were `id`, `reporting` and `read`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable. It rides the link, so renaming one is a breaking change to the fragment and costs a `LINK_VERSION` bump, exactly as renaming a control key does. |
| `label` | string | What the sheet calls this reading, in the words it already uses elsewhere (FR-002). |
| `unit` | string | Lettered on the card's footer and in its `aria-label`. |
| `digits` | integer | Decimal places, taken from the surface that already letters the quantity, so `tm59b` carries 0 and the rest carry 1 (FR-008). |
| `needs` | `RunContents` | What a run must carry for this to be readable (FR-009). The subject of the subset test in D1. |
| `context` | function or null | `(desk) => value`, resolving the facts the reader needs beyond the run, off the station and the desk rather than off the asking study (FR-018). |
| `read` | function | `(landed, { built, context }) => number, frozen named-number object, or null`. `landed` is the short-lived parsed run view; existing arithmetic is reused rather than restated. |
| `pen` | string or null | Which of the desk's two signed pens draws it, or null for an unsigned quantity. A share takes no hue, which is the rule the criterion curve already follows. |
| `series` | frozen array | One declared line for a scalar quantity, or two lines for the paired temperature and thermal-demand views. Each line carries its label, pen and selector. |
| `meterScope` | `null`, `building`, or `all` | Resolves the meters producible by the sample's engaged channels. EUI excludes site meters; cost and carbon include them. |
| `wholeYear` | boolean | Whether all twelve weather months are required rather than merely a weather-file environment. |
| `priced` | `null`, `cost`, or `carbon` | Which complete rate set the offer must verify before queueing. |

**Validation, all at module load.**

1. No two quantities share an `id`. This is the check `src/study.js:230-242`
   already makes, and it is kept.
2. Every quantity declares a non-empty `needs`. A quantity that needs nothing is
   a quantity nobody can decide a run for.
3. Every `id` that names a scoreboard reading appears in `Target.metric`
   (`src/schemes.js`), and every distinct `Target.metric` appears in the roster.
   One vocabulary, asserted, for the reason `schemes.js` already asserts
   `TM59_SPACES` against `PROFILE_IDS`: two lists for one vocabulary disagree
   eventually and silently.
4. `digits` is a non-negative integer, because it reaches `toFixed`.
5. Every `needs` is satisfiable by some reachable desk. A quantity that can never
   be answered would stand permanently greyed, which is the offer's equivalent of
   the landmark rule that throws for a band left permanently unreadable.

## `RunContents`

What a run carries, and what a quantity needs, in one comparable form. New, in
`src/study.js`, consumed by `src/model.js`.

| Field | Type | Meaning |
|---|---|---|
| `variables` | frozen array of strings | `Output:Variable` names, each with the key and frequency the profile writes them at. |
| `meters` | frozen array of strings | `Output:Meter` names, always Monthly, which is the one frequency `parseMTR` survives. |
| `tables` | boolean | Whether the tabular apparatus is written, which is the only route to `eplustbl.htm`. |
| `annual` | boolean | Whether a weather-file environment is required, as against design days. |
| `channels` | frozen array of strings | Channels that must be engaged for the contents to be producible at all, such as `system` for the demand meters and `gains` for the occupancy series. |
| `season` | boolean | Whether the run must reach some part of 1 May to 30 September. |

**Operations.**

- `RunContents.union(list)` gives what a sample is written with.
- `carried.answers(needed)` is the subset test of D1: every variable, meter and
  table the quantity needs is present, the run kind matches, the channels were
  engaged, and the season is reached.

**Invariant that is not obvious and must be asserted.** `syncReporting` clears
and rewrites every `Output:*` object on every apply, and the sweep's restore
depends on that being byte-exact. So a `RunContents` must serialise in a declared
canonical order, independent of the order the quantities were declared or unioned
in. Two runs carrying the same set must produce identical IDF text. This is
asserted by a harness rather than trusted, because on this codebase merely asking
whether a type is present reorders the file.

## `Offer`

A quantity as it stands against the current desk. Computed, never stored, so it
cannot go stale: the same discipline `conformance()` keeps by measuring the desk
on every `applyGeometry` rather than remembering a selected standard.

| Field | Type | Meaning |
|---|---|---|
| `quantity` | `Quantity` | The declaration. |
| `available` | boolean | Whether the current desk could produce a run answering it. |
| `reason` | string or null | Why not, specifically enough to act on. Null when available. |
| `fix` | string or null | What would make it available, phrased as the thing to do. Null when available. |
| `unit` | string | The resolved display unit. Cost uses the current ISO currency code; other quantities use their declared unit. |

**Rules.** The roster is total: `offersFor(desk)` returns one `Offer` per
quantity, always, in declaration order (FR-009, SC-004). `reason` and `fix` are
composed from the gap between `quantity.needs` and what the desk can produce, not
written by hand at the call site, so a quantity added later gets both without
anyone writing them (SC-008). Producing an offer must not cost a run (FR-010).
Whole-year coverage, producible scoped meters and typed pricing availability are
checked here, before a sample can be queued.

## `PricingAvailability`

A frozen desk fact containing the current currency code and independent typed
statuses for cost and carbon. Each status is either available or carries both a
reason and a fix. Cost and carbon remain independent: a missing grid factor does
not hide a complete tariff, and incomplete totals never enter a curve.

## `Study`

Exists today as an untyped object literal written at `src/main.js:7033-7043`.
Its identity and cardinality stay unchanged: one study per swept control.

| Field | Change |
|---|---|
| `key` | unchanged: the control being swept and the study's only identity. |
| `metric` | removed. The quantity is read from the desk-wide choice, not stored on a study. |
| `label`, `restShape`, `annual`, `wholeYear`, `curve`, `coarse` | unchanged. |

**Identity.** A study is its control `key`. Everything that accounts for studies
stays keyed by that control: `studies` and `studyStops` in `main.js`, `byKey` in
`scheduler.js`, and `rows`, `cards` and `studyButtons` in `console.js` (FR-001,
FR-003 and FR-004). The link carries each open study as that control key only
(FR-023).

**State transitions.**

```text
        reader presses Study
   (none) ─────────────────────────────────────> queued
                   |
   queued --sample lands--> queued (partial curve) |
   queued --every sample landed, some drew--> done |
   queued --every sample landed, none drew--> failed
   queued --Stop, or the desk moved--> cancelled

   done --desk quantity changes, cache answers--> done (redrawn immediately)
   done --desk quantity changes, cache falls short--> waiting (same study)
  done --weather changes-----------------------> waiting (same study, cache cleared)
   waiting --missing samples land--> queued or done (same study)
   waiting --auto-solve is off--> waiting, with no run started

   done --the desk moves--> stale, then re-swept coarse on release
   done --chosen quantity stops being answerable--> stands, says which
     quantity it cannot read and why, substitutes nothing (FR-012)
```

The quantity-change transitions preserve the same study. A compatible cached
curve replaces the old curve immediately. Without one, the card either shows an
explicit waiting state or preserves the previous curve under its previous
quantity label and marks it as waiting. It never presents the previous curve as
the new quantity (FR-004a and FR-004b).

A station change clears the climate-dependent cache and cancels in-flight sample
jobs, but it does not clear `Study`. Each card becomes waiting for the incoming
climate and preserves its open strip, chooser, focus and viewport anchor through
partial and completed redraws (FR-004c).

## Desk quantity state

The chosen quantity is one nullable desk-level value, not a field of `Study`.
Every open card reads it and every quantity change mutates it once.

```text
uninitialized --first study starts--> initialized from legacy inference
uninitialized --link carries sty----> initialized from the decoded quantity
initialized   --reader chooses------> initialized with the chosen quantity
initialized   --desk changes--------> unchanged
initialized   --later study starts--> unchanged
initialized   --all studies clear---> unchanged
```

The legacy inference runs only on the first transition. Clearing every study
does not return the desk to `uninitialized`, so a later study opens on the frozen
choice. A link containing only `sty=<quantityId>` restores the same initialized
state with no open studies (FR-005, FR-011 and FR-022).

## `Sample`

The cache entry. Today it is a couple of floats keyed by desk shape plus metric
plus run kind (`src/main.js:6609-6610`). It becomes:

| Field | Type | Meaning |
|---|---|---|
| *key* | string | The sample's desk shape, the run kind, and the canonical contents the run carried. Never the quantity that asked for it (FR-016). |
| `readings` | frozen map of id to number, frozen named-number object, or null | One entry per quantity the run could answer, read at land time (FR-017). Composite values are limited to the high/low temperature and TEDI/CEDI demand pairs. |
| `carried` | `RunContents` | What the run held, so a later quantity's needs can be tested against it. |
| `meterBasis` | frozen map of meter name to number | The physical building meter totals needed to rederive EUI, cost and carbon after a price-only desk change. Empty when the run carried no applicable meters. |

**Rules.** A quantity absent from `readings` was not answerable by that run and
is not a zero (FR-014). Every answerable quantity is read once when the sample
lands, then the raw and parsed run are discarded (FR-017). The 400-entry bound
and the clear on a station change remain unchanged. The station stays out of the
key, as it is today, which is why the station change must clear the cache.

Exact identity alone cannot provide subset reuse: looking up a key containing
one canonical `RunContents` cannot find another key carrying a superset. The
cache therefore also groups samples by desk shape and run kind. Compatible
lookup filters the group with `carried.answers(quantity.needs)`, takes the
candidate with the fewest extra carried items, and breaks ties by canonical
`RunContents` serialisation. Only a miss from that lookup may queue a sample
(FR-003, FR-004a and FR-013).

## Landed run view

This typed transient exists only while `readPoint` handles a successful engine
result. It is not cached.

| Field | Type | Meaning |
|---|---|---|
| `eso` | parsed ESO | Hourly variables and monthly meter records used by temperature, demand, peak-load, overheating and TM59 readers. |
| `meters` | frozen map of meter name to total | Building meter totals normalized once from the run and its environments, used by EUI, cost and carbon. |
| `environments` | frozen array | The environments included in meter totals and annual checks. |
| `hours` | number | Run duration used by the existing bill arithmetic. |
| `months` | number | Covered month count used to distinguish a whole year from a partial run. |
| `annual` | boolean | Whether the landed run contains a weather-file environment. |

`readPoint` constructs this view once, calls every answerable quantity reader,
then discards the view and raw result. `Sample` keeps only the resulting small numeric readings,
the small physical meter basis and `RunContents` (FR-017). Plant and Tariff
changes rederive EUI, cost and carbon from `meterBasis` and current pricing
context, without changing the cache key or starting a run (FR-020).

## Relationships

```text
Quantity --declares--> RunContents --union--> what a sample is written with
    |                                              |
    | measured against the desk                    | what the run carried
    v                                              v
  Offer                                         Sample.carried
    |                                              |
    | the reader picks one for the desk             | answers(needed)?
    v                                              v
Desk quantity -------------------------------> Sample.readings[quantity.id]
    |
    +--shared by--> Study (control key only)
    |
    +--rides once--> `sty=<quantityId>[.<controlKey>[,<controlKey>]*]`
```

## What is deliberately not modelled

- **No quantity on `Study`.** The quantity belongs to the desk. Duplicating it on
  each study would permit disagreement and would turn a desk-wide mutation into
  several independent states.
- **No stored `Offer`.** Computed on demand from the desk, every time.
- **No raw or parsed run in `Sample`.** Land time extracts the readings bag and
  discards the run.
- **No curve on the link.** The link carries one choice and the open control
  keys; the samples are re-swept on arrival.
