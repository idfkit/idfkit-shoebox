# Contract: the toolkit surface this page consumes

**Feature**: Upgrade to idfkit-js v0.3.0-rc.3 | **Date**: 2026-09-09

This page publishes no API. Its external interface, in the sense that matters
here, points the other way: it is the set of names it takes from the idfkit
libraries, and the behaviour it relies on from each. That is what an upgrade can
break, so it is what is written down.

Every row was checked against `0.3.0-rc.3` as installed, not against the release
notes.

## Names imported

### `@idfkit/core`

| Name | Used by | 0.1.0 | 0.3.0-rc.3 | Action |
| --- | --- | --- | --- | --- |
| `parseIdf` | `src/model.js` | present | present | none |
| `writeIdf` | `src/main.js` | present | present | none |
| `SchemaBundle` | `src/main.js` | present | present | none |
| `httpSource` | `src/main.js` | present | present | none |
| `IDFDocument` | `src/model.js` | present | **absent** | rename to `IdfDocument` |
| `IdfDocument` | `src/model.js`, after | absent | present | the replacement |

### `@idfkit/weather`

| Name | Used by | 0.1.0 | 0.3.0-rc.3 | Action |
| --- | --- | --- | --- | --- |
| `loadStationIndex` | `src/weather.js` | present | present | none |
| `fetchWeatherFiles` | `src/weather.js` | present | present | none |

### `@idfkit/schemas`

Reached through `@idfkit/core`'s re-exports at run time, and directly as
`@idfkit/schemas/node` (`localBundle`) in the harnesses. Its `data/` directory is
staged into `public/schemas/` by `scripts/copy-schemas.mjs`, which copies the
directory whole and therefore absorbs a layout change without being edited.

### `@idfkit/engine`

`createEnergyPlus`, `findVariables`, `getTimeSeries`. Out of scope: a different
repository, a different version line, and no dependency on any package moving
here.

## Names the release changed that this page does not use

Four of the five breaking changes reach nothing. Recorded so a future reader does
not have to re-derive it.

| Change | Reaches this page? |
| --- | --- |
| `detectVersion` becomes `getIdfVersion` | no, never named |
| `detectEpJsonVersion` becomes `getEpJsonVersion` | no, never named |
| `doc.collection(type)` withdrawn in favour of `doc.all(type)` | no; the page already calls `all()` and `types()` |
| `@idfkit/core/types` subpath removed | no; the page carries no build-time types |
| `IdfCollection.insert` / `delete` / `rekey` withdrawn | no, never named |

## Behaviour relied on, beyond the names

The names are the loud half. These are the quiet half, and one of them changed.

### The document registers a type only when written to

**Was**: `all(type)` and `get(type, name)` inserted an empty collection for a type
the document had never held, and `types()` is insertion order, which is the order
the IDF is written in. Asking moved every later object of that type to the
position of the question. `holds()` in `src/model.js` guards one call site
against exactly this.

**Is**: the read path hands back a detached empty and stores nothing. Only the
write path may add a key.

**Consequence**: object order changes at desk positions where a type is swept by
an earlier channel and written by a later one. Verified inert to the engine.
`holds()` becomes unnecessary; it still answers what it claims and its
surrounding prose no longer describes a live hazard.

### The writer puts `!-` at a column

**Was**: one place right of where EnergyPlus puts it, a documented column applied
as a zero-based index.

**Is**: correct.

**Consequence**: every comment line in every written IDF moves one column left.
The page passes no `commentColumn` and takes the default, deliberately.

### `SchemaBundle` fetches the type store in full

Unchanged in mechanism: `load(version)` reads `index.json`, then `types.json` in
full, then the one manifest asked for. `docs.json` is read only by `loadProse()`,
which this page never calls.

**Consequence**: the type store's growth from 779,168 to 918,960 bytes is a
cold-visit cost; the 175,035-byte prose pool is staged and deployed and never
downloaded.

### `writeIdf` takes the document and no options

Unchanged. The page calls `writeIdf(model)` with no second argument, so it takes
every default, which is what makes the corrected comment column reach it.

## What this contract does not cover

The new capabilities in this release (`parseEpw`, `monthlyMeans`, and the
climate-zone filter keys) are confirmed present and are deliberately unused. They
enter this contract when a feature adopts them, not before.
