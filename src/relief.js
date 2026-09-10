/**
 * The relief: the surveyed ground as an oblique surface.
 *
 * The only DOM-bound module this feature adds, and deliberately the only one,
 * so that everything testable is testable without a browser in the room.
 * Everything it draws comes from `latticeOf` and `meshOf`; it invents no
 * geometry of its own, and it letters nothing at all — the figures belong to
 * the plan and to the readout under it, which read spot heights.
 *
 * **WebGL2 as a platform API, not a package.** Principle V restricts runtime
 * dependencies to `@idfkit/*` and explicitly prefers platform APIs to
 * packages, naming `DecompressionStream`, `URLSearchParams` and inline SVG as
 * the pattern this codebase already follows. gl-matrix, three.js, regl and
 * deck.gl are all packages and all would need a constitutional amendment; none
 * is needed, because a constrained orbit over a height field wants no scene
 * graph, no loader, no material system and no physics. What it wants is a 4x4
 * matrix pair and two shaders, which are written here.
 *
 * **Orthographic, and no vertical exaggeration.** A parallel projection is
 * what makes two viewpoints comparable, which is the same reason E-01's
 * axonometric is a fixed parallel projection rather than a perspective one. A
 * vertical exaggeration control would let the reader dial the drama of a
 * result up and down, which is the one thing a sheet whose whole claim is that
 * its figures mean something must not offer; the vertical scale is fixed, and
 * it is stated (FR-018g).
 *
 * **One hue, ink levels only.** The reading is not a signed physical quantity
 * — a demand intensity has a magnitude and no direction — so `--cold` and
 * `--warm` are not used here. They are reserved for signed quantities, and
 * spending them on a magnitude would leave the page with no encoding for
 * direction at all. That is why the survey is grey.
 *
 * **And it carries no gesture at all.** The contract sketched an `onPick` here,
 * mirrored by an equivalent route on the plan. It is not implemented and the
 * parameter is gone rather than left accepted and ignored, because the plan is
 * already the authoritative surface (FR-018a): it carries every figure, a
 * coarse-pointer target on every spot height, and a roving keyboard cursor
 * across the whole lattice. A pick here would have to be un-projected from a
 * click through the camera, would be pointer-only unless mirrored, and would
 * add a second way to reach designs the plan already reaches better. What the
 * relief carries is the shape and the posts.
 */

/* ══ the 4x4 pair ════════════════════════════════════════════════════════ */

/**
 * Column-major, because that is what `uniformMatrix4fv` wants and converting
 * at the call site is how a transpose gets lost.
 */
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** An orthographic box. No perspective: this is a survey drawing. */
function orthographic({ left, right, bottom, top, near, far }) {
  const out = new Float32Array(16);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function lookAt(eye, centre, up) {
  const f = normalize(subtract(centre, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  const out = new Float32Array(16);
  out[0] = s[0]; out[4] = s[1]; out[8] = s[2];
  out[1] = u[0]; out[5] = u[1]; out[9] = u[2];
  out[2] = -f[0]; out[6] = -f[1]; out[10] = -f[2];
  out[12] = -dot(s, eye);
  out[13] = -dot(u, eye);
  out[14] = dot(f, eye);
  out[15] = 1;
  return out;
}

/* ══ the camera ══════════════════════════════════════════════════════════ */

/**
 * A constrained orbit, and every constraint is a decision (FR-018d).
 *
 * Azimuth steps in fixed increments and wraps; elevation is clamped to a band
 * where the surface still reads as a surface. **No pan, no zoom, no free
 * flight.** A survey drawing is looked at from a small number of stated
 * viewpoints, and the reason is not tidiness: a reader who can fly anywhere
 * can put the camera where a hollow looks like a ridge, and then argue from
 * the picture. The named viewpoints are the ones a survey has words for.
 */
const AZIMUTH_STEP = 30;
const ELEVATION_MIN = 15;
const ELEVATION_MAX = 75;

const VIEWPOINTS = Object.freeze([
  { id: 'oblique', label: 'Oblique', azimuth: 315, elevation: 35 },
  { id: 'stance', label: 'From the stance', azimuth: 225, elevation: 25 },
  { id: 'fall', label: 'Along the fall line', azimuth: 45, elevation: 25 },
  { id: 'plan', label: 'Plan down', azimuth: 270, elevation: 89 },
]);

/**
 * How far the pin stands proud of the ground, in the same normalised units the
 * terrain is drawn in — about a fifth of the measured range, which is enough
 * to clear the local relief at every viewpoint the orbit allows without
 * becoming the tallest thing in the drawing.
 */
const PIN_HEIGHT = 0.2;

const clampElevation = (value) => Math.min(ELEVATION_MAX, Math.max(ELEVATION_MIN, value));
const wrapAzimuth = (value) => ((value % 360) + 360) % 360;

/* ══ the shaders ═════════════════════════════════════════════════════════ */

/**
 * Height in, ink level out.
 *
 * `aMeasured` rides through to the fragment stage untouched so a post can be
 * stood on every vertex that is a real sample (FR-018j) — on a smooth surface
 * that is the only thing keeping a measured point individually identifiable at
 * any viewpoint, and it is the counterpart of the plan's ticks.
 */
const VERTEX = `#version 300 es
precision highp float;
in vec3 aPosition;
in float aMeasured;
uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uScale;
uniform float uPointSize;
out float vHeight;
out float vMeasured;
void main() {
  vec3 p = vec3(
    (aPosition.x / uScale.x) - 0.5,
    (aPosition.y / uScale.y) - 0.5,
    aPosition.z * uScale.z
  );
  vHeight = aPosition.z;
  vMeasured = aMeasured;
  gl_Position = uProjection * uView * vec4(p.x, p.z, -p.y, 1.0);
  gl_PointSize = uPointSize;
}`;

/**
 * One hue, four ink levels, no shadows and no specular.
 *
 * The surface is shaded by height alone, mixed between the two ink levels the
 * page already uses, so the relief reads as graphite on paper rather than as a
 * heat map. A heat map would be spending colour on a magnitude, which is the
 * one thing this palette's colour is not for.
 */
const FRAGMENT = `#version 300 es
precision highp float;
in float vHeight;
in float vMeasured;
uniform vec4 uLow;
uniform vec4 uHigh;
uniform vec4 uFlat;
uniform vec4 uAccent;
uniform vec4 uRule;
// 0 surface · 1 cut face · 2 base · 3 post · 4 furniture · 5 pin · 6 strata
// · 7 the pin's head between two measured designs
uniform int uMode;
out vec4 outColor;
void main() {
  if (uMode == 7) {
    // The armed square hollow, as the plan draws the stance between two
    // measured designs: the desk is here, and this survey has not run it.
    vec2 c = abs(gl_PointCoord - 0.5);
    if (max(c.x, c.y) < 0.3) discard;
    outColor = uAccent;
    return;
  }
  if (uMode == 5) {
    // The one accent on this drawing, and it says the same thing here as it
    // says on the plan, the patch button and the rail: the desk is here.
    outColor = uAccent;
    return;
  }
  if (uMode == 3) {
    outColor = uHigh;
    return;
  }
  if (uMode == 4) {
    // The block's own arrises and its axis rules: furniture, drawn in the ink
    // this page letters labels in.
    outColor = uRule;
    return;
  }
  if (uMode == 6) {
    // The levels ruled around the cut. Quieter than the arrises, because there
    // are eight of them to four and they are a scale rather than a shape.
    outColor = uLow;
    return;
  }
  if (uMode == 1) {
    // A cut face is not a reading. It is toned flat, with the faintest lean
    // down its own depth so the block has a body rather than reading as a
    // silhouette — never by the height of the ground above it, which would be
    // the block pretending to know something about what is under the terrain.
    float d = clamp(vHeight, -1.0, 1.0);
    outColor = mix(uFlat, uLow, clamp(0.5 + d * 0.25, 0.0, 1.0));
    return;
  }
  if (uMode == 2) {
    outColor = uFlat;
    return;
  }
  float t = clamp(vHeight, 0.0, 1.0);
  outColor = mix(uLow, uHigh, t);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`the relief's shader would not compile: ${log}`);
  }
  return shader;
}

/** A CSS custom property as a premultiplied RGBA quad the GPU can take. */
function inkOf(host, name, fallback) {
  const raw = getComputedStyle(host).getPropertyValue(name).trim() || fallback;
  const probe = document.createElement('span');
  probe.style.color = raw;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const parts = resolved.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [
    (parts[0] ?? 0) / 255,
    (parts[1] ?? 0) / 255,
    (parts[2] ?? 0) / 255,
    parts[3] ?? 1,
  ];
}

/* ══ the module ══════════════════════════════════════════════════════════ */

/**
 * Returns `null` where no WebGL2 context can be had.
 *
 * Null rather than a still image, an empty frame or a 2D fallback, by
 * Principle IV: the caller then states the loss in place with its reason and
 * carries every reading on the plan and the schedule, which it can, because
 * the plan carries every reading on its own by design (FR-018a). A substituted
 * picture would be a drawing claiming to be of this ground while being of
 * nothing.
 */
export function createRelief(host, { onLost = null } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!gl) return null;

  host.textContent = '';
  host.append(canvas);
  // Real text over the drawing, because WebGL has no glyphs and this page is
  // not going to grow an atlas for four labels. Positioned from the same
  // matrices the GPU is handed, so the words cannot drift off the corners they
  // name — and being text, it is selectable, it scales with the reader's own
  // type size, and it is read aloud.
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'relief-lettering');
  overlay.setAttribute('aria-hidden', 'true');
  host.append(overlay);

  const program = gl.createProgram();
  try {
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`the relief's program would not link: ${gl.getProgramInfoLog(program)}`);
    }
  } catch (failure) {
    // A context that exists but cannot compile is the same refusal as no
    // context at all, and it says so rather than drawing an empty frame.
    host.textContent = '';
    onLost?.(failure.message);
    return null;
  }

  const position = gl.createBuffer();
  const measured = gl.createBuffer();
  const elements = gl.createBuffer();
  // The block the ground stands in, and the furniture drawn on its base: the
  // axis rules with their tick marks, and the pin that says where the desk is.
  const blockPosition = gl.createBuffer();
  const blockElements = gl.createBuffer();
  const rulePosition = gl.createBuffer();
  const strataPosition = gl.createBuffer();
  const arrisPosition = gl.createBuffer();
  const pinPosition = gl.createBuffer();
  // Looked up once: the program never relinks, and each lookup is a round trip
  // to the driver that `paint` used to make three to five times a frame.
  const attribute = {
    position: gl.getAttribLocation(program, 'aPosition'),
    measured: gl.getAttribLocation(program, 'aMeasured'),
  };
  const uniform = {
    projection: gl.getUniformLocation(program, 'uProjection'),
    view: gl.getUniformLocation(program, 'uView'),
    scale: gl.getUniformLocation(program, 'uScale'),
    low: gl.getUniformLocation(program, 'uLow'),
    high: gl.getUniformLocation(program, 'uHigh'),
    flat: gl.getUniformLocation(program, 'uFlat'),
    accent: gl.getUniformLocation(program, 'uAccent'),
    rule: gl.getUniformLocation(program, 'uRule'),
    mode: gl.getUniformLocation(program, 'uMode'),
    pointSize: gl.getUniformLocation(program, 'uPointSize'),
  };

  let view = { ...VIEWPOINTS[0] };
  let held = null; // the last mesh and lattice, so a camera move needs no rebuild
  let lost = false;

  // The five inks, resolved once and again only when the theme changes.
  // `inkOf` reads computed style straight after touching the DOM, which forces
  // a style recalculation of the whole page, and `paint` runs on every landed
  // sample and every camera step: five of those a frame cost more than the
  // drawing did. The theme is the only thing that moves them — the explicit
  // toggle stamps `data-theme`, the system setting answers
  // `prefers-color-scheme` — so those two are what clear the cache.
  let resolved = null;
  const inks = () =>
    (resolved ??= {
      low: inkOf(host, '--ink-ghost', '#b9b3a6'),
      high: inkOf(host, '--ink', '#23262b'),
      // The cut faces and the base take the trough's own tone, which is what
      // every inset on this page is drawn in. It reads as the block the ground
      // sits in rather than as more ground.
      flat: inkOf(host, '--inset', '#efebe2'),
      accent: inkOf(host, '--redline', '#a6392b'),
      rule: inkOf(host, '--ink-3', '#6f7480'),
    });
  const retheme = () => {
    resolved = null;
    paint();
  };
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  scheme?.addEventListener('change', retheme);
  const stamp = new MutationObserver(retheme);
  stamp.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // `webglcontextlost` must be handled and must not be silently recovered
  // from: a relief that quietly re-created itself would be a drawing that had
  // stopped being of the ground and said nothing. The caller states the loss
  // in place and keeps every reading (FR-024).
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    onLost?.('The browser took back the drawing context for this relief.');
  });

  /**
   * World space, matching the vertex shader exactly.
   *
   * The shader maps lattice space to a unit box and swaps two axes on the way
   * — height becomes world Y, and the lattice's Y becomes negative Z — so the
   * drawing reads as a plan lifted into relief rather than a chart tipped on
   * its side. Anything drawn *outside* the shader (the axis labels, which are
   * SVG because WebGL has no text) has to make the same journey, so the
   * mapping lives here once and both sides call it.
   */
  function toWorld([lx, ly, lz], scale) {
    return [lx / scale[0] - 0.5, lz * scale[2], -(ly / scale[1] - 0.5)];
  }

  /** A world point to a point on the canvas, for the labels the GPU cannot set. */
  function project(world, projection, view, width, height) {
    const clip = [0, 0, 0, 0];
    for (let r = 0; r < 4; r += 1) {
      let v = 0;
      for (let c = 0; c < 3; c += 1) v += view[c * 4 + r] * world[c];
      clip[r] = v + view[12 + r];
    }
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r += 1) {
      let v = 0;
      for (let c = 0; c < 4; c += 1) v += projection[c * 4 + r] * clip[c];
      out[r] = v;
    }
    const w = out[3] || 1;
    return [((out[0] / w) * 0.5 + 0.5) * width, (1 - (out[1] / w * 0.5 + 0.5)) * height];
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(host.clientWidth * ratio));
    const height = Math.max(1, Math.round(host.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    overlay.setAttribute('viewBox', `0 0 ${host.clientWidth} ${host.clientHeight}`);
  }

  /** Bind one buffer of `vec3` positions and draw it. */
  function drawArray(buffer, data, mode, count, uMode) {
    const positions = attribute.position;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positions);
    gl.vertexAttribPointer(positions, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1i(uniform.mode, uMode);
    gl.drawArrays(mode, 0, count);
  }

  function paint() {
    if (lost || !held) return;
    const { mesh, block } = held;
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);

    const azimuth = (view.azimuth * Math.PI) / 180;
    const elevation = (view.elevation * Math.PI) / 180;
    const radius = 3;
    const eye = [
      radius * Math.cos(elevation) * Math.cos(azimuth),
      radius * Math.sin(elevation),
      radius * Math.cos(elevation) * Math.sin(azimuth),
    ];
    // A fixed half-extent, so the drawing never crops and never breathes as
    // the camera steps round — the same reason E-01's axonometric fixes its
    // viewBox. It has to hold a unit footprint turned any way the orbit
    // allows, the body hanging under the terrain, the pin standing over it,
    // and the axis lettering outside the base's own corners.
    const half = 1.05;
    const projection = orthographic({
      left: -half, right: half, bottom: -half, top: half, near: -10, far: 10,
    });
    const viewMatrix = lookAt(eye, [0, 0.05, 0], [0, 1, 0]);
    gl.uniformMatrix4fv(uniform.projection, false, projection);
    gl.uniformMatrix4fv(uniform.view, false, viewMatrix);
    const scale = [mesh.nx - 1 || 1, mesh.ny - 1 || 1, 0.45];
    gl.uniform3f(uniform.scale, scale[0], scale[1], scale[2]);
    const ink = inks();
    gl.uniform4fv(uniform.low, ink.low);
    gl.uniform4fv(uniform.high, ink.high);
    gl.uniform4fv(uniform.flat, ink.flat);
    gl.uniform4fv(uniform.accent, ink.accent);
    gl.uniform4fv(uniform.rule, ink.rule);
    gl.uniform1f(uniform.pointSize, 4);

    const positions = attribute.position;
    const flags = attribute.measured;

    /* ── the block, first, so the terrain sits on it ────────────────────── */
    if (block && block.indices.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, blockPosition);
      gl.enableVertexAttribArray(positions);
      gl.vertexAttribPointer(positions, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(flags);
      gl.vertexAttrib1f(flags, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, blockElements);
      // The cut faces and the underside are toned apart, because a section
      // through the block and the bottom of it are different surfaces.
      gl.uniform1i(uniform.mode, 1);
      gl.drawElements(gl.TRIANGLES, block.baseStart, gl.UNSIGNED_INT, 0);
      gl.uniform1i(uniform.mode, 2);
      gl.drawElements(
        gl.TRIANGLES,
        block.indices.length - block.baseStart,
        gl.UNSIGNED_INT,
        block.baseStart * 4,
      );
    }

    /* ── the measured surface ───────────────────────────────────────────── */
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.enableVertexAttribArray(positions);
    gl.vertexAttribPointer(positions, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, measured);
    gl.enableVertexAttribArray(flags);
    gl.vertexAttribPointer(flags, 1, gl.FLOAT, false, 0, 0);

    // One indexed draw call for the whole surface. The holes are in the index
    // buffer rather than in a style, so a gap cannot be drawn over.
    gl.uniform1i(uniform.mode, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.drawElements(gl.TRIANGLES, held.count, gl.UNSIGNED_INT, 0);

    // A post on every real sample, so a measured point stays individually
    // identifiable at any viewpoint on a surface that is otherwise smooth.
    gl.uniform1i(uniform.mode, 3);
    gl.drawArrays(gl.POINTS, 0, mesh.positions.length / 3);
    gl.disableVertexAttribArray(flags);
    gl.vertexAttrib1f(flags, 0);

    /* ── the cut, ruled ─────────────────────────────────────────────────── */
    //
    // Levels first, then arrises over them: the horizontals give the cut a
    // scale a reader can count bands up, and the verticals give it a shape.
    // Without the second, a block turned to an oblique reads as two flat
    // washes meeting at a seam that does not say which way the corner folds.
    if (held.strata?.length) {
      drawArray(strataPosition, held.strata, gl.LINES, held.strata.length / 3, 6);
    }
    if (held.arrises?.length) {
      drawArray(arrisPosition, held.arrises, gl.LINES, held.arrises.length / 3, 4);
    }

    /* ── the axis rules on the base, and their ticks ────────────────────── */
    const rules = axisRules(mesh, block);
    if (rules.length) drawArray(rulePosition, new Float32Array(rules), gl.LINES, rules.length / 3, 4);

    /* ── the pin ────────────────────────────────────────────────────────── */
    //
    // A vertical from the base to the terrain at the desk's own position, with
    // the armed square at its head — the fourth appearance of one idiom, so
    // "the desk is here" is learned once and read on every drawing that has
    // somewhere to put it.
    const pin = held.stance;
    if (pin) {
      // **Above** the terrain, not down through it. Run from the base to the
      // surface — which is what a pin through a solid ought to be — the shaft
      // is inside the block at every viewpoint and the depth test hides all of
      // it, so the mark reduces to a single dot on the terrain and the reader
      // is handed a pin with no pin in it. Standing proud of the ground it is
      // occluded by nothing, and it is the shape the word already means: a
      // survey pin driven in where you are standing.
      const stand = PIN_HEIGHT;
      const shaft = new Float32Array([pin.ix, pin.iy, pin.z, pin.ix, pin.iy, pin.z + stand]);
      drawArray(pinPosition, shaft, gl.LINES, 2, 5);
      // A hollow head is drawn larger, or its ring is a pixel wide and reads
      // as a smaller filled square.
      gl.uniform1f(uniform.pointSize, pin.measured ? 7 : 10);
      drawArray(pinPosition, new Float32Array([pin.ix, pin.iy, pin.z + stand]), gl.POINTS, 1, pin.measured ? 5 : 7);
      gl.uniform1f(uniform.pointSize, 4);
    }

    letterAxes(mesh, block, projection, viewMatrix, scale);
  }

  /**
   * The three bottom edges of the block, with a tick at every measured
   * position — the axis furniture, drawn on the base because that is the one
   * plane in the drawing that is flat, known and not carrying a reading.
   */
  function axisRules(mesh, block) {
    if (!block) return [];
    const z = -block.depth;
    const nx = mesh.nx - 1;
    const ny = mesh.ny - 1;
    const out = [];
    const line = (a, b) => out.push(a[0], a[1], z, b[0], b[1], z);
    line([0, 0], [nx, 0]);
    line([0, 0], [0, ny]);
    line([nx, 0], [nx, ny]);
    line([0, ny], [nx, ny]);
    // A tick per measured position, outward from the frame, so the reader can
    // count columns against the plan beside it.
    const tick = Math.max(nx, ny) * 0.022;
    for (let ix = 0; ix <= nx; ix += 1) out.push(ix, 0, z, ix, -tick, z);
    for (let iy = 0; iy <= ny; iy += 1) out.push(0, iy, z, -tick, iy, z);
    return out;
  }

  /**
   * The lettering, in SVG over the canvas.
   *
   * WebGL has no text and this page is not going to grow a glyph atlas for
   * four labels. The overlay is positioned from the same matrices the GPU is
   * handed, through `project`, so the words cannot drift off the corners they
   * name — and it is real text, so it is selectable, scales with the reader's
   * own type size, and is read aloud.
   */
  function letterAxes(mesh, block, projection, viewMatrix, scale) {
    overlay.textContent = '';
    if (!block || !held.axes) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    const z = -block.depth;
    const nx = mesh.nx - 1;
    const ny = mesh.ny - 1;
    const place = (lattice) => project(toWorld(lattice, scale), projection, viewMatrix, w, h);

    // Where every figure already stands, so the height scale's own figures
    // can give way to the base's. The scale stands off the corner the two
    // base axes meet at from some viewpoints, and measured on the oblique its
    // lowest figure printed straight over the glazing axis's far stop.
    const taken = [];
    const label = (at, text, cls, anchor = 'middle') => {
      taken.push(at);
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      node.setAttribute('x', at[0]);
      node.setAttribute('y', at[1]);
      node.setAttribute('class', cls);
      node.setAttribute('text-anchor', anchor);
      node.textContent = text;
      overlay.append(node);
      return node;
    };
    const stroke = (x1, y1, x2, y2) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1, y1, x2, y2 }).forEach(([name, value]) => node.setAttribute(name, value));
      overlay.append(node);
    };

    const { x, y } = held.axes;
    // Pushed clear of the block in **screen** space, not only in lattice
    // space. Which way is "outside" depends on where the camera is standing —
    // an offset that clears the silhouette from one viewpoint lies across it
    // from the next, and the orbit has twelve. So each label is projected
    // where it belongs on the base, then shoved directly away from the
    // drawing's own centre, which is outward from every angle.
    const middle = place([nx / 2, ny / 2, z]);
    const clear = (lattice, by = 20) => {
      const at = place(lattice);
      const dx = at[0] - middle[0];
      const dy = at[1] - middle[1];
      const len = Math.hypot(dx, dy) || 1;
      return [at[0] + (dx / len) * by, at[1] + (dy / len) * by];
    };

    // The stops at the ends of each bottom edge, and the axis name at its
    // middle — the same three things the plan letters, in the same words.
    //
    // Both axes start at the same corner of the base, so their two opening
    // stops would land on each other lettered at it. Each is anchored a little
    // way out along **its own** edge's outward side instead, which separates
    // them before the radial push and keeps each stop beside the edge it
    // belongs to rather than beside the corner they share.
    label(clear([0, -ny * 0.1, z]), x.from, 'relief-stop');
    label(clear([nx, -ny * 0.1, z]), x.to, 'relief-stop');
    label(clear([nx / 2, -ny * 0.1, z], 26), x.label, 'relief-axis');
    label(clear([-nx * 0.1, 0, z]), y.from, 'relief-stop');
    label(clear([-nx * 0.1, ny, z]), y.to, 'relief-stop');
    label(clear([-nx * 0.1, ny / 2, z], 26), y.label, 'relief-axis');

    // The height, which had no scale at all. The levels ruled round the cut
    // were the only vertical measure and none of them said what it measured,
    // so the block stood a reading up with no word for the reading and no
    // figure at any level. The scale is drawn here, in the overlay, rather
    // than as a rule on the block: it stands *beside* the solid, and the
    // overlay is the one layer nothing in the drawing can occlude.
    //
    // It stands on the tallest corner of the block the reader can see: of
    // the corners the orbit does not put behind the solid, the one the
    // terrain rises highest at. That is the longest staff the block offers,
    // and a corner makes the scale an edge of the thing it measures rather
    // than a ruler held up beside it. It runs from the lowest reading
    // measured to the highest, the span the terrain's heights are normalised
    // over, ticked at the levels the cut is ruled at. Above a corner lower
    // than the highest reading it carries on as a bare staff, because a scale
    // that stopped at the corner would leave the top levels unread.
    const height = held.axes.z;
    // Each corner vertical with the reading the terrain stands at there. A
    // corner with no measurement has no ground to stand a staff on.
    const corners = [[0, 0], [nx, 0], [0, ny], [nx, ny]].map(([cx, cy]) => {
      const at = cx + cy * mesh.nx;
      const value = mesh.measuredFlags[at] ? mesh.positions[at * 3 + 2] : null;
      return { cx, cy, value, base: place([cx, cy, 0]) };
    });
    // Seen from above in parallel projection, the further a point on one
    // level the higher it lands on screen, so the corner out of sight is
    // simply the highest — and both of them where the orbit looks square at a
    // face and two corners stand behind it.
    const back = Math.min(...corners.map((corner) => corner.base[1]));
    const staff = corners
      .filter((corner) => corner.base[1] > back + 0.5 && corner.value !== null)
      .reduce((best, corner) => (!best || corner.value > best.value ? corner : best), null);
    if (height && held.extent && staff) {
      const { lo, hi } = held.extent;
      const span = hi > lo ? hi - lo : 1;
      const up = (value) => (value - lo) / span;
      const { cx, cy } = staff;
      const foot = place([cx, cy, 0]);
      const top = place([cx, cy, 1]);
      // Straight down the staff foreshortens to nothing, and a scale with no
      // length measures nothing, so plan down draws none.
      if (foot[1] - top[1] >= 24) {
        // Figures on the side of the corner facing away from the drawing's
        // centre, so they stand off the block rather than across its faces.
        const side = foot[0] < middle[0] ? -1 : 1;
        const anchor = side < 0 ? 'end' : 'start';
        const sx = foot[0];
        stroke(sx, foot[1], sx, top[1]);
        // Both ends capped, so it reads as a measured span, lowest to
        // highest, rather than as a line that happens to stop.
        stroke(sx - 3, foot[1], sx + 3, foot[1]);
        stroke(sx - 3, top[1], sx + 3, top[1]);
        // A tick at every level, and a figure only where it clears both the
        // figure below it and every stop already lettered on the base — the
        // plan's own rule for its contour figures, which give way to the
        // spot heights. The tick stands regardless, so a level whose figure
        // gave way is still counted.
        const room = (at) =>
          taken.every((prior) => Math.abs(prior[1] - at[1]) > 10 || Math.abs(prior[0] - at[0]) > 36);
        //
        // One tick per contour on Fig. 2: the ticks are the plan's own
        // `levels`, so the two drawings count the same interval, and each
        // meets the level ruled round the cut at the corner it stands on.
        // Every fifth is longer, the way the plan draws every fifth contour
        // heavier, so the staff can be counted in fives without a figure. At
        // three pixels the ticks were there and could not be seen, and the
        // staff read as though it counted every other contour — only the
        // figures that had cleared were visible.
        const interval = height.ticks.length > 1 ? height.ticks[1].value - height.ticks[0].value : 1;
        for (const tick of height.ticks) {
          const at = up(tick.value);
          if (at <= 0 || at >= 1) continue;
          const ty = place([cx, cy, at])[1];
          const major = Math.round(tick.value / interval) % 5 === 0;
          stroke(sx, ty, sx + side * (major ? 8 : 5), ty);
          const figure = [sx + side * 11, ty + 3];
          if (room(figure)) label(figure, tick.text, 'relief-stop', anchor);
        }
        const name = label([sx + side * 6, top[1] - 9], height.label, 'relief-axis', anchor);
        // The unit in its own run, because the name is set in capitals and
        // kWh/m² in capitals is a different unit.
        if (height.unit) {
          const unit = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          unit.setAttribute('class', 'relief-unit');
          unit.textContent = ` ${height.unit}`;
          name.append(unit);
        }
      }
    }
  }

  return {
    get view() {
      return { ...view };
    },

    get lost() {
      return lost;
    },

    /**
     * Snaps. It does not animate, so a reader who has asked for reduced
     * motion loses no viewpoint (FR-018f) — the alternative, disabling the
     * transition under `prefers-reduced-motion`, is the same thing with a
     * frame of flight left in it for everybody else.
     */
    setView(next) {
      view = {
        ...view,
        ...next,
        azimuth: wrapAzimuth(next.azimuth ?? view.azimuth),
        elevation: clampElevation(next.elevation ?? view.elevation),
      };
      paint();
    },

    /** One step round, or one step up. The keyboard's route to the camera. */
    step({ azimuth = 0, elevation = 0 }) {
      this.setView({
        azimuth: view.azimuth + azimuth * AZIMUTH_STEP,
        elevation: view.elevation + elevation * (AZIMUTH_STEP / 2),
      });
    },

    /**
     * Hand it a mesh and a lattice and it draws them, at full resolution
     * whatever the viewport (FR-018k). A phone draws what a desk draws: a
     * reader is never handed a surface that appears to know less than
     * somebody else's.
     */
    draw({ mesh, extent, block = null, stance = null, axes = null, strata = null, arrises = null }) {
      if (lost) return;
      // Heights normalised into 0..1 against the measured extent, so the
      // surface fills its own box whatever the reading's units are — and the
      // vertical scale is therefore stated by the caption rather than felt.
      const span = extent && extent.hi > extent.lo ? extent.hi - extent.lo : 1;
      const normalise = (v) => (extent ? (v - extent.lo) / span : 0);

      held = { mesh, extent, block, axes, count: mesh.indices.length, stance: null };
      // The ruling arrives in the reading's own units and in lattice space; it
      // is normalised here with everything else, so one rule governs how a
      // height becomes a position in the box.
      const lifted = (flat) => {
        const out = new Float32Array(flat);
        for (let i = 2; i < out.length; i += 3) out[i] = normalise(out[i]);
        return out;
      };
      held.strata = strata?.length ? lifted(strata) : null;
      held.arrises = arrises?.length ? lifted(arrises) : null;
      if (stance) {
        // Filled or hollow is the pin's whole claim, so it is asked for rather
        // than defaulted: a caller that forgot would draw "on a run" by default.
        if (typeof stance.measured !== 'boolean') {
          throw new Error('the relief pin needs to be told whether it stands on a measured design');
        }
        held.stance = {
          ix: stance.ix,
          iy: stance.iy,
          z: normalise(stance.value),
          measured: stance.measured,
        };
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, lifted(mesh.positions), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, measured);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(mesh.measuredFlags), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

      if (block) {
        // Every height the block carries is a reading, base included, so the
        // whole array normalises in one pass with nothing to exempt.
        gl.bindBuffer(gl.ARRAY_BUFFER, blockPosition);
        gl.bufferData(gl.ARRAY_BUFFER, lifted(block.positions), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, blockElements);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, block.indices, gl.STATIC_DRAW);
      }
      paint();
    },

    repaint: paint,

    dispose() {
      held = null;
      scheme?.removeEventListener('change', retheme);
      stamp.disconnect();
      host.textContent = '';
    },

    /** Where a click on the canvas lands, for the caller to hit-test. */
    canvas,

    // Held so the caller can offer the same picks the keyboard reaches.
    viewpoints: VIEWPOINTS,
  };
}
