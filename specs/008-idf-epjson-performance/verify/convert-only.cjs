/**
 * Isolate input processing from simulation.
 *
 * `--convert-only` reads the input, validates it against the schema, writes it
 * out in the other format and exits before any environment runs. It is the only
 * way this engine offers to price the reader on its own, and it is what turns
 * "epJSON felt the same end to end" into a number: whatever difference the two
 * readers have, it is bounded by what shows here.
 *
 * It does include the write of the converted file, so it overstates the reading
 * slightly for both formats. That is the right direction for the question being
 * asked — a bound, not an estimate.
 *
 *   MODELS=… VARIANTS=a,b,c [REPS=30] [WARM=5] node convert-only.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { M, ready, rmrf, lines } = require('./engine.cjs');

const VARIANTS = process.env.VARIANTS.split(',');
const REPS = Number(process.env.REPS || 30);
const WARM = Number(process.env.WARM || 5);

(async () => {
  await ready();
  const inputs = {};
  for (const v of VARIANTS) {
    const ext = v.startsWith('epjson') ? 'epJSON' : 'idf';
    const p = `/c-${v}.${ext}`;
    M.FS.writeFile(p, fs.readFileSync(path.join(process.env.MODELS, `${v}.${ext}`), 'utf8'));
    inputs[v] = p;
  }

  const t = Object.fromEntries(VARIANTS.map((v) => [v, []]));
  for (let r = 0; r < REPS + WARM; r += 1) {
    for (const v of VARIANTS.map((_, i) => VARIANTS[(i + r) % VARIANTS.length])) {
      rmrf('/output');
      const a = performance.now();
      try { M.callMain(['--convert-only', '-d', '/output', inputs[v]]); } catch { /* exit unwinds */ }
      const ms = performance.now() - a;
      if (r >= WARM) t[v].push(ms);
    }
  }

  for (const v of VARIANTS) {
    const s = t[v].sort((x, y) => x - y);
    console.log(`${v.padEnd(18)} min ${s[0].toFixed(1).padStart(6)}  med ${s[(s.length / 2) | 0].toFixed(1).padStart(6)}  max ${s[s.length - 1].toFixed(1).padStart(6)}`);
  }
  console.log('last console:', lines.slice(-3).join(' | '));
})();
