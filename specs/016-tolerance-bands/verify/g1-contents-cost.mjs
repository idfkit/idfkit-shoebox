/**
 * G1 (T003): what a study sample costs when it carries the band contents.
 *
 * Today a study sample asks syncReporting for its own quantity's contents
 * only. Research R1 widens that to the union of every quantity answering a
 * published standard's limited target, channel-filtered. This measures the
 * engine time of both, design day and annual, on two desks: the default desk,
 * and the same desk with every channel engaged (the worst case, since the
 * union is channel-filtered).
 *
 * One EnergyPlus per process, via the 012 kit's runIdf, which times callMain
 * alone (no Node boot, no WASM compile in the figure).
 */
const REPO = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const kit = await import(`${REPO}/specs/012-attach-weather-file/verify/kit.mjs`);
const { epwWholeYear } = await import(`${REPO}/specs/012-attach-weather-file/verify/fixtures.mjs`);
const { writeIdf } = await import('@idfkit/core');
const { DEFAULT_PARAMETERS, DEFAULT_BYPASS, CHANNELS } = await import(`${REPO}/src/controls.js`);
const { channelState } = await import(`${REPO}/src/model.js`);
const { QUANTITY_BY_ID, contentsFor, RunContents } = await import(`${REPO}/src/study.js`);
const { PRESETS } = await import(`${REPO}/src/schemes.js`);
const { READING_BY_ID } = await import(`${REPO}/src/survey.js`);

const N = Number(process.env.G1_RUNS ?? 20);
const schema = await kit.loadSchema();
const epw = epwWholeYear();

// The band quantities, computed inline (tolerance.js does not exist yet).
const band = [];
for (const preset of PRESETS.filter((p) => p.kind === 'standard')) {
  for (const target of preset.targets.filter((t) => t.limit != null)) {
    const reading = READING_BY_ID[target.metric];
    if (!reading) throw new Error(`no reading answers ${preset.name} · ${target.label} (${target.metric})`);
    if (!band.includes(reading.quantity)) band.push(reading.quantity);
  }
}
console.log('band quantities:', band.map((q) => q.id).join(', '));

const engagedOf = (params, bypass) =>
  [...channelState(params, bypass)].filter(([, s]) => s.engaged).map(([id]) => id);

function contents(quantities, engaged, annual) {
  const usable = quantities.filter((q) => q.needs.channels.every((c) => engaged.includes(c)));
  const needed = RunContents.union(usable.map((q) => contentsFor(q, engaged)));
  return {
    usable: usable.map((q) => q.id),
    carried: new RunContents({
      variables: needed.variables,
      meters: needed.meters,
      tables: needed.tables,
      annual,
      channels: needed.channels,
      season: annual && needed.season,
    }),
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const allIn = Object.fromEntries(Object.keys(DEFAULT_BYPASS).map((k) => [k, false]));
const desks = [
  { name: 'default desk', params: DEFAULT_PARAMETERS, bypass: DEFAULT_BYPASS },
  { name: 'every channel in', params: DEFAULT_PARAMETERS, bypass: allIn },
];

const rows = [];
const added = new Set();
const only = process.env.G1_ONLY ?? null; // e.g. 'every channel in|annual', to re-run one row
for (const desk of desks) {
  const engaged = engagedOf(desk.params, desk.bypass);
  for (const annual of [false, true]) {
    if (only && only !== `${desk.name}|${annual ? 'annual' : 'design day'}`) continue;
    const base = contents([QUANTITY_BY_ID.extremes], engaged, annual);
    const wide = contents([QUANTITY_BY_ID.extremes, ...band], engaged, annual);
    const idfs = {};
    for (const [label, c] of [['default', base], ['band', wide]]) {
      idfs[label] = writeIdf(kit.documentFor({ schema, params: desk.params, bypass: desk.bypass, annual, reporting: c.carried }));
    }
    const times = { default: [], band: [] };
    let notGenerated = 0;
    let rdd = null;
    for (let i = 0; i < N; i += 1) {
      for (const label of ['default', 'band']) {
        const r = kit.runIdf({ idf: idfs[label], epw: annual ? epw : null });
        if (!r.success) throw new Error(`${desk.name} ${label} ${annual ? 'annual' : 'design day'} failed: ${r.threw}\n${r.err.slice(-1500)}`);
        times[label].push(r.ms);
        if (/requested but not generated/i.test(r.err)) notGenerated += 1;
      }
    }
    // Study runs request no variable dictionary, so the timed runs write no
    // .rdd. One extra run of the band IDF with Output:VariableDictionary added
    // is what confirms the names (constitution Gate 3).
    const dict = kit.runIdf({ idf: `${idfs.band}\nOutput:VariableDictionary,IDF;\n`, epw: annual ? epw : null });
    rdd = dict.rdd;
    for (const v of wide.carried.variables) {
      const inRdd = rdd?.includes(`,${v.name} [`) || rdd?.includes(`${v.name},`) || rdd?.includes(v.name);
      added.add(`${v.name} (${v.frequency}) — in .rdd: ${inRdd ? 'yes' : 'NO'}`);
    }
    const row = {
      desk: desk.name,
      run: annual ? 'annual' : 'design day',
      engaged: engaged.join(' '),
      usable: wide.usable.join(', '),
      defaultMs: median(times.default),
      bandMs: median(times.band),
      notGenerated,
    };
    row.ratio = row.bandMs / row.defaultMs;
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
console.log('\nvariables carried by the band contents:');
for (const line of added) console.log(' -', line);
console.log('\n| desk | run | default median ms | band median ms | ratio | "not generated" |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| ${r.desk} | ${r.run} | ${r.defaultMs} | ${r.bandMs} | ${r.ratio.toFixed(3)} | ${r.notGenerated} |`);
}
const worst = Math.max(...rows.map((r) => r.ratio));
console.log(`\nworst ratio ${worst.toFixed(3)} — G1 ${worst <= 1.1 ? 'PASSES' : 'FAILS'} (budget 1.10)`);
