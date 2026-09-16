/**
 * Quickstart gate 2 — the `Site:Location` field names, confirmed.
 *
 * T007, and it blocks T010 absolutely. The station path never had to name these:
 * `designConditionsFrom` copies the DDY's parsed object with `toJSON()`, so the
 * spellings ride along. The file path has to write them from an EPW's LOCATION
 * record, which is the first time this repository spells them out — and
 * CLAUDE.md's rule is that field names drift between versions and are checked
 * against the schema, never recalled.
 */
import { localBundle } from '@idfkit/schemas/node';

const bundle = await localBundle();
const schema = await bundle.load('26.1.0');

const WANTED = ['latitude', 'longitude', 'time_zone', 'elevation'];

let bad = 0;
for (const name of WANTED) {
  const field = schema.field('Site:Location', name);
  if (!field) {
    console.log(`MISSING  Site:Location.${name}`);
    bad += 1;
    continue;
  }
  console.log(`ok       Site:Location.${name}  t=${field.t}`);
  if (field.t !== 'n') {
    console.log(`         ^ expected a numeric field, got ${field.t}`);
    bad += 1;
  }
}

// What the object is keyed by, since `doc.add(type, name, values)` takes the name
// separately and the city goes there.
console.log('\nSite:Location fields the schema knows:');
console.log(schema.fields?.('Site:Location')?.map((f) => f.name).join(', ') ?? '(no fields() on this schema)');

process.exit(bad ? 1 : 0);
