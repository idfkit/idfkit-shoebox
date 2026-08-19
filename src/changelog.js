/**
 * CHANGELOG.md, piped onto the sheet as a revision block instead of
 * transcribed into the markup — the same rule `controls.js` keeps for a
 * control declared once and drawn everywhere it appears. The file the
 * repository keeps is the file the reader sees; nothing here is retyped.
 *
 * Parsing is DOM-free (`parseChangelog`), so a throwaway Node script can
 * assert it against the real file the way `model.js` and `permalink.js` are
 * verified. `renderInline` and `mountChangelog` are the only parts that touch
 * `document`, and they know nothing about Markdown grammar.
 */

const HEADING_RE = /^##\s+\[([^\]]+)\](?:\s+-\s+(.+))?\s*$/;
const CATEGORY_RE = /^###\s+(.+?)\s*$/;
const BULLET_RE = /^-\s?(.*)$/;
const LINK_DEF_RE = /^\[([^\]]+)\]:\s*(\S+)\s*$/;
const INLINE_RE = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * A bulleted entry's own continuation lines, dedented by the two spaces every
 * one of them carries under its `- `. A line indented four spaces past that
 * (six in the raw file) is a fenced dump of engine output, not prose — see
 * `toBlocks` — so it is kept whole rather than folded into the paragraph
 * around it.
 */
function collectItem(lines, i) {
  const acc = [BULLET_RE.exec(lines[i])[1]];
  let j = i + 1;
  while (j < lines.length) {
    const line = lines[j];
    if (line.trim() === '') {
      acc.push('');
      j++;
      continue;
    }
    if (!/^ {2}/.test(line)) break;
    acc.push(line.slice(2));
    j++;
  }
  return { lines: acc, next: j };
}

/** Dedented lines to `{ type: 'p' | 'code', text }` blocks, split on blank lines. */
function toBlocks(dedented) {
  const blocks = [];
  let mode = null;
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const text = mode === 'code' ? buf.join('\n').replace(/\s+$/, '') : buf.join(' ').trim();
    if (text) blocks.push({ type: mode, text });
    buf = [];
  };
  for (const line of dedented) {
    if (line.trim() === '') {
      flush();
      mode = null;
      continue;
    }
    const isCode = /^ {4}/.test(line);
    const kind = isCode ? 'code' : 'p';
    if (kind !== mode) {
      flush();
      mode = kind;
    }
    buf.push(isCode ? line.slice(4) : line.trim());
  }
  flush();
  return blocks;
}

/**
 * The file's own releases, oldest facts intact: version text as bracketed,
 * an ISO date or none for `Unreleased`, the compare/release link the file's
 * own reference definitions carry, and category groups of items exactly as
 * written. Nothing is reordered — a reader comparing the sheet against the
 * file it came from should find them in the same order.
 */
export function parseChangelog(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  const links = new Map();
  for (const line of lines) {
    const m = LINK_DEF_RE.exec(line);
    if (m) links.set(m[1].trim().toLowerCase(), m[2].trim());
  }

  const releases = [];
  let release = null;
  let category = null;
  let ledeLines = [];

  const closeCategory = () => {
    if (category) release.groups.push(category);
    category = null;
  };
  const closeRelease = () => {
    closeCategory();
    if (release) {
      if (ledeLines.length) release.lede = ledeLines.join(' ').trim();
      releases.push(release);
    }
    release = null;
    ledeLines = [];
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];

    const heading = HEADING_RE.exec(raw);
    if (heading) {
      closeRelease();
      const version = heading[1].trim();
      release = {
        version,
        unreleased: version.toLowerCase() === 'unreleased',
        date: heading[2] ? heading[2].trim() : null,
        href: links.get(version.toLowerCase()) ?? null,
        lede: null,
        groups: [],
      };
      i++;
      continue;
    }
    if (!release) {
      i++;
      continue;
    }
    if (LINK_DEF_RE.test(raw)) {
      i++;
      continue;
    }

    const cat = CATEGORY_RE.exec(raw);
    if (cat) {
      closeCategory();
      category = { name: cat[1].trim(), items: [] };
      i++;
      continue;
    }

    if (category && BULLET_RE.test(raw) && raw.startsWith('-')) {
      const { lines: acc, next } = collectItem(lines, i);
      const blocks = toBlocks(acc);
      if (blocks.length) category.items.push({ blocks });
      i = next;
      continue;
    }

    if (!category && raw.trim() !== '') ledeLines.push(raw.trim());
    i++;
  }
  closeRelease();

  return { releases };
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * `**bold**`, `` `code` ``, `*emphasis*` and `[text](url)` become real nodes
 * rather than an `innerHTML` string — this file's own text can carry a stray
 * `<` or `&` (engine field names, comparison text) that a markup string would
 * mangle or misinterpret, and a text node never parses what it holds.
 */
function renderInline(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  let m;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    if (m[1] != null) frag.append(el('b', null, m[1]));
    else if (m[2] != null) frag.append(el('code', null, m[2]));
    else if (m[3] != null) frag.append(el('i', null, m[3]));
    else if (m[4] != null) {
      const a = document.createElement('a');
      a.href = m[5];
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = m[4];
      frag.append(a);
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

function renderItem(item) {
  const li = el('li', 'rev-item');
  for (const block of item.blocks) {
    if (block.type === 'code') {
      li.append(el('pre', 'rev-pre', block.text));
    } else {
      const p = document.createElement('p');
      p.append(renderInline(block.text));
      li.append(p);
    }
  }
  return li;
}

function renderGroup(group) {
  const section = el('div', 'rev-group');
  section.append(el('h4', null, group.name));
  const ul = el('ul', 'rev-items');
  for (const item of group.items) ul.append(renderItem(item));
  section.append(ul);
  return section;
}

/**
 * One revision, marked the way the run ledger marks any armed step: a filled
 * `--redline` square for `Unreleased` — the entry still open, still being
 * marked up — and a ghost outline for everything already cut. `Rev N` counts
 * up from the file's oldest release, the way a drawing's own revision block
 * does, so `Unreleased` always carries the highest number on the sheet.
 */
function renderRelease(release, revNumber) {
  const article = el('article', release.unreleased ? 'rev unreleased' : 'rev');

  const header = el('header', 'rev-head');
  const mark = el('span', 'rev-mark');
  mark.setAttribute('aria-hidden', 'true');
  header.append(mark);
  header.append(el('span', 'rev-no', `Rev ${revNumber}`));

  const versionEl = document.createElement(release.href ? 'a' : 'span');
  versionEl.className = 'rev-version';
  versionEl.textContent = release.unreleased ? 'Unreleased' : release.version;
  if (release.href) {
    versionEl.href = release.href;
    versionEl.target = '_blank';
    versionEl.rel = 'noreferrer';
  }
  header.append(versionEl);
  header.append(el('span', 'rev-date', release.date ?? (release.unreleased ? 'Pending' : '—')));
  article.append(header);

  if (release.lede) {
    const p = el('p', 'rev-lede');
    p.append(renderInline(release.lede));
    article.append(p);
  }

  for (const group of release.groups) article.append(renderGroup(group));
  return article;
}

/** Mounts the parsed file into `host` once. The file does not change under a running page. */
export function mountChangelog(host, markdown) {
  const { releases } = parseChangelog(markdown);
  const total = releases.length;
  releases.forEach((release, index) => host.append(renderRelease(release, total - index)));
}
