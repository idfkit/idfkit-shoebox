/**
 * Who is at the console, kept between visits.
 *
 * The sheet has no author and the page's own credit sits in the colophon,
 * because a title block's `Drawn by` names whoever drew *that* sheet and every
 * scheme on this desk is a different drawing. This is the other half of that
 * argument rather than a retreat from it: the cell is real, and it belongs to
 * the reader.
 *
 * **Kept here and not in the permalink**, which is the decision worth writing
 * down. A link carries the desk — the parameters off their defaults, the patch
 * bay, the station, the hour being read — and a signature is none of those. It
 * is a fact about the person, not about the building, and the difference shows
 * the moment a link is shared: carried along, my name would arrive on a
 * colleague's screen, ride their edits, and end up at the top of an IDF
 * describing a building I never drew. That is precisely the false claim the
 * byline was taken out of the title block to avoid, one level down and made
 * silent by the fact that nobody would think to look. So a shared scheme
 * carries the building and the recipient signs it themselves, or does not.
 *
 * It also keeps the reserved-key list where it is and the link format at `v1`:
 * a signature in the fragment would be a new reserved key beside `in`, `out`,
 * `stn`, `win` and `at`, and free text in a URL that ends up inside a file is a
 * shape worth not having at all.
 */
import { cleanSignature } from './model.js';

/**
 * Versioned like the general notes' key, and for the same reason: if what this
 * holds ever changes meaning, a returning reader should get the new thing
 * rather than an old value reinterpreted.
 */
const STORE = 'shoebox-drawn-by-v1';

/**
 * Every access is wrapped, because `localStorage` is not a property you can
 * merely read. A browser with site data switched off, and Safari in private
 * browsing, hand over an object that looks perfectly serviceable and throw on
 * the first call — so the failure mode here is "the desk cannot remember your
 * name", which is a small loss quietly taken, and never a page that will not
 * boot.
 */
export function readSignature() {
  try {
    return cleanSignature(window.localStorage.getItem(STORE) ?? '');
  } catch {
    return '';
  }
}

/**
 * Cleaned on the way in as well as on the way out. Storage is shared with every
 * other tab of this origin and survives a reload into a newer build, so the
 * value read back is not necessarily one this code wrote — cleaning at both
 * ends means the guarantee the IDF header depends on holds whatever is in
 * there. Blank removes the key rather than storing an empty string: unsigned is
 * the absence of a signature, not a signature that happens to be empty.
 */
export function writeSignature(text) {
  const signed = cleanSignature(text);
  try {
    if (signed) window.localStorage.setItem(STORE, signed);
    else window.localStorage.removeItem(STORE);
  } catch {
    /* Nothing to do and nothing worth saying: the name still signs this
       session's models, it just will not be here on the next visit. */
  }
  return signed;
}
