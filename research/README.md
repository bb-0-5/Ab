# AboveBound — first physical closed-cavity experiment (OFFLINE)

This module is independent of the website. **AboveBound.org stays HTTP 404.**
It starts with a completely closed cube filled with single-phase water,
heated from below and cooled from above, with stationary impermeable walls.
Water is allowed to circulate internally due to buoyancy, but cannot leave.
The engine tests a small automated range of impermeable, **thermally insulating**
obstacles, then mutates the baffle geometry and ranks modeled heat extraction
at the cold top plate. No user-supplied material selection is required.

## Windows, PowerShell

From the root of the cloned `Ab` repository:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r research/requirements.txt
python -m unittest discover -s research/tests -v
python research/run_cavity_campaign.py
```

Results appear in `cavity-results/`:

- `report.json`: baseline, all candidates, modeled Nusselt numbers, checks.
- `winner_fields.npz`: full 3-D temperature, velocity, solid occupancy fields.
- `winner_midplane.json`: simple 2-D data contract for a future Hexfield renderer.
- `winner_midplane.png`: diagnostic temperature/flow slice if matplotlib exists.

## Physics and claims

We use a **3-D Boussinesq approximation** to incompressible Navier–Stokes,
with scalar thermal transport. Temperature controls buoyancy; fluid advects
its own momentum and temperature. A staggered finite-difference pressure
projection enforces divergence-free flow and exactly zero normal face velocity
on the six walls and internal obstacles. An approximate ghost-cell viscous
boundary treatment supplies drag near solids; this **does not yet implement
an accurate cut-cell no-slip boundary condition**. The solver is a research
prototype, **not** an independently validated commercial CFD tool.

A fluid is characterised here by dimensionless Rayleigh number `Ra=20000`
and Prandtl number `Pr=7`, representative of warm water in a millimetre-scale
heated cavity. The model is a constant-property single-phase approximation,
not individually simulated H2O molecules. Dimensional translation needs
cavity size, temperature difference and verified temperature-dependent water
properties. No inlets, outlets or arbitrary moving decorative particles.

The baseline is the **empty cavity**, and the score is the dimensionless
Nusselt heat flux through the cold top plate at the fixed temperature
difference. A positive model score is not proof of a physical invention.
Both coarse-grid and a separate 16³-grid winner-vs-baseline evaluation are
included. Mesh refinement, time-step convergence and published cavity-flow
benchmark comparisons are still required before engineering claims.

The app's original V0–V13 source remains unchanged. A future bridge should
accept real V10 solid masks and send these typed fields to Hexfield without
letting the visualization influence the physics.