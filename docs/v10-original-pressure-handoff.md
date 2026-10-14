# Original V10 → pressure network handoff (R6)

**Scope.** The original V0–V13 app selects a V10 mesh. Once its route and
geometry are qualified (or the autonomous V9/V10 material sweep chooses one),
the original App exports **the actual built V10 solidMask** into browser-local
same-origin storage under \`abovebound:v10-pressure-selection:v1\`.

V10's native indexing is \`(x*n+y)*n+z\`. A packed checksum-protected receipt
holds the exact mask transformed to pressure-network ordering \`(z*n+y)*n+x\`,
along with TPMS config, resolution, provenance and time. No user inputs,
credentials, AWS or uploaded masks are involved. Changed masks are exported;
unchanged ones are not written every frame.

The independent pressure worker runs a matched **empty** reference and
pore-network pressure solve at the **same voxel grid resolution** as this
receipt. The UI reports the actual source design and the fraction of same-grid
open flow. The worker then runs a separate, cheaper 13×13×9 autonomous search
seeded by the selected V10 configuration. **Do not rank absolute flow rates
between different grid sizes.** Any native-grid result and its model assumptions
remain visible independently. Model evidence carries the original checksum
back to local storage so a later V10 session cannot attribute it to a
different mesh.

**Limitations.** This is a coarse pressure-driven throat-network
approximation with equal assumed cylindrical throat radii, not resolved
Navier–Stokes CFD or proven permeability. A geometry can be rejected on model
constraints, but feasibility is conditional on the model assumptions and
numerical convergence. The original V0–V13 discovery engine is preserved;
the feedback is exposed as provisional evidence, **not automatically allowed
to mutate upstream materials** until physical validation is built.

**Use:** Open Original V0–V13 and let V10 form a connected selected geometry.
Open AboveBound's membrane laboratory on the same origin. The selected mask
is read automatically. If there is no valid source receipt, the usual
independent V10 auto-sweep runs and the site says so explicitly.
