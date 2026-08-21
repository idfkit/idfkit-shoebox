/**
 * The register.
 *
 * Two of these rules are asserted at module load and re-asserted here for the
 * reason the landmark rules are: an assertion that stopped running would take
 * its guarantee with it silently. The rest are the ones that decide whether a
 * scoreboard row is a verdict or a claim.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNELS,
  CHANNEL_BY_ID,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  controlFor,
  refuses,
} from '../src/controls.js';
import { LEFT_ALONE, Measure, PRESETS, applyPreset, chaseVerdict, conformance } from '../src/schemes.js';

const params = (o = {}) => ({ ...DEFAULT_PARAMETERS, ...o });
const bypass = (o = {}) => ({ ...DEFAULT_BYPASS, ...o });

describe('a preset may not write the brief, the solver or a price', () => {
  const forbidden = new Set(
    ['massing', 'site', 'context', 'solver', 'run', ...CHANNELS.filter((c) => c.prices).map((c) => c.id)]
      .flatMap((id) => CHANNEL_BY_ID[id].keys()),
  );
  const forbiddenChannels = new Set(
    ['massing', 'site', 'context', 'solver', 'run', ...CHANNELS.filter((c) => c.prices).map((c) => c.id)],
  );

  test('the list the interface letters is the list that is enforced', () => {
    assert.deepEqual(
      [...forbiddenChannels].map((id) => CHANNEL_BY_ID[id].name).sort(),
      [...LEFT_ALONE].sort(),
    );
  });

  for (const preset of PRESETS) {
    test(preset.name, () => {
      for (const spec of preset.specs) {
        assert.ok(!forbidden.has(spec.key), `${preset.name} sets ${spec.key}, which is left to the architect`);
      }
      for (const id of [...preset.engages, ...preset.bypasses]) {
        assert.ok(!forbiddenChannels.has(id), `${preset.name} patches ${id}`);
      }
    });
  }
});

describe('every clause of every preset is a thing a control can hold', () => {
  for (const preset of PRESETS) {
    test(preset.name, () => {
      for (const spec of preset.specs) {
        const { control } = controlFor(spec.key); // throws for a key nothing owns
        assert.equal(
          refuses(control, spec.value),
          null,
          `${preset.name} asks ${spec.key} for ${spec.value}, which the control refuses`,
        );
        assert.ok(spec.why?.trim().length > 0, `${spec.key} carries no arithmetic`);
        assert.equal(typeof spec.format(), 'string');
      }
      for (const id of [...preset.engages, ...preset.bypasses]) {
        assert.ok(CHANNEL_BY_ID[id]?.bypassable, `${id} cannot be patched`);
      }
    });
  }
});

describe('a specification is an overlay, not a replacement', () => {
  // Which is what makes "what would it take to build *this* to Passivhaus" a
  // question you can ask of the building already on the sheet.

  for (const preset of PRESETS.filter((p) => p.specs.length)) {
    test(preset.name, () => {
      const mine = params({ width: 30, depth: 8, northAxis: 40 });
      const applied = applyPreset(mine, bypass(), preset);
      const written = new Set(preset.specs.map((s) => s.key));
      for (const key of ['width', 'depth', 'northAxis']) {
        assert.ok(!written.has(key), 'the fixture picked a key the preset writes');
        assert.equal(applied.params[key], mine[key], `${key} was overwritten`);
      }
      for (const spec of preset.specs) assert.equal(applied.params[spec.key], spec.value);
    });
  }
});

describe('nothing is remembered', () => {
  test('conformance is measured, and drops the moment the desk moves', () => {
    const preset = PRESETS.find((p) => p.specs.length > 0);
    const applied = applyPreset(params(), bypass(), preset);
    assert.equal(conformance(applied.params, applied.bypass, preset).built, true);

    const nudged = { ...applied.params, [preset.specs[0].key]: DEFAULT_PARAMETERS[preset.specs[0].key] };
    const after = conformance(nudged, applied.bypass, preset);
    if (nudged[preset.specs[0].key] !== preset.specs[0].value) {
      assert.equal(after.built, false, 'a nudged desk still claims the standard');
      assert.equal(after.adrift.length, 1);
      assert.ok(after.adrift[0].label, 'the interface can say which clause drifted');
    }
  });

  test('a preset with no clauses does not conform — it is a question', () => {
    // "Conforms to a specification with no clauses in it" is the emptiest true
    // statement available, so `built` is null rather than true.
    const pure = PRESETS.find((p) => p.specs.length === 0 && p.engages.length === 0 && p.bypasses.length === 0);
    assert.ok(pure, 'the list still carries a targets-only standard');
    assert.equal(conformance(params(), bypass(), pure).built, null);
    assert.ok(pure.targets.length > 0);
  });
});

describe('a target is read off the run, and says why when it cannot be', () => {
  test('every target names a reading and what the run must carry', () => {
    for (const preset of PRESETS) {
      for (const target of preset.targets) {
        assert.ok(['tedi', 'cedi', 'eui', 'overheat', 'peakHeat', 'peakCool'].includes(target.metric), target.metric);
        assert.ok(['year', 'run'].includes(target.needs));
        assert.ok(target.asks?.trim().length > 0, `${target.label} does not state its criterion`);
      }
    }
  });

  test('a target with no line is not a pass', () => {
    // PHI sets the cooling limit per building and per climate, so there is no
    // figure this sheet is entitled to draw.
    const open = PRESETS.flatMap((p) => p.targets).filter((t) => t.limit == null);
    assert.ok(open.length > 0, 'the arrangement still has a limitless target in it');
    for (const target of open) assert.equal(target.meets(12), null);
  });

  test('a reading that is not a number is not a verdict either', () => {
    const lined = PRESETS.flatMap((p) => p.targets).find((t) => t.limit != null);
    assert.equal(lined.meets(Number.NaN), null);
    assert.equal(lined.meets(lined.limit), true);
    assert.equal(lined.meets(lined.limit + 1), false);
  });

  test('what is not being checked is printed beside what is', () => {
    // A panel showing only the half a shoebox can answer would read as a
    // certification.
    const passivhaus = PRESETS.find((p) => /passiv/i.test(p.name));
    assert.ok(passivhaus.unjudged.length > 0);
    for (const item of passivhaus.unjudged) {
      assert.ok(item.criterion?.trim().length > 0);
      assert.ok(item.why?.trim().length > 0);
    }
  });
});

describe('the worst line is ranked by ratio, not by difference', () => {
  // LETI's energy line is 55 kWh/m²·yr and Passivhaus's heating line is 15, so
  // 3 over means something different against each while 20 % over means the
  // same against both.
  const preset = {
    targets: [
      { id: 'small', label: 'Small', limit: 15, metric: 'tedi' },
      { id: 'large', label: 'Large', limit: 55, metric: 'eui' },
    ],
  };

  test('the smaller limit wins when both are the same amount over', () => {
    const verdict = chaseVerdict(preset, (t) => (t.id === 'small' ? 18 : 58));
    assert.equal(verdict.target.id, 'small', '18/15 is further over than 58/55');
    assert.equal(verdict.over, 3);
  });

  test('and loses when the ratio says so', () => {
    const verdict = chaseVerdict(preset, (t) => (t.id === 'small' ? 16 : 80));
    assert.equal(verdict.target.id, 'large');
  });

  test('a line with no reading behind it is not ranked', () => {
    const verdict = chaseVerdict(preset, (t) => (t.id === 'small' ? 18 : Number.NaN));
    assert.equal(verdict.read, 1);
    assert.equal(verdict.stated, 2, 'a verdict from one line must not read as a verdict on the standard');
  });

  test('no readings at all is an absence, never a verdict', () => {
    assert.equal(chaseVerdict(preset, () => Number.NaN), null);
  });
});

describe('a kept scheme refuses a comparison it cannot make', () => {
  // Nothing with an identity survives `JSON.stringify` into the browser's
  // storage, so the bill's own refusal is restated on flat data.
  const measure = (o = {}) => new Measure({
    annual: true, hours: 8760, uses: ['heating', 'cooling'], currency: 'USD',
    metered: 100, cost: 50, carbon: 20, ...o,
  });

  test('the same run, the same currency, the same end uses', () => {
    assert.ok(measure().comparableWith(measure()));
  });

  test('a design day is not a year', () => {
    assert.ok(!measure().comparableWith(measure({ annual: false, hours: 48 })));
  });

  test('Winnipeg is not differenced against Minneapolis', () => {
    assert.ok(!measure().comparableWith(measure({ currency: 'CAD' })));
  });

  test('a different set of end uses is a different bill', () => {
    assert.ok(!measure().comparableWith(measure({ uses: ['heating'] })));
  });
});
