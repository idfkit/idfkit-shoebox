# Contract: the report body

The one string both halves agree on. The page writes it (`buildBody` in `src/report.js`), the reader sees it verbatim in the preview, the tracker stores it, and triage reads it back. Version `v1`.

## Rules

- **What the preview shows is what is sent.** The preview renders this exact string, character for character (FR-013, SC-007).
- **GFM with hard line breaks.** Issue bodies render a single newline as a line break, so every paragraph is one line and wrapping is left to the reader's screen (the same rule `preview.yml` records).
- **Missing is an em dash.** A value the page does not have is `—`, never blank or zero.
- **Removed items say so.** A removed item's section is replaced by one line in the last section; its content is not sent.
- **Title**: the description's first line, cut at a word boundary to at most 80 characters. Never prefixed with a bucket; triage owns buckets.

## Layout

```markdown
<!-- shoebox-report v1 -->
<the reader's description, as typed>

### Build
- Sheet: 0.2.0+cd5881e (<revisionHref() or —>)
- EnergyPlus: 26.1.0
- Toolkit: @idfkit/core <TOOLKIT or —>

### Desk
- Link: <schemeUrl()>
  or, after a refused link:
- Refused link: `<the hash exactly as typed>`
- Reason given: <refusalNote>

### Environment
- Browser: <brand and version> on <OS>
- Window: 1440 × 900, screen 2560 × 1440
- Layout: sheet | index | folded register
- Pointer: fine | coarse

### On screen
- Status: <the status line's text> (failure | normal)
- Readings: from a design-day run | from an annual run | none yet; current | stale, from an earlier desk | run in flight
- In view: <each refusal, failure or blocking reason, one per line, with its channel>
- Studies: <n of m samples solved> | none running
- Survey: <measured / wanted, gaps> | none running

### Engine log
- Last run: <severe> severe, <warnings> warnings, exit <code>
- Failure: <lastBundle.failure or —>

```text
<severe and fatal lines, oldest first>
```

<if trimmed: "The oldest <n> lines were removed to fit the link; the saved report file has them all.">

### Page errors
- 12.4 s, rejection: <message> (<file:line:col or —>)
(or "None caught.")

### Recent actions
- 3.1 s, control: Glazing, south wall 0.35
- 3.9 s, run: design day started
(or "None yet.")

### Files to attach
- shoebox-report-boston-annual-picture.png
- shoebox-report-boston-annual-bundle.zip (signed | unsigned)
(or "None.")

### Removed by the reporter
- Recent actions
(omitted when nothing was removed)
```

## Parsing, for triage

The apply step reads only what it needs, and never from the model:

| Fact | How it is found |
| --- | --- |
| Filed from the sheet | The first line is exactly `<!-- shoebox-report v1 -->` |
| Run failed | `### Engine log` has a `Failure:` value other than `—`. Not the status line: it also reads `(failure)` for a refused link or station, which have labels of their own |
| Link refused | `### Desk` contains `- Refused link:` |
| Station refused | a sub-item under `In view:` in `### On screen` begins `- Station refused` |

A body with a marker of another version is treated as filed by hand and labelled `no captured context`, rather than parsed by rules written for `v1`.

## Length

The whole address, `…/issues/new?title=<enc>&body=<enc>`, is at most 5,500 characters (research R3). The trim removes log lines from the top of the fenced block. When the address still does not fit, the sent body is:

```markdown
<!-- shoebox-report v1 -->
<the reader's description>

The full report did not fit in the link. It is attached as shoebox-report-<stem>-report.txt.
```

and the sheet states that before the tab opens.
