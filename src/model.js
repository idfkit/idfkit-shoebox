import { IDFDocument, parseIdf } from '@idfkit/core';
import { CHANNELS, DEFAULT_BYPASS, DEFAULT_PARAMETERS } from './controls.js';
import { END_USES } from './bill.js';

/**
 * The stock `1ZoneUncontrolled.idf` example from the EnergyPlus 26.1.0 release,
 * authored through the object model rather than pasted in as text, and then
 * opened up to the console.
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
export const SOUTH_WALL = 'Zn001:Wall001'; // the y = 0 wall; north_axis is 0, so it faces south
export const SOUTH_WINDOW = 'Zn001:Wall001:Win001';

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
].map(Object.freeze));

export { DEFAULT_PARAMETERS };

const CONTEXT_SHADE = 'Context:Obstruction';
const FRAME = 'WINDOW FRAME';
const BLIND = 'WINDOW BLIND';
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
      name: 'Zn001:Flr001',
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
      name: 'Zn001:Roof001',
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

  doc.add('RunPeriod', 'Run Period 1', {
    begin_month: 1,
    begin_day_of_month: 1,
    end_month: 12,
    end_day_of_month: 31,
    day_of_week_for_start_day: 'Tuesday',
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
  doc.add('Construction', 'WINDOW', { outside_layer: 'DOUBLE GLAZING' });

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

  const diagnostics = doc.add('Output:Diagnostics', null);
  diagnostics.extensible.push({ key: 'DisplayAdvancedReportVariables' });

  for (const name of VARIABLES_HOURLY) addVariable(doc, name, 'Hourly');
  for (const name of VARIABLES_DAILY) addVariable(doc, name, 'Daily');
  doc.add('Output:Variable', null, {
    key_value: ZONE_NAME,
    variable_name: 'Zone Wetbulb Globe Temperature',
    reporting_frequency: 'Hourly',
  });
  for (const name of VARIABLES_MONTHLY) addVariable(doc, name, 'Monthly');

  doc.add('Output:VariableDictionary', null, { key_field: 'IDF' });
  doc.add('Output:Surfaces:Drawing', null, { report_type: 'DXF:WireFrame' });
  doc.add('Output:Constructions', null, { details_type_1: 'Constructions' });

  for (const meter of ['ExteriorLights:Electricity', 'EnergyTransfer:Building', 'EnergyTransfer:Facility']) {
    doc.add('Output:Meter:MeterFileOnly', null, { key_name: meter, reporting_frequency: 'Hourly' });
  }

  doc.add('OutputControl:Table:Style', null, { column_separator: 'All' });
  const summary = doc.add('Output:Table:SummaryReports', null);
  summary.extensible.push({ report_name: 'AllSummary' });

  doc.add('Exterior:Lights', 'ExtLights', {
    schedule_name: 'AlwaysOn',
    design_level: 5250,
    control_option: 'AstronomicalClock',
    end_use_subcategory: 'Grounds Lights',
  });

  // A matched pair, +352 W and −352 W, so the zone stays genuinely free-running
  // until the Gains channel is engaged.
  for (const [name, level] of [
    ['Test 352a', 352],
    ['Test 352 minus', -352],
  ]) {
    doc.add('OtherEquipment', name, {
      fuel_type: 'None',
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: 'AlwaysOn',
      design_level_calculation_method: 'EquipmentLevel',
      design_level: level,
      fraction_latent: 0,
      fraction_radiant: 0,
      fraction_lost: 0,
    });
  }

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
  for (const channel of CHANNELS) {
    const off = channel.bypassable && Boolean(bypass[channel.id]);
    const blocked = !off && channel.requires && !channel.requires.test(params, on);
    state.set(channel.id, {
      engaged: !off && !blocked,
      bypassed: off,
      blocked: blocked ? channel.requires.reason : null,
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
export function applyModel(doc, params, bypass = {}) {
  const state = channelState(params, bypass);
  const on = (id) => state.get(id).engaged;

  applyMassing(doc, params);
  applySite(doc, params);
  applyContext(doc, params, on('context'));
  applyFabric(doc, params, on('fabric'));
  applyMass(doc, params, on('mass'));
  applyGlazing(doc, params, on('glazing'));
  applyShading(doc, params, on('shading'), on('glazing'));
  applyBlinds(doc, params, on('blinds'));
  applyAir(doc, params, on('air'));
  applyGains(doc, params, on('gains'));
  applyDaylight(doc, params, on('daylight'), on('gains'));
  applySystem(doc, params, on('system'), on('gains'));
  applySolver(doc, params);
  applyRun(doc, params);
  syncOutputs(doc, state);

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

/** 06 — the opaque envelope. Bypassed, the box becomes a flask. */
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

  for (const surface of doc.all('BuildingSurface:Detailed').toArray()) {
    const type = String(surface.surface_type).toLowerCase();
    const outdoors = type === 'wall' || type === 'roof';
    if (outdoors) {
      // Bypass is not a very large R-value, it is no path at all: the surface
      // stops seeing outdoors entirely.
      surface.outside_boundary_condition = engaged ? 'Outdoors' : 'Adiabatic';
      surface.sun_exposure = engaged ? 'SunExposed' : 'NoSun';
      surface.wind_exposure = engaged && params.windExposure === 'WindExposed' ? 'WindExposed' : 'NoWind';
    } else if (type === 'floor') {
      const grounded = engaged && params.floorBoundary === 'Ground';
      surface.outside_boundary_condition = grounded ? 'Ground' : 'Adiabatic';
      surface.sun_exposure = 'NoSun';
      surface.wind_exposure = 'NoWind';
    }
  }
}

const SLAB_MATERIALS = Object.freeze({
  Heavy: { conductivity: 1.729577, density: 2242.585, specific_heat: 836.8 },
  Light: { conductivity: 0.53, density: 1280, specific_heat: 840 },
  Timber: { conductivity: 0.15, density: 608, specific_heat: 1630 },
});

/** 07 — what the building remembers. */
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

/** 03 — the openings, and what they are made of. */
function applyGlazing(doc, params, engaged) {
  // The assembly, rebuilt from scratch: a construction's layer count is its
  // identity, and the two models do not have the same number of layers.
  drop(doc, 'Construction', 'WINDOW');
  drop(doc, 'WindowMaterial:SimpleGlazingSystem', 'DOUBLE GLAZING');
  drop(doc, 'WindowMaterial:Glazing', 'GLZ-OUTER');
  drop(doc, 'WindowMaterial:Glazing', 'GLZ-INNER');
  drop(doc, 'WindowMaterial:Gas', 'GLZ-CAVITY');

  if (params.glazingModel === 'Layered') {
    doc.add('WindowMaterial:Glazing', 'GLZ-OUTER', {
      optical_data_type: 'SpectralAverage',
      thickness: 0.006,
      solar_transmittance_at_normal_incidence: 0.775,
      front_side_solar_reflectance_at_normal_incidence: 0.071,
      back_side_solar_reflectance_at_normal_incidence: 0.071,
      visible_transmittance_at_normal_incidence: 0.881,
      front_side_visible_reflectance_at_normal_incidence: 0.08,
      back_side_visible_reflectance_at_normal_incidence: 0.08,
      infrared_transmittance_at_normal_incidence: 0,
      front_side_infrared_hemispherical_emissivity: 0.84,
      back_side_infrared_hemispherical_emissivity: 0.84,
      conductivity: 1.0,
    });
    doc.add('WindowMaterial:Gas', 'GLZ-CAVITY', { gas_type: 'Air', thickness: params.gapWidth });
    doc.add('WindowMaterial:Glazing', 'GLZ-INNER', {
      optical_data_type: 'SpectralAverage',
      thickness: 0.006,
      solar_transmittance_at_normal_incidence: 0.775,
      front_side_solar_reflectance_at_normal_incidence: 0.071,
      back_side_solar_reflectance_at_normal_incidence: 0.071,
      visible_transmittance_at_normal_incidence: 0.881,
      front_side_visible_reflectance_at_normal_incidence: 0.08,
      back_side_visible_reflectance_at_normal_incidence: 0.08,
      infrared_transmittance_at_normal_incidence: 0,
      // The coating sits on surface 3 — the cavity face of the inboard pane.
      front_side_infrared_hemispherical_emissivity: params.paneEmiss,
      back_side_infrared_hemispherical_emissivity: 0.84,
      conductivity: 1.0,
    });
    doc.add('Construction', 'WINDOW', {
      outside_layer: 'GLZ-OUTER',
      layer_2: 'GLZ-CAVITY',
      layer_3: 'GLZ-INNER',
    });
  } else {
    doc.add('WindowMaterial:SimpleGlazingSystem', 'DOUBLE GLAZING', {
      u_factor: params.uFactor,
      solar_heat_gain_coefficient: params.shgc,
      visible_transmittance: params.visT,
    });
    doc.add('Construction', 'WINDOW', { outside_layer: 'DOUBLE GLAZING' });
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
    const opening = engaged ? apertureOn(wall, params) : null;
    const existing = doc.get('FenestrationSurface:Detailed', name);
    if (!opening) {
      if (existing) doc.remove(existing);
      continue;
    }
    const target =
      existing ??
      doc.add('FenestrationSurface:Detailed', name, {
        surface_type: 'Window',
        construction_name: 'WINDOW',
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

/** 04 — overhangs and fins, cut from the openings' own numbers. */
function applyShading(doc, params, engaged, glazingOn) {
  for (const wall of wallPlan(params)) {
    const opening = glazingOn ? apertureOn(wall, params) : null;
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

/** 05 — shading that answers the weather. */
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

  const windows = doc.all('FenestrationSurface:Detailed').toArray().map((w) => String(w.name));
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

/** 08 — leakage, and openings that answer the temperature. */
function applyAir(doc, params, engaged) {
  clear(doc, 'ZoneInfiltration:DesignFlowRate');
  clear(doc, 'ZoneVentilation:DesignFlowRate');
  if (!engaged) return;

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
 * A day with a band in it, as a `Schedule:Compact`.
 *
 * Outside the band the value falls to `off` rather than to nothing, because a
 * building with literally no one in it overnight is a building whose equipment
 * has been unplugged.
 */
function bandSchedule(doc, name, limits, params, { on = 1, off = 0.1 } = {}) {
  drop(doc, 'Schedule:Compact', name);
  const schedule = doc.add('Schedule:Compact', name, { schedule_type_limits_name: limits });
  const rows = ['Through: 12/31'];

  rows.push('For: Weekdays SummerDesignDay WinterDesignDay');
  rows.push(...dayRows(params.occFrom, params.occTo, on, off));
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

/** 09 — people, light and equipment. */
function applyGains(doc, params, engaged) {
  clear(doc, 'People');
  clear(doc, 'Lights');
  clear(doc, 'ElectricEquipment');
  drop(doc, 'Schedule:Compact', 'Occupancy');
  drop(doc, 'Schedule:Constant', 'Activity');
  if (!engaged) return;

  bandSchedule(doc, 'Occupancy', 'Fraction', params);
  doc.add('Schedule:Constant', 'Activity', {
    schedule_type_limits_name: 'Any Number',
    hourly_value: params.activity,
  });

  doc.add('People', 'Occupants', {
    zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
    number_of_people_schedule_name: 'Occupancy',
    number_of_people_calculation_method: 'Area/Person',
    floor_area_per_person: params.occupancy,
    fraction_radiant: 0.3,
    sensible_heat_fraction: 'Autocalculate',
    activity_level_schedule_name: 'Activity',
  });

  if (params.lighting > 0) {
    doc.add('Lights', 'Lighting', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: 'Occupancy',
      design_level_calculation_method: 'Watts/Area',
      watts_per_floor_area: params.lighting,
      fraction_radiant: params.lightRadiant,
      fraction_visible: 0.18,
      return_air_fraction: 0,
      fraction_replaceable: 1,
      end_use_subcategory: 'General',
    });
  }

  if (params.equipment > 0) {
    doc.add('ElectricEquipment', 'Equipment', {
      zone_or_zonelist_or_space_or_spacelist_name: ZONE_NAME,
      schedule_name: 'Occupancy',
      design_level_calculation_method: 'Watts/Area',
      watts_per_floor_area: params.equipment,
      fraction_latent: params.equipLatent,
      fraction_radiant: 0.3,
      fraction_lost: 0,
    });
  }
}

/** 10 — the sensor that dims the lights against the daylight. */
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
 * 11 — the master bus.
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
    rows.push('For: AllOtherDays');
    rows.push(...day(params.weekend === 'Occupied' && gainsOn));
    schedule.set('data', rows.map((field) => ({ field })));
  };
  // Setback widens the band: heating drops, cooling rises.
  setpoints('Heating Setpoints', params.heatSet, -1);
  setpoints('Cooling Setpoints', params.coolSet, +1);

  doc.add('ThermostatSetpoint:DualSetpoint', 'Setpoints', {
    heating_setpoint_temperature_schedule_name: 'Heating Setpoints',
    cooling_setpoint_temperature_schedule_name: 'Cooling Setpoints',
  });

  // Control type 4 is dual setpoint. 1 is heating only, 2 cooling only.
  const controlType =
    params.availability === 'HeatingOnly' ? 1 : params.availability === 'CoolingOnly' ? 2 : 4;
  drop(doc, 'Schedule:Constant', 'Control Type');
  doc.add('Schedule:Constant', 'Control Type', {
    schedule_type_limits_name: 'Control Type',
    hourly_value: controlType,
  });

  doc.add('ZoneControl:Thermostat', 'Thermostat', {
    zone_or_zonelist_name: ZONE_NAME,
    control_type_schedule_name: 'Control Type',
    control_1_object_type: 'ThermostatSetpoint:DualSetpoint',
    control_1_name: 'Setpoints',
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

/** 12 — the engine room. */
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

/** 13 — what actually gets simulated. */
function applyRun(doc, params) {
  const period = must(doc, 'RunPeriod', 'Run Period 1');
  const [from, to] = params.beginMonth <= params.endMonth
    ? [params.beginMonth, params.endMonth]
    : [params.endMonth, params.beginMonth];
  period.begin_month = from;
  period.begin_day_of_month = 1;
  period.end_month = to;
  period.end_day_of_month = DAYS_IN_MONTH[to - 1];
  period.use_weather_file_holidays_and_special_days = params.holidays;
  period.use_weather_file_daylight_saving_period = params.dst;

  must(doc, 'SimulationControl').run_simulation_for_sizing_periods = params.sizingPeriods;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Ask for exactly the meters the engaged channels can answer.
 *
 * A bypassed channel is out of the model, and that has to include its
 * reporting: EnergyPlus lists every requested variable it could not produce at
 * the end of the error file, and a desk with half its strips out would inflate
 * the warning count on the title block with warnings about itself.
 */
function syncOutputs(doc, state) {
  syncEndUseMeters(doc, state);

  const wanted = new Set();
  for (const channel of CHANNELS) {
    if (!state.get(channel.id).engaged || !channel.meter) continue;
    for (const term of channel.meter.terms) wanted.add(term.variable);
  }
  // The base set is not the console's to remove.
  const base = new Set([...VARIABLES_HOURLY, ...VARIABLES_DAILY, ...VARIABLES_MONTHLY, 'Zone Wetbulb Globe Temperature']);

  const present = new Set();
  for (const variable of doc.all('Output:Variable').toArray()) {
    const name = String(variable.variable_name);
    if (base.has(name)) continue;
    if (wanted.has(name)) present.add(name);
    else doc.remove(variable);
  }
  for (const name of wanted) {
    if (!present.has(name) && !base.has(name)) addVariable(doc, name, 'Hourly');
  }
}

/**
 * The end-use meters the bill reads, added and removed with their channels.
 *
 * Same argument as the variables above and the same failure if it is skipped:
 * a meter that no object can feed is reported as "requested but not generated"
 * at the foot of the error file, and the title block would then count the
 * console's own bypasses as warnings about the model.
 *
 * Monthly, deliberately. It is twelve values per meter for a year and one per
 * environment for a design day, which is enough to total the bill and enough
 * to draw its shape across the year, where hourly would be 8,760 points per
 * meter for a number that is only ever read as a sum.
 */
function syncEndUseMeters(doc, state) {
  const wanted = new Set(
    END_USES.filter((use) => !use.needs || state.get(use.needs)?.engaged).map((use) => use.meter),
  );
  const present = new Set();
  for (const meter of doc.all('Output:Meter').toArray()) {
    const name = String(meter.key_name);
    if (wanted.has(name)) present.add(name);
    else doc.remove(meter);
  }
  for (const name of wanted) {
    if (present.has(name)) continue;
    doc.add('Output:Meter', null, { key_name: name, reporting_frequency: 'Monthly' });
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

/**
 * Quantities an architect gets without running anything, summed off the
 * surfaces so they follow any geometry the model actually holds.
 *
 * `exposed` counts only surfaces losing heat to outdoors, so bypassing Fabric
 * — which sends every wall adiabatic — correctly reports no exposed envelope
 * at all rather than flattering the compactness.
 */
export function geometryFacts(doc) {
  const surfaces = surfaceGeometry(doc);
  const zs = surfaces.flatMap((s) => s.verts.map((v) => v[2]));
  const height = Math.max(...zs) - Math.min(...zs);
  const area = (list) => list.reduce((total, s) => total + polygonArea(s.verts), 0);

  const floor = area(surfaces.filter((s) => s.type === 'floor'));
  const exposed = area(surfaces.filter((s) => s.boundary === 'outdoors'));
  const volume = floor * height;

  const windows = windowGeometry(doc);
  const glazing = area(windows);
  const walls = surfaces.filter((s) => s.type === 'wall');
  const wallArea = area(walls);
  const wwr = wallArea > 0 ? glazing / wallArea : NaN;

  // How far a shade reaches off the wall plane, and that reach against the
  // height of the opening beneath it — the projection factor an architect sizes
  // a shade by. Measured perpendicular to the host wall rather than along a
  // fixed axis, so it stays true once the building is turned.
  const shades = shadeGeometry(doc);
  const zoneShades = shades.filter((s) => !s.context);
  const south = zoneShades.find((s) => s.host === SOUTH_WALL);
  const southWall = walls.find((s) => s.name === SOUTH_WALL);
  const southWindow = windows.find((w) => w.host === SOUTH_WALL);
  const overhang = south && southWall ? reachOff(southWall.verts, south.verts) : 0;
  const opening = southWindow ? span(southWindow.verts, 2) : 0;
  const projection = overhang > 0 && opening > 0 ? overhang / opening : NaN;

  return {
    floor,
    exposed,
    volume,
    glazing,
    wwr,
    overhang,
    projection,
    shadeArea: area(zoneShades),
    contextArea: area(shades.filter((s) => s.context)),
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
 * A station's design conditions, read out of the DDY that ships beside its EPW.
 *
 * Parsed non-strictly on purpose: a DDY carries object types this model has no
 * use for, so an unknown one is skipped rather than thrown. What is not
 * tolerated is coming out the other side without the pair, which throws — the
 * caller has a station to refuse, and no business running one city's year
 * against another city's design conditions.
 */
export function designConditionsFrom(text, schema) {
  const { document } = parseIdf(text, schema, { strict: false });
  const days = document.all('SizingPeriod:DesignDay').toArray();
  const pick = (pattern, dayType) =>
    days.find((day) => pattern.test(String(day.name))) ??
    days.find((day) => String(day.day_type) === dayType);
  const site = document.all('Site:Location').toArray()[0];
  const carry = (object) => ({ name: object.name, values: object.toJSON() });

  const winter = pick(/Ann Htg 99% Condns DB$/i, 'WinterDesignDay');
  const summer = pick(/Ann Clg 1% Condns DB=>MWB$/i, 'SummerDesignDay');
  if (!winter || !summer) {
    const missing = [!winter && 'heating', !summer && 'cooling'].filter(Boolean).join(' or ');
    throw new Error(`its DDY names no ${missing} design day this sheet can read`);
  }
  if (!site) throw new Error('its DDY carries no Site:Location');

  return { location: carry(site), days: [winter, summer].map(carry) };
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

/** The design conditions the zone is drawn against, straight off the model. */
export function designDayDatums(doc) {
  return doc.all('SizingPeriod:DesignDay').map((day) => ({
    value: Number(day.maximum_dry_bulb_temperature),
    label: /winter/i.test(String(day.day_type)) ? '99% htg db' : '1% clg db',
  }));
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
