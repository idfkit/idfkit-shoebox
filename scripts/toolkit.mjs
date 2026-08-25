/**
 * Which idfkit wrote the IDF, resolved at build time and stamped into every
 * model this page hands out.
 *
 * The same argument as `revision.mjs`, one level down. A drawing carries its
 * revision because a reading is only worth arguing with when you know which
 * issue produced it; an IDF carries its writer for the same reason, and with
 * more at stake — the file outlives this tab. A model downloaded today may be
 * re-run in two years against a toolkit that has since changed how it rounds a
 * vertex or orders a construction's layers, and the difference between "the
 * results moved" and "the writer moved" is a line at the top of the file.
 *
 * The **resolved** version and never the range in `package.json`. `^0.1.0` is a
 * statement about what this page would accept; `0.1.0` is what it actually
 * bundled, and only the second is a fact about the file in the reader's hand.
 * So it is read out of the installed tree rather than out of the manifest, and
 * that is also why it cannot simply be imported: `@idfkit/core` declares an
 * `exports` map with no `./package.json` in it, which is a deliberate seal on
 * the package's internals and not a thing to work around with a deep path.
 *
 * Unreadable, it is `null` and the header says so with an em dash — the same
 * rule the whole sheet keeps. A file that cannot say which toolkit wrote it is
 * missing a fact, and missing is not the same as some default version.
 */
import { readFileSync } from 'node:fs';

/**
 * `@idfkit/core` is the one asked for, of the four packages this page loads,
 * because it is the one that writes the file. `@idfkit/engine` runs it,
 * `@idfkit/weather` fetches the EPW and `@idfkit/schemas` supplies the schema —
 * none of them puts a byte in the IDF, so none of them is what a reader
 * comparing two files needs to know.
 */
export function toolkit() {
  try {
    const url = new URL('../node_modules/@idfkit/core/package.json', import.meta.url);
    const version = JSON.parse(readFileSync(url, 'utf8')).version;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}
