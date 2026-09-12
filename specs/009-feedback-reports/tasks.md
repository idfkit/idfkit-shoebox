---

description: "Task list for Feedback Reports"
---

# Tasks: Feedback Reports

**Input**: Design documents from `/specs/009-feedback-reports/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: no test tasks are generated; the spec does not ask for them and the repository has no test runner. Verification follows the constitution's workflow gates: throwaway Node harnesses in the session scratch directory (never committed), driving the page, and dispatching the workflow from the branch. Each phase ends with its verification task.

**Organization**: tasks are grouped by user story (US1 to US5 in spec.md) so each can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to
- Line numbers are from commit `bba67a1` and drift as edits land; find the named function or string when they do not match.

## Standing rules for every task

- **Nothing reaches `params`, the link or the IDF** (FR-030). No change to `src/model.js`, `src/permalink.js`, `src/controls.js` declarations or any applier.
- **Missing is an em dash, never zero or blank** (Principle IV). Every refusal or unavailable control says why, in text, in place.
- **No dialog, nothing floats, nothing only on hover** (`.interface-design/system.md`, Principle VII). Show and hide with `hidden`; a class that sets `display` gets a `[hidden]` twin.
- **Typed, frozen records** for everything in `src/report.js` (constitution gate 10). Comments explain why, in the house prose, with the measurement that forced the choice (gate 9).
- **No untrusted value in a shell.** In workflow files, issue text and the verdict reach scripts only through `env:`.
- **New copy in the house voice**: load the `editorial` skill before writing any string a reader sees. No em dashes in markdown prose.

---

## Phase 1: Setup (baseline)

**Purpose**: take the "before" measurements while the tree is unchanged.

- [X] T001 Copy `specs/007-upgrade-idfkit-js/verify/build-positions.mjs` and `compare.mjs` into the session scratch directory, run `build-positions.mjs` against the unchanged tree and save its IDFs as `before/` in scratch (quickstart step 3). Also save, in scratch, a `links.txt` of six share links that between them move every channel off its default (copy each from the Share button after moving the desk). Commit nothing from scratch.

**Checkpoint**: baseline IDFs and links saved.

---

## Phase 2: Foundational (the module, the entry, the pattern)

**Purpose**: the DOM-free core and the second entry every story builds on. No story work begins until this phase is done.

**⚠️ CRITICAL**: workflow gate 8 applies; T002 comes before any report markup or CSS.

- [X] T002 Run `/interface-design:init` for the report sheet, then add a "The report sheet" subsection under Component patterns in `.interface-design/system.md`: an in-flow section directly under the ledger's action row (never a dialog, citing `system.md:16-17` and `:430-431`), one column at every width, the item row with its Remove / Put back toggle, the disabled-with-reason control, the outcome line in a `role="status"` element, and the preview in a `.fold`. Follow [contracts/report-sheet.md](./contracts/report-sheet.md) for structure; the system file owns the look.
- [X] T003 Create `src/report.js`, DOM-free and importing nothing but `./copy.js` if needed: frozen classes `CapturedItem`, `TrailEntry`, `PageError`, `ReportFile`, `Handoff` and a mutable-by-method `Report` per [data-model.md](./data-model.md) (validate ids and kinds in constructors and throw on anything outside the closed sets); a `Trail` ring of 20 with `push(kind, text)` stamping seconds since load (`performance.now() / 1000`, one decimal) and coalescing consecutive `control` entries for the same key into the latest; an `ErrorLog` keeping 20 `PageError`s plus an overflow count; and a registry with `provide(name, fn)` and `ask(name)` for the three providers `main.js` will register (`screen`, `runFiles`, `refusedLink`), where `ask` returns `null` for a provider not yet registered. Export one shared `trail`, `errors` and registry. Comment why the registry exists (research R4, R5: the report never reaches into `main.js` state).
- [X] T004 Create `src/report-sheet.js` as the second module entry. For now it imports `./report.js` and installs the error trap: `window.addEventListener('error', …)` and `'unhandledrejection'`, each recording a `PageError` (`source` `error` or `rejection`, message on one line, `file:line:col` from the event or an em dash) and skipping any error object marked `reported: true`. In `index.html`, add `<script type="module" src="/src/report-sheet.js"></script>` immediately before the `main.js` script tag (about line 5660), with a comment saying why it loads first and separately (research R5).
- [X] T005 Check the shared instance: run `npm run dev`, push a trail entry from the devtools console through a dynamic `import('/src/report.js')` and read it back from the same module; then `npm run build && npm run preview` and confirm in the network panel that `report.js` is emitted once (a shared chunk) and both entries load. Throw an error from the console and confirm the trap recorded it.

**Checkpoint**: `src/report.js` exists and is shared by two entries; the error trap works; the sheet pattern is documented.

---

## Phase 3: User Story 1 - Report a problem without leaving the sheet (Priority: P1) 🎯 MVP

**Goal**: open Report, write a sentence, read exactly what will be sent, and press one button to open a prefilled issue with a copy on the clipboard.

**Independent Test**: at the default desk after the first run, and again after a run that fails, report with one sentence: the tracker opens with the title and body, the clipboard holds the body, the page makes no request, and the whole flow takes under 2 minutes and three presses besides typing (quickstart 4.1, 4.2).

- [X] T006 [US1] In `src/report.js`, add `titleOf(description)` (first line, cut at a word boundary to 80 characters) and `buildBody(report)` per [contracts/report-body.md](./contracts/report-body.md): the `<!-- shoebox-report v1 -->` first line, the description, then `### Build`, `### Desk`, `### Environment`, `### On screen`, `### Engine log` (log lines in a ```text fence), `### Page errors`, `### Recent actions`, `### Files to attach`, and `### Removed by the reporter` only when something was removed. One line per paragraph (GFM hard breaks), `—` for every missing value, removed items reduced to a line in the last section.
- [X] T007 [US1] In `src/report.js`, add `handoff(report, { repository = 'idfkit/idfkit-shoebox' } = {})` returning a `Handoff`: builds `https://github.com/<repository>/issues/new?title=<enc>&body=<enc>` with `encodeURIComponent` and never a `labels` parameter; if the address is over 5,500 characters, removes log lines from the top of the fence one at a time and adds the sentence "The oldest <n> lines were removed to fit the link; the saved report file has them all."; if it still does not fit with no log lines, uses the short body from the contract's Length section and sets `fits: false`. Comment the measured limit (research R3: 302 to about 6,050, 500 at 7,051, 414 from 9,051) and the documented 404 on `labels=` (research R2).
- [X] T008 [P] [US1] Move `ENERGYPLUS_VERSION` (`src/main.js:178`) into `src/version.js` as an export beside `TOOLKIT`, and import it in `src/main.js`; no other change. The report's build item then needs nothing from `main.js`.
- [X] T009 [US1] In `src/main.js`, register the `screen` provider with the report registry: a function returning the `desk` lines (`Link: ` plus `schemeUrl()`, `src/main.js:4129`) and the `screen` lines from [contracts/report-body.md](./contracts/report-body.md): the status line's `textContent` and whether its class is `status bad`; `refusalNote` (`:4177`) when set; every channel blocking reason currently rendered in the strips (find where `requires.reason` is lettered in `src/console.js`) with its channel label; the run kind from `annual()` (`:3531`) or "none yet" when `lastBundle` is null; stale when `solvedShape && solvedShape !== shapeKey(params)` (`markStale`, `:2283`); in flight when `pumping` (`:6803`); study progress from `studyScheduler.progress()`; survey coverage from `coverageOf(survey)` when a survey is open. Also return the `log` lines from `lastBundle`: `Last run: <severe> severe, <warnings> warnings, exit <exitCode>`, `Failure: <failure or —>`, and the severe and fatal lines filtered from `lastBundle.log` (confirm the exact EnergyPlus markers, `** Severe  **` and `**  Fatal  **`, against a real `eplusout.err` from a failed run before relying on them). Place the registration after `lastBundle` and the helpers it reads are declared.
- [X] T010 [US1] In `src/main.js`, push trail entries: in `commit` (`:2391`) as `trail.push('control', \`${labelFor(key)} ${formatValue(key, value)}\`)` (coalescing is in `Trail`); in `patchChannel` (the function containing `bypass[id] = off`, about `:3349`) as `patch` with the channel label and "patched out" or "patched in"; at the start of `solve` (`:6343`) as `run` with "design day started" or "annual run started"; in `attach` (`:3873`) as `station` with the station's name and WMO number; in `refuseLink` (`:4178`) as `refusal` with its message; and in the station refusal inside `attach` (`:3890-3899`) as `refusal` prefixed "Station refused". Import `trail`, `labelFor`, `formatValue` as needed.
- [X] T011 [US1] In `index.html`, add the `Report` link-button after `#save-scheme` in `.ledger-take` (about lines 5037-5052), with `aria-expanded="false"` and `aria-controls="report"`, and a comment in the style of its neighbours saying why it sits with the other ways out. Add, in `.field` directly after `.status-row` (about line 5106) and before the plate, the static `<section class="report" id="report" hidden aria-labelledby="report-title">` holding the heading, standing line, labelled `<textarea>`, an empty item list, the files row, the preview host, the actions row and a `role="status"` outcome element, per [contracts/report-sheet.md](./contracts/report-sheet.md). Add the CSS from T002's system entry, including `[hidden]` twins.
- [X] T012 [US1] In `src/report-sheet.js`, declare every always-visible string of the sheet at the module head and assert each at load with `withinBudget` from `./copy.js` (button and item labels against `SUMMARY`, standing lines against `STANDING` or `BLOCK`). Wire open and close: the Report button toggles `hidden` and `aria-expanded`, focus moves to the description on open and back to the button on close, and the description survives close and reopen for the session (FR-004).
- [X] T013 [US1] In `src/report-sheet.js`, build the captured items each time the sheet opens: `build` from `REVISION`, `revisionHref()`, `TOOLKIT`, `ENERGYPLUS_VERSION` (always included, no toggle, "Always included."); `environment` from `navigator.userAgentData` when present (brands and platform) else the user agent string, `innerWidth` × `innerHeight`, `screen.width` × `screen.height`, layout read back from the `--index` custom property on `.strips` and `--fold` on `.presets` (the reads at `src/console.js:214` and `src/main.js:5046-5053`), and `matchMedia('(pointer: coarse)')`; `desk`, `screen` and `log` from `ask('screen')`; `errors` from `errors`; `trail` from `trail`. Render one row per item with its label, a one-line summary and a Remove / Put back toggle (`aria-pressed`, accessible name "Remove <item>"), and re-render the preview on every change.
- [X] T014 [US1] In `src/report-sheet.js`, render the preview as a `<pre>` holding exactly `buildBody(report)` inside `fold('report:preview', 'Exactly what is sent')` imported from `./console.js`, opened the first time the sheet opens in a session.
- [X] T015 [US1] In `src/report-sheet.js`, wire the actions per [contracts/report-sheet.md](./contracts/report-sheet.md): **Open on GitHub**, with its standing line "Sends this text to GitHub to fill the form. You submit it there.", which on press writes the body to the clipboard, then calls `window.open(handoff.url, '_blank', 'noopener')` and writes the matching outcome line (fitted, trimmed, did not fit, tab blocked with a plain anchor to the address, clipboard refused); **Copy text**; **Report as a file**, saving `shoebox-report-<stem>-report.txt` with the `createObjectURL` pattern from `src/main.js:1986-1995` and adding a `ReportFile`. Every action is disabled with the stated reason "Write what happened first." while the description is empty.
- [X] T016 [US1] Verify US1: write the scratch harness from quickstart step 1 against `src/report.js` (all five fixtures and every expectation, including that a planted signature, scheme name and coordinates never appear); then drive quickstart 4.1 and 4.2 at 1440 × 900 with the network panel recording (zero requests from the page during the flow) and time it; repeat 4.1 at 390 × 844 and with the keyboard alone.

**Checkpoint**: a reader can file a complete report; this is the MVP.

---

## Phase 4: User Story 2 - Rebuild the reader's sheet from the report (Priority: P1)

**Goal**: a maintainer puts the reader's desk on screen from the report alone.

**Independent Test**: reports filed from five desk positions (phone width, study running, pinned hour, and two others) each reproduce their desk when the link is opened on the stated build (quickstart 4.3).

- [X] T017 [US2] In `src/report-sheet.js`'s build item, letter what kind of build it is: "release" when `REVISION.tag` is set, "development build" when only a commit is known, and "revision unknown" when the build stamped `+unknown`, so a preview or dev report never reads as a release (story 2, scenario 2). Keep the link from `revisionHref()` or an em dash.
- [X] T018 [US2] In the `screen` provider (`src/main.js`, T009), make the readings line state "stale, from an earlier desk" or "run in flight" in words whenever the numbers on screen are not for the current desk (story 2, scenario 3), and confirm the desk link carries the station, weather window and pinned hour (it comes from `schemeHash`, `src/main.js:4101`; change nothing there).
- [X] T019 [US2] Verify US2: file reports at the five positions in the independent test, open each report's link in a private window on the stated build, and check desk, patch state, station, window and pinned hour match; check a dev-server report says "development build".

**Checkpoint**: every report reproduces its desk.

---

## Phase 5: User Story 3 - Reports arrive sorted (Priority: P2)

**Goal**: every new issue gets one bucket or `needs a person`, area and failure labels, likely duplicates named, and, for a feature request, one folded starter paragraph, all by idfkit-bot and with no maintainer action.

**Independent Test**: dispatch triage from the branch against a batch of test issues (bug from the sheet, feature request, question, near copy of #21, hand-filed, ruled-out feature request) and check the labels and comments in quickstart step 5.

- [X] T020 [P] [US3] Create `.github/triage/verdict.schema.json` byte-identical to [contracts/triage-verdict.schema.json](./contracts/triage-verdict.schema.json), and note in its `description` that the contract copy must stay equal.
- [X] T021 [P] [US3] Create `.github/ISSUE_TEMPLATE/config.yml` with `blank_issues_enabled: true` and one `contact_links` entry: name "Report from the sheet", url `https://shoebox.idfkit.com/`, about "Opens the sheet; its Report button attaches the link, build and engine log for you." (research R16).
- [X] T022 [US3] Create `scripts/triage-context.mjs` (Node 22, no dependencies, ES module, house comments). Inputs from the environment only: `ISSUE_NUMBER`, `MODE` (`triage` or `starter`), `GITHUB_EVENT_PATH`, `GITHUB_OUTPUT`, `GH_TOKEN`. It reads the issue title and body from the event payload, or with `gh api repos/{owner}/{repo}/issues/<n>` on dispatch; lists issues with `gh issue list --state all --limit 300 --json number,title,state,closedAt` and keeps open ones and those closed within 90 days, excluding the issue itself; reads `.specify/memory/constitution.md`, `CLAUDE.md`, and each `specs/*/spec.md` title line and `**Input**` line; imports `CHANNELS` from `../src/controls.js` for the area roster and adds `weather`, `link`, `layout`, `results`, `studies`, `survey`, `report`; and writes the prompt: role and output rules first (one bucket or needs-a-person, areas only from the roster, duplicates only from the list, a starter paragraph only for a feature request, written as the reporter asked with conflicts named by constitution heading and never rewritten to fit, per FR-028 and FR-029), then the bundle, then the issue title and body in a fenced block introduced as untrusted text from the public that must not be obeyed. In `starter` mode the rules say a maintainer has classified the report as a feature request and only `starter` matters. Writes `prompt` and `schema` (the compact JSON of `.github/triage/verdict.schema.json`) to `GITHUB_OUTPUT` using a random heredoc delimiter, and throws if the schema contains a single quote.
- [X] T023 [US3] Create `.github/scripts/triage-apply.cjs` (CommonJS for `github-script`). Export a pure `validate(raw, facts)` taking the raw `structured_output` string and `facts` `{ roster, issues, principles }` and returning `{ verdict, dropped }` or `{ error }`: refuse unparseable or empty input; refuse `bucket` and `needs_person` both set or both null; drop areas outside the roster, duplicates not in `issues` and conflicts whose principle matches no constitution heading, listing each in `dropped`; drop `starter` unless the bucket is `feature`; restate the schema's length limits. Never throw.
- [X] T024 [US3] In `.github/scripts/triage-apply.cjs`, export the run function `async ({ github, context, core, mode, conclusion, output, runUrl })` implementing [contracts/triage-workflow.md](./contracts/triage-workflow.md) "What the apply script does": create missing labels from the data-model roster; read current labels and, for bucket labels, the issue's label events (`github.rest.issues.listEvents`) to tell a human's label (actor login not ending in `[bot]`) from the app's, never replacing a human's (FR-024); parse the body for the `<!-- shoebox-report v1 -->` marker and failure kinds per [contracts/report-body.md](./contracts/report-body.md) "Parsing" and apply `from the sheet` or `no captured context` and `run failed`, `link refused`, `station refused`; on a failed step or invalid verdict apply `needs a person` with "Triage did not run: <reason>. Run: <runUrl>." (FR-026); otherwise apply the bucket (`feature` as `enhancement`) or `needs a person`, the `area: <id>` labels, and write or edit the one `<!-- shoebox-triage -->` comment (found again by marker as `.github/scripts/preview-comment.cjs` does). Never close, reopen or assign.
- [X] T025 [US3] In `.github/scripts/triage-apply.cjs`, add the starter comment: when the bucket is `feature` (triage mode) or in starter mode, and no comment on the issue carries `<!-- shoebox-starter -->`, post one comment: the marker, then `<details><summary>Draft for maintainers: a starting point for <code>/speckit-specify</code>, not a commitment</summary>`, then each conflict as "Conflicts with <principle>: <argument>" before the paragraph, then the paragraph in a ```text fence, then `</details>`. If the marker exists, post and edit nothing (FR-028). A missing or invalid starter posts nothing and adds its reason to the triage comment.
- [X] T026 [US3] Create `.github/workflows/triage.yml` per [contracts/triage-workflow.md](./contracts/triage-workflow.md), with a header comment in the style of `deploy.yml` and `preview.yml`: triggers `issues: [opened, labeled]` and `workflow_dispatch` (`issue`, `mode`); job `if` gate on `!endsWith(github.event.sender.login, '[bot]')`, and for `labeled` on `github.event.label.name == 'enhancement'`; concurrency `triage-<issue>`, not cancelled; `permissions: contents: read, issues: read`; steps: sparse `actions/checkout@v7`, `actions/setup-node@v7` (Node 22), the context step (`id: context`, env only), `anthropics/claude-code-action@v1` (`id: claude`, `continue-on-error: true`, inputs exactly as in the contract, `--model claude-opus-5 --max-turns 3 --disallowedTools "*" --json-schema '${{ steps.context.outputs.schema }}'`), `actions/create-github-app-token@v1` (`app-id`, `private-key`, `owner`, `permission-issues: write`, as in `preview.yml`), and `actions/github-script@v7` with `if: always()`, the app token, and `MODE`, `CONCLUSION` (`steps.claude.outputs.conclusion`), `OUTPUT` (`steps.claude.outputs.structured_output`) and the run URL passed through `env:` and read from `process.env` in the script. The labeled path skips when the starter marker is already present (the apply script checks; the gate does not need to).
- [ ] T027 [US3] Verify US3: write the scratch harness from quickstart step 2 against `validate` (every listed case, including malformed and empty, none throwing), and a second check that feeds the run function a failed `conclusion` with a stub `github` and asserts `needs a person` and the "Triage did not run" comment. Push the branch, open the six test issues, and run quickstart step 5 with `gh workflow run triage.yml --ref <branch> -f issue=<n> -f mode=triage` for each and `mode=starter` twice on the feature request. Check every expectation, including the empty tool list in the run's `execution_file` and whether the action accepted the schema (drop any rejected keyword from both schema copies; the validator keeps the rule). Delete the test issues.

**Checkpoint**: triage sorts new issues from the branch; it goes live on `issues` events only when the workflow reaches `main` (see T036).

---

## Phase 6: User Story 4 - Show what I was seeing (Priority: P2)

**Goal**: add a picture of the sheet or the run's files, opt-in, named in the issue for the reader to attach.

**Independent Test**: on a desktop, save a picture (it shows the sheet, not the report) and the run files signed and unsigned; on a phone, the picture offer is disabled with its reason; every saved file is listed under "Files to attach" (quickstart 4.5).

- [X] T028 [US4] In `src/main.js`, register the `runFiles` provider: `async ({ signed }) => runBundle({ ...lastBundle, author: signed ? signature : null })` (the download at `:1986` already calls `runBundle` this way), returning `null` while `lastBundle` is null, plus a `signed()` check telling whether a signature is set.
- [X] T029 [US4] In `src/report-sheet.js`, add **Run files**: disabled with "No run yet" until `ask('runFiles')` has a bundle; when the sheet is signed, two buttons **Signed** and **Unsigned** and the standing note "The signed model file carries your name."; saves `shoebox-report-<stem>-bundle.zip` and records a `ReportFile` with `signed`.
- [X] T030 [US4] In `src/report-sheet.js`, add **Picture of the sheet** per research R8: enabled only when `navigator.mediaDevices?.getDisplayMedia` exists and the pointer is not coarse, otherwise disabled with "Not available in this browser. Use your device's screenshot."; on press, call `getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true, selfBrowserSurface: 'include' })`, hide the report sheet, play the stream in an off-DOM `<video>`, wait one `requestVideoFrameCallback` or `loadeddata`, draw the frame to a canvas, stop every track, restore the sheet, and save `shoebox-report-<stem>-picture.png` from `canvas.toBlob`. A refusal by the reader or the browser writes the outcome line "No picture taken: <reason>." and changes nothing else.
- [X] T031 [US4] Verify US4: drive quickstart 4.5 on desktop Chrome and one other desktop browser, then at 390 × 844 in device emulation and on a real phone; confirm the preview lists each saved file and the signed note appears only when signed.

**Checkpoint**: files are opt-in and named in the body.

---

## Phase 7: User Story 5 - Report when the sheet itself is broken (Priority: P3)

**Goal**: the report is reachable and truthful when the engine never loads, a link is refused, or the page throws.

**Independent Test**: with the engine assets missing, and separately with a malformed link, the report opens, carries the failure the page showed and hands off (quickstart 4.6, 4.7).

- [X] T032 [US5] In `src/main.js`, copy `location.hash` into a constant before the decode at about `:6288`, and register the `refusedLink` provider returning `{ raw, reason: refusalNote }` whenever `refusalNote` is set. In the `screen` provider's desk lines (T009), use `Refused link: \`<raw>\`` and `Reason given: <refusalNote>` instead of the share link when a link was refused (story 5, scenario 2).
- [X] T033 [US5] In `src/main.js`, wrap the engine load (`createEnergyPlus`, awaited at about `:6326`) and the schema load (about `:6271`) so a failure writes "The engine could not be loaded: <reason>" to `statusEl` as `status bad`, records a `PageError` with `source: 'boot'` in `errors`, marks the error `reported: true` and rethrows it to stop the boot; the trap from T004 skips it so it is recorded once. Comment the failure this closes (research R5: today the load fails with no message).
- [X] T034 [US5] In `src/report-sheet.js`, when `ask('screen')` is null, letter the screen item as "The sheet had not finished starting." followed by any `boot` error, and the log item as "No run has been made."; letter the errors item with every `PageError` in order and "and <n> more" for the overflow.
- [X] T035 [US5] Verify US5: rename `public/energyplus/` and reload (status line shows the new refusal; the report opens, carries the boot error, hands off); restore it; load a malformed link (the report carries it exactly as typed and the reason); throw from the devtools console and see it listed.

**Checkpoint**: all five stories work on their own.

---

## Phase 8: Polish and cross-cutting concerns

- [ ] T036 Before merging: record in the pull request whether Anthropic has confirmed that a subscription token may serve a workflow strangers can trigger (spec Assumptions). If it has not, merge with the workflow disabled (`gh workflow disable triage.yml` after merge) and say so in the pull request; the page ships either way.
- [X] T037 [P] Update `CLAUDE.md`: a one-line subsystem entry for reports (`report.js` DOM-free core, `report-sheet.js` second entry and why it loads first) and one for triage (two steps, no tools, `--disallowedTools "*"` because the action drops `--tools ""`, idfkit-bot with Issues write, the sender gate against loops); under Deployment, the `CLAUDE_CODE_OAUTH_TOKEN` repository secret, whose maintainer made it, and its renewal by 2027-09-11; under Invariants, never put `labels=` in the new-issue link (404 for readers) and keep the address under 5,500 characters.
- [X] T038 [P] Add a "Feedback reports and triage" section to `docs/design-notes.md` recording the measurements and reasons behind research R1 to R16 (the 6,050-character limit and how it was measured, the documented 404, the mobile app's blank fields, desktop-only screen capture, the parser that drops an empty argument, app tokens triggering further runs), in the file's house prose.
- [X] T039 Run `compare.mjs` from T001: rebuild the IDFs with `build-positions.mjs` into `after/` and compare with `before/` (byte-identical), and load each link in `links.txt` (identical desks) (SC-009).
- [X] T040 Load the `editorial` skill and review every new reader-facing string in `src/report-sheet.js`, `index.html` and the workflow's comments against it; confirm the page loads (budget assertions pass) and that `src/tour.js` `NOTES` needed no change (gate 6: no step changes what it teaches).
- [X] T041 Run [quickstart.md](./quickstart.md) end to end once more on a production build (`npm run build && npm run preview`), including the 390 px and keyboard pass, and tick `specs/009-feedback-reports/checklists/requirements.md` only if every item still holds.

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks every page story.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1 (it refines US1's build and screen items).
- **US3 (Phase 5)**: independent of the page. It needs only [contracts/report-body.md](./contracts/report-body.md), so it can start right after Setup, in parallel with Phases 2 to 4. Its end-to-end check (T027) is richer once US1 can file real reports.
- **US4 (Phase 6)**: after US1 (the sheet's files row).
- **US5 (Phase 7)**: after US1 (the sheet), and T032 after T009.
- **Polish (Phase 8)**: after the stories that are shipping.

### Within stories

- `src/report.js` tasks (T006, T007) before the sheet uses them (T013 to T015).
- `src/main.js` providers (T009, T028, T032) before the sheet asks for them.
- T022 to T025 before T026's workflow can run; T020 before T022 reads the schema.
- `src/main.js` is edited by T008, T009, T010, T018, T028, T032, T033: do these one at a time.
- `src/report-sheet.js` is edited by T004, T012 to T015, T017, T029, T030, T034: one at a time.

### Parallel opportunities

- T008 (version constant) beside T006 and T007 (report.js).
- The whole of US3 (T020 to T027) beside Phases 2 to 4, since it touches only `.github/` and `scripts/`.
- Within US3: T020 and T021 together; T022 and T023 together once T020 is done.
- T037 and T038 together in Polish.

## Parallel example: User Story 3 beside the page

```text
Developer A (page):   T002 → T003 → T004 → T005 → T006 → T007 → T009 → …
Developer B (triage): T020 + T021 → T022 + T023 → T024 → T025 → T026 → T027
```

## Parallel example: User Story 1

```text
Together:  T006 + T007 (src/report.js, one after the other)  |  T008 (src/version.js, src/main.js)
Then:      T009 → T010 (src/main.js)  |  T011 (index.html)
Then:      T012 → T013 → T014 → T015 (src/report-sheet.js)
Then:      T016 (verify)
```

## Implementation strategy

### MVP first

1. Phase 1 and Phase 2.
2. Phase 3 (US1). Stop and verify with T016: a reader can file a complete, reproducible report by hand-off. This is shippable on its own; maintainers sort by hand meanwhile.

### Incremental delivery

1. MVP (US1), then US2 (small, same P1 priority): reports reproduce their desk.
2. US3 in parallel from the start, merged when its checks pass and the terms question is answered (T036).
3. US4 (files), then US5 (broken sheet), each verified on its own.
4. Polish.

### Notes

- Every verification task names the quickstart step it runs; harnesses stay in scratch.
- Commit after each task or logical group, following the repository's commit style.
- The `issues` trigger only runs from `main`; branch testing is by `workflow_dispatch` (research R12).
