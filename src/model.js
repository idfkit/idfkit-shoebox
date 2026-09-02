import { IDFDocument, parseIdf } from '@idfkit/core';
import {
  ADIABATIC,
  ADAPTIVE_RULES,
  AS_DRAWN,
  BOUNDARY_KEYS,
  NEEDS_SETPOINT,
  OPENABLE_KEYS,
  CHANNELS,
  controlFor,
  DAYS_IN_MONTH,
  DEFAULT_BYPASS,
  DEFAULT_PARAMETERS,
  monthSpans,
  parseHolidays,
  parsePattern,
} from './controls.js';
import { END_USES } from './bill.js';

/**
 * The stock `1ZoneUncontrolled.idf` example from the EnergyPlus 26.1.0 release,
 * authored through the object model rather than pasted in as text, and then
 * opened up to the console.
 *
 * Opened up, and stripped of its demonstration loads. The stock file carries a
 * matched +352 W / −352 W `OtherEquipment` pair -- a test article whose halves
 * cancel exactly, so it buys nothing and fails quietly the day an edit touches
 * one half -- and 5.25 kW of astronomical-clock grounds lighting, which now
 * lives behind the Grounds strip instead of silently in the baseline. Every
 * load in this document is one somebody engaged.
 *
 * The geometry is still the point of the exercise: the plan loop in
 * `boxSurfaces` generates the four walls, and every consumer of this model --
 * the axonometric, the datum lines on the plate, the quantities panel, the
 * title block, the console's own derived meters -- reads the objects back out
 * instead of transcribing constants.
 *
 * `applyModel` is the whole console in one function. It is idempotent: it runs
 * on every parameter change and on every solve, adding, reshaping and removing
 * objects so the document always says exactly what the desk says. A bypassed
 * channel does not write a zero, it writes nothing at all -- its objects come
 * out of the document, which is what makes the drawing and the IDF agree about
 * what is in the path.
 */

export const ZONE_NAME = 'ZONE ONE';
export const SOUTH_WINDOW = 'Zn001:Wall001:Win001';
/**
 * The walls' glazing assembly, whichever of the two models built it.
 *
 * Exported because the sheet reads the engine's own U-factor and SHGC for it
 * back out of the run's envelope summary, which is a table indexed by
 * construction name — and a name repeated in a reader and in the applier is a
 * name that will one day be changed in only one of them.
 */
export const WINDOW_CONSTRUCTION = 'WINDOW';

/**
 * The four walls, in the order the plan loop generates them.
 *
 * The plan runs (0,0) → (w,0) → (w,d) → (0,d), so the first wall is the one at
 * y = 0 and its outward normal points at −y. With `north_axis` at 0 that is due
 * south, which is why the stock example's one window belongs on Wall001.
 */
export const WALLS = Object.freeze([
  { name: 'Zn001:Wall001', side: 'south', label: 'S', wwr: 'wwrS', overhang: 'ohS' },
  { name: 'Zn001:Wall002', side: 'east', label: 'E', wwr: 'wwrE', overhang: 'ohE' },
  { name: 'Zn001:Wall003', side: 'north', label: 'N', wwr: 'wwrN', overhang: 'ohN' },
  { name: 'Zn001:Wall004', side: 'west', label: 'W', wwr: 'wwrW', overhang: 'ohW' },
].map((wall) =>
  Object.freeze({
    ...wall,
    boundary: BOUNDARY_KEYS[wall.side],
    openable: OPENABLE_KEYS[wall.side],
  }),
));

export { DEFAULT_PARAMETERS };

export const ROOF = 'Zn001:Roof001';
export const FLOOR = 'Zn001:Flr001';

/**
 * Which parameter decides each surface's boundary condition.
 *
 * Assembled from `BOUNDARY_KEYS` rather than written out again, and asserted
 * against the control declarations at module load, because the failure of a
 * misspelled key here is exactly the kind this file refuses everywhere else:
 * `params.wallBoundryN` is `undefined`, `undefined` is not `Outdoors`, and the
 * wall would go quietly adiabatic on a desk whose key says it is not.
 */
const BOUNDARY_OF = new Map([
  ...WALLS.map((wall) => [wall.name, wall.boundary]),
  [ROOF, BOUNDARY_KEYS.roof],
  [FLOOR, BOUNDARY_KEYS.floor],
]);
for (const key of BOUNDARY_OF.values()) controlFor(key); // throws naming an unowned key
// And the openable-area keys, by the same rule and against the same silence:
// `params[undefined]` is not greater than zero, so a wall would simply never
// open rather than failing.
for (const wall of WALLS) controlFor(wall.openable);

/**
 * Which parameter a surface of the drawing belongs to, by name.
 *
 * The axonometric flips a surface by clicking it, and the name on the polygon
 * is what it has: the drawing is projected from `BuildingSurface:Detailed`
 * vertices and knows nothing about compass points. Null for a surface no
 * boundary control owns, so a caller has something to refuse rather than a
 * key that quietly sets nothing.
 */
export const boundaryKeyFor = (name) => BOUNDARY_OF.get(name) ?? null;

const CONTEXT_SHADE = 'Context:Obstruction';
const FRAME = 'WINDOW FRAME';
/** The rooflights' own assembly, when they are not glazed as the walls are. */
const SKY_CON = 'SKYLIGHT';
const SKY_GLASS = 'SKYLIGHT GLAZING';
/**
 * The stops on the rooflight grid, read off the control that owns them rather
 * than written out again here. Repeating the top stop as a literal is how a
 * later widening of the slider becomes a silent clamp in `skylightsOn` and a
 * sweep in `applySkylights` that is one square too short.
 */
const SKY_COUNT = controlFor('skyCount').control;
/**
 * The most rooflights the roof can carry, which is the square of the count
 * control's top stop.
 *
 * It is a constant rather than a reading off `params` because the applier has
 * to sweep names the desk is no longer asking for in order to remove them: a
 * grid that has just gone from four across to two leaves twelve openings and
 * forty-eight curb faces in the document that nothing would otherwise delete.
 */
const SKY_MAX = SKY_COUNT.max ** 2;
/**
 * The most sheets a layered unit can carry, read off the control that owns the
 * stop for the same reason `SKY_COUNT` is: `applyGlazing` sweeps every pane and
 * cavity name on every apply so a unit that has shrunk takes its abandoned
 * layers out of the document, and a literal here would leave orphans behind
 * the first time the slider was widened.
 */
const PANE_MAX = controlFor('panes').control.max;
const paneName = (i) => `GLZ-PANE-${i}`;
const cavityName = (i) => `GLZ-CAVITY-${i}`;
const BLIND = 'WINDOW BLIND';

/* ── the pressure network's constants ───────────────────────────────────── */

/**
 * Air at the reference temperature, in kg/m3.
 *
 * 1.2041 is dry air at 20 degrees and one standard atmosphere, which is the
 * figure every published leakage conversion is written against. It converts the
 * volumetric rate the reader states into the mass flow the engine's crack
 * coefficient is defined in, so it has to be the same density the reference
 * conditions below declare — a coefficient derived at one temperature and
 * declared at another is a silent scaling error of a few percent.
 */
const AIR_DENSITY = 1.2041;
/**
 * The reference pressure difference the stated leakiness is quoted at, in Pa.
 *
 * 4 Pa is the natural-conditions reference the scheduled model's `infiltration`
 * already works in — its own note says "not the ACH50 a blower door reports",
 * and the usual rule divides one by about twenty to get the other. Keeping one
 * reference across both models is what lets `envLeak` reuse `infiltration`'s
 * landmark bands rather than declaring a second set that would disagree with
 * them about what "background ventilation" means.
 */
const REF_DELTA_P = 4;
/**
 * The flow exponent of a distributed crack, dimensionless.
 *
 * 0.65 is the midpoint of the 0.5 (fully turbulent, a large sharp orifice) to
 * 1.0 (fully laminar, a long thin crack) range, and is what the engine's own
 * documentation and every blower-door standard use where nothing is measured.
 */
const FLOW_EXPONENT = 0.65;
/** The temperature `AIR_DENSITY` is taken at, declared to the engine in °C. */
const REF_TEMP_C = 20;

const REF_CONDITIONS = 'Site Conditions';
const CRACK = 'Crack';
const OPENING = 'Openable';
const AFN_SETPOINT = 'AFN Setpoint';
const WIND_SENSOR = 'WindSpeed';
const WIND_PROGRAM = 'ShutOnWind';
const WIND_MANAGER = 'WindManager';

const INTERNAL_MASS = 'Internal Mass';
const INTERNAL_MASS_CON = 'INTERNALMASS';

/** A reveal, so an opening never runs into the corner of its own wall. */
const MARGIN = 0.05;

/* ══ reading the document, strictly ══════════════════════════════════════ */

/**
 * Fetch an object that has to be there.
 *
 * Every applier below reaches into a document it did not build in this call.
 * If the thing it is about to edit has gone missing, the honest outcome is a
 * throw naming it -- not a silent `add` that quietly re-creates a different
 * object with the same name and different defaults.
 */
function must(doc, type, name = null) {
  const found = name === null ? doc.all(type).toArray()[0] : doc.get(type, name);
  if (!found) throw new Error(`the model has no ${type}${name ? ` named ${name}` : ''}`);
  return found;
}

/**
 * Whether the document carries a type at all, asked without creating it.
 *
 * `doc.all(type)` and `doc.get(type, name)` both go through the document's own
 * `collection()`, which *inserts an empty collection* for a type it has never
 * seen — and `types()` is insertion order, which is the order the IDF is
 * written in. So merely asking whether a type is present moves every later
 * object of that type to the position of the question.
 *
 * Measured: `applyAir` gained a `drop(doc, 'Schedule:Compact', …)` to take the
 * network's setpoint schedule out, and because Air is applied at 09 and Gains
 * writes the occupancy schedule at 10, that one question moved all three
 * `Schedule:Compact` objects seventy lines up the file. Nothing about the model
 * changed and the engine could not tell the difference, which is exactly why it
 * is worth a guard: a reordering with no symptom is one nobody would find.
 *
 * Used at that one call site rather than folded into `clear` and `drop`
 * themselves, deliberately. Every existing sweep in this file already registers
 * whatever it clears, and the current ordering of the whole document is the
 * accumulated result of that — guarding the helpers rewrites the object order
 * of every IDF this page has ever published, in a change about air flow. The
 * hazard is general and is written down here; the fix stays where the new
 * question is asked.
 */
const holds = (doc, type) => doc.types().includes(type);

/** Remove every object of a type, if any. */
function clear(doc, type) {
  for (const object of doc.all(type).toArray()) doc.remove(object);
}

/** Remove one named object, if it is there. */
function drop(doc, type, name) {
  const found = doc.get(type, name);
  if (found) doc.remove(found);
}

/* ══ geometry ════════════════════════════════════════════════════════════ */

/**
 * The six surfaces of a box, as vertex lists.
 *
 * Vertices are wound counter-clockwise seen from outside, per the
 * GlobalGeometryRules object below, which is what makes the outward normals
 * come out right for the axonometric and the area sums.
 */
/**
 * Turn a plan point about the building's centre.
 *
 * `Building.north_axis` is the obvious place to put an orientation and it is
 * the wrong one here: `GlobalGeometryRules` declares World coordinates, under
 * which EnergyPlus ignores a non-zero north axis outright — it says so in the
 * error file. So the rotation goes into the vertices instead, which is both
 * what the engine will actually honour and the only version the drawing can
 * show: the sheet reads coordinates, so a building that turns has to turn in
 * the coordinates or the axonometric would be telling a story the engine never
 * heard.
 *
 * Clockwise, because that is how a bearing is measured.
 */
function turn([x, y], degrees, [cx, cy]) {
  if (!degrees) return [x, y];
  const t = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [dx, dy] = [x - cx, y - cy];
  return [cx + dx * c + dy * s, cy - dx * s + dy * c];
}

/** The four corners of the plan, turned to the building's orientation. */
function planPoints({ width, depth, northAxis }) {
  const centre = [width / 2, depth / 2];
  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ].map((p) => turn(p, northAxis, centre));
}

function boxSurfaces(params) {
  // The boundary conditions here are the document's starting state and nothing
  // more: `applyFabric` writes every surface's real one on every apply, the
  // first of which happens before `buildModel` returns. They are the stock
  // example's, so the file this builds reads as that file until the desk moves.
  const { height } = params;
  const plan = planPoints(params);
  const walls = plan.map(([ax, ay], i) => {
    const [bx, by] = plan[(i + 1) % plan.length];
    return {
      ...WALLS[i],
      type: 'Wall',
      construction: 'R13WALL',
      boundary: 'Outdoors',
      exposed: true,
      viewFactor: 0.5,
      a: [ax, ay],
      b: [bx, by],
      verts: [
        [ax, ay, height],
        [ax, ay, 0],
        [bx, by, 0],
        [bx, by, height],
      ],
    };
  });
  return [
    ...walls,
    {
      name: FLOOR,
      type: 'Floor',
      construction: 'FLOOR',
      boundary: 'Adiabatic',
      exposed: false,
      viewFactor: 1.0,
      // Wound the opposite way round the plan from the roof, so its normal
      // points down and the roof's points up.
      verts: [plan[1], plan[0], plan[3], plan[2]].map(([x, y]) => [x, y, 0]),
    },
    {
      name: ROOF,
      type: 'Roof',
      construction: 'ROOF31',
      boundary: 'Outdoors',
      exposed: true,
      viewFactor: 0,
      verts: [plan[3], plan[0], plan[1], plan[2]].map(([x, y]) => [x, y, height]),
    },
  ];
}

/**
 * The four walls with their plan points attached.
 *
 * `WALLS` names the walls and says which parameters they own; the corners come
 * from the same plan loop `boxSurfaces` uses, so an opening is always cut in
 * the wall the surface builder actually drew.
 */
function wallPlan(params) {
  const plan = planPoints(params);
  return WALLS.map((wall, i) => ({ ...wall, a: plan[i], b: plan[(i + 1) % plan.length] }));
}

const vertexGroups = (verts) =>
  verts.map(([x, y, z]) => ({
    vertex_x_coordinate: x,
    vertex_y_coordinate: y,
    vertex_z_coordinate: z,
  }));

/**
 * An opening on one wall, sized to hit that wall's window-to-wall ratio.
 *
 * All three aperture types spend the same area; they differ only in how they
 * spend it. Punched scales both dimensions by √r, which keeps the light in
 * proportion with its wall and guarantees a reveal on all four sides at any
 * ratio. Ribbon fixes the width and lets the height fall out of the area. Full
 * height does the reverse.
 *
 * Wound to match the base surface -- upper-left, lower-left, lower-right,
 * upper-right seen from outside -- so the outward normal still points out.
 */
function apertureOn(wall, params) {
  const r = params[wall.wwr];
  if (!(r > 0)) return null;

  const [a, b] = [wall.a, wall.b];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const H = params.height;
  const maxW = Math.max(0.1, length - 2 * MARGIN);
  const maxH = Math.max(0.1, H - 2 * MARGIN);
  const area = r * length * H;

  let w;
  let h;
  if (params.aperture === 'Ribbon') {
    w = maxW;
    h = Math.min(area / w, maxH);
  } else if (params.aperture === 'Full') {
    h = maxH;
    w = Math.min(area / h, maxW);
  } else {
    const s = Math.sqrt(r);
    w = Math.min(length * s, maxW);
    h = Math.min(H * s, maxH);
  }

  const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const at = (t) => [a[0] + u[0] * t, a[1] + u[1] * t];
  const t0 = (length - w) / 2;
  const t1 = t0 + w;

  // Where the opening sits in the travel it has left. Full height has none.
  const travel = Math.max(0, H - h - 2 * MARGIN);
  const z0 = params.aperture === 'Full' ? MARGIN : MARGIN + travel * params.sill;
  const z1 = z0 + h;

  const [p0, p1] = [at(t0), at(t1)];
  return {
    verts: [
      [p0[0], p0[1], z1],
      [p0[0], p0[1], z0],
      [p1[0], p1[1], z0],
      [p1[0], p1[1], z1],
    ],
    // Everything the shades need, so they are cut from the same numbers.
    at,
    u,
    // Outward normal in plan. For the south wall u is +x and this is −y, which
    // is the direction an overhang there has to project.
    n: [u[1], -u[0]],
    t0,
    t1,
    z0,
    z1,
    length,
  };
}

// FenestrationSurface:Detailed has no extensible group: four vertices, each in
// its own numbered field.
const windowVertexFields = (verts) =>
  Object.fromEntries(
    verts.flatMap(([x, y, z], i) => [
      [`vertex_${i + 1}_x_coordinate`, x],
      [`vertex_${i + 1}_y_coordinate`, y],
      [`vertex_${i + 1}_z_coordinate`, z],
    ]),
  );

/**
 * A flat overhang on the head of an opening, projecting outward.
 *
 * Written out as vertices rather than as `Shading:Overhang`, which would say
 * the same thing in four numbers, because the drawing reads its geometry back
 * off the model like everything else on the sheet -- and only a detailed
 * surface carries coordinates to read.
 *
 * Wound counter-clockwise seen from above, which puts the outward normal up
 * towards the sky.
 */
function overhangOn(opening, wall, params) {
  const d = params[wall.overhang];
  if (!opening || !(d > 0)) return null;
  const head = opening.z1 + params.ohRise;
  const [p0, p1] = [opening.at(opening.t0), opening.at(opening.t1)];
  const out = (p) => [p[0] + opening.n[0] * d, p[1] + opening.n[1] * d];
  const [q0, q1] = [out(p0), out(p1)];
  return [
    [p0[0], p0[1], head],
    [q0[0], q0[1], head],
    [q1[0], q1[1], head],
    [p1[0], p1[1], head],
  ];
}

/** The two vertical fins at an opening's jambs, if there are any. */
function finsOn(opening, params) {
  const d = params.fin;
  if (!opening || !(d > 0)) return [];
  const off = params.finOffset;
  const head = opening.z1 + params.ohRise;
  const sides = [
    Math.max(0, opening.t0 - off),
    Math.min(opening.length, opening.t1 + off),
  ];
  return sides.map((t) => {
    const p = opening.at(t);
    const q = [p[0] + opening.n[0] * d, p[1] + opening.n[1] * d];
    return [
      [p[0], p[1], head],
      [p[0], p[1], opening.z0],
      [q[0], q[1], opening.z0],
      [q[0], q[1], head],
    ];
  });
}

/**
 * The rooflights, laid out on the plan and sized to hit the roof ratio.
 *
 * Worked in the unturned plan and turned at the end, the same way `planPoints`
 * does it, so a building set to a bearing carries its rooflights round with it
 * instead of having them slide across a roof that moved underneath them.
 *
 * The two arrangements spend one area two ways, and the difference is a real
 * one on a roof. Square lights take a cell each of an n × n grid and are
 * scaled by √r within it — the same arithmetic the punched wall aperture uses,
 * and for the same reason: it keeps each light in proportion with the piece of
 * roof it belongs to at every ratio. Linear rooflights run the full width and
 * spend the area on depth instead, which is the north-light section drawn flat.
 *
 * Both clamp against a reveal, and a clamp that bites is not hidden: the area
 * that results is what goes into the document, and the strip's ratio is read
 * back off those vertices rather than off the number the slider says. There is
 * no tilt here and there cannot be — a `FenestrationSurface:Detailed` has to be
 * coplanar with the surface it is cut into, so a monitor or a sawtooth would
 * need the roof itself to fold, which is a different building.
 */
function skylightsOn(params) {
  const r = params.skyRatio;
  if (!(r > 0)) return [];
  const { width: w, depth: d, height: H } = params;
  const n = Math.max(SKY_COUNT.min, Math.min(SKY_COUNT.max, Math.round(params.skyCount)));
  const centre = [w / 2, d / 2];
  const rects = [];

  if (params.skyForm === 'Linear') {
    const x0 = MARGIN;
    const x1 = Math.max(x0 + 0.1, w - MARGIN);
    const band = Math.min((r * w * d) / (n * (x1 - x0)), Math.max(0.1, d / n - 2 * MARGIN));
    for (let i = 0; i < n; i += 1) {
      const cy = ((i + 0.5) * d) / n;
      rects.push([x0, cy - band / 2, x1, cy + band / 2]);
    }
  } else {
    const s = Math.sqrt(r);
    const [cw, cd] = [w / n, d / n];
    const lw = Math.min(cw * s, Math.max(0.1, cw - 2 * MARGIN));
    const ld = Math.min(cd * s, Math.max(0.1, cd - 2 * MARGIN));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const [cx, cy] = [(i + 0.5) * cw, (j + 0.5) * cd];
        rects.push([cx - lw / 2, cy - ld / 2, cx + lw / 2, cy + ld / 2]);
      }
    }
  }

  return rects.map(([x0, y0, x1, y1]) => {
    // Wound as the roof is wound — upper-left first, counter-clockwise seen
    // from above — so the rooflight's outward normal points at the sky like
    // the surface it is cut into, and not down into the room.
    const plan = [
      [x0, y1],
      [x0, y0],
      [x1, y0],
      [x1, y1],
    ].map((p) => turn(p, params.northAxis, centre));
    return { plan, verts: plan.map(([x, y]) => [x, y, H]) };
  });
}

/**
 * The upstand a rooflight is bedded on, as four faces standing round its edge.
 *
 * Written as detailed shading surfaces rather than as the `outside_reveal_depth`
 * of a `WindowProperty:FrameAndDivider`, which would shade the same opening in
 * one field. The field is the smaller change and the wrong one here: the sheet
 * draws its geometry by reading coordinates back off the document, so a curb
 * expressed as a number would shade the run and be invisible on the drawing —
 * and a curb you cannot see is exactly the one you forget you set.
 *
 * Each face is wound the way `boxSurfaces` winds a wall, so with the plan
 * running counter-clockwise the outward normal points away from the opening.
 */
function curbOn(light, params) {
  const c = params.skyCurb;
  if (!(c > 0)) return [];
  const base = params.height;
  const top = base + c;
  return light.plan.map((a, i) => {
    const b = light.plan[(i + 1) % light.plan.length];
    return [
      [a[0], a[1], top],
      [a[0], a[1], base],
      [b[0], b[1], base],
      [b[0], b[1], top],
    ];
  });
}

/**
 * One obstructing slab standing off the site at a bearing.
 *
 * Bearing is measured the way a compass measures it -- clockwise from north,
 * which is +y here -- so the direction out to the neighbour is (sin, cos) and
 * the face it presents runs across that.
 */
function contextVertices(params) {
  const az = (params.ctxAzimuth * Math.PI) / 180;
  const dir = [Math.sin(az), Math.cos(az)];
  const across = [Math.cos(az), -Math.sin(az)];
  const centre = [params.width / 2, params.depth / 2];
  const mid = [centre[0] + dir[0] * params.ctxDistance, centre[1] + dir[1] * params.ctxDistance];
  const half = params.ctxWidth / 2;
  const left = [mid[0] - across[0] * half, mid[1] - across[1] * half];
  const right = [mid[0] + across[0] * half, mid[1] + across[1] * half];
  return [
    [left[0], left[1], params.ctxHeight],
    [left[0], left[1], 0],
    [right[0], right[1], 0],
    [right[0], right[1], params.ctxHeight],
  ];
}

/* ══ the base document ═══════════════════════════════════════════════════ */

/**
 * What the run reports, before the console adds anything.
 *
 * The stock example also asks for around thirty per-surface and per-zone-face
 * conduction series. They are gone, and their absence is the single largest
 * thing keeping the sliders interactive: each was requested with key `*`, so it
 * expanded to one series per surface, and together they took the ESO from 15
 * series to 173. Measured on the annual run, interleaved A/B in one session, a
 * full year went from 2,984 ms to 681 ms.
 *
 * Everything the console adds on top is zone-level and keyed to the one zone,
 * so a fully engaged desk costs about ten more series, not another hundred.
 */
const VARIABLES_HOURLY = [
  'Site Outdoor Air Drybulb Temperature',
  'Site Total Sky Cover',
  'Site Opaque Sky Cover',
  'Zone Mean Air Temperature',
  'Zone Operative Temperature',
  'Zone Total Internal Latent Gain Energy',
  'Zone Mean Radiant Temperature',
  'Zone Air Heat Balance Surface Convection Rate',
  'Zone Air Heat Balance Air Energy Storage Rate',
];

const VARIABLES_DAILY = ['Site Daylight Saving Time Status', 'Site Day Type Index'];

const VARIABLES_MONTHLY = [
  'Other Equipment Total Heating Energy',
  'Zone Other Equipment Total Heating Energy',
];

/** Build the model. `schema` comes from a `SchemaBundle` load. */
export function buildModel(schema, parameters = DEFAULT_PARAMETERS, bypass = DEFAULT_BYPASS) {
  const doc = new IDFDocument(schema);

  doc.add('Version', null, { version_identifier: '26.1' });
  doc.add('Timestep', null, { number_of_timesteps_per_hour: 4 });

  doc.add('Building', 'Simple One Zone (Wireframe DXF)', {
    north_axis: 0,
    terrain: 'Suburbs',
    loads_convergence_tolerance_value: 0.04,
    temperature_convergence_tolerance_value: 0.004,
    // The stock example says MinimalShadowing, under which there is no exterior
    // shadowing at all except from window and door reveals — an overhang would
    // be drawn on the sheet and ignored by the engine. FullExterior computes
    // the shadow the overhang actually casts.
    solar_distribution: 'FullExterior',
    maximum_number_of_warmup_days: 30,
    minimum_number_of_warmup_days: 6,
  });

  doc.add('HeatBalanceAlgorithm', null, { algorithm: 'ConductionTransferFunction' });
  doc.add('SurfaceConvectionAlgorithm:Inside', null, { algorithm: 'TARP' });
  doc.add('SurfaceConvectionAlgorithm:Outside', null, { algorithm: 'DOE-2' });
  doc.add('ShadowCalculation', null, {
    shading_calculation_update_frequency_method: 'Periodic',
    shading_calculation_update_frequency: 20,
    sky_diffuse_modeling_algorithm: 'SimpleSkyDiffuseModeling',
  });

  // The one field the weather picker flips: off runs the two design days only,
  // on adds the weather-file run period below.
  doc.add('SimulationControl', null, {
    do_zone_sizing_calculation: 'No',
    do_system_sizing_calculation: 'No',
    do_plant_sizing_calculation: 'No',
    run_simulation_for_sizing_periods: 'Yes',
    run_simulation_for_weather_file_run_periods: 'No',
    do_hvac_sizing_simulation_for_sizing_periods: 'No',
    maximum_number_of_hvac_sizing_simulation_passes: 1,
  });

  // Replaced wholesale by `applyRun`, which writes one of these per group of
  // months. It is here so the document is complete before the first apply, and
  // it carries no `day_of_week_for_start_day` for the reason set out there.
  doc.add('RunPeriod', 'Run Period 1', {
    begin_month: 1,
    begin_day_of_month: 1,
    end_month: 12,
    end_day_of_month: 31,
    use_weather_file_holidays_and_special_days: 'Yes',
    use_weather_file_daylight_saving_period: 'Yes',
    apply_weekend_holiday_rule: 'No',
    use_weather_file_rain_indicators: 'Yes',
    use_weather_file_snow_indicators: 'Yes',
  });

  doc.add('Site:Location', 'Denver Centennial  Golden   N_CO_USA Design_Conditions', {
    latitude: 39.74,
    longitude: -105.18,
    time_zone: -7.0,
    elevation: 1829.0,
  });

  doc.add('SizingPeriod:DesignDay', 'Denver Centennial  Golden   N Ann Htg 99% Condns DB', {
    month: 12,
    day_of_month: 21,
    day_type: 'WinterDesignDay',
    maximum_dry_bulb_temperature: -15.5,
    daily_dry_bulb_temperature_range: 0.0,
    humidity_condition_type: 'Wetbulb',
    wetbulb_or_dewpoint_at_maximum_dry_bulb: -15.5,
    barometric_pressure: 81198,
    wind_speed: 3,
    wind_direction: 340,
    rain_indicator: 'No',
    snow_indicator: 'No',
    daylight_saving_time_indicator: 'No',
    solar_model_indicator: 'ASHRAEClearSky',
    sky_clearness: 0.0,
  });

  doc.add('SizingPeriod:DesignDay', 'Denver Centennial  Golden   N Ann Clg 1% Condns DB=>MWB', {
    month: 7,
    day_of_month: 21,
    day_type: 'SummerDesignDay',
    maximum_dry_bulb_temperature: 32,
    daily_dry_bulb_temperature_range: 15.2,
    humidity_condition_type: 'Wetbulb',
    wetbulb_or_dewpoint_at_maximum_dry_bulb: 15.5,
    barometric_pressure: 81198,
    wind_speed: 4.9,
    wind_direction: 0,
    rain_indicator: 'No',
    snow_indicator: 'No',
    daylight_saving_time_indicator: 'No',
    solar_model_indicator: 'ASHRAEClearSky',
    sky_clearness: 1.0,
  });

  doc.add('Material:NoMass', 'R13LAYER', {
    roughness: 'Rough',
    thermal_resistance: 2.290965,
    thermal_absorptance: 0.9,
    solar_absorptance: 0.75,
    visible_absorptance: 0.75,
  });
  doc.add('Material:NoMass', 'R31LAYER', {
    roughness: 'Rough',
    thermal_resistance: 5.456,
    thermal_absorptance: 0.9,
    solar_absorptance: 0.75,
    visible_absorptance: 0.75,
  });
  doc.add('Material', 'C5 - 4 IN HW CONCRETE', {
    roughness: 'MediumRough',
    thickness: 0.1014984,
    conductivity: 1.729577,
    density: 2242.585,
    specific_heat: 836.8,
    thermal_absorptance: 0.9,
    solar_absorptance: 0.65,
    visible_absorptance: 0.65,
  });

  // Not in the stock example. A plain double-glazed unit, described the way an
  // architect gets it from a product sheet: U-value, solar gain, visible light.
  doc.add('WindowMaterial:SimpleGlazingSystem', 'DOUBLE GLAZING', {
    u_factor: 1.8,
    solar_heat_gain_coefficient: 0.4,
    visible_transmittance: 0.6,
  });

  doc.add('Construction', 'R13WALL', { outside_layer: 'R13LAYER' });
  doc.add('Construction', 'FLOOR', { outside_layer: 'C5 - 4 IN HW CONCRETE' });
  doc.add('Construction', 'ROOF31', { outside_layer: 'R31LAYER' });
  doc.add('Construction', WINDOW_CONSTRUCTION, { outside_layer: 'DOUBLE GLAZING' });

  doc.add('Zone', ZONE_NAME, {
    direction_of_relative_north: 0,
    x_origin: 0,
    y_origin: 0,
    z_origin: 0,
    type: 1,
    multiplier: 1,
    ceiling_height: 'Autocalculate',
    volume: 'Autocalculate',
  });

  doc.add('ScheduleTypeLimits', 'Fraction', {
    lower_limit_value: 0.0,
    upper_limit_value: 1.0,
    numeric_type: 'CONTINUOUS',
  });
  doc.add('ScheduleTypeLimits', 'On/Off', {
    lower_limit_value: 0,
    upper_limit_value: 1,
    numeric_type: 'DISCRETE',
  });
  doc.add('ScheduleTypeLimits', 'Any Number');
  doc.add('ScheduleTypeLimits', 'Temperature', {
    lower_limit_value: -60,
    upper_limit_value: 200,
    numeric_type: 'CONTINUOUS',
  });
  doc.add('ScheduleTypeLimits', 'Control Type', {
    lower_limit_value: 0,
    upper_limit_value: 4,
    numeric_type: 'DISCRETE',
  });

  doc.add('GlobalGeometryRules', null, {
    starting_vertex_position: 'UpperLeftCorner',
    vertex_entry_direction: 'CounterClockWise',
    coordinate_system: 'World',
  });

  for (const face of boxSurfaces(parameters)) {
    const surface = doc.add('BuildingSurface:Detailed', face.name, {
      surface_type: face.type,
      construction_name: face.construction,
      zone_name: ZONE_NAME,
      outside_boundary_condition: face.boundary,
      sun_exposure: face.exposed ? 'SunExposed' : 'NoSun',
      wind_exposure: face.exposed ? 'WindExposed' : 'NoWind',
      view_factor_to_ground: face.viewFactor,
      number_of_vertices: face.verts.length,
    });
    surface.set('vertices', vertexGroups(face.verts));
  }

  // Every Output:* object is owned by `syncReporting`, written by the
  // `applyModel` call at the end of this build. Adding any here as well would
  // give the reconciler a second author to fight with.

  doc.add('Schedule:Constant', 'AlwaysOn', {
    schedule_type_limits_name: 'On/Off',
    hourly_value: 1.0,
  });

  applyModel(doc, parameters, bypass);
  return doc;
}

const addVariable = (doc, name, frequency, key = '*') =>
  doc.add('Output:Variable', null, {
    key_value: key,
    variable_name: name,
    reporting_frequency: frequency,
  });

/* ══ what is in the path ═════════════════════════════════════════════════ */

/**
 * Which channels are actually written into the document, and why not.
 *
 * Three states, and the difference between the last two matters: a channel you
 * bypassed is out because you said so, and a channel that is blocked is out
 * because the rest of the desk cannot support it. The console letters them
 * differently, and a blocked channel says what is missing rather than
 * pretending to be engaged and handing the engine objects it would reject.
 */
export function channelState(params, bypass) {
  const state = new Map();
  // A precondition can be about another channel rather than about a parameter
  // -- the plant has nothing to supply until the system is in the path -- so
  // the predicate is handed a reader for the channels already decided. The
  // strips are declared in physical order, which is the order those
  // dependencies run in, so a channel can only ever ask about one above it.
  const on = (id) => Boolean(state.get(id)?.engaged);
  // And a reader for the patch bay itself, which carries no such restriction:
  // being bypassed is an input to this loop rather than something the loop
  // decides, so it can be asked of any channel in any order. That is what lets
  // Glazing -- declared four strips above Fabric -- refuse to write openings
  // into a building whose every surface has just gone adiabatic, which for as
  // long as `on` was the only reader was a fatal the desk advertised as a
  // feature.
  const patchedOut = (id) => Boolean(bypass[id]);
  for (const channel of CHANNELS) {
    const out = channel.bypassable && patchedOut(channel.id);
    const blocked = !out && channel.requires && !channel.requires.test(params, on, patchedOut);
    state.set(channel.id, {
      engaged: !out && !blocked,
      bypassed: out,
      // A reason may be a sentence or a function of the parameters, for the
      // same reason `Side.unreached` grew that ability: a channel can now have
      // more than one way to be blocked — the Air strip's network needs a
      // surface with an outside *and* something to leak through or open — and
      // one sentence covering both would name the wrong cause half the time.
      blocked: blocked
        ? typeof channel.requires.reason === 'function'
          ? channel.requires.reason(params, on, patchedOut)
          : channel.requires.reason
        : null,
    });
  }
  return state;
}

/* ══ the appliers ════════════════════════════════════════════════════════ */

/**
 * Put the whole desk into the document.
 *
 * Order matters only where one channel reads geometry another wrote -- the
 * openings have to exist before anything can be hung on them or dimmed by them
 * -- so the appliers run in strip order, which is already that order.
 */
export function applyModel(doc, params, bypass = {}, { reporting = 'sheet' } = {}) {
  const state = channelState(params, bypass);
  const on = (id) => state.get(id).engaged;

  applyMassing(doc, params);
  applySite(doc, params);
  applyContext(doc, params, on('context'));
  applyFabric(doc, params, on('fabric'));
  applyMass(doc, params, on('mass'));
  applyGlazing(doc, params, on('glazing'));
  applySkylights(doc, params, on('skylights'));
  applyShading(doc, params, on('shading'), on('glazing'));
  applyBlinds(doc, params, on('blinds'));
  applyAir(doc, params, on('air'));
  applyGains(doc, params, on('gains'));
  applyDaylight(doc, params, on('daylight'), on('gains'));
  applySystem(doc, params, on('system'), on('gains'));
  applyGrounds(doc, params, on('grounds'));
  applySolver(doc, params);
  applyRun(doc, params);
  syncReporting(doc, state, reporting);

  return state;
}

/** 00 — the box, and how many of it there are. */
function applyMassing(doc, params) {
  const surfaces = doc.all('BuildingSurface:Detailed');
  for (const face of boxSurfaces(params)) {
    const surface = surfaces.get(face.name);
    if (!surface) throw new Error(`the model has lost surface ${face.name}`);
    surface.set('vertices', vertexGroups(face.verts));
    surface.number_of_vertices = face.verts.length;
  }
  must(doc, 'Zone', ZONE_NAME).multiplier = params.multiplier;
}

/** 01 — where it stands and which way it faces. */
function applySite(doc, params) {
  const building = must(doc, 'Building');
  // Stays at zero on purpose: the orientation is in the vertices, because World
  // coordinates make the engine ignore this field. See `turn`.
  building.north_axis = 0;
  building.terrain = params.terrain;
  building.solar_distribution = params.solarDist;

  clear(doc, 'Site:GroundReflectance');
  const reflect = doc.add('Site:GroundReflectance', null);
  for (const month of MONTHS_LOWER) reflect.set(`${month}_ground_reflectance`, params.groundReflect);

  // Only meaningful with a grounded floor, and only written then: an unused
  // ground temperature in the file is a number someone will later believe.
  clear(doc, 'Site:GroundTemperature:BuildingSurface');
  if (params.floorBoundary === 'Ground') {
    const ground = doc.add('Site:GroundTemperature:BuildingSurface', null);
    for (const month of MONTHS_LOWER) ground.set(`${month}_ground_temperature`, params.groundTemp);
  }
}

const MONTHS_LOWER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** 02 — the neighbours. */
function applyContext(doc, params, engaged) {
  drop(doc, 'Shading:Site:Detailed', CONTEXT_SHADE);
  if (!engaged) return;
  const shade = doc.add('Shading:Site:Detailed', CONTEXT_SHADE, { number_of_vertices: 4 });
  shade.set('vertices', vertexGroups(contextVertices(params)));
}

/** 07 — the opaque envelope. Bypassed, the box becomes a flask. */
function applyFabric(doc, params, engaged) {
  const wall = must(doc, 'Material:NoMass', 'R13LAYER');
  const roof = must(doc, 'Material:NoMass', 'R31LAYER');
  wall.thermal_resistance = params.wallR;
  roof.thermal_resistance = params.roofR;
  wall.solar_absorptance = params.wallAbs;
  roof.solar_absorptance = params.roofAbs;
  wall.thermal_absorptance = params.emittance;
  roof.thermal_absorptance = params.emittance;
  wall.visible_absorptance = params.wallAbs;
  roof.visible_absorptance = params.roofAbs;

  // An optional masonry leaf set inboard of the insulation. Rebuilt rather than
  // edited, because a construction's layer count is its identity.
  drop(doc, 'Material', 'WALLMASS');
  drop(doc, 'Construction', 'R13WALL');
  if (params.wallMass > 0) {
    doc.add('Material', 'WALLMASS', {
      roughness: 'MediumRough',
      thickness: params.wallMass,
      conductivity: 1.729577,
      density: 2242.585,
      specific_heat: 836.8,
      thermal_absorptance: 0.9,
      solar_absorptance: 0.65,
      visible_absorptance: 0.65,
    });
    doc.add('Construction', 'R13WALL', { outside_layer: 'R13LAYER', layer_2: 'WALLMASS' });
  } else {
    doc.add('Construction', 'R13WALL', { outside_layer: 'R13LAYER' });
  }

  // Each surface takes the state its own face of the boundary key is set to,
  // and bypass sends all six the same way: bypass is not a very large
  // R-value, it is no path at all — every surface stops seeing anything.
  //
  // One loop with no branch on surface type, because the type never decided
  // this. What differs between a wall and a floor is which two states its face
  // offers, and that lives in the declaration where the reader sets it.
  for (const surface of doc.all('BuildingSurface:Detailed').toArray()) {
    const key = BOUNDARY_OF.get(String(surface.name));
    if (!key) throw new Error(`no boundary control owns the surface ${surface.name}`);
    const boundary = engaged ? params[key] : ADIABATIC;
    surface.outside_boundary_condition = boundary;
    // Only a surface open to the weather sees sun or wind. A grounded floor is
    // exposed to neither, and an adiabatic surface has no outside to be
    // exposed to.
    const outdoors = boundary === 'Outdoors';
    surface.sun_exposure = outdoors ? 'SunExposed' : 'NoSun';
    surface.wind_exposure =
      outdoors && params.windExposure === 'WindExposed' ? 'WindExposed' : 'NoWind';
  }
}

/**
 * Whether a surface can carry an opening, asked of the document.
 *
 * EnergyPlus refuses a `FenestrationSurface:Detailed` or a
 * `Shading:Zone:Detailed` whose base surface is adiabatic — a severe naming
 * the subsurface, then `** Fatal ** GetSurfaceData: Errors discovered` — so
 * every channel that cuts into a surface asks this first.
 *
 * Read off the document rather than off `params`, and that is the whole
 * arrangement: `applyFabric` has already written the boundaries by the time
 * these run, so one question covers both ways a surface loses its outside —
 * its own face of the key set to adiabatic, and the Fabric channel patched
 * out, which no parameter records at all.
 */
const opensOutdoors = (doc, name) =>
  String(must(doc, 'BuildingSurface:Detailed', name).outside_boundary_condition).toLowerCase() ===
  'outdoors';

const SLAB_MATERIALS = Object.freeze({
  Heavy: { conductivity: 1.729577, density: 2242.585, specific_heat: 836.8 },
  Light: { conductivity: 0.53, density: 1280, specific_heat: 840 },
  Timber: { conductivity: 0.15, density: 608, specific_heat: 1630 },
});

/** 08 — what the building remembers. */
function applyMass(doc, params, engaged) {
  const slab = must(doc, 'Material', 'C5 - 4 IN HW CONCRETE');
  const stuff = SLAB_MATERIALS[params.slabMaterial];
  if (!stuff) throw new Error(`no slab material called ${params.slabMaterial}`);
  slab.thickness = params.slab;
  slab.conductivity = stuff.conductivity;
  slab.density = stuff.density;
  slab.specific_heat = stuff.specific_heat;

  // Bypassing mass swaps the slab for a massless layer of the same resistance,
  // so the only thing that changes is storage — not the U-value, which would
  // confound the reading.
  drop(doc, 'Material:NoMass', 'FLOORLIGHT');
  drop(doc, 'Construction', 'FLOOR');
  if (engaged) {
    doc.add('Construction', 'FLOOR', { outside_layer: 'C5 - 4 IN HW CONCRETE' });
  } else {
    doc.add('Material:NoMass', 'FLOORLIGHT', {
      roughness: 'MediumRough',
      thermal_resistance: Math.max(0.001, params.slab / stuff.conductivity),
      thermal_absorptance: 0.9,
      solar_absorptance: 0.65,
      visible_absorptance: 0.65,
    });
    doc.add('Construction', 'FLOOR', { outside_layer: 'FLOORLIGHT' });
  }

  drop(doc, 'InternalMass', INTERNAL_MASS);
  drop(doc, 'Construction', INTERNAL_MASS_CON);
  drop(doc, 'Material', 'INTERNALMASS-LAYER');
  if (engaged && params.internalMass > 0) {
    doc.add('Material', 'INTERNALMASS-LAYER', {
      roughness: 'MediumRough',
      thickness: params.internalMassThickness,
      conductivity: stuff.conductivity,
      density: stuff.density,
      specific_heat: stuff.specific_heat,
      thermal_absorptance: 0.9,
      solar_absorptance: 0.65,
      visible_absorptance: 0.65,
    });
    doc.add('Construction', INTERNAL_MASS_CON, { outside_layer: 'INTERNALMASS-LAYER' });
    doc.add('InternalMass', INTERNAL_MASS, {
      construction_name: INTERNAL_MASS_CON,
      zone_or_zonelist_name: ZONE_NAME,
      surface_area: params.width * params.depth * params.internalMass,
    });
  }

  must(doc, 'HeatBalanceAlgorithm').algorithm = engaged
    ? params.hbAlgorithm
    : 'ConductionTransferFunction';
}

/**
 * One sheet of 6 mm clear float, as the layered model builds them.
 *
 * Every pane in the stack is the same glass; what the pane count buys is the
 * cavities between them, which is where a multiple-glazed unit's resistance
 * actually is. `emissivity` is the *outside* face of the sheet — the one
 * looking into the cavity outboard of it — and only the inboard pane is ever
 * handed anything but bare float.
 */
const pane = (emissivity) => ({
  optical_data_type: 'SpectralAverage',
  thickness: 0.006,
  solar_transmittance_at_normal_incidence: 0.775,
  front_side_solar_reflectance_at_normal_incidence: 0.071,
  back_side_solar_reflectance_at_normal_incidence: 0.071,
  visible_transmittance_at_normal_incidence: 0.881,
  front_side_visible_reflectance_at_normal_incidence: 0.08,
  back_side_visible_reflectance_at_normal_incidence: 0.08,
  infrared_transmittance_at_normal_incidence: 0,
  front_side_infrared_hemispherical_emissivity: emissivity,
  back_side_infrared_hemispherical_emissivity: 0.84,
  conductivity: 1.0,
});

/** 03 — the openings, and what they are made of. */
function applyGlazing(doc, params, engaged) {
  // The assembly, rebuilt from scratch: a construction's layer count is its
  // identity, and neither the two models nor two pane counts have the same
  // number of layers. The sweep runs to the pane control's top stop rather
  // than to the live count, for the reason `SKY_MAX` does: a unit that has
  // just gone from four panes to two would otherwise leave two sheets and two
  // cavities in the document that nothing references and nothing removes.
  drop(doc, 'Construction', WINDOW_CONSTRUCTION);
  drop(doc, 'WindowMaterial:SimpleGlazingSystem', 'DOUBLE GLAZING');
  for (let i = 1; i <= PANE_MAX; i += 1) {
    drop(doc, 'WindowMaterial:Glazing', paneName(i));
    drop(doc, 'WindowMaterial:Gas', cavityName(i));
  }

  if (params.glazingModel === 'Layered') {
    const panes = params.panes;
    // Outboard to inboard, alternating sheet and cavity, which is the order a
    // `Construction` reads its layers in. The coating sits on the cavity face
    // of the inboard pane — surface 3 in a double unit, surface 5 in a triple
    // — because that is the surface a low-e hard coat is actually laid on and
    // the one it does the most from.
    const layers = [];
    for (let i = 1; i <= panes; i += 1) {
      if (i > 1) {
        doc.add('WindowMaterial:Gas', cavityName(i - 1), {
          gas_type: 'Air',
          thickness: params.gapWidth,
        });
        layers.push(cavityName(i - 1));
      }
      doc.add('WindowMaterial:Glazing', paneName(i), pane(i === panes ? params.paneEmiss : 0.84));
      layers.push(paneName(i));
    }
    doc.add(
      'Construction',
      WINDOW_CONSTRUCTION,
      Object.fromEntries(
        layers.map((name, i) => [i === 0 ? 'outside_layer' : `layer_${i + 1}`, name]),
      ),
    );
  } else {
    doc.add('WindowMaterial:SimpleGlazingSystem', 'DOUBLE GLAZING', {
      u_factor: params.uFactor,
      solar_heat_gain_coefficient: params.shgc,
      visible_transmittance: params.visT,
    });
    doc.add('Construction', WINDOW_CONSTRUCTION, { outside_layer: 'DOUBLE GLAZING' });
  }

  drop(doc, 'WindowProperty:FrameAndDivider', FRAME);
  if (engaged && params.frameWidth > 0) {
    doc.add('WindowProperty:FrameAndDivider', FRAME, {
      frame_width: params.frameWidth,
      frame_conductance: params.frameCond,
      frame_solar_absorptance: 0.7,
      frame_visible_absorptance: 0.7,
      frame_thermal_hemispherical_emissivity: 0.9,
    });
  }

  // The openings themselves. One routine adds, reshapes and removes, so a wall
  // crossing zero in either direction is handled in one place.
  for (const wall of wallPlan(params)) {
    const name = `${wall.name}:Win001`;
    const opening = engaged && opensOutdoors(doc, wall.name) ? apertureOn(wall, params) : null;
    const existing = doc.get('FenestrationSurface:Detailed', name);
    if (!opening) {
      if (existing) doc.remove(existing);
      continue;
    }
    const target =
      existing ??
      doc.add('FenestrationSurface:Detailed', name, {
        surface_type: 'Window',
        construction_name: WINDOW_CONSTRUCTION,
        building_surface_name: wall.name,
        view_factor_to_ground: 0.5,
        multiplier: 1,
      });
    target.number_of_vertices = opening.verts.length;
    for (const [field, value] of Object.entries(windowVertexFields(opening.verts))) {
      target.set(field, value);
    }
    target.frame_and_divider_name = params.frameWidth > 0 ? FRAME : '';
  }
}

/**
 * 04 — the openings in the roof, and the curbs they stand on.
 *
 * Runs after Glazing because it may borrow that channel's assembly, and before
 * Blinds because a rooflight glazed as the walls are is a surface the blind
 * control has to find.
 */
function applySkylights(doc, params, engaged) {
  // The rooflights' own unit, rebuilt from scratch like the walls' — and gone
  // entirely when they are glazed as the walls are, rather than left standing
  // unreferenced, because an unused construction in the document is a thing
  // the reader has to work out is unused.
  drop(doc, 'Construction', SKY_CON);
  drop(doc, 'WindowMaterial:SimpleGlazingSystem', SKY_GLASS);
  const own = engaged && params.skyGlass === 'Own';
  if (own) {
    doc.add('WindowMaterial:SimpleGlazingSystem', SKY_GLASS, {
      u_factor: params.skyU,
      solar_heat_gain_coefficient: params.skySHGC,
      visible_transmittance: params.skyVisT,
    });
    doc.add('Construction', SKY_CON, { outside_layer: SKY_GLASS });
  }

  const lights = engaged && opensOutdoors(doc, ROOF) ? skylightsOn(params) : [];
  for (let i = 0; i < SKY_MAX; i += 1) {
    const name = `${ROOF}:Sky${String(i + 1).padStart(3, '0')}`;
    const light = lights[i];
    const existing = doc.get('FenestrationSurface:Detailed', name);
    if (!light) {
      if (existing) doc.remove(existing);
      continue;
    }
    const target =
      existing ??
      doc.add('FenestrationSurface:Detailed', name, {
        // There is no skylight in the 26.1 surface-type list, and there does
        // not need to be: a rooflight is a window whose base surface happens
        // to be the roof, and every consumer on this sheet reads the host
        // rather than the word.
        surface_type: 'Window',
        building_surface_name: ROOF,
        // A horizontal opening looking up sees no ground at all, which is what
        // the roof it is cut into already says.
        view_factor_to_ground: 0,
        multiplier: 1,
      });
    target.construction_name = own ? SKY_CON : WINDOW_CONSTRUCTION;
    target.number_of_vertices = light.verts.length;
    for (const [field, value] of Object.entries(windowVertexFields(light.verts))) {
      target.set(field, value);
    }
  }

  // Four faces per light, indexed across the whole set so the curbs can shrink
  // with the grid as well as grow with it.
  const curbs = lights.flatMap((light) => curbOn(light, params));
  for (let i = 0; i < SKY_MAX * 4; i += 1) {
    const name = `${ROOF}:Curb${String(i + 1).padStart(3, '0')}`;
    const verts = curbs[i];
    const existing = doc.get('Shading:Zone:Detailed', name);
    if (!verts) {
      if (existing) doc.remove(existing);
      continue;
    }
    const target =
      existing ?? doc.add('Shading:Zone:Detailed', name, { base_surface_name: ROOF });
    target.number_of_vertices = verts.length;
    target.set('vertices', vertexGroups(verts));
  }
}

/** 05 — overhangs and fins, cut from the openings' own numbers. */
function applyShading(doc, params, engaged, glazingOn) {
  for (const wall of wallPlan(params)) {
    // The same question `applyGlazing` asked, and it has to be the same one:
    // this channel writes shades for the opening that channel wrote, so a wall
    // it skipped is a wall with nothing to shade.
    const opening = glazingOn && opensOutdoors(doc, wall.name) ? apertureOn(wall, params) : null;
    const shades = [];
    if (engaged && opening) {
      const over = overhangOn(opening, wall, params);
      if (over) shades.push(over);
      shades.push(...finsOn(opening, params));
    }
    // Up to three per wall: one overhang and two fins. Named by index so the
    // set can shrink as well as grow.
    for (let i = 0; i < 3; i += 1) {
      const name = `${wall.name}:Shade${String(i + 1).padStart(3, '0')}`;
      const verts = shades[i];
      const existing = doc.get('Shading:Zone:Detailed', name);
      if (!verts) {
        if (existing) doc.remove(existing);
        continue;
      }
      const target =
        existing ?? doc.add('Shading:Zone:Detailed', name, { base_surface_name: wall.name });
      target.number_of_vertices = verts.length;
      target.set('vertices', vertexGroups(verts));
    }
  }
}

/** 06 — shading that answers the weather. */
function applyBlinds(doc, params, engaged) {
  clear(doc, 'WindowShadingControl');
  drop(doc, 'WindowMaterial:Blind', BLIND);
  if (!engaged) return;

  doc.add('WindowMaterial:Blind', BLIND, {
    slat_orientation: 'Horizontal',
    slat_width: params.slatWidth,
    slat_separation: params.slatWidth * 0.8,
    slat_thickness: 0.001,
    slat_angle: params.slatAngle,
    slat_conductivity: 221,
    slat_beam_solar_transmittance: 0,
    front_side_slat_beam_solar_reflectance: 0.5,
    back_side_slat_beam_solar_reflectance: 0.5,
    slat_diffuse_solar_transmittance: 0,
    front_side_slat_diffuse_solar_reflectance: 0.5,
    back_side_slat_diffuse_solar_reflectance: 0.5,
    slat_beam_visible_transmittance: 0,
    slat_diffuse_visible_transmittance: 0,
    slat_infrared_hemispherical_transmittance: 0,
    front_side_slat_infrared_hemispherical_emissivity: 0.9,
    back_side_slat_infrared_hemispherical_emissivity: 0.9,
    blind_to_glass_distance: 0.05,
  });

  // Only the openings built of the layered assembly. A rooflight glazed in its
  // own simple unit is one equivalent layer with no cavity, and naming it here
  // is a severe error rather than a blind that quietly does nothing — so the
  // control is written for the surfaces it can actually serve, and the
  // Skylights strip says on its glass selector which those are.
  const windows = doc
    .all('FenestrationSurface:Detailed')
    .toArray()
    .filter((w) => String(w.construction_name) === WINDOW_CONSTRUCTION)
    .map((w) => String(w.name));
  if (!windows.length) return;

  const control = doc.add('WindowShadingControl', 'Blind Control', {
    zone_name: ZONE_NAME,
    shading_control_sequence_number: 1,
    shading_type: params.shadeType,
    shading_control_type: params.shadeControl,
    shading_device_material_name: BLIND,
    type_of_slat_angle_control_for_blinds: 'FixedSlatAngle',
    multiple_surface_control_type: 'Group',
  });
  if (params.shadeControl !== 'AlwaysOn') control.setpoint = params.shadeSetpoint;
  control.set('fenestration_surfaces', windows.map((name) => ({ fenestration_surface_name: name })));
}

/**
 * Every type either air model owns, cleared on every apply whichever one is in
 * force.
 *
 * Clear-and-rewrite rather than differential, for the reason `syncReporting`
 * gives: it is the only arrangement under which a desk that has just shrunk —
 * four openable walls down to one, six exterior surfaces down to three, or the
 * whole model switched — serialises byte-identically to one built that way.
 *
 * It is also what keeps the engine quiet. Engaging a network makes EnergyPlus
 * *discard* every scheduled infiltration and ventilation object rather than
 * reject it — `..Specified AirflowNetwork Control = "MultizoneWithoutDistribution"
 * and ZoneInfiltration:* objects are present. ..ZoneInfiltration objects will
 * not be simulated.` — one warning line in a file nobody opens, and the warning
 * count is something the title block reports. Removing the objects is what
 * makes the drawing, the IDF and the engine agree about what is in the path.
 */
const AIR_TYPES = Object.freeze([
  'ZoneInfiltration:DesignFlowRate',
  'ZoneVentilation:DesignFlowRate',
  'AirflowNetwork:SimulationControl',
  'AirflowNetwork:MultiZone:Zone',
  'AirflowNetwork:MultiZone:ReferenceCrackConditions',
  'AirflowNetwork:MultiZone:Surface:Crack',
  'AirflowNetwork:MultiZone:Component:SimpleOpening',
  'AirflowNetwork:MultiZone:Surface',
  // The wind bound. Cleared by type like the rest, which is safe *only* while
  // nothing else on this desk uses EMS — the day a second feature wants an Erl
  // program, this sweep has to narrow to the objects `applyAir` wrote by name
  // or it will delete that feature's program on every apply. There is no
  // symptom for that: an EMS program that is not in the document simply does
  // not run, and the run completes.
  'EnergyManagementSystem:Sensor',
  'EnergyManagementSystem:Actuator',
  'EnergyManagementSystem:Program',
  'EnergyManagementSystem:ProgramCallingManager',
]);

/**
 * 09 — the air the building trades with outdoors, by one of two models.
 *
 * The model that is out has its objects **deleted, not zeroed**, which is
 * Bypass's own rule extended to a selector. There is no `_MAX` constant here,
 * unlike `SKY_MAX` and `PANE_MAX`: those exist because their appliers sweep
 * names generated from a slider, whereas here the object count comes off the
 * document's own surfaces and the clear is by type, so a shrink is covered by
 * construction.
 */
function applyAir(doc, params, engaged) {
  for (const type of AIR_TYPES) clear(doc, type);
  // By name, not by type: `clear(doc, 'Schedule:Compact')` would take the
  // occupancy band and the always-on schedule with it. Guarded on the type
  // being present at all, because asking for a name in a type the document has
  // never held *registers* that type at this point in the file — see `holds`.
  if (holds(doc, 'Schedule:Compact')) drop(doc, 'Schedule:Compact', AFN_SETPOINT);
  if (!engaged) return;

  if (params.airModel === 'Network') applyNetwork(doc, params);
  else applyScheduled(doc, params);
}

/** The rate you state, which the weather only gates. */
function applyScheduled(doc, params) {
  if (params.infiltration > 0) {
    doc.add('ZoneInfiltration:DesignFlowRate', 'Infiltration', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: 'AlwaysOn',
      design_flow_rate_calculation_method: 'AirChanges/Hour',
      air_changes_per_hour: params.infiltration,
      constant_term_coefficient: params.infConstant,
      temperature_term_coefficient: params.infStack,
      velocity_term_coefficient: params.infWind,
      velocity_squared_term_coefficient: 0,
    });
  }

  if (params.ventilation > 0) {
    doc.add('ZoneVentilation:DesignFlowRate', 'Ventilation', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: 'AlwaysOn',
      design_flow_rate_calculation_method: 'AirChanges/Hour',
      air_changes_per_hour: params.ventilation,
      ventilation_type: params.ventType,
      fan_pressure_rise: params.ventType === 'Natural' ? 0 : 67,
      fan_total_efficiency: 0.7,
      constant_term_coefficient: 1,
      temperature_term_coefficient: 0,
      velocity_term_coefficient: 0,
      velocity_squared_term_coefficient: 0,
      // The three conditions that together make a night flush a night flush:
      // warm enough inside to be worth losing, cool enough outside to help, and
      // a real difference between the two.
      minimum_indoor_temperature: params.ventMinIndoor,
      maximum_outdoor_temperature: params.ventMaxOutdoor,
      delta_temperature: params.ventDeltaT,
      maximum_wind_speed: params.ventMaxWind,
    });
  }
}

/**
 * Site pressure from elevation, by the standard atmosphere the engine uses.
 *
 * Worth a run rather than a default: left at sea level this raises
 *
 *   ** Warning ** Pressure = 101325 differs by more than 10% from Standard
 *                 Barometric Pressure = 81198.
 *
 * on the desk's own default station, which stands at 1,829 m. The title block
 * letters the warning count, so a warning nobody can act on is a number on the
 * sheet that means nothing. Set from the site, measured: gone.
 */
const barometric = (z) => 101325 * (1 - 2.25577e-5 * z) ** 5.2559;

/**
 * The bearing of the building's longer plan dimension, folded into 0 to 180.
 *
 * Off each wall's own outward normal rather than off the width and depth
 * parameters, so it stays true under `turn()` — the vertices carry the
 * orientation and `Building.north_axis` is pinned at 0, so a building turned
 * 40° has walls whose bearings are 40, 130, 220, 310 and nothing named "south"
 * facing south. The field's range is 0 to 180 because an axis has no front.
 *
 * Read off `geometryFacts(doc).faces` and never off `params.width` /
 * `params.depth`, by the rule the whole sheet is built on: `buildSample` hands
 * this applier a document carrying a sweep's overlay, and a fact taken from
 * live parameters would describe the desk instead of the sample.
 */
function longAxis(facts) {
  const faces = facts.faces.filter((f) => f.length > 0);
  if (!faces.length) throw new Error('the model has no wall to take a long axis off');
  const longest = faces.reduce((best, f) => (f.length > best.length ? f : best));
  // A wall's outward normal is perpendicular to the axis it runs along, so the
  // axis is the normal turned a quarter turn. Folded into 0–180: an axis has
  // no front, and the field refuses anything above 180.
  return (((longest.bearing + 90) % 180) + 180) % 180;
}

/**
 * Short plan dimension over long, in (0, 1].
 *
 * Clamped at 1 because the field's maximum is 1 and a square box computes to
 * exactly that; floating point can put it a hair over.
 */
function widthRatio(facts) {
  const lengths = facts.faces.map((f) => f.length).filter((l) => l > 0);
  if (!lengths.length) throw new Error('the model has no wall to take a width ratio off');
  const ratio = Math.min(...lengths) / Math.max(...lengths);
  return Math.min(1, ratio);
}

/**
 * A stated air change rate, as the whole envelope's mass flow coefficient.
 *
 *   Q  = ach · V / 3600        m³/s
 *   ṁ  = ρ · Q                 kg/s
 *   C  = ṁ / ΔP^n              kg/s at 1 Pa
 *
 * at ΔP = 4 Pa, which is the natural-conditions reference the scheduled
 * model's `infiltration` already works in ("not the ACH50 a blower door
 * reports"). Keeping one reference is what lets both models share the
 * `INFILTRATION` landmark bands.
 *
 * The figure returned is for the envelope **as a whole** and is split between
 * the surfaces by area at the call site. That split is not cosmetic:
 * `air_mass_flow_coefficient_at_reference_conditions` is the coefficient for
 * that entire surface, not per square metre, and writing a per-square-metre
 * figure there runs clean, validates clean, warns about nothing, and is wrong
 * by about eightyfold — measured at 0.0007 ACH computed against a stated 0.5.
 * The check that the split is right is that it is linear: tripling `ach`
 * triples the computed rate (0.154 → 0.451 on Golden, a factor of 2.93).
 *
 * `grossVolume` carries the zone multiplier, so a stacked building leaks in
 * proportion to its size and the resulting rate is per building, as every other
 * intensity on this sheet is.
 */
const crackCoefficient = (ach, volume) =>
  ((AIR_DENSITY * ach * volume) / 3600) / REF_DELTA_P ** FLOW_EXPONENT;

/**
 * The leakage build-up, for the strip that has to print it.
 *
 * Exported so the sheet letters the arithmetic the applier actually did rather
 * than a second copy of it: the constants, the volume and the envelope area all
 * come from here, and a reader who wants to redo the division has every term.
 * The register prints its blower-door conversion the same way and for the same
 * reason — a derivation nobody can redo is a number applied out of sight.
 *
 * Read off the document, so it describes whatever was last applied, including a
 * sweep's overlay.
 */
export function leakageBuildUp(doc, envLeak) {
  const facts = geometryFacts(doc);
  return {
    ach: envLeak,
    volume: facts.grossVolume,
    area: facts.grossExposed,
    density: AIR_DENSITY,
    deltaP: REF_DELTA_P,
    exponent: FLOW_EXPONENT,
    coefficient: crackCoefficient(envLeak, facts.grossVolume),
  };
}

/**
 * The setpoint the venting rule is read against, as a flat `Schedule:Compact`.
 *
 * Flat because the control is one number: a band would be a second control
 * nobody declared, and this sheet does not letter settings it did not offer.
 */
function writeSetpoint(doc, celsius) {
  const schedule = doc.add('Schedule:Compact', AFN_SETPOINT, {
    schedule_type_limits_name: 'Any Number',
  });
  // `Until: 24:00` and the value after it are two extensible fields, not one
  // comma-bearing string — joined, they produce a malformed IDF line.
  schedule.set('data', [
    { field: 'Through: 12/31' },
    { field: 'For: AllDays' },
    { field: 'Until: 24:00' },
    { field: celsius },
  ]);
  return AFN_SETPOINT;
}

/**
 * Shut the openings above a wind speed. FR-012, and the one part of this
 * feature that reaches the run through a program rather than through a field.
 *
 * No AirflowNetwork object carries a wind speed: not `MultiZone:Zone`, not
 * `MultiZone:Surface`, and not `OccupantVentilationControl`, which carries
 * comfort curves, a PPD threshold and opening probabilities and nothing about
 * wind. `venting_availability_schedule_name` is a schedule and cannot read one
 * either. The engine does expose it, though, and the actuator dictionary says
 * so:
 *
 *   EnergyManagementSystem:Actuator Available,ZN001:WALL001:WIN001,
 *     AirFlow Network Window/Door Opening,Venting Opening Factor,[Fraction]
 *
 * with `Site Wind Speed` sensed off `Environment`. So the bound is a short Erl
 * program called at `BeginTimestepBeforePredictor`.
 *
 * Written only where something is openable: a bound on openings that do not
 * exist reaches no actuator.
 */
function applyWindBound(doc, params, windows) {
  if (!windows.length) return;

  doc.add('EnergyManagementSystem:Sensor', WIND_SENSOR, {
    output_variable_or_output_meter_index_key_name: 'Environment',
    output_variable_or_output_meter_name: 'Site Wind Speed',
  });

  const lines = [{ program_line: `IF ${WIND_SENSOR} > ${params.openMaxWind}` }];
  windows.forEach((name, i) => {
    doc.add('EnergyManagementSystem:Actuator', `Vent${i}`, {
      actuated_component_unique_name: name,
      actuated_component_type: 'AirFlow Network Window/Door Opening',
      actuated_component_control_type: 'Venting Opening Factor',
    });
    lines.push({ program_line: `SET Vent${i} = 0.0` });
  });
  lines.push({ program_line: 'ELSE' });
  // `Null` hands the actuator back to the engine's own venting control, which
  // is what makes this a **bound on** the opening rule rather than a
  // **replacement for** it. An EMS actuator holds whatever it was last set to,
  // so writing a value here instead -- `SET Vent0 = 0.5`, the obvious thing --
  // overrides the rule outright for every hour the wind is below the limit.
  // Measured on the stock desk with the zone on `Temperature` at 22 degrees:
  // 8,808 hours open of 8,808 and 4.160 ACH, against 2,601 hours and 0.419 ACH
  // with the release. Exit 0, zero warnings, nothing in the error file. There
  // is no signal for this anywhere but the reading, which is why its gate is a
  // number.
  windows.forEach((_, i) => lines.push({ program_line: `SET Vent${i} = Null` }));
  lines.push({ program_line: 'ENDIF' });

  doc.add('EnergyManagementSystem:Program', WIND_PROGRAM, {}).set('lines', lines);
  doc
    .add('EnergyManagementSystem:ProgramCallingManager', WIND_MANAGER, {
      energyplus_model_calling_point: 'BeginTimestepBeforePredictor',
    })
    .set('programs', [{ program_name: WIND_PROGRAM }]);
}

/** Every fenestration surface cut into one host, by the host the document gives it. */
const openingsOn = (doc, host) =>
  doc
    .all('FenestrationSurface:Detailed')
    .toArray()
    .filter((w) => String(w.building_surface_name) === host);

/**
 * The rate the weather computes, out of a pressure network.
 *
 * Every fact here comes off the document — the volume, the surface areas, the
 * boundaries, the site's elevation — and none off `params` beyond the reader's
 * own settings, for the reason `geometryFacts` gives: a sweep sample is applied
 * to a document carrying an overlay, and a fact taken from live parameters
 * would describe the desk instead of the sample.
 */
function applyNetwork(doc, params) {
  const facts = geometryFacts(doc);
  const ext = surfaceGeometry(doc).filter((s) => s.boundary === 'outdoors');
  // The channel's own `requires` has already refused this case, so an empty
  // list here is a bug rather than a state — the engine's answer to it is a
  // get-input fatal — and it throws by the same rule `must` does.
  if (!ext.length) throw new Error('a pressure network with no exterior surface to leak through');

  // `SurfaceAverageCalculation` is what avoids `ExternalNode`,
  // `WindPressureCoefficientArray` and `WindPressureCoefficientValues`
  // entirely. The engine documents it for rectangular buildings, which this box
  // is, and it is why a reader entering measured pressure coefficients is out
  // of scope here.
  doc.add('AirflowNetwork:SimulationControl', 'Network', {
    airflownetwork_control: 'MultizoneWithoutDistribution',
    wind_pressure_coefficient_type: 'SurfaceAverageCalculation',
    height_selection_for_local_wind_pressure_calculation: 'OpeningHeight',
    building_type: 'LowRise',
    azimuth_angle_of_long_axis_of_building: longAxis(facts),
    ratio_of_building_width_along_short_axis_to_width_along_long_axis: widthRatio(facts),
  });

  // Off `Site:Location` in the document rather than off the station the picker
  // holds, for the reason every fact here is: the document is what was
  // simulated.
  doc.add('AirflowNetwork:MultiZone:ReferenceCrackConditions', REF_CONDITIONS, {
    reference_temperature: REF_TEMP_C,
    reference_barometric_pressure: barometric(Number(must(doc, 'Site:Location').elevation)),
    reference_humidity_ratio: 0,
  });

  // Every exterior surface leaks, the roof included, and nothing is subtracted
  // for the glazing: the opaque area and the glazed area both leak, and
  // splitting the envelope's coefficient by full surface area is what makes the
  // sum come back to the stated rate.
  const total = ext.reduce((sum, s) => sum + polygonArea(s.verts), 0);
  const coefficient = crackCoefficient(params.envLeak, facts.grossVolume);
  // At the `Sealed` stop there is no crack to write, and writing one anyway is
  // a get-input fatal rather than a network that leaks nothing:
  //
  //   ** Severe ** <root>[AirflowNetwork:MultiZone:Surface:Crack][Crack
  //                Zn001:Roof001][air_mass_flow_coefficient_at_reference_conditions]
  //                - "0.000000" - Expected number greater than 0.000000
  //
  // The channel's `requires` refuses a desk that would end up with no linkage
  // at all, so a sealed envelope reaches here only when something is openable.
  for (const surface of params.envLeak > 0 ? ext : []) {
    const name = `${CRACK} ${surface.name}`;
    doc.add('AirflowNetwork:MultiZone:Surface:Crack', name, {
      air_mass_flow_coefficient_at_reference_conditions:
        coefficient * (polygonArea(surface.verts) / total),
      air_mass_flow_exponent: FLOW_EXPONENT,
      reference_crack_conditions: REF_CONDITIONS,
    });
    doc.add('AirflowNetwork:MultiZone:Surface', null, {
      surface_name: surface.name,
      leakage_component_name: name,
      window_door_opening_factor_or_crack_factor: 1,
    });
  }

  // ── the openings ──────────────────────────────────────────────────────
  //
  // `opensOutdoors(doc, name)`, not `params`: the same question `applyGlazing`,
  // `applySkylights` and `applyShading` ask, and it covers both ways a wall
  // loses its outside — its own face of the boundary key, and the Fabric
  // channel patched out, which no parameter records at all. The appliers run in
  // strip order and Fabric is 07 to Air's 09, so the boundaries are written.
  const walls = WALLS.filter(
    (wall) => params[wall.openable] > 0 && opensOutdoors(doc, wall.name),
  );
  const openable = []; // the window names, for the wind bound's actuators
  if (walls.length) {
    doc.add('AirflowNetwork:MultiZone:Component:SimpleOpening', OPENING, {
      // A near-shut opening still leaks, and the engine wants a figure for it
      // rather than a zero, exactly as the cracks above do.
      air_mass_flow_coefficient_when_opening_is_closed: 0.001,
      air_mass_flow_exponent_when_opening_is_closed: FLOW_EXPONENT,
      minimum_density_difference_for_two_way_flow: 0.0001,
      discharge_coefficient: 0.6,
    });
    for (const wall of walls) {
      // Only fenestration hosted on a **wall**, which is why this loops the
      // walls rather than the windows. A window whose host is the roof is
      // within 10° of horizontal, and *both* opening models refuse it:
      //
      //   ** Severe ** … which is within 10 deg of being horizontal. Airflows
      //                through horizontal openings are not allowed.
      //   ** Severe ** The horizontal opening must be located between two
      //                thermal zones
      //
      // The first because the vertical model's two-way flow comes from the
      // pressure difference varying between the opening's bottom and top, and a
      // flat opening gives it no neutral plane to place; the second because the
      // horizontal model compares an upper zone's air density against a lower
      // zone's, and outdoors is an external node carrying a wind pressure
      // rather than a zone with a density. Neither covers "horizontal, to
      // outdoors", both are fatal, and on every rooflight. So a roof window is
      // linked to no opening component — the roof surface itself still carries
      // its crack — and the Skylights strip says so where the reader would look
      // for the control.
      for (const window of openingsOn(doc, wall.name)) {
        openable.push(String(window.name));
        doc.add('AirflowNetwork:MultiZone:Surface', null, {
          surface_name: window.name,
          leakage_component_name: OPENING,
          window_door_opening_factor_or_crack_factor: params[wall.openable],
          ventilation_control_mode: 'ZoneLevel',
        });
      }
    }
  }

  // The wind bound acts on the openings, so it is written from the list the
  // linkages already collected rather than recomputed from the parameters.
  applyWindBound(doc, params, openable);

  // The rule the openings obey, and the two temperature-difference bounds
  // outside which they shut — written **after** the openings, because whether
  // there are any decides whether there is a rule at all. A network with no
  // opening has nothing to obey one, so it takes `NoVent` and none of the four
  // venting controls reaches an object. That matters beyond tidiness: those
  // four are withdrawn from the strip on exactly that condition, and a control
  // that is hidden while still moving the model is worse than a dead one — the
  // reader has no way to see what changed the answer.
  //
  // `NEEDS_SETPOINT` is imported from `controls.js` and never restated, so the
  // one place deciding whether a setpoint is needed is the one place deciding
  // whether it is offered — see its declaration for the get-input fatal that
  // splitting the two would make reachable.
  const venting = openable.length;
  const setpoint =
    venting && NEEDS_SETPOINT.has(params.openRule)
      ? writeSetpoint(doc, params.openSetpoint)
      : undefined;
  doc.add('AirflowNetwork:MultiZone:Zone', null, {
    zone_name: ZONE_NAME,
    ventilation_control_mode: venting ? params.openRule : 'NoVent',
    ventilation_control_zone_temperature_setpoint_schedule_name: setpoint,
    indoor_and_outdoor_temperature_difference_lower_limit_for_maximum_venting_open_factor:
      venting ? params.openDeltaLo : undefined,
    indoor_and_outdoor_temperature_difference_upper_limit_for_minimum_venting_open_factor:
      venting ? params.openDeltaHi : undefined,
  });

  // The engine's own precondition, checked here rather than discovered there:
  // `** Severe ** AirflowNetwork::Solver::get_input: An
  // AirflowNetwork:MultiZone:Surface object is required but not found.` The
  // channel's `requires` has already refused every desk that reaches it, so
  // this is a bug rather than a state, and it throws by the same rule `must`
  // does.
  if (!doc.all('AirflowNetwork:MultiZone:Surface').size) {
    throw new Error('a pressure network with nothing to leak through and nothing to open');
  }
}

/**
 * What a band schedule falls to outside its band.
 *
 * Named rather than left as a literal in the signature below because it is not
 * only a default: it is the value an occupied-hour test has to stand above, and
 * `occupiedFloor` answers that question with this constant rather than with a
 * second copy of the number.
 */
const BAND_OFF = 0.1;

/**
 * A day with a band in it, as a `Schedule:Compact`.
 *
 * Outside the band the value falls to `off` rather than to nothing, because a
 * building with literally no one in it overnight is a building whose equipment
 * has been unplugged.
 */
function bandSchedule(doc, name, limits, params, { on = 1, off = BAND_OFF } = {}) {
  drop(doc, 'Schedule:Compact', name);
  const schedule = doc.add('Schedule:Compact', name, { schedule_type_limits_name: limits });
  const rows = ['Through: 12/31'];

  rows.push('For: Weekdays SummerDesignDay WinterDesignDay');
  rows.push(...dayRows(params.occFrom, params.occTo, on, off));
  // Before `AllOtherDays`, which is the catch-all: a holiday falls into it
  // unless something claims the day first, which is why this row's absence made
  // a holiday and a Sunday the same day for as long as it was absent. At
  // `AsWeekend` nothing is written and that is exactly what it means.
  if (params.holidayUse !== 'AsWeekend') {
    rows.push('For: Holidays');
    const holiday = params.holidayUse === 'Open' ? on : off;
    rows.push(...dayRows(params.occFrom, params.occTo, holiday, off));
  }
  rows.push('For: AllOtherDays');
  const weekend = params.weekend === 'Occupied' ? on : off;
  rows.push(...dayRows(params.occFrom, params.occTo, weekend, off));

  schedule.set('data', rows.map((field) => ({ field })));
  return name;
}

/**
 * One day of a compact schedule, as separate fields.
 *
 * `Until: 08:00` and the value that follows it are two fields, not one string
 * with a comma in it — writing them joined produces an IDF line the engine
 * reads as a single malformed field.
 */
function dayRows(from, to, value, off) {
  const at = (hour) => `Until: ${String(hour).padStart(2, '0')}:00`;
  if (from >= to) return [at(24), off];
  const rows = [];
  if (from > 0) rows.push(at(from), off);
  rows.push(at(to), value);
  if (to < 24) rows.push(at(24), off);
  return rows;
}

/**
 * One day of a compact schedule from twenty-four hourly fractions.
 *
 * Same two-field rule as `dayRows` above, and the same reason for existing
 * separately: a `Profile` is a band and can only say *when*, so it is written
 * from a start, an end and two levels, while a `Pattern` is a shape and is
 * written hour by hour. CIBSE TM59's bedroom stands above 0.7 in every hour of
 * the day and at a different level in each part of it, which is exactly the
 * profile a band cannot hold.
 *
 * Runs of equal hours are collapsed, so a flat day is one pair rather than
 * twenty-four, and the collapse is **deterministic** — the run is closed at the
 * last hour holding the value and the row is lettered `Until: HH:00` at the end
 * of that hour, so the same twenty-four numbers always produce the same fields.
 * That is not tidiness. `applyModel` runs on every parameter change and the
 * sweep's restore is asserted byte-identical, so a collapse that depended on
 * anything but the fractions themselves would break idempotence rather than
 * merely look untidy.
 *
 * Hour `h` covers `h:00` to `h+1:00`, which is why the last row is
 * `Until: 24:00` and not `Until: 23:00`.
 */
function patternRows(hours) {
  const rows = [];
  for (let h = 0; h < hours.length; h += 1) {
    if (hours[h + 1] === hours[h]) continue;
    rows.push(`Until: ${String(h + 1).padStart(2, '0')}:00`, hours[h]);
  }
  return rows;
}

/**
 * A day-shaped `Schedule:Compact` written from a pattern.
 *
 * The day-type structure is `bandSchedule`'s, deliberately: the weekend and
 * holiday selectors are not withdrawn under a named room type, so they have to
 * go on reaching an object or they would be two live controls moving nothing.
 * TM59 §3.7.1 asks for "the same profiles ... throughout the year for both
 * weekends and weekdays", which is a *setting* of the weekend selector rather
 * than a fact about the schedule writer, and the register's own preset writes
 * it as one — leaving the reader free to disagree, which is the whole point of
 * a preset being an overlay.
 *
 * A closed day is written as a pattern of zeros rather than as `bandSchedule`'s
 * tenth. The tenth exists because a band says nothing about level, so the
 * equipment's standing base gain has nowhere else to live; a pattern carries
 * its own base — 19 W under a 150 W peak is 0.127 in Table E.1's own arithmetic
 * — so a day nobody claims really is zero here. That difference is load
 * bearing downstream: an occupied hour is one standing *above* the floor the
 * applier wrote, which is `occupiedFloor` below.
 */
function patternSchedule(doc, name, hours, params) {
  drop(doc, 'Schedule:Compact', name);
  const schedule = doc.add('Schedule:Compact', name, { schedule_type_limits_name: 'Fraction' });
  const shut = new Array(hours.length).fill(0);
  const rows = ['Through: 12/31'];

  rows.push('For: Weekdays SummerDesignDay WinterDesignDay');
  rows.push(...patternRows(hours));
  // Before `AllOtherDays` for the reason `bandSchedule` gives: the catch-all
  // swallows a holiday unless something claims the day first.
  if (params.holidayUse !== 'AsWeekend') {
    rows.push('For: Holidays');
    rows.push(...patternRows(params.holidayUse === 'Open' ? hours : shut));
  }
  rows.push('For: AllOtherDays');
  rows.push(...patternRows(params.weekend === 'Occupied' ? hours : shut));

  schedule.set('data', rows.map((field) => ({ field })));
  return name;
}

/**
 * The occupancy schedule, named once.
 *
 * Exported for the reason `WINDOW_CONSTRUCTION` is: the criteria read their
 * denominator off this schedule's own value series in the run, so the name is
 * written by an applier here and looked up by a reader elsewhere, and a name
 * repeated in two files is a name that will one day be changed in only one of
 * them.
 */
export const OCCUPANCY_SCHEDULE = 'Occupancy';
const EQUIPMENT_SCHEDULE = 'EquipmentUse';
const LIGHTING_SCHEDULE = 'LightingUse';

/**
 * The value an occupancy schedule has to stand *above* for the hour to count.
 *
 * A property of the schedule that was written, not of the reader, which is why
 * it is answered here and not guessed there. `bandSchedule` writes 0.1 out of
 * hours rather than zero — a building with literally no one in it overnight is
 * a building whose equipment has been unplugged — so a reader testing `> 0`
 * against the desk's own schedule counts every hour of the year as occupied.
 * Measured over a Chicago TMY3 year, 1 May to 30 September: `> 0` gives 3,672
 * hours, which is 153 × 24 and also, exactly, the figure CL:2026 publishes for
 * a bedroom, so the wrong test agrees with a published number for entirely the
 * wrong reason. `> 0.1` gives 1,100, which is 110 weekdays × a ten hour band.
 *
 * A pattern's own unoccupied hours are literally zero, in Table E.2 and in
 * `patternSchedule` above, so the floor moves with the model in force.
 */
export const occupiedFloor = (params) => (params.roomType === AS_DRAWN ? BAND_OFF : 0);

/** 10 — people, light and equipment. */
function applyGains(doc, params, engaged) {
  clear(doc, 'People');
  clear(doc, 'Lights');
  clear(doc, 'ElectricEquipment');
  drop(doc, 'Schedule:Compact', OCCUPANCY_SCHEDULE);
  // Bypass removes, it does not zero, and a return from a named room type to
  // `As drawn` is the same act one control down: the two pattern schedules have
  // to leave the document or the next run carries orphans nothing references.
  // They are dropped unconditionally rather than in the `As drawn` branch so
  // there is one place the sweep happens, which is the arrangement every other
  // applier here keeps.
  drop(doc, 'Schedule:Compact', EQUIPMENT_SCHEDULE);
  drop(doc, 'Schedule:Compact', LIGHTING_SCHEDULE);
  drop(doc, 'Schedule:Constant', 'Activity');
  if (!engaged) return;

  // Two instruments on one strip, and only one of them is ever in the document.
  // `As drawn` is the desk's own model — one band schedule shared by all three
  // loads, a density and a watts per square metre — and it must go on writing
  // exactly what it wrote before this feature existed, because every permalink
  // minted before it omits all six new keys and takes their defaults. That is
  // what keeps `LINK_VERSION` where it is and `MIGRATIONS` empty.
  const drawn = params.roomType === AS_DRAWN;

  if (drawn) {
    bandSchedule(doc, OCCUPANCY_SCHEDULE, 'Fraction', params);
  } else {
    // Three schedules where the desk has one, which is the whole reason a named
    // room type cannot be expressed as settings of the band: TM59's lights run
    // 18:00 to 23:00 whatever the room is doing, and a schedule shared by the
    // people, the lights and the equipment cannot say that at all.
    patternSchedule(doc, OCCUPANCY_SCHEDULE, parsePattern(params.occPattern), params);
    patternSchedule(doc, EQUIPMENT_SCHEDULE, parsePattern(params.equipPattern), params);
    patternSchedule(doc, LIGHTING_SCHEDULE, parsePattern(params.lightPattern), params);
  }

  doc.add('Schedule:Constant', 'Activity', {
    schedule_type_limits_name: 'Any Number',
    hourly_value: params.activity,
  });

  // A density under `As drawn`, a count under a named room type, and that is
  // what lets a standard prescribe the occupancy at all: people per square
  // metre would need the floor area, and Massing is `UNTOUCHABLE` to a preset.
  //
  // The object is written even at zero occupants. It is not a channel being
  // bypassed — Gains is engaged, the room is simply empty — and an empty room
  // is a measurement rather than a missing one. It also carries the adaptive
  // comfort model below, and the Air strip's `requires` only knows whether
  // Gains is in the path, so a `People` withdrawn at zero would fatal the
  // ASHRAE 55 venting rule with nothing on the desk saying why.
  const people = doc.add('People', 'Occupants', {
    zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
    number_of_people_schedule_name: OCCUPANCY_SCHEDULE,
    ...(drawn
      ? { number_of_people_calculation_method: 'Area/Person', floor_area_per_person: params.occupancy }
      : { number_of_people_calculation_method: 'People', number_of_people: params.peopleCount }),
    fraction_radiant: 0.3,
    sensible_heat_fraction: 'Autocalculate',
    activity_level_schedule_name: 'Activity',
  });

  // An adaptive venting rule on the Air strip is answered here, because this is
  // where the occupant it asks about is written. Read off the document rather
  // than off `params.openRule`: `applyAir` runs at 09 and this at 10, so the
  // network's zone object already says which rule was actually written — and a
  // rule that reached no object, on a channel that turned out to be blocked,
  // must not put a comfort model on somebody.
  //
  // It has to be set *here* rather than in `applyAir` for the plainer reason
  // that this applier clears `People` and rewrites it, so anything an earlier
  // one hung on that object would be thrown away every apply.
  const rule = doc.all('AirflowNetwork:MultiZone:Zone').first;
  const comfort = rule ? ADAPTIVE_RULES.get(String(rule.ventilation_control_mode)) : undefined;
  // The comfort model and nothing else. `mean_radiant_temperature_calculation_type`
  // was set here too on the first pass, at `ZoneAveraged` — which is the name
  // that field carried in an older EnergyPlus and is `EnclosureAveraged` in
  // 26.1, so it fatalled on an enum mismatch. It is the field's own default,
  // so the honest fix is to leave it alone: the drift invariant in one line.
  if (comfort) people.thermal_comfort_model_1_type = comfort;

  // Lighting stays a watts per square metre under both models, and is the one
  // load that does. TM59's Table E.1 gives the lights as a density where it
  // gives the people as a count and the equipment as absolute watts, so there
  // is nothing to switch to: what changes is only which schedule the density
  // runs on, and that is the fourth gap — the lights run 18:00 to 23:00 whether
  // or not anybody is in the room.
  if (params.lighting > 0) {
    doc.add('Lights', 'Lighting', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: drawn ? OCCUPANCY_SCHEDULE : LIGHTING_SCHEDULE,
      design_level_calculation_method: 'Watts/Area',
      watts_per_floor_area: params.lighting,
      fraction_radiant: params.lightRadiant,
      fraction_visible: 0.18,
      return_air_fraction: 0,
      fraction_replaceable: 1,
      end_use_subcategory: 'General',
    });
  }

  // Whichever of the two levels is in force is also the one the gate asks
  // about. Left at `params.equipment > 0` this would refuse to write a 450 W
  // absolute load on a desk whose density happened to be zero, and write an
  // object at an equipment peak of nothing — the strip's model switch silently
  // reaching past its own control, which is the same drift `equipLatent`'s
  // `needs` is written around in the declaration.
  if ((drawn ? params.equipment : params.equipPeak) > 0) {
    doc.add('ElectricEquipment', 'Equipment', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: drawn ? OCCUPANCY_SCHEDULE : EQUIPMENT_SCHEDULE,
      ...(drawn
        ? { design_level_calculation_method: 'Watts/Area', watts_per_floor_area: params.equipment }
        : { design_level_calculation_method: 'EquipmentLevel', design_level: params.equipPeak }),
      fraction_latent: params.equipLatent,
      fraction_radiant: 0.3,
      fraction_lost: 0,
    });
  }
}

/** 11 — the sensor that dims the lights against the daylight. */
function applyDaylight(doc, params, engaged, gainsOn) {
  clear(doc, 'Daylighting:Controls');
  clear(doc, 'Daylighting:ReferencePoint');
  // Nothing to dim without a Lights object to dim, so the channel stays out
  // rather than writing a controller that speaks for nothing.
  if (!engaged || !gainsOn || !(params.lighting > 0)) return;

  // Set across the plan from the south wall, then turned with the building —
  // the point is in world coordinates, so it has to follow the box it is in.
  const [sx, sy] = turn(
    [params.width / 2, params.depth * params.dlDepth],
    params.northAxis,
    [params.width / 2, params.depth / 2],
  );
  doc.add('Daylighting:ReferencePoint', 'Sensor', {
    zone_or_space_name: ZONE_NAME,
    x_coordinate_of_reference_point: sx,
    y_coordinate_of_reference_point: sy,
    z_coordinate_of_reference_point: params.dlHeight,
  });

  const controls = doc.add('Daylighting:Controls', 'Daylighting', {
    zone_or_space_name: ZONE_NAME,
    daylighting_method: 'SplitFlux',
    lighting_control_type: params.dlControl,
    minimum_input_power_fraction_for_continuous_or_continuousoff_dimming_control: 0.3,
    minimum_light_output_fraction_for_continuous_or_continuousoff_dimming_control: 0.2,
    number_of_stepped_control_steps: 3,
  });
  controls.set('control_data', [
    {
      daylighting_reference_point_name: 'Sensor',
      fraction_of_lights_controlled_by_reference_point: params.dlFraction,
      illuminance_setpoint_at_reference_point: params.dlSetpoint,
    },
  ]);
}

const NODE = Object.freeze({
  air: `${ZONE_NAME} Air Node`,
  inlet: `${ZONE_NAME} Inlet Node`,
  ret: `${ZONE_NAME} Return Node`,
});

/**
 * 12 — the master bus.
 *
 * Hand-authored rather than left to `HVACTemplate`, so the IDF that runs is the
 * IDF this file wrote: no expansion step stands between what the console says
 * and what the engine reads.
 */
function applySystem(doc, params, engaged, gainsOn) {
  clear(doc, 'ZoneHVAC:IdealLoadsAirSystem');
  clear(doc, 'ZoneHVAC:EquipmentConnections');
  clear(doc, 'ZoneHVAC:EquipmentList');
  clear(doc, 'ZoneControl:Thermostat');
  clear(doc, 'ThermostatSetpoint:DualSetpoint');
  clear(doc, 'ThermostatSetpoint:SingleHeating');
  clear(doc, 'ThermostatSetpoint:SingleCooling');
  clear(doc, 'DesignSpecification:OutdoorAir');
  clear(doc, 'NodeList');
  for (const name of ['Heating Setpoints', 'Cooling Setpoints', 'Control Type', 'System Availability']) {
    drop(doc, 'Schedule:Compact', name);
    drop(doc, 'Schedule:Constant', name);
  }
  if (!engaged) return;

  // Setpoint schedules. With no setback and no occupancy band to hang one on,
  // these are flat — but they are still schedules, so the setback control has
  // somewhere to go the moment it is turned up.
  const setpoints = (name, base, sign) => {
    drop(doc, 'Schedule:Compact', name);
    const schedule = doc.add('Schedule:Compact', name, { schedule_type_limits_name: 'Temperature' });
    const back = base + sign * params.setback;
    const rows = ['Through: 12/31'];
    const day = (occupied) =>
      !occupied || params.setback === 0
        ? ['Until: 24:00', occupied ? base : back]
        : dayRows(params.occFrom, params.occTo, base, back);
    rows.push('For: Weekdays SummerDesignDay WinterDesignDay');
    rows.push(...day(true));
    // Gated on `gainsOn` the same way the weekend row below is: with Gains out
    // of the path there is no occupancy to justify a holiday setback, and a
    // System-only desk should not acquire one.
    if (gainsOn && params.holidayUse !== 'AsWeekend') {
      rows.push('For: Holidays');
      rows.push(...day(params.holidayUse === 'Open'));
    }
    rows.push('For: AllOtherDays');
    rows.push(...day(params.weekend === 'Occupied' && gainsOn));
    schedule.set('data', rows.map((field) => ({ field })));
  };
  // Setback widens the band: heating drops, cooling rises.
  setpoints('Heating Setpoints', params.heatSet, -1);
  setpoints('Cooling Setpoints', params.coolSet, +1);

  // Control type 4 is dual setpoint, 1 is heating only, 2 cooling only — and
  // the number and the setpoint object named beside it are one statement, not
  // two. EnergyPlus resolves the schedule value to a thermostat *type* and then
  // looks for a control of that type in this ZoneControl:Thermostat's own list;
  // a 1 standing over a ThermostatSetpoint:DualSetpoint is not a dual setpoint
  // with its cooling half suppressed, it is a control of a type the zone does
  // not have:
  //
  //   ** Severe  ** Control Type Schedule=CONTROL TYPE
  //   **   ~~~   ** ..specifies 1 (ThermostatSetpoint:SingleHeating) as the
  //                  control type. Not valid for this zone.
  //   **  Fatal  ** Errors getting Zone Control input data.
  //
  // That is a get-input fatal, so it takes the run down before any environment
  // starts, whatever the weather and whatever else the desk is doing — "Heat
  // only" and "Cool only" simply could not be solved. Measured on the Boston
  // 725090 year: both terminated the engine, and both run clean once the
  // matching single-setpoint object is the one the thermostat names.
  const thermostat =
    params.availability === 'HeatingOnly'
      ? {
          controlType: 1,
          type: 'ThermostatSetpoint:SingleHeating',
          name: 'Heating Only Setpoint',
          fields: { setpoint_temperature_schedule_name: 'Heating Setpoints' },
        }
      : params.availability === 'CoolingOnly'
        ? {
            controlType: 2,
            type: 'ThermostatSetpoint:SingleCooling',
            name: 'Cooling Only Setpoint',
            fields: { setpoint_temperature_schedule_name: 'Cooling Setpoints' },
          }
        : {
            controlType: 4,
            type: 'ThermostatSetpoint:DualSetpoint',
            name: 'Setpoints',
            fields: {
              heating_setpoint_temperature_schedule_name: 'Heating Setpoints',
              cooling_setpoint_temperature_schedule_name: 'Cooling Setpoints',
            },
          };

  doc.add(thermostat.type, thermostat.name, thermostat.fields);

  drop(doc, 'Schedule:Constant', 'Control Type');
  doc.add('Schedule:Constant', 'Control Type', {
    schedule_type_limits_name: 'Control Type',
    hourly_value: thermostat.controlType,
  });

  doc.add('ZoneControl:Thermostat', 'Thermostat', {
    zone_or_zonelist_name: ZONE_NAME,
    control_type_schedule_name: 'Control Type',
    control_1_object_type: thermostat.type,
    control_1_name: thermostat.name,
  });

  // Availability. "Occupied" only means anything once there is an occupancy
  // band to follow, so it falls back to the plant being on — stated here rather
  // than silently, because the strip greys the control when Gains is out.
  const availability =
    params.availability === 'Occupied' && gainsOn
      ? bandSchedule(doc, 'System Availability', 'On/Off', params, { on: 1, off: 0 })
      : 'AlwaysOn';

  const ideal = {
    availability_schedule_name: availability,
    zone_supply_air_node_name: NODE.inlet,
    maximum_heating_supply_air_temperature: params.supplyMaxT,
    minimum_cooling_supply_air_temperature: params.supplyMinT,
    heating_limit: 'NoLimit',
    cooling_limit: 'NoLimit',
    dehumidification_control_type: params.humidity === 'None' ? 'None' : params.humidity,
    cooling_sensible_heat_ratio: 0.7,
    humidification_control_type: 'None',
  };

  if (params.outdoorAir > 0) {
    doc.add('DesignSpecification:OutdoorAir', 'Outdoor Air', {
      outdoor_air_method: 'Flow/Person',
      // The console is lettered in litres per second per person, which is how
      // an architect reads a ventilation rate; EnergyPlus wants m³/s.
      outdoor_air_flow_per_person: params.outdoorAir / 1000,
    });
    ideal.design_specification_outdoor_air_object_name = 'Outdoor Air';
    ideal.outdoor_air_economizer_type = params.economizer;
    if (params.economizer !== 'NoEconomizer') {
      // EnergyPlus refuses an economizer with no ceiling on the cooling air
      // flow — it is a severe error, not a warning. Nothing here is autosized
      // (the console does not run a sizing pass), so the ceiling is set from
      // the zone's own volume at 20 air changes: far above anything a shoebox
      // will ask for, so it bounds the economizer without shaping the result.
      ideal.cooling_limit = 'LimitFlowRate';
      ideal.maximum_cooling_air_flow_rate =
        (params.width * params.depth * params.height * 20) / 3600;
    }
    if (params.heatRecovery > 0) {
      ideal.heat_recovery_type = 'Sensible';
      ideal.sensible_heat_recovery_effectiveness = params.heatRecovery;
    }
  }

  doc.add('ZoneHVAC:IdealLoadsAirSystem', 'Ideal Loads', ideal);

  const list = doc.add('ZoneHVAC:EquipmentList', 'Zone Equipment', {
    load_distribution_scheme: 'SequentialLoad',
  });
  list.set('equipment', [
    {
      zone_equipment_object_type: 'ZoneHVAC:IdealLoadsAirSystem',
      zone_equipment_name: 'Ideal Loads',
      zone_equipment_cooling_sequence: 1,
      zone_equipment_heating_or_no_load_sequence: 1,
    },
  ]);

  doc.add('ZoneHVAC:EquipmentConnections', null, {
    zone_name: ZONE_NAME,
    zone_conditioning_equipment_list_name: 'Zone Equipment',
    zone_air_inlet_node_or_nodelist_name: NODE.inlet,
    zone_air_node_name: NODE.air,
    zone_return_air_node_or_nodelist_name: NODE.ret,
  });
}

/**
 * 13 — the site around the building, after dark.
 *
 * The stock example's grounds lighting, put behind a strip. On the astronomical
 * clock the schedule is a formality -- the engine switches the load by sun
 * position -- but the field is required, and `AlwaysOn` is the honest value for
 * a load whose only controller is the sky. Its meter follows the channel
 * through `syncEndUseMeters` like heating and cooling follow System, so a
 * bypassed strip leaves neither the object nor a request the engine would
 * report as unproducible.
 */
function applyGrounds(doc, params, engaged) {
  drop(doc, 'Exterior:Lights', 'ExtLights');
  if (!engaged) return;

  doc.add('Exterior:Lights', 'ExtLights', {
    schedule_name: 'AlwaysOn',
    // The console letters kilowatts, because 5.25 kW reads as the car park it
    // is; the engine wants watts.
    design_level: params.extLights * 1000,
    control_option: params.extControl,
    end_use_subcategory: 'Grounds Lights',
  });
}

/** 16 — the engine room. */
function applySolver(doc, params) {
  must(doc, 'Timestep').number_of_timesteps_per_hour = params.timestep;
  must(doc, 'SurfaceConvectionAlgorithm:Inside').algorithm = params.insideConv;
  must(doc, 'SurfaceConvectionAlgorithm:Outside').algorithm = params.outsideConv;

  const shadow = must(doc, 'ShadowCalculation');
  shadow.shading_calculation_update_frequency = params.shadowFreq;
  shadow.sky_diffuse_modeling_algorithm = params.skyDiffuse;

  const building = must(doc, 'Building');
  building.minimum_number_of_warmup_days = params.warmupMin;
  building.maximum_number_of_warmup_days = Math.max(params.warmupMax, params.warmupMin);
  building.loads_convergence_tolerance_value = params.loadsTol;
  building.temperature_convergence_tolerance_value = params.tempTol;
}

/**
 * 17 — what actually gets simulated.
 *
 * One `RunPeriod` per unbroken group of months, which is how EnergyPlus is
 * asked for a year with holes in it: the engine runs each as its own
 * environment, the meters accumulate through all of them, and everything this
 * sheet reads is already per environment. The objects are cleared and rewritten
 * rather than edited in place, for the reason the reporting reconciler is:
 * `applyModel` runs on every parameter change, so the count has to be free to
 * fall as well as rise, and a differential update would leave last gesture's
 * fourth period in the document when this one has three.
 *
 * A single all-year mask still writes exactly the `Run Period 1` the baseline
 * document carried, so the default desk serialises byte for byte as it did.
 */
function applyRun(doc, params) {
  // Both types are cleared and rewritten whole. The special days are not tied
  // to any one period — they are the calendar the whole run keeps — so they are
  // written once, while the holiday *fields* belong to each period and are
  // written on every one of them.
  clear(doc, 'RunPeriod');
  clear(doc, 'RunPeriodControl:SpecialDays');

  monthSpans(params.months).forEach(({ from, to }, i) => {
    doc.add('RunPeriod', `Run Period ${i + 1}`, {
      begin_month: from,
      begin_day_of_month: 1,
      end_month: to,
      end_day_of_month: DAYS_IN_MONTH[to - 1],
      // `day_of_week_for_start_day` is deliberately absent. Pinned to Tuesday
      // it overrode what the weather file says about itself — every TMYx
      // declares `DATA PERIODS,1,1,Data,Sunday,1/ 1,12/31` — and put the run on
      // an invented calendar, in which the third Monday of January fell on the
      // 21st. Left empty, EnergyPlus takes the file's own start day and picks a
      // real non-leap year to match it (2017 for a Sunday), so every date lands
      // where it belongs and the weekend holiday rule is about a real weekend.
      //
      // It matters more here than it would have with one period. The field
      // anchors to *this period's* begin date, so pinning it would start every
      // span on the same weekday and put a January and a July on two different
      // calendars. Empty, they share the year's: measured, a June-to-August
      // period reports 1 June as a Thursday, which is what 1 June 2017 was.
      //
      // The two holiday sources are independent fields, and the strip's three
      // states are the three combinations that mean anything. `Listed` has to
      // turn the file's days off, because where both are present the weather
      // file's specification takes precedence and the listed days would lose
      // silently.
      use_weather_file_holidays_and_special_days: params.holidays === 'Yes' ? 'Yes' : 'No',
      use_weather_file_daylight_saving_period: params.dst,
      apply_weekend_holiday_rule: params.holidayRule,
      use_weather_file_rain_indicators: 'Yes',
      use_weather_file_snow_indicators: 'Yes',
    });
  });

  if (params.holidays !== 'No') {
    for (const day of parseHolidays(params.holidayDays)) {
      // All four fields written out: the schema carries `min_fields: 4`, so
      // leaning on the duration and type defaults would produce an object the
      // engine reads as incomplete.
      doc.add('RunPeriodControl:SpecialDays', day.name, {
        start_date: day.startDate(),
        duration: day.duration,
        special_day_type: 'Holiday',
      });
    }
  }

  must(doc, 'SimulationControl').run_simulation_for_sizing_periods = params.sizingPeriods;
}

/** Every type the reporting reconciler owns — no other author may add these. */
const REPORTING_TYPES = [
  'Output:Diagnostics',
  'Output:Variable',
  'Output:VariableDictionary',
  'Output:Surfaces:Drawing',
  'Output:Constructions',
  'Output:Meter:MeterFileOnly',
  'OutputControl:Table:Style',
  'Output:Table:SummaryReports',
  'Output:Meter',
];

/**
 * The occupancy schedule's own value series, hour by hour.
 *
 * This is the denominator every overheating share is taken over, and it is
 * requested rather than recomputed for a reason that would have cost a silent
 * wrong answer: evaluating the `Schedule:Compact` in JavaScript means
 * reimplementing EnergyPlus's own day-type dispatch, since which branch an hour
 * takes depends on the calendar the engine picked for the weather file — and
 * `RunPeriod.day_of_week_for_start_day` is deliberately left empty here so that
 * calendar is the file's, not ours. A second implementation of somebody else's
 * dispatch is exactly the drift Principle III forbids, and it would fail
 * quietly.
 *
 * It is affordable because it is **schedule-level, not per-surface**. Measured
 * A/B interleaved on an annual Chicago TMY3 run under EnergyPlus 26.1.0: 484 ms
 * against 473 ms, which is inside the run-to-run noise of 455 to 601 ms, and
 * the .eso grows 2,276,091 to 2,346,213 bytes — **+3.1 %**. The per-surface
 * request this page learned its lesson from added 158 series and took the same
 * run from 681 ms to 2,984 ms. One series against fifteen is not that.
 *
 * Gated on the schedule actually being in the document, on the same terms as
 * the pressure network's series below and for the same reason: EnergyPlus lists
 * every variable it could not produce at the end of the error file, and the
 * title block counts those warnings. Asked through `holds` because this is a
 * *new* question about a type the document may not yet carry, and merely asking
 * would register it here — at the foot of the file, where this reconciler runs
 * — moving every schedule a later apply writes.
 */
function addOccupancyValue(doc) {
  if (!holds(doc, 'Schedule:Compact')) return;
  if (!doc.get('Schedule:Compact', OCCUPANCY_SCHEDULE)) return;
  addVariable(doc, 'Schedule Value', 'Hourly', OCCUPANCY_SCHEDULE);
}

/**
 * Ask for exactly what the run's reader will read, and nothing else.
 *
 * Two rules meet here. The first is the old one: a bypassed channel is out of
 * the model, and that has to include its reporting — EnergyPlus lists every
 * requested variable it could not produce at the end of the error file, and a
 * desk with half its strips out would inflate the warning count on the title
 * block with warnings about itself.
 *
 * The second is why this takes a profile. A sweep sample is read for one
 * hourly series (`'extremes'`), that series plus four monthly meters
 * (`'energy'`), or the three an overheating criterion needs (`'tm59'`), yet it
 * used to carry the sheet's whole apparatus — the AllSummary tables, a DXF
 * drawing, a constructions report, the dictionary, fifteen-odd series — all
 * computed, written, parsed and cloned per sample, then discarded. Output
 * volume is the knob that has already moved this app's run time four-fold once
 * (15 → 173 series took the annual run from 681 ms to 2,984 ms, almost all of
 * it after the simulation finished), so a study turns it the other way. The profile is a mode of `applyModel` rather than a
 * post-pass because this reconciler runs on every apply and would quietly put
 * back whatever a post-pass had stripped.
 *
 * Every owned type is cleared and rewritten on every apply. A differential
 * update would preserve whatever insertion order history happened to leave,
 * and "lean then sheet" would serialize differently from "always sheet" —
 * breaking the byte-identical restore the sweep depends on. Rewriting is a
 * few dozen small objects per apply; determinism is worth more.
 *
 * The end-use meters are Monthly, deliberately, twice over: twelve values per
 * meter is enough to total a bill, and Monthly is the one frequency whose
 * dictionary line survives `parseMTR` at all — an hourly meter's three-field
 * line falls below the parser's minimum and is dropped (see `bill.js`).
 */
function syncReporting(doc, state, reporting) {
  for (const type of REPORTING_TYPES) {
    for (const object of doc.all(type).toArray()) doc.remove(object);
  }

  const addMeter = (use) =>
    doc.add('Output:Meter', null, { key_name: use.meter, reporting_frequency: 'Monthly' });
  const producible = (use) => !use.needs || state.get(use.needs)?.engaged;

  if (reporting === 'extremes' || reporting === 'energy') {
    // The one series both study readers open with: `zoneRuns` needs the hourly
    // zone temperature even when the reading itself is meters.
    addVariable(doc, 'Zone Mean Air Temperature', 'Hourly');
    if (reporting === 'energy') {
      // Only the building group — `readDemand` bills nothing else — and still
      // gated per channel: the metric implies System is engaged, but Gains may
      // be out, and its meters must leave with it.
      for (const use of END_USES) {
        if (use.group === 'building' && producible(use)) addMeter(use);
      }
    }
    return;
  }
  if (reporting === 'tm59') {
    // Three series against the sheet's fifteen, and every one of them is read.
    // `zoneRuns` splits the run into environments off the zone air temperature,
    // so a sample that only wanted operative temperature would have no way to
    // tell one environment from the next; the criteria themselves are read off
    // `Zone Operative Temperature`, never off air temperature, which is a
    // different question by several degrees on a desk with heavy solar gain and
    // a cold slab; and the schedule series is the denominator.
    addVariable(doc, 'Zone Mean Air Temperature', 'Hourly');
    addVariable(doc, 'Zone Operative Temperature', 'Hourly');
    addOccupancyValue(doc);
    return;
  }
  if (reporting !== 'sheet') throw new Error(`unknown reporting profile "${reporting}"`);

  const diagnostics = doc.add('Output:Diagnostics', null);
  diagnostics.extensible.push({ key: 'DisplayAdvancedReportVariables' });

  for (const name of VARIABLES_HOURLY) addVariable(doc, name, 'Hourly');
  for (const name of VARIABLES_DAILY) addVariable(doc, name, 'Daily');
  doc.add('Output:Variable', null, {
    key_value: ZONE_NAME,
    variable_name: 'Zone Wetbulb Globe Temperature',
    reporting_frequency: 'Hourly',
  });
  addOccupancyValue(doc);
  for (const name of VARIABLES_MONTHLY) addVariable(doc, name, 'Monthly');

  // The engaged channels' balance-rail terms, deduplicated in channel order.
  const base = new Set([...VARIABLES_HOURLY, ...VARIABLES_DAILY, ...VARIABLES_MONTHLY, 'Zone Wetbulb Globe Temperature']);
  const wanted = new Set();
  for (const channel of CHANNELS) {
    if (!state.get(channel.id).engaged || !channel.meter) continue;
    for (const term of channel.meter.terms) wanted.add(term.variable);
  }
  for (const name of wanted) {
    if (!base.has(name)) addVariable(doc, name, 'Hourly');
  }

  // What the pressure network moved, where there is one. Asked of the document
  // rather than of `params` and the channel state, because `applyAir` has
  // already run by the time this does and the document is the record of what it
  // decided — one question covers the model in force, the channel being patched
  // out, and the channel being blocked by its own `requires`.
  //
  // The gate is not optional: without it EnergyPlus lists every unproducible
  // variable at the end of the error file and inflates the warning count the
  // title block reports, which is the reason the rail terms and the end-use
  // meters are gated already.
  if (holds(doc, 'AirflowNetwork:SimulationControl') && doc.all('AirflowNetwork:SimulationControl').size) {
    // The rate is the sum of these two and neither is optional: "infiltration"
    // is the engine's word for "through a crack", not for the infiltration of
    // this building. Measured on the stock desk with a south opening, 0.0007
    // and 0.684 ACH — reading either alone letters a number three orders of
    // magnitude out, under a label claiming the whole building.
    addVariable(doc, 'AFN Zone Infiltration Air Change Rate', 'Hourly', ZONE_NAME);
    addVariable(doc, 'AFN Zone Ventilation Air Change Rate', 'Hourly', ZONE_NAME);
    // The hours the openings actually stood open, which is the only variable
    // the engine publishes for that reading. The key `*` is safe here and is
    // the exception that proves the rule: the warning about per-surface
    // variables is about a request across 158 surfaces, which took an annual
    // run from 681 ms to 2,984 ms. This one resolves to one series per openable
    // *window*, at most four on this desk.
    if (doc.all('AirflowNetwork:MultiZone:Component:SimpleOpening').size) {
      addVariable(doc, 'AFN Surface Venting Window or Door Opening Factor', 'Hourly');
    }
  }

  doc.add('Output:VariableDictionary', null, { key_field: 'IDF' });
  doc.add('Output:Surfaces:Drawing', null, { report_type: 'DXF:WireFrame' });
  doc.add('Output:Constructions', null, { details_type_1: 'Constructions' });

  // The stock example also requests three hourly `Output:Meter:MeterFileOnly`
  // meters. They are not carried: MeterFileOnly writes only to the .mtr, a
  // file nothing on this page parses -- the bill reads its meters off the
  // .eso -- and one of the three was the grounds lighting, whose object now
  // comes and goes with its channel and must not leave a request behind.

  doc.add('OutputControl:Table:Style', null, { column_separator: 'All' });
  const summary = doc.add('Output:Table:SummaryReports', null);
  summary.extensible.push({ report_name: 'AllSummary' });

  for (const use of END_USES) {
    if (producible(use)) addMeter(use);
  }
}

/* ══ reading the model back ══════════════════════════════════════════════ */

/** Area of a planar polygon, via the magnitude of its Newell normal. */
function polygonArea(verts) {
  let [nx, ny, nz] = [0, 0, 0];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

/** Extent of a vertex list along one axis. */
const span = (verts, axis) =>
  Math.max(...verts.map((v) => v[axis])) - Math.min(...verts.map((v) => v[axis]));

/**
 * How far a shade stands off the plane of the wall that hosts it.
 *
 * Taken along the wall's own outward normal in plan rather than along x or y,
 * so it reads the same whichever way the building has been turned.
 */
function reachOff(wallVerts, shadeVerts) {
  // The wall's bottom edge, from its lower-left to its lower-right corner.
  const [a, b] = [wallVerts[1], wallVerts[2]];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(length > 0)) return 0;
  const n = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  const offs = shadeVerts.map((v) => (v[0] - a[0]) * n[0] + (v[1] - a[1]) * n[1]);
  return Math.max(...offs) - Math.min(...offs);
}

/** A wall's length, taken along its own bottom edge rather than along x or y. */
const edgeLength = (verts) => Math.hypot(verts[2][0] - verts[1][0], verts[2][1] - verts[1][1]);

/**
 * Which way a wall looks, in degrees clockwise from north.
 *
 * The outward normal in plan, from the same bottom edge `reachOff` measures
 * against, so it carries whatever `turn()` did to the vertices. World
 * coordinates put north at +y, which is what makes this a compass bearing
 * rather than a number about the model's axes.
 */
const bearingOf = (verts) => {
  const length = edgeLength(verts);
  if (!(length > 0)) return NaN;
  const [a, b] = [verts[1], verts[2]];
  const n = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  return ((Math.atan2(n[0], n[1]) * 180) / Math.PI + 360) % 360;
};

/**
 * Quantities an architect gets without running anything, summed off the
 * surfaces so they follow any geometry the model actually holds.
 *
 * `exposed` counts only surfaces losing heat to outdoors, so bypassing Fabric
 * — which sends every wall adiabatic — correctly reports no exposed envelope
 * at all rather than flattering the compactness.
 *
 * Two floor areas, because the desk can ask for more than one storey.
 * `floor` is the polygon the axonometric draws; `grossFloor` is the building
 * the engine actually simulated, which is that polygon times the zone
 * multiplier. Everything that divides *by* an area wants the second: a
 * multiplier of 3 puts three identical floors on the model and EnergyPlus
 * multiplies every meter by it, so an intensity over the drawn polygon alone
 * reported three times what the building really asks — the same trap the
 * balance rail's `Term.perBuilding` exists to spring, one section along.
 *
 * The multiplier is read off the `Zone` object rather than out of `params`,
 * by the rule the whole sheet is built on: `buildSample` hands this function
 * a document carrying a sweep's overlay, and a fact taken from live
 * parameters would describe the desk instead of the sample.
 */
export function geometryFacts(doc) {
  const surfaces = surfaceGeometry(doc);
  const zs = surfaces.flatMap((s) => s.verts.map((v) => v[2]));
  const height = Math.max(...zs) - Math.min(...zs);
  const area = (list) => list.reduce((total, s) => total + polygonArea(s.verts), 0);

  const storeys = Number(must(doc, 'Zone', ZONE_NAME).multiplier) || 1;
  const floor = area(surfaces.filter((s) => s.type === 'floor'));
  const exposed = area(surfaces.filter((s) => s.boundary === 'outdoors'));
  const volume = floor * height;

  // Openings are sorted by the surface they are cut into, not by their names.
  // Summed together they would report a rooflight as wall glazing and put the
  // roof's area into the window-to-wall ratio's numerator over the walls'
  // denominator, which is a number about no part of the building.
  const hostType = new Map(surfaces.map((s) => [s.name, s.type]));
  const windows = windowGeometry(doc);
  const roofLights = windows.filter((w) => hostType.get(w.host) === 'roof');
  const glazing = area(windows.filter((w) => hostType.get(w.host) === 'wall'));
  const walls = surfaces.filter((s) => s.type === 'wall');
  // Over the walls that have an outside, which is the area a window-to-wall
  // ratio has always been measured against: an adiabatic wall is a party wall,
  // it is not part of anyone's exterior envelope, and it can carry no opening
  // here for the reason `opensOutdoors` sets out. Left in the denominator it
  // would report a ratio no setting of the sliders could ever reach — three
  // walls glazed to 1.0 against four walls of denominator reads 0.75 — and
  // that is a number about no part of the building.
  const wallArea = area(walls.filter((s) => s.boundary === 'outdoors'));
  const wwr = wallArea > 0 ? glazing / wallArea : NaN;

  // Against the gross roof, which is what a skylight-to-roof ratio is measured
  // over: the rooflights are subsurfaces and the roof polygon still holds the
  // area they sit in.
  const roofGlazing = area(roofLights);
  const roofArea = area(surfaces.filter((s) => s.type === 'roof' && s.boundary === 'outdoors'));
  const srr = roofArea > 0 ? roofGlazing / roofArea : NaN;

  // How far a shade reaches off the wall plane, and that reach against the
  // height of the opening beneath it — the projection factor an architect sizes
  // a shade by. Measured perpendicular to the host wall rather than along a
  // fixed axis, so it stays true once the building is turned.
  // The zone's shades divide by what hosts them: an overhang or a fin stands on
  // a wall, a curb stands on the roof. They are two channels' readings and
  // summing them would have the Shading strip report an upstand it does not own.
  const shades = shadeGeometry(doc);
  const wallNames = new Set(WALLS.map((w) => w.name));
  const zoneShades = shades.filter((s) => !s.context && wallNames.has(s.host));
  const curbs = shades.filter((s) => !s.context && !wallNames.has(s.host));

  // The same quantities again, wall by wall, because a sentence about this
  // building has to say which face carries the glass and which way that face
  // is looking — the ratio above is four walls summed and is true of none of
  // them. Read here rather than at the call site for the reason the gross
  // areas are: a second reader of the same surfaces is a second place for the
  // window-to-wall ratio to be computed differently.
  const byName = new Map(surfaces.map((s) => [s.name, s]));
  const glassOn = new Map();
  for (const w of windows) glassOn.set(w.host, (glassOn.get(w.host) ?? 0) + polygonArea(w.verts));
  const faces = WALLS.map((wall) => {
    const surface = byName.get(wall.name);
    if (!surface) return null;
    // The overhang is the flat one. A wall carries up to three shades and the
    // overhang is written first, so taking the first shade on the wall read a
    // *fin's* depth as an overhang on any elevation that had fins and no
    // overhang — the quantities panel has been reporting "Overhang, south
    // 0.40 m · PF 0.29" for a wall with nothing over its head. An overhang
    // sits at one height and a fin runs from sill to head, so the geometry
    // says which is which without either of them having to be named.
    const shade = zoneShades.find((s) => s.host === wall.name && span(s.verts, 2) < 1e-6);
    const opening = windows.find((w) => w.host === wall.name);
    const reach = shade ? reachOff(surface.verts, shade.verts) : 0;
    const head = opening ? span(opening.verts, 2) : 0;
    const face = area([surface]);
    const glass = glassOn.get(wall.name) ?? 0;
    return {
      side: wall.side,
      label: wall.label,
      length: edgeLength(surface.verts),
      area: face,
      // Read off the surface rather than off the boundary key, for the same
      // reason the bearing is read off the normal: what the document holds is
      // what the engine was handed, and an adiabatic wall is a party wall
      // rather than a blank one — a distinction a sentence about this
      // building has to be able to make.
      boundary: surface.boundary,
      glazing: glass,
      ratio: face > 0 ? glass / face : NaN,
      // Off the vertices, so it is the way this wall is really looking rather
      // than the compass point its plan key is named after. `turn()` puts the
      // orientation into the geometry and leaves every name where it was, so
      // on a building turned 40° the wall called south faces south-east — and
      // a description that read the name instead of the normal would say the
      // one thing about this desk that is flatly untrue.
      bearing: bearingOf(surface.verts),
      overhang: reach,
      projection: reach > 0 && head > 0 ? reach / head : NaN,
    };
  }).filter(Boolean);

  // The other two surfaces' boundaries, so a reader of these facts can tell a
  // slab on ground from a floating one and a party roof from an exposed one
  // without going back to the document for it.
  const roofFace = surfaces.find((s) => s.type === 'roof');
  const floorFace = surfaces.find((s) => s.type === 'floor');

  const southFace = faces.find((f) => f.side === 'south');
  const overhang = southFace?.overhang ?? 0;
  const projection = southFace?.projection ?? NaN;

  return {
    // Per storey, which is what the drawing shows and what the dimension
    // lines measure.
    floor,
    exposed,
    volume,
    // And the whole building the engine was handed — every area and volume
    // of it, because a page that reported some of them per storey and some
    // per building would be asking the reader to know which. Reported here
    // rather than multiplied at each call site, because "the meters are
    // multiplied and the area is not" is precisely the bug this set exists to
    // close, and a call site is where it would be reopened.
    //
    // The ratios above take no multiplier and must not be given one: every
    // term in them scales by the same n, so window-to-wall, skylight-to-roof
    // and envelope-to-volume are what they were.
    storeys,
    grossFloor: floor * storeys,
    grossExposed: exposed * storeys,
    grossVolume: volume * storeys,
    grossGlazing: glazing * storeys,
    grossRoofGlazing: roofGlazing * storeys,
    grossShadeArea: area(zoneShades) * storeys,
    glazing,
    wwr,
    roofGlazing,
    srr,
    overhang,
    projection,
    shadeArea: area(zoneShades),
    curbArea: area(curbs),
    // The box itself, as the drawing's dimension lines take it: the two plan
    // edges off the walls' own bottom edges rather than off a bounding box,
    // which is 21.55 m across for a 15.24 m square turned 45°.
    height,
    faces,
    roofBoundary: roofFace?.boundary ?? null,
    floorBoundary: floorFace?.boundary ?? null,
    contextArea: area(shades.filter((s) => s.context)),
    // Left per storey deliberately, and it needs no multiplier: stacking n
    // identical zones multiplies the exposed envelope and the volume by the
    // same n, so the ratio is what it was. Only the quantities that are not
    // ratios have to be told about the multiplier.
    compactness: volume > 0 ? exposed / volume : NaN,
  };
}

/** Window vertices, for the axonometric and the glazing area. */
export function windowGeometry(doc) {
  return doc.all('FenestrationSurface:Detailed').map((window) => ({
    name: window.name,
    host: String(window.building_surface_name),
    verts: [1, 2, 3, 4].map((i) => [
      Number(window.get(`vertex_${i}_x_coordinate`)),
      Number(window.get(`vertex_${i}_y_coordinate`)),
      Number(window.get(`vertex_${i}_z_coordinate`)),
    ]),
  }));
}

/** Shading vertices, for the axonometric and the projection factor. */
export function shadeGeometry(doc) {
  const zone = doc.all('Shading:Zone:Detailed').map((shade) => ({
    name: shade.name,
    host: String(shade.base_surface_name),
    context: false,
    verts: shade.extensible.map((v) => [
      Number(v.vertex_x_coordinate),
      Number(v.vertex_y_coordinate),
      Number(v.vertex_z_coordinate),
    ]),
  }));
  const site = doc.all('Shading:Site:Detailed').map((shade) => ({
    name: shade.name,
    host: null,
    context: true,
    verts: shade.extensible.map((v) => [
      Number(v.vertex_x_coordinate),
      Number(v.vertex_y_coordinate),
      Number(v.vertex_z_coordinate),
    ]),
  }));
  return [...zone, ...site];
}

/**
 * One design day this sheet is willing to be sized against.
 *
 * onebuilding names a design day `<site> Ann Clg 1% Condns DB=>MWB`: the season,
 * the severity, and the humidity basis the dry bulb was drawn against. Which of
 * those it publishes depends on what the station recorded -- a site with no
 * wetbulb record gets no `DB=>MWB` family at all -- so the sheet has to state
 * which ones it will accept, in what order, rather than name one and improvise.
 */
class DesignDayWanted {
  constructor({ suffix, dayType, label, note }) {
    this.suffix = suffix;
    this.dayType = dayType;
    this.label = label;
    this.note = note;
    Object.freeze(this);
  }

  /** Whether a design day in a DDY is this one. Name and season must agree. */
  holds(day) {
    const name = String(day.name);
    return (
      name.toLowerCase().endsWith(this.suffix.toLowerCase()) &&
      String(day.day_type) === this.dayType
    );
  }
}

/**
 * The design days, most wanted first. The first one published whose numbers
 * parse is the one the station is sized against.
 *
 * Two rules decide this list, and both were forced by measurement over 120
 * sampled sites:
 *
 * **The severity never moves.** The sheet has always said 99% heating and 1%
 * cooling, so only the humidity basis is allowed to vary. Falling back from 1%
 * to .4% would change what the number means rather than how its dry bulb was
 * derived, and the reader would be sized against a severity nobody asked for.
 * That is what used to happen: with no candidate list, the reader took the
 * first `SummerDesignDay` in the file, which for 39 sites in 120 is the .4%
 * dewpoint day, lettered on the plate as `1% clg db`.
 *
 * **Annual only, never monthly.** A DDY carries twelve monthly design days
 * after its annual ones, and taking one of those is how station 994971
 * (Boston) sized a New England summer against 16.6 °C on 21 January. That site
 * publishes no annual cooling day whatsoever, and the monthly day it fell to
 * carries the text `N` where onebuilding had no number, which EnergyPlus
 * rejects outright:
 *
 *     ** Severe ** <root>[SizingPeriod:DesignDay][Boston January .4% Condns
 *                  DB=>MCWB][wetbulb_or_dewpoint_at_maximum_dry_bulb]
 *                  - Value type "string" for input "N" not permitted by
 *                    'type' constraint.
 *     **  Fatal ** Errors occurred on processing input file.
 *
 * That fatal is why the pair is now checked rather than assumed, and why a
 * month name in a suffix throws at module load below.
 *
 * The list is names, and names are a convention rather than a structure:
 * `SizingPeriod:DesignDay` carries no field saying whether a day is annual or
 * monthly, so the only signal is that onebuilding writes `Ann Htg` and
 * `Ann Clg`. That is safe here because every archive the picker can reach comes
 * from onebuilding -- the heating name was found in 120 of 120 sites sampled --
 * and it would stop being safe the day this page accepts a DDY from anywhere
 * else.
 */
const DESIGN_DAYS = {
  heating: [
    { suffix: 'Ann Htg 99% Condns DB', label: '99% htg db', note: 'dry-bulb basis' },
    {
      suffix: 'Ann Htg 99.6% Condns DB',
      label: '99.6% htg db',
      note: 'the 99.6% day: this station publishes no 99% heating condition',
    },
  ],
  cooling: [
    { suffix: 'Ann Clg 1% Condns DB=>MWB', label: '1% clg db', note: 'dry-bulb basis' },
    {
      suffix: 'Ann Clg 1% Condns WB=>MDB',
      label: '1% clg wb',
      note: 'wetbulb basis: this station publishes no coincident-wetbulb dry-bulb day',
    },
    {
      suffix: 'Ann Clg 1% Condns DP=>MDB',
      label: '1% clg dp',
      note: 'dewpoint basis: this station publishes no wetbulb record',
    },
    {
      suffix: 'Ann Clg 1% Condns Enth=>MDB',
      label: '1% clg enth',
      note: 'enthalpy basis: this station publishes no wetbulb or dewpoint record',
    },
  ],
};

const MONTHS_IN_A_NAME =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

/**
 * The declaration, checked at module load in the way `readLandmarks` checks its
 * own. Five rules, and the last two are the ones that would otherwise fail
 * silently: an empty list refuses every station on the planet while looking
 * like a list, and a month in a suffix reopens the exact fatal this exists to
 * close.
 *
 * Exported so the harness drives the real checker rather than a copy of it,
 * for the same reason `readings.js` is DOM-free.
 */
export function readDesignDays(declared) {
  const seasons = { heating: 'WinterDesignDay', cooling: 'SummerDesignDay' };
  const seen = new Set();
  const read = {};
  for (const [season, dayType] of Object.entries(seasons)) {
    const list = declared[season];
    if (!Array.isArray(list) || !list.length)
      throw new Error(`DESIGN_DAYS.${season} is empty: a station could never be sized`);
    read[season] = list.map((entry) => {
      if (seen.has(entry.suffix))
        throw new Error(`DESIGN_DAYS names ${entry.suffix} twice`);
      seen.add(entry.suffix);
      if (!entry.label) throw new Error(`${entry.suffix} carries no label for the plate`);
      if (!entry.note) throw new Error(`${entry.suffix} carries no note saying what it is`);
      if (MONTHS_IN_A_NAME.test(entry.suffix))
        throw new Error(
          `${entry.suffix} names a month: a monthly design day is never an annual sizing condition`
        );
      return new DesignDayWanted({ ...entry, dayType });
    });
  }
  return Object.freeze(read);
}

const WANTED = readDesignDays(DESIGN_DAYS);

/** Every design day the sheet will accept, either season, for the labeller. */
const EVERY_WANTED = [...WANTED.heating, ...WANTED.cooling];

/**
 * The fields a design day must hold a number in, read off the schema rather
 * than listed here.
 *
 * onebuilding writes the literal text `N` into a numeric field where it had no
 * value to publish, and nothing upstream catches it: `parseIdf` carries `"N"`
 * through as a string under `strict: true` as readily as under `strict: false`,
 * and the document parses clean. The engine is the first thing to object, by
 * which point the run is dead. So the check is here, and it asks the schema
 * which fields are numeric instead of restating a list that would go stale the
 * next time EnergyPlus adds one -- the same drift that made
 * `watts_per_zone_floor_area` wrong.
 *
 * An empty field is not a bad value. It means the object declined an optional
 * field and EnergyPlus will supply its own default.
 */
function unreadableNumber(object, schema, type) {
  for (const [field, value] of Object.entries(object.toJSON())) {
    if (value === '' || value == null) continue;
    let spec;
    try {
      spec = schema.field(type, field);
    } catch {
      continue; // a field this schema version does not know is not ours to judge
    }
    if (spec?.t !== 'n') continue;
    if (!Number.isFinite(Number(value))) return field;
  }
  return null;
}

/**
 * A station's design conditions, read out of the DDY that ships beside its EPW.
 *
 * Parsed non-strictly on purpose: a DDY carries object types this model has no
 * use for, so an unknown one is skipped rather than thrown. What is not
 * tolerated is coming out the other side without the pair, which throws — the
 * caller has a station to refuse, and no business running one city's year
 * against another city's design conditions.
 *
 * The pair is chosen through `WANTED` above, in declared order, and every
 * candidate has to survive `unreadableNumber` before it is taken. A station
 * that publishes a day the sheet wants but cannot read is not the same failure
 * as one that publishes no such day at all, and the two say so differently,
 * because they are different things for the reader to do something about.
 */
export function designConditionsFrom(text, schema) {
  const { document } = parseIdf(text, schema, { strict: false });
  const days = document.all('SizingPeriod:DesignDay').toArray();
  const site = document.all('Site:Location').toArray()[0];
  const carry = (object) => ({ name: object.name, values: object.toJSON() });

  // The first candidate that is published *and* parses. A published day with a
  // bad number is stepped over rather than refused on, so a station carrying
  // both a broken 1% day and a clean dewpoint day is sized on the clean one --
  // but the field that stopped the preferred day is kept, because if nothing
  // else qualifies that field is the whole reason the station cannot be used.
  const choose = (season) => {
    let unreadable = null;
    for (const wanted of WANTED[season]) {
      const day = days.find((candidate) => wanted.holds(candidate));
      if (!day) continue;
      const field = unreadableNumber(day, schema, 'SizingPeriod:DesignDay');
      if (field) {
        unreadable ??= field;
        continue;
      }
      return { day, wanted };
    }
    return { day: null, unreadable };
  };

  const winter = choose('heating');
  const summer = choose('cooling');
  for (const [season, found] of [
    ['heating', winter],
    ['cooling', summer],
  ]) {
    if (found.day) continue;
    throw new Error(
      found.unreadable
        ? `its published annual ${season} design conditions carry no usable value for ${found.unreadable}`
        : `it publishes no annual ${season} design conditions`
    );
  }
  if (!site) throw new Error('its DDY carries no Site:Location');

  return { location: carry(site), days: [winter.day, summer.day].map(carry) };
}

/** Put a station's design conditions in the model, in place of Denver's. */
export function setDesignConditions(doc, conditions) {
  clear(doc, 'SizingPeriod:DesignDay');
  for (const { name, values } of conditions.days) doc.add('SizingPeriod:DesignDay', name, values);
  clear(doc, 'Site:Location');
  doc.add('Site:Location', conditions.location.name, conditions.location.values);
}

/** Switch between the two design days and a full weather-file year. */
export function setAnnual(doc, annual) {
  must(doc, 'SimulationControl').run_simulation_for_weather_file_run_periods = annual ? 'Yes' : 'No';
}

/** The zone's surfaces as plain vertex lists, for the axonometric. */
export function surfaceGeometry(doc) {
  return doc.all('BuildingSurface:Detailed').map((surface) => ({
    name: surface.name,
    type: String(surface.surface_type).toLowerCase(),
    boundary: String(surface.outside_boundary_condition).toLowerCase(),
    verts: surface.extensible.map((v) => [
      Number(v.vertex_x_coordinate),
      Number(v.vertex_y_coordinate),
      Number(v.vertex_z_coordinate),
    ]),
  }));
}

/**
 * The design conditions the zone is drawn against, straight off the model.
 *
 * The label is read off the day that is actually in the document, not chosen by
 * season. Those are different claims the moment more than one cooling day can
 * be taken: a station with no wetbulb record is sized on its .4%-family
 * dewpoint day, and lettering that `1% clg db` -- which this did, for 39 sites
 * in every 120 -- is the plate stating a severity and a basis that no object in
 * the document has.
 *
 * A day matching no candidate cannot arrive here: `designConditionsFrom` writes
 * only candidates, and the built-in Denver pair is named to match. So it throws
 * rather than lettering a blank, by the same rule as `must`.
 */
export function designDayDatums(doc) {
  return doc.all('SizingPeriod:DesignDay').map((day) => {
    const wanted = EVERY_WANTED.find((candidate) => candidate.holds(day));
    if (!wanted)
      throw new Error(
        `the model carries a design day this sheet cannot letter: ${String(day.name)}`
      );
    return { value: Number(day.maximum_dry_bulb_temperature), label: wanted.label };
  });
}

/** Values the title block reports, so the sheet cannot drift from the model. */
export function modelFacts(doc) {
  const site = must(doc, 'Site:Location');
  const building = must(doc, 'Building');
  const timestep = must(doc, 'Timestep');
  const lat = Number(site.latitude);
  const lon = Number(site.longitude);
  return {
    project: String(building.name).replace(/\s*\(.*\)$/, ''),
    site: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}° ${
      lon >= 0 ? 'E' : 'W'
    } · ${Number(site.elevation).toLocaleString('en-US')} m`,
    timestep: `${timestep.number_of_timesteps_per_hour} / hour`,
    version: doc.version,
  };
}

/**
 * The longest a signature may be. A title block cell is a cell, not a field for
 * an essay, and the header line it becomes is read in a text editor eighty
 * columns wide. Sixty characters fits every real name with room for a practice
 * beside it and is short enough that the line never wraps.
 */
const SIGNATURE_MAX = 60;

/**
 * A name, made safe to put in an IDF comment.
 *
 * This is the one function on this page where the rule is not taste. An IDF
 * comment runs from `!` to the end of the line and no further, so a signature
 * carrying a newline does not produce an untidy header — it **ends the comment
 * and hands the rest to the parser as input**. `Sam\nZone, EVIL, 0, 0, 0, 0;`
 * is a real object in a real file that a colleague runs, written by a page that
 * never asked to write it.
 *
 * So every control and format character goes (`\p{Cc}` and `\p{Cf}`, which is
 * `\n` and `\r` but also the bidi overrides, which can make a stored name read
 * as something other than what it says), and the two Unicode line breaks are
 * named as escapes beside them — `\u2028` and `\u2029` are category `Zl`/`Zp`
 * rather than `Cc`, and JavaScript is the language where they historically
 * terminated a line. They would in fact be caught by the `\s+` collapse on the
 * next line, so this is belt and braces on purpose: the guarantee is worth
 * stating twice, and written as literals the way they first were, the two most
 * important characters in this function were invisible in the source.
 *
 * Note what is *not* done: nothing is refused. A quantity field refuses `12abc`
 * whole because a number that cannot be parsed has no meaning, but there is no
 * such thing as an invalid name — people are called what they are called, in
 * whatever script, and a page that rejected a signature it did not recognise
 * would be making a claim about who is allowed to sign a drawing. So the text
 * is normalised and kept, never judged.
 */
export function cleanSignature(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SIGNATURE_MAX)
    .trim();
}

/**
 * The header every model this page writes carries, and the reason it exists.
 *
 * An IDF outlives the tab that wrote it. It gets mailed, committed, re-run
 * against a different EnergyPlus two years later and argued with by somebody
 * who was never at this desk — and the first question they will have is where
 * it came from. The sheet answers that question about itself in the title
 * block's revision cell; this is the same answer travelling with the file,
 * which is the copy that matters, because the bundle's manifest can be
 * separated from the model and the model's own first lines cannot.
 *
 * Deliberately **not** in it: a timestamp. It is the obvious fifth line and it
 * would quietly cost this repository its main verification tool — the harnesses
 * assert that applying the desk three times serialises byte-identically, and
 * that a lean reporting profile followed by a sheet one matches always-sheet,
 * which is what the sweep's restore depends on. A clock in the header makes
 * every one of those comparisons false for a reason that has nothing to do with
 * the model. The bundle's manifest carries the date, where it costs nothing.
 *
 * The em dash for an unknown toolkit is the sheet's own rule reaching into the
 * file: a build that could not read which version wrote this says so, rather
 * than naming one that might be wrong.
 */
export function idfHeader({ author = '', revision = null, toolkit = null } = {}) {
  const signed = cleanSignature(author);
  const lines = [
    '! Generated by idfkit — https://idfkit.com',
    `! Toolkit    @idfkit/core ${toolkit ?? '—'}`,
    `! Sheet      shoebox ${revision ?? '—'}`,
  ];
  // Unsigned writes no line at all rather than `Drawn by —`. A blank in a title
  // block cell means "not filled in yet" because the cell is ruled whether or
  // not it is; a header has no ruling, so an em dash there would be inventing a
  // field to leave empty. Nobody signed it, so nothing says anybody did.
  if (signed) lines.push(`! Drawn by   ${signed}`);
  return `${lines.join('\n')}\n\n`;
}
