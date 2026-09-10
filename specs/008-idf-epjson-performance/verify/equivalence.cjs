/**
 * Does the format change the answer?
 *
 * Every position is run in all three serialisations on one warm engine and the
 * ESO is compared against the commented IDF's three ways: byte for byte, as a
 * sorted multiset of lines (which separates "the numbers moved" from "the
 * blocks moved"), and by the order the environments came back in.
 *
 * The third question is the one that matters and it is not obvious in advance
 * that it needs asking. It does: see `research.md`.
 *
 *   POSITIONS=… node equivalence.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { M, ready, rmrf, read } = require('./engine.cjs');

const ROOT = process.env.POSITIONS;
const VARIANTS = ['idf-commented', 'idf-compressed', 'epjson-compact'];
const dg = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

(async () => {
  await ready();
  for (const pos of fs.readdirSync(ROOT).sort()) {
    const out = {};
    for (const v of VARIANTS) {
      const ext = v.startsWith('epjson') ? 'epJSON' : 'idf';
      M.FS.writeFile(`/e.${ext}`, fs.readFileSync(path.join(ROOT, pos, `${v}.${ext}`), 'utf8'));
      rmrf('/output');
      try { M.callMain(['-d', '/output', `/e.${ext}`]); } catch { /* exit unwinds */ }
      const eso = read('/output/eplusout.eso');
      const err = read('/output/eplusout.err');
      out[v] = {
        eso: eso ? dg(eso) : null,
        bytes: eso.length,
        sorted: eso ? dg(eso.split('\n').sort().join('\n')) : null,
        envs: eso.split('\n').filter((l) => /^1,[A-Z]/.test(l)).map((l) => l.split(',')[1].trim().slice(-16)).join(' | '),
        w: (err.match(/\*\* Warning \*\*/g) || []).length,
        s: (err.match(/\*\* Severe {2}\*\*/g) || []).length,
      };
    }
    const ref = out['idf-commented'];
    const verdict = (v) => (out[v].eso === ref.eso ? 'exact' : out[v].sorted === ref.sorted ? 'REORDERED' : 'DIFFERS');
    console.log(
      `${pos.padEnd(20)} eso ${String(ref.bytes).padStart(7)}B  ` +
      `compressed:${verdict('idf-compressed').padEnd(10)} epjson:${verdict('epjson-compact').padEnd(10)}  ` +
      `warn/sev ${ref.w}/${ref.s} vs ${out['epjson-compact'].w}/${out['epjson-compact'].s}\n` +
      `${''.padEnd(20)}   idf    envs [${ref.envs}]\n` +
      `${''.padEnd(20)}   epjson envs [${out['epjson-compact'].envs}]`,
    );
  }
})();
