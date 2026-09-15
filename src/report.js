/**
 * A report of what the reader was looking at, as text they read before it
 * leaves.
 *
 * The sheet is reproducible from two short strings, the link and the build,
 * so a report does not have to carry the model to let a maintainer see it. What
 * those two strings cannot carry is what happened on the reader's own machine:
 * the lines the engine wrote, the sentence the sheet showed, the browser and the
 * window it showed it in, what the reader did just before. This module holds
 * those facts as typed records and turns them into the one body the reader
 * previews, copies and hands to the tracker.
 *
 * DOM-free and network-free, like `readings.js` and `describe.js`, so a Node
 * harness builds bodies from the real code. It never reaches into `main.js`:
 * the facts only `main.js` holds arrive through the small registry at the foot
 * (`provide` / `ask`), so the report can open on a sheet whose boot never got as
 * far as registering anything, and say so, rather than import state that does
 * not exist yet.
 */

/** How the sheet letters a value it does not have. Never blank, never zero. */
export const MISSING = '—';

/**
 * The first line of every body filed from the sheet. Triage reads it to tell a
 * report that carries captured context from one typed by hand, so its version
 * moves whenever the body's layout does.
 */
export const MARKER = '<!-- shoebox-report v1 -->';

/**
 * The longest new-issue address the hand-off will build. GitHub publishes no
 * limit; measured against github.com/cli/cli/issues/new without signing in, it
 * redirects normally up to about 6,050 characters, answers 500 at 7,051 and 414
 * from 9,051. 5,500 leaves room for a longer repository path and for encoders
 * that escape more than `encodeURIComponent` does.
 */
export const ADDRESS_LIMIT = 5500;

/**
 * Twenty covers a drag, a patch, a run and a refusal with room to spare, and at
 * one line each stays under a tenth of the address budget.
 */
export const TRAIL_LIMIT = 20;
export const ERROR_LIMIT = 20;

const ITEM_IDS = Object.freeze(['build', 'desk', 'environment', 'screen', 'log', 'errors', 'trail']);
/** Each item's heading in the body, and its name on the sheet: one string for both. */
export const HEADINGS = Object.freeze({
  build: 'Build',
  desk: 'Desk',
  environment: 'Environment',
  screen: 'On screen',
  log: 'Engine log',
  errors: 'Page errors',
  trail: 'Recent actions',
});
const TRAIL_KINDS = Object.freeze(['control', 'patch', 'run', 'link', 'station', 'refusal']);
const ERROR_SOURCES = Object.freeze(['error', 'rejection', 'boot']);
const FILE_KINDS = Object.freeze(['picture', 'bundle', 'report']);
const PROVIDERS = Object.freeze(['screen', 'runFiles', 'refusedLink']);

/**
 * Seconds since the page loaded, to a tenth. Not a clock: a report says the
 * run started 3.9 s in, which is the order of events a maintainer needs, and
 * says nothing about the reader's timezone.
 */
const since = () => Math.round(performance.now() / 100) / 10;

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

function must(ok, message) {
  if (!ok) throw new Error(message);
}

/** A named part of what the page adds to a report. */
export class CapturedItem {
  constructor({ id, label, lines, fence = null }) {
    must(ITEM_IDS.includes(id), `CapturedItem: unknown id ${id}`);
    must(typeof label === 'string' && label, `CapturedItem ${id}: a label is required`);
    must(Array.isArray(lines) && lines.every((l) => typeof l === 'string'), `CapturedItem ${id}: lines must be strings`);
    must(fence === null || (Array.isArray(fence) && fence.every((l) => typeof l === 'string')), `CapturedItem ${id}: fence must be strings or null`);
    this.id = id;
    this.label = label;
    this.lines = Object.freeze([...lines]);
    this.fence = fence === null ? null : Object.freeze([...fence]);
    // The build is what makes every other line interpretable, so it is the one
    // enclosure the reader cannot take out.
    this.removable = id !== 'build';
    Object.freeze(this);
  }
}

export class TrailEntry {
  constructor({ at, kind, text, key = null }) {
    must(TRAIL_KINDS.includes(kind), `TrailEntry: unknown kind ${kind}`);
    this.at = at;
    this.kind = kind;
    this.text = oneLine(text);
    this.key = key;
    Object.freeze(this);
  }
}

/**
 * The reader's last few moves on the desk, in memory only.
 *
 * A drag commits a value fifty times a second and, with auto-solve on, starts a
 * design day after each one, so the raw sequence is slider, run, slider, run.
 * Kept one per event, twenty entries would be ten positions of one slider. So a
 * keyed entry replaces its own earlier copy when that copy is among the last
 * few, and moves to the end: a drag reads as one move and one run, and a
 * control returned to after something else is recorded again.
 */
const COALESCE_WITHIN = 4;

export class Trail {
  #entries = [];

  push(kind, text, { key = null } = {}) {
    const entry = new TrailEntry({ at: since(), kind, text, key });
    if (key) {
      const from = Math.max(0, this.#entries.length - COALESCE_WITHIN);
      const earlier = this.#entries.findIndex((e, i) => i >= from && e.kind === kind && e.key === key);
      if (earlier !== -1) this.#entries.splice(earlier, 1);
    }
    this.#entries.push(entry);
    if (this.#entries.length > TRAIL_LIMIT) this.#entries.shift();
    return entry;
  }

  entries() {
    return Object.freeze([...this.#entries]);
  }
}

export class PageError {
  constructor({ at = since(), source, message, where = MISSING }) {
    must(ERROR_SOURCES.includes(source), `PageError: unknown source ${source}`);
    this.at = at;
    this.source = source;
    this.message = oneLine(message) || MISSING;
    this.where = where || MISSING;
    Object.freeze(this);
  }
}

/**
 * Unexpected errors caught this session. Past the limit they are counted, not
 * dropped: a report that stopped listing at twenty without saying so would read
 * as twenty errors.
 */
export class ErrorLog {
  #list = [];
  #more = 0;

  record(fields) {
    const error = fields instanceof PageError ? fields : new PageError(fields);
    if (this.#list.length < ERROR_LIMIT) this.#list.push(error);
    else this.#more += 1;
    return error;
  }

  entries() {
    return Object.freeze([...this.#list]);
  }

  get overflow() {
    return this.#more;
  }
}

export class ReportFile {
  constructor({ kind, filename, signed = null }) {
    must(FILE_KINDS.includes(kind), `ReportFile: unknown kind ${kind}`);
    must(typeof filename === 'string' && filename, 'ReportFile: a filename is required');
    must(kind === 'bundle' ? typeof signed === 'boolean' : signed === null, `ReportFile ${kind}: signed applies to the bundle only`);
    this.kind = kind;
    this.filename = filename;
    this.signed = signed;
    Object.freeze(this);
  }
}

/** One reader's account of one problem. Lives for the session only. */
export class Report {
  constructor() {
    this.description = '';
    this.items = Object.freeze([]);
    this.removed = new Set();
    this.files = [];
    // What saved files are named after: the station and run kind the run
    // bundle already names itself by, or `sheet` before there is one.
    this.stem = 'sheet';
  }

  /** Replace the captured items, keeping the reader's removals where they still apply. */
  capture(items, { stem = this.stem } = {}) {
    must(items.every((item) => item instanceof CapturedItem), 'Report.capture: items must be CapturedItem');
    this.items = Object.freeze([...items].sort((a, b) => ITEM_IDS.indexOf(a.id) - ITEM_IDS.indexOf(b.id)));
    for (const id of this.removed) if (!this.items.some((item) => item.id === id)) this.removed.delete(id);
    this.stem = stem;
  }

  toggle(id) {
    const item = this.items.find((i) => i.id === id);
    must(item, `Report.toggle: no captured item ${id}`);
    must(item.removable, `Report.toggle: ${id} is always included`);
    if (this.removed.has(id)) this.removed.delete(id);
    else this.removed.add(id);
  }

  /** A file of the same kind (and signature) replaces the earlier one. */
  addFile(file) {
    must(file instanceof ReportFile, 'Report.addFile: a ReportFile is required');
    this.files = this.files.filter((f) => !(f.kind === file.kind && f.signed === file.signed));
    this.files.push(file);
  }

  filename(kind, ext) {
    return `shoebox-report-${this.stem}-${kind}.${ext}`;
  }

  get title() {
    return titleOf(this.description);
  }

  get ready() {
    return this.description.trim().length > 0;
  }
}

/** The description's first line, cut at a word boundary to at most 80 characters. */
export function titleOf(description) {
  const first = String(description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return '';
  if (first.length <= 80) return first;
  const cut = first.slice(0, 80);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).trimEnd();
}

/**
 * The body, exactly as the preview shows it and the tracker will store it.
 * `fence` overrides the log item's lines, which is how the trim shortens it,
 * and `trimmed` is how many it dropped.
 *
 * Every paragraph is one line. Issue bodies render a single newline as a line
 * break, so a body wrapped in the source is wrapped again on every screen
 * narrower than the column it was wrapped at.
 */
export function buildBody(report, { fence = null, trimmed = 0 } = {}) {
  // No blank line for a description not yet written: the preview shows the
  // body as it stands, and two empty lines under the marker read as a gap.
  const out = [MARKER, ...(report.description.trim() ? [report.description.trim()] : [])];
  for (const item of report.items) {
    if (report.removed.has(item.id)) continue;
    out.push('', `### ${HEADINGS[item.id]}`, ...item.lines);
    const lines = item.id === 'log' && fence ? fence : item.fence;
    if (lines && lines.length) out.push('', '```text', ...lines, '```');
    if (item.id === 'log' && trimmed > 0) {
      out.push('', `The oldest ${trimmed} lines were removed to fit the link; the saved report file has them all.`);
    }
  }
  out.push('', '### Files to attach');
  if (report.files.length) {
    for (const file of report.files) {
      out.push(`- ${file.filename}${file.kind === 'bundle' ? ` (${file.signed ? 'signed' : 'unsigned'})` : ''}`);
    }
  } else {
    out.push('None.');
  }
  const removed = report.items.filter((item) => report.removed.has(item.id));
  if (removed.length) out.push('', '### Removed by the reporter', ...removed.map((item) => `- ${item.label}`));
  return out.join('\n');
}

/** Which body the hand-off sent, and at what cost. */
export class Handoff {
  constructor({ url, body, trimmed, outcome }) {
    must(['whole', 'trimmed', 'short', 'bare'].includes(outcome), `Handoff: unknown outcome ${outcome}`);
    this.url = url;
    this.body = body;
    this.trimmed = trimmed;
    this.outcome = outcome;
    this.fits = outcome === 'whole' || outcome === 'trimmed';
    Object.freeze(this);
  }
}

/**
 * The new-issue address for a report, held to `ADDRESS_LIMIT`.
 *
 * Title and body, and never `labels`: GitHub documents that the parameter needs
 * permission to label, and that without it the address answers 404. A reader is
 * almost never a collaborator, so a label here would break the hand-off for the
 * people it exists for; triage labels afterwards.
 *
 * When the whole body is too long, log lines go first, oldest first, because
 * the saved report file carries all of them and the tail is where a fatal is.
 */
export function handoff(report, { repository = 'idfkit/idfkit-shoebox' } = {}) {
  const base = `https://github.com/${repository}/issues/new?title=${encodeURIComponent(report.title)}&body=`;
  const address = (body) => base + encodeURIComponent(body);

  const whole = buildBody(report);
  if (address(whole).length <= ADDRESS_LIMIT) return new Handoff({ url: address(whole), body: whole, trimmed: 0, outcome: 'whole' });

  const log = report.items.find((item) => item.id === 'log' && !report.removed.has(item.id) && item.fence?.length);
  if (log) {
    // The smallest cut that fits, found by halving: a fatal run writes a few
    // hundred lines and encoding each candidate is the expensive part.
    const bodyWithout = (n) => buildBody(report, { fence: log.fence.slice(n), trimmed: n });
    if (address(bodyWithout(log.fence.length)).length <= ADDRESS_LIMIT) {
      let lo = 1;
      let hi = log.fence.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (address(bodyWithout(mid)).length <= ADDRESS_LIMIT) hi = mid;
        else lo = mid + 1;
      }
      const body = bodyWithout(lo);
      return new Handoff({ url: address(body), body, trimmed: lo, outcome: 'trimmed' });
    }
  }

  const file = report.filename('report', 'txt');
  const short = [MARKER, report.description.trim(), '', `The full report did not fit in the link. It is attached as ${file}.`].join('\n');
  if (address(short).length <= ADDRESS_LIMIT) return new Handoff({ url: address(short), body: short, trimmed: 0, outcome: 'short' });

  const bare = [MARKER, '', `The report did not fit in the link, its description included. It is attached as ${file}.`].join('\n');
  return new Handoff({ url: address(bare), body: bare, trimmed: 0, outcome: 'bare' });
}

/* ── the registry ───────────────────────────────────────────────────────────
 *
 * Three facts live only in `main.js`: what the sheet is showing, the last run's
 * files, and a link it refused. `main.js` provides each once its state exists;
 * the sheet asks when it opens. An absent provider answers null, and the sheet
 * letters that as a statement ("the sheet had not finished starting"), never as
 * a substitute value.
 */

const providers = new Map();

export function provide(name, fn) {
  must(PROVIDERS.includes(name), `provide: unknown provider ${name}`);
  must(typeof fn === 'function', `provide ${name}: a function is required`);
  providers.set(name, fn);
}

export function ask(name, ...args) {
  must(PROVIDERS.includes(name), `ask: unknown provider ${name}`);
  const fn = providers.get(name);
  return fn ? fn(...args) : null;
}

/** The one trail and the one error log, shared by both module entries. */
export const trail = new Trail();
export const errors = new ErrorLog();
