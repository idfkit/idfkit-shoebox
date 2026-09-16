# Specification Quality Checklist: Attach a Weather File

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-16
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

Three decisions shaped the whole spec and were put to the author rather than
guessed at, and their answers are recorded in the Clarifications section:

1. What a shared link does when the desk was run against a file the link cannot
   carry (FR-018 to FR-020). Principle II makes this the feature's sharpest
   tension: a licensed file is not the reader's to redistribute, and a desk that
   cannot be reproduced is an anecdote.
2. Whether the browser remembers an attached file between sessions (FR-021).
3. Where design days come from when a purchased EPW arrives without a DDY
   (FR-009). Principle IV forbids the shipped Denver design days standing under
   a British title block, so the only choices were a DDY beside the file or no
   design days at all.

Two wordings were checked against the house style rather than left as written:

- "upload", in the user's description, is a word this page cannot use. Nothing
  is uploaded; the file is read where it already is. FR-002 states this as a
  requirement rather than leaving it to the interface copy.
- The spec states no relation between an attached file and what TM59 requires
  (FR-012, FR-015, SC-008), because the page cannot check provenance and a claim
  it cannot check is one it must not make. This matches the stance already
  written into `src/tm59.js`.
