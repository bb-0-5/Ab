# V10 membrane compression / flow → Toroidal Iris geometry handoff

Source code:
- public/v10-pressure-handoff.mjs: decodes checksum-verified exact original V10 solid/void voxel mask from same-origin saved selection; created by src/lib/v10_pressure_bridge.ts, no regenerating from TPMS parameters.
- public/toroidal-membrane-bridge.mjs: solves the EXACT inherited voxel geometry through public/v10-pressure-network.mjs against an identical-size all-open reference.
- public/toroidal-iris-stack.mjs and public/toroidal-series-loop.mjs: use the derived material/void evidence in 1D hydraulic and time-stepped moving iris calculations.
- public/toroidal-iris-view.mjs: renders actual source solid/void slices and shows its provenance and numerical effect.

**If a saved original V10 selection exists**, the selected voxel mask's values (including defects and topology changes) are used as-is. A checksum error or a stale/invalid saved mask cannot be admitted as the user's exact original geometry. If there is no valid saved selection, a labeled, deterministically generated 13×13×9 V10 Schwarz-P geometry is used, rather than pretending the original is loaded. Use the original V0–V13 application's V10 stage on the SAME ORIGIN, then reload /toroidal-iris.html to import the original.

## Coupled quantities, with explicit units

Pore-network V10 (steady single-phase WATER, assumed pitch=1 mm, throat radius 0.25 mm) calculates Q_open and Q_mask at a fixed 1 Pa boundary pressure, matching each mask's resolution.

The dimensionless ratio r = Q_mask/Q_open is in (0, 1]. If mass balance fails, through-void connection is absent or the solver does not converge, geometry is rejected. For a bounded screening regime 1 <= Q_open/Q_mask <= 30, the ratio Q_open/Q_mask multiplies the toroidal liquid loop's curved-duct viscous pressure loss at the same Q.

The connected-fluid storage occupancy f = N_open_connected / N_total also scales the fluid volume displaced by the actuator's circular-envelope membrane: V_fluid(t) = f*pi*r_iris(t)^2*chamber_length, dV_fluid/dt = f*dV_envelope/dt. All hydraulic branches still solve the original continuity and electromagnetic back-pressure equations; no arbitrary momentum or electrical power is created.

This transfer preserves source geometrical evidence as a *static porous insert* and makes the toroidal calculation depend on it. It is a **reduced-order, unvalidated constitutive hypothesis**, NOT a valid transformation of cubic V10 porous geometry into an actual toroidal elastic shell. In particular:

- The V10 static solid mask is NOT a measured elastomer or a solved moving wall.
- The render displays exact unchanged V10 voxel slices, adjacent to the toroidal schematic. It never represents the voxel field as a fully simulated moving 3D torus.
- A water-phase pore-network conductance ratio is not necessarily transferable to Galinstan; the metallurgy, surface oxidation, chemistry, pore wetting and capillary entry pressure require a separate model.
- Real moving-wall deformation changes pore radii, topology and fluid field in time. The current R value and f remain fixed while the actuator's own kinematically calculated volume changes.
- Motor and magnetic electrical work remain explicitly counted, so output cannot be called energy gain.

## What would make the geometry genuinely physical?

The next scientifically defensible step is a coupled moving-boundary solver with an explicit toroidal coordinate map, a mesh of the elastomeric iris wall, a fluid-filled porous volume with pore-dependent resistance as the wall deforms, pressure/velocity feedback to wall stress, and independent energy/mass conservation. Material properties must come from validated constitutive data and the result must be checked for grid and time-step convergence against independent benchmarks.

## Reproducible checks

node scripts/toroidal-v10-membrane-handoff-smoke.mjs

Covers native mask checksum round-trip, orientation/contents, all-open matched reference, a deliberately corrupted mask, flow resistance and fluid occupancy assumptions, their influence on actual chronological toroidal flow, and a low relative energy-balance residual.
