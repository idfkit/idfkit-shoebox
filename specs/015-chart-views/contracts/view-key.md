# Contract: the `pv` link key

**Owner**: `src/views.js` (`encodeView`, `decodeView`), called from
`src/permalink.js`.
**Requirements**: FR-023, FR-024, SC-004, Edge Cases.

## 1. Placement

- **Reservation.** `pv` is added to `RESERVED` in `permalink.js`. The
  existing collision check then asserts at load that no control parameter is
  named `pv`.
- **Order in the fragment.** The pair is appended after `sv`, so the
  fragment's reserved pairs keep a fixed order.
- **Absence.** At the default setting (`ts`, series `{air, outdoor}`,
  aggregation hourly, no zoom) the key is absent. A link built at the default
  is byte-identical to one built before this feature.
- **Version.** `LINK_VERSION` stays `v1`. This is the additive case recorded
  for `wf`. A build older than this feature refuses a link carrying `pv`, as
  it would refuse any key it does not know.

## 2. Grammar

```text
pv      = view *( "." field )
view    = "ts" / "psy" / "adp" / "crp" / "dur" / "avg" / "sig"
field   = series / shade / agg / zoom / region / model   ; in this order, each at most once
series  = "s-" sid *( "_" sid )                     ; ids in declaration order
sid     = "air" / "operative" / "radiant" / "outdoor"
shade   = "c-" ( "operative" / "radiant" / "outdoor" ) ; the carpet's one series; "air" is the default
agg     = "a-" ( "d" / "m" )                        ; "h" is the default and never written
zoom    = "z-" mmdd "_" mmdd                        ; from, to; from <= to
mmdd    = 2DIGIT 2DIGIT                             ; a real day of a 365-day year
region  = "r-a"                                     ; "g" is the default and never written
model   = "m-" ( "en1" / "en3" / "a80" / "a90" )    ; "en2" is the default and never written
```

The grammar uses only `.`, `-` and `_` as separators. These survive
`URLSearchParams` unescaped.

### Fields per view

| View | Fields it may carry |
|------|---------------------|
| `ts` | `series`, `agg`, `zoom` |
| `dur`, `avg` | `series` |
| `psy` | `region` |
| `adp` | `model` |
| `crp` | `shade` |
| `sig` | none |

A field that does not apply to the named view is a malformed value.

`crp` shades exactly one series (User Story 4), carried by `shade` and
defaulting to zone air temperature. It is kept apart from `series` because
`series` is a set that the time series, duration curve and average day share,
while the carpet can draw only one.

## 3. Canonical form

`encodeView(setting)` writes exactly one string per setting:

- A field at its default is omitted.
- Series ids are written in declaration order: `air`, `operative`, `radiant`,
  `outdoor`.
- The view token alone is written when every field is at its default. For
  example, `pv=psy`.
- The whole key is omitted when the setting equals the global default.

`decodeView(encodeView(s))` must equal `s` for every reachable `s`, and
`encodeView(decodeView(t))` must equal `t` for every accepted `t`.

## 4. Refusal

Each of the following refuses the whole link, with the reason stated as for
any malformed reserved key (FR-023, Edge Cases):

1. an unknown view token;
2. an unknown field prefix, or a field repeated;
3. fields out of the order in section 2;
4. a field that does not apply to the view;
5. a field written at its default value (not canonical);
6. an empty series list, an unknown series id, a repeated id, or ids out of
   declaration order;
7. a `zoom` whose day does not exist (for example `0230`), or whose `from` is
   after `to`;
8. `pv` present with an empty value, or present twice.

A well-formed value naming a view the linked desk cannot draw is **not**
refused. The desk loads and the plate states the view's `Unavailable` reason.
A well-formed `zoom` the run does not cover loads and is released on the first
run, with a stated reason.

## 5. Where it is and is not written

| Surface | Carries the view |
|---------|------------------|
| Address bar (`updatePermalink`) | yes |
| Share button and run bundle manifest (`schemeUrl`) | yes |
| Kept-scheme shelf (store) | **no**: `schemeHash({ view: null })` |
| `restoreScheme` comparison | **no** |
| `hashchange` "already showing" guard | yes, the bar's form |

## 6. Examples

| Setting | Fragment pair |
|---------|---------------|
| default | *(absent)* |
| psychrometric, graphic region | `pv=psy` |
| psychrometric, adaptive region | `pv=psy.r-a` |
| time series, operative only, daily, 12 to 19 July | `pv=ts.s-operative.a-d.z-0712_0719` |
| duration curve, air and operative | `pv=dur.s-air_operative` |
| adaptive comfort, ASHRAE 80 % | `pv=adp.m-a80` |
| carpet shaded by operative temperature | `pv=crp.c-operative` |

Examples of refused values:

- `pv=psy.r-g` refuses under rule 5.
- `pv=ts.a-d.s-air` refuses under rule 3.
- `pv=crp.s-air` refuses under rule 4.
