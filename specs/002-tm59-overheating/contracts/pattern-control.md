# Contract: the `Pattern` control kind

A control carrying 24 hourly fractions. It is the shape TM59's gains need and
the desk does not have: `Profile` is a from/to band and cannot say 0.7 overnight,
1.0 at eight, 0.5 through the day.

## Declaration, in `src/controls.js`

```js
export class Pattern extends Control {
  constructor({ key, label, hours, digits = 2, note = null, needs = null }) {
    super({ key, label, value: serializePattern(hours), note, needs });
    this.kind = 'pattern';
    this.hours = Object.freeze([...hours]);  // the default, as a declaration
    this.digits = digits;
    Object.freeze(this);
  }
}
```

`value` is the canonical text, which is what makes this a scalar on `params` and
therefore legal under Principle II. The four mechanisms that depend on scalars
all keep working unchanged: `commit`'s `params[key] !== value` guard compares
strings, `encodeState`'s identity diff compares strings against a frozen
default, `decodeState`'s one-value-per-key rule holds, and `revert`'s
`Object.assign` copies a string rather than aliasing an array into live
`params`. That last one is the trap `Days` exists to demonstrate: `Object.freeze`
is shallow, and an array default assigned into `params` would be the same object
as `DEFAULTS_BY_VERSION.v1`'s, so the link format itself would drift with no
symptom until a shared link came back wrong.

## The codec, beside `parseHolidays`

```js
/**
 * Canonical text to 24 fractions.
 * @throws naming what is wrong: the field count, or the first field out of range
 */
export function parsePattern(text)

/**
 * 24 fractions to canonical text, at the pattern's own precision.
 */
export function serializePattern(hours, digits = 2)
```

Round trip is exact for any pattern the parser accepts, which is the property
the codec harness asserts over every declared pattern and every malformed input
class (Workflow gate 4).

`refuses(control, value)` in `controls.js` learns the kind: 24 comma-separated
fields, each a finite number in `[0, 1]`. Anything else is refused whole. There
is no half-reading of a pattern with 23 hours in it, by the same rule that
refuses `12abc` in a margin field and refuses a malformed link entire.

## The three gates

Adding a control kind is rare and it fails in three directions, each documented
in `CLAUDE.md` and each of which has cost real debugging before.

### 1. `console.js` `buildControl`

Throws for a kind it cannot draw, so the desk fails loudly at mount rather than
rendering a strip with a hole in it. A `pattern` branch is added. It draws 24
small fields under one label, foldable, with the margin-number rules from
`field.js`: focus shows the value and blur shows the lettering, a redraw never
types over the reader (`show()` returns early while the field holds focus), and
a value typed is clamped, snapped and rounded to the control's own precision
before it is committed.

### 2. `permalink.js` `readValue`

**This is the quiet one.** The numeric regex runs *before* the per-kind switch,
so a `pattern` branch added inside the switch is unreachable and every link
carrying the key is refused as "not a number". The kind is taught **above the
regex, beside `selector`**.

### 3. Key ownership

A `Pattern` owns exactly one key, so `Channel.keys()`, the `INDEX` that
`controlFor` reads, and the `DEFAULT_PARAMETERS` loop need no change, and
`labelFor`, `phraseFor` and `formatValue` need no new sub-object name. This is
the reason for three separate single-key patterns rather than one multi-key
gains control: a multi-key kind is three more places to be taught and three more
switch statements to keep in step.

## What a `Pattern` may not do

- **It is not sweepable.** `controlFor` resolves it, but a study needs `min`,
  `max`, `step` and `fraction`, which a pattern has none of. The scheduler
  already refuses a control it cannot sample; the Study offer is not made and
  the legend says why, on the same terms as a `Facade` side whose `needs` is
  false.
- **It carries no landmarks.** `readLandmarks`'s four rules are all about a
  numeric face and a step grid, and there is no published band for the shape of
  a daily profile. That absence is the honest answer, and the same rule as the
  em dash on the drawing.

## What it changes about `applyGains`

```js
// roomType === 'As drawn'  ->  byte-identical to today
//   Schedule:Compact Occupancy, shared by People, Lights, ElectricEquipment
//   People:            Area/Person, floor_area_per_person = params.occupancy
//   ElectricEquipment: Watts/Area,  watts_per_floor_area  = params.equipment
//
// roomType named          ->  three schedules and absolute levels
//   Schedule:Compact Occupancy      from occPattern
//   Schedule:Compact EquipmentUse   from equipPattern
//   Schedule:Compact LightingUse    from lightPattern
//   People:            People,          number_of_people = params.peopleCount
//   ElectricEquipment: EquipmentLevel,  design_level     = params.equipPeak
//   Lights:            Watts/Area,      watts_per_floor_area = params.lighting
```

Two invariants the implementation owes:

1. **Idempotence** (Workflow gate 2). Applying three times is byte-identical, at
   both settings of `roomType`, and switching from a named room type back to
   `'As drawn'` takes `EquipmentUse` and `LightingUse` out of the document.
   Verified by serialising a desk taken from a named type back to `'As drawn'`
   against one built at `'As drawn'`.
2. **Old links resolve unchanged** (FR-027). `roomType` defaults to `'As drawn'`
   and every new key is omitted from a link minted before this feature, so delta
   encoding hands it the default and the document is what it always was.
   `LINK_VERSION` does not move and `MIGRATIONS` stays empty. Verified by
   decoding a link captured at `HEAD` and asserting the IDF is byte-identical.

## The `Schedule:Compact` trap

`Until: 08:00` and the value after it are **two separate extensible fields**.
Joining them into one comma-bearing string produces a malformed IDF. A 24-value
pattern is 24 pairs, or fewer once runs of equal values are collapsed, and the
collapsing has to be deterministic or idempotence fails.
