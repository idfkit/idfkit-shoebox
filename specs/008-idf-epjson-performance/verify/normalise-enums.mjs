/**
 * Bring every choice-field value in an epJSON document onto the schema's own
 * spelling.
 *
 * The IDF reader matches a choice case-insensitively; the epJSON reader matches
 * the JSON Schema enum exactly and reports a severe for anything else. So a
 * document that runs clean as text fatals as JSON on nothing but capitals. This
 * walks the schema's `e` lists (and the extensible groups' inner fields) and
 * reports every value it had to move, so the cost of the switch is counted
 * rather than papered over.
 */
export function normaliseEnums(epjson, schema) {
  const moved = [];
  const fix = (type, name, field, def, value) => {
    if (typeof value !== 'string' || !def?.e) return value;
    if (def.rc) return value; // schema says this one is genuinely case-sensitive
    if (def.e.includes(value)) return value;
    const hit = def.e.find((c) => typeof c === 'string' && c.toLowerCase() === value.toLowerCase());
    if (!hit) return value;
    moved.push({ type, name, field, from: value, to: hit });
    return hit;
  };

  for (const [type, objects] of Object.entries(epjson)) {
    if (type === 'Version') continue;
    const def = schema.get(type);
    if (!def) continue;
    for (const [name, obj] of Object.entries(objects)) {
      for (const [field, value] of Object.entries(obj)) {
        if (Array.isArray(value) && def.x?.key === field) {
          for (const row of value) {
            for (const [inner, v] of Object.entries(row)) {
              row[inner] = fix(type, name, `${field}[].${inner}`, def.x.p[inner], v);
            }
          }
          continue;
        }
        obj[field] = fix(type, name, field, def.p[field], value);
      }
    }
  }
  return moved;
}
