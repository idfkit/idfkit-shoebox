import { IDFDocument, parseIdf } from '@idfkit/core';

/**
 * The stock `1ZoneUncontrolled.idf` example from the EnergyPlus 26.1.0 release,
 * authored through the object model rather than pasted in as text.
 *
 * The geometry is the point of the exercise: the plan loop in `boxSurfaces`
 * generates the four walls, and every consumer of this model -- the
 * axonometric, the datum lines on the plate, the quantities panel, the title
 * block -- reads the objects back out instead of transcribing constants. That
 * is what lets the dimension sliders reshape the building and the simulation
 * together.
 */

export const ZONE_NAME = 'ZONE ONE';
export const SOUTH_WALL = 'Zn001:Wall001'; // the y = 0 wall; north_axis is 0, so it faces south
export const SOUTH_WINDOW = 'Zn001:Wall001:Win001';
export const SOUTH_OVERHANG = 'Zn001:Wall001:Shade001';

/**
 * The stock example's box (50 × 50 × 15 ft), plus glazing and its overhang.
 *
 * `wwr: 0` reproduces `1ZoneUncontrolled.idf` exactly — it has no fenestration
 * at all, and with no window there is nothing for the overhang to shade either.
 * Anything above that is this demo's addition.
 */
export const DEFAULT_PARAMETERS = Object.freeze({
  width: 15.24,
  depth: 15.24,
  height: 4.572,
  wwr: 0.2,
  overhang: 0.6,
});

const metres = (v) => `${v.toFixed(2)} m`;

/** What the sliders may ask for. */
export const PARAMETERS = Object.freeze({
  width: { min: 4, max: 40, step: 0.01, label: 'Width', format: metres },
  depth: { min: 4, max: 40, step: 0.01, label: 'Depth', format: metres },
  height: { min: 2.4, max: 12, step: 0.01, label: 'Height', format: metres },
  wwr: {
    min: 0,
    max: 0.9,
    step: 0.01,
    label: 'Glazing S',
    group: true, // a ratio, not a length: give it its own rule in the panel
    format: (v) => `${(v * 100).toFixed(0)} % WWR`,
  },
  // Belongs with the glazing rather than with the box, so it sits inside the
  // rule the ratio opens: it measures the opening, not the building.
  overhang: {
    min: 0,
    max: 3,
    step: 0.01,
    label: 'Overhang S',
    format: (v) => (v > 0 ? metres(v) : 'None'),
  },
});

/**
 * The six surfaces of a box, as vertex lists.
 *
 * Vertices are wound counter-clockwise seen from outside, per the
 * GlobalGeometryRules object below, which is what makes the outward normals
 * come out right for the axonometric and the area sums.
 */
function boxSurfaces({ width, depth, height }) {
  const plan = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
  const walls = plan.map(([ax, ay], i) => {
    const [bx, by] = plan[(i + 1) % plan.length];
    return {
      name: `Zn001:Wall${String(i + 1).padStart(3, '0')}`,
      type: 'Wall',
      construction: 'R13WALL',
      boundary: 'Outdoors',
      exposed: true,
      viewFactor: 0.5,
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
      verts: [
        [width, 0, 0],
        [0, 0, 0],
        [0, depth, 0],
        [width, depth, 0],
      ],
    },
    {
      name: 'Zn001:Roof001',
      type: 'Roof',
      construction: 'ROOF31',
      boundary: 'Outdoors',
      exposed: true,
      viewFactor: 0,
      verts: [
        [0, depth, height],
        [0, 0, height],
        [width, 0, height],
        [width, depth, height],
      ],
    },
  ];
}

const vertexGroups = (verts) =>
  verts.map(([x, y, z]) => ({
    vertex_x_coordinate: x,
    vertex_y_coordinate: y,
    vertex_z_coordinate: z,
  }));

/**
 * A centred window on the south wall, sized to hit the window-to-wall ratio.
 *
 * Both dimensions scale by √wwr rather than stretching a ribbon across the full
 * width, which keeps the opening in proportion with the wall and guarantees a
 * reveal on all four sides at any ratio the slider allows. Wound to match the
 * base surface so the outward normal still points south.
 */
function southWindowVertices({ width, height, wwr }) {
  if (!(wwr > 0)) return null;
  const scale = Math.sqrt(wwr);
  const [w, h] = [width * scale, height * scale];
  const [x0, z0] = [(width - w) / 2, (height - h) / 2];
  const [x1, z1] = [x0 + w, z0 + h];
  return [
    [x0, 0, z1],
    [x0, 0, z0],
    [x1, 0, z0],
    [x1, 0, z1],
  ];
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
 * A flat overhang on the head of the south window, projecting due south.
 *
 * Written out as vertices rather than as `Shading:Overhang`, which would say the
 * same thing in four numbers, because the drawing reads its geometry back off
 * the model like everything else on the sheet — and only a detailed surface
 * carries coordinates to read.
 *
 * It runs the width of the opening, so what the slider changes is the one thing
 * that matters on a south face: how far it reaches out. Wound counter-clockwise
 * seen from above, which puts the outward normal up towards the sky.
 */
function southOverhangVertices(parameters) {
  const window = southWindowVertices(parameters);
  const depth = parameters.overhang;
  if (!window || !(depth > 0)) return null;
  const [x0, x1] = [window[0][0], window[2][0]];
  const head = window[0][2];
  return [
    [x0, 0, head],
    [x0, -depth, head],
    [x1, -depth, head],
    [x1, 0, head],
  ];
}

/**
 * Place the south opening and its overhang, or take them away.
 *
 * Both come and go as the sliders cross zero — the window at 0 % WWR, the
 * overhang at 0 m or wherever there is no window left to shade — so one routine
 * adds, reshapes and removes, and both the initial build and every later drag
 * go through it.
 */
function setAperture(doc, parameters) {
  const verts = southWindowVertices(parameters);
  const window = doc.get('FenestrationSurface:Detailed', SOUTH_WINDOW);
  if (!verts) {
    if (window) doc.remove(window);
  } else {
    const target =
      window ??
      doc.add('FenestrationSurface:Detailed', SOUTH_WINDOW, {
        surface_type: 'Window',
        construction_name: 'WINDOW',
        building_surface_name: SOUTH_WALL,
        view_factor_to_ground: 0.5,
        multiplier: 1,
      });
    target.number_of_vertices = verts.length;
    for (const [field, value] of Object.entries(windowVertexFields(verts))) target.set(field, value);
  }

  const shade = southOverhangVertices(parameters);
  const existing = doc.get('Shading:Zone:Detailed', SOUTH_OVERHANG);
  if (!shade) {
    if (existing) doc.remove(existing);
    return;
  }
  const target =
    existing ?? doc.add('Shading:Zone:Detailed', SOUTH_OVERHANG, { base_surface_name: SOUTH_WALL });
  target.number_of_vertices = shade.length;
  target.set('vertices', vertexGroups(shade));
}

/*
 * What the run reports.
 *
 * The stock example also asks for around thirty per-surface and per-zone-face
 * conduction series -- `Surface Inside Face Conduction ...`, `Zone Opaque
 * Surface ...` and friends. They are gone, and their absence is the single
 * largest thing keeping the sliders interactive.
 *
 * They cost nothing to compute and a great deal to report. Each is requested
 * with key `*`, so it expands to one series per surface, and together they took
 * the ESO from 15 series to 173. Measured on the annual run, interleaved A/B in
 * one session: a full year went from 2,984 ms to 681 ms, and the stretch after
 * EnergyPlus stops simulating -- the engine parsing the ESO and handing it back
 * across the worker boundary -- went from 2,117 ms to 178 ms. The design day
 * moves less in absolute terms but in the same direction.
 *
 * Output requests do not touch the physics; they only decide what is written
 * down. Every zone-level and site-level series the stock example asks for is
 * still here, and the sheet itself reads exactly two of them.
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
export function buildModel(schema, parameters = DEFAULT_PARAMETERS) {
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
    // the shadow the overhang actually casts. Beam solar that gets in is still
    // laid on the floor exactly as before, so with no overhang standing the two
    // settings agree: the box is convex, and its walls cannot shade each other.
    solar_distribution: 'FullExterior',
    maximum_number_of_warmup_days: 30,
    minimum_number_of_warmup_days: 6,
  });

  doc.add('HeatBalanceAlgorithm', null, { algorithm: 'ConductionTransferFunction' });
  doc.add('SurfaceConvectionAlgorithm:Inside', null, { algorithm: 'TARP' });
  doc.add('SurfaceConvectionAlgorithm:Outside', null, { algorithm: 'DOE-2' });

  // The one field the UI flips: off runs the two design days only, on adds the
  // weather-file run period below.
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

  setAperture(doc, parameters);

  const diagnostics = doc.add('Output:Diagnostics', null);
  diagnostics.extensible.push({ key: 'DisplayAdvancedReportVariables' });

  const variable = (name, frequency) =>
    doc.add('Output:Variable', null, {
      key_value: '*',
      variable_name: name,
      reporting_frequency: frequency,
    });
  for (const name of VARIABLES_HOURLY) variable(name, 'Hourly');
  for (const name of VARIABLES_DAILY) variable(name, 'Daily');
  doc.add('Output:Variable', null, {
    key_value: ZONE_NAME,
    variable_name: 'Zone Wetbulb Globe Temperature',
    reporting_frequency: 'Hourly',
  });
  for (const name of VARIABLES_MONTHLY) variable(name, 'Monthly');

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

  doc.add('ScheduleTypeLimits', 'On/Off', {
    lower_limit_value: 0,
    upper_limit_value: 1,
    numeric_type: 'DISCRETE',
  });

  // A matched pair, +352 W and -352 W, so the zone stays genuinely free-running.
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

  return doc;
}

/**
 * Reshape the box in place.
 *
 * Rewrites the vertex groups on the six surfaces rather than rebuilding the
 * document, so everything else -- the run-period switch, the design days, the
 * output requests -- keeps whatever state it already had.
 */
export function setParameters(doc, parameters) {
  const surfaces = doc.all('BuildingSurface:Detailed');
  for (const face of boxSurfaces(parameters)) {
    const surface = surfaces.get(face.name);
    if (!surface) continue;
    surface.set('vertices', vertexGroups(face.verts));
    surface.number_of_vertices = face.verts.length;
  }

  setAperture(doc, parameters);
}

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
 * Quantities an architect gets without running anything, summed off the
 * surfaces so they follow any geometry the model actually holds.
 *
 * `exposed` counts only surfaces losing heat to outdoors -- the slab is
 * adiabatic in this model, so including it would flatter the compactness.
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
  const southWall = surfaces.find((s) => s.name === SOUTH_WALL);
  const wwr = southWall ? glazing / polygonArea(southWall.verts) : NaN;

  // How far the overhang reaches off the wall plane, and that reach against the
  // height of the opening beneath it — the projection factor an architect sizes
  // a shade by. Both are measured off the vertices, so neither can drift from
  // what was simulated.
  const shade = shadeGeometry(doc)[0];
  const overhang = shade ? span(shade.verts, 1) : 0;
  const opening = windows[0] ? span(windows[0].verts, 2) : 0;
  const projection = overhang > 0 && opening > 0 ? overhang / opening : NaN;

  return {
    floor,
    exposed,
    volume,
    glazing,
    wwr,
    overhang,
    projection,
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
  return doc.all('Shading:Zone:Detailed').map((shade) => ({
    name: shade.name,
    host: String(shade.base_surface_name),
    verts: shade.extensible.map((v) => [
      Number(v.vertex_x_coordinate),
      Number(v.vertex_y_coordinate),
      Number(v.vertex_z_coordinate),
    ]),
  }));
}

/**
 * A station's design conditions, read out of the DDY that ships beside its EPW.
 *
 * The file holds the whole ASHRAE set — annual and monthly, heating,
 * dehumidification, wind, enthalpy, some forty objects — and this sheet draws
 * two datum lines. So it takes the same pair the stock Denver file uses, the
 * 99% heating drybulb and the 1% cooling drybulb at mean coincident wetbulb,
 * and falls back to the first winter and summer day in the file for any station
 * whose naming departs from the convention.
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

/**
 * Put a station's design conditions in the model, in place of Denver's.
 *
 * Denver's two days and Denver's `Site:Location` are what the stock example
 * ships. Leaving them there while another city's year runs is not a cosmetic
 * mismatch: the engine warns that the model and the weather file disagree, then
 * sizes the design days at Denver's barometric pressure, 1,829 m up.
 *
 * Everything the sheet says about design conditions is read back out of these
 * objects afterwards, so the datum lines and the title block follow without
 * being told. There is no partial application: `designConditionsFrom` has
 * already refused anything short of the full pair and a location.
 */
export function setDesignConditions(doc, conditions) {
  for (const day of doc.all('SizingPeriod:DesignDay').toArray()) doc.remove(day);
  for (const { name, values } of conditions.days) doc.add('SizingPeriod:DesignDay', name, values);
  for (const site of doc.all('Site:Location').toArray()) doc.remove(site);
  doc.add('Site:Location', conditions.location.name, conditions.location.values);
}

/** Switch between the two design days and a full weather-file year. */
export function setAnnual(doc, annual) {
  const control = doc.all('SimulationControl').toArray()[0];
  control.run_simulation_for_weather_file_run_periods = annual ? 'Yes' : 'No';
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
  const site = doc.all('Site:Location').toArray()[0];
  const building = doc.all('Building').toArray()[0];
  const timestep = doc.all('Timestep').toArray()[0];
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
