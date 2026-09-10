# Contract: `src/relief.js`

The only new DOM-bound module. Everything it draws comes from `latticeOf` and
`meshOf`, so it invents no geometry of its own.

## Exports

### `createRelief(host, { onPick }) -> Relief | null`

Returns `null` where no WebGL2 context can be had. The caller then states that in
place with its reason and carries every reading on the plan and the schedule
(FR-024). It must not substitute a still image or an empty frame.

### `relief.draw({ mesh, lattice, coverage, stance, view })`

One draw call over an indexed triangle mesh. Vertices carry height and a measured
flag. No shadows, one hue, ink levels only: the reading is not a signed physical
quantity, so `--cold` / `--warm` are **not** used (design system, and the reason the
survey is grey rather than a heatmap).

### `relief.view` and `relief.setView(view)`

A constrained orbit (FR-018d):

- azimuth steps in fixed increments, wrapping
- elevation clamped to a legible band
- **no pan, no zoom, no free flight**
- named viewpoints: from the stance, along the fall line, plan down

`setView` **snaps**. It does not animate, so a reader who has asked for reduced
motion loses no view (FR-018f).

### `relief.contextLost` handling

`webglcontextlost` must be handled: the survey states the loss in place and keeps
every reading (FR-024). It must not silently re-create and pretend nothing happened.

## What this module must not do

- It must not be the only carrier of any reading, gesture or refusal (FR-018c).
- It must not offer vertical exaggeration (FR-018g). Its vertical scale is stated.
- It must not coarsen its mesh by viewport (FR-018k). A phone draws what a desk draws.
- It must not letter a figure. Lettering belongs to the plan and the schedule, which
  read spot heights; the relief carries the shape and the posts.

## Accessibility contract

Every camera move is reachable from the keyboard and from a coarse-pointer target
(FR-018e). The host keeps `role="img"` with an `aria-label` stating the current
viewpoint and the coverage, following the plate's precedent, and picking a point is
mirrored by an equivalent route on the plan so the relief is never the only way to
reach a design.

## Budget

Roughly 20 KB of source including GLSL, inside SC-012's 60 KB transfer ceiling. It
starts unasked on a phone beside a resident 28 MB engine and a 256 MB heap, which is
why the mesh is capped at 121 cells and the draw is a single indexed call.
