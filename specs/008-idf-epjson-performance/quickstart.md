# Redoing the measurements

Nothing here is wired into a build. The harness is throwaway in the sense
CLAUDE.md means it — written to answer one question and kept so the answer can be
checked — and it needs only the staged assets any dev run already needs.

```bash
npm install
npx idfkit-engine-assets public/energyplus
node scripts/copy-schemas.mjs
cd specs/008-idf-epjson-performance/verify
OUT=/tmp/fmt          # anywhere writable
```

`engine.cjs` finds the engine at `../../../public/energyplus`; override with
`EP_ASSETS=`.

## Size, and the write on the desk's own budget

```bash
OUT_DIR=$OUT/designday node write-variants.mjs
OUT_DIR=$OUT/annual ANNUAL=1 PARAMS='{"sizingPeriods":"No"}' node write-variants.mjs
```

Reports bytes and median write time per serialisation, and every enum value the
epJSON had to be repaired at before it would simulate.

## Input processing on its own

```bash
MODELS=$OUT/designday VARIANTS=idf-commented,idf-nocomments,idf-compressed,epjson-indent2,epjson-compact node convert-only.cjs
```

`--convert-only` stops before any environment runs. For the slope — which is what
says whether the answer would change on a bigger model:

```bash
for k in 0 500 2000; do
  OUT_DIR=$OUT/scale-$k K=$k node write-scaled.mjs
  MODELS=$OUT/scale-$k VARIANTS=idf-commented,idf-compressed,epjson-compact node convert-only.cjs
done
```

## End to end, warm

```bash
MODELS=$OUT/designday VARIANTS=idf-commented,idf-nocomments,idf-compressed,epjson-indent2,epjson-compact node run-formats.cjs
```

For the year, fetch any EPW and pass it. The one used for the record was Denver
TMY3, which is the station the default desk is already sized against:

```bash
curl -Lo $OUT/denver.epw https://raw.githubusercontent.com/NREL/EnergyPlus/develop/weather/USA_CO_Golden-NREL.724666_TMY3.epw
MODELS=$OUT/annual EPW=$OUT/denver.epw VARIANTS=idf-commented,idf-compressed,epjson-compact REPS=10 WARM=3 node run-formats.cjs
```

`REPS` and `WARM` default to 15 and 4. Do not set `WARM=0`: the first run on a
fresh instance costs about nine times the steady state and would swamp everything
the run is trying to say.

## Does the format change the answer

```bash
OUT_DIR=$OUT/positions node write-positions.mjs
POSITIONS=$OUT/positions node equivalence.cjs
```

Eight desk positions, three serialisations each, ESO compared byte for byte, as a
sorted multiset of lines, and by the order the environments came back in.

## Why epJSON reorders them

```bash
OUT_DIR=$OUT/order node order-mechanism.mjs
MODELS=$OUT/order node order-run.cjs
```

Four inputs that separate "the JSON key order decided it" from "the engine sorted
by object name". See `research.md`.
