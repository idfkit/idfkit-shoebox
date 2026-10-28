# Contract: `src/undo.js`

DOM-free and network-free: no `window`, `document`, `sessionStorage` or
`fetch`. Storage is handed in, as `schemes.js` takes its storage as a
constructor argument.

```js
export const LIMIT = 100;
export const MERGE_WINDOW = 1000; // ms
export const UNDO_STORE = 'shoebox-undo-v1';

export class Step {
  constructor({ hash, solo = null, patchBay = null, key = null, at = null });
  static same(a, b): boolean;
}

export class UndoStack {
  constructor({ now = () => Date.now(), limit = LIMIT, mergeWindow = MERGE_WINDOW } = {});
  get seeded(): boolean;
  get canUndo(): boolean;
  get canRedo(): boolean;
  get present(): Step | null;
  seed(step: Step): void;
  adopt(stored: UndoStack | null, step: Step): boolean; // true when the stored stack was taken
  record(step: Step): 'ignored' | 'merged' | 'pushed';
  undo(): Step | null;
  redo(): Step | null;
  toJSON(): { linkVersion: string, past: object[], present: object, future: object[] };
  static fromJSON(raw: string, { now }?): UndoStack; // throws, naming what is wrong
}

/** Read, validate and return the kept stack, or null. `decode` is `decodeState`. */
export function readKept(storage, decode): UndoStack | null;
/** Write the stack. Swallows the storage's own refusal (quota, private mode). */
export function keep(storage, stack): void;
```

## Invariants the harness asserts

1. `record` of an equal step returns `'ignored'` and changes nothing.
2. Undo then redo returns `Step.same` to the starting present.
3. A `record` after an `undo` empties `future`.
4. 101 distinct pushes leave `past.length === LIMIT - 1`, with the oldest
   dropped.
5. Same key, under the window, with no undo between: merged. Same key over the
   window, a different key, a null key, or the first record after an undo:
   pushed.
6. `fromJSON(JSON.stringify(stack.toJSON()))` round-trips every step
   `Step.same`.
7. `readKept` returns `null` for a missing value, malformed JSON, an unknown
   link version, or any step `decode` throws on.
