# Phase 0: Research

**Feature**: Upgrade to idfkit-js v0.3.0-rc.3 | **Date**: 2026-09-09

Everything below was measured rather than read. The upstream release notes were
used to decide what to look at; not one of the three findings that matter was
taken from them.

The harness is `harness/build-positions.mjs` and `harness/compare.mjs`, which
write the IDF at eight desk positions, assert idempotence at each, record the
document's type order beside each file, and compare two spreads both raw and
normalised. `harness/` is gitignored, as the constitution's quality gates expect.

## The starting position

| Package | Declared | Resolved | Target |
| --- | --- | --- | --- |
| `@idfkit/core` | `^0.1.0` | 0.1.0 | 0.3.0-rc.3 |
| `@idfkit/schemas` | `^0.1.0` | 0.1.0 | 0.3.0-rc.3 |
| `@idfkit/weather` | `^0.1.0` | 0.1.0 | 0.3.0-rc.3 |
| `@idfkit/engine` | `^0.1.0` | 0.1.0 | unchanged, different repository |
| `@idfkit/engine-assets` | `26.1.0` | 26.1.0 | unchanged, different repository |

A caret on a `0.x` version pins the minor, so `^0.1.0` resolves to 0.1.0 and the
page has been three lines behind rather than drifting.

## Decision 1: the surface the page imports survives, with one rename

**Decision**: Rename the document type at its five uses in `src/` and change
nothing else about what the page imports.

**Rationale**: Measured against the installed target, of everything the page
names only one has moved.

| Imported name | On 0.3.0-rc.3 |
| --- | --- |
| `parseIdf`, `writeIdf`, `SchemaBundle`, `httpSource` | present |
| `IDFDocument` | **gone** |
| `IdfDocument` | present, is the replacement |
| `fetchWeatherFiles`, `loadStationIndex` | present |

The page does not name `detectVersion`, `detectEpJsonVersion`, `doc.collection`,
the removed `@idfkit/core/types` subpath, or the collection members that
`stripInternal` withdrew, so four of the release's five breaking changes reach
nothing here. The upstream claim of a two-line crossing is confirmed for the
imports and is wrong about the total, because the name also appears in three
prose comments, in the README, in the architecture notes and in the
constitution's third principle.

**Alternatives considered**: keeping an alias so the page's own spelling need not
change. Rejected: the library removed the old spelling deliberately and records a
rename budget that forbids a second one, so an alias here would be a private
second name for a concept the library has settled.

## Decision 2: the comment column moves one place left, and it is kept

**Finding**: Every written IDF differs, at every desk position, and most of the
difference is that each `!-` comment sits one column to the left.

This is the upstream fix in `0.3.0-rc.2`: `commentColumn` was documented as a
column and applied as a zero-based index, so every comment landed one place right
of the EnergyPlus files it imitates. Measured here, the default desk goes from
22,403 bytes to 22,022, a fall of 381 bytes, and the raw diff is 898 lines of
which almost all are this shift.

**Decision**: Take the fix. Do not pass a compensating `commentColumn` to hold
the old output.

**Rationale**: The old column was wrong, and the page's whole argument is that
the file it hands out is the file EnergyPlus expects. Passing `commentColumn: 31`
to reproduce the previous bytes would be re-introducing a fixed bug inside this
repository, where nobody would find it, in order to protect a byte comparison
that exists to protect the *model* rather than the whitespace.

**Consequence for the specification**: FR-003 as drafted ("byte-identical apart
from the header line naming the toolkit") is not achievable and was amended.
The gate is now content identity, defined precisely: identical once the run of
whitespace before each `!-` is collapsed. The comparison is mechanical and is
implemented in `harness/compare.mjs`.

**Alternatives considered**: comparing only the parsed object graph rather than
the text. Rejected as too forgiving. Collapsing the space before a comment is a
one-line normalisation that a reader can check by eye; parsing both sides and
comparing documents would also absorb a real change in how a value is written.

## Decision 3: reading an absent type no longer registers it

**This is the finding the feature turns on**, and it is the one the specification
predicted would produce no error anywhere.

`src/model.js` documents a measured behaviour of the 0.1.0 document: `all(type)`
and `get(type, name)` both go through `collection()`, which **inserted** an empty
collection for a type it had never seen, and `types()` is insertion order, which
is the order the IDF is written in. Merely asking whether a type is present moved
every later object of that type to the position of the question. `holds()` exists
as a guard against exactly that, at one call site in `applyAir`.

On 0.3.0-rc.3 the read path is:

```
collection(type) {
  const canonical = this.schema.resolve(type) ?? type;
  return this.#collections.get(canonical) ?? new IdfCollection(canonical);
}
```

It hands back a detached empty and stores nothing. Only `#collectionForWrite`,
reached from `add` and `attach`, may add a key.

**Measured consequence.** The document's type list stops being saturated:

| Desk position | Types on 0.1.0 | Types on 0.3.0-rc.3 |
| --- | --- | --- |
| Default | 69 | 30 |
| Fabric bypassed | 69 | 28 |
| Every channel engaged | 69 | 45 |
| Every channel bypassed | 69 | 28 |

On the default desk the 39 types that disappear are all **empty**, so the written
file is unaffected and only the comment column differs. Seven of the eight
positions are content-identical.

The eighth is not. With every channel engaged, types that are both swept by an
earlier channel and written by a later one **change position in the file**. The
observed movers are `Schedule:Compact`, `ThermostatSetpoint:DualSetpoint`,
`ZoneControl:Thermostat`, `Daylighting:Controls` and
`ZoneHVAC:EquipmentConnections`. The `Schedule:Compact` case is the one already
written down in the architecture notes: `applyAir` at channel 09 asks about that
type, Gains writes the occupancy schedule at channel 10, and the question used to
move all three schedules seventy lines up the file. The upgrade puts them back.

**Decision**: Accept the reordering. Do not attempt to preserve the old order.

**Rationale**: It is inert to the engine, and that was checked rather than
assumed. Both versions of the reordered position were run through EnergyPlus
26.1.0:

| | 0.1.0 output | 0.3.0-rc.3 output |
| --- | --- | --- |
| Exit code | 0 | 0 |
| `eplusout.eso` | byte-identical to the other | byte-identical to the other |
| `eplusout.mtr` | byte-identical to the other | byte-identical to the other |
| Warnings / severes | 1 / 0 | 1 / 0 |

An IDF is declarative input, the engine does not read order, and the results
files agree byte for byte. Preserving the old order would mean keeping a call
whose only purpose was to exploit a bug the library has fixed.

**Consequence for the code**: the `holds()` guard becomes unnecessary. It is
correct to leave in place (it still answers what it claims to answer, and asking
is now free of side effects) and it is misleading to leave undocumented, because
the prose around it explains a hazard that no longer exists. The guard and its
comment are part of the change.

**Alternatives considered**: keeping the old file order by adding explicit
registration of every swept type. Rejected outright. It would preserve a byte
comparison at the cost of writing, deliberately, the read-that-mutates the
library removed for being wrong on its own terms.

## Decision 4: a cold visit gets larger, by a measured amount

**Finding**: The schema bundle grows, and part of the growth is fetched.

| File | 0.1.0 | 0.3.0-rc.3 | Fetched by the page? |
| --- | --- | --- | --- |
| `index.json.gz` | 202 B | 202 B | yes |
| `manifest-26-1-0.json.gz` | 15,790 B | 16,089 B | yes, one manifest |
| `types.json.gz` | 779,168 B | 918,960 B | yes, in full |
| `docs.json.gz` | absent | 175,035 B | **no** |
| `data/` total staged | 1,040 KB | 1,348 KB | staged and deployed whole |

`SchemaBundle` reads `index.json`, then `types.json` in full, then the one
manifest asked for. `docs.json` is read only by `loadProse()`, which this page
never calls, so the prose pool is staged into `public/schemas/` and uploaded and
never downloaded by a reader.

**Decision**: Accept an increase of about 140 KB on a cold visit, and state it.

**Rationale**: The growth is in the type store, which is the part the page needs
to read a schema at all. Against the 28.40 MiB engine binary and the rest of a
cold visit it is about half a per cent. There is no way to take it without
forking the bundle.

**Consequence for the specification**: FR-010 as drafted ("MUST NOT increase")
is false and was amended to a measured budget with the prose pool named as
staged-but-never-fetched.

**Alternatives considered**: pruning `docs.json.gz` out of the staged directory
in `scripts/copy-schemas.mjs`. Not adopted here, because it saves a reader
nothing (it is never fetched) and buys only deployment bytes, while adding a
file-name assumption about a bundle layout the package does not promise. It is
noted for a future change if the deploy ever becomes the constraint.

## Decision 5: the pin is exact, and the schema pin moves in lockstep

**Decision**: Pin all three packages to the exact string `0.3.0-rc.3`, with no
range operator.

**Rationale**: Two reasons, and the second is the one with teeth.

A prerelease reached by a range is a build whose stamped toolkit is not
reproducible, which the constitution's second principle forbids: the sheet
freezes the resolved version into every IDF it writes, and a range that can drift
onto `0.3.0-rc.4` makes two builds of one commit disagree about what wrote the
file.

And `@idfkit/core@0.3.0-rc.3` declares a dependency on `@idfkit/schemas` at the
exact version `0.3.0-rc.3`. If the page's own schema pin stayed behind, the
install tree could carry two copies: `scripts/copy-schemas.mjs` stages
`node_modules/@idfkit/schemas/data` from the top-level copy, while the parser
inside `@idfkit/core` reads its own nested one. The page would then serve one
bundle and validate against another, with no error at either end. Verifying that
exactly one copy of each package resolves is a step of the work, not an
assumption.

**Alternatives considered**: `~0.3.0-rc.3`, which npm would let drift across
candidates. Rejected for the reason above.

## Decision 6: nothing else in the release is adopted

**Decision**: Take the version move and nothing else, as the specification's
Out of Scope section states.

Two capabilities land in this release that the page has hand-rolled equivalents
of, and both were confirmed present on the installed target:
`parseEpw` and `monthlyMeans` in `@idfkit/weather`, against the page's own
`src/epw.js`; and the climate-zone filter keys on `StationIndex.filter()`,
against the page's own label parsing in `src/weather.js`.

**Rationale**: Both would change what the page computes. `src/epw.js` feeds the
running mean the overheating criteria are read against, and the page's zone
parsing decides which stations the picker offers. Each is worth its own feature
with its own before-and-after comparison, and folding either into an upgrade
whose promise is that nothing moved would make that promise unverifiable.

## What is left unresolved

Nothing blocking. One item is carried into implementation as a check rather than
a decision: the cause of the 140 KB growth in `types.json.gz` is not established.
The release notes account for 5,416 bytes of bundle growth from the string-enum
branch the validator fix needed, which is two orders of magnitude short. The
number is reported as measured and the cause is not claimed.
