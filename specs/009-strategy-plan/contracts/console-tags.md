# Contract: strip tags in `src/console.js`

## `desk.setTags(tags: Map<key, StripTag>, stamp: string)`

Modelled on `setDerived`. Replaces the whole set. For every scale, selector, facade side, boundary face and patch door on the desk:

- **With an entry whose `stamp` equals `stamp`**, the control's row draws one `button.ctl-tag` under its face, beside `.ctl-derived`, lettering `tag.text`. Pressing it scrolls to and focuses `#${tag.target}` in the moves panel (FR-039). A patch door's tag is keyed `patch:<channel>` and drawn at the head of that channel's fold, prefixed with the world it leads to (*With blinds*).
- **The folded index row** letters every tag of the channel, free ones included, as `label: text`, on its own wrapping line under the row. Not inside `.strip-read`, which is one unbroken line of mono figures and would push five words per tag off a 390 px screen.
- **With `tag.free`**, the face dims (`opacity: 0.62`): the row's own face for a single-key control, and **each free side's own bar** on a plan key or boundary key, since one wall can be free while its neighbours are not. The label, the value and the tag stay at full ink, and the control stays focusable and draggable (FR-038).
- **With no entry, or a stale stamp**, the row draws no tag and no `.free`. A missing classification is drawn as nothing, never as the last one (FR-040).

Calling `setTags(new Map(), '')` clears every tag. It is called on a station change, on closing the plan, and the moment the world or the reading pair changes (from `applyGeometry` and the gesture's end, before the throttled redraw), so no tag outlives its classification.

## Layout and copy

- The tag is one line. Its text is built only from declared short forms and asserted at load against a `TAG` budget of five words in `src/copy.js`, over every combination of kind, reading pair and sweet spots the declarations can produce, so it never needs truncating (edge case *strip tags at 390 px*).
- The tag is text first: the kind is a word, the readings are words, and nothing about it is carried by colour (FR-046, SC-014 in forced colours).
- `.ctl-tag[hidden]` is declared as a twin, by the rule the stylesheet already keeps for every class that sets `display`.

## Design system

`.interface-design/system.md` gains a component pattern, *A classification printed where the hand is*, recording: the tag's place under the face, its short-form grammar, `.free` against `.idle` (why a free control is not an idle one), the button's destination, and the tab-stop cost set against the landmark rule's refusal of 200 marks.
