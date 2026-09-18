# Specification Quality Checklist: An executing verification suite for the model

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 3 (2026-09-18)** — all items still pass after a fourth clarification.
The single authored statement of each invariant moves into the check that enforces it,
and `CLAUDE.md`'s "Invariants that fail quietly" section is removed rather than kept in
sync (FR-006, FR-029, FR-030, FR-030a, SC-002, SC-019, SC-020).

This strengthens the "no implementation details" item rather than threatening it: the spec
now states *where a rule lives*, which is a content decision, and no longer implies a
synchronisation mechanism between two documents.

One consequence is recorded in Edge Cases rather than smoothed over: with the prose gone,
nobody can record an invariant without enforcing it, and equally nobody is told they have
failed to record one. The guarantee becomes structural where it applies and silent where
it does not.

Downstream artifacts now disagree with the spec and need revising: research D-09 ("The
prose is the register; the suite indexes it") is overturned, plan.md's second summary
decision with it, and tasks.md's T027, T041–T044 and T105.

**Iteration 2 (2026-09-18)** — all items pass. The three open scope questions were
answered and the answers are recorded under Clarifications, Session 2026-09-18:

- Static analysis is in scope — a linter and a formatter, not type checking
  (FR-032 to FR-036, Story 1 scenarios 5 and 6, Story 4 scenario 6, SC-015
  to SC-017).
- Coverage is the simulation-domain modules plus all 26 recorded invariants
  wherever they live, interface modules included for those entries only
  (FR-037 to FR-039).
- Coverage figures are reported and never blocking (FR-031, SC-018).

Requirements renumbered to stay contiguous: FR-001 to FR-041, SC-001 to SC-018.

**Iteration 1 (2026-09-17)** — 15 of 16 passed; three [NEEDS CLARIFICATION]
markers remained, all of them scope questions whose answers changed the size of
the work rather than its direction.

Two deliberate notes on the "no implementation details" item, unchanged from
iteration 1:

- The spec names the EnergyPlus 26.1.0 schema and the WebAssembly engine, and
  names specific source documents (`CLAUDE.md`, the constitution). These are the
  subject matter of the feature — the thing being verified and the record being
  enforced — not a choice of technology for building it. No test runner,
  assertion library, linter, formatter, coverage tool or CI product is named
  anywhere; FR-032 and FR-034 describe what static analysis must do and how its
  rules must be chosen, not which tool does it.
- SC-002 and SC-004 cite counts (26 invariants, 10 gates) taken from the
  repository as it stands. These are measurements of the existing record, and
  make the success criteria countable rather than aspirational.

A conflict with the project constitution is recorded in the spec's Overview and
Dependencies rather than hidden: its Development Workflow section currently
states that there is no test runner and no linter, and amending it — retiring
both halves of that sentence — is in scope under FR-029.

Ready for `/speckit-plan`.
