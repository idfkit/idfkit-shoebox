/**
 * The parameter study: one control swept across its own face.
 *
 * A drag is authorship — every frame is the design. A sweep is a question: the
 * desk is solved at each position of one control, the model ends exactly where
 * it started, and the only thing that survives is the curve. This module holds
 * the part of that with no DOM and no engine in it, so the same Node script
 * that checks `applyModel` for idempotence can check the sampling too.
 */

export const SWEEP_SAMPLES = 21;

/**
 * The first pass of an automatic refresh. Eleven is not arbitrary: the raw
 * positions for n = 11 are `min + (i/10)·span`, which are exactly the even
 * positions of the 21-point grid, and snapping is deterministic per value —
 * so the coarse set is a strict subset of the full set. Densifying a coarse
 * study to twenty-one points therefore costs only the ten new runs; the
 * eleven already solved come back as cache hits.
 */
export const COARSE_SAMPLES = 11;

/**
 * The order to solve a curve's samples in, as indices into `points`.
 *
 * Serial sweeps read left to right because nothing was drawn until the end.
 * With samples landing on a pool and the card redrawn per point, order is
 * what the reader sees: ends first, then the current desk value (the one
 * point shared with every other study and with the sheet's own solve, so it
 * is the likeliest cache hit), then the middle, then recursive midpoints —
 * the curve's silhouette stands after four points instead of emerging from
 * one edge.
 */
export function sampleOrder(points, current) {
  const n = points.length;
  if (n === 0) return [];
  const seen = new Set();
  const order = [];
  const take = (i) => {
    if (i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  };
  take(0);
  take(n - 1);
  // `samplePoints` keeps the current value in the list verbatim, so an exact
  // match exists whenever the caller passed the list it built; the nearest
  // index covers a caller sampling around a value the grid swallowed.
  let nearest = 0;
  for (let i = 1; i < n; i += 1) {
    if (Math.abs(points[i] - current) < Math.abs(points[nearest] - current)) nearest = i;
  }
  take(nearest);
  // Recursive bisection over index ranges, breadth-first, so detail arrives
  // evenly across the face rather than finishing one half before the other.
  const queue = [[0, n - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift();
    if (hi - lo < 2) continue;
    const mid = (lo + hi) >> 1;
    take(mid);
    queue.push([lo, mid], [mid, hi]);
  }
  return order;
}

/**
 * Where to sample a control between its own min and max.
 *
 * Snapped to the step grid, because those are the only values the control can
 * actually hold — a curve through positions the slider cannot reach would be
 * lettering a desk that cannot exist. The current value is kept in the list
 * exactly as it is, not as its nearest gridded neighbour: the study's redline
 * tick stands on the current value, and the one point it must never miss is
 * the one under the tick. A coarse step legitimately collapses the list below
 * the asking count; fewer honest points beat twenty-one invented ones.
 */
export function samplePoints(control, current, n = SWEEP_SAMPLES) {
  const { min, max, step } = control;
  const grid = (v) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step));

  const points = [];
  for (let i = 0; i < n; i += 1) points.push(grid(min + (i / (n - 1)) * (max - min)));
  points.push(current);
  points.sort((a, b) => a - b);

  // Snapping goes through floating point, so "the same position" can arrive as
  // two numbers a few ulps apart. Anything closer than a thousandth of a step
  // is one position, and when one of the pair is the current value, the
  // current value is the one that survives.
  const tol = step / 1000;
  const out = [];
  for (const v of points) {
    if (out.length && Math.abs(out[out.length - 1] - v) < tol) {
      if (v === current) out[out.length - 1] = current;
    } else {
      out.push(v);
    }
  }
  return out;
}
