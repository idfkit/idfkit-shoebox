/** Run every input in MODELS and print the order the environments came back in. */
const fs = require('node:fs');
const path = require('node:path');
const { M, ready, rmrf, read } = require('./engine.cjs');

(async () => {
  await ready();
  for (const file of fs.readdirSync(process.env.MODELS).sort()) {
    const ext = file.endsWith('.epJSON') ? 'epJSON' : 'idf';
    M.FS.writeFile(`/o.${ext}`, fs.readFileSync(path.join(process.env.MODELS, file), 'utf8'));
    rmrf('/output');
    try { M.callMain(['-d', '/output', `/o.${ext}`]); } catch { /* exit unwinds */ }
    const envs = read('/output/eplusout.eso').split('\n')
      .filter((l) => /^1,[A-Z]/.test(l)).map((l) => l.split(',')[1].trim());
    console.log(`${file.padEnd(28)} ${envs.join('  ->  ')}`);
  }
})();
