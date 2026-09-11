/**
 * The report sheet, and the error trap under it.
 *
 * Its own module entry, loaded by its own script tag ahead of `main.js`, for the
 * one reason that decides everything about where it lives: the moments a reader
 * most wants to report are the moments `main.js` is least able to help. The
 * engine and schema loads are top-level awaits there, and a failure anywhere in
 * that module's graph stops every line below it. Wired from here, the Report
 * button and the trap stand whether or not the sheet ever finished starting,
 * and both entries share one instance of `report.js`, so what `main.js` pushes
 * to the trail is what this module reads.
 */
import { fold } from './console.js';
import { BUDGETS, withinBudget } from './copy.js';
import { ENERGYPLUS_VERSION, REVISION, TOOLKIT, revisionHref } from './version.js';
import {
  CapturedItem,
  HEADINGS,
  MISSING,
  Report,
  ReportFile,
  ask,
  buildBody,
  errors,
  handoff,
  trail,
} from './report.js';

/* ── the trap ───────────────────────────────────────────────────────────── */

/**
 * Where an error was thrown, as `file:line:col` with the origin taken off: the
 * path is what a maintainer looks up, and the host is the same for every line.
 */
function whereOf(filename, line, column) {
  if (!filename) return MISSING;
  let path = filename;
  try {
    path = new URL(filename).pathname;
  } catch {
    // Not a URL (an inline script reports its document); keep it as given.
  }
  return `${path}:${line ?? MISSING}:${column ?? MISSING}`;
}

// Errors `main.js` has already recorded, and stated on the sheet, carry
// `reported`; recording them again here would list one failure twice.
window.addEventListener('error', (event) => {
  if (event.error?.reported) return;
  errors.record({
    source: 'error',
    message: event.message || String(event.error ?? MISSING),
    where: whereOf(event.filename, event.lineno, event.colno),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason?.reported) return;
  errors.record({ source: 'rejection', message: reason?.message ?? String(reason ?? MISSING) });
});

/* ── what the sheet says ────────────────────────────────────────────────── */

// Every always-visible word the report letters, declared once and held to its
// budget at load, the way the console's fold summaries are. A string that has
// grown past its budget stops the page naming itself, rather than growing the
// slip into a page of instructions.
const COPY = Object.freeze({
  heading: withinBudget(BUDGETS.SUMMARY, 'report heading', 'Report a problem or an idea'),
  standing: withinBudget(
    BUDGETS.BLOCK,
    'report standing line',
    'It becomes a public issue on GitHub. You need a GitHub account to submit it.',
  ),
  ask: withinBudget(BUDGETS.SUMMARY, 'report field label', 'What happened, or what would help?'),
  always: withinBudget(BUDGETS.SUMMARY, 'report fixed item', 'Always included.'),
  removed: withinBudget(BUDGETS.SUMMARY, 'report removed item', 'Removed'),
  remove: withinBudget(BUDGETS.SUMMARY, 'report remove', 'Remove'),
  putBack: withinBudget(BUDGETS.SUMMARY, 'report put back', 'Put back'),
  preview: withinBudget(BUDGETS.SUMMARY, 'report preview fold', 'Exactly what is sent'),
  open: withinBudget(BUDGETS.SUMMARY, 'report open', 'Open on GitHub'),
  sends: withinBudget(
    BUDGETS.STANDING,
    'report open standing line',
    'Sends this text to GitHub to fill the form. You submit it there.',
  ),
  copy: withinBudget(BUDGETS.SUMMARY, 'report copy', 'Copy text'),
  file: withinBudget(BUDGETS.SUMMARY, 'report file', 'Report as a file'),
  picture: withinBudget(BUDGETS.SUMMARY, 'report picture', 'Picture of the sheet'),
  noPicture: withinBudget(
    BUDGETS.STANDING,
    'report picture unavailable',
    "Not available in this browser. Use your device's screenshot.",
  ),
  runFiles: withinBudget(BUDGETS.SUMMARY, 'report run files', 'Run files'),
  signed: withinBudget(BUDGETS.SUMMARY, 'report run files signed', 'Run files, signed'),
  unsigned: withinBudget(BUDGETS.SUMMARY, 'report run files unsigned', 'Run files, unsigned'),
  signedNote: withinBudget(BUDGETS.STANDING, 'report signed note', 'The signed model file carries your name.'),
  noRun: withinBudget(BUDGETS.STANDING, 'report no run', 'No run yet.'),
  close: withinBudget(BUDGETS.SUMMARY, 'report close', 'Close'),
  needsWords: withinBudget(BUDGETS.STANDING, 'report needs words', 'Describe the problem or idea first.'),
  notStarted: withinBudget(BUDGETS.STANDING, 'report not started', 'The sheet had not finished starting.'),
});

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const linkButton = (text) => {
  const button = el('button', 'link', text);
  button.type = 'button';
  return button;
};

const openBtn = $('report-open');
const sheet = $('report');
const field = $('report-text');
const itemsHost = $('report-items');
const filesHost = $('report-files');
const previewHost = $('report-preview');
const actionsHost = $('report-actions');
const needsEl = $('report-needs');
const outcomeEl = $('report-outcome');

withinBudget(BUDGETS.SUMMARY, 'report button', openBtn.textContent.trim());
$('report-title').textContent = COPY.heading;
$('report-standing').textContent = COPY.standing;
$('report-ask').textContent = COPY.ask;

/* ── what the report carries ────────────────────────────────────────────── */

/** One line per summary, what the item holds, lettered beside its tick. */
const summaries = new Map();

function buildItem() {
  // Which kind of build this is, in words, so a report from a pull request
  // preview or from `main` never reads as a release (story 2, scenario 2).
  const kind = REVISION.tag ? 'release' : REVISION.commit ? 'development build' : 'revision unknown';
  const version = REVISION.version ?? MISSING;
  summaries.set('build', `${version}, EnergyPlus ${ENERGYPLUS_VERSION}`);
  return new CapturedItem({
    id: 'build',
    label: HEADINGS.build,
    lines: [
      `- Sheet: ${version} (${kind}) ${revisionHref() ?? MISSING}`,
      `- EnergyPlus: ${ENERGYPLUS_VERSION}`,
      `- Toolkit: @idfkit/core ${TOOLKIT ?? MISSING}`,
    ],
  });
}

/** Read back the layout the stylesheet chose, never restating its thresholds. */
function flag(selector, property) {
  const node = document.querySelector(selector);
  return node ? getComputedStyle(node).getPropertyValue(property).trim() === '1' : null;
}

const coarse = () => matchMedia('(pointer: coarse)').matches;

function environmentItem() {
  const data = navigator.userAgentData;
  const brands = data?.brands?.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`);
  const browser = brands?.length ? `${brands.join(', ')} on ${data.platform || MISSING}` : navigator.userAgent;
  const index = flag('.strips', '--index');
  const folded = flag('.presets', '--fold');
  const layout =
    index === null && folded === null
      ? MISSING
      : [index ? 'index sheet' : 'sheet', folded ? 'folded register' : null].filter(Boolean).join(', ');
  const pointer = coarse() ? 'coarse' : 'fine';
  const size = `${innerWidth} × ${innerHeight}`;
  summaries.set('environment', `${size}, ${layout}, ${pointer} pointer`);
  return new CapturedItem({
    id: 'environment',
    label: HEADINGS.environment,
    lines: [
      `- Browser: ${browser}`,
      `- Window: ${size}, screen ${screen.width} × ${screen.height}`,
      `- Layout: ${layout}`,
      `- Pointer: ${pointer}`,
    ],
  });
}

function sheetItems() {
  const facts = ask('screen');
  if (!facts) {
    // `main.js` registers what it knows at the very end of its boot, so an
    // absent provider means the boot stopped short, and the report says so
    // with whatever it did manage to record about why.
    const boot = errors.entries().filter((e) => e.source === 'boot');
    summaries.set('desk', MISSING);
    summaries.set('screen', boot[0]?.message ?? COPY.notStarted);
    summaries.set('log', 'No run yet');
    return [
      new CapturedItem({ id: 'desk', label: HEADINGS.desk, lines: [`- Link: ${MISSING}`] }),
      new CapturedItem({
        id: 'screen',
        label: HEADINGS.screen,
        lines: [`- ${COPY.notStarted}`, ...boot.map((e) => `- ${e.message}`)],
      }),
      new CapturedItem({ id: 'log', label: HEADINGS.log, lines: ['No run has been made.'] }),
    ];
  }
  summaries.set('desk', facts.deskSummary);
  summaries.set('screen', facts.screenSummary);
  summaries.set('log', facts.logSummary);
  return [
    new CapturedItem({ id: 'desk', label: HEADINGS.desk, lines: facts.desk }),
    new CapturedItem({ id: 'screen', label: HEADINGS.screen, lines: facts.screen }),
    new CapturedItem({ id: 'log', label: HEADINGS.log, lines: facts.log, fence: facts.fence }),
  ];
}

function errorsItem() {
  const caught = errors.entries();
  const lines = caught.map((e) => `- ${e.at} s, ${e.source}: ${e.message} (${e.where})`);
  if (errors.overflow) lines.push(`- and ${errors.overflow} more`);
  const count = caught.length + errors.overflow;
  summaries.set('errors', count ? `${count} caught` : 'None caught');
  return new CapturedItem({ id: 'errors', label: HEADINGS.errors, lines: lines.length ? lines : ['None caught.'] });
}

function trailItem() {
  const moves = trail.entries();
  summaries.set('trail', moves.length ? `${moves.length} recorded` : 'None yet');
  return new CapturedItem({
    id: 'trail',
    label: HEADINGS.trail,
    lines: moves.length ? moves.map((e) => `- ${e.at} s, ${e.kind}: ${e.text}`) : ['None yet.'],
  });
}

const report = new Report();

function capture() {
  report.capture([buildItem(), ...sheetItems(), environmentItem(), errorsItem(), trailItem()], {
    stem: ask('screen')?.stem ?? 'sheet',
  });
}

/* ── drawing it ─────────────────────────────────────────────────────────── */

function renderItems() {
  itemsHost.replaceChildren(
    ...report.items.map((item) => {
      const removed = report.removed.has(item.id);
      const row = el('li', removed ? 'report-item removed' : 'report-item');
      const text = el('div', 'report-item-text');
      text.append(
        el('span', 'report-item-label', item.label),
        el('span', 'report-item-summary', removed ? COPY.removed : summaries.get(item.id) ?? MISSING),
      );
      row.append(text);
      if (item.removable) {
        const toggle = linkButton(removed ? COPY.putBack : COPY.remove);
        toggle.setAttribute('aria-pressed', String(removed));
        toggle.setAttribute('aria-label', `${removed ? COPY.putBack : COPY.remove}: ${item.label}`);
        toggle.dataset.item = item.id;
        toggle.addEventListener('click', () => {
          report.toggle(item.id);
          renderItems();
          renderPreview();
          // The row was redrawn; keep the reader's place on its toggle.
          itemsHost.querySelector(`[data-item="${item.id}"]`)?.focus();
        });
        row.append(toggle);
      } else {
        row.append(el('span', 'report-item-fixed', COPY.always));
      }
      return row;
    }),
  );
}

const pre = el('pre');
let previewDrawn = false;

/**
 * The preview is the body the link will carry, trim note and all, because that
 * is what "exactly what is sent" has to mean. Copy and the file carry the whole
 * body, which the trim note points at.
 */
function renderPreview() {
  pre.textContent = handoff(report).body;
  if (!previewDrawn) {
    const node = fold('report:preview', COPY.preview, {}, pre);
    previewHost.replaceChildren(node);
    // Open the first time in a session; after that the reader's own choice
    // stands, kept by `fold()` the way every other fold on the sheet is.
    node.open = true;
    previewDrawn = true;
  }
}

/** Save a text or binary file with the download's own pattern. */
function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  // Freed later rather than at once, for the reason the run download gives:
  // some browsers are still reading the blob when `click()` returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function say(text, { bad = false, link = null } = {}) {
  outcomeEl.className = bad ? 'status report-outcome bad' : 'status report-outcome';
  outcomeEl.replaceChildren(text);
  if (link) {
    const a = Object.assign(document.createElement('a'), { href: link, target: '_blank', rel: 'noreferrer' });
    a.textContent = 'the form on GitHub';
    outcomeEl.append(' ', a, '.');
  }
}

/** A file saved for the report joins the body's "Files to attach". */
function filed(file) {
  report.addFile(file);
  renderPreview();
  say(`Saved ${file.filename}. Attach it to the issue on GitHub.`);
}

/* ── files: all opt-in ──────────────────────────────────────────────────── */

const pictureSlot = el('div', 'report-file');
const runSlot = el('div', 'report-file');
const fileSlot = el('div', 'report-file');
filesHost.append(pictureSlot, runSlot, fileSlot);

const canCapture = () => Boolean(navigator.mediaDevices?.getDisplayMedia) && !coarse();
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * A picture of the sheet, taken by the browser's own screen capture so it is
 * exactly what the reader sees, fonts and all, with no library (Principle V).
 * Desktop browsers offer it and no phone does, so the offer says so there
 * rather than failing on a press. The report sheet is hidden for the frame, so
 * the picture is of the sheet being reported and not of the report.
 */
async function takePicture() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    });
  } catch (error) {
    say(`No picture taken: ${error.message || error.name}.`, { bad: true });
    return;
  }
  sheet.hidden = true;
  try {
    const video = Object.assign(document.createElement('video'), { muted: true, srcObject: stream });
    await video.play();
    // Two frames and a beat, so the capture has caught up with the sheet
    // being hidden before the frame is taken.
    await nextFrame();
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const canvas = Object.assign(document.createElement('canvas'), { width: video.videoWidth, height: video.videoHeight });
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('the frame could not be encoded');
    const filename = report.filename('picture', 'png');
    save(blob, filename);
    filed(new ReportFile({ kind: 'picture', filename }));
  } catch (error) {
    say(`No picture taken: ${error.message}.`, { bad: true });
  } finally {
    for (const track of stream.getTracks()) track.stop();
    sheet.hidden = false;
  }
}

function renderPicture() {
  const button = linkButton(COPY.picture);
  pictureSlot.replaceChildren(button);
  if (!canCapture()) {
    button.disabled = true;
    pictureSlot.append(el('p', 'report-reason', COPY.noPicture));
    return;
  }
  button.addEventListener('click', takePicture);
}

/** The run bundle the Download button makes, signed or not, from `main.js`. */
function renderRunFiles() {
  const files = ask('runFiles');
  if (!files?.available) {
    const button = linkButton(COPY.runFiles);
    button.disabled = true;
    runSlot.replaceChildren(button, el('p', 'report-reason', COPY.noRun));
    return;
  }
  const choices = files.signed ? [[COPY.signed, true], [COPY.unsigned, false]] : [[COPY.runFiles, false]];
  runSlot.replaceChildren(
    ...choices.map(([label, withSignature]) => {
      const button = linkButton(label);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const { blob } = await files.build(withSignature);
          const filename = report.filename(withSignature ? 'bundle-signed' : 'bundle', 'zip');
          save(blob, filename);
          filed(new ReportFile({ kind: 'bundle', filename, signed: withSignature }));
        } catch (error) {
          say(`The run could not be bundled: ${error.message}`, { bad: true });
        } finally {
          button.disabled = false;
        }
      });
      return button;
    }),
    ...(files.signed ? [el('p', 'report-reason', COPY.signedNote)] : []),
  );
}

const fileBtn = linkButton(COPY.file);
fileBtn.addEventListener('click', () => {
  const filename = report.filename('report', 'txt');
  save(new Blob([buildBody(report)], { type: 'text/plain' }), filename);
  filed(new ReportFile({ kind: 'report', filename }));
});
fileSlot.append(fileBtn);

/* ── sending ────────────────────────────────────────────────────────────── */

const sendBtn = linkButton(COPY.open);
const sendSlot = el('div', 'report-send');
sendSlot.append(sendBtn, el('p', 'report-reason', COPY.sends));

sendBtn.addEventListener('click', async () => {
  const sent = handoff(report);
  // Both started inside the press, since the clipboard and a new tab each ask
  // for a gesture. The tab is opened without `noopener` so a blocked one can be
  // told from an opened one (with it, `window.open` answers null either way),
  // and the tab's hold on this page is cut at once instead.
  const copying = navigator.clipboard?.writeText(sent.body) ?? Promise.reject(new Error('no clipboard'));
  const tab = window.open(sent.url, '_blank');
  if (tab) tab.opener = null;
  const copied = await copying.then(
    () => true,
    () => false,
  );
  if (!tab) {
    say('The browser blocked the new tab. Open', { bad: true, link: sent.url });
    outcomeEl.append(` ${copied ? 'The text is copied.' : 'Could not copy here; use Copy text or the preview.'}`);
    return;
  }
  const lines = [];
  if (sent.outcome === 'whole') lines.push('Opened on GitHub, and copied as well in case the form opens empty.');
  else if (sent.outcome === 'trimmed') {
    lines.push(
      'Opened on GitHub, and copied as well in case the form opens empty.',
      `The oldest ${sent.trimmed} log lines did not fit; attach the report file for all of them.`,
    );
  } else lines.push('The report was too long for the link. Attach the report file on GitHub.');
  if (!copied) lines.push('Could not copy here; use Copy text or the preview.');
  say(lines.join(' '), { bad: !copied || !sent.fits });
});

const copyBtn = linkButton(COPY.copy);
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildBody(report));
    say('Copied.');
  } catch {
    say('Could not copy here; select the preview and copy it by hand.', { bad: true });
  }
});

const closeBtn = linkButton(COPY.close);
closeBtn.addEventListener('click', () => close());

actionsHost.append(sendSlot, copyBtn, closeBtn);

/** Nothing leaves, and nothing is saved, without the reader's own words. */
function syncReady() {
  const ready = report.ready;
  for (const button of [sendBtn, copyBtn, fileBtn]) button.disabled = !ready;
  needsEl.textContent = ready ? '' : COPY.needsWords;
}

field.addEventListener('input', () => {
  report.description = field.value;
  syncReady();
  renderPreview();
});

/* ── opening and closing ────────────────────────────────────────────────── */

function open() {
  capture();
  renderItems();
  renderPicture();
  renderRunFiles();
  renderPreview();
  syncReady();
  outcomeEl.replaceChildren();
  sheet.hidden = false;
  openBtn.setAttribute('aria-expanded', 'true');
  field.focus();
}

function close() {
  sheet.hidden = true;
  openBtn.setAttribute('aria-expanded', 'false');
  openBtn.focus();
}

openBtn.addEventListener('click', () => (sheet.hidden ? open() : close()));
