/**
 * How many words a kind of always-visible text may carry, and the one counter
 * that decides it.
 *
 * The sheet used to print every explanation it had, always, and satisfied the
 * rule that nothing may exist only on hover by printing it all. About 2,000
 * words stood on the first screen and 4,500 with the console open. The long
 * form now sits in folds attached to what it explains; what stays in view is a
 * glance, and a glance only stays a glance if something refuses it the day it
 * grows. So the budgets are declared here, once, and the declaring modules
 * assert their strings against them at load, the way `assertHideable` refuses a
 * `when` the console cannot draw.
 *
 * It is its own module because `controls.js`, `tour.js`, `tm59.js`,
 * `console.js` and `main.js` all count with it, and none of them should import
 * another for one function. It is DOM-free and imports nothing, so a Node
 * harness can load it, and the in-page measurement imports the same `words` so
 * that the assertion and the success criteria count identically.
 */

export class Budget {
  constructor({ id, words, scope, asserted }) {
    if (!/^[A-Z][A-Z_]*$/.test(id)) throw new Error(`Budget id ${id} is not upper snake case`);
    if (!Number.isInteger(words) || words < 1) throw new Error(`Budget ${id}: words must be a positive integer`);
    if (!scope) throw new Error(`Budget ${id}: a scope is required, since it is what the refusal names`);
    if (typeof asserted !== 'boolean') throw new Error(`Budget ${id}: asserted must be true or false`);
    this.id = id;
    this.words = words;
    this.scope = scope;
    this.asserted = asserted;
    Object.freeze(this);
  }
}

// `asserted: false` marks the budgets that bound composed or rendered text. A
// sentence built from run data at render time is held to its budget by the
// measurement at four desk positions rather than by a throw, because a throw
// mid-render would turn a copy defect into a broken sheet, which is worse than
// the defect.
const roster = [
  new Budget({ id: 'STRIP_LINE', words: 12, scope: "a channel's line in the console", asserted: true }),
  new Budget({ id: 'STEP', words: 15, scope: "a general note's instruction, and the notes lede", asserted: true }),
  new Budget({ id: 'STANDING', words: 15, scope: 'a blocking reason, a refusal', asserted: true }),
  new Budget({ id: 'ABSENCE', words: 12, scope: 'a reason beside an em dash', asserted: false }),
  new Budget({ id: 'SUMMARY', words: 6, scope: "a fold's summary", asserted: true }),
  new Budget({ id: 'BLOCK', words: 25, scope: "one block's explanation in view; a page lede", asserted: false }),
  new Budget({ id: 'CHASE', words: 20, scope: 'the Chase sentence above the board', asserted: false }),
  new Budget({ id: 'DESCRIPTION', words: 60, scope: 'description and finding together', asserted: false }),
  new Budget({ id: 'CEILING', words: 40, scope: 'any single visible block', asserted: false }),
  // A classification printed under a control's face and on its folded index
  // row. Asserted over every combination the declarations can produce rather
  // than measured, because a tag that could not fit would have to be cut
  // mid-word on a 390 px strip, and the edge case says it never is.
  new Budget({ id: 'TAG', words: 5, scope: "a strip tag under a control's face", asserted: true }),
];

export const BUDGETS = Object.freeze(Object.fromEntries(roster.map((b) => [b.id, b])));

/**
 * Whitespace-separated tokens once markup is stripped, so `1.80 W/m²K` is two
 * words and a tour body's `<b>` counts for nothing.
 */
export function words(text) {
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Hands `text` back when it fits, so a declaration can be asserted where it is
 * written. `where` names the declaration the way the other load assertions do,
 * key or id first, so the message points at the line to edit.
 */
export function withinBudget(budget, where, text) {
  const n = words(text);
  if (n > budget.words) {
    throw new Error(`${where}: ${n} words, over the ${budget.words}-word ${budget.id} budget (${budget.scope})`);
  }
  return text;
}
