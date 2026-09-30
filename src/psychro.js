/**
 * Moist air, for the psychrometric view (spec 015, research.md R3).
 *
 * DOM-free. Every equation is from the ASHRAE Handbook of Fundamentals (2021),
 * chapter 1, and is cited by its equation number there. Pressures are kPa,
 * temperatures °C, humidity ratios kg/kg; the view scales to g/kg at the
 * lettering through `KINDS.humidityRatio`.
 *
 * The chart's curves are a reference drawn at the site's standard pressure.
 * The marks are the engine's own humidity ratios, never recomputed here, so a
 * mark may sit a little above the saturation curve by the difference between
 * the station pressure EnergyPlus used and the standard one; it is drawn where
 * it falls.
 */

/** Standard atmospheric pressure at an elevation in metres. HoF 2021 ch. 1, eq. 3. */
export function standardPressure(elevationM) {
  if (!Number.isFinite(elevationM)) throw new Error(`standardPressure: ${elevationM} is not an elevation`);
  return 101.325 * (1 - 2.25577e-5 * elevationM) ** 5.2559;
}

/**
 * Saturation vapour pressure over ice (−100 to 0 °C, eq. 5) or over liquid
 * water (0 to 200 °C, eq. 6), Hyland and Wexler. Returns kPa.
 */
export function saturationPressure(tC) {
  if (!Number.isFinite(tC)) throw new Error(`saturationPressure: ${tC} is not a temperature`);
  const T = tC + 273.15;
  let ln;
  if (tC < 0) {
    ln =
      -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T ** 2 +
      2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T);
  } else {
    ln =
      -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T ** 2 -
      1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T);
  }
  return Math.exp(ln) / 1000;
}

/** Humidity ratio of air at vapour pressure `pw` and total pressure `p`, both kPa. HoF 2021 ch. 1, eq. 20. */
export function humidityRatio(pwKPa, pKPa) {
  if (!(pwKPa >= 0) || !(pKPa > pwKPa)) throw new Error(`humidityRatio: ${pwKPa} kPa of vapour in ${pKPa} kPa of air`);
  return (0.621945 * pwKPa) / (pKPa - pwKPa);
}

/**
 * One relative-humidity curve, `[t, W]` pairs from `tFrom` to `tTo`, with
 * `pw = φ · pws(t)`; φ = 1 is the saturation curve. W in kg/kg.
 */
export function rhCurve(phi, pKPa, tFrom, tTo, step = 0.5) {
  const out = [];
  for (let t = tFrom; t <= tTo + 1e-9; t += step) {
    const pw = phi * saturationPressure(t);
    if (pw >= pKPa) break;
    out.push([t, humidityRatio(pw, pKPa)]);
  }
  return out;
}

/** Whether (x, y) falls inside a closed polygon of `[x, y]` vertices, by the crossing number. */
export function inside(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
