# Specification Quality Checklist: Overheating risk to CIBSE TM59

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

Validation history:

- **Iteration 1**: three issues found and fixed:
  1. *Implementation leak*: an early draft named specific output variables,
     module names and the register's class names in the requirements. Moved to
     the Assumptions section as statements about what the run already carries,
     phrased as capability rather than as code.
  2. *Untestable requirement*: "the assessment must be honest about its limits"
     had no acceptance criterion. Replaced by FR-014 through FR-019, each naming
     a specific qualification that must appear, and by SC-005, which is countable.
  3. *Unbounded scope*: the draft was ambiguous about whether the feature would
     obtain design summer year weather. Now stated as out of scope in Assumptions,
     with FR-015 requiring the consequence to be printed instead.

- **Iteration 2**: one issue found and fixed:
  4. *Missing edge cases*: the running mean's start-of-run history, the split-run
     calendar, the zero denominator and the operative/air temperature distinction
     were all unaddressed. Added as edge cases with FR-008, FR-012 and FR-013.

- **Iteration 3** (`/speckit-clarify`, 2026-09-01): five questions asked and
  answered. All three items previously carried as open scope decisions are now
  settled, one of them against the earlier default:
  1. *Own weather files*: split out as a separate companion feature rather than
     widening this spec. FR-015 rewritten and FR-015a added so no statement here
     is written against a fixed assumption about the attached weather.
  2. *Overall verdict*: the earlier absolute ban is **relaxed**. A plain count of
     cleared criteria is now permitted (FR-017a), though no pass or fail word may
     attach to the method's name. FR-017b defers the membership of that count to
     the plan phase and the TM59 documentation itself.
  3. *Room type*: confirmed as no desk state. FR-003 now requires the night
     criterion to be read on every run that can answer it, stating its own
     presumption, with FR-003a forbidding a room-type control.
  Two further decisions were taken that the earlier draft had left as open edge
  cases: the running mean is seeded from the weather file rather than from within
  the run (FR-008, FR-008a, FR-013), and the figures table is now explicitly
  marked provisional and subordinate to the source documents.

## Remaining risk

The largest is now concentrated in one place: the "Published figures" table is a
provisional secondary-source reading of TM52 and TM59, and the spec's criteria,
limits, assessment periods and the membership of the cleared-criteria count all
rest on it. The reader has stated they will supply the TM59 documentation at
`/speckit-plan`, which is where that table is to be replaced. Until then, treat
every figure in this spec as subject to correction and none of it as citable.
