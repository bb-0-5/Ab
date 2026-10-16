# Toroidal iris/MHD feasibility audit

Basis: the user-supplied research documents "Mechanical Architecture and Fluid Kinematics of a Diagonal Toroidal Elastomeric Pump with Hydrodynamic Momentum Recovery and Symmetrical Iris Actuation" and "Synthesis of Magnetohydrodynamic and Electromagnetic Energy Harvesting in Moving-Membrane Diagonal Toroidal Systems."

These are engineering proposals, NOT experimental proof of a working pump or generator.

## Scope

- Sample a closed diagonal torus-knot channel centerline using R, r, poloidal/toroidal windings, numerical length and mean curvature.
- Screen incompressible fluid speed under a given EXTERNALLY SUPPLIED actuator head using Darcy–Weisbach and a validity-bounded White curved-pipe correction.
- Enforce the ideal MHD electrical ledger at a resistive load: Lorentz work = harvested electrical energy + Ohmic/Joule heat.
- Include external motor power, pump efficiency and nonzero idle losses in the net result.
- Time-step a 1D hydraulic fluid inertance under phase-shifted, prescribed actuator pressures; compare pulse smoothing with 1 vs 4 heads.
- Produce machine-readable numerical receipts for future V0–V13 coupling.

Commands: npm run test:toroidal and npm run audit:toroidal.

## Energy ledger

P_ohmic + P_electric = P_Lorentz.
P_shaft_or_motor >= deltaP_total * Q.
P_net_electric = P_electric - P_motor.

An externally driven loop cannot count its electricity output without the pump's electricity input. No free circulation or numerical perpetual motion is allowed. Large gross MHD output may still produce a larger magnetic pressure loss.

## Model limits

This is a reduced-order hypothesis, not CFD, moving-mesh FSI or real experimental certification. The torus is a centerline and the duct a circular approximation; membrane walls and articulated iris linkages are NOT solved. Curved-pipe correlations were developed for circular, uniformly curved pipes, not arbitrary torus knots with varying curvature and torsion; their use for diagonal channels is diagnostic only. Dean vortices, valve closure, electrode currents in 3D, wall shear/heat transfer, chemical oxidation, temperature gradients, elastomer strain and wall fatigue need separate models. Galinstan numbers assume ideally clean metal; no chemical treatment advice is provided.

Pressure pulses are prescribed external work; smoothing can be tested but does not prove momentum recovery. No arbitrary flywheel-efficiency bonus is added.

## How this fits original V0–V13 (future work, NOT yet wired)

V0–V8 select candidate conditions and retain failed hypotheses.
V9 and V13 supply material-property hypotheses, separating estimates from measurements.
V10 provides actual channel centerline/area and solid boundaries.
V11 will provide mechanical iris linkage, electrodes and field geometry.
V6 should compute flow, pressure, electrical extraction and chronological energy closure.
V7 should rank conservation-checked candidates; never rank gross load power alone.

Future promotion requires experimental benchmarking of flow and voltage, limits of validity, convergence and failure modes.

The website remains deliberately OFFLINE until the owner asks for a deployment.

## Formula sources

The supplied research documents were independently compared against IAEA's Sodium Coolant Handbook for White's curved-duct correction and published MHD generator Ohm-law/load-factor power relationships. The numerical sample inputs are test conditions, NOT measured device parameters.
