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
