# Data Model: Feedback Reports

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Two halves that meet at one string. The page builds a **report body**, the reader carries it to the tracker, and triage reads it back. Everything on the page side is a typed, frozen object in `src/report.js` and its DOM-free helpers; nothing here reaches `params`, the link or the IDF (FR-030). The triage side is the verdict the model returns and the labels and comments the workflow derives from it.

## Page side

### `Report`

One reader's account of one problem, alive for the session only. Never written to storage.

| Field | Type | Rule |
| --- | --- | --- |
| `description` | string | The only required field (FR-002). A report with an empty description cannot be handed off, copied or saved; the controls say why. Survives closing and reopening within the session (FR-004). |
| `items` | `CapturedItem[]` | Rebuilt from the sheet each time the report is opened (story 1, scenario 4). Fixed order: build, desk, environment, screen, log, errors, trail. |
| `removed` | `Set<string>` | Ids of items the reader took out. `build` can never be in it (FR-014). |
| `files` | `ReportFile[]` | Files the reader asked for in this report. Empty unless they asked (FR-020). |

Derived, not stored: `title` (the description's first line, cut at a word boundary to 80 characters) and `body` (see [contracts/report-body.md](./contracts/report-body.md)).

### `CapturedItem`

A named, previewable part of the captured context.

| Field | Type | Rule |
| --- | --- | --- |
| `id` | `'build' \| 'desk' \| 'environment' \| 'screen' \| 'log' \| 'errors' \| 'trail'` | One item per id. |
| `label` | string | Shown beside the item's remove control; asserted against `SUMMARY` (6 words). |
| `lines` | string[] | The item's text exactly as it will appear in the body. Missing values are an em dash, never omitted or zeroed (Principle IV). |
| `fence` | string[] or null | Raw lines set in a `text` code block after `lines`. Only the `log` item has one; it is what the trim shortens (FR-017). |
| `removable` | boolean | False only for `build`. |

What each item carries, and where it is read from (line numbers from [research.md](./research.md) R4):

| Item | Carries | Read from |
| --- | --- | --- |
| `build` | sheet revision and its link, EnergyPlus version, toolkit version | `REVISION`, `revisionHref()`, `TOOLKIT` (`src/version.js`), `ENERGYPLUS_VERSION` |
| `desk` | the share link, or the refused link exactly as typed plus the reason given | `schemeUrl()`; the raw hash kept at boot before decode (R5) |
| `environment` | browser and version, OS, window and screen size, layout (`sheet`, `index`, `folded register`), pointer (`fine`, `coarse`) | user agent data, `innerWidth`/`innerHeight`, `screen`, the `--index` and `--fold` flags, `matchMedia('(pointer: coarse)')` |
| `screen` | status line and its state, refusals and blocking reasons in view, run kind, whether readings are stale or a run is in flight, study or survey progress | `#status`, `refusalNote`, the strips' blocking notes, `annual()`, `markStale`'s test, `pumping`, `studyScheduler.progress()`, `coverageOf(survey)` |
| `log` | the last run's severe and warning counts and the severe and fatal lines, or "No run has been made." | `lastBundle.log`, `.severe`, `.warnings`, `.failure` |
| `errors` | unexpected errors caught this session, in order | `PageError[]` from the error trap |
| `trail` | the most recent actions | `Trail` |

Excluded by construction (FR-012): the signature (`shoebox-drawn-by-v1`), the kept-scheme shelf (`shoebox.schemes.v1`), and the coordinates from "Near me", which are never stored and never passed out of their click handler.

### `TrailEntry` and `Trail`

| Field | Type | Rule |
| --- | --- | --- |
| `at` | number | Seconds since the page loaded, one decimal. Not wall-clock time, so a report says "12.4 s" rather than leaking a timezone. |
| `kind` | `'control' \| 'patch' \| 'run' \| 'link' \| 'station' \| 'refusal'` | Closed set. |
| `text` | string | One line, lettered with the control's own label and `formatValue` (Principle III: the declaration, not a new string). |

`Trail` is a ring of the last 20 entries (research R7). In memory only; a reload empties it.

### `PageError`

| Field | Type | Rule |
| --- | --- | --- |
| `at` | number | Seconds since load. |
| `source` | `'error' \| 'rejection' \| 'boot'` | `boot` is a failure of the engine or schema load, which today has no handler (R5). |
| `message` | string | The error's message, one line. |
| `where` | string | `file:line:column` when the event carries it, else an em dash. |

At most 20 kept; later ones are counted, not dropped silently ("and 7 more").

### `ReportFile`

| Field | Type | Rule |
| --- | --- | --- |
| `kind` | `'picture' \| 'bundle' \| 'report'` | |
| `filename` | string | `shoebox-report-<stem>-<kind>.<ext>`, stem from the station and run kind the bundle already names. |
| `signed` | boolean | For `bundle` only: whether the IDF header carries the reader's signature (story 4, scenario 4). |

### `Handoff`

The outcome of pressing "Open on GitHub", computed before the tab opens.

| Field | Type | Rule |
| --- | --- | --- |
| `url` | string | `https://github.com/idfkit/idfkit-shoebox/issues/new?title=…&body=…`. Never `labels=` (research R2). |
| `trimmed` | number | Log lines removed, oldest first, to fit (FR-017). Zero when none. |
| `fits` | boolean | False when the body is over budget even with the log removed; the link then carries a short body asking for the saved report file, and says so. |
| `outcome` | `'whole' \| 'trimmed' \| 'short' \| 'bare'` | Which body was sent. `bare` drops the description too, for a description too long for any link. |
| `body` | string | The body actually carried by `url`, which the sheet writes to the clipboard. |

## Triage side

### `Verdict`

The only thing the reading step may produce ([contracts/triage-verdict.schema.json](./contracts/triage-verdict.schema.json)). Validated twice: by the action against the schema, then by the apply step against the repository.

| Field | Type | Rule |
| --- | --- | --- |
| `bucket` | `'bug' \| 'feature' \| 'question' \| null` | Null exactly when `needs_person` is set (FR-021). |
| `needs_person` | string or null | The reason, one sentence. |
| `areas` | string[] | Only ids from the area roster below. Unknown ids are dropped by the apply step and listed in its comment. |
| `duplicates` | `{ number: int, why: string }[]` | At most 3. Each number must exist and be open or closed within 90 days, or it is dropped and listed. |
| `starter` | object or null | Present only when `bucket` is `feature`. |
| `starter.paragraph` | string | The draft for `/speckit-specify`, 60 to 200 words, in the reporter's terms. |
| `starter.conflicts` | `{ principle: string, argument: string }[]` | Principles the request collides with and what an amendment would have to argue (FR-029). Principle names must match a heading in the constitution. |

### Labels

Created once by the workflow's setup step if missing; the repository's `bug`, `enhancement` and `question` are reused.

| Label | Meaning | Applied by |
| --- | --- | --- |
| `bug`, `enhancement`, `question` | The bucket (`feature` maps to `enhancement`) | apply step |
| `needs a person` | Triage could not place it, or could not run (FR-026) | apply step, or the failure path |
| `from the sheet` | Filed through the page (the body carries the report marker) | apply step, from the marker, never from the model |
| `no captured context` | Filed by hand (FR-025) | apply step, from the absence of the marker |
| `area: <id>` | One per area | apply step, from `Verdict.areas` |
| `run failed`, `link refused`, `station refused` | The kind of failure in view | apply step, parsed from the body's `screen` section, never from the model |

Area roster: the eighteen channel ids from `CHANNELS` in `src/controls.js`, plus `weather`, `link`, `layout`, `results`, `studies`, `survey`, `report`. Generated into the workflow's context bundle from the declaration, so a new channel needs no workflow edit.

### Comments posted by idfkit-bot

Each carries an HTML marker so a rerun finds and edits it instead of posting again, the arrangement `.github/scripts/preview-comment.cjs` already uses.

| Marker | When | Rule |
| --- | --- | --- |
| `<!-- shoebox-triage -->` | Every triaged report | States the bucket or the reason a person is needed, and lists dropped labels or duplicates. Duplicates are named, never closed (FR-023). |
| `<!-- shoebox-starter -->` | Bucket `feature` at filing, or a maintainer relabels to `enhancement` | Folded, headed as a maintainers' draft and not a commitment, conflicts first (FR-028, FR-029). Posted at most once: if the marker is already on the issue, nothing is posted or edited. |

### State: one issue through triage

```text
opened ──► triaged ──────────────► (maintainer relabels) ──► kept as set
   │          │  bucket=feature ─► starter posted (once)
   │          └─ needs a person
   └─ triage failed ──► needs a person (reason: did not run)

labeled enhancement by a human, no starter marker ──► starter posted (once)
```

A human's label always stands: the apply step reads the issue's labels fresh and never removes or replaces a bucket label a human applied (FR-024).
