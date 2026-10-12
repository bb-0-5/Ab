# AboveBound — original simulation laboratory

**Live:** https://abovebound.org

**The homepage is the original simulation application:** `src/App.tsx`
(imported by `src/main.tsx`). The previous autonomous research dashboard
(`src/local/LocalApp.tsx`) and the replacement engineering workbench
(`src/local/TechApp.tsx`) are *not* the live homepage. Their files are
preserved only for potential individual reuse. Do not reintroduce either
homepage without a specific user request.

## Original simulations restored

The original application renders the real-time Three.js
`SimulationView`, with the original category selectors, visuals,
animation and simulation chain:

- V0: compression field.
- V1–V2: causal swarms and orthogonal phases.
- V3–V4: minimum-spanning and nearest-neighbour networks.
- V5: manifold membranes and boundaries.
- V6–V7: simulated transport and chain meta-optimisation.
- V8: Riemann/prime exploratory visualization.
- V9–V10: lattice and mesh.
- V11: hardware and board models.
- V12: house, environment and ventilation.
- V13: elements, isotopes, composites and topology export.

The full original implementation is still under `src/simulations/` and
`src/App.tsx`. By default the homepage now opens the **Simulation**
viewport, with the engine running rather than showing a new dashboard.
The original CSS baseline was restored.

**Runtime:** Cloudflare Pages is static. The original Three.js
V0–V13 visuals compute in-browser. The V12 physical solvers have been
reconnected through a dedicated local Web Worker, preserving the original
`/api/house/*` frontend calls; engine states and history save in this
browser. Server-only synthetic autonomous status and any unported routes
may still be unavailable. No code claims a missing server result is a
successful calculation, experimental measurement or certified design.

## Latest incremental work on the original Sims

- **V7 now really tests upstream configuration changes.** Its coordinate
  search changes one V1/V2/V3/V4 parameter at a time, waits for recomputed
  V6 flow observations, retains a modeled improvement and rolls back a
  degraded response before trying the next parameter. Accepted/rejected
  counts and bounded parameters are preserved in V7 saved state. This is
  simulation feedback, not controlled hardware validation.
- **V9/V13 material estimates no longer get overwritten with fabricated
  properties derived from V7 score.** Material constitutive values must
  originate from the materials pipeline rather than a generic optimizer
  novelty number.
- **Original Save/Load Simulation State and Workspace history work without
  Express.** The original `memoryFetch` route uses actual device-local
  storage for `/api/sim-state/:version`, `/api/workspace` and workspace
  event checkpointing. Storage failures are returned as errors rather than
  claimed successes. Saved states remain isolated to this browser workspace.
- **Duplicate-state checking is local**, bounded and explicitly only
  identifies previously seen signatures; it does not establish a new physical
  invention or material. An unavailable check no longer increments a random
  complexity counter.

Existing graphical tabs, 3D engines, simulation chain and human-accessible
controls are unchanged. Some legacy server-only house endpoints remain
unavailable on static Pages; port them individually if needed rather than
replacing the original user interface.

Regression coverage: `npm run test:v7-feedback` and
`npm run test:sim-checkpoint`, included in `npm run test:all`.

## V8–V13 stage continuity and cross-simulator retained learning

The original homepage's automatic **Simulation** tour was not listing the
engines that existed between V7 and V13. The original four goal chains
stopped at V7 (except a special math path), and the version buttons exposed
V0–V8 plus a separate Elements shortcut. V9/V10/V11 geometry was formerly
drawn as overlays while viewing V1–V7, and the live V12 floorplan/heatmap
was explicitly hidden from the shared canvas.

That is repaired **without replacing the original simulator**:

- The sequencer now visits **V0 → V1 → … → V7 → V8 → V9 → V10 →
  V11 → V12 → V13 → V0** for all four optimization goals.
- The existing V8 spectral model, V9 lattice, V10 mesh, V11 hardware,
  and actual V12 thermal house engine each have a named, selectable,
  separately visible stage in the existing Three.js viewport.
- V12 automatically frames its larger floorplan in the original camera and
  receives full 30 Hz simulation updates while selected (the original
  V12 stability flag required more than 100 update calls).
- V13 shows a **schematic** electron-shell ring diagram derived from its
  actual active element. Carbon is a reproducible initial element; these
  rings are a pedagogical visualization, not measured electron trajectories.
  The full existing Elements view remains available using its shortcut.
- Auto-transition requires both actual engine readiness and **at least
  150 numerical frames** per stage (around five seconds at 30 Hz), so
  already-initialized 3D engines no longer flash past invisibly.
- Saved eight-stage navigator positions are migrated using their explicit
  engine version rather than the obsolete index.

**V6/V7/V13 experience memory** is also live: when V7 actually accepts a
modeled parameter trial, its numeric V6 flow conditions, best tuning
parameters, V13 typed temperature requirement and any material screens are
stored together in a bounded, device-only ledger (`sim_feedback_archive.ts`).
The archive keeps at most 32 evidence records, isolated by optimizer,
thermal mode, compression level, upstream material fingerprint and membrane
loop count. On a matching later run, V7 compares actual new flow conditions
and tests **one** remembered upstream setting, then accepts or rolls it
back using fresh V6 readings. Historical V13 requirements are clearly
labelled as *historical*, and live V6 always supplies the new condition.
No remembered score is treated as a measured result or a validated isotope.

This remains a **model-only research simulation**, not experimental proof.
The archive is local to the same browser; closing the page stops computation.

Regression gates:
`npm run test:full-sim-sequence` checks 14-stage order, dwell logic,
actual named engine stage routing, same-context memory, cross-context
rejection, and rejection of a formerly winning setting when new V6 metrics
are worse. This runs with `npm run test:all`.

## Current production: physics in the original simulator

The full original `src/App.tsx` and visual V0–V13 simulation chain remain the
**only homepage**. These are additional working connections, not another UI.

### Real V12 browser-local calculations

`src/lib/house_compute.ts` dispatches the same deterministic first-party
numeric solvers imported by the former Express server. Their original
`/api/house/` calls now execute in `src/lib/house_compute.worker.ts`,
via the bounded worker transport `src/lib/browser_house_compute.ts`:

- Site + solar geometry optimisation (including geometric feasibility gates).
- Geometry-preserving site → coupled mechanical/airflow screens. All proposed
  geometry is re-evaluated against the same site conditions; submitted scores
  or fake compliance flags cannot qualify a design.
- Whole-house systems and equivalent-service archetype comparisons.
- Room lifecycle, HVAC cycling, wall/membrane and existing-home retrofit.
- Building-physics validation and site context. Bundled OpenStreetMap-derived
  footprints are used for **exactly matching** snapshots available in
  `site-context-cache/`. Missing places are reported as lower-confidence
  engine-only geometry, not fake observed neighbouring buildings.

**Site evidence limitation:** the static browser does not have the operator's
independently validated hourly EPW weather files. Client-injected claims of
station provenance and weather arrays are therefore discarded; site and
whole-house results use explicitly labelled preset degree-day climates.
A model output is not a building permit, field measurement or code approval.

### V12 experiment memory (no interface redesign)

The original House & Blueprint site optimiser now retains a **bounded portfolio
of genuine numeric simulation candidates** in the current browser:

- Every site run stores up to 12 feasible, better-than-reference geometry
  configurations, with modeled lifecycle-energy evidence and source seed.
  A maximum of 3 different candidates are kept per house form, and at most
  8 benchmark contexts are retained on the device.
- Its next run automatically warm-starts from the matching previous geometries
  before performing the usual seeded exploration and refinement.
- The benchmark fingerprint includes exact location/climate, required energy
  inputs, envelope, floor area, hazard constraints, site dimensions, indoor
  setpoint, lifecycle duration and baseline, but not irrelevant random seeds,
  experiment budget or the human-readable location label.
- Old winners from a different benchmark **cannot compete**. Even matching
  geometries are structurally validated and fully re-evaluated under the
  current hard feasibility gates; historical scores are *not* injected into
  the solver.
- The existing V12 → coupled airflow screen sees the resulting shortlisted
  forms, making them available to the next original simulation automatically.
- The existing House interface displays how many prior genomes were
  re-evaluated and how many remain saved. No new dashboard or manual knobs.

Run `npm run test:v12-memory` for benchmark isolation, forged-provenance
rejection, actual re-screening and bounded persistence, or `npm run test:all`
for the full legacy and physics suite.

This is **local evidence of candidate performance in a mathematical model**,
not proof that a constructed building will achieve that performance. Closing
the tab stops calculations. Clearing this browser's site data deletes memory.

### Real V6 → V13 requirements

V6 transmits its actual computed thermal-field operating range to V13 as
a **typed machine-generated thermal-survival requirement**. V13 displays
the range and screens a built composite's **estimated** melting point.
A screening pass is explicitly provisional; measured phase/transport,
chemical compatibility and temperature-dependent constitutive data are
still required.

V7's performance score, a suggested topology, or the passage of animation
frames **cannot mutate material density, conductivity or melting point**.
Uncalibrated input produces a recorded, bounded observation, not new matter
or an experimentally verified material.

Regressions:
`npm run test:browser-house` exercises the original full numerical
calculations and rejects forged climate/shadow evidence;
`npm run test:v13-needs` tests the V6-to-V13 handoff and blocks
unverified material mutation. Both are part of `npm run test:all`.

## Archived local workbench history (not homepage)

# AboveBound — self-directed discovery on your own computer

**Live:** [abovebound.org](https://abovebound.org)
**Entrypoint:** `src/local/LocalApp.tsx`, the existing connected simulator.
The temporary generic dashboard (`TechApp.tsx`) is no longer the homepage.
No existing simulation source has been deleted.

## How it behaves now

The website starts a bounded **zero-configuration discovery cycle** by itself.
The human does not select a subject, name the optimisation objective or enter
hundreds of parameters. `src/local/AutonomousDiscovery.tsx` runs the existing
`compute.worker.ts` sequentially using plans from `src/local/autonomy.ts`.
Each run is recorded locally, and a result is shown in its existing domain view.

The planner automatically:

- Defines **reference engineering tasks** from functionality: a thermally
  habitable 130 m² building, mismatch-prone passive RF links, thermal material
  needs under explicit physical environments, and FDM part fabrication.
- Selects the optimization rule implied by each domain's physics and physical
  constraints: minimum lifecycle energy; delivered power and passivity; known
  phase/heat conduction constraints; feasible mass and modeled cost.
- Samples new building layout seeds, preserving the best feasible result
  **only within the same benchmark**. Candidate source/load and temperature
  scenarios remain separate benchmarks, never compared as though equivalent.
- Passes previous saved typed discoveries and unmet material needs into the
  next domain worker. In particular, a building's `membrane_need` can trigger
  a membrane/materials context check. The cross-domain check can return
  `unsupported` and does not pretend to be a new element or validated alloy.
- Runs seven bounded experiments on each visit (two building, two RF, two
  material and one printable part). Runs pause when the browser tab is hidden,
  stop on Pause, and resume from the saved index. Each worker has a timeout.
  Clicking Continue performs another bounded cycle without additional input.
- Stores the lightweight experiment evidence ledger on-device, separately
  from existing result memory and building campaign data.

An optional **Advanced** disclosure retains all original direct experiment
controls, including EPW weather uploads and observed chemistry-yield CSVs.
It is not necessary for automatic screening.

### What autonomous discovery cannot conjure

Physics identifies impossible or wasteful configurations, but does not supply
unknown environmental requirements or experimental material properties.
The first reference problems are **examples**, not inferences about a real
customer's home, machine or reaction. A chemical yield cannot be learned
from hypothetical pathway weights: the autonomous chemistry task is
deliberately blocked pending independent observed yields. Other results are
limited to the actual model assumptions. No claim is made of discovering a
new element, engineered isotope, functional catalyst, finished motherboard,
or human flight hardware. A valid unmeasured candidate is not a certified
invention.

This is **browser-local calculation, not a background service**: closing the
page stops all computing. Supabase remains optional for private backup after
owner-scoped project setup; no cloud workers or AWS machines are required.

## Closed-loop learning added after the first prototype

The autonomous planner now consumes an evidence ledger and a **causal dependency
graph**, rather than cycling the same static test order:

- Building results generate typed material-property requests through the
  worker output. The next calculation inherits the precise physical
  environment and screens the catalogue under it.
- A material-screen failure becomes a persistent, deduplicated **blocked
  research dependency**, not another identical catalogue search. It names the
  missing constitutive measurements and does not invent them.
- RF, materials and printable-part benchmark contexts are not silently
  rerun with identical inputs. The planner instead selects a novel context;
  when the bounded catalogue is exhausted, it concentrates on the building
  geometry search where a new random seed really produces different geometry.
- Every follow-up references the originating experiment index, and completed
  dependencies retain the outcome. The dependency display explicitly
  differentiates **awaiting engine check**, **conditionally screened**, and
  **blocked for physical evidence**.
- The building campaign now persists the **full winning
  `SiteHouseDesign` genome**. On the next same-key run the worker validates,
  re-evaluates and potentially mutates it alongside new random designs.
  This uses the already present `learnedDesigns` API in the original site
  optimiser and preserves the lowest-energy feasible incumbent. A
  different location, indoor temperature, building area or EPW file may
  not inherit that design.
- Comparative improvement is only emitted when an eligible run improves
  the prior best **under the same benchmark**; hypothetical materials and
  unvalidated predictions never enter that engineering leaderboard.

These are actual solver changes, not UI simulations. They still operate
inside the limited physics and benchmark envelopes implemented in source.
The graph does not yet propose a genuinely novel material synthesis route,
a finished mechanical component, or experimentally validated utility.

Coverage includes `scripts/discovery-graph-smoke.ts` and
`scripts/engineering-warmstart-smoke.ts`, both required by CI.

## Previous engineering utilities

The E12 RF model, nominal SPICE export and sourcing worksheet from the
temporary layout remain in `src/local/impedance.ts` and `rf_spice.ts`.
The prior technical layout remains in source for reference only.

## Ongoing optimisation & evidence-led interface

The default screen now prioritises **actual computed outcomes** instead of a static
cross-domain drawing. The conceptual overlay is still available in an optional
disclosure, and the earlier V0–V13 source remains in the repository.

- **Persistent building campaigns:** with the same location, area, balance
  temperature and exact EPW file, the browser retains the lowest modeled
  lifecycle-energy *feasible* candidate and its generated footprint. New seeds
  cannot overwrite the incumbent with a worse or ineligible result. Tests
  reject comparisons across mismatched input signatures. Per-seed trial counts,
  footprint and mechanical-screen counts, a trend and the real ranked finalists
  are shown; runs can be repeated in deliberate batches of 5 or 25. The tab
  pauses between trials when hidden, and each trial can be cancelled.
- **Real building geometry:** an isometric projection extrudes the actual
  candidate footprint for visual inspection; height is arbitrary and clearly
  labelled. It is not a surveyed 3D CAD building, structural analysis, or
  a verified solar/shadow model. Nearby station EPW improves the temperature
  inputs but does not replace hourly heat transfer or empirical calibration.
- **Circuit confidence:** nominal frequency response is plotted from the
  circuit equations at 21 frequencies. A finalist screen samples independent
  ±5% L/C value deviations over five band frequencies, and rejects nominally
  attractive networks whose sampled worst case fails to beat the unmatched
  resistive reference. This is a sensitivity test, not a measured tolerance
  distribution, IBIS, S-parameters, signal integrity or circuit-board design.
- **Chemistry honesty:** absolute desired/undesired outcomes and discarded
  feed are shown on a common original-input scale, so high *conditional*
  selectivity cannot masquerade as increased yield.
- **Fabrication realism:** the printable decorative STL can be inspected
  interactively in 3D using the **actual exported mesh**, not the illustrated
  full-body science-fiction outfit. Viewer loads only on user request,
  releases GPU resources when closed and avoids continuous animation.
- **Shared research board:** shows the last local run in each domain,
  cross-domain probe counts, and honest evidence gaps. One-click follow-ups
  run the corresponding browser worker; simulations don't continue when the
  browser is closed and findings are never labelled measurements by default.

For tests run `npm run test:all`, including `test:campaign` for comparable
inputs and feasible-best logic. Cloud backup remains optional and independent
of simulation. Legacy AWS saved results still require a separate export.

## How it works now

- All computation runs in the user's browser, in a Web Worker that is
  terminated/restarted for each new design. **No AWS, Docker, Express,
  WebSocket server, external AI or remote computation is required.**
- The normal building run automatically samples hundreds of geometry
  candidates, re-evaluates the promising site/room/HVAC alternatives
  under the same location, annual weather and balance temperature, and
  reports tested coverage. Constraints gate the recommendation.
- **Explore a different building** uses a reproducible deterministic seed.
  A local EPW weather file (max 5 MB, ≤75 km from chosen preset) can be
  read by the user's device; it is never uploaded. Without EPW, an
  approximate climate preset is used and labelled.
- RF demonstration sweeps E12 two-element passive L matches with Ohms,
  Henries, Farads and frequency; checks delivered power against available
  source power. Component Q is estimated. This **does not validate DDR,
  high-speed motherboard signal integrity, PCB traces or VNA results.**
- Chemistry demonstration enumerates hypothetical probability gates and
  separately reports **conditional selectivity** and **absolute target
  output per original input**. Discarding unfavorable routes without
  changing branching kinetics cannot automatically increase chemical
  yield. This is **not quantum chemical reaction modeling**.
- One-page UI intentionally has no simulation tabs or parameter maze.
  Technical details and history are behind collapsible disclosures.

## Single-screen visual laboratory + machine-printable components

The home screen now includes a unified SVG field linking **building,
chemistry, membranes, circuits, and Iron Man-inspired costume design**.
Every domain has a clickable node, contextual physical constraints and
a shared discovery indicator; scenes are intentionally **schematic**,
not a rendered CFD, electromagnetic or quantum result. No additional
tabs are required. The fabrication case draws an artistic full-body
sci-fi suit, with the printed part's actual scope carefully separated.

The new suit design goal automatically sweeps **126** combinations
(PLA/PETG/TPU × frame thickness × frame rim), minimizes modeled
production cost **only after** filtering by 3D printer bed size,
user budget, ambient temperature and a required geometric frame-section
index. Its result shows gram/material savings versus a solid plaque,
assumed AUD cost and a cost-vs-section cloud on the same visual display.

If a candidate passes, **Download STL** exports a closed, watertight
triangulated decorative frame in millimetres for a home FDM slicer.
This is a single cosmetic costume component, not a wearable structural
system; the user must check slicing, nozzle/material compatibility and
physical fit. No automatically validated filament strength is inferred.

**Flight status is always unqualified/false.** No real Iron Man flight,
propulsion, exoskeleton load or human safety capacity is established
by local costume printing. Real flight demands fundamentally
independent evidence, tests and safety engineering.

See [Printable/Overlay Constraints](docs/PRINTABLE_CONSTRAINT_OVERLAY.md)
and run `npm run test:fabrication`, which tests closed STL mesh,
printer-bed/budget/temperature rejection, repeatability and a
non-flying output.

## Shared discoveries and entropy-based chemistry

Every local Worker task produces typed **discoveries** with provenance,
units and an operating environment. Previous findings are reused on the
next run: membrane needs can trigger a new chemistry/material screen;
chemistry can propose an isotope/material hypothesis; building and
electronics can test it under their own constraints. Unverified or
physically incompatible properties NEVER enter another simulation as
trusted constants. A bounded environmental sweep compares air, water,
room-temperature vacuum and 5000 K vacuum; unknowns remain unknown.

Chemistry calibration now checks source labels, optional
`batch_id`/`protocol_id`, zero/blank yield handling, train-versus-batch
separation and target + side-product holdout errors. Condition-split fits
without distinct batches or an identified unchanged protocol are **not
reused** as new discovery evidence. A numerical fit never proves a
hypothetical catalyst or new isotope can exist.

A new membrane goal asks what material can carry, block or channel heat
in a specified medium, T, pressure and flow regime. High-temperature
phase failure and missing properties produce a clear "no supported
material" result, not a fictional material or engineering approval.

The chemistry goal can import real **observed target + side yield**
CSV records and calibrate an effective competing first-order
temperature-dependent rate model, with a deterministic condition-grouped
train/holdout split. It displays **holdout MAE versus the training-mean
baseline**. Without measured records, no calibrated yield claim is made.
Hypothetical entropy/barrier changes are not verified catalysts.

See [Calibration & Cross-Simulation Protocol](docs/ENTROPY_DISCOVERY_CALIBRATION.md).
Run `npm run test:discoveries`.

## Device memory + optional Supabase

Latest 32 results stay on your device; download full JSON any time.
For cloud backups the user can optionally supply a Supabase project URL
and PUBLIC publishable key in Memory → Cloud backup. Anonymous GoTrue
authentication then provides a JWT; `supabase/migrations/20261011000000_ab_computation_memory.sql`
defines a protected owner-only `public.ab_computation_memory` table.
Only compact summary records are uploaded, never full EPW/hourly arrays.

**Supabase project selection isn't complete.** The connected accounts have
projects named `Bb5` and `hexfield`, but neither has been confirmed as
AboveBound's cloud memory database. **No existing database was changed.**
Apply the migration ONLY to the intended project, enable anonymous sign-in,
configure CORS/security and verify cross-user RLS before relying on backup.
Anonymous cloud accounts cannot restore themselves from a new device.
Offline device-local use does not require a cloud connection.

## Run locally

```sh
npm ci
npm run dev
```

Open the locally displayed Vite URL. For static HTTPS hosting:

```sh
npm run test:all
npm run build
```

Upload the contents of `dist/` to a static host such as Cloudflare Pages.
The Worker bundle is part of the assets. There is no Node backend on the
runtime host. See `DEPLOY_INSTRUCTIONS.md` for a safe cutover plan.

**Production deployment:** Cloudflare Pages project `abovebound` is linked
to this GitHub repository's `main` branch. Its static Vite build was
successfully deployed to `https://abovebound.pages.dev`. DNS for
`abovebound.org` and `www.abovebound.org` was updated to point at
Pages on 2026-10-11 (Melbourne time); hostname certificate validation may
still be pending immediately after the change. This does **not** stop the
old AWS server or migrate its `discovery_memory.json`. Back up the old
volume and retire AWS resources separately, after confirming all saved
legacy data has been recovered. The old Tunnel DNS target was
`07e7a1e0-a9f8-44d9-92e0-3b36dccf44ae.cfargotunnel.com`.

## Source and engineering boundaries

- `src/main.tsx` → `src/local/LocalApp.tsx`: static UI.
- `src/local/compute.worker.ts`: all device-only search. Main UI does
  not call the old `/api` or `/ws` endpoints.
- `src/local/impedance.ts`: bounded complex passive RF power screening.
- `src/local/selectivity.ts`: probabilistic pathway exclusion / throughput.
- `src/local/memory.ts`: browser memory + optional authenticated Supabase.
- `src/lib/site_geometry_optimizer.ts`,
  `src/lib/site_whole_house_coupling.ts`: building search, still
  a **screening** model with synthetic room topology and unsourced embodied
  coefficients; no certified building energy rating or structural check.
- `docs/SIMULATION_AUDIT.md`: V0–V13 mathematical/engineering audit with
  the specific evidence limitations and invariants.
- `src/App.tsx`, `server.ts`: retired research/legacy API source,
  deliberately **not imported into the static production app**. Preserve
  only for historical data export and backcompat tests until cutover.

`npm run test:all` runs legacy smoke (not model validation), building
physics checks, device RF conservation and categorical yield invariants,
and a production static bundle check. Scientific assumptions remain
simplified and should be treated as hypotheses until independently
benchmarked against hardware measurements or chemical experiments.

## Laptop / desktop automated experiments (no backend)

With Node installed on **your computer**, run:

```sh
npm run explore:local -- --goal building --preset melbourne --area 130 --count 4
npm run explore:local -- --goal circuits --frequency 100 --source 50 --load 100
npm run explore:local -- --goal chemistry --min-accept 0.5
```

Building mode automatically evaluates multiple reproducible seeds and writes
the lowest-energy passing design among the sampled options to a timestamped
JSON report inside `runs/` on **your computer**. It does not call an
external API. Maximum 8 seed runs per invocation prevents runaway searches.

This is a bounded experimental design generator, **not** an unrestricted
self-modifying code agent. A browser cannot freely write files or alter the
machine; local CLI file writes are explicit and confined to `runs/`.
If later implementing autonomous source edits, require local sandboxing,
visible diffs, tests and explicit write approval.
