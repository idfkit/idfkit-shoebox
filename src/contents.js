/**
 * What one run is asked to carry, and whether one run's output answers
 * another's question.
 *
 * These two declarations live in their own module rather than in `study.js`
 * because both ends of the desk need them and the ends are on opposite sides
 * of the import graph. `study.js` declares the quantities in terms of them;
 * `model.js` reads one back in `syncReporting` to write the `Output:*` objects
 * a sample carries. Left in `study.js`, that second reader closed a cycle —
 * `model.js` → `study.js` → `schemes.js` → `tm59.js` → `model.js` — and an ES
 * module cycle is only ever half a problem: it resolves for whichever entry
 * point happens to unwind it in the right order and throws a bare
 * `Cannot access 'SEASON' before initialization` for the others. Measured:
 * importing `src/model.js`, `src/study.js` or `src/permalink.js` first loaded
 * clean, while `import('./src/tm59.js')` and `import('./src/schemes.js')` —
 * the two the TM59 quickstart asks a harness to load — both threw. A leaf
 * module nothing else imports is the fix that cannot come back.
 *
 * `study.js` re-exports both, so every existing importer is unchanged.
 */

/** One output variable request, including the two fields that change its meaning. */
export class VariableRequest {
  constructor({ name, frequency = 'Hourly', key = '*' }) {
    if (!name || !frequency || !key) throw new Error('a study variable request needs a name, frequency and key');
    this.name = name;
    this.frequency = frequency;
    this.key = key;
    this.id = JSON.stringify([frequency, key, name]);
    Object.freeze(this);
  }
}

/**
 * The comparable declaration of what a run carries.
 *
 * Arrays are sorted in the constructor, so equality, cache identity and model
 * serialization do not depend on the order quantities were declared or
 * unioned. The booleans and channel requirements travel with the output
 * requests because a series that was requested from a run which could not
 * produce it is not carried evidence.
 */
export class RunContents {
  constructor({ variables = [], meters = [], tables = false, annual = false, channels = [], season = false } = {}) {
    const byId = new Map();
    for (const variable of variables) {
      if (!(variable instanceof VariableRequest)) {
        throw new Error('RunContents variables must be VariableRequest declarations');
      }
      byId.set(variable.id, variable);
    }
    this.variables = Object.freeze([...byId.values()].sort((left, right) => left.id.localeCompare(right.id)));
    this.meters = Object.freeze([...new Set(meters)].sort());
    this.tables = Boolean(tables);
    this.annual = Boolean(annual);
    this.channels = Object.freeze([...new Set(channels)].sort());
    this.season = Boolean(season);
    Object.freeze(this);
  }

  static union(contents) {
    const list = [...contents];
    for (const item of list) {
      if (!(item instanceof RunContents)) throw new Error('RunContents.union expected only RunContents instances');
    }
    return new RunContents({
      variables: list.flatMap((item) => item.variables),
      meters: list.flatMap((item) => item.meters),
      tables: list.some((item) => item.tables),
      annual: list.some((item) => item.annual),
      channels: list.flatMap((item) => item.channels),
      season: list.some((item) => item.season),
    });
  }

  answers(needed) {
    if (!(needed instanceof RunContents)) throw new Error('RunContents.answers expected RunContents');
    const variables = new Set(this.variables.map((variable) => variable.id));
    const meters = new Set(this.meters);
    const channels = new Set(this.channels);
    return (
      needed.variables.every((variable) => variables.has(variable.id)) &&
      needed.meters.every((meter) => meters.has(meter)) &&
      (!needed.tables || this.tables) &&
      (!needed.annual || this.annual) &&
      needed.channels.every((channel) => channels.has(channel)) &&
      (!needed.season || this.season)
    );
  }

  get size() {
    return this.variables.length + this.meters.length + Number(this.tables);
  }

  get empty() {
    return this.size === 0;
  }

  serialize() {
    return JSON.stringify({
      variables: this.variables.map(({ name, frequency, key }) => [frequency, key, name]),
      meters: this.meters,
      tables: this.tables,
      annual: this.annual,
      channels: this.channels,
      season: this.season,
    });
  }
}
