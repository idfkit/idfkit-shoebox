# Contract: reading the network back (`src/readings.js`, `src/main.js`, `src/describe.js`)

What the run says, and the four ways of saying nothing.

`readings.js` stays DOM-free, network-free and engine-free, by the rule that
made it a module: the Node harness calls the real readers, and a
reimplementation would drift on exactly the question of which hours count.

## `networkFlow(eso, environments)`

```js
/**
 * What the pressure network actually moved, off the run.
 *
 * The rate is the SUM of two series, and this is the whole reason this
 * function exists rather than a `hourly()` call at the sheet:
 *
 *   AFN Zone Infiltration Air Change Rate  is the cracks
 *   AFN Zone Ventilation Air Change Rate   is the openings
 *
 * Measured on the stock desk with a south opening: 0.0007 and 0.684 ACH.
 * "Infiltration" is the engine's word for "through a crack", not for the
 * infiltration of this building, so reading it alone letters a number three
 * orders of magnitude under the truth, under a label claiming the whole
 * building. Neither series is optional and neither is the answer.
 *
 * Read over the billed environments, as `readExtremes` and `readDemand` are:
 * a year where there is one, so kept sizing days stay out of an annual mean.
 *
 * @returns {NetworkFlow|null} null where the network was not in the run at all
 */
export function networkFlow(eso, environments)
```

```js
NetworkFlow {
  ach         // number      mean over the billed environments
  achMin      // number
  achMax      // number
  hoursOpen   // number|null hours any opening stood open; null with no opening
  hoursTotal  // number      hours in the environments read
  wholeYear   // boolean     whether a mean is a thing this run can support
}
```

### The refusals

Four, and the distinctions between them are the point.

| Condition | Returns | Why not something else |
|---|---|---|
| Neither ACH series is in the ESO | **`null`** | The network was not in the path. That is not a measurement of no flow, and a zero here would letter "0.00 ACH" over a building running on a scheduled rate. |
| Both series present, every hour zero | `ach: 0` | A real reading. A sealed network genuinely moves no air, and zero is a measurement. |
| No opening-factor series | `hoursOpen: null` | There is no opening. The row is omitted, the way the demand rows are omitted when their meters are absent, because a building with no openings is not a building whose openings never opened. |
| Opening-factor series present, never above zero | `hoursOpen: 0` | FR-016. The sheet says **"the openings never opened"** in words rather than lettering a zero that reads as a measurement. |

`wholeYear` follows the bill's own rule: an annual mean of a two-design-day run
has no use but to be mistaken for a year's. Where it is false the readout
letters the range and not the mean.

### The hours-open count

Counted off `AFN Surface Venting Window or Door Opening Factor`, which arrives
as one series per openable window. **An hour in which two openings stood open is
one hour**, not two, so the count is over the union rather than the sum. That is
the same discipline the Run channel's special days already keep: the engine
marks a day once however many entries claim it, and summing entries read eleven
days where the engine flagged ten.

## `main.js`

### The readout

`lastNetwork` joins `lastGlass` as a module-level reading, set in `solve` after
the ESO is parsed and taken down by `clearReadings` on each of `solve`'s failure
exits. It enters `readouts()` as a second entry:

```js
function readouts() {
  const out = new Map();
  if (lastGlass) out.set('glazing', /* unchanged */);
  if (lastNetwork) {
    out.set('air', {
      text: lastNetwork.wholeYear
        ? `${lastNetwork.ach.toFixed(2)} ACH`
        : `${lastNetwork.achMin.toFixed(2)}–${lastNetwork.achMax.toFixed(2)} ACH`,
      sub: openSub(lastNetwork),
    });
  }
  return out;
}
```

Nothing in `console.js` changes. `setReadings` already letters an em dash for a
channel with a readout and no entry in the map, which is FR-013's "an em dash
before the first run" and "taken down with the rest by `clearReadings`" for
free, and `markStale` already dims it with the rest of the sheet.

`openSub` is where FR-014 and FR-016 land:

```js
// The hours the openings actually stood open, and the two ways of having
// nothing to say about it. `null` is no opening at all and the line is left
// off; zero is an opening that never opened, which is a reading and is said.
const openSub = (n) =>
  n.hoursOpen === null ? null
  : n.hoursOpen === 0 ? 'The openings never opened'
  : `Open ${n.hoursOpen} of ${n.hoursTotal} h`;
```

### The stated figure beside the computed one

FR-005a and FR-005b. Three figures for one question, and they are three
different things:

| Where | Figure | What it is |
|---|---|---|
| The `envLeak` face | `0.50 ACH` | what the reader asked for, at a 4 Pa reference |
| Under the face | `0.072 kg/s at 1 Pa over 511.0 m²` | what the model was given |
| The readout | `0.15 ACH` | what this climate did with it |

The middle line is the one FR-005a demands, and it carries the arithmetic:
`0.5 ACH · 1061.9 m³ / 3600 · 1.204 kg/m³ / 4^0.65`. The register already prints
its blower-door conversion this way, for the same reason: a derivation the
reader cannot redo is a number applied out of sight.

**The stated and computed figures must not be lettered as the same quantity.**
They differ by about a factor of three on the measured desk, and a reader who
took the gap for a failure to apply the setting would be wrong about the model.
The readout's label (`As run`) and its position beside the meter rather than in
the control list are what carry that, exactly as Glazing's `As built` does.

### The folded index row

FR-004 and SC-006: the model in force must be nameable at 390 px without opening
anything. The folded strip already carries a reading slot, and the Air strip's
folded reading becomes the model's name plus the rate, so the row reads
`09 Air · Network · 0.15 ACH in`. `flowWord` supplies the direction, as it
already does for every rail figure.

## `describe.js`

FR-018. The air clause branches on which model produced the flow, and both
halves are read off **the document and the run**, never off live `params`,
because the sentence is captured before the await from the snapshot the run was
written from.

```js
if (on('air')) {
  say('air', FLIP.air, network(doc)
    ? [ /* the network's clause */ ]
    : [ /* the scheduled clause, unchanged */ ]);
}
```

The network's clause names what it reached:

- **the model**, because FR-018 requires the paragraph say which one produced
  the flow, and a reader comparing two links needs it in the sentence and not
  only on a strip;
- **the leakiness as the document holds it**, and the walls that are actually
  openable, by the rule that a setting is described by the object it reached
  and not by its own value. A desk whose four openable walls are all solid has
  no opening in the document and the clause must not claim one;
- **the rule**, read off `ventilation_control_mode` in the document, so a mode
  the applier did not write cannot be described;
- **the computed rate**, which is the only figure here that is a reading.

The compass words follow the existing rule: `geometryFacts().faces` carries each
wall's bearing off its own outward normal, and the description letters the
bearing beside the word wherever the box is off the cardinals. A building turned
40° has a wall called south facing south-east, and the plan key's name is the
one thing about it that is flatly untrue.

`FLIP.air` at 1.4 is unchanged: the channel being patched in or out still
outranks anything a slider on it can reach. **Switching models is not a flip**
and scores as a scalar move would, which is right: it is a change within an
engaged channel, and a paragraph that ranked it above a channel appearing would
describe the air model of a building whose ideal unit it never mentioned.

## `tour.js`

The general notes are part of done, and this feature touches one step's subject.

- Any note whose copy names an Air control by name is re-read against the new
  declaration, since seven of them now appear only under one model.
- **Bump `STORE` to `shoebox-general-notes-v3`** if any step changes meaning.
  A returning reader gets the new sheet rather than stale ticks against notes
  they never read.
- The reporting call sites in `main.js` are unchanged: the notes record real
  events, and switching air models is a `commit` from an input listener, which
  already files the `drag` note.

## Verification obligations

1. **The sum.** A run whose crack series and opening series are known
   separately reports their sum, not either one. The harness asserts against
   the two series read independently.
2. **The four refusals**, each driven to its condition: no network, a sealed
   network, no opening, an opening that never opened. Each must produce its own
   sentence and none may produce a bare zero.
3. **The description over documents the harness builds itself**, since
   `describe.js` is DOM-free and network-free and the station arrives as
   `{ name, zone }` already read. Both models, and a desk whose openable walls
   are all solid.
4. **The link.** Every one of the nine new keys encodes and decodes exactly, and
   every malformed input class is refused: a bad `openRule` option, an
   out-of-range `envLeak`, an `openable` key on a wall that has none. Plus the
   FR-020 case: a link minted with no `airModel` key resolves to `Scheduled` and
   reproduces its original numbers.
