# Passive pressure-constrained torus — physical hypothesis and numerical gate

Owner's question: can high-pressure liquid remain nearly stationary while membrane geometry biases motion along an angular torus without motors?

**Physical constraint:** A stationary closed torus at spatially uniform pressure does not produce sustained circulation. A passive, fixed, reciprocal porous membrane can impose anisotropic resistance, change pressure-wave travel times and damp fluctuations, but cannot continually pump a closed loop without another energy source or gradient.

## Scope and files

- public/toroidal-passive-pressure.mjs: 96-node fixed-wall, compressible liquid, periodic 1D hydraulic/acoustic model.
- public/passive-torus.html and public/passive-torus-view.mjs: 2D torus with inherited membrane constrictions, 3D V10 voxel cross-section browsing, pressure wave profile, energy and flow receipts.
- scripts/passive-pressure-torus-smoke.mjs: uniform-pressure rest, energy closure, V10 topology, positive attenuation and finite MHD output gate.

The equations are
  C_i * dp_i/dt = Q_(i-1) - Q_i
  L_i * dQ_i/dt = p_i - p_(i+1) - R_i * Q_i

C_i=A_i * dx/K, L_i=rho*dx/Aedge, R_i>=0. These govern *pressure perturbation* p_i relative to static background pressure P0, not absolute pressure. Numerical scheme is implicit midpoint with a converged fixed-point solve. Recoverable acoustic energy E=(1/2)sum_i(C_i p_i^2+L_i Q_i^2), and its loss must match nonnegative viscous heat, electromagnetic Lorentz braking converted to Joule heat, and electrical load energy. No energy enters after the initial condition.

## Tests

Uniform 10 MPa or 40 MPa at zero initial velocity: exactly zero flow forever in this model. A one-time small 800 Pa perturbation on top of 10 MPa is prepared with zero net excess pressure-volume integral so it does not silently add mass to a closed torus. It propagates around the ring, damps and may reflect off uneven membrane-derived impedance. Repeating with ideal conductive liquid can recover a tiny, finite amount of the initially supplied disturbance's acoustic energy but cannot operate continuously.

## Real V10 membrane

The imported solid mask is the exact selected V10 solid/void voxel grid if present and checksum verified on the same origin. Otherwise the app explicitly labels a V10-generated fallback. The frozen grid's z-plane local void occupancy constricts each equivalent toroidal segment. The matched-grid V10 reference conductance ratio provides a bounded resistance proxy. This is a reduced-order projection, not a physical transformation of a cube into a deforming toroidal elastomer, a measured permeability tensor, or a validated metal-pore coupling. No fictitious vortex or circulation source is inserted.

## Scientific limitations

- Isothermal, small-amplitude, linear, 1D pressure waves in a rigid annular equivalent tube; no 3D CFD, membranes deforming, surface wetting, capillarity, shock physics, valve flows or Dean vortices.
- The conductive-metal values are illustrative clean-liquid material properties; wall oxidation and real electrode geometry not solved.
- The MHD term is idealized positive braking under a uniform imposed field, NOT a proof of generation from stationary metal.
- Real vessel and membrane compliance, physically realistic absolute-pressure bounds, fatigue and initial perturbation energy must be measured.
- A future candidate is admitted only with validated pressure and flow data, conservation, grid convergence and a real external energy accounting.

The original actuated iris experiment is retained at /toroidal-iris.html. The passive experiment is separate at /passive-torus.html.
