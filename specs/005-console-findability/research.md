# Phase 0: research

**Feature**: Console findability | **Branch**: `005-console-findability`

The spec left no `NEEDS CLARIFICATION` markers and the two decisions open after
the first draft were settled by the reader on 2026-09-03: the grid is what is
inside the console the existing button already opens, and the peek is wanted.
What follows resolves the technical unknowns those answers create.

Every decision below is grounded in the working tree or in a measurement taken
on it. The measurements matter more than usual here, because the single largest
question this feature asks — *can a card be animated open under a moving
pointer* — turned out to have an answer that depends entirely on which layout
the console is built from, and the answer for the layout it is built from today
is no.

## Measurements

Taken on this repository at `fc76ce7` (branch `005-console-findability`, whose
code is `main`'s), Chrome, dev server, window 1500 x 913, desk open, default
desk. `.strip-grid` is the multi-column wrapper inside the `.strips` scroller.

### M1: the console as it stands

| | |
|---|---|
| Strips | 18 |
| `.strip-grid` box | 435 x **11,807 px** |
| `.strips` scroller | 435 x **473 px** |
| Ratio | **25 screens** |
| Strips fully visible at the top of the scroller | **1** |
| Median strip height | 586 px |
| Tallest | Air 1,131 px (18 controls), Glazing 1,118 (12), Fabric 1,065 (8) |
| Shortest | Grounds 335 px (2 controls) |

The declaration is `column-width: 320px; column-count: 5` (`index.html:2417`),
but the desk's flex basis is `--desk: 436px` (`index.html:50`), so at any
ordinary window **only one column fits**. The multi-column layout that is
supposed to make eighteen channels tractable is, at the width the desk actually
gets, a single column 25 screens long. That is the complaint in one number.

### M2: what the present layout costs to relay out

Forty passes toggling `column-count` on `.strip-grid` and forcing synchronous
layout.

| | median | p95 | min |
|---|---|---|---|
| multi-column relayout | **97 ms** | 145.5 ms | 58.3 ms |

At 60 fps a frame is 16.7 ms. A multi-column relayout is **six frames**. Nothing
that happens under a moving pointer can afford one.

### M3: what a closed card is

Every strip with its `.strip-fold` hidden — which is what a closed card is.

| | |
|---|---|
| Closed row height | 56–57 px (median 57), max 100 where a blocked note stands |
| All eighteen closed, one column | **1,083 px** against a 473 px scroller |

So folding alone does not deliver the spec's first requirement. Eighteen closed
rows in one column is still 2.3 screens.

### M4: how many columns it takes to fit eighteen closed cards

Same content, laid out as a CSS grid, all folds hidden, `.strip-grid` 435 px wide.

| columns | height of all eighteen | fits the 473 px scroller | card width |
|---|---|---|---|
| 1 | 1,083 px | no | 435 px |
| 2 | 580 px | **no**, by 107 px | 218 px |
| 3 | **406 px** | **yes** | 145 px |
| 4 | 348 px | yes | 109 px |

Height is set by the row count, not by the desk's width, so widening the desk
never fixes two columns — it only makes each card wider. **Three columns is the
minimum that satisfies FR-001**, and at today's desk width that is a 145 px card.

### M5: what a grid costs, and what opening a card costs

| | median | p95 |
|---|---|---|
| CSS grid relayout (same content, all closed) | **7.2 ms** | 13 ms |
| Opening one card inside a 3-column grid | **2.2 ms** | 9.3 ms |
| multi-column relayout, from M2 | 97 ms | 145.5 ms |

A grid is **13x cheaper** to lay out than the multi-column box holding the same
eighteen strips, and opening a single card inside one costs 2.2 ms — comfortably
inside a frame. The peek is affordable in a grid and impossible in multicol, and
that one fact decides the first two entries below.

Also measured: Air opened inside a 3-column grid is **1,419 px** tall and takes
the whole grid to 1,768 px, against the 473 px scroller. An opened card is three
times the room available to it.

## Decisions

### D1: replace the multi-column wrapper with a CSS grid

**Decision.** `.strip-grid` stops being `column-width`/`column-count` and becomes
`display: grid`.

**Rationale.** M2 against M5: 97 ms against 7.2 ms for the same content. The peek
the spec requires (FR-005) and the animation it requires (FR-008) are both
impossible at 97 ms a frame and both comfortable at 2.2 ms. Multi-column also
cannot express the geometry: a multicol box balances its children across columns
and has no addressable cell, so "this card expands and its neighbours give way"
has nothing to attach to. The reading order improves as a side effect — multicol
reads column-major, down one column and across to the head of the next, where a
grid reads row-major, which is how the numbered channels 01 to 18 are read aloud.

**Alternatives considered.** *Keep multicol and make the peek cheaper* — there is
nothing to make cheaper; the cost is the balancing, which is what multicol is.
*Flex wrap* — gives no row structure to anchor an expansion to, and the same
ragged-height balancing problem. *Absolutely-positioned overlay for the expanded
card* — sidesteps layout cost entirely, but the design system forbids floating
and shadows (`.interface-design/system.md:19-22`) and the reader explicitly asked
for neighbours to give way rather than be covered.

**Consequence.** `.interface-design/system.md:578-587` documents the multicolumn
mechanism as a settled pattern, and workflow gate 8 requires the design system to
be corrected in the same change. This decision therefore edits that file rather
than leaving it describing a layout the console no longer uses.

### D2: three columns, and the desk widens to carry them

**Decision.** The grid is three columns at the desk's ordinary width, and `--desk`
grows from 436 px so a card is legible rather than 145 px.

**Rationale.** M4: three is the fewest columns that puts all eighteen closed cards
inside the scroller, and the row count is what decides that, so no amount of extra
width rescues two. 145 px has to carry a number, a name, a reading and an armed
marker; the existing folded index row does exactly that, but it does it across the
full width of a phone. Widening the desk is the only lever that makes the third
column comfortable.

**Alternatives considered.** *Two columns and accept a little scrolling* — fails
FR-001 by 107 px, which is a fifth of a screen and precisely the failure the
feature exists to remove. *Four columns* — fits at 348 px but gives a 109 px card,
narrower than several channel names. *Shrink the closed row below 57 px* — the row
carries a reading and a marker and the design system's spacing scale is
deliberate; buying a column back by crushing the row trades the thing that must be
legible for the thing that must be complete.

### D3: the animation is transform and opacity, and the layout change is not animated

**Decision.** What animates is the card's content arriving — opacity and a short
translate — and the chevron, on the house's existing 0.14–0.2 s ease scale. The
row-height change itself is not a transitioned property.

**Rationale.** Every transition in the stylesheet today is 0.14–0.2 s and touches
only colour, background, border-colour, opacity or transform; there is no
layout-animating precedent anywhere in the file, and the nearest analogue is
`.strip-chev`'s rotate (`index.html:3307`), which is transitioned and
reduced-motion guarded (`index.html:3310-3312`). Following that keeps the peek
inside a budget already proven on this page rather than inventing a motion
vocabulary. M5 says the layout change itself costs 2.2 ms and can simply happen.

**Alternatives considered.** *Transition `grid-template-rows: 0fr → 1fr`* — the
honest way to animate the give-way, and worth trying in the browser before
implementation; it is not chosen up front because it animates layout, which
nothing here does, and its cost across eighteen cards on a transit is unmeasured.
*Animate `max-height`* — the usual approach and the usual jank, and it requires a
guessed height that Air (1,419 px) would break. *No animation* — refused by the
reader, and rightly: M1 says a sweep crosses many cards, and un-animated that
reads as flicker.

**Left open deliberately.** Which of these two the give-way uses is the one thing
this plan does not settle from the desk. Both are cheap enough; the difference is
how it feels, and that is measured with a pointer rather than a stopwatch.

### D4: a card grows downward from its own top edge

**Decision.** An opening card expands in the block direction only. Cards earlier
in reading order never move; cards in the same row do not move; later rows move
down.

**Rationale.** This is the whole answer to FR-006. If a card grows in the inline
direction, it displaces its row-mates, and a card wide enough to displace them is
wide enough to move its own edge past the pointer — at which point the neighbour
peeks, which shrinks the first, which puts the pointer back on the first. Growing
only downward makes the card's top-left corner a fixed point, and a pointer that
arrived over the card is still over it after the expansion.

**Alternatives considered.** *Compress row-mates inline, as the proposal
described* — the literal reading, and the one that produces the oscillation above.
It can be made safe by anchoring the growth at the hovered card's leading edge and
never re-flowing the cards before it, and that variant is worth trying; it is not
the default because it has a failure mode and the block-direction version has
none. *Expand into a full row of its own* — reflows every card after it in the same
row, which is a lot of movement for a transient peek.

### D5: an opened card scrolls its own body

**Decision.** A card whose controls exceed the room keeps them behind its own
scroll rather than growing the grid without limit.

**Rationale.** M5: Air opened is 1,419 px against a 473 px scroller, three times
the room. Without a bound, opening Air pushes every later card three screens down,
and closing it snaps them back — under a *peek*, that happens as the pointer
passes. Bounding the card is what makes FR-010's "no scroll of the grid" and
FR-011's "all reachable, no truncation" hold together.

**Alternatives considered.** *Let the grid grow and scroll the scroller to the
card* — a scroll under a transient peek is exactly what FR-005 forbids. *Two
columns of controls inside a wide opened card* — halves Air to about 700 px, still
above the scroller, and reintroduces column-major reading inside the card.

### D6: search hides control rows, so every hideable row needs its `[hidden]` twin

**Decision.** A search reveals matching controls by hiding the non-matching rows
within an opened card, using the `hidden` attribute, and every class that both
sets `display` and is toggled this way gets its own `.class[hidden] { display:
none }` rule.

**Rationale.** The stylesheet already carries fifteen such twins
(`index.html:534, 708, 863, 1028, 1189, 1480, 1928, 2472, 2529, 2716, 3090, 3108,
3174, 3182, 3224`) because `all: unset` and any `display` declaration beat the
user agent's `[hidden]` rule outright — the defect CLAUDE.md records as
`#studies-stop` having rendered at all times. Using `hidden` also takes the hidden
rows out of the tab order, which FR-012 requires.

### D7: the edit list needs new code; nothing exported does this

**Decision.** A new exported function enumerates the desk's edits. It is not built
on `describeDesk`.

**Rationale.** `moved()` and `moves()` in `src/describe.js:77-95, 392` do rank by
distance from default, but both are file-private and both return *clauses about
topical clusters*, not controls — `describeDesk` is a sentence generator. The flat
identity diff that does enumerate keys is inline in `encodeState`
(`src/permalink.js:171`) and returns URL pairs. The shape this feature needs — a
control, its channel, its value, its default — exists nowhere.

**Alternatives considered.** *Export `moved`/`moves` from `describe.js`* — they
answer a different question and exporting them would couple a paragraph's ranking
to a list's contents. *Re-derive from `encodeState`* — parsing a query string back
into controls to avoid writing a loop over `ALL_KEYS`.

### D8: reveal state is remembered with the probe pattern already in use

**Decision.** Open/closed cards are stored in `localStorage` under a new versioned
key, obtained through the same probing accessor `main.js:4031-4040` uses for the
scheme shelf.

**Rationale.** That accessor round-trips a real `setItem`/`removeItem` before
handing the store over and returns `null` on throw, so private browsing and
site-data-off degrade to "not remembered" instead of failing to boot. Three keys
exist today (`shoebox-general-notes-v2`, `shoebox-drawn-by-v1`,
`shoebox.schemes.v1`); this is a fourth. A peek is never written (FR-015).

### D9: the general notes have one structural dependency and it will break

**Decision.** The `patch` note's `focus: '#desk .patch'` (`src/tour.js:97`) is
retargeted, and the `desk` note's copy is rewritten.

**Rationale.** This is the only selector outside `console.js` reaching into the
console's rendered markup; everything else in `main.js` goes through the
`mountConsole` API. `.patch` buttons live in the strip head today and are always
present; under a card grid a patch marker on a closed card must remain present or
that note loses its subject. `stage()` silently no-ops when the selector finds
nothing (`src/tour.js:172-173`), so this breaks without an error — the worst shape.
FR-037 and workflow gate 6 make the notes part of done regardless.

### D10: the design system gains a motion section

**Decision.** `.interface-design/system.md` grows a statement of the motion scale
and the card/grid pattern, in the same change.

**Rationale.** The file has **no** mention of motion, transition or animation
anywhere, yet the stylesheet has a consistent unwritten practice (0.14–0.2 s ease,
colour/opacity/transform only, never layout) that this feature both relies on and
extends. Workflow gate 8 says a pattern living only in a stylesheet rule is the
second source of truth Principle III forbids. The grid replaces a layout the file
currently documents as settled, so leaving it unedited would make it wrong twice.

### D11: this is built on the stack tip, not on `main`

**Decision.** Implementation branches from `004-choose-sweep-metric`, or from
`main` once PRs #46 and #47 have landed — not from `main` as it stands.

**Rationale.** PR #46 (`002-tm59-overheating`) targets `main`; PR #47
(`004-choose-sweep-metric`) targets #46. Relative to `main`, that stack changes
`src/console.js` by +449 lines, `src/main.js` by +1,452 and `index.html` by +479 —
the same regions this feature restructures. Building on `main` buys a merge of the
two largest files in the repository against a rewrite of their layout.

It also settles the counts. Measured by importing the declaration from each tree:

| tree | channels | controls | keys | control kinds |
|---|---|---|---|---|
| `main` | 18 | 123 | **138** | 8 |
| `004` head | 18 | 129 | **144** | 9, adding `pattern` |

The spec's "144 keys, 129 controls" is the stack tip, which is the tree this will
land on and therefore the right number to have written. FR-017 and SC-003 should
be read as "every key the declaration owns", and the figure re-counted at
implementation time rather than trusted from here.

## The search vocabulary, measured

Walked from the declaration on `main`:

| | |
|---|---|
| Distinct searchable strings | **486** |
| Total characters | **6,002** |
| Landmark attachments | 159, from 144 declarations, 15 shared between two controls |
| Selector option labels | 92 |
| Zero-stop labels | 22 |
| Distinct units | 18 — `m × °C W/m²K ° m²K/W ACH K m/s m²/pp W/pp W/m² lx L/s·pp kW /kWh gCO₂e/kWh days × floor` |
| Controls carrying `when` (withdrawable) | 26 |
| Controls carrying `needs` (dimmable) | 40 |
| Sweepable controls, which are the ones that can carry a study card | 85 |

Six kilobytes is not an index. A linear scan over the declaration answers every
keystroke, and no ranking structure, trie or worker is justified — which is the
answer to the only performance question the finder raises.

The 26 `when` and 40 `needs` counts are the size of FR-020's obligation: 66
controls can be in a state where a match must explain itself rather than simply
appear.
