/**
 * Quickstart gate 14: constraining the design space. No engine.
 *
 * contracts/constraints.md, in seven blocks: every refusal class throws naming
 * what was wrong; every design of a constrained region lies inside it on the
 * control's own grid (SC-016); the grid is region-independent (SC-017); the
 * `VALUES` memo carries the region; a ruled-out door is listed and never
 * measured; `cn` round-trips and refuses whole; and every figure carries the
 * span it was measured over (SC-018).
 *
 * Block 3 asserts the **corrected** SC-017. The contract first stated it as
 * "one index gives byte-identical params under two regions that both admit
 * the value", which is false and had to be: `snapped` bins into the span, so
 * design *i* under a narrower region is a different building, and if it were
 * not, narrowing would change nothing about what is sampled. What is true, and
 * what lets a re-cut reuse anything at all, is that every value any region can
 * produce lies on the control's own grid anchored at `control.min`, so a
 * constrained design is a desk the unconstrained space could have produced too
 * and two equal desks key one cache entry.
 */

import { ALL_KEYS, DEFAULT_BYPASS, DEFAULT_PARAMETERS, controlFor } from '../../../src/controls.js';
import { Bound, Region, RuledOut, designAt, doorsOf, neighboursOf, probesAt, worldOf } from '../../../src/space.js';
import { decodeState, encodeRegion, encodeState } from '../../../src/permalink.js';
import { DesignLedger, Landed, bindingsOf, planOf, screen } from '../../../src/strategy.js';
import { READING_BY_ID } from '../../../src/survey.js';
import { finish, ok, throws } from './desk.mjs';

console.log('constraining the design space (gate 14)');

const world = worldOf(DEFAULT_PARAMETERS, DEFAULT_BYPASS);
const reading = READING_BY_ID.high;
const KEY = 'wallR';
const { control } = controlFor(KEY);
const narrow = new Region([new Bound({ key: KEY, from: 2, to: 6 })]);
const terrain = doorsOf().find((door) => door.id === 'terrain');
const onGrid = (key, value) => {
  const stops = (value - controlFor(key).control.min) / controlFor(key).control.step;
  return Math.abs(stops - Math.round(stops)) < 1e-6;
};

/* ── 1. every refusal class, naming what was wrong ──────────────────────── */

const bearing = ALL_KEYS.find((key) => controlFor(key).control.kind === 'bearing');
const profile = ALL_KEYS.find((key) => controlFor(key).control.kind === 'profile');
throws('a Bearing carries no range to bound', () => new Bound({ key: bearing, from: 0, to: 90 }), 'no min, max or step');
throws('a Profile carries no range to bound', () => new Bound({ key: profile, from: 0, to: 8 }), 'no min, max or step');
throws('a non-finite bound is refused', () => new Bound({ key: KEY, from: Number.NaN, to: 6 }), 'has to be a number');
throws('a backwards range is refused', () => new Bound({ key: KEY, from: 6, to: 2 }), 'not a range');
throws('a bound off the control’s face is refused', () => new Bound({ key: KEY, from: 0, to: 99 }), 'outside its own');
// The one piece of validation that is new rather than a reuse: `refuses` does
// not test step alignment, so nothing else catches a region no design can sit in.
throws(
  'a region narrower than the step is refused, naming the step',
  () => new Bound({ key: KEY, from: 2.001, to: 2.002 }),
  `steps by ${control.step}`,
);
ok('pinning to one value is accepted, being the degenerate case', new Bound({ key: KEY, from: 2, to: 2 }).stops === 1);
throws(
  'a setting the door does not carry is refused',
  () => new RuledOut({ door: terrain, settings: ['Mars'] }),
  'is not a setting of the door',
);
throws(
  'ruling out every setting of a door is refused whole',
  () => new RuledOut({ door: terrain, settings: terrain.settings }),
  'a design space with no world in it is not a space',
);
throws('one control bounded twice is refused', () => new Region([new Bound({ key: KEY, from: 2, to: 6 }), new Bound({ key: KEY, from: 3, to: 5 })]), 'bounded twice');
throws('anything else in a region is refused', () => new Region([{ key: KEY }]), 'Bounds and RuledOuts');

/* ── 2. every design lies inside its region, on the grid (SC-016) ───────── */
{
  const ruled = new Region([new Bound({ key: KEY, from: 2, to: 6 }), new RuledOut({ door: terrain, settings: ['City', 'Ocean'] })]);
  let outside = 0;
  let off = 0;
  const COUNT = 120;
  for (let index = 0; index < COUNT; index += 1) {
    const { params } = designAt(world, index, ruled);
    if (params[KEY] < 2 - 1e-9 || params[KEY] > 6 + 1e-9) outside += 1;
    for (const key of Object.keys(params)) {
      const kind = controlFor(key).control.kind;
      if ((kind === 'scale' || kind === 'facade') && Number.isFinite(params[key]) && !onGrid(key, params[key])) off += 1;
    }
  }
  ok(`all ${COUNT} designs of a constrained region lie inside it (SC-016)`, outside === 0, `${outside} outside`);
  ok('and every numeric value lies on its control’s own step grid', off === 0, `${off} off the grid`);
  // A probe cannot step out of the region the plan says it measured.
  let escaped = 0;
  for (let index = 0; index < 8; index += 1) {
    for (const probe of probesAt(world, designAt(world, index, ruled), ruled)) {
      if (probe.skip || probe.key !== KEY) continue;
      if (probe.to < 2 - 1e-9 || probe.to > 6 + 1e-9) escaped += 1;
    }
  }
  ok('and no probe steps outside the region', escaped === 0, `${escaped} escaped`);
}

/* ── 3. the grid is region-independent (SC-017) ─────────────────────────── */
{
  let admitted = 0;
  let identical = 0;
  let off = 0;
  const COUNT = 300;
  for (let index = 0; index < COUNT; index += 1) {
    const free = designAt(world, index, Region.EMPTY);
    const held = designAt(world, index, narrow);
    if (!onGrid(KEY, held.params[KEY])) off += 1;
    if (narrow.admits(KEY, free.params[KEY])) {
      admitted += 1;
      if (JSON.stringify(free.params) === JSON.stringify(held.params)) identical += 1;
    }
  }
  ok(`every value a region produces is on the unconstrained grid, so equal desks key one cache entry (SC-017)`, off === 0, `${off} off the grid`);
  // Recorded as an assertion rather than a remark, because the contract first
  // claimed the opposite and a gate that let that claim back in would be
  // asserting that constraining the sequence does nothing.
  ok(
    `narrowing changes which building an index names (${admitted} admitted, ${identical} byte-identical)`,
    admitted > 0 && identical === 0,
    `${identical} of ${admitted} were identical`,
  );
}

/* ── 4. the memo carries the region ─────────────────────────────────────── */
{
  // Generated unconstrained first, so the memo is warm for this index, then
  // asked for again under a constraint. Keyed by the index alone, the second
  // call hands back the first answer and the design is a building from outside
  // the region with nothing reporting it.
  const before = designAt(world, 7, Region.EMPTY).params[KEY];
  const under = designAt(world, 7, narrow).params[KEY];
  const again = designAt(world, 7, narrow).params[KEY];
  const back = designAt(world, 7, Region.EMPTY).params[KEY];
  ok('a constrained design is not served the cached unconstrained value', under >= 2 && under <= 6);
  ok('the same region gives the same value twice', under === again);
  ok('and the unconstrained value is still there afterwards', back === before);
}

/* ── 5. a ruled-out door is listed, and never measured ──────────────────── */
{
  const free = neighboursOf(world, Region.EMPTY);
  const ruled = neighboursOf(world, new Region([new RuledOut({ door: terrain, settings: ['City', 'Ocean'] })]));
  const mine = (list) => list.filter((n) => n.door.id === 'terrain');
  ok('the same doors are listed either way, so none vanishes', free.length === ruled.length, `${free.length} against ${ruled.length}`);
  const out = mine(ruled).filter((n) => n.ruledOut);
  ok('both ruled-out settings are listed', out.length === 2, `${out.length} listed`);
  ok('and neither carries a world, so neither is ever measured', out.every((n) => n.world === null));
  ok('and each says the reader ruled it out', out.every((n) => /ruled out by you/i.test(n.refusal)), out[0]?.refusal);
  // The sentence a reader can act on must not be the sentence about what the
  // building is: a refused world keeps the engine's own reason.
  const engine = mine(free).filter((n) => !n.world);
  ok('a world the desk cannot enter keeps its own reason, not the reader’s', engine.every((n) => !n.ruledOut));
  ok('the settings still enterable are the ones not ruled out', mine(ruled).filter((n) => n.world).length === mine(free).filter((n) => n.world).length - 2);
}

/* ── 6. the link key `cn` ───────────────────────────────────────────────── */
{
  const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS } };
  const both = new Region([
    new Bound({ key: KEY, from: 2, to: 6 }),
    new RuledOut({ door: terrain, settings: ['City', 'Ocean'] }),
    new RuledOut({ door: doorsOf().find((d) => d.id === 'patch:blinds'), settings: [true] }),
  ]);
  const link = encodeState({ ...base, region: both });
  const back = decodeState(link);
  ok('every entry shape round-trips', encodeRegion(back.region) === encodeRegion(both), link);
  ok('and re-encodes byte-identically, so one region is one string', encodeState({ ...base, region: back.region }) === link);
  ok('an unconstrained desk writes no cn at all', encodeState({ ...base, region: Region.EMPTY }) === '');
  ok('a bound is spelled key_from_to', encodeRegion(narrow) === 'wallR_2_6', encodeRegion(narrow));
  ok('a patch door is spelled by its channel alone, the colon being escaped', /(^|\*)blinds_true(\*|$)/.test(encodeRegion(both)), encodeRegion(both));

  throws('an empty value is refused', () => decodeState('v1&cn='), 'empty');
  throws('an unknown control is refused', () => decodeState('v1&cn=nope_1_2'), 'no control is called');
  throws('a non-numeric bound is refused', () => decodeState('v1&cn=wallR_a_2'), 'is not a number');
  throws('a sub-step region is refused, naming the step', () => decodeState('v1&cn=wallR_2.001_2.002'), 'no position on that grid');
  throws('an unknown door is refused', () => decodeState('v1&cn=nodoor_City'), 'no door is called');
  throws('an unknown setting is refused', () => decodeState('v1&cn=terrain_Mars'), 'is not a setting of the door');
  throws('a door with every setting ruled out is refused', () => decodeState('v1&cn=terrain_Country.Suburbs.City.Ocean'), 'no world in it');
  throws('a malformed entry is refused', () => decodeState('v1&cn=wallR'), 'is not a constraint like');
  throws('a trailing separator is refused', () => decodeState('v1&cn=terrain_City.'), 'empty setting');
  throws('cn given twice is refused', () => decodeState('v1&cn=wallR_2_6&cn=wallR_2_5'), 'given 2 times');
  // The trap this codebase has now met four times.
  throws('a numeric cn value is refused as a constraint, not as a number', () => decodeState('v1&cn=12'), 'is not a constraint like');

  const all = encodeState({ ...base, survey: { x: 'wwrS', y: KEY, readings: ['high'], extents: {} }, plan: ['high', 'low'], region: both });
  const three = decodeState(all);
  ok('sv, sp and cn round-trip together', Boolean(three.survey && three.plan && three.region) && encodeState({ ...base, survey: three.survey, plan: three.plan, region: three.region }) === all);

  // A link minted before this feature carries no `cn` and must decode exactly
  // as it did. The comparison against the parent commit's own codec is
  // `link-roundtrip.mjs`'s job; what is asserted here is that adding a
  // reserved key left every one of them untouched.
  const corpus = ['v1&width=12', 'v1&out=fabric&in=blinds', 'v1&sty=extremes.width,wallR', 'v1&sv=wwrS*wallR*high*0_0.9*0.2_10'];
  let differs = null;
  for (const fragment of corpus) {
    const decoded = decodeState(fragment);
    if (decoded.region !== undefined) differs ??= `${fragment} (grew a region)`;
    // Canonical form rather than the hand-written spelling. Two of these do
    // move: patch pairs come back in `CHANNELS` order, and `URLSearchParams`
    // escapes the comma in a study list on the way out. Both predate this key
    // and neither is `cn`'s to fix, so what is asserted is that the codec is
    // idempotent from its own output on, which is the property a shared link
    // actually needs.
    const once = encodeState(decoded);
    if (encodeState(decodeState(once)) !== once) differs ??= `${fragment} (not idempotent: ${once})`;
  }
  ok(`all ${corpus.length} pre-feature links decode with no region and re-encode stably`, !differs, differs);
  // The bare version token is the one fragment that does not re-encode to
  // itself, and that is `encodeState`'s own documented rule rather than
  // anything `cn` changed: a default desk with nothing attached needs no link,
  // and stripping the hash entirely is what keeps the bare address canonical.
  const bare = decodeState('v1');
  ok('a bare v1 still decodes to the default desk with no region', bare.region === undefined && bare.params.width === DEFAULT_PARAMETERS.width);
  ok('and still encodes back to no fragment at all', encodeState(bare) === '');
}

/* ── 7. every figure carries the span it was measured over (SC-018) ─────── */
{
  const bag = (p) => Object.freeze({ extremes: Object.freeze({ high: 24 + 3 * p[KEY], low: 10 + 0.4 * p[KEY] }) });
  const ledger = new DesignLedger();
  const fill = (region) => {
    for (let index = 0; index < 60; index += 1) {
      const base = designAt(world, index, region);
      ledger.land(base.id, new Landed({ readings: bag(base.params) }));
      for (const probe of probesAt(world, base, region)) {
        if (!probe.skip) ledger.land(probe.id, new Landed({ readings: bag(probe.params) }));
      }
    }
  };
  fill(Region.EMPTY);
  fill(narrow);

  const read = (region) => {
    const entries = screen(world, reading, ledger, { bases: 8, tau: 0.5, region });
    const plan = planOf(world, reading, ledger, { designs: 60, bases: 8, kind: 'design-day', tau: 0.5, region });
    return { row: entries.find((entry) => entry.key === KEY), plan, entries };
  };
  const free = read(Region.EMPTY);
  const held = read(narrow);

  ok('a plan cannot be built without knowing its region', free.plan.region === Region.EMPTY && held.plan.region === narrow);
  ok('every screening row carries the region its effect is per', held.entries.every((entry) => entry.region === narrow));
  // The same words over two spans must not be the same number, or the reader
  // is told an effect across a fifth of a face is an effect across all of it.
  ok(
    `the same control reads differently over two spans (${free.row.effect?.toFixed(3)} against ${held.row.effect?.toFixed(3)})`,
    free.row.effect !== null && held.row.effect !== null && free.row.effect !== held.row.effect,
  );
  ok('and neither can be lettered without its span', held.plan.region.stateOf(KEY) !== null && free.plan.region.stateOf(KEY) === null);
  ok('the constrained span letters the bounds it was measured over', /2\.00.*6\.00/.test(held.plan.region.stateOf(KEY)), held.plan.region.stateOf(KEY));
  ok('a pinned control letters that it is pinned', /^pinned at/.test(new Region([new Bound({ key: KEY, from: 4, to: 4 })]).stateOf(KEY)));

  // A binding is read off measured designs inside the region, and what
  // relaxing it would buy only off completed runs outside it (FR-057).
  const bindings = bindingsOf(held.plan, ledger, { cost: { runs: 32, seconds: 12 } });
  const bound = bindings.find((binding) => binding.key === KEY);
  ok('a constraint the best designs stand against is reported as binding', Boolean(bound), `${bindings.length} bindings`);
  ok('and says which end they pile against, out of how many', bound?.end === 'from' && bound.share.at > bound.share.of / 2);
  ok('and carries exactly one of what relaxing buys and why that is unknown', (bound?.worth === null) !== (bound?.absence === null));

  const insideOnly = new DesignLedger();
  for (let index = 0; index < 60; index += 1) {
    const base = designAt(world, index, narrow);
    insideOnly.land(base.id, new Landed({ readings: bag(base.params) }));
    for (const probe of probesAt(world, base, narrow)) {
      if (!probe.skip) insideOnly.land(probe.id, new Landed({ readings: bag(probe.params) }));
    }
  }
  const thin = planOf(world, reading, insideOnly, { designs: 60, bases: 8, kind: 'design-day', tau: 0.5, region: narrow });
  const unmeasured = bindingsOf(thin, insideOnly, { cost: { runs: 32, seconds: 12 } }).find((binding) => binding.key === KEY);
  ok('with no completed run outside it, nothing is extrapolated', unmeasured?.worth === null && typeof unmeasured?.absence === 'string');
  ok('and the offer to measure states its cost first', /32 designs .* about 12 s/.test(unmeasured.absence), unmeasured?.absence);
}

finish();
