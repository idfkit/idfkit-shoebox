/**
 * The one seam nothing else checks.
 *
 * `controls.js` is the single source of truth for the console, and that
 * guarantee stops at the console's edge: the sheet's own half — the plate, the
 * quantities panel, the results schedule, the bill, the hour picker — is
 * `index.html` markup addressed by string id from `main.js`. There are about a
 * hundred of those lookups and nothing between them and a typo but the page
 * being opened. `document.getElementById` returns null and `null.textContent`
 * throws at the moment the reader does whatever reaches it.
 *
 * So this file reads both as text. It is a linter rather than a unit test, and
 * that is the point: it is checking the join, which is exactly the part no unit
 * can see.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const consoleJs = readFileSync(new URL('../src/console.js', import.meta.url), 'utf8');

const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const looked = [...main.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);

/**
 * Not every element the sheet reads is in the markup: the hour picker builds
 * its own bar and the five dimension sliders are generated from `SHEET_KEYS`,
 * so an id may be assigned in a module rather than authored in the page. Both
 * are collected — a literal `el.id = 'when-pin'` and a template `dim-${key}`,
 * which is matched by its fixed head.
 */
const assigned = new Set([
  ...[...main.matchAll(/\.id = '([^']+)'/g)].map((m) => m[1]),
  ...[...main.matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]),
]);
const generated = [
  ...[...main.matchAll(/\.id = `([^`$]*)\$\{/g)].map((m) => m[1]),
  ...[...main.matchAll(/\bid: `([^`$]*)\$\{/g)].map((m) => m[1]),
].filter((head) => head.length > 2);

const reachable = (id) =>
  ids.has(id) || assigned.has(id) || generated.some((head) => id.startsWith(head));

describe('every element the sheet letters exists in the sheet', () => {
  test('there are lookups to check', () => {
    assert.ok(looked.length > 50, `only ${looked.length} lookups found — has $() been renamed?`);
    assert.ok(ids.size > 50);
  });

  for (const id of [...new Set(looked)].sort()) {
    test(id, () => {
      assert.ok(
        reachable(id),
        `main.js reads #${id}, and nothing on the sheet is given that id — not the markup and not a module`,
      );
    });
  }
});

describe('the layout is declared once', () => {
  // Layout is CSS's decision; the modules only ask which one they got. A
  // `matchMedia` string in a module would be the breakpoint written twice.
  test('--index is declared in the stylesheet and read back by console.js', () => {
    assert.ok(/\.strips\s*\{[^}]*--index:\s*0/.test(html), '--index has no wide-layout value');
    assert.ok(/\.strips\s*\{\s*--index:\s*1/.test(html), '--index is never switched on');
    assert.ok(consoleJs.includes("getPropertyValue('--index')"));
  });

  test('--fold is declared in the stylesheet and read back by main.js', () => {
    assert.ok(/\.presets\s*\{\s*--fold:\s*1/.test(html));
    assert.ok(main.includes("getPropertyValue('--fold')"));
  });

  test('no module carries a breakpoint of its own', () => {
    for (const [name, source] of [['main.js', main], ['console.js', consoleJs]]) {
      assert.ok(!/matchMedia\(/.test(source), `${name} decides layout for itself`);
    }
  });
});

describe('a class that unsets display declares its own [hidden]', () => {
  // `all: unset` re-declares `display`, and an author declaration beats the
  // user agent's `[hidden] { display: none }` outright — so `el.hidden = true`
  // does nothing whatever. Measured in Chromium on this page: `#studies-stop`
  // rendered at all times, offering to set aside studies that did not exist,
  // for as long as that button has existed.
  const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));

  /** Every class whose rule unsets everything, and therefore `display` with it. */
  const unsetting = new Set();
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\ball:\s*unset\b/.test(rule[2])) continue;
    for (const selector of rule[1].split(',')) {
      const cls = selector.trim().match(/\.([A-Za-z][\w-]*)/);
      if (cls) unsetting.add(cls[1]);
    }
  }

  /**
   * Every element the markup itself hides. This is the check that would have
   * caught the real one: `#studies-stop` is authored `class="link" ... hidden`,
   * so the page states both halves of the contradiction in one tag.
   */
  const hiddenInMarkup = [...html.matchAll(/<[a-z]+\b([^>]*\bhidden\b[^>]*)>/g)]
    .map((tag) => tag[1].match(/class="([^"]+)"/)?.[1])
    .filter(Boolean)
    .flatMap((classes) => classes.split(/\s+/));

  test('there are such classes to check', () => {
    assert.ok(unsetting.size > 0);
    assert.ok(hiddenInMarkup.length > 0);
  });

  for (const cls of [...new Set(hiddenInMarkup)].filter((c) => unsetting.has(c)).sort()) {
    test(`.${cls}`, () => {
      assert.ok(
        new RegExp(`\\.${cls}\\[hidden\\]`).test(css),
        `.${cls} unsets display and is used with the hidden attribute, so it needs a .${cls}[hidden] rule`,
      );
    });
  }

  test('the twins that are already there stay there', () => {
    for (const cls of ['link', 'bill', 'strip-fold', 'face-ghost']) {
      assert.ok(new RegExp(`\\.${cls}\\[hidden\\]`).test(css), `.${cls}[hidden] has gone missing`);
    }
  });
});

describe('the general notes walk a page that exists', () => {
  // An onboarding that walks a page that no longer exists is worse than none,
  // so a step's subject is checked against the markup the same way the sheet's
  // own ids are.
  const tour = readFileSync(new URL('../src/tour.js', import.meta.url), 'utf8');
  const selectors = [...tour.matchAll(/(?:target|focus):\s*'([^']+)'/g)].map((m) => m[1]);

  test('every step names a subject', () => {
    assert.ok(selectors.length >= 6, `only ${selectors.length} selectors in NOTES`);
  });

  for (const selector of [...new Set(selectors)].sort()) {
    test(selector, () => {
      // Only the id and class heads are checkable without a DOM; that is where
      // the renames land.
      for (const id of selector.matchAll(/#([\w-]+)/g)) {
        assert.ok(reachable(id[1]), `a note points at #${id[1]}, which is not on the sheet`);
      }
      for (const cls of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) {
        assert.ok(
          html.includes(`class="${cls[1]}`) || html.includes(` ${cls[1]}"`) || html.includes(`${cls[1]} `)
            || consoleJs.includes(cls[1]),
          `a note points at .${cls[1]}, which nothing on the sheet carries`,
        );
      }
    });
  }

  test('the storage key is versioned', () => {
    // Bumped whenever the steps change meaning, so a returning reader gets the
    // new sheet rather than stale ticks against notes they never read.
    assert.ok(/shoebox-general-notes-v\d+/.test(tour), 'the notes have no versioned storage key');
  });

  test('every step is completed by a real event', () => {
    // There is no Next button, because that would be the onboarding taking the
    // reader's word for it.
    const notes = [...tour.matchAll(/id:\s*'([\w-]+)'/g)].map((m) => m[1]);
    const filed = new Set([...main.matchAll(/note\('([\w-]+)'\)/g)].map((m) => m[1]));
    assert.ok(notes.length >= 6);
    for (const id of notes) {
      assert.ok(filed.has(id), `nothing in main.js ever files the "${id}" note`);
    }
  });
});
