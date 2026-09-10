/**
 * Time each input format end to end on one warm engine.
 *
 * Two rules, both learned by getting them wrong first.
 *
 * The order inside a round is **rotated**, because a run is not independent of
 * the run before it. A first measurement of this put the commented IDF at
 * 1,050 ms against the compressed one's 166 ms and the difference was entirely
 * an artefact: the epJSON variant was fatalling on unrepaired enums, and the
 * commented IDF was the variant that always followed the fatal. A fixed order
 * hands whatever the previous run left behind to the same variant every time.
 *
 * The first rounds are **discarded**, because the instance is still settling:
 * run 1 of a design day costs about 1,100 ms against a steady 120 ms, and the
 * next two are still visibly above the floor.
 *
 * Both clocks are kept. Wall clock is what the desk's live budget is spent
 * against; the engine's own `Elapsed Time` is what it thinks it did.
 *
 *   MODELS=… VARIANTS=a,b,c [EPW=…] [REPS=15] [WARM=4] node run-formats.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { M, ready, rmrf, read } = require('./engine.cjs');

const MODELS = process.env.MODELS;
const EPW = process.env.EPW || '';
const REPS = Number(process.env.REPS || 15);
const WARM = Number(process.env.WARM || 4);
const VARIANTS = process.env.VARIANTS.split(',');

const digest = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

(async () => {
  await ready();
  if (EPW) M.FS.writeFile('/weather.epw', fs.readFileSync(EPW, 'utf8'));

  const inputs = {};
  for (const v of VARIANTS) {
    const ext = v.startsWith('epjson') ? 'epJSON' : 'idf';
    const text = fs.readFileSync(path.join(MODELS, `${v}.${ext}`), 'utf8');
    // Each variant keeps its own path so the engine cannot be handed one
    // format's bytes under the other's extension.
    inputs[v] = { path: `/in-${v}.${ext}`, text };
    M.FS.writeFile(inputs[v].path, text);
  }

  const wall = Object.fromEntries(VARIANTS.map((v) => [v, []]));
  const engine = Object.fromEntries(VARIANTS.map((v) => [v, []]));
  const meta = {};

  for (let r = 0; r < REPS + WARM; r += 1) {
    for (const v of VARIANTS.map((_, i) => VARIANTS[(i + r) % VARIANTS.length])) {
      rmrf('/output');
      const args = ['-d', '/output'];
      if (EPW) args.push('-w', '/weather.epw');
      args.push(inputs[v].path);
      const a = performance.now();
      let exit = 0;
      try { exit = M.callMain(args); } catch { exit = 'THREW'; }
      const ms = performance.now() - a;
      const err = read('/output/eplusout.err');
      const m = /Elapsed Time=(\d+)hr\s+(\d+)min\s+([\d.]+)sec/.exec(err);
      if (r >= WARM) {
        wall[v].push(ms);
        if (m) engine[v].push((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
      }
      if (r === REPS + WARM - 1) {
        const eso = read('/output/eplusout.eso');
        meta[v] = {
          exit,
          eso: eso ? digest(eso) : null,
          esoBytes: eso.length,
          // Environments in the order the engine ran them, which is the thing
          // epJSON does not preserve.
          environments: eso.split('\n').filter((l) => /^1,[A-Z]/.test(l)).map((l) => l.split(',')[1].trim()),
          warnings: (err.match(/\*\* Warning \*\*/g) || []).length,
          severes: (err.match(/\*\* Severe {2}\*\*/g) || []).length,
          fatal: /\*\*\s*Fatal/.test(err),
        };
      }
    }
  }

  const stat = (a) => {
    if (!a.length) return {};
    const s = [...a].sort((x, y) => x - y);
    return { min: +s[0].toFixed(1), median: +s[(s.length / 2) | 0].toFixed(1), max: +s[s.length - 1].toFixed(1) };
  };

  const out = { weather: EPW ? path.basename(EPW) : null, reps: REPS, warmupDiscarded: WARM, variants: {} };
  for (const v of VARIANTS) {
    out.variants[v] = { bytes: Buffer.byteLength(inputs[v].text), wall: stat(wall[v]), engineElapsed: stat(engine[v]), ...meta[v] };
  }
  console.log(JSON.stringify(out, null, 2));
})();
