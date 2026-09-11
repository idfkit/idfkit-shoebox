# Research: Feedback Reports

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-11

Every decision is recorded as Decision, Rationale and Alternatives. Facts about the page come from reading the source at `bba67a1`; facts about GitHub and the action come from their documentation and source, cited in place. Where a fact was measured rather than documented, it says so.

## R1. Where the report leaves the machine, and Principle I

**Decision**: the report leaves the reader's machine at exactly one moment, when they press the button that opens the tracker's tab (FR-015, as clarified on 2026-09-11). The page never issues a request of its own: it builds text, writes it to the clipboard, and opens a tab. The button says, where it is pressed, that the text goes to GitHub to fill the form.

**Rationale**: GitHub's prefill works by carrying the title and body in the new-issue address, so the tracker receives the text when the tab loads, before the reader submits. Pretending otherwise would be a claim the design cannot keep. Principle I forbids the page uploading a model, IDF, result or parameter set to a service. The reading recorded here, as the spec's Assumptions require: a reader who has seen every line and then presses a button labelled with its destination is sharing, the same act as copying the share link into an email, which the constitution already allows. The page's own network activity stays at zero (SC-006), and nothing is sent that the reader has not read (SC-007).

**Alternatives considered**:

- *Open an empty form and have the reader paste.* Nothing leaves before Submit, and there is no length limit. Rejected as the default because it adds a step on every report (SC-001) for a guarantee the reader does not need once the button says where the text goes. It survives as the phone path (R2), where the GitHub app discards prefilled fields anyway.
- *Send the report to a service the maintainers run.* Rejected at specification (spec, Context): it needs a server and an amendment to a non-negotiable principle.

## R2. The hand-off: title and body only, copied at the same press

**Decision**: the link is `https://github.com/idfkit/idfkit-shoebox/issues/new?title=…&body=…` and nothing else. The same press writes the whole body to the clipboard before the tab opens, and the sheet then says "Copied as well, in case the form opens empty." If `window.open` returns null, the sheet shows the link as a plain anchor and the copy remains.

**Rationale**:

- **No `labels=`.** GitHub documents that the `labels` parameter needs permission to label, and that without it "the URL will return a 404 Not Found error page" ([creating an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue)). A reader is almost never a collaborator, so a label in the link would break the hand-off for exactly the people it exists for. Triage labels afterwards.
- **No issue form.** Form fields prefill by `id`, but dropdowns are reported not to prefill, a `template=` link does not apply the template's own labels, and whether `body` still works beside a form is undocumented ([form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema), [community 17014](https://github.com/community/community/discussions/17014)). A plain body is documented and is what the preview shows byte for byte.
- **Copy at the same press.** With the GitHub mobile app installed, a prefilled link opens with every field blank, acknowledged by GitHub staff and unfixed ([community 113726](https://github.com/orgs/community/discussions/113726)). The clipboard makes the phone path one paste. The press is a user gesture, which the clipboard API requires; the share button already handles its refusal (`src/main.js:2033`), and this does the same.

**Alternatives considered**: a `mailto:` fallback (no attachments, and a second destination the maintainers did not choose); the GitHub REST API from the page (needs the reader's token in the page, and is a request the page makes).

## R3. The body, its length budget and the trim

**Decision**: the body follows [contracts/report-body.md](./contracts/report-body.md): a version marker, the reader's words, then one section per captured item. The whole address is held to **5,500 characters** after encoding. When it is over, log lines are removed oldest first until it fits, and the log section states how many were removed and that the full report is in the saved file (FR-017). If it is still over with the whole log removed, the link carries a short body naming the saved report file, and the sheet says so before the tab opens.

**Rationale**: GitHub publishes no limit. Measured anonymously against `github.com/cli/cli/issues/new`: 302 up to about 6,050 characters, 500 at 7,051, 414 from 9,051. 5,500 leaves margin for encoding differences and a longer repository path. A trim that is stated is a measurement of what was sent; one that is not would be a silent fallback (Principle IV).

**Alternatives considered**: compressing the body into the link (unreadable in the preview, which breaks FR-013); trimming the reader's words (they are the report).

## R4. Where the page already holds each captured fact

**Decision**: the report reads these, and adds no second source for any of them.

| Fact | Where | Note |
| --- | --- | --- |
| Status line and its state | `statusEl`, `src/main.js:240`; class `status bad` on failure | Written by `solve()` at `:6448`, `:6509`, `:6533` and a dozen other paths |
| Refused link and reason | `refuseLink()` `:4178`, `refusalNote` `:4177` | The raw hash is not kept: see R5 |
| Refused station | `refuse()` inside `attach()`, `:3890-3899` | |
| Last run | `lastBundle`, set at `:6433-6436`: `log`, `severe`, `warnings`, `exitCode`, `failure` | Fatals are counted inside `severe` (`:6468-6470`); the report prints the fatal lines themselves |
| Share link | `schemeUrl()` `:4129` over `schemeHash()` `:4101` | The same builder the share button uses (Principle III) |
| Build | `REVISION`, `revisionHref()`, `TOOLKIT` (`src/version.js`), `ENERGYPLUS_VERSION` `:178` | |
| Layout | `--index` read at `src/console.js:214`; `--fold` at `src/main.js:5046-5053` | Read back, not restated (Principle VII) |
| Stale or in flight | `markStale()` `:2283`, `pumping` `:6803`, `annual()` `:3531` | |
| Studies and survey | `studyScheduler.progress()` (`src/scheduler.js:553`), `coverageOf(survey)` (`src/survey.js:724`) | |
| Saving a file | the `createObjectURL` pattern at `:1986-1995` | Reused as is |
| The run bundle | `runBundle({ ...lastBundle, author })`, `:1986` | `author: null` gives the unsigned bundle (R9) |

`main.js` hands the report one function, `describeScreen()`, that assembles the `screen` and `desk` items from these at the moment the report opens. `report.js` never reaches into `main.js` state.

## R5. Reachable when the sheet is broken

**Decision**: three changes, because today a failed engine or schema load stops `main.js` at a top-level `await` with no handler and no message (`src/main.js:6255-6275`), and nothing traps page errors.

1. **A second module entry**, `src/report-sheet.js`, loaded by its own `<script type="module">` placed before `main.js` in `index.html`. It installs the error trap (`error` and `unhandledrejection`) and wires the report button and sheet. A failure anywhere in `main.js`'s module graph cannot take it down, and a top-level `await` in `main.js` does not delay it. Both entries import the DOM-free `src/report.js`, and one module instance is shared by the document.
2. **The boot loads are caught.** `createEnergyPlus` and the schema load get a `try`/`catch` that writes "The engine could not be loaded: <reason>" to the status line as a bad status, records a `boot` `PageError`, and stops the boot. This is the refusal Principle IV already requires and the page lacks.
3. **The raw link is kept.** `location.hash` is copied before `decodeState` runs (`:6288`), because `refuseLink()` clears the address at `:4188`. The report carries it as typed (story 5, scenario 2).

Until `main.js` registers `describeScreen()`, the report states "The sheet had not finished starting" in the `screen` item, with whatever boot failure was trapped. That is a statement of what is known, not a substitute value.

**Alternatives considered**: putting the trap at the top of `main.js` (an import failure in its graph would still take it down); an inline classic script (untyped, and outside the module the report shares).

## R6. The report is a sheet in the flow, never a dialog

**Decision**: the report is a `<section class="report" id="report" hidden>` inserted in the flow of the field column directly under the status row (`index.html:5103-5106`), above the plate, opened by a fourth link-button, "Report", beside Download, Share and Save in the ledger (`index.html:5037-5052`). The ledger column is 172 px wide (`.body`, `index.html:290-293`), too narrow for a field and a preview; below 780 px it stacks above the field, so the button still precedes the sheet. Opening it moves focus to the description; closing returns focus to the button. It folds like everything else with `hidden`. Its layout at 390 px is one column: description, the item list with remove controls, the files row, the preview, the actions.

**Rationale**: the design system is explicit that nothing on this board floats (`.interface-design/system.md:16-17`, `:430-431`, `:1067`); there is no `<dialog>` anywhere on the page. A sheet in the flow keeps the drawing visible above it, which matters for the picture (R8), and is reachable by keyboard without a focus trap. By workflow gate 8 the pattern is started with `/interface-design:init` and recorded in `system.md` in the same change.

**Alternatives considered**: a `<dialog>` (forbidden by the design system); a drawer at the page foot like the engine console (too far from the action row on a phone, and the engine console is itself one of the things being reported).

## R7. The action trail

**Decision**: a ring of the last **20** `TrailEntry` records, pushed from six places in `main.js`: `commit` (a control's new value, lettered with its label and `formatValue`), the patch toggle, the start of a `solve`, `attach` (a station), `refuseLink`, and the station refusal. Times are seconds since load. In memory only.

**Rationale**: twenty covers a drag, a patch, a run and a refusal with room to spare, and at one line each stays under a tenth of the address budget (R3). Seconds since load say "in what order" without a clock or timezone. Lettering from the declaration keeps one source for every label (Principle III).

**Alternatives considered**: a whole-session log (unbounded, and most of it is a different question from the one being reported); `localStorage` (the constitution keeps persistence to what the reader chose, and a trail of someone's session is not that).

## R8. The picture of the sheet

**Decision**: on a desktop browser that offers `navigator.mediaDevices.getDisplayMedia`, "Picture of the sheet" asks for the current tab (`preferCurrentTab: true`, `selfBrowserSurface: 'include'`, `displaySurface: 'browser'` where supported), hides the report sheet with `hidden`, draws one frame from a `<video>` into a canvas, stops every track at once, restores the sheet and saves a PNG. Where the API is absent, and on every phone, the offer reads "Not available in this browser. Use your device's screenshot." and is disabled.

**Rationale**: the browser takes the picture, so it shows exactly what the reader sees, fonts and custom properties included, and needs no dependency (Principle V). `getDisplayMedia` is on desktop Chrome, Edge, Firefox and Safari; no mobile browser supports it ([browser-compat-data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaDevices.json)). `ImageCapture.grabFrame` is missing from Firefox, so the portable `<video>` plus `drawImage` route is used. The browser's own prompt names what is shared, which is the consent the spec asks for.

**Alternatives considered**:

- *DOM through SVG `<foreignObject>` onto a canvas.* Every stylesheet and font must be inlined as `data:` URLs, and Safari taints the canvas unless the SVG is itself a `data:` URL ([MDN, SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image), [WebKit 180301](https://bugs.webkit.org/show_bug.cgi?id=180301)). A reimplementation of the renderer for a worse picture.
- *Serialise the axonometric SVG.* Shows the drawing only, which is the one part the link already reproduces, and misses the layout bugs a picture is for.
- *A capture library.* Forbidden by Principle V.

## R9. The run's files, and the signature

**Decision**: "Run files" calls the existing `runBundle`. When the sheet is signed, the row offers two buttons, "Signed" and "Unsigned", and the preview states that the signed model file carries the reader's name. Unsigned is `runBundle({ ...lastBundle, author: null })`, which the bundle already letters as an em dash. Before any run, the row reads "No run yet" and is disabled.

**Rationale**: the bundle exists, is trusted, and is the genuine bytes (`src/bundle.js` header). A second bundler would be a second source. The signature is personal (`src/sign.js`), so it reaches a public report only by the reader's explicit choice.

## R10. Who runs triage, and who pays

**Decision**: a workflow in this repository runs `anthropics/claude-code-action@v1` in automation mode (a `prompt` input is set), authenticated with `claude_code_oauth_token` from a repository secret `CLAUDE_CODE_OAUTH_TOKEN` generated by `claude setup-token`, with `--model claude-opus-5`.

**Rationale**: the docs state "If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing", and that `claude setup-token` makes a one-year token for "CI pipelines and scripts" on Pro, Max, Team and Enterprise ([GitHub Actions](https://code.claude.com/docs/en/github-actions), [authentication](https://code.claude.com/docs/en/authentication)). The token is tied to the maintainer who generated it, so the docs recommend it not be an organisation secret; it is a repository secret here. The consumer terms question recorded in the spec's Assumptions stays open and gates shipping, not planning.

**Alternatives considered**: a direct Messages API call (needs an API key and metered credits, which the maintainers ruled out); a routine (its GitHub trigger covers pull requests and releases, not new issues); workload identity federation or Bedrock (metered; kept as the fallback if the terms rule the subscription out).

## R11. Reading and acting are two steps

**Decision**: the Claude step has `permissions: contents: read, issues: read`, receives `github_token: ${{ secrets.GITHUB_TOKEN }}`, and runs with `--tools StructuredOutput`, `--max-turns 6` and `--json-schema` carrying [contracts/triage-verdict.schema.json](./contracts/triage-verdict.schema.json). Its only product is `steps.<id>.outputs.structured_output`. The apply step then mints an idfkit-bot token with `actions/create-github-app-token` (`permission-issues: write`), and a script checks every field of the verdict against the repository before labelling or commenting.

**Rationale**:

- **One tool, spelled `--tools StructuredOutput`.** *Corrected after the first live run.* The verdict comes back through a tool the model calls, `StructuredOutput`, so "no tools" is the wrong target. `--disallowedTools "*"`, the spelling first chosen, denies that tool too: run 34634116301 made two refused calls and ended `error_max_turns` with no verdict, reproduced locally on Claude Code 2.1.268. `--tools ""` keeps `StructuredOutput` but the action's argument parser discards an empty next argument (`base-action/src/parse-sdk-options.ts`). `--tools StructuredOutput` starts the run with that tool alone and returned a valid verdict for issue #66 in two turns. Automation mode adds no GitHub MCP server unless one is named in allowed tools. The run's `execution_file` lists the tools actually present in its `system/init` entry, and the quickstart checks it holds `StructuredOutput` and nothing else.
- **Six turns, not three.** *Corrected after the second live run.* The structured-output mechanism re-prompts on a schema mismatch ([structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs)), and each re-prompt is a turn. The action also enforces the ceiling on a finished run: run 34635843699 came back `success` after four turns and was failed as "exceeding the configured maximum of 3". The same prompt took two turns locally. Six leaves room for a few rejected verdicts without making a stuck run expensive.
- **No untrusted value in a shell.** The verdict and the issue body reach scripts only through `env:` and are read from the environment, never interpolated into `run:` ([hardening guide](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)). The action's own example (`OUTPUT='${{ …structured_output }}'`) is injectable and is not copied.
- **The schema is a first check, not the only one.** Which JSON Schema keywords the structured-output path enforces is not documented for the action. Every rule in the schema (the exclusive bucket, lengths, patterns) is restated in the apply validator, so a keyword the action rejects can be dropped from the schema without losing the rule.
- **The model never holds a writing credential.** The app token is minted after the Claude step ends, in a step the model cannot influence except through the validated verdict.

## R12. Triggers, strangers and loops

**Decision**: `on: issues: [opened, labeled]` plus `workflow_dispatch` with an `issue` number. The job runs when the sender is not a bot (`!endsWith(github.event.sender.login, '[bot]')`); for `labeled`, only when the label is `enhancement`. The Claude step sets `allowed_non_write_users: "*"`. Concurrency is one run per issue, not cancelled.

**Rationale**:

- The action refuses a triggering user without write access unless `allowed_non_write_users` is set and `github_token` is passed (`src/github/validation/permissions.ts`). Its security guide names "issue labeling workflows that only have `issues: write` permission" as the case this is for ([security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)); this workflow's Claude step holds less than that.
- Labels and comments made with an app installation token do trigger further runs, unlike `GITHUB_TOKEN` ([triggering a workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow)), and automation mode rejects bot actors outright (`src/github/validation/actor.ts`). The sender gate stops both the loop and the failure.
- `issues` workflows run from the default branch's copy of the file. `workflow_dispatch` runs from any branch, but only for a workflow the default branch already has: *corrected after merge*, GitHub answered 404 for `triage.yml` until it was on `main`, and documents that the event "will only trigger a workflow run if the workflow file exists on the default branch". So the first version could only be tested after it merged; every later change is tested from its branch.

## R13. What triage reads

**Decision**: `scripts/triage-context.mjs` (Node 22, no dependencies) writes the prompt from: the constitution; the repository `CLAUDE.md`; each spec's title and its **Input** line; the area roster (the channel ids from `CHANNELS` in `src/controls.js`, plus `weather`, `link`, `layout`, `results`, `studies`, `survey`, `report`); the label roster; the title and number of every open issue and every issue closed in the last 90 days; and the issue's title and body, fenced and introduced as untrusted text from the public.

**Rationale**: this is the fixed bundle the spec chose (FR-028). `src/controls.js` imports only `aperture.js`, `tm59.data.js` and `copy.js`, none of which import anything, so Node imports it with no install. Generating the roster from the declaration means a new channel reaches triage without a workflow edit. The bundle is about 15,000 to 20,000 tokens, spent against the subscription.

## R14. The starter paragraph

**Decision**: the verdict carries `starter` only when the bucket is `feature`; on a maintainer's `enhancement` label, the prompt states that a maintainer has classified the report and asks for the starter alone, and the apply step reads only `starter` from that verdict. The comment is one `<details>` block: a summary line reading "Draft for maintainers: a starting point for `/speckit-specify`, not a commitment", then any conflicts, each naming the principle and what an amendment would have to argue, then the paragraph in a fenced block so it copies cleanly. The marker `<!-- shoebox-starter -->` makes it once per report.

**Rationale**: FR-028 and FR-029, and the clarifications of 2026-09-11. A fenced block pastes into a terminal without GitHub's hard line breaks altering it. Principle names are checked against the constitution's headings so a conflict cannot cite a principle that does not exist.

## R15. When triage cannot run

**Decision**: the Claude step runs with `continue-on-error: true`. The apply step always runs; when `conclusion` is not `success` or `structured_output` is empty or fails validation, it labels the issue `needs a person` and posts the triage comment with the reason and the run's address.

**Rationale**: FR-026. An exhausted allowance or an expired token makes the Claude step fail, and a report left unlabelled would look sorted by nobody. The yearly token expiry is also written into `CLAUDE.md` beside the secret's name.

## R16. Reports filed by hand

**Decision**: blank issues stay enabled. A new `.github/ISSUE_TEMPLATE/config.yml` adds a contact link, "Report from the sheet", pointing at `https://shoebox.idfkit.com/`, so a reader who arrives at the tracker first is shown the route that captures context. A hand-filed issue has no report marker, so the apply step labels it `no captured context` and triage reads its words alone (FR-025).

**Rationale**: disabling blank issues would stop collaborators only in name (they keep a "Maintainers only" blank option) and would turn away readers who cannot open the page ([configuring templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)).

## R17. How this is verified without a test runner

**Decision**: two throwaway Node harnesses and two driven checks, in [quickstart.md](./quickstart.md): the body builder and trim run under Node against fixture reports (`src/report.js` is DOM-free); the verdict validator runs under Node against a hostile-verdict fixture; the page is driven for the five stories at desktop and 390 px with the network panel open; and the workflow is run by `workflow_dispatch` from the feature branch against test issues, with the `execution_file` checked for an empty tool list.

**Rationale**: the repository's established method (`CLAUDE.md`, "Verifying changes"), extended to the two new DOM-free modules.
