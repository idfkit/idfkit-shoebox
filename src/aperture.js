/**
 * How big a wall's opening is, asked once for two modules.
 *
 * `controls.js` has to know whether a wall can carry the opening its ratio asks
 * for, so the plan key can grey that wall and say why; `model.js` has to cut the
 * same opening into the document. The console may not import the model, so the
 * arithmetic lives here, DOM-free and free of the document, and both ask it. Two
 * copies would be two answers the day one of them changed.
 *
 * **The ratio is the rough opening: glass and frame together.** It used to be
 * the glass alone, with the frame laid round it afterwards, and that cost two
 * things. The first was a fatal. EnergyPlus tests a framed window by area and
 * by nothing else — the base surface less its glass, against the frame ring
 * `(w + 2f)(h + 2f) − wh` — so a ratio near its 0.9 stop under a frame near its
 * 0.2 stop handed the engine a window bigger than its wall:
 *
 *     ** Severe ** ProcessSurfaceVertices: Base Surface="ZN001:WALL001",
 *     **   ~~~  ** Window Surface="ZN001:WALL001:WIN001" area (with frame) is
 *                  too large to fit on the surface.
 *     **   ~~~  ** Base surface area (-windows and doors)=[11.48] m2,
 *                  frame area=[11.69] m2.
 *     ** Fatal ** Errors found in Building Input, Program Stopped
 *
 * The sill has no part in that test — a frame standing 0.15 m clear of the head
 * of its wall runs clean, measured — so no placement of the light could have
 * rescued it. The second cost is the one that settles which way to fix it: the
 * face's own `Code limit` mark cites ASHRAE 90.1 §5.5.4.2, and 90.1 measures
 * fenestration area over the rough opening, glazing, sash and frame together.
 * With the frame outside the ratio a desk at 0.40 was 0.40 of glass plus a
 * frame, drawn against a limit that counts the frame. Inside it, the ratio is
 * the one the landmark means, and at any ratio short of 1 the frame and glass
 * together leave wall standing, so the fatal cannot be reached at all.
 *
 * Unframed, nothing moves: the frame is zero, the glass is the rough opening,
 * and the document is byte-identical to the one the glass-only rule wrote.
 */

/** A reveal, so an opening never runs into the corner of its own wall. */
export const MARGIN = 0.05;

/**
 * The distance under which EnergyPlus reads two vertices as one.
 *
 * It merges them, a quadrilateral with a short edge becomes a two-sided
 * polygon, and the surface is deleted with a severe and nothing else:
 *
 *     ** Severe ** GetSurfaceData: There are 2 degenerate surfaces; Degenerate
 *                  surfaces are those with number of sides < 3.
 *
 * The run completes, so the only symptom is a shade or a light in the document
 * that the engine never simulated. A 1 cm fin does it on a building turned 45°
 * and not on one squared to the compass, because an edge of exactly 0.01 m
 * survives and a rotation hands back 0.00999…; a 1 cm curb does it on every
 * bearing, because its edge is the difference of two heights.
 */
export const COINCIDENT = 0.01;

/**
 * How far past `COINCIDENT` an edge has to be before it is safe to hand over.
 *
 * A micron: far below anything a slider on this desk can set, and far above
 * anything a rotation or a subtraction can take back.
 */
const SLACK = 1e-6;

/** Whether an edge this long survives as an edge once the engine reads it. */
export const builds = (edge) => edge > COINCIDENT + SLACK;

/**
 * Whether a shade of this depth is either absent or buildable.
 *
 * Zero is a real setting — no fin, no curb — and is not a refusal. What is
 * refused is the stop just above it, which would write a surface the engine
 * deletes.
 */
export const shadeBuilds = (depth) => !(depth > 0) || builds(depth);

/** A wall's length as the plan draws it: the south and north walls span the width. */
export function wallLength(params, face) {
  if (face === 'south' || face === 'north') return params.width;
  if (face === 'east' || face === 'west') return params.depth;
  throw new Error(`no wall faces ${face}`);
}

/**
 * One wall's opening: the rough opening the ratio asks for and the glass left
 * inside its frame.
 */
export class Aperture {
  constructor({ width, height, frame }) {
    this.width = width;
    this.height = height;
    this.frame = frame;
    this.glassWidth = width - 2 * frame;
    this.glassHeight = height - 2 * frame;
    Object.freeze(this);
  }

  /**
   * Whether any glass is left for the engine to build.
   *
   * A small ratio under a wide frame is an opening the frame closes: at 0.10 a
   * ribbon on a 3 m wall is a 0.30 m band, and 0.2 m of frame top and bottom
   * leaves nothing. The glass-only rule never met this, because it laid the
   * frame outside the band and reported a ratio of 0.10 for what was really
   * 0.23. Now it is a refusal, stated on the wall.
   */
  get glazes() {
    return builds(this.glassWidth) && builds(this.glassHeight);
  }
}

/**
 * The opening a ratio asks for on a wall of this length.
 *
 * All three aperture types spend the same area; they differ only in how they
 * spend it. Punched scales both dimensions by √r, which keeps the light in
 * proportion with its wall and guarantees a reveal on all four sides at any
 * ratio. Ribbon fixes the width and lets the height fall out of the area. Full
 * height does the reverse. The clamps are against the reveal, and bind the
 * rough opening, so a frame never stands past the edge of its own wall either.
 */
export function sizeOpening({ ratio, length, height, aperture, frame }) {
  if (!(ratio > 0)) return null;
  const maxW = Math.max(0.1, length - 2 * MARGIN);
  const maxH = Math.max(0.1, height - 2 * MARGIN);
  const area = ratio * length * height;

  let w;
  let h;
  if (aperture === 'Ribbon') {
    w = maxW;
    h = Math.min(area / w, maxH);
  } else if (aperture === 'Full') {
    h = maxH;
    w = Math.min(area / h, maxW);
  } else {
    const s = Math.sqrt(ratio);
    w = Math.min(length * s, maxW);
    h = Math.min(height * s, maxH);
  }
  return new Aperture({ width: w, height: h, frame });
}

/** The same question asked of the desk rather than of a drawn wall. */
export const openingFor = (params, face, ratio) =>
  sizeOpening({
    ratio,
    length: wallLength(params, face),
    height: params.height,
    aperture: params.aperture,
    frame: params.frameWidth,
  });
