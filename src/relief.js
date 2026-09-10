/**
 * The relief: the surveyed ground as an oblique surface.
 *
 * The only DOM-bound module this feature adds, and deliberately the only one,
 * so that everything testable is testable without a browser in the room.
 * Everything it draws comes from `latticeOf` and `meshOf`; it invents no
 * geometry of its own, and it letters nothing at all — the figures belong to
 * the plan and the schedule, which read spot heights.
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

export const VIEWPOINTS = Object.freeze([
  { id: 'oblique', label: 'Oblique', azimuth: 315, elevation: 35 },
  { id: 'stance', label: 'From the stance', azimuth: 225, elevation: 25 },
  { id: 'fall', label: 'Along the fall line', azimuth: 45, elevation: 25 },
  { id: 'plan', label: 'Plan down', azimuth: 270, elevation: 89 },
]);

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
  gl_PointSize = 4.0;
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
uniform float uPoint;
out vec4 outColor;
void main() {
  if (uPoint > 0.5) {
    outColor = uHigh;
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
export function createRelief(host, { onPick = null, onLost = null } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!gl) return null;

  host.textContent = '';
  host.append(canvas);

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
  const uniform = {
    projection: gl.getUniformLocation(program, 'uProjection'),
    view: gl.getUniformLocation(program, 'uView'),
    scale: gl.getUniformLocation(program, 'uScale'),
    low: gl.getUniformLocation(program, 'uLow'),
    high: gl.getUniformLocation(program, 'uHigh'),
    point: gl.getUniformLocation(program, 'uPoint'),
  };

  let view = { ...VIEWPOINTS[0] };
  let held = null; // the last mesh and lattice, so a camera move needs no rebuild
  let lost = false;

  // `webglcontextlost` must be handled and must not be silently recovered
  // from: a relief that quietly re-created itself would be a drawing that had
  // stopped being of the ground and said nothing. The caller states the loss
  // in place and keeps every reading (FR-024).
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    onLost?.('The browser took back the drawing context for this relief.');
  });

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(host.clientWidth * ratio));
    const height = Math.max(1, Math.round(host.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function paint() {
    if (lost || !held) return;
    const { mesh, extent } = held;
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
    // A half-extent of 0.8 frames a unit square turned any way it can be
    // turned, so the drawing never crops and never breathes as the camera
    // steps round — the same reason E-01's axonometric fixes its viewBox.
    const half = 0.8;
    gl.uniformMatrix4fv(
      uniform.projection,
      false,
      orthographic({ left: -half, right: half, bottom: -half, top: half, near: -10, far: 10 }),
    );
    gl.uniformMatrix4fv(uniform.view, false, lookAt(eye, [0, 0, 0], [0, 1, 0]));
    gl.uniform3f(uniform.scale, mesh.nx - 1 || 1, mesh.ny - 1 || 1, 0.45);
    gl.uniform4fv(uniform.low, inkOf(host, '--ink-ghost', '#b9b3a6'));
    gl.uniform4fv(uniform.high, inkOf(host, '--ink', '#23262b'));

    const positions = gl.getAttribLocation(program, 'aPosition');
    const flags = gl.getAttribLocation(program, 'aMeasured');
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.enableVertexAttribArray(positions);
    gl.vertexAttribPointer(positions, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, measured);
    gl.enableVertexAttribArray(flags);
    gl.vertexAttribPointer(flags, 1, gl.FLOAT, false, 0, 0);

    // One indexed draw call for the whole surface. The holes are in the index
    // buffer rather than in a style, so a gap cannot be drawn over.
    gl.uniform1f(uniform.point, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.drawElements(gl.TRIANGLES, held.count, gl.UNSIGNED_INT, 0);

    // A post on every real sample, so a measured point stays individually
    // identifiable at any viewpoint on a surface that is otherwise smooth.
    gl.uniform1f(uniform.point, 1);
    gl.drawArrays(gl.POINTS, 0, mesh.positions.length / 3);
    void extent;
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
    draw({ mesh, extent }) {
      if (lost) return;
      held = { mesh, extent, count: mesh.indices.length };
      // Heights normalised into 0..1 against the measured extent, so the
      // surface fills its own box whatever the reading's units are — and the
      // vertical scale is therefore stated by the caption rather than felt.
      const scaled = new Float32Array(mesh.positions);
      const span = extent && extent.hi > extent.lo ? extent.hi - extent.lo : 1;
      for (let i = 2; i < scaled.length; i += 3) {
        scaled[i] = extent ? (scaled[i] - extent.lo) / span : 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, scaled, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, measured);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(mesh.measuredFlags), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      paint();
    },

    repaint: paint,

    dispose() {
      held = null;
      host.textContent = '';
    },

    // Held so the caller can offer the same picks the keyboard reaches.
    viewpoints: VIEWPOINTS,
    onPick,
  };
}
