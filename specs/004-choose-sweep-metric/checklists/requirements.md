# Specification Quality Checklist: Choose what a sweep plots

**Purpose**: Validate specification completeness and quality before proceeding to planning

**Created**: 2026-09-02

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

Two things were checked against the code rather than assumed, because getting
either wrong would have put a promise in the specification the sheet cannot keep:

- **Unmet hours do not exist as a reading.** They were named in the request. A
  search of the source finds the phrase only in prose about the ideal unit; nothing
  computes them. So they are named in the edge cases and in the assumptions as a
  separate feature rather than folded into this one's candidate set, and no
  requirement promises them.
- **The candidate set is real.** The quantities the offer draws on — the zone
  temperature extremes, TEDI, CEDI, EUI, the exceedance frequency, the peak heating
  and cooling loads, the three TM59 criteria, and the bill's cost and carbon — are
  each read off a run on the sheet today.

One decision was taken rather than deferred. The request left it open whether the
chosen quantity rides the permalink; FR-022 settles it that it does, on the ground
that a shared link arriving as a curve of a different quantity is the same silent
substitution the whole feature exists to remove.

Two named-but-declined scope expansions, recorded so a later reader does not think
they were missed: this feature adds no new reading, and it does not touch what the
scoreboard, schedule or bill letter.
