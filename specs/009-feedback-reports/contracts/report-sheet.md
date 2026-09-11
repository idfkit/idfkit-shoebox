# Contract: the report sheet on the page

What the reader meets. The visual form is settled through `/interface-design:init` and recorded in `.interface-design/system.md` (workflow gate 8); this contract fixes behaviour, structure and copy.

## Entry

- A link-button **Report** in the ledger's action row, after Download, Share and Save (`index.html:5037-5052`). Static markup, wired by `src/report-sheet.js`, so it works when `main.js` never finishes booting (FR-001).
- `aria-expanded` and `aria-controls="report"` on the button, as `#site-field` does for the picker.

## The sheet

`<section class="report" id="report" hidden aria-labelledby="report-title">`, in the flow of the field column directly under the status row (`.status-row`) and above the plate. Never a dialog, never over the drawing (research R6). The ledger column is 172 px wide, too narrow for a field and a preview, so the button lives there with the other ways out and the sheet opens beside the status line it most often reports.

In order, one column at every width:

1. **Heading and standing line.** "Report a problem or an idea", then one line in view: "It becomes a public issue on GitHub. You need a GitHub account to submit it." (FR-003; within `BLOCK`.)
2. **Description.** A `<textarea>` labelled "What happened, or what would help?" Required. Focus lands here on opening.
3. **What else goes with it.** One row per captured item: its label, a one-line summary, and a **Remove** / **Put back** toggle (`aria-pressed`). The build row has no toggle and says "Always included."
4. **Files.** Three buttons, each saving a file and adding a line to the body's "Files to attach":
   - **Picture of the sheet**, or disabled with "Not available in this browser. Use your device's screenshot." (research R8)
   - **Run files**, with **Signed** / **Unsigned** when the sheet is signed, and the note "The signed model file carries your name." Disabled with "No run yet" before any run.
   - **Report as a file**, always available (FR-016).
5. **Preview.** A `<pre>` holding the exact body, in a `fold()` titled "Exactly what is sent" so the sheet stays short; the fold is open on first use.
6. **Actions.**
   - **Open on GitHub**, with the line beside it: "Sends this text to GitHub to fill the form. You submit it there." (FR-015.) On press: write the body to the clipboard, then open the tab.
   - **Copy text** (FR-016).
   - **Close**, which hides the sheet and returns focus to the Report button. The description is kept for the session (FR-004).

Disabled controls state why in text next to them, never only by dimming (Principle IV; system.md "A refusal that carries its next step").

## After "Open on GitHub"

| Outcome | What the sheet says, in place |
| --- | --- |
| Tab opened, whole report fitted | "Opened on GitHub, and copied as well in case the form opens empty." |
| Tab opened, log trimmed | the above, plus "The oldest <n> log lines did not fit; attach the report file for all of them." and the Report-as-a-file button is highlighted |
| Tab opened, report did not fit | "The report was too long for the link. Attach the report file on GitHub." |
| Tab blocked | "The browser blocked the new tab. Open the form here: <link>. The text is copied." |
| Clipboard refused | "Could not copy here; use Copy text or the preview." |

## Reuse and budgets

- `fold()` from `src/console.js` for the preview; `.link` buttons as in the action row; `hidden` for every show and hide (with a `[hidden]` twin for any class that sets `display`, per `CLAUDE.md`).
- Every string above that is always in view is declared once in `src/report-sheet.js` and asserted at load against `src/copy.js`: labels and button text against `SUMMARY`, standing lines against `STANDING` or `BLOCK`.
- Nothing is explained only on hover; nothing depends on `title` attributes.

## Keyboard and screen readers

Open, write, remove items, save files, read the preview and hand off with Tab and Enter or Space alone. Each captured item's toggle is announced with the item's name ("Remove recent actions"). Outcome lines are written into a `role="status"` element so they are announced.
