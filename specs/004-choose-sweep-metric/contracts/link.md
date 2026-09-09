# Contract: the `sty=` fragment key

**Module**: `src/permalink.js`

## Grammar

`sty` joins `in`, `out`, `stn`, `win` and `at` in `RESERVED`. Absent, the desk
has no initialized quantity and no studies. That is what every link minted before
this feature says and is why no `LINK_VERSION` bump is required (FR-024, D5).

The value carries the desk quantity once, followed by zero or more open study
control keys. A full stop separates the quantity from the controls; commas
separate controls.

```text
sty=<quantityId>[.<controlKey>[,<controlKey>]*]
```

If the quantity has never initialized and no studies exist, encoding omits `sty`.
If the quantity has initialized and all studies were cleared, encoding preserves
it as `sty=<quantityId>`. A second `sty=` is refused as "given twice" because
the grammar is deliberately one value, not a repeatable key.

## Validation, in two stages, following the pin

**Structural, at decode, refusing the whole link** (FR-022 through FR-024):

- The value matches the grammar, with no empty quantity, empty control, trailing
  full stop, trailing comma or repeated separator.
- The quantity id is in the roster. An id that no longer exists refuses the link
  with its reason rather than resolving to a different quantity.
- Every control key names a control that exists and can be swept. A key with no
  finite `min`, `max` and `step` is refused, since `samplePoints` would throw on
  it later, inside a promise, where the failure would present as an empty sweep.
- No control key appears twice. One control can own only one study.
- A second `sty` key refuses the whole link.

**Availability, after decode, never a structural refusal**: quantity offers are
total declarations and require no run. A decoded quantity the current desk cannot
produce remains present with its reason and fix. Its studies wait rather than
substituting another quantity (FR-009, FR-010 and FR-012).

## Encoding

`encodeState` gains one line beside the `at` line. The studies encoded are the
open control keys in control declaration order. The quantity id is written once
at the start. Two desks with the same initialized quantity and open studies
therefore mint the same link, and `schemeHash`'s identity comparison in the
`hashchange` guard keeps working.

## What does not ride

The curves. The link carries the desk quantity and open control keys; the samples
are re-swept on arrival under the existing auto-solve gate. The chase pin is
untouched by this feature beyond no longer deciding what a curve measures.

## Round trip

The codec's guarantee is asserted by a throwaway Node harness, as the rest of the
codec is: every reachable `sty` value encodes and decodes exactly, and every
malformed class is refused. The harness includes omitted `sty`, quantity-only
`sty`, several controls in canonical declaration order, unknown quantities and
controls, unsweepable controls, duplicate controls, malformed separators and a
duplicate `sty`. Note that `assertReadable()` covers only `ALL_KEYS` and does not
exercise a reserved key, so the harness must hold `sty` honest.
