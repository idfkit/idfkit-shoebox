/**
 * Gate 4 of quickstart.md: the `sv` codec round-trips and refuses.
 *
 * The constitution's fourth quality gate — "every key encodes and decodes
 * exactly, and every malformed input class is refused" — applied to the one
 * key this feature adds. DOM-free and engine-free; `permalink.js` imports
 * nothing but the declarations, which is what makes this possible at all.
 *
 * **The regression that matters is the last block.** `readValue`'s numeric
 * regex runs before its per-kind switch, so a `sv` branch written inside that
 * switch is unreachable and every survey link is refused as "is not a number
 * for sv" — a true sentence about the wrong thing, on a link that was
 * perfectly good. This codebase has now met that trap three times (the holiday
 * list, the boundary word, the hourly pattern), and the third one is
 * documented in CLAUDE.md as the case that would have proved the rule the hard
 * way. A survey value that is *syntactically a number* is the shape that
 * catches it, because it is the one that would pass the regex and then be read
 * as a parameter.
 */

import { DEFAULT_BYPASS, DEFAULT_PARAMETERS, controlFor } from '../../../src/controls.js';
import { LINK_VERSION, decodeState, encodeState } from '../../../src/permalink.js';
import { READINGS } from '../../../src/survey.js';

let failures = 0;
const ok = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};
const refuses = (label, fragment, wanted = null) => {
  try {
    decodeState(fragment);
    failures += 1;
    console.log(`  FAIL ${label} — the link was accepted`);
  } catch (failure) {
    const hit = !wanted || failure.message.includes(wanted);
    if (!hit) failures += 1;
    console.log(`  ${hit ? 'ok  ' : 'FAIL'} ${label}${hit ? '' : ` — refused as "${failure.message}"`}`);
  }
};

const base = { params: { ...DEFAULT_PARAMETERS }, bypass: { ...DEFAULT_BYPASS } };
const link = (survey) => encodeState({ ...base, survey });

console.log('the survey link (gate 4, SC-004)');

/* ── the version ledger is unmoved ─────────────────────────────────────── */
{
  ok('LINK_VERSION is still v1', LINK_VERSION === 'v1');
  // Adding a key is free under delta encoding, and this feature changes no
  // existing default, no key name and no range — so `DEFAULTS_BY_VERSION`
  // gains nothing and `MIGRATIONS` stays empty. Asserted from outside by the
  // one observable consequence: a v1 link still decodes.
  ok('a bare v1 link still decodes', Boolean(decodeState('v1')));
  ok('a default desk still mints no link at all', encodeState(base) === '');
}

/* ── every field round-trips exactly ───────────────────────────────────── */
{
  const cases = [
    { name: 'two axes and one reading', survey: { x: 'wwrS', y: 'wallR', readings: ['high'], extents: {} } },
    {
      name: 'two readings',
      survey: { x: 'wwrS', y: 'wallR', readings: ['high', 'low'], extents: {} },
    },
    {
      name: 'both extents named',
      survey: {
        x: 'wwrS',
        y: 'wallR',
        readings: ['high'],
        extents: { wwrS: { from: 0, to: 0.9 }, wallR: { from: 0.2, to: 10 } },
      },
    },
    {
      name: 'a narrowed extent',
      survey: {
        x: 'width',
        y: 'depth',
        readings: ['low'],
        extents: { width: { from: 8, to: 16 }, depth: { from: 6, to: 12 } },
      },
    },
    {
      name: 'a site control against a fabric one',
      survey: {
        x: 'groundTemp',
        y: 'wallR',
        readings: ['high'],
        extents: { groundTemp: { from: 4, to: 20 }, wallR: { from: 1, to: 5 } },
      },
    },
  ];
  for (const { name, survey } of cases) {
    let fragment;
    try {
      fragment = link(survey);
    } catch (failure) {
      failures += 1;
      console.log(`  FAIL ${name} — would not encode: ${failure.message}`);
      continue;
    }
    const back = decodeState(fragment).survey;
    const same =
      back.x === survey.x &&
      back.y === survey.y &&
      back.readings.join(',') === survey.readings.join(',') &&
      [survey.x, survey.y].every((key) => {
        const wanted = survey.extents[key] ?? { from: null, to: null };
        return back.extents[key].from === wanted.from && back.extents[key].to === wanted.to;
      });
    ok(`${name} round-trips exactly`, same, `${fragment} -> ${JSON.stringify(back)}`);

    // Re-serialised, so two spellings of one survey do not key two identical
    // solves through `shapeKey` and a survey at its own default is not written
    // into every link minted after.
    const again = encodeState({ ...base, survey: { ...back, readings: back.readings } });
    ok(`${name} re-serialises to itself`, again === fragment, `${fragment} against ${again}`);
  }

  // Every declared reading, so a series added later cannot ship unreadable.
  for (const reading of READINGS) {
    const fragment = link({ x: 'wwrS', y: 'wallR', readings: [reading.id], extents: {} });
    const back = decodeState(fragment).survey;
    if (back.readings[0] !== reading.id) {
      failures += 1;
      console.log(`  FAIL the reading "${reading.id}" does not round-trip`);
    }
  }
  ok(`all ${READINGS.length} declared readings round-trip`, true);

  // The address bar has to stay legible, which is the whole reason the
  // separators are what they are: `URLSearchParams` leaves only `*`, `.`, `-`
  // and `_` alone and escapes everything else.
  const legible = link({
    x: 'wwrS',
    y: 'wallR',
    readings: ['high'],
    extents: { wwrS: { from: 0, to: 0.9 }, wallR: { from: 0.2, to: 10 } },
  });
  ok(
    'nothing in the survey value is percent-escaped',
    !legible.includes('%'),
    legible,
  );
}

/* ── the survey rides alongside everything else ────────────────────────── */
{
  const fragment = encodeState({
    params: { ...DEFAULT_PARAMETERS, wwrS: 0.5, wallR: 4 },
    bypass: { ...DEFAULT_BYPASS },
    station: { wmo: '725650', window: '2009-2023' },
    pin: { kind: 'year', month: 8, day: 3, hour: 13 },
    survey: { x: 'wwrS', y: 'wallR', readings: ['high'], extents: {} },
  });
  const back = decodeState(fragment);
  ok('the survey rides beside a station, a pin and moved parameters', Boolean(back.survey) && back.station.wmo === '725650' && back.pin.hour === 13 && back.params.wwrS === 0.5);
  // The stance is not restated: it is the desk. One copy, so there is nothing
  // for a second copy to disagree with.
  ok(
    'and the stance is carried once, by the parameters, not twice',
    (fragment.match(/wwrS/g) ?? []).length === 2 && fragment.includes('wwrS=0.5'),
    fragment,
  );
}

/* ── every malformed class is refused whole ────────────────────────────── */
{
  refuses('the same control on both axes', 'v1&sv=wwrS*wwrS*high', 'twice');
  refuses('an axis on a priced channel', 'v1&sv=heatEfficiency*wallR*high', 'prices the run');
  refuses('an axis that is not a control at all', 'v1&sv=nonsuch*wallR*high', 'no control is called');
  refuses('an axis with no numeric face', 'v1&sv=occPattern*wallR*high', 'no numeric face');
  refuses('an unknown reading id', 'v1&sv=wwrS*wallR*nonsuch', 'no survey reading');
  refuses('one reading given twice', 'v1&sv=wwrS*wallR*high.high', 'twice');
  refuses('three readings', 'v1&sv=wwrS*wallR*high.low.tedi', 'one or two readings');
  refuses('an extent outside the control\'s range', 'v1&sv=wwrS*wallR*high*0_2', 'runs 0 to 0.9');
  refuses('an extent that is not an extent', 'v1&sv=wwrS*wallR*high*0.5_0.5', 'asks for 0.5 to 0.5');
  refuses('an extent that is not a number', 'v1&sv=wwrS*wallR*high*a_b', 'is not a number');
  refuses('an empty extent bound', 'v1&sv=wwrS*wallR*high*_0.9', 'is not a number');
  // A negative bound **parses** — which is the whole reason the extent's
  // separator is `_` and not `-`, since the minus sign is already spoken for —
  // and is then refused for the right reason, its range. No control on the
  // desk declares a negative minimum today, so this is the only way to assert
  // that the grammar is ready for the first one that does: refused as out of
  // range rather than as unreadable.
  refuses('a negative bound is refused for its range, not its syntax', 'v1&sv=groundTemp*wallR*high*-5_20', 'runs 2 to 26');
  refuses('a hexadecimal extent', 'v1&sv=wwrS*wallR*high*0x0_0.9', 'is not a number');
  refuses('too few fields', 'v1&sv=wwrS*wallR', 'is not a survey value');
  refuses('too many fields', 'v1&sv=wwrS*wallR*high*0_0.9*0.2_10*extra', 'is not a survey value');
  refuses('an empty value', 'v1&sv=', 'is not a survey value');
  refuses('the key given twice', 'v1&sv=wwrS*wallR*high&sv=width*depth*low', 'sv is given 2 times');

  // Whole, never half: a refused link leaves nothing behind, which is what the
  // caller relies on to put the sheet back to its defaults with the reason
  // standing. `decodeState` validates before it returns anything.
  let leaked = null;
  try {
    decodeState('v1&width=20&sv=wwrS*wallR*nonsuch');
  } catch {
    leaked = 'refused';
  }
  ok('a link with a good parameter and a bad survey is refused whole', leaked === 'refused');
}

/* ── the regression that matters ───────────────────────────────────────── */
{
  // A `sv` value that is syntactically a number. Written as a branch of
  // `readValue` — inside the per-kind switch, below the numeric regex — this
  // is the shape that would be swallowed by the regex and read as a parameter,
  // and every survey link would come back refused as "is not a number for sv".
  // Read here as a survey, it is refused for what is actually wrong with it.
  refuses('a survey value that is syntactically a number', 'v1&sv=1234', 'is not a survey value');
  refuses('a survey value that is a decimal number', 'v1&sv=0.35', 'is not a survey value');
  refuses('a survey value that is a negative number', 'v1&sv=-1', 'is not a survey value');

  // And the positive half, which is the one that actually proves the branch is
  // reachable: a real survey link decodes as a survey rather than being
  // refused as a number.
  const good = decodeState('v1&sv=wwrS*wallR*high');
  ok('a real survey link is read as a survey, not refused as a number', good.survey?.x === 'wwrS');

  // `sv` must never reach `readValue` at all, which is what the reserved skip
  // guarantees. Asserted from the declarations rather than by inspection: a
  // control key colliding with a reserved key would make the link mean two
  // things at once, and `permalink.js` throws at module load for that — so
  // reaching here at all is half the proof. The other half is that `sv` owns
  // no control.
  let owned = true;
  try {
    controlFor('sv');
  } catch {
    owned = false;
  }
  ok('no control owns the key "sv"', !owned);
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
