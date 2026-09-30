/**
 * The predicted mean vote, for the comfort zones of the psychrometric view.
 *
 * Shared by `scripts/build-comfort.mjs`, which traces the §5.3.1 zones with it,
 * and `comfort.js`, which re-evaluates it at every vertex of those zones at
 * load: a polygon edited or shifted by hand no longer sits at PMV ±0.5 and
 * refuses to load. DOM-free.
 */

/** The conditions ASHRAE 55-2020 Figure 5.3.1 is drawn at. */
export const FIGURE_531 = Object.freeze({ met: 1.1, speed: 0.1, pressure: 101325, top: 0.012 });

/** Vapour pressure in Pa of air at humidity ratio W (kg/kg), total pressure P (Pa). */
export const vapour = (W, P = FIGURE_531.pressure) => (P * W) / (0.621945 + W);

/**
 * Predicted mean vote, ASHRAE 55-2020 Appendix B / ISO 7730 §4.1.
 * `pa` is the partial pressure of water vapour in Pa.
 */
export function pmv({ ta, tr, vel, pa, met, clo, wme = 0 }) {
  const icl = 0.155 * clo; // m²K/W
  const m = met * 58.15; // W/m²
  const w = wme * 58.15;
  const mw = m - w;
  const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(vel);
  const taa = ta + 273;
  const tra = tr + 273;
  const tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);
  const p1 = icl * fcl;
  const p2 = p1 * 3.96;
  const p3 = p1 * 100;
  const p4 = p1 * taa;
  const p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;
  let xn = tcla / 100;
  let xf = tcla / 50;
  let hc = hcf;
  for (let n = 0; Math.abs(xn - xf) > 0.00015; n += 1) {
    if (n > 150) throw new Error('pmv: the clothing surface temperature did not converge');
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25;
    hc = Math.max(hcf, hcn);
    xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc);
  }
  const tcl = 100 * xn - 273;
  const hl1 = 3.05e-3 * (5733 - 6.99 * mw - pa); // skin diffusion
  const hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0; // sweating
  const hl3 = 1.7e-5 * m * (5867 - pa); // latent respiration
  const hl4 = 0.0014 * m * (34 - ta); // dry respiration
  const hl5 = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4); // radiation
  const hl6 = fcl * hc * (tcl - ta); // convection
  const ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
  return ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
}

