# One-screen cross-domain design + printable sci-fi costume concepts

AboveBound's static client now renders ONE interactive visual field linking
five user-facing goals: building, chemistry, membranes, circuits and suit/FDM.
Click any visible node to select a domain. The centre artwork is deliberately
labelled **SCHEMATIC**: no simulated molecule, ray-traced material, FEA
deformation, thermal field, flight trajectory, CFD turbulence or RF board
trace is implied by an animated figure.

A current simulation creates evidence-labelled discoveries; a later run
retrieves stored findings, then independently probes compatibility under
its own physics and medium/temperature/pressure constraints. The app
visualises the links and explicitly reports unsupported findings. No
validated physical property is learned merely by sharing a visual node.

## Hard constraints: cheapest printable sample, not weakest imaginable part

The costume/FDM solver samples 3 generic polymers × 7 thicknesses ×
6 frame-rim widths = 126 alternatives. It **minimizes modeled production
cost** under the intersection of:

- Bed width/height in mm; the asset can be laid flat in either rotation.
- A budget, expressed as estimated AUD per PART, not an entire suit.
- Selected operating temperature, screened against illustrative filament
  softening temperatures with an additional conservative margin.
- Minimum frame-rim width and a **geometry-only**
  `rimWidthMm × thicknessMm³` section proxy in mm⁴. This is NOT
  a measured bending stiffness, allowable stress or a flight load case.
- Minimum solid plate thickness and topology restrictions allowing a
  through-hole that removes material relative to a full plaque.

For each feasible candidate the program estimates cubic mm of solid frame,
converts to grams using illustrative material densities, then computes
estimated material/print electricity cost using the **user's** filament
price per kg and clearly stated default waste and electricity scenarios.
No vendor prices are ingested. The display overlays cost versus section
points and selects the lowest-cost candidate that passes ALL stated gates,
not an infeasible cheap option. No claims about structural safety, fatigue,
sweat, skin suitability, fasteners or actual filament strength.

A selected candidate can be downloaded as a **closed manifold ASCII STL**
of a thin decorative frame. Units are interpreted as millimetres by normal
desktop slicers (STL itself has no built-in standard units). Mesh tests check
no degenerate facets and every undirected edge belongs to exactly two
triangles. Lay the flat base on the printer bed; check the print footprint,
slicer warnings, extrusion temperature, perimeters, support/adhesion and
material compatibility before printing. Only ONE costume panel is exported;
the visual Iron Man-inspired full-body silhouette is NOT a full multi-part
CAD suit.

Run `npm run test:fabrication`: print affordability, rejection of too-small
beds and high temperature, loss of 3D-printable eligibility at low budget,
closed mesh and deterministic candidate reproduction. Worker integration
also covers FDM costume parts and hot-vacuum rejection.

## Why flight is a separate, unqualified research programme

Real powered human flight would require independent evidence for
propulsion thrust/controls, battery or fuel energy/power, heat flux,
mechanical support under dynamic loads, fault tolerance, flight control,
lifesaving provisions, airworthiness and legal approvals. These cannot
be inferred from a decorative STL or an assumed geometric section index.
AboveBound currently outputs **viableForHumanFlight: false** for ALL suit
concepts and cannot certify, simulate or instruct how to build a
human-carrying flight system. Any future flying suit project would need
safety-reviewed engineering and independently benchmarked subsystems.

## Next verifiable research stages

1. Replace illustrative filament density, pricing and softening thresholds
   with real user-selected datasheets and uncertainty envelopes.
2. Upgrade geometric frame proxy to tested, anisotropic FDM polymer coupon
   data (print orientation, creep, infill, temperature, fatigue). Maintain
   explicit evidence status.
3. Build repairable, safely wearable modular visual costume components
   only after human fit and tolerance constraints have been measured.
4. Evaluate flow membranes with geometry-dependent pressure-drop and
   heat-transfer correlations, anchored to experimental samples.
5. Add numerical Pareto fronts with statistically meaningful uncertainty.
   Do not falsely report robust optimisation when all cost inputs are
   assumed or measurement-free.

The active application runs on the user's machine, with optional private
Supabase backup. No AWS execution or device printer control is involved.
