# Quickstart: verifying Feedback Reports

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

There is no test runner. These are the checks that prove the feature, in the order they can run. Harnesses are throwaway and live in the scratch directory, not the repository.

## Prerequisites

- `npm install` and `npm run dev` (stages the engine, schemas and station index).
- Node 22.
- For the workflow: the branch pushed, `CLAUDE_CODE_OAUTH_TOKEN` set as a repository secret, idfkit-bot granted Issues read and write, and the Anthropic terms question in the spec's Assumptions answered.

## 1. The body builder under Node (FR-005 to FR-017, SC-007)

`src/report.js` is DOM-free. A harness imports it and builds bodies from fixture reports:

- a design-day desk with no failure; an annual run that fatalled with 400 log lines; a refused link; a report with every removable item removed; a description long enough that nothing fits.

Expect:

- The first line is `<!-- shoebox-report v1 -->`, and every section in [contracts/report-body.md](./contracts/report-body.md) appears in order.
- No line outside the fenced log block contains a newline inside a paragraph.
- Every missing value is `—`; no field reads `0` where the fixture had nothing.
- The 400-line case produces an address of at most 5,500 characters, removes the oldest lines, and states the count.
- The "nothing fits" case produces the short body naming the report file.
- Removed items appear only under "Removed by the reporter".
- The signature, a kept-scheme name and fixture coordinates planted in the fixture's environment never appear in any body.

## 2. The verdict validator under Node (FR-021 to FR-029)

`triage-apply.cjs` exports its validator. A harness feeds it:

- a valid bug verdict; a valid feature verdict with one conflict; a verdict with both `bucket` and `needs_person`; unknown areas; a duplicate number that does not exist; a conflict naming a principle not in the constitution; a `starter` on a bug; malformed JSON; an empty string.

Expect every invalid case to be refused or trimmed with the dropped parts listed, the malformed and empty cases to fall to `needs a person` with a reason, and no case to throw.

## 3. Nothing reaches the model or the link (SC-009)

Run the IDF byte-identity harness from spec 007 at the default desk and three others, before and after. Load a set of saved links that between them move every channel off its default, before and after. Expect identical IDFs and identical desks.

## 4. Drive the page (stories 1, 2, 4 and 5; SC-001, SC-006, SC-008)

At desktop width, with the network panel open and recording:

1. Default desk, first run landed. Press **Report**, type one sentence, press **Open on GitHub**. Expect a new tab with the title and body prefilled, the clipboard holding the same body, and zero requests from the page during the whole flow. Time it (under 2 minutes, at most three presses besides typing).
2. Hand-edit the link to put heating above cooling, load it, and report. Expect the failure sentence and the severe lines in the log section.
3. Open the link from step 1's body in a private window on the stated build. Expect the same desk, station, weather window and pinned hour (story 2).
4. Start a study, open the report while it runs. Expect the study's progress in "On screen" and the solve not interrupted.
5. **Picture of the sheet**: the picture shows the sheet, not the report. **Run files** with a signed sheet: both buttons, and the preview's signature note.
6. Break the engine: rename `public/energyplus/` and reload. Expect the status line's new refusal, and a report that opens, carries the boot failure and hands off.
7. Load a malformed link. Expect the report to carry it exactly as typed.

At 390 px wide, and with the keyboard alone: repeat step 1. Expect one column, the picture offer disabled with its reason, every control reachable, and outcome lines announced.

## 5. Run triage from the branch (story 3; SC-003 to SC-005, SC-010)

`issues` events use the default branch's workflow, so the branch is tested with `workflow_dispatch`:

```bash
gh workflow run triage.yml --ref <branch> -f issue=<n> -f mode=triage
```

against test issues opened for the purpose: a report from step 4.2 (bug), a feature request, a question, a near copy of issue #21, a hand-filed issue, and a feature request the constitution rules out ("save my models online").

Expect, for each run:

- One bucket label or `needs a person`, `from the sheet` or `no captured context`, and failure labels parsed from the body.
- The duplicate names #21.
- The feature requests carry one folded starter comment; the ruled-out one opens by naming Principle I and what an amendment would argue.
- The run's `execution_file` shows an empty tool list in its `system/init` entry.
- The action accepted the schema. If it rejects a keyword (a length limit, a pattern, a `null` type), drop that keyword from the schema: the apply validator already enforces the same rule.
- Re-running with `mode=starter` on the feature request posts nothing new.
- Relabelling a question to `enhancement` (after merge, or by dispatch with `mode=starter`) posts one starter; relabelling away and back posts nothing.
- Revoking the token secret for one run leaves the issue labelled `needs a person` with "Triage did not run".

Delete the test issues afterwards.
