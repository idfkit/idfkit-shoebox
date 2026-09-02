/**
 * The general notes — the sheet's onboarding, carried the way a drawing set
 * carries it: a numbered block of notes at the head of the sheet, folded away
 * once read. Not a modal tour; nothing on this board floats.
 *
 * The governing rule holds here too. Each note bears the run ledger's square
 * marker, and a marker fills only when its step has actually happened on this
 * desk — the first solve landing, a station attaching, a channel patched out,
 * the summer criteria coming back with numbers in them — reported by main.js
 * from the genuine event through `note()`. There is no Next button, because a
 * Next button is the onboarding taking the reader's word for it, which is
 * exactly what this page never does. The first unfilled note is the reader's
 * next move: it takes the redline, and its subject on the sheet is circled
 * with the markup pen — the same dashed hairline a blocked strip carries —
 * one region at a time. Clicking a note stages its scene (scrolls to the
 * subject, opens the desk when the subject lives there), but staging never
 * fills the marker; only the step itself does.
 *
 * What has been read is kept in localStorage under a versioned key. Bump the
 * key whenever the steps change meaning, so a returning reader gets the new
 * sheet rather than stale ticks against notes they never read. All of them
 * taken retires the sheet on the next visit; a reader who sets it aside early
 * keeps a one-line row that still reads — the index sheet's rule, applied here.
 */

// v3 because the TM59 work added a step. A reader carrying a v2 entry has six
// squares filled against a sheet that now has seven, and the seventh would
// stand unfilled beside six ticks as though they had skipped it — or, worse,
// the sheet would have retired itself under v2's "all taken" rule and the note
// about the criteria would never be shown at all. The key is the only thing
// that separates "read the old sheet" from "read this one".
const STORE = 'shoebox-general-notes-v3';
const VIEWS = ['open', 'folded', 'retired'];

// A sheet counts its own notes in words, and the count is read off the
// declaration rather than typed into the prose: the lede read "Six steps" for
// as long as there were six, and this feature's note would have left it saying
// so over seven. `RUN_TALLY` in main.js is the same arrangement for the same
// reason. It is closed at what this block can plausibly carry and asserted at
// module load below, because a lede reading "undefined steps" is the kind of
// defect nobody finds until a reader meets it.
const TALLY = Object.freeze([
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
]);

class Note {
  constructor({ id, title, body, target, focus = null, desk = false }) {
    this.id = id;
    this.title = title;
    this.body = body;
    // What the markup pen circles while this note is the next move. A note
    // whose subject lives on the console points at the desk button until the
    // desk is open, because the honest subject of a closed console is the
    // control that opens it.
    this.target = target;
    // What a click scrolls to and hands focus — the real control the note is
    // about, so a keyboard reader lands where the words point.
    this.focus = focus ?? target;
    this.desk = desk;
    Object.freeze(this);
  }
}

export const NOTES = Object.freeze([
  new Note({
    id: 'solve',
    title: 'Watch the first solve',
    body:
      'The engine compiles inside this tab and solves two Denver design days ' +
      'unasked. Every figure below is read off that run — nothing on the ' +
      'sheet is lettered by hand.',
    target: '#plate',
  }),
  new Note({
    id: 'drag',
    title: 'Drag a dimension',
    body:
      'Take hold of Width, under the drawing. Auto-solve re-runs as you ' +
      'drag, and the ghost ticks hold where you started, so a change reads ' +
      'as a change. The number beside it takes typing, when you have an ' +
      'exact one in mind.',
    target: '.dims',
    focus: '#dim-width',
  }),
  new Note({
    id: 'station',
    title: 'Attach a year of weather',
    body:
      'Pick any of 17,292 stations. The run becomes a full 8,760-hour year ' +
      'at that place, design conditions and all. Patch in System or Gains ' +
      'and the bill of quantities follows, priced from published tariffs.',
    target: '#site',
    focus: '#site-field',
  }),
  new Note({
    id: 'desk',
    title: 'Open the model console',
    body:
      'Eighteen channels in the order the physics happens. Every control ' +
      'writes a real object into the IDF, and every strip reads back what ' +
      'its path contributes. The scales are ruled with the cases anyone in ' +
      'the trade already knows — single, double, triple; code limits; the ' +
      'engine\'s own defaults — and each says which one you are standing in ' +
      'as you drag it.',
    target: '#desk-open',
  }),
  new Note({
    id: 'patch',
    title: 'Patch a channel out',
    body:
      'The patch button takes a channel\'s objects out of the document — ' +
      'removed, not zeroed — so the drawing and the model always agree ' +
      'about what is in the path.',
    target: '#desk-open',
    focus: '#desk .patch',
    desk: true,
  }),
  // The board has never had a note, and until this feature there was less to
  // say about it: a target is a published number read off the run, and the
  // reader who got as far as attaching a year met it on the way past. TM59's
  // criteria are the first lines here that cannot be reached by a year alone —
  // they want some part of May to September *and* somebody in the room — so
  // the board is now a step rather than a consequence, and this is the note
  // that says what it is for. Its square fills off the criteria actually being
  // lettered; see the call site in main.js for why the count's pair is the
  // test rather than any one reading.
  new Note({
    id: 'tm59',
    title: 'Read the overheating criteria',
    body:
      'The board under the results reads one run against every published line at ' +
      'once — no standard is selected and none is remembered, so the score is only ' +
      'ever what this building would clear today. CIBSE TM59\'s criteria ask more ' +
      'of the run than the rest: some part of May to September, and Gains patched ' +
      'in, because with nobody home there are no occupied hours for criterion a to ' +
      'be a share of. What they cannot answer is printed under them, at the same ' +
      'size as what they can.',
    // The whole block, not the table: the two ledes over it are what say the
    // board keeps a score and decides nothing, and a pen circling the rows
    // alone would point at the readings while the note is about the reading.
    target: '.score-wrap',
    // A click goes to the rows, because that is where the criteria are and the
    // ledes are already in view above them once the table is centred.
    focus: '#score',
  }),
  new Note({
    id: 'link',
    title: 'Carry the scheme away',
    body:
      'The scheme link re-solves this desk in any browser; the run bundle ' +
      'carries the exact IDF this sheet handed the engine, for a local ' +
      'EnergyPlus — a run that failed included, which is when it is worth ' +
      'the most. Both sit under the run log. Sign the title block and the ' +
      'model goes out with your name on it.',
    target: '.ledger-take',
    focus: '#share',
  }),
]);

// Two things the declaration has to be true of before anything is drawn, both
// checked here rather than at render time, by the same rule the landmarks and
// the register follow: a sheet that letters "undefined steps" or quietly drops
// a note because two of them share an id is a defect discovered by a reader.
if (!TALLY[NOTES.length]) {
  throw new Error(`The general notes number ${NOTES.length} and TALLY carries no word for that many`);
}
{
  const ids = new Set(NOTES.map((n) => n.id));
  if (ids.size !== NOTES.length) {
    throw new Error('Two general notes share an id, so one of them can never be filled');
  }
}

/** The count in words, for the prose that has to say it. */
const TALLIED = TALLY[NOTES.length];

/**
 * Read what the last visit left. A browser that refuses storage, or a
 * mangled entry, gets a fresh sheet — the honest default: better the notes
 * twice than a guess at what was read.
 */
function read() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return { done: [], view: 'open' };
    const parsed = JSON.parse(raw);
    return {
      done: Array.isArray(parsed.done) ? parsed.done : [],
      view: VIEWS.includes(parsed.view) ? parsed.view : 'open',
    };
  } catch {
    return { done: [], view: 'open' };
  }
}

export function mountTour({ openDesk } = {}) {
  const host = document.getElementById('notesheet');
  if (!host) return null;

  const stored = read();
  const done = new Set(stored.done.filter((id) => NOTES.some((n) => n.id === id)));
  let view = stored.view;
  // "Retires on the next visit": a sheet finished last session never renders
  // again. Finishing it *this* session keeps it up, saying so, because a
  // marker that fills and takes its whole sheet with it was never seen to fill.
  if (view !== 'retired' && NOTES.every((n) => done.has(n.id))) view = 'retired';

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ done: [...done], view }));
    } catch {
      // Nothing to substitute: the notes simply return next visit.
    }
  }

  const next = () => NOTES.find((n) => !done.has(n.id));

  /**
   * The markup pen, spent on one region at a time: circle the next note's
   * subject, and only while the notes are open — a folded sheet giving
   * silent directions would be the fold lying about being folded.
   */
  function syncGuide() {
    for (const el of document.querySelectorAll('.guided')) el.classList.remove('guided');
    if (view !== 'open') return;
    const n = next();
    if (!n) return;
    const deskOpen = document.body.classList.contains('desk-open');
    document.querySelector(n.desk && deskOpen ? n.focus : n.target)?.classList.add('guided');
  }

  /** Point the reader at the note's subject without doing the step for them. */
  function stage(n) {
    if (n.desk) openDesk?.(true);
    const el = document.querySelector(n.focus);
    if (!el) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    el.focus?.({ preventScroll: true });
  }

  function act(kind) {
    view = kind === 'open' ? 'open' : kind === 'fold' ? 'folded' : 'retired';
    save();
    render();
  }

  function render() {
    host.hidden = view === 'retired';
    if (view === 'retired') {
      host.textContent = '';
      syncGuide();
      return;
    }

    if (view === 'folded') {
      // Closed, a row reads: the count is a reading like any other, so a step
      // taken while folded still moves it.
      host.innerHTML = `
        <div class="notes-row">
          <p class="eyebrow">General notes</p>
          <span class="notes-count">${done.size} of ${NOTES.length} steps taken</span>
          <button type="button" class="link" data-act="open">Reopen</button>
          <button type="button" class="link" data-act="retire">Retire</button>
        </div>`;
    } else {
      const finished = NOTES.every((n) => done.has(n.id));
      const here = next();
      host.innerHTML = `
        <div class="notes-head">
          <p class="eyebrow">General notes · how to work this sheet</p>
          <button type="button" class="link" data-act="${finished ? 'retire' : 'fold'}">
            ${finished ? 'Retire these notes' : 'Set these notes aside'}
          </button>
        </div>
        <p class="notes-lede">${
          finished
            ? `All ${TALLIED.toLowerCase()} steps taken. These notes retire on the next visit — the sheet is yours.`
            : `${TALLIED} steps. Each square fills when its step has actually happened on this desk — the notes read the model, they do not take your word for it.`
        }</p>
        <ol class="notes-grid">
          ${NOTES.map((n, i) => {
            const taken = done.has(n.id);
            const state = taken ? 'Taken' : n === here ? 'Next' : 'Not yet taken';
            return `
            <li>
              <button type="button"
                class="note${taken ? ' done' : ''}${n === here ? ' here' : ''}"
                data-note="${n.id}"${n === here ? ' aria-current="step"' : ''}>
                <span class="note-head">
                  <i class="note-mark" role="img" aria-label="${state}"></i>
                  <span class="note-no">${i + 1}</span>
                  <span class="note-title">${n.title}</span>
                </span>
                <span class="note-body">${n.body}</span>
              </button>
            </li>`;
          }).join('')}
        </ol>`;
    }

    for (const b of host.querySelectorAll('[data-act]')) {
      b.addEventListener('click', () => act(b.dataset.act));
    }
    for (const b of host.querySelectorAll('[data-note]')) {
      b.addEventListener('click', () => stage(NOTES.find((n) => n.id === b.dataset.note)));
    }
    syncGuide();
  }

  render();

  return {
    /**
     * A step has genuinely happened. Idempotent, so per-frame reporters (a
     * drag's input events) cost one render; unknown ids throw, because a
     * caller naming a step that does not exist is a bug to surface, not a
     * marker to quietly drop.
     */
    note(id) {
      if (!NOTES.some((n) => n.id === id)) throw new Error(`No general note is keyed "${id}"`);
      if (view === 'retired' || done.has(id)) return;
      done.add(id);
      save();
      render();
    },
    // The desk opening or closing moves where the patch note's subject lives.
    syncGuide,
  };
}
