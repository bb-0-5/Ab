# AboveBound: 3-component cross-sheet fluid model

## What changed

The original slice experiment treated each XY layer as a separate 2D streamfunction solver, with only thermal/momentum diffusion through Z and `w=0`. The new implementation uses one *three-dimensional* staggered MAC velocity field, u at X faces, v at Y faces, w at Z faces, and cell-centered pressure. A shared pressure Poisson solve couples all sheets and corrects divergence; water can move through interior Z faces. Every sheet still renders as a 2D plane; the stack makes this coupling visible without pretending that averaging independent 2D solutions yields 3D physics.

### Physics/gears

- Initial fluid at rest. The bottom is heated with a nonuniform X/Z hotspot, the top is cold, horizontal and Z-facing side walls are insulated; all faces are impermeable.
- Boussinesq buoyancy drives +Y momentum, followed by three-component advection/diffusion and a global 3D pressure correction enforcing the discrete incompressibility constraint.
- Pressure iterations are chosen until a target maximum post-projection divergence is reached (or a capped iteration budget). The solver **does not skip necessary dynamics**: all cells need to participate in 3D mass conservation.
- Temperature is advected through X, Y and Z faces by the pressure-projected velocities and diffuses in all three directions.
- Renderer shows a 2D XY slice with in-plane velocity arrows and coloured Z-crossing indicators; the second canvas displays all the Z planes. `w>0` is amber (towards +Z), `w<0` cyan (towards −Z).
- The most salient layer is selected from computed gradients/motion/through-plane flux. Its distance weights what we inspect, **not physics** or probability of an outcome.

### Tests

`node scripts/slice-engine-smoke.mjs`

Tests include initially stationary fluid; conservation at all six sealed boundary faces; adaptive 3D pressure projection reduces discrete divergence; both positive and negative Z face flow emerge from asymmetric heating; and snapshot fields are finite. This is a **numerical smoke test**, not independent physical validation.

### Limitations

Non-dimensional, incompressible, laminar Boussinesq demonstration, coarse mesh. First-order upwind momentum/scalar advection, approximate rigid-wall tangential treatment, global pressure SOR with bounded iteration count and no mesh-independence/analytical cavity comparison. It does not model solid internal membranes or compressibility, is not a certified CFD solver, and says nothing about general Navier–Stokes smoothness.

### Release

Files: `public/slice-engine.mjs`, `public/slice-worker.mjs`, `public/slices-ui.mjs`, `public/slices.html`, `scripts/slice-engine-smoke.mjs`. Static Cloudflare Pages build includes `public` unchanged. This only changes `/slices.html`, leaving original V0–V13 and torus routes intact.
