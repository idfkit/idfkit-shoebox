# Contract: the runner and its tiers

**Feature**: `013-domain-test-suite`

The project's external interface for this feature is a set of npm scripts and their exit
statuses. This is what a contributor types, what CI runs, and what US1's "one command" means.

---

## Commands

| Command | Runs | Needs | Budget |
| --- | --- | --- | --- |
| `npm run verify` | `fast`, then `model`, then `engine` | everything below | 20 min |
| `npm run verify:fast` | the fast tier, including lint and format | `npm install` | 60 s |
| `npm run verify:model` | writing, validating and goldening the documents | `npm install` | 5 min |
| `npm run verify:engine` | real runs, readings, expectations, refusals | `npm run predev` staged, fixtures present | 15 min |
| `npm run verify:proof` | the declared mutations (research D-11) | as `verify` | none stated; hours |
| `npm run lint` | ESLint over `src/`, `scripts/`, `tests/`, `infra/` | `npm install` | — |
| `npm run format` | Prettier, writing | `npm install` | — |
| `npm run format:check` | Prettier, checking only | `npm install` | — |

`npm run verify` is the single documented command FR-001 asks for. It reports one overall
verdict and one exit status; the per-tier verdicts are printed above it.

`lint` and `format:check` are also **inside** `verify:fast`, not only beside it. FR-033 is
explicit that agreeing a rule and enforcing it are one act, so there is no arrangement in
which a contributor runs the checks and not the linter.

## Exit statuses

| Status | Meaning |
| --- | --- |
| `0` | every tier that was asked for ran, and passed |
| `1` | a check failed |
| `2` | a tier was refused for a missing prerequisite |
| `3` | a tier ran and passed but exceeded its stated budget |

`2` and `3` are distinguished from `1` because they are different sentences to the person
reading them: `1` says the change is wrong, `2` says the machine is not ready, `3` says the
suite has outgrown its own budget and that is a defect in the suite (FR-002).

There is no status that means "passed, with checks skipped". `node:test`'s `skip` is not
used and its presence is itself a fast-tier failure (SC-011).

## Refusing a tier

A tier declares prerequisites as probes. A failed probe prints, on stderr, and exits `2`:

```
<tier> tier refused: <what is missing, by path>.
<the command that produces it, and what else that command stages>
```

No check in that tier runs, nothing is reported as passing, and the overall verdict is
`fail`. This is Principle IV applied to the suite: the caller refuses the whole operation
and says why, and no previous result stands in.

Probes, by tier:

- **fast** — `node_modules/eslint`, `node_modules/prettier`, `node_modules/jsdom`.
- **model** — `node_modules/@idfkit/schemas` resolves and `localBundle()` yields `26.1.0`.
  A schema bundle that loads at a different version is a refusal, not a silent pass:
  field names drift between versions and a suite that validated against 26.0 would be
  asserting the wrong document.
- **engine** — `public/energyplus/energyplus.js` exists, and the vendored climate fixtures
  resolve.

## Reporting

`--test-reporter=spec` locally, `--test-reporter=tap` in CI with the GitHub summary written
beside it. Every failing check's name begins with the id of the invariant, gate, expectation
or refusal it enforces, because `covers()` put it there (contracts/registry.md), so the
first line of a failure names the rule and where it is written down before it names an
assertion (FR-025).

Example of the shape a failure must have:

```
not ok 7 - INV-span-is-a-difference: a face's remaining room is lettered as a difference
  CLAUDE.md § Invariants that fail quietly
  Expected the span of 5 K to letter as "9 °F", got "41 °F".
  A span takes deltaKindOf, never quantityKind. See units.js Ruled.spanKind.
```

## The network

No check may make a network request. This is enforced rather than intended: every tier runs
with an undici global dispatcher that throws on any request, and the `engine` child process
(contracts/engine.md) is started the same way. A check that tried to fetch a climate file
fails naming the host it reached for (FR-005).

## Coverage

`verify` passes `--experimental-test-coverage` with
`--test-coverage-include='src/**'`. The figure is printed and written to the CI job summary.
No threshold is passed, no job fails on it, and `--test-coverage-lines` and its siblings are
not used anywhere (FR-031, SC-018).

## Determinism of the runner itself

`verify` run twice on an unchanged checkout must produce identical verdicts (SC-012). Three
things make that true and each is asserted:

- **No wall clock, time zone or locale reaches a check.** Tiers run under `TZ=UTC` and
  `LC_ALL=C`, and the determinism check (FR-010) additionally re-runs the document build
  under `TZ=Pacific/Kiritimati` and a non-English locale and compares bytes.
- **No ordering dependence.** `node:test` runs files concurrently; no check may depend on
  another file having run. The scratch directories are per-run and per-position.
- **No shared engine state.** One process per simulation (contracts/engine.md).

## CI

`.github/workflows/check.yml` gains:

| Job | Runs | On |
| --- | --- | --- |
| `verify-fast` | `npm ci && npm run verify:fast` | `pull_request`, `push` to `main` |
| `verify-full` | `npm ci && npm run predev && npm run verify:model && npm run verify:engine` | `pull_request`, `push` to `main` |

`verify-full` deliberately stages the engine on a runner with no EnergyPlus installed, which
is how SC-007 is demonstrated rather than asserted.

A third workflow, `proof.yml`, runs `npm run verify:proof` on a weekly schedule and on
`workflow_dispatch`, and writes the result into its job summary.

**Not in this repository**: marking `verify-fast` and `verify-full` as required checks is a
branch-protection setting. It is listed in the plan as a hand-off, not claimed as delivered.
