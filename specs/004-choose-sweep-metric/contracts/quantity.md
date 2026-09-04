# Contract: the `Quantity` declaration

**Module**: `src/study.js` | **Consumed by**: `src/main.js`, `src/console.js`,
`src/model.js`, `src/permalink.js`

This is the interface a quantity presents to the rest of the desk. It is a
declaration and never a computation: constructing one must not read a run, touch
the document, or cost an engine call (FR-010).

## Shape

```js
new Quantity({
  id,        // string, stable, rides the link
  label,     // string, the sheet's own words for this reading
  unit,      // string
  digits,    // non-negative integer
  needs,     // RunContents
  context,   // ((desk) => value) | null
   read,      // (landed, { built, context }) => number | frozen named-number object | null
  pen,       // '--warm' | '--cold' | null
   series,    // one declared line, or one of the two declared pairs
   meterScope,// null | 'building' | 'all'
   wholeYear, // boolean
   priced,    // null | 'cost' | 'carbon'
})
```

`landed` is a typed, short-lived view of the finished run: its parsed ESO,
normalized building meter totals, environments, hours, months and run kind. It
exists only while the sample lands. Cost, carbon and EUI use the meter summary;
the other eight choices use the parsed ESO. After every answerable quantity has
read it, the raw engine result and `landed` are discarded. Only numbers and the
two frozen two-number pairs enter the sample cache, alongside the small physical
meter basis needed for repricing.

`METRICS` becomes `QUANTITIES`, a frozen array of these, and `METRIC_BY_ID`
becomes `QUANTITY_BY_ID`. `metricOf(id)` keeps its role as the single gate that
throws for an undeclared id in the caller's stack rather than as twenty-one
silent gaps.

## The desk choice

The desk stores one nullable chosen quantity outside its studies. Starting the
first study of the session initializes it from the legacy inference exactly once.
Every later study reads the same value. Desk changes, later studies and clearing
all studies neither reset nor re-infer it; only an explicit reader choice mutates
it (FR-001, FR-005 and FR-011).

Decoding `sty=<quantityId>` also initializes the choice, even when the link opens
no studies. An old link without `sty` leaves it uninitialized and preserves old
link behaviour (FR-022 through FR-024).

## Guarantees the roster makes

1. **Total.** `offersFor(desk)` returns one `Offer` per declared quantity, in
   declaration order, on every desk. The list never shortens (FR-009).
2. **Cheap.** Building the full offer list costs no run and no parse. It is a
   comparison of declarations against the desk's channel state, run kind and
   calendar.
3. **Self-explaining.** A quantity the desk cannot answer carries a reason and a
   fix composed from its own `needs`, so a quantity added later is explained
   without anyone writing a sentence for it (SC-008).
4. **One target vocabulary.** Every `Target.metric` id in `src/schemes.js`
   appears as a quantity or paired series id, asserted at module load. The
   non-target outcomes are declared only here.
5. **Reachable.** Every quantity is available on a maximally capable reachable
   desk at module load. An impossible channel, meter, calendar or pricing need
   throws naming the quantity and requirement.

## What a reader may assume, and what it may not

A `read` function is handed the short-lived landed-run view and a context bag. It
may assume the run carries what the quantity declared it needs, because the
subset test ran before it was called. It may **not** assume anything about which
study asked: the same sample is read for every quantity it can answer, so a
reader that reached for a per-study fact would be reading one study's premise
into another study's number (FR-017).

`context` is therefore resolved from the desk and the station, once per sample,
and the existing per-study `contextFor` in the scheduler collapses into it
(FR-018).

EUI, cost and carbon have one additional guarantee: their physical meter basis
is retained with the sample. When a Plant or Tariff setting changes, the desk
calls the same quantity arithmetic with that basis and the current pricing
context. It replaces those three cached readings and redraws without an engine
run. Priced settings never enter sample identity (FR-020).

`contentsFor(quantity, channels)` resolves bill-derived meter scopes before the
model is written. EUI requests every producible building meter. Cost and carbon
request every producible building and site meter. Their offers refuse a desk with
no applicable meter, an incomplete required rate set, or an insufficient calendar
before queueing; cost readings retain the `Currency` used by the existing bill.

## The four failure modes this contract exists to prevent

Each has already cost a whole sweep on this codebase, or would:

1. **An id that is not declared.** Caught by `quantityOf` throwing in the caller's
   stack. Without it, twenty-one samples land as `undefined` and the card reports
   no readings with nothing saying why.
2. **A profile name that drifts from an id.** This is why `reporting` was a
   separate field from `id` in the first place (`'tm59a'` reads off `'tm59'`),
   and it is why `needs` is a structure rather than a name: there is nothing left
   to misspell.
3. **A reader that cannot run at land time.** Prevented by `context` being a
   function of the desk. A reader needing a per-study fact cannot be declared.
4. **A `digits` that disagrees with the surface already lettering the quantity.**
   `tm59b` is nights and carries 0; a 1 there letters "4.0 nights", which is a
   different claim about a counted thing.
