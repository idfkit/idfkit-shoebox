# Specification Quality Checklist: Natural ventilation by pressure network

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-01
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

All items pass. Both clarifications were resolved by the requester:

1. **Where the two models live**: a selector on the strip that already owns outdoor air,
   following the glazing strip's simple-versus-layered arrangement. Folded into the
   Overview, Story 1, Story 2, FR-001 through FR-004a, and the Key Entities. The
   consequence worth carrying into planning is that the scheduled model stays the default,
   so the link format needs no version bump and no migration step: new keys are free under
   delta encoding.

2. **Units for envelope leakiness**: air changes per hour, with the derived leakage figure
   lettered beside it and the arithmetic shown. Folded into FR-005, FR-005a, FR-005b,
   FR-013 and SC-003a. The consequence worth carrying into planning is that three figures
   now stand for one question (stated, given, produced), and the specification requires
   them to be visibly distinct as settings and a reading.

On implementation detail: the specification names physical and engine-level constraints
(a 10 degree horizontal limit, a conditional setpoint requirement, a 2.6 times annual
cost) because they bound what the reader can be offered, not how it is built. The engine
object names that produced those facts are confined to the Research Findings appendix,
which exists because the project constitution requires every claim to cite its source in
place. Each of the nine findings was measured by running the model, not read from a
reference.
