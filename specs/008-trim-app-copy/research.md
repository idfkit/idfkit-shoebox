# Research: Trim the App's Copy

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-10

Every decision below is recorded as Decision, Rationale and Alternatives. The
facts they rest on come from reading the source at `e4b5a77`; line numbers are
given where a later task will need them.

## D1. One disclosure primitive: the native `<details>`, styled once

**Decision**: every fold this feature adds is a native `<details>` with a
`<summary>`, built by one DOM helper and styled by one shared class, `.fold`,
generalised from the scoreboard's existing `.why-fold`
(`index.html:1543-1572`, built at `src/main.js:5454-5463`). The marker is the
register's `+` closed and `-` open, as it already is on every fold on the page.

**Rationale**:

- `<details>` is keyboard-operable, announced as expandable by every screen
  reader, and needs no script to open. It satisfies FR-005 with nothing to
  maintain.
- The page already has seven folds (`.why-fold`, `.presets`, `.preset`,
  `.preset-fold`, `.notes`, `.study-quantity`, the strip folds) and each
  restates the same summary idiom in its own CSS block. Adding forty more
  sites that way would make the idiom the largest thing in the stylesheet.
  One class is the "declare it once" rule applied to the stylesheet.
- A press is not a hover. The constitution (Principle VII) forbids explanation
  that exists only on hover; the scoreboard's own comment at
  `index.html:1537-1540` already argues that a disclosure meets it.

**Alternatives considered**:

- *Tooltips or `title` attributes.* Forbidden by Principle VII and by
  `.interface-design/system.md:210`.
- *A `<button aria-expanded>` toggling a `hidden` region.* Reimplements
  `<details>` by hand, with the keyboard and announcement behaviour to get right
  and keep right.
- *A global "show explanations" switch.* Fails FR-004's "attached to the thing
  it explains": it opens every fold or none, so a reader who wants one method
  note gets two thousand words. It is also remembered state about how the page
  is read, which this sheet keeps only where a reader chose it explicitly.
- *Retrofit the existing seven folds onto `.fold`.* Desirable and out of scope:
  it moves CSS that works and changes nothing a reader sees. Recorded as a
  follow-up; `.why-fold` is the one exception, because it is the template the
  new class is lifted from and leaving both would be two sources of one rule.

## D2. Move the long form verbatim; write only the glance

**Decision**: the long text that exists today moves into its fold word for
word. The only new copy is the glance: the channel line, the note instruction,
the fold summaries, and the shortened ledes, refusals and standing sentences.

**Rationale**: FR-015 forbids new claims and forbids dropping a source. Moving
the long form verbatim makes both true by construction for every fold, and
confines review to the glances, which are short enough to be checked one by one
against the text they summarise. It also keeps the house's measured sentences
(the 81-word meter note on air energy release says something a shorter one
would get wrong) exactly where they are, one tap down.

**Alternatives considered**:

- *Rewrite everything shorter.* About 4,500 words of carefully measured prose
  to re-verify, for a gain the fold already delivers. Rejected.
- *Delete the long form.* The spec's first assumption rejects this; the user's
  complaint is about the screen, not the record.

The exception is text that states the same thing as another block (FR-013).
That is cut from all but one place; see D8.

## D3. Where the glance lives: on the declaration, as its own field

**Decision**: a glance is a field on the same declaration that owns the long
form, never a string in the renderer.

| Declaration | Glance (in view) | Long form (folded) |
| --- | --- | --- |
| `Channel` (`src/controls.js:1736`) | new `line` | existing `blurb` |
| `Control` (`src/controls.js:28`) | none; the label is the glance | existing `note` |
| `Meter` (`src/controls.js:1681`) | none; label and reading | existing `note` |
| `Readout` (`src/controls.js:1711`) | none | existing `note` |
| `Target` (`src/schemes.js:154`) | none; reading, line, verdict | existing `note` |
| `Note` (`src/tour.js:46`) | new `step` | existing `body` |
| `Qualification` (`src/tm59.js:622`) | none; the block has one summary | existing `says` and `because` |
| `requires` (plain object, e.g. `src/controls.js:3209`) | existing `reason`, shortened | none |

**Rationale**: Principle III says a control exists once and its label strings
are not restated elsewhere. A glance written in `console.js` would be a second
place for a channel's description, and the two would drift. A field also gives
the budget assertion (D4) something to walk.

**Measured**: the first sentence of every channel's `blurb` was counted by
importing `src/controls.js` in Node. 16 of the 18 are already 12 words or fewer
and already read as a glance ("The box itself.", "What the building
remembers."). Only two are over: `shading` at 25 words and `air` at 39. So
`line` is seeded by moving each blurb's first sentence out of the blurb and
into the new field, which both fills the glance and removes the duplication
the fold would otherwise open onto. Two lines are new copy.

**Alternatives considered**: *derive the glance at render time by cutting the
blurb at its first sentence.* It would work for 16 channels today and break
silently the first time a blurb is edited to open with a longer sentence, with
nothing to assert against. A declared field is checked at load; a derivation
is not.

## D4. Budgets are declared once and asserted at module load

**Decision**: a new DOM-free module, `src/copy.js`, holds a `Budget` class,
the frozen roster of budgets, the word counter, and `withinBudget(budget, where,
text)`, which throws naming the declaration, the count and the limit. The
declaring modules call it at load, following the existing pattern of
`assertHideable` (`src/controls.js:3066-3077`, invoked at `:4645-4646`) and the
bare assertion block in `src/tm59.js:707-720`.

Words are counted as whitespace-separated tokens after stripping markup, so
`1.80 W/m²K` is two words and a tour body's `<b>` does not count. The same
function is what the measurement script in
[contracts/measure.md](./contracts/measure.md) uses, so the assertion and the
success criteria count identically.

**Rationale**: FR-016 asks for the refusal at the moment a maintainer writes an
over-long string, and this codebase's answer to "a class of silent breakage" is
a throw at module load (workflow gate 5). A separate module is needed because
four declaring modules (`controls.js`, `schemes.js`, `tour.js`, `tm59.js`) need
the same counter and none of them should import another for it.

**Function-valued reasons**: several `requires.reason` values are functions of
`(params, on, off)` (Air's three ways to be blocked). A function cannot be
measured at load. Each such function is refactored to choose among declared
string constants on the channel, and the constants are asserted. The function
still decides which one applies; it no longer composes text.

**Runtime-composed text is measured, not asserted**: the bill lede, the finding
tail, status lines and absence reasons are composed in `src/main.js` at render
time from run data. Throwing mid-render over the length of a sentence would
turn a copy defect into a broken sheet, which is worse than the defect. These
are held to their budgets by the measurement script at several desk positions
(quickstart step 4) instead.

**Alternatives considered**:

- *Put the counter in `controls.js` and import it elsewhere.* `tour.js` and
  `tm59.js` would then import the whole control declaration for one function.
- *Check budgets in a harness only.* Passes today and drifts next month; the
  spec's fourth story exists to prevent exactly that.

## D5. The budgets

**Decision**, taken from the spec's assumptions and fixed here:

| Budget | Words | Applies to |
| --- | --- | --- |
| `STRIP_LINE` | 12 | `Channel.line` |
| `STEP` | 15 | `Note.step`, the general notes lede |
| `STANDING` | 15 | `requires.reason` constants, blocked notes, refusals |
| `ABSENCE` | 12 | an absence reason beside an em dash |
| `SUMMARY` | 6 | any fold's `<summary>` |
| `BLOCK` | 25 | one block's explanation in view; a page lede |
| `CHASE` | 20 | the Chase sentence above the board |
| `DESCRIPTION` | 60 | description and finding together |
| `CEILING` | 40 | any single visible block (measured, never asserted) |

**Rationale**: the numbers are the spec's starting points, checked against
what exists. 12 words holds 16 of the 18 channel first sentences as they stand
(D3), so it is a limit the current voice already keeps rather than one it has
to be forced into. 15 is a single instruction with its object. 25 is one
sentence with room for a clause. Whether 12 words sets on one line in the
console at the strip's type size is not yet measured and is checked when the
pattern is drawn (quickstart step 8); if it does not, the number moves in this
table and in `src/copy.js` together. `CEILING` is measured only, since a block
is a rendered thing and not a declaration.

## D6. Open folds survive a redraw, and nothing else remembers them

**Decision**: the scoreboard, the TM59 block and the finding are rebuilt from
scratch on every run (`renderScore` at `src/main.js:5374`), and a design day
lands every 50 ms during a drag. A fold opened by the reader would snap shut on
the next solve. Each fold therefore carries a stable key (`data-fold`, for
example `target:phi-heat` or `ctl:wallR`), and the renderers keep a module-level
`Set` of open keys: filled on `toggle`, read back when the fold is rebuilt. It
lives in memory for the session and nowhere else.

**Rationale**: the study quantity chooser already solves the same problem for
its one fold (`src/console.js:2269-2287`), so the idea is not new here, only
its reach. FR-007 keeps fold state off the link and out of every reading, and
Principle II agrees: how the sheet is being read is not what the building is.

**Alternatives considered**:

- *`localStorage`.* A reader who opened a method note last week does not expect
  it open today, and a returning reader would meet an inconsistent sheet.
- *Do not rebuild; patch in place.* Rewrites the scoreboard's renderer, which
  is out of scope for a copy change.

## D7. The three "printed in place" rules are kept, in a smaller form

`CLAUDE.md` names three texts that must be printed in place: the Chase
explanation, the TM59 qualifications, and the balance rail's sign convention.

**Decision**:

- **Chase**: one sentence of at most 20 words stays in view above the board. The
  marker's `aria-label` and `title` keep their full wording, since those name
  five otherwise identical buttons when read aloud.
- **TM59 qualifications**: the block's `<summary>` states the count in view
  ("Four reasons this is not a TM59 assessment"), and the `dl` of `says` and
  `because` sits inside the fold unchanged. The module-load assertion that at
  least four standing qualifications exist is kept, and the summary reads its
  number off the list rather than typing it.
- **Rail sign convention**: stays in view, shortened from 36 words to at most
  25.

**Rationale**: each rule was written against hover, not against folding; the
scoreboard's `.why-fold` already folds TM59 derivations under the same
argument. `CLAUDE.md` and `.interface-design/system.md` are updated in the same
change to say that an in-view summary plus an in-place fold is "in place".

## D8. What is cut as a duplicate

**Decision**, per FR-013, each explained once in view:

- **"A count of lines, not a result against the method"** is said three times:
  in the chase line's TM59 tail (`src/main.js:5775-5776`), in the TM59 count
  row (`src/main.js:5317`), and in the `procedure` qualification
  (`src/tm59.js:675-676`). The chase line keeps its first clause, in view: the
  comment at `src/main.js:5764-5769` argues, rightly, that the reader dragging a
  slider never scrolls down to the board. Its second clause, pointing at the
  block below, is cut. The count row's copy is cut, since the qualifications
  fold now carries it.
- **"TM59 is assessed room by room ... no worst room to find"** closes the count
  row (`src/main.js:5317-5319`) and is, nearly word for word, the `one-zone`
  qualification's `says` (`src/tm59.js:645-646`). Cut from the count row.
- **The count row's criterion c sentence** (`src/main.js:5310-5314`, about 60
  words) is *not* a duplicate: no qualification says why criterion c stands
  outside the count. It moves into a fold on the count row, summarised
  "Criteria c and d", verbatim.
- **"Eighteen channels in the order the physics happens"** opens both the desk
  subtitle (`index.html:4645`) and the general notes' `desk` body
  (`src/tour.js:99`). The subtitle keeps it; the note's `step` becomes the
  instruction and its body drops the sentence.

The Chase explanation itself appears in view only in the register lede
(`index.html:4404`) and in the marker's `aria-label` and `title`; it is not
repeated in the general notes, so D7's treatment of it is all that applies.

Anything else found during the rewrite that repeats a neighbour is listed in the
pull request, not cut silently.

## D9. The description and finding: two moves, and the method folds

**Decision**: `describe.js` lowers `MOVES` from 3 to 2 (`src/describe.js:660`)
and keeps `MOVE_WORDS` at 36. In the finding, the reading sentence stays in view
and the explanatory tails at `src/main.js:6448-6498` ("Demand intensities need a
run period to read over, a sizing day is a condition...") move into a fold under
the paragraph, summarised "Why this reading".

**Rationale**: the source inventory estimates the paragraph at 70 to 90 words,
against a budget of 60. Dropping one move and folding the tail removes, by the
same estimate, one 10 to 20 word move and a 25 to 40 word tail, which should
land under 60. That is an estimate from source strings, not a measurement of
rendered paragraphs; quickstart step 4 measures it at four desk positions, and
if it lands over, `MOVE_WORDS` is the next lever. Ranking is unchanged, so the
two moves shown are the two highest-ranked of the three shown today.

**Alternatives considered**: *shorten `MOVE_WORDS`.* The 36-word cap bounds the
sentence carrying the moves, not their count; cutting it truncates the
description of whichever move wins rather than choosing fewer.

## D10. Order of work follows the spec's priorities

The console (story 2) and the sheet (story 1) are both P1 and independent: one
touches `controls.js` and `console.js`, the other `main.js`, `schemes.js`,
`tm59.js` and `index.html`. Both depend on `src/copy.js` and on the `.fold`
pattern, which are therefore first. The tour (story 3) follows, then the load
assertions for every budget (story 4), which can only be switched on once every
declared string fits.

Workflow gate 8 applies: the `.fold` pattern is visual work, started with
`/interface-design:init` and recorded in `.interface-design/system.md` in the
same change. `/speckit-tasks` should place it before any fold is wired.

## D11. No model, link or reading moves

**Decision**: verified rather than assumed. The build-positions harness from
`specs/007-upgrade-idfkit-js/verify/build-positions.mjs` serialises the IDF at
eight desk positions; it is run before and after, and the files must be
byte-identical (SC-008). Every existing permalink decodes to the same state,
because no key, default or range changes and `LINK_VERSION` does not move.
