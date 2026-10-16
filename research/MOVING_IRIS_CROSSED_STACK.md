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

## Cases screened (independent loops and genuine serial loop)

- One module baseline.
- Two aligned toroids, nominal N/S alignment.
- Two devices 90 degrees apart with phase-shifted iris drive.
- Two parallel-axis devices, second electrode polarity and drive phase inverted.
- Two devices 90 degrees apart with counter-rotating *crank*, not magically reversed flow.

**Two distinct topologies, never conflated:** The original five stacked cases are hydraulically independent. Two new "IN SERIES" cases now put a moving diaphragm cavity at each of TWO nodes in the SAME closed circuit. They are coupled by two directed hydraulic branches with ideal nonreturn valves. The pair follows finite-volume continuity: C dp_i/dt = Q_in,i - Q_out,i - dV_i/dt. The shared fluid loop conserves mass at both moving walls, instead of adding invented pressures or injecting liquid twice. This is a credible reduced-order topology, NOT measured valve geometry, transient curved-duct CFD, flow separation or an experimentally calibrated pipe connector.

**No net electrical amplification is claimed:** Gross output is not the objective. For each case, the summed external motor power and coil/bulk losses are included. Permanent-magnet orientations may shape flux and currents but cannot create continuous work without an external energy source. A steady field does not provide ongoing magnetic fuel.

## Additional work required for material claims

1. Resolve a deforming actual membrane surface and stress/fatigue; current render uses a schematic torus wall and computed aperture values.
2. Replace uniform-duct loss with measured/validated curved-section transient CFD including moving walls, Dean flow and valve flow.
3. Replace ideal circuit and cosine mutual inductance with 3D field FEM and electrodes/contacts: rotation by 90 degrees need not imply zero coupling for off-axis, finite coils.
4. Compare identical pumping power at fixed operating point and loads over repeated cold starts; no hidden arbitrary kinetic-energy initialization.
5. Verify design safety for electrically conductive liquid metals; real oxidation, chemistry and membrane compatibility are not modeled.

The website is deliberately restored on the owner’s request, preserving the original V0–V13 code. This lab is a separate research route.

## Actual sequential-flow experiment

New source: public/toroidal-series-loop.mjs. It solves two chamber gauge pressures, the two forward-directed inter-chamber volume flows, two iris wall-volume histories, coupled currents and stored fluid/diaphragm/magnetic energy. Both chambers start at zero velocity and zero gauge pressure. One case shifts the second crank by half a cycle (traveling compress/expand motion); the control drives both in phase. The alternating strokes initiate circulation; synchronous strokes do not, under identical simplified model assumptions. No initial kinetic current, external spinning rotor or zero-cost magnetic work is injected.

Controls: ideal check valves are assumed on BOTH branches. Negative gauge pressure is not synonymous with cavitation: vapor-pressure/absolute-pressure bounds are checked separately. Finite-volume continuity and full energy budgets are tested, including reversible membrane compliance storage and electrical Joule/load losses. Drive cost counts positive wall work and nonzero electrical idle power. Negative wall work is NOT automatically credited as regenerated electricity.

Mathematical caution: with only two cell volumes, this model cannot predict secondary Dean vortices, dynamic pressure across the valves, actual toroidal branch lengths, 3-D swirling magnetic currents, or membrane stress. The cosine-law mutual inductance is a symmetry-dependent circuit approximation, not proof that physical orthogonal magnets always decouple.

This is now offered in the website workbench as two additional arrangements; do not compare the SUM of two independent loop flows directly with the ONE common serial loop flow as an engineering efficiency claim.
