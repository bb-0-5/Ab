# AboveBound / V10 pressure-driven membrane gear

This replaces Experiment 003's **sealed heated-cube ranking objective** with a hydraulically relevant, steady, pressure-driven **pore-network model**. It does not replace original V0–V13 code or claim to solve resolved Navier–Stokes.

## Chain

1. Use V10's existing gyroid, diamond, Schwarz P, lidinoid, neovius implicit-field formulas and the tested native-to-CFD voxel order bridge to construct solid / void masks.
2. For all six-neighbour **void-void** faces, assume a cylindrical capillary throat of radius 0.25 mm and length 1 mm, water 20°C (`μ=0.001002 Pa·s`). Solids have zero hydraulic conductance. Throat conductance `g=πr⁴/(8μℓ)`.
3. Inlet fluid voxels at `y=0` have pressure `1 Pa`, outlet at `y=n-1` pressure `0 Pa`; sides are sealed. Solve `Σ_j g (p_i-p_j)=0` for connected interior nodes. Only components with both inlet and outlet access participate in throughflow.
4. From the pressure solution, calculate signed face fluxes `Q_ij=g(p_i-p_j)`, inlet-outlet consistency, total Q [m³/s], and equivalent Darcy permeability `k=Q μ L/(A ΔP)` [m²] conditional on this artificial pore geometry.
5. The empty reference is an upper bound for the fixed-geometry, positive-conductance network. A membrane can **never be claimed to beat the unconstrained open cube**. A feasible membrane must contain 25–75% solid and deliver at least 20% of open-channel Q at 1 Pa. Among feasible membranes, maximize flow / minimize pressure needed for the target Q.
6. After testing V10's six base shapes, automatically test up to twelve bounded local mutations of the best admissible variants. If no variant meets constraints, report *no feasible result*. End; no perpetual fake work.

## Verification

- Unobstructed network matches the analytic parallel-throat conductance `Q = g × (n × layers)/(n-1) × ΔP`.
- A solid barrier yields exactly zero throughflow.
- A single axial pore yields `Q = g ΔP / (n-1)`.
- For the same network, removing bonds cannot increase conductance (electrical-network monotonicity).
- Inlet/outlet flux differences and interior Kirchhoff residuals bounded.
- All six V10 candidate shapes tested for physically bounded, finite results.
- Worker integration test ensures the finite campaign finishes, shows computed fields throughout, and rejects fake open-cube wins.

## What is NOT modeled

These assumptions cannot measure real printed pore radii or porous permeability without geometry and experiments; no inertia, resolved 3D velocity profiles, turbulence, pore entrance/exit losses, poroelasticity, surface wetting, solid conduction, heat exchange, physical pressure fluctuations, external experimental calibration or convergence study. This is a **network approximation, not CFD or a certified membrane design**.

The solver's 3D pressure data are rendered as two coupled 2D canvases. The field is independent of the user's browser's refresh timing. No particles are faked. Computation runs locally in a dedicated Web Worker.
