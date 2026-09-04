# Specification Quality Checklist: Console Findability

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-03
**Revalidated**: 2026-09-03, after the card grid and reveal amendment
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

Passed on all three validation passes. The spec now carries **37 requirements** and **17
measurable outcomes** over three stories: the grid (P1), search-as-reveal (P2) and the edit
list (P3).

**Both open decisions are settled**, so nothing is waiting on `/speckit-clarify`:

- *The entry gesture* is the console button that already exists at the foot of the title
  block, labelled *Model console · Every control on the desk*. The grid is what is inside
  the console; nothing new stands in front of it.
- *The peek* is wanted. A fine pointer passing over a card opens it and passing off closes
  it, animated, and that browsing gesture is the point rather than a side effect to be
  suppressed. Principle VII is satisfied by the reveal rather than by the peek: click, tap
  and keypress reach the same state, and a coarse pointer or a keyboard never sees a peek at
  all.

**The four requirements most likely to be argued with in planning**, because they constrain
the interaction rather than describe it:

- **FR-006** — a peeking card must stay under the pointer as it expands. This is the one
  that decides whether the gesture works at all. If expansion pushes the card far enough
  that the pointer lands on a neighbour, the neighbour peeks, which moves the first card
  back, which puts the pointer on the first card again. Where the expansion is anchored is
  the whole answer.
- **FR-008** — the animation has a budget set by the reader's own pace, not by taste. A
  sweep across eighteen cards must leave nothing still finishing.
- **FR-011** — Air holds 18 controls, Gains 15, Glazing 12. A card opened at those sizes
  needs an answer that is neither truncation nor sideways scrolling, and it needs it for a
  peek as well as for a reveal.
- **FR-016** — the balance rail reads five channels at once and is not one of the eighteen.
  A grid that absorbed it as a nineteenth card would lose the only reading about the desk as
  a whole.

**Two smaller things worth holding on to:**

- **"Card", "peek" and "reveal" are new vocabulary** and are defined in Key Entities so they
  mean one thing throughout. "Console", "channel", "control" and "patch" are the product's
  existing words, not implementation detail.
- **SC-005 and SC-006 need a baseline measured before implementation begins**, since the
  page sends nothing anywhere and there is no instrumentation to read a "before" from
  afterwards. Capture the current time-to-first-edit and first-attempt success rate in the
  same session format the target will be measured in.
