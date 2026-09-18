# Contract: the register, `covers()`, and the coverage record

**Feature**: `013-domain-test-suite`

How a check says which rule it enforces, and how the suite notices a rule with no check or a
check with no rule. This is the contract that makes FR-006, FR-026 and FR-030 structural
rather than diligent.

---

## `covers(id, name, fn)` — `tests/support/register.js`

```js
export function covers(id, name, fn) { … }
```

- `id` — an `Invariant.id`, `Gate` number as `GATE-n`, `Expectation.id` or `Refusal.id`.
- `name` — what this particular check asserts, in the project's own words.
- `fn` — an ordinary `node:test` test body.

It declares `test(`${id}: ${name}`, fn)` and nothing more. The id is in the test name, so
every reporter, every CI annotation and every mutation run carries it without further
machinery.

**The first argument must be a string literal.** Not a variable, not a template, not a
member expression. This is a custom lint rule, because the static discovery pass below
reads source rather than running it, and a computed id would be invisible to it.

## Static discovery

A fast-tier check walks `tests/**/*.test.js` and `eslint-rules/*.js`, collecting:

- every string literal passed as `covers`' first argument;
- every `meta.docs.invariant` on a custom ESLint rule.

That set is the claim side. The rule side comes from `tests/invariants.js` and
`tests/gates.js`. The check then asserts, in both directions:

| Assertion | The drift it catches |
| --- | --- |
| every `Invariant` with `evidence !== 'unexecutable'` is claimed at least once | a rule with no check |
| every claimed id resolves to a declared `Invariant`, `Gate`, `Expectation` or `Refusal` | a check enforcing a rule nobody declared, or a typo in an id |
| every `Invariant` marked `unexecutable` carries a reason and is claimed by nothing | an unexecutable entry quietly counted as covered |
| every `Gate` is claimed or is `evidence: 'human'` with a reason | FR-008 |

## The correspondence checks

The register↔prose bijection the first draft of this contract specified is **gone**, with the
prose it ran against (research D-09). Three checks stand where it did.

### 1. Register against checks — the bijection that survived

This is the pair that can actually disagree, and the assertions are the four in the table
above, run in both directions. A declared invariant claimed by nothing is red; a claimed id
no declaration resolves is red. Nothing reads `CLAUDE.md`.

```
not ok 2 - every declared invariant is enforced by a check
  tests/invariants.js declares an invariant no check claims:
    INV-fifth-weekday-holiday
  Write its check and claim it with covers('INV-fifth-weekday-holiday', …),
  or declare it unexecutable with a reason.
  A rule the suite does not enforce is a rule nothing states (FR-006).
```

### 2. The section stays gone

`CLAUDE.md` and `docs/design-notes.md` carry no heading matching `Invariants that fail
quietly`, and no document in the repository restates one of the rules in its own words
(FR-030a, SC-020). Deleting the section once is a commit; keeping it deleted is a check,
because a habit of thirteen features will otherwise grow it back one bullet at a time.

```
not ok 5 - no invariant is stated outside the check that enforces it
  CLAUDE.md carries a heading matching "Invariants that fail quietly".
  A rule stated in a document and in an assertion is two statements of one rule.
  State it beside the check that enforces it (FR-030a).
```

### 3. Every claiming check carries its reasoning

The discovery pass is already parsing `covers()` call sites to read their first argument, so
it also asserts a comment node immediately precedes each call claiming an `INV-` id, and
that a custom ESLint rule enforcing one carries `meta.docs.description` (FR-030, SC-019).

Presence is decidable and is checked. Whether the comment *justifies* the rule rather than
*narrating the assertion* is not decidable, and is recorded as a human act beside gate 9 —
which makes the same distinction about the same thing, and is the honest place for it.

### 4. The gates, against the constitution

Unchanged, and deliberately so: `Gate.quote` holds each numbered gate's opening sentence
verbatim and the check asserts one-to-one correspondence with
`.specify/memory/constitution.md`, so amending a gate's wording without revisiting its check
is a failure.

The asymmetry with the invariants is the spec's own. The constitution is ratified governance
text amended by a stated procedure, not a working note that may be relocated into a test
file, and a gate is a rule about how the project works where an invariant is a rule about how
the software behaves. Only the second can be stated as an assertion.

**What this costs, stated once.** No list remains for the suite to diff itself against.
Nobody can record an invariant without enforcing it, and equally nobody is told they have
failed to record one. Structural where it applies, silent where it does not.

## Enumerated declarations

The same "notice the member with no check" pass runs over the project's own declarations
(FR-026). For each, the register records how a member is claimed:

| Declaration | Where | How a member is claimed |
| --- | --- | --- |
| `CHANNELS` | `src/controls.js` | a `DeskPosition` covering it, and — unless `prices: true` — an `Expectation` |
| every control key | `src/controls.js` | a codec round trip (FR-011) and, for a `Ruled` face, a lettering check in both systems (FR-012) |
| `KINDS` | `src/units.js` | a lettering check, and a difference check where `deltaKindOf` returns a different kind |
| landmark lists | `src/controls.js` | reached by `readLandmarks`' four rules, asserted as a check rather than only at page load (FR-015) |
| `PRESETS` and their `Target`s | `src/schemes.js` | a conformance check |
| `Budget` roster | `src/copy.js` | its `asserted: true` members checked, its `asserted: false` members listed |

A new member with no check fails by enumeration — the contributor is told what they now owe
the suite, which is US7's whole content.

## The coverage record

Produced by `verify`, printed, written to the CI job summary, **not committed**.

```
Invariants          26 declared
  executed          21
  structural         5   (their subject is in src/main.js — see research D-04)
  unexecutable       0
Gates               10 declared
  executed           8
  human              2   (design-system review; driving the page)
Principle VII        2 claims recorded unexecutable
  readable at 390 px       a machine can measure a viewport, not readability
  nothing on hover         the claim is about what a reader can reach

Proof run           2026-09-18, 26/26 mutations turned the suite red for their own invariant

Line coverage       src/**  —  reported, compared with nothing
```

A row's evidence class is the honest part. `structural` is not a synonym for `executed`, and
the record says which five they are and why, so nobody has to reconstruct the argument.
