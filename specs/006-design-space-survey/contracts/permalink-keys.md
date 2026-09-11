# Contract: the survey's link keys

## The key

One new reserved key, `sv`, added to `RESERVED` in `src/permalink.js`, which is today
`['in', 'out', 'stn', 'win', 'at', 'sty']` and is already asserted against `ALL_KEYS`
at module load so a future control key cannot collide with it.

`sv` carries, in order: axis X key, axis Y key, the reading id or ids, and the extent
of each axis. The stance is **not** restated: it is the desk, and the desk is already
what the rest of the fragment encodes.

## Version

`LINK_VERSION` stays `v1`. Adding a key is free under delta encoding, and this feature
changes no existing default, no key name and no range, so `DEFAULTS_BY_VERSION` gains
nothing and `MIGRATIONS` stays empty.

## The trap this must not fall into

`readValue`'s numeric regex runs **before** the per-kind switch. A `sv` branch written
inside the switch is unreachable, and every survey link would be refused as
"is not a number", which is a true sentence about the wrong thing on a link that was
perfectly good. **The branch goes above the regex, beside `selector`**, exactly where
the `pattern` kind had to go.

It must **re-serialise what it read**, so two spellings of one survey do not key two
identical solves through `shapeKey` and so the identity diff in `encodeState` does not
write a survey sitting at its own default into every link minted after.

## What does not ride the link

- **Measured values** (FR-044). The recipient re-measures and gets identical numbers,
  because the engine is repeatable on one input.
- **The camera** (FR-044a). It is how the ground is being looked at rather than what
  was measured, which is the rule the chase pin already follows.
- **The traverse.** A session, not a history.

## Refusal

A link naming an axis, a reading or an extent that cannot be honoured is refused
**whole**, with the reason on the sheet, never half loaded (FR-046). A control that no
longer exists, or a renamed reading, refuses the whole link (edge case).

## Harness gate

Round-trip every field exactly, and refuse every malformed input class, per the
constitution's Development Workflow gate 4. Specifically: same control on both axes,
an axis on a priced channel, an unknown reading id, an extent outside the control's
range, and a `sv` value that is syntactically a number.
