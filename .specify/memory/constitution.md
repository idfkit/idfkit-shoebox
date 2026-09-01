<!--
Sync Impact Report
==================
Version change: none (unfilled template) -> 1.0.0
Bump rationale: initial ratification. The prior file was the unmodified scaffold
with every placeholder intact, so there is no earlier governed version to
increment from. This document is still being drafted; changes made before it is
first adopted are folded in here rather than recorded as amendments.

Principles defined (all new):
  I.   Everything Runs in the Browser (NON-NEGOTIABLE)
  II.  Deterministic and Shareable (NON-NEGOTIABLE)
  III. Read It Back Off the Model
  IV.  No Silent Fallbacks
  V.   Only @idfkit/* at Runtime
  VI.  Latency Is the Interface
  VII. Mobile-First and Responsive

Sections added:
  - Core Principles (replaces the five placeholder slots; expanded to seven)
  - Technology and Delivery Constraints (was [SECTION_2_NAME])
  - Development Workflow and Quality Gates (was [SECTION_3_NAME])
  - Governance (filled)

Sections removed: none.

Follow-up TODOs: none. No placeholder tokens remain.
-->

# idfkit-shoebox Constitution

## Core Principles

### I. Everything Runs in the Browser (NON-NEGOTIABLE)

This is a static site. The building model is generated, the IDF is written, and
EnergyPlus is run entirely on the reader's own machine, against the WebAssembly
build of the engine staged into `public/energyplus/`.

- There MUST be no simulation server, no compute endpoint, and no upload of a
  model, an IDF, a result file, or a parameter set to any service.
- The published artifact MUST be servable as static files from object storage
  behind a CDN. Any feature requiring a request/response service at run time is
  out of scope, whatever its convenience.
- The only network requests permitted at run time are for the site's own static
  assets and for public climate data (`/onebuilding`), and the latter MUST carry
  nothing about the reader's model beyond the station they picked.
- Persistence is the reader's own browser (`localStorage`, the URL fragment) and
  nowhere else.

Rationale: the privacy claim is the product. A modeller can put a real building
on this sheet because nothing about it ever leaves the machine, and that claim
is only credible if it is structural rather than a policy somebody administers.

### II. Deterministic and Shareable (NON-NEGOTIABLE)

The same URL MUST reproduce the same drawing, the same IDF and the same numbers
in any browser, on any machine, at any time.

- The URL fragment carries the whole desk: parameters off their defaults, patch
  state, station by WMO number, weather window, and the pinned hour. Anything
  that changes a result MUST be encoded there.
- Nothing that reaches the IDF may come from a source the link cannot carry.
  Wall-clock time, `Math.random`, locale, viewport, user agent, and feature
  detection MUST NOT reach the document.
- The link format is versioned and delta encoded, so an omitted key means the
  default as of that version. Changing a default, renaming a key, or narrowing a
  range MUST bump `LINK_VERSION`, freeze the outgoing defaults into
  `DEFAULTS_BY_VERSION`, and add a `MIGRATIONS` step. Adding a control is free.
- A link that cannot be honoured MUST be refused whole, with the reason stated
  on the sheet, never half loaded.
- Every parameter MUST be a scalar. Four separate mechanisms depend on it: the
  commit guard, the identity diff in `encodeState`, the one value per key rule in
  `decodeState`, and `revert`. A list valued control carries canonical text and
  parses at the boundaries.

Rationale: a shared reading that cannot be reproduced is an anecdote. This is
what lets one modeller send another a building rather than a screenshot.

### III. Read It Back Off the Model

Everything drawn on the sheet MUST be read back off the `IDFDocument` that was
handed to the engine. Never letter the page from a variable when the model holds
the answer.

- Geometry, quantities, boundaries, orientations, construction properties and
  climate MUST be measured from the document or from the run, not from live
  `params`. A sample, a study overlay or a stale solve makes `params` and the
  document disagree, and the document is what was simulated.
- A control exists exactly once, as a declaration in `src/controls.js`. The
  console draws it, the model applies it, the sheet reads its stops, and the link
  codec validates against it. Markup, defaults and label strings MUST NOT be
  restated anywhere else.
- Every figure lettered on the page MUST be traceable to an object in the
  document, a series in the results, or arithmetic over those, and any claim
  about the world (a landmark, a rate, a target) MUST cite its source in place.

Rationale: two surfaces stating the same fact from two sources will drift, and
the drift is silent. One source cannot.

### IV. No Silent Fallbacks

When a code path cannot get what it needs it MUST throw, naming the specific
thing that was missing, and the caller MUST refuse the whole operation and say
so in the interface.

- Do not substitute a previous value, a default, or a nearest match. A station
  whose design conditions cannot be read is refused entirely rather than run
  against another city's.
- A reading with no data behind it renders as an em dash and stays out of every
  total. Zero is a measurement; missing is not one.
- A refusal MUST state why, in place on the sheet, and MUST offer what would fix
  it where there is such a thing.
- Declaration errors MUST throw at module load rather than degrade at run time.

Rationale: this sheet's only value is that its numbers mean something. One
quietly substituted value costs that for every number on the page.

### V. Only @idfkit/* at Runtime

Runtime dependencies MUST come from `@idfkit/*` and from nothing else.

- Adding any other run-time dependency requires an amendment to this
  constitution, recording what was needed and why it could not be written here or
  contributed upstream to an `@idfkit/*` package.
- Build and deployment tooling is exempt: Vite and the AWS SDK are development
  dependencies and reach no reader.
- Platform APIs are preferred to packages. `DecompressionStream`, `URLSearchParams`
  and inline SVG are used precisely so that a compression library, a router and a
  chart library are not.

Rationale: the engine and schema bundle already cost tens of megabytes at the
edge, and this page's whole argument is that a serious simulation needs no stack
under it. Every added dependency is weight on a cold visit and one more thing
between the reader and a reproducible result.

### VI. Latency Is the Interface

A design day solves in about 50 ms once the engine is warm. That is a design
budget, not a footnote, and features MUST be built to spend it.

- A control that changes the model SHOULD re-solve live during the gesture at
  design-day cadence, and once on release at annual cadence.
- Solves are latest wins, never queued: whatever the controls show when the
  engine comes free is what gets solved, and shapes passed through during a drag
  are skipped. Studies MUST run on their own pool so the live sheet never queues
  behind a sweep.
- A run in flight MUST NOT blank the sheet. The blocks a run letters stand with
  the previous run's numbers, dimmed if the desk has moved past them, and are
  cleared only where they actually stop being true.
- Anything that reaches the IDF MUST live on `params`, or it will move the
  drawing and never be simulated. Anything on `params` that does not reach the
  IDF MUST be declared on a `prices: true` channel, or it will start runs that
  change nothing.
- New output requests MUST stay zone level or site level. Per surface variables
  took one annual run from 681 ms to 2,984 ms.

Rationale: instant feedback turns a parameter into something a reader can
actually think with. Guarding the budget is what keeps that true as the sheet
grows.

### VII. Mobile-First and Responsive

Every reading MUST be readable at 390 px wide without opening, scrolling
sideways, or hovering.

- No reading, control or explanation may exist only on hover. `pointer: coarse`
  has no hover, so a hint that floats does not exist on a phone.
- Layout thresholds are declared once, in the stylesheet, and read back by
  script through a custom property. Modules ask which layout they got; they do
  not restate the number as a media query string.
- Where a table cannot keep its columns, a row folds into a block and every
  figure keeps the head it was under, set where the cell is built so the words
  over a column and beside a figure are one string. Nothing is dropped and
  nothing scrolls out of sight.
- Folding MUST use the `hidden` attribute so folded controls leave the tab
  order, and table semantics MUST be restated explicitly wherever `display: grid`
  drops implicit roles.
- Shortage of height is shortage of room. Breakpoints MUST consider both
  dimensions.

Rationale: the sheet is read on a phone on a site visit as often as on a desk,
and a reading that cannot be read is not a reading.

## Technology and Delivery Constraints

- **Stack**: vanilla ES modules, Vite, and `@idfkit/*`. No framework, no
  bundled UI library, no CSS framework.
- **Engine and schemas**: `predev` and `prebuild` stage the engine assets, the
  schema bundle and the station index into gitignored directories under
  `public/`. A fresh clone MUST run one of the npm scripts before the page loads.
- **Asset resolution**: the engine, schema bundle and station index MUST resolve
  against `import.meta.env.BASE_URL`, so a pull request preview reports on its
  own build. `/onebuilding` is root absolute, being a distribution behaviour
  rather than a published file.
- **Compression is the build's job, not the edge's.** The CDN skips objects over
  10 MB and content types off its list, which is exactly the engine and the
  schema. Files that carry a `.gz` name and are inflated in page MUST NOT be
  served with `Content-Encoding`.
- **The sheet stamps its own revision.** A page served as static files cannot
  ask what produced it, so the tag or the version plus short sha is frozen in at
  build time. A build that cannot read its revision stamps `+unknown`; it MUST
  NOT look like a tagged release.
- **Interface work goes through the design system, and the design system is a
  file.** `/interface-design:init` is how visual work on this page is started and
  how the system is revised. `.interface-design/` holds the result, with
  `system.md` as its current statement: direction, surface and ink scales, border
  weights, typography, spacing, and the component patterns this page has settled
  on. It MUST be read before any visual change and it is the authority on that
  change, not the stylesheet it produced. Standing rules from it: four surfaces on
  one hue, hairline borders and no shadows, one accent plus a cold and warm pair
  reserved for signed physical quantities, inputs darker than their surroundings,
  and colour MUST NOT be the only carrier of a fact, so sign, direction and state
  are stated in words as well.
- **EnergyPlus version**: 26.1.0, as bundled by `@idfkit/engine-assets`. Field
  names drift between versions, so they MUST be checked against the schema or the
  `.rdd` rather than recalled.

## Development Workflow and Quality Gates

There is no test runner and no linter. Verification is done by throwaway Node
harnesses under a scratch directory, and the following gates apply to any change
that can reach the model, the link, or a reading.

1. **Model changes are verified outside the browser first.** Build the document
   at several console positions, write each IDF to disk, and run it. EnergyPlus
   26.1.0 locally, or the staged WebAssembly engine under Node where none is
   installed.
2. **Idempotence is asserted.** `applyModel` runs on every parameter change, so
   applying it three times MUST produce byte identical output. A channel that
   sweeps names MUST take its abandoned objects out of the document, verified by
   serialising a shrunk desk against one built at the smaller size.
3. **Every IDF is validated and run.** Schema validation, then integrity check,
   then simulation. Output variable names are confirmed against the run's `.rdd`,
   and `eplus.err` is grepped for "requested but not generated".
4. **Codec changes are round tripped.** Every key encodes and decodes exactly,
   and every malformed input class is refused.
5. **Declaration invariants throw at module load**, and new ones are added
   whenever a class of silent breakage is found rather than documented and hoped
   for.
6. **The general notes are part of done.** Any change that adds a feature,
   renames a control, moves a step's subject or changes what a step teaches MUST
   update `NOTES` in `src/tour.js` and the reporting call sites, and MUST bump the
   storage key where the steps change meaning.
7. **The page is then driven.** A design day solves in about 50 ms, so the whole
   desk is exercised quickly and there is no excuse for not doing it.
8. **Interface changes are made against the design system, not against the
   markup.** Visual work is started with `/interface-design:init`, and any new
   token, component pattern or layout threshold MUST be recorded in
   `.interface-design/system.md` in the same change that introduces it. A pattern
   living only in a stylesheet rule is the second source of truth that Principle
   III forbids, in the one place the model cannot arbitrate.
9. **Comments explain why, not what.** The house style is prose recording the
   reasoning, and frequently the measurement or the error message that forced the
   decision. Match it.
10. **Prefer typed objects.** Classes with constructors and frozen instances over
    loose dictionaries, especially for declarations.

## Governance

This constitution supersedes other practices for this repository. Where a
convention documented in `CLAUDE.md` or `.interface-design/system.md` conflicts
with a principle here, the principle governs and the document is corrected.

**Amendment procedure.** An amendment is proposed as a pull request that changes
this file, states which principle is affected, and records the reasoning and any
measurement behind the change. Amendments that relax a NON-NEGOTIABLE principle
or add a run-time dependency MUST additionally record what was tried first and
why it did not work. Merging the pull request ratifies the amendment.

**Versioning policy.** This document is versioned MAJOR.MINOR.PATCH:

- MAJOR: a principle is removed or redefined in a way that permits what it
  previously forbade.
- MINOR: a principle or section is added, or its guidance materially expanded.
- PATCH: clarification, wording, or a correction that changes no rule.

Every amendment updates the version line and the last amended date in the same
commit.

**Compliance review.** Every pull request is reviewed against these principles.
The reviewer checks in particular that: nothing reaching the IDF has escaped
`params` or the link, no new run-time dependency has been added, no reading is
lettered from a variable the document could answer, no failure path substitutes a
value instead of refusing, and no new reading is unreachable at 390 px or exists
only on hover. Complexity that cannot be justified against a principle here is
removed rather than explained.

**Runtime guidance.** Two documents carry the working detail and are the
operational companions to this one, each kept current as part of any change it
describes. `CLAUDE.md`, at the repository root and in the workspace above it,
holds the architecture, the measured invariants and the failure modes that cost
real debugging. `.interface-design/system.md`, authored and revised through
`/interface-design:init`, holds the design system. Where either conflicts with a
principle here, the principle governs and the document is corrected.

**Version**: 1.0.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-01
