# Phase 1: Data Model

**Feature**: Upgrade to idfkit-js v0.3.0-rc.3 | **Date**: 2026-09-09

This feature adds no entity to the running page. Nothing new reaches `params`,
the document, the link or a reading. What follows are the four things the
*verification* reasons about, written down because three of them were vague
enough in the specification to be argued about later.

## Toolkit pin

The declared acceptable version of one idfkit package, in `package.json`.

| Field | Value | Rule |
| --- | --- | --- |
| `name` | `@idfkit/core`, `@idfkit/schemas`, `@idfkit/weather` | The three that move. `@idfkit/engine` and `@idfkit/engine-assets` are pins of the same shape and are deliberately not touched. |
| `range` | the exact string `0.3.0-rc.3` | No range operator. A caret or a tilde on a prerelease is a build whose stamped toolkit is not reproducible. |

**Validation**: after installing, exactly one copy of each package must resolve.
More than one is the failure with no error message: `scripts/copy-schemas.mjs`
stages the top-level schema bundle while a nested copy could be what the parser
reads.

**Relationship**: `@idfkit/core@0.3.0-rc.3` declares `@idfkit/schemas` at exactly
`0.3.0-rc.3`, so the schema pin is not independent. It moves in lockstep or the
tree splits.

## Resolved toolkit version

The version actually present in the install tree, read at build time out of
`node_modules/@idfkit/core/package.json` by `scripts/toolkit.mjs`, frozen into
the build as `__IDFKIT_VERSION__`, and read back by `src/version.js`.

| State | What the sheet letters | Rule |
| --- | --- | --- |
| A version string | that string, in the IDF header and the bundle manifest | The resolved version, never the range. `^0.1.0` is what the page would accept; `0.1.0` is what it bundled, and only the second is a fact about the file in the reader's hand. |
| Unreadable | an em dash | No default is substituted. A file that cannot say which toolkit wrote it is missing a fact, and missing is not a version. |

**State transition**: this is the one reader-visible change in the feature. Every
IDF the page hands out goes from naming `0.1.0` to naming `0.3.0-rc.3`.

**Note for the harness**: under Node, `__IDFKIT_VERSION__` is undefined and the
stamp is an em dash on both sides of the comparison, which is what isolates the
model from the stamp without having to filter for it.

## Written model, and what "the same" means

The IDF text `writeIdf` returns for one desk position. Two of these are compared,
one per toolkit, and the comparison has three levels because the upgrade makes
two differences on purpose.

| Level | Definition | Expectation |
| --- | --- | --- |
| **Raw** | byte equality | Differs at every position. Recorded, never gated on. |
| **Content** | equality after collapsing the run of whitespace before each `!-` to one space | **The gate.** Any difference here is a failure. |
| **Order** | the sequence of type-name lines | May differ, at positions where a type is swept by an earlier channel and written by a later one. Where it differs, the engine-level check below is required. |

The normalisation is deliberately the smallest one that admits the corrected
comment column and nothing else. Comparing parsed documents instead was rejected
in research Decision 2: it would also absorb a real change in how a value is
written.

## Run comparison

What is asserted about a pair of runs when the order level differs.

| Field | Source | Expectation |
| --- | --- | --- |
| Exit code | the process | equal, and 0 |
| `eplusout.eso` | the run directory | byte-identical between the pair |
| `eplusout.mtr` | the run directory | byte-identical between the pair |
| Warning and severe counts | the last line of `eplusout.err` | equal |

An IDF is declarative input and EnergyPlus does not read object order, so this is
expected to pass. It is asserted anyway, because "expected to pass" is the
category of claim this repository exists not to print.

## Desk position

A complete set of parameters and patch state: what a permalink carries, and what
the comparison is run over.

The eight in the harness are chosen for what they make the appliers **sweep**,
not for what the building looks like, because the behaviour under test is
registration order and only a channel that clears a type nothing has yet added
can show it.

| Position | Why it is in the set |
| --- | --- |
| Default | The desk almost every reader sees. |
| Fabric bypassed | The channel whose absence sends every surface adiabatic, which is what withdraws the openings. |
| Glazing bypassed | Removes a whole family of window types from the document. |
| System, Gains, Air each bypassed | One applier out at a time, each owning types no other applier writes. |
| Every channel engaged | The only position that exercises every applier at once, and the one that showed the reordering. |
| Every channel bypassed | The floor: what survives when nothing is in the path. |

**Validation at every position**: applying the model three times must serialise
identically to applying it once. Idempotence is asserted on both toolkits, not
just the new one, because a baseline that is not idempotent is not a baseline.
