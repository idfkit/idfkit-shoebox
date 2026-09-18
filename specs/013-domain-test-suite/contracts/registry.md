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

## The bijection against the prose

Separately, and this is the load-bearing one (research D-09): the same check reads
`CLAUDE.md`, extracts the top-level bullets of the section titled
`## Invariants that fail quietly`, and asserts a one-to-one correspondence with the
register by `Invariant.quote`.

```
tests/invariants.js declares 26 invariants.
CLAUDE.md § Invariants that fail quietly carries 26 bullets.
Every bullet is claimed by exactly one declaration.
Every declaration's quote opens exactly one bullet.
```

Each of the four failure modes has its own message, naming the bullet or the declaration:

```
not ok 2 - the register indexes the prose
  CLAUDE.md § Invariants that fail quietly carries a bullet no declaration claims:
    "A fifth weekday holiday is fatal; the grammar is closed at four and \"last\"."
  Declare it in tests/invariants.js with its quote, its evidence class and its tier.
  Recording a rule and enforcing it are one act (FR-026).
```

The same shape is applied to `.specify/memory/constitution.md`'s ten numbered gates.

**Why the quote and not an anchor**: the prose is what a human reads and what the project
treats as the statement of the rule. Putting `{#inv-north-axis}` markers into it would put
scaffolding in the document for the benefit of a machine. Quoting the opening clause gives
the same stability — reword the bullet and the check goes red — and costs the prose nothing.

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
