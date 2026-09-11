# Contract: the triage workflow

`.github/workflows/triage.yml`, with `scripts/triage-context.mjs` and `.github/scripts/triage-apply.cjs`. This fixes triggers, permissions, the two steps and what each may touch. Research R10 to R16 give the reasons.

## Triggers and gate

| Event | Runs when | Mode |
| --- | --- | --- |
| `issues: opened` | sender is not a bot | `triage` |
| `issues: labeled` | label is `enhancement`, sender is not a bot, and the issue has no `<!-- shoebox-starter -->` comment | `starter` |
| `workflow_dispatch` (`issue`, `mode`) | always | as given |

Bot test: `!endsWith(github.event.sender.login, '[bot]')`. Concurrency group `triage-<issue number>`, `cancel-in-progress: false`.

## Secrets and identity

| Name | Scope | Holds |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | repository | One-year subscription token from `claude setup-token`; renewed yearly; tied to the maintainer who made it |
| `APP_ID`, `APP_PRIVATE_KEY` | organisation (exist) | idfkit-bot, as `preview.yml` uses them |

idfkit-bot's installation holds **Issues: read and write**, granted on 2026-09-11 beside Actions write, Contents read and Pull requests write. `CLAUDE_CODE_OAUTH_TOKEN` was added the same day; it expires one year after it was generated.

## Job permissions

```yaml
permissions:
  contents: read
  issues: read
```

`GITHUB_TOKEN` never writes. All writes use the app token.

## Steps

1. **Checkout**, sparse: `.specify/memory/constitution.md`, `CLAUDE.md`, `specs/*/spec.md`, `src/controls.js` and the three modules it imports, `scripts/triage-context.mjs`, `.github/`.
2. **Context** (`node scripts/triage-context.mjs`): reads the issue (from the event, or by number on dispatch), lists open and recently closed issues with `gh issue list` on `GITHUB_TOKEN`, and writes two step outputs, `prompt` and `schema` (compact JSON of [triage-verdict.schema.json](./triage-verdict.schema.json)). The issue body is passed to the script through `env:`, never interpolated.
3. **Claude** (`anthropics/claude-code-action@v1`, `id: claude`, `continue-on-error: true`):

   ```yaml
   with:
     prompt: ${{ steps.context.outputs.prompt }}
     claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
     github_token: ${{ secrets.GITHUB_TOKEN }}
     allowed_non_write_users: "*"
     claude_args: >-
       --model claude-opus-5
       --max-turns 3
       --tools StructuredOutput
       --json-schema '${{ steps.context.outputs.schema }}'
   ```

   No `track_progress`, no `use_sticky_comment`, and one tool: `StructuredOutput`, through which the verdict is returned. Never `--disallowedTools "*"`, which denies that tool too. The schema contains no single quote; the context script asserts it.
4. **Mint app token** (`actions/create-github-app-token`, `app-id`, `private-key`, `owner`, `permission-issues: write`). Runs only after step 3 has ended.
5. **Apply** (`actions/github-script`, app token, `if: always()`), loading `triage-apply.cjs` with the mode, `steps.claude.outputs.conclusion` and `structured_output` from `env:`.

## What the apply script does

In `triage` mode:

1. Ensure the label roster exists (data-model, Labels); create missing labels.
2. Read the issue's current labels. If a human has already applied a bucket label, keep it and skip the bucket (FR-024).
3. Parse the body for the report marker and the failure kinds (report-body contract, Parsing). Apply `from the sheet` or `no captured context`, and the failure labels. These never come from the model.
4. If the Claude step failed, or the verdict is missing or invalid: apply `needs a person` and write the triage comment "Triage did not run: <reason>. Run: <run address>." Stop.
5. Validate the verdict: `bucket` and `needs_person` are exclusive; every area is in the roster (unknown ones dropped and listed); every duplicate number exists and is open or closed within 90 days (others dropped and listed); every conflict's principle matches a constitution heading (others dropped and listed); `starter` present only for `feature`.
6. Apply the bucket label (`feature` as `enhancement`) or `needs a person`, and the `area: <id>` labels.
7. Write or edit the one `<!-- shoebox-triage -->` comment: bucket or reason, likely duplicates as links with their reasons, anything dropped. Never closes, never reopens, never assigns.
8. If the bucket is `feature` and no `<!-- shoebox-starter -->` comment exists, post the starter comment (research R14).

In `starter` mode: steps 4 and 8 only, reading `starter` alone. A missing or invalid starter posts nothing and writes the reason into the triage comment.

## Guarantees

- The model's only channel to the repository is the validated verdict (FR-027).
- Every report ends with a bucket label or `needs a person` (FR-021, FR-026).
- A human's bucket or label is never replaced (FR-024).
- At most one triage comment and one starter comment per issue, found again by marker.
- No untrusted value is interpolated into a shell.
