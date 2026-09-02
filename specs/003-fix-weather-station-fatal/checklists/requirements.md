# Specification Quality Checklist: A station with incomplete design conditions is refused, not run

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

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### Validation record

The spec was written once and then reviewed against each item above. All items
pass. Three things were checked deliberately, because they are the ones a spec
of a bug fix usually gets wrong:

1. *No implementation detail.* The requirements name "a station's published
   design conditions" and "a published period" rather than the file format, the
   field names, or the function that reads them. The one place a technical term
   appears is the evidence note below, which is a record of the reproduction and
   not a requirement.
2. *Success criteria are observable by a reader.* SC-003 sets no internal
   millisecond budget; it says the attach takes no longer than it does today and
   makes no additional request, which someone can check from outside.
3. *Scope is bounded and the boundary is stated.* Whether a station can be
   attached for its weather year alone, with no design conditions, is the one
   decision that would move this from a bug fix to a feature. It is decided
   against in the first assumption, with the reason, rather than left implicit.

The judgement call carried forward is that first assumption: scope was settled by
following the project's existing rule that a station whose design conditions
cannot be read is refused, rather than by asking. It is stated where a reviewer
will see it and is cheap to reverse before planning.

### Evidence behind User Story 1

The defect was reproduced before the spec was written, so the scenarios describe
measured behaviour:

- Searching `Boston` against the shipped station index ranks WMO 994971 first
  (score 0.890), ahead of Boston-Logan 725090 (0.871).
- That site's published design conditions carry the literal text `N` where a
  wetbulb temperature and a wind speed belong, and name no annual cooling design
  day, only a January one.
- Handed to EnergyPlus 26.1.0, that design day produces two severe errors and
  then `** Fatal ** Errors occurred on processing input file. Preceding
  condition(s) cause termination.`, exiting 1 before any environment starts. This
  is the message in the report.
