/**
 * The number in the margin, as the way to set it.
 *
 * Every quantity on this page is lettered off the model, and the lettering
 * used to be the end of the line: you could read `15.24 m` and you could drag
 * until it said something else, but you could not say 12. A slider is the
 * wrong instrument for an exact number — the width runs 4 to 40 m across about
 * two hundred pixels, which is 0.18 m to the pixel, so a specific dimension was
 * only reachable by holding an arrow key down a hundred times.
 *
 * So the readout is an input with no box drawn around it. It letters exactly as
 * the `output` it replaced — `format`, unit, zero word and all — it takes what
 * the model holds and hands a number back through `write`, and the only thing
 * that says it can be typed into is the I-beam the cursor becomes over it. That
 * is the whole of the affordance and it is deliberate: a box, a border or a
 * fill would put eighteen more rectangles on a sheet whose whole manner is
 * hairlines and lettering.
 *
 * The parsing half lives on the control declaration in `controls.js`, beside
 * the `format` it has to undo, so a unit or a stop changed there changes what
 * this box will accept.
 */

/**
 * One quantity, drawn as its own value and editable in place.
 *
 * `read` returns the value the model currently holds and `write` commits a new
 * one — the field keeps no copy of either, for the same reason the console
 * keeps none: two surfaces holding one number is how they come to disagree.
 * `show()` re-letters from `read()` and is what the owner calls on every synced
 * frame.
 */
export function quantityField({ control, name, read, write, className = null }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = className ? `num-field ${className}` : 'num-field';
  // `text` rather than `number`: a spinner is exactly the visible chrome this
  // field exists not to have, and the unit and the zero word are not numbers
  // anyway. `inputmode` still brings up the numeric keypad on a phone.
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.spellcheck = false;
  // "Height value" rather than "Height": the slider beside it is already
  // labelled with the quantity's own name, and two controls announcing
  // themselves identically is the thing a label exists to prevent. The number
  // itself is the field's value and is read out as one, so it is not said
  // twice here.
  input.setAttribute('aria-label', `${name} value`);

  // What the box said when it took focus. Null when it does not hold focus,
  // which is also the flag that says a redraw may write over it.
  let took = null;

  // An input is 20 characters wide by default whatever it holds, which would
  // push the study offer off the head of every strip. The lettering is
  // monospaced, so its own length is the width it wants.
  const fit = () => {
    const size = Math.max(1, input.value.length);
    if (input.size !== size) input.size = size;
  };

  const show = () => {
    // Never type over the reader: a station attach or a study tick can redraw
    // the desk while a field is being edited in it.
    if (took != null) return;
    input.value = control.format(read());
    fit();
  };

  input.addEventListener('focus', () => {
    // Editing shows the value itself, not its lettering: the unit is not part
    // of what you are changing, and 4.572 m reads as "4.57" on a face ruled to
    // two decimals — offered as that, a reader who touched the box and left it
    // alone would have silently trimmed 2 mm off the building.
    took = String(read());
    input.value = took;
    fit();
    // Selected whole, so "click the number, type 12, Enter" is the gesture it
    // looks like. The classic hazard here is the release of that same click
    // collapsing the selection to a caret, which would make 12 into 1512.24
    // and hand the reader the stop it clamps to — measured in Chromium and it
    // does not happen, at the press or the release, on a box whose lettering
    // carries a unit or one whose focus text is character-for-character what
    // was already showing. No mouseup guard is written for it, because a
    // workaround for a behaviour this desk cannot observe is a claim it cannot
    // check.
    input.select();
  });

  input.addEventListener('input', fit);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      // Put the edit down. Clearing `took` first is what makes the blur below
      // commit nothing, so the box can undo its own gesture.
      event.preventDefault();
      took = null;
      input.blur();
    }
  });

  input.addEventListener('blur', () => {
    const said = input.value;
    const asGiven = took;
    took = null;
    // A field that was focused and left alone commits nothing whatever — not
    // even the value it is already holding, which on a control whose default
    // sits between two stops would be a change.
    if (asGiven != null && said.trim() !== asGiven) {
      const v = control.parse(said);
      // Refused whole, the way a bad permalink is: the model's own value comes
      // back rather than whatever a half-read "12abc" might have meant.
      if (v != null) write(v);
    }
    show();
  });

  return { node: input, show };
}

/**
 * Bind a range input to a value, and hold it against a scroll that started on
 * it.
 *
 * A native range sets its value from the touch point on the press, before
 * anyone knows which way the finger is going, and on a phone the sheet and the
 * desk are one long scroller — so a thumb put down to scroll lands on a slider
 * constantly. Measured in Chromium at 390pt, a plain upward flick that happened
 * to start on the sheet's width slider gave the input:
 *
 *     pointerdown → input(22) → pointermove → pointercancel
 *     → thirteen more touchmoves, the page scrolling → change(22)
 *
 * The reader flicked past the sheet's five dimensions and rebuilt the
 * building: width 15.24 m → 22 m, committed, written into the address bar as
 * `#v1&width=22`, and solved. Nothing on the page said so, which makes it the
 * exact failure this codebase refuses everywhere else — a value substituted for
 * the one the reader chose, silently.
 *
 * **`pointercancel` alone does not mean "that was a scroll", and reading it
 * that way is worse than the bug.** A deliberate horizontal drag on the same
 * slider gives:
 *
 *     pointerdown → input → input → pointercancel → input ×12 → change
 *
 * Blink cancels the pointer stream when the slider's own touch handling takes
 * the gesture over, so the cancel arrives two frames into a drag that is going
 * perfectly well. A first attempt that reverted on the cancel therefore put the
 * model back to 15.24 while the thumb went on to 37.52 and the release was
 * swallowed — the drawing and the control disagreeing, which is the one thing
 * this desk is built never to do.
 *
 * What separates the two is not the cancel but **whether the value ever moved
 * under the finger**. A scroll gets exactly one `input`, the press's own jump,
 * and never another; a drag gets one per frame. So the jump is *held* rather
 * than committed — the model is not touched until a second `input` says the
 * reader is driving this, or the release says it was a tap. On a scroll the
 * held value is dropped at the cancel, the thumb is re-lettered where the model
 * still stands, and nothing was ever applied. There is no revert because
 * nothing was committed, and no flicker because nothing was drawn.
 *
 * Only a finger waits: a mouse commits on the press exactly as it always did,
 * and never cancels anyway. Where the browser cancels a drag it has no business
 * cancelling, the next `input` takes the gesture back.
 *
 * `read` returns what the model holds and `write(value, done)` commits. The two
 * hooks are deliberately not one, because they answer questions at opposite
 * ends of a gesture that may turn out not to be one:
 *
 * - `took` fires as the control takes hold, which is what a ghost of where the
 *   tick stood has to be recorded from — it is wanted *during* the drag.
 * - `kept` fires once, on the release of a gesture the control still owns. The
 *   general notes' drag marker is filed from here, because the marker says the
 *   reader took hold of something and a flick past a slider is not that.
 */
export function sliderGesture(input, { read, write, took = null, kept = null }) {
  // The press's own jump: set from the first `input` of a touch gesture and
  // held there — uncommitted — until the gesture says which kind it is. Null
  // whenever there is nothing waiting, which is the whole of the state.
  let held = null;
  // Whether the press was a finger's. A mouse does not wait, both because it
  // has no scroll to be confused with and because its click-to-position is a
  // gesture people time.
  let waiting = false;
  // The browser has taken the gesture. Only ever set where nothing had been
  // committed, and cleared by the next `input`, which is the reader saying
  // otherwise.
  let abandoned = false;

  input.addEventListener('pointerdown', (event) => {
    waiting = event.pointerType !== 'mouse';
    held = null;
    abandoned = false;
  });

  input.addEventListener('pointercancel', () => {
    // Two frames into a real drag this fires and means nothing: by then the
    // value has moved under the finger, `held` has been flushed, and the
    // gesture goes on. It is only news when the press's jump is still the only
    // thing that has happened.
    if (held === null) return;
    held = null;
    waiting = false;
    abandoned = true;
    // Nothing was applied, so there is nothing to put back — only the thumb,
    // which the user agent moved on its own.
    input.value = String(read());
  });

  input.addEventListener('input', () => {
    const v = Number(input.value);
    // An `input` after a cancel is the reader driving this after all.
    abandoned = false;
    if (waiting && held === null) {
      held = v;
      return;
    }
    held = null;
    took?.();
    write(v);
  });

  input.addEventListener('change', () => {
    waiting = false;
    if (abandoned) {
      abandoned = false;
      input.value = String(read());
      return;
    }
    // A tap on the track is a whole gesture in one event, and this is where it
    // lands: `held` is the value the press planted and nothing since has
    // contradicted it.
    const v = held === null ? Number(input.value) : held;
    if (held !== null) took?.();
    held = null;
    kept?.();
    write(v, true);
  });
}
