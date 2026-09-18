# Phase 1 — Data model: the declarations the suite is built from

**Feature**: `013-domain-test-suite` | **Date**: 2026-09-18

The suite is declarative in the same way the sheet is: a small number of frozen typed
objects, each validated in its constructor so a malformed declaration throws at module load
rather than producing a check that quietly asserts nothing. The house rule from the
constitution's tenth gate — *classes with constructors and frozen instances over loose
dictionaries, especially for declarations* — applies to the suite's own declarations, which
is also the first proof that the gate can be executed.

Every type below is DOM-free and network-free.

---

## `Invariant` — `tests/invariants.js`

One per invariant this feature inherits from the prose section it replaces. It neither
restates the rule nor points at a document that does: after this feature the rule is stated
exactly once, by the check that enforces it and the comment beside it (research D-09,
FR-030a). What remains here is a roster entry — an identifier and what kind of proof the
suite has for it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string`, `INV-kebab-case` | stable name a failure message carries, and the only handle between roster and check |
| `evidence` | `'executed' \| 'structural' \| 'unexecutable'` | what kind of proof the suite has |
| `reason` | `string \| null` | required when `evidence === 'unexecutable'`, forbidden otherwise |
| `tier` | `'fast' \| 'model' \| 'engine' \| null` | which tier owns its check; `null` only when unexecutable |

There is deliberately **no `quote` and no `where`**. Both existed to tie a declaration to a
bullet in `CLAUDE.md`; the bullets are gone, and a field restating the rule in the roster's
own words is precisely what FR-030a forbids.

**Validation** (all throw at load):

- `id` matches `/^INV-[a-z0-9-]+$/` and is unique across the register.
- `evidence === 'unexecutable'` requires a `reason` and forbids a `tier`; any other value
  requires a `tier` and forbids a `reason`. An unexecutable entry with no reason is the
  thing FR-006 forbids, so it cannot be constructed.

The `id` is the whole contract, so it is chosen to read as a name rather than a number —
`INV-temperature-difference`, not `INV-17`. A failure message names it, and the check it
resolves to is where the rule is written down.

**State**: none. The register is recomputed on every run, in the spirit of
`conformance()` — nothing is remembered.

**Relationships**: `Invariant` ← *claimed by* → one or more `Check`s, discovered
statically (contracts/registry.md). `Invariant` ← *broken by* → at most one `Mutation`.

## `Gate` — `tests/gates.js`

One per numbered gate in the constitution's Development Workflow and Quality Gates section.

| Field | Type | Meaning |
| --- | --- | --- |
| `number` | `1..10` | the gate's number in the constitution |
| `quote` | `string` | the gate's opening sentence, verbatim |
| `evidence` | `'executed' \| 'human'` | executed by the suite, or remaining a human act |
| `reason` | `string \| null` | required when `evidence === 'human'` |
| `tier` | tier name or `null` | as `Invariant` |

`Gate` **keeps its `quote`**, and a correspondence check runs against
`.specify/memory/constitution.md`, so amending a gate's wording without revisiting its check
is a failure (FR-008). The asymmetry with `Invariant` is deliberate and is the spec's own:
the constitution is ratified governance text amended by a stated procedure, not a working
note that may be relocated into a test file, and a gate is a rule about how the project
works where an invariant is a rule about how the software behaves. Only the second can be
stated as an assertion, so only the second was moved into one (research D-09).

## `DeskPosition` — `tests/support/desk.js`

A named building configuration. This is the suite's unit of "a model", and everything in
the `model` and `engine` tiers is indexed by it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string`, kebab-case | names the golden file and appears in every failure |
| `title` | `string` | one line, what this position is for |
| `params` | frozen object | overlay applied over `DEFAULT_PARAMETERS`; scalars only |
| `patching` | frozen object | channel id → `true` (engaged) or `false` (bypassed) |
| `covers` | `string[]` | channel ids this position is the representative for |
| `simulated` | `boolean` | whether the `engine` tier runs it (FR-017's "stated subset") |
| `environment` | `'design-day' \| 'annual'` | what the engine tier runs it over |

**Validation**: every key in `params` exists in `DEFAULT_PARAMETERS` and every value is a
scalar (the constitution's Principle II clause, asserted rather than assumed); every id in
`patching` is a declared channel; `covers` names only channels the position actually
engages or bypasses distinctly.

**The representative set** (FR-016: every channel in both its engaged and bypassed state).
Eighteen channels are declared, `00` through `17`; six of them are not bypassable
(`massing`, `site`, `plant`, `tariff`, `solver`, `run`) and two of those six are priced and
reach no IDF object. The set is therefore built as:

| Position | What it is for |
| --- | --- |
| `baseline` | every channel at its declared default — the reference the goldens and the expectations move from |
| `bare` | every bypassable channel bypassed — the smallest document the desk can write |
| `engaged-<channel>` × 12 | `bare` plus exactly one bypassable channel engaged, so a channel's contribution to the document is isolated |
| `full` | every channel engaged, every sweeping channel at its maximum (`SKY_MAX`, `PANE_MAX`) |
| `shrunk` | `full`, then the sweeping channels reduced — the shrink claim of FR-009 compares this against a position built small |
| `built-small` | the same configuration as `shrunk`, built from defaults rather than reduced |
| `sealed` | the nearly sealed box: a refusal scenario, expected to fail warmup, and expected to fail *for that reason* |
| `north-turned` | orientation off the default, so the compass-word and normal-measuring rules have a position that would catch a fixed-axis assumption |

Nineteen positions. Every one is written, validated and goldened in the `model` tier;
`simulated: true` on `baseline`, `bare`, `full`, `north-turned`, `sealed` and the six
`engaged-*` positions whose channel carries a physical expectation, which is the stated
subset FR-017 asks for.

## `Check` — a convention, not a class

A check is an ordinary `node:test` test declared through one wrapper:

```js
// Lettered through `temperature` a delta carries Fahrenheit's 32, so `+1 °C` read
// `+33.8 °F` on the sheet. Three separate routes reached this trap — a schedule's
// delta, a span along a face, a change in a reading — and each was found by a reader
// noticing an impossible figure rather than by anything in the repository.
covers('INV-temperature-difference', 'a delta lettered in IP carries no 32', (t) => { … })
```

`covers` does two things and nothing else: it prefixes the test name with the id so every
reporter carries it (FR-025), and its literal first argument is what the static discovery
pass greps for (contracts/registry.md). It deliberately holds no runtime registry —
`node:test` runs each file in its own process, and a cross-process registry would be
machinery in place of a `grep`.

**The comment above the call is part of the check**, and after this feature it is the only
statement of the rule anywhere (FR-030, SC-019). It carries the measurement, the error
message, or what the bug cost — never a narration of what the assertion does, which would be
the second statement of the rule in the one place nothing can catch it. The discovery pass
asserts a comment is *present* on every call claiming an `INV-` id; whether it justifies
rather than narrates is a human act, recorded as such beside gate 9.

## `Mutation` — `tests/mutations/`

The declared breakage that proves a check (research D-11).

| Field | Type | Meaning |
| --- | --- | --- |
| `invariant` | `string` | the `Invariant.id` this breaks |
| `file` | `string` | repository-relative path |
| `find` | `string` | an exact substring, which must occur **exactly once** in the file |
| `replace` | `string` | what it becomes |
| `expect` | `'fails'` | the only permitted value; there is no mutation that is expected to pass |

**Validation**: `find` occurring zero or more than once is a failure of the mutation, not of
the suite — the declaration has gone stale against a refactor and says so by name.

## `Expectation` — `tests/engine/expectations.js`

A physical claim about the building (research D-12).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | names the claim in the failure |
| `channel` | `string` | the channel it exercises; SC-010 counts one per model-reaching channel |
| `from` | `DeskPosition.id` | the basis |
| `move` | frozen object | the parameter overlay applied to the basis |
| `reading` | `string` | which reading is compared, by the name `readings.js` gives it |
| `direction` | `'up' \| 'down'` | which way the reading must move |
| `band` | `[number, number]` | inclusive fractional change, both positive, `min < max` |
| `because` | `string` | the physical reasoning; non-empty, asserted at load |

**Validation**: `band` members positive and ordered; `because` non-empty; `from` names a
declared position; `channel` names a declared channel that reaches the IDF — a `prices:
true` channel cannot carry an expectation, because no run changes when it moves.

**Sixteen channels reach the model** (eighteen less `plant` and `tariff`), so SC-010's floor
is sixteen expectations.

## `Refusal` — `tests/engine/refusals.js`

The mirror of `Expectation`: a configuration the model is meant to refuse (FR-020).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | names the scenario |
| `setup` | `DeskPosition.id` + overlay, or a fixture path | what is attempted |
| `refusedBy` | `'requires' \| 'throw' \| 'engine'` | where the refusal happens |
| `naming` | `string` | a substring the refusal's message must contain — what was missing |

A `Refusal` passing is the scenario refusing **for the stated reason**. A scenario that
fails for a different reason is a failure of the suite, which is what stops
`refusedBy: 'engine'` from degenerating into "something went wrong".

## `Fixture` — `tests/fixtures/`

Vendored input, with a manifest so its provenance is not folklore.

| Field | Type | Meaning |
| --- | --- | --- |
| `path` | `string` | under `tests/fixtures/` |
| `origin` | `string` | where it came from, e.g. the onebuilding path and the date it was taken |
| `licence` | `string` | why it may be in this repository |
| `trimmed` | `string \| null` | what was cut, when it is not the whole file |

**Validation**: a fixture with no `origin` cannot be declared. FR-041 is enforced by a check
rather than by care: no fixture may carry TM59 table content, asserted by comparing against
`src/tm59.data.js`'s generated values.

## `ExpectedDocument` — `tests/goldens/<id>.idf`

Not a class: a file. The serialised document a `DeskPosition` writes, compared byte for
byte, regenerated only under `UPDATE_GOLDENS=1`, reviewed as an ordinary diff (research
D-07). One per position, nineteen files.

## `Tier` — `tests/support/tiers.js`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `'fast' \| 'model' \| 'engine' \| 'proof'` | |
| `glob` | `string` | the test files it runs |
| `budget` | `number` (seconds) | 60, 300, 900; `proof` has none and is not run on a change |
| `prerequisites` | `Prerequisite[]` | each a probe plus the remedy sentence |

A tier that exceeds its budget reports it as a failure of the suite (FR-002). The measured
time is written into the verdict either way, so the budget is watched rather than
discovered.

## `CoverageRecord` — produced, not stored

Computed on every `verify` run from the register, the static discovery pass and the last
recorded proof run. It is printed, written to the CI job summary, and **not committed**: a
committed copy would be the second statement of a fact the declarations already hold.

Rows: every `Invariant` and every `Gate`, each with its evidence class, the checks that
claim it, and — for invariants — the date its mutation last proved it red. The two
unexecutable Principle VII claims appear with their reasons.

It is a roster of **identifiers, evidence classes and tiers**, and holds no statement of any
rule — which is what keeps it from being the second source FR-030a forbids. A row says that
`INV-temperature-difference` is executed in the fast tier and last proved red on a date. It
does not say what the rule is; the check does.

Beside it, and separately, the line coverage figure from
`--experimental-test-coverage`, reported and compared with nothing (FR-031, SC-018).

## `StyleRule` — `eslint.config.js` and `.prettierrc.json`

Not a class either: a rule is on, or it is off with a comment beside it giving the reason.
A fast-tier check reads the config and asserts that every explicitly disabled rule — every
entry set to `'off'` or `0`, and every `eslint-disable` comment in `src/` — has a reason on
the line above or on the comment itself (SC-017). This is the one place the suite checks a
configuration file rather than the source, and it is there because FR-034 makes the reason
part of the rule rather than a courtesy.

## `Verdict` — the runner's output

Per tier: `pass` or `fail`, the count of checks, the elapsed time, and whether the budget
held. Overall: `pass` only when every tier that ran passed **and** every tier ran. A refused
tier makes the overall verdict `fail`, never `pass with notes` — FR-004 again.

Exit status: `0` for pass, `1` for a failed check, `2` for a refused tier, `3` for a budget
exceeded. Distinguishing the last two is what lets CI tell "this change is broken" from
"this runner is misconfigured", which are different messages to a contributor.
