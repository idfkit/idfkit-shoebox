# Contract: `src/tolerance.js` and its callers

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

The module is DOM-free and network-free. It imports from `schemes.js`, `survey.js`, `study.js` and `controls.js`, and none of those imports it back. In particular, `survey.js` must not import `tolerance.js`: `survey.js` → `schemes.js` is already an edge, and a cycle through `readings.js` is the trap `views.js` documents.

## Exports

```js
/** Every quantity any published standard's target is answered by. Frozen at load. */
export const BAND_QUANTITIES; // Quantity[]

/**
 * The quantities a study sample must carry at this snapshot: the study's own,
 * plus every BAND_QUANTITIES entry whose needs.channels are engaged on it.
 */
export function bandQuantities(studyQuantity, engagedChannels); // Quantity[]

/** One lever's band under one chased standard. Pure. */
export function bandFor({
  key, control, stance, curve, preset, coarse, stale,
  says, // (target) => string: targetBlock's sentence, injected so the module stays page-free
}); // Band

/** The block under the chase line. Pure. */
export function toleranceFor({ preset, bands, climateReason = null }); // Tolerance
```

Added to `survey.js`:

```js
/** The one Reading that answers this target, by 012's matcher; throws naming both if none. */
export function readingForTarget(preset, target); // Reading
```

## Load-time invariants (throw at module load, naming the declaration)

1. **Every target of every standard has an answering reading.** `readingForTarget` succeeds for each `Target` with `limit != null`. A standard gaining a line no study quantity can read must fail at mount, not draw a band that silently ignores it.
2. **`BAND_QUANTITIES` excludes nothing a target needs.** For each such target, `READING_BY_ID[target.metric].quantity` is in the list.
3. **The band contents are a superset of each study quantity's contents.** For every `q` in `QUANTITIES` and every channel set the harness enumerates, `RunContents.union(bandQuantities(q, ch).map(contentsFor)).answers(contentsFor(q, ch))`.
4. **Every target passes at or below its limit.** `meets(limit) === true` and `meets(limit + ε) === false`. The band's pass/fail classification relies on `meets` alone, so a target that ever grows a different comparator is caught here.

## Caller obligations

### `src/main.js`

- **`jobForStudy`** passes `bandQuantities(quantity, engagedChannels(snapshot, patch))` to `sampleContentsFor` in place of `[quantity]`. The survey's and the pull's `sampleContentsFor` calls are **not** changed.
- **`sampleIdentity`** is unchanged. The chase never reaches it.
- **`renderChase`** builds a `Tolerance` from every entry of `studies` with a curve, via `bandFor` and `toleranceFor`, and letters it under the chase line. Absences are lettered in view; the method and the full caveat go in a `fold()`.
- **The chase click handler** already calls `renderChase`. It also re-renders every open study card (`desk.setStudy(key, study, { stale })`) so each card's band follows the chase. No `refreshStudies` is needed for bands. The existing call stays for its TM59 reason.
- **`attachClimate`** sets the transient climate reason. The next study `'point'` clears it.
- **`reletter()`** replays every band `aria-label` thunk.

### `src/console.js`

- **`setStudy(key, study, { stale })`** accepts an optional `study.band` (a `Band`) and draws it on the card's position axis:
  - the bracketed bar for `band`, with the other passing stretches drawn lighter;
  - one line in words: the chased standard, the band's edges, and what closed each edge;
  - nothing at all when `band` is undefined (no chase).
- A `Band` with `judged.length === 0` draws no bar and letters its shared not-judged reason.

## What does not change

`shapeKey`, `restShapeKey`, `PRICED_KEYS`, the permalink (`LINK_VERSION`, `RESERVED`, `encodeState`), kept schemes, `applyModel` and every `Output:*` the live solve writes are untouched. Studies' `sty` key already rides the link and is not touched either. The quickstart asserts this by diffing `encodeState` and `shapeKey` output before and after.
