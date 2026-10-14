# AboveBound live fluid-physics experiment

The main page remains the original V0–V13 React/Three.js application. Its entry point is restored, with a compact link to `/fluid.html`. The Cloudflare Pages `_worker.js` now serves assets instead of intercepting everything with HTTP 404. The code does not add cloud compute or AWS dependencies.

`/fluid.html` is a standalone, interactive numerical-field inspector. It presents:

- **Closed cavity:** the 12³ 3-D Boussinesq velocity/temperature/solid mask produced by the Python research module, converted to a bounded binary payload in `public/fluid-fields.json`. Display changes, slice selection and velocity-following tracers are interactive in the browser. **The numerical cube state is an archived snapshot, not a live online CFD recalculation.**
- **Periodic torus:** a live analytic Taylor–Green flow on T² that satisfies viscous unforced incompressible Navier–Stokes exactly. The browser updates the analytic fields with time; no numerical approximation of the PDE is involved. Smoothness of this special 2-D solution (and its trivial 3-D extension) is **not** a proof for all initial conditions in T³.

The automatically ranked candidate geometries are from the prior **coarse** Python campaign. Differences between 12³ and 16³ results show that mesh independence has not been established. The solver has approximate wall physics and has not been validated against published three-dimensional natural-convection benchmarks. Do not market the displayed numbers as engineering validation or physical discovery.

Test the new frontend data and torus identities with:

```sh
node scripts/fluid-physics-smoke.mjs
```

Original CI and Python cavity tests must remain passing. This release is a public **experimental research viewer**, not a browser-based Python server or scientific certification.
