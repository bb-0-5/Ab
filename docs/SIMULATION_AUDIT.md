# AboveBound simulation audit: legacy V0–V13 and browser-only physical screens

**Scope:** source-level assumptions, output semantics, and deterministic
regression tests. This is NOT independent scientific validation of the legacy
engines. See also scripts/sim-smoke.ts, which verifies finite/sensible
execution across the V0–V13 chain but not scientific accuracy.

| Version | What is computed | Unverified or misleading leap |
| --- | --- | --- |
| Fundamental / V0 | visual seeded compression field | No calibrated physical pressure or state law. |
| V1–V2 | stabilization fields and node motions | Not tested as a particle/thermal-field numerical solver. |
| V3–V4 | graph routing and MST-style paths | Graph weights aren't automatically real wire/duct loss. |
| V5 | generated membranes and boundary loops | Topology isn't a certified manufacturable channel. |
| V6 | approximated flow and microstrip visual metrics | **Not** PCB/DDR/PCIe impedance signoff. Microstrip parameters are inferred from abstract loop areas; circuit "mismatch" is variance across generated paths rather than termination reflection, and abstract perimeters aren't physical millimetres. |
| V7 | heuristic metasearch of upstream configurations | Arbitrary composite fitness isn't measured energy or RF quality. |
| V8 | zeta/prime visualization and numerical phases | Mathematically exploratory, NOT a source of physical wavefunction, impedance or reaction propensity. |
| V9 | approximated lattice/material fields | Lacks independently measured constitution/EPDs. |
| V10 | TPMS iso-surfaces, porosity and topology proxies | Geometry isn't yet structural, flow/pressure, or manufacturability validation. |
| V11 | box, PCB, ports and boundary constraints | Product envelope alone cannot confirm EMC or route quality. |
| V12 | simplified thermal, mechanical air and climate | Annual load and airflow screening, not certified EnergyPlus/CFD/ASHRAE 140. |
| V13 | atom shells, isotope/bond heuristics, bulk-property estimates | Not electronic-structure quantum chemistry, kinetic modelling, nuclear half-life evidence or verified real material properties. Prime resonance is descriptive, not a chemical determinant. |

## Physically scoped new browser computations

**Building:** Site + Shadow and joint mechanical airflow share degree-day
balance point, climate and room-area accounting. Optional user-uploaded EPW
dry-bulb (≤5 MB, station ≤75 km from location) informs annual temperature
loads locally; façade irradiance and hour-by-hour thermal dynamics are
NOT solved. Generic material/manufacturing factors remain assumptions.
Only bounded *screening* constraints, no structural approval.

**Electronics:** Local passive two-element L network computes complex
series/parallel impedances, load voltage and delivered power from a
1 Vrms Thevenin source. Searches sample E12 L/C values, two L orientations
and centre/band frequencies. Assumed component Q, no measured parasitics,
no PCB dielectric stackup, trace lengths, via, termination reflections or
S-parameters. Conservation regression asserts load power never exceeds
available source power; an unaltered 50Ω–50Ω circuit delivers 100%.

**Chemistry:** The new categorical exclusion simulator uses explicit
hypothetical route prevalence and branching probabilities. It distinguishes
desired-product SELECTIVITY among processed feed from ABSOLUTE YIELD
per *original* feed. Removing routes alone cannot increase absolute target
output if pathway conversion rates are unchanged; a better result would
need verified barrier/kinetic/recovery changes. No quantum-wave or actual
reaction-yield predictions, catalyst recipes, synthesis conditions or
experimental claims.

## Evidence and software tests

- Existing deterministic legacy engine smoke covers initialization and
  finite state, not calibration of underlying claims.
- Browser module tests cover passive power conservation, unit limits,
  normalized probabilities, throughput and no-phantom chemical yield.
- Building tests cover conservation, area comparability, climate parity,
  and reproducible same-geometry computation.
- Device worker is the only public compute path. No AWS/Express/WebSockets.
  Historical Node/server files remain in Git history for data export;
  **their scientific score outputs are not treated as proof**.
- Optional cloud memory via Supabase Auth + owner-only RLS never performs
  simulation and may be absent; local device storage remains usable.

These checks are a screening sanity gate, not experimental proof, a
board-manufacturing specification or regulatory construction certificate.
