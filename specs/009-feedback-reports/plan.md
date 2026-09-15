# Implementation Plan: Feedback Reports

**Branch**: `009-feedback-reports` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-feedback-reports/spec.md`

## Summary

Readers can report a problem or an idea from the sheet in under two minutes, and the report carries what they were looking at: the link and build that reproduce the desk, the engine's error lines, the message in view, the browser and screen, the errors the page caught and the last twenty actions. The page builds the report as text, the reader reads every line of it, and one press opens a prefilled issue on the public tracker, which is the moment it leaves their machine. New issues are then sorted without a maintainer: a Claude model, paid for by a subscription and holding no tools and no writing credential, returns a verdict that a second step checks and applies as idfkit-bot, adding a folded starter paragraph for `/speckit-specify` to every feature request.

The approach, in dependency order:

1. **A DOM-free core.** `src/report.js` holds the typed records (report, captured item, trail, page error, hand-off) and the one body builder with its 5,500-character trim, so a Node harness exercises the real code.
2. **Make the sheet reportable when it is broken.** A second module entry, `src/report-sheet.js`, loads before `main.js`, traps page errors and wires the report. `main.js` catches its engine and schema loads (today they fail with no message), keeps the raw link before decoding it, registers `describeScreen()` and pushes the action trail from six places.
3. **The report sheet.** An in-flow section under the ledger's action row, never a dialog, with the preview, the opt-in files (a picture by the browser's own screen capture on desktops, the existing run bundle signed or unsigned, the report as a file) and the hand-off that copies as it opens.
4. **Triage.** `.github/workflows/triage.yml`: a context script builds the prompt from the constitution, `CLAUDE.md`, the spec index, the area roster generated from `CHANNELS` and the candidate duplicates; `claude-code-action` in automation mode returns a schema-checked verdict; the apply script validates it against the repository and labels and comments as idfkit-bot, once per issue, never overriding a human.

Decisions and their alternatives are in [research.md](./research.md) (R1 to R17).

## Technical Context

**Language/Version**: JavaScript, vanilla ES modules, no transpilation, for the page and for `scripts/triage-context.mjs` (Node 22). CommonJS for `.github/scripts/triage-apply.cjs`, as `github-script` requires. YAML for the workflow.

**Primary Dependencies**: none new at run time; `@idfkit/*` is untouched (Principle V). CI only: `anthropics/claude-code-action@v1`, `actions/create-github-app-token`, `actions/github-script`, `actions/checkout`, the last three already in use.

**Storage**: none. The report, the trail and the caught errors live in memory for the session. Secrets: `CLAUDE_CODE_OAUTH_TOKEN` (new, repository), `APP_ID` and `APP_PRIVATE_KEY` (existing, organisation).

**Testing**: no test runner. Two Node harnesses (body builder, verdict validator), the IDF byte-identity check from spec 007, the page driven at desktop and 390 px, and the workflow run by `workflow_dispatch` from the branch; see [quickstart.md](./quickstart.md).

**Target Platform**: static site in desktop and phone browsers; GitHub Actions on `ubuntu-latest`.

**Project Type**: single-page client-side application, plus repository automation.

**Performance Goals**: no engine time added. Opening the report reads state already in memory; the trail push is constant time; neither may delay a 50 ms design-day solve (FR-030). Triage labels a new issue within 10 minutes (SC-003).

**Constraints**: the page makes no request of its own (SC-006); the address is at most 5,500 characters; no dialog (design system); nothing on hover; no untrusted value in a shell; the model holds no tool and no writing credential.

**Scale/Scope**: 2 new page modules, about 6 call sites in `main.js`, 1 section and 1 button in `index.html`; 1 workflow, 2 scripts, 1 schema, 1 issue-template config; about 30 labels (3 buckets, 5 status and failure labels, 25 areas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.0.1. **Initial check: PASS, with Principle I needing the reading the spec asked planning to record; recorded below and in research R1.**

| Principle | Verdict | Basis |
| --- | --- | --- |
| I. Everything Runs in the Browser | PASS, with the recorded reading | The page issues no request (SC-006). The report reaches GitHub only when the reader presses the button that opens the tracker's tab, after reading every line, and the button says so (FR-015 as clarified). That is sharing, the same act as copying the share link, not an upload by the page. Triage runs in the repository, not the page. |
| II. Deterministic and Shareable | PASS | Nothing reaches `params`, the link or the IDF (FR-030, SC-009). The report reads the link through the share button's own builder. Its times are seconds since load, not a clock, and none of it reaches the document. |
| III. Read It Back Off the Model | PASS | Every captured fact is read from the state the sheet already letters from (research R4); the trail letters controls through their declaration's label and `formatValue`. No second source is added. |
| IV. No Silent Fallbacks | PASS, and improved | Missing values are em dashes; a trimmed log states its count; an unavailable picture states why; a failed triage is labelled with its reason. The engine and schema loads, which today fail silently, gain a stated refusal (research R5). |
| V. Only @idfkit/* at Runtime | PASS | No run-time dependency. The picture uses the platform's screen capture; the ZIP is the existing hand-written bundle. The action and its companions are CI tooling, which the principle exempts. |
| VI. Latency Is the Interface | PASS | No engine cost; opening a report never interrupts `pump()` or a study. |
| VII. Mobile-First and Responsive | PASS, with attention | One column at 390 px; the hand-off copies because the GitHub app blanks prefilled forms; the picture is unavailable on phones and says so. The sheet's form goes through `/interface-design:init` (gate 8). |

**Workflow gates.** Gate 6: the general notes are unchanged, since no step changes what it teaches; the report is not added as a step. Gate 8: the report sheet is a new component pattern, recorded in `.interface-design/system.md` in the same change. Gate 10: every page record is a class with frozen instances (data-model). Gate 9: comments carry the measurements that forced the decisions (the 6,050-character limit, the 404 on `labels=`, the parser that drops `--tools ""`).

**Post-Phase 1 re-check: PASS, no new violations, Complexity Tracking empty.** The design adds a second module entry; it is not a constitutional matter, and research R5 records why the error trap cannot live inside `main.js`'s module graph. The one external dependency the design rests on, Anthropic's confirmation that a subscription token may serve a workflow strangers can trigger, is an open item in the spec's Assumptions and gates shipping triage, not the page.

## Project Structure

### Documentation (this feature)

```text
specs/009-feedback-reports/
├── plan.md                         # This file
├── research.md                     # Phase 0: decisions R1 to R17
├── data-model.md                   # Phase 1: page records, verdict, labels, comments, states
├── quickstart.md                   # Phase 1: how to verify
├── contracts/
│   ├── report-body.md              # The body both halves agree on, and its parsing
│   ├── report-sheet.md             # The sheet: structure, copy, outcomes, keyboard
│   ├── triage-workflow.md          # Triggers, permissions, the two steps, guarantees
│   └── triage-verdict.schema.json  # The only output the reading step may produce
├── checklists/
│   └── requirements.md             # Written by /speckit-specify
└── spec.md
```

### Source Code (repository root)

There is no `tests/` tree; harnesses are throwaway.

```text
src/
├── report.js          # NEW. DOM-free: Report, CapturedItem, Trail, TrailEntry,
│                      #   PageError, ReportFile, Handoff; buildBody(), handoff(),
│                      #   the trim; the describeScreen() registry.
├── report-sheet.js    # NEW. Second module entry: error trap, the sheet, the
│                      #   picture, file saves, the hand-off; its copy asserted
│                      #   against copy.js at load.
├── main.js            # CHANGED. try/catch on the engine and schema loads; the raw
│                      #   hash kept before decode; describeScreen() registered;
│                      #   trail pushes at commit, patch, solve, attach, refuseLink,
│                      #   station refusal.
└── (others)           # UNCHANGED. model.js, controls.js, permalink.js, bundle.js
                       #   and every applier; SC-009 verifies it.

index.html             # CHANGED. The Report button in the action row, the report
                       #   section, its styles, and the second module script before
                       #   main.js.
scripts/
└── triage-context.mjs # NEW. Builds the triage prompt and compact schema.
.github/
├── workflows/
│   └── triage.yml     # NEW.
├── scripts/
│   └── triage-apply.cjs  # NEW. Validates the verdict; labels and comments.
├── triage/
│   └── verdict.schema.json  # NEW. Equal to the contract copy.
└── ISSUE_TEMPLATE/
    └── config.yml     # NEW. Blank issues on; "Report from the sheet" link.
.interface-design/
└── system.md          # CHANGED. The report sheet pattern.
CLAUDE.md              # CHANGED. One subsystem line; the secret and its yearly
                       #   renewal; the idfkit-bot Issues permission.
docs/design-notes.md   # CHANGED. The measured limits and the reasons in research.
```

**Structure Decision**: the page keeps its flat `src/` layout, adding one DOM-free module beside `readings.js` and `describe.js` and one entry module, because the report must stay reachable when `main.js` cannot start. Triage lives where the repository's other automation lives, in `.github/` and `scripts/`.

## Complexity Tracking

> No Constitution Check violations. This table is intentionally empty.

This plan ends after Phase 1 design. The next `/speckit-tasks` run derives `tasks.md` from these artifacts.
