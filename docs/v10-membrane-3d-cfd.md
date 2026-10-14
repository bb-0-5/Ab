# V10 mesh → pressure-projected 3D slice fluid coupling

This is AboveBound's third physics experiment, mounted at `/membrane.html`. It adds a local Web Worker search across six V10 TPMS geometries, tests six-neighbour through-void connectivity, then runs each qualifying solid/void field through an incompressible 3-component staggered-grid solver. The empty cavity is retained as a reference, **not** silently promoted as a membrane candidate. The best admissible V10 membrane in a fixed short transient study is re-run at a finer resolution for live inspection.

## Scope

- `public/v10-membrane-masks.mjs`: reproduces each TPMS implicit function in `src/simulations/v10_mesh.ts` and includes a byte-precise coordinate-order adapter `fromV10SolidMask` for the original V10 engine's `solidMask`. Parity is verified against the actual TypeScript engine in GitHub CI.
- `public/slice-engine.mjs`: accepts an optional cell-based solid mask. Solid voxels are excluded from the momentum / pressure Poisson domain; fluid-normal velocities on each solid interface are forced to zero. Fluid temperature is advected conservatively, with adiabatic no-flux boundaries against solid voxels. Ordinary no-obstacle experiment remains backward-compatible.
- `public/membrane-worker.mjs`: nonblocking browser-local numerical search, conservative connectivity and divergence checks, no material inputs, selects a V10 geometry using fixed-time cold-plate heat flux and reruns it at a finer grid.
- `public/membrane-ui.mjs` and `public/membrane.html`: separate route with two canvases: in-plane velocities, signed perpendicular flow and solid material; depth-stack views and honest candidate evidence ledger.
- `scripts/v10-membrane-smoke.mjs`: six geometry smoke checks for finite fields, pressure correction and impermeable solid faces.
- `scripts/v10-membrane-parity-smoke.ts`: exact masks match native V10 for the five TPMS formulas.

## Important physical limitations

This is a **sealed, buoyancy-driven cubic cavity** with interior solid obstacles. It is not a permeability experiment because there is no net inlet/outlet water flux. Solid voxels are **adiabatic**; true solid heat conduction/conjugate heat transfer and material properties are *not* included. Candidate ranking uses a **transient 65-step result at 13×13×7 resolution**, with 19×19×9 for the selected live run: it is neither steady-state nor mesh-converged. The Navier–Stokes discretization remains exploratory; tangential no-slip is approximate at voxel boundaries. Do not interpret scores as an industrial CFD design certification or a physical heat-transfer gain.

This is a first numerical **geometry-to-physics bridge**, not yet a bidirectional live feed from the existing original V10 scene. `fromV10SolidMask` is the exact-order adapter for wiring the current V10 scene into this engine in a later stage.
