# Iris-actuated toroidal MHD stack — engineering model 005

Scope: extension of the user's supplied papers on diagonal toroidal elastomeric pumps, Villarceau/torus-knot flow trajectories, hydrodynamic inertia, staged iris expansion and conducting-metal electromagnetic harvesting. This replaces neither the original V0–V13 frontend nor its simulations.

Model source: public/toroidal-iris-stack.mjs
Visualization: public/toroidal-iris.html and public/toroidal-iris-view.mjs
Regression: node scripts/toroidal-iris-stack-smoke.mjs

## Coupling chain (computed rather than animated at random)

A/D are ground pivots of a planar four-bar mechanism, B is the crank endpoint, C is the circle-intersection coupler/follower junction. The distance AB, BC, CD, AD remains constrained. C's angle about D is transferred to a radial flexible-membrane aperture. That transfer is a kinematic *hypothesis*, not an as-built iris diaphragm linkage. Chamber volume is V=pi*r^2*length; dV/dt is calculated from the actual follower-angle derivative. An ideal check valve separately rectifies contractions into outlet flow and expansions into inlet suction.

Each torus has its own pressure compliance and hydraulic inertance. Q changes from rest according to

  inertia * dQ/dt = chamber-pressure - viscous-pressure-loss - electromagnetic-pressure-force

  compliance * dP/dt = rectified-chamber-displacement-rate - Q

These are time-stepped. The baseline duct losses are from the earlier diagonal torus energy-budget model. Its curved-duct correlation remains unsupported for variable-curvature/torsion torus knots.

For each electrical circuit, Faraday EMF is proportional to B*d*U and an RL load receives that induced voltage. Magnetic force on the fluid is the reciprocal reaction that consumes hydraulic energy. Two electrical loops couple through a passive inductance matrix (self L and mutual M); the 2x2 matrix stays positive definite. Idealized mutual M scales with cos(relative orientation), so 90-degree alignment suppresses *this* mutual-coupling proxy. The actual field map and coil placement have not been computed. Electrical inversion reverses EMF polarity; reversing iris-crank rotation independently changes stroke sequence. Check valves govern fluid direction.

Budget: externally supplied hydraulic pressure-volume work = viscous heat + load electrical heat + internal conductor heat + stored fluid kinetic, membrane compliance and magnetic energy, to the declared integration tolerance. Motor efficiency and a nonzero per-device idle load are counted in electrical net power.

## Cases screened (independent loops)

- One module baseline.
- Two aligned toroids, nominal N/S alignment.
- Two devices 90 degrees apart with phase-shifted iris drive.
- Two parallel-axis devices, second electrode polarity and drive phase inverted.
- Two devices 90 degrees apart with counter-rotating *crank*, not magically reversed flow.

**Important:** The two stacked loops are hydraulically independent. This first model does NOT claim that fluid is passing through both pumps sequentially. A hydraulic series model needs extra shared inlet/outlet pressure states, valve leakage, transient interfaces, pipe connectors and an experimentally calibrated full-circuit pressure loss map. Joining pressure sources by addition without volume continuity would manufacture energy.

**No net electrical amplification is claimed:** Gross output is not the objective. For each case, the summed external motor power and coil/bulk losses are included. Permanent-magnet orientations may shape flux and currents but cannot create continuous work without an external energy source. A steady field does not provide ongoing magnetic fuel.

## Additional work required for material claims

1. Resolve a deforming actual membrane surface and stress/fatigue; current render uses a schematic torus wall and computed aperture values.
2. Replace uniform-duct loss with measured/validated curved-section transient CFD including moving walls, Dean flow and valve flow.
3. Replace ideal circuit and cosine mutual inductance with 3D field FEM and electrodes/contacts: rotation by 90 degrees need not imply zero coupling for off-axis, finite coils.
4. Compare identical pumping power at fixed operating point and loads over repeated cold starts; no hidden arbitrary kinetic-energy initialization.
5. Verify design safety for electrically conductive liquid metals; real oxidation, chemistry and membrane compatibility are not modeled.

The website is deliberately restored on the owner’s request, preserving the original V0–V13 code. This lab is a separate research route.
